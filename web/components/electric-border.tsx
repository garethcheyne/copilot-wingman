"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { useConnection } from "@/components/connection-provider";

export function ElectricBorder({ children }: { children: React.ReactNode }) {
  const { health, message } = useConnection();

  const isDanger = health === "expired" || health === "disconnected";

  return (
    <div
      className={`electric-border fixed inset-0 p-[3px] ${isDanger ? "electric-danger" : ""}`}
    >
      {/*
        Outer .electric-border sits at the literal device edge (the conic
        gradient glow hugs the iPhone's rounded corners). The inner shell
        applies ONLY horizontal safe-area insets (landscape sensor clusters).
        Top + bottom insets are deliberately omitted so each route's top bar
        and bottom bar can extend their OWN backgrounds up under the Dynamic
        Island and down under the home indicator — that's what reads as
        native edge-to-edge chrome, instead of translucent gaps sitting
        between iOS chrome and the app.
      */}
      <div className="flex flex-col h-full rounded-[inherit] bg-background overflow-hidden pr-safe pl-safe">
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
  );
}
