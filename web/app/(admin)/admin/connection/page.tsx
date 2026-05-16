"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  ExternalLink,
  Trash2,
  LogIn,
  Copy,
  Radio,
  Activity,
} from "lucide-react";

const PROXY_URL = process.env.NEXT_PUBLIC_PROXY_URL || "http://localhost:3200";

export default function ConnectionPage() {
  const [pinging, setPinging] = useState(false);
  const [pingReply, setPingReply] = useState<string | null>(null);
  const [pingLatency, setPingLatency] = useState<number | null>(null);

  const [testing, setTesting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [connection, setConnection] = useState<{
    id: string;
    label: string;
    connected: boolean;
    lastCheck: string | null;
  } | null>(null);

  // OAuth device flow state
  const [oauthLoading, setOauthLoading] = useState(false);
  const [oauthDevice, setOauthDevice] = useState<{
    userCode: string;
    verificationUri: string;
    deviceCode: string;
    expiresIn: number;
    interval: number;
  } | null>(null);
  const [oauthPolling, setOauthPolling] = useState(false);
  const [copied, setCopied] = useState(false);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const checkStatus = async () => {
    try {
      const res = await fetch(`${PROXY_URL}/api/admin/connection`);
      if (res.ok) {
        const data = await res.json();
        if (data.connection) {
          setConnection({
            id: data.connection.id,
            label: data.connection.label,
            connected: data.connection.status === "active",
            lastCheck: data.connection.last_validated_at,
          });
        }
      }
    } catch {
      // Proxy not running
    }
  };

  useEffect(() => {
    checkStatus();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // ─── OAuth Device Flow ────────────────────────────────────

  const handleOAuthStart = async () => {
    setOauthLoading(true);
    setStatus("idle");
    setMessage("");
    setOauthDevice(null);

    try {
      const res = await fetch(`${PROXY_URL}/api/admin/connection/oauth/start`, {
        method: "POST",
      });
      const data = await res.json();

      if (!res.ok) {
        setStatus("error");
        setMessage(data.error || "Failed to start OAuth flow.");
        return;
      }

      setOauthDevice(data);
      setOauthPolling(true);
      startPolling(data.deviceCode, data.interval);
    } catch {
      setStatus("error");
      setMessage("Cannot reach proxy. Is it running on port 3200?");
    } finally {
      setOauthLoading(false);
    }
  };

  const startPolling = (deviceCode: string, interval: number) => {
    if (pollRef.current) clearInterval(pollRef.current);

    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${PROXY_URL}/api/admin/connection/oauth/poll`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceCode }),
        });
        const data = await res.json();

        if (data.status === "success") {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          setOauthPolling(false);
          setOauthDevice(null);
          setStatus("success");
          const validMsg = data.validation?.ok
            ? `Connected as ${data.validation.username} — Copilot access confirmed!`
            : `Token saved but: ${data.validation?.error || "validation pending"}`;
          setMessage(validMsg);
          checkStatus();
        } else if (data.status === "expired" || data.status === "error") {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          setOauthPolling(false);
          setOauthDevice(null);
          setStatus("error");
          setMessage(data.error || "OAuth flow failed.");
        }
      } catch {
        // Network blip — keep trying
      }
    }, (interval || 5) * 1000);
  };

  const handleOAuthCancel = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
    setOauthPolling(false);
    setOauthDevice(null);
  };

  const copyCode = () => {
    if (oauthDevice) {
      navigator.clipboard.writeText(oauthDevice.userCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  };

  // ─── Test / Ping / Delete ─────────────────────────────────

  const handleTest = async () => {
    setTesting(true);
    setStatus("idle");
    setMessage("");

    try {
      const res = await fetch(`${PROXY_URL}/api/admin/connection/test`, {
        method: "POST",
      });
      const data = await res.json();

      if (res.ok && data.ok) {
        setStatus("success");
        setMessage(
          `Connection verified! User: ${data.username} | Copilot: ✓`
        );
        setConnection((prev) =>
          prev ? { ...prev, connected: true, lastCheck: new Date().toISOString() } : prev
        );
      } else {
        setStatus("error");
        setMessage(
          [data.error, data.details].filter(Boolean).join("\n\n") ||
            "Connection test failed."
        );
        setConnection((prev) =>
          prev ? { ...prev, connected: false } : prev
        );
      }
    } catch {
      setStatus("error");
      setMessage("Cannot reach proxy. Is it running on port 3200?");
    } finally {
      setTesting(false);
    }
  };

  const handleDelete = async () => {
    if (!connection?.id) return;
    setDeleting(true);
    try {
      const res = await fetch(`${PROXY_URL}/api/admin/connection/${connection.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setConnection(null);
        setStatus("success");
        setMessage("Connection removed.");
      }
    } catch {
      setStatus("error");
      setMessage("Cannot reach proxy.");
    } finally {
      setDeleting(false);
    }
  };

  const handlePing = async () => {
    setPinging(true);
    setPingReply(null);
    setPingLatency(null);
    setStatus("idle");
    setMessage("");

    try {
      const res = await fetch(`${PROXY_URL}/api/admin/connection/ping`, {
        method: "POST",
      });
      const data = await res.json();

      if (res.ok && data.ok) {
        setPingReply(data.reply);
        setPingLatency(data.latencyMs);
        setStatus("success");
        setMessage(`Copilot responded in ${data.latencyMs}ms`);
      } else {
        setStatus("error");
        setMessage(data.error || "Ping failed.");
      }
    } catch {
      setStatus("error");
      setMessage("Cannot reach proxy. Is it running on port 3200?");
    } finally {
      setPinging(false);
    }
  };

  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="space-y-2">
        <p className="font-mono text-[10px] tracking-[0.22em] uppercase text-muted-foreground">
          admin / connection
        </p>
        <h1 className="text-4xl font-display font-bold tracking-tight leading-none">
          GitHub <span className="text-copilot-gradient font-display font-bold">Connection</span>
        </h1>
        <p className="text-sm text-muted-foreground max-w-md">
          Authorize your GitHub account via device-flow OAuth. The token is encrypted at rest and never leaves this server.
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
          <AlertDescription className="whitespace-pre-wrap">{message}</AlertDescription>
        </Alert>
      )}

      {/* Current connection status */}
      {connection && (
        <section className="space-y-3">
          <p className="label-mono">// Active Session</p>
          <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-card/60 backdrop-blur-md">
            <div
              aria-hidden
              className={`absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-copilot-green/60 to-transparent ${
                !connection.connected && "via-destructive/60"
              }`}
            />
            <div className="px-6 py-5">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  <span
                    className={`pulse-ring ${
                      connection.connected ? "text-copilot-green" : "text-destructive"
                    }`}
                  >
                    <span
                      className={
                        connection.connected ? "bg-copilot-green" : "bg-destructive"
                      }
                    />
                  </span>
                  <div>
                    <p className="font-mono text-[10px] tracking-[0.18em] uppercase text-muted-foreground">
                      {connection.connected ? "Connected" : "Disconnected"}
                    </p>
                    <p className="text-2xl font-display font-bold leading-tight">
                      {connection.label}
                    </p>
                  </div>
                </div>
                <div className="font-mono text-[10px] tracking-wider text-muted-foreground space-y-1 text-right">
                  <p>
                    <span className="text-muted-foreground/60">METHOD &nbsp;</span>
                    OAUTH · DEVICE FLOW
                  </p>
                  <p>
                    <span className="text-muted-foreground/60">CHECKED &nbsp;</span>
                    {connection.lastCheck
                      ? new Date(connection.lastCheck).toLocaleString()
                      : "—"}
                  </p>
                </div>
              </div>

              <div className="rail-divider my-5" />

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleTest}
                  disabled={testing}
                  className="bg-card/50 border-border/70 hover:border-primary/50"
                >
                  {testing ? (
                    <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                  ) : (
                    <Activity className="w-3 h-3 mr-1.5" />
                  )}
                  <span className="font-mono text-[10px] tracking-widest uppercase">
                    Test
                  </span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePing}
                  disabled={pinging}
                  className="bg-copilot-purple/10 border-copilot-purple/40 text-copilot-purple hover:bg-copilot-purple/20 hover:border-copilot-purple/60"
                >
                  {pinging ? (
                    <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                  ) : (
                    <Radio className="w-3 h-3 mr-1.5" />
                  )}
                  <span className="font-mono text-[10px] tracking-widest uppercase">
                    Ping Copilot
                  </span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={handleDelete}
                  disabled={deleting}
                >
                  {deleting ? (
                    <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3 h-3 mr-1.5" />
                  )}
                  <span className="font-mono text-[10px] tracking-widest uppercase">
                    Remove
                  </span>
                </Button>
              </div>

              {pingReply && (
                <div className="mt-4 rounded-lg bg-background/40 border border-copilot-purple/20 p-4">
                  <p className="font-mono text-[10px] tracking-widest uppercase text-copilot-purple mb-1.5">
                    Copilot replied · {pingLatency}ms
                  </p>
                  <p className="text-sm">{pingReply}</p>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* OAuth Sign-In */}
      <section className="space-y-3">
        <p className="label-mono">// Authorize</p>
        <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-card/60 backdrop-blur-md">
          <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-primary/40 to-transparent" />

          <div className="px-6 py-6 space-y-5">
            <div className="flex items-start gap-3">
              <div className="ring-copilot-gradient rounded-xl">
                <div className="w-10 h-10 rounded-xl bg-card flex items-center justify-center">
                  <LogIn className="w-4 h-4 text-copilot-purple" strokeWidth={2.2} />
                </div>
              </div>
              <div>
                <h2 className="text-xl font-display font-bold leading-tight">
                  Sign in with GitHub
                </h2>
                <p className="text-sm text-muted-foreground max-w-md mt-0.5">
                  Same device-flow OAuth used by the VS Code Copilot extension. Works with personal, enterprise, and EMU accounts.
                </p>
              </div>
            </div>

            {!oauthDevice ? (
              <div className="pt-2">
                <Button
                  onClick={handleOAuthStart}
                  disabled={oauthLoading}
                  className="shimmer-hover bg-copilot-gradient hover:opacity-90 text-white border-0"
                >
                  {oauthLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  <LogIn className="w-4 h-4 mr-2" />
                  Start GitHub Sign-In
                </Button>
              </div>
            ) : (
              <div className="space-y-5 pt-2">
                {/* Glowing OAuth code centerpiece */}
                <div className="relative overflow-hidden rounded-2xl border border-copilot-purple/40 bg-copilot-purple/4 px-6 py-8">
                  <div
                    aria-hidden
                    className="absolute -inset-px rounded-2xl opacity-60 pointer-events-none bg-oauth-glow"
                  />
                  <div className="relative text-center space-y-4">
                    <p className="font-mono text-[10px] tracking-[0.22em] uppercase text-copilot-purple/80">
                      Enter this code at github.com/login/device
                    </p>
                    <div className="flex items-center justify-center gap-3">
                      <code className="font-display font-bold text-6xl tracking-[0.15em] text-copilot-purple drop-shadow-[0_0_24px_hsl(258_90%_66%/0.5)]">
                        {oauthDevice.userCode}
                      </code>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={copyCode}
                        className="h-9 w-9 p-0 border border-copilot-purple/30 bg-copilot-purple/10 hover:bg-copilot-purple/20"
                      >
                        {copied ? (
                          <CheckCircle2 className="w-4 h-4 text-copilot-green" />
                        ) : (
                          <Copy className="w-4 h-4 text-copilot-purple" />
                        )}
                      </Button>
                    </div>
                    <a
                      href={oauthDevice.verificationUri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 font-mono text-[11px] tracking-wider text-copilot-purple hover:underline uppercase"
                    >
                      Open verification page
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>

                {oauthPolling && (
                  <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-border/70 bg-background/40">
                    <span className="inline-flex w-2 h-2 rounded-full bg-copilot-purple animate-pulse" />
                    <span className="font-mono text-[11px] tracking-wider text-muted-foreground">
                      Waiting for authorization on GitHub
                      <span className="inline-flex ml-1">
                        <span className="stream-dot">.</span>
                        <span className="stream-dot">.</span>
                        <span className="stream-dot">.</span>
                      </span>
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleOAuthCancel}
                      className="ml-auto h-7 font-mono text-[10px] tracking-widest uppercase text-muted-foreground hover:text-foreground"
                    >
                      Cancel
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
