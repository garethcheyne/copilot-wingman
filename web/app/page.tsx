"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useAuth } from "@/components/auth-provider";
import { APP_TAGLINE, APP_VERSION } from "@/lib/version";

export default function Home() {
  const { user, needsSetup, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    if (needsSetup) {
      router.replace("/setup");
    } else if (!user) {
      router.replace("/login");
    } else {
      router.replace("/chat");
    }
  }, [user, needsSetup, loading, router]);

  const status = loading
    ? "Initializing systems"
    : needsSetup
    ? "Routing to setup"
    : !user
    ? "Routing to sign-in"
    : "Loading Mission Control";

  return (
    <div className="min-h-dvh flex items-center justify-center relative overflow-hidden">
      {/* Brand atmosphere */}
      <div aria-hidden className="absolute inset-0 bg-mesh-copilot opacity-60 pointer-events-none" />
      <div
        aria-hidden
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-176 h-176 bg-orb-copilot animate-orb-drift pointer-events-none opacity-60"
      />
      <div
        aria-hidden
        className="absolute top-[58%] left-[46%] -translate-x-1/2 -translate-y-1/2 w-104 h-104 bg-orb-copilot animate-orb-drift-reverse pointer-events-none opacity-40 mix-blend-screen"
      />

      <div className="relative flex flex-col items-center fade-up px-6">
        {/* Logo + wordmark fused — wordmark overlaps the logo's base */}
        <div className="relative flex flex-col items-center">
          {/* Aurora bloom behind the logo */}
          <div
            aria-hidden
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-lg h-128 rounded-full bg-copilot-purple/25 blur-[80px] pointer-events-none"
          />
          <Image
            src="/wingman-ai.png"
            alt="Wingman"
            width={800}
            height={800}
            className="relative w-72 h-72 sm:w-96 sm:h-96 md:w-md md:h-112 lg:w-136 lg:h-136 object-contain mix-blend-screen drop-shadow-[0_18px_60px_hsl(258_90%_66%/0.55)] select-none pointer-events-none"
            priority
          />

          {/* Wordmark — pulled UP into the logo's lower half with a dark halo bed */}
          <div className="relative -mt-14 sm:-mt-20 md:-mt-24 lg:-mt-28 text-center space-y-3">
            <div
              aria-hidden
              className="absolute -inset-x-20 -inset-y-10 rounded-[4rem] bg-radial-text-glow pointer-events-none"
            />
            <h1 className="relative text-6xl sm:text-7xl md:text-8xl font-display font-bold tracking-tight leading-none">
              <span className="text-copilot-gradient">Wingman</span>
            </h1>
            <p
              className="relative font-mono text-[11px] tracking-[0.28em] uppercase text-muted-foreground"
              translate="no"
              suppressHydrationWarning
            >
              {APP_TAGLINE} · <span translate="no" suppressHydrationWarning>v{APP_VERSION}</span>
            </p>
          </div>
        </div>

        {/* Status chip */}
        <div className="mt-10 flex items-center gap-2.5 px-3.5 py-2 rounded-full border border-border/70 bg-card/60 backdrop-blur-md">
          <span className="inline-flex items-center gap-0.5">
            <span className="stream-dot inline-block w-1.5 h-1.5 rounded-full bg-copilot-purple" />
            <span className="stream-dot inline-block w-1.5 h-1.5 rounded-full bg-copilot-purple" />
            <span className="stream-dot inline-block w-1.5 h-1.5 rounded-full bg-copilot-purple" />
          </span>
          <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-foreground/80">
            // {status}
          </span>
        </div>
      </div>
    </div>
  );
}
