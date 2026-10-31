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
  { id: 'pu', n: 'Dinas Pekerjaan Umum', sla: 72, k: ['jalan', 'berlubang', 'lubang', 'aspal', 'jembatan', 'drainase', 'selokan', 'banjir', 'trotoar'] },
  { id: 'hub', n: 'Dinas Perhubungan', sla: 48, k: ['macet', 'lalu lintas', 'lampu merah', 'rambu', 'angkot', 'parkir', 'kecelakaan', 'bus'] },
  { id: 'dlh', n: 'Dinas Lingkungan Hidup', sla: 48, k: ['sampah', 'limbah', 'bau', 'polusi', 'tpa', 'sungai'] },
  { id: 'kes', n: 'Dinas Kesehatan', sla: 24, k: ['rumah sakit', 'puskesmas', 'obat', 'dokter', 'wabah', 'demam', 'posyandu'] },
  { id: 'duk', n: 'Dinas Kependudukan', sla: 96, k: ['ktp', 'kk', 'akta', 'kartu keluarga', 'kependudukan', 'domisili'] },
  { id: 'sos', n: 'Dinas Sosial', sla: 24, k: ['bantuan', 'bansos', 'lansia', 'terlantar', 'darurat', 'miskin', 'korban'] },
  { id: 'ins', n: 'Inspektorat', sla: 72, k: ['pungli', 'korupsi', 'suap', 'pungutan', 'gratifikasi', 'calo'] },
  { id: 'pen', n: 'Dinas Penerangan Jalan', sla: 48, k: ['lampu jalan', 'padam', 'gelap', 'listrik', 'pju'] }
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

function gw(route, auth) {
  const t = Date.now();
  hits[route] = (hits[route] || []).filter((x) => t - x < 1e4);
  let code = 200;

  if (auth && !S.tok) {
    code = 401;
  } else if (hits[route].length >= 8) {
    code = 429;
  } else {
    hits[route].push(t);
  }

  glog.unshift({ t, route, code });
  glog.length = Math.min(glog.length, 8);
  renderLog();

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
function classify(x) {
  x = x.toLowerCase();
  const r = [];
  OPD.forEach((o) => {
    const h = o.k.filter((k) => x.includes(k)).length;
    if (h) r.push({ id: o.id, p: 1 - Math.pow(0.5, h) });
  });
  r.sort((a, b) => b.p - a.p);
  const top = r.length ? r[0].p : 0;
  return { labels: r.filter((l) => l.p >= 0.5), top, auto: top >= 0.7 };
}

function ai() {
  const d = $('#desc').value.trim();
  const o = $('#ai');
  if (!d) {
    o.innerHTML = '';
    return;
  }
  const c = classify(d);

  // Regex Ekstraksi Entitas Lokasi Otomatis
  const locMatch = d.match(
    /(jl\.?|jalan|desa|kec\.?|kecamatan|kab\.?|kabupaten|rs|rumah sakit|kampus|pasar)\s+[a-zA-Z0-9 ]+/i
  );
  let eHtml = '';
  if (locMatch) {
    eHtml = '<p class="hint">Entitas terekstrak otomatis: <b>' + esc(locMatch[0].trim()) + '</b></p>';
    if (!$('#loc').value) $('#loc').value = locMatch[0].trim();
  }

  o.innerHTML = c.labels.length
    ? c.labels.map((l) => `<span class="chip">${esc(opdName(l.id))} ${Math.round(l.p * 100)}%</span>`).join('') +
      eHtml +
      `<p class="hint">${
        c.auto
          ? 'Keyakinan cukup: tiket dirutekan otomatis.'
          : 'Keyakinan di bawah 70%: petugas meninjau terlebih dahulu.'
      }</p>`
    : eHtml + '<p class="hint">Belum ada kategori terdeteksi. Petugas akan meninjau laporan ini.</p>';
}


/* ==========================================
   6. MANAJEMEN TIKET & SLA
   ========================================== */
function mk(o) {
  const c = classify(o.desc);
  const opd = c.auto ? c.labels.map((l) => l.id) : [];
  const hrs = c.auto ? Math.min(...opd.map((i) => OPD.find((x) => x.id === i).sla)) : 24;
  const t0 = o.t || now();

  const t = {
    id: 'LA-2026-' + String(++seq).padStart(4, '0'),
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
  return t;
}

function chk(t) {
  if (t.status !== 'Selesai' && !t.esc && now() > t.due) {
    t.esc = true;
    t.trail.push({ t: now(), s: 'Peringatan eskalasi: tenggat SLA terlampaui', by: 'Sistem SLA' });
    emit('sla.breached', t);
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
}


/* ==========================================
   7. PELACAKAN TIKET & PENILAIAN CSAT
   ========================================== */
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

  if (!t) {
    o.innerHTML = '<p role="alert" class="bad">Nomor tiket tidak ditemukan.</p>';
    return;
  }

  chk(t);
  const i = ST.indexOf(t.status);
  const left = t.due - now();
  const pw = $('#pw2').value;
  let vh = '';

  if (pw) {
    try {
      const p = await unseal(t.vault, pw);
      if (p.lampiran) {
        p.lampiran = p.lampiran.nama + ' (' + Math.round(p.lampiran.ukuran / 1024) + ' KB)';
      }
      vh = `<h3>Detail terenkripsi, terbuka di perangkat Anda</h3><pre>${esc(
        JSON.stringify(p, null, 2)
      )}</pre>`;
    } catch (e) {
      vh =
        '<p role="alert" class="bad">Kata sandi tidak cocok. Tanpa kunci yang benar, data tidak bisa dibuka siapa pun.</p>';
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
        <button type="button" onclick="rate('${t.id}', 5)">Bagus (5)</button>
        <button type="button" onclick="rate('${t.id}', 3)">Cukup (3)</button>
        <button type="button" onclick="rate('${t.id}', 1)">Buruk (1)</button>
      </div>
    </div>`;
  } else if (t.csat) {
    csatHtml = `<div style="margin-top:1rem">
      <p><b>Penilaian Pelayanan (CSAT):</b> ${t.csat}/5 Bintang</p>
    </div>`;
  }

  o.innerHTML = `<div class="card">
    <span class="plate">${t.id}</span>
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

function scope() {
  return T.filter((t) => t.wil === S.wil && (S.opd === 'all' || t.opd.includes(S.opd)));
}

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
  const n = ST[ST.indexOf(t.status) + 1];
  if (!n) return;
  t.status = n;
  t.trail.push({ t: now(), s: 'Status: ' + n, by: JAB[n] + ' ' + opdName(t.opd[0]) });
  emit('ticket.updated', t);
  dash();
}

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
  emit('ticket.routed', t);
  dash();
}


/* ==========================================
   9. SPESIFIKASI OPENAPI & SPEECH COMMANDS
   ========================================== */
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
}

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

function listen(cb) {
  if (!SR) return say('Pengenalan suara tidak didukung peramban ini. Coba Chrome atau Edge.');
  const r = new SR();
  r.lang = 'id-ID';
  r.onresult = (e) => cb(e.results[0][0].transcript);
  r.onerror = () => say('Suara tidak tertangkap. Periksa izin mikrofon.');
  r.start();
  say('Mendengarkan…');
}

function zoom(d) {
  const z = $('#zoom');
  z.value = Math.min(200, Math.max(100, +z.value + d));
  z.dispatchEvent(new Event('input'));
}

function cmd(x) {
  x = x.toLowerCase();
  if (x.includes('anonim')) $('#anon').click();
  else if (x.includes('kirim')) submit();
  else if (x.includes('lacak') || x.includes('pelacak')) go('lacak');
  else if (x.includes('dasbor')) go('dasbor');
  else if (x.includes('integrasi')) go('integrasi');
  else if (x.includes('tentang')) go('tentang');
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
  };
}

tog('#hc', (on) => document.documentElement.toggleAttribute('data-contrast', on));
tog('#dys', (on) => document.documentElement.toggleAttribute('data-dys', on));

$('#zoom').oninput = (e) => {
  document.documentElement.style.setProperty('--z', e.target.value / 100);
  $('#zo').textContent = e.target.value + '%';
};

$('#vc').onclick = () => {
  S.voice = true;
  listen(cmd);
};

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
$('#trk').onclick = lookup;
$('#tid').onkeydown = (e) => {
  if (e.key === 'Enter') lookup();
};

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
};

$('#skew').onclick = () => {
  skew += 24;
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

// Mock Data Awal
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

renderLog();
route();