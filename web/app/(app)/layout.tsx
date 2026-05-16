import { AuthGate } from "@/components/auth-gate";
import { SessionProvider } from "@/components/session-provider";
import { SessionSidebar } from "@/components/session-sidebar";
import { ConnectionProvider } from "@/components/connection-provider";
import { ElectricBorder } from "@/components/electric-border";
import { MobileNavProvider } from "@/components/mobile-nav";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGate>
    <ConnectionProvider>
    <SessionProvider>
    <MobileNavProvider>
    <ElectricBorder>
      <SessionSidebar />
      <main className="flex-1 flex flex-col overflow-hidden min-w-0">{children}</main>
    </ElectricBorder>
    </MobileNavProvider>
    </SessionProvider>
    </ConnectionProvider>
    </AuthGate>
  );
}
