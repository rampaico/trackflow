/**
 * Google Drive OAuth callback
 * After user authorizes, redirect to folder selection UI
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
    // Exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_OAUTH_CLIENT_ID ?? "",
        client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? "",
        redirect_uri: `${process.env.SHOPIFY_APP_URL ?? ""}/auth/google/callback`,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      throw new Error(`Token exchange failed: ${tokenRes.status}`);
    }

    const tokens = await tokenRes.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };

    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    // List root folder to get a default folder ID (user picks it later)
    // For now, store with root ("root" folder ID) and let user refine
    await prisma.driveConnection.create({
      data: {
        shop,
        provider: "google_drive",
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt,
        folderPath: "root",
        folderName: "My Drive (root — configure folder in settings)",
        isActive: true,
      },
    });

    return redirect("/app/auto-import?connected=google_drive");
  } catch (err) {
    console.error("[Google OAuth callback]", err);
    return redirect("/app/auto-import?error=google_token_exchange_failed");
  }
};
