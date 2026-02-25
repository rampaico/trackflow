/**
 * import.server.ts — TrackFlow CSV import processing engine
 *
 * Handles:
 * 1. CSV column mapping / normalization
 * 2. Order lookup via Shopify Admin GraphQL
 * 3. Fulfillment creation with tracking
 * 4. Job progress tracking in DB
 */
import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import { prisma } from "./db.server";
import { detectCarrier, buildTrackingUrl, normalizeCarrierName } from "./carrier.server";
import { incrementUsage } from "./billing.server";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CsvRow = Record<string, string>;

export type MappedRow = {
  rowIndex: number;
  orderName: string;
  trackingNumber: string;
  carrier: string;
};

export type ColumnMapping = {
  orderColumn: string;
  trackingColumn: string;
  carrierColumn?: string;
};

// ─── Column Detection ─────────────────────────────────────────────────────────

/**
 * Auto-detect which CSV columns map to order name, tracking, and carrier.
 * Works on the raw header row from PapaParse.
 */
export function detectColumnMapping(headers: string[]): Partial<ColumnMapping> {
  const lower = headers.map((h) => h.toLowerCase().trim());

  const orderPatterns = ["order", "order name", "order number", "order #", "order_name", "order_number", "name", "#"];
  const trackingPatterns = ["tracking", "tracking number", "tracking_number", "tracking #", "trackingnumber", "track"];
  const carrierPatterns = ["carrier", "shipping carrier", "courier", "shipping_carrier", "shipper"];

  const findColumn = (patterns: string[]): string | undefined => {
    for (const pattern of patterns) {
      const idx = lower.findIndex((h) => h === pattern || h.includes(pattern));
      if (idx !== -1) return headers[idx];
    }
    return undefined;
  };

  return {
    orderColumn: findColumn(orderPatterns),
    trackingColumn: findColumn(trackingPatterns),
    carrierColumn: findColumn(carrierPatterns),
  };
}

/**
 * Map raw CSV rows to normalized MappedRow objects using column mapping.
 */
export function mapCsvRows(
  rows: CsvRow[],
  mapping: ColumnMapping
): MappedRow[] {
  return rows
    .map((row, index) => {
      const orderName = row[mapping.orderColumn]?.trim();
      const trackingNumber = row[mapping.trackingColumn]?.trim();
      const carrierRaw = mapping.carrierColumn
        ? row[mapping.carrierColumn]?.trim()
        : undefined;

      return {
        rowIndex: index,
        orderName: normalizeOrderName(orderName ?? ""),
        trackingNumber: trackingNumber ?? "",
        carrier: carrierRaw
          ? normalizeCarrierName(carrierRaw)
          : detectCarrier(trackingNumber ?? "").code,
      };
    })
    .filter((r) => r.orderName && r.trackingNumber);
}

/**
 * Normalize order name: ensure it starts with "#" for Shopify lookup.
 */
function normalizeOrderName(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
}

// ─── Shopify API ──────────────────────────────────────────────────────────────

/**
 * Look up a Shopify order GID by order name.
 * Returns null if not found.
 */
async function lookupOrderId(
  admin: AdminApiContext,
  orderName: string
): Promise<string | null> {
  const response = await admin.graphql(
    `#graphql
    query GetOrderByName($query: String!) {
      orders(first: 1, query: $query) {
        edges {
          node {
            id
            name
            fulfillmentOrders(first: 5) {
              edges {
                node {
                  id
                  status
                }
              }
            }
          }
        }
      }
    }`,
    { variables: { query: `name:${orderName}` } }
  );

  const data = await response.json();
  const edges = data.data?.orders?.edges ?? [];

  if (edges.length === 0) return null;
  return edges[0].node.id;
}

/**
 * Get the open fulfillment order ID for a given Shopify order GID.
 * Returns null if there's nothing to fulfill.
 */
async function getOpenFulfillmentOrderId(
  admin: AdminApiContext,
  orderId: string
): Promise<string | null> {
  const response = await admin.graphql(
    `#graphql
    query GetFulfillmentOrders($orderId: ID!) {
      order(id: $orderId) {
        fulfillmentOrders(first: 10) {
          edges {
            node {
              id
              status
            }
          }
        }
      }
    }`,
    { variables: { orderId } }
  );

  const data = await response.json();
  const foEdges = data.data?.order?.fulfillmentOrders?.edges ?? [];

  const open = foEdges.find(
    (e: { node: { status: string } }) =>
      e.node.status === "OPEN" || e.node.status === "IN_PROGRESS"
  );

  return open ? open.node.id : null;
}

/**
 * Create a fulfillment with tracking info on a fulfillment order.
 */
async function createFulfillment(
  admin: AdminApiContext,
  fulfillmentOrderId: string,
  trackingNumber: string,
  carrierCode: string
): Promise<{ success: boolean; errorMessage?: string }> {
  const trackingUrl = buildTrackingUrl(carrierCode, trackingNumber);

  const response = await admin.graphql(
    `#graphql
    mutation FulfillmentCreate($fulfillment: FulfillmentInput!) {
      fulfillmentCreate(fulfillment: $fulfillment) {
        fulfillment {
          id
          status
        }
        userErrors {
          field
          message
        }
      }
    }`,
    {
      variables: {
        fulfillment: {
          lineItemsByFulfillmentOrder: [{ fulfillmentOrderId }],
          trackingInfo: {
            number: trackingNumber,
            company: carrierCode,
            url: trackingUrl || undefined,
          },
          notifyCustomer: true,
        },
      },
    }
  );

  const data = await response.json();
  const result = data.data?.fulfillmentCreate;

  if (!result) {
    return { success: false, errorMessage: "No response from Shopify API" };
  }

  if (result.userErrors?.length > 0) {
    return {
      success: false,
      errorMessage: result.userErrors.map((e: { message: string }) => e.message).join("; "),
    };
  }

  return { success: true };
}

// ─── Job Orchestration ────────────────────────────────────────────────────────

/**
 * Process all rows in an import job against the Shopify API.
 * Updates DB row-by-row, increments usage on success.
 */
export async function processImportJob(
  admin: AdminApiContext,
  jobId: string,
  shop: string
): Promise<void> {
  // Mark job as running
  await prisma.importJob.update({
    where: { id: jobId },
    data: { status: "RUNNING" },
  });

  const rows = await prisma.importRow.findMany({
    where: { jobId, status: "PENDING" },
    orderBy: { rowIndex: "asc" },
  });

  let successCount = 0;
  let failedCount = 0;
  let skippedCount = 0;

  for (const row of rows) {
    try {
      // Look up the order
      const orderId = await lookupOrderId(admin, row.orderName);

      if (!orderId) {
        await prisma.importRow.update({
          where: { id: row.id },
          data: {
            status: "FAILED",
            errorMessage: `Order ${row.orderName} not found`,
            processedAt: new Date(),
          },
        });
        failedCount++;
        continue;
      }

      // Get open fulfillment order
      const fulfillmentOrderId = await getOpenFulfillmentOrderId(admin, orderId);

      if (!fulfillmentOrderId) {
        await prisma.importRow.update({
          where: { id: row.id },
          data: {
            orderId,
            status: "SKIPPED",
            errorMessage: "No open fulfillment order (already fulfilled or cancelled)",
            processedAt: new Date(),
          },
        });
        skippedCount++;
        continue;
      }

      // Create fulfillment
      const result = await createFulfillment(
        admin,
        fulfillmentOrderId,
        row.trackingNumber,
        row.carrier
      );

      if (result.success) {
        await prisma.importRow.update({
          where: { id: row.id },
          data: {
            orderId,
            status: "SUCCESS",
            processedAt: new Date(),
          },
        });
        successCount++;
      } else {
        await prisma.importRow.update({
          where: { id: row.id },
          data: {
            orderId,
            status: "FAILED",
            errorMessage: result.errorMessage,
            processedAt: new Date(),
          },
        });
        failedCount++;
      }
    } catch (error) {
      await prisma.importRow.update({
        where: { id: row.id },
        data: {
          status: "FAILED",
          errorMessage:
            error instanceof Error ? error.message : "Unknown error",
          processedAt: new Date(),
        },
      });
      failedCount++;
    }
  }

  // Update job totals and status
  const finalStatus =
    failedCount === 0 && skippedCount === 0
      ? "COMPLETED"
      : failedCount > 0
      ? "COMPLETED_WITH_ERRORS"
      : "COMPLETED";

  await prisma.importJob.update({
    where: { id: jobId },
    data: {
      status: finalStatus,
      successCount,
      failedCount,
      skippedCount,
      updatedAt: new Date(),
    },
  });

  // Increment billing usage for successful imports
  if (successCount > 0) {
    await incrementUsage(shop, successCount);
  }
}
