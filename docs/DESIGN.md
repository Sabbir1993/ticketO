# Ticketo — Design

Covers the visual system, UI structure, and the venue/layout design model.

## 1. Brand & theme

The default is the SSL Wireless palette. It is white-label at runtime from **Admin → Branding & theme**.

| Token | Default | Use |
|---|---|---|
| `primary` → `--brand-50…900` | `#2D499A` sapphire | Primary actions, links, focus rings, eyebrows |
| `accent` → `--accent-50…900` | `#EE3240` red | Highlights, offers, urgency (hold timer, sold-out) |
| `dark` → `--dark` | `#0F172A` slate | Dark surfaces, footer |
| `ink-50…900` | Slate greys (fixed) | Text, borders, table headers |
| `radius` → `--radius` | `12px` | Buttons use `radius − 2`, cards `radius + 4` |
| Font | Inter, then the system stack | All text |

How it works:

1. `lib/theme.js#colorScale(hex)` generates the tints (50–400) and shades (600–900) from the 500 colour.
2. `applyTheme(branding)` writes them as `R G B` triples on `:root`.
3. Tailwind reads `rgb(var(--brand-500) / <alpha-value>)`, so opacity utilities keep working.
4. `onColor(hex)` picks `#0F172A` or `#FFFFFF` for readable text on any brand colour.
5. The document title and `<meta name="theme-color">` follow the branding.

## 2. Component classes (`client/src/index.css`)

| Class | Purpose |
|---|---|
| `.container-x` | Page width 1240 px, 16 px gutter on mobile and 24 px on md+ |
| `.btn`, `.btn-primary`, `.btn-dark`, `.btn-outline`, `.btn-ghost` | Buttons |
| `.chip`, `.chip-on` | Filters and toggles |
| `.card` | Bordered surface |
| `.input`, `.label` | Form fields: 44 px tall, brand focus ring |
| `.badge`, `.eyebrow` | Status pills and section kickers |
| `.th`, `.td` | Admin and merchant tables |
| `.print-area`, `.no-print` | 80 mm thermal POS receipt printing |
| `.vm-block` | Venue map block hover/focus state |

Shadows are `shadow-card` (resting) and `shadow-pop` (modals, popovers). The motion is `animate-fadein` (250 ms), and `prefers-reduced-motion` turns animation off.

**Rule:** use these classes and the `brand`/`accent`/`ink` colours. Don't hard-code hex values in components, or runtime branding stops working.

## 3. Information architecture

```
SiteLayout (Header + Footer)
  /                      Home (config-driven sections)
  /explore               Search + filters
  /events/:slug          Event detail
  /events/:slug/showtimes
  /checkout/:holdId      Contact, promo, summary, hold timer
  /payment/:orderId      Method picker → gateway redirect
  /booking/:id           Tickets (QR, PDF), cancel / transfer
  /login /profile /offers /help
  /partner/login /merchant/register
SiteLayout (no footer)
  /book/:showId          Seat selection (full-height)
BareLayout
  /pay/simulate/:orderId Sandbox payment page
  /merchant/*            PortalShell: Dashboard · My events · Create event · Orders & refunds
                         · Settlement · Payment gateway · Business & KYC
  /admin/*               PortalShell: Overview · Merchants & KYC · Events · Orders & refunds
                         · Categories → views · Venue layouts · Venues · Payment gateways
                         · Promo codes · Platform rules · Branding & theme · Home page · Audit log
  /pos  /gate            Operator screens (touch-first)
```

Shared components live in `client/src/components/`. They include `Header`, `Footer`, `EventCard`, `Poster`, `Carousel`, `Row`, `Modal`, `SearchModal`, `CityModal`, `OrderSummary`, `HoldTimer`, `QR`, `BarChart`, `States` (loading, empty, error) and `Toasts`.

## 4. Key flows (UX)

### Customer booking

```
Event page ─► Showtimes ─► /book/:showId
   VenueMap (overview: blocks coloured by tier, sold-out greyed)
     └─ click seated block ─► zoomed SeatGrid (pick seats)   | GA block ─► qty stepper
   Sticky summary: seats, subtotal, "Proceed" ─► createHold
─► /checkout/:holdId   HoldTimer counts down holdMinutes; promo applies via quote
─► /payment/:orderId   choose method ─► redirect to gateway
─► /booking/:id?new=1  success state, QR per ticket, PDF download
```

Error states to design for:

- seat taken (409): refresh the map and keep the other selections;
- hold expired: return the customer to seat selection;
- gateway failed (`/payment/:id?failed=`): show the reason and let them retry with another method.

### Merchant onboarding

A stepper runs through **Account → Business → KYC documents → Settlement → Payment gateway → Review**. Completed steps show a green tick and can be revisited. The last step submits the application.

### Gate

Show a full-screen result colour for each scan outcome:

| Result | Colour |
|---|---|
| `valid` | green |
| `duplicate` | amber |
| `void` / `invalid` / `wrong_event` | red |

Also show the ticket label, tier and scan time.

## 5. Venue layout design model

A layout is `{ id, name, viewType, spec, ownerId? }`. The `spec` holds:

```json
{
  "viewBox": [1000, 760],
  "field":  { "type": "oval|round|pitch|court|ring|stage|screen|none", "cx": 500, "cy": 380, "rx": 270, "ry": 208 },
  "tiers":  [{ "id": "vip", "name": "VIP", "color": "#7c3aed" }],
  "blocks": [{
    "id": "VIP", "name": "VIP Pavilion", "tier": "vip", "sell": "seated|ga|none",
    "rows": 6, "rowStart": 0, "rowLabels": ["A","B"], "seatsPerRow": 20,
    "rowSeats": { "A": 18 }, "aisles": [4, 12], "removed": ["A1"], "capacity": 500,
    "shape": { "type": "rect|arc|polygon|circle", "rotate": 0, "front": "top" }
  }],
  "facilities": []
}
```

### Validation (`validateSpec`)

- Tier IDs and block IDs must be unique.
- `sell` must be `seated`, `ga` or `none`.
- A sellable block must reference an existing tier.
- A seated block needs at least one seat, and a GA block needs a capacity above 0.
- A polygon needs at least 3 points.

### View types

| View type | Kind | Typical use |
|---|---|---|
| `stadium-cricket` | map | Oval ground, pavilion/club/grand/gallery rings |
| `stadium-football` | map | Rectangular pitch, 4 stands and corners |
| `hall` | rows | Auditorium with optional balcony |
| `cinema` | rows | Screen at the bottom, premium/regular rows |
| `open-field` | map | Stage and standing zones |
| `ga-list` | list | Quantities only (seminars, runs, webinars) |

### Rendering rules

- If every sellable block has a `shape`, show the SVG **map** and zoom into a block to see its seats. Otherwise fall back to a **row plan**.
- Seat positions come from `seatPositions(block, spec)` in `shared/geometry.js`. The designer preview, customer map, inventory and ticket labels all use this one function.
- A block's colour is its tier colour. Disabled and `none` blocks are neutral grey (`#94a3b8`).

### Layout designer (`LayoutDesigner.jsx`)

| Input | Action |
|---|---|
| `V` | Select or move. Arcs rotate around the field; hold Shift to translate |
| `R` / `C` / `P` / `F` | Draw a rect section, circle/table, polygon GA zone, or facility |
| `Delete` | Delete the selection |
| `Ctrl+D` | Duplicate |
| Arrow keys | Nudge (hold Shift for 10 px steps) |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Undo / redo |
| Generate | Stadium rings, hall or cinema with balcony, zone grid |
| Seats toggle | Preview exactly what customers will see |
| JSON tab | Edit the spec directly (still validated on save) |

Merchant customisations are saved as `event.customSpec`, which overrides the template for that event only. A merchant can also save the layout as a private template (`tpl-m-*`). Merchants never overwrite platform templates; saving one creates a copy.

## 6. Accessibility checklist

- Seat blocks and seats are focusable, with a `focus-visible` style.
- Colour is never the only signal. Sold and selected seats also differ in shape or icon, and tiers are listed in a legend with their price.
- Text contrast is at least 4.5:1; use `onColor` for text on brand fills.
- Touch targets are at least 44 px (`.input`, POS and gate buttons).
- The hold timer is announced to screen readers when it has less than 1 minute left.
