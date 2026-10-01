// Shared constants & helpers untuk wizard stages

export const STAGE_ORDER: Record<string, number> = {
  chat: 0,
  survey: 1,
  interview: 1, // backward compat: project lama yang masih ber-wizardStep 'interview'
  techstack: 2,
  prd: 3,
  brd: 3, // backward compat
  tree: 4,
  board: 5,
  guide: 6,
  done: 7,
};

export const STAGE_LABELS: Record<string, string> = {
  chat: 'Brainstorming',
  survey: 'Survey Kebutuhan',
  interview: 'Survey Kebutuhan',
  techstack: 'Pilih Teknologi',
  prd: 'Dokumen PRD',
  brd: 'Dokumen PRD', // backward compat
  tree: 'Diagram Struktur',
  board: 'Board Task',
  guide: 'Panduan Eksekusi',
  done: 'Selesai',
};

export function isStageLocked(currentStep: string | undefined | null, targetStage: string): boolean {
  const currentRank = STAGE_ORDER[currentStep ?? 'techstack'] ?? 1;
  const targetRank = STAGE_ORDER[targetStage] ?? 0;
  return currentRank > targetRank;
}

import type { LucideIcon } from 'lucide-react';
import { Store, CalendarCheck, GraduationCap } from 'lucide-react';

export type ExampleIdea = {
  icon: LucideIcon;
  title: string;
  text: string;
};

export const EXAMPLE_IDEAS: ExampleIdea[] = [
  {
    icon: Store,
    title: 'Kasir Warung & Toko',
    text: 'Aplikasi kasir warung kelontong berbasis web dengan pencatatan inventaris barang, kasir POS cepat dengan scan barcode, dan rekap omzet harian.',
  },
  {
    icon: CalendarCheck,
    title: 'Reservasi Pasien Klinik',
    text: 'Sistem reservasi dan antrean pasien klinik gigi online dengan pemilihan jadwal dokter, reminder notifikasi WhatsApp, dan riwayat rekam medis.',
  },
  {
    icon: GraduationCap,
    title: 'LMS & Tugas Sekolah',
    text: 'Platform kelas dan tugas untuk guru dan murid dengan fitur kuis interaktif, upload tugas file PDF, dan rekap penilaian otomatis.',
  },
];
