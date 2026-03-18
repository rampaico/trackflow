/**
 * /webhooks/email — Inbound email webhook
 *
 * Compatible with SendGrid Inbound Parse and Mailgun Routes.
 * Called when a CSV is emailed to import-{token}@mail.trackflow.app
 */
import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { handleInboundEmail } from "../auto-import.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  // Verify webhook authenticity via shared secret header
  const webhookSecret = process.env.EMAIL_WEBHOOK_SECRET;
  if (webhookSecret) {
    const authHeader = request.headers.get("x-webhook-secret") || request.headers.get("authorization");
    if (authHeader !== webhookSecret && authHeader !== `Bearer ${webhookSecret}`) {
      console.warn("[Email webhook] Invalid or missing authentication");
      return json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const formData = await request.formData();

    // SendGrid format: "to", "from", "text", attachment fields
    // Mailgun format: "recipient", "from", attachment fields
    const toRaw =
      (formData.get("to") as string) ||
      (formData.get("recipient") as string) ||
      "";

    // Extract the actual email address from "Name <email@domain>" format
    const toMatch = toRaw.match(/<([^>]+)>/) || toRaw.match(/([^\s,]+@[^\s,]+)/);
    const toAddress = toMatch ? toMatch[1] : toRaw.trim();

    if (!toAddress.includes("@mail.trackflow.app")) {
      return json({ error: "Not a TrackFlow import address" }, { status: 400 });
    }

    // Message ID for deduplication
    const messageId =
      (formData.get("Message-Id") as string) ||
      (formData.get("message-id") as string) ||
      `${Date.now()}-${Math.random()}`;

    // Find CSV attachment (SendGrid: attachment-1, attachment-2, etc.)
    // Mailgun: attachment-1 etc.
    let csvContent: string | null = null;
    let filename = "import.csv";

    for (const [key, value] of formData.entries()) {
      if (!key.startsWith("attachment-") && key !== "attachments") continue;
      if (!(value instanceof File)) continue;
      if (
        value.name.toLowerCase().endsWith(".csv") ||
        value.type === "text/csv" ||
        value.type === "application/csv" ||
        value.type === "text/plain"
      ) {
        csvContent = await value.text();
        filename = value.name;
        break;
      }
    }

    // Also try body text if no file attachment (some email clients inline the CSV)
    if (!csvContent) {
      const body = (formData.get("text") as string) || "";
      if (body.includes(",") && body.split("\n").length > 1) {
        csvContent = body;
        filename = "email-body.csv";
      }
    }

    if (!csvContent) {
      return json(
        { error: "No CSV attachment found in email" },
        { status: 400 }
      );
    }

    const result = await handleInboundEmail(
      toAddress,
      filename,
      csvContent,
      messageId
    );

    if (!result.success) {
      return json({ error: result.error }, { status: 400 });
    }

    return json({ success: true, jobId: result.jobId });
  } catch (err) {
    console.error("[Email webhook] Error:", err);
    return json({ error: "Internal error" }, { status: 500 });
  }
};

// GET returns 200 for webhook verification (SendGrid ping)
export const loader = async () => {
  return json({ ok: true, endpoint: "TrackFlow email import webhook" });
};
