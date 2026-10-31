from __future__ import annotations

import os
from collections.abc import Generator
from sqlalchemy import create_engine, text
from sqlalchemy.pool import QueuePool
from sqlalchemy.orm import Session, sessionmaker

DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL harus diatur melalui environment sebelum database digunakan.")
engine = create_engine(DATABASE_URL, poolclass=QueuePool, pool_pre_ping=True, pool_size=10, max_overflow=20)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False, class_=Session)


def set_rls_context(
    db: Session,
    *,
    tenant: str = "",
    opd: str = "",
    role: str = "",
    intake_tenant: str = "",
    auth_lookup: bool = False,
    ticket: str = "",
) -> None:
    """Equivalent to SET LOCAL; values apply only to the current transaction."""
    values = {
        "app.current_tenant": tenant,
        "app.current_opd": opd,
        "app.current_role": "auth_lookup" if auth_lookup else role,
        "app.intake_tenant": intake_tenant,
        "app.current_ticket": ticket,
    }
    for setting, value in values.items():
        db.execute(
            text("SELECT set_config(:setting, :value, true)"),
            {"setting": setting, "value": value or ""},
        )


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
