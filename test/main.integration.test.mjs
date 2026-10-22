import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
const main = fileURLToPath(new URL('../src/main.mjs', import.meta.url));
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function freePort() {
  const server = http.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}
async function ready(port, child) {
  const end = Date.now() + 15000;
  while (Date.now() < end) {
    if (child.exitCode !== null) throw new Error('Monitor exited before readiness');
    try {
      const result = await fetch(`http://127.0.0.1:${port}/api/dashboard?range=all`, {
        headers: { 'X-Codex-Flow': '1' },
        signal: AbortSignal.timeout(1000),
      });
      if (result.ok) {
        const data = await result.json();
        if (data.totals.samples >= 2) return data;
      }
    } catch {
      /* Startup polling only, bounded above. */
    }
    await pause(100);
  }
  throw new Error('Monitor readiness timeout');
}
test(
  'real main process isolates demo data, rejects duplicate writers, and stops cleanly',
  { timeout: 35000 },
  async (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-flow-main-'));
    const children = [];
    t.after(async () => {
      for (const child of children)
        if (child.exitCode === null) {
          const done = once(child, 'close');
          child.kill();
          await done;
        }
      fs.rmSync(dir, { recursive: true, force: true });
    });
    const port1 = await freePort(),
      port2 = await freePort();
    function launch(port) {
      const child = spawn(
        process.execPath,
        ['--disable-warning=ExperimentalWarning', main, '--demo'],
        {
          windowsHide: true,
          env: { ...process.env, CODEX_FLOW_PORT: String(port), CODEX_FLOW_DATA_DIR: dir },
          stdio: ['ignore', 'ignore', 'pipe'],
        },
      );
      children.push(child);
      return child;
    }
    const first = launch(port1);
    const data = await ready(port1, first);
    assert.equal(data.status.demo, true);
    assert.ok(data.totals.codex_up > 0);
    assert.equal(fs.existsSync(path.join(dir, 'monitor.sqlite')), false);
    assert.equal(fs.existsSync(path.join(dir, 'demo', 'monitor.sqlite')), true);
    const duplicate = launch(port2);
    let errors = '';
    duplicate.stderr.on('data', (chunk) => (errors += chunk.toString()));
    const [duplicateCode] = await once(duplicate, 'close');
    assert.equal(duplicateCode, 1);
    assert.match(errors, /already has a collector/);
    const firstExit = once(first, 'close');
    assert.equal(
      (
        await fetch(`http://127.0.0.1:${port1}/api/stop`, {
          method: 'POST',
          headers: { 'X-Codex-Flow': '1' },
          body: '{}',
        })
      ).status,
      200,
    );
    await firstExit;
    assert.equal(fs.existsSync(path.join(dir, 'demo', 'collector.lock')), false);
    const restarted = launch(port2);
    await ready(port2, restarted);
    const restartExit = once(restarted, 'close');
    await fetch(`http://127.0.0.1:${port2}/api/stop`, {
      method: 'POST',
      headers: { 'X-Codex-Flow': '1' },
      body: '{}',
    });
    await restartExit;
  },
);
