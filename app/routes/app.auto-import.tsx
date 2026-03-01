/**
 * Auto-Import Settings — Email + Google Drive + Dropbox
 *
 * Allows merchants to:
 * 1. Get their unique email import address
 * 2. Rotate the email token
 * 3. Connect Google Drive folder (OAuth)
 * 4. Connect Dropbox folder (OAuth)
 * 5. View active connections
 * 6. Delete connections
 */
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, useNavigation } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  Button,
  InlineStack,
  BlockStack,
  Banner,
  Badge,
  Divider,
  Link,
  TextField,
  Spinner,
  DataTable,
} from "@shopify/polaris";
import {
  EmailIcon,
  ExternalIcon,
  DeleteIcon,
  RefreshIcon,
} from "@shopify/polaris-icons";
import { useState } from "react";
import { authenticate } from "../shopify.server";
import {
  getOrCreateEmailAddress,
  getEmailAddressForShop,
  rotateEmailAddress,
} from "../auto-import.server";
import { prisma } from "../db.server";

// ── Loader ────────────────────────────────────────────────────────────────────

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const [emailAddr, driveConnections] = await Promise.all([
    getEmailAddressForShop(shop),
    prisma.driveConnection.findMany({
      where: { shop, isActive: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  // Auto-create email address if not present
  const email = emailAddr?.email ?? (await getOrCreateEmailAddress(shop));

  return json({
    shop,
    email,
    driveConnections: driveConnections.map((c) => ({
      id: c.id,
      provider: c.provider,
      folderName: c.folderName ?? c.folderPath,
      lastPolledAt: c.lastPolledAt?.toISOString() ?? null,
      lastImportAt: c.lastImportAt?.toISOString() ?? null,
      isActive: c.isActive,
    })),
    googleOAuthUrl: buildGoogleOAuthUrl(shop),
    dropboxOAuthUrl: buildDropboxOAuthUrl(shop),
  });
};

// ── Action ────────────────────────────────────────────────────────────────────

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const form = await request.formData();
  const intent = form.get("intent") as string;

  if (intent === "rotate_email") {
    const newEmail = await rotateEmailAddress(shop);
    return json({ ok: true, newEmail });
  }

  if (intent === "delete_connection") {
    const id = form.get("id") as string;
    await prisma.driveConnection.update({
      where: { id },
      data: { isActive: false },
    });
    return json({ ok: true });
  }

  return json({ ok: false, error: "Unknown intent" }, { status: 400 });
};

// ── OAuth URL builders ────────────────────────────────────────────────────────

function buildGoogleOAuthUrl(shop: string): string {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  if (!clientId) return "";

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${process.env.SHOPIFY_APP_URL ?? ""}/auth/google/callback`,
    response_type: "code",
    scope: [
      "https://www.googleapis.com/auth/drive.readonly",
    ].join(" "),
    access_type: "offline",
    prompt: "consent",
    state: shop,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

function buildDropboxOAuthUrl(shop: string): string {
  const clientId = process.env.DROPBOX_APP_KEY;
  if (!clientId) return "";

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${process.env.SHOPIFY_APP_URL ?? ""}/auth/dropbox/callback`,
    response_type: "code",
    state: shop,
    token_access_type: "offline",
  });
  return `https://www.dropbox.com/oauth2/authorize?${params}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AutoImportPage() {
  const { email, driveConnections, googleOAuthUrl, dropboxOAuthUrl } =
    useLoaderData<typeof loader>();
  const fetcher = useFetcher<{ ok: boolean; newEmail?: string; error?: string }>();
  const navigation = useNavigation();
  const [copied, setCopied] = useState(false);

  const currentEmail =
    fetcher.data?.newEmail ?? email;

  const handleCopy = () => {
    navigator.clipboard.writeText(currentEmail).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleRotate = () => {
    const form = new FormData();
    form.append("intent", "rotate_email");
    fetcher.submit(form, { method: "post" });
  };

  const handleDelete = (id: string) => {
    if (!confirm("Remove this connection?")) return;
    const form = new FormData();
    form.append("intent", "delete_connection");
    form.append("id", id);
    fetcher.submit(form, { method: "post" });
  };

  const tableRows = driveConnections.map((c) => [
    c.provider === "google_drive" ? "Google Drive" : "Dropbox",
    c.folderName,
    c.lastPolledAt
      ? new Date(c.lastPolledAt).toLocaleString()
      : "Never",
    c.lastImportAt
      ? new Date(c.lastImportAt).toLocaleString()
      : "Never",
    <Button
      key={c.id}
      icon={DeleteIcon}
      variant="plain"
      tone="critical"
      onClick={() => handleDelete(c.id)}
    >
      Remove
    </Button>,
  ]);

  return (
    <Page
      title="Auto-Import"
      subtitle="Automatically import tracking from email, Google Drive, or Dropbox"
      backAction={{ content: "Import", url: "/app" }}
    >
      <Layout>
        {/* Email Import */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack gap="200" align="start">
                <Text variant="headingMd" as="h2">
                  📧 Email Import Address
                </Text>
                <Badge tone="success">Active</Badge>
              </InlineStack>

              <Text variant="bodyMd" as="p" tone="subdued">
                Forward tracking emails (or CSVs) from your fulfillment center
                to this address. We&apos;ll auto-import them within seconds.
              </Text>

              <InlineStack gap="300" align="start" blockAlign="end">
                <div style={{ flex: 1, maxWidth: 420 }}>
                  <TextField
                    label="Your import email address"
                    value={currentEmail}
                    readOnly
                    autoComplete="off"
                    connectedRight={
                      <Button onClick={handleCopy}>
                        {copied ? "Copied!" : "Copy"}
                      </Button>
                    }
                  />
                </div>
              </InlineStack>

              <Text variant="bodyMd" as="p" tone="subdued">
                Set up a forwarding rule in Gmail or Outlook to automatically
                forward supplier emails with CSV attachments to this address.
              </Text>

              <Divider />

              <InlineStack gap="200" align="start">
                <Button
                  icon={RefreshIcon}
                  variant="plain"
                  loading={
                    fetcher.state === "submitting" &&
                    fetcher.formData?.get("intent") === "rotate_email"
                  }
                  onClick={handleRotate}
                >
                  Rotate address
                </Button>
                <Text variant="bodySm" as="span" tone="subdued">
                  Rotating generates a new address and deactivates the old one.
                </Text>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Google Drive */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">
                🗂 Google Drive
              </Text>
              <Text variant="bodyMd" as="p" tone="subdued">
                Connect a Google Drive folder. We&apos;ll check every 15 minutes
                for new CSV files and import them automatically.
              </Text>
              {googleOAuthUrl ? (
                <Button
                  variant="primary"
                  icon={ExternalIcon}
                  url={googleOAuthUrl}
                  external
                >
                  Connect Google Drive
                </Button>
              ) : (
                <Banner tone="warning">
                  <Text as="p">
                    Google OAuth not configured. Set{" "}
                    <code>GOOGLE_OAUTH_CLIENT_ID</code> and{" "}
                    <code>GOOGLE_OAUTH_CLIENT_SECRET</code> in Railway
                    environment variables.
                  </Text>
                </Banner>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Dropbox */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">
                📦 Dropbox
              </Text>
              <Text variant="bodyMd" as="p" tone="subdued">
                Connect a Dropbox folder. We&apos;ll check every 15 minutes for
                new CSV files and import them automatically.
              </Text>
              {dropboxOAuthUrl ? (
                <Button
                  variant="primary"
                  icon={ExternalIcon}
                  url={dropboxOAuthUrl}
                  external
                >
                  Connect Dropbox
                </Button>
              ) : (
                <Banner tone="warning">
                  <Text as="p">
                    Dropbox OAuth not configured. Set{" "}
                    <code>DROPBOX_APP_KEY</code> and{" "}
                    <code>DROPBOX_APP_SECRET</code> in Railway environment
                    variables.
                  </Text>
                </Banner>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Active Connections */}
        {driveConnections.length > 0 && (
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">
                  Active Connections
                </Text>
                <DataTable
                  columnContentTypes={["text", "text", "text", "text", "text"]}
                  headings={[
                    "Provider",
                    "Folder",
                    "Last Polled",
                    "Last Import",
                    "Actions",
                  ]}
                  rows={tableRows}
                />
              </BlockStack>
            </Card>
          </Layout.Section>
        )}
      </Layout>
    </Page>
  );
}
