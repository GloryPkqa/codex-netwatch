import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Store } from '../src/store.mjs';
import { Monitor } from '../src/monitor.mjs';
import { AnomalyDetector } from '../src/anomalies.mjs';

function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'netwatch-insights-'));
  const store = new Store(dir);
  t.after(() => {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return { store, dir };
}
function sample(at, up = 100, down = 20, scope = 'codex') {
  return {
    at,
    duration: 1000,
    codexUp: scope === 'codex' ? up : 0,
    codexDown: scope === 'codex' ? down : 0,
    unknownUp: scope === 'unknown' ? up : 0,
    unknownDown: scope === 'unknown' ? down : 0,
    allUp: up,
    allDown: down,
    activeSessions: ['synthetic-session-never-attributed'],
    rows: [
      {
        key: 'connection',
        process: 'codex.exe',
        pid: 42,
        host: 'example.test',
        network: 'tcp',
        scope,
        evidence: 'mihomo',
        rule: 'Match',
        up,
        down,
      },
    ],
  };
}
function controlledMonitor(t, store) {
  let now = 100000;
  let upload = 1000;
  let fail = false;
  const monitor = new Monitor(
    {
      demo: false,
      intervalMs: 1000,
      retentionDays: 30,
      alertMBPerMinute: 1,
      processNames: ['codex.exe'],
      includeDescendants: true,
    },
    store,
    { now: () => now },
  );
  monitor.sessions.refresh = () => {};
  monitor.observer.status = 'ready';
  monitor.observer.at = now;
  monitor.observer.classify = () => ({
    scope: 'codex',
    process: 'codex.exe',
    pid: 42,
    evidence: 'mihomo',
  });
  monitor.source = {
    generation: 1,
    snapshot: async () => {
      if (fail) throw new Error('synthetic outage');
      return {
        uploadTotal: upload,
        downloadTotal: 0,
        connections: [{ id: 'one', start: new Date(0).toISOString(), upload, download: 0 }],
      };
    },
  };
  t.after(() => monitor.stop());
  return {
    monitor,
    async tick({ advance = 1000, add = 100, failure = false, observerReady = true } = {}) {
      now += advance;
      upload += add;
      fail = failure;
      if (observerReady) {
        monitor.observer.status = 'ready';
        monitor.observer.at = now;
      } else monitor.observer.status = 'error';
      await monitor.tick();
      clearTimeout(monitor.timer);
      return now;
    },
  };
}

test('saved retention survives a new database connection and prunes on the next poll', async (t) => {
  const { store, dir } = setup(t);
  store.record(sample(60000));
  const { monitor, tick } = controlledMonitor(t, store);
  await tick({ advance: 10 * 86400000 });
  assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM samples WHERE at=60000').get().n, 1);
  monitor.setRetentionDays(7);
  assert.equal(monitor.status().retentionDays, 7);
  const reopened = new Store(dir);
  const restarted = new Monitor({ demo: true, retentionDays: 30, alertMBPerMinute: 100 }, reopened);
  try {
    assert.equal(restarted.status().retentionDays, 7);
  } finally {
    restarted.stop();
    reopened.close();
  }
  await tick();
  assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM samples WHERE at=60000').get().n, 0);
  assert.ok(store.db.prepare('SELECT COUNT(*) AS n FROM samples').get().n > 0);
  monitor.setRetentionDays(30);
  await tick();
  assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM samples WHERE at=60000').get().n, 0);
  assert.equal(store.db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
});

test('v2 migration adds insights tables while preserving bytes and integrity', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'netwatch-migration-'));
  let store = new Store(dir);
  t.after(() => {
    if (store.db.isOpen) store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  store.record(sample(61000));
  store.close();
  const legacy = new DatabaseSync(path.join(dir, 'monitor.sqlite'));
  legacy.exec('DROP TABLE collection_gaps; DROP TABLE anomalies; PRAGMA user_version=2');
  legacy.close();
  store = new Store(dir);
  assert.equal(store.db.prepare('PRAGMA user_version').get().user_version, 3);
  assert.equal(store.totals(0, 120000).codex_up, 100);
  assert.equal(store.db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
});

test('insights retain historical unknown attribution and bound result sets', (t) => {
  const { store } = setup(t);
  store.record(sample(61000, 100, 0, 'unknown'));
  store.record(sample(62000, 300, 0));
  for (let i = 0; i < 105; i++) {
    const id = store.openGap('sampling_delay', 61000 + i);
    store.closeGap(id, 62000 + i);
    store.anomaly({ kind: 'upload_burst', from: 60000, to: 62000 + i, bytes: 100 });
  }
  const result = store.insights(60000, 119999);
  assert.equal(result.coverage.unknownBytes, 100);
  assert.equal(result.coverage.attributedBytes, 300);
  assert.equal(result.coverage.unknownShare, 0.25);
  assert.equal(result.coverage.gapCount, 105);
  assert.equal(result.gaps.length, 100);
  assert.equal(result.anomalies.length, 100);
  const unknown = result.processes.find((x) => x.scope === 'unknown');
  assert.equal(unknown.process, '');
  assert.equal(unknown.pidCount, 0);
  assert.equal(result.coverage.measurement, 'mihomo_snapshot_deltas');
  assert.equal(store.insights(120000, 180000).coverage.unknownShare, null);
  assert.ok(!JSON.stringify(result).includes('synthetic-session'));
});

test('Codex ranking is scoped before limiting even when unrelated apps dominate traffic', (t) => {
  const { store } = setup(t);
  for (let i = 0; i < 25; i++) {
    const value = sample(61000 + i, 10000, 10000, 'other');
    value.rows[0].key = `other-${i}`;
    value.rows[0].process = `other-${i}.exe`;
    store.record(value);
  }
  const codex = sample(62000, 10, 5);
  codex.rows[0].key = 'codex-small';
  store.record(codex);
  const result = store.insights(60000, 119999);
  assert.equal(result.processes.length, 20);
  assert.equal(
    result.processes.some((row) => row.scope === 'codex'),
    false,
  );
  assert.equal(result.codexProcesses.length, 1);
  assert.equal(result.codexProcesses[0].scope, 'codex');
  assert.equal(result.codexProcesses[0].up, 10);
  assert.equal(result.codexProcesses[0].down, 5);
});

test('repeated controller failures persist one open gap and recovery baselines offline bytes', async (t) => {
  const { store } = setup(t);
  const { monitor, tick } = controlledMonitor(t, store);
  await tick();
  await tick();
  await tick({ failure: true });
  await tick({ failure: true });
  let insights = store.insights(0, 1000000);
  assert.equal(insights.gaps.filter((g) => g.reason === 'source_unavailable').length, 1);
  assert.equal(insights.coverage.openGapCount, 1);
  await tick({ advance: 60000, add: 9999999 });
  assert.equal(monitor.latest.codexUp, 0);
  await tick();
  insights = store.insights(0, 1000000);
  assert.equal(insights.coverage.codexUp, 200);
  assert.equal(insights.coverage.openGapCount, 0);
  assert.equal(insights.gaps.filter((g) => g.reason === 'sampling_delay').length, 0);
  assert.equal(monitor.status().diagnostics.failures, 2);
  assert.equal(monitor.status().diagnostics.reconnects, 1);
});

test('backwards clock adjustment does not suppress new threshold alerts until the old time returns', async (t) => {
  const { store } = setup(t);
  const { tick } = controlledMonitor(t, store);
  await tick();
  await tick({ add: 2000000 });
  assert.equal(store.alerts().length, 1);
  await tick({ advance: -50000 });
  await tick({ add: 2000000 });
  assert.equal(store.alerts().length, 2);
});

test('sampling delays, source changes and backward clocks establish fresh baselines', async (t) => {
  const { store } = setup(t);
  const { monitor, tick } = controlledMonitor(t, store);
  await tick();
  await tick({ advance: 120000, add: 9000000 });
  assert.equal(monitor.latest.codexUp, 0);
  monitor.source.generation++;
  await tick({ add: 9000000 });
  assert.equal(monitor.latest.codexUp, 0);
  await tick({ advance: -500, add: 9000000 });
  assert.equal(monitor.latest.codexUp, 0);
  assert.deepEqual(
    store
      .insights(0, 1000000)
      .gaps.map((g) => g.reason)
      .sort(),
    ['clock_changed', 'initial_baseline', 'sampling_delay', 'source_changed'].sort(),
  );
});

test('collector restart and observer outage are persisted once without resetting measured counters', async (t) => {
  const { store } = setup(t);
  store.record(sample(60000));
  const { monitor, tick } = controlledMonitor(t, store);
  await tick();
  await tick({ advance: 5000, observerReady: false });
  await tick({ observerReady: false });
  await tick();
  const gaps = store.insights(0, 1000000).gaps;
  assert.equal(gaps.filter((g) => g.reason === 'collector_restart').length, 1);
  const outage = gaps.filter((g) => g.reason === 'observer_unavailable');
  assert.equal(outage.length, 1);
  assert.ok(outage[0].to > outage[0].from);
  assert.equal(monitor.latest.codexUp, 100);
});

test('anomaly findings use measured Codex direction and contributor context with cooldown', () => {
  const detector = new AnomalyDetector();
  let events = detector.consume(sample(1000, 1100000, 0), 1);
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, 'upload_burst');
  assert.equal(events[0].process, 'codex.exe');
  assert.equal(events[0].host, 'example.test');
  assert.equal(events[0].bytes, 1100000);
  assert.equal(events[0].contextMode, 'largest_observed_contributor');
  assert.ok(!('activeSessions' in events[0]));
  assert.equal(detector.consume(sample(2000, 1100000, 0), 1).length, 0);
  assert.equal(detector.consume({ ...sample(3000), baseline: true }, 1).length, 0);
  events = detector.consume(sample(4000, 0, 1100000), 1);
  assert.equal(events[0].kind, 'download_burst');
});

test('large transfers in one direction cannot hide the opposite-direction anomaly contributor', () => {
  const detector = new AnomalyDetector();
  const observed = sample(1000, 2000000000, 2000000);
  observed.rows = [
    ...Array.from({ length: 20 }, (_, i) => ({
      ...sample(1000).rows[0],
      key: `up-${i}`,
      host: `upload-${i}.test`,
      up: 100000000,
      down: 0,
    })),
    { ...sample(1000).rows[0], key: 'down', host: 'download.test', up: 0, down: 2000000 },
  ];
  const download = detector.consume(observed, 1).find((x) => x.kind === 'download_burst');
  assert.equal(download.host, 'download.test');
  assert.equal(download.contextDown, 2000000);
  assert.equal(download.contextUp, 0);
  assert.equal(download.bytes, 2000000);
  assert.ok(detector.recent[0].rows.length <= 20);
});

test('sustained upload requires two minutes of measured elevated activity; bounded window', () => {
  const detector = new AnomalyDetector();
  const findings = [];
  for (let at = 1000; at <= 720000; at += 1000)
    findings.push(...detector.consume(sample(at, 10000, 0), 1));
  const sustained = findings.filter((x) => x.kind === 'sustained_upload');
  assert.equal(sustained.length, 1);
  assert.equal(sustained[0].to, 120000);
  assert.ok(detector.recent.length <= 300);
  assert.ok(detector.recent[0].at > 720000 - 300000);
});

test('burst rearming requires both recovery and cooldown; other processes cannot trigger Codex findings', () => {
  const detector = new AnomalyDetector();
  assert.equal(detector.consume(sample(1000, 2000000, 0, 'other'), 1).length, 0);
  assert.equal(detector.consume(sample(2000, 1100000, 0), 1).length, 1);
  assert.equal(detector.consume(sample(63000, 0, 0), 1).length, 0);
  assert.equal(detector.consume(sample(64000, 1100000, 0), 1).length, 0);
  assert.equal(detector.consume(sample(303000, 1100000, 0), 1).length, 1);
});

test('an isolated large spike is not described as sustained upload', () => {
  const detector = new AnomalyDetector();
  const findings = detector.consume(sample(1000, 2000000, 0), 1);
  for (let at = 2000; at <= 121000; at += 1000)
    findings.push(...detector.consume(sample(at, 0, 0), 1));
  assert.equal(findings.filter((x) => x.kind === 'sustained_upload').length, 0);
});

test('retention prunes closed insights and keeps an ongoing gap visible', (t) => {
  const { store } = setup(t);
  const closed = store.openGap('sampling_delay', 1000);
  store.closeGap(closed, 2000);
  store.openGap('source_unavailable', 3000);
  store.anomaly({ kind: 'upload_burst', from: 1000, to: 2000, bytes: 100 });
  store.prune(1, 3 * 86400000);
  const result = store.insights(0, 4 * 86400000);
  assert.equal(result.anomalies.length, 0);
  assert.equal(result.gaps.length, 1);
  assert.equal(result.gaps[0].to, null);
});
