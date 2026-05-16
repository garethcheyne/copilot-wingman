import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Wingman — Copilot Chat",
    short_name: "Wingman",
    description:
      "Self-hosted AI proxy and chat UI powered by your GitHub Copilot subscription.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#0f1115",
    theme_color: "#0f1115",
    categories: ["productivity", "developer", "utilities"],
    icons: [
      {
        src: "/wingman-ai.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/wingman-ai.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/wingman-ai.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "New chat",
        short_name: "New chat",
        description: "Open a fresh chat session",
        url: "/chat",
      },
      {
        name: "Admin",
        short_name: "Admin",
        description: "Open the admin dashboard",
        url: "/admin",
      },
    ],
  };
}
