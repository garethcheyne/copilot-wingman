import { decrypt } from './crypto.js';
import { pool } from '../db/client.js';

interface CopilotJwt {
  token: string;
  expiresAt: number; // unix ms
}

interface GhConnection {
  id: string;
  label: string;
  auth_method: string;
  encrypted_token: Buffer;
  status: string;
}

let cachedGitHubToken: string | null = null;
let cachedCopilotJwt: CopilotJwt | null = null;
let refreshLock: Promise<CopilotJwt> | null = null;

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? '';
const COPILOT_JWT_BUFFER_MS = 5 * 60 * 1000; // refresh 5 min before expiry

/**
 * Load the active GitHub token from DB, decrypt it.
 */
export async function loadGitHubToken(): Promise<string> {
  if (cachedGitHubToken) return cachedGitHubToken;

  const result = await pool.query<GhConnection>(
    `SELECT id, label, auth_method, encrypted_token, status
     FROM gh_connections
     WHERE status = 'active'
     ORDER BY updated_at DESC
     LIMIT 1`
  );

  if (result.rows.length === 0) {
    throw new Error('No active GitHub connection configured');
  }

  const row = result.rows[0];
  const buf = Buffer.isBuffer(row.encrypted_token)
    ? row.encrypted_token
    : Buffer.from(row.encrypted_token as unknown as string, 'hex');
  cachedGitHubToken = decrypt(buf, ENCRYPTION_KEY);
  return cachedGitHubToken;
}

/**
 * Exchange GitHub PAT for a short-lived Copilot JWT.
 * Tries multiple known endpoints for compatibility.
 */
async function exchangeForCopilotJwt(githubToken: string): Promise<CopilotJwt> {
  const endpoints = [
    'https://api.github.com/copilot_internal/v2/token',
    'https://api.github.com/copilot_internal/token',
    'https://api.github.com/copilot_internal/v2/token',
  ];

  // First try: get Copilot token via internal API
  for (const url of endpoints) {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `token ${githubToken}`,
        'User-Agent': 'GithubCopilot/1.300.0',
        'Editor-Version': 'vscode/1.100.0',
        'Editor-Plugin-Version': 'copilot/1.300.0',
        Accept: 'application/json',
      },
    });

    if (res.ok) {
      const data = (await res.json()) as { token: string; expires_at: number };
      return {
        token: data.token,
        expiresAt: data.expires_at * 1000,
      };
    }

    // If 401/403, token is bad or doesn't have Copilot access
    if (res.status === 401 || res.status === 403) {
      const body = await res.text();
      throw new Error(`GitHub rejected token (${res.status}): ${body}`);
    }
  }

  // Fallback: use the PAT directly as the bearer token for models API
  // This works with GitHub Models / Copilot API when the account has access
  return {
    token: githubToken,
    expiresAt: Date.now() + 60 * 60 * 1000, // treat as valid for 1 hour
  };
}

/**
 * Get a valid Copilot JWT, refreshing if needed.
 * Uses a mutex to avoid concurrent refresh races.
 */
export async function getCopilotToken(): Promise<string> {
  // If cached and not expiring soon, return it
  if (cachedCopilotJwt && Date.now() < cachedCopilotJwt.expiresAt - COPILOT_JWT_BUFFER_MS) {
    return cachedCopilotJwt.token;
  }

  // Mutex: if a refresh is already in flight, wait for it
  if (refreshLock) {
    const jwt = await refreshLock;
    return jwt.token;
  }

  refreshLock = (async () => {
    try {
      const githubToken = await loadGitHubToken();
      const jwt = await exchangeForCopilotJwt(githubToken);
      cachedCopilotJwt = jwt;
      return jwt;
    } finally {
      refreshLock = null;
    }
  })();

  const jwt = await refreshLock;
  return jwt.token;
}

/**
 * Invalidate all cached tokens (e.g. on 401 from Copilot API).
 */
export function invalidateTokenCache(): void {
  cachedGitHubToken = null;
  cachedCopilotJwt = null;
}

/**
 * Health check: validate the stored token is alive.
 * Returns detailed diagnostics about what works and what doesn't.
 */
export async function validateConnection(): Promise<{
  ok: boolean;
  username?: string;
  tokenType?: string;
  copilotEnabled?: boolean;
  error?: string;
  details?: string;
}> {
  try {
    const githubToken = await loadGitHubToken();

    // Detect token type
    const tokenType = githubToken.startsWith('ghp_')
      ? 'classic'
      : githubToken.startsWith('github_pat_')
        ? 'fine-grained'
        : 'unknown';

    // Step 1: Check GitHub user (validates token is alive)
    const userRes = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `token ${githubToken}`,
        'User-Agent': 'GithubCopilot/1.300.0',
      },
    });

    if (!userRes.ok) {
      return {
        ok: false,
        tokenType,
        error: `GitHub token invalid (${userRes.status})`,
        details: 'Your PAT was rejected by GitHub. It may be expired or revoked.',
      };
    }

    const user = (await userRes.json()) as { login: string };

    // Step 2: Check Copilot subscription
    const copilotRes = await fetch('https://api.github.com/copilot_internal/v2/token', {
      headers: {
        Authorization: `token ${githubToken}`,
        'User-Agent': 'GithubCopilot/1.300.0',
        'Editor-Version': 'vscode/1.100.0',
        'Editor-Plugin-Version': 'copilot/1.300.0',
        Accept: 'application/json',
      },
    });

    if (copilotRes.ok) {
      const data = (await copilotRes.json()) as { token: string; expires_at: number };
      cachedCopilotJwt = { token: data.token, expiresAt: data.expires_at * 1000 };
      return { ok: true, username: user.login, tokenType, copilotEnabled: true };
    }

    // Token exchange failed — diagnose why
    if (copilotRes.status === 404) {
      if (tokenType === 'fine-grained') {
        return {
          ok: false,
          username: user.login,
          tokenType,
          copilotEnabled: false,
          error: 'Fine-grained tokens cannot access the Copilot API.',
          details: 'Create a classic token (ghp_...) instead. Go to GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token. No scopes needed.',
        };
      }
      return {
        ok: false,
        username: user.login,
        tokenType,
        copilotEnabled: false,
        error: 'Copilot access not available for this account.',
        details: 'Your GitHub account may not have an active Copilot subscription, or Copilot may not be enabled for your organization.',
      };
    }

    if (copilotRes.status === 401 || copilotRes.status === 403) {
      const body = await copilotRes.text();
      return {
        ok: false,
        username: user.login,
        tokenType,
        copilotEnabled: false,
        error: `Copilot access denied (${copilotRes.status}).`,
        details: body,
      };
    }

    return {
      ok: false,
      username: user.login,
      tokenType,
      error: `Unexpected response from Copilot token endpoint (${copilotRes.status}).`,
    };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
