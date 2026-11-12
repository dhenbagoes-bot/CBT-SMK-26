import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Layout } from './components/Layout';
import { Button, LoadingBlock, Toasts } from './components/ui';
import Dashboard from './pages/Dashboard';
import BankSoal from './pages/BankSoal';
import Paket from './pages/Paket';
import Ujian from './pages/Ujian';
import Monitor from './pages/Monitor';
import Hasil from './pages/Hasil';
import AnalisisSaya from './pages/AnalisisSaya';
import AnalisisKelas from './pages/AnalisisKelas';
import Laporan from './pages/Laporan';
import KelolaData from './pages/KelolaData';
import Pengaturan from './pages/Pengaturan';
import Konfigurasi from './pages/Konfigurasi';
import Login from './pages/Login';
import type { PageProps } from './pages/PageProps';
import {
  bersihkanToken,
  getAllData,
  getApiUrl,
  getSesiTersimpan,
  getToken,
  logout,
  setApiUrl,
  setUrlEfektif,
} from './services/api';
import type { AllData, PageKey, Pengaturan as PengaturanTipe, SekolahEntry, ToastMsg, UserSesi } from './types';
import { normalisasiSoalBank } from './types';

const LS_SCHOOL = 'wwn-cbt-madrasah-80.schoolId';

const PENGATURAN_DEFAULT: PengaturanTipe = {
  namaSekolah: 'SMK NEGERI 1 JUWANGI',
  alamatSekolah: 'Juwangi, Boyolali',
  telepon: '',
  namaKepala: '',
  logoUrl: '',
  ambangPeringatan: 3,
  wajibFullscreen: 1,
  izinkanUlangSetelahBatal: 0,
  kkm: 75,
  durasiStandar: 60,
  jedaGelombang: 3,
  waAktif: 'false',
  waEndpoint: '',
  waApiKey: '',
  waTemplateProgres:
    'Halo {nama}, progres belajar CBT {sekolah} per {tanggal}: rata-rata nilai {rata2} dari {jmlUjian} ujian. Mapel yang perlu ditingkatkan: {mapelLemah}. Tetap semangat!',
};

function normalisasiData(d: AllData): AllData {
  return {
    pengaturan: { ...PENGATURAN_DEFAULT, ...(d.pengaturan || {}) },
    jenjang: d.jenjang || [],
    mapel: d.mapel || [],
    kelas: d.kelas || [],
    pengguna: d.pengguna || [],
    // Soal lama (PG saja, opsiA–E) dinormalisasi ke 6 jenis soal.
    bankSoal: (d.bankSoal || []).map(normalisasiSoalBank),
    paket: (d.paket || []).map((p) => ({
      ...p,
      token: p.token || '',
      jedaGelombang: typeof p.jedaGelombang === 'number' ? p.jedaGelombang : 3,
    })),
    sesi: d.sesi || [],
    // Backend mengirim status/essayBelumDinilai/nilaiFinal/tuntas;
    // turunkan juga `menungguEssay` agar badge "Menunggu penilaian" tampil.
    hasil: (d.hasil || []).map((h) => ({
      ...h,
      menungguEssay: (h.essayBelumDinilai || 0) > 0 || h.nilaiFinal === false,
    })),
  };
}

const DATA_KOSONG: AllData = {
  pengaturan: PENGATURAN_DEFAULT,
  jenjang: [],
  mapel: [],
  kelas: [],
  pengguna: [],
  bankSoal: [],
  paket: [],
  sesi: [],
  hasil: [],
};

export default function App() {
  const [daftarSekolah, setDaftarSekolah] = useState<SekolahEntry[]>([]);
  const [sekolah, setSekolah] = useState<SekolahEntry | null>(null);
  const [urlManual, setUrlManual] = useState(() => getApiUrl());
  const [data, setData] = useState<AllData | null>(null);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState('');
  const [terhubung, setTerhubung] = useState(false);
  // Sesi user: token utama di memori; admin/guru boleh "tetap masuk"
  // (token + profil tersimpan di perangkat, dipulihkan saat aplikasi dibuka).
  const [user, setUser] = useState<UserSesi | null>(null);
  const [page, setPage] = useState<PageKey>('dashboard');
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const [modeUjian, setModeUjian] = useState(false);
  const inisialisasiRef = useRef(false);

  const toast = useCallback((pesan: string, tipe: ToastMsg['tipe'] = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, pesan, tipe }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  const urlEfektif = urlManual.trim() || sekolah?.apiUrl.trim() || '';

  // Galat "sesi berakhir" BUKAN kerusakan: backend bisa dihubungi, hanya
  // token sesi yang tidak ada/kedaluwarsa (token memang hanya di memori dan
  // hilang saat tab ditutup). Langsung arahkan ke halaman Masuk dengan pesan
  // ramah, bukan layar "Gagal memuat data" yang menakutkan.
  const tanganiGalatMuat = useCallback(
    (pesan: string) => {
      if (/sesi|login|token/i.test(pesan)) {
        bersihkanToken(); // token mati (termasuk yang tersimpan) wajib dibuang
        setTerhubung(true);
        setGalat('');
        setData(null);
        setUser(null);
        setModeUjian(false);
        setPage('login');
        toast('Sesi berakhir, silakan masuk kembali.', 'info');
      } else {
        setTerhubung(false);
        setGalat(pesan);
        setData(null);
      }
    },
    [toast]
  );

  const muatData = useCallback(async () => {
    setMemuat(true);
    setGalat('');
    try {
      const d = await getAllData();
      setData(normalisasiData(d));
      setTerhubung(true);
    } catch (err) {
      tanganiGalatMuat(err instanceof Error ? err.message : 'Gagal memuat data.');
    } finally {
      setMemuat(false);
    }
  }, [tanganiGalatMuat]);

  const muatDataRef = useRef(muatData);
  muatDataRef.current = muatData;

  // ---- inisialisasi: schools.json -> sekolah -> URL efektif -> data ----
  useEffect(() => {
    if (inisialisasiRef.current) return;
    inisialisasiRef.current = true;
    (async () => {
      let daftar: SekolahEntry[] = [];
      try {
        const r = await fetch('schools.json');
        if (r.ok) daftar = (await r.json()) as SekolahEntry[];
      } catch {
        /* abaikan */
      }
      setDaftarSekolah(daftar);

      const params = new URLSearchParams(window.location.search);
      const dariUrl = params.get('school');
      let terpilih: SekolahEntry | null = null;
      try {
        const tersimpan = localStorage.getItem(LS_SCHOOL);
        terpilih =
          daftar.find((s) => s.id === dariUrl) ||
          daftar.find((s) => s.id === tersimpan) ||
          daftar[0] ||
          null;
      } catch {
        terpilih = daftar.find((s) => s.id === dariUrl) || daftar[0] || null;
      }
      setSekolah(terpilih);
      if (terpilih) {
        try {
          localStorage.setItem(LS_SCHOOL, terpilih.id);
        } catch {
          /* abaikan */
        }
      }

      const manual = getApiUrl();
      setUrlManual(manual);
      const efektif = manual.trim() || terpilih?.apiUrl.trim() || '';
      setUrlEfektif(efektif);

      if (!efektif) {
        setMemuat(false);
        setTerhubung(false);
        setPage('konfigurasi');
        toast('Selamat datang! Hubungkan aplikasi ke backend dulu di menu Konfigurasi. 🏁', 'info');
        return;
      }
      // Pulihkan sesi tersimpan (admin/guru "tetap masuk").
      const sesiTersimpan = getSesiTersimpan();
      if (sesiTersimpan && getToken()) setUser(sesiTersimpan);
      await muatDataRef.current();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const gantiSekolah = useCallback(
    async (s: SekolahEntry) => {
      setSekolah(s);
      try {
        localStorage.setItem(LS_SCHOOL, s.id);
      } catch {
        /* abaikan */
      }
      // Ganti sekolah -> hapus override manual + sesi (token milik backend lama)
      setApiUrl('');
      setUrlManual('');
      setUrlEfektif(s.apiUrl.trim());
      bersihkanToken(); // token milik backend lama, tidak berlaku di sini
      setUser(null);
      setModeUjian(false);
      const params = new URLSearchParams(window.location.search);
      params.set('school', s.id);
      window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
      setPage('dashboard');
      window.scrollTo({ top: 0 });
      setMemuat(true);
      setGalat('');
      try {
        const d = await getAllData();
        setData(normalisasiData(d));
        setTerhubung(true);
        toast(`Beralih ke ${s.nama}.`, 'sukses');
      } catch (err) {
        tanganiGalatMuat(err instanceof Error ? err.message : 'Gagal memuat data.');
      } finally {
        setMemuat(false);
      }
    },
    [toast, tanganiGalatMuat]
  );

  const gantiUrlManual = useCallback(
    async (url: string) => {
      setUrlManual(url);
      setUrlEfektif(url.trim() || sekolah?.apiUrl.trim() || '');
      setMemuat(true);
      setGalat('');
      try {
        const d = await getAllData();
        setData(normalisasiData(d));
        setTerhubung(true);
      } catch (err) {
        tanganiGalatMuat(err instanceof Error ? err.message : 'Gagal memuat data.');
      } finally {
        setMemuat(false);
      }
    },
    [sekolah, tanganiGalatMuat]
  );

  const onNeedLogin = useCallback(
    (pesan?: string) => {
      toast(pesan || 'Silakan masuk dulu untuk mengakses halaman ini.', 'info');
      setPage('login');
      window.scrollTo({ top: 0 });
    },
    [toast]
  );

  const onAuthChange = useCallback((u: UserSesi | null) => {
    setUser(u);
    if (!u) setModeUjian(false);
  }, []);

  const handleLogout = useCallback(async () => {
    await logout();
    setUser(null);
    setModeUjian(false);
    toast('Anda telah keluar.', 'info');
    setPage('dashboard');
  }, [toast]);

  const pindah = useCallback((p: PageKey) => {
    setPage(p);
    window.scrollTo({ top: 0 });
  }, []);

  // ---- hak akses halaman ----
  const butuhGuru: PageKey[] = ['bank-soal', 'paket', 'monitor', 'analisis-kelas', 'laporan'];
  const bolehGuru = !user || user.peran === 'guru' || user.peran === 'admin';
  const butuhLogin = (page === 'hasil' || page === 'ujian' || page === 'analisis-saya' || butuhGuru.includes(page) || page === 'kelola-data' || page === 'pengaturan') && !user;
  const butuhAdmin = (page === 'kelola-data' || page === 'pengaturan') && user?.peran !== 'admin';
  const butuhSiswa = page === 'ujian' && user && user.peran !== 'siswa';
  const butuhBukanSiswa = butuhGuru.includes(page) && user && !bolehGuru;
  const aksesDitolak = butuhLogin || butuhAdmin || butuhSiswa || butuhBukanSiswa;

  const kontenProps = (d: AllData): PageProps => ({
    pengaturan: d.pengaturan,
    data: d,
    user,
    onNeedLogin,
    refreshData: muatData,
    toast,
    pindah,
  });

  const renderHalaman = (d: AllData) => {
    const props = kontenProps(d);
    if (aksesDitolak) {
      return (
        <div>
          <div className="mx-auto mb-4 max-w-md rounded-xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
            {!user
              ? 'Silakan masuk dulu untuk mengakses halaman ini.'
              : 'Peran Anda tidak diizinkan mengakses halaman ini.'}
          </div>
          <Login {...props} onAuthChange={onAuthChange} />
        </div>
      );
    }
    switch (page) {
      case 'dashboard':
        return <Dashboard {...props} />;
      case 'bank-soal':
        return <BankSoal {...props} />;
      case 'paket':
        return <Paket {...props} />;
      case 'ujian':
        return <Ujian {...props} onRuangUjianChange={setModeUjian} />;
      case 'monitor':
        return <Monitor {...props} />;
      case 'hasil':
        return <Hasil {...props} />;
      case 'analisis-saya':
        return <AnalisisSaya {...props} />;
      case 'analisis-kelas':
        return <AnalisisKelas {...props} />;
      case 'laporan':
        return <Laporan {...props} />;
      case 'kelola-data':
        return <KelolaData {...props} />;
      case 'pengaturan':
        return <Pengaturan {...props} />;
      case 'konfigurasi':
        return (
          <Konfigurasi
            {...props}
            sekolah={sekolah}
            daftarSekolah={daftarSekolah}
            onGantiSekolah={gantiSekolah}
            onApiUrlChange={gantiUrlManual}
          />
        );
      case 'login':
        return <Login {...props} onAuthChange={onAuthChange} />;
      default:
        return <Dashboard {...props} />;
    }
  };

  // ---- render ----
  let konten: React.ReactNode;
  if (memuat && !data) {
    konten = <LoadingBlock teks="Menghubungkan ke backend..." />;
  } else if (!urlEfektif) {
    konten = (
      <Konfigurasi
        {...kontenProps(DATA_KOSONG)}
        sekolah={sekolah}
        daftarSekolah={daftarSekolah}
        onGantiSekolah={gantiSekolah}
        onApiUrlChange={gantiUrlManual}
      />
    );
  } else if (!data && (page === 'konfigurasi' || page === 'login')) {
    // Halaman pemulihan: Konfigurasi & Masuk harus tetap bisa dibuka walau
    // backend gagal dimuat — kalau tidak, pengguna terjebak di layar error
    // dan tidak pernah bisa menempel URL backend yang benar.
    konten =
      page === 'login' ? (
        <Login {...kontenProps(DATA_KOSONG)} onAuthChange={onAuthChange} />
      ) : (
        <Konfigurasi
          {...kontenProps(DATA_KOSONG)}
          sekolah={sekolah}
          daftarSekolah={daftarSekolah}
          onGantiSekolah={gantiSekolah}
          onApiUrlChange={gantiUrlManual}
        />
      );
  } else if (!data) {
    konten = (
      <div className="mx-auto max-w-md py-16 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-100">
          <AlertTriangle className="h-7 w-7 text-red-600" />
        </div>
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Gagal memuat data</h2>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{galat}</p>
        <div className="mt-5 flex justify-center gap-2">
          <Button onClick={() => muatData()}>Coba Lagi</Button>
          <Button varian="sekunder" onClick={() => setPage('konfigurasi')}>
            Konfigurasi
          </Button>
        </div>
      </div>
    );
  } else {
    konten = renderHalaman(data);
  }

  const navAktif = aksesDitolak ? 'login' : page;

  return (
    <Layout
      page={navAktif}
      onPindah={pindah}
      sekolah={sekolah}
      daftarSekolah={daftarSekolah}
      onGantiSekolah={gantiSekolah}
      terhubung={terhubung}
      logoUrl={data?.pengaturan.logoUrl}
      namaSekolah={data?.pengaturan.namaSekolah || sekolah?.nama}
      user={user}
      onLogin={() => pindah('login')}
      onLogout={handleLogout}
      modeUjian={modeUjian}
    >
      {konten}
      <Toasts daftar={toasts} onTutup={(id) => setToasts((t) => t.filter((x) => x.id !== id))} />
    </Layout>
  );
}
