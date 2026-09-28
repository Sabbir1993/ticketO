# Ticketo — Project Memory

Durable context for developers and AI agents: decisions, gotchas and "why". Read this before changing core flows. Add a dated entry whenever you learn something non-obvious.

## Decisions (why things are the way they are)

| # | Decision | Why |
|---|---|---|
| D1 | One pure-JS business core (`shared/core.js`) injected with `deps` | The same rules run in Express and in the browser (offline demo, single-file preview), so there is no rule drift between them |
| D2 | `shared/routes.js` defines every route and its roles | HTTP registration, client URL building and RBAC can't get out of sync |
| D3 | JSON file DB with an atomic `.tmp` + rename write | Zero-setup demo. `db.js` is the only seam for PostgreSQL later |
| D4 | Hosted checkout only (SSLCOMMERZ, bKash) | Keeps PCI-DSS scope minimal; the platform never touches card data |
| D5 | Server-side validation before `paid`, never trusting redirects | The browser success redirect can be forged; only the Validation API or execute result is trusted |
| D6 | Platform vs direct collection mode per merchant | Some organisers must settle to their own account; the platform then tracks commission receivable |
| D7 | Layouts are JSON specs, and seats are derived from geometry | Booking, inventory, designer preview and tickets always agree |
| D8 | Runtime theming through CSS variables | White-label without rebuilding |
| D9 | `demoFill` produces fake occupancy from a deterministic hash | Demo maps look realistic and stay stable between reloads |

## Gotchas

- **Windows dev start:** `scripts/dev.js` must use `fileURLToPath(new URL(...))`. `URL.pathname` gives `/D:/...`, which fails with `spawn cmd.exe ENOENT` (fixed 2026-09-27).
- **The simulator has two switches:**
  - the env var `PG_FALLBACK_SIMULATOR` controls fallback when a gateway call fails;
  - `config.payment.gateways.simulator.enabled` (seeded `true`) controls whether `POST /orders/:id/simulate` works at all.

  Production needs **both** off.
- The **seed runs only when `DATA_FILE` is missing.** `.env` gateway values are copied into the DB at seed time, so changing `.env` later does nothing until you run `npm run seed` (which wipes data) or edit the value in Admin → Payment gateways.
- **Masked secrets round-trip:** the UI sends `••••••••` back unchanged, and the core keeps the stored value. Never treat the mask as a real password.
- **Merchant saves of a platform template create a copy.** `saveTemplate` never lets a merchant overwrite a template they don't own.
- **Show IDs for recurring events are synthetic** (`evt~venue~YYYYMMDD~HHMM`). They only resolve while the date falls inside `schedule.days` from today.
- `getAvailability` is a GET but **mutates** (it purges holds), so the server saves after it. Keep it that way.
- A **refund approval deletes the hold**, which frees the seats. A refund rejection sets the order back to `paid`.
- **A transfer re-issues every ticket code.** Printed PDFs from before the transfer become invalid.
- `tranId = <orderId>-<attempt>`. The IPN falls back to parsing the order ID from `tran_id` when `value_a` is absent.
- The client DB key in local mode is `ticketo:db:v3`, and the seed needs `version: 2`. Bump both together if the seed shape changes.
- The Vite proxy only covers `/api`. Gateway redirects go to `CLIENT_URL`, which must be the Vite URL (`:5173`) in dev and the public URL in prod.
- IPN needs a public `IPN_BASE_URL` (a tunnel in dev). Without it no `ipn_url` is sent, and the app relies on the browser redirect.

## Known risks (open — tracked in PHASES.md Phase 1)

1. `POST /orders/:id/simulate` is public while the simulator is enabled, so anyone who knows an order ID can mark it paid.
2. `GET /orders/:id` and `GET /holds/:id` are public and return the customer's name, phone, email and ticket codes.
3. `POST /api/uploads` is unauthenticated.
4. CORS reflects any origin; there is no rate limiting; the OTP is the fixed demo code.
5. `APP_SECRET` silently falls back to a dev value.
6. Session tokens are stored in plaintext.
7. The JSON store and in-process holds are single-instance only.

## Conventions quick reference

- Add an API in `core.js`, then `routes.js`, then call `api.<name>()` on the client.
- Errors: `bad()` (400), `forbid()` (403), `missing()` (404), `ApiError(409, …, 'seat_taken')`.
- Audit action names are `NOUN_VERB` in upper snake case, such as `ORDER_PAID` or `EVENT_PUBLISHED`.
- ID prefixes:

  | Prefix | Entity |
  |---|---|
  | `M-` | merchant |
  | `U-` | staff user |
  | `CUS-` | customer |
  | `EV-` | event |
  | `HLD-` | hold |
  | `BKG-` | booking (order) |
  | `V-` | venue |
  | `F-` | file |
  | `tpl-` / `tpl-m-` | template (platform / merchant) |
  | `TKT-` | ticket |

- Secrets in docs and examples are always `[PLACEHOLDER]`. Demo logins live only in `README.md`.

## Log

- **2026-09-27:** Fixed the dev launcher on Windows. Created `docs/` (PRD, ARCHITECTURE, RULES, PHASES, DESIGN, MEMORY) from a full read of client, server and shared code.
