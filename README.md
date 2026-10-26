# Sari-Sari Store — Cloudflare Pages + D1

A store POS / inventory / utang (credit) tracker. Frontend is Vite + React;
data (inventory, transactions, utang, customers, settings) lives in a
Cloudflare D1 database and is served by Pages Functions under `/api/*`.

There are no real user accounts — just a single admin PIN (set in Settings)
and a read-only customer portal, same as before. The difference is that data
now lives in D1 instead of the browser's localStorage, so it's shared across
devices and won't disappear if someone clears their browser data.

## 1. Prerequisites

- Node.js 18+
- A Cloudflare account
- `npx wrangler login` (one-time browser login)

## 2. Install dependencies

```bash
npm install
```

## 3. Create the D1 database

```bash
npx wrangler d1 create isaiah-store-db
```

This prints something like:

```
[[d1_databases]]
binding = "DB"
database_name = "isaiah-store-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

Copy the `database_id` into `wrangler.toml` (replace
`REPLACE_WITH_YOUR_DATABASE_ID`).

## 4. Run the schema migration

```bash
# local dev database (used by `wrangler pages dev`)
npm run db:migrate:local

# the real, remote database (used once deployed)
npm run db:migrate:remote
```

### Existing database? Add the barcode column

If your database was created before barcode scanning was added, run this once:

```bash
npm run db:migrate:add-barcode:local
npm run db:migrate:add-barcode:remote
```

### Existing database? Add capital and profit on utang

Capital and profit on utang, and counting utang payments in the daily sales and profit, need two new columns. Run this once:

```bash
npm run db:migrate:add-utang-profit:remote
```

Then open Utang and tap **Auto-compute** to work out the capital of the utang you already have.

### Existing database? Add the categories list (add, rename, delete categories)

To add your own categories and rename or delete any of them, run this once (after the category column below):

```bash
npm run db:migrate:add-categories-table:remote
```

### Existing database? Add the product category column

Categories (Canned Goods, Drinks, Snacks...) are saved in the database. Run this once:

```bash
npm run db:migrate:add-category:remote
```

Then open Inventory and tap **Auto-sort** to sort the products you already have.

### Existing database? Add the store logo column

The logo picture (Settings > Store Logo) is saved in the database. Run this once:

```bash
npm run db:migrate:add-logo:remote
```

### Existing database? Add the new feature columns

Partial utang payments, per-item low-stock levels, expiry dates and favorites need a few new columns. Run this once:

```bash
npm run db:migrate:add-features:remote
```

### Make existing customer names ALL CAPS

New names are saved in capital letters automatically. To convert names you already have, run once:

```bash
npm run db:migrate:uppercase-names:remote
```

## 5. Try it locally

```bash
npm run pages:dev
```

This builds the frontend and serves it, together with the `/api/*`
functions and the local D1 database, at `http://localhost:8788`.

## 6. Deploy

```bash
npm run deploy
```

The first time you run this, Wrangler will create a Cloudflare Pages
project (accept the defaults, or name it e.g. `isaiah-store`) and give
you a `*.pages.dev` URL. The D1 binding from `wrangler.toml` is attached
automatically. Every subsequent `npm run deploy` publishes a new version
to the same project/URL.

If you'd rather connect the Pages project to a GitHub repo for automatic
deploys on push, that also works — just make sure the D1 binding is added
under the project's Settings → Functions → D1 database bindings in the
Cloudflare dashboard (bind it as `DB` to `isaiah-store-db`), since Git-based
deploys don't read `wrangler.toml` D1 bindings the same way `wrangler pages
deploy` does.

## Project structure

```
src/                         React frontend (Vite)
src/api.ts                   fetch client for /api/*
functions/api/[[path]].ts    all API routes, backed by D1 (env.DB)
schema.sql                   D1 table definitions
wrangler.toml                Pages project + D1 binding config
```

## API surface

| Method | Path                  | Purpose                                                      |
|--------|-----------------------|----------------------------------------------------------------|
| GET    | /api/state             | bootstrap: items, transactions, utangs, customers, settings   |
| POST   | /api/items              | add inventory item                                              |
| PATCH  | /api/items/:id          | edit item (qty/price/cost)                                      |
| POST   | /api/items/:id/stock    | stock in/out                                                      |
| DELETE | /api/items/:id          | delete item                                                        |
| POST   | /api/checkout            | POS checkout (cash or utang)                                       |
| POST   | /api/utangs               | add a utang record                                                   |
| POST   | /api/utangs/:id/pay       | mark utang paid                                                        |
| POST   | /api/customers              | register a utang customer                                                |
| DELETE | /api/customers/:name        | remove a customer                                                          |
| PUT    | /api/settings                 | save store settings / admin PIN                                             |
| POST   | /api/clear                      | wipe items/transactions/utangs/customers                                       |

## What's new in the app

- **Utang capital and profit:** the Utang screen shows Capital (puhunan) and Profit next to the totals, and under every record. A utang made from the POS knows its capital exactly. For utang you type in, the capital is worked out from the item names and your products' costs (you can type your own, or tap **Auto-compute** for old records).
- **Utang payments count as sales and profit:** when someone pays an utang, the money is added to that day's sales and profit (the profit part is the payment minus the capital it pays back). Unpaid utang is not counted until it is paid.
- **Mascot:** a hamster beside the Dashboard greeting whose eyes follow your mouse pointer (9 looking directions). It glances around by itself when nothing moves, bounces when you click it, and stays still if your device is set to reduce motion. The picture is `src/assets/hamster-sprite.webp`.
- **Dashboard:** redesigned. The fourth card is now **Monthly Profit** (this month so far, compared with the same days last month, and what is left after expenses). It also has trend lines on every card, a Performance chart (7 days / 30 days / this month), Top sellers, Sales by category, a Needs attention card (low stock, out of stock, expiring) and an Utang snapshot.
- **Categories:** every product can have a store-style category (Canned Goods, Drinks, Snacks, Noodles, Alcohol, Cigarettes, Toiletries, Household & Cleaning, Medicine and more, or your own). POS shows the categories as buttons, Inventory has a category filter, and **Auto-sort** guesses categories for products that have none. Tap **Categories** (POS or Inventory) to add a category, rename it (every product in it follows) or delete it.
- **Store logo:** Settings > Upload Logo puts your picture at the top-left of the app. Press Save Settings to keep it.
- **POS:** cash received with quick bills and automatic change, Undo for the last sale (15 minutes), favorites (star) and best sellers shown first, "Low" badges, and letter tiles for items without a photo.
- **Utang:** receive part of a payment, or pay a customer's whole balance (oldest records are paid first). Each payment shows in History.
- **Inventory:** a low-stock number per item (default 5), expiry dates with warnings, filters for Low stock and Expiring soon, a Shopping list you can tick off and copy, and a quantity per scan (+6, +12, +24...) in the scanner.
- **Phone:** bottom navigation bar, toasts instead of pop-up boxes, bigger text and tap targets, show/hide on PIN boxes.
- **Look:** light grey background with white cards (yellow header line), and a dark mode button in the header.
- **Install:** on a phone, use "Add to Home Screen" to install it like an app. It opens even without signal and shows the last saved data, but selling and saving need a connection.

## Barcode scanning

- **Inventory → Scan** opens the phone camera. Pick Stock In (+1) or Stock Out (−1), then scan products one after another. Each scan is saved like a normal stock change and shows in History.
- A barcode the app doesn't know offers **Add as a new item** or **link it to an item you already have**.
- **Add / Edit item** has a Barcode field with its own Scan button (or type the code).
- **POS → Scan** adds each scanned product to the cart.
- A handheld USB/Bluetooth scanner also works: type or scan into the search box (POS adds to cart on Enter), or into the field at the bottom of the scanner window.
- The camera only works on `https` pages (your `*.pages.dev` link is fine) and needs camera permission.

## Notes

- The admin PIN is stored and returned as plain text via `/api/state` —
  fine for a simple single-store shop app like this, but don't reuse it as
  a real password anywhere.
- The customer portal still remembers "which customer is this browser" and
  a self-set view-PIN in `localStorage` on that device — that's just a
  per-device convenience, not shared store data, so it wasn't moved to D1.
