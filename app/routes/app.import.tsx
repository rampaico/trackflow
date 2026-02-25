/**
 * app.import.tsx — CSV Upload + Column Mapping + Import Trigger
 *
 * Flow:
 * 1. Upload CSV file (client-side parse with PapaParse)
 * 2. Show preview with auto-detected column mapping
 * 3. Confirm → POST to action → creates ImportJob + rows → starts processing
 * 4. Redirect to job status page
 */
import { useState, useCallback, useRef } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Button,
  Banner,
  Select,
  DataTable,
  Badge,
  Divider,
  DropZone,
  Spinner,
  List,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { checkOrderQuota } from "../billing.server";
import { detectColumnMapping, mapCsvRows } from "../import.server";
import { detectCarrier, SUPPORTED_CARRIERS } from "../carrier.server";
import { prisma } from "../db.server";
import { processImportJob } from "../import.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const quota = await checkOrderQuota(shop, 1);

  return json({
    shop,
    quota,
    carriers: SUPPORTED_CARRIERS.map((c) => ({ label: c.name, value: c.code })),
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  const formData = await request.formData();
  const csvDataRaw = formData.get("csvData") as string;
  const mappingRaw = formData.get("mapping") as string;
  const filename = formData.get("filename") as string;

  if (!csvDataRaw || !mappingRaw) {
    return json({ error: "Missing CSV data or column mapping" }, { status: 400 });
  }

  let rows: Array<Record<string, string>>;
  let mapping: { orderColumn: string; trackingColumn: string; carrierColumn?: string };

  try {
    rows = JSON.parse(csvDataRaw);
    mapping = JSON.parse(mappingRaw);
  } catch {
    return json({ error: "Invalid form data" }, { status: 400 });
  }

  const mappedRows = mapCsvRows(rows, mapping);

  if (mappedRows.length === 0) {
    return json({ error: "No valid rows found after mapping. Check column selection." }, { status: 400 });
  }

  // Check quota
  const quota = await checkOrderQuota(shop, mappedRows.length);
  if (!quota.allowed) {
    return json(
      {
        error: `Quota exceeded. You can import ${quota.remaining} more orders this cycle. This file has ${mappedRows.length} rows.`,
      },
      { status: 400 }
    );
  }

  // Create the import job
  const job = await prisma.importJob.create({
    data: {
      shop,
      filename: filename || "import.csv",
      status: "PENDING",
      totalRows: mappedRows.length,
      rows: {
        create: mappedRows.map((r) => ({
          rowIndex: r.rowIndex,
          orderName: r.orderName,
          trackingNumber: r.trackingNumber,
          carrier: r.carrier,
        })),
      },
    },
  });

  // Process the job (async — in production you'd queue this, but for MVP we run it inline)
  // We use a fire-and-forget pattern here: redirect immediately, job runs in background
  processImportJob(admin, job.id, shop).catch(async (err) => {
    console.error(`Job ${job.id} failed:`, err);
    await prisma.importJob.update({
      where: { id: job.id },
      data: { status: "FAILED" },
    });
  });

  return redirect(`/app/history/${job.id}`);
};

// ─── Component ────────────────────────────────────────────────────────────────

type ParsedData = {
  headers: string[];
  rows: Array<Record<string, string>>;
};

export default function ImportPage() {
  const { quota, carriers } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();

  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedData | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [orderColumn, setOrderColumn] = useState("");
  const [trackingColumn, setTrackingColumn] = useState("");
  const [carrierColumn, setCarrierColumn] = useState("");
  const [step, setStep] = useState<"upload" | "map" | "preview">("upload");

  const isSubmitting = navigation.state === "submitting";

  const handleDrop = useCallback(
    (_dropped: File[], acceptedFiles: File[]) => {
      const f = acceptedFiles[0];
      if (!f) return;

      setFile(f);
      setParseError(null);
      setParsed(null);

      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        if (!text) {
          setParseError("Could not read file");
          return;
        }

        // Simple CSV parse (we'll use PapaParse in the real build)
        try {
          const lines = text.split(/\r?\n/).filter(Boolean);
          if (lines.length < 2) {
            setParseError("CSV must have at least a header row and one data row");
            return;
          }

          const headers = parseCSVLine(lines[0]);
          const rows = lines.slice(1).map((line) => {
            const values = parseCSVLine(line);
            return Object.fromEntries(
              headers.map((h, i) => [h, values[i] ?? ""])
            );
          });

          const autoMapping = detectColumnMappingClient(headers);
          setOrderColumn(autoMapping.orderColumn ?? "");
          setTrackingColumn(autoMapping.trackingColumn ?? "");
          setCarrierColumn(autoMapping.carrierColumn ?? "");
          setParsed({ headers, rows });
          setStep("map");
        } catch {
          setParseError("Failed to parse CSV. Make sure it's a valid CSV file.");
        }
      };
      reader.readAsText(f);
    },
    []
  );

  const handleConfirmMapping = () => {
    if (!orderColumn || !trackingColumn) return;
    setStep("preview");
  };

  const handleImport = () => {
    if (!parsed || !orderColumn || !trackingColumn) return;

    const formData = new FormData();
    formData.set("csvData", JSON.stringify(parsed.rows));
    formData.set(
      "mapping",
      JSON.stringify({
        orderColumn,
        trackingColumn,
        carrierColumn: carrierColumn || undefined,
      })
    );
    formData.set("filename", file?.name ?? "import.csv");

    submit(formData, { method: "POST" });
  };

  const headerOptions = parsed
    ? [
        { label: "— None —", value: "" },
        ...parsed.headers.map((h) => ({ label: h, value: h })),
      ]
    : [];

  // Preview rows (first 5 with detected carrier)
  const previewRows = parsed
    ? parsed.rows.slice(0, 5).map((row) => {
        const tracking = row[trackingColumn] ?? "";
        const carrierOverride = carrierColumn ? row[carrierColumn] : undefined;
        const detected = detectCarrierClient(tracking, carrierOverride);
        return [
          row[orderColumn] ?? "",
          tracking,
          detected,
        ];
      })
    : [];

  return (
    <Page
      title="Import Tracking Numbers"
      subtitle="Upload a CSV to bulk-update tracking on your orders"
      backAction={{ content: "Dashboard", url: "/app" }}
    >
      <Layout>
        {quota.remaining < 10 && (
          <Layout.Section>
            <Banner
              title={quota.remaining === 0 ? "Monthly limit reached" : `${quota.remaining} imports remaining`}
              tone={quota.remaining === 0 ? "critical" : "warning"}
              action={
                quota.plan === "FREE"
                  ? { content: "Upgrade to Pro", url: "/app/billing" }
                  : undefined
              }
            >
              <p>
                {quota.remaining === 0
                  ? "You've used all free imports for this month. Upgrade to Pro for unlimited imports."
                  : `Free plan: ${quota.remaining} order imports left this month.`}
              </p>
            </Banner>
          </Layout.Section>
        )}

        {/* Step 1: Upload */}
        {step === "upload" && (
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">Step 1: Upload CSV</Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Your CSV needs at least an order number column and a tracking number column.
                  Carrier will be auto-detected from the tracking number if not provided.
                </Text>

                <DropZone
                  accept=".csv,text/csv,application/vnd.ms-excel"
                  type="file"
                  onDrop={handleDrop}
                  label="Upload CSV"
                >
                  <DropZone.FileUpload
                    actionTitle="Add CSV file"
                    actionHint="or drop your file here"
                  />
                </DropZone>

                {parseError && (
                  <Banner tone="critical" title="Parse error">
                    <p>{parseError}</p>
                  </Banner>
                )}

                <Divider />

                <BlockStack gap="200">
                  <Text variant="headingSm" as="h3">Expected CSV format:</Text>
                  <List type="bullet">
                    <List.Item>Column for order number (e.g. #1001 or 1001)</List.Item>
                    <List.Item>Column for tracking number</List.Item>
                    <List.Item>Optional: carrier column (auto-detected if missing)</List.Item>
                  </List>
                  <Text variant="bodySm" tone="subdued" as="p">
                    Example: <code>Order Number, Tracking Number, Carrier</code>
                  </Text>
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        )}

        {/* Step 2: Column Mapping */}
        {step === "map" && parsed && (
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">Step 2: Map Columns</Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  We detected {parsed.rows.length} rows in <strong>{file?.name}</strong>. 
                  Confirm which columns contain order numbers and tracking numbers.
                </Text>

                <InlineStack gap="400" wrap={false}>
                  <div style={{ flex: 1 }}>
                    <Select
                      label="Order Number Column *"
                      options={headerOptions}
                      value={orderColumn}
                      onChange={setOrderColumn}
                      helpText="The column containing Shopify order names (e.g. #1001)"
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <Select
                      label="Tracking Number Column *"
                      options={headerOptions}
                      value={trackingColumn}
                      onChange={setTrackingColumn}
                      helpText="The column containing tracking numbers"
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <Select
                      label="Carrier Column (optional)"
                      options={headerOptions}
                      value={carrierColumn}
                      onChange={setCarrierColumn}
                      helpText="Leave blank to auto-detect from tracking number"
                    />
                  </div>
                </InlineStack>

                <InlineStack gap="300">
                  <Button onClick={() => setStep("upload")} variant="plain">
                    ← Back
                  </Button>
                  <Button
                    onClick={handleConfirmMapping}
                    variant="primary"
                    disabled={!orderColumn || !trackingColumn}
                  >
                    Preview Import →
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        )}

        {/* Step 3: Preview & Confirm */}
        {step === "preview" && parsed && (
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">Step 3: Review & Import</Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Showing first 5 of {parsed.rows.length} rows. Carrier is auto-detected from tracking number when not specified.
                </Text>

                <DataTable
                  columnContentTypes={["text", "text", "text"]}
                  headings={["Order", "Tracking Number", "Carrier (detected)"]}
                  rows={previewRows}
                />

                {parsed.rows.length > 5 && (
                  <Text variant="bodySm" tone="subdued" as="p">
                    + {parsed.rows.length - 5} more rows
                  </Text>
                )}

                <Banner tone="info" title={`${parsed.rows.length} orders will be fulfilled`}>
                  <p>
                    This will create fulfillments and send tracking emails to your customers.
                    Orders that are already fulfilled will be skipped.
                  </p>
                </Banner>

                <InlineStack gap="300">
                  <Button onClick={() => setStep("map")} variant="plain">
                    ← Edit Mapping
                  </Button>
                  <Button
                    onClick={handleImport}
                    variant="primary"
                    loading={isSubmitting}
                    disabled={isSubmitting || quota.remaining === 0}
                  >
                    {isSubmitting ? "Importing..." : `Import ${parsed.rows.length} Orders`}
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        )}
      </Layout>
    </Page>
  );
}

// ─── Client-side helpers (no server imports) ──────────────────────────────────

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function detectColumnMappingClient(headers: string[]): Partial<{ orderColumn: string; trackingColumn: string; carrierColumn: string }> {
  const lower = headers.map((h) => h.toLowerCase().trim());

  const find = (patterns: string[]): string | undefined => {
    for (const p of patterns) {
      const idx = lower.findIndex((h) => h === p || h.includes(p));
      if (idx !== -1) return headers[idx];
    }
    return undefined;
  };

  return {
    orderColumn: find(["order", "order name", "order number", "order #", "order_name", "name", "#"]),
    trackingColumn: find(["tracking", "tracking number", "tracking_number", "track"]),
    carrierColumn: find(["carrier", "shipping carrier", "courier", "shipper"]),
  };
}

function detectCarrierClient(trackingNumber: string, carrierHint?: string): string {
  if (carrierHint) return carrierHint;

  const t = trackingNumber.trim().toUpperCase();

  if (/^1Z[A-Z0-9]{16}$/i.test(t)) return "UPS";
  if (/^9[0-9]{21}$/.test(t)) return "USPS";
  if (/^[A-Z]{2}\d{9}US$/i.test(t)) return "USPS";
  if (/^TBA\d{12,16}$/i.test(t)) return "Amazon Logistics";
  if (/^\d{10}$/.test(t)) return "DHL Express";
  if (/^\d{12}$/.test(t)) return "FedEx";
  if (/^\d{15}$/.test(t)) return "FedEx";
  if (/^\d{20}$/.test(t)) return "FedEx";

  return "Auto-detect";
}
