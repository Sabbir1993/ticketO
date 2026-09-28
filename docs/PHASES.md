# Ticketo — Delivery Phases

Status key: ✅ done · 🟡 partial · ⬜ not started

## Phase 0 — Prototype (current, v0.2.0) ✅

Goal: an end-to-end working product on one machine.

- ✅ Shared business core running on the server and in the browser
- ✅ Customer: discovery, config-driven home, event pages, seat maps, holds, checkout, promo codes, QR tickets and PDF, cancel/refund/transfer
- ✅ Merchant: six-step onboarding with KYC upload, platform/direct payment gateway, event editor, layout designer, dashboard, settlement
- ✅ Admin: approvals, rules, categories → views, layouts, venues, gateways, promos, branding, home page, audit
- ✅ Operations: POS and gate scanning
- ✅ SSLCOMMERZ v4 (init, validate, IPN, refund) and bKash Tokenized (grant, create, execute, refund)
- ✅ JSON-file persistence, offline/local and single-file preview modes
- ✅ Windows fix for `scripts/dev.js`

## Phase 1 — Security & compliance hardening ⬜ (blocks go-live)

| # | Task | Ref |
|---|---|---|
| 1.1 | Disable the simulator in prod (env and config). Make `simulatePayment` return 404 when `NODE_ENV=production` | RULES §2.6 |
| 1.2 | Protect `GET /orders/:id` and `GET /holds/:id`. Require the owner's token or a signed, short-lived booking access token; strip PII for anonymous callers | S6 |
| 1.3 | Fail boot if `APP_SECRET` is missing or short in production | S1 |
| 1.4 | CORS allow-list, `helmet`, HTTPS redirect, secure headers | S2, S3 |
| 1.5 | Rate limiting and lockout on OTP, login, holds and uploads | S4 |
| 1.6 | Real SMS OTP provider (`deps.sendOtp`) plus email delivery of tickets | S5 |
| 1.7 | Authenticated uploads, private object storage, malware scan | S7 |
| 1.8 | Hash tokens at rest; add idle timeout and "sign out everywhere" | S8 |
| 1.9 | HMAC-signed QR payloads | S9 |
| 1.10 | Mask settlement account numbers; define a PII retention job | Privacy |
| 1.11 | Legal and compliance review (Bangladesh Bank aggregator model, NBR VAT, merchant agreement) | RULES §5 |

**Exit:** a security review passes, a pen-test finds no high or critical issues, and compliance signs off.

## Phase 2 — Production data layer & scale ⬜

- 2.1 Replace `server/src/db.js` with PostgreSQL. Collections map to tables, and the core keeps its plain-object contract through a repository layer.
- 2.2 Move seat holds to Redis with a TTL. Confirm seats with `SELECT … FOR UPDATE` or a unique constraint on `(show_id, block_id, seat)`.
- 2.3 Run several API instances behind a load balancer; move the bKash token cache to Redis.
- 2.4 Background worker: hold expiry, payment reconciliation (re-validate `pending_payment` orders older than N minutes), refund status polling.
- 2.5 Structured logging, request IDs, metrics, alerting on payment-validation failures.
- 2.6 Backups and point-in-time recovery; data residency confirmed.

**Exit:** a load test at 5 000 concurrent seat selections on one show has zero double-sold seats, and p95 availability is under 300 ms.

## Phase 3 — Quality & delivery ⬜

- 3.1 Test runner (Vitest or `node:test`) with unit tests for `core.js`: pricing, holds, policy, state machines, `validateSpec`, geometry.
- 3.2 Contract tests for the gateway adapters against the sandbox.
- 3.3 E2E tests (Playwright) for book → pay → ticket → scan, merchant onboarding, and admin approval.
- 3.4 ESLint and Prettier, then CI (lint, test, build, `npm audit`) on every PR.
- 3.5 Staging environment with a public IPN URL and sandbox gateways.

## Phase 4 — Money operations ⬜

- 4.1 Automated payouts for platform-mode merchants, with a settlement ledger and reconciliation against gateway reports.
- 4.2 Commission invoicing for direct-mode merchants.
- 4.3 Chargeback and dispute handling.
- 4.4 Finance exports for the ledger, VAT and commission.

## Phase 5 — Product growth ⬜

- Real reviews and ratings (replacing the seeded `score`/`votes`), server-side wishlist, loyalty points
- Waitlist for sold-out shows, dynamic pricing, group bookings
- Offline-capable gate app with signed QR codes and a local allow-list
- Bangla UI localisation
- Mobile apps (reusing the REST API)

## Dependency order

```
Phase 1 ──► go-live (single instance, low volume)
Phase 2 ──► scale-out / high-demand on-sales
Phase 3  runs in parallel from Phase 1 onward
Phase 4 needs Phase 2 (ledger in PostgreSQL)
Phase 5 any time after go-live
```
