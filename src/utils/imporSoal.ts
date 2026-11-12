/**
 * Impor soal CBT — TANPA library tambahan (pola manual seperti templateSoal.ts
 * di proyek TTS, diperluas dengan reader & writer .xlsx tulisan tangan).
 *
 * Format .txt per blok (dipisah baris kosong):
 *   JENIS: pg | pgk | bs | jodoh | isian | essay   (bila kosong = pg)
 *   SOAL: Teks soal...
 *   A: opsi A ... E: opsi E (opsional)   [khusus pg/pgk]
 *   KUNCI: A            [pg]  |  A,C    [pgk]  |  Benar/Salah [bs]
 *          | teks jawaban [isian]  |  1-2,2-1,3-3 [jodoh, nomor kiri-kanan]
 *          | (kosong untuk essay — dinilai manual)
 *   PASANGAN: kiri | kanan   [jodoh: satu baris per pasangan; bila KUNCI
 *          jodoh kosong, pasangan dianggap sudah berurutan benar]
 *   BOBOT: 1
 *   PEMBAHASAN: teks (opsional)
 *
 * Format .xlsx: kolom No|Jenis|Soal|A|B|C|D|E|Kunci|Bobot|Pembahasan|
 *   PasanganKiri|PasanganKanan|KunciJodoh (header fleksibel; pasangan
 *   dipisah '|' dalam satu sel, KunciJodoh '1-2,2-1').
 * Format .docx: diekstrak jadi teks lalu di-parse seperti .txt (mode longgar).
 */

export type JenisSoalImpor = 'pg' | 'pgk' | 'bs' | 'jodoh' | 'isian' | 'essay';

export interface ItemSoalImpor {
  soal: string;
  /** Jenis soal (v1.0.0). Default 'pg'. */
  jenis: JenisSoalImpor;
  opsiA: string;
  opsiB: string;
  opsiC: string;
  opsiD: string;
  opsiE: string;
  /**
   * Kunci fleksibel: pg -> 'A'..'E'; pgk -> 'A,C'; bs -> 'Benar'/'Salah';
   * isian -> teks jawaban; jodoh -> '' (lihat kunciJodoh); essay -> ''.
   */
  kunci: string;
  /** Menjodohkan: pasangan kiri & kanan. */
  pasanganKiri: string[];
  pasanganKanan: string[];
  /** Menjodohkan: peta indeks kiri -> indeks kanan (0-based). */
  kunciJodoh: Record<number, number>;
  bobot: number;
  pembahasan: string;
}

export interface BarisSoalImpor {
  no: number;
  item: Partial<ItemSoalImpor>;
  valid: boolean;
  galat: string;
}

export interface HasilParseSoal {
  baris: BarisSoalImpor[];
  valid: ItemSoalImpor[];
}

const SOAL_DASAR = {
  jenis: 'pg' as const,
  pasanganKiri: [] as string[],
  pasanganKanan: [] as string[],
  kunciJodoh: {} as Record<number, number>,
};

export const CONTOH_SOAL: ItemSoalImpor[] = [
  {
    ...SOAL_DASAR,
    soal: 'Ibukota negara Indonesia adalah...',
    opsiA: 'Surabaya',
    opsiB: 'Jakarta',
    opsiC: 'Bandung',
    opsiD: 'Medan',
    opsiE: 'Makassar',
    kunci: 'B',
    bobot: 1,
    pembahasan: 'Jakarta adalah ibukota negara Indonesia.',
  },
  {
    ...SOAL_DASAR,
    soal: 'Hasil dari 12 + 8 × 2 adalah...',
    opsiA: '40',
    opsiB: '36',
    opsiC: '28',
    opsiD: '32',
    opsiE: '',
    kunci: 'C',
    bobot: 2,
    pembahasan: 'Perkalian dikerjakan dulu: 8 × 2 = 16, lalu 12 + 16 = 28.',
  },
  {
    ...SOAL_DASAR,
    soal: 'The cat is ... the table.',
    opsiA: 'on',
    opsiB: 'in',
    opsiC: 'at',
    opsiD: 'under',
    opsiE: '',
    kunci: 'D',
    bobot: 1,
    pembahasan: 'Kucing berada di bawah meja: under the table.',
  },
  {
    ...SOAL_DASAR,
    jenis: 'pgk',
    soal: 'Manakah berikut ini yang termasuk bilangan prima? (boleh lebih dari satu jawaban)',
    opsiA: '2',
    opsiB: '3',
    opsiC: '4',
    opsiD: '5',
    opsiE: '6',
    kunci: 'A,B,D',
    bobot: 2,
    pembahasan: 'Bilangan prima: 2, 3, dan 5.',
  },
  {
    ...SOAL_DASAR,
    jenis: 'bs',
    soal: 'Air mendidih pada suhu 100 derajat Celsius di permukaan laut.',
    opsiA: '',
    opsiB: '',
    opsiC: '',
    opsiD: '',
    opsiE: '',
    kunci: 'Benar',
    bobot: 1,
    pembahasan: '',
  },
  {
    ...SOAL_DASAR,
    jenis: 'jodoh',
    soal: 'Jodohkan nama kota dengan provinsinya.',
    opsiA: '',
    opsiB: '',
    opsiC: '',
    opsiD: '',
    opsiE: '',
    kunci: '',
    pasanganKiri: ['Semarang', 'Surabaya', 'Bandung'],
    pasanganKanan: ['Jawa Tengah', 'Jawa Timur', 'Jawa Barat'],
    kunciJodoh: { 0: 0, 1: 1, 2: 2 },
    bobot: 3,
    pembahasan: '',
  },
  {
    ...SOAL_DASAR,
    jenis: 'isian',
    soal: 'Hasil dari 7 × 8 adalah ...',
    opsiA: '',
    opsiB: '',
    opsiC: '',
    opsiD: '',
    opsiE: '',
    kunci: '56',
    bobot: 1,
    pembahasan: '',
  },
  {
    ...SOAL_DASAR,
    jenis: 'essay',
    soal: 'Jelaskan dengan bahasamu sendiri mengapa kita harus menjaga kebersihan lingkungan madrasah!',
    opsiA: '',
    opsiB: '',
    opsiC: '',
    opsiD: '',
    opsiE: '',
    kunci: '',
    bobot: 5,
    pembahasan: 'Dinilai manual oleh guru (0 sampai bobot soal).',
  },
];

// ---------------------------------------------------------------------------
// ZIP manual (disalin dari pola templateSoal.ts wwn-tts-80): writer metode
// store + reader (store & deflate via DecompressionStream)
// ---------------------------------------------------------------------------

const CRC_TABEL: Uint32Array = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABEL[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export const TE = new TextEncoder();
export const TD = new TextDecoder('utf-8');

function u16(v: number): number[] {
  return [v & 0xff, (v >>> 8) & 0xff];
}
function u32(v: number): number[] {
  return [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
}

export interface ZipEntri {
  nama: string;
  data: Uint8Array;
}

/** Rakit arsip ZIP dengan semua entri metode store (tanpa kompresi). */
export function bangunZip(entris: ZipEntri[]): Uint8Array<ArrayBuffer> {
  const file: number[] = [];
  const info: { namaB: Uint8Array; crc: number; offset: number; panjang: number }[] = [];
  for (const e of entris) {
    const namaB = TE.encode(e.nama);
    const crc = crc32(e.data);
    info.push({ namaB, crc, offset: file.length, panjang: e.data.length });
    file.push(
      ...u32(0x04034b50),
      ...u16(20),
      ...u16(0x0800),
      ...u16(0),
      ...u16(0),
      ...u16(0x5821),
      ...u32(crc),
      ...u32(e.data.length),
      ...u32(e.data.length),
      ...u16(namaB.length),
      ...u16(0),
    );
    for (const b of namaB) file.push(b);
    for (const b of e.data) file.push(b);
  }
  const offSentral = file.length;
  for (const { namaB, crc, offset, panjang } of info) {
    file.push(
      ...u32(0x02014b50),
      ...u16(20),
      ...u16(20),
      ...u16(0x0800),
      ...u16(0),
      ...u16(0),
      ...u16(0x5821),
      ...u32(crc),
      ...u32(panjang),
      ...u32(panjang),
      ...u16(namaB.length),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u32(0),
      ...u32(offset),
    );
    for (const b of namaB) file.push(b);
  }
  const ukuranSentral = file.length - offSentral;
  file.push(
    ...u32(0x06054b50),
    ...u16(0),
    ...u16(0),
    ...u16(entris.length),
    ...u16(entris.length),
    ...u32(ukuranSentral),
    ...u32(offSentral),
    ...u16(0),
  );
  return new Uint8Array(file);
}

function bacaU16(dv: DataView, o: number): number {
  return dv.getUint16(o, true);
}
function bacaU32(dv: DataView, o: number): number {
  return dv.getUint32(o, true);
}

/** Ambil isi sebuah file di dalam arsip ZIP (mendukung store & deflate). */
export async function bacaZip(buffer: ArrayBuffer, namaFile: string): Promise<Uint8Array> {
  const dv = new DataView(buffer);
  let eocd = -1;
  const batas = Math.max(0, dv.byteLength - 22 - 65535);
  for (let i = dv.byteLength - 22; i >= batas; i--) {
    if (bacaU32(dv, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Bukan arsip ZIP yang valid.');
  const jumlah = bacaU16(dv, eocd + 10);
  const offSentral = bacaU32(dv, eocd + 16);
  const target = TE.encode(namaFile);
  let ketemu: { metode: number; ukuran: number; offLokal: number } | null = null;
  let p = offSentral;
  for (let i = 0; i < jumlah; i++) {
    if (bacaU32(dv, p) !== 0x02014b50) throw new Error('Direktori ZIP rusak.');
    const metode = bacaU16(dv, p + 10);
    // p+20 = ukuran TERKOMPRESI (p+24 = ukuran asli). Potongan data HARUS
    // sepanjang ukuran terkompresi; memakai ukuran asli membuat DecompressionStream
    // menerima byte sisa setelah akhir stream deflate -> error "trailing junk"
    // untuk SEMUA file .xlsx/.docx asli Excel (metode deflate). File dari writer
    // aplikasi sendiri (metode store) tidak kena karena kedua ukuran sama —
    // itulah sebabnya bug ini lolos dari tes (v1.2.2).
    const ukuran = bacaU32(dv, p + 20);
    const pNama = bacaU16(dv, p + 28);
    const pEkstra = bacaU16(dv, p + 30);
    const pKomen = bacaU16(dv, p + 32);
    const offLokal = bacaU32(dv, p + 42);
    const nama = new Uint8Array(buffer, p + 46, pNama);
    let sama = nama.length === target.length;
    if (sama) for (let j = 0; j < nama.length; j++) if (nama[j] !== target[j]) { sama = false; break; }
    if (sama) {
      ketemu = { metode, ukuran, offLokal };
      break;
    }
    p += 46 + pNama + pEkstra + pKomen;
  }
  if (!ketemu) throw new Error(`File "${namaFile}" tidak ada di arsip.`);
  const lpNama = bacaU16(dv, ketemu.offLokal + 26);
  const lpEkstra = bacaU16(dv, ketemu.offLokal + 28);
  const awal = ketemu.offLokal + 30 + lpNama + lpEkstra;
  const data = new Uint8Array(buffer, awal, ketemu.ukuran);
  if (ketemu.metode === 0) return data.slice();
  if (ketemu.metode === 8) {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('Lingkungan tidak mendukung dekompresi ZIP.');
    }
    const aliran = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(aliran).arrayBuffer());
  }
  throw new Error('Metode kompresi ZIP tidak didukung.');
}

/** Coba baca file di arsip; kembalikan null bila tidak ada. */
async function bacaZipOpsional(buffer: ArrayBuffer, namaFile: string): Promise<Uint8Array | null> {
  try {
    return await bacaZip(buffer, namaFile);
  } catch {
    return null;
  }
}

function dekodeEntitasXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

// ---------------------------------------------------------------------------
// Reader .docx: ekstrak teks (disalin dari pola templateSoal.ts wwn-tts-80)
// ---------------------------------------------------------------------------

/**
 * Ekstrak teks dari word/document.xml dengan satu lintasan state machine:
 * tiap paragraf menjadi satu baris, tiap baris tabel menjadi "sel1 | sel2".
 */
export function ekstrakTeksDocumentXml(xml: string): string[] {
  const baris: string[] = [];
  const re = /<w:(p|tbl|tr|tc)(\s[^>]*)?>|<\/w:(p|tbl|tr|tc)>|<w:t(\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\s*\/>/g;
  let teksParagraf = '';
  let selAktif: string[] | null = null;
  let teksSel = '';
  let diDalamSel = false;

  const tutupParagraf = () => {
    const t = teksParagraf.trim();
    if (diDalamSel) {
      if (t) teksSel += (teksSel ? ' ' : '') + t;
    } else {
      // Paragraf kosong ikut dikembalikan sebagai '' — pemisah blok soal.
      // (Dulu dibuang sehingga blok-blok .docx menempel dan JENIS soal
      // berikutnya menimpa soal sebelumnya.)
      baris.push(t);
    }
    teksParagraf = '';
  };

  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const cocok = m[0];
    const buka = m[1];
    const tutup = m[3];
    const isiT = m[5];
    if (cocok.startsWith('<w:tab')) {
      if (diDalamSel) teksSel += ' ';
      else teksParagraf += ' ';
    } else if (isiT !== undefined) {
      const t = dekodeEntitasXml(isiT);
      if (diDalamSel) teksSel += t;
      else teksParagraf += t;
    } else if (buka) {
      if (buka === 'tr') selAktif = [];
      else if (buka === 'tc') {
        diDalamSel = true;
        teksSel = '';
      }
    } else if (tutup) {
      if (tutup === 'tc') {
        if (selAktif) selAktif.push(teksSel.trim());
        diDalamSel = false;
        teksSel = '';
      } else if (tutup === 'tr') {
        if (selAktif && selAktif.length > 0) baris.push(selAktif.join(' | '));
        selAktif = null;
      } else if (tutup === 'p') {
        tutupParagraf();
      }
    }
  }
  return baris;
}

/** Baca file .docx lalu kembalikan baris-baris teksnya. */
export async function ekstrakTeksDocx(buffer: ArrayBuffer): Promise<string[]> {
  const xmlB = await bacaZip(buffer, 'word/document.xml');
  return ekstrakTeksDocumentXml(TD.decode(xmlB));
}

// ---------------------------------------------------------------------------
// Validasi & parse format blok .txt
// ---------------------------------------------------------------------------

const KUNCI_VALID = new Set(['A', 'B', 'C', 'D', 'E']);

export const ALIAS_JENIS: Record<string, JenisSoalImpor> = {
  pg: 'pg',
  'pilihan ganda': 'pg',
  'pilihan ganda kompleks': 'pgk',
  pgk: 'pgk',
  kompleks: 'pgk',
  bs: 'bs',
  'benar/salah': 'bs',
  'benar salah': 'bs',
  jodoh: 'jodoh',
  menjodohkan: 'jodoh',
  isian: 'isian',
  'isian singkat': 'isian',
  essay: 'essay',
  esai: 'essay',
  uraian: 'essay',
};

/** Normalisasi label jenis dari file (tidak dikenal -> 'pg' + tetap valid sebagai PG). */
export function normalisasiJenis(v: string | undefined): JenisSoalImpor {
  const k = (v || '').trim().toLowerCase();
  return ALIAS_JENIS[k] || 'pg';
}

function normalisasiDuplikat(s: string): string {
  return (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Urai kunci PGK 'A,C' -> huruf valid. */
function uraiKunciPgk(kunci: string): string[] {
  return kunci.split(',').map((k) => k.trim().toUpperCase()).filter(Boolean);
}

/** Kembalikan pesan galat, atau '' bila item valid. Validasi bercabang per jenis soal. */
export function validasiItemSoal(
  item: Partial<ItemSoalImpor>,
  sudahAda: Set<string>
): string {
  const soal = (item.soal || '').trim();
  if (!soal) return 'Soal kosong';
  const jenis = normalisasiJenis(item.jenis as string | undefined);
  const kunciRaw = (item.kunci || '').trim();
  const bobot = item.bobot;
  if (bobot !== undefined && (!Number.isInteger(bobot) || bobot < 1)) return 'Bobot harus bilangan bulat ≥ 1';
  const opsi: Record<string, string | undefined> = { A: item.opsiA, B: item.opsiB, C: item.opsiC, D: item.opsiD, E: item.opsiE };

  if (jenis === 'pg') {
    if (!(item.opsiA || '').trim()) return 'Opsi A kosong';
    if (!(item.opsiB || '').trim()) return 'Opsi B kosong';
    if (!(item.opsiC || '').trim()) return 'Opsi C kosong';
    if (!(item.opsiD || '').trim()) return 'Opsi D kosong';
    const kunci = kunciRaw.toUpperCase();
    if (!KUNCI_VALID.has(kunci)) return 'Kunci harus salah satu dari A–E';
    if (!(opsi[kunci] || '').trim()) return `Opsi ${kunci} yang dipilih sebagai kunci kosong`;
  } else if (jenis === 'pgk') {
    if (!(item.opsiA || '').trim()) return 'Opsi A kosong';
    if (!(item.opsiB || '').trim()) return 'Opsi B kosong';
    if (!(item.opsiC || '').trim()) return 'Opsi C kosong';
    if (!(item.opsiD || '').trim()) return 'Opsi D kosong';
    const daftar = uraiKunciPgk(kunciRaw);
    if (daftar.length < 2) return 'Kunci PG Kompleks: isi minimal 2 huruf, mis. A,C';
    for (const k of daftar) {
      if (!KUNCI_VALID.has(k)) return `Kunci PG Kompleks tidak valid: ${k} (harus A–E)`;
      if (!(opsi[k] || '').trim()) return `Opsi ${k} yang dipilih sebagai kunci kosong`;
    }
  } else if (jenis === 'bs') {
    const k = kunciRaw.toLowerCase();
    if (k !== 'benar' && k !== 'salah') return 'Kunci Benar/Salah harus "Benar" atau "Salah"';
  } else if (jenis === 'jodoh') {
    const kiri = (item.pasanganKiri || []).filter((x) => x.trim());
    const kanan = (item.pasanganKanan || []).filter((x) => x.trim());
    if (kiri.length < 2) return 'Menjodohkan: isi minimal 2 pasangan kiri';
    if (kanan.length < 2) return 'Menjodohkan: isi minimal 2 pasangan kanan';
    if (kiri.length !== kanan.length) return 'Menjodohkan: jumlah pasangan kiri & kanan harus sama';
    const kj = item.kunciJodoh || {};
    for (let i = 0; i < kiri.length; i++) {
      const target = kj[i];
      if (target === undefined || !Number.isInteger(target) || target < 0 || target >= kanan.length) {
        return `Menjodohkan: kunci pasangan ke-${i + 1} tidak valid`;
      }
    }
  } else if (jenis === 'isian') {
    if (!kunciRaw) return 'Kunci isian (teks jawaban) wajib diisi';
  } else if (jenis === 'essay') {
    // tanpa kunci — dinilai manual guru
  }
  const norm = normalisasiDuplikat(soal);
  if (sudahAda.has(norm)) return 'Soal duplikat (teks soal sama)';
  return '';
}

function itemLengkap(item: Partial<ItemSoalImpor>): ItemSoalImpor {
  const jenis = normalisasiJenis(item.jenis as string | undefined);
  const kunciRaw = (item.kunci || '').trim();
  // PG/PGK: normalisasi huruf ke kapital; BS: kapital awal; isian: apa adanya.
  const kunci =
    jenis === 'pg'
      ? kunciRaw.toUpperCase()
      : jenis === 'pgk'
        ? uraiKunciPgk(kunciRaw).join(',')
        : jenis === 'bs'
          ? kunciRaw.toLowerCase() === 'salah'
            ? 'Salah'
            : 'Benar'
          : kunciRaw;
  const bobotRaw = item.bobot;
  const bobot = Number.isInteger(bobotRaw) && (bobotRaw as number) >= 1 ? (bobotRaw as number) : 1;
  return {
    soal: (item.soal || '').trim(),
    jenis,
    opsiA: (item.opsiA || '').trim(),
    opsiB: (item.opsiB || '').trim(),
    opsiC: (item.opsiC || '').trim(),
    opsiD: (item.opsiD || '').trim(),
    opsiE: (item.opsiE || '').trim(),
    kunci,
    pasanganKiri: (item.pasanganKiri || []).map((x) => x.trim()).filter(Boolean),
    pasanganKanan: (item.pasanganKanan || []).map((x) => x.trim()).filter(Boolean),
    kunciJodoh: item.kunciJodoh || {},
    bobot,
    pembahasan: (item.pembahasan || '').trim(),
  };
}

/**
 * Parse teks format blok CBT.
 * @param longgar bila true, baris yang tidak dikenali di awal blok dilewati
 * (untuk .docx yang memuat paragraf instruksi). Bila false, baris yang tidak
 * diawali kata kunci diperlakukan sebagai kelanjutan teks kunci sebelumnya.
 */
export function parseTeksBlokSoal(teks: string, longgar = false): BarisSoalImpor[] {
  const KUNCI_RE = /^(SOAL|JENIS|KUNCI|BOBOT|PEMBAHASAN|PASANGAN)\s*:\s*([\s\S]*)$/i;
  const OPSI_RE = /^([A-E])\s*:\s*([\s\S]*)$/i;
  const hasil: BarisSoalImpor[] = [];
  const sudahAda = new Set<string>();
  let no = 0;
  let cur: Partial<ItemSoalImpor> | null = null;
  let kunciAktif: string | null = null; // nama field yang sedang "dibuka" (untuk kelanjutan baris)
  let blokAdaSoal = false; // true bila blok saat ini sudah punya SOAL (untuk batas blok JENIS)

  const dorong = () => {
    if (!cur) return;
    const kosong =
      !(cur.soal || '').trim() && !(cur.opsiA || '').trim() && !(cur.opsiB || '').trim() &&
      !(cur.opsiC || '').trim() && !(cur.opsiD || '').trim() &&
      (cur.pasanganKiri || []).length === 0;
    // Blok yang baru berisi JENIS saja (belum ada SOAL) bukan blok yang
    // boleh dibuang — pertahankan agar baris SOAL berikutnya bergabung
    // ke blok yang sama (dulu: dorong() membuangnya sehingga JENIS hilang
    // dan soal dibaca sebagai pg).
    if (kosong) return;
    {
      // Jodoh tanpa KUNCI eksplisit: pasangan dianggap sudah berurutan benar.
      if (normalisasiJenis(cur.jenis as string | undefined) === 'jodoh') {
        const kiri = cur.pasanganKiri || [];
        if (kiri.length > 0 && Object.keys(cur.kunciJodoh || {}).length === 0) {
          cur.kunciJodoh = Object.fromEntries(kiri.map((_, i) => [i, i]));
        }
      }
      no++;
      const galat = validasiItemSoal(cur, sudahAda);
      if (!galat) sudahAda.add(normalisasiDuplikat(cur.soal || ''));
      hasil.push({ no, item: { ...cur }, valid: !galat, galat });
    }
    cur = null;
    kunciAktif = null;
    blokAdaSoal = false;
  };

  const mulai = (): Partial<ItemSoalImpor> => {
    if (!cur) cur = {};
    return cur;
  };

  for (const mentah of teks.split(/\r?\n/)) {
    const t = mentah.trim();
    if (!t) {
      dorong();
      continue;
    }
    if (t.startsWith('#')) continue;
    const km = KUNCI_RE.exec(t);
    const om = OPSI_RE.exec(t);
    if (km) {
      const k = km[1].toUpperCase();
      const v = km[2].trim();
      if (k === 'SOAL') {
        dorong();
        mulai().soal = v;
        kunciAktif = 'soal';
        blokAdaSoal = true;
      } else if (k === 'JENIS') {
        // Baris JENIS memulai blok soal baru bila blok sebelumnya sudah
        // berisi soal (pengaman bila pemisah baris kosong hilang, mis.
        // file .docx lama) — jangan sampai JENIS menimpa soal sebelumnya.
        if (blokAdaSoal) dorong();
        mulai().jenis = normalisasiJenis(v);
        kunciAktif = null;
      } else if (k === 'PASANGAN') {
        // format: "kiri | kanan" (satu pasangan per baris)
        const [kiri, kanan] = v.split('|').map((x) => x.trim());
        if (kiri || kanan) {
          const c = mulai();
          c.pasanganKiri = [...(c.pasanganKiri || []), kiri || ''];
          c.pasanganKanan = [...(c.pasanganKanan || []), kanan || ''];
        }
        kunciAktif = null;
      } else if (k === 'KUNCI') {
        const jenisCur = normalisasiJenis(mulai().jenis as string | undefined);
        if (jenisCur === 'jodoh' && /^\d+\s*-\s*\d+/.test(v)) {
          // format "1-2,2-1,3-3" (1-based) -> kunciJodoh 0-based
          const kj: Record<number, number> = {};
          for (const pas of v.split(',')) {
            const m = /^(\d+)\s*-\s*(\d+)$/.exec(pas.trim());
            if (m) kj[Number(m[1]) - 1] = Number(m[2]) - 1;
          }
          mulai().kunciJodoh = kj;
          mulai().kunci = '';
        } else {
          mulai().kunci = jenisCur === 'isian' || jenisCur === 'bs' ? v : v.toUpperCase();
        }
        kunciAktif = null;
      } else if (k === 'BOBOT') {
        const n = parseInt(v, 10);
        mulai().bobot = Number.isFinite(n) && n >= 1 ? n : 1;
        kunciAktif = null;
      } else {
        mulai().pembahasan = v;
        kunciAktif = 'pembahasan';
      }
    } else if (om) {
      const field = `opsi${om[1].toUpperCase()}` as keyof Partial<ItemSoalImpor>;
      mulai()[field] = om[2].trim() as never;
      kunciAktif = field;
    } else if (kunciAktif && cur) {
      // baris kelanjutan (teks soal/pembahasan/opsi lebih dari satu baris)
      const sebelum = (cur[kunciAktif] as string | undefined) || '';
      (cur as Record<string, string>)[kunciAktif] = sebelum ? `${sebelum} ${t}` : t;
    } else if (!longgar) {
      // baris asing tanpa blok aktif — mulai blok baru dengan teks ini sebagai soal
      dorong();
      mulai().soal = t;
      kunciAktif = 'soal';
    }
    // longgar: abaikan baris asing (judul/instruksi template)
  }
  dorong();
  return hasil;
}

export function rangkumParse(baris: BarisSoalImpor[]): HasilParseSoal {
  return {
    baris,
    valid: baris.filter((b) => b.valid).map((b) => itemLengkap(b.item)),
  };
}

/** Parse file .txt. */
export function parseTxtSoal(teks: string): HasilParseSoal {
  return rangkumParse(parseTeksBlokSoal(teks, false));
}

/** Parse file .docx: ekstrak teks lalu parse seperti format blok (mode longgar). */
export async function parseDocxSoal(buffer: ArrayBuffer): Promise<HasilParseSoal> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Browser Anda tidak mendukung pembacaan .docx. Gunakan file .txt atau .xlsx.');
  }
  const baris = await ekstrakTeksDocx(buffer);
  return rangkumParse(parseTeksBlokSoal(baris.join('\n'), true));
}

// ---------------------------------------------------------------------------
// Reader .xlsx MINIMAL (tulisan tangan, tanpa library)
// ---------------------------------------------------------------------------

interface SelXlsx {
  kol: number; // 0 = A
  baris: number; // 1-based
  nilai: string;
}

function kolDariRef(ref: string): { kol: number; baris: number } {
  const m = /^([A-Za-z]+)(\d+)$/.exec(ref.trim());
  if (!m) return { kol: -1, baris: -1 };
  const huruf = m[1].toUpperCase();
  let kol = 0;
  for (const ch of huruf) kol = kol * 26 + (ch.charCodeAt(0) - 64);
  return { kol: kol - 1, baris: parseInt(m[2], 10) };
}

function gabungTeks(xmlFragmen: string): string {
  // gabungkan semua <t>...</t> dengan dekode entitas
  const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g;
  let hasil = '';
  let m: RegExpExecArray | null;
  while ((m = re.exec(xmlFragmen)) !== null) {
    hasil += dekodeEntitasXml(m[1]);
  }
  return hasil;
}

/** Ambil daftar string dari xl/sharedStrings.xml (boleh null bila tidak ada). */
function bacaSharedStrings(xml: string | null): string[] {
  if (!xml) return [];
  const re = /<si>([\s\S]*?)<\/si>/g;
  const daftar: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) daftar.push(gabungTeks(m[1]));
  return daftar;
}

/**
 * Baca sel-sel dari sebuah worksheet XML.
 * Menangani: t="s" (sharedStrings), t="inlineStr", dan sel angka biasa.
 */
export function bacaWorksheetXml(xml: string, sharedStrings: string[]): SelXlsx[] {
  const hasil: SelXlsx[] = [];
  // Sel bisa self-closing bila kosong: <c r="A1"/> -> abaikan
  const re = /<c\s+([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const attrs = m[1];
    const isi = m[2] ?? '';
    const refM = /r="([A-Za-z]+\d+)"/.exec(attrs);
    if (!refM) continue;
    const { kol, baris } = kolDariRef(refM[1]);
    if (kol < 0 || baris < 0) continue;
    const tipeM = /t="([a-zA-Z]+)"/.exec(attrs);
    const tipe = (tipeM ? tipeM[1] : '').toLowerCase();
    let nilai = '';
    if (tipe === 's') {
      const vM = /<v>(-?\d+)<\/v>/.exec(isi);
      const idx = vM ? parseInt(vM[1], 10) : -1;
      nilai = idx >= 0 && idx < sharedStrings.length ? sharedStrings[idx] : '';
    } else if (tipe === 'inlinestr') {
      nilai = gabungTeks(isi);
    } else {
      const vM = /<v>([\s\S]*?)<\/v>/.exec(isi);
      nilai = vM ? dekodeEntitasXml(vM[1].trim()) : gabungTeks(isi);
    }
    hasil.push({ kol, baris, nilai });
  }
  return hasil;
}

/** Ubah daftar sel menjadi baris-baris (array per baris, indeks kolom 0-based). */
export function selKeBaris(sel: SelXlsx[]): string[][] {
  const peta = new Map<number, Map<number, string>>();
  let maksKol = 0;
  for (const s of sel) {
    if (!peta.has(s.baris)) peta.set(s.baris, new Map());
    peta.get(s.baris)!.set(s.kol, s.nilai);
    if (s.kol > maksKol) maksKol = s.kol;
  }
  const nomorBaris = [...peta.keys()].sort((a, b) => a - b);
  return nomorBaris.map((n) => {
    const m = peta.get(n)!;
    const arr: string[] = [];
    for (let k = 0; k <= maksKol; k++) arr.push(m.get(k) ?? '');
    return arr;
  });
}

/** Parse file .xlsx: sheet pertama, kolom No|Soal|A|B|C|D|E|Kunci|Bobot|Pembahasan. */
export async function parseXlsxSoal(buffer: ArrayBuffer): Promise<HasilParseSoal> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Browser Anda tidak mendukung pembacaan .xlsx. Gunakan file .txt.');
  }
  const sheetB = await bacaZip(buffer, 'xl/worksheets/sheet1.xml');
  const ssB = await bacaZipOpsional(buffer, 'xl/sharedStrings.xml');
  const shared = bacaSharedStrings(ssB ? TD.decode(ssB) : null);
  const baris = selKeBaris(bacaWorksheetXml(TD.decode(sheetB), shared));

  // Deteksi baris header: baris yang memuat kata "soal" (maks 15 baris pertama)
  const ALIAS: Record<string, keyof Partial<ItemSoalImpor> | 'no'> = {
    no: 'no',
    nomor: 'no',
    jenis: 'jenis',
    'jenis soal': 'jenis',
    soal: 'soal',
    pertanyaan: 'soal',
    a: 'opsiA',
    b: 'opsiB',
    c: 'opsiC',
    d: 'opsiD',
    e: 'opsiE',
    kunci: 'kunci',
    jawaban: 'kunci',
    bobot: 'bobot',
    nilai: 'bobot',
    pembahasan: 'pembahasan',
    bahasan: 'pembahasan',
    pasangankiri: 'pasanganKiri',
    'pasangan kiri': 'pasanganKiri',
    kiri: 'pasanganKiri',
    pasangankanan: 'pasanganKanan',
    'pasangan kanan': 'pasanganKanan',
    kanan: 'pasanganKanan',
    kuncijodoh: 'kunciJodoh',
    kuncijodoh2: 'kunciJodoh',
    'kunci jodoh': 'kunciJodoh',
  };
  let idxHeader = -1;
  let petaKol: Record<number, keyof Partial<ItemSoalImpor>> = {};
  for (let i = 0; i < Math.min(baris.length, 15); i++) {
    const sel = baris[i].map((c) => c.trim().toLowerCase());
    if (!sel.includes('soal')) continue;
    const peta: Record<number, keyof Partial<ItemSoalImpor>> = {};
    sel.forEach((h, k) => {
      const f = ALIAS[h];
      if (f && f !== 'no') peta[k] = f;
    });
    if (Object.keys(peta).length >= 3) {
      idxHeader = i;
      petaKol = peta;
      break;
    }
  }
  // Fallback: tanpa header, asumsikan urutan kolom tetap
  const data = idxHeader >= 0 ? baris.slice(idxHeader + 1) : baris;
  if (idxHeader < 0) {
    petaKol = { 0: 'jenis', 1: 'soal', 2: 'opsiA', 3: 'opsiB', 4: 'opsiC', 5: 'opsiD', 6: 'opsiE', 7: 'kunci', 8: 'bobot', 9: 'pembahasan', 10: 'pasanganKiri', 11: 'pasanganKanan', 12: 'kunciJodoh' };
  }

  const hasil: BarisSoalImpor[] = [];
  const sudahAda = new Set<string>();
  let no = 0;
  for (const r of data) {
    if (r.every((c) => !c.trim())) continue;
    const item: Partial<ItemSoalImpor> = {};
    for (const [kStr, f] of Object.entries(petaKol)) {
      const v = (r[Number(kStr)] || '').trim();
      if (f === 'bobot') {
        const n = parseInt(v, 10);
        if (Number.isFinite(n) && n >= 1) item.bobot = n;
      } else if (f === 'jenis') {
        item.jenis = normalisasiJenis(v || undefined);
      } else if (f === 'pasanganKiri' || f === 'pasanganKanan') {
        (item as Record<string, string[]>)[f] = v ? v.split('|').map((x) => x.trim()).filter(Boolean) : [];
      } else if (f === 'kunciJodoh') {
        // format sel: "1-2,2-1" (1-based) -> Record 0-based
        const kj: Record<number, number> = {};
        if (v) {
          for (const pas of v.split(',')) {
            const m = /^(\d+)\s*-\s*(\d+)$/.exec(pas.trim());
            if (m) kj[Number(m[1]) - 1] = Number(m[2]) - 1;
          }
        }
        item.kunciJodoh = kj;
      } else {
        (item as Record<string, string>)[f] = v;
      }
    }
    // Jodoh tanpa KunciJodoh eksplisit: pasangan dianggap sudah berurutan benar.
    if (normalisasiJenis(item.jenis as string | undefined) === 'jodoh') {
      const kiri = item.pasanganKiri || [];
      if (kiri.length > 0 && Object.keys(item.kunciJodoh || {}).length === 0) {
        item.kunciJodoh = Object.fromEntries(kiri.map((_, i) => [i, i]));
      }
    }
    no++;
    const galat = validasiItemSoal(item, sudahAda);
    if (!galat) sudahAda.add(normalisasiDuplikat(item.soal || ''));
    hasil.push({ no, item, valid: !galat, galat });
  }
  return rangkumParse(hasil);
}

// ---------------------------------------------------------------------------
// Writer .xlsx MINIMAL (tulisan tangan, tanpa library)
// ---------------------------------------------------------------------------

function lolosXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function namaKol(kol: number): string {
  let n = '';
  let k = kol;
  do {
    n = String.fromCharCode(65 + (k % 26)) + n;
    k = Math.floor(k / 26) - 1;
  } while (k >= 0);
  return n;
}

function selInline(ref: string, teks: string): string {
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${lolosXml(teks)}</t></is></c>`;
}

/** Buat satu worksheet XML dari matriks string (semua sel inlineStr). */
export function buatWorksheetXml(data: string[][]): string {
  const baris = data
    .map((r, i) => {
      const sel = r
        .map((v, k) => (v ? selInline(`${namaKol(k)}${i + 1}`, v) : ''))
        .join('');
      return `<row r="${i + 1}">${sel}</row>`;
    })
    .join('');
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetData>${baris}</sheetData></worksheet>`
  );
}

export interface SheetXlsx {
  nama: string;
  data: string[][];
}

/** Rakit file .xlsx dari beberapa sheet (semua sel inline strings). */
export function buatXlsx(sheets: SheetXlsx[]): Uint8Array<ArrayBuffer> {
  const contentTypes =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    sheets
      .map(
        (_, i) =>
          `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
      )
      .join('') +
    `</Types>`;
  const rels =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
    `</Relationships>`;
  const workbookRels =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
    `</Relationships>`;
  const workbook =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets>` +
    sheets.map((s, i) => `<sheet name="${lolosXml(s.nama)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
    `</sheets></workbook>`;

  const entris: ZipEntri[] = [
    { nama: '[Content_Types].xml', data: TE.encode(contentTypes) },
    { nama: '_rels/.rels', data: TE.encode(rels) },
    { nama: 'xl/workbook.xml', data: TE.encode(workbook) },
    { nama: 'xl/_rels/workbook.xml.rels', data: TE.encode(workbookRels) },
  ];
  sheets.forEach((s, i) => {
    entris.push({ nama: `xl/worksheets/sheet${i + 1}.xml`, data: TE.encode(buatWorksheetXml(s.data)) });
  });
  return bangunZip(entris);
}

/** Ambil teks sel sheet pertama dari buffer .xlsx (helper untuk unduh Excel hasil). */
export async function selXlsxKeTeks(buffer: ArrayBuffer): Promise<string[][]> {
  const sheetB = await bacaZip(buffer, 'xl/worksheets/sheet1.xml');
  const ssB = await bacaZipOpsional(buffer, 'xl/sharedStrings.xml');
  const shared = bacaSharedStrings(ssB ? TD.decode(ssB) : null);
  return selKeBaris(bacaWorksheetXml(TD.decode(sheetB), shared));
}

// ---------------------------------------------------------------------------
// Template unduhan
// ---------------------------------------------------------------------------

function unduhBlob(nama: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nama;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function teksBlokSoal(it: ItemSoalImpor): string {
  const baris = [`JENIS: ${it.jenis}`, `SOAL: ${it.soal}`];
  if (it.jenis === 'pg' || it.jenis === 'pgk') {
    baris.push(`A: ${it.opsiA}`, `B: ${it.opsiB}`, `C: ${it.opsiC}`, `D: ${it.opsiD}`);
    if (it.opsiE) baris.push(`E: ${it.opsiE}`);
    baris.push(`KUNCI: ${it.kunci}`);
  } else if (it.jenis === 'bs') {
    baris.push(`KUNCI: ${it.kunci}`);
  } else if (it.jenis === 'jodoh') {
    for (let i = 0; i < it.pasanganKiri.length; i++) {
      baris.push(`PASANGAN: ${it.pasanganKiri[i]} | ${it.pasanganKanan[i] || ''}`);
    }
    const kj = Object.entries(it.kunciJodoh)
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([k, v]) => `${Number(k) + 1}-${Number(v) + 1}`)
      .join(',');
    if (kj) baris.push(`KUNCI: ${kj}`);
  } else if (it.jenis === 'isian') {
    baris.push(`KUNCI: ${it.kunci}`);
  }
  // essay: tanpa KUNCI
  baris.push(`BOBOT: ${it.bobot}`);
  if (it.pembahasan) baris.push(`PEMBAHASAN: ${it.pembahasan}`);
  return baris.join('\n');
}

/** Template Notepad (.txt). */
export function unduhTemplateTxt(): void {
  const isi = [
    '# =============================================================',
    '# TEMPLATE SOAL CBT MADRASAH DIGITAL (6 jenis soal)',
    '#',
    '# Cara pakai:',
    '# 1. Satu soal = satu BLOK, dipisah dengan BARIS KOSONG.',
    '# 2. Tulis JENIS dulu (pg | pgk | bs | jodoh | isian | essay). Bila kosong = pg.',
    '#    pg:    A:.. B:.. C:.. D:.. (E opsional), KUNCI: A',
    '#    pgk:   A:.. B:.. C:.. D:.., KUNCI: A,C (minimal 2 huruf)',
    '#    bs:    KUNCI: Benar  atau  KUNCI: Salah',
    '#    jodoh: PASANGAN: kiri | kanan (satu baris per pasangan),',
    '#          KUNCI: 1-2,2-1 (opsional; bila kosong = pasangan sudah berurutan)',
    '#    isian: KUNCI: teks jawaban (cocok tanpa peduli huruf besar/kecil)',
    '#    essay: tanpa KUNCI — dinilai manual oleh guru (0 s.d. bobot)',
    '#    BOBOT: 1    (bilangan bulat, minimal 1; bila kosong = 1)',
    '#    PEMBAHASAN: ... (opsional)',
    '# 3. Baris yang diawali # diabaikan.',
    '# 4. Simpan file ini, lalu unggah lewat Bank Soal > Template & Unggah.',
    '#',
    '# Contoh siap pakai (boleh langsung diunggah tanpa diubah):',
    '# -------------------------------------------------------------',
    '',
    ...CONTOH_SOAL.map(teksBlokSoal),
    '',
  ].join('\n');
  unduhBlob('template-soal-cbt.txt', new Blob([isi], { type: 'text/plain;charset=utf-8' }));
}

/** Template Excel (.xlsx): sheet "Soal" + sheet "Cara Pakai". Dibuat manual. */
export function unduhTemplateXlsx(): void {
  const header = ['No', 'Jenis', 'Soal', 'A', 'B', 'C', 'D', 'E', 'Kunci', 'Bobot', 'Pembahasan', 'PasanganKiri', 'PasanganKanan', 'KunciJodoh'];
  const data = CONTOH_SOAL.map((c, i) => [
    String(i + 1),
    c.jenis,
    c.soal,
    c.opsiA,
    c.opsiB,
    c.opsiC,
    c.opsiD,
    c.opsiE,
    c.kunci,
    String(c.bobot),
    c.pembahasan,
    c.pasanganKiri.join(' | '),
    c.pasanganKanan.join(' | '),
    Object.entries(c.kunciJodoh)
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([k, v]) => `${Number(k) + 1}-${Number(v) + 1}`)
      .join(','),
  ]);
  const caraPakai = [
    ['CARA PAKAI TEMPLATE SOAL CBT (6 JENIS SOAL)'],
    ['1. Isi sheet "Soal". Baris contoh boleh dihapus/diubah.'],
    ['2. Kolom: No | Jenis | Soal | A | B | C | D | E | Kunci | Bobot | Pembahasan | PasanganKiri | PasanganKanan | KunciJodoh.'],
    ['3. Jenis: pg | pgk | bs | jodoh | isian | essay (kosong = pg).'],
    ['4. pg: opsi A-D wajib; Kunci salah satu dari A-E.'],
    ['5. pgk: opsi A-D wajib; Kunci minimal 2 huruf, mis. A,C.'],
    ['6. bs: Kunci "Benar" atau "Salah". isian: Kunci = teks jawaban. essay: Kunci kosong (dinilai manual).'],
    ['7. jodoh: PasanganKiri & PasanganKanan dipisah " | " dalam satu sel; KunciJodoh mis. 1-2,2-1 (kosong = sudah berurutan).'],
    ['8. Bobot: bilangan bulat minimal 1 (kosong = 1).'],
    ['9. Simpan, lalu unggah lewat Bank Soal > Template & Unggah.'],
    ['10. Contoh pada sheet "Soal" boleh langsung diunggah tanpa diubah.'],
  ];
  const xlsx = buatXlsx([
    { nama: 'Soal', data: [header, ...data] },
    { nama: 'Cara Pakai', data: caraPakai },
  ]);
  unduhBlob('template-soal-cbt.xlsx', new Blob([xlsx], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }));
}

// --- Template .docx (paragraf format blok, dibaca kembali oleh parseDocxSoal) ---

function paraDocx(teks: string, opts: { bold?: boolean; size?: number; center?: boolean } = {}): string {
  const rpr =
    opts.bold || opts.size
      ? `<w:rPr>${opts.bold ? '<w:b/>' : ''}${opts.size ? `<w:sz w:val="${opts.size}"/>` : ''}</w:rPr>`
      : '';
  const ppr = opts.center ? '<w:pPr><w:jc w:val="center"/></w:pPr>' : '';
  return `<w:p>${ppr}<w:r>${rpr}<w:t xml:space="preserve">${lolosXml(teks)}</w:t></w:r></w:p>`;
}

/** Bangun file .docx template soal (paragraf format blok). */
export function buatDocxTemplateSoal(contoh: ItemSoalImpor[]): Blob {
  const paras: string[] = [
    paraDocx('TEMPLATE SOAL CBT MADRASAH DIGITAL', { bold: true, size: 28, center: true }),
    paraDocx('Cara pakai:', { bold: true }),
    paraDocx('1. Satu soal = satu blok paragraf, dipisah dengan paragraf kosong.'),
    paraDocx('2. Format: JENIS: pg/pgk/bs/jodoh/isian/essay, lalu SOAL: ..., opsi A:.. D:.. (khusus pg/pgk), KUNCI: A / A,C / Benar / teks jawaban, PASANGAN: kiri | kanan (khusus jodoh), BOBOT: 1, PEMBAHASAN: ... (opsional).'),
    paraDocx('3. Simpan file ini (.docx), lalu unggah lewat menu Bank Soal > Template & Unggah.'),
    paraDocx('Contoh siap pakai (boleh langsung diunggah tanpa diubah):', { bold: true }),
    paraDocx(''),
  ];
  for (const c of contoh) {
    for (const l of teksBlokSoal(c).split('\n')) paras.push(paraDocx(l));
    paras.push(paraDocx(''));
  }

  const doc =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>` +
    paras.join('') +
    `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr>` +
    `</w:body></w:document>`;

  const contentTypes =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
    `</Types>`;

  const rels =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
    `</Relationships>`;

  const zip = bangunZip([
    { nama: '[Content_Types].xml', data: TE.encode(contentTypes) },
    { nama: '_rels/.rels', data: TE.encode(rels) },
    { nama: 'word/document.xml', data: TE.encode(doc) },
  ]);
  return new Blob([zip], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}

/** Template Word (.docx). */
export function unduhTemplateDocx(): void {
  unduhBlob('template-soal-cbt.docx', buatDocxTemplateSoal(CONTOH_SOAL));
}

/** Dipakai UI: parse file apa pun (.txt/.docx/.xlsx) berdasarkan ekstensi nama. */
export async function parseFileSoal(namaFile: string, buffer: ArrayBuffer): Promise<HasilParseSoal> {
  const lower = namaFile.toLowerCase();
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) return parseXlsxSoal(buffer);
  if (lower.endsWith('.docx')) return parseDocxSoal(buffer);
  return parseTxtSoal(TD.decode(buffer));
}

// ---------------------------------------------------------------------------
// Impor SISWA (.xlsx) — kolom Nama|NIS|Kelas|Jenjang|Username|Password
// ---------------------------------------------------------------------------

export interface ItemSiswaImpor {
  nama: string;
  nis: string;
  kelas: string;
  jenjang: string;
  username: string;
  password: string;
  noHP: string;
}

export interface BarisSiswaImpor {
  no: number;
  item: Partial<ItemSiswaImpor>;
  valid: boolean;
  galat: string;
}

/** Parse .xlsx impor siswa: deteksi header lalu petakan kolomnya. */
export async function parseXlsxSiswa(buffer: ArrayBuffer): Promise<{ baris: BarisSiswaImpor[]; valid: ItemSiswaImpor[] }> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Browser Anda tidak mendukung pembacaan .xlsx.');
  }
  const sheetB = await bacaZip(buffer, 'xl/worksheets/sheet1.xml');
  const ssB = await bacaZipOpsional(buffer, 'xl/sharedStrings.xml');
  const shared = bacaSharedStrings(ssB ? TD.decode(ssB) : null);
  const baris = selKeBaris(bacaWorksheetXml(TD.decode(sheetB), shared));

  const ALIAS: Record<string, keyof Partial<ItemSiswaImpor>> = {
    nama: 'nama',
    'nama siswa': 'nama',
    nis: 'nis',
    'nisn': 'nis',
    kelas: 'kelas',
    jenjang: 'jenjang',
    username: 'username',
    password: 'password',
    'kata sandi': 'password',
    nohp: 'noHP',
    'no hp': 'noHP',
    'no. hp': 'noHP',
    'no wa': 'noHP',
    'no. wa': 'noHP',
  };
  let idxHeader = -1;
  let petaKol: Record<number, keyof Partial<ItemSiswaImpor>> = {};
  for (let i = 0; i < Math.min(baris.length, 15); i++) {
    const sel = baris[i].map((c) => c.trim().toLowerCase());
    if (!sel.includes('nama') || !sel.includes('nis')) continue;
    const peta: Record<number, keyof Partial<ItemSiswaImpor>> = {};
    sel.forEach((h, k) => {
      const f = ALIAS[h];
      if (f) peta[k] = f;
    });
    if (peta && Object.keys(peta).length >= 2) {
      idxHeader = i;
      petaKol = peta;
      break;
    }
  }
  if (idxHeader < 0) throw new Error('Header "Nama" dan "NIS" tidak ditemukan pada sheet pertama.');

  const hasil: BarisSiswaImpor[] = [];
  const nisAda = new Set<string>();
  let no = 0;
  for (const r of baris.slice(idxHeader + 1)) {
    if (r.every((c) => !c.trim())) continue;
    const item: Partial<ItemSiswaImpor> = {};
    for (const [kStr, f] of Object.entries(petaKol)) {
      (item as Record<string, string>)[f] = (r[Number(kStr)] || '').trim();
    }
    no++;
    let galat = '';
    const nisN = normalisasiDuplikat(item.nis || '');
    if (!(item.nama || '').trim()) galat = 'Nama kosong';
    else if (!nisN) galat = 'NIS kosong';
    else if (!(item.kelas || '').trim()) galat = 'Kelas kosong';
    else if (nisAda.has(nisN)) galat = 'NIS duplikat dalam file';
    if (!galat) nisAda.add(nisN);
    hasil.push({ no, item, valid: !galat, galat });
  }
  return {
    baris: hasil,
    valid: hasil.filter((b) => b.valid).map((b) => ({
      nama: (b.item.nama || '').trim(),
      nis: (b.item.nis || '').trim(),
      kelas: (b.item.kelas || '').trim(),
      jenjang: (b.item.jenjang || '').trim(),
      username: (b.item.username || '').trim(),
      password: (b.item.password || '').trim(),
      noHP: (b.item.noHP || '').trim(),
    })),
  };
}

/** Template .xlsx impor siswa. */
export function unduhTemplateXlsxSiswa(): void {
  const header = ['Nama', 'NIS', 'Kelas', 'Jenjang', 'Username', 'Password', 'NoHP'];
  const data = [
    ['Ahmad Fauzi', '12345', '9A', 'SMK', '', '', '081234567890'],
    ['Siti Aminah', '12346', '9A', 'SMK', '', '', ''],
  ];
  const caraPakai = [
    ['CARA PAKAI TEMPLATE IMPOR SISWA'],
    ['1. Isi sheet "Siswa". Contoh baris boleh dihapus.'],
    ['2. Nama, NIS, dan Kelas wajib. Kelas harus sudah ada di Kelola Data > Kelas.'],
    ['3. Jenjang opsional bila nama kelas unik.'],
    ['4. Username & Password opsional: kosong = username NIS, password NIS.'],
    ['5. NoHP = No. WA orang tua (opsional).'],
    ['6. NIS yang sama dengan data lama akan MEMPERBARUI data tersebut.'],
    ['7. Simpan, lalu unggah lewat Kelola Data > tab Impor Siswa.'],
  ];
  const xlsx = buatXlsx([
    { nama: 'Siswa', data: [header, ...data] },
    { nama: 'Cara Pakai', data: caraPakai },
  ]);
  unduhBlob('template-impor-siswa.xlsx', new Blob([xlsx], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }));
}

// ---------------------------------------------------------------------------
// Impor MAPEL (.xlsx) — kolom Nama|Jenjang
// ---------------------------------------------------------------------------

export interface ItemMapelImpor {
  nama: string;
  jenjang: string;
}

export interface BarisMapelImpor {
  no: number;
  item: Partial<ItemMapelImpor>;
  valid: boolean;
  galat: string;
}

/** Parse .xlsx impor mapel: deteksi header Nama (+ Jenjang opsional). */
export async function parseXlsxMapel(buffer: ArrayBuffer): Promise<{ baris: BarisMapelImpor[]; valid: ItemMapelImpor[] }> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Browser Anda tidak mendukung pembacaan .xlsx.');
  }
  const sheetB = await bacaZip(buffer, 'xl/worksheets/sheet1.xml');
  const ssB = await bacaZipOpsional(buffer, 'xl/sharedStrings.xml');
  const shared = bacaSharedStrings(ssB ? TD.decode(ssB) : null);
  const baris = selKeBaris(bacaWorksheetXml(TD.decode(sheetB), shared));

  const ALIAS: Record<string, keyof Partial<ItemMapelImpor>> = {
    nama: 'nama',
    'nama mapel': 'nama',
    mapel: 'nama',
    'mata pelajaran': 'nama',
    jenjang: 'jenjang',
  };
  let idxHeader = -1;
  let petaKol: Record<number, keyof Partial<ItemMapelImpor>> = {};
  for (let i = 0; i < Math.min(baris.length, 15); i++) {
    const sel = baris[i].map((c) => c.trim().toLowerCase());
    if (!sel.includes('nama') && !sel.includes('mapel') && !sel.includes('nama mapel')) continue;
    const peta: Record<number, keyof Partial<ItemMapelImpor>> = {};
    sel.forEach((h, k) => {
      const f = ALIAS[h];
      if (f) peta[k] = f;
    });
    if (Object.keys(peta).length >= 1) {
      idxHeader = i;
      petaKol = peta;
      break;
    }
  }
  if (idxHeader < 0) throw new Error('Header "Nama" tidak ditemukan pada sheet pertama.');

  const hasil: BarisMapelImpor[] = [];
  const namaAda = new Set<string>();
  let no = 0;
  for (const r of baris.slice(idxHeader + 1)) {
    if (r.every((c) => !c.trim())) continue;
    const item: Partial<ItemMapelImpor> = {};
    for (const [kStr, f] of Object.entries(petaKol)) {
      (item as Record<string, string>)[f] = (r[Number(kStr)] || '').trim();
    }
    no++;
    let galat = '';
    const namaN = normalisasiDuplikat(item.nama || '');
    if (!namaN) galat = 'Nama mapel kosong';
    else if (namaAda.has(namaN)) galat = 'Nama mapel duplikat dalam file';
    if (!galat) namaAda.add(namaN);
    hasil.push({ no, item, valid: !galat, galat });
  }
  return {
    baris: hasil,
    valid: hasil.filter((b) => b.valid).map((b) => ({
      nama: (b.item.nama || '').trim(),
      jenjang: (b.item.jenjang || '').trim(),
    })),
  };
}

/** Template .xlsx impor mapel. */
export function unduhTemplateXlsxMapel(): void {
  const header = ['Nama', 'Jenjang'];
  const data = [
    ['Bahasa Indonesia', ''],
    ['Bahasa Inggris', ''],
    ['Matematika', ''],
    ['IPA', ''],
    ['IPS', ''],
  ];
  const caraPakai = [
    ['CARA PAKAI TEMPLATE IMPOR MAPEL'],
    ['1. Isi sheet "Mapel". Contoh baris boleh dihapus.'],
    ['2. Nama mapel wajib. Jenjang opsional (kosong = jenjang yang dipilih di form).'],
    ['3. Nama yang sama dengan data lama akan dilewati (tidak duplikat).'],
    ['4. Simpan, lalu unggah lewat Kelola Data > tab Mapel > Impor Excel.'],
  ];
  const xlsx = buatXlsx([
    { nama: 'Mapel', data: [header, ...data] },
    { nama: 'Cara Pakai', data: caraPakai },
  ]);
  unduhBlob('template-impor-mapel.xlsx', new Blob([xlsx], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }));
}
