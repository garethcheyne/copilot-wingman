"use client";

import { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { adminFetch } from "@/lib/admin-api";
import { randomUUID } from "@/lib/utils";

const STORAGE_KEY = "wingman_active_session";

interface SessionInfo {
  id: string;
  sessionKey: string;
  messageCount: number;
  lastMessageAt: string | null;
  updatedAt: string;
  createdAt: string;
  preview?: string; // first user message as preview
}

interface SessionMessage {
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
  // Start empty so server and client render identically (calling randomUUID in
  // the initializer produced a server value that never matched the client →
  // hydration mismatch). The real key is resolved on mount below.
  const [activeSessionKey, setActiveSessionKey] = useState<string>("");
  const [loading, setLoading] = useState(true);

  // Resolve the active session key on the client only.
  useEffect(() => {
    setActiveSessionKey(localStorage.getItem(STORAGE_KEY) || randomUUID());
  }, []);

  // Persist active session key (skip the initial empty placeholder).
  useEffect(() => {
    if (activeSessionKey) localStorage.setItem(STORAGE_KEY, activeSessionKey);
  }, [activeSessionKey]);

  const refreshSessions = useCallback(async () => {
    try {
      // Chat sidebar only shows conversations started from THIS UI. API-key
      // driven sessions are auditable from /admin/sessions, not here.
      const res = await adminFetch("/api/admin/sessions?source=ui");
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
    const newKey = randomUUID();
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
        setActiveSessionKey(randomUUID());
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

  const value = useMemo<SessionContextValue>(
    () => ({
      sessions,
      activeSessionKey,
      loading,
      createNewSession,
      switchSession,
      deleteSession: deleteSessionFn,
      refreshSessions,
      loadSessionMessages,
    }),
    [
      sessions,
      activeSessionKey,
      loading,
      createNewSession,
      switchSession,
      deleteSessionFn,
      refreshSessions,
      loadSessionMessages,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
