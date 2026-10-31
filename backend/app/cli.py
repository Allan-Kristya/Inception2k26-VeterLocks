from __future__ import annotations

import argparse
import os
import re
from getpass import getpass
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from .database import build_engine
from .models import Base, StaffUser, Tenant
from .security import hash_password

TENANTS = {"sby": "Kota Surabaya", "sda": "Kabupaten Sidoarjo"}


def create_admin(args: argparse.Namespace) -> None:
    if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", args.email):
        raise SystemExit("Format email tidak valid.")
    password = getpass("Password administrator (minimal 14 karakter): ")
    confirm = getpass("Ulangi password: ")
    if len(password) < 14 or password != confirm:
        raise SystemExit("Password terlalu pendek atau konfirmasi tidak cocok.")
    url = os.getenv("ADMIN_DATABASE_URL") or os.getenv("DATABASE_URL")
    if not url:
        raise SystemExit("ADMIN_DATABASE_URL atau DATABASE_URL harus diatur.")
    engine = build_engine(url)
    Base.metadata.create_all(bind=engine)
    with Session(engine) as db:
        tenant = db.get(Tenant, args.tenant)
        if not tenant:
            tenant = Tenant(id=args.tenant, name=TENANTS[args.tenant])
            db.add(tenant)
        email = args.email.lower()
        if db.scalar(select(StaffUser).where(StaffUser.email == email)):
            raise SystemExit("Email sudah terdaftar.")
        db.add(StaffUser(
            id=str(uuid4()), email=email, display_name=args.name,
            password_hash=hash_password(password), tenant_id=args.tenant,
            opd_id="all", role="admin", active=True, token_version=0,
        ))
        db.commit()
    engine.dispose()
    print(f"Administrator {email} berhasil dibuat untuk {TENANTS[args.tenant]}.")


def main() -> None:
    parser = argparse.ArgumentParser(description="LaporAman administrative CLI")
    sub = parser.add_subparsers(dest="command", required=True)
    create = sub.add_parser("create-admin", help="Buat akun administrator tenant pertama")
    create.add_argument("--email", required=True)
    create.add_argument("--name", required=True)
    create.add_argument("--tenant", choices=sorted(TENANTS), required=True)
    args = parser.parse_args()
    if args.command == "create-admin":
        create_admin(args)

if __name__ == "__main__":
    main()
