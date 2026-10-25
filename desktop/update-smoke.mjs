import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Store } from '../src/store.mjs';

if (process.platform !== 'win32') throw new Error('Windows updater smoke requires Windows');
const source = path.resolve(process.argv[2] || fileURLToPath(new URL('../data/windows-package-stage/codex-netwatch', import.meta.url)));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'netwatch-update-smoke-'));
const root = path.join(temp, 'app'), data = path.join(temp, 'data');
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const headers = { 'X-Codex-Flow': '1' };
let env, exe, port, host, smokeError;
const workers = [];
async function until(predicate, message, ms = 75000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await predicate()) return; await pause(200); }
  throw new Error(message);
}
async function health() {
  try { return await (await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(3000) })).json(); } catch { return null; }
}
function launch(args = ['--no-browser']) { return spawn(exe, args, { cwd: root, env, windowsHide: true, stdio: 'ignore' }); }
async function stop() {
  if (!exe || !env) return;
  const command = launch(['--exit']);
  await until(() => command.exitCode !== null, 'Fixture exit request did not finish', 15000);
  await until(async () => !(await health()), 'Fixture collector did not stop', 15000);
  await pause(1000);
}
function prepare(version, broken = false, unsafe = false) {
  const job = fs.mkdtempSync(path.join(data, 'updates', 'upgrade-'));
  const stage = path.join(job, 'source', 'codex-netwatch');
  fs.cpSync(source, stage, { recursive: true, filter: (file) => !file.startsWith(path.join(source, 'data')) });
  const pkg = JSON.parse(fs.readFileSync(path.join(stage, 'package.json'))); pkg.version = version;
  fs.writeFileSync(path.join(stage, 'package.json'), JSON.stringify(pkg));
  fs.writeFileSync(path.join(stage, 'src', 'version.mjs'), `export const VERSION = '${version}';\n`);
  if (broken) fs.writeFileSync(path.join(stage, 'src', 'main.mjs'), 'process.exit(7);\n');
  const archive = path.join(job, 'codex-netwatch-windows-x64.zip');
  const zipScript = path.join(job, 'zip.ps1');
  fs.writeFileSync(zipScript, `param([string]$Source,[string]$Archive)\nAdd-Type -AssemblyName System.IO.Compression.FileSystem\n[IO.Compression.ZipFile]::CreateFromDirectory($Source,$Archive)\n${unsafe ? "$zip=[IO.Compression.ZipFile]::Open($Archive,'Update');$null=$zip.CreateEntry('codex-netwatch/../escape.txt');$zip.Dispose()" : ''}`);
  const zipped = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', zipScript, path.dirname(stage), archive], { windowsHide: true, encoding: 'utf8' });
  assert.equal(zipped.status, 0, zipped.stderr);
  fs.copyFileSync(path.join(source, 'scripts', 'install-update.ps1'), path.join(job, 'install-update.ps1'));
  return { job, archive, version };
}
async function install(fixture, current) {
  let info;
  await until(async () => { info = await health(); return info?.desktopInstance; }, 'Fixture became unavailable before update');
  const lock = JSON.parse(fs.readFileSync(path.join(data, 'collector.lock')));
  // After an upgrade the new host's PID is read from its collector command environment
  // indirectly via the exact executable path; there is only one fixture instance.
  const pidResult = spawnSync('powershell.exe', ['-NoProfile', '-Command', '(Get-CimInstance Win32_Process -Filter "Name=\'Codex-Netwatch.exe\'" | Where-Object { $_.ExecutablePath -and [IO.Path]::GetFullPath($_.ExecutablePath) -eq [IO.Path]::GetFullPath($env:NETWATCH_FIXTURE_EXE) }).ProcessId'],
    { env: { ...env, NETWATCH_FIXTURE_EXE: exe }, windowsHide: true, encoding: 'utf8' });
  const pids = pidResult.stdout.trim().split(/\s+/).map(Number);
  assert.equal(pids.length, 1); assert.ok(pids[0] > 0);
  const plan = { root, dataDir: data, archive: fixture.archive, sha256: createHash('sha256').update(fs.readFileSync(fixture.archive)).digest('hex'),
    version: fixture.version, currentVersion: current, port, hostPid: pids[0], collectorPid: lock.pid, instance: info.desktopInstance };
  const planFile = path.join(fixture.job, 'plan.json'); fs.writeFileSync(planFile, JSON.stringify(plan));
  const worker = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(fixture.job, 'install-update.ps1'), '-Plan', planFile],
    { cwd: fixture.job, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  workers.push(worker);
  let log = ''; worker.stdout.on('data', (x) => { log += x; }); worker.stderr.on('data', (x) => { log += x; });
  await until(() => worker.exitCode !== null, `Updater did not finish: ${log}`, 180000);
  return JSON.parse(fs.readFileSync(path.join(fixture.job, 'result.json')));
}
try {
  fs.cpSync(source, root, { recursive: true, filter: (file) => !file.startsWith(path.join(source, 'data')) });
  fs.mkdirSync(path.join(data, 'updates'), { recursive: true });
  fs.mkdirSync(path.join(temp, 'empty-codex'));
  fs.writeFileSync(path.join(root, 'config.local.json'), JSON.stringify({ captureMode: 'mihomo', controller: 'http://127.0.0.1:9', codexHome: path.join(temp, 'empty-codex'), processNames: [] }));
  const store = new Store(data);
  store.set('budget', { dailyGB: 5, monthlyGB: 50, warnPercent: 80, scope: 'all', desktopNotify: false });
  store.record({ at: Date.now() - 3600000, duration: 1000, codexUp: 123, codexDown: 456, allUp: 789, allDown: 1000,
    unknownUp: 0, unknownDown: 0, activeSessions: [], rows: [] }); store.close();
  const listener = http.createServer(); await new Promise((r) => listener.listen(0, '127.0.0.1', r));
  port = listener.address().port; await new Promise((r) => listener.close(r));
  env = { ...process.env, NETWATCH_TEST_SILENT: '1', CODEX_FLOW_PORT: String(port), CODEX_FLOW_DATA_DIR: data, CODEX_HOME: path.join(temp, 'empty-codex') };
  exe = path.join(root, 'Codex-Netwatch.exe'); host = launch();
  await until(async () => (await health())?.desktopInstance, 'Fixture host did not start');
  const version = (await health()).version;
  const parts = version.split('.').map(Number); parts[2]++; const next = parts.join('.'); parts[2]++; const brokenVersion = parts.join('.');
  const before = fs.readFileSync(path.join(root, 'config.local.json'), 'utf8');
  const rejected = await install(prepare(next, false, true), version);
  assert.equal(rejected.state, 'failed'); assert.match(rejected.error, /ZIP/);
  assert.equal((await health()).version, version, 'Unsafe ZIP must leave the running app untouched');
  console.log('Updater fixture: unsafe ZIP rejected; starting successful-upgrade case.');
  const success = await install(prepare(next), version);
  assert.equal(success.state, 'completed', JSON.stringify(success));
  assert.equal((await health()).version, next);
  assert.ok(fs.existsSync(path.join(success.backup, 'data', 'monitor.sqlite')));
  assert.equal(fs.readFileSync(path.join(root, 'config.local.json'), 'utf8'), before);
  const result = await (await fetch(`http://127.0.0.1:${port}/api/dashboard`, { headers })).json();
  assert.equal(result.budget.settings.monthlyGB, 50);
  console.log('Updater fixture: upgrade and data preservation passed; starting rollback case.');
  const failed = await install(prepare(brokenVersion, true), next);
  assert.equal(failed.state, 'rolled_back', JSON.stringify(failed));
  await until(async () => (await health())?.version === next, 'Rollback did not restore a running previous version');
  const restored = new Store(data);
  assert.equal(restored.totals(0, Date.now()).codex_up, 123);
  assert.equal(restored.get('budget', {}).monthlyGB, 50); restored.close();
  console.log('Updater smoke passed: ZIP traversal rejected before shutdown; upgrade preserves SQLite/config/budgets; failed launch rolls back and restarts.');
} catch (error) { smokeError = error; throw error;
} finally {
  for (const worker of workers) if (worker.exitCode === null) worker.kill();
  await stop();
  if (host?.exitCode === null) host.kill();
  const resolved = path.resolve(temp);
  assert.ok(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(resolved).startsWith('netwatch-update-smoke-'));
  try { fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 20, retryDelay: 300 }); }
  catch (error) { if (!smokeError) throw error; console.error(`Fixture cleanup also failed: ${error.code}`); }
}
