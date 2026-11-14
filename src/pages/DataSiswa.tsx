import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  CreditCard,
  Download,
  Eye,
  EyeOff,
  FileUp,
  KeyRound,
  Lock,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  Ceklis,
  ConfirmDialog,
  EmptyState,
  Field,
  Modal,
  SelectInput,
  TabelResponsif,
  TextInput,
  tdCls,
  thCls,
  useSeleksi,
} from '../components/ui';
import {
  deletePengguna,
  savePengguna,
  setPasswordMassal,
} from '../services/api';
import { buatXlsx } from '../utils/imporSoal';
import {
  buatBanyakPasswordAcak,
  buatPasswordAcak,
  passwordKetikValid,
  salinTeks,
  type JenisPasswordAcak,
} from '../utils/password';
import { formatTanggalWaktu, hariIniISO } from '../utils/format';
import { TabImporSiswa } from './KelolaData';
import type { Pengguna } from '../types';
import type { PageProps } from './PageProps';

type TabLogin = 'semua' | 'sudah' | 'belum';
type KunciUrut = 'urutan' | 'nis' | 'username' | 'nama' | 'kelas' | 'ruang';

function unduhBlob(nama: string, blob: Blob): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nama;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Sudah pernah login = kolom TerakhirLogin terisi (dicatat sejak v1.5.0). */
function sudahLogin(p: Pengguna): boolean {
  return !!(p.terakhirLogin || '').trim();
}

export default function DataSiswa({ data, toast, refreshData, pindah }: PageProps) {
  const sel = useSeleksi();
  const [filterKelas, setFilterKelas] = useState('');
  const [tabLogin, setTabLogin] = useState<TabLogin>('semua');
  const [cari, setCari] = useState('');
  const [perHalaman, setPerHalaman] = useState(10);
  const [halaman, setHalaman] = useState(1);
  const [kunciUrut, setKunciUrut] = useState<KunciUrut>('urutan');
  const [arahUrut, setArahUrut] = useState<'naik' | 'turun'>('naik');
  const [imporBuka, setImporBuka] = useState(false);
  const [formBuka, setFormBuka] = useState(false);
  const [form, setForm] = useState<FormSiswa>(FS_KOSONG);
  const [lihatPwForm, setLihatPwForm] = useState(false);
  const [loadingForm, setLoadingForm] = useState(false);
  const [hapusId, setHapusId] = useState<string | null>(null);
  const [hapusMassalBuka, setHapusMassalBuka] = useState(false);
  /** Modal password: massal (terpilih / tampil) atau satu siswa. */
  const [pwTarget, setPwTarget] = useState<Pengguna[] | null>(null);

  const namaKelas = (id: string) => data.kelas.find((k) => k.id === id)?.nama || '-';

  // Urutan asli (indeks di data.pengguna) = kolom ID & urutan default.
  const semuaSiswa = useMemo(
    () =>
      data.pengguna
        .map((p, i) => ({ p, urutan: i }))
        .filter(({ p }) => p.peran === 'siswa'),
    [data.pengguna]
  );

  const kelasTersedia = useMemo(
    () => [...data.kelas].sort((a, b) => a.nama.localeCompare(b.nama, 'id')),
    [data.kelas]
  );

  // Hitungan tab dihitung SETELAH filter kelas & cari (sebelum filter tab),
  // agar angka tab selalu cocok dengan baris yang sedang ditampilkan.
  const dasarFilter = useMemo(() => {
    const q = cari.trim().toLowerCase();
    return semuaSiswa.filter(({ p }) => {
      if (filterKelas && p.kelasId !== filterKelas) return false;
      if (!q) return true;
      return (
        p.nama.toLowerCase().includes(q) ||
        p.username.toLowerCase().includes(q) ||
        (p.nis || '').toLowerCase().includes(q)
      );
    });
  }, [semuaSiswa, filterKelas, cari]);

  const hitung = useMemo(
    () => ({
      semua: dasarFilter.length,
      sudah: dasarFilter.filter(({ p }) => sudahLogin(p)).length,
      belum: dasarFilter.filter(({ p }) => !sudahLogin(p)).length,
    }),
    [dasarFilter]
  );

  const terurut = useMemo(() => {
    const daftar = dasarFilter.filter(({ p }) => {
      if (tabLogin === 'sudah') return sudahLogin(p);
      if (tabLogin === 'belum') return !sudahLogin(p);
      return true;
    });
    const banding = (a: string, b: string) =>
      a.localeCompare(b, 'id', { numeric: true, sensitivity: 'base' });
    const terurutkan = [...daftar].sort((x, y) => {
      let hasil = 0;
      if (kunciUrut === 'urutan') hasil = x.urutan - y.urutan;
      else if (kunciUrut === 'nis') hasil = banding(x.p.nis || '', y.p.nis || '');
      else if (kunciUrut === 'username') hasil = banding(x.p.username, y.p.username);
      else if (kunciUrut === 'nama') hasil = banding(x.p.nama, y.p.nama);
      else if (kunciUrut === 'kelas') hasil = banding(namaKelas(x.p.kelasId), namaKelas(y.p.kelasId));
      else if (kunciUrut === 'ruang') hasil = banding(x.p.ruang || '', y.p.ruang || '');
      if (hasil === 0) hasil = x.urutan - y.urutan; // penyeimbang stabil
      return arahUrut === 'naik' ? hasil : -hasil;
    });
    return terurutkan;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dasarFilter, tabLogin, kunciUrut, arahUrut, data.kelas]);

  const totalHalaman = Math.max(1, Math.ceil(terurut.length / perHalaman));
  const halamanAktif = Math.min(halaman, totalHalaman);
  const barisHalaman = terurut.slice((halamanAktif - 1) * perHalaman, halamanAktif * perHalaman);

  // Kembali ke halaman 1 setiap filter berubah (agar tidak terjebak di
  // halaman kosong saat hasil menyusut).
  useEffect(() => {
    setHalaman(1);
  }, [filterKelas, tabLogin, cari, perHalaman]);

  const klikUrut = (k: KunciUrut) => {
    if (kunciUrut === k) {
      setArahUrut((a) => (a === 'naik' ? 'turun' : 'naik'));
    } else {
      setKunciUrut(k);
      setArahUrut('naik');
    }
  };

  const ikonUrut = (k: KunciUrut) =>
    kunciUrut !== k ? (
      <ArrowUpDown className="h-3.5 w-3.5 opacity-50" />
    ) : arahUrut === 'naik' ? (
      <ArrowUp className="h-3.5 w-3.5" />
    ) : (
      <ArrowDown className="h-3.5 w-3.5" />
    );

  const ThUrut = ({ label, k, className = '' }: { label: string; k: KunciUrut; className?: string }) => (
    <th className={thCls}>
      <button
        type="button"
        onClick={() => klikUrut(k)}
        className={`inline-flex items-center gap-1 uppercase tracking-wide hover:text-violet-600 ${className}`}
        title={`Urutkan berdasarkan ${label}`}
      >
        {label}
        {ikonUrut(k)}
      </button>
    </th>
  );

  // ---------- Form tambah/ubah ----------

  // Pembaruan FUNGSIONAL (pelajaran v1.3.1): tanpa ini, dropdown jenjang
  // tampak "tidak bisa diklik" karena panggilan ubah() berurutan saling menimpa.
  const ubah = <K extends keyof FormSiswa>(k: K, v: FormSiswa[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const bukaTambah = () => {
    setForm(FS_KOSONG);
    setLihatPwForm(false);
    setFormBuka(true);
  };

  const bukaUbah = (p: Pengguna) => {
    setForm({
      id: p.id,
      nama: p.nama,
      username: p.username,
      password: '',
      nis: p.nis || '',
      jenjangId: p.jenjangId || '',
      kelasId: p.kelasId || '',
      ruang: p.ruang || '',
      noHP: p.noHP || '',
      aktif: p.aktif === 1,
    });
    setLihatPwForm(false);
    setFormBuka(true);
  };

  const simpan = async () => {
    if (!form.nama.trim() || !form.username.trim()) return toast('Nama & username wajib.', 'error');
    if (!form.nis.trim()) return toast('NIS wajib untuk siswa.', 'error');
    if (!form.jenjangId || !form.kelasId) return toast('Jenjang & kelas wajib untuk siswa.', 'error');
    setLoadingForm(true);
    try {
      await savePengguna({
        ...(form.id ? { id: form.id } : {}),
        nama: form.nama.trim(),
        username: form.username.trim(),
        peran: 'siswa',
        ...(form.password ? { password: form.password } : {}),
        nis: form.nis.trim(),
        jenjangId: form.jenjangId,
        kelasId: form.kelasId,
        ruang: form.ruang.trim(),
        noHP: form.noHP.trim(),
        aktif: form.aktif ? 1 : 0,
      });
      toast('Siswa tersimpan.', 'sukses');
      setFormBuka(false);
      await refreshData();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal menyimpan.', 'error');
    } finally {
      setLoadingForm(false);
    }
  };

  // ---------- Hapus ----------

  const hapus = async () => {
    if (!hapusId) return;
    try {
      await deletePengguna(hapusId);
      toast('Siswa dihapus.', 'sukses');
      sel.aturBanyak([hapusId], false);
      setHapusId(null);
      await refreshData();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal menghapus.', 'error');
    }
  };

  const hapusMassal = async () => {
    setHapusMassalBuka(false);
    const ids = [...sel.terpilih];
    let okCount = 0;
    const gagal: string[] = [];
    for (const id of ids) {
      const p = data.pengguna.find((x) => x.id === id);
      try {
        await deletePengguna(id);
        okCount++;
      } catch (err) {
        gagal.push(`${p?.nama || id}: ${err instanceof Error ? err.message : 'gagal'}`);
      }
    }
    sel.kosongkan();
    await refreshData();
    toast(
      `Hapus massal: ${okCount} siswa dihapus${gagal.length ? `, ${gagal.length} gagal — ${gagal.slice(0, 3).join(' | ')}` : ''}.`,
      gagal.length ? 'error' : 'sukses'
    );
  };

  const ubahTerpilih = () => {
    const id = [...sel.terpilih][0];
    const p = data.pengguna.find((x) => x.id === id);
    if (p) bukaUbah(p);
  };

  // ---------- Password massal ----------

  /** Scope tombol Password di toolbar: yang diceklis bila ada, kalau tidak yang sedang tampil. */
  const bukaPasswordToolbar = () => {
    if (sel.terpilih.size > 0) {
      const target = semuaSiswa.map(({ p }) => p).filter((p) => sel.terpilih.has(p.id));
      setPwTarget(target);
    } else {
      setPwTarget(terurut.map(({ p }) => p));
    }
  };

  // ---------- Ekspor ----------

  const ekspor = () => {
    if (terurut.length === 0) return toast('Tidak ada siswa untuk diekspor.', 'error');
    const header = ['No', 'No Peserta (NIS)', 'Username', 'Nama Siswa', 'Kelas', 'Ruang', 'No. WA Orang Tua', 'Status Login', 'Terakhir Login'];
    const isi = terurut.map(({ p }, i) => [
      String(i + 1),
      p.nis || '',
      p.username,
      p.nama,
      namaKelas(p.kelasId),
      p.ruang || '',
      p.noHP || '',
      sudahLogin(p) ? 'Sudah login' : 'Belum login',
      p.terakhirLogin ? formatTanggalWaktu(p.terakhirLogin) : '',
    ]);
    const xlsx = buatXlsx([{ nama: 'Data Siswa', data: [header, ...isi] }]);
    unduhBlob(
      `data-siswa-${hariIniISO()}.xlsx`,
      new Blob([xlsx], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    );
    toast(`File Excel ${terurut.length} siswa diunduh.`, 'sukses');
  };

  // ---------- Paginasi ----------

  const nomorHalaman = useMemo(() => {
    const awal = Math.max(1, Math.min(halamanAktif - 2, totalHalaman - 4));
    const akhir = Math.min(totalHalaman, awal + 4);
    const daftar: number[] = [];
    for (let n = awal; n <= akhir; n++) daftar.push(n);
    return daftar;
  }, [halamanAktif, totalHalaman]);

  const dariBaris = terurut.length === 0 ? 0 : (halamanAktif - 1) * perHalaman + 1;
  const sampaiBaris = Math.min(terurut.length, halamanAktif * perHalaman);
  const ceklisHalamanPenuh =
    barisHalaman.length > 0 && barisHalaman.every(({ p }) => sel.terpilih.has(p.id));

  return (
    <div>
      <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 sm:text-2xl">Data Siswa</h1>
      <nav className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-sm dark:bg-slate-800">
        <button onClick={() => pindah('dashboard')} className="font-medium text-blue-600 hover:underline">
          Dashboard
        </button>
        <span className="text-slate-400">/</span>
        <span className="text-slate-500 dark:text-slate-400">Data Siswa</span>
      </nav>

      <Card className="mt-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Daftar Siswa</h2>
          <div className="flex flex-wrap gap-2">
            <Button varian="sekunder" kecil onClick={() => setImporBuka(true)}>
              <FileUp className="h-3.5 w-3.5" /> Impor
            </Button>
            <Button varian="sekunder" kecil onClick={ekspor}>
              <Download className="h-3.5 w-3.5" /> Ekspor
            </Button>
            <Button varian="sekunder" kecil onClick={bukaPasswordToolbar} disabled={terurut.length === 0 && sel.terpilih.size === 0}>
              <KeyRound className="h-3.5 w-3.5" /> Password
            </Button>
            <Button varian="sekunder" kecil onClick={() => pindah('kartu-peserta')}>
              <CreditCard className="h-3.5 w-3.5" /> Cetak Kartu
            </Button>
            <Button varian="biru" kecil onClick={bukaTambah}>
              <Plus className="h-3.5 w-3.5" /> Tambah Siswa
            </Button>
          </div>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            Tampilkan:
            <span className="inline-block w-20">
              <SelectInput
                value={perHalaman}
                onChange={(e) => setPerHalaman(Number(e.target.value))}
                aria-label="Jumlah data per halaman"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </SelectInput>
            </span>
            data
          </label>
          <div className="w-44">
            <SelectInput
              value={filterKelas}
              onChange={(e) => setFilterKelas(e.target.value)}
              aria-label="Filter kelas"
            >
              <option value="">Semua kelas</option>
              {kelasTersedia.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.nama}
                </option>
              ))}
            </SelectInput>
          </div>

          <div className="flex flex-wrap items-center gap-1 rounded-full border border-slate-200 p-1 dark:border-slate-700">
            <TabLoginBtn aktif={tabLogin === 'semua'} onClick={() => setTabLogin('semua')} label="Semua" jumlah={hitung.semua} />
            <TabLoginBtn aktif={tabLogin === 'sudah'} onClick={() => setTabLogin('sudah')} label="Sudah login" jumlah={hitung.sudah} dot="bg-emerald-500" />
            <TabLoginBtn aktif={tabLogin === 'belum'} onClick={() => setTabLogin('belum')} label="Belum login" jumlah={hitung.belum} dot="bg-slate-400" />
          </div>

          <div className="relative ml-auto min-w-[180px] flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <TextInput
              value={cari}
              onChange={(e) => setCari(e.target.value)}
              placeholder="Cari siswa..."
              className="pl-9"
              aria-label="Cari siswa"
            />
          </div>
        </div>

        {sel.terpilih.size > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 dark:border-violet-900 dark:bg-violet-950">
            <span className="text-sm font-bold text-violet-700 dark:text-violet-200">{sel.terpilih.size} dipilih</span>
            <Button kecil varian="kuning" onClick={bukaPasswordToolbar}>
              <KeyRound className="h-3.5 w-3.5" /> Password
            </Button>
            {sel.terpilih.size === 1 && (
              <Button kecil varian="sekunder" onClick={ubahTerpilih}>
                Ubah
              </Button>
            )}
            <Button kecil varian="bahaya" onClick={() => setHapusMassalBuka(true)}>
              Hapus terpilih
            </Button>
            <Button kecil varian="sekunder" onClick={sel.kosongkan}>
              Batalkan pilihan
            </Button>
          </div>
        )}

        {semuaSiswa.length === 0 ? (
          <EmptyState
            judul="Belum ada siswa"
            subjudul="Tambahkan siswa lewat tombol Tambah Siswa atau Impor dari Excel."
          />
        ) : (
          <>
            <TabelResponsif>
              <table className="w-full min-w-[860px]">
                <thead>
                  <tr>
                    <th className={thCls}>
                      <Ceklis
                        checked={ceklisHalamanPenuh}
                        onChange={(v) => sel.aturBanyak(barisHalaman.map(({ p }) => p.id), v)}
                        label="Pilih semua siswa di halaman ini"
                      />
                    </th>
                    <ThUrut label="ID" k="urutan" />
                    <ThUrut label="No Peserta" k="nis" />
                    <ThUrut label="Username" k="username" />
                    <ThUrut label="Nama Siswa" k="nama" />
                    <ThUrut label="Kelas" k="kelas" />
                    <ThUrut label="Ruang" k="ruang" />
                    <th className={thCls}>Password</th>
                    <th className={thCls}>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {barisHalaman.length === 0 ? (
                    <tr>
                      <td colSpan={9} className={tdCls + ' py-8 text-center text-slate-400'}>
                        Tidak ada siswa yang cocok dengan filter/pencarian.
                      </td>
                    </tr>
                  ) : (
                    barisHalaman.map(({ p }, i) => {
                      const nomorGlobal = (halamanAktif - 1) * perHalaman + i + 1;
                      return (
                        <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                          <td className={tdCls}>
                            <Ceklis checked={sel.terpilih.has(p.id)} onChange={() => sel.toggle(p.id)} label={`Pilih ${p.nama}`} />
                          </td>
                          <td className={tdCls}>{nomorGlobal}</td>
                          <td className={tdCls}>
                            {p.nis ? (
                              <span className="rounded-md border border-slate-300 px-2 py-0.5 font-mono-num text-xs font-semibold text-slate-700 dark:border-slate-600 dark:text-slate-200">
                                {p.nis}
                              </span>
                            ) : (
                              '-'
                            )}
                          </td>
                          <td className={tdCls}>{p.username}</td>
                          <td className={tdCls}>
                            <p className="font-semibold">
                              {p.nama}{' '}
                              {p.aktif !== 1 && <Badge warna="merah">Nonaktif</Badge>}
                            </p>
                            <p className="text-xs text-slate-400">
                              {sudahLogin(p) ? (
                                <>
                                  <span className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-500" />
                                  Terakhir login {formatTanggalWaktu(p.terakhirLogin)}
                                </>
                              ) : (
                                <>
                                  <span className="mr-1 inline-block h-2 w-2 rounded-full bg-slate-300" />
                                  Belum pernah login
                                </>
                              )}
                            </p>
                          </td>
                          <td className={tdCls + ' text-center'}>{namaKelas(p.kelasId)}</td>
                          <td className={tdCls}>{p.ruang || '-'}</td>
                          <td className={tdCls}>
                            <span className="tracking-[0.2em] text-slate-500" title="Password tersimpan terenkripsi dan tidak bisa ditampilkan. Gunakan tombol Password untuk membuat password baru.">
                              ••••••
                            </span>
                            <p className="flex items-center gap-1 text-[11px] text-slate-400">
                              <Lock className="h-3 w-3" /> Terenkripsi
                            </p>
                          </td>
                          <td className={tdCls}>
                            <div className="flex gap-1">
                              <button
                                onClick={() => setPwTarget([p])}
                                className="rounded-lg p-1.5 text-amber-600 hover:bg-amber-50"
                                title="Ganti password"
                              >
                                <KeyRound className="h-4 w-4" />
                              </button>
                              <button onClick={() => bukaUbah(p)} className="rounded-lg p-1.5 text-blue-600 hover:bg-blue-50" title="Ubah">
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button onClick={() => setHapusId(p.id)} className="rounded-lg p-1.5 text-red-600 hover:bg-red-50" title="Hapus">
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </TabelResponsif>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Menampilkan {dariBaris}–{sampaiBaris} dari {terurut.length} siswa
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setHalaman(Math.max(1, halamanAktif - 1))}
                  disabled={halamanAktif <= 1}
                  className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  aria-label="Halaman sebelumnya"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                {nomorHalaman.map((n) => (
                  <button
                    key={n}
                    onClick={() => setHalaman(n)}
                    className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                      n === halamanAktif
                        ? 'bg-violet-600 text-white'
                        : 'border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
                    }`}
                  >
                    {n}
                  </button>
                ))}
                <button
                  onClick={() => setHalaman(Math.min(totalHalaman, halamanAktif + 1))}
                  disabled={halamanAktif >= totalHalaman}
                  className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  aria-label="Halaman berikutnya"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </Card>

      <p className="mt-3 text-xs text-slate-400">
        Status “Sudah login” terisi otomatis saat siswa masuk (login) setelah update v1.5.0 — siswa yang
        belum pernah login sejak update tampil sebagai “Belum login”. Password siswa tersimpan terenkripsi
        dan tidak bisa ditampilkan; buat password baru lewat tombol Password, lalu salin/unduh hasilnya.
      </p>

      {imporBuka && (
        <Modal judul="Impor Siswa" onTutup={() => setImporBuka(false)} lebar="max-w-3xl">
          <TabImporSiswa toast={toast} refreshData={refreshData} />
        </Modal>
      )}

      {formBuka && (
        <Modal judul={form.id ? 'Ubah Siswa' : 'Tambah Siswa'} onTutup={() => setFormBuka(false)}>
          <div className="space-y-4">
            <Field label="Nama lengkap">
              <TextInput value={form.nama} onChange={(e) => ubah('nama', e.target.value)} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Username">
                <TextInput value={form.username} onChange={(e) => ubah('username', e.target.value)} />
              </Field>
              <Field label="NIS (No Peserta)">
                <TextInput value={form.nis} onChange={(e) => ubah('nis', e.target.value)} />
              </Field>
            </div>
            <Field
              label={
                form.id
                  ? 'Password baru (kosongkan bila tidak diubah)'
                  : 'Password (kosong = NIS)'
              }
            >
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <TextInput
                    type={lihatPwForm ? 'text' : 'password'}
                    value={form.password}
                    onChange={(e) => ubah('password', e.target.value)}
                    autoComplete="new-password"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setLihatPwForm((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    title={lihatPwForm ? 'Sembunyikan password' : 'Lihat password'}
                  >
                    {lihatPwForm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <Button
                  varian="sekunder"
                  onClick={() => {
                    ubah('password', buatPasswordAcak(6, 'angka'));
                    setLihatPwForm(true);
                  }}
                >
                  <RefreshCw className="h-4 w-4" /> Acak
                </Button>
              </div>
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Jenjang">
                <SelectInput
                  value={form.jenjangId}
                  onChange={(e) => {
                    ubah('jenjangId', e.target.value);
                    ubah('kelasId', '');
                  }}
                >
                  <option value="">— Pilih —</option>
                  {data.jenjang.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.nama}
                    </option>
                  ))}
                </SelectInput>
              </Field>
              <Field label="Kelas">
                <SelectInput value={form.kelasId} onChange={(e) => ubah('kelasId', e.target.value)}>
                  <option value="">— Pilih —</option>
                  {data.kelas
                    .filter((k) => !form.jenjangId || k.jenjangId === form.jenjangId)
                    .map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.nama}
                      </option>
                    ))}
                </SelectInput>
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Ruang (opsional)">
                <TextInput
                  value={form.ruang}
                  onChange={(e) => ubah('ruang', e.target.value)}
                  placeholder="cth: R1"
                />
              </Field>
              <Field label="No. WA Orang Tua (opsional)">
                <TextInput
                  value={form.noHP}
                  onChange={(e) => ubah('noHP', e.target.value)}
                  placeholder="cth: 081234567890"
                />
              </Field>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
              <input
                type="checkbox"
                checked={form.aktif}
                onChange={(e) => ubah('aktif', e.target.checked)}
                className="h-4 w-4 accent-violet-600"
              />
              Akun aktif
            </label>
            <div className="flex justify-end gap-2">
              <Button varian="sekunder" onClick={() => setFormBuka(false)}>
                Batal
              </Button>
              <Button onClick={simpan} loading={loadingForm}>
                Simpan
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {hapusId && (
        <ConfirmDialog
          judul="Hapus siswa?"
          pesan="Akun siswa akan dihapus permanen."
          onYa={hapus}
          onBatal={() => setHapusId(null)}
        />
      )}

      {hapusMassalBuka && (
        <ConfirmDialog
          judul={`Hapus ${sel.terpilih.size} siswa?`}
          pesan="Akun siswa terpilih akan dihapus permanen."
          onYa={hapusMassal}
          onBatal={() => setHapusMassalBuka(false)}
        />
      )}

      {pwTarget && (
        <ModalPassword
          targets={pwTarget}
          onTutup={() => setPwTarget(null)}
          onSelesai={async () => {
            sel.kosongkan();
            await refreshData();
          }}
          toast={toast}
        />
      )}
    </div>
  );
}

function TabLoginBtn({
  aktif,
  onClick,
  label,
  jumlah,
  dot,
}: {
  aktif: boolean;
  onClick: () => void;
  label: string;
  jumlah: number;
  dot?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition ${
        aktif
          ? 'bg-violet-600 text-white'
          : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
      }`}
    >
      {dot && <span className={`h-2 w-2 rounded-full ${dot}`} />}
      {label}
      <span
        className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold leading-none ${
          aktif ? 'bg-white/25 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-200'
        }`}
      >
        {jumlah}
      </span>
    </button>
  );
}

// ================= FORM SISWA =================

interface FormSiswa {
  id?: string;
  nama: string;
  username: string;
  password: string;
  nis: string;
  jenjangId: string;
  kelasId: string;
  ruang: string;
  noHP: string;
  aktif: boolean;
}

const FS_KOSONG: FormSiswa = {
  nama: '',
  username: '',
  password: '',
  nis: '',
  jenjangId: '',
  kelasId: '',
  ruang: '',
  noHP: '',
  aktif: true,
};

// ================= MODAL PASSWORD =================

interface BarisHasilPassword {
  nama: string;
  username: string;
  nis: string;
  password: string;
}

/**
 * Modal generate password (v1.5.0): 1) password SAMA untuk semua target
 * dalam sekali generate, atau 2) password ACAK berbeda per siswa.
 * Password dibuat di browser lalu dikirim per batch 100 ke backend
 * (backend hanya menyimpan hash). Hasil tampil SEKALI di sini — salin
 * atau unduh sebelum menutup, karena password tidak bisa dilihat lagi.
 */
function ModalPassword({
  targets,
  onTutup,
  onSelesai,
  toast,
}: {
  targets: Pengguna[];
  onTutup: () => void;
  onSelesai: () => Promise<void>;
  toast: PageProps['toast'];
}) {
  const satu = targets.length === 1;
  const [mode, setMode] = useState<'sama' | 'acak'>('sama');
  const [pwSama, setPwSama] = useState('');
  const [lihatPw, setLihatPw] = useState(false);
  const [panjang, setPanjang] = useState(6);
  const [jenis, setJenis] = useState<JenisPasswordAcak>('angka');
  const [loading, setLoading] = useState(false);
  const [progres, setProgres] = useState('');
  const [hasil, setHasil] = useState<BarisHasilPassword[] | null>(null);
  const [gagalPesan, setGagalPesan] = useState<string[]>([]);

  const contohAcak = useMemo(() => buatPasswordAcak(panjang, jenis), [panjang, jenis]);

  const terapkan = async () => {
    if (targets.length === 0) return;
    let items: { id: string; password: string }[];
    if (mode === 'sama') {
      const pw = pwSama.trim();
      if (!passwordKetikValid(pw)) return toast('Password sama minimal 4 karakter.', 'error');
      items = targets.map((t) => ({ id: t.id, password: pw }));
    } else {
      const daftar = buatBanyakPasswordAcak(targets.length, panjang, jenis);
      items = targets.map((t, i) => ({ id: t.id, password: daftar[i] }));
    }
    setLoading(true);
    try {
      // Kirim per batch 100 (pola impor) agar request tidak terlalu besar.
      const UKURAN_BATCH = 100;
      let diubah = 0;
      const gagal: string[] = [];
      const gagalIds = new Set<string>();
      for (let b = 0; b < items.length; b += UKURAN_BATCH) {
        const potong = items.slice(b, b + UKURAN_BATCH);
        setProgres(`Menerapkan ${Math.min(b + UKURAN_BATCH, items.length)}/${items.length}…`);
        const r = await setPasswordMassal(potong);
        diubah += r.diubah;
        for (const g of r.gagal) {
          gagalIds.add(g.id);
          const nama = targets.find((t) => t.id === g.id)?.nama || g.id;
          gagal.push(`${nama}: ${g.pesan}`);
        }
      }
      const baris: BarisHasilPassword[] = [];
      for (let i = 0; i < targets.length; i++) {
        if (gagalIds.has(targets[i].id)) continue;
        baris.push({
          nama: targets[i].nama,
          username: targets[i].username,
          nis: targets[i].nis || '',
          password: items[i].password,
        });
      }
      setHasil(baris);
      setGagalPesan(gagal);
      toast(
        `Password diterapkan: ${diubah} siswa${gagal.length ? `, ${gagal.length} gagal` : ''}. Salin/unduh hasilnya sebelum menutup.`,
        gagal.length ? 'error' : 'sukses'
      );
      await onSelesai();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal menerapkan password.', 'error');
    } finally {
      setLoading(false);
      setProgres('');
    }
  };

  const salinSemua = async () => {
    if (!hasil) return;
    const teks = ['Nama\tUsername\tPassword Baru', ...hasil.map((b) => `${b.nama}\t${b.username}\t${b.password}`)].join('\n');
    const ok = await salinTeks(teks);
    toast(ok ? 'Daftar password tersalin.' : 'Gagal menyalin — salin manual dari tabel.', ok ? 'sukses' : 'error');
  };

  const salinSatu = async (b: BarisHasilPassword) => {
    const ok = await salinTeks(b.password);
    toast(ok ? `Password ${b.nama} tersalin.` : 'Gagal menyalin.', ok ? 'sukses' : 'error');
  };

  const unduhHasil = () => {
    if (!hasil) return;
    const header = ['No', 'Nama', 'Username', 'No Peserta (NIS)', 'Password Baru'];
    const isi = hasil.map((b, i) => [String(i + 1), b.nama, b.username, b.nis, b.password]);
    const xlsx = buatXlsx([{ nama: 'Password Siswa', data: [header, ...isi] }]);
    unduhBlob(
      `password-siswa-${hariIniISO()}.xlsx`,
      new Blob([xlsx], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    );
    toast('File Excel password diunduh.', 'sukses');
  };

  return (
    <Modal
      judul={satu ? `Ganti Password — ${targets[0].nama}` : `Generate Password (${targets.length} siswa)`}
      onTutup={onTutup}
      lebar="max-w-2xl"
    >
      {!hasil ? (
        <div className="space-y-4">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Password baru berlaku untuk{' '}
            <b className="text-slate-800 dark:text-slate-100">
              {satu ? targets[0].nama : `${targets.length} siswa`}
            </b>
            . Siswa yang sedang login akan diminta masuk ulang. Password lama tidak bisa dikembalikan.
          </p>

          <div className="space-y-2">
            <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
              <input
                type="radio"
                name="mode-password"
                checked={mode === 'sama'}
                onChange={() => setMode('sama')}
                className="mt-1 h-4 w-4 accent-violet-600"
              />
              <span className="flex-1">
                <span className="block font-semibold text-slate-800 dark:text-slate-100">
                  1. Password sama untuk semua
                </span>
                <span className="block text-xs text-slate-400">
                  Satu password yang sama diterapkan ke {satu ? 'siswa ini' : 'semua siswa target'} dalam sekali generate.
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
              <input
                type="radio"
                name="mode-password"
                checked={mode === 'acak'}
                onChange={() => setMode('acak')}
                className="mt-1 h-4 w-4 accent-violet-600"
              />
              <span className="flex-1">
                <span className="block font-semibold text-slate-800 dark:text-slate-100">
                  2. Password acak berbeda-beda
                </span>
                <span className="block text-xs text-slate-400">
                  Setiap siswa mendapat password acak yang berbeda dalam sekali generate.
                </span>
              </span>
            </label>
          </div>

          {mode === 'sama' ? (
            <Field label="Password baru (minimal 4 karakter)">
              <div className="relative">
                <TextInput
                  type={lihatPw ? 'text' : 'password'}
                  value={pwSama}
                  onChange={(e) => setPwSama(e.target.value)}
                  autoComplete="new-password"
                  placeholder="cth: 123456"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setLihatPw((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  title={lihatPw ? 'Sembunyikan password' : 'Lihat password'}
                >
                  {lihatPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </Field>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Panjang password">
                <SelectInput value={panjang} onChange={(e) => setPanjang(Number(e.target.value))}>
                  <option value={6}>6 karakter</option>
                  <option value={8}>8 karakter</option>
                </SelectInput>
              </Field>
              <Field label="Jenis karakter">
                <SelectInput value={jenis} onChange={(e) => setJenis(e.target.value as JenisPasswordAcak)}>
                  <option value="angka">Angka saja (cth: 482917)</option>
                  <option value="alfanumerik">Huruf + angka</option>
                </SelectInput>
              </Field>
              <p className="text-sm text-slate-500 dark:text-slate-400 sm:col-span-2">
                Contoh hasil acak:{' '}
                <code className="rounded bg-slate-100 px-2 py-0.5 font-mono-num font-bold text-slate-800 dark:bg-slate-800 dark:text-slate-100">
                  {contohAcak}
                </code>{' '}
                (contoh saja — password sebenarnya dibuat saat tombol di bawah ditekan)
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button varian="sekunder" onClick={onTutup} disabled={loading}>
              Batal
            </Button>
            <Button onClick={terapkan} loading={loading}>
              <KeyRound className="h-4 w-4" /> {progres || 'Generate & Terapkan'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
            Password hanya ditampilkan di sini. Salin atau unduh sekarang — setelah modal ditutup,
            password tidak bisa dilihat lagi karena tersimpan terenkripsi.
          </div>
          {gagalPesan.length > 0 && (
            <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
              {gagalPesan.length} gagal: {gagalPesan.slice(0, 3).join(' | ')}
              {gagalPesan.length > 3 ? ' …' : ''}
            </div>
          )}
          <TabelResponsif>
            <table className="w-full min-w-[420px]">
              <thead>
                <tr>
                  <th className={thCls}>Nama</th>
                  <th className={thCls}>Username</th>
                  <th className={thCls}>Password Baru</th>
                  <th className={thCls}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {hasil.map((b) => (
                  <tr key={b.username}>
                    <td className={tdCls}>{b.nama}</td>
                    <td className={tdCls}>{b.username}</td>
                    <td className={tdCls}>
                      <code className="font-mono-num font-bold tracking-wider">{b.password}</code>
                    </td>
                    <td className={tdCls}>
                      <button
                        onClick={() => salinSatu(b)}
                        className="rounded-lg p-1.5 text-blue-600 hover:bg-blue-50"
                        title="Salin password"
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TabelResponsif>
          <div className="flex flex-wrap justify-end gap-2">
            <Button varian="sekunder" onClick={salinSemua}>
              <Copy className="h-4 w-4" /> Salin Semua
            </Button>
            <Button varian="sekunder" onClick={unduhHasil}>
              <Download className="h-4 w-4" /> Unduh Excel
            </Button>
            <Button onClick={onTutup}>Tutup</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
