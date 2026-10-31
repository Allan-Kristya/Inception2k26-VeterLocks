from __future__ import annotations

import base64
import hashlib
import hmac
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

import jwt
from cryptography.fernet import Fernet, InvalidToken

JWT_ISSUER = os.getenv("JWT_ISSUER", "laporaman-api")
JWT_AUDIENCE = os.getenv("JWT_AUDIENCE", "laporaman-client")
JWT_SECRET = os.getenv("JWT_SECRET", "development-only-change-this-jwt-secret-32-bytes-minimum")
APP_ENCRYPTION_KEY = os.getenv("APP_ENCRYPTION_KEY", "development-only-change-this-encryption-secret")
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_MINUTES = int(os.getenv("ACCESS_TOKEN_MINUTES", "60"))


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    derived = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=2**14, r=8, p=1, dklen=32)
    return "scrypt$16384$8$1${}${}".format(
        base64.urlsafe_b64encode(salt).decode().rstrip("="),
        base64.urlsafe_b64encode(derived).decode().rstrip("="),
    )


def verify_password(password: str, encoded: str) -> bool:
    try:
        algo, n, r, p, salt_b64, expected_b64 = encoded.split("$")
        if algo != "scrypt":
            return False
        salt = base64.urlsafe_b64decode(salt_b64 + "=" * (-len(salt_b64) % 4))
        expected = base64.urlsafe_b64decode(expected_b64 + "=" * (-len(expected_b64) % 4))
        actual = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=int(n), r=int(r), p=int(p), dklen=len(expected))
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False


def create_access_token(user: Any) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user.id,
        "email": user.email,
        "name": user.display_name,
        "tid": user.tenant_id,
        "opd": user.opd_id,
        "role": user.role,
        "ver": getattr(user, "token_version", 0),
        "iat": now,
        "exp": now + timedelta(minutes=ACCESS_TOKEN_MINUTES),
        "iss": JWT_ISSUER,
        "aud": JWT_AUDIENCE,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any] | None:
    try:
        return jwt.decode(
            token,
            JWT_SECRET,
            algorithms=[JWT_ALGORITHM],
            issuer=JWT_ISSUER,
            audience=JWT_AUDIENCE,
            options={"require": ["sub", "exp", "iat", "tid", "opd", "role", "ver"]},
        )
    except jwt.PyJWTError:
        return None


def encrypt_server_secret(value: str) -> str:
    key = base64.urlsafe_b64encode(hashlib.sha256(APP_ENCRYPTION_KEY.encode()).digest())
    return Fernet(key).encrypt(value.encode()).decode()


def decrypt_server_secret(value: str) -> str | None:
    key = base64.urlsafe_b64encode(hashlib.sha256(APP_ENCRYPTION_KEY.encode()).digest())
    try:
        return Fernet(key).decrypt(value.encode()).decode()
    except (InvalidToken, ValueError):
        return None
