from __future__ import annotations

import base64
import hashlib
import hmac
import ipaddress
import os
import secrets
import socket
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlparse

import jwt
from cryptography.fernet import Fernet

JWT_ISSUER = os.getenv("JWT_ISSUER", "https://api.laporaman.local")
JWT_AUDIENCE = os.getenv("JWT_AUDIENCE", "laporaman-operator")
JWT_PRIVATE_KEY_PATH = os.getenv("JWT_PRIVATE_KEY_PATH", "/run/jwt/jwt-private.pem")
JWT_PUBLIC_KEY_PATH = os.getenv("JWT_PUBLIC_KEY_PATH", "/run/jwt/jwt-public.pem")
JWT_TTL_MINUTES = int(os.getenv("JWT_TTL_MINUTES", "10"))
WEBHOOK_ENCRYPTION_KEY = os.getenv("WEBHOOK_ENCRYPTION_KEY", "")


def _private_key() -> str:
    return Path(JWT_PRIVATE_KEY_PATH).read_text(encoding="utf-8")


def _public_key() -> str:
    return Path(JWT_PUBLIC_KEY_PATH).read_text(encoding="utf-8")


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    derived = hashlib.scrypt(password.encode(), salt=salt, n=2**15, r=8, p=1, dklen=32, maxmem=128 * 1024 * 1024)
    return "scrypt$32768$8$1${}${}".format(
        base64.urlsafe_b64encode(salt).decode().rstrip("="),
        base64.urlsafe_b64encode(derived).decode().rstrip("="),
    )


def verify_password(password: str, encoded: str) -> bool:
    try:
        algo, n, r, p, salt_text, digest_text = encoded.split("$")
        if algo != "scrypt":
            return False
        salt = base64.urlsafe_b64decode(salt_text + "=" * (-len(salt_text) % 4))
        expected = base64.urlsafe_b64decode(digest_text + "=" * (-len(digest_text) % 4))
        actual = hashlib.scrypt(
            password.encode(), salt=salt, n=int(n), r=int(r), p=int(p), dklen=len(expected),
            maxmem=128 * 1024 * 1024,
        )
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError, MemoryError):
        return False


def create_access_token(user: dict) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user["id"]),
        "wilayah_id": user["tenant_id"],
        "opd_id": user["opd_id"] or "*",
        "role": user["role"],
        "roles": [user["role"]],
        "ver": int(user["token_version"]),
        "iat": now,
        "exp": now + timedelta(minutes=JWT_TTL_MINUTES),
        "iss": JWT_ISSUER,
        "aud": JWT_AUDIENCE,
        "jti": secrets.token_urlsafe(16),
    }
    return jwt.encode(payload, _private_key(), algorithm="RS256", headers={"kid": "laporaman-main"})


def decode_access_token(token: str) -> dict | None:
    try:
        return jwt.decode(
            token,
            _public_key(),
            algorithms=["RS256"],
            issuer=JWT_ISSUER,
            audience=JWT_AUDIENCE,
            options={"require": ["sub", "wilayah_id", "opd_id", "role", "ver", "iat", "exp", "jti"]},
        )
    except (jwt.PyJWTError, OSError):
        return None


def encrypt_webhook_secret(secret: str) -> bytes:
    if not WEBHOOK_ENCRYPTION_KEY:
        raise RuntimeError("WEBHOOK_ENCRYPTION_KEY belum dikonfigurasi")
    return Fernet(WEBHOOK_ENCRYPTION_KEY.encode()).encrypt(secret.encode())


def decrypt_webhook_secret(ciphertext: bytes) -> str:
    if not WEBHOOK_ENCRYPTION_KEY:
        raise RuntimeError("WEBHOOK_ENCRYPTION_KEY belum dikonfigurasi")
    return Fernet(WEBHOOK_ENCRYPTION_KEY.encode()).decrypt(ciphertext).decode()


def webhook_url_is_allowed(value: str) -> bool:
    """HTTPS + public DNS + explicit host allowlist; still pair with egress firewall."""
    try:
        parsed = urlparse(value)
        if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
            return False
        if parsed.port not in (None, 443):
            return False
        host = parsed.hostname.encode("idna").decode("ascii").lower().rstrip(".")
        allowlist = {item.strip().lower() for item in os.getenv("WEBHOOK_ALLOWED_HOSTS", "").split(",") if item.strip()}
        if not allowlist or not any(host == item or host.endswith("." + item) for item in allowlist):
            return False
        addresses = {ipaddress.ip_address(x[4][0]) for x in socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)}
        return host in allowlist and bool(addresses) and all(addr.is_global for addr in addresses)
    except (ValueError, UnicodeError, OSError, socket.gaierror):
        return False
