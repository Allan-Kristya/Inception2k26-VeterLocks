import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import {
  encryptReportV2,
  decryptOwnerReportV2,
  decryptRecipientReportV2,
  toBase64,
} from '../client/crypto-v2.mjs';

globalThis.crypto ??= webcrypto;

test('AES-GCM payload, owner wrap, and RSA recipient envelope round-trip', async () => {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSA-OAEP', modulusLength: 3072, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['encrypt', 'decrypt'],
  );
  const spki = await crypto.subtle.exportKey('spki', pair.publicKey);
  const keyId = 'e15c7518-b2d2-45e0-b5c2-4a73983ccf91';
  const source = { report: 'uji terenkripsi', location: 'Surabaya' };
  const encrypted = await encryptReportV2(
    source,
    'passphrase-uji-yang-cukup-panjang-2026',
    [{ id: keyId, recipient_id: 'triage', public_key_spki: toBase64(spki) }],
    'random-installation-token-generated-with-32-bytes-or-more',
  );

  assert.equal(encrypted.encryption_alg, 'A256GCM');
  assert.equal(Object.keys(encrypted.wrapped_deks).length, 1);
  assert.match(encrypted.device_hash, /^[0-9a-f]{64}$/);
  assert.deepEqual(await decryptOwnerReportV2(encrypted, 'passphrase-uji-yang-cukup-panjang-2026'), source);
  assert.deepEqual(await decryptRecipientReportV2(encrypted, pair.privateKey, keyId), source);
});
