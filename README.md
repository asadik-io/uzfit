# UzFit

UzFit is a multi-venue fitness membership web app for Tashkent, Uzbekistan: members buy a
fixed-term plan, book sessions at partner gyms and studios, and check in with a short-lived QR
code that venue staff scan. It is a mobile-first, installable web app (PWA) in Uzbek (default),
Russian, and English, with a member area, a partner dashboard, and a platform admin dashboard.

> **This repository is a self-contained public demo.** It runs without any external service:
> the database, authentication, and payment provider are simulated in the app's own memory with
> fictional data, so anyone can open the deployment, sign in with a one-click demo account, and
> walk through the member → partner → admin journeys. Changes made by visitors live in the server
> instance that handled them and reset whenever that instance restarts.

All venues, organizations, people, and prices in this repository are fictional. The sample plan
prices are not commercial offers, and UzFit claims no real partnerships.

---

## Contents

- [Live demo and accounts](#live-demo-and-accounts)
- [What the demo covers](#what-the-demo-covers)
- [Tech stack](#tech-stack)
- [Local setup](#local-setup)
- [Commands](#commands)
- [Testing](#testing)
- [Environment variables](#environment-variables)
- [Architecture](#architecture)
- [Business rules](#business-rules)
- [Security](#security)
- [Payments](#payments)
- [Deployment](#deployment)
- [From Supabase to the in-memory demo](#from-supabase-to-the-in-memory-demo)
- [Deferred features](#deferred-features)

---

## Live demo and accounts

Open the sign-in page and pick an account; one tap signs you in. Every demo account shares the
password `UzFitDemo2026` (or the value of `DEMO_PASSWORD`).

| Account                          | What you can try                                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------------------------- |
| `member@uzfit.test`              | Active _Active_ plan: upcoming bookings, attended sessions and a no-show, QR code, favorites      |
| `member.new@uzfit.test`          | No plan yet: compare plans and run the demo checkout (simulated provider, no money)               |
| `member.expired@uzfit.test`      | Expired membership                                                                                |
| `member.revoked@uzfit.test`      | Revoked membership                                                                                |
| `partner.a.manager@uzfit.test`   | Manager of _Demo Sport Group_: today's schedule, rosters, sessions, activities, venue drafts, CSV |
| `partner.a.reception@uzfit.test` | Receptionist: QR scanner and schedule only                                                        |
| `admin@uzfit.test`               | Platform admin: pending venue approval, organizations, users, plan versions, payments, audit log  |

Sign-up also works: new accounts are ready immediately (no confirmation email) and exist until the
demo instance restarts.

## What the demo covers

| Area                                                                                                                                                 | Status                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| Discovery: landing, explore (search, city/district/category/date/plan filters, pagination, opt-in “Near me”), venue details, session selector, plans | ✅ Works                |
| Authentication: sign-in, one-click demo accounts, sign-up, sign-out, session cookie                                                                  | ✅ Works (no emails)    |
| Profile: name, E.164 phone normalization, language                                                                                                   | ✅ Works                |
| Memberships: versioned immutable plans, fixed term, usage (used / reserved / available), history                                                     | ✅ Works                |
| Booking, cancellation (timely/late with confirmation), daily/total/future limits, capacity, conflicts, idempotency                                   | ✅ Works                |
| QR check-in (member code, staff scanner with camera + paste fallback)                                                                                | ✅ Works                |
| No-show finalization and abandoned checkout expiry                                                                                                   | ✅ Runs on access       |
| Partner dashboard: summary, schedule, rosters, cancellations with reason, activities, venue drafts with photos, approval workflow, attendance CSV    | ✅ Works                |
| Admin dashboard: approvals, venue status, organizations and staff, plan versions, users, payments and refunds, totals, audit log                     | ✅ Works                |
| Checkout and payment processing                                                                                                                      | 🟡 Simulated provider   |
| Persistence across server restarts, email delivery, real payments, TOTP second factor                                                                | ⛔ Not part of the demo |

## Tech stack

- **Next.js 16** (App Router, Server Components, Server Actions, `proxy.ts`), **React 19**, **TypeScript** (strict)
- **Tailwind CSS 4**, Radix UI primitives, Lucide icons, Sonner toasts
- **React Hook Form + Zod** on the client; every Server Action re-validates with Zod, and the
  in-memory database functions validate again
- **In-memory demo database** (`src/lib/db`): a small PostgREST-style query engine with embedded
  relations, owner-scoping policies, all former database functions ported to TypeScript, a signed
  session cookie, and a deterministic seed
- **next-intl** for `uz` / `ru` / `en` routing and messages
- **Vitest** for unit tests; **pnpm** with a committed lockfile; hosting target **Vercel**

## Local setup

Prerequisites: Node.js ≥ 22.12 and pnpm 10 (`corepack enable`). No database or Docker.

```bash
pnpm install
pnpm dev                           # http://localhost:3000
```

`.env.local` is optional; see [Environment variables](#environment-variables). The demo artwork in
`public/demo/media` is committed; `pnpm demo:media` regenerates it.

## Commands

| Command                                              | Purpose                                                   |
| ---------------------------------------------------- | --------------------------------------------------------- |
| `pnpm dev` / `pnpm build` / `pnpm start`             | Develop, build for production, serve the build            |
| `pnpm lint` / `pnpm typecheck` / `pnpm format:check` | ESLint, `next typegen` + `tsc`, Prettier                  |
| `pnpm test`                                          | Unit tests (Vitest)                                       |
| `pnpm demo:media`                                    | Regenerates the generated venue artwork (original shapes) |
| `pnpm assets:generate`                               | Regenerates the icon set from the UzFit mark              |

## Testing

- **Unit** (`tests/unit`): domain error mapping, dictionary parity and ICU formatting for all three
  languages, money and Tashkent time handling, phone normalization, redirect safety, CSV
  escaping, QR token parsing, image signature checks, demo payment signatures (tampering, replay),
  CSP, venue content validation.

The CI workflow (`.github/workflows/ci.yml`) runs formatting, lint, typecheck, unit tests, and a
production build on every push and pull request.

## Environment variables

Every variable is optional; the demo starts with defaults.

| Variable                                    | Purpose                                                                                          |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `NEXT_PUBLIC_APP_URL`                       | Public origin for absolute links (default `http://localhost:3000`).                              |
| `PAYMENT_PROVIDER`                          | `demo` (simulated provider, default), `payme`, `click`, or `none`. Only `demo` has an adapter.   |
| `PAYMENT_WEBHOOK_SECRET`                    | Demo adapter signing key; a per-process key is used when unset.                                  |
| `PAYMENT_MERCHANT_ID`, `PAYMENT_API_SECRET` | Reserved for a real provider adapter.                                                            |
| `DEMO_PASSWORD`                             | Shared password of the demo accounts shown on the sign-in page (default `UzFitDemo2026`).        |
| `DEMO_SESSION_SECRET`                       | Signs the session cookie. Set a long random string in deployments.                               |
| `CRON_SECRET`                               | Bearer secret for `/api/jobs/reconcile`.                                                         |
| `APP_ENV`                                   | `production` marks a non-Vercel host as production. Vercel's `VERCEL_ENV` is used automatically. |
| `NEXT_PUBLIC_SUPPORT_EMAIL`                 | Support address shown on the profile page.                                                       |

## Architecture

```
src/app/[locale]/…          pages (uz | ru | en), locale-prefixed
src/app/media/[...path]     photos uploaded through the partner editor (kept in memory)
src/app/api/payments/[provider]/webhook   provider notifications (demo adapter)
src/app/api/jobs/reconcile  protected maintenance job
src/app/api/partner/attendance            attendance CSV
src/proxy.ts                request ID, CSP nonce, session check, sign-in redirects, locale routing
src/features/*              feature modules (queries, Server Actions, components)
src/lib/db                  the in-memory database (see below)
src/lib/payments            adapter interface, demo adapter, processing service
src/lib/i18n, src/messages  routing and dictionaries
tests/unit                  unit tests
```

### The in-memory database (`src/lib/db`)

| File                | Role                                                                                                                                                           |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `query.ts`          | PostgREST-style builder: `select` with embedded relations and `!inner`, filters, ordering, paging, `single`/`maybeSingle`, counts, insert/update/upsert/delete |
| `policy.ts`         | Row visibility and direct-write rules: the former Row Level Security policies and grants                                                                       |
| `rpc/*.ts`          | The former Postgres functions (`create_booking`, `cancel_booking`, `redeem_checkin_token`, `apply_payment_event`, `admin_*`, `partner_*`, jobs)                |
| `core.ts`           | Shared domain primitives: authorization predicates, booking state changes with occupancy, notifications, audit entries, venue content validation               |
| `seed.ts`           | Deterministic fictional dataset built relative to “now” in Tashkent; schedules extend themselves as days pass                                                  |
| `store.ts`          | Process-wide singleton, light maintenance on access (no-shows, expired checkouts), uploads, rate limits                                                        |
| `auth.ts`           | Demo authentication: shared demo password, salted hashes for sign-ups, soft deletion                                                                           |
| `session.ts`        | HMAC-signed session cookie (Web Crypto, usable in the proxy)                                                                                                   |
| `server.ts`         | Request-scoped client as the signed-in user; `admin.ts` is the privileged client for jobs and payment events                                                   |
| `database.types.ts` | Generated types of the original schema, kept as the contract between features and the engine                                                                   |

- **Identity** comes from the signed session cookie; pages and Server Actions check it, and
  database functions derive the user from the request, never from a submitted id.
- **Business rules live in the database functions** (now TypeScript). Each checks authorization
  inside, raises stable domain error codes (for example `SESSION_FULL`, `DAILY_LIMIT_REACHED`,
  `OUTSIDE_CHECKIN_WINDOW`) as `P0001`, and writes an audit entry. The UI translates every code.
- **Occupancy** is maintained with every booking state change; a session cannot be overbooked.
- **Time**: instants are ISO strings in UTC; each venue stores its IANA timezone (`Asia/Tashkent`),
  and local dates, deadlines, and check-in windows are derived with it and snapshotted on the booking.
- **Money** is stored in integer minor units (tiyin) with an explicit `UZS` currency.
- **Localization**: all UI text is in `src/messages/{uz,ru,en}.json`; data content is localized
  JSON with a fallback to Uzbek.

## Business rules

Defaults are stored per plan version and enforced by the database functions:

- A membership is valid for the half-open interval `[starts_at, ends_at)`; a session is bookable only
  if it fits entirely inside it. Duration is 30 × 24 h from activation; the exact expiry is shown.
  One current membership per member; no automatic renewal.
- Booking reserves a visit; check-in consumes it; a timely cancellation (≥ 2 h before start)
  releases it; a late cancellation or no-show consumes it; a venue cancellation always releases it.
  `available = allowance − consumed − reserved`.
- One visit per local day (Asia/Tashkent), up to 3 future reservations, booking up to 7 days ahead,
  booking closes at session start, no overlapping sessions, capacity enforced.
- Check-in opens 15 minutes before start and closes at `min(start + 30 min, end)`. Remaining
  confirmed reservations become no-shows after the session ends.
- Partners cannot silently change booked session times or reduce capacity below occupied places.

## Security

- Owner-scoped reads and least-privilege direct writes, applied to embedded relations as well;
  check-in tokens are never readable (functions only). Staff see only a minimal roster projection.
- Rate limits for sign-in, sign-up, password reset, checkout, token issuance, token redemption.
- Server Actions are protected against cross-site requests by Next.js origin checks; the demo
  webhook verifies HMAC signatures; the job endpoint uses a bearer secret compared in constant time.
- Redirects are restricted to internal locale paths on the app's own origin.
- Per-request CSP with nonces and `strict-dynamic`, `frame-ancestors 'none'`, HSTS, `nosniff`,
  strict referrer policy, COOP, and a restrictive Permissions-Policy (camera for the scanner only).
- Venue photos: JPEG/PNG/WebP only (checked by file signature), ≤ 4 MB, uploaded by managers of
  that venue into the venue's own folder; SVG/HTML are rejected.
- Every privileged change is audited with actor, reason, and request ID.
- Demo-specific: the demo accounts and their shared password are public by design, the session
  cookie secret should still be set per deployment, and nothing here is personal data.

## Payments

`src/lib/payments/types.ts` defines the adapter contract: create a checkout for an immutable
pending order, authenticate and normalize callbacks, query transaction status for reconciliation,
and declare refund capabilities. `apply_payment_event` then records each event once, checks the
transaction, amount, and currency against the order snapshot, only moves payment state forward,
activates at most one membership, and flags extra payments for reconciliation instead of
discarding them. The return page only displays server state.

The **demo adapter** simulates a provider page and delivers HMAC-signed events through the same
verification path. Because this deployment is a public demo, it is available in every environment.
Adding a real provider (Payme, Click) still means merchant onboarding, credentials, an adapter
written from the provider's official documentation, and a persistent database.

## Deployment

The demo deploys to Vercel as a normal Next.js app with no external services:

```bash
vercel --prod
```

Recommended environment variables: `NEXT_PUBLIC_APP_URL` (the deployment origin),
`DEMO_SESSION_SECRET` and `CRON_SECRET` (long random strings), `PAYMENT_PROVIDER=demo`.
Each serverless instance holds its own copy of the dataset, so data created by visitors may differ
between instances and disappears on cold starts. That is intended for a demo.

## From Supabase to the in-memory demo

UzFit was first built on Supabase (Postgres with Row Level Security and `security definer`
functions, Auth, Storage) and covered by database and end-to-end tests. When that project was
retired, the data layer was ported into this repository so the app stays usable as a public demo:

- the SQL schema became `database.types.ts` plus the seed;
- RLS policies and grants became `policy.ts`;
- the Postgres functions became `rpc/*.ts`, keeping their names, arguments, result shapes, lock
  order semantics (as sequential in-memory operations), domain error codes and audit entries;
- Supabase Auth became a signed cookie over an in-memory user table;
- Storage became static seed artwork plus in-memory uploads.

The feature code (queries, Server Actions, pages) is unchanged apart from import paths, which is
the point: the engine implements the client surface the app already used. The Supabase version,
including migrations, database tests and Playwright journeys, remains in the git history.

## Deferred features

Native apps, automatic renewal, waitlists, membership freezes, social feeds, trainer marketplaces,
calorie tracking, wearables, automated partner payouts, public reviews, phone OTP, email/SMS/push
reminders, partial-refund automation, and a full map view.
