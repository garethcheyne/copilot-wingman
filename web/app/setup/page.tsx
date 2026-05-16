"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, XCircle, ShieldCheck, Sparkles } from "lucide-react";
import { BrandPanel, BrandMarkMobile } from "@/components/auth/brand-panel";

export default function SetupPage() {
  const { setup } = useAuth();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setLoading(true);
    try {
      await setup(username, password, displayName || undefined);
      router.replace("/setup/connect");
    } catch (err: any) {
      setError(err.message || "Setup failed");
    } finally {
      setLoading(false);
    }
  };

  const meetsLength = password.length >= 8;
  const meetsMatch = confirmPassword.length > 0 && password === confirmPassword;

  return (
    <div className="min-h-screen grid lg:grid-cols-[1.1fr_1fr]">
      <BrandPanel
        status="First Run · Configuration"
        statusAccent="accent"
        headline={
          <>
            Let&apos;s get
            <br />
            you <span className="text-copilot-gradient">airborne.</span>
          </>
        }
        tagline="Create the first administrator account. Credentials are hashed locally — they never leave this server."
        footer={
          <div className="space-y-2.5 font-mono text-[10px] tracking-[0.18em] uppercase">
            <p className="text-muted-foreground/70 text-center">// Setup Sequence</p>
            <ol className="space-y-1.5 inline-flex flex-col items-start mx-auto">
              <li className="flex items-center gap-2 text-foreground/90">
                <Sparkles className="w-3 h-3 text-copilot-purple" /> 01 · Create admin account
              </li>
              <li className="flex items-center gap-2 text-muted-foreground/60">
                <span className="inline-block w-3 text-center">02</span>· Connect GitHub
              </li>
              <li className="flex items-center gap-2 text-muted-foreground/60">
                <span className="inline-block w-3 text-center">03</span>· Send first chat
              </li>
            </ol>
          </div>
        }
      />

      {/* Form column */}
      <main className="relative flex items-start lg:items-center justify-center px-6 pt-8 pb-12 lg:py-12">
        <div className="w-full max-w-sm space-y-7 fade-up">
          <BrandMarkMobile />

          <div className="space-y-2">
            <p className="font-mono text-[10px] tracking-[0.22em] uppercase text-copilot-purple/90 flex items-center gap-2">
              <ShieldCheck className="w-3 h-3" />
              // Setup · Step 01
            </p>
            <h2 className="text-4xl font-display font-bold tracking-tight leading-none">
              Create your account
            </h2>
            <p className="text-sm text-muted-foreground">
              You&apos;ll use this to sign into Wingman from now on.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label
                htmlFor="username"
                className="font-mono text-[10px] tracking-[0.18em] uppercase text-muted-foreground"
              >
                Email
              </Label>
              <FieldWithGlow>
                <Input
                  id="username"
                  type="email"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  autoFocus
                  required
                  className="relative bg-card/80 backdrop-blur-md border-border/70 focus-visible:ring-primary/40 focus-visible:border-primary/40 font-mono"
                />
              </FieldWithGlow>
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="displayName"
                className="font-mono text-[10px] tracking-[0.18em] uppercase text-muted-foreground flex items-center gap-2"
              >
                Display Name
                <span className="font-sans text-muted-foreground/50 normal-case tracking-normal">
                  optional
                </span>
              </Label>
              <FieldWithGlow>
                <Input
                  id="displayName"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your name"
                  className="relative bg-card/80 backdrop-blur-md border-border/70 focus-visible:ring-primary/40 focus-visible:border-primary/40"
                />
              </FieldWithGlow>
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="password"
                className="font-mono text-[10px] tracking-[0.18em] uppercase text-muted-foreground"
              >
                Password
              </Label>
              <FieldWithGlow>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min 8 characters"
                  autoComplete="new-password"
                  required
                  className="relative bg-card/80 backdrop-blur-md border-border/70 focus-visible:ring-primary/40 focus-visible:border-primary/40 font-mono"
                />
              </FieldWithGlow>
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="confirmPassword"
                className="font-mono text-[10px] tracking-[0.18em] uppercase text-muted-foreground"
              >
                Confirm Password
              </Label>
              <FieldWithGlow>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                  className="relative bg-card/80 backdrop-blur-md border-border/70 focus-visible:ring-primary/40 focus-visible:border-primary/40 font-mono"
                />
              </FieldWithGlow>
            </div>

            {/* Inline rule checklist */}
            <div className="flex items-center gap-4 font-mono text-[10px] tracking-[0.15em] uppercase">
              <RuleDot ok={meetsLength}>8+ chars</RuleDot>
              <RuleDot ok={meetsMatch}>match</RuleDot>
            </div>

            {error && (
              <div className="flex items-start gap-2.5 rounded-md border border-destructive/40 bg-destructive/6 px-3 py-2.5">
                <XCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="font-mono text-[10px] tracking-widest uppercase text-destructive">
                    Setup Error
                  </p>
                  <p className="text-sm text-destructive/90 wrap-break-word">{error}</p>
                </div>
              </div>
            )}

            <Button
              type="submit"
              className="shimmer-hover w-full h-10 bg-copilot-gradient hover:opacity-90 text-white border-0 font-medium tracking-tight"
              disabled={loading || !username || !meetsLength || !meetsMatch}
            >
              {loading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <ShieldCheck className="w-4 h-4 mr-2" />
              )}
              Create admin account
            </Button>
          </form>

          <div className="flex items-center gap-3 font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/60">
            <span className="flex-1 h-px bg-border/60" />
            <span>Hashed locally · Never leaves this server</span>
            <span className="flex-1 h-px bg-border/60" />
          </div>
        </div>
      </main>
    </div>
  );
}

function FieldWithGlow({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative group">
      <div
        aria-hidden
        className="absolute -inset-px rounded-md bg-linear-to-r from-primary/0 via-copilot-purple/0 to-primary/0 group-focus-within:from-primary/40 group-focus-within:via-copilot-purple/40 group-focus-within:to-primary/40 transition-opacity blur-md pointer-events-none"
      />
      {children}
    </div>
  );
}

function RuleDot({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span
      className={`flex items-center gap-1.5 transition-colors ${
        ok ? "text-copilot-green" : "text-muted-foreground/60"
      }`}
    >
      <span
        className={`inline-block w-1.5 h-1.5 rounded-full transition-colors ${
          ok ? "bg-copilot-green shadow-[0_0_6px_hsl(142_71%_45%/0.8)]" : "bg-border"
        }`}
      />
      {children}
    </span>
  );
}
