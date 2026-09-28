# Ticketo — Product Requirements Document

| | |
|---|---|
| Product | Ticketo — multi-merchant event ticketing for Bangladesh |
| Version | 0.2.0 (working prototype) |
| Owner | SSL Wireless |
| Status | Prototype feature-complete; production hardening pending (see [PHASES.md](PHASES.md)) |

## 1. Problem

Event organisers in Bangladesh (cinemas, cricket/football boards, concert promoters, theatre groups, seminar hosts) sell tickets through fragmented channels: counters, Facebook pages, and one-off web forms. Customers have no single place to discover events, pick a seat, and pay with local methods (bKash, Nagad, cards, internet banking). Organisers have no self-serve tool to model their venue, price it, and collect money into their own gateway account.

## 2. Goals

1. One marketplace where customers discover, book and pay for any event type.
2. Merchants self-onboard (KYC included), design their venue, and publish without platform engineering help.
3. Payments go through SSLCOMMERZ or bKash hosted checkout. The server validates every payment before it issues a ticket.
4. The platform operator (admin) controls rules, fees, branding, the home page and approvals from a console, without redeploying.
5. Day-of-event operations: box-office sales (POS) and QR gate scanning.

### Non-goals (current release)

- Native mobile apps
- Reserved-seat resale marketplace
- Dynamic/surge pricing
- Storing or processing raw card data. Cards stay on the gateway's hosted page.

## 3. Users & roles

| Role | Entry point | Auth | Core jobs |
|---|---|---|---|
| **Customer** | `/`, `/explore`, `/events/:slug` | Mobile OTP (guest checkout optional) | Discover, pick seats, pay, get QR tickets, cancel/refund, transfer |
| **Merchant** | `/merchant/register`, `/partner/login`, `/merchant/*` | Email + password | Onboard + KYC, connect gateway, create events and layouts, see orders, settlement, and refunds |
| **Gate / POS operator** | `/gate`, `/pos` | Merchant or admin login | Scan tickets, sell walk-in tickets |
| **Platform admin** | `/admin/*` | Email + password | Approve merchants and events, set fees/rules, gateways, branding, home page, layouts, venues, promos, audit |

## 4. Functional requirements

### 4.1 Discovery (customer)

- **FR-D1** The home page is config-driven: an ordered list of sections (`banners`, `row`, `categories`, `cta`) that the admin can edit.
- **FR-D2** Explore filters by city, category and free-text search (title, genre, category, cast).
- **FR-D3** The event page shows details, cast, sponsors, policy, tiers with price (early-bird aware), shows and promos.
- **FR-D4** An event can be *coming soon* (`releaseDate` in the future), *sold out* (every show has zero availability) or *paused*.
- **FR-D5** Per-device preferences: city, wishlist and points (local storage).

### 4.2 Booking (customer)

- **FR-B1** The booking view is chosen by category → view type (`stadium-cricket`, `stadium-football`, `hall`, `cinema`, `open-field`, `ga-list`).
- **FR-B2** On seated blocks the customer zooms into a live seat map. On GA zones they choose a quantity.
- **FR-B3** Selecting seats creates a **hold** for `holdMinutes` (default 8). Held seats are unavailable to others.
- **FR-B4** Limits apply: the per-order max is `min(event.bookingLimit, platform.maxTicketsPerOrder)`, plus an optional per-tier limit.
- **FR-B5** A seat already taken returns HTTP 409 `seat_taken`. An oversold GA zone returns 409 `sold_out`.
- **FR-B6** Checkout collects name, a BD mobile number (`01[3-9]XXXXXXXX`) and email. A promo code is optional.
- **FR-B7** Pricing is subtotal − discount, plus a convenience fee (`convenienceFeePct`) with VAT on the fee (`vatOnFeePct`). A zero-total order is paid immediately.

### 4.3 Payment

- **FR-P1** The admin maps each customer-facing method (SSLCOMMERZ, bKash, Nagad, card, net banking) to a gateway adapter and an optional `multi_card_name`.
- **FR-P2** Collection modes:
  - **Platform:** payment goes to the Ticketo store, and the merchant is paid out minus commission.
  - **Direct:** payment goes to the merchant's own SSLCOMMERZ or bKash account, and the platform tracks commission receivable.
- **FR-P3** An SSLCOMMERZ success counts only after the Validation API confirms `status`, `tran_id`, `amount ≥ total` and `currency = BDT`.
- **FR-P4** For bKash, the payment is executed after the callback, and only `transactionStatus = Completed` marks the order paid.
- **FR-P5** IPN is supported and idempotent with the browser redirect.
- **FR-P6** Each new attempt increments `tranId` (`<orderId>-<n>`). The hold is extended by 15 min while the customer is on the gateway page.
- **FR-P7** A payment simulator exists for offline and dev use only.

### 4.4 Post-booking

- **FR-A1** There is one unique ticket code per seat or GA unit (`TKT-XXXXXXXX`). The customer sees it as a QR code and can download a PDF.
- **FR-A2** Cancellation or refund follows the event policy:
  - *Cancellable* bookings, requested before `refundWindowHrs`, are refunded minus `cancellationFeePct`.
  - *Refundable* bookings are refunded in full any time before the show.
- **FR-A3** A refund needs approval by the admin or the owning merchant. On approval, the gateway refund API is called and the inventory is released.
- **FR-A4** A transfer to another mobile number re-issues all ticket codes. The old codes stop working.
- **FR-A5** Scanned tickets cannot be refunded or transferred.

### 4.5 Merchant

- **FR-M1** Six-step registration: Account → Business → KYC documents (PDF/JPG/PNG/WEBP, ≤ 5 MB) → Settlement → Payment gateway → Review.
- **FR-M2** The merchant starts as `pending` unless `merchantAutoApprove` is on.
- **FR-M3** Direct-mode gateway credentials are encrypted at rest and masked in every response. **Test connection** must pass before the merchant can publish.
- **FR-M4** Event editor fields: title, category/sub-category, venue(s), layout template or custom layout, tier prices, early-bird, per-tier limits, block on/off, GA capacity overrides, shows, sales window, policy and event promos.
- **FR-M5** To publish, the merchant must be active, the gateway verified (direct mode only), and the event needs at least one priced tier, one upcoming show and one sellable block. If `eventRequiresApproval` is on, publishing puts the event in `pending_review`.
- **FR-M6** Dashboard: KPIs, a 14-day revenue series and recent orders. Settlement: payable/receivable by collection mode.
- **FR-M7** Merchants can save layouts as their own templates (`ownerId`). Only they and the admin can see these.

### 4.6 Operations

- **FR-O1** A POS sale creates a paid order on channel `pos` with no convenience fee. Payment method: cash or others.
- **FR-O2** A gate scan returns `valid` / `duplicate` / `void` / `wrong_event` / `invalid`. Every scan is logged with the gate and operator.
- **FR-O3** Gate stats show issued vs inside, counts per gate, and the latest scans.

### 4.7 Admin

- **FR-X1** Admin console sections: Overview, Merchants & KYC, Events, Orders & refunds, Categories → views, Venue layouts, Venues, Payment gateways, Promo codes, Platform rules, Branding & theme, Home page, Audit log.
- **FR-X2** Merchant actions: approve, reject (with a note), suspend (pauses their live events), reactivate, and set commission %.
- **FR-X3** Every state-changing action writes an audit entry (actor, role, action, target, meta). The log keeps the latest 2 000 entries.

## 5. Non-functional requirements

| Area | Requirement |
|---|---|
| Security | See [RULES.md](RULES.md). Cards stay on hosted checkout (PCI-DSS scope reduction), gateway secrets use AES-256-GCM, passwords use scrypt, and every payment is validated server to server |
| Compliance | Settle in BDT. Follow Bangladesh Bank PSO/PSP guidance for payment aggregation and merchant KYC, and keep payment and KYC data stored in-country. Get legal sign-off before go-live |
| Privacy | Customer phone/email and merchant KYC and bank details are personal data. Collect the minimum, restrict access by role, and define retention |
| Availability | The API is stateless apart from the data store. Horizontal scale requires the Phase 2 data layer |
| Performance | Availability p95 < 300 ms for venues up to about 40 000 seats. Seat map rendered as SVG on the client |
| Accessibility | Keyboard-navigable seat blocks (`focus-visible`), `prefers-reduced-motion` honoured, readable text colour chosen for every brand colour |
| Localisation | English UI, amounts in BDT (`৳`), BD mobile number format |
| Portability | The same business core runs on the server and in the browser (offline demo) |

## 6. Success metrics

- Checkout conversion (hold → paid) ≥ 60 %
- Payment validation mismatch rate < 0.1 %
- Merchant time from signup to first published event < 1 day (with auto-approve off)
- Zero double-sold seats
- Gate scan decision < 500 ms

## 7. Open questions

1. Payout cadence and reconciliation source for platform-collected funds (weekly is assumed).
2. Which SMS provider handles OTP and ticket delivery?
3. KYC document retention period and who may view the documents.
4. Should a convenience fee apply to POS sales in future?
5. Legal review of the merchant agreement and refund policy against Bangladesh Bank and consumer-rights rules.
