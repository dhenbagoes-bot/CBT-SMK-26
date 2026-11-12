import { useEffect, useMemo, useState } from 'react';
import { Award, BarChart3, ListChecks, Target, TrendingUp } from 'lucide-react';
import {
  Badge,
  Card,
  EmptyState,
  Field,
  LoadingBlock,
  PageHeader,
  SelectInput,
  StatCard,
  TabelResponsif,
  tdCls,
  thCls,
} from '../components/ui';
import { getAnalisisSiswa } from '../services/api';
import { formatTanggalWaktu } from '../utils/format';
import type { AnalisisSiswaData } from '../types';
import type { PageProps } from './PageProps';

export default function AnalisisSaya({ data, user, pengaturan, toast }: PageProps) {
  const daftarSiswa = useMemo(
    () =>
      data.pengguna
        .filter((p) => p.peran === 'siswa' && p.aktif === 1)
        .sort((a, b) => a.nama.localeCompare(b.nama)),
    [data.pengguna]
  );
  // Siswa melihat data sendiri; guru/admin memilih siswa mana yang dianalisis.
  const [username, setUsername] = useState(
    user?.peran === 'siswa' ? (user?.username || '') : ''
  );
  const [analisis, setAnalisis] = useState<AnalisisSiswaData | null>(null);
  const [memuat, setMemuat] = useState(false);

  const namaTerpilih =
    user?.peran === 'siswa'
      ? user?.nama
      : daftarSiswa.find((s) => s.username === username)?.nama || '';

  useEffect(() => {
    if (!username) {
      setAnalisis(null);
      return;
    }
    (async () => {
      setMemuat(true);
      try {
        setAnalisis(await getAnalisisSiswa(user?.peran === 'siswa' ? undefined : username));
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Gagal memuat analisis.', 'error');
        setAnalisis(null);
      } finally {
        setMemuat(false);
      }
    })();
  }, [username, user?.peran, toast]);

  const kkm = pengaturan.kkm ?? 75;
  const r = analisis?.ringkasan;

  return (
    <div>
      <PageHeader
        judul="Analisis Saya"
        subjudul={
          user?.peran === 'siswa'
            ? 'Penguasaan materi per mapel, tren nilai, dan ketuntasan vs KKM.'
            : 'Pilih siswa untuk melihat analisis progres belajarnya secara mendetail.'
        }
      />

      {user?.peran !== 'siswa' && (
        <Card className="mb-4">
          <Field label="Siswa">
            <SelectInput value={username} onChange={(e) => setUsername(e.target.value)}>
              <option value="">— Pilih siswa —</option>
              {daftarSiswa.map((s) => (
                <option key={s.username} value={s.username}>
                  {s.nama} ({s.username})
                </option>
              ))}
            </SelectInput>
          </Field>
        </Card>
      )}

      {memuat ? (
        <LoadingBlock teks="Memuat analisis..." />
      ) : !analisis ? (
        <EmptyState
          judul={user?.peran === 'siswa' ? 'Belum ada data' : 'Pilih siswa dulu'}
          subjudul={
            user?.peran === 'siswa'
              ? 'Kerjakan ujian di menu Ujian agar analisis muncul.'
              : 'Pilih nama siswa pada daftar di atas.'
          }
        />
      ) : (
        <>
          {namaTerpilih && (
            <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
              Analisis untuk <b className="text-slate-800">{namaTerpilih}</b> • KKM {kkm}
            </p>
          )}
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              ikon={<ListChecks className="h-5 w-5" />}
              label="Total Ujian"
              nilai={String(r?.totalUjian ?? 0)}
              warna="biru"
            />
            <StatCard
              ikon={<BarChart3 className="h-5 w-5" />}
              label="Rata-rata Nilai"
              nilai={String(r?.rataRata ?? 0)}
              sub={`KKM ${kkm}`}
              warna="ungu"
            />
            <StatCard
              ikon={<Award className="h-5 w-5" />}
              label="Nilai Tertinggi"
              nilai={String(r?.nilaiTertinggi ?? 0)}
              warna="hijau"
            />
            <StatCard
              ikon={<Target className="h-5 w-5" />}
              label="Perlu Ditingkatkan"
              nilai={r?.mapelTerlemah || '-'}
              sub={r?.mapelTerkuat && r.mapelTerkuat !== '-' ? `Terkuat: ${r.mapelTerkuat}` : undefined}
              warna="kuning"
            />
          </div>

          {analisis.tren.length > 0 && (
            <Card className="mb-4">
              <h2 className="mb-3 flex items-center gap-2 font-bold text-slate-900 dark:text-slate-100">
                <TrendingUp className="h-4 w-4 text-violet-600" /> Tren Nilai
              </h2>
              <div className="space-y-2.5">
                {analisis.tren.map((t, i) => (
                  <div key={`${t.paketId}-${i}`}>
                    <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                      <span className="min-w-0 truncate font-semibold text-slate-700 dark:text-slate-200">{t.namaPaket}</span>
                      <span className="shrink-0 text-slate-400">
                        {t.waktuSubmit ? formatTanggalWaktu(t.waktuSubmit) : ''}
                        {' • '}
                        <b className="font-mono-num text-slate-700 dark:text-slate-200">{t.nilai}</b>
                      </span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className={`h-full rounded-full transition-all ${
                          t.nilai >= kkm ? 'bg-emerald-500' : 'bg-amber-500'
                        }`}
                        style={{ width: `${Math.min(100, Math.max(0, t.nilai))}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card>
            <h2 className="mb-3 font-bold text-slate-900 dark:text-slate-100">Penguasaan per Mapel</h2>
            {analisis.perMapel.length === 0 ? (
              <EmptyState judul="Belum ada data mapel" subjudul="Belum ada jawaban yang bisa dianalisis." />
            ) : (
              <TabelResponsif>
                <table className="w-full min-w-[640px]">
                  <thead>
                    <tr>
                      <th className={thCls}>Mapel</th>
                      <th className={thCls}>Dikerjakan</th>
                      <th className={thCls}>Benar</th>
                      <th className={thCls}>Penguasaan</th>
                      <th className={thCls}>Rata-rata</th>
                      <th className={thCls}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analisis.perMapel.map((s) => (
                      <tr key={s.mapelId} className="hover:bg-slate-50 dark:hover:bg-slate-800 dark:bg-slate-800">
                        <td className={tdCls}>
                          <span className="font-semibold">{s.namaMapel}</span>
                        </td>
                        <td className={tdCls}>{s.totalDikerjakan}</td>
                        <td className={tdCls}>{s.benar}</td>
                        <td className={tdCls}>
                          <div className="flex min-w-[140px] items-center gap-2">
                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                              <div
                                className={`h-full rounded-full ${
                                  s.pct >= kkm ? 'bg-emerald-500' : 'bg-amber-500'
                                }`}
                                style={{ width: `${Math.min(100, s.pct)}%` }}
                              />
                            </div>
                            <span className="font-mono-num text-xs font-bold">{s.pct}%</span>
                          </div>
                        </td>
                        <td className={tdCls}>
                          <span className="font-mono-num font-bold">{s.nilaiRata}</span>
                        </td>
                        <td className={tdCls}>
                          {s.tuntas ? (
                            <Badge warna="hijau">Tuntas</Badge>
                          ) : (
                            <Badge warna="merah">Belum tuntas</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TabelResponsif>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
