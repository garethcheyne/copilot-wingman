"use client";

import Image from "next/image";

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
 * The Wingman logo is the visual anchor — sized ~260 px, wrapped in the
 * brand gradient ring, sitting on top of the orb-mesh atmosphere. The
 * tagline and headline live underneath it so the panel reads
 * top-to-bottom: logo → mood → headline → footer.
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
      {/* atmosphere */}
      <div aria-hidden className="absolute inset-0 bg-mesh-copilot opacity-90 pointer-events-none" />
      <div aria-hidden className="absolute inset-0 bg-grain pointer-events-none opacity-50" />
      <div
        aria-hidden
        className="absolute top-[42%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-140 h-140 bg-orb-copilot animate-orb-drift pointer-events-none opacity-80"
      />
      <div
        aria-hidden
        className="absolute inset-y-0 right-0 w-px bg-linear-to-b from-transparent via-primary/40 to-transparent pointer-events-none"
      />

      {/* Spacer top — keeps the logo block off the very edge */}
      <div aria-hidden className="h-2 shrink-0" />

      {/* Centerpiece — big logo + headline */}
      <div className="relative z-10 flex flex-col items-center text-center gap-7">
        <div className="ring-copilot-gradient rounded-[2rem] inline-flex relative">
          {/* Soft outer glow */}
          <div
            aria-hidden
            className="absolute -inset-6 rounded-[3rem] bg-copilot-purple/25 blur-3xl pointer-events-none"
          />
          <div className="relative w-64 h-64 rounded-[2rem] bg-card/40 backdrop-blur-md flex items-center justify-center overflow-hidden">
            <Image
              src="/wingman-ai.png"
              alt="Wingman"
              width={240}
              height={240}
              className="object-contain drop-shadow-[0_10px_40px_hsl(258_90%_66%/0.6)]"
              priority
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className={`pulse-ring ${accentText[statusAccent]}`}>
            <span className={accentBg[statusAccent]} />
          </span>
          <p className="font-mono text-[10px] tracking-[0.22em] uppercase text-foreground/80">
            {status}
          </p>
        </div>

        <div className="space-y-3 max-w-md">
          <h1 className="text-5xl xl:text-6xl font-display font-bold tracking-tight leading-[0.95]">
            {headline}
          </h1>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
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
 * Kept here so login/setup share the exact same treatment.
 */
export function BrandMarkMobile() {
  return (
    <div className="lg:hidden flex flex-col items-center gap-3 mb-8">
      <div className="ring-copilot-gradient rounded-2xl">
        <div className="w-20 h-20 rounded-2xl bg-card/60 backdrop-blur-md flex items-center justify-center overflow-hidden">
          <Image
            src="/wingman-ai.png"
            alt="Wingman"
            width={72}
            height={72}
            className="object-contain drop-shadow-[0_4px_18px_hsl(258_90%_66%/0.55)]"
            priority
          />
        </div>
      </div>
      <div className="text-center leading-tight">
        <p className="text-base font-semibold tracking-tight">Wingman</p>
        <p className="font-mono text-[10px] text-muted-foreground tracking-[0.18em]">
          v0.1.0 · LOCAL
        </p>
      </div>
    </div>
  );
}
