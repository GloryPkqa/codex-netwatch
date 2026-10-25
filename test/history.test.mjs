import test from 'node:test';
import assert from 'node:assert/strict';
import { shiftMonth, comparisonChange, reportDocument, formatBytes } from '../public/history.js';

const report = {
  period: { kind: 'day', date: '2026-10-25', label: '2026-10-25', from: 1792857600000, to: 1792944000000 },
  timeZone: 'Asia/Shanghai', scope: 'codex', generatedAt: 1792900000000,
  totals: { codexUp: 400, codexDown: 600, allUp: 2000, allDown: 3000, bytes: 1000 },
  processes: [{ process: '<img src=x onerror=alert(1)> & "unsafe.exe"', up: 400, down: 600 }],
  peakHours: [{ at: 1792900000000, bytes: 1000 }], gaps: [{ reason: 'disconnected', from: 1792890000000, to: null }],
  coverage: { aggregateDays: 1, calendarDays: 1, detailedSamples: 42, observedDurationMs: 42000, firstDetailedAt: 1792890000000, lastDetailedAt: 1792900000000, gapCount: 1 },
  notes: ['observed_only', 'source_scope', 'aggregate_history', 'partial_period'],
};

test('month navigation crosses years without local time or invalid-month normalization', () => {
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  assert.equal(shiftMonth('2024-02', 1), '2024-03');
  for (const invalid of ['2026-13', '2026-00', '26-02', '2026-02-01', '']) assert.equal(shiftMonth(invalid, 1), null);
});

test('comparable percentages never turn missing detail or a zero baseline into growth claims', () => {
  const complete = (totalBytes) => ({ totalBytes, detailAvailable: true, comparable: true });
  assert.equal(comparisonChange(complete(150), complete(100)), 50);
  assert.equal(comparisonChange(complete(50), complete(100)), -50);
  assert.equal(comparisonChange(complete(0), complete(0)), 0);
  assert.equal(comparisonChange(complete(50), complete(0)), null);
  assert.equal(comparisonChange(complete(null), complete(100)), null);
  assert.equal(comparisonChange({ ...complete(150), comparable: false }, complete(100)), null);
  assert.equal(comparisonChange(complete(150), { ...complete(100), detailAvailable: false }), null);
  assert.equal(comparisonChange(null, complete(100)), null);
});

test('offline report safely escapes stored process names and has no scripts or external resources', () => {
  const html = reportDocument(report, 'en');
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt; &amp; &quot;unsafe.exe&quot;'));
  assert.doesNotMatch(html, /<img|<script|https?:\/\//i);
  assert.match(html, /default-src 'none'/);
  assert.match(html, /Codex only/);
  assert.match(html, /1\.00 KB/);
  assert.match(html, /Still ongoing/);
  assert.match(html, /not a data-plan bill/);
  assert.match(html, /This period is still in progress/);
  assert.doesNotMatch(html, /undefined|NaN/);
});

test('weekly report preserves the selected scope, language and absence of retained detail', () => {
  const html = reportDocument({ ...report,
    period: { ...report.period, kind: 'week', label: '2026-10-19 – 2026-10-25' },
    scope: 'all', totals: { ...report.totals, bytes: 5000 }, processes: [], peakHours: [], gaps: [],
    coverage: { ...report.coverage, calendarDays: 7, firstDetailedAt: null, lastDetailedAt: null, gapCount: 0 },
    notes: ['observed_only', 'detailed_history_pruned', 'unobserved_days'],
  }, 'zh-CN');
  assert.match(html, /Codex Netwatch 周报/);
  assert.match(html, /全部已观测进程/);
  assert.match(html, /5\.00 KB/);
  assert.match(html, /2\.00 KB/);
  assert.match(html, /1 \/ 7 天/);
  assert.match(html, /没有可用的详细记录/);
  assert.match(html, /无记录不代表零用量/);
  assert.match(html, /明细首末记录：— 至 —/);
  assert.doesNotMatch(html, /undefined|NaN/);
});

test('missing amounts remain distinct from a recorded zero', () => {
  assert.equal(formatBytes(null), '—');
  assert.equal(formatBytes(undefined), '—');
  assert.equal(formatBytes(0), '0 B');
});
