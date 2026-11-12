import { useMemo, useState } from 'react';
import { Printer } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  KopCetak,
  PageHeader,
  SelectInput,
  TtdCetak,
} from '../components/ui';
import type { PageProps } from './PageProps';

export default function Laporan({ data, pengaturan }: PageProps) {
  const [paketId, setPaketId] = useState(data.paket[0]?.id || '');
  const [kelas, setKelas] = useState('');

  const kkm = pengaturan.kkm ?? 75;
  const paket = data.paket.find((p) => p.id === paketId);

  const hasilPaket = useMemo(
    () => data.hasil.filter((h) => h.paketId === paketId && (!kelas || h.kelas === kelas)),
    [data.hasil, paketId, kelas]
  );

  const daftarKelas = useMemo(() => {
    const s = new Set<string>();
    for (const h of data.hasil) {
      if (h.paketId === paketId && h.kelas) s.add(h.kelas);
    }
    return [...s].sort();
  }, [data.hasil, paketId]);

  const terurut = useMemo(
    () => [...hasilPaket].sort((a, b) => a.namaSiswa.localeCompare(b.namaSiswa)),
    [hasilPaket]
  );

  const nilai = terurut.map((h) => h.nilai);
  const rata = nilai.length ? Math.round((nilai.reduce((a, b) => a + b, 0) / nilai.length) * 10) / 10 : 0;
  const tertinggi = nilai.length ? Math.max(...nilai) : 0;
  const terendah = nilai.length ? Math.min(...nilai) : 0;
  const tuntas = nilai.filter((n) => n >= kkm).length;
  const pctTuntas = nilai.length ? Math.round((tuntas / nilai.length) * 1000) / 10 : 0;
  const tanggalCetak = new Date().toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div>
      <PageHeader
        judul="Laporan Nilai"
        subjudul="Pratinjau laporan hasil ujian — cetak atau simpan sebagai PDF."
        aksi={
          terurut.length > 0 && (
            <Button onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> Cetak / Simpan PDF
            </Button>
          )
        }
      />

      <Card className="no-print mb-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Paket (wajib)">
            <SelectInput value={paketId} onChange={(e) => { setPaketId(e.target.value); setKelas(''); }}>
              {data.paket.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nama}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Kelas (opsional)">
            <SelectInput value={kelas} onChange={(e) => setKelas(e.target.value)}>
              <option value="">Semua kelas</option>
              {daftarKelas.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </SelectInput>
          </Field>
        </div>
      </Card>

      {!paket ? (
        <EmptyState judul="Pilih paket dulu" subjudul="Belum ada paket ujian yang dipilih." />
      ) : terurut.length === 0 ? (
        <EmptyState judul="Belum ada hasil" subjudul="Belum ada siswa yang menyelesaikan paket ini." />
      ) : (
        <>
          <div className="no-print mb-3 rounded-xl bg-sky-50 px-4 py-3 text-sm text-sky-800">
            Di dialog cetak, pilih tujuan <b>“Simpan sebagai PDF”</b> untuk mengunduh laporan
            dalam format PDF. Area di bawah ini adalah tampilan persis yang akan dicetak.
          </div>

          {/* ===== area cetak ===== */}
          <div id="area-cetak" className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <KopCetak
              logoUrl={pengaturan.logoUrl}
              namaSekolah={pengaturan.namaSekolah}
              alamat={pengaturan.alamatSekolah}
              telepon={pengaturan.telepon}
              judul="LAPORAN HASIL UJIAN"
              subJudul={paket.nama}
            />
            <div className="mb-4 grid gap-1 text-sm text-slate-700">
              <p>
                <span className="inline-block w-32 font-semibold">Kelas</span>: {kelas || 'Semua kelas'}
              </p>
              <p>
                <span className="inline-block w-32 font-semibold">Tanggal cetak</span>: {tanggalCetak}
              </p>
              <p>
                <span className="inline-block w-32 font-semibold">KKM</span>: {kkm}
              </p>
            </div>

            <div className="cetak-tabel-wrap overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead>
                  <tr>
                    {['No', 'Nama', 'Kelas', 'Benar', 'Salah', 'Kosong', 'Nilai', 'Ketuntasan'].map((h) => (
                      <th
                        key={h}
                        className="border border-slate-300 bg-slate-100 px-2 py-2 text-left text-xs font-bold"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {terurut.map((h, i) => (
                    <tr key={h.id}>
                      <td className="border border-slate-200 px-2 py-1.5">{i + 1}</td>
                      <td className="border border-slate-200 px-2 py-1.5">{h.namaSiswa}</td>
                      <td className="border border-slate-200 px-2 py-1.5">{h.kelas}</td>
                      <td className="border border-slate-200 px-2 py-1.5 text-center">{h.benar}</td>
                      <td className="border border-slate-200 px-2 py-1.5 text-center">{h.salah}</td>
                      <td className="border border-slate-200 px-2 py-1.5 text-center">{h.kosong}</td>
                      <td className="border border-slate-200 px-2 py-1.5 text-center font-bold">{h.nilai}</td>
                      <td className="border border-slate-200 px-2 py-1.5 text-center">
                        {h.nilai >= kkm ? 'T' : 'TT'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
              <p className="mb-2 font-bold text-slate-900">Ringkasan</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <p>Rata-rata: <b className="font-mono-num">{rata}</b></p>
                <p>Tertinggi: <b className="font-mono-num">{tertinggi}</b></p>
                <p>Terendah: <b className="font-mono-num">{terendah}</b></p>
                <p>% Tuntas: <b className="font-mono-num">{pctTuntas}%</b> ({tuntas}/{nilai.length})</p>
              </div>
            </div>

            <TtdCetak namaKepala={pengaturan.namaKepala} />
          </div>
        </>
      )}

      {terurut.length > 0 && (
        <p className="no-print mt-3 text-center text-xs text-slate-400">
          Keterangan ketuntasan: <Badge warna="hijau">T</Badge> = tuntas (≥ KKM {kkm}),{' '}
          <Badge warna="merah">TT</Badge> = belum tuntas.
        </p>
      )}
    </div>
  );
}
