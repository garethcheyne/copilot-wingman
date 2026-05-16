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
  KeyRound,
  Settings,
  Package,
  FileJson,
  Terminal,
  Heart,
  Network,
} from "lucide-react";
import { AuthGate } from "@/components/auth-gate";
import { ConnectionProvider } from "@/components/connection-provider";
import { ElectricBorder } from "@/components/electric-border";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  MobileNavProvider,
  MobileNavTrigger,
  useMobileNav,
} from "@/components/mobile-nav";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  /** Only mark active when the URL matches exactly (no `startsWith`). */
  exact?: boolean;
  children?: NavItem[];
};
type NavGroup = { label: string; items: NavItem[] };

const navGroups: NavGroup[] = [
  {
    label: "Overview",
    items: [{ href: "/admin", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Configuration",
    items: [
      { href: "/admin/connection", label: "Connection", icon: Link2 },
      { href: "/admin/models", label: "Models", icon: Cpu },
      { href: "/admin/api-keys", label: "API Keys", icon: KeyRound },
      { href: "/admin/settings", label: "Settings", icon: Settings },
    ],
  },
  {
    label: "Activity",
    items: [
      { href: "/admin/sessions", label: "Sessions", icon: History },
      { href: "/admin/usage", label: "Usage", icon: BarChart3 },
    ],
  },
  {
    label: "Reference",
    items: [
      {
        href: "/admin/docs",
        label: "API Docs",
        icon: BookOpen,
        children: [
          {
            href: "/admin/docs",
            label: "Overview",
            icon: BookOpen,
            exact: true,
          },
          { href: "/admin/docs/spec", label: "Interactive Spec", icon: FileJson },
          { href: "/admin/docs/chat", label: "Chat", icon: Terminal },
          { href: "/admin/docs/models", label: "Models", icon: Cpu },
          { href: "/admin/docs/health", label: "Health", icon: Heart },
          {
            href: "/admin/docs/reverse-proxy",
            label: "Reverse-Proxy",
            icon: Network,
          },
        ],
      },
    ],
  },
  {
    label: "System",
    items: [{ href: "/admin/system", label: "Version & Updates", icon: Package }],
  },
];

function isItemActive(item: NavItem, pathname: string | null): boolean {
  if (item.exact) return pathname === item.href;
  if (item.href === "/admin") return pathname === "/admin";
  return pathname?.startsWith(item.href) ?? false;
}

function NavLink({
  item,
  pathname,
  depth = 0,
}: {
  item: NavItem;
  pathname: string | null;
  depth?: number;
}) {
  const active = isItemActive(item, pathname);
  const inSubtree =
    !!item.children && !!pathname && pathname.startsWith(item.href);
  const showChildren = inSubtree;

  return (
    <>
      <Link
        href={item.href}
        className={`group relative flex items-center gap-3 rounded-md text-sm transition-colors min-h-10 ${
          depth === 0 ? "px-3 py-2.5 min-h-11" : "pl-9 pr-3 py-2 text-[13px]"
        } ${
          active
            ? "text-foreground bg-sidebar-accent"
            : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/60 active:bg-sidebar-accent/80"
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

        {depth === 0 ? (
          <item.icon
            className={`w-4 h-4 transition-colors ${
              active ? "text-copilot-purple" : ""
            }`}
            strokeWidth={active ? 2.2 : 1.8}
          />
        ) : (
          <span
            aria-hidden
            className={`w-1 h-1 rounded-full transition-colors ${
              active ? "bg-copilot-purple" : "bg-border group-hover:bg-muted-foreground"
            }`}
          />
        )}

        <span className={active ? "font-medium" : ""}>{item.label}</span>

        {active && depth === 0 && (
          <span className="ml-auto font-mono text-[9px] tracking-widest text-copilot-purple/80">
            ●
          </span>
        )}
      </Link>

      {showChildren && item.children && (
        <div className="space-y-0.5 mt-0.5 mb-1 relative">
          {/* Vertical thread linking the children */}
          <span
            aria-hidden
            className="absolute left-5 top-1 bottom-1 w-px bg-border/60"
          />
          {item.children.map((child) => (
            <NavLink
              key={child.href + child.label}
              item={child}
              pathname={pathname}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </>
  );
}

function AdminNavBody() {
  const pathname = usePathname();

  return (
    <div className="flex flex-col h-full overflow-hidden relative">
      {/* right-edge glow (desktop only) */}
      <div
        aria-hidden
        className="absolute inset-y-0 right-0 w-px bg-linear-to-b from-transparent via-accent/30 to-transparent pointer-events-none hidden lg:block"
      />

      {/* Header — pt-safe paints under iOS chrome on standalone iPhone PWAs. */}
      <div className="px-4 pb-4 pt-[max(env(safe-area-inset-top),1.25rem)]">
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

      {/* Grouped nav — min-h-0 lets the flex-1 scroll region shrink below
          its content; otherwise long nav lists push the footer off-screen. */}
      <nav className="flex-1 min-h-0 px-2 pb-2 scroll-sleek overflow-y-auto">
        {navGroups.map((group, gi) => (
          <div key={group.label} className={gi === 0 ? "" : "mt-4"}>
            <div className="px-3 pb-1.5 pt-1 flex items-center gap-2">
              <p className="label-mono leading-none">// {group.label}</p>
              <span
                aria-hidden
                className="flex-1 h-px bg-linear-to-r from-border/60 via-border/30 to-transparent"
              />
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavLink key={item.href} item={item} pathname={pathname} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="rail-divider mx-3" />

      {/* Footer — system status. pb-safe keeps the back-to-chat link clear
          of the iOS home indicator. */}
      <div className="px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] space-y-2">
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
          className="flex items-center gap-2.5 px-3 py-2.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors min-h-11"
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>Back to Chat</span>
          <span className="ml-auto font-mono text-[9px] tracking-wider text-muted-foreground/60">
            ←
          </span>
        </Link>
      </div>
    </div>
  );
}

function AdminMobileTopBar() {
  const pathname = usePathname();
  // Walk parents + children to find the deepest matching item for the title.
  const allItems: NavItem[] = navGroups.flatMap((g) =>
    g.items.flatMap((i) => (i.children ? [i, ...i.children] : [i])),
  );
  const exact = allItems.find(
    (i) => i.exact && pathname === i.href,
  );
  const matches = allItems
    .filter((i) => !i.exact)
    .filter((i) =>
      i.href === "/admin" ? pathname === "/admin" : pathname?.startsWith(i.href),
    )
    .sort((a, b) => b.href.length - a.href.length);
  const active = exact ?? matches[0];
  return (
    <header className="lg:hidden pt-safe flex items-center gap-3 min-h-14 px-4 border-b border-border/70 bg-background/70 backdrop-blur-xl shrink-0">
      <MobileNavTrigger label="Open admin navigation" />
      <div className="flex items-center gap-2 min-w-0">
        <Image
          src="/wingman-ai.png"
          alt="Wingman"
          width={24}
          height={24}
          className="object-contain shrink-0"
        />
        <div className="leading-tight min-w-0">
          <p className="text-[10px] font-mono tracking-[0.18em] uppercase text-muted-foreground">
            Admin
          </p>
          <p className="text-sm font-semibold truncate">{active?.label ?? "Dashboard"}</p>
        </div>
      </div>
    </header>
  );
}

function AdminShell({ children }: { children: React.ReactNode }) {
  const { open, setOpen } = useMobileNav();
  return (
    <ElectricBorder>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-60 border-r border-border bg-sidebar/60 backdrop-blur-xl flex-col relative">
        <AdminNavBody />
      </aside>

      {/* Mobile drawer */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="left"
          className="w-72 max-w-[85vw] p-0 bg-sidebar/95 backdrop-blur-xl border-r border-border lg:hidden"
        >
          <AdminNavBody />
        </SheetContent>
      </Sheet>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <AdminMobileTopBar />
        <main className="flex-1 overflow-auto scroll-sleek">
          <div className="px-4 pt-6 sm:px-6 sm:pt-8 lg:px-8 lg:pt-10 pb-[max(1.5rem,env(safe-area-inset-bottom))] max-w-6xl">
            {children}
          </div>
        </main>
      </div>
    </ElectricBorder>
  );
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGate>
      <ConnectionProvider>
        <MobileNavProvider>
          <AdminShell>{children}</AdminShell>
        </MobileNavProvider>
      </ConnectionProvider>
    </AuthGate>
  );
}
