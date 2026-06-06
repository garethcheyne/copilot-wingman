"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    // Note: in plain-http dev we still register so the file is exposed, but the
    // browser only honours push on https/localhost.
    const register = async () => {
      try {
        await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        });
      } catch {
        // service worker registration failed — swallow, the app still works.
      }
    };
    register();
  }, []);
  return null;
}
