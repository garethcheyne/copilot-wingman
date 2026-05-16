// Compatibility shim — the old single-file schema applier has been replaced
// by a versioned migration runner. This file just delegates so any existing
// tooling (older upgradeWingman.sh, docs, CI jobs) keeps working.
//
// New code should call `node scripts/migrate.mjs` directly, or
// `npm run migrate` from inside the proxy container.

import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const runner = resolve(__dirname, 'migrate.mjs');

const child = spawn(process.execPath, [runner, ...process.argv.slice(2)], {
  stdio: 'inherit',
});
child.on('exit', (code) => process.exit(code ?? 0));

