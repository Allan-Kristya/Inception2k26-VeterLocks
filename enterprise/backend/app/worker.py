from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
import time
from datetime import datetime, timezone

import httpx
from sqlalchemy import text

from .db import SessionLocal, engine, set_rls_context
from .security import decrypt_webhook_secret, webhook_url_is_allowed

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
log = logging.getLogger("laporaman.enterprise.worker")


def utcnow():
    return datetime.now(timezone.utc)


def run_sla_cycle() -> int:
    """Per-tenant scheduler. SKIP LOCKED avoids duplicate work across replicas."""
    changed = 0
    db = SessionLocal()
    try:
        tenants = db.execute(text("SELECT id FROM tenants WHERE active=true ORDER BY id")).scalars().all()
        for tenant in tenants:
            set_rls_context(db, tenant=tenant, opd="*", role="system_worker")
            rows = db.execute(
                text("""
                    SELECT id, ticket_id, tenant_id, opd_id, status
                    FROM reports
                    WHERE status <> 'Selesai' AND escalated=false AND sla_due_at < now()
                    ORDER BY sla_due_at
                    LIMIT 100
                    FOR UPDATE SKIP LOCKED
                """)
            ).mappings().all()
            for row in rows:
                db.execute(
                    text("UPDATE reports SET escalated=true, updated_at=now() WHERE id=:id"),
                    {"id": row["id"]},
                )
                db.execute(
                    text("""
                        INSERT INTO audit_trails
                          (tenant_id, report_id, opd_id, event_type, actor_role, metadata)
                        VALUES (:tenant, :report, :opd, 'sla.breached', 'system_worker',
                                CAST(:metadata AS jsonb))
                    """),
                    {"tenant": tenant, "report": row["id"], "opd": row["opd_id"],
                     "metadata": json.dumps({"status": row["status"], "escalated": True})},
                )
                payload = {
                    "event": "sla.breached", "ticket_id": row["ticket_id"],
                    "tenant_id": tenant, "status": row["status"], "escalated": True,
                }
                db.execute(
                    text("INSERT INTO outbox_events(tenant_id,event_type,payload) VALUES (:tenant,'sla.breached',CAST(:payload AS jsonb))"),
                    {"tenant": tenant, "payload": json.dumps(payload)},
                )
                changed += 1
            db.commit()
        return changed
    except Exception:
        db.rollback()
        log.exception("SLA cycle failed")
        return changed
    finally:
        db.close()


def dispatch_outbox(limit_per_tenant: int = 50) -> int:
    sent = 0
    db = SessionLocal()
    try:
        tenants = db.execute(text("SELECT id FROM tenants WHERE active=true ORDER BY id")).scalars().all()
        with httpx.Client(timeout=8.0, follow_redirects=False) as client:
            for tenant in tenants:
                set_rls_context(db, tenant=tenant, opd="*", role="system_worker")
                events = db.execute(
                    text("""
                        SELECT id, event_type, payload, attempts
                        FROM outbox_events
                        WHERE delivered_at IS NULL AND next_attempt_at <= now()
                        ORDER BY created_at
                        LIMIT :limit
                        FOR UPDATE SKIP LOCKED
                    """),
                    {"limit": limit_per_tenant},
                ).mappings().all()
                hooks = db.execute(
                    text("SELECT id, url, secret_ciphertext, events FROM webhook_subscriptions WHERE enabled=true")
                ).mappings().all()
                for event in events:
                    matching = [h for h in hooks if event["event_type"] in h["events"]]
                    failed = False
                    for hook in matching:
                        # Allowlist + public DNS validation is defense in depth. Production
                        # must additionally enforce egress firewall/proxy destination rules.
                        if not webhook_url_is_allowed(hook["url"]):
                            failed = True
                            log.warning("Blocked webhook destination host=%s", hook["url"].split('/')[2])
                            continue
                        try:
                            secret = decrypt_webhook_secret(bytes(hook["secret_ciphertext"]))
                            body_obj = dict(event["payload"])
                            body_obj["event_id"] = str(event["id"])
                            body = json.dumps(body_obj, separators=(",", ":"), ensure_ascii=False).encode()
                            digest = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
                            response = client.post(
                                hook["url"], content=body,
                                headers={
                                    "Content-Type": "application/json",
                                    "X-LaporAman-Event": event["event_type"],
                                    "X-LaporAman-Event-ID": str(event["id"]),
                                    "X-LaporAman-Signature": f"sha256={digest}",
                                },
                            )
                            response.raise_for_status()
                            sent += 1
                        except Exception as exc:
                            failed = True
                            log.warning("Webhook delivery failed event=%s type=%s", event["id"], type(exc).__name__)
                    if not matching or not failed:
                        db.execute(
                            text("UPDATE outbox_events SET delivered_at=now(), last_error=NULL WHERE id=:id"),
                            {"id": event["id"]},
                        )
                    else:
                        attempts = int(event["attempts"]) + 1
                        backoff = min(3600, 2 ** min(attempts, 10))
                        db.execute(
                            text("""
                                UPDATE outbox_events
                                SET attempts=:attempts, next_attempt_at=now() + (:backoff * interval '1 second'),
                                    last_error='Delivery failed or blocked; see worker log'
                                WHERE id=:id
                            """),
                            {"attempts": attempts, "backoff": backoff, "id": event["id"]},
                        )
                db.commit()
        return sent
    except Exception:
        db.rollback()
        log.exception("Outbox dispatcher failed")
        return sent
    finally:
        db.close()


def main() -> None:
    log.info("LaporAman worker started; database=%s", engine.url.drivername)
    while True:
        breached = run_sla_cycle()
        sent = dispatch_outbox()
        if breached or sent:
            log.info("worker cycle: breached=%d webhook_deliveries=%d", breached, sent)
        time.sleep(float(os.getenv("WORKER_INTERVAL_SECONDS", "15")))


if __name__ == "__main__":
    main()
