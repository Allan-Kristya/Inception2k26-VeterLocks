import asyncio
import base64
import ipaddress
import json
import logging
import os
import re
import secrets
import socket
import uuid
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from threading import Lock
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Annotated
from urllib.parse import urlparse

import httpx
from fastapi import BackgroundTasks, Depends, FastAPI, Header, HTTPException, Request, Response
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.rsa import RSAPublicKey

from .database import build_engine, build_session_factory, initialize_database, set_local_context
from .models import Report, ReportEvent, StaffUser, Tenant, WebhookSubscription, utcnow
from .schemas import ChangePasswordRequest, CreateReportRequest, KeySetupRequest, LoginRequest, RouteRequest, StaffCreateRequest, StatusRequest, WebhookCreateRequest
from .security import (
    ACCESS_TOKEN_MINUTES,
    create_access_token,
    decrypt_server_secret,
    encrypt_server_secret,
    hash_password,
    verify_password,
    decode_access_token,
)

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
log = logging.getLogger("laporaman")
ROOT = Path(__file__).resolve().parents[2]
FRONTEND = ROOT / "frontend"

TENANTS = {"sby": "Kota Surabaya", "sda": "Kabupaten Sidoarjo"}
OPDS = {
    "pu": ("Dinas Pekerjaan Umum", 72),
    "hub": ("Dinas Perhubungan", 48),
    "dlh": ("Dinas Lingkungan Hidup", 48),
    "kes": ("Dinas Kesehatan", 24),
    "duk": ("Dinas Kependudukan", 96),
    "sos": ("Dinas Sosial", 24),
    "ins": ("Inspektorat", 72),
    "pen": ("Dinas Penerangan Jalan", 48),
}
STATUSES = ["Diterima", "Terverifikasi", "Diproses", "Selesai"]
TICKET_RE = re.compile(r"^LA-\d{4}-\d{4}-[A-Z0-9]{8}$")


def iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    return value.replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")


def json_load(value: str, fallback):
    try:
        return json.loads(value)
    except (TypeError, json.JSONDecodeError):
        return fallback


def ticket_code() -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(secrets.choice(alphabet) for _ in range(4))


def create_ticket_id() -> str:
    now = datetime.now(timezone.utc)
    number = secrets.randbelow(9000) + 1000
    return f"LA-{now.year}-{number:04d}-{ticket_code()}{ticket_code()}"


def add_event(
    db: Session,
    report: Report,
    event_type: str,
    message: str,
    actor_name: str = "Sistem LaporAman",
    actor_role: str = "Sistem",
) -> ReportEvent:
    event = ReportEvent(
        id=str(uuid.uuid4()),
        report_id=report.id,
        ticket_id=report.ticket_id,
        tenant_id=report.tenant_id,
        event_type=event_type,
        message=message,
        status=report.status,
        actor_name=actor_name,
        actor_role=actor_role,
    )
    db.add(event)
    return event


def report_dict(report: Report, *, include_crypto: bool = True) -> dict:
    out = {
        "ticket_id": report.ticket_id,
        "tenant_id": report.tenant_id,
        "tenant_name": TENANTS.get(report.tenant_id, report.tenant_id),
        "opd_ids": json_load(report.opd_ids_json, []),
        "labels": json_load(report.labels_json, []),
        "confidence": report.confidence,
        "ai_engine": report.ai_engine,
        "review_required": report.review_required,
        "anonymous": report.anonymous,
        "status": report.status,
        "due_at": iso(report.due_at),
        "escalated": report.escalated,
        "csat": report.csat,
        "created_at": iso(report.created_at),
        "updated_at": iso(report.updated_at),
    }
    if include_crypto:
        out["vault"] = json_load(report.vault_json, {})
        out["staff_envelope"] = report.staff_envelope
    return out


def event_list(db: Session, report: Report) -> list[dict]:
    events = db.scalars(
        select(ReportEvent).where(ReportEvent.report_id == report.id).order_by(ReportEvent.created_at.asc())
    ).all()
    return [
        {
            "event_type": e.event_type,
            "message": e.message,
            "status": e.status,
            "actor": e.actor_name,
            "actor_role": e.actor_role,
            "created_at": iso(e.created_at),
        }
        for e in events
    ]


class SlidingWindowLimiter:
    """Small single-process guard for development. Use KrakenD/Redis for clustered deployments."""

    def __init__(self):
        self.items: dict[str, deque[float]] = defaultdict(deque)
        self.lock = Lock()

    def check(self, key: str, limit: int, window: int) -> bool:
        import time
        now = time.monotonic()
        with self.lock:
            q = self.items[key]
            while q and now - q[0] > window:
                q.popleft()
            if len(q) >= limit:
                return False
            q.append(now)
            # Remove expired client buckets to keep memory bounded under IP churn.
            if len(self.items) > 10000:
                expired = [bucket for bucket, timestamps in self.items.items() if not timestamps or now - timestamps[-1] > window]
                for bucket in expired:
                    self.items.pop(bucket, None)
            return True


limiter = SlidingWindowLimiter()


def _is_safe_webhook_url(value: str) -> bool:
    try:
        parsed = urlparse(value)
        if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
            return False
        if parsed.port not in (None, 443):
            return False
        host = parsed.hostname.encode("idna").decode("ascii").lower().rstrip(".")
        if host in {"localhost", "metadata.google.internal"} or host.endswith((".localhost", ".local", ".internal")):
            return False
        try:
            addresses = {ipaddress.ip_address(host)}
        except ValueError:
            resolved = socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)
            addresses = {ipaddress.ip_address(item[4][0]) for item in resolved}
        return bool(addresses) and all(address.is_global for address in addresses)
    except (ValueError, UnicodeError, OSError, socket.gaierror):
        return False


async def deliver_webhook(db_factory, tenant_id: str, event_name: str, payload: dict) -> None:
    session = db_factory()
    try:
        set_local_context(session, tenant_id=tenant_id, opd_id="all")
        hooks = session.scalars(
            select(WebhookSubscription).where(WebhookSubscription.tenant_id == tenant_id, WebhookSubscription.enabled.is_(True))
        ).all()
        pending = []
        for hook in hooks:
            if event_name not in json_load(hook.events_json, []):
                continue
            secret = decrypt_server_secret(hook.secret_ciphertext)
            if not secret:
                continue
            import hashlib, hmac
            body = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode()
            signature = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
            pending.append((hook.url, body, signature))
    finally:
        session.close()
    for url, body, signature in pending:
        try:
            # Re-check DNS/public-address policy at delivery time. Production still
            # needs an egress firewall/proxy to close the residual DNS-rebinding race.
            if not _is_safe_webhook_url(url):
                log.warning("Webhook delivery blocked by URL policy (%s)", urlparse(url).hostname or "unknown")
                continue
            async with httpx.AsyncClient(timeout=5.0, follow_redirects=False) as client:
                await client.post(url, content=body, headers={"Content-Type": "application/json", "X-LaporAman-Signature": f"sha256={signature}"})
        except Exception as exc:
            log.warning("Webhook delivery failed (%s): %s", urlparse(url).hostname or "unknown", type(exc).__name__)


async def sla_worker(app: FastAPI) -> None:
    while True:
        await asyncio.sleep(30)
        factory = app.state.session_factory
        db = factory()
        dispatch: list[tuple[str, dict]] = []
        try:
            tenants = db.scalars(select(Tenant)).all()
            for tenant in tenants:
                set_local_context(db, tenant_id=tenant.id, opd_id="all")
                overdue = db.scalars(
                    select(Report).where(
                        Report.tenant_id == tenant.id,
                        Report.status != "Selesai",
                        Report.escalated.is_(False),
                        Report.due_at < utcnow(),
                    ).with_for_update(skip_locked=True)
                ).all()
                for report in overdue:
                    report.escalated = True
                    report.updated_at = utcnow()
                    add_event(db, report, "sla.breached", "Tenggat SLA terlampaui; laporan dieskalasikan.")
                    dispatch.append((tenant.id, {
                        "event": "sla.breached", "ticket_id": report.ticket_id,
                        "tenant_id": tenant.id, "status": report.status, "at": iso(utcnow()),
                    }))
            db.commit()
        except Exception:
            db.rollback()
            log.exception("SLA worker failed")
        finally:
            db.close()
        for tenant_id, payload in dispatch:
            await deliver_webhook(factory, tenant_id, "sla.breached", payload)


def seed_database(admin_engine) -> None:
    from sqlalchemy.orm import Session as OrmSession
    seed_enabled = os.getenv("SEED_DEMO_USERS", "true").lower() == "true"
    with OrmSession(admin_engine) as db:
        for tenant_id, tenant_name in TENANTS.items():
            if db.get(Tenant, tenant_id) is None:
                db.add(Tenant(id=tenant_id, name=tenant_name))
        db.commit()
        if not seed_enabled:
            return
        demo_password = os.getenv("BOOTSTRAP_PASSWORD", "LaporAmanDemo!2026")
        if len(demo_password) < 12:
            raise RuntimeError("BOOTSTRAP_PASSWORD harus minimal 12 karakter.")
        demo_users = [
            ("admin.sby@laporaman.local", "Administrator Surabaya", "sby", "all", "admin"),
            ("operator.pu@laporaman.local", "Operator Dinas PU", "sby", "pu", "operator"),
            ("operator.sda@laporaman.local", "Operator Sidoarjo", "sda", "all", "admin"),
        ]
        for email, name, tenant_id, opd_id, role in demo_users:
            exists = db.scalar(select(StaffUser).where(StaffUser.email == email))
            if not exists:
                db.add(StaffUser(
                    id=str(uuid.uuid4()), email=email, display_name=name,
                    password_hash=hash_password(demo_password), tenant_id=tenant_id,
                    opd_id=opd_id, role=role, active=True,
                ))
        db.commit()


def create_app(database_url: str | None = None, admin_database_url: str | None = None) -> FastAPI:
    runtime_url = database_url or os.getenv("DATABASE_URL", f"sqlite:///{ROOT / 'laporaman.db'}")
    admin_url = admin_database_url or os.getenv("ADMIN_DATABASE_URL", runtime_url)
    runtime_engine = build_engine(runtime_url)
    admin_engine = runtime_engine if runtime_url == admin_url else build_engine(admin_url)
    session_factory = build_session_factory(runtime_engine)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        if os.getenv("APP_ENV", "development").lower() == "production":
            jwt_secret = os.getenv("JWT_SECRET", "")
            app_secret = os.getenv("APP_ENCRYPTION_KEY", "")
            if len(jwt_secret) < 32 or jwt_secret.lower().startswith(("change", "development", "local-")):
                raise RuntimeError("JWT_SECRET produksi wajib berupa secret acak minimal 32 karakter.")
            if len(app_secret) < 32 or app_secret.lower().startswith(("change", "development", "local-")):
                raise RuntimeError("APP_ENCRYPTION_KEY produksi wajib berupa secret acak minimal 32 karakter.")
            if os.getenv("SEED_DEMO_USERS", "false").lower() == "true":
                raise RuntimeError("SEED_DEMO_USERS harus false pada APP_ENV=production.")
            if runtime_engine.dialect.name != "postgresql":
                raise RuntimeError("APP_ENV=production memerlukan PostgreSQL; SQLite hanya untuk development/test.")
        initialize_database(admin_engine, runtime_engine)
        seed_database(admin_engine)
        app.state.runtime_engine = runtime_engine
        app.state.admin_engine = admin_engine
        app.state.session_factory = session_factory
        worker = asyncio.create_task(sla_worker(app))
        yield
        worker.cancel()
        try:
            await worker
        except asyncio.CancelledError:
            pass
        runtime_engine.dispose()
        if admin_engine is not runtime_engine:
            admin_engine.dispose()

    app = FastAPI(
        title="LaporAman API",
        description="REST API pelaporan publik terenkripsi untuk interoperabilitas SPBE.",
        version="1.0.0",
        docs_url="/docs",
        redoc_url="/redoc",
        lifespan=lifespan,
    )
    # FastAPI exposes OpenAPI version as an application attribute, not a constructor argument.
    # Keep the proposal's OpenAPI 3.1.0 target without breaking startup.
    app.openapi_version = "3.1.0"
    app.state.session_factory = session_factory

    @app.middleware("http")
    async def security_headers(request: Request, call_next):
        response: Response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        response.headers.setdefault("Permissions-Policy", "camera=(), geolocation=(self), microphone=(self)")
        response.headers.setdefault("Cross-Origin-Opener-Policy", "same-origin")
        response.headers.setdefault("Cross-Origin-Resource-Policy", "same-origin")
        if request.url.path not in {"/docs", "/redoc", "/openapi.json"}:
            response.headers.setdefault("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'")
        if request.url.scheme == "https" or os.getenv("COOKIE_SECURE", "false").lower() == "true":
            response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        if request.url.path.startswith("/api/"):
            response.headers.setdefault("Cache-Control", "no-store")
        return response

    def get_db():
        db = session_factory()
        try:
            yield db
        finally:
            db.close()

    Db = Annotated[Session, Depends(get_db)]

    def current_user(
        request: Request,
        db: Db,
        authorization: Annotated[str | None, Header()] = None,
    ) -> StaffUser:
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Token autentikasi diperlukan.")
        claims = decode_access_token(authorization[7:])
        if not claims:
            raise HTTPException(status_code=401, detail="Token tidak valid atau kedaluwarsa.")
        set_local_context(db, tenant_id=claims["tid"], opd_id=claims["opd"])
        user = db.get(StaffUser, claims["sub"])
        if (not user or not user.active or user.tenant_id != claims["tid"]
                or user.opd_id != claims["opd"] or user.role != claims["role"]
                or user.token_version != claims.get("ver")):
            raise HTTPException(status_code=401, detail="Akun tidak aktif atau hak akses token sudah berubah. Silakan masuk kembali.")
        request.state.claims = claims
        return user

    User = Annotated[StaffUser, Depends(current_user)]

    def rate_limit(request: Request, bucket: str, limit: int, seconds: int) -> None:
        key = f"{request.client.host if request.client else 'unknown'}:{bucket}"
        if not limiter.check(key, limit, seconds):
            raise HTTPException(status_code=429, detail="Terlalu banyak permintaan. Silakan coba kembali.", headers={"Retry-After": str(seconds)})

    async def post_event(tenant_id: str, event_name: str, payload: dict):
        await deliver_webhook(session_factory, tenant_id, event_name, payload)

    @app.get("/api/health", tags=["system"])
    def health():
        # A process-only health response can hide a disconnected database.
        # Probe the configured runtime connection so judges/operators can tell
        # whether the API is actually ready to accept and persist reports.
        try:
            with runtime_engine.connect() as connection:
                connection.execute(text("SELECT 1"))
        except SQLAlchemyError as exc:
            log.error("Health check database probe failed: %s", type(exc).__name__)
            raise HTTPException(status_code=503, detail="Database belum tersedia.") from exc
        return {"status": "ok", "service": "laporaman-api", "release": "laporaman-hackathon-demo-v2.0.1", "database": runtime_engine.dialect.name, "database_status": "connected", "openapi": "3.1.0"}

    @app.get("/api/tenants/{tenant_id}/public-key", tags=["tenants"])
    def tenant_public_key(tenant_id: str, db: Db):
        tenant = db.get(Tenant, tenant_id)
        if not tenant:
            raise HTTPException(404, "Wilayah tidak ditemukan.")
        if not tenant.public_key_spki:
            raise HTTPException(409, "Kunci enkripsi instansi belum disiapkan. Hubungi administrator wilayah.")
        return {"tenant_id": tenant_id, "public_key_spki": tenant.public_key_spki, "key_created_at": iso(tenant.key_created_at)}

    @app.post("/api/auth/login", tags=["authentication"])
    def login(payload: LoginRequest, request: Request, db: Db):
        rate_limit(request, "login", 6, 60)
        user = db.scalar(select(StaffUser).where(func.lower(StaffUser.email) == payload.email.lower()))
        if not user or not user.active or not verify_password(payload.password, user.password_hash):
            raise HTTPException(status_code=401, detail="Email atau kata sandi tidak cocok.")
        token = create_access_token(user)
        return {
            "access_token": token,
            "token_type": "bearer",
            "expires_in": ACCESS_TOKEN_MINUTES * 60,
            "user": {"id": user.id, "email": user.email, "name": user.display_name, "tenant_id": user.tenant_id, "opd_id": user.opd_id, "role": user.role},
        }

    @app.post("/api/auth/change-password", tags=["authentication"])
    def change_password(payload: ChangePasswordRequest, user: User, db: Db):
        if not verify_password(payload.current_password, user.password_hash):
            raise HTTPException(400, "Kata sandi saat ini tidak cocok.")
        if payload.current_password == payload.new_password:
            raise HTTPException(422, "Kata sandi baru harus berbeda dari kata sandi saat ini.")
        user.password_hash = hash_password(payload.new_password)
        user.token_version += 1
        db.commit()
        return {"changed": True, "reauthentication_required": True}

    @app.get("/api/auth/me", tags=["authentication"])
    def me(user: User):
        return {"id": user.id, "email": user.email, "name": user.display_name, "tenant_id": user.tenant_id, "opd_id": user.opd_id, "role": user.role}

    @app.post("/api/staff/users", status_code=201, tags=["staff"])
    def create_staff_user(payload: StaffCreateRequest, user: User, db: Db):
        if user.role not in {"admin", "security_admin"}:
            raise HTTPException(403, "Hanya administrator instansi yang dapat membuat akun petugas.")
        if payload.tenant_id != user.tenant_id:
            raise HTTPException(403, "Administrator hanya dapat membuat akun di tenant miliknya.")
        if payload.role == "operator" and payload.opd_id == "all":
            raise HTTPException(422, "Akun operator harus memiliki cakupan OPD tertentu.")
        if payload.role == "admin" and payload.opd_id != "all":
            raise HTTPException(422, "Akun administrator harus memiliki cakupan seluruh OPD dalam tenant.")
        if payload.opd_id != "all" and payload.opd_id not in OPDS:
            raise HTTPException(422, "OPD tidak dikenal.")
        if db.scalar(select(StaffUser).where(func.lower(StaffUser.email) == payload.email)):
            raise HTTPException(409, "Email sudah terdaftar.")
        staff = StaffUser(
            id=str(uuid.uuid4()), email=payload.email, display_name=payload.display_name,
            password_hash=hash_password(payload.password), tenant_id=payload.tenant_id,
            opd_id=payload.opd_id, role=payload.role, active=True,
        )
        db.add(staff)
        db.commit()
        return {"id": staff.id, "email": staff.email, "name": staff.display_name,
                "tenant_id": staff.tenant_id, "opd_id": staff.opd_id, "role": staff.role, "active": staff.active}

    @app.get("/api/staff/tenant-key", tags=["staff"])
    def get_tenant_key(user: User, db: Db):
        tenant = db.get(Tenant, user.tenant_id)
        return {
            "tenant_id": tenant.id,
            "public_key_spki": tenant.public_key_spki,
            "private_key_envelope": json_load(tenant.private_key_envelope_json, None),
            "key_created_at": iso(tenant.key_created_at),
        }

    @app.put("/api/staff/tenant-key", tags=["staff"])
    def set_tenant_key(payload: KeySetupRequest, user: User, db: Db):
        if user.role not in {"admin", "security_admin"}:
            raise HTTPException(403, "Hanya administrator instansi yang dapat mengelola kunci enkripsi.")
        try:
            decoded = base64.b64decode(payload.public_key_spki, validate=True)
            public_key = serialization.load_der_public_key(decoded)
            if not isinstance(public_key, RSAPublicKey) or not 3072 <= public_key.key_size <= 4096:
                raise ValueError("RSA key too small or unsupported")
            envelope_json = payload.private_key_envelope.model_dump_json()
        except Exception as exc:
            raise HTTPException(422, "Kunci publik harus RSA minimal 3072-bit dan envelope privat harus valid.") from exc
        tenant = db.get(Tenant, user.tenant_id)
        if tenant.public_key_spki:
            raise HTTPException(409, "Kunci instansi sudah tersedia. Rotasi kunci perlu proses re-envelope agar laporan lama tetap dapat dibuka.")
        tenant.public_key_spki = payload.public_key_spki
        tenant.private_key_envelope_json = envelope_json
        tenant.key_created_at = utcnow()
        db.commit()
        return {"saved": True, "tenant_id": tenant.id, "key_created_at": iso(tenant.key_created_at)}

    @app.post("/api/reports", status_code=201, tags=["reports"])
    async def create_report(payload: CreateReportRequest, request: Request, background: BackgroundTasks, db: Db):
        rate_limit(request, "create-report", 8, 60)
        tenant = db.get(Tenant, payload.tenant_id)
        if not tenant or not tenant.public_key_spki:
            raise HTTPException(409, "Kunci enkripsi wilayah belum tersedia.")
        allowed_ids = set(OPDS)
        if any(label.id not in allowed_ids for label in payload.labels):
            raise HTTPException(422, "Kategori OPD tidak dikenal.")
        if not payload.staff_envelope:
            raise HTTPException(422, "Envelope kunci instansi wajib disertakan.")
        try:
            envelope_bytes = base64.b64decode(payload.staff_envelope, validate=True)
            tenant_public = serialization.load_der_public_key(base64.b64decode(tenant.public_key_spki, validate=True))
            if not isinstance(tenant_public, RSAPublicKey) or not 3072 <= tenant_public.key_size <= 4096 or len(envelope_bytes) != tenant_public.key_size // 8:
                raise ValueError("Envelope size does not match tenant key")
        except Exception as exc:
            raise HTTPException(422, "Envelope kunci instansi tidak cocok dengan kunci publik wilayah.") from exc

        # The browser keyword model is not a trusted/validated IndoBERTweet inference.
        # Client-supplied scores are stored as suggestions only; dispatch is manual until
        # a verified model service/on-device model is deployed and signed server-side.
        auto_route = False
        opd_ids = []
        sla_hours = 24
        now = utcnow()
        report = Report(
            id=str(uuid.uuid4()), ticket_id=create_ticket_id(), tenant_id=payload.tenant_id,
            opd_ids_json=json.dumps(opd_ids), labels_json=json.dumps([x.model_dump() for x in payload.labels]),
            confidence=payload.confidence, ai_engine=payload.ai_engine,
            review_required=not auto_route, anonymous=payload.anonymous,
            status="Diterima", due_at=now + timedelta(hours=sla_hours), escalated=False,
            vault_json=payload.vault.model_dump_json(), staff_envelope=payload.staff_envelope,
            created_at=now, updated_at=now,
        )
        set_local_context(db, insert_tenant=payload.tenant_id, tenant_id=payload.tenant_id, opd_id="all")
        db.add(report)
        db.flush()
        add_event(db, report, "ticket.created", "Laporan diterima dan nomor registrasi diterbitkan.")
        suggestion = ", ".join(OPDS[x.id][0] for x in payload.labels) or "belum ada kategori"
        add_event(db, report, "ticket.review_required", f"Saran klasifikasi awal: {suggestion}. Menunggu validasi petugas; model ML terverifikasi belum aktif.")
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            raise HTTPException(503, "Nomor tiket bentrok. Silakan kirim ulang.")
        # A commit clears SET LOCAL context. Restore a scoped context before refreshing
        # the newly inserted row under PostgreSQL FORCE ROW LEVEL SECURITY.
        set_local_context(db, tenant_id=payload.tenant_id, opd_id="all", public_ticket=report.ticket_id)
        db.refresh(report)
        background.add_task(post_event, payload.tenant_id, "ticket.created", {
            "event": "ticket.created", "ticket_id": report.ticket_id,
            "tenant_id": report.tenant_id, "status": report.status, "at": iso(report.created_at),
        })
        return {**report_dict(report, include_crypto=False), "vault": json_load(report.vault_json, {})}

    @app.get("/api/reports/{ticket_id}", tags=["reports"])
    def track_report(ticket_id: str, request: Request, db: Db):
        rate_limit(request, "public-track", 90, 60)
        ticket_id = ticket_id.upper()
        if not TICKET_RE.fullmatch(ticket_id):
            raise HTTPException(422, "Format nomor registrasi tidak valid.")
        set_local_context(db, public_ticket=ticket_id)
        report = db.scalar(select(Report).where(Report.ticket_id == ticket_id))
        if not report:
            raise HTTPException(404, "Nomor registrasi tidak ditemukan.")
        return {**report_dict(report, include_crypto=False), "vault": json_load(report.vault_json, {}), "trail": event_list(db, report)}

    @app.get("/api/staff/reports", tags=["staff"])
    def staff_reports(user: User, db: Db, queue: str = "all"):
        set_local_context(db, tenant_id=user.tenant_id, opd_id=user.opd_id)
        query = select(Report).where(Report.tenant_id == user.tenant_id).order_by(Report.created_at.desc()).limit(250)
        if user.opd_id != "all":
            query = query.where(Report.review_required.is_(False))
        reports = db.scalars(query).all()
        result = []
        for report in reports:
            ids = json_load(report.opd_ids_json, [])
            if user.opd_id != "all" and user.opd_id not in ids:
                continue
            if queue == "review" and not report.review_required:
                continue
            if queue == "active" and report.status not in {"Terverifikasi", "Diproses"}:
                continue
            if queue == "breached" and not report.escalated:
                continue
            if queue == "done" and report.status != "Selesai":
                continue
            result.append(report_dict(report))
        return {"items": result, "count": len(result)}

    @app.get("/api/staff/reports/{ticket_id}", tags=["staff"])
    def staff_report_detail(ticket_id: str, user: User, db: Db):
        set_local_context(db, tenant_id=user.tenant_id, opd_id=user.opd_id)
        report = db.scalar(select(Report).where(Report.ticket_id == ticket_id.upper(), Report.tenant_id == user.tenant_id))
        if not report:
            raise HTTPException(404, "Laporan tidak ditemukan pada tenant ini.")
        ids = json_load(report.opd_ids_json, [])
        if user.opd_id != "all" and (report.review_required or user.opd_id not in ids):
            raise HTTPException(403, "Laporan berada di luar cakupan OPD akun Anda.")
        return {**report_dict(report), "trail": event_list(db, report)}

    @app.post("/api/staff/reports/{ticket_id}/route", tags=["staff"])
    async def route_report(ticket_id: str, payload: RouteRequest, user: User, db: Db):
        if payload.opd_id not in OPDS:
            raise HTTPException(422, "OPD tujuan tidak dikenal.")
        if user.role not in {"admin", "security_admin"} and user.opd_id != "all":
            raise HTTPException(403, "Hanya operator pusat atau administrator yang dapat melakukan tinjauan awal.")
        set_local_context(db, tenant_id=user.tenant_id, opd_id=user.opd_id)
        report = db.scalar(select(Report).where(Report.ticket_id == ticket_id.upper(), Report.tenant_id == user.tenant_id))
        if not report:
            raise HTTPException(404, "Laporan tidak ditemukan.")
        if not report.review_required:
            raise HTTPException(409, "Laporan sudah memiliki rute OPD.")
        set_local_context(db, tenant_id=user.tenant_id, opd_id=user.opd_id)
        report.opd_ids_json = json.dumps([payload.opd_id])
        report.review_required = False
        report.status = "Terverifikasi"
        report.due_at = utcnow() + timedelta(hours=OPDS[payload.opd_id][1])
        report.updated_at = utcnow()
        add_event(db, report, "ticket.routed", f"Laporan diverifikasi dan diteruskan ke {OPDS[payload.opd_id][0]}.", "Operator Pengaduan", "Operator")
        db.commit()
        result = report_dict(report, include_crypto=False)
        await post_event(user.tenant_id, "ticket.routed", {"event": "ticket.routed", "ticket_id": report.ticket_id, "tenant_id": user.tenant_id, "opd_ids": [payload.opd_id], "status": report.status, "at": iso(utcnow())})
        return result

    @app.patch("/api/staff/reports/{ticket_id}/status", tags=["staff"])
    async def update_status(ticket_id: str, payload: StatusRequest, user: User, db: Db):
        set_local_context(db, tenant_id=user.tenant_id, opd_id=user.opd_id)
        report = db.scalar(select(Report).where(Report.ticket_id == ticket_id.upper(), Report.tenant_id == user.tenant_id))
        if not report:
            raise HTTPException(404, "Laporan tidak ditemukan.")
        ids = json_load(report.opd_ids_json, [])
        if user.opd_id != "all" and (report.review_required or user.opd_id not in ids):
            raise HTTPException(403, "Laporan berada di luar cakupan OPD akun Anda.")
        if report.review_required:
            raise HTTPException(409, "Laporan harus ditinjau dan dirutekan terlebih dahulu.")
        current_index = STATUSES.index(report.status)
        next_index = STATUSES.index(payload.status)
        if next_index != current_index + 1:
            raise HTTPException(409, "Status hanya dapat dimajukan satu tahap pada satu waktu.")
        report.status = payload.status
        report.updated_at = utcnow()
        # Public tracker displays audit messages; keep them operational and never
        # accept free-text staff notes here because they may accidentally contain PII.
        msg = f"Status laporan diperbarui menjadi {payload.status}."
        add_event(db, report, "ticket.updated", msg, "Petugas Instansi", user.role)
        db.commit()
        await post_event(user.tenant_id, "ticket.updated", {"event": "ticket.updated", "ticket_id": report.ticket_id, "tenant_id": user.tenant_id, "status": report.status, "at": iso(utcnow())})
        return report_dict(report, include_crypto=False)

    @app.get("/api/staff/stats", tags=["staff"])
    def staff_stats(user: User, db: Db):
        set_local_context(db, tenant_id=user.tenant_id, opd_id=user.opd_id)
        query = select(Report).where(Report.tenant_id == user.tenant_id)
        if user.opd_id != "all":
            query = query.where(Report.review_required.is_(False))
        reports = db.scalars(query).all()
        if user.opd_id != "all":
            reports = [r for r in reports if user.opd_id in json_load(r.opd_ids_json, [])]
        by_status = {s: sum(1 for r in reports if r.status == s) for s in STATUSES}
        by_opd = {key: sum(1 for r in reports if key in json_load(r.opd_ids_json, [])) for key in OPDS}
        total = len(reports)
        completed = by_status["Selesai"]
        on_time = sum(1 for r in reports if r.status == "Selesai" and r.updated_at <= r.due_at)
        return {
            "tenant_id": user.tenant_id, "tenant_name": TENANTS[user.tenant_id],
            "total": total, "by_status": by_status, "by_opd": by_opd,
            "review_queue": sum(1 for r in reports if r.review_required),
            "escalated": sum(1 for r in reports if r.escalated),
            "completed": completed,
            "sla_compliance_percent": round((on_time / completed) * 100, 1) if completed else None,
        }

    @app.post("/api/staff/webhooks", status_code=201, tags=["integrations"])
    def create_webhook(payload: WebhookCreateRequest, user: User, db: Db):
        if user.role not in {"admin", "security_admin"}:
            raise HTTPException(403, "Hanya administrator yang dapat mengelola integrasi webhook tingkat tenant.")
        set_local_context(db, tenant_id=user.tenant_id, opd_id=user.opd_id)
        if not _is_safe_webhook_url(payload.url):
            raise HTTPException(422, "Webhook harus menggunakan HTTPS dan host publik yang diizinkan.")
        secret = secrets.token_urlsafe(36)
        hook = WebhookSubscription(
            id=str(uuid.uuid4()), tenant_id=user.tenant_id, url=payload.url,
            secret_ciphertext=encrypt_server_secret(secret), events_json=json.dumps(sorted(set(payload.events))), enabled=True,
        )
        db.add(hook)
        db.commit()
        return {"id": hook.id, "url": hook.url, "events": json_load(hook.events_json, []), "secret": secret, "warning": "Rahasia ditampilkan satu kali. Simpan secara aman di sistem penerima."}

    @app.get("/api/staff/webhooks", tags=["integrations"])
    def list_webhooks(user: User, db: Db):
        if user.role not in {"admin", "security_admin"}:
            raise HTTPException(403, "Hanya administrator yang dapat melihat integrasi webhook tingkat tenant.")
        set_local_context(db, tenant_id=user.tenant_id, opd_id=user.opd_id)
        hooks = db.scalars(select(WebhookSubscription).where(WebhookSubscription.tenant_id == user.tenant_id)).all()
        return [{"id": h.id, "url": h.url, "events": json_load(h.events_json, []), "enabled": h.enabled, "created_at": iso(h.created_at)} for h in hooks]

    @app.get("/api/staff/stats/export", tags=["integrations"])
    def export_stats(user: User, db: Db):
        return staff_stats(user, db)

    @app.get("/", include_in_schema=False)
    def index():
        return FileResponse(FRONTEND / "index.html")

    if FRONTEND.exists():
        app.mount("/", StaticFiles(directory=FRONTEND), name="frontend-static")

    return app


app = create_app()
