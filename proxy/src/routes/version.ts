import { Router } from 'express';
import type { Request, Response } from 'express';
import { readFileSync } from 'fs';
import { resolve } from 'path';

export const versionRouter = Router();

// Read version once at startup — file is at /app/VERSION in container, or ../../VERSION in dev
const VERSION = (() => {
  const paths = [
    resolve(import.meta.dirname, '../../VERSION'),       // dev: src/routes -> ../../VERSION
    resolve(import.meta.dirname, '../../../VERSION'),    // compiled: dist/routes -> ../../../VERSION
    '/app/VERSION',                                      // container fallback
  ];
  for (const p of paths) {
    try { return readFileSync(p, 'utf-8').trim(); } catch {}
  }
  return '0.0.0';
})();

const GITHUB_REPO = 'garethcheyne/copilot-wingman';

interface ReleaseInfo {
  tag: string;
  name: string;
  published_at: string;
  html_url: string;
  body: string;
}

// Cache latest release for 5 minutes
let releaseCache: { data: ReleaseInfo | null; fetchedAt: number } = { data: null, fetchedAt: 0 };
const CACHE_TTL = 5 * 60 * 1000;

async function fetchLatestRelease(): Promise<ReleaseInfo | null> {
  const now = Date.now();
  if (releaseCache.data && now - releaseCache.fetchedAt < CACHE_TTL) {
    return releaseCache.data;
  }

  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': 'Wingman/' + VERSION },
    });

    if (!res.ok) {
      // No releases yet or rate limited
      releaseCache = { data: null, fetchedAt: now };
      return null;
    }

    const data = await res.json();
    const release: ReleaseInfo = {
      tag: data.tag_name?.replace(/^v/, '') ?? '',
      name: data.name ?? '',
      published_at: data.published_at ?? '',
      html_url: data.html_url ?? '',
      body: data.body ?? '',
    };
    releaseCache = { data: release, fetchedAt: now };
    return release;
  } catch {
    return releaseCache.data;
  }
}

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

/**
 * GET /api/admin/version
 * Returns current version and checks for updates.
 */
versionRouter.get('/', async (_req: Request, res: Response): Promise<void> => {
  const latest = await fetchLatestRelease();

  const updateAvailable = latest ? compareVersions(latest.tag, VERSION) > 0 : false;

  res.json({
    current: VERSION,
    latest: latest ? {
      version: latest.tag,
      name: latest.name,
      published_at: latest.published_at,
      url: latest.html_url,
      changelog: latest.body,
    } : null,
    updateAvailable,
  });
});

/**
 * POST /api/admin/version/upgrade
 * Triggers a self-upgrade by pulling latest and restarting.
 * This relies on docker-compose being available in the container context.
 */
versionRouter.post('/upgrade', async (_req: Request, res: Response): Promise<void> => {
  const latest = await fetchLatestRelease();
  if (!latest || compareVersions(latest.tag, VERSION) <= 0) {
    res.json({ status: 'up-to-date', current: VERSION });
    return;
  }

  // Return immediately — the upgrade will restart the containers
  res.json({
    status: 'upgrading',
    from: VERSION,
    to: latest.tag,
    message: 'Pulling latest images and restarting. The app will be briefly unavailable.',
  });

  // Kick off upgrade in background after response is sent
  setTimeout(async () => {
    const { exec } = await import('child_process');
    exec(
      'cd /app && git pull origin main && docker compose pull && docker compose up -d --build',
      { timeout: 120000 },
      (err) => {
        if (err) console.error('[Upgrade] Failed:', err.message);
        else console.log('[Upgrade] Complete — containers restarting');
      }
    );
  }, 500);
});
