const PROXY_URL = process.env.COPILOT_PROXY_URL ?? "http://localhost:3200";
const API_KEY = process.env.INTERNAL_API_KEY ?? "";

interface ChatResponse {
  sessionId: string;
  message: string;
}

export async function sendChatMessage(
  sessionKey: string,
  message: string,
  systemPrompt?: string
): Promise<ChatResponse> {
  const res = await fetch(`${PROXY_URL}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": API_KEY,
    },
    body: JSON.stringify({ sessionKey, message, systemPrompt }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Proxy error (${res.status}): ${body}`);
  }

  return res.json();
}

export async function getConnectionStatus() {
  const res = await fetch(`${PROXY_URL}/api/admin/connection`, {
    headers: { "X-Api-Key": API_KEY },
  });
  return res.json();
}

export async function getHealth() {
  const res = await fetch(`${PROXY_URL}/health`);
  return res.json();
}
