/* E2EE primitives shared by the web client and the automated Node smoke test. */
const encoder = new TextEncoder();
const decoder = new TextDecoder();
export const PBKDF2_ITERATIONS = 310000;
export function randomBytes(length) { return crypto.getRandomValues(new Uint8Array(length)); }
export function toBase64(bytes) {
  let binary = ''; const data = new Uint8Array(bytes);
  for (let offset = 0; offset < data.length; offset += 0x8000) binary += String.fromCharCode(...data.subarray(offset, offset + 0x8000));
  return btoa(binary);
}
export function fromBase64(value) { return Uint8Array.from(atob(value), (character) => character.charCodeAt(0)); }
export async function deriveWrappingKey(password, salt, iterations = PBKDF2_ITERATIONS) {
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export async function encryptPrivateKeyEnvelope(pkcs8Bytes, password) {
  const salt = randomBytes(16); const iv = randomBytes(12);
  const wrappingKey = await deriveWrappingKey(password, salt);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, wrappingKey, pkcs8Bytes);
  return { version: 1, kdf: 'PBKDF2-HMAC-SHA256', iterations: PBKDF2_ITERATIONS, salt: toBase64(salt), iv: toBase64(iv), ciphertext: toBase64(ciphertext) };
}
export async function unlockStaffPrivateKey(envelope, password) {
  if (!envelope || envelope.kdf !== 'PBKDF2-HMAC-SHA256') throw new Error('Envelope kunci privat instansi tidak valid.');
  const wrappingKey = await deriveWrappingKey(password, fromBase64(envelope.salt), envelope.iterations);
  const raw = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(envelope.iv) }, wrappingKey, fromBase64(envelope.ciphertext));
  return crypto.subtle.importKey('pkcs8', raw, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['decrypt']);
}
export async function encryptReportPayload(payload, password, publicKeySpki) {
  const dataKeyRaw = randomBytes(32);
  const dataKey = await crypto.subtle.importKey('raw', dataKeyRaw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  const dataIv = randomBytes(12);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: dataIv }, dataKey, encoder.encode(JSON.stringify(payload)));
  const keySalt = randomBytes(16); const keyIv = randomBytes(12);
  const ownerWrappingKey = await deriveWrappingKey(password, keySalt);
  const wrappedKey = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: keyIv }, ownerWrappingKey, dataKeyRaw);
  const tenantPublicKey = await crypto.subtle.importKey('spki', fromBase64(publicKeySpki), { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']);
  const staffEnvelope = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, tenantPublicKey, dataKeyRaw);
  return {
    vault: {
      version: 1, kdf: 'PBKDF2-HMAC-SHA256', iterations: PBKDF2_ITERATIONS,
      salt: toBase64(keySalt), iv: toBase64(dataIv), ciphertext: toBase64(ciphertext),
      key_salt: toBase64(keySalt), key_iv: toBase64(keyIv), wrapped_key: toBase64(wrappedKey),
    },
    staff_envelope: toBase64(staffEnvelope),
  };
}
export async function decryptOwnerPayload(vault, password) {
  const salt = fromBase64(vault.key_salt || vault.salt);
  const wrappingKey = await deriveWrappingKey(password, salt, vault.iterations);
  const dataKeyRaw = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(vault.key_iv) }, wrappingKey, fromBase64(vault.wrapped_key));
  const dataKey = await crypto.subtle.importKey('raw', dataKeyRaw, { name: 'AES-GCM' }, false, ['decrypt']);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(vault.iv) }, dataKey, fromBase64(vault.ciphertext));
  return JSON.parse(decoder.decode(plaintext));
}
export async function decryptStaffPayload(report, privateKey) {
  if (!privateKey) throw new Error('Kunci privat instansi belum dibuka.');
  const dataKeyRaw = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, privateKey, fromBase64(report.staff_envelope));
  const dataKey = await crypto.subtle.importKey('raw', dataKeyRaw, { name: 'AES-GCM' }, false, ['decrypt']);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(report.vault.iv) }, dataKey, fromBase64(report.vault.ciphertext));
  return JSON.parse(decoder.decode(plaintext));
}
export async function readFileAsBase64(file) { return toBase64(await file.arrayBuffer()); }
