import { Card, PageHeader } from '../components/ui';
import type { PageProps } from './PageProps';

/** Versi aplikasi yang sedang berjalan — samakan dengan package.json tiap rilis. */
export const VERSI_APLIKASI = '1.4.0';

// ================= LOG PEMBARUAN =================

const RIWAYAT: { versi: string; tanggal: string; poin: string[] }[] = [
  {
    versi: '1.4.0',
    tanggal: '14 Nov 2026',
    poin: [
      'Menu baru berkelompok: Data Master, Manajemen Ujian, Pelaksanaan, Sistem.',
      'Jenis Ujian: master label ujian (Ulangan Harian, PTS, PAS, dst.) + label opsional di jadwal.',
      'Cetak Kartu Peserta: kartu ujian per siswa berisi jadwal dan token.',
      'Halaman baru: Log Pembaruan, Petunjuk, dan Tentang.',
    ],
  },
  {
    versi: '1.3.1',
    tanggal: '13 Nov 2026',
    poin: [
      'Perbaikan dropdown Jenjang/Mapel di form Jadwal, Pengguna, Bank Soal, dan Pengaturan.',
      'Ceklis massal: hapus/ubah banyak baris sekaligus di tabel Jadwal, Pengguna, Jenjang, Mapel, dan Kelas.',
    ],
  },
  {
    versi: '1.3.0',
    tanggal: '13 Nov 2026',
    poin: [
      'Jenis soal ke-7: Pilihan Ganda Grid (matriks baris × kolom, nilai proporsional).',
      'Impor petak pilihan ganda dari Google Form (masuk tanpa kunci — atur kunci di Bank Soal).',
      'Satu jenjang saja: MA/SMA/SMK.',
    ],
  },
  {
    versi: '1.2.6',
    tanggal: '13 Nov 2026',
    poin: ['Soal Form berkunci ganda (mis. "Pilih 3 jawaban benar") diimpor sebagai PG Kompleks.'],
  },
  {
    versi: '1.2.5',
    tanggal: '13 Nov 2026',
    poin: ['Impor Google Form juga membaca kotak centang, dropdown, dan paragraf (esai).'],
  },
  {
    versi: '1.2.4',
    tanggal: '12 Nov 2026',
    poin: ['Pesan error impor Google Form lebih jelas (izin vs tidak ditemukan).'],
  },
  {
    versi: '1.2.3',
    tanggal: '12 Nov 2026',
    poin: ['Perbaikan impor Google Form (penyebutan layanan Forms yang benar).'],
  },
  {
    versi: '1.2.2',
    tanggal: '12 Nov 2026',
    poin: ['Perbaikan pembacaan file Excel (.xlsx) asli saat impor.'],
  },
  {
    versi: '1.2.1',
    tanggal: '12 Nov 2026',
    poin: ['Impor mapel/soal dikirim per batch 100 baris dengan laporan parsial.'],
  },
  {
    versi: '1.2.0',
    tanggal: '12 Nov 2026',
    poin: ['Menu Konfigurasi pindah ke dalam Pengaturan (khusus admin).'],
  },
  {
    versi: '1.1.0',
    tanggal: '12 Nov 2026',
    poin: [
      'Dikhususkan untuk SMK Negeri 1 Juwangi (nama tampilan "CBT Digital").',
      'Target kelas jadwal diketik manual; kelas baru dibuat otomatis.',
    ],
  },
  {
    versi: '1.0.1',
    tanggal: '12 Nov 2026',
    poin: ['Backend terverifikasi live dan terdaftar di pemilih sekolah.'],
  },
  {
    versi: '1.0.0',
    tanggal: '11 Nov 2026',
    poin: [
      'Rilis awal: 6 jenis soal, 3 peran (admin/guru/siswa), autosave jawaban, token ujian, jadwal bergelombang per kelas.',
    ],
  },
];

export function LogPembaruan(_props: PageProps) {
  return (
    <div>
      <PageHeader judul="Log Pembaruan" subjudul="Riwayat perubahan aplikasi dari versi ke versi." />
      <div className="space-y-3">
        {RIWAYAT.map((r, i) => (
          <Card key={r.versi}>
            <div className="flex flex-wrap items-baseline gap-2">
              <h3 className="font-bold text-slate-900 dark:text-slate-100">v{r.versi}</h3>
              {i === 0 && (
                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-700">
                  Versi saat ini
                </span>
              )}
              <span className="text-xs text-slate-400">{r.tanggal}</span>
            </div>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-300">
              {r.poin.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ================= PETUNJUK =================

export function Petunjuk(_props: PageProps) {
  return (
    <div>
      <PageHeader judul="Petunjuk" subjudul="Cara memakai CBT Digital, langkah demi langkah." />
      <div className="space-y-4">
        <Card>
          <h3 className="mb-2 font-bold text-slate-900 dark:text-slate-100">1. Peran &amp; login</h3>
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-300">
            <li>
              <b>Admin</b> — semua menu, termasuk Data Master dan Pengaturan.
            </li>
            <li>
              <b>Guru</b> — Bank Soal, Jadwal Ujian, Cetak Kartu Peserta, Administrasi, Status Ujian,
              Hasil Ujian, dan Analisis Soal.
            </li>
            <li>
              <b>Siswa</b> — mengerjakan ujian di menu Ujian, lalu melihat nilai di Hasil Ujian.
            </li>
          </ul>
        </Card>
        <Card>
          <h3 className="mb-2 font-bold text-slate-900 dark:text-slate-100">2. Alur kerja ujian</h3>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-300">
            <li>
              Isi <b>Data Master</b>: Jenis Ujian, Mata Pelajaran, Data Kelas, Data Guru, dan Data
              Siswa (bisa impor Excel).
            </li>
            <li>
              Isi <b>Bank Soal</b>: buat manual, impor Excel/Word/teks, atau impor dari Google Form.
            </li>
            <li>
              Buat <b>Jadwal Ujian</b>: pilih jenjang, mapel, kelas, soal, jadwal, dan token ujian.
            </li>
            <li>
              Cetak <b>Kartu Peserta</b> dan bagikan token kepada siswa.
            </li>
            <li>
              Pantau pelaksanaan di <b>Status Ujian</b>, nilai esai di <b>Hasil Ujian</b>, dan cetak
              rekap di <b>Administrasi</b>.
            </li>
          </ol>
        </Card>
        <Card>
          <h3 className="mb-2 font-bold text-slate-900 dark:text-slate-100">
            3. Impor soal dari Google Form
          </h3>
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-300">
            <li>
              Tempel <b>URL edit</b> form (dari address bar saat form dibuka untuk diedit, diakhiri
              <code> /edit</code>) — BUKAN link publikasi untuk siswa (menu Send).
            </li>
            <li>Form harus dalam mode kuis dan sudah diberi kunci jawaban.</li>
            <li>
              Form milik guru lain harus dibagikan dulu sebagai kolaborator ke akun sekolah yang
              memasang backend.
            </li>
            <li>
              Soal petak (grid) masuk <b>tanpa kunci</b> — atur kolom benar tiap baris di Bank Soal
              sebelum dipakai ujian.
            </li>
          </ul>
        </Card>
        <Card>
          <h3 className="mb-2 font-bold text-slate-900 dark:text-slate-100">4. Token &amp; gelombang</h3>
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-300">
            <li>Token ujian statis per jadwal — siswa wajib memasukkannya sebelum mulai.</li>
            <li>
              Untuk ujian besar (±1000 siswa), mulai ujian per kelas dijeda beberapa menit (diatur
              di tiap jadwal) agar server Google tidak kewalahan.
            </li>
            <li>Jawaban tersimpan otomatis — siswa boleh menutup tab dan melanjutkan selama waktu masih ada.</li>
          </ul>
        </Card>
        <Card>
          <h3 className="mb-2 font-bold text-slate-900 dark:text-slate-100">5. Bila ada kendala</h3>
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-300">
            <li>
              Tampilan aneh setelah update: muat ulang paksa dengan <b>Ctrl+Shift+R</b>.
            </li>
            <li>
              Pesan "Failed to fetch" atau halaman tidak merespons: tunggu 1–2 menit lalu muat ulang
              sekali — Google kadang membatasi sementara bila terlalu banyak permintaan.
            </li>
            <li>Menu Kelola Data tidak terbuka: pastikan masuk dengan akun admin.</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}

// ================= TENTANG =================

export function Tentang({ data }: PageProps) {
  return (
    <div>
      <PageHeader judul="Tentang" subjudul="Tentang aplikasi ini." />
      <Card>
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-900 text-3xl">
            🎓
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">CBT Digital</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {data.pengaturan.namaSekolah || 'SMK Negeri 1 Juwangi'} — v{VERSI_APLIKASI}
            </p>
          </div>
        </div>
        <p className="mt-4 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          Sistem ujian online (Computer Based Test) untuk sekolah: bank soal, jadwal ujian
          bergelombang, token ujian, penilaian otomatis dan manual, kartu peserta, serta rekap
          nilai. Data tersimpan di Google Sheets milik sekolah sendiri, sehingga tetap dalam
          kendali sekolah.
        </p>
        <dl className="mt-4 space-y-1 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-slate-500">Versi aplikasi</dt>
            <dd className="font-semibold text-slate-800 dark:text-slate-100">v{VERSI_APLIKASI}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-slate-500">Sekolah</dt>
            <dd className="text-right font-semibold text-slate-800 dark:text-slate-100">
              {data.pengaturan.namaSekolah || '-'}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-slate-500">Kepala sekolah</dt>
            <dd className="text-right font-semibold text-slate-800 dark:text-slate-100">
              {data.pengaturan.namaKepala || '-'}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-slate-500">Teknologi</dt>
            <dd className="text-right font-semibold text-slate-800 dark:text-slate-100">
              React + Google Apps Script + Google Sheets
            </dd>
          </div>
        </dl>
      </Card>
    </div>
  );
}
