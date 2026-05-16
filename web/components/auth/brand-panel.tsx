"use client";

import Image from "next/image";
import { APP_TAGLINE, APP_VERSION } from "@/lib/version";

type Accent = "green" | "purple" | "accent";

const accentBg: Record<Accent, string> = {
  green: "bg-copilot-green",
  purple: "bg-copilot-purple",
  accent: "bg-accent",
};

const accentText: Record<Accent, string> = {
  green: "text-copilot-green",
  purple: "text-copilot-purple",
  accent: "text-accent",
};

/**
 * Shared brand panel for unauthenticated routes (login + setup).
 *
 * Design intent: the logo and hero text *blend* into a single composition
 * instead of stacking. The logo lives oversized at center, bleeding past
 * its column, and the headline is pulled up into its lower half so the
 * wordmark reads as if the bird is carrying it. Atmosphere comes from
 * dual aurora orbs behind, a soft grain veil, and a luminous edge.
 */
export function BrandPanel({
  status,
  statusAccent = "green",
  headline,
  tagline,
  footer,
}: {
  status: string;
  statusAccent?: Accent;
  headline: React.ReactNode;
  tagline: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <aside className="relative overflow-hidden border-r border-border/70 hidden lg:flex flex-col justify-between items-stretch px-12 py-10">
      {/* Atmosphere — pushed back, larger, dual orbs */}
      <div aria-hidden className="absolute inset-0 bg-mesh-copilot opacity-90 pointer-events-none" />
      <div aria-hidden className="absolute inset-0 bg-grain pointer-events-none opacity-50" />
      <div
        aria-hidden
        className="absolute top-[38%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-176 h-176 bg-orb-copilot animate-orb-drift pointer-events-none opacity-90"
      />
      <div
        aria-hidden
        className="absolute top-[60%] left-[58%] -translate-x-1/2 -translate-y-1/2 w-md h-112 bg-orb-copilot animate-orb-drift-reverse pointer-events-none opacity-40 mix-blend-screen"
      />
      <div
        aria-hidden
        className="absolute inset-y-0 right-0 w-px bg-linear-to-b from-transparent via-primary/40 to-transparent pointer-events-none"
      />

      {/* Status chip — anchored top-left, independent of the centerpiece */}
      <div className="relative z-20 flex items-center gap-2">
        <span className={`pulse-ring ${accentText[statusAccent]}`}>
          <span className={accentBg[statusAccent]} />
        </span>
        <p className="font-mono text-[10px] tracking-[0.22em] uppercase text-foreground/80">
          {status}
        </p>
      </div>

      {/* Centerpiece — oversized logo with the headline layered into it */}
      <div className="relative z-10 flex flex-col items-center text-center">
        <div className="relative w-full flex justify-center">
          {/* Aurora bloom directly behind the logo */}
          <div
            aria-hidden
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-136 h-136 rounded-full bg-copilot-purple/30 blur-[80px] pointer-events-none"
          />
          <div
            aria-hidden
            className="absolute left-1/2 top-[58%] -translate-x-1/2 -translate-y-1/2 w-88 h-88 rounded-full bg-primary/25 blur-3xl pointer-events-none"
          />

          {/* The logo — huge, bleeds past the column, screen-blends with aurora */}
          <Image
            src="/wingman-ai.png"
            alt="Wingman"
            width={720}
            height={720}
            className="relative w-xl xl:w-2xl max-w-none h-auto object-contain pointer-events-none select-none mix-blend-screen drop-shadow-[0_18px_60px_hsl(258_90%_66%/0.55)]"
            priority
          />
        </div>

        {/* Headline — pulled UP into the logo's lower half so they read as one mark */}
        <div className="relative -mt-40 xl:-mt-52 z-10 flex flex-col items-center gap-5 max-w-md">
          {/* Dark halo bed — background only, pushes the headline off the logo */}
          <div
            aria-hidden
            className="absolute -inset-x-16 -inset-y-8 rounded-[3rem] bg-radial-text-glow pointer-events-none"
          />
          <h1 className="relative text-5xl xl:text-6xl font-display font-bold tracking-tight leading-[0.95]">
            {headline}
          </h1>
          <p className="relative text-sm text-muted-foreground max-w-sm">
            {tagline}
          </p>
        </div>
      </div>

      {/* Footer slot (system tags / setup sequence) */}
      <div className="relative z-10">{footer}</div>
    </aside>
  );
}

/**
 * Compact home-screen-style brand mark for the mobile column above the form.
 * No frame — the logo floats freely on its own gradient halo and the wordmark
 * overlaps its base so the bird and the name read as a single composition.
 */
export function BrandMarkMobile() {
  return (
    <div className="lg:hidden relative flex flex-col items-center mt-2 mb-24">
      {/* Halos */}
      <div
        aria-hidden
        className="absolute -top-4 left-1/2 -translate-x-1/2 w-80 h-80 rounded-full bg-copilot-purple/25 blur-3xl pointer-events-none"
      />
      <div
        aria-hidden
        className="absolute top-4 left-1/2 -translate-x-1/2 w-52 h-52 rounded-full bg-primary/20 blur-2xl pointer-events-none"
      />

      {/* Free-floating logo — no frame, larger, sits up high */}
      <Image
        src="/wingman-ai.png"
        alt="Wingman"
        width={400}
        height={400}
        className="relative w-52 h-52 sm:w-60 sm:h-60 object-contain pointer-events-none select-none mix-blend-screen drop-shadow-[0_10px_32px_hsl(258_90%_66%/0.55)]"
        priority
      />

      {/* Wordmark — sits below the logo with breathing room, on a dark radial bed */}
      <div className="relative mt-2 text-center leading-tight">
        <div
          aria-hidden
          className="absolute -inset-x-10 -inset-y-4 rounded-[3rem] bg-radial-text-glow pointer-events-none"
        />
        <p className="relative text-3xl font-display font-bold tracking-tight">
          <span className="text-copilot-gradient">Wingman</span>
        </p>
        <p
          className="relative font-mono text-[10px] text-muted-foreground tracking-[0.22em] uppercase mt-1"
          // The CalVer string (e.g. 2026.05.16.1600) looks like a phone number
          // to browser extensions such as 3CX, which inject a <tcxspan> wrapper
          // after hydration. We disable extension detection and tell React to
          // ignore the resulting mismatch on this leaf node.
          translate="no"
          suppressHydrationWarning
        >
          {APP_TAGLINE}
          <br />
          <span translate="no" suppressHydrationWarning>
            v{APP_VERSION}
          </span>
        </p>
      </div>
    </div>
  );
}
