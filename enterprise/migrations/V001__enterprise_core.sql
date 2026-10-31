-- LaporAman enterprise baseline. Run with a schema-owner/migration role,
-- never with the runtime role. PostgreSQL 16+.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS tenants (
    id              varchar(32) PRIMARY KEY,
    name            varchar(160) NOT NULL,
    active          boolean NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agencies (
    tenant_id       varchar(32) NOT NULL REFERENCES tenants(id),
    id              varchar(32) NOT NULL,
    name            varchar(160) NOT NULL,
    sla_hours       integer NOT NULL DEFAULT 72 CHECK (sla_hours BETWEEN 1 AND 8760),
    active          boolean NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS recipient_keys (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       varchar(32) NOT NULL REFERENCES tenants(id),
    recipient_id    varchar(32) NOT NULL, -- 'triage' or an agency code
    key_version     integer NOT NULL CHECK (key_version > 0),
    public_key_spki bytea NOT NULL,
    active          boolean NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, recipient_id, key_version),
    UNIQUE (tenant_id, recipient_id, id)
);
CREATE INDEX IF NOT EXISTS ix_recipient_keys_active
    ON recipient_keys(tenant_id, recipient_id, active);

CREATE TABLE IF NOT EXISTS staff_users (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email           varchar(190) NOT NULL UNIQUE,
    display_name    varchar(120) NOT NULL,
    password_hash   text NOT NULL,
    tenant_id       varchar(32) NOT NULL REFERENCES tenants(id),
    -- NULL for tenant_admin / triage, agency code for operator.
    opd_id          varchar(32),
    role            varchar(24) NOT NULL CHECK (role IN ('operator', 'tenant_admin', 'triage')),
    active          boolean NOT NULL DEFAULT true,
    token_version   integer NOT NULL DEFAULT 0,
    created_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT fk_staff_agency FOREIGN KEY (tenant_id, opd_id)
        REFERENCES agencies(tenant_id, id),
    CONSTRAINT ck_staff_role_scope CHECK (
        (role = 'operator' AND opd_id IS NOT NULL) OR
        (role IN ('tenant_admin', 'triage') AND opd_id IS NULL)
    )
);
CREATE INDEX IF NOT EXISTS ix_staff_tenant_email ON staff_users(tenant_id, lower(email));

CREATE TABLE IF NOT EXISTS reports (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id       varchar(40) NOT NULL UNIQUE,
    tenant_id       varchar(32) NOT NULL REFERENCES tenants(id),
    opd_id          varchar(32),
    -- Sensitive fields: ciphertext only. AES-256-GCM tag is appended to ciphertext.
    encryption_alg  varchar(24) NOT NULL DEFAULT 'A256GCM'
                    CHECK (encryption_alg = 'A256GCM'),
    ciphertext      bytea NOT NULL CHECK (octet_length(ciphertext) >= 16),
    -- Per-recipient RSA-OAEP-wrapped DEK envelopes keyed by recipient_keys.id (UUID).
    -- Example: {"recipient-key-uuid":"base64 RSA-OAEP ciphertext"}.
    wrapped_deks    jsonb NOT NULL CHECK (jsonb_typeof(wrapped_deks) = 'object'),
    -- Owner's PBKDF2/AES-GCM-wrapped DEK; these are ciphertext/KDF parameters only.
    owner_kdf       varchar(32) NOT NULL DEFAULT 'PBKDF2-HMAC-SHA256'
                    CHECK (owner_kdf = 'PBKDF2-HMAC-SHA256'),
    owner_kdf_iterations integer NOT NULL CHECK (owner_kdf_iterations BETWEEN 100000 AND 2000000),
    owner_wrapped_dek bytea NOT NULL CHECK (octet_length(owner_wrapped_dek) = 48),
    owner_wrap_iv   bytea NOT NULL CHECK (octet_length(owner_wrap_iv) = 12),
    salt            bytea NOT NULL CHECK (octet_length(salt) = 16),
    iv              bytea NOT NULL CHECK (octet_length(iv) = 12),
    -- HMAC/hash of a random client-generated device token, NOT a hardware fingerprint.
    device_hash     char(64),
    anonymous       boolean NOT NULL DEFAULT true,
    status          varchar(24) NOT NULL DEFAULT 'Diterima'
                    CHECK (status IN ('Diterima', 'Terverifikasi', 'Diproses', 'Selesai')),
    sla_due_at      timestamptz NOT NULL,
    escalated       boolean NOT NULL DEFAULT false,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT fk_report_agency FOREIGN KEY (tenant_id, opd_id)
        REFERENCES agencies(tenant_id, id),
    CONSTRAINT ck_device_hash CHECK (device_hash IS NULL OR device_hash ~ '^[0-9a-f]{64}$')
);
CREATE INDEX IF NOT EXISTS ix_reports_tenant_opd_created
    ON reports(tenant_id, opd_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_reports_sla_due
    ON reports(tenant_id, sla_due_at) WHERE escalated = false AND status <> 'Selesai';

CREATE TABLE IF NOT EXISTS audit_trails (
    id              bigserial PRIMARY KEY,
    tenant_id       varchar(32) NOT NULL REFERENCES tenants(id),
    report_id       uuid REFERENCES reports(id),
    opd_id          varchar(32),
    event_type      varchar(48) NOT NULL,
    actor_id        uuid,
    actor_role      varchar(24) NOT NULL,
    -- Operational metadata only. Never put report plaintext, passphrases or keys here.
    metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT fk_audit_agency FOREIGN KEY (tenant_id, opd_id)
        REFERENCES agencies(tenant_id, id)
);
CREATE INDEX IF NOT EXISTS ix_audit_tenant_report_time
    ON audit_trails(tenant_id, report_id, created_at);

CREATE TABLE IF NOT EXISTS webhook_subscriptions (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       varchar(32) NOT NULL REFERENCES tenants(id),
    url             text NOT NULL CHECK (url LIKE 'https://%'),
    secret_ciphertext bytea NOT NULL,
    events          text[] NOT NULL,
    enabled         boolean NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_webhook_tenant_enabled
    ON webhook_subscriptions(tenant_id, enabled);

CREATE TABLE IF NOT EXISTS outbox_events (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       varchar(32) NOT NULL REFERENCES tenants(id),
    event_type      varchar(48) NOT NULL,
    payload         jsonb NOT NULL,
    attempts        integer NOT NULL DEFAULT 0,
    next_attempt_at timestamptz NOT NULL DEFAULT now(),
    delivered_at    timestamptz,
    last_error      varchar(300),
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_outbox_pending
    ON outbox_events(next_attempt_at, created_at)
    WHERE delivered_at IS NULL;

-- Append-only enforcement. The application role also receives no UPDATE/DELETE grants.
CREATE OR REPLACE FUNCTION reject_audit_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'audit_trails is append-only; % is forbidden', TG_OP
        USING ERRCODE = '55000';
END;
$$;
DROP TRIGGER IF EXISTS trg_audit_immutable ON audit_trails;
CREATE TRIGGER trg_audit_immutable
BEFORE UPDATE OR DELETE ON audit_trails
FOR EACH ROW EXECUTE FUNCTION reject_audit_mutation();

-- Context helpers. set_config(..., true) is transaction-local (the SQL equivalent
-- of SET LOCAL) and must be set on the same connection/transaction as the query.
CREATE OR REPLACE FUNCTION app_current_tenant() RETURNS text
LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('app.current_tenant', true), '') $$;
CREATE OR REPLACE FUNCTION app_current_opd() RETURNS text
LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('app.current_opd', true), '') $$;
CREATE OR REPLACE FUNCTION app_current_role() RETURNS text
LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('app.current_role', true), '') $$;
CREATE OR REPLACE FUNCTION app_current_ticket() RETURNS text
LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('app.current_ticket', true), '') $$;

-- Force RLS even for the table owner (superusers still bypass RLS; runtime must not be one).
ALTER TABLE recipient_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipient_keys FORCE ROW LEVEL SECURITY;
ALTER TABLE agencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE agencies FORCE ROW LEVEL SECURITY;
ALTER TABLE staff_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_users FORCE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_trails ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_trails FORCE ROW LEVEL SECURITY;
ALTER TABLE webhook_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_subscriptions FORCE ROW LEVEL SECURITY;
ALTER TABLE outbox_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox_events FORCE ROW LEVEL SECURITY;

-- Idempotent policy recreation.
DROP POLICY IF EXISTS agencies_tenant_read ON agencies;
CREATE POLICY agencies_tenant_read ON agencies FOR SELECT
USING (tenant_id = app_current_tenant() OR app_current_role() = 'system_worker');

DROP POLICY IF EXISTS recipient_keys_read ON recipient_keys;
CREATE POLICY recipient_keys_read ON recipient_keys FOR SELECT
USING (
    tenant_id = app_current_tenant()
    OR (tenant_id = NULLIF(current_setting('app.intake_tenant', true), '')
        AND app_current_role() = 'public_intake')
);
DROP POLICY IF EXISTS recipient_keys_admin_write ON recipient_keys;
CREATE POLICY recipient_keys_admin_write ON recipient_keys FOR INSERT
WITH CHECK (tenant_id = app_current_tenant() AND app_current_role() = 'tenant_admin');
DROP POLICY IF EXISTS recipient_keys_admin_update ON recipient_keys;
CREATE POLICY recipient_keys_admin_update ON recipient_keys FOR UPDATE
USING (tenant_id = app_current_tenant() AND app_current_role() = 'tenant_admin')
WITH CHECK (tenant_id = app_current_tenant() AND app_current_role() = 'tenant_admin');

DROP POLICY IF EXISTS staff_tenant_read ON staff_users;
CREATE POLICY staff_tenant_read ON staff_users FOR SELECT
USING (
    app_current_role() = 'auth_lookup'
    OR (tenant_id = app_current_tenant() AND app_current_role() IN ('tenant_admin', 'triage'))
);
DROP POLICY IF EXISTS staff_tenant_write ON staff_users;
CREATE POLICY staff_tenant_write ON staff_users FOR UPDATE
USING (tenant_id = app_current_tenant() AND app_current_role() = 'tenant_admin')
WITH CHECK (tenant_id = app_current_tenant());
DROP POLICY IF EXISTS staff_tenant_insert ON staff_users;
CREATE POLICY staff_tenant_insert ON staff_users FOR INSERT
WITH CHECK (tenant_id = app_current_tenant() AND app_current_role() = 'tenant_admin');

DROP POLICY IF EXISTS reports_staff_select ON reports;
CREATE POLICY reports_staff_select ON reports FOR SELECT
USING (
    tenant_id = app_current_tenant()
    AND (
        app_current_role() IN ('tenant_admin', 'triage', 'system_worker')
        OR (app_current_role() = 'operator' AND opd_id = app_current_opd())
    )
);
DROP POLICY IF EXISTS reports_public_tracker_read ON reports;
CREATE POLICY reports_public_tracker_read ON reports FOR SELECT
USING (tenant_id = app_current_tenant() AND app_current_role() = 'public_tracker' AND ticket_id = app_current_ticket());

DROP POLICY IF EXISTS reports_public_insert ON reports;
CREATE POLICY reports_public_insert ON reports FOR INSERT
WITH CHECK (
    tenant_id = NULLIF(current_setting('app.intake_tenant', true), '')
    AND app_current_role() = 'public_intake'
    AND opd_id IS NULL
);
DROP POLICY IF EXISTS reports_staff_update ON reports;
CREATE POLICY reports_staff_update ON reports FOR UPDATE
USING (
    tenant_id = app_current_tenant()
    AND (
        app_current_role() IN ('tenant_admin', 'triage', 'system_worker')
        OR (app_current_role() = 'operator' AND opd_id = app_current_opd())
    )
)
WITH CHECK (
    tenant_id = app_current_tenant()
    AND (
        app_current_role() IN ('tenant_admin', 'triage', 'system_worker')
        OR (app_current_role() = 'operator' AND opd_id = app_current_opd())
    )
);

DROP POLICY IF EXISTS audit_tenant_select ON audit_trails;
CREATE POLICY audit_tenant_select ON audit_trails FOR SELECT
USING (
    tenant_id = app_current_tenant()
    AND (
        app_current_role() IN ('tenant_admin', 'triage', 'system_worker')
        OR (app_current_role() = 'operator' AND opd_id = app_current_opd())
    )
);
DROP POLICY IF EXISTS audit_scoped_insert ON audit_trails;
CREATE POLICY audit_scoped_insert ON audit_trails FOR INSERT
WITH CHECK (
    (tenant_id = app_current_tenant() AND (
        app_current_role() IN ('tenant_admin', 'triage', 'system_worker')
        OR (app_current_role() = 'operator' AND opd_id = app_current_opd())
    ))
    OR (tenant_id = NULLIF(current_setting('app.intake_tenant', true), '')
        AND app_current_role() = 'public_intake' AND opd_id IS NULL)
);

DROP POLICY IF EXISTS webhook_tenant_access ON webhook_subscriptions;
CREATE POLICY webhook_tenant_access ON webhook_subscriptions FOR ALL
USING (tenant_id = app_current_tenant() AND app_current_role() IN ('tenant_admin', 'system_worker'))
WITH CHECK (tenant_id = app_current_tenant() AND app_current_role() IN ('tenant_admin', 'system_worker'));

DROP POLICY IF EXISTS outbox_worker_access ON outbox_events;
CREATE POLICY outbox_worker_access ON outbox_events FOR ALL
USING (tenant_id = app_current_tenant() AND app_current_role() IN ('system_worker', 'tenant_admin'))
WITH CHECK (tenant_id = app_current_tenant() AND app_current_role() IN ('system_worker', 'tenant_admin'));
DROP POLICY IF EXISTS outbox_public_insert ON outbox_events;
CREATE POLICY outbox_public_insert ON outbox_events FOR INSERT
WITH CHECK (tenant_id = NULLIF(current_setting('app.intake_tenant', true), '') AND app_current_role() = 'public_intake');

-- Runtime is intentionally NOSUPERUSER, NOBYPASSRLS, and not the table owner.
GRANT CONNECT ON DATABASE laporaman TO laporaman_runtime;
GRANT USAGE ON SCHEMA public TO laporaman_runtime;
GRANT SELECT ON tenants TO laporaman_runtime;
GRANT SELECT ON agencies TO laporaman_runtime;
GRANT SELECT, INSERT, UPDATE ON recipient_keys TO laporaman_runtime;
GRANT SELECT, INSERT, UPDATE ON reports TO laporaman_runtime;
GRANT SELECT, INSERT ON audit_trails TO laporaman_runtime;
GRANT SELECT, INSERT, UPDATE ON staff_users TO laporaman_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON webhook_subscriptions TO laporaman_runtime;
GRANT SELECT, INSERT, UPDATE ON outbox_events TO laporaman_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO laporaman_runtime;

-- Demo tenant/agency catalog only; no demo login/password is inserted here.
INSERT INTO tenants(id, name) VALUES
    ('sby', 'Kota Surabaya'),
    ('sda', 'Kabupaten Sidoarjo')
ON CONFLICT (id) DO NOTHING;

INSERT INTO agencies(tenant_id, id, name, sla_hours) VALUES
    ('sby', 'pu', 'Dinas Pekerjaan Umum', 72),
    ('sby', 'hub', 'Dinas Perhubungan', 48),
    ('sby', 'dlh', 'Dinas Lingkungan Hidup', 48),
    ('sby', 'kes', 'Dinas Kesehatan', 24),
    ('sby', 'duk', 'Dinas Kependudukan', 96),
    ('sby', 'sos', 'Dinas Sosial', 24),
    ('sby', 'ins', 'Inspektorat', 72),
    ('sby', 'pen', 'Dinas Penerangan Jalan', 48),
    ('sda', 'pu', 'Dinas Pekerjaan Umum', 72),
    ('sda', 'hub', 'Dinas Perhubungan', 48),
    ('sda', 'dlh', 'Dinas Lingkungan Hidup', 48),
    ('sda', 'kes', 'Dinas Kesehatan', 24),
    ('sda', 'duk', 'Dinas Kependudukan', 96),
    ('sda', 'sos', 'Dinas Sosial', 24),
    ('sda', 'ins', 'Inspektorat', 72),
    ('sda', 'pen', 'Dinas Penerangan Jalan', 48)
ON CONFLICT (tenant_id, id) DO NOTHING;
