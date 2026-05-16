"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Link2,
  History,
  BarChart3,
  MessageSquare,
  Cpu,
  BookOpen,
} from "lucide-react";
import { AuthGate } from "@/components/auth-gate";
import { ConnectionProvider } from "@/components/connection-provider";
import { ElectricBorder } from "@/components/electric-border";

const navItems = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/connection", label: "Connection", icon: Link2 },
  { href: "/admin/models", label: "Models", icon: Cpu },
  { href: "/admin/docs", label: "API Docs", icon: BookOpen },
  { href: "/admin/sessions", label: "Sessions", icon: History },
  { href: "/admin/usage", label: "Usage", icon: BarChart3 },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <AuthGate>
    <ConnectionProvider>
    <ElectricBorder>
      <aside className="w-60 border-r border-border bg-sidebar/60 backdrop-blur-xl flex flex-col relative">
        {/* right-edge glow */}
        <div
          aria-hidden
          className="absolute inset-y-0 right-0 w-px bg-linear-to-b from-transparent via-accent/30 to-transparent pointer-events-none"
        />

        {/* Header */}
        <div className="px-4 pt-5 pb-4">
          <div className="flex items-center gap-3">
            <Image
              src="/wingman-ai.png"
              alt="Wingman Admin"
              width={36}
              height={36}
              className="object-contain drop-shadow-[0_2px_12px_hsl(258_90%_66%/0.5)]"
              priority
            />
            <div className="leading-tight">
              <p className="text-sm font-semibold tracking-tight">Admin</p>
              <p className="font-mono text-[10px] text-muted-foreground tracking-[0.15em]">
                127.0.0.1 · LOCAL
              </p>
            </div>
          </div>
        </div>

        <div className="px-5 pb-2">
          <p className="label-mono">// Navigation</p>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 space-y-0.5 scroll-sleek overflow-y-auto">
          {navItems.map((item) => {
            const active =
              item.href === "/admin"
                ? pathname === "/admin"
                : pathname?.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group relative flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                  active
                    ? "text-foreground bg-sidebar-accent"
                    : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/60"
                }`}
              >
                {/* Active accent bar */}
                <span
                  aria-hidden
                  className={`absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r-full transition-all ${
                    active
                      ? "bg-copilot-purple shadow-[0_0_8px_hsl(258_90%_66%/0.8)]"
                      : "bg-transparent group-hover:bg-border"
                  }`}
                />
                <item.icon
                  className={`w-4 h-4 transition-colors ${
                    active ? "text-copilot-purple" : ""
                  }`}
                  strokeWidth={active ? 2.2 : 1.8}
                />
                <span className={active ? "font-medium" : ""}>{item.label}</span>
                {active && (
                  <span className="ml-auto font-mono text-[9px] tracking-widest text-copilot-purple/80">
                    ●
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="rail-divider mx-3" />

        {/* Footer — system status */}
        <div className="p-3 space-y-2">
          <div className="flex items-center justify-between px-3 py-2 rounded-md bg-card/50 border border-border/50">
            <div className="flex items-center gap-2.5">
              <span className="pulse-ring text-copilot-green">
                <span className="bg-copilot-green" />
              </span>
              <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-foreground/80">
                System · Nominal
              </span>
            </div>
          </div>
          <Link
            href="/chat"
            className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Back to Chat</span>
            <span className="ml-auto font-mono text-[9px] tracking-wider text-muted-foreground/60">
              ←
            </span>
          </Link>
        </div>
      </aside>

      <main className="flex-1 overflow-auto scroll-sleek">
        <div className="px-8 py-10 max-w-6xl">{children}</div>
      </main>
    </ElectricBorder>
    </ConnectionProvider>
    </AuthGate>
  );
}
