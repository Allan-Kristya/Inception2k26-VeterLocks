from __future__ import annotations

from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class LoginRequest(StrictModel):
    email: str = Field(min_length=5, max_length=190)
    password: str = Field(min_length=1, max_length=256)


class LabelScore(StrictModel):
    id: str = Field(min_length=2, max_length=16, pattern=r"^[a-z0-9_-]+$")
    confidence: float = Field(ge=0.0, le=1.0)


class EncryptedVault(StrictModel):
    version: Literal[1] = 1
    kdf: Literal["PBKDF2-HMAC-SHA256"]
    iterations: int = Field(ge=100_000, le=2_000_000)
    salt: str = Field(min_length=20, max_length=64)
    iv: str = Field(min_length=12, max_length=32)
    ciphertext: str = Field(min_length=24, max_length=8_000_000)
    key_salt: str = Field(min_length=20, max_length=64)
    key_iv: str = Field(min_length=12, max_length=32)
    wrapped_key: str = Field(min_length=30, max_length=256)

    @field_validator("salt", "iv", "ciphertext", "key_salt", "key_iv", "wrapped_key")
    @classmethod
    def base64_only(cls, value: str) -> str:
        import base64
        try:
            decoded = base64.b64decode(value, validate=True)
        except Exception as exc:
            raise ValueError("Nilai kriptografi harus berupa Base64 valid.") from exc
        return value

    @field_validator("salt", "key_salt")
    @classmethod
    def salt_length(cls, value: str) -> str:
        import base64
        if len(base64.b64decode(value)) != 16:
            raise ValueError("Salt PBKDF2 wajib 16 byte.")
        return value

    @field_validator("iv", "key_iv")
    @classmethod
    def iv_length(cls, value: str) -> str:
        import base64
        if len(base64.b64decode(value)) != 12:
            raise ValueError("IV AES-GCM wajib 12 byte.")
        return value

    @field_validator("wrapped_key")
    @classmethod
    def wrapped_key_length(cls, value: str) -> str:
        import base64
        if len(base64.b64decode(value)) != 48:
            raise ValueError("Wrapped AES-256 data key wajib 48 byte termasuk tag GCM.")
        return value


class CreateReportRequest(StrictModel):
    tenant_id: Literal["sby", "sda"]
    labels: list[LabelScore] = Field(default_factory=list, max_length=8)
    confidence: float = Field(ge=0.0, le=1.0)
    ai_engine: str = Field(default="local-keyword-demo", max_length=80)
    anonymous: bool = False
    vault: EncryptedVault
    staff_envelope: str = Field(min_length=300, max_length=1200)

    @field_validator("labels")
    @classmethod
    def unique_labels(cls, values: list[LabelScore]) -> list[LabelScore]:
        ids = [item.id for item in values]
        if len(set(ids)) != len(ids):
            raise ValueError("Kategori laporan tidak boleh duplikat.")
        return values


class RouteRequest(StrictModel):
    opd_id: str = Field(min_length=2, max_length=16)


class StatusRequest(StrictModel):
    status: Literal["Terverifikasi", "Diproses", "Selesai"]


class PrivateKeyEnvelope(StrictModel):
    version: Literal[1] = 1
    kdf: Literal["PBKDF2-HMAC-SHA256"]
    iterations: int = Field(ge=100_000, le=2_000_000)
    salt: str = Field(min_length=20, max_length=64)
    iv: str = Field(min_length=12, max_length=32)
    ciphertext: str = Field(min_length=1000, max_length=12000)

    @field_validator("salt", "iv", "ciphertext")
    @classmethod
    def envelope_base64_only(cls, value: str) -> str:
        import base64
        try:
            decoded = base64.b64decode(value, validate=True)
        except Exception as exc:
            raise ValueError("Envelope kunci harus berupa Base64 valid.") from exc
        return value

    @field_validator("salt")
    @classmethod
    def salt_is_16_bytes(cls, value: str) -> str:
        import base64
        if len(base64.b64decode(value)) != 16:
            raise ValueError("Salt envelope wajib 16 byte.")
        return value

    @field_validator("iv")
    @classmethod
    def iv_is_12_bytes(cls, value: str) -> str:
        import base64
        if len(base64.b64decode(value)) != 12:
            raise ValueError("IV envelope wajib 12 byte.")
        return value


class KeySetupRequest(StrictModel):
    public_key_spki: str = Field(min_length=300, max_length=3000)
    private_key_envelope: PrivateKeyEnvelope

    @field_validator("public_key_spki")
    @classmethod
    def public_key_base64_only(cls, value: str) -> str:
        import base64
        try:
            base64.b64decode(value, validate=True)
        except Exception as exc:
            raise ValueError("Kunci publik harus berupa Base64 valid.") from exc
        return value


class WebhookCreateRequest(StrictModel):
    url: str = Field(min_length=12, max_length=1000)
    events: list[Literal["ticket.created", "ticket.updated", "ticket.routed", "sla.breached"]] = Field(min_length=1, max_length=4)


class StaffCreateRequest(StrictModel):
    email: str = Field(min_length=5, max_length=190)
    display_name: str = Field(min_length=3, max_length=120)
    password: str = Field(min_length=12, max_length=256)
    tenant_id: Literal["sby", "sda"]
    opd_id: str = Field(min_length=2, max_length=16, pattern=r"^(all|[a-z0-9_-]+)$")
    role: Literal["operator", "admin"] = "operator"

    @field_validator("email")
    @classmethod
    def valid_email(cls, value: str) -> str:
        import re
        value = value.lower()
        if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value):
            raise ValueError("Format email tidak valid.")
        return value

    @field_validator("display_name")
    @classmethod
    def valid_name(cls, value: str) -> str:
        if len(value.strip()) < 3:
            raise ValueError("Nama minimal 3 karakter.")
        return value.strip()


class ChangePasswordRequest(StrictModel):
    current_password: str = Field(min_length=1, max_length=256)
    new_password: str = Field(min_length=12, max_length=256)
