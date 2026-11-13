/**
 * BACKEND — Aplikasi CBT Madrasah Digital (wwn-cbt-madrasah-80)
 * Google Apps Script + Google Sheets + Google Drive (+ Google Forms opsional)
 *
 * Fitur:
 *  - Auth: login username+password (hash SHA-256 + garam), token sesi 7 hari,
 *    peran admin > guru > siswa.
 *  - Master: Jenjang, Mapel, Kelas (CRUD, tolak hapus bila dipakai).
 *  - Pengguna: CRUD admin/guru/siswa + reset password + impor siswa massal
 *    (termasuk No. HP/WA orang tua).
 *  - Bank soal: CRUD + impor massal + impor dari Google Form (kuis).
 *    6 jenis soal (pg/pgk/bs/jodoh/isian/essay) + penilaian manual essay.
 *  - Paket try out: mode manual / acak, jendela waktu, batas kelas.
 *  - Sesi ujian: mulai (acak soal per siswa, token ujian STATIS),
 *    get, batalkan (idempotent, aman untuk sendBeacon), catat peringatan
 *    (auto-batal di ambang), autosave jawaban + resume (tutup tab = JEDA,
 *    bukan batal), submit jawaban (PENILAIAN DIHITUNG DI SERVER), reset sesi.
 *  - Hasil & monitor: rekap per paket, hasil per siswa (rincian+pembahasan
 *    hanya bila paket mengizinkan), monitor sesi live.
 *  - Analisis nilai: dashboard analisis per siswa (penguasaan mapel, tren
 *    nilai, mapel terkuat/terlemah vs KKM) dan per kelas (statistik nilai,
 *    distribusi, 5 teratas/terbawah, analisis butir soal: tingkat kesukaran
 *    & daya beda).
 *  - Notifikasi progres belajar: kirim WA ke orang tua via endpoint WA
 *    milik sekolah (best-effort, tidak pernah melempar error) + riwayat
 *    pengiriman.
 *  - Pengaturan: identitas + ambang peringatan + KKM + konfigurasi WA;
 *    upload logo & gambar soal ke Google Drive.
 *
 * CARA PAKAI (untuk pemula):
 *  1. Buat Google Spreadsheet baru (mis. "Database CBT Sekolah Digital").
 *  2. Buka menu Extensions > Apps Script. HAPUS seluruh isi editor,
 *     lalu PASTE seluruh isi file ini. Simpan.
 *  3. Tambahkan file manifest: di editor pilih Project Settings (ikon roda gigi)
 *     > centang "Show appsscript.json manifest file in editor", lalu buka file
 *     appsscript.json yang muncul dan GANTI seluruh isinya dengan file
 *     backend/appsscript.json dari repo ini. (Dibutuhkan agar upload ke Google
 *     Drive dan impor Google Form mendapat izin yang cukup.)
 *  4. (Hanya jika memakai upload / impor Form) Jalankan fungsi
 *     "authorizeDriveAccess" dan/atau "authorizeFormsAccess" dari editor,
 *     lalu setujui izin Google.
 *  5. Deploy > New deployment > Web app:
 *     - Execute as: Me
 *     - Who has access: Anyone
 *     Setiap ada perubahan kode: Deploy > Manage deployments > New version.
 *  6. Salin URL /exec ke menu Konfigurasi di aplikasi web,
 *     lalu klik "Inisialisasi Database".
 *
 * Sheet yang dibuat (12): Pengaturan, Pengguna, Jenjang, Mapel, Kelas,
 * BankSoal, Paket, SesiUjian, JawabanSiswa, Hasil, LogAktivitas, Notifikasi
 *
 * KONTRAK API: docs/API_CONTRACT.md (sumber kebenaran — implementasi ini
 * mengikutinya).
 *
 * CATATAN PENTING:
 *  - Envelope respons SELALU: {success, message?, data?, error?}.
 *  - Format TANGGAL di wire: yyyy-MM-dd; DATETIME: yyyy-MM-dd HH:mm:ss.
 *    (Tampilan dd/mm/yyyy diurus frontend.)
 *  - Password TIDAK PERNAH disimpan plaintext: SHA-256(garam + password).
 *    Hash/garam/token TIDAK PERNAH dikirim ke frontend.
 *  - Kunci jawaban & pembahasan TIDAK PERNAH dikirim ke siswa.
 *  - Penilaian submitJawaban DIHITUNG DI SERVER dari kunci BankSoal
 *    (6 jenis soal; essay dinilai manual via nilaiEssay).
 *  - Token sesi kedaluwarsa 7 hari; logout menghapus token.
 *  - Akun bawaan: admin / admin123 (admin), guru / guru123 (guru).
 *    SEGERA ganti kata sandi setelah inisialisasi!
 */

var APP_VERSION = '1.2.5';

// ============================================================
// KONFIGURASI SHEET (satu sumber kebenaran untuk nama & header)
// ============================================================
var SHEET_PENGATURAN = 'Pengaturan';
var SHEET_PENGGUNA = 'Pengguna';
var SHEET_JENJANG = 'Jenjang';
var SHEET_MAPEL = 'Mapel';
var SHEET_KELAS = 'Kelas';
var SHEET_BANKSOAL = 'BankSoal';
var SHEET_PAKET = 'Paket';
var SHEET_SESI = 'SesiUjian';
var SHEET_JAWABAN = 'JawabanSiswa';
var SHEET_HASIL = 'Hasil';
var SHEET_LOG = 'LogAktivitas';
var SHEET_NOTIFIKASI = 'Notifikasi';

var SEMUA_SHEET = [SHEET_PENGATURAN, SHEET_PENGGUNA, SHEET_JENJANG,
  SHEET_MAPEL, SHEET_KELAS, SHEET_BANKSOAL, SHEET_PAKET, SHEET_SESI,
  SHEET_JAWABAN, SHEET_HASIL, SHEET_LOG, SHEET_NOTIFIKASI];

var HEADERS = {};
HEADERS[SHEET_PENGATURAN] = ['Kunci', 'Nilai'];
HEADERS[SHEET_PENGGUNA] = ['ID', 'Nama', 'Username', 'PasswordHash',
  'PasswordSalt', 'Peran', 'NIS', 'JenjangID', 'KelasID', 'Token',
  'TokenKedaluwarsa', 'Aktif', 'NoHP'];
HEADERS[SHEET_JENJANG] = ['ID', 'Nama', 'DibuatPada'];
HEADERS[SHEET_MAPEL] = ['ID', 'JenjangID', 'Nama', 'DibuatPada'];
HEADERS[SHEET_KELAS] = ['ID', 'JenjangID', 'Nama', 'DibuatPada'];
HEADERS[SHEET_BANKSOAL] = ['ID', 'JenjangID', 'MapelID', 'Soal', 'OpsiA',
  'OpsiB', 'OpsiC', 'OpsiD', 'OpsiE', 'Kunci', 'Bobot', 'Pembahasan',
  'GambarUrl', 'DibuatPada', 'DibuatOleh', 'Jenis', 'OpsiJSON', 'KunciJSON',
  'Tingkat', 'KelasID'];
HEADERS[SHEET_PAKET] = ['ID', 'Nama', 'JenjangID', 'MapelID', 'KelasIDsJSON',
  'ModeSoal', 'SoalIDsJSON', 'JumlahAcak', 'DurasiMenit', 'Mulai', 'Selesai',
  'AcakSoal', 'AcakOpsi', 'TampilSkor', 'TampilPembahasan', 'Aktif',
  'DibuatPada', 'DibuatOleh', 'Token', 'JedaGelombang'];
HEADERS[SHEET_SESI] = ['ID', 'PaketID', 'Username', 'WaktuMulai',
  'WaktuSelesai', 'Status', 'Peringatan', 'SoalIDsJSON', 'DibuatPada'];
HEADERS[SHEET_HASIL] = ['ID', 'SesiID', 'PaketID', 'Username', 'NamaSiswa',
  'Kelas', 'JawabanJSON', 'Benar', 'Salah', 'Kosong', 'Skor', 'TotalBobot',
  'Nilai', 'WaktuSubmit', 'Status', 'EssayBelumDinilai'];
HEADERS[SHEET_JAWABAN] = ['SesiID', 'SoalID', 'Jawaban', 'SkorSementara',
  'UpdatedAt'];
HEADERS[SHEET_LOG] = ['ID', 'Waktu', 'Username', 'SesiID', 'Jenis', 'Detail'];
HEADERS[SHEET_NOTIFIKASI] = ['ID', 'Waktu', 'Username', 'NamaSiswa', 'NoHP',
  'Jenis', 'Isi', 'Status'];

var DEFAULT_PENGATURAN = [
  ['namaSekolah', 'SMK Negeri 1 Juwangi'],
  ['alamatSekolah', ''],
  ['telepon', ''],
  ['namaKepala', ''],
  ['logoUrl', ''],
  ['ambangPeringatan', '3'],
  ['wajibFullscreen', '1'],
  ['izinkanUlangSetelahBatal', '0'],
  ['kkm', '75'],
  ['durasiStandar', '60'],
  ['jedaGelombang', '3'],
  ['waAktif', 'false'],
  ['waEndpoint', ''],
  ['waApiKey', ''],
  ['waTemplateProgres', 'Halo {nama}, progres belajar CBT {sekolah} per {tanggal}: rata-rata nilai {rata2} dari {jmlUjian} ujian. Mapel yang perlu ditingkatkan: {mapelLemah}. Tetap semangat!']
];

// Kunci pengaturan yang boleh diubah via savePengaturan (kunci lain diabaikan)
var KUNCI_PENGATURAN = ['namaSekolah', 'alamatSekolah', 'telepon',
  'namaKepala', 'logoUrl', 'ambangPeringatan', 'wajibFullscreen',
  'izinkanUlangSetelahBatal', 'kkm', 'durasiStandar', 'jedaGelombang',
  'waAktif', 'waEndpoint', 'waApiKey', 'waTemplateProgres'];

var PERAN_VALID = ['admin', 'guru', 'siswa'];
var PERAN_RANK = { siswa: 1, guru: 2, admin: 3 };
var TOKEN_MASA_BERLAKU_MS = 7 * 24 * 60 * 60 * 1000; // 7 hari
var MODE_SOAL_VALID = ['manual', 'acak'];
var KUNCI_VALID = ['A', 'B', 'C', 'D', 'E'];
var STATUS_SESI_VALID = ['AKTIF', 'SELESAI', 'BATAL'];

// Batas ukuran upload gambar (base64 murni, jumlah karakter). ~2 MB.
var MAX_GAMBAR_BASE64 = 2800000;
var NAMA_FOLDER_LOGO = 'Logo wwn-cbt-madrasah-80';
var NAMA_FOLDER_GAMBAR_SOAL = 'Gambar Soal wwn-cbt-madrasah-80';

// ============================================================
// HELPER UMUM
// ============================================================
function asString(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function asInt(v, def) {
  var n = parseInt(asString(v), 10);
  return isNaN(n) ? (def === undefined ? 0 : def) : n;
}

/** Kunci pembanding teks: huruf kecil + spasi tunggal (dedupe impor, v1.2.1). */
function normalisasiTeksKunci(s) {
  return asString(s).toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Flag 0/1 yang pemaaf: terima 0/1/'0'/'1'/true/false; selainnya default. */
function asFloat(v, def) {
  var n = parseFloat(asString(v));
  return isNaN(n) ? (def === undefined ? 0 : def) : n;
}

function asFlag(v, def) {
  if (v === undefined || v === null) return def;
  var s = asString(v).toLowerCase();
  if (s === '1' || s === 'true') return 1;
  if (s === '0' || s === 'false') return 0;
  return def;
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function sekarangISODateTime() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
}

/**
 * Sel spreadsheet -> string. Tahan terhadap sel tanggal Google Sheets
 * (dibaca sebagai objek Date) maupun string biasa.
 */
function selKeString(v) {
  if (v === null || v === undefined) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    if (isNaN(v.getTime())) return '';
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  }
  return asString(v);
}

/** Sel tanggal -> ISO yyyy-mm-dd (tahan terhadap objek Date). */
function tanggalKeISO(v) {
  if (v === null || v === undefined) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    if (isNaN(v.getTime())) return '';
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return asString(v);
}

/** JSON.parse yang aman: gagal -> nilai default. */
function parseJSONLunak(s, def) {
  try {
    var v = JSON.parse(asString(s));
    return (v === undefined || v === null) ? def : v;
  } catch (e) {
    return def;
  }
}

function getOrCreateSheet(ss, name) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  return sheet;
}

/** Baca semua baris data (tanpa header) sebagai array 2D. */
function readRows(sheet) {
  if (!sheet || sheet.getLastRow() < 2) return [];
  var lastCol = sheet.getLastColumn();
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, lastCol).getValues();
}

/** Cari nomor baris (1-based, termasuk header) yang kolomnya == nilai. -1 jika tidak ada. */
function findRowNum(sheet, colIdx, value) {
  var rows = readRows(sheet);
  var cari = asString(value);
  for (var i = 0; i < rows.length; i++) {
    if (asString(rows[i][colIdx - 1]) === cari) return i + 2;
  }
  return -1;
}

/** Hitung baris yang kolomnya == nilai (untuk cek "dipakai"). */
function hitungPakai(sheet, colIdx, value) {
  var rows = readRows(sheet);
  var cari = asString(value);
  var n = 0;
  for (var i = 0; i < rows.length; i++) {
    if (asString(rows[i][colIdx - 1]) === cari) n++;
  }
  return n;
}

/** Cari baris (array) berdasarkan kolom ID (kolom 1). null jika tidak ada. */
function cariBarisById(ss, namaSheet, id) {
  var sheet = ss.getSheetByName(namaSheet);
  if (!sheet) return null;
  var rowNum = findRowNum(sheet, 1, id);
  if (rowNum < 0) return null;
  return sheet.getRange(rowNum, 1, 1, sheet.getLastColumn()).getValues()[0];
}

/** Hapus baris-baris (nomor 1-based) dari sheet, dari bawah ke atas. */
function hapusBarisList(sheet, rowNums) {
  rowNums.sort(function (a, b) { return b - a; });
  for (var i = 0; i < rowNums.length; i++) {
    sheet.deleteRow(rowNums[i]);
  }
}

/** Parse 'yyyy-MM-dd HH:mm:ss' -> Date. null jika format/tanggal tak valid. */
function parseDatetime(s) {
  var m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(asString(s));
  if (!m) return null;
  var d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  if (isNaN(d.getTime())) return null;
  if (d.getFullYear() !== +m[1] || d.getMonth() !== +m[2] - 1 ||
      d.getDate() !== +m[3] || d.getHours() !== +m[4] ||
      d.getMinutes() !== +m[5] || d.getSeconds() !== +m[6]) return null;
  return d;
}

function formatDatetime(d) {
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
}

function tambahMenit(d, menit) {
  return new Date(d.getTime() + menit * 60000);
}

/** Acak salinan array (Fisher-Yates). */
function acakArray(arr) {
  var a = arr.slice();
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

// ============================================================
// PASSWORD (hash + garam) & TOKEN SESI
// ============================================================
function hashPassword(password, salt) {
  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(salt) + String(password)
  );
  var hex = '';
  for (var i = 0; i < bytes.length; i++) {
    var b = bytes[i] < 0 ? bytes[i] + 256 : bytes[i];
    hex += ('0' + b.toString(16)).slice(-2);
  }
  return hex;
}

/**
 * Ambil pengguna dari token sesi. Mengembalikan objek pengguna (tanpa
 * hash/garam/token) atau null jika token tidak valid / kedaluwarsa /
 * akun nonaktif.
 * Kolom Pengguna: ID=1, Nama=2, Username=3, PasswordHash=4, PasswordSalt=5,
 * Peran=6, NIS=7, JenjangID=8, KelasID=9, Token=10, TokenKedaluwarsa=11,
 * Aktif=12.
 */
function getUserFromToken(ss, token) {
  token = asString(token);
  if (!token) return null;
  var sheet = ss.getSheetByName(SHEET_PENGGUNA);
  if (!sheet) return null;
  var rows = readRows(sheet);
  var now = Date.now();
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (asString(r[9]) === token) {
      var exp = Number(r[10]) || 0;
      if (exp < now) return null; // kedaluwarsa
      if (asString(r[11]) !== '1') return null; // akun dinonaktifkan
      return {
        id: asString(r[0]),
        nama: asString(r[1]),
        username: asString(r[2]),
        peran: asString(r[5]),
        nis: asString(r[6]),
        jenjangId: asString(r[7]),
        kelasId: asString(r[8])
      };
    }
  }
  return null;
}

/**
 * Wajibkan autentikasi token. peranMin: 'admin' | 'guru' | 'siswa'
 * (hirarki: admin > guru > siswa).
 * Mengembalikan {ok:true, user} atau {ok:false, message}.
 */
function butuhLogin(ss, payload, peranMin) {
  var token = asString(payload && payload.token);
  var user = getUserFromToken(ss, token);
  if (!user) {
    return { ok: false, message: 'Sesi berakhir, silakan login ulang' };
  }
  var rankUser = PERAN_RANK[user.peran] || 0;
  var rankMin = PERAN_RANK[peranMin] || 0;
  if (rankUser < rankMin) {
    var msg = peranMin === 'admin'
      ? 'Aksi ini hanya boleh dilakukan oleh admin.'
      : 'Aksi ini hanya boleh dilakukan oleh guru atau admin.';
    return { ok: false, message: msg };
  }
  return { ok: true, user: user };
}

/** Hapus token dari sheet (logout). */
function hapusToken(ss, token) {
  token = asString(token);
  if (!token) return;
  var sheet = ss.getSheetByName(SHEET_PENGGUNA);
  if (!sheet) return;
  var rowNum = findRowNum(sheet, 10, token);
  if (rowNum > 0) {
    sheet.getRange(rowNum, 10).setValue('');
    sheet.getRange(rowNum, 11).setValue('');
  }
}

/**
 * Pembungkus aksi ber-token: autentikasi dulu, baru jalankan fn(user).
 * fn mengembalikan objek {success,...}; dibungkus jadi TextOutput JSON.
 */
function denganAuth(ss, payload, peranMin, fn) {
  var auth = butuhLogin(ss, payload, peranMin);
  if (!auth.ok) return jsonResponse({ success: false, message: auth.message });
  try {
    return jsonResponse(fn(auth.user));
  } catch (err) {
    return jsonResponse({ success: false, error: 'aksi: ' + err.message });
  }
}

/**
 * v1.1.0 — Kunci tulis singkat (fine-grained) untuk skala ratusan user bersamaan.
 * Dipakai HANYA oleh aksi tulis. Aksi baca tidak memakai kunci agar tidak antre.
 * Jika kunci tidak didapat dalam 8 detik -> kembalikan {success:false, retryable:true}
 * supaya frontend otomatis mencoba lagi (tidak pernah throw).
 */
function denganKunci(fn) {
  var lock = LockService.getScriptLock();
  var dapat = false;
  try { dapat = lock.tryLock(8000); } catch (e) { dapat = false; }
  if (!dapat) {
    return { success: false, retryable: true,
      message: 'Server sedang sibuk (banyak pengguna bersamaan). Mencoba lagi otomatis…' };
  }
  try {
    return fn();
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}

// ============================================================
// PENGATURAN
// ============================================================
function getSettings(ss) {
  var sheet = getOrCreateSheet(ss, SHEET_PENGATURAN);
  var rows = readRows(sheet);
  var out = {};
  for (var i = 0; i < DEFAULT_PENGATURAN.length; i++) {
    out[DEFAULT_PENGATURAN[i][0]] = DEFAULT_PENGATURAN[i][1];
  }
  for (var j = 0; j < rows.length; j++) {
    var k = asString(rows[j][0]);
    if (k) out[k] = asString(rows[j][1]);
  }
  out.ambangPeringatan = asInt(out.ambangPeringatan, 3);
  out.wajibFullscreen = asFlag(out.wajibFullscreen, 1);
  out.izinkanUlangSetelahBatal = asFlag(out.izinkanUlangSetelahBatal, 0);
  out.kkm = asInt(out.kkm, 75);
  out.durasiStandar = asInt(out.durasiStandar, 60);
  out.jedaGelombang = asInt(out.jedaGelombang, 3);
  return out;
}

function setSetting(ss, kunci, nilai) {
  var sheet = getOrCreateSheet(ss, SHEET_PENGATURAN);
  var rowNum = findRowNum(sheet, 1, kunci);
  if (rowNum > 0) sheet.getRange(rowNum, 2).setValue(nilai);
  else sheet.appendRow([kunci, nilai]);
}

/** Catat satu baris ke LogAktivitas. */
function catatLog(ss, username, sesiId, jenis, detail) {
  try {
    var sheet = getOrCreateSheet(ss, SHEET_LOG);
    sheet.appendRow([Utilities.getUuid(), sekarangISODateTime(),
      asString(username), asString(sesiId), asString(jenis), asString(detail)]);
  } catch (e) {}
}

// ============================================================
// MAPPER BARIS -> OBJEK (camelCase, tanpa rahasia)
// ============================================================
function jenjangKeObjek(r) {
  return { id: asString(r[0]), nama: asString(r[1]) };
}

function mapelKeObjek(r) {
  return { id: asString(r[0]), jenjangId: asString(r[1]), nama: asString(r[2]) };
}

function kelasKeObjek(r) {
  return { id: asString(r[0]), jenjangId: asString(r[1]), nama: asString(r[2]) };
}

function penggunaKePublik(r) {
  return {
    id: asString(r[0]), nama: asString(r[1]), username: asString(r[2]),
    peran: asString(r[5]), nis: asString(r[6]), jenjangId: asString(r[7]),
    kelasId: asString(r[8]), aktif: asInt(r[11], 1), noHP: asString(r[12])
  };
}

/** BankSoal LENGKAP (dengan kunci & pembahasan) — hanya untuk guru/admin. */
function bankSoalKeObjek(r) {
  var s = parseSoalBankRow(r);
  return {
    id: s.id, jenjangId: s.jenjangId, mapelId: s.mapelId, soal: s.soal,
    opsiA: asString(r[4]), opsiB: asString(r[5]), opsiC: asString(r[6]),
    opsiD: asString(r[7]), opsiE: asString(r[8]),
    kunci: s.kunciHuruf || asString(s.kunci), bobot: s.bobot,
    pembahasan: s.pembahasan, gambarUrl: s.gambarUrl,
    dibuatPada: s.dibuatPada,
    jenis: s.jenis, opsi: s.opsi, kunciNilai: s.kunci,
    pasanganKiri: s.kiri, pasanganKanan: s.kanan,
    tingkat: s.tingkat, kelasId: s.kelasId
  };
}

/**
 * Paket. untukSiswa=true -> buang field sensitif (soalIds, dibuatOleh,
 * token); jumlahSoal selalu dikirim.
 */

/**
 * Paket. untukSiswa=true -> buang field sensitif (soalIds, dibuatOleh);
 * jumlahSoal selalu dikirim.
 */
function paketKeObjek(r, untukSiswa) {
  var modeSoal = asString(r[5]);
  var soalIds = parseJSONLunak(r[6], []);
  if (!Array.isArray(soalIds)) soalIds = [];
  var jumlahSoal = modeSoal === 'manual' ? soalIds.length : asInt(r[7], 0);
  var o = {
    id: asString(r[0]), nama: asString(r[1]),
    jenjangId: asString(r[2]), mapelId: asString(r[3]),
    kelasIds: parseJSONLunak(r[4], []),
    modeSoal: modeSoal,
    jumlahAcak: asInt(r[7], 0),
    durasiMenit: asInt(r[8], 60),
    mulai: selKeString(r[9]), selesai: selKeString(r[10]),
    acakSoal: asInt(r[11], 1), acakOpsi: asInt(r[12], 1),
    tampilSkor: asInt(r[13], 1), tampilPembahasan: asInt(r[14], 1),
    aktif: asInt(r[15], 1),
    jedaGelombang: asInt(r[19], 3),
    jumlahSoal: jumlahSoal
  };
  if (!Array.isArray(o.kelasIds)) o.kelasIds = [];
  if (!untukSiswa) {
    o.soalIds = soalIds;
    o.dibuatOleh = asString(r[17]);
    o.token = asString(r[18]);
    o.punyaToken = asString(r[18]) !== '';
  }
  return o;
}


function sesiKeObjek(r, petaPaket, petaPengguna, petaKelas) {
  var uname = asString(r[2]);
  var pg = petaPengguna[uname] || {};
  return {
    id: asString(r[0]), paketId: asString(r[1]),
    namaPaket: petaPaket[asString(r[1])] || '',
    username: uname,
    namaSiswa: pg.nama || uname,
    kelas: petaKelas[pg.kelasId] || '',
    waktuMulai: selKeString(r[3]), waktuSelesai: selKeString(r[4]),
    status: asString(r[5]), peringatan: asInt(r[6], 0)
  };
}

function hasilKeObjek(r, petaPaket, petaPengguna, petaKelas, kkm) {
  var uname = asString(r[3]);
  var pg = petaPengguna[uname] || {};
  var nilai = asInt(r[12], 0);
  var essayBelum = asInt(r[15], 0);
  var ambang = (kkm === undefined || kkm === null) ? 75 : kkm;
  var status = asString(r[14]) ||
    (essayBelum > 0 ? 'Menunggu penilaian'
      : (nilai >= ambang ? 'Tuntas' : 'Belum Tuntas'));
  return {
    id: asString(r[0]), sesiId: asString(r[1]), paketId: asString(r[2]),
    namaPaket: petaPaket[asString(r[2])] || '',
    username: uname,
    namaSiswa: asString(r[4]) || pg.nama || uname,
    kelas: asString(r[5]) || petaKelas[pg.kelasId] || '',
    benar: asInt(r[7], 0), salah: asInt(r[8], 0), kosong: asInt(r[9], 0),
    skor: asFloat(r[10], 0), totalBobot: asFloat(r[11], 0),
    nilai: nilai, waktuSubmit: selKeString(r[13]),
    status: status, essayBelumDinilai: essayBelum,
    nilaiFinal: essayBelum === 0,
    tuntas: essayBelum === 0 && nilai >= ambang
  };
}


/** Baca seluruh sheet lalu petakan tiap baris. [] jika sheet belum ada. */
function bacaSemua(ss, namaSheet, mapper) {
  var sheet = ss.getSheetByName(namaSheet);
  if (!sheet) return [];
  var rows = readRows(sheet);
  var out = [];
  for (var i = 0; i < rows.length; i++) out.push(mapper(rows[i]));
  return out;
}

/** Peta bantu untuk nama: {paketId->nama}, {username->{nama,kelasId}}, {kelasId->nama}. */
function bangunPeta(ss) {
  var petaPaket = {}, petaPengguna = {}, petaKelas = {};
  var rp = readRows(ss.getSheetByName(SHEET_PAKET));
  for (var i = 0; i < rp.length; i++) petaPaket[asString(rp[i][0])] = asString(rp[i][1]);
  var ru = readRows(ss.getSheetByName(SHEET_PENGGUNA));
  for (var j = 0; j < ru.length; j++) {
    petaPengguna[asString(ru[j][2])] = {
      nama: asString(ru[j][1]), kelasId: asString(ru[j][8])
    };
  }
  var rk = readRows(ss.getSheetByName(SHEET_KELAS));
  for (var k = 0; k < rk.length; k++) petaKelas[asString(rk[k][0])] = asString(rk[k][2]);
  return { paket: petaPaket, pengguna: petaPengguna, kelas: petaKelas };
}

// ============================================================
// ENTRY POINT
// ============================================================
function doGet(e) {
  try {
    return jsonResponse({
      success: true,
      data: { service: 'wwn-cbt-madrasah-80', version: APP_VERSION }
    });
  } catch (err) {
    return jsonResponse({ success: false, error: 'doGet: ' + err.message });
  }
}

function doPost(e) {
  // v1.1.0: kunci global di doPost DIHAPUS. Dulu lock.waitLock(10000) membuat
  // SEMUA request (termasuk baca) antre secara serial — fatal untuk ratusan
  // user bersamaan. Kini hanya aksi TULIS yang memakai kunci singkat
  // via denganKunci(); aksi baca berjalan paralel tanpa kunci.
  try {
    // Baca postData.contents TANPA mengasumsikan content-type
    // (penting untuk navigator.sendBeacon yang memakai text/plain).
    var payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var action = payload.action || '';
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    switch (action) {
      // ---- publik ----
      case 'ping':
        return jsonResponse({
          success: true,
          data: { version: APP_VERSION, waktu: sekarangISODateTime() }
        });

      case 'initDatabase': {
        var rInit = denganKunci(function () {
          initializeAllSheets(ss);
          return {
            success: true,
            message: '12 sheet database berhasil diinisialisasi.',
            data: { sheets: SEMUA_SHEET.slice() }
          };
        });
        return jsonResponse(rInit);
      }

      case 'login':
        return jsonResponse(denganKunci(function () { return actionLogin(ss, payload.username, payload.password); }));

      case 'logout': {
        var rOut = denganKunci(function () {
          hapusToken(ss, payload.token);
          return { success: true, message: 'Berhasil keluar.' };
        });
        return jsonResponse(rOut);
      }

      // ---- butuh login (semua peran) ----
      case 'getAllData':
        return denganAuth(ss, payload, 'siswa', function (user) {
          return actionGetAllData(ss, user);
        });

      // ---- master (admin) ----
      case 'saveJenjang':
        return denganAuth(ss, payload, 'admin', function () {
          return denganKunci(function () { return actionSaveJenjang(ss, payload); });
        });
      case 'deleteJenjang':
        return denganAuth(ss, payload, 'admin', function () {
          return denganKunci(function () { return actionDeleteJenjang(ss, payload); });
        });
      case 'saveMapel':
        return denganAuth(ss, payload, 'admin', function () {
          return denganKunci(function () { return actionSaveMapel(ss, payload); });
        });
      case 'deleteMapel':
        return denganAuth(ss, payload, 'admin', function () {
          return denganKunci(function () { return actionDeleteMapel(ss, payload); });
        });
      case 'importMapel':
        return denganAuth(ss, payload, 'admin', function () {
          return denganKunci(function () { return actionImportMapel(ss, payload); });
        });
      case 'saveKelas':
        return denganAuth(ss, payload, 'admin', function () {
          return denganKunci(function () { return actionSaveKelas(ss, payload); });
        });
      case 'deleteKelas':
        return denganAuth(ss, payload, 'admin', function () {
          return denganKunci(function () { return actionDeleteKelas(ss, payload); });
        });

      // ---- pengguna (admin) ----
      case 'savePengguna':
        return denganAuth(ss, payload, 'admin', function () {
          return denganKunci(function () { return actionSavePengguna(ss, payload); });
        });
      case 'deletePengguna':
        return denganAuth(ss, payload, 'admin', function (user) {
          return denganKunci(function () { return actionDeletePengguna(ss, user, payload); });
        });
      case 'resetPassword':
        return denganAuth(ss, payload, 'admin', function () {
          return denganKunci(function () { return actionResetPassword(ss, payload); });
        });
      case 'importSiswa':
        return denganAuth(ss, payload, 'admin', function () {
          return denganKunci(function () { return actionImportSiswa(ss, payload.rows); });
        });

      // ---- bank soal (guru/admin) ----
      case 'saveSoal':
        return denganAuth(ss, payload, 'guru', function (user) {
          return denganKunci(function () { return actionSaveSoal(ss, user, payload); });
        });
      case 'deleteSoal':
        return denganAuth(ss, payload, 'guru', function () {
          return denganKunci(function () { return actionDeleteSoal(ss, payload); });
        });
      case 'importSoal':
        return denganAuth(ss, payload, 'guru', function (user) {
          return denganKunci(function () { return actionImportSoal(ss, user, payload); });
        });
      case 'importSoalDariForm':
        return denganAuth(ss, payload, 'guru', function (user) {
          return denganKunci(function () { return actionImportSoalDariForm(ss, user, payload); });
        });

      // ---- paket (guru/admin) ----
      case 'savePaket':
        return denganAuth(ss, payload, 'guru', function (user) {
          return denganKunci(function () { return actionSavePaket(ss, user, payload); });
        });
      case 'deletePaket':
        return denganAuth(ss, payload, 'guru', function () {
          return denganKunci(function () { return actionDeletePaket(ss, payload); });
        });

      // ---- sesi ujian (semua peran login) ----
      case 'mulaiSesi':
        return denganAuth(ss, payload, 'siswa', function (user) {
          return denganKunci(function () { return actionMulaiSesi(ss, user, payload); });
        });
      case 'getSesi':
        return denganAuth(ss, payload, 'siswa', function (user) {
          return actionGetSesi(ss, user, payload);
        });
      case 'batalkanSesi':
        return denganAuth(ss, payload, 'siswa', function (user) {
          return denganKunci(function () { return actionBatalkanSesi(ss, user, payload); });
        });
      case 'catatPeringatan':
        return denganAuth(ss, payload, 'siswa', function (user) {
          return denganKunci(function () { return actionCatatPeringatan(ss, user, payload); });
        });
      case 'submitJawaban':
        return denganAuth(ss, payload, 'siswa', function (user) {
          return denganKunci(function () { return actionSubmitJawaban(ss, user, payload); });
        });
      case 'verifikasiToken':
        return denganAuth(ss, payload, 'siswa', function (user) {
          return actionVerifikasiToken(ss, user, payload);
        });
      case 'simpanJawaban':
        return denganAuth(ss, payload, 'siswa', function (user) {
          return denganKunci(function () { return actionSimpanJawaban(ss, user, payload); });
        });
      case 'getJawabanSesi':
        return denganAuth(ss, payload, 'siswa', function (user) {
          return actionGetJawabanSesi(ss, user, payload);
        });
      case 'nilaiEssay':
        return denganAuth(ss, payload, 'guru', function (user) {
          return denganKunci(function () { return actionNilaiEssay(ss, user, payload); });
        });
      case 'resetSesi':
        return denganAuth(ss, payload, 'guru', function (user) {
          return denganKunci(function () { return actionResetSesi(ss, user, payload); });
        });

      // ---- hasil & monitor ----
      case 'rekapHasil':
        return denganAuth(ss, payload, 'guru', function () {
          return actionRekapHasil(ss, payload);
        });
      case 'getHasilSiswa':
        return denganAuth(ss, payload, 'siswa', function (user) {
          return actionGetHasilSiswa(ss, user, payload);
        });
      case 'monitorSesi':
        return denganAuth(ss, payload, 'guru', function () {
          return actionMonitorSesi(ss, payload);
        });

      // ---- analisis nilai & notifikasi ----
      case 'getAnalisisSiswa':
        return denganAuth(ss, payload, 'siswa', function (user) {
          return actionGetAnalisisSiswa(ss, user, payload);
        });
      case 'getAnalisisKelas':
        return denganAuth(ss, payload, 'guru', function () {
          return actionGetAnalisisKelas(ss, payload);
        });
      case 'kirimNotifikasiProgres':
        return denganAuth(ss, payload, 'guru', function (user) {
          return denganKunci(function () { return actionKirimNotifikasiProgres(ss, user, payload); });
        });
      case 'getNotifikasi':
        return denganAuth(ss, payload, 'guru', function () {
          return actionGetNotifikasi(ss);
        });

      // ---- pengaturan & upload ----
      case 'savePengaturan':
        return denganAuth(ss, payload, 'admin', function () {
          return denganKunci(function () { return actionSavePengaturan(ss, payload); });
        });
      case 'uploadLogo':
        return denganAuth(ss, payload, 'admin', function () {
          return denganKunci(function () { return actionUploadLogo(ss, payload); });
        });
      case 'uploadGambarSoal':
        return denganAuth(ss, payload, 'guru', function () {
          return denganKunci(function () { return actionUploadGambarSoal(ss, payload); });
        });

      default:
        return jsonResponse({ success: false, message: 'Aksi tidak dikenal: ' + action });
    }
  } catch (err) {
    return jsonResponse({ success: false, error: 'doPost: ' + err.message });
  }
}

// ============================================================
// INISIALISASI DATABASE (publik, idempotent)
// ============================================================
function pastikanHeader(sheet, name) {
  var headers = HEADERS[name];
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
  } else {
    var existing = sheet.getRange(1, 1, 1, headers.length).getValues()[0].map(asString);
    var perlu = false;
    for (var i = 0; i < headers.length; i++) {
      if (existing[i] !== headers[i]) { perlu = true; break; }
    }
    if (perlu) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  try { sheet.setFrozenRows(1); } catch (e) {}
}

function seedAkun(ss, id, nama, username, password, peran) {
  var sheet = ss.getSheetByName(SHEET_PENGGUNA);
  if (findRowNum(sheet, 3, username) >= 0) return; // sudah ada -> idempotent
  var salt = Utilities.getUuid();
  sheet.appendRow([id, nama, username, hashPassword(password, salt), salt,
    peran, '', '', '', '', '', 1, '']);
}

function seedJenjang(ss, id, nama) {
  var sheet = ss.getSheetByName(SHEET_JENJANG);
  if (findRowNum(sheet, 2, nama) >= 0) return; // sudah ada -> idempotent
  if (findRowNum(sheet, 1, id) >= 0) return;
  sheet.appendRow([id, nama, sekarangISODateTime()]);
}

function seedKelas(ss, id, jenjangId, nama) {
  var sheet = ss.getSheetByName(SHEET_KELAS);
  var rows = readRows(sheet);
  for (var i = 0; i < rows.length; i++) {
    if (asString(rows[i][1]) === jenjangId && asString(rows[i][2]) === nama) return;
  }
  if (findRowNum(sheet, 1, id) >= 0) return;
  sheet.appendRow([id, jenjangId, nama, sekarangISODateTime()]);
}

function initializeAllSheets(ss) {
  for (var i = 0; i < SEMUA_SHEET.length; i++) {
    var sheet = getOrCreateSheet(ss, SEMUA_SHEET[i]);
    pastikanHeader(sheet, SEMUA_SHEET[i]);
  }

  // Seed pengaturan bawaan (hanya kunci yang belum ada)
  var ps = ss.getSheetByName(SHEET_PENGATURAN);
  for (var j = 0; j < DEFAULT_PENGATURAN.length; j++) {
    if (findRowNum(ps, 1, DEFAULT_PENGATURAN[j][0]) < 0) {
      ps.appendRow([DEFAULT_PENGATURAN[j][0], DEFAULT_PENGATURAN[j][1]]);
    }
  }

  // Seed jenjang: SMK, SMA, MA (v1.2.0 — sebelumnya MTs/SMP & MA/SMA/SMK).
  seedJenjang(ss, 'JJG-SMK', 'SMK');
  seedJenjang(ss, 'JJG-SMA', 'SMA');
  seedJenjang(ss, 'JJG-MA', 'MA');

  // Seed 6 kelas awal (7A, 7B, 8A, 8B, 9A, 9B) di bawah jenjang SMK — admin
  // bebas mengubah/menghapusnya di Kelola Data. Mapel TIDAK di-seed
  // (admin mengisi manual lewat Kelola Data / impor Excel).
  var kelasSeed = ['7A', '7B', '8A', '8B', '9A', '9B'];
  for (var kk = 0; kk < kelasSeed.length; kk++) {
    seedKelas(ss, 'KLS-' + kelasSeed[kk], 'JJG-SMK', kelasSeed[kk]);
  }

  // Seed 2 akun bawaan (hanya jika username belum ada)
  seedAkun(ss, 'USER-ADMIN', 'Administrator', 'admin', 'admin123', 'admin');
  seedAkun(ss, 'USER-GURU', 'Guru', 'guru', 'guru123', 'guru');
}

/** Jalankan manual dari editor untuk memberi izin Google Drive. */
function authorizeDriveAccess() {
  DriveApp.getRootFolder();
  SpreadsheetApp.getActiveSpreadsheet();
  Logger.log('Otorisasi Drive OK.');
}

/** Jalankan manual dari editor untuk memberi izin Google Forms. */
function authorizeFormsAccess() {
  try { FormApp.getActiveForm(); } catch (e) {}
  Logger.log('Otorisasi Forms OK. (Abaikan error form aktif — izin sudah diminta.)');
}

// ============================================================
// AUTH: LOGIN
// ============================================================
function actionLogin(ss, username, password) {
  try {
    username = asString(username);
    password = asString(password);
    if (!username || !password) {
      return { success: false, message: 'Username dan kata sandi wajib diisi.' };
    }
    var sheet = ss.getSheetByName(SHEET_PENGGUNA);
    if (!sheet) return { success: false, message: 'Database belum diinisialisasi.' };
    var rows = readRows(sheet);
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (asString(r[2]).toLowerCase() !== username.toLowerCase()) continue;
      // Tolak jika akun nonaktif — pesan sama (jangan bocorkan alasannya)
      if (asString(r[11]) !== '1') {
        return { success: false, message: 'Username atau kata sandi salah' };
      }
      var cocok = hashPassword(password, asString(r[4])) === asString(r[3]);
      if (!cocok) {
        return { success: false, message: 'Username atau kata sandi salah' };
      }
      var token = Utilities.getUuid();
      sheet.getRange(i + 2, 10).setValue(token);
      sheet.getRange(i + 2, 11).setValue(Date.now() + TOKEN_MASA_BERLAKU_MS);
      return {
        success: true,
        message: 'Login berhasil. Selamat datang, ' + asString(r[1]) + '!',
        data: {
          token: token,
          nama: asString(r[1]),
          username: asString(r[2]),
          peran: asString(r[5]),
          nis: asString(r[6]),
          jenjangId: asString(r[7]),
          kelasId: asString(r[8])
        }
      };
    }
    return { success: false, message: 'Username atau kata sandi salah' };
  } catch (err) {
    return { success: false, error: 'login: ' + err.message };
  }
}

// ============================================================
// GET ALL DATA (butuh login; filter menurut peran)
// ============================================================
function actionGetAllData(ss, user) {
  try {
    var peran = user.peran;
    var peta = bangunPeta(ss);
    var now = sekarangISODateTime();
    var settingsAll = getSettings(ss);

    // --- pengguna ---
    var pengguna;
    if (peran === 'admin') {
      pengguna = bacaSemua(ss, SHEET_PENGGUNA, penggunaKePublik);
    } else if (peran === 'guru') {
      var semua = bacaSemua(ss, SHEET_PENGGUNA, penggunaKePublik);
      pengguna = [];
      for (var i = 0; i < semua.length; i++) {
        if (semua[i].peran === 'guru' || semua[i].peran === 'siswa') pengguna.push(semua[i]);
      }
    } else {
      pengguna = [];
    }

    // --- bankSoal: siswa TIDAK PERNAH menerima kunci/pembahasan ---
    var bankSoal = peran === 'siswa'
      ? []
      : bacaSemua(ss, SHEET_BANKSOAL, bankSoalKeObjek);

    // --- paket ---
    var semuaPaket = readRows(ss.getSheetByName(SHEET_PAKET));
    var paket = [];
    for (var j = 0; j < semuaPaket.length; j++) {
      var rp = semuaPaket[j];
      var untukSiswa = peran === 'siswa';
      if (untukSiswa) {
        if (asInt(rp[15], 1) !== 1) continue;                       // aktif=1
        var mulai = selKeString(rp[9]);
        var selesai = selKeString(rp[10]);
        if (!(mulai <= now && now <= selesai)) continue;            // jendela waktu
        if (asString(rp[2]) !== user.jenjangId) continue;           // jenjang cocok
        var kelasIds = parseJSONLunak(rp[4], []);
        if (!Array.isArray(kelasIds)) kelasIds = [];
        if (kelasIds.length > 0 && kelasIds.indexOf(user.kelasId) < 0) continue;
      }
      paket.push(paketKeObjek(rp, untukSiswa));
    }

    // --- sesi ---
    var semuaSesi = readRows(ss.getSheetByName(SHEET_SESI));
    var sesi = [];
    for (var k = 0; k < semuaSesi.length; k++) {
      if (peran === 'siswa' && asString(semuaSesi[k][2]) !== user.username) continue;
      sesi.push(sesiKeObjek(semuaSesi[k], peta.paket, peta.pengguna, peta.kelas));
    }

    // --- hasil ---
    var semuaHasil = readRows(ss.getSheetByName(SHEET_HASIL));
    var hasil = [];
    for (var m = 0; m < semuaHasil.length; m++) {
      if (peran === 'siswa' && asString(semuaHasil[m][3]) !== user.username) continue;
      hasil.push(hasilKeObjek(semuaHasil[m], peta.paket, peta.pengguna, peta.kelas, settingsAll.kkm));
    }

    return {
      success: true,
      data: {
        pengaturan: settingsAll,
        jenjang: bacaSemua(ss, SHEET_JENJANG, jenjangKeObjek),
        mapel: bacaSemua(ss, SHEET_MAPEL, mapelKeObjek),
        kelas: bacaSemua(ss, SHEET_KELAS, kelasKeObjek),
        pengguna: pengguna,
        bankSoal: bankSoal,
        paket: paket,
        sesi: sesi,
        hasil: hasil
      }
    };
  } catch (err) {
    return { success: false, error: 'getAllData: ' + err.message };
  }
}

// ============================================================
// MASTER: JENJANG / MAPEL / KELAS (admin)
// ============================================================
function actionSaveJenjang(ss, p) {
  var nama = asString(p.nama);
  if (!nama) return { success: false, message: 'Nama jenjang wajib diisi.' };
  var sheet = ss.getSheetByName(SHEET_JENJANG);
  var id = asString(p.id);
  if (id) {
    var rowNum = findRowNum(sheet, 1, id);
    if (rowNum < 0) return { success: false, message: 'Jenjang tidak ditemukan.' };
    sheet.getRange(rowNum, 2).setValue(nama);
    return { success: true, message: 'Jenjang berhasil diubah.', data: { id: id } };
  }
  var baru = Utilities.getUuid();
  sheet.appendRow([baru, nama, sekarangISODateTime()]);
  return { success: true, message: 'Jenjang berhasil disimpan.', data: { id: baru } };
}

function actionDeleteJenjang(ss, p) {
  var id = asString(p.id);
  if (!id) return { success: false, message: 'ID jenjang wajib diisi.' };
  var sheet = ss.getSheetByName(SHEET_JENJANG);
  if (findRowNum(sheet, 1, id) < 0) {
    return { success: false, message: 'Jenjang tidak ditemukan.' };
  }
  var pakai = [];
  if (hitungPakai(ss.getSheetByName(SHEET_MAPEL), 2, id) > 0) pakai.push('mapel');
  if (hitungPakai(ss.getSheetByName(SHEET_KELAS), 2, id) > 0) pakai.push('kelas');
  if (hitungPakai(ss.getSheetByName(SHEET_BANKSOAL), 2, id) > 0) pakai.push('bank soal');
  if (hitungPakai(ss.getSheetByName(SHEET_PAKET), 3, id) > 0) pakai.push('paket');
  if (pakai.length > 0) {
    return { success: false, message: 'Jenjang tidak dapat dihapus karena masih dipakai di: ' + pakai.join(', ') + '.' };
  }
  sheet.deleteRow(findRowNum(sheet, 1, id));
  return { success: true, message: 'Jenjang berhasil dihapus.' };
}

function actionSaveMapel(ss, p) {
  var nama = asString(p.nama);
  var jenjangId = asString(p.jenjangId);
  if (!nama) return { success: false, message: 'Nama mapel wajib diisi.' };
  if (!jenjangId) return { success: false, message: 'Jenjang wajib dipilih.' };
  if (findRowNum(ss.getSheetByName(SHEET_JENJANG), 1, jenjangId) < 0) {
    return { success: false, message: 'Jenjang tidak ditemukan.' };
  }
  var sheet = ss.getSheetByName(SHEET_MAPEL);
  var id = asString(p.id);
  if (id) {
    var rowNum = findRowNum(sheet, 1, id);
    if (rowNum < 0) return { success: false, message: 'Mapel tidak ditemukan.' };
    sheet.getRange(rowNum, 2, 1, 2).setValues([[jenjangId, nama]]);
    return { success: true, message: 'Mapel berhasil diubah.', data: { id: id } };
  }
  var baru = Utilities.getUuid();
  sheet.appendRow([baru, jenjangId, nama, sekarangISODateTime()]);
  return { success: true, message: 'Mapel berhasil disimpan.', data: { id: baru } };
}

/**
 * Impor mapel batch (v1.2.1). Pola yang sama seperti importSiswa: sheet dibaca
 * SEKALI di awal, baris baru ditulis dengan SATU setValues. Idempotent: mapel
 * dengan (jenjangId, nama) sama — abaikan huruf besar/kecil & spasi berlebih —
 * dilewati (dihitung `dilewati`), sehingga impor yang terputus di tengah jalan
 * aman diulang tanpa menggandakan data. Menggantikan loop saveMapel per baris
 * di frontend yang rawan "Failed to fetch" saat throttle Google.
 */
function actionImportMapel(ss, p) {
  var hasil = { imported: 0, dilewati: 0, errors: [] };
  try {
    var rows = p.rows;
    if (!Array.isArray(rows) || rows.length === 0) {
      return { success: false, message: 'Data mapel kosong.' };
    }
    var jenjangRows = readRows(ss.getSheetByName(SHEET_JENJANG));
    var jenjangAda = {};
    for (var j = 0; j < jenjangRows.length; j++) jenjangAda[asString(jenjangRows[j][0])] = true;
    var mapelRows = readRows(ss.getSheetByName(SHEET_MAPEL));
    var sudahAda = {};
    for (var m = 0; m < mapelRows.length; m++) {
      sudahAda[asString(mapelRows[m][1]) + '\n' + normalisasiTeksKunci(asString(mapelRows[m][2]))] = true;
    }
    var sheet = ss.getSheetByName(SHEET_MAPEL);
    var antre = [];
    var now = sekarangISODateTime();
    for (var i = 0; i < rows.length; i++) {
      var baris = i + 1;
      var r = rows[i] || {};
      var nama = asString(r.nama).replace(/\s+/g, ' ').trim();
      var jenjangId = asString(r.jenjangId);
      if (!nama) { hasil.errors.push({ baris: baris, pesan: 'Nama mapel kosong.' }); continue; }
      if (!jenjangId || !jenjangAda[jenjangId]) { hasil.errors.push({ baris: baris, pesan: 'Jenjang tidak ditemukan.' }); continue; }
      var kunci = jenjangId + '\n' + normalisasiTeksKunci(nama);
      if (sudahAda[kunci]) { hasil.dilewati++; continue; }
      sudahAda[kunci] = true;
      antre.push([Utilities.getUuid(), jenjangId, nama, now]);
      hasil.imported++;
    }
    if (antre.length > 0) {
      sheet.getRange(sheet.getLastRow() + 1, 1, antre.length, 4).setValues(antre);
    }
    return {
      success: true,
      message: 'Impor mapel selesai: ' + hasil.imported + ' masuk, ' + hasil.dilewati + ' dilewati (duplikat), ' + hasil.errors.length + ' error.',
      data: hasil
    };
  } catch (err) {
    return { success: false, error: 'importMapel: ' + err.message };
  }
}

function actionDeleteMapel(ss, p) {
  var id = asString(p.id);
  if (!id) return { success: false, message: 'ID mapel wajib diisi.' };
  var sheet = ss.getSheetByName(SHEET_MAPEL);
  if (findRowNum(sheet, 1, id) < 0) {
    return { success: false, message: 'Mapel tidak ditemukan.' };
  }
  var pakai = [];
  if (hitungPakai(ss.getSheetByName(SHEET_BANKSOAL), 3, id) > 0) pakai.push('bank soal');
  if (hitungPakai(ss.getSheetByName(SHEET_PAKET), 4, id) > 0) pakai.push('paket');
  if (pakai.length > 0) {
    return { success: false, message: 'Mapel tidak dapat dihapus karena masih dipakai di: ' + pakai.join(', ') + '.' };
  }
  sheet.deleteRow(findRowNum(sheet, 1, id));
  return { success: true, message: 'Mapel berhasil dihapus.' };
}

function actionSaveKelas(ss, p) {
  var nama = asString(p.nama);
  var jenjangId = asString(p.jenjangId);
  if (!nama) return { success: false, message: 'Nama kelas wajib diisi.' };
  if (!jenjangId) return { success: false, message: 'Jenjang wajib dipilih.' };
  if (findRowNum(ss.getSheetByName(SHEET_JENJANG), 1, jenjangId) < 0) {
    return { success: false, message: 'Jenjang tidak ditemukan.' };
  }
  // Nama kelas unik dalam satu jenjang (hindari duplikat seed vs buat baru;
  // impor siswa mencocokkan kelas by nama).
  var rowsKelas = readRows(ss.getSheetByName(SHEET_KELAS));
  for (var du = 0; du < rowsKelas.length; du++) {
    if (asString(rowsKelas[du][1]) === jenjangId &&
        asString(rowsKelas[du][2]).toLowerCase() === nama.toLowerCase() &&
        asString(rowsKelas[du][0]) !== asString(p.id)) {
      return { success: false, message: 'Kelas "' + nama + '" sudah ada pada jenjang ini.' };
    }
  }
  var sheet = ss.getSheetByName(SHEET_KELAS);
  var id = asString(p.id);
  if (id) {
    var rowNum = findRowNum(sheet, 1, id);
    if (rowNum < 0) return { success: false, message: 'Kelas tidak ditemukan.' };
    sheet.getRange(rowNum, 2, 1, 2).setValues([[jenjangId, nama]]);
    return { success: true, message: 'Kelas berhasil diubah.', data: { id: id } };
  }
  var baru = Utilities.getUuid();
  sheet.appendRow([baru, jenjangId, nama, sekarangISODateTime()]);
  return { success: true, message: 'Kelas berhasil disimpan.', data: { id: baru } };
}

function actionDeleteKelas(ss, p) {
  var id = asString(p.id);
  if (!id) return { success: false, message: 'ID kelas wajib diisi.' };
  var sheet = ss.getSheetByName(SHEET_KELAS);
  if (findRowNum(sheet, 1, id) < 0) {
    return { success: false, message: 'Kelas tidak ditemukan.' };
  }
  var pakai = [];
  if (hitungPakai(ss.getSheetByName(SHEET_PENGGUNA), 9, id) > 0) pakai.push('pengguna');
  if (paketPakaiKelas(ss, id)) pakai.push('paket');
  if (pakai.length > 0) {
    return { success: false, message: 'Kelas tidak dapat dihapus karena masih dipakai di: ' + pakai.join(', ') + '.' };
  }
  sheet.deleteRow(findRowNum(sheet, 1, id));
  return { success: true, message: 'Kelas berhasil dihapus.' };
}

/** true jika ada Paket yang KelasIDsJSON-nya memuat kelasId. */
function paketPakaiKelas(ss, kelasId) {
  var rows = readRows(ss.getSheetByName(SHEET_PAKET));
  for (var i = 0; i < rows.length; i++) {
    var ids = parseJSONLunak(rows[i][4], []);
    if (Array.isArray(ids) && ids.indexOf(kelasId) >= 0) return true;
  }
  return false;
}

// ============================================================
// PENGGUNA (admin)
// ============================================================
function cariPenggunaByUsername(ss, username, kecualiId) {
  var rows = readRows(ss.getSheetByName(SHEET_PENGGUNA));
  var cari = asString(username).toLowerCase();
  for (var i = 0; i < rows.length; i++) {
    if (asString(rows[i][2]).toLowerCase() === cari &&
        asString(rows[i][0]) !== asString(kecualiId)) {
      return { rowNum: i + 2, row: rows[i] };
    }
  }
  return null;
}

function actionSavePengguna(ss, p) {
  try {
    var nama = asString(p.nama);
    var username = asString(p.username);
    var peran = asString(p.peran).toLowerCase();
    var password = p.password === undefined || p.password === null ? '' : String(p.password);
    var nis = asString(p.nis);
    var jenjangId = asString(p.jenjangId);
    var kelasId = asString(p.kelasId);
    var noHP = asString(p.noHP);
    var id = asString(p.id);

    if (!nama) return { success: false, message: 'Nama wajib diisi.' };
    if (!username) return { success: false, message: 'Username wajib diisi.' };
    if (PERAN_VALID.indexOf(peran) < 0) {
      return { success: false, message: 'Peran tidak valid (admin/guru/siswa).' };
    }
    if (cariPenggunaByUsername(ss, username, id)) {
      return { success: false, message: 'Username sudah dipakai.' };
    }

    if (peran === 'siswa') {
      if (!nis) return { success: false, message: 'NIS wajib diisi untuk peran siswa.' };
      if (!jenjangId) return { success: false, message: 'Jenjang wajib dipilih untuk siswa.' };
      if (!kelasId) return { success: false, message: 'Kelas wajib dipilih untuk siswa.' };
      if (findRowNum(ss.getSheetByName(SHEET_JENJANG), 1, jenjangId) < 0) {
        return { success: false, message: 'Jenjang tidak ditemukan.' };
      }
      var kelasRow = cariBarisById(ss, SHEET_KELAS, kelasId);
      if (!kelasRow) return { success: false, message: 'Kelas tidak ditemukan.' };
      if (asString(kelasRow[1]) !== jenjangId) {
        return { success: false, message: 'Kelas tidak berada pada jenjang yang dipilih.' };
      }
      if (!password && !id) password = nis; // default password siswa = NIS
    }

    var sheet = ss.getSheetByName(SHEET_PENGGUNA);
    if (id) {
      // --- update ---
      var rowNum = findRowNum(sheet, 1, id);
      if (rowNum < 0) return { success: false, message: 'Pengguna tidak ditemukan.' };
      var lama = sheet.getRange(rowNum, 1, 1, sheet.getLastColumn()).getValues()[0];
      var hashLama = asString(lama[3]);
      var saltLama = asString(lama[4]);
      var aktifLama = asInt(lama[11], 1);
      var aktif = (p.aktif === undefined || p.aktif === null) ? aktifLama : asFlag(p.aktif, aktifLama);
      var hashBaru = hashLama, saltBaru = saltLama;
      if (password) {
        saltBaru = Utilities.getUuid();
        hashBaru = hashPassword(password, saltBaru);
      }
      sheet.getRange(rowNum, 2, 1, 12).setValues([[
        nama, username, hashBaru, saltBaru, peran, nis, jenjangId, kelasId,
        asString(lama[9]), asString(lama[10]), aktif, noHP
      ]]);
      return { success: true, message: 'Pengguna berhasil diubah.', data: { id: id } };
    }

    // --- tambah ---
    if (!password) {
      // peran siswa sudah dapat default = NIS di atas; admin/guru wajib isi
      return { success: false, message: 'Password wajib diisi untuk peran admin/guru.' };
    }
    var salt = Utilities.getUuid();
    var baru = Utilities.getUuid();
    sheet.appendRow([baru, nama, username, hashPassword(password, salt), salt,
      peran, nis, jenjangId, kelasId, '', '', 1, noHP]);
    return { success: true, message: 'Pengguna berhasil disimpan.', data: { id: baru } };
  } catch (err) {
    return { success: false, error: 'savePengguna: ' + err.message };
  }
}

function actionDeletePengguna(ss, user, p) {
  try {
    var id = asString(p.id);
    if (!id) return { success: false, message: 'ID pengguna wajib diisi.' };
    if (id === user.id) {
      return { success: false, message: 'Tidak dapat menghapus akun sendiri.' };
    }
    var sheet = ss.getSheetByName(SHEET_PENGGUNA);
    var rowNum = findRowNum(sheet, 1, id);
    if (rowNum < 0) return { success: false, message: 'Pengguna tidak ditemukan.' };
    var target = sheet.getRange(rowNum, 1, 1, sheet.getLastColumn()).getValues()[0];
    if (asString(target[5]) === 'admin') {
      var rows = readRows(sheet);
      var jumlahAdmin = 0;
      for (var i = 0; i < rows.length; i++) {
        if (asString(rows[i][5]) === 'admin' && asString(rows[i][11]) === '1') jumlahAdmin++;
      }
      if (jumlahAdmin <= 1) {
        return { success: false, message: 'Tidak dapat menghapus admin terakhir.' };
      }
    }
    sheet.deleteRow(rowNum);
    return { success: true, message: 'Pengguna berhasil dihapus.' };
  } catch (err) {
    return { success: false, error: 'deletePengguna: ' + err.message };
  }
}

function actionResetPassword(ss, p) {
  try {
    var id = asString(p.id);
    var passwordBaru = p.passwordBaru === undefined || p.passwordBaru === null
      ? '' : String(p.passwordBaru);
    if (!id) return { success: false, message: 'ID pengguna wajib diisi.' };
    if (!passwordBaru) {
      return { success: false, message: 'Kata sandi baru wajib diisi.' };
    }
    var sheet = ss.getSheetByName(SHEET_PENGGUNA);
    var rowNum = findRowNum(sheet, 1, id);
    if (rowNum < 0) return { success: false, message: 'Pengguna tidak ditemukan.' };
    var salt = Utilities.getUuid();
    sheet.getRange(rowNum, 4, 1, 2).setValues([[hashPassword(passwordBaru, salt), salt]]);
    // Paksa login ulang: kosongkan token
    sheet.getRange(rowNum, 10, 1, 2).setValues([['', '']]);
    return { success: true, message: 'Kata sandi berhasil direset.', data: { id: id } };
  } catch (err) {
    return { success: false, error: 'resetPassword: ' + err.message };
  }
}

/**
 * Cari kelas berdasarkan NAMA (case-insensitive). Jika namaJenjang diberikan,
 * cari pada jenjang itu; jika tidak, ambil kelas pertama yang namanya cocok.
 * Mengembalikan {id, jenjangId, nama} atau null.
 */
function cariKelasByNama(ss, namaKelas, namaJenjang) {
  var cari = asString(namaKelas).toLowerCase();
  var petaJenjang = {}; // nama lower -> id
  if (namaJenjang) {
    var rj = readRows(ss.getSheetByName(SHEET_JENJANG));
    for (var j = 0; j < rj.length; j++) {
      petaJenjang[asString(rj[j][1]).toLowerCase()] = asString(rj[j][0]);
    }
  }
  var rk = readRows(ss.getSheetByName(SHEET_KELAS));
  for (var i = 0; i < rk.length; i++) {
    if (asString(rk[i][2]).toLowerCase() !== cari) continue;
    var jid = asString(rk[i][1]);
    if (namaJenjang) {
      var jidCari = petaJenjang[asString(namaJenjang).toLowerCase()];
      if (!jidCari || jid !== jidCari) continue;
    }
    return { id: asString(rk[i][0]), jenjangId: jid, nama: asString(rk[i][2]) };
  }
  return null;
}

function actionImportSiswa(ss, rows) {
  var hasil = { imported: 0, updated: 0, errors: [] };
  try {
    if (!Array.isArray(rows) || rows.length === 0) {
      return { success: false, message: 'Data baris kosong.' };
    }
    // v1.1.4: baca sheet SEKALI di awal + tulis batch. Versi lama memanggil
    // readRows() di setiap baris (O(n^2)) sehingga 1000 siswa butuh waktu
    // bermenit-menit dan request putus ("Failed to fetch").
    var sheet = ss.getSheetByName(SHEET_PENGGUNA);
    var semuaRows = readRows(sheet);
    var petaNis = {};       // nisLower -> {rowNum, row}
    var petaUsername = {};  // usernameLower -> id
    for (var d = 0; d < semuaRows.length; d++) {
      var nisL = asString(semuaRows[d][6]).toLowerCase();
      if (nisL) petaNis[nisL] = { rowNum: d + 2, row: semuaRows[d] };
      var unL = asString(semuaRows[d][2]).toLowerCase();
      if (unL) petaUsername[unL] = asString(semuaRows[d][0]);
    }
    // Peta kelas: "namakelas" dan "namakelas||namajenjang" (lowercase, trim)
    var petaKelas = {};
    var jenRows = readRows(ss.getSheetByName(SHEET_JENJANG));
    var petaJenjang = {};
    for (var j = 0; j < jenRows.length; j++) {
      petaJenjang[asString(jenRows[j][0])] = asString(jenRows[j][1]);
    }
    var kelasRows = readRows(ss.getSheetByName(SHEET_KELAS));
    for (var k = 0; k < kelasRows.length; k++) {
      var kNama = asString(kelasRows[k][2]).toLowerCase().trim();
      var kJenId = asString(kelasRows[k][1]);
      var kJenNama = asString(petaJenjang[kJenId]).toLowerCase().trim();
      var infoK = { id: asString(kelasRows[k][0]), jenjangId: kJenId };
      if (kNama && !petaKelas[kNama]) petaKelas[kNama] = infoK;
      if (kNama && kJenNama && !petaKelas[kNama + '||' + kJenNama]) {
        petaKelas[kNama + '||' + kJenNama] = infoK;
      }
    }

    var antreBaru = []; // matrix 13 kolom -> SATU setValues di akhir
    for (var i = 0; i < rows.length; i++) {
      var baris = i + 1;
      var nama = asString(rows[i] && rows[i].nama);
      var nis = asString(rows[i] && rows[i].nis);
      var namaKelas = asString(rows[i] && rows[i].kelas);
      var namaJenjang = asString(rows[i] && rows[i].jenjang);
      var username = asString(rows[i] && rows[i].username);
      var password = rows[i] && rows[i].password !== undefined && rows[i].password !== null
        ? String(rows[i].password) : '';
      // Kolom opsional: 'noHP' (frontend) / 'NoHP' / 'No HP' (header xlsx)
      var ri = rows[i] || {};
      var noHP = asString(
        ri.noHP !== undefined && ri.noHP !== null ? ri.noHP :
        (ri['NoHP'] !== undefined && ri['NoHP'] !== null ? ri['NoHP'] :
          (ri['No HP'] !== undefined && ri['No HP'] !== null ? ri['No HP'] : ''))
      );
      if (!nama) { hasil.errors.push({ baris: baris, pesan: 'Nama wajib diisi.' }); continue; }
      if (!nis) { hasil.errors.push({ baris: baris, pesan: 'NIS wajib diisi.' }); continue; }
      if (!namaKelas) { hasil.errors.push({ baris: baris, pesan: 'Kelas wajib diisi.' }); continue; }

      var kunciK = namaKelas.toLowerCase().trim();
      var kunciKJ = kunciK + '||' + namaJenjang.toLowerCase().trim();
      var kelas = petaKelas[kunciKJ] || petaKelas[kunciK];
      if (!kelas) {
        hasil.errors.push({ baris: baris, pesan: 'Kelas "' + namaKelas + '" tidak ditemukan.' });
        continue;
      }

      var usernameAkhir = username || nis;
      var nisKey = nis.toLowerCase();
      var unKey = usernameAkhir.toLowerCase();
      var adaNis = petaNis[nisKey] || null;
      var idPemilikUsername = petaUsername[unKey];

      if (adaNis) {
        // Duplikat NIS -> UPDATE (nama/kelas/akun)
        if (idPemilikUsername && idPemilikUsername !== asString(adaNis.row[0])) {
          hasil.errors.push({ baris: baris, pesan: 'Username "' + usernameAkhir + '" sudah dipakai pengguna lain.' });
          continue;
        }
        if (password) {
          var saltU = Utilities.getUuid();
          var hashU = hashPassword(password, saltU);
        }
        if (adaNis.rowNum > 0) {
          // Baris sudah ada di sheet -> update langsung
          var rn = adaNis.rowNum;
          sheet.getRange(rn, 2, 1, 2).setValues([[nama, usernameAkhir]]);
          sheet.getRange(rn, 7, 1, 3).setValues([[nis, kelas.jenjangId, kelas.id]]);
          if (noHP) sheet.getRange(rn, 13).setValue(noHP); // hanya timpa bila diisi
          if (password) sheet.getRange(rn, 4, 1, 2).setValues([[hashU, saltU]]);
        } else {
          // Masih antre di batch ini -> update matrix-nya saja
          var br = antreBaru[adaNis.antreIdx];
          br[1] = nama; br[2] = usernameAkhir;
          br[7] = nis; br[8] = kelas.jenjangId; br[9] = kelas.id;
          if (noHP) br[12] = noHP;
          if (password) { br[3] = hashU; br[4] = saltU; }
        }
        petaUsername[unKey] = asString(adaNis.row[0]);
        hasil.updated++;
      } else {
        if (idPemilikUsername) {
          hasil.errors.push({ baris: baris, pesan: 'Username "' + usernameAkhir + '" sudah dipakai.' });
          continue;
        }
        var salt = Utilities.getUuid();
        var passAkhir = password || nis;
        var idBaru = Utilities.getUuid();
        var idxBaru = antreBaru.length;
        antreBaru.push([idBaru, nama, usernameAkhir,
          hashPassword(passAkhir, salt), salt, 'siswa',
          nis, kelas.jenjangId, kelas.id, '', '', 1, noHP]);
        petaNis[nisKey] = { rowNum: -1, antreIdx: idxBaru, row: [idBaru] };
        petaUsername[unKey] = idBaru;
        hasil.imported++;
      }
    }
    // Tulis batch SEKALIGUS (jauh lebih cepat dari 1000x appendRow)
    if (antreBaru.length > 0) {
      sheet.getRange(sheet.getLastRow() + 1, 1, antreBaru.length, 13).setValues(antreBaru);
    }
    return {
      success: true,
      message: 'Impor selesai: ' + hasil.imported + ' baru, ' + hasil.updated +
        ' diperbarui, ' + hasil.errors.length + ' gagal.',
      data: hasil
    };
  } catch (err) {
    return { success: false, error: 'importSiswa: ' + err.message };
  }
}

// ============================================================
// BANK SOAL (guru/admin)
// ============================================================
/**
 * Validasi satu butir soal. Mengembalikan {ok:true, data:{...}} atau
 * {ok:false, message}. data berisi field yang sudah dibersihkan.
 */
function validasiSoal(ss, p) {
  var jenjangId = asString(p.jenjangId);
  var mapelId = asString(p.mapelId);
  var soal = asString(p.soal);
  var jenis = asString(p.jenis) || 'pg';
  if (JENIS_SOAL_VALID.indexOf(jenis) < 0) {
    return { ok: false, message: 'Jenis soal tidak valid (pg/pgk/bs/jodoh/isian/essay).' };
  }
  var bobot = p.bobot === undefined || p.bobot === null || p.bobot === ''
    ? 1 : asInt(p.bobot, -1);
  var pembahasan = asString(p.pembahasan);
  var gambarUrl = asString(p.gambarUrl);
  var tingkat = asString(p.tingkat) || 'Sedang';
  if (TINGKAT_VALID.indexOf(tingkat) < 0) {
    return { ok: false, message: 'Tingkat kesulitan tidak valid (Mudah/Sedang/Sulit).' };
  }
  var kelasId = asString(p.kelasId);

  if (!jenjangId) return { ok: false, message: 'Jenjang wajib dipilih.' };
  if (!mapelId) return { ok: false, message: 'Mapel wajib dipilih.' };
  if (findRowNum(ss.getSheetByName(SHEET_JENJANG), 1, jenjangId) < 0) {
    return { ok: false, message: 'Jenjang tidak ditemukan.' };
  }
  if (findRowNum(ss.getSheetByName(SHEET_MAPEL), 1, mapelId) < 0) {
    return { ok: false, message: 'Mapel tidak ditemukan.' };
  }
  if (kelasId && findRowNum(ss.getSheetByName(SHEET_KELAS), 1, kelasId) < 0) {
    return { ok: false, message: 'Kelas tidak ditemukan.' };
  }
  if (!soal) return { ok: false, message: 'Teks soal wajib diisi.' };
  if (bobot < 1) return { ok: false, message: 'Bobot harus bilangan bulat >= 1.' };

  // Opsi dari array `opsi` (diutamakan) atau opsiA..opsiE (legacy).
  var opsiMentah = [asString(p.opsiA), asString(p.opsiB), asString(p.opsiC),
    asString(p.opsiD), asString(p.opsiE)];
  var opsiInput = [];
  if (Array.isArray(p.opsi)) {
    for (var oi = 0; oi < p.opsi.length; oi++) {
      if (asString(p.opsi[oi])) opsiInput.push(asString(p.opsi[oi]));
    }
  } else {
    for (var ol = 0; ol < opsiMentah.length; ol++) {
      if (opsiMentah[ol]) opsiInput.push(opsiMentah[ol]);
    }
  }

  var opsiA = '', opsiB = '', opsiC = '', opsiD = '', opsiE = '';
  var kunciTampil = '', opsiJSON = '', kunciJSON = '';

  if (jenis === 'pg') {
    if (!Array.isArray(p.opsi)) {
      var namaOpsi = ['A', 'B', 'C', 'D'];
      for (var o2 = 0; o2 < 4; o2++) {
        if (!opsiMentah[o2]) {
          return { ok: false, message: 'Opsi ' + namaOpsi[o2] + ' wajib diisi.' };
        }
      }
    }
    if (opsiInput.length < 4) {
      return { ok: false, message: 'Pilihan ganda membutuhkan minimal 4 opsi (A-D).' };
    }
    var kunciPg = asString(p.kunci).toUpperCase();
    if (KUNCI_VALID.indexOf(kunciPg) < 0) {
      return { ok: false, message: 'Kunci tidak valid (A-E).' };
    }
    var idxKunci = KUNCI_VALID.indexOf(kunciPg);
    if (!opsiInput[idxKunci]) {
      return { ok: false, message: 'Kunci ' + kunciPg + ' menunjuk ke opsi yang kosong.' };
    }
    opsiA = opsiInput[0] || ''; opsiB = opsiInput[1] || '';
    opsiC = opsiInput[2] || ''; opsiD = opsiInput[3] || '';
    opsiE = opsiInput[4] || '';
    kunciTampil = kunciPg;
    opsiJSON = JSON.stringify(opsiInput.slice(0, 5));
    kunciJSON = JSON.stringify(kunciPg);
  } else if (jenis === 'pgk') {
    if (opsiInput.length < 2) {
      return { ok: false, message: 'Pilihan ganda kompleks membutuhkan minimal 2 opsi.' };
    }
    var kunciIdx = jawabanKeIndeks(p.kunci, opsiInput.length);
    if (kunciIdx.length < 1) {
      return { ok: false, message: 'Pilihan ganda kompleks membutuhkan minimal 1 kunci benar.' };
    }
    if (kunciIdx.length >= opsiInput.length) {
      return { ok: false, message: 'Kunci tidak boleh mencakup semua opsi.' };
    }
    opsiA = opsiInput[0] || ''; opsiB = opsiInput[1] || '';
    opsiC = opsiInput[2] || ''; opsiD = opsiInput[3] || '';
    opsiE = opsiInput[4] || '';
    kunciTampil = kunciIdx.map(function (ix) { return KUNCI_VALID[ix]; }).join(',');
    opsiJSON = JSON.stringify(opsiInput.slice(0, 5));
    kunciJSON = JSON.stringify(kunciIdx);
  } else if (jenis === 'bs') {
    var kunciBs = normalisasiIsian(p.kunci);
    if (kunciBs === 'true') kunciBs = 'benar';
    if (kunciBs === 'false') kunciBs = 'salah';
    if (kunciBs !== 'benar' && kunciBs !== 'salah') {
      return { ok: false, message: "Kunci Benar/Salah harus 'Benar' atau 'Salah'." };
    }
    kunciTampil = kunciBs === 'benar' ? 'Benar' : 'Salah';
    opsiA = 'Benar'; opsiB = 'Salah';
    opsiJSON = JSON.stringify(['Benar', 'Salah']);
    kunciJSON = JSON.stringify(kunciTampil);
  } else if (jenis === 'jodoh') {
    var kiri = p.pasanganKiri || p.kiri || [];
    var kanan = p.pasanganKanan || p.kanan || [];
    if (!Array.isArray(kiri) || !Array.isArray(kanan)) {
      return { ok: false, message: 'Menjodohkan membutuhkan pasanganKiri & pasanganKanan (array).' };
    }
    var kiriBersih = [], kananBersih = [];
    for (var kl = 0; kl < kiri.length; kl++) {
      if (asString(kiri[kl])) kiriBersih.push(asString(kiri[kl]));
    }
    for (var kn = 0; kn < kanan.length; kn++) {
      if (asString(kanan[kn])) kananBersih.push(asString(kanan[kn]));
    }
    if (kiriBersih.length < 2 || kananBersih.length < 2) {
      return { ok: false, message: 'Menjodohkan membutuhkan minimal 2 pasangan kiri dan 2 kanan.' };
    }
    // Kunci boleh berupa array indeks ([1,0]) atau peta {0:1, 1:0}
    // (format yang dikirim form frontend) — peta dikonversi ke array.
    var kunciJodoh = p.kunci;
    if (!Array.isArray(kunciJodoh) && p.kunciJodoh &&
        typeof p.kunciJodoh === 'object') {
      kunciJodoh = [];
      for (var kjr = 0; kjr < kiriBersih.length; kjr++) {
        kunciJodoh.push(p.kunciJodoh[kjr] === undefined
          ? p.kunciJodoh[String(kjr)] : p.kunciJodoh[kjr]);
      }
    }
    if (!Array.isArray(kunciJodoh)) {
      return { ok: false, message: 'Kunci menjodohkan harus array indeks kanan per pasangan kiri.' };
    }
    if (kunciJodoh.length !== kiriBersih.length) {
      return { ok: false, message: 'Jumlah kunci menjodohkan harus sama dengan jumlah pasangan kiri.' };
    }
    var kunciJ = [];
    for (var kj = 0; kj < kunciJodoh.length; kj++) {
      var n = parseInt(kunciJodoh[kj], 10);
      if (isNaN(n) || n < 0 || n >= kananBersih.length) {
        return { ok: false, message: 'Kunci menjodohkan ke-' + (kj + 1) + ' di luar jangkauan pasangan kanan.' };
      }
      kunciJ.push(n);
    }
    opsiJSON = JSON.stringify({ kiri: kiriBersih, kanan: kananBersih });
    kunciJSON = JSON.stringify(kunciJ);
    kunciTampil = '';
  } else if (jenis === 'isian') {
    var kunciIsian = asString(p.kunci);
    if (!kunciIsian) {
      return { ok: false, message: 'Kunci isian singkat wajib diisi.' };
    }
    kunciTampil = kunciIsian;
    kunciJSON = JSON.stringify(kunciIsian);
  } else if (jenis === 'essay') {
    kunciTampil = '';
    kunciJSON = JSON.stringify('');
  }

  return {
    ok: true,
    data: {
      jenjangId: jenjangId, mapelId: mapelId, soal: soal,
      opsiA: opsiA, opsiB: opsiB, opsiC: opsiC, opsiD: opsiD, opsiE: opsiE,
      kunci: kunciTampil, bobot: bobot, pembahasan: pembahasan,
      gambarUrl: gambarUrl, jenis: jenis, opsiJSON: opsiJSON,
      kunciJSON: kunciJSON, tingkat: tingkat, kelasId: kelasId
    }
  };
}


function actionSaveSoal(ss, user, p) {
  try {
    var v = validasiSoal(ss, p);
    if (!v.ok) return { success: false, message: v.message };
    var d = v.data;
    var sheet = ss.getSheetByName(SHEET_BANKSOAL);
    var id = asString(p.id);
    if (id) {
      var rowNum = findRowNum(sheet, 1, id);
      if (rowNum < 0) return { success: false, message: 'Soal tidak ditemukan.' };
      sheet.getRange(rowNum, 2, 1, 12).setValues([[
        d.jenjangId, d.mapelId, d.soal, d.opsiA, d.opsiB, d.opsiC, d.opsiD,
        d.opsiE, d.kunci, d.bobot, d.pembahasan, d.gambarUrl
      ]]);
      sheet.getRange(rowNum, 16, 1, 5).setValues([[
        d.jenis, d.opsiJSON, d.kunciJSON, d.tingkat, d.kelasId
      ]]);
      return { success: true, message: 'Soal berhasil diubah.', data: { id: id } };
    }
    var baru = Utilities.getUuid();
    sheet.appendRow([baru, d.jenjangId, d.mapelId, d.soal, d.opsiA, d.opsiB,
      d.opsiC, d.opsiD, d.opsiE, d.kunci, d.bobot, d.pembahasan, d.gambarUrl,
      sekarangISODateTime(), user.username,
      d.jenis, d.opsiJSON, d.kunciJSON, d.tingkat, d.kelasId]);
    return { success: true, message: 'Soal berhasil disimpan.', data: { id: baru } };
  } catch (err) {
    return { success: false, error: 'saveSoal: ' + err.message };
  }
}


/** true jika ada Paket mode manual yang SoalIDsJSON-nya memuat soalId. */
function paketManualPakaiSoal(ss, soalId) {
  var rows = readRows(ss.getSheetByName(SHEET_PAKET));
  for (var i = 0; i < rows.length; i++) {
    if (asString(rows[i][5]) !== 'manual') continue;
    var ids = parseJSONLunak(rows[i][6], []);
    if (Array.isArray(ids) && ids.indexOf(soalId) >= 0) return true;
  }
  return false;
}

function actionDeleteSoal(ss, p) {
  try {
    var id = asString(p.id);
    if (!id) return { success: false, message: 'ID soal wajib diisi.' };
    var sheet = ss.getSheetByName(SHEET_BANKSOAL);
    if (findRowNum(sheet, 1, id) < 0) {
      return { success: false, message: 'Soal tidak ditemukan.' };
    }
    if (paketManualPakaiSoal(ss, id)) {
      return { success: false, message: 'Soal tidak dapat dihapus karena dipakai paket mode manual.' };
    }
    sheet.deleteRow(findRowNum(sheet, 1, id));
    return { success: true, message: 'Soal berhasil dihapus.' };
  } catch (err) {
    return { success: false, error: 'deleteSoal: ' + err.message };
  }
}

function actionImportSoal(ss, user, p) {
  var hasil = { imported: 0, duplikat: 0, errors: [] };
  try {
    var jenjangId = asString(p.jenjangId);
    var mapelId = asString(p.mapelId);
    var items = p.items;
    if (!Array.isArray(items) || items.length === 0) {
      return { success: false, message: 'Data soal kosong.' };
    }
    var sheet = ss.getSheetByName(SHEET_BANKSOAL);
    // Dedupe (v1.2.1, idempotent): soal yang sudah ada dibaca SEKALI, kunci =
    // mapelId + teks soal ternormalisasi. Impor ulang file yang sama (mis.
    // setelah koneksi putus) tidak menggandakan soal; duplikat dihitung.
    var adaRows = readRows(sheet);
    var sudahAda = {};
    for (var e = 0; e < adaRows.length; e++) {
      sudahAda[asString(adaRows[e][2]) + '\n' + normalisasiTeksKunci(asString(adaRows[e][3]))] = true;
    }
    var antre = [];
    var now = sekarangISODateTime();
    for (var i = 0; i < items.length; i++) {
      var baris = i + 1;
      var it = items[i] || {};
      it.jenjangId = it.jenjangId || jenjangId;
      it.mapelId = it.mapelId || mapelId;
      var v = validasiSoal(ss, it);
      if (!v.ok) {
        hasil.errors.push({ baris: baris, pesan: v.message });
        continue;
      }
      var d = v.data;
      var kunciSoal = d.mapelId + '\n' + normalisasiTeksKunci(d.soal);
      if (sudahAda[kunciSoal]) { hasil.duplikat++; continue; }
      sudahAda[kunciSoal] = true;
      antre.push([Utilities.getUuid(), d.jenjangId, d.mapelId, d.soal,
        d.opsiA, d.opsiB, d.opsiC, d.opsiD, d.opsiE, d.kunci, d.bobot,
        d.pembahasan, d.gambarUrl, now, user.username,
        d.jenis, d.opsiJSON, d.kunciJSON, d.tingkat, d.kelasId]);
      hasil.imported++;
    }
    // Tulis batch SEKALIGUS (satu setValues), bukan 1 baris 1 request.
    if (antre.length > 0) {
      sheet.getRange(sheet.getLastRow() + 1, 1, antre.length, 20)
        .setValues(antre);
    }
    return {
      success: true,
      message: 'Impor selesai: ' + hasil.imported + ' soal diimpor, ' +
        hasil.duplikat + ' duplikat dilewati, ' + hasil.errors.length + ' gagal.',
      data: hasil
    };
  } catch (err) {
    return { success: false, error: 'importSoal: ' + err.message };
  }
}

/**
 * Ekstrak nilai opsi + indeks kunci dari item pilihan Form
 * (MultipleChoiceItem / ListItem / CheckboxItem). Opsi bernilai kosong
 * dibuang agar tidak menjadi opsi kosong di bank soal.
 */
function ekstrakPilihanForm(item, asMethod) {
  var nilai = [];
  var benar = [];
  var choices = [];
  try { choices = item[asMethod]().getChoices() || []; } catch (e) {}
  for (var c = 0; c < choices.length; c++) {
    var v = '';
    try { v = asString(choices[c].getValue()); } catch (e2) {}
    if (!v) continue;
    var idx = nilai.length;
    nilai.push(v);
    var ok = false;
    try { ok = !!choices[c].isCorrectAnswer(); } catch (e3) {}
    if (ok) benar.push(idx);
  }
  return { nilai: nilai, benar: benar };
}

/**
 * Alasan lewati per jenis item Form yang tidak bisa diimpor (v1.2.5).
 * Apps Script tidak mengekspos kunci jawaban untuk isian singkat maupun
 * petak, jadi keduanya tidak bisa diimpor beserta kuncinya.
 */
function alasanLewatiForm(tipe, TIPE_FORM) {
  if (tipe === TIPE_FORM.TEXT) {
    return 'Isian singkat: kunci jawaban tidak bisa dibaca dari Google Form (keterbatasan Apps Script) — tambahkan lewat Bank Soal atau template Excel.';
  }
  if (tipe === TIPE_FORM.GRID || tipe === TIPE_FORM.CHECKBOX_GRID) {
    return 'Petak: kunci per baris tidak bisa dibaca dari Google Form — tambahkan sebagai soal Menjodohkan lewat Bank Soal atau template Excel.';
  }
  if (tipe === TIPE_FORM.SCALE) {
    return 'Skala linear tidak didukung — ubah menjadi pilihan ganda di Form.';
  }
  if (tipe === TIPE_FORM.DATE || tipe === TIPE_FORM.DATETIME ||
      tipe === TIPE_FORM.TIME || tipe === TIPE_FORM.DURATION) {
    return 'Soal tanggal/waktu tidak didukung.';
  }
  if (tipe === TIPE_FORM.IMAGE || tipe === TIPE_FORM.VIDEO ||
      tipe === TIPE_FORM.PAGE_BREAK || tipe === TIPE_FORM.SECTION_HEADER) {
    return 'Bukan soal (elemen tata letak).';
  }
  return 'Jenis item Form belum didukung.';
}

/**
 * Impor soal dari Google Form (mode kuis). Hanya berjalan di Apps Script;
 * di lingkungan tanpa FormApp (mis. diuji di node) kembalikan error ramah.
 */
function actionImportSoalDariForm(ss, user, p) {
  try {
    if (typeof FormApp === 'undefined') {
      return { success: false, message: 'Impor Google Form hanya bisa dijalankan di Apps Script.' };
    }
    var formIdOrUrl = asString(p.formIdOrUrl);
    var jenjangId = asString(p.jenjangId);
    var mapelId = asString(p.mapelId);
    if (!formIdOrUrl) {
      return { success: false, message: 'ID atau URL Google Form wajib diisi.' };
    }
    if (!jenjangId || findRowNum(ss.getSheetByName(SHEET_JENJANG), 1, jenjangId) < 0) {
      return { success: false, message: 'Jenjang tidak ditemukan.' };
    }
    if (!mapelId || findRowNum(ss.getSheetByName(SHEET_MAPEL), 1, mapelId) < 0) {
      return { success: false, message: 'Mapel tidak ditemukan.' };
    }

    // v1.2.5: link publikasi /d/e/<ID>/viewform TIDAK bisa dibuka script —
    // ID publikasi bukan ID file form (terbukti 13 Nov 2026: ID /e/ di URL
    // /edit menghasilkan "file tidak ada"). Tolak dengan petunjuk jelas
    // sebelum openById, agar tidak gagal dengan pesan membingungkan.
    if (/\/d\/e\//.test(formIdOrUrl)) {
      return { success: false, message: 'Link yang ditempel adalah link publikasi (/d/e/...) untuk siswa mengisi — script tidak bisa membacanya. Buka form di editor (Google Drive → klik dua kali form), salin URL edit (.../d/<ID>/edit), lalu tempel di sini.' };
    }
    // Ambil ID form dari URL edit (.../d/<ID>/edit) atau pakai ID mentah.
    var m = formIdOrUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
    var formId = m ? m[1] : formIdOrUrl;
    var form;
    try {
      form = FormApp.openById(formId);
    } catch (e0) {
      // v1.2.4: bedakan penyebabnya agar tidak tebak-tebakan — error izin/
      // otorisasi (scope Forms belum disetujui / akun tak punya akses ke form)
      // vs form memang tidak ditemukan. Detail teknis mentah disertakan
      // (dipotong) agar penyebab aslinya terlihat di toast.
      var detail = asString(e0 && e0.message).slice(0, 100);
      if (/permission|authorization|otorisasi|izin/i.test(detail)) {
        return { success: false, message: 'Izin Google Forms belum diberikan atau akun ini tidak punya akses ke form tersebut. Buka editor Apps Script, jalankan fungsi "authorizeFormsAccess", setujui izinnya, dan pastikan form bisa dibuka akun yang sama. (Detail: ' + detail + ')' };
      }
      return { success: false, message: 'Google Form tidak ditemukan atau tidak dapat diakses. Periksa URL/ID form dan pastikan form dibagikan ke akun yang mendeploy backend. (Detail: ' + detail + ')' };
    }

    var items = form.getItems();
    var sheet = ss.getSheetByName(SHEET_BANKSOAL);
    // Dedupe (v1.2.3, idempotent): soal yang sudah ada dibaca SEKALI; judul yang
    // sama pada mapel yang sama dilewati agar impor ulang form yang sama tidak
    // menggandakan soal. Baris baru ditulis dengan SATU setValues.
    var adaRows = readRows(sheet);
    var sudahAda = {};
    for (var e = 0; e < adaRows.length; e++) {
      sudahAda[asString(adaRows[e][2]) + '\n' + normalisasiTeksKunci(asString(adaRows[e][3]))] = true;
    }
    var imported = 0;
    var dilewati = [];
    var antre = [];
    var now = sekarangISODateTime();
    var huruf = ['A', 'B', 'C', 'D', 'E'];

    var TIPE_FORM = FormApp.ItemType;
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var judul = '';
      try { judul = asString(item.getTitle()); } catch (e1) {}
      if (!judul) judul = 'Soal ke-' + (i + 1);
      var tipe = null;
      try { tipe = item.getType(); } catch (eT) {}

      // --- Item pilihan berkunci (v1.2.5): PG dari MULTIPLE_CHOICE & LIST
      // (dropdown), PG Kompleks dari CHECKBOX. Aturan PG tidak berubah:
      // 2-5 opsi, tepat 1 kunci; PGK: 2-5 opsi, >=1 kunci, tidak semua benar.
      if (tipe === TIPE_FORM.MULTIPLE_CHOICE || tipe === TIPE_FORM.LIST ||
          tipe === TIPE_FORM.CHECKBOX) {
        var asMethod = tipe === TIPE_FORM.MULTIPLE_CHOICE ? 'asMultipleChoiceItem'
          : tipe === TIPE_FORM.LIST ? 'asListItem' : 'asCheckboxItem';
        var pil = ekstrakPilihanForm(item, asMethod);
        if (pil.nilai.length < 2) {
          dilewati.push({ judul: judul, alasan: 'Jumlah opsi kurang dari 2.' });
          continue;
        }
        if (pil.nilai.length > 5) {
          dilewati.push({ judul: judul, alasan: 'Jumlah opsi lebih dari 5.' });
          continue;
        }
        if (pil.benar.length < 1) {
          dilewati.push({ judul: judul, alasan: 'Tidak ada kunci jawaban (aktifkan mode kuis di Google Form).' });
          continue;
        }
        var jenisSoal, kunciTampil, kunciJSON;
        if (tipe === TIPE_FORM.CHECKBOX) {
          if (pil.benar.length >= pil.nilai.length) {
            dilewati.push({ judul: judul, alasan: 'Semua opsi ditandai benar — sisakan minimal 1 opsi salah.' });
            continue;
          }
          jenisSoal = 'pgk';
          kunciTampil = pil.benar.map(function (ix) { return huruf[ix]; }).join(',');
          kunciJSON = JSON.stringify(pil.benar);
        } else {
          if (pil.benar.length > 1) {
            dilewati.push({ judul: judul, alasan: 'Lebih dari satu kunci jawaban.' });
            continue;
          }
          jenisSoal = 'pg';
          kunciTampil = huruf[pil.benar[0]];
          kunciJSON = JSON.stringify(kunciTampil);
        }
        var kunciSoal = mapelId + '\n' + normalisasiTeksKunci(judul);
        if (sudahAda[kunciSoal]) {
          dilewati.push({ judul: judul, alasan: 'Duplikat — soal sudah ada di bank soal.' });
          continue;
        }
        sudahAda[kunciSoal] = true;
        var opsi = ['', '', '', '', ''];
        for (var c2 = 0; c2 < pil.nilai.length; c2++) opsi[c2] = pil.nilai[c2];
        antre.push([Utilities.getUuid(), jenjangId, mapelId, judul,
          opsi[0], opsi[1], opsi[2], opsi[3], opsi[4],
          kunciTampil, 1, '', '', now, user.username,
          jenisSoal, JSON.stringify(pil.nilai), kunciJSON, 'Sedang', '']);
        imported++;
        continue;
      }

      // --- Paragraf -> esai (v1.2.5): dinilai manual; paragraf tidak punya
      // kunci jawaban di Google Form, jadi tidak ada validasi kunci.
      if (tipe === TIPE_FORM.PARAGRAPH_TEXT) {
        var kunciSoalE = mapelId + '\n' + normalisasiTeksKunci(judul);
        if (sudahAda[kunciSoalE]) {
          dilewati.push({ judul: judul, alasan: 'Duplikat — soal sudah ada di bank soal.' });
          continue;
        }
        sudahAda[kunciSoalE] = true;
        antre.push([Utilities.getUuid(), jenjangId, mapelId, judul,
          '', '', '', '', '', '', 1, '', '', now, user.username,
          'essay', '', JSON.stringify(''), 'Sedang', '']);
        imported++;
        continue;
      }

      // --- Jenis lain: dilewati dengan alasan yang menjelaskan penyebabnya.
      dilewati.push({ judul: judul, alasan: alasanLewatiForm(tipe, TIPE_FORM) });
    }
    if (antre.length > 0) {
      sheet.getRange(sheet.getLastRow() + 1, 1, antre.length, 20).setValues(antre);
    }

    return {
      success: true,
      message: 'Impor selesai: ' + imported + ' soal diimpor, ' +
        dilewati.length + ' dilewati.',
      data: { imported: imported, dilewati: dilewati }
    };
  } catch (err) {
    return { success: false, error: 'importSoalDariForm: ' + err.message };
  }
}

// ============================================================
// PAKET TRY OUT (guru/admin)
// ============================================================
function jumlahSoalBank(ss, jenjangId, mapelId) {
  var rows = readRows(ss.getSheetByName(SHEET_BANKSOAL));
  var n = 0;
  for (var i = 0; i < rows.length; i++) {
    if (asString(rows[i][1]) === jenjangId && asString(rows[i][2]) === mapelId) n++;
  }
  return n;
}

function actionSavePaket(ss, user, p) {
  try {
    var nama = asString(p.nama);
    var jenjangId = asString(p.jenjangId);
    var mapelId = asString(p.mapelId);
    var modeSoal = asString(p.modeSoal);
    var durasiMenit = asInt(p.durasiMenit, 0);
    var mulai = asString(p.mulai);
    var selesai = asString(p.selesai);
    var id = asString(p.id);

    if (!nama) return { success: false, message: 'Nama paket wajib diisi.' };
    if (!jenjangId) return { success: false, message: 'Jenjang wajib dipilih.' };
    if (!mapelId) return { success: false, message: 'Mapel wajib dipilih.' };
    if (findRowNum(ss.getSheetByName(SHEET_JENJANG), 1, jenjangId) < 0) {
      return { success: false, message: 'Jenjang tidak ditemukan.' };
    }
    if (findRowNum(ss.getSheetByName(SHEET_MAPEL), 1, mapelId) < 0) {
      return { success: false, message: 'Mapel tidak ditemukan.' };
    }
    if (MODE_SOAL_VALID.indexOf(modeSoal) < 0) {
      return { success: false, message: 'Mode soal tidak valid (manual/acak).' };
    }
    if (!(durasiMenit >= 5 && durasiMenit <= 300)) {
      return { success: false, message: 'Durasi harus 5-300 menit.' };
    }
    var dMulai = parseDatetime(mulai);
    var dSelesai = parseDatetime(selesai);
    if (!dMulai) {
      return { success: false, message: 'Format mulai tidak valid (yyyy-MM-dd HH:mm:ss).' };
    }
    if (!dSelesai) {
      return { success: false, message: 'Format selesai tidak valid (yyyy-MM-dd HH:mm:ss).' };
    }
    if (dSelesai.getTime() <= dMulai.getTime()) {
      return { success: false, message: 'Waktu selesai harus setelah waktu mulai.' };
    }

    var soalIds = [];
    var jumlahAcak = 0;
    if (modeSoal === 'manual') {
      soalIds = p.soalIds;
      if (!Array.isArray(soalIds) || soalIds.length < 1) {
        return { success: false, message: 'Mode manual membutuhkan minimal 1 soal.' };
      }
      var sheetSoal = ss.getSheetByName(SHEET_BANKSOAL);
      for (var s = 0; s < soalIds.length; s++) {
        if (findRowNum(sheetSoal, 1, asString(soalIds[s])) < 0) {
          return { success: false, message: 'Soal tidak ditemukan: ' + asString(soalIds[s]) };
        }
        soalIds[s] = asString(soalIds[s]);
      }
    } else {
      jumlahAcak = asInt(p.jumlahAcak, 0);
      if (jumlahAcak < 1) {
        return { success: false, message: 'Jumlah soal acak minimal 1.' };
      }
      var tersedia = jumlahSoalBank(ss, jenjangId, mapelId);
      if (jumlahAcak > tersedia) {
        return { success: false, message: 'Jumlah soal acak melebihi jumlah soal di bank (' + tersedia + ').' };
      }
    }

    var kelasIds = p.kelasIds === undefined || p.kelasIds === null ? [] : p.kelasIds;
    if (!Array.isArray(kelasIds)) {
      return { success: false, message: 'kelasIds harus berupa array ID kelas.' };
    }
    var sheetKelas = ss.getSheetByName(SHEET_KELAS);
    var kelasBersih = [];
    for (var k = 0; k < kelasIds.length; k++) {
      var kid = asString(kelasIds[k]);
      if (findRowNum(sheetKelas, 1, kid) < 0) {
        return { success: false, message: 'Kelas tidak ditemukan: ' + kid };
      }
      if (kelasBersih.indexOf(kid) < 0) kelasBersih.push(kid);
    }

    var acakSoal = asFlag(p.acakSoal, 1);
    var acakOpsi = asFlag(p.acakOpsi, 1);
    var tampilSkor = asFlag(p.tampilSkor, 1);
    var tampilPembahasan = asFlag(p.tampilPembahasan, 1);
    var aktif = asFlag(p.aktif, 1);

    // Token ujian STATIS (bukan token berputar): diatur guru/admin saat
    // membuat/mengedit ujian. Kosong = tanpa token. Field `tokenUjian`
    // (bukan `token` — itu token sesi login).
    var token = p.tokenUjian === undefined || p.tokenUjian === null ? '' : asString(p.tokenUjian);
    if (token.length > 20) {
      return { success: false, message: 'Token ujian maksimal 20 karakter.' };
    }
    // Jeda gelombang antar kelas (menit): dari form, else default Pengaturan.
    var settingsPaket = getSettings(ss);
    var jedaGelombang = p.jedaGelombang === undefined || p.jedaGelombang === null ||
      p.jedaGelombang === '' ? settingsPaket.jedaGelombang
      : asInt(p.jedaGelombang, -1);
    if (!(jedaGelombang >= 0 && jedaGelombang <= 60)) {
      return { success: false, message: 'Jeda gelombang harus 0-60 menit.' };
    }

    // Anti-bentrok: tolak bila ada paket AKTIF lain untuk kelas yang sama
    // yang bentrok jamnya di hari yang sama (saat buat maupun edit).
    if (aktif === 1) {
      var bentrok = cekBentrokJadwal(ss,
        { jenjangId: jenjangId, kelasIds: kelasBersih, mulai: mulai, selesai: selesai },
        id || '');
      if (bentrok) {
        return { success: false, message: 'Jadwal bentrok dengan ujian "' + bentrok.nama + '" untuk kelas yang sama di hari yang sama. Ubah jam atau kelas peserta.' };
      }
    }

    var sheet = ss.getSheetByName(SHEET_PAKET);
    if (id) {
      var rowNum = findRowNum(sheet, 1, id);
      if (rowNum < 0) return { success: false, message: 'Paket tidak ditemukan.' };
      sheet.getRange(rowNum, 2, 1, 15).setValues([[
        nama, jenjangId, mapelId, JSON.stringify(kelasBersih), modeSoal,
        JSON.stringify(soalIds), jumlahAcak, durasiMenit, mulai, selesai,
        acakSoal, acakOpsi, tampilSkor, tampilPembahasan, aktif
      ]]);
      sheet.getRange(rowNum, 19, 1, 2).setValues([[token, jedaGelombang]]);
      return { success: true, message: 'Paket berhasil diubah.', data: { id: id } };
    }
    var baru = Utilities.getUuid();
    sheet.appendRow([baru, nama, jenjangId, mapelId, JSON.stringify(kelasBersih),
      modeSoal, JSON.stringify(soalIds), jumlahAcak, durasiMenit, mulai, selesai,
      acakSoal, acakOpsi, tampilSkor, tampilPembahasan, aktif,
      sekarangISODateTime(), user.username, token, jedaGelombang]);
    return { success: true, message: 'Paket berhasil disimpan.', data: { id: baru } };
  } catch (err) {
    return { success: false, error: 'savePaket: ' + err.message };
  }
}

/** Ambil baris paket sebagai objek; null jika tidak ada. */

function actionDeletePaket(ss, p) {
  try {
    var id = asString(p.id);
    if (!id) return { success: false, message: 'ID paket wajib diisi.' };
    var sheet = ss.getSheetByName(SHEET_PAKET);
    var rowNum = findRowNum(sheet, 1, id);
    if (rowNum < 0) return { success: false, message: 'Paket tidak ditemukan.' };
    sheet.deleteRow(rowNum);
    return { success: true, message: 'Paket berhasil dihapus.', data: { id: id } };
  } catch (err) {
    return { success: false, error: 'deletePaket: ' + err.message };
  }
}

// ============================================================
// SOAL 6 JENIS + PENILAIAN + JAWABAN TERSIMPAN (v1.0.0)
// ============================================================
var JENIS_SOAL_VALID = ['pg', 'pgk', 'bs', 'jodoh', 'isian', 'essay'];
var TINGKAT_VALID = ['Mudah', 'Sedang', 'Sulit'];

/** Normalisasi jawaban isian: abaikan huruf besar/kecil & spasi berlebih. */
function normalisasiIsian(s) {
  return String(s === null || s === undefined ? '' : s).toLowerCase()
    .replace(/\s+/g, ' ').trim();
}

/**
 * Parse satu baris BankSoal (20 kolom) menjadi objek soal lengkap.
 * Backward-compat: baris lama (tanpa kolom Jenis/OpsiJSON/KunciJSON,
 * yaitu 15 kolom) dibaca sebagai jenis 'pg' dengan kunci huruf lama.
 */
function parseSoalBankRow(r) {
  var jenis = asString(r[15]) || 'pg';
  if (JENIS_SOAL_VALID.indexOf(jenis) < 0) jenis = 'pg';
  var opsiJSON = parseJSONLunak(r[16], null);
  var kunciJSON = parseJSONLunak(r[17], null);
  var opsiTeks = [asString(r[4]), asString(r[5]), asString(r[6]),
    asString(r[7]), asString(r[8])];
  var opsi = [];
  for (var i = 0; i < opsiTeks.length; i++) {
    if (opsiTeks[i]) opsi.push(opsiTeks[i]);
  }
  var kiri = [], kanan = [];
  if (jenis === 'jodoh' && opsiJSON && typeof opsiJSON === 'object' &&
      !Array.isArray(opsiJSON)) {
    kiri = Array.isArray(opsiJSON.kiri)
      ? opsiJSON.kiri.map(asString) : [];
    kanan = Array.isArray(opsiJSON.kanan)
      ? opsiJSON.kanan.map(asString) : [];
  }
  if ((jenis === 'pg' || jenis === 'pgk') && Array.isArray(opsiJSON) &&
      opsiJSON.length > 0) {
    var op2 = [];
    for (var j = 0; j < opsiJSON.length; j++) {
      if (asString(opsiJSON[j])) op2.push(asString(opsiJSON[j]));
    }
    if (op2.length > 0) opsi = op2;
  }
  var kunciHuruf = asString(r[9]).toUpperCase();
  var kunci = (kunciJSON === null || kunciJSON === undefined)
    ? kunciHuruf : kunciJSON;
  return {
    id: asString(r[0]), jenjangId: asString(r[1]), mapelId: asString(r[2]),
    soal: asString(r[3]), opsi: opsi, kunci: kunci, kunciHuruf: kunciHuruf,
    bobot: asInt(r[10], 1), pembahasan: asString(r[11]),
    gambarUrl: asString(r[12]), jenis: jenis, kiri: kiri, kanan: kanan,
    tingkat: asString(r[18]) || 'Sedang', kelasId: asString(r[19]),
    dibuatPada: selKeString(r[13])
  };
}

/**
 * Normalisasi jawaban klien menjadi array indeks opsi (0-based).
 * Terima: array indeks/huruf, string "A,C" / "0,2", satu huruf, satu angka.
 */
function jawabanKeIndeks(jawaban, jumlahOpsi) {
  var out = [];
  function tambah(v) {
    if (v === null || v === undefined) return;
    if (typeof v === 'number' && isFinite(v)) {
      var n = Math.floor(v);
      if (n >= 0 && n < jumlahOpsi && out.indexOf(n) < 0) out.push(n);
      return;
    }
    var s = asString(v).toUpperCase();
    if (!s) return;
    if (/^[A-E]$/.test(s)) {
      var idx = KUNCI_VALID.indexOf(s);
      if (idx >= 0 && idx < jumlahOpsi && out.indexOf(idx) < 0) out.push(idx);
      return;
    }
    var num = parseInt(s, 10);
    if (!isNaN(num) && String(num) === s && num >= 0 && num < jumlahOpsi &&
        out.indexOf(num) < 0) out.push(num);
  }
  if (Array.isArray(jawaban)) {
    for (var i = 0; i < jawaban.length; i++) tambah(jawaban[i]);
  } else if (typeof jawaban === 'string' && jawaban.indexOf(',') >= 0) {
    var parts = jawaban.split(',');
    for (var j = 0; j < parts.length; j++) tambah(parts[j]);
  } else {
    tambah(jawaban);
  }
  return out;
}

/**
 * Normalisasi jawaban menjodohkan ke array indeks kanan per kiri.
 * Terima: array [1,0]; string JSON array "[1,0]"; string JSON peta
 * '{"0":1,"1":0}' (format serial frontend — jawaban dikirim sebagai
 * string); objek peta {0:1, 1:0}; atau satu nilai tunggal.
 */
function jodohKeArray(jawaban, total) {
  var arr = [];
  if (Array.isArray(jawaban)) {
    arr = jawaban.slice();
  } else if (jawaban && typeof jawaban === 'object') {
    for (var i = 0; i < total; i++) {
      arr.push(jawaban[i] === undefined ? jawaban[String(i)] : jawaban[i]);
    }
  } else if (typeof jawaban === 'string') {
    var parsed = parseJSONLunak(jawaban, null);
    if (Array.isArray(parsed)) {
      arr = parsed;
    } else if (parsed && typeof parsed === 'object') {
      for (var j = 0; j < total; j++) {
        arr.push(parsed[j] === undefined ? parsed[String(j)] : parsed[j]);
      }
    } else {
      arr = [jawaban];
    }
  } else {
    arr = [jawaban];
  }
  return arr;
}

/**
 * Skor SATU soal (6 jenis). Mengembalikan
 * {skor, terjawab, penuh, menunggu} — `menunggu`=true hanya untuk essay
 * yang sudah dijawab tapi belum dinilai manual (skorEssay null).
 * `skorEssay`: skor manual essay (number) atau null bila belum dinilai.
 *
 * Aturan skoring (lihat docs/API_CONTRACT.md):
 *  - pg: benar=bobot, salah=0.
 *  - pgk: (benarDipilih - salahDipilih) / jumlahKunciBenar * bobot, floor 0.
 *  - bs: cocok 'Benar'/'Salah' -> bobot, else 0.
 *  - jodoh: pasanganBenar / totalPasangan * bobot.
 *  - isian: cocok kunci (case-insensitive, spasi berlebih diabaikan) -> bobot.
 *  - essay: 0 sampai dinilai manual.
 */
function skorSatuSoal(soal, jawaban, skorEssay) {
  var bobot = soal.bobot || 1;
  if (jawaban === undefined || jawaban === null) {
    return { skor: 0, terjawab: false, penuh: false, menunggu: false };
  }
  if (typeof jawaban === 'string' && asString(jawaban) === '') {
    return { skor: 0, terjawab: false, penuh: false, menunggu: false };
  }
  if (Array.isArray(jawaban) && jawaban.length === 0) {
    return { skor: 0, terjawab: false, penuh: false, menunggu: false };
  }
  var jenis = soal.jenis || 'pg';
  if (jenis === 'essay') {
    if (skorEssay === undefined || skorEssay === null || skorEssay === '') {
      return { skor: 0, terjawab: true, penuh: false, menunggu: true };
    }
    var se = Number(skorEssay) || 0;
    if (se < 0) se = 0;
    if (se > bobot) se = bobot;
    return { skor: Math.round(se * 100) / 100, terjawab: true,
      penuh: se >= bobot, menunggu: false };
  }
  if (jenis === 'pg') {
    var jwb = asString(jawaban).toUpperCase();
    var kunci = asString(soal.kunci).toUpperCase();
    var benar = jwb === kunci && KUNCI_VALID.indexOf(jwb) >= 0;
    return { skor: benar ? bobot : 0, terjawab: true, penuh: benar,
      menunggu: false };
  }
  if (jenis === 'pgk') {
    var kunciIdx = jawabanKeIndeks(soal.kunci, soal.opsi.length);
    if (kunciIdx.length === 0) {
      return { skor: 0, terjawab: true, penuh: false, menunggu: false };
    }
    var pilih = jawabanKeIndeks(jawaban, soal.opsi.length);
    var benarDipilih = 0, salahDipilih = 0;
    for (var i = 0; i < pilih.length; i++) {
      if (kunciIdx.indexOf(pilih[i]) >= 0) benarDipilih++;
      else salahDipilih++;
    }
    var fraksi = Math.max(0, (benarDipilih - salahDipilih) / kunciIdx.length);
    var skor = Math.round(fraksi * bobot * 100) / 100;
    return { skor: skor, terjawab: true,
      penuh: salahDipilih === 0 && benarDipilih === kunciIdx.length,
      menunggu: false };
  }
  if (jenis === 'bs') {
    var jb = normalisasiIsian(jawaban);
    if (jb === 'true') jb = 'benar';
    if (jb === 'false') jb = 'salah';
    var kb = normalisasiIsian(soal.kunci);
    var okBs = (jb === kb) && (jb === 'benar' || jb === 'salah');
    return { skor: okBs ? bobot : 0, terjawab: true, penuh: okBs,
      menunggu: false };
  }
  if (jenis === 'jodoh') {
    var kunciJ = Array.isArray(soal.kunci) ? soal.kunci : [];
    var total = kunciJ.length;
    if (total === 0) {
      return { skor: 0, terjawab: true, penuh: false, menunggu: false };
    }
    // Jawaban klien bisa berupa array, string JSON array, string JSON
    // peta '{"0":1,"1":0}' (format serial frontend), atau objek peta.
    var jwbArr = jodohKeArray(jawaban, total);
    var adaIsi = false;
    for (var kj = 0; kj < jwbArr.length; kj++) {
      if (jwbArr[kj] !== undefined && jwbArr[kj] !== null &&
          asString(jwbArr[kj]) !== '') { adaIsi = true; break; }
    }
    if (!adaIsi) {
      return { skor: 0, terjawab: false, penuh: false, menunggu: false };
    }
    var benarJ = 0;
    for (var k = 0; k < total; k++) {
      var v = jwbArr[k];
      if (v === undefined || v === null || asString(v) === '') continue;
      if (parseInt(v, 10) === parseInt(kunciJ[k], 10)) benarJ++;
    }
    var skorJ = Math.round(benarJ / total * bobot * 100) / 100;
    return { skor: skorJ, terjawab: true, penuh: benarJ === total,
      menunggu: false };
  }
  if (jenis === 'isian') {
    var kunciIs = normalisasiIsian(soal.kunci);
    var okIs = kunciIs !== '' &&
      normalisasiIsian(jawaban) === kunciIs;
    return { skor: okIs ? bobot : 0, terjawab: true, penuh: okIs,
      menunggu: false };
  }
  return { skor: 0, terjawab: false, penuh: false, menunggu: false };
}

/**
 * Hitung hasil akhir dari daftar soal + peta jawaban + skor essay.
 * Nilai = round(skor / totalBobot * 100). Status: 'Menunggu penilaian'
 * bila ada essay terjawab yang belum dinilai; bila sudah final,
 * 'Tuntas' bila nilai >= kkm, else 'Belum Tuntas'.
 * Aturan hitung benar/salah/kosong: 'penuh' -> benar; terjawab tapi tidak
 * penuh -> salah; tidak terjawab -> kosong; essay menunggu -> tidak
 * dihitung di ketiganya (dilacak via essayBelumDinilai).
 */
function hitungHasil(soalList, petaJawaban, petaSkorEssay, kkm) {
  var benar = 0, salah = 0, kosong = 0, skor = 0, totalBobot = 0;
  var essayBelum = 0;
  for (var i = 0; i < soalList.length; i++) {
    var s = soalList[i];
    totalBobot += s.bobot;
    var r = skorSatuSoal(s, petaJawaban[s.id],
      petaSkorEssay ? petaSkorEssay[s.id] : undefined);
    skor += r.skor;
    if (!r.terjawab) { kosong++; continue; }
    if (r.menunggu) { essayBelum++; continue; }
    if (r.penuh) benar++; else salah++;
  }
  skor = Math.round(skor * 100) / 100;
  var nilai = totalBobot > 0 ? Math.round(skor / totalBobot * 100) : 0;
  var nilaiFinal = essayBelum === 0;
  var status = !nilaiFinal ? 'Menunggu penilaian'
    : (nilai >= kkm ? 'Tuntas' : 'Belum Tuntas');
  return { benar: benar, salah: salah, kosong: kosong, skor: skor,
    totalBobot: totalBobot, nilai: nilai, essayBelumDinilai: essayBelum,
    nilaiFinal: nilaiFinal, status: status,
    tuntas: nilaiFinal && nilai >= kkm };
}

// ============================================================
// JAWABAN TERSIMPAN (sheet JawabanSiswa — autosave + resume)
// ============================================================
/**
 * Baca semua jawaban tersimpan untuk satu sesi.
 * Mengembalikan peta soalId -> {jawaban (ter-parse), skorSementara, rowNum}.
 * Hanya SATU kali baca sheet (peta di memori).
 */
function bacaJawabanSesi(ss, sesiId) {
  var sheet = ss.getSheetByName(SHEET_JAWABAN);
  var out = {};
  if (!sheet) return out;
  var rows = readRows(sheet);
  for (var i = 0; i < rows.length; i++) {
    if (asString(rows[i][0]) !== sesiId) continue;
    var sid = asString(rows[i][1]);
    if (!sid) continue;
    var sk = asString(rows[i][3]);
    out[sid] = {
      jawaban: parseJSONLunak(rows[i][2], null),
      skorSementara: sk === '' ? null : Number(sk),
      rowNum: i + 2
    };
  }
  return out;
}

/**
 * Simpan jawaban (batch). `items`: [{soalId, jawaban}]; hanya soal yang
 * ada di `petaSoal` (soal milik sesi ini) yang disimpan.
 * Baris baru ditulis dengan SATU setValues; baris yang sudah ada
 * diperbarui per baris (masih dalam satu eksekusi yang sama).
 * SkorSementara dihitung untuk soal non-essay; essay dibiarkan kosong
 * sampai dinilai manual via nilaiEssay.
 * Mengembalikan jumlah jawaban tersimpan.
 */
function tulisJawabanBatch(ss, sesiId, items, petaSoal) {
  var sheet = getOrCreateSheet(ss, SHEET_JAWABAN);
  var lama = bacaJawabanSesi(ss, sesiId);
  var now = sekarangISODateTime();
  var baru = [];
  var tersimpan = 0;
  for (var i = 0; i < items.length; i++) {
    var soalId = asString(items[i] && items[i].soalId);
    if (!soalId) continue;
    var soal = petaSoal ? petaSoal[soalId] : null;
    if (!soal) continue;
    var jawaban = items[i].jawaban;
    var skorSem = '';
    if (soal.jenis !== 'essay') {
      skorSem = skorSatuSoal(soal, jawaban, null).skor;
    }
    var jwbStr = JSON.stringify(jawaban === undefined ? null : jawaban);
    if (lama[soalId]) {
      sheet.getRange(lama[soalId].rowNum, 3, 1, 3)
        .setValues([[jwbStr, skorSem, now]]);
    } else {
      baru.push([sesiId, soalId, jwbStr, skorSem, now]);
      lama[soalId] = { jawaban: jawaban,
        skorSementara: skorSem === '' ? null : skorSem, rowNum: -1 };
    }
    tersimpan++;
  }
  if (baru.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, baru.length, 5)
      .setValues(baru);
  }
  return tersimpan;
}

// ============================================================
// ANTI-BENTROK JADWAL
// ============================================================
/** Kelas efektif paket: kelasIds bila diisi, else semua kelas di jenjang itu. */
function kelasEfektifPaket(ss, jenjangId, kelasIds) {
  if (Array.isArray(kelasIds) && kelasIds.length > 0) return kelasIds.slice();
  var rows = readRows(ss.getSheetByName(SHEET_KELAS));
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    if (asString(rows[i][1]) === jenjangId) out.push(asString(rows[i][0]));
  }
  return out;
}

/**
 * Cek bentrok jadwal: ada paket AKTIF lain (jenjang sama) yang kelas
 * pesertanya beririsan DAN tanggal mulai-nya sama DAN jamnya bersinggungan.
 * Mengembalikan {id, nama} paket yang bentrok, atau null bila tidak ada.
 * `kecualiId`: ID paket sendiri saat edit (diabaikan).
 */
function cekBentrokJadwal(ss, paketBaru, kecualiId) {
  var mulaiBaru = parseDatetime(paketBaru.mulai);
  var selesaiBaru = parseDatetime(paketBaru.selesai);
  if (!mulaiBaru || !selesaiBaru) return null;
  var tglBaru = asString(paketBaru.mulai).substring(0, 10);
  var kelasBaru = kelasEfektifPaket(ss, paketBaru.jenjangId,
    paketBaru.kelasIds);
  if (kelasBaru.length === 0) return null;
  var rows = readRows(ss.getSheetByName(SHEET_PAKET));
  for (var i = 0; i < rows.length; i++) {
    var idLain = asString(rows[i][0]);
    if (idLain === asString(kecualiId)) continue;
    if (asInt(rows[i][15], 1) !== 1) continue; // hanya paket aktif
    if (asString(rows[i][2]) !== paketBaru.jenjangId) continue;
    var tglLain = selKeString(rows[i][9]).substring(0, 10);
    if (tglLain !== tglBaru) continue;
    var dMulai = parseDatetime(selKeString(rows[i][9]));
    var dSelesai = parseDatetime(selKeString(rows[i][10]));
    if (!dMulai || !dSelesai) continue;
    if (!(mulaiBaru.getTime() < dSelesai.getTime() &&
        selesaiBaru.getTime() > dMulai.getTime())) continue;
    var kelasLain = kelasEfektifPaket(ss, asString(rows[i][2]),
      parseJSONLunak(rows[i][4], []));
    for (var k = 0; k < kelasBaru.length; k++) {
      if (kelasLain.indexOf(kelasBaru[k]) >= 0) {
        return { id: idLain, nama: asString(rows[i][1]) };
      }
    }
  }
  return null;
}

// ============================================================
// SESI UJIAN
// ============================================================
/** Ambil baris paket sebagai objek; null jika tidak ada. */
function ambilPaket(ss, paketId) {
  var r = cariBarisById(ss, SHEET_PAKET, paketId);
  if (!r) return null;
  var soalIds = parseJSONLunak(r[6], []);
  if (!Array.isArray(soalIds)) soalIds = [];
  var kelasIds = parseJSONLunak(r[4], []);
  if (!Array.isArray(kelasIds)) kelasIds = [];
  return {
    id: asString(r[0]), nama: asString(r[1]),
    jenjangId: asString(r[2]), mapelId: asString(r[3]),
    kelasIds: kelasIds, modeSoal: asString(r[5]), soalIds: soalIds,
    jumlahAcak: asInt(r[7], 0), durasiMenit: asInt(r[8], 60),
    mulai: selKeString(r[9]), selesai: selKeString(r[10]),
    acakSoal: asInt(r[11], 1), acakOpsi: asInt(r[12], 1),
    tampilSkor: asInt(r[13], 1), tampilPembahasan: asInt(r[14], 1),
    aktif: asInt(r[15], 1),
    dibuatOleh: asString(r[17]),
    token: asString(r[18]),
    jedaGelombang: asInt(r[19], 3)
  };
}

/**
 * Susun daftar soal untuk dikirim ke klien dari snapshot SoalIDsJSON.
 * TIDAK PERNAH menyertakan kunci/pembahasan.
 * Bentuk per jenis:
 *  - pg/pgk: {id, teks, gambarUrl, jenis, tingkat, opsi:[{kode, teks}]}
 *    (`kode` = kode asli (A-E) agar penilaian server tetap cocok;
 *    opsi diacak bila acakOpsi=1, kode ikut terbawa.)
 *  - bs: opsi = [{kode:'Benar'},{kode:'Salah'}].
 *  - jodoh: {pasanganKiri:[...], pasanganKanan:[...]} (urutan kanan TIDAK
 *    diacak — kunci menyimpan indeks kanan asli).
 *  - isian/essay: opsi kosong, jawaban berupa teks bebas.
 */

/** ID soal bank pada jenjang+mapel tertentu. */
function soalIdsBank(ss, jenjangId, mapelId) {
  var rows = readRows(ss.getSheetByName(SHEET_BANKSOAL));
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    if (asString(rows[i][1]) === jenjangId && asString(rows[i][2]) === mapelId) {
      out.push(asString(rows[i][0]));
    }
  }
  return out;
}

/**
 * Susun daftar soal untuk dikirim ke klien dari snapshot SoalIDsJSON.
 * TIDAK PERNAH menyertakan kunci/pembahasan.
 * Bentuk: [{id, teks, gambarUrl, opsi:[{kode, teks}]}].
 * `kode` = kode asli (A-E) agar penilaian server tetap cocok.
 */
function susunSoalUntukKlien(ss, soalIds, acakOpsi) {
  var bank = readRows(ss.getSheetByName(SHEET_BANKSOAL));
  var peta = {};
  for (var i = 0; i < bank.length; i++) {
    peta[asString(bank[i][0])] = parseSoalBankRow(bank[i]);
  }
  var out = [];
  for (var s = 0; s < soalIds.length; s++) {
    var soal = peta[asString(soalIds[s])];
    if (!soal) continue; // soal dihapus setelah sesi dibuat -> lewati
    var item = {
      id: soal.id,
      teks: soal.soal,
      gambarUrl: soal.gambarUrl,
      jenis: soal.jenis,
      tingkat: soal.tingkat,
      opsi: []
    };
    if (soal.jenis === 'pg' || soal.jenis === 'pgk') {
      var opsi = [];
      for (var o = 0; o < soal.opsi.length; o++) {
        opsi.push({ kode: KUNCI_VALID[o], teks: soal.opsi[o] });
      }
      if (acakOpsi === 1) opsi = acakArray(opsi);
      item.opsi = opsi;
    } else if (soal.jenis === 'bs') {
      item.opsi = [{ kode: 'Benar', teks: 'Benar' },
        { kode: 'Salah', teks: 'Salah' }];
    } else if (soal.jenis === 'jodoh') {
      item.pasanganKiri = soal.kiri.slice();
      item.pasanganKanan = soal.kanan.slice();
    }
    // isian & essay: opsi kosong, jawaban berupa teks bebas
    out.push(item);
  }
  return out;
}

/** Cari semua sesi milik username pada paketId, urut terbaru dulu. */
function cariSesiUser(ss, username, paketId) {
  var rows = readRows(ss.getSheetByName(SHEET_SESI));
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    if (asString(rows[i][1]) === paketId && asString(rows[i][2]) === username) {
      out.push({ rowNum: i + 2, row: rows[i] });
    }
  }
  // Terbaru dulu (DibuatPada format sebanding; tie -> baris lebih bawah menang)
  out.sort(function (a, b) {
    var da = selKeString(a.row[8]);
    var db = selKeString(b.row[8]);
    if (db !== da) return db < da ? -1 : 1;
    return b.rowNum - a.rowNum;
  });
  return out;
}

function sesiRingkas(row) {
  return {
    id: asString(row[0]),
    paketId: asString(row[1]),
    waktuMulai: selKeString(row[3]),
    waktuSelesai: selKeString(row[4]),
    status: asString(row[5]),
    peringatan: asInt(row[6], 0)
  };
}

function actionMulaiSesi(ss, user, p) {
  try {
    var paketId = asString(p.paketId);
    if (!paketId) return { success: false, message: 'ID paket wajib diisi.' };
    var paket = ambilPaket(ss, paketId);
    if (!paket) return { success: false, message: 'Paket tidak ditemukan.' };
    if (paket.aktif !== 1) {
      return { success: false, message: 'Paket tidak aktif.' };
    }
    var now = sekarangISODateTime();
    if (!(paket.mulai <= now && now <= paket.selesai)) {
      return { success: false, message: 'Paket belum dibuka atau sudah ditutup.' };
    }
    // Eligibility: jenjang cocok; kelas dibatasi -> kelas siswa harus termasuk
    if (user.jenjangId !== paket.jenjangId) {
      return { success: false, message: 'Paket ini tidak tersedia untuk jenjang Anda.' };
    }
    if (paket.kelasIds.length > 0 && paket.kelasIds.indexOf(user.kelasId) < 0) {
      return { success: false, message: 'Paket ini tidak tersedia untuk kelas Anda.' };
    }
    // Token ujian STATIS: bila paket punya token, token wajib cocok.
    // Field request: `tokenUjian` (bukan `token` — itu token sesi login).
    if (paket.token && asString(p.tokenUjian) !== paket.token) {
      return { success: false, message: 'Token ujian salah. Periksa kembali token dari guru Anda.' };
    }

    // Sesi existing: idempotent
    var sesiAda = cariSesiUser(ss, user.username, paketId);
    for (var e = 0; e < sesiAda.length; e++) {
      var st = asString(sesiAda[e].row[5]);
      if (st === 'AKTIF') {
        // Kembalikan sesi AKTIF yang sudah ada — soal yang SAMA + jawaban
        // autosave yang tersimpan (resume: tutup tab/reload = JEDA).
        var soalIdsAktif = parseJSONLunak(sesiAda[e].row[7], []);
        var jwbLama = bacaJawabanSesi(ss, asString(sesiAda[e].row[0]));
        var jwbArr = [];
        for (var sid in jwbLama) {
          if (jwbLama.hasOwnProperty(sid)) {
            jwbArr.push({ soalId: sid, jawaban: jwbLama[sid].jawaban });
          }
        }
        return {
          success: true,
          message: 'Sesi aktif ditemukan, melanjutkan.',
          data: {
            sesi: sesiRingkas(sesiAda[e].row),
            soal: susunSoalUntukKlien(ss, soalIdsAktif, paket.acakOpsi),
            jawaban: jwbArr
          }
        };
      }
    }
    if (sesiAda.length > 0) {
      var terakhir = asString(sesiAda[0].row[5]);
      if (terakhir === 'SELESAI') {
        return { success: false, message: 'Anda sudah mengerjakan paket ini.' };
      }
      // BATAL
      var settings = getSettings(ss);
      if (settings.izinkanUlangSetelahBatal !== 1) {
        return { success: false, message: 'Sesi Anda dibatalkan. Hubungi guru/admin untuk mengulang.' };
      }
      // boleh buat sesi baru
    }

    // Pilih soal
    var soalIdsBaru;
    if (paket.modeSoal === 'manual') {
      soalIdsBaru = paket.soalIds.slice();
    } else {
      var bank = soalIdsBank(ss, paket.jenjangId, paket.mapelId);
      if (bank.length < paket.jumlahAcak) {
        return { success: false, message: 'Soal di bank tidak mencukupi (' + bank.length + ' tersedia).' };
      }
      soalIdsBaru = acakArray(bank).slice(0, paket.jumlahAcak);
    }
    if (paket.acakSoal === 1) soalIdsBaru = acakArray(soalIdsBaru);
    if (soalIdsBaru.length < 1) {
      return { success: false, message: 'Paket ini belum memiliki soal.' };
    }

    var waktuMulai = sekarangISODateTime();
    var dMulai = parseDatetime(waktuMulai);
    var waktuSelesai = formatDatetime(tambahMenit(dMulai, paket.durasiMenit));
    var sesiId = Utilities.getUuid();
    var sheet = ss.getSheetByName(SHEET_SESI);
    sheet.appendRow([sesiId, paketId, user.username, waktuMulai, waktuSelesai,
      'AKTIF', 0, JSON.stringify(soalIdsBaru), waktuMulai]);
    catatLog(ss, user.username, sesiId, 'mulai-sesi', 'Paket: ' + paket.nama);

    return {
      success: true,
      message: 'Sesi ujian dimulai. Selamat mengerjakan!',
      data: {
        sesi: {
          id: sesiId, paketId: paketId, waktuMulai: waktuMulai,
          waktuSelesai: waktuSelesai, status: 'AKTIF', peringatan: 0
        },
        soal: susunSoalUntukKlien(ss, soalIdsBaru, paket.acakOpsi),
        jawaban: []
      }
    };
  } catch (err) {
    return { success: false, error: 'mulaiSesi: ' + err.message };
  }
}


function actionGetSesi(ss, user, p) {
  try {
    var sesiId = asString(p.sesiId);
    if (!sesiId) return { success: false, message: 'ID sesi wajib diisi.' };
    var row = cariBarisById(ss, SHEET_SESI, sesiId);
    if (!row) return { success: false, message: 'Sesi tidak ditemukan.' };
    // Milik sendiri, atau guru/admin boleh melihat sesi siapa pun
    if (user.peran === 'siswa' && asString(row[2]) !== user.username) {
      return { success: false, message: 'Sesi tidak ditemukan.' };
    }
    var paket = ambilPaket(ss, asString(row[1]));
    var status = asString(row[5]);
    var soal = [];
    if (status === 'AKTIF') {
      var soalIds = parseJSONLunak(row[7], []);
      soal = susunSoalUntukKlien(ss, soalIds, paket ? paket.acakOpsi : 1);
    }
    // Jawaban autosave + sisa waktu (untuk resume setelah reload).
    var tersimpan = bacaJawabanSesi(ss, sesiId);
    var jawaban = [];
    for (var sid in tersimpan) {
      if (tersimpan.hasOwnProperty(sid)) {
        jawaban.push({ soalId: sid, jawaban: tersimpan[sid].jawaban,
          skorSementara: tersimpan[sid].skorSementara });
      }
    }
    var sisaDetik = 0;
    var dSelesai = parseDatetime(selKeString(row[4]));
    if (dSelesai) {
      sisaDetik = Math.max(0,
        Math.floor((dSelesai.getTime() - Date.now()) / 1000));
    }
    return {
      success: true,
      data: { sesi: sesiRingkas(row), soal: soal, jawaban: jawaban,
        sisaDetik: sisaDetik }
    };
  } catch (err) {
    return { success: false, error: 'getSesi: ' + err.message };
  }
}


function actionBatalkanSesi(ss, user, p) {
  try {
    var sesiId = asString(p.sesiId);
    var alasan = asString(p.alasan);
    if (!sesiId) return { success: false, message: 'ID sesi wajib diisi.' };
    var sheet = ss.getSheetByName(SHEET_SESI);
    var rowNum = findRowNum(sheet, 1, sesiId);
    if (rowNum < 0) return { success: false, message: 'Sesi tidak ditemukan.' };
    var row = sheet.getRange(rowNum, 1, 1, sheet.getLastColumn()).getValues()[0];
    // Milik sendiri, atau guru/admin untuk sesi siapa pun
    if (user.peran === 'siswa' && asString(row[2]) !== user.username) {
      return { success: false, message: 'Sesi tidak ditemukan.' };
    }
    var status = asString(row[5]);
    if (status === 'AKTIF') {
      sheet.getRange(rowNum, 6).setValue('BATAL');
      catatLog(ss, user.username, sesiId, 'batal-sesi',
        'Dibatalkan oleh ' + user.username + (alasan ? ' — ' + alasan : ''));
      status = 'BATAL';
    }
    // SELESAI/BATAL -> tetap sukses (idempotent). Jawaban autosave di
    // sheet JawabanSiswa TIDAK dihapus (tetap bisa dilihat guru; reset
    // sesi via resetSesi yang menghapusnya bila siswa mengulang).
    return {
      success: true,
      message: 'Sesi dibatalkan.',
      data: { status: status }
    };
  } catch (err) {
    return { success: false, error: 'batalkanSesi: ' + err.message };
  }
}

function actionCatatPeringatan(ss, user, p) {
  try {
    var sesiId = asString(p.sesiId);
    var jenis = asString(p.jenis) || 'peringatan';
    if (!sesiId) return { success: false, message: 'ID sesi wajib diisi.' };
    var sheet = ss.getSheetByName(SHEET_SESI);
    var rowNum = findRowNum(sheet, 1, sesiId);
    if (rowNum < 0) return { success: false, message: 'Sesi tidak ditemukan.' };
    var row = sheet.getRange(rowNum, 1, 1, sheet.getLastColumn()).getValues()[0];
    // Hanya milik sendiri
    if (asString(row[2]) !== user.username) {
      return { success: false, message: 'Sesi tidak ditemukan.' };
    }
    if (asString(row[5]) !== 'AKTIF') {
      return { success: false, message: 'Sesi tidak aktif.' };
    }
    var settings = getSettings(ss);
    var ambang = settings.ambangPeringatan;
    if (!(ambang >= 1)) ambang = 3;
    var peringatan = asInt(row[6], 0) + 1;
    sheet.getRange(rowNum, 7).setValue(peringatan);
    catatLog(ss, user.username, sesiId, 'peringatan', jenis + ' ke-' + peringatan);
    var dibatalkan = false;
    if (peringatan >= ambang) {
      sheet.getRange(rowNum, 6).setValue('BATAL');
      catatLog(ss, user.username, sesiId, 'peringatan-batas',
        'Mencapai ambang ' + ambang + ' — sesi dibatalkan otomatis.');
      dibatalkan = true;
    }
    return {
      success: true,
      data: { peringatan: peringatan, dibatalkan: dibatalkan }
    };
  } catch (err) {
    return { success: false, error: 'catatPeringatan: ' + err.message };
  }
}

function actionSubmitJawaban(ss, user, p) {
  try {
    var sesiId = asString(p.sesiId);
    if (!sesiId) return { success: false, message: 'ID sesi wajib diisi.' };
    var sheet = ss.getSheetByName(SHEET_SESI);
    var rowNum = findRowNum(sheet, 1, sesiId);
    if (rowNum < 0) return { success: false, message: 'Sesi tidak ditemukan.' };
    var row = sheet.getRange(rowNum, 1, 1, sheet.getLastColumn()).getValues()[0];
    // Hanya milik sendiri
    if (asString(row[2]) !== user.username) {
      return { success: false, message: 'Sesi tidak ditemukan.' };
    }
    var status = asString(row[5]);
    var sheetHasil = ss.getSheetByName(SHEET_HASIL);

    // Idempotent: sesi SELESAI -> kembalikan hasil yang sudah ada
    if (status === 'SELESAI') {
      var rnLama = findRowNum(sheetHasil, 2, sesiId);
      if (rnLama > 0) {
        var rl = sheetHasil.getRange(rnLama, 1, 1, sheetHasil.getLastColumn()).getValues()[0];
        return { success: true, data: { hasil: hasilSubmitKeObjek(rl, getSettings(ss).kkm) } };
      }
    }
    if (status !== 'AKTIF') {
      return { success: false, message: 'Sesi tidak aktif.' };
    }

    var paketId = asString(row[1]);
    var soalIds = parseJSONLunak(row[7], []);
    if (!Array.isArray(soalIds)) soalIds = [];

    // Peta soal lengkap (6 jenis) — baca BankSoal SEKALI.
    var bank = readRows(ss.getSheetByName(SHEET_BANKSOAL));
    var petaSoal = {};
    for (var i = 0; i < bank.length; i++) {
      var ps = parseSoalBankRow(bank[i]);
      petaSoal[ps.id] = ps;
    }
    var soalList = [];
    for (var s = 0; s < soalIds.length; s++) {
      if (petaSoal[asString(soalIds[s])]) soalList.push(petaSoal[asString(soalIds[s])]);
    }

    // Gabung jawaban: autosave (JawabanSiswa) + kiriman saat submit (menang).
    var tersimpan = bacaJawabanSesi(ss, sesiId);
    var petaJawaban = {};
    var petaSkorEssay = {};
    for (var sid in tersimpan) {
      if (!tersimpan.hasOwnProperty(sid)) continue;
      petaJawaban[sid] = tersimpan[sid].jawaban;
      if (tersimpan[sid].skorSementara !== null &&
          tersimpan[sid].skorSementara !== undefined) {
        petaSkorEssay[sid] = tersimpan[sid].skorSementara;
      }
    }
    var jawabanKirim = p.jawaban;
    if (!Array.isArray(jawabanKirim)) jawabanKirim = [];
    var jawabanGabung = [];
    for (var j = 0; j < jawabanKirim.length; j++) {
      var jsid = asString(jawabanKirim[j] && jawabanKirim[j].soalId);
      if (!jsid) continue;
      if (soalIds.indexOf(jsid) < 0) continue; // hanya soal milik sesi ini
      petaJawaban[jsid] = jawabanKirim[j].jawaban;
      jawabanGabung.push({ soalId: jsid, jawaban: jawabanKirim[j].jawaban });
    }
    // Simpan jawaban kiriman ke JawabanSiswa (agar essay bisa dinilai
    // belakangan dan jawaban tidak hilang bila submit ter-retry).
    if (jawabanGabung.length > 0) {
      tulisJawabanBatch(ss, sesiId, jawabanGabung, petaSoal);
    }

    // PENILAIAN DIHITUNG DI SERVER (6 jenis soal — lihat hitungHasil).
    var settings = getSettings(ss);
    var h = hitungHasil(soalList, petaJawaban, petaSkorEssay, settings.kkm);
    var waktuSubmit = sekarangISODateTime();

    // Nama & kelas siswa dari akun
    var peta = bangunPeta(ss);
    var pg = peta.pengguna[user.username] || {};
    var namaSiswa = user.nama;
    var kelas = peta.kelas[pg.kelasId] || '';

    // JawabanJSON final: gabungan autosave + kiriman, seurutan snapshot soal.
    var jawabanFinal = [];
    for (var f = 0; f < soalIds.length; f++) {
      var fsid = asString(soalIds[f]);
      if (petaJawaban[fsid] !== undefined) {
        jawabanFinal.push({ soalId: fsid, jawaban: petaJawaban[fsid] });
      }
    }

    var hasilId = Utilities.getUuid();
    sheetHasil.appendRow([hasilId, sesiId, paketId, user.username, namaSiswa,
      kelas, JSON.stringify(jawabanFinal), h.benar, h.salah, h.kosong, h.skor,
      h.totalBobot, h.nilai, waktuSubmit, h.status, h.essayBelumDinilai]);
    sheet.getRange(rowNum, 6).setValue('SELESAI');
    catatLog(ss, user.username, sesiId, 'submit',
      'Nilai ' + h.nilai + ' (' + h.status + '; benar ' + h.benar +
      ', salah ' + h.salah + ', kosong ' + h.kosong + ')');

    var rBaru = sheetHasil.getRange(
      findRowNum(sheetHasil, 1, hasilId), 1, 1, sheetHasil.getLastColumn()
    ).getValues()[0];
    return {
      success: true,
      message: 'Jawaban berhasil disubmit. Nilai: ' + h.nilai +
        (h.nilaiFinal ? '.' : ' (menunggu penilaian essay).'),
      data: { hasil: hasilSubmitKeObjek(rBaru, settings.kkm) }
    };
  } catch (err) {
    return { success: false, error: 'submitJawaban: ' + err.message };
  }
}


function hasilSubmitKeObjek(r, kkm) {
  var nilai = asInt(r[12], 0);
  var essayBelum = asInt(r[15], 0);
  var ambang = (kkm === undefined || kkm === null) ? 75 : kkm;
  var status = asString(r[14]) ||
    (essayBelum > 0 ? 'Menunggu penilaian'
      : (nilai >= ambang ? 'Tuntas' : 'Belum Tuntas'));
  return {
    id: asString(r[0]),
    benar: asInt(r[7], 0), salah: asInt(r[8], 0), kosong: asInt(r[9], 0),
    skor: asFloat(r[10], 0), totalBobot: asFloat(r[11], 0),
    nilai: nilai, waktuSubmit: selKeString(r[13]),
    status: status, essayBelumDinilai: essayBelum,
    nilaiFinal: essayBelum === 0,
    tuntas: essayBelum === 0 && nilai >= ambang
  };
}

function actionResetSesi(ss, user, p) {
  try {
    var username = asString(p.username);
    var paketId = asString(p.paketId);
    if (!username) return { success: false, message: 'Username wajib diisi.' };
    if (!paketId) return { success: false, message: 'ID paket wajib diisi.' };

    var sheetSesi = ss.getSheetByName(SHEET_SESI);
    var rowsSesi = readRows(sheetSesi);
    var hapusSesi = [];
    var sesiIds = [];
    for (var i = 0; i < rowsSesi.length; i++) {
      if (asString(rowsSesi[i][1]) === paketId && asString(rowsSesi[i][2]) === username) {
        hapusSesi.push(i + 2);
        sesiIds.push(asString(rowsSesi[i][0]));
      }
    }
    var sheetHasil = ss.getSheetByName(SHEET_HASIL);
    var rowsHasil = readRows(sheetHasil);
    var hapusHasil = [];
    for (var j = 0; j < rowsHasil.length; j++) {
      if (asString(rowsHasil[j][2]) === paketId && asString(rowsHasil[j][3]) === username) {
        hapusHasil.push(j + 2);
      }
    }
    // Hapus juga jawaban autosave milik sesi-sesi tersebut.
    var sheetJawaban = ss.getSheetByName(SHEET_JAWABAN);
    var hapusJawaban = [];
    if (sheetJawaban) {
      var rowsJawaban = readRows(sheetJawaban);
      for (var k = 0; k < rowsJawaban.length; k++) {
        if (sesiIds.indexOf(asString(rowsJawaban[k][0])) >= 0) {
          hapusJawaban.push(k + 2);
        }
      }
    }
    hapusBarisList(sheetSesi, hapusSesi);
    hapusBarisList(sheetHasil, hapusHasil);
    if (sheetJawaban) hapusBarisList(sheetJawaban, hapusJawaban);
    catatLog(ss, user.username, '', 'reset-sesi',
      'Reset sesi ' + username + ' pada paket ' + paketId +
      ' (' + hapusSesi.length + ' sesi, ' + hapusHasil.length +
      ' hasil, ' + hapusJawaban.length + ' jawaban dihapus)');

    return {
      success: true,
      message: 'Sesi berhasil direset.',
      data: { sesiDihapus: hapusSesi.length, hasilDihapus: hapusHasil.length,
        jawabanDihapus: hapusJawaban.length }
    };
  } catch (err) {
    return { success: false, error: 'resetSesi: ' + err.message };
  }
}

/**
 * Rincian per soal untuk getHasilSiswa (hanya bila paket tampilPembahasan=1
 * dan sesi SELESAI): [{soalId, teks, jenis, opsi, kunci, pembahasan,
 * jawabanSiswa, benar, skor, bobot, menungguPenilaian}] — untuk jodoh
 * ditambah pasanganKiri/pasanganKanan/kunciPasangan.
 */

// ============================================================
// TOKEN UJIAN, AUTOSAVE, & PENILAIAN ESSAY (v1.0.0)
// ============================================================
/**
 * verifikasiToken 🔒 siswa — cek token ujian STATIS + kelayakan paket
 * TANPA membuat sesi. Dipakai halaman petunjuk sebelum tombol mulai.
 * Token BUKAN token berputar: satu token tetap per ujian, diatur
 * guru/admin di Paket.
 */
function actionVerifikasiToken(ss, user, p) {
  try {
    var paketId = asString(p.paketId);
    if (!paketId) return { success: false, message: 'ID paket wajib diisi.' };
    var paket = ambilPaket(ss, paketId);
    if (!paket) return { success: false, message: 'Paket tidak ditemukan.' };
    if (paket.aktif !== 1) {
      return { success: false, message: 'Paket tidak aktif.' };
    }
    var now = sekarangISODateTime();
    if (!(paket.mulai <= now && now <= paket.selesai)) {
      return { success: false, message: 'Paket belum dibuka atau sudah ditutup.' };
    }
    if (user.jenjangId !== paket.jenjangId) {
      return { success: false, message: 'Paket ini tidak tersedia untuk jenjang Anda.' };
    }
    if (paket.kelasIds.length > 0 && paket.kelasIds.indexOf(user.kelasId) < 0) {
      return { success: false, message: 'Paket ini tidak tersedia untuk kelas Anda.' };
    }
    if (paket.token && asString(p.tokenUjian) !== paket.token) {
      return { success: false, message: 'Token ujian salah. Periksa kembali token dari guru Anda.' };
    }
    return {
      success: true,
      message: 'Token valid. Silakan mulai ujian.',
      data: {
        valid: true,
        paket: {
          id: paket.id, nama: paket.nama, durasiMenit: paket.durasiMenit,
          mulai: paket.mulai, selesai: paket.selesai,
          jedaGelombang: paket.jedaGelombang
        }
      }
    };
  } catch (err) {
    return { success: false, error: 'verifikasiToken: ' + err.message };
  }
}

/**
 * simpanJawaban 🔒 siswa — autosave jawaban ke sheet JawabanSiswa.
 * Terima ARRAY jawaban sekaligus (batch, satu tulis setValues untuk
 * baris baru). Hanya untuk sesi AKTIF milik sendiri dan hanya soal
 * milik sesi itu. Tutup tab/reload = JEDA: jawaban tetap tersimpan dan
 * sesi tetap AKTIF sampai waktu habis / submit / dibatalkan manual.
 */
function actionSimpanJawaban(ss, user, p) {
  try {
    var sesiId = asString(p.sesiId);
    if (!sesiId) return { success: false, message: 'ID sesi wajib diisi.' };
    var sheet = ss.getSheetByName(SHEET_SESI);
    var rowNum = findRowNum(sheet, 1, sesiId);
    if (rowNum < 0) return { success: false, message: 'Sesi tidak ditemukan.' };
    var row = sheet.getRange(rowNum, 1, 1, sheet.getLastColumn()).getValues()[0];
    if (asString(row[2]) !== user.username) {
      return { success: false, message: 'Sesi tidak ditemukan.' };
    }
    if (asString(row[5]) !== 'AKTIF') {
      return { success: false, message: 'Sesi tidak aktif.' };
    }
    var soalIds = parseJSONLunak(row[7], []);
    if (!Array.isArray(soalIds)) soalIds = [];
    var jawaban = p.jawaban;
    if (!Array.isArray(jawaban) || jawaban.length === 0) {
      return { success: false, message: 'Daftar jawaban kosong.' };
    }
    var bank = readRows(ss.getSheetByName(SHEET_BANKSOAL));
    var petaSoal = {};
    for (var i = 0; i < bank.length; i++) {
      var ps = parseSoalBankRow(bank[i]);
      if (soalIds.indexOf(ps.id) >= 0) petaSoal[ps.id] = ps;
    }
    var items = [];
    for (var j = 0; j < jawaban.length; j++) {
      var sid = asString(jawaban[j] && jawaban[j].soalId);
      if (!sid || !petaSoal[sid]) continue; // hanya soal milik sesi ini
      items.push({ soalId: sid, jawaban: jawaban[j].jawaban });
    }
    if (items.length === 0) {
      return { success: false, message: 'Tidak ada jawaban valid untuk sesi ini.' };
    }
    var n = tulisJawabanBatch(ss, sesiId, items, petaSoal);
    return {
      success: true,
      message: 'Jawaban tersimpan.',
      data: { sesiId: sesiId, tersimpan: n }
    };
  } catch (err) {
    return { success: false, error: 'simpanJawaban: ' + err.message };
  }
}

/**
 * getJawabanSesi 🔒 siswa — kembalikan jawaban autosave + waktu mulai
 * server + sisa waktu (detik) untuk resume. Siswa hanya sesi miliknya;
 * guru/admin boleh melihat sesi siapa pun.
 */
function actionGetJawabanSesi(ss, user, p) {
  try {
    var sesiId = asString(p.sesiId);
    if (!sesiId) return { success: false, message: 'ID sesi wajib diisi.' };
    var row = cariBarisById(ss, SHEET_SESI, sesiId);
    if (!row) return { success: false, message: 'Sesi tidak ditemukan.' };
    if (user.peran === 'siswa' && asString(row[2]) !== user.username) {
      return { success: false, message: 'Sesi tidak ditemukan.' };
    }
    var tersimpan = bacaJawabanSesi(ss, sesiId);
    var jawaban = [];
    for (var sid in tersimpan) {
      if (tersimpan.hasOwnProperty(sid)) {
        jawaban.push({ soalId: sid, jawaban: tersimpan[sid].jawaban,
          skorSementara: tersimpan[sid].skorSementara });
      }
    }
    var sisaDetik = 0;
    var dSelesai = parseDatetime(selKeString(row[4]));
    if (dSelesai) {
      sisaDetik = Math.max(0,
        Math.floor((dSelesai.getTime() - Date.now()) / 1000));
    }
    return {
      success: true,
      data: {
        sesi: sesiRingkas(row),
        jawaban: jawaban,
        sisaDetik: sisaDetik,
        waktuMulai: selKeString(row[3]),
        waktuSelesai: selKeString(row[4])
      }
    };
  } catch (err) {
    return { success: false, error: 'getJawabanSesi: ' + err.message };
  }
}

/**
 * nilaiEssay 🔒 guru — nilai SATU soal essay secara manual.
 * Request: {hasilId (atau sesiId), soalId, skor}.
 * Validasi: 0 <= skor <= bobot soal; soal harus essay & sudah dijawab.
 * Hanya admin, atau guru pembuat paket (DibuatOleh), yang boleh menilai
 * — tidak ada pemetaan guru-mapel di data pengguna, jadi "pengampu"
 * diartikan sebagai guru pembuat paket ujian tersebut.
 * Menyimpan skor ke JawabanSiswa lalu MENGHITUNG ULANG nilai akhir
 * (skor, nilai, status Tuntas/Belum Tuntas/Menunggu penilaian).
 */
function actionNilaiEssay(ss, user, p) {
  try {
    var hasilId = asString(p.hasilId);
    var sesiId = asString(p.sesiId);
    var soalId = asString(p.soalId);
    var skor = p.skor;
    if (!soalId) return { success: false, message: 'ID soal wajib diisi.' };
    if (skor === undefined || skor === null || skor === '') {
      return { success: false, message: 'Skor essay wajib diisi.' };
    }
    skor = Number(skor);
    if (isNaN(skor)) {
      return { success: false, message: 'Skor essay harus angka.' };
    }
    var sheetHasil = ss.getSheetByName(SHEET_HASIL);
    var rowNum = -1;
    if (hasilId) rowNum = findRowNum(sheetHasil, 1, hasilId);
    else if (sesiId) rowNum = findRowNum(sheetHasil, 2, sesiId);
    else {
      return { success: false, message: 'hasilId atau sesiId wajib diisi.' };
    }
    if (rowNum < 0) return { success: false, message: 'Hasil tidak ditemukan.' };
    var rh = sheetHasil.getRange(rowNum, 1, 1, sheetHasil.getLastColumn()).getValues()[0];
    var paket = ambilPaket(ss, asString(rh[2]));
    if (!paket) return { success: false, message: 'Paket tidak ditemukan.' };
    if (user.peran === 'guru' && paket.dibuatOleh !== user.username) {
      return { success: false, message: 'Hanya guru pengampu (pembuat paket) atau admin yang boleh menilai essay.' };
    }

    var bank = readRows(ss.getSheetByName(SHEET_BANKSOAL));
    var petaSoal = {};
    var soal = null;
    for (var i = 0; i < bank.length; i++) {
      var ps = parseSoalBankRow(bank[i]);
      petaSoal[ps.id] = ps;
      if (ps.id === soalId) soal = ps;
    }
    if (!soal) return { success: false, message: 'Soal tidak ditemukan.' };
    if (soal.jenis !== 'essay') {
      return { success: false, message: 'Soal ini bukan essay (jenis: ' + soal.jenis + ').' };
    }
    if (!(skor >= 0 && skor <= soal.bobot)) {
      return { success: false, message: 'Skor essay harus 0 sampai ' + soal.bobot + ' (bobot soal).' };
    }

    var sesiIdHasil = asString(rh[1]);
    var jwbFinal = parseJSONLunak(rh[6], []);
    var petaJawaban = {};
    if (Array.isArray(jwbFinal)) {
      for (var f = 0; f < jwbFinal.length; f++) {
        var fsid = asString(jwbFinal[f] && jwbFinal[f].soalId);
        if (fsid) petaJawaban[fsid] = jwbFinal[f].jawaban;
      }
    }
    var tersimpan = bacaJawabanSesi(ss, sesiIdHasil);
    var adaJawaban = false;
    if (tersimpan[soalId] && tersimpan[soalId].jawaban !== null &&
        tersimpan[soalId].jawaban !== undefined &&
        asString(tersimpan[soalId].jawaban) !== '') {
      adaJawaban = true;
    } else if (petaJawaban[soalId] !== undefined &&
        petaJawaban[soalId] !== null &&
        asString(petaJawaban[soalId]) !== '') {
      adaJawaban = true;
    }
    if (!adaJawaban) {
      return { success: false, message: 'Soal essay ini belum dijawab siswa.' };
    }

    // Simpan skor essay ke JawabanSiswa (kolom SkorSementara).
    var sheetJawaban = getOrCreateSheet(ss, SHEET_JAWABAN);
    if (tersimpan[soalId]) {
      sheetJawaban.getRange(tersimpan[soalId].rowNum, 4).setValue(skor);
      sheetJawaban.getRange(tersimpan[soalId].rowNum, 5)
        .setValue(sekarangISODateTime());
    } else {
      sheetJawaban.appendRow([sesiIdHasil, soalId,
        JSON.stringify(petaJawaban[soalId]), skor, sekarangISODateTime()]);
    }

    // Hitung ulang nilai akhir dari JawabanJSON + skor essay terbaru.
    var sesiRow = cariBarisById(ss, SHEET_SESI, sesiIdHasil);
    var soalIds = sesiRow ? parseJSONLunak(sesiRow[7], []) : [];
    if (!Array.isArray(soalIds)) soalIds = [];
    var soalList = [];
    for (var s = 0; s < soalIds.length; s++) {
      if (petaSoal[asString(soalIds[s])]) {
        soalList.push(petaSoal[asString(soalIds[s])]);
      }
    }
    var skorEssayMap = {};
    var sesudah = bacaJawabanSesi(ss, sesiIdHasil);
    for (var k2 in sesudah) {
      if (sesudah.hasOwnProperty(k2) &&
          sesudah[k2].skorSementara !== null) {
        skorEssayMap[k2] = sesudah[k2].skorSementara;
      }
    }
    var settings = getSettings(ss);
    var h = hitungHasil(soalList, petaJawaban, skorEssayMap, settings.kkm);
    sheetHasil.getRange(rowNum, 8, 1, 9).setValues([[
      h.benar, h.salah, h.kosong, h.skor, h.totalBobot, h.nilai,
      selKeString(rh[13]), h.status, h.essayBelumDinilai
    ]]);
    catatLog(ss, user.username, sesiIdHasil, 'nilai-essay',
      'Essay ' + soalId + ' dinilai ' + skor + '/' + soal.bobot +
      ' — nilai akhir ' + h.nilai + ' (' + h.status + ')');

    var rBaru = sheetHasil.getRange(rowNum, 1, 1,
      sheetHasil.getLastColumn()).getValues()[0];
    return {
      success: true,
      message: 'Essay berhasil dinilai. Nilai akhir: ' + h.nilai +
        ' (' + h.status + ').',
      data: { hasil: hasilSubmitKeObjek(rBaru, settings.kkm) }
    };
  } catch (err) {
    return { success: false, error: 'nilaiEssay: ' + err.message };
  }
}
// ============================================================
// HASIL & MONITOR
// ============================================================
function actionRekapHasil(ss, p) {
  try {
    var paketId = asString(p.paketId);
    if (!paketId) return { success: false, message: 'ID paket wajib diisi.' };
    var paket = ambilPaket(ss, paketId);
    if (!paket) return { success: false, message: 'Paket tidak ditemukan.' };
    var peta = bangunPeta(ss);

    var defaultTotal = paket.modeSoal === 'manual'
      ? paket.soalIds.length : paket.jumlahAcak;

    // Sesi per username (terbaru)
    var rowsSesi = readRows(ss.getSheetByName(SHEET_SESI));
    var sesiTerbaru = {}; // username -> row
    for (var i = 0; i < rowsSesi.length; i++) {
      if (asString(rowsSesi[i][1]) !== paketId) continue;
      var un = asString(rowsSesi[i][2]);
      var cur = sesiTerbaru[un];
      var dBaru = selKeString(rowsSesi[i][8]);
      if (!cur || dBaru >= selKeString(cur[8])) sesiTerbaru[un] = rowsSesi[i];
    }

    // Hasil per SesiID
    var rowsHasil = readRows(ss.getSheetByName(SHEET_HASIL));
    var hasilBySesi = {};
    for (var j = 0; j < rowsHasil.length; j++) {
      if (asString(rowsHasil[j][2]) !== paketId) continue;
      hasilBySesi[asString(rowsHasil[j][1])] = rowsHasil[j];
    }

    // Siswa eligible: peran siswa, aktif, jenjang cocok, kelas cocok
    var rowsUser = readRows(ss.getSheetByName(SHEET_PENGGUNA));
    var rows = [];
    for (var u = 0; u < rowsUser.length; u++) {
      var ru = rowsUser[u];
      if (asString(ru[5]) !== 'siswa') continue;
      if (asString(ru[11]) !== '1') continue;
      if (asString(ru[7]) !== paket.jenjangId) continue;
      var kid = asString(ru[8]);
      if (paket.kelasIds.length > 0 && paket.kelasIds.indexOf(kid) < 0) continue;

      var uname = asString(ru[2]);
      var sesi = sesiTerbaru[uname] || null;
      var rec = {
        username: uname,
        nis: asString(ru[6]),
        nama: asString(ru[1]),
        kelas: peta.kelas[kid] || '',
        status: 'Belum mulai',
        nilai: 0, benar: 0, totalSoal: defaultTotal,
        waktuSubmit: '', peringatan: 0
      };
      if (sesi) {
        var h = hasilBySesi[asString(sesi[0])] || null;
        var soalIds = parseJSONLunak(sesi[7], []);
        var totalSesi = Array.isArray(soalIds) && soalIds.length > 0
          ? soalIds.length : defaultTotal;
        rec.peringatan = asInt(sesi[6], 0);
        rec.totalSoal = totalSesi;
        if (h) {
          rec.status = 'Selesai';
          rec.nilai = asInt(h[12], 0);
          rec.benar = asInt(h[7], 0);
          rec.waktuSubmit = selKeString(h[13]);
        } else if (asString(sesi[5]) === 'AKTIF') {
          rec.status = 'Mengerjakan';
        } else if (asString(sesi[5]) === 'BATAL') {
          rec.status = 'Dibatalkan';
        }
      }
      rows.push(rec);
    }
    rows.sort(function (a, b) {
      return a.nama < b.nama ? -1 : (a.nama > b.nama ? 1 : 0);
    });

    return {
      success: true,
      data: { paket: { id: paket.id, nama: paket.nama }, rows: rows }
    };
  } catch (err) {
    return { success: false, error: 'rekapHasil: ' + err.message };
  }
}

/**
 * Rincian per soal untuk getHasilSiswa (hanya bila paket tampilPembahasan=1
 * dan sesi SELESAI): [{soalId, teks, opsi:[{kode,teks}], kunci, pembahasan,
 * jawabanSiswa, benar}].
 */
function susunRincian(ss, sesiRow, hasilRow) {
  var soalIds = parseJSONLunak(sesiRow[7], []);
  if (!Array.isArray(soalIds)) soalIds = [];
  var jawabanKirim = parseJSONLunak(hasilRow[6], []);
  if (!Array.isArray(jawabanKirim)) jawabanKirim = [];
  var petaJawaban = {};
  for (var j = 0; j < jawabanKirim.length; j++) {
    var sid = asString(jawabanKirim[j] && jawabanKirim[j].soalId);
    if (sid && petaJawaban[sid] === undefined) {
      petaJawaban[sid] = jawabanKirim[j].jawaban;
    }
  }
  var skorEssay = bacaJawabanSesi(ss, asString(sesiRow[0]));
  var bank = readRows(ss.getSheetByName(SHEET_BANKSOAL));
  var petaSoal = {};
  for (var i = 0; i < bank.length; i++) {
    var ps = parseSoalBankRow(bank[i]);
    petaSoal[ps.id] = ps;
  }

  var out = [];
  for (var s = 0; s < soalIds.length; s++) {
    var soal = petaSoal[asString(soalIds[s])];
    if (!soal) continue;
    var jwb = petaJawaban[soal.id];
    var se = skorEssay[soal.id] ? skorEssay[soal.id].skorSementara : null;
    var r = skorSatuSoal(soal, jwb, se);
    var opsi = [];
    if (soal.jenis === 'pg' || soal.jenis === 'pgk') {
      for (var o = 0; o < soal.opsi.length; o++) {
        opsi.push({ kode: KUNCI_VALID[o], teks: soal.opsi[o] });
      }
    } else if (soal.jenis === 'bs') {
      opsi = [{ kode: 'Benar', teks: 'Benar' },
        { kode: 'Salah', teks: 'Salah' }];
    }
    var item = {
      soalId: soal.id,
      teks: soal.soal,
      jenis: soal.jenis,
      opsi: opsi,
      kunci: soal.kunciHuruf,
      pembahasan: soal.pembahasan,
      jawabanSiswa: (jwb === undefined || jwb === null) ? '' : jwb,
      benar: r.penuh,
      skor: r.skor,
      bobot: soal.bobot,
      menungguPenilaian: r.menunggu
    };
    if (soal.jenis === 'jodoh') {
      item.pasanganKiri = soal.kiri.slice();
      item.pasanganKanan = soal.kanan.slice();
      item.kunciPasangan = soal.kunci;
    }
    out.push(item);
  }
  return out;
}

function actionGetHasilSiswa(ss, user, p) {
  try {
    var paketId = asString(p.paketId);
    var peta = bangunPeta(ss);
    var kkmHasil = getSettings(ss).kkm;
    var rowsHasil = readRows(ss.getSheetByName(SHEET_HASIL));
    var sheetSesi = ss.getSheetByName(SHEET_SESI);
    var out = [];
    // Guru/admin (untuk menilai essay) boleh melihat hasil semua siswa;
    // siswa hanya hasil miliknya sendiri.
    var lihatSemua = user.peran === 'guru' || user.peran === 'admin';
    for (var i = 0; i < rowsHasil.length; i++) {
      var rh = rowsHasil[i];
      if (!lihatSemua && asString(rh[3]) !== user.username) continue;
      if (paketId && asString(rh[2]) !== paketId) continue;
      var obj = hasilKeObjek(rh, peta.paket, peta.pengguna, peta.kelas, kkmHasil);
      // Rincian + pembahasan hanya jika paket mengizinkan & sesi SELESAI
      // (siswa); guru/admin selalu menerimanya — mereka sudah memegang
      // kunci via getAllData — agar jawaban essay bisa dinilai.
      var paket = ambilPaket(ss, asString(rh[2]));
      if (paket && (paket.tampilPembahasan === 1 || lihatSemua)) {
        var sesiRow = cariBarisById(ss, SHEET_SESI, asString(rh[1]));
        if (sesiRow && asString(sesiRow[5]) === 'SELESAI') {
          obj.rincian = susunRincian(ss, sesiRow, rh);
        }
      }
      out.push(obj);
    }
    // Terbaru dulu
    out.sort(function (a, b) {
      return a.waktuSubmit < b.waktuSubmit ? 1 : (a.waktuSubmit > b.waktuSubmit ? -1 : 0);
    });
    return { success: true, data: out };
  } catch (err) {
    return { success: false, error: 'getHasilSiswa: ' + err.message };
  }
}

function actionMonitorSesi(ss, p) {
  try {
    var paketId = asString(p.paketId);
    var peta = bangunPeta(ss);
    var rows = readRows(ss.getSheetByName(SHEET_SESI));
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      if (paketId && asString(rows[i][1]) !== paketId) continue;
      out.push(sesiKeObjek(rows[i], peta.paket, peta.pengguna, peta.kelas));
    }
    // AKTIF dulu, lalu waktuMulai terbaru
    out.sort(function (a, b) {
      var aa = a.status === 'AKTIF' ? 0 : 1;
      var bb = b.status === 'AKTIF' ? 0 : 1;
      if (aa !== bb) return aa - bb;
      return a.waktuMulai < b.waktuMulai ? 1 : (a.waktuMulai > b.waktuMulai ? -1 : 0);
    });
    return { success: true, data: out };
  } catch (err) {
    return { success: false, error: 'monitorSesi: ' + err.message };
  }
}

// ============================================================
// ANALISIS NILAI & NOTIFIKASI PROGRES
// ============================================================

/** Isi placeholder {nama} {rata2} {jmlUjian} {mapelLemah} {sekolah} {tanggal}. */
function fillTemplateProgres(template, params) {
  var out = asString(template);
  var keys = ['nama', 'rata2', 'jmlUjian', 'mapelLemah', 'sekolah', 'tanggal'];
  params = params || {};
  for (var i = 0; i < keys.length; i++) {
    out = out.split('{' + keys[i] + '}').join(asString(params[keys[i]]));
  }
  return out;
}

/**
 * Kirim pesan WA via endpoint milik sekolah (diatur di Pengaturan).
 * SELALU mengembalikan {success:true, terkirim:boolean, pesan} — tidak pernah
 * throw dan tidak pernah success:false. Jika waAktif != 'true' atau
 * endpoint/apiKey kosong, TIDAK ada request jaringan sama sekali.
 */
function kirimWAAman(ss, to, template, params) {
  try {
    var settings = getSettings(ss);
    var waAktif = asString(settings.waAktif).toLowerCase() === 'true';
    var endpoint = asString(settings.waEndpoint);
    var apiKey = asString(settings.waApiKey);
    to = asString(to);
    if (!to) {
      return { success: true, terkirim: false, pesan: 'Nomor WA tujuan kosong — dilewati.' };
    }
    if (!waAktif || !endpoint || !apiKey) {
      return { success: true, terkirim: false, pesan: 'WA belum dikonfigurasi — dilewati.' };
    }
    var message = fillTemplateProgres(template, params);
    UrlFetchApp.fetch(endpoint, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ to: to, message: message, apiKey: apiKey }),
      muteHttpExceptions: true
    });
    return { success: true, terkirim: true, pesan: 'Pesan WA terkirim ke ' + to + '.' };
  } catch (err) {
    return { success: true, terkirim: false, pesan: 'Gagal: ' + err.message };
  }
}

/**
 * Bangun agregasi analisis untuk satu siswa: penguasaan per mapel
 * (dari JawabanJSON yang VALID A-E), tren nilai, mapel terkuat/terlemah.
 * Mengembalikan {perMapel, tren, ringkasan}. TIDAK mengirim kunci/pembahasan.
 */
function bangunAnalisisSiswa(ss, username) {
  var settings = getSettings(ss);
  var kkm = settings.kkm;

  var petaPaket = {}; // paketId -> {nama, mapelId}
  var rowsPaket = readRows(ss.getSheetByName(SHEET_PAKET));
  for (var j = 0; j < rowsPaket.length; j++) {
    petaPaket[asString(rowsPaket[j][0])] = {
      nama: asString(rowsPaket[j][1]), mapelId: asString(rowsPaket[j][3])
    };
  }
  var petaMapel = {}; // mapelId -> nama
  var rowsMapel = readRows(ss.getSheetByName(SHEET_MAPEL));
  for (var m = 0; m < rowsMapel.length; m++) {
    petaMapel[asString(rowsMapel[m][0])] = asString(rowsMapel[m][2]);
  }
  var petaBank = {}; // soalId -> soal ter-parse (6 jenis)
  var rowsBank = readRows(ss.getSheetByName(SHEET_BANKSOAL));
  for (var b = 0; b < rowsBank.length; b++) {
    var psBank = parseSoalBankRow(rowsBank[b]);
    petaBank[psBank.id] = psBank;
  }
  // Skor essay per sesi (dari JawabanSiswa; '' = belum dinilai).
  var skorEssayPerSesi = {}; // sesiId -> {soalId: skor}
  var rowsJwb = readRows(ss.getSheetByName(SHEET_JAWABAN));
  for (var w = 0; w < rowsJwb.length; w++) {
    var skRaw = asString(rowsJwb[w][3]);
    if (skRaw === '') continue;
    var sidSesi = asString(rowsJwb[w][0]);
    if (!skorEssayPerSesi[sidSesi]) skorEssayPerSesi[sidSesi] = {};
    skorEssayPerSesi[sidSesi][asString(rowsJwb[w][1])] = Number(skRaw);
  }

  var rowsHasil = readRows(ss.getSheetByName(SHEET_HASIL));
  var hasil = [];
  for (var i = 0; i < rowsHasil.length; i++) {
    if (asString(rowsHasil[i][3]) === username) hasil.push(rowsHasil[i]);
  }

  var agg = {}; // mapelId -> {total, benar, nilaiSum, nilaiCount}
  var tren = [];
  var nilaiSemua = [];
  for (var h = 0; h < hasil.length; h++) {
    var rh = hasil[h];
    var paketId = asString(rh[2]);
    var nilai = asInt(rh[12], 0);
    nilaiSemua.push(nilai);
    tren.push({
      paketId: paketId,
      namaPaket: petaPaket[paketId] ? petaPaket[paketId].nama : '(paket dihapus)',
      nilai: nilai,
      waktuSubmit: selKeString(rh[13])
    });

    var jwb = parseJSONLunak(rh[6], []);
    if (!Array.isArray(jwb)) jwb = [];
    var skorEssaySesi = skorEssayPerSesi[asString(rh[1])] || {};
    for (var q = 0; q < jwb.length; q++) {
      var sid = asString(jwb[q] && jwb[q].soalId);
      var info = petaBank[sid];
      if (!info) continue;
      var fr = skorSatuSoal(info, jwb[q].jawaban, skorEssaySesi[sid]);
      if (!fr.terjawab || fr.menunggu) continue; // kosong / essay menunggu
      var ag = agg[info.mapelId];
      if (!ag) ag = agg[info.mapelId] = { total: 0, benar: 0, nilaiSum: 0, nilaiCount: 0 };
      ag.total++;
      if (fr.penuh) ag.benar++;
    }
    // Nilai rata per mapel: rata-rata Nilai hasil yang paketnya mapel tsb
    var mid = petaPaket[paketId] ? petaPaket[paketId].mapelId : '';
    if (mid) {
      var ag2 = agg[mid];
      if (!ag2) ag2 = agg[mid] = { total: 0, benar: 0, nilaiSum: 0, nilaiCount: 0 };
      ag2.nilaiSum += nilai;
      ag2.nilaiCount++;
    }
  }

  var perMapel = [];
  var kuat = null, lemah = null; // {nama, pct}
  for (var mid2 in agg) {
    if (!agg.hasOwnProperty(mid2)) continue;
    var a = agg[mid2];
    var pct = a.total > 0 ? Math.round(a.benar / a.total * 100) : 0;
    var nilaiRata = a.nilaiCount > 0
      ? Math.round(a.nilaiSum / a.nilaiCount * 10) / 10 : 0;
    var namaMapel = petaMapel[mid2] || '(mapel dihapus)';
    perMapel.push({
      mapelId: mid2, namaMapel: namaMapel,
      totalDikerjakan: a.total, benar: a.benar, pct: pct,
      nilaiRata: nilaiRata, tuntas: nilaiRata >= kkm
    });
    if (a.total > 0) {
      if (!kuat || pct > kuat.pct) kuat = { nama: namaMapel, pct: pct };
      if (!lemah || pct < lemah.pct) lemah = { nama: namaMapel, pct: pct };
    }
  }
  perMapel.sort(function (x, y) { return y.pct - x.pct; });

  tren.sort(function (x, y) {
    return x.waktuSubmit < y.waktuSubmit ? -1 : (x.waktuSubmit > y.waktuSubmit ? 1 : 0);
  });

  var rataRata = 0, nilaiTertinggi = 0;
  if (nilaiSemua.length > 0) {
    var sum = 0;
    for (var n = 0; n < nilaiSemua.length; n++) {
      sum += nilaiSemua[n];
      if (nilaiSemua[n] > nilaiTertinggi) nilaiTertinggi = nilaiSemua[n];
    }
    rataRata = Math.round(sum / nilaiSemua.length * 10) / 10;
  }

  var ringkasan = {
    totalUjian: hasil.length,
    rataRata: rataRata,
    nilaiTertinggi: nilaiTertinggi,
    mapelTerkuat: kuat ? kuat.nama : '-',
    mapelTerlemah: lemah ? lemah.nama : '-'
  };
  return { ringkasan: ringkasan, perMapel: perMapel, tren: tren };
}

/**
 * getAnalisisKelas 🔒 guru — statistik nilai (filter opsional paketId &
 * kelasId), distribusi, 5 teratas/terbawah, dan analisis butir soal bila
 * p.paketId diisi. Butir soal memakai aturan skoring 6 jenis soal:
 * `benar` = jawaban penuh (skor == bobot); essay yang belum dinilai
 * tidak dihitung sebagai dijawab.
 */

/**
 * getAnalisisSiswa 🔒 siswa — siswa hanya boleh melihat data sendiri;
 * guru/admin boleh melihat siswa mana pun via p.username.
 */
function actionGetAnalisisSiswa(ss, user, p) {
  try {
    var target = user.peran === 'siswa'
      ? user.username
      : (asString(p && p.username) || user.username);
    // Pastikan target benar ada sebagai siswa (jangan bocorkan info lain)
    if (user.peran === 'siswa' && target !== user.username) {
      return { success: false, message: 'Tidak diizinkan.' };
    }
    var d = bangunAnalisisSiswa(ss, target);
    return { success: true, data: d };
  } catch (err) {
    return { success: false, error: 'getAnalisisSiswa: ' + err.message };
  }
}

/**
 * getAnalisisKelas 🔒 guru — statistik nilai (filter opsional paketId &
 * kelasId), distribusi, 5 teratas/terbawah, dan analisis butir soal bila
 * p.paketId diisi.
 */
function actionGetAnalisisKelas(ss, p) {
  try {
    var paketId = asString(p && p.paketId);
    var kelasId = asString(p && p.kelasId);
    var settings = getSettings(ss);
    var kkm = settings.kkm;

    var petaPengguna = {}; // username -> {nama, kelasId}
    var rowsUser = readRows(ss.getSheetByName(SHEET_PENGGUNA));
    for (var u = 0; u < rowsUser.length; u++) {
      petaPengguna[asString(rowsUser[u][2])] = {
        nama: asString(rowsUser[u][1]), kelasId: asString(rowsUser[u][8])
      };
    }
    var petaKelas = {};
    var rowsKelas = readRows(ss.getSheetByName(SHEET_KELAS));
    for (var k = 0; k < rowsKelas.length; k++) {
      petaKelas[asString(rowsKelas[k][0])] = asString(rowsKelas[k][2]);
    }

    var daftar = [];
    var rowsHasil = readRows(ss.getSheetByName(SHEET_HASIL));
    for (var i = 0; i < rowsHasil.length; i++) {
      var rh = rowsHasil[i];
      if (paketId && asString(rh[2]) !== paketId) continue;
      var un = asString(rh[3]);
      var pg = petaPengguna[un] || {};
      if (kelasId && asString(pg.kelasId) !== kelasId) continue;
      var jwbArr = parseJSONLunak(rh[6], []);
      if (!Array.isArray(jwbArr)) jwbArr = [];
      daftar.push({
        username: un,
        namaSiswa: asString(rh[4]) || pg.nama || un,
        kelas: asString(rh[5]) || petaKelas[asString(pg.kelasId)] || '',
        nilai: asInt(rh[12], 0),
        sesiId: asString(rh[1]),
        jawaban: jwbArr
      });
    }

    // --- statistik ---
    var jumlah = daftar.length;
    var statistik = { jumlah: 0, rata2: 0, min: 0, maks: 0, median: 0, ketuntasanPct: 0 };
    if (jumlah > 0) {
      var nilaiUrut = [];
      var sum = 0, tuntas = 0;
      for (var s = 0; s < daftar.length; s++) {
        nilaiUrut.push(daftar[s].nilai);
        sum += daftar[s].nilai;
        if (daftar[s].nilai >= kkm) tuntas++;
      }
      nilaiUrut.sort(function (a, b) { return a - b; });
      var median = jumlah % 2 === 1
        ? nilaiUrut[(jumlah - 1) / 2]
        : Math.round((nilaiUrut[jumlah / 2 - 1] + nilaiUrut[jumlah / 2]) / 2 * 10) / 10;
      statistik = {
        jumlah: jumlah,
        rata2: Math.round(sum / jumlah * 10) / 10,
        min: nilaiUrut[0],
        maks: nilaiUrut[jumlah - 1],
        median: median,
        ketuntasanPct: Math.round(tuntas / jumlah * 1000) / 10
      };
    }

    // --- distribusi ---
    var dist = [
      { rentang: '<60', jumlah: 0 },
      { rentang: '60-69', jumlah: 0 },
      { rentang: '70-79', jumlah: 0 },
      { rentang: '80-89', jumlah: 0 },
      { rentang: '90-100', jumlah: 0 }
    ];
    for (var d2 = 0; d2 < daftar.length; d2++) {
      var v = daftar[d2].nilai;
      if (v < 60) dist[0].jumlah++;
      else if (v < 70) dist[1].jumlah++;
      else if (v < 80) dist[2].jumlah++;
      else if (v < 90) dist[3].jumlah++;
      else dist[4].jumlah++;
    }

    // --- 5 teratas / terbawah ---
    var urutTurun = daftar.slice().sort(function (a, b) { return b.nilai - a.nilai; });
    var urutNaik = daftar.slice().sort(function (a, b) { return a.nilai - b.nilai; });
    function keSiswaNilai(x) {
      return { username: x.username, namaSiswa: x.namaSiswa, kelas: x.kelas, nilai: x.nilai };
    }
    var teratas = [], terbawah = [];
    for (var t = 0; t < urutTurun.length && t < 5; t++) teratas.push(keSiswaNilai(urutTurun[t]));
    for (var b2 = 0; b2 < urutNaik.length && b2 < 5; b2++) terbawah.push(keSiswaNilai(urutNaik[b2]));

    // --- butir soal (hanya bila paketId diisi) ---
    var butirSoal = [];
    if (paketId) {
      var paket = ambilPaket(ss, paketId);
      var soalIds = [];
      if (paket && paket.modeSoal === 'manual') {
        soalIds = paket.soalIds.slice();
      } else {
        // Mode acak: kumpulkan unik dari SoalIDsJSON sesi paket ini
        var rowsSesi = readRows(ss.getSheetByName(SHEET_SESI));
        var sudah = {};
        for (var e = 0; e < rowsSesi.length; e++) {
          if (asString(rowsSesi[e][1]) !== paketId) continue;
          var ids = parseJSONLunak(rowsSesi[e][7], []);
          if (!Array.isArray(ids)) continue;
          for (var f = 0; f < ids.length; f++) {
            var sid2 = asString(ids[f]);
            if (sid2 && !sudah[sid2]) { sudah[sid2] = true; soalIds.push(sid2); }
          }
        }
      }
      var bank = {};
      var rowsBank = readRows(ss.getSheetByName(SHEET_BANKSOAL));
      for (var g = 0; g < rowsBank.length; g++) {
        var psBank = parseSoalBankRow(rowsBank[g]);
        bank[psBank.id] = psBank;
      }
      // Skor essay per sesi (dari JawabanSiswa).
      var skorEssayPerSesi = {};
      var rowsJwb = readRows(ss.getSheetByName(SHEET_JAWABAN));
      for (var w2 = 0; w2 < rowsJwb.length; w2++) {
        var skRaw = asString(rowsJwb[w2][3]);
        if (skRaw === '') continue;
        var sidSesi = asString(rowsJwb[w2][0]);
        if (!skorEssayPerSesi[sidSesi]) skorEssayPerSesi[sidSesi] = {};
        skorEssayPerSesi[sidSesi][asString(rowsJwb[w2][1])] = Number(skRaw);
      }
      // Nilai per jawaban: username -> {soalId: {terjawab, penuh}}
      var petaNilai = {};
      for (var h2 = 0; h2 < daftar.length; h2++) {
        var pn = {};
        var arr = daftar[h2].jawaban;
        var skEssay = skorEssayPerSesi[daftar[h2].sesiId] || {};
        for (var q = 0; q < arr.length; q++) {
          var soalInfo = bank[asString(arr[q].soalId)];
          if (!soalInfo) continue;
          var fr = skorSatuSoal(soalInfo, arr[q].jawaban, skEssay[asString(arr[q].soalId)]);
          if (!fr.terjawab || fr.menunggu) continue;
          pn[asString(arr[q].soalId)] = fr.penuh;
        }
        petaNilai[daftar[h2].username] = pn;
      }
      // Grup 27% atas & bawah untuk daya beda
      var urutNilai = daftar.slice().sort(function (a, b) { return b.nilai - a.nilai; });
      var n27 = Math.max(1, Math.round(urutNilai.length * 0.27));
      var grupAtas = urutNilai.slice(0, n27);
      var grupBawah = urutNilai.slice(Math.max(0, urutNilai.length - n27));

      for (var s2 = 0; s2 < soalIds.length; s2++) {
        var bs = bank[asString(soalIds[s2])];
        if (!bs) continue;
        var dijawab = 0, benar = 0;
        for (var h3 = 0; h3 < daftar.length; h3++) {
          var pjw = petaNilai[daftar[h3].username] || {};
          var j3 = pjw[asString(soalIds[s2])];
          if (j3 === undefined) continue;
          dijawab++;
          if (j3) benar++;
        }
        var pctBenar = dijawab > 0 ? Math.round(benar / dijawab * 100) : 0;
        var klasifikasi = pctBenar >= 85 ? 'Sangat Mudah' :
          pctBenar >= 70 ? 'Mudah' :
          pctBenar >= 40 ? 'Sedang' :
          pctBenar >= 15 ? 'Sukar' : 'Sangat Sukar';
        var dayaBeda = null;
        if (grupAtas.length > 0 && grupBawah.length > 0) {
          var ba = 0, da2 = 0, bb = 0, db = 0;
          for (var g1 = 0; g1 < grupAtas.length; g1++) {
            var ja = (petaNilai[grupAtas[g1].username] || {})[asString(soalIds[s2])];
            if (ja === undefined) continue;
            da2++;
            if (ja) ba++;
          }
          for (var g2 = 0; g2 < grupBawah.length; g2++) {
            var jb = (petaNilai[grupBawah[g2].username] || {})[asString(soalIds[s2])];
            if (jb === undefined) continue;
            db++;
            if (jb) bb++;
          }
          var pctAtas = da2 > 0 ? Math.round(ba / da2 * 100) : 0;
          var pctBawah = db > 0 ? Math.round(bb / db * 100) : 0;
          dayaBeda = pctAtas - pctBawah;
        }
        butirSoal.push({
          soalId: asString(soalIds[s2]),
          teks: bs.soal.substring(0, 80),
          dijawab: dijawab,
          benar: benar,
          pctBenar: pctBenar,
          klasifikasi: klasifikasi,
          dayaBeda: dayaBeda
        });
      }
    }

    return {
      success: true,
      data: {
        statistik: statistik, distribusi: dist,
        teratas: teratas, terbawah: terbawah, butirSoal: butirSoal
      }
    };
  } catch (err) {
    return { success: false, error: 'getAnalisisKelas: ' + err.message };
  }
}

/**
 * Ringkasan progres satu siswa untuk notifikasi — dipakai internal oleh
 * actionGetAnalisisSiswa (via bangunAnalisisSiswa) & actionKirimNotifikasiProgres.
 * Mengembalikan {nama, noHP, rata2, jmlUjian, mapelLemah}.
 */
function hitungRingkasanSiswa(ss, username) {
  var nama = username, noHP = '';
  var rowsUser = readRows(ss.getSheetByName(SHEET_PENGGUNA));
  for (var i = 0; i < rowsUser.length; i++) {
    if (asString(rowsUser[i][2]) === username) {
      nama = asString(rowsUser[i][1]) || username;
      noHP = asString(rowsUser[i][12]);
      break;
    }
  }
  var rowsHasil = readRows(ss.getSheetByName(SHEET_HASIL));
  var jmlUjian = 0, sum = 0;
  for (var j = 0; j < rowsHasil.length; j++) {
    if (asString(rowsHasil[j][3]) === username) {
      jmlUjian++;
      sum += asInt(rowsHasil[j][12], 0);
    }
  }
  var rata2 = jmlUjian > 0 ? Math.round(sum / jmlUjian * 10) / 10 : 0;
  var mapelLemah = '-';
  if (jmlUjian > 0) {
    var an = bangunAnalisisSiswa(ss, username);
    mapelLemah = an.ringkasan.mapelTerlemah;
  }
  return { nama: nama, noHP: noHP, rata2: rata2, jmlUjian: jmlUjian, mapelLemah: mapelLemah };
}

/**
 * kirimNotifikasiProgres 🔒 guru — kirim WA progres belajar ke orang tua.
 * Target: p.usernames[] (spesifik), atau p.kelasId, atau semua siswa aktif.
 * SELALU mencatat ke sheet Notifikasi (status 'terkirim' / 'dilewati: ...').
 */
function actionKirimNotifikasiProgres(ss, user, p) {
  try {
    var settings = getSettings(ss);
    var usernames = (p && p.usernames) || null;
    var kelasId = asString(p && p.kelasId);
    var template = asString(p && p.template) || settings.waTemplateProgres;
    var sekolah = settings.namaSekolah;
    var tanggal = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy');

    var targets = [];
    var rowsUser = readRows(ss.getSheetByName(SHEET_PENGGUNA));
    for (var i = 0; i < rowsUser.length; i++) {
      var ru = rowsUser[i];
      if (asString(ru[5]) !== 'siswa') continue;
      if (asString(ru[11]) !== '1') continue; // hanya aktif
      var un = asString(ru[2]);
      if (usernames && Array.isArray(usernames) && usernames.indexOf(un) < 0) continue;
      if (kelasId && asString(ru[8]) !== kelasId) continue;
      targets.push(un);
    }

    var sheetN = getOrCreateSheet(ss, SHEET_NOTIFIKASI);
    var detail = [];
    var terkirim = 0, dilewati = 0;
    for (var t = 0; t < targets.length; t++) {
      var ring = hitungRingkasanSiswa(ss, targets[t]);
      var params = {
        nama: ring.nama, rata2: String(ring.rata2), jmlUjian: String(ring.jmlUjian),
        mapelLemah: ring.mapelLemah, sekolah: sekolah, tanggal: tanggal
      };
      var pesanFinal = fillTemplateProgres(template, params);
      var wa = kirimWAAman(ss, ring.noHP, template, params);
      var status = wa.terkirim ? 'terkirim' : ('dilewati: ' + wa.pesan);
      if (wa.terkirim) terkirim++; else dilewati++;
      sheetN.appendRow([Utilities.getUuid(), sekarangISODateTime(),
        targets[t], ring.nama, ring.noHP, 'progres', pesanFinal, status]);
      detail.push({ username: targets[t], nama: ring.nama, status: status });
    }
    catatLog(ss, user.username, '', 'notifikasi-progres',
      'Kirim progres ke ' + targets.length + ' siswa (' + terkirim +
      ' terkirim, ' + dilewati + ' dilewati).');

    return {
      success: true,
      data: { total: targets.length, terkirim: terkirim, dilewati: dilewati, detail: detail }
    };
  } catch (err) {
    return { success: false, error: 'kirimNotifikasiProgres: ' + err.message };
  }
}

/** getNotifikasi 🔒 guru — 200 riwayat terakhir, terbaru dulu. */
function actionGetNotifikasi(ss) {
  try {
    var rows = readRows(ss.getSheetByName(SHEET_NOTIFIKASI));
    var out = [];
    for (var i = rows.length - 1; i >= 0 && out.length < 200; i--) {
      var r = rows[i];
      out.push({
        id: asString(r[0]), waktu: selKeString(r[1]),
        username: asString(r[2]), namaSiswa: asString(r[3]),
        noHP: asString(r[4]), jenis: asString(r[5]),
        isi: asString(r[6]), status: asString(r[7])
      });
    }
    return { success: true, data: out };
  } catch (err) {
    return { success: false, error: 'getNotifikasi: ' + err.message };
  }
}

// ============================================================
// PENGATURAN & UPLOAD (admin; upload gambar soal: guru/admin)
// ============================================================
function actionSavePengaturan(ss, p) {
  try {
    var input = (p && p.pengaturan) || {};
    var simpan = {};
    for (var i = 0; i < KUNCI_PENGATURAN.length; i++) {
      var k = KUNCI_PENGATURAN[i];
      if (input[k] === undefined || input[k] === null) continue; // kunci tak dikenal diabaikan
      simpan[k] = input[k];
    }

    if (simpan.ambangPeringatan !== undefined) {
      var amb = asInt(simpan.ambangPeringatan, -1);
      if (!(amb >= 1 && amb <= 10)) {
        return { success: false, message: 'Ambang peringatan harus angka 1-10.' };
      }
      simpan.ambangPeringatan = amb;
    }
    if (simpan.wajibFullscreen !== undefined) {
      var wf = asInt(simpan.wajibFullscreen, -1);
      if (wf !== 0 && wf !== 1) {
        return { success: false, message: 'wajibFullscreen harus 0 atau 1.' };
      }
      simpan.wajibFullscreen = wf;
    }
    if (simpan.izinkanUlangSetelahBatal !== undefined) {
      var iu = asInt(simpan.izinkanUlangSetelahBatal, -1);
      if (iu !== 0 && iu !== 1) {
        return { success: false, message: 'izinkanUlangSetelahBatal harus 0 atau 1.' };
      }
      simpan.izinkanUlangSetelahBatal = iu;
    }
    if (simpan.kkm !== undefined) {
      var kkm = asInt(simpan.kkm, -1);
      if (!(kkm >= 0 && kkm <= 100)) {
        return { success: false, message: 'KKM harus angka 0-100.' };
      }
      simpan.kkm = kkm;
    }
    if (simpan.durasiStandar !== undefined) {
      var ds = asInt(simpan.durasiStandar, -1);
      if (!(ds >= 5 && ds <= 300)) {
        return { success: false, message: 'Durasi standar harus 5-300 menit.' };
      }
      simpan.durasiStandar = ds;
    }
    if (simpan.jedaGelombang !== undefined) {
      var jg = asInt(simpan.jedaGelombang, -1);
      if (!(jg >= 0 && jg <= 60)) {
        return { success: false, message: 'Jeda gelombang harus 0-60 menit.' };
      }
      simpan.jedaGelombang = jg;
    }

    for (var j in simpan) {
      if (simpan.hasOwnProperty(j)) setSetting(ss, j, String(simpan[j]));
    }
    return { success: true, message: 'Pengaturan berhasil disimpan.' };
  } catch (err) {
    return { success: false, error: 'savePengaturan: ' + err.message };
  }
}

/**
 * Upload gambar (validasi umum). Mengembalikan {ok, url, fileId} atau
 * {ok:false, message}.
 */
function uploadGambarKeDrive(ss, dataBase64, mimeType, namaFolder, namaFile) {
  var base64Data = asString(dataBase64);
  mimeType = asString(mimeType);
  if (!base64Data) {
    return { ok: false, message: 'Data gambar kosong.' };
  }
  if (!/^image\//.test(mimeType)) {
    return { ok: false, message: 'File harus berupa gambar (PNG/JPG).' };
  }
  if (base64Data.length > MAX_GAMBAR_BASE64) {
    return { ok: false, message: 'Ukuran gambar maksimal 2 MB.' };
  }
  var folder;
  try {
    var folders = DriveApp.getFoldersByName(namaFolder);
    folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(namaFolder);
  } catch (permErr) {
    return {
      ok: false,
      message: 'Izin Google Drive belum diberikan. Buka editor Apps Script, jalankan fungsi "authorizeDriveAccess", lalu setujui izinnya.'
    };
  }
  try { folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e1) {}

  // Dukung data-URL ("data:image/png;base64,...") maupun base64 murni
  var cleanBase64 = base64Data.indexOf(',') > -1 ? base64Data.split(',')[1] : base64Data;
  var blob = Utilities.newBlob(
    Utilities.base64Decode(cleanBase64), mimeType, namaFile
  );
  var file = folder.createFile(blob);
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e2) {}

  var fileId = file.getId();
  var url = 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w800';
  return { ok: true, url: url, fileId: fileId };
}

function actionUploadLogo(ss, p) {
  try {
    var up = uploadGambarKeDrive(ss, p.dataBase64, p.mimeType,
      NAMA_FOLDER_LOGO, 'logo_' + Date.now() + '.png');
    if (!up.ok) return { success: false, message: up.message };
    setSetting(ss, 'logoUrl', up.url);
    return {
      success: true,
      message: 'Logo berhasil diunggah.',
      data: { url: up.url, fileId: up.fileId }
    };
  } catch (err) {
    return { success: false, message: 'Gagal mengunggah logo: ' + err.message };
  }
}

function actionUploadGambarSoal(ss, p) {
  try {
    var namaFile = asString(p.namaFile) || ('soal_' + Date.now() + '.png');
    var up = uploadGambarKeDrive(ss, p.dataBase64, p.mimeType,
      NAMA_FOLDER_GAMBAR_SOAL, namaFile);
    if (!up.ok) return { success: false, message: up.message };
    return {
      success: true,
      message: 'Gambar soal berhasil diunggah.',
      data: { url: up.url, fileId: up.fileId }
    };
  } catch (err) {
    return { success: false, message: 'Gagal mengunggah gambar soal: ' + err.message };
  }
}
