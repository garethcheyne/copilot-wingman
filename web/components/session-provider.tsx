"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { adminFetch } from "@/lib/admin-api";

const PROXY_URL = process.env.NEXT_PUBLIC_PROXY_URL ?? "http://localhost:3200";
const STORAGE_KEY = "wingman_active_session";

export interface SessionInfo {
  id: string;
  sessionKey: string;
  messageCount: number;
  lastMessageAt: string | null;
  updatedAt: string;
  createdAt: string;
  preview?: string; // first user message as preview
}

export interface SessionMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

interface SessionContextValue {
  sessions: SessionInfo[];
  activeSessionKey: string;
  loading: boolean;
  createNewSession: () => void;
  switchSession: (sessionKey: string) => void;
  deleteSession: (sessionId: string) => Promise<void>;
  refreshSessions: () => Promise<void>;
  loadSessionMessages: (sessionId: string) => Promise<SessionMessage[]>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [activeSessionKey, setActiveSessionKey] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(STORAGE_KEY) || crypto.randomUUID();
    }
    return crypto.randomUUID();
  });
  const [loading, setLoading] = useState(true);

  // Persist active session key
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, activeSessionKey);
  }, [activeSessionKey]);

  const refreshSessions = useCallback(async () => {
    try {
      const res = await adminFetch("/api/admin/sessions");
      if (!res.ok) return;
      const data = await res.json();
      const list: SessionInfo[] = (data.sessions || []).map((s: any) => ({
        id: s.id,
        sessionKey: s.sessionKey,
        messageCount: s.messageCount || 0,
        lastMessageAt: s.lastMessageAt,
        updatedAt: s.updatedAt,
        createdAt: s.createdAt,
        preview: s.preview,
      }));
      setSessions(list);
    } catch {
      // proxy not reachable
    } finally {
      setLoading(false);
    }
  }, []);

  // Load sessions on mount
  useEffect(() => {
    refreshSessions();
  }, [refreshSessions]);

  const createNewSession = useCallback(() => {
    const newKey = crypto.randomUUID();
    setActiveSessionKey(newKey);
  }, []);

  const switchSession = useCallback((sessionKey: string) => {
    setActiveSessionKey(sessionKey);
  }, []);

  const deleteSessionFn = useCallback(async (sessionId: string) => {
    try {
      const session = sessions.find((s) => s.id === sessionId);
      await adminFetch(`/api/admin/sessions/${sessionId}`, { method: "DELETE" });
      // If we deleted the active session, create a new one
      if (session?.sessionKey === activeSessionKey) {
        setActiveSessionKey(crypto.randomUUID());
      }
      await refreshSessions();
    } catch {
      // ignore
    }
  }, [sessions, activeSessionKey, refreshSessions]);

  const loadSessionMessages = useCallback(async (sessionId: string): Promise<SessionMessage[]> => {
    try {
      const res = await adminFetch(`/api/admin/sessions/${sessionId}`);
      if (!res.ok) return [];
      const data = await res.json();
      return (data.messages || []).map((m: any) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.createdAt,
      }));
    } catch {
      return [];
    }
  }, []);

  return (
    <SessionContext.Provider
      value={{
        sessions,
        activeSessionKey,
        loading,
        createNewSession,
        switchSession,
        deleteSession: deleteSessionFn,
        refreshSessions,
        loadSessionMessages,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}
