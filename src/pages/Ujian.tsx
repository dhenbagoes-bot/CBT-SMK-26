import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Flag, KeyRound, Send } from 'lucide-react';
import {
  Button,
  Card,
  EmptyState,
  LoadingBlock,
  Modal,
  PageHeader,
} from '../components/ui';
import {
  batalkanSesi,
  catatPeringatan,
  getJawabanSesi,
  getSesi,
  mulaiSesi,
  simpanJawaban,
  submitUjian,
  verifikasiToken as verifikasiTokenApi,
} from '../services/api';
import { formatSisaWaktu } from '../utils/ujian';
import { sudahDijawab, kelompokPaketPerHari, uraiJawabanJodoh, uraiKunciPgk } from '../utils/penilaian';
import { formatTanggalWaktu } from '../utils/format';
import { LABEL_JENIS_SOAL, type HasilSubmit, type JawabanKirim, type JenisSoal, type MulaiSesiResponse, type Paket, type SesiAktif, type SoalUjian } from '../types';
import type { PageProps } from './PageProps';

// ============================================================
// Ruang Ujian v1.0.0 — AUTOSAVE SERVER + RESUME:
//  - Alur: Daftar ujian -> masukkan token -> halaman petunjuk -> Mulai.
//  - Jawaban di memori dulu (langsung terasa tersimpan), lalu dikirim ke
//    server secara debounce (~1 detik) + berkala tiap 20 detik + saat
//    pindah soal (aksi simpanJawaban, retry 4x backoff+jitter).
//  - Reload / tutup tab = JEDA, bukan batal: jawaban tersimpan di server,
//    sesi dilanjutkan dari soal terakhir selama waktu ujian masih berjalan.
//    TIDAK ADA lagi beacon pembatalan sesi saat tab ditutup.
//  - Timer dihitung frontend dari waktu selesai server (waktuMulai +
//    durasi di server); soal dimuat SEKALI di awal.
//  - Auto-submit saat waktu habis (jawaban terakhir ikut terkirim).
//  - Jawaban TIDAK PERNAH disimpan di localStorage (server-only).
//  - Kunci jawaban TIDAK PERNAH dikirim ke/ditampilkan di klien.
// ============================================================

type Fase = 'daftar' | 'token' | 'petunjuk' | 'ujian' | 'selesai';

type StatusSimpan = 'idle' | 'menyimpan' | 'tersimpan' | 'gagal';

function parseWaktuServer(w: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec((w || '').trim());
  if (!m) return NaN;
  return new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    Number(m[6] || 0)
  ).getTime();
}

/** Normalisasi soal dari server (backend lama mungkin tak mengirim `jenis`). */
function normalisasiSoalUjian(s: SoalUjian): SoalUjian {
  return {
    ...s,
    jenis: (s.jenis || 'pg') as JenisSoal,
    opsi: s.opsi || [],
    pasanganKiri: s.pasanganKiri || [],
    pasanganKanan: s.pasanganKanan || [],
  };
}

const DEBOUNCE_MS = 1000;
const FLUSH_MS = 20000;

export default function Ujian({
  data,
  user,
  pengaturan,
  toast,
  pindah,
  refreshData,
  onRuangUjianChange,
}: PageProps & { onRuangUjianChange: (aktif: boolean) => void }) {
  const [fase, setFase] = useState<Fase>('daftar');
  const [paketPilih, setPaketPilih] = useState<Paket | null>(null);
  const [tokenInput, setTokenInput] = useState('');
  const [tokenGalat, setTokenGalat] = useState('');
  const [setuju, setSetuju] = useState(false);
  const [mulaiLoading, setMulaiLoading] = useState(false);

  // ---- state ruang ujian (semua di memori; jawaban tersimpan di server) ----
  const [sesi, setSesi] = useState<SesiAktif | null>(null);
  const [soal, setSoal] = useState<SoalUjian[]>([]);
  /** Jawaban serial per soal (lihat JawabanKirim di types.ts). */
  const [jawaban, setJawaban] = useState<Record<string, string>>({});
  const [ragu, setRagu] = useState<Set<string>>(new Set());
  const [idx, setIdx] = useState(0);
  const [sisaDetik, setSisaDetik] = useState(0);
  const [peringatan, setPeringatan] = useState(0);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [konfirmSelesai, setKonfirmSelesai] = useState(false);
  const [hasil, setHasil] = useState<HasilSubmit | null>(null);
  const [tampilSkorPaket, setTampilSkorPaket] = useState(true);
  const [statusSimpan, setStatusSimpan] = useState<StatusSimpan>('idle');

  // flag: sudah submit -> listener anti-curang berhenti
  const sudahSubmitRef = useRef(false);
  const sesiRef = useRef<SesiAktif | null>(null);
  const deadlineRef = useRef(0);
  const peringatanTerkirimRef = useRef(0); // debounce visibilitychange

  // ---- autosave ----
  const jawabanRef = useRef<Record<string, string>>({});
  const kotorRef = useRef(false); // ada jawaban belum terkirim
  const simpanTimerRef = useRef<number | null>(null);
  const sedangSimpanRef = useRef(false);

  const ambang = pengaturan.ambangPeringatan || 3;
  const wajibFs = pengaturan.wajibFullscreen === 1;

  useEffect(() => {
    sesiRef.current = sesi;
  }, [sesi]);
  useEffect(() => {
    jawabanRef.current = jawaban;
  }, [jawaban]);

  useEffect(() => {
    onRuangUjianChange(fase === 'ujian' || fase === 'petunjuk' || fase === 'token');
  }, [fase, onRuangUjianChange]);

  /** Kirim seluruh jawaban saat ini ke server (batch). Dipakai debounce/berkala/pindah soal. */
  const flushJawaban = useCallback(async () => {
    const s = sesiRef.current;
    if (!s || sudahSubmitRef.current || sedangSimpanRef.current) return;
    if (!kotorRef.current && statusSimpan !== 'gagal') return;
    sedangSimpanRef.current = true;
    setStatusSimpan('menyimpan');
    try {
      const arr: JawabanKirim[] = Object.entries(jawabanRef.current)
        .filter(([, v]) => (v || '').trim() !== '')
        .map(([soalId, jawaban]) => ({ soalId, jawaban }));
      await simpanJawaban(s.id, arr);
      kotorRef.current = false;
      setStatusSimpan('tersimpan');
    } catch {
      // api() sudah retry 4x backoff+jitter; tetap gagal -> tandai, coba lagi berkala.
      kotorRef.current = true;
      setStatusSimpan('gagal');
    } finally {
      sedangSimpanRef.current = false;
    }
  }, [statusSimpan]);

  const flushRef = useRef(flushJawaban);
  flushRef.current = flushJawaban;

  /** Jadwalkan autosave debounce setelah jawaban berubah. */
  const jadwalkanSimpan = useCallback(() => {
    kotorRef.current = true;
    setStatusSimpan('menyimpan');
    if (simpanTimerRef.current) window.clearTimeout(simpanTimerRef.current);
    simpanTimerRef.current = window.setTimeout(() => {
      flushRef.current();
    }, DEBOUNCE_MS);
  }, []);

  // Flush berkala tiap 20 detik selama ujian.
  useEffect(() => {
    if (fase !== 'ujian') return;
    const id = window.setInterval(() => {
      if (kotorRef.current) flushRef.current();
    }, FLUSH_MS);
    return () => window.clearInterval(id);
  }, [fase]);

  // Bersihkan timer debounce saat keluar dari ruang ujian.
  useEffect(() => {
    if (fase !== 'ujian' && simpanTimerRef.current) {
      window.clearTimeout(simpanTimerRef.current);
      simpanTimerRef.current = null;
    }
  }, [fase]);

  const keluarRuangUjian = useCallback(
    (pesan: string, tipe: 'info' | 'error' = 'info') => {
      sudahSubmitRef.current = false;
      kotorRef.current = false;
      setStatusSimpan('idle');
      setFase('daftar');
      setSesi(null);
      setSoal([]);
      setJawaban({});
      setRagu(new Set());
      setIdx(0);
      setPaketPilih(null);
      setTokenInput('');
      setTokenGalat('');
      setSetuju(false);
      setHasil(null);
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => undefined);
      }
      toast(pesan, tipe);
      refreshData();
    },
    [toast, refreshData]
  );

  const doSubmit = useCallback(
    async (otomatis: boolean) => {
      const s = sesiRef.current;
      if (!s || sudahSubmitRef.current || (!otomatis && submitLoading)) return;
      // Kirim autosave terakhir dulu agar jawaban terbaru ikut tersubmit.
      try {
        await flushRef.current();
      } catch {
        /* lanjut submit apa adanya */
      }
      setSubmitLoading(true);
      try {
        const arr = Object.entries(jawabanRef.current)
          .filter(([, v]) => (v || '').trim() !== '')
          .map(([soalId, jawaban]) => ({ soalId, jawaban }));
        const r = await submitUjian(s.id, arr);
        sudahSubmitRef.current = true;
        kotorRef.current = false;
        setStatusSimpan('tersimpan');
        setHasil(r.hasil);
        setFase('selesai');
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => undefined);
        }
        toast(otomatis ? 'Waktu habis — jawaban tersubmit otomatis.' : 'Jawaban tersubmit.', 'sukses');
        refreshData();
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Gagal mengirim jawaban.', 'error');
      } finally {
        setSubmitLoading(false);
      }
    },
    [toast, refreshData, submitLoading]
  );

  const doSubmitRef = useRef(doSubmit);
  doSubmitRef.current = doSubmit;

  // ---- timer: deadline = timestamp server `waktuSelesai` (absolut) ----
  // Sama dengan waktuMulai + durasi di server; sesi yang dilanjutkan
  // (getSesi) memakai sisa waktu aslinya, bukan durasi penuh lagi.
  useEffect(() => {
    if (fase !== 'ujian' || !sesi) return;
    const selesai = parseWaktuServer(sesi.waktuSelesai);
    deadlineRef.current = Number.isFinite(selesai) ? selesai : Date.now();
    const id = setInterval(() => {
      const sisa = Math.max(0, Math.round((deadlineRef.current - Date.now()) / 1000));
      setSisaDetik(sisa);
      if (sisa <= 0) {
        clearInterval(id);
        doSubmitRef.current(true);
      }
    }, 1000);
    setSisaDetik(Math.max(0, Math.round((deadlineRef.current - Date.now()) / 1000)));
    return () => clearInterval(id);
  }, [fase, sesi]);

  // ---- anti-curang: listeners (TANPA pembatalan saat tab ditutup) ----
  // Reload/tutup tab = JEDA: jawaban sudah di-autosave ke server, sesi
  // bisa dilanjutkan selama waktu ujian masih berjalan. Tidak ada
  // pagehide/beforeunload beacon pembatalan sesi di sini.
  useEffect(() => {
    if (fase !== 'ujian') return;

    const onVisibility = () => {
      const s = sesiRef.current;
      if (!s || sudahSubmitRef.current || !document.hidden) return;
      const now = Date.now();
      if (now - peringatanTerkirimRef.current < 5000) return;
      peringatanTerkirimRef.current = now;
      catatPeringatan(s.id, 'tab-tidak-aktif')
        .then((r) => {
          setPeringatan(r.peringatan);
          if (r.dibatalkan) {
            sudahSubmitRef.current = true;
            keluarRuangUjian(
              'Sesi dibatalkan: Anda berpindah tab/aplikasi melebihi batas peringatan.',
              'error'
            );
          } else {
            toast(`Peringatan ${r.peringatan}/${ambang}: jangan berpindah tab/aplikasi!`, 'error');
          }
        })
        .catch(() => undefined);
    };
    const onContext = (e: MouseEvent) => e.preventDefault();
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && ['c', 'u', 'p', 's'].includes(k)) {
        e.preventDefault();
        toast('Shortcut dinonaktifkan selama ujian.', 'error');
      }
    };
    const onFullscreen = () => {
      const s = sesiRef.current;
      if (!s || sudahSubmitRef.current || !wajibFs) return;
      if (!document.fullscreenElement) {
        catatPeringatan(s.id, 'keluar-fullscreen')
          .then((r) => {
            setPeringatan(r.peringatan);
            if (r.dibatalkan) {
              sudahSubmitRef.current = true;
              keluarRuangUjian('Sesi dibatalkan: keluar mode fullscreen melebihi batas.', 'error');
            } else {
              toast(
                `Peringatan ${r.peringatan}/${ambang}: kembali ke mode fullscreen!`,
                'error'
              );
              document.documentElement.requestFullscreen().catch(() => undefined);
            }
          })
          .catch(() => undefined);
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('contextmenu', onContext);
    document.addEventListener('keydown', onKey);
    document.addEventListener('fullscreenchange', onFullscreen);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('contextmenu', onContext);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('fullscreenchange', onFullscreen);
    };
  }, [fase, ambang, wajibFs, toast, keluarRuangUjian]);

  // ---- aksi ----

  const mulaiDariPaket = (p: Paket) => {
    const sesiAktif = data.sesi.find((s) => s.paketId === p.id && s.status === 'AKTIF');
    if (sesiAktif) {
      lanjutkanSesi(sesiAktif.id, p);
      return;
    }
    setPaketPilih(p);
    setTokenInput('');
    setTokenGalat('');
    setSetuju(false);
    setFase('token');
  };

  /** Resume sesi AKTIF yang sudah ada (token sudah tervalidasi sebelumnya). */
  const lanjutkanSesi = async (sesiId: string, p: Paket) => {
    setMulaiLoading(true);
    try {
      const r: MulaiSesiResponse = await getSesi(sesiId);
      await masukRuangUjian(p, r, true);
      toast('Sesi dilanjutkan — jawaban tersimpan dimuat kembali.', 'sukses');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal melanjutkan sesi.', 'error');
      refreshData();
    } finally {
      setMulaiLoading(false);
    }
  };

  /** Token benar -> halaman petunjuk (BELUM membuat sesi: timer baru
   *  berjalan saat tombol "Mulai Ujian" ditekan — verifikasiToken hanya
   *  mengecek token + kelayakan paket, tanpa membuat sesi). */
  const verifikasiToken = async () => {
    if (!paketPilih) return;
    if (!tokenInput.trim()) {
      setTokenGalat('Masukkan token ujian yang dibagikan guru Anda.');
      return;
    }
    setMulaiLoading(true);
    setTokenGalat('');
    try {
      await verifikasiTokenApi(paketPilih.id, tokenInput.trim().toUpperCase());
      setSoal([]);
      setJawaban({});
      jawabanRef.current = {};
      setSesi(null);
      setSetuju(false);
      setFase('petunjuk');
    } catch (err) {
      // Token salah / paket tak layak: pesan backend ditampilkan jelas, tidak lanjut.
      setTokenGalat(err instanceof Error ? err.message : 'Token salah. Periksa kembali token ujian Anda.');
    } finally {
      setMulaiLoading(false);
    }
  };

  const masukRuangUjian = async (p: Paket, r: MulaiSesiResponse, lanjutan: boolean) => {
    sudahSubmitRef.current = false;
    const soalNormal = r.soal.map(normalisasiSoalUjian);
    setSesi(r.sesi);
    setSoal(soalNormal);
    // Muat jawaban tersimpan: dari respons mulaiSesi/getSesi (field
    // backend: `jawaban`), atau getJawabanSesi bila kosong.
    let tersimpan: JawabanKirim[] = r.jawaban || r.jawabanTersimpan || [];
    if (tersimpan.length === 0) {
      try {
        const gj = await getJawabanSesi(r.sesi.id);
        tersimpan = gj.jawaban || [];
      } catch {
        // Backend lama belum punya getJawabanSesi -> lanjut dari kosong.
        tersimpan = [];
      }
    }
    const peta: Record<string, string> = {};
    for (const j of tersimpan) peta[j.soalId] = j.jawaban;
    setJawaban(peta);
    jawabanRef.current = peta;
    kotorRef.current = false;
    setStatusSimpan(tersimpan.length > 0 ? 'tersimpan' : 'idle');
    // Lanjutkan dari soal terakhir yang belum dijawab (atau soal pertama).
    const idxLanjut = soalNormal.findIndex((s) => !sudahDijawab(s.jenis, peta[s.id]));
    setIdx(idxLanjut >= 0 ? idxLanjut : 0);
    setRagu(new Set());
    setPeringatan(r.sesi.peringatan || 0);
    setTampilSkorPaket(p.tampilSkor === 1);
    setFase('petunjuk');
    if (lanjutan) {
      /* tetap di petunjuk agar siswa melihat sisa waktu & progres */
    }
  };

  /** Tombol "Mulai Ujian" di halaman petunjuk: di sinilah sesi dibuat
   *  (mulaiSesi) dan timer mulai berjalan. */
  const mulaiMengerjakan = async () => {
    if (!setuju || !paketPilih) return;
    // Sesi sudah ada (lanjutan/resume) -> langsung masuk ruang ujian.
    if (sesi) {
      setFase('ujian');
      if (wajibFs) {
        document.documentElement.requestFullscreen().catch(() => {
          toast('Aktifkan mode fullscreen manual bila diminta browser.', 'info');
        });
      }
      return;
    }
    setMulaiLoading(true);
    try {
      const r = await mulaiSesi(paketPilih.id, tokenInput.trim().toUpperCase());
      await masukRuangUjian(paketPilih, r, false);
      setFase('ujian');
      if (wajibFs) {
        document.documentElement.requestFullscreen().catch(() => {
          toast('Aktifkan mode fullscreen manual bila diminta browser.', 'info');
        });
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal memulai sesi ujian.', 'error');
    } finally {
      setMulaiLoading(false);
    }
  };

  const batalkanManual = async () => {
    const s = sesiRef.current;
    if (!s) return;
    try {
      await batalkanSesi(s.id, 'dibatalkan-peserta');
    } catch {
      /* abaikan */
    }
    sudahSubmitRef.current = true;
    keluarRuangUjian('Sesi dibatalkan atas permintaan Anda.', 'info');
  };

  const ubahJawaban = (soalId: string, nilai: string) => {
    setJawaban((j) => ({ ...j, [soalId]: nilai }));
    jawabanRef.current = { ...jawabanRef.current, [soalId]: nilai };
    jadwalkanSimpan();
  };

  const togglePgk = (soalId: string, kode: string) => {
    const sekarang = uraiKunciPgk(jawabanRef.current[soalId] || '');
    if (sekarang.has(kode)) sekarang.delete(kode);
    else sekarang.add(kode);
    ubahJawaban(soalId, [...sekarang].sort().join(','));
  };

  const ubahJodoh = (soalId: string, kiriIdx: number, kananIdx: number) => {
    const peta = uraiJawabanJodoh(jawabanRef.current[soalId] || '');
    peta.set(kiriIdx, kananIdx);
    const obj: Record<number, number> = {};
    for (const [k, v] of peta) obj[k] = v;
    ubahJawaban(soalId, JSON.stringify(obj));
  };

  const pindahSoal = (baru: number) => {
    // Autosave saat pindah soal (flush segera, tanpa menunggu debounce).
    if (kotorRef.current) flushRef.current();
    setIdx(baru);
  };

  const toggleRagu = (soalId: string) => {
    setRagu((r) => {
      const n = new Set(r);
      if (n.has(soalId)) n.delete(soalId);
      else n.add(soalId);
      return n;
    });
  };

  // ================= render =================

  if (fase === 'daftar') {
    const tersedia = data.paket.filter((p) => p.aktif === 1);
    const kelompok = kelompokPaketPerHari(tersedia);
    const hariIni = new Date();
    const tglHariIni = `${hariIni.getFullYear()}-${String(hariIni.getMonth() + 1).padStart(2, '0')}-${String(hariIni.getDate()).padStart(2, '0')}`;
    const grupHariIni = kelompok.find((g) => g.tanggal === tglHariIni);
    const grupLain = kelompok.filter((g) => g.tanggal !== tglHariIni);

    const kartuPaket = (p: Paket) => {
      const sesiAktif = data.sesi.find((s) => s.paketId === p.id && s.status === 'AKTIF');
      const sesiSelesai = data.sesi.find((s) => s.paketId === p.id && s.status === 'SELESAI');
      const mapel = data.mapel.find((m) => m.id === p.mapelId)?.nama || '-';
      return (
        <Card key={p.id}>
          <p className="text-xs font-bold uppercase text-violet-600 dark:text-emerald-400">{mapel}</p>
          <h3 className="mt-1 font-bold text-slate-900 dark:text-slate-100">{p.nama}</h3>
          <div className="mt-2 space-y-1 text-xs text-slate-500 dark:text-slate-400">
            <p>⏱ {p.durasiMenit} menit • 📝 {p.jumlahSoal} soal • 🔑 Token</p>
            <p>Berakhir: {formatTanggalWaktu(p.selesai)}</p>
          </div>
          {sesiAktif ? (
            <Button varian="kuning" className="mt-3 w-full" onClick={() => mulaiDariPaket(p)} loading={mulaiLoading}>
              Lanjutkan Sesi
            </Button>
          ) : sesiSelesai ? (
            <Button varian="sekunder" className="mt-3 w-full" onClick={() => pindah('hasil')}>
              Lihat Hasil
            </Button>
          ) : (
            <Button className="mt-3 w-full" onClick={() => mulaiDariPaket(p)}>
              Kerjakan
            </Button>
          )}
        </Card>
      );
    };

    return (
      <div>
        <PageHeader judul="Ujian" subjudul="Pilih ujian — masukkan token, baca petunjuk, lalu mulai." />
        {mulaiLoading && <LoadingBlock teks="Menyiapkan sesi ujian..." />}
        {tersedia.length === 0 ? (
          <EmptyState judul="Belum ada ujian tersedia" subjudul="Hubungi guru Anda." />
        ) : (
          <div className="space-y-6">
            {grupHariIni && (
              <section>
                <h2 className="mb-3 flex items-center gap-2 text-base font-bold text-slate-900 dark:text-slate-100">
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

  if (fase === 'token' && paketPilih) {
    const p = paketPilih;
    const mapel = data.mapel.find((m) => m.id === p.mapelId)?.nama || '-';
    return (
      <div className="mx-auto max-w-md">
        <PageHeader judul="Token Ujian" subjudul="Masukkan token yang dibagikan guru Anda." />
        <Card>
          <p className="text-xs font-bold uppercase text-violet-600 dark:text-emerald-400">{mapel}</p>
          <h2 className="mt-1 text-lg font-bold text-slate-900 dark:text-slate-100">{p.nama}</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {p.durasiMenit} menit • {p.jumlahSoal} soal • {formatTanggalWaktu(p.mulai)} s.d. {formatTanggalWaktu(p.selesai)}
          </p>
          <form
            className="mt-4 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              verifikasiToken();
            }}
          >
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
                <KeyRound className="h-4 w-4" /> Token ujian
              </label>
              <input
                value={tokenInput}
                onChange={(e) => {
                  setTokenInput(e.target.value.toUpperCase().replace(/\s/g, ''));
                  setTokenGalat('');
                }}
                placeholder="cth: K7X2PQ"
                autoFocus
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-center font-mono-num text-lg font-bold tracking-[0.3em] text-slate-900 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
            {tokenGalat && (
              <div className="flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:bg-red-950 dark:text-red-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{tokenGalat}</span>
              </div>
            )}
            <div className="flex gap-2">
              <Button varian="sekunder" onClick={() => setFase('daftar')} className="flex-1">
                Kembali
              </Button>
              <Button type="submit" loading={mulaiLoading} className="flex-1">
                Verifikasi Token
              </Button>
            </div>
          </form>
          <p className="mt-3 text-center text-xs text-slate-400">
            Token berbeda untuk tiap ujian/mapel. Tanyakan ke guru bila Anda belum menerima token.
          </p>
        </Card>
      </div>
    );
  }

  // Petunjuk: sesi boleh null (mulai baru — sesi dibuat saat tombol
  // "Mulai Ujian" ditekan) atau terisi (lanjutan/resume).
  if (fase === 'petunjuk' && paketPilih) {
    const p = paketPilih;
    const mapel = data.mapel.find((m) => m.id === p.mapelId)?.nama || '-';
    const jumlahSoalTampil = soal.length > 0 ? soal.length : p.jumlahSoal;
    const hitungJenis = new Map<JenisSoal, number>();
    for (const s of soal) hitungJenis.set(s.jenis, (hitungJenis.get(s.jenis) || 0) + 1);
    const terjawab = Object.entries(jawaban).filter(([id, v]) => {
      const s = soal.find((x) => x.id === id);
      return s ? sudahDijawab(s.jenis, v) : false;
    }).length;
    const lanjutan = terjawab > 0;
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader judul="Petunjuk Ujian" subjudul="Baca dengan saksama sebelum menekan Mulai." />
        <Card className="mb-4">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">{p.nama}</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">{mapel}</p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
              <p className="text-xs text-slate-400">Nama peserta</p>
              <p className="font-bold text-slate-900 dark:text-slate-100">{user?.nama}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
              <p className="text-xs text-slate-400">NIS / Username</p>
              <p className="font-bold text-slate-900 dark:text-slate-100">{user?.nis || user?.username}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
              <p className="text-xs text-slate-400">Jumlah soal</p>
              <p className="font-bold text-slate-900 dark:text-slate-100">{jumlahSoalTampil} soal</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
              <p className="text-xs text-slate-400">Durasi</p>
              <p className="font-bold text-slate-900 dark:text-slate-100">{p.durasiMenit} menit</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {([...hitungJenis.entries()] as [JenisSoal, number][]).map(([j, n]) => (
              <span key={j} className="rounded-full bg-violet-100 px-3 py-1 text-xs font-bold text-violet-700 dark:bg-violet-950 dark:text-violet-200">
                {LABEL_JENIS_SOAL[j]}: {n}
              </span>
            ))}
          </div>
          {lanjutan && (
            <p className="mt-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
              ✓ Sesi lanjutan: {terjawab} dari {soal.length} soal sudah terjawab tersimpan — Anda melanjutkan dari soal terakhir.
            </p>
          )}
          {!sesi && (
            <p className="mt-3 rounded-xl bg-blue-50 px-4 py-3 text-sm font-medium text-blue-800 dark:bg-blue-950 dark:text-blue-200">
              Token terverifikasi ✓ — timer mulai berjalan saat Anda menekan "Mulai Ujian" di bawah.
            </p>
          )}
        </Card>
        <Card className="mb-4">
          <h3 className="mb-2 font-bold text-slate-900 dark:text-slate-100">📋 Tata Tertib &amp; Petunjuk</h3>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-600 dark:text-slate-300">
            <li>Kerjakan dengan jujur. Timer mulai berjalan saat Anda menekan tombol Mulai Ujian (bukan saat memasukkan token).</li>
            <li>Jawaban tersimpan otomatis ke server — bila halaman dimuat ulang atau koneksi sempat putus, jawaban tidak hilang dan ujian bisa dilanjutkan selama waktu masih berjalan.</li>
            <li>Dilarang berpindah tab, membuka aplikasi lain, atau menyalin soal (klik kanan &amp; shortcut salin dinonaktifkan).</li>
            <li>
              Setiap pelanggaran tercatat sebagai peringatan. Bila mencapai {ambang} peringatan, sesi
              <b> otomatis dibatalkan</b>.
            </li>
            <li>Tekan tombol <b>Selesaikan</b> bila sudah selesai; ujian berakhir otomatis saat waktu habis dan jawaban terakhir ikut terkirim.</li>
            <li>Soal essay dinilai manual oleh guru — nilainya tampil "Menunggu penilaian" sampai dinilai.</li>
          </ul>
          <label className="mt-4 flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
            <input
              type="checkbox"
              checked={setuju}
              onChange={(e) => setSetuju(e.target.checked)}
              className="mt-1 h-4 w-4 accent-violet-600"
            />
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Saya telah membaca petunjuk dan siap mengerjakan ujian dengan jujur.
            </span>
          </label>
        </Card>
        <div className="flex gap-2">
          <Button varian="sekunder" onClick={() => keluarRuangUjian('Kembali ke daftar ujian.', 'info')} className="flex-1">
            Kembali
          </Button>
          <Button onClick={mulaiMengerjakan} disabled={!setuju} loading={mulaiLoading} className="flex-1">
            {lanjutan ? 'Lanjutkan Mengerjakan' : 'Mulai Ujian'}
          </Button>
        </div>
      </div>
    );
  }

  if (fase === 'selesai' && hasil) {
    const menungguPenilaian = (hasil.essayBelumDinilai || 0) > 0 || hasil.nilaiFinal === false;
    return (
      <div className="mx-auto max-w-md text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950">
          <CheckCircle2 className="h-9 w-9 text-emerald-600" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Jawaban Terkirim</h2>
        {menungguPenilaian && (
          <p className="mx-auto mt-3 max-w-sm rounded-xl bg-amber-100 px-4 py-2.5 text-sm font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-200">
            Menunggu penilaian — ada jawaban essay yang belum dinilai guru, nilai di bawah masih sementara.
          </p>
        )}
        {tampilSkorPaket ? (
          <div className="mx-auto mt-4 max-w-sm rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
            <p className="text-xs uppercase text-slate-400">Nilai Anda</p>
            <p className="font-mono-num text-5xl font-bold text-violet-700 dark:text-emerald-400">{hasil.nilai}</p>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-lg bg-emerald-50 p-2 dark:bg-emerald-950">
                <p className="font-bold text-emerald-700">{hasil.benar}</p>
                <p className="text-slate-500">Benar</p>
              </div>
              <div className="rounded-lg bg-red-50 p-2 dark:bg-red-950">
                <p className="font-bold text-red-700">{hasil.salah}</p>
                <p className="text-slate-500">Salah</p>
              </div>
              <div className="rounded-lg bg-slate-100 p-2 dark:bg-slate-800">
                <p className="font-bold text-slate-700 dark:text-slate-200">{hasil.kosong}</p>
                <p className="text-slate-500">Kosong</p>
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-400">
              Skor {hasil.skor} dari {hasil.totalBobot} • {formatTanggalWaktu(hasil.waktuSubmit)}
            </p>
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
            Jawaban Anda sudah tersimpan. Nilai akan diumumkan oleh guru.
          </p>
        )}
        <Button onClick={() => pindah('hasil')} className="mt-5">
          Lihat Hasil Saya
        </Button>
      </div>
    );
  }

  // ---- fase 'ujian': ruang ujian ----
  const aktif = soal[idx];
  const terjawab = soal.filter((s) => sudahDijawab(s.jenis, jawaban[s.id])).length;
  const raguCount = ragu.size;
  const belum = soal.length - terjawab;
  const bahaya = sisaDetik <= 300;

  const statusSimpanTeks =
    statusSimpan === 'menyimpan'
      ? 'Menyimpan…'
      : statusSimpan === 'tersimpan'
        ? 'Tersimpan ✓'
        : statusSimpan === 'gagal'
          ? 'Tidak tersimpan — akan dicoba lagi'
          : '';

  return (
    <div className="ruang-ujian mx-auto max-w-4xl">
      {/* bar status */}
      <div className="sticky top-[68px] z-30 -mx-3 mb-4 bg-slate-100/95 px-3 py-2 backdrop-blur dark:bg-slate-950/95 sm:mx-0 sm:rounded-2xl sm:px-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className={`flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-bold ${bahaya ? 'bg-red-600 text-white' : 'bg-violet-600 text-white'}`}>
            <Clock className="h-4 w-4" />
            <span className="font-mono-num">{formatSisaWaktu(sisaDetik)}</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            {statusSimpanTeks && (
              <span
                className={`rounded-full px-2.5 py-1 font-semibold ${
                  statusSimpan === 'gagal'
                    ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
                    : statusSimpan === 'menyimpan'
                      ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                      : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                }`}
              >
                {statusSimpanTeks}
              </span>
            )}
            {peringatan > 0 && (
              <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 font-bold text-amber-700 dark:bg-amber-950">
                <AlertTriangle className="h-3.5 w-3.5" /> Peringatan {peringatan}/{ambang}
              </span>
            )}
            <span className="rounded-full bg-slate-200 px-2.5 py-1 font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              Terjawab {terjawab}/{soal.length}
            </span>
            <Button varian="bahaya" kecil onClick={batalkanManual}>
              Batalkan
            </Button>
          </div>
        </div>
      </div>

      {aktif && (
        <Card className="mb-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-bold text-violet-700 dark:text-emerald-400">
              Soal {idx + 1} dari {soal.length} • {LABEL_JENIS_SOAL[aktif.jenis]}
            </p>
            <button
              onClick={() => toggleRagu(aktif.id)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition ${
                ragu.has(aktif.id) ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              <Flag className="h-3.5 w-3.5" /> {ragu.has(aktif.id) ? 'Ragu-ragu ✓' : 'Tandai ragu-ragu'}
            </button>
          </div>
          {aktif.gambarUrl && (
            <img src={aktif.gambarUrl} alt="Gambar soal" className="mb-3 max-h-64 rounded-xl border" />
          )}
          <p className="whitespace-pre-wrap text-base font-medium leading-relaxed text-slate-900 dark:text-slate-100">{aktif.teks}</p>

          <div className="mt-4">
            <JawabanSoal soal={aktif} nilai={jawaban[aktif.id] || ''} onUbah={(v) => ubahJawaban(aktif.id, v)} onTogglePgk={(k) => togglePgk(aktif.id, k)} onUbahJodoh={(ki, ka) => ubahJodoh(aktif.id, ki, ka)} />
          </div>

          <div className="mt-5 flex justify-between gap-2">
            <Button varian="sekunder" onClick={() => pindahSoal(Math.max(0, idx - 1))} disabled={idx === 0}>
              ← Sebelumnya
            </Button>
            {idx < soal.length - 1 ? (
              <Button onClick={() => pindahSoal(Math.min(soal.length - 1, idx + 1))}>
                Berikutnya →
              </Button>
            ) : (
              <Button varian="hijau" onClick={() => setKonfirmSelesai(true)}>
                <Send className="h-4 w-4" /> Selesaikan
              </Button>
            )}
          </div>
        </Card>
      )}

      {/* grid nomor soal */}
      <Card>
        <p className="mb-2 text-sm font-bold text-slate-700 dark:text-slate-200">Navigasi Soal</p>
        <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
          {soal.map((s, i) => {
            const ada = sudahDijawab(s.jenis, jawaban[s.id]);
            const rg = ragu.has(s.id);
            return (
              <button
                key={s.id}
                onClick={() => pindahSoal(i)}
                className={`flex h-10 items-center justify-center rounded-lg text-sm font-bold transition ${
                  i === idx
                    ? 'ring-2 ring-violet-600 ring-offset-2 ' + (ada ? 'bg-emerald-500 text-white' : rg ? 'bg-amber-400 text-white' : 'bg-slate-700 text-white')
                    : ada
                      ? 'bg-emerald-500 text-white'
                      : rg
                        ? 'bg-amber-400 text-white'
                        : 'bg-slate-200 text-slate-600 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                {i + 1}
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500 dark:text-slate-400">
          <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-emerald-500" /> Terjawab</span>
          <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-amber-400" /> Ragu-ragu</span>
          <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-slate-200 dark:bg-slate-700" /> Belum dijawab</span>
        </div>
        <Button varian="hijau" className="mt-4 w-full" onClick={() => setKonfirmSelesai(true)}>
          <Send className="h-4 w-4" /> Selesaikan Ujian
        </Button>
      </Card>

      {konfirmSelesai && (
        <Modal judul="Selesaikan ujian?" onTutup={() => setKonfirmSelesai(false)} lebar="max-w-sm">
          <div className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
            <p>Terjawab: <b className="text-emerald-600">{terjawab}</b></p>
            <p>Ragu-ragu: <b className="text-amber-600">{raguCount}</b></p>
            <p>Belum dijawab: <b className={belum > 0 ? 'text-red-600' : 'text-slate-600'}>{belum}</b></p>
            {belum > 0 && <p className="text-xs text-slate-400">Soal yang belum dijawab dihitung kosong.</p>}
            {statusSimpan === 'gagal' && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700 dark:bg-red-950">
                ⚠ Sebagian jawaban belum tersimpan ke server (koneksi bermasalah). Tetap kirim — jawaban di perangkat ini akan ikut terkirim sekarang.
              </p>
            )}
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Button varian="sekunder" onClick={() => setKonfirmSelesai(false)}>Periksa Lagi</Button>
            <Button
              varian="hijau"
              loading={submitLoading}
              onClick={() => {
                setKonfirmSelesai(false);
                doSubmitRef.current(false);
              }}
            >
              Ya, Kirim Jawaban
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/** Renderer jawaban per jenis soal. `nilai` = string serial (lihat JawabanKirim). */
function JawabanSoal({
  soal,
  nilai,
  onUbah,
  onTogglePgk,
  onUbahJodoh,
}: {
  soal: SoalUjian;
  nilai: string;
  onUbah: (v: string) => void;
  onTogglePgk: (kode: string) => void;
  onUbahJodoh: (kiriIdx: number, kananIdx: number) => void;
}) {
  if (soal.jenis === 'pg') {
    return (
      <div className="space-y-2">
        {soal.opsi.map((o) => {
          const dipilih = nilai === o.kode;
          return (
            <button
              key={o.kode}
              onClick={() => onUbah(o.kode)}
              className={`flex w-full items-start gap-3 rounded-xl border-2 px-4 py-3 text-left transition ${
                dipilih
                  ? 'border-violet-600 bg-violet-50 dark:bg-violet-950'
                  : 'border-slate-200 bg-white hover:border-violet-300 dark:border-slate-700 dark:bg-slate-900'
              }`}
            >
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                  dipilih ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                {String.fromCharCode(65 + soal.opsi.indexOf(o))}
              </span>
              <span className="text-sm text-slate-800 dark:text-slate-200">{o.teks}</span>
            </button>
          );
        })}
      </div>
    );
  }

  if (soal.jenis === 'pgk') {
    const dipilihSet = uraiKunciPgk(nilai);
    return (
      <div className="space-y-2">
        <p className="text-xs text-slate-400">Boleh memilih lebih dari satu jawaban.</p>
        {soal.opsi.map((o) => {
          const dipilih = dipilihSet.has(o.kode);
          return (
            <button
              key={o.kode}
              onClick={() => onTogglePgk(o.kode)}
              className={`flex w-full items-start gap-3 rounded-xl border-2 px-4 py-3 text-left transition ${
                dipilih
                  ? 'border-violet-600 bg-violet-50 dark:bg-violet-950'
                  : 'border-slate-200 bg-white hover:border-violet-300 dark:border-slate-700 dark:bg-slate-900'
              }`}
            >
              <span
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 text-xs font-bold ${
                  dipilih ? 'border-violet-600 bg-violet-600 text-white' : 'border-slate-300 dark:border-slate-600'
                }`}
              >
                {dipilih ? '✓' : ''}
              </span>
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {String.fromCharCode(65 + soal.opsi.indexOf(o))}
              </span>
              <span className="text-sm text-slate-800 dark:text-slate-200">{o.teks}</span>
            </button>
          );
        })}
      </div>
    );
  }

  if (soal.jenis === 'bs') {
    return (
      <div className="flex gap-3">
        {(['Benar', 'Salah'] as const).map((b) => {
          const dipilih = nilai === b;
          return (
            <button
              key={b}
              onClick={() => onUbah(b)}
              className={`flex-1 rounded-xl border-2 px-4 py-4 text-base font-bold transition ${
                dipilih
                  ? b === 'Benar'
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-700 dark:bg-emerald-950'
                    : 'border-red-600 bg-red-50 text-red-700 dark:bg-red-950'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
              }`}
            >
              {b === 'Benar' ? '✓ Benar' : '✗ Salah'}
            </button>
          );
        })}
      </div>
    );
  }

  if (soal.jenis === 'jodoh') {
    const peta = uraiJawabanJodoh(nilai);
    const kiri = soal.pasanganKiri || [];
    const kanan = soal.pasanganKanan || [];
    return (
      <div className="space-y-2">
        <p className="text-xs text-slate-400">Pilih pasangan yang tepat untuk tiap baris kiri.</p>
        {kiri.map((k, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
              {i + 1}. {k}
            </span>
            <span className="text-slate-400">→</span>
            <select
              value={peta.has(i) ? String(peta.get(i)) : ''}
              onChange={(e) => onUbahJodoh(i, Number(e.target.value))}
              className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-violet-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="">— pilih pasangan —</option>
              {kanan.map((kan, j) => (
                <option key={j} value={j}>
                  {String.fromCharCode(65 + j)}. {kan}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
    );
  }

  if (soal.jenis === 'isian') {
    return (
      <input
        value={nilai}
        onChange={(e) => onUbah(e.target.value)}
        placeholder="Tulis jawaban singkat Anda di sini…"
        className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm text-slate-900 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
      />
    );
  }

  // essay
  return (
    <div>
      <textarea
        value={nilai}
        onChange={(e) => onUbah(e.target.value)}
        rows={6}
        placeholder="Tulis jawaban uraian Anda di sini… (dinilai manual oleh guru)"
        className="w-full resize-y rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm text-slate-900 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
      />
      <p className="mt-1 text-xs text-slate-400">Jawaban tersimpan otomatis; dinilai manual oleh guru.</p>
    </div>
  );
}
