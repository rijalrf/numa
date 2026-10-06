# AI Software Factory — Final Architecture & AI Calls Report

**Project:** Numa  
**Document Type:** Architecture, Business Analysis, AI Agent & Task Generation Specification  
**Status:** Optimized Final Report  
**Scope:** Backend AI orchestration, product discovery, requirements engineering, UX specification, architecture planning, task generation, coding-agent execution, and validation

> **Catatan status implementasi (diperbarui 2026-10-05):** dokumen ini adalah spesifikasi desain. Fungsi `generateTreeFromBrd`, `generateBRDFromDiscovery`, `generatePRDFromDiscovery`, dan `generateRoadmapFromBRD` sudah dihapus dari kode karena tidak lagi dipanggil; alur aktual memakai PRD (`prd.ts`), roadmap (`roadmap.ts`), tree dan tasks lewat antrean `AiJob`. Rujukan ke nama-nama tersebut di bawah bersifat historis. Pemakaian token dan biaya aktual dapat dilihat di dashboard admin `/admin/usage`.

---

## 1. Executive Summary

`Numa` menggunakan AI untuk mengubah ide aplikasi dari user menjadi spesifikasi dan task implementasi yang dapat dikonsumsi oleh coding agent seperti Claude Code, Cursor, Aider, atau Roo Code.

Arsitektur awal sudah memiliki fondasi yang baik:

```text
Chat
  ↓
Interview / Discovery
  ↓
BRD
  ↓
Roadmap
  ↓
Atomic Tasks
  ↓
Coding Agent
```

Namun, arsitektur tersebut perlu diperkuat karena informasi dapat kehilangan detail ketika berpindah dari satu tahap ke tahap berikutnya. Selain itu, layer DATABASE → BACKEND → FRONTEND yang terlalu linear dapat membuat agent mengerjakan seluruh layer aplikasi secara terpisah, bukan menyelesaikan sebuah fitur secara utuh.

Arsitektur yang direkomendasikan dalam laporan ini mengubah sistem menjadi:

```text
USER
 ↓
PRODUCT DISCOVERY
 ↓
PRODUCT SPECIFICATION
 ↓
ARCHITECTURE SPECIFICATION
 ↓
UX/UI SPECIFICATION
 ↓
FEATURE & DEPENDENCY GRAPH
 ↓
ATOMIC TASK GENERATION
 ↓
TASK VALIDATION
 ↓
CODING AGENT
 ↓
RUNTIME SCOPE GUARD
 ↓
TEST & ACCEPTANCE VALIDATION
 ↓
DONE
```

Prinsip utama:

1. Requirement menjadi **source of truth**.
2. Setiap requirement memiliki ID.
3. Business rule memiliki ID.
4. Product Tree dipisahkan dari Execution Graph.
5. Dependency menggunakan `depends_on`, bukan hanya `order`.
6. Task memiliki bounded context yang eksplisit.
7. `forbidden` pada prompt bukan satu-satunya perlindungan; runtime juga harus melakukan enforcement.
8. Frontend memiliki spesifikasi UI/UX tersendiri.
9. Acceptance Criteria dipisahkan dari Definition of Done.
10. Pekerjaan deterministic tidak perlu dibebankan kepada AI.
11. Model mahal digunakan untuk reasoning yang membutuhkan kualitas tinggi.
12. Model murah digunakan untuk pekerjaan atomic dan terstruktur.
13. Context yang diberikan kepada coding agent harus sekecil mungkin tetapi tetap lengkap.

---

# 2. Konfigurasi Engine & Gateway AI

Seluruh pemanggilan AI tetap dipusatkan melalui modul:

```text
apps/api/src/lib/ai/ai-service.ts
```

Metode utama:

```text
generateJson<T>({
  system,
  user,
  schema,
  maxRetries
})
```

Klien menggunakan OpenAI SDK yang kompatibel dengan OpenAI API dan gateway yang kompatibel.

Konfigurasi dasar:

```env
AI_PROVIDER=openai
OPENAI_BASE_URL=http://localhost:20128/v1
OPENAI_MODEL=ai-builder
```

Parameter dasar:

```text
response_format: JSON
temperature: 0.4
maxRetries: 2
schema validation: Zod
```

### Rekomendasi

Jangan membuat setiap agent memiliki implementasi client AI sendiri.

Gunakan satu abstraction layer:

```text
AI Service
 ├── provider
 ├── model
 ├── temperature
 ├── timeout
 ├── retry
 ├── schema validation
 └── observability
```

Tambahkan metadata internal:

```text
agentName
model
inputTokens
outputTokens
latencyMs
retryCount
validationResult
```

Tujuannya agar penggunaan AI dapat diukur dan dioptimalkan.

---

# 3. Arsitektur AI Agent yang Direkomendasikan

## 3.1 High-Level Architecture

```text
                         USER
                           │
                           ▼
                 ┌──────────────────┐
                 │ Product Discovery│
                 └────────┬─────────┘
                          │
                          ▼
                 ┌──────────────────┐
                 │ Product Spec     │
                 │ BRD / PRD        │
                 └────────┬─────────┘
                          │
             ┌────────────┴────────────┐
             ▼                         ▼
   ┌──────────────────┐      ┌──────────────────┐
   │ Architecture     │      │ UX/UI Spec       │
   │ Agent            │      │ Agent            │
   └────────┬─────────┘      └────────┬─────────┘
            │                         │
            └────────────┬────────────┘
                         ▼
               ┌───────────────────┐
               │ Feature Planner   │
               │ + Dependency Graph│
               └─────────┬─────────┘
                         │
                         ▼
               ┌───────────────────┐
               │ Task Generator    │
               └─────────┬─────────┘
                         │
                         ▼
               ┌───────────────────┐
               │ Task Validator    │
               └─────────┬─────────┘
                         │
                         ▼
                    TASK DATABASE
                         │
                         ▼
                   CODING AGENT
                         │
                         ▼
                RUNTIME SCOPE GUARD
                         │
                         ▼
                  TEST / VALIDATION
                         │
                         ▼
                        DONE
```

---

# 4. Prinsip Source of Truth

Masalah terbesar yang harus dihindari adalah requirement berubah bentuk setiap kali berpindah agent.

Gunakan prinsip:

```text
User Input
    ↓
Canonical Project Specification
    ↓
Semua agent membaca specification yang sama
```

Agent tidak boleh mengarang ulang requirement dari nol.

## 4.1 Project Contract

Buat satu artefak canonical:

```text
PROJECT CONTRACT
```

Struktur:

```text
project
problem
goals
targetUsers
roles
userJourneys
features
functionalRequirements
businessRules
dataRequirements
apiRequirements
architectureRequirements
uiRequirements
designSystem
nonFunctionalRequirements
constraints
outOfScope
techStack
```

Project Contract menjadi sumber kebenaran utama.

---

# 5. Requirement Identification

Setiap requirement harus memiliki ID stabil.

Contoh:

```text
FR-001
FR-002
FR-003
```

Business rules:

```text
BR-001
BR-002
BR-003
```

Non-functional requirements:

```text
NFR-001
NFR-002
```

UI requirements:

```text
UI-001
UI-002
```

API requirements:

```text
API-001
API-002
```

Dengan demikian sebuah task dapat menunjuk requirement yang harus dipenuhi.

Contoh:

```json
{
  "task_id": "BE-PRODUCT-003",
  "requirement_ids": [
    "FR-001",
    "BR-001",
    "BR-002"
  ]
}
```

---

# 6. AI Call Inventory

Arsitektur awal memiliki 10 titik pemanggilan AI:

| No | Fungsi | Peran Baru |
|---|---|---|
| 1 | `replyChat` | Product Discovery Conversation |
| 2 | `finalizeChatSession` | Project Contract Initialization |
| 3 | `generateInterviewFromChat` | Discovery Gap Analysis |
| 4 | `recommendInterviewAnswer` | Decision Assistance |
| 5 | `recommendTechStack` | Architecture / Stack Recommendation |
| 6 | `generateTreeFromBrd` | Feature Tree Generation |
| 7 | `generateDiscoveryQuestions` | Discovery Form |
| 8 | `generateBRDFromDiscovery` | Canonical Product Specification |
| 9 | `generateRoadmapFromBRD` | Feature Execution Graph |
| 10 | `generateTasksFromRoadmap` | Atomic Task Generator |

Fungsi-fungsi tersebut dapat dipertahankan secara bertahap agar perubahan sistem tidak terlalu besar.

Namun tanggung jawabnya harus diperjelas dan overlap harus dikurangi.

---

# 7. Agent 1 — Product Discovery Conversation

## Function

```text
replyChat
```

## Tujuan

Mengubah ide mentah menjadi pemahaman masalah yang cukup jelas.

Agent tidak boleh langsung mendesain database, memilih framework, atau menentukan arsitektur.

## System Prompt yang direkomendasikan

```text
Anda adalah Product Discovery Specialist untuk Numa.

Tugas utama Anda adalah membantu user non-teknis menjelaskan ide aplikasi secara jelas sebelum keputusan teknis dibuat.

PRINSIP:
1. Jangan mengarang kebutuhan yang belum diberikan user.
2. Jangan menyimpulkan kebutuhan penting tanpa dasar.
3. Tanyakan pertanyaan yang paling bernilai untuk mengurangi ketidakjelasan.
4. Gunakan Bahasa Indonesia yang sederhana dan ramah.
5. Maksimal 2 pertanyaan per giliran.
6. Prioritaskan:
   - masalah
   - target pengguna
   - tujuan
   - alur utama
   - fitur inti
   - aturan bisnis penting
7. Jangan membahas teknologi kecuali user memang meminta.
8. Jangan membuat fitur hanya karena fitur tersebut umum pada aplikasi sejenis.
9. Jika informasi sudah cukup, gunakan kind="done".
10. Output HARUS JSON sesuai schema.
```

`done` hanya boleh digunakan apabila minimal tersedia:

```text
problem
primary target user
3 core features
main user flow
```

---

# 8. Agent 2 — Project Finalization

## Function

```text
finalizeChatSession
```

## Tujuan

Membentuk identitas awal project dari hasil discovery.

Output:

```json
{
  "name": "Nama Project",
  "summary": "Ringkasan singkat"
}
```

Agent tidak boleh menambahkan requirement baru.

Prompt:

```text
Anda adalah Product Analyst.

Berdasarkan hasil discovery yang diberikan, buat nama project yang jelas dan ringkasan singkat.

ATURAN:
1. Jangan menambahkan fitur yang tidak disebutkan.
2. Jangan mengubah tujuan utama aplikasi.
3. Ringkasan harus merepresentasikan informasi yang benar-benar tersedia.
4. Jika informasi masih ambigu, jangan membuat detail baru.
5. Output JSON sesuai schema.
```

---

# 9. Agent 3 — Discovery Gap Analysis

## Function

```text
generateInterviewFromChat
```

## Tujuan

Menemukan informasi penting yang belum tersedia.

Agent ini bukan mengulang pertanyaan yang sudah dijawab.

Prompt:

```text
Anda adalah Senior Business Analyst.

Analisis hasil discovery dan cari informasi yang masih kurang tetapi dapat mengubah desain produk, business rule, atau implementasi.

Prioritaskan gap yang memiliki dampak terbesar.

Kategori yang dapat digunakan:
- target_user
- role
- user_flow
- business_rule
- data
- platform
- authentication
- integration
- permission
- success_criteria
- constraint

ATURAN:
1. Jangan menanyakan hal yang sudah jelas.
2. Jangan membuat pertanyaan hanya untuk menambah jumlah pertanyaan.
3. Setiap pertanyaan harus memiliki alasan bisnis.
4. Maksimal 8 pertanyaan.
5. Minimal 2 pertanyaan critical jika memang terdapat gap critical.
6. Gunakan tepat 3 opsi relevan.
7. Jangan memasukkan "Lainnya".
8. Output JSON sesuai schema.
```

---

# 10. Agent 4 — Interview Recommendation

## Function

```text
recommendInterviewAnswer
```

## Tujuan

Membantu user memilih jawaban ketika user tidak yakin.

Penting:

Agent harus membedakan:

```text
FACT
INFERENCE
RECOMMENDATION
```

Prompt:

```text
Anda adalah Product Consultant.

Berikan rekomendasi jawaban berdasarkan konteks yang tersedia.

ATURAN:
1. Jangan menyatakan rekomendasi sebagai fakta.
2. Gunakan konteks project terlebih dahulu.
3. Jika konteks tidak cukup, nyatakan ketidakpastian.
4. Pilih opsi yang paling sederhana dan sesuai tujuan project.
5. Hindari overengineering.
6. Jelaskan alasan secara singkat.
7. Jangan menambahkan requirement baru.
8. Output JSON sesuai schema.
```

---

# 11. Agent 5 — Architecture & Tech Stack

## Function

```text
recommendTechStack
```

## Tujuan

Memilih teknologi berdasarkan requirement, bukan berdasarkan preferensi AI.

Prompt:

```text
Anda adalah Senior Software Architect.

Rekomendasikan architecture dan tech stack berdasarkan requirement yang tersedia.

PRINSIP:
1. Requirement lebih penting daripada preferensi teknologi.
2. Pilih solusi paling sederhana yang memenuhi kebutuhan.
3. Hindari overengineering.
4. Pertimbangkan kemampuan user non-teknis.
5. Pertimbangkan local development.
6. Pertimbangkan deployment.
7. Pertimbangkan maintenance.
8. Jangan memilih teknologi hanya karena populer.
9. Jika teknologi default masih cocok, gunakan default.
10. Jika requirement membutuhkan teknologi lain, jelaskan alasannya.
11. Jangan membuat requirement baru.

Default stack jika tidak ada alasan untuk mengganti:
- React + TypeScript
- Node.js + TypeScript
- Express
- Prisma
- SQLite untuk development sederhana
- Tailwind CSS

Output JSON sesuai schema.
```

---

# 12. Agent 6 — Canonical Product Specification

## Function

```text
generateBRDFromDiscovery
```

## Perubahan penting

BRD jangan hanya menjadi dokumen naratif.

BRD harus menjadi **canonical specification** yang dapat dikonsumsi agent lain.

Struktur minimum:

```text
overview
problem
goals
targetUsers
roles
userJourneys
features
functionalRequirements
businessRules
dataRequirements
apiRequirements
uiRequirements
techRequirements
nonFunctionalRequirements
constraints
outOfScope
successCriteria
```

Setiap requirement harus memiliki ID.

Contoh:

```json
{
  "id": "FR-001",
  "title": "Create Product",
  "description": "Admin dapat membuat produk baru.",
  "priority": "MUST",
  "actor": "ADMIN"
}
```

Business rule:

```json
{
  "id": "BR-001",
  "description": "Harga produk harus lebih besar dari 0."
}
```

---

# 13. Agent 7 — Product Feature Tree

## Function

```text
generateTreeFromBrd
```

## Perubahan konsep

Tree hanya menggambarkan struktur produk.

Jangan memasukkan detail execution task terlalu dalam.

Struktur:

```text
Application
├── Authentication
├── Product Management
│   ├── Create Product
│   ├── Update Product
│   └── Delete Product
├── Order
└── Reporting
```

Tree bukan source of truth untuk dependency.

Dependency disimpan di Execution Graph.

---

# 14. Agent 8 — UX/UI Specification

Ini adalah capability baru yang perlu ditambahkan.

## Tujuan

Mengubah requirement menjadi spesifikasi UI yang dapat diimplementasikan junior atau AI murah.

Output minimal:

```text
pages
components
layout
responsiveBehavior
interaction
states
validation
accessibility
designTokens
```

Contoh:

```json
{
  "page": "Login",
  "purpose": "Memungkinkan user masuk ke aplikasi.",
  "layout": {
    "mobile": "single column",
    "desktop": "centered form"
  },
  "components": [
    "Logo",
    "EmailInput",
    "PasswordInput",
    "SubmitButton"
  ],
  "states": [
    "idle",
    "loading",
    "validation_error",
    "api_error",
    "success"
  ]
}
```

---

# 15. Frontend Design System Contract

Semua frontend task harus mengikuti contract yang sama.

## Prinsip

```text
1. Simple
2. Clean
3. Mobile-first
4. Clear hierarchy
5. Consistent spacing
6. Reusable components
7. Accessible
8. Minimal visual noise
9. Avoid unnecessary icons
10. Avoid decorative elements without purpose
```

## Spacing

Gunakan sistem konsisten:

```text
4
8
12
16
24
32
48
64
```

## Border Radius

```text
6
8
12
16
```

## Typography

Minimal:

```text
Display
Heading
Body
Label
Caption
```

## Component Rules

Sebelum membuat component baru:

```text
1. Cari component existing.
2. Gunakan jika sesuai.
3. Modifikasi jika reusable.
4. Buat component baru hanya jika memiliki tanggung jawab jelas.
```

AI tidak boleh membuat component duplikat hanya karena nama berbeda.

---

# 16. Execution Graph

Roadmap lama menggunakan:

```text
DATABASE
→ BACKEND
→ FRONTEND
→ INTEGRATION
```

Model baru menggunakan feature-oriented execution graph.

Contoh:

```text
FEATURE: Product Management

DB-PRODUCT-001
      ↓
BE-PRODUCT-001
      ↓
FE-PRODUCT-001
      ↓
TEST-PRODUCT-001
```

Feature lain dapat berjalan paralel jika dependency tidak bertabrakan:

```text
AUTH
PRODUCT
REPORTING
```

Execution graph memiliki:

```text
task_id
feature_id
depends_on
blocks
layer
order
```

`order` hanya digunakan sebagai fallback display order.

Dependency sebenarnya berasal dari:

```text
depends_on
```

---

# 17. Task Generator

## Function

```text
generateTasksFromRoadmap
```

Ini adalah salah satu komponen paling penting dalam sistem.

Task harus dirancang untuk:

```text
Junior Programmer
+
Low-cost AI Coding Agent
```

## Prinsip Atomic Task

Satu task harus:

- memiliki satu tujuan utama
- memiliki bounded context
- memiliki dependency jelas
- dapat dikerjakan tanpa membaca seluruh project
- memiliki acceptance criteria
- memiliki validation command
- memiliki Definition of Done

---

# 18. Task Schema Baru

Recommended structure:

```json
{
  "task_id": "BE-PRODUCT-003",
  "title": "Create product endpoint",
  "description": "Membuat endpoint untuk menambahkan product.",

  "feature_id": "PRODUCT",

  "requirement_ids": [
    "FR-001",
    "BR-001",
    "BR-002"
  ],

  "depends_on": [
    "DB-PRODUCT-001"
  ],

  "layer": "BACKEND",

  "files_to_create": [
    "apps/api/src/modules/product/product.controller.ts"
  ],

  "files_to_modify": [
    "apps/api/src/routes/index.ts"
  ],

  "files_readonly": [
    "apps/api/prisma/schema.prisma"
  ],

  "forbidden": [
    "apps/web/**",
    "apps/api/prisma/**"
  ],

  "implementation_steps": [
    "Create controller",
    "Validate request",
    "Call product service",
    "Return HTTP 201"
  ],

  "acceptance_criteria": [
    "Valid request returns HTTP 201",
    "Invalid price returns HTTP 400",
    "Duplicate SKU returns HTTP 409"
  ],

  "validation_commands": [
    "npm test",
    "npm run typecheck"
  ],

  "definition_of_done": [
    "Implementation completed",
    "Acceptance criteria passed",
    "Tests passed",
    "No forbidden files changed"
  ]
}
```

---

# 19. Bounded Context

Setiap task memiliki tiga kategori file:

```text
files_to_create
files_to_modify
files_readonly
```

dan satu kategori:

```text
forbidden
```

Contoh backend:

```text
Allowed:
apps/api/src/**

Read-only:
apps/api/prisma/schema.prisma

Forbidden:
apps/web/**
```

Frontend:

```text
Allowed:
apps/web/src/**

Read-only:
API contract

Forbidden:
apps/api/**
```

Database:

```text
Allowed:
prisma/**
apps/api/prisma/schema.prisma

Forbidden:
apps/web/**
apps/api/src/**
```

---

# 20. Runtime Scope Guard

Prompt tidak cukup untuk membatasi coding agent.

Implementasikan policy validator pada CLI/backend.

Sebelum file ditulis:

```text
requested file
      ↓
resolve absolute path
      ↓
compare with allowed paths
      ↓
compare with forbidden paths
      ↓
ALLOW / BLOCK
```

Contoh:

```text
Task:
layer = BACKEND

Agent:
modify apps/web/src/App.tsx

Runtime:
❌ BLOCKED
Reason:
Path is outside task bounded context.
```

Ini adalah security/control layer yang sebenarnya.

---

# 21. Acceptance Criteria vs Definition of Done

Jangan mencampurkan keduanya.

## Acceptance Criteria

Mengukur apakah requirement terpenuhi.

Contoh:

```text
POST /products dengan SKU duplicate
menghasilkan HTTP 409.
```

## Definition of Done

Mengukur apakah task benar-benar siap selesai.

```text
[ ] Implementation selesai
[ ] Acceptance criteria pass
[ ] Tests pass
[ ] Typecheck pass
[ ] Lint pass
[ ] Tidak ada forbidden file berubah
[ ] Tidak ada unrequested dependency
[ ] Tidak ada TODO baru yang menghalangi requirement
```

---

# 22. Deterministic Validation

Jangan menggunakan AI untuk sesuatu yang dapat diverifikasi secara deterministic.

Gunakan program:

```text
JSON Schema validation
Zod validation
TypeScript compiler
ESLint
Unit tests
Integration tests
API tests
Git diff
Path policy
Dependency check
```

AI hanya digunakan untuk reasoning ketika memang diperlukan.

---

# 23. Coding Agent Workflow

CLI tetap dapat menggunakan workflow:

```text
numa next
      ↓
GET /api/agent/tasks/next
      ↓
numa start
      ↓
POST /api/agent/tasks/:id/start
      ↓
numa context
      ↓
GET /api/agent/tasks/:id/context
      ↓
Coding Agent
      ↓
Runtime Scope Guard
      ↓
Tests
      ↓
Validation
      ↓
numa done
```

Tetapi `done` tidak boleh hanya berarti agent mengklaim selesai.

Server harus melakukan validasi.

---

# 24. Recommended Completion Flow

```text
Agent requests DONE
       ↓
Check task status
       ↓
Check changed files
       ↓
Check forbidden paths
       ↓
Run typecheck
       ↓
Run lint
       ↓
Run relevant tests
       ↓
Check acceptance criteria
       ↓
PASS?
 ┌─────┴─────┐
 YES         NO
 ↓            ↓
DONE       FAILED
              ↓
        Generate failure context
              ↓
        Agent retry / new task
```

---

# 25. Model Routing

Tidak semua pekerjaan membutuhkan model terbaik.

## High Reasoning Model

Gunakan untuk:

```text
Product discovery
Ambiguous requirements
Architecture
Business rule analysis
Complex UX decisions
Feature decomposition
Task planning
Task validation
```

## Low Cost Model

Gunakan untuk:

```text
CRUD implementation
Boilerplate
Simple components
Simple tests
Type errors
Lint fixes
Documentation
Small refactoring
```

## No AI

Gunakan deterministic tools untuk:

```text
Schema validation
Typecheck
Lint
Test execution
Git diff
Path enforcement
JSON validation
Dependency validation
```

---

# 26. Context Budget Strategy

Coding agent tidak perlu menerima seluruh BRD.

Gunakan:

```text
PROJECT CONTRACT
        +
Relevant Requirements
        +
Relevant Business Rules
        +
Task
        +
Dependencies
        +
Relevant Files
        +
Acceptance Criteria
```

Jangan kirim:

```text
Entire chat history
Entire BRD
Entire roadmap
Entire project tree
```

kecuali memang diperlukan.

Tujuannya:

```text
Less context
→ less token
→ less distraction
→ less hallucination
→ lower cost
→ faster execution
```

---

# 27. Task Context Example

Task backend hanya menerima:

```text
PROJECT:
Inventory App

FEATURE:
Product Management

REQUIREMENTS:
FR-001
Admin can create product.

BUSINESS RULES:
BR-001
Price > 0.

BR-002
SKU must be unique.

DEPENDENCY:
DB-PRODUCT-001

ALLOWED FILES:
apps/api/src/modules/product/**

READ ONLY:
apps/api/prisma/schema.prisma

FORBIDDEN:
apps/web/**

ACCEPTANCE:
- POST /products valid → 201
- invalid price → 400
- duplicate SKU → 409
```

Ini jauh lebih cocok untuk model murah.

---

# 28. Task Size Rule

Atomic task harus dapat diselesaikan dalam satu context yang wajar.

Jika task mulai membutuhkan:

```text
10+ file
multiple unrelated features
multiple business domains
architecture changes
frontend + backend + database
```

maka task harus dipecah.

Contoh buruk:

```text
Implement complete authentication system.
```

Contoh baik:

```text
DB-AUTH-001
Create User and Session models.

BE-AUTH-001
Create login service.

BE-AUTH-002
Create login endpoint.

FE-AUTH-001
Create login form.

TEST-AUTH-001
Add authentication integration tests.
```

---

# 29. Junior-Friendly Task Writing Standard

Setiap task harus menjawab:

```text
Apa yang dibuat?
Mengapa dibuat?
File mana yang boleh disentuh?
Apa dependency-nya?
Langkah implementasinya bagaimana?
Bagaimana cara mengetahui bahwa task berhasil?
Apa yang tidak boleh dilakukan?
```

Jika salah satu jawaban tidak tersedia, task belum siap diberikan kepada junior atau AI murah.

---

# 30. Out of Scope

Setiap task wajib memiliki batas.

Contoh:

```text
OUT OF SCOPE:
- Tidak membuat frontend.
- Tidak mengubah database schema.
- Tidak menambahkan authentication baru.
- Tidak melakukan refactor module lain.
- Tidak mengubah dependency project.
```

Ini mengurangi scope creep.

---

# 31. Design Task Standard

Frontend task harus menyertakan:

```text
Page
Purpose
Layout
Components
Data
Interactions
States
Validation
Responsive behavior
Accessibility
Acceptance criteria
```

Minimal state:

```text
idle
loading
success
empty
error
```

Jika relevan:

```text
disabled
unauthorized
not_found
offline
```

---

# 32. Frontend Quality Gate

Frontend task tidak dianggap selesai hanya karena UI terlihat.

Minimal:

```text
[ ] Responsive
[ ] Loading state
[ ] Empty state jika relevan
[ ] Error state
[ ] Validation
[ ] Keyboard accessibility
[ ] No duplicated component
[ ] Existing design system reused
[ ] No unnecessary dependency
[ ] Typecheck pass
[ ] Lint pass
```

---

# 33. Business Analysis Quality Gate

Sebelum masuk implementation planning:

```text
[ ] Problem jelas
[ ] Target user jelas
[ ] Actor/role jelas
[ ] Core flow jelas
[ ] Core features jelas
[ ] Business rules teridentifikasi
[ ] Data utama teridentifikasi
[ ] Out of scope jelas
[ ] Success criteria jelas
[ ] Requirement memiliki ID
```

Jika belum terpenuhi, jangan langsung generate coding task.

---

# 34. Architecture Quality Gate

Sebelum task generation:

```text
[ ] Tech stack ditentukan
[ ] Database strategy ditentukan
[ ] API strategy ditentukan
[ ] Folder/module boundary jelas
[ ] Authentication strategy jika diperlukan
[ ] Integration strategy jika diperlukan
[ ] Deployment constraint diketahui
[ ] Major dependencies diketahui
```

---

# 35. Task Quality Gate

Sebelum task disimpan:

```text
[ ] Unique task ID
[ ] Feature ID valid
[ ] Requirement IDs valid
[ ] Dependencies valid
[ ] No circular dependency
[ ] Files scope valid
[ ] Forbidden paths valid
[ ] Acceptance criteria testable
[ ] Validation commands tersedia
[ ] Definition of Done tersedia
[ ] Out of scope jelas
```

---

# 36. Dependency Validation

Backend harus memvalidasi:

```text
A depends_on B
```

Jika:

```text
B tidak ada
```

maka task invalid.

Juga harus menolak circular dependency:

```text
A → B
B → C
C → A
```

Task graph harus berupa Directed Acyclic Graph untuk execution planning.

---

# 37. Retry Strategy

Jangan selalu melakukan retry dengan prompt yang sama.

Gunakan:

```text
Initial generation
      ↓
Schema validation
      ↓
FAIL?
      ↓
Generate correction context
      ↓
Retry
```

Jika gagal karena business ambiguity:

```text
STOP → ask user
```

Jika gagal karena format:

```text
AUTO RETRY
```

Jika gagal karena code validation:

```text
CREATE FAILURE CONTEXT
```

---

# 38. Failure Context

Contoh:

```json
{
  "task_id": "BE-PRODUCT-003",
  "status": "FAILED",
  "failure_type": "TEST_FAILURE",
  "command": "npm test",
  "error": "Expected 409 but received 500",
  "affected_files": [
    "apps/api/src/modules/product/product.service.ts"
  ],
  "next_action": "Fix duplicate SKU handling."
}
```

Coding agent tidak perlu menerima seluruh log jika tidak relevan.

---

# 39. Observability

Setiap AI call sebaiknya dicatat:

```text
call_id
project_id
agent_name
model
started_at
completed_at
latency
input_tokens
output_tokens
retry_count
schema_valid
success
failure_reason
```

Dengan ini dapat diketahui:

```text
Agent mana paling mahal?
Agent mana paling sering retry?
Prompt mana sering gagal?
Task mana sering gagal?
Model mana paling cost-effective?
```

---

# 40. Recommended Final Pipeline

```text
PHASE 1 — DISCOVERY

User
 ↓
Product Discovery
 ↓
Discovery Gap Analysis
 ↓
Project Contract


PHASE 2 — DEFINITION

Project Contract
 ↓
BRD / Product Specification
 ↓
Business Rules
 ↓
Success Criteria


PHASE 3 — DESIGN

Product Specification
 ├── Architecture
 └── UX/UI Specification


PHASE 4 — PLANNING

Feature Tree
 ↓
Execution Graph
 ↓
Dependency Validation


PHASE 5 — TASK GENERATION

Execution Graph
 ↓
Atomic Task Generator
 ↓
Task Validator
 ↓
Task Database


PHASE 6 — EXECUTION

Coding Agent
 ↓
Task Context
 ↓
Runtime Scope Guard
 ↓
Implementation


PHASE 7 — VALIDATION

Typecheck
 ↓
Lint
 ↓
Tests
 ↓
Acceptance Criteria
 ↓
Git Diff / Scope Check
 ↓
DONE
```

---

# 41. Recommended Responsibility Matrix

| Component | Tanggung Jawab |
|---|---|
| Product Discovery Agent | Memahami masalah |
| Discovery Agent | Menemukan gap |
| Product Spec Agent | Membuat requirement canonical |
| Architecture Agent | Menentukan technical approach |
| UX Agent | Menentukan UI/UX behavior |
| Feature Planner | Membentuk feature graph |
| Task Generator | Membuat atomic tasks |
| Task Validator | Memeriksa kualitas task |
| Coding Agent | Mengimplementasikan task |
| Runtime Guard | Membatasi file access |
| Test Runner | Validasi teknis |
| Acceptance Validator | Memvalidasi requirement |
| Server | Menentukan status DONE |

---

# 42. Prinsip "AI Tidak Boleh Menebak"

Ini menjadi aturan utama sistem.

Jika informasi:

```text
known
```

gunakan.

Jika:

```text
unknown but low impact
```

gunakan default yang aman dan dokumentasikan.

Jika:

```text
unknown and high impact
```

jangan menebak.

Minta klarifikasi.

Contoh:

```text
Database:
SQLite cukup → boleh default.

Payment provider:
belum ditentukan → jangan memilih Stripe hanya karena umum.
```

---

# 43. Prinsip Simplicity First

AI harus selalu memilih:

```text
simplest solution that satisfies known requirements
```

bukan:

```text
most sophisticated solution
```

Contoh:

Jika aplikasi hanya digunakan lokal oleh satu user:

```text
SQLite
```

lebih tepat daripada:

```text
PostgreSQL cluster + Redis + message broker
```

kecuali requirement memang membutuhkannya.

---

# 44. Prinsip No Unrequested Refactoring

Coding agent tidak boleh melakukan:

```text
"sekalian saya refactor..."
```

kecuali refactoring tersebut merupakan bagian dari task.

Task harus memiliki:

```text
scope
out_of_scope
```

Perubahan di luar scope harus ditolak atau dilaporkan.

---

# 45. Prinsip Existing Code First

Sebelum membuat sesuatu:

```text
1. Inspect existing structure.
2. Search for reusable implementation.
3. Reuse existing component/service.
4. Extend existing abstraction if appropriate.
5. Only create new abstraction when necessary.
```

Tujuannya mencegah:

```text
duplicate service
duplicate component
duplicate utility
duplicate API client
```

---

# 46. Migration Strategy dari Arsitektur Lama

Tidak perlu melakukan rewrite besar sekaligus.

## Step 1

Pertahankan 10 AI calls.

Perkuat schema dan prompt.

## Step 2

Tambahkan:

```text
Requirement IDs
Business Rule IDs
depends_on
Definition of Done
```

## Step 3

Tambahkan:

```text
UX/UI Specification
```

## Step 4

Pisahkan:

```text
Product Tree
Execution Graph
```

## Step 5

Tambahkan runtime scope guard.

## Step 6

Tambahkan deterministic validation.

## Step 7

Tambahkan model routing.

## Step 8

Kurangi AI calls yang overlap setelah metrics tersedia.

---

# 47. Prioritas Implementasi

## P0 — Critical

```text
1. Canonical Project Contract
2. Requirement IDs
3. Business Rule IDs
4. depends_on
5. Atomic Task Schema
6. Definition of Done
7. Runtime Scope Guard
8. Deterministic Validation
```

## P1 — High

```text
9. UX/UI Specification
10. Design System Contract
11. Feature Tree vs Execution Graph
12. Task Validator
13. Dependency Validator
```

## P2 — Optimization

```text
14. Context compression
15. Model routing
16. Retry classification
17. Failure context
18. AI observability
```

## P3 — Advanced

```text
19. Automatic recovery
20. Agent feedback loop
21. Task quality scoring
22. Historical failure learning
23. Cost/performance optimization
```

---

# 48. Success Metrics

Sistem sebaiknya tidak hanya mengukur jumlah task.

Gunakan:

## Requirement Quality

```text
Requirement ambiguity rate
Requirement change rate
```

## Task Quality

```text
Task validation pass rate
Task retry rate
Average task size
Scope violation rate
```

## Coding Agent

```text
First-pass success rate
Average retries/task
Test pass rate
```

## AI Efficiency

```text
Cost/project
Tokens/project
Latency/project
Cost/successful task
```

## Product Outcome

```text
Percentage of project completed
Requirement acceptance rate
Defect rate
```

Metric paling penting:

```text
Successful Task / AI Cost
```

Bukan sekadar:

```text
Number of AI Calls
```

---

# 49. Target Operating Model

Dengan desain ini, pembagian kerja menjadi:

```text
HUMAN
│
├── Business decision
├── Ambiguous requirements
└── Final approval
│
▼
HIGH-REASONING AI
│
├── Analysis
├── Architecture
├── UX
└── Planning
│
▼
LOW-COST AI
│
├── Atomic implementation
├── Tests
└── Simple fixes
│
▼
DETERMINISTIC SYSTEM
│
├── Scope
├── Typecheck
├── Lint
├── Tests
└── Acceptance
```

---

# 50. Final Architecture Principle

Tujuan `Numa` bukan membuat AI yang bisa menulis kode sebanyak mungkin.

Tujuan sebenarnya adalah membuat:

> **sistem yang mengubah kebutuhan manusia menjadi pekerjaan software yang kecil, jelas, terukur, aman, dan dapat diverifikasi.**

Maka kualitas sistem harus dinilai dari:

```text
Requirement
   ↓
Correct Interpretation
   ↓
Correct Specification
   ↓
Correct Task
   ↓
Correct Implementation
   ↓
Verified Result
```

Bukan:

```text
Prompt
 ↓
AI
 ↓
Code
```

Arsitektur final yang direkomendasikan:

```text
                      NUMA

              ┌─────────────────┐
              │      USER       │
              └────────┬────────┘
                       ▼
              ┌─────────────────┐
              │    DISCOVERY    │
              └────────┬────────┘
                       ▼
              ┌─────────────────┐
              │ PROJECT CONTRACT│
              └────────┬────────┘
                       ▼
             ┌─────────┴─────────┐
             ▼                   ▼
       ARCHITECTURE            UX/UI
             │                   │
             └─────────┬─────────┘
                       ▼
              ┌─────────────────┐
              │ FEATURE GRAPH   │
              └────────┬────────┘
                       ▼
              ┌─────────────────┐
              │ TASK GENERATOR  │
              └────────┬────────┘
                       ▼
              ┌─────────────────┐
              │ TASK VALIDATOR  │
              └────────┬────────┘
                       ▼
                 TASK DATABASE
                       │
                       ▼
                CODING AGENT
                       │
                       ▼
              ┌─────────────────┐
              │ RUNTIME GUARD   │
              └────────┬────────┘
                       ▼
                TEST & VERIFY
                       │
                 ┌─────┴─────┐
                 ▼           ▼
               PASS         FAIL
                 │           │
                 ▼           ▼
                DONE      FAILURE CONTEXT
                             │
                             ▼
                         AGENT RETRY

```

**Kesimpulan:** arsitektur awal `Numa` sudah memiliki fondasi yang tepat, terutama centralized AI service, structured JSON output, roadmap, atomic tasks, dan bounded context. Perbaikan terbesar yang diperlukan adalah menjadikan requirement sebagai canonical source of truth, memperkenalkan dependency graph, memperkuat task contract, menambahkan UX/UI specification, memindahkan enforcement scope dari prompt ke runtime, serta memisahkan pekerjaan reasoning AI dari pekerjaan deterministic. Dengan perubahan tersebut, output AI lebih cocok untuk junior programmer maupun low-cost coding agent dan sistem memiliki jalur yang lebih jelas menuju AI-assisted software engineering yang dapat diukur dan dikontrol.
