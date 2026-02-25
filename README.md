# TrackFlow — Bulk CSV Tracking Import for Shopify

> Bulk tracking made simple.

TrackFlow lets Shopify merchants upload a CSV of tracking numbers and bulk-fulfill orders in seconds. No more copy-pasting tracking numbers one by one.

## Features

- 📦 **Bulk import** — upload any CSV, map columns, done
- 🔍 **Auto carrier detection** — detects UPS, FedEx, USPS, DHL, Amazon + 8 more from tracking number patterns
- 📧 **Customer notifications** — Shopify sends tracking emails automatically
- 📊 **Import history** — full audit log with per-row success/failure
- 💳 **Billing** — Free (50 orders/month) + Pro ($19/mo unlimited)

## Tech Stack

| Layer | Tech |
|-------|------|
| Framework | Remix (Shopify App Remix) |
| UI | Shopify Polaris |
| Database | PostgreSQL + Prisma |
| Auth | Shopify OAuth (session-storage-prisma) |
| Billing | Shopify App Subscriptions |

## Setup

```bash
# 1. Clone and install
cd trackflow
npm install

# 2. Configure environment
cp .env.example .env
# Fill in SHOPIFY_API_KEY, SHOPIFY_API_SECRET, DATABASE_URL

# 3. Run migrations
npx prisma migrate dev

# 4. Start dev server
npm run dev
```

## Environment Variables

```env
SHOPIFY_API_KEY=your_api_key
SHOPIFY_API_SECRET=your_api_secret
SHOPIFY_APP_URL=https://your-tunnel.trycloudflare.com
SCOPES=read_orders,write_orders
DATABASE_URL=postgresql://...
```

## CSV Format

TrackFlow accepts any CSV with these columns (column names are auto-detected):

| Column | Required | Example |
|--------|----------|---------|
| Order number | ✅ | `#1001` or `1001` |
| Tracking number | ✅ | `1Z999AA10123456784` |
| Carrier | Optional | `UPS` (auto-detected if missing) |

## Supported Carriers

- UPS
- FedEx
- USPS
- DHL Express
- DHL eCommerce
- OnTrac
- LaserShip
- Canada Post
- Royal Mail (UK)
- Australia Post
- Amazon Logistics

## Running Tests

```bash
npm test
```

33 unit tests covering carrier detection and column mapping.

## App Store Submission Checklist

- [x] OAuth + session storage
- [x] GDPR webhooks (customers/data_request, customers/redact, shop/redact)
- [x] App uninstalled webhook
- [x] Privacy policy route (/privacy)
- [x] Billing (Shopify App Subscriptions)
- [x] Embedded app (Polaris + App Bridge)
- [x] Required scopes: `read_orders`, `write_orders`

## Team

Built by the TrackFlow team.
