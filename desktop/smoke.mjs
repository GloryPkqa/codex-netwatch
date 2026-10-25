import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'win32') throw new Error('The portable smoke test requires Windows.');
const root = path.resolve(
  process.argv[2] ||
    fileURLToPath(new URL('../data/windows-package-stage/codex-netwatch', import.meta.url)),
);
const exe = path.join(root, 'Codex-Netwatch.exe');
assert.ok(fs.existsSync(exe), 'Build the portable ZIP before running this test.');
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'netwatch-portable-'));
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const children = [];
let env, port, observedToken, smokeError;
async function freePort() {
  const server = http.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const value = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return value;
}
function launch(args = []) {
  const child = spawn(exe, ['--demo', '--no-browser', ...args], {
    cwd: root,
    env,
    stdio: 'ignore',
    windowsHide: true,
  });
  children.push(child);
  return child;
}
async function command(name) {
  const child = launch([name]);
  const done = once(child, 'exit');
  let timeout;
  try {
    const result = await Promise.race([
      done,
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`Tray control timeout: ${name}`)), 12000);
      }),
    ]);
    assert.equal(result[0], 0, `Tray control failed: ${name}`);
  } finally {
    clearTimeout(timeout);
  }
}
async function health() {
  try {
    const result = await fetch(`http://127.0.0.1:${port}/api/health`, {
      signal: AbortSignal.timeout(1000),
    });
    return result.ok ? await result.json() : null;
  } catch {
    return null;
  }
}
async function until(predicate, message, duration = 20000) {
  const end = Date.now() + duration;
  while (Date.now() < end) {
    if (await predicate()) return;
    await pause(100);
  }
  throw new Error(message);
}
try {
  port = await freePort();
  env = { ...process.env, NETWATCH_TEST_SILENT: '1', CODEX_FLOW_PORT: String(port), CODEX_FLOW_DATA_DIR: data };
  const host = launch();
  await until(
    async () => /^[a-f0-9]{64}$/.test((await health())?.desktopInstance || ''),
    'Desktop collector readiness timeout',
  );
  const first = await health();
  observedToken = first.desktopInstance;
  assert.equal(first.demo, true);
  assert.equal(first.app, 'codex-flow');
  assert.ok(fs.existsSync(path.join(data, 'demo', 'monitor.sqlite')));
  const result = await fetch(`http://127.0.0.1:${port}/api/stop`, {
    method: 'POST',
    headers: { 'X-Codex-Flow': '1' },
    body: '{}',
  });
  assert.equal(result.status, 403, 'Desktop stop must reject requests without the ownership token');
  const duplicate = launch();
  assert.equal((await once(duplicate, 'exit'))[0], 0);
  assert.equal((await health()).desktopInstance, first.desktopInstance);
  await command('--stop');
  await until(async () => !(await health()), 'Tray stop did not stop collector');
  assert.equal(host.exitCode, null, 'Stopping collector must retain the tray');
  // Closing the listening socket precedes the process-exit lock cleanup.
  // Wait for that separate completion condition before attempting a restart.
  await until(
    () => !fs.existsSync(path.join(data, 'demo', 'collector.lock')),
    'Stopped collector did not release its data-directory lock',
    6000,
  );
  await command('--start');
  await until(
    async () => (await health())?.desktopInstance === first.desktopInstance,
    'Tray restart failed',
  );
  const exit = once(host, 'exit');
  await command('--exit');
  await exit;
  assert.equal(host.exitCode, 0);
  await until(async () => !(await health()), 'Exiting tray left collector running');
  await until(
    () => !fs.existsSync(path.join(data, 'demo', 'collector.lock')),
    'Exited collector did not release its data-directory lock',
    6000,
  );

  let stopRequests = 0;
  const foreign = http.createServer((req, res) => {
    if (req.url === '/api/stop') stopRequests++;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        app: 'codex-flow',
        version: 'foreign-test',
        demo: true,
        desktopInstance: 'foreign-owner',
      }),
    );
  });
  await new Promise((resolve) => foreign.listen(port, '127.0.0.1', resolve));
  try {
    const attached = launch();
    // The foreign HTTP server is already ready; give the tray time to construct its controls.
    await pause(1000);
    await command('--stop');
    assert.equal(stopRequests, 0, 'Tray must never stop a pre-existing HTTP service');
    const attachedExit = once(attached, 'exit');
    await command('--exit');
    await attachedExit;
    assert.equal(stopRequests, 0);
    assert.equal((await health()).desktopInstance, 'foreign-owner');
  } finally {
    await new Promise((resolve) => foreign.close(resolve));
  }
  console.log(
    'Portable smoke: bundled runtime, own collector startup/stop/restart/exit, single instance, lock cleanup, and foreign-service safety passed.',
  );
} catch (error) {
  smokeError = error;
  throw error;
} finally {
  // Signal the exact tray/data-directory group before terminating any remaining test hosts.
  try {
    await command('--exit');
  } catch {
    /* No host remaining is expected. */
  }
  if (observedToken && (await health())?.desktopInstance === observedToken) {
    try {
      await fetch(`http://127.0.0.1:${port}/api/stop`, {
        method: 'POST',
        headers: { 'X-Codex-Flow': '1', 'X-Codex-Desktop-Token': observedToken },
        body: '{}',
        signal: AbortSignal.timeout(2000),
      });
      await until(async () => !(await health()), 'Test collector cleanup failed', 6000);
    } catch {
      /* Remaining exact test host handles are closed below. */
    }
  }
  for (const child of children) if (child.exitCode === null) child.kill();
  await pause(150);
  try { fs.rmSync(data, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); }
  catch (error) {
    if (!smokeError) throw error;
    console.error(`Test cleanup also failed: ${error.code}`);
  }
}
