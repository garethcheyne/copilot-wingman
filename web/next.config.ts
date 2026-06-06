import type { NextConfig } from "next";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

// Read the canonical VERSION file from the repo root and expose it to the app
// at build time so the UI never drifts from the published version.
function readVersion(): string {
  try {
    return readFileSync(join(__dirname, "..", "VERSION"), "utf8").trim();
  } catch {
    return "dev";
  }
}

const APP_VERSION = readVersion();

const nextConfig: NextConfig = {
  output: "standalone",
  env: {
    NEXT_PUBLIC_APP_VERSION: APP_VERSION,
  },
  // Whitelist LAN origins so the Next dev server serves chunks + accepts
  // HMR for devices browsing the LAN IP (e.g. phones on Wi-Fi hitting
  // http://192.168.0.109:3410). Without this, dev assets are blocked
  // for non-localhost origins and the app never hydrates.
  allowedDevOrigins: ["192.168.0.109", "*.local"],
  // `pwa-safezone` ships ESM modules that originally carried a
  // "use client" banner. tsup strips it during bundling, so we restore
  // the client-component boundary via web/components/safe-area-providers.tsx.
  // The package still needs Next to transpile it (it imports React JSX
  // runtime) — that's what transpilePackages enables.
  transpilePackages: ["pwa-safezone"],
  webpack(config) {
    if (config.optimization?.splitChunks) {
      config.optimization.splitChunks.automaticNameDelimiter = "-";
    }

    // pdf.js worker — emit as a static asset so the browser can load it via URL
    config.module.rules.push({
      test: /pdf\.worker(\.min)?\.mjs$/,
      type: "asset/resource",
      generator: {
        filename: "static/worker/[hash][ext][query]",
      },
    });

    return config;
  },
};

export default nextConfig;
