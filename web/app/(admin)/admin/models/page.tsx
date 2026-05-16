"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Cpu, Sparkles, Zap, Feather, Check, Loader2 } from "lucide-react";

const PROXY_URL = process.env.NEXT_PUBLIC_PROXY_URL || "http://localhost:3200";

interface Model {
  id: string;
  name: string;
  vendor: string;
  model_picker_category?: string;
  preview: boolean;
  supported_endpoints?: string[];
  capabilities?: {
    family: string;
    limits?: {
      max_context_window_tokens?: number;
      max_output_tokens?: number;
    };
    supports?: {
      streaming?: boolean;
      tool_calls?: boolean;
      vision?: boolean;
      structured_outputs?: boolean;
    };
    type?: string;
  };
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
  const [loading, setLoading] = useState(true);
  const [defaultModel, setDefaultModel] = useState<string>("gpt-4o");
  const [savingDefault, setSavingDefault] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [modelsRes, settingsRes] = await Promise.all([
          fetch(`${PROXY_URL}/api/admin/models`),
          fetch(`${PROXY_URL}/api/admin/settings`),
        ]);
        if (modelsRes.ok) {
          const data = await modelsRes.json();
          setModels(data.data ?? []);
        }
        if (settingsRes.ok) {
          const settings = await settingsRes.json();
          if (settings.default_model) setDefaultModel(settings.default_model);
        }
      } catch {
        // proxy down
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const setAsDefault = async (modelId: string) => {
    setSavingDefault(true);
    try {
      const res = await fetch(`${PROXY_URL}/api/admin/settings/default_model`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: modelId }),
      });
      if (res.ok) setDefaultModel(modelId);
    } catch {
      // ignore
    } finally {
      setSavingDefault(false);
    }
  };

  const chatModels = models.filter(m => m.model_picker_category);
  const otherModels = models.filter(m => !m.model_picker_category);
  const powerful = chatModels.filter(m => m.model_picker_category === "powerful");
  const versatile = chatModels.filter(m => m.model_picker_category === "versatile");
  const lightweight = chatModels.filter(m => m.model_picker_category === "lightweight");

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
              {models.length} available
            </p>
          )}
        </div>
        <p className="text-sm text-muted-foreground max-w-md">
          Every model surfaced by your Copilot subscription. Set a default for the chat UI.
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : (
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
        </Tabs>
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
}: {
  models: Model[];
  category: CategoryKey;
  defaultModel: string;
  onSetDefault: (id: string) => void;
  savingDefault: boolean;
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
}: {
  model: Model;
  category: CategoryKey;
  isDefault: boolean;
  onSetDefault: (id: string) => void;
  savingDefault: boolean;
}) {
  const cat = categoryMeta[category];
  const caps = model.capabilities;
  const ctx = caps?.limits?.max_context_window_tokens
    ? Math.round(caps.limits.max_context_window_tokens / 1000)
    : null;

  return (
    <div
      className={`relative overflow-hidden rounded-xl border bg-card/60 backdrop-blur-md transition-all duration-300 ${
        isDefault ? `${cat.border} ${cat.bg}` : "border-border/70"
      } ${cat.glow}`}
    >
      <div
        aria-hidden
        className={`absolute inset-x-0 top-0 h-px bg-linear-to-r ${cat.line}`}
      />
      {isDefault && (
        <div className="absolute top-3 right-3 flex items-center gap-1 px-1.5 py-0.5 rounded font-mono text-[9px] tracking-widest uppercase bg-copilot-green/15 text-copilot-green border border-copilot-green/30">
          <Check className="w-2.5 h-2.5" /> Default
        </div>
      )}

      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <p className="text-sm font-semibold leading-tight">{model.name}</p>
            <p className="font-mono text-[10px] text-muted-foreground tracking-wider mt-0.5">
              {model.vendor}
            </p>
          </div>
          {!isDefault && (
            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-mono text-[9px] tracking-widest uppercase ${cat.text} ${cat.border} border ${cat.bg}`}>
              {cat.icon}
              {cat.label}
            </span>
          )}
        </div>

        {model.preview && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 mb-3 rounded font-mono text-[9px] tracking-widest uppercase text-yellow-400 border border-yellow-500/30 bg-yellow-500/10">
            Preview
          </span>
        )}

        {/* Capability chips */}
        <div className="flex flex-wrap gap-1.5">
          {ctx !== null && (
            <CapChip>
              <span className="font-display font-bold text-sm leading-none">{ctx}</span>
              <span className="font-mono text-[10px] tracking-wider ml-0.5">k ctx</span>
            </CapChip>
          )}
          {caps?.limits?.max_output_tokens && (
            <CapChip>
              <span className="font-display font-bold text-sm leading-none">
                {(caps.limits.max_output_tokens / 1000).toFixed(0)}
              </span>
              <span className="font-mono text-[10px] tracking-wider ml-0.5">k out</span>
            </CapChip>
          )}
          {caps?.supports?.vision && <CapChip>Vision</CapChip>}
          {caps?.supports?.tool_calls && <CapChip>Tools</CapChip>}
          {caps?.supports?.structured_outputs && <CapChip>Structured</CapChip>}
          {caps?.supports?.streaming && <CapChip>Stream</CapChip>}
        </div>

        {model.supported_endpoints && (
          <p className="font-mono text-[10px] text-muted-foreground/60 mt-3 tracking-wider">
            {model.supported_endpoints.join(" · ")}
          </p>
        )}

        <div className="rail-divider my-4" />

        <div className="flex items-center justify-between">
          <p className="font-mono text-[10px] text-muted-foreground/70 tracking-wider truncate">
            {model.id}
          </p>
          {isDefault ? (
            <span className="font-mono text-[10px] tracking-widest uppercase text-copilot-green">
              ● Active
            </span>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2.5 font-mono text-[10px] tracking-widest uppercase text-muted-foreground hover:text-foreground"
              onClick={() => onSetDefault(model.id)}
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

function CapChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md bg-secondary/60 border border-border/60 font-mono text-[10px] tracking-wider text-muted-foreground">
      {children}
    </span>
  );
}
