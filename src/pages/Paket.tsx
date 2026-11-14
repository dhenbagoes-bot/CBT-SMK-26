import { useMemo, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import {
  Badge,
  BarAksiMassal,
  Button,
  Card,
  Ceklis,
  ConfirmDialog,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  SelectInput,
  TabelResponsif,
  TextInput,
  tdCls,
  thCls,
  useSeleksi,
} from '../components/ui';
import { Dices } from 'lucide-react';
import { deletePaket, saveKelas, savePaket } from '../services/api';
import { formatTanggalWaktu } from '../utils/format';
import { buatTokenAcak, cekBentrokPaket, normalisasiNamaKelas, uraiNamaKelas } from '../utils/penilaian';
import type { ModeSoal, Paket } from '../types';
import type { PageProps } from './PageProps';

interface FormPaket {
  id?: string;
  nama: string;
  jenjangId: string;
  mapelId: string;
  /** Label jenis ujian (v1.4.0, opsional) — '' = tanpa jenis. */
  jenisUjianId: string;
  /** Target kelas diketik MANUAL (nama dipisah koma). Kosong = semua kelas jenjang ini.
   *  Saat simpan, nama dicocokkan ke data Kelas; nama baru dibuat otomatis. */
  kelasManual: string;
  modeSoal: ModeSoal;
  soalIds: string[];
  jumlahAcak: number;
  durasiMenit: number;
  mulai: string; // datetime-local
  selesai: string; // datetime-local
  acakSoal: boolean;
  acakOpsi: boolean;
  tampilSkor: boolean;
  tampilPembahasan: boolean;
  aktif: boolean;
  /** Token ujian (6 karakter) — wajib diisi siswa saat mulai ujian. */
  token: string;
  /** Jeda gelombang antar kelas saat mulai ujian (menit). */
  jedaGelombang: number;
}

const FORM_KOSONG: FormPaket = {
  nama: '',
  jenjangId: '',
  mapelId: '',
  jenisUjianId: '',
  kelasManual: '',
  modeSoal: 'manual',
  soalIds: [],
  jumlahAcak: 10,
  durasiMenit: 60,
  mulai: '',
  selesai: '',
  acakSoal: true,
  acakOpsi: true,
  tampilSkor: true,
  tampilPembahasan: true,
  aktif: true,
  token: '',
  jedaGelombang: 3,
};

/** "yyyy-MM-ddTHH:mm" -> "yyyy-MM-dd HH:mm:00" (wire format). */
function dtKeWire(dt: string): string {
  return dt ? dt.replace('T', ' ') + ':00' : '';
}
/** "yyyy-MM-dd HH:mm:ss" -> "yyyy-MM-ddTHH:mm". */
function wireKeDt(w: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})/.exec((w || '').trim());
  return m ? `${m[1]}T${m[2]}:${m[3]}` : '';
}

export default function Paket({ data, pengaturan, toast, refreshData }: PageProps) {
  const [formBuka, setFormBuka] = useState(false);
  const [form, setForm] = useState<FormPaket>(FORM_KOSONG);
  const [simpanLoading, setSimpanLoading] = useState(false);
  const [hapusId, setHapusId] = useState<string | null>(null);
  const [cariSoal, setCariSoal] = useState('');
  const sel = useSeleksi();
  const [hapusMassalBuka, setHapusMassalBuka] = useState(false);

  const mapelForm = useMemo(
    () => data.mapel.filter((m) => !form.jenjangId || m.jenjangId === form.jenjangId),
    [data.mapel, form.jenjangId]
  );
  /** ID kelas hasil pencocokan nama yang diketik manual dengan data Kelas
   *  (jenjang sama, abaikan huruf besar/kecil & spasi berlebih). Nama yang
   *  belum ada tidak punya ID di sini — dibuat saat simpan. Kosong = semua kelas. */
  const kelasIdsEfektif = useMemo(() => {
    const namaDiketik = uraiNamaKelas(form.kelasManual);
    if (namaDiketik.length === 0) return [] as string[];
    const ids: string[] = [];
    for (const nama of namaDiketik) {
      const cocok = data.kelas.find(
        (k) => k.jenjangId === form.jenjangId && normalisasiNamaKelas(k.nama) === normalisasiNamaKelas(nama),
      );
      if (cocok) ids.push(cocok.id);
    }
    return ids;
  }, [data.kelas, form.jenjangId, form.kelasManual]);
  const bankForm = useMemo(() => {
    const q = cariSoal.trim().toLowerCase();
    return data.bankSoal
      .filter((s) => !form.jenjangId || s.jenjangId === form.jenjangId)
      .filter((s) => !form.mapelId || s.mapelId === form.mapelId)
      .filter((s) => !q || s.soal.toLowerCase().includes(q));
  }, [data.bankSoal, form.jenjangId, form.mapelId, cariSoal]);

  const bukaTambah = () => {
    setForm({ ...FORM_KOSONG, durasiMenit: pengaturan.durasiStandar || 60, token: buatTokenAcak() });
    setCariSoal('');
    setFormBuka(true);
  };
  const bukaUbah = (p: Paket) => {
    setForm({
      id: p.id,
      nama: p.nama,
      jenjangId: p.jenjangId,
      mapelId: p.mapelId,
      jenisUjianId: p.jenisUjianId || '',
      kelasManual: (p.kelasIds || [])
        .map((id) => data.kelas.find((k) => k.id === id)?.nama || '')
        .filter(Boolean)
        .join(', '),
      modeSoal: p.modeSoal,
      soalIds: p.soalIds || [],
      jumlahAcak: p.jumlahAcak || 10,
      durasiMenit: p.durasiMenit,
      mulai: wireKeDt(p.mulai),
      selesai: wireKeDt(p.selesai),
      acakSoal: p.acakSoal === 1,
      acakOpsi: p.acakOpsi === 1,
      tampilSkor: p.tampilSkor === 1,
      tampilPembahasan: p.tampilPembahasan === 1,
      aktif: p.aktif === 1,
      token: p.token || '',
      jedaGelombang: p.jedaGelombang || 3,
    });
    setCariSoal('');
    setFormBuka(true);
  };

  const toggle = (arr: string[], id: string) =>
    arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id];

  const simpan = async () => {
    if (!form.nama.trim()) return toast('Nama jadwal wajib diisi.', 'error');
    if (!form.jenjangId || !form.mapelId) return toast('Pilih jenjang dan mapel.', 'error');
    if (form.durasiMenit < 5 || form.durasiMenit > 300)
      return toast('Durasi harus 5–300 menit.', 'error');
    if (!form.mulai || !form.selesai) return toast('Jendela mulai–selesai wajib diisi.', 'error');
    if (form.selesai <= form.mulai) return toast('Waktu selesai harus setelah waktu mulai.', 'error');
    if (form.modeSoal === 'manual' && form.soalIds.length === 0)
      return toast('Mode manual: pilih minimal 1 soal dari bank.', 'error');
    if (form.modeSoal === 'acak' && form.jumlahAcak < 1)
      return toast('Jumlah soal acak minimal 1.', 'error');
    if (form.modeSoal === 'acak' && form.jumlahAcak > bankForm.length)
      return toast(`Bank hanya punya ${bankForm.length} soal untuk jenjang+mapel ini.`, 'error');
    if (!form.token.trim()) return toast('Token ujian wajib diisi (atau tekan tombol dadu untuk token acak).', 'error');
    if (form.token.trim().length < 4) return toast('Token ujian minimal 4 karakter.', 'error');
    if (form.jedaGelombang < 0 || form.jedaGelombang > 60)
      return toast('Jeda gelombang harus 0–60 menit.', 'error');

    setSimpanLoading(true);
    try {
      // Selesaikan dulu target kelas manual: cocokkan tiap nama ke data Kelas
      // (jenjang sama); nama yang belum ada dibuat otomatis sebagai Kelas baru.
      const kelasIds: string[] = [];
      for (const nama of uraiNamaKelas(form.kelasManual)) {
        const cocok = data.kelas.find(
          (k) => k.jenjangId === form.jenjangId && normalisasiNamaKelas(k.nama) === normalisasiNamaKelas(nama),
        );
        if (cocok) {
          kelasIds.push(cocok.id);
        } else {
          try {
            const baru = await saveKelas({ jenjangId: form.jenjangId, nama });
            kelasIds.push(baru.id);
          } catch (errKelas) {
            // Data kelas lokal mungkin kedaluwarsa (kelas sudah dibuat orang lain):
            // segarkan data agar percobaan simpan berikutnya cocok, lalu sampaikan galatnya.
            await refreshData().catch(() => {});
            throw errKelas;
          }
        }
      }

      const { id, ...rest } = form;
      await savePaket({
        ...(id ? { id } : {}),
        nama: rest.nama.trim(),
        jenjangId: rest.jenjangId,
        mapelId: rest.mapelId,
        jenisUjianId: rest.jenisUjianId || '',
        kelasIds,
        modeSoal: rest.modeSoal,
        soalIds: rest.modeSoal === 'manual' ? rest.soalIds : [],
        jumlahAcak: rest.modeSoal === 'acak' ? rest.jumlahAcak : 0,
        durasiMenit: rest.durasiMenit,
        mulai: dtKeWire(rest.mulai),
        selesai: dtKeWire(rest.selesai),
        acakSoal: rest.acakSoal ? 1 : 0,
        acakOpsi: rest.acakOpsi ? 1 : 0,
        tampilSkor: rest.tampilSkor ? 1 : 0,
        tampilPembahasan: rest.tampilPembahasan ? 1 : 0,
        aktif: rest.aktif ? 1 : 0,
        tokenUjian: rest.token.trim(),
        jedaGelombang: rest.jedaGelombang,
      });
      toast('Jadwal tersimpan.', 'sukses');
      setFormBuka(false);
      await refreshData();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal menyimpan.', 'error');
    } finally {
      setSimpanLoading(false);
    }
  };

  const hapus = async () => {
    if (!hapusId) return;
    try {
      await deletePaket(hapusId);
      toast('Jadwal dihapus.', 'sukses');
      sel.aturBanyak([hapusId], false);
      setHapusId(null);
      await refreshData();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal menghapus.', 'error');
    }
  };

  /** Hapus massal (v1.3.1): hapus satu per satu, laporkan yang gagal per jadwal. */
  const hapusMassal = async () => {
    setHapusMassalBuka(false);
    const ids = [...sel.terpilih];
    let okCount = 0;
    const gagal: string[] = [];
    for (const id of ids) {
      const nama = data.paket.find((p) => p.id === id)?.nama || id;
      try {
        await deletePaket(id);
        okCount++;
      } catch (err) {
        gagal.push(`${nama}: ${err instanceof Error ? err.message : 'gagal'}`);
      }
    }
    sel.kosongkan();
    await refreshData();
    toast(
      `Hapus massal: ${okCount} jadwal dihapus${gagal.length ? `, ${gagal.length} gagal — ${gagal.slice(0, 3).join(' | ')}` : ''}.`,
      gagal.length ? 'error' : 'sukses',
    );
  };

  const ubahTerpilih = () => {
    const id = [...sel.terpilih][0];
    const p = data.paket.find((x) => x.id === id);
    if (p) bukaUbah(p);
  };

  // Pembaruan FUNGSIONAL (v1.3.1): beberapa handler memanggil ubah() berurutan
  // (mis. ganti jenjang sekaligus mengosongkan mapel/kelas/soal). Dengan
  // setForm({ ...form }) semua panggilan menyebar state lama yang sama dan
  // hanya yang terakhir yang berlaku — dropdown jenjang/mapel tampak "tidak
  // bisa diklik". Dengan updater fungsional, tiap panggilan menumpuk benar.
  const ubah = <K extends keyof FormPaket>(k: K, v: FormPaket[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  // Peringatan anti-bentrok (frontend): kelas yang sama, hari & jam tumpang tindih.
  // Backend juga menolak saat simpan — error backend ditampilkan apa adanya.
  const bentrok = useMemo(() => {
    if (!formBuka || !form.mulai || !form.selesai || !form.jenjangId) return { bentrok: false, dengan: [] as string[] };
    return cekBentrokPaket(
      {
        jenjangId: form.jenjangId,
        kelasIds: kelasIdsEfektif,
        mulai: dtKeWire(form.mulai),
        selesai: dtKeWire(form.selesai),
      },
      data.paket,
      form.id
    );
  }, [formBuka, form, data.paket, kelasIdsEfektif]);

  return (
    <div>
      <PageHeader
        judul="Jadwal Ujian"
        subjudul={`${data.paket.length} jadwal — tiap ujian memakai token sendiri.`}
        aksi={
          <Button onClick={bukaTambah}>
            <Plus className="h-4 w-4" /> Buat Jadwal
          </Button>
        }
      />

      {data.paket.length === 0 ? (
        <EmptyState judul="Belum ada jadwal" subjudul="Buat jadwal ujian di sini." />
      ) : (
        <>
          <BarAksiMassal
            jumlah={sel.terpilih.size}
            onUbah={ubahTerpilih}
            onHapus={() => setHapusMassalBuka(true)}
            onBatal={sel.kosongkan}
          />
          <Card>
          <TabelResponsif>
            <table className="w-full min-w-[720px]">
              <thead>
                <tr>
                  <th className={thCls}>
                    <Ceklis
                      checked={data.paket.length > 0 && data.paket.every((p) => sel.terpilih.has(p.id))}
                      onChange={(v) => sel.aturBanyak(data.paket.map((p) => p.id), v)}
                      label="Pilih semua jadwal"
                    />
                  </th>
                  <th className={thCls}>Nama</th>
                  <th className={thCls}>Mapel</th>
                  <th className={thCls}>Token</th>
                  <th className={thCls}>Soal</th>
                  <th className={thCls}>Durasi</th>
                  <th className={thCls}>Jendela</th>
                  <th className={thCls}>Status</th>
                  <th className={thCls}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {data.paket.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800 dark:bg-slate-800">
                    <td className={tdCls}>
                      <Ceklis checked={sel.terpilih.has(p.id)} onChange={() => sel.toggle(p.id)} label={`Pilih ${p.nama}`} />
                    </td>
                    <td className={tdCls}>
                      <p className="font-semibold text-slate-900 dark:text-slate-100">{p.nama}</p>
                      <p className="text-xs text-slate-400">
                        {p.modeSoal === 'manual' ? 'Manual' : `Acak (${p.jumlahAcak})`}
                        {p.acakSoal === 1 ? ' • acak urutan' : ''}
                        {p.acakOpsi === 1 ? ' • acak opsi' : ''}
                        {p.jenisUjianId
                          ? ` • ${data.jenisUjian.find((j) => j.id === p.jenisUjianId)?.nama || ''}`
                          : ''}
                      </p>
                    </td>
                    <td className={tdCls}>{data.mapel.find((m) => m.id === p.mapelId)?.nama || '-'}</td>
                    <td className={tdCls}>
                      <code className="rounded bg-slate-100 dark:bg-slate-800 px-2 py-0.5 font-mono-num text-xs font-bold tracking-widest text-slate-700 dark:text-slate-200 dark:bg-slate-800 dark:text-slate-200">
                        {p.token || '—'}
                      </code>
                    </td>
                    <td className={tdCls}>{p.jumlahSoal}</td>
                    <td className={tdCls}>{p.durasiMenit} mnt</td>
                    <td className={tdCls}>
                      <p className="whitespace-nowrap text-xs">{formatTanggalWaktu(p.mulai)}</p>
                      <p className="whitespace-nowrap text-xs text-slate-400">s.d. {formatTanggalWaktu(p.selesai)}</p>
                    </td>
                    <td className={tdCls}>
                      {p.aktif === 1 ? <Badge warna="hijau">Aktif</Badge> : <Badge warna="abu">Nonaktif</Badge>}
                    </td>
                    <td className={tdCls}>
                      <div className="flex gap-1">
                        <button onClick={() => bukaUbah(p)} className="rounded-lg p-1.5 text-blue-600 hover:bg-blue-50" title="Ubah">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button onClick={() => setHapusId(p.id)} className="rounded-lg p-1.5 text-red-600 hover:bg-red-50" title="Hapus">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TabelResponsif>
          </Card>
        </>
      )}

      {hapusMassalBuka && (
        <ConfirmDialog
          judul={`Hapus ${sel.terpilih.size} jadwal?`}
          pesan="Jadwal terpilih akan dihapus. Sesi & hasil yang sudah ada tidak ikut terhapus."
          onYa={hapusMassal}
          onBatal={() => setHapusMassalBuka(false)}
        />
      )}

      {formBuka && (
        <Modal judul={form.id ? 'Ubah Jadwal' : 'Buat Jadwal Ujian'} onTutup={() => setFormBuka(false)} lebar="max-w-3xl">
          <div className="space-y-4">
            <Field label="Nama jadwal">
              <TextInput value={form.nama} onChange={(e) => ubah('nama', e.target.value)} placeholder="cth: PTS 1 — Bahasa Inggris" />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Jenjang">
                <SelectInput value={form.jenjangId} onChange={(e) => { ubah('jenjangId', e.target.value); ubah('mapelId', ''); ubah('kelasManual', ''); ubah('soalIds', []); }}>
                  <option value="">— Pilih —</option>
                  {data.jenjang.map((j) => (
                    <option key={j.id} value={j.id}>{j.nama}</option>
                  ))}
                </SelectInput>
              </Field>
              <Field label="Mapel">
                <SelectInput value={form.mapelId} onChange={(e) => { ubah('mapelId', e.target.value); ubah('soalIds', []); }}>
                  <option value="">— Pilih —</option>
                  {mapelForm.map((m) => (
                    <option key={m.id} value={m.id}>{m.nama}</option>
                  ))}
                </SelectInput>
              </Field>
            </div>

            <Field label="Jenis ujian (opsional)">
              <SelectInput value={form.jenisUjianId} onChange={(e) => ubah('jenisUjianId', e.target.value)}>
                <option value="">— Tanpa jenis —</option>
                {data.jenisUjian.map((j) => (
                  <option key={j.id} value={j.id}>{j.nama}</option>
                ))}
              </SelectInput>
              <p className="mt-1 text-xs text-slate-400">
                Label ujian ini, mis. Ulangan Harian atau PTS. Daftarnya dikelola di menu Jenis Ujian.
              </p>
            </Field>

            <Field label="Target kelas (ketik manual)">
              <TextInput
                value={form.kelasManual}
                onChange={(e) => ubah('kelasManual', e.target.value)}
                placeholder="cth: X AKL 1, X AKL 2 (kosongkan = semua kelas jenjang ini)"
              />
              <p className="mt-1 text-xs text-slate-400">
                Ketik nama kelas dipisah koma. Kelas yang belum ada akan dibuat otomatis di jenjang
                ini saat jadwal disimpan. Kosongkan bila jadwal berlaku untuk semua kelas jenjang ini.
              </p>
            </Field>

            <div>
              <span className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-200">Mode pengambilan soal</span>
              <div className="flex gap-2">
                {(['manual', 'acak'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => ubah('modeSoal', m)}
                    className={`flex-1 rounded-xl border px-4 py-2.5 text-sm font-bold transition ${
                      form.modeSoal === m ? 'border-violet-600 bg-violet-50 text-violet-700' : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {m === 'manual' ? 'Manual (pilih soal)' : 'Acak (dari bank)'}
                  </button>
                ))}
              </div>
            </div>

            {form.modeSoal === 'manual' ? (
              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    Pilih soal ({form.soalIds.length} dipilih)
                  </span>
                  <div className="w-48">
                    <TextInput value={cariSoal} onChange={(e) => setCariSoal(e.target.value)} placeholder="Cari soal..." />
                  </div>
                </div>
                {bankForm.length === 0 ? (
                  <EmptyState judul="Tidak ada soal" subjudul="Isi bank soal dulu untuk jenjang+mapel ini." />
                ) : (
                  <div className="max-h-64 space-y-1.5 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 p-2">
                    {bankForm.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => ubah('soalIds', toggle(form.soalIds, s.id))}
                        className={`flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${
                          form.soalIds.includes(s.id) ? 'bg-violet-100' : 'hover:bg-slate-50 dark:hover:bg-slate-800 dark:bg-slate-800'
                        }`}
                      >
                        <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] font-bold ${
                          form.soalIds.includes(s.id) ? 'border-violet-600 bg-violet-600 text-white' : 'border-slate-300 text-transparent'
                        }`}>✓</span>
                        <span className="text-slate-700 dark:text-slate-200">{s.soal}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <Field label={`Jumlah soal acak (bank tersedia: ${bankForm.length})`}>
                <TextInput
                  type="number"
                  min={1}
                  max={Math.max(1, bankForm.length)}
                  value={form.jumlahAcak}
                  onChange={(e) => ubah('jumlahAcak', Math.max(1, parseInt(e.target.value, 10) || 1))}
                />
              </Field>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Token ujian (dibagikan ke siswa)">
                <div className="flex gap-2">
                  <TextInput
                    value={form.token}
                    onChange={(e) => ubah('token', e.target.value.toUpperCase().replace(/\s/g, ''))}
                    placeholder="cth: K7X2PQ"
                    className="font-mono-num tracking-widest"
                  />
                  <Button varian="sekunder" kecil onClick={() => ubah('token', buatTokenAcak())}>
                    <Dices className="h-4 w-4" /> Acak
                  </Button>
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  Token berbeda tiap ujian/mapel. Siswa wajib memasukkan token ini sebelum mulai.
                </p>
              </Field>
              <Field label="Jeda gelombang antar kelas (menit)">
                <TextInput
                  type="number"
                  min={0}
                  max={60}
                  value={form.jedaGelombang}
                  onChange={(e) => ubah('jedaGelombang', parseInt(e.target.value, 10) || 0)}
                />
                <p className="mt-1 text-xs text-slate-400">
                  Mulai ujian per kelas dijeda {form.jedaGelombang} menit agar tidak 1000 siswa menekan Mulai bersamaan.
                </p>
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Durasi (menit)">
                <TextInput
                  type="number"
                  min={5}
                  max={300}
                  value={form.durasiMenit}
                  onChange={(e) => ubah('durasiMenit', parseInt(e.target.value, 10) || 0)}
                />
                <p className="mt-1 text-xs text-slate-400">
                  Nilai awal dari durasi standar di Pengaturan ({pengaturan.durasiStandar || 60} menit) — bisa diubah per ujian.
                </p>
              </Field>
              <Field label="Mulai">
                <TextInput type="datetime-local" value={form.mulai} onChange={(e) => ubah('mulai', e.target.value)} />
              </Field>
              <Field label="Selesai">
                <TextInput type="datetime-local" value={form.selesai} onChange={(e) => ubah('selesai', e.target.value)} />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {(
                [
                  ['acakSoal', 'Acak urutan soal'],
                  ['acakOpsi', 'Acak urutan opsi'],
                  ['tampilSkor', 'Tampil skor'],
                  ['tampilPembahasan', 'Tampil pembahasan'],
                  ['aktif', 'Aktif'],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => ubah(k, !form[k] as never)}
                  className={`rounded-xl border px-3 py-2.5 text-xs font-bold transition ${
                    form[k] ? 'border-violet-600 bg-violet-50 text-violet-700' : 'border-slate-200 dark:border-slate-700 text-slate-400'
                  }`}
                >
                  {form[k] ? '✓ ' : ''}{label}
                </button>
              ))}
            </div>

            {bentrok.bentrok && (
              <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                ⚠ Jadwal bentrok dengan: <b>{bentrok.dengan.join(', ')}</b> (kelas &amp; jam yang sama di hari yang sama).
                Ubah jam/kelas, atau simpan tetap — backend akan menolak bila benar-benar bentrok.
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button varian="sekunder" onClick={() => setFormBuka(false)}>Batal</Button>
              <Button onClick={simpan} loading={simpanLoading}>Simpan Jadwal</Button>
            </div>
          </div>
        </Modal>
      )}

      {hapusId && (
        <ConfirmDialog
          judul="Hapus jadwal?"
          pesan="Jadwal akan dihapus. Sesi & hasil yang sudah ada tidak ikut terhapus."
          onYa={hapus}
          onBatal={() => setHapusId(null)}
        />
      )}
    </div>
  );
}
