const PROXY_URL = process.env.NEXT_PUBLIC_PROXY_URL ?? "http://localhost:3200";
const TOKEN_KEY = "wingman_session_token";

/**
 * Authenticated fetch for admin API calls.
 * Automatically attaches the session token from localStorage.
 */
export async function adminFetch(
  path: string,
  init?: RequestInit
): Promise<Response> {
  const token =
    typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;

  const headers = new Headers(init?.headers);
  if (token) {
    headers.set("x-session-token", token);
  }
  if (!headers.has("Content-Type") && init?.body) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(`${PROXY_URL}${path}`, {
    ...init,
    headers,
  });
}
