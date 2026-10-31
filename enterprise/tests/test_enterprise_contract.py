import base64
import os
import socket
import uuid

import pytest
from pydantic import ValidationError

from backend.app.schemas import EncryptedReportIn
from ai_service.main import extract_location_entities
os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///:memory:")
from backend.app.main import app
from backend.app.security import hash_password, verify_password, webhook_url_is_allowed


def valid_payload(**overrides):
    key_id = str(uuid.uuid4())
    data = {
        "tenant_id": "sby",
        "ciphertext": base64.b64encode(b"c" * 64).decode(),
        "owner_kdf_iterations": 310000,
        "owner_wrapped_dek": base64.b64encode(b"w" * 48).decode(),
        "owner_wrap_iv": base64.b64encode(b"o" * 12).decode(),
        "salt": base64.b64encode(b"s" * 16).decode(),
        "iv": base64.b64encode(b"i" * 12).decode(),
        "wrapped_deks": {key_id: base64.b64encode(b"r" * 384).decode()},
        "device_hash": "a" * 64,
        "anonymous": True,
    }
    data.update(overrides)
    return data


def test_encrypted_report_requires_valid_gcm_dimensions():
    payload = EncryptedReportIn(**valid_payload())
    assert payload.tenant_id == "sby"
    assert payload.owner_kdf_iterations == 310000
    assert len(payload.wrapped_deks) == 1


def test_plaintext_and_passphrase_fields_are_rejected():
    with pytest.raises(ValidationError):
        EncryptedReportIn(**valid_payload(passphrase="jangan-terima-ini"))
    with pytest.raises(ValidationError):
        EncryptedReportIn(**valid_payload(plaintext="isi laporan"))


def test_invalid_wrapped_key_uuid_or_length_is_rejected():
    with pytest.raises(ValidationError):
        EncryptedReportIn(**valid_payload(wrapped_deks={"not-a-uuid": "YQ=="}))


def test_location_regex_extracts_candidates():
    found = extract_location_entities("Jalan Ahmad Yani dekat Kecamatan Wonokromo, Kota Surabaya")
    assert any(x["type"] == "street" for x in found)
    assert any(x["type"] == "district" for x in found)
    assert any(x["type"] == "city" for x in found)


def test_scrypt_password_hash_round_trip():
    encoded = hash_password("CorrectHorseBatteryStaple!2026")
    assert verify_password("CorrectHorseBatteryStaple!2026", encoded)
    assert not verify_password("wrong-password", encoded)


def test_core_openapi_contract_is_31():
    schema = app.openapi()
    assert schema["openapi"] == "3.1.0"
    assert "/api/v2/reports" in schema["paths"]
    assert "/api/v2/public/tenants/{tenant_id}/reports/{ticket_id}" in schema["paths"]


def test_rs256_access_token_round_trip(tmp_path, monkeypatch):
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    from backend.app import security

    private = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_path = tmp_path / "jwt-private.pem"
    public_path = tmp_path / "jwt-public.pem"
    private_path.write_bytes(private.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ))
    public_path.write_bytes(private.public_key().public_bytes(
        serialization.Encoding.PEM,
        serialization.PublicFormat.SubjectPublicKeyInfo,
    ))
    monkeypatch.setattr(security, "JWT_PRIVATE_KEY_PATH", str(private_path))
    monkeypatch.setattr(security, "JWT_PUBLIC_KEY_PATH", str(public_path))
    token = security.create_access_token({
        "id": "operator-test", "tenant_id": "sby", "opd_id": "pu",
        "role": "operator", "token_version": 0,
    })
    claims = security.decode_access_token(token)
    assert claims["sub"] == "operator-test"
    assert claims["wilayah_id"] == "sby"
    assert claims["opd_id"] == "pu"
    assert claims["role"] == "operator"
    assert claims["roles"] == ["operator"]


def test_webhook_allowlist_requires_exact_public_hostname(monkeypatch):
    monkeypatch.setenv("WEBHOOK_ALLOWED_HOSTS", "hooks.smartcity.example")
    monkeypatch.setattr(
        socket,
        "getaddrinfo",
        lambda *_args, **_kwargs: [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("8.8.8.8", 443))],
    )
    assert webhook_url_is_allowed("https://hooks.smartcity.example/events")
    assert not webhook_url_is_allowed("https://sub.hooks.smartcity.example/events")
    assert not webhook_url_is_allowed("http://hooks.smartcity.example/events")
