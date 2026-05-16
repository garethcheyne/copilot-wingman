"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { Loader2 } from "lucide-react";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, needsSetup, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    if (needsSetup) {
      router.replace("/setup");
    } else if (!user) {
      router.replace("/login");
    }
  }, [user, needsSetup, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (needsSetup || !user) {
    return null;
  }

  return <>{children}</>;
}
