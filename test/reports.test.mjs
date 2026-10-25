import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.mjs';
import { DatabaseSync } from 'node:sqlite';
import { reportPeriod } from '../src/reports.mjs';

const at = (date) => Date.parse(date + '+08:00');
function setup(t, zone = 'Asia/Shanghai') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'netwatch-report-'));
  let store = new Store(dir);
  store.close();
  const db = new DatabaseSync(path.join(dir, 'monitor.sqlite'));
  db.prepare('INSERT OR REPLACE INTO settings VALUES (?,?)').run('budgetTimeZone', JSON.stringify(zone));
  db.close();
  store = new Store(dir);
  t.after(() => { store.close(); fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
  return store;
}
function sample(at, codex = 100, other = codex / 2) {
  return { at, duration: 1000, codexUp: codex / 2, codexDown: codex / 2,
    allUp: (codex + other) / 2, allDown: (codex + other) / 2, unknownUp: 0, unknownDown: 0, activeSessions: [],
    rows: [
      { key: 'codex', host: 'example.test', network: 'tcp', process: 'C:\\Synthetic\\codex.exe', pid: 42,
        scope: 'codex', evidence: 'mihomo', rule: 'Match', up: codex / 2, down: codex / 2 },
      { key: 'browser', host: 'other.test', network: 'tcp', process: 'browser.exe', pid: 43,
        scope: 'other', evidence: 'mihomo', rule: 'Match', up: other / 2, down: other / 2 },
    ] };
}

test('calendar uses the fixed zone, distinguishes observed zero from unknown/future, and keeps schema 4', (t) => {
  const store = setup(t), now = at('2028-02-15T12:00:00');
  store.record(sample(at('2028-02-01T08:00:00'), 100));
  store.record(sample(at('2028-02-02T08:00:00'), 0));
  store.record(sample(at('2028-02-16T08:00:00'), 300));
  const result = store.calendarSummary('2028-02', 'all', now);
  assert.equal(result.days.length, 29);
  assert.equal(result.today, '2028-02-15'); assert.equal(result.generatedAt, now);
  assert.equal(result.timeZone, 'Asia/Shanghai');
  assert.equal(result.days[0].bytes, 150);
  assert.equal(result.days[1].observed, true); assert.equal(result.days[1].bytes, 0);
  assert.equal(result.days[2].observed, false); assert.equal(result.days[2].bytes, null);
  assert.equal(result.days[15].future, true); assert.equal(result.days[15].bytes, null);
  assert.equal(store.db.prepare('PRAGMA user_version').get().user_version, 4);
  assert.equal(store.db.prepare('PRAGMA quick_check').get().quick_check, 'ok');
});

test('comparison uses the same local wall-clock cutoff for yesterday and last week', (t) => {
  const store = setup(t), now = at('2026-10-25T12:00:00');
  for (const [date, value] of [
    ['2026-10-12T10:00:00', 60], ['2026-10-18T10:00:00', 400], ['2026-10-18T18:00:00', 500],
    ['2026-10-19T10:00:00', 50], ['2026-10-24T10:00:00', 100], ['2026-10-24T18:00:00', 200],
    ['2026-10-25T11:00:00', 300],
  ]) store.record(sample(at(date), value));
  const { comparison } = store.calendarSummary('2026-10', 'codex', now);
  assert.equal(comparison.today.totalBytes, 300);
  assert.equal(comparison.yesterday.totalBytes, 100);
  assert.equal(comparison.thisWeek.totalBytes, 650);
  assert.equal(comparison.lastWeek.totalBytes, 460);
  assert.equal(comparison.yesterday.to, at('2026-10-24T12:00:00'));
  assert.equal(comparison.lastWeek.to, at('2026-10-18T12:00:00'));
  assert.equal(comparison.lastWeek.comparable, true);
  store.prune(1, now);
  const pruned = store.calendarSummary('2026-10', 'codex', now);
  assert.equal(pruned.comparison.yesterday.detailAvailable, false);
  assert.equal(pruned.comparison.yesterday.totalBytes, null);
  assert.equal(pruned.days.find((d) => d.day === '2026-10-24').bytes, 300);
  assert.ok(pruned.notes.includes('comparable_detail_missing'));
});

test('report boundaries cover the actual 23/25-hour local day across DST and UTC midnight', () => {
  const now = Date.parse('2026-12-01T00:00:00Z');
  const spring = reportPeriod({ kind: 'day', date: '2026-03-08' }, 'America/New_York', now);
  assert.equal(spring.from, Date.parse('2026-03-08T05:00:00Z'));
  assert.equal(spring.end, Date.parse('2026-03-09T04:00:00Z'));
  assert.equal(spring.end - spring.from, 23 * 3600000);
  const fall = reportPeriod({ kind: 'day', date: '2026-11-01' }, 'America/New_York', now);
  assert.equal(fall.end - fall.from, 25 * 3600000);
  const china = reportPeriod({ kind: 'day', date: '2026-10-25' }, 'Asia/Shanghai', now);
  assert.equal(china.from, Date.parse('2026-10-24T16:00:00Z'));
  const utc = reportPeriod({ kind: 'day', date: '2026-10-25' }, 'UTC', now);
  assert.equal(utc.from, Date.parse('2026-10-25T00:00:00Z'));
});

test('report clips the current period at now and never includes seeded future samples or process bytes', (t) => {
  const store = setup(t), now = at('2026-10-25T12:00:00');
  store.record(sample(at('2026-10-25T11:00:00'), 300));
  store.record(sample(at('2026-10-25T18:00:00'), 900));
  const day = store.reportSummary({ kind: 'day', date: '2026-10-25', scope: 'codex' }, now);
  assert.equal(day.period.to, now); assert.equal(day.period.partial, true);
  assert.equal(day.totals.bytes, 300); assert.equal(day.totals.codexUp, 150); assert.equal(day.totals.allBytes, 450);
  assert.equal(day.processes.length, 1); assert.equal(day.processes[0].process, 'codex.exe');
  assert.equal(day.processes[0].up + day.processes[0].down, 300);
  assert.equal(day.peakHours.length, 1); assert.equal(day.peakHours[0].bytes, 300);
  assert.ok(day.peakHours.every((row) => row.to <= now));
  assert.ok(day.notes.includes('partial_period'));
  assert.equal(day.coverage.complete, false);
  const cal = store.calendarSummary('2026-10', 'codex', now);
  assert.equal(cal.days.find((d) => d.day === '2026-10-25').bytes, 300);
  const all = store.reportSummary({ kind: 'day', date: '2026-10-25', scope: 'all' }, now);
  assert.equal(all.totals.bytes, 450); assert.equal(all.processes.length, 2);
});

test('report daily ledger survives pruning while missing process/hour/gap evidence stays explicit', (t) => {
  const store = setup(t), recorded = at('2026-10-01T08:00:00'), now = at('2026-10-25T12:00:00');
  store.record(sample(recorded, 1000));
  const gap = store.openGap('source_unavailable', recorded - 1000);
  store.closeGap(gap, recorded + 1000);
  store.prune(1, now);
  const result = store.reportSummary({ kind: 'day', date: '2026-10-01', scope: 'codex' }, now);
  assert.equal(result.totals.bytes, 1000);
  assert.equal(result.coverage.aggregateDays, 1); assert.equal(result.coverage.detailedSamples, 0);
  assert.equal(result.coverage.detailAvailable, false);
  assert.equal(result.coverage.complete, false);
  assert.deepEqual(result.processes, []); assert.deepEqual(result.peakHours, []); assert.deepEqual(result.gaps, []);
  assert.ok(result.notes.includes('detailed_history_pruned'));
  const unseen = store.reportSummary({ kind: 'day', date: '2026-10-02', scope: 'codex' }, now);
  assert.equal(unseen.totals.bytes, null);
  assert.ok(unseen.notes.includes('unobserved_days'));
  assert.ok(!unseen.notes.includes('detailed_history_pruned'));
});

test('report clips gap evidence to its period and reports an open gap without asserting complete coverage', (t) => {
  const store = setup(t), now = at('2026-10-25T12:00:00');
  store.record(sample(at('2026-10-25T10:30:00'), 200));
  const closed = store.openGap('source_unavailable', at('2026-10-24T23:50:00'));
  store.closeGap(closed, at('2026-10-25T10:00:00'));
  store.openGap('observer_unavailable', at('2026-10-25T11:00:00'));
  const result = store.reportSummary({ kind: 'day', date: '2026-10-25', scope: 'codex' }, now);
  assert.equal(result.coverage.gapCount, 2); assert.equal(result.coverage.openGapCount, 1);
  assert.equal(result.gaps.find((g) => g.id === closed).from, at('2026-10-25T00:00:00'));
  assert.equal(result.gaps.find((g) => g.reason === 'observer_unavailable').to, null);
  assert.equal(result.coverage.observedDurationMs, 1000);
  assert.equal(result.coverage.complete, false);
});

test('invalid dates, scopes and future reports fail without changing stored data', (t) => {
  const store = setup(t), now = at('2026-10-25T12:00:00');
  for (const month of ['2026-13', '2026-2', 'bad', '2026-10;DROP TABLE samples', null])
    assert.throws(() => store.calendarSummary(month, 'codex', now));
  for (const date of ['2026-02-30', '2025-02-29', '2026-00-01', 'bad'])
    assert.throws(() => store.reportSummary({ kind: 'day', date, scope: 'codex' }, now));
  assert.throws(() => store.reportSummary({ kind: 'day', date: '2026-10-26', scope: 'codex' }, now), /not started/);
  assert.throws(() => store.reportSummary({ kind: 'week', date: '2026-11-01', scope: 'codex' }, now), /not started/);
  assert.throws(() => store.calendarSummary('2026-10', 'unknown', now));
  assert.throws(() => store.reportSummary({ kind: 'month', date: '2026-10-25', scope: 'codex' }, now));
  assert.equal(store.db.prepare('PRAGMA user_version').get().user_version, 4);
});
