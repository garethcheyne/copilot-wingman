"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { useConnection } from "@/components/connection-provider";

export function ElectricBorder({ children }: { children: React.ReactNode }) {
  const { health, message } = useConnection();

  const isDanger = health === "expired" || health === "disconnected";

  return (
    <div
      className={`electric-border h-screen p-[3px] ${isDanger ? "electric-danger" : ""}`}
    >
      <div className="flex flex-col h-full rounded-[inherit] bg-background overflow-hidden">
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
