-- DEVELOPMENT ONLY. Run with laporaman_admin after V001 migration.
-- The fixture values are dummy ciphertext-shaped bytes; no actual citizen data.
INSERT INTO reports (
    ticket_id, tenant_id, opd_id, encryption_alg, ciphertext, wrapped_deks,
    owner_kdf_iterations, owner_wrapped_dek, owner_wrap_iv, salt, iv, sla_due_at
) VALUES
    ('RLS-SBY-PU-0001', 'sby', 'pu', 'A256GCM', decode(repeat('11', 32), 'hex'), '{}'::jsonb,
     310000, decode(repeat('22', 48), 'hex'), decode(repeat('33', 12), 'hex'),
     decode(repeat('44', 16), 'hex'), decode(repeat('55', 12), 'hex'), now() + interval '1 day'),
    ('RLS-SBY-HUB-0001', 'sby', 'hub', 'A256GCM', decode(repeat('11', 32), 'hex'), '{}'::jsonb,
     310000, decode(repeat('22', 48), 'hex'), decode(repeat('33', 12), 'hex'),
     decode(repeat('44', 16), 'hex'), decode(repeat('55', 12), 'hex'), now() + interval '1 day'),
    ('RLS-SDA-PU-0001', 'sda', 'pu', 'A256GCM', decode(repeat('11', 32), 'hex'), '{}'::jsonb,
     310000, decode(repeat('22', 48), 'hex'), decode(repeat('33', 12), 'hex'),
     decode(repeat('44', 16), 'hex'), decode(repeat('55', 12), 'hex'), now() + interval '1 day')
ON CONFLICT (ticket_id) DO NOTHING;
