import assert from 'node:assert/strict';
import {
  decryptOwnerPayload, decryptStaffPayload, encryptPrivateKeyEnvelope,
  encryptReportPayload, toBase64, unlockStaffPrivateKey,
} from '../frontend/crypto.js';

const staffPair = await crypto.subtle.generateKey(
  { name: 'RSA-OAEP', modulusLength: 3072, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
  true,
  ['encrypt', 'decrypt'],
);
const publicSpki = await crypto.subtle.exportKey('spki', staffPair.publicKey);
const privatePkcs8 = await crypto.subtle.exportKey('pkcs8', staffPair.privateKey);
const privateEnvelope = await encryptPrivateKeyEnvelope(privatePkcs8, 'StaffVault!Password2026');
const unlockedKey = await unlockStaffPrivateKey(privateEnvelope, 'StaffVault!Password2026');
const reportContent = {
  description: 'Lampu penerangan jalan di Jalan Melati padam selama tiga malam.',
  location: 'Jalan Melati, Surabaya',
  identity: { full_name: 'Contoh Warga', contact: 'contoh@example.test' },
  sensitive_details: 'Informasi privat untuk uji E2EE.',
};
const encrypted = await encryptReportPayload(reportContent, 'WargaVault!Password2026', toBase64(publicSpki));
const report = { ...encrypted };
assert.deepEqual(await decryptOwnerPayload(encrypted.vault, 'WargaVault!Password2026'), reportContent);
assert.deepEqual(await decryptStaffPayload(report, unlockedKey), reportContent);
await assert.rejects(() => decryptOwnerPayload(encrypted.vault, 'wrong-password'));
await assert.rejects(() => unlockStaffPrivateKey(privateEnvelope, 'wrong-password'));
assert.equal(encrypted.vault.kdf, 'PBKDF2-HMAC-SHA256');
assert.equal(encrypted.vault.iterations, 310000);
console.log('E2EE smoke test passed: owner decrypt, staff decrypt, and wrong-password rejection.');
