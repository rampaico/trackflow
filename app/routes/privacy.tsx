/**
 * privacy.tsx — Privacy policy (required for Shopify App Store submission)
 */
import type { LoaderFunctionArgs } from "@remix-run/node";

export const loader = async (_: LoaderFunctionArgs) => {
  return new Response(PRIVACY_POLICY_HTML, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
};

const PRIVACY_POLICY_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Privacy Policy — TrackFlow</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; max-width: 800px; margin: 0 auto; padding: 40px 20px; color: #333; line-height: 1.6; }
    h1 { color: #00A693; }
    h2 { margin-top: 32px; }
  </style>
</head>
<body>
  <h1>Privacy Policy</h1>
  <p><strong>Last updated:</strong> ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</p>

  <p>
    TrackFlow ("we", "our", or "us") is a Shopify application that helps merchants
    bulk-import tracking numbers to their orders. This Privacy Policy explains what
    data we collect, how we use it, and your rights.
  </p>

  <h2>Data We Collect</h2>
  <ul>
    <li><strong>Store information:</strong> Your Shopify store domain and access token (required for API access).</li>
    <li><strong>Import data:</strong> Order numbers, tracking numbers, and carrier names that you upload via CSV.</li>
    <li><strong>Usage data:</strong> Number of imports per billing cycle for plan enforcement.</li>
  </ul>

  <h2>How We Use Your Data</h2>
  <ul>
    <li>To authenticate your store and call the Shopify Admin API on your behalf.</li>
    <li>To create fulfillments with tracking info on your orders.</li>
    <li>To enforce plan limits and manage billing.</li>
  </ul>

  <h2>Data Sharing</h2>
  <p>
    We do not sell or share your data with third parties except as required to operate the app
    (e.g., Shopify's own APIs, our database provider).
  </p>

  <h2>Data Retention</h2>
  <p>
    Import job records are retained for 90 days after creation, then automatically deleted.
    Store session data is deleted upon app uninstallation.
  </p>

  <h2>GDPR & Your Rights</h2>
  <p>
    If you are located in the EU/EEA, you have the right to access, correct, or delete your data.
    Contact us at privacy@trackflow.app for any requests.
  </p>
  <p>
    We comply with Shopify's mandatory GDPR webhooks: customer data requests, customer redact,
    and shop redact are all handled.
  </p>

  <h2>Security</h2>
  <p>
    Access tokens are stored encrypted. All data is transmitted over HTTPS. We follow
    Shopify's security best practices.
  </p>

  <h2>Contact</h2>
  <p>
    Email: <a href="mailto:privacy@trackflow.app">privacy@trackflow.app</a>
  </p>
</body>
</html>`;
