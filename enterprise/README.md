# LaporAman Enterprise Reference Stack

This directory adds an enterprise-oriented backend track to the uploaded LaporAman full-stack prototype. It is intentionally isolated from the existing `/backend` prototype so the current hackathon application remains runnable while the new architecture is validated.

## Architecture choice

Use a **modular FastAPI core + independently deployable AI/ASR inference service + background worker**. PostgreSQL remains the source of truth. The gateway is the only published API ingress. `core` is an internal Docker network; database and service ports are not published. The webhook worker has a separate egress network because it must deliver approved events to Smart City endpoints.

```text
Public browser / operator UI
          |
      HTTPS / WAF
          |
     KrakenD :8080  ---- local RS256 JWKS validation, route limit
          |
  +-------+------------------------------+
  | internal Docker network (core)       |
  |                                      |
  | FastAPI core ---- PostgreSQL 16      |
  |      |          RLS + append-only    |
  |      |          audit + outbox       |
  |      +---- AI / ASR (opt-in only)    |
  |                                      |
  | SLA + outbox worker -----------------+---- controlled egress
  +--------------------------------------+
```

## Folder structure

```text
enterprise/
├── compose.yml
├── .env.enterprise.example
├── migrations/V001__enterprise_core.sql
├── postgres/init-roles.sh
├── backend/
│   ├── app/{main,db,schemas,security,worker,bootstrap}.py
│   ├── scripts/{generate_keys,generate_recipient_keypair}.py
│   ├── Dockerfile
│   └── requirements.txt
├── ai_service/{main.py,requirements*.txt,Dockerfile}
├── gateway/krakend.json
├── client/crypto-v2.mjs
├── docs/FRONTEND_MIGRATION.md
├── models/{indobertweet,whisper-large-v3}/
├── tests/{test_enterprise_contract.py,crypto-v2.test.mjs,seed_rls_fixtures.sql,rls_smoke.sql}
├── compose.dev.yml
└── docs/SECURITY_AND_COMPLIANCE.md
```

## 1. Configure secrets

Run from this directory:

```bash
cp .env.enterprise.example .env
bash scripts/generate-secrets.sh  # copy the generated password/token/key values into .env
```

Replace all passwords and tokens with generated random values. Generate a Fernet-compatible webhook key using Python (with `cryptography` installed):

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Set that output as `WEBHOOK_ENCRYPTION_KEY`. Set `AI_LABEL_MAP_JSON` to a JSON object mapping the model's numeric output indices to agency codes, e.g. `{"0":"pu","1":"hub","2":"dlh"}`. Keep `WEBHOOK_ALLOWED_HOSTS` empty until an approved HTTPS recipient is available; an empty allowlist blocks all webhook deliveries.

The JWT key pair is generated once in the named Docker volume `jwt_keys`. The private key is mounted read-only by the API, and the public JWKS is mounted read-only by KrakenD. Do not delete this volume in production. For production, inject an externally managed signing key through Docker/Kubernetes secrets or an HSM/KMS and implement a key-rotation overlap period; the local key generator is only for development.

## 2. Start the stack

Docker Engine and Docker Compose v2 are required. No service needs a published database/API port; only the gateway is exposed on localhost port 8080 by default.

```bash
docker compose --env-file .env up --build -d
```

Verify:

```bash
curl http://127.0.0.1:8080/api/health
```

Expected response includes `status: ok` and `openapi: 3.1.0`.

Open the API contract at:

- `http://127.0.0.1:8080/docs`
- `http://127.0.0.1:8080/openapi.json`

## 3. Bootstrap tenant administrators and operator accounts

The bootstrap container is a one-shot profile. It receives the privileged DB URL only during this manual command; it is not part of the normal API runtime.

Create Surabaya tenant administrator:

```bash
docker compose --env-file .env --profile bootstrap run --rm bootstrap \
  --email admin.sby@example.go.id --name "Admin Surabaya" \
  --tenant sby --role tenant_admin --password 'REPLACE_WITH_TEMPORARY_PASSWORD'
```

Create a Dinas PU operator:

```bash
docker compose --env-file .env --profile bootstrap run --rm bootstrap \
  --email operator.pu@example.go.id --name "Operator PU" \
  --tenant sby --opd pu --role operator --password 'REPLACE_WITH_TEMPORARY_PASSWORD'
```

Create a separate Sidoarjo administrator/operator with `--tenant sda`. Change temporary passwords through an identity-management workflow before a real deployment; MFA/SSO integration is a production requirement.

## 4. Test JWT and RLS isolation

Login through the gateway:

```bash
curl -sS http://127.0.0.1:8080/api/v2/auth/token \
  -H 'Content-Type: application/json' \
  -d '{"email":"operator.pu@example.go.id","password":"REPLACE_WITH_TEMPORARY_PASSWORD"}'
```

The access token is RS256-signed. Its claims include:

```json
{
  "sub": "<operator-uuid>",
  "wilayah_id": "sby",
  "opd_id": "pu",
  "role": "operator",
  "roles": ["operator"],
  "iat": 1790000000,
  "exp": 1790000600,
  "iss": "https://api.laporaman.local",
  "aud": "laporaman-operator"
}
```

The actual timestamp values are generated at login. `roles` is an auxiliary array for KrakenD; `role` remains the scalar RBAC claim requested by the application contract.

Use the token:

```bash
curl -sS http://127.0.0.1:8080/api/v2/reports \
  -H "Authorization: Bearer $TOKEN"
```

Public tracking is deliberately metadata-only and tenant-scoped:

```bash
curl http://127.0.0.1:8080/api/v2/public/tenants/sby/reports/LA-2026-1234-ABCDEFGHJK
```

It returns status and timestamps only; it does not return report ciphertext or key envelopes. Access JWT verification is stateless; deactivation/role changes take effect when the short-lived token expires (10 minutes by default).

To test DB-level isolation, execute the SQL smoke test using the runtime account (not the admin/migration account):

```bash
export RUNTIME_DATABASE_URL='postgresql://laporaman_runtime:YOUR_RUNTIME_PASSWORD@127.0.0.1:5432/laporaman'
psql "$RUNTIME_DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/rls_smoke.sql
```

For a reproducible local RLS proof, start a development-only DB port override and seed dummy ciphertext-shaped fixtures using the admin account:

```bash
docker compose -f compose.yml -f compose.dev.yml --env-file .env up -d
export ADMIN_DATABASE_URL='postgresql://laporaman_admin:YOUR_ADMIN_PASSWORD@127.0.0.1:5432/laporaman'
psql "$ADMIN_DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/seed_rls_fixtures.sql
```

Then run `tests/rls_smoke.sql` using the runtime login as shown above. This proves the `sby/pu` operator sees its own fixture but not `sby/hub` or `sda/pu`. Do not publish PostgreSQL in a production Compose/Kubernetes deployment, and always remove the override after testing. The runtime test must connect as `laporaman_runtime`, not a superuser or table owner.

Verify the role cannot bypass RLS:

```sql
SELECT rolname, rolsuper, rolbypassrls
FROM pg_roles WHERE rolname = 'laporaman_runtime';
-- Both rolsuper and rolbypassrls must be false.
```

## 5. Enroll recipient keys and test encrypted report intake

The original `frontend/script.js` still uses the prototype request shape and is not yet connected to this v2 API. Follow `docs/FRONTEND_MIGRATION.md` to wire the helper and new request schema into the dashboard. Before accepting reports, provision one RSA-3072/4096 public key for `triage` and one for each OPD allowed to receive reports. Generate private keys on the recipient side and protect them outside this API (for example, smart card/HSM or an encrypted offline key vault). Only DER SubjectPublicKeyInfo public keys are uploaded.

Fetch the public keys that clients must use for encrypting envelopes:

```bash
curl -sS http://127.0.0.1:8080/api/v2/public/tenants/sby/recipient-keys
```

To enroll/rotate a public key, authenticate as `tenant_admin` and POST its Base64 DER SPKI at `/api/v2/admin/recipient-keys/{recipient_id}` where recipient is `triage` or an agency code such as `pu`. The API returns a UUID key id and version. Existing key ids remain readable so reports encrypted before rotation can still be routed; only current active keys are published for new reports. A safe rotation runbook must keep corresponding old private keys available until all reports addressed to them expire or are rewrapped.

`POST /api/v2/reports` accepts only encrypted payload fields plus tenant metadata. `extra=forbid` rejects `passphrase`, `private_key`, `description`, `identity` or arbitrary plaintext fields. Use the separate browser helper at `client/crypto-v2.mjs` as the reference client implementation. Generate recipient keypairs on an offline/trusted key-management workstation with `python backend/scripts/generate_recipient_keypair.py --out-dir ./secure-keys/sby-triage --bits 3072`; register only the Base64 DER public key from `recipient-public.spki.base64.txt`. Example request shape (replace placeholders with valid client-produced ciphertext and key envelopes):

```json
{
  "tenant_id": "sby",
  "encryption_alg": "A256GCM",
  "ciphertext": "BASE64_AES_256_GCM_CIPHERTEXT_AND_TAG",
  "owner_kdf": "PBKDF2-HMAC-SHA256",
  "owner_kdf_iterations": 310000,
  "owner_wrapped_dek": "BASE64_AES_GCM_WRAPPED_32_BYTE_DATA_KEY",
  "owner_wrap_iv": "BASE64_12_BYTE_OWNER_WRAP_NONCE",
  "salt": "BASE64_16_BYTE_RANDOM_SALT",
  "iv": "BASE64_12_BYTE_PAYLOAD_NONCE",
  "wrapped_deks": {
    "RECIPIENT_KEY_UUID": "BASE64_RSA_OAEP_WRAPPED_32_BYTE_DATA_KEY"
  },
  "device_hash": "64_LOWERCASE_HEX_CHARACTERS_OR_NULL",
  "anonymous": true
}
```

Every UUID in `wrapped_deks` must refer to an active key belonging to the selected tenant. A `triage` envelope is mandatory at intake. Routing to an OPD requires a corresponding envelope for one of that OPD's public-key ids; otherwise the API returns HTTP 409. The 16-byte `salt` is used by the owner's passphrase-derived wrapping key; the passphrase itself and all private keys stay on the client/recipient side.

The client helper uses PBKDF2-HMAC-SHA256 (310,000 iterations), AES-256-GCM and RSA-OAEP/SHA-256. The server checks Base64 and byte dimensions, but cannot prove that the client actually encrypted plaintext correctly or verify the GCM tag without a key. Device hash must derive from a random high-entropy per-installation token, never hardware/browser fingerprinting.

## 6. AI Triase and ASR

The AI service is deliberately excluded from normal startup and is available only through the `ml` profile on the internal network. It does not download model weights at runtime. Place reviewed model artifacts into:

- `models/indobertweet/`
- `models/whisper-large-v3/`

Build with ML dependencies and launch:

```bash
AI_INSTALL_ML=1 docker compose --env-file .env --profile ml up --build -d
```

The container runs in offline mode (`HF_HUB_OFFLINE=1`, `TRANSFORMERS_OFFLINE=1`) and reads local model directories. Whisper must be supplied in a `faster-whisper`/CTranslate2-compatible local model format. Use `/triage` with an internal `X-Service-Token` header, or `/asr/transcribe-and-triage` with multipart audio. `AI_LABEL_MAP_JSON` must map model output indices to the supported agency codes (`pu`, `hub`, `dlh`, `kes`, `duk`, `sos`, `ins`, `pen`).

If IndoBERTweet returns a maximum score below 0.70, `human_in_the_loop` is true. This is a triage signal, not a legal/administrative decision. Calibrate probabilities and validate the model on a representative, consented Indonesian public-complaint dataset before production.

Whisper Large v3 on CPU may be slow and memory-intensive. For real deployment consider a dedicated GPU inference node or a reviewed CPU-optimized model. No ElevenLabs Scribe call is enabled; sending audio to a hosted provider is an external disclosure/processor decision and is not air-gapped.

## 7. SLA and Webhooks

The worker checks active reports for `sla_due_at < now()` and `status <> 'Selesai'`, uses `FOR UPDATE SKIP LOCKED`, updates `escalated=true`, inserts an immutable audit event and enqueues `sla.breached` in the same transaction. It also dispatches `ticket.created`, `ticket.updated`, `ticket.routed`, and `sla.breached` from `outbox_events`.

Webhook bodies contain metadata only (event id, ticket id, tenant id, status, agency code where applicable). They never contain report ciphertext, plaintext or keys. Deliveries use HMAC-SHA256 headers, retries with exponential backoff, no redirects, HTTPS, an explicit hostname allowlist, and public-IP checks. A production deployment must add an egress firewall/proxy with destination allowlisting to close DNS rebinding/TOCTOU risks. Consumers should deduplicate on `event_id` because delivery is at-least-once.

Run the browser-crypto round-trip test with Node.js 20+ from this directory: `node --test tests/crypto-v2.test.mjs`. Run Python contract tests with `python -m pytest -q tests`.

## 8. Shutdown and reset

```bash
docker compose --env-file .env down
```

To erase the development database and JWT keys permanently (destructive):

```bash
docker compose --env-file .env down -v
```

Do not run `down -v` against any deployment containing real reports or signing keys.
