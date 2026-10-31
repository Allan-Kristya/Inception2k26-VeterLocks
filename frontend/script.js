import {
  decryptOwnerPayload, decryptStaffPayload, encryptPrivateKeyEnvelope, encryptReportPayload,
  fromBase64, readFileAsBase64, toBase64, unlockStaffPrivateKey,
} from './crypto.js';

/* LaporAman web client
 * Real persistence/authentication use the FastAPI API. Only accessibility preferences
 * and recently-used ticket numbers remain in browser storage. Report content is encrypted
 * before it leaves the browser. Local keyword triage is clearly marked as a demo adapter.
 */
'use strict';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const API_BASE = '/api';
const TOKEN_KEY = 'laporaman.access-token';
const TICKETS_KEY = 'laporaman.recent-tickets';
const A11Y_KEY = 'laporaman.a11y';
const PBKDF2_ITERATIONS = 310000;
const STATUS = ['Diterima', 'Terverifikasi', 'Diproses', 'Selesai'];
const OPD = [
  { id: 'pu', name: 'Dinas Pekerjaan Umum', sla: 72, keys: ['jalan', 'berlubang', 'lubang', 'aspal', 'jembatan', 'drainase', 'selokan', 'banjir', 'trotoar', 'gorong'] },
  { id: 'hub', name: 'Dinas Perhubungan', sla: 48, keys: ['macet', 'lalu lintas', 'lampu merah', 'rambu', 'parkir', 'kecelakaan', 'angkot', 'bus'] },
  { id: 'dlh', name: 'Dinas Lingkungan Hidup', sla: 48, keys: ['sampah', 'limbah', 'bau', 'polusi', 'tpa', 'tps', 'sungai'] },
  { id: 'kes', name: 'Dinas Kesehatan', sla: 24, keys: ['rumah sakit', 'puskesmas', 'obat', 'dokter', 'wabah', 'demam', 'posyandu'] },
  { id: 'duk', name: 'Dinas Kependudukan', sla: 96, keys: ['ktp', 'kk', 'akta', 'kartu keluarga', 'kependudukan', 'domisili'] },
  { id: 'sos', name: 'Dinas Sosial', sla: 24, keys: ['bantuan', 'bansos', 'lansia', 'terlantar', 'darurat', 'miskin', 'korban'] },
  { id: 'ins', name: 'Inspektorat', sla: 72, keys: ['pungli', 'korupsi', 'suap', 'pungutan', 'gratifikasi', 'calo'] },
  { id: 'pen', name: 'Dinas Penerangan Jalan', sla: 48, keys: ['lampu jalan', 'padam', 'gelap', 'listrik', 'pju'] },
];
const TENANTS = { sby: 'Kota Surabaya', sda: 'Kabupaten Sidoarjo' };
const state = { token: sessionStorage.getItem(TOKEN_KEY), user: null, staffPrivateKey: null, staffPrivateUnlocked: false, lastTracked: null, voiceRecognition: null, voiceActive: false, polling: null };

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}
function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
function opdName(id) { return OPD.find((item) => item.id === id)?.name || id || 'Belum ditentukan'; }
function toast(message, type = 'info') {
  const el = $('#toast');
  if (!el) return;
  el.textContent = message;
  el.dataset.type = type;
  el.classList.add('visible');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('visible'), 4200);
  if (state.voiceActive && 'speechSynthesis' in window) {
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.lang = 'id-ID'; speechSynthesis.speak(utterance);
  }
}
async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  if (state.token) headers.set('Authorization', `Bearer ${state.token}`);
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...options, headers, cache: 'no-store' });
  } catch (error) {
    throw new Error('Backend tidak dapat dijangkau. Jalankan server LaporAman terlebih dahulu.');
  }
  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) {
    const detail = typeof body === 'object' && body ? body.detail : body;
    const message = Array.isArray(detail) ? detail.map((item) => item.msg).join('; ') : detail;
    throw new Error(message || `Permintaan gagal (${response.status}).`);
  }
  return body;
}
function setBusy(button, busy, busyText = 'Memproses…') {
  if (!button) return;
  if (busy) {
    button.dataset.originalText = button.textContent.trim();
    button.disabled = true;
    button.textContent = busyText;
  } else {
    button.disabled = false;
    if (button.dataset.originalText) button.textContent = button.dataset.originalText;
  }
}
function setFieldError(input, message) {
  input.setAttribute('aria-invalid', 'true');
  const id = `${input.id}-error`;
  let error = document.getElementById(id);
  if (!error) {
    error = document.createElement('p'); error.id = id; error.className = 'error-text'; error.setAttribute('role', 'alert');
    input.insertAdjacentElement('afterend', error);
  }
  error.textContent = message;
  const described = new Set((input.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
  described.add(id); input.setAttribute('aria-describedby', [...described].join(' '));
}
function clearFieldErrors() {
  $$('[aria-invalid="true"]').forEach((el) => el.removeAttribute('aria-invalid'));
  $$('.error-text[id$="-error"]').forEach((el) => el.remove());
}

// ---- E2EE operations are in the independently tested frontend/crypto.js module. ----
function downloadAttachment(attachment) {
  const bytes = fromBase64(attachment.data);
  const blob = new Blob([bytes], { type: attachment.type || 'application/octet-stream' });
  const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
  anchor.href = url; anchor.download = attachment.name || 'lampiran'; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---- Local triage adapter. It is intentionally not represented as IndoBERTweet. ----
function normalizeText(text) { return text.toLocaleLowerCase('id-ID').replace(/(.)\1{2,}/g, '$1$1'); }
function classifyLocally(text) {
  const normalized = normalizeText(text);
  const hits = OPD.map((unit) => {
    const matched = unit.keys.filter((word) => normalized.includes(word));
    if (!matched.length) return null;
    const confidence = Math.min(0.94, 0.48 + matched.length * 0.16);
    return { id: unit.id, confidence: Number(confidence.toFixed(2)), matches: matched };
  }).filter(Boolean).sort((a, b) => b.confidence - a.confidence);
  const confidence = hits[0]?.confidence || 0;
  const labels = hits.filter((item) => item.confidence >= 0.5);
  return { labels, confidence, review_required: !labels.length || confidence < 0.70, engine: 'local-keyword-demo' };
}
function renderTriage() {
  const value = $('#description').value.trim();
  $('#charCount').textContent = `${value.length.toLocaleString('id-ID')}/10.000`;
  const preview = $('#aiPreview');
  if (!value) { preview.innerHTML = '<span class="status-dot" aria-hidden="true"></span><span>Triage lokal belum dijalankan.</span>'; return; }
  const result = classifyLocally(value);
  const labels = result.labels.map((item) => `<span class="status-pill">${escapeHTML(opdName(item.id))} · ${Math.round(item.confidence * 100)}%</span>`).join(' ');
  preview.innerHTML = `${labels || '<span class="status-pill">Belum ada kategori terdeteksi</span>'}<p class="field-help">${result.review_required ? 'Saran lokal belum kuat; laporan perlu tinjauan petugas.' : 'Saran kategori tersedia. Semua laporan tetap diverifikasi petugas sampai model AI tervalidasi aktif.'} <strong>Demo kata kunci, bukan IndoBERTweet.</strong></p>`;
}

// ---- Routing and accessibility ------------------------------------------------
function go(view) { location.hash = view; }
function route() {
  const view = ['lapor', 'lacak', 'dasbor', 'integrasi', 'tentang'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'lapor';
  $$('.view').forEach((section) => { section.hidden = section.id !== `view-${view}`; });
  $$('.main-nav a').forEach((link) => link.hash === `#${view}` ? link.setAttribute('aria-current', 'page') : link.removeAttribute('aria-current'));
  $(`#view-${view} h1`)?.focus({ preventScroll: true });
  document.title = `${$(`#view-${view} h1`)?.textContent || 'LaporAman'} · LaporAman`;
  if (view === 'dasbor' && state.token) refreshDashboard().catch((error) => toast(error.message, 'error'));
}
function saveA11y() {
  const prefs = { contrast: $('#highContrast').getAttribute('aria-pressed') === 'true', dyslexia: $('#dyslexia').getAttribute('aria-pressed') === 'true', zoom: $('#zoom').value };
  try { localStorage.setItem(A11Y_KEY, JSON.stringify(prefs)); } catch (_) { /* private browsing */ }
}
function togglePreference(buttonId, attribute) {
  const button = $(buttonId); const on = button.getAttribute('aria-pressed') !== 'true';
  button.setAttribute('aria-pressed', String(on)); document.documentElement.toggleAttribute(attribute, on); saveA11y();
}
function restoreA11y() {
  try {
    const prefs = JSON.parse(localStorage.getItem(A11Y_KEY) || '{}');
    $('#zoom').value = prefs.zoom || 100; applyZoom();
    if (prefs.contrast) { $('#highContrast').setAttribute('aria-pressed', 'true'); document.documentElement.setAttribute('data-contrast', ''); }
    if (prefs.dyslexia) { $('#dyslexia').setAttribute('aria-pressed', 'true'); document.documentElement.setAttribute('data-dyslexia', ''); }
  } catch (_) { /* ignore invalid preference */ }
}
function applyZoom() {
  document.documentElement.style.setProperty('--scale', Number($('#zoom').value) / 100);
  $('#zoomValue').textContent = `${$('#zoom').value}%`;
  saveA11y();
}

// ---- Report submission and tracking ------------------------------------------
function validateReportForm() {
  clearFieldErrors();
  const errors = [];
  const fields = {
    description: $('#description'), fullName: $('#fullName'), contact: $('#contact'), identityNumber: $('#identityNumber'), vaultPassword: $('#vaultPassword'), attachment: $('#attachment'), privacyConsent: $('#privacyConsent'),
  };
  if (fields.description.value.trim().length < 15) errors.push([fields.description, 'Jelaskan kejadian minimal 15 karakter.']);
  if (!$('#anonymous').checked) {
    if (fields.fullName.value.trim().length < 3) errors.push([fields.fullName, 'Nama lengkap minimal 3 karakter.']);
    if (!fields.contact.value.trim()) errors.push([fields.contact, 'Email atau nomor HP wajib diisi.']);
    else {
      const contact = fields.contact.value.trim();
      if (!(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact) || /^(\+62|62|0)8\d{7,11}$/.test(contact.replace(/[\s-]/g, '')))) errors.push([fields.contact, 'Masukkan email atau nomor HP Indonesia yang valid.']);
    }
    if (fields.identityNumber.value && !/^\d{16}$/.test(fields.identityNumber.value.trim())) errors.push([fields.identityNumber, 'NIK harus berisi 16 digit angka.']);
  }
  if (fields.vaultPassword.value.length < 10) errors.push([fields.vaultPassword, 'Kata sandi brankas minimal 10 karakter.']);
  if (!fields.privacyConsent.checked) errors.push([fields.privacyConsent, 'Persetujuan pemrosesan metadata wajib diberikan.']);
  const file = fields.attachment.files[0];
  if (file) {
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!validTypes.includes(file.type)) errors.push([fields.attachment, 'Lampiran hanya boleh JPG, PNG, WebP, atau PDF.']);
    if (file.size > 5 * 1024 * 1024) errors.push([fields.attachment, 'Ukuran lampiran maksimal 5 MB.']);
  }
  errors.forEach(([field, message]) => setFieldError(field, message));
  if (errors.length) { errors[0][0].focus(); toast(`${errors.length} isian perlu diperbaiki.`, 'error'); }
  return errors.length === 0;
}
function getRecentTickets() {
  try { return JSON.parse(localStorage.getItem(TICKETS_KEY) || '[]').filter((item) => typeof item === 'string').slice(0, 8); } catch (_) { return []; }
}
function rememberTicket(id) {
  const next = [id, ...getRecentTickets().filter((item) => item !== id)].slice(0, 8);
  try { localStorage.setItem(TICKETS_KEY, JSON.stringify(next)); } catch (_) { /* local privacy mode */ }
  renderRecentTickets();
}
function renderRecentTickets() {
  const tickets = getRecentTickets();
  $('#myTickets').hidden = !tickets.length;
  $('#myTicketButtons').innerHTML = tickets.map((ticket) => `<button type="button" class="ticket-shortcut" data-ticket="${escapeHTML(ticket)}">${escapeHTML(ticket)}</button>`).join('');
}
async function submitReport(event) {
  event.preventDefault();
  if (!validateReportForm()) return;
  const button = $('#submitReport'); setBusy(button, true, 'Mengenkripsi dan mengirim…');
  try {
    if (!window.crypto?.subtle) throw new Error('Browser tidak mendukung Web Crypto. Gunakan browser modern melalui localhost atau HTTPS.');
    const tenantId = $('#region').value;
    const publicKey = await api(`/tenants/${tenantId}/public-key`);
    const classification = classifyLocally($('#description').value);
    const payload = {
      description: $('#description').value.trim(),
      location: $('#location').value.trim(),
      identity: $('#anonymous').checked ? null : {
        full_name: $('#fullName').value.trim(), identity_number: $('#identityNumber').value.trim() || null,
        contact: $('#contact').value.trim(), address: $('#address').value.trim() || null,
      },
      sensitive_details: $('#sensitiveDetails').value.trim() || null,
      attachment: null,
      submitted_at: new Date().toISOString(),
    };
    const file = $('#attachment').files[0];
    if (file) payload.attachment = { name: file.name, type: file.type, size: file.size, data: await readFileAsBase64(file) };
    const cryptoPayload = await encryptReportPayload(payload, $('#vaultPassword').value, publicKey.public_key_spki);
    const created = await api('/reports', {
      method: 'POST', body: JSON.stringify({
        tenant_id: tenantId, labels: classification.labels.map(({ id, confidence }) => ({ id, confidence })),
        confidence: classification.confidence, ai_engine: classification.engine,
        anonymous: $('#anonymous').checked, vault: cryptoPayload.vault, staff_envelope: cryptoPayload.staff_envelope,
      }),
    });
    rememberTicket(created.ticket_id);
    renderSubmissionResult(created);
    $('#reportForm').reset(); $('#identityFields').hidden = false; $('#identityFields').querySelectorAll('input').forEach((field) => { field.disabled = false; });
    renderTriage();
    toast(`Laporan berhasil dikirim. Nomor registrasi ${created.ticket_id}.`, 'success');
  } catch (error) {
    toast(error.message, 'error');
  } finally { setBusy(button, false); }
}
function renderSubmissionResult(report) {
  const assigned = report.opd_ids.map(opdName).join(', ');
  $('#submissionResult').innerHTML = `<div class="panel success-result"><div class="result-kicker">LAPORAN BERHASIL DITERIMA</div><h2>Nomor registrasi Anda</h2><p class="ticket-number">${escapeHTML(report.ticket_id)}</p><p>${report.review_required ? 'Laporan masuk antrean verifikasi manusia. Saran klasifikasi lokal bukan hasil model AI terverifikasi dan tidak dipakai untuk routing otomatis.' : `Klasifikasi awal: ${escapeHTML(assigned)}.`}</p><p class="field-help">Tenggat SLA awal: <strong>${formatDate(report.due_at)}</strong>. Simpan nomor tiket ini untuk memeriksa perkembangannya.</p><div class="inline-actions"><button class="button button-primary" type="button" data-track="${escapeHTML(report.ticket_id)}">Lacak laporan ini</button><button class="button button-secondary" type="button" data-copy-ticket="${escapeHTML(report.ticket_id)}">Salin nomor tiket</button></div><p class="field-help">Isi laporan dan identitas telah dienkripsi di perangkat. Server tidak menerima plaintext.</p></div>`;
}
async function lookupReport(ticket = $('#ticketId').value.trim().toUpperCase(), silent = false) {
  if (!/^LA-\d{4}-\d{4}-[A-Z0-9]{8}$/.test(ticket)) {
    if (!silent) $('#trackingResult').innerHTML = '<p class="error-text" role="alert">Format nomor registrasi tidak valid.</p>';
    return;
  }
  try {
    const report = await api(`/reports/${encodeURIComponent(ticket)}`);
    state.lastTracked = report;
    $('#ticketId').value = report.ticket_id;
    renderTracking(report);
  } catch (error) {
    if (!silent) $('#trackingResult').innerHTML = `<div class="panel"><p class="error-text" role="alert">${escapeHTML(error.message)}</p></div>`;
  }
}
function renderTracking(report) {
  const previousPassword = $('#ownerPassword')?.value || '';
  const index = STATUS.indexOf(report.status);
  const remaining = new Date(report.due_at).getTime() - Date.now();
  const steps = STATUS.map((label, i) => `<li class="${i <= index ? 'done' : ''}"${i === index ? ' aria-current="step"' : ''}>${label}</li>`).join('');
  const events = report.trail.map((event) => `<li><time datetime="${escapeHTML(event.created_at)}">${formatDate(event.created_at)}</time><strong>${escapeHTML(event.message)}</strong><span>${escapeHTML(event.actor)} · ${escapeHTML(event.actor_role || 'Petugas')}</span></li>`).join('');
  $('#trackingResult').innerHTML = `<article class="panel tracking-card"><div class="tracker-summary"><div><span class="field-help">NOMOR REGISTRASI</span><h2 class="ticket-number compact">${escapeHTML(report.ticket_id)}</h2><p class="field-help">${escapeHTML(report.tenant_name)} · Diterima ${formatDate(report.created_at)}</p></div><span class="status-badge ${report.status === 'Selesai' ? 'success' : report.escalated ? 'danger' : 'warning'}">${escapeHTML(report.status)}</span></div><ol class="timeline-steps">${steps}</ol><p><strong>Tenggat SLA:</strong> ${formatDate(report.due_at)}${report.status !== 'Selesai' && remaining > 0 ? ` · sekitar ${Math.ceil(remaining / 3600000)} jam tersisa` : ''}</p>${report.escalated ? '<p class="error-text" role="alert">Tenggat SLA telah terlewati dan laporan dieskalasikan.</p>' : ''}<h3>Jejak audit</h3><ol class="audit-list">${events || '<li>Belum ada riwayat.</li>'}</ol><div class="tracker-extra"><label for="ownerPassword">Buka isi laporan dengan kata sandi brankas</label><input id="ownerPassword" type="password" autocomplete="off" placeholder="Kata sandi saat membuat laporan"><button id="decryptOwner" type="button" class="button button-secondary">Dekripsi detail saya</button></div><div id="ownerDecrypted" class="decrypted-content" aria-live="polite"></div></article>`;
  if ($('#ownerPassword')) $('#ownerPassword').value = previousPassword;
  if (report.vault) $('#decryptOwner').addEventListener('click', () => decryptForOwner(report));
}
async function decryptForOwner(report) {
  const button = $('#decryptOwner'); setBusy(button, true, 'Membuka brankas…');
  try {
    const value = await decryptOwnerPayload(report.vault, $('#ownerPassword').value);
    renderDecryptedDetails($('#ownerDecrypted'), value);
  } catch (_) { $('#ownerDecrypted').innerHTML = '<p class="error-text" role="alert">Kata sandi salah atau ciphertext tidak valid. Data tidak dapat dibuka.</p>'; }
  finally { setBusy(button, false); }
}
function renderDecryptedDetails(target, value) {
  const identity = value.identity ? `<p><strong>Nama:</strong> ${escapeHTML(value.identity.full_name || '—')}</p><p><strong>Kontak:</strong> ${escapeHTML(value.identity.contact || '—')}</p><p><strong>Alamat:</strong> ${escapeHTML(value.identity.address || '—')}</p>` : '<p><strong>Mode:</strong> Anonim</p>';
  const attachment = value.attachment ? `<button class="button button-secondary" type="button" data-download-attachment>Unduh lampiran (${escapeHTML(value.attachment.name)})</button>` : '';
  target.innerHTML = `<div class="decrypted-box"><h3>Isi brankas terbuka di perangkat ini</h3><p><strong>Isi laporan:</strong> ${escapeHTML(value.description)}</p><p><strong>Lokasi:</strong> ${escapeHTML(value.location || 'Tidak dicantumkan')}</p>${identity}<p><strong>Detail sensitif:</strong> ${escapeHTML(value.sensitive_details || 'Tidak ada')}</p>${attachment}</div>`;
  if (value.attachment) $('[data-download-attachment]', target).addEventListener('click', () => downloadAttachment(value.attachment));
}

// ---- Staff dashboard ----------------------------------------------------------
async function staffLogin(event) {
  event.preventDefault();
  const email = $('#staffEmail').value.trim(); const password = $('#staffPassword').value;
  if (!email || !password) { $('#loginMessage').textContent = 'Email dan kata sandi wajib diisi.'; return; }
  const button = $('#loginForm button[type="submit"]'); setBusy(button, true, 'Memverifikasi…');
  try {
    const result = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    state.token = result.access_token; sessionStorage.setItem(TOKEN_KEY, state.token); state.user = result.user;
    $('#staffPassword').value = '';
    $('#loginPanel').hidden = true; $('#dashboardPanel').hidden = false;
    $('#staffIdentity').textContent = result.user.name;
    $('#staffScope').textContent = `${TENANTS[result.user.tenant_id] || result.user.tenant_id} · ${result.user.opd_id === 'all' ? 'Seluruh OPD' : opdName(result.user.opd_id)} · ${result.user.role}`;
    await refreshKeyPanel(); await refreshDashboard();
    toast('Berhasil masuk ke dashboard instansi.', 'success');
  } catch (error) { $('#loginMessage').textContent = error.message; }
  finally { setBusy(button, false); }
}
async function refreshKeyPanel() {
  const result = await api('/staff/tenant-key');
  const panel = $('#keySetupPanel'); const status = $('#keyStatus');
  if (!result.public_key_spki || !result.private_key_envelope) {
    panel.hidden = false;
    panel.innerHTML = `<div><h2>Siapkan kunci enkripsi instansi</h2><p>Administrator membuat pasangan RSA-OAEP di perangkat ini. Kunci privat hanya disimpan sebagai ciphertext yang dilindungi kata sandi terpisah.</p><div class="key-inputs"><label for="newKeyPassword">Kata sandi brankas kunci (minimal 12 karakter)</label><input id="newKeyPassword" type="password" autocomplete="new-password" minlength="12"></div></div><button id="createTenantKey" class="button button-primary" type="button">Buat pasangan kunci</button>`;
    $('#createTenantKey').addEventListener('click', createTenantKey);
    status.textContent = 'Kunci publik instansi belum tersedia. Laporan baru belum dapat dikirim ke wilayah ini.';
  } else {
    panel.hidden = false;
    panel.innerHTML = `<div><h2>Buka kunci privat instansi</h2><p>Kunci privat tersimpan dalam bentuk terenkripsi di server. Masukkan kata sandi brankas kunci untuk mendekripsi laporan yang berada dalam cakupan akun.</p><div class="key-inputs"><label for="unlockKeyPassword">Kata sandi brankas kunci</label><input id="unlockKeyPassword" type="password" autocomplete="current-password"></div></div><button id="unlockTenantKey" class="button button-primary" type="button">Buka kunci</button>`;
    $('#unlockTenantKey').addEventListener('click', () => unlockTenantKey(result.private_key_envelope));
    status.textContent = `Kunci publik aktif sejak ${formatDate(result.key_created_at)}. Kunci privat belum dibuka di sesi ini.`;
  }
}
async function createTenantKey() {
  if (state.user?.role !== 'admin' && state.user?.role !== 'security_admin') { toast('Hanya administrator yang dapat membuat kunci instansi.', 'error'); return; }
  const password = $('#newKeyPassword').value;
  if (password.length < 12) { toast('Kata sandi brankas kunci minimal 12 karakter.', 'error'); $('#newKeyPassword').focus(); return; }
  const button = $('#createTenantKey'); setBusy(button, true, 'Membuat RSA…');
  try {
    const pair = await crypto.subtle.generateKey({ name: 'RSA-OAEP', modulusLength: 3072, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['encrypt', 'decrypt']);
    const publicSpki = await crypto.subtle.exportKey('spki', pair.publicKey);
    const privatePkcs8 = await crypto.subtle.exportKey('pkcs8', pair.privateKey);
    const envelope = await encryptPrivateKeyEnvelope(privatePkcs8, password);
    await api('/staff/tenant-key', { method: 'PUT', body: JSON.stringify({ public_key_spki: toBase64(publicSpki), private_key_envelope: envelope }) });
    state.staffPrivateKey = pair.privateKey; state.staffPrivateUnlocked = true;
    $('#keyStatus').textContent = 'Kunci instansi dibuat dan privat terbuka pada sesi browser ini. Simpan kata sandi dengan aman; server tidak dapat memulihkannya.';
    await refreshDashboard(); toast('Pasangan kunci instansi berhasil dibuat.', 'success');
  } catch (error) { toast(error.message, 'error'); }
  finally { setBusy(button, false); }
}
async function unlockTenantKey(envelope) {
  const password = $('#unlockKeyPassword').value;
  if (!password) { toast('Masukkan kata sandi brankas kunci.', 'error'); return; }
  const button = $('#unlockTenantKey'); setBusy(button, true, 'Mendekripsi kunci…');
  try {
    state.staffPrivateKey = await unlockStaffPrivateKey(envelope, password);
    state.staffPrivateUnlocked = true;
    $('#keyStatus').textContent = 'Kunci privat berhasil dibuka di memori browser. Kunci tidak disimpan kembali ke server.';
    await refreshDashboard(); toast('Kunci privat instansi berhasil dibuka.', 'success');
  } catch (_) { state.staffPrivateKey = null; state.staffPrivateUnlocked = false; toast('Kata sandi salah atau envelope kunci rusak.', 'error'); }
  finally { setBusy(button, false); }
}
async function refreshDashboard() {
  if (!state.token) return;
  const [me, stats, list] = await Promise.all([api('/auth/me'), api('/staff/stats'), api('/staff/reports?queue=' + encodeURIComponent($('#queueFilter')?.value || 'all'))]);
  state.user = me;
  $('#staffManagementPanel').hidden = !['admin', 'security_admin'].includes(me.role);
  renderStats(stats); renderOpdChart(stats.by_opd || {}); renderDashboardReports(list.items || []);
}
async function changeOwnPassword(event) {
  event.preventDefault();
  const current = $('#currentPassword').value;
  const next = $('#nextPassword').value;
  if (!current || next.length < 12 || current === next) {
    $('#passwordChangeResult').textContent = 'Masukkan kata sandi saat ini dan kata sandi baru yang berbeda (minimal 12 karakter).';
    return;
  }
  const button = $('#changePasswordForm button[type="submit"]'); setBusy(button, true, 'Mengganti kata sandi…');
  try {
    await api('/auth/change-password', { method: 'POST', body: JSON.stringify({ current_password: current, new_password: next }) });
    state.token = null; state.user = null; state.staffPrivateKey = null; state.staffPrivateUnlocked = false;
    sessionStorage.removeItem(TOKEN_KEY);
    $('#dashboardPanel').hidden = true; $('#loginPanel').hidden = false;
    $('#loginMessage').textContent = 'Kata sandi berhasil diganti. Masuk kembali menggunakan kata sandi baru.';
    $('#currentPassword').value = ''; $('#nextPassword').value = '';
    $('#passwordChangeResult').textContent = 'Berhasil. Semua token lama telah dicabut; silakan login kembali.';
    toast('Kata sandi berhasil diganti. Silakan login kembali.', 'success');
  } catch (error) {
    $('#passwordChangeResult').textContent = error.message; toast(error.message, 'error');
  } finally { setBusy(button, false); }
}

async function createStaffUser(event) {
  event.preventDefault();
  const form = $('#createStaffForm');
  const name = $('#newStaffName').value.trim();
  const email = $('#newStaffEmail').value.trim();
  const password = $('#newStaffPassword').value;
  if (name.length < 3 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 12) {
    $('#staffCreateResult').textContent = 'Periksa nama, email, dan kata sandi (minimal 12 karakter).';
    return;
  }
  const button = form.querySelector('button[type="submit"]'); setBusy(button, true, 'Membuat akun…');
  try {
    const created = await api('/staff/users', { method: 'POST', body: JSON.stringify({
      email, display_name: name, password, tenant_id: state.user.tenant_id,
      opd_id: $('#newStaffOpd').value, role: 'operator',
    }) });
    $('#staffCreateResult').textContent = `Akun ${created.email} berhasil dibuat untuk ${opdName(created.opd_id)}. Sampaikan kata sandi awal melalui kanal aman. Petugas dapat mengganti kata sandi melalui panel Keamanan akun.`;
    form.reset(); toast('Akun petugas berhasil dibuat.', 'success');
  } catch (error) {
    $('#staffCreateResult').textContent = error.message; toast(error.message, 'error');
  } finally { setBusy(button, false); }
}
function renderStats(stats) {
  const items = [
    ['Total laporan', stats.total], ['Menunggu tinjauan', stats.review_queue], ['Dalam eskalasi', stats.escalated], ['Selesai', stats.completed],
    ['Kepatuhan SLA selesai', stats.sla_compliance_percent == null ? '—' : `${stats.sla_compliance_percent}%`],
  ];
  $('#dashboardStats').innerHTML = items.map(([label, value]) => `<div class="stat-card"><strong>${escapeHTML(value)}</strong><span>${escapeHTML(label)}</span></div>`).join('');
}
function renderOpdChart(distribution) {
  const max = Math.max(1, ...Object.values(distribution));
  $('#opdChart').innerHTML = Object.entries(distribution).map(([id, count]) => `<div class="bar-row"><span>${escapeHTML(opdName(id))}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.round(count / max * 100)}%"></div></div><b>${count}</b></div>`).join('') || '<p class="field-help">Belum ada data laporan.</p>';
}
function renderDashboardReports(reports) {
  $('#reportCount').textContent = `${reports.length} laporan pada cakupan akun ini.`;
  $('#dashboardReports').innerHTML = reports.length ? reports.map((report) => {
    const units = report.opd_ids.map(opdName).join(', ') || 'Menunggu peninjauan OPD';
    const action = report.review_required
      ? `<div class="report-actions"><label for="route-${escapeHTML(report.ticket_id)}">Rutekan ke OPD<select id="route-${escapeHTML(report.ticket_id)}" data-route-select>${OPD.map((unit) => `<option value="${unit.id}">${escapeHTML(unit.name)}</option>`).join('')}</select></label><button class="button button-primary" type="button" data-route-ticket="${escapeHTML(report.ticket_id)}">Verifikasi & rutekan</button></div>`
      : report.status !== 'Selesai' ? `<div class="report-actions"><button class="button button-secondary" type="button" data-advance-ticket="${escapeHTML(report.ticket_id)}">Majukan ke ${escapeHTML(STATUS[STATUS.indexOf(report.status) + 1] || 'Selesai')}</button></div>` : '';
    return `<article class="report-card" data-report="${escapeHTML(report.ticket_id)}"><div class="report-card-top"><span class="ticket-number compact">${escapeHTML(report.ticket_id)}</span><span class="status-badge ${report.status === 'Selesai' ? 'success' : report.escalated ? 'danger' : 'warning'}">${escapeHTML(report.status)}</span></div><p class="report-meta"><span>${escapeHTML(TENANTS[report.tenant_id] || report.tenant_id)}</span><span>${escapeHTML(units)}</span><span>${report.anonymous ? 'Pelapor anonim' : 'Identitas terenkripsi'}</span><span>SLA: ${formatDate(report.due_at)}</span></p><p class="report-meta"><span>Skor saran (demo): ${Math.round(report.confidence * 100)}%</span><span>Engine: ${escapeHTML(report.ai_engine)}</span>${report.escalated ? '<strong class="error-text">SLA terlampaui</strong>' : ''}</p><div class="encrypted-placeholder" data-decrypted="${escapeHTML(report.ticket_id)}">Isi laporan disimpan sebagai ciphertext. Buka dengan kunci privat instansi untuk melihat detail.</div><div class="report-actions"><button class="button button-secondary" type="button" data-decrypt-ticket="${escapeHTML(report.ticket_id)}">${state.staffPrivateUnlocked ? 'Buka isi laporan' : 'Kunci instansi belum dibuka'}</button></div>${action}</article>`;
  }).join('') : '<div class="panel"><p>Belum ada laporan pada filter ini.</p></div>';
}
async function decryptStaffReport(ticket) {
  if (!state.staffPrivateKey) { toast('Buka kunci privat instansi terlebih dahulu.', 'error'); return; }
  const card = $(`[data-report="${CSS.escape(ticket)}"]`);
  try {
    const report = await api(`/staff/reports/${encodeURIComponent(ticket)}`);
    const details = await decryptStaffPayload(report, state.staffPrivateKey);
    const target = $(`[data-decrypted="${CSS.escape(ticket)}"]`, card);
    renderDecryptedDetails(target, details);
  } catch (error) { toast(error.message, 'error'); }
}
async function routeTicket(ticket) {
  const card = $(`[data-report="${CSS.escape(ticket)}"]`);
  const opdId = $('[data-route-select]', card)?.value;
  if (!opdId) return;
  try { await api(`/staff/reports/${encodeURIComponent(ticket)}/route`, { method: 'POST', body: JSON.stringify({ opd_id: opdId }) }); toast('Laporan diverifikasi dan diteruskan ke OPD.', 'success'); await refreshDashboard(); }
  catch (error) { toast(error.message, 'error'); }
}
async function advanceTicket(ticket) {
  const report = await api(`/staff/reports/${encodeURIComponent(ticket)}`);
  const next = STATUS[STATUS.indexOf(report.status) + 1];
  if (!next) return;
  try { await api(`/staff/reports/${encodeURIComponent(ticket)}/status`, { method: 'PATCH', body: JSON.stringify({ status: next }) }); toast(`Status laporan diperbarui menjadi ${next}.`, 'success'); await refreshDashboard(); }
  catch (error) { toast(error.message, 'error'); }
}
function logout() {
  state.token = null; state.user = null; state.staffPrivateKey = null; state.staffPrivateUnlocked = false;
  sessionStorage.removeItem(TOKEN_KEY); $('#dashboardPanel').hidden = true; $('#loginPanel').hidden = false;
  $('#keyStatus').textContent = ''; $('#dashboardStats').innerHTML = ''; $('#dashboardReports').innerHTML = '';
  toast('Anda telah keluar.');
}

// ---- Integrations and notifications ------------------------------------------
async function registerWebhook(event) {
  event.preventDefault();
  const button = $('#webhookForm button[type="submit"]'); setBusy(button, true, 'Mendaftarkan…');
  try {
    const result = await api('/staff/webhooks', { method: 'POST', body: JSON.stringify({ url: $('#webhookUrl').value.trim(), events: ['ticket.created', 'ticket.updated', 'ticket.routed', 'sla.breached'] }) });
    $('#webhookResult').innerHTML = `<div class="webhook-secret"><p><strong>Webhook terdaftar.</strong> Salin rahasia ini sekarang; server tidak menampilkannya kembali.</p><code>${escapeHTML(result.secret)}</code><button class="button button-secondary" type="button" id="copyWebhookSecret">Salin rahasia</button></div>`;
    $('#copyWebhookSecret').addEventListener('click', () => copyText(result.secret));
    $('#webhookUrl').value = ''; toast('Webhook berhasil didaftarkan.', 'success');
  } catch (error) { $('#webhookResult').textContent = error.message; toast(error.message, 'error'); }
  finally { setBusy(button, false); }
}
async function copyText(value) {
  try { await navigator.clipboard.writeText(value); toast('Berhasil disalin.', 'success'); }
  catch (_) { toast(`Salin manual: ${value}`, 'info'); }
}
async function enableNotifications() {
  if (!('Notification' in window)) return toast('Browser tidak mendukung notifikasi sistem.');
  try {
    const permission = await Notification.requestPermission();
    toast(permission === 'granted' ? 'Notifikasi browser diaktifkan.' : 'Izin notifikasi tidak diberikan.');
  } catch (_) { toast('Permintaan notifikasi gagal. Pastikan aplikasi dibuka melalui HTTPS atau localhost.', 'error'); }
}
async function pollTrackedReport() {
  const ticket = $('#ticketId').value.trim().toUpperCase();
  if (!ticket || document.visibilityState !== 'visible') return;
  try {
    const report = await api(`/reports/${encodeURIComponent(ticket)}`);
    if (state.lastTracked && report.trail.length > state.lastTracked.trail.length) {
      const newest = report.trail[report.trail.length - 1];
      toast(`Pembaruan ${ticket}: ${newest.message}`);
      if ('Notification' in window && Notification.permission === 'granted') new Notification(`LaporAman ${ticket}`, { body: newest.message });
    }
    const changed = !state.lastTracked || report.status !== state.lastTracked.status || report.trail.length !== state.lastTracked.trail.length || report.escalated !== state.lastTracked.escalated;
    state.lastTracked = report;
    if (changed) renderTracking(report);
  } catch (_) { /* keep the last rendered tracker state when offline */ }
}

// ---- Voice input and commands -------------------------------------------------
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
function dictate() {
  if (!SpeechRecognition) return toast('Pengenalan suara browser tidak tersedia. Coba Chrome atau Edge.', 'error');
  try {
    const recognition = new SpeechRecognition(); recognition.lang = 'id-ID'; recognition.interimResults = false;
    recognition.onresult = (event) => { $('#description').value += ($('#description').value ? ' ' : '') + event.results[0][0].transcript; renderTriage(); };
    recognition.onerror = (event) => toast(event.error === 'not-allowed' ? 'Izin mikrofon ditolak.' : 'Ucapan tidak dapat dikenali.', 'error');
    recognition.start(); toast('Silakan mulai berbicara.');
  } catch (_) { toast('Pengenalan suara tidak dapat dimulai. Periksa izin mikrofon dan koneksi browser.', 'error'); }
}
function stopVoice() {
  state.voiceActive = false;
  if (state.voiceRecognition) {
    state.voiceRecognition.onend = null;
    try { state.voiceRecognition.stop(); } catch (_) { /* recognition may already have stopped */ }
    state.voiceRecognition = null;
  }
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  $('#voiceCommand').setAttribute('aria-pressed', 'false');
}
function startVoice() {
  if (!SpeechRecognition) { toast('Perintah suara tidak didukung browser ini.', 'error'); return; }
  try {
    state.voiceActive = true; const recognition = new SpeechRecognition(); state.voiceRecognition = recognition;
    recognition.lang = 'id-ID'; recognition.continuous = true; recognition.interimResults = false;
    recognition.onresult = (event) => { const text = event.results[event.results.length - 1][0].transcript.toLowerCase().trim(); handleVoiceCommand(text); };
    recognition.onerror = (event) => { if (event.error === 'not-allowed' || event.error === 'service-not-allowed') { stopVoice(); toast('Izin mikrofon ditolak.', 'error'); } };
    recognition.onend = () => { if (state.voiceActive) { try { recognition.start(); } catch (_) { /* browser is stopping */ } } };
    recognition.start(); $('#voiceCommand').setAttribute('aria-pressed', 'true'); toast('Perintah suara aktif. Ucapkan “lapor”, “lacak”, “dashboard”, “integrasi”, atau “berhenti”.');
  } catch (_) { stopVoice(); toast('Perintah suara tidak dapat dimulai. Periksa izin mikrofon dan koneksi browser.', 'error'); }
}
function handleVoiceCommand(command) {
  if (/berhenti|matikan suara/.test(command)) { stopVoice(); toast('Perintah suara dimatikan.'); }
  else if (command.includes('lacak')) {
    const ticketMatch = command.match(/(la-\d{4}-\d{4}-[a-z0-9]{8})/i);
    go('lacak');
    if (ticketMatch) { $('#ticketId').value = ticketMatch[1].toUpperCase(); lookupReport(ticketMatch[1].toUpperCase()); }
  }
  else if (command.includes('dashboard') || command.includes('dasbor')) go('dasbor');
  else if (command.includes('integrasi')) go('integrasi');
  else if (command.includes('tentang')) go('tentang');
  else if (command.includes('lapor')) go('lapor');
  else if (command.includes('kontras')) togglePreference('#highContrast', 'data-contrast');
  else if (command.includes('perbesar')) { $('#zoom').value = Math.min(200, Number($('#zoom').value) + 25); applyZoom(); }
  else if (command.includes('perkecil')) { $('#zoom').value = Math.max(100, Number($('#zoom').value) - 25); applyZoom(); }
  else if (command.includes('anonim')) { $('#anonymous').checked = true; $('#anonymous').dispatchEvent(new Event('change')); }
  else if (command.startsWith('tulis ')) { $('#description').value += ($('#description').value ? ' ' : '') + command.slice(6); renderTriage(); }
  else if (/kirim laporan|kirim aduan|submit laporan/.test(command)) { $('#reportForm').requestSubmit(); }
  else toast(`Perintah tidak dikenali: ${command}`);
}

// ---- Event handlers ------------------------------------------------------------
function bindEvents() {
  window.addEventListener('hashchange', route);
  $('#reportForm').addEventListener('submit', submitReport);
  $('#description').addEventListener('input', renderTriage);
  $('#anonymous').addEventListener('change', (event) => {
    const anonymous = event.target.checked; $('#identityFields').hidden = anonymous;
    $('#identityFields').querySelectorAll('input').forEach((field) => { field.disabled = anonymous; if (anonymous) field.value = ''; });
  });
  $('#trackingForm').addEventListener('submit', (event) => { event.preventDefault(); state.lastTracked = null; lookupReport(); });
  $('#myTicketButtons').addEventListener('click', (event) => { const button = event.target.closest('[data-ticket]'); if (button) { $('#ticketId').value = button.dataset.ticket; state.lastTracked = null; lookupReport(button.dataset.ticket); } });
  $('#enableNotifications').addEventListener('click', enableNotifications);
  $('#loginForm').addEventListener('submit', staffLogin);
  $('#refreshDashboard').addEventListener('click', () => refreshDashboard().then(() => toast('Dashboard diperbarui.')).catch((error) => toast(error.message, 'error')));
  $('#logout').addEventListener('click', logout);
  $('#queueFilter').addEventListener('change', () => refreshDashboard().catch((error) => toast(error.message, 'error')));
  $('#dashboardReports').addEventListener('click', (event) => {
    const decryptButton = event.target.closest('[data-decrypt-ticket]');
    const routeButton = event.target.closest('[data-route-ticket]');
    const advanceButton = event.target.closest('[data-advance-ticket]');
    if (decryptButton) decryptStaffReport(decryptButton.dataset.decryptTicket);
    if (routeButton) routeTicket(routeButton.dataset.routeTicket);
    if (advanceButton) advanceTicket(advanceButton.dataset.advanceTicket);
  });
  $('#webhookForm').addEventListener('submit', registerWebhook);
  $('#createStaffForm').addEventListener('submit', createStaffUser);
  $('#changePasswordForm').addEventListener('submit', changeOwnPassword);
  $('#dictate').addEventListener('click', dictate);
  $('#useLocation').addEventListener('click', () => {
    if (!navigator.geolocation) return toast('Geolocation tidak didukung browser.');
    navigator.geolocation.getCurrentPosition((position) => { $('#location').value = `${position.coords.latitude.toFixed(5)}, ${position.coords.longitude.toFixed(5)}`; }, () => toast('Lokasi tidak tersedia atau izin ditolak.', 'error'), { enableHighAccuracy: false, timeout: 10000 });
  });
  $('#zoom').addEventListener('input', applyZoom);
  $('#highContrast').addEventListener('click', () => togglePreference('#highContrast', 'data-contrast'));
  $('#dyslexia').addEventListener('click', () => togglePreference('#dyslexia', 'data-dyslexia'));
  $('#voiceCommand').addEventListener('click', () => state.voiceActive ? stopVoice() : startVoice());
  document.addEventListener('click', (event) => {
    const track = event.target.closest('[data-track]'); const copy = event.target.closest('[data-copy-ticket]');
      if (track) { $('#ticketId').value = track.dataset.track; go('lacak'); lookupReport(track.dataset.track); }
    if (copy) copyText(copy.dataset.copyTicket);
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') pollTrackedReport(); });
}

async function init() {
  bindEvents(); restoreA11y(); route(); renderRecentTickets();
  try {
    const health = await api('/health');
    document.documentElement.dataset.backend = 'online';
    const integration = $('.integration-note');
    if (integration) integration.setAttribute('data-api-health', health.status);
  } catch (error) {
    document.documentElement.dataset.backend = 'offline';
    toast('Backend belum aktif. Jalankan backend melalui petunjuk README.', 'error');
  }
  if (state.token) {
    try {
      state.user = await api('/auth/me');
      $('#loginPanel').hidden = true; $('#dashboardPanel').hidden = false;
      $('#staffIdentity').textContent = state.user.name;
      $('#staffScope').textContent = `${TENANTS[state.user.tenant_id] || state.user.tenant_id} · ${state.user.opd_id === 'all' ? 'Seluruh OPD' : opdName(state.user.opd_id)} · ${state.user.role}`;
      await refreshKeyPanel(); await refreshDashboard();
    } catch (_) { logout(); }
  }
  setInterval(() => { if (location.hash === '#lacak') pollTrackedReport(); }, 20000);
}

document.addEventListener('DOMContentLoaded', init);
