# Validation report — LaporAman Enterprise overlay

This report distinguishes automated checks from environment-dependent integration checks.

## Checks completed in the authoring environment

- `python -m compileall -q backend ai_service tests` — passed.
- `python -m pytest -q tests` — 8 tests passed.
- `node --test tests/crypto-v2.test.mjs` — 1 test passed; RSA-3072 recipient and owner envelope round-trip succeeded.
- Python OpenAPI contract test confirms `openapi: 3.1.0`.
- JSON/YAML parsing passed for `gateway/krakend.json`, `compose.yml`, and `compose.dev.yml`.
- Static route check confirmed all 16 configured KrakenD routes have IP-based per-route rate settings (`8` tokens per `10s`, bucket capacity `1`).
- Static Compose check confirmed the database and core API do not publish host ports in the production compose file; the Gateway is the only published ingress.
- Password hash/verify, RS256 token creation/validation, ciphertext-only DTO rejection, and browser encryption round-trip are covered by automated tests.

## Not executed / required on a Docker + PostgreSQL host

The authoring runtime did not have Docker Engine/Compose or `psql` available. Therefore this package has **not** been launched as a live stack here, and no claim is made that the Flyway migration, real PostgreSQL RLS policies, KrakenD runtime parsing, or cross-container networking have passed integration testing. Run the Docker Compose and `tests/rls_smoke.sql` procedure in `README.md` before using this in a demo or pilot.

## Known production hardening gates

- The baseline RLS policies use transaction-local PostgreSQL custom settings. This prevents accidental unscoped queries but is not a cryptographic boundary against an attacker able to execute arbitrary SQL with the runtime credential. Harden the scope context before production (see `docs/SECURITY_AND_COMPLIANCE.md`).
- Strict E2EE and server-side plaintext AI/ASR are separate processing modes; the AI service is opt-in and not zero-knowledge.
- The existing prototype frontend is not yet wired to the new `/api/v2` routes. Follow `docs/FRONTEND_MIGRATION.md`.
- Recipient private-key lifecycle, MFA/SSO, shared rate limiting for multi-gateway deployments, production egress firewalling, independent security review, and legal/SPBE governance remain deployment tasks.
