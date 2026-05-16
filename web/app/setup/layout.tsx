"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { Loader2 } from "lucide-react";

export default function SetupLayout({ children }: { children: React.ReactNode }) {
  const { needsSetup, user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;

    if (pathname === "/setup") {
      // Step 1: only accessible when no users exist
      if (!needsSetup) {
        // Redirect to /setup/connect (step 2) — it will forward to /chat
        // if GitHub is already connected
        router.replace(user ? "/setup/connect" : "/login");
      }
    }
    // /setup/connect is allowed if user is authenticated (just created account)
    // but we don't gate it here — the page itself handles redirect after completion
  }, [needsSetup, user, loading, router, pathname]);

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Block /setup if setup already done
  if (pathname === "/setup" && !needsSetup) {
    return null;
  }

  return <>{children}</>;
}
