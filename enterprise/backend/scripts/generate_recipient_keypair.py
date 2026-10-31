from __future__ import annotations

import argparse
import base64
import os
from getpass import getpass
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate an RSA-OAEP recipient keypair locally; only the public key is registered with LaporAman."
    )
    parser.add_argument("--out-dir", required=True, help="Protected directory for the private key and public-key files")
    parser.add_argument("--bits", type=int, choices=(3072, 4096), default=3072)
    args = parser.parse_args()

    passphrase = getpass("Private-key encryption passphrase (minimum 16 chars): ")
    confirm = getpass("Repeat passphrase: ")
    if len(passphrase) < 16 or passphrase != confirm:
        parser.error("Passphrase must be at least 16 characters and both entries must match")

    out = Path(args.out_dir).expanduser().resolve()
    out.mkdir(mode=0o700, parents=True, exist_ok=True)
    try:
        os.chmod(out, 0o700)
    except OSError:
        pass

    private_key = rsa.generate_private_key(public_exponent=65537, key_size=args.bits)
    public_key = private_key.public_key()
    private_pem = private_key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.BestAvailableEncryption(passphrase.encode("utf-8")),
    )
    public_der = public_key.public_bytes(
        serialization.Encoding.DER,
        serialization.PublicFormat.SubjectPublicKeyInfo,
    )

    private_path = out / "recipient-private-encrypted.pem"
    public_path = out / "recipient-public.spki.der"
    base64_path = out / "recipient-public.spki.base64.txt"
    private_path.write_bytes(private_pem)
    public_path.write_bytes(public_der)
    base64_path.write_text(base64.b64encode(public_der).decode("ascii"), encoding="ascii")
    for path, mode in ((private_path, 0o600), (public_path, 0o644), (base64_path, 0o644)):
        try:
            os.chmod(path, mode)
        except OSError:
            pass

    print(f"Private key (encrypted): {private_path}")
    print(f"Public key DER:           {public_path}")
    print(f"Base64 SPKI for API:      {base64_path}")
    print("WARNING: back up the encrypted private key offline. Never upload or commit it.")


if __name__ == "__main__":
    main()
