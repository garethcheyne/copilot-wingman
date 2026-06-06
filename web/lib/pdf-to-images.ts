/**
 * Render PDF pages to base64 PNG data URLs using pdf.js.
 * Uses the vision pipeline — each page becomes an image_url content part.
 */

import * as pdfjsLib from "pdfjs-dist";

// Use the bundled worker for Next.js client-side
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

export interface PdfRenderOptions {
  /** Max pages to render (default: 10 to stay within token limits) */
  maxPages?: number;
  /** Scale factor for rendering (default: 1.5 — good balance of quality vs size) */
  scale?: number;
}

/**
 * Convert a PDF file to an array of base64 PNG data URLs (one per page).
 * Renders at 1.5x scale by default — enough for vision models to read text clearly.
 */
export async function pdfToImages(
  file: File,
  options: PdfRenderOptions = {}
): Promise<string[]> {
  const { maxPages = 10, scale = 1.5 } = options;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const pageCount = Math.min(pdf.numPages, maxPages);
  const images: string[] = [];

  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const ctx = canvas.getContext("2d")!;
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;

    // Convert to PNG data URL
    images.push(canvas.toDataURL("image/png"));

    // Clean up
    page.cleanup();
  }

  return images;
}

/** Check if a file is a PDF */
export function isPdf(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}
