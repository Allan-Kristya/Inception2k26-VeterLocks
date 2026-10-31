from __future__ import annotations

import base64
import json
import os
from pathlib import Path
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa

OUT = Path(os.getenv("JWT_KEYS_DIR", "/run/jwt"))
OUT.mkdir(parents=True, exist_ok=True)
private_path = OUT / "jwt-private.pem"
public_path = OUT / "jwt-public.pem"
jwks_path = OUT / "jwks.json"

if not private_path.exists() or not public_path.exists() or not jwks_path.exists():
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=3072)
    public_key = private_key.public_key()
    private_path.write_bytes(private_key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ))
    public_path.write_bytes(public_key.public_bytes(
        serialization.Encoding.PEM,
        serialization.PublicFormat.SubjectPublicKeyInfo,
    ))
    os.chmod(private_path, 0o600)
    numbers = public_key.public_numbers()
    def b64u(data: bytes) -> str:
        return base64.urlsafe_b64encode(data).decode().rstrip("=")
    jwk = {
        "kty": "RSA", "use": "sig", "alg": "RS256", "kid": "laporaman-main",
        "n": b64u(numbers.n.to_bytes((numbers.n.bit_length() + 7) // 8, "big")),
        "e": b64u(numbers.e.to_bytes((numbers.e.bit_length() + 7) // 8, "big")),
    }
    jwks_path.write_text(json.dumps({"keys": [jwk]}, indent=2), encoding="utf-8")
    print(f"Generated development RSA keypair at {OUT}")
else:
    print(f"JWT keypair already exists at {OUT}; not rotating it")
