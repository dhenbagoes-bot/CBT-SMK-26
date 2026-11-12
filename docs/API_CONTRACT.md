# Kontrak API — Backend wwn-cbt-madrasah-80 (CBT Madrasah Digital)

Backend: Google Apps Script + Google Sheets + Google Drive.
Versi: `1.0.0` (`APP_VERSION` di `backend/Kode.gs`).
Fork dari wwn-cbt-atm-80 v1.1.4 — yang baru di v1.0.0: sheet `JawabanSiswa`,
6 jenis soal, token ujian statis, autosave + resume, penilaian essay manual,
anti-bentrok jadwal, `durasiStandar` & `jedaGelombang` di Pengaturan.

Semua request dikirim sebagai **POST** dengan body JSON `{ action, ...params }`
ke URL `/exec` Web App. Respons SELALU memakai envelope:

```json
{ "success": true, "message": "...", "data": { ... } }
{ "success": false, "message": "..." }
{ "success": false, "error": "..." }
```

`doGet` (GET biasa, tanpa parameter) hanya mengembalikan info service:

```json
{ "success": true, "data": { "service": "wwn-cbt-madrasah-80", "version": "1.0.0" } }
```

**Pengecualian beacon**: `batalkanSesi` juga dipanggil via
`navigator.sendBeacon(url, JSON.stringify({ action:'batalkanSesi', token, sesiId }))`
(Content-Type text/plain). `doPost` WAJIB membaca `e.postData.contents`
(tanpa mengasumsikan content-type JSON) lalu `JSON.parse`.

## Konvensi umum

- **Tanggal di wire: ISO `yyyy-MM-dd`; datetime: `yyyy-MM-dd HH:mm:ss`.**
  Tampilan `dd/mm/yyyy` diurus frontend. Semua timestamp server memakai
  zona waktu script (Asia/Jakarta).
- **Token sesi login**: field `token` di body setiap aksi bertanda 🔒.
  Token kedaluwarsa 7 hari. **Jangan tertukar dengan `tokenUjian`**
  (token ujian statis per paket — lihat `savePaket` / `mulaiSesi`).
- **Peran**: `admin` | `guru` | `siswa`. Hirarki: admin > guru > siswa.
  Aksi bertanda 🔒 butuh token valid dengan peran minimum yang disebut
  (mis. "🔒 guru" = guru ATAU admin; "🔒🔒" = admin saja).
- **Hash password**: SHA-256 hex dari `salt + password`, salt acak per akun.
  Hash/salt/token **tidak pernah** dikirim ke frontend.
- **ID baris baru**: `Utilities.getUuid()`.
- **Konkurensi**: kunci global di `doPost` **dihapus**. Kini hanya aksi
  **tulis** yang memakai kunci singkat `denganKunci()` (`tryLock(8000)`);
  aksi baca paralel tanpa kunci. Bila kunci sibuk →
  `{success:false, retryable:true, message}` dan frontend otomatis retry
  (maks. 4x, backoff eksponensial + jitter). Batas Google tetap berlaku:
  30 eksekusi bersamaan per akun — lihat README bagian G.
- **Baca hemat**: semua aksi baca sheet **sekali** (`getDataRange().getValues()`)
  lalu memakai peta di memori — dilarang membaca sheet per baris (pola O(n²)).
  Tulis jawaban/hasil memakai batch (`setValues` sekali untuk baris baru).
- **Idempotent**: `initDatabase`, `batalkanSesi`, `submitJawaban`,
  `mulaiSesi` (sesi AKTIF yang sudah ada dikembalikan, bukan dibuat baru) —
  sehingga retry frontend tidak menimbulkan duplikat.

## Sheet (12)

| Sheet | Header |
|---|---|
| Pengaturan | Kunci, Nilai |
| Pengguna | ID, Nama, Username, PasswordHash, PasswordSalt, Peran, NIS, JenjangID, KelasID, Token, TokenKedaluwarsa, Aktif, NoHP |
| Jenjang | ID, Nama, DibuatPada |
| Mapel | ID, JenjangID, Nama, DibuatPada |
| Kelas | ID, JenjangID, Nama, DibuatPada |
| BankSoal | ID, JenjangID, MapelID, Soal, OpsiA, OpsiB, OpsiC, OpsiD, OpsiE, Kunci, Bobot, Pembahasan, GambarUrl, DibuatPada, DibuatOleh, Jenis, OpsiJSON, KunciJSON, Tingkat, KelasID |
| Paket | ID, Nama, JenjangID, MapelID, KelasIDsJSON, ModeSoal, SoalIDsJSON, JumlahAcak, DurasiMenit, Mulai, Selesai, AcakSoal, AcakOpsi, TampilSkor, TampilPembahasan, Aktif, DibuatPada, DibuatOleh, Token, JedaGelombang |
| SesiUjian | ID, PaketID, Username, WaktuMulai, WaktuSelesai, Status, Peringatan, SoalIDsJSON, DibuatPada |
| JawabanSiswa | SesiID, SoalID, Jawaban, SkorSementara, UpdatedAt |
| Hasil | ID, SesiID, PaketID, Username, NamaSiswa, Kelas, JawabanJSON, Benar, Salah, Kosong, Skor, TotalBobot, Nilai, WaktuSubmit, Status, EssayBelumDinilai |
| LogAktivitas | ID, Waktu, Username, SesiID, Jenis, Detail |
| Notifikasi | ID, Waktu, Username, NamaSiswa, NoHP, Jenis, Isi, Status |

- `Status` SesiUjian: `AKTIF` | `SELESAI` | `BATAL`.
- `Status` Hasil: `Tuntas` | `Belum Tuntas` | `Menunggu penilaian`.
- `ModeSoal` Paket: `manual` | `acak`.
- `KelasIDsJSON`: array ID kelas; kosong = semua kelas pada jenjang itu.
- `SoalIDsJSON` (SesiUjian): snapshot urutan soal sesi ini (hasil acak per siswa).
- `Token` Paket: token ujian **statis** (string, maks. 20 karakter);
  kosong = ujian tanpa token. **Bukan token berputar** — tidak ada rotasi.
- `JedaGelombang` Paket (menit, 0–60): jeda mulai antar kelas; default dari
  Pengaturan `jedaGelombang` bila tidak diisi saat membuat paket.
- `JawabanSiswa.Jawaban`: jawaban mentah dalam bentuk **JSON string**
  (mis. `"B"`, `[0,2]`, `"Benar"`, `"Jakarta"`, `"teks essay..."`).
  `SkorSementara`: skor sementara soal non-essay (dihitung saat autosave);
  essay dibiarkan kosong sampai dinilai manual via `nilaiEssay`.

### BankSoal — 6 jenis soal

| Jenis | `Jenis` | `OpsiJSON` | `KunciJSON` | `Kunci` (tampil) | `OpsiA`–`OpsiE` |
|---|---|---|---|---|---|
| Pilihan Ganda | `pg` | `["...","..."]` (opsi) | `"B"` | huruf kunci | opsi A–E |
| PG Kompleks | `pgk` | `["...","..."]` | `[0,2]` (indeks benar) | `"A,C"` | opsi |
| Benar/Salah | `bs` | `["Benar","Salah"]` | `"Benar"` | `Benar`/`Salah` | `Benar`/`Salah` |
| Menjodohkan | `jodoh` | `{"kiri":[...],"kanan":[...]}` | `[1,0]` (indeks kanan per kiri) | (kosong) | (kosong) |
| Isian Singkat | `isian` | `""` | `"Jakarta"` | string kunci | (kosong) |
| Essay | `essay` | `""` | `""` | (kosong) | (kosong) |

- `Tingkat`: `Mudah` | `Sedang` | `Sulit` (default `Sedang`).
- `KelasID`: opsional, kosong = semua kelas.
- **Backward-compat**: baris lama (15 kolom, tanpa `Jenis`/`OpsiJSON`/
  `KunciJSON`) dibaca sebagai jenis `pg` dengan kunci huruf lama.

### Aturan skoring per jenis soal (dihitung di server saat submit)

Nilai akhir = `Math.round(skor / totalBobot * 100)`.
`skor` boleh pecahan (mis. PGK sebagian) — dibulatkan 2 desimal.

| Jenis | Skor |
|---|---|
| PG | cocok kunci → `bobot`, else `0` |
| PG Kompleks | `(benarDipilih - salahDipilih) / jumlahKunciBenar × bobot`, floor `0`. Contoh: benar 2 dari 3 kunci dan tanpa pilihan salah → `2/3 × bobot`; bila ada 1 pilihan salah → `(2-1)/3 × bobot` |
| Benar/Salah | cocok `Benar`/`Salah` → `bobot`, else `0` |
| Menjodohkan | `pasanganBenar / totalPasangan × bobot` |
| Isian Singkat | cocok kunci (abaikan huruf besar/kecil dan spasi berlebih) → `bobot`, else `0` |
| Essay | `0` sampai dinilai manual (`nilaiEssay`); skor manual `0 ≤ skor ≤ bobot` |

Hitung `benar`/`salah`/`kosong`: jawaban **penuh** (skor = bobot) → `benar`;
terjawab tapi tidak penuh → `salah`; tidak terjawab → `kosong`; essay yang
sudah dijawab tapi belum dinilai **tidak** dihitung di ketiganya (dilacak
via `EssayBelumDinilai`).

Status hasil vs KKM (default 75, dari Pengaturan):
- Ada essay terjawab yang belum dinilai → `Status: 'Menunggu penilaian'`,
  `nilaiFinal: false`, `tuntas: false` (nilai yang tampil bersifat sementara,
  essay dihitung 0).
- Sudah final → `Status: 'Tuntas'` bila `nilai >= kkm`, else `'Belum Tuntas'`;
  `nilaiFinal: true`.

## Seed `initDatabase` (publik, idempotent)

- Pengaturan: `namaSekolah:'MTs Al Islam Ngleses'`, `alamatSekolah:''`,
  `telepon:''`, `namaKepala:''`, `logoUrl:''`,
  `ambangPeringatan:'3'`, `wajibFullscreen:'1'`, `izinkanUlangSetelahBatal:'0'`,
  `kkm:'75'`, `durasiStandar:'60'`, `jedaGelombang:'3'`,
  `waAktif:'false'`, `waEndpoint:''`, `waApiKey:''`, `waTemplateProgres:'...'`
- Jenjang: `MTs/SMP`, `MA/SMA/SMK`
- Kelas (6, jenjang `JJG-MTS`): `7A`, `7B`, `8A`, `8B`, `9A`, `9B`
  (ID `KLS-7A` … `KLS-9B`)
- Mapel: **TIDAK di-seed** (0 mapel — admin mengisi manual lewat form
  Kelola Data atau impor Excel; jangan hardcode daftar mapel di kode).
- Akun: `admin`/`admin123` (admin), `guru`/`guru123` (guru), Aktif=1.
  (Siswa dibuat via impor; password bawaan = NIS.) Segera ganti kata sandi
  bawaan setelah inisialisasi!

→ `{ success:true, data:{ sheets:[...12 nama...] } }`

## Daftar action

### `ping` (publik)
→ `{ success:true, data:{ version:"1.0.0", waktu:"yyyy-MM-dd HH:mm:ss" } }`

### `login` (publik) `{ username, password }`
Username case-insensitive; tolak jika `Aktif != 1`.
→ sukses: `{ success:true, data:{ token, nama, username, peran, nis, jenjangId, kelasId } }`
→ gagal: `{ success:false, message:'Username atau kata sandi salah' }`

### `logout` (publik) `{ token }` → `{ success:true }`

### `getAllData` 🔒 siswa (semua peran login)
Respons difilter menurut peran — **kunci/pembahasan soal TIDAK PERNAH
dikirim ke siswa**:

```json
{ "success": true, "data": {
  "pengaturan": { "namaSekolah":"MTs Al Islam Ngleses", "alamatSekolah":"", "telepon":"", "namaKepala":"", "logoUrl":"", "ambangPeringatan":3, "wajibFullscreen":1, "izinkanUlangSetelahBatal":0, "kkm":75, "durasiStandar":60, "jedaGelombang":3 },
  "jenjang": [{ "id":"", "nama":"" }],
  "mapel": [{ "id":"", "jenjangId":"", "nama":"" }],
  "kelas": [{ "id":"", "jenjangId":"", "nama":"" }],
  "pengguna": [{ "id":"", "nama":"", "username":"", "peran":"", "nis":"", "jenjangId":"", "kelasId":"", "aktif":1, "noHP":"" }],
  "bankSoal": [{ "id":"", "jenjangId":"", "mapelId":"", "soal":"", "opsiA":"", "opsiB":"", "opsiC":"", "opsiD":"", "opsiE":"", "kunci":"B", "bobot":1, "pembahasan":"", "gambarUrl":"", "dibuatPada":"", "jenis":"pg", "opsi":[""], "kunciNilai":"B", "pasanganKiri":[], "pasanganKanan":[], "tingkat":"Sedang", "kelasId":"" }],
  "paket": [{ "id":"", "nama":"", "jenjangId":"", "mapelId":"", "kelasIds":[], "modeSoal":"manual", "soalIds":[], "jumlahAcak":0, "durasiMenit":60, "mulai":"", "selesai":"", "acakSoal":1, "acakOpsi":1, "tampilSkor":1, "tampilPembahasan":1, "aktif":1, "jedaGelombang":3, "jumlahSoal":40 }],
  "sesi": [{ "id":"", "paketId":"", "namaPaket":"", "username":"", "namaSiswa":"", "kelas":"", "waktuMulai":"", "waktuSelesai":"", "status":"AKTIF", "peringatan":0 }],
  "hasil": [{ "id":"", "sesiId":"", "paketId":"", "namaPaket":"", "username":"", "namaSiswa":"", "kelas":"", "benar":0, "salah":0, "kosong":0, "skor":0, "totalBobot":0, "nilai":0, "waktuSubmit":"", "status":"Tuntas", "essayBelumDinilai":0, "nilaiFinal":true, "tuntas":true }]
} }
```

Aturan filter:
- `pengguna`: admin → semua; guru → peran `guru`/`siswa`; siswa → `[]`.
- `bankSoal`: siswa → `[]` (kunci tidak boleh bocor).
- `paket`: admin/guru → semua (+`jumlahSoal` terhitung, +`token`,
  +`punyaToken`); siswa → hanya `aktif=1` DAN `mulai <= now <= selesai`
  DAN jenjang cocok DAN (`kelasIds` kosong ATAU memuat `kelasId` siswa);
  field sensitif (`soalIds`, `dibuatOleh`, `token`) dibuang;
  `jumlahSoal` tetap dikirim.
- `sesi`: admin/guru → semua sesi (untuk monitor); siswa → sesi miliknya saja.
- `hasil`: admin/guru → semua; siswa → miliknya saja.

### Master — 🔒🔒 khusus admin
`saveJenjang { id?, nama }`, `deleteJenjang { id }` (tolak jika dipakai
Mapel/Kelas/BankSoal/Paket),
`saveMapel { id?, jenjangId, nama }`, `deleteMapel { id }` (tolak jika dipakai),
`saveKelas { id?, jenjangId, nama }`, `deleteKelas { id }` (tolak jika dipakai
Pengguna/Paket).
- `saveKelas` menolak nama kelas yang **sudah ada pada jenjang yang sama**
  (case-insensitive) — mencegah duplikat seed vs buat baru.
→ simpan: `{ success:true, data:{ id } }` · hapus: `{ success:true }`

### Pengguna — 🔒🔒 khusus admin
`savePengguna { id?, nama, username, peran, password?, nis?, jenjangId?, kelasId?, noHP?, aktif? }`
- `username` unik (case-insensitive); `peran` ∈ admin/guru/siswa.
- `password` kosong saat tambah → default: peran siswa → = NIS;
  admin/guru → tolak ("password wajib diisi").
- Saat ubah tanpa `password` → password lama dipertahankan.
- `nis` wajib untuk peran siswa; `jenjangId`+`kelasId` wajib untuk siswa.
- `noHP` (kolom ke-13): No. WA orang tua; juga dikembalikan di objek
  pengguna publik `penggunaKePublik`.

`deletePengguna { id }` (tolak hapus akun sendiri / admin terakhir),
`resetPassword { id, passwordBaru }` 🔒🔒.
→ `{ success:true, data:{ id } }`

`importSiswa` 🔒🔒 `{ rows:[{ nama, nis, kelas, jenjang?, username?, password?, noHP? }] }`
- `nama`, `nis`, `kelas` (nama kelas) wajib per baris → selain itu `errors`.
- Kolom opsional `noHP` / `NoHP` / `No HP` (No. WA orang tua): ikut tersimpan;
  saat UPDATE duplikat NIS, NoHP hanya ditimpa bila kolom diisi.
- Duplikat = `nis` sama (case-insensitive) → UPDATE (nama/kelas/akun).
- Kelas dicocokkan by nama (case-insensitive) pada jenjang yang disebut
  (atau jenjang pertama yang punya kelas tsb); tak ketemu → error baris.
- Akun: `username` = `username` atau NIS; password = `password` atau NIS.
- Pola batch: sheet dibaca SEKALI di awal, baris baru ditulis dengan SATU
  `setValues` (frontend mengirim per batch 100 baris).

→ `{ success:true, data:{ imported, updated, errors:[{ baris, pesan }] } }`

### Bank soal — 🔒 guru (guru atau admin)
`saveSoal { id?, jenjangId, mapelId, jenis?, soal, opsi? | opsiA, opsiB, opsiC, opsiD, opsiE?, kunci, bobot?, pembahasan?, gambarUrl?, tingkat?, kelasId?, pasanganKiri?, pasanganKanan? }`
- `jenis` ∈ `pg` | `pgk` | `bs` | `jodoh` | `isian` | `essay`
  (kosong → `pg`, backward-compat dengan soal lama).
- `opsi`: array string (diutamakan) atau `opsiA`–`opsiE` (legacy).
- Validasi per jenis:
  - `pg`: opsi A–D wajib; `kunci` ∈ A–E dan opsinya tidak kosong.
  - `pgk`: minimal 2 opsi; `kunci` = array huruf/indeks atau string
    `"A,C"`/`"0,2"`; minimal 1 kunci benar dan tidak mencakup semua opsi.
  - `bs`: `kunci` harus `'Benar'` atau `'Salah'`.
  - `jodoh`: `pasanganKiri` & `pasanganKanan` array (masing-masing ≥ 2);
    `kunci` = array indeks kanan per pasangan kiri (panjang sama dengan
    kiri, tiap indeks dalam jangkauan kanan) — ATAU `kunciJodoh` berupa
    peta `{0:1, 1:0}` (format form frontend) yang dikonversi backend
    menjadi array yang sama.
  - `isian`: `kunci` string wajib diisi.
  - `essay`: tanpa kunci.
  - `bobot` int ≥ 1 (default 1); `tingkat` ∈ `Mudah`/`Sedang`/`Sulit`
    (default `Sedang`); `kelasId` opsional (harus ada di Kelas bila diisi).

`deleteSoal` 🔒 guru `{ id }` (tolak jika dipakai Paket mode manual).
`importSoal` 🔒 guru `{ jenjangId, mapelId, items:[{...sama seperti saveSoal...}] }`
- Validasi per item sama seperti `saveSoal`; item tak valid → `errors`,
  item valid tetap diimpor; baris valid ditulis dengan SATU `setValues`.

→ `{ success:true, data:{ imported, errors:[{ baris, pesan }] } }`

`importSoalDariForm` 🔒 guru `{ formIdOrUrl, jenjangId, mapelId }`
- Ambil ID form dari URL (`/d/<ID>/`) atau ID mentah.
- **Jika `FormsApp` tidak tersedia** (mis. diuji di node) →
  `{ success:false, message:'Impor Google Form hanya bisa dijalankan di Apps Script.' }`.
- Baca item: `MULTIPLE_CHOICE` → opsi + kunci dari
  `choice.isCorrectAnswer()` (mode kuis); item lain → `dilewati`.
- Soal tanpa kunci yang jelas → `dilewati` (tidak diimpor diam-diam).
- Bobot default 1; opsi E boleh kosong; jenis hasil impor = `pg`.

→ `{ success:true, data:{ imported, dilewati:[{ judul, alasan }] } }`

### Paket — 🔒 guru (guru atau admin)
`savePaket { id?, nama, jenjangId, mapelId, kelasIds?, modeSoal, soalIds?, jumlahAcak?, durasiMenit, mulai, selesai, acakSoal?, acakOpsi?, tampilSkor?, tampilPembahasan?, aktif?, tokenUjian?, jedaGelombang? }`
- `nama`, `jenjangId`, `mapelId`, `durasiMenit` (5–300), `mulai`, `selesai` wajib;
  `selesai > mulai` (format `yyyy-MM-dd HH:mm:ss`).
- `modeSoal='manual'` → `soalIds` array ≥ 1 & semua ada di BankSoal.
- `modeSoal='acak'` → `jumlahAcak` ≥ 1 dan ≤ jumlah soal bank (jenjang+mapel).
- `tokenUjian`: token ujian **statis** (string, maks. 20 karakter;
  kosong = tanpa token). **Perhatian**: field ini bernama `tokenUjian`,
  bukan `token` (itu token sesi login yang juga ada di body request).
- `jedaGelombang`: menit (0–60); bila tidak diisi → default dari
  Pengaturan `jedaGelombang`.
- **Anti-bentrok**: bila `aktif=1`, ditolak bila ada paket AKTIF lain
  (jenjang sama) yang kelas pesertanya beririsan DAN tanggal mulainya sama
  DAN jamnya bersinggungan. Pesan error menyebut nama paket yang bentrok.
  Berlaku saat membuat MAUPUN mengedit (paket sendiri diabaikan).
  Paket nonaktif tidak dihitung sebagai pembanding.

`deletePaket` 🔒 guru `{ id }`.
→ `{ success:true, data:{ id } }`

### Sesi ujian
`mulaiSesi` 🔒 siswa `{ paketId, tokenUjian? }`
- Validasi: paket ada, `aktif=1`, `mulai <= now <= selesai`;
  siswa eligible (jenjang cocok; `kelasIds` kosong ATAU memuat kelas siswa).
- **Token**: bila paket punya `token` (statis), `tokenUjian` wajib sama
  persis → bila salah/tidak dikirim: `{ success:false, message:'Token ujian salah. ...' }`.
- Sesi existing user+paket: AKTIF → kembalikan sesi itu (beserta soal yang
  SAMA, dari `SoalIDsJSON`, **dan jawaban autosave** yang tersimpan —
  resume); SELESAI → error "Anda sudah mengerjakan paket ini";
  BATAL → error "Sesi Anda dibatalkan..." kecuali
  `izinkanUlangSetelahBatal=1` → boleh buat sesi baru.
- Buat sesi: pilih soal (manual: `soalIds`; acak: `jumlahAcak` dari bank
  jenjang+mapel), acak urutan jika `acakSoal=1`; simpan `SoalIDsJSON`;
  `waktuSelesai = waktuMulai + durasiMenit`.

→ `{ success:true, data:{ sesi:{ id, paketId, waktuMulai, waktuSelesai, status, peringatan }, soal:[...], jawaban:[{ soalId, jawaban }] } }`
- `soal` per jenis (TIDAK PERNAH mengirim `kunci`/`pembahasan`):
  - `pg`/`pgk`: `{ id, teks, gambarUrl, jenis, tingkat, opsi:[{ kode, teks }] }`
    (`opsi` diacak jika `acakOpsi=1`; `kode` = kode asli (A–E) untuk penilaian).
  - `bs`: `opsi:[{kode:'Benar'},{kode:'Salah'}]`.
  - `jodoh`: `{ ..., pasanganKiri:[...], pasanganKanan:[...] }`
    (urutan kanan TIDAK diacak — kunci menyimpan indeks kanan asli).
  - `isian`/`essay`: `opsi:[]`, jawaban berupa teks bebas.
- `jawaban`: jawaban autosave yang tersimpan (resume); `[]` untuk sesi baru.

`verifikasiToken` 🔒 siswa `{ paketId, tokenUjian? }`
- Cek token ujian statis + kelayakan paket (aktif, jendela waktu, jenjang,
  kelas) **tanpa** membuat sesi — dipakai halaman petunjuk sebelum mulai.
- Token salah / paket tidak aktif / di luar jendela / kelas tidak cocok →
  `{ success:false, message:'...' }` (pesan sama seperti `mulaiSesi`).
- Sukses → `{ success:true, data:{ valid:true, paket:{ id, nama, durasiMenit, mulai, selesai, jedaGelombang } } }`

`getSesi` 🔒 siswa `{ sesiId }`
- Milik sendiri (atau guru/admin): →
  `{ success:true, data:{ sesi:{...}, soal:[...], jawaban:[{ soalId, jawaban, skorSementara }], sisaDetik } }`
  (`soal` hanya jika status AKTIF; format sama seperti `mulaiSesi`;
  `sisaDetik` = sisa waktu ujian dalam detik, dihitung server dari
  `waktuSelesai`.)

`batalkanSesi` 🔒 siswa `{ sesiId, alasan? }`
- Sesi milik sendiri (atau guru/admin untuk sesi siapa pun).
- Jika status AKTIF → BATAL + catat log. SELESAI/BATAL → tetap sukses
  (idempotent). **Jawaban autosave di `JawabanSiswa` TIDAK dihapus**
  (tetap bisa dilihat guru; `resetSesi` yang menghapusnya bila siswa
  mengulang dari nol).

→ `{ success:true, data:{ status } }`

`catatPeringatan` 🔒 siswa `{ sesiId, jenis }`
- Hanya jika AKTIF & milik sendiri. `peringatan+1`; jika
  `peringatan >= ambangPeringatan` (Pengaturan, default 3) → status BATAL
  + log `peringatan-batas`.

→ `{ success:true, data:{ peringatan, dibatalkan } }`

#### Autosave + resume (v1.0.0)
Tutup tab / reload halaman di tengah ujian = **JEDA, bukan batal**:
sesi tetap `AKTIF` dan jawaban autosave tetap tersimpan; siswa melanjutkan
dari soal terakhir selama waktu ujian berjalan. Tidak ada logika backend
yang membatalkan sesi karena tab ditutup.

`simpanJawaban` 🔒 siswa `{ sesiId, jawaban:[{ soalId, jawaban }] }`
- Hanya sesi AKTIF milik sendiri; hanya soal milik sesi itu yang disimpan
  (soal di luar sesi diabaikan; bila tidak ada yang valid → error).
- `jawaban` adalah nilai mentah per jenis: `pg` → `"B"` (huruf);
  `pgk` → `[0,2]` (array indeks) atau `"A,C"`; `bs` → `"Benar"`/`"Salah"`;
  `jodoh` → `[1,0]` (array indeks kanan per kiri), ATAU string JSON
  `'{"0":1,"1":0}'` (format serial frontend — jawaban dikirim sebagai
  string), ATAU objek peta `{0:1, 1:0}`; `isian`/`essay` → string.
- Batch: array jawaban sekaligus; baris baru ditulis SATU `setValues`,
  baris yang sudah ada diperbarui (upsert per `sesiId`+`soalId`).
  `SkorSementara` dihitung untuk soal non-essay; essay dibiarkan kosong.

→ `{ success:true, data:{ sesiId, tersimpan } }`

`getJawabanSesi` 🔒 siswa `{ sesiId }`
- Milik sendiri (atau guru/admin).
- → `{ success:true, data:{ sesi:{...}, jawaban:[{ soalId, jawaban, skorSementara }], sisaDetik, waktuMulai, waktuSelesai } }`

`submitJawaban` 🔒 siswa `{ sesiId, jawaban:[{ soalId, jawaban }] }`
- Sesi milik sendiri & AKTIF (idempotent: jika SELESAI → kembalikan hasil
  yang sudah ada).
- **Jawaban yang dinilai = gabungan autosave (`JawabanSiswa`) + kiriman
  saat submit** (kiriman menang bila ada). Jadi submit tetap menghitung
  jawaban autosave walau `jawaban` di request kosong.
- **Penilaian DIHITUNG DI SERVER** (6 jenis soal — lihat tabel skoring di
  atas; nilai kiriman klien tidak pernah dipercaya).
- `jawaban` kosong/null → dihitung `kosong`; kode selain A–E (pg) → `kosong`.
- `nilai = Math.round(skor / totalBobot * 100)` (totalBobot>0).
- Simpan Hasil (termasuk `Status` & `EssayBelumDinilai`); status sesi → SELESAI;
  jawaban kiriman juga disimpan ke `JawabanSiswa` (agar essay bisa dinilai);
  catat log.

→ `{ success:true, data:{ hasil:{ id, benar, salah, kosong, skor, totalBobot, nilai, waktuSubmit, status, essayBelumDinilai, nilaiFinal, tuntas } } }`
- `skor`/`totalBobot` boleh pecahan (PGK/jodoh sebagian).
- `status`: `'Menunggu penilaian'` | `'Tuntas'` | `'Belum Tuntas'`
  (lihat aturan status vs KKM di atas).

`nilaiEssay` 🔒 guru `{ hasilId | sesiId, soalId, skor }`
- Menilai SATU soal essay secara manual. `skor` harus angka
  `0 ≤ skor ≤ bobot` soal; soal harus berjenis `essay` dan sudah dijawab
  siswa (bila belum dijawab → error).
- Hanya **admin**, atau **guru pembuat paket** (`DibuatOleh` paket) yang
  boleh menilai — "guru pengampu" diartikan sebagai guru pembuat paket,
  karena data pengguna tidak menyimpan pemetaan guru–mapel.
- Menyimpan skor ke `JawabanSiswa.SkorSementara` lalu **menghitung ulang**
  nilai akhir (`skor`, `nilai`, `status`, `essayBelumDinilai`, `tuntas`).

→ `{ success:true, data:{ hasil:{...sama seperti submitJawaban...} } }`

`resetSesi` 🔒 guru `{ username, paketId }`
- Hapus SEMUA baris SesiUjian + Hasil + **JawabanSiswa** milik `username`
  pada `paketId` (agar siswa bisa mengulang dari nol).

→ `{ success:true, data:{ sesiDihapus, hasilDihapus, jawabanDihapus } }`

### Hasil & monitor
`rekapHasil` 🔒 guru `{ paketId }`
→ `{ success:true, data:{ paket:{ id, nama }, rows:[{ username, nis, nama, kelas, status, nilai, benar, totalSoal, waktuSubmit, peringatan }] } }`
- `status`: `Selesai` | `Mengerjakan` | `Dibatalkan` | `Belum mulai`
  (digabung dari SesiUjian+Hasil untuk semua siswa eligible).

`getHasilSiswa` 🔒 siswa `{ paketId? }`
- Siswa: hasil miliknya (semua paket atau satu paket), terbaru dulu.
- Guru/admin: hasil SEMUA siswa (untuk memantau & menilai essay);
  `rincian` selalu disertakan untuk guru/admin (mereka sudah memegang
  kunci via `getAllData`), sedangkan untuk siswa tetap hanya bila paket
  `tampilPembahasan=1` DAN sesi SELESAI.
- BENTUK RESPONS (perhatikan: `data` adalah **array** objek hasil,
  bukan `{ hasil:[...] }`; `rincian` menempel **per item** hasil):

```json
{ "success": true, "data": [
  { "id":"", "sesiId":"", "paketId":"", "namaPaket":"", "username":"", "namaSiswa":"",
    "kelas":"", "benar":0, "salah":0, "kosong":0, "skor":0, "totalBobot":0,
    "nilai":0, "waktuSubmit":"", "status":"Tuntas", "essayBelumDinilai":0,
    "nilaiFinal":true, "tuntas":true,
    "rincian": [{ "soalId":"", "teks":"", "jenis":"pg", "opsi":[{"kode":"A","teks":""}],
                 "kunci":"B", "pembahasan":"", "jawabanSiswa":"A", "benar":false,
                 "skor":0, "bobot":1, "menungguPenilaian":false }] }
] }
```

- `rincian` hanya disertakan bila paket `tampilPembahasan=1` DAN sesi
  SELESAI — untuk siswa; guru/admin selalu menerima `rincian` (untuk
  menilai essay). Jika tidak → item hasil tanpa field `rincian`
  (kunci tidak bocor ke siswa).
- Rincian jodoh menambahkan `pasanganKiri`, `pasanganKanan`, `kunciPasangan`.
- `menungguPenilaian=true` hanya untuk essay yang sudah dijawab tapi belum
  dinilai (skor sementara 0).

`monitorSesi` 🔒 guru `{ paketId? }`
→ `{ success:true, data:[{ id, paketId, namaPaket, username, namaSiswa, kelas, waktuMulai, waktuSelesai, status, peringatan }] }`
- Urut: AKTIF dulu, lalu waktuMulai terbaru.

### Analisis nilai & notifikasi

`getAnalisisSiswa` 🔒 siswa `{ username? }` — siswa tanpa `username` = data
sendiri; guru/admin boleh mengisi `username` untuk melihat siswa tertentu.
Kunci jawaban & pembahasan **tidak pernah** dikembalikan.
→ `{ success:true, data:{ ringkasan:{ totalUjian, rataRata, nilaiTertinggi, mapelTerkuat, mapelTerlemah }, perMapel:[{ mapelId, namaMapel, totalDikerjakan, benar, pct, nilaiRata, tuntas }], tren:[{ paketId, namaPaket, nilai, waktuSubmit }] } }`
- `perMapel`: `totalDikerjakan`/`benar`/`pct` dari jawaban yang terjawab
  (dinilai dengan aturan 6 jenis soal; `benar` = jawaban penuh;
  essay yang belum dinilai tidak dihitung); `nilaiRata` =
  rata-rata Nilai hasil yang paketnya mapel tersebut (1 desimal);
  `tuntas` = `nilaiRata >= kkm`. `mapelTerkuat`/`mapelTerlemah` = nama mapel
  dengan `pct` tertinggi/terendah (min. 1 soal dikerjakan), `-` bila kosong.
- `tren` urut waktuSubmit menaik.

`getAnalisisKelas` 🔒 guru `{ paketId?, kelasId? }`
→ `{ success:true, data:{ statistik:{ jumlah, rata2, min, maks, median, ketuntasanPct }, distribusi:[{ rentang, jumlah }], teratas:[...5], terbawah:[...5], butirSoal:[...] } }`
- `rata2`/`median`/`ketuntasanPct` 1 desimal; `ketuntasanPct` = % nilai ≥ kkm.
- `distribusi` rentang: `<60`, `60-69`, `70-79`, `80-89`, `90-100`.
- `teratas`/`terbawah`: 5 siswa `[{ username, namaSiswa, kelas, nilai }]`.
- `butirSoal` hanya bila `paketId` diisi: soalIds dari Paket mode manual,
  atau unik dari SesiUjian paket itu (mode acak). Per soal:
  `[{ soalId, teks (80 char pertama), dijawab, benar, pctBenar, klasifikasi, dayaBeda }]`;
  `benar` = jawaban penuh (skor = bobot); essay yang belum dinilai tidak
  dihitung sebagai dijawab.
  `klasifikasi`: ≥85 `Sangat Mudah`, ≥70 `Mudah`, ≥40 `Sedang`, ≥15 `Sukar`,
  sisanya `Sangat Sukar`; `dayaBeda` = selisih % benar kelompok 27% atas vs
  27% bawah (min. 1 per kelompok), `null` bila kelompok kosong.

`kirimNotifikasiProgres` 🔒 guru `{ usernames?, kelasId?, template? }` —
kirim WA progres belajar ke orang tua. Target: `usernames[]` spesifik, atau
`kelasId`, atau (bila keduanya kosong) semua siswa aktif.
→ `{ success:true, data:{ total, terkirim, dilewati, detail:[{ username, nama, status }] } }`
- Isi pesan = `fillTemplateProgres(template, { nama, rata2, jmlUjian, mapelLemah, sekolah, tanggal })`;
  `template` default = `waTemplateProgres` di Pengaturan; `tanggal` format `dd/MM/yyyy`.
- Setiap target SELALU dicatat ke sheet Notifikasi kolom
  `Status`: `terkirim` atau `dilewati: <alasan>`.
- **Best-effort**: pengiriman tidak pernah melempar error. Jika
  `waAktif != 'true'`, `waEndpoint`/`waApiKey` kosong, atau nomor WA siswa
  kosong → dilewati tanpa request jaringan.

`getNotifikasi` 🔒 guru `{}` — 200 riwayat terakhir, terbaru dulu.
→ `{ success:true, data:[{ id, waktu, username, namaSiswa, noHP, jenis, isi, status }] }`

### Pengaturan & upload
`savePengaturan` 🔒🔒 `{ pengaturan:{...} }` — kunci yang diizinkan:
`namaSekolah`, `alamatSekolah`, `telepon`, `namaKepala`, `logoUrl`,
`ambangPeringatan` (int 1–10), `wajibFullscreen` (0/1),
`izinkanUlangSetelahBatal` (0/1), `kkm` (int 0–100, default 75),
`durasiStandar` (int 5–300 menit, default 60),
`jedaGelombang` (int 0–60 menit, default 3),
`waAktif` ('true'/'false'), `waEndpoint`, `waApiKey`, `waTemplateProgres`.
- `durasiStandar`: durasi standar ujian yang **diatur/diubah manual oleh
  admin** (bukan hardcode). Dipakai frontend sebagai **nilai awal** form
  ujian baru; backend **TIDAK memaksa** durasi per ujian = durasi standar
  (durasi per ujian tetap dari field `durasiMenit` paket).
- `jedaGelombang`: jeda default antar kelas (menit); dipakai sebagai nilai
  awal `jedaGelombang` paket bila tidak diisi.
→ `{ success:true }`

`uploadLogo` 🔒🔒 `{ dataBase64, mimeType }` — sama seperti pola jurnal:
tolak jika kosong / bukan `image/*` / base64 > 2.800.000 char;
folder Drive `Logo wwn-cbt-madrasah-80`; sharing ANYONE_WITH_LINK/VIEW.
→ `{ success:true, data:{ url, fileId } }`

`uploadGambarSoal` 🔒 guru `{ dataBase64, mimeType, namaFile? }`
- Validasi sama seperti uploadLogo; folder `Gambar Soal wwn-cbt-madrasah-80`.
→ `{ success:true, data:{ url, fileId } }`

Fungsi manual (jalankan dari editor, bukan via web):
`authorizeDriveAccess()`, `authorizeFormsAccess()` — memicu izin OAuth.

## Pesan error standar

- Token sesi tidak valid/kedaluwarsa:
  `{ "success": false, "message": "Sesi berakhir, silakan login ulang" }`
- Token ujian salah:
  `{ "success": false, "message": "Token ujian salah. Periksa kembali token dari guru Anda." }`
- Jadwal bentrok:
  `{ "success": false, "message": "Jadwal bentrok dengan ujian \"<nama>\" untuk kelas yang sama di hari yang sama. Ubah jam atau kelas peserta." }`
- Peran kurang (mis. guru memanggil aksi 🔒🔒):
  `{ "success": false, "message": "Aksi ini hanya boleh dilakukan oleh admin." }`
- Aksi tak dikenal: `{ "success": false, "message": "Aksi tidak dikenal: <action>" }`
