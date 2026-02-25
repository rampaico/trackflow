/**
 * Dashboard — app._index.tsx
 * Shows usage stats, recent jobs, quick import CTA.
 */
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Button,
  Banner,
  ProgressBar,
  Badge,
  Divider,
  DataTable,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { getMerchantUsage, PLANS } from "../billing.server";
import { prisma } from "../db.server";
import type { PlanTier } from "../billing.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const [usage, recentJobs] = await Promise.all([
    getMerchantUsage(shop),
    prisma.importJob.findMany({
      where: { shop },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        filename: true,
        status: true,
        totalRows: true,
        successCount: true,
        failedCount: true,
        createdAt: true,
      },
    }),
  ]);

  const plan = usage.plan as PlanTier;
  const planDetails = PLANS[plan];
  const limit = planDetails.ordersPerCycle;
  const used = usage.ordersImportedThisCycle;
  const remaining = limit === Infinity ? null : Math.max(0, limit - used);
  const percentUsed = limit === Infinity ? 0 : Math.round((used / limit) * 100);

  return json({
    shop,
    plan,
    planName: planDetails.name,
    ordersUsed: used,
    ordersLimit: limit === Infinity ? null : limit,
    remaining,
    percentUsed,
    totalImported: usage.totalOrdersImported,
    recentJobs: recentJobs.map((j) => ({
      ...j,
      createdAt: j.createdAt.toISOString(),
    })),
  });
};

const STATUS_BADGE: Record<string, { tone: "success" | "warning" | "critical" | "info"; label: string }> = {
  COMPLETED: { tone: "success", label: "Completed" },
  COMPLETED_WITH_ERRORS: { tone: "warning", label: "Partial" },
  RUNNING: { tone: "info", label: "Running" },
  PENDING: { tone: "info", label: "Pending" },
  FAILED: { tone: "critical", label: "Failed" },
};

export default function Dashboard() {
  const {
    planName,
    ordersUsed,
    ordersLimit,
    remaining,
    percentUsed,
    totalImported,
    plan,
    recentJobs,
  } = useLoaderData<typeof loader>();

  const isFreePlan = plan === "FREE";
  const isLimitApproaching = !isFreePlan && percentUsed >= 80;
  const isFreeLimitApproaching = isFreePlan && percentUsed >= 80;

  return (
    <Page
      title="TrackFlow"
      subtitle="Bulk tracking made simple"
      primaryAction={{
        content: "Import Tracking Numbers",
        url: "/app/import",
      }}
    >
      <Layout>
        {isFreePlan && remaining !== null && remaining <= 10 && (
          <Layout.Section>
            <Banner
              title="Approaching free plan limit"
              action={{ content: "Upgrade to Pro — $19/mo", url: "/app/billing" }}
              tone={remaining === 0 ? "critical" : "warning"}
            >
              <p>
                {remaining === 0
                  ? "You've used all 50 free imports this month. Upgrade to Pro for unlimited imports."
                  : `You have ${remaining} free imports remaining this month.`}
              </p>
            </Banner>
          </Layout.Section>
        )}

        {isLimitApproaching && (
          <Layout.Section>
            <Banner title="Approaching your monthly limit" tone="warning">
              <p>
                You've used {ordersUsed} of {ordersLimit} imports this cycle.
              </p>
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <InlineStack gap="400" wrap={false}>
            <div style={{ flex: 1 }}>
              <Card>
                <BlockStack gap="200">
                  <Text variant="headingMd" as="h2">Plan</Text>
                  <InlineStack align="space-between" blockAlign="center">
                    <Text variant="heading2xl" as="p">{planName}</Text>
                    <Badge tone={isFreePlan ? "info" : "success"}>{planName}</Badge>
                  </InlineStack>
                  <Button url="/app/billing" variant="plain">
                    {isFreePlan ? "Upgrade to Pro" : "Manage billing"}
                  </Button>
                </BlockStack>
              </Card>
            </div>

            <div style={{ flex: 1 }}>
              <Card>
                <BlockStack gap="200">
                  <Text variant="headingMd" as="h2">This Month</Text>
                  <Text variant="heading2xl" as="p">{ordersUsed}</Text>
                  <Text variant="bodySm" tone="subdued" as="p">
                    {ordersLimit ? `of ${ordersLimit}` : "unlimited"} orders imported
                  </Text>
                  {ordersLimit && (
                    <ProgressBar
                      progress={percentUsed}
                      tone={isFreeLimitApproaching ? "critical" : "primary"}
                      size="small"
                    />
                  )}
                </BlockStack>
              </Card>
            </div>

            <div style={{ flex: 1 }}>
              <Card>
                <BlockStack gap="200">
                  <Text variant="headingMd" as="h2">All Time</Text>
                  <Text variant="heading2xl" as="p">{totalImported}</Text>
                  <Text variant="bodySm" tone="subdued" as="p">
                    orders fulfilled with tracking
                  </Text>
                </BlockStack>
              </Card>
            </div>
          </InlineStack>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">How It Works</Text>
              <Divider />
              <BlockStack gap="300">
                {[
                  {
                    step: "1",
                    title: "Upload your CSV",
                    desc: "Export tracking numbers from your shipping software. Any format works — we detect columns automatically.",
                  },
                  {
                    step: "2",
                    title: "Map columns & confirm",
                    desc: "We auto-detect order number, tracking number, and carrier columns. Override if needed.",
                  },
                  {
                    step: "3",
                    title: "Import in seconds",
                    desc: "TrackFlow fulfills each order via Shopify API and sends tracking emails to your customers.",
                  },
                ].map(({ step, title, desc }) => (
                  <InlineStack key={step} gap="300" blockAlign="center">
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: "50%",
                        background: "#00A693",
                        color: "white",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: "bold",
                        flexShrink: 0,
                      }}
                    >
                      {step}
                    </div>
                    <BlockStack gap="100">
                      <Text variant="bodyMd" fontWeight="semibold" as="p">{title}</Text>
                      <Text variant="bodySm" tone="subdued" as="p">{desc}</Text>
                    </BlockStack>
                  </InlineStack>
                ))}
              </BlockStack>
              <Button url="/app/import" variant="primary" size="large">
                Start Importing →
              </Button>
            </BlockStack>
          </Card>
        </Layout.Section>

        {recentJobs.length > 0 && (
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <Text variant="headingMd" as="h2">Recent Imports</Text>
                  <Button url="/app/history" variant="plain">View all</Button>
                </InlineStack>
                <DataTable
                  columnContentTypes={["text", "text", "numeric", "numeric", "text"]}
                  headings={["File", "Status", "Success", "Failed", "Date"]}
                  rows={recentJobs.map((j) => [
                    j.filename,
                    <Badge
                      key={j.id}
                      tone={STATUS_BADGE[j.status]?.tone ?? "info"}
                    >
                      {STATUS_BADGE[j.status]?.label ?? j.status}
                    </Badge>,
                    j.successCount,
                    j.failedCount,
                    new Date(j.createdAt).toLocaleDateString(),
                  ])}
                />
              </BlockStack>
            </Card>
          </Layout.Section>
        )}
      </Layout>
    </Page>
  );
}
