import { useEffect, useState, type ReactNode } from 'react';
import {
  BarChart3,
  BookOpen,
  Briefcase,
  ClipboardList,
  CreditCard,
  FileText,
  GraduationCap,
  HelpCircle,
  History,
  Home,
  Info,
  Library,
  LineChart,
  LogIn,
  LogOut,
  Menu as MenuIcon,
  MonitorPlay,
  Moon,
  Package,
  PenLine,
  School,
  Settings,
  Sun,
  Tag,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import type { PageKey, SekolahEntry, UserSesi } from '../types';
import { Modal, useJam } from './ui';

/** Tema terang/gelap — preferensi saja (localStorage), BUKAN data ujian. */
export const LS_TEMA = 'cbt-madrasah-theme';

export function bacaTema(): 'terang' | 'gelap' {
  try {
    return localStorage.getItem(LS_TEMA) === 'gelap' ? 'gelap' : 'terang';
  } catch {
    return 'terang';
  }
}

export function terapkanTema(tema: 'terang' | 'gelap'): void {
  try {
    localStorage.setItem(LS_TEMA, tema);
  } catch {
    /* abaikan */
  }
  document.documentElement.classList.toggle('dark', tema === 'gelap');
}

// ============================================================
// Layout: header + navigasi berbasis PERAN (sidebar desktop,
// bottom nav HP). Icon: 🖥️ (emoji di index.html).
// ============================================================

export interface NavItem {
  key: PageKey;
  label: string;
  icon: ReactNode;
  /** peran yang boleh melihat item ini; kosong = semua */
  peran?: ('admin' | 'guru' | 'siswa')[];
  /** butuh login (peran apa pun) */
  butuhLogin?: boolean;
  /** kelompok bagian di sidebar; kosong = tanpa header bagian */
  bagian?: string;
}

/** Urutan kelompok bagian di sidebar (v1.4.0). */
export const URUTAN_BAGIAN = ['DATA MASTER', 'MANAJEMEN UJIAN', 'PELAKSANAAN', 'SISTEM'];

export const SEMUA_NAV: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', icon: <Home className="h-5 w-5" /> },
  // DATA MASTER (admin) — deep-link ke tab Kelola Data / halaman Jenis Ujian.
  { key: 'data-kelas', label: 'Data Kelas', icon: <School className="h-5 w-5" />, peran: ['admin'], bagian: 'DATA MASTER' },
  { key: 'data-siswa', label: 'Data Siswa', icon: <GraduationCap className="h-5 w-5" />, peran: ['admin'], bagian: 'DATA MASTER' },
  { key: 'data-guru', label: 'Data Guru', icon: <Briefcase className="h-5 w-5" />, peran: ['admin'], bagian: 'DATA MASTER' },
  { key: 'mapel', label: 'Mata Pelajaran', icon: <Library className="h-5 w-5" />, peran: ['admin'], bagian: 'DATA MASTER' },
  { key: 'jenis-ujian', label: 'Jenis Ujian', icon: <Tag className="h-5 w-5" />, peran: ['admin'], bagian: 'DATA MASTER' },
  // MANAJEMEN UJIAN (admin/guru)
  { key: 'bank-soal', label: 'Bank Soal', icon: <BookOpen className="h-5 w-5" />, peran: ['admin', 'guru'], bagian: 'MANAJEMEN UJIAN' },
  { key: 'paket', label: 'Jadwal Ujian', icon: <Package className="h-5 w-5" />, peran: ['admin', 'guru'], bagian: 'MANAJEMEN UJIAN' },
  { key: 'kartu-peserta', label: 'Cetak Kartu Peserta', icon: <CreditCard className="h-5 w-5" />, peran: ['admin', 'guru'], bagian: 'MANAJEMEN UJIAN' },
  { key: 'laporan', label: 'Administrasi', icon: <FileText className="h-5 w-5" />, peran: ['admin', 'guru'], bagian: 'MANAJEMEN UJIAN' },
  // PELAKSANAAN
  { key: 'ujian', label: 'Ujian', icon: <PenLine className="h-5 w-5" />, peran: ['siswa'], bagian: 'PELAKSANAAN' },
  { key: 'monitor', label: 'Status Ujian', icon: <MonitorPlay className="h-5 w-5" />, peran: ['admin', 'guru'], bagian: 'PELAKSANAAN' },
  { key: 'hasil', label: 'Hasil Ujian', icon: <ClipboardList className="h-5 w-5" />, butuhLogin: true, bagian: 'PELAKSANAAN' },
  { key: 'analisis-saya', label: 'Analisis Saya', icon: <LineChart className="h-5 w-5" />, peran: ['siswa'], bagian: 'PELAKSANAAN' },
  { key: 'analisis-kelas', label: 'Analisis Soal', icon: <BarChart3 className="h-5 w-5" />, peran: ['admin', 'guru'], bagian: 'PELAKSANAAN' },
  // SISTEM
  { key: 'pengaturan', label: 'Pengaturan', icon: <Settings className="h-5 w-5" />, peran: ['admin'], bagian: 'SISTEM' },
  { key: 'log-pembaruan', label: 'Log Pembaruan', icon: <History className="h-5 w-5" />, bagian: 'SISTEM' },
  { key: 'petunjuk', label: 'Petunjuk', icon: <HelpCircle className="h-5 w-5" />, bagian: 'SISTEM' },
  { key: 'tentang', label: 'Tentang', icon: <Info className="h-5 w-5" />, bagian: 'SISTEM' },
  // Sejak v1.2.0 tidak ada lagi menu Konfigurasi: isinya pindah ke dalam
  // Pengaturan (admin saja). Sejak v1.4.0 tidak ada lagi menu Kelola Data:
  // isinya menjadi menu Data Master di atas (rute lama tetap bisa dibuka).
];

/** Item yang tampil sesuai user. */
export function navUntuk(user: UserSesi | null): NavItem[] {
  return SEMUA_NAV.filter((n) => {
    if (n.peran && (!user || !n.peran.includes(user.peran))) return false;
    if (n.butuhLogin && !user) return false;
    return true;
  });
}

/** Bottom nav HP: 4 item utama per peran, sisanya di sheet "Menu". */
function utamaUntuk(user: UserSesi | null): PageKey[] {
  if (user?.peran === 'siswa') return ['dashboard', 'ujian', 'analisis-saya', 'hasil'];
  if (user?.peran === 'guru') return ['dashboard', 'bank-soal', 'paket', 'monitor'];
  if (user?.peran === 'admin') return ['dashboard', 'bank-soal', 'paket', 'hasil'];
  return ['dashboard'];
}

export function Layout({
  page,
  onPindah,
  sekolah,
  daftarSekolah,
  onGantiSekolah,
  terhubung,
  logoUrl,
  namaSekolah,
  user,
  onLogin,
  onLogout,
  modeUjian = false,
  children,
}: {
  page: PageKey;
  onPindah: (p: PageKey) => void;
  sekolah: SekolahEntry | null;
  daftarSekolah: SekolahEntry[];
  onGantiSekolah: (s: SekolahEntry) => void;
  terhubung: boolean;
  logoUrl?: string;
  namaSekolah?: string;
  user: UserSesi | null;
  onLogin: () => void;
  onLogout: () => void;
  /** saat di ruang ujian: sembunyikan navigasi agar fokus (anti-curang) */
  modeUjian?: boolean;
  children: ReactNode;
}) {
  const jam = useJam();
  const [menuBuka, setMenuBuka] = useState(false);
  const [pickerBuka, setPickerBuka] = useState(false);
  const [tema, setTema] = useState<'terang' | 'gelap'>(() => bacaTema());

  useEffect(() => {
    terapkanTema(tema);
  }, [tema]);

  const toggleTema = () => setTema((t) => (t === 'gelap' ? 'terang' : 'gelap'));

  const navTampil = navUntuk(user);
  // Kelompok sidebar: item tanpa bagian dulu (Dashboard), lalu tiap bagian
  // yang masih punya item terlihat (v1.4.0). Bagian kosong tidak dirender.
  const grupNav: { judul: string | null; item: NavItem[] }[] = [];
  const tanpaBagian = navTampil.filter((n) => !n.bagian);
  if (tanpaBagian.length > 0) grupNav.push({ judul: null, item: tanpaBagian });
  for (const b of URUTAN_BAGIAN) {
    const item = navTampil.filter((n) => n.bagian === b);
    if (item.length > 0) grupNav.push({ judul: b, item });
  }
  const kunciUtama = utamaUntuk(user);
  const utama = navTampil.filter((n) => kunciUtama.includes(n.key));
  const lainnya = navTampil.filter((n) => !kunciUtama.includes(n.key));

  const pindah = (p: PageKey) => {
    onPindah(p);
    setMenuBuka(false);
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="min-h-screen">
      {/* ===== Header ===== */}
      <header className="sticky top-0 z-40 border-b border-emerald-950 bg-gradient-to-r from-emerald-950 via-emerald-900 to-emerald-800 text-white shadow-md">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-3 py-2.5 sm:px-6">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white/15 text-2xl">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="h-full w-full bg-white object-contain" />
            ) : (
              '🎓'
            )}
          </div>
          <div className="min-w-0 flex-1">
            {modeUjian ? (
              <p className="truncate text-sm font-bold sm:text-base">
                {namaSekolah || sekolah?.nama || 'CBT Digital'}
              </p>
            ) : (
              <button
                onClick={() => setPickerBuka(true)}
                className="block max-w-full truncate text-left text-sm font-bold leading-tight hover:underline sm:text-base"
                title="Ganti sekolah"
              >
                {namaSekolah || sekolah?.nama || 'CBT Digital'} ▾
              </button>
            )}
            <p className="font-mono-num truncate text-[11px] text-emerald-100 sm:text-xs">{jam}</p>
          </div>
          {user ? (
            <div
              className="hidden items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold sm:inline-flex"
              title={user.nama}
            >
              <span className="max-w-[120px] truncate">{user.nama}</span>
              <span className="rounded-full bg-white/25 px-2 py-0.5 uppercase">{user.peran}</span>
            </div>
          ) : (
            !modeUjian && (
              <button
                onClick={onLogin}
                className="hidden items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold hover:bg-white/25 sm:inline-flex"
              >
                <LogIn className="h-3.5 w-3.5" />
                Masuk
              </button>
            )
          )}
          <button
            onClick={toggleTema}
            className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold hover:bg-white/25"
            title={tema === 'gelap' ? 'Ganti ke mode terang' : 'Ganti ke mode gelap'}
            aria-label="Ganti tema terang/gelap"
          >
            {tema === 'gelap' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">{tema === 'gelap' ? 'Terang' : 'Gelap'}</span>
          </button>
          <div
            className={`hidden items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold sm:inline-flex ${
              terhubung ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-white'
            }`}
            title={terhubung ? 'Terhubung ke backend' : 'Backend belum terhubung'}
          >
            {terhubung ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
            {terhubung ? 'Online' : 'Offline'}
          </div>
          {!modeUjian &&
            (user ? (
              <button
                onClick={onLogout}
                className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold hover:bg-white/25"
                title="Keluar"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Keluar</span>
              </button>
            ) : (
              <button
                onClick={onLogin}
                className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold hover:bg-white/25 sm:hidden"
                title="Masuk"
              >
                <LogIn className="h-3.5 w-3.5" />
              </button>
            ))}
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-6 px-3 py-4 sm:px-6 sm:py-6">
        {/* ===== Sidebar (desktop) ===== */}
        {!modeUjian && (
          <aside className="hidden w-60 shrink-0 md:block">
            <nav className="sticky top-[76px] rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              {grupNav.map((g) => (
                <div key={g.judul || 'utama'} className="space-y-1">
                  {g.judul && (
                    <p className="px-3.5 pb-1 pt-3 text-[11px] font-bold uppercase tracking-wider text-slate-400 first:pt-1">
                      {g.judul}
                    </p>
                  )}
                  {g.item.map((n) => (
                    <button
                      key={n.key}
                      onClick={() => pindah(n.key)}
                      className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition ${
                        page === n.key
                          ? 'bg-violet-600 text-white shadow-sm'
                          : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                      }`}
                    >
                      {n.icon}
                      {n.label}
                    </button>
                  ))}
                </div>
              ))}
            </nav>
          </aside>
        )}

        {/* ===== Konten ===== */}
        <main className="min-w-0 flex-1 pb-24 md:pb-8">{children}</main>
      </div>

      {/* ===== Bottom nav (HP) ===== */}
      {!modeUjian && (
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-slate-700 dark:bg-slate-900/95 md:hidden">
          <div className={`grid ${lainnya.length > 0 ? 'grid-cols-5' : 'grid-cols-4'}`}>
            {utama.map((n) => (
              <button
                key={n.key}
                onClick={() => pindah(n.key)}
                className={`flex flex-col items-center gap-1 py-2.5 text-[10px] font-semibold ${
                  page === n.key ? 'text-violet-600 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'
                }`}
              >
                {n.icon}
                {n.label}
              </button>
            ))}
            {lainnya.length > 0 && (
              <button
                onClick={() => setMenuBuka(true)}
                className={`flex flex-col items-center gap-1 py-2.5 text-[10px] font-semibold ${
                  lainnya.some((n) => n.key === page) ? 'text-violet-600 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'
                }`}
              >
                <MenuIcon className="h-5 w-5" />
                Menu
              </button>
            )}
          </div>
        </nav>
      )}

      {/* ===== Sheet menu lainnya (HP) ===== */}
      {menuBuka && (
        <div className="fixed inset-0 z-50 bg-black/50 md:hidden" onClick={() => setMenuBuka(false)}>
          <div
            className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-white p-4 pb-8 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-300" />
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 dark:text-slate-100">Menu Lainnya</h3>
              <button onClick={() => setMenuBuka(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {lainnya.map((n) => (
                <button
                  key={n.key}
                  onClick={() => pindah(n.key)}
                  className={`flex items-center gap-3 rounded-xl border p-3.5 text-left text-sm font-semibold ${
                    page === n.key
                      ? 'border-violet-600 bg-violet-50 text-violet-700'
                      : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'
                  }`}
                >
                  {n.icon}
                  {n.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ===== Pemilih sekolah ===== */}
      {pickerBuka && !modeUjian && (
        <Modal judul="Pilih Sekolah" onTutup={() => setPickerBuka(false)} lebar="max-w-md">
          <div className="space-y-2">
            {daftarSekolah.length === 0 && (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Belum ada sekolah terdaftar. Tambahkan di <code>public/schools.json</code> atau hubungi admin
                sekolah.
              </p>
            )}
            {daftarSekolah.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  onGantiSekolah(s);
                  setPickerBuka(false);
                }}
                className={`block w-full rounded-xl border p-3.5 text-left transition ${
                  sekolah?.id === s.id
                    ? 'border-violet-600 bg-violet-50 dark:bg-violet-950'
                    : 'border-slate-200 hover:border-violet-300 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'
                }`}
              >
                <p className="font-bold text-slate-900 dark:text-slate-100">{s.nama}</p>
                {s.kota && <p className="text-xs text-slate-500">{s.kota}</p>}
                {sekolah?.id === s.id && (
                  <p className="mt-1 text-xs font-semibold text-violet-600">✓ Sedang aktif</p>
                )}
              </button>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
