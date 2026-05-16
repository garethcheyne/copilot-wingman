"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Settings,
  Loader2,
  CheckCircle2,
  XCircle,
  Eye,
  EyeOff,
  Trash2,
  Activity,
  ExternalLink,
  KeyRound,
} from "lucide-react";
import { adminFetch } from "@/lib/admin-api";
import { PushNotifications } from "@/components/push-notifications";

interface SettingRow {
  key: string;
  value: string | boolean;
  encrypted: boolean;
}

// Known setting definitions for display labels and descriptions
const SETTING_DEFS: Record<string, { label: string; description: string; encrypted?: boolean }> = {
  default_model: {
    label: "Default Model",
    description: "Fallback model when no model is specified in a request.",
  },
  llm_stats_api_key: {
    label: "LLM Stats API Key",
    description: "API key for llm-stats.com — provides benchmark scores, pricing, and model metadata for enrichment.",
    encrypted: true,
  },
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingRow[]>([]);
  const [loading, setLoading] = useState(true);

  // LLM Stats key management
  const [llmKeyInput, setLlmKeyInput] = useState("");
  const [llmKeyVisible, setLlmKeyVisible] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [testingKey, setTestingKey] = useState(false);
  const [deletingKey, setDeletingKey] = useState(false);
  const [llmKeySet, setLlmKeySet] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  // General status
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  // Password change
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [changingPw, setChangingPw] = useState(false);
  const [pwStatus, setPwStatus] = useState<"idle" | "success" | "error">("idle");
  const [pwMessage, setPwMessage] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await adminFetch("/api/admin/settings");
      if (res.ok) {
        const data = await res.json();
        const rows: SettingRow[] = Object.entries(data).map(([key, value]) => ({
          key,
          value: value as string | boolean,
          encrypted: SETTING_DEFS[key]?.encrypted ?? false,
        }));
        setSettings(rows);
        setLlmKeySet(data.llm_stats_api_key === true);
      }
    } catch {
      // proxy down
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const saveLlmKey = async () => {
    if (!llmKeyInput.trim()) return;
    setSavingKey(true);
    setStatus("idle");
    setTestResult(null);

    try {
      const res = await adminFetch("/api/admin/settings/llm_stats_api_key", {
        method: "PUT",
        body: JSON.stringify({ value: llmKeyInput.trim() }),
      });
      if (res.ok) {
        setLlmKeySet(true);
        setLlmKeyInput("");
        setStatus("success");
        setMessage("LLM Stats API key saved (encrypted at rest).");
        load();
      } else {
        const err = await res.json();
        setStatus("error");
        setMessage(err.error || "Failed to save key.");
      }
    } catch {
      setStatus("error");
      setMessage("Cannot reach proxy.");
    } finally {
      setSavingKey(false);
    }
  };

  const testLlmKey = async () => {
    setTestingKey(true);
    setTestResult(null);

    try {
      const res = await adminFetch("/api/admin/settings/llm-stats/test", {
        method: "POST",
      });
      const data = await res.json();
      if (data.ok) {
        setTestResult({ ok: true, message: `Connected — ${data.models_available} models available` });
      } else {
        setTestResult({ ok: false, message: data.error || "Test failed" });
      }
    } catch {
      setTestResult({ ok: false, message: "Cannot reach proxy." });
    } finally {
      setTestingKey(false);
    }
  };

  const deleteLlmKey = async () => {
    setDeletingKey(true);
    setTestResult(null);
    setStatus("idle");

    try {
      const res = await adminFetch("/api/admin/settings/llm_stats_api_key", {
        method: "DELETE",
      });
      if (res.ok) {
        setLlmKeySet(false);
        setLlmKeyInput("");
        setStatus("success");
        setMessage("LLM Stats API key removed.");
        load();
      }
    } catch {
      setStatus("error");
      setMessage("Cannot reach proxy.");
    } finally {
      setDeletingKey(false);
    }
  };

  const changePassword = async () => {
    setPwStatus("idle");
    setPwMessage("");

    if (!currentPw || !newPw) {
      setPwStatus("error");
      setPwMessage("All fields are required.");
      return;
    }
    if (newPw.length < 8) {
      setPwStatus("error");
      setPwMessage("New password must be at least 8 characters.");
      return;
    }
    if (newPw !== confirmPw) {
      setPwStatus("error");
      setPwMessage("New passwords do not match.");
      return;
    }

    setChangingPw(true);
    try {
      const res = await adminFetch("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
      });
      if (res.ok) {
        setPwStatus("success");
        setPwMessage("Password updated successfully.");
        setCurrentPw("");
        setNewPw("");
        setConfirmPw("");
      } else {
        const err = await res.json();
        setPwStatus("error");
        setPwMessage(err.error || "Failed to change password.");
      }
    } catch {
      setPwStatus("error");
      setPwMessage("Cannot reach proxy.");
    } finally {
      setChangingPw(false);
    }
  };

  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="space-y-2">
        <p className="font-mono text-[10px] tracking-[0.22em] uppercase text-muted-foreground">
          admin / settings
        </p>
        <h1 className="text-4xl font-display font-bold tracking-tight leading-none">
          <span className="text-copilot-gradient font-display font-bold">Settings</span>
        </h1>
        <p className="text-sm text-muted-foreground max-w-md">
          Application settings and third-party integrations. Sensitive keys are encrypted at rest with AES-256-GCM.
        </p>
      </div>

      {/* Status banner */}
      {status !== "idle" && (
        <Alert
          className={`backdrop-blur-md ${
            status === "success"
              ? "border-copilot-green/40 bg-copilot-green/6 text-copilot-green"
              : "border-destructive/40 bg-destructive/6 text-destructive"
          }`}
        >
          {status === "success" ? (
            <CheckCircle2 className="w-4 h-4" />
          ) : (
            <XCircle className="w-4 h-4" />
          )}
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}

      {/* Settings Table */}
      <section className="space-y-3">
        <p className="label-mono">// App Settings</p>
        <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-card/60 backdrop-blur-md">
          <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-primary/40 to-transparent" />
          <div className="divide-y divide-border/50">
            {loading ? (
              <div className="px-6 py-5 space-y-3">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-4 w-96" />
              </div>
            ) : settings.filter(s => !s.encrypted).length === 0 ? (
              <div className="px-6 py-8 text-center text-sm text-muted-foreground">
                No settings configured yet.
              </div>
            ) : (
              settings
                .filter((s) => !s.encrypted)
                .map((setting) => {
                  const def = SETTING_DEFS[setting.key];
                  return (
                    <div key={setting.key} className="px-6 py-4 flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          {def?.label ?? setting.key}
                        </p>
                        {def?.description && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {def.description}
                          </p>
                        )}
                      </div>
                      <div className="shrink-0">
                        <code className="text-sm font-mono px-3 py-1.5 rounded-md bg-background/60 border border-border/50">
                          {String(setting.value)}
                        </code>
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        </div>
      </section>

      {/* Change Password */}
      <section className="space-y-3">
        <p className="label-mono">// Account</p>
        <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-card/60 backdrop-blur-md">
          <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-amber-500/40 to-transparent" />
          <div className="px-6 py-6 space-y-5">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-card border border-border/70 flex items-center justify-center">
                <KeyRound className="w-4 h-4 text-amber-500" strokeWidth={2.2} />
              </div>
              <div>
                <h2 className="text-xl font-display font-bold leading-tight">Change Password</h2>
                <p className="text-sm text-muted-foreground mt-0.5">Update your admin account password.</p>
              </div>
            </div>

            <div className="rail-divider" />

            {pwStatus !== "idle" && (
              <div
                className={`flex items-center gap-2 px-4 py-3 rounded-lg border ${
                  pwStatus === "success"
                    ? "border-copilot-green/30 bg-copilot-green/6 text-copilot-green"
                    : "border-destructive/30 bg-destructive/6 text-destructive"
                }`}
              >
                {pwStatus === "success" ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 shrink-0" />
                )}
                <span className="text-sm">{pwMessage}</span>
              </div>
            )}

            <div className="space-y-3 max-w-sm">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Current Password</label>
                <Input
                  type="password"
                  value={currentPw}
                  onChange={(e) => setCurrentPw(e.target.value)}
                  placeholder="••••••••"
                  className="font-mono text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">New Password</label>
                <Input
                  type="password"
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  placeholder="Min 8 characters"
                  className="font-mono text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Confirm New Password</label>
                <Input
                  type="password"
                  value={confirmPw}
                  onChange={(e) => setConfirmPw(e.target.value)}
                  placeholder="••••••••"
                  className="font-mono text-sm"
                />
              </div>
              <Button
                onClick={changePassword}
                disabled={changingPw || !currentPw || !newPw || !confirmPw}
                className="bg-copilot-gradient hover:opacity-90 text-white border-0 mt-2"
              >
                {changingPw && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Update Password
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Notifications */}
      <section className="space-y-3">
        <p className="label-mono">// Notifications</p>
        <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-card/60 backdrop-blur-md">
          <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-accent/40 to-transparent" />
          <div className="px-6 py-6">
            <PushNotifications />
          </div>
        </div>
      </section>

      {/* LLM Stats Integration */}
      <section className="space-y-3">
        <p className="label-mono">// Integrations</p>
        <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-card/60 backdrop-blur-md">
          <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-copilot-purple/40 to-transparent" />

          <div className="px-6 py-6 space-y-5">
            {/* Header */}
            <div className="flex items-start gap-3">
              <div className="ring-copilot-gradient rounded-xl">
                <div className="w-10 h-10 rounded-xl bg-card flex items-center justify-center">
                  <Activity className="w-4 h-4 text-copilot-purple" strokeWidth={2.2} />
                </div>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-display font-bold leading-tight">
                    LLM Stats
                  </h2>
                  {llmKeySet && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono tracking-wider uppercase bg-copilot-green/10 text-copilot-green border border-copilot-green/30">
                      <span className="w-1.5 h-1.5 rounded-full bg-copilot-green" />
                      Connected
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground max-w-lg mt-0.5">
                  Enriches your model catalog with benchmark scores, pricing data, and detailed metadata from{" "}
                  <a
                    href="https://llm-stats.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-copilot-purple hover:underline inline-flex items-center gap-0.5"
                  >
                    llm-stats.com
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </p>
              </div>
            </div>

            <div className="rail-divider" />

            {/* Key Input / Status */}
            {llmKeySet ? (
              <div className="space-y-4">
                {/* Stored key indicator */}
                <div className="flex items-center justify-between px-4 py-3 rounded-lg border border-border/70 bg-background/40">
                  <div className="flex items-center gap-3">
                    <Settings className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">API Key</p>
                      <p className="font-mono text-[11px] text-muted-foreground">
                        sk_••••••••••••••••
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={testLlmKey}
                      disabled={testingKey}
                      className="bg-card/50 border-border/70 hover:border-copilot-purple/50"
                    >
                      {testingKey ? (
                        <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                      ) : (
                        <Activity className="w-3 h-3 mr-1.5" />
                      )}
                      <span className="font-mono text-[10px] tracking-widest uppercase">
                        Test
                      </span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={deleteLlmKey}
                      disabled={deletingKey}
                    >
                      {deletingKey ? (
                        <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                      ) : (
                        <Trash2 className="w-3 h-3 mr-1.5" />
                      )}
                      <span className="font-mono text-[10px] tracking-widest uppercase">
                        Remove
                      </span>
                    </Button>
                  </div>
                </div>

                {/* Test result */}
                {testResult && (
                  <div
                    className={`flex items-center gap-2 px-4 py-3 rounded-lg border ${
                      testResult.ok
                        ? "border-copilot-green/30 bg-copilot-green/6 text-copilot-green"
                        : "border-destructive/30 bg-destructive/6 text-destructive"
                    }`}
                  >
                    {testResult.ok ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 shrink-0" />
                    )}
                    <span className="text-sm">{testResult.message}</span>
                  </div>
                )}

                {/* Replace key */}
                <div className="pt-2">
                  <p className="text-xs text-muted-foreground mb-2">Replace with a new key:</p>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input
                        type={llmKeyVisible ? "text" : "password"}
                        placeholder="sk_..."
                        value={llmKeyInput}
                        onChange={(e) => setLlmKeyInput(e.target.value)}
                        className="font-mono text-sm pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setLlmKeyVisible(!llmKeyVisible)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {llmKeyVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <Button
                      onClick={saveLlmKey}
                      disabled={savingKey || !llmKeyInput.trim()}
                      className="bg-copilot-gradient hover:opacity-90 text-white border-0"
                    >
                      {savingKey && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      Update
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Enter your API key from{" "}
                  <a
                    href="https://llm-stats.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-copilot-purple hover:underline"
                  >
                    llm-stats.com
                  </a>{" "}
                  to enable model enrichment during sync.
                </p>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      type={llmKeyVisible ? "text" : "password"}
                      placeholder="sk_..."
                      value={llmKeyInput}
                      onChange={(e) => setLlmKeyInput(e.target.value)}
                      className="font-mono text-sm pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setLlmKeyVisible(!llmKeyVisible)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {llmKeyVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <Button
                    onClick={saveLlmKey}
                    disabled={savingKey || !llmKeyInput.trim()}
                    className="bg-copilot-gradient hover:opacity-90 text-white border-0"
                  >
                    {savingKey && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Save Key
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
