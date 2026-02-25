/**
 * billing.callback.tsx — Shopify billing confirmation callback
 */
import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { prisma } from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  // Update the merchant's plan in our DB after Shopify confirms billing
  await prisma.merchantUsage.upsert({
    where: { shop },
    create: {
      shop,
      plan: "PRO",
    },
    update: {
      plan: "PRO",
    },
  });

  return redirect("/app/billing");
};
