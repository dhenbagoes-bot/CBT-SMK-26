import type {
  AllData,
  AnalisisKelasData,
  AnalisisSiswaData,
  BarisRekap,
  BarisSiswa,
  BarisSoalImpor,
  HasilImpor,
  HasilImporMapel,
  HasilKirimNotifikasi,
  HasilSubmit,
  HasilUjian,
  JawabanKirim,
  JenisSoal,
  ModeSoal,
  MulaiSesiResponse,
  NotifikasiLog,
  OpsiUjian,
  Peran,
  Pengaturan,
  SesiRingkas,
  UserSesi,
} from '../types';

// ============================================================
// Klien API Google Apps Script — sesuai API_CONTRACT.md:
//  - POST JSON { action, token?, ...params } ke /exec
//    dengan Content-Type text/plain (hindari preflight CORS)
//  - Envelope: { success, message, data, error }
//  - KEAMANAN: token sesi utama DI MEMORI (variabel modul). Khusus
//    admin/guru, token + profil user juga tersimpan di localStorage
//    ("tetap masuk") agar tak perlu login ulang tiap buka aplikasi;
//    sesi siswa TETAP hanya di memori (anti-curang). Token kedaluwarsa
//    7 hari di server; token mati otomatis dibersihkan saat terdeteksi.
//    URL backend di localStorage boleh (pola aplikasi sebelumnya).
//  - Tanggal di wire: ISO yyyy-mm-dd; datetime: yyyy-MM-dd HH:mm:ss
//  - !success -> lempar Error(message) agar UI menampilkannya
// ============================================================

const LS_API = 'wwn-cbt-madrasah-80.apiUrl';
const LS_TOKEN = 'wwn-cbt-madrasah-80.token';
const LS_USER = 'wwn-cbt-madrasah-80.user';

function bacaTokenTersimpan(): string {
  try {
    return localStorage.getItem(LS_TOKEN) || '';
  } catch {
    return '';
  }
}

/**
 * Token sesi — utama di memori (variabel modul). Saat aplikasi dimuat,
 * token admin/guru yang tersimpan ("tetap masuk") dihidrasi ke memori;
 * token siswa tidak pernah disimpan (anti-curang).
 */
let tokenMem: string = bacaTokenTersimpan();

/** URL efektif hasil resolusi App: override manual > ?school=/schools.json. */
let urlEfektif = '';

export function setUrlEfektif(url: string): void {
  urlEfektif = (url || '').trim();
}

/** URL efektif saat ini (untuk beacon). */
export function getUrlEfektif(): string {
  return urlEfektif || getApiUrl();
}

function resolveUrl(): string {
  return urlEfektif || getApiUrl();
}

/** URL backend: override manual di localStorage (bila diisi). */
export function getApiUrl(): string {
  try {
    return localStorage.getItem(LS_API) || '';
  } catch {
    return '';
  }
}

export function setApiUrl(url: string): void {
  try {
    if (url) localStorage.setItem(LS_API, url);
    else localStorage.removeItem(LS_API);
  } catch {
    /* abaikan */
  }
}

function validUrl(apiUrl: string): boolean {
  return !!apiUrl && apiUrl.trim().startsWith('http');
}

/**
 * v1.1.0 — Aksi yang aman diulang (idempotent di server: mulaiSesi, submitJawaban,
 * batalkanSesi, getSesi, getAllData, login, ping) otomatis di-retry bila:
 *  - jaringan gagal / HTTP 5xx / HTTP 429 (throttle Google), atau
 *  - backend menjawab {success:false, retryable:true} (server sibuk sesaat).
 * Backoff eksponensial + jitter agar 1000 klien tidak menyerbu bersamaan.
 * v1.2.1 — impor mapel & soal ikut masuk daftar ini karena backend-nya
 * idempotent (duplikat dilewati), sehingga impor yang terputus di tengah
 * jalan aman diulang per batch tanpa menggandakan data.
 */
const AKSI_BOLEH_RETRY = new Set([
  'ping', 'login', 'getAllData', 'getSesi', 'mulaiSesi', 'batalkanSesi', 'submitJawaban',
  'simpanJawaban', 'getJawabanSesi',
  'importSiswa', // idempotent via upsert NIS -> aman di-retry per batch
  'importMapel', // idempotent: duplikat (jenjang+nama) dilewati -> aman di-retry
  'importSoal', // idempotent: soal duplikat (mapel+teks) dilewati -> aman di-retry
]);

function tungguMs(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function jedaRetry(percobaan: number): number {
  return 700 * Math.pow(2, percobaan - 1) + Math.floor(Math.random() * 400);
}

/**
 * Panggil satu action backend. Token sesi otomatis disertakan bila ada.
 * Melempar Error berisi message backend bila success=false.
 */
export async function api<T>(action: string, params: object = {}): Promise<T> {
  const apiUrl = resolveUrl();
  if (!validUrl(apiUrl)) {
    throw new Error('URL backend belum dikonfigurasi. Hubungi admin sekolah.');
  }
  const maxPercobaan = AKSI_BOLEH_RETRY.has(action) ? 4 : 1;
  // Token sesi SELALU dari tokenMem (atau token eksplisit, mis. logout).
  // Param lain TIDAK BOLEH menimpa field `token`: token ujian paket
  // bernama `tokenUjian`, bukan `token` (bug lama: savePaket mengirim
  // `token` sehingga token sesi tertimpa token ujian -> auth gagal).
  const body = () => {
    const p = params as Record<string, unknown>;
    const token = tokenMem || (typeof p.token === 'string' ? p.token : '');
    const { token: _buang, ...sisa } = p;
    void _buang;
    return JSON.stringify(token ? { action, ...sisa, token } : { action, ...sisa });
  };
  let galatTerakhir: Error = new Error('Backend melaporkan kegagalan.');
  for (let percobaan = 1; percobaan <= maxPercobaan; percobaan++) {
    let res: Response;
    try {
      res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: body(),
      });
    } catch {
      galatTerakhir = new Error('Gagal menghubungi backend. Periksa koneksi internet.');
      if (percobaan < maxPercobaan) { await tungguMs(jedaRetry(percobaan)); continue; }
      throw galatTerakhir;
    }
    if (!res.ok) {
      galatTerakhir = new Error(`Server merespons HTTP ${res.status}.`);
      // 429 = Google sedang membatasi (throttle) — pantas di-retry dengan jeda,
      // sama seperti 5xx. Tanpa ini, impor gagal total saat throttle sesaat.
      if (percobaan < maxPercobaan && (res.status === 429 || res.status >= 500)) { await tungguMs(jedaRetry(percobaan)); continue; }
      throw galatTerakhir;
    }
    // Baca badan respons di dalam try: koneksi yang putus di tengah badan
    // (atau halaman error HTML Google saat throttle) membuat res.json()
    // melempar TypeError mentah "Failed to fetch" — sebelumnya lolos tanpa
    // dibungkus sehingga toast menampilkan pesan mentah itu. Perlakukan
    // sebagai gangguan jaringan: boleh di-retry untuk aksi idempotent.
    let json: { success?: boolean; retryable?: boolean; message?: string; error?: string; data?: unknown };
    try {
      json = JSON.parse(await res.text()) as typeof json;
    } catch {
      galatTerakhir = new Error('Gagal membaca respons backend. Periksa koneksi internet, lalu coba lagi.');
      if (percobaan < maxPercobaan) { await tungguMs(jedaRetry(percobaan)); continue; }
      throw galatTerakhir;
    }
    if (json.success === false) {
      if (json.retryable === true && percobaan < maxPercobaan) {
        await tungguMs(jedaRetry(percobaan));
        continue;
      }
      throw new Error(json.message || json.error || 'Backend melaporkan kegagalan.');
    }
    return json.data as T;
  }
  throw galatTerakhir;
}

// ---------- Sesi ----------

export function getToken(): string {
  return tokenMem;
}

export function isLoggedIn(): boolean {
  return !!tokenMem;
}

export function setToken(t: string, tetapMasuk = false): void {
  tokenMem = t || '';
  try {
    if (tetapMasuk && tokenMem) {
      localStorage.setItem(LS_TOKEN, tokenMem);
    } else {
      // Termasuk saat login sebagai siswa: sesi tersimpan lama wajib dibuang.
      localStorage.removeItem(LS_TOKEN);
      localStorage.removeItem(LS_USER);
    }
  } catch {
    /* abaikan */
  }
}

/** Simpan profil user (khusus admin/guru). Otorisasi tetap dicek via token di server. */
export function simpanSesi(user: UserSesi): void {
  try {
    localStorage.setItem(LS_USER, JSON.stringify(user));
  } catch {
    /* abaikan */
  }
}

/** Profil user tersimpan (admin/guru) atau null. */
export function getSesiTersimpan(): UserSesi | null {
  try {
    const s = localStorage.getItem(LS_USER);
    if (!s) return null;
    const u = JSON.parse(s) as UserSesi;
    if (!u || (u.peran !== 'admin' && u.peran !== 'guru')) return null;
    return u;
  } catch {
    return null;
  }
}

/** Bersihkan token memori + sesi tersimpan (dipakai saat logout / sesi mati). */
export function bersihkanToken(): void {
  tokenMem = '';
  try {
    localStorage.removeItem(LS_TOKEN);
    localStorage.removeItem(LS_USER);
  } catch {
    /* abaikan */
  }
}

export async function login(username: string, password: string): Promise<UserSesi> {
  const data = await api<{
    token: string;
    nama: string;
    username: string;
    peran: Peran;
    nis: string;
    jenjangId: string;
    kelasId: string;
  }>('login', { username: username.trim(), password });
  const u: UserSesi = {
    nama: data.nama,
    username: data.username,
    peran: data.peran,
    nis: data.nis || '',
    jenjangId: data.jenjangId || '',
    kelasId: data.kelasId || '',
  };
  // Admin/guru: sesi tersimpan di perangkat ("tetap masuk").
  // Siswa: sesi HANYA di memori (anti-curang).
  const tetapMasuk = data.peran === 'admin' || data.peran === 'guru';
  setToken(data.token, tetapMasuk);
  if (tetapMasuk) simpanSesi(u);
  return u;
}

export async function logout(): Promise<void> {
  const t = tokenMem;
  bersihkanToken();
  if (t) {
    try {
      await api('logout', { token: t });
    } catch {
      /* sesi lokal sudah dibersihkan */
    }
  }
}

// ---------- Koneksi & inisialisasi ----------

export function ping(): Promise<{ version: string; waktu: string }> {
  return api('ping');
}

export function initDatabase(): Promise<{ sheets: string[] }> {
  return api('initDatabase');
}

export function getAllData(): Promise<AllData> {
  return api('getAllData');
}

// ---------- Master (admin) ----------

export function saveJenjang(item: { id?: string; nama: string }): Promise<{ id: string }> {
  return api('saveJenjang', item);
}

export function deleteJenjang(id: string): Promise<unknown> {
  return api('deleteJenjang', { id });
}

export function saveMapel(item: { id?: string; jenjangId: string; nama: string }): Promise<{ id: string }> {
  return api('saveMapel', item);
}

export function deleteMapel(id: string): Promise<unknown> {
  return api('deleteMapel', { id });
}

/** Impor mapel batch (v1.2.1): satu request per batch, duplikat dilewati server. */
export function importMapel(rows: { nama: string; jenjangId: string }[]): Promise<HasilImporMapel> {
  return api('importMapel', { rows });
}

export function saveKelas(item: { id?: string; jenjangId: string; nama: string }): Promise<{ id: string }> {
  return api('saveKelas', item);
}

export function deleteKelas(id: string): Promise<unknown> {
  return api('deleteKelas', { id });
}

// ---------- Pengguna (admin) ----------

export interface SavePenggunaParams {
  id?: string;
  nama: string;
  username: string;
  peran: Peran;
  password?: string;
  nis?: string;
  jenjangId?: string;
  kelasId?: string;
  aktif?: number;
  /** No. WA orang tua (khusus siswa). */
  noHP?: string;
}

export function savePengguna(item: SavePenggunaParams): Promise<{ id: string }> {
  return api('savePengguna', item);
}

export function deletePengguna(id: string): Promise<unknown> {
  return api('deletePengguna', { id });
}

export function resetPassword(id: string, passwordBaru: string): Promise<unknown> {
  return api('resetPassword', { id, passwordBaru });
}

export function importSiswa(rows: BarisSiswa[]): Promise<HasilImpor> {
  return api('importSiswa', { rows });
}

// ---------- Bank soal (guru/admin) ----------

export interface SaveSoalParams {
  id?: string;
  jenjangId: string;
  mapelId: string;
  soal: string;
  /** Jenis soal (v1.0.0). Default 'pg' bila tidak diisi (kompatibel lama). */
  jenis?: JenisSoal;
  /** Opsi pilihan (PG/PGK/BS) — dikirim juga sebagai opsiA–E agar backend lama tetap jalan. */
  opsi?: string[];
  opsiA: string;
  opsiB: string;
  opsiC: string;
  opsiD: string;
  opsiE?: string;
  /** Kunci fleksibel per jenis (lihat types.ts SoalBank.kunci).
   *  Jodoh: array indeks kanan per kiri, mis. [1, 0] (bukan string). */
  kunci: string | number[];
  pasanganKiri?: string[];
  pasanganKanan?: string[];
  kunciJodoh?: Record<number, number>;
  bobot?: number;
  pembahasan?: string;
  gambarUrl?: string;
}

export function saveSoal(item: SaveSoalParams): Promise<{ id: string }> {
  return api('saveSoal', item);
}

export function deleteSoal(id: string): Promise<unknown> {
  return api('deleteSoal', { id });
}

export function importSoal(
  jenjangId: string,
  mapelId: string,
  items: BarisSoalImpor[]
): Promise<HasilImpor> {
  return api('importSoal', { jenjangId, mapelId, items });
}

export function importSoalDariForm(
  formIdOrUrl: string,
  jenjangId: string,
  mapelId: string
): Promise<{ imported: number; dilewati: { judul: string; alasan: string }[] }> {
  return api('importSoalDariForm', { formIdOrUrl, jenjangId, mapelId });
}

// ---------- Paket (guru/admin) ----------

export interface SavePaketParams {
  id?: string;
  nama: string;
  jenjangId: string;
  mapelId: string;
  kelasIds?: string[];
  modeSoal: ModeSoal;
  soalIds?: string[];
  jumlahAcak?: number;
  durasiMenit: number;
  mulai: string;
  selesai: string;
  acakSoal?: number;
  acakOpsi?: number;
  tampilSkor?: number;
  tampilPembahasan?: number;
  aktif?: number;
  /** Token ujian statis (maks. 20 karakter) — field backend: `tokenUjian`
   *  (JANGAN `token` — itu token sesi login). */
  tokenUjian?: string;
  /** Jeda gelombang antar kelas saat mulai ujian (menit, default 3). */
  jedaGelombang?: number;
}

export function savePaket(item: SavePaketParams): Promise<{ id: string }> {
  return api('savePaket', item);
}

export function deletePaket(id: string): Promise<unknown> {
  return api('deletePaket', { id });
}

// ---------- Sesi ujian (siswa) ----------

/**
 * v1.0.0 — Cek token ujian TANPA membuat sesi (dipakai halaman token
 * sebelum petunjuk). Timer baru berjalan saat mulaiSesi dipanggil dari
 * tombol "Mulai Ujian" di halaman petunjuk.
 */
export function verifikasiToken(
  paketId: string,
  tokenUjian?: string
): Promise<{
  valid: boolean;
  paket: { id: string; nama: string; durasiMenit: number; mulai: string; selesai: string; jedaGelombang: number };
}> {
  return api('verifikasiToken', tokenUjian ? { paketId, tokenUjian } : { paketId });
}

/**
 * v1.0.0 — mulai sesi dengan token ujian. Token dikirim sebagai field
 * `tokenUjian` (JANGAN `token` — field itu sudah dipakai token sesi login
 * oleh api()). Token salah -> error jelas dari server, sesi tidak dibuat.
 * Sesi AKTIF yang sudah ada dikembalikan beserta soal yang SAMA
 * (idempotent, untuk resume). Respons membawa `jawaban` (jawaban autosave).
 */
export function mulaiSesi(paketId: string, tokenUjian?: string): Promise<MulaiSesiResponse> {
  return api('mulaiSesi', tokenUjian ? { paketId, tokenUjian } : { paketId });
}

export function getSesi(sesiId: string): Promise<MulaiSesiResponse> {
  return api('getSesi', { sesiId });
}

export function batalkanSesi(sesiId: string, alasan?: string): Promise<{ status: string }> {
  return api('batalkanSesi', { sesiId, alasan });
}

export function catatPeringatan(
  sesiId: string,
  jenis: string
): Promise<{ peringatan: number; dibatalkan: boolean }> {
  return api('catatPeringatan', { sesiId, jenis });
}

export function submitJawaban(sesiId: string, jawaban: JawabanKirim[]): Promise<{ hasil: HasilSubmit }> {
  return api('submitJawaban', { sesiId, jawaban });
}

/**
 * v1.0.0 — Autosave jawaban ke server (batch: seluruh jawaban saat ini).
 * Idempotent (upsert per soalId) sehingga aman di-retry & dipanggil berkala.
 * Dipanggil debounce ~1 detik setelah jawaban berubah, tiap 20 detik,
 * dan saat pindah soal. Gagal -> frontend retry 4x backoff+jitter (lihat
 * AKSI_BOLEH_RETRY) lalu menampilkan status "Tidak tersimpan".
 */
export function simpanJawaban(
  sesiId: string,
  jawaban: JawabanKirim[]
): Promise<{ tersimpan: number }> {
  return api('simpanJawaban', { sesiId, jawaban });
}

/**
 * v1.0.0 — Muat jawaban tersimpan dari server (untuk resume setelah reload
 * / tutup tab). Backend mengembalikan { sesi, jawaban, sisaDetik,
 * waktuMulai, waktuSelesai }; pemanggil umumnya hanya memakai `jawaban`.
 */
export function getJawabanSesi(
  sesiId: string
): Promise<{
  sesi?: { id: string; paketId: string; waktuMulai: string; waktuSelesai: string; status: string; peringatan: number };
  jawaban: JawabanKirim[];
  sisaDetik?: number;
  waktuMulai?: string;
  waktuSelesai?: string;
}> {
  return api('getJawabanSesi', { sesiId });
}

/**
 * v1.0.0 — Submit akhir ujian (nama baru; aksi backend yang dipakai tetap
 * `submitJawaban` agar selaras dengan backend yang sudah ada — penilaian
 * dihitung server, idempotent bila sesi sudah SELESAI).
 */
export function submitUjian(sesiId: string, jawaban: JawabanKirim[]): Promise<{ hasil: HasilSubmit }> {
  return submitJawaban(sesiId, jawaban);
}

/**
 * v1.0.0 — Nilai satu jawaban essay secara manual (guru/admin).
 * AKSI BACKEND BARU `nilaiEssay` — bila backend belum menyediakannya,
 * pemanggil menampilkan error backend apa adanya (jangan mengarang nilai).
 * @param skor 0..bobot soal tersebut.
 */
export function nilaiEssay(
  sesiId: string,
  soalId: string,
  skor: number
): Promise<{ hasil: HasilSubmit }> {
  return api('nilaiEssay', { sesiId, soalId, skor });
}

export function resetSesi(
  username: string,
  paketId: string
): Promise<{ sesiDihapus: number; hasilDihapus: number }> {
  return api('resetSesi', { username, paketId });
}

// ---------- Hasil & monitor ----------

export function rekapHasil(
  paketId: string
): Promise<{ paket: { id: string; nama: string }; rows: BarisRekap[] }> {
  return api('rekapHasil', { paketId });
}

/**
 * Hasil siswa — SELARAS dengan backend actionGetHasilSiswa:
 * data = ARRAY objek hasil (bukan { hasil:[...] }); `rincian` menempel
 * pada tiap item hasil bila paket tampilPembahasan=1 & sesi SELESAI.
 */
export function getHasilSiswa(paketId?: string): Promise<HasilUjian[]> {
  return api('getHasilSiswa', paketId ? { paketId } : {});
}

export function monitorSesi(paketId?: string): Promise<SesiRingkas[]> {
  return api('monitorSesi', paketId ? { paketId } : {});
}

// ---------- Analisis nilai & notifikasi ----------

/**
 * Analisis siswa — siswa tanpa argumen = data sendiri; guru/admin boleh
 * mengisi username untuk melihat siswa tertentu. Kunci & pembahasan
 * TIDAK PERNAH dikembalikan (selaras backend).
 */
export function getAnalisisSiswa(username?: string): Promise<AnalisisSiswaData> {
  return api('getAnalisisSiswa', username ? { username } : {});
}

export function getAnalisisKelas(paketId?: string, kelasId?: string): Promise<AnalisisKelasData> {
  const params: Record<string, string> = {};
  if (paketId) params.paketId = paketId;
  if (kelasId) params.kelasId = kelasId;
  return api('getAnalisisKelas', params);
}

export function kirimNotifikasiProgres(input: {
  usernames?: string[];
  kelasId?: string;
  template?: string;
}): Promise<HasilKirimNotifikasi> {
  return api('kirimNotifikasiProgres', input);
}

export function getNotifikasi(): Promise<NotifikasiLog[]> {
  return api('getNotifikasi');
}

// ---------- Pengaturan & upload ----------

export function savePengaturan(pengaturan: Pengaturan): Promise<unknown> {
  return api('savePengaturan', { pengaturan });
}

export function uploadLogo(dataBase64: string, mimeType: string): Promise<{ url: string; fileId: string }> {
  return api('uploadLogo', { dataBase64, mimeType });
}

export function uploadGambarSoal(
  dataBase64: string,
  mimeType: string,
  namaFile?: string
): Promise<{ url: string; fileId: string }> {
  return api('uploadGambarSoal', { dataBase64, mimeType, namaFile });
}

export type { OpsiUjian };
