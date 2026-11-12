// Util format tanggal — SATU sumber kebenaran untuk format dd/mm/yyyy.

/** "2026-10-17" -> "17/10/2026". Aman untuk string kosong/tidak valid. */
export function formatTanggal(iso: string): string {
  if (!iso) return '-';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** "2026-10-17 14:30:00" / "2026-10-17T14:30:00" -> "17/10/2026 14:30". */
export function formatTanggalWaktu(iso: string): string {
  if (!iso) return '-';
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(iso.trim());
  if (!m) return formatTanggal(iso);
  return `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}`;
}

/** Tanggal hari ini dalam format ISO yyyy-mm-dd. */
export function hariIniISO(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
