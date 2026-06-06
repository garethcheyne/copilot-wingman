"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Image from "next/image";
import { Send, Sparkles, User, Loader2, ChevronDown, Terminal, Code2, Bug, Wand2, ImagePlus, X, FlaskConical, Square } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/components/session-provider";
import { ChatMarkdown } from "@/components/chat-markdown";
import ChatErrorCard from "@/components/chat/ChatErrorCard";
import Toast from "@/components/ui/toast";
import { MobileNavTrigger } from "@/components/mobile-nav";
import { adminFetch } from "@/lib/admin-api";
import { notifyWhenHidden } from "@/lib/notifications";
import { pdfToImages, isPdf } from "@/lib/pdf-to-images";
import "highlight.js/styles/github-dark.css";

interface Message {
  role: "user" | "assistant";
  content: string;
  images?: string[]; // base64 data URLs
  // Set on assistant turns that failed with a quota error. Rendered as a
  // ChatErrorCard instead of message content — avoids smuggling UI state
  // through magic strings in `content`.
  error?: "quota" | "premium_quota";
}

interface ModelInfo {
  id: string;
  name: string;
  vendor: string;
  version: string;
}

const PROXY_URL = process.env.NEXT_PUBLIC_PROXY_URL ?? "http://localhost:3200";
const SESSION_TOKEN_KEY = "wingman_session_token";

const SUGGESTIONS: Array<{ icon: typeof Code2; label: string; prompt: string; kbd: string }> = [
  { icon: Code2, label: "Explain quantum computing", prompt: "Explain quantum computing", kbd: "⌘1" },
  { icon: Wand2, label: "Write a haiku about code", prompt: "Write a haiku about code", kbd: "⌘2" },
  { icon: Terminal, label: "What is TypeScript?", prompt: "What is TypeScript?", kbd: "⌘3" },
  { icon: Bug, label: "Help me debug", prompt: "Help me debug", kbd: "⌘4" },
];

export default function ChatPage() {
  const [toast, setToast] = useState<string | null>(null);
  const { activeSessionKey, sessions, loading: sessionsLoading, refreshSessions, loadSessionMessages } = useSession();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [attachedImages, setAttachedImages] = useState<string[]>([]);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("gpt-4o");
  const [showModelPicker, setShowModelPicker] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const modelPickerRef = useRef<HTMLDivElement>(null);
  // Tracks the in-flight chat stream so it can be cancelled on unmount or
  // session switch (otherwise a stale stream keeps writing into whatever
  // session is now active).
  const abortRef = useRef<AbortController | null>(null);
  // The session key whose messages are currently displayed. Guards the loader
  // below from re-fetching (and clobbering freshly streamed messages) every
  // time the sessions list refreshes after a send.
  const loadedKeyRef = useRef<string | null>(null);

  // Load messages only when the *active session* changes — not on every
  // sessions-list refresh. Without the loadedKeyRef guard, refreshSessions()
  // (called after each send) would re-fetch and overwrite the reply we just
  // streamed in locally.
  useEffect(() => {
    if (loadedKeyRef.current === activeSessionKey) return;
    const session = sessions.find((s) => s.sessionKey === activeSessionKey);
    // Sessions list hasn't arrived yet — wait rather than commit an empty
    // thread for a session that may actually have history.
    if (!session && sessionsLoading) return;
    loadedKeyRef.current = activeSessionKey;
    if (session && session.messageCount > 0) {
      loadSessionMessages(session.id).then((msgs) => {
        // Ignore if the user switched sessions again before this resolved.
        if (loadedKeyRef.current !== activeSessionKey) return;
        setMessages(
          msgs.map((m) => ({ role: m.role as "user" | "assistant", content: m.content }))
        );
      });
    } else {
      setMessages([]);
    }
  }, [activeSessionKey, sessions, sessionsLoading, loadSessionMessages]);

  // Reset the composer and cancel any in-flight stream when the user actually
  // switches sessions.
  useEffect(() => {
    setInput("");
    setAttachedImages([]);
    abortRef.current?.abort();
  }, [activeSessionKey]);

  // Cancel any in-flight stream on unmount.
  useEffect(() => () => abortRef.current?.abort(), []);

  // Load models + default on mount
  useEffect(() => {
    const load = async () => {
      try {
        const [modelsRes, settingsRes] = await Promise.all([
          adminFetch("/api/admin/models"),
          adminFetch("/api/admin/settings"),
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

  // Auto-scroll, but only when the user is already near the bottom — so we
  // don't yank the viewport back down while they're reading earlier messages
  // mid-stream. Use instant scroll during streaming (smooth animates per token
  // and looks janky); smooth otherwise.
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (nearBottom) {
      el.scrollTo({ top: el.scrollHeight, behavior: isLoading ? "auto" : "smooth" });
    }
  }, [messages, isLoading]);

  const addFiles = async (files: FileList | File[]) => {
    const MAX_IMAGES = 10;
    const remaining = MAX_IMAGES - attachedImages.length;
    if (remaining <= 0) return;

    const fileArray = Array.from(files);
    const imageFiles = fileArray.filter(f => f.type.startsWith("image/"));
    const pdfFiles = fileArray.filter(f => isPdf(f));

    // Process images directly
    const imageSlots = Math.min(imageFiles.length, remaining);
    imageFiles.slice(0, imageSlots).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        setAttachedImages((prev) => prev.length < MAX_IMAGES ? [...prev, dataUrl] : prev);
      };
      reader.readAsDataURL(file);
    });

    // Process PDFs (render pages as images for vision)
    if (pdfFiles.length > 0) {
      setIsProcessingFile(true);
      try {
        for (const pdf of pdfFiles) {
          const pages = await pdfToImages(pdf, { maxPages: 5, scale: 1.5 });
          setAttachedImages((prev) => {
            const slotsLeft = MAX_IMAGES - prev.length;
            return [...prev, ...pages.slice(0, slotsLeft)];
          });
        }
      } catch (err) {
        console.error("[pdf] Failed to render PDF:", err);
        setToast("Failed to process PDF — try a smaller file");
      } finally {
        setIsProcessingFile(false);
      }
    }
  };

  const removeImage = (index: number) => {
    setAttachedImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imageFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith("image/") || items[i].type === "application/pdf") {
        const file = items[i].getAsFile();
        if (file) imageFiles.push(file);
      }
    }
    if (imageFiles.length > 0) {
      e.preventDefault();
      addFiles(imageFiles);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer?.files) {
      addFiles(e.dataTransfer.files);
    }
  };

  const sendMessage = async (text?: string, modelOverride?: string) => {
    const content = text ?? input.trim();
    if ((!content && attachedImages.length === 0) || isLoading) return;

    const model = modelOverride ?? selectedModel;
    const images = attachedImages.length > 0 ? [...attachedImages] : undefined;
    setInput("");
    setAttachedImages([]);
    setMessages((prev) => [...prev, { role: "user", content: content || "(image)", images }]);
    setIsLoading(true);

    // Add placeholder for assistant
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    // Cancel any previous in-flight stream before starting a new one.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const sessionToken =
        typeof window !== "undefined" ? localStorage.getItem(SESSION_TOKEN_KEY) ?? "" : "";
      const res = await fetch(`${PROXY_URL}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-session-token": sessionToken,
        },
        body: JSON.stringify({ sessionKey: activeSessionKey, message: content || "What is in this image?", model, stream: true, images }),
        signal: controller.signal,
      });

      if (!res.ok) {
        let errText = "";
        let errJson: any = null;
        try {
          errJson = await res.json();
          errText = errJson?.error || JSON.stringify(errJson);
        } catch {
          errText = await res.text();
        }
        if (res.status === 429) {
          // Prefer a structured error code from the proxy; fall back to a
          // text heuristic for older proxy versions.
          const code = errJson?.code ?? errJson?.error?.code;
          const isStandardModel = model === "gpt-3.5-turbo" || model === "gpt-3.5";
          const isPremiumModel =
            code === "premium_quota_exceeded" ||
            (code == null &&
              /premium|allowance|gpt-4|opus|claude|gemini/i.test(errText) &&
              !isStandardModel);
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              role: "assistant",
              content: "",
              error: isPremiumModel ? "premium_quota" : "quota",
            };
            return updated;
          });
        } else {
          setToast(`Error (${res.status}): ${errText}`);
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              role: "assistant",
              content: "",
              images: undefined,
            };
            return updated;
          });
        }
        setIsLoading(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let accumulated = "";
      // SSE frames can be split across network chunks; buffer partial lines
      // and only parse complete ones, retaining the trailing remainder.
      let buffer = "";

      const flushLine = (line: string) => {
        if (!line.startsWith("data: ") || line === "data: [DONE]") return;
        try {
          const parsed = JSON.parse(line.slice(6));
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) {
            accumulated += delta;
            setMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = { role: "assistant", content: accumulated };
              return updated;
            });
          }
        } catch {
          // skip unparseable
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        // Keep the last (possibly partial) line in the buffer.
        buffer = lines.pop() ?? "";
        for (const line of lines) flushLine(line);
      }
      // Process any remaining buffered line after the stream ends.
      if (buffer) flushLine(buffer);

      // Stream completed but produced no content (e.g. server sent only
      // keep-alives or an unexpected shape).
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
      // Aborts are expected (unmount / session switch / retry) — keep whatever
      // streamed so far and stay silent.
      if ((err as Error).name === "AbortError") return;
      setToast(`Error: ${(err as Error).message}`);
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: "assistant",
          content: "",
          images: undefined,
        };
        return updated;
      });
    } finally {
      // Only clear loading / refresh if this send still owns the controller
      // (a newer send or an abort may have superseded it).
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      if (!controller.signal.aborted) {
        setIsLoading(false);
        refreshSessions();
      // If the tab is in the background, surface a local browser notification
      // so the user knows their reply is ready. No-op when permission is
      // denied/unset or when the tab is already visible.
        notifyWhenHidden({
          title: "Wingman reply ready",
          body: content
            ? content.length > 80
              ? `${content.slice(0, 80)}…`
              : content
            : "Your response is ready.",
          url: "/chat",
        });
      }
    }
  };

  const stopGenerating = useCallback(() => {
    abortRef.current?.abort();
    setIsLoading(false);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const sessionShort = activeSessionKey.slice(0, 8);

  return (
    <div className="flex flex-col h-full relative">
      {/* Header — defensive safe-area padding so the Dynamic Island / iOS
          status bar never eats the title or model picker even when running in
          a regular Safari tab (outside the installed PWA shell). */}
      <header className="pt-[max(calc(env(safe-area-inset-top)+1.125rem),2rem)] border-b border-border/70 flex items-center px-3 sm:px-6 shrink-0 justify-between gap-2 bg-background/70 backdrop-blur-xl relative z-10 min-h-14">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <MobileNavTrigger label="Open chat history" />
          <div className="flex items-center gap-2 min-w-0">
            <span className="pulse-ring text-copilot-green shrink-0">
              <span className="bg-copilot-green" />
            </span>
            <h1 className="text-sm font-semibold tracking-tight truncate">
              {messages.length > 0 ? "Chat" : "New Conversation"}
            </h1>
          </div>
          <span className="font-mono text-[10px] tracking-wider text-muted-foreground/70 px-2 py-0.5 rounded border border-border/60 bg-card/50 hidden md:inline whitespace-nowrap">
            ~/session/{sessionShort}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {/* Dev-only matrix link — Next.js inlines process.env.NODE_ENV at
              build time, so production builds tree-shake this away. */}
          {process.env.NODE_ENV === "development" && (
            <Link
              href="/dev/matrix"
              target="_blank"
              rel="noopener"
              title="Open viewport diagnostic matrix (dev only)"
              className="inline-flex items-center justify-center w-9 h-9 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
            >
              <FlaskConical className="w-4 h-4" />
            </Link>
          )}

          {/* Model picker */}
          <div className="relative" ref={modelPickerRef}>
          <button
            type="button"
            onClick={() => setShowModelPicker(!showModelPicker)}
            aria-haspopup="listbox"
            aria-expanded={showModelPicker ? "true" : "false"}
            className="flex items-center gap-1.5 sm:gap-2 pl-2 sm:pl-2.5 pr-1.5 py-1.5 -mr-2 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors max-w-[55vw] sm:max-w-none"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-copilot-purple shadow-[0_0_8px_hsl(258_90%_66%/0.8)] shrink-0" />
            <span className="font-mono text-muted-foreground tracking-wider uppercase text-[9px] hidden sm:inline">model</span>
            <span className="font-medium truncate">{selectedModel}</span>
            <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
          </button>
          {showModelPicker && models.length > 0 && (
            <div className="absolute right-0 top-full mt-2 z-50 w-[min(20rem,calc(100vw-1.5rem))] max-h-[min(70vh,calc(100vh-7rem))] overflow-auto rounded-lg border border-border bg-popover/95 backdrop-blur-xl shadow-2xl shadow-black/40 scroll-sleek">
              <div className="sticky top-0 px-3 py-2 border-b border-border/60 bg-popover/95 backdrop-blur-xl">
                <p className="label-mono">// Available models</p>
              </div>
              {models.map((m) => (
                <button
                  key={m.id}
                  type="button"
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
        </div>
      </header>

      {/* Messages area */}
      <div ref={scrollContainerRef} className="flex-1 overflow-auto scroll-sleek relative">
        {messages.length === 0 ? (
          <div className="relative max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-16 flex flex-col items-center justify-center min-h-full gap-6 sm:gap-8">
            {/* Floating gradient orb */}
            <div
              aria-hidden
              className="absolute top-12 left-1/2 -translate-x-1/2 w-120 h-120 bg-orb-copilot animate-orb-drift pointer-events-none opacity-70"
            />

            <div className="relative z-10 flex flex-col items-center gap-8 sm:gap-10 stagger-children w-full">
              {/* Brand mark — asymmetric: oversized logo bleeds off the left,
                  wordmark sits inline on the right and stacks tight so the
                  two read as one composition rather than icon-over-label. */}
              <div className="relative w-full max-w-xl flex items-center justify-center gap-1 sm:gap-3">
                {/* Aurora bloom anchored to the logo */}
                <div
                  aria-hidden
                  className="absolute left-2 top-1/2 -translate-y-1/2 w-72 h-72 sm:w-96 sm:h-96 rounded-full bg-copilot-purple/30 blur-3xl pointer-events-none"
                />
                <div
                  aria-hidden
                  className="absolute left-12 top-1/2 -translate-y-1/2 w-40 h-40 sm:w-56 sm:h-56 rounded-full bg-primary/25 blur-2xl pointer-events-none mix-blend-screen"
                />

                {/* Logo — large, sits left of the wordmark inside the
                    container (no negative bleed — that was clipping the
                    logo against the sidebar edge on desktop). */}
                <Image
                  src="/wingman-ai.png"
                  alt="Wingman"
                  width={400}
                  height={400}
                  className="relative shrink-0 w-40 h-40 sm:w-56 sm:h-56 object-contain mix-blend-screen drop-shadow-[0_14px_40px_hsl(258_90%_66%/0.55)] select-none pointer-events-none"
                  priority
                />

                {/* Wordmark — inline, stacked tight, gradient on the brand word */}
                <div className="relative flex-1 min-w-0">
                  <p className="label-mono text-primary/80 mb-1 sm:mb-1.5">// Ready</p>
                  <h2 className="font-display font-bold tracking-tight leading-[0.85]">
                    <span className="block text-4xl sm:text-6xl text-foreground/90">Ask</span>
                    <span className="block text-5xl sm:text-7xl text-copilot-gradient">Wingman</span>
                  </h2>
                </div>
              </div>

              <p className="text-muted-foreground text-xs sm:text-sm max-w-md text-center px-2 -mt-2">
                Copilot proxy &middot; streaming responses &middot; full model catalog
              </p>

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

              {/* Dev-only matrix link — full-width below the suggestion grid
                  so it's easy to tap on mobile. Next.js inlines NODE_ENV at
                  build time, so production tree-shakes this away. */}
              {process.env.NODE_ENV === "development" && (
                <Link
                  href="/dev/matrix"
                  target="_blank"
                  rel="noopener"
                  className="w-full max-w-xl flex items-center justify-center gap-2 px-4 py-3.5 rounded-lg border border-dashed border-copilot-purple/40 bg-copilot-purple/5 text-copilot-purple hover:bg-copilot-purple/10 hover:border-copilot-purple/60 transition-colors mt-1"
                >
                  <FlaskConical className="w-4 h-4" />
                  <span className="text-sm font-medium">Open viewport diagnostic matrix</span>
                  <span className="font-mono text-[10px] tracking-wider opacity-60">DEV</span>
                </Link>
              )}
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto px-3 sm:px-6 py-4 sm:py-8 space-y-6 sm:space-y-8">
            {messages.map((msg, i) => {
              const isUser = msg.role === "user";
              if (!isUser && msg.error) {
                const isPremiumModel = msg.error === "premium_quota";
                return (
                  <div key={i} className="flex gap-4 fade-up">
                    <div className="shrink-0">
                      <div className="ring-copilot-gradient rounded-full">
                        <div className="w-8 h-8 rounded-full bg-card flex items-center justify-center">
                          <Sparkles className="w-3.5 h-3.5 text-copilot-purple" strokeWidth={2} />
                        </div>
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <ChatErrorCard
                        isPremiumModel={isPremiumModel}
                        onSwitchModel={isPremiumModel ? () => {
                          const STANDARD_MODEL = "gpt-3.5-turbo";
                          setSelectedModel(STANDARD_MODEL);
                          // Find the user turn that triggered the error so we
                          // can re-send it, preserving the rest of the history.
                          const lastUser = [...messages].reverse().find((m) => m.role === "user");
                          setMessages((prev) => {
                            const next = [...prev];
                            // Drop the trailing error card…
                            if (next.length && next[next.length - 1].error) next.pop();
                            // …and the user turn it replied to (sendMessage re-adds it).
                            for (let j = next.length - 1; j >= 0; j--) {
                              if (next[j].role === "user") { next.splice(j, 1); break; }
                            }
                            return next;
                          });
                          if (lastUser) sendMessage(lastUser.content, STANDARD_MODEL);
                        } : undefined}
                      />
                    </div>
                  </div>
                );
              }
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
                      aria-live={!isUser && isLoading && i === messages.length - 1 ? "polite" : "off"}
                      className={`text-sm leading-relaxed px-4 py-3 rounded-lg border wrap-break-word ${
                        isUser
                          ? "bg-primary/6 border-primary/20 border-l-2 border-l-primary whitespace-pre-wrap"
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
              {toast && <Toast message={toast} onClose={() => setToast(null)} />}
          </div>
        )}
      </div>

      {/* Input area — bottom padding takes the max of: the design minimum
          (0.75rem), the OS-reported safe-area inset, and the measured
          home-indicator zone (100lvh − 100svh). The third arg is the
          fallback for iOS contexts where env(safe-area-inset-bottom)
          under-reports — pwa-safezone documents this exact failure mode. */}
      <div className="border-t border-border/70 p-3 sm:p-4 shrink-0 bg-background/40 backdrop-blur-md relative z-10 pb-[max(0.75rem,var(--sz-safe-bottom),calc(100lvh-100svh))]">
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
              accept="image/*,.pdf,application/pdf"
              multiple
              className="hidden"
              aria-label="Upload images or PDFs"
              onChange={(e) => {
                if (e.target.files) addFiles(e.target.files);
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
                disabled={isLoading || isProcessingFile || attachedImages.length >= 10}
                className="h-9 w-9 rounded-lg text-muted-foreground hover:text-foreground"
                title="Attach image or PDF"
              >
                {isProcessingFile ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ImagePlus className="w-4 h-4" />
                )}
              </Button>
              <Button
                type="button"
                size="icon"
                onClick={() => (isLoading ? stopGenerating() : sendMessage())}
                disabled={!isLoading && !input.trim() && attachedImages.length === 0}
                aria-label={isLoading ? "Stop generating" : "Send message"}
                className="h-9 w-9 rounded-lg bg-copilot-gradient hover:opacity-90 text-white border-0 disabled:opacity-40"
              >
                {isLoading ? (
                  <Square className="w-3.5 h-3.5 fill-current" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>
          <div className="flex items-center justify-between mt-2.5 px-1">
            <p className="font-mono text-[9px] tracking-wider text-muted-foreground/60 uppercase">
              Enter to send &middot; Paste or drop images/PDFs
            </p>
            <p className="font-mono text-[9px] tracking-wider text-muted-foreground/60 uppercase">
              Copilot proxy
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
