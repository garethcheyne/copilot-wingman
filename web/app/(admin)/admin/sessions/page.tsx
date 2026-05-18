"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import {
  History,
  Trash2,
  Loader2,
  MessageSquare,
  User,
  Sparkles,
  Hash,
  KeyRound,
  Globe,
  Filter,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { adminFetch } from "@/lib/admin-api";
import { ChatMarkdown } from "@/components/chat-markdown";

type SessionSource = "ui" | "api_key";

interface SessionSummary {
  id: string;
  sessionKey: string;
  systemPrompt: string | null;
  source: SessionSource;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  lastMessageAt: string | null;
  totalTokens: number | null;
  apiKeyId: string | null;
  apiKeyName: string | null;
  apiKeyPrefix: string | null;
  // Populated only for stateless API-key conversations (synthetic rows).
  endUser: string | null;
  conversationId: string | null;
  toolCalls: number;
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
    source: SessionSource;
    createdAt: string;
    updatedAt: string;
  };
  messages: MessageRow[];
}

interface ApiKeySummary {
  id: string;
  name: string;
  keyPrefix: string;
}

type SourceFilter = "all" | "ui" | "api_key";

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
  const [apiKeys, setApiKeys] = useState<ApiKeySummary[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [apiKeyFilter, setApiKeyFilter] = useState<string>("all"); // "all" | api key id

  const loadList = useCallback(async () => {
    setLoadingList(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (sourceFilter !== "all") params.set("source", sourceFilter);
      if (apiKeyFilter !== "all") {
        params.set("api_key_id", apiKeyFilter);
        // When a specific key is chosen, the source must be api_key.
        params.set("source", "api_key");
      }
      const qs = params.toString();
      const res = await adminFetch(`/api/admin/sessions${qs ? `?${qs}` : ""}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSessions(data.sessions || []);
    } catch (err) {
      setError((err as Error).message);
      setSessions([]);
    } finally {
      setLoadingList(false);
    }
  }, [sourceFilter, apiKeyFilter]);

  // Load API keys once for the filter dropdown.
  useEffect(() => {
    adminFetch("/api/admin/api-keys")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data) => {
        const raw = data.keys || data.apiKeys || data || [];
        const list: ApiKeySummary[] = (Array.isArray(raw) ? raw : []).map((k: any) => ({
          id: k.id,
          name: k.name,
          keyPrefix: k.keyPrefix ?? k.key_prefix ?? "",
        }));
        setApiKeys(list);
      })
      .catch(() => setApiKeys([]));
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
    adminFetch(`/api/admin/sessions/${encodeURIComponent(selectedId)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setLoadingDetail(false));
  }, [selectedId]);

  const handleDelete = async (id: string) => {
    if (id.startsWith("apikey:")) {
      // Synthetic API-key conversation: no chat_sessions row to delete.
      return;
    }
    setDeleting(id);
    try {
      const res = await adminFetch(`/api/admin/sessions/${id}`, {
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

  const stats = useMemo(() => {
    const list = sessions ?? [];
    return {
      count: list.length,
      messages: list.reduce((a, s) => a + s.messageCount, 0),
      tokens: list.reduce((a, s) => a + (s.totalTokens ?? 0), 0),
      uiCount: list.filter((s) => s.source === "ui").length,
      apiCount: list.filter((s) => s.source === "api_key").length,
    };
  }, [sessions]);

  // Selected api key meta for the active filter chip
  const activeApiKey = apiKeys.find((k) => k.id === apiKeyFilter);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-2">
        <p className="font-mono text-[10px] tracking-[0.22em] uppercase text-muted-foreground">
          admin / sessions
        </p>
        <div className="flex items-end gap-6 flex-wrap">
          <h1 className="text-3xl sm:text-4xl font-display font-bold tracking-tight leading-none">
            Session <span className="text-copilot-gradient">Archive</span>
          </h1>
          {!loadingList && (
            <div className="flex items-center gap-3 sm:gap-5 pb-1 font-mono text-[10px] tracking-[0.18em] uppercase text-muted-foreground flex-wrap">
              <span>
                <span className="text-foreground font-display font-bold text-lg mr-1.5">
                  {stats.count}
                </span>
                sessions
              </span>
              <span>
                <span className="text-foreground font-display font-bold text-lg mr-1.5">
                  {stats.messages}
                </span>
                messages
              </span>
              <span>
                <span className="text-foreground font-display font-bold text-lg mr-1.5">
                  {stats.tokens.toLocaleString()}
                </span>
                tokens
              </span>
            </div>
          )}
        </div>
        <p className="text-sm text-muted-foreground max-w-xl">
          Every conversation persisted in PostgreSQL — both web-UI chats and external
          API-key traffic. Filter by source and the specific key used.
        </p>
      </div>

      {/* Filter bar */}
      <div className="rounded-2xl border border-border/70 bg-card/50 backdrop-blur-md px-4 py-3 sm:px-5">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5 flex-wrap">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Filter className="w-3.5 h-3.5" />
            <p className="label-mono leading-none">// Filters</p>
          </div>

          {/* Source filter */}
          <div className="flex items-center gap-1 p-1 rounded-lg bg-background/50 border border-border/60">
            <FilterChip
              active={sourceFilter === "all"}
              onClick={() => {
                setSourceFilter("all");
                setApiKeyFilter("all");
              }}
              icon={<History className="w-3 h-3" />}
              label="All"
              count={stats.count}
            />
            <FilterChip
              active={sourceFilter === "ui" && apiKeyFilter === "all"}
              onClick={() => {
                setSourceFilter("ui");
                setApiKeyFilter("all");
              }}
              icon={<Globe className="w-3 h-3" />}
              label="Web UI"
            />
            <FilterChip
              active={sourceFilter === "api_key"}
              onClick={() => {
                setSourceFilter("api_key");
                if (apiKeyFilter !== "all" && !apiKeys.find((k) => k.id === apiKeyFilter)) {
                  setApiKeyFilter("all");
                }
              }}
              icon={<KeyRound className="w-3 h-3" />}
              label="API Keys"
            />
          </div>

          {/* API key selector — only when filtering api_key traffic */}
          {sourceFilter === "api_key" && (
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <label className="font-mono text-[10px] tracking-[0.18em] uppercase text-muted-foreground shrink-0">
                Key
              </label>
              <select
                value={apiKeyFilter}
                onChange={(e) => setApiKeyFilter(e.target.value)}
                aria-label="Filter sessions by API key"
                title="Filter sessions by API key"
                className="bg-background/60 border border-border/60 rounded-md px-2.5 py-1.5 text-xs font-mono tracking-wide focus:outline-none focus:border-primary/50 min-w-48 max-w-full truncate"
              >
                <option value="all">All API keys</option>
                {apiKeys.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.name} · {k.keyPrefix}…
                  </option>
                ))}
              </select>
              {apiKeys.length === 0 && (
                <span className="font-mono text-[10px] tracking-wider text-muted-foreground/70 uppercase">
                  // no keys yet
                </span>
              )}
            </div>
          )}

          {/* Active filter recap on the right */}
          <div className="sm:ml-auto flex items-center gap-2 font-mono text-[10px] tracking-wider text-muted-foreground/80 uppercase">
            <span>
              <span className="text-foreground font-display font-bold text-base mr-1">
                {stats.uiCount}
              </span>
              UI
            </span>
            <span className="opacity-40">·</span>
            <span>
              <span className="text-foreground font-display font-bold text-base mr-1">
                {stats.apiCount}
              </span>
              API
            </span>
            {activeApiKey && sourceFilter === "api_key" && (
              <>
                <span className="opacity-40">·</span>
                <span className="text-copilot-purple normal-case tracking-normal">
                  {activeApiKey.name}
                </span>
              </>
            )}
          </div>
        </div>
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
      ) : stats.count === 0 ? (
        <EmptyState filtered={sourceFilter !== "all" || apiKeyFilter !== "all"} />
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
                  onFilterKey={() => {
                    if (s.apiKeyId) {
                      setSourceFilter("api_key");
                      setApiKeyFilter(s.apiKeyId);
                    }
                  }}
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
              <SessionThread
                detail={detail}
                summary={sessions?.find((x) => x.id === detail.session.id) ?? null}
              />
            ) : (
              <DetailPlaceholder error />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs transition-colors min-h-8 ${
        active
          ? "bg-copilot-purple/15 text-copilot-purple border border-copilot-purple/30"
          : "text-muted-foreground hover:text-foreground hover:bg-secondary/60 border border-transparent"
      }`}
    >
      <span className={active ? "text-copilot-purple" : "text-muted-foreground"}>
        {icon}
      </span>
      <span className="font-medium">{label}</span>
      {typeof count === "number" && (
        <span className="font-mono text-[9px] tracking-wider opacity-70">
          {count}
        </span>
      )}
    </button>
  );
}

function SourceBadge({ session }: { session: SessionSummary }) {
  if (session.source === "api_key") {
    return (
      <span
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-mono tracking-wider uppercase border border-copilot-purple/30 bg-copilot-purple/10 text-copilot-purple max-w-full"
        title={
          session.apiKeyName
            ? `API key: ${session.apiKeyName} (${session.apiKeyPrefix ?? "?"}…)`
            : "API key (key info unavailable)"
        }
      >
        <KeyRound className="w-2.5 h-2.5 shrink-0" />
        <span className="truncate">
          {session.apiKeyName ?? "API Key"}
        </span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-mono tracking-wider uppercase border border-primary/30 bg-primary/10 text-primary">
      <Globe className="w-2.5 h-2.5" />
      UI
    </span>
  );
}

function SessionRow({
  session,
  active,
  deleting,
  onSelect,
  onDelete,
  onFilterKey,
}: {
  session: SessionSummary;
  active: boolean;
  deleting: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onFilterKey: () => void;
}) {
  // Synthetic rows represent stateless API-key conversations grouped from
  // request_log — there's no chat_sessions row to open or delete.
  const isSynthetic = session.id.startsWith("apikey:");
  const displayKey =
    session.sessionKey ??
    session.conversationId ??
    session.id;

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
      <div className="px-3 sm:px-4 py-3 backdrop-blur-md">
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
            <button
              type="button"
              onClick={(e) => {
                if (session.source === "api_key" && session.apiKeyId) {
                  e.stopPropagation();
                  onFilterKey();
                }
              }}
              className={
                session.source === "api_key" && session.apiKeyId
                  ? "hover:opacity-80 transition-opacity"
                  : "pointer-events-none"
              }
              title={
                session.source === "api_key" && session.apiKeyId
                  ? "Filter by this API key"
                  : undefined
              }
            >
              <SourceBadge session={session} />
            </button>
            <code className="font-mono text-[11px] tracking-wide text-foreground/90 truncate max-w-50 sm:max-w-65">
              {displayKey}
            </code>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity hover:bg-destructive/15 hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            disabled={deleting || isSynthetic}
            title={isSynthetic ? "Stateless API conversation — nothing to delete" : "Delete"}
          >
            {deleting ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Trash2 className="w-3 h-3" />
            )}
          </Button>
        </div>

        {session.source === "api_key" && session.apiKeyPrefix && (
          <p className="font-mono text-[9px] tracking-wider text-muted-foreground/70 mb-1 truncate">
            {session.apiKeyPrefix}… · key id {session.apiKeyId?.slice(0, 8)}
          </p>
        )}

        {session.endUser && (
          <p className="font-mono text-[9px] tracking-wider text-foreground/70 mb-1.5 truncate">
            user: <span className="text-foreground">{session.endUser}</span>
          </p>
        )}

        <div className="flex items-center gap-3 font-mono text-[10px] tracking-wider text-muted-foreground">
          <span className="flex items-center gap-1" title={isSynthetic ? "turns" : "messages"}>
            <MessageSquare className="w-2.5 h-2.5" />
            {session.messageCount}
          </span>
          {session.totalTokens !== null && (
            <span className="flex items-center gap-1">
              <Hash className="w-2.5 h-2.5" />
              {session.totalTokens.toLocaleString()}
            </span>
          )}
          {session.toolCalls > 0 && (
            <span className="flex items-center gap-1 text-copilot-green/90" title="tool calls">
              <Wrench className="w-2.5 h-2.5" />
              {session.toolCalls}
            </span>
          )}
          <span className="ml-auto">{formatRelative(session.lastMessageAt ?? session.updatedAt)}</span>
        </div>
      </div>
    </div>
  );
}

function SessionThread({
  detail,
  summary,
}: {
  detail: SessionDetail;
  summary: SessionSummary | null;
}) {
  const { session, messages } = detail;
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-card/60 backdrop-blur-md">
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-copilot-purple/40 to-transparent"
      />
      {/* Header */}
      <div className="px-4 sm:px-6 py-4 border-b border-border/70 bg-card/40">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <p className="label-mono">// Session</p>
              {summary && <SourceBadge session={summary} />}
            </div>
            <code className="font-mono text-xs sm:text-sm tracking-wide text-foreground/95 break-all">
              {session.sessionKey}
            </code>
            {summary?.source === "api_key" && summary.apiKeyName && (
              <p className="font-mono text-[10px] tracking-wider text-muted-foreground mt-1">
                <KeyRound className="w-3 h-3 inline mr-1 -mt-0.5 text-copilot-purple" />
                {summary.apiKeyName}
                {summary.apiKeyPrefix && (
                  <span className="text-muted-foreground/60"> · {summary.apiKeyPrefix}…</span>
                )}
              </p>
            )}
          </div>
          <div className="font-mono text-[10px] tracking-wider text-muted-foreground space-y-0.5 sm:text-right">
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
      <div className="max-h-[60vh] overflow-y-auto scroll-sleek px-4 sm:px-6 py-5 space-y-5">
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
        <div className="flex items-center gap-3 mb-1.5 flex-wrap">
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
          className={`text-sm break-words leading-relaxed px-4 py-3 rounded-lg border ${
            isUser
              ? "bg-primary/6 border-primary/20 border-l-2 border-l-primary whitespace-pre-wrap"
              : isAssistant
              ? "bg-card/60 border-border/70 border-l-2 border-l-copilot-purple"
              : "bg-accent/8 border-accent/30 border-l-2 border-l-accent whitespace-pre-wrap"
          }`}
        >
          {isAssistant ? <ChatMarkdown content={message.content} /> : message.content}
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

function EmptyState({ filtered }: { filtered?: boolean }) {
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
            {filtered ? (
              <>No <span className="text-copilot-gradient">matches</span></>
            ) : (
              <>No <span className="text-copilot-gradient">sessions</span> yet</>
            )}
          </h2>
          <p className="text-sm text-muted-foreground">
            {filtered
              ? "No sessions match the current filter. Try widening the source or picking a different API key."
              : (
                <>
                  Send your first message from the Chat tab. Sessions appear here keyed by{" "}
                  <code className="font-mono text-xs px-1.5 py-0.5 rounded bg-secondary/60 text-accent border border-border/60">
                    tenant:user:project
                  </code>
                  .
                </>
              )}
          </p>
        </div>

        <div className="font-mono text-[10px] tracking-[0.22em] uppercase text-muted-foreground/60 flex items-center gap-3">
          <span className="inline-block w-8 h-px bg-border" />
          {filtered ? "Filter active" : "Awaiting first request"}
          <span className="inline-block w-8 h-px bg-border" />
        </div>
      </div>
    </div>
  );
}
