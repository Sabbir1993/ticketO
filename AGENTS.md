# AGENTS.md

## Overview

Ticketo is a multi-merchant event-ticketing platform for Bangladesh. It is a Node.js/Express API with a React 19 frontend built by Vite, plus a shared JavaScript business core used by both server and browser demo modes. Payment integrations include SSLCOMMERZ and bKash.

Node.js 20 or newer is required. The repository uses ES modules (`"type": "module"`).

## Commands

Run these from the repository root:

- Install dependencies: `npm run install:all`
- Start development: `npm run dev` (API on port 4000 and Vite app on port 5173)
- Build the client: `npm run build`
- Start production server: `npm start`
- Reset/seed demo data: `npm run seed`
- Build the standalone client: `npm run preview:single`
- Run the client in offline/browser-local mode: `npm run dev --prefix client -- --mode local`

The root and server manifests do not define lint or test scripts, and no test runner or CI configuration is present. There is consequently no repository-defined lint, test, or single-test command.

## Architecture

- `shared/` contains the business core and contracts shared by server and browser mode: domain operations in `core.js`, venue geometry in `geometry.js`, layout templates in `templates.js`, REST route definitions in `routes.js`, and demo/default data in `seed.js`.
- `server/src/index.js` is the Express API entry point. `db.js` persists the JSON-backed database, `env.js` handles environment configuration, and `security.js` handles authentication/encryption concerns. Gateway adapters live under `server/src/gateways/`.
- `client/src/main.jsx` boots the React app and `App.jsx` defines the application shell/routes. Pages are grouped by customer, merchant, admin, and operations roles. `client/src/lib/api.js` calls the API, while `store.jsx` and `theme.js` provide client state and runtime branding.
- Venue booking/design flows are implemented by `client/src/components/venue/` and use the geometry/layout data from `shared/`. The server serves the built client in production; Vite serves it separately during development.
- Typical booking flow: the client requests seat holds, creates an order, starts payment, then the server validates gateway callbacks/IPN before marking the order paid and issuing tickets.

## Conventions & gotchas

- Keep shared code browser-compatible: files under `shared/` are imported by both Node.js and the React client.
- Install dependencies in both packages with `npm run install:all`; root scripts delegate to `server` or `client` using `--prefix`.
- Local server configuration is copied from `server/.env.example` to `server/.env`. Important settings include `PORT`, `SERVER_URL`, `CLIENT_URL`, `APP_SECRET`, `DATA_FILE`, `IPN_BASE_URL`, and `PG_FALLBACK_SIMULATOR`. Use [PLACEHOLDER] for credentials and secrets; do not commit `.env`.
- The default development database is `server/data/db.json`, which is generated/seeded on first start and ignored by git. `npm run seed` resets demo data and refreshes demo dates.
- Payment callbacks require correct public URL settings in non-local environments. The IPN endpoint must be publicly reachable when IPN is used.
- The payment fallback simulator is intended for development/offline use only; disable it for production.
- Venue layouts are JSON-like data. Seat inventory, booking, and ticket output must stay consistent with the geometry in `shared/geometry.js`; custom event layouts can override templates.
- Production deployment still uses the JSON file store unless `server/src/db.js` is replaced. The README also calls out Redis/row locking for concurrent seat holds and HTTPS/strong secrets as production hardening concerns.
- Demo credentials and sandbox values are documented in `README.md`; do not copy credentials or secrets into new documentation or code.
