import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? files(full) : /\.(js|mjs)$/.test(entry.name) ? [full] : [];
  });
}
let failed = false;
for (const file of ['src', 'public', 'scripts', 'test', 'desktop'].flatMap((dir) =>
  files(path.join(root, dir)),
)) {
  const result = spawnSync(process.execPath, ['--check', file], {
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.status !== 0) failed = true;
}
if (failed) process.exitCode = 1;
else console.log('All JavaScript sources passed syntax checks.');
