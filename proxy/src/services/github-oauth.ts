/**
 * GitHub Device OAuth Flow for Copilot
 * 
 * This implements the same auth flow that VS Code's Copilot extension uses.
 * The Copilot extension uses a GitHub OAuth App with client_id "Iv1.b507a08c87ecfe98"
 * which grants access to copilot_internal endpoints that PATs cannot reach (especially for EMU accounts).
 *
 * Flow:
 * 1. POST https://github.com/login/device/code → get device_code + user_code + verification_uri
 * 2. User visits verification_uri, enters user_code
 * 3. Poll POST https://github.com/login/oauth/access_token until we get an access_token
 * 4. Store access_token (encrypted) — this token works with copilot_internal/v2/token
 */

// The official Copilot VS Code extension OAuth App client ID
const COPILOT_CLIENT_ID = 'Iv1.b507a08c87ecfe98';

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

interface PollResult {
  status: 'pending' | 'success' | 'expired' | 'error';
  access_token?: string;
  error?: string;
  interval?: number;
}

/**
 * Step 1: Initiate device OAuth flow. Returns the user_code and verification_uri
 * that the user needs to complete in their browser.
 */
export async function initiateDeviceAuth(): Promise<DeviceCodeResponse> {
  const res = await fetch('https://github.com/login/device/code', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      client_id: COPILOT_CLIENT_ID,
      scope: 'read:user',
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to initiate device auth (${res.status}): ${body}`);
  }

  const data = (await res.json()) as DeviceCodeResponse;

  return data;
}

/**
 * Step 3: Poll for the OAuth token. Call this repeatedly until status is 'success' or 'expired'.
 * Does NOT depend on in-memory state — always asks GitHub directly.
 */
export async function pollDeviceAuth(deviceCode: string): Promise<PollResult> {
  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      client_id: COPILOT_CLIENT_ID,
      device_code: deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    }),
  });

  if (!res.ok) {
    console.error(`[oauth] Poll failed with status ${res.status}`);
    return { status: 'error', error: `OAuth poll failed (${res.status})` };
  }

  const data = (await res.json()) as any;
  console.log('[oauth] Poll response:', JSON.stringify(data));

  if (data.error === 'authorization_pending') {
    return { status: 'pending' };
  }

  if (data.error === 'slow_down') {
    return { status: 'pending', interval: data.interval || 10 };
  }

  if (data.error === 'expired_token') {
    return { status: 'expired', error: 'Device code expired. Start again.' };
  }

  if (data.error) {
    return { status: 'error', error: `OAuth error: ${data.error} - ${data.error_description}` };
  }

  if (data.access_token) {
    return { status: 'success', access_token: data.access_token };
  }

  return { status: 'error', error: 'Unexpected response from GitHub OAuth' };
}
