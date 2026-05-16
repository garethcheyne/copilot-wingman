"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  RefreshCcw,
  CheckCircle2,
  ArrowUpCircle,
  ExternalLink,
  Loader2,
  AlertTriangle,
  Package,
} from "lucide-react";
import { adminFetch } from "@/lib/admin-api";

interface VersionInfo {
  current: string;
  latest: {
    version: string;
    name: string;
    published_at: string;
    url: string;
    changelog: string;
  } | null;
  updateAvailable: boolean;
}

export default function SystemPage() {
  const [info, setInfo] = useState<VersionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [upgradeMessage, setUpgradeMessage] = useState<string | null>(null);

  const fetchVersion = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await adminFetch("/api/admin/version");
      if (!res.ok) throw new Error("Failed to fetch version info");
      const data = await res.json();
      setInfo(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVersion();
  }, [fetchVersion]);

  const handleUpgrade = async () => {
    if (!confirm("This will pull the latest version and restart the containers. The app will be briefly unavailable. Continue?")) {
      return;
    }
    try {
      setUpgrading(true);
      setUpgradeMessage(null);
      const res = await adminFetch("/api/admin/version/upgrade", { method: "POST" });
      const data = await res.json();
      if (data.status === "up-to-date") {
        setUpgradeMessage("Already running the latest version.");
      } else {
        setUpgradeMessage(`Upgrading from v${data.from} to v${data.to}. The app will restart shortly...`);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUpgrading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 space-y-4 max-w-2xl">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Package className="w-6 h-6 text-muted-foreground" />
          <h1 className="text-xl font-semibold">System</h1>
        </div>
        <Button variant="ghost" size="sm" onClick={fetchVersion} disabled={loading}>
          <RefreshCcw className="w-4 h-4 mr-1.5" />
          Refresh
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="w-4 h-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Current version */}
      {info && (
        <div className="rounded-lg border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Current Version</p>
              <p className="text-2xl font-mono font-semibold">v{info.current}</p>
            </div>
            {info.updateAvailable ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-500 border border-amber-500/20">
                <ArrowUpCircle className="w-3.5 h-3.5" />
                Update available
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Up to date
              </span>
            )}
          </div>

          {/* Latest release info */}
          {info.latest && info.updateAvailable && (
            <div className="border-t pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Latest Release</p>
                  <p className="text-lg font-mono font-medium">
                    v{info.latest.version}
                    {info.latest.name && (
                      <span className="text-sm text-muted-foreground ml-2 font-sans">
                        — {info.latest.name}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Released {new Date(info.latest.published_at).toLocaleDateString()}
                  </p>
                </div>
                <a
                  href={info.latest.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>

              {/* Changelog */}
              {info.latest.changelog && (
                <div className="bg-muted/50 rounded-md p-3 text-sm text-muted-foreground whitespace-pre-wrap max-h-48 overflow-y-auto scroll-sleek">
                  {info.latest.changelog}
                </div>
              )}

              {/* Upgrade button */}
              <Button
                onClick={handleUpgrade}
                disabled={upgrading}
                className="w-full"
              >
                {upgrading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Upgrading...
                  </>
                ) : (
                  <>
                    <ArrowUpCircle className="w-4 h-4 mr-2" />
                    Upgrade to v{info.latest.version}
                  </>
                )}
              </Button>
            </div>
          )}

          {/* No releases */}
          {!info.latest && (
            <p className="text-sm text-muted-foreground border-t pt-3">
              No releases published yet on GitHub.
            </p>
          )}
        </div>
      )}

      {/* Upgrade status message */}
      {upgradeMessage && (
        <Alert>
          <AlertDescription>{upgradeMessage}</AlertDescription>
        </Alert>
      )}

      {/* Build info */}
      {info && (
        <div className="rounded-lg border bg-card p-5 space-y-2">
          <p className="text-sm font-medium text-muted-foreground mb-2">Build Info</p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <span className="text-muted-foreground">Repository</span>
            <a
              href="https://github.com/garethcheyne/copilot-wingman"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground hover:underline inline-flex items-center gap-1"
            >
              copilot-wingman <ExternalLink className="w-3 h-3" />
            </a>
            <span className="text-muted-foreground">Runtime</span>
            <span>Node.js + Docker Compose</span>
            <span className="text-muted-foreground">Proxy</span>
            <span>Express 5 + TypeScript</span>
            <span className="text-muted-foreground">Frontend</span>
            <span>Next.js 16 + React 19</span>
          </div>
        </div>
      )}
    </div>
  );
}
