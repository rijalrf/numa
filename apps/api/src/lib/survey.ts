import { z } from 'zod';
import { generateJson } from './ai/ai-service.js';
import { PROMPT_VERSIONS } from './ai/prompts.js';

export const SurveyQuestionItemSchema = z.object({
  id: z.string(),
  label: z.string(),
  kind: z.enum(['radio', 'checkbox']).default('radio'),
  options: z.array(z.string()).min(2).max(4),
  required: z.boolean().default(true),
  suggestion: z.string(),
  suggestionReason: z.string(),
});

export type SurveyQuestionItem = z.infer<typeof SurveyQuestionItemSchema>;

export const SurveyRoundOutputSchema = z.object({
  questions: z.array(SurveyQuestionItemSchema).min(2).max(3),
  /** Nama aplikasi usulan; hanya diminta pada putaran 1. */
  appName: z.string().optional(),
});

export const SurveySummarySchema = z.object({
  name: z.string(),
  summary: z.string(),
});

export type SurveySummary = z.infer<typeof SurveySummarySchema>;

const ROUND_THEMES: Record<number, { theme: string; description: string }> = {
  1: {
    theme: 'Proses Saat Ini & Masalah Utama',
    description:
      'Bagaimana pekerjaan ini dilakukan SEBELUM ada aplikasi (alat atau cara yang dipakai sekarang, siapa saja yang terlibat, langkah-langkahnya), titik yang paling merepotkan atau sering salah, dan siapa pengguna utamanya. Pertanyaan pertama WAJIB tentang cara kerja saat ini, bukan tentang aplikasi yang akan dibuat.',
  },
  2: {
    theme: 'Fitur Inti MVP & Alur Kerja Harian',
    description: 'Fitur-fitur wajib versi pertama, alur kerja dari buka aplikasi sampai selesai, dan hal yang paling diprioritaskan.',
  },
  3: {
    theme: 'Aturan Bisnis, Hak Akses & Model Data',
    description: 'Mekanisme autentikasi, pembagian peran/akses (role), entitas data utama yang disimpan, dan batasan operasional.',
  },
  4: {
    theme: 'Batasan, Edge Cases & Metrik Sukses',
    description: 'Goals vs non-goals MVP, hal yang tegas dilarang dibuat (Out of Scope), antisipasi kegagalan, dan ukuran keberhasilan.',
  },
};

// Putaran 1 sekaligus memberi nama aplikasi (menggantikan panggilan AI terpisah).
const APP_NAME_RULE = `7. Putaran 1 WAJIB menyertakan field "appName": nama aplikasi 1-3 kata, mudah diingat dan dieja, relevan dengan fungsi utama, boleh Bahasa Indonesia atau istilah umum industri software. Tanpa emoji, tanda kutip, atau kata generik seperti "Aplikasi" dan "Sistem".
`;

export async function generateSurveyRound(args: {
  idea: string;
  priorAnswers: Array<{ question: string; answer: string }>;
  round: number;
  totalRounds: number;
  projectId: string;
}): Promise<{ questions: SurveyQuestionItem[]; appName?: string }> {
  const roundInfo = ROUND_THEMES[args.round] || {
    theme: `Aspek Kebutuhan Tahap ${args.round}`,
    description: 'Eksplorasi kebutuhan aplikasi yang perlu diperjelas.',
  };

  const priorText =
    args.priorAnswers.length > 0
      ? args.priorAnswers.map((pa, idx) => `P${idx + 1}: ${pa.question}\nJawaban: ${pa.answer}`).join('\n\n')
      : '(Belum ada jawaban sebelumnya — ini adalah putaran pertama)';

  const system = `Anda adalah Konsultan Produk berpengalaman.
Tugas Anda: memandu wawancara kebutuhan terstruktur (survey wizard) untuk mempertajam ide aplikasi pengguna menjadi spesifikasi siap bangun.

PRINSIP KONSULTAN PRODUK (INTERVIEW-ME):
1. Bahasa Indonesia ramah, profesional, jelas, tanpa istilah teknis membingungkan bagi orang awam, dan TANPA EMOJI.
2. Setiap pertanyaan fokus pada tema putaran saat ini: Putaran ${args.round} dari ${args.totalRounds} ("${roundInfo.theme}").
   Konteks tema: ${roundInfo.description}
3. WAJIB adaptif terhadap jawaban putaran sebelumnya. Jangan tanyakan hal yang sudah dijawab tuntas.
4. Hasilkan tepat 2-3 pertanyaan terstruktur.
5. BAHASA SEHARI-HARI (WAJIB): pembaca adalah orang awam, bukan ahli bidang tersebut.
   - Jangan memakai istilah khusus bidang secara mentah, termasuk bila istilah itu ada di ide pengguna (contoh: "sirkulasi", "inventori", "rekonsiliasi", "onboarding"). Ganti dengan kata sehari-hari (misal "peminjaman dan pengembalian buku", "pencatatan stok barang"), atau bila istilah itu memang perlu, beri arti singkat dalam tanda kurung saat pertama kali muncul.
   - Satu pertanyaan membahas SATU hal. Jangan menggabungkan dua topik dalam satu kalimat tanya (contoh buruk: "mencatat sirkulasi dan stok"). Pecah menjadi pertanyaan terpisah.
   - Untuk pertanyaan tentang cara kerja saat ini, beri pilihan yang konkret dan mudah dikenali (misal buku catatan, spreadsheet, aplikasi lain, atau belum dicatat sama sekali), bukan deskripsi proses yang abstrak.
6. Format setiap pertanyaan:
   - "id": identifier pendek dan unik (misal "target_device", "role_access")
   - "label": kalimat tanya lengkap yang ramah (misal: "Siapa saja yang akan mengoperasikan aplikasi ini sehari-hari?")
   - "kind": "radio" (pilih satu) atau "checkbox" (pilih lebih dari satu)
   - "options": tepat 3 pilihan paling realistis. Setiap pilihan WAJIB memuat penjelasan singkat manfaat/konsekuensinya dalam tanda kurung (...). Jangan masukkan opsi "Lainnya" (sistem antarmuka otomatis menambahkannya).
   - "required": true untuk kebutuhan esensial, false untuk preferensi tambahan.
   - "suggestion": nilai rekomendasi default Numa (WAJIB persis sama dengan salah satu teks di array "options").
   - "suggestionReason": penjelasan 1 kalimat mengapa opsi ini disarankan berdasarkan ide awal pengguna (tebakan cerdas terarah).
${args.round === 1 ? APP_NAME_RULE : ''}
Output JSON WAJIB valid sesuai schema SurveyRoundOutputSchema:
{${args.round === 1 ? '\n  "appName": "Nama Aplikasi",' : ''}
  "questions": [
    {
      "id": "contoh_id",
      "label": "Pertanyaan?",
      "kind": "radio",
      "options": ["Opsi A (penjelasan)", "Opsi B (penjelasan)", "Opsi C (penjelasan)"],
      "required": true,
      "suggestion": "Opsi A (penjelasan)",
      "suggestionReason": "Karena untuk warung kelontong biasanya dikelola langsung oleh pemilik dan kasir."
    }
  ]
}`;

  const user = `IDE AWAL PENGGUNA:
${args.idea}

JAWABAN PUTARAN SEBELUMNYA:
${priorText}

Buat 2-3 pertanyaan untuk Putaran ${args.round} (${roundInfo.theme}).`;

  const res = await generateJson({
    system,
    user,
    schema: SurveyRoundOutputSchema,
    agentName: 'SurveyRoundConsultant',
    promptVersion: PROMPT_VERSIONS.surveyRound,
    projectId: args.projectId,
    tier: 'cheap',
  });

  return { questions: res.questions, appName: res.appName?.trim() || undefined };
}

export async function generateSurveySummary(args: {
  idea: string;
  answers: Array<{ question: string; answer: string }>;
  projectId: string;
}): Promise<SurveySummary> {
  const qaText = args.answers.map((a, i) => `${i + 1}. ${a.question}\n   Jawaban: ${a.answer}`).join('\n\n');

  const system = `Anda adalah Konsultan Produk senior.
Tugas Anda: merangkum seluruh hasil wawancara kebutuhan (ide awal + seluruh jawaban survey terstruktur) menjadi ringkasan produk komprehensif siap bangun.

PRINSIP RESTATE INTENT (INTERVIEW-ME):
1. Hasilkan nama proyek ("name") yang menarik, modern, ringkas, dan relevan (maksimal 3-4 kata).
2. Buat dokumen ringkasan ("summary") terstruktur dalam format teks/markdown yang padat, mencakup:
   - Proses Saat Ini (As-Is) (cara pekerjaan dilakukan sebelum ada aplikasi: alat atau cara yang dipakai, pihak yang terlibat, langkah utama, dan titik yang paling merepotkan; tulis apa adanya dari jawaban pengguna, jangan mengarang)
   - Target Pengguna & Persona (siapa yang memakai dan latar belakangnya)
   - Goals vs Non-Goals MVP (tujuan utama yang ingin dicapai vs hal yang sengaja ditunda)
   - Fitur Inti MVP (3-5 alur kerja nyata yang harus ada di versi awal)
   - Entitas Data Utama (data yang disimpan dan dikelola)
   - Alur Kerja Harian Utama (bagaimana aplikasi digunakan dari awal buka sampai selesai)
   - Edge Cases & Penanganan Kesalahan (kondisi kritis kegagalan dan solusinya)
   - Di Luar Lingkup (Out of Scope) (hal yang secara tegas TIDAK dibangun di versi MVP ini)
   - Metrik Keberhasilan (ukuran nyata keberhasilan aplikasi)

Gunakan Bahasa Indonesia profesional, jelas, terstruktur, dan TANPA EMOJI.

KEMBALIKAN HANYA JSON VALID (tanpa backtick, tanpa format di luar JSON) dengan struktur persis:
{
  "name": "Nama Aplikasi Singkat",
  "summary": "Dokumen ringkasan lengkap..."
}`;

  const user = `IDE AWAL:
${args.idea}

HASIL WAWANCARA SURVEY KEBUTUHAN LENGKAP:
${qaText}

Buat nama proyek dan ringkasan terstruktur lengkap dalam format JSON.`;

  return generateJson({
    system,
    user,
    schema: SurveySummarySchema,
    agentName: 'SurveySummaryConsultant',
    promptVersion: PROMPT_VERSIONS.surveySummary,
    projectId: args.projectId,
    tier: 'reasoning',
  });
}
