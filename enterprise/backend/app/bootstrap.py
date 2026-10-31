from __future__ import annotations

import argparse
import os
from sqlalchemy import create_engine, text
from .security import hash_password


def main():
    parser = argparse.ArgumentParser(description="Create the first LaporAman operator/admin account")
    parser.add_argument("--email", required=True)
    parser.add_argument("--name", required=True)
    parser.add_argument("--tenant", required=True, help="Tenant code, e.g. sby")
    parser.add_argument("--opd", default="", help="Agency code for operator; leave empty for tenant_admin/triage")
    parser.add_argument("--role", choices=["operator", "tenant_admin", "triage"], default="tenant_admin")
    parser.add_argument("--password", required=True, help="Use a temporary value; rotate after first login")
    args = parser.parse_args()
    if len(args.password) < 12:
        parser.error("password minimum 12 characters")
    if args.role == "operator" and not args.opd:
        parser.error("operator requires --opd")
    if args.role != "operator" and args.opd:
        parser.error("tenant_admin/triage must not specify --opd")

    admin_url = os.getenv("ADMIN_DATABASE_URL")
    if not admin_url:
        raise SystemExit("Set ADMIN_DATABASE_URL to the controlled migration/admin connection")
    engine = create_engine(admin_url, pool_pre_ping=True)
    with engine.begin() as conn:
        exists = conn.execute(text("SELECT 1 FROM tenants WHERE id=:tenant AND active=true"), {"tenant": args.tenant}).first()
        if not exists:
            raise SystemExit("Unknown or inactive tenant")
        if args.role == "operator":
            agency = conn.execute(
                text("SELECT 1 FROM agencies WHERE tenant_id=:tenant AND id=:opd AND active=true"),
                {"tenant": args.tenant, "opd": args.opd},
            ).first()
            if not agency:
                raise SystemExit("Unknown agency in tenant")
        conn.execute(
            text("""
                INSERT INTO staff_users(email,display_name,password_hash,tenant_id,opd_id,role)
                VALUES (lower(:email),:name,:password_hash,:tenant,:opd,:role)
            """),
            {"email": args.email, "name": args.name, "password_hash": hash_password(args.password),
             "tenant": args.tenant, "opd": args.opd or None, "role": args.role},
        )
    print(f"Created {args.role} account {args.email} for {args.tenant}; remove bootstrap access after setup.")


if __name__ == "__main__":
    main()
