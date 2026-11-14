import { PageHeader } from '../components/ui';
import { deleteJenisUjian, saveJenisUjian } from '../services/api';
import { MasterTab } from './KelolaData';
import type { PageProps } from './PageProps';

/** Master Jenis Ujian (v1.4.0): label ujian — dipakai opsional di Jadwal Ujian. */
export default function JenisUjian({ data, toast, refreshData }: PageProps) {
  return (
    <div>
      <PageHeader
        judul="Jenis Ujian"
        subjudul="Label ujian — Ulangan Harian, PTS, PAS, Ujian Sekolah, Try Out. Dipilih opsional saat membuat jadwal ujian."
      />
      <MasterTab
        judul="Jenis Ujian"
        daftar={data.jenisUjian}
        toast={toast}
        refreshData={refreshData}
        onSimpan={(id, nama) => saveJenisUjian(id ? { id, nama } : { nama })}
        onHapus={deleteJenisUjian}
      />
      <p className="mt-3 text-xs text-slate-400">
        Jenis ujian yang masih dipakai jadwal tidak bisa dihapus — ubah dulu jadwal yang memakainya.
      </p>
    </div>
  );
}
