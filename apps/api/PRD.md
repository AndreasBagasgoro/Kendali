# PRD — Kendali (Finance, Habit, & Productivity Management)

**Versi:** 1.0
**Tipe Arsitektur:** Modular Monolith
**Target:** Solo Developer
**Tanggal:** 22 Juli 2026

---

## 1. Ringkasan Produk

### 1.1 Latar Belakang
Aplikasi web personal untuk mengelola keuangan, kebiasaan (habit), dan aspek produktivitas lain dalam satu platform terintegrasi. Dibangun sebagai **modular monolith** agar development cepat untuk solo developer, tapi tetap punya batas modul yang jelas sehingga bisa dipecah jadi microservice di masa depan bila diperlukan.

### 1.2 Tujuan
- Satu aplikasi terpusat untuk mencatat transaksi keuangan, budget, habit, goal, dan catatan pribadi.
- Arsitektur modular agar mudah dikembangkan sendiri tanpa saling mengganggu antar fitur.
- Basis kode yang scalable dari SQLite → PostgreSQL tanpa refactor besar.

### 1.3 Non-Goals (di luar scope v1)
- Multi-tenant / kolaborasi tim (v1 murni single-user per akun, meski tabel `user_id` sudah disiapkan untuk multi-user).
- Integrasi bank/open banking otomatis (v1 input manual + import CSV).
- Native mobile app (v1 web-only, responsive).

### 1.4 Prinsip Desain Arsitektur
- **Modular Monolith**: setiap modul (finance, habit, goal, dst) punya folder sendiri: `routes`, `service`, `repository`, `schema` (Zod), `events`.
- **Encapsulation**: modul lain tidak boleh langsung query ke tabel modul lain — harus lewat service/public API modul tsb atau event.
- **Event-driven internal**: komunikasi antar modul memakai `EventEmitter` (mis. `transaction.created` dikonsumsi oleh modul notifikasi/analytics), supaya loose-coupling walau satu proses.
- **Shared Kernel**: `core/` berisi hal lintas modul (auth middleware, db client, logger, error handler, config).

---

## 2. Tech Stack (Ringkasan)

| Layer | Teknologi |
|---|---|
| Backend | Node.js + TypeScript + Fastify |
| Database | SQLite (awal) → PostgreSQL + Drizzle ORM |
| Caching | In-memory (Map/lru-cache) → Redis |
| Event Bus | Node.js `EventEmitter` (in-process) |
| Frontend | React + Vite + Tailwind + TanStack Query + Zustand |
| Validasi | Zod (frontend & backend, shared schema) |
| Auth | JWT (access + refresh token) + argon2 |
| Testing | Vitest (+ supertest/light-my-request untuk endpoint test) |
| Deploy | Docker single container → Railway/Render/Fly.io |

---

## 3. Struktur Folder (Modular Monolith)

```
apps/
├── api/                          # Backend Fastify
│   ├── src/
│   │   ├── core/                 # Shared kernel
│   │   │   ├── db/               # drizzle client, migrations
│   │   │   ├── auth/             # jwt, argon2, middleware
│   │   │   ├── config/
│   │   │   ├── logger/
│   │   │   ├── errors/           # AppError, error handler
│   │   │   ├── event-bus/        # EventEmitter wrapper + event types
│   │   │   └── plugins/          # fastify plugins (cors, sensible, jwt)
│   │   │
│   │   ├── modules/
│   │   │   ├── user/              # register, login, profile
│   │   │   ├── finance/           # accounts, transactions, budget, category
│   │   │   ├── habit/             # habit, habit-log, streak
│   │   │   ├── goal/              # savings goal, target
│   │   │   ├── notification/      # reminder, in-app notif
│   │   │   ├── journal/           # notes/jurnal harian (opsional v2)
│   │   │   └── dashboard/         # aggregation/read-model lintas modul
│   │   │
│   │   ├── app.ts                 # register semua modul (routes)
│   │   └── server.ts              # entrypoint
│   │
│   └── test/                     # vitest, per module
│
├── web/                           # Frontend React + Vite
│   └── src/
│       ├── modules/               # mirror struktur backend (feature-based)
│       ├── shared/                # api client, ui components, hooks
│       └── stores/                # zustand
│
└── packages/
    └── shared-schema/             # Zod schema dipakai bareng FE & BE (monorepo)
```

> Rekomendasi: gunakan **pnpm workspace / turborepo-lite** (tanpa turborepo dulu juga tidak apa) supaya `packages/shared-schema` bisa diimport oleh `apps/api` dan `apps/web` tanpa duplikasi tipe/schema Zod.

### 3.1 Aturan Modular (penting untuk solo dev supaya tidak jadi spaghetti)
1. Modul HANYA boleh mengakses tabel miliknya sendiri lewat repository-nya sendiri.
2. Kalau modul A butuh data modul B → panggil `B.service` (function call langsung, karena monolith) atau dengar event dari B.
3. Modul `dashboard` adalah pengecualian: boleh baca dari beberapa service modul lain untuk agregasi (read-only, read-model pattern).
4. Setiap modul expose `index.ts` sebagai public interface (barrel file) — modul lain hanya boleh import dari situ, bukan dari file internal modul.

---

## 4. Daftar Modul & Fitur

### 4.1 Module: `user` (Auth & Profile)
- Register, login, logout, refresh token
- Update profile, ganti password
- Preferensi (currency default, timezone, tema)

### 4.2 Module: `finance` (Modul Utama)
- **Accounts**: dompet/bank/e-wallet (mis. "BCA", "Cash", "GoPay")
- **Categories**: kategori transaksi (income/expense), custom & default
- **Transactions**: catat pemasukan/pengeluaran
- **Transfers**: catat perpindahan uang antar akun (mis. Bank A → Bank B), termasuk biaya admin transfer, dicatat terpisah dari income/expense supaya laporan tidak bias
- **Recurring Transactions**: transaksi berulang (subscription, gaji bulanan) — bisa juga tipe recurring transfer (mis. auto-debet tabungan tiap tanggal 1)
- **Budgets**: alokasi budget per kategori per periode (bulanan)
- **Reports**: cashflow, spending by category, trend bulanan
- **Import/Export**: import CSV mutasi bank, export laporan

### 4.3 Module: `habit`
- CRUD Habit (nama, target frekuensi: harian/mingguan/custom)
- Habit Log (check-in harian, done/skip)
- Streak calculation (current streak, longest streak)
- Habit reminder (waktu pengingat)
- Statistik (consistency rate per minggu/bulan)

### 4.4 Module: `goal`
- Savings Goal (target nominal, deadline, terhubung ke akun tertentu)
- Kontribusi manual ke goal (nabung sebagian)
- Progress tracking (% tercapai, proyeksi tercapai kapan berdasar rata-rata kontribusi)
- Non-finance goal (opsional v2, mis. "baca 12 buku setahun")

### 4.5 Module: `notification`
- In-app notification (reminder habit, budget warning saat mendekati limit, goal deadline mendekat)
- Event listener dari modul lain (`finance.budget.exceeded`, `habit.reminder.due`, `goal.deadline.near`)
- (v2) Push notification / email digest

### 4.6 Module: `journal` (opsional, v2)
- Catatan harian singkat (mood, refleksi)
- Bisa dikaitkan ke tanggal yang sama dengan habit log & transaksi (opsional linking)

### 4.7 Module: `dashboard`
- Aggregation read-model: ringkasan keuangan bulan ini, streak habit aktif, progress goal
- Widget-based (net worth, top spending category, habit consistency, upcoming bills)

### 4.8 Module: `core` (bukan fitur, tapi wajib)
- Auth middleware (JWT verify)
- Global error handler & response envelope standar
- Request validation via Zod
- Logging (pino, bawaan Fastify)
- Rate limiting sederhana (in-memory)

---

## 5. Skema Database (Ringkas — Level Tabel)

> Semua tabel punya `id` (uuid), `created_at`, `updated_at`. Tabel milik user punya `user_id` FK.

### 5.1 `users`
| Kolom | Tipe | Ket |
|---|---|---|
| id | uuid PK | |
| email | text unique | |
| password_hash | text | argon2 |
| name | text | |
| currency | text | default "IDR" |
| timezone | text | default "Asia/Jakarta" |
| created_at / updated_at | timestamp | |

### 5.2 `accounts` (finance)
| id, user_id, name, type (`cash`/`bank`/`ewallet`/`other`), initial_balance, current_balance, currency, is_archived |

### 5.3 `categories` (finance)
| id, user_id, name, type (`income`/`expense`), icon, color, is_default |

### 5.4 `transactions` (finance)
| id, user_id, account_id, category_id (nullable untuk transfer), type (`income`/`expense`/`transfer_out`/`transfer_in`), amount, note, tx_date, tags (json), created_from_recurring_id (nullable), transfer_pair_id (nullable, uuid) |

> **Kenapa `transfer_out` + `transfer_in` (2 baris) alih-alih 1 baris dengan `transfer_to_account_id`?**
> Supaya setiap baris tetap merepresentasikan pergerakan saldo pada 1 akun (konsisten dengan `income`/`expense`), dan supaya laporan cashflow/spending bisa dengan mudah **mengecualikan** transfer dari total income/expense (karena transfer bukan penghasilan atau pengeluaran riil, cuma perpindahan). Kedua baris saling terhubung lewat `transfer_pair_id` yang sama, sehingga bisa di-query/di-hapus sebagai satu kesatuan.

### 5.4.1 `transfers` (view/aggregate, opsional sebagai tabel terpisah)
Alternatif implementasi: alih-alih murni 2 baris di `transactions`, bisa juga dibuat tabel `transfers` sendiri sebagai "header", dengan `transactions` sebagai detail. Untuk v1, direkomendasikan pendekatan yang lebih sederhana (2 baris linked di atas) — cukup untuk kebutuhan personal, tanpa tabel tambahan.

| Kolom tambahan relevan (disimpan di transaksi `transfer_out`) | Ket |
|---|---|
| `fee_amount` | nominal biaya admin transfer (default 0), dicatat sebagai bagian dari transaksi `transfer_out` (mengurangi saldo akun asal lebih besar dari nominal yang diterima akun tujuan) |
| `to_account_id` | disimpan di baris `transfer_out` untuk kemudahan query "transfer ke akun mana", walau sumber kebenaran tetap `transfer_pair_id` |

### 5.5 `recurring_transactions` (finance)
| id, user_id, account_id, to_account_id (nullable, untuk recurring transfer), category_id (nullable), amount, fee_amount (default 0), type (`income`/`expense`/`transfer`), frequency (`daily`/`weekly`/`monthly`/`custom`), next_run_at, last_run_at, is_active |

### 5.6 `budgets` (finance)
| id, user_id, category_id, period (`monthly`), amount_limit, period_start, period_end |

### 5.7 `habits`
| id, user_id, name, description, frequency_type (`daily`/`weekly`/`custom_days`), target_days (json, e.g. [1,3,5]), reminder_time, color, is_archived |

### 5.8 `habit_logs`
| id, user_id, habit_id, log_date, status (`done`/`skipped`/`missed`), note |

### 5.9 `goals`
| id, user_id, name, target_amount, current_amount, deadline, linked_account_id (nullable), status (`active`/`achieved`/`abandoned`) |

### 5.10 `goal_contributions`
| id, user_id, goal_id, amount, contributed_at, note, related_transaction_id (nullable) |

### 5.11 `notifications`
| id, user_id, type, title, message, is_read, related_entity_type, related_entity_id, created_at |

### 5.12 `journal_entries` (v2)
| id, user_id, entry_date, mood (enum), content, linked_habit_log_id (nullable) |

---

## 6. Event Bus — Daftar Event Internal

| Event | Publisher | Consumer | Tujuan |
|---|---|---|---|
| `user.registered` | user | notification | kirim welcome notif |
| `transaction.created` | finance | dashboard, notification, goal | update read-model, cek budget limit |
| `transfer.created` | finance | dashboard | update read-model saldo 2 akun sekaligus |
| `transfer.deleted` | finance | dashboard | update read-model saldo 2 akun sekaligus |
| `transaction.deleted` | finance | dashboard | update read-model |
| `budget.threshold_exceeded` | finance (internal check setelah transaction.created) | notification | kirim warning |
| `habit.logged` | habit | dashboard, notification | update streak, cek achievement |
| `habit.reminder_due` | scheduler (cron) | notification | kirim reminder |
| `goal.contribution_added` | goal | dashboard, notification | update progress, cek goal tercapai |
| `goal.achieved` | goal | notification | kirim selamat |

> Implementasi: `core/event-bus/index.ts` mengekspor singleton `EventEmitter` bertipe kuat via generic map event-name → payload, supaya type-safe.


---

## 7. API Endpoints Lengkap

Konvensi:
- Base URL: `/api/v1`
- Semua endpoint (kecuali auth register/login/refresh) butuh header `Authorization: Bearer <access_token>`.
- Response envelope standar:
```json
{ "success": true, "data": {...}, "meta": {...} }
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [...] } }
```
- Pagination pakai query `?page=1&limit=20`, response `meta: { page, limit, total, totalPages }`.

### 7.1 Module `user`

| Method | Endpoint | Deskripsi |
|---|---|---|
| POST | `/auth/register` | Registrasi user baru |
| POST | `/auth/login` | Login, return access + refresh token |
| POST | `/auth/refresh` | Refresh access token |
| POST | `/auth/logout` | Invalidasi refresh token |
| GET | `/users/me` | Ambil profil user login |
| PATCH | `/users/me` | Update profil (name, currency, timezone) |
| PATCH | `/users/me/password` | Ganti password |

### 7.2 Module `finance` — Accounts

| Method | Endpoint | Deskripsi |
|---|---|---|
| GET | `/finance/accounts` | List akun milik user |
| POST | `/finance/accounts` | Buat akun baru |
| GET | `/finance/accounts/:id` | Detail akun |
| PATCH | `/finance/accounts/:id` | Update akun |
| DELETE | `/finance/accounts/:id` | Arsipkan/hapus akun |

### 7.3 Module `finance` — Categories

| Method | Endpoint | Deskripsi |
|---|---|---|
| GET | `/finance/categories` | List kategori (filter `?type=income|expense`) |
| POST | `/finance/categories` | Buat kategori custom |
| PATCH | `/finance/categories/:id` | Update kategori |
| DELETE | `/finance/categories/:id` | Hapus kategori (jika tidak dipakai transaksi) |

### 7.4 Module `finance` — Transactions

| Method | Endpoint | Deskripsi |
|---|---|---|
| GET | `/finance/transactions` | List transaksi (filter: account_id, category_id, type, date_from, date_to, search) |
| POST | `/finance/transactions` | Buat transaksi baru |
| GET | `/finance/transactions/:id` | Detail transaksi |
| PATCH | `/finance/transactions/:id` | Edit transaksi |
| DELETE | `/finance/transactions/:id` | Hapus transaksi |
| POST | `/finance/transactions/import` | Import CSV mutasi |
| GET | `/finance/transactions/export` | Export ke CSV/Excel |

> Catatan: `GET /finance/transactions` secara default **tidak** menyertakan baris `transfer_out`/`transfer_in` kecuali diberi query `?include_transfers=true`, supaya tidak tercampur dengan pemasukan/pengeluaran riil saat ditampilkan di list transaksi biasa.

### 7.4.1 Module `finance` — Transfers (Perpindahan Antar Akun)

| Method | Endpoint | Deskripsi |
|---|---|---|
| GET | `/finance/transfers` | List perpindahan uang antar akun (filter: account_id, date_from, date_to) |
| POST | `/finance/transfers` | Catat transfer baru dari akun A ke akun B |
| GET | `/finance/transfers/:id` | Detail transfer (menampilkan pasangan transaksi out & in + fee) |
| DELETE | `/finance/transfers/:id` | Hapus transfer (menghapus kedua baris `transfer_out` & `transfer_in` sekaligus, reverse saldo) |

**Contoh Request `POST /finance/transfers`:**
```json
{
  "from_account_id": "acc_bank_a_uuid",
  "to_account_id": "acc_bank_b_uuid",
  "amount": 1000000,
  "fee_amount": 6500,
  "tx_date": "2026-07-22",
  "note": "Pindah dana untuk bayar sewa"
}
```

**Contoh Response:**
```json
{
  "success": true,
  "data": {
    "transfer_pair_id": "tp_uuid",
    "from": {
      "transaction_id": "tx_out_uuid",
      "account_id": "acc_bank_a_uuid",
      "account_name": "Bank A",
      "amount_deducted": 1006500
    },
    "to": {
      "transaction_id": "tx_in_uuid",
      "account_id": "acc_bank_b_uuid",
      "account_name": "Bank B",
      "amount_received": 1000000
    },
    "fee_amount": 6500,
    "tx_date": "2026-07-22"
  }
}
```
- `amount_deducted` di akun asal = `amount + fee_amount` (fee ikut mengurangi saldo asal, tidak mengurangi nominal yang diterima akun tujuan).
- `from_account_id` dan `to_account_id` wajib berbeda dan sama-sama milik user yang login → kalau sama, 400 `SAME_ACCOUNT_TRANSFER`.
- Operasi ini **atomic**: insert 2 baris transaksi + update 2 saldo akun dibungkus 1 DB transaction. Jika salah satu gagal, semua di-rollback.
- v1 mengasumsikan `from_account` dan `to_account` memakai currency yang sama (validasi `account.currency` harus sama). Transfer lintas mata uang (dengan kurs) masuk backlog v2.

### 7.5 Module `finance` — Recurring Transactions

| Method | Endpoint | Deskripsi |
|---|---|---|
| GET | `/finance/recurring` | List recurring transaction |
| POST | `/finance/recurring` | Buat recurring baru |
| PATCH | `/finance/recurring/:id` | Update / pause / resume |
| DELETE | `/finance/recurring/:id` | Hapus |

### 7.6 Module `finance` — Budgets

| Method | Endpoint | Deskripsi |
|---|---|---|
| GET | `/finance/budgets?period=2026-07` | List budget per periode |
| POST | `/finance/budgets` | Set budget kategori |
| PATCH | `/finance/budgets/:id` | Update limit |
| DELETE | `/finance/budgets/:id` | Hapus budget |
| GET | `/finance/budgets/summary?period=2026-07` | Ringkasan realisasi vs limit |

### 7.7 Module `finance` — Reports

| Method | Endpoint | Deskripsi |
|---|---|---|
| GET | `/finance/reports/cashflow?from=&to=` | Total income/expense per periode |
| GET | `/finance/reports/by-category?from=&to=&type=` | Breakdown spending per kategori |
| GET | `/finance/reports/trend?months=6` | Tren bulanan 6 bulan terakhir |
| GET | `/finance/reports/net-worth` | Total saldo semua akun |

### 7.8 Module `habit`

| Method | Endpoint | Deskripsi |
|---|---|---|
| GET | `/habits` | List habit aktif |
| POST | `/habits` | Buat habit baru |
| GET | `/habits/:id` | Detail habit + streak info |
| PATCH | `/habits/:id` | Update habit |
| DELETE | `/habits/:id` | Arsipkan habit |
| POST | `/habits/:id/logs` | Check-in habit (log hari ini) |
| GET | `/habits/:id/logs?from=&to=` | Riwayat log |
| PATCH | `/habits/:id/logs/:logId` | Edit status log (mis. ubah `done`→`skipped`) |
| GET | `/habits/:id/stats` | Consistency rate, current streak, longest streak |
| GET | `/habits/summary?date=2026-07-22` | Ringkasan semua habit untuk 1 tanggal (dashboard harian) |

### 7.9 Module `goal`

| Method | Endpoint | Deskripsi |
|---|---|---|
| GET | `/goals` | List goal |
| POST | `/goals` | Buat goal baru |
| GET | `/goals/:id` | Detail goal + progress + proyeksi |
| PATCH | `/goals/:id` | Update goal |
| DELETE | `/goals/:id` | Hapus/batalkan goal |
| POST | `/goals/:id/contributions` | Tambah kontribusi nabung |
| GET | `/goals/:id/contributions` | Riwayat kontribusi |
| DELETE | `/goals/:id/contributions/:contribId` | Hapus kontribusi (jika salah input) |

### 7.10 Module `notification`

| Method | Endpoint | Deskripsi |
|---|---|---|
| GET | `/notifications?is_read=false` | List notifikasi |
| PATCH | `/notifications/:id/read` | Tandai sudah dibaca |
| PATCH | `/notifications/read-all` | Tandai semua dibaca |
| DELETE | `/notifications/:id` | Hapus notifikasi |

### 7.11 Module `dashboard`

| Method | Endpoint | Deskripsi |
|---|---|---|
| GET | `/dashboard/overview` | Ringkasan: saldo total, income/expense bulan ini, habit streak aktif, goal progress |
| GET | `/dashboard/today` | Fokus hari ini: habit yang perlu di-log, budget warning, transaksi terakhir |

### 7.12 Module `journal` (v2, opsional)

| Method | Endpoint | Deskripsi |
|---|---|---|
| GET | `/journal?from=&to=` | List entri jurnal |
| POST | `/journal` | Buat entri |
| PATCH | `/journal/:id` | Edit entri |
| DELETE | `/journal/:id` | Hapus entri |


---

## 8. Use Case (User Stories) per Modul

Format: `Sebagai [peran], saya ingin [aksi], supaya [tujuan]` + Acceptance Criteria (AC).

### 8.1 Auth
**UC-01** — Sebagai user baru, saya ingin registrasi dengan email & password, supaya punya akun.
- AC: email harus unik & valid; password min 8 karakter; password di-hash dengan argon2; setelah sukses, langsung dapat access+refresh token.

**UC-02** — Sebagai user, saya ingin login, supaya bisa akses data saya.
- AC: salah password → 401; benar → access token (short-lived ~15m) + refresh token (long-lived ~7d, httpOnly cookie atau response body sesuai desain FE).

### 8.2 Finance
**UC-03** — Sebagai user, saya ingin mencatat transaksi pengeluaran, supaya tahu ke mana uang saya pergi.
- AC: amount > 0; account_id & category_id valid & milik user; `current_balance` akun otomatis berkurang; event `transaction.created` di-emit.

**UC-04** — Sebagai user, saya ingin mencatat perpindahan uang dari satu bank/akun ke bank/akun lain (mis. Bank A → Bank B), supaya saldo tercatat pindah dengan benar, bukan hilang atau dobel terhitung sebagai pengeluaran.
- AC:
  - User input `from_account_id`, `to_account_id`, `amount`, opsional `fee_amount` dan `note`.
  - Sistem membuat 2 baris transaksi berpasangan (`transfer_out` di akun asal, `transfer_in` di akun tujuan) yang saling terhubung via `transfer_pair_id`.
  - Saldo akun asal berkurang sebesar `amount + fee_amount`; saldo akun tujuan bertambah sebesar `amount` (fee tidak ikut ditransfer, dianggap hilang/biaya admin bank).
  - Seluruh proses (2 insert + 2 update saldo) dibungkus 1 DB transaction — atomic, tidak boleh ada state setengah jalan.
  - `from_account_id` ≠ `to_account_id`, dan keduanya harus milik user yang login, serta currency sama (v1).
  - Transfer **tidak dihitung** sebagai income atau expense di laporan cashflow (UC-07), supaya tidak menggelembungkan angka pengeluaran/pemasukan — tapi tetap muncul di riwayat sebagai kategori terpisah "Transfer".
  - User bisa menghapus transfer → kedua baris terhapus bersamaan dan saldo kedua akun dikembalikan ke kondisi semula (reverse).

**UC-04a** — Sebagai user, saya ingin melihat riwayat transfer terpisah dari transaksi harian, supaya histori pindah dana antar bank tidak campur dengan histori belanja.
- AC: halaman/endpoint `/finance/transfers` menampilkan daftar transfer dengan info akun asal, akun tujuan, nominal, fee, dan tanggal — tanpa perlu di-filter manual dari list transaksi.

**UC-05** — Sebagai user, saya ingin set budget bulanan per kategori, supaya pengeluaran terkontrol.
- AC: jika total transaksi kategori tsb di periode berjalan melewati `amount_limit`, sistem emit `budget.threshold_exceeded` → notifikasi.

**UC-06** — Sebagai user, saya ingin transaksi berulang (mis. bayar Netflix tiap tanggal 5), supaya tidak input manual tiap bulan.
- AC: scheduler (cron job internal) mengecek `recurring_transactions` yang `next_run_at <= now`, membuat transaksi baru, update `next_run_at` sesuai frequency.

**UC-07** — Sebagai user, saya ingin melihat laporan cashflow & breakdown kategori, supaya paham pola pengeluaran.
- AC: hasil agregasi cepat (< 500ms untuk data setahun di SQLite/dataset personal); grouping per kategori & per bulan.

### 8.3 Habit
**UC-08** — Sebagai user, saya ingin membuat habit dengan target frekuensi, supaya bisa dilacak konsistensinya.
- AC: `frequency_type=custom_days` wajib isi `target_days`; default reminder opsional.

**UC-09** — Sebagai user, saya ingin check-in habit harian, supaya streak terupdate.
- AC: 1 log per habit per tanggal (unique constraint `habit_id+log_date`); jika sudah ada log di tanggal itu → update, bukan duplikat; streak dihitung ulang otomatis (consecutive `done` days).

**UC-10** — Sebagai user, saya ingin melihat statistik consistency rate, supaya termotivasi.
- AC: consistency rate = (jumlah `done` / jumlah hari target dalam periode) × 100%.

### 8.4 Goal
**UC-11** — Sebagai user, saya ingin membuat goal tabungan dengan target & deadline, supaya termotivasi menabung.
- AC: `target_amount` > 0; `deadline` opsional tapi kalau diisi harus di masa depan.

**UC-12** — Sebagai user, saya ingin menambah kontribusi ke goal, supaya progress tercatat.
- AC: `current_amount` bertambah; jika `current_amount >= target_amount` → status berubah `achieved`, emit `goal.achieved`.

### 8.5 Notification & Dashboard
**UC-13** — Sebagai user, saya ingin melihat notifikasi in-app saat budget hampir habis, supaya bisa mengerem pengeluaran.

**UC-14** — Sebagai user, saya ingin dashboard ringkas hari ini (habit yang perlu dicek, saldo, budget warning), supaya cepat tahu kondisi terkini tanpa buka banyak halaman.

---

## 9. Test Case

Menggunakan **Vitest**. Struktur: `*.unit.test.ts` (service/logic murni, mock repository) dan `*.integration.test.ts` (hit endpoint pakai Fastify `inject`, DB SQLite in-memory/file sementara).

### 9.1 Module `user`
| ID | Test | Jenis |
|---|---|---|
| TC-U01 | Register dengan email sudah terdaftar → 409 | integration |
| TC-U02 | Register dengan password < 8 karakter → 400 validation error | integration |
| TC-U03 | Login dengan password salah → 401 | integration |
| TC-U04 | Login sukses → response berisi access_token & refresh_token | integration |
| TC-U05 | Akses `/users/me` tanpa token → 401 | integration |
| TC-U06 | Refresh token expired → 401, minta login ulang | integration |
| TC-U07 | Password di-hash, tidak pernah tersimpan plaintext (assert kolom `password_hash` != raw) | unit |

### 9.2 Module `finance`
| ID | Test | Jenis |
|---|---|---|
| TC-F01 | Buat transaksi expense → saldo akun berkurang sesuai amount | unit (service) |
| TC-F02 | Buat transaksi dengan account_id milik user lain → 403 | integration |
| TC-F03 | Transfer antar akun (Bank A → Bank B) tanpa fee → saldo A berkurang sesuai `amount`, saldo B bertambah sesuai `amount`, 2 baris transaksi (`transfer_out`/`transfer_in`) terbuat dengan `transfer_pair_id` sama | unit + integration |
| TC-F03a | Transfer dengan `fee_amount` → saldo akun asal berkurang `amount + fee_amount`, saldo akun tujuan tetap bertambah sebesar `amount` saja (fee tidak sampai ke tujuan) | unit |
| TC-F03b | Transfer dengan `from_account_id == to_account_id` → 400 `SAME_ACCOUNT_TRANSFER` | integration |
| TC-F03c | Transfer antar akun beda currency (v1 belum didukung) → 400 `CURRENCY_MISMATCH` | integration |
| TC-F03d | Proses transfer gagal di tengah jalan (mis. update saldo akun tujuan error) → seluruh operasi rollback, tidak ada saldo yang berubah & tidak ada baris transaksi tersisa | unit (simulasi error di tengah DB transaction) |
| TC-F03e | `GET /finance/transactions` tanpa `include_transfers=true` → baris `transfer_out`/`transfer_in` tidak ikut muncul | integration |
| TC-F03f | Laporan cashflow (`/finance/reports/cashflow`) tidak menghitung transfer sebagai income maupun expense | integration |
| TC-F03g | Hapus transfer (`DELETE /finance/transfers/:id`) → kedua baris transaksi terhapus, saldo kedua akun kembali seperti sebelum transfer dilakukan (termasuk fee dikembalikan ke akun asal) | unit |
| TC-F04 | Hapus transaksi biasa (income/expense) → saldo akun dikembalikan (reverse) | unit |
| TC-F05 | Filter transaksi by date range & category → hasil sesuai | integration |
| TC-F06 | Buat budget lalu transaksi melebihi limit → event `budget.threshold_exceeded` ter-emit (spy on event bus) | unit |
| TC-F07 | Recurring transaction: cron trigger saat `next_run_at` lewat → transaksi baru terbuat & `next_run_at` terupdate sesuai frequency | unit (mock clock/fake timers) |
| TC-F08 | Import CSV dengan format salah → error jelas, tidak ada partial insert (all-or-nothing) | integration |
| TC-F09 | Report cashflow menghasilkan total income/expense yang benar dari dataset seed | integration |
| TC-F10 | Amount negatif atau 0 pada create transaction → 400 validation error (Zod) | unit |

### 9.3 Module `habit`
| ID | Test | Jenis |
|---|---|---|
| TC-H01 | Check-in habit 2x di tanggal sama → data ter-update, bukan duplikat row | unit |
| TC-H02 | Hitung current streak dengan data log 5 hari berturut lalu 1 hari `missed` → streak reset ke 0 setelah hari missed | unit |
| TC-H03 | Longest streak tetap tersimpan walau current streak sudah reset | unit |
| TC-H04 | Consistency rate dihitung benar untuk `frequency_type=custom_days` (hanya hari target yang dihitung sebagai denominator) | unit |
| TC-H05 | Habit milik user lain tidak bisa diakses/di-log → 403/404 | integration |

### 9.4 Module `goal`
| ID | Test | Jenis |
|---|---|---|
| TC-G01 | Tambah kontribusi → `current_amount` bertambah sesuai | unit |
| TC-G02 | Kontribusi membuat `current_amount >= target_amount` → status jadi `achieved` & event `goal.achieved` ter-emit | unit |
| TC-G03 | Hapus kontribusi → `current_amount` dikurangi kembali (reverse), status kembali `active` jika sebelumnya `achieved` | unit |
| TC-G04 | Proyeksi tanggal tercapai dihitung dari rata-rata kontribusi per bulan (dataset historis) | unit |

### 9.5 Module `notification`
| ID | Test | Jenis |
|---|---|---|
| TC-N01 | Event `budget.threshold_exceeded` menghasilkan row baru di tabel notifications | integration (event listener test) |
| TC-N02 | Tandai notifikasi `is_read=true` tidak bisa dilakukan untuk notifikasi milik user lain | integration |

### 9.6 Module `dashboard`
| ID | Test | Jenis |
|---|---|---|
| TC-D01 | `/dashboard/overview` menghasilkan total saldo = SUM(current_balance) semua akun aktif user | integration |
| TC-D02 | `/dashboard/today` hanya menampilkan habit yang target hari ini (sesuai `target_days`) | unit |

### 9.7 Cross-cutting / Non-functional
| ID | Test | Jenis |
|---|---|---|
| TC-X01 | Semua endpoint protected menolak request tanpa/invalid JWT → 401 | integration |
| TC-X02 | Rate limit terpicu setelah N request dalam window tertentu → 429 | integration |
| TC-X03 | Response error selalu mengikuti envelope standar (`success:false, error:{code,message}`) | integration |
| TC-X04 | Migrasi DB (Drizzle) berjalan tanpa error dari state kosong | integration/CI |


---

## 10. Non-Functional Requirements

- **Security**: password hash argon2id, JWT access token short-lived, refresh token rotation, rate limiting basic (mis. via `@fastify/rate-limit`), input validation ketat via Zod di semua endpoint.
- **Performance**: target response < 300ms untuk operasi CRUD biasa di SQLite lokal.
- **Observability**: logging terstruktur (pino bawaan Fastify), log setiap error dengan request-id.
- **Data integrity**: operasi yang mengubah saldo (transfer, delete transaksi, kontribusi goal) wajib dibungkus DB transaction.
- **Portability**: skema Drizzle ditulis dengan tipe yang kompatibel SQLite & PostgreSQL sejak awal (hindari fitur spesifik SQLite) agar migrasi mulus.

---

## 11. Roadmap Pengerjaan (Solo Developer)

Estimasi total: **~8–10 minggu** kerja part-time (bisa lebih cepat kalau full-time). Prioritas: bangun 1 modul sampai benar-benar jalan end-to-end (BE+FE+test) sebelum lanjut modul berikutnya — hindari godaan bikin semua modul setengah-setengah.

### Fase 0 — Setup Fondasi (3–4 hari)
1. Init monorepo (pnpm workspace): `apps/api`, `apps/web`, `packages/shared-schema`.
2. Setup Fastify + TypeScript + struktur folder `core/` & `modules/`.
3. Setup Drizzle ORM dengan SQLite (file lokal), buat 1 migration awal.
4. Setup error handler global + response envelope + Zod validation plugin di Fastify.
5. Setup Vitest dasar (1 test dummy jalan).
6. Setup Vite + React + Tailwind + TanStack Query + Zustand di `apps/web`, hubungkan ke API dummy (`GET /health`).
7. Setup Docker (Dockerfile single container, multi-stage build FE+BE).

**Deliverable Fase 0**: `GET /api/v1/health` bisa diakses dari FE, ada test yang lulus, bisa `docker build && docker run`.

### Fase 1 — Module `user` (Auth) (4–5 hari)
1. Schema Zod register/login (di `packages/shared-schema`).
2. Tabel `users` + migration.
3. Service: register (hash password), login (verify + issue JWT), refresh, logout.
4. Middleware `authGuard` di `core/auth`.
5. Endpoint `/users/me` (GET, PATCH).
6. Test: TC-U01 s/d TC-U07.
7. FE: halaman Login/Register, simpan token di Zustand + persist (bukan localStorage plaintext untuk refresh token kalau bisa pakai httpOnly cookie — atau minimal in-memory + silent refresh).

**Deliverable Fase 1**: user bisa daftar & login dari FE, token tervalidasi di protected route.

### Fase 2 — Module `finance` (Core Value, 2–2.5 minggu)
Ini modul paling besar, pecah jadi sub-tahap:
1. **Accounts & Categories** (2 hari): CRUD + seed default categories saat register user (listen event `user.registered`).
2. **Transactions** (4–5 hari): create/list/edit/delete + logic update saldo akun (atomic). Test TC-F01–F05, F10.
2a. **Transfers antar akun** (2 hari, langsung setelah Transactions karena share logic saldo): endpoint `/finance/transfers`, logic 2-baris-berpasangan + fee, exclude dari report. Test TC-F03, TC-F03a–g.
3. **Budgets** (2 hari): CRUD + summary realisasi vs limit + event threshold. Test TC-F06.
4. **Recurring Transactions** (2–3 hari): CRUD + scheduler (bisa mulai dengan `setInterval` sederhana / `node-cron`, jalan tiap jam cek `next_run_at`). Test TC-F07.
5. **Reports** (2 hari): cashflow, by-category, trend, net-worth. Test TC-F09.
6. **Import/Export CSV** (2 hari, boleh mundur ke akhir kalau waktu mepet). Test TC-F08.
7. FE: halaman Accounts, Transactions (list+filter+form), **form Transfer terpisah** (pilih akun asal & tujuan lewat dropdown, input fee opsional, preview saldo setelah transfer sebelum submit), Budget, Reports (chart pakai recharts/apex).

**Deliverable Fase 2**: user bisa catat transaksi harian, lihat laporan, dan dapat notifikasi (placeholder dulu) saat budget lewat.

### Fase 3 — Module `habit` (1–1.5 minggu)
1. Tabel `habits`, `habit_logs` + migration.
2. CRUD habit + check-in endpoint.
3. Logic streak & consistency rate (unit test dulu sebelum endpoint — logic ini murni computation, cocok TDD). Test TC-H01–H04.
4. FE: halaman Habit List, Check-in harian (mirip heatmap ala GitHub contribution graph), detail statistik.

**Deliverable Fase 3**: user bisa bikin habit & check-in tiap hari, lihat streak.

### Fase 4 — Module `goal` (4–5 hari)
1. Tabel `goals`, `goal_contributions`.
2. CRUD goal + tambah/hapus kontribusi + logic achieved. Test TC-G01–G04.
3. FE: halaman Goal + progress bar + form kontribusi.

### Fase 5 — Module `notification` + Event Bus penuh (4–5 hari)
1. Implementasi `core/event-bus` type-safe.
2. Sambungkan semua event dari fase sebelumnya (yang tadinya placeholder) ke listener notification.
3. Endpoint notification list/read.
4. FE: bell icon + dropdown notifikasi (polling via TanStack Query tiap X detik, cukup untuk v1 tanpa WebSocket).

### Fase 6 — Module `dashboard` (3–4 hari)
1. Endpoint overview & today (agregasi dari service finance/habit/goal langsung, read-only).
2. FE: halaman Home/Dashboard sebagai landing page setelah login.

### Fase 7 — Hardening & Deploy (4–5 hari)
1. Review semua endpoint: pastikan authorization check konsisten (user hanya akses data miliknya — audit manual + test TC-X01).
2. Tambah rate limiting, helmet/security headers.
3. Migrasi ke PostgreSQL (kalau sudah siap production): ganti connection string Drizzle, jalankan migration, uji ulang test suite (harus tetap hijau karena schema portable).
4. Setup CI sederhana (GitHub Actions: lint + test on push).
5. Dockerfile production build (multi-stage, FE di-build static lalu di-serve Fastify `@fastify/static` atau CDN terpisah).
6. Deploy ke Railway/Render/Fly.io, setup env vars (JWT secret, DB url).

### Fase 8 (Opsional, v2) — `journal`, push notification, Redis cache, dsb.
Baru dikerjakan setelah v1 dipakai sendiri minimal 2–4 minggu dan terasa kebutuhannya nyata — hindari over-engineering di awal.

---

## 12. Prioritas MVP (kalau waktu sangat terbatas)

Kalau harus motong scope, urutan modul yang **wajib ada di MVP pertama**:
1. `user` (auth) — mutlak.
2. `finance`: accounts + categories + transactions saja (budget & recurring bisa v1.1).
3. `habit`: CRUD + check-in + streak dasar.
4. `dashboard`: overview sederhana.

Yang **boleh ditunda**: recurring transactions, import/export CSV, goal module, journal, notification (bisa mulai dari sekadar badge di FE tanpa tabel dulu).

---

## 13. Ringkasan Skema Response Standar (untuk referensi cepat saat implementasi)

```typescript
// Success
type ApiSuccess<T> = {
  success: true;
  data: T;
  meta?: { page?: number; limit?: number; total?: number; totalPages?: number };
};

// Error
type ApiError = {
  success: false;
  error: {
    code: string;        // e.g. "VALIDATION_ERROR", "NOT_FOUND", "UNAUTHORIZED"
    message: string;
    details?: unknown;   // e.g. Zod error issues
  };
};
```

---

**Catatan penutup**: dokumen ini adalah living document — sebaiknya di-review ulang tiap selesai 1 fase roadmap untuk menyesuaikan scope modul berikutnya berdasarkan pengalaman nyata development.