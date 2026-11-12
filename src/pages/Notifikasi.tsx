import { useEffect, useMemo, useState } from 'react';
import { BellRing, History, Save, Send, Settings2 } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  LoadingBlock,
  PageHeader,
  SelectInput,
  TabelResponsif,
  TextInput,
  tdCls,
  thCls,
} from '../components/ui';
import {
  getNotifikasi,
  kirimNotifikasiProgres,
  savePengaturan,
} from '../services/api';
import { formatTanggalWaktu } from '../utils/format';
import type { HasilKirimNotifikasi, NotifikasiLog, Pengaturan } from '../types';
import type { PageProps } from './PageProps';

const PLACEHOLDER =
  '{nama} {rata2} {jmlUjian} {mapelLemah} {sekolah} {tanggal}';

type ModeTarget = 'semua' | 'kelas' | 'manual';

export default function Notifikasi({ data, pengaturan, toast, refreshData }: PageProps) {
  // ---- (1) konfigurasi WA ----
  const [cfg, setCfg] = useState({
    waAktif: pengaturan.waAktif === 'true',
    waEndpoint: pengaturan.waEndpoint,
    waApiKey: pengaturan.waApiKey,
    waTemplateProgres: pengaturan.waTemplateProgres,
  });
  const [simpanLoading, setSimpanLoading] = useState(false);

  // ---- (2) kirim ----
  const [mode, setMode] = useState<ModeTarget>('semua');
  const [kelasId, setKelasId] = useState('');
  const [terpilih, setTerpilih] = useState<string[]>([]);
  const [kirimLoading, setKirimLoading] = useState(false);
  const [konfirmasi, setKonfirmasi] = useState(false);
  const [hasilKirim, setHasilKirim] = useState<HasilKirimNotifikasi | null>(null);

  // ---- (3) riwayat ----
  const [riwayat, setRiwayat] = useState<NotifikasiLog[]>([]);
  const [memuatRiwayat, setMemuatRiwayat] = useState(true);

  const daftarSiswa = useMemo(
    () =>
      data.pengguna
        .filter((p) => p.peran === 'siswa' && p.aktif === 1)
        .sort((a, b) => a.nama.localeCompare(b.nama)),
    [data.pengguna]
  );
  const namaKelas = (id: string) => data.kelas.find((k) => k.id === id)?.nama || '-';

  const targetHitung = useMemo(() => {
    if (mode === 'kelas') return daftarSiswa.filter((s) => s.kelasId === kelasId);
    if (mode === 'manual') return daftarSiswa.filter((s) => terpilih.includes(s.username));
    return daftarSiswa;
  }, [mode, kelasId, terpilih, daftarSiswa]);

  const muatRiwayat = async () => {
    setMemuatRiwayat(true);
    try {
      setRiwayat(await getNotifikasi());
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal memuat riwayat.', 'error');
    } finally {
      setMemuatRiwayat(false);
    }
  };

  useEffect(() => {
    muatRiwayat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ubahCfg = (k: keyof typeof cfg, v: string | boolean) =>
    setCfg({ ...cfg, [k]: v });

  const simpanKonfig = async () => {
    setSimpanLoading(true);
    try {
      const gabung: Pengaturan = {
        ...pengaturan,
        waAktif: cfg.waAktif ? 'true' : 'false',
        waEndpoint: cfg.waEndpoint.trim(),
        waApiKey: cfg.waApiKey,
        waTemplateProgres: cfg.waTemplateProgres,
      };
      await savePengaturan(gabung);
      toast('Konfigurasi WhatsApp tersimpan.', 'sukses');
      await refreshData();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal menyimpan.', 'error');
    } finally {
      setSimpanLoading(false);
    }
  };

  const toggleSiswa = (username: string) =>
    setTerpilih((t) => (t.includes(username) ? t.filter((x) => x !== username) : [...t, username]));

  const kirim = async () => {
    if (targetHitung.length === 0) return toast('Tidak ada target yang dipilih.', 'error');
    setKonfirmasi(false);
    setKirimLoading(true);
    setHasilKirim(null);
    try {
      const r = await kirimNotifikasiProgres({
        ...(mode === 'manual' ? { usernames: terpilih } : {}),
        ...(mode === 'kelas' ? { kelasId } : {}),
      });
      setHasilKirim(r);
      toast(
        `Selesai: ${r.terkirim} terkirim, ${r.dilewati} dilewati dari ${r.total} target.`,
        r.terkirim > 0 ? 'sukses' : 'info'
      );
      await muatRiwayat();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal mengirim.', 'error');
    } finally {
      setKirimLoading(false);
    }
  };

  return (
    <div>
      <PageHeader
        judul="Notifikasi Progres"
        subjudul="Kirim laporan progres belajar ke WhatsApp orang tua & pantau riwayatnya."
      />

      {/* ===== (1) Konfigurasi WhatsApp ===== */}
      <Card className="mb-4">
        <h2 className="mb-3 flex items-center gap-2 font-bold text-slate-900 dark:text-slate-100">
          <Settings2 className="h-4 w-4 text-violet-600" /> Konfigurasi WhatsApp
        </h2>
        <div className="space-y-4">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
            <input
              type="checkbox"
              checked={cfg.waAktif}
              onChange={(e) => ubahCfg('waAktif', e.target.checked)}
              className="h-4 w-4 accent-violet-600"
            />
            Aktifkan pengiriman WhatsApp
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Endpoint API WA">
              <TextInput
                value={cfg.waEndpoint}
                onChange={(e) => ubahCfg('waEndpoint', e.target.value)}
                placeholder="https://api-wa-sekolah.id/kirim"
              />
            </Field>
            <Field label="API Key">
              <TextInput
                type="password"
                value={cfg.waApiKey}
                onChange={(e) => ubahCfg('waApiKey', e.target.value)}
                placeholder="Kunci API dari penyedia WA"
                autoComplete="new-password"
              />
            </Field>
          </div>
          <Field label="Template pesan progres">
            <textarea
              value={cfg.waTemplateProgres}
              onChange={(e) => ubahCfg('waTemplateProgres', e.target.value)}
              rows={4}
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
            />
            <p className="mt-1 text-xs text-slate-400">
              Placeholder yang tersedia: <code className="font-mono">{PLACEHOLDER}</code>
            </p>
          </Field>
          <p className="text-xs text-slate-400">
            Backend mengirim POST JSON <code className="font-mono">{'{ to, message, apiKey }'}</code> ke
            endpoint di atas. Bila belum dikonfigurasi, pengiriman <b>dilewati</b> dan tetap
            tercatat di riwayat — tidak ada error.
          </p>
          <div>
            <Button onClick={simpanKonfig} loading={simpanLoading}>
              <Save className="h-4 w-4" /> Simpan Konfigurasi
            </Button>
          </div>
        </div>
      </Card>

      {/* ===== (2) Kirim notifikasi ===== */}
      <Card className="mb-4">
        <h2 className="mb-3 flex items-center gap-2 font-bold text-slate-900 dark:text-slate-100">
          <BellRing className="h-4 w-4 text-violet-600" /> Kirim Notifikasi Progres
        </h2>
        <div className="mb-3 flex flex-wrap gap-2">
          {(
            [
              { key: 'semua', label: 'Semua siswa' },
              { key: 'kelas', label: 'Per kelas' },
              { key: 'manual', label: 'Pilih manual' },
            ] as { key: ModeTarget; label: string }[]
          ).map((m) => (
            <button
              key={m.key}
              onClick={() => setMode(m.key)}
              className={`rounded-full px-4 py-2 text-sm font-bold transition ${
                mode === m.key
                  ? 'bg-violet-600 text-white'
                  : 'border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {mode === 'kelas' && (
          <Field label="Kelas">
            <SelectInput value={kelasId} onChange={(e) => setKelasId(e.target.value)}>
              <option value="">— Pilih kelas —</option>
              {data.kelas.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.nama}
                </option>
              ))}
            </SelectInput>
          </Field>
        )}

        {mode === 'manual' && (
          <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700">
            {daftarSiswa.map((s) => (
              <label
                key={s.username}
                className="flex cursor-pointer items-center gap-3 border-b border-slate-100 dark:border-slate-800 px-3 py-2 text-sm last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800 dark:bg-slate-800"
              >
                <input
                  type="checkbox"
                  checked={terpilih.includes(s.username)}
                  onChange={() => toggleSiswa(s.username)}
                  className="h-4 w-4 accent-violet-600"
                />
                <span className="min-w-0 flex-1">
                  <span className="font-semibold text-slate-800">{s.nama}</span>{' '}
                  <span className="text-xs text-slate-400">{namaKelas(s.kelasId)}</span>
                </span>
                {s.noHP ? (
                  <Badge warna="hijau">WA ✓</Badge>
                ) : (
                  <Badge warna="abu">tanpa WA</Badge>
                )}
              </label>
            ))}
            {daftarSiswa.length === 0 && (
              <p className="px-3 py-4 text-center text-sm text-slate-400">Belum ada siswa.</p>
            )}
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button onClick={() => setKonfirmasi(true)} loading={kirimLoading} disabled={targetHitung.length === 0}>
            <Send className="h-4 w-4" /> Kirim ke {targetHitung.length} siswa
          </Button>
          <p className="text-xs text-slate-400">
            Setiap pengiriman tercatat di riwayat di bawah.
          </p>
        </div>

        {hasilKirim && (
          <div className="mt-3 rounded-xl bg-slate-50 dark:bg-slate-800 p-4 text-sm">
            <p className="mb-2 font-bold text-slate-900 dark:text-slate-100">Hasil pengiriman terakhir</p>
            <div className="mb-2 flex flex-wrap gap-2">
              <Badge warna="biru">Total {hasilKirim.total}</Badge>
              <Badge warna="hijau">Terkirim {hasilKirim.terkirim}</Badge>
              <Badge warna="kuning">Dilewati {hasilKirim.dilewati}</Badge>
            </div>
            <div className="max-h-40 space-y-1 overflow-y-auto">
              {hasilKirim.detail.map((d) => (
                <p key={d.username} className="text-xs text-slate-600 dark:text-slate-300">
                  <b>{d.nama}</b> — {d.status}
                </p>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* ===== (3) Riwayat ===== */}
      <Card>
        <h2 className="mb-3 flex items-center gap-2 font-bold text-slate-900 dark:text-slate-100">
          <History className="h-4 w-4 text-violet-600" /> Riwayat Pengiriman
        </h2>
        {memuatRiwayat ? (
          <LoadingBlock teks="Memuat riwayat..." />
        ) : riwayat.length === 0 ? (
          <EmptyState judul="Belum ada riwayat" subjudul="Notifikasi yang dikirim akan tercatat di sini." />
        ) : (
          <TabelResponsif>
            <table className="w-full min-w-[720px]">
              <thead>
                <tr>
                  <th className={thCls}>Waktu</th>
                  <th className={thCls}>Nama</th>
                  <th className={thCls}>No. WA</th>
                  <th className={thCls}>Isi</th>
                  <th className={thCls}>Status</th>
                </tr>
              </thead>
              <tbody>
                {riwayat.map((n) => (
                  <tr key={n.id} className="hover:bg-slate-50 dark:hover:bg-slate-800 dark:bg-slate-800">
                    <td className={tdCls + ' whitespace-nowrap'}>
                      {n.waktu ? formatTanggalWaktu(n.waktu) : '-'}
                    </td>
                    <td className={tdCls}>{n.namaSiswa}</td>
                    <td className={tdCls + ' font-mono-num'}>{n.noHP || '-'}</td>
                    <td className={tdCls}>
                      <span className="line-clamp-2 max-w-[320px] text-xs text-slate-500 dark:text-slate-400">
                        {n.isi}
                      </span>
                    </td>
                    <td className={tdCls}>
                      {n.status === 'terkirim' ? (
                        <Badge warna="hijau">terkirim</Badge>
                      ) : (
                        <Badge warna="kuning">{n.status}</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TabelResponsif>
        )}
      </Card>

      {konfirmasi && (
        <ConfirmDialog
          judul="Kirim notifikasi?"
          pesan={`Notifikasi progres akan dikirim ke ${targetHitung.length} siswa (yang tanpa nomor WA / WA belum dikonfigurasi otomatis dilewati & tercatat). Lanjutkan?`}
          onYa={kirim}
          onBatal={() => setKonfirmasi(false)}
        />
      )}
    </div>
  );
}
