// Smoke test for @wingman/sdk against a live Wingman proxy.
//
// Reads WINGMAN_API_KEY and WINGMAN_BASE_URL from the repo-root .env file
// (or the process environment if already set). Both are required.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import Wingman from "../dist/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = resolve(__dirname, "..", "..", "..", ".env");

function loadDotEnv(path) {
  try {
    const text = readFileSync(path, "utf8");
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    /* .env optional; env vars may already be set */
  }
}

loadDotEnv(ENV_PATH);

const apiKey =
  process.env.WINGMAN_API_KEY ?? process.env.API_PROD_TESTING_KEY_01;
const baseURL = process.env.WINGMAN_BASE_URL ?? process.env.PROD_URL;
if (!apiKey) {
  console.error(
    "Set WINGMAN_API_KEY (or API_PROD_TESTING_KEY_01 in .env) before running the smoke test."
  );
  process.exit(2);
}
if (!baseURL) {
  console.error(
    "Set WINGMAN_BASE_URL (or PROD_URL in .env) before running the smoke test."
  );
  process.exit(2);
}

const client = new Wingman({ apiKey, baseURL });
let failures = 0;
const log = (label, ok, info = "") => {
  const tag = ok ? "PASS" : "FAIL";
  if (!ok) failures++;
  console.log(`[${tag}] ${label}${info ? ` — ${info}` : ""}`);
};

// 1) Health
try {
  const h = await client.health.check();
  log("health.check", typeof h?.status === "string", `status=${h?.status}`);
} catch (err) {
  log("health.check", false, err.message);
}

// 2) Models
let firstModel = process.env.WINGMAN_MODEL;
try {
  const models = await client.models.list();
  if (!firstModel) firstModel = models[0]?.id;
  log("models.list", models.length > 0, `count=${models.length} first=${firstModel ?? "?"}`);
} catch (err) {
  log("models.list", false, err.message);
}

// 3) Chat (non-streaming)
const sessionKey = `sdk-smoke-${Date.now()}`;
try {
  const resp = await client.chat.create({
    sessionKey,
    message: "Reply with exactly one word: pong.",
    model: firstModel,
  });
  const text = resp.message?.trim() ?? "";
  log("chat.create (non-stream)", text.length > 0, JSON.stringify(text.slice(0, 60)));
} catch (err) {
  log("chat.create (non-stream)", false, err.message);
}

// 4) Chat (streaming)
try {
  const helper = client.chat.stream({
    sessionKey: `${sessionKey}-stream`,
    message: "Count from one to five, space separated.",
    model: firstModel,
  });
  let deltas = 0;
  for await (const _ of helper) deltas++;
  const text = await helper.finalText();
  log("chat.stream", deltas > 0 && text.length > 0, `deltas=${deltas} text=${JSON.stringify(text.slice(0, 60))}`);
} catch (err) {
  log("chat.stream", false, err.message);
}

// 5) Error mapping — bad key
try {
  const bad = new Wingman({ apiKey: "wm_obviously_invalid_key", baseURL });
  await bad.models.list();
  log("error.auth", false, "expected 401 but request succeeded");
} catch (err) {
  log("error.auth", err.name === "AuthenticationError" || err.status === 401, `${err.name} status=${err.status}`);
}

console.log(failures === 0 ? "\nAll smoke tests passed." : `\n${failures} smoke test(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
