# Miragold Gold Saving System — V1 (Core Flow)

Fasa 1 build berdasarkan `MIRAGOLD_Gold_Saving_System_V1_Master_Specification`.

Scope build ini (core flow):

- Module 01 — Public Home & Daily Gold Price
- Module 02 — Account, Login & Customer Profile (phone + OTP)
- Module 03 — Lock / Buy Emas 916 (Billplz)
- Module 04 — Gold Wallet & transaction ledger
- Critical loophole protections (section 16): price snapshot + lock expiry,
  idempotent payment webhook, DB row-locking to prevent double-spend,
  decimal-safe money/gram arithmetic, immutable audit log.

Modules 05–09 (Tebus, Jual Balik, Tukar 999.9, Trade-In, Sankyu/POS) and the
full Admin Dashboard are **not yet built** — this is the foundation phase.
The data model already has room for them (see `src/db/schema.ts`).

## Tech stack

- Next.js 16 (App Router, TypeScript, Tailwind)
- PostgreSQL + Drizzle ORM (chosen over Prisma because Prisma's engine
  binary download was blocked in the build sandbox's network policy —
  Drizzle is pure JS/TS, no native binary)
- Billplz for payment (Miragold's existing account)
- OTP delivery behind a swappable interface (`src/lib/otp.ts`) — defaults
  to a free console-log mock for dev/pilot; swap in a real SMS provider
  later without touching the rest of the app

## Setup

```bash
npm install

# 1. Postgres — point DATABASE_URL in .env.local at your database, then:
npm run db:generate   # (only needed again if you change src/db/schema.ts)
npm run db:migrate

# 2. Seed an initial gold price + an OWNER-role test account
npm run db:seed

# 3. Run
npm run dev
```

Open http://localhost:3000.

### Environment variables (`.env.local`)

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `JWT_SECRET` | Session cookie signing secret — **change for production** |
| `OTP_PROVIDER` | `mock` (default, free, logs OTP to server console), `resend` (free-tier email OTP via [Resend](https://resend.com) — needs `RESEND_API_KEY` + `OTP_FROM_EMAIL`; staff accounts must have an email on file, set via `/admin/staff`), or `twilio` (needs implementing in `src/lib/otp.ts` + Twilio env vars) |
| `RESEND_API_KEY` | Only when `OTP_PROVIDER=resend` |
| `OTP_FROM_EMAIL` | Only when `OTP_PROVIDER=resend` — sender address, must be on a domain verified in the Resend account |
| `BILLPLZ_BASE_URL` | `https://www.billplz-sandbox.com/api/v3` for sandbox, `https://www.billplz.com/api/v3` for production |
| `BILLPLZ_API_KEY` | From your Billplz account (Miragold already has one) |
| `BILLPLZ_COLLECTION_ID` | The Billplz collection to bill into |
| `BILLPLZ_X_SIGNATURE_KEY` | From the Billplz collection's settings — used to verify webhook authenticity. **Required in production**; without it, webhook signature checks only pass in non-production `NODE_ENV`. |
| `APP_BASE_URL` | Public URL Billplz redirects/callbacks to (use an ngrok-style tunnel URL for local testing since Billplz needs to reach your webhook) |
| `PRICE_LOCK_MINUTES` | Price-lock window for checkout, spec suggests 10 |
| `MIRAGOLD_PRICE_SYNC_URL` | Auto price-sync source, default `https://miragold.my/daily_price_state.json` — the shop's own website already exposes today's rates here (sir zul, 19/9) |
| `PRICE_SYNC_INTERVAL_MINUTES` | How often to check the source above, default `5` |
| `PRICE_SYNC_SELL_FIELD` | Which JSON field becomes "Harga Jual", default `price_member` |
| `PRICE_SYNC_BUYBACK_FIELD` | Which JSON field becomes "Harga Beli Balik", default `price_selling` — if the shop's field meanings ever change, remap here instead of touching code |

### First login

`npm run db:seed` creates an OWNER-role account with phone `+60100000000`
and today's gold price (RM623/RM600 sell/buyback — placeholder, update via
the admin API). Login with that phone number; with `OTP_PROVIDER=mock` the
OTP code is printed in the server console/log, not sent as a real SMS.

## How the money/gold safety rules were implemented

- **Decimal-safe arithmetic** (`src/lib/decimal.ts`): all RM/gram math goes
  through `decimal.js`, never native floating point. Postgres `NUMERIC`
  columns round-trip as strings, so no precision is lost.
- **Wallet balance = ledger, always** (`src/lib/wallet.ts`): there is no
  editable "balance" column anywhere. `getWalletBalance()` sums
  `wallet_ledger` every time it's read.
- **Concurrency / double-spend** (`src/lib/wallet.ts`): every wallet-
  affecting write runs inside `db.transaction(...)` and takes a
  `SELECT ... FOR UPDATE` row lock on the customer's `users` row first, so
  two simultaneous wallet operations for the same customer serialize
  instead of racing.
- **Payment idempotency** (`src/app/api/payments/billplz/webhook`):
  Billplz's bill `id` is stored as a unique `idempotency_key` on
  `payments`. A replayed webhook is detected and a no-op.
- **Price-lock expiry**: an order records `lock_expires_at` at checkout.
  If a payment lands after that window, it is **not** auto-credited at the
  stale price — it's queued in `pending_allocations` for manual review.
- **Wallet-credit failure after payment success**: if crediting the ledger
  throws for any reason, the payment stays recorded as PAID and the order
  is queued in `pending_allocations` rather than the money being lost or
  silently dropped.
- **Audit log** (`src/lib/audit.ts`): price changes, registrations, and
  wallet credits write to `audit_logs` with before/after state.

All of the above were exercised manually against a real Postgres + a
signed mock Billplz webhook during development: successful payment credits
gram exactly once; a replayed webhook is a no-op; an expired-lock payment
is queued for review, not silently credited; a failed payment marks the
order FAILED with no gram movement; and a forged webhook (bad signature)
is rejected with 401.

## Admin — staff/pilot management

`/admin/staff` (ADMIN/OWNER only, linked from the nav bar as "Admin") lets an
admin provision staff accounts for the Fasa 2 pilot without touching the
database directly: add a staff member (name, phone, email, role), search
existing accounts, promote/demote a role, or suspend an account. Staff log
in exactly like a customer (phone + OTP) — there's no separate employee
login, per spec 5.1. An email is required at creation so `OTP_PROVIDER=resend`
has somewhere to deliver the code. Only an OWNER can grant/revoke the ADMIN
role; OWNER accounts themselves can't be edited from this page.

## What's next (not in this build)

Per the spec's own gating (section 25 — "Fasa 2: Staff Pilot" only after
this core is solid, and "Fasa 3: Legal/Syariah/Accounting review" before
any public launch):

1. Admin Dashboard / Gold Control Center (Module 10)
2. Tebus Jewellery (Module 05), Jual Balik / Buyback (Module 06)
3. Tukar 999.9 (Module 07) — formula intentionally left PENDING per spec,
   do not hard-code
4. Trade-In (Module 08)
5. Sankyu / POS reconciliation (Module 09)
6. Real OTP/SMS provider once one is chosen
7. Real Billplz sandbox credentials wired in and end-to-end tested against
   Billplz's actual sandbox (this build was tested against a locally
   simulated, correctly-signed webhook payload, not a live Billplz call,
   since sandbox API keys weren't available at build time)
