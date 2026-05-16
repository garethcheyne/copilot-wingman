"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, XCircle, LogIn } from "lucide-react";
import { BrandPanel, BrandMarkMobile } from "@/components/auth/brand-panel";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(username, password);
      router.replace("/chat");
    } catch (err: any) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-[1.1fr_1fr]">
      <BrandPanel
        status="Mission Control · Standby"
        statusAccent="green"
        headline={
          <>
            Your <span className="text-copilot-gradient">Copilot</span>,
            <br />
            self-hosted.
          </>
        }
        tagline="Authorize once, then chat from anywhere — your sessions, your tokens, your terminal."
        footer={
          <div className="flex items-center gap-4 font-mono text-[10px] tracking-[0.22em] uppercase text-muted-foreground/80 justify-center">
            <span className="flex items-center gap-2">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-copilot-green" />
              127.0.0.1
            </span>
            <span className="inline-block w-px h-3 bg-border/80" />
            <span>AES-256 · Encrypted</span>
            <span className="inline-block w-px h-3 bg-border/80" />
            <span>No telemetry</span>
          </div>
        }
      />

      {/* Form column */}
      <main className="relative flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm space-y-7 fade-up">
          <BrandMarkMobile />

          <div className="space-y-2">
            <p className="font-mono text-[10px] tracking-[0.22em] uppercase text-copilot-purple/90 flex items-center gap-2">
              <LogIn className="w-3 h-3" />
              // Sign In
            </p>
            <h2 className="text-4xl font-display font-bold tracking-tight leading-none">
              Welcome back
            </h2>
            <p className="text-sm text-muted-foreground">
              Sign in with your admin credentials to access Mission Control.
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
              <div className="relative group">
                <div
                  aria-hidden
                  className="absolute -inset-px rounded-md bg-linear-to-r from-primary/0 via-copilot-purple/0 to-primary/0 group-focus-within:from-primary/40 group-focus-within:via-copilot-purple/40 group-focus-within:to-primary/40 transition-opacity blur-md pointer-events-none"
                />
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
              </div>
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="password"
                className="font-mono text-[10px] tracking-[0.18em] uppercase text-muted-foreground"
              >
                Password
              </Label>
              <div className="relative group">
                <div
                  aria-hidden
                  className="absolute -inset-px rounded-md bg-linear-to-r from-primary/0 via-copilot-purple/0 to-primary/0 group-focus-within:from-primary/40 group-focus-within:via-copilot-purple/40 group-focus-within:to-primary/40 transition-opacity blur-md pointer-events-none"
                />
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  className="relative bg-card/80 backdrop-blur-md border-border/70 focus-visible:ring-primary/40 focus-visible:border-primary/40 font-mono"
                />
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2.5 rounded-md border border-destructive/40 bg-destructive/6 px-3 py-2.5">
                <XCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="font-mono text-[10px] tracking-widest uppercase text-destructive">
                    Auth Error
                  </p>
                  <p className="text-sm text-destructive/90 wrap-break-word">{error}</p>
                </div>
              </div>
            )}

            <Button
              type="submit"
              className="shimmer-hover w-full h-10 bg-copilot-gradient hover:opacity-90 text-white border-0 font-medium tracking-tight"
              disabled={loading || !username || !password}
            >
              {loading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <LogIn className="w-4 h-4 mr-2" />
              )}
              Sign in
            </Button>
          </form>

          <div className="flex items-center gap-3 font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground/60">
            <span className="flex-1 h-px bg-border/60" />
            <span>Local only · No external auth</span>
            <span className="flex-1 h-px bg-border/60" />
          </div>
        </div>
      </main>
    </div>
  );
}
