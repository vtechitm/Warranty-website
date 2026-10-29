# Vtech – Nền tảng truy xuất nguồn gốc xuất xứ — Architecture (v3)

Truy xuất nguồn gốc xuất xứ phôi răng sứ chính hãng.

> **v4 — tooth units**: cards (codes) are printed in bulk and handed out without being assigned to a laboratory. Labs buy blanks; Vtech records each sale as tooth units per product (`UnitBalance`, `UnitLedgerEntry`). Any lab authorized for the card's brand may activate an unused card if it still has at least the case's number of teeth for the card's product; the activation consumes them atomically. Revocation refunds, reinstatement re-consumes, unit-count corrections settle the difference.
>
> **v3 business model**: Vtech supplies blanks (phôi) and certifies their **origin**. The **warranty belongs to the laboratory**: the lab enters the installation date and the warranty duration at activation (pre-filled with Vtech's suggested duration for the product). Vtech-defined warranty terms (conditions/exclusions/benefits) no longer apply, and warranty claims are not handled by the platform.

## 1. Business model (confirmed V2 rules)

| Rule | How it is enforced |
| --- | --- |
| One QR = one restoration case; a case may contain many teeth | `WarrantyCode 1—1 RestorationCase 1—n RestorationUnit`, `RestorationCase.warrantyCodeId UNIQUE`, `RestorationUnit (caseId, toothNumber) UNIQUE` |
| Codes & QR URLs exist before any patient data | `WarrantyBatch` → `WarrantyCode` generated up-front; patient rows are created only at activation |
| QR URL never changes | URL = `batch.qrBaseUrl + /w/ + code`; `qrBaseUrl` is frozen on the batch at generation. Activation never touches `code` |
| Only Vtech-issued lab accounts can activate, within the units they bought | `warranty:activate` permission (LAB_ADMIN, LAB_STAFF) + lab authorized for the card's brand + `UnitBalance(lab, card product) >= units` (conditional UPDATE in the activation transaction; `CHECK balance >= 0`). Cards are not assigned to labs (legacy `assignedLaboratoryId` / `WarrantyAssignment` are no longer written) |
| A code cannot be activated twice | Conditional `UPDATE … WHERE activationStatus='NOT_ACTIVATED' AND revokedAt IS NULL` inside a transaction **and** `WarrantyActivation.warrantyCodeId UNIQUE` |
| Product is bound to the code | `WarrantyCode.productId` set at generation; the activation payload has no product field |
| Versioned product information; lab-provided warranty | `WarrantyPolicy (productId, version) UNIQUE` now holds Vtech's *product information*: **suggested** warranty duration + care instructions (UI: "Thông tin phôi"). Activation requires `restoration.warrantyMonths` (1–600) from the lab; the case's `policySnapshot` stores `durationMonths` = lab value, `provider: "LABORATORY"`, `suggestedMonths`, start rule = installation date, and no Vtech terms. Labs (LAB_ADMIN) can correct the duration later via `/warranties/{code}/correct` (audited, end date recomputed) |
| Revoked codes never look valid | `revokedAt` overrides every public state → `REVOKED` warning page |
| Public QR page reveals no personal data | `getPublicPassport()` returns a whitelisted DTO; private data needs patient verification |
| Corrections are audited | `POST /warranties/{code}/correct` writes before/after + reason to `AuditLog` |
| Lab users cannot delete warranty data | No delete endpoints exist for codes, cases or patients |
| Multi-brand, own domains & identity | `Brand` (colors, logo, support info, landing config) + `BrandDomain` (verified hostnames) |
| Mobile-ready backend | All business logic in `src/server/services/*`, exposed via versioned REST `/api/v1`, bearer tokens with refresh rotation, OpenAPI spec |

### Status model

Three independent dimensions on `WarrantyCode` plus a computed validity:

* `assignmentStatus`: `UNASSIGNED | ASSIGNED`
* `activationStatus`: `NOT_ACTIVATED | ACTIVATED`
* `revokedAt` (+ reason, actor)
* Lifecycle shown in admin = derived: `CREATED → ASSIGNED → ACTIVATED`, `REVOKED` overrides.
* Validity (never stored, `services/validity.ts`): `NOT_STARTED | ACTIVE | EXPIRED | SUSPENDED`, computed from the case's `warrantyStartDate`/`warrantyEndDate` (date-only, Vietnam time) and `suspendedAt`. An expired warranty is still an *activated* code.
* Public state: `NOT_ACTIVATED | PENDING_INSTALLATION | ACTIVE | EXPIRED | SUSPENDED | REVOKED`.

Warranty period is `[start, start + durationMonths)`; months are added with end-of-month clamping (31 Jan + 1 m = 28/29 Feb). Certificates show the last covered day.

### Start-date rules

`INSTALLATION_DATE` (default), `ACTIVATION_DATE`, `COMPLETION_DATE`. If the required date is unknown at activation the case is stored as `PENDING_CONFIRMATION` (no invented date) and the lab confirms it later; the end date is computed from the **snapshot** policy, never the current one.

## 2. Layers

```
Browser (admin / lab / public)      Brand websites · widgets      Future mobile apps
        │  cookie session                 │ public API                 │ bearer + refresh
        ▼                                 ▼                            ▼
   Next.js App Router pages  ──►  /api/v1/* route handlers (src/app/api/v1)
        │ (server components read            │  api() wrapper: auth, CSRF, zod, errors, rate limits
        │  through the same services)        ▼
        └──────────────────────────►  Service layer (src/server/services)
                                         warranty-codes · activation · validity · passport
                                         catalog · laboratories · claims · dashboard · exports · audit
                                             │
                                             ▼
                                     Prisma → PostgreSQL
```

* **No business logic in React components.** Pages call services for reads; mutations go through the REST API (the same endpoints apps will use).
* `src/server/auth` — scrypt password hashing, DB-backed sessions, JWT access tokens, RBAC matrix.
* `src/server/pdf` — certificates & label sheets (pdf-lib + Be Vietnam Pro, vector QR codes).
* `src/server/openapi.ts` — OpenAPI 3.1 served at `/api/v1/openapi.json`; a test asserts every documented path has a route.

## 3. Database (Prisma, `prisma/schema.prisma`)

Identity: `User`, `UserBrand` (brand-admin scope), `UserInvitation`, `DeviceSession` (web + mobile, refresh rotation), `NotificationPreference`.
Catalog: `Brand`, `BrandDomain`, `Product`, `WarrantyPolicy` (versioned), `MaterialLot`, `CertificateTemplate`.
Partners: `Laboratory`, `LaboratoryBrand`, `Clinic` (lab-owned or global). Lab users are `User.laboratoryId` (one lab per account).
Codes: `WarrantyBatch`, `WarrantyCode`, `WarrantyAssignment` (history).
Cases: `Patient` (per lab, never auto-merged), `RestorationCase`, `RestorationUnit` (FDI teeth), `WarrantyActivation`.
Patient app: `PatientAccount`, `PatientWarrantyLink` (verified links only), `PatientAccessVerification` (attempt log / lockout), `PatientOtpChallenge` (phone OTP: HMAC of the code, expiry, attempts, single use).
Claims: `WarrantyClaim` (`imageUrls` = private object-storage keys, exposed to clients only as `/api/v1/claims/{id}/images/{name}` URLs), `WarrantyClaimEvent` (full status history).
Audit: `AuditLog` (append-only).

Soft deletion (`deletedAt`) on business entities; audit rows are never deleted.
Key indexes: `WarrantyCode(code) UNIQUE`, `(batchId, serial) UNIQUE`, `(assignedLaboratoryId, activationStatus)`, `(brandId, activationStatus)`, `activatedAt`; `RestorationCase(laboratoryId, createdAt)`, `warrantyEndDate`; `AuditLog(entityType, entityId)`, `(createdAt)`.

### Code format & generation

`{2-letter brand prefix}{8 random digits}` e.g. `OR48291037` (easy to read out and type on a numeric keypad; may be typed with spaces/hyphens, which are stripped). Digits come from `crypto.randomInt`, deliberately **not sequential** so a card cannot be used to guess other valid codes; the print order is the separate per-batch `serial`. 10⁸ codes per brand prefix. Legacy demo codes in the old `ORG26-K8M4P2X9` format are still recognized. Uniqueness is guaranteed by the DB unique index (`createMany … skipDuplicates`, regenerate on collision). Batches ≤ 2,000 are generated inline; larger batches run as a background job (in-process; swap for a queue such as pg-boss/BullMQ if you run several app instances). 10,000 codes take a few seconds.

## 4. Permission matrix

| Capability | SUPER_ADMIN | BRAND_ADMIN | LAB_ADMIN | LAB_STAFF | CLINIC_USER | PATIENT |
| --- | :-: | :-: | :-: | :-: | :-: | :-: |
| Manage brands / domains | ✅ | read own | | | | |
| Manage products & publish policies | ✅ | own brands | | | | |
| Manage laboratories | ✅ | read (own brands) | | | | |
| Manage lab staff | ✅ | | own lab | | | |
| Generate batches / revoke | ✅ | read own brands | | | | |
| Sell / adjust tooth units | ✅ | | | | | |
| See tooth-unit balances & history | all | | own lab | own lab | | |
| Search codes | all | own brands | own lab | own lab | | |
| Activate warranty | | | own lab codes | own lab codes | | |
| View patient identity | ✅ | ✗ | own lab | own lab | ✗ | after verification |
| Search by patient name/phone | ✅ | | ✅ | | | |
| Correct activated record | ✅ | | own lab | | | |
| Suspend warranty | ✅ | | | | | |
| Submit / manage claims | — disabled in v3 (service layer kept, no endpoints) | | | | | |
| Export reports | ✅ | own brands | own lab (warranty list) | | | |
| Audit log / system users | ✅ | | | | | |

`CLINIC_USER` and `PATIENT` are fully modelled and enforced in services/APIs, but Phase 1 has no UI to issue those accounts yet.

Enforcement: `assertCan()` per operation + scope checks inside every service (`requireLab`, `brandScope`, `assertBrandAccess`). Codes that belong to another lab are reported as "not assigned to you" / 404 — never revealing other labs' data.

## 5. Security

* **Auth**: scrypt (N=16384) password hashes; generic login errors; per-IP and per-account rate limits; 5 failures → 15-min lock. Web: opaque httpOnly `SameSite=Lax` session cookie, DB-backed and revocable, sliding expiry. Mobile: 15-min JWT access token bound to a DB session + single-use refresh tokens with **reuse detection** (reuse revokes the session).
* **Invitations**: one-time, 7-day links; plaintext passwords are never emailed or shown.
* **CSRF**: cookie-authenticated mutations must carry an `Origin` matching the host or `TRUSTED_ORIGINS`; bearer clients are exempt.
* **Input**: zod validation for every body/query; Prisma parameterized queries (no string SQL with user input); React output escaping; strict CSP, `X-Frame-Options`, HSTS, `nosniff`.
* **Privacy**: public DTO whitelist; patient phone stored AES-256-GCM encrypted + HMAC for exact-match lookup; patient access code stored as HMAC + encrypted copy (for reprinting by the owning lab). Private-record views by staff are audited.
* **Patient verification**: access code printed on the certificate, the phone registered at activation, or a phone OTP. Max 5 failures / 30 min per code (persisted, shared by all methods), 20 attempts / hour per IP, short-lived (30 min) signed token bound to that one code.
* **Phone OTP** (`services/passport.ts` + `src/server/otp.ts`): the patient must type the registered phone (mismatch = failed attempt, so the QR alone cannot be used to spam the patient). 6-digit code from `crypto.randomInt`, stored only as HMAC, 5-min TTL, 5 tries, single use (conditional update), a new code invalidates older ones; 60 s resend cooldown and 3 sends / 15 min per code (persisted), 10 sends / hour per IP. Providers implement `OtpProvider` (`console` for dev — refused in production; `zalo` ZNS and `sms` brandname are stubs).
* **Uploads** (`src/server/storage.ts`, `services/claim-images.ts`): `ObjectStorage` interface with local-disk and S3-compatible (SigV4 via aws4fetch) drivers. Keys are server-generated (`claims/YYYY/MM/<uuid>.<ext>`, validated against path traversal), images are type-checked by magic bytes (JPEG/PNG/WebP; declared MIME must agree), size/count limited (Content-Length checked before buffering), never publicly addressable, and served with `nosniff` + sandbox CSP only to claim managers, the owning lab or the verified patient. Files are removed again if the claim transaction fails. AV scanning hook point: `validateClaimImages`.
* **Excel/CSV import** (`services/assignment-import.ts`): parse (exceljs / RFC 4180 CSV) → preview (read-only) → confirm re-validates every row and refuses if any is invalid, then calls `assignCodes()` per laboratory (each group atomic; groups are applied sequentially).
* **Enumeration**: 30⁸ code space, format check before DB lookup, 120 lookups/min/IP.
* **Concurrency**: activation = conditional update + unique constraint inside one transaction (tested with parallel requests).
* **Consent**: activation requires confirming the patient was informed (Nghị định 13/2023/NĐ-CP); `consentAt` + `consentVersion` stored.
* **Domains**: Host header is trusted for branding only if it matches a *verified* `BrandDomain` (DNS TXT `_vtech-verify.<host>`). Caddy issues TLS certificates only for configured brand domains (`/api/tls-check`).
* **Backups**: nightly `pg_dump` container; copy off-site.

## 6. Brand website integration

* **Option A – brand subdomain**: add `warranty.brand.vn` as a verified primary `BrandDomain`; point DNS to the VPS; Caddy issues the certificate. New batches print that domain into QR codes. Old domains can be flagged `redirectToPrimary`.
* **Option B – widget**: `<iframe src="https://warranty.vtechdental.vn/embed/lookup?brand=origin" style="width:100%;height:150px;border:0"></iframe>`
* **Option C – direct links**: link to `https://…/w/{code}` or consume `GET /api/v1/passports/{code}` (public JSON) and `GET /api/v1/brand-config?host=…`.

### Brand pages

`Brand.landingConfig` (JSON) holds the public brand page, validated by `landingSchema` (`src/server/landing-schema.ts`: 11 sections, per-field length limits, max items per list, image URLs restricted to uploaded assets or https). Rendered by `components/brand-landing.tsx` on a verified brand domain's `/` and on `/b/{slug}`; stored JSON is parsed leniently so bad content never breaks the page. Editing needs `brand:content` (SUPER_ADMIN, BRAND_ADMIN for own brands; audited). Assets: `POST /brands/{id}/assets` → object storage `brands/{brandId}/{uuid}.{ext}` → public `GET /brand-assets/{brandId}/{name}` (immutable, 1-year cache, `nosniff` + sandbox CSP). Media brief: `docs/BRIEF-MEDIA-TRANG-THUONG-HIEU.md`.

## 7. Phases

**Phase 1 (implemented)**: schema & migrations, auth + RBAC, admin dashboard, brands/domains, products, versioned policies, laboratories + invitations + staff, bulk generation (background for large batches), QR PNG/SVG/ZIP, Excel export, printable label PDFs, assignment (next-N / serial range / list), lab activation with FDI multi-tooth chart, pending-installation workflow, public passport (all states), patient verification, certificate PDFs, corrections/suspension/revocation with audit, claims (submit + status workflow), audit log viewer, REST v1 + OpenAPI, tests, Docker.

**Phase 2 (implemented)**: Excel/CSV import of assignments (preview → confirm, reusing `assignCodes()`), claim photo uploads (object-storage abstraction: local disk / S3-compatible, content-based validation, private serving), phone OTP verification (provider interface, console dev provider, Zalo/SMS stubs, persisted rate limits), Playwright E2E for the main flow.

**Phase 2 (remaining)**: real Zalo ZNS / SMS provider implementations, AV scanning of uploads, material-lot traceability reports, richer analytics & date-range exports, certificate template editor (`CertificateTemplate`), adding photos to an existing claim (e.g. when ADDITIONAL_INFO_REQUIRED).

**Phase 3 / 4 (prepared)**: patient self-registration & account linking UI (`PatientAccount`, `PatientWarrantyLink`, `/patients/me/*` endpoints exist), push/Zalo notifications (`NotificationPreference`), Vtech Member / CRM webhooks, NFC cards (an NFC tag simply encodes the same permanent URL), manufacturer traceability via `MaterialLot`.
