"use client";

// `pwa-safezone` source files declare "use client", but tsup strips the
// banner when concatenating the bundle (an unavoidable bundler limitation
// for module-level directives). Re-exporting from this thin client wrapper
// restores the App Router boundary so the package's React pieces work as
// Client Components.

export {
  SafeAreaProvider,
  DynamicIslandZone,
  useSafeAreaInsets,
} from "pwa-safezone";
