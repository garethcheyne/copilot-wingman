import { Settings } from "lucide-react";
import { AuthGate } from "@/components/auth-gate";
import { SessionProvider } from "@/components/session-provider";
import { SessionSidebar } from "@/components/session-sidebar";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGate>
    <SessionProvider>
    <div className="flex h-screen">
      <SessionSidebar />

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden">{children}</main>
    </div>
    </SessionProvider>
    </AuthGate>
  );
}
