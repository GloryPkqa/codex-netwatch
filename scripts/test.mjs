import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = fs
  .readdirSync(path.join(root, 'test'))
  .filter((name) => name.endsWith('.test.mjs'))
  .sort()
  .map((name) => path.join(root, 'test', name));
const result = spawnSync(
  process.execPath,
  ['--disable-warning=ExperimentalWarning', '--test', ...files],
  { stdio: 'inherit', windowsHide: true },
);
process.exitCode = result.status ?? 1;
