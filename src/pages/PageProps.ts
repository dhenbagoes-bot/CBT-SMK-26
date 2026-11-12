import type { AllData, PageKey, Pengaturan, ToastMsg, UserSesi } from '../types';

/** Props standar semua halaman — pola PageProps ala aplikasi sejenis. */
export interface PageProps {
  pengaturan: Pengaturan;
  data: AllData;
  user: UserSesi | null;
  onNeedLogin: (pesan?: string) => void;
  refreshData: () => Promise<void>;
  toast: (pesan: string, tipe?: ToastMsg['tipe']) => void;
  pindah: (p: PageKey) => void;
}
