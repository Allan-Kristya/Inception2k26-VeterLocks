import base64
import pytest
from fastapi.testclient import TestClient
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

from app.main import create_app, limiter


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setenv("BOOTSTRAP_PASSWORD", "LaporAmanDemo!2026")
    monkeypatch.setenv("SEED_DEMO_USERS", "true")
    limiter.items.clear()
    app = create_app("sqlite:///:memory:")
    with TestClient(app) as test_client:
        yield test_client


def login(client, email="admin.sby@laporaman.local", password="LaporAmanDemo!2026"):
    response = client.post("/api/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def setup_key(client, headers):
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=3072)
    public_der = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.DER,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    b64 = lambda value: base64.b64encode(value).decode()
    response = client.put("/api/staff/tenant-key", headers=headers, json={
        "public_key_spki": b64(public_der),
        "private_key_envelope": {
            "version": 1, "kdf": "PBKDF2-HMAC-SHA256", "iterations": 310000,
            "salt": b64(b"s" * 16), "iv": b64(b"i" * 12), "ciphertext": b64(b"x" * 800),
        },
    })
    assert response.status_code == 200, response.text


def encrypted_request(confidence=0.86, label="pu", tenant="sby"):
    return {
        "tenant_id": tenant,
        "labels": [{"id": label, "confidence": confidence}],
        "confidence": confidence,
        "ai_engine": "local-keyword-demo",
        "anonymous": False,
        "vault": {
            "version": 1, "kdf": "PBKDF2-HMAC-SHA256", "iterations": 310000,
            "salt": base64.b64encode(b"s" * 16).decode(),
            "iv": base64.b64encode(b"i" * 12).decode(),
            "ciphertext": base64.b64encode(b"ciphertext payload" * 10).decode(),
            "key_salt": base64.b64encode(b"k" * 16).decode(),
            "key_iv": base64.b64encode(b"v" * 12).decode(),
            "wrapped_key": base64.b64encode(b"w" * 48).decode(),
        },
        "staff_envelope": base64.b64encode(b"r" * 384).decode(),
    }


def test_health_openapi_and_auth(client):
    health = client.get("/api/health")
    assert health.status_code == 200
    assert health.json()["database"] == "sqlite"
    spec = client.get("/openapi.json").json()
    assert spec["openapi"] == "3.1.0"
    assert client.get("/api/auth/me").status_code == 401
    headers = login(client)
    assert client.get("/api/auth/me", headers=headers).status_code == 200
    page = client.get("/")
    assert page.status_code == 200 and "LaporAman" in page.text
    assert page.headers.get("content-security-policy")
    assert page.headers.get("x-frame-options") == "DENY"


def test_key_setup_submit_public_tracker_and_staff_dashboard(client):
    headers = login(client)
    setup_key(client, headers)

    create = client.post("/api/reports", json=encrypted_request())
    assert create.status_code == 201, create.text
    body = create.json()
    ticket = body["ticket_id"]
    assert len(ticket.rsplit("-", 1)[1]) == 8
    assert body["review_required"] is True
    assert body["opd_ids"] == []
    assert "staff_envelope" not in body  # public submit response does not expose recipient envelope
    assert body["vault"]["ciphertext"]

    tracked = client.get(f"/api/reports/{ticket}")
    assert tracked.status_code == 200, tracked.text
    assert tracked.json()["trail"]
    assert "staff_envelope" not in tracked.json()

    staff = client.get("/api/staff/reports?queue=review", headers=headers)
    assert staff.status_code == 200, staff.text
    assert staff.json()["count"] == 1
    assert staff.json()["items"][0]["staff_envelope"]

    routed = client.post(f"/api/staff/reports/{ticket}/route", headers=headers, json={"opd_id": "pu"})
    assert routed.status_code == 200, routed.text
    assert routed.json()["opd_ids"] == ["pu"]

    next_status = client.patch(f"/api/staff/reports/{ticket}/status", headers=headers, json={"status": "Diproses"})
    assert next_status.status_code == 200, next_status.text
    assert next_status.json()["status"] == "Diproses"
    assert client.get(f"/api/reports/{ticket}").json()["status"] == "Diproses"
    note_attempt = client.patch(f"/api/staff/reports/{ticket}/status", headers=headers, json={
        "status": "Selesai", "note": "Jangan tampilkan NIK 1234567890123456 di tracker",
    })
    assert note_attempt.status_code == 422  # Public audit trail does not accept free-text/PII notes.


def test_low_confidence_goes_to_human_review(client):
    headers = login(client)
    setup_key(client, headers)
    payload = encrypted_request(confidence=0.56, label="ins")
    response = client.post("/api/reports", json=payload)
    assert response.status_code == 201, response.text
    assert response.json()["review_required"] is True
    assert response.json()["opd_ids"] == []
    ticket = response.json()["ticket_id"]
    routed = client.post(f"/api/staff/reports/{ticket}/route", headers=headers, json={"opd_id": "ins"})
    assert routed.status_code == 200, routed.text
    assert routed.json()["status"] == "Terverifikasi"
    assert routed.json()["opd_ids"] == ["ins"]


def test_opd_scoping_and_tenant_isolation(client):
    admin = login(client)
    setup_key(client, admin)
    response = client.post("/api/reports", json=encrypted_request(confidence=0.88, label="dlh"))
    assert response.status_code == 201
    pu_operator = login(client, "operator.pu@laporaman.local")
    visible = client.get("/api/staff/reports", headers=pu_operator).json()
    assert visible["count"] == 0
    detail = client.get(f"/api/staff/reports/{response.json()['ticket_id']}", headers=pu_operator)
    assert detail.status_code == 404 or detail.status_code == 403
    assert client.get(f"/api/staff/reports/{response.json()['ticket_id']}").status_code == 401


def test_anonymous_submission_and_admin_staff_provisioning(client):
    admin = login(client)
    setup_key(client, admin)

    anonymous_payload = encrypted_request(confidence=0.91, label="ins")
    anonymous_payload["anonymous"] = True
    created = client.post("/api/reports", json=anonymous_payload)
    assert created.status_code == 201, created.text
    assert created.json()["anonymous"] is True
    assert created.json()["review_required"] is True

    provisioned = client.post("/api/staff/users", headers=admin, json={
        "email": "new.operator@laporaman.local", "display_name": "Operator Baru",
        "password": "PasswordAman!2026", "tenant_id": "sby", "opd_id": "pu", "role": "operator",
    })
    assert provisioned.status_code == 201, provisioned.text
    assert provisioned.json()["opd_id"] == "pu"
    user_headers = login(client, "new.operator@laporaman.local", "PasswordAman!2026")
    assert client.get("/api/auth/me", headers=user_headers).json()["email"] == "new.operator@laporaman.local"

    # Password change revokes every outstanding token for the account.
    bad_change = client.post("/api/auth/change-password", headers=user_headers, json={
        "current_password": "wrong-password", "new_password": "NewPasswordAman!2026",
    })
    assert bad_change.status_code == 400
    same_change = client.post("/api/auth/change-password", headers=user_headers, json={
        "current_password": "PasswordAman!2026", "new_password": "PasswordAman!2026",
    })
    assert same_change.status_code == 422
    changed = client.post("/api/auth/change-password", headers=user_headers, json={
        "current_password": "PasswordAman!2026", "new_password": "NewPasswordAman!2026",
    })
    assert changed.status_code == 200, changed.text
    assert client.get("/api/auth/me", headers=user_headers).status_code == 401
    assert client.post("/api/auth/login", json={
        "email": "new.operator@laporaman.local", "password": "PasswordAman!2026",
    }).status_code == 401
    refreshed_headers = login(client, "new.operator@laporaman.local", "NewPasswordAman!2026")
    assert client.get("/api/auth/me", headers=refreshed_headers).status_code == 200

    # A tenant administrator cannot provision users for a different tenant.
    forbidden = client.post("/api/staff/users", headers=admin, json={
        "email": "cross.tenant@laporaman.local", "display_name": "Cross Tenant",
        "password": "PasswordAman!2026", "tenant_id": "sda", "opd_id": "all", "role": "admin",
    })
    assert forbidden.status_code == 403

    # Tenant-level webhooks are administrator-only.
    assert client.post("/api/staff/webhooks", headers=refreshed_headers, json={
        "url": "https://1.1.1.1/hooks", "events": ["ticket.created"],
    }).status_code == 403
    created_hook = client.post("/api/staff/webhooks", headers=admin, json={
        "url": "https://1.1.1.1/hooks", "events": ["ticket.created", "sla.breached"],
    })
    assert created_hook.status_code == 201, created_hook.text
    assert len(created_hook.json()["secret"]) >= 32
    assert client.get("/api/staff/webhooks", headers=admin).status_code == 200


def test_ticket_validation_and_status_transition_rules(client):
    headers = login(client)
    setup_key(client, headers)
    created = client.post("/api/reports", json=encrypted_request()).json()
    ticket = created["ticket_id"]
    assert client.get("/api/reports/not-a-ticket").status_code == 422
    # A report cannot skip directly from Diterima to Diproses.
    bad_transition = client.patch(f"/api/staff/reports/{ticket}/status", headers=headers, json={"status": "Diproses"})
    assert bad_transition.status_code == 409


def test_production_mode_refuses_sqlite_and_demo_seeds(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("JWT_SECRET", "a" * 48)
    monkeypatch.setenv("APP_ENCRYPTION_KEY", "b" * 48)
    monkeypatch.setenv("SEED_DEMO_USERS", "false")
    app = create_app("sqlite:///:memory:")
    with pytest.raises(RuntimeError, match="memerlukan PostgreSQL"):
        with TestClient(app):
            pass


def test_sla_compliance_uses_actual_completion_timestamp(client):
    from datetime import timedelta
    from app.models import Report, utcnow

    headers = login(client)
    setup_key(client, headers)
    created = client.post("/api/reports", json=encrypted_request()).json()
    ticket = created["ticket_id"]
    routed = client.post(f"/api/staff/reports/{ticket}/route", headers=headers, json={"opd_id": "pu"})
    assert routed.status_code == 200

    db = client.app.state.session_factory()
    try:
        report = db.query(Report).filter(Report.ticket_id == ticket).one()
        report.due_at = utcnow() - timedelta(minutes=1)
        report.escalated = False  # Simulate the short window before SLA worker's next poll.
        db.commit()
    finally:
        db.close()

    assert client.patch(f"/api/staff/reports/{ticket}/status", headers=headers, json={"status": "Diproses"}).status_code == 200
    assert client.patch(f"/api/staff/reports/{ticket}/status", headers=headers, json={"status": "Selesai"}).status_code == 200
    stats = client.get("/api/staff/stats", headers=headers).json()
    assert stats["sla_compliance_percent"] == 0.0


def test_admin_bootstrap_cli_creates_first_tenant_admin(monkeypatch, tmp_path):
    from argparse import Namespace
    from sqlalchemy import create_engine, select
    from sqlalchemy.orm import Session
    from app.cli import create_admin
    from app.models import StaffUser
    from app.security import verify_password

    db_path = tmp_path / "bootstrap.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_path}")
    password_values = iter(["BootstrapAman!2026", "BootstrapAman!2026"])
    monkeypatch.setattr("app.cli.getpass", lambda _prompt: next(password_values))
    create_admin(Namespace(email="first.admin@example.test", name="Administrator Pertama", tenant="sby"))

    engine = create_engine(f"sqlite:///{db_path}")
    try:
        with Session(engine) as db:
            user = db.scalar(select(StaffUser).where(StaffUser.email == "first.admin@example.test"))
            assert user is not None
            assert user.tenant_id == "sby" and user.role == "admin" and user.opd_id == "all"
            assert verify_password("BootstrapAman!2026", user.password_hash)
    finally:
        engine.dispose()
