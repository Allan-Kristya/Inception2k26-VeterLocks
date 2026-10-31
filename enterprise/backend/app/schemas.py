from __future__ import annotations

import base64
import uuid
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class LoginRequest(StrictModel):
    email: str = Field(min_length=5, max_length=190)
    password: str = Field(min_length=12, max_length=256)


class EncryptedReportIn(StrictModel):
    tenant_id: str = Field(min_length=2, max_length=32, pattern=r"^[a-z0-9_-]+$")
    encryption_alg: Literal["A256GCM"] = "A256GCM"
    ciphertext: str = Field(min_length=24, max_length=12_000_000)
    # Owner passphrase wrapping parameters; no passphrase is accepted or stored.
    owner_kdf: Literal["PBKDF2-HMAC-SHA256"] = "PBKDF2-HMAC-SHA256"
    owner_kdf_iterations: int = Field(ge=100_000, le=2_000_000)
    owner_wrapped_dek: str = Field(min_length=64, max_length=128)
    owner_wrap_iv: str = Field(min_length=16, max_length=24)
    salt: str = Field(min_length=20, max_length=32)
    iv: str = Field(min_length=16, max_length=24)
    # One RSA-OAEP ciphertext per recipient key ID (triage and candidate OPDs).
    wrapped_deks: dict[str, str] = Field(min_length=1, max_length=16)
    device_hash: str | None = Field(default=None, pattern=r"^[0-9a-f]{64}$")
    anonymous: bool = True

    @field_validator("ciphertext", "owner_wrapped_dek", "owner_wrap_iv", "salt", "iv")
    @classmethod
    def valid_base64(cls, value: str) -> str:
        try:
            base64.b64decode(value, validate=True)
        except Exception as exc:
            raise ValueError("Kolom kriptografi wajib Base64 valid") from exc
        return value

    @field_validator("salt")
    @classmethod
    def salt_is_16_bytes(cls, value: str) -> str:
        if len(base64.b64decode(value, validate=True)) != 16:
            raise ValueError("Salt PBKDF2 harus 16 byte")
        return value

    @field_validator("iv", "owner_wrap_iv")
    @classmethod
    def iv_is_12_bytes(cls, value: str) -> str:
        if len(base64.b64decode(value, validate=True)) != 12:
            raise ValueError("IV AES-GCM harus 12 byte")
        return value

    @field_validator("ciphertext")
    @classmethod
    def ciphertext_contains_tag(cls, value: str) -> str:
        if len(base64.b64decode(value, validate=True)) < 16:
            raise ValueError("Ciphertext harus memuat authentication tag AES-GCM")
        return value

    @field_validator("owner_wrapped_dek")
    @classmethod
    def owner_wrapped_dek_is_48_bytes(cls, value: str) -> str:
        if len(base64.b64decode(value, validate=True)) != 48:
            raise ValueError("Owner wrapped DEK harus 48 byte")
        return value

    @field_validator("wrapped_deks")
    @classmethod
    def recipient_envelopes_are_rsa_ciphertexts(cls, values: dict[str, str]) -> dict[str, str]:
        for key_id, envelope in values.items():
            try:
                uuid.UUID(key_id)
                raw = base64.b64decode(envelope, validate=True)
            except Exception as exc:
                raise ValueError("wrapped_deks harus berupa map UUID ke Base64") from exc
            if len(raw) not in (384, 512):
                raise ValueError("RSA-OAEP envelope harus berukuran 384/512 byte (RSA-3072/4096)")
        return values


class RouteReportIn(StrictModel):
    opd_id: str = Field(min_length=2, max_length=32, pattern=r"^[a-z0-9_-]+$")


class StatusUpdateIn(StrictModel):
    status: Literal["Terverifikasi", "Diproses", "Selesai"]


class WebhookIn(StrictModel):
    url: str = Field(min_length=12, max_length=1500)
    events: list[Literal["ticket.created", "ticket.updated", "ticket.routed", "sla.breached"]] = Field(min_length=1, max_length=4)

    @field_validator("events")
    @classmethod
    def unique_events(cls, values: list[str]) -> list[str]:
        if len(values) != len(set(values)):
            raise ValueError("Event tidak boleh duplikat")
        return values


class RecipientKeyIn(StrictModel):
    public_key_spki: str = Field(min_length=500, max_length=12000)

    @field_validator("public_key_spki")
    @classmethod
    def valid_base64_spki(cls, value: str) -> str:
        try:
            base64.b64decode(value, validate=True)
        except Exception as exc:
            raise ValueError("public_key_spki harus berupa Base64 DER") from exc
        return value
