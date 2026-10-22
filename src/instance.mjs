import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

// One collector per data directory, independently of its HTTP port. An unknown
// lock is never removed automatically; only a demonstrably dead PID is reclaimed.
export function acquireInstance(dir, checkPid = (pid) => process.kill(pid, 0)) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'collector.lock');
  const identity = JSON.stringify({ pid: process.pid, token: randomUUID() });
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const fd = fs.openSync(file, 'wx', 0o600);
      try {
        fs.writeFileSync(fd, identity);
      } finally {
        fs.closeSync(fd);
      }
      let released = false;
      return {
        release() {
          if (released) return;
          released = true;
          try {
            if (fs.readFileSync(file, 'utf8') === identity) fs.unlinkSync(file);
          } catch {
            /* Already removed. */
          }
        },
      };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      let previous;
      try {
        previous = fs.readFileSync(file, 'utf8');
        const owner = JSON.parse(previous);
        if (!Number.isSafeInteger(owner.pid) || owner.pid < 1) throw new Error('Unknown owner');
        try {
          checkPid(owner.pid);
        } catch (failure) {
          if (failure.code !== 'ESRCH') throw failure;
          if (fs.readFileSync(file, 'utf8') === previous) fs.unlinkSync(file);
          continue;
        }
      } catch (failure) {
        if (failure.code === 'ENOENT') continue;
      }
      throw new Error(
        'This data directory already has a collector or an unverifiable collector.lock. Stop its monitor first, or use a separate CODEX_FLOW_DATA_DIR.',
      );
    }
  }
  throw new Error('Could not acquire collector.lock; another monitor may be starting.');
}
