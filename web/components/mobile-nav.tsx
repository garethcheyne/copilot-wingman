"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";

interface MobileNavValue {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const MobileNavContext = createContext<MobileNavValue | null>(null);

export function useMobileNav() {
  const ctx = useContext(MobileNavContext);
  if (!ctx) throw new Error("useMobileNav must be used inside MobileNavProvider");
  return ctx;
}

export function MobileNavProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Auto-close on route change so tapping a nav link dismisses the drawer.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock body scroll while the drawer is open on mobile.
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [open]);

  const value = useMemo(() => ({ open, setOpen }), [open]);

  return (
    <MobileNavContext.Provider value={value}>
      {children}
    </MobileNavContext.Provider>
  );
}

export function MobileNavTrigger({
  className = "",
  label = "Open navigation",
}: {
  className?: string;
  label?: string;
}) {
  const { setOpen } = useMobileNav();
  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => setOpen(true)}
      className={`inline-flex lg:hidden items-center justify-center w-10 h-10 -ml-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/50 active:scale-95 transition-all ${className}`}
    >
      <Menu className="w-5 h-5" />
    </button>
  );
}
