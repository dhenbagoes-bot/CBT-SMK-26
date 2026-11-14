import { useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, Loader2, X } from 'lucide-react';
import type { ToastMsg } from '../types';

// ============================================================
// Komponen UI bersama — tombol, kartu, field, modal, toast, kop.
// ============================================================

export function Spinner({ kecil = false }: { kecil?: boolean }) {
  return <Loader2 className={`${kecil ? 'h-4 w-4' : 'h-8 w-8'} animate-spin text-violet-600`} />;
}

export function LoadingBlock({ teks = 'Memuat...' }: { teks?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-500 dark:text-slate-400">
      <Spinner />
      <p className="text-sm">{teks}</p>
    </div>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-5 ${className}`}>
      {children}
    </div>
  );
}

export function PageHeader({ judul, subjudul, aksi }: { judul: string; subjudul?: string; aksi?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 sm:text-2xl">{judul}</h1>
        {subjudul && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subjudul}</p>}
      </div>
      {aksi && <div className="flex flex-wrap gap-2">{aksi}</div>}
    </div>
  );
}

type BtnVarian = 'primer' | 'sekunder' | 'bahaya' | 'hijau' | 'biru' | 'kuning' | 'ungu';

export function Button({
  children,
  onClick,
  varian = 'primer',
  disabled = false,
  loading = false,
  type = 'button',
  className = '',
  kecil = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  varian?: BtnVarian;
  disabled?: boolean;
  loading?: boolean;
  type?: 'button' | 'submit';
  className?: string;
  kecil?: boolean;
}) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50';
  const ukuran = kecil ? 'px-3 py-1.5 text-xs' : 'px-4 py-2.5 text-sm';
  const warna: Record<BtnVarian, string> = {
    primer: 'bg-violet-600 text-white hover:bg-violet-700',
    sekunder: 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700 dark:hover:bg-slate-700',
    bahaya: 'bg-red-600 text-white hover:bg-red-700',
    hijau: 'bg-emerald-600 text-white hover:bg-emerald-700',
    biru: 'bg-blue-600 text-white hover:bg-blue-700',
    kuning: 'bg-amber-500 text-white hover:bg-amber-600',
    ungu: 'bg-violet-600 text-white hover:bg-violet-700',
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`${base} ${ukuran} ${warna[varian]} ${className}`}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

export function Field({
  label,
  error,
  children,
  className = '',
}: {
  label: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-200">{label}</span>
      {children}
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}

const inputCls =
  'w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100 disabled:bg-slate-50 disabled:text-slate-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:ring-violet-900 dark:disabled:bg-slate-900';

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputCls} ${props.className || ''}`} />;
}

export function SelectInput(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${inputCls} ${props.className || ''}`} />;
}

export function TextAreaInput(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} rows={props.rows || 3} className={`${inputCls} resize-y ${props.className || ''}`} />;
}

export function EmptyState({ judul, subjudul }: { judul: string; subjudul?: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center dark:border-slate-700 dark:bg-slate-900">
      <p className="font-semibold text-slate-600 dark:text-slate-300">{judul}</p>
      {subjudul && <p className="mt-1 text-sm text-slate-400 dark:text-slate-500">{subjudul}</p>}
    </div>
  );
}

export function Modal({
  judul,
  onTutup,
  children,
  lebar = 'max-w-lg',
  nonDismissable = false,
}: {
  judul: string;
  onTutup: () => void;
  children: ReactNode;
  lebar?: string;
  nonDismissable?: boolean;
}) {
  useEffect(() => {
    if (nonDismissable) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onTutup();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onTutup, nonDismissable]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onClick={nonDismissable ? undefined : onTutup}
    >
      <div
        className={`w-full ${lebar} max-h-[92vh] overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl dark:bg-slate-900 sm:rounded-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">{judul}</h2>
          {!nonDismissable && (
            <button onClick={onTutup} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Tutup">
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

/** Dialog konfirmasi — dipakai sebelum setiap hapus / keputusan penting. */
export function ConfirmDialog({
  judul,
  pesan,
  teksYa = 'Ya, Lanjutkan',
  varian = 'bahaya',
  onYa,
  onBatal,
  loading = false,
}: {
  judul: string;
  pesan: string;
  teksYa?: string;
  varian?: BtnVarian;
  onYa: () => void;
  onBatal: () => void;
  loading?: boolean;
}) {
  return (
    <Modal judul={judul} onTutup={onBatal} lebar="max-w-sm">
      <div className="flex items-start gap-3">
        <div className="rounded-full bg-amber-100 p-2.5">
          <AlertTriangle className="h-5 w-5 text-amber-600" />
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-300">{pesan}</p>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button varian="sekunder" onClick={onBatal} disabled={loading}>
          Batal
        </Button>
        <Button varian={varian} onClick={onYa} loading={loading}>
          {teksYa}
        </Button>
      </div>
    </Modal>
  );
}

export function Toasts({ daftar, onTutup }: { daftar: ToastMsg[]; onTutup: (id: number) => void }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-6">
      {daftar.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex max-w-md items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-medium text-white shadow-lg ${
            t.tipe === 'sukses' ? 'bg-emerald-600' : t.tipe === 'error' ? 'bg-red-600' : 'bg-slate-700'
          }`}
        >
          {t.tipe === 'sukses' ? (
            <CheckCircle2 className="h-5 w-5 shrink-0" />
          ) : t.tipe === 'error' ? (
            <AlertTriangle className="h-5 w-5" />
          ) : (
            <Info className="h-5 w-5 shrink-0" />
          )}
          <span className="flex-1">{t.pesan}</span>
          <button onClick={() => onTutup(t.id)} className="rounded p-0.5 hover:bg-white/20" aria-label="Tutup notifikasi">
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

/** Hook jam live — dipakai di header. */
export function useJam() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) +
    ' • ' +
    now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/** Badge status kecil. */
export function Badge({
  warna,
  children,
}: {
  warna: 'hijau' | 'merah' | 'kuning' | 'biru' | 'abu' | 'ungu';
  children: ReactNode;
}) {
  const cls: Record<string, string> = {
    hijau: 'bg-emerald-100 text-emerald-700',
    merah: 'bg-red-100 text-red-700',
    kuning: 'bg-amber-100 text-amber-700',
    biru: 'bg-blue-100 text-blue-700',
    abu: 'bg-slate-100 text-slate-600',
    ungu: 'bg-violet-100 text-violet-700',
  };
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${cls[warna]}`}>{children}</span>
  );
}

/** Kartu statistik dashboard. */
export function StatCard({
  ikon,
  label,
  nilai,
  sub,
  warna,
}: {
  ikon: ReactNode;
  label: string;
  nilai: string;
  sub?: string;
  warna: 'biru' | 'hijau' | 'kuning' | 'ungu' | 'merah';
}) {
  const cls: Record<string, string> = {
    biru: 'bg-blue-100 text-blue-600',
    hijau: 'bg-emerald-100 text-emerald-600',
    kuning: 'bg-amber-100 text-amber-600',
    ungu: 'bg-violet-100 text-violet-600',
    merah: 'bg-red-100 text-red-600',
  };
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-5">
      <div className={`shrink-0 rounded-xl p-3 ${cls[warna]}`}>{ikon}</div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
        <h3 className="font-mono-num text-2xl font-bold text-slate-900 dark:text-slate-100">{nilai}</h3>
        {sub && <p className="mt-0.5 text-xs text-slate-400">{sub}</p>}
      </div>
    </div>
  );
}

/** Tabel responsif: bungkus dengan scroll horizontal di HP. */
export function TabelResponsif({ children }: { children: ReactNode }) {
  return <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">{children}</div>;
}

/** Kotak ceklis baris tabel (aksi massal, v1.3.1). */
export function Ceklis({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      aria-label={label}
      className="h-4 w-4 cursor-pointer accent-violet-600"
    />
  );
}

/** State pilihan massal: id terpilih + helper. Dipakai di Paket & Kelola Data (v1.3.1). */
export function useSeleksi() {
  const [terpilih, setTerpilih] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setTerpilih((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const aturBanyak = (ids: string[], pilih: boolean) =>
    setTerpilih((s) => {
      const n = new Set(s);
      for (const id of ids) {
        if (pilih) n.add(id);
        else n.delete(id);
      }
      return n;
    });
  const kosongkan = () => setTerpilih(new Set());
  return { terpilih, toggle, aturBanyak, kosongkan };
}

/** Bilah aksi untuk baris terpilih — muncul hanya bila ada yang diceklis (v1.3.1).
 *  Tombol Ubah hanya tampil bila tepat 1 baris terpilih. */
export function BarAksiMassal({
  jumlah,
  onUbah,
  onHapus,
  onBatal,
}: {
  jumlah: number;
  onUbah?: () => void;
  onHapus: () => void;
  onBatal: () => void;
}) {
  if (jumlah === 0) return null;
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 dark:border-violet-900 dark:bg-violet-950">
      <span className="text-sm font-bold text-violet-700 dark:text-violet-200">{jumlah} dipilih</span>
      {jumlah === 1 && onUbah && (
        <Button kecil varian="sekunder" onClick={onUbah}>
          Ubah
        </Button>
      )}
      <Button kecil varian="bahaya" onClick={onHapus}>
        Hapus terpilih
      </Button>
      <Button kecil varian="sekunder" onClick={onBatal}>
        Batalkan pilihan
      </Button>
    </div>
  );
}

export const thCls = 'border-b border-slate-200 bg-slate-50 px-3 py-2.5 text-left text-xs font-bold uppercase tracking-wide text-slate-500 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400';
export const tdCls = 'border-b border-slate-100 px-3 py-2.5 text-sm text-slate-700 dark:border-slate-800 dark:text-slate-200';

/** Kop sekolah untuk area cetak (#print-area). */
export function KopCetak({
  logoUrl,
  namaSekolah,
  alamat,
  telepon,
  judul,
  subJudul,
}: {
  logoUrl?: string;
  namaSekolah?: string;
  alamat?: string;
  telepon?: string;
  judul: string;
  subJudul?: string;
}) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-4">
        {logoUrl ? (
          <img src={logoUrl} alt="Logo" className="h-16 w-16 object-contain" />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-slate-100 text-3xl">🧩</div>
        )}
        <div className="flex-1 text-center">
          <h2 className="text-lg font-bold uppercase text-slate-900">{namaSekolah || 'Sekolah'}</h2>
          {alamat && <p className="text-xs text-slate-600">{alamat}</p>}
          {telepon && <p className="text-xs text-slate-600">Telp: {telepon}</p>}
        </div>
        <div className="w-16" />
      </div>
      <hr className="my-3 border-t-2 border-slate-900" />
      <h3 className="text-center text-base font-bold text-slate-900">{judul}</h3>
      {subJudul && <p className="mt-0.5 text-center text-sm text-slate-600">{subJudul}</p>}
    </div>
  );
}

/** Tanda tangan untuk area cetak. */
export function TtdCetak({ namaKepala, kota = '' }: { namaKepala?: string; kota?: string }) {
  const hariIni = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  return (
    <div className="mt-8 flex justify-end">
      <div className="w-56 text-center text-sm text-slate-800">
        <p>{kota ? `${kota}, ` : ''}{hariIni}</p>
        <p>Kepala Sekolah</p>
        <div className="h-16" />
        <p className="font-bold underline">{namaKepala || '( .................................... )'}</p>
      </div>
    </div>
  );
}
