import { useMemo, useRef, useState } from 'react';
import { Download, FileUp, KeyRound, Pencil, Plus, Trash2 } from 'lucide-react';
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
  TextInput,
  tdCls,
  thCls,
} from '../components/ui';
import {
  deleteJenjang,
  deleteKelas,
  deleteMapel,
  deletePengguna,
  importSiswa,
  resetPassword,
  saveJenjang,
  saveKelas,
  saveMapel,
  savePengguna,
} from '../services/api';
import {
  parseXlsxMapel,
  parseXlsxSiswa,
  unduhTemplateXlsxMapel,
  unduhTemplateXlsxSiswa,
  type BarisMapelImpor,
  type BarisSiswaImpor,
} from '../utils/imporSoal';
import type { Kelas, Mapel, Pengguna, Peran } from '../types';
import type { PageProps } from './PageProps';

type Tab = 'pengguna' | 'impor' | 'jenjang' | 'mapel' | 'kelas';

const TABS: { key: Tab; label: string }[] = [
  { key: 'pengguna', label: 'Pengguna' },
  { key: 'impor', label: 'Impor Siswa' },
  { key: 'jenjang', label: 'Jenjang' },
  { key: 'mapel', label: 'Mapel' },
  { key: 'kelas', label: 'Kelas' },
];

export default function KelolaData({ data, toast, refreshData }: PageProps) {
  const [tab, setTab] = useState<Tab>('pengguna');
  return (
    <div>
      <PageHeader judul="Kelola Data" subjudul="Pengguna, siswa, jenjang, mapel, dan kelas." />
      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-full px-4 py-2 text-sm font-bold transition ${
              tab === t.key ? 'bg-violet-600 text-white' : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'pengguna' && <TabPengguna data={data} toast={toast} refreshData={refreshData} />}
      {tab === 'impor' && <TabImporSiswa toast={toast} refreshData={refreshData} />}
      {tab === 'jenjang' && <TabJenjang data={data} toast={toast} refreshData={refreshData} />}
      {tab === 'mapel' && <TabMapel data={data} toast={toast} refreshData={refreshData} />}
      {tab === 'kelas' && <TabKelas data={data} toast={toast} refreshData={refreshData} />}
    </div>
  );
}

// ================= PENGGUNA =================

interface FormPengguna {
  id?: string;
  nama: string;
  username: string;
  peran: Peran;
  password: string;
  nis: string;
  jenjangId: string;
  kelasId: string;
  noHP: string;
  aktif: boolean;
}

const FP_KOSONG: FormPengguna = {
  nama: '',
  username: '',
  peran: 'siswa',
  password: '',
  nis: '',
  jenjangId: '',
  kelasId: '',
  noHP: '',
  aktif: true,
};

function TabPengguna({ data, toast, refreshData }: Pick<PageProps, 'data' | 'toast' | 'refreshData'>) {
  const [formBuka, setFormBuka] = useState(false);
  const [form, setForm] = useState<FormPengguna>(FP_KOSONG);
  const [loading, setLoading] = useState(false);
  const [hapusId, setHapusId] = useState<string | null>(null);
  const [resetId, setResetId] = useState<string | null>(null);
  const [pwBaru, setPwBaru] = useState('');
  const [filterPeran, setFilterPeran] = useState('');
  const [cari, setCari] = useState('');

  const daftar = useMemo(() => {
    const q = cari.trim().toLowerCase();
    return data.pengguna
      .filter((p) => !filterPeran || p.peran === filterPeran)
      .filter((p) => !q || p.nama.toLowerCase().includes(q) || p.username.toLowerCase().includes(q));
  }, [data.pengguna, filterPeran, cari]);

  const ubah = <K extends keyof FormPengguna>(k: K, v: FormPengguna[K]) => setForm({ ...form, [k]: v });

  const bukaTambah = () => {
    setForm(FP_KOSONG);
    setFormBuka(true);
  };
  const bukaUbah = (p: Pengguna) => {
    setForm({
      id: p.id,
      nama: p.nama,
      username: p.username,
      peran: p.peran,
      password: '',
      nis: p.nis || '',
      jenjangId: p.jenjangId || '',
      kelasId: p.kelasId || '',
      noHP: p.noHP || '',
      aktif: p.aktif === 1,
    });
    setFormBuka(true);
  };

  const simpan = async () => {
    if (!form.nama.trim() || !form.username.trim()) return toast('Nama & username wajib.', 'error');
    if (!form.id && form.peran !== 'siswa' && !form.password)
      return toast('Password wajib untuk admin/guru.', 'error');
    if (form.peran === 'siswa') {
      if (!form.nis.trim()) return toast('NIS wajib untuk siswa.', 'error');
      if (!form.jenjangId || !form.kelasId) return toast('Jenjang & kelas wajib untuk siswa.', 'error');
    }
    setLoading(true);
    try {
      await savePengguna({
        ...(form.id ? { id: form.id } : {}),
        nama: form.nama.trim(),
        username: form.username.trim(),
        peran: form.peran,
        ...(form.password ? { password: form.password } : {}),
        nis: form.nis.trim(),
        jenjangId: form.jenjangId,
        kelasId: form.kelasId,
        noHP: form.noHP.trim(),
        aktif: form.aktif ? 1 : 0,
      });
      toast('Pengguna tersimpan.', 'sukses');
      setFormBuka(false);
      await refreshData();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal menyimpan.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const hapus = async () => {
    if (!hapusId) return;
    try {
      await deletePengguna(hapusId);
      toast('Pengguna dihapus.', 'sukses');
      setHapusId(null);
      await refreshData();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal menghapus.', 'error');
    }
  };

  const doReset = async () => {
    if (!resetId || !pwBaru) return toast('Isi password baru.', 'error');
    try {
      await resetPassword(resetId, pwBaru);
      toast('Password direset.', 'sukses');
      setResetId(null);
      setPwBaru('');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal mereset password.', 'error');
    }
  };

  const namaKelas = (id: string) => data.kelas.find((k) => k.id === id)?.nama || '-';

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-40">
          <Field label="Peran">
            <SelectInput value={filterPeran} onChange={(e) => setFilterPeran(e.target.value)}>
              <option value="">Semua</option>
              <option value="admin">Admin</option>
              <option value="guru">Guru</option>
              <option value="siswa">Siswa</option>
            </SelectInput>
          </Field>
        </div>
        <div className="flex-1 min-w-[160px]">
          <Field label="Cari">
            <TextInput value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Nama / username..." />
          </Field>
        </div>
        <Button onClick={bukaTambah}>
          <Plus className="h-4 w-4" /> Tambah
        </Button>
      </div>

      <Card>
        <TabelResponsif>
          <table className="w-full min-w-[640px]">
            <thead>
              <tr>
                <th className={thCls}>Nama</th>
                <th className={thCls}>Username</th>
                <th className={thCls}>Peran</th>
                <th className={thCls}>Kelas</th>
                <th className={thCls}>Status</th>
                <th className={thCls}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {daftar.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800 dark:bg-slate-800">
                  <td className={tdCls}>
                    <p className="font-semibold">{p.nama}</p>
                    {p.nis && <p className="text-xs text-slate-400">NIS {p.nis}</p>}
                  </td>
                  <td className={tdCls}>{p.username}</td>
                  <td className={tdCls}>
                    <Badge warna={p.peran === 'admin' ? 'ungu' : p.peran === 'guru' ? 'biru' : 'abu'}>{p.peran}</Badge>
                  </td>
                  <td className={tdCls}>{p.peran === 'siswa' ? namaKelas(p.kelasId) : '-'}</td>
                  <td className={tdCls}>{p.aktif === 1 ? <Badge warna="hijau">Aktif</Badge> : <Badge warna="merah">Nonaktif</Badge>}</td>
                  <td className={tdCls}>
                    <div className="flex gap-1">
                      <button onClick={() => bukaUbah(p)} className="rounded-lg p-1.5 text-blue-600 hover:bg-blue-50" title="Ubah">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button onClick={() => setResetId(p.id)} className="rounded-lg p-1.5 text-amber-600 hover:bg-amber-50" title="Reset password">
                        <KeyRound className="h-4 w-4" />
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

      {formBuka && (
        <Modal judul={form.id ? 'Ubah Pengguna' : 'Tambah Pengguna'} onTutup={() => setFormBuka(false)}>
          <div className="space-y-4">
            <Field label="Nama lengkap">
              <TextInput value={form.nama} onChange={(e) => ubah('nama', e.target.value)} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Username">
                <TextInput value={form.username} onChange={(e) => ubah('username', e.target.value)} />
              </Field>
              <Field label="Peran">
                <SelectInput value={form.peran} onChange={(e) => ubah('peran', e.target.value as Peran)}>
                  <option value="siswa">Siswa</option>
                  <option value="guru">Guru</option>
                  <option value="admin">Admin</option>
                </SelectInput>
              </Field>
            </div>
            <Field label={form.id ? 'Password baru (kosongkan bila tidak diubah)' : 'Password (kosong = NIS, khusus siswa)'}>
              <TextInput type="password" value={form.password} onChange={(e) => ubah('password', e.target.value)} autoComplete="new-password" />
            </Field>
            {form.peran === 'siswa' && (
              <>
                <Field label="NIS">
                  <TextInput value={form.nis} onChange={(e) => ubah('nis', e.target.value)} />
                </Field>
                <Field label="No. WA Orang Tua">
                  <TextInput
                    value={form.noHP}
                    onChange={(e) => ubah('noHP', e.target.value)}
                    placeholder="cth: 081234567890"
                  />
                  <p className="mt-1 text-xs text-slate-400">
                    Dipakai untuk notifikasi progres belajar via WhatsApp.
                  </p>
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Jenjang">
                    <SelectInput value={form.jenjangId} onChange={(e) => { ubah('jenjangId', e.target.value); ubah('kelasId', ''); }}>
                      <option value="">— Pilih —</option>
                      {data.jenjang.map((j) => (
                        <option key={j.id} value={j.id}>{j.nama}</option>
                      ))}
                    </SelectInput>
                  </Field>
                  <Field label="Kelas">
                    <SelectInput value={form.kelasId} onChange={(e) => ubah('kelasId', e.target.value)}>
                      <option value="">— Pilih —</option>
                      {data.kelas.filter((k) => !form.jenjangId || k.jenjangId === form.jenjangId).map((k) => (
                        <option key={k.id} value={k.id}>{k.nama}</option>
                      ))}
                    </SelectInput>
                  </Field>
                </div>
              </>
            )}
            <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
              <input type="checkbox" checked={form.aktif} onChange={(e) => ubah('aktif', e.target.checked)} className="h-4 w-4 accent-violet-600" />
              Akun aktif
            </label>
            <div className="flex justify-end gap-2">
              <Button varian="sekunder" onClick={() => setFormBuka(false)}>Batal</Button>
              <Button onClick={simpan} loading={loading}>Simpan</Button>
            </div>
          </div>
        </Modal>
      )}

      {hapusId && (
        <ConfirmDialog judul="Hapus pengguna?" pesan="Akun pengguna akan dihapus permanen." onYa={hapus} onBatal={() => setHapusId(null)} />
      )}

      {resetId && (
        <Modal judul="Reset Password" onTutup={() => setResetId(null)} lebar="max-w-sm">
          <Field label="Password baru">
            <TextInput type="password" value={pwBaru} onChange={(e) => setPwBaru(e.target.value)} autoComplete="new-password" />
          </Field>
          <div className="mt-4 flex justify-end gap-2">
            <Button varian="sekunder" onClick={() => setResetId(null)}>Batal</Button>
            <Button varian="kuning" onClick={doReset}>Reset</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ================= IMPOR SISWA =================

function TabImporSiswa({ toast, refreshData }: Pick<PageProps, 'toast' | 'refreshData'>) {
  const [baris, setBaris] = useState<BarisSiswaImpor[]>([]);
  const [parseLoading, setParseLoading] = useState(false);
  const [imporLoading, setImporLoading] = useState(false);
  const [progresImpor, setProgresImpor] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const validCount = baris.filter((b) => b.valid).length;

  const pilihFile = async (f: File) => {
    setParseLoading(true);
    try {
      const buf = await f.arrayBuffer();
      const r = await parseXlsxSiswa(buf);
      setBaris(r.baris);
      toast(`Terbaca ${r.baris.length} baris (${r.valid.length} valid).`, 'info');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal membaca file.', 'error');
      setBaris([]);
    } finally {
      setParseLoading(false);
    }
  };

  const impor = async () => {
    const rows = baris
      .filter((b) => b.valid)
      .map((b) => ({
        nama: (b.item.nama || '').trim(),
        nis: (b.item.nis || '').trim(),
        kelas: (b.item.kelas || '').trim(),
        jenjang: (b.item.jenjang || '').trim() || undefined,
        username: (b.item.username || '').trim() || undefined,
        password: (b.item.password || '').trim() || undefined,
        noHP: (b.item.noHP || '').trim() || undefined,
      }));
    if (rows.length === 0) return toast('Tidak ada baris valid.', 'error');
    setImporLoading(true);
    try {
      // v1.1.4: kirim per batch 100 baris agar request tidak terlalu besar/lama
      // (sebelumnya 1000 baris sekaligus -> "Failed to fetch").
      const UKURAN_BATCH = 100;
      let imported = 0;
      let updated = 0;
      const errors: { baris: number; pesan: string }[] = [];
      for (let b = 0; b < rows.length; b += UKURAN_BATCH) {
        const potong = rows.slice(b, b + UKURAN_BATCH);
        setProgresImpor(`Mengimpor ${Math.min(b + UKURAN_BATCH, rows.length)}/${rows.length}…`);
        const r = await importSiswa(potong);
        imported += r.imported;
        updated += r.updated;
        for (const e of r.errors) errors.push({ baris: e.baris + b, pesan: e.pesan });
      }
      let pesan = `Impor selesai: ${imported} baru, ${updated} diperbarui.`;
      if (errors.length) pesan += ` ${errors.length} baris error: ` + errors.slice(0, 3).map((e) => `baris ${e.baris}: ${e.pesan}`).join(' | ');
      toast(pesan, errors.length ? 'error' : 'sukses');
      await refreshData();
      setBaris([]);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Impor gagal.', 'error');
    } finally {
      setImporLoading(false);
      setProgresImpor('');
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <h3 className="mb-2 font-bold text-slate-900 dark:text-slate-100">1. Unduh template</h3>
        <Button varian="sekunder" kecil onClick={unduhTemplateXlsxSiswa}>
          <Download className="h-3.5 w-3.5" /> Template Impor Siswa (.xlsx)
        </Button>
        <p className="mt-2 text-xs text-slate-400">
          Kolom: Nama | NIS | Kelas | Jenjang | Username | Password | NoHP (No. WA orang tua). NIS duplikat = data diperbarui.
        </p>
      </Card>
      <Card>
        <h3 className="mb-2 font-bold text-slate-900 dark:text-slate-100">2. Unggah file yang sudah diisi</h3>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls"
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
      </Card>
      {baris.length > 0 && (
        <Card>
          <h3 className="mb-2 font-bold text-slate-900 dark:text-slate-100">
            3. Pratinjau &amp; validasi ({validCount} valid dari {baris.length})
          </h3>
          <TabelResponsif>
            <table className="w-full min-w-[560px]">
              <thead>
                <tr>
                  <th className={thCls}>No</th>
                  <th className={thCls}>Nama</th>
                  <th className={thCls}>NIS</th>
                  <th className={thCls}>Kelas</th>
                  <th className={thCls}>Status</th>
                </tr>
              </thead>
              <tbody>
                {baris.map((b) => (
                  <tr key={b.no} className={b.valid ? 'hover:bg-slate-50 dark:hover:bg-slate-800 dark:bg-slate-800' : 'bg-red-50'}>
                    <td className={tdCls}>{b.no}</td>
                    <td className={tdCls}>{b.item.nama}</td>
                    <td className={tdCls}>{b.item.nis}</td>
                    <td className={tdCls}>{b.item.kelas}</td>
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
              {progresImpor || `Impor ${validCount} Siswa`}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

// ================= MASTER SEDERHANA =================

function MasterTab<T extends { id: string; nama: string }>({
  judul,
  daftar,
  toast,
  refreshData,
  onSimpan,
  onHapus,
  tambahanForm,
  kolomTambahan,
  onMulaiEdit,
}: {
  judul: string;
  daftar: T[];
  toast: PageProps['toast'];
  refreshData: () => Promise<void>;
  onSimpan: (id: string | undefined, nama: string) => Promise<{ id: string }>;
  onHapus: (id: string) => Promise<unknown>;
  tambahanForm?: React.ReactNode;
  kolomTambahan?: (item: T) => React.ReactNode;
  /** dipanggil saat tombol ubah diklik (mis. sinkronkan dropdown jenjang) */
  onMulaiEdit?: (item: T) => void;
}) {
  const [nama, setNama] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hapusId, setHapusId] = useState<string | null>(null);

  const simpan = async () => {
    if (!nama.trim()) return toast('Nama wajib diisi.', 'error');
    setLoading(true);
    try {
      await onSimpan(editId || undefined, nama.trim());
      toast('Tersimpan.', 'sukses');
      setNama('');
      setEditId(null);
      await refreshData();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal menyimpan.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const hapus = async () => {
    if (!hapusId) return;
    try {
      await onHapus(hapusId);
      toast('Dihapus.', 'sukses');
      setHapusId(null);
      await refreshData();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal menghapus.', 'error');
    }
  };

  return (
    <div>
      <Card className="mb-4">
        <h3 className="mb-3 font-bold text-slate-900 dark:text-slate-100">{editId ? 'Ubah' : 'Tambah'} {judul}</h3>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[200px] flex-1">
            <Field label="Nama">
              <TextInput value={nama} onChange={(e) => setNama(e.target.value)} placeholder={`Nama ${judul.toLowerCase()}...`} />
            </Field>
          </div>
          {tambahanForm}
          <Button onClick={simpan} loading={loading}>{editId ? 'Simpan' : <><Plus className="h-4 w-4" /> Tambah</>}</Button>
          {editId && (
            <Button varian="sekunder" onClick={() => { setEditId(null); setNama(''); }}>Batal</Button>
          )}
        </div>
      </Card>
      {daftar.length === 0 ? (
        <EmptyState judul={`Belum ada ${judul.toLowerCase()}`} />
      ) : (
        <Card>
          <TabelResponsif>
            <table className="w-full">
              <thead>
                <tr>
                  <th className={thCls}>No</th>
                  <th className={thCls}>Nama</th>
                  {kolomTambahan && <th className={thCls}>Info</th>}
                  <th className={thCls}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {daftar.map((d, i) => (
                  <tr key={d.id} className="hover:bg-slate-50 dark:hover:bg-slate-800 dark:bg-slate-800">
                    <td className={tdCls}>{i + 1}</td>
                    <td className={tdCls + ' font-semibold'}>{d.nama}</td>
                    {kolomTambahan && <td className={tdCls}>{kolomTambahan(d)}</td>}
                    <td className={tdCls}>
                      <div className="flex gap-1">
                        <button
                          onClick={() => { setEditId(d.id); setNama(d.nama); onMulaiEdit?.(d); window.scrollTo({ top: 0 }); }}
                          className="rounded-lg p-1.5 text-blue-600 hover:bg-blue-50"
                          title="Ubah"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button onClick={() => setHapusId(d.id)} className="rounded-lg p-1.5 text-red-600 hover:bg-red-50" title="Hapus">
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
      {hapusId && (
        <ConfirmDialog judul={`Hapus ${judul}?`} pesan="Data yang masih dipakai tidak bisa dihapus." onYa={hapus} onBatal={() => setHapusId(null)} />
      )}
    </div>
  );
}

function TabJenjang({ data, toast, refreshData }: Pick<PageProps, 'data' | 'toast' | 'refreshData'>) {
  return (
    <MasterTab
      judul="Jenjang"
      daftar={data.jenjang}
      toast={toast}
      refreshData={refreshData}
      onSimpan={(id, nama) => saveJenjang(id ? { id, nama } : { nama })}
      onHapus={deleteJenjang}
    />
  );
}

function TabMapel({ data, toast, refreshData }: Pick<PageProps, 'data' | 'toast' | 'refreshData'>) {
  const [jenjangId, setJenjangId] = useState(data.jenjang[0]?.id || '');
  return (
    <div className="space-y-4">
      <MasterTab<Mapel>
        judul="Mapel"
        daftar={data.mapel}
        toast={toast}
        refreshData={refreshData}
        onSimpan={(id, nama) => saveMapel(id ? { id, jenjangId, nama } : { jenjangId, nama })}
        onHapus={deleteMapel}
        tambahanForm={
          <div className="min-w-[160px]">
            <Field label="Jenjang">
              <SelectInput value={jenjangId} onChange={(e) => setJenjangId(e.target.value)}>
                {data.jenjang.map((j) => (
                  <option key={j.id} value={j.id}>{j.nama}</option>
                ))}
              </SelectInput>
            </Field>
          </div>
        }
        kolomTambahan={(m) => data.jenjang.find((j) => j.id === m.jenjangId)?.nama || '-'}
        onMulaiEdit={(m) => setJenjangId(m.jenjangId)}
      />
      <p className="text-xs text-slate-400">
        Daftar mapel diisi manual oleh admin (tambah/edit/hapus di atas) atau impor Excel di bawah —
        tidak ada daftar mapel hardcode di aplikasi ini.
      </p>
      <ImporMapel data={data} toast={toast} refreshData={refreshData} />
    </div>
  );
}

/** Impor mapel dari .xlsx (Nama | Jenjang). */
function ImporMapel({ data, toast, refreshData }: Pick<PageProps, 'data' | 'toast' | 'refreshData'>) {
  const [baris, setBaris] = useState<BarisMapelImpor[]>([]);
  const [jenjangId, setJenjangId] = useState(data.jenjang[0]?.id || '');
  const [parseLoading, setParseLoading] = useState(false);
  const [imporLoading, setImporLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const validCount = baris.filter((b) => b.valid).length;

  const pilihFile = async (f: File) => {
    setParseLoading(true);
    try {
      const buf = await f.arrayBuffer();
      const r = await parseXlsxMapel(buf);
      setBaris(r.baris);
      toast(`Terbaca ${r.baris.length} baris (${r.valid.length} valid).`, 'info');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal membaca file.', 'error');
      setBaris([]);
    } finally {
      setParseLoading(false);
    }
  };

  const impor = async () => {
    const items = baris.filter((b) => b.valid);
    if (items.length === 0) return toast('Tidak ada baris valid.', 'error');
    setImporLoading(true);
    let masuk = 0;
    let lewati = 0;
    try {
      for (const b of items) {
        const nama = (b.item.nama || '').trim();
        // Jenjang dari kolom file (cocok nama) atau pilihan di form.
        const jenjangNama = (b.item.jenjang || '').trim().toLowerCase();
        const jenjangCocok = jenjangNama
          ? data.jenjang.find((j) => j.nama.toLowerCase() === jenjangNama)?.id
          : undefined;
        const jId = jenjangCocok || jenjangId;
        if (!jId) {
          lewati++;
          continue;
        }
        const sudahAda = data.mapel.some(
          (m) => m.jenjangId === jId && m.nama.toLowerCase() === nama.toLowerCase()
        );
        if (sudahAda) {
          lewati++;
          continue;
        }
        await saveMapel({ jenjangId: jId, nama });
        masuk++;
      }
      toast(`Impor mapel selesai: ${masuk} masuk${lewati ? `, ${lewati} dilewati (duplikat/tanpa jenjang).` : '.'}`, 'sukses');
      setBaris([]);
      await refreshData();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Impor gagal.', 'error');
    } finally {
      setImporLoading(false);
    }
  };

  return (
    <Card>
      <h3 className="mb-2 font-bold text-slate-900 dark:text-slate-100">Impor Mapel (.xlsx)</h3>
      <div className="flex flex-wrap items-center gap-2">
        <Button varian="sekunder" kecil onClick={unduhTemplateXlsxMapel}>
          <Download className="h-3.5 w-3.5" /> Template Impor Mapel
        </Button>
        <div className="w-44">
          <SelectInput value={jenjangId} onChange={(e) => setJenjangId(e.target.value)}>
            {data.jenjang.map((j) => (
              <option key={j.id} value={j.id}>{j.nama}</option>
            ))}
          </SelectInput>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) pilihFile(f);
            e.target.value = '';
          }}
        />
        <Button varian="sekunder" kecil loading={parseLoading} onClick={() => fileRef.current?.click()}>
          <FileUp className="h-4 w-4" /> Pilih File
        </Button>
      </div>
      <p className="mt-2 text-xs text-slate-400">
        Kolom: Nama | Jenjang (opsional — kosong = jenjang yang dipilih di atas). Nama duplikat dilewati.
      </p>
      {baris.length > 0 && (
        <div className="mt-3">
          <p className="mb-2 text-sm font-bold text-slate-700 dark:text-slate-200">
            Pratinjau ({validCount} valid dari {baris.length})
          </p>
          <TabelResponsif>
            <table className="w-full min-w-[480px]">
              <thead>
                <tr>
                  <th className={thCls}>No</th>
                  <th className={thCls}>Nama</th>
                  <th className={thCls}>Jenjang</th>
                  <th className={thCls}>Status</th>
                </tr>
              </thead>
              <tbody>
                {baris.map((b) => (
                  <tr key={b.no} className={b.valid ? 'hover:bg-slate-50 dark:hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-800' : 'bg-red-50 dark:bg-red-950'}>
                    <td className={tdCls}>{b.no}</td>
                    <td className={tdCls}>{b.item.nama}</td>
                    <td className={tdCls}>{b.item.jenjang || '—'}</td>
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
              Impor {validCount} Mapel
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function TabKelas({ data, toast, refreshData }: Pick<PageProps, 'data' | 'toast' | 'refreshData'>) {
  const [jenjangId, setJenjangId] = useState(data.jenjang[0]?.id || '');
  return (
    <MasterTab<Kelas>
      judul="Kelas"
      daftar={data.kelas}
      toast={toast}
      refreshData={refreshData}
      onSimpan={(id, nama) => saveKelas(id ? { id, jenjangId, nama } : { jenjangId, nama })}
      onHapus={deleteKelas}
      tambahanForm={
        <div className="min-w-[160px]">
          <Field label="Jenjang">
            <SelectInput value={jenjangId} onChange={(e) => setJenjangId(e.target.value)}>
              {data.jenjang.map((j) => (
                <option key={j.id} value={j.id}>{j.nama}</option>
              ))}
            </SelectInput>
          </Field>
        </div>
      }
      kolomTambahan={(k) => data.jenjang.find((j) => j.id === k.jenjangId)?.nama || '-'}
      onMulaiEdit={(k) => setJenjangId(k.jenjangId)}
    />
  );
}
