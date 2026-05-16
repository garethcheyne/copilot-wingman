"use client";

import { useEffect, useState, useCallback } from "react";
import { History, Trash2, Loader2, MessageSquare, User, Sparkles, Hash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const PROXY_URL = process.env.NEXT_PUBLIC_PROXY_URL || "http://localhost:3200";

interface SessionSummary {
  id: string;
  sessionKey: string;
  systemPrompt: string | null;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  lastMessageAt: string | null;
  totalTokens: number | null;
}

interface MessageRow {
  id: string;
  role: "system" | "user" | "assistant";
  content: string;
  tokenCount: number | null;
  createdAt: string;
}

interface SessionDetail {
  session: {
    id: string;
    sessionKey: string;
    systemPrompt: string | null;
    createdAt: string;
    updatedAt: string;
  };
  messages: MessageRow[];
}

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function formatAbs(iso: string): string {
  return new Date(iso).toLocaleString();
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    setLoadingList(true);
    setError(null);
    try {
      const res = await fetch(`${PROXY_URL}/api/admin/sessions`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSessions(data.sessions || []);
    } catch (err) {
      setError((err as Error).message);
      setSessions([]);
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    setLoadingDetail(true);
    fetch(`${PROXY_URL}/api/admin/sessions/${selectedId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setLoadingDetail(false));
  }, [selectedId]);

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      const res = await fetch(`${PROXY_URL}/api/admin/sessions/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setSessions((prev) => (prev ?? []).filter((s) => s.id !== id));
        if (selectedId === id) {
          setSelectedId(null);
        }
      }
    } catch {
      // ignore
    } finally {
      setDeleting(null);
    }
  };

  const sessionsCount = sessions?.length ?? 0;
  const totalMessages = (sessions ?? []).reduce((a, s) => a + s.messageCount, 0);
  const totalTokens = (sessions ?? []).reduce((a, s) => a + (s.totalTokens ?? 0), 0);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-2">
        <p className="font-mono text-[10px] tracking-[0.22em] uppercase text-muted-foreground">
          admin / sessions
        </p>
        <div className="flex items-end gap-6 flex-wrap">
          <h1 className="text-4xl font-display font-bold tracking-tight leading-none">
            Session <span className="text-copilot-gradient">Archive</span>
          </h1>
          {!loadingList && (
            <div className="flex items-center gap-5 pb-1 font-mono text-[10px] tracking-[0.18em] uppercase text-muted-foreground">
              <span>
                <span className="text-foreground font-display font-bold text-lg mr-1.5">
                  {sessionsCount}
                </span>
                sessions
              </span>
              <span>
                <span className="text-foreground font-display font-bold text-lg mr-1.5">
                  {totalMessages}
                </span>
                messages
              </span>
              <span>
                <span className="text-foreground font-display font-bold text-lg mr-1.5">
                  {totalTokens.toLocaleString()}
                </span>
                tokens
              </span>
            </div>
          )}
        </div>
        <p className="text-sm text-muted-foreground max-w-md">
          Browse every conversation persisted in PostgreSQL. Inspect messages, audit usage, drop stale sessions.
        </p>
      </div>

      {/* Empty / Error / Content */}
      {loadingList ? (
        <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-4">
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-96 rounded-2xl" />
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/5 px-6 py-5 font-mono text-[11px] tracking-wide text-destructive">
          // Could not reach proxy &mdash; {error}
        </div>
      ) : sessionsCount === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-4">
          {/* List */}
          <div className="space-y-2">
            <p className="label-mono px-1">// Sessions</p>
            <div className="space-y-2 max-h-[70vh] overflow-y-auto scroll-sleek pr-1">
              {(sessions ?? []).map((s) => (
                <SessionRow
                  key={s.id}
                  session={s}
                  active={s.id === selectedId}
                  deleting={deleting === s.id}
                  onSelect={() => setSelectedId(s.id)}
                  onDelete={() => handleDelete(s.id)}
                />
              ))}
            </div>
          </div>

          {/* Detail */}
          <div>
            <p className="label-mono px-1 mb-2">// Thread</p>
            {!selectedId ? (
              <DetailPlaceholder />
            ) : loadingDetail ? (
              <Skeleton className="h-96 rounded-2xl" />
            ) : detail ? (
              <SessionThread detail={detail} />
            ) : (
              <DetailPlaceholder error />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SessionRow({
  session,
  active,
  deleting,
  onSelect,
  onDelete,
}: {
  session: SessionSummary;
  active: boolean;
  deleting: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={`group relative overflow-hidden rounded-xl border transition-all cursor-pointer ${
        active
          ? "border-copilot-purple/50 bg-copilot-purple/8 shadow-[0_0_24px_-12px_hsl(258_90%_66%/0.6)]"
          : "border-border/70 bg-card/60 hover:border-border hover:bg-card/80"
      }`}
      onClick={onSelect}
    >
      {active && (
        <span
          aria-hidden
          className="absolute left-0 top-3 bottom-3 w-0.5 rounded-r-full bg-copilot-purple shadow-[0_0_8px_hsl(258_90%_66%/0.8)]"
        />
      )}
      <div className="px-4 py-3.5 backdrop-blur-md">
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <code className="font-mono text-[11px] tracking-wide text-foreground/90 truncate max-w-[280px]">
            {session.sessionKey}
          </code>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/15 hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            disabled={deleting}
          >
            {deleting ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Trash2 className="w-3 h-3" />
            )}
          </Button>
        </div>

        <div className="flex items-center gap-3 font-mono text-[10px] tracking-wider text-muted-foreground">
          <span className="flex items-center gap-1">
            <MessageSquare className="w-2.5 h-2.5" />
            {session.messageCount}
          </span>
          {session.totalTokens !== null && (
            <span className="flex items-center gap-1">
              <Hash className="w-2.5 h-2.5" />
              {session.totalTokens.toLocaleString()}
            </span>
          )}
          <span className="ml-auto">{formatRelative(session.lastMessageAt ?? session.updatedAt)}</span>
        </div>
      </div>
    </div>
  );
}

function SessionThread({ detail }: { detail: SessionDetail }) {
  const { session, messages } = detail;
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-card/60 backdrop-blur-md">
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-copilot-purple/40 to-transparent"
      />
      {/* Header */}
      <div className="px-6 py-4 border-b border-border/70 bg-card/40">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="label-mono mb-1">// Session</p>
            <code className="font-mono text-sm tracking-wide text-foreground/95 break-all">
              {session.sessionKey}
            </code>
          </div>
          <div className="font-mono text-[10px] tracking-wider text-muted-foreground space-y-0.5 text-right">
            <p>
              <span className="text-muted-foreground/60">CREATED &nbsp;</span>
              {formatAbs(session.createdAt)}
            </p>
            <p>
              <span className="text-muted-foreground/60">UPDATED &nbsp;</span>
              {formatAbs(session.updatedAt)}
            </p>
            <p>
              <span className="text-muted-foreground/60">MESSAGES &nbsp;</span>
              {messages.length}
            </p>
          </div>
        </div>
        {session.systemPrompt && (
          <div className="mt-4 rounded-lg border border-border/60 bg-background/40 px-3 py-2.5">
            <p className="label-mono mb-1">// System Prompt</p>
            <p className="text-xs text-foreground/80 whitespace-pre-wrap leading-relaxed">
              {session.systemPrompt}
            </p>
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="max-h-[60vh] overflow-y-auto scroll-sleek px-6 py-5 space-y-5">
        {messages.length === 0 ? (
          <p className="font-mono text-[11px] tracking-wider text-muted-foreground/70 text-center py-8 uppercase">
            // No messages in this session yet
          </p>
        ) : (
          messages.map((msg) => <MessageBlock key={msg.id} message={msg} />)
        )}
      </div>
    </div>
  );
}

function MessageBlock({ message }: { message: MessageRow }) {
  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";
  return (
    <div className="flex gap-3.5">
      <div className="shrink-0">
        {isUser ? (
          <div className="w-7 h-7 rounded-full bg-secondary/80 border border-border/70 flex items-center justify-center">
            <User className="w-3 h-3 text-muted-foreground" />
          </div>
        ) : isAssistant ? (
          <div className="ring-copilot-gradient rounded-full">
            <div className="w-7 h-7 rounded-full bg-card flex items-center justify-center">
              <Sparkles className="w-3 h-3 text-copilot-purple" strokeWidth={2} />
            </div>
          </div>
        ) : (
          <div className="w-7 h-7 rounded-full bg-accent/15 border border-accent/30 flex items-center justify-center">
            <span className="font-mono text-[10px] text-accent">S</span>
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3 mb-1.5">
          <p className="font-mono text-[10px] tracking-[0.18em] uppercase text-muted-foreground/80">
            // {message.role === "system" ? "System" : isUser ? "User" : "Assistant"}
          </p>
          {message.tokenCount !== null && (
            <span className="font-mono text-[9px] tracking-wider text-muted-foreground/60">
              {message.tokenCount} tok
            </span>
          )}
          <span className="font-mono text-[9px] tracking-wider text-muted-foreground/60 ml-auto">
            {formatAbs(message.createdAt)}
          </span>
        </div>
        <div
          className={`text-sm whitespace-pre-wrap break-words leading-relaxed px-4 py-3 rounded-lg border ${
            isUser
              ? "bg-primary/6 border-primary/20 border-l-2 border-l-primary"
              : isAssistant
              ? "bg-card/60 border-border/70 border-l-2 border-l-copilot-purple"
              : "bg-accent/8 border-accent/30 border-l-2 border-l-accent"
          }`}
        >
          {message.content}
        </div>
      </div>
    </div>
  );
}

function DetailPlaceholder({ error }: { error?: boolean }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-dashed border-border/70 bg-card/30 backdrop-blur-md px-6 py-20 flex flex-col items-center gap-4 text-center">
      <div className="relative flex items-center justify-center">
        <div aria-hidden className="absolute w-24 h-24 rounded-full border border-copilot-purple/15" />
        <div aria-hidden className="absolute w-14 h-14 rounded-full bg-copilot-purple/10 blur-xl" />
        <div className="relative w-10 h-10 rounded-xl bg-card border border-border flex items-center justify-center">
          <MessageSquare className="w-4 h-4 text-copilot-purple" strokeWidth={1.8} />
        </div>
      </div>
      <p className="font-mono text-[10px] tracking-[0.22em] uppercase text-muted-foreground">
        {error ? "// Session not found" : "// Select a session to view the thread"}
      </p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-card/60 backdrop-blur-md">
      <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-accent/40 to-transparent" />
      <div className="relative px-6 py-24 flex flex-col items-center gap-6 text-center">
        <div className="relative flex items-center justify-center">
          <div aria-hidden className="absolute w-48 h-48 rounded-full border border-accent/15 animate-pulse" />
          <div aria-hidden className="absolute w-32 h-32 rounded-full border border-accent/25" />
          <div aria-hidden className="absolute w-20 h-20 rounded-full bg-accent/10 blur-2xl" />
          <div className="relative w-14 h-14 rounded-2xl bg-card border border-border flex items-center justify-center">
            <History className="w-6 h-6 text-accent" strokeWidth={1.7} />
          </div>
        </div>

        <div className="space-y-2 max-w-sm">
          <h2 className="text-2xl font-display font-bold leading-tight">
            No <span className="text-copilot-gradient">sessions</span> yet
          </h2>
          <p className="text-sm text-muted-foreground">
            Send your first message from the Chat tab. Sessions appear here keyed by{" "}
            <code className="font-mono text-xs px-1.5 py-0.5 rounded bg-secondary/60 text-accent border border-border/60">
              tenant:user:project
            </code>
            .
          </p>
        </div>

        <div className="font-mono text-[10px] tracking-[0.22em] uppercase text-muted-foreground/60 flex items-center gap-3">
          <span className="inline-block w-8 h-px bg-border" />
          Awaiting first request
          <span className="inline-block w-8 h-px bg-border" />
        </div>
      </div>
    </div>
  );
}
