# TrackFlow — Deployment & App Store Status

**Date:** 2025-02-25  
**Task:** [TRACKFLOW] Deploy, create accounts, submit to App Store  
**Deadline:** Today

---

## ✅ DONE (Completed by Luca)

### 1. GitHub Repository
- **Repo:** https://github.com/rampaico/trackflow
- **Status:** ✅ Up to date — all commits pushed including screenshots + shopify.app.toml
- **Note:** The `trackflow-app` GitHub org does not exist. The repo lives under `rampaico`. Creating a GitHub org requires browser/manual action (see MANUAL STEPS below).

### 2. Railway Deployment
- **URL:** https://trackflow-production-0d42.up.railway.app
- **Status:** ✅ Live, returning 200
- **Env vars set:** DATABASE_URL, SHOPIFY_API_KEY, SHOPIFY_API_SECRET, SHOPIFY_APP_URL, SCOPES, NODE_ENV
- **Database:** PostgreSQL on Railway (internal connection)

### 3. Shopify Partners Account
- **Email:** sienna.ramp@gmail.com
- **Status:** ✅ Account EXISTS — confirmed via Shopify CLI (`shopify app info` shows `sienna.ramp@gmail.com`)
- **Partners Org:** TrackFlow (ID: 207621385)
- **App:** TrackFlow (ID: 327549878273)
- **Client ID:** fb2e56b0055fc93aee7ade7973a70a52

### 4. App Configured in Partners Dashboard
- **Status:** ✅ App version `trackflow-5` deployed and RELEASED via `shopify app deploy`
- **Application URL:** https://trackflow-production-0d42.up.railway.app
- **Redirect URLs:** https://trackflow-production-0d42.up.railway.app/api/auth
- **Scopes:** read_orders, write_orders
- **GDPR webhooks:** app/uninstalled configured
- **Source control URL:** https://github.com/rampaico/trackflow
- **Partners dashboard:** https://dev.shopify.com/dashboard/207621385/apps/327549878273

### 5. Dev Store
- **Store:** trackflow-testing.myshopify.com
- **Status:** ✅ Confirmed active (returns 200/302 redirect)

### 6. App Store Listing Copy
- **Status:** ✅ Written — see `.planning/APP_STORE_LISTING.md`
- Includes: app name, tagline, short desc, long desc, pricing, features, keywords, screenshots guide
- Screenshots are at: `~/Desktop/trackflow/screenshots/` (4 PNG files)

---

## ⏳ MANUAL STEPS REQUIRED (Simon or Sienna)

### A. Test on Dev Store (30 min)
The app needs to be tested on `trackflow-testing.myshopify.com` before App Store submission.

1. Go to https://dev.shopify.com/dashboard/207621385/apps/327549878273
2. Click **"Test on development store"**
3. Select `trackflow-testing.myshopify.com`
4. Test the CSV import flow with a sample CSV
5. Verify order fulfillment and customer notification triggers

**Sample test CSV:**
```csv
order_number,tracking_number,carrier
#1001,1Z999AA10123456784,UPS
#1002,9400111899223397000830,USPS
```

### B. Create GitHub Org `trackflow-app` (5 min, optional)
The task specified pushing to `trackflow-app` org, but GitHub org creation requires a browser.

1. Go to https://github.com/organizations/plan
2. Create org named `trackflow-app` 
3. Transfer or fork `rampaico/trackflow` → `trackflow-app/trackflow`
4. Update `shopify.app.toml` source-control-url

**Note:** This is optional cosmetic — the app works fine under `rampaico/trackflow`.

### C. Submit to Shopify App Store (2-4 hours + review wait)

Go to the Partners dashboard and fill in the App Store listing:
**URL:** https://dev.shopify.com/dashboard/207621385/apps/327549878273/distribution

Required fields:
1. **App name:** TrackFlow — Bulk CSV Tracking Import
2. **Tagline:** Bulk-fulfill orders with tracking numbers by uploading a single CSV file.
3. **Short description:** (from `APP_STORE_LISTING.md`)
4. **Long description:** (from `APP_STORE_LISTING.md`)
5. **App icon:** Need to create — 1200×1200 PNG, teal (#00A693) box/checkmark icon
6. **Screenshots:** Upload the 4 PNGs from `~/Desktop/trackflow/screenshots/`
7. **Category:** Orders and Shipping
8. **Support email:** sienna.ramp@gmail.com
9. **Privacy policy URL:** https://trackflow-production-0d42.up.railway.app/privacy
10. **Pricing:** Free + $19/mo Pro (already configured in-app via Shopify subscriptions)

**App icon design note:** The screenshots exist as PNG files but the app icon needs to be created. Use Canva or similar — teal background, white package/box icon.

---

## 🚧 KNOWN ISSUES / WATCH OUT

1. **Local .env has wrong API secret** — The `.env` has an old `shpss_` format secret. The production Railway env uses the correct secret. For local dev, run `shopify app dev` which will update the `.env` automatically via the tunnel.

2. **Import is synchronous** — For very large CSVs (500+ rows), the request may time out in Railway. Acceptable for MVP but needs a background queue for scale.

3. **No app icon yet** — The App Store submission will be blocked until a 1200×1200 PNG icon is created.

---

## 📊 DEPLOYMENT CHECKLIST

| Item | Status |
|------|--------|
| Code on GitHub | ✅ rampaico/trackflow |
| Railway deployed | ✅ Live at trackflow-production-0d42.up.railway.app |
| Database migrations run | ✅ (startup command: `npm run setup && npm start`) |
| Shopify Partners account | ✅ sienna.ramp@gmail.com |
| App in Partners dashboard | ✅ App ID 327549878273 |
| App version deployed | ✅ trackflow-5 released |
| Dev store available | ✅ trackflow-testing.myshopify.com |
| Privacy policy live | ✅ /privacy returns 200 |
| GDPR webhooks configured | ✅ app/uninstalled + GDPR handlers |
| App Store listing copy | ✅ Written in APP_STORE_LISTING.md |
| Screenshots | ✅ 4 PNGs in screenshots/ |
| App icon | ❌ Need to create (1200×1200 PNG) |
| Tested on dev store | ❌ Manual — Simon/Sienna |
| App Store submitted | ❌ Manual — Simon/Sienna |
