"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useAuth } from "@/components/auth-provider";

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
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
      {/* Brand atmosphere */}
      <div aria-hidden className="absolute inset-0 bg-mesh-copilot opacity-60 pointer-events-none" />
      <div
        aria-hidden
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-120 h-120 bg-orb-copilot animate-orb-drift pointer-events-none opacity-50"
      />

      <div className="relative flex flex-col items-center gap-10 fade-up">
        <Image
          src="/wingman-ai.png"
          alt="Wingman"
          width={640}
          height={640}
          className="object-contain w-80 h-80 sm:w-96 sm:h-96 md:w-md md:h-112 lg:w-lg lg:h-128"
          priority
        />

        <div className="text-center space-y-3">
          <h1 className="text-7xl sm:text-8xl font-display font-bold tracking-tight leading-none">
            <span className="text-copilot-gradient">Wingman</span>
          </h1>
          <p className="font-mono text-[11px] tracking-[0.28em] uppercase text-muted-foreground">
            v0.1.0 · Self-hosted Copilot
          </p>
        </div>

        <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-full border border-border/70 bg-card/60 backdrop-blur-md">
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
