/**
 * app.history.tsx — Import history list
 */
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  DataTable,
  Badge,
  Button,
  EmptyState,
  InlineStack,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { prisma } from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const jobs = await prisma.importJob.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      filename: true,
      status: true,
      totalRows: true,
      successCount: true,
      failedCount: true,
      skippedCount: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return json({
    jobs: jobs.map((j) => ({
      ...j,
      createdAt: j.createdAt.toISOString(),
      updatedAt: j.updatedAt.toISOString(),
    })),
  });
};

const STATUS_BADGE: Record<
  string,
  { tone: "success" | "warning" | "critical" | "info" | "new"; label: string }
> = {
  COMPLETED: { tone: "success", label: "Completed" },
  COMPLETED_WITH_ERRORS: { tone: "warning", label: "Partial" },
  RUNNING: { tone: "info", label: "Running" },
  PENDING: { tone: "new", label: "Pending" },
  FAILED: { tone: "critical", label: "Failed" },
};

export default function HistoryPage() {
  const { jobs } = useLoaderData<typeof loader>();

  if (jobs.length === 0) {
    return (
      <Page title="Import History" backAction={{ content: "Dashboard", url: "/app" }}>
        <Layout>
          <Layout.Section>
            <Card>
              <EmptyState
                heading="No imports yet"
                action={{ content: "Import Tracking Numbers", url: "/app/import" }}
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>
                  Upload a CSV to bulk-add tracking numbers to your Shopify orders.
                </p>
              </EmptyState>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  return (
    <Page
      title="Import History"
      backAction={{ content: "Dashboard", url: "/app" }}
      primaryAction={{ content: "New Import", url: "/app/import" }}
    >
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">All Imports</Text>
              <DataTable
                columnContentTypes={["text", "text", "numeric", "numeric", "numeric", "text", "text"]}
                headings={["File", "Status", "Total", "✓ Success", "✗ Failed", "Date", ""]}
                rows={jobs.map((j) => [
                  j.filename,
                  <Badge
                    key={j.id}
                    tone={STATUS_BADGE[j.status]?.tone ?? "info"}
                  >
                    {STATUS_BADGE[j.status]?.label ?? j.status}
                  </Badge>,
                  j.totalRows,
                  j.successCount,
                  j.failedCount,
                  new Date(j.createdAt).toLocaleString(),
                  <Button
                    key={`view-${j.id}`}
                    url={`/app/history/${j.id}`}
                    variant="plain"
                    size="slim"
                  >
                    View
                  </Button>,
                ])}
              />
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
