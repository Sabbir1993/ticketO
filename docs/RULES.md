# Ticketo — Engineering, Security & Business Rules

These rules are binding for humans and AI agents working in this repo. When a rule and a request conflict, the rule wins until the rule itself is changed in this file.

## 1. Code rules

1. **Business logic lives in `shared/core.js` only.** The server and client must not duplicate pricing, inventory, policy or permission logic.
2. **`shared/` must stay browser-compatible.** No `node:*` imports, `fs`, `process`, `Buffer` or `crypto`. Anything platform-specific is injected through `deps` (`id`, `token`, `hash`, `verify`, `encrypt`, `decrypt`, `gateways`, `sendOtp`, `now`).
3. **A new API goes through three places, in order:**
   1. add the method to `api` in `core.js`, as `async (args, ctx, env)`;
   2. add a row to `ROUTES` in `shared/routes.js` with the correct `roles`;
   3. call it from the client as `api.<name>(args)`. Do not hand-write Express routes for core APIs.
4. **Throw `ApiError(status, message, code)`**, or use the helpers `bad` / `forbid` / `missing`. Messages are shown to end users, so write them plainly and never include internals.
5. **Ownership:** every merchant-scoped method must call `own(ctx, event)` or `myMerchant(ctx)`. Role checks in `ROUTES` alone are not enough.
6. **Audit** every state change with `audit(ctx, 'VERB_NOUN', target, meta)`. Never put secrets or full PII in `meta`.
7. Persistence goes only through `server/src/db.js`. Don't write `db.json` from anywhere else.
8. ES modules, Node ≥ 20. Match the surrounding style: terse functions, short inline comments, no new dependencies without a reason.
9. The client imports shared code through the alias `@shared/...`, and client code through `@/...`.
10. Venue data must stay consistent with geometry. Seat IDs come only from `blockSeatIds`, and seat existence is checked only with `seatExists`.

## 2. Payment rules (non-negotiable)

1. **Never mark an order paid from browser input.** The only paths to `paid` are:
   - `completePayment` after server-to-server validation (SSLCOMMERZ Validation API, bKash execute);
   - a zero-total order;
   - a POS sale by an authorised operator;
   - the simulator, in dev only.
2. The validation must check **status, `tran_id` equals the current attempt, currency is `BDT`, and amount ≥ order total**.
3. Callbacks and IPN must stay **idempotent**. `completePayment` returns early when an order is already paid.
4. Keep card data off the platform. Use hosted checkout only, and never accept PAN/CVV fields in our UI or API. This keeps us in the smallest PCI-DSS scope (SAQ A).
5. Gateway secrets (`storePassword`, `appSecret`, `password`) are:
   - encrypted with `deps.encrypt` before storage;
   - shown as `••••••••` in every response;
   - never logged;
   - never placed in URLs.
6. **The simulator must be off in production.** Set **both** `PG_FALLBACK_SIMULATOR=false` **and** `config.payment.gateways.simulator.enabled=false` (Admin → Payment gateways). The route `POST /orders/:id/simulate` is public and can settle any order while the simulator is enabled.
7. Refunds go through the gateway refund API when `bankTranId` exists. Record `ref`, `by` and `processedAt`.
8. Amounts are BDT, rounded to whole taka in pricing, and sent to gateways with two decimals (`toFixed(2)`).

## 3. Security rules

| # | Rule | Current state |
|---|---|---|
| S1 | `APP_SECRET` is at least 32 random chars and unique per environment. Rotating it requires re-encrypting merchant credentials | Falls back to a dev value if unset. **The production boot must fail when unset** |
| S2 | HTTPS everywhere. `SERVER_URL` and `CLIENT_URL` are `https://` in non-local environments | Not enforced |
| S3 | CORS allow-list set to our own origins | Currently `origin: true` (reflects any origin) |
| S4 | Rate-limit `/auth/otp`, `/auth/otp/verify`, `/auth/login`, `/holds` and `/uploads` | None |
| S5 | OTPs come from a real SMS provider through `deps.sendOtp`. Never ship the fixed demo code | Demo code active |
| S6 | Order and hold lookups by ID must not leak PII to anonymous callers | `GET /orders/:id` and `GET /holds/:id` are public and return contact details and ticket codes. **Fix before go-live** |
| S7 | Uploads need authentication, a size and MIME check, and object storage with private ACLs | Unauthenticated; stored on local disk |
| S8 | Session tokens are hashed at rest, and have idle expiry and revocation | Plaintext in `db.tokens`, 30-day absolute TTL |
| S9 | QR payloads are signed with HMAC for offline gate validation | Plain ticket code |
| S10 | Dependencies are patched, and `npm audit` is clean at release | Manual |
| S11 | No secrets in the repo, docs or logs. Use `[PLACEHOLDER]` in examples | Enforced by review |

## 4. Data privacy rules

- **Personal data held:**
  - customer name, phone and email;
  - merchant owner identity, trade licence, TIN/BIN and bank or wallet account numbers;
  - KYC documents.
- Collect the minimum. Only the owner, the owning merchant (for their orders) and the admin may read it.
- KYC documents are readable **only** by admin (already enforced on `GET /api/uploads/:fileId`).
- Mask account numbers in any list view. Never export full numbers to CSV or logs.
- Keep a retention schedule for orders, KYC and scans, and delete or anonymise data when it expires. Store data in-country if regulation requires it.
- Transfers and refunds must be traceable in the audit log.

## 5. Compliance rules (Bangladesh)

- Follow Bangladesh Bank rules for payment aggregation and PSP settlement:
  - **platform mode:** Ticketo collects on behalf of merchants, which makes it an aggregator;
  - **direct mode:** the merchant is the SSLCOMMERZ or bKash merchant of record.
- Merchant KYC (trade licence, TIN/BIN, bank account) must be verified before a merchant can sell, unless the business explicitly accepts auto-approve risk.
- VAT on the convenience fee (`vatOnFeePct`, 15 % by default) must match current NBR rates. Invoices and receipts must show the fee and the VAT separately.
- Refund timelines must meet the gateway and consumer-protection requirements.
- Get legal and compliance sign-off before switching `SSLCZ_SANDBOX=false` or any merchant goes live.

## 6. Business rules (as implemented)

| Rule | Value / source |
|---|---|
| Seat hold | `platform.holdMinutes` (8 min), extended to at least 15 min on payment start |
| Max tickets per order | `min(event.bookingLimit, platform.maxTicketsPerOrder=10)` plus optional `tier.limit` |
| Convenience fee | `convenienceFeePct` 3.5 % of the post-discount base, plus `vatOnFeePct` 15 % VAT on the fee |
| Commission | `merchant.commissionPct`, defaulting to `defaultCommissionPct` 8 % |
| Guest checkout | `allowGuestCheckout` (on) |
| Merchant approval | `merchantAutoApprove` (off), so KYC review is required |
| Event approval | `eventRequiresApproval` (off) |
| Direct PG | `allowMerchantDirectPG` (on). Publishing requires a verified connection |
| Cancellation | Before `refundWindowHrs` (24 h); fee `cancellationFeePct` (10 %) |
| Refund | Requires `policy.refundable` and a show still in the future |
| Transfer | Requires `policy.transferable`; re-issues codes |
| Scanned ticket | Cannot be refunded or transferred |
| Delete event | Only when it has no paid orders; otherwise pause or cancel |
| Phone format | `+8801[3-9]XXXXXXXX` (input may omit `+88`) |

## 7. Documentation & review rules

- Update `docs/` in the same change when you alter a rule, route, state or config key.
- Every PR states its payment and security impact. Changes under `gateways/`, `completePayment`, `startPayment` or `security.js` need a second reviewer.
- Never paste real card numbers, tokens, store passwords or merchant credentials into issues, PRs, docs or chat. Use `[PLACEHOLDER]`.
