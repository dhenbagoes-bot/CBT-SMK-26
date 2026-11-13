// Penilaian 7 jenis soal + helper murni lainnya — tanpa akses storage/API,
// agar bisa diuji dari node (test/frontend-logic.test.mjs).
// CATATAN: nilai resmi SELALU dihitung server saat submit. Fungsi di sini
// hanya untuk pratinjau lokal & test; tidak pernah dipakai menyimpan nilai.
/** Normalisasi jawaban isian: abaikan huruf besar/kecil & spasi berlebih. */
export function normalisasiIsian(s) {
    return (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}
/** Urai jawaban PGK 'A,C' -> Set huruf besar. */
export function uraiKunciPgk(kunci) {
    return new Set((kunci || '')
        .split(',')
        .map((k) => k.trim().toUpperCase())
        .filter(Boolean));
}
/** Kunci pembanding nama kelas: huruf kecil + spasi tunggal (cth. "X  AKL 1" -> "x akl 1"). */
export function normalisasiNamaKelas(nama) {
    return (nama || '').toLowerCase().replace(/\s+/g, ' ').trim();
}
/** Urai daftar nama kelas yang diketik manual di form paket: pisah koma,
 *  rapikan spasi, buang yang kosong, hilangkan duplikat (abaikan huruf
 *  besar/kecil, ejaan pertama yang dipertahankan).
 *  Contoh: "X AKL 1, x akl 1 , XI MM 2" -> ["X AKL 1", "XI MM 2"]. */
export function uraiNamaKelas(teks) {
    const hasil = [];
    const sudah = new Set();
    for (const bagian of (teks || '').split(',')) {
        const nama = bagian.replace(/\s+/g, ' ').trim();
        if (!nama)
            continue;
        const kunci = nama.toLowerCase();
        if (sudah.has(kunci))
            continue;
        sudah.add(kunci);
        hasil.push(nama);
    }
    return hasil;
}
/** Urai jawaban jodoh '{"0":1,"1":0}' -> Map<number, number>. */
export function uraiJawabanJodoh(jawaban) {
    const peta = new Map();
    if (!jawaban)
        return peta;
    try {
        const obj = JSON.parse(jawaban);
        if (obj && typeof obj === 'object') {
            for (const [k, v] of Object.entries(obj)) {
                const ki = Number(k);
                const vi = Number(v);
                if (Number.isInteger(ki) && Number.isInteger(vi))
                    peta.set(ki, vi);
            }
        }
    }
    catch {
        /* jawaban bukan JSON valid -> dianggap kosong */
    }
    return peta;
}
/**
 * Skor satu soal sebagai pecahan 0..1 dari bobotnya.
 * - pg: 1 bila kode sama, 0 bila salah/kosong
 * - pgk: proporsional per pilihan benar (tanpa nilai negatif):
 *   benarDipilih / totalBenar; bila ada pilihan salah dipilih -> skor
 *   dikurangi proporsional: max(0, (benarDipilih - salahDipilih) / totalBenar)
 * - bs: 1 bila sama (case-insensitive), 0 bila salah/kosong
 * - jodoh/grid: pasanganBenar / totalPasangan
 * - isian: 1 bila cocok setelah normalisasi, 0 bila tidak/kosong
 * - essay: null (menunggu penilaian manual guru)
 */
export function skorSoal(soal, jawaban) {
    const jwb = (jawaban || '').trim();
    switch (soal.jenis) {
        case 'pg': {
            if (!jwb)
                return 0;
            return jwb.toUpperCase() === (soal.kunci || '').trim().toUpperCase() ? 1 : 0;
        }
        case 'pgk': {
            const benar = uraiKunciPgk(soal.kunci);
            if (benar.size === 0)
                return 0;
            if (!jwb)
                return 0;
            const dipilih = uraiKunciPgk(jwb);
            let benarDipilih = 0;
            let salahDipilih = 0;
            for (const k of dipilih) {
                if (benar.has(k))
                    benarDipilih++;
                else
                    salahDipilih++;
            }
            return Math.max(0, (benarDipilih - salahDipilih) / benar.size);
        }
        case 'bs': {
            if (!jwb)
                return 0;
            return jwb.toLowerCase() === (soal.kunci || '').trim().toLowerCase() ? 1 : 0;
        }
        case 'jodoh':
        case 'grid': {
            const total = soal.pasanganKiri.length;
            if (total === 0)
                return 0;
            const peta = uraiJawabanJodoh(jwb);
            let benar = 0;
            for (let i = 0; i < total; i++) {
                if (peta.get(i) === soal.kunciJodoh[i])
                    benar++;
            }
            return benar / total;
        }
        case 'isian': {
            if (!jwb)
                return 0;
            return normalisasiIsian(jwb) === normalisasiIsian(soal.kunci) ? 1 : 0;
        }
        case 'essay':
            return null;
        default:
            return 0;
    }
}
/** Apakah jawaban (string serial) terhitung "sudah dijawab". */
export function sudahDijawab(jenis, jawaban) {
    const jwb = (jawaban || '').trim();
    if (!jwb)
        return false;
    if (jenis === 'jodoh' || jenis === 'grid')
        return uraiJawabanJodoh(jwb).size > 0;
    if (jenis === 'pgk')
        return uraiKunciPgk(jwb).size > 0;
    return true;
}
/** Versi hitungNilaiEnamJenis dengan id soal eksplisit. */
export function hitungNilaiDenganId(soal, jawaban) {
    let skor = 0;
    let totalBobot = 0;
    let menungguEssay = false;
    let benar = 0;
    let salah = 0;
    let kosong = 0;
    for (const s of soal) {
        const bobot = s.bobot || 1;
        totalBobot += bobot;
        const jwb = jawaban[s.id];
        if (!sudahDijawab(s.jenis, jwb)) {
            kosong++;
            continue;
        }
        const pecahan = skorSoal(s, jwb);
        if (pecahan === null) {
            menungguEssay = true;
            continue;
        }
        skor += pecahan * bobot;
        if (pecahan === 1)
            benar++;
        else if (pecahan === 0)
            salah++;
        else {
            // jawaban sebagian benar (PGK/jodoh): hitung sebagai benar bila >= 0.5
            if (pecahan >= 0.5)
                benar++;
            else
                salah++;
        }
    }
    const nilai = totalBobot > 0 ? Math.round((skor / totalBobot) * 100) : 0;
    return { skor, totalBobot, nilai, menungguEssay, benar, salah, kosong };
}
/** Buat token ujian acak 6 karakter (huruf besar + angka, tanpa huruf ambigu). */
export function buatTokenAcak(panjang = 6, rand = Math.random) {
    const alfabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    let t = '';
    for (let i = 0; i < panjang; i++)
        t += alfabet[Math.floor(rand() * alfabet.length)];
    return t;
}
/** Tanggal 'yyyy-MM-dd' dari string datetime wire 'yyyy-MM-dd HH:mm:ss'. */
export function tanggalDariWire(w) {
    const m = /^(\d{4}-\d{2}-\d{2})/.exec((w || '').trim());
    return m ? m[1] : '';
}
/**
 * Kelompokkan paket per hari (tanggal mulai), urut menaik.
 * Mengembalikan [{ tanggal, label, paket[] }] — label format id-ID.
 */
export function kelompokPaketPerHari(paket) {
    const peta = new Map();
    for (const p of paket) {
        const tgl = tanggalDariWire(p.mulai) || 'tanpa-tanggal';
        if (!peta.has(tgl))
            peta.set(tgl, []);
        peta.get(tgl).push(p);
    }
    const labelUntuk = (tgl) => {
        if (tgl === 'tanpa-tanggal')
            return 'Tanpa tanggal';
        const [y, m, d] = tgl.split('-').map(Number);
        const dt = new Date(y, m - 1, d);
        return dt.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    };
    return [...peta.entries()]
        .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
        .map(([tanggal, daftar]) => ({ tanggal, label: labelUntuk(tanggal), paket: daftar }));
}
/** Apakah paket berlangsung "hari ini" (tanggal mulai == hari ini, zona lokal). */
export function adalahHariIni(tanggalWire) {
    const [y, m, d] = tanggalWire.split('-').map(Number);
    const now = new Date();
    return y === now.getFullYear() && m === now.getMonth() + 1 && d === now.getDate();
}
/**
 * Cek bentrok jadwal: dua paket untuk jenjang yang sama & kelas yang
 * bersinggungan (atau salah satunya semua kelas) dengan jendela waktu
 * yang tumpang tindih di hari yang sama.
 */
export function cekBentrokPaket(calon, lainnya, abaikanId) {
    const mulai = new Date(calon.mulai.replace(' ', 'T')).getTime();
    const selesai = new Date(calon.selesai.replace(' ', 'T')).getTime();
    const dengan = [];
    if (!Number.isFinite(mulai) || !Number.isFinite(selesai))
        return { bentrok: false, dengan };
    for (const p of lainnya) {
        if (abaikanId && p.id === abaikanId)
            continue;
        if (p.jenjangId !== calon.jenjangId)
            continue;
        const kelasBersinggungan = calon.kelasIds.length === 0 ||
            p.kelasIds.length === 0 ||
            calon.kelasIds.some((k) => p.kelasIds.includes(k));
        if (!kelasBersinggungan)
            continue;
        const pm = new Date(p.mulai.replace(' ', 'T')).getTime();
        const ps = new Date(p.selesai.replace(' ', 'T')).getTime();
        if (Number.isFinite(pm) && Number.isFinite(ps) && mulai < ps && pm < selesai) {
            dengan.push(p.nama);
        }
    }
    return { bentrok: dengan.length > 0, dengan };
}
