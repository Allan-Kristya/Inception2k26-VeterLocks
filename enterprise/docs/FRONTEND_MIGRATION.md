# Frontend migration: prototype API -> Enterprise API v2

The original `frontend/script.js` still targets the prototype API and sends the old `vault` + `staff_envelope` shape. It is intentionally left untouched so the hackathon prototype remains runnable. It is **not wire-compatible** with `enterprise/backend/app/main.py` until the following client changes are made.

## Submission flow

1. The client selects a tenant (for example `sby`) from a trusted configuration, then fetches current public recipient keys:

   `GET /api/v2/public/tenants/{tenant_id}/recipient-keys`

2. Put every field containing complaint text, contact/identity data, exact location, and attachment bytes inside one serializable object. Do not put these fields next to the encrypted fields in the HTTP body.

3. Call `encryptReportV2()` from `client/crypto-v2.mjs`. Pass the owner's passphrase and the current public-key list returned in step 1. For `deviceToken`, use an independently generated random per-installation token with at least 256 bits of entropy; never derive it from hardware, browser fingerprint, MAC address or IP address.

4. Send this JSON body to `POST /api/v2/reports`:

   ```js
   const encrypted = await encryptReportV2(
     complaintObject,
     passphrase,
     recipientKeys,
     randomPerInstallToken,
   );
   const response = await fetch(`${API_BASE}/api/v2/reports`, {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({
       tenant_id: 'sby',
       anonymous: isAnonymous,
       ...encrypted,
     }),
   });
   ```

   The browser must never include `passphrase`, plaintext `description`, `identity`, `sensitive_details`, raw device token, or any private key in this request.

5. For public tracking, call `GET /api/v2/public/tenants/{tenant_id}/reports/{ticket_id}`. It returns status/timestamps only, not encrypted report content.

## Operator workflow

- An operator gets reports with `GET /api/v2/reports` or `GET /api/v2/reports/{id}` using a short-lived bearer JWT.
- The response's `wrapped_deks` object is keyed by recipient-key UUID. The operator client chooses the envelope corresponding to its agency key id and calls `decryptRecipientReportV2(report, privateCryptoKey, recipientKeyId)`.
- A recipient private key must be imported into WebCrypto only after an approved key-unlock process. The sample repo intentionally does not implement private-key recovery, browser key custody, hardware-token/HSM integration, or key escrow. Do not place a plaintext private key in localStorage, IndexedDB without an approved encryption design, source control, telemetry, or the API.
- Tenant admin/triage can route a report only when that report already contains an envelope for the destination OPD. The API rejects routing without one (HTTP 409); do not assume PostgreSQL RLS by itself grants decryption rights.

## AI/ASR consent boundary

The strict E2EE flow above never sends report plaintext to the API or AI service. If the user separately selects an AI-assisted path, the client must make the required privacy notice and lawful-basis/consent checks, then transmit only the minimum content to the internal `/triage` or `/asr/transcribe-and-triage` endpoint through a trusted internal caller. This is a separate data-processing mode and must not be labeled zero-knowledge.
