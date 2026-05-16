import type { Metadata, Viewport } from "next";
import { Geist, JetBrains_Mono, Bricolage_Grotesque } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { AuthProvider } from "@/components/auth-provider";
import { ServiceWorkerRegistrar } from "@/components/service-worker-registrar";
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
  applicationName: "Wingman",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Wingman",
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/img/favicon.ico", sizes: "any" },
      { url: "/img/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/img/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: { url: "/img/apple-touch-icon.png", sizes: "180x180" },
    shortcut: "/img/favicon.ico",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1115" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "dark light",
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
          <ServiceWorkerRegistrar />
          <Toaster richColors position="top-right" theme="dark" />
        </ThemeProvider>
      </body>
    </html>
  );
}
