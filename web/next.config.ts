import type { NextConfig } from "next";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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
  webpack(config) {
    if (config.optimization?.splitChunks) {
      config.optimization.splitChunks.automaticNameDelimiter = "-";
    }
    return config;
  },
};

export default nextConfig;
