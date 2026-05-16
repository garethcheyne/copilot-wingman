/**
 * Build-time application version, sourced from the repo root VERSION file
 * via next.config.ts → process.env.NEXT_PUBLIC_APP_VERSION.
 *
 * Format: CalVer YYYY.MM.DD.HHmm (e.g. 2026.05.16.1600).
 */
export const APP_VERSION: string =
  process.env.NEXT_PUBLIC_APP_VERSION || "dev";

/** Short tagline used under the Wingman wordmark in brand marks.
 *  Describes what Wingman *is* — a chat UI in front of your existing
 *  GitHub Copilot subscription, exposing its full model catalog. */
export const APP_TAGLINE = "Powered by GitHub Copilot";
