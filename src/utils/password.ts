// Generator password siswa (v1.5.0) — dipakai tombol "Password" di Data Siswa.
// Tanpa dependensi agar bisa diuji langsung (lihat test/password.test.mjs).

export type JenisPasswordAcak = 'angka' | 'alfanumerik';

/** Angka saja — paling mudah diketik siswa (contoh: 482917). */
const HURUF_ANGKA = '0123456789';
/** Huruf + angka tanpa karakter ambigu (0/O, 1/l/I dibuang) agar tak salah baca. */
const HURUF_ALFANUMERIK = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

export const PANJANG_PASSWORD_MIN = 4;
export const PANJANG_PASSWORD_MAX = 32;

/** Satu byte acak 0–255: crypto aman bila tersedia, fallback Math.random. */
function byteAcak(): number {
  try {
    const g = globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } };
    if (g.crypto && typeof g.crypto.getRandomValues === 'function') {
      const b = new Uint8Array(1);
      g.crypto.getRandomValues(b);
      return b[0];
    }
  } catch {
    /* fallback di bawah */
  }
  return Math.floor(Math.random() * 256);
}

/**
 * Buat satu password acak. Rejection sampling agar tiap karakter
 * berpeluang sama (tanpa bias modulo). Panjang dijepit 4–32.
 */
export function buatPasswordAcak(
  panjang = 6,
  jenis: JenisPasswordAcak = 'angka'
): string {
  const n = Math.max(
    PANJANG_PASSWORD_MIN,
    Math.min(PANJANG_PASSWORD_MAX, Math.floor(panjang) || 6)
  );
  const charset = jenis === 'alfanumerik' ? HURUF_ALFANUMERIK : HURUF_ANGKA;
  const batas = 256 - (256 % charset.length);
  let hasil = '';
  while (hasil.length < n) {
    const b = byteAcak();
    if (b >= batas) continue; // buang agar distribusi rata
    hasil += charset[b % charset.length];
  }
  return hasil;
}

/**
 * Buat BANYAK password acak yang semuanya BERBEDA (mode "acak" massal).
 * Mengembalikan tepat `jumlah` password unik; bila ruang kombinasi
 * terlalu kecil (mis. 6 digit untuk >900rb siswa), ulangi secukupnya
 * lalu izinkan duplikat daripada menggantung selamanya.
 */
export function buatBanyakPasswordAcak(
  jumlah: number,
  panjang = 6,
  jenis: JenisPasswordAcak = 'angka'
): string[] {
  const hasil: string[] = [];
  const sudah = new Set<string>();
  let percobaan = 0;
  const batasPercobaan = Math.max(1000, jumlah * 20);
  while (hasil.length < jumlah) {
    const pw = buatPasswordAcak(panjang, jenis);
    percobaan++;
    if (!sudah.has(pw) || percobaan > batasPercobaan) {
      sudah.add(pw);
      hasil.push(pw);
    }
  }
  return hasil;
}

/** Validasi password "sama" yang diketik admin: minimal 4 karakter. */
export function passwordKetikValid(password: string): boolean {
  return (password || '').trim().length >= PANJANG_PASSWORD_MIN;
}

/** Salin teks ke clipboard (fallback untuk browser lama). */
export async function salinTeks(teks: string): Promise<boolean> {
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(teks);
      return true;
    }
  } catch {
    /* fallback di bawah */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = teks;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
