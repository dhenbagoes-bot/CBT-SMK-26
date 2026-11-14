// Uji util impor soal CBT (node assert, tanpa framework).
// Jalankan: node test/impor-soal.test.ts  (butuh Node dengan type stripping, v22.6+/24)
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import {
  CONTOH_SOAL,
  TE,
  TD,
  bacaWorksheetXml,
  bacaZip,
  bangunZip,
  buatDocxTemplateSoal,
  buatXlsx,
  ekstrakTeksDocx,
  ekstrakTeksDocumentXml,
  parseDocxSoal,
  parseFileSoal,
  parseTeksBlokSoal,
  parseTxtSoal,
  parseXlsxMapel,
  parseXlsxSiswa,
  parseXlsxSoal,
  rangkumParse,
  selKeBaris,
  validasiItemSoal,
} from '../src/utils/imporSoal.ts';

const ITEM = {
  soal: 'Ibukota Indonesia?',
  opsiA: 'Surabaya',
  opsiB: 'Jakarta',
  opsiC: 'Bandung',
  opsiD: 'Medan',
  opsiE: '',
  kunci: 'B',
  bobot: 1,
  pembahasan: 'Jakarta.',
};

// --- 1. validasiItemSoal ---
{
  const ada = new Set<string>();
  assert.equal(validasiItemSoal(ITEM, ada), '');
  ada.add('ibukota indonesia?');
  assert.match(validasiItemSoal({ ...ITEM }, ada), /duplikat/);
  assert.match(validasiItemSoal({ ...ITEM, soal: '  ' }, new Set()), /Soal kosong/);
  assert.match(validasiItemSoal({ ...ITEM, soal: 'X', opsiA: '' }, new Set()), /Opsi A kosong/);
  assert.match(validasiItemSoal({ ...ITEM, soal: 'X', opsiD: '' }, new Set()), /Opsi D kosong/);
  assert.match(validasiItemSoal({ ...ITEM, soal: 'X', kunci: 'F' }, new Set()), /Kunci/);
  assert.match(validasiItemSoal({ ...ITEM, soal: 'X', kunci: 'E' }, new Set()), /Opsi E/);
  assert.match(validasiItemSoal({ ...ITEM, soal: 'X', kunci: 'e', opsiE: 'Makassar' }, new Set()), /^$/);
  assert.match(validasiItemSoal({ ...ITEM, soal: 'X', bobot: 0 }, new Set()), /Bobot/);
  console.log('✓ validasiItemSoal');
}

// --- 2. parse teks blok ---
{
  const teks = [
    '# komentar diabaikan',
    '',
    'SOAL: Ibukota Indonesia?',
    'A: Surabaya',
    'B: Jakarta',
    'C: Bandung',
    'D: Medan',
    'KUNCI: B',
    'BOBOT: 1',
    'PEMBAHASAN: Jakarta adalah ibukota.',
    '',
    'SOAL: 2 + 2 = ?',
    'A: 3',
    'B: 4',
    'C: 5',
    'D: 6',
    'E: 7',
    'KUNCI: B',
    '',
    'SOAL: kunci salah',
    'A: x',
    'B: y',
    'C: z',
    'D: w',
    'KUNCI: Z',
    '',
    'SOAL: Ibukota Indonesia?',
    'A: a',
    'B: b',
    'C: c',
    'D: d',
    'KUNCI: A',
  ].join('\n');
  const baris = parseTeksBlokSoal(teks);
  assert.equal(baris.length, 4);
  assert.ok(baris[0].valid, baris[0].galat);
  assert.equal(baris[0].item.pembahasan, 'Jakarta adalah ibukota.');
  assert.ok(baris[1].valid && baris[1].item.opsiE === '7');
  assert.ok(!baris[2].valid && /Kunci/.test(baris[2].galat));
  assert.ok(!baris[3].valid && /duplikat/.test(baris[3].galat));
  const r = rangkumParse(baris);
  assert.equal(r.valid.length, 2);
  assert.equal(r.valid[0].kunci, 'B');
  assert.equal(r.valid[1].bobot, 1); // default bobot diterapkan di itemLengkap

  // baris kelanjutan (soal multi-baris)
  const b2 = parseTeksBlokSoal('SOAL: baris satu\nlanjutan soal\nA: a\nB: b\nC: c\nD: d\nKUNCI: A\n');
  assert.equal(b2.length, 1);
  assert.ok(b2[0].valid);
  assert.match(b2[0].item.soal || '', /baris satu lanjutan soal/);

  // mode longgar: baris asing dilewati
  const b3 = parseTeksBlokSoal('JUDUL TEMPLATE\n\nSOAL: S?\nA: a\nB: b\nC: c\nD: d\nKUNCI: A\n', true);
  assert.equal(b3.length, 1);
  assert.ok(b3[0].valid);

  // parseTxtSoal mengembalikan HasilParseSoal
  const r2 = parseTxtSoal('SOAL: S?\nA: a\nB: b\nC: c\nD: d\nKUNCI: C\nBOBOT: 2\n');
  assert.equal(r2.valid.length, 1);
  assert.equal(r2.valid[0].bobot, 2);
  assert.equal(r2.valid[0].kunci, 'C');
  console.log('✓ parseTeksBlokSoal');
}

// --- 3. zip round-trip + bacaZip ---
{
  const zip = bangunZip([
    { nama: 'a.txt', data: TE.encode('halo') },
    { nama: 'dir/b.txt', data: TE.encode('dunia') },
  ]);
  const buf = zip.buffer as ArrayBuffer;
  assert.equal(TD.decode(await bacaZip(buf, 'a.txt')), 'halo');
  assert.equal(TD.decode(await bacaZip(buf, 'dir/b.txt')), 'dunia');
  await assert.rejects(bacaZip(buf, 'tidak-ada.txt'), /tidak ada di arsip/);
  console.log('✓ bangunZip & bacaZip');
}

// --- 4. ekstraksi teks document.xml ---
{
  const xml =
    `<w:document><w:body>` +
    `<w:p><w:r><w:t>Judul</w:t></w:r></w:p>` +
    `<w:p><w:r><w:t>SOAL: S?</w:t></w:r></w:p>` +
    `</w:body></w:document>`;
  assert.deepEqual(ekstrakTeksDocumentXml(xml), ['Judul', 'SOAL: S?']);
  console.log('✓ ekstrakTeksDocumentXml');
}

// --- 5. docx round-trip: template -> ekstrak -> parse ---
{
  const blob = buatDocxTemplateSoal(CONTOH_SOAL);
  assert.ok(blob.size > 1000, 'docx template terlalu kecil');
  const buf = await blob.arrayBuffer();
  const teks = await ekstrakTeksDocx(buf);
  assert.ok(teks.some((t) => t.startsWith('SOAL:')), 'tidak ada baris SOAL:');
  const r = await parseDocxSoal(buf);
  assert.equal(r.valid.length, CONTOH_SOAL.length, JSON.stringify(r.baris.map((b) => b.galat)));
  assert.equal(r.valid[0].kunci, 'B');
  assert.equal(r.valid[1].bobot, 2);
  console.log('✓ docx round-trip');
}

// --- 6. xlsx round-trip: tulis manual -> baca manual ---
{
  const data: string[][] = [
    ['No', 'Soal', 'A', 'B', 'C', 'D', 'E', 'Kunci', 'Bobot', 'Pembahasan'],
    ['1', 'Ibukota Indonesia?', 'Surabaya', 'Jakarta', 'Bandung', 'Medan', '', 'B', '1', 'Jakarta.'],
    ['2', '2+2=?', '3', '4', '5', '6', '', 'B', '2', ''],
  ];
  const buf = buatXlsx([{ nama: 'Soal', data }]).buffer as ArrayBuffer;
  const r = await parseXlsxSoal(buf);
  assert.equal(r.valid.length, 2, JSON.stringify(r.baris.map((b) => b.galat)));
  assert.equal(r.valid[0].kunci, 'B');
  assert.equal(r.valid[1].bobot, 2);
  assert.equal(r.valid[0].soal, 'Ibukota Indonesia?');

  // header fleksibel (urutan acak + alias "Jawaban")
  const data2: string[][] = [
    ['Jawaban', 'D', 'Soal', 'C', 'B', 'A'],
    ['A', 'Medan', 'Ibukota?', 'Bandung', 'Jakarta', 'Surabaya'],
  ];
  const buf2 = buatXlsx([{ nama: 'Soal', data: data2 }]).buffer as ArrayBuffer;
  const r2 = await parseXlsxSoal(buf2);
  assert.equal(r2.valid.length, 1);
  assert.equal(r2.valid[0].opsiA, 'Surabaya');
  assert.equal(r2.valid[0].kunci, 'A');
  console.log('✓ xlsx round-trip (inlineStr)');
}

// --- 7. reader menangani t="s" (sharedStrings) & sel angka ---
{
  const sharedXml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="3" uniqueCount="3">` +
    `<si><t>Soal</t></si><si><t>Kunci</t></si><si><t>Ibukota Indonesia?</t></si></sst>`;
  const sheetXml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>` +
    `<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>` +
    `<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>5</v></c><c r="C2" t="inlineStr"><is><t>teks &amp; entitas</t></is></c></row>` +
    `</sheetData></worksheet>`;
  const buf = bangunZip([
    { nama: 'xl/worksheets/sheet1.xml', data: TE.encode(sheetXml) },
    { nama: 'xl/sharedStrings.xml', data: TE.encode(sharedXml) },
  ]).buffer as ArrayBuffer;
  const sheetB = await bacaZip(buf, 'xl/worksheets/sheet1.xml');
  const sel = bacaWorksheetXml(TD.decode(sheetB), []);
  // tanpa sharedStrings yang benar, indeks s tidak bisa diresolve -> '' (aman)
  assert.equal(sel.find((s) => s.kol === 0 && s.baris === 1)?.nilai, '');
  // dengan sharedStrings
  const sel2 = bacaWorksheetXml(
    TD.decode(sheetB),
    [ 'Soal', 'Kunci', 'Ibukota Indonesia?' ]
  );
  const rows = selKeBaris(sel2);
  assert.deepEqual(rows[0], ['Soal', 'Kunci', '']); // selKeBaris memadatkan jadi persegi panjang
  assert.deepEqual(rows[1], ['Ibukota Indonesia?', '5', 'teks & entitas']);
  console.log('✓ reader t="s" & angka & inlineStr');
}

// --- 8. parseXlsxSiswa ---
{
  const data: string[][] = [
    ['Nama', 'NIS', 'Kelas', 'Jenjang', 'Username', 'Password'],
    ['Ahmad', '123', '9A', 'SMK', '', ''],
    ['Siti', '124', '9A', '', 'siti', 'rahasia'],
    ['Budi', '123', '9B', '', '', ''], // NIS duplikat
    ['', '125', '9A', '', '', ''], // nama kosong
  ];
  const buf = buatXlsx([{ nama: 'Siswa', data }]).buffer as ArrayBuffer;
  const r = await parseXlsxSiswa(buf);
  assert.equal(r.baris.length, 4);
  assert.equal(r.valid.length, 2);
  assert.match(r.baris[2].galat, /duplikat/);
  assert.match(r.baris[3].galat, /Nama kosong/);
  assert.equal(r.valid[0].nama, 'Ahmad');
  assert.equal(r.valid[1].password, 'rahasia');
  console.log('✓ parseXlsxSiswa');
}

// --- 8b. parseXlsxSiswa membaca kolom Ruang (v1.5.0); file lama tanpa Ruang tetap valid ---
{
  const data: string[][] = [
    ['Nama', 'NIS', 'Kelas', 'Jenjang', 'Username', 'Password', 'NoHP', 'Ruang'],
    ['Ahmad', '123', '9A', 'SMK', '', '', '', 'R1'],
    ['Siti', '124', '9A', '', 'siti', 'rahasia', '0812', ''],
  ];
  const buf = buatXlsx([{ nama: 'Siswa', data }]).buffer as ArrayBuffer;
  const r = await parseXlsxSiswa(buf);
  assert.equal(r.valid.length, 2);
  assert.equal(r.valid[0].ruang, 'R1', 'kolom Ruang terbaca');
  assert.equal(r.valid[1].ruang, '', 'Ruang kosong -> string kosong');
  // File lama tanpa kolom Ruang: ruang default '' dan baris tetap valid.
  const lama: string[][] = [
    ['Nama', 'NIS', 'Kelas'],
    ['Budi', '125', '9A'],
  ];
  const bufLama = buatXlsx([{ nama: 'Siswa', data: lama }]).buffer as ArrayBuffer;
  const rLama = await parseXlsxSiswa(bufLama);
  assert.equal(rLama.valid.length, 1);
  assert.equal(rLama.valid[0].ruang, '');
  console.log('✓ parseXlsxSiswa kolom Ruang');
}

// --- 9. parseFileSoal memilih parser dari ekstensi ---
{
  const txt = 'SOAL: S?\nA: a\nB: b\nC: c\nD: d\nKUNCI: A\n';
  const r1 = await parseFileSoal('soal.txt', TE.encode(txt).buffer as ArrayBuffer);
  assert.equal(r1.valid.length, 1);
  const xlsxBuf = buatXlsx([{ nama: 'Soal', data: [['Soal', 'A', 'B', 'C', 'D', 'Kunci'], ['S?', 'a', 'b', 'c', 'd', 'A']] }]).buffer as ArrayBuffer;
  const r2 = await parseFileSoal('soal.xlsx', xlsxBuf);
  assert.equal(r2.valid.length, 1);
  const docxBuf = await buatDocxTemplateSoal([CONTOH_SOAL[0]]).arrayBuffer();
  const r3 = await parseFileSoal('soal.docx', docxBuf);
  assert.equal(r3.valid.length, 1);
  assert.equal(r3.valid[0].soal, CONTOH_SOAL[0].soal);
  console.log('✓ parseFileSoal');
}

// --- 10. ZIP deflate (file asli Excel) — regresi v1.2.2 ---
// bacaZip sempat membaca ukuran dari field ukuran ASLI (p+24) sehingga
// DecompressionStream menerima byte sisa -> "trailing junk" untuk semua file
// deflate. Fixture bawaan memakai metode store sehingga bug ini lolos.
{
  const CRC_TABEL: number[] = (() => {
    const t: number[] = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t.push(c >>> 0);
    }
    return t;
  })();
  const crc32 = (buf: Uint8Array): number => {
    let c = 0xffffffff;
    for (const b of buf) c = CRC_TABEL[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  /** Kemas ulang ZIP metode store menjadi metode deflate (seperti hasil simpan Excel). */
  function kemasUlangDeflate(zipBuf: ArrayBuffer): ArrayBuffer {
    const bytes = new Uint8Array(zipBuf);
    const dv = new DataView(zipBuf);
    const entris: { nama: string; data: Uint8Array }[] = [];
    let p = 0;
    while (p + 30 <= bytes.length && dv.getUint32(p, true) === 0x04034b50) {
      const metode = dv.getUint16(p + 8, true);
      const ukuran = dv.getUint32(p + 18, true);
      const pNama = dv.getUint16(p + 26, true);
      const pEkstra = dv.getUint16(p + 28, true);
      const nama = TD.decode(bytes.subarray(p + 30, p + 30 + pNama));
      const awal = p + 30 + pNama + pEkstra;
      assert.equal(metode, 0, 'fixture harus metode store');
      entris.push({ nama, data: bytes.slice(awal, awal + ukuran) });
      p = awal + ukuran;
    }
    assert.ok(entris.length > 0, 'fixture kosong');
    const tulis16 = (a: number[], v: number) => { a.push(v & 0xff, (v >> 8) & 0xff); };
    const tulis32 = (a: number[], v: number) => { a.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >> 24) & 0xff); };
    const lokal: number[] = [];
    const catat: { nama: Uint8Array; crc: number; cSize: number; uSize: number; off: number }[] = [];
    for (const e of entris) {
      const namaB = TE.encode(e.nama);
      const comp = deflateRawSync(e.data);
      const off = lokal.length;
      tulis32(lokal, 0x04034b50); tulis16(lokal, 20); tulis16(lokal, 0); tulis16(lokal, 8);
      tulis16(lokal, 0); tulis16(lokal, 0); tulis32(lokal, crc32(e.data));
      tulis32(lokal, comp.length); tulis32(lokal, e.data.length);
      tulis16(lokal, namaB.length); tulis16(lokal, 0);
      for (const b of namaB) lokal.push(b);
      for (const b of comp) lokal.push(b);
      catat.push({ nama: namaB, crc: crc32(e.data), cSize: comp.length, uSize: e.data.length, off });
    }
    const offSentral = lokal.length;
    const sentral: number[] = [];
    for (const c of catat) {
      tulis32(sentral, 0x02014b50); tulis16(sentral, 20); tulis16(sentral, 20);
      tulis16(sentral, 0); tulis16(sentral, 8); tulis16(sentral, 0); tulis16(sentral, 0);
      tulis32(sentral, c.crc); tulis32(sentral, c.cSize); tulis32(sentral, c.uSize);
      tulis16(sentral, c.nama.length); tulis16(sentral, 0); tulis16(sentral, 0);
      tulis16(sentral, 0); tulis16(sentral, 0); tulis32(sentral, 0); tulis32(sentral, c.off);
      for (const b of c.nama) sentral.push(b);
    }
    const eocd: number[] = [];
    tulis32(eocd, 0x06054b50); tulis16(eocd, 0); tulis16(eocd, 0);
    tulis16(eocd, catat.length); tulis16(eocd, catat.length);
    tulis32(eocd, sentral.length); tulis32(eocd, offSentral); tulis16(eocd, 0);
    return new Uint8Array([...lokal, ...sentral, ...eocd]).buffer as ArrayBuffer;
  }

  const zipStore = buatXlsx([{ nama: 'Mapel', data: [['Nama', 'Jenjang'], ['Bahasa Indonesia', ''], ['Matematika', 'SMK']] }]).buffer as ArrayBuffer;
  const zipDeflate = kemasUlangDeflate(zipStore);
  const sheetB = await bacaZip(zipDeflate, 'xl/worksheets/sheet1.xml');
  assert.ok(TD.decode(sheetB).includes('Bahasa Indonesia'), 'bacaZip deflate');
  const r = await parseXlsxMapel(zipDeflate);
  assert.equal(r.baris.length, 2);
  assert.equal(r.valid.length, 2);
  assert.equal(r.valid[0].nama, 'Bahasa Indonesia');
  assert.equal(r.valid[1].nama, 'Matematika');
  const zipSiswa = kemasUlangDeflate(buatXlsx([{ nama: 'Siswa', data: [['Nama', 'NIS', 'Kelas', 'Jenjang', 'Username', 'Password'], ['Ahmad', '123', '9A', '', '', '']] }]).buffer as ArrayBuffer);
  const rs = await parseXlsxSiswa(zipSiswa);
  assert.equal(rs.valid.length, 1);
  assert.equal(rs.valid[0].nama, 'Ahmad');
  console.log('✓ ZIP deflate (Excel) + parseXlsxMapel/Siswa');
}

// --- 11. Grid: parse txt (BARIS/KOLOM/KUNCI) + validasi (v1.3.0) ---
{
  const teks = [
    'JENIS: grid',
    'SOAL: Tentukan benar atau salah.',
    'KOLOM: Benar',
    'KOLOM: Salah',
    'BARIS: Matahari terbit dari timur.',
    'BARIS: Air mendidih pada 50 derajat.',
    'BARIS: Bumi mengelilingi Matahari.',
    'KUNCI: 1-1,2-2,3-1',
    'BOBOT: 3',
    '',
    'JENIS: grid',
    'SOAL: Grid tanpa kunci.',
    'KOLOM: Ya',
    'KOLOM: Tidak',
    'BARIS: Satu.',
    'BARIS: Dua.',
    '',
    'JENIS: pilihan ganda grid',
    'SOAL: Alias jenis grid.',
    'KOLOM: A',
    'KOLOM: B',
    'BARIS: Satu.',
    'BARIS: Dua.',
    'KUNCI: 1-2,2-1',
  ].join('\n');
  const r = parseTxtSoal(teks);
  assert.equal(r.baris.length, 3);
  assert.equal(r.valid.length, 2);
  const g = r.baris[0].item;
  assert.equal(g.jenis, 'grid');
  assert.deepEqual(g.pasanganKiri, ['Matahari terbit dari timur.', 'Air mendidih pada 50 derajat.', 'Bumi mengelilingi Matahari.']);
  assert.deepEqual(g.pasanganKanan, ['Benar', 'Salah']);
  assert.deepEqual(g.kunciJodoh, { 0: 0, 1: 1, 2: 0 });
  assert.equal(g.bobot, 3);
  assert.match(r.baris[1].galat, /kunci baris ke-1/i);
  assert.equal(r.baris[2].item.jenis, 'grid');
  // Validasi langsung: baris != kolom BOLEH; kunci wajib eksplisit.
  assert.equal(validasiItemSoal({ soal: 'G', jenis: 'grid', pasanganKiri: ['a', 'b', 'c'], pasanganKanan: ['X', 'Y'], kunciJodoh: { 0: 0, 1: 1, 2: 0 } }, new Set()), '');
  assert.match(validasiItemSoal({ soal: 'G', jenis: 'grid', pasanganKiri: ['a'], pasanganKanan: ['X', 'Y'], kunciJodoh: { 0: 0 } }, new Set()), /minimal 2 baris/);
  assert.match(validasiItemSoal({ soal: 'G', jenis: 'grid', pasanganKiri: ['a', 'b'], pasanganKanan: ['X', 'Y'], kunciJodoh: {} }, new Set()), /kunci baris/);
  console.log('✓ Grid: parse txt + validasi');
}

console.log('\nSemua uji impor-soal lolos.');
