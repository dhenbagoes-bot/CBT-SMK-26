import { useEffect, useState } from 'react';
import { Download, Eye, Printer } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  KopCetak,
  LoadingBlock,
  Modal,
  PageHeader,
  SelectInput,
  TabelResponsif,
  TtdCetak,
  tdCls,
  thCls,
} from '../components/ui';
import { getHasilSiswa, nilaiEssay, rekapHasil } from '../services/api';
import { buatXlsx } from '../utils/imporSoal';
import { uraiJawabanJodoh } from '../utils/penilaian';
import { formatTanggalWaktu } from '../utils/format';
import type { BarisRekap, HasilUjian, Paket, RincianSoal } from '../types';
import type { PageProps } from './PageProps';

function unduhBlob(nama: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nama;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export default function Hasil({ data, user, pengaturan, toast }: PageProps) {
  if (user?.peran === 'siswa') return <HasilSiswa {...{ data, user, pengaturan, toast } as PageProps} />;
  return <RekapGuru data={data} pengaturan={pengaturan} toast={toast} />;
}

// ================= SISWA =================

function HasilSiswa({ data, toast }: PageProps) {
  const [hasil] = useState<HasilUjian[]>(data.hasil);
  const [detailPaket, setDetailPaket] = useState<Paket | null>(null);
  const [rincian, setRincian] = useState<RincianSoal[] | null>(null);
  const [memuat, setMemuat] = useState(false);

  const bukaDetail = async (p: Paket) => {
    setDetailPaket(p);
    setRincian(null);
    setMemuat(true);
    try {
      const r = await getHasilSiswa(p.id);
      // Backend mengembalikan ARRAY hasil dengan `rincian` menempel per item.
      const item = r.find((h) => h.paketId === p.id) ?? r[0];
      setRincian(item?.rincian || null);
      if (!item?.rincian) toast('Pembahasan tidak diizinkan untuk paket ini.', 'info');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal memuat detail.', 'error');
    } finally {
      setMemuat(false);
    }
  };

  return (
    <div>
      <PageHeader judul="Hasil Saya" subjudul="Nilai & pembahasan ujian yang sudah dikerjakan." />
      {hasil.length === 0 ? (
        <EmptyState judul="Belum ada hasil" subjudul="Kerjakan paket ujian di menu Ujian." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {hasil.map((h) => {
            const p = data.paket.find((x) => x.id === h.paketId);
            const tampilSkor = p ? p.tampilSkor === 1 : true;
            return (
              <Card key={h.id}>
                <p className="text-xs font-bold uppercase text-violet-600">{h.namaPaket}</p>
                <div className="mt-2 flex items-end justify-between">
                  <div>
                    {h.menungguEssay ? (
                      <p className="rounded-lg bg-amber-100 px-3 py-1.5 text-sm font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                        Menunggu penilaian
                      </p>
                    ) : tampilSkor ? (
                      <p className="font-mono-num text-4xl font-bold text-violet-700 dark:text-emerald-400">{h.nilai}</p>
                    ) : (
                      <p className="text-sm text-slate-500">Nilai diumumkan guru</p>
                    )}
                    <p className="mt-1 text-xs text-slate-400">
                      Benar {h.benar} • Salah {h.salah} • Kosong {h.kosong}
                      {h.menungguEssay ? ' • Essay belum dinilai — nilai masih sementara' : ''}
                    </p>
                    <p className="text-xs text-slate-400">{formatTanggalWaktu(h.waktuSubmit)}</p>
                  </div>
                  {p && p.tampilPembahasan === 1 && (
                    <Button varian="sekunder" kecil onClick={() => bukaDetail(p)}>
                      <Eye className="h-3.5 w-3.5" /> Pembahasan
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {detailPaket && (
        <Modal judul={`Pembahasan — ${detailPaket.nama}`} onTutup={() => setDetailPaket(null)} lebar="max-w-3xl">
          {memuat ? (
            <LoadingBlock teks="Memuat pembahasan..." />
          ) : !rincian || rincian.length === 0 ? (
            <EmptyState judul="Tidak ada rincian" subjudul="Paket ini tidak mengizinkan pembahasan." />
          ) : (
            <div className="space-y-4">
              {rincian.map((r, i) => (
                <div key={r.soalId} className="rounded-xl border border-slate-200 p-4">
                  <p className="text-sm font-bold text-slate-900">
                    {i + 1}. {r.teks}
                  </p>
                  <div className="mt-2 space-y-1">
                    {r.opsi.map((o) => {
                      const kodeTampil = String.fromCharCode(65 + r.opsi.indexOf(o));
                      // PGK: kunci bisa 'A,C' — cocokkan per huruf.
                      const kunciSet = (r.kunci || '').split(',').map((k) => k.trim().toUpperCase());
                      const isKunci = kunciSet.includes(o.kode.toUpperCase());
                      const isJawaban = o.kode.toUpperCase() === (r.jawabanSiswa || '').toUpperCase();
                      return (
                        <p
                          key={o.kode}
                          className={`rounded-lg px-3 py-1.5 text-sm ${
                            isKunci
                              ? 'bg-emerald-100 font-semibold text-emerald-800'
                              : isJawaban
                                ? 'bg-red-100 text-red-800'
                                : 'text-slate-600'
                          }`}
                        >
                          {kodeTampil}. {o.teks}
                          {isKunci && ' ✓ (kunci)'}
                          {isJawaban && !isKunci && ' ← jawaban Anda'}
                        </p>
                      );
                    })}
                  </div>
                  {/* Jodoh / isian / essay tidak punya opsi: tampilkan jawaban & kunci sebagai teks. */}
                  {r.opsi.length === 0 && r.jenis === 'jodoh' && r.pasanganKiri && r.pasanganKiri.length > 0 && (
                    <div className="mt-2 space-y-1 text-sm">
                      {r.pasanganKiri.map((kiri, ki) => {
                        const petaJwb = uraiJawabanJodoh(r.jawabanSiswa || '');
                        const jwbIdx = petaJwb.get(ki);
                        const kunciIdx = (r.kunciPasangan || [])[ki];
                        const benarPas = jwbIdx !== undefined && jwbIdx === kunciIdx;
                        return (
                          <p
                            key={ki}
                            className={`rounded-lg px-3 py-1.5 ${
                              benarPas ? 'bg-emerald-100 text-emerald-800' : 'bg-red-50 text-red-800'
                            }`}
                          >
                            {ki + 1}. {kiri} → {jwbIdx !== undefined ? (r.pasanganKanan?.[jwbIdx] ?? '-') : '(kosong)'}
                            {benarPas ? ' ✓' : ` (kunci: ${kunciIdx !== undefined ? (r.pasanganKanan?.[kunciIdx] ?? '-') : '-'})`}
                          </p>
                        );
                      })}
                    </div>
                  )}
                  {r.opsi.length === 0 && r.jenis !== 'jodoh' && (
                    <div className="mt-2 space-y-1 text-sm text-slate-600">
                      <p className="rounded-lg bg-slate-50 px-3 py-1.5">
                        <b>Jawaban Anda:</b>{' '}
                        <span className="whitespace-pre-wrap">{r.jawabanSiswa || '(kosong)'}</span>
                      </p>
                      {r.jenis === 'isian' && (
                        <p className="rounded-lg bg-emerald-50 px-3 py-1.5">
                          <b>Kunci:</b> {r.kunci || '-'}
                        </p>
                      )}
                      {r.jenis === 'essay' && (
                        <p className="rounded-lg bg-amber-50 px-3 py-1.5">
                          {r.menungguPenilaian
                            ? 'Essay belum dinilai guru.'
                            : `Skor essay: ${r.skor ?? 0} dari ${r.bobot ?? 1}.`}
                        </p>
                      )}
                    </div>
                  )}
                  {r.pembahasan && (
                    <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
                      <b>Pembahasan:</b> {r.pembahasan}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

// ================= GURU / ADMIN =================

function RekapGuru({
  data,
  pengaturan,
  toast,
}: {
  data: PageProps['data'];
  pengaturan: PageProps['pengaturan'];
  toast: PageProps['toast'];
}) {
  const [paketId, setPaketId] = useState(data.paket[0]?.id || '');
  const [rows, setRows] = useState<BarisRekap[]>([]);
  const [namaPaket, setNamaPaket] = useState('');
  const [memuat, setMemuat] = useState(false);
  const [segarkan, setSegarkan] = useState(0);

  // ---- Penilaian essay manual (guru/admin) ----
  const [essay, setEssay] = useState<HasilUjian[] | null>(null);
  const [essayMemuat, setEssayMemuat] = useState(false);
  const [skorEssay, setSkorEssay] = useState<Record<string, string>>({});
  const [nilaiEssayId, setNilaiEssayId] = useState<string | null>(null);
  const pendingEssay = data.hasil.filter(
    (h) => h.paketId === paketId && (h.essayBelumDinilai || 0) > 0
  );

  const muatEssay = async () => {
    if (!paketId) return;
    setEssayMemuat(true);
    try {
      const semua = await getHasilSiswa(paketId);
      setEssay(semua.filter((h) => (h.essayBelumDinilai || 0) > 0));
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal memuat essay.', 'error');
    } finally {
      setEssayMemuat(false);
    }
  };

  const simpanNilaiEssay = async (h: HasilUjian, soalId: string, bobot: number, kunciSkor: string) => {
    const skor = Number(skorEssay[kunciSkor]);
    if (!Number.isFinite(skor) || skor < 0 || skor > bobot) {
      toast(`Skor harus angka 0 sampai ${bobot}.`, 'error');
      return;
    }
    setNilaiEssayId(kunciSkor);
    try {
      await nilaiEssay(h.sesiId, soalId, skor);
      toast('Nilai essay tersimpan — nilai akhir dihitung ulang.', 'sukses');
      await muatEssay();
      setSegarkan((s) => s + 1);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal menyimpan nilai essay.', 'error');
    } finally {
      setNilaiEssayId(null);
    }
  };

  useEffect(() => {
    if (!paketId) {
      setRows([]);
      return;
    }
    (async () => {
      setMemuat(true);
      try {
        const r = await rekapHasil(paketId);
        setRows(r.rows);
        setNamaPaket(r.paket?.nama || '');
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Gagal memuat rekap.', 'error');
      } finally {
        setMemuat(false);
      }
    })();
  }, [paketId, toast, segarkan]);

  const selesai = rows.filter((r) => r.status === 'Selesai');
  const rata = selesai.length ? Math.round(selesai.reduce((a, r) => a + r.nilai, 0) / selesai.length) : 0;

  const unduhExcel = () => {
    const header = ['No', 'NIS', 'Nama', 'Kelas', 'Status', 'Nilai', 'Benar', 'Total Soal', 'Waktu Submit', 'Peringatan'];
    const isi = rows.map((r, i) => [
      String(i + 1),
      r.nis,
      r.nama,
      r.kelas,
      r.status,
      String(r.nilai),
      String(r.benar),
      String(r.totalSoal),
      r.waktuSubmit,
      String(r.peringatan),
    ]);
    const xlsx = buatXlsx([{ nama: 'Rekap', data: [header, ...isi] }]);
    unduhBlob(
      `rekap-${namaPaket.replace(/[^\w\-]+/g, '-').toLowerCase() || 'hasil'}.xlsx`,
      new Blob([xlsx], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    );
    toast('File Excel diunduh.', 'sukses');
  };

  return (
    <div>
      <PageHeader
        judul="Rekap Hasil"
        subjudul="Hasil ujian per paket."
        aksi={
          rows.length > 0 && (
            <>
              <Button varian="sekunder" onClick={unduhExcel}>
                <Download className="h-4 w-4" /> Unduh Excel
              </Button>
              <Button varian="sekunder" onClick={() => window.print()}>
                <Printer className="h-4 w-4" /> Cetak
              </Button>
            </>
          )
        }
      />

      <Card className="no-print mb-4">
        <Field label="Paket">
          <SelectInput value={paketId} onChange={(e) => { setPaketId(e.target.value); setEssay(null); }}>
            {data.paket.map((p) => (
              <option key={p.id} value={p.id}>{p.nama}</option>
            ))}
          </SelectInput>
        </Field>
      </Card>

      {/* Penilaian essay manual (guru/admin) */}
      <Card className="no-print mb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-bold text-slate-900 dark:text-slate-100">Penilaian Essay</h3>
            <p className="text-xs text-slate-400">
              {pendingEssay.length > 0
                ? `${pendingEssay.length} hasil menunggu penilaian essay untuk paket ini.`
                : 'Tidak ada essay yang menunggu penilaian untuk paket ini.'}
            </p>
          </div>
          <Button varian="sekunder" kecil onClick={muatEssay} loading={essayMemuat} disabled={!paketId}>
            Muat Essay Belum Dinilai
          </Button>
        </div>
        {essay && essay.length === 0 && (
          <p className="mt-3 text-sm text-slate-500">Semua essay untuk paket ini sudah dinilai.</p>
        )}
        {essay && essay.map((h) => {
          const butuh = (h.rincian || []).filter((r) => r.menungguPenilaian && r.jenis === 'essay');
          if (butuh.length === 0) return null;
          return (
            <div key={h.id} className="mt-4 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
              <p className="font-bold text-slate-900 dark:text-slate-100">
                {h.namaSiswa} <span className="font-normal text-slate-400">({h.kelas} • nilai sementara {h.nilai})</span>
              </p>
              {butuh.map((r) => {
                const kunciSkor = `${h.sesiId}:${r.soalId}`;
                const bobot = r.bobot || 1;
                return (
                  <div key={r.soalId} className="mt-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{r.teks}</p>
                    <p className="mt-2 whitespace-pre-wrap rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                      {r.jawabanSiswa || '(tidak dijawab)'}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <label className="text-xs font-semibold text-slate-500">Skor (0–{bobot}):</label>
                      <input
                        type="number"
                        min={0}
                        max={bobot}
                        step={0.5}
                        value={skorEssay[kunciSkor] ?? ''}
                        onChange={(e) => setSkorEssay((s) => ({ ...s, [kunciSkor]: e.target.value }))}
                        className="w-20 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-violet-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                      />
                      <Button
                        kecil
                        loading={nilaiEssayId === kunciSkor}
                        onClick={() => simpanNilaiEssay(h, r.soalId, bobot, kunciSkor)}
                      >
                        Simpan Nilai
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </Card>

      {memuat ? (
        <LoadingBlock teks="Memuat rekap..." />
      ) : rows.length === 0 ? (
        <EmptyState judul="Belum ada data" subjudul="Pilih paket lalu tunggu siswa mengerjakan." />
      ) : (
        <>
          <div className="no-print mb-4 grid grid-cols-3 gap-3">
            <Card><p className="text-xs text-slate-400">Selesai</p><p className="font-mono-num text-2xl font-bold">{selesai.length}</p></Card>
            <Card><p className="text-xs text-slate-400">Rata-rata</p><p className="font-mono-num text-2xl font-bold">{rata}</p></Card>
            <Card><p className="text-xs text-slate-400">Peserta</p><p className="font-mono-num text-2xl font-bold">{rows.length}</p></Card>
          </div>

          {/* area cetak */}
          <div id="print-area">
            <KopCetak
              logoUrl={pengaturan.logoUrl}
              namaSekolah={pengaturan.namaSekolah}
              alamat={pengaturan.alamatSekolah}
              telepon={pengaturan.telepon}
              judul="REKAP HASIL UJIAN"
              subJudul={namaPaket}
            />
            <div className="cetak-tabel-wrap overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead>
                  <tr>
                    {['No', 'NIS', 'Nama', 'Kelas', 'Status', 'Nilai', 'Benar'].map((h) => (
                      <th key={h} className="border border-slate-300 bg-slate-100 px-2 py-2 text-left text-xs font-bold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.username}>
                      <td className="border border-slate-200 px-2 py-1.5">{i + 1}</td>
                      <td className="border border-slate-200 px-2 py-1.5">{r.nis}</td>
                      <td className="border border-slate-200 px-2 py-1.5">{r.nama}</td>
                      <td className="border border-slate-200 px-2 py-1.5">{r.kelas}</td>
                      <td className="border border-slate-200 px-2 py-1.5">{r.status}</td>
                      <td className="border border-slate-200 px-2 py-1.5 font-bold">{r.status === 'Selesai' ? r.nilai : '-'}</td>
                      <td className="border border-slate-200 px-2 py-1.5">{r.benar}/{r.totalSoal}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <TtdCetak namaKepala={pengaturan.namaKepala} />
          </div>

          <div className="no-print mt-4">
            <Card>
              <TabelResponsif>
                <table className="w-full min-w-[720px]">
                  <thead>
                    <tr>
                      <th className={thCls}>No</th>
                      <th className={thCls}>Nama</th>
                      <th className={thCls}>Kelas</th>
                      <th className={thCls}>Status</th>
                      <th className={thCls}>Nilai</th>
                      <th className={thCls}>Benar</th>
                      <th className={thCls}>Peringatan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={r.username} className="hover:bg-slate-50">
                        <td className={tdCls}>{i + 1}</td>
                        <td className={tdCls}>
                          <p className="font-semibold">{r.nama}</p>
                          <p className="text-xs text-slate-400">{r.nis}</p>
                        </td>
                        <td className={tdCls}>{r.kelas}</td>
                        <td className={tdCls}>
                          {r.status === 'Selesai' ? (
                            <Badge warna="hijau">Selesai</Badge>
                          ) : r.status === 'Mengerjakan' ? (
                            <Badge warna="biru">Mengerjakan</Badge>
                          ) : r.status === 'Dibatalkan' ? (
                            <Badge warna="merah">Dibatalkan</Badge>
                          ) : (
                            <Badge warna="abu">Belum mulai</Badge>
                          )}
                        </td>
                        <td className={tdCls}>
                          <span className="font-mono-num font-bold">{r.status === 'Selesai' ? r.nilai : '-'}</span>
                        </td>
                        <td className={tdCls}>{r.benar}/{r.totalSoal}</td>
                        <td className={tdCls}>{r.peringatan > 0 ? <Badge warna="kuning">{r.peringatan}×</Badge> : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TabelResponsif>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
