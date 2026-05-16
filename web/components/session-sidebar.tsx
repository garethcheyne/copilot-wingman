"use client";

import Link from "next/link";
import Image from "next/image";
import { Plus, Settings, Trash2, MessageSquare } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useSession } from "@/components/session-provider";
import { useMobileNav } from "@/components/mobile-nav";

function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function SessionSidebarBody({ onItemSelect }: { onItemSelect?: () => void }) {
  const { sessions, activeSessionKey, createNewSession, switchSession, deleteSession } = useSession();

  return (
    <div className="flex flex-col h-full overflow-hidden relative">
      {/* edge glow */}
      <div aria-hidden className="absolute inset-y-0 right-0 w-px bg-linear-to-b from-transparent via-primary/30 to-transparent pointer-events-none hidden lg:block" />

      {/* Header */}
      <div className="px-4 pt-5 pb-4">
        <div className="flex items-center gap-3">
          <Image
            src="/wingman-ai.png"
            alt="Wingman"
            width={36}
            height={36}
            className="object-contain drop-shadow-[0_2px_12px_hsl(258_90%_66%/0.5)]"
            priority
          />
          <div className="leading-tight">
            <p className="text-sm font-semibold tracking-tight">Wingman</p>
            <p className="font-mono text-[10px] text-muted-foreground tracking-[0.15em]">
              v0.1.0 · LOCAL
            </p>
          </div>
        </div>
      </div>

      <div className="px-3 pb-3">
        <button
          type="button"
          onClick={() => {
            createNewSession();
            onItemSelect?.();
          }}
          className="shimmer-hover group w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium bg-card hover:bg-secondary border border-border hover:border-primary/40 transition-colors relative min-h-11"
        >
          <span className="inline-flex items-center justify-center w-4 h-4 rounded bg-primary/15 text-primary">
            <Plus className="w-3 h-3" strokeWidth={2.5} />
          </span>
          New Chat
          <kbd className="ml-auto font-mono text-[9px] text-muted-foreground tracking-wider opacity-60 group-hover:opacity-100 hidden sm:inline">
            ⌘N
          </kbd>
        </button>
      </div>

      <div className="px-5">
        <p className="label-mono">// Sessions</p>
      </div>

      {/* Session list */}
      <ScrollArea className="flex-1 px-2 py-2 scroll-sleek">
        {sessions.length === 0 ? (
          <div className="px-4 py-10 flex flex-col items-center gap-3 text-center">
            <div className="w-8 h-8 rounded-full border border-dashed border-border flex items-center justify-center text-muted-foreground/60">
              <span className="font-display font-bold text-base leading-none">∅</span>
            </div>
            <p className="font-mono text-[10px] tracking-wider text-muted-foreground/70 uppercase">
              No sessions yet
            </p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {sessions.map((s) => {
              const isActive = s.sessionKey === activeSessionKey;
              return (
                <div
                  key={s.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    switchSession(s.sessionKey);
                    onItemSelect?.();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      switchSession(s.sessionKey);
                      onItemSelect?.();
                    }
                  }}
                  className={`group w-full text-left px-3 py-3 rounded-lg text-sm transition-colors flex items-start gap-2.5 cursor-pointer min-h-12 ${
                    isActive
                      ? "bg-secondary/70 border border-primary/30"
                      : "hover:bg-secondary/40 active:bg-secondary/60 border border-transparent"
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-xs font-medium">
                      {s.preview || `Session ${s.sessionKey.slice(0, 8)}`}
                    </p>
                    <p className="font-mono text-[9px] text-muted-foreground/70 tracking-wider mt-0.5">
                      {s.messageCount} msgs · {timeAgo(s.updatedAt)}
                    </p>
                  </div>
                  <button
                    type="button"
                    title="Delete session"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteSession(s.id);
                    }}
                    className="opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity p-2 -m-1 rounded hover:bg-destructive/20 hover:text-destructive"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>

      <div className="rail-divider mx-3" />

      {/* Footer — live status */}
      <div className="p-3 space-y-2">
        <div className="flex items-center justify-between px-2 py-2 rounded-md bg-card/50 border border-border/50">
          <div className="flex items-center gap-2.5">
            <span className="pulse-ring text-copilot-green">
              <span className="bg-copilot-green" />
            </span>
            <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-foreground/80">
              Proxy · Online
            </span>
          </div>
        </div>
        <Link
          href="/admin"
          onClick={onItemSelect}
          className="flex items-center gap-2.5 px-3 py-2.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors min-h-11"
        >
          <Settings className="w-3.5 h-3.5" />
          <span>Admin</span>
          <span className="ml-auto font-mono text-[9px] tracking-wider text-muted-foreground/60">
            →
          </span>
        </Link>
      </div>
    </div>
  );
}

export function SessionSidebar() {
  const { open, setOpen } = useMobileNav();

  return (
    <>
      {/* Desktop: static aside */}
      <aside className="hidden lg:flex w-64 border-r border-border bg-sidebar/60 backdrop-blur-xl flex-col h-full overflow-hidden relative">
        <SessionSidebarBody />
      </aside>

      {/* Mobile: sheet drawer */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="left"
          className="w-72 max-w-[85vw] p-0 bg-sidebar/95 backdrop-blur-xl border-r border-border lg:hidden"
        >
          <SessionSidebarBody onItemSelect={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
    </>
  );
}
