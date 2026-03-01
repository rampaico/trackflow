/**
 * /webhooks/cron — Poll Drive/Dropbox connections
 * 
 * Call this endpoint every 15 minutes from Railway's cron or a cron service.
 * Protected with CRON_SECRET env var.
 */
import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { prisma } from "../db.server";
import { pollDriveFolder, pollDropboxFolder } from "../auto-import.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const secret = request.headers.get("x-cron-secret");
  if (secret !== process.env.CRON_SECRET) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const connections = await prisma.driveConnection.findMany({
    where: { isActive: true },
    select: { id: true, provider: true, shop: true },
  });

  const results = await Promise.allSettled(
    connections.map(async (conn) => {
      if (conn.provider === "google_drive") {
        await pollDriveFolder(conn.id);
      } else if (conn.provider === "dropbox") {
        await pollDropboxFolder(conn.id);
      }
      return { id: conn.id, shop: conn.shop, provider: conn.provider };
    })
  );

  const ok = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.filter((r) => r.status === "rejected").length;

  return json({ polled: connections.length, ok, failed });
};

export const loader = async () => {
  return json({ endpoint: "TrackFlow cron poll" });
};
