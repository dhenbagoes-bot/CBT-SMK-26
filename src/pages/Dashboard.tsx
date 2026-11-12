import { BookOpen, ClipboardList, MonitorPlay, Package, PenLine, Users } from 'lucide-react';
import { Card, EmptyState, PageHeader, StatCard } from '../components/ui';
import { formatTanggalWaktu } from '../utils/format';
import { kelompokPaketPerHari } from '../utils/penilaian';
import type { PageProps } from './PageProps';

export default function Dashboard({ data, user, pindah }: PageProps) {
  const peran = user?.peran;

  if (!user) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader
          judul={data.pengaturan.namaSekolah || 'CBT Madrasah Digital'}
          subjudul="Sistem ujian online MTs Al Islam Ngleses — PH, PTS, PAS, Ujian Madrasah, dan Try Out."
        />
        <Card className="text-center">
          <div className="py-6 text-6xl">🎓</div>
          <p className="font-bold text-slate-900 dark:text-slate-100">Selamat datang di ruang ujian digital</p>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Siswa mengerjakan ujian langsung dari browser. Guru mengelola bank soal &amp; paket,
            memantau sesi, dan melihat rekap hasil.
          </p>
          <button
            onClick={() => pindah('login')}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-violet-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-violet-700"
          >
            Masuk untuk mulai
          </button>
        </Card>
      </div>
    );
  }

  if (peran === 'siswa') {
    const tersedia = data.paket.filter((p) => p.aktif === 1);
    const hasilSaya = data.hasil;
    const sudahDikerjakan = new Set(hasilSaya.map((h) => h.paketId));
    const kelompok = kelompokPaketPerHari(tersedia);
    const hariIni = new Date();
    const tglHariIni = `${hariIni.getFullYear()}-${String(hariIni.getMonth() + 1).padStart(2, '0')}-${String(hariIni.getDate()).padStart(2, '0')}`;
    const grupHariIni = kelompok.find((g) => g.tanggal === tglHariIni);
    const grupLain = kelompok.filter((g) => g.tanggal !== tglHariIni);
    const kartuPaket = (p: (typeof tersedia)[number]) => {
      const sudah = sudahDikerjakan.has(p.id);
      const mapel = data.mapel.find((m) => m.id === p.mapelId)?.nama || '-';
      return (
        <Card key={p.id}>
          <p className="text-xs font-bold uppercase text-violet-600 dark:text-emerald-400">{mapel}</p>
          <h3 className="mt-1 font-bold text-slate-900 dark:text-slate-100">{p.nama}</h3>
          <div className="mt-2 space-y-1 text-xs text-slate-500 dark:text-slate-400">
            <p>⏱ {p.durasiMenit} menit • 📝 {p.jumlahSoal} soal</p>
            <p>Berlaku s.d. {formatTanggalWaktu(p.selesai)}</p>
          </div>
          <button
            onClick={() => (sudah ? pindah('hasil') : pindah('ujian'))}
            className={`mt-3 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white transition ${
              sudah ? 'bg-slate-500 hover:bg-slate-600' : 'bg-violet-600 hover:bg-violet-700'
            }`}
          >
            <PenLine className="h-4 w-4" />
            {sudah ? 'Lihat Hasil' : 'Kerjakan'}
          </button>
        </Card>
      );
    };
    return (
      <div>
        <PageHeader
          judul={`Halo, ${user.nama}`}
          subjudul="Ujian Anda — dikelompokkan per hari, 3–4 mapel per hari."
        />
        {tersedia.length === 0 ? (
          <EmptyState judul="Belum ada ujian tersedia" subjudul="Hubungi guru Anda bila seharusnya ada jadwal ujian." />
        ) : (
          <div className="space-y-6">
            {grupHariIni && (
              <section>
                <h2 className="mb-3 text-base font-bold text-slate-900 dark:text-slate-100">
                  📅 Ujian Hari Ini <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-700 dark:bg-emerald-950">{grupHariIni.paket.length} mapel</span>
                </h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {grupHariIni.paket.map(kartuPaket)}
                </div>
              </section>
            )}
            {grupLain.map((g) => (
              <section key={g.tanggal}>
                <h2 className="mb-3 text-base font-bold text-slate-900 dark:text-slate-100">📅 {g.label}</h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {g.paket.map(kartuPaket)}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    );
  }

  // admin & guru
  const siswa = data.pengguna.filter((p) => p.peran === 'siswa').length;
  const guru = data.pengguna.filter((p) => p.peran === 'guru').length;
  const sesiAktif = data.sesi.filter((s) => s.status === 'AKTIF').length;
  const paketAktif = data.paket.filter((p) => p.aktif === 1).length;
  const menungguEssay = data.hasil.filter((h) => (h.essayBelumDinilai || 0) > 0);
  return (
    <div>
      <PageHeader
        judul={`Dasbor ${peran === 'admin' ? 'Admin' : 'Guru'}`}
        subjudul={data.pengaturan.namaSekolah || 'CBT Madrasah Digital'}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard ikon={<BookOpen className="h-6 w-6" />} label="Bank Soal" nilai={String(data.bankSoal.length)} warna="biru" />
        <StatCard ikon={<Package className="h-6 w-6" />} label="Paket Aktif" nilai={String(paketAktif)} sub={`dari ${data.paket.length} paket`} warna="ungu" />
        <StatCard ikon={<Users className="h-6 w-6" />} label="Siswa" nilai={String(siswa)} sub={`${guru} guru`} warna="hijau" />
        <StatCard ikon={<MonitorPlay className="h-6 w-6" />} label="Sesi Aktif" nilai={String(sesiAktif)} sub="sedang mengerjakan" warna="kuning" />
      </div>

      {menungguEssay.length > 0 && (
        <Card className="mt-4 border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-bold text-amber-800 dark:text-amber-200">
              ✏️ {menungguEssay.length} hasil menunggu penilaian essay — nilainya masih sementara sampai dinilai.
            </p>
            <button
              onClick={() => pindah('hasil')}
              className="rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white hover:bg-amber-700"
            >
              Nilai Sekarang →
            </button>
          </div>
        </Card>
      )}

      <Card className="mt-4">
        <h2 className="mb-3 font-bold text-slate-900 dark:text-slate-100">Paket Ujian Terbaru</h2>
        {data.paket.length === 0 ? (
          <EmptyState judul="Belum ada paket" subjudul="Buat paket ujian di menu Paket Ujian." />
        ) : (
          <div className="space-y-2">
            {data.paket.slice(0, 5).map((p) => (
              <button
                key={p.id}
                onClick={() => pindah('paket')}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3 text-left hover:border-violet-300 hover:bg-violet-50"
              >
                <div className="min-w-0">
                  <p className="truncate font-bold text-slate-900 dark:text-slate-100">{p.nama}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {p.durasiMenit} mnt • {p.jumlahSoal} soal • {p.aktif === 1 ? 'Aktif' : 'Nonaktif'}
                  </p>
                </div>
                <ClipboardList className="h-5 w-5 shrink-0 text-slate-400" />
              </button>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
