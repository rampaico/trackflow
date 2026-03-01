/**
 * auto-import.server.ts — Auto-import pipeline for TrackFlow
 *
 * Supports:
 * - Email forwarding: merchant gets import-{token}@mail.trackflow.app
 * - Google Drive watch: polls a folder every 15 min
 * - Dropbox watch: polls a folder every 15 min
 *
 * Entry points:
 * - handleInboundEmail(req)   — called by email webhook (SendGrid/Mailgun)
 * - pollDriveFolder(conn)     — called by scheduled job
 * - pollDropboxFolder(conn)   — called by scheduled job
 */

import crypto from "crypto";
import { prisma } from "./db.server";
import { processImportJob } from "./import.server";

// ── Email Address Management ──────────────────────────────────────────────────

export async function getOrCreateEmailAddress(shop: string): Promise<string> {
  const existing = await prisma.emailImportAddress.findUnique({ where: { shop } });
  if (existing) return existing.email;

  const token = crypto.randomBytes(4).toString("hex"); // 8 hex chars
  const email = `import-${token}@mail.trackflow.app`;

  await prisma.emailImportAddress.create({
    data: { shop, token, email },
  });
  return email;
}

export async function getEmailAddressForShop(shop: string) {
  return prisma.emailImportAddress.findUnique({ where: { shop } });
}

export async function rotateEmailAddress(shop: string): Promise<string> {
  const token = crypto.randomBytes(4).toString("hex");
  const email = `import-${token}@mail.trackflow.app`;

  await prisma.emailImportAddress.upsert({
    where: { shop },
    update: { token, email, updatedAt: new Date() },
    create: { shop, token, email },
  });
  return email;
}

// ── Inbound Email Handler ─────────────────────────────────────────────────────

/**
 * Called by the email webhook (SendGrid inbound parse or Mailgun routes).
 * Expects multipart/form-data with:
 *   - `to` or `envelope` (to find the token → shop)
 *   - `attachment-1` (or `attachments`) → CSV file buffer
 */
export async function handleInboundEmail(
  toAddress: string,
  filename: string,
  csvContent: string,
  messageId: string
): Promise<{ success: boolean; jobId?: string; error?: string }> {
  // Extract token from address (import-{token}@mail.trackflow.app)
  const match = toAddress.match(/^import-([a-f0-9]+)@/);
  if (!match) {
    return { success: false, error: "Unrecognized import address format" };
  }
  const token = match[1];

  const addr = await prisma.emailImportAddress.findUnique({ where: { token } });
  if (!addr || !addr.isActive) {
    return { success: false, error: "Import address not found or deactivated" };
  }

  // Update last-used
  await prisma.emailImportAddress.update({
    where: { token },
    data: { lastUsedAt: new Date() },
  });

  // Check for duplicate (idempotency via messageId)
  const existing = await prisma.importJobSource.findFirst({
    where: { sourceRef: messageId, source: "email" },
  });
  if (existing) {
    return { success: true, jobId: existing.jobId };
  }

  // Trigger an import job
  const jobId = await _triggerCsvImport(addr.shop, filename, csvContent, "email", messageId);
  return { success: true, jobId };
}

// ── Drive / Dropbox Polling ───────────────────────────────────────────────────

interface DriveFile {
  id: string;
  name: string;
  modifiedTime: string;
  downloadUrl?: string;
}

/**
 * Poll a connected Google Drive folder for new CSV files.
 * Called by a scheduled job every 15 minutes.
 */
export async function pollDriveFolder(connectionId: string): Promise<void> {
  const conn = await prisma.driveConnection.findUnique({ where: { id: connectionId } });
  if (!conn || !conn.isActive) return;

  try {
    const files = await _listDriveFiles(conn.folderPath, conn.accessToken);
    const cutoff = conn.lastPolledAt ?? new Date(0);

    const newFiles = files.filter(f => new Date(f.modifiedTime) > cutoff);

    for (const file of newFiles) {
      if (!file.name.toLowerCase().endsWith(".csv")) continue;
      const content = await _downloadDriveFile(file.id, conn.accessToken);
      await _triggerCsvImport(conn.shop, file.name, content, "google_drive", file.id);
    }

    await prisma.driveConnection.update({
      where: { id: connectionId },
      data: { lastPolledAt: new Date() },
    });
  } catch (err) {
    console.error(`[AutoImport] Drive poll failed for ${conn.shop}:`, err);
  }
}

/**
 * Poll a connected Dropbox folder for new CSV files.
 */
export async function pollDropboxFolder(connectionId: string): Promise<void> {
  const conn = await prisma.driveConnection.findUnique({ where: { id: connectionId } });
  if (!conn || !conn.isActive || conn.provider !== "dropbox") return;

  try {
    const files = await _listDropboxFiles(conn.folderPath, conn.accessToken);
    const cutoff = conn.lastPolledAt ?? new Date(0);

    const newFiles = files.filter(f => new Date(f.modifiedTime) > cutoff);

    for (const file of newFiles) {
      if (!file.name.toLowerCase().endsWith(".csv")) continue;
      const content = await _downloadDropboxFile(file.id, conn.accessToken);
      await _triggerCsvImport(conn.shop, file.name, content, "dropbox", file.id);
    }

    await prisma.driveConnection.update({
      where: { id: connectionId },
      data: { lastPolledAt: new Date() },
    });
  } catch (err) {
    console.error(`[AutoImport] Dropbox poll failed for ${conn.shop}:`, err);
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

async function _triggerCsvImport(
  shop: string,
  filename: string,
  csvContent: string,
  source: string,
  sourceRef: string
): Promise<string> {
  // Create a job record
  const job = await prisma.importJob.create({
    data: { shop, filename, status: "PENDING" },
  });

  // Record the source
  await prisma.importJobSource.create({
    data: { jobId: job.id, source, sourceRef },
  });

  // Run import asynchronously (fire and forget — the job record tracks progress)
  // In a real deployment this would be queued via QStash or Trigger.dev
  // For now we run it inline (Railway Railway single-process mode)
  setImmediate(async () => {
    try {
      // Auto-import uses pre-created ImportRow records — rows must be added before
      // calling processImportJob. For now, parse CSV and create rows, then process.
      await _parseAndQueueRows(job.id, shop, csvContent);
    } catch (err) {
      console.error(`[AutoImport] Import job ${job.id} failed:`, err);
      await prisma.importJob.update({
        where: { id: job.id },
        data: { status: "FAILED" },
      });
    }
  });

  return job.id;
}

async function _listDriveFiles(folderId: string, accessToken: string): Promise<DriveFile[]> {
  const url = `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents&fields=files(id,name,modifiedTime)&orderBy=modifiedTime+desc&pageSize=20`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) throw new Error(`Drive list failed: ${resp.status}`);
  const data = await resp.json() as { files: DriveFile[] };
  return data.files ?? [];
}

async function _downloadDriveFile(fileId: string, accessToken: string): Promise<string> {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) throw new Error(`Drive download failed: ${resp.status}`);
  return resp.text();
}

async function _listDropboxFiles(folderPath: string, accessToken: string): Promise<DriveFile[]> {
  const resp = await fetch("https://api.dropboxapi.com/2/files/list_folder", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ path: folderPath, limit: 20 }),
  });
  if (!resp.ok) throw new Error(`Dropbox list failed: ${resp.status}`);
  const data = await resp.json() as { entries: Array<{ id: string; name: string; client_modified: string }> };
  return (data.entries ?? []).map(e => ({
    id: e.id,
    name: e.name,
    modifiedTime: e.client_modified,
  }));
}

async function _downloadDropboxFile(fileId: string, accessToken: string): Promise<string> {
  const resp = await fetch("https://content.dropboxapi.com/2/files/download", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Dropbox-API-Arg": JSON.stringify({ path: fileId }),
    },
  });
  if (!resp.ok) throw new Error(`Dropbox download failed: ${resp.status}`);
  return resp.text();
}

// ── CSV Parse + Queue ─────────────────────────────────────────────────────────

/**
 * Parse CSV content, create ImportRow records, and mark job as PENDING.
 * The actual Shopify API calls happen when the merchant views the history
 * (lazy processing) or via a separate webhook trigger.
 *
 * For immediate processing, the cron job calls processImportJob with an offline token.
 */
async function _parseAndQueueRows(jobId: string, shop: string, csvContent: string): Promise<void> {
  const { detectColumnMapping, mapCsvRows } = await import("./import.server");

  // Simple CSV parse
  const lines = csvContent.trim().split(/\r?\n/);
  if (lines.length < 2) {
    await prisma.importJob.update({ where: { id: jobId }, data: { status: "FAILED" } });
    return;
  }

  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
  const mapping = detectColumnMapping(headers);
  const rows = mapCsvRows(lines.slice(1), headers, mapping as any);

  // Create ImportRow records
  let rowIndex = 0;
  for (const row of rows) {
    await prisma.importRow.create({
      data: {
        jobId,
        rowIndex: rowIndex++,
        rawOrderId: row.orderName ?? "",
        rawTracking: row.tracking ?? "",
        rawCarrier: row.carrier ?? "",
        detectedCarrier: row.detectedCarrier ?? null,
        status: "PENDING",
      },
    });
  }

  await prisma.importJob.update({
    where: { id: jobId },
    data: {
      status: "PENDING",
      totalRows: rows.length,
      pendingRows: rows.length,
    },
  });
}
