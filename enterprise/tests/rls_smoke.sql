-- Run this file using the laporaman_runtime login after at least two tenants have reports.
-- Example: psql "$RUNTIME_DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/rls_smoke.sql

BEGIN;
SELECT set_config('app.current_tenant', 'sby', true);
SELECT set_config('app.current_opd', 'pu', true);
SELECT set_config('app.current_role', 'operator', true);
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM reports WHERE ticket_id = 'RLS-SBY-PU-0001') THEN
        RAISE EXCEPTION 'RLS fixture for the current tenant/OPD is missing';
    END IF;
    IF EXISTS (SELECT 1 FROM reports WHERE ticket_id IN ('RLS-SBY-HUB-0001', 'RLS-SDA-PU-0001')) THEN
        RAISE EXCEPTION 'RLS tenant/OPD isolation FAILED';
    END IF;
END $$;
ROLLBACK;

BEGIN;
SELECT set_config('app.current_tenant', '', true);
SELECT set_config('app.current_opd', '', true);
SELECT set_config('app.current_role', '', true);
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM reports) THEN
        RAISE EXCEPTION 'RLS default-deny FAILED: rows visible without context';
    END IF;
END $$;
ROLLBACK;

-- Audit mutations must fail due to missing grants and immutable trigger.
-- This last check expects permission denied for runtime role:
-- UPDATE audit_trails SET metadata='{}'::jsonb WHERE false;
