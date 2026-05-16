"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  Sparkles,
  Zap,
  Feather,
  Cpu,
  Check,
  Ban,
  AlertTriangle,
  Clock,
  ExternalLink,
  Activity,
  BarChart3,
  Globe,
  Brain,
  Layers,
  Calendar,
} from "lucide-react";
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
      vision?: boolean;
      structured_outputs?: boolean;
      thinking?: boolean;
    };
  } | null;
}

interface LlmStatsData {
  id: string;
  name: string;
  description: string;
  organization: { id: string; name: string };
  family: { id: string; name: string } | null;
  license: { id: string; name: string; allow_commercial: boolean } | null;
  open_weight: boolean;
  model_type: string;
  modalities: string[];
  context_window: number | null;
  param_count: number | null;
  release_date: string | null;
  providers: Array<{
    provider_id: string;
    provider_name: string;
    input_price_per_m: number | null;
    output_price_per_m: number | null;
    status: string;
  }>;
  top_scores: Record<string, number>;
  scores: Array<{
    benchmark_id: string;
    benchmark_name: string;
    category: string | null;
    description: string | null;
    score: number;
    normalized_score: number | null;
    max_score: number;
    is_self_reported: boolean;
    verified_by_llmstats: boolean;
    rank: number | null;
    source_url: string | null;
    scored_at: string;
  }>;
  sources: {
    api_ref: string | null;
    paper: string | null;
    weights: string | null;
    repo: string | null;
  };
  url: string;
  created_at: string;
  updated_at: string;
}

interface SyncEvent {
  id: string;
  model_id: string;
  event: string;
  old_value: any;
  new_value: any;
  created_at: string;
}

const categoryColors: Record<string, { text: string; border: string; bg: string; label: string }> = {
  powerful: { text: "text-copilot-purple", border: "border-copilot-purple/40", bg: "bg-copilot-purple/10", label: "Powerful" },
  versatile: { text: "text-primary", border: "border-primary/40", bg: "bg-primary/10", label: "Versatile" },
  lightweight: { text: "text-copilot-green", border: "border-copilot-green/40", bg: "bg-copilot-green/10", label: "Lightweight" },
};

export default function ModelDetailPage() {
  const params = useParams();
  const router = useRouter();
  const modelId = decodeURIComponent(params.id as string);

  const [model, setModel] = useState<Model | null>(null);
  const [llmStats, setLlmStats] = useState<LlmStatsData | null>(null);
  const [events, setEvents] = useState<SyncEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await adminFetch(`/api/admin/models/${encodeURIComponent(modelId)}`);
      if (!res.ok) {
        setError(res.status === 404 ? "Model not found" : "Failed to load model");
        return;
      }
      const data = await res.json();
      setModel(data.model);
      setLlmStats(data.llm_stats);
      setEvents(data.events ?? []);
    } catch {
      setError("Cannot reach proxy");
    } finally {
      setLoading(false);
    }
  }, [modelId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="space-y-8">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  if (error || !model) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" onClick={() => router.back()} className="gap-2">
          <ArrowLeft className="w-4 h-4" /> Back
        </Button>
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-8 py-16 text-center">
          <p className="text-destructive text-lg font-medium">{error || "Model not found"}</p>
        </div>
      </div>
    );
  }

  const cat = model.category ? categoryColors[model.category] : null;
  const caps = model.capabilities;
  const isRemoved = model.status !== "active";

  // Merge context window — prefer upstream capabilities, fallback to LLM Stats
  const contextWindow = caps?.context_window ?? llmStats?.context_window;
  const maxOutput = caps?.max_output_tokens;

  return (
    <div className="space-y-8">
      {/* Back + Breadcrumb */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.back()} className="gap-2 h-8">
          <ArrowLeft className="w-4 h-4" /> Back
        </Button>
        <span className="font-mono text-[10px] tracking-[0.22em] uppercase text-muted-foreground">
          admin / models / {model.id}
        </span>
      </div>

      {/* Header Card */}
      <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-card/60 backdrop-blur-md">
        <div
          aria-hidden
          className={`absolute inset-x-0 top-0 h-px bg-linear-to-r ${
            isRemoved
              ? "from-transparent via-destructive/60 to-transparent"
              : cat
              ? `from-transparent via-${cat.text.replace("text-", "")}/60 to-transparent`
              : "from-transparent via-primary/40 to-transparent"
          }`}
        />
        <div className="px-8 py-8">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-3xl font-display font-bold tracking-tight">
                  {model.name}
                </h1>
                {cat && (
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-mono text-[10px] tracking-widest uppercase ${cat.text} ${cat.border} border ${cat.bg}`}>
                    {model.category === "powerful" && <Sparkles className="w-3 h-3" />}
                    {model.category === "versatile" && <Zap className="w-3 h-3" />}
                    {model.category === "lightweight" && <Feather className="w-3 h-3" />}
                    {cat.label}
                  </span>
                )}
                {isRemoved && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-mono text-[10px] tracking-widest uppercase bg-destructive/15 text-destructive border border-destructive/30">
                    <Ban className="w-3 h-3" /> {model.status}
                  </span>
                )}
              </div>
              <p className="font-mono text-sm text-muted-foreground tracking-wider">
                {model.id}
              </p>
              <p className="font-mono text-[11px] text-muted-foreground/70 tracking-wider mt-1">
                {model.vendor} · v{model.version}
                {model.preview && " · Preview"}
              </p>
            </div>
            <div className="font-mono text-[10px] tracking-wider text-muted-foreground/60 text-right space-y-0.5">
              <p>First seen: {new Date(model.first_seen_at).toLocaleDateString()}</p>
              <p>Last seen: {new Date(model.last_seen_at).toLocaleDateString()}</p>
              {model.removed_at && (
                <p className="text-destructive">Removed: {new Date(model.removed_at).toLocaleDateString()}</p>
              )}
            </div>
          </div>

          {/* Description */}
          {(model.description || llmStats?.description) && (
            <p className="text-sm text-muted-foreground leading-relaxed mt-4 max-w-2xl">
              {model.description || llmStats?.description}
            </p>
          )}
          {model.best_for && (
            <p className="font-mono text-[11px] text-muted-foreground/70 tracking-wider mt-2">
              Best for: {model.best_for}
            </p>
          )}

          {/* Status badges */}
          <div className="flex flex-wrap gap-2 mt-4">
            {model.premium_multiplier != null && (
              <Badge
                color={model.premium_multiplier === 0 ? "green" : model.premium_multiplier >= 5 ? "yellow" : "default"}
                label={model.premium_multiplier === 0 ? "Included" : `${model.premium_multiplier}× Premium`}
              />
            )}
            {model.retirement_date && (
              <Badge color="amber" label={`Retiring ${model.retirement_date}`} icon={<Clock className="w-3 h-3" />} />
            )}
            {!model.chat_enabled && (
              <Badge color="orange" label="No Chat" icon={<AlertTriangle className="w-3 h-3" />} />
            )}
            {model.preview && <Badge color="yellow" label="Preview" />}
            {llmStats?.open_weight && <Badge color="blue" label="Open Weight" />}
            {llmStats?.license && (
              <Badge
                color={llmStats.license.allow_commercial ? "green" : "default"}
                label={llmStats.license.name}
              />
            )}
          </div>
        </div>
      </div>

      {/* Organization & Pricing Row */}
      {llmStats && (llmStats.organization || (llmStats.providers && llmStats.providers.length > 0)) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Organization */}
          {llmStats.organization && (
            <div className="rounded-xl border border-border/70 bg-card/60 backdrop-blur-md px-5 py-4">
              <p className="font-mono text-[10px] tracking-widest uppercase text-muted-foreground/60 mb-2">Organization</p>
              <p className="text-lg font-display font-bold">{llmStats.organization.name}</p>
              {llmStats.family && (
                <p className="font-mono text-[11px] text-muted-foreground/70 mt-1">Family: {llmStats.family.name}</p>
              )}
            </div>
          )}

          {/* Provider API Pricing (informational — not what Copilot charges) */}
          {llmStats.providers && llmStats.providers.length > 0 && (
            <div className="rounded-xl border border-border/70 bg-card/60 backdrop-blur-md px-5 py-4">
              <p className="font-mono text-[10px] tracking-widest uppercase text-muted-foreground/60 mb-1">Provider API Pricing</p>
              <p className="font-mono text-[9px] text-muted-foreground/40 mb-3">Indicative only — not what Copilot charges. Copilot uses premium multipliers.</p>
              <div className="space-y-2">
                {llmStats.providers.map((p) => (
                  <div key={p.provider_id} className="flex items-center justify-between gap-4">
                    <span className="font-mono text-sm text-muted-foreground">{p.provider_name}</span>
                    <div className="flex items-center gap-3">
                      {p.input_price_per_m != null && (
                        <span className="font-mono text-sm">
                          <span className="text-copilot-green font-semibold">${p.input_price_per_m}</span>
                          <span className="text-muted-foreground/50 text-[10px]"> /M in</span>
                        </span>
                      )}
                      {p.output_price_per_m != null && (
                        <span className="font-mono text-sm">
                          <span className="text-copilot-purple font-semibold">${p.output_price_per_m}</span>
                          <span className="text-muted-foreground/50 text-[10px]"> /M out</span>
                        </span>
                      )}
                      <span className={`font-mono text-[9px] tracking-wider uppercase px-1.5 py-0.5 rounded ${p.status === 'active' ? 'text-copilot-green bg-copilot-green/10' : 'text-muted-foreground bg-secondary/60'}`}>
                        {p.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Capabilities Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Context & Output */}
        <StatCard
          icon={<Layers className="w-4 h-4" />}
          label="Context Window"
          value={contextWindow ? `${(contextWindow / 1000).toFixed(0)}k tokens` : "—"}
        />
        <StatCard
          icon={<Layers className="w-4 h-4" />}
          label="Max Output"
          value={maxOutput ? `${(maxOutput / 1000).toFixed(0)}k tokens` : "—"}
        />
        {llmStats?.param_count && (
          <StatCard
            icon={<Brain className="w-4 h-4" />}
            label="Parameters"
            value={formatParamCount(llmStats.param_count)}
          />
        )}
        {llmStats?.release_date && (
          <StatCard
            icon={<Calendar className="w-4 h-4" />}
            label="Released"
            value={new Date(llmStats.release_date).toLocaleDateString()}
          />
        )}
        {llmStats?.model_type && (
          <StatCard
            icon={<Cpu className="w-4 h-4" />}
            label="Model Type"
            value={llmStats.model_type}
          />
        )}
        {llmStats?.modalities && llmStats.modalities.length > 0 && (
          <StatCard
            icon={<Globe className="w-4 h-4" />}
            label="Modalities"
            value={llmStats.modalities.join(", ")}
          />
        )}
      </div>

      {/* Supported Features */}
      {caps?.supports && (
        <section className="space-y-3">
          <p className="label-mono">// Capabilities</p>
          <div className="flex flex-wrap gap-2">
            <FeatureChip label="Streaming" enabled={caps.supports.streaming} />
            <FeatureChip label="Tool Calls" enabled={caps.supports.tool_calls} />
            <FeatureChip label="Vision" enabled={caps.supports.vision} />
            <FeatureChip label="Structured Output" enabled={caps.supports.structured_outputs} />
            <FeatureChip label="Thinking" enabled={caps.supports.thinking} />
          </div>
        </section>
      )}

      {/* Endpoints */}
      {model.supported_endpoints && model.supported_endpoints.length > 0 && (
        <section className="space-y-3">
          <p className="label-mono">// Endpoints</p>
          <div className="flex flex-wrap gap-2">
            {model.supported_endpoints.map((ep) => (
              <span
                key={ep}
                className="inline-flex items-center px-3 py-1.5 rounded-lg bg-secondary/60 border border-border/60 font-mono text-[11px] tracking-wider text-muted-foreground"
              >
                {ep}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Benchmark Scores — from LLM Stats */}
      {llmStats?.scores && llmStats.scores.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <p className="label-mono">// Benchmark Scores</p>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-mono text-[9px] tracking-wider uppercase text-copilot-purple bg-copilot-purple/10 border border-copilot-purple/30">
              <Activity className="w-2.5 h-2.5" /> LLM Stats
            </span>
          </div>

          {/* Category Bar Chart Summary */}
          <div className="rounded-2xl border border-border/70 bg-card/60 backdrop-blur-md p-5">
            <p className="font-mono text-[10px] tracking-widest uppercase text-muted-foreground/60 mb-4">Score by Category</p>
            <div className="space-y-2">
              {(() => {
                // Group normalized scores by category and average them
                const catScores = new Map<string, { total: number; count: number; bestRank: number | null }>();
                for (const s of llmStats.scores) {
                  const cat = s.category ?? "other";
                  const ns = s.normalized_score ?? (s.max_score > 0 && s.max_score <= 1 ? s.score : null);
                  if (ns == null) continue;
                  const existing = catScores.get(cat) ?? { total: 0, count: 0, bestRank: null };
                  existing.total += ns;
                  existing.count += 1;
                  if (s.rank != null && (existing.bestRank == null || s.rank < existing.bestRank)) {
                    existing.bestRank = s.rank;
                  }
                  catScores.set(cat, existing);
                }
                const sorted = [...catScores.entries()]
                  .map(([cat, { total, count, bestRank }]) => ({ cat, avg: total / count, bestRank }))
                  .sort((a, b) => b.avg - a.avg);

                return sorted.map(({ cat, avg, bestRank }) => (
                  <div key={cat} className="flex items-center gap-3">
                    <span className="font-mono text-[11px] tracking-wider text-muted-foreground w-28 truncate capitalize">{cat.replace(/_/g, " ")}</span>
                    <div className="flex-1 h-5 rounded-md bg-secondary/60 overflow-hidden relative">
                      <div
                        className="h-full rounded-md bg-linear-to-r from-copilot-purple/60 to-copilot-purple/90 transition-all duration-500"
                        style={{ width: `${Math.min(avg * 100, 100)}%` }}
                      />
                    </div>
                    <span className="font-mono text-sm font-semibold tabular-nums w-14 text-right">{(avg * 100).toFixed(1)}%</span>
                    {bestRank != null && (
                      <span className={`font-mono text-[10px] w-8 text-right ${bestRank <= 3 ? "text-copilot-green font-bold" : bestRank <= 10 ? "text-primary" : "text-muted-foreground/50"}`}>
                        #{bestRank}
                      </span>
                    )}
                  </div>
                ));
              })()}
            </div>
          </div>
          {/* Detailed Benchmark Table */}
          <p className="font-mono text-[10px] tracking-widest uppercase text-muted-foreground/60 mt-2">Detailed Results</p>
          <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-card/60 backdrop-blur-md">
            <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-copilot-purple/40 to-transparent" />
            <div className="divide-y divide-border/50">
              {/* Header */}
              <div className="grid grid-cols-12 gap-2 px-5 py-3 font-mono text-[10px] tracking-widest uppercase text-muted-foreground/60">
                <div className="col-span-4">Benchmark</div>
                <div className="col-span-2">Category</div>
                <div className="col-span-2 text-right">Score</div>
                <div className="col-span-2 text-right">Max</div>
                <div className="col-span-1 text-center">Rank</div>
                <div className="col-span-1 text-center">Verified</div>
              </div>

              {llmStats.scores
                .sort((a, b) => (a.category ?? "").localeCompare(b.category ?? ""))
                .map((score) => {
                  const pct = score.max_score > 0 ? (score.score / score.max_score) * 100 : 0;
                  return (
                    <div key={score.benchmark_id} className="grid grid-cols-12 gap-2 px-5 py-2.5 items-center group hover:bg-secondary/30 transition-colors">
                      <div className="col-span-4">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-medium truncate">{score.benchmark_name}</p>
                          {score.source_url && (
                            <a href={score.source_url} target="_blank" rel="noopener noreferrer" title="View source" className="text-muted-foreground/40 hover:text-copilot-purple transition-colors shrink-0">
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                        {score.description && (
                          <p className="text-[10px] text-muted-foreground/50 leading-tight mt-0.5 line-clamp-2 group-hover:line-clamp-none transition-all">
                            {score.description}
                          </p>
                        )}
                      </div>
                      <div className="col-span-2">
                        <span className="font-mono text-[10px] tracking-wider text-muted-foreground">
                          {score.category ?? "—"}
                        </span>
                      </div>
                      <div className="col-span-2 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 h-1.5 rounded-full bg-secondary/80 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-copilot-purple/70"
                              style={{ width: `${Math.min(pct, 100)}%` }}
                            />
                          </div>
                          <span className="font-mono text-sm font-semibold tabular-nums">
                            {score.score.toFixed(1)}
                          </span>
                        </div>
                      </div>
                      <div className="col-span-2 text-right font-mono text-[11px] text-muted-foreground/60">
                        {score.max_score}
                      </div>
                      <div className="col-span-1 text-center">
                        {score.rank != null ? (
                          <span className={`font-mono text-sm font-bold ${score.rank <= 3 ? "text-copilot-green" : score.rank <= 10 ? "text-primary" : "text-muted-foreground"}`}>
                            #{score.rank}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/40">—</span>
                        )}
                      </div>
                      <div className="col-span-1 text-center">
                        {score.verified_by_llmstats ? (
                          <Check className="w-3.5 h-3.5 text-copilot-green mx-auto" />
                        ) : (
                          <span className="font-mono text-[9px] text-muted-foreground/40">self</span>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* LLM Stats attribution */}
          {llmStats.url && (
            <p className="font-mono text-[10px] text-muted-foreground/50 tracking-wider">
              Data from{" "}
              <a href={llmStats.url} target="_blank" rel="noopener noreferrer" className="text-copilot-purple hover:underline inline-flex items-center gap-0.5">
                llm-stats.com <ExternalLink className="w-2.5 h-2.5" />
              </a>
              {" · "}Updated {new Date(llmStats.updated_at).toLocaleDateString()}
            </p>
          )}
        </section>
      )}

      {/* Top Scores Summary (when no detailed scores available) */}
      {llmStats && (!llmStats.scores || llmStats.scores.length === 0) && llmStats.top_scores && Object.keys(llmStats.top_scores).length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <p className="label-mono">// Top Scores</p>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-mono text-[9px] tracking-wider uppercase text-copilot-purple bg-copilot-purple/10 border border-copilot-purple/30">
              <Activity className="w-2.5 h-2.5" /> LLM Stats
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {Object.entries(llmStats.top_scores).map(([benchmark, score]) => (
              <div key={benchmark} className="rounded-xl border border-border/70 bg-card/60 backdrop-blur-md px-4 py-3">
                <p className="font-mono text-[10px] tracking-wider text-muted-foreground/60 uppercase truncate">
                  {benchmark.replace(/_/g, " ")}
                </p>
                <p className="text-xl font-display font-bold mt-1">{score.toFixed(1)}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Sources */}
      {llmStats?.sources && (
        <section className="space-y-3">
          <p className="label-mono">// Sources</p>
          <div className="flex flex-wrap gap-3">
            {llmStats.sources.paper && (
              <SourceLink label="Paper" href={llmStats.sources.paper} />
            )}
            {llmStats.sources.api_ref && (
              <SourceLink label="API Reference" href={llmStats.sources.api_ref} />
            )}
            {llmStats.sources.weights && (
              <SourceLink label="Model Weights" href={llmStats.sources.weights} />
            )}
            {llmStats.sources.repo && (
              <SourceLink label="Repository" href={llmStats.sources.repo} />
            )}
          </div>
        </section>
      )}

      {/* Sync History */}
      {events.length > 0 && (
        <section className="space-y-3">
          <p className="label-mono">// Change History</p>
          <div className="rounded-xl border border-border/70 bg-card/60 backdrop-blur-md overflow-hidden">
            <div className="divide-y divide-border/50">
              {events.map((e) => (
                <div key={e.id} className="flex items-center gap-3 px-4 py-2.5">
                  <EventDot event={e.event} />
                  <span className="font-mono text-[11px] tracking-wider text-muted-foreground">
                    {e.event.replace(/_/g, " ")}
                  </span>
                  <span className="ml-auto font-mono text-[10px] text-muted-foreground/50">
                    {new Date(e.created_at).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

// ─── Helper Components ──────────────────────────────

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-card/60 backdrop-blur-md px-5 py-4">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-muted-foreground/60">{icon}</span>
        <p className="font-mono text-[10px] tracking-widest uppercase text-muted-foreground/60">{label}</p>
      </div>
      <p className="text-lg font-display font-bold">{value}</p>
    </div>
  );
}

function Badge({
  label,
  color,
  icon,
}: {
  label: string;
  color: "green" | "yellow" | "amber" | "orange" | "blue" | "default";
  icon?: React.ReactNode;
}) {
  const colors: Record<string, string> = {
    green: "text-copilot-green border-copilot-green/30 bg-copilot-green/10",
    yellow: "text-yellow-400 border-yellow-500/30 bg-yellow-500/10",
    amber: "text-amber-400 border-amber-500/30 bg-amber-500/10",
    orange: "text-orange-400 border-orange-500/30 bg-orange-500/10",
    blue: "text-blue-400 border-blue-500/30 bg-blue-500/10",
    default: "text-muted-foreground border-border/50 bg-secondary/60",
  };

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-mono text-[10px] tracking-widest uppercase border ${colors[color]}`}>
      {icon}
      {label}
    </span>
  );
}

function FeatureChip({ label, enabled }: { label: string; enabled?: boolean }) {
  if (!enabled) return null;
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-copilot-green/8 border border-copilot-green/30 font-mono text-[11px] tracking-wider text-copilot-green">
      <Check className="w-3 h-3" />
      {label}
    </span>
  );
}

function SourceLink({ label, href }: { label: string; href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border/70 bg-card/60 font-mono text-[11px] tracking-wider text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
    >
      <ExternalLink className="w-3 h-3" />
      {label}
    </a>
  );
}

function EventDot({ event }: { event: string }) {
  const color =
    event === "added" ? "bg-copilot-green" :
    event === "removed" ? "bg-destructive" :
    event === "restored" ? "bg-copilot-green" :
    "bg-yellow-400";
  return <span className={`w-2 h-2 rounded-full ${color}`} />;
}

function formatParamCount(params: number): string {
  if (params >= 1e12) return `${(params / 1e12).toFixed(1)}T`;
  if (params >= 1e9) return `${(params / 1e9).toFixed(1)}B`;
  if (params >= 1e6) return `${(params / 1e6).toFixed(0)}M`;
  return params.toLocaleString();
}
