import { vitePlugin as remix } from "@remix-run/dev";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

// Related: https://github.com/remix-run/remix/issues/2835#issuecomment-1144947635
// Replace the HOST env var with SHOPIFY_APP_URL so that it's
// temporary solution until we can express the config in a better way
if (
  process.env.HOST &&
  (!process.env.SHOPIFY_APP_URL ||
    process.env.SHOPIFY_APP_URL === process.env.HOST)
) {
  process.env.SHOPIFY_APP_URL = process.env.HOST;
  delete process.env.HOST;
}

const host = new URL(process.env.SHOPIFY_APP_URL || "http://localhost")
  .hostname;

export default defineConfig({
  server: {
    port: Number(process.env.PORT || 3000),
    hmr: host === "localhost" ? true : { protocol: "ws", host, port: 64999 },
    allowedHosts: [
      "localhost",
      ".trycloudflare.com",
      ".ngrok.io",
      ".ngrok-free.app",
    ],
  },
  plugins: [
    remix({
      ignoredRouteFiles: ["**/.*"],
    }),
    tsconfigPaths(),
  ],
  build: {
    assetsInlineLimit: 0,
  },
});
