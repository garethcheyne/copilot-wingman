import { AuthGate } from "@/components/auth-gate";
import { SessionProvider } from "@/components/session-provider";
import { SessionSidebar } from "@/components/session-sidebar";
import { ConnectionProvider } from "@/components/connection-provider";
import { ElectricBorder } from "@/components/electric-border";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGate>
    <ConnectionProvider>
    <SessionProvider>
    <ElectricBorder>
      <SessionSidebar />
      <main className="flex-1 flex flex-col overflow-hidden">{children}</main>
    </ElectricBorder>
    </SessionProvider>
    </ConnectionProvider>
    </AuthGate>
  );
}
