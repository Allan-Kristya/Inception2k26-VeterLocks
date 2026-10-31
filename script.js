/* ==========================================
   1. SELECTOR HELPERS & GLOBAL CONSTANTS
   ========================================== */
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Data Wilayah & OPD
const WIL = {
  sby: 'Kota Surabaya',
  sda: 'Kabupaten Sidoarjo'
};

const OPD = [
<<<<<<< HEAD
  { id: 'pu', n: 'Dinas Pekerjaan Umum', sla: 72, k: ['jalan', 'berlubang', 'lubang', 'aspal', 'jembatan', 'drainase', 'selokan', 'banjir', 'trotoar', 'bolong', 'gorong'] },
  { id: 'hub', n: 'Dinas Perhubungan', sla: 48, k: ['macet', 'lalu lintas', 'lampu merah', 'rambu', 'angkot', 'parkir', 'kecelakaan', 'bus'] },
  { id: 'dlh', n: 'Dinas Lingkungan Hidup', sla: 48, k: ['sampah', 'limbah', 'bau', 'polusi', 'tpa', 'tps', 'sungai'] },
=======
  { id: 'pu', n: 'Dinas Pekerjaan Umum', sla: 72, k: ['jalan', 'berlubang', 'lubang', 'aspal', 'jembatan', 'drainase', 'selokan', 'banjir', 'trotoar'] },
  { id: 'hub', n: 'Dinas Perhubungan', sla: 48, k: ['macet', 'lalu lintas', 'lampu merah', 'rambu', 'angkot', 'parkir', 'kecelakaan', 'bus'] },
  { id: 'dlh', n: 'Dinas Lingkungan Hidup', sla: 48, k: ['sampah', 'limbah', 'bau', 'polusi', 'tpa', 'sungai'] },
>>>>>>> 727baf7617f4ddf0d980fc09ef48beae966f53bc
  { id: 'kes', n: 'Dinas Kesehatan', sla: 24, k: ['rumah sakit', 'puskesmas', 'obat', 'dokter', 'wabah', 'demam', 'posyandu'] },
  { id: 'duk', n: 'Dinas Kependudukan', sla: 96, k: ['ktp', 'kk', 'akta', 'kartu keluarga', 'kependudukan', 'domisili'] },
  { id: 'sos', n: 'Dinas Sosial', sla: 24, k: ['bantuan', 'bansos', 'lansia', 'terlantar', 'darurat', 'miskin', 'korban'] },
  { id: 'ins', n: 'Inspektorat', sla: 72, k: ['pungli', 'korupsi', 'suap', 'pungutan', 'gratifikasi', 'calo'] },
<<<<<<< HEAD
  { id: 'pen', n: 'Dinas Penerangan Jalan', sla: 48, k: ['lampu jalan', 'padam', 'gelap', 'listrik', 'pju', 'mati lampu'] }
=======
  { id: 'pen', n: 'Dinas Penerangan Jalan', sla: 48, k: ['lampu jalan', 'padam', 'gelap', 'listrik', 'pju'] }
>>>>>>> 727baf7617f4ddf0d980fc09ef48beae966f53bc
];

const ST = ['Diterima', 'Terverifikasi', 'Diproses', 'Selesai'];

const JAB = {
  Diterima: 'Sistem AI-Routing',
  Terverifikasi: 'Operator Pengaduan',
  Diproses: 'Kepala Bidang Teknis',
  Selesai: 'Kepala Dinas'
};

// Global Application State
const T = [];
const S = {
  wil: 'sby',
  opd: 'all',
  tok: null,
  voice: false
};

let seq = 0;
let skew = 0;
let HK = '';
let WL = [];
let glog = [];
let hits = {};

// Helper Utility Waktu & Formatting
const now = () => Date.now() + skew * 36e5;
const fmt = (t) => new Date(t).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
const opdName = (id) => (OPD.find((o) => o.id === id) || { n: '-' }).n;

// Helper Utility Kriptografi
const rnd = (n) => crypto.getRandomValues(new Uint8Array(n));

const b64 = (b) => {
  const u = new Uint8Array(b);
  let s = '';
  for (let i = 0; i < u.length; i += 8192) {
    s += String.fromCharCode.apply(null, u.subarray(i, i + 8192));
  }
  return btoa(s);
};

const ub = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
const fake = () => ({
  salt: b64(rnd(16)),
  iv: b64(rnd(12)),
  ct: b64(rnd(64))
});


/* ==========================================
<<<<<<< HEAD
   1b. KONFIGURASI INTEGRASI & PENYIMPANAN
   Isi CFG.aiEndpoint dengan URL layanan klasifikasi (mis. IndoBERTweet)
   untuk mengganti klasifikator simulasi. Kosong = klasifikator lokal.
   ========================================== */
const CFG = { aiEndpoint: '' };
const KEY = 'laporaman.v2';
const WHSEC = b64(rnd(24)); // rahasia demo penandatangan webhook
let JWT_KEY = null;
const code = () => [...rnd(4)].map((x) => 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[x % 31]).join('');

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ T, seq, skew }));
  } catch (e) {
    if (!save.w) { save.w = 1; say('Penyimpanan lokal penuh: data hanya di memori.'); }
  }
}
function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (d && Array.isArray(d.T) && d.T.length) { T.push(...d.T); seq = d.seq || 0; skew = d.skew || 0; return true; }
  } catch (e) {}
  return false;
}


/* ==========================================
=======
>>>>>>> 727baf7617f4ddf0d980fc09ef48beae966f53bc
   2. VOICE SYNTHESIS & TOAST NOTIFICATION
   ========================================== */
function say(m) {
  const e = $('#toast');
  e.textContent = m;
  e.classList.add('on');
  clearTimeout(say.t);
  say.t = setTimeout(() => e.classList.remove('on'), 4500);

  if (S.voice && window.speechSynthesis) {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(m);

    // Paksa penggunaan aksen/bahasa Indonesia
    u.lang = 'id-ID';

    // Cari voice model spesifik Bahasa Indonesia pada browser
    const voices = speechSynthesis.getVoices();
    const idVoice = voices.find((v) => v.lang.startsWith('id') || v.lang.includes('ID'));

    if (idVoice) {
      u.voice = idVoice;
    }

    speechSynthesis.speak(u);
  }
}

// Pre-load daftar voice bawaan browser
if (typeof window !== 'undefined' && window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = () => {
    window.speechSynthesis.getVoices();
  };
}


/* ==========================================
   3. SIMULASI API GATEWAY & WEBHOOK
   ========================================== */
function renderLog() {
  $('#glog').innerHTML =
    glog
      .map(
        (g) =>
          `<li>${fmt(g.t)} ${esc(g.route)} → <b class="${g.code > 200 ? 'bad' : ''}">${g.code}</b></li>`
      )
      .join('') || '<li>Belum ada permintaan.</li>';
}

<<<<<<< HEAD
/* JWT HS256 sungguhan (Web Crypto). Kunci hidup di peramban sehingga
   ini tetap simulasi gateway: produksi memakai kunci di KrakenD/IdP. */
const u64 = (s) => btoa(s).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
const b64u = (b) => b64(b).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
const unpad = (x) => x.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((x.length + 3) % 4);
async function hk() {
  return JWT_KEY || (JWT_KEY = await crypto.subtle.generateKey({ name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']));
}
async function signJWT(c) {
  const h = u64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const p = u64(JSON.stringify(c));
  const sig = await crypto.subtle.sign('HMAC', await hk(), new TextEncoder().encode(h + '.' + p));
  return h + '.' + p + '.' + b64u(sig);
}
async function verifyJWT(tok) {
  try {
    const [h, p, sg] = tok.split('.');
    const ok = await crypto.subtle.verify('HMAC', await hk(), ub(unpad(sg)), new TextEncoder().encode(h + '.' + p));
    if (!ok) return null;
    const c = JSON.parse(atob(unpad(p)));
    return c.exp > Date.now() ? c : null;
  } catch (e) {
    return null;
  }
}

async function gw(route, auth) {
  const t = Date.now();
  hits[route] = (hits[route] || []).filter((x) => t - x < 1e4);
  let code = 200;
  const c = auth ? await verifyJWT(S.tok || '') : null;

  if (auth && !c) {
    code = 401;
    S.claims = null;
=======
function gw(route, auth) {
  const t = Date.now();
  hits[route] = (hits[route] || []).filter((x) => t - x < 1e4);
  let code = 200;

  if (auth && !S.tok) {
    code = 401;
>>>>>>> 727baf7617f4ddf0d980fc09ef48beae966f53bc
  } else if (hits[route].length >= 8) {
    code = 429;
  } else {
    hits[route].push(t);
<<<<<<< HEAD
    if (c) S.claims = c;
=======
>>>>>>> 727baf7617f4ddf0d980fc09ef48beae966f53bc
  }

  glog.unshift({ t, route, code });
  glog.length = Math.min(glog.length, 8);
  renderLog();

<<<<<<< HEAD
  if (code === 401) say('Gateway menolak (401): token JWT tidak ada atau kedaluwarsa. Masuk di Dasbor instansi.');
  if (code === 429) say('Gateway membatasi laju permintaan (429). Coba lagi beberapa detik lagi.');
  return code === 200;
}

function rlsDeny(route) {
  glog.unshift({ t: Date.now(), route: route + ' (RLS)', code: 403 });
  glog.length = Math.min(glog.length, 8);
  renderLog();
  say('Ditolak (403): tiket di luar wilayah atau OPD pada token.');
}

async function sign(body) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(WHSEC), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(body)));
}

// Webhook: permintaan HTTP sungguhan (no-cors, respons tidak terbaca) bertanda tangan HMAC-SHA256.
async function emit(ev, t) {
  if (!HK) return;
  const payload = { event: ev, id: t.id, wilayah: t.wil, opd: t.opd, status: t.status, at: new Date(now()).toISOString() };
  let res;
  try {
    const sig = await sign(JSON.stringify(payload));
    await fetch(HK, { method: 'POST', mode: 'no-cors', keepalive: true, body: JSON.stringify({ payload, signature: 'sha256=' + sig }) });
    res = 'permintaan dikirim (respons server tidak terbaca)';
  } catch (e) {
    res = 'gagal: URL tidak terjangkau';
  }
  WL.unshift(`${fmt(now())} ${ev} ${t.id} → ${HK} (${res})`);
=======
  if (code === 401) {
    say('Gateway menolak: token JWT tidak ada. Masuk dahulu di Dasbor instansi.');
  }
  if (code === 429) {
    say('Gateway membatasi laju permintaan. Coba lagi beberapa detik lagi.');
  }

  return code === 200;
}

function emit(ev, t) {
  if (!HK) return;
  WL.unshift(`${fmt(now())} ${ev} ${t.id} → ${HK} (simulasi terkirim)`);
>>>>>>> 727baf7617f4ddf0d980fc09ef48beae966f53bc
  WL.length = Math.min(WL.length, 6);
  $('#wlog').innerHTML = WL.map((x) => `<li>${esc(x)}</li>`).join('');
}


/* ==========================================
   4. WEB CRYPTO API (ENCRYPTION VAULT)
   ========================================== */
async function dk(pw, salt, use) {
  const km = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, [
    'deriveKey'
  ]);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    km,
    { name: 'AES-GCM', length: 256 },
    false,
    [use]
  );
}

async function seal(o, pw) {
  const salt = rnd(16);
  const iv = rnd(12);
  const k = await dk(pw, salt, 'encrypt');
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    k,
    new TextEncoder().encode(JSON.stringify(o))
  );
  return { salt: b64(salt), iv: b64(iv), ct: b64(ct) };
}

async function unseal(v, pw) {
  const k = await dk(pw, ub(v.salt), 'decrypt');
  return JSON.parse(
    new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ub(v.iv) }, k, ub(v.ct)))
  );
}


/* ==========================================
   5. CLASSIFICATION & ENTITY EXTRACTION (AI)
   ========================================== */
<<<<<<< HEAD
const norm = (x) => x.toLowerCase().replace(/(.)\1{2,}/g, '$1$1').replace(/[^a-z0-9]+/g, ' ');
const hasKw = (x, k) => new RegExp('(^| )' + k + '(nya|an|lah|kah)?( |$)').test(' ' + x + ' ');

// SIMULASI: skor dari jumlah kata kunci. Bukan IndoBERTweet.
function classify(x) {
  x = norm(x);
  const r = [];
  OPD.forEach((o) => {
    const h = o.k.filter((k) => hasKw(x, k)).length;
=======
function classify(x) {
  x = x.toLowerCase();
  const r = [];
  OPD.forEach((o) => {
    const h = o.k.filter((k) => x.includes(k)).length;
>>>>>>> 727baf7617f4ddf0d980fc09ef48beae966f53bc
    if (h) r.push({ id: o.id, p: 1 - Math.pow(0.5, h) });
  });
  r.sort((a, b) => b.p - a.p);
  const top = r.length ? r[0].p : 0;
  return { labels: r.filter((l) => l.p >= 0.5), top, auto: top >= 0.7 };
}

<<<<<<< HEAD
// Titik integrasi model nyata: POST {text} -> {labels:[{id,p}]}. Belum diuji terhadap layanan sungguhan.
async function classifyRemote(text) {
  const r = await fetch(CFG.aiEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
  if (!r.ok) throw new Error('AI ' + r.status);
  const j = await r.json();
  const all = (j.labels || []).filter((l) => OPD.some((o) => o.id === l.id)).sort((a, b) => b.p - a.p);
  const top = all.length ? all[0].p : 0;
  return { labels: all.filter((l) => l.p >= 0.5), top, auto: top >= 0.7 };
}

function entity(d) {
  const re = /\b(jl\.?|jalan|desa|kec\.?|kecamatan|kelurahan|kel\.?|rs|rumah sakit|kampus|pasar)\s+(?=((?:[a-z0-9.]+\s?){1,4}))/gi;
  const stop = /^(di|yang|dan|parah|depan|dekat|sering|tolong|mohon|karena|sudah|belum|rusak|berlubang|macet|ada|sangat|sekali|ini|itu|banget|gelap|padam|banjir|bau|kotor)$/i;
  for (const m of d.matchAll(re)) {
    const w = [];
    for (const x of m[2].trim().split(/\s+/)) {
      if (stop.test(x) || w.length >= 3) break;
      w.push(x.replace(/[.,;]+$/, (p) => (/^(dr|jl|kec|kel)\.$/i.test(x) ? p : '')));
    }
    if (w.length) return (m[1] + ' ' + w.join(' ')).replace(/\s+/g, ' ').trim();
  }
  return '';
}

=======
>>>>>>> 727baf7617f4ddf0d980fc09ef48beae966f53bc
function ai() {
  const d = $('#desc').value.trim();
  const o = $('#ai');
  if (!d) {
    o.innerHTML = '';
    return;
  }
  const c = classify(d);
<<<<<<< HEAD
  const en = entity(d);
  const L = $('#loc');
  if (en && (!L.value || L.dataset.auto)) {
    L.value = en;
    L.dataset.auto = '1';
  }
  const eHtml = en ? '<p class="hint">Entitas lokasi terekstrak: <b>' + esc(en) + '</b></p>' : '';
=======

  // Regex Ekstraksi Entitas Lokasi Otomatis
  const locMatch = d.match(
    /(jl\.?|jalan|desa|kec\.?|kecamatan|kab\.?|kabupaten|rs|rumah sakit|kampus|pasar)\s+[a-zA-Z0-9 ]+/i
  );
  let eHtml = '';
  if (locMatch) {
    eHtml = '<p class="hint">Entitas terekstrak otomatis: <b>' + esc(locMatch[0].trim()) + '</b></p>';
    if (!$('#loc').value) $('#loc').value = locMatch[0].trim();
  }
>>>>>>> 727baf7617f4ddf0d980fc09ef48beae966f53bc

  o.innerHTML = c.labels.length
    ? c.labels.map((l) => `<span class="chip">${esc(opdName(l.id))} ${Math.round(l.p * 100)}%</span>`).join('') +
      eHtml +
<<<<<<< HEAD
      `<p class="hint">${c.auto ? 'Keyakinan cukup: tiket dirutekan otomatis.' : 'Keyakinan di bawah 70%: petugas meninjau terlebih dahulu.'}</p>`
=======
      `<p class="hint">${
        c.auto
          ? 'Keyakinan cukup: tiket dirutekan otomatis.'
          : 'Keyakinan di bawah 70%: petugas meninjau terlebih dahulu.'
      }</p>`
>>>>>>> 727baf7617f4ddf0d980fc09ef48beae966f53bc
    : eHtml + '<p class="hint">Belum ada kategori terdeteksi. Petugas akan meninjau laporan ini.</p>';
}


/* ==========================================
   6. MANAJEMEN TIKET & SLA
   ========================================== */
function mk(o) {
<<<<<<< HEAD
  const c = o.cls || classify(o.desc);
=======
  const c = classify(o.desc);
>>>>>>> 727baf7617f4ddf0d980fc09ef48beae966f53bc
  const opd = c.auto ? c.labels.map((l) => l.id) : [];
  const hrs = c.auto ? Math.min(...opd.map((i) => OPD.find((x) => x.id === i).sla)) : 24;
  const t0 = o.t || now();

  const t = {
<<<<<<< HEAD
    id: 'LA-2026-' + String(++seq).padStart(4, '0') + '-' + code(),
=======
    id: 'LA-2026-' + String(++seq).padStart(4, '0'),
>>>>>>> 727baf7617f4ddf0d980fc09ef48beae966f53bc
    wil: o.wil,
    desc: o.desc,
    loc: o.loc || '',
    labels: c.labels,
    conf: c.top,
    opd,
    review: !c.auto,
    status: 'Diterima',
    created: t0,
    due: t0 + hrs * 36e5,
    anon: !!o.anon,
    vault: o.vault,
    meta: o.meta || null,
    esc: false,
    trail: [
      { t: t0, s: 'Laporan diterima', by: 'Sistem AI-Routing' },
      {
        t: t0,
        s: c.auto
          ? 'Dirutekan otomatis ke ' + opd.map(opdName).join(', ')
          : 'Keyakinan rendah, menunggu tinjauan petugas',
        by: 'Sistem AI-Routing'
      }
    ]
  };

  T.unshift(t);
<<<<<<< HEAD
  save();
=======
>>>>>>> 727baf7617f4ddf0d980fc09ef48beae966f53bc
  return t;
}

function chk(t) {
  if (t.status !== 'Selesai' && !t.esc && now() > t.due) {
    t.esc = true;
    t.trail.push({ t: now(), s: 'Peringatan eskalasi: tenggat SLA terlampaui', by: 'Sistem SLA' });
    emit('sla.breached', t);
<<<<<<< HEAD
    save();
    return true;
  }
  return false;
}

/* Notifikasi pelapor: berjalan di perangkat ini (ID tiket disimpan lokal).
   Produksi memerlukan push server (FCM/APNs/WebSocket). */
const MK = 'laporaman.mine';
const mine = () => {
  try { return JSON.parse(localStorage.getItem(MK) || '{}'); } catch (e) { return {}; }
};
const setMine = (m) => {
  try { localStorage.setItem(MK, JSON.stringify(m)); } catch (e) {}
};
function unread() {
  const m = mine();
  return Object.keys(m).reduce((n, id) => {
    const t = T.find((x) => x.id === id);
    return n + (t && t.trail.length > m[id] ? t.trail.length - m[id] : 0);
  }, 0);
}
function badge() {
  const n = unread();
  $('#nb').textContent = n ? ' (' + n + ' baru)' : '';
}
function markSeen(t) {
  const m = mine();
  if (m[t.id] !== undefined) { m[t.id] = t.trail.length; setMine(m); }
  badge();
}
function renderMine() {
  const ids = Object.keys(mine());
  $('#mine').innerHTML = ids.length
    ? '<p class="hint">Laporan di perangkat ini:</p>' + ids.map((id) => `<button type="button" data-open="${esc(id)}">${esc(id)}</button>`).join(' ')
    : '';
}
const sent = {};
function notifyChanges() {
  const m = mine();
  Object.keys(m).forEach((id) => {
    const t = T.find((x) => x.id === id);
    if (!t || t.trail.length <= m[id] || sent[id + t.trail.length]) return;
    sent[id + t.trail.length] = 1;
    const last = t.trail[t.trail.length - 1].s;
    say('Notifikasi ' + id + ': ' + last);
    if (window.Notification && Notification.permission === 'granted') new Notification('LaporAman ' + id, { body: last });
    if (!$('#v-lacak').hidden && $('#tid').value.trim().toUpperCase() === id) lookup(id, true);
  });
  badge();
}

function bad(id, msg) {
  const e = $(id);
  e.setAttribute('aria-invalid', 'true');
  let m = $('#e-' + e.id);
  if (!m) {
    m = document.createElement('p');
    m.id = 'e-' + e.id;
    m.className = 'bad';
    m.setAttribute('role', 'alert');
    e.insertAdjacentElement('afterend', m);
  }
  m.textContent = msg;
  const dby = (e.getAttribute('aria-describedby') || '').split(' ').filter(Boolean);
  if (!dby.includes(m.id)) e.setAttribute('aria-describedby', dby.concat(m.id).join(' '));
}

function validate() {
  $$('[aria-invalid]').forEach((e) => e.removeAttribute('aria-invalid'));
  $$('p[id^="e-"]').forEach((m) => m.remove());
  const errs = [];
  const add = (id, m) => errs.push([id, m]);
  const anon = $('#anon').checked;
  const f = $('#file').files[0];
  if ($('#desc').value.trim().length < 15) add('#desc', 'Uraikan laporan minimal 15 karakter.');
  if (!anon) {
    if ($('#nama').value.trim().length < 3) add('#nama', 'Isi nama lengkap, atau aktifkan laporan anonim.');
    const nik = $('#nik').value.trim();
    if (nik && !/^\d{16}$/.test(nik)) add('#nik', 'Nomor KTP harus 16 digit angka.');
    const k = $('#kontak').value.trim();
    if (k && !(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(k) || /^(\+62|62|0)8\d{7,11}$/.test(k.replace(/[\s-]/g, '')))) {
      add('#kontak', 'Isi email atau nomor HP Indonesia yang valid.');
    }
  }
  if ($('#pw').value.length < 8) add('#pw', 'Kata sandi brankas minimal 8 karakter.');
  if (f && f.size > 1048576) add('#file', 'Lampiran melebihi 1 MB.');
  else if (f && !/^(image\/|application\/pdf)/.test(f.type)) add('#file', 'Lampiran hanya boleh foto atau PDF.');
  errs.forEach(([i, m]) => bad(i, m));
  if (errs.length) {
    $(errs[0][0]).focus();
    say(errs.length + ' isian perlu diperbaiki.');
  }
  return !errs.length;
}

async function submit() {
  if (!(await gw('POST /reports'))) return;
  if (!validate()) return;
  const btn = $('#send');
  btn.disabled = true;
  try {
    const d = $('#desc').value.trim();
    const pw = $('#pw').value;
    const anon = $('#anon').checked;
    const f = $('#file').files[0];

    const p = { detail: $('#sens').value };
    if (!anon) {
      p.nama = $('#nama').value.trim();
      p.nik = $('#nik').value.trim();
      p.kontak = $('#kontak').value.trim();
      p.alamat = $('#alamat').value.trim();
    }
    if (f) {
      p.lampiran = {
        nama: f.name,
        ukuran: f.size,
        data: await new Promise((r, j) => {
          const fr = new FileReader();
          fr.onload = () => r(fr.result);
          fr.onerror = j;
          fr.readAsDataURL(f);
        })
      };
    }

    let meta = null;
    if (anon) {
      meta = hex(await crypto.subtle.digest('SHA-256', new Uint8Array([...rnd(16), ...new TextEncoder().encode(navigator.userAgent + screen.width)])));
    }

    let cls = null;
    if (CFG.aiEndpoint) {
      try { cls = await classifyRemote(d); } catch (e) { say('Layanan AI tidak terjangkau; memakai klasifikator lokal.'); }
    }

    const vault = await seal(p, pw);
    const t = mk({ wil: $('#wil').value, desc: d, loc: $('#loc').value.trim(), anon, vault, meta, cls });
    const m = mine();
    m[t.id] = t.trail.length;
    setMine(m);
    emit('ticket.created', t);

    $('#res').innerHTML = `<div class="card ok">
    <h2>Laporan terkirim</h2>
    <p>Simpan nomor registrasi ini untuk melacak laporan Anda:</p>
    <p><span class="plate">${t.id}</span></p>
    <p>${t.review ? 'Keyakinan model rendah, laporan masuk antrean tinjauan petugas.' : 'Dirutekan otomatis ke ' + esc(t.opd.map(opdName).join(', ')) + '.'} Tenggat SLA: ${fmt(t.due)}.</p>
    <p class="hint mono">Yang diterima server: ${esc(t.vault.ct.slice(0, 48))}…</p>
    <button type="button" data-open="${t.id}">Lacak laporan ini</button>
  </div>`;

    ['#desc', '#loc', '#sens', '#pw', '#nama', '#nik', '#kontak', '#alamat', '#file'].forEach((x) => ($(x).value = ''));
    delete $('#loc').dataset.auto;
    ai();
    renderMine();
    say('Laporan terkirim. Nomor tiket ' + t.id);
  } catch (e) {
    say('Gagal mengenkripsi atau mengirim laporan. Coba lagi.');
  } finally {
    btn.disabled = false;
  }
=======
  }
}

async function submit() {
  if (!gw('POST /reports')) return;

  const d = $('#desc').value.trim();
  const pw = $('#pw').value;
  const anon = $('#anon').checked;
  const f = $('#file').files[0];

  if (d.length < 15) return say('Uraikan laporan minimal 15 karakter.');
  if (pw.length < 8) return say('Kata sandi brankas minimal 8 karakter.');
  if (f && f.size > 1048576) return say('Lampiran melebihi 1 MB.');

  const p = { detail: $('#sens').value };
  if (!anon) {
    p.nama = $('#nama').value;
    p.nik = $('#nik').value;
    p.kontak = $('#kontak').value;
    p.alamat = $('#alamat').value;
  }

  if (f) {
    p.lampiran = {
      nama: f.name,
      ukuran: f.size,
      data: await new Promise((r) => {
        const fr = new FileReader();
        fr.onload = () => r(fr.result);
        fr.readAsDataURL(f);
      })
    };
  }

  let meta = null;
  if (anon) {
    meta = hex(
      await crypto.subtle.digest(
        'SHA-256',
        new Uint8Array([...rnd(16), ...new TextEncoder().encode(navigator.userAgent + screen.width)])
      )
    );
  }

  const vault = await seal(p, pw);
  const t = mk({ wil: $('#wil').value, desc: d, loc: $('#loc').value, anon, vault, meta });

  emit('ticket.created', t);

  $('#res').innerHTML = `<div class="card ok">
    <h2>Laporan terkirim</h2>
    <p>Simpan nomor registrasi ini untuk melacak laporan Anda:</p>
    <p><span class="plate">${t.id}</span></p>
    <p>${
      t.review
        ? 'Keyakinan model rendah, laporan masuk antrean tinjauan petugas.'
        : 'Dirutekan otomatis ke ' + esc(t.opd.map(opdName).join(', ')) + '.'
    } Tenggat SLA: ${fmt(t.due)}.</p>
    <p class="hint mono">Yang diterima server: ${esc(t.vault.ct.slice(0, 48))}…</p>
  </div>`;

  ['#desc', '#loc', '#sens', '#pw', '#nama', '#nik', '#kontak', '#alamat', '#file'].forEach(
    (s) => ($(s).value = '')
  );
  ai();
  say('Laporan terkirim. Nomor tiket ' + t.id);
>>>>>>> 727baf7617f4ddf0d980fc09ef48beae966f53bc
}


/* ==========================================
   7. PELACAKAN TIKET & PENILAIAN CSAT
   ========================================== */
<<<<<<< HEAD
function rate(id, n) {
  const t = T.find((x) => x.id === id);
  if (!t) return;
  t.csat = n;
  t.trail.push({ t: now(), s: 'Penilaian CSAT ' + n + '/5', by: 'Pelapor' });
  save();
  lookup(id, true);
  say('Terima kasih atas penilaian Anda.');
  if (!$('#dash').hidden) dash();
}

let DL = null;
async function lookup(id, silent) {
  if (!silent && !(await gw('GET /reports/{id}'))) return;
  id = (typeof id === 'string' ? id : $('#tid').value).trim().toUpperCase();
  const o = $('#tout');
  DL = null;

  if (!/^LA-\d{4}-\d{4}-[A-Z0-9]{4}$/.test(id)) {
    o.innerHTML = '<p role="alert" class="bad">Format nomor tiket tidak valid. Contoh: LA-2026-0001-AB3K.</p>';
    return;
  }
  const t = T.find((x) => x.id === id);
=======
window.rate = function (id, s) {
  const t = T.find((x) => x.id === id);
  if (t) {
    t.csat = s;
    lookup();
    say('Terima kasih atas penilaian Anda.');
    if ($('#dash').hidden === false) dash();
  }
};

async function lookup() {
  if (!gw('GET /reports/{id}')) return;

  const t = T.find((x) => x.id === $('#tid').value.trim().toUpperCase());
  const o = $('#tout');

>>>>>>> 727baf7617f4ddf0d980fc09ef48beae966f53bc
  if (!t) {
    o.innerHTML = '<p role="alert" class="bad">Nomor tiket tidak ditemukan.</p>';
    return;
  }

  chk(t);
<<<<<<< HEAD
  markSeen(t);
=======
>>>>>>> 727baf7617f4ddf0d980fc09ef48beae966f53bc
  const i = ST.indexOf(t.status);
  const left = t.due - now();
  const pw = $('#pw2').value;
  let vh = '';

  if (pw) {
    try {
      const p = await unseal(t.vault, pw);
      if (p.lampiran) {
<<<<<<< HEAD
        DL = { att: p.lampiran };
        p.lampiran = p.lampiran.nama + ' (' + Math.round(p.lampiran.ukuran / 1024) + ' KB)';
      }
      vh = `<h3>Detail terenkripsi, terbuka di perangkat Anda</h3><pre>${esc(JSON.stringify(p, null, 2))}</pre>${
        DL ? '<button type="button" data-dl>Unduh lampiran (didekripsi di perangkat)</button>' : ''
      }`;
    } catch (e) {
      vh = '<p role="alert" class="bad">Kata sandi tidak cocok. Tanpa kunci yang benar, data tidak bisa dibuka siapa pun.</p>';
=======
        p.lampiran = p.lampiran.nama + ' (' + Math.round(p.lampiran.ukuran / 1024) + ' KB)';
      }
      vh = `<h3>Detail terenkripsi, terbuka di perangkat Anda</h3><pre>${esc(
        JSON.stringify(p, null, 2)
      )}</pre>`;
    } catch (e) {
      vh =
        '<p role="alert" class="bad">Kata sandi tidak cocok. Tanpa kunci yang benar, data tidak bisa dibuka siapa pun.</p>';
>>>>>>> 727baf7617f4ddf0d980fc09ef48beae966f53bc
    }
  }

  const who =
    t.status === 'Selesai'
      ? 'Selesai ditangani'
      : JAB[ST[i + 1]] + ' ' + (t.opd[0] ? opdName(t.opd[0]) : '(menunggu tinjauan petugas)');

  let csatHtml = '';
  if (t.status === 'Selesai' && !t.csat) {
    csatHtml = `<div class="card ok" style="margin-top:1rem">
      <h3>Berikan Penilaian (CSAT)</h3>
      <p class="hint">Seberapa puas Anda dengan penanganan laporan ini?</p>
      <div class="row">
<<<<<<< HEAD
        <button type="button" data-id="${t.id}" data-rate="5">Bagus (5)</button>
        <button type="button" data-id="${t.id}" data-rate="3">Cukup (3)</button>
        <button type="button" data-id="${t.id}" data-rate="1">Buruk (1)</button>
      </div>
    </div>`;
  } else if (t.csat) {
    csatHtml = `<p><b>Penilaian Pelayanan (CSAT):</b> ${t.csat}/5</p>`;
=======
        <button type="button" onclick="rate('${t.id}', 5)">Bagus (5)</button>
        <button type="button" onclick="rate('${t.id}', 3)">Cukup (3)</button>
        <button type="button" onclick="rate('${t.id}', 1)">Buruk (1)</button>
      </div>
    </div>`;
  } else if (t.csat) {
    csatHtml = `<div style="margin-top:1rem">
      <p><b>Penilaian Pelayanan (CSAT):</b> ${t.csat}/5 Bintang</p>
    </div>`;
>>>>>>> 727baf7617f4ddf0d980fc09ef48beae966f53bc
  }

  o.innerHTML = `<div class="card">
    <span class="plate">${t.id}</span>
<<<<<<< HEAD
    <ol class="steps">${ST.map((x, k) => `<li class="${k <= i ? 'done' : ''}"${k === i ? ' aria-current="step"' : ''}>${x}</li>`).join('')}</ol>
    <p><b>Ditangani oleh:</b> ${esc(who)}</p>
    <p><b>Tenggat SLA:</b> ${fmt(t.due)}${t.status !== 'Selesai' && left > 0 ? ' (sisa ' + Math.ceil(left / 36e5) + ' jam)' : ''}</p>
    ${t.esc ? '<p class="bad" role="alert">Peringatan eskalasi: tenggat SLA terlampaui.</p>' : ''}
    <h3>Jejak audit</h3>
    <ol class="trail">${t.trail.map((x) => `<li><time>${fmt(x.t)}</time> ${esc(x.s)} <span class="hint">oleh ${esc(x.by)}</span></li>`).join('')}</ol>
=======
    <ol class="steps">${ST.map(
      (s, k) => `<li class="${k <= i ? 'done' : ''}"${k === i ? ' aria-current="step"' : ''}>${s}</li>`
    ).join('')}</ol>
    <p><b>Ditangani oleh:</b> ${esc(who)}</p>
    <p><b>Tenggat SLA:</b> ${fmt(t.due)}${
    t.status !== 'Selesai' && left > 0 ? ' (sisa ' + Math.ceil(left / 36e5) + ' jam)' : ''
  }</p>
    ${t.esc ? '<p class="bad" role="alert">Peringatan eskalasi: tenggat SLA terlampaui.</p>' : ''}
    <h3>Jejak audit</h3>
    <ol class="trail">${t.trail
      .map(
        (x) =>
          `<li><time>${fmt(x.t)}</time> ${esc(x.s)} <span class="hint">oleh ${esc(x.by)}</span></li>`
      )
      .join('')}</ol>
>>>>>>> 727baf7617f4ddf0d980fc09ef48beae966f53bc
    ${vh}
    ${csatHtml}
  </div>`;
}


/* ==========================================
   8. DASBOR INSTANSI & DISPOSISI OPERATOR
   ========================================== */
function row(t) {
  const i = ST.indexOf(t.status);
  const acts = t.review
    ? `<label>Rutekan ke <select data-as="${t.id}">${OPD.map(
        (o) => `<option value="${o.id}">${o.n}</option>`
      ).join('')}</select></label><button type="button" data-asg="${t.id}">Terapkan</button>`
    : i < 3
    ? `<button type="button" data-adv="${t.id}">Maju ke ${ST[i + 1]}</button>`
    : '';

  return `<article class="card">
    <div class="row">
      <span class="plate sm">${t.id}</span>
      <span class="chip">${t.status}</span>
      ${t.esc ? '<span class="chip bad">Eskalasi: SLA terlampaui</span>' : ''}
      ${t.anon ? '<span class="chip">Anonim</span>' : ''}
    </div>
    <p>${esc(t.desc)}</p>
    <p class="hint">${esc(t.loc || 'Lokasi tidak diisi')} · Tenggat ${fmt(t.due)} · ${
    t.review ? 'Antrean tinjauan' : esc(t.opd.map(opdName).join(', '))
  } · Keyakinan AI ${Math.round(t.conf * 100)}%</p>
    <p class="hint mono">Isi terenkripsi: ${esc(t.vault.ct.slice(0, 40))}… (server tidak punya kunci)${
    t.meta ? '<br>Hash perangkat: ' + esc(t.meta.slice(0, 20)) + '…' : ''
  }</p>
    <div class="row">${acts}</div>
  </article>`;
}

<<<<<<< HEAD
// Simulasi Row-Level Security: satu-satunya predikat akses, dipakai semua kueri dan mutasi.
const visible = (t, c) => !!c && t.wil === c.wil && (c.opd === 'all' || t.opd.includes(c.opd));
const scope = () => T.filter((t) => visible(t, S.claims));
=======
function scope() {
  return T.filter((t) => t.wil === S.wil && (S.opd === 'all' || t.opd.includes(S.opd)));
}
>>>>>>> 727baf7617f4ddf0d980fc09ef48beae966f53bc

function dash() {
  T.forEach(chk);
  const L = scope();
  const done = L.filter((t) => t.status === 'Selesai').length;
  const ok = L.filter((t) => !t.esc).length;
  const cf = L.length ? Math.round((L.reduce((a, t) => a + t.conf, 0) / L.length) * 100) : 0;
  const cL = L.filter((t) => t.csat);
  const avg = cL.length ? (cL.reduce((a, t) => a + t.csat, 0) / cL.length).toFixed(1) : '-';

  $('#stats').innerHTML = [
    ['Laporan', L.length],
    ['Selesai', done],
    ['Kepatuhan SLA', (L.length ? Math.round((ok / L.length) * 100) : 100) + '%'],
<<<<<<< HEAD
    ['Eskalasi SLA', L.length - ok],
    ['Rata-rata keyakinan AI', cf + '%'],
    ['Antrean tinjauan', L.filter((t) => t.review).length],
    ['Rata-rata CSAT', avg + '/5']
  ].map(([a, b]) => `<div class="stat"><b>${b}</b><span>${a}</span></div>`).join('');

  const rows = OPD.map((o) => [o.n, L.filter((t) => t.opd.includes(o.id)).length]);
  rows.push(['Antrean tinjauan', L.filter((t) => t.review).length]);
  const mx = Math.max(1, ...rows.map((r) => r[1]));
  const bars = rows.filter((r) => r[1]).map(([n, v]) => `<li><span>${esc(n)}</span><meter min="0" max="${mx}" value="${v}" aria-label="${esc(n)}: ${v} laporan"></meter><b>${v}</b></li>`).join('');
  $('#chart').innerHTML = `<div class="card"><h2>Volume laporan per OPD</h2>${bars ? '<ul class="bars">' + bars + '</ul>' : '<p class="hint">Belum ada data.</p>'}</div>`;

  $('#list').innerHTML = L.length ? L.map(row).join('') : '<p>Belum ada laporan untuk filter ini.</p>';
  save();
  notifyChanges();
}

async function adv(id) {
  if (!(await gw('PATCH /reports/{id}', true))) return;
  const t = T.find((x) => x.id === id);
  if (!t || !visible(t, S.claims)) return rlsDeny('PATCH /reports/{id}');
  if (t.review) return say('Tiket menunggu tinjauan: rutekan ke OPD terlebih dahulu.');
=======
    ['Rata-rata keyakinan AI', cf + '%'],
    ['Antrean tinjauan', L.filter((t) => t.review).length],
    ['Rata-rata CSAT', avg + '/5']
  ]
    .map(([a, b]) => `<div class="stat"><b>${b}</b><span>${a}</span></div>`)
    .join('');

  $('#list').innerHTML = L.length
    ? L.map(row).join('')
    : '<p>Belum ada laporan untuk filter ini.</p>';
}

function adv(id) {
  if (!gw('PATCH /reports/{id}', true)) return;
  const t = T.find((x) => x.id === id);
>>>>>>> 727baf7617f4ddf0d980fc09ef48beae966f53bc
  const n = ST[ST.indexOf(t.status) + 1];
  if (!n) return;
  t.status = n;
  t.trail.push({ t: now(), s: 'Status: ' + n, by: JAB[n] + ' ' + opdName(t.opd[0]) });
  emit('ticket.updated', t);
  dash();
}

<<<<<<< HEAD
async function asg(id, o) {
  if (!(await gw('PATCH /reports/{id}', true))) return;
  const t = T.find((x) => x.id === id);
  if (!t || !visible(t, S.claims) || !OPD.some((x) => x.id === o)) return rlsDeny('PATCH /reports/{id}');
  t.opd = [o];
  t.review = false;
  t.due = now() + OPD.find((x) => x.id === o).sla * 36e5;
  t.trail.push({ t: now(), s: 'Ditinjau petugas, dirutekan ke ' + opdName(o), by: 'Operator Pengaduan' });
=======
function asg(id, o) {
  if (!gw('PATCH /reports/{id}', true)) return;
  const t = T.find((x) => x.id === id);
  t.opd = [o];
  t.review = false;
  t.due = now() + OPD.find((x) => x.id === o).sla * 36e5;
  t.trail.push({
    t: now(),
    s: 'Ditinjau petugas, dirutekan ke ' + opdName(o),
    by: 'Operator Pengaduan'
  });
>>>>>>> 727baf7617f4ddf0d980fc09ef48beae966f53bc
  emit('ticket.routed', t);
  dash();
}


/* ==========================================
   9. SPESIFIKASI OPENAPI & SPEECH COMMANDS
   ========================================== */
<<<<<<< HEAD
const op = (s, pub) => ({
  summary: s,
  security: pub ? [] : [{ bearerAuth: [] }],
  responses: {
    '200': { description: 'Berhasil' },
    ...(pub ? {} : { '401': { description: 'Token JWT tidak valid atau kedaluwarsa' }, '403': { description: 'Di luar wilayah/OPD token (RLS)' } }),
    '429': { description: 'Batas laju terlampaui' }
  }
});
const ref = (n) => ({ content: { 'application/json': { schema: { $ref: '#/components/schemas/' + n } } } });
const idp = [{ name: 'id', in: 'path', required: true, schema: { type: 'string', pattern: '^LA-\\d{4}-\\d{4}-[A-Z0-9]{4}$' } }];

const API = {
  openapi: '3.1.0',
  info: { title: 'LaporAman Integration API', version: '1.0.0', description: 'Pertukaran data pengaduan untuk ekosistem SPBE. Spesifikasi target; prototipe peramban hanya mensimulasikannya.' },
  servers: [{ url: 'https://api.laporaman.example/v1' }],
  paths: {
    '/reports': {
      get: { ...op('Daftar laporan pada wilayah dan OPD token'), responses: { ...op('').responses, '200': { description: 'Berhasil', ...ref('TicketList') } } },
      post: {
        ...op('Buat laporan terenkripsi sisi klien', true),
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['wilayah', 'deskripsi', 'vault'],
          properties: { wilayah: { type: 'string' }, deskripsi: { type: 'string', minLength: 15 }, lokasi: { type: 'string' }, anonim: { type: 'boolean' }, vault: { $ref: '#/components/schemas/Vault' } }
        } } } }
      }
    },
    '/reports/{id}': {
      get: { ...op('Lacak status, jejak audit, dan tenggat SLA', true), parameters: idp, responses: { ...op('', true).responses, '200': { description: 'Berhasil', ...ref('Ticket') }, '404': { description: 'Tiket tidak ditemukan' } } },
      patch: { ...op('Perbarui status atau rutekan ulang'), parameters: idp }
    },
    '/stats': { get: { ...op('Rekap kepatuhan SLA dan volume laporan'), responses: { ...op('').responses, '200': { description: 'Berhasil', ...ref('Stats') } } } },
    '/webhooks': {
      post: {
        ...op('Daftarkan URL webhook untuk ticket.created, ticket.updated, ticket.routed, sla.breached'),
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['url'], properties: { url: { type: 'string', format: 'uri' } } } } } }
      }
    }
  },
  webhooks: { ticketEvent: { post: { summary: 'Dikirim ke URL terdaftar, ditandatangani HMAC-SHA256 pada kolom signature', requestBody: ref('WebhookEvent') } } },
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    schemas: {
      Vault: { type: 'object', description: 'Ciphertext AES-256-GCM, kunci PBKDF2-HMAC-SHA256 100.000 iterasi, dibuat di klien', required: ['salt', 'iv', 'ct'], properties: { salt: { type: 'string' }, iv: { type: 'string' }, ct: { type: 'string' } } },
      Ticket: { type: 'object', properties: { id: { type: 'string' }, status: { enum: ST }, opd: { type: 'array', items: { type: 'string' } }, due: { type: 'string', format: 'date-time' }, escalated: { type: 'boolean' }, trail: { type: 'array', items: { type: 'object', properties: { t: { type: 'string', format: 'date-time' }, s: { type: 'string' }, by: { type: 'string' } } } } } },
      TicketList: { type: 'array', items: { $ref: '#/components/schemas/Ticket' } },
      Stats: { type: 'object', properties: { wilayah: { type: 'string' }, total: { type: 'integer' }, status: { type: 'object' }, eskalasi: { type: 'integer' }, antrean_tinjauan: { type: 'integer' } } },
      WebhookEvent: { type: 'object', properties: { payload: { type: 'object', properties: { event: { type: 'string' }, id: { type: 'string' }, wilayah: { type: 'string' }, opd: { type: 'array', items: { type: 'string' } }, status: { type: 'string' }, at: { type: 'string', format: 'date-time' } } }, signature: { type: 'string' } } }
    }
=======
const op = (s) => ({
  summary: s,
  security: [{ bearerAuth: [] }],
  responses: {
    '200': { description: 'Berhasil' },
    '401': { description: 'Token JWT tidak valid' },
    '429': { description: 'Batas laju terlampaui' }
  }
});

const API = {
  openapi: '3.1.0',
  info: {
    title: 'LaporAman Integration API',
    version: '1.0.0',
    description: 'Pertukaran data pengaduan untuk ekosistem SPBE'
  },
  servers: [{ url: 'https://api.laporaman.example/v1' }],
  paths: {
    '/reports': {
      get: op('Daftar laporan pada wilayah dan OPD token'),
      post: {
        ...op('Buat laporan terenkripsi sisi klien'),
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['wilayah', 'deskripsi', 'vault'],
                properties: {
                  wilayah: { type: 'string' },
                  deskripsi: { type: 'string' },
                  lokasi: { type: 'string' },
                  anonim: { type: 'boolean' },
                  vault: {
                    type: 'object',
                    properties: { salt: { type: 'string' }, iv: { type: 'string' }, ct: { type: 'string' } }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/reports/{id}': {
      get: {
        ...op('Lacak status, jejak audit, dan tenggat SLA'),
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }]
      },
      patch: {
        ...op('Perbarui status atau rutekan ulang'),
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }]
      }
    },
    '/stats': { get: op('Rekap kepatuhan SLA dan volume laporan') },
    '/webhooks': {
      post: op('Daftarkan URL webhook untuk ticket.created, ticket.updated, ticket.routed, sla.breached')
    }
  },
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } }
>>>>>>> 727baf7617f4ddf0d980fc09ef48beae966f53bc
  }
};

function go(v) {
  location.hash = v;
}

function route() {
  const v = location.hash.slice(1);
  const k = ['lapor', 'lacak', 'dasbor', 'integrasi', 'tentang'].includes(v) ? v : 'lapor';
  $$('.view').forEach((s) => (s.hidden = s.id !== 'v-' + k));
  $$('nav a').forEach((a) =>
    a.hash === '#' + k ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')
  );
  $('#v-' + k + ' h1').focus({ preventScroll: true });
<<<<<<< HEAD
  document.title = $('#v-' + k + ' h1').textContent + ' · LaporAman';
}

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null;
=======
}

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
>>>>>>> 727baf7617f4ddf0d980fc09ef48beae966f53bc

function listen(cb) {
  if (!SR) return say('Pengenalan suara tidak didukung peramban ini. Coba Chrome atau Edge.');
  const r = new SR();
  r.lang = 'id-ID';
  r.onresult = (e) => cb(e.results[0][0].transcript);
<<<<<<< HEAD
  r.onerror = (e) => say(e.error === 'not-allowed' ? 'Izin mikrofon ditolak. Aktifkan di pengaturan peramban.' : 'Suara tidak tertangkap. Coba lagi.');
=======
  r.onerror = () => say('Suara tidak tertangkap. Periksa izin mikrofon.');
>>>>>>> 727baf7617f4ddf0d980fc09ef48beae966f53bc
  r.start();
  say('Mendengarkan…');
}

<<<<<<< HEAD
// Perintah suara kontinu: aktif sampai dimatikan (tombol atau ucapan "berhenti").
function startVoice() {
  if (!SR) {
    $('#vc').setAttribute('aria-pressed', 'false');
    return say('Pengenalan suara tidak didukung peramban ini. Coba Chrome atau Edge.');
  }
  S.voice = true;
  rec = new SR();
  rec.lang = 'id-ID';
  rec.continuous = true;
  rec.onresult = (e) => {
    if (window.speechSynthesis && speechSynthesis.speaking) return;
    const r = e.results[e.results.length - 1];
    if (r.isFinal) cmd(r[0].transcript);
  };
  rec.onerror = (e) => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      stopVoice();
      say('Izin mikrofon ditolak. Aktifkan di pengaturan peramban.');
    }
  };
  rec.onend = () => {
    if (S.voice) try { rec.start(); } catch (e) {}
  };
  rec.start();
  say('Perintah suara aktif. Ucapkan: lapor, lacak, anonim, kirim, perbesar, atau berhenti.');
}

function stopVoice() {
  S.voice = false;
  if (rec) { rec.onend = null; rec.stop(); rec = null; }
  if (window.speechSynthesis) speechSynthesis.cancel();
  $('#vc').setAttribute('aria-pressed', 'false');
}

=======
>>>>>>> 727baf7617f4ddf0d980fc09ef48beae966f53bc
function zoom(d) {
  const z = $('#zoom');
  z.value = Math.min(200, Math.max(100, +z.value + d));
  z.dispatchEvent(new Event('input'));
}

function cmd(x) {
<<<<<<< HEAD
  x = x.toLowerCase().trim();
  const w = x.match(/^(tulis|isi laporan)\s+(.+)/);
  if (w) {
    const d = $('#desc');
    d.value += (d.value ? ' ' : '') + w[2];
    ai();
    go('lapor');
    say('Teks ditambahkan ke isi laporan.');
  } else if (/berhenti|matikan suara/.test(x)) { stopVoice(); say('Perintah suara dimatikan.'); }
  else if (x.includes('anonim')) $('#anon').click();
=======
  x = x.toLowerCase();
  if (x.includes('anonim')) $('#anon').click();
>>>>>>> 727baf7617f4ddf0d980fc09ef48beae966f53bc
  else if (x.includes('kirim')) submit();
  else if (x.includes('lacak') || x.includes('pelacak')) go('lacak');
  else if (x.includes('dasbor')) go('dasbor');
  else if (x.includes('integrasi')) go('integrasi');
  else if (x.includes('tentang')) go('tentang');
<<<<<<< HEAD
  else if (x.includes('lokasi')) $('#geo').click();
=======
>>>>>>> 727baf7617f4ddf0d980fc09ef48beae966f53bc
  else if (x.includes('lapor')) go('lapor');
  else if (x.includes('kontras')) $('#hc').click();
  else if (x.includes('perbesar')) zoom(25);
  else if (x.includes('perkecil')) zoom(-25);
  else say('Perintah tidak dikenali: ' + x);
}


/* ==========================================
   10. EVENT LISTENERS & INITIALIZATION
   ========================================== */
function tog(id, fn) {
  $(id).onclick = (e) => {
    const b = e.currentTarget;
    const on = b.getAttribute('aria-pressed') !== 'true';
    b.setAttribute('aria-pressed', on);
    fn(on);
<<<<<<< HEAD
    pref();
  };
}

function pref() {
  try {
    localStorage.setItem('laporaman.a11y', JSON.stringify({ hc: $('#hc').getAttribute('aria-pressed') === 'true', dys: $('#dys').getAttribute('aria-pressed') === 'true', z: $('#zoom').value }));
  } catch (e) {}
}

=======
  };
}

>>>>>>> 727baf7617f4ddf0d980fc09ef48beae966f53bc
tog('#hc', (on) => document.documentElement.toggleAttribute('data-contrast', on));
tog('#dys', (on) => document.documentElement.toggleAttribute('data-dys', on));

$('#zoom').oninput = (e) => {
  document.documentElement.style.setProperty('--z', e.target.value / 100);
  $('#zo').textContent = e.target.value + '%';
<<<<<<< HEAD
  pref();
};

tog('#vc', (on) => (on ? startVoice() : (stopVoice(), say('Perintah suara dimatikan.'))));
=======
};

$('#vc').onclick = () => {
  S.voice = true;
  listen(cmd);
};
>>>>>>> 727baf7617f4ddf0d980fc09ef48beae966f53bc

$('#mic').onclick = () =>
  listen((t) => {
    const d = $('#desc');
    d.value += (d.value ? ' ' : '') + t;
    ai();
  });

$('#geo').onclick = () =>
  navigator.geolocation
    ? navigator.geolocation.getCurrentPosition(
        (p) => ($('#loc').value = p.coords.latitude.toFixed(5) + ', ' + p.coords.longitude.toFixed(5)),
        () => say('Lokasi tidak tersedia.')
      )
    : say('Lokasi tidak didukung.');

$('#desc').oninput = ai;

$('#anon').onchange = (e) =>
  $$('#idf input').forEach((i) => {
    i.disabled = e.target.checked;
    if (e.target.checked) i.value = '';
  });

$('#send').onclick = submit;
<<<<<<< HEAD
$('#trk').onclick = () => lookup();
=======
$('#trk').onclick = lookup;
>>>>>>> 727baf7617f4ddf0d980fc09ef48beae966f53bc
$('#tid').onkeydown = (e) => {
  if (e.key === 'Enter') lookup();
};

<<<<<<< HEAD
$('#login').onclick = async () => {
  S.tok = await signJWT({ sub: 'operator', wil: $('#dwil').value, opd: $('#dopd').value, iat: Date.now(), exp: Date.now() + 36e5 });
  S.claims = await verifyJWT(S.tok);
  $('#tok').textContent = 'Token HS256 aktif (berlaku 1 jam): ' + S.tok.slice(0, 56) + '…';
  $('#dash').hidden = false;
  $('#logout').hidden = false;
  if (await gw('GET /reports', true)) dash();
};

$('#logout').onclick = () => {
  S.tok = null;
  S.claims = null;
  $('#dash').hidden = true;
  $('#logout').hidden = true;
  $('#tok').textContent = 'Belum masuk. Gateway menolak permintaan tanpa token.';
  say('Token dihapus. Anda telah keluar.');
=======
$('#login').onclick = () => {
  S.wil = $('#dwil').value;
  S.opd = $('#dopd').value;
  const u = (s) => btoa(s).replace(/=/g, '');
  S.tok =
    u('{"alg":"RS256","typ":"JWT"}') +
    '.' +
    u(JSON.stringify({ sub: 'operator', wil: S.wil, opd: S.opd, exp: Date.now() + 36e5 })) +
    '.' +
    b64(rnd(12)).replace(/=/g, '');
  $('#tok').textContent = 'Token aktif: ' + S.tok.slice(0, 56) + '…';
  $('#dash').hidden = false;
  if (gw('GET /reports', true)) dash();
>>>>>>> 727baf7617f4ddf0d980fc09ef48beae966f53bc
};

$('#skew').onclick = () => {
  skew += 24;
<<<<<<< HEAD
  save();
=======
>>>>>>> 727baf7617f4ddf0d980fc09ef48beae966f53bc
  $('#skew').textContent = 'Majukan waktu simulasi 24 jam (maju ' + skew + ' jam)';
  if (S.tok) dash();
  say('Waktu simulasi maju ' + skew + ' jam.');
};

$('#list').onclick = (e) => {
  const a = e.target.closest('[data-adv]');
  const b = e.target.closest('[data-asg]');
  if (a) adv(a.dataset.adv);
  if (b) asg(b.dataset.asg, $(`[data-as="${b.dataset.asg}"]`).value);
};

$('#hset').onclick = () => {
<<<<<<< HEAD
  const v = $('#hook').value.trim();
  if (!v) { HK = ''; return say('Webhook dihapus.'); }
  let u = null;
  try { u = new URL(v); } catch (e) {}
  if (!u || !/^https?:$/.test(u.protocol)) return say('URL webhook tidak valid. Gunakan alamat https://…');
  HK = u.href;
  say('Webhook disimpan.');
};

$('#getstat').onclick = async () => {
  if (!(await gw('GET /stats', true))) return;
  const L = scope();
  const by = (k) => L.reduce((a, t) => ((a[t[k]] = (a[t[k]] || 0) + 1), a), {});
  $('#stat').textContent = JSON.stringify(
    { wilayah: WIL[S.claims.wil], total: L.length, status: by('status'), eskalasi: L.filter((t) => t.esc).length, antrean_tinjauan: L.filter((t) => t.review).length },
=======
  HK = $('#hook').value.trim();
  say(HK ? 'Webhook disimpan.' : 'Webhook dihapus.');
};

$('#getstat').onclick = () => {
  if (!gw('GET /stats', true)) return;
  const L = scope();
  const by = (k) => L.reduce((a, t) => ((a[t[k]] = (a[t[k]] || 0) + 1), a), {});
  $('#stat').textContent = JSON.stringify(
    {
      wilayah: WIL[S.wil],
      total: L.length,
      status: by('status'),
      eskalasi: L.filter((t) => t.esc).length,
      antrean_tinjauan: L.filter((t) => t.review).length
    },
>>>>>>> 727baf7617f4ddf0d980fc09ef48beae966f53bc
    null,
    2
  );
};

$('#cp').onclick = async () => {
  try {
    await navigator.clipboard.writeText($('#oas').textContent);
    say('Spesifikasi disalin.');
  } catch (e) {
    say('Salin gagal. Pilih teks secara manual.');
  }
};

window.onhashchange = route;

// Inisialisasi Opsi Dropdown & Data Awal
$('#wil').innerHTML = $('#dwil').innerHTML = Object.entries(WIL)
  .map(([k, v]) => `<option value="${k}">${v}</option>`)
  .join('');

$('#dopd').innerHTML =
  '<option value="all">Semua OPD (operator pusat)</option>' +
  OPD.map((o) => `<option value="${o.id}">${o.n}</option>`).join('');

$('#oas').textContent = JSON.stringify(API, null, 2);

<<<<<<< HEAD
// Mock Data Awal (hanya saat penyimpanan lokal kosong)
if (!load()) {
=======
// Mock Data Awal
>>>>>>> 727baf7617f4ddf0d980fc09ef48beae966f53bc
mk({
  wil: 'sby',
  desc: 'Jalan berlubang parah di depan rumah sakit, macet dan sering kecelakaan',
  loc: 'Jl. Dr. Soetomo',
  vault: fake(),
  t: Date.now() - 5 * 36e5
});

mk({
  wil: 'sby',
  desc: 'Ada pungli oleh calo saat mengurus ktp di kelurahan',
  anon: true,
  vault: fake(),
  meta: hex(rnd(32)),
  t: Date.now() - 30 * 36e5
});

mk({
  wil: 'sda',
  desc: 'Sampah menumpuk dan bau limbah di dekat sungai',
  loc: 'Waru, Sidoarjo',
  vault: fake(),
  t: Date.now() - 2 * 36e5
});

mk({
  wil: 'sby',
  desc: 'Mohon bantuan segera',
  vault: fake(),
  t: Date.now() - 36e5
});
<<<<<<< HEAD
}

renderLog();
route();

$('#hsec').textContent = WHSEC;
$('#loc').oninput = (e) => delete e.target.dataset.auto;

$('#dloas').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(API, null, 2)], { type: 'application/json' }));
  a.download = 'laporaman-openapi-3.1.0.json';
  a.click();
  URL.revokeObjectURL(a.href);
};

$('#ntf').onclick = async () => {
  if (!window.Notification) return say('Peramban tidak mendukung notifikasi sistem. Notifikasi dalam aplikasi tetap aktif.');
  say((await Notification.requestPermission()) === 'granted' ? 'Notifikasi peramban aktif.' : 'Izin notifikasi tidak diberikan.');
};

document.addEventListener('click', (e) => {
  const o = e.target.closest('[data-open]');
  const r = e.target.closest('[data-rate]');
  const d = e.target.closest('[data-dl]');
  if (o) { $('#tid').value = o.dataset.open; go('lacak'); lookup(o.dataset.open); }
  if (r) rate(r.dataset.id, +r.dataset.rate);
  if (d && DL && DL.att) {
    const a = document.createElement('a');
    a.href = DL.att.data;
    a.download = DL.att.nama;
    a.click();
  }
});

// Pemeriksa SLA berkala: eskalasi dan notifikasi tanpa menunggu tindakan pengguna.
setInterval(() => {
  const x = T.map((t) => chk(t)).some(Boolean);
  if (x && S.claims && !$('#dash').hidden) dash();
  notifyChanges();
}, 30000);

try {
  const p = JSON.parse(localStorage.getItem('laporaman.a11y') || '{}');
  if (p.z) { $('#zoom').value = p.z; $('#zoom').dispatchEvent(new Event('input')); }
  if (p.hc) $('#hc').click();
  if (p.dys) $('#dys').click();
} catch (e) {}
renderMine();
badge();
=======

renderLog();
route();
>>>>>>> 727baf7617f4ddf0d980fc09ef48beae966f53bc
