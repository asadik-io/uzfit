# UzFit

UzFit is a multi-venue fitness membership web app for Tashkent, Uzbekistan: members buy a
fixed-term plan, book sessions at partner gyms and studios, and check in with a short-lived QR
code that venue staff scan. It is a mobile-first, installable web app (PWA) in Uzbek (default),
Russian, and English.

> **Status: MVP, not production-ready.** The complete member → partner reservation and check-in
> journey works against Supabase and is covered by database and end-to-end tests. Online payment
> uses a clearly labeled **demo adapter** (no money is collected); a real provider such as Payme
> or Click still needs merchant onboarding, credentials, and an adapter written from the
> provider's official documentation. Production email delivery, hosting, backups, and monitoring
> must be provisioned before launch. See [Implementation status](#implementation-status) and the
> [launch checklist](#launch-checklist).

All venues, organizations, people, and prices in this repository are fictional development data.
The sample plan prices are not commercial offers, and UzFit claims no real partnerships.

---

## Contents

- [Implementation status](#implementation-status)
- [Tech stack](#tech-stack)
- [Local setup](#local-setup)
- [Demo accounts](#demo-accounts)
- [Commands](#commands)
- [Testing](#testing)
- [Environment variables](#environment-variables)
- [Architecture](#architecture)
- [Business rules](#business-rules)
- [Security](#security)
- [Payments](#payments)
- [Deployment](#deployment)
- [Operations: jobs, monitoring, backups, rollback](#operations-jobs-monitoring-backups-rollback)
- [Launch checklist](#launch-checklist)
- [Deferred features](#deferred-features)

---

## Implementation status

| Area                                                                                                                                                                                  | Status                         | Notes                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Discovery: landing, explore (search, city/district/category/date/plan filters, pagination, opt-in “Near me”), venue details, session selector, plans, favorites                       | ✅ Works                       | Filters live in the URL. A full map view is not built; venues link to OpenStreetMap and can be sorted by distance.                                                                           |
| Email authentication: sign-up with verification, sign-in, password reset, sign-out, session refresh                                                                                   | ✅ Works                       | Supabase Auth with UzFit email templates (uz/ru/en). Locally, emails go to Mailpit. **Production needs an SMTP provider.**                                                                   |
| Profile: name, E.164 phone normalization, language                                                                                                                                    | ✅ Works                       | Phone is contact data only, not verified. Phone OTP is deferred.                                                                                                                             |
| Memberships: versioned immutable plans, fixed term (no auto-renewal), usage (used / reserved / available), history                                                                    | ✅ Works                       |                                                                                                                                                                                              |
| Booking, cancellation (timely/late with confirmation), daily/total/future limits, capacity, conflicts, idempotency                                                                    | ✅ Works                       | Enforced in Postgres functions under row locks; concurrency covered by tests.                                                                                                                |
| QR check-in (member code, staff scanner with camera + paste fallback)                                                                                                                 | ✅ Works                       | 60-second random tokens, only hashes stored, single use, venue-scoped.                                                                                                                       |
| No-show reconciliation, abandoned checkout expiry, cleanup                                                                                                                            | ✅ Works                       | `/api/jobs/reconcile`, scheduled daily by `vercel.json`.                                                                                                                                     |
| Partner dashboard: today's summary, schedule, sessions, rosters, cancellation with reason, activities, venue drafts with photos, approval workflow, attendance CSV                    | ✅ Works                       | Receptionists see the scanner, overview, and schedule only.                                                                                                                                  |
| Admin dashboard: approvals, venue status, partner organizations and staff, plan versions, users (grant/revoke/suspend/anonymize/corrections), payments and refunds, totals, audit log | ✅ Works                       | TOTP second factor required when `admin_mfa_required` is on (default in production).                                                                                                         |
| Checkout and payment processing                                                                                                                                                       | 🟡 **Demo adapter only**       | Signed demo events go through the same verification and processing path a provider callback would. Disabled in production by code and by database setting.                                   |
| Payme / Click (or another local provider)                                                                                                                                             | ⛔ **Requires merchant setup** | Adapter interface is ready (`src/lib/payments/types.ts`); placeholders refuse all callbacks. Needs merchant onboarding, sandbox, credentials, and official API documentation.                |
| Refunds                                                                                                                                                                               | 🟡 Manual recording            | Admins record refunds confirmed by the provider or a documented manual process. Provider-confirmed refund callbacks are handled once an adapter supports them. Partial refunds are deferred. |
| In-app notifications                                                                                                                                                                  | ✅ Works                       | Email reminders, SMS, and push are deferred.                                                                                                                                                 |
| PWA: manifest, original icons, installability, offline fallback                                                                                                                       | ✅ Works                       | The service worker never caches authenticated HTML, QR codes, payments, or API data.                                                                                                         |
| Production deployment (Vercel + Supabase)                                                                                                                                             | ⛔ **Not performed**           | Requires the operator's Vercel and Supabase projects, domain, SMTP, and secrets. Steps below.                                                                                                |
| Monitoring and alerting                                                                                                                                                               | 🟡 Partial                     | Structured JSON logs with request IDs; an alerting tool still has to be chosen and configured.                                                                                               |

---

## Tech stack

- **Next.js 16** (App Router, Server Components, Server Actions, `proxy.ts`), **React 19**, **TypeScript** (strict)
- **Tailwind CSS 4**, Radix UI primitives, Lucide icons, Sonner toasts
- **React Hook Form + Zod** on the client; every Server Action re-validates with Zod, and the
  database validates again
- **Supabase**: Auth (cookie sessions via `@supabase/ssr`, verified with `getClaims()`), Postgres
  (RLS, security-definer functions), Storage
- **next-intl** for `uz` / `ru` / `en` routing and messages
- **Vitest** (unit and database integration tests), **Playwright** (end-to-end)
- **pnpm** with a committed lockfile; hosting target **Vercel**

## Local setup

Prerequisites: Node.js ≥ 22.12, pnpm 10 (`corepack enable`), and Docker (for the Supabase CLI's
local stack).

```bash
pnpm install
pnpm db:start                      # starts local Supabase (Postgres, Auth, Storage, Mailpit)
cp .env.example .env.local         # then fill in the values printed by `pnpm exec supabase status`
pnpm db:reset                      # applies all migrations and loads supabase/seed.sql
DEMO_PASSWORD='choose-one-123' pnpm setup:demo   # demo accounts, memberships, bookings, photos
pnpm dev                           # http://localhost:3000
```

For `.env.local`, take `API_URL`, `PUBLISHABLE_KEY`, and `SECRET_KEY` from
`pnpm exec supabase status` and set `PAYMENT_WEBHOOK_SECRET` and `CRON_SECRET` to long random
strings (for example `openssl rand -hex 32`). Emails sent locally (verification, password reset)
appear in Mailpit at <http://127.0.0.1:54324>.

`pnpm setup:demo` refuses production environments and non-local Supabase URLs (unless
`ALLOW_DEMO_SETUP=true` for a disposable staging project). If `DEMO_PASSWORD` is not set, a random
password is generated; credentials are written to the git-ignored `.demo-credentials.local.json`.

## Demo accounts

Created by `pnpm setup:demo` (all `@uzfit.test`, password from `DEMO_PASSWORD`):

| Email                                        | Role and data                                                                            |
| -------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `admin@uzfit.test`                           | Platform admin                                                                           |
| `partner.a.manager@uzfit.test`               | Manager, _Demo Sport Group_ (Olmos Fitness ×2, Temir Gym, Zarb Boxing Club, draft venue) |
| `partner.a.reception@uzfit.test`             | Receptionist, _Demo Sport Group_                                                         |
| `partner.b.manager@uzfit.test`               | Manager, _Demo Wellness Studios_ (isolation tests)                                       |
| `partner.c.manager@uzfit.test`               | Manager, _Demo Aqua Club_                                                                |
| `member@uzfit.test`                          | Active membership with upcoming and past bookings (checked in, no-show)                  |
| `member.new@uzfit.test`                      | No membership — use it to try the demo checkout                                          |
| `member.expired@uzfit.test`                  | Expired membership                                                                       |
| `member.revoked@uzfit.test`                  | Revoked membership                                                                       |
| `filler.1@uzfit.test`, `filler.2@uzfit.test` | Fill a session to capacity (shows a full session)                                        |

The seed contains 8 published venues across Tashkent districts plus one draft, 6 categories,
3 published plan versions (plus a retired one), and sessions from 3 days ago to 13 days ahead.
Demo photos are original generated artwork, labeled “Demo”.

## Commands

| Command                                              | Purpose                                                                                        |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `pnpm dev` / `pnpm build` / `pnpm start`             | Develop, build for production, serve the build                                                 |
| `pnpm lint` / `pnpm typecheck` / `pnpm format:check` | ESLint, `next typegen` + `tsc`, Prettier                                                       |
| `pnpm test`                                          | Unit tests (Vitest)                                                                            |
| `pnpm test:db`                                       | Database integration tests against the local stack (RLS, concurrency, rules, payments, QR)     |
| `pnpm test:e2e`                                      | Playwright journeys (needs the local stack, `pnpm setup:demo`, and a running or buildable app) |
| `pnpm db:start` / `pnpm db:stop` / `pnpm db:reset`   | Local Supabase lifecycle; reset re-applies migrations and seed                                 |
| `pnpm db:types`                                      | Regenerates `src/lib/supabase/database.types.ts` from the local schema                         |
| `pnpm setup:demo`                                    | Creates demo accounts and data (never in production)                                           |
| `pnpm assets:generate`                               | Regenerates the icon set from the UzFit mark                                                   |

## Testing

- **Unit** (`tests/unit`): domain error mapping, dictionary parity and ICU formatting for all three
  languages, money and Tashkent time handling, phone normalization, redirect safety, CSV
  escaping, QR token parsing, image signature checks, demo payment signatures (tampering, replay,
  production refusal), CSP, venue content validation.
- **Database** (`tests/db`): RLS isolation between members and between partners, 20 simultaneous
  requests for one remaining place, simultaneous requests by one member against daily/total/future
  limits, idempotency keys, timely/late/venue/no-show transitions and their allowance and capacity
  effects, Tashkent midnight and exact deadline boundaries, capacity and session-time protection,
  QR expiry/replay/wrong venue/unauthenticated redemption, payment authentication, amount and
  currency checks, duplicate and out-of-order events, concurrent paid orders.
- **End-to-end** (`tests/e2e`): sign-up with email verification, session resume, sign-out and
  sign-in, password reset; the main journey (demo checkout → book → cancel → book again → QR →
  reception check-in → usage); draft venues hidden in UI and API; role gates; direct API attempts
  to change roles or entitlement; partner isolation; no horizontal overflow at 360 px for public,
  member, partner, and admin pages; keyboard access; manifest, service worker, offline page,
  security headers, and job authentication.

Run everything locally with the stack up and demo data created:

```bash
pnpm test && pnpm test:db
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/chromium pnpm test:e2e   # or `pnpm exec playwright install chromium`
```

The CI workflow (`.github/workflows/ci.yml`) runs formatting, lint, typecheck, unit tests, and a
production build on every push and pull request, then starts local Supabase and runs the database
and Playwright suites.

## Environment variables

| Variable                                                                            | Where            | Purpose                                                                                                                       |
| ----------------------------------------------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_APP_URL`                                                               | all              | Public origin (email links, redirects)                                                                                        |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`                  | all              | Supabase project URL and publishable key (safe for browsers; RLS applies)                                                     |
| `SUPABASE_SECRET_KEY`                                                               | server only      | Privileged key for verified payment processing, jobs, persistent rate limits, Auth admin calls. Never exposed to the browser. |
| `PAYMENT_PROVIDER`                                                                  | server           | `demo`, `payme`, `click`, or `none`. Only `demo` has an adapter today, and it is refused in production.                       |
| `PAYMENT_MERCHANT_ID`, `PAYMENT_API_SECRET`                                         | server           | Reserved for a real provider adapter (illustrative names; adapt to the provider).                                             |
| `PAYMENT_WEBHOOK_SECRET`                                                            | server           | Demo adapter signing key; a real adapter uses the provider's own authentication.                                              |
| `CRON_SECRET`                                                                       | server           | Bearer secret for `/api/jobs/reconcile` (Vercel Cron sends it automatically).                                                 |
| `APP_ENV`                                                                           | server, optional | `production` marks a non-Vercel host as production. Vercel's `VERCEL_ENV` is used automatically.                              |
| `NEXT_PUBLIC_SUPPORT_EMAIL`                                                         | optional         | Support address shown on the profile page.                                                                                    |
| `DEMO_PASSWORD`, `ALLOW_DEMO_SETUP`                                                 | local scripts    | Demo account setup (see above).                                                                                               |
| `E2E_BASE_URL`, `E2E_DATABASE_URL`, `MAILPIT_URL`, `PLAYWRIGHT_CHROMIUM_EXECUTABLE` | tests            | Playwright settings; defaults target the local stack.                                                                         |

Operator settings that are not environment variables live in the database table
`private.settings` (service role only):

| Key                     | Default when absent | Meaning                                                                                              |
| ----------------------- | ------------------- | ---------------------------------------------------------------------------------------------------- |
| `demo_payments_enabled` | `false`             | Allows demo orders and demo payment events. `seed.sql` sets it to `true` for local development only. |
| `admin_mfa_required`    | `true`              | Admin functions require an `aal2` session (TOTP). `seed.sql` sets it to `false` locally.             |
| `allow_fake_clock`      | `false`             | Lets the database tests move the database clock. Never enable outside tests.                         |

## Architecture

```
src/app/[locale]/…          pages (uz | ru | en), locale-prefixed
src/app/auth/callback       email link verification with safe internal redirects
src/app/api/payments/[provider]/webhook   provider notifications
src/app/api/jobs/reconcile  protected maintenance job
src/app/api/partner/attendance            attendance CSV
src/proxy.ts                request ID, CSP nonce, session refresh, sign-in redirects, locale routing
src/features/*              feature modules (queries, Server Actions, components)
src/lib/supabase            server / browser / admin clients, generated types
src/lib/payments            adapter interface, demo adapter, processing service
src/lib/i18n, src/messages  routing and dictionaries
supabase/migrations         schema, triggers, RLS, grants, functions, storage policies
supabase/seed.sql           fictional development data
tests/unit, tests/db, tests/e2e
```

- **Identity** comes from `supabase.auth.getClaims()` (verified JWT). Pages and Server Actions
  check it; database functions derive the user from `auth.uid()` and never trust a submitted id.
- **Business rules live in Postgres functions** (`create_booking`, `cancel_booking`,
  `cancel_session`, `issue_checkin_token`, `redeem_checkin_token`, `apply_payment_event`,
  `admin_*`, `partner_*`). Each is `security definer` with `search_path = ''`, fully qualified
  names, explicit `revoke`/`grant`, an authorization check inside, and an audit entry in the same
  transaction. Domain errors are raised as stable codes (for example `SESSION_FULL`,
  `DAILY_LIMIT_REACHED`, `OUTSIDE_CHECKIN_WINDOW`) and translated in the UI.
- **Lock order** for every operation that touches allowance or capacity: member coordination row
  (`account_statuses`) → session(s) in id order → booking → token. Bulk venue cancellations lock
  all affected members first and retry if the member set changed.
- **Occupancy** is maintained by a trigger with a `occupied_count <= capacity` constraint; a partial
  unique index prevents two live reservations of one session by one member; an exclusion
  constraint prevents overlapping active memberships.
- **Time**: instants are stored in UTC; each venue stores its IANA timezone (`Asia/Tashkent`), and
  local dates, deadlines, and check-in windows are derived with it and snapshotted on the booking.
- **Money** is stored in integer minor units (tiyin) with an explicit `UZS` currency.
- **Localization**: all UI text is in `src/messages/{uz,ru,en}.json`; database content is localized
  JSON with a fallback to Uzbek.

## Business rules

Defaults are stored per plan version and enforced by the database:

- A membership is valid for the half-open interval `[starts_at, ends_at)`; a session is bookable only
  if it fits entirely inside it. Duration is 30 × 24 h from activation; the exact expiry is shown.
  One current membership per member; no automatic renewal.
- Booking reserves a visit; check-in consumes it; a timely cancellation (≥ 2 h before start,
  database time) releases it; a late cancellation or no-show consumes it; a venue cancellation
  always releases it. `available = allowance − consumed − reserved`.
- One visit per local day (Asia/Tashkent), up to 3 future reservations, booking up to 7 days ahead,
  booking closes at session start, no overlapping sessions, capacity enforced atomically.
- Check-in opens 15 minutes before start and closes at `min(start + 30 min, end)`. Remaining
  confirmed reservations become no-shows after the session ends (reconciliation job).
- Partners cannot silently change booked session times or reduce capacity below occupied places.

## Security

- Row Level Security on every exposed table with least-privilege grants; check-in tokens have no
  policies at all (functions only). Private reads are owner-scoped; staff see only a minimal
  roster projection (display name, reservation, check-in state).
- The privileged key is used only in trusted server paths (verified payment events, jobs, rate
  limits, Auth admin calls) and never in client bundles.
- Persistent rate limits in Postgres for sign-in, sign-up, password reset, checkout, token issuance,
  token redemption, and TOTP verification.
- Server Actions are protected against cross-site requests by Next.js origin checks; webhooks use
  the provider's authentication; the job endpoint uses a bearer secret compared in constant time.
- Redirects are restricted to internal locale paths on the app's own origin.
- Per-request CSP with nonces and `strict-dynamic`, `frame-ancestors 'none'`, HSTS, `nosniff`,
  strict referrer policy, COOP, and a restrictive Permissions-Policy (camera for the scanner only).
- Venue photos: JPEG/PNG/WebP only (checked by file signature), ≤ 4 MB, stored under
  `venues/<venue_id>/` by managers of that venue; SVG/HTML are rejected.
- Admin tools require a TOTP second factor when `admin_mfa_required` is on; every privileged change
  is audited with actor, reason, and request ID.
- No medical data, card details, or identity documents are collected.

## Payments

`src/lib/payments/types.ts` defines the adapter contract: create a checkout for an immutable
pending order, authenticate and normalize callbacks, query transaction status for reconciliation,
and declare refund capabilities. `apply_payment_event` then records each event once, checks the
transaction, amount, and currency against the order snapshot, only moves payment state forward,
activates at most one membership under the member lock, and flags extra payments for
reconciliation instead of discarding them. The return page only displays server state.

The **demo adapter** simulates a provider page and delivers HMAC-signed events through the same
verification path. It is refused when `VERCEL_ENV`/`APP_ENV` is `production` and when the database
setting `demo_payments_enabled` is off. With no real provider configured, production checkout
states that payment is unavailable.

To add a real provider (for example Payme or Click):

1. Complete merchant onboarding and obtain sandbox credentials and the official API documentation.
2. Implement `PaymentAdapter` in `src/lib/payments/<provider>.ts` from that documentation (checkout
   creation, callback authentication, status queries, amount conversion at the boundary), and add
   provider-specific acknowledgements to the webhook route if the protocol requires them.
3. Register it in `src/lib/payments/index.ts`, add its checkout origin to the CSP `form-action` if it
   uses a form redirect, and add adapter tests (signatures, amounts, duplicates, out-of-order).
4. Test in the provider sandbox against a staging project, then set `PAYMENT_PROVIDER` in production.

This repository does not assert any provider's API contract or signature algorithm.

## Deployment

The app has not been deployed by this project. Recommended setup with Vercel and Supabase:

1. **Supabase projects**: create separate staging and production projects. Choose a region after
   checking current availability and latency from Uzbekistan, and a compatible Vercel function
   region.
2. **Schema**: `pnpm exec supabase link --project-ref <ref>` then `pnpm exec supabase db push`.
   This applies migrations only. **Never run `supabase/seed.sql` or `pnpm setup:demo` in
   production** — the seed enables demo payments and contains fictional data.
3. **Auth settings** (dashboard or `supabase config push` after reviewing `supabase/config.toml`):
   site URL and redirect URLs for your domains (`https://<domain>/**`), email confirmation on,
   password policy (≥ 8 characters with letters and digits), TOTP MFA enabled, the three email
   templates from `supabase/templates/` with their subjects, and a production **SMTP provider**
   (the built-in mailer is not for production).
4. **Vercel**: import the repository (framework: Next.js, package manager: pnpm). Set environment
   variables separately for Preview and Production. Preview deployments must use the staging
   project and demo or sandbox payments only; production uses `PAYMENT_PROVIDER=none` until a real
   adapter exists.
5. **Cron**: `vercel.json` runs `/api/jobs/reconcile` daily (the cadence available on every plan).
   On plans that allow it, a more frequent schedule shortens no-show and checkout reconciliation
   lag; check the current cron limits of your Vercel plan. Set `CRON_SECRET` in Vercel.
6. **First admin**: sign up normally, then in the SQL editor run
   `insert into public.platform_roles (user_id, role) values ('<user uuid>', 'admin');` and enroll
   TOTP at `/uz/admin/mfa`. Create partner organizations and assign staff in the admin dashboard.
7. **Domain and headers**: serve over HTTPS only (HSTS is sent); update `NEXT_PUBLIC_APP_URL`.

## Operations: jobs, monitoring, backups, rollback

- **Jobs**: `/api/jobs/reconcile` is idempotent and bounded: no-show finalization in batches,
  provider status checks for older pending orders, expiry of abandoned checkouts, cleanup of old
  rate-limit windows and unused tokens, and an occupancy drift check. Missed runs are safe:
  entitlement and booking rules are enforced from timestamps on every request.
- **Monitoring**: server logs are structured JSON with request IDs (also forwarded to the database
  and stored in audit entries). Alert on `booking.create_failed`, `payment.callback_rejected`,
  `payment.apply_failed`, `jobs.*` errors, `jobs.occupancy_drift`, and `rate_limit.failed`, and watch
  database errors and reconciliation lag in the Supabase dashboard.
- **Backups**: use the backup and point-in-time recovery options of the purchased Supabase plan,
  back up Storage objects separately, and **test a restore into a staging project before launch**.
- **Rollback**: revert application releases with Vercel's instant rollback / redeploy of a previous
  deployment. Database changes are forward-only: fix problems with a new corrective migration;
  never drop or rewrite production data automatically.
- **Costs and compliance**: do not assume free-tier quotas. Estimate hosting, database, storage,
  email, payment fees, and monitoring for the expected number of users, and confirm privacy terms
  and any local data-hosting requirements with qualified advisers before collecting production
  customer data.

## Launch checklist

- [ ] Real payment adapter implemented from official documentation and tested in the sandbox
- [ ] Production Supabase project with migrations applied, seed **not** loaded, `demo_payments_enabled` absent/false
- [ ] `admin_mfa_required` left at its default (true) and every admin enrolled in TOTP
- [ ] SMTP provider configured; verification and reset emails tested in all three languages
- [ ] Auth site URL and redirect URLs set for the production domain
- [ ] Vercel production variables set (`SUPABASE_SECRET_KEY`, `CRON_SECRET`, provider secrets); preview uses staging only
- [ ] Cron schedule confirmed for the Vercel plan; job run observed in logs
- [ ] Backups enabled and a restore rehearsed; Storage backup in place
- [ ] Alerting configured for the log events above
- [ ] Privacy policy, terms, and data-hosting requirements confirmed
- [ ] Real partner venues onboarded with licensed photos; demo organizations removed or never created
- [ ] CI green: format, lint, typecheck, unit, database, and end-to-end suites; production build

## Deferred features

Native apps, automatic renewal, waitlists, membership freezes, social feeds, trainer marketplaces,
calorie tracking, wearables, automated partner payouts, public reviews, phone OTP (until an SMS
provider is configured), email/SMS/push reminders, partial-refund automation, and a full map view.
