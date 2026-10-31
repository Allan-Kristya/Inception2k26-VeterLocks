from __future__ import annotations

import base64
import json
import logging
import os
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Annotated

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import Depends, FastAPI, Header, HTTPException, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session

from .db import engine, get_db, set_rls_context
from .schemas import (
    EncryptedReportIn,
    LoginRequest,
    RecipientKeyIn,
    RouteReportIn,
    StatusUpdateIn,
    WebhookIn,
)
from .security import (
    JWT_TTL_MINUTES,
    create_access_token,
    decode_access_token,
    encrypt_webhook_secret,
    verify_password,
    webhook_url_is_allowed,
)

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
log = logging.getLogger("laporaman.enterprise.api")
Db = Annotated[Session, Depends(get_db)]
STATUSES = ["Diterima", "Terverifikasi", "Diproses", "Selesai"]


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def ticket_number() -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    suffix = "".join(secrets.choice(alphabet) for _ in range(10))
    return f"LA-{datetime.now(timezone.utc):%Y}-{secrets.randbelow(9000) + 1000:04d}-{suffix}"


def audit(db: Session, *, tenant: str, report_id: str | None, opd: str | None,
          event: str, role: str, actor_id: str | None, metadata: dict) -> None:
    db.execute(
        text("""
            INSERT INTO audit_trails
                (tenant_id, report_id, opd_id, event_type, actor_id, actor_role, metadata)
            VALUES (:tenant, :report_id, :opd, :event, :actor_id, :role, CAST(:metadata AS jsonb))
        """),
        {"tenant": tenant, "report_id": report_id, "opd": opd,
         "event": event, "actor_id": actor_id, "role": role,
         "metadata": json.dumps(metadata, separators=(",", ":"))},
    )


def enqueue_event(db: Session, tenant: str, event_type: str, payload: dict) -> None:
    db.execute(
        text("""
            INSERT INTO outbox_events(tenant_id, event_type, payload)
            VALUES (:tenant, :event, CAST(:payload AS jsonb))
        """),
        {"tenant": tenant, "event": event_type,
         "payload": json.dumps(payload, separators=(",", ":"))},
    )


app = FastAPI(
    title="LaporAman Enterprise API",
    version="2.0.0",
    description=(
        "Multi-tenant reporting API. Reports are accepted as AES-256-GCM ciphertext only; "
        "tenant/agency access is additionally enforced by PostgreSQL RLS."
    ),
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)
app.openapi_version = "3.1.0"

allowed_origins = [x.strip() for x in os.getenv("CORS_ORIGINS", "").split(",") if x.strip()]
if allowed_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
    )


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response: Response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault("Cache-Control", "no-store")
    response.headers.setdefault("Cross-Origin-Resource-Policy", "same-origin")
    return response


def require_user(
    authorization: Annotated[str | None, Header()] = None,
    db: Session = Depends(get_db),
) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Bearer token diperlukan")
    claims = decode_access_token(authorization[7:])
    if not claims:
        raise HTTPException(status_code=401, detail="JWT tidak valid atau kedaluwarsa")
    # The access-token path is stateless: no per-request staff table lookup.
    # Use short TTL; immediate revocation requires a deny-list/introspection service.
    if claims.get("role") not in {"operator", "tenant_admin", "triage"}:
        raise HTTPException(status_code=403, detail="Role JWT tidak diizinkan")
    if not claims.get("sub") or not claims.get("wilayah_id") or not claims.get("opd_id"):
        raise HTTPException(status_code=401, detail="Klaim tenant JWT tidak lengkap")
    set_rls_context(
        db,
        tenant=claims["wilayah_id"],
        opd=claims["opd_id"],
        role=claims["role"],
    )
    return claims

CurrentUser = Annotated[dict, Depends(require_user)]


@app.get("/api/health", tags=["system"])
def health():
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))
    return {"status": "ok", "service": "laporaman-enterprise-api", "openapi": "3.1.0"}


@app.get("/.well-known/jwks.json", include_in_schema=False)
def jwks():
    path = os.getenv("JWKS_PATH", "/run/jwt/jwks.json")
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return json.load(handle)
    except OSError as exc:
        raise HTTPException(status_code=503, detail="JWKS belum tersedia") from exc


@app.post("/api/v2/auth/token", tags=["authentication"])
def issue_token(payload: LoginRequest, db: Db):
    set_rls_context(db, auth_lookup=True)
    row = db.execute(
        text("""
            SELECT id, email, display_name, password_hash, tenant_id,
                   COALESCE(opd_id, '*') AS opd_id, role, active, token_version
            FROM staff_users WHERE lower(email) = lower(:email)
        """),
        {"email": payload.email},
    ).mappings().first()
    if not row or not row["active"] or not verify_password(payload.password, row["password_hash"]):
        raise HTTPException(status_code=401, detail="Email atau kata sandi tidak cocok")
    token = create_access_token(dict(row))
    return {
        "access_token": token,
        "token_type": "bearer",
        "expires_in": JWT_TTL_MINUTES * 60,
        "claims": {"sub": str(row["id"]), "wilayah_id": row["tenant_id"],
                   "opd_id": row["opd_id"], "role": row["role"]},
    }


@app.get("/api/v2/auth/me", tags=["authentication"])
def me(user: CurrentUser):
    return {"sub": user["sub"], "wilayah_id": user["wilayah_id"],
            "opd_id": user["opd_id"], "role": user["role"]}


@app.get("/api/v2/public/tenants/{tenant_id}/reports/{ticket_id}", tags=["public tracking"])
def track_public_report(tenant_id: str, ticket_id: str, db: Db):
    tenant = db.execute(
        text("SELECT id FROM tenants WHERE id=:tenant AND active=true"), {"tenant": tenant_id}
    ).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tiket tidak ditemukan")
    set_rls_context(db, tenant=tenant_id, role="public_tracker", ticket=ticket_id)
    row = db.execute(
        text("""
            SELECT ticket_id,status,opd_id,created_at,updated_at,sla_due_at,escalated
            FROM reports WHERE tenant_id=:tenant AND ticket_id=:ticket
        """), {"tenant": tenant_id, "ticket": ticket_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Tiket tidak ditemukan")
    return {
        "ticket_id": row["ticket_id"], "status": row["status"],
        "opd_id": row["opd_id"], "created_at": row["created_at"].isoformat(),
        "updated_at": row["updated_at"].isoformat(),
        "sla_due_at": row["sla_due_at"].isoformat(), "escalated": row["escalated"],
    }


@app.get("/api/v2/public/tenants/{tenant_id}/recipient-keys", tags=["key management"])
def public_recipient_keys(tenant_id: str, db: Db):
    tenant = db.execute(text("SELECT id FROM tenants WHERE id=:tenant AND active=true"),
                        {"tenant": tenant_id}).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant tidak ditemukan")
    set_rls_context(db, tenant=tenant_id, role="public_intake", intake_tenant=tenant_id)
    rows = db.execute(
        text("""
            SELECT id, recipient_id, key_version, public_key_spki
            FROM recipient_keys WHERE tenant_id=:tenant AND active=true
            ORDER BY recipient_id, key_version DESC
        """), {"tenant": tenant_id}
    ).mappings().all()
    return [{"id": str(r["id"]), "recipient_id": r["recipient_id"],
             "key_version": r["key_version"],
             "public_key_spki": base64.b64encode(r["public_key_spki"]).decode("ascii")}
            for r in rows]


@app.post("/api/v2/admin/recipient-keys/{recipient_id}", status_code=201, tags=["key management"])
def enroll_recipient_key(recipient_id: str, payload: RecipientKeyIn,
                         user: CurrentUser, db: Db):
    if user["role"] != "tenant_admin":
        raise HTTPException(status_code=403, detail="Hanya tenant_admin dapat mendaftarkan public key")
    if recipient_id != "triage":
        agency = db.execute(
            text("SELECT id FROM agencies WHERE tenant_id=:tenant AND id=:opd AND active=true"),
            {"tenant": user["wilayah_id"], "opd": recipient_id},
        ).first()
        if not agency:
            raise HTTPException(status_code=404, detail="OPD tidak terdaftar di tenant")
    raw_key = base64.b64decode(payload.public_key_spki, validate=True)
    try:
        public_key = serialization.load_der_public_key(raw_key)
    except (ValueError, TypeError) as exc:
        raise HTTPException(status_code=422, detail="Kunci publik harus DER SubjectPublicKeyInfo") from exc
    if not isinstance(public_key, rsa.RSAPublicKey) or public_key.key_size not in (3072, 4096):
        raise HTTPException(status_code=422, detail="Gunakan RSA 3072 atau RSA 4096 bit untuk RSA-OAEP")

    latest = db.execute(
        text("SELECT COALESCE(MAX(key_version), 0) FROM recipient_keys WHERE tenant_id=:tenant AND recipient_id=:recipient"),
        {"tenant": user["wilayah_id"], "recipient": recipient_id},
    ).scalar_one()
    db.execute(
        text("UPDATE recipient_keys SET active=false WHERE tenant_id=:tenant AND recipient_id=:recipient AND active=true"),
        {"tenant": user["wilayah_id"], "recipient": recipient_id},
    )
    key_id = str(uuid.uuid4())
    version = int(latest) + 1
    db.execute(
        text("""
            INSERT INTO recipient_keys(id,tenant_id,recipient_id,key_version,public_key_spki,active)
            VALUES (:id,:tenant,:recipient,:version,:key,true)
        """),
        {"id": key_id, "tenant": user["wilayah_id"], "recipient": recipient_id,
         "version": version, "key": raw_key},
    )
    audit(db, tenant=user["wilayah_id"], report_id=None, opd=None,
          event="recipient_key.rotated", role=user["role"], actor_id=user["sub"],
          metadata={"recipient_id": recipient_id, "key_version": version, "key_id": key_id})
    db.commit()
    return {"id": key_id, "recipient_id": recipient_id, "key_version": version, "active": True}


@app.post("/api/v2/reports", status_code=status.HTTP_201_CREATED, tags=["reports"])
def create_report(payload: EncryptedReportIn, db: Db):
    # Strict schema rejects plaintext, passphrase, private_key and all unrecognised fields.
    tenant = db.execute(
        text("SELECT id FROM tenants WHERE id=:tenant AND active=true"),
        {"tenant": payload.tenant_id},
    ).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant/wilayah tidak ditemukan")
    set_rls_context(db, tenant=payload.tenant_id, opd="", role="public_intake",
                    intake_tenant=payload.tenant_id)

    key_ids = list(payload.wrapped_deks.keys())
    key_rows = db.execute(
        text("""
            SELECT id, recipient_id FROM recipient_keys
            WHERE tenant_id=:tenant AND active=true AND id::text = ANY(:ids)
        """), {"tenant": payload.tenant_id, "ids": key_ids},
    ).mappings().all()
    known = {str(row["id"]): row["recipient_id"] for row in key_rows}
    if set(key_ids) != set(known):
        raise HTTPException(status_code=422, detail="Envelope berisi recipient key yang tidak aktif/tidak dikenal untuk tenant ini")
    if "triage" not in known.values():
        raise HTTPException(status_code=422, detail="Sediakan envelope untuk public key triage tenant agar laporan dapat ditangani")

    report_id = str(uuid.uuid4())
    ticket_id = ticket_number()
    now = utcnow()
    due_at = now + timedelta(hours=int(os.getenv("DEFAULT_SLA_HOURS", "24")))
    db.execute(
        text("""
            INSERT INTO reports
              (id,ticket_id,tenant_id,opd_id,encryption_alg,ciphertext,wrapped_deks,
               owner_kdf,owner_kdf_iterations,owner_wrapped_dek,owner_wrap_iv,salt,iv,
               device_hash,anonymous,status,sla_due_at,created_at,updated_at)
            VALUES
              (:id,:ticket,:tenant,NULL,:alg,:ciphertext,CAST(:wrapped_deks AS jsonb),
               :owner_kdf,:iterations,:owner_wrapped_dek,:owner_wrap_iv,:salt,:iv,
               :device_hash,:anonymous,'Diterima',:due_at,:now,:now)
        """),
        {"id": report_id, "ticket": ticket_id, "tenant": payload.tenant_id,
         "alg": payload.encryption_alg, "ciphertext": base64.b64decode(payload.ciphertext),
         "wrapped_deks": json.dumps(payload.wrapped_deks, separators=(",", ":")),
         "owner_kdf": payload.owner_kdf, "iterations": payload.owner_kdf_iterations,
         "owner_wrapped_dek": base64.b64decode(payload.owner_wrapped_dek),
         "owner_wrap_iv": base64.b64decode(payload.owner_wrap_iv),
         "salt": base64.b64decode(payload.salt), "iv": base64.b64decode(payload.iv),
         "device_hash": payload.device_hash, "anonymous": payload.anonymous,
         "due_at": due_at, "now": now},
    )
    audit(db, tenant=payload.tenant_id, report_id=report_id, opd=None,
          event="ticket.created", role="public", actor_id=None,
          metadata={"status": "Diterima", "anonymous": payload.anonymous})
    enqueue_event(db, payload.tenant_id, "ticket.created", {
        "event": "ticket.created", "ticket_id": ticket_id, "tenant_id": payload.tenant_id,
        "status": "Diterima", "created_at": now.isoformat(),
    })
    db.commit()
    return {"id": report_id, "ticket_id": ticket_id, "tenant_id": payload.tenant_id,
            "status": "Diterima", "created_at": now.isoformat()}


def _report_json(row) -> dict:
    return {
        "id": str(row["id"]), "ticket_id": row["ticket_id"],
        "tenant_id": row["tenant_id"], "opd_id": row["opd_id"],
        "encryption_alg": row["encryption_alg"],
        "ciphertext": base64.b64encode(bytes(row["ciphertext"])).decode("ascii"),
        "wrapped_deks": row["wrapped_deks"],
        "owner_kdf": row["owner_kdf"], "owner_kdf_iterations": row["owner_kdf_iterations"],
        "owner_wrapped_dek": base64.b64encode(bytes(row["owner_wrapped_dek"])).decode("ascii"),
        "owner_wrap_iv": base64.b64encode(bytes(row["owner_wrap_iv"])).decode("ascii"),
        "salt": base64.b64encode(bytes(row["salt"])).decode("ascii"),
        "iv": base64.b64encode(bytes(row["iv"])).decode("ascii"),
        "device_hash": row["device_hash"], "anonymous": row["anonymous"],
        "status": row["status"], "sla_due_at": row["sla_due_at"].isoformat(),
        "escalated": row["escalated"], "created_at": row["created_at"].isoformat(),
        "updated_at": row["updated_at"].isoformat(),
    }


@app.get("/api/v2/reports", tags=["reports"])
def list_reports(user: CurrentUser, db: Db, limit: int = 50):
    if not 1 <= limit <= 200:
        raise HTTPException(status_code=422, detail="limit harus 1 sampai 200")
    rows = db.execute(
        text("""
            SELECT id,ticket_id,tenant_id,opd_id,encryption_alg,ciphertext,wrapped_deks,
                   owner_kdf,owner_kdf_iterations,owner_wrapped_dek,owner_wrap_iv,salt,iv,
                   device_hash,anonymous,status,sla_due_at,escalated,created_at,updated_at
            FROM reports ORDER BY created_at DESC LIMIT :limit
        """), {"limit": limit},
    ).mappings().all()
    return {"count": len(rows), "items": [_report_json(row) for row in rows]}


@app.get("/api/v2/reports/{report_id}", tags=["reports"])
def get_report(report_id: str, user: CurrentUser, db: Db):
    row = db.execute(text("SELECT * FROM reports WHERE id=:id"), {"id": report_id}).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Laporan tidak ditemukan")
    audit_rows = db.execute(
        text("SELECT event_type,actor_role,metadata,created_at FROM audit_trails WHERE report_id=:id ORDER BY created_at"),
        {"id": report_id},
    ).mappings().all()
    result = _report_json(row)
    result["audit"] = [
        {"event_type": x["event_type"], "actor_role": x["actor_role"],
         "metadata": x["metadata"], "created_at": x["created_at"].isoformat()}
        for x in audit_rows
    ]
    return result


@app.post("/api/v2/reports/{report_id}/route", tags=["reports"])
def route_report(report_id: str, payload: RouteReportIn, user: CurrentUser, db: Db):
    if user["role"] not in ("tenant_admin", "triage"):
        raise HTTPException(status_code=403, detail="Hanya tenant_admin/triage yang dapat melakukan routing")
    agency = db.execute(
        text("SELECT id,sla_hours FROM agencies WHERE tenant_id=:tenant AND id=:opd AND active=true"),
        {"tenant": user["wilayah_id"], "opd": payload.opd_id},
    ).mappings().first()
    if not agency:
        raise HTTPException(status_code=404, detail="OPD tidak terdaftar pada tenant ini")
    current = db.execute(
        text("SELECT id,wrapped_deks FROM reports WHERE id=:id FOR UPDATE"), {"id": report_id}
    ).mappings().first()
    if not current:
        raise HTTPException(status_code=404, detail="Laporan tidak ditemukan")
    envelope_ids = list((current["wrapped_deks"] or {}).keys())
    recipient = db.execute(
        text("""
            SELECT id FROM recipient_keys
            WHERE tenant_id=:tenant AND recipient_id=:opd AND id::text = ANY(:ids)
            LIMIT 1
        """), {"tenant": user["wilayah_id"], "opd": payload.opd_id, "ids": envelope_ids},
    ).first()
    if not recipient:
        raise HTTPException(status_code=409, detail="Laporan tidak memiliki envelope DEK untuk public key OPD tujuan")

    now = utcnow()
    row = db.execute(
        text("""
            UPDATE reports SET opd_id=:opd,status='Terverifikasi',
                sla_due_at=:due,updated_at=:now
            WHERE id=:id RETURNING id,ticket_id,tenant_id,opd_id,status,sla_due_at
        """),
        {"opd": payload.opd_id, "due": now + timedelta(hours=agency["sla_hours"]),
         "now": now, "id": report_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Laporan tidak ditemukan")
    audit(db, tenant=user["wilayah_id"], report_id=str(row["id"]), opd=payload.opd_id,
          event="ticket.routed", role=user["role"], actor_id=user["sub"],
          metadata={"opd_id": payload.opd_id, "status": row["status"]})
    enqueue_event(db, user["wilayah_id"], "ticket.routed", {
        "event": "ticket.routed", "ticket_id": row["ticket_id"], "tenant_id": row["tenant_id"],
        "opd_id": row["opd_id"], "status": row["status"],
    })
    db.commit()
    return {"ticket_id": row["ticket_id"], "opd_id": row["opd_id"],
            "status": row["status"], "sla_due_at": row["sla_due_at"].isoformat()}


@app.patch("/api/v2/reports/{report_id}/status", tags=["reports"])
def update_status(report_id: str, payload: StatusUpdateIn, user: CurrentUser, db: Db):
    row = db.execute(
        text("SELECT id,ticket_id,tenant_id,opd_id,status FROM reports WHERE id=:id FOR UPDATE"),
        {"id": report_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Laporan tidak ditemukan")
    if row["status"] == "Diterima":
        raise HTTPException(status_code=409, detail="Laporan harus diverifikasi dan dirutekan terlebih dahulu")
    try:
        next_index, current_index = STATUSES.index(payload.status), STATUSES.index(row["status"])
    except ValueError as exc:
        raise HTTPException(status_code=409, detail="Transisi status tidak valid") from exc
    if next_index != current_index + 1:
        raise HTTPException(status_code=409, detail="Status hanya dapat dimajukan satu tahap")
    if user["role"] == "operator" and row["opd_id"] != user["opd_id"]:
        raise HTTPException(status_code=404, detail="Laporan tidak ditemukan")
    now = utcnow()
    db.execute(text("UPDATE reports SET status=:status,updated_at=:now WHERE id=:id"),
               {"status": payload.status, "now": now, "id": report_id})
    audit(db, tenant=user["wilayah_id"], report_id=str(row["id"]), opd=row["opd_id"],
          event="ticket.updated", role=user["role"], actor_id=user["sub"],
          metadata={"status": payload.status})
    enqueue_event(db, user["wilayah_id"], "ticket.updated", {
        "event": "ticket.updated", "ticket_id": row["ticket_id"], "tenant_id": user["wilayah_id"],
        "opd_id": row["opd_id"], "status": payload.status,
    })
    db.commit()
    return {"ticket_id": row["ticket_id"], "status": payload.status}


@app.post("/api/v2/integrations/webhooks", status_code=201, tags=["integrations"])
def register_webhook(payload: WebhookIn, user: CurrentUser, db: Db):
    if user["role"] != "tenant_admin":
        raise HTTPException(status_code=403, detail="Hanya tenant_admin dapat mengelola webhook")
    if not webhook_url_is_allowed(payload.url):
        raise HTTPException(status_code=422, detail="URL harus HTTPS dan host ada pada WEBHOOK_ALLOWED_HOSTS")
    secret = secrets.token_urlsafe(48)
    hook_id = str(uuid.uuid4())
    db.execute(
        text("""
            INSERT INTO webhook_subscriptions(id,tenant_id,url,secret_ciphertext,events)
            VALUES (:id,:tenant,:url,:secret,:events)
        """),
        {"id": hook_id, "tenant": user["wilayah_id"], "url": payload.url,
         "secret": encrypt_webhook_secret(secret), "events": payload.events},
    )
    audit(db, tenant=user["wilayah_id"], report_id=None, opd=None,
          event="webhook.created", role=user["role"], actor_id=user["sub"],
          metadata={"webhook_id": hook_id, "events": payload.events})
    db.commit()
    return {"id": hook_id, "url": payload.url, "events": payload.events, "secret": secret}


@app.get("/api/v2/integrations/webhooks", tags=["integrations"])
def list_webhooks(user: CurrentUser, db: Db):
    if user["role"] != "tenant_admin":
        raise HTTPException(status_code=403, detail="Hanya tenant_admin dapat melihat webhook")
    rows = db.execute(
        text("SELECT id,url,events,enabled,created_at FROM webhook_subscriptions ORDER BY created_at DESC")
    ).mappings().all()
    return [{"id": str(r["id"]), "url": r["url"], "events": r["events"],
             "enabled": r["enabled"], "created_at": r["created_at"].isoformat()} for r in rows]
