# Ticketo — multi-merchant event ticketing (React + Node.js)

A BookMyShow-style ticketing platform for Bangladesh, built on the BRD and SRS.

- **Category-driven booking views.** Cricket shows an oval stadium, football a rectangular stadium, theatre a hall seat plan, concerts an open ground, seminars a ticket list.
- **Merchant self-onboarding.** Anyone can sign up as a merchant, submit KYC, connect their own payment gateway, design an event and publish it.
- **Direct payment gateway.** SSLCOMMERZ v4 (cards, bKash, Nagad, internet banking) and bKash Tokenized Checkout. Every payment is re-validated server to server.
- **Fully dynamic, unique venues.** A visual **Layout designer** lets you draw any venue: stands, ring segments, rotated sections, round tables and free-form standing zones. You can also set seats row by row, add aisles and remove seats, and add facilities. Generators create stadiums (oval, circle, arena, open-end), halls and cinemas, and zone grids. Customers pick a block and then zoom into a live seat map.
- **Per-event layouts.** A merchant can customise the layout for a single event, or save it as their own reusable layout.
- **SSL Wireless theme, configurable at runtime.** The theme uses sapphire `#2D499A`, red `#EE3240` and slate `#0F172A` with Inter. Admin → Branding changes the name, tagline, colours and corner radius, and the 50–900 shades are generated automatically.
- **Config-driven home page.** Admin → Home page lets you reorder, hide or add sections: banners, event rows (filtered by category and sorted by date, rating, price or votes), category tiles and CTA strips. A live preview is included.
- **Everything is configurable from the admin console.** Category → view mapping, venue layouts, fees, approval rules, gateway credentials and payment-method routing.

```
ticketo/
├─ shared/          one business core, used by the server AND the browser demo
│  ├─ core.js       events, inventory, seat holds, pricing, orders, refunds, merchants, admin
│  ├─ geometry.js   shape maths + seat positions (rect/arc/polygon/circle, rowSeats, aisles, removed)
│  ├─ templates.js  view types + seed layouts (stadiums, arena, halls, grounds)
│  ├─ routes.js     REST route table (the server registers it; the client calls it)
│  └─ seed.js       demo data + default configuration
├─ server/          Node.js / Express API
│  └─ src/gateways/ sslcommerz.js · bkash.js
└─ client/          React 19 + Vite + React Router + Tailwind
   ├─ src/lib/theme.js       runtime theme (CSS variables from Admin → Branding)
   └─ src/components/venue/  VenueMap (SVG + seat zoom) · LayoutDesigner · SeatGrid · BookingView
```

## Run it

Needs Node.js 20 or newer.

```bash
npm run install:all      # installs server + client
npm run dev              # API on :4000 + React app on :5173
```

Open http://localhost:5173. The database (`server/data/db.json`) is seeded on first start. Run `npm run seed` to reset it and refresh the demo dates.

**Production:** `npm run build`, then `npm start`. Express serves the built React app and the API on one port. Set `SERVER_URL` and `CLIENT_URL` to your public URL.

**Offline / no server:** `npm run dev --prefix client -- --mode local` runs the same core inside the browser. `npm run preview:single` builds a single `client/dist-single/index.html`.

### Demo logins

| Role | Login |
|---|---|
| Customer | any BD mobile, OTP `123456` |
| Merchant with its own gateway | `pulse@ticketo.demo` / `merchant123` |
| Merchant (sports: cricket + football) | `sports@ticketo.demo` / `merchant123` |
| Platform admin | `admin@ticketo.com.bd` / `admin123` |
| Sandbox payment page (fallback) | wallet OTP `123456` |

## How the category → view mapping works

`Admin → Categories → views` sets a view type and a default layout template for every category and sub-category.

| Category | View | Default template |
|---|---|---|
| Sports → Cricket | `stadium-cricket` | Cricket Oval — 2 tier, 18 blocks (VIP pavilion, club houses, grand stands, galleries) |
| Sports → Football | `stadium-football` | Football Stadium — 4 stands + corners (VIP box, terraces, away fans) |
| Sports → Running | `ga-list` | Run categories |
| Concerts → Open air / Fairs | `open-field` | Open ground (stage, fan pit, VIP decks, GA, lounge) |
| Concerts → Indoor, Theater | `hall` | National Theatre Hall (ground + balcony) |
| Movies | `cinema` | Cinema, 11 rows |
| Seminars, Webinars, Comedy | `ga-list` | Passes / registrations |

### Layout designer (Admin → Venue layouts, Merchant → Event → Venue & layout)

| Tool | What it does |
|---|---|
| V select / move | drag blocks; ring segments rotate around the field (hold Shift to move); handles resize rectangles, circles, arc ends and depth, and polygon points |
| R / C / P / F | draw a seated section / round zone or table / free-form standing zone (click points, Enter to close) / facility |
| Keyboard | Delete, Ctrl+D duplicate, arrows nudge (Shift = 10), Ctrl+Z / Ctrl+Shift+Z |
| Item panel | id, name, tier, seated/GA/display-only, rows, first row, seats per row, **per-row seat counts** (curved sections), aisles, removed seats, rotation, which side row A faces |
| Canvas | size, background, field type (`oval` `round` `pitch` `court` `ring` `stage` `screen` `none`), facilities |
| Generate | stadium rings (any number, seated or GA, gaps, open end for concerts), hall / cinema sections with balcony, zone grids |
| Seats toggle | previews every seat exactly as customers will see it |

The seat map is computed from geometry (`shared/geometry.js`), so booking, inventory and QR tickets always match the drawing. If every sellable block has a shape, the booking page shows the map; clicking a seated block zooms into its seats. Layouts without shapes fall back to a hall row plan.

### Layout JSON

The designer writes plain JSON, stored in the database. Advanced users can edit it directly in the JSON tab:

```json
{
  "id": "tpl-my-stadium", "name": "My Stadium", "viewType": "stadium-cricket",
  "spec": {
    "viewBox": [1000, 760],
    "field": { "type": "oval", "cx": 500, "cy": 380, "rx": 270, "ry": 208 },
    "tiers":  [{ "id": "vip", "name": "VIP", "color": "#7c3aed" }],
    "blocks": [{ "id": "VIP", "name": "VIP Pavilion", "tier": "vip", "sell": "seated", "rows": 6, "seatsPerRow": 20,
                 "shape": { "type": "arc", "cx": 500, "cy": 380, "rx1": 300, "ry1": 232, "rx2": 378, "ry2": 292, "a0": -104, "a1": -76 } }]
  }
}
```

- **`sell`** can be `seated` (numbered seat map), `ga` (quantity with a `capacity`) or `none` (shown but not sold).
- **Shapes:** `rect` (with `rotate` and `front`), `arc` (an elliptical ring segment), `polygon` and `circle`.
- **Seats:** `rows` or `rowLabels`, `seatsPerRow`, `rowSeats: { "A": 18 }`, `aisles: [4, 12]`, `removed: ["A1"]`.
- **Events:** an event may carry `customSpec`, its own layout, which overrides the template. Merchants can also save layouts as their own (`ownerId`), visible only to them and the admin.

Merchants choose a template for each event and then:

- set prices per tier, with an optional early-bird price and a per-order limit;
- switch blocks on or off, and change GA capacities;
- add show dates and a sales window;
- set policies (cancellation, refund, transfer) and promo codes.

## Merchant onboarding

1. **Sign up** at `/merchant/register` in six steps: account, business, KYC documents, settlement account, payment gateway, agreement.
2. **Choose how customers pay:**
   - **Ticketo collects:** payments go into the platform's SSLCOMMERZ store and the merchant gets weekly payouts minus commission.
   - **Connect my own gateway:** the merchant's SSLCOMMERZ Store ID and password (and optional bKash tokenized credentials) are stored encrypted with AES-256-GCM. Money settles directly to the merchant, and Ticketo tracks the commission owed (Settlement page).
3. **Admin review:** `Admin → Merchants & KYC` approves or rejects KYC and sets the commission. Turn on `Platform rules → Auto-approve` to skip review.
4. **Publish:** requires an active merchant, plus a verified gateway if the merchant is in direct mode (`Settings → Payment gateway → Test connection`). If `Review events before they go live` is on, publishing puts the event in the admin queue.

## Payment flow (direct gateway integration)

```
customer selects seats ─► POST /api/holds           (seats locked for N minutes)
                        ─► POST /api/orders          (contact, promo, pricing)
                        ─► POST /api/orders/:id/pay  → SSLCOMMERZ session (merchant's or platform's store)
       customer pays on the gateway page (card / bKash / Nagad / net banking)
SSLCOMMERZ ─► POST /api/pg/sslcommerz/success/:orderId
          server ─► Validation API (val_id) → checks status, tran_id, amount, currency
          ─► order paid, QR tickets issued ─► redirect /booking/:id
IPN (optional, needs a public URL) ─► /api/pg/sslcommerz/ipn   (idempotent)
```

- bKash direct uses `/api/pg/bkash/callback/:orderId`, then **execute payment**.
- Refunds approved in the admin console (or by the merchant) call the SSLCOMMERZ refund API, or bKash refund.
- In `Admin → Payment gateways` you can route each checkout method to SSLCOMMERZ or bKash direct, and set `multi_card_name` so the right channel opens first.
- The **sandbox simulator** is a fallback for when a gateway can't be reached, for example offline development. Keep `PG_FALLBACK_SIMULATOR=false` in production and switch it off in the admin console.

Sandbox credentials in `.env`: SSLCOMMERZ `testbox` / `qwerty`. Replace them with your live store.

## API

All routes are listed in `shared/routes.js`, for example:

- `GET /api/events`, `GET /api/shows/:id/availability`, `POST /api/holds`, `POST /api/orders`, `POST /api/orders/:id/pay`
- `POST /api/merchants/register`, `PUT /api/merchant/payment-settings`, `POST /api/merchant/events`, `POST /api/merchant/events/:id/publish`
- `PUT /api/admin/config/:section` (platform, branding, home, …), `PUT /api/templates` (admin or merchant), `POST /api/admin/merchants/:id/review`
- `POST /api/gate/scan`, `POST /api/pos/sales`

Authentication: `Authorization: Bearer <token>`. Access rules come from the same table.

## Production checklist

- **Database:** swap the JSON file store (`server/src/db.js`) for PostgreSQL (SRS §4). The core only needs the collections in `seed.js`.
- **Concurrency:** move seat holds to Redis with a TTL, and use row-level locks when confirming seats.
- **Secrets & network:** set a long `APP_SECRET`, serve over HTTPS, and expose IPN on a public URL.
- **Messaging:** connect an SMS/OTP provider (implement `deps.sendOtp`) and email delivery.
- **Hardening:** add rate limiting (OTP, login), store KYC documents in object storage, and sign QR payloads (HMAC) for offline gate validation.
