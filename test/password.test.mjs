// Tes generator password (v1.5.0) — src/utils/password.ts dikompilasi dulu:
//   ./node_modules/.bin/tsc --ignoreConfig src/utils/password.ts \
//     --outDir test/dist-pw --module esnext --target es2020 \
//     --moduleResolution bundler --skipLibCheck
//   node test/password.test.mjs
// (hapus test/dist-pw sebelum packaging, seperti test/dist-test.)
import assert from 'node:assert/strict';
import {
  buatBanyakPasswordAcak,
  buatPasswordAcak,
  passwordKetikValid,
} from './dist-pw/password.js';

// --- angka: panjang & charset digit saja ---
for (const n of [4, 6, 8, 32]) {
  const pw = buatPasswordAcak(n, 'angka');
  assert.equal(pw.length, n, `panjang angka ${n}`);
  assert.match(pw, /^[0-9]+$/, 'hanya digit');
}
console.log('✓ buatPasswordAcak angka');

// --- alfanumerik: panjang & tanpa karakter ambigu ---
{
  const pw = buatPasswordAcak(8, 'alfanumerik');
  assert.equal(pw.length, 8);
  assert.match(pw, /^[A-Za-z0-9]+$/, 'hanya huruf+angka');
  assert.doesNotMatch(pw, /[0O1lI]/, 'tanpa karakter ambigu 0/O/1/l/I');
}
console.log('✓ buatPasswordAcak alfanumerik');

// --- panjang dijepit 4–32 ---
assert.equal(buatPasswordAcak(1, 'angka').length, 4, 'panjang <4 dijepit ke 4');
assert.equal(buatPasswordAcak(99, 'angka').length, 32, 'panjang >32 dijepit ke 32');
assert.equal(buatPasswordAcak(0, 'angka').length, 6, 'panjang 0 -> default 6');
console.log('✓ penjepitan panjang');

// --- banyak password: tepat jumlah & semua berbeda ---
{
  const daftar = buatBanyakPasswordAcak(500, 6, 'angka');
  assert.equal(daftar.length, 500);
  assert.equal(new Set(daftar).size, 500, '500 password 6-digit semuanya unik');
  const daftar2 = buatBanyakPasswordAcak(50, 8, 'alfanumerik');
  assert.equal(new Set(daftar2).size, 50, 'password alfanumerik semuanya unik');
}
console.log('✓ buatBanyakPasswordAcak unik');

// --- validasi password ketik ---
assert.equal(passwordKetikValid('1234'), true);
assert.equal(passwordKetikValid('123'), false);
assert.equal(passwordKetikValid('    '), false);
assert.equal(passwordKetikValid(''), false);
assert.equal(passwordKetikValid('  abcd  '), true, 'spasi tepi diabaikan saat validasi');
console.log('✓ passwordKetikValid');

console.log('\nSemua tes password lolos.');
