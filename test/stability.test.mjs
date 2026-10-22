import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  CounterOracle,
  FixtureWorkload,
  durationMs,
  parseOptions,
  runStability,
} from '../scripts/stability.mjs';

test('stability options require bounded real durations and meaningful fault periods', () => {
  assert.equal(durationMs('24h'), 86400000);
  assert.equal(durationMs('500ms'), 500);
  assert.equal(parseOptions(['--hours', '24', '--connections', '1000']).durationMs, 86400000);
  assert.throws(() => parseOptions(['--duration', '2s']), /Duration/);
  assert.throws(() => parseOptions(['--hours', 'Infinity']), /Duration/);
  assert.throws(() => parseOptions(['--connections', '0']), /Connections/);
  assert.throws(() => parseOptions(['--outage-every', '1s', '--outage-for', '2s']), /Outage/);
  assert.throws(() => parseOptions(['--unknown', '1']), /Unknown option/);
});

test('independent oracle baselines attaches and reconnects, counts deltas and resets', () => {
  const oracle = new CounterOracle();
  const snapshot = (up, total = up, id = 'one', process = 'codex.exe') => ({
    uploadTotal: total,
    downloadTotal: 0,
    connections: [
      { id, start: '2026-01-01T00:00:00Z', upload: up, download: 0, metadata: { process } },
    ],
  });
  oracle.record(snapshot(100), 1);
  assert.equal(oracle.prefix.at(-1).codex_up, 0);
  oracle.record(snapshot(120), 2);
  assert.equal(oracle.prefix.at(-1).codex_up, 20);
  oracle.record(snapshot(7), 3);
  assert.equal(oracle.prefix.at(-1).codex_up, 27);
  oracle.reset();
  oracle.record(snapshot(200), 4);
  assert.equal(oracle.prefix.at(-1).codex_up, 27);
  oracle.record(snapshot(15, 215, 'fresh'), 5);
  assert.equal(oracle.prefix.at(-1).codex_up, 42);
  assert.equal(oracle.prefix.at(-1).all_up, 42);
});

test('synthetic workload includes short connections, individual and global counter resets', () => {
  const fixture = new FixtureWorkload(30);
  for (let tick = 0; tick < 50; tick++) {
    const snapshot = fixture.snapshot(1000 + tick * 1000);
    assert.equal(snapshot.connections.length, 30);
    assert.ok(snapshot.connections.every((row) => row.metadata.host.endsWith('.invalid')));
  }
  assert.ok(fixture.stats.shortConnections > 1);
  assert.ok(fixture.stats.counterResets > 0);
  assert.ok(fixture.stats.globalResets > 0);
  assert.equal(fixture.rows.size, 30);
});

test(
  'real collector survives fixture outage and restart without counting bytes twice',
  { timeout: 30000 },
  async (t) => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-netwatch-stability-'));
    t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
    const options = parseOptions([
      '--duration',
      '5s',
      '--connections',
      '12',
      '--interval',
      '500ms',
      '--checkpoint-every',
      '1s',
      '--outage-every',
      '2s',
      '--outage-for',
      '600ms',
      '--restart-every',
      '3s',
      '--work-dir',
      path.join(parent, 'run'),
    ]);
    const report = await runStability(options);
    assert.equal(report.status, 'passed', JSON.stringify(report.failures));
    assert.equal(report.completed, true);
    assert.equal(report.durationSatisfied, true);
    assert.ok(report.elapsedWallClockMs >= options.durationMs);
    assert.ok(report.workload.failures503 > 0);
    assert.ok(report.workload.restarts > 0);
    assert.ok(report.measurements.database.samples > 0);
    assert.ok(report.measurements.activeSamplingCoverage.observedMs > 0);
    assert.ok(report.measurements.activeSamplingCoverage.fractionOfWallTime <= 1);
    assert.ok(report.measurements.maximumLoopPauseMs > 0);
    assert.equal(
      report.measurements.database.samples,
      report.measurements.database.expectedResponses,
    );
    assert.equal(report.measurements.database.integrity, 'ok');
    assert.equal(JSON.stringify(report).includes(parent), false);
    assert.equal(JSON.stringify(report).includes('synthetic-'), false);
    assert.ok(fs.existsSync(path.join(options.workDir, 'frozen-app', 'src', 'main.mjs')));
    await assert.rejects(runStability(options), /new or empty/);
    await assert.rejects(
      runStability({ ...options, workDir: path.resolve('scripts', 'unsafe-stability-run') }),
      /outside the source folders/,
    );
  },
);
