import { useState } from 'react';
import { Database, Link2, PlugZap, RefreshCw } from 'lucide-react';
import { Button, Card, ConfirmDialog, Field, PageHeader, TextInput } from '../components/ui';
import { getApiUrl, initDatabase, ping, setApiUrl } from '../services/api';
import type { PageProps } from './PageProps';
import type { SekolahEntry } from '../types';

interface Props extends PageProps {
  sekolah: SekolahEntry | null;
  daftarSekolah: SekolahEntry[];
  onGantiSekolah: (s: SekolahEntry) => void;
  onApiUrlChange: (url: string) => Promise<void>;
}

// Selalu bisa dibuka walau getAllData() gagal — halaman pemulihan.
export default function Konfigurasi({ toast, sekolah, daftarSekolah, onGantiSekolah, onApiUrlChange }: Props) {
  const [urlManual, setUrlManual] = useState(getApiUrl());
  const [ujiLoading, setUjiLoading] = useState(false);
  const [hasilUji, setHasilUji] = useState('');
  const [konfirmInit, setKonfirmInit] = useState(false);
  const [initLoading, setInitLoading] = useState(false);

  const simpanUrl = async () => {
    const u = urlManual.trim();
    if (u && !u.startsWith('http')) {
      toast('URL harus diawali http(s)://', 'error');
      return;
    }
    setApiUrl(u);
    await onApiUrlChange(u);
    toast(u ? 'URL backend manual disimpan.' : 'Override URL dihapus; memakai URL sekolah.', 'sukses');
  };

  const ujiKoneksi = async () => {
    setUjiLoading(true);
    setHasilUji('');
    try {
      const d = await ping();
      setHasilUji(`Terhubung ✓ — versi ${d.version || '?'}, waktu server: ${d.waktu || '-'}`);
      toast('Koneksi backend OK.', 'sukses');
    } catch (err) {
      const m = err instanceof Error ? err.message : 'Gagal.';
      setHasilUji(`Gagal: ${m}`);
      toast(m, 'error');
    } finally {
      setUjiLoading(false);
    }
  };

  const inisialisasi = async () => {
    setInitLoading(true);
    try {
      const d = await initDatabase();
      toast(`Database terinisialisasi: ${(d.sheets || []).length} sheet.`, 'sukses');
      setHasilUji(`Sheet: ${(d.sheets || []).join(', ')}`);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Inisialisasi gagal.', 'error');
    } finally {
      setInitLoading(false);
      setKonfirmInit(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader judul="Konfigurasi" subjudul="Pilih sekolah & hubungkan ke backend Google Apps Script." />

      <Card className="mb-4">
        <h2 className="mb-3 font-bold text-slate-900 dark:text-slate-100">Sekolah Aktif</h2>
        <div className="space-y-2">
          {daftarSekolah.map((s) => (
            <button
              key={s.id}
              onClick={() => onGantiSekolah(s)}
              className={`block w-full rounded-xl border p-3.5 text-left transition ${
                sekolah?.id === s.id
                  ? 'border-violet-600 bg-violet-50'
                  : 'border-slate-200 dark:border-slate-700 hover:border-violet-300 hover:bg-slate-50 dark:hover:bg-slate-800 dark:bg-slate-800'
              }`}
            >
              <p className="font-bold text-slate-900 dark:text-slate-100">{s.nama}</p>
              {s.kota && <p className="text-xs text-slate-500 dark:text-slate-400">{s.kota}</p>}
              <p className="mt-1 truncate text-xs text-slate-400">{s.apiUrl || '(URL backend belum diisi)'}</p>
            </button>
          ))}
          {daftarSekolah.length === 0 && (
            <p className="text-sm text-slate-500 dark:text-slate-400">Belum ada sekolah di <code>public/schools.json</code>.</p>
          )}
        </div>
      </Card>

      <Card className="mb-4">
        <h2 className="mb-3 flex items-center gap-2 font-bold text-slate-900 dark:text-slate-100">
          <Link2 className="h-5 w-5 text-violet-600" /> URL Backend Manual
        </h2>
        <Field label="URL /exec Apps Script (opsional — menimpa URL sekolah)">
          <TextInput
            value={urlManual}
            onChange={(e) => setUrlManual(e.target.value)}
            placeholder="https://script.google.com/macros/s/.../exec"
          />
        </Field>
        <Button onClick={simpanUrl} className="mt-3">
          Simpan URL
        </Button>
        <p className="mt-2 text-xs text-slate-400">
          URL efektif saat ini:{' '}
          <span className="break-all font-mono">{getApiUrl() || sekolah?.apiUrl || '(belum ada)'}</span>
        </p>
      </Card>

      <Card>
        <h2 className="mb-3 flex items-center gap-2 font-bold text-slate-900 dark:text-slate-100">
          <Database className="h-5 w-5 text-violet-600" /> Tes & Inisialisasi
        </h2>
        <div className="flex flex-wrap gap-2">
          <Button varian="sekunder" onClick={ujiKoneksi} loading={ujiLoading}>
            <PlugZap className="h-4 w-4" /> Uji Koneksi
          </Button>
          <Button varian="kuning" onClick={() => setKonfirmInit(true)}>
            <RefreshCw className="h-4 w-4" /> Inisialisasi Database
          </Button>
        </div>
        {hasilUji && (
          <p className="mt-3 rounded-xl bg-slate-50 dark:bg-slate-800 px-4 py-3 text-sm text-slate-700 dark:text-slate-200">{hasilUji}</p>
        )}
        <p className="mt-3 text-xs text-slate-400">
          Inisialisasi membuat 12 sheet (Pengaturan, Pengguna, Jenjang, Mapel, Kelas, BankSoal, Paket,
          SesiUjian, JawabanSiswa, Hasil, LogAktivitas, Notifikasi) beserta akun bawaan admin dan guru —
          kata sandi bawaannya ada di README; segera ganti setelah login pertama. Data yang sudah ada
          tidak dihapus.
        </p>
      </Card>

      {konfirmInit && (
        <ConfirmDialog
          judul="Inisialisasi Database?"
          pesan="Backend akan membuat semua sheet yang belum ada beserta akun bawaan. Data yang sudah ada tidak dihapus. Lanjutkan?"
          teksYa="Ya, Inisialisasi"
          varian="kuning"
          loading={initLoading}
          onYa={inisialisasi}
          onBatal={() => setKonfirmInit(false)}
        />
      )}
    </div>
  );
}
