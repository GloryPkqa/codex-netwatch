import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { once } from 'node:events';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const columns = ['codex_up', 'codex_down', 'all_up', 'all_down', 'unknown_up', 'unknown_down'];
const zero = () => Object.fromEntries(columns.map((key) => [key, 0]));

export function durationMs(value) {
  const match = /^(\d+(?:\.\d+)?)(ms|s|m|h)?$/.exec(String(value));
  if (!match) throw new Error(`Invalid duration: ${value}`);
  return Number(match[1]) * { ms: 1, s: 1000, m: 60000, h: 3600000 }[match[2] || 's'];
}

export function parseOptions(args = []) {
  const options = {
    durationMs: 60000,
    connections: 300,
    intervalMs: 1000,
    checkpointMs: 30000,
    outageEveryMs: 60000,
    outageForMs: 2500,
    restartEveryMs: 1800000,
    output: '',
    workDir: '',
  };
  const durations = {
    '--duration': 'durationMs',
    '--interval': 'intervalMs',
    '--checkpoint-every': 'checkpointMs',
    '--outage-every': 'outageEveryMs',
    '--outage-for': 'outageForMs',
    '--restart-every': 'restartEveryMs',
  };
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (key === '--help') return { help: true };
    const value = args[++i];
    if (value === undefined) throw new Error(`Missing value for ${key}`);
    if (durations[key]) options[durations[key]] = durationMs(value);
    else if (key === '--hours') options.durationMs = Number(value) * 3600000;
    else if (key === '--connections') options.connections = Number(value);
    else if (key === '--output') options.output = path.resolve(value);
    else if (key === '--work-dir') options.workDir = path.resolve(value);
    else throw new Error(`Unknown option: ${key}`);
  }
  if (
    !Number.isFinite(options.durationMs) ||
    options.durationMs < 3000 ||
    options.durationMs > 168 * 3600000
  )
    throw new Error('Duration must be 3 seconds–168 hours');
  for (const key of ['checkpointMs', 'outageEveryMs', 'outageForMs', 'restartEveryMs'])
    if (!Number.isFinite(options[key]) || options[key] > 168 * 3600000)
      throw new Error('Fault and checkpoint periods must be finite and no longer than 168 hours');
  if (
    !Number.isInteger(options.connections) ||
    options.connections < 3 ||
    options.connections > 2000
  )
    throw new Error('Connections must be an integer from 3 to 2000');
  if (
    options.intervalMs < 500 ||
    options.intervalMs > 10000 ||
    !Number.isInteger(options.intervalMs)
  )
    throw new Error('Interval must be 500 ms–10 seconds');
  if (options.checkpointMs < 500 || options.checkpointMs > 300000)
    throw new Error('Checkpoints must be 500 ms–5 minutes apart');
  if (options.outageEveryMs <= options.outageForMs || options.outageForMs < options.intervalMs)
    throw new Error('Outage duration must cover a polling interval and be shorter than its period');
  if (options.restartEveryMs < 3000) throw new Error('Restart interval must be at least 3 seconds');
  return options;
}

// A deliberately separate oracle: no Accounting/Store/Monitor implementation is imported.
// Prefix totals allow one response in flight while a running collector is audited.
export class CounterOracle {
  constructor() {
    this.prefix = [zero()];
    this.previous = new Map();
    this.global = null;
    this.baseline = true;
  }
  reset() {
    this.previous.clear();
    this.global = null;
    this.baseline = true;
  }
  record(snapshot, now) {
    const total = { ...this.prefix.at(-1) };
    const delta = (current, previous) => (current >= previous ? current - previous : current);
    for (const connection of snapshot.connections) {
      const key = `${connection.id}:${connection.start}`;
      const old = this.previous.get(key);
      const fresh = !this.baseline && !old;
      const up = old ? delta(connection.upload, old.up) : fresh ? connection.upload : 0;
      const down = old ? delta(connection.download, old.down) : fresh ? connection.download : 0;
      const name = connection.metadata.process;
      const scope = name === 'codex.exe' ? 'codex' : name ? 'other' : 'unknown';
      if (scope !== 'other') {
        total[`${scope}_up`] += up;
        total[`${scope}_down`] += down;
      }
      this.previous.set(key, { up: connection.upload, down: connection.download, at: now });
    }
    if (this.global) {
      total.all_up += delta(snapshot.uploadTotal, this.global.up);
      total.all_down += delta(snapshot.downloadTotal, this.global.down);
    }
    this.global = { up: snapshot.uploadTotal, down: snapshot.downloadTotal };
    this.baseline = false;
    for (const [key, value] of this.previous)
      if (now - value.at > 120000) this.previous.delete(key);
    this.prefix.push(total);
  }
}

export class FixtureWorkload {
  constructor(count) {
    this.count = count;
    this.tick = 0;
    this.uploadTotal = 0;
    this.downloadTotal = 0;
    this.rows = new Map();
    this.stats = {
      snapshots: 0,
      shortConnections: 0,
      counterResets: 0,
      globalResets: 0,
      failures503: 0,
    };
  }
  snapshot(now = Date.now()) {
    this.tick++;
    const connections = [];
    const shortCount = Math.max(1, Math.floor(this.count / 30));
    for (let slot = 0; slot < this.count; slot++) {
      const short = slot >= this.count - shortCount;
      const epoch = short ? Math.floor(this.tick / 7) : 0;
      const id = `fixture-${slot}-${epoch}`;
      let row = this.rows.get(id);
      if (!row) {
        row = {
          id,
          start: new Date(now).toISOString(),
          upload: 0,
          download: 0,
          metadata: {
            host: `synthetic-${slot % 8}.invalid`,
            network: 'tcp',
            ...(slot % 3 === 0
              ? { process: 'codex.exe' }
              : slot % 3 === 1
                ? { process: 'fixture-browser.exe' }
                : {}),
          },
          rule: 'Synthetic stability fixture',
        };
        this.rows.set(id, row);
        if (short) this.stats.shortConnections++;
      }
      const up = 211 + (slot % 37);
      const down = 89 + (slot % 23);
      if (this.tick % 17 === 0 && slot === Math.floor(this.tick / 17) % (this.count - shortCount)) {
        row.upload = 17;
        row.download = 11;
        this.stats.counterResets++;
      } else {
        row.upload += up;
        row.download += down;
      }
      this.uploadTotal += up;
      this.downloadTotal += down;
      connections.push({ ...row, metadata: { ...row.metadata } });
    }
    if (this.tick % 23 === 0) {
      this.uploadTotal = 37;
      this.downloadTotal = 19;
      this.stats.globalResets++;
    }
    const active = new Set(connections.map((row) => row.id));
    for (const key of this.rows.keys()) if (!active.has(key)) this.rows.delete(key);
    this.stats.snapshots++;
    return { uploadTotal: this.uploadTotal, downloadTotal: this.downloadTotal, connections };
  }
}

function atomicJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.tmp`, `${JSON.stringify(data, null, 2)}\n`);
  fs.renameSync(`${file}.tmp`, file);
}

function freezeApp(sourceRoot, target) {
  const hash = crypto.createHash('sha256');
  for (const folder of ['src', 'public', 'scripts']) {
    const copy = (relative) => {
      const source = path.join(sourceRoot, relative);
      if (fs.statSync(source).isDirectory()) {
        fs.mkdirSync(path.join(target, relative), { recursive: true });
        for (const entry of fs.readdirSync(source).sort()) copy(path.join(relative, entry));
      } else {
        const content = fs.readFileSync(source);
        hash.update(relative.replaceAll('\\', '/')).update(content);
        fs.writeFileSync(path.join(target, relative), content);
      }
    };
    copy(folder);
  }
  const packageBytes = fs.readFileSync(path.join(sourceRoot, 'package.json'));
  hash.update('package.json').update(packageBytes);
  fs.writeFileSync(path.join(target, 'package.json'), packageBytes);
  return hash.digest('hex');
}

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return server.address().port;
}

async function availablePort() {
  const server = http.createServer();
  const port = await listen(server);
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function jsonRequest(port, route, method = 'GET') {
  const response = await fetch(`http://127.0.0.1:${port}${route}`, {
    method,
    headers: { 'X-Codex-Flow': '1' },
    ...(method === 'POST' ? { body: '{}' } : {}),
    signal: AbortSignal.timeout(3000),
  });
  if (!response.ok) throw new Error(`Local API returned ${response.status}`);
  return response.json();
}

function bytesOnDisk(dir) {
  return ['monitor.sqlite', 'monitor.sqlite-wal', 'monitor.sqlite-shm'].reduce((sum, file) => {
    try {
      return sum + fs.statSync(path.join(dir, file)).size;
    } catch {
      return sum;
    }
  }, 0);
}

async function collectorMemory(pid) {
  if (process.platform === 'win32') {
    // Keep serving fixture responses while PowerShell starts, especially on busy CI hosts.
    // A synchronous process here can time out the collector and invalidate the byte oracle.
    try {
      const result = await promisify(execFile)(
        'powershell.exe',
        [
          '-NoLogo',
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          `$p=Get-Process -Id ${Number(pid)} -ErrorAction Stop; [string]$p.WorkingSet64`,
        ],
        { windowsHide: true, encoding: 'utf8', timeout: 5000 },
      );
      const rss = Number(result.stdout?.trim());
      return Number.isFinite(rss) ? rss : null;
    } catch {
      return null;
    }
  }
  if (process.platform === 'linux') {
    try {
      const line = fs.readFileSync(`/proc/${pid}/status`, 'utf8').match(/^VmRSS:\s+(\d+) kB$/m);
      return line ? Number(line[1]) * 1024 : null;
    } catch {
      return null;
    }
  }
  return null;
}

export function auditDatabase(dir, oracle, fullIntegrity = false, intervalMs = 1000) {
  const db = new DatabaseSync(path.join(dir, 'monitor.sqlite'), { readOnly: true });
  try {
    db.exec('PRAGMA busy_timeout=3000; BEGIN');
    const totals = db
      .prepare(
        `SELECT COUNT(*) AS samples, MIN(at) AS firstAt, MAX(at) AS lastAt,
      COALESCE(SUM(CASE WHEN duration>0 AND duration<=? THEN duration ELSE 0 END),0) AS observedSamplingMs,
      COALESCE(MAX(duration),0) AS largestSampleIntervalMs,
      ${columns.map((key) => `COALESCE(SUM(${key}),0) AS ${key}`).join(', ')} FROM samples`,
      )
      .get(intervalMs * 2);
    const expected = oracle.prefix[totals.samples];
    const errors = [];
    if (!expected) errors.push('More persisted samples than successful fixture responses');
    else
      for (const key of columns)
        if (totals[key] !== expected[key])
          errors.push(`${key}: expected ${expected[key]}, got ${totals[key]}`);
    const bucket = db
      .prepare(
        "SELECT COALESCE(SUM(up),0) AS up, COALESCE(SUM(down),0) AS down FROM buckets WHERE scope='codex'",
      )
      .get();
    if (bucket.up !== totals.codex_up || bucket.down !== totals.codex_down)
      errors.push('Connection buckets disagree with sample totals');
    const invalid = db
      .prepare(
        `SELECT COUNT(*) AS count FROM samples WHERE duration<0 OR ${columns.map((key) => `${key}<0`).join(' OR ')}`,
      )
      .get().count;
    if (invalid) errors.push('Negative counters or sampling durations persisted');
    const integrity = fullIntegrity
      ? db.prepare('PRAGMA integrity_check').get().integrity_check
      : db.prepare('PRAGMA quick_check').get().quick_check;
    if (integrity !== 'ok') errors.push('SQLite integrity check failed');
    db.exec('COMMIT');
    return { ...totals, expectedResponses: oracle.prefix.length - 1, integrity, errors };
  } finally {
    db.close();
  }
}

export async function runStability(options, sourceRoot = root) {
  const id = new Date().toISOString().replaceAll(/[:.]/g, '-');
  const workDir = options.workDir || path.join(sourceRoot, 'data', `stability-${id}`);
  const output = options.output || path.join(workDir, 'report.json');
  const normalizedWork = path.resolve(workDir).toLowerCase();
  const normalizedRoot = path.resolve(sourceRoot).toLowerCase();
  if (
    normalizedWork === normalizedRoot ||
    ['src', 'public', 'scripts', 'test', '.git'].some((folder) => {
      const forbidden = path.join(normalizedRoot, folder);
      return normalizedWork === forbidden || normalizedWork.startsWith(`${forbidden}${path.sep}`);
    })
  )
    throw new Error('Work directory must be outside the source folders');
  if (fs.existsSync(workDir) && fs.readdirSync(workDir).length)
    throw new Error('Work directory must be new or empty; existing runs are preserved');
  fs.mkdirSync(workDir, { recursive: true });
  const appDir = path.join(workDir, 'frozen-app');
  const dataDir = path.join(workDir, 'collector-data');
  const codexHome = path.join(workDir, 'empty-codex-home');
  fs.mkdirSync(codexHome);
  const sourceHash = freezeApp(sourceRoot, appDir);
  const oracle = new CounterOracle();
  const fixture = new FixtureWorkload(options.connections);
  const failures = [];
  const interruptions = [];
  const startedAt = new Date().toISOString();
  const started = performance.now();
  let child,
    monitorPort,
    interrupted = false,
    restarts = 0,
    previousSamples = 0;
  let unexpectedExit = '';
  const expectedStops = new WeakSet();
  let maximumRssBytes = 0,
    currentRssBytes = null,
    maximumDatabaseBytes = 0,
    maximumDashboardLatencyMs = 0;
  let maximumLoopPauseMs = 0,
    maximumCheckpointGapMs = 0,
    previousCheckpointAt = null;
  let lastCheckpoint, database, lastStatus;
  const checkpoints = path.join(workDir, 'checkpoints.jsonl');
  const shouldStop = () => {
    interrupted = true;
  };
  process.once('SIGINT', shouldStop);
  process.once('SIGTERM', shouldStop);
  let quiescing = false;
  const heldResponses = new Set();
  const server = http.createServer((req, res) => {
    if (req.url !== '/connections') {
      res.writeHead(404).end();
      return;
    }
    if (quiescing) {
      // Stop serving new snapshots before auditing a graceful shutdown. A response
      // already served must be committed; a request still waiting has no sample yet.
      heldResponses.add(res);
      res.once('close', () => heldResponses.delete(res));
      return;
    }
    const elapsed = performance.now() - started;
    const phase = elapsed % options.outageEveryMs;
    if (elapsed >= options.outageEveryMs && phase < options.outageForMs) {
      fixture.stats.failures503++;
      oracle.reset();
      res.writeHead(503).end('Synthetic outage');
      return;
    }
    const now = Date.now();
    const snapshot = fixture.snapshot(now);
    oracle.record(snapshot, now);
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(snapshot));
  });
  const fixturePort = await listen(server);
  fs.writeFileSync(
    path.join(appDir, 'config.local.json'),
    JSON.stringify({
      intervalMs: options.intervalMs,
      alertMBPerMinute: 1000000,
      controller: `http://127.0.0.1:${fixturePort}`,
    }),
  );
  const launch = async () => {
    quiescing = false;
    oracle.reset();
    const samplesBeforeLaunch = oracle.prefix.length - 1;
    monitorPort = await availablePort();
    const stdout = fs.openSync(path.join(workDir, 'collector.stdout.log'), 'a');
    const stderr = fs.openSync(path.join(workDir, 'collector.stderr.log'), 'a');
    child = spawn(
      process.execPath,
      ['--disable-warning=ExperimentalWarning', path.join(appDir, 'src', 'main.mjs')],
      {
        cwd: appDir,
        windowsHide: true,
        env: {
          ...process.env,
          CODEX_HOME: codexHome,
          CODEX_FLOW_DATA_DIR: dataDir,
          CODEX_FLOW_CONTROLLER: `http://127.0.0.1:${fixturePort}`,
          CODEX_FLOW_PORT: String(monitorPort),
          MIHOMO_SECRET: '',
          CODEX_NETWATCH_DESKTOP_TOKEN: '',
        },
        stdio: ['ignore', stdout, stderr],
      },
    );
    fs.closeSync(stdout);
    fs.closeSync(stderr);
    const launchedChild = child;
    child.once('exit', () => {
      if (!expectedStops.has(launchedChild))
        unexpectedExit = 'Collector exited without a requested restart or stop';
    });
    let spawnError;
    child.once('error', (error) => {
      spawnError = error;
    });
    const deadline = performance.now() + 15000;
    while (performance.now() < deadline) {
      if (spawnError || child.exitCode !== null) throw new Error('Collector exited during startup');
      try {
        const status = await jsonRequest(monitorPort, '/api/dashboard?range=all');
        if (status.totals.samples > samplesBeforeLaunch) return;
      } catch {
        /* Bounded startup wait; fixture may be in a scheduled outage. */
      }
      await pause(100);
    }
    throw new Error('Collector readiness timeout');
  };
  const stop = async () => {
    if (!child || child.exitCode !== null) return;
    quiescing = true;
    const drainDeadline = performance.now() + 1500;
    try {
      while (performance.now() < drainDeadline) {
        const persisted = auditDatabase(dataDir, oracle, false, options.intervalMs);
        if (persisted.errors.length || persisted.samples === oracle.prefix.length - 1) break;
        await pause(25);
      }
    } catch {
      /* Final auditing reports errors; cleanup must still stop the child. */
    }
    expectedStops.add(child);
    const done = once(child, 'exit');
    try {
      await jsonRequest(monitorPort, '/api/stop', 'POST');
    } catch {
      child.kill();
    }
    let stopTimer;
    const exited = await Promise.race([
      done.then(() => true),
      new Promise((resolve) => {
        stopTimer = setTimeout(() => resolve(false), 5000);
      }),
    ]).finally(() => clearTimeout(stopTimer));
    if (!exited) {
      child.kill('SIGKILL');
      await done;
      throw new Error('Collector did not stop gracefully within 5 seconds');
    }
    if (child.exitCode !== 0) throw new Error('Collector exited with a nonzero status');
    for (const response of heldResponses) response.destroy();
    heldResponses.clear();
  };
  const report = (status) => ({
    reportVersion: 1,
    app: 'codex-netwatch',
    packageVersion: JSON.parse(fs.readFileSync(path.join(appDir, 'package.json'), 'utf8')).version,
    sourceSha256: sourceHash,
    environment: { platform: process.platform, architecture: process.arch, node: process.version },
    startedAt,
    updatedAt: new Date().toISOString(),
    requestedDurationMs: options.durationMs,
    elapsedWallClockMs: Math.round(performance.now() - started),
    durationSatisfied: performance.now() - started >= options.durationMs,
    completed: status === 'passed',
    status,
    workload: {
      connections: options.connections,
      intervalMs: options.intervalMs,
      outageEveryMs: options.outageEveryMs,
      outageForMs: options.outageForMs,
      restartEveryMs: options.restartEveryMs,
      ...fixture.stats,
      restarts,
    },
    measurements: {
      maximumCollectorRssBytes: maximumRssBytes || null,
      maximumDatabaseBytes,
      maximumDashboardLatencyMs: Math.round(maximumDashboardLatencyMs * 100) / 100,
      maximumLoopPauseMs: Math.round(maximumLoopPauseMs),
      maximumCheckpointGapMs: Math.round(maximumCheckpointGapMs),
      activeSamplingCoverage: {
        observedMs: database?.observedSamplingMs || 0,
        fractionOfWallTime:
          (database?.observedSamplingMs || 0) / Math.max(1, performance.now() - started),
        definition:
          'Sum of persisted sample intervals up to two polling intervals; startup, reconnect baselines and longer observation gaps are excluded.',
      },
      harnessRssBytes: process.memoryUsage().rss,
      lastCollectorState: lastStatus?.state || null,
      collectorDiagnostics: lastStatus?.diagnostics || null,
      database: database || null,
    },
    failures,
    interruptions,
    privacy:
      'Synthetic .invalid hosts and an empty CODEX_HOME; no user sessions, proxy credentials, endpoint paths or process IDs included.',
  });
  const checkpoint = async () => {
    const checkpointAt = performance.now();
    if (previousCheckpointAt !== null)
      maximumCheckpointGapMs = Math.max(
        maximumCheckpointGapMs,
        checkpointAt - previousCheckpointAt,
      );
    previousCheckpointAt = checkpointAt;
    if (child.exitCode !== null) throw new Error('Collector exited unexpectedly');
    const before = performance.now();
    const dashboard = await jsonRequest(monitorPort, '/api/dashboard?range=all');
    const latencyMs = performance.now() - before;
    maximumDashboardLatencyMs = Math.max(maximumDashboardLatencyMs, latencyMs);
    lastStatus = dashboard.status;
    database = auditDatabase(dataDir, oracle, false, options.intervalMs);
    if (database.samples < previousSamples)
      database.errors.push('Persisted sample count decreased');
    previousSamples = database.samples;
    if (database.errors.length) throw new Error(database.errors.join('; '));
    currentRssBytes = await collectorMemory(child.pid);
    maximumRssBytes = Math.max(maximumRssBytes, currentRssBytes || 0);
    maximumDatabaseBytes = Math.max(maximumDatabaseBytes, bytesOnDisk(dataDir));
    const current = report('running');
    // Explicitly retain only numeric diagnostic metrics; future status fields may contain endpoints.
    if (current.measurements.collectorDiagnostics)
      current.measurements.collectorDiagnostics = Object.fromEntries(
        Object.entries(current.measurements.collectorDiagnostics).filter(
          ([, value]) => typeof value === 'number' || value === null,
        ),
      );
    atomicJson(output, current);
    fs.appendFileSync(
      checkpoints,
      `${JSON.stringify({
        at: current.updatedAt,
        elapsedWallClockMs: current.elapsedWallClockMs,
        samples: database.samples,
        fixtureResponses: database.expectedResponses,
        state: lastStatus.state,
        collectorRssBytes: currentRssBytes,
        databaseBytes: bytesOnDisk(dataDir),
        dashboardLatencyMs: latencyMs,
        integrity: database.integrity,
        errors: database.errors,
      })}\n`,
    );
    lastCheckpoint = performance.now();
  };
  let nextRestart = options.restartEveryMs;
  try {
    await launch();
    await checkpoint();
    let lastLoop = performance.now();
    while (!interrupted && performance.now() - started < options.durationMs) {
      if (unexpectedExit) throw new Error(unexpectedExit);
      maximumLoopPauseMs = Math.max(maximumLoopPauseMs, performance.now() - lastLoop);
      if (maximumLoopPauseMs > Math.max(30000, options.checkpointMs + 10000)) {
        interruptions.push(
          'The harness was paused or the host slept; continuous execution was not established.',
        );
        interrupted = true;
        break;
      }
      lastLoop = performance.now();
      const elapsed = performance.now() - started;
      if (elapsed >= nextRestart) {
        await stop();
        database = auditDatabase(dataDir, oracle, false, options.intervalMs);
        if (database.errors.length || database.samples !== oracle.prefix.length - 1)
          throw new Error(
            database.errors.join('; ') || 'A successful response was lost at collector shutdown',
          );
        restarts++;
        await launch();
        nextRestart += options.restartEveryMs;
      }
      if (performance.now() - lastCheckpoint >= options.checkpointMs) await checkpoint();
      await pause(Math.min(200, Math.max(1, options.durationMs - (performance.now() - started))));
    }
    if (unexpectedExit) throw new Error(unexpectedExit);
    maximumLoopPauseMs = Math.max(maximumLoopPauseMs, performance.now() - lastLoop);
    if (!interrupted && maximumLoopPauseMs > Math.max(30000, options.checkpointMs + 10000)) {
      interruptions.push(
        'The harness was paused or the host slept; continuous execution was not established.',
      );
      interrupted = true;
    }
    await stop();
    database = auditDatabase(dataDir, oracle, true, options.intervalMs);
    if (database.errors.length || database.samples !== oracle.prefix.length - 1)
      throw new Error(
        database.errors.join('; ') || 'Final response count disagrees with persisted samples',
      );
  } catch (error) {
    failures.push(String(error.message).replaceAll(workDir, '[run-directory]'));
  } finally {
    try {
      await stop();
    } catch (error) {
      failures.push(error.message);
    }
    await new Promise((resolve) => server.close(resolve));
    process.removeListener('SIGINT', shouldStop);
    process.removeListener('SIGTERM', shouldStop);
  }
  const status = failures.length ? 'failed' : interrupted ? 'interrupted' : 'passed';
  const final = report(status);
  if (final.measurements.collectorDiagnostics)
    final.measurements.collectorDiagnostics = Object.fromEntries(
      Object.entries(final.measurements.collectorDiagnostics).filter(
        ([, value]) => typeof value === 'number' || value === null,
      ),
    );
  atomicJson(output, final);
  return final;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseOptions(process.argv.slice(2));
    if (options.help)
      console.log(`Codex Netwatch isolated stability runner (Node 24+)\n
node scripts/stability.mjs --duration 30s --connections 300\n
node scripts/stability.mjs --hours 24 --connections 300 --work-dir ./data/stability-24h --output ./data/stability-24h/report.json\n
Options: --duration <30s|5m|24h>, --hours <n>, --connections <3–2000>,\n
  --interval <500ms–10s>, --checkpoint-every <30s>,\n
  --outage-every <60s> --outage-for <2500ms> --restart-every <30m>,\n
  --work-dir <new/empty directory>, --output <sanitized report.json>\n
This runs real elapsed wall time against a loopback fixture and frozen source copy.\n
Reports never label an interrupted or still-running test as completed.`);
    else {
      const result = await runStability(options);
      console.log(JSON.stringify(result, null, 2));
      if (!result.completed) process.exitCode = 1;
    }
  } catch (error) {
    console.error(`Stability runner: ${error.message}`);
    process.exitCode = 1;
  }
}
