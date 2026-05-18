"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { useConnection } from "@/components/connection-provider";
import {
  DynamicIslandZone,
  useSafeAreaInsets,
} from "@/components/safe-area-providers";

const ELECTRIC_CONIC = `conic-gradient(
  from var(--electric-angle),
  hsl(264 80% 60%),
  hsl(200 100% 60%),
  hsl(160 95% 55%),
  hsl(264 80% 60%),
  hsl(320 90% 60%),
  hsl(264 80% 60%)
)`;

const ELECTRIC_DANGER_CONIC = `conic-gradient(
  from var(--electric-angle),
  hsl(0 85% 55%),
  hsl(25 95% 55%),
  hsl(0 85% 55%),
  hsl(345 80% 50%),
  hsl(15 90% 55%),
  hsl(0 85% 55%)
)`;

const ELECTRIC_ISLAND_STYLE: React.CSSProperties = {
  animation: "electric-spin 3s linear infinite",
  // Bleed past env(safe-area-inset-top) so the paint shows as a soft
  // halo just under the camera, not cut hard at the OS chrome boundary.
  // The 8px overshoot sits over the chrome's own safe-area padding —
  // headers pad themselves by safe-area-inset-top, so visible content
  // is unaffected. The zone is pointer-events:none by default, so the
  // overlap doesn't intercept taps either.
  height: "calc(env(safe-area-inset-top, 0px) + 8px)",
};

export function ElectricBorder({ children }: { children: React.ReactNode }) {
  const { health, message } = useConnection();
  const insets = useSafeAreaInsets();

  const isDanger = health === "expired" || health === "disconnected";
  // Only render the electric island paint when the device actually has
  // a top safe-area inset to extend into (iPhone with Dynamic Island /
  // notch, Android with cutout, iOS PWA status bar). On desktop browsers
  // the inset is 0 and rendering the zone would just plant an 8px
  // rainbow stripe at the top of the window — exactly what we don't want.
  const hasTopInset = insets.top > 0;

  return (
    <>
      {/* Extend the spinning ribbon up into the iOS Dynamic Island band.
          Each element gets its own --electric-angle cycle (the @property
          in globals.css is inherits:false) so this paints independently
          from .electric-border below — but matched gradient + speed keep
          the hue pulse visually in sync. */}
      {hasTopInset && (
        <DynamicIslandZone
          background={isDanger ? ELECTRIC_DANGER_CONIC : ELECTRIC_CONIC}
          style={ELECTRIC_ISLAND_STYLE}
        />
      )}
      <div
        className={`electric-border p-[3px] flex flex-col ${isDanger ? "electric-danger" : ""}`}
      >
      {/*
        Outer .electric-border is pinned with fixed + inset-0 so it always
        reaches the device's literal top + bottom edges on iOS — viewport
        height units (dvh/lvh/svh) all have quirks where they sometimes
        exclude the safe-area zones (Dynamic Island, home indicator), and
        pinning is the only bulletproof way. Outer is flex-col so the inner
        shell can use flex-1 (instead of h-full) and dodge the percentage-
        height resolution issue that fixed-position parents would otherwise
        cause for children that use h-full.

        Inner shell applies ONLY horizontal safe-area insets (landscape
        sensor clusters). Top + bottom insets are deliberately omitted so
        each route's top bar and bottom bar can extend their OWN backgrounds
        up under the Dynamic Island and down under the home indicator —
        that's what reads as native edge-to-edge chrome, instead of
        translucent gaps sitting between iOS chrome and the app.
      */}
      <div className="flex-1 min-h-0 flex flex-col rounded-[inherit] bg-background overflow-hidden pr-safe pl-safe">
        {/* Warning banner */}
        {isDanger && message && (
          <div className="flex items-center gap-2 px-4 py-2 bg-destructive/10 border-b border-destructive/30 text-destructive text-sm shrink-0">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span className="flex-1">{message}</span>
            <Link
              href="/admin/connection"
              className="text-xs font-medium underline underline-offset-2 hover:text-destructive/80 shrink-0"
            >
              Fix now →
            </Link>
          </div>
        )}
        <div className="flex flex-1 overflow-hidden">{children}</div>
      </div>
      </div>
    </>
  );
}
