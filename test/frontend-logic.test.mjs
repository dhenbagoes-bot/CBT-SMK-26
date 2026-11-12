// Uji logika frontend CBT (node assert, tanpa framework).
// Prasyarat: kompilasi dulu ->
//   npx tsc --ignoreConfig src/utils/ujian.ts src/utils/penilaian.ts --outDir test/dist-test \
//     --module esnext --target es2020 --moduleResolution bundler --skipLibCheck
//   cp test/dist-test/utils/ujian.js test/dist-test/utils/penilaian.js test/dist-test/
//   rm -rf test/dist-test/utils test/dist-test/types.js
// (tsc menaruh hasil di subfolder utils/; tes ini butuh file datar di test/dist-test/.)
// Jalankan: node test/frontend-logic.test.mjs
import assert from 'node:assert/strict';
import {
  acakArray,
  acakOpsi,
  acakSoalUntukSesi,
  formatSisaWaktu,
  hitungBenar,
  hitungNilaiSkor,
} from './dist-test/ujian.js';
import {
  buatTokenAcak,
  cekBentrokPaket,
  hitungNilaiDenganId,
  kelompokPaketPerHari,
  normalisasiIsian,
  skorSoal,
  sudahDijawab,
  uraiJawabanJodoh,
  uraiKunciPgk,
} from './dist-test/penilaian.js';

/** PRNG deterministik (mulberry32) agar uji acak dapat diulang. */
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let lolos = 0;
let gagal = 0;

function uji(nama, fn) {
  try {
    fn();
    lolos++;
    console.log(`✓ ${nama}`);
  } catch (e) {
    gagal++;
    console.error(`✗ ${nama}: ${e.message}`);
  }
}

// --- 1. acakArray: permutasi lengkap, asli tidak diubah, deterministik ---
uji('acakArray permutasi lengkap', () => {
  const asli = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const hasil = acakArray(asli, prng(42));
  assert.equal(hasil.length, asli.length);
  assert.deepEqual([...hasil].sort((a, b) => a - b), asli); // semua elemen tepat sekali
  assert.deepEqual(asli, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]); // asli tidak diubah
  // deterministik dengan seed sama
  assert.deepEqual(acakArray(asli, prng(42)), hasil);
  // seed berbeda (hampir pasti) beda urutan
  assert.notDeepEqual(acakArray(asli, prng(7)), hasil);
  // array kosong & 1 elemen aman
  assert.deepEqual(acakArray([], prng(1)), []);
  assert.deepEqual(acakArray(['x'], prng(1)), ['x']);
});

// --- 2. acakOpsi: kode A–E dipertahankan ---
uji('acakOpsi kode dipertahankan', () => {
  const opsi = [
    { kode: 'A', teks: 'satu' },
    { kode: 'B', teks: 'dua' },
    { kode: 'C', teks: 'tiga' },
    { kode: 'D', teks: 'empat' },
    { kode: 'E', teks: 'lima' },
  ];
  const hasil = acakOpsi(opsi, prng(99));
  assert.equal(hasil.length, 5);
  // himpunan kode tetap A–E (tidak ada kode palsu/hilang)
  assert.deepEqual(hasil.map((o) => o.kode).sort(), ['A', 'B', 'C', 'D', 'E']);
  // tiap kode tetap menempel pada teks aslinya
  for (const o of hasil) {
    const asal = opsi.find((x) => x.kode === o.kode);
    assert.equal(o.teks, asal.teks);
  }
});

// --- 3. hitungNilaiSkor: simulasi rumus server ---
uji('hitungNilaiSkor rumus server', () => {
  // contoh kontrak: 8 benar bobot 1 dari 10 soal -> 80
  assert.equal(hitungNilaiSkor(8, 10), 80);
  assert.equal(hitungNilaiSkor(10, 10), 100);
  assert.equal(hitungNilaiSkor(0, 10), 0);
  // totalBobot 0 -> 0 (tanpa pembagian nol)
  assert.equal(hitungNilaiSkor(5, 0), 0);
  // pembulatan: 1/3 -> 33, 2/3 -> 67
  assert.equal(hitungNilaiSkor(1, 3), 33);
  assert.equal(hitungNilaiSkor(2, 3), 67);
  // bobot campuran: skor 5 dari total 8 -> 63 (62.5 dibulatkan)
  assert.equal(hitungNilaiSkor(5, 8), 63);
});

// --- 4. formatSisaWaktu ---
uji('formatSisaWaktu', () => {
  assert.equal(formatSisaWaktu(3661), '01:01:01');
  assert.equal(formatSisaWaktu(3600), '01:00:00');
  assert.equal(formatSisaWaktu(125), '02:05');
  assert.equal(formatSisaWaktu(59), '00:59');
  assert.equal(formatSisaWaktu(0), '00:00');
  assert.equal(formatSisaWaktu(-10), '00:00');
  assert.equal(formatSisaWaktu(90.7), '01:30'); // dibulatkan ke bawah
});

// --- 5. acakSoalUntukSesi: subset acak sejumlah N ---
uji('acakSoalUntukSesi', () => {
  const bank = ['s1', 's2', 's3', 's4', 's5'];
  const ambil = acakSoalUntukSesi(bank, 3, prng(5));
  assert.equal(ambil.length, 3);
  assert.equal(new Set(ambil).size, 3); // tanpa duplikat
  for (const s of ambil) assert.ok(bank.includes(s));
  // N melebihi bank -> seluruh bank (tanpa duplikat)
  const semua = acakSoalUntukSesi(bank, 99, prng(5));
  assert.equal(semua.length, 5);
  assert.deepEqual([...semua].sort(), [...bank].sort());
  // N=0 -> kosong
  assert.deepEqual(acakSoalUntukSesi(bank, 0, prng(5)), []);
});

// --- 6. hitungBenar: benar/salah/kosong (pratinjau lokal) ---
uji('hitungBenar', () => {
  const kunci = [
    { soalId: 's1', kode: 'A' },
    { soalId: 's2', kode: 'B' },
    { soalId: 's3', kode: 'C' },
    { soalId: 's4', kode: 'D' },
  ];
  const jawaban = [
    { soalId: 's1', jawaban: 'A' }, // benar
    { soalId: 's2', jawaban: 'c' }, // salah (case-insensitive vs B)
    // s3 kosong
    { soalId: 's4', jawaban: 'd' }, // benar (lowercase ok)
  ];
  assert.deepEqual(hitungBenar(kunci, jawaban), { benar: 2, salah: 1, kosong: 1 });
  assert.deepEqual(hitungBenar(kunci, []), { benar: 0, salah: 0, kosong: 4 });
});


// --- 7. skorSoal PG: benar/salah/kosong ---
uji('skorSoal PG', () => {
  const pg = { jenis: 'pg', kunci: 'B', kunciJodoh: {}, pasanganKiri: [] };
  assert.equal(skorSoal(pg, 'B'), 1);
  assert.equal(skorSoal(pg, 'b'), 1); // case-insensitive
  assert.equal(skorSoal(pg, 'A'), 0);
  assert.equal(skorSoal(pg, ''), 0);
  assert.equal(skorSoal(pg, undefined), 0);
});

// --- 8. skorSoal PGK: proporsional, tanpa negatif ---
uji('skorSoal PGK proporsional', () => {
  const pgk = { jenis: 'pgk', kunci: 'A,B,D', kunciJodoh: {}, pasanganKiri: [] };
  assert.equal(skorSoal(pgk, 'A,B,D'), 1);
  assert.equal(skorSoal(pgk, 'A,B'), 2 / 3);
  assert.equal(skorSoal(pgk, 'A'), 1 / 3);
  // 2 benar + 1 salah -> (2-1)/3
  assert.equal(skorSoal(pgk, 'A,B,C'), 1 / 3);
  // semua salah -> 0, bukan negatif
  assert.equal(skorSoal(pgk, 'C,E'), 0);
  assert.equal(skorSoal(pgk, ''), 0);
});

// --- 9. skorSoal BS ---
uji('skorSoal BS', () => {
  const bs = { jenis: 'bs', kunci: 'Benar', kunciJodoh: {}, pasanganKiri: [] };
  assert.equal(skorSoal(bs, 'Benar'), 1);
  assert.equal(skorSoal(bs, 'benar'), 1);
  assert.equal(skorSoal(bs, 'Salah'), 0);
  assert.equal(skorSoal(bs, ''), 0);
});

// --- 10. skorSoal Jodoh: proporsional per pasangan ---
uji('skorSoal Jodoh', () => {
  const j = { jenis: 'jodoh', kunci: '', kunciJodoh: { 0: 0, 1: 1, 2: 2 }, pasanganKiri: ['a', 'b', 'c'] };
  assert.equal(skorSoal(j, '{"0":0,"1":1,"2":2}'), 1);
  assert.equal(skorSoal(j, '{"0":0,"1":2,"2":1}'), 1 / 3);
  assert.equal(skorSoal(j, '{}'), 0);
  assert.equal(skorSoal(j, 'bukan-json'), 0);
  assert.deepEqual([...uraiJawabanJodoh('{"0":1,"1":0}').entries()], [[0, 1], [1, 0]]);
});

// --- 11. skorSoal Isian: abaikan huruf & spasi ---
uji('skorSoal Isian', () => {
  const is = { jenis: 'isian', kunci: 'Jakarta', kunciJodoh: {}, pasanganKiri: [] };
  assert.equal(skorSoal(is, 'jakarta'), 1);
  assert.equal(skorSoal(is, '  Jakarta  '), 1);
  assert.equal(normalisasiIsian('  JaKarta   Raya '), 'jakarta raya');
  assert.equal(skorSoal(is, 'Bandung'), 0);
  assert.equal(skorSoal(is, ''), 0);
});

// --- 12. skorSoal Essay: null (menunggu penilaian manual) ---
uji('skorSoal Essay null', () => {
  const es = { jenis: 'essay', kunci: '', kunciJodoh: {}, pasanganKiri: [] };
  assert.equal(skorSoal(es, 'jawaban panjang...'), null);
  assert.equal(skorSoal(es, ''), null);
});

// --- 13. hitungNilaiDenganId: campuran 6 jenis + essay menunggu ---
uji('hitungNilaiDenganId campuran', () => {
  const soal = [
    { id: 's1', jenis: 'pg', kunci: 'B', kunciJodoh: {}, pasanganKiri: [], bobot: 1 },
    { id: 's2', jenis: 'pgk', kunci: 'A,B', kunciJodoh: {}, pasanganKiri: [], bobot: 2 },
    { id: 's3', jenis: 'bs', kunci: 'Benar', kunciJodoh: {}, pasanganKiri: [], bobot: 1 },
    { id: 's4', jenis: 'isian', kunci: '56', kunciJodoh: {}, pasanganKiri: [], bobot: 1 },
    { id: 's5', jenis: 'essay', kunci: '', kunciJodoh: {}, pasanganKiri: [], bobot: 5 },
  ];
  const jwb = { s1: 'B', s2: 'A,B', s3: 'Salah', s4: '56', s5: 'uraian saya' };
  const r = hitungNilaiDenganId(soal, jwb);
  // skor: 1 + 2 + 0 + 1 = 4 dari total 10 -> 40; essay menunggu
  assert.equal(r.skor, 4);
  assert.equal(r.totalBobot, 10);
  assert.equal(r.nilai, 40);
  assert.equal(r.menungguEssay, true);
  assert.equal(r.benar, 3);
  assert.equal(r.salah, 1);
  assert.equal(r.kosong, 0);
  // tanpa essay -> tidak menunggu
  const r2 = hitungNilaiDenganId(soal.slice(0, 4), jwb);
  assert.equal(r2.menungguEssay, false);
  assert.equal(r2.nilai, 80);
});

// --- 14. sudahDijawab per jenis ---
uji('sudahDijawab', () => {
  assert.equal(sudahDijawab('pg', 'A'), true);
  assert.equal(sudahDijawab('pg', ''), false);
  assert.equal(sudahDijawab('pgk', 'A,C'), true);
  assert.equal(sudahDijawab('pgk', ''), false);
  assert.equal(sudahDijawab('jodoh', '{"0":1}'), true);
  assert.equal(sudahDijawab('jodoh', '{}'), false);
  assert.equal(sudahDijawab('isian', '  '), false);
  assert.equal(sudahDijawab('essay', 'x'), true);
});

// --- 15. buatTokenAcak: 6 karakter, alfabet aman ---
uji('buatTokenAcak', () => {
  const t = buatTokenAcak(6, prng(3));
  assert.equal(t.length, 6);
  assert.ok(/^[A-Z2-9]{6}$/.test(t), t);
  assert.ok(!/[01IO]/.test(t), 'tanpa karakter ambigu 0/1/I/O');
  assert.deepEqual(buatTokenAcak(6, prng(3)), t); // deterministik
});

// --- 16. kelompokPaketPerHari: urut tanggal ---
uji('kelompokPaketPerHari', () => {
  const paket = [
    { mulai: '2026-11-12 08:00:00' },
    { mulai: '2026-11-11 08:00:00' },
    { mulai: '2026-11-11 10:00:00' },
    { mulai: '2026-11-13 08:00:00' },
  ];
  const g = kelompokPaketPerHari(paket);
  assert.equal(g.length, 3);
  assert.equal(g[0].tanggal, '2026-11-11');
  assert.equal(g[0].paket.length, 2);
  assert.equal(g[1].tanggal, '2026-11-12');
  assert.ok(g[0].label.includes('2026') || g[0].label.length > 0);
});

// --- 17. cekBentrokPaket ---
uji('cekBentrokPaket', () => {
  const calon = { jenjangId: 'j1', kelasIds: ['k1'], mulai: '2026-11-11 08:00:00', selesai: '2026-11-11 09:00:00' };
  const lain = [
    { id: 'p1', jenjangId: 'j1', kelasIds: ['k1'], mulai: '2026-11-11 08:30:00', selesai: '2026-11-11 09:30:00', nama: 'PTS B. Inggris' },
    { id: 'p2', jenjangId: 'j1', kelasIds: ['k2'], mulai: '2026-11-11 08:30:00', selesai: '2026-11-11 09:30:00', nama: 'PTS MTK 8A' },
    { id: 'p3', jenjangId: 'j1', kelasIds: ['k1'], mulai: '2026-11-11 10:00:00', selesai: '2026-11-11 11:00:00', nama: 'PTS IPA' },
  ];
  const r = cekBentrokPaket(calon, lain);
  assert.equal(r.bentrok, true);
  assert.deepEqual(r.dengan, ['PTS B. Inggris']);
  // kelas berbeda & jam berbeda -> tidak bentrok
  const r2 = cekBentrokPaket({ ...calon, kelasIds: ['k2'], mulai: '2026-11-11 10:00:00', selesai: '2026-11-11 11:00:00' }, lain);
  assert.equal(r2.bentrok, false);
  // abaikan diri sendiri saat edit
  const r3 = cekBentrokPaket(calon, lain, 'p1');
  assert.equal(r3.bentrok, false);
});

// --- 18. uraiKunciPgk ---
uji('uraiKunciPgk', () => {
  assert.deepEqual([...uraiKunciPgk('A,C')], ['A', 'C']);
  assert.deepEqual([...uraiKunciPgk(' a , b ')], ['A', 'B']);
  assert.equal(uraiKunciPgk('').size, 0);
});

console.log(`\n${lolos} lolos, ${gagal} gagal.`);
if (gagal > 0) process.exit(1);
