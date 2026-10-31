from __future__ import annotations

import os
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from .models import Base


def build_engine(url: str, *, pool_pre_ping: bool = True):
    kwargs = {"pool_pre_ping": pool_pre_ping, "future": True}
    if url.startswith("sqlite"):
        kwargs["connect_args"] = {"check_same_thread": False}
        if url in ("sqlite://", "sqlite:///:memory:"):
            kwargs["poolclass"] = StaticPool
    return create_engine(url, **kwargs)


def build_session_factory(engine):
    return sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False, future=True)


def initialize_database(admin_engine, runtime_engine) -> None:
    # DDL is performed with the migration/admin connection, never with the runtime role.
    Base.metadata.create_all(bind=admin_engine)
    # Small forward-only compatibility migration for databases created by an earlier
    # LaporAman prototype. Use Alembic before maintaining a long-lived production schema.
    columns = {column["name"] for column in inspect(admin_engine).get_columns("staff_users")}
    if "token_version" not in columns:
        with admin_engine.begin() as connection:
            connection.execute(text("ALTER TABLE staff_users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0"))
    if runtime_engine.dialect.name != "postgresql":
        return

    statements = [
        "ALTER TABLE reports ENABLE ROW LEVEL SECURITY",
        "ALTER TABLE reports FORCE ROW LEVEL SECURITY",
        "ALTER TABLE report_events ENABLE ROW LEVEL SECURITY",
        "ALTER TABLE report_events FORCE ROW LEVEL SECURITY",
        "ALTER TABLE webhook_subscriptions ENABLE ROW LEVEL SECURITY",
        "ALTER TABLE webhook_subscriptions FORCE ROW LEVEL SECURITY",
        "DROP POLICY IF EXISTS reports_staff_select ON reports",
        "DROP POLICY IF EXISTS reports_public_select ON reports",
        "DROP POLICY IF EXISTS reports_public_insert ON reports",
        "DROP POLICY IF EXISTS reports_staff_update ON reports",
        "CREATE POLICY reports_staff_select ON reports FOR SELECT USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '') AND (NULLIF(current_setting('app.opd_id', true), '') = 'all' OR (review_required = false AND opd_ids_json::jsonb @> jsonb_build_array(NULLIF(current_setting('app.opd_id', true), '')))))",
        "CREATE POLICY reports_public_select ON reports FOR SELECT USING (ticket_id = NULLIF(current_setting('app.public_ticket', true), ''))",
        "CREATE POLICY reports_public_insert ON reports FOR INSERT WITH CHECK (tenant_id = NULLIF(current_setting('app.insert_tenant', true), ''))",
        "CREATE POLICY reports_staff_update ON reports FOR UPDATE USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '') AND (NULLIF(current_setting('app.opd_id', true), '') = 'all' OR (review_required = false AND opd_ids_json::jsonb @> jsonb_build_array(NULLIF(current_setting('app.opd_id', true), ''))))) WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '') AND (NULLIF(current_setting('app.opd_id', true), '') = 'all' OR (review_required = false AND opd_ids_json::jsonb @> jsonb_build_array(NULLIF(current_setting('app.opd_id', true), '')))))",
        "DROP POLICY IF EXISTS events_staff_select ON report_events",
        "DROP POLICY IF EXISTS events_public_select ON report_events",
        "DROP POLICY IF EXISTS events_insert_scoped ON report_events",
        "CREATE POLICY events_staff_select ON report_events FOR SELECT USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '') AND (NULLIF(current_setting('app.opd_id', true), '') = 'all' OR EXISTS (SELECT 1 FROM reports r WHERE r.id = report_events.report_id AND r.tenant_id = report_events.tenant_id AND r.review_required = false AND r.opd_ids_json::jsonb @> jsonb_build_array(NULLIF(current_setting('app.opd_id', true), '')))))",
        "CREATE POLICY events_public_select ON report_events FOR SELECT USING (ticket_id = NULLIF(current_setting('app.public_ticket', true), ''))",
        "CREATE POLICY events_insert_scoped ON report_events FOR INSERT WITH CHECK (tenant_id = NULLIF(current_setting('app.insert_tenant', true), '') OR tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))",
        "DROP POLICY IF EXISTS webhooks_tenant_select ON webhook_subscriptions",
        "DROP POLICY IF EXISTS webhooks_tenant_insert ON webhook_subscriptions",
        "CREATE POLICY webhooks_tenant_select ON webhook_subscriptions FOR SELECT USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))",
        "CREATE POLICY webhooks_tenant_insert ON webhook_subscriptions FOR INSERT WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))",
        "GRANT SELECT, INSERT, UPDATE ON reports TO laporaman_app",
        "GRANT SELECT, UPDATE ON tenants TO laporaman_app",
        "GRANT SELECT, INSERT, UPDATE ON staff_users TO laporaman_app",
        "GRANT SELECT, INSERT ON report_events, webhook_subscriptions TO laporaman_app",
        "GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO laporaman_app",
    ]
    with admin_engine.begin() as connection:
        for statement in statements:
            connection.execute(text(statement))


def set_local_context(session, **settings: str) -> None:
    if session.bind.dialect.name != "postgresql":
        return
    allowed = {"tenant_id", "opd_id", "insert_tenant", "public_ticket"}
    for name, value in settings.items():
        if name not in allowed:
            raise ValueError("Invalid RLS context key")
        session.execute(
            text("SELECT set_config(:name, :value, true)"),
            {"name": f"app.{name}", "value": str(value or "")},
        )
