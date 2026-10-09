# Rencana: Kontrak Bersama Antar Fase untuk Aplikasi Hasil Generate

Tanggal: 2026-10-09. Cakupan: `apps/api` (generator spec PRD, roadmap, task per fase, quality gate, konteks task, Master Prompt, Change Cycle), CLI (`packages/cli`: skill pack dan pemeriksaan gaya di `numa done`), dokumen.

Status: **seluruh enam tahap sudah di kode (2026-10-09).** Semua keputusan sudah dijawab (bagian 5). Hasil verifikasi lokal ada di bagian 7; ringkasan perubahan di `docs/LAPORAN_PERUBAHAN.md` bagian 26.

## 1. Latar belakang

Aplikasi contoh: Dentika Reservasi Gigi (Next.js 14, 17 commit), dibuat agent lewat `numa` dari project di server UAT. Jalur utamanya jalan (tes E2E lulus), tapi hasilnya punya pola masalah yang sama di banyak tempat:

| # | Temuan di aplikasi hasil generate | Bukti |
|---|---|---|
| 1 | Sidebar tampil di beranda, login, dan register. Sidebar tamu berisi menu Masuk dan Daftar, ditambah tombol "Masuk Sistem" di bawah sidebar dan tombol yang sama lagi di kartu beranda | `AppSidebar` dipasang di root `src/app/layout.tsx`. Route group `(auth)` ada tapi tanpa `layout.tsx` sendiri |
| 2 | Path halaman tidak cocok antar bagian | Login mengarah ke `/appointments` dan `/doctor/queue`, padahal halamannya `/patient/appointments` dan `/doctor/consultations`. Menu dokter "Jadwal Praktik" mengarah ke `/schedules` (404). Agent menambal dengan 3 halaman yang isinya hanya redirect |
| 3 | File dengan fungsi sama dibuat dua kali | `validations/auth.ts` (BOOTSTRAP, tidak dipakai) dan `validations/auth.schema.ts` (BACKEND). `AuthProvider.tsx` (tidak dipakai) dan `providers.tsx`. `AlertBanner` dan `ErrorBanner` (tidak dipakai) |
| 4 | Fondasi frontend dibuat terlambat lalu tidak dipakai | `api-client.ts` dan `ErrorBanner` dibuat di fase INTEGRATION, sesudah semua halaman selesai. Semua halaman memanggil `fetch` langsung |
| 5 | Task frontend membuat endpoint sendiri tanpa proteksi | `GET /api/doctors` dibuat di commit frontend, terbuka tanpa login, dan mengembalikan email serta nomor HP dokter |
| 6 | Tampilan generik, belum didesain | `tailwind.config.ts` dan `globals.css` masih bawaan `create-next-app` (hanya `--background`/`--foreground`, font Arial). 464 class warna Tailwind mentah tersebar di halaman. `components/ui` hanya berisi `AlertBanner`, dan 27 `<button>` diberi gaya sendiri-sendiri. Tidak ada identitas visual yang mencerminkan klinik gigi |

Temuan logika bisnis (kode antrean selalu `DR1-`, tanggal booking tidak dicek terhadap hari jadwal, konsep slot dan antrean tercampur, status `CONFIRMED` tidak terpakai) **di luar cakupan** rencana ini. Sumbernya belum pasti (PRD atau agent) karena PRD project tersebut belum diperiksa.

## 2. Akar masalah di Numa

1. **Aturan sidebar tanpa pengecualian.** Skill `frontend-ui-engineering.md` bagian 4 menulis "Aplikasi hasil generate WAJIB menggunakan sidebar menu", tanpa menyebut bahwa aturan itu hanya untuk area setelah login. Aturan yang sama diulang di `buildTasksPrompt` (`tasks.ts`, aturan FRONTEND) dan checklist `master-prompt.ts`. Bagian 9 skill ("layar login, daftar, dan lupa password memakai satu layout") ambigu, dan agent menganggap layout global sudah memenuhi.
2. **Fase dibuat paralel tanpa kontrak bersama.** `generateTasksByPhase` memanggil AI per fase secara paralel. Konteks fase lain hanya `describeOtherPhases` (`task-merge.ts`), yang berisi judul fase dan nama fitur. Tidak ada daftar path halaman, file bersama, atau pemilik file, sehingga tiap fase menebak sendiri.
3. **Kontrak arsitektur hanya membahas backend.** `architecture-contract.ts` mengatur route, service, dan repository, tapi tidak membahas layout, guard rute, API client, providers, atau komponen bersama.
4. **Urutan fase membuat fondasi frontend datang terlambat.** Aturan FRONTEND mewajibkan "memanggil API Client", tapi `integrationRules` dan `wiringRule` menaruh pembuatan "API client wrapper" di fase INTEGRATION. Roadmap juga menaruh wiring FE ke BE di fase terakhir.
5. **Tidak ada pemeriksaan arah sebaliknya untuk endpoint.** `validateApiCoverage` hanya memeriksa endpoint mutasi backend yang belum punya pemanggil UI. Endpoint yang dipanggil UI tapi tidak ada di backend tidak terdeteksi, dan `consumesApis` hanya diwajibkan untuk mutasi (GET tidak tercatat). Tidak ada aturan yang melarang task FRONTEND membuat endpoint.
6. **Agent memilih menambal.** Skill `numa-workflow.md` tidak melarang tambalan seperti halaman redirect, file setara dengan nama lain, atau endpoint baru di task frontend.
7. **Desain tidak pernah menjadi pekerjaan yang dinilai.** Skill `numa-frontend` bagian 8 sudah mewajibkan design token dan pustaka komponen sebelum halaman pertama, tapi agent mengabaikannya karena:
   - Roadmap dan task tidak punya task fondasi desain. Setiap task halaman langsung membuat halamannya, jadi palet, font, dan komponen tidak pernah ditentukan.
   - Acceptance criteria FRONTEND hanya mengukur fungsi (data dari API, skeleton, AlertBanner). Validation command hanya build, lint, dan test. Prompt task (`tasks.ts`, aturan umum) menyebut "Fokus utama keberhasilan task adalah Acceptance Criteria dan Validation Commands", sehingga skill desain yang panjang dianggap saran.
   - PRD dan spec tidak memuat arah desain (nuansa, kesan, kepadatan data). Skill meminta "desain sesuai subjek", tapi agent tidak diberi bahannya.
   - Agent tidak pernah melihat hasil tampilannya. Tes E2E hanya memeriksa fungsi.
   - Prompt task diarahkan ke "LOW-COST AI CODING AGENT" dan membatasi langkah implementasi ke 1 sampai 3 butir, jadi detail visual hilang lebih dulu.

## 3. Arsitektur perbaikan

```
PRD tersimpan
  -> job prd_spec: ProductSpec + pages (peta halaman: path, akses, peran, endpoint, requirement)   [baru]
                   + design (arah desain: nuansa, palet, tipografi, kepadatan)                   [baru]
  -> tasks_generate:
       roadmap: FRONTEND diawali fitur "Fondasi UI" (token, font, komponen, layout, API client)  [ubah]
       tiap fase (paralel) menerima KONTRAK BERSAMA yang sama:                                   [baru]
         - peta halaman dan arah desain dari spec
         - kontrak UI shell + file bersama per stack (layout publik/aplikasi, guard, navigasi,
           api-client, providers, komponen ui, lokasi skema validasi) beserta layer pemiliknya
       quality gate (deterministik):
         - file dibuat lebih dari satu task -> task berikutnya diubah jadi modify + depends_on     [baru]
         - endpoint dipanggil UI tapi tidak ada di backend/spec -> peringatan                    [baru]
         - task FRONTEND membuat file endpoint -> peringatan                                     [baru]
         - endpoint GET publik -> kriteria keamanan "tanpa data pribadi"                          [baru]
         - task FRONTEND -> kriteria komponen/token + DoD screenshot                              [baru]
  -> numa context: task FRONTEND menerima halaman yang relevan, arah desain,
                   dan kontrak UI shell ringkas                                                  [baru]
  -> agent: Fondasi UI dikerjakan dulu, lalu tiap halaman diperiksa lewat screenshot            [baru]
  -> numa done (CLI): task FRONTEND diperiksa otomatis dari gaya warna mentah                  [baru]
```

Kontrak bersama disusun sekali (spec dan kontrak stack) lalu dikirim ke semua fase, jadi pembuatan paralel tetap dipakai dan tidak ada panggilan AI tambahan.

### Prinsip instruksi untuk agent

Agent yang mengerjakan task lewat `numa` diperlakukan seperti programmer junior: patuh, tapi tidak bisa diharapkan menebak maksud yang tidak tertulis. Kasus Dentika menunjukkan bahwa aturan yang kabur dijawab agent dengan tambalan. Semua instruksi yang sampai ke agent (skill, Master Prompt, `numa context`) mengikuti prinsip berikut. Instruksi tetap di tingkat tinggi: apa yang dikerjakan dan aturannya, tanpa contoh kode atau instruksi baris per baris.

1. **Langkah kerja berurutan.** Setiap jenis task punya urutan kerja yang jelas, misalnya: baca peta halaman dan kontrak, kerjakan, periksa tampilan, lalu `numa done`.
2. **Batas file tegas, bukan rekomendasi.** Daftar file task adalah batas kerja. Kalimat di prompt task yang menyebut field file sebagai "rekomendasi/panduan" (`tasks.ts`, aturan umum) diganti dengan aturan tegas, dengan pengecualian stack non-TypeScript tetap disebut.
3. **Contoh benar dan salah dalam bentuk uraian.** Contohnya: memakai komponen dari pustaka internal itu benar, memberi warna langsung di halaman itu salah, dan membuat halaman redirect untuk menutupi path yang salah juga salah.
4. **Panduan saat buntu.** Daftar singkat situasi dan tindakannya:
   - endpoint yang dibutuhkan tidak ada: `numa block`;
   - path atau navigasi salah di file milik task lain: laporkan, jangan tambal;
   - arah desain kosong: pakai token dari Fondasi UI, jangan mengarang palet;
   - pemeriksaan gaya gagal di file milik task lain: laporkan di `--summary`.
5. **Checklist sebelum `numa done`** berupa pertanyaan ya atau tidak, bukan prinsip umum seperti "desain sesuai subjek".
6. **Urutan prioritas bila bertentangan:** kontrak bersama (peta halaman, kontrak UI shell), lalu Acceptance Criteria task, lalu skill.

Langkah kerja standar per layer disuntik deterministik oleh `numa context` (bagian 5 nomor 15).

## 4. Langkah implementasi

### Tahap 1: Aturan layout dan larangan menambal (teks skill dan prompt)

Menyelesaikan temuan 1 secara langsung dan mengurangi temuan 2 sampai 5. Risiko rendah karena hanya teks.

1. **Skill `packages/cli/skills/frontend-ui-engineering.md`**
   - Bagian 4 ditulis ulang menjadi dua layout:
     - **Layout publik**: beranda publik, login, register, lupa password, dan halaman galat. Tanpa sidebar. Login, register, dan lupa password berupa kartu di tengah layar.
     - **Layout aplikasi**: semua halaman setelah login. Sidebar dengan menu sesuai peran user, nama dan peran user, dan tombol Keluar.
   - Tambahan aturan:
     - Tidak ada menu tamu (Masuk, Daftar) di dalam sidebar.
     - Satu jalan masuk per layar; jangan menggandakan tombol Masuk.
     - Halaman yang butuh login dijaga di satu tempat (guard rute), bukan dicek terpisah di tiap halaman.
     - Setelah login, user diarahkan ke halaman awal sesuai peran.
     - Bila PRD tidak meminta beranda publik, `/` berupa landing sederhana untuk tamu: nama aplikasi dan satu tombol Masuk, dengan layout publik. User yang sudah login dan membuka `/` diarahkan ke halaman awal sesuai perannya.
   - Path halaman dan menu diambil dari satu file navigasi (lihat Tahap 2), tidak ditulis ulang di tiap komponen.
   - Bagian 9 "Autentikasi" dan checklist bagian 13 disesuaikan.
2. **Skill `packages/cli/skills/numa-workflow.md`**, bagian baru "Dilarang menambal":
   - Link atau path yang salah dibetulkan di sumbernya. Dilarang membuat halaman yang isinya hanya redirect untuk menutupi path yang salah.
   - Dilarang membuat file yang fungsinya sama dengan file bersama yang sudah ada (cek kontrak file bersama di `numa context`).
   - Task FRONTEND dilarang membuat endpoint API. Bila endpoint yang dibutuhkan tidak ada, jalankan `numa block --reason`.
   - Bila perbaikan sumber berada di luar `files_to_modify`, jelaskan di `--summary` atau `numa block`.
3. **`tasks.ts` (`buildTasksPrompt`)**
   - Aturan FRONTEND "Default app shell: sidebar menu" diganti dengan aturan dua layout di atas.
   - Aturan FRONTEND baru: task FRONTEND pertama adalah Fondasi UI; task FRONTEND dilarang membuat endpoint; `consumesApis` wajib mencantumkan semua endpoint yang dipanggil, termasuk GET.
   - `integrationRules` butir 2 dan `wiringRule`: INTEGRATION memverifikasi semua halaman memakai API client dari Fondasi UI, tidak membuat API client baru.
4. **`master-prompt.ts`**: checklist "app shell default sidebar menu" diganti dengan "layout publik tanpa sidebar, layout aplikasi dengan sidebar per peran, guard rute di satu tempat".
5. **`roadmap.ts`**: aturan FRONTEND menjadi "fitur pertama fase FRONTEND adalah Fondasi UI (layout publik dan aplikasi, guard rute, navigasi, design token, komponen internal, API client); fitur halaman lain bergantung padanya". Aturan INTEGRATION tidak lagi menyebut pembuatan API client.

### Tahap 2: Kontrak UI shell dan file bersama per stack

1. Modul baru (usulan nama) `apps/api/src/lib/ai/ui-shell-contract.ts`:
   - `resolveUiShellContract(stack)` dengan kunci berdasarkan framework **frontend** (kontrak arsitektur yang ada berkunci backend): `nextjs`, `react-spa`, `vue-spa`, `laravel-blade`, ditambah `generic` sebagai fallback.
   - `renderUiShellContract(contract)` menghasilkan teks ringkas untuk prompt.
   - Isi per kunci: layout publik, layout aplikasi, lokasi guard rute, file navigasi, dan daftar file bersama beserta **layer pemiliknya**.
2. Contoh isi untuk `nextjs`:

   | File | Fungsi | Pemilik |
   |---|---|---|
   | `src/app/layout.tsx` | html/body + Providers saja, tanpa sidebar | BOOTSTRAP |
   | `src/app/providers.tsx` | satu-satunya file providers (session, query) | Fondasi UI |
   | `src/app/(public)/layout.tsx` | layout publik tanpa sidebar | Fondasi UI |
   | `src/app/(app)/layout.tsx` | layout aplikasi dengan sidebar | Fondasi UI |
   | `src/middleware.ts` | guard rute per peran | Fondasi UI |
   | `src/lib/navigation.ts` | konstanta path halaman, menu per peran, halaman awal per peran | Fondasi UI |
   | `src/components/layout/AppSidebar.tsx` | sidebar, membaca menu dari `navigation.ts` | Fondasi UI |
   | `src/lib/api-client.ts` | satu-satunya pembungkus `fetch` | Fondasi UI |
   | `src/components/ui/*` | AlertBanner, Toast, Skeleton, EmptyState, dan lainnya | Fondasi UI |
   | `src/lib/validations/<domain>.schema.ts` | satu file skema per domain | BACKEND (BOOTSTRAP dilarang membuat skema domain) |

   Stack lain mengikuti pola yang sama:
   - `react-spa`: `PublicLayout`/`AppLayout`, `RequireAuth`, `router.tsx`.
   - `vue-spa`: `meta.requiresAuth` + `router.beforeEach`.
   - `laravel-blade`: `layouts/guest.blade.php` dan `layouts/app.blade.php`, plus middleware `auth` dan peran di `routes/web.php`.
3. Kontrak ini dikirim ke **semua fase** di `buildTasksPrompt`, sebagai fence terpisah setelah kontrak arsitektur, dengan aturan: file bersama dibuat hanya oleh pemiliknya, task lain mencantumkannya di `files_to_modify` atau `files_readonly`, dan dilarang membuat file setara dengan nama lain.
4. Daftar pola path endpoint per stack (mis. `src/app/api/**/route.ts`, `apps/api/src/routes/**`, `routes/api.php`) disimpan di kontrak yang sama untuk dipakai quality gate (Tahap 5).
5. `task-context.ts`: ringkasan kontrak UI shell ditambahkan ke konteks task FRONTEND (`numa context`).
6. Endpoint `GET /api/agent/architecture-contract` (`routes/agent.ts`) dan Master Prompt (`routes/master-prompt.ts`) ikut menyertakan kontrak UI shell. `numa init` menulis kontrak ini ke skill `numa-architecture`, jadi kontrak juga terpasang di repo user.

### Tahap 3: Peta halaman di spec PRD

1. **`product-spec.ts`**: skema baru `SpecPageSchema` di `ProductSpecSchema.pages` (default `[]`, jadi spec lama tetap valid):

   ```ts
   {
     path: string;              // "/patient/appointments"
     title: string;             // "Janji Temu Saya"
     access: 'public' | 'auth'; // public = layout publik tanpa sidebar
     roles: string[];           // peran yang boleh membuka (kosong bila public)
     homeFor: string[];         // peran yang diarahkan ke sini setelah login
     purpose: string;
     endpoints: { method: string; path: string }[];
     requirementIds: string[];
   }
   ```

2. **Prompt ekstraktor** (`extractProductSpec`): halaman disusun dari Functional Requirements, persona, dan journey. Path memakai bahasa Inggris huruf kecil dan dikelompokkan per peran. Halaman login dan register selalu `public`. Satu halaman awal per peran. Endpoint halaman sebisa mungkin diambil dari daftar endpoint spec.
3. **`checkSpecConsistency`** ditambah pemeriksaan:
   - endpoint halaman yang tidak ada di `endpoints` spec (`PAGE_API_MISSING`). Endpoint ini dikirim ke prompt fase BACKEND sebagai "endpoint tambahan yang dibutuhkan halaman" (bagian 5 nomor 8);
   - path halaman ganda;
   - peran tanpa halaman awal, atau peran di `roles` yang tidak ada di persona.
4. **`buildTasksPrompt`**: peta halaman dikirim ke semua fase sebagai fence "PETA HALAMAN DAN NAVIGASI (KONTRAK BERSAMA)". Aturannya: path, menu sidebar, dan redirect setelah login wajib mengikuti peta ini, dan file `navigation.ts` (atau padanannya) disusun dari peta ini.
5. **`task-context.ts`**: task FRONTEND menerima halaman yang relevan (cocok lewat `requirementIds` atau path yang disebut di task) ditambah daftar ringkas semua path untuk navigasi.
6. Ukuran prompt bertambah kira-kira 2.000 sampai 4.000 karakter per fase (peta halaman ditambah kontrak UI shell). Diukur di `tasks-prompt.test.ts`. Keluaran ekstraktor spec (tier cheap) juga bertambah karena `pages` dan `design`.
7. **Change Cycle** (`lib/ai/cycle.ts`): `specDelta` boleh memuat halaman baru, dan `mergeSpecDelta` menggabungkan `pages` (dedup berdasarkan path) supaya halaman dari perubahan masuk ke peta halaman. `analyzeChangeRequest` menerima ringkasan peta halaman yang ada, supaya halaman baru memakai pola path yang sama.
8. `selectSpecSections`: karena arah desain ditulis di PRD (bagian 5 nomor 13), heading "Arah Desain" ditambahkan ke `SPEC_SECTION_PATTERNS` supaya ikut terbaca ekstraktor.

### Tahap 4: Fondasi desain dan pemeriksaan visual

Menyelesaikan temuan 6: desain dijadikan pekerjaan yang punya bahan, punya task sendiri, dan bisa diperiksa.

1. **Arah desain dari produk.** Field baru `ProductSpec.design` (usulan nama `SpecDesignSchema`, opsional sehingga spec lama tetap valid):

   ```ts
   {
     tone: string;                                // "klinis, tenang, tepercaya"
     palette: { primary: string; accent?: string; neutral: string; rationale: string };
     typography: { heading: string; body: string }; // nama font, mis. dari Google Fonts
     density: 'compact' | 'comfortable';          // tabel padat untuk back-office, lega untuk publik
     radius: 'none' | 'small' | 'medium' | 'large';
     avoid: string[];                             // klise yang dihindari untuk domain ini
   }
   ```

   Sumbernya adalah domain produk, persona, dan konteks pemakaian (back-office, publik, lapangan). Arah desain ditulis sebagai bagian "Arah Desain" di PRD, lalu disalin ekstraktor ke spec (bagian 5 nomor 13).
2. **Fondasi UI menjadi fitur dan task pertama fase FRONTEND** (aturan roadmap di Tahap 1). Kriteria baseline disuntikkan secara deterministik (modul usulan `lib/ai/design-baseline.ts`, polanya sama dengan `security-baseline.ts`) ke task fitur Fondasi UI:
   - Token warna (primary, surface, border, teks, success, warning, danger, info), radius, bayangan, dan tipografi ada di satu tempat (tema Tailwind atau CSS variable), dan nilainya mengikuti `spec.design`.
   - Font dimuat lewat `next/font` atau padanannya. Font bawaan sistem (Arial, Helvetica) tidak dipakai kecuali arah desain memintanya.
   - `components/ui` (atau padanannya per stack) minimal berisi Button, Input, Select, Textarea, Modal, Card, Badge, Table, Skeleton, EmptyState, AlertBanner, dan Toast.
   - Layout publik dan layout aplikasi dari kontrak UI shell (Tahap 2).
3. **Task FRONTEND lain** mendapat suntikan otomatis:
   - kriteria "halaman disusun dari komponen `components/ui` dan token, tanpa gaya warna lokal, dan lolos pemeriksaan gaya `numa done`";
   - `depends_on` ke task Fondasi UI bila belum ada.
4. **Pemeriksaan gaya bawaan CLI** (`packages/cli`, modul usulan `ui-check.ts`). Pemeriksaannya ditanam di CLI, tidak ditulis agent di repo user, supaya hasilnya sama di semua project dan bisa diuji di repo Numa. Alasan tidak memakai `validation_commands`: `numa` tidak ada di `ALLOWED_PROGRAMS` (`command-policy.ts`), dan script buatan agent tidak bisa dijamin.
   - Dijalankan otomatis oleh `numa done` untuk task berlayer FRONTEND, hanya pada file yang berubah di task itu (guard sudah tahu daftar file berubah dari `baselineSha`), sehingga task lain tidak ikut disalahkan.
   - Menolak warna palet bawaan Tailwind (`slate-`, `gray-`, `sky-`, `rose-`, dan seterusnya), nilai warna arbitrer (`bg-[#...]`), dan hex mentah.
   - Pengecualian: folder komponen (`components/ui`) dan file token.
   - Folder, ekstensi, dan pengecualian per stack dikirim server sebagai field `uiCheck` pada data task yang diambil CLI (`routes/agent.ts`), diambil dari kontrak UI shell (Tahap 2). Task tanpa `uiCheck` tidak diperiksa.
   - Dilewati bila stack tidak memakai Tailwind (mis. stack hasil rekomendasi AI dengan CSS modules). Pemeriksaan ini hanya berlaku untuk styling yang dikenali.
   - Hasil gagal sama dengan `validation_commands` gagal: task tidak bisa DONE tanpa `--force`, dan pesan galat menyebut file, baris, dan class yang ditolak.
5. **Pemeriksaan visual di definition of done** task halaman FRONTEND: jalankan aplikasi, ambil screenshot halaman dengan Playwright (sudah ada di semua golden stack) di lebar 390 dan 1280 px, lalu periksa terhadap checklist skill. Checklist: token dan komponen dipakai, layout publik atau aplikasi sesuai peta halaman, tidak ada gulir horizontal, dan state kosong serta galat terlihat wajar. Screenshot disimpan di `.numa/screenshots/` (masuk `.gitignore`) dan tidak diperiksa `numa done` (bagian 5 nomor 14).
6. **Skill `numa-frontend` dirombak** dengan pendekatan dua langkah ala `frontend-design` (ditulis ulang, bukan disalin, karena lisensi skill itu "all rights reserved"):
   - **Langkah rencana:** baca arah desain dari `numa context`, lalu tulis rencana token, tipografi, dan konsep layout (wireframe ASCII singkat) sebelum menulis kode.
   - **Langkah eksekusi:** bangun Fondasi UI, lalu susun halaman dari komponen.
   - Daftar tampilan bawaan yang dilarang: font sistem, palet Tailwind mentah, dan kartu putih seragam di tengah latar abu-abu tanpa alasan.
   - Bagian 1 sampai 3 dan bagian 8 diringkas menjadi aturan yang bisa diperiksa.
7. **Prompt task FRONTEND** (`buildTasksPrompt`): setiap task halaman wajib punya minimal satu kriteria visual yang terukur, misalnya "memakai komponen Table dan Badge dari `components/ui`". `implementation_steps` untuk FRONTEND boleh memuat catatan komposisi tampilan.
8. **`task-context.ts`**: arah desain ditambahkan ke konteks task FRONTEND.

### Tahap 5: Pemeriksaan otomatis di quality gate (`lib/task-quality.ts`)

Semua deterministik, tanpa AI, dan hasilnya dicatat di laporan validasi.

1. **File dibuat lebih dari satu task** (modul usulan `lib/ai/file-ownership.ts`): bila path yang sama ada di `files_to_create` beberapa task, task pertama menurut urutan global menjadi pemilik. Pada task lain, path itu dipindah ke `files_to_modify`, dan task itu ditambah `depends_on` ke pemilik. Dijalankan sebelum `validateAndNormalizeDAG`, sehingga dependensi yang membuat siklus dirapikan oleh validator DAG. Temuan: `FILE_CREATE_DUPLICATE` (warning).
2. **Nama mirip di folder yang sama** (mis. `auth.ts` dan `auth.schema.ts`, `AlertBanner` dan `ErrorBanner`): temuan `FILE_NAME_SIMILAR` (info), tanpa mengubah task.
3. **Endpoint dipanggil UI tapi tidak ada di backend**: fungsi baru di `api-coverage-validator.ts` membandingkan `consumesApis` semua task FRONTEND (semua method) dengan endpoint spec dan `apiContracts` task BACKEND. Normalisasi parameter diperluas untuk `:id`, `[id]`, dan `{id}`. Temuan: `UI_API_NO_BACKEND` (warning).
4. **Task FRONTEND membuat file endpoint**: dicocokkan dengan pola path endpoint dari kontrak UI shell. Temuan: `FRONTEND_CREATES_API` (warning).
5. **`security-baseline.ts`**: kriteria baru untuk task BACKEND yang punya endpoint GET publik: "endpoint publik hanya mengembalikan field yang dibutuhkan tampilan publik; email, nomor telepon, password hash, dan token tidak boleh dikembalikan".
6. **Baseline desain** (Tahap 4 nomor 2 dan 3) dijalankan di sini setelah baseline keamanan. Temuan: `DESIGN_BASELINE_APPLIED` (info), dan `UI_FOUNDATION_MISSING` (warning) bila fase FRONTEND tidak punya fitur Fondasi UI. Pada kasus `UI_FOUNDATION_MISSING`, kriteria fondasi ditempelkan ke task FRONTEND dengan urutan paling awal. Baseline fondasi tidak dijalankan untuk siklus perubahan (`cycle_generate`), karena codebase sudah punya fondasi; task FRONTEND siklus tetap diperiksa gaya oleh `numa done`.

### Tahap 6: Versi, tes, dokumen, dan verifikasi

1. **Versi**: `PROMPT_VERSIONS` `tasks@6`, `product-spec@4`, `roadmap@3`, dan `prd@4` karena arah desain ditulis di PRD. CLI `numa-cli` naik ke **0.8.0** karena isi skill berubah.
2. **Unit test** (`apps/api/src/lib/ai/__tests__/`):
   - `product-spec.test.ts`: skema `pages`, spec lama tanpa `pages` tetap valid, `PAGE_API_MISSING`.
   - Tes baru untuk kontrak UI shell: resolusi per stack dan fallback `generic`.
   - Tes baru untuk kepemilikan file: perubahan create menjadi modify, `depends_on` ditambah, nama mirip.
   - `api-coverage-validator`: `UI_API_NO_BACKEND`, normalisasi `[id]` dan `{id}`.
   - `security-baseline.test.ts`: kriteria GET publik.
   - `tasks-phase-prompt.test.ts`: semua fase menerima peta halaman, arah desain, dan kontrak UI shell yang sama.
   - `product-spec.test.ts`: skema `design`, spec lama tanpa `design` tetap valid.
   - Tes baru untuk baseline desain: kriteria fondasi masuk ke task Fondasi UI, kriteria komponen dan `depends_on` masuk ke task FRONTEND lain, `UI_FOUNDATION_MISSING`, dan baseline tidak dijalankan untuk siklus perubahan.
   - `cycle.test.ts`: `mergeSpecDelta` menggabungkan `pages` tanpa path ganda.
   - CLI (`packages/cli`), tes pemeriksaan gaya: `text-slate-900`, `bg-[#0ea5e9]`, dan hex mentah ditolak; file di `components/ui` dan file token diizinkan; hanya file yang berubah yang diperiksa; dilewati untuk stack non-Tailwind dan layer selain FRONTEND.
3. **Dokumen**: `AGENTS.md` (tabel modul AI, `PROMPT_VERSIONS`, alur `prd_spec`) dan `docs/LAPORAN_PERUBAHAN.md`.
4. **Distribusi ke agent user.** Skill `numa-frontend` sampai ke agent user lewat `numa init`: skill dipasang ke `.agents/skills/` (salinan di `.claude/skills/`), dan blok Numa di `AGENTS.md` menyuruh agent membacanya. Master Prompt sudah memasang `numa-cli@latest` dan menjalankan `numa init`, yang otomatis memperbarui skill bila versinya berbeda dari CLI. Celah yang ditutup:
   - Master Prompt hanya mewajibkan membaca `numa-workflow`. Tambahkan kewajiban membaca `numa-frontend` sebelum task FRONTEND pertama.
   - `numa context` untuk task FRONTEND menampilkan pengingat satu baris untuk membaca skill `numa-frontend`, ditambah arah desain dan kontrak UI shell (Tahap 3 dan 4). Aturan pentingnya sampai ke agent walau skill tidak dibaca.
   - Project yang sudah berjalan dengan skill lama: `numa status` sudah menyarankan `numa init --update`. Catatan rilis 0.8.0 menyebutkan langkah ini.
   - Batasan: task yang sudah dibuat sebelum perubahan ini tidak ikut membaik. Project lama baru mendapat peta halaman, arah desain, dan Fondasi UI bila spec dan task-nya digenerate ulang. Pemeriksaan gaya di `numa done` langsung berlaku setelah CLI diperbarui, tapi project lama tanpa design token bisa gagal terus. Karena itu pemeriksaan hanya aktif bila data task dari server menyertakan konfigurasinya, yaitu task yang dibuat dengan `tasks@6` ke atas.
5. **Verifikasi di lokal**: generate ulang project dengan ide yang mirip Dentika (stack Next.js), lalu periksa hasil task:
   - spec memuat `pages` dengan login dan register `public` dan satu halaman awal per peran;
   - fitur pertama fase FRONTEND adalah Fondasi UI, dan task-nya membuat layout, guard, navigasi, dan API client;
   - tidak ada path yang dibuat lebih dari satu task;
   - tidak ada task FRONTEND yang membuat file endpoint;
   - kriteria task login menyebut redirect ke path yang ada di peta halaman;
   - spec memuat `design` yang sesuai domain, dan task Fondasi UI memuat kriteria token, font, dan komponen;
   - semua task FRONTEND lain bergantung pada Fondasi UI dan memuat kriteria komponen;
   - `numa done` menolak task FRONTEND yang sengaja diberi `text-slate-900` di halaman.

   Lalu jalankan agent sampai selesai untuk satu project dan cek tampilannya di browser (desktop dan mobile). Tahap ini wajib karena temuan 6 hanya bisa dinilai dari tampilan.

## 5. Keputusan yang sudah dijawab user

1. Perbaikan hanya di Numa. Aplikasi Dentika diabaikan dan hanya dipakai sebagai contoh kasus.
2. Temuan logika bisnis dari analisis awal dilewati dulu.
3. Peta halaman disimpan di spec PRD (`ProductSpec.pages`), disusun job `prd_spec` yang sudah ada, tanpa panggilan AI tambahan.
4. File yang dibuat lebih dari satu task: diperbaiki otomatis (task berikutnya menjadi modify + `depends_on`) dan dicatat sebagai peringatan.
5. Versi CLI naik ke 0.8.0.
6. Fondasi desain dan pemeriksaan visual (Tahap 4) masuk ke rencana ini.
7. **Waktu mulai.** Perubahan Change Cycle di working tree di-commit dulu, lalu rencana ini dikerjakan per tahap dengan commit terpisah.
8. **Endpoint yang dibutuhkan halaman tapi tidak ada di PRD** (`PAGE_API_MISSING`): dikirim ke prompt fase BACKEND sebagai "endpoint tambahan yang dibutuhkan halaman", ditambah peringatan di laporan validasi.
9. **Beranda `/` bila PRD tidak meminta halaman publik:** tamu melihat landing sederhana berisi nama aplikasi dan satu tombol Masuk, memakai layout publik tanpa sidebar. User yang sudah login diarahkan ke halaman awal sesuai perannya (`homeFor` di peta halaman).
10. **Nama baru** dipakai sesuai usulan: `ui-shell-contract.ts`, `file-ownership.ts`, `design-baseline.ts`, `packages/cli/src/ui-check.ts`, `SpecPageSchema`, `SpecDesignSchema`, field `pages`, `design`, `homeFor`, dan kode temuan `PAGE_API_MISSING`, `FILE_CREATE_DUPLICATE`, `FILE_NAME_SIMILAR`, `UI_API_NO_BACKEND`, `FRONTEND_CREATES_API`, `DESIGN_BASELINE_APPLIED`, `UI_FOUNDATION_MISSING`.
11. **Peta halaman dan arah desain tidak ditampilkan di web** dalam rencana ini. Data tetap tersimpan di spec, dan arah desain tetap terbaca di PRD.
12. **Urutan tahap:** Tahap 1 dikerjakan dan dirilis lebih dulu, lalu Tahap 4, lalu Tahap 2, 3, dan 5, dan Tahap 6 di akhir. Karena Tahap 4 mendahului kontrak UI shell (Tahap 2), nilai untuk Next.js (folder yang dipindai pemeriksaan gaya, pola file token) ditulis langsung dulu, lalu dipindah ke kontrak UI shell saat Tahap 2. Bagian Tahap 3 yang dibutuhkan Tahap 4 (`SpecDesignSchema` dan bagian "Arah Desain" di PRD) ikut dikerjakan di Tahap 4.
13. **Arah desain ditulis di PRD:** bagian baru "Arah Desain" di PRD markdown (`prd@4`), lalu ekstraktor spec menyalinnya ke `spec.design`. User bisa membaca dan mengubahnya di halaman PRD sebelum task dibuat.
14. **Screenshot pemeriksaan visual:** hanya di definition of done; agent mengambil dan memeriksa sendiri, `numa done` tidak memeriksa. File disimpan di `.numa/screenshots/` dan dikecualikan lewat `.gitignore`. Pemeriksaan ini bergantung pada agent yang bisa membaca gambar; bisa diperketat belakangan.
15. **Langkah kerja standar per layer** disuntik deterministik oleh `numa context`. `implementation_steps` tetap pendek dan khusus untuk task itu.

## 6. Yang perlu diputuskan

Tidak ada. Semua keputusan sudah dijawab (bagian 5).

## 7. Hasil verifikasi lokal (2026-10-09)

Dijalankan `scripts/test-e2e-wizard.ts` dengan `E2E_STOP_AFTER_TASKS=1` (AI nyata lewat gateway lokal), ide kasir warung kelontong, stack tersimpan React + Express + Tailwind (kontrak `react-spa`). Sesudahnya `numa context` task diambil lewat token agent sementara.

| Pemeriksaan (bagian 4, Tahap 6 nomor 5) | Hasil |
|---|---|
| Spec memuat `pages`: login `public`, satu halaman awal per peran | Sebagian. `/login` `public` dan lima halaman terbentuk, tetapi hanya `/pos` yang punya `homeFor`; persona hanya satu (Pemilik Warung), jadi tidak ada peran yang tanpa halaman awal. |
| Spec memuat `design` sesuai domain | Ya. Bagian "Arah Desain" ada di PRD (nuansa cepat, utilitarian, kontras; primary `#1E3A8A`; kepadatan padat; sudut small) dan tersalin ke `spec.design`. |
| Fitur pertama fase FRONTEND adalah Fondasi UI dan task-nya membuat layout, guard, navigasi, API client | Ya. Task #10 "Fondasi UI, Shell Navigasi, Design Tokens, API Client & Halaman Login" membuat `providers.tsx`, `api-client.ts`, `navigation.ts`, `PublicLayout.tsx`, `AppLayout.tsx`, `RequireAuth.tsx`, `router.tsx`, `AppSidebar.tsx`, `components/ui`, dan halaman login. |
| Tidak ada path yang dibuat lebih dari satu task | Ya (daftar kosong; `FILE_CREATE_DUPLICATE` tidak muncul). |
| Tidak ada task FRONTEND yang membuat file endpoint | Ya. |
| Semua task FRONTEND lain bergantung pada Fondasi UI dan memuat kriteria komponen | Ya. Task #11, #12, #13 `depends_on` #10 dan memuat kriteria berawalan "Desain:" serta definition of done screenshot. |
| Task FRONTEND membawa `uiCheck`; BACKEND tidak | Ya (4 task FRONTEND; layer lain `null`). |
| `numa context` FRONTEND memuat arah desain, halaman terkait, peta halaman, kontrak UI shell, langkah standar | Ya. |
| `GET /api/agent/architecture-contract` memuat kontrak UI shell | Ya. |
| Laporan validasi | `DESIGN_BASELINE_APPLIED` (4 task), `SEC_BASELINE_APPLIED`, dua `FILE_NAME_SIMILAR` (false positive: modal berbeda; aturan kata "modal" dan "dialog" dicabut sesudahnya). |
| `numa done` menolak `text-slate-900` di task FRONTEND | Hanya lewat tes otomatis (`packages/cli/src/__tests__/ui-check.test.ts`, termasuk guard dengan repo git sementara). Belum dijalankan dengan CLI sungguhan terhadap server. |
| Agent dijalankan sampai selesai pada satu project dan tampilan dicek di browser (desktop dan mobile) | **Belum dilakukan.** Butuh agent coding mengerjakan 18 task dan UI dilihat langsung. Temuan nomor 6 (tampilan generik) baru bisa dinilai dari langkah ini. |

Biaya satu run (12 panggilan AI, 218,7 rb token): tasks@6 5 panggilan 107,2 rb, product-spec@4 38,1 rb (1 retry Zod, sekitar 19 rb per percobaan), prd@4 17,4 rb, audit keamanan 36,5 rb. Pada run nyata sebelumnya (`docs/LAPORAN_PERUBAHAN.md` bagian 7d: 14 panggilan, 140,6 rb token, product-spec@3 sekitar 13,9 rb per percobaan) totalnya lebih kecil. Kenaikan datang dari PRD yang lebih panjang (bagian Arah Desain), spec yang memuat `pages` dan `design`, dan kontrak bersama yang dikirim ke setiap fase. Run berbeda ide dan stack, jadi angka ini perkiraan, bukan perbandingan yang terkontrol.

