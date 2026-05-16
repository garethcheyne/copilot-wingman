"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  ExternalLink,
  Copy,
  Check,
  GitBranch,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { adminFetch } from "@/lib/admin-api";
import { BrandPanel, BrandMarkMobile } from "@/components/auth/brand-panel";

export default function SetupConnectPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [checkingConnection, setCheckingConnection] = useState(true);
  const [device, setDevice] = useState<{
    userCode: string;
    verificationUri: string;
    deviceCode: string;
    expiresIn: number;
    interval: number;
  } | null>(null);
  const [polling, setPolling] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);

  // If GitHub is already connected, redirect to chat
  useEffect(() => {
    (async () => {
      try {
        const res = await adminFetch("/api/admin/connection");
        if (res.ok) {
          const data = await res.json();
          if (data.connected) {
            router.replace("/chat");
            return;
          }
        }
      } catch {
        // proxy not reachable — stay on page
      }
      setCheckingConnection(false);
    })();
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [router]);

  const handleStart = async () => {
    setLoading(true);
    setError("");
    setDevice(null);

    try {
      const res = await adminFetch("/api/admin/connection/oauth/start", {
        method: "POST",
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to start OAuth flow.");
        return;
      }

      setDevice(data);
      setPolling(true);
      startPolling(data.deviceCode, data.interval);
    } catch {
      setError("Cannot reach proxy. Is it running?");
    } finally {
      setLoading(false);
    }
  };

  const startCountdown = (seconds: number) => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    setCountdown(seconds);
    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (countdownRef.current) clearInterval(countdownRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const startPolling = (deviceCode: string, interval: number) => {
    if (pollRef.current) clearTimeout(pollRef.current);

    const poll = (waitSec: number) => {
      startCountdown(waitSec);
      pollRef.current = setTimeout(async () => {
        try {
          const res = await adminFetch("/api/admin/connection/oauth/poll", {
            method: "POST",
            body: JSON.stringify({ deviceCode }),
          });
          const data = await res.json();

          if (data.status === "success") {
            setPolling(false);
            setCountdown(0);
            setDevice(null);
            const username = data.validation?.username || "GitHub";
            setSuccess(`Connected as ${username} — Copilot access confirmed!`);
            setTimeout(() => router.replace("/chat"), 1500);
          } else if (data.status === "expired" || data.status === "error") {
            setPolling(false);
            setCountdown(0);
            setDevice(null);
            setError(data.error || "OAuth flow failed. Try again.");
          } else {
            // Still pending — use server-provided interval (slow_down) + 5s buffer
            const nextWait = (data.interval || waitSec) + 5;
            poll(nextWait);
          }
        } catch {
          // Network blip — retry with same interval
          poll(waitSec);
        }
      }, waitSec * 1000);
    };

    poll(interval || 5);
  };

  const copyCode = () => {
    if (device) {
      navigator.clipboard.writeText(device.userCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  };

  const handleSkip = () => {
    router.replace("/chat");
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-[1.1fr_1fr]">
      <BrandPanel
        status="First Run · Configuration"
        statusAccent="accent"
        headline={
          <>
            Connect to
            <br />
            <span className="text-copilot-gradient">GitHub.</span>
          </>
        }
        tagline="Authorize with your GitHub account to enable Copilot access. Uses the same device flow as VS Code."
        footer={
          <div className="space-y-2.5 font-mono text-[10px] tracking-[0.18em] uppercase">
            <p className="text-muted-foreground/70 text-center">// Setup Sequence</p>
            <ol className="space-y-1.5 inline-flex flex-col items-start mx-auto">
              <li className="flex items-center gap-2 text-muted-foreground/60">
                <Check className="w-3 h-3 text-green-500" /> 01 · Create admin account
              </li>
              <li className="flex items-center gap-2 text-foreground/90">
                <Sparkles className="w-3 h-3 text-copilot-purple" /> 02 · Connect GitHub
              </li>
              <li className="flex items-center gap-2 text-muted-foreground/60">
                <span className="inline-block w-3 text-center">03</span>· Send first chat
              </li>
            </ol>
          </div>
        }
      />

      {/* Form column */}
      <main className="relative flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm space-y-7 fade-up">
          <BrandMarkMobile />

          <div className="space-y-2">
            <p className="font-mono text-[10px] tracking-[0.22em] uppercase text-copilot-purple/90 flex items-center gap-2">
              <GitBranch className="w-3 h-3" />
              // Setup · Step 02
            </p>
            <h2 className="text-4xl font-display font-bold tracking-tight leading-none">
              Connect GitHub
            </h2>
            <p className="text-sm text-muted-foreground">
              Wingman uses the GitHub Device OAuth flow — the same auth method as the VS Code Copilot extension.
            </p>
          </div>

          {/* Not started */}
          {!device && !success && (
            <div className="space-y-5">
              <div className="rounded-xl border border-border/70 bg-card/60 backdrop-blur-md p-5 space-y-3">
                <div className="flex items-start gap-3">
                  <GitBranch className="w-5 h-5 text-foreground/80 mt-0.5 shrink-0" />
                  <div className="space-y-1.5">
                    <p className="text-sm font-medium">GitHub Device Authorization</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Click below to generate a one-time code. You&apos;ll enter it on GitHub to authorize Wingman.
                    </p>
                  </div>
                </div>
              </div>

              {error && (
                <div className="rounded-md border border-destructive/40 bg-destructive/6 px-3 py-2.5">
                  <p className="text-sm text-destructive/90">{error}</p>
                </div>
              )}

              <Button
                onClick={handleStart}
                disabled={loading}
                className="shimmer-hover w-full h-10 bg-copilot-gradient hover:opacity-90 text-white border-0 font-medium tracking-tight"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <GitBranch className="w-4 h-4 mr-2" />
                )}
                Start GitHub Authorization
              </Button>

              <button
                onClick={handleSkip}
                className="w-full text-center text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
              >
                Skip for now — you can connect later in Settings
              </button>
            </div>
          )}

          {/* Device code shown — waiting for user */}
          {device && (
            <div className="space-y-5">
              <div className="rounded-xl border border-primary/30 bg-card/60 backdrop-blur-md p-5 space-y-4">
                <p className="font-mono text-[10px] tracking-[0.18em] uppercase text-muted-foreground">
                  Your one-time code
                </p>
                <div className="flex items-center justify-center gap-3">
                  <code className="text-3xl font-mono font-bold tracking-[0.15em] text-foreground">
                    {device.userCode}
                  </code>
                  <button
                    onClick={copyCode}
                    className="p-2 rounded-md hover:bg-muted/50 transition-colors"
                    title="Copy code"
                  >
                    {copied ? (
                      <Check className="w-4 h-4 text-green-500" />
                    ) : (
                      <Copy className="w-4 h-4 text-muted-foreground" />
                    )}
                  </button>
                </div>

                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground text-center">
                    Enter this code at GitHub:
                  </p>
                  <a
                    href={device.verificationUri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 text-sm font-medium text-primary hover:underline"
                  >
                    {device.verificationUri}
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>

              {polling && (
                <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  {countdown > 0
                    ? `Checking again in ${countdown}s...`
                    : "Checking authorization..."}
                </div>
              )}
            </div>
          )}

          {/* Success */}
          {success && (
            <div className="space-y-5">
              <div className="rounded-xl border border-green-500/30 bg-green-500/5 backdrop-blur-md p-5 space-y-2">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-green-500" />
                  <p className="text-sm font-medium text-green-500">Connected</p>
                </div>
                <p className="text-sm text-muted-foreground">{success}</p>
              </div>

              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Redirecting to chat...
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/60">
            <span className="flex-1 h-px bg-border/60" />
            <span>Same auth as VS Code Copilot</span>
            <span className="flex-1 h-px bg-border/60" />
          </div>
        </div>
      </main>
    </div>
  );
}
