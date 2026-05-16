/**
 * Explore what the Copilot API exposes: models, endpoints, capabilities.
 * Run with: npx tsx src/scripts/explore-api.ts
 */
import 'dotenv/config';
import { pool } from '../db/client.js';
import { decrypt } from '../services/crypto.js';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? '';

async function getTokens() {
  const result = await pool.query(
    `SELECT encrypted_token FROM gh_connections WHERE status = 'active' ORDER BY updated_at DESC LIMIT 1`
  );
  if (result.rows.length === 0) throw new Error('No active connection');
  const buf = Buffer.isBuffer(result.rows[0].encrypted_token)
    ? result.rows[0].encrypted_token
    : Buffer.from(result.rows[0].encrypted_token as string, 'hex');
  const githubToken = decrypt(buf, ENCRYPTION_KEY);

  // Exchange for Copilot JWT
  const jwtRes = await fetch('https://api.github.com/copilot_internal/v2/token', {
    headers: {
      Authorization: `token ${githubToken}`,
      'User-Agent': 'GithubCopilot/1.300.0',
      'Editor-Version': 'vscode/1.100.0',
      'Editor-Plugin-Version': 'copilot-chat/0.28.0',
      Accept: 'application/json',
    },
  });
  const jwtData = await jwtRes.json() as any;
  return { githubToken, copilotJwt: jwtData.token, jwtFull: jwtData };
}

async function probe(label: string, url: string, token: string, headers: Record<string, string> = {}) {
  console.log(`\n=== ${label} ===`);
  console.log(`  URL: ${url}`);
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'GithubCopilot/1.300.0',
        'Copilot-Integration-Id': 'vscode-chat',
        'Editor-Version': 'vscode/1.100.0',
        'Editor-Plugin-Version': 'copilot-chat/0.28.0',
        Accept: 'application/json',
        ...headers,
      },
    });
    console.log(`  Status: ${res.status}`);
    const text = await res.text();
    try {
      const json = JSON.parse(text);
      console.log(`  Response:`, JSON.stringify(json, null, 2).slice(0, 2000));
    } catch {
      console.log(`  Response: ${text.slice(0, 1000)}`);
    }
  } catch (err) {
    console.log(`  Error: ${(err as Error).message}`);
  }
}

async function probeGithub(label: string, url: string, token: string) {
  console.log(`\n=== ${label} ===`);
  console.log(`  URL: ${url}`);
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `token ${token}`,
        'User-Agent': 'GithubCopilot/1.300.0',
        Accept: 'application/json',
      },
    });
    console.log(`  Status: ${res.status}`);
    const text = await res.text();
    try {
      const json = JSON.parse(text);
      console.log(`  Response:`, JSON.stringify(json, null, 2).slice(0, 2000));
    } catch {
      console.log(`  Response: ${text.slice(0, 1000)}`);
    }
  } catch (err) {
    console.log(`  Error: ${(err as Error).message}`);
  }
}

async function main() {
  const { githubToken, copilotJwt, jwtFull } = await getTokens();
  
  console.log('=== JWT Token Info ===');
  console.log('  expires_at:', jwtFull.expires_at, new Date(jwtFull.expires_at * 1000).toISOString());
  console.log('  endpoints:', jwtFull.endpoints);
  // Decode JWT payload
  const parts = copilotJwt.split('.');
  if (parts.length === 3) {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    console.log('  JWT claims:', JSON.stringify(payload, null, 2).slice(0, 1500));
  }

  // Probe Copilot API endpoints (using JWT)
  await probe('Models List', 'https://api.githubcopilot.com/models', copilotJwt);
  await probe('Agents/Extensions', 'https://api.githubcopilot.com/agents', copilotJwt);
  await probe('Copilot Chat Models', 'https://api.githubcopilot.com/chat/models', copilotJwt);

  // Probe GitHub API endpoints (using OAuth token)  
  await probeGithub('Copilot Billing/Subscription', 'https://api.github.com/copilot_internal/user', githubToken);
  await probeGithub('User Copilot Settings', 'https://api.github.com/user/copilot_billing/seats', githubToken);
  await probeGithub('User Info', 'https://api.github.com/user', githubToken);
  await probeGithub('Copilot Models', 'https://api.github.com/copilot_internal/models', githubToken);
  
  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
