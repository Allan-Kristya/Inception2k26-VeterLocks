/* Browser-side E2EE helper for POST /api/v2/reports.
 * The server receives ciphertext and wrapped DEKs only; never passphrases or private keys.
 */
const enc = new TextEncoder();
const dec = new TextDecoder();
export const OWNER_KDF_ITERATIONS = 310000;

export function randomBytes(length) {
  return crypto.getRandomValues(new Uint8Array(length));
}
export function toBase64(value) {
  const bytes = new Uint8Array(value);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}
export function fromBase64(value) {
  return Uint8Array.from(atob(value), (ch) => ch.charCodeAt(0));
}
async function deriveOwnerKey(passphrase, salt, iterations = OWNER_KDF_ITERATIONS) {
  if (typeof passphrase !== 'string' || passphrase.length < 12) {
    throw new Error('Gunakan passphrase minimal 12 karakter.');
  }
  const material = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, material,
    { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  );
}

/**
 * recipientKeys: [{ id: UUID, public_key_spki: Base64-DER, recipient_id: 'triage'|'pu'|... }]
 * deviceToken: optional random 32-byte-or-more per-installation token, not a device fingerprint.
 */
export async function encryptReportV2(payload, passphrase, recipientKeys, deviceToken = null) {
  if (!Array.isArray(recipientKeys) || recipientKeys.length === 0) throw new Error('Public key penerima belum tersedia.');
  if (!recipientKeys.some((key) => key.recipient_id === 'triage')) throw new Error('Public key triage tenant belum tersedia.');

  const dekRaw = randomBytes(32);
  const dek = await crypto.subtle.importKey('raw', dekRaw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  const iv = randomBytes(12);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, dek, enc.encode(JSON.stringify(payload)),
  );

  const salt = randomBytes(16);
  const ownerWrapIv = randomBytes(12);
  const ownerKey = await deriveOwnerKey(passphrase, salt, OWNER_KDF_ITERATIONS);
  const ownerWrappedDek = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: ownerWrapIv }, ownerKey, dekRaw,
  );

  const wrapped_deks = {};
  for (const recipient of recipientKeys) {
    const spki = fromBase64(recipient.public_key_spki);
    const publicKey = await crypto.subtle.importKey(
      'spki', spki, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt'],
    );
    const envelope = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, publicKey, dekRaw);
    wrapped_deks[recipient.id] = toBase64(envelope);
  }

  let device_hash = null;
  if (deviceToken) {
    const digest = await crypto.subtle.digest('SHA-256', enc.encode(deviceToken));
    device_hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  return {
    encryption_alg: 'A256GCM',
    ciphertext: toBase64(ciphertext),
    owner_kdf: 'PBKDF2-HMAC-SHA256',
    owner_kdf_iterations: OWNER_KDF_ITERATIONS,
    owner_wrapped_dek: toBase64(ownerWrappedDek),
    owner_wrap_iv: toBase64(ownerWrapIv),
    salt: toBase64(salt),
    iv: toBase64(iv),
    wrapped_deks,
    device_hash,
  };
}

export async function decryptOwnerReportV2(report, passphrase) {
  const salt = fromBase64(report.salt);
  const ownerKey = await deriveOwnerKey(passphrase, salt, report.owner_kdf_iterations);
  const dekRaw = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(report.owner_wrap_iv) },
    ownerKey, fromBase64(report.owner_wrapped_dek),
  );
  const dek = await crypto.subtle.importKey('raw', dekRaw, { name: 'AES-GCM' }, false, ['decrypt']);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(report.iv) }, dek, fromBase64(report.ciphertext),
  );
  return JSON.parse(dec.decode(plaintext));
}

export async function decryptRecipientReportV2(report, recipientPrivateKey, recipientKeyId) {
  const envelope = report.wrapped_deks?.[recipientKeyId];
  if (!envelope) throw new Error('Tidak ada envelope DEK untuk recipient key ini.');
  const dekRaw = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, recipientPrivateKey, fromBase64(envelope));
  const dek = await crypto.subtle.importKey('raw', dekRaw, { name: 'AES-GCM' }, false, ['decrypt']);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(report.iv) }, dek, fromBase64(report.ciphertext),
  );
  return JSON.parse(dec.decode(plaintext));
}
