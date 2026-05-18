"use client";

/**
 * /dev/matrix — viewport diagnostic page.
 *
 * Thin wrapper over `<ViewportMatrix />` from the pwa-safezone package.
 * Bump MATRIX_VERSION on every observable edit so the phone can verify
 * a hot-reload landed.
 *
 * The page mounts inside .sz-device-fullscreen so the matrix surface
 * anchors to the REAL device edges (top:0/left:0 + 100vw/100lvh) rather
 * than being clipped by <body>'s position:fixed; inset:0 bounds, which
 * on iOS PWA land at innerHeight (= svh) and would leave the home-
 * indicator zone unpainted — the exact black-strip artefact we hit.
 * overflow-auto restores scroll *inside* the device viewport.
 */

import { ViewportMatrix } from "pwa-safezone";

const MATRIX_VERSION = "v9-pkg-npm";

const CHAT_HEADER_PT_CSS =
  "max(calc(env(safe-area-inset-top) + 1.125rem), 2rem)";

export default function MatrixPage() {
  return (
    <div className="sz-device-fullscreen overflow-auto bg-[#0a0a0a]">
      <ViewportMatrix
        title="Viewport Matrix"
        version={MATRIX_VERSION}
        showReferenceStrips
        expressionUnderTest={{ label: "Chat header pt", css: CHAT_HEADER_PT_CSS }}
      />
    </div>
  );
}
