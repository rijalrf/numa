// Dedicated UX/UI Specification Agent (Bab 14 & 15).
// Mengubah canonical PRD menjadi spesifikasi UI/UX, tata letak, komponen, dan state interaktif.
import { z } from 'zod';
import { generateJson } from './ai-service.js';
import type { PrdData } from './prd.js';

export const UiSpecSchema = z.object({
  pages: z
    .array(
      z.object({
        name: z.string(),
        path: z.string().optional(),
        purpose: z.string(),
        layout: z.object({
          mobile: z.string(),
          desktop: z.string(),
        }),
        components: z.array(z.string()).min(1),
        states: z.array(z.string()).default(['idle', 'loading', 'error', 'empty', 'success']),
        interactiveStates: z.array(z.string()).default([]),
      })
    )
    .min(1),
  designTokens: z
    .object({
      spacing: z.string().default('Kelipatan 4px (gap-1, gap-2, p-3, p-4, p-6, space-y-4)'),
      borderRadius: z.string().default('rounded-sm, rounded-md, rounded-lg'),
      colorPalette: z.array(z.string()).default(['primary', 'secondary', 'muted', 'destructive', 'background']),
      typography: z.string().default('Inter, font-sans, heading font-semibold'),
    })
    .default({}),
  accessibility: z
    .array(z.string())
    .default([
      'WCAG AA contrast',
      'aria-labels on buttons',
      'keyboard navigable',
      'htmlFor pada setiap label+input',
      'skeleton loader untuk loading state',
      'AlertBanner/Toast untuk error display, dilarang window.alert()',
    ]),
});

export type UiSpecData = z.infer<typeof UiSpecSchema>;

export async function generateUiSpec(args: {
  prd?: PrdData;
  brd?: PrdData; // Kompatibilitas ke belakang
  projectName: string;
  projectId?: string;
}): Promise<UiSpecData> {
  const specDoc = args.prd ?? args.brd;
  const system = `Anda adalah Principal UX/UI Specification Architect untuk Numa.
Tugas Anda adalah mengubah dokumen kebutuhan produk canonical (PRD) menjadi Spesifikasi UI/UX Terstruktur yang siap diimplementasikan oleh AI coding agent atau junior frontend developer.

PRINSIP DESIGN SYSTEM & UI CONTRACT:
1. Mobile-first: Desain tata letak harus bekerja prima pada mobile lalu adaptif ke desktop.
2. Komponen bersih & reusable: Jangan membuat komponen duplikat hanya karena nama berbeda.
3. State interaktif lengkap: Setiap halaman wajib memodelkan state 'idle', 'loading', 'error', 'empty', dan 'success'.
4. Aksesibilitas: Terapkan semantic HTML dan navigasi keyboard. Setiap <label> WAJIB punya atribut htmlFor yang terhubung ke id input. Setiap tombol ikon (tanpa teks) WAJIB punya aria-label deskriptif.
5. Spacing terstandarisasi: Gunakan kelipatan 4px Tailwind (gap-1, gap-2, p-3, p-4, p-6, space-y-4).
6. Tanpa elemen dekoratif tak berfaedah: Utamakan fungsi, hierarki jelas, dan kejelasan tipografi.
7. Loading state: Gunakan skeleton loader (placeholder animasi) untuk loading state, BUKAN teks "Loading..." polos. Skeleton harus menyerupai bentuk konten yang akan ditampilkan.
8. Error display: Gunakan komponen AlertBanner/Toast inline untuk menampilkan error. DILARANG menggunakan window.alert() atau alert() bawaan browser.`;

  const user = `NAMA PROJECT: ${args.projectName}

CANONICAL PRD:
${JSON.stringify(specDoc, null, 2)}

Schema JSON WAJIB:
{
  "pages": [
    {
      "name": "Login",
      "path": "/login",
      "purpose": "Otentikasi pengguna ke sistem",
      "layout": {
        "mobile": "Single column full width",
        "desktop": "Centered card container"
      },
      "components": ["Logo", "EmailInput", "SubmitButton"],
      "states": ["idle", "loading", "error", "success"],
      "interactiveStates": ["submitting", "validation_failed"]
    }
  ],
  "designTokens": {
    "spacing": "Kelipatan 4px Tailwind",
    "borderRadius": "rounded-sm, rounded-md, rounded-lg",
    "colorPalette": ["primary", "secondary", "muted", "destructive", "background"],
    "typography": "Inter, font-sans"
  },
  "accessibility": [
    "Keyboard tab order",
    "Contrast ratio minimum 4.5:1",
    "Aria label untuk button icon",
    "htmlFor + id pada setiap pasangan label-input",
    "Skeleton loader untuk semua loading state",
    "Error ditampilkan via AlertBanner/Toast, dilarang window.alert()"
  ]
}

Kembalikan HANYA JSON yang valid.`;

  return generateJson({
    system,
    user,
    schema: UiSpecSchema,
    agentName: 'UiSpecArchitect',
    tier: 'reasoning',
    projectId: args.projectId,
  });
}
