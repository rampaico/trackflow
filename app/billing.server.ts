/**
 * billing.server.ts — TrackFlow billing & usage tracking
 */
import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import { prisma } from "./db.server";

export const PLANS = {
  FREE: {
    name: "Free",
    ordersPerCycle: 50,
    price: 0,
    description: "Up to 50 orders/month",
  },
  PRO: {
    name: "Pro",
    ordersPerCycle: Infinity,
    price: 19,
    shopifyPlanId: "pro",
    description: "Unlimited orders, priority support",
  },
} as const;

export type PlanTier = keyof typeof PLANS;

export async function getMerchantUsage(shop: string) {
  return prisma.merchantUsage.upsert({
    where: { shop },
    create: { shop },
    update: {},
  });
}

export async function checkOrderQuota(
  shop: string,
  ordersRequested: number
): Promise<{ allowed: boolean; remaining: number; plan: PlanTier }> {
  const usage = await getMerchantUsage(shop);
  const plan = usage.plan as PlanTier;
  const limit = PLANS[plan].ordersPerCycle;

  const remaining =
    limit === Infinity
      ? Infinity
      : Math.max(0, limit - usage.ordersImportedThisCycle);

  return {
    allowed: remaining >= ordersRequested || limit === Infinity,
    remaining: remaining === Infinity ? 999999 : remaining,
    plan,
  };
}

export async function incrementUsage(shop: string, count: number) {
  await prisma.merchantUsage.update({
    where: { shop },
    data: {
      ordersImportedThisCycle: { increment: count },
      totalOrdersImported: { increment: count },
    },
  });
}

export async function createBillingSubscription(
  admin: AdminApiContext,
  shop: string,
  plan: Exclude<PlanTier, "FREE">
): Promise<string> {
  const planDetails = PLANS[plan];

  const response = await admin.graphql(
    `#graphql
    mutation AppSubscriptionCreate($name: String!, $lineItems: [AppSubscriptionLineItemInput!]!, $returnUrl: URL!, $test: Boolean) {
      appSubscriptionCreate(
        name: $name
        returnUrl: $returnUrl
        lineItems: $lineItems
        test: $test
      ) {
        userErrors {
          field
          message
        }
        confirmationUrl
        appSubscription {
          id
        }
      }
    }`,
    {
      variables: {
        name: `TrackFlow ${planDetails.name}`,
        returnUrl: `${process.env.SHOPIFY_APP_URL}/billing/callback`,
        test: process.env.NODE_ENV !== "production",
        lineItems: [
          {
            plan: {
              appRecurringPricingDetails: {
                price: { amount: planDetails.price, currencyCode: "USD" },
                interval: "EVERY_30_DAYS",
              },
            },
          },
        ],
      },
    }
  );

  const data = await response.json();
  const result = data.data?.appSubscriptionCreate;

  if (result?.userErrors?.length > 0) {
    throw new Error(result.userErrors[0].message);
  }

  return result.confirmationUrl;
}

export async function cancelSubscription(
  admin: AdminApiContext,
  subscriptionId: string
): Promise<void> {
  await admin.graphql(
    `#graphql
    mutation AppSubscriptionCancel($id: ID!) {
      appSubscriptionCancel(id: $id) {
        userErrors {
          field
          message
        }
      }
    }`,
    { variables: { id: subscriptionId } }
  );
}
