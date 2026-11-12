import { useMemo, useRef, useState } from 'react';
import { Download, FileUp, Link2, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  SelectInput,
  TabelResponsif,
  TextAreaInput,
  TextInput,
  tdCls,
  thCls,
} from '../components/ui';
import {
  deleteSoal,
  importSoal,
  importSoalDariForm,
  saveSoal,
  uploadGambarSoal,
} from '../services/api';
import {
  parseFileSoal,
  unduhTemplateDocx,
  unduhTemplateTxt,
  unduhTemplateXlsx,
  type BarisSoalImpor,
} from '../utils/imporSoal';
import { LABEL_JENIS_SOAL, SEMUA_JENIS_SOAL, normalisasiSoalBank, type JenisSoal, type SoalBank } from '../types';
import type { PageProps } from './PageProps';

interface FormSoal {
  id?: string;
  jenjangId: string;
  mapelId: string;
  soal: string;
  jenis: JenisSoal;
  opsiA: string;
  opsiB: string;
  opsiC: string;
  opsiD: string;
  opsiE: string;
  /** pg: huruf A–E · bs: 'Benar'|'Salah' · isian: teks jawaban */
  kunci: string;
  /** pgk: huruf-huruf kunci yang dicentang */
  kunciPgk: string[];
  /** jodoh: satu pasangan per baris textarea */
  pasanganKiri: string[];
  pasanganKanan: string[];
  kunciJodoh: Record<number, number>;
  bobot: number;
  pembahasan: string;
  gambarUrl: string;
}

const FORM_KOSONG: FormSoal = {
  jenjangId: '',
  mapelId: '',
  soal: '',
  jenis: 'pg',
  opsiA: '',
  opsiB: '',
  opsiC: '',
  opsiD: '',
  opsiE: '',
  kunci: 'A',
  kunciPgk: [],
  pasanganKiri: ['', ''],
  pasanganKanan: ['', ''],
  kunciJodoh: { 0: 0, 1: 1 },
  bobot: 1,
  pembahasan: '',
  gambarUrl: '',
};

function kunciTampil(s: SoalBank): string {
  switch (s.jenis) {
    case 'pg':
      return s.kunci;
    case 'pgk':
      return s.kunci.replace(/,/g, ', ');
    case 'bs':
      return s.kunci;
    case 'jodoh':
      return `${s.pasanganKiri.length} pasangan`;
    case 'isian':
      return s.kunci;
    case 'essay':
      return 'Manual';
    default:
      return s.kunci;
  }
}

export default function BankSoal({ data, toast, refreshData }: PageProps) {
  const [fJenjang, setFJenjang] = useState('');
  const [fMapel, setFMapel] = useState('');
  const [fJenis, setFJenis] = useState('');
  const [cari, setCari] = useState('');
  const [formBuka, setFormBuka] = useState(false);
  const [form, setForm] = useState<FormSoal>(FORM_KOSONG);
  const [simpanLoading, setSimpanLoading] = useState(false);
  const [hapusId, setHapusId] = useState<string | null>(null);
  const [imporBuka, setImporBuka] = useState(false);

  const mapelFilter = useMemo(
    () => data.mapel.filter((m) => !fJenjang || m.jenjangId === fJenjang),
    [data.mapel, fJenjang]
  );
  const mapelForm = useMemo(
    () => data.mapel.filter((m) => !form.jenjangId || m.jenjangId === form.jenjangId),
    [data.mapel, form.jenjangId]
  );

  const daftar = useMemo(() => {
    const q = cari.trim().toLowerCase();
    return data.bankSoal
      .map(normalisasiSoalBank)
      .filter((s) => !fJenjang || s.jenjangId === fJenjang)
      .filter((s) => !fMapel || s.mapelId === fMapel)
      .filter((s) => !fJenis || s.jenis === fJenis)
      .filter((s) => !q || s.soal.toLowerCase().includes(q));
  }, [data.bankSoal, fJenjang, fMapel, fJenis, cari]);

  const namaJenjang = (id: string) => data.jenjang.find((j) => j.id === id)?.nama || '-';
  const namaMapel = (id: string) => data.mapel.find((m) => m.id === id)?.nama || '-';

  const bukaTambah = () => {
    setForm({ ...FORM_KOSONG, jenjangId: fJenjang, mapelId: fMapel });
    setFormBuka(true);
  };
  const bukaUbah = (s: SoalBank) => {
    const n = normalisasiSoalBank(s);
    setForm({
      id: n.id,
      jenjangId: n.jenjangId,
      mapelId: n.mapelId,
      soal: n.soal,
      jenis: n.jenis,
      opsiA: n.opsiA,
      opsiB: n.opsiB,
      opsiC: n.opsiC,
      opsiD: n.opsiD,
      opsiE: n.opsiE || '',
      kunci: n.jenis === 'pg' ? n.kunci : n.jenis === 'bs' ? n.kunci || 'Benar' : n.jenis === 'isian' ? n.kunci : 'A',
      kunciPgk: n.jenis === 'pgk' ? n.kunci.split(',').map((k) => k.trim().toUpperCase()).filter(Boolean) : [],
      pasanganKiri: n.pasanganKiri.length >= 2 ? n.pasanganKiri : ['', ''],
      pasanganKanan: n.pasanganKanan.length >= 2 ? n.pasanganKanan : ['', ''],
      kunciJodoh: n.kunciJodoh,
      bobot: n.bobot || 1,
      pembahasan: n.pembahasan || '',
      gambarUrl: n.gambarUrl || '',
    });
    setFormBuka(true);
  };

  const simpan = async () => {
    if (!form.jenjangId || !form.mapelId) return toast('Pilih jenjang dan mapel.', 'error');
    if (!form.soal.trim()) return toast('Teks soal wajib diisi.', 'error');
    let kunci: string | number[] = '';
    if (form.jenis === 'pg') {
      if (!form.opsiA.trim() || !form.opsiB.trim() || !form.opsiC.trim() || !form.opsiD.trim())
        return toast('Opsi A–D wajib diisi.', 'error');
      const opsiKunci: Record<string, string> = { A: form.opsiA, B: form.opsiB, C: form.opsiC, D: form.opsiD, E: form.opsiE };
      if (!opsiKunci[form.kunci]?.trim()) return toast(`Opsi ${form.kunci} yang jadi kunci kosong.`, 'error');
      kunci = form.kunci;
    } else if (form.jenis === 'pgk') {
      if (!form.opsiA.trim() || !form.opsiB.trim() || !form.opsiC.trim() || !form.opsiD.trim())
        return toast('Opsi A–D wajib diisi.', 'error');
      if (form.kunciPgk.length < 2) return toast('PG Kompleks: centang minimal 2 kunci jawaban.', 'error');
      kunci = form.kunciPgk.join(',');
    } else if (form.jenis === 'bs') {
      if (form.kunci !== 'Benar' && form.kunci !== 'Salah') return toast('Pilih Benar atau Salah.', 'error');
      kunci = form.kunci;
    } else if (form.jenis === 'jodoh') {
      const kiri = form.pasanganKiri.map((x) => x.trim()).filter(Boolean);
      const kanan = form.pasanganKanan.map((x) => x.trim()).filter(Boolean);
      if (kiri.length < 2 || kanan.length < 2) return toast('Menjodohkan: isi minimal 2 pasangan kiri & kanan.', 'error');
      if (kiri.length !== kanan.length) return toast('Menjodohkan: jumlah pasangan kiri & kanan harus sama.', 'error');
      // Backend membaca `kunci` sebagai ARRAY indeks kanan per kiri
      // (field `kunciJodoh` saja tidak cukup — dulu kunci '' sehingga
      // simpan jodoh selalu ditolak backend).
      kunci = kiri.map((_, i) => form.kunciJodoh[i] ?? i);
    } else if (form.jenis === 'isian') {
      if (!form.kunci.trim()) return toast('Kunci isian (teks jawaban) wajib diisi.', 'error');
      kunci = form.kunci.trim();
    } else {
      kunci = '';
    }
    setSimpanLoading(true);
    try {
      const { id, kunciPgk, ...rest } = form;
      void kunciPgk;
      const kiri = rest.pasanganKiri.map((x) => x.trim()).filter(Boolean);
      const kanan = rest.pasanganKanan.map((x) => x.trim()).filter(Boolean);
      await saveSoal({
        ...(id ? { id } : {}),
        jenjangId: rest.jenjangId,
        mapelId: rest.mapelId,
        soal: rest.soal.trim(),
        jenis: rest.jenis,
        opsi: [rest.opsiA, rest.opsiB, rest.opsiC, rest.opsiD, rest.opsiE],
        opsiA: rest.opsiA,
        opsiB: rest.opsiB,
        opsiC: rest.opsiC,
        opsiD: rest.opsiD,
        opsiE: rest.opsiE,
        kunci,
        pasanganKiri: rest.jenis === 'jodoh' ? kiri : [],
        pasanganKanan: rest.jenis === 'jodoh' ? kanan : [],
        kunciJodoh: rest.jenis === 'jodoh' ? rest.kunciJodoh : {},
        bobot: rest.bobot,
        pembahasan: rest.pembahasan,
        gambarUrl: rest.gambarUrl,
      });
      toast('Soal tersimpan.', 'sukses');
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
      await deleteSoal(hapusId);
      toast('Soal dihapus.', 'sukses');
      setHapusId(null);
      await refreshData();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal menghapus.', 'error');
    }
  };

  return (
    <div>
      <PageHeader
        judul="Bank Soal"
        subjudul={`${daftar.length} soal${fJenjang || fMapel || fJenis || cari ? ' (terfilter)' : ''} — 6 jenis soal.`}
        aksi={
          <>
            <Button varian="sekunder" onClick={() => setImporBuka(true)}>
              <FileUp className="h-4 w-4" /> Template &amp; Unggah
            </Button>
            <Button onClick={bukaTambah}>
              <Plus className="h-4 w-4" /> Tambah Soal
            </Button>
          </>
        }
      />

      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Jenjang">
            <SelectInput value={fJenjang} onChange={(e) => { setFJenjang(e.target.value); setFMapel(''); }}>
              <option value="">Semua jenjang</option>
              {data.jenjang.map((j) => (
                <option key={j.id} value={j.id}>{j.nama}</option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Mapel">
            <SelectInput value={fMapel} onChange={(e) => setFMapel(e.target.value)}>
              <option value="">Semua mapel</option>
              {mapelFilter.map((m) => (
                <option key={m.id} value={m.id}>{m.nama}</option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Jenis soal">
            <SelectInput value={fJenis} onChange={(e) => setFJenis(e.target.value)}>
              <option value="">Semua jenis</option>
              {SEMUA_JENIS_SOAL.map((j) => (
                <option key={j} value={j}>{LABEL_JENIS_SOAL[j]}</option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Cari soal">
            <TextInput value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Kata kunci..." />
          </Field>
        </div>
      </Card>

      {daftar.length === 0 ? (
        <EmptyState judul="Belum ada soal" subjudul="Tambah manual atau unggah dari file." />
      ) : (
        <Card>
          <TabelResponsif>
            <table className="w-full min-w-[720px]">
              <thead>
                <tr>
                  <th className={thCls}>No</th>
                  <th className={thCls}>Soal</th>
                  <th className={thCls}>Jenis</th>
                  <th className={thCls}>Jenjang / Mapel</th>
                  <th className={thCls}>Kunci</th>
                  <th className={thCls}>Bobot</th>
                  <th className={thCls}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {daftar.map((s, i) => (
                  <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                    <td className={tdCls}>{i + 1}</td>
                    <td className={tdCls}>
                      <p className="max-w-md truncate" title={s.soal}>{s.soal}</p>
                      {s.gambarUrl && <p className="text-xs text-violet-600">🖼 ada gambar</p>}
                    </td>
                    <td className={tdCls}>
                      <Badge warna={s.jenis === 'pg' ? 'biru' : s.jenis === 'essay' ? 'kuning' : 'ungu'}>
                        {LABEL_JENIS_SOAL[s.jenis]}
                      </Badge>
                    </td>
                    <td className={tdCls}>
                      <p className="text-xs font-semibold">{namaJenjang(s.jenjangId)}</p>
                      <p className="text-xs text-slate-500">{namaMapel(s.mapelId)}</p>
                    </td>
                    <td className={tdCls}>
                      {s.jenis === 'essay' ? (
                        <Badge warna="kuning">Manual</Badge>
                      ) : (
                        <Badge warna="hijau">{kunciTampil(s)}</Badge>
                      )}
                    </td>
                    <td className={tdCls}>{s.bobot}</td>
                    <td className={tdCls}>
                      <div className="flex gap-1">
                        <button onClick={() => bukaUbah(s)} className="rounded-lg p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950" title="Ubah">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button onClick={() => setHapusId(s.id)} className="rounded-lg p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-950" title="Hapus">
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
      )}

      {formBuka && (
        <FormSoalModal
          form={form}
          setForm={setForm}
          mapelForm={mapelForm}
          jenjang={data.jenjang}
          onTutup={() => setFormBuka(false)}
          onSimpan={simpan}
          loading={simpanLoading}
          toast={toast}
        />
      )}

      {hapusId && (
        <ConfirmDialog
          judul="Hapus soal?"
          pesan="Soal akan dihapus dari bank soal. Tidak bisa dibatalkan."
          onYa={hapus}
          onBatal={() => setHapusId(null)}
        />
      )}

      {imporBuka && (
        <ImporSoalModal
          jenjang={data.jenjang}
          mapel={data.mapel}
          onTutup={() => setImporBuka(false)}
          toast={toast}
          refreshData={refreshData}
        />
      )}
    </div>
  );
}

/** Pratinjau soal seperti yang dilihat siswa di ruang ujian (tanpa kunci). */
function PreviewSoal({ form }: { form: FormSoal }) {
  const opsi = [form.opsiA, form.opsiB, form.opsiC, form.opsiD, form.opsiE];
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 dark:border-slate-600 dark:bg-slate-800">
      <p className="mb-2 text-xs font-bold uppercase text-slate-400">Pratinjau (tampilan siswa)</p>
      <p className="whitespace-pre-wrap text-sm font-medium text-slate-900 dark:text-slate-100">{form.soal || '(teks soal kosong)'}</p>
      {form.jenis === 'pg' && (
        <div className="mt-3 space-y-1.5">
          {opsi.filter(Boolean).map((o, i) => (
            <p key={i} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
              {String.fromCharCode(65 + i)}. {o}
            </p>
          ))}
        </div>
      )}
      {form.jenis === 'pgk' && (
        <div className="mt-3 space-y-1.5">
          {opsi.filter(Boolean).map((o, i) => (
            <p key={i} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
              ☐ {String.fromCharCode(65 + i)}. {o}
            </p>
          ))}
          <p className="text-xs text-slate-400">Siswa boleh memilih lebih dari satu jawaban.</p>
        </div>
      )}
      {form.jenis === 'bs' && (
        <div className="mt-3 flex gap-2">
          <span className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white">Benar</span>
          <span className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white">Salah</span>
        </div>
      )}
      {form.jenis === 'jodoh' && (
        <div className="mt-3 space-y-1.5">
          {form.pasanganKiri.filter(Boolean).map((kiri, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <span className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">{kiri}</span>
              <span className="text-slate-400">→</span>
              <span className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-500 dark:border-slate-700 dark:bg-slate-900">pilih pasangan…</span>
            </div>
          ))}
        </div>
      )}
      {form.jenis === 'isian' && (
        <input disabled placeholder="Tulis jawaban singkat di sini…" className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-900" />
      )}
      {form.jenis === 'essay' && (
        <textarea disabled rows={3} placeholder="Tulis jawaban uraian di sini… (dinilai manual oleh guru)" className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-900" />
      )}
    </div>
  );
}

function FormSoalModal({
  form,
  setForm,
  mapelForm,
  jenjang,
  onTutup,
  onSimpan,
  loading,
  toast,
}: {
  form: FormSoal;
  setForm: (f: FormSoal) => void;
  mapelForm: { id: string; nama: string }[];
  jenjang: { id: string; nama: string }[];
  onTutup: () => void;
  onSimpan: () => void;
  loading: boolean;
  toast: PageProps['toast'];
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [unggahLoading, setUnggahLoading] = useState(false);
  const ubah = (k: keyof FormSoal, v: string | number | string[] | Record<number, number>) => setForm({ ...form, [k]: v });

  const gantiJenis = (j: JenisSoal) => {
    setForm({
      ...form,
      jenis: j,
      kunci: j === 'bs' ? 'Benar' : j === 'isian' ? '' : form.kunci,
      kunciPgk: j === 'pgk' ? form.kunciPgk : [],
    });
  };

  const toggleKunciPgk = (huruf: string) => {
    const ada = form.kunciPgk.includes(huruf);
    ubah('kunciPgk', ada ? form.kunciPgk.filter((k) => k !== huruf) : [...form.kunciPgk, huruf]);
  };

  const ubahPasangan = (sisi: 'pasanganKiri' | 'pasanganKanan', idx: number, nilai: string) => {
    const arr = [...form[sisi]];
    arr[idx] = nilai;
    ubah(sisi, arr);
  };
  const tambahPasangan = () => {
    const n = form.pasanganKiri.length;
    ubah('pasanganKiri', [...form.pasanganKiri, '']);
    ubah('pasanganKanan', [...form.pasanganKanan, '']);
    ubah('kunciJodoh', { ...form.kunciJodoh, [n]: n });
  };
  const hapusPasangan = (idx: number) => {
    if (form.pasanganKiri.length <= 2) return toast('Minimal 2 pasangan.', 'error');
    const kiri = form.pasanganKiri.filter((_, i) => i !== idx);
    const kanan = form.pasanganKanan.filter((_, i) => i !== idx);
    const kj: Record<number, number> = {};
    kiri.forEach((_, i) => {
      const lama = form.kunciJodoh[i < idx ? i : i + 1];
      kj[i] = lama !== undefined && lama !== idx ? (lama > idx ? lama - 1 : lama) : i;
    });
    setForm({ ...form, pasanganKiri: kiri, pasanganKanan: kanan, kunciJodoh: kj });
  };

  const unggahGambar = async (f: File) => {
    if (!f.type.startsWith('image/')) return toast('File harus gambar.', 'error');
    if (f.size > 2 * 1024 * 1024) return toast('Ukuran gambar maksimal 2 MB.', 'error');
    setUnggahLoading(true);
    try {
      const buf = await f.arrayBuffer();
      let bin = '';
      const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      const r = await uploadGambarSoal(btoa(bin), f.type, f.name);
      ubah('gambarUrl', r.url);
      toast('Gambar terunggah.', 'sukses');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal mengunggah gambar.', 'error');
    } finally {
      setUnggahLoading(false);
    }
  };

  const opsiHuruf = ['A', 'B', 'C', 'D', 'E'] as const;

  return (
    <Modal judul={form.id ? 'Ubah Soal' : 'Tambah Soal'} onTutup={onTutup} lebar="max-w-2xl">
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Jenjang">
            <SelectInput value={form.jenjangId} onChange={(e) => ubah('jenjangId', e.target.value)}>
              <option value="">— Pilih —</option>
              {jenjang.map((j) => (
                <option key={j.id} value={j.id}>{j.nama}</option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Mapel">
            <SelectInput value={form.mapelId} onChange={(e) => ubah('mapelId', e.target.value)}>
              <option value="">— Pilih —</option>
              {mapelForm.map((m) => (
                <option key={m.id} value={m.id}>{m.nama}</option>
              ))}
            </SelectInput>
          </Field>
        </div>
        <Field label="Jenis soal">
          <SelectInput value={form.jenis} onChange={(e) => gantiJenis(e.target.value as JenisSoal)}>
            {SEMUA_JENIS_SOAL.map((j) => (
              <option key={j} value={j}>{LABEL_JENIS_SOAL[j]}</option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Teks soal">
          <TextAreaInput value={form.soal} onChange={(e) => ubah('soal', e.target.value)} rows={3} placeholder="Tulis soal..." />
        </Field>
        <div>
          <span className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-200">Gambar soal (opsional)</span>
          <div className="flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) unggahGambar(f);
                e.target.value = '';
              }}
            />
            <Button varian="sekunder" kecil loading={unggahLoading} onClick={() => fileRef.current?.click()}>
              {form.gambarUrl ? 'Ganti gambar' : 'Unggah gambar'}
            </Button>
            {form.gambarUrl && (
              <button onClick={() => ubah('gambarUrl', '')} className="text-xs text-red-600 hover:underline">
                Hapus
              </button>
            )}
          </div>
          {form.gambarUrl && <img src={form.gambarUrl} alt="Gambar soal" className="mt-2 max-h-40 rounded-lg border" />}
        </div>

        {(form.jenis === 'pg' || form.jenis === 'pgk') && (
          <>
            {opsiHuruf.map((k) => (
              <div key={k} className="flex items-start gap-2">
                <Field label={`Opsi ${k}${k === 'E' ? ' (opsional)' : ''}`} className="flex-1">
                  <TextInput
                    value={(form as unknown as Record<string, string>)[`opsi${k}`]}
                    onChange={(e) => ubah(`opsi${k}` as keyof FormSoal, e.target.value)}
                    placeholder={`Teks opsi ${k}`}
                  />
                </Field>
                {form.jenis === 'pgk' && (
                  <label className="mt-8 flex cursor-pointer items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={form.kunciPgk.includes(k)}
                      onChange={() => toggleKunciPgk(k)}
                      className="h-4 w-4 accent-violet-600"
                    />
                    Kunci
                  </label>
                )}
              </div>
            ))}
            {form.jenis === 'pg' ? (
              <Field label="Kunci jawaban">
                <SelectInput value={form.kunci} onChange={(e) => ubah('kunci', e.target.value)}>
                  {opsiHuruf.map((k) => (
                    <option key={k} value={k}>{k}</option>
                  ))}
                </SelectInput>
              </Field>
            ) : (
              <p className="rounded-xl bg-violet-50 px-4 py-3 text-sm text-violet-800 dark:bg-violet-950 dark:text-violet-200">
                PG Kompleks: centang <b>minimal 2 kunci</b> di samping opsi. Nilai proporsional per pilihan benar (tanpa nilai negatif).
              </p>
            )}
          </>
        )}

        {form.jenis === 'bs' && (
          <Field label="Kunci jawaban">
            <div className="flex gap-2">
              {(['Benar', 'Salah'] as const).map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => ubah('kunci', b)}
                  className={`flex-1 rounded-xl border px-4 py-2.5 text-sm font-bold transition ${
                    form.kunci === b
                      ? b === 'Benar'
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-700 dark:bg-emerald-950'
                        : 'border-red-600 bg-red-50 text-red-700 dark:bg-red-950'
                      : 'border-slate-200 text-slate-500 dark:border-slate-700'
                  }`}
                >
                  {b}
                </button>
              ))}
            </div>
          </Field>
        )}

        {form.jenis === 'jodoh' && (
          <div>
            <span className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-200">
              Pasangan kiri → kanan (pilih jawaban benar tiap baris kiri)
            </span>
            <div className="space-y-2">
              {form.pasanganKiri.map((kiri, i) => (
                <div key={i} className="flex items-center gap-2">
                  <TextInput
                    value={kiri}
                    onChange={(e) => ubahPasangan('pasanganKiri', i, e.target.value)}
                    placeholder={`Kiri ${i + 1}`}
                  />
                  <span className="text-slate-400">→</span>
                  <TextInput
                    value={form.pasanganKanan[i] || ''}
                    onChange={(e) => ubahPasangan('pasanganKanan', i, e.target.value)}
                    placeholder={`Kanan ${i + 1}`}
                  />
                  <SelectInput
                    value={form.kunciJodoh[i] ?? i}
                    onChange={(e) => ubah('kunciJodoh', { ...form.kunciJodoh, [i]: Number(e.target.value) })}
                    className="w-28"
                    title="Pasangan benar untuk baris kiri ini"
                  >
                    {form.pasanganKanan.map((_, j) => (
                      <option key={j} value={j}>Kanan {j + 1}</option>
                    ))}
                  </SelectInput>
                  <button
                    onClick={() => hapusPasangan(i)}
                    className="rounded-lg p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                    title="Hapus pasangan"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            <Button varian="sekunder" kecil onClick={tambahPasangan} className="mt-2">
              <Plus className="h-3.5 w-3.5" /> Tambah Pasangan
            </Button>
            <p className="mt-1 text-xs text-slate-400">
              Kolom dropdown "Kanan N" = jawaban benar untuk baris kiri tersebut. Nilai proporsional per pasangan benar.
            </p>
          </div>
        )}

        {form.jenis === 'isian' && (
          <Field label="Kunci jawaban (teks)">
            <TextInput
              value={form.kunci}
              onChange={(e) => ubah('kunci', e.target.value)}
              placeholder="cth: 56  (cocok tanpa peduli huruf besar/kecil & spasi berlebih)"
            />
          </Field>
        )}

        {form.jenis === 'essay' && (
          <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
            Essay <b>tidak punya kunci</b> — dinilai manual oleh guru (0 sampai bobot soal). Nilai tampil "Menunggu penilaian" sampai dinilai.
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Bobot">
            <TextInput
              type="number"
              min={1}
              value={form.bobot}
              onChange={(e) => ubah('bobot', Math.max(1, parseInt(e.target.value, 10) || 1))}
            />
          </Field>
          <Field label="Pembahasan (opsional)">
            <TextInput value={form.pembahasan} onChange={(e) => ubah('pembahasan', e.target.value)} placeholder="Pembahasan singkat..." />
          </Field>
        </div>

        <PreviewSoal form={form} />

        <div className="flex justify-end gap-2">
          <Button varian="sekunder" onClick={onTutup}>Batal</Button>
          <Button onClick={onSimpan} loading={loading}>Simpan</Button>
        </div>
      </div>
    </Modal>
  );
}

function ImporSoalModal({
  jenjang,
  mapel,
  onTutup,
  toast,
  refreshData,
}: {
  jenjang: { id: string; nama: string }[];
  mapel: { id: string; nama: string; jenjangId: string }[];
  onTutup: () => void;
  toast: PageProps['toast'];
  refreshData: () => Promise<void>;
}) {
  const [tab, setTab] = useState<'file' | 'form'>('file');
  const [jenjangId, setJenjangId] = useState(jenjang[0]?.id || '');
  const [mapelId, setMapelId] = useState('');
  const [baris, setBaris] = useState<BarisSoalImpor[]>([]);
  const [namaFile, setNamaFile] = useState('');
  const [parseLoading, setParseLoading] = useState(false);
  const [imporLoading, setImporLoading] = useState(false);
  const [formUrl, setFormUrl] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const mapelPilih = mapel.filter((m) => !jenjangId || m.jenjangId === jenjangId);
  const validCount = baris.filter((b) => b.valid).length;

  const pilihFile = async (f: File) => {
    setParseLoading(true);
    setNamaFile(f.name);
    try {
      const buf = await f.arrayBuffer();
      const hasil = await parseFileSoal(f.name, buf);
      setBaris(hasil.baris);
      if (hasil.baris.length === 0) toast('Tidak ada baris soal yang terbaca.', 'error');
      else toast(`Terbaca ${hasil.baris.length} baris (${hasil.valid.length} valid).`, 'info');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal membaca file.', 'error');
      setBaris([]);
    } finally {
      setParseLoading(false);
    }
  };

  const impor = async () => {
    if (!jenjangId || !mapelId) return toast('Pilih jenjang dan mapel tujuan.', 'error');
    const items = baris
      .filter((b) => b.valid)
      .map((b) => ({
        soal: b.item.soal || '',
        jenis: b.item.jenis || 'pg',
        opsiA: b.item.opsiA || '',
        opsiB: b.item.opsiB || '',
        opsiC: b.item.opsiC || '',
        opsiD: b.item.opsiD || '',
        opsiE: b.item.opsiE,
        kunci: b.item.jenis === 'jodoh'
          ? (b.item.pasanganKiri || []).map((_, i) => b.item.kunciJodoh?.[i] ?? i)
          : b.item.jenis === 'pg' || b.item.jenis === 'pgk'
            ? (b.item.kunci || '').toUpperCase()
            : b.item.kunci || '',
        pasanganKiri: b.item.pasanganKiri,
        pasanganKanan: b.item.pasanganKanan,
        kunciJodoh: b.item.kunciJodoh,
        bobot: b.item.bobot,
        pembahasan: b.item.pembahasan,
      }));
    if (items.length === 0) return toast('Tidak ada baris valid untuk diimpor.', 'error');
    setImporLoading(true);
    try {
      const r = await importSoal(jenjangId, mapelId, items);
      toast(`Berhasil: ${r.imported} soal diimpor${r.errors.length ? `, ${r.errors.length} gagal.` : '.'}`, r.errors.length ? 'error' : 'sukses');
      if (r.errors.length) {
        toast('Detail: ' + r.errors.slice(0, 3).map((e) => `baris ${e.baris}: ${e.pesan}`).join(' | '), 'error');
      }
      await refreshData();
      onTutup();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Impor gagal.', 'error');
    } finally {
      setImporLoading(false);
    }
  };

  const imporDariForm = async () => {
    if (!formUrl.trim()) return toast('Tempel URL atau ID Google Form.', 'error');
    if (!jenjangId || !mapelId) return toast('Pilih jenjang dan mapel tujuan.', 'error');
    setFormLoading(true);
    try {
      const r = await importSoalDariForm(formUrl.trim(), jenjangId, mapelId);
      toast(`Impor dari Google Form: ${r.imported} soal masuk${r.dilewati.length ? `, ${r.dilewati.length} dilewati.` : '.'}`, 'sukses');
      await refreshData();
      onTutup();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Impor dari Google Form gagal.', 'error');
    } finally {
      setFormLoading(false);
    }
  };

  return (
    <Modal judul="Template & Unggah Soal" onTutup={onTutup} lebar="max-w-3xl">
      <div className="mb-4 flex gap-2">
        <Button varian={tab === 'file' ? 'primer' : 'sekunder'} kecil onClick={() => setTab('file')}>
          <FileUp className="h-4 w-4" /> File (.txt/.docx/.xlsx)
        </Button>
        <Button varian={tab === 'form' ? 'primer' : 'sekunder'} kecil onClick={() => setTab('form')}>
          <Link2 className="h-4 w-4" /> Google Form
        </Button>
      </div>

      {tab === 'file' ? (
        <div className="space-y-4">
          <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800">
            <p className="mb-2 text-sm font-bold text-slate-700 dark:text-slate-200">1. Unduh template (sudah ada contoh 6 jenis soal)</p>
            <div className="flex flex-wrap gap-2">
              <Button varian="sekunder" kecil onClick={unduhTemplateTxt}>
                <Download className="h-3.5 w-3.5" /> .txt (Notepad)
              </Button>
              <Button varian="sekunder" kecil onClick={unduhTemplateDocx}>
                <Download className="h-3.5 w-3.5" /> .docx (Word)
              </Button>
              <Button varian="sekunder" kecil onClick={unduhTemplateXlsx}>
                <Download className="h-3.5 w-3.5" /> .xlsx (Excel)
              </Button>
            </div>
            <p className="mt-2 text-xs text-slate-400">
              Template memuat kolom Jenis (pg/pgk/bs/jodoh/isian/essay) + PasanganKiri/PasanganKanan/KunciJodoh untuk Menjodohkan.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Jenjang tujuan">
              <SelectInput value={jenjangId} onChange={(e) => { setJenjangId(e.target.value); setMapelId(''); }}>
                {jenjang.map((j) => (
                  <option key={j.id} value={j.id}>{j.nama}</option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Mapel tujuan">
              <SelectInput value={mapelId} onChange={(e) => setMapelId(e.target.value)}>
                <option value="">— Pilih —</option>
                {mapelPilih.map((m) => (
                  <option key={m.id} value={m.id}>{m.nama}</option>
                ))}
              </SelectInput>
            </Field>
          </div>

          <div>
            <p className="mb-2 text-sm font-bold text-slate-700 dark:text-slate-200">2. Pilih file yang sudah diisi</p>
            <input
              ref={fileRef}
              type="file"
              accept=".txt,.docx,.xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) pilihFile(f);
                e.target.value = '';
              }}
            />
            <Button varian="sekunder" loading={parseLoading} onClick={() => fileRef.current?.click()}>
              <FileUp className="h-4 w-4" /> Pilih File
            </Button>
            {namaFile && <span className="ml-2 text-xs text-slate-500">{namaFile}</span>}
          </div>

          {baris.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-bold text-slate-700 dark:text-slate-200">
                3. Pratinjau &amp; validasi ({validCount} valid dari {baris.length})
              </p>
              <TabelResponsif>
                <table className="w-full min-w-[640px]">
                  <thead>
                    <tr>
                      <th className={thCls}>No</th>
                      <th className={thCls}>Soal</th>
                      <th className={thCls}>Jenis</th>
                      <th className={thCls}>Kunci</th>
                      <th className={thCls}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {baris.map((b) => (
                      <tr key={b.no} className={b.valid ? 'hover:bg-slate-50 dark:hover:bg-slate-800' : 'bg-red-50 dark:bg-red-950'}>
                        <td className={tdCls}>{b.no}</td>
                        <td className={tdCls}>
                          <p className="max-w-xs truncate" title={b.item.soal}>{b.item.soal || '(kosong)'}</p>
                        </td>
                        <td className={tdCls}>{LABEL_JENIS_SOAL[b.item.jenis || 'pg']}</td>
                        <td className={tdCls}>{(b.item.kunci || '-').toUpperCase()}</td>
                        <td className={tdCls}>
                          {b.valid ? <Badge warna="hijau">Valid</Badge> : <Badge warna="merah">{b.galat}</Badge>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TabelResponsif>
              <div className="mt-3 flex justify-end">
                <Button onClick={impor} loading={imporLoading} disabled={validCount === 0}>
                  Impor {validCount} Soal Valid
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
            Impor membaca soal pilihan ganda dari Google Form (mode kuis — kunci diambil dari jawaban
            benar). Soal tanpa kunci yang jelas akan dilewati. Backend perlu otorisasi Forms
            (<code>authorizeFormsAccess</code>) — lihat README.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Jenjang tujuan">
              <SelectInput value={jenjangId} onChange={(e) => { setJenjangId(e.target.value); setMapelId(''); }}>
                {jenjang.map((j) => (
                  <option key={j.id} value={j.id}>{j.nama}</option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Mapel tujuan">
              <SelectInput value={mapelId} onChange={(e) => setMapelId(e.target.value)}>
                <option value="">— Pilih —</option>
                {mapelPilih.map((m) => (
                  <option key={m.id} value={m.id}>{m.nama}</option>
                ))}
              </SelectInput>
            </Field>
          </div>
          <Field label="URL atau ID Google Form">
            <TextInput
              value={formUrl}
              onChange={(e) => setFormUrl(e.target.value)}
              placeholder="https://docs.google.com/forms/d/1AbC.../edit  atau  1AbC..."
            />
          </Field>
          <div className="flex justify-end">
            <Button onClick={imporDariForm} loading={formLoading}>
              Impor dari Google Form
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
