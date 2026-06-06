"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Link2,
  Zap,
  CheckCircle2,
  AlertCircle,
  Cpu,
  BarChart3,
  Infinity as InfinityIcon,
} from "lucide-react";
import { adminFetch } from "@/lib/admin-api";

interface AccountData {
  user: {
    login: string;
    name: string;
    avatar_url: string;
    email: string;
  } | null;
  copilot: {
    plan: string;
    chat_enabled: boolean;
    cli_enabled: boolean;
    mcp_enabled: boolean;
    quota_reset_date: string;
    quotas: {
      chat: QuotaSnapshot;
      completions: QuotaSnapshot;
      premium_interactions: QuotaSnapshot;
    };
    endpoints: Record<string, string>;
  } | null;
}

interface QuotaSnapshot {
  unlimited: boolean;
  quota_remaining: number;
  percent_remaining: number;
  overage_count: number;
  overage_permitted: boolean;
  entitlement: number;
}

interface ConnectionData {
  connected: boolean;
  connection?: {
    id: string;
    label: string;
    auth_method: string;
    status: string;
    github_username: string;
    last_validated_at: string;
  };
}

export default function AdminDashboard() {
  const [account, setAccount] = useState<AccountData | null>(null);
  const [connection, setConnection] = useState<ConnectionData | null>(null);
  const [modelCount, setModelCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [accRes, connRes, modelsRes] = await Promise.all([
          adminFetch("/api/admin/account"),
          adminFetch("/api/admin/connection"),
          adminFetch("/api/admin/models"),
        ]);
        if (accRes.ok) setAccount(await accRes.json());
        if (connRes.ok) setConnection(await connRes.json());
        if (modelsRes.ok) {
          const data = await modelsRes.json();
          setModelCount(data.data?.length ?? 0);
        }
      } catch {
        // proxy down
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const plan = account?.copilot?.plan;
  const quotas = account?.copilot?.quotas;
  const premiumQuota = quotas?.premium_interactions;
  const premiumUsed = premiumQuota
    ? premiumQuota.entitlement - premiumQuota.quota_remaining
    : null;

  return (
    <div className="space-y-10">
      {/* Hero band */}
      <section className="relative overflow-hidden rounded-2xl border border-border/70 bg-card/50 backdrop-blur-md">
        <div aria-hidden className="absolute inset-0 bg-mesh-copilot opacity-80 pointer-events-none" />
        <div aria-hidden className="absolute inset-0 bg-grain pointer-events-none opacity-50" />
        <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-primary/40 to-transparent" />

        <div className="relative px-8 py-9 flex items-start justify-between gap-6 flex-wrap">
          <div className="space-y-3 max-w-xl">
            <div className="flex items-center gap-2">
              <span className="pulse-ring text-copilot-green">
                <span className="bg-copilot-green" />
              </span>
              <p className="font-mono text-[10px] tracking-[0.22em] uppercase text-foreground/80">
                Mission Control · Live
              </p>
            </div>
            <h1 className="text-5xl font-display font-bold tracking-tight leading-[1.05]">
              Mission <span className="text-copilot-gradient font-display font-bold">Control</span>
            </h1>
            <p className="text-sm text-muted-foreground max-w-md">
              Monitor connection health, quota burn, and model availability for your Wingman proxy.
            </p>
          </div>

          {account?.user ? (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-border/70 bg-background/70 backdrop-blur-md">
              <Avatar className="h-10 w-10 ring-1 ring-copilot-purple/40">
                <AvatarImage src={account.user.avatar_url} alt={account.user.login ? `@${account.user.login}` : account.user.name ?? "Account avatar"} />
                <AvatarFallback>{account.user.name?.[0] ?? "?"}</AvatarFallback>
              </Avatar>
              <div className="text-right">
                <p className="text-sm font-medium leading-tight">{account.user.name}</p>
                <p className="font-mono text-[10px] tracking-wider text-muted-foreground">
                  @{account.user.login}
                </p>
              </div>
            </div>
          ) : (
            <div className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase px-3 py-2 rounded-md border border-dashed border-border">
              No operator signed in
            </div>
          )}
        </div>
      </section>

      {/* Stat grid */}
      <section className="space-y-3">
        <p className="label-mono px-1">// Telemetry</p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 stagger-children">
          {/* Connection */}
          <StatCard
            label="Connection"
            icon={<Link2 className="w-3.5 h-3.5" />}
            accent="primary"
          >
            {loading ? (
              <Skeleton className="h-10 w-24" />
            ) : connection?.connected ? (
              <>
                <p className="font-display font-bold text-4xl leading-none text-copilot-green">
                  Online
                </p>
                <p className="font-mono text-[10px] tracking-wider text-muted-foreground mt-2 uppercase">
                  {connection.connection?.auth_method === "oauth" ? "OAuth" : "PAT"} · @{connection.connection?.github_username}
                </p>
              </>
            ) : (
              <>
                <p className="font-display font-bold text-4xl leading-none text-yellow-400">
                  Offline
                </p>
                <p className="font-mono text-[10px] tracking-wider text-muted-foreground mt-2 uppercase">
                  Add a connection to begin
                </p>
              </>
            )}
          </StatCard>

          {/* Plan */}
          <StatCard
            label="Plan"
            icon={<Zap className="w-3.5 h-3.5" />}
            accent="accent"
          >
            {loading ? (
              <Skeleton className="h-10 w-24" />
            ) : plan ? (
              <>
                <p className="font-display font-bold text-4xl leading-none capitalize">
                  {plan}
                </p>
                <p className="font-mono text-[10px] tracking-wider text-muted-foreground mt-2 uppercase">
                  Resets {account?.copilot?.quota_reset_date}
                </p>
              </>
            ) : (
              <p className="font-display font-bold text-4xl leading-none text-muted-foreground/70">
                Unknown
              </p>
            )}
          </StatCard>

          {/* Models */}
          <StatCard
            label="Models"
            icon={<Cpu className="w-3.5 h-3.5" />}
            accent="purple"
          >
            {loading ? (
              <Skeleton className="h-10 w-12" />
            ) : (
              <>
                <p className="font-display font-bold text-4xl leading-none">
                  {modelCount ?? 0}
                </p>
                <p className="font-mono text-[10px] tracking-wider text-muted-foreground mt-2 uppercase">
                  Chat · Code · Embeddings
                </p>
              </>
            )}
          </StatCard>

          {/* Premium */}
          <StatCard
            label="Premium Used"
            icon={<BarChart3 className="w-3.5 h-3.5" />}
            accent="green"
          >
            {loading ? (
              <Skeleton className="h-10 w-24" />
            ) : premiumQuota ? (
              <>
                <p className="font-display font-bold text-4xl leading-none">
                  {premiumUsed}
                  <span className="font-mono text-base text-muted-foreground tracking-wider ml-1">
                    / {premiumQuota.entitlement}
                  </span>
                </p>
                <p className="font-mono text-[10px] tracking-wider text-muted-foreground mt-2 uppercase">
                  {premiumQuota.overage_permitted ? "Overage allowed" : "Hard limit"}
                </p>
              </>
            ) : (
              <p className="font-display font-bold text-4xl leading-none text-muted-foreground/70">
                —
              </p>
            )}
          </StatCard>
        </div>
      </section>

      {/* Quotas */}
      {quotas && (
        <section className="space-y-3">
          <p className="label-mono px-1">// Quota Usage</p>
          <Card className="bg-card/60 backdrop-blur-md border-border/70">
            <CardContent className="pt-6 pb-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <QuotaBar label="Chat" quota={quotas.chat} accent="primary" />
                <QuotaBar label="Completions" quota={quotas.completions} accent="accent" />
                <QuotaBar label="Premium" quota={quotas.premium_interactions} accent="purple" />
              </div>
            </CardContent>
          </Card>
        </section>
      )}

      {/* Features */}
      {account?.copilot && (
        <section className="space-y-3">
          <p className="label-mono px-1">// Feature Matrix</p>
          <Card className="bg-card/60 backdrop-blur-md border-border/70">
            <CardContent className="py-5">
              <div className="flex flex-wrap gap-2">
                <FeaturePill label="Chat" enabled={account.copilot.chat_enabled} />
                <FeaturePill label="CLI" enabled={account.copilot.cli_enabled} />
                <FeaturePill label="MCP" enabled={account.copilot.mcp_enabled} />
              </div>
            </CardContent>
          </Card>
        </section>
      )}
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
};

function StatCard({
  label,
  icon,
  accent,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  accent: keyof typeof accentClasses;
  children: React.ReactNode;
}) {
  const a = accentClasses[accent];
  return (
    <div className={`group relative overflow-hidden rounded-xl border border-border/70 bg-card/60 backdrop-blur-md transition-all duration-300 ${a.glow}`}>
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
        {children}
      </div>
    </div>
  );
}

function QuotaBar({
  label,
  quota,
  accent,
}: {
  label: string;
  quota: QuotaSnapshot;
  // Only these three bar colors are actually rendered below.
  accent: "primary" | "accent" | "purple";
}) {
  if (quota.unlimited) {
    return (
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-foreground/90">
            {label}
          </span>
          <span className="font-mono text-[10px] text-copilot-green flex items-center gap-1 tracking-wider">
            <InfinityIcon className="w-3 h-3" /> Unlimited
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-muted/60 overflow-hidden">
          <div className="h-full w-full bg-linear-to-r from-copilot-green/40 via-copilot-green/70 to-copilot-green/40 rounded-full" />
        </div>
      </div>
    );
  }

  const used = quota.entitlement - quota.quota_remaining;
  const pct = quota.entitlement > 0 ? Math.min((used / quota.entitlement) * 100, 100) : 0;
  const isOver = quota.quota_remaining < 0;
  const barColor = isOver
    ? "bg-linear-to-r from-orange-500/60 to-orange-500"
    : accent === "primary"
    ? "bg-linear-to-r from-primary/60 to-primary"
    : accent === "accent"
    ? "bg-linear-to-r from-accent/60 to-accent"
    : "bg-linear-to-r from-copilot-purple/60 to-copilot-purple";

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-foreground/90">
          {label}
        </span>
        <span className="font-mono text-[10px] text-muted-foreground tracking-wider">
          {used} / {quota.entitlement}
          {isOver && (
            <span className="text-orange-400 ml-1.5">
              +{Math.abs(quota.quota_remaining)} over
            </span>
          )}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-muted/60 overflow-hidden relative">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="font-display font-bold text-2xl leading-none mt-3">
        {Math.round(pct)}
        <span className="font-mono text-xs text-muted-foreground ml-0.5">%</span>
      </p>
    </div>
  );
}

function FeaturePill({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${
        enabled
          ? "border-copilot-green/40 bg-copilot-green/10 text-copilot-green"
          : "border-border bg-muted/40 text-muted-foreground"
      }`}
    >
      {enabled ? (
        <span className="relative inline-flex w-1.5 h-1.5">
          <span className="absolute inset-0 rounded-full bg-copilot-green" />
          <span className="absolute inset-0 rounded-full bg-copilot-green animate-ping opacity-60" />
        </span>
      ) : (
        <AlertCircle className="w-3 h-3" />
      )}
      <span className="font-mono tracking-wider uppercase text-[10px]">{label}</span>
      {enabled && <CheckCircle2 className="w-3 h-3 opacity-70" />}
    </span>
  );
}
