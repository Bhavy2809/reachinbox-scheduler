// Cross-platform test runner: compile with tsc, then run every *.test.js with Node's
// built-in test runner, one file at a time (they share one test database).
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const tsc = require.resolve('typescript/bin/tsc');

execFileSync(process.execPath, [tsc, '-p', 'tsconfig.test.json'], { stdio: 'inherit' });
mkdirSync('dist-test/src/db', { recursive: true });
copyFileSync('src/db/schema.sql', 'dist-test/src/db/schema.sql');

const dir = 'dist-test/test';
const only = process.argv[2]; // optional filter, e.g. `npm test -- rateLimiter`
const files = readdirSync(dir)
  .filter((f) => f.endsWith('.test.js') && (!only || f.includes(only)))
  .map((f) => path.join(dir, f));

const res = spawnSync(
  process.execPath,
  ['--env-file=test/test.env', '--test', '--test-concurrency=1', ...files],
  { stdio: 'inherit' },
);
process.exit(res.status ?? 1);
