// Uji util impor soal CBT (node assert, tanpa framework).
// Jalankan: node test/impor-soal.test.ts  (butuh Node dengan type stripping, v22.6+/24)
import assert from 'node:assert/strict';
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
    ['Ahmad', '123', '9A', 'MTs/SMP', '', ''],
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

console.log('\nSemua uji impor-soal lolos.');
