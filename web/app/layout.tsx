import type { Metadata } from "next";
import { Geist, JetBrains_Mono, Bricolage_Grotesque } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { AuthProvider } from "@/components/auth-provider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  weight: ["500", "600", "700", "800"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Wingman",
  description: "Self-hosted Copilot proxy with chat UI",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${jetbrainsMono.variable} ${bricolage.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col relative">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          {/* Atmosphere — fixed, behind everything, non-interactive */}
          <div
            aria-hidden
            className="fixed inset-0 -z-10 bg-grid pointer-events-none"
          />
          <div
            aria-hidden
            className="fixed inset-0 -z-10 bg-grain pointer-events-none"
          />
          {/* faint vignette from the brand mesh, anchored top */}
          <div
            aria-hidden
            className="fixed inset-0 -z-10 pointer-events-none opacity-40 bg-vignette-copilot"
          />

          <div className="relative flex flex-col min-h-full">
            <AuthProvider>
              {children}
            </AuthProvider>
          </div>
          <Toaster richColors position="top-right" theme="dark" />
        </ThemeProvider>
      </body>
    </html>
  );
}
