"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface UseCopyResult {
  copied: boolean;
  /** Copy `text`; resolves to true on success, false on failure. */
  copy: (text: string) => Promise<boolean>;
}

/**
 * Clipboard copy with built-in "Copied!" feedback.
 *
 * Unlike a bare `navigator.clipboard.writeText` call, this:
 *  - awaits the write and only flips `copied` on success (so the UI never
 *    falsely claims success in insecure contexts where the API is missing),
 *  - falls back to a hidden-textarea + `execCommand` for non-secure origins,
 *  - clears its reset timer on unmount (no setState-after-unmount warning).
 */
export function useCopy(resetMs = 2000): UseCopyResult {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const copy = useCallback(
    async (text: string): Promise<boolean> => {
      let ok = false;
      try {
        if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
          ok = true;
        } else if (typeof document !== "undefined") {
          // Fallback for non-secure contexts (http:// over LAN, etc.)
          const ta = document.createElement("textarea");
          ta.value = text;
          ta.style.position = "fixed";
          ta.style.opacity = "0";
          document.body.appendChild(ta);
          ta.select();
          ok = document.execCommand("copy");
          document.body.removeChild(ta);
        }
      } catch {
        ok = false;
      }

      if (ok) {
        setCopied(true);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setCopied(false), resetMs);
      }
      return ok;
    },
    [resetMs],
  );

  return { copied, copy };
}
