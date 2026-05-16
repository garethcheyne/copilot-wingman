"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Image from "next/image";
import { Send, Sparkles, User, Loader2, ChevronDown, Terminal, Code2, Bug, Wand2, ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/components/session-provider";
import { ChatMarkdown } from "@/components/chat-markdown";
import "highlight.js/styles/github-dark.css";

interface Message {
  role: "user" | "assistant";
  content: string;
  images?: string[]; // base64 data URLs
}

interface ModelInfo {
  id: string;
  name: string;
  vendor: string;
  version: string;
}

const PROXY_URL = process.env.NEXT_PUBLIC_PROXY_URL ?? "http://localhost:3200";const API_KEY = process.env.NEXT_PUBLIC_API_KEY || "";

const SUGGESTIONS: Array<{ icon: typeof Code2; label: string; prompt: string; kbd: string }> = [
  { icon: Code2, label: "Explain quantum computing", prompt: "Explain quantum computing", kbd: "⌘1" },
  { icon: Wand2, label: "Write a haiku about code", prompt: "Write a haiku about code", kbd: "⌘2" },
  { icon: Terminal, label: "What is TypeScript?", prompt: "What is TypeScript?", kbd: "⌘3" },
  { icon: Bug, label: "Help me debug", prompt: "Help me debug", kbd: "⌘4" },
];

export default function ChatPage() {
  const { activeSessionKey, sessions, refreshSessions, loadSessionMessages } = useSession();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [attachedImages, setAttachedImages] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("gpt-4o");
  const [showModelPicker, setShowModelPicker] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const modelPickerRef = useRef<HTMLDivElement>(null);

  // Load messages when switching sessions
  useEffect(() => {
    const session = sessions.find((s) => s.sessionKey === activeSessionKey);
    if (session && session.messageCount > 0) {
      loadSessionMessages(session.id).then((msgs) => {
        setMessages(
          msgs.map((m) => ({ role: m.role as "user" | "assistant", content: m.content }))
        );
      });
    } else {
      setMessages([]);
    }
    setInput("");
    setAttachedImages([]);
  }, [activeSessionKey, sessions, loadSessionMessages]);

  // Load models + default on mount
  useEffect(() => {
    const load = async () => {
      try {
        const [modelsRes, settingsRes] = await Promise.all([
          fetch(`${PROXY_URL}/api/admin/models`),
          fetch(`${PROXY_URL}/api/admin/settings`),
        ]);
        if (modelsRes.ok) {
          const data = await modelsRes.json();
          const list = (data.data || data || []).map((m: any) => ({
            id: m.id,
            name: m.name || m.id,
            vendor: m.vendor || "",
            version: m.version || "",
          }));
          setModels(list);
        }
        if (settingsRes.ok) {
          const settings = await settingsRes.json();
          if (settings.default_model) {
            setSelectedModel(settings.default_model);
          }
        }
      } catch {
        // proxy not available
      }
    };
    load();
  }, []);

  // Close model picker on click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (modelPickerRef.current && !modelPickerRef.current.contains(e.target as Node)) {
        setShowModelPicker(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const addImages = (files: FileList | File[]) => {
    const MAX_IMAGES = 5;
    const remaining = MAX_IMAGES - attachedImages.length;
    const toProcess = Array.from(files).filter(f => f.type.startsWith("image/")).slice(0, remaining);
    toProcess.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        setAttachedImages((prev) => [...prev, dataUrl]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (index: number) => {
    setAttachedImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imageFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith("image/")) {
        const file = items[i].getAsFile();
        if (file) imageFiles.push(file);
      }
    }
    if (imageFiles.length > 0) {
      e.preventDefault();
      addImages(imageFiles);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer?.files) {
      addImages(e.dataTransfer.files);
    }
  };

  const sendMessage = async (text?: string) => {
    const content = text ?? input.trim();
    if ((!content && attachedImages.length === 0) || isLoading) return;

    const images = attachedImages.length > 0 ? [...attachedImages] : undefined;
    setInput("");
    setAttachedImages([]);
    setMessages((prev) => [...prev, { role: "user", content: content || "(image)", images }]);
    setIsLoading(true);

    // Add placeholder for assistant
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const res = await fetch(`${PROXY_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Api-Key": API_KEY },
        body: JSON.stringify({ sessionKey: activeSessionKey, message: content || "What is in this image?", model: selectedModel, stream: true, images }),
      });

      if (!res.ok) {
        const errText = await res.text();
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: "assistant",
            content: `Error (${res.status}): ${errText}`,
          };
          return updated;
        });
        setIsLoading(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split("\n")) {
          if (line.startsWith("data: ") && line !== "data: [DONE]") {
            try {
              const parsed = JSON.parse(line.slice(6));
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) {
                accumulated += delta;
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    role: "assistant",
                    content: accumulated,
                  };
                  return updated;
                });
              }
            } catch {
              // skip unparseable
            }
          }
        }
      }

      // If no content came through streaming, try non-streaming fallback
      if (!accumulated) {
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: "assistant",
            content: "No response received.",
          };
          return updated;
        });
      }
    } catch (err) {
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: "assistant",
          content: `Error: ${(err as Error).message}`,
        };
        return updated;
      });
    } finally {
      setIsLoading(false);
      refreshSessions();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const sessionShort = activeSessionKey.slice(0, 8);

  return (
    <div className="flex flex-col h-full relative">
      {/* Header */}
      <header className="h-14 border-b border-border/70 flex items-center px-6 shrink-0 justify-between bg-background/40 backdrop-blur-md relative z-10">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="pulse-ring text-copilot-green">
              <span className="bg-copilot-green" />
            </span>
            <h1 className="text-sm font-semibold tracking-tight">
              {messages.length > 0 ? "Chat" : "New Conversation"}
            </h1>
          </div>
          <span className="font-mono text-[10px] tracking-wider text-muted-foreground/70 px-2 py-0.5 rounded border border-border/60 bg-card/50">
            ~/session/{sessionShort}
          </span>
        </div>

        {/* Model picker */}
        <div className="relative" ref={modelPickerRef}>
          <button
            onClick={() => setShowModelPicker(!showModelPicker)}
            className="flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-md text-xs border border-border bg-card/70 hover:bg-card hover:border-primary/40 transition-colors backdrop-blur-md"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-copilot-purple shadow-[0_0_8px_hsl(258_90%_66%/0.8)]" />
            <span className="font-mono text-muted-foreground tracking-wider uppercase text-[9px]">model</span>
            <span className="font-medium">{selectedModel}</span>
            <ChevronDown className="w-3 h-3 text-muted-foreground" />
          </button>
          {showModelPicker && models.length > 0 && (
            <div className="absolute right-0 top-full mt-2 z-50 w-80 max-h-96 overflow-auto rounded-lg border border-border bg-popover/95 backdrop-blur-xl shadow-2xl shadow-black/40 scroll-sleek">
              <div className="sticky top-0 px-3 py-2 border-b border-border/60 bg-popover/95 backdrop-blur-xl">
                <p className="label-mono">// Available models</p>
              </div>
              {models.map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    setSelectedModel(m.id);
                    setShowModelPicker(false);
                  }}
                  className={`w-full text-left px-3 py-2.5 text-sm hover:bg-secondary/70 transition-colors flex items-center justify-between border-l-2 ${
                    m.id === selectedModel ? "bg-secondary/50 border-l-copilot-purple" : "border-l-transparent"
                  }`}
                >
                  <div>
                    <p className="font-medium">{m.name}</p>
                    <p className="font-mono text-[10px] text-muted-foreground tracking-wider">{m.vendor}</p>
                  </div>
                  {m.id === selectedModel && (
                    <span className="text-copilot-purple text-xs font-mono tracking-widest">●</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      {/* Messages area */}
      <div className="flex-1 overflow-auto scroll-sleek relative">
        {messages.length === 0 ? (
          <div className="relative max-w-3xl mx-auto px-6 py-16 flex flex-col items-center justify-center min-h-full gap-8">
            {/* Floating gradient orb */}
            <div
              aria-hidden
              className="absolute top-12 left-1/2 -translate-x-1/2 w-120 h-120 bg-orb-copilot animate-orb-drift pointer-events-none opacity-70"
            />

            <div className="relative z-10 flex flex-col items-center gap-6 stagger-children">
              <div className="relative">
                <div aria-hidden className="absolute inset-0 -m-6 rounded-full bg-copilot-purple/30 blur-2xl pointer-events-none" />
                <Image
                  src="/wingman-ai.png"
                  alt="Wingman"
                  width={120}
                  height={120}
                  className="relative drop-shadow-[0_8px_32px_hsl(258_90%_66%/0.5)]"
                  priority
                />
              </div>

              <div className="text-center space-y-3">
                <p className="label-mono text-primary/80">// Ready</p>
                <h2 className="text-5xl font-display font-bold tracking-tight leading-none">
                  Ask <span className="text-copilot-gradient font-display font-bold">Wingman</span>
                </h2>
                <p className="text-muted-foreground text-sm max-w-md mx-auto">
                  Self-hosted proxy &middot; streaming responses &middot; full model catalog
                </p>
              </div>

              {/* Suggestion grid — command-palette style */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-xl mt-2">
                {SUGGESTIONS.map((s, idx) => (
                  <button
                    key={s.label}
                    type="button"
                    onClick={() => sendMessage(s.prompt)}
                    className="group relative flex items-center gap-3 px-3.5 py-3 rounded-lg border border-border/70 bg-card/60 backdrop-blur-md hover:border-primary/50 hover:bg-card transition-all text-left"
                  >
                    <span className="w-8 h-8 rounded-md bg-secondary/70 group-hover:bg-primary/15 group-hover:text-primary text-muted-foreground transition-colors flex items-center justify-center shrink-0">
                      <s.icon className="w-4 h-4" strokeWidth={1.8} />
                    </span>
                    <span className="flex-1 text-sm">{s.label}</span>
                    <kbd className="font-mono text-[9px] tracking-wider text-muted-foreground/70 group-hover:text-muted-foreground opacity-60 group-hover:opacity-100 transition-opacity">
                      {s.kbd}
                    </kbd>
                    {idx === 0 && (
                      <span className="absolute -top-px left-3 right-3 h-px bg-linear-to-r from-transparent via-primary/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">
            {messages.map((msg, i) => {
              const isUser = msg.role === "user";
              return (
                <div key={i} className="flex gap-4 fade-up">
                  <div className="shrink-0">
                    {isUser ? (
                      <div className="w-8 h-8 rounded-full bg-secondary/80 border border-border/70 flex items-center justify-center">
                        <User className="w-3.5 h-3.5 text-muted-foreground" />
                      </div>
                    ) : (
                      <div className="ring-copilot-gradient rounded-full">
                        <div className="w-8 h-8 rounded-full bg-card flex items-center justify-center">
                          <Sparkles className="w-3.5 h-3.5 text-copilot-purple" strokeWidth={2} />
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <p className="font-mono text-[10px] tracking-[0.18em] uppercase text-muted-foreground/80">
                        {isUser ? "// You" : "// Wingman"}
                      </p>
                      {!isUser && (
                        <span className="font-mono text-[9px] tracking-wider text-muted-foreground/50">
                          {selectedModel}
                        </span>
                      )}
                    </div>
                    <div
                      className={`text-sm leading-relaxed px-4 py-3 rounded-lg border ${
                        isUser
                          ? "bg-primary/6 border-primary/20 border-l-2 border-l-primary whitespace-pre-wrap break-words"
                          : "bg-card/60 backdrop-blur-md border-border/70 border-l-2 border-l-copilot-purple prose-wingman"
                      }`}
                    >
                      {/* Image attachments */}
                      {msg.images && msg.images.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-2">
                          {msg.images.map((src, imgIdx) => (
                            <img
                              key={imgIdx}
                              src={src}
                              alt={`Attachment ${imgIdx + 1}`}
                              className="max-w-48 max-h-48 rounded-md border border-border/50 object-contain cursor-pointer hover:opacity-80 transition-opacity"
                              onClick={() => window.open(src, "_blank")}
                            />
                          ))}
                        </div>
                      )}
                      {msg.content ? (
                        isUser ? msg.content : <ChatMarkdown content={msg.content} />
                      ) : (
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <span className="stream-dot inline-block w-1.5 h-1.5 rounded-full bg-copilot-purple" />
                          <span className="stream-dot inline-block w-1.5 h-1.5 rounded-full bg-copilot-purple" />
                          <span className="stream-dot inline-block w-1.5 h-1.5 rounded-full bg-copilot-purple" />
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="border-t border-border/70 p-4 shrink-0 bg-background/40 backdrop-blur-md relative z-10">
        <div className="max-w-3xl mx-auto">
          {/* Image preview strip */}
          {attachedImages.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2 px-1">
              {attachedImages.map((src, i) => (
                <div key={i} className="relative group/img">
                  <img
                    src={src}
                    alt={`Upload ${i + 1}`}
                    className="w-16 h-16 rounded-lg border border-border/70 object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removeImage(i)}
                    title="Remove image"
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div
            className="relative group"
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
          >
            {/* subtle focus ring — only visible on focus */}
            <div
              aria-hidden
              className="absolute -inset-px rounded-xl opacity-0 group-focus-within:opacity-100 transition-opacity pointer-events-none ring-1 ring-primary/30"
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              aria-label="Upload images"
              onChange={(e) => {
                if (e.target.files) addImages(e.target.files);
                e.target.value = "";
              }}
            />
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={attachedImages.length > 0 ? "Add a message about the image(s)..." : "Ask Wingman anything..."}
              className="relative min-h-13 max-h-50 pr-24 pl-4 resize-none bg-card/80 backdrop-blur-md border-border/70 focus-visible:ring-primary/40 focus-visible:border-primary/40 rounded-xl"
              rows={1}
              disabled={isLoading}
            />
            <div className="absolute right-2 bottom-2 flex items-center gap-1 z-10">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading || attachedImages.length >= 5}
                className="h-9 w-9 rounded-lg text-muted-foreground hover:text-foreground"
                title="Attach image"
              >
                <ImagePlus className="w-4 h-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                onClick={() => sendMessage()}
                disabled={(!input.trim() && attachedImages.length === 0) || isLoading}
                className="h-9 w-9 rounded-lg bg-copilot-gradient hover:opacity-90 text-white border-0 disabled:opacity-40"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>
          <div className="flex items-center justify-between mt-2.5 px-1">
            <p className="font-mono text-[9px] tracking-wider text-muted-foreground/60 uppercase">
              Enter to send &middot; Paste or drop images
            </p>
            <p className="font-mono text-[9px] tracking-wider text-muted-foreground/60 uppercase">
              Self-hosted proxy
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
