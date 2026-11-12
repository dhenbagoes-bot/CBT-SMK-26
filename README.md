# CBT Digital — SMK Negeri 1 Juwangi (`wwn-cbt-madrasah-80`) v1.2.1

Aplikasi ujian digital (CBT) khusus untuk SMK Negeri 1 Juwangi.
Siswa mengerjakan ujian langsung dari browser (laptop & HP), guru mengelola bank soal &
paket ujian, menilai essay, memantau sesi live, dan melihat rekap hasil.

**Yang baru di v1.0.0 (dari wwn-cbt-atm-80 v1.1.4):** 6 jenis soal
(PG, PG Kompleks, Benar/Salah, Menjodohkan, Isian Singkat, Essay + nilai manual),
token ujian statis per ujian, autosave jawaban ke server + lanjut setelah reload
(tutup tab = jeda, bukan batal), anti-bentrok jadwal, durasi standar yang dikelola
admin, dan sheet baru `JawabanSiswa`.

**Yang baru di v1.1.0:** aplikasi dikhususkan untuk **SMK Negeri 1 Juwangi**
(identitas, judul, dan `schools.json`); target kelas pada paket ujian **diketik
manual** (kelas baru dibuat otomatis); menu **Notifikasi WA dihapus** (kemampuan
backend tetap ada tetapi tidak dipakai dari menu). Selain itu tidak ada perubahan
perilaku — semua yang sudah berjalan dipertahankan. Backend tidak perlu di-deploy
ulang untuk v1.1.0 (hanya 1 string default di `Kode.gs` yang berubah).

**Yang baru di v1.2.0:** menu **Konfigurasi dihapus dari navigasi** — isinya pindah
ke dalam **Pengaturan → Konfigurasi Backend** dan hanya bisa dibuka admin; guru
(mengunggah soal) dan siswa (ujian) tidak lagi melihat urusan koneksi backend dan
langsung memakai aplikasi. Layar konfigurasi tetap muncul otomatis saat backend
belum terhubung sama sekali (setup awal). Jenjang seed kini **SMK, SMA, MA**
(sebelumnya MTs/SMP & MA/SMA/SMK). Selain itu tidak ada perubahan perilaku.
Backend tidak perlu di-deploy ulang untuk v1.2.0 (hanya seed `Kode.gs` yang
berubah; database live tidak ikut berubah — ubah jenjang lewat Kelola Data).

**Yang baru di v1.2.1 (perbaikan "Failed to fetch" saat upload):** impor mapel
kini memakai action batch baru `importMapel` (1 request per 100 baris, duplikat
dilewati) menggantikan loop 1 request per mapel tanpa retry; impor soal ikut
dilewati duplikatnya sehingga aman diulang; semua impor dikirim per batch 100
dengan retry otomatis 4x (termasuk saat Google throttle HTTP 429); pesan error
jaringan kini jelas, bukan mentah "Failed to fetch". **Wajib update backend
untuk v1.2.1** (lihat "Update Backend" di bawah) — frontend v1.2.1 memanggil
action baru yang belum ada di deployment backend v1.0.0. Data live tidak
berubah; tidak perlu `initDatabase` ulang.

**Stack:** React 19 + Vite + TypeScript + Tailwind 4 (frontend, deploy di Vercel) •
Google Apps Script + Google Sheets + Google Drive (backend, gratis, milik sekolah sendiri).

---

## Fitur

| Peran | Bisa |
|---|---|
| **Siswa** | Mengerjakan paket ujian (masukkan token ujian), jawaban tersimpan otomatis dan bisa dilanjutkan setelah reload, melihat hasil & pembahasan, dashboard analisis belajar sendiri |
| **Guru** | Bank soal 6 jenis (tambah/ubah/hapus, unggah .txt/.docx/.xlsx, impor dari Google Form), paket ujian (mode manual/acak, token statis, anti-bentrok jadwal), **nilai essay manual**, monitor sesi live, rekap hasil + unduh Excel + cetak, **analisis kelas** (statistik, distribusi, butir soal), **laporan nilai PDF**, **notifikasi progres belajar WA** ke orang tua |
| **Admin** | Semua fitur guru + kelola pengguna & impor siswa (.xlsx, termasuk No. WA orang tua), jenjang/mapel/kelas, pengaturan sekolah, KKM, **durasi standar ujian** & jeda gelombang, aturan anti-curang |

**Aturan ujian (v1.0.0):**
- **Autosave ke server** — jawaban dikirim ke sheet `JawabanSiswa` (debounce +
  berkala, batch). Tutup tab / reload = **JEDA, bukan batal**: sesi tetap AKTIF
  dan jawaban kembali saat siswa masuk lagi selama waktu ujian berjalan.
  `localStorage`/`sessionStorage` tetap bukan database jawaban.
- **Token ujian statis** — tiap ujian punya token sendiri (diatur guru/admin saat
  membuat ujian, maks. 20 karakter, bukan token berputar). Siswa memasukkan
  token sebelum mulai; token salah → ditolak.
- Pindah tab/aplikasi (`visibilitychange`) & keluar fullscreen → tercatat sebagai
  **peringatan**; mencapai ambang (default 3) → sesi otomatis dibatalkan.
- Klik kanan, seleksi teks, dan shortcut Ctrl+C/U/P/S dinonaktifkan selama ujian.
- Timer dihitung dari `waktuSelesai` server; waktu habis → **auto-submit**.
- Kunci jawaban & pembahasan **tidak pernah** dikirim ke browser siswa.
- **Penilaian dihitung server** untuk 6 jenis soal (PG, PG Kompleks proporsional
  tanpa nilai negatif, Benar/Salah, Menjodohkan proporsional, Isian Singkat
  case-insensitive, Essay manual 0–bobot). Essay yang belum dinilai → hasil
  berstatus **Menunggu penilaian** dan nilai belum final.

---

## A. Siapkan Backend (sekali saja)

Backend dibangun dari kontrak `docs/API_CONTRACT.md` (12 sheet: Pengaturan, Pengguna,
Jenjang, Mapel, Kelas, BankSoal, Paket, SesiUjian, JawabanSiswa, Hasil,
LogAktivitas, Notifikasi).
> **Catatan:** tidak ada sheet `SoalUjian` — soal tiap sesi disimpan sebagai
> snapshot `SoalIDsJSON` di sheet `SesiUjian` (urutan soal per siswa).
File `backend/Kode.gs` + `backend/appsscript.json` disiapkan terpisah mengikuti kontrak tersebut.

1. **Buat spreadsheet baru** di Google Drive (mis. nama: `Database CBT Sekolah`).
2. Di spreadsheet: menu **Extensions → Apps Script** (PENTING: dibuat dari dalam
   spreadsheet — *container-bound*. Kalau dibuat langsung di script.google.com,
   `SpreadsheetApp.getActiveSpreadsheet()` = `null` dan semua action gagal).
3. Hapus isi editor, **paste seluruh `backend/Kode.gs`**, simpan (Ctrl+S).
4. Ganti isi `appsscript.json` (menu ⚙️ Project Settings → centang *Show "appsscript.json"...*)
   dengan `backend/appsscript.json` (sudah memuat scope Sheets + Drive + Forms).
5. **Otorisasi Drive:** di editor Apps Script, pilih fungsi `authorizeDriveAccess` → **Run**.
   Setujui izin saat diminta (diperlukan untuk upload logo & gambar soal).
6. **Otorisasi Forms** (bila ingin impor soal dari Google Form): pilih fungsi
   `authorizeFormsAccess` → **Run**, setujui izin.
7. **Deploy:** Deploy → New deployment → tipe **Web app** →
   *Execute as:* **Me**, *Who has access:* **Anyone** → Deploy → **salin URL `/exec`**.

## B. Hubungkan Frontend

1. Buka aplikasi → bila backend belum terhubung, layar Konfigurasi tampil otomatis.
   (Bila sudah terhubung, konfigurasi ada di **Pengaturan → Konfigurasi Backend**,
   khusus admin.)
2. Tempel URL `/exec` ke kolom *URL Backend Manual* → **Simpan URL**.
3. Klik **Uji Koneksi** — harus muncul `Terhubung ✓ — versi 1.2.1 ...`.
4. Klik **Inisialisasi Database** — membuat 12 sheet + akun bawaan
   `admin`/`admin123` dan `guru`/`guru123`, jenjang SMK/SMA/MA,
   6 kelas seed (7A, 7B, 8A, 8B, 9A, 9B),
   dan Pengaturan default (nama sekolah `SMK Negeri 1 Juwangi`, KKM 75,
   durasi standar 60 menit, jeda gelombang 3 menit). Mapel **tidak** di-seed —
   admin mengisinya manual (lihat langkah D.3). **WAJIB ganti kata sandi
   bawaan setelah login pertama** (langkah D.2).

> Alternatif multi-sekolah: isi `apiUrl` di `public/schools.json`
> (format sama seperti aplikasi bel/jurnal TTS), lalu buka dengan `?school=<id>`.

## C. Upload ke GitHub & Deploy Vercel (lewat web, tanpa git CLI)

1. **Buat repo BARU di GitHub** (github.com → New repository):
   nama repo mis. `wwn-cbt-madrasah-80`, pilih **Public**, **jangan** centang
   *Add a README* (biar tidak bentrok) → Create repository.
2. Di halaman repo kosong, klik **Add file → Upload files**.
3. **Drag-and-drop SELURUH isi folder proyek** ke area upload: `src`,
   `public`, `backend`, `test`, `docs`, `package.json`, `package-lock.json`,
   `index.html`, `vite.config.ts`, `tsconfig.json`, `vercel.json`, `README.md`,
   dan file lainnya — jangan hanya file lepas. **Jangan** ikut mengunggah
   folder `node_modules` dan `dist` (terlalu besar & tidak perlu; Vercel
   membangun sendiri dari `package.json`).
4. Tunggu upload selesai → klik **Commit changes** (pesan commit boleh
   dikosongkan/diisi `v1.0.0`).
5. **Deploy di Vercel** (vercel.com → Add New → Project):
   pilih **Import** repo tadi → biarkan pengaturan bawaan (Framework: Vite,
   Build Command: `vite build`) → **Deploy**.
6. Setelah selesai, buka URL aplikasi dari Vercel (mis.
   `https://wwn-cbt-madrasah-80.vercel.app`) — lanjut ke langkah B bila
   backend belum dihubungkan, atau langsung login.
7. Setiap ada pembaruan kode: ulangi langkah 2–4 (upload file yang berubah
   lewat web) — Vercel otomatis deploy ulang.

## C2. Update Backend (wajib saat `Kode.gs` berubah — mis. v1.2.1)

URL `/exec` **tidak berubah**; yang diperbarui hanya versi deployment-nya.
Data di spreadsheet tidak ikut berubah — **jangan** jalankan
`initDatabase` ulang.

1. Buka spreadsheet database → **Extensions → Apps Script** (project yang
   sama seperti saat setup awal).
2. Buka file `Kode.gs` di editor → pilih semua (Ctrl+A) → hapus → tempel
   seluruh isi `backend/Kode.gs` dari arsip versi baru → **Save** (ikon disket).
3. Klik **Deploy → Manage deployments** → klik ikon pensil ✏️ pada deployment
   yang aktif → **Version: New version** → **Deploy**.
4. Verifikasi: buka aplikasi → login admin → **Pengaturan → Konfigurasi
   Backend → Uji Koneksi** — harus muncul `Terhubung ✓ — versi 1.2.1 ...`.
   Bila masih tertulis versi lama, tunggu 1–2 menit lalu uji lagi (cache
   deployment Google kadang lambat berubah).

## D. Konfigurasi Awal (login sebagai admin)

1. **Pengaturan** → isi identitas sekolah, unggah logo, atur:
   - *Ambang peringatan* (default 3),
   - *KKM* — Kriteria Ketuntasan Minimal (default 75), dipakai badge Tuntas/Belum
     di analisis & laporan,
   - *Durasi standar ujian* (default 60 menit) — dikelola admin, bisa diubah
     sewaktu-waktu; menjadi **nilai awal** tiap ujian baru (tiap ujian tetap
     bisa memakai durasi berbeda),
   - *Jeda gelombang* antar kelas (default 3 menit),
   - *Wajib fullscreen* (disarankan Ya),
   - *Izinkan ulang setelah batal* (default Tidak).
   Klik **Simpan Pengaturan**.
2. **Ganti password bawaan** (admin & guru) di Kelola Data → Pengguna → ✏️
   (kosongkan password bila tidak ingin mengubah).
3. **Kelola Data → Jenjang/Mapel/Kelas**: sesuaikan (bawaan: jenjang SMK, SMA, MA
   + 6 kelas 7A–9B di bawah SMK). **Daftar mapel diisi manual** (tambah satu per
   satu lewat form, edit, hapus) atau impor Excel — jangan hardcode; tidak ada
   mapel seed.
   Untuk SMK Negeri 1 Juwangi: isi **17–20 mapel** sesuai kurikulum. Kelas
   bawaan bisa diubah/dihapus di Kelola Data sesuai kebutuhan
   (mis. kelas `X AKL 1`, `XI MM 2`, dst.).
4. **Kelola Data → Impor Siswa**: unduh template `.xlsx`, isi (Nama, NIS, Kelas wajib;
   password awal = NIS bila dikosongkan; **No. WA Orang Tua** opsional, data kontak
   orang tua), unggah → pratinjau → Impor.
   Untuk rombongan besar, impor **per batch 100 siswa** agar tidak putus di tengah jalan.
   Catatan: menu **Notifikasi WhatsApp dihapus** sejak v1.1.0 — kolom No. WA tetap
   tersimpan sebagai data siswa, tetapi tidak ada pengiriman notifikasi dari menu.

## E. Alur Kerja Guru (operasional harian)

1. **Bank Soal** → *Template & Unggah*: unduh template `.txt`/`.docx`/`.xlsx`
   (sudah ada contoh siap pakai), isi, unggah → pratinjau + validasi per baris → Impor.
   Atau: *Google Form* → tempel URL/ID form kuis → Impor.
   Setiap soal punya jenis (PG / PG Kompleks / Benar-Salah / Menjodohkan /
   Isian Singkat / Essay), bobot, mapel, kelas, dan tingkat kesulitan
   (Mudah/Sedang/Sulit).
2. **Paket Ujian** → *Buat Paket*: nama, jenjang, mapel, target kelas
   **diketik manual** (nama kelas dipisah koma, cth. `X AKL 1, X AKL 2`;
   kosongkan = semua kelas; kelas yang belum ada dibuat otomatis di jenjang
   tersebut), mode **Manual** (centang soal dari bank) atau
   **Acak** (N soal diambil acak dari bank), durasi (5–300 menit; nilai awal =
   durasi standar), jendela mulai–selesai, **token ujian statis**,
   opsi acak soal/opsi, tampil skor/pembahasan, aktif.
   Dua ujian untuk kelas yang sama **tidak boleh bentrok** jamnya di hari
   yang sama — backend menolak saat menyimpan bila bentrok.
   **Jadwal harian:** susun **3–4 mapel per hari**, tiap mapel 1 paket per
   kelas, mulai **bergelombang per kelas dengan jeda 3–5 menit** (atur lewat
   jendela mulai tiap paket / kolom *Jeda gelombang*) agar tidak 1000 siswa
   menekan Mulai bersamaan. **Isi token tiap ujian** (tombol dadu untuk token
   acak 6 karakter) lalu **umumkan token ke siswa** (grup WA kelas / papan
   pengumuman) — token berbeda tiap ujian/mapel.
   **Nilai essay**: setelah siswa submit, buka **Hasil → Penilaian Essay**
   (tombol *Muat Essay Belum Dinilai*), beri skor tiap essay (0 sampai bobot
   soal) → **Simpan Nilai**; nilai akhir dihitung ulang otomatis dan status
   berubah dari *Menunggu penilaian* menjadi *Tuntas*/*Belum Tuntas*.
   Dasbor guru juga menampilkan pengingat bila ada hasil yang menunggu
   penilaian essay.
3. **Monitor**: pantau sesi live (auto-refresh 30 detik) — nama, status, sisa waktu,
   peringatan. Tombol **Reset** menghapus sesi+hasil+jawaban autosave siswa agar bisa mengulang.
4. **Hasil**: pilih paket → rekap (Selesai/Mengerjakan/Dibatalkan/Belum mulai) →
   **Unduh Excel** atau **Cetak** berkop sekolah.
5. **Analisis Kelas**: pilih paket + kelas → lihat rata-rata, median, ketuntasan
   klasikal vs KKM, distribusi nilai, 5 siswa teratas/terbawah, dan **analisis
   butir soal** (tingkat kesukaran: Sangat Mudah–Sangat Sukar + daya beda).
6. **Laporan**: pilih paket (+ kelas opsional) → pratinjau laporan berkop →
   **Cetak / Simpan PDF**.

## F. Uji End-to-End (wajib sebelum dipakai)

1. Buat 1 paket kecil (2–3 soal, durasi 10 menit, jendela mulai sekarang).
2. Login sebagai **siswa** (username = NIS, password = NIS).
3. Menu **Ujian** → Kerjakan → masukkan **token ujian** → baca petunjuk → centang → **Mulai Ujian** (timer baru jalan setelah tombol ini ditekan).
4. Jawab 1 soal, tandai 1 soal ragu-ragu, pindah nomor via grid.
5. **Simulasi keluar aplikasi di tengah ujian:** tutup tab / buka tab lain / tekan tombol
   home di HP, lalu buka lagi ujian yang sama.
   - ✅ Yang harus terjadi: **jawaban tersimpan** (autosave ke server) dan sesi
     tetap **AKTIF** — siswa melanjutkan dari soal terakhir (tutup tab = jeda,
     bukan batal). Pindah tab sempat tercatat sebagai peringatan.
   - ❌ Bila jawaban hilang setelah tab ditutup → JANGAN dipakai, laporkan.
6. Login lagi sebagai siswa → sesi lama masih AKTIF → lanjutkan; bila sesi
   berstatus Batal → buat sesi baru (bila *izinkanUlangSetelahBatal*=1) atau
   minta guru Reset via Monitor.
7. Kerjakan sampai selesai → **Selesaikan** → cek nilai & pembahasan (bila diizinkan).
8. Login sebagai guru → **Hasil** → pastikan nilai & rekap sesuai, unduh Excel, cetak.

## G. Catatan Teknis

- **Sesi login**: admin/guru otomatis **tetap masuk** (token + profil tersimpan di
  perangkat, kedaluwarsa 7 hari); sesi **siswa hanya di memori** (hilang saat
  tab ditutup) — demi anti-curang. Yang boleh di `localStorage` hanya URL
  backend, pilihan sekolah, dan sesi tersimpan admin/guru.
- **Nilai resmi selalu dihitung server** (`nilai = round(skor/totalBobot*100)`,
  skor boleh pecahan untuk PG Kompleks/Menjodohkan sebagian).
  Util `hitungNilaiSkor` di frontend hanya untuk pratinjau/test.
  Aksi backend baru v1.0.0: `verifikasiToken`, `simpanJawaban`,
  `getJawabanSesi`, `nilaiEssay` (lihat `docs/API_CONTRACT.md`).
  Perhatian: field token ujian di request bernama **`tokenUjian`**
  (bukan `token` — itu token sesi login).
- Impor file (.txt/.docx/.xlsx) **tanpa library tambahan** — ZIP & XML ditulis/dibaca
  manual di `src/utils/imporSoal.ts` (pola yang sama dipakai untuk unduh Excel rekap).
- Layar **Konfigurasi** (setup awal) & **Masuk** selalu bisa dibuka walau backend
  gagal dimuat, agar tidak terjebak di layar error. Sejak v1.2.0 tidak ada lagi
  menu Konfigurasi — isinya ada di Pengaturan → Konfigurasi Backend (admin saja).
- Test: `node test/smoke-backend.mjs` (verifikasi kontrak backend — dijalankan
  terhadap mock di Node), `node test/impor-soal.test.ts` dan (setelah kompilasi util)
  `node test/frontend-logic.test.mjs`. Verifikasi build: `npx tsc --noEmit` dan
  `npx vite build`.
- Upload ke GitHub & deploy Vercel lewat web — lihat langkah **C** di atas
  (drag-and-drop semua file/folder kecuali `node_modules`, `dist`,
  `test/dist-test`).

## H. Panduan Skala Besar (±1000 pengguna bersamaan)

**Batas resmi Google (per akun, berlaku untuk Gmail gratis maupun Workspace):**
maksimal **30 eksekusi bersamaan** per akun — karena backend di-deploy
*Execute as: Me*, seluruh request siswa dihitung ke akun pemilik script.
Melewati 30 eksekusi bersamaan → request gagal. Workspace for Education
menaikkan kuota *harian* (URL Fetch 100rb/hari, runtime 6 jam/hari) tetapi
**tidak** menaikkan batas 30 konkuren ini.

**Yang sudah diamankan di v1.0.0:**
- Kunci global dihapus — aksi *baca* (getAllData, getSesi, monitor, rekap,
  analisis) berjalan paralel tanpa antre.
- Aksi *tulis* (mulaiSesi, simpanJawaban, submitJawaban, batalkanSesi, dsb.)
  memakai kunci singkat 8 detik; bila server sibuk → backend menjawab
  `{success:false, retryable:true}` dan frontend **otomatis mencoba lagi**
  (maks. 4x, jeda eksponensial + acak) — aman karena mulaiSesi,
  simpanJawaban (upsert) & submitJawaban idempotent (tidak duplikat).
- Baca sheet sekali lalu peta di memori; tulis jawaban/hasil batch
  (`setValues` sekali); impor siswa/soal per batch 100 baris.

**Topologi yang disarankan untuk 1000 siswa:**
1. **Pisahkan backend per jenjang** — 1 spreadsheet + 1 project Apps Script
   untuk SMP, 1 untuk SMA, 1 untuk SMK, 1 untuk MA (±250 siswa per backend).
   Daftarkan keempatnya di `public/schools.json`, buka via `?school=smp`,
   `?school=sma`, dst. Tiap backend punya jatah 30 eksekusi sendiri.
   (Jenjang/Mapel/Kelas tiap backend tetap diatur di Kelola Data — sesuai
   permintaan "tinggal diubah di pengaturan".)
2. **Jadwalkan gelombang (wajib)** — jangan biarkan 250 siswa menekan
   *Mulai Ujian* di detik yang sama. Bagi per kelas dengan jeda mulai
   **3–5 menit** (paket mendukung jendela mulai–selesai per paket; buat
   1 paket per gelombang bila perlu).
3. **4 mapel/hari tidak masalah** — yang kritis hanya *momen mulai serentak*,
   bukan jumlah mapel. Antar mapel beri jeda 15–30 menit.
4. **Kapasitas Sheets aman** — 1000 siswa × 4 mapel = ±4000 baris Hasil/hari;
   batas Sheets 10 juta sel. Arsipkan (pindahkan) sheet Hasil/SesiUjian
   tiap akhir semester bila sudah >100rb baris agar tetap ringan.
5. **Uji beban sebelum hari-H** — simulasikan 1 kelas (±30–40 siswa) menekan
   mulai bersamaan; bila banyak retry, perketat jadwal gelombang.

**Yang tetap tidak bisa:** 1000 klik *dalam 1 detik* ke 1 backend — tidak ada
trik kode yang mengalahkan batas 30 konkuren Google. Gelombang + backend
per jenjang adalah kuncinya.
