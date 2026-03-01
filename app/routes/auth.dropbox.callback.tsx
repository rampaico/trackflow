/**
 * Dropbox OAuth callback
 */
import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { prisma } from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const shop = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error || !code || !shop) {
    return redirect(`/app/auto-import?error=${encodeURIComponent(error ?? "oauth_failed")}`);
  }

  try {
    const tokenRes = await fetch("https://api.dropboxapi.com/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        grant_type: "authorization_code",
        client_id: process.env.DROPBOX_APP_KEY ?? "",
        client_secret: process.env.DROPBOX_APP_SECRET ?? "",
        redirect_uri: `${process.env.SHOPIFY_APP_URL ?? ""}/auth/dropbox/callback`,
      }),
    });

    if (!tokenRes.ok) {
      throw new Error(`Dropbox token exchange failed: ${tokenRes.status}`);
    }

    const tokens = await tokenRes.json() as {
      access_token: string;
      refresh_token?: string;
      account_id: string;
    };

    // Default to root folder
    await prisma.driveConnection.create({
      data: {
        shop,
        provider: "dropbox",
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        folderPath: "",
        folderName: "Dropbox root",
        isActive: true,
      },
    });

    return redirect("/app/auto-import?connected=dropbox");
  } catch (err) {
    console.error("[Dropbox OAuth callback]", err);
    return redirect("/app/auto-import?error=dropbox_token_exchange_failed");
  }
};
