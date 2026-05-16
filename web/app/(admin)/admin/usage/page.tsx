"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  BarChart3,
  Loader2,
  Activity,
  Cpu,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { adminFetch } from "@/lib/admin-api";

type Window = "24h" | "7d" | "30d";

interface UsageSummary {
  window: Window;
  totals: {
    requests: number;
    successRequests: number;
    errorRequests: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    avgLatencyMs: number | null;
    p50LatencyMs: number | null;
    p99LatencyMs: number | null;
  };
  timeSeries: Array<{
    bucket: string;
    requests: number;
    promptTokens: number;
    completionTokens: number;
    errorCount: number;
  }>;
  byModel: Array<{
    model: string;
    requests: number;
    promptTokens: number;
    completionTokens: number;
    avgLatencyMs: number | null;
  }>;
}

const WINDOWS: Array<{ key: Window; label: string }> = [
  { key: "24h", label: "24h" },
  { key: "7d", label: "7d" },
  { key: "30d", label: "30d" },
];

function formatNum(n: number | null | undefined, fallback = "—"): string {
  if (n === null || n === undefined) return fallback;
  if (n < 1000) return Math.round(n).toString();
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

function formatMs(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatBucket(iso: string, window: Window): string {
  const d = new Date(iso);
  if (window === "24h") {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function UsagePage() {
  const [window, setWindow] = useState<Window>("24h");
  const [data, setData] = useState<UsageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (w: Window) => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminFetch(`/api/admin/usage?window=${w}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as UsageSummary;
      setData(json);
    } catch (err) {
      setError((err as Error).message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(window);
  }, [window, load]);

  const totals = data?.totals;
  const series = data?.timeSeries ?? [];
  const byModel = data?.byModel ?? [];

  const maxSeries = useMemo(() => {
    if (series.length === 0) return 0;
    return Math.max(...series.map((s) => s.requests));
  }, [series]);

  const maxModel = useMemo(() => {
    if (byModel.length === 0) return 0;
    return Math.max(...byModel.map((m) => m.requests));
  }, [byModel]);

  const errorRate =
    totals && totals.requests > 0
      ? (totals.errorRequests / totals.requests) * 100
      : 0;

  const isEmpty = !loading && !error && totals && totals.requests === 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-2">
        <p className="font-mono text-[10px] tracking-[0.22em] uppercase text-muted-foreground">
          admin / usage
        </p>
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-4xl font-display font-bold tracking-tight leading-none">
              Usage <span className="text-copilot-gradient">Telemetry</span>
            </h1>
            <p className="text-sm text-muted-foreground mt-2 max-w-md">
              Per-request log: model, prompt &amp; completion tokens, latency, success / error. Aggregated by window.
            </p>
          </div>

          {/* Window selector */}
          <div className="flex items-center gap-1 p-1 rounded-lg bg-card/60 backdrop-blur-md border border-border/70">
            {WINDOWS.map((w) => (
              <button
                key={w.key}
                type="button"
                onClick={() => setWindow(w.key)}
                className={`px-3 py-1.5 rounded-md font-mono text-[10px] tracking-widest uppercase transition-colors ${
                  w.key === window
                    ? "bg-copilot-purple/20 text-copilot-purple"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                }`}
              >
                {w.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Loading / Error / Empty / Content */}
      {loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/5 px-6 py-5 font-mono text-[11px] tracking-wide text-destructive">
          // Could not reach proxy &mdash; {error}
        </div>
      ) : isEmpty ? (
        <EmptyState />
      ) : totals ? (
        <>
          {/* Stat grid */}
          <section className="space-y-3">
            <p className="label-mono px-1">// Window Summary &middot; {window}</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 stagger-children">
              <StatCard
                label="Requests"
                accent="primary"
                icon={<Activity className="w-3.5 h-3.5" />}
                value={formatNum(totals.requests)}
                sub={`${totals.successRequests} ok · ${totals.errorRequests} err`}
              />
              <StatCard
                label="Tokens"
                accent="purple"
                icon={<TrendingUp className="w-3.5 h-3.5" />}
                value={formatNum(totals.totalTokens)}
                sub={`${formatNum(totals.promptTokens)} in · ${formatNum(totals.completionTokens)} out`}
              />
              <StatCard
                label="Latency p50"
                accent="accent"
                icon={<Cpu className="w-3.5 h-3.5" />}
                value={formatMs(totals.p50LatencyMs)}
                sub={`p99 ${formatMs(totals.p99LatencyMs)}`}
              />
              <StatCard
                label="Error Rate"
                accent={errorRate > 5 ? "destructive" : "green"}
                icon={
                  errorRate > 5 ? (
                    <AlertTriangle className="w-3.5 h-3.5" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  )
                }
                value={`${errorRate.toFixed(1)}%`}
                sub={errorRate > 5 ? "Above threshold" : "Healthy"}
              />
            </div>
          </section>

          {/* Time series */}
          <section className="space-y-3">
            <p className="label-mono px-1">// Requests Over Time</p>
            <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-card/60 backdrop-blur-md">
              <div
                aria-hidden
                className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-primary/40 to-transparent"
              />
              <div className="px-6 py-6">
                {series.length === 0 ? (
                  <p className="font-mono text-[11px] tracking-wider text-muted-foreground/70 text-center py-8 uppercase">
                    // No data yet for this window
                  </p>
                ) : (
                  <TimeSeriesChart series={series} max={maxSeries} window={window} />
                )}
              </div>
            </div>
          </section>

          {/* By model */}
          <section className="space-y-3">
            <p className="label-mono px-1">// Breakdown by Model</p>
            <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-card/60 backdrop-blur-md">
              <div
                aria-hidden
                className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-copilot-purple/40 to-transparent"
              />
              <div className="px-6 py-5">
                {byModel.length === 0 ? (
                  <p className="font-mono text-[11px] tracking-wider text-muted-foreground/70 text-center py-8 uppercase">
                    // No model data yet
                  </p>
                ) : (
                  <ModelBreakdown rows={byModel} max={maxModel} />
                )}
              </div>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

const accentClasses: Record<string, { icon: string; line: string; glow: string }> = {
  primary: {
    icon: "text-primary",
    line: "from-transparent via-primary/50 to-transparent",
    glow: "group-hover:shadow-[0_0_30px_-8px_hsl(225_73%_57%/0.5)]",
  },
  accent: {
    icon: "text-accent",
    line: "from-transparent via-accent/50 to-transparent",
    glow: "group-hover:shadow-[0_0_30px_-8px_hsl(187_86%_43%/0.5)]",
  },
  purple: {
    icon: "text-copilot-purple",
    line: "from-transparent via-copilot-purple/50 to-transparent",
    glow: "group-hover:shadow-[0_0_30px_-8px_hsl(258_90%_66%/0.5)]",
  },
  green: {
    icon: "text-copilot-green",
    line: "from-transparent via-copilot-green/50 to-transparent",
    glow: "group-hover:shadow-[0_0_30px_-8px_hsl(142_71%_45%/0.5)]",
  },
  destructive: {
    icon: "text-destructive",
    line: "from-transparent via-destructive/50 to-transparent",
    glow: "group-hover:shadow-[0_0_30px_-8px_hsl(0_72%_51%/0.5)]",
  },
};

function StatCard({
  label,
  icon,
  value,
  sub,
  accent,
}: {
  label: string;
  icon: React.ReactNode;
  value: string;
  sub: string;
  accent: keyof typeof accentClasses;
}) {
  const a = accentClasses[accent];
  return (
    <div
      className={`group relative overflow-hidden rounded-xl border border-border/70 bg-card/60 backdrop-blur-md transition-all duration-300 ${a.glow}`}
    >
      <div
        aria-hidden
        className={`absolute inset-x-0 top-0 h-px bg-linear-to-r ${a.line}`}
      />
      <div className="p-5">
        <div className="flex items-center justify-between mb-4">
          <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-muted-foreground">
            {label}
          </span>
          <span className={`${a.icon} opacity-80`}>{icon}</span>
        </div>
        <p className="font-display font-bold text-4xl leading-none">{value}</p>
        <p className="font-mono text-[10px] tracking-wider text-muted-foreground mt-2 uppercase">
          {sub}
        </p>
      </div>
    </div>
  );
}

function TimeSeriesChart({
  series,
  max,
  window,
}: {
  series: UsageSummary["timeSeries"];
  max: number;
  window: Window;
}) {
  // pick a labelling interval so the x-axis doesn't get crowded
  const labelEvery = series.length > 14 ? Math.ceil(series.length / 8) : 1;

  return (
    <div>
      <div className="flex items-end gap-1.5 h-48 relative">
        {/* horizontal grid lines */}
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-px bg-border/60" />
        <div aria-hidden className="absolute inset-x-0 bottom-1/4 h-px bg-border/30" />
        <div aria-hidden className="absolute inset-x-0 bottom-1/2 h-px bg-border/30" />
        <div aria-hidden className="absolute inset-x-0 bottom-3/4 h-px bg-border/30" />

        {series.map((s, i) => {
          const heightPct = max > 0 ? (s.requests / max) * 100 : 0;
          const errorPct =
            s.requests > 0 ? (s.errorCount / s.requests) * 100 : 0;
          return (
            <div
              key={s.bucket}
              className="group relative flex-1 flex flex-col justify-end items-center min-w-1.5"
            >
              {/* Tooltip on hover */}
              <div className="absolute bottom-full mb-2 hidden group-hover:flex flex-col items-center pointer-events-none z-10">
                <div className="rounded-md border border-border bg-popover/95 backdrop-blur-md px-2.5 py-1.5 whitespace-nowrap font-mono text-[10px] tracking-wider shadow-lg">
                  <p className="text-foreground">{s.requests} req</p>
                  <p className="text-muted-foreground">
                    {formatNum(s.promptTokens + s.completionTokens)} tok
                  </p>
                  {s.errorCount > 0 && (
                    <p className="text-destructive">{s.errorCount} err</p>
                  )}
                  <p className="text-muted-foreground/70 mt-0.5">{formatBucket(s.bucket, window)}</p>
                </div>
              </div>

              {/* Bar */}
              <div
                className="w-full relative bg-linear-to-t from-primary/40 via-primary/70 to-copilot-purple/80 rounded-t-sm group-hover:from-primary/60 group-hover:via-primary group-hover:to-copilot-purple transition-colors"
                style={{ height: `${heightPct}%`, minHeight: heightPct > 0 ? 2 : 0 }}
              >
                {/* Error segment on top */}
                {errorPct > 0 && (
                  <div
                    className="absolute inset-x-0 top-0 bg-destructive/80 rounded-t-sm"
                    style={{ height: `${errorPct}%` }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* X axis labels */}
      <div className="flex gap-1.5 mt-2 font-mono text-[9px] tracking-wider text-muted-foreground/70">
        {series.map((s, i) => (
          <div key={s.bucket} className="flex-1 text-center min-w-1.5">
            {i % labelEvery === 0 ? formatBucket(s.bucket, window) : ""}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-4 font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-1.5 rounded-sm bg-linear-to-r from-primary/60 to-copilot-purple" />
          <span>Requests</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-1.5 rounded-sm bg-destructive/80" />
          <span>Errors</span>
        </div>
      </div>
    </div>
  );
}

function ModelBreakdown({
  rows,
  max,
}: {
  rows: UsageSummary["byModel"];
  max: number;
}) {
  return (
    <div className="space-y-3">
      {rows.map((row, i) => {
        const widthPct = max > 0 ? (row.requests / max) * 100 : 0;
        const palette = [
          "from-primary/40 to-primary",
          "from-copilot-purple/40 to-copilot-purple",
          "from-accent/40 to-accent",
          "from-copilot-green/40 to-copilot-green",
          "from-yellow-500/40 to-yellow-400",
        ];
        const grad = palette[i % palette.length];
        return (
          <div key={row.model} className="group">
            <div className="flex items-center justify-between mb-1.5">
              <code className="font-mono text-[12px] text-foreground/90 tracking-wide">
                {row.model}
              </code>
              <div className="flex items-center gap-3 font-mono text-[10px] tracking-wider text-muted-foreground">
                <span>{formatNum(row.promptTokens + row.completionTokens)} tok</span>
                <span>{formatMs(row.avgLatencyMs)}</span>
                <span className="text-foreground font-medium">
                  {row.requests} req
                </span>
              </div>
            </div>
            <div className="h-2 rounded-full bg-muted/60 overflow-hidden relative">
              <div
                className={`h-full rounded-full transition-all duration-500 bg-linear-to-r ${grad}`}
                style={{ width: `${widthPct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-card/60 backdrop-blur-md">
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-primary/40 to-transparent"
      />
      <div aria-hidden className="absolute inset-0 flex items-end justify-center px-12 pb-12 pointer-events-none opacity-[0.07]">
        <div className="flex items-end gap-3 h-40 w-full max-w-2xl">
          {(
            [
              "h-[24%]",
              "h-[56%]",
              "h-[38%]",
              "h-[71%]",
              "h-[45%]",
              "h-[88%]",
              "h-[62%]",
              "h-[49%]",
              "h-[77%]",
              "h-[35%]",
              "h-[92%]",
              "h-[58%]",
              "h-[41%]",
              "h-[68%]",
              "h-[53%]",
            ] as const
          ).map((h, i) => (
            <div
              key={i}
              className={`flex-1 bg-linear-to-t from-primary/60 to-copilot-purple/60 rounded-t-sm ${h}`}
            />
          ))}
        </div>
      </div>

      <div className="relative px-6 py-24 flex flex-col items-center gap-6 text-center">
        <div className="relative flex items-center justify-center">
          <div aria-hidden className="absolute w-48 h-48 rounded-full border border-primary/15 animate-pulse" />
          <div aria-hidden className="absolute w-32 h-32 rounded-full border border-primary/25" />
          <div aria-hidden className="absolute w-20 h-20 rounded-full bg-primary/10 blur-2xl" />
          <div className="relative w-14 h-14 rounded-2xl bg-card border border-border flex items-center justify-center">
            <BarChart3 className="w-6 h-6 text-primary" strokeWidth={1.7} />
          </div>
        </div>

        <div className="space-y-2 max-w-sm">
          <h2 className="text-2xl font-display font-bold leading-tight">
            No <span className="text-copilot-gradient">telemetry</span> yet
          </h2>
          <p className="text-sm text-muted-foreground">
            Send a chat request and stats will start landing here &mdash; tokens, latency, model, and success / error rate.
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
