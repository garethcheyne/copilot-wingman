"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Cpu, Sparkles, Zap, Feather, Check, Loader2, RefreshCw, Ban, RotateCcw, AlertTriangle, Clock } from "lucide-react";
import { adminFetch } from "@/lib/admin-api";

interface Model {
  id: string;
  name: string;
  vendor: string;
  version: string;
  category?: string;
  preview: boolean;
  status: "active" | "removed" | "revoked";
  chat_enabled: boolean;
  supported_endpoints: string[];
  description: string | null;
  best_for: string | null;
  premium_multiplier: number | null;
  retirement_date: string | null;
  organization: string | null;
  model_type: string | null;
  modalities: string[];
  license: string | null;
  open_weight: boolean;
  input_price_per_m: number | null;
  output_price_per_m: number | null;
  release_date: string | null;
  context_window: number | null;
  param_count: number | null;
  first_seen_at: string;
  last_seen_at: string;
  removed_at: string | null;
  capabilities: {
    family?: string;
    type?: string;
    context_window?: number;
    max_output_tokens?: number;
    supports?: {
      streaming?: boolean;
      tool_calls?: boolean;
      parallel_tool_calls?: boolean;
      vision?: boolean;
      structured_outputs?: boolean;
      thinking?: boolean;
    };
  } | null;
}

interface SyncEvent {
  id: string;
  model_id: string;
  event: string;
  old_value: any;
  new_value: any;
  created_at: string;
}

interface SyncResult {
  added: string[];
  removed: string[];
  restored: string[];
  changed: string[];
  unchanged: number;
  total_upstream: number;
  total_active: number;
  synced_at: string;
}

type CategoryKey = "powerful" | "versatile" | "lightweight" | "other";

const categoryMeta: Record<
  CategoryKey,
  {
    label: string;
    icon: React.ReactNode;
    text: string;
    border: string;
    glow: string;
    line: string;
    bg: string;
  }
> = {
  powerful: {
    label: "Powerful",
    icon: <Sparkles className="w-3.5 h-3.5" />,
    text: "text-copilot-purple",
    border: "border-copilot-purple/40",
    glow: "hover:shadow-[0_0_30px_-8px_hsl(258_90%_66%/0.6)]",
    line: "from-transparent via-copilot-purple/60 to-transparent",
    bg: "bg-copilot-purple/8",
  },
  versatile: {
    label: "Versatile",
    icon: <Zap className="w-3.5 h-3.5" />,
    text: "text-primary",
    border: "border-primary/40",
    glow: "hover:shadow-[0_0_30px_-8px_hsl(225_73%_57%/0.6)]",
    line: "from-transparent via-primary/60 to-transparent",
    bg: "bg-primary/8",
  },
  lightweight: {
    label: "Lightweight",
    icon: <Feather className="w-3.5 h-3.5" />,
    text: "text-copilot-green",
    border: "border-copilot-green/40",
    glow: "hover:shadow-[0_0_30px_-8px_hsl(142_71%_45%/0.6)]",
    line: "from-transparent via-copilot-green/60 to-transparent",
    bg: "bg-copilot-green/8",
  },
  other: {
    label: "Other",
    icon: <Cpu className="w-3.5 h-3.5" />,
    text: "text-accent",
    border: "border-accent/40",
    glow: "hover:shadow-[0_0_30px_-8px_hsl(187_86%_43%/0.5)]",
    line: "from-transparent via-accent/60 to-transparent",
    bg: "bg-accent/8",
  },
};

export default function ModelsPage() {
  const [models, setModels] = useState<Model[]>([]);
  const [removedModels, setRemovedModels] = useState<Model[]>([]);
  const [events, setEvents] = useState<SyncEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [defaultModel, setDefaultModel] = useState<string>("gpt-4o");
  const [savingDefault, setSavingDefault] = useState(false);

  const load = useCallback(async () => {
    try {
      const [modelsRes, settingsRes, eventsRes] = await Promise.all([
        adminFetch("/api/admin/models"),
        adminFetch("/api/admin/settings"),
        adminFetch("/api/admin/models/events?limit=20"),
      ]);
      if (modelsRes.ok) {
        const data = await modelsRes.json();
        setModels(data.data ?? []);
        setRemovedModels(data.removed ?? []);
        setLastSync(data.last_sync ?? null);
      }
      if (settingsRes.ok) {
        const settings = await settingsRes.json();
        if (settings.default_model) setDefaultModel(settings.default_model);
      }
      if (eventsRes.ok) {
        const data = await eventsRes.json();
        setEvents(data.events ?? []);
      }
    } catch {
      // proxy down
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const triggerSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await adminFetch("/api/admin/models/sync", { method: "POST" });
      if (res.ok) {
        const result = await res.json();
        setSyncResult(result);
        // Reload to show updated data
        await load();
      }
    } catch {
      // ignore
    } finally {
      setSyncing(false);
    }
  };

  const setAsDefault = async (modelId: string) => {
    setSavingDefault(true);
    try {
      const res = await adminFetch("/api/admin/settings/default_model", {
        method: "PUT",
        body: JSON.stringify({ value: modelId }),
      });
      if (res.ok) setDefaultModel(modelId);
    } catch {
      // ignore
    } finally {
      setSavingDefault(false);
    }
  };

  const activeModels = models.filter(m => m.status === "active");
  const chatModels = activeModels.filter(m => m.category);
  const otherModels = activeModels.filter(m => !m.category);
  const powerful = chatModels.filter(m => m.category === "powerful");
  const versatile = chatModels.filter(m => m.category === "versatile");
  const lightweight = chatModels.filter(m => m.category === "lightweight");

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-2">
        <p className="font-mono text-[10px] tracking-[0.22em] uppercase text-muted-foreground">
          admin / models
        </p>
        <div className="flex items-end gap-4 flex-wrap">
          <h1 className="text-4xl font-display font-bold tracking-tight leading-none">
            Model <span className="text-copilot-gradient font-display font-bold">Catalog</span>
          </h1>
          {!loading && (
            <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-muted-foreground pb-1">
              {activeModels.length} active{removedModels.length > 0 ? ` · ${removedModels.length} removed` : ""}
            </p>
          )}
        </div>
        <p className="text-sm text-muted-foreground max-w-md">
          Models synced from your Copilot subscription. Set a default for the chat UI.
        </p>
      </div>

      {/* Sync controls */}
      <div className="flex items-center gap-4 flex-wrap">
        <Button
          variant="outline"
          size="sm"
          className="font-mono text-[10px] tracking-widest uppercase gap-2"
          onClick={triggerSync}
          disabled={syncing}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Syncing…" : "Sync Models"}
        </Button>
        {lastSync && (
          <span className="font-mono text-[10px] text-muted-foreground/60 tracking-wider">
            Last sync: {new Date(lastSync).toLocaleString()}
          </span>
        )}
        {syncResult && (
          <SyncResultBadge result={syncResult} />
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          <Tabs defaultValue="powerful">
            <TabsList className="bg-card/60 backdrop-blur-md border border-border/70 p-1 h-auto">
              <TabsTrigger value="powerful" className="font-mono text-[10px] tracking-widest uppercase data-[state=active]:bg-copilot-purple/15 data-[state=active]:text-copilot-purple">
                <Sparkles className="w-3 h-3 mr-1.5" />
                Powerful · {powerful.length}
              </TabsTrigger>
              <TabsTrigger value="versatile" className="font-mono text-[10px] tracking-widest uppercase data-[state=active]:bg-primary/15 data-[state=active]:text-primary">
                <Zap className="w-3 h-3 mr-1.5" />
                Versatile · {versatile.length}
              </TabsTrigger>
              <TabsTrigger value="lightweight" className="font-mono text-[10px] tracking-widest uppercase data-[state=active]:bg-copilot-green/15 data-[state=active]:text-copilot-green">
                <Feather className="w-3 h-3 mr-1.5" />
                Light · {lightweight.length}
              </TabsTrigger>
              <TabsTrigger value="other" className="font-mono text-[10px] tracking-widest uppercase data-[state=active]:bg-accent/15 data-[state=active]:text-accent">
                <Cpu className="w-3 h-3 mr-1.5" />
                Other · {otherModels.length}
              </TabsTrigger>
              {removedModels.length > 0 && (
                <TabsTrigger value="removed" className="font-mono text-[10px] tracking-widest uppercase data-[state=active]:bg-destructive/15 data-[state=active]:text-destructive">
                  <Ban className="w-3 h-3 mr-1.5" />
                  Removed · {removedModels.length}
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="powerful" className="mt-6">
              <ModelGrid models={powerful} category="powerful" defaultModel={defaultModel} onSetDefault={setAsDefault} savingDefault={savingDefault} />
            </TabsContent>
            <TabsContent value="versatile" className="mt-6">
              <ModelGrid models={versatile} category="versatile" defaultModel={defaultModel} onSetDefault={setAsDefault} savingDefault={savingDefault} />
            </TabsContent>
            <TabsContent value="lightweight" className="mt-6">
              <ModelGrid models={lightweight} category="lightweight" defaultModel={defaultModel} onSetDefault={setAsDefault} savingDefault={savingDefault} />
            </TabsContent>
            <TabsContent value="other" className="mt-6">
              <ModelGrid models={otherModels} category="other" defaultModel={defaultModel} onSetDefault={setAsDefault} savingDefault={savingDefault} />
            </TabsContent>
            {removedModels.length > 0 && (
              <TabsContent value="removed" className="mt-6">
                <ModelGrid models={removedModels} category="other" defaultModel={defaultModel} onSetDefault={setAsDefault} savingDefault={savingDefault} showStatus />
              </TabsContent>
            )}
          </Tabs>

          {/* Sync Event Log */}
          {events.length > 0 && (
            <div className="space-y-3">
              <h2 className="font-mono text-[10px] tracking-[0.22em] uppercase text-muted-foreground">
                Recent Changes
              </h2>
              <div className="rounded-xl border border-border/70 bg-card/60 backdrop-blur-md overflow-hidden">
                <div className="divide-y divide-border/50">
                  {events.slice(0, 10).map((e) => (
                    <div key={e.id} className="flex items-center gap-3 px-4 py-2.5">
                      <EventIcon event={e.event} />
                      <span className="font-mono text-[11px] font-medium">{e.model_id}</span>
                      <span className="font-mono text-[10px] tracking-wider text-muted-foreground">{e.event.replace(/_/g, " ")}</span>
                      <span className="ml-auto font-mono text-[10px] text-muted-foreground/50">{new Date(e.created_at).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ModelGrid({
  models,
  category,
  defaultModel,
  onSetDefault,
  savingDefault,
  showStatus,
}: {
  models: Model[];
  category: CategoryKey;
  defaultModel: string;
  onSetDefault: (id: string) => void;
  savingDefault: boolean;
  showStatus?: boolean;
}) {
  if (models.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/70 px-6 py-12 text-center">
        <p className="font-mono text-[10px] tracking-widest uppercase text-muted-foreground/70">
          No models in this category
        </p>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 stagger-children">
      {models.map((model) => (
        <ModelCard
          key={model.id}
          model={model}
          category={category}
          isDefault={model.id === defaultModel}
          onSetDefault={onSetDefault}
          savingDefault={savingDefault}
          showStatus={showStatus}
        />
      ))}
    </div>
  );
}

function ModelCard({
  model,
  category,
  isDefault,
  onSetDefault,
  savingDefault,
  showStatus,
}: {
  model: Model;
  category: CategoryKey;
  isDefault: boolean;
  onSetDefault: (id: string) => void;
  savingDefault: boolean;
  showStatus?: boolean;
}) {
  const router = useRouter();
  const cat = categoryMeta[category];
  const caps = model.capabilities;
  const ctx = caps?.context_window
    ? Math.round(caps.context_window / 1000)
    : null;
  const isRemoved = model.status === "removed" || model.status === "revoked";

  return (
    <div
      className={`relative overflow-hidden rounded-xl border bg-card/60 backdrop-blur-md transition-all duration-300 cursor-pointer ${
        isRemoved ? "opacity-50 border-destructive/30 bg-destructive/5" :
        isDefault ? `${cat.border} ${cat.bg}` : "border-border/70"
      } ${isRemoved ? "" : cat.glow}`}
      onClick={() => router.push(`/admin/models/${encodeURIComponent(model.id)}`)}
    >
      <div
        aria-hidden
        className={`absolute inset-x-0 top-0 h-px bg-linear-to-r ${isRemoved ? "from-destructive/30 via-destructive/60 to-destructive/30" : cat.line}`}
      />
      {isDefault && !isRemoved && (
        <div className="absolute top-3 right-3 flex items-center gap-1 px-1.5 py-0.5 rounded font-mono text-[9px] tracking-widest uppercase bg-copilot-green/15 text-copilot-green border border-copilot-green/30">
          <Check className="w-2.5 h-2.5" /> Default
        </div>
      )}
      {isRemoved && (
        <div className="absolute top-3 right-3 flex items-center gap-1 px-1.5 py-0.5 rounded font-mono text-[9px] tracking-widest uppercase bg-destructive/15 text-destructive border border-destructive/30">
          <Ban className="w-2.5 h-2.5" /> {model.status === "revoked" ? "Revoked" : "Removed"}
        </div>
      )}

      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-1.5">
          <div>
            <p className="text-sm font-semibold leading-tight">{model.name}</p>
            <p className="font-mono text-[10px] text-muted-foreground tracking-wider mt-0.5">
              {model.organization ?? model.vendor}
              {model.premium_multiplier != null && (
                <span className={`ml-2 ${model.premium_multiplier === 0 ? "text-copilot-green" : model.premium_multiplier >= 5 ? "text-yellow-400" : ""}`}>
                  {model.premium_multiplier === 0 ? "● Included" : `${model.premium_multiplier}× premium`}
                </span>
              )}
            </p>
          </div>
          {!isDefault && !isRemoved && (
            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-mono text-[9px] tracking-widest uppercase ${cat.text} ${cat.border} border ${cat.bg}`}>
              {cat.icon}
              {cat.label}
            </span>
          )}
        </div>

        {/* Description */}
        {model.description && (
          <p className="text-xs text-muted-foreground leading-relaxed mb-2">
            {model.description}
          </p>
        )}
        {model.best_for && (
          <p className="font-mono text-[10px] text-muted-foreground/70 tracking-wider mb-2">
            Best for: {model.best_for}
          </p>
        )}

        <div className="flex flex-wrap gap-1.5 mb-1">
          {model.preview && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-mono text-[9px] tracking-widest uppercase text-yellow-400 border border-yellow-500/30 bg-yellow-500/10">
              Preview
            </span>
          )}
          {!model.chat_enabled && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-mono text-[9px] tracking-widest uppercase text-orange-400 border border-orange-500/30 bg-orange-500/10">
              <AlertTriangle className="w-2.5 h-2.5" /> No Chat
            </span>
          )}
          {model.retirement_date && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-mono text-[9px] tracking-widest uppercase text-amber-400 border border-amber-500/30 bg-amber-500/10">
              <Clock className="w-2.5 h-2.5" /> Retiring {model.retirement_date}
            </span>
          )}
          {model.open_weight && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-mono text-[9px] tracking-widest uppercase text-blue-400 border border-blue-500/30 bg-blue-500/10">
              Open Weight
            </span>
          )}
        </div>

        {/* Provider API pricing — informational only, not Copilot pricing */}
        {(model.input_price_per_m != null || model.output_price_per_m != null) && (
          <p className="font-mono text-[10px] text-muted-foreground/50 tracking-wider mb-2" title="Provider API pricing (not Copilot). For reference only.">
            Provider API:
            {model.input_price_per_m != null && <span className="ml-1.5">${model.input_price_per_m}/M in</span>}
            {model.output_price_per_m != null && <span className="ml-1.5">${model.output_price_per_m}/M out</span>}
          </p>
        )}

        {/* Capability chips */}
        <div className="flex flex-wrap gap-1.5">
          {ctx !== null && (
            <CapChip>
              <span className="font-display font-bold text-sm leading-none">{ctx}</span>
              <span className="font-mono text-[10px] tracking-wider ml-0.5">k ctx</span>
            </CapChip>
          )}
          {caps?.max_output_tokens && (
            <CapChip>
              <span className="font-display font-bold text-sm leading-none">
                {(caps.max_output_tokens / 1000).toFixed(0)}
              </span>
              <span className="font-mono text-[10px] tracking-wider ml-0.5">k out</span>
            </CapChip>
          )}
          {caps?.supports?.vision && <CapChip>Vision</CapChip>}
          {caps?.supports?.tool_calls && <CapChip title="Copilot accepts tool/function calls on this model">Tools</CapChip>}
          {caps?.supports?.parallel_tool_calls && <CapChip title="Copilot can return multiple tool calls per turn">Parallel Tools</CapChip>}
          {caps?.supports?.structured_outputs && <CapChip>Structured</CapChip>}
          {caps?.supports?.streaming && <CapChip>Stream</CapChip>}
          {caps?.supports?.thinking && <CapChip title="Model exposes adaptive thinking / reasoning">Thinking</CapChip>}
        </div>

        {model.supported_endpoints && model.supported_endpoints.length > 0 && (
          <p className="font-mono text-[10px] text-muted-foreground/60 mt-3 tracking-wider">
            {model.supported_endpoints.join(" · ")}
          </p>
        )}

        <div className="rail-divider my-4" />

        <div className="flex items-center justify-between">
          <p className="font-mono text-[10px] text-muted-foreground/70 tracking-wider truncate">
            {model.id}
          </p>
          {isRemoved ? (
            model.removed_at && (
              <span className="font-mono text-[10px] tracking-widest uppercase text-destructive/70">
                {new Date(model.removed_at).toLocaleDateString()}
              </span>
            )
          ) : isDefault ? (
            <span className="font-mono text-[10px] tracking-widest uppercase text-copilot-green">
              ● Active
            </span>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2.5 font-mono text-[10px] tracking-widest uppercase text-muted-foreground hover:text-foreground"
              onClick={(e) => { e.stopPropagation(); onSetDefault(model.id); }}
              disabled={savingDefault}
            >
              {savingDefault ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                "Set Default"
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function CapChip({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md bg-secondary/60 border border-border/60 font-mono text-[10px] tracking-wider text-muted-foreground"
    >
      {children}
    </span>
  );
}

function SyncResultBadge({ result }: { result: SyncResult }) {
  const parts: string[] = [];
  if (result.added.length) parts.push(`+${result.added.length} added`);
  if (result.removed.length) parts.push(`-${result.removed.length} removed`);
  if (result.restored.length) parts.push(`↺${result.restored.length} restored`);
  if (result.changed.length) parts.push(`↻${result.changed.length} changed`);
  if (!parts.length) parts.push("No changes");

  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-copilot-green/10 border border-copilot-green/30 font-mono text-[10px] tracking-wider text-copilot-green">
      <Check className="w-3 h-3" />
      {parts.join(" · ")} · {result.total_upstream} upstream
    </span>
  );
}

function EventIcon({ event }: { event: string }) {
  switch (event) {
    case "added":
      return <span className="text-copilot-green font-mono text-xs">✚</span>;
    case "removed":
      return <Ban className="w-3 h-3 text-destructive" />;
    case "restored":
      return <RotateCcw className="w-3 h-3 text-copilot-green" />;
    case "capabilities_changed":
    case "endpoints_changed":
      return <RefreshCw className="w-3 h-3 text-yellow-400" />;
    default:
      return <Clock className="w-3 h-3 text-muted-foreground" />;
  }
}
