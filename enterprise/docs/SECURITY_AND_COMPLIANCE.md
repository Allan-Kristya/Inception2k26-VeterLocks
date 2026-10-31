# Security boundary, operational controls, UU PDP and SPBE

## What this reference stack does

- PostgreSQL RLS with `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY` for agencies, staff, reports, audit records, webhook subscriptions and the transactional outbox.
- A non-superuser/non-owner runtime role with `NOBYPASSRLS` and least-privilege table grants.
- Tenant and OPD scope are derived from a verified, short-lived RS256 access JWT and set transaction-locally on the same SQLAlchemy session with `set_config(..., true)` (`SET LOCAL` semantics). Access-token verification is stateless on each request; role/account revocation takes effect after the short token expiry. Immediate revocation needs a deny-list/introspection extension.
- The report API accepts encrypted payload blobs only. DTO `extra="forbid"` rejects plaintext/passphrase/key fields. The server receives neither the AES passphrase nor an unwrapped DEK/private key.
- Audit records are insert-only for the runtime database role and have a trigger that rejects UPDATE/DELETE.
- SLA updates and event-outbox insertion happen in the same database transaction. Worker concurrency uses `FOR UPDATE SKIP LOCKED`.
- Webhook delivery is at-least-once, HMAC-signed and metadata-only. It must be idempotent at the receiver.
- The AI container runs on a private network, loads local model artifacts and disables model downloads. ASR files are held temporarily in process/tmpfs storage and not persisted to the database.

## Important RLS trust boundary

The policy uses transaction-local custom PostgreSQL settings (`app.current_tenant`, `app.current_opd`, `app.current_role`). This is a strong guard against omitted tenant filters and ordinary API programming errors, but custom GUC values are settable by a client holding the database runtime credentials. Therefore **this baseline does not protect against an attacker who has stolen the runtime DB credential or can execute arbitrary SQL as `laporaman_runtime`**. The runtime credential and SQL execution surface remain trusted.

Before production, select one stronger hardening pattern:

1. Bind tenant/agency database identities to separate PostgreSQL roles and grant each application connection only its authorized role; or
2. Add a DB-side verified signed-context mechanism (for example, an HMAC-authenticated scope envelope checked by a `SECURITY DEFINER` function with a secret inaccessible to the runtime role), then ensure policies call the verifier rather than trusting raw GUC values; and
3. Revoke unnecessary privileges, test connection pool reset behavior, prohibit SQL string construction, and perform SQL-injection testing.

Never expose the PostgreSQL port publicly. Do not connect migrations/admin tasks using the runtime role, and never run the API as a superuser/table owner. A superuser can bypass RLS.

## Zero-Knowledge and encryption limitations

- AES-256-GCM uses a fresh 96-bit IV/nonce per encryption key; never reuse an IV with the same key. The 16-byte salt is random and is used by the browser's key-wrapping KDF. The `wrapped_deks` field stores one RSA-OAEP envelope per recipient-key UUID; each value is ciphertext for the authorized recipient key; it does not contain plaintext key material.
- The API validates payload shape and binary lengths, not the cryptographic correctness of client encryption. It cannot verify an AES-GCM tag or assert that the client used a strong passphrase without receiving the key. Those checks happen when the authorized client decrypts.
- The API implements tenant-admin public-key enrollment and versioned rotation for `triage` and each OPD. It does not custody private keys and does not implement private-key recovery/escrow, multi-party approval, certificate attestation or automated re-wrapping of old reports. Do not use it with real users until those lifecycle controls are designed, reviewed and tested. Keys need offline encrypted backup, dual control, revocation and re-encryption/rewrapping plans.
- A browser-delivered client is part of the trusted computing base. Compromised JavaScript/static hosting or supply-chain releases can exfiltrate plaintext before encryption. Use CSP, signed/reproducible releases, dependency pinning, SRI where feasible, two-person release review and independent penetration testing.
- Device identifiers can become pseudonymous personal data. This implementation accepts a 64-character one-way hash, but the client should derive it from a random per-installation secret, not hardware/browser fingerprinting. Rotate it and apply a retention limit.
- Strict E2EE cannot coexist with server-side plaintext NLP/ASR. The `/triage` and `/asr/transcribe-and-triage` endpoints are an explicitly separate opt-in processing path. They receive plaintext/audio in the internal inference service. They must not be described as zero-knowledge. Prefer on-device NLP/ASR when strict E2EE is required.

## UU Pelindungan Data Pribadi (UU 27/2022)

This code is a technical control reference, not a legal-compliance certification. Before a pilot, the local-government data controller and each processor/vendor must complete at least:

- Establish and document the controller/processor roles, processing purposes, lawful basis for each purpose, data categories, recipients, processing locations and retention periods. Consent is not the only lawful basis; select the one applicable under Article 20 and document it.
- Provide an intelligible privacy notice; explain anonymous-report limitations, metadata retained, AI/ASR opt-in processing, recipients, retention/deletion, complaint/contact channels and data-subject rights.
- For public-service processing and other statutory conditions, appoint a personal-data protection officer/function and define escalation/accountability (Article 53).
- Establish a breach-response process that can assess impact and deliver the statutory written notice within 3 x 24 hours where Article 46 applies.
- Put written instructions, confidentiality, security, audit, deletion/return, subprocessors and incident-notice duties in data-processing agreements. Obtain the controller's required written approval before engaging another processor/subprocessor (Article 51).
- Perform a DPIA/high-risk processing assessment where required; define retention schedules, legal holds, backup expiry, deletion verification, access reviews and records of processing.
- Treat the anonymous device hash, tenant/OPD metadata, IP/network logs, audio files and webhook destinations as data requiring their own minimization and retention decision. Anonymous user content may still identify a person indirectly.
- Review cross-border transfers/provider hosting and the government institution's classification/residency obligations before sending any data outside the approved environment.

Relevant official text: UU 27/2022 in JDIH Komdigi, particularly Articles 20, 46, 51 and 53: https://jdih.komdigi.go.id/produk_hukum/view/id/832/t/undangundang%20nomor%2027%20tahun%202022

## SPBE and interoperability

Perpres 95/2018 establishes the SPBE framework. This reference implementation provides technical building blocks (API gateway, OpenAPI 3.1, scoped access, event contracts and audit logs), but does **not** itself establish SPBE compliance, system registration, security assessment, interoperability certification or approval to connect to any government platform.

Before connecting to an external Smart City/SPBE platform, agree the API/data contract, service owner, identity trust, TLS/mTLS, network zones, schema versioning, data classification, audit obligations, data minimization, retry/idempotency, service levels and operational support. Use a formal interface agreement and test against the receiving agency's sandbox.

Official Perpres 95/2018 status/details: https://peraturan.bpk.go.id/Details/96913/perpres-no-95-tahun-2018.html

## Gateway rate limit semantics

Each protected route is configured with KrakenD `client_max_rate: 8`, `every: "10s"`, `strategy: "ip"` and `client_capacity: 1`. KrakenD's limiter is token-bucket based; capacity 1 removes the initial burst and smooths the effective rate to at most approximately 8 requests per 10 seconds per IP/route. This is stricter than permitting 8 requests as an immediate burst.

KrakenD Community Edition stores these counters in memory per gateway instance. A multi-replica deployment needs a shared/distributed limiter or an upstream WAF/reverse proxy with centrally coordinated counters; otherwise each gateway instance can grant its own quota. When behind a load balancer, configure trusted client-IP forwarding at the edge and prevent clients from spoofing it.

## Air-gap / egress boundary

- `core` is an internal Docker network; DB, core API, worker and AI have no published service ports. KrakenD is attached to the edge and core networks.
- AI/ASR images do not download model weights at runtime. Build the image and model artifact bundle in a controlled connected environment, scan/sign them, then transfer the image and model bundle into the air-gapped environment.
- The worker is intentionally attached to a separate egress bridge for webhooks. A Docker bridge is not a complete egress firewall. Production must route this traffic through an allowlisting proxy/firewall and block all other outbound destinations.
- No ElevenLabs/hosted ASR integration is enabled. Enabling it changes the data-processing boundary and requires legal/procurement/security review and written authorization.

## Mandatory production gate

Threat model, DPIA/legal sign-off, independent cryptographic review, penetration test, RLS integration test on PostgreSQL using the runtime role, API/gateway fuzzing, load test, database restore drill, incident exercise, key recovery/rotation rehearsal, vulnerability scanning, SBOM and signed-image verification are all required before processing genuine citizen complaints.
