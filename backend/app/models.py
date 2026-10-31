from __future__ import annotations

from datetime import datetime, timezone
from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Base(DeclarativeBase):
    pass


class Tenant(Base):
    __tablename__ = "tenants"

    id: Mapped[str] = mapped_column(String(16), primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    public_key_spki: Mapped[str | None] = mapped_column(Text, nullable=True)
    private_key_envelope_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    key_created_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    users: Mapped[list["StaffUser"]] = relationship(back_populates="tenant")


class StaffUser(Base):
    __tablename__ = "staff_users"
    __table_args__ = (UniqueConstraint("email", name="uq_staff_email"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    email: Mapped[str] = mapped_column(String(190), nullable=False, index=True)
    display_name: Mapped[str] = mapped_column(String(120), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(300), nullable=False)
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), nullable=False, index=True)
    opd_id: Mapped[str] = mapped_column(String(16), nullable=False, default="all")
    role: Mapped[str] = mapped_column(String(24), nullable=False, default="operator")
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    token_version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow)
    tenant: Mapped[Tenant] = relationship(back_populates="users")


class Report(Base):
    __tablename__ = "reports"
    __table_args__ = (
        Index("ix_reports_tenant_created", "tenant_id", "created_at"),
        Index("ix_reports_tenant_due", "tenant_id", "due_at", "status"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    ticket_id: Mapped[str] = mapped_column(String(32), unique=True, nullable=False, index=True)
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), nullable=False, index=True)
    opd_ids_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    labels_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    confidence: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    ai_engine: Mapped[str] = mapped_column(String(80), nullable=False, default="local-keyword-demo")
    review_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    anonymous: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="Diterima")
    due_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    escalated: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # vault_json and staff_envelope only contain authenticated ciphertext.
    vault_json: Mapped[str] = mapped_column(Text, nullable=False)
    staff_envelope: Mapped[str] = mapped_column(Text, nullable=False)
    csat: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow, onupdate=utcnow)
    events: Mapped[list["ReportEvent"]] = relationship(
        back_populates="report", cascade="all, delete-orphan", order_by="ReportEvent.created_at"
    )


class ReportEvent(Base):
    __tablename__ = "report_events"
    __table_args__ = (Index("ix_events_report_created", "report_id", "created_at"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    report_id: Mapped[str] = mapped_column(ForeignKey("reports.id", ondelete="CASCADE"), nullable=False, index=True)
    ticket_id: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    tenant_id: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    event_type: Mapped[str] = mapped_column(String(48), nullable=False)
    message: Mapped[str] = mapped_column(String(500), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    actor_name: Mapped[str] = mapped_column(String(120), nullable=False)
    actor_role: Mapped[str] = mapped_column(String(32), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow)
    report: Mapped[Report] = relationship(back_populates="events")


class WebhookSubscription(Base):
    __tablename__ = "webhook_subscriptions"
    __table_args__ = (Index("ix_webhooks_tenant", "tenant_id", "enabled"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    url: Mapped[str] = mapped_column(String(1000), nullable=False)
    secret_ciphertext: Mapped[str] = mapped_column(Text, nullable=False)
    events_json: Mapped[str] = mapped_column(Text, nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow)
