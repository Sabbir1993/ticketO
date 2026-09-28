# Ticketo — Architecture

## 1. System overview

```
┌──────────────────────── Browser ────────────────────────┐
│ React 19 + React Router 7 + Tailwind (Vite)             │
│  pages/  customer · merchant · admin · ops              │
│  lib/api.js ── adapter ──┬── http  → fetch /api/*       │
│                          └── local → shared/core.js     │
│                                       in the browser    │
└──────────────┬──────────────────────────────────────────┘
               │ JSON over HTTPS, Authorization: Bearer <token>
┌──────────────▼──────────── Node.js 20 / Express ────────┐
│ server/src/index.js                                     │
│  • auth middleware (token → user)                       │
│  • REST routes generated from shared/routes.js          │
│  • /api/uploads          (KYC files → server/uploads)   │
│  • /api/pg/*             gateway callbacks + IPN        │
│  • static client/dist    (production)                   │
│         │                                               │
│  shared/core.js  ← all business rules                   │
│         │                                               │
│  db.js (JSON file, atomic write)   gateways/            │
│  security.js (scrypt, AES-GCM)      sslcommerz · bkash  │
└──────────────┬──────────────────────────┬───────────────┘
               │                          │ HTTPS
        server/data/db.json     SSLCOMMERZ v4 · bKash Tokenized
```

**Key idea:** a single business core (`shared/core.js`) that is pure JavaScript with no dependencies. The server injects real dependencies such as crypto, gateways and persistence. The browser's `local` mode injects demo stand-ins, so the whole app runs offline or as one HTML file.

## 2. Repository layout

| Path | Responsibility |
|---|---|
| `shared/core.js` | `createCore(db, deps)` returns `{ api, resolveUser, purgeHolds, gatewayCreds, orderBy, db }`. Every API method has the shape `async (args, ctx, env)` |
| `shared/routes.js` | `ROUTES` table `[name, method, path, roles]`, plus `checkAccess` and `buildPath`. It is the single source of truth for HTTP and RBAC |
| `shared/geometry.js` | Seat maths: rows, per-row counts, aisles, removed seats, shapes (`rect`/`arc`/`polygon`/`circle`), seat positions |
| `shared/templates.js` | `VIEW_TYPES` and the seed layout templates |
| `shared/seed.js` | `DEFAULT_CONFIG`, cities, and the demo data builder `buildSeed(deps)` |
| `server/src/index.js` | Express app, callbacks, route registration, static hosting |
| `server/src/env.js` | Loads `.env` (`process.loadEnvFile`) into the `env` object |
| `server/src/db.js` | Load/seed and debounced atomic save (`.tmp` + rename). The only persistence seam |
| `server/src/security.js` | `hashPassword`/`verifyPassword` (scrypt), `encrypt`/`decrypt` (AES-256-GCM), `token`, `newId` |
| `server/src/gateways/` | Adapters with the interface `{ init, validate?, execute?, refund, test }` |
| `client/src/lib/api.js` | Proxy `api.<routeName>(args)`, the http and local adapters, `uploadFile` |
| `client/src/lib/store.jsx` | Context: config, session, prefs, toasts, plus the `useApi` hook |
| `client/src/lib/theme.js` | Runtime theme: brand colours → 50–900 CSS variable scales |
| `client/src/components/venue/` | `VenueMap` (SVG plus seat zoom), `SeatGrid`, `BookingView`, `LayoutDesigner` |
| `scripts/dev.js` | Starts the API and Vite together |

## 3. Request lifecycle

1. The client calls `api.createHold({ showId, seats, zones })`.
2. `buildPath` fills the path params. For GET/DELETE the rest of the args go in the query string; for other methods they go in the JSON body.
3. The server middleware resolves `Authorization: Bearer` into `req.user` through `db.tokens`.
4. The generated route runs `checkAccess(route, user)`, which returns 401 or 403 if the caller lacks access.
5. It calls `api[name]({ ...query, ...body, ...params }, { user }, { clientUrl, serverUrl, fallbackToSimulator, token })`.
6. For a non-GET call (or `getAvailability`, which purges holds), it runs `scheduleSave(db)`, an atomic write debounced by 80 ms.
7. On error, `ApiError` becomes `{ error: { message, code } }` with its status. Any other error becomes a 500 with a generic message.

`completePayment` is deliberately **not** exposed as a route. Only the gateway callback handlers call it.

## 4. Data model (collections in `db`)

| Collection | Key fields |
|---|---|
| `config` | `platform`, `categories`, `payment.{methods,gateways}`, `promos`, `branding`, `home`, `banners` |
| `users` | `id`, `role` (customer / merchant / admin), `phone`, `email`, `password` (scrypt), `merchantId` |
| `tokens` | `{ [token]: { userId, exp } }` with a 30-day TTL |
| `otps` | `{ [phone]: { code, exp, tries } }` with a 5-minute TTL |
| `merchants` | `status`, `commissionPct`, `owner`, `business`, `kyc.{status,docs}`, `settlement`, `pg.{mode,sslcommerz,bkash}` |
| `venues` | `id`, `name`, `city`, `address`, `type`, `facilities` |
| `templates` | `id`, `name`, `viewType`, `spec`, `ownerId?` |
| `events` | `slug`, `merchantId`, `status`, `templateId`, `customSpec?`, `tiers[]`, `shows[]` or `schedule` (recurring), `blockOverrides`, `policy`, `promos`, `saleStart/End` |
| `holds` | `showId`, `items[]`, `subtotal`, `expiresAt`, `orderId?` |
| `orders` | `status`, `items[]`, `amounts`, `contact`, `payment`, `tickets[]`, `refund?`, `channel` (web or pos) |
| `scans` | `code`, `gate`, `status`, `eventId`, `merchantId`, `by`. Keeps the latest 5 000 |
| `audit` | `at`, `actor`, `role`, `action`, `target`, `meta`. Keeps the latest 2 000 |

### State machines

```
Merchant:  pending ──approve──► active ──suspend──► suspended ──reactivate──► active
               └──reject──► rejected ──(re-upload KYC)──► pending

Event:     draft ──publish──► published ◄──► paused
             │        └─(approval on)─► pending_review ──approve──► published
             │                                     └─reject──► rejected ──save──► draft
             └──► cancelled / deleted (only if no paid orders)

Order:     pending_payment ──validated──► paid ──request──► refund_requested ──approve──► refunded
                  │                                               └──reject──► paid
                  └── hold expired ──► expired
           (zero total → paid on create; POS → paid on create)
```

### Show IDs

- Fixed shows: `event.shows[].id`.
- Recurring (cinema): a synthetic `<eventId>~<venueId>~<YYYYMMDD>~<HHMM>`, generated for `schedule.days` from today (or the release date) onward.

## 5. Inventory & holds

- **Sold** = seats/qty in orders with status `paid` or `refund_requested`, plus unexpired holds that are not yet tied to a paid order.
- `demoFill` adds deterministic fake occupancy (a hash of show, block and seat) so demo maps look busy. New events get `demoFill: 0`.
- `purgeHolds()` runs on availability, hold creation and order creation.
- Once paid, the hold's `expiresAt` becomes `MAX_SAFE_INTEGER` so the seats stay locked. An approved refund deletes the hold.
- **Concurrency caveat:** the check and the insert are synchronous inside one Node process, so this is safe for a single instance. It is **not** safe across several instances. See Phase 2.

## 6. Pricing

```
discount     = promo (flat ≤ subtotal | pct capped by max)
base         = subtotal − discount
fee          = round(base × convenienceFeePct% × (1 + vatOnFeePct%))
total        = base + fee
commission   = round(base × merchant.commissionPct%)
merchantNet  = base − commission
```

Event-level promos are checked before platform promos. The usage counter increments only when an order is paid.

## 7. Payment integration

### SSLCOMMERZ v4 (hosted)

```
POST /api/orders/:id/pay
  → gatewayCreds(order)   direct (merchant, decrypted) | platform (config)
  → sslcommerz.init       /gwprocess/v4/api.php  → GatewayPageURL
Customer pays on SSLCOMMERZ
  → POST /api/pg/sslcommerz/success/:orderId  (val_id)
       validate  /validator/api/validationserverAPI.php
       ok ⇔ VALID|VALIDATED ∧ tran_id = payment.tranId ∧ currency = BDT ∧ amount ≥ total
       completePayment → tickets → 303 /booking/:id
  → POST /api/pg/sslcommerz/fail|cancel/:orderId → mark failure → 303 /payment/:id?failed=
  → POST /api/pg/sslcommerz/ipn (optional, public URL) → same validate path, idempotent
Refund → /validator/api/merchantTransIDvalidationAPI.php (bank_tran_id)
```

### bKash Tokenized Checkout v1.2.0-beta

```
grant token (cached per appKey until expires_in − 60 s)
create → bkashURL → customer approves → GET /api/pg/bkash/callback/:orderId?paymentID&status
execute → transactionStatus = Completed → completePayment
refund → /tokenized/checkout/payment/refund
```

### Simulator

`/pay/simulate/:orderId` calls `POST /api/orders/:id/simulate`. It is used when there is no adapter, the platform gateway is disabled, or the gateway is unreachable and `fallbackToSimulator` is on.

## 8. Authentication & authorisation

- Customer: OTP to a BD mobile, then an opaque token. The OTP is a fixed demo code until `deps.sendOtp` is implemented.
- Merchant and admin: email plus a scrypt password, then a token.
- Tokens are random 24-byte base64url values, kept server-side in `db.tokens` with a 30-day expiry. Logout deletes the token.
- RBAC comes from `ROUTES[].roles`: `null` means public, `'any'` means any signed-in user, `[roles]` means an allow-list. Ownership checks inside the core (`own()`, `myMerchant()`) scope merchants to their own data.

## 9. Configuration

| Env var | Purpose |
|---|---|
| `PORT` | API port (4000) |
| `SERVER_URL` | Public API base for gateway callback URLs |
| `CLIENT_URL` | Where customers are redirected after payment |
| `IPN_BASE_URL` | Public base for IPN. If empty, no `ipn_url` is sent |
| `APP_SECRET` | Key material for AES-GCM (SHA-256 of the secret) |
| `DATA_FILE` | JSON DB path |
| `PG_FALLBACK_SIMULATOR` | Fall back to the simulator on a gateway error. Defaults to on outside production |
| `SSLCZ_STORE_ID` / `SSLCZ_STORE_PASSWORD` / `SSLCZ_SANDBOX` | Platform store, applied at seed time |

Values are always `[PLACEHOLDER]` in docs. Never commit `server/.env`.

## 10. Build & runtime modes

| Mode | Command | API | Router |
|---|---|---|---|
| Dev | `npm run dev` | http, Vite proxies `/api` to :4000 | Browser |
| Production | `npm run build && npm start` | http, Express serves `client/dist` | Browser |
| Local | `npm run dev --prefix client -- --mode local` | Core in the browser, localStorage DB | Browser |
| Single file | `npm run preview:single` | Local | Memory |

Build flags: `__API_MODE__` and `__ROUTER__` (see `client/vite.config.js`).

## 11. Known architectural limits

1. The JSON file store has one writer and a full rewrite on every save. It loses up to 80 ms of writes on a crash.
2. In-memory state (the bKash token cache, holds being checked) assumes a single process.
3. KYC uploads go to local disk (`server/uploads`).
4. There are no background jobs. Hold expiry is lazy, and settlements and payouts are computed, not executed.
5. There is no automated test suite or CI.

See [PHASES.md](PHASES.md) for the remediation plan.
