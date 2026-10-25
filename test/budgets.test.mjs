import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Store } from '../src/store.mjs';
import { Monitor } from '../src/monitor.mjs';
import { createServer } from '../src/server.mjs';
import { DEFAULT_BUDGET, validateBudget, createBudgetCalendar } from '../src/budgets.mjs';
import { translateAlert } from '../public/i18n.js';

const at = (value) => Date.parse(value + '+08:00');
const settings = { ...DEFAULT_BUDGET, dailyGB: 1, monthlyGB: 2 };
function sample(at, codex = 1e8, all = codex) {
  return { at, duration: 1000, codexUp: codex / 2, codexDown: codex / 2,
    allUp: all / 2, allDown: all / 2, unknownUp: 0, unknownDown: 0, activeSessions: [], rows: [] };
}
function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'netwatch-budget-'));
  let store = new Store(dir);
  store.close();
  // Deterministic calendar on Windows/Linux CI, independent of its OS zone.
  const db = new DatabaseSync(path.join(dir, 'monitor.sqlite'));
  db.prepare('INSERT OR REPLACE INTO settings VALUES (?,?)').run('budgetTimeZone', JSON.stringify('Asia/Shanghai'));
  db.close();
  store = new Store(dir);
  t.after(() => { store.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  return { dir, store };
}

test('calendar day follows its fixed zone at midnight and across DST', () => {
  const china = createBudgetCalendar('Asia/Shanghai');
  assert.equal(china.day(at('2026-10-31T23:59:59')), '2026-10-31');
  assert.equal(china.day(at('2026-11-01T00:00:00')), '2026-11-01');
  const ny = createBudgetCalendar('America/New_York');
  assert.equal(ny.day(Date.parse('2026-11-01T05:30:00Z')), '2026-11-01');
  assert.equal(ny.day(Date.parse('2026-11-01T06:30:00Z')), '2026-11-01');
});

test('day and month rollover, scope and duplicate samples keep independent totals', (t) => {
  const { store } = setup(t);
  const before = at('2026-10-31T23:59:59'), after = at('2026-11-01T00:00:00');
  store.record(sample(before, 3e8, 9e8));
  store.record(sample(before, 3e8, 9e8));
  store.record(sample(after, 2e8, 6e8));
  let result = store.budgetSummary(before, settings);
  assert.equal(result.day.usedBytes, 3e8);
  assert.equal(result.month.usedBytes, 3e8);
  result = store.budgetSummary(after, settings);
  assert.equal(result.day.usedBytes, 2e8);
  assert.equal(result.month.usedBytes, 2e8);
  assert.equal(result.day.remainingBytes, 8e8);
  assert.equal(store.budgetSummary(after, { ...settings, scope: 'all' }).day.usedBytes, 6e8);
  assert.equal(store.budgetSummary(after, DEFAULT_BUDGET).day.state, 'disabled');
});

test('retention and restarts preserve daily summaries and alert deduplication', (t) => {
  const { store, dir } = setup(t);
  let now = at('2026-10-01T12:00:00');
  store.record(sample(now, 8e8));
  store.checkBudgets(now, settings);
  store.checkBudgets(now, settings);
  assert.equal(store.alerts().length, 1);
  assert.match(translateAlert(store.alerts()[0].message, 'en'), /Daily Codex only budget warning/);
  now += 1000;
  store.record(sample(now, 3e8));
  store.checkBudgets(now, settings);
  assert.equal(store.alerts().length, 2);
  assert.equal(store.budgetSummary(now, settings).day.state, 'exceeded');
  assert.equal(store.budgetSummary(now, settings).day.overBytes, 1e8);
  store.prune(1, at('2026-10-20T12:00:00'));
  assert.equal(store.totals(0, now).samples, 0);
  const reopened = new Store(dir);
  try {
    assert.equal(reopened.budgetSummary(at('2026-10-20T12:00:00'), settings).month.usedBytes, 11e8);
    reopened.checkBudgets(now, settings);
    assert.equal(reopened.alerts().length, 0, 'pruning alerts does not rearm an old threshold');
  } finally { reopened.close(); }
});

test('a jump past 100% emits one alert per period; changed limits are evaluated immediately', (t) => {
  const { store } = setup(t);
  const now = at('2026-10-25T12:00:00');
  store.record(sample(now, 3e9));
  store.checkBudgets(now, settings);
  assert.equal(store.alerts().length, 2);
  for (const alert of store.alerts()) assert.equal(JSON.parse(alert.message).exceeded, true);
  const monitor = new Monitor({ demo: true, retentionDays: 30, alertMBPerMinute: 100 }, store, { now: () => now });
  monitor.setBudgetSettings({ ...settings, dailyGB: 4, monthlyGB: 4, warnPercent: 70 });
  assert.equal(store.alerts().length, 4);
  assert.equal(store.get('budget').dailyGB, 4);
  monitor.stop();
});

test('upgrading a v3 database backfills existing samples once, with atomic daily accounting', (t) => {
  const { store, dir } = setup(t);
  const now = at('2026-10-25T12:00:00');
  store.record(sample(now, 2e8));
  store.db.exec("DELETE FROM daily_usage; DELETE FROM settings WHERE key='budgetLedgerReady'; PRAGMA user_version=3");
  const migrated = new Store(dir);
  try {
    assert.equal(migrated.budgetSummary(now, settings).day.usedBytes, 2e8);
    const reopened = new Store(dir);
    try { assert.equal(reopened.budgetSummary(now, settings).month.usedBytes, 2e8); }
    finally { reopened.close(); }
    const failed = sample(now + 1000, 3e8);
    failed.rows = [{ key: 'bad', host: null, network: 'tcp', process: '', pid: null, scope: 'codex', evidence: 'none', rule: '', up: 3e8, down: 0 }];
    assert.throws(() => migrated.record(failed));
    assert.equal(migrated.budgetSummary(now + 1000, settings).day.usedBytes, 2e8);
  } finally { migrated.close(); }
});

test('invalid budget updates cannot partially change settings; API scope and tray ownership persist', async (t) => {
  const { store } = setup(t);
  const monitor = new Monitor({ demo: true, retentionDays: 30, alertMBPerMinute: 100 }, store);
  const root = path.resolve(import.meta.dirname, '..');
  const token = 'a'.repeat(64);
  const server = createServer({ root, desktopToken: token }, store, monitor, () => {});
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(async () => { monitor.stop(); await new Promise((r) => { server.close(r); server.closeAllConnections(); }); });
  const base = `http://127.0.0.1:${server.address().port}`, headers = { 'X-Codex-Flow': '1' };
  const post = (budget) => fetch(base + '/api/settings', { method: 'POST', headers, body: JSON.stringify({ budget, alertMBPerMinute: 200, retentionDays: 7 }) });
  for (const budget of [null, [], { ...settings, scope: 'unknown' }, { ...settings, dailyGB: -1 }, { ...settings, monthlyGB: '2' }, { ...settings, dailyGB: 1000001 }, { ...settings, warnPercent: 100 }, { ...settings, desktopNotify: 'yes' }]) {
    assert.throws(() => validateBudget(budget));
    assert.equal((await post(budget)).status, 400);
    assert.equal(monitor.alertMBPerMinute, 100);
    assert.equal(monitor.retentionDays, 30);
  }
  assert.equal((await post({ ...settings, scope: 'all', desktopNotify: false })).status, 200);
  const result = await (await fetch(base + '/api/dashboard?range=15m', { headers })).json();
  assert.equal(result.budget.settings.scope, 'all');
  assert.equal(result.budget.settings.desktopNotify, false);
  assert.equal((await fetch(base + '/api/budget-notifications', { headers })).status, 403);
  const notifications = await (await fetch(base + '/api/budget-notifications', { headers: { ...headers, 'X-Codex-Desktop-Token': token } })).json();
  assert.equal(notifications.enabled, false);
});
