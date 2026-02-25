/**
 * app.history.$jobId.tsx — Import job detail / live status page
 */
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useRevalidator } from "@remix-run/react";
import { useEffect } from "react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Badge,
  DataTable,
  ProgressBar,
  Banner,
  Button,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { prisma } from "../db.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const { jobId } = params;

  const job = await prisma.importJob.findFirst({
    where: { id: jobId, shop },
    include: {
      rows: {
        orderBy: { rowIndex: "asc" },
        take: 100,
      },
    },
  });

  if (!job) {
    throw new Response("Job not found", { status: 404 });
  }

  return json({
    job: {
      ...job,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
      rows: job.rows.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
        processedAt: r.processedAt?.toISOString() ?? null,
      })),
    },
  });
};

const STATUS_BADGE: Record<
  string,
  { tone: "success" | "warning" | "critical" | "info" | "new"; label: string }
> = {
  COMPLETED: { tone: "success", label: "Completed" },
  COMPLETED_WITH_ERRORS: { tone: "warning", label: "Completed with errors" },
  RUNNING: { tone: "info", label: "Running…" },
  PENDING: { tone: "new", label: "Pending" },
  FAILED: { tone: "critical", label: "Failed" },
};

const ROW_BADGE: Record<
  string,
  { tone: "success" | "warning" | "critical" | "new"; label: string }
> = {
  SUCCESS: { tone: "success", label: "Fulfilled" },
  FAILED: { tone: "critical", label: "Failed" },
  SKIPPED: { tone: "warning", label: "Skipped" },
  PENDING: { tone: "new", label: "Pending" },
};

export default function JobDetailPage() {
  const { job } = useLoaderData<typeof loader>();
  const { revalidate } = useRevalidator();

  const isRunning = job.status === "RUNNING" || job.status === "PENDING";

  // Auto-refresh while job is running
  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(() => revalidate(), 2000);
    return () => clearInterval(interval);
  }, [isRunning, revalidate]);

  const progress =
    job.totalRows > 0
      ? Math.round(
          ((job.successCount + job.failedCount + job.skippedCount) /
            job.totalRows) *
            100
        )
      : 0;

  const statusInfo =
    STATUS_BADGE[job.status] ?? { tone: "info" as const, label: job.status };

  return (
    <Page
      title={job.filename}
      subtitle={`Import job · ${new Date(job.createdAt).toLocaleString()}`}
      backAction={{ content: "History", url: "/app/history" }}
    >
      <Layout>
        {/* Status summary */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <Text variant="headingMd" as="h2">
                  Status
                </Text>
                <Badge tone={statusInfo.tone}>{statusInfo.label}</Badge>
              </InlineStack>

              {isRunning && (
                <BlockStack gap="200">
                  <ProgressBar progress={progress} size="medium" />
                  <Text variant="bodySm" tone="subdued" as="p">
                    {job.successCount + job.failedCount + job.skippedCount} of{" "}
                    {job.totalRows} processed…
                  </Text>
                </BlockStack>
              )}

              <InlineStack gap="400">
                <div style={{ flex: 1 }}>
                  <Card background="bg-surface-secondary">
                    <BlockStack gap="100">
                      <Text variant="headingLg" as="p" tone="success">
                        {job.successCount}
                      </Text>
                      <Text variant="bodySm" as="p" tone="subdued">
                        Fulfilled
                      </Text>
                    </BlockStack>
                  </Card>
                </div>
                <div style={{ flex: 1 }}>
                  <Card background="bg-surface-secondary">
                    <BlockStack gap="100">
                      <Text variant="headingLg" as="p" tone="critical">
                        {job.failedCount}
                      </Text>
                      <Text variant="bodySm" as="p" tone="subdued">
                        Failed
                      </Text>
                    </BlockStack>
                  </Card>
                </div>
                <div style={{ flex: 1 }}>
                  <Card background="bg-surface-secondary">
                    <BlockStack gap="100">
                      <Text variant="headingLg" as="p">
                        {job.skippedCount}
                      </Text>
                      <Text variant="bodySm" as="p" tone="subdued">
                        Skipped
                      </Text>
                    </BlockStack>
                  </Card>
                </div>
                <div style={{ flex: 1 }}>
                  <Card background="bg-surface-secondary">
                    <BlockStack gap="100">
                      <Text variant="headingLg" as="p">
                        {job.totalRows}
                      </Text>
                      <Text variant="bodySm" as="p" tone="subdued">
                        Total
                      </Text>
                    </BlockStack>
                  </Card>
                </div>
              </InlineStack>

              {job.status === "COMPLETED_WITH_ERRORS" && (
                <Banner tone="warning" title="Some rows failed">
                  <p>
                    {job.failedCount} order(s) could not be fulfilled. Check
                    the details below.
                  </p>
                </Banner>
              )}

              {job.status === "COMPLETED" && (
                <Banner tone="success" title="Import complete">
                  <p>
                    All {job.successCount} orders fulfilled successfully.
                    Customers will receive tracking emails.
                  </p>
                </Banner>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Row detail table */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">
                Row Details
              </Text>
              <DataTable
                columnContentTypes={["numeric", "text", "text", "text", "text"]}
                headings={[
                  "Row",
                  "Order",
                  "Tracking Number",
                  "Carrier",
                  "Result",
                ]}
                rows={job.rows.map((r) => [
                  r.rowIndex + 1,
                  r.orderName,
                  r.trackingNumber,
                  r.carrier,
                  r.status === "FAILED" && r.errorMessage ? (
                    <BlockStack key={r.id} gap="100">
                      <Badge tone="critical">Failed</Badge>
                      <Text variant="bodySm" tone="critical" as="p">
                        {r.errorMessage}
                      </Text>
                    </BlockStack>
                  ) : (
                    <Badge
                      key={r.id}
                      tone={ROW_BADGE[r.status]?.tone ?? "new"}
                    >
                      {ROW_BADGE[r.status]?.label ?? r.status}
                    </Badge>
                  ),
                ])}
              />
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <InlineStack gap="300">
            <Button url="/app/import" variant="primary">
              New Import
            </Button>
            <Button url="/app/history" variant="plain">
              Back to History
            </Button>
          </InlineStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
