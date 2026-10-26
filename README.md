# Vtech Dental Warranty Platform

**Hệ thống bảo hành răng sứ điện tử · Digital Dental Passport**

Multi-brand warranty platform for Vtech Dental Supply, dental laboratories, clinics and patients (Origin, Origin Beyond Plus, Elite Zirconia, Overneer, …).

Vtech generates warranty codes + QR cards in advance → labs scan and activate them with patient / clinic / tooth data → patients scan the same QR and see a premium digital certificate. The QR never changes.

| Area | URL | Users |
| --- | --- | --- |
| Super Admin portal | `/admin` | SUPER_ADMIN, BRAND_ADMIN |
| Laboratory portal (mobile-first) | `/lab` | LAB_ADMIN, LAB_STAFF |
| Public passport (QR landing) | `/w/{code}` | anyone; private section after patient verification |
| Lookup widget for brand sites | `/embed/lookup?brand=origin` | iframe |
| REST API v1 + OpenAPI | `/api/v1/*`, `/api/v1/openapi.json` | web, brand sites, future apps |

Architecture, data model, permission matrix and security design: **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

## Stack

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · PostgreSQL 16 · Prisma 6 · zod · jose · pdf-lib (+ Be Vietnam Pro font, full Vietnamese Unicode) · qrcode · exceljs · jszip · html5-qrcode · aws4fetch (S3-compatible storage) · Vitest · Playwright. Auth is implemented in-house (scrypt + DB sessions for web, JWT + rotating refresh tokens for mobile) so the same API serves browsers and native apps.

## Local development

Requirements: Node 22+ (tested on 24), Docker.

```bash
cp .env.example .env              # adjust if needed
docker compose -f docker-compose.dev.yml up -d   # Postgres on localhost:55450
npm install
npx prisma migrate deploy         # or: npm run db:migrate (creates new migrations)
npm run db:seed                   # demo brands, labs, batches & sample warranties
npm run dev                       # http://localhost:3000
```

If port 3000 is taken: `npx next dev -p 3100`, and set `APP_URL` accordingly **before** generating batches (the QR base URL is frozen per batch).

Seed accounts (passwords come from `SEED_ADMIN_PASSWORD` / `SEED_LAB_PASSWORD` in `.env`):

| Email | Role |
| --- | --- |
| `admin@vtech.local` | Super admin |
| `lab-a@vtech.local` | Lab admin — Labo Răng Sứ Sài Gòn (Origin, Elite) |
| `staff-a@vtech.local` | Lab staff — same lab |
| `lab-b@vtech.local` | Lab admin — Labo Hà Nội Dental (Origin, Overneer) |

The seed prints sample QR URLs for every state (active, pending installation, expired, revoked, not activated) and the patient access code of the active one.

### Main flow to try

1. `/admin/batches` → **Sinh lô mã mới** (e.g. 10,000 codes; > 2,000 run in background).
2. Batch page → **Cấp mã cho labo** (next N / serial range / list), **In nhãn QR (PDF)**, ZIP PNG/SVG, Excel with QR pictures, and **Tải gói dữ liệu in** — a ZIP for the card printer: Excel with one QR picture per code, `du-lieu-in.csv` for data merge (InDesign / CorelDRAW / BarTender; `@anh_qr` = image path), QR PNG + SVG files and printing instructions (`HUONG-DAN-NHA-IN.txt`).
3. Log in as a lab → **QUÉT QR – KÍCH HOẠT BẢO HÀNH** (camera needs HTTPS or localhost) or **NHẬP MÃ BẢO HÀNH**.
4. Fill patient, clinic (searchable), FDI tooth chart, dates → **KÍCH HOẠT**. The success screen shows the QR, PDF certificate and the patient access code.
5. Open `/w/{code}` on a phone → certificate; **Xác thực để xem hồ sơ** with the access code, the phone number, or a **Mã OTP** sent to that phone (dev: the code is printed in the server log) → private details, PDF, claim form with photos.

### Phase 2 features

* **Code format** — 2-letter brand prefix + 8 random digits, e.g. `OR48291037` (easy to read out and type; spaces/hyphens are ignored when typed). Digits are random, not sequential, so one card cannot be used to guess others; the print order is the separate `serial`. Uniqueness is enforced by the database. Old demo codes (`ORG26-K8M4P2X9`) still work.

* **Excel / CSV import of assignments** — `/admin/batches` → **Nhập cấp mã (Excel/CSV)**. Upload a sheet with columns *Mã bảo hành* + *Mã labo* (or `code`,`lab`; no header = column A/B). Every row is validated (format, existence, duplicates, activated/revoked, lab exists/active/authorized for the brand, re-assignment warning) in a preview that writes nothing; **Xác nhận** re-validates and assigns each lab's group through the same `assignCodes()` as manual assignment (history + audit). Max 10,000 rows / 5 MB.
* **Claim photos** — patients (and labs via API) attach up to `CLAIM_IMAGE_MAX_COUNT` JPEG/PNG/WebP photos (≤ `CLAIM_IMAGE_MAX_MB` each, type checked from file content). Stored privately (`STORAGE_DRIVER=local` → `STORAGE_LOCAL_DIR`, or `s3` → any S3-compatible bucket) and shown as thumbnails in `/admin/claims`.
* **Phone OTP verification** — `OTP_PROVIDER=console` (dev, logs the code), `zalo` / `sms` (stubs to finish in `src/server/otp.ts`), `disabled`. The patient types the registered phone, receives a 6-digit code (5 min, single use, 5 tries), then verifies.

## Tests

Tests run against a **separate** database (`TEST_DATABASE_URL`, wiped on every run):

```bash
npm test          # vitest: migrations are applied automatically
npm run typecheck
```

Covered (39 tests): Phase 2 — CSV/XLSX import preview & confirm (all error cases, nothing written until valid), claim-photo validation by content, multipart upload + access control on image download, cleanup on failure, S3 request signing, phone OTP (registered phone only, hashed, single use, cooldown, send cap, shared lockout, unavailable when disabled). Phase 1 — 1,000-code generation & uniqueness, stable URLs, unactivated public state, assignment, activation, cross-lab rejection, expiration calculation, duplicate & **concurrent** activation, expired / revoked display, privacy of public data & patient verification (incl. lockout), brand-admin data minimization, PDF content (text extracted from the generated PDF), policy-version retention, claim workflow, login / lockout / refresh-token reuse detection, CSRF origin check, OpenAPI ↔ routes consistency, date math.

`scripts/render-samples.ts` renders a certificate and label sheets for visual review.

### End-to-end (Playwright)

```bash
npx playwright install chromium   # once
npm run test:e2e
```

Uses its own database (`E2E_DATABASE_URL`, default `warranty_e2e` next to the test DB — emptied and re-seeded with the demo seed on every run) and starts its own dev server on port `E2E_PORT` (default 3200, build dir `.next-e2e`), so it can run while a normal dev server is up. The spec (`e2e/main-flow.spec.ts`) covers: admin logs in → generates a 5-code batch → assigns it to Labo Răng Sứ Sài Gòn → lab logs in → enters a code manually → fills patient / clinic / FDI teeth / dates / consent → **KÍCH HOẠT** → anonymous patient opens `/w/{code}`, sees the ACTIVE certificate without personal data, verifies with the access code from the success screen and sees the private record.

## API

* Base: `/api/v1`, JSON. Success `{ "data": … }`, error `{ "error": { "code", "reason?", "message", "details?" } }`, header `API-Version: 1`.
* Web: `POST /api/v1/auth/login` sets an httpOnly cookie. Mobile: `{"client":"mobile"}` returns `accessToken` (15 min) + `refreshToken` (single use, rotate via `POST /api/v1/auth/refresh`).
* Spec: `GET /api/v1/openapi.json` (import into Swagger UI / Postman / codegen for React Native or Flutter).

## Production deployment (single VPS)

```bash
# on the server (Ubuntu + Docker Engine + compose plugin)
git clone <repo> vtech-warranty && cd vtech-warranty
cp .env.production.example .env.production
#   fill: domains, POSTGRES_PASSWORD, AUTH_SECRET, HASH_PEPPER, DATA_ENCRYPTION_KEY
docker compose --env-file .env.production up -d --build
```

* `app` runs `prisma migrate deploy` on start, then the Next.js standalone server (non-root, healthcheck `/api/health`).
* `caddy` terminates HTTPS with automatic Let's Encrypt certificates for `PRIMARY_DOMAIN`, and on-demand certificates for configured brand domains only.
* `db` is not exposed publicly. `backup` writes a nightly `pg_dump` to `./backups` (keep `BACKUP_KEEP_DAYS`) — sync that folder off-site.
* Claim photos: with `STORAGE_DRIVER=local` they live in the `uploads` Docker volume (back it up too); for anything beyond one server use `STORAGE_DRIVER=s3` with a private bucket (Cloudflare R2, AWS S3, MinIO…). Objects are never public — the app streams them after an access check.
* Phone OTP is `disabled` by default in production (the console provider is refused there); set `OTP_PROVIDER=zalo|sms` once that provider is implemented.
* Never run the demo seed in production (it refuses unless `--force`).

First super admin on a fresh production database:

```bash
docker compose --env-file .env.production run --rm \
  -e ADMIN_EMAIL=you@vtechdental.vn -e ADMIN_NAME="Vtech Admin" \
  app node scripts/create-admin.mjs
```

It prints a one-time invitation link (`/invite/…`) to set the password.

Brand domains: add the hostname under **Thương hiệu → Tên miền**, create the DNS `A` record to the VPS and the TXT record `_vtech-verify.<host>` shown in the UI, then click **Xác minh**. Mark it primary so new batches print that domain.

**Important**: `DATA_ENCRYPTION_KEY` encrypts patient phone numbers and access codes. Back it up in a password manager; losing or changing it makes that data unreadable.

## Project layout

```
prisma/              schema, migrations, seed
src/server/          auth, services (business logic), pdf, http wrapper, validation, openapi
src/app/api/v1/      REST endpoints (thin wrappers over services)
src/app/admin|lab|w/ UIs
src/components/      UI primitives, tooth chart, shared views
tests/               vitest integration tests
e2e/                 Playwright end-to-end tests (npm run test:e2e)
docker/              entrypoint, Caddyfile, backup script
```

## Compliance notes (Vietnam)

The platform is designed for review under Nghị định 13/2023/NĐ-CP on personal data protection: data minimization on public pages, explicit consent confirmation at activation (`consentAt`, `consentVersion`), encryption of contact data at rest, access logging, role-based access and backups. A legal review of the consent text and data-retention policy is still required before go-live; warranty durations in the seed are sample values, not commercial commitments.
