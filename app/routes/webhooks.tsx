/**
 * webhooks.tsx — Shopify mandatory GDPR webhooks + app/uninstalled
 */
import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { prisma } from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  switch (topic) {
    case "APP_UNINSTALLED":
      // Clean up merchant data on uninstall
      await prisma.merchantUsage.deleteMany({ where: { shop } });
      break;

    case "CUSTOMERS_DATA_REQUEST":
      // GDPR: Customer data request — log for compliance
      console.log(`[GDPR] Customer data request for shop ${shop}`, payload);
      break;

    case "CUSTOMERS_REDACT":
      // GDPR: Delete customer data — we don't store PII, no action needed
      console.log(`[GDPR] Customer redact request for shop ${shop}`, payload);
      break;

    case "SHOP_REDACT":
      // GDPR: Shop deletion — clean up all shop data
      await Promise.all([
        prisma.importJob.deleteMany({ where: { shop } }),
        prisma.merchantUsage.deleteMany({ where: { shop } }),
      ]);
      console.log(`[GDPR] Shop redact complete for ${shop}`);
      break;

    default:
      console.warn(`Unhandled webhook topic: ${topic}`);
  }

  return new Response(null, { status: 200 });
};
