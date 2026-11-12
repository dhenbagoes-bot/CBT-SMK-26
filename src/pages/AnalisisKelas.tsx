import { useEffect, useState } from 'react';
import { BarChart3, ListOrdered, Users } from 'lucide-react';
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
import { getAnalisisKelas } from '../services/api';
import type { AnalisisKelasData, ButirSoal } from '../types';
import type { PageProps } from './PageProps';

function warnaKlasifikasi(k: ButirSoal['klasifikasi']): 'hijau' | 'biru' | 'kuning' | 'merah' | 'abu' {
  switch (k) {
    case 'Sangat Mudah':
      return 'hijau';
    case 'Mudah':
      return 'biru';
    case 'Sedang':
      return 'kuning';
    case 'Sukar':
      return 'merah';
    default:
      return 'abu';
  }
}

export default function AnalisisKelas({ data, pengaturan, toast }: PageProps) {
  const [paketId, setPaketId] = useState(data.paket[0]?.id || '');
  const [kelasId, setKelasId] = useState('');
  const [analisis, setAnalisis] = useState<AnalisisKelasData | null>(null);
  const [memuat, setMemuat] = useState(false);

  useEffect(() => {
    (async () => {
      setMemuat(true);
      try {
        setAnalisis(await getAnalisisKelas(paketId || undefined, kelasId || undefined));
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Gagal memuat analisis.', 'error');
        setAnalisis(null);
      } finally {
        setMemuat(false);
      }
    })();
  }, [paketId, kelasId, toast]);

  const s = analisis?.statistik;
  const distMaks = Math.max(1, ...(analisis?.distribusi.map((d) => d.jumlah) ?? [1]));

  return (
    <div>
      <PageHeader
        judul="Analisis Kelas"
        subjudul="Statistik nilai, distribusi, peringkat siswa, dan analisis butir soal."
      />

      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Paket (opsional — wajib untuk analisis butir soal)">
            <SelectInput value={paketId} onChange={(e) => setPaketId(e.target.value)}>
              <option value="">Semua paket</option>
              {data.paket.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nama}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Kelas (opsional)">
            <SelectInput value={kelasId} onChange={(e) => setKelasId(e.target.value)}>
              <option value="">Semua kelas</option>
              {data.kelas.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.nama}
                </option>
              ))}
            </SelectInput>
          </Field>
        </div>
      </Card>

      {memuat ? (
        <LoadingBlock teks="Memuat analisis..." />
      ) : !analisis || (s?.jumlah ?? 0) === 0 ? (
        <EmptyState
          judul="Belum ada data"
          subjudul="Belum ada hasil ujian pada filter yang dipilih."
        />
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-6">
            <StatCard ikon={<Users className="h-5 w-5" />} label="Peserta" nilai={String(s?.jumlah ?? 0)} warna="biru" />
            <StatCard ikon={<BarChart3 className="h-5 w-5" />} label="Rata-rata" nilai={String(s?.rata2 ?? 0)} warna="ungu" />
            <StatCard ikon={<BarChart3 className="h-5 w-5" />} label="Median" nilai={String(s?.median ?? 0)} warna="ungu" />
            <StatCard ikon={<BarChart3 className="h-5 w-5" />} label="Tertinggi" nilai={String(s?.maks ?? 0)} warna="hijau" />
            <StatCard ikon={<BarChart3 className="h-5 w-5" />} label="Terendah" nilai={String(s?.min ?? 0)} warna="merah" />
            <StatCard
              ikon={<BarChart3 className="h-5 w-5" />}
              label="% Tuntas"
              nilai={`${s?.ketuntasanPct ?? 0}%`}
              sub={`KKM ${pengaturan.kkm ?? 75}`}
              warna="kuning"
            />
          </div>

          <div className="mb-4 grid gap-4 lg:grid-cols-2">
            <Card>
              <h2 className="mb-3 font-bold text-slate-900 dark:text-slate-100">Distribusi Nilai</h2>
              <div className="space-y-2.5">
                {analisis.distribusi.map((d) => (
                  <div key={d.rentang}>
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="font-semibold text-slate-700 dark:text-slate-200">{d.rentang}</span>
                      <span className="font-mono-num text-slate-500 dark:text-slate-400">{d.jumlah} siswa</span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className="h-full rounded-full bg-violet-500"
                        style={{ width: `${Math.round((d.jumlah / distMaks) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
            <Card>
              <h2 className="mb-3 flex items-center gap-2 font-bold text-slate-900 dark:text-slate-100">
                <ListOrdered className="h-4 w-4 text-violet-600" /> 5 Teratas &amp; 5 Terbawah
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="mb-2 text-xs font-bold uppercase text-emerald-600">Teratas</p>
                  <ol className="space-y-1.5">
                    {analisis.teratas.map((t, i) => (
                      <li key={t.username} className="flex items-center justify-between gap-2 text-sm">
                        <span className="min-w-0 truncate">
                          <b className="font-mono-num mr-1.5 text-slate-400">{i + 1}.</b>
                          {t.namaSiswa}
                        </span>
                        <span className="font-mono-num shrink-0 font-bold text-emerald-700">{t.nilai}</span>
                      </li>
                    ))}
                  </ol>
                </div>
                <div>
                  <p className="mb-2 text-xs font-bold uppercase text-red-600">Terbawah</p>
                  <ol className="space-y-1.5">
                    {analisis.terbawah.map((t, i) => (
                      <li key={t.username} className="flex items-center justify-between gap-2 text-sm">
                        <span className="min-w-0 truncate">
                          <b className="font-mono-num mr-1.5 text-slate-400">{i + 1}.</b>
                          {t.namaSiswa}
                        </span>
                        <span className="font-mono-num shrink-0 font-bold text-red-700">{t.nilai}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            </Card>
          </div>

          {paketId && (
            <Card>
              <h2 className="mb-1 font-bold text-slate-900 dark:text-slate-100">Analisis Butir Soal</h2>
              <p className="mb-3 text-xs text-slate-400">
                Klasifikasi tingkat kesukaran dari % jawaban benar; daya beda dari selisih
                % benar kelompok 27% atas vs 27% bawah.
              </p>
              {analisis.butirSoal.length === 0 ? (
                <EmptyState judul="Tidak ada butir soal" subjudul="Paket ini belum memiliki soal." />
              ) : (
                <TabelResponsif>
                  <table className="w-full min-w-[760px]">
                    <thead>
                      <tr>
                        <th className={thCls}>No</th>
                        <th className={thCls}>Soal</th>
                        <th className={thCls}>Dijawab</th>
                        <th className={thCls}>Benar</th>
                        <th className={thCls}>% Benar</th>
                        <th className={thCls}>Klasifikasi</th>
                        <th className={thCls}>Daya Beda</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analisis.butirSoal.map((b, i) => (
                        <tr key={b.soalId} className="hover:bg-slate-50 dark:hover:bg-slate-800 dark:bg-slate-800">
                          <td className={tdCls}>{i + 1}</td>
                          <td className={tdCls}>
                            <span className="line-clamp-2 max-w-[280px]">{b.teks}</span>
                          </td>
                          <td className={tdCls}>{b.dijawab}</td>
                          <td className={tdCls}>{b.benar}</td>
                          <td className={tdCls}>
                            <div className="flex min-w-[110px] items-center gap-2">
                              <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                                <div
                                  className="h-full rounded-full bg-violet-500"
                                  style={{ width: `${Math.min(100, b.pctBenar)}%` }}
                                />
                              </div>
                              <span className="font-mono-num text-xs font-bold">{b.pctBenar}%</span>
                            </div>
                          </td>
                          <td className={tdCls}>
                            <Badge warna={warnaKlasifikasi(b.klasifikasi)}>{b.klasifikasi}</Badge>
                          </td>
                          <td className={tdCls}>
                            <span className="font-mono-num font-bold">
                              {b.dayaBeda === null ? '-' : `${b.dayaBeda > 0 ? '+' : ''}${b.dayaBeda}`}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TabelResponsif>
              )}
            </Card>
          )}
        </>
      )}
    </div>
  );
}
