"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  CardAction,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  Key,
  Plus,
  Trash2,
  Copy,
  Check,
  Loader2,
  Shield,
  Clock,
  Activity,
  AlertTriangle,
  CalendarIcon,
  Pencil,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { adminFetch } from "@/lib/admin-api";

interface AvailableModel {
  id: string;
  name: string;
  vendor: string;
  category?: string;
}

interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  defaultModel: string | null;
  rateLimit: number;
  expiresAt: string | null;
  lastUsedAt: string | null;
  requestCount: number;
  isActive: boolean;
  createdAt: string;
}

function formatRelative(iso: string | null): string {
  if (!iso) return "Never";
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

function formatNumber(n: number): string {
  if (n < 1000) return n.toString();
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // Available models for scope selection
  const [availableModels, setAvailableModels] = useState<AvailableModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);

  // New key form
  const [newName, setNewName] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<string[]>([]);
  const [newDefaultModel, setNewDefaultModel] = useState<string | null>(null);
  const [newRateLimit, setNewRateLimit] = useState("30");
  const [newExpiry, setNewExpiry] = useState<Date | undefined>(undefined);

  // Just-created key (shown once)
  const [revealedKey, setRevealedKey] = useState<{
    id: string;
    rawKey: string;
  } | null>(null);

  // Edit dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<ApiKey | null>(null);
  const [editName, setEditName] = useState("");
  const [editScopes, setEditScopes] = useState<string[]>([]);
  const [editDefaultModel, setEditDefaultModel] = useState<string | null>(null);
  const [editRateLimit, setEditRateLimit] = useState("30");
  const [editExpiry, setEditExpiry] = useState<Date | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  const loadKeys = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminFetch("/api/admin/api-keys");
      if (res.ok) {
        const data = await res.json();
        setKeys(data.keys ?? []);
      }
    } catch {
      // proxy down
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadKeys();
  }, [loadKeys]);

  // Fetch models when create or edit dialog opens
  useEffect(() => {
    if ((!dialogOpen && !editDialogOpen) || availableModels.length > 0) return;
    setModelsLoading(true);
    adminFetch("/api/admin/models")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.data) {
          setAvailableModels(
            data.data.filter((m: AvailableModel) => m.category)
          );
        }
      })
      .catch(() => {})
      .finally(() => setModelsLoading(false));
  }, [dialogOpen, editDialogOpen, availableModels.length]);

  const toggleScope = (modelId: string) => {
    setSelectedScopes((prev) => {
      const next = prev.includes(modelId)
        ? prev.filter((s) => s !== modelId)
        : [...prev, modelId];
      if (!next.includes(newDefaultModel ?? "")) setNewDefaultModel(null);
      return next;
    });
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await adminFetch("/api/admin/api-keys", {
        method: "POST",
        body: JSON.stringify({
          name: newName.trim(),
          scopes: selectedScopes,
          defaultModel: newDefaultModel,
          rateLimit: parseInt(newRateLimit) || 30,
          expiresAt: newExpiry ? newExpiry.toISOString() : null,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setRevealedKey({ id: data.apiKey.id, rawKey: data.rawKey });
        setDialogOpen(false);
        setNewName("");
        setSelectedScopes([]);
        setNewDefaultModel(null);
        setNewRateLimit("30");
        setNewExpiry(undefined);
        loadKeys();
      }
    } catch {
      // ignore
    } finally {
      setCreating(false);
    }
  };

  const handleToggle = async (id: string, isActive: boolean) => {
    try {
      await adminFetch(`/api/admin/api-keys/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive }),
      });
      setKeys((prev) =>
        prev.map((k) => (k.id === id ? { ...k, isActive } : k))
      );
    } catch {
      // ignore
    }
  };

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      const res = await adminFetch(`/api/admin/api-keys/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setKeys((prev) => prev.filter((k) => k.id !== id));
        if (revealedKey?.id === id) setRevealedKey(null);
      }
    } catch {
      // ignore
    } finally {
      setDeleting(null);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const openEdit = (key: ApiKey) => {
    setEditingKey(key);
    setEditName(key.name);
    setEditScopes([...key.scopes]);
    setEditDefaultModel(key.defaultModel);
    setEditRateLimit(String(key.rateLimit));
    setEditExpiry(key.expiresAt ? new Date(key.expiresAt) : undefined);
    setEditDialogOpen(true);
  };

  const toggleEditScope = (modelId: string) => {
    setEditScopes((prev) => {
      const next = prev.includes(modelId)
        ? prev.filter((s) => s !== modelId)
        : [...prev, modelId];
      if (!next.includes(editDefaultModel ?? "")) setEditDefaultModel(null);
      return next;
    });
  };

  const handleSaveEdit = async () => {
    if (!editingKey || !editName.trim()) return;
    setSaving(true);
    try {
      const res = await adminFetch(`/api/admin/api-keys/${editingKey.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: editName.trim(),
          scopes: editScopes,
          defaultModel: editDefaultModel,
          rateLimit: parseInt(editRateLimit) || 30,
          expiresAt: editExpiry ? editExpiry.toISOString() : null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setKeys((prev) =>
          prev.map((k) => (k.id === editingKey.id ? data.apiKey : k))
        );
        setEditDialogOpen(false);
        setEditingKey(null);
      }
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="space-y-2">
        <p className="font-mono text-[10px] tracking-[0.22em] uppercase text-muted-foreground">
          admin / api keys
        </p>
        <h1 className="text-4xl font-display font-bold tracking-tight leading-none">
          API <span className="text-copilot-gradient font-display font-bold">Keys</span>
        </h1>
        <p className="text-sm text-muted-foreground max-w-lg">
          Create API keys for external services to interact with Wingman.
          Each key can be scoped to specific models and has its own rate limit.
        </p>
      </div>

      {/* Revealed key warning */}
      {revealedKey && (
        <Alert className="border-yellow-500/40 bg-yellow-500/5">
          <AlertTriangle className="w-4 h-4 text-yellow-500" />
          <AlertTitle className="text-yellow-400">
            Copy your API key now — it won&apos;t be shown again
          </AlertTitle>
          <AlertDescription className="space-y-3">
            <div className="flex items-center gap-2 mt-2">
              <code className="flex-1 px-3 py-2 rounded-lg bg-background/60 border border-border/50 font-mono text-xs break-all select-all">
                {revealedKey.rawKey}
              </code>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  copyToClipboard(revealedKey.rawKey, "revealed")
                }
                className="shrink-0"
              >
                {copied === "revealed" ? (
                  <Check className="w-4 h-4 text-copilot-green" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Use this key in the <code className="text-xs">Authorization: Bearer wm_...</code> header
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => setRevealedKey(null)}
            >
              Dismiss
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Create API Key — Dialog trigger */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogTrigger render={<Button className="gap-2" />}>
          <Plus className="w-4 h-4" />
          Create API Key
        </DialogTrigger>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New API Key</DialogTitle>
            <DialogDescription>
              Generate a key for external services. The raw key is shown once after creation.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="key-name">Name</Label>
              <Input
                id="key-name"
                placeholder="e.g. My Python App"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Allowed Models</Label>
              <p className="text-xs text-muted-foreground">Select models this key can access. Leave empty for all models.</p>
              {modelsLoading ? (
                <div className="flex items-center gap-2 py-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Loading models…</span>
                </div>
              ) : (
                <div className="rounded-lg border border-border/50 bg-background/50">
                  <ScrollArea className="h-44">
                    <div className="space-y-3 p-3">
                      {(["powerful", "versatile", "lightweight"] as const).map((cat) => {
                        const models = availableModels.filter((m) => m.category === cat);
                        if (models.length === 0) return null;
                        return (
                          <div key={cat} className="space-y-1.5">
                            <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{cat}</span>
                            <div className="flex flex-wrap gap-1.5">
                              {models.map((model) => (
                                <Badge
                                  key={model.id}
                                  variant={selectedScopes.includes(model.id) ? "default" : "outline"}
                                  className="cursor-pointer select-none transition-colors"
                                  onClick={() => toggleScope(model.id)}
                                >
                                  {selectedScopes.includes(model.id) && (
                                    <Check className="w-3 h-3 mr-0.5" />
                                  )}
                                  {model.id}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                  {selectedScopes.length > 0 && (
                    <div className="border-t border-border/50 px-3 py-1.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs text-muted-foreground h-6 px-2"
                        onClick={() => setSelectedScopes([])}
                      >
                        Clear selection ({selectedScopes.length})
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
            {selectedScopes.length > 0 && (
              <div className="space-y-2">
                <Label>Default Model</Label>
                <p className="text-xs text-muted-foreground">Used when the API request doesn&apos;t specify a model.</p>
                <div className="flex flex-wrap gap-1.5">
                  {selectedScopes.map((scopeId) => (
                    <Badge
                      key={scopeId}
                      variant={newDefaultModel === scopeId ? "default" : "outline"}
                      className="cursor-pointer select-none transition-colors"
                      onClick={() => setNewDefaultModel(newDefaultModel === scopeId ? null : scopeId)}
                    >
                      {newDefaultModel === scopeId && <Check className="w-3 h-3 mr-0.5" />}
                      {scopeId}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="key-rate">Rate Limit (req/min)</Label>
                <Input
                  id="key-rate"
                  type="number"
                  min={1}
                  max={1000}
                  value={newRateLimit}
                  onChange={(e) => setNewRateLimit(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Expires (optional)</Label>
                <Popover>
                  <PopoverTrigger
                    render={
                      <Button
                        variant="outline"
                        className={`w-full justify-start text-left font-normal ${
                          !newExpiry ? "text-muted-foreground" : ""
                        }`}
                      />
                    }
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {newExpiry ? format(newExpiry, "PPP") : "Pick a date"}
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={newExpiry}
                      onSelect={(date) => setNewExpiry(date ?? undefined)}
                      disabled={(date) => date < new Date()}
                      autoFocus
                    />
                    {newExpiry && (
                      <div className="border-t px-3 py-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs text-muted-foreground h-6"
                          onClick={() => setNewExpiry(undefined)}
                        >
                          Clear date
                        </Button>
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              onClick={handleCreate}
              disabled={creating || !newName.trim()}
              className="gap-2"
            >
              {creating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Key className="w-4 h-4" />
              )}
              Generate Key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stats bar */}
      {!loading && keys.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          {[
            {
              label: "Total Keys",
              value: keys.length,
              icon: Key,
              color: "text-copilot-purple",
            },
            {
              label: "Active",
              value: keys.filter((k) => k.isActive).length,
              icon: Shield,
              color: "text-copilot-green",
            },
            {
              label: "Total Requests",
              value: formatNumber(
                keys.reduce((a, k) => a + k.requestCount, 0)
              ),
              icon: Activity,
              color: "text-primary",
            },
          ].map((stat) => (
            <Card key={stat.label} size="sm">
              <CardContent>
                <p className="font-mono text-[9px] tracking-[0.2em] uppercase text-muted-foreground">
                  {stat.label}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <stat.icon className={`w-4 h-4 ${stat.color}`} />
                  <span className="text-xl font-bold tabular-nums">
                    {stat.value}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Key list */}
      <div className="space-y-3">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))
        ) : keys.length === 0 ? (
          <Card>
            <CardContent className="text-center py-16 space-y-3">
              <Key className="w-10 h-10 mx-auto text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                No API keys yet. Create one to start integrating.
              </p>
            </CardContent>
          </Card>
        ) : (
          keys.map((key) => (
            <Card
              key={key.id}
              className={
                key.isActive ? "" : "opacity-60"
              }
            >
              <CardHeader>
                <div className="flex items-center gap-3">
                  <Key
                    className={`w-4 h-4 shrink-0 ${
                      key.isActive
                        ? "text-copilot-green"
                        : "text-muted-foreground"
                    }`}
                  />
                  <CardTitle className="truncate">{key.name}</CardTitle>
                  <Badge variant="outline" className="font-mono text-[11px]">
                    {key.keyPrefix}...
                  </Badge>
                  <Badge variant={key.isActive ? "default" : "secondary"}>
                    {key.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>
                <CardAction>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => openEdit(key)}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Switch
                      checked={key.isActive}
                      onCheckedChange={(checked) =>
                        handleToggle(key.id, checked)
                      }
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive/70 hover:text-destructive hover:bg-destructive/10"
                      onClick={() => handleDelete(key.id)}
                      disabled={deleting === key.id}
                    >
                      {deleting === key.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </CardAction>
              </CardHeader>

              <CardContent>
                <div className="flex flex-wrap items-center gap-3">
                  {/* Scopes */}
                  <div className="flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-muted-foreground" />
                    {key.scopes.length > 0 ? (
                      key.scopes.map((scope) => (
                        <Badge key={scope} variant={key.defaultModel === scope ? "default" : "secondary"} className="text-[11px]">
                          {key.defaultModel === scope && <Check className="w-3 h-3 mr-0.5" />}
                          {scope}
                        </Badge>
                      ))
                    ) : (
                      <Badge variant="secondary" className="text-[11px]">All models</Badge>
                    )}
                  </div>

                  <Separator orientation="vertical" className="h-4" />

                  {/* Rate limit */}
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Activity className="w-3.5 h-3.5" />
                    {key.rateLimit} req/min
                  </span>

                  <Separator orientation="vertical" className="h-4" />

                  {/* Last used */}
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="w-3.5 h-3.5" />
                    Used {formatRelative(key.lastUsedAt)}
                  </span>

                  <Separator orientation="vertical" className="h-4" />

                  {/* Request count */}
                  <span className="text-xs text-muted-foreground">
                    {formatNumber(key.requestCount)} requests
                  </span>

                  {/* Expiry */}
                  {key.expiresAt && (
                    <>
                      <Separator orientation="vertical" className="h-4" />
                      <Badge
                        variant={
                          new Date(key.expiresAt) < new Date()
                            ? "destructive"
                            : "outline"
                        }
                        className="text-[11px]"
                      >
                        {new Date(key.expiresAt) < new Date()
                          ? "EXPIRED"
                          : `Expires ${new Date(key.expiresAt).toLocaleDateString()}`}
                      </Badge>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Edit API Key Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit API Key</DialogTitle>
            <DialogDescription>
              Update settings for <code className="text-xs">{editingKey?.keyPrefix}...</code>
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="edit-key-name">Name</Label>
              <Input
                id="edit-key-name"
                placeholder="e.g. My Python App"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Allowed Models</Label>
              <p className="text-xs text-muted-foreground">Select models this key can access. Leave empty for all models.</p>
              {modelsLoading ? (
                <div className="flex items-center gap-2 py-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Loading models…</span>
                </div>
              ) : (
                <div className="rounded-lg border border-border/50 bg-background/50">
                  <ScrollArea className="h-44">
                    <div className="space-y-3 p-3">
                      {(["powerful", "versatile", "lightweight"] as const).map((cat) => {
                        const models = availableModels.filter((m) => m.category === cat);
                        if (models.length === 0) return null;
                        return (
                          <div key={cat} className="space-y-1.5">
                            <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{cat}</span>
                            <div className="flex flex-wrap gap-1.5">
                              {models.map((model) => (
                                <Badge
                                  key={model.id}
                                  variant={editScopes.includes(model.id) ? "default" : "outline"}
                                  className="cursor-pointer select-none transition-colors"
                                  onClick={() => toggleEditScope(model.id)}
                                >
                                  {editScopes.includes(model.id) && (
                                    <Check className="w-3 h-3 mr-0.5" />
                                  )}
                                  {model.id}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                  {editScopes.length > 0 && (
                    <div className="border-t border-border/50 px-3 py-1.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs text-muted-foreground h-6 px-2"
                        onClick={() => setEditScopes([])}
                      >
                        Clear selection ({editScopes.length})
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
            {editScopes.length > 0 && (
              <div className="space-y-2">
                <Label>Default Model</Label>
                <p className="text-xs text-muted-foreground">Used when the API request doesn&apos;t specify a model.</p>
                <div className="flex flex-wrap gap-1.5">
                  {editScopes.map((scopeId) => (
                    <Badge
                      key={scopeId}
                      variant={editDefaultModel === scopeId ? "default" : "outline"}
                      className="cursor-pointer select-none transition-colors"
                      onClick={() => setEditDefaultModel(editDefaultModel === scopeId ? null : scopeId)}
                    >
                      {editDefaultModel === scopeId && <Check className="w-3 h-3 mr-0.5" />}
                      {scopeId}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-key-rate">Rate Limit (req/min)</Label>
                <Input
                  id="edit-key-rate"
                  type="number"
                  min={1}
                  max={1000}
                  value={editRateLimit}
                  onChange={(e) => setEditRateLimit(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Expires (optional)</Label>
                <Popover>
                  <PopoverTrigger
                    render={
                      <Button
                        variant="outline"
                        className={`w-full justify-start text-left font-normal ${
                          !editExpiry ? "text-muted-foreground" : ""
                        }`}
                      />
                    }
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {editExpiry ? format(editExpiry, "PPP") : "Pick a date"}
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={editExpiry}
                      onSelect={(date) => setEditExpiry(date ?? undefined)}
                      disabled={(date) => date < new Date()}
                      autoFocus
                    />
                    {editExpiry && (
                      <div className="border-t px-3 py-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs text-muted-foreground h-6"
                          onClick={() => setEditExpiry(undefined)}
                        >
                          Clear date
                        </Button>
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveEdit}
              disabled={saving || !editName.trim()}
              className="gap-2"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
