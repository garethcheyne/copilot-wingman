"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Wingman Fatal Error]", error);
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-dvh flex items-center justify-center bg-neutral-950 text-white font-sans">
        <div className="max-w-md text-center space-y-4 p-8">
          <h2 className="text-xl font-semibold">Something went wrong</h2>
          <p className="text-neutral-400 text-sm">
            {error.message || "A critical error occurred. Please refresh the page."}
          </p>
          <button
            onClick={reset}
            className="px-4 py-2 rounded-md bg-white text-black text-sm font-medium hover:bg-neutral-200 transition-colors"
          >
            Refresh
          </button>
        </div>
      </body>
    </html>
  );
}
