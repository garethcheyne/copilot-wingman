"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { getAuthStatus, login as apiLogin, logout as apiLogout, setup as apiSetup } from "@/lib/auth";
import type { AuthUser } from "@/lib/auth";

interface AuthContextValue {
  user: AuthUser | null;
  needsSetup: boolean;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  setup: (username: string, password: string, displayName?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = "wingman_session_token";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [loading, setLoading] = useState(true);

  const checkStatus = useCallback(async () => {
    try {
      const token = localStorage.getItem(TOKEN_KEY);
      const status = await getAuthStatus(token);
      setNeedsSetup(status.needsSetup);
      setUser(status.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  const login = async (username: string, password: string) => {
    const result = await apiLogin(username, password);
    localStorage.setItem(TOKEN_KEY, result.token);
    setUser(result.user);
    setNeedsSetup(false);
  };

  const setup = async (username: string, password: string, displayName?: string) => {
    const result = await apiSetup(username, password, displayName);
    localStorage.setItem(TOKEN_KEY, result.token);
    setUser(result.user);
    setNeedsSetup(false);
  };

  const logout = async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
      await apiLogout(token);
      localStorage.removeItem(TOKEN_KEY);
    }
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, needsSetup, loading, login, setup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
