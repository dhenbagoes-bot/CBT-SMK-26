// Util logika ujian — murni, tanpa akses storage/API.
// CATATAN: nilai resmi SELALU dihitung server. hitungNilaiSkor di sini hanya
// untuk pratinjau lokal & test; tidak pernah dipakai menyimpan nilai.

import type { OpsiUjian } from '../types';

/** Fisher-Yates — mengembalikan salinan baru, array asli tidak diubah. */
export function acakArray<T>(arr: readonly T[], rand: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Acak urutan opsi tapi PERTAHANKAN kode asli tiap opsi (A–E).
 * Kode asli dipakai menilai di server; siswa tidak pernah melihatnya.
 */
export function acakOpsi(opsi: readonly OpsiUjian[], rand: () => number = Math.random): OpsiUjian[] {
  return acakArray(opsi, rand);
}

/**
 * Simulasi rumus nilai server (pratinjau saja):
 * nilai = round(skor / totalBobot * 100).
 */
export function hitungNilaiSkor(skor: number, totalBobot: number): number {
  if (!totalBobot || totalBobot <= 0) return 0;
  return Math.round((skor / totalBobot) * 100);
}

/** detik -> "HH:MM:SS" (atau "MM:SS" bila < 1 jam). */
export function formatSisaWaktu(detikTotal: number): string {
  const d = Math.max(0, Math.floor(detikTotal));
  const jam = Math.floor(d / 3600);
  const menit = Math.floor((d % 3600) / 60);
  const detik = d % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return jam > 0 ? `${p(jam)}:${p(menit)}:${p(detik)}` : `${p(menit)}:${p(detik)}`;
}

/**
 * Pilih N soal acak dari daftar id untuk mode acak (mirip perilaku server).
 * Mengembalikan subset acak berukuran min(n, daftar.length).
 */
export function acakSoalUntukSesi<T>(daftar: readonly T[], jumlah: number, rand: () => number = Math.random): T[] {
  return acakArray(daftar, rand).slice(0, Math.max(0, Math.min(jumlah, daftar.length)));
}

/** Hitung jumlah jawaban benar dari daftar kunci & jawaban (pratinjau lokal). */
export function hitungBenar(
  kunci: { soalId: string; kode: string }[],
  jawaban: { soalId: string; jawaban: string }[]
): { benar: number; salah: number; kosong: number } {
  const peta = new Map(jawaban.map((j) => [j.soalId, (j.jawaban || '').toUpperCase()]));
  let benar = 0;
  let salah = 0;
  let kosong = 0;
  for (const k of kunci) {
    const j = peta.get(k.soalId) || '';
    if (!j) kosong++;
    else if (j === k.kode.toUpperCase()) benar++;
    else salah++;
  }
  return { benar, salah, kosong };
}
