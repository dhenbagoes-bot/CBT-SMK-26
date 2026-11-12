// Tipe bersama wwn-cbt-madrasah-80 — nama field disesuaikan PERSIS dengan API_CONTRACT.md.

export type Peran = 'admin' | 'guru' | 'siswa';

/** Jenis soal — 6 jenis (v1.0.0). */
export type JenisSoal = 'pg' | 'pgk' | 'bs' | 'jodoh' | 'isian' | 'essay';

export const LABEL_JENIS_SOAL: Record<JenisSoal, string> = {
  pg: 'Pilihan Ganda',
  pgk: 'Pilihan Ganda Kompleks',
  bs: 'Benar / Salah',
  jodoh: 'Menjodohkan',
  isian: 'Isian Singkat',
  essay: 'Essay',
};

export const SEMUA_JENIS_SOAL: JenisSoal[] = ['pg', 'pgk', 'bs', 'jodoh', 'isian', 'essay'];

/** Pengaturan sekolah (wire: angka untuk flag; wa* berupa string). */
export interface Pengaturan {
  namaSekolah: string;
  alamatSekolah: string;
  telepon: string;
  namaKepala: string;
  logoUrl: string;
  ambangPeringatan: number;
  wajibFullscreen: number;
  izinkanUlangSetelahBatal: number;
  kkm: number;
  /** Durasi standar ujian (menit) — dikelola admin, nilai awal tiap ujian baru. */
  durasiStandar: number;
  /** Jeda gelombang antar kelas (menit) — dikelola admin, nilai awal tiap paket baru. */
  jedaGelombang: number;
  waAktif: string;
  waEndpoint: string;
  waApiKey: string;
  waTemplateProgres: string;
}

export interface Jenjang {
  id: string;
  nama: string;
}

export interface Mapel {
  id: string;
  jenjangId: string;
  nama: string;
}

export interface Kelas {
  id: string;
  jenjangId: string;
  nama: string;
}

export interface Pengguna {
  id: string;
  nama: string;
  username: string;
  peran: Peran;
  nis: string;
  jenjangId: string;
  kelasId: string;
  aktif: number;
  /** No. WA orang tua (khusus siswa). */
  noHP: string;
}

export interface SoalBank {
  id: string;
  jenjangId: string;
  mapelId: string;
  soal: string;
  /** Jenis soal (v1.0.0). Soal lama tanpa field ini = 'pg'. */
  jenis: JenisSoal;
  /** Opsi pilihan (PG/PGK/BS). Kompatibel dengan opsiA–E lama. */
  opsi: string[];
  opsiA: string;
  opsiB: string;
  opsiC: string;
  opsiD: string;
  opsiE: string;
  /**
   * Kunci fleksibel per jenis:
   * - pg: satu huruf 'A'–'E'
   * - pgk: huruf dipisah koma, mis. 'A,C'
   * - bs: 'Benar' | 'Salah'
   * - isian: teks jawaban (cocok case-insensitive, spasi berlebih diabaikan)
   * - jodoh: dipakai bersama kunciJodoh (kunci = '' bila kunciJodoh ada)
   * - essay: '' (dinilai manual)
   */
  kunci: string;
  /** Menjodohkan: daftar kiri & kanan (indeks berpasangan di kunciJodoh). */
  pasanganKiri: string[];
  pasanganKanan: string[];
  /** Menjodohkan: peta indeks kiri -> indeks kanan, mis. {0:1, 1:0}. */
  kunciJodoh: Record<number, number>;
  bobot: number;
  pembahasan: string;
  gambarUrl: string;
  dibuatPada: string;
}

/**
 * Normalisasi soal dari backend: soal lama (tanpa `jenis`, hanya opsiA–E
 * + kunci huruf) dibaca sebagai PG; field baru yang belum ada di backend
 * lama diisi default aman. Selalu kembalikan objek lengkap.
 */
export function normalisasiSoalBank(s: Partial<SoalBank> & { id: string }): SoalBank {
  const opsiA = s.opsiA || (s.opsi && s.opsi[0]) || '';
  const opsiB = s.opsiB || (s.opsi && s.opsi[1]) || '';
  const opsiC = s.opsiC || (s.opsi && s.opsi[2]) || '';
  const opsiD = s.opsiD || (s.opsi && s.opsi[3]) || '';
  const opsiE = s.opsiE || (s.opsi && s.opsi[4]) || '';
  const opsi = Array.isArray(s.opsi) && s.opsi.length > 0
    ? s.opsi
    : [opsiA, opsiB, opsiC, opsiD, opsiE];
  const jenis: JenisSoal = s.jenis && SEMUA_JENIS_SOAL.includes(s.jenis) ? s.jenis : 'pg';
  return {
    id: s.id,
    jenjangId: s.jenjangId || '',
    mapelId: s.mapelId || '',
    soal: s.soal || '',
    jenis,
    opsi,
    opsiA,
    opsiB,
    opsiC,
    opsiD,
    opsiE,
    kunci: s.kunci || '',
    pasanganKiri: Array.isArray(s.pasanganKiri) ? s.pasanganKiri : [],
    pasanganKanan: Array.isArray(s.pasanganKanan) ? s.pasanganKanan : [],
    kunciJodoh: s.kunciJodoh && typeof s.kunciJodoh === 'object' ? s.kunciJodoh : {},
    bobot: typeof s.bobot === 'number' && s.bobot >= 1 ? s.bobot : 1,
    pembahasan: s.pembahasan || '',
    gambarUrl: s.gambarUrl || '',
    dibuatPada: s.dibuatPada || '',
  };
}

export type ModeSoal = 'manual' | 'acak';

export interface Paket {
  id: string;
  nama: string;
  jenjangId: string;
  mapelId: string;
  kelasIds: string[];
  modeSoal: ModeSoal;
  soalIds: string[];
  jumlahAcak: number;
  durasiMenit: number;
  mulai: string;
  selesai: string;
  acakSoal: number;
  acakOpsi: number;
  tampilSkor: number;
  tampilPembahasan: number;
  aktif: number;
  jumlahSoal: number;
  /** Token ujian (6 karakter) — dibuat guru/admin; wajib diisi siswa untuk mulai. */
  token: string;
  /** Jeda gelombang antar kelas saat mulai ujian (menit, default 3). */
  jedaGelombang: number;
}

export type StatusSesi = 'AKTIF' | 'SELESAI' | 'BATAL';

export interface SesiRingkas {
  id: string;
  paketId: string;
  namaPaket: string;
  username: string;
  namaSiswa: string;
  kelas: string;
  waktuMulai: string;
  waktuSelesai: string;
  status: StatusSesi;
  peringatan: number;
}

export interface HasilUjian {
  id: string;
  sesiId: string;
  paketId: string;
  namaPaket: string;
  username: string;
  namaSiswa: string;
  kelas: string;
  benar: number;
  salah: number;
  kosong: number;
  skor: number;
  totalBobot: number;
  nilai: number;
  waktuSubmit: string;
  /** Status hasil dari server: 'Tuntas' | 'Belum Tuntas' | 'Menunggu penilaian'. */
  status?: string;
  /** Jumlah essay terjawab yang belum dinilai guru (0 = nilai final). */
  essayBelumDinilai?: number;
  /** true bila tidak ada essay yang menunggu penilaian. */
  nilaiFinal?: boolean;
  /** true bila nilaiFinal dan nilai >= KKM. */
  tuntas?: boolean;
  /** true bila ada essay yang belum dinilai guru — nilai masih sementara. */
  menungguEssay?: boolean;
  /** Rincian per soal — hanya dari getHasilSiswa bila paket tampilPembahasan=1. */
  rincian?: RincianSoal[];
}

/** Seluruh data getAllData (sudah difilter server sesuai peran). */
export interface AllData {
  pengaturan: Pengaturan;
  jenjang: Jenjang[];
  mapel: Mapel[];
  kelas: Kelas[];
  pengguna: Pengguna[];
  bankSoal: SoalBank[];
  paket: Paket[];
  sesi: SesiRingkas[];
  hasil: HasilUjian[];
}

/** Sesi login — token HANYA di memori, tidak pernah disimpan ke storage. */
export interface UserSesi {
  nama: string;
  username: string;
  peran: Peran;
  nis: string;
  jenjangId: string;
  kelasId: string;
}

export interface SekolahEntry {
  id: string;
  nama: string;
  kota: string;
  apiUrl: string;
}

export interface ToastMsg {
  id: number;
  pesan: string;
  tipe: 'info' | 'sukses' | 'error';
}

export type PageKey =
  | 'dashboard'
  | 'bank-soal'
  | 'paket'
  | 'ujian'
  | 'monitor'
  | 'hasil'
  | 'analisis-saya'
  | 'analisis-kelas'
  | 'laporan'
  | 'kelola-data'
  | 'pengaturan'
  | 'konfigurasi'
  | 'login';

// ---------- Ruang ujian ----------

/** Soal seperti dikembalikan mulaiSesi/getSesi — TANPA kunci/pembahasan. */
export interface OpsiUjian {
  kode: string; // 'A'..'E' (kode asli)
  teks: string;
}

export interface SoalUjian {
  id: string;
  teks: string;
  gambarUrl: string;
  /** Jenis soal (default 'pg' bila backend lama tidak mengirim). */
  jenis: JenisSoal;
  opsi: OpsiUjian[];
  /** Menjodohkan: sisi kiri (tetap) & kanan (boleh diacak server). */
  pasanganKiri?: string[];
  pasanganKanan?: string[];
}

export interface SesiAktif {
  id: string;
  paketId: string;
  waktuMulai: string;
  waktuSelesai: string;
  status: StatusSesi;
  peringatan: number;
}

export interface MulaiSesiResponse {
  sesi: SesiAktif;
  soal: SoalUjian[];
  /** Jawaban autosave dari server (nama field backend: `jawaban`). */
  jawaban?: JawabanKirim[];
  /** Nama lama (deprecated) — dipertahankan sebagai fallback bila backend lama mengirimnya. */
  jawabanTersimpan?: JawabanKirim[];
  /** Sisa waktu ujian dalam detik (dikirim getSesi). */
  sisaDetik?: number;
}

/**
 * Jawaban satu soal — diserialkan sebagai string agar satu format untuk semua jenis:
 * - pg: kode 'A'–'E' · pgk: kode dipisah koma, mis. 'A,C'
 * - bs: 'Benar' | 'Salah' · isian/essay: teks jawaban
 * - jodoh: JSON peta indeks kiri -> indeks kanan, mis. '{"0":1,"1":0}'
 * String kosong = belum dijawab.
 */
export interface JawabanKirim {
  soalId: string;
  jawaban: string;
}

export interface HasilSubmit {
  id: string;
  benar: number;
  salah: number;
  kosong: number;
  skor: number;
  totalBobot: number;
  nilai: number;
  waktuSubmit: string;
  /** 'Tuntas' | 'Belum Tuntas' | 'Menunggu penilaian'. */
  status?: string;
  /** Jumlah essay terjawab yang belum dinilai guru (0 = nilai final). */
  essayBelumDinilai?: number;
  nilaiFinal?: boolean;
  tuntas?: boolean;
}

// ---------- Rekap & rincian ----------

export interface BarisRekap {
  username: string;
  nis: string;
  nama: string;
  kelas: string;
  status: 'Selesai' | 'Mengerjakan' | 'Dibatalkan' | 'Belum mulai';
  nilai: number;
  benar: number;
  totalSoal: number;
  waktuSubmit: string;
  peringatan: number;
}

export interface RincianSoal {
  soalId: string;
  teks: string;
  /** Jenis soal ('pg' | 'pgk' | 'bs' | 'jodoh' | 'isian' | 'essay'). */
  jenis?: JenisSoal;
  opsi: OpsiUjian[];
  kunci: string;
  pembahasan: string;
  /** Jawaban siswa mentah (jodoh: string JSON peta; essay: teks bebas). */
  jawabanSiswa: string;
  benar: boolean;
  /** Skor yang diperoleh soal ini (0..bobot). */
  skor?: number;
  bobot?: number;
  /** true bila essay sudah dijawab tapi belum dinilai guru. */
  menungguPenilaian?: boolean;
  /** Menjodohkan: sisi kiri & kanan, dan kunci pasangan (array indeks kanan). */
  pasanganKiri?: string[];
  pasanganKanan?: string[];
  kunciPasangan?: number[];
}

// ---------- Impor ----------

export interface BarisSiswa {
  nama: string;
  nis: string;
  kelas: string;
  jenjang?: string;
  username?: string;
  password?: string;
  /** No. WA orang tua. */
  noHP?: string;
}

export interface BarisSoalImpor {
  soal: string;
  jenis?: JenisSoal;
  opsiA: string;
  opsiB: string;
  opsiC: string;
  opsiD: string;
  opsiE?: string;
  /** Kunci fleksibel per jenis (lihat SoalBank.kunci).
   *  Jodoh: array indeks kanan per kiri, mis. [1, 0] (bukan string). */
  kunci: string | number[];
  /** Menjodohkan: pasangan kiri & kanan (urutan sejajar). */
  pasanganKiri?: string[];
  pasanganKanan?: string[];
  /** Menjodohkan: peta indeks kiri -> indeks kanan. */
  kunciJodoh?: Record<number, number>;
  bobot?: number;
  pembahasan?: string;
}

export interface HasilImpor {
  imported: number;
  updated: number;
  errors: { baris: number; pesan: string }[];
}

// ---------- Analisis nilai & notifikasi ----------

export interface RingkasanSiswa {
  totalUjian: number;
  rataRata: number;
  nilaiTertinggi: number;
  mapelTerkuat: string;
  mapelTerlemah: string;
}

export interface StatMapel {
  mapelId: string;
  namaMapel: string;
  totalDikerjakan: number;
  benar: number;
  pct: number;
  nilaiRata: number;
  tuntas: boolean;
}

export interface TrenNilai {
  paketId: string;
  namaPaket: string;
  nilai: number;
  waktuSubmit: string;
}

export interface AnalisisSiswaData {
  ringkasan: RingkasanSiswa;
  perMapel: StatMapel[];
  tren: TrenNilai[];
}

export interface StatKelas {
  jumlah: number;
  rata2: number;
  min: number;
  maks: number;
  median: number;
  ketuntasanPct: number;
}

export interface DistribusiItem {
  rentang: string;
  jumlah: number;
}

export interface SiswaNilai {
  username: string;
  namaSiswa: string;
  kelas: string;
  nilai: number;
}

export interface ButirSoal {
  soalId: string;
  teks: string;
  dijawab: number;
  benar: number;
  pctBenar: number;
  klasifikasi: 'Sangat Mudah' | 'Mudah' | 'Sedang' | 'Sukar' | 'Sangat Sukar';
  dayaBeda: number | null;
}

export interface AnalisisKelasData {
  statistik: StatKelas;
  distribusi: DistribusiItem[];
  teratas: SiswaNilai[];
  terbawah: SiswaNilai[];
  butirSoal: ButirSoal[];
}

export interface NotifikasiLog {
  id: string;
  waktu: string;
  username: string;
  namaSiswa: string;
  noHP: string;
  jenis: string;
  isi: string;
  status: string;
}

export interface HasilKirimNotifikasi {
  total: number;
  terkirim: number;
  dilewati: number;
  detail: { username: string; nama: string; status: string }[];
}
