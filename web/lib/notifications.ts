/**
 * Wingman notification helpers.
 *
 * Two layers are exposed:
 *  - `notifyLocal()` — fires a browser/system notification via the registered
 *    service worker whenever the tab is hidden (so a long-running chat reply
 *    can wake the user without server-side push being configured).
 *  - `subscribeToPush()` / `unsubscribeFromPush()` — full Web Push flow,
 *    activated only when a VAPID public key is provided at build time. Until
 *    the backend ships the `/api/admin/push/*` endpoints (see TODO), these
 *    are safe no-ops that surface a clear error.
 */

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

export type NotificationCapability =
  | "unsupported"
  | "default"
  | "granted"
  | "denied";

export function getCapability(): NotificationCapability {
  if (typeof window === "undefined") return "unsupported";
  if (!("Notification" in window) || !("serviceWorker" in navigator))
    return "unsupported";
  return Notification.permission as NotificationCapability;
}

export async function requestPermission(): Promise<NotificationCapability> {
  if (getCapability() === "unsupported") return "unsupported";
  // Support both the modern promise form and the legacy callback form
  // (older Safari resolves to undefined from the promise).
  const result = await new Promise<NotificationPermission>((resolve) => {
    const maybePromise = Notification.requestPermission((p) => resolve(p));
    if (maybePromise && typeof maybePromise.then === "function") {
      maybePromise.then(resolve);
    }
  });
  return (result ?? Notification.permission) as NotificationCapability;
}

/**
 * Resolve the active service-worker registration without hanging forever.
 * `navigator.serviceWorker.ready` never resolves when nothing is registered,
 * so we bail fast if there's no registration and otherwise race against a
 * timeout.
 */
async function getReadyRegistration(
  timeoutMs = 3000,
): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  const existing = await navigator.serviceWorker.getRegistration();
  if (!existing) return null;
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ]);
}

/**
 * Fire a notification via the service worker when (and only when) the tab is
 * hidden. Returns true if a notification was actually shown.
 */
export async function notifyWhenHidden(payload: {
  title: string;
  body: string;
  url?: string;
}): Promise<boolean> {
  if (typeof document === "undefined") return false;
  if (document.visibilityState === "visible") return false;
  if (getCapability() !== "granted") return false;
  if (!("serviceWorker" in navigator)) return false;
  try {
    const reg = await getReadyRegistration();
    if (reg?.active) {
      reg.active.postMessage({ type: "wingman:notify", payload });
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const arr = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function isPushConfigured(): boolean {
  return Boolean(VAPID_PUBLIC_KEY);
}

export async function getExistingSubscription(): Promise<PushSubscription | null> {
  const reg = await getReadyRegistration();
  if (!reg) return null;
  return reg.pushManager.getSubscription();
}

export async function subscribeToPush(): Promise<PushSubscription | null> {
  if (!isPushConfigured()) {
    throw new Error(
      "Push notifications are not configured. Set NEXT_PUBLIC_VAPID_PUBLIC_KEY and run the proxy with VAPID_PRIVATE_KEY.",
    );
  }
  const reg = await getReadyRegistration();
  if (!reg) return null;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  });
  return sub;
}

export async function unsubscribeFromPush(): Promise<boolean> {
  const sub = await getExistingSubscription();
  if (!sub) return true;
  return sub.unsubscribe();
}
