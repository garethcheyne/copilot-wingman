"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";

type ConnectionHealth = "healthy" | "expired" | "disconnected" | "loading";

interface ConnectionContextValue {
  health: ConnectionHealth;
  message: string | null;
  refresh: () => void;
}

const ConnectionContext = createContext<ConnectionContextValue>({
  health: "loading",
  message: null,
  refresh: () => {},
});

export function useConnection() {
  return useContext(ConnectionContext);
}

const PROXY =
  process.env.NEXT_PUBLIC_PROXY_URL || "http://localhost:3200";

export function ConnectionProvider({ children }: { children: React.ReactNode }) {
  const [health, setHealth] = useState<ConnectionHealth>("loading");
  const [message, setMessage] = useState<string | null>(null);

  const check = useCallback(async () => {
    try {
      const res = await fetch(`${PROXY}/api/admin/connection`, {
        headers: {
          "x-api-key": process.env.NEXT_PUBLIC_API_KEY || "",
        },
      });
      if (!res.ok) {
        setHealth("disconnected");
        setMessage("Cannot reach proxy");
        return;
      }
      const data = await res.json();
      if (!data.connected) {
        setHealth("disconnected");
        setMessage("No GitHub connection configured");
        return;
      }
      const status = data.connection?.status;
      if (status === "active") {
        setHealth("healthy");
        setMessage(null);
      } else {
        setHealth("expired");
        setMessage(
          status === "expired"
            ? "GitHub session expired — re-authenticate in Admin → Connection"
            : status === "revoked"
            ? "GitHub token revoked — re-authenticate in Admin → Connection"
            : `Connection error — ${data.connection?.last_error || "check Admin → Connection"}`
        );
      }
    } catch {
      setHealth("disconnected");
      setMessage("Cannot reach proxy");
    }
  }, []);

  useEffect(() => {
    check();
    const interval = setInterval(check, 30_000); // poll every 30s
    return () => clearInterval(interval);
  }, [check]);

  return (
    <ConnectionContext.Provider value={{ health, message, refresh: check }}>
      {children}
    </ConnectionContext.Provider>
  );
}
