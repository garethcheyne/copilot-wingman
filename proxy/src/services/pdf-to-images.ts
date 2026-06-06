import { execFileSync } from 'child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const MAX_PAGES = 5;
const DPI = 150;

/**
 * Checks whether a data URL contains a PDF.
 */
function isPdfDataUrl(dataUrl: string): boolean {
  return dataUrl.startsWith('data:application/pdf');
}

/**
 * Converts a base64 PDF data URL into an array of base64 PNG data URLs (one per page).
 * Uses pdftoppm (poppler-utils) for reliable server-side rendering.
 */
async function pdfToImages(
  pdfDataUrl: string,
  options?: { maxPages?: number; dpi?: number }
): Promise<string[]> {
  const maxPages = options?.maxPages ?? MAX_PAGES;
  const dpi = options?.dpi ?? DPI;

  // Extract the raw base64 from the data URL
  const base64Match = pdfDataUrl.match(/^data:[^;]+;base64,(.+)$/);
  if (!base64Match) {
    throw new Error('Invalid PDF data URL format');
  }

  const tmpDir = mkdtempSync(join(tmpdir(), 'pdf-'));
  const pdfPath = join(tmpDir, 'input.pdf');
  const outPrefix = join(tmpDir, 'page');

  try {
    writeFileSync(pdfPath, Buffer.from(base64Match[1], 'base64'));

    execFileSync('pdftoppm', [
      '-png',
      '-r', String(dpi),
      '-f', '1',
      '-l', String(maxPages),
      pdfPath,
      outPrefix,
    ], { timeout: 30_000 });

    // Read generated PNGs in order
    const files = readdirSync(tmpDir)
      .filter(f => f.startsWith('page-') && f.endsWith('.png'))
      .sort();

    const images: string[] = [];
    for (const file of files) {
      const png = readFileSync(join(tmpDir, file));
      images.push(`data:image/png;base64,${png.toString('base64')}`);
    }

    return images;
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

/**
 * Processes an images array — any PDF data URLs are expanded into per-page PNGs.
 * Non-PDF entries pass through unchanged.
 */
export async function expandPdfsInImages(images: string[]): Promise<string[]> {
  const result: string[] = [];

  for (const item of images) {
    if (isPdfDataUrl(item)) {
      const pages = await pdfToImages(item);
      result.push(...pages);
    } else {
      result.push(item);
    }
  }

  // Cap at 8 total images (model limit)
  return result.slice(0, 8);
}
