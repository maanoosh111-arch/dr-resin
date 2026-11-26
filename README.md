# DR - Premium Resin Products

Full-stack e-commerce storefront and private Atelier/Chef management console built with **pure HTML5, CSS3, and Vanilla JavaScript (ES6+)** on the frontend (zero frontend frameworks, zero CSS frameworks, zero build steps) and a **pure Node.js + Express (`server.js`)** backend.

## Architecture & Directory Structure

```text
/
├── index.html                   # Customer Storefront (pure HTML5)
├── 999chef887/
│   └── index.html               # Private Chef/Admin Dashboard (pure HTML5)
├── css/
│   ├── style.css                # Complete Obsidian-Teal CSS3 design system & 80mm thermal print rules
│   └── admin.css                # Chef/Admin console CSS3 layouts & components
├── js/
│   ├── config.js                # Storefront defaults, asset URLs, status constants, optional API base URL
│   ├── utils.js                 # Safe DOM builder (`el`), USD formatting, WhatsApp links, Web Audio chime
│   ├── icons.js                 # Pure inline SVG icons (zero icon libraries)
│   ├── firebase.js              # Official Firebase v13.4.0 CDN ES module client & Firestore sync
│   ├── store.js                 # LocalStorage persistence for shopping bag & tracked order codes
│   ├── api.js                   # Fetch API client for /api/* and /api/chef/* endpoints
│   ├── storefront.js            # Customer Storefront controller (hero, 2/3/4 grid, carousel, checkout, My Orders)
│   └── chef.js                  # Private Chef/Admin controller (PIN auth, orders, archive, KPIs, hero text editor, thermal print)
├── assets/images/               # Local high-resolution workshop & commission imagery
├── server.js                    # Pure Node.js ES module Express server & Google Sheets sync
├── firebase-applet-config.json  # Firebase Web SDK configuration
├── firestore.rules              # Firestore security rules
├── .data/store.json             # Local atomic JSON persistence for orders, settings, PIN hash & KPI baseline
└── package.json                 # Node.js runtime dependencies (`express`, `dotenv`) & lint/start scripts
```

## Key Features Preserved

- **Customer Storefront (`/`)**:
  - Full-bleed showcase hero with live editable headline, eyebrow code, and subtitle managed from `/999chef887`.
  - Responsive catalog grid synced live from Google Sheets (`2` columns on mobile, `3` on tablet, `4` on desktop).
  - Multi-image product carousels (touch swipe, arrows, dots) with `object-fit: contain` full-size product imagery.
  - Product detail modal with deep-link URL routing (`/:slug` / `?product=...`) and shareable link copy.
  - Slide-over shopping bag & **Pay on Delivery** checkout drawer with automatic `ORD-XXXX` tracking codes and WhatsApp order confirmation.
  - **My Orders** modal with 4-second live polling, `BroadcastChannel` cross-tab sync, phone/code lookup, and rejection note display.
- **Private Chef / Admin Dashboard (`/999chef887`)**:
  - First-run Admin PIN setup or login with show/hide toggle and signed HttpOnly/Bearer session tokens.
  - Real-time order arrival toast & Web Audio synthesizer chime (unlockable/mutable).
  - **Active Orders**: status filters (`All`, `Pending`, `In Progress`, `Finished`, `Rejected`), 80mm thermal receipt printing, `Start Preparing`, `Confirm Finished & Delivered`, `Reject` (with mandatory reason), and `Archive Order`.
  - **Archived Orders**: multi-select checkboxes, `Delete Selected`, `Clear All Archive`, receipt print, and permanent delete confirmation modal.
  - **Sales & Profits**: `Today` / `Last 7 Days` / `Last 30 Days` periods, 5 KPI cards (from non-deleted `Finished` orders only), Completed Orders & Sold Products Log tables, and `Reset Analytics Baseline`.
  - **Store Settings & Catalog**: Store Open/Closed toggle, hours, delivery fee, announcement note, **Hero Section Text editor** (saved with dirty-state polling protection), live Google Sheets refresh, and optional Google Sign-In Cloud Sync to Firestore.

## Environment Variables

Configure these in `.env` (see `.env.example`):

- `PORT` (default `3000`)
- `GOOGLE_SPREADSHEET_ID` (defaults to the configured DR Resin Google Sheet)
- `SESSION_SECRET` (optional 16+ char HMAC secret for Chef sessions; auto-generated per boot if omitted)
- `CHEF_PIN` (optional; if omitted, the Chef sets an initial PIN via `/999chef887` on first launch)
- `SUPABASE_URL` & `SUPABASE_SERVICE_ROLE_KEY` (optional PostgREST persistence sync)

## Running Locally & Production Deployment

```bash
npm install
npm run start
```

- **Storefront**: `http://localhost:3000/`
- **Private Chef Console**: `http://localhost:3000/999chef887`
- **Static Frontend Hosting (Optional)**: Upload `index.html`, `999chef887/`, `css/`, `js/`, `assets/`, and `firebase-applet-config.json` to any static host, and set `window.DR_API_BASE_URL = 'https://your-backend-origin.com'` before loading `/js/storefront.js` and `/js/chef.js` if the Node.js API server runs on a separate origin.
