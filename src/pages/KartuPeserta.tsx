import { useMemo, useState } from 'react';
import { Printer } from 'lucide-react';
import {
  Button,
  Card,
  EmptyState,
  Field,
  PageHeader,
  SelectInput,
  TabelResponsif,
  tdCls,
  thCls,
} from '../components/ui';
import { formatTanggalWaktu } from '../utils/format';
import type { PageProps } from './PageProps';

/** Cetak Kartu Peserta (v1.4.0): kartu ujian per siswa untuk satu jadwal —
 *  nama, NIS, kelas, mapel, jenis ujian, jadwal, dan token ujian. */
export default function KartuPeserta({ data, toast }: PageProps) {
  const [paketId, setPaketId] = useState(data.paket[0]?.id || '');
  const paket = data.paket.find((p) => p.id === paketId);

  const peserta = useMemo(() => {
    if (!paket) return [];
    const semuaKelas = (paket.kelasIds || []).length === 0;
    return data.pengguna
      .filter((p) => p.peran === 'siswa' && p.aktif === 1)
      .filter((p) => p.jenjangId === paket.jenjangId)
      .filter((p) => semuaKelas || (paket.kelasIds || []).includes(p.kelasId))
      .sort((a, b) => {
        const ka = data.kelas.find((k) => k.id === a.kelasId)?.nama || '';
        const kb = data.kelas.find((k) => k.id === b.kelasId)?.nama || '';
        return ka.localeCompare(kb) || a.nama.localeCompare(b.nama);
      });
  }, [data.pengguna, data.kelas, paket]);

  const namaMapel = paket ? data.mapel.find((m) => m.id === paket.mapelId)?.nama || '-' : '-';
  const namaJenis = paket?.jenisUjianId
    ? data.jenisUjian.find((j) => j.id === paket.jenisUjianId)?.nama || ''
    : '';
  const namaKelas = (id: string) => data.kelas.find((k) => k.id === id)?.nama || '-';

  const cetak = () => {
    if (!paket || peserta.length === 0) return toast('Tidak ada kartu untuk dicetak.', 'error');
    window.print();
  };

  return (
    <div>
      <div className="no-print">
        <PageHeader
          judul="Cetak Kartu Peserta"
          subjudul="Kartu ujian per siswa — berisi jadwal dan token ujian. Pilih jadwal, lalu cetak."
          aksi={
            <Button onClick={cetak} disabled={!paket || peserta.length === 0}>
              <Printer className="h-4 w-4" /> Cetak {peserta.length > 0 ? `(${peserta.length} kartu)` : ''}
            </Button>
          }
        />
      </div>

      <Card className="no-print mb-4">
        <Field label="Jadwal ujian">
          <SelectInput value={paketId} onChange={(e) => setPaketId(e.target.value)}>
            {data.paket.length === 0 && <option value="">— Belum ada jadwal —</option>}
            {data.paket.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nama} — {data.mapel.find((m) => m.id === p.mapelId)?.nama || '-'}
              </option>
            ))}
          </SelectInput>
        </Field>
        {paket && (
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            {namaMapel}
            {namaJenis ? ` • ${namaJenis}` : ''} • {formatTanggalWaktu(paket.mulai)} s.d.{' '}
            {formatTanggalWaktu(paket.selesai)} • {paket.durasiMenit} menit • Token:{' '}
            <code className="font-mono-num font-bold tracking-widest">{paket.token || '—'}</code> •{' '}
            {peserta.length} peserta
            {(paket.kelasIds || []).length === 0 ? ' (semua kelas jenjang ini)' : ''}
          </p>
        )}
      </Card>

      {!paket ? (
        <EmptyState judul="Belum ada jadwal" subjudul="Buat jadwal ujian dulu di menu Jadwal Ujian." />
      ) : peserta.length === 0 ? (
        <EmptyState
          judul="Belum ada peserta"
          subjudul="Belum ada siswa aktif untuk jenjang/kelas jadwal ini. Tambahkan siswa di menu Data Siswa."
        />
      ) : (
        <>
          <div className="no-print mb-4">
            <Card>
              <TabelResponsif>
                <table className="w-full min-w-[480px]">
                  <thead>
                    <tr>
                      <th className={thCls}>No</th>
                      <th className={thCls}>Nama</th>
                      <th className={thCls}>NIS</th>
                      <th className={thCls}>Kelas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {peserta.map((p, i) => (
                      <tr key={p.id}>
                        <td className={tdCls}>{i + 1}</td>
                        <td className={tdCls}>{p.nama}</td>
                        <td className={tdCls}>{p.nis || '-'}</td>
                        <td className={tdCls}>{namaKelas(p.kelasId)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TabelResponsif>
            </Card>
          </div>

          {/* Pratinjau kartu (sekaligus area cetak). */}
          <div id="area-kartu" className="grid gap-4 sm:grid-cols-2">
            {peserta.map((p) => (
              <div
                key={p.id}
                className="kartu-peserta break-inside-avoid rounded-2xl border-2 border-slate-800 bg-white p-4 text-slate-900"
              >
                <div className="border-b-2 border-slate-800 pb-2 text-center">
                  <p className="text-sm font-bold uppercase tracking-wide">
                    {data.pengaturan.namaSekolah || 'CBT Digital'}
                  </p>
                  <p className="text-xs font-bold tracking-widest text-slate-600">KARTU PESERTA UJIAN</p>
                </div>
                <dl className="mt-3 space-y-1 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">Nama</dt>
                    <dd className="text-right font-bold">{p.nama}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">NIS</dt>
                    <dd className="font-mono-num text-right font-semibold">{p.nis || '-'}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">Kelas</dt>
                    <dd className="text-right font-semibold">{namaKelas(p.kelasId)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">Mapel</dt>
                    <dd className="text-right font-semibold">{namaMapel}</dd>
                  </div>
                  {namaJenis && (
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-500">Jenis Ujian</dt>
                      <dd className="text-right font-semibold">{namaJenis}</dd>
                    </div>
                  )}
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">Jadwal</dt>
                    <dd className="text-right font-semibold">
                      {formatTanggalWaktu(paket.mulai)} s.d. {formatTanggalWaktu(paket.selesai)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">Durasi</dt>
                    <dd className="text-right font-semibold">{paket.durasiMenit} menit</dd>
                  </div>
                </dl>
                <div className="mt-3 rounded-xl bg-slate-100 py-2 text-center">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">
                    Token Ujian
                  </p>
                  <p className="font-mono-num text-xl font-bold tracking-[0.3em]">
                    {paket.token || '—'}
                  </p>
                </div>
                <p className="mt-2 text-center text-[11px] text-slate-400">
                  Tunjukkan kartu ini saat ujian. Jaga kerahasiaan token Anda.
                </p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
