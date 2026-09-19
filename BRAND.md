# Panduan Brand Numa (Brand Foundations & Usage Guide)

Dokumen ini mendefinisikan fondasi identitas, sistem desain, hierarki pesan, dan panduan penggunaan brand Numa di seluruh ekosistem web, dashboard, dokumentasi, dan CLI.

---

## 1. Brand Voice & Karakter

Numa berbicara seperti **technical strategist yang tenang, analitis, dan berbobot** -- bukan chatbot yang cerewet atau terlalu santai. Numa memposisikan diri sebagai partner arsitektur yang memberi struktur, kejelasan, dan kepastian teknis sebelum pekerjaan eksekusi dimulai.

### Karakteristik Utama

- **Tenang & Faktual**: Menggunakan kalimat deklaratif yang jelas. Tidak memicu kepanikan atau antusiasme artifisial.
- **Presisi Teknis**: Menggunakan terminologi software engineering yang tepat (bounded context, DAG, layer, dependency, acceptance criteria).
- **Berorientasi Kontrol**: Menempatkan pengguna dan developer sebagai pemilik keputusan; AI bertindak sebagai perancang terstruktur dan eksekutor patuh aturan.

### Contoh Gaya Bahasa

| Situasi | Gunakan (Do) | Hindari (Don't) |
|---|---|---|
| Inisialisasi | "Fondasi produk Anda sudah siap." | "Hore! Aplikasimu sudah berhasil dibuat dengan sihir AI!" |
| Sebelum eksekusi | "Tinjau arsitektur sebelum menghasilkan task." | "Tinggal klik di sini dan semuanya beres otomatis!" |
| Relasi dependensi | "Task ini bergantung pada layer autentikasi." | "Task ini belum bisa jalan ya, sabar dulu." |
| Kemajuan proyek | "Ubah kejelasan menjadi progres nyata." | "Build anything instantly without effort." |

### Hal yang Dilarang Keras

- **Klaim berlebihan**: "Bangun aplikasi apa saja secara instan", "Coding tanpa batas tanpa pusing".
- **Bahasa AI generik**: "Magic happens here", "Biarkan keajaiban AI bekerja".
- **Nada menggurui atau hiper-korporat**: "Sinergikan kapabilitas digital mutakhir organisasi Anda".
- **Penggunaan emoji**: Dilarang menggunakan emoji apa pun di teks, UI, label, commit, atau dokumen.

---

## 2. Brand Story

> Software berkualitas tinggi tidak lahir dari prompt ad-hoc yang spekulatif, melainkan dari perencanaan berarsitektur matang. Numa diciptakan sebagai fondasi komputasional yang menjembatani pemikiran produk mentah menjadi sistem perangkat lunak yang terstruktur, terisolasi, dan siap dieksekusi tanpa cacat oleh autonomous coding agents di komputer lokal pengembang.

---

## 3. Positioning Statement

> **"Numa is the software planning and execution workspace that turns product ideas into structured, agent-ready work."**
>
> *(Bahasa Indonesia: Numa adalah workspace perencanaan dan eksekusi software yang mengubah ide produk menjadi pekerjaan terstruktur dan siap dieksekusi oleh AI agent.)*

---

## 4. Logo System

Sistem logo Numa dirancang dengan geometri solid yang merepresentasikan keteraturan, struktur modular, dan jembatan antara spesifikasi abstrak dengan kode fisik.

### Komponen Logo

1. **Logo Utama (Primary Wordmark)**:
   - Tipografi: Logotype "Numa" berbasis DM Sans Bold dengan kerning ketat (-0.03em).
   - Karakteristik: Geometris bersih, proporsional, menyiratkan kestabilan fondasi.
2. **Monogram (Glyph)**:
   - Bentuk: Huruf kapital "N" geometris sudut terarah di dalam kontainer squircle (rounded-2xl).
   - Filosofi: Menggambarkan node graf dan transisi kontinu dari input ide ke output software.
3. **Favicon**:
   - Monogram "N" teal (#76B8A7) dengan latar deep slate (#0A0F0F) berukuran 16x16, 32x32, dan vektor SVG.

### Varian Warna Logo

- **Dark Mode (Default Utama)**:
  - Kanvas: `#0A0F0F` / `#0E1414`.
  - Monogram container: Gradien `#2D7E79` ke `#1F5A56` dengan bayangan `rgba(45,126,121,0.3)`.
  - Teks Wordmark: `#F1F5F9`.
- **Light Mode**:
  - Kanvas: `#FFFFFF` / `#F8FAFC`.
  - Monogram container: Solid `#2D7E79`.
  - Teks Wordmark: `#0F172A`.

### Aturan Ukuran Minimum & Ruang Bersih (Clear Space)

- **Ukuran Minimum Wordmark**: Tinggi 20px (digital) / 8mm (cetak).
- **Ukuran Minimum Monogram**: 16x16px (browser tab) / 24x24px (header UI).
- **Ruang Bersih (Clear Space)**: Minimal 1x lebar monogram "N" di keempat sisi logo. Tidak boleh ada teks, garis pembatas, atau elemen visual lain yang melanggar batas ini.
- **Larangan Modifikasi**:
  - Jangan memiringkan atau memutar sudut logo.
  - Jangan mengubah rasio skala secara tidak proporsional (stretch/squeeze).
  - Jangan mengganti warna logo di luar palet resmi Numa.
  - Jangan menambahkan drop shadow hitam pekat atau glow berwarna selain palet teal.

---

## 5. Design Tokens

Design token Numa memastikan konsistensi visual antara aplikasi web (`apps/web`), antarmuka dashboard, komponen UI, dan terminal CLI (`packages/cli`).

### 5.1 Palet Warna

#### Warna Brand & Aksen
- **Primary Teal**: `#2D7E79` (HSL: `174 47% 33%`) -- Warna identitas utama, tombol primer, node aktif.
- **Accent Mint/Teal Light**: `#76B8A7` (HSL: `168 35% 56%`) -- Sorotan teks, badge aktif, tautan penting.
- **Dark Teal (Hover/Active)**: `#1F5A56` (HSL: `174 47% 23%`) -- State tombol ditekan, ring border tebal.

#### Warna Permukaan & Latar Belakang (Dark Theme Standard)
- **Base Background (`numa-bg`)**: `#0A0F0F` -- Latar kanvas utama aplikasi dan landing page.
- **Card Surface (`numa-card`)**: `#0E1414` -- Latar container modul, card bento, terminal window.
- **Surface Hover**: `#141D1C` -- Interaksi hover pada kartu atau baris daftar.
- **Border Default**: `#1A2624` (atau `rgba(255, 255, 255, 0.08)`).
- **Border Highlight**: `rgba(45, 126, 121, 0.3)`.

#### Tipografi & Teks
- **Foreground (Primary Text)**: `#F1F5F9` -- Judul utama, heading, teks dengan kontras tinggi.
- **Text Body (`numa-text`)**: `#8A9A95` -- Teks deskripsi reguler, body copy.
- **Muted Text (`numa-muted`)**: `#5E6E68` -- Label sekunder, metadata, indikator pasif.
- **Dim Text (`numa-dim`)**: `#3E4E48` -- Pembatas, prompt simbol terminal `$`, baris nonaktif.

#### Status Fungsional
- **Success / Valid**: `#10B981` (Emerald) -- Validasi lulus, task selesai, agent aktif.
- **Warning / Checkpoint**: `#F59E0B` (Amber) -- Gate review arsitektur, butuh konfirmasi.
- **Destructive / Error**: `#E11D48` (Crimson) -- Validasi gagal, file dilarang, error eksekusi.
- **Info / Dependency**: `#38BDF8` (Sky) -- Relasi dependensi DAG, tautan referensi.

### 5.2 Skala Spacing (Grid 4px)

| Token | Ukuran | Penggunaan |
|---|---|---|
| `space-1` | 4px | Padding micro, badge gap |
| `space-2` | 8px | Jarak antar item ringkas, icon offset |
| `space-3` | 12px | Padding tombol padat, gap field input |
| `space-4` | 16px | Padding default card kecil, gap form |
| `space-6` | 24px | Padding card standar, jarak antar modul |
| `space-8` | 32px | Jarak antar section, padding modal dialog |
| `space-12` | 48px | Margin section halaman dashboard |
| `space-16` | 64px | Padding vertikal section landing page |

### 5.3 Radius Sudut

- `rounded-sm`: 4px (badge, tooltip micro, tag).
- `rounded-md`: 6px (input text, tombol sekunder, toast).
- `rounded-lg`: 8px (default card, dropdown menu, dialog box).
- `rounded-xl`: 12px (modul bento, floating node, container besar).
- `rounded-2xl`: 16px (monogram badge, modal container, terminal box).
- `rounded-full`: 9999px (pill button, status dot, avatar ring).

### 5.4 Tipografi

- **Font Utama (Prosa & Headings)**: `DM Sans`, sans-serif.
  - Sifat: Bersih, humanis modern, keterbacaan tinggi pada layar digital.
  - Skala Ukuran:
    - Display / Hero: `clamp(2.4rem, 5.5vw, 4.5rem)`, weight 800, leading 0.95.
    - H1: `2.25rem` (36px), weight 700.
    - H2: `1.75rem` (28px), weight 700.
    - H3: `1.25rem` (20px), weight 600.
    - Body Regular: `0.9375rem` (15px) atau `1rem` (16px), weight 400, leading 1.6.
    - Body Small / Caption: `0.8125rem` (13px), weight 400/500.
- **Font Teknis (Kode, Token, CLI, Metadata)**: `JetBrains Mono`, monospace.
  - Sifat: Proporsi tegas, ligatur jelas, kontras teknis kuat.
  - Ukuran: `0.6875rem` (11px) hingga `0.875rem` (14px).

### 5.5 Shadow & Elevation

- Mengutamakan border halus (`border border-white/[.08]`) daripada shadow hitam pekat.
- **Teal Glow (Elemen Fokus/Hover)**: `0 0 30px rgba(45, 126, 121, 0.25)`.
- **Card Elevation**: `0 4px 20px -2px rgba(0, 0, 0, 0.5)`.

### 5.6 States Komponen

- **Default**: Kontur border tenang (`border-white/[.08]`), teks netral.
- **Hover**: Peningkatan intensitas border (`border-white/20` atau `border-numa-primary/40`), teks menjadi putih/terang.
- **Active / Pressed**: Skala mikro 0.99, latar belakang lebih gelap.
- **Focus Visible**: Ring 2px solid `#2D7E79` dengan offset 2px.
- **Disabled**: Opacity 40%, pointer-events none, cursor not-allowed.

---

## 6. Messaging Hierarchy

Struktur komunikasi Numa disusun hierarkis agar pengguna memahami nilai teknis produk secara bertahap dan meyakinkan.

```
[Level 1: Hero Claim]
"Shape ideas into software."
             │
             ▼
[Level 2: Subheadline]
"Software planning and execution workspace yang mengubah ide produk
menjadi arsitektur terstruktur dan task atomic yang siap dieksekusi AI agent."
             │
             ▼
[Level 3: Bukti & Alur Eksekusi (Pillars)]
Numa Brief  ──>  Numa Blueprint  ──>  Numa Flow  ──>  Numa Forge  ──>  Numa Agent
 (Discovery)        (BRD & Stack)     (Tree & DAG)     (Task Graph)     (CLI Runner)
```

### Rincian Messaging per Tingkatan

1. **Hero Tagline**:
   - *"Shape ideas into software."*
   - Pesan: Ringkas, fokus pada transformasi pemikiran menjadi wujud software nyata.
2. **Subheadline Produk**:
   - *"Deskripsikan ide aplikasimu. Numa merancang dokumen kebutuhan, menyusun pohon arsitektur, membagi task atomic dengan batas konteks terisolasi, dan menjalankannya via coding agent langsung di mesin lokalmu."*
3. **Pilar Bukti Teknis**:
   - **Tanpa Halusinasi Arsitektur**: Setiap task memiliki boundary eksplisit (`files_to_create`, `files_to_modify`, `forbidden_files`).
   - **Validasi Siklus DAG**: Ketergantungan antar task diuji secara matematis bebas dari siklus sirkular.
   - **Kontrol Penuh Developer**: Manusia menyetujui di checkpoint; agent mengeksekusi dengan guard verifikasi otomatis.

---

## 7. Naming System (Keluarga Fitur Numa)

Seluruh fitur inti Numa mengadopsi pola nama terpadu dengan awalan **Numa + [Kata Teknis Singkat]**:

| Nama Fitur | Tahap Alur | Fungsi & Output Teknis |
|---|---|---|
| **Numa Brief** | Tahap 1 - 2 (Chat & Interview) | Modul wawancara discovery kebutuhan. Menggali arsitektur dan edge case produk dari dialog interaktif. |
| **Numa Blueprint** | Tahap 3 - 4 (Tech Stack & BRD) | Modul spesifikasi kebutuhan bisnis (BRD) komprehensif dan matriks pemilihan teknologi. |
| **Numa Flow** | Tahap 5 (Tree Hierarchy) | Modul dekomposisi hierarki visual aplikasi (App -> Fitur -> Sub-fitur) dan relasi antar komponen. |
| **Numa Forge** | Tahap 6 (Board & Tasks) | Mesin peracik atomic tasks dengan bounded context ketat dan papan Kanban eksekusi. |
| **Numa Agent** | Tahap 7 - 8 (Guide & CLI) | Runner eksekusi otonom berbasis CLI (`numa next/context/done`) yang bekerja di terminal developer. |

---

## 8. Brand Usage Guide (Aturan Praktis Penggunaan)

Panduan operasional bagi pengembang, desainer, dan penulis konten:

1. **Konsistensi Bahasa**:
   - Seluruh teks antarmuka publik, dialog konfirmasi, dan label aplikasi wajib menggunakan **Bahasa Indonesia** yang baku, ringkas, dan jelas.
   - Istilah teknis software engineering global yang baku tetap dipertahankan dalam bahasa aslinya (misalnya: *bounded context*, *atomic task*, *CLI*, *middleware*, *dependency*, *token*).
2. **Tanpa Emoji di Seluruh Medium**:
   - Dilarang keras menaruh emoji di UI, tombol, pesan error, nama file, commit message, maupun dokumentasi teknis.
   - Gunakan icon garis dari pustaka `lucide-react` (misalnya `<Terminal />`, `<FileText />`, `<CheckCircle2 />`, `<Layers />`).
3. **Penerapan Typography**:
   - Heading dan teks penjelasan umum selalu memakai `DM Sans`.
   - Kode sumber, perintah shell, path direktori, dan token identitas selalu memakai `JetBrains Mono`.
4. **Tone of Voice Checklist**:
   - Apakah kalimat ini terdengar percaya diri dan tenang? (Ya)
   - Apakah kalimat ini menjanjikan hal yang tidak realistis? (Tidak)
   - Apakah kalimat ini menjelaskan kondisi teknis secara spesifik? (Ya)
