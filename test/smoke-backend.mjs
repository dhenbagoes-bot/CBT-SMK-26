// Smoke test backend Kode.gs (wwn-cbt-madrasah-80 v1.0.0) dengan stub Google Apps Script.
// Menjalankan Kode.gs ASLI di dalam vm Node dan menguji SEMUA action:
// initDatabase (12 sheet + seed + idempotent), ping, doGet, lock doPost,
// login/logout (+case-insensitive, nonaktif, kedaluwarsa), otorisasi peran,
// getAllData (filter per peran — siswa tak pernah terima kunci),
// master Jenjang/Mapel/Kelas (+tolak hapus bila dipakai),
// Pengguna (CRUD, validasi, hapus diri/admin-terakhir, reset password,
// importSiswa duplikat->update), BankSoal (validasi, hapus-dipakai,
// importSoal, importSoalDariForm + guard FormsApp), Paket (validasi lengkap),
// Sesi (mulai idempotent+acak, get, batalkan idempotent/beacon, peringatan
// auto-batal, submit DINILAI SERVER + idempotent, resetSesi),
// rekapHasil, getHasilSiswa (rincian hanya bila diizinkan), monitorSesi,
// savePengaturan (whitelist+rentang), uploadLogo/uploadGambarSoal,
// authorizeDriveAccess/authorizeFormsAccess.
// Jalankan: node test/smoke-backend.mjs   (exit 0 = semua lolos)
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'backend', 'Kode.gs'), 'utf8');

// ---------- Stub Spreadsheet ----------
function makeSheet(name, headers) {
  const grid = [headers.slice()]; // baris 0 = header
  return {
    _name: name,
    getName() { return this._name; },
    setFrozenRows() {},
    getLastRow() { return grid.length; },
    getLastColumn() { return grid[0].length; },
    getSheetValues() { return grid; },
    getRange(r, c, nr = 1, nc = 1) {
      function ensure(rr, cc) {
        while (grid.length < rr) grid.push(new Array(grid[0].length).fill(''));
        for (const row of grid) while (row.length < cc) row.push('');
      }
      return {
        getValues() {
          const out = [];
          for (let i = 0; i < nr; i++) {
            const row = [];
            for (let j = 0; j < nc; j++) {
              const gr = grid[r - 1 + i];
              row.push(gr ? (gr[c - 1 + j] ?? '') : '');
            }
            out.push(row);
          }
          return out;
        },
        getValue() { return this.getValues()[0][0]; },
        setValues(vals) {
          for (let i = 0; i < vals.length; i++)
            for (let j = 0; j < vals[i].length; j++) {
              ensure(r + i, c + j);
              grid[r - 1 + i][c - 1 + j] = vals[i][j];
            }
        },
        setValue(v) { this.setValues([[v]]); },
      };
    },
    appendRow(row) {
      const h = grid[0].length;
      const full = row.slice(0, h);
      while (full.length < h) full.push('');
      grid.push(full);
    },
    deleteRow(n) {
      if (n < 1 || n > grid.length) throw new Error('Row out of range: ' + n);
      grid.splice(n - 1, 1);
    },
  };
}

const sheets = new Map();
const SpreadsheetApp = {
  getActiveSpreadsheet() {
    return {
      getName() { return 'DB TEST CBT'; },
      getSheetByName(n) { return sheets.get(n) || null; },
      insertSheet(n) {
        const s = makeSheet(n, []);
        sheets.set(n, s);
        return s;
      },
    };
  },
};

const ContentService = {
  MimeType: { JSON: 'application/json' },
  createTextOutput(text) {
    return {
      _t: String(text),
      getContent() { return this._t; },
      setMimeType() { return this; },
    };
  },
};

import { createHash } from 'node:crypto';
const Utilities = {
  DigestAlgorithm: { SHA_256: 'SHA_256' },
  getUuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  },
  // GAS mengembalikan array byte BERTANDA (-128..127) — tiru persis.
  computeDigest(_algo, str) {
    const h = createHash('sha256').update(String(str), 'utf8').digest();
    return Array.from(h, (b) => (b > 127 ? b - 256 : b));
  },
  formatDate(d, _tz, fmt) {
    const p = (n) => String(n).padStart(2, '0');
    if (fmt === 'yyyy-MM-dd HH:mm:ss')
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
    if (fmt === 'yyyy-MM-dd')
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    return d.toISOString();
  },
  base64Decode: (s) => Buffer.from(s, 'base64'),
  newBlob: (bytes, mimeType, name) => ({ bytes, mimeType, name }),
};
const Session = { getScriptTimeZone: () => 'Asia/Jakarta' };
const Logger = { log() {} };
const LockService = {
  _wait: 0, _release: 0, _try: 0, _tryGagal: false,
  getScriptLock() {
    return {
      waitLock() { LockService._wait++; },
      tryLock() { LockService._try++; return !LockService._tryGagal; },
      releaseLock() { LockService._release++; },
    };
  },
};

// ---------- Stub DriveApp ----------
function makeFolder(name) {
  const subs = {};
  const files = [];
  return {
    _name: name, _files: files,
    setSharing() {},
    getFoldersByName(n) {
      const list = subs[n] ? [subs[n]] : [];
      let i = 0;
      return { hasNext: () => i < list.length, next: () => list[i++] };
    },
    createFolder(n) { const f = makeFolder(n); subs[n] = f; return f; },
    createFile(blob) {
      const f = {
        _id: 'file_' + Math.random().toString(36).slice(2, 10),
        getId() { return this._id; },
        setSharing() {},
        _blob: blob,
      };
      files.push(f);
      return f;
    },
  };
}
const DriveApp = {
  Access: { ANYONE_WITH_LINK: 'ANYONE_WITH_LINK' },
  Permission: { VIEW: 'VIEW' },
  _roots: {},
  getRootFolder() { return makeFolder('root'); },
  getFoldersByName(n) {
    const list = this._roots[n] ? [this._roots[n]] : [];
    let i = 0;
    return { hasNext: () => i < list.length, next: () => list[i++] };
  },
  createFolder(n) { const f = makeFolder(n); this._roots[n] = f; return f; },
};

// ---------- Jalankan Kode.gs di sandbox (TANPA FormsApp -> uji guard) ----------
const ctx = vm.createContext({
  SpreadsheetApp, ContentService, Utilities, Session, DriveApp, Logger, LockService, console,
});
vm.runInContext(src, ctx, { filename: 'Kode.gs' });

// Helper: panggil doPost/doGet lalu parse JSON respons
function post(action, extra = {}) {
  const out = vm.runInContext(
    `doPost({postData:{contents:${JSON.stringify(JSON.stringify({ action, ...extra }))}}})`,
    ctx
  );
  return JSON.parse(out.getContent());
}
function getRaw() {
  const out = vm.runInContext('doGet({})', ctx);
  return JSON.parse(out.getContent());
}

// ---------- Mini test runner ----------
let passed = 0, failed = 0;
function ok(cond, label, detail = '') {
  if (cond) { passed++; }
  else { failed++; console.log(`  ✗ GAGAL: ${label} ${detail}`); }
}
function eq(a, b, label) {
  ok(JSON.stringify(a) === JSON.stringify(b), label, `(dapat ${JSON.stringify(a)}, harap ${JSON.stringify(b)})`);
}
function fmtDT(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
const jamLalu = (h) => fmtDT(new Date(Date.now() + h * 3600000));
const parseDT = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(s);
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
};
function sheetRows(nama) { return sheets.get(nama).getSheetValues(); }
function findGridRow(nama, colIdx, val) {
  const g = sheetRows(nama);
  return g.findIndex((x) => String(x[colIdx - 1]).trim() === String(val).trim());
}

const GAMBAR_KECIL = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const PESAN_SESI = 'Sesi berakhir, silakan login ulang';

console.log('\n[1] initDatabase — 12 sheet + seed + idempotent');
let r = post('initDatabase');
ok(r.success, 'initDatabase sukses');
eq(r.data.sheets, ['Pengaturan', 'Pengguna', 'Jenjang', 'Mapel', 'Kelas', 'BankSoal', 'Paket', 'SesiUjian', 'JawabanSiswa', 'Hasil', 'LogAktivitas', 'Notifikasi'], 'data.sheets = 12 nama sheet');
eq(sheets.size, 12, '12 sheet dibuat');
eq(sheetRows('Pengguna')[0], ['ID', 'Nama', 'Username', 'PasswordHash', 'PasswordSalt', 'Peran', 'NIS', 'JenjangID', 'KelasID', 'Token', 'TokenKedaluwarsa', 'Aktif', 'NoHP'], 'header Pengguna (13 kolom)');
eq(sheetRows('Notifikasi')[0], ['ID', 'Waktu', 'Username', 'NamaSiswa', 'NoHP', 'Jenis', 'Isi', 'Status'], 'header Notifikasi (8 kolom)');
eq(sheetRows('BankSoal')[0], ['ID', 'JenjangID', 'MapelID', 'Soal', 'OpsiA', 'OpsiB', 'OpsiC', 'OpsiD', 'OpsiE', 'Kunci', 'Bobot', 'Pembahasan', 'GambarUrl', 'DibuatPada', 'DibuatOleh', 'Jenis', 'OpsiJSON', 'KunciJSON', 'Tingkat', 'KelasID'], 'header BankSoal (20 kolom)');
eq(sheetRows('Paket')[0], ['ID', 'Nama', 'JenjangID', 'MapelID', 'KelasIDsJSON', 'ModeSoal', 'SoalIDsJSON', 'JumlahAcak', 'DurasiMenit', 'Mulai', 'Selesai', 'AcakSoal', 'AcakOpsi', 'TampilSkor', 'TampilPembahasan', 'Aktif', 'DibuatPada', 'DibuatOleh', 'Token', 'JedaGelombang'], 'header Paket (20 kolom)');
eq(sheetRows('SesiUjian')[0], ['ID', 'PaketID', 'Username', 'WaktuMulai', 'WaktuSelesai', 'Status', 'Peringatan', 'SoalIDsJSON', 'DibuatPada'], 'header SesiUjian (9 kolom)');
eq(sheetRows('Hasil')[0], ['ID', 'SesiID', 'PaketID', 'Username', 'NamaSiswa', 'Kelas', 'JawabanJSON', 'Benar', 'Salah', 'Kosong', 'Skor', 'TotalBobot', 'Nilai', 'WaktuSubmit', 'Status', 'EssayBelumDinilai'], 'header Hasil (16 kolom)');
eq(sheetRows('JawabanSiswa')[0], ['SesiID', 'SoalID', 'Jawaban', 'SkorSementara', 'UpdatedAt'], 'header JawabanSiswa (5 kolom)');
eq(sheetRows('LogAktivitas')[0], ['ID', 'Waktu', 'Username', 'SesiID', 'Jenis', 'Detail'], 'header LogAktivitas (6 kolom)');
{
  const get = (k) => { const f = sheetRows('Pengaturan').find((x) => x[0] === k); return f ? f[1] : undefined; };
  eq([get('namaSekolah'), get('ambangPeringatan'), get('wajibFullscreen'), get('izinkanUlangSetelahBatal'), get('logoUrl'), get('kkm'), get('durasiStandar'), get('jedaGelombang'), get('waAktif'), get('waEndpoint'), get('waApiKey')],
    ['SMK Negeri 1 Juwangi', '3', '1', '0', '', '75', '60', '3', 'false', '', ''], 'seed 15 kunci pengaturan sesuai kontrak');
  ok((get('waTemplateProgres') || '').includes('{nama}') && (get('waTemplateProgres') || '').includes('{mapelLemah}'), 'seed template WA berisi placeholder');
  const jenjang = sheetRows('Jenjang').slice(1).map((x) => x[1]);
  eq(jenjang, ['SMK', 'SMA', 'MA'], 'seed 3 jenjang');
  eq(sheetRows('Mapel').length, 1, 'mapel TIDAK di-seed (0 mapel, admin isi manual)');
  const kelasSeed = sheetRows('Kelas').slice(1).map((x) => x[2]);
  eq(kelasSeed, ['7A', '7B', '8A', '8B', '9A', '9B'], 'seed 6 kelas awal');
  ok(sheetRows('Kelas').slice(1).every((x) => x[1] === 'JJG-SMK'), 'semua kelas seed di jenjang JJG-SMK');
  eq(sheetRows('Kelas').slice(1).map((x) => x[0]), ['KLS-7A', 'KLS-7B', 'KLS-8A', 'KLS-8B', 'KLS-9A', 'KLS-9B'], 'ID kelas seed deterministik');
  const urows = sheetRows('Pengguna');
  const admin = urows.find((x) => x[2] === 'admin');
  const guru = urows.find((x) => x[2] === 'guru');
  ok(!!admin && !!guru, 'seed admin & guru ada');
  ok(admin[3] && admin[3] !== 'admin123' && admin[3].length === 64, 'password admin = hash SHA-256 hex');
  ok(admin[4] !== guru[4] && admin[4].length >= 8, 'salt acak & berbeda per akun');
  eq([admin[5], guru[5]], ['admin', 'guru'], 'peran seed benar');
  eq([admin[11], guru[11]], [1, 1], 'Aktif=1 untuk seed');
}
post('initDatabase'); // idempotent
eq(sheetRows('Pengguna').filter((x) => x[2] === 'admin').length, 1, 'akun admin tidak duplikat');
eq(sheetRows('Jenjang').length, 4, 'jenjang tidak duplikat (header+3)');
eq(sheetRows('Mapel').length, 1, 'mapel tetap kosong setelah init ulang');
eq(sheetRows('Kelas').length, 7, 'kelas tidak duplikat (header+6)');
eq(sheetRows('Pengaturan').filter((x) => x[0] === 'namaSekolah').length, 1, 'kunci pengaturan tidak duplikat');

console.log('\n[2] ping, doGet, aksi tak dikenal, LockService v1.1.0 (fine-grained)');
r = post('ping');
ok(r.success && r.data.version === '1.2.1' && !!r.data.waktu, 'ping -> version + waktu');
eq(getRaw(), { success: true, data: { service: 'wwn-cbt-madrasah-80', version: '1.2.1' } }, 'doGet -> info service');
r = post('aksiTakDikenal');
ok(!r.success && r.message === 'Aksi tidak dikenal: aksiTakDikenal', 'aksi tak dikenal -> message sesuai kontrak');
// v1.1.0: kunci global dihapus — aksi BACA tidak boleh menyentuh LockService sama sekali
const trySebelum = LockService._try;
post('ping');
ok(LockService._try === trySebelum && LockService._wait === 0, 'aksi baca (ping) tanpa lock');
// aksi TULIS memakai tryLock singkat dan selalu release
const t0 = LockService._try, rel0 = LockService._release;
post('login', { username: 'admin', password: 'admin123' });
ok(LockService._try === t0 + 1 && LockService._release === rel0 + 1, 'aksi tulis (login) pakai tryLock + release');
// kunci gagal didapat -> retryable:true (frontend akan mencoba lagi otomatis)
LockService._tryGagal = true;
r = post('login', { username: 'admin', password: 'admin123' });
ok(r.success === false && r.retryable === true, 'lock sibuk -> {success:false, retryable:true}');
LockService._tryGagal = false;

console.log('\n[3] login — sukses/gagal/case-insensitive/nonaktif');
r = post('login', { username: 'admin', password: 'salah' });
ok(!r.success && r.message === 'Username atau kata sandi salah', 'password salah -> pesan kontrak');
r = post('login', { username: 'takada', password: 'x' });
ok(!r.success && r.message === 'Username atau kata sandi salah', 'username tak dikenal -> pesan sama');
r = post('login', { username: '', password: '' });
ok(!r.success, 'login kosong ditolak');
r = post('login', { username: 'admin', password: 'admin123' });
ok(r.success, 'login admin sukses');
eq(Object.keys(r.data).sort(), ['jenjangId', 'kelasId', 'nama', 'nis', 'peran', 'token', 'username'], 'data login = 7 field kontrak');
ok(r.data.token && r.data.token.length > 10, 'token dikembalikan');
ok(!/PasswordHash|PasswordSalt|admin123/.test(JSON.stringify(r)), 'respons login tanpa hash/salt/plaintext');
let TOKEN_ADMIN = r.data.token;
r = post('login', { username: 'ADMIN', password: 'admin123' });
ok(r.success, 'username case-insensitive');
TOKEN_ADMIN = r.data.token; // segarkan (login menimpa token lama)
// Akun nonaktif ditolak
{
  const idx = findGridRow('Pengguna', 3, 'guru');
  sheets.get('Pengguna').getRange(idx + 1, 12).setValue(0);
}
r = post('login', { username: 'guru', password: 'guru123' });
ok(!r.success && r.message === 'Username atau kata sandi salah', 'akun nonaktif ditolak (pesan sama)');
{
  const idx = findGridRow('Pengguna', 3, 'guru');
  sheets.get('Pengguna').getRange(idx + 1, 12).setValue(1);
}
r = post('login', { username: 'guru', password: 'guru123' });
ok(r.success && r.data.peran === 'guru', 'login guru sukses');
const TOKEN_GURU = r.data.token;

console.log('\n[4] otorisasi — token & peran');
const aksiSemuaPeran = [
  ['getAllData', {}], ['saveJenjang', { nama: 'X' }], ['deleteJenjang', { id: 'x' }],
  ['saveMapel', { nama: 'X' }], ['saveKelas', { nama: 'X' }],
  ['savePengguna', { nama: 'X' }], ['deletePengguna', { id: 'x' }], ['resetPassword', { id: 'x', passwordBaru: 'y' }],
  ['importSiswa', { rows: [] }], ['saveSoal', {}], ['deleteSoal', { id: 'x' }],
  ['importSoal', {}], ['importSoalDariForm', {}], ['savePaket', {}], ['deletePaket', { id: 'x' }],
  ['mulaiSesi', { paketId: 'x' }], ['getSesi', { sesiId: 'x' }], ['batalkanSesi', { sesiId: 'x' }],
  ['catatPeringatan', { sesiId: 'x' }], ['submitJawaban', { sesiId: 'x' }], ['verifikasiToken', { paketId: 'x' }],
  ['simpanJawaban', { sesiId: 'x' }], ['getJawabanSesi', { sesiId: 'x' }],
  ['nilaiEssay', { hasilId: 'x', soalId: 'y', skor: 1 }], ['resetSesi', {}],
  ['rekapHasil', {}], ['getHasilSiswa', {}], ['monitorSesi', {}],
  ['savePengaturan', { pengaturan: {} }], ['uploadLogo', {}], ['uploadGambarSoal', {}],
];
for (const [aksi, params] of aksiSemuaPeran) {
  r = post(aksi, params);
  ok(!r.success && r.message === PESAN_SESI, `${aksi} tanpa token ditolak`);
  r = post(aksi, { ...params, token: 'palsu' });
  ok(!r.success && r.message === PESAN_SESI, `${aksi} token palsu ditolak`);
}
// Kedaluwarsa manual
{
  const idx = findGridRow('Pengguna', 10, TOKEN_GURU);
  sheets.get('Pengguna').getRange(idx + 1, 11).setValue(Date.now() - 1000);
}
r = post('saveKelas', { token: TOKEN_GURU, nama: 'X', jenjangId: 'JJG-SMK' });
ok(!r.success && r.message === PESAN_SESI, 'token kedaluwarsa ditolak');
r = post('login', { username: 'guru', password: 'guru123' });
const TOKEN_GURU2 = r.data.token;
// logout
r = post('logout', { token: TOKEN_GURU2 });
ok(r.success, 'logout sukses');
r = post('saveKelas', { token: TOKEN_GURU2, nama: 'X', jenjangId: 'JJG-SMK' });
ok(!r.success && r.message === PESAN_SESI, 'token pasca-logout tidak valid');
r = post('login', { username: 'guru', password: 'guru123' });
const TOKEN_GURU3 = r.data.token;

console.log('\n[5] peran — siswa vs guru vs admin');
// Siapkan kelas & siswa dulu (pakai token admin)
const KELAS_7A = 'KLS-7A'; // kelas seed dari initDatabase (v1.0.0)
const KELAS_8A = 'KLS-8A';
const KELAS_9A = 'KLS-9A';
ok(sheetRows('Kelas').some((x) => x[0] === KELAS_7A && x[2] === '7A'), 'kelas seed 7A tersedia');
r = post('saveKelas', { token: TOKEN_ADMIN, jenjangId: 'JJG-SMA', nama: '10A' });
ok(r.success && !!r.data.id, 'saveKelas 10A (admin, SMA)');
const KELAS_10A = r.data.id;
r = post('saveKelas', { token: TOKEN_ADMIN, jenjangId: 'JJG-SMK', nama: '7A' });
ok(!r.success && /sudah ada/i.test(r.message), 'saveKelas duplikat nama dalam jenjang ditolak');
r = post('savePengguna', { token: TOKEN_ADMIN, nama: 'Andi', username: 'andi', peran: 'siswa', nis: '1001', jenjangId: 'JJG-SMK', kelasId: KELAS_7A });
ok(r.success, 'savePengguna Andi (siswa, password default=NIS)');
r = post('savePengguna', { token: TOKEN_ADMIN, nama: 'Budi', username: 'budi', peran: 'siswa', nis: '1002', jenjangId: 'JJG-SMK', kelasId: KELAS_7A });
ok(r.success, 'savePengguna Budi');
r = post('savePengguna', { token: TOKEN_ADMIN, nama: 'Cici', username: 'cici', peran: 'siswa', nis: '1003', jenjangId: 'JJG-SMK', kelasId: KELAS_8A });
ok(r.success, 'savePengguna Cici');
r = post('savePengguna', { token: TOKEN_ADMIN, nama: 'Dedi', username: 'dedi', peran: 'siswa', nis: '2001', jenjangId: 'JJG-SMA', kelasId: KELAS_10A });
ok(r.success, 'savePengguna Dedi (SMA)');
r = post('login', { username: 'andi', password: '1001' });
ok(r.success && r.data.peran === 'siswa' && r.data.nis === '1001' && r.data.jenjangId === 'JJG-SMK' && r.data.kelasId === KELAS_7A, 'login siswa: password default = NIS; nis/jenjangId/kelasId benar');
const TOKEN_ANDI = r.data.token;
r = post('login', { username: 'budi', password: '1002' });
let TOKEN_BUDI = r.data.token;
r = post('login', { username: 'cici', password: '1003' });
const TOKEN_CICI = r.data.token;
r = post('login', { username: 'dedi', password: '2001' });
const TOKEN_DEDI = r.data.token;
// Siswa memanggil aksi guru -> ditolak
r = post('saveSoal', { token: TOKEN_ANDI, soal: 'x' });
ok(!r.success && /guru atau admin/i.test(r.message), 'siswa panggil aksi guru -> ditolak');
r = post('saveJenjang', { token: TOKEN_ANDI, nama: 'X' });
ok(!r.success && /admin/i.test(r.message), 'siswa panggil aksi admin -> ditolak');
// Guru memanggil aksi admin -> ditolak
r = post('saveJenjang', { token: TOKEN_GURU3, nama: 'X' });
ok(!r.success && r.message === 'Aksi ini hanya boleh dilakukan oleh admin.', 'guru panggil aksi admin -> pesan kontrak');
r = post('savePengaturan', { token: TOKEN_GURU3, pengaturan: {} });
ok(!r.success && /admin/i.test(r.message), 'guru panggil savePengaturan -> ditolak');
// Guru memanggil aksi admin -> ditolak (master khusus admin per kontrak)
r = post('saveKelas', { token: TOKEN_GURU3, jenjangId: 'JJG-SMK', nama: '9Z' });
ok(!r.success && /admin/i.test(r.message), 'guru TIDAK boleh saveKelas (master khusus admin)');
r = post('saveKelas', { token: TOKEN_ADMIN, jenjangId: 'JJG-SMK', nama: '9Z' });
ok(r.success, 'admin boleh saveKelas');
const KELAS_9Z = r.data.id;

console.log('\n[6] savePengguna — validasi & aturan password');
r = post('savePengguna', { token: TOKEN_ADMIN, nama: 'Guru Baru', username: 'gurubaru', peran: 'guru' });
ok(!r.success && /password wajib diisi/i.test(r.message), 'tambah guru tanpa password -> ditolak');
r = post('savePengguna', { token: TOKEN_ADMIN, nama: 'Admin Baru', username: 'adminbaru', peran: 'admin' });
ok(!r.success && /password wajib diisi/i.test(r.message), 'tambah admin tanpa password -> ditolak');
r = post('savePengguna', { token: TOKEN_ADMIN, nama: 'Eka', username: 'eka', peran: 'siswa', nis: '1005', jenjangId: 'JJG-SMK', kelasId: KELAS_7A });
ok(r.success, 'tambah siswa tanpa password -> OK (default NIS)');
r = post('login', { username: 'eka', password: '1005' });
ok(r.success, 'siswa Eka bisa login dengan NIS sebagai password');
r = post('savePengguna', { token: TOKEN_ADMIN, nama: 'X', username: 'ANDI', peran: 'guru', password: 'x12345' });
ok(!r.success && /sudah dipakai/i.test(r.message), 'username duplikat case-insensitive ditolak');
r = post('savePengguna', { token: TOKEN_ADMIN, nama: 'X', username: 'x1', peran: 'siswa', jenjangId: 'JJG-SMK', kelasId: KELAS_7A });
ok(!r.success && /nis/i.test(r.message), 'siswa tanpa NIS ditolak');
r = post('savePengguna', { token: TOKEN_ADMIN, nama: 'X', username: 'x2', peran: 'siswa', nis: '9999', jenjangId: 'JJG-SMK' });
ok(!r.success && /kelas/i.test(r.message), 'siswa tanpa kelasId ditolak');
r = post('savePengguna', { token: TOKEN_ADMIN, nama: 'X', username: 'x3', peran: 'siswa', nis: '9998', jenjangId: 'JJG-SMK', kelasId: 'kelas-palsu' });
ok(!r.success && /kelas/i.test(r.message), 'siswa kelasId tak dikenal ditolak');
r = post('savePengguna', { token: TOKEN_ADMIN, nama: 'X', username: 'x4', peran: 'kepala', password: 'x12345' });
ok(!r.success && /peran/i.test(r.message), 'peran invalid ditolak');
r = post('savePengguna', { token: TOKEN_ADMIN, nama: '', username: 'x5', peran: 'guru', password: 'x12345' });
ok(!r.success && /nama/i.test(r.message), 'nama kosong ditolak');
// Update tanpa password -> password lama dipertahankan
{
  const idx = findGridRow('Pengguna', 3, 'budi');
  const hashLama = sheetRows('Pengguna')[idx][3];
  r = post('savePengguna', { token: TOKEN_ADMIN, id: sheetRows('Pengguna')[idx][0], nama: 'Budi Santoso', username: 'budi', peran: 'siswa', nis: '1002', jenjangId: 'JJG-SMK', kelasId: KELAS_7A });
  ok(r.success, 'update pengguna tanpa password sukses');
  const hashBaru = sheetRows('Pengguna')[findGridRow('Pengguna', 3, 'budi')][3];
  eq(hashBaru, hashLama, 'hash password tidak berubah saat update tanpa password');
  r = post('login', { username: 'budi', password: '1002' });
  ok(r.success, 'password lama masih bisa dipakai setelah update');
}
// Update username duplikat -> ditolak
{
  const idx = findGridRow('Pengguna', 3, 'cici');
  r = post('savePengguna', { token: TOKEN_ADMIN, id: sheetRows('Pengguna')[idx][0], nama: 'Cici', username: 'andi', peran: 'siswa', nis: '1003', jenjangId: 'JJG-SMK', kelasId: KELAS_8A });
  ok(!r.success && /sudah dipakai/i.test(r.message), 'update ke username milik orang lain ditolak');
}
// deletePengguna: diri sendiri & admin terakhir
r = post('deletePengguna', { token: TOKEN_ADMIN, id: sheetRows('Pengguna')[findGridRow('Pengguna', 3, 'admin')][0] });
ok(!r.success && /sendiri/i.test(r.message), 'hapus akun sendiri ditolak');
{
  // Buat admin kedua dulu agar bisa dihapus
  r = post('savePengguna', { token: TOKEN_ADMIN, nama: 'Admin2', username: 'admin2', peran: 'admin', password: 'a12345' });
  ok(r.success, 'tambah admin kedua');
  const idAdmin2 = r.data.id;
  r = post('deletePengguna', { token: TOKEN_ADMIN, id: idAdmin2 });
  ok(r.success, 'hapus admin kedua (bukan terakhir) sukses');
}
{
  const idAdmin = sheetRows('Pengguna')[findGridRow('Pengguna', 3, 'admin')][0];
  // login sebagai admin2 dulu? admin2 sudah dihapus. Buat admin3, login, coba hapus admin (bukan diri) -> admin terakhir? masih ada admin+admin3 = 2 admin, boleh.
  r = post('savePengguna', { token: TOKEN_ADMIN, nama: 'Admin3', username: 'admin3', peran: 'admin', password: 'a12345' });
  const idAdmin3 = r.data.id;
  r = post('login', { username: 'admin3', password: 'a12345' });
  const tokA3 = r.data.token;
  r = post('deletePengguna', { token: tokA3, id: idAdmin });
  ok(r.success, 'admin3 boleh hapus admin (masih ada 2 admin)');
  r = post('deletePengguna', { token: tokA3, id: idAdmin3 });
  ok(!r.success && /sendiri/i.test(r.message), 'hapus diri sendiri tetap ditolak walau admin terakhir');
  // kembalikan: buat ulang admin/admin123 untuk sisa uji
  r = post('savePengguna', { token: tokA3, nama: 'Administrator', username: 'admin', peran: 'admin', password: 'admin123' });
  ok(r.success, 'akun admin dibuat ulang');
  r = post('login', { username: 'admin', password: 'admin123' });
  TOKEN_ADMIN = r.data.token;
}
// resetPassword
{
  const idBudi = sheetRows('Pengguna')[findGridRow('Pengguna', 3, 'budi')][0];
  r = post('resetPassword', { token: TOKEN_ADMIN, id: idBudi, passwordBaru: 'barubudi1' });
  ok(r.success && r.data.id === idBudi, 'resetPassword sukses');
  r = post('login', { username: 'budi', password: '1002' });
  ok(!r.success, 'password lama tidak berlaku setelah reset');
  r = post('login', { username: 'budi', password: 'barubudi1' });
  ok(r.success, 'password baru berlaku setelah reset');
  TOKEN_BUDI = r.data.token; // segarkan: resetPassword menghapus token lama
}
r = post('resetPassword', { token: TOKEN_ADMIN, id: 'id-palsu', passwordBaru: 'x12345' });
ok(!r.success, 'resetPassword id tak dikenal -> error');
r = post('resetPassword', { token: TOKEN_ADMIN, id: sheetRows('Pengguna')[findGridRow('Pengguna', 3, 'budi')][0], passwordBaru: '' });
ok(!r.success && /wajib diisi/i.test(r.message), 'resetPassword password kosong ditolak');

console.log('\n[7] importSiswa — validasi, duplikat NIS -> update');
r = post('importSiswa', { token: TOKEN_ADMIN, rows: [] });
ok(!r.success, 'importSiswa rows kosong ditolak');
r = post('importSiswa', {
  token: TOKEN_ADMIN,
  rows: [
    { nama: '', nis: '9001', kelas: '7A' },                       // 1: error nama
    { nama: 'Fajar', nis: '', kelas: '7A' },                      // 2: error nis
    { nama: 'Gilang', nis: '9003', kelas: '' },                   // 3: error kelas
    { nama: 'Hana', nis: '9004', kelas: 'KelasGaib' },            // 4: error kelas tak dikenal
    { nama: 'Andi Wijaya', nis: '1001', kelas: '7a', password: 'andi999' }, // 5: duplikat NIS -> update
    { nama: 'Irfan', nis: '9006', kelas: '7A' },                  // 6: import (username=NIS, pass=NIS)
    { nama: 'Joko', nis: '9007', kelas: '7A', username: 'joko custom', password: 'jk123' }, // 7: import custom
    { nama: 'Kiki', nis: '9008', kelas: '8A', jenjang: 'SMK' }, // 8: import dgn jenjang
  ],
});
ok(r.success, 'importSiswa sukses');
eq([r.data.imported, r.data.updated, r.data.errors.length], [3, 1, 4], 'imported=3, updated=1, errors=4');
eq(r.data.errors.map((e) => e.baris), [1, 2, 3, 4], 'error di baris 1-4');
{
  const urows = sheetRows('Pengguna');
  const andi = urows.filter((x) => String(x[6]).toLowerCase() === '1001');
  eq(andi.length, 1, 'tidak ada baris ganda untuk NIS 1001');
  eq(andi[0][1], 'Andi Wijaya', 'duplikat NIS -> nama ter-UPDATE');
  eq(andi[0][8], KELAS_7A, 'duplikat NIS -> kelas ter-UPDATE (cocok case-insensitive)');
  const irfan = urows.find((x) => x[6] === '9006');
  eq(irfan[2], '9006', 'username default = NIS');
  eq(irfan[8], KELAS_7A, 'kelasId tersimpan dari nama kelas');
  eq(irfan[7], 'JJG-SMK', 'jenjangId tersimpan dari kelas');
  const kiki = urows.find((x) => x[6] === '9008');
  eq([kiki[7], kiki[8]], ['JJG-SMK', KELAS_8A], 'jenjang param dipakai untuk cocokkan kelas');
}
// v1.1.4: impor batch besar (150 baris) + duplikat NIS di DALAM batch yang sama
{
  const banyak = [];
  for (let i = 0; i < 150; i++) banyak.push({ nama: 'Batch' + i, nis: 'B' + (20000 + i), kelas: '7A' });
  banyak.push({ nama: 'BatchDobel', nis: 'B20000', kelas: '7A' }); // duplikat dalam batch -> update
  r = post('importSiswa', { token: TOKEN_ADMIN, rows: banyak });
  ok(r.success, 'importSiswa 151 baris sukses');
  eq([r.data.imported, r.data.updated, r.data.errors.length], [150, 1, 0], 'imported=150, updated=1 (duplikat batch), errors=0');
  const cek = sheetRows('Pengguna').filter((x) => String(x[6]).toLowerCase() === 'b20000');
  eq(cek.length, 1, 'NIS B20000 hanya 1 baris');
  eq(cek[0][1], 'BatchDobel', 'nama diperbarui oleh baris duplikat dalam batch');
}
r = post('login', { username: '9006', password: '9006' });
ok(r.success, 'siswa impor bisa login dengan NIS/NIS');
// UPDATE duplikat NIS menerapkan aturan akun: username = username||NIS -> '1001'
r = post('login', { username: '1001', password: 'andi999' });
ok(r.success, 'username hasil update = NIS; password custom dari impor berlaku');
const TOKEN_ANDI2 = r.data.token;

console.log('\n[8] master Jenjang/Mapel/Kelas — CRUD + tolak hapus bila dipakai');
r = post('saveJenjang', { token: TOKEN_ADMIN, nama: '' });
ok(!r.success && /wajib diisi/i.test(r.message), 'saveJenjang nama kosong ditolak');
r = post('saveJenjang', { token: TOKEN_ADMIN, nama: 'RA/PAUD' });
ok(r.success && !!r.data.id, 'saveJenjang baru sukses');
const JJG_BARU = r.data.id;
r = post('saveJenjang', { token: TOKEN_ADMIN, id: JJG_BARU, nama: 'RA' });
ok(r.success, 'update jenjang sukses');
r = post('deleteJenjang', { token: TOKEN_ADMIN, id: 'JJG-SMK' });
ok(!r.success && /dipakai/i.test(r.message), 'deleteJenjang dipakai mapel/kelas/bank/paket -> ditolak');
r = post('deleteJenjang', { token: TOKEN_ADMIN, id: JJG_BARU });
ok(r.success, 'deleteJenjang tak dipakai -> sukses');
r = post('saveMapel', { token: TOKEN_ADMIN, nama: 'Fisika' });
ok(!r.success && /jenjang/i.test(r.message), 'saveMapel tanpa jenjangId ditolak');
r = post('saveMapel', { token: TOKEN_ADMIN, jenjangId: 'palsu', nama: 'Fisika' });
ok(!r.success && /tidak ditemukan/i.test(r.message), 'saveMapel jenjangId palsu ditolak');
r = post('saveMapel', { token: TOKEN_ADMIN, jenjangId: 'JJG-SMK', nama: 'Fisika' });
ok(r.success, 'saveMapel Fisika sukses');
const MAPEL_FIS = r.data.id;
r = post('deleteMapel', { token: TOKEN_ADMIN, id: MAPEL_FIS });
ok(r.success, 'deleteMapel tak dipakai -> sukses');
ok(KELAS_9A === 'KLS-9A', 'kelas seed 9A dipakai di uji master');
r = post('deleteKelas', { token: TOKEN_ADMIN, id: KELAS_7A });
ok(!r.success && /dipakai/i.test(r.message), 'deleteKelas dipakai pengguna -> ditolak');
r = post('deleteKelas', { token: TOKEN_ADMIN, id: KELAS_9Z });
ok(r.success, 'deleteKelas tak dipakai -> sukses');
r = post('deleteKelas', { token: TOKEN_ADMIN, id: 'palsu' });
ok(!r.success, 'deleteKelas id tak dikenal -> error');

console.log('\n[9] saveSoal — validasi + CRUD');
// Mapel TIDAK di-seed (v1.0.0) — dibuat manual via saveMapel
r = post('saveMapel', { token: TOKEN_ADMIN, jenjangId: 'JJG-SMK', nama: 'Bahasa Indonesia' });
ok(r.success && !!r.data.id, 'saveMapel Bahasa Indonesia (SMK) sukses');
const MAPEL_MTS_1 = r.data.id;
r = post('saveMapel', { token: TOKEN_ADMIN, jenjangId: 'JJG-SMA', nama: 'Bahasa Indonesia' });
ok(r.success && !!r.data.id, 'saveMapel Bahasa Indonesia (SMA) sukses');
const MAPEL_SMA_1 = r.data.id;
const SOAL_OK = {
  jenjangId: 'JJG-SMK', mapelId: MAPEL_MTS_1,
  soal: 'Ibukota Indonesia adalah...',
  opsiA: 'Jakarta', opsiB: 'Bandung', opsiC: 'Surabaya', opsiD: 'Medan',
  kunci: 'A', bobot: 2, pembahasan: 'Jakarta adalah ibukota.',
};
r = post('saveSoal', { token: TOKEN_GURU3, ...SOAL_OK, soal: '' });
ok(!r.success && /soal/i.test(r.message), 'saveSoal teks kosong ditolak');
r = post('saveSoal', { token: TOKEN_GURU3, ...SOAL_OK, opsiB: '' });
ok(!r.success && /opsi b/i.test(r.message), 'saveSoal opsi B kosong ditolak');
r = post('saveSoal', { token: TOKEN_GURU3, ...SOAL_OK, kunci: 'F' });
ok(!r.success && /kunci/i.test(r.message), 'saveSoal kunci F ditolak');
r = post('saveSoal', { token: TOKEN_GURU3, ...SOAL_OK, kunci: 'E' });
ok(!r.success && /opsi yang kosong/i.test(r.message), 'saveSoal kunci E tapi opsiE kosong ditolak');
r = post('saveSoal', { token: TOKEN_GURU3, ...SOAL_OK, bobot: 0 });
ok(!r.success && /bobot/i.test(r.message), 'saveSoal bobot 0 ditolak');
r = post('saveSoal', { token: TOKEN_GURU3, ...SOAL_OK, jenjangId: 'palsu' });
ok(!r.success && /jenjang/i.test(r.message), 'saveSoal jenjangId palsu ditolak');
r = post('saveSoal', { token: TOKEN_GURU3, ...SOAL_OK });
ok(r.success && !!r.data.id, 'saveSoal valid (bobot 2 + pembahasan) sukses');
const SOAL1 = r.data.id;
r = post('saveSoal', { token: TOKEN_GURU3, ...SOAL_OK, soal: 'Soal 2', opsiA: 'A2', opsiB: 'B2', opsiC: 'C2', opsiD: 'D2', kunci: 'B', bobot: 1 });
const SOAL2 = r.data.id;
r = post('saveSoal', { token: TOKEN_GURU3, ...SOAL_OK, soal: 'Soal 3', opsiA: 'A3', opsiB: 'B3', opsiC: 'C3', opsiD: 'D3', kunci: 'C', opsiE: 'E3' });
ok(r.success, 'saveSoal dengan opsiE sukses');
const SOAL3 = r.data.id;
r = post('saveSoal', { token: TOKEN_GURU3, ...SOAL_OK, soal: 'Soal 4', opsiA: 'A4', opsiB: 'B4', opsiC: 'C4', opsiD: 'D4', kunci: 'D' });
const SOAL4 = r.data.id;
r = post('saveSoal', { token: TOKEN_GURU3, ...SOAL_OK, soal: 'Soal 5', opsiA: 'A5', opsiB: 'B5', opsiC: 'C5', opsiD: 'D5', kunci: 'A' });
const SOAL5 = r.data.id;
r = post('saveSoal', { token: TOKEN_GURU3, id: SOAL2, ...SOAL_OK, soal: 'Soal 2 revisi', opsiA: 'A2', opsiB: 'B2', opsiC: 'C2', opsiD: 'D2', kunci: 'B', bobot: 1 });
ok(r.success && r.data.id === SOAL2, 'update soal via id sukses');
r = post('saveSoal', { token: TOKEN_GURU3, id: 'palsu', ...SOAL_OK });
ok(!r.success, 'update soal id tak dikenal -> error');
// Soal SMA untuk paket SMA
r = post('saveSoal', { token: TOKEN_GURU3, jenjangId: 'JJG-SMA', mapelId: MAPEL_SMA_1, soal: 'Soal SMA 1', opsiA: 'A', opsiB: 'B', opsiC: 'C', opsiD: 'D', kunci: 'A' });
const SOAL_SMA1 = r.data.id;

console.log('\n[10] importSoal — valid campur invalid');
r = post('importSoal', { token: TOKEN_GURU3, jenjangId: 'JJG-SMK', mapelId: MAPEL_MTS_1, items: [] });
ok(!r.success, 'importSoal items kosong ditolak');
r = post('importSoal', {
  token: TOKEN_GURU3, jenjangId: 'JJG-SMK', mapelId: MAPEL_MTS_1,
  items: [
    { soal: 'Impor 1', opsiA: 'a', opsiB: 'b', opsiC: 'c', opsiD: 'd', kunci: 'A' },
    { soal: '', opsiA: 'a', opsiB: 'b', opsiC: 'c', opsiD: 'd', kunci: 'A' },       // invalid
    { soal: 'Impor 3', opsiA: 'a', opsiB: 'b', opsiC: 'c', opsiD: 'd', kunci: 'Z' }, // invalid
    { soal: 'Impor 4', opsiA: 'a', opsiB: 'b', opsiC: 'c', opsiD: 'd', kunci: 'B', bobot: 3 },
  ],
});
ok(r.success, 'importSoal sukses');
eq([r.data.imported, r.data.errors.length], [2, 2], 'imported=2, errors=2');
eq(r.data.errors.map((e) => e.baris), [2, 3], 'error di baris 2 & 3');

console.log('\n[10b] importMapel batch + dedupe + idempotent (v1.2.1)');
r = post('importMapel', { token: TOKEN_ADMIN, rows: [] });
ok(!r.success, 'importMapel rows kosong ditolak');
r = post('importMapel', { token: TOKEN_GURU3, rows: [{ nama: 'X', jenjangId: 'JJG-SMK' }] });
ok(!r.success, 'importMapel ditolak untuk guru (admin saja)');
const jmlMapelSebelum = sheetRows('Mapel').length;
r = post('importMapel', { token: TOKEN_ADMIN, rows: [
  { nama: 'MapelImpor A', jenjangId: 'JJG-SMK' },
  { nama: 'MapelImpor B', jenjangId: 'JJG-SMK' },
  { nama: 'mapelimpor  a', jenjangId: 'JJG-SMK' }, // duplikat dalam batch (huruf+spasi)
  { nama: 'Bahasa Indonesia', jenjangId: 'JJG-SMK' }, // sudah ada di sheet (MAPEL_MTS_1)
  { nama: '', jenjangId: 'JJG-SMK' },              // invalid
  { nama: 'MapelImpor C', jenjangId: 'JJG-TIDAKADA' }, // jenjang tak ada
] });
ok(r.success, 'importMapel sukses');
eq([r.data.imported, r.data.dilewati, r.data.errors.length], [2, 2, 2], 'importMapel: imported=2, dilewati=2, errors=2');
eq(r.data.errors.map((e) => e.baris), [5, 6], 'importMapel: error di baris 5 & 6');
eq(sheetRows('Mapel').length, jmlMapelSebelum + 2, 'sheet Mapel hanya +2 baris');
// Ulangi batch yang sama -> idempotent: tidak ada baris baru
r = post('importMapel', { token: TOKEN_ADMIN, rows: [
  { nama: 'MapelImpor A', jenjangId: 'JJG-SMK' },
  { nama: 'MapelImpor B', jenjangId: 'JJG-SMK' },
] });
eq([r.data.imported, r.data.dilewati], [0, 2], 'importMapel ulang: imported=0, dilewati=2');
eq(sheetRows('Mapel').length, jmlMapelSebelum + 2, 'sheet Mapel tetap (idempotent)');

console.log('\n[10c] importSoal dedupe (v1.2.1)');
const jmlSoalSebelum = sheetRows('BankSoal').length;
r = post('importSoal', { token: TOKEN_GURU3, jenjangId: 'JJG-SMK', mapelId: MAPEL_MTS_1, items: [
  { soal: 'Impor 1', opsiA: 'a', opsiB: 'b', opsiC: 'c', opsiD: 'd', kunci: 'A' },
  { soal: '  IMPOR   1 ', opsiA: 'a', opsiB: 'b', opsiC: 'c', opsiD: 'd', kunci: 'A' },
  { soal: 'Impor 5', opsiA: 'a', opsiB: 'b', opsiC: 'c', opsiD: 'd', kunci: 'A' },
  { soal: 'Impor 5', opsiA: 'a', opsiB: 'b', opsiC: 'c', opsiD: 'd', kunci: 'A' },
] });
ok(r.success, 'importSoal ulang sukses');
eq([r.data.imported, r.data.duplikat, r.data.errors.length], [1, 3, 0], 'importSoal: imported=1, duplikat=3, errors=0');
eq(sheetRows('BankSoal').length, jmlSoalSebelum + 1, 'sheet BankSoal hanya +1 baris');

console.log('\n[11] importSoalDariForm — guard FormsApp + impor palsu');
// (a) Tanpa FormsApp di konteks -> error ramah
r = post('importSoalDariForm', { token: TOKEN_GURU3, formIdOrUrl: 'abc', jenjangId: 'JJG-SMK', mapelId: MAPEL_MTS_1 });
ok(!r.success && r.message === 'Impor Google Form hanya bisa dijalankan di Apps Script.', 'guard FormsApp -> error ramah');
// (b) Konteks kedua DENGAN FormsApp palsu (berbagi sheet yang sama)
function makeChoice(v, c) { return { getValue: () => v, isCorrectAnswer: () => !!c }; }
function mcItem(title, pairs) {
  return {
    getType: () => 'MULTIPLE_CHOICE', getTitle: () => title,
    asMultipleChoiceItem: () => ({ getChoices: () => pairs.map(([v, c]) => makeChoice(v, c)) }),
  };
}
const fakeForm = {
  getItems: () => [
    mcItem('Ibukota Jawa Barat?', [['Bandung', true], ['Jakarta', false], ['Semarang', false]]),
    mcItem('Tanpa kunci?', [['A', false], ['B', false]]),
    mcItem('Kunci ganda?', [['A', true], ['B', true], ['C', false]]),
    { getType: () => 'TEXT', getTitle: () => 'Isian singkat' },
    mcItem('Kebanyakan opsi?', [['1', false], ['2', false], ['3', false], ['4', false], ['5', false], ['6', true]]),
    mcItem('Satu opsi?', [['Hanya', true]]),
    mcItem('Lima opsi kunci D?', [['a', false], ['b', false], ['c', false], ['d', true], ['e', false]]),
  ],
};
const fakeFormsApp = {
  ItemType: { MULTIPLE_CHOICE: 'MULTIPLE_CHOICE', TEXT: 'TEXT', PARAGRAPH_TEXT: 'PARAGRAPH_TEXT' },
  _forms: { form123: fakeForm },
  openById(id) {
    const f = this._forms[id];
    if (!f) throw new Error('Form not found: ' + id);
    return f;
  },
};
const ctx2 = vm.createContext({
  SpreadsheetApp, ContentService, Utilities, Session, DriveApp, Logger, LockService, FormsApp: fakeFormsApp, console,
});
vm.runInContext(src, ctx2, { filename: 'Kode.gs' });
function post2(action, extra = {}) {
  const out = vm.runInContext(
    `doPost({postData:{contents:${JSON.stringify(JSON.stringify({ action, ...extra }))}}})`,
    ctx2
  );
  return JSON.parse(out.getContent());
}
r = post2('importSoalDariForm', { token: TOKEN_GURU3, formIdOrUrl: 'https://docs.google.com/forms/d/form123/edit', jenjangId: 'JJG-SMK', mapelId: MAPEL_MTS_1 });
ok(r.success, 'importSoalDariForm via URL sukses');
eq(r.data.imported, 2, 'imported=2 (2 MC valid)');
eq(r.data.dilewati.length, 5, 'dilewati=5 (tanpa kunci, kunci ganda, text, 6 opsi, 1 opsi)');
{
  const alasan = r.data.dilewati.map((d) => d.judul + '|' + d.alasan).join(';');
  ok(/Tanpa kunci/.test(alasan) && /Kunci ganda/.test(alasan) && /Isian singkat/.test(alasan), 'dilewati memuat judul + alasan');
  const bank = sheetRows('BankSoal');
  const imp1 = bank.find((x) => x[3] === 'Ibukota Jawa Barat?');
  const imp2 = bank.find((x) => x[3] === 'Lima opsi kunci D?');
  ok(!!imp1 && !!imp2, '2 soal dari form tersimpan di BankSoal');
  eq([imp1[9], imp2[9]], ['A', 'D'], 'kunci dari isCorrectAnswer() benar');
  eq([imp1[10], imp2[10]], [1, 1], 'bobot default 1');
  eq([imp1[1], imp1[2]], ['JJG-SMK', MAPEL_MTS_1], 'jenjangId/mapelId tersimpan');
}
r = post2('importSoalDariForm', { token: TOKEN_GURU3, formIdOrUrl: 'form123', jenjangId: 'JJG-SMK', mapelId: MAPEL_MTS_1 });
ok(r.success && r.data.imported === 2, 'ID mentah (tanpa URL) juga bisa');
r = post2('importSoalDariForm', { token: TOKEN_GURU3, formIdOrUrl: 'tidakada', jenjangId: 'JJG-SMK', mapelId: MAPEL_MTS_1 });
ok(!r.success && /tidak ditemukan atau tidak dapat diakses/i.test(r.message), 'form id tak dikenal -> error');
r = post2('importSoalDariForm', { token: TOKEN_GURU3, formIdOrUrl: '', jenjangId: 'JJG-SMK', mapelId: MAPEL_MTS_1 });
ok(!r.success && /wajib diisi/i.test(r.message), 'formIdOrUrl kosong ditolak');

console.log('\n[12] savePaket — validasi lengkap + CRUD');
const PAKET_BAIK = {
  nama: 'Try Out 1', jenjangId: 'JJG-SMK', mapelId: MAPEL_MTS_1,
  kelasIds: [KELAS_7A], modeSoal: 'manual', soalIds: [SOAL1, SOAL2, SOAL3],
  durasiMenit: 60, mulai: jamLalu(-1), selesai: jamLalu(2),
  acakSoal: 1, acakOpsi: 1, tampilSkor: 1, tampilPembahasan: 1, aktif: 1,
};
r = post('savePaket', { token: TOKEN_GURU3, ...PAKET_BAIK, nama: '' });
ok(!r.success && /nama/i.test(r.message), 'savePaket nama kosong ditolak');
r = post('savePaket', { token: TOKEN_GURU3, ...PAKET_BAIK, durasiMenit: 4 });
ok(!r.success && /5-300/i.test(r.message), 'durasi < 5 ditolak');
r = post('savePaket', { token: TOKEN_GURU3, ...PAKET_BAIK, durasiMenit: 301 });
ok(!r.success, 'durasi > 300 ditolak');
r = post('savePaket', { token: TOKEN_GURU3, ...PAKET_BAIK, mulai: '2026-13-40 25:00:00' });
ok(!r.success && /mulai/i.test(r.message), 'format mulai invalid ditolak');
r = post('savePaket', { token: TOKEN_GURU3, ...PAKET_BAIK, selesai: jamLalu(-2) });
ok(!r.success && /setelah waktu mulai/i.test(r.message), 'selesai <= mulai ditolak');
r = post('savePaket', { token: TOKEN_GURU3, ...PAKET_BAIK, modeSoal: 'campur' });
ok(!r.success && /mode soal/i.test(r.message), 'modeSoal invalid ditolak');
r = post('savePaket', { token: TOKEN_GURU3, ...PAKET_BAIK, soalIds: [] });
ok(!r.success && /minimal 1/i.test(r.message), 'manual tanpa soalIds ditolak');
r = post('savePaket', { token: TOKEN_GURU3, ...PAKET_BAIK, soalIds: [SOAL1, 'soal-palsu'] });
ok(!r.success && /tidak ditemukan/i.test(r.message), 'manual dengan soalId palsu ditolak');
r = post('savePaket', { token: TOKEN_GURU3, ...PAKET_BAIK, modeSoal: 'acak', jumlahAcak: 0, soalIds: undefined });
ok(!r.success && /minimal 1/i.test(r.message), 'acak jumlahAcak 0 ditolak');
r = post('savePaket', { token: TOKEN_GURU3, ...PAKET_BAIK, modeSoal: 'acak', jumlahAcak: 999, soalIds: undefined });
ok(!r.success && /melebihi/i.test(r.message), 'acak jumlahAcak > bank ditolak');
r = post('savePaket', { token: TOKEN_GURU3, ...PAKET_BAIK, kelasIds: ['kelas-palsu'] });
ok(!r.success && /kelas/i.test(r.message), 'kelasIds berisi id palsu ditolak');
r = post('savePaket', { token: TOKEN_GURU3, ...PAKET_BAIK, jenjangId: 'palsu' });
ok(!r.success && /jenjang/i.test(r.message), 'jenjangId palsu ditolak');
r = post('savePaket', { token: TOKEN_GURU3, ...PAKET_BAIK });
ok(r.success && !!r.data.id, 'savePaket manual valid sukses');
const PAKET1 = r.data.id;
r = post('savePaket', { token: TOKEN_GURU3, nama: 'Try Out Acak', jenjangId: 'JJG-SMK', mapelId: MAPEL_MTS_1, kelasIds: [KELAS_8A], modeSoal: 'acak', jumlahAcak: 2, durasiMenit: 30, mulai: jamLalu(-1), selesai: jamLalu(2), tampilPembahasan: 0 });
ok(r.success, 'savePaket acak (kelas 8A, tampilPembahasan=0) sukses');
const PAKET2 = r.data.id;
r = post('savePaket', { token: TOKEN_GURU3, nama: 'Paket SMA', jenjangId: 'JJG-SMA', mapelId: MAPEL_SMA_1, modeSoal: 'manual', soalIds: [SOAL_SMA1], durasiMenit: 60, mulai: jamLalu(-1), selesai: jamLalu(2) });
const PAKET3 = r.data.id;
r = post('savePaket', { token: TOKEN_GURU3, ...PAKET_BAIK, nama: 'Nonaktif', aktif: 0 });
const PAKET_OFF = r.data.id;
r = post('savePaket', { token: TOKEN_GURU3, ...PAKET_BAIK, nama: 'Kedaluwarsa', mulai: jamLalu(-3), selesai: jamLalu(-2) });
const PAKET_EXP = r.data.id;
r = post('savePaket', { token: TOKEN_GURU3, id: PAKET1, ...PAKET_BAIK, nama: 'Try Out 1 Revisi' });
ok(r.success && r.data.id === PAKET1, 'update paket via id sukses');
r = post('savePaket', { token: TOKEN_GURU3, id: 'palsu', ...PAKET_BAIK });
ok(!r.success, 'update paket id tak dikenal -> error');
// deleteSoal dipakai paket manual -> ditolak; paket sekali pakai untuk uji hapus
r = post('savePaket', { token: TOKEN_GURU3, ...PAKET_BAIK, nama: 'Paket Hapus', soalIds: [SOAL5], kelasIds: [KELAS_9A] });
const PAKET_DEL = r.data.id;
r = post('deleteSoal', { token: TOKEN_GURU3, id: SOAL5 });
ok(!r.success && /dipakai paket/i.test(r.message), 'deleteSoal dipakai paket manual -> ditolak');
r = post('deletePaket', { token: TOKEN_GURU3, id: 'palsu' });
ok(!r.success, 'deletePaket id tak dikenal -> error');
r = post('deletePaket', { token: TOKEN_GURU3, id: PAKET_DEL });
ok(r.success && r.data.id === PAKET_DEL, 'deletePaket sukses');
r = post('deleteSoal', { token: TOKEN_GURU3, id: SOAL5 });
ok(r.success, 'deleteSoal setelah paket dihapus -> sukses');
r = post('deleteSoal', { token: TOKEN_GURU3, id: SOAL5 });
ok(!r.success, 'deleteSoal id yang sudah dihapus -> error');
// deleteKelas dipakai paket (kelasIds)
r = post('deleteKelas', { token: TOKEN_ADMIN, id: KELAS_7A });
ok(!r.success && /paket|pengguna/i.test(r.message), 'deleteKelas dipakai paket -> ditolak');
r = post('deleteMapel', { token: TOKEN_ADMIN, id: MAPEL_MTS_1 });
ok(!r.success && /dipakai/i.test(r.message), 'deleteMapel dipakai bank soal -> ditolak');

console.log('\n[13] mulaiSesi — validasi, idempotent, acak, TANPA kunci');
r = post('mulaiSesi', { token: TOKEN_ANDI2, paketId: 'palsu' });
ok(!r.success && /tidak ditemukan/i.test(r.message), 'paket tak dikenal -> error');
r = post('mulaiSesi', { token: TOKEN_ANDI2, paketId: PAKET_OFF });
ok(!r.success && /tidak aktif/i.test(r.message), 'paket nonaktif -> ditolak');
r = post('mulaiSesi', { token: TOKEN_ANDI2, paketId: PAKET_EXP });
ok(!r.success && /dibuka atau sudah ditutup/i.test(r.message), 'paket di luar jendela -> ditolak');
r = post('mulaiSesi', { token: TOKEN_DEDI, paketId: PAKET1 });
ok(!r.success && /jenjang/i.test(r.message), 'siswa SMA di paket SMK -> ditolak (jenjang)');
r = post('mulaiSesi', { token: TOKEN_CICI, paketId: PAKET1 });
ok(!r.success && /kelas/i.test(r.message), 'siswa 8A di paket khusus 7A -> ditolak (kelas)');
r = post('mulaiSesi', { token: TOKEN_ANDI2, paketId: PAKET1 });
ok(r.success, 'mulaiSesi Andi paket1 sukses');
eq(Object.keys(r.data.sesi).sort(), ['id', 'paketId', 'peringatan', 'status', 'waktuMulai', 'waktuSelesai'], 'objek sesi = 6 field kontrak');
eq(r.data.sesi.status, 'AKTIF', 'status AKTIF');
eq(r.data.sesi.peringatan, 0, 'peringatan awal 0');
eq(r.data.soal.length, 3, '3 soal dikirim');
{
  const json = JSON.stringify(r.data.soal);
  ok(!/Jakarta adalah ibukota/.test(json), 'pembahasan TIDAK bocor ke soal');
  ok(!/"kunci"/.test(json), 'field kunci TIDAK ada di soal');
  for (const s of r.data.soal) {
    eq(Object.keys(s).sort(), ['gambarUrl', 'id', 'jenis', 'opsi', 'teks', 'tingkat'], 'field soal klien persis (v1.0.0: +jenis+tingkat)');
    const kodes = s.opsi.map((o) => o.kode).sort();
    ok(JSON.stringify(kodes) === JSON.stringify(['A', 'B', 'C', 'D'].sort()) || kodes.length >= 4, 'opsi punya kode asli A-D');
    ok(s.opsi.every((o) => JSON.stringify(Object.keys(o).sort()) === JSON.stringify(['kode', 'teks'])), 'opsi = [{kode,teks}]');
  }
  // waktuSelesai = waktuMulai + 60 menit
  const selisih = parseDT(r.data.sesi.waktuSelesai) - parseDT(r.data.sesi.waktuMulai);
  eq(selisih, 60 * 60000, 'waktuSelesai = waktuMulai + durasiMenit');
}
const SESI_ANDI = r.data.sesi.id;
const URUTAN_ANDI = r.data.soal.map((s) => s.id).join(',');
r = post('mulaiSesi', { token: TOKEN_ANDI2, paketId: PAKET1 });
ok(r.success && r.data.sesi.id === SESI_ANDI, 'mulaiSesi kedua -> sesi AKTIF yang SAMA (idempotent)');
eq(r.data.soal.map((s) => s.id).join(','), URUTAN_ANDI, 'urutan soal SAMA persis (snapshot SoalIDsJSON)');
// Mode acak: Kiki (8A — PAKET2 kini khusus 8A, anti-bentrok vs PAKET1 7A)
r = post('login', { username: '9008', password: '9008' });
ok(r.success && r.data.peran === 'siswa', 'login Kiki (8A, impor) sukses');
const TOKEN_KIKI = r.data.token;
r = post('mulaiSesi', { token: TOKEN_KIKI, paketId: PAKET2 });
ok(r.success && r.data.soal.length === 2, 'mulaiSesi acak -> jumlahAcak soal');
const SESI_KIKI = r.data.sesi.id;
{
  const ids = r.data.soal.map((s) => s.id);
  eq(new Set(ids).size, 2, 'soal acak unik (tidak duplikat)');
}
// Log tercatat
ok(sheetRows('LogAktivitas').some((x) => x[4] === 'mulai-sesi' && x[2] === '1001'), 'log mulai-sesi tercatat');

console.log('\n[14] getSesi — milik sendiri / guru boleh, soal hanya bila AKTIF');
r = post('getSesi', { token: TOKEN_ANDI2, sesiId: SESI_ANDI });
ok(r.success && r.data.sesi.id === SESI_ANDI && r.data.soal.length === 3, 'getSesi milik sendiri sukses + soal');
r = post('getSesi', { token: TOKEN_BUDI, sesiId: SESI_ANDI });
ok(!r.success && /tidak ditemukan/i.test(r.message), 'siswa lain tidak boleh lihat sesi orang');
r = post('getSesi', { token: TOKEN_GURU3, sesiId: SESI_ANDI });
ok(r.success, 'guru boleh lihat sesi siapa pun');
r = post('getSesi', { token: TOKEN_ANDI2, sesiId: 'palsu' });
ok(!r.success, 'getSesi id tak dikenal -> error');

console.log('\n[15] submitJawaban — DINILAI SERVER + idempotent');
{
  const ids = sheetRows('SesiUjian').find((x) => x[0] === SESI_ANDI);
  const soalIds = JSON.parse(ids[7]);
  // SOAL1: kunci A bobot 2; SOAL2: kunci B bobot 1; SOAL3: kunci C bobot 1
  const kunciMap = {};
  for (const brow of sheetRows('BankSoal')) kunciMap[brow[0]] = brow[9];
  const jwb = soalIds.map((sid) => ({ soalId: sid, jawaban: kunciMap[sid] }));
  // Buat 1 salah: ubah jawaban soal terakhir
  jwb[jwb.length - 1].jawaban = kunciMap[jwb[jwb.length - 1].soalId] === 'A' ? 'B' : 'A';
  // 1 kosong: hapus jawaban soal tengah
  const jwbKirim = [jwb[0], jwb[2]];
  r = post('submitJawaban', { token: TOKEN_ANDI2, sesiId: SESI_ANDI, jawaban: jwbKirim });
  ok(r.success, 'submitJawaban sukses');
  const h = r.data.hasil;
  eq(Object.keys(h).sort(), ['benar', 'essayBelumDinilai', 'id', 'kosong', 'nilai', 'nilaiFinal', 'salah', 'skor', 'status', 'totalBobot', 'tuntas', 'waktuSubmit'], 'objek hasil = 12 field kontrak (v1.0.0)');
  eq([h.essayBelumDinilai, h.nilaiFinal], [0, true], 'tanpa essay -> nilai final');
  ok(h.status === (h.nilai >= 75 ? 'Tuntas' : 'Belum Tuntas'), 'status Tuntas vs KKM 75');
  // Skor tergantung urutan acak: hitung ekspektasi dari data aktual
  const bank = {};
  for (const brow of sheetRows('BankSoal')) bank[brow[0]] = { kunci: brow[9], bobot: Number(brow[10]) || 1 };
  let eBenar = 0, eSalah = 0, eKosong = 0, eSkor = 0, eTotal = 0;
  const peta = {};
  for (const x of jwbKirim) peta[x.soalId] = x.jawaban;
  for (const sid of soalIds) {
    const b = bank[sid]; if (!b) continue;
    eTotal += b.bobot;
    const j = peta[sid] || '';
    if (!/^[A-E]$/.test(j)) { eKosong++; continue; }
    if (j === b.kunci) { eBenar++; eSkor += b.bobot; } else eSalah++;
  }
  const eNilai = Math.round(eSkor / eTotal * 100);
  eq([h.benar, h.salah, h.kosong, h.skor, h.totalBobot, h.nilai], [eBenar, eSalah, eKosong, eSkor, eTotal, eNilai], 'penilaian server cocok hitungan manual');
  ok(eKosong === 1 && eSalah === 1 && eBenar === 1, 'skenario 1 benar + 1 salah + 1 kosong terpenuhi');
  eq(h.nilai, Math.round(h.skor / h.totalBobot * 100), 'nilai = round(skor/totalBobot*100)');
  // Status sesi -> SELESAI
  const srow = sheetRows('SesiUjian').find((x) => x[0] === SESI_ANDI);
  eq(srow[5], 'SELESAI', 'status sesi -> SELESAI');
  ok(sheetRows('LogAktivitas').some((x) => x[4] === 'submit' && x[3] === SESI_ANDI), 'log submit tercatat');
  // Idempotent: submit lagi -> hasil yang sama
  r = post('submitJawaban', { token: TOKEN_ANDI2, sesiId: SESI_ANDI, jawaban: [] });
  ok(r.success && r.data.hasil.id === h.id, 'submit kedua -> hasil SAMA (idempotent)');
  eq(r.data.hasil.nilai, h.nilai, 'nilai idempotent sama');
}
// Kode invalid -> kosong; milik orang lain -> ditolak
r = post('submitJawaban', { token: TOKEN_KIKI, sesiId: SESI_KIKI, jawaban: [{ soalId: 'x', jawaban: 'Z' }] });
ok(r.success, 'submit dengan kode invalid sukses');
eq([r.data.hasil.kosong, r.data.hasil.benar, r.data.hasil.salah, r.data.hasil.nilai], [2, 0, 0, 0], 'kode invalid & soal tak dikenal -> kosong');
r = post('submitJawaban', { token: TOKEN_ANDI2, sesiId: SESI_KIKI, jawaban: [] });
ok(!r.success && /tidak ditemukan/i.test(r.message), 'submit ke sesi orang lain ditolak');
// mulaiSesi setelah SELESAI -> error sudah mengerjakan
r = post('mulaiSesi', { token: TOKEN_ANDI2, paketId: PAKET1 });
ok(!r.success && r.message === 'Anda sudah mengerjakan paket ini.', 'mulaiSesi setelah SELESAI -> pesan kontrak');

console.log('\n[16] catatPeringatan — auto-BATAL di ambang');
r = post('savePengaturan', { token: TOKEN_ADMIN, pengaturan: { ambangPeringatan: 2 } });
ok(r.success, 'ambangPeringatan diset 2');
r = post('mulaiSesi', { token: TOKEN_CICI, paketId: PAKET2 });
ok(r.success, 'Cici mulai sesi paket2');
const SESI_CICI = r.data.sesi.id;
r = post('catatPeringatan', { token: TOKEN_CICI, sesiId: SESI_CICI, jenis: 'tab-keluar' });
ok(r.success, 'peringatan 1 sukses');
eq([r.data.peringatan, r.data.dibatalkan], [1, false], 'peringatan=1, belum dibatalkan');
r = post('catatPeringatan', { token: TOKEN_ANDI2, sesiId: SESI_CICI, jenis: 'x' });
ok(!r.success && /tidak ditemukan/i.test(r.message), 'peringatan sesi orang lain ditolak');
r = post('catatPeringatan', { token: TOKEN_CICI, sesiId: SESI_CICI, jenis: 'tab-keluar' });
eq([r.data.peringatan, r.data.dibatalkan], [2, true], 'peringatan=2 = ambang -> dibatalkan');
{
  const srow = sheetRows('SesiUjian').find((x) => x[0] === SESI_CICI);
  eq(srow[5], 'BATAL', 'status sesi -> BATAL otomatis');
  ok(sheetRows('LogAktivitas').some((x) => x[4] === 'peringatan-batas' && x[3] === SESI_CICI), 'log peringatan-batas tercatat');
}
r = post('catatPeringatan', { token: TOKEN_CICI, sesiId: SESI_CICI, jenis: 'x' });
ok(!r.success && /tidak aktif/i.test(r.message), 'peringatan sesi BATAL -> ditolak');
r = post('mulaiSesi', { token: TOKEN_CICI, paketId: PAKET2 });
ok(!r.success && /dibatalkan/i.test(r.message), 'mulai lagi setelah BATAL (flag 0) -> ditolak');
r = post('savePengaturan', { token: TOKEN_ADMIN, pengaturan: { izinkanUlangSetelahBatal: 1 } });
ok(r.success, 'izinkanUlangSetelahBatal=1');
r = post('mulaiSesi', { token: TOKEN_CICI, paketId: PAKET2 });
ok(r.success && r.data.sesi.id !== SESI_CICI, 'dengan flag 1 -> sesi BARU boleh dibuat');
const SESI_CICI2 = r.data.sesi.id;
r = post('savePengaturan', { token: TOKEN_ADMIN, pengaturan: { ambangPeringatan: 3, izinkanUlangSetelahBatal: 0 } });
ok(r.success, 'kembalikan ambang=3 & flag=0');

console.log('\n[17] batalkanSesi — idempotent + aman sendBeacon');
r = post('mulaiSesi', { token: TOKEN_DEDI, paketId: PAKET3 });
ok(r.success, 'Dedi mulai sesi paket3');
const SESI_DEDI = r.data.sesi.id;
r = post('batalkanSesi', { token: TOKEN_DEDI, sesiId: SESI_DEDI, alasan: 'sakit' });
ok(r.success, 'batalkanSesi sukses');
eq(r.data.status, 'BATAL', 'status -> BATAL');
{
  const srow = sheetRows('SesiUjian').find((x) => x[0] === SESI_DEDI);
  eq(srow[5], 'BATAL', 'tersimpan BATAL di sheet');
  ok(sheetRows('LogAktivitas').some((x) => x[4] === 'batal-sesi' && x[3] === SESI_DEDI), 'log batal-sesi tercatat');
  ok(!sheetRows('Hasil').some((x) => x[1] === SESI_DEDI), 'TIDAK ada baris Hasil (jawaban hilang)');
}
// Idempotent: batalkan lagi
r = post('batalkanSesi', { token: TOKEN_DEDI, sesiId: SESI_DEDI });
ok(r.success && r.data.status === 'BATAL', 'batalkanSesi kedua -> tetap sukses (idempotent)');
// Simulasi sendBeacon: postData tanpa content-type JSON
{
  const body = JSON.stringify({ action: 'batalkanSesi', token: TOKEN_DEDI, sesiId: SESI_DEDI });
  const out = vm.runInContext(`doPost({postData:{contents:${JSON.stringify(body)}, type:'text/plain'}})`, ctx);
  const rb = JSON.parse(out.getContent());
  ok(rb.success && rb.data.status === 'BATAL', 'batalkanSesi via sendBeacon (text/plain) sukses');
}
// Guru boleh batalkan sesi siapa pun
r = post('batalkanSesi', { token: TOKEN_GURU3, sesiId: SESI_CICI2 });
ok(r.success && r.data.status === 'BATAL', 'guru boleh batalkan sesi siswa');
r = post('batalkanSesi', { token: TOKEN_BUDI, sesiId: SESI_DEDI });
ok(!r.success && /tidak ditemukan/i.test(r.message), 'siswa tak boleh batalkan sesi orang');
// Submit ke sesi BATAL -> ditolak
r = post('submitJawaban', { token: TOKEN_DEDI, sesiId: SESI_DEDI, jawaban: [] });
ok(!r.success && /tidak aktif/i.test(r.message), 'submit ke sesi BATAL ditolak');

console.log('\n[18] rekapHasil — status gabungan semua siswa eligible');
// Budi: mulai lalu batalkan di paket1 -> 'Dibatalkan'
r = post('mulaiSesi', { token: TOKEN_BUDI, paketId: PAKET1 });
ok(r.success, 'Budi mulai sesi paket1');
const SESI_BUDI_P1 = r.data.sesi.id;
r = post('batalkanSesi', { token: TOKEN_BUDI, sesiId: SESI_BUDI_P1 });
ok(r.success, 'Budi batalkan sesi paket1');
r = post('rekapHasil', { token: TOKEN_GURU3, paketId: PAKET1 });
ok(r.success, 'rekapHasil paket1 sukses');
eq([r.data.paket.id, r.data.paket.nama], [PAKET1, 'Try Out 1 Revisi'], 'info paket benar');
{
  const byNama = {};
  for (const x of r.data.rows) byNama[x.nama] = x;
  eq(Object.keys(r.data.rows[0]).sort(), ['benar', 'kelas', 'nama', 'nilai', 'nis', 'peringatan', 'status', 'totalSoal', 'username', 'waktuSubmit'], 'field baris rekap persis kontrak');
  eq(byNama['Andi Wijaya'].status, 'Selesai', 'Andi -> Selesai');
  ok(byNama['Andi Wijaya'].nilai > 0 && byNama['Andi Wijaya'].benar >= 1, 'Andi punya nilai & benar');
  eq(byNama['Andi Wijaya'].totalSoal, 3, 'totalSoal Andi = 3');
  ok(!!byNama['Andi Wijaya'].waktuSubmit, 'waktuSubmit Andi terisi');
  eq(byNama['Budi Santoso'].status, 'Dibatalkan', 'Budi -> Dibatalkan');
  eq(byNama['Eka'].status, 'Belum mulai', 'Eka (tanpa sesi) -> Belum mulai');
  eq(byNama['Eka'].nilai, 0, 'Belum mulai -> nilai 0');
  ok(!byNama['Cici'], 'Cici (8A) tidak eligible untuk paket khusus 7A');
  ok(!byNama['Dedi'], 'Dedi (SMA) tidak eligible untuk paket SMK');
  ok(r.data.rows.every((x) => x.kelas === '7A' || x.nama === 'Andi Wijaya'), 'semua baris eligible');
}
r = post('rekapHasil', { token: TOKEN_GURU3, paketId: PAKET2 });
{
  const byNama = {};
  for (const x of r.data.rows) byNama[x.nama] = x;
  eq(byNama['Kiki'].status, 'Selesai', 'Kiki paket2 -> Selesai');
  eq(byNama['Kiki'].nilai, 0, 'Kiki paket2 nilai 0 (semua kosong)');
  eq(byNama['Cici'].status, 'Dibatalkan', 'Cici paket2 -> Dibatalkan (sesi terbaru BATAL)');
  ok(!byNama['Andi Wijaya'], 'Andi (7A) tidak eligible untuk paket khusus 8A');
}
r = post('rekapHasil', { token: TOKEN_GURU3, paketId: 'palsu' });
ok(!r.success && /tidak ditemukan/i.test(r.message), 'rekapHasil paket tak dikenal -> error');
r = post('rekapHasil', { token: TOKEN_ANDI2, paketId: PAKET1 });
ok(!r.success && /guru atau admin/i.test(r.message), 'siswa tidak boleh rekapHasil');

console.log('\n[19] getHasilSiswa — rincian+pembahasan hanya bila diizinkan');
r = post('getHasilSiswa', { token: TOKEN_ANDI2 });
ok(r.success && r.data.length === 1, 'Andi punya 1 hasil');
{
  const h = r.data[0];
  ok(Array.isArray(h.rincian) && h.rincian.length === 3, 'rincian 3 soal (tampilPembahasan=1 & SELESAI)');
  const rc = h.rincian[0];
  eq(Object.keys(rc).sort(), ['benar', 'bobot', 'jawabanSiswa', 'jenis', 'kunci', 'menungguPenilaian', 'opsi', 'pembahasan', 'skor', 'soalId', 'teks'], 'field rincian persis (v1.0.0)');
  ok(h.rincian.some((x) => x.pembahasan === 'Jakarta adalah ibukota.'), 'pembahasan terkirim bila diizinkan');
  ok(h.rincian.every((x) => /^[A-E]$/.test(x.kunci)), 'kunci terkirim bila diizinkan');
  ok(h.rincian.some((x) => x.benar) && h.rincian.some((x) => !x.benar), 'flag benar bervariasi sesuai jawaban');
}
r = post('getHasilSiswa', { token: TOKEN_ANDI2, paketId: PAKET1 });
eq(r.data.length, 1, 'filter paketId -> 1 hasil');
r = post('getHasilSiswa', { token: TOKEN_ANDI2, paketId: PAKET2 });
eq(r.data.length, 0, 'filter paketId lain -> 0 hasil');
r = post('getHasilSiswa', { token: TOKEN_KIKI });
ok(r.success && r.data.length === 1, 'Kiki punya 1 hasil (paket2)');
{
  const json = JSON.stringify(r.data);
  ok(!/"kunci"/.test(json) && !/"rincian"/.test(json), 'tampilPembahasan=0 -> TANPA kunci/rincian');
}
r = post('getHasilSiswa', { token: TOKEN_CICI });
eq(r.data.length, 0, 'Cici tanpa hasil -> []');

console.log('\n[20] monitorSesi — AKTIF dulu, lalu terbaru');
// TOKEN_ANDI2 = token segar Andi (username kini '1001' setelah update impor)
r = post('savePengguna', { token: TOKEN_ADMIN, nama: 'Maya', username: 'maya', peran: 'siswa', nis: '1004', jenjangId: 'JJG-SMK', kelasId: KELAS_8A });
ok(r.success, 'savePengguna Maya (8A) untuk monitor');
r = post('login', { username: 'maya', password: '1004' });
ok(r.success, 'login Maya sukses');
const TOKEN_MAYA = r.data.token;
r = post('mulaiSesi', { token: TOKEN_MAYA, paketId: PAKET2 });
ok(r.success, 'Maya mulai sesi AKTIF di paket2');
const SESI_AKTIF = r.data.sesi.id;
r = post('monitorSesi', { token: TOKEN_GURU3 });
ok(r.success && r.data.length >= 6, 'monitorSesi semua -> >= 6 sesi');
eq(r.data[0].status, 'AKTIF', 'urutan pertama = AKTIF');
eq(r.data[0].id, SESI_AKTIF, 'sesi AKTIF terbaru di urutan pertama');
{
  const s = r.data[0];
  eq(Object.keys(s).sort(), ['id', 'kelas', 'namaPaket', 'namaSiswa', 'paketId', 'peringatan', 'status', 'username', 'waktuMulai', 'waktuSelesai'], 'field monitor persis kontrak');
  ok(r.data.every((x, i, a) => i === 0 || a[i - 1].status === 'AKTIF' || x.status !== 'AKTIF'), 'semua AKTIF di depan');
}
r = post('monitorSesi', { token: TOKEN_GURU3, paketId: PAKET1 });
ok(r.data.length === 2 && r.data.every((x) => x.paketId === PAKET1), 'filter paketId paket1 -> 2 sesi');
r = post('monitorSesi', { token: TOKEN_ANDI2 });
ok(!r.success && /guru atau admin/i.test(r.message), 'siswa tidak boleh monitorSesi');
// getSesi sesi SELESAI -> tanpa soal
r = post('getSesi', { token: TOKEN_ANDI2, sesiId: SESI_ANDI });
ok(r.success && r.data.soal.length === 0, 'getSesi SELESAI -> soal kosong');

console.log('\n[21] resetSesi — hapus sesi+hasil agar bisa mengulang');
r = post('resetSesi', { token: TOKEN_ANDI2, username: '1001', paketId: PAKET1 });
ok(!r.success && /guru atau admin/i.test(r.message), 'siswa tidak boleh resetSesi');
r = post('resetSesi', { token: TOKEN_GURU3, username: '1001', paketId: PAKET1 });
ok(r.success, 'resetSesi sukses');
eq([r.data.sesiDihapus, r.data.hasilDihapus], [1, 1], '1 sesi + 1 hasil dihapus');
ok(!sheetRows('SesiUjian').some((x) => x[0] === SESI_ANDI), 'baris sesi Andi hilang');
ok(!sheetRows('Hasil').some((x) => x[2] === PAKET1 && x[3] === '1001'), 'baris hasil Andi hilang');
r = post('mulaiSesi', { token: TOKEN_ANDI2, paketId: PAKET1 });
ok(r.success && r.data.sesi.id !== SESI_ANDI, 'setelah reset -> sesi BARU bisa dibuat');
r = post('resetSesi', { token: TOKEN_GURU3, username: '1001', paketId: PAKET1 });
eq([r.data.sesiDihapus, r.data.hasilDihapus], [1, 0], 'reset sesi AKTIF tanpa hasil -> hasilDihapus 0');

console.log('\n[22] savePengaturan — whitelist + rentang + khusus admin');
r = post('savePengaturan', { token: TOKEN_GURU3, pengaturan: { namaSekolah: 'X' } });
ok(!r.success && /admin/i.test(r.message), 'guru ditolak savePengaturan');
r = post('savePengaturan', { token: TOKEN_ADMIN, pengaturan: { ambangPeringatan: 0 } });
ok(!r.success && /1-10/.test(r.message), 'ambangPeringatan 0 ditolak');
r = post('savePengaturan', { token: TOKEN_ADMIN, pengaturan: { ambangPeringatan: 11 } });
ok(!r.success, 'ambangPeringatan 11 ditolak');
r = post('savePengaturan', { token: TOKEN_ADMIN, pengaturan: { wajibFullscreen: 2 } });
ok(!r.success && /0 atau 1/.test(r.message), 'wajibFullscreen 2 ditolak');
r = post('savePengaturan', { token: TOKEN_ADMIN, pengaturan: { izinkanUlangSetelahBatal: 5 } });
ok(!r.success, 'izinkanUlangSetelahBatal 5 ditolak');
r = post('savePengaturan', {
  token: TOKEN_ADMIN,
  pengaturan: {
    namaSekolah: 'MTs CBT', alamatSekolah: 'Jl. Merdeka 1', telepon: '0811',
    namaKepala: 'Drs. Kepala', ambangPeringatan: 5, wajibFullscreen: 0,
    izinkanUlangSetelahBatal: 1, kunciAsing: 'abaikan',
  },
});
ok(r.success, 'savePengaturan valid sukses');
{
  const get = (k) => { const f = sheetRows('Pengaturan').find((x) => x[0] === k); return f ? f[1] : undefined; };
  eq([get('namaSekolah'), get('ambangPeringatan'), get('wajibFullscreen'), get('izinkanUlangSetelahBatal')],
    ['MTs CBT', '5', '0', '1'], 'nilai tersimpan (string di sheet)');
  eq(get('kunciAsing'), undefined, 'kunci tak dikenal diabaikan');
}
r = post('savePengaturan', { token: TOKEN_ADMIN, pengaturan: { ambangPeringatan: 3, wajibFullscreen: 1, izinkanUlangSetelahBatal: 0, namaSekolah: 'SMK Negeri 1 Juwangi' } });
ok(r.success, 'kembalikan default');

console.log('\n[23] uploadLogo & uploadGambarSoal — validasi + Drive');
r = post('uploadLogo', { token: TOKEN_ADMIN, dataBase64: '', mimeType: 'image/png' });
ok(!r.success && /kosong/i.test(r.message), 'uploadLogo kosong ditolak');
r = post('uploadLogo', { token: TOKEN_ADMIN, dataBase64: GAMBAR_KECIL, mimeType: 'text/plain' });
ok(!r.success && /gambar/i.test(r.message), 'uploadLogo bukan image/* ditolak');
r = post('uploadLogo', { token: TOKEN_ADMIN, dataBase64: 'x'.repeat(2800001), mimeType: 'image/png' });
ok(!r.success && /2 MB/i.test(r.message), 'uploadLogo > 2,8jt char ditolak');
r = post('uploadLogo', { token: TOKEN_GURU3, dataBase64: GAMBAR_KECIL, mimeType: 'image/png' });
ok(!r.success && /admin/i.test(r.message), 'uploadLogo khusus admin (guru ditolak)');
r = post('uploadLogo', { token: TOKEN_ADMIN, dataBase64: GAMBAR_KECIL, mimeType: 'image/png' });
ok(r.success, 'uploadLogo valid sukses');
ok(r.data.url.startsWith('https://drive.google.com/thumbnail?id=') && r.data.url.endsWith('&sz=w800'), 'format URL thumbnail Drive');
eq(Object.keys(r.data).sort(), ['fileId', 'url'], 'data = {url,fileId}');
{
  const f = sheetRows('Pengaturan').find((x) => x[0] === 'logoUrl');
  eq(f[1], r.data.url, 'logoUrl tersimpan di Pengaturan');
}
const LOGO_URL = r.data.url;
r = post('uploadLogo', { token: TOKEN_ADMIN, dataBase64: 'data:image/png;base64,' + GAMBAR_KECIL, mimeType: 'image/png' });
ok(r.success, 'uploadLogo bentuk data-URL sukses');
// uploadGambarSoal: guru boleh
r = post('uploadGambarSoal', { token: TOKEN_ANDI2, dataBase64: GAMBAR_KECIL, mimeType: 'image/png' });
ok(!r.success && /guru atau admin/i.test(r.message), 'siswa tidak boleh uploadGambarSoal');
r = post('uploadGambarSoal', { token: TOKEN_GURU3, dataBase64: '', mimeType: 'image/png' });
ok(!r.success && /kosong/i.test(r.message), 'uploadGambarSoal kosong ditolak');
r = post('uploadGambarSoal', { token: TOKEN_GURU3, dataBase64: GAMBAR_KECIL, mimeType: 'application/pdf' });
ok(!r.success && /gambar/i.test(r.message), 'uploadGambarSoal bukan image ditolak');
r = post('uploadGambarSoal', { token: TOKEN_GURU3, dataBase64: GAMBAR_KECIL, mimeType: 'image/jpeg', namaFile: 'soal1.jpg' });
ok(r.success && !!r.data.url && !!r.data.fileId, 'uploadGambarSoal (guru) sukses');
{
  const f = sheetRows('Pengaturan').find((x) => x[0] === 'logoUrl');
  ok(f[1] !== r.data.url || LOGO_URL === f[1], 'uploadGambarSoal TIDAK menimpa logoUrl');
  eq(f[1].startsWith('https://drive.google.com/thumbnail?id='), true, 'logoUrl tetap URL logo');
}
// gambar soal bisa dipasang ke soal
r = post('saveSoal', { token: TOKEN_GURU3, id: SOAL2, jenjangId: 'JJG-SMK', mapelId: MAPEL_MTS_1, soal: 'Soal 2 revisi', opsiA: 'A2', opsiB: 'B2', opsiC: 'C2', opsiD: 'D2', kunci: 'B', gambarUrl: 'https://drive.google.com/thumbnail?id=file_x&sz=w800' });
ok(r.success, 'gambarUrl tersimpan di soal');

console.log('\n[24] getAllData — filter per peran');
r = post('getAllData');
ok(!r.success && r.message === PESAN_SESI, 'getAllData tanpa token ditolak');
// --- siswa ---
r = post('getAllData', { token: TOKEN_ANDI2 });
ok(r.success, 'getAllData siswa sukses');
eq(r.data.pengguna, [], 'siswa -> pengguna []');
eq(r.data.bankSoal, [], 'siswa -> bankSoal [] (kunci aman)');
{
  const ids = r.data.paket.map((p) => p.id);
  ok(ids.includes(PAKET1) && !ids.includes(PAKET2), 'siswa 7A lihat paket1, TIDAK lihat paket2 (khusus 8A)');
  ok(!ids.includes(PAKET3) && !ids.includes(PAKET_OFF) && !ids.includes(PAKET_EXP), 'siswa TIDAK lihat paket SMA/nonaktif/kedaluwarsa');
  const p1 = r.data.paket.find((p) => p.id === PAKET1);
  ok(!('soalIds' in p1) && !('dibuatOleh' in p1) && !('token' in p1), 'paket siswa: soalIds, dibuatOleh & token dibuang');
  eq(p1.jumlahSoal, 3, 'paket siswa: jumlahSoal tetap dikirim');
  ok(r.data.sesi.every((s) => s.username === '1001'), 'sesi siswa -> miliknya saja');
  ok(r.data.hasil.every((h) => h.username === '1001'), 'hasil siswa -> miliknya saja');
  ok(!/"kunci"/.test(JSON.stringify(r.data)), 'TIDAK ADA "kunci" di seluruh respons siswa');
  eq(r.data.pengaturan.ambangPeringatan, 3, 'pengaturan ambangPeringatan numerik');
  eq([r.data.pengaturan.wajibFullscreen, r.data.pengaturan.izinkanUlangSetelahBatal], [1, 0], 'flag pengaturan numerik 0/1');
  const h0 = r.data.hasil[0] || {};
  if (h0.id) eq(Object.keys(h0).sort(), ['benar', 'essayBelumDinilai', 'id', 'kelas', 'kosong', 'namaPaket', 'namaSiswa', 'nilai', 'nilaiFinal', 'paketId', 'salah', 'sesiId', 'skor', 'status', 'totalBobot', 'tuntas', 'username', 'waktuSubmit'], 'field hasil getAllData persis (v1.0.0)');
}
r = post('getAllData', { token: TOKEN_CICI });
{
  const idsC = r.data.paket.map((p) => p.id);
  ok(idsC.includes(PAKET2) && !idsC.includes(PAKET1), 'siswa 8A lihat paket2, TIDAK lihat paket1 (khusus 7A)');
  const p2 = r.data.paket.find((p) => p.id === PAKET2);
  eq(p2.jumlahSoal, 2, 'paket acak: jumlahSoal = jumlahAcak');
  ok(!('token' in p2), 'paket siswa: token TIDAK dikirim');
  eq(r.data.pengaturan.namaSekolah, 'SMK Negeri 1 Juwangi', 'pengaturan namaSekolah seed');
}
// --- guru ---
r = post('getAllData', { token: TOKEN_GURU3 });
ok(r.data.pengguna.length > 0 && r.data.pengguna.every((u) => u.peran !== 'admin'), 'guru -> pengguna tanpa admin');
ok(r.data.bankSoal.length > 0 && r.data.bankSoal.every((s) => /^[A-E]$/.test(s.kunci)), 'guru -> bankSoal lengkap dengan kunci');
{
  const p1 = r.data.paket.find((p) => p.id === PAKET1);
  ok(Array.isArray(p1.soalIds) && p1.soalIds.length === 3, 'guru -> paket memuat soalIds');
  eq(Object.keys(r.data.pengguna[0]).sort(), ['aktif', 'id', 'jenjangId', 'kelasId', 'nama', 'nis', 'noHP', 'peran', 'username'], 'field pengguna persis kontrak');
}
// --- admin ---
r = post('getAllData', { token: TOKEN_ADMIN });
ok(r.data.pengguna.some((u) => u.peran === 'admin'), 'admin -> lihat semua pengguna termasuk admin');
eq(r.data.jenjang.length, 3, 'jenjang 3');
ok(r.data.mapel.length >= 2 && r.data.kelas.length >= 6, 'mapel (dibuat manual) & kelas (6 seed + tambahan) terbaca');
{
  const json = JSON.stringify(r.data);
  ok(!/TokenKedaluwarsa|PasswordHash|PasswordSalt/i.test(json), 'TIDAK ADA token/hash/salt di getAllData');
}

console.log('\n[25] fungsi otorisasi manual');
vm.runInContext('authorizeDriveAccess()', ctx);
ok(true, 'authorizeDriveAccess() jalan tanpa error');
vm.runInContext('authorizeFormsAccess()', ctx2);
ok(true, 'authorizeFormsAccess() jalan tanpa error');


console.log('\n[26] analisis & notifikasi — NoHP, KKM, WA, analisis siswa/kelas');
// Seed hasil deterministik: Andi mengerjakan PAKET1 (3 soal manual), SEMUA BENAR -> nilai 100
r = post('mulaiSesi', { token: TOKEN_ANDI2, paketId: PAKET1 });
ok(r.success, 'seed: Andi mulai sesi paket1');
const SESI_AN = r.data.sesi.id;
{
  const kunciMap = {};
  for (const brow of sheetRows('BankSoal')) kunciMap[brow[0]] = brow[9];
  const soalIdsAN = JSON.parse(sheetRows('SesiUjian').find((x) => x[0] === SESI_AN)[7]);
  r = post('submitJawaban', { token: TOKEN_ANDI2, sesiId: SESI_AN, jawaban: soalIdsAN.map((sid) => ({ soalId: sid, jawaban: kunciMap[sid] })) });
  ok(r.success, 'seed: Andi submit semua benar');
  eq(r.data.hasil.nilai, 100, 'seed: nilai Andi = 100');
}
// --- noHP di savePengguna ---
{
  const idx = findGridRow('Pengguna', 3, '1001'); // Andi (username hasil impor = NIS)
  const idAndi = sheetRows('Pengguna')[idx][0];
  r = post('savePengguna', { token: TOKEN_ADMIN, id: idAndi, nama: 'Andi Wijaya', username: '1001', peran: 'siswa', nis: '1001', jenjangId: 'JJG-SMK', kelasId: KELAS_7A, noHP: '081234567890' });
  ok(r.success, 'savePengguna update noHP sukses');
  eq(sheetRows('Pengguna')[findGridRow('Pengguna', 3, '1001')][12], '081234567890', 'noHP tersimpan di kolom 13');
}
r = post('getAllData', { token: TOKEN_GURU3 });
{
  const andi = r.data.pengguna.find((u) => u.username === '1001');
  eq(andi.noHP, '081234567890', 'getAllData -> pengguna.noHP terbaca');
}
// --- importSiswa kolom noHP ---
r = post('importSiswa', { token: TOKEN_ADMIN, rows: [{ nama: 'Lala', nis: '9010', kelas: '7A', noHP: '0811222333' }] });
ok(r.success && r.data.imported === 1, 'importSiswa dengan noHP sukses');
eq(sheetRows('Pengguna').find((x) => x[6] === '9010')[12], '0811222333', 'noHP impor tersimpan');
r = post('importSiswa', { token: TOKEN_ADMIN, rows: [{ nama: 'Lala Baru', nis: '9010', kelas: '7A' }] });
{
  const lala = sheetRows('Pengguna').find((x) => x[6] === '9010');
  eq(lala[12], '0811222333', 'update duplikat NIS tanpa noHP -> noHP lama dipertahankan');
  eq(lala[1], 'Lala Baru', 'nama tetap diperbarui saat update duplikat');
}
r = post('importSiswa', { token: TOKEN_ADMIN, rows: [{ nama: 'Lala X', nis: '9010', kelas: '7A', 'No HP': '0899888777' }] });
eq(sheetRows('Pengguna').find((x) => x[6] === '9010')[12], '0899888777', 'kolom "No HP" ikut terbaca saat update');
// --- KKM ---
r = post('savePengaturan', { token: TOKEN_ADMIN, pengaturan: { kkm: 101 } });
ok(!r.success && /0-100/.test(r.message), 'kkm 101 ditolak');
r = post('savePengaturan', { token: TOKEN_ADMIN, pengaturan: { kkm: -1 } });
ok(!r.success && /0-100/.test(r.message), 'kkm -1 ditolak');
r = post('savePengaturan', { token: TOKEN_ADMIN, pengaturan: { kkm: 70 } });
ok(r.success, 'kkm 70 sukses');
r = post('getAllData', { token: TOKEN_GURU3 });
eq(r.data.pengaturan.kkm, 70, 'getAllData -> pengaturan.kkm = 70 (number)');
// --- getAnalisisSiswa ---
r = post('getAnalisisSiswa');
ok(!r.success && r.message === PESAN_SESI, 'getAnalisisSiswa tanpa token ditolak');
r = post('getAnalisisSiswa', { token: TOKEN_ANDI2 });
ok(r.success, 'getAnalisisSiswa (siswa, data sendiri) sukses');
{
  const d = r.data;
  eq(Object.keys(d).sort(), ['perMapel', 'ringkasan', 'tren'], 'data = {ringkasan, perMapel, tren}');
  eq(Object.keys(d.ringkasan).sort(), ['mapelTerkuat', 'mapelTerlemah', 'nilaiTertinggi', 'rataRata', 'totalUjian'], 'field ringkasan lengkap');
  eq(d.ringkasan.totalUjian, 1, 'totalUjian=1');
  eq(d.ringkasan.rataRata, d.ringkasan.nilaiTertinggi, 'rataRata = nilaiTertinggi (1 ujian)');
  eq(d.tren.length, 1, 'tren 1 item');
  eq(Object.keys(d.tren[0]).sort(), ['namaPaket', 'nilai', 'paketId', 'waktuSubmit'], 'field tren lengkap');
  eq(d.tren[0].namaPaket, 'Try Out 1 Revisi', 'tren namaPaket benar');
  ok(d.perMapel.length === 1, 'perMapel 1 mapel');
  const sm = d.perMapel[0];
  eq(Object.keys(sm).sort(), ['benar', 'mapelId', 'namaMapel', 'nilaiRata', 'pct', 'totalDikerjakan', 'tuntas'], 'field StatMapel lengkap');
  eq(sm.mapelId, MAPEL_MTS_1, 'mapel = Literasi B. Indonesia');
  eq([sm.totalDikerjakan, sm.benar], [3, 3], 'totalDikerjakan=3, benar=3');
  eq(sm.pct, 100, 'pct penguasaan = 100');
  eq([sm.nilaiRata, sm.tuntas], [100, true], 'nilaiRata=100, tuntas vs KKM=70');
  eq([d.ringkasan.mapelTerkuat, d.ringkasan.mapelTerlemah], [sm.namaMapel, sm.namaMapel], 'terkuat/terlemah = satu-satunya mapel');
  ok(!/kunci|pembahasan/i.test(JSON.stringify(d)), 'TIDAK ADA kunci/pembahasan di respons analisis');
}
r = post('getAnalisisSiswa', { token: TOKEN_GURU3, username: '1001' });
ok(r.success && r.data.ringkasan.totalUjian === 1, 'guru getAnalisisSiswa(username) sukses');
r = post('getAnalisisSiswa', { token: TOKEN_GURU3, username: 'cici' });
ok(r.success && r.data.ringkasan.totalUjian === 0, 'siswa tanpa hasil -> totalUjian 0');
eq(r.data.ringkasan.mapelTerlemah, '-', 'mapelTerlemah = "-" bila kosong');
eq(r.data.perMapel.length, 0, 'perMapel kosong bila tanpa hasil');
// --- otorisasi 3 aksi guru ---
for (const [aksi, params] of [['getAnalisisKelas', {}], ['kirimNotifikasiProgres', {}], ['getNotifikasi', {}]]) {
  r = post(aksi, { token: TOKEN_ANDI2, ...params });
  ok(!r.success && /guru atau admin/i.test(r.message), `siswa ditolak ${aksi}`);
  r = post(aksi, params);
  ok(!r.success && r.message === PESAN_SESI, `${aksi} tanpa token ditolak`);
}
// --- getAnalisisKelas ---
r = post('getAnalisisKelas', { token: TOKEN_GURU3, paketId: PAKET1 });
ok(r.success, 'getAnalisisKelas paket1 sukses');
{
  const d = r.data;
  eq(Object.keys(d).sort(), ['butirSoal', 'distribusi', 'statistik', 'teratas', 'terbawah'], 'data 5 field kontrak');
  const st = d.statistik;
  eq(Object.keys(st).sort(), ['jumlah', 'ketuntasanPct', 'maks', 'median', 'min', 'rata2'], 'field statistik lengkap');
  eq(st.jumlah, 1, 'jumlah=1 (hanya Andi yang selesai di paket1)');
  eq([st.min, st.maks, st.median, st.rata2].every((v) => v === st.rata2), true, 'min=maks=median=rata2 (1 data)');
  eq(st.ketuntasanPct, st.rata2 >= 70 ? 100 : 0, 'ketuntasanPct vs KKM=70');
  eq(d.distribusi.map((x) => x.rentang).join('|'), '<60|60-69|70-79|80-89|90-100', 'rentang distribusi sesuai kontrak');
  eq(d.distribusi.reduce((a, x) => a + x.jumlah, 0), 1, 'total distribusi = jumlah');
  eq(d.teratas.length, 1, 'teratas 1');
  eq(d.terbawah.length, 1, 'terbawah 1');
  eq(Object.keys(d.teratas[0]).sort(), ['kelas', 'namaSiswa', 'nilai', 'username'], 'field SiswaNilai lengkap');
  eq(d.butirSoal.length, 3, 'butirSoal 3 soal (mode manual)');
  const klasValid = ['Sangat Mudah', 'Mudah', 'Sedang', 'Sukar', 'Sangat Sukar'];
  for (const b of d.butirSoal) {
    eq(Object.keys(b).sort(), ['benar', 'dayaBeda', 'dijawab', 'klasifikasi', 'pctBenar', 'soalId', 'teks'], 'field ButirSoal lengkap');
    ok(klasValid.includes(b.klasifikasi), 'klasifikasi valid: ' + b.klasifikasi);
    ok(b.teks.length <= 80, 'teks <= 80 char');
    ok(typeof b.dayaBeda === 'number', 'dayaBeda number (grup tidak kosong)');
    eq(b.pctBenar, b.dijawab > 0 ? Math.round(b.benar / b.dijawab * 100) : 0, 'pctBenar konsisten');
  }
  eq(d.butirSoal.reduce((a, b) => a + b.dijawab, 0), 3, 'total dijawab = 3 jawaban valid Andi');
  eq(d.distribusi.find((x) => x.rentang === '90-100').jumlah, 1, 'distribusi 90-100 = 1');
  ok(d.butirSoal.every((b) => b.klasifikasi === 'Sangat Mudah'), 'semua benar -> klasifikasi Sangat Mudah');
  eq(d.butirSoal.map((b) => b.dayaBeda), [0, 0, 0], 'dayaBeda = 0 (1 siswa: atas & bawah sama)');
}
r = post('getAnalisisKelas', { token: TOKEN_GURU3 });
ok(r.success && r.data.butirSoal.length === 0 && r.data.statistik.jumlah >= 1, 'tanpa paketId -> butirSoal kosong, statistik semua paket');
// --- kirimNotifikasiProgres (waAktif=false -> semua dilewati, tanpa network) ---
const JML_SISWA_AKTIF = sheetRows('Pengguna').filter((x) => x[5] === 'siswa' && String(x[11]) === '1').length;
r = post('kirimNotifikasiProgres', { token: TOKEN_GURU3 });
ok(r.success, 'kirimNotifikasiProgres (semua) sukses');
eq([r.data.total, r.data.terkirim, r.data.dilewati], [JML_SISWA_AKTIF, 0, JML_SISWA_AKTIF], 'semua dilewati tanpa network (waAktif=false)');
eq(r.data.detail.length, JML_SISWA_AKTIF, 'detail per target');
ok(r.data.detail.every((d) => /^dilewati: /.test(d.status)), 'status semua diawali "dilewati: "');
eq(Object.keys(r.data).sort(), ['detail', 'dilewati', 'terkirim', 'total'], 'field hasil kirim lengkap');
{
  const rowsN = sheetRows('Notifikasi');
  eq(rowsN.length - 1, JML_SISWA_AKTIF, 'sheet Notifikasi bertambah sejumlah target');
  const barisAndi = rowsN.find((x) => x[2] === '1001');
  ok(!!barisAndi, 'baris log untuk Andi ada');
  eq([barisAndi[3], barisAndi[4], barisAndi[5]], ['Andi Wijaya', '081234567890', 'progres'], 'nama/noHP/jenis log benar');
  ok(barisAndi[6].includes('Andi Wijaya') && barisAndi[6].includes('Tetap semangat!'), 'isi pesan terisi template (placeholder terganti)');
  ok(/^dilewati: /.test(barisAndi[7]), 'status dilewati tercatat');
  ok(sheetRows('LogAktivitas').some((x) => x[4] === 'notifikasi-progres'), 'log notifikasi-progres tercatat');
}
// target per kelas & spesifik
{
  const jml7A = sheetRows('Pengguna').filter((x) => x[5] === 'siswa' && String(x[11]) === '1' && x[8] === KELAS_7A).length;
  r = post('kirimNotifikasiProgres', { token: TOKEN_GURU3, kelasId: KELAS_7A });
  eq(r.data.total, jml7A, 'target per kelasId sesuai');
  r = post('kirimNotifikasiProgres', { token: TOKEN_GURU3, usernames: ['1001'] });
  eq([r.data.total, r.data.detail[0].username], [1, '1001'], 'target usernames spesifik');
  r = post('kirimNotifikasiProgres', { token: TOKEN_GURU3, usernames: ['1001'], template: 'Hai {nama}, rata2 {rata2}, ujian {jmlUjian}, lemah {mapelLemah}, {sekolah} {tanggal}!' });
  const terakhir = sheetRows('Notifikasi')[sheetRows('Notifikasi').length - 1];
  ok(terakhir[6].startsWith('Hai Andi Wijaya,'), 'template custom dipakai');
  ok(!/{(nama|rata2|jmlUjian|mapelLemah|sekolah|tanggal)}/.test(terakhir[6]), 'semua placeholder terganti');
}
// waAktif=true tanpa UrlFetchApp -> TIDAK throw, dilewati dengan pesan gagal
r = post('savePengaturan', { token: TOKEN_ADMIN, pengaturan: { waAktif: 'true', waEndpoint: 'https://wa.contoh/kirim', waApiKey: 'kunci123' } });
ok(r.success, 'konfigurasi WA aktif tersimpan');
r = post('kirimNotifikasiProgres', { token: TOKEN_GURU3, usernames: ['1001'] });
ok(r.success, 'kirim dengan waAktif=true tidak melempar error');
eq([r.data.terkirim, r.data.dilewati], [0, 1], 'tanpa UrlFetchApp -> dilewati');
ok(/dilewati: Gagal/.test(r.data.detail[0].status), 'status mencatat kegagalan tanpa error fatal');
r = post('savePengaturan', { token: TOKEN_ADMIN, pengaturan: { waAktif: 'false', waEndpoint: '', waApiKey: '' } });
ok(r.success, 'WA dikembalikan nonaktif');
// --- getNotifikasi ---
r = post('getNotifikasi', { token: TOKEN_GURU3 });
ok(r.success && Array.isArray(r.data), 'getNotifikasi sukses');
ok(r.data.length >= 1, 'riwayat terisi setelah pengiriman');
eq(Object.keys(r.data[0]).sort(), ['id', 'isi', 'jenis', 'namaSiswa', 'noHP', 'status', 'username', 'waktu'], 'field NotifikasiLog lengkap');
eq(r.data[0].username, '1001', 'urutan terbaru dulu');


console.log('\n[27] 6 jenis soal — validasi, token statis, autosave, resume, skoring, nilaiEssay');
// --- setup: siswa Fani (9A) + 6 soal (satu per jenis) + paket bertoken ---
r = post('savePengguna', { token: TOKEN_ADMIN, nama: 'Fani', username: 'fani', peran: 'siswa', nis: '1009', jenjangId: 'JJG-SMK', kelasId: KELAS_9A });
ok(r.success, 'savePengguna Fani (9A)');
r = post('login', { username: 'fani', password: '1009' });
ok(r.success, 'login Fani sukses');
const TOKEN_FANI = r.data.token;
const SOAL6 = {};
r = post('saveSoal', { token: TOKEN_GURU3, jenjangId: 'JJG-SMK', mapelId: MAPEL_MTS_1, jenis: 'pg', soal: 'PG: 2+2 = ?', opsiA: '3', opsiB: '4', opsiC: '5', opsiD: '6', kunci: 'B', bobot: 2 });
ok(r.success && !!r.data.id, 'saveSoal pg sukses');
SOAL6.pg = r.data.id;
r = post('saveSoal', { token: TOKEN_GURU3, jenjangId: 'JJG-SMK', mapelId: MAPEL_MTS_1, jenis: 'pgk', soal: 'PGK: bilangan prima?', opsi: ['2', '3', '4', '5'], kunci: ['A', 'B', 'D'], bobot: 3 });
ok(r.success && !!r.data.id, 'saveSoal pgk (kunci array huruf) sukses');
SOAL6.pgk = r.data.id;
r = post('saveSoal', { token: TOKEN_GURU3, jenjangId: 'JJG-SMK', mapelId: MAPEL_MTS_1, jenis: 'bs', soal: 'BS: Matahari terbit dari timur.', kunci: 'Benar', bobot: 1 });
ok(r.success && !!r.data.id, 'saveSoal bs sukses');
SOAL6.bs = r.data.id;
r = post('saveSoal', { token: TOKEN_GURU3, jenjangId: 'JJG-SMK', mapelId: MAPEL_MTS_1, jenis: 'jodoh', soal: 'Jodohkan ibukota dengan negaranya.', pasanganKiri: ['Ibukota Indonesia', 'Ibukota Jepang'], pasanganKanan: ['Tokyo', 'Jakarta'], kunci: [1, 0], bobot: 4 });
ok(r.success && !!r.data.id, 'saveSoal jodoh sukses');
SOAL6.jodoh = r.data.id;
r = post('saveSoal', { token: TOKEN_GURU3, jenjangId: 'JJG-SMK', mapelId: MAPEL_MTS_1, jenis: 'isian', soal: 'Isian: Ibukota Indonesia?', kunci: 'Jakarta', bobot: 2 });
ok(r.success && !!r.data.id, 'saveSoal isian sukses');
SOAL6.isian = r.data.id;
r = post('saveSoal', { token: TOKEN_GURU3, jenjangId: 'JJG-SMK', mapelId: MAPEL_MTS_1, jenis: 'essay', soal: 'Essay: Jelaskan pentingnya belajar.', bobot: 5 });
ok(r.success && !!r.data.id, 'saveSoal essay sukses');
SOAL6.essay = r.data.id;
// --- validasi jenis baru ---
r = post('saveSoal', { token: TOKEN_GURU3, jenjangId: 'JJG-SMK', mapelId: MAPEL_MTS_1, jenis: 'pgk', soal: 'x', opsi: ['A', 'B'], kunci: [] });
ok(!r.success && /kunci/i.test(r.message), 'pgk tanpa kunci ditolak');
r = post('saveSoal', { token: TOKEN_GURU3, jenjangId: 'JJG-SMK', mapelId: MAPEL_MTS_1, jenis: 'pgk', soal: 'x', opsi: ['A', 'B'], kunci: ['A', 'B'] });
ok(!r.success && /semua opsi/i.test(r.message), 'pgk kunci mencakup semua opsi ditolak');
r = post('saveSoal', { token: TOKEN_GURU3, jenjangId: 'JJG-SMK', mapelId: MAPEL_MTS_1, jenis: 'bs', soal: 'x', kunci: 'Mungkin' });
ok(!r.success && /Benar.*Salah/i.test(r.message), 'bs kunci bukan Benar/Salah ditolak');
r = post('saveSoal', { token: TOKEN_GURU3, jenjangId: 'JJG-SMK', mapelId: MAPEL_MTS_1, jenis: 'jodoh', soal: 'x', pasanganKiri: ['a', 'b'], pasanganKanan: ['x', 'y'], kunci: [0] });
ok(!r.success && /sama dengan jumlah/i.test(r.message), 'jodoh kunci != jml kiri ditolak');
r = post('saveSoal', { token: TOKEN_GURU3, jenjangId: 'JJG-SMK', mapelId: MAPEL_MTS_1, jenis: 'jodoh', soal: 'x', pasanganKiri: ['a', 'b'], pasanganKanan: ['x', 'y'], kunci: [0, 5] });
ok(!r.success && /jangkauan/i.test(r.message), 'jodoh kunci di luar jangkauan ditolak');
r = post('saveSoal', { token: TOKEN_GURU3, jenjangId: 'JJG-SMK', mapelId: MAPEL_MTS_1, jenis: 'isian', soal: 'x', kunci: '' });
ok(!r.success && /kunci isian/i.test(r.message), 'isian tanpa kunci ditolak');
r = post('saveSoal', { token: TOKEN_GURU3, jenjangId: 'JJG-SMK', mapelId: MAPEL_MTS_1, jenis: 'pilgan', soal: 'x', opsiA: 'a', opsiB: 'b', opsiC: 'c', opsiD: 'd', kunci: 'A' });
ok(!r.success && /Jenis soal/i.test(r.message), 'jenis tak dikenal ditolak');
r = post('saveSoal', { token: TOKEN_GURU3, jenjangId: 'JJG-SMK', mapelId: MAPEL_MTS_1, jenis: 'pg', soal: 'x', opsiA: 'a', opsiB: 'b', opsiC: 'c', opsiD: 'd', kunci: 'A', tingkat: 'Sangat Sulit' });
ok(!r.success && /Tingkat/i.test(r.message), 'tingkat tak dikenal ditolak');
// --- backward-compat: soal lama tanpa jenis -> 'pg'; tingkat & kelasId ---
r = post('saveSoal', { token: TOKEN_GURU3, jenjangId: 'JJG-SMK', mapelId: MAPEL_MTS_1, soal: 'PG legacy tanpa jenis?', opsiA: 'a', opsiB: 'b', opsiC: 'c', opsiD: 'd', kunci: 'A', tingkat: 'Sulit', kelasId: KELAS_9A });
ok(r.success, 'saveSoal tanpa jenis sukses (default pg)');
const SOAL_LEGACY = r.data.id;
{
  const rowPgk = sheetRows('BankSoal').find((x) => x[0] === SOAL6.pgk);
  eq([rowPgk[15], JSON.parse(rowPgk[16]), JSON.parse(rowPgk[17]), rowPgk[18]], ['pgk', ['2', '3', '4', '5'], [0, 1, 3], 'Sedang'], 'kolom Jenis/OpsiJSON/KunciJSON/Tingkat pgk tersimpan');
  const rowLegacy = sheetRows('BankSoal').find((x) => x[0] === SOAL_LEGACY);
  eq([rowLegacy[15], rowLegacy[18], rowLegacy[19]], ['pg', 'Sulit', KELAS_9A], 'soal tanpa jenis -> pg; tingkat & kelasId tersimpan');
  const rowJodoh = sheetRows('BankSoal').find((x) => x[0] === SOAL6.jodoh);
  eq(JSON.parse(rowJodoh[16]), { kiri: ['Ibukota Indonesia', 'Ibukota Jepang'], kanan: ['Tokyo', 'Jakarta'] }, 'OpsiJSON jodoh = {kiri, kanan}');
  eq(JSON.parse(rowJodoh[17]), [1, 0], 'KunciJSON jodoh = indeks kanan benar');
}
r = post('getAllData', { token: TOKEN_GURU3 });
{
  const pgk = r.data.bankSoal.find((s) => s.id === SOAL6.pgk);
  eq([pgk.jenis, pgk.opsi, pgk.kunciNilai, pgk.kunci], ['pgk', ['2', '3', '4', '5'], [0, 1, 3], 'A,B,D'], 'bankSoal pgk: jenis/opsi/kunciNilai/kunci tampil');
  const jodoh = r.data.bankSoal.find((s) => s.id === SOAL6.jodoh);
  eq([jodoh.pasanganKiri.length, jodoh.pasanganKanan.length], [2, 2], 'bankSoal jodoh: pasangan kiri/kanan');
  const legacy = r.data.bankSoal.find((s) => s.id === SOAL_LEGACY);
  eq([legacy.jenis, legacy.tingkat, legacy.kelasId], ['pg', 'Sulit', KELAS_9A], 'bankSoal legacy: jenis pg + tingkat + kelasId');
}
// --- importSoal batch dengan jenis campuran ---
r = post('importSoal', {
  token: TOKEN_GURU3, jenjangId: 'JJG-SMK', mapelId: MAPEL_MTS_1,
  items: [
    { jenis: 'pgk', soal: 'Impor PGK', opsi: ['a', 'b', 'c'], kunci: ['A', 'C'], bobot: 2 },
    { jenis: 'isian', soal: 'Impor Isian', kunci: 'Jawaban', bobot: 1 },
    { jenis: 'pg', soal: '', opsiA: 'a', opsiB: 'b', opsiC: 'c', opsiD: 'd', kunci: 'A' },
  ],
});
ok(r.success, 'importSoal campuran sukses');
eq([r.data.imported, r.data.errors.length], [2, 1], 'importSoal: imported=2, errors=1');
eq(sheetRows('BankSoal').filter((x) => x[3] === 'Impor PGK' || x[3] === 'Impor Isian').length, 2, '2 soal impor tersimpan (batch setValues)');

// --- paket bertoken (token STATIS) ---
r = post('savePaket', { token: TOKEN_GURU3, nama: 'Ujian 6 Jenis', jenjangId: 'JJG-SMK', mapelId: MAPEL_MTS_1, kelasIds: [KELAS_9A], modeSoal: 'manual', soalIds: [SOAL6.pg, SOAL6.pgk, SOAL6.bs, SOAL6.jodoh, SOAL6.isian, SOAL6.essay], durasiMenit: 60, mulai: jamLalu(-1), selesai: jamLalu(2), tokenUjian: 'TOKEN9', jedaGelombang: 5 });
ok(r.success && !!r.data.id, 'savePaket bertoken sukses');
const PAKET6 = r.data.id;
r = post('savePaket', { token: TOKEN_GURU3, nama: 'Token Panjang', jenjangId: 'JJG-SMK', mapelId: MAPEL_MTS_1, kelasIds: [KELAS_9A], modeSoal: 'manual', soalIds: [SOAL6.pg], durasiMenit: 60, mulai: jamLalu(30), selesai: jamLalu(32), tokenUjian: 'X'.repeat(21) });
ok(!r.success && /20 karakter/i.test(r.message), 'token ujian > 20 karakter ditolak');
{
  const p6 = sheetRows('Paket').find((x) => x[0] === PAKET6);
  eq([p6[18], p6[19]], ['TOKEN9', 5], 'kolom Token & JedaGelombang tersimpan');
}
r = post('getAllData', { token: TOKEN_GURU3 });
{
  const p6 = r.data.paket.find((p) => p.id === PAKET6);
  eq([p6.token, p6.punyaToken, p6.jedaGelombang], ['TOKEN9', true, 5], 'guru lihat token + jedaGelombang paket');
}
r = post('getAllData', { token: TOKEN_FANI });
{
  const p6 = r.data.paket.find((p) => p.id === PAKET6);
  ok(!!p6 && !('token' in p6), 'siswa lihat paket bertoken TANPA field token');
}
// --- verifikasiToken ---
r = post('verifikasiToken', { token: TOKEN_FANI, paketId: PAKET6 });
ok(!r.success && /Token ujian salah/i.test(r.message), 'verifikasiToken tanpa tokenUjian ditolak');
r = post('verifikasiToken', { token: TOKEN_FANI, paketId: PAKET6, tokenUjian: 'SALAH' });
ok(!r.success && /Token ujian salah/i.test(r.message), 'verifikasiToken token salah ditolak');
r = post('verifikasiToken', { token: TOKEN_ANDI2, paketId: PAKET6, tokenUjian: 'TOKEN9' });
ok(!r.success && /kelas/i.test(r.message), 'verifikasiToken siswa kelas lain ditolak');
r = post('verifikasiToken', { token: TOKEN_FANI, paketId: PAKET6, tokenUjian: 'TOKEN9' });
ok(r.success && r.data.valid === true, 'verifikasiToken token benar sukses');
eq([r.data.paket.durasiMenit, r.data.paket.jedaGelombang], [60, 5], 'verifikasiToken kembalikan info paket');
r = post('verifikasiToken', { token: TOKEN_FANI, paketId: PAKET_OFF, tokenUjian: 'TOKEN9' });
ok(!r.success && /tidak aktif/i.test(r.message), 'verifikasiToken paket nonaktif ditolak');
r = post('verifikasiToken', { paketId: PAKET6, tokenUjian: 'TOKEN9' });
ok(!r.success && r.message === PESAN_SESI, 'verifikasiToken tanpa token sesi ditolak');
// --- mulaiSesi wajib token ---
r = post('mulaiSesi', { token: TOKEN_FANI, paketId: PAKET6 });
ok(!r.success && /Token ujian salah/i.test(r.message), 'mulaiSesi tanpa tokenUjian ditolak');
r = post('mulaiSesi', { token: TOKEN_FANI, paketId: PAKET6, tokenUjian: 'SALAH' });
ok(!r.success && /Token ujian salah/i.test(r.message), 'mulaiSesi token salah ditolak');
r = post('mulaiSesi', { token: TOKEN_FANI, paketId: PAKET6, tokenUjian: 'TOKEN9' });
ok(r.success && r.data.soal.length === 6, 'mulaiSesi token benar sukses (6 soal)');
const SESI_FANI = r.data.sesi.id;
eq(r.data.jawaban, [], 'sesi baru -> jawaban kosong');
{
  const jenisSet = r.data.soal.map((s) => s.jenis).sort();
  eq(jenisSet, ['bs', 'essay', 'isian', 'jodoh', 'pg', 'pgk'], 'soal klien memuat 6 jenis');
  const jodoh = r.data.soal.find((s) => s.jenis === 'jodoh');
  eq([jodoh.pasanganKiri.length, jodoh.pasanganKanan.length], [2, 2], 'soal jodoh klien: pasangan kiri/kanan');
  const bs = r.data.soal.find((s) => s.jenis === 'bs');
  eq(bs.opsi.map((o) => o.kode), ['Benar', 'Salah'], 'soal bs klien: opsi Benar/Salah');
  const isian = r.data.soal.find((s) => s.jenis === 'isian');
  eq(isian.opsi, [], 'soal isian klien: opsi kosong');
  ok(!/kunci|pembahasan/i.test(JSON.stringify(r.data.soal)), 'TIDAK ADA kunci/pembahasan di soal klien');
}
// --- autosave (simpanJawaban batch) + resume (getJawabanSesi) ---
r = post('simpanJawaban', { token: TOKEN_FANI, sesiId: SESI_FANI, jawaban: [{ soalId: SOAL6.pg, jawaban: 'B' }, { soalId: SOAL6.isian, jawaban: '  JAKARTA ' }] });
ok(r.success, 'simpanJawaban batch 2 jawaban sukses');
eq(r.data.tersimpan, 2, 'tersimpan=2');
eq(sheetRows('JawabanSiswa').filter((x) => x[0] === SESI_FANI).length, 2, '2 baris JawabanSiswa tersimpan');
r = post('getJawabanSesi', { token: TOKEN_FANI, sesiId: SESI_FANI });
ok(r.success, 'getJawabanSesi sukses');
eq(r.data.jawaban.length, 2, 'getJawabanSesi kembalikan 2 jawaban');
eq(r.data.waktuMulai, r.data.sesi.waktuMulai, 'waktuMulai server dikembalikan');
ok(r.data.sisaDetik > 0 && r.data.sisaDetik <= 3600, 'sisaDetik > 0 dan <= durasi (3600 dtk)');
{
  const pg = r.data.jawaban.find((x) => x.soalId === SOAL6.pg);
  eq([pg.jawaban, pg.skorSementara], ['B', 2], 'skorSementara pg benar = bobot');
  const isian = r.data.jawaban.find((x) => x.soalId === SOAL6.isian);
  eq([isian.jawaban, isian.skorSementara], ['  JAKARTA ', 2], 'skorSementara isian (case+spasi) = bobot');
}
r = post('simpanJawaban', { token: TOKEN_FANI, sesiId: SESI_FANI, jawaban: [{ soalId: SOAL6.pg, jawaban: 'A' }, { soalId: SOAL6.pgk, jawaban: [0] }] });
ok(r.success && r.data.tersimpan === 2, 'simpanJawaban update (timpa) sukses');
eq(sheetRows('JawabanSiswa').filter((x) => x[0] === SESI_FANI).length, 3, 'update TIDAK duplikat baris (tetap 3)');
r = post('getJawabanSesi', { token: TOKEN_FANI, sesiId: SESI_FANI });
eq(r.data.jawaban.find((x) => x.soalId === SOAL6.pg).jawaban, 'A', 'jawaban pg ter-update jadi A');
eq(r.data.jawaban.find((x) => x.soalId === SOAL6.pgk).skorSementara, 1, 'skorSementara pgk sebagian [0] = 1 (1/3 x bobot 3)');
r = post('simpanJawaban', { token: TOKEN_FANI, sesiId: SESI_FANI, jawaban: [] });
ok(!r.success && /kosong/i.test(r.message), 'simpanJawaban kosong ditolak');
r = post('simpanJawaban', { token: TOKEN_FANI, sesiId: SESI_FANI, jawaban: [{ soalId: 'soal-palsu', jawaban: 'A' }] });
ok(!r.success && /tidak ada jawaban valid/i.test(r.message), 'simpanJawaban soal di luar sesi ditolak');
r = post('simpanJawaban', { token: TOKEN_ANDI2, sesiId: SESI_FANI, jawaban: [{ soalId: SOAL6.pg, jawaban: 'A' }] });
ok(!r.success && /tidak ditemukan/i.test(r.message), 'simpanJawaban sesi orang lain ditolak');
r = post('getJawabanSesi', { token: TOKEN_GURU3, sesiId: SESI_FANI });
ok(r.success, 'guru boleh getJawabanSesi siapa pun');
r = post('getJawabanSesi', { token: TOKEN_ANDI2, sesiId: SESI_FANI });
ok(!r.success && /tidak ditemukan/i.test(r.message), 'siswa lain tidak boleh getJawabanSesi');
// --- resume: mulaiSesi lagi -> sesi SAMA + jawaban kembali (tutup tab = JEDA) ---
r = post('mulaiSesi', { token: TOKEN_FANI, paketId: PAKET6, tokenUjian: 'TOKEN9' });
ok(r.success && r.data.sesi.id === SESI_FANI, 'mulaiSesi ulang -> sesi AKTIF yang SAMA (resume)');
eq(r.data.jawaban.length, 3, 'resume kembalikan 3 jawaban autosave');
r = post('getSesi', { token: TOKEN_FANI, sesiId: SESI_FANI });
ok(r.success && r.data.sesi.status === 'AKTIF', 'getSesi setelah "reload" tetap AKTIF (bukan batal)');
eq(r.data.jawaban.length, 3, 'getSesi kembalikan jawaban autosave');
ok(r.data.sisaDetik > 0, 'getSesi kembalikan sisaDetik > 0');
// --- submit A: pg benar, pgk sebagian, bs salah, jodoh sebagian, isian case+spasi, essay menunggu ---
r = post('submitJawaban', {
  token: TOKEN_FANI, sesiId: SESI_FANI,
  jawaban: [
    { soalId: SOAL6.pg, jawaban: 'B' },
    { soalId: SOAL6.pgk, jawaban: [0] },
    { soalId: SOAL6.bs, jawaban: 'Salah' },
    { soalId: SOAL6.jodoh, jawaban: [1, 1] },
    { soalId: SOAL6.isian, jawaban: '  JAKARTA ' },
    { soalId: SOAL6.essay, jawaban: 'Esai saya tentang pentingnya belajar.' },
  ],
});
ok(r.success, 'submitJawaban 6 jenis sukses');
{
  const h = r.data.hasil;
  eq([h.benar, h.salah, h.kosong], [2, 3, 0], 'benar=2 (pg+isian), salah=3 (pgk/bs/jodoh sebagian/salah), kosong=0');
  eq([h.skor, h.totalBobot, h.nilai], [7, 17, 41], 'skor 2+1+0+2+2+0=7 dari 17 -> nilai 41');
  eq([h.status, h.essayBelumDinilai, h.nilaiFinal, h.tuntas], ['Menunggu penilaian', 1, false, false], 'essay belum dinilai -> status Menunggu penilaian, nilai belum final');
  eq(sheetRows('Hasil').find((x) => x[0] === h.id).slice(14), ['Menunggu penilaian', 1], 'kolom Status & EssayBelumDinilai tersimpan di sheet');
}
const HASIL_A = r.data.hasil.id;
r = post('submitJawaban', { token: TOKEN_FANI, sesiId: SESI_FANI, jawaban: [] });
ok(r.success && r.data.hasil.id === HASIL_A, 'submit ulang -> hasil SAMA (idempotent)');
r = post('getHasilSiswa', { token: TOKEN_FANI, paketId: PAKET6 });
ok(r.success && r.data.length === 1, 'Fani punya 1 hasil paket6');
{
  const h = r.data[0];
  eq(h.rincian.length, 6, 'rincian 6 soal (tampilPembahasan=1)');
  const es = h.rincian.find((x) => x.jenis === 'essay');
  eq([es.menungguPenilaian, es.skor], [true, 0], 'rincian essay: menungguPenilaian=true, skor 0');
  const jd = h.rincian.find((x) => x.jenis === 'jodoh');
  eq([jd.pasanganKiri.length, jd.kunciPasangan], [2, [1, 0]], 'rincian jodoh: pasangan + kunciPasangan');
  const pk = h.rincian.find((x) => x.jenis === 'pgk');
  eq([pk.skor, pk.bobot], [1, 3], 'rincian pgk: skor 1 dari bobot 3');
}
// --- nilaiEssay: validasi peran, rentang, hitung ulang ---
r = post('nilaiEssay', { token: TOKEN_FANI, hasilId: HASIL_A, soalId: SOAL6.essay, skor: 5 });
ok(!r.success && /guru atau admin/i.test(r.message), 'siswa tidak boleh nilaiEssay');
r = post('savePengguna', { token: TOKEN_ADMIN, nama: 'Guru Dua', username: 'guru2', peran: 'guru', password: 'g12345' });
ok(r.success, 'savePengguna guru2');
r = post('login', { username: 'guru2', password: 'g12345' });
const TOKEN_GURU2X = r.data.token;
r = post('nilaiEssay', { token: TOKEN_GURU2X, hasilId: HASIL_A, soalId: SOAL6.essay, skor: 5 });
ok(!r.success && /pengampu/i.test(r.message), 'guru bukan pembuat paket tidak boleh nilaiEssay');
r = post('nilaiEssay', { token: TOKEN_GURU3, hasilId: HASIL_A, soalId: SOAL6.essay, skor: 6 });
ok(!r.success && /0 sampai 5/i.test(r.message), 'nilaiEssay skor > bobot ditolak');
r = post('nilaiEssay', { token: TOKEN_GURU3, hasilId: HASIL_A, soalId: SOAL6.essay, skor: -1 });
ok(!r.success && /0 sampai 5/i.test(r.message), 'nilaiEssay skor negatif ditolak');
r = post('nilaiEssay', { token: TOKEN_GURU3, hasilId: HASIL_A, soalId: SOAL6.pg, skor: 1 });
ok(!r.success && /bukan essay/i.test(r.message), 'nilaiEssay soal bukan essay ditolak');
r = post('nilaiEssay', { token: TOKEN_GURU3, hasilId: 'palsu', soalId: SOAL6.essay, skor: 1 });
ok(!r.success && /tidak ditemukan/i.test(r.message), 'nilaiEssay hasil tak dikenal ditolak');
r = post('nilaiEssay', { token: TOKEN_GURU3, hasilId: HASIL_A, soalId: SOAL6.essay, skor: 5 });
ok(r.success, 'nilaiEssay skor penuh (5/5) sukses');
{
  const h = r.data.hasil;
  eq([h.skor, h.nilai, h.status, h.essayBelumDinilai, h.nilaiFinal, h.tuntas], [12, 71, 'Tuntas', 0, true, true], 'setelah essay 5: skor 12, nilai 71, Tuntas vs KKM 70');
  eq([h.benar, h.salah], [3, 3], 'essay penuh -> benar bertambah');
}
r = post('nilaiEssay', { token: TOKEN_GURU3, hasilId: HASIL_A, soalId: SOAL6.essay, skor: 3 });
{
  const h = r.data.hasil;
  eq([h.skor, h.nilai, h.status, h.tuntas], [10, 59, 'Belum Tuntas', false], 'nilai ulang essay 3: skor 10, nilai 59, Belum Tuntas');
  eq([h.benar, h.salah], [2, 4], 'essay sebagian -> salah');
}
r = post('nilaiEssay', { token: TOKEN_ADMIN, sesiId: SESI_FANI, soalId: SOAL6.essay, skor: 4 });
{
  const h = r.data.hasil;
  eq([h.skor, h.nilai, h.status], [11, 65, 'Belum Tuntas'], 'admin boleh nilaiEssay via sesiId: skor 11, nilai 65');
}
// --- submit B (reset dulu): pgk dengan pilihan salah, jodoh penuh ---
r = post('resetSesi', { token: TOKEN_GURU3, username: 'fani', paketId: PAKET6 });
ok(r.success, 'resetSesi Fani paket6');
eq([r.data.sesiDihapus, r.data.hasilDihapus, r.data.jawabanDihapus], [1, 1, 6], 'reset hapus 1 sesi + 1 hasil + 6 jawaban autosave');
r = post('mulaiSesi', { token: TOKEN_FANI, paketId: PAKET6, tokenUjian: 'TOKEN9' });
ok(r.success, 'Fani mulai sesi baru paket6');
const SESI_FANI_B = r.data.sesi.id;
r = post('submitJawaban', {
  token: TOKEN_FANI, sesiId: SESI_FANI_B,
  jawaban: [
    { soalId: SOAL6.pg, jawaban: 'A' },
    { soalId: SOAL6.pgk, jawaban: [0, 1, 2] },
    { soalId: SOAL6.bs, jawaban: 'Benar' },
    { soalId: SOAL6.jodoh, jawaban: [1, 0] },
    { soalId: SOAL6.isian, jawaban: 'Bandung' },
    { soalId: SOAL6.essay, jawaban: 'Esai kedua.' },
  ],
});
ok(r.success, 'submit B sukses');
{
  const h = r.data.hasil;
  eq([h.benar, h.salah, h.kosong], [2, 3, 0], 'submit B: benar=2 (bs+jodoh), salah=3, kosong=0');
  eq([h.skor, h.totalBobot, h.nilai], [6, 17, 35], 'submit B: pgk (2-1)/3x3=1; skor 0+1+1+4+0+0=6 -> nilai 35');
  eq(h.status, 'Menunggu penilaian', 'submit B masih menunggu essay');
}
r = post('nilaiEssay', { token: TOKEN_GURU3, hasilId: r.data.hasil.id, soalId: SOAL6.essay, skor: 0 });
{
  const h = r.data.hasil;
  eq([h.skor, h.nilai, h.status, h.nilaiFinal], [6, 35, 'Belum Tuntas', true], 'essay 0: skor tetap 6, nilai 35, Belum Tuntas, final');
  eq([h.benar, h.salah], [2, 4], 'essay 0 -> salah');
}
// --- submit C (reset dulu): pgk semua salah -> floor 0; essay tak dijawab -> kosong ---
r = post('resetSesi', { token: TOKEN_GURU3, username: 'fani', paketId: PAKET6 });
ok(r.success, 'resetSesi kedua Fani paket6');
r = post('mulaiSesi', { token: TOKEN_FANI, paketId: PAKET6, tokenUjian: 'TOKEN9' });
ok(r.success, 'Fani mulai sesi ketiga paket6');
const SESI_FANI_C = r.data.sesi.id;
r = post('submitJawaban', { token: TOKEN_FANI, sesiId: SESI_FANI_C, jawaban: [{ soalId: SOAL6.pgk, jawaban: [2] }] });
ok(r.success, 'submit C (hanya pgk salah) sukses');
{
  const h = r.data.hasil;
  eq([h.benar, h.salah, h.kosong, h.skor, h.nilai], [0, 1, 5, 0, 0], 'pgk semua salah -> skor 0 (floor, tanpa negatif); essay tak dijawab = kosong');
  eq([h.essayBelumDinilai, h.nilaiFinal, h.status], [0, true, 'Belum Tuntas'], 'essay tak dijawab bukan "menunggu"');
}
// --- saveSoal jodoh via kunciJodoh (format form frontend: kunci '' + peta) ---
r = post('saveSoal', { token: TOKEN_GURU3, jenjangId: 'JJG-SMK', mapelId: MAPEL_MTS_1, jenis: 'jodoh', soal: 'Jodoh via peta', pasanganKiri: ['a', 'b'], pasanganKanan: ['x', 'y'], kunci: '', kunciJodoh: { 0: 1, 1: 0 }, bobot: 2 });
ok(r.success && !!r.data.id, 'saveSoal jodoh via kunciJodoh (peta) sukses');
{
  const row = sheetRows('BankSoal').find((x) => x[0] === r.data.id);
  eq(JSON.parse(row[17]), [1, 0], 'KunciJSON jodoh dari peta = [1,0]');
}
// --- submit D (format serial frontend): pgk 'A,B', jodoh string JSON '{"0":1,"1":0}' ---
r = post('resetSesi', { token: TOKEN_GURU3, username: 'fani', paketId: PAKET6 });
ok(r.success, 'resetSesi ketiga Fani paket6');
r = post('mulaiSesi', { token: TOKEN_FANI, paketId: PAKET6, tokenUjian: 'TOKEN9' });
ok(r.success, 'Fani mulai sesi keempat paket6');
const SESI_FANI_D = r.data.sesi.id;
r = post('simpanJawaban', { token: TOKEN_FANI, sesiId: SESI_FANI_D, jawaban: [{ soalId: SOAL6.jodoh, jawaban: '{"0":1,"1":0}' }] });
ok(r.success && r.data.tersimpan === 1, 'simpanJawaban jodoh string JSON tersimpan');
r = post('getJawabanSesi', { token: TOKEN_FANI, sesiId: SESI_FANI_D });
eq(r.data.jawaban.find((x) => x.soalId === SOAL6.jodoh).jawaban, '{"0":1,"1":0}', 'getJawabanSesi kembalikan string JSON jodoh utuh');
r = post('submitJawaban', {
  token: TOKEN_FANI, sesiId: SESI_FANI_D, jawaban: [
    { soalId: SOAL6.pg, jawaban: 'B' },
    { soalId: SOAL6.pgk, jawaban: 'A,B' },
    { soalId: SOAL6.bs, jawaban: 'Benar' },
    { soalId: SOAL6.isian, jawaban: 'jakarta' },
    { soalId: SOAL6.essay, jawaban: 'Esai keempat.' },
  ],
});
ok(r.success, 'submit D (format serial frontend) sukses');
{
  const h = r.data.hasil;
  eq([h.benar, h.salah, h.kosong], [4, 1, 0], 'submit D: benar=4 (pg+bs+jodoh+isian), salah=1 (pgk 2/3), kosong=0');
  eq([h.skor, h.totalBobot, h.nilai], [11, 17, 65], 'submit D: skor 2+2+1+4+2+0=11 -> nilai 65 (jodoh string JSON dinilai penuh)');
  eq(h.status, 'Menunggu penilaian', 'submit D masih menunggu essay');
}
// --- getHasilSiswa: guru melihat hasil siswa lain (untuk nilai essay) ---
r = post('getHasilSiswa', { token: TOKEN_GURU3, paketId: PAKET6 });
ok(r.success && r.data.length === 1 && r.data[0].username === 'fani', 'guru melihat hasil Fani via getHasilSiswa');
ok(Array.isArray(r.data[0].rincian) && r.data[0].rincian.some((x) => x.jenis === 'essay' && x.menungguPenilaian === true), 'guru menerima rincian essay yang menunggu penilaian');
r = post('getHasilSiswa', { token: TOKEN_FANI, paketId: PAKET6 });
ok(r.success && r.data.every((h) => h.username === 'fani'), 'siswa tetap hanya melihat hasilnya sendiri');

console.log('\n[28] anti-bentrok jadwal (savePaket)');
r = post('savePaket', { token: TOKEN_GURU3, nama: 'Bentrok 7A', jenjangId: 'JJG-SMK', mapelId: MAPEL_MTS_1, kelasIds: [KELAS_7A], modeSoal: 'manual', soalIds: [SOAL1], durasiMenit: 60, mulai: jamLalu(-1), selesai: jamLalu(2) });
ok(!r.success && /bentrok/i.test(r.message) && /Try Out 1 Revisi/.test(r.message), 'paket 7A jam sama -> ditolak (sebut nama paket bentrok)');
r = post('savePaket', { token: TOKEN_GURU3, nama: 'Semua Kelas Bentrok', jenjangId: 'JJG-SMK', mapelId: MAPEL_MTS_1, kelasIds: [], modeSoal: 'manual', soalIds: [SOAL1], durasiMenit: 60, mulai: jamLalu(-1), selesai: jamLalu(2) });
ok(!r.success && /bentrok/i.test(r.message), 'paket semua-kelas jam sama -> ditolak (kelasIds kosong = semua kelas)');
r = post('savePaket', { token: TOKEN_GURU3, nama: 'Besok 7A', jenjangId: 'JJG-SMK', mapelId: MAPEL_MTS_1, kelasIds: [KELAS_7A], modeSoal: 'manual', soalIds: [SOAL1], durasiMenit: 60, mulai: jamLalu(23), selesai: jamLalu(25) });
ok(r.success && !!r.data.id, 'paket 7A hari lain (besok) -> lolos');
const PAKET_BESOK = r.data.id;
r = post('savePaket', { token: TOKEN_GURU3, nama: 'Kelas 9B', jenjangId: 'JJG-SMK', mapelId: MAPEL_MTS_1, kelasIds: ['KLS-9B'], modeSoal: 'manual', soalIds: [SOAL1], durasiMenit: 60, mulai: jamLalu(-1), selesai: jamLalu(2) });
ok(r.success && !!r.data.id, 'paket kelas lain jam sama -> lolos');
const PAKET_9B = r.data.id;
r = post('savePaket', { token: TOKEN_GURU3, id: PAKET_BESOK, nama: 'Besok 7A', jenjangId: 'JJG-SMK', mapelId: MAPEL_MTS_1, kelasIds: [KELAS_7A], modeSoal: 'manual', soalIds: [SOAL1], durasiMenit: 60, mulai: jamLalu(-1), selesai: jamLalu(2) });
ok(!r.success && /bentrok/i.test(r.message), 'EDIT paket besok ke jam bentrok -> ditolak');
r = post('savePaket', { token: TOKEN_GURU3, id: PAKET_BESOK, nama: 'Besok 7A', jenjangId: 'JJG-SMK', mapelId: MAPEL_MTS_1, kelasIds: [KELAS_7A], modeSoal: 'manual', soalIds: [SOAL1], durasiMenit: 60, mulai: jamLalu(26), selesai: jamLalu(28) });
ok(r.success, 'EDIT paket besok ke jam lain (hari sama, tak bersinggungan) -> lolos');
r = post('savePaket', { token: TOKEN_GURU3, nama: 'Nonaktif Bentrok', jenjangId: 'JJG-SMK', mapelId: MAPEL_MTS_1, kelasIds: [KELAS_7A], modeSoal: 'manual', soalIds: [SOAL1], durasiMenit: 60, mulai: jamLalu(-1), selesai: jamLalu(2), aktif: 0 });
ok(r.success && !!r.data.id, 'paket NONAKTIF jam bentrok -> lolos (hanya paket aktif dicek)');
const PAKET_OFF2 = r.data.id;
r = post('deletePaket', { token: TOKEN_GURU3, id: PAKET_OFF2 });
ok(r.success, 'bersihkan paket nonaktif uji bentrok');
r = post('savePaket', { token: TOKEN_GURU3, id: PAKET1, nama: 'Try Out 1 Revisi', jenjangId: 'JJG-SMK', mapelId: MAPEL_MTS_1, kelasIds: [KELAS_7A], modeSoal: 'manual', soalIds: [SOAL1, SOAL2, SOAL3], durasiMenit: 60, mulai: jamLalu(-1), selesai: jamLalu(2), acakSoal: 1, acakOpsi: 1, tampilSkor: 1, tampilPembahasan: 1, aktif: 1 });
ok(r.success, 'EDIT paket sendiri (abaikan diri sendiri) -> lolos');

console.log('\n[29] durasiStandar & jedaGelombang (Pengaturan)');
r = post('getAllData', { token: TOKEN_GURU3 });
eq([r.data.pengaturan.namaSekolah, r.data.pengaturan.kkm, r.data.pengaturan.durasiStandar, r.data.pengaturan.jedaGelombang], ['SMK Negeri 1 Juwangi', 70, 60, 3], 'getAllData: namaSekolah + kkm 70 + durasiStandar 60 + jedaGelombang 3');
r = post('savePengaturan', { token: TOKEN_GURU3, pengaturan: { durasiStandar: 90 } });
ok(!r.success && /admin/i.test(r.message), 'guru ditolak ubah durasiStandar');
r = post('savePengaturan', { token: TOKEN_ADMIN, pengaturan: { durasiStandar: 0 } });
ok(!r.success && /5-300/.test(r.message), 'durasiStandar 0 ditolak');
r = post('savePengaturan', { token: TOKEN_ADMIN, pengaturan: { durasiStandar: 301 } });
ok(!r.success && /5-300/.test(r.message), 'durasiStandar 301 ditolak');
r = post('savePengaturan', { token: TOKEN_ADMIN, pengaturan: { durasiStandar: 90 } });
ok(r.success, 'durasiStandar 90 tersimpan');
r = post('savePengaturan', { token: TOKEN_ADMIN, pengaturan: { jedaGelombang: -1 } });
ok(!r.success && /0-60/.test(r.message), 'jedaGelombang -1 ditolak');
r = post('savePengaturan', { token: TOKEN_ADMIN, pengaturan: { jedaGelombang: 61 } });
ok(!r.success && /0-60/.test(r.message), 'jedaGelombang 61 ditolak');
r = post('savePengaturan', { token: TOKEN_ADMIN, pengaturan: { jedaGelombang: 5 } });
ok(r.success, 'jedaGelombang 5 tersimpan');
r = post('getAllData', { token: TOKEN_GURU3 });
eq([r.data.pengaturan.durasiStandar, r.data.pengaturan.jedaGelombang], [90, 5], 'durasiStandar & jedaGelombang terbaca setelah disimpan');
// Backend TIDAK memaksa durasi ujian = durasi standar (paket boleh 45 menit)
r = post('savePaket', { token: TOKEN_GURU3, nama: 'Durasi 45', jenjangId: 'JJG-SMK', mapelId: MAPEL_MTS_1, kelasIds: ['KLS-9B'], modeSoal: 'manual', soalIds: [SOAL1], durasiMenit: 45, mulai: jamLalu(30), selesai: jamLalu(32) });
ok(r.success && !!r.data.id, 'savePaket durasi 45 saat standar 90 sukses');
const PAKET_D45 = r.data.id;
r = post('getAllData', { token: TOKEN_GURU3 });
{
  const p45 = r.data.paket.find((p) => p.id === PAKET_D45);
  eq(p45.durasiMenit, 45, 'durasi per ujian tetap 45 (tidak dipaksa = durasiStandar 90)');
  eq(p45.jedaGelombang, 5, 'jedaGelombang paket default dari Pengaturan (5)');
}
r = post('deletePaket', { token: TOKEN_GURU3, id: PAKET_D45 });
ok(r.success, 'bersihkan paket durasi 45');
r = post('savePengaturan', { token: TOKEN_ADMIN, pengaturan: { durasiStandar: 60, jedaGelombang: 3 } });
ok(r.success, 'kembalikan durasiStandar 60 & jedaGelombang 3');

console.log('\n[30] resume & sheet JawabanSiswa — tutup tab = JEDA, bukan batal');
eq(sheetRows('JawabanSiswa').length > 1, true, 'sheet JawabanSiswa terisi jawaban autosave');
r = post('resetSesi', { token: TOKEN_GURU3, username: 'fani', paketId: PAKET6 });
ok(r.success, 'resetSesi Fani paket6 (persiapan resume)');
r = post('mulaiSesi', { token: TOKEN_FANI, paketId: PAKET6, tokenUjian: 'TOKEN9' });
ok(r.success, 'Fani mulai sesi resume');
const SESI_FANI3 = r.data.sesi.id;
r = post('simpanJawaban', { token: TOKEN_FANI, sesiId: SESI_FANI3, jawaban: [{ soalId: SOAL6.pg, jawaban: 'B' }] });
ok(r.success, 'autosave 1 jawaban di sesi resume');
// Simulasi reload halaman: getSesi + mulaiSesi lagi (tanpa batalkanSesi)
r = post('getSesi', { token: TOKEN_FANI, sesiId: SESI_FANI3 });
ok(r.success && r.data.sesi.status === 'AKTIF', 'setelah reload: sesi tetap AKTIF');
eq(r.data.jawaban.length, 1, 'setelah reload: jawaban autosave kembali');
ok(r.data.sisaDetik > 0, 'setelah reload: sisaDetik > 0');
r = post('mulaiSesi', { token: TOKEN_FANI, paketId: PAKET6, tokenUjian: 'TOKEN9' });
ok(r.success && r.data.sesi.id === SESI_FANI3, 'mulaiSesi setelah reload -> sesi YANG SAMA');
eq(r.data.jawaban.find((x) => x.soalId === SOAL6.pg).jawaban, 'B', 'jawaban pg kembali setelah reload');
{
  const srow = sheetRows('SesiUjian').find((x) => x[0] === SESI_FANI3);
  eq(srow[5], 'AKTIF', 'status di sheet tetap AKTIF (tidak ada auto-batal karena reload)');
}
r = post('getJawabanSesi', { token: TOKEN_FANI, sesiId: 'palsu' });
ok(!r.success && /tidak ditemukan/i.test(r.message), 'getJawabanSesi id tak dikenal -> error');
// getAllData siswa TIDAK bocorkan jawaban/kunci jenis baru
r = post('getAllData', { token: TOKEN_FANI });
ok(!/"kunci"/.test(JSON.stringify(r.data)), 'TIDAK ADA "kunci" di seluruh respons siswa (termasuk soal 6 jenis)');

console.log(`\n==============================\nHasil: ${passed} lolos, ${failed} gagal\n==============================`);
process.exit(failed > 0 ? 1 : 0);
