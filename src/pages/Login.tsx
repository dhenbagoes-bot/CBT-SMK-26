import { useState } from 'react';
import { LogIn, LogOut, ShieldCheck } from 'lucide-react';
import { Button, Card, Field, PageHeader, TextInput } from '../components/ui';
import { login, logout } from '../services/api';
import type { UserSesi } from '../types';
import type { PageProps } from './PageProps';

// Selalu bisa dibuka walau getAllData() gagal (pola App.tsx).
export default function Login({ user, toast, refreshData, pindah, onAuthChange }: PageProps & { onAuthChange: (u: UserSesi | null) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [galat, setGalat] = useState('');

  const masuk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setGalat('Username dan password wajib diisi.');
      return;
    }
    setLoading(true);
    setGalat('');
    try {
      const u = await login(username, password);
      toast(`Selamat datang, ${u.nama} (${u.peran}).`, 'sukses');
      setUsername('');
      setPassword('');
      onAuthChange(u);
      await refreshData();
      pindah('dashboard');
    } catch (err) {
      setGalat(err instanceof Error ? err.message : 'Login gagal.');
    } finally {
      setLoading(false);
    }
  };

  const keluar = async () => {
    await logout();
    onAuthChange(null);
    toast('Anda telah keluar.', 'info');
    pindah('dashboard');
  };

  return (
    <div className="mx-auto max-w-md">
      <PageHeader judul="Masuk" subjudul="Login admin, guru, atau siswa." />
      <Card>
        {user ? (
          <div className="text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-violet-100">
              <ShieldCheck className="h-7 w-7 text-violet-600" />
            </div>
            <p className="font-bold text-slate-900 dark:text-slate-100">{user.nama}</p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Peran: <span className="font-semibold uppercase">{user.peran}</span>
            </p>
            <p className="mt-2 text-xs text-slate-400">
              {user.peran === 'admin'
                ? 'Anda dapat mengelola semua data, pengguna, dan pengaturan.'
                : user.peran === 'guru'
                  ? 'Anda dapat mengelola bank soal, paket ujian, dan memantau sesi.'
                  : 'Anda dapat mengerjakan paket ujian yang tersedia.'}
            </p>
            <Button varian="bahaya" onClick={keluar} className="mt-5 w-full">
              <LogOut className="h-4 w-4" /> Keluar
            </Button>
          </div>
        ) : (
          <form onSubmit={masuk} className="space-y-4">
            {galat && (
              <div className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{galat}</div>
            )}
            <Field label="Username">
              <TextInput
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Username / NIS"
                autoComplete="username"
              />
            </Field>
            <Field label="Password">
              <TextInput
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                autoComplete="current-password"
              />
            </Field>
            <Button type="submit" loading={loading} className="w-full">
              <LogIn className="h-4 w-4" /> Masuk
            </Button>
            <p className="text-center text-xs text-slate-400">
              Akun siswa dibuat admin via Kelola Data &gt; Impor Siswa (password awal = NIS).
              <br />
              Admin &amp; guru otomatis tetap masuk di perangkat ini.
            </p>
          </form>
        )}
      </Card>
    </div>
  );
}
