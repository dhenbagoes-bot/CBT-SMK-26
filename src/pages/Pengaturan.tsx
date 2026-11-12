import { useRef, useState } from 'react';
import { ImagePlus, Save } from 'lucide-react';
import { Button, Card, Field, PageHeader, SelectInput, TextInput } from '../components/ui';
import { savePengaturan, uploadLogo } from '../services/api';
import type { Pengaturan as PengaturanTipe } from '../types';
import type { PageProps } from './PageProps';

export default function Pengaturan({ pengaturan, toast, refreshData }: PageProps) {
  const [form, setForm] = useState<PengaturanTipe>(pengaturan);
  const [loading, setLoading] = useState(false);
  const [unggahLoading, setUnggahLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const ubah = <K extends keyof PengaturanTipe>(k: K, v: PengaturanTipe[K]) =>
    setForm({ ...form, [k]: v });

  const simpan = async () => {
    const ambang = Number(form.ambangPeringatan);
    if (!Number.isInteger(ambang) || ambang < 1 || ambang > 10)
      return toast('Ambang peringatan harus 1–10.', 'error');
    const kkm = Number(form.kkm);
    if (!Number.isInteger(kkm) || kkm < 0 || kkm > 100)
      return toast('KKM harus 0–100.', 'error');
    const durasiStandar = Number(form.durasiStandar);
    if (!Number.isInteger(durasiStandar) || durasiStandar < 5 || durasiStandar > 300)
      return toast('Durasi standar harus 5–300 menit.', 'error');
    const jedaGelombang = Number(form.jedaGelombang);
    if (!Number.isInteger(jedaGelombang) || jedaGelombang < 0 || jedaGelombang > 60)
      return toast('Jeda gelombang harus 0–60 menit.', 'error');
    setLoading(true);
    try {
      await savePengaturan({
        namaSekolah: form.namaSekolah,
        alamatSekolah: form.alamatSekolah,
        telepon: form.telepon,
        namaKepala: form.namaKepala,
        logoUrl: form.logoUrl,
        ambangPeringatan: ambang,
        wajibFullscreen: form.wajibFullscreen ? 1 : 0,
        izinkanUlangSetelahBatal: form.izinkanUlangSetelahBatal ? 1 : 0,
        kkm,
        durasiStandar,
        jedaGelombang,
        waAktif: form.waAktif,
        waEndpoint: form.waEndpoint,
        waApiKey: form.waApiKey,
        waTemplateProgres: form.waTemplateProgres,
      });
      toast('Pengaturan tersimpan.', 'sukses');
      await refreshData();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal menyimpan.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const unggahLogo = async (f: File) => {
    if (!f.type.startsWith('image/')) return toast('File harus gambar (PNG/JPG).', 'error');
    if (f.size > 2 * 1024 * 1024) return toast('Ukuran logo maksimal 2 MB.', 'error');
    setUnggahLoading(true);
    try {
      const buf = await f.arrayBuffer();
      let bin = '';
      const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      const r = await uploadLogo(btoa(bin), f.type);
      ubah('logoUrl', r.url);
      toast('Logo terunggah. Jangan lupa Simpan Pengaturan.', 'sukses');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal mengunggah logo.', 'error');
    } finally {
      setUnggahLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader judul="Pengaturan" subjudul="Identitas & aturan ujian." />

      <Card className="mb-4">
        <h2 className="mb-3 font-bold text-slate-900 dark:text-slate-100">Identitas</h2>
        <div className="space-y-4">
          <Field label="Nama sekolah">
            <TextInput value={form.namaSekolah} onChange={(e) => ubah('namaSekolah', e.target.value)} />
          </Field>
          <Field label="Alamat">
            <TextInput value={form.alamatSekolah} onChange={(e) => ubah('alamatSekolah', e.target.value)} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Telepon">
              <TextInput value={form.telepon} onChange={(e) => ubah('telepon', e.target.value)} />
            </Field>
            <Field label="Nama kepala sekolah">
              <TextInput value={form.namaKepala} onChange={(e) => ubah('namaKepala', e.target.value)} />
            </Field>
          </div>
          <div>
            <span className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-200">Logo sekolah</span>
            <div className="flex items-center gap-3">
              {form.logoUrl ? (
                <img src={form.logoUrl} alt="Logo" className="h-16 w-16 rounded-xl border object-contain" />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 text-2xl">🎓</div>
              )}
              <div className="flex items-center gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) unggahLogo(f);
                    e.target.value = '';
                  }}
                />
                <Button varian="sekunder" kecil loading={unggahLoading} onClick={() => fileRef.current?.click()}>
                  <ImagePlus className="h-4 w-4" /> Unggah Logo
                </Button>
                {form.logoUrl && (
                  <button onClick={() => ubah('logoUrl', '')} className="text-xs text-red-600 hover:underline">
                    Hapus
                  </button>
                )}
              </div>
            </div>
            <p className="mt-1 text-xs text-slate-400">PNG/JPG maksimal 2 MB. Tampil di header &amp; kop cetak.</p>
          </div>
        </div>
      </Card>

      <Card className="mb-4">
        <h2 className="mb-3 font-bold text-slate-900 dark:text-slate-100">Aturan Ujian (Anti-Curang)</h2>
        <div className="space-y-4">
          <Field label="Ambang peringatan (1–10)">
            <TextInput
              type="number"
              min={1}
              max={10}
              value={form.ambangPeringatan}
              onChange={(e) => ubah('ambangPeringatan', parseInt(e.target.value, 10) || 3)}
            />
            <p className="mt-1 text-xs text-slate-400">
              Pelanggaran (pindah tab, keluar fullscreen, dsb.) yang mencapai angka ini membatalkan sesi otomatis.
            </p>
          </Field>
          <Field label="Wajib fullscreen saat ujian">
            <SelectInput
              value={form.wajibFullscreen ? '1' : '0'}
              onChange={(e) => ubah('wajibFullscreen', e.target.value === '1' ? 1 : 0)}
            >
              <option value="1">Ya — peserta otomatis masuk fullscreen</option>
              <option value="0">Tidak</option>
            </SelectInput>
          </Field>
          <Field label="Izinkan mengulang setelah sesi dibatalkan">
            <SelectInput
              value={form.izinkanUlangSetelahBatal ? '1' : '0'}
              onChange={(e) => ubah('izinkanUlangSetelahBatal', e.target.value === '1' ? 1 : 0)}
            >
              <option value="0">Tidak — sesi batal = tidak bisa mengulang</option>
              <option value="1">Ya — boleh membuat sesi baru</option>
            </SelectInput>
            <p className="mt-1 text-xs text-slate-400">
              Bila tidak diizinkan, guru bisa mereset sesi manual lewat Monitor.
            </p>
          </Field>
        </div>
      </Card>

      <Card className="mb-4">
        <h2 className="mb-3 font-bold text-slate-900 dark:text-slate-100">Penilaian</h2>
        <div className="space-y-4">
          <Field label="KKM (Kriteria Ketuntasan Minimal)">
            <TextInput
              type="number"
              min={0}
              max={100}
              value={form.kkm}
              onChange={(e) => ubah('kkm', parseInt(e.target.value, 10) || 0)}
            />
            <p className="mt-1 text-xs text-slate-400">
              Dipakai sebagai ambang Tuntas/Belum Tuntas di Analisis dan Laporan.
            </p>
          </Field>
          <Field label="Durasi standar ujian (menit)">
            <TextInput
              type="number"
              min={5}
              max={300}
              value={form.durasiStandar || 60}
              onChange={(e) => ubah('durasiStandar', parseInt(e.target.value, 10) || 60)}
            />
            <p className="mt-1 text-xs text-slate-400">
              Dikelola admin seperti daftar mapel — bisa diubah sewaktu-waktu, bukan hardcode.
              Menjadi nilai awal durasi tiap ujian baru di menu Paket Ujian; tiap ujian tetap bisa memakai durasi berbeda.
            </p>
          </Field>
          <Field label="Jeda gelombang antar kelas (menit)">
            <TextInput
              type="number"
              min={0}
              max={60}
              value={form.jedaGelombang ?? 3}
              onChange={(e) => ubah('jedaGelombang', parseInt(e.target.value, 10) || 0)}
            />
            <p className="mt-1 text-xs text-slate-400">
              Nilai awal jeda mulai antar kelas di tiap paket baru (0–60 menit) — agar tidak 1000 siswa
              menekan Mulai bersamaan. Tiap paket tetap bisa memakai jeda berbeda.
            </p>
          </Field>
        </div>
      </Card>

      <Button onClick={simpan} loading={loading} className="w-full">
        <Save className="h-4 w-4" /> Simpan Pengaturan
      </Button>
    </div>
  );
}
