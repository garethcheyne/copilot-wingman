const PROXY_URL = process.env.NEXT_PUBLIC_PROXY_URL ?? "http://localhost:3200";

export interface AuthUser {
  id: string;
  username: string;
  display_name: string;
  role: string;
}

export interface AuthStatus {
  needsSetup: boolean;
  user: AuthUser | null;
}

export async function getAuthStatus(token: string | null): Promise<AuthStatus> {
  const headers: Record<string, string> = {};
  if (token) headers["x-session-token"] = token;

  const res = await fetch(`${PROXY_URL}/api/auth/status`, { headers });
  if (!res.ok) throw new Error("Failed to check auth status");
  return res.json();
}

export async function login(username: string, password: string): Promise<{ user: AuthUser; token: string }> {
  const res = await fetch(`${PROXY_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: "Login failed" }));
    throw new Error(body.error || "Login failed");
  }

  return res.json();
}

export async function setup(username: string, password: string, displayName?: string): Promise<{ user: AuthUser; token: string }> {
  const res = await fetch(`${PROXY_URL}/api/auth/setup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password, displayName }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: "Setup failed" }));
    throw new Error(body.error || "Setup failed");
  }

  return res.json();
}

export async function logout(token: string): Promise<void> {
  await fetch(`${PROXY_URL}/api/auth/logout`, {
    method: "POST",
    headers: { "x-session-token": token },
  });
}
