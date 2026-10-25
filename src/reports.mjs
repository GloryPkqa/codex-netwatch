// Read-only calendar/report views. Daily totals survive detailed-history pruning;
// process, hour and gap evidence is deliberately kept separate from that ledger.
const DAY = 86400000;
const calendars = new Map();

function validateNow(now) {
  if (!Number.isSafeInteger(now) || now < 0 || !Number.isFinite(new Date(now).getTime()))
    throw new Error('Invalid report time');
}
export function validateReportDate(date) {
  if (typeof date !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(date) ||
      Number(date.slice(0, 4)) < 1970 || Number(date.slice(0, 4)) > 9998 ||
      new Date(`${date}T00:00:00.000Z`).toISOString().slice(0, 10) !== date)
    throw new Error('Invalid report date');
  return date;
}
function validateScope(scope) {
  if (!['codex', 'all'].includes(scope)) throw new Error('Invalid report scope');
}
export function addCalendarDays(date, count) {
  return new Date(Date.parse(`${date}T00:00:00.000Z`) + count * DAY).toISOString().slice(0, 10);
}
function monday(date) {
  const weekday = new Date(`${date}T12:00:00.000Z`).getUTCDay();
  return addCalendarDays(date, -((weekday + 6) % 7));
}
function calendar(timeZone) {
  if (calendars.has(timeZone)) return calendars.get(timeZone);
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  const starts = new Map();
  const parts = (at) => Object.fromEntries(formatter.formatToParts(at).filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]));
  const date = (at) => { const p = parts(at); return `${p.year}-${p.month}-${p.day}`; };
  const start = (day) => {
    if (starts.has(day)) return starts.get(day);
    const anchor = Date.parse(`${day}T00:00:00.000Z`);
    let low = anchor - 36 * 3600000, high = anchor + 36 * 3600000;
    // Local dates remain ordered across a DST clock change. Searching the first
    // instant of a day handles 23/25-hour days and zones whose offset is not an hour.
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (date(middle) < day) low = middle + 1;
      else high = middle;
    }
    if (date(low) !== day) throw new Error('Date does not exist in the budget time zone');
    if (starts.size > 2048) starts.clear();
    starts.set(day, low);
    return low;
  };
  const wallTime = (day, sourceAt) => {
    const source = parts(sourceAt), milliseconds = ((sourceAt % 1000) + 1000) % 1000;
    const target = Date.parse(`${day}T${source.hour}:${source.minute}:${source.second}.${String(milliseconds).padStart(3, '0')}Z`);
    const first = start(day), next = start(addCalendarDays(day, 1));
    const offset = (at) => {
      const p = parts(at);
      return Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}.000Z`) - Math.floor(at / 1000) * 1000;
    };
    const candidates = [...new Set([offset(first), offset(Math.floor((first + next) / 2)), offset(next - 1)])]
      .map((value) => target - value).filter((at) => at >= first && at < next);
    const matches = candidates.filter((at) => {
      const p = parts(at);
      return date(at) === day && p.hour === source.hour && p.minute === source.minute && p.second === source.second;
    });
    // Prefer the first occurrence of an ambiguous fall-back clock time. A missing
    // spring-forward time advances by the gap, as a local wall-clock comparison.
    return matches.length ? Math.min(...matches) : Math.min(next - 1, Math.max(first, ...candidates));
  };
  const value = { timeZone, date, start, wallTime };
  calendars.set(timeZone, value);
  return value;
}

export function reportPeriod({ kind, date }, timeZone, now = Date.now()) {
  validateNow(now); validateReportDate(date);
  if (!['day', 'week'].includes(kind)) throw new Error('Invalid report kind');
  const cal = calendar(timeZone), firstDay = kind === 'week' ? monday(date) : date;
  const nextDay = addCalendarDays(firstDay, kind === 'week' ? 7 : 1);
  const from = cal.start(firstDay), end = cal.start(nextDay);
  if (from > now) throw new Error('Report period has not started');
  const to = Math.min(now, end - 1), lastDay = cal.date(to);
  return { kind, date, firstDay, lastDay, from, to, end, partial: to < end - 1,
    label: kind === 'day' ? firstDay : `${firstDay} – ${addCalendarDays(nextDay, -1)}` };
}

function rowsInRange(store, firstDay, lastDay) {
  return store.db.prepare('SELECT * FROM daily_usage WHERE day>=? AND day<=? ORDER BY day').all(firstDay, lastDay);
}
function sumRows(rows, scope) {
  const totals = { codexUp: 0, codexDown: 0, allUp: 0, allDown: 0 };
  for (const row of rows) {
    totals.codexUp += row.codex_up; totals.codexDown += row.codex_down;
    totals.allUp += row.all_up; totals.allDown += row.all_down;
  }
  totals.codexBytes = totals.codexUp + totals.codexDown;
  totals.allBytes = totals.allUp + totals.allDown;
  totals.bytes = scope === 'all' ? totals.allBytes : totals.codexBytes;
  return totals;
}
function rawTotals(store, from, to) {
  return store.db.prepare(`SELECT COALESCE(SUM(codex_up),0) AS codex_up,COALESCE(SUM(codex_down),0) AS codex_down,
    COALESCE(SUM(all_up),0) AS all_up,COALESCE(SUM(all_down),0) AS all_down,COUNT(*) AS sampleCount,
    MIN(at) AS firstAt,MAX(at) AS lastAt FROM samples WHERE at>=? AND at<=?`).get(from, to);
}
function recordedRange(store, from, to, scope) {
  const cal = calendar(store.calendar.timeZone), firstDay = cal.date(from), lastDay = cal.date(to);
  const rows = rowsInRange(store, firstDay, lastDay), retainedFirst = store.firstAt();
  let detailAvailable = true;
  const included = [];
  for (const row of rows) {
    if (row.first_at > to) continue;
    if (row.day === lastDay && row.last_at > to) {
      // A partial-day comparison cannot use the whole day's durable aggregate.
      // If its prefix was pruned, report it as unavailable rather than as zero.
      if (retainedFirst === null || retainedFirst > row.first_at) detailAvailable = false;
      const raw = rawTotals(store, Math.max(from, cal.start(row.day)), to);
      if (raw.sampleCount) included.push({ ...raw, day: row.day });
    } else included.push(row);
  }
  const totals = sumRows(included, scope);
  const observedDays = included.length;
  const calendarDays = Math.round((Date.parse(`${lastDay}T00:00:00Z`) - Date.parse(`${firstDay}T00:00:00Z`)) / DAY) + 1;
  const gaps = store.db.prepare(`SELECT COUNT(*) AS gapCount FROM collection_gaps
    WHERE started_at<=? AND (ended_at IS NULL OR ended_at>=?)`).get(to, from).gapCount;
  return { from, to, totalBytes: observedDays && detailAvailable ? totals.bytes : null,
    codexBytes: observedDays && detailAvailable ? totals.codexBytes : null,
    allBytes: observedDays && detailAvailable ? totals.allBytes : null,
    detailAvailable, comparable: detailAvailable && observedDays > 0, observedDays, calendarDays,
    coverage: { detailAvailable, observedDays, calendarDays, gapCount: gaps, complete: false } };
}

export function calendarSummary(store, month, scope = 'codex', now = Date.now()) {
  validateNow(now); validateScope(scope);
  if (typeof month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Invalid calendar month');
  const firstDay = validateReportDate(`${month}-01`), cal = calendar(store.calendar.timeZone), today = cal.date(now);
  const nextMonth = addCalendarDays(firstDay, 32).slice(0, 7), nextFirst = `${nextMonth}-01`;
  const rows = new Map(rowsInRange(store, firstDay, addCalendarDays(nextFirst, -1)).map((r) => [r.day, r]));
  const days = [];
  for (let day = firstDay; day < nextFirst; day = addCalendarDays(day, 1)) {
    const row = rows.get(day), future = day > today, observed = !!row && !future && row.first_at <= now;
    const totals = observed ? sumRows([row], scope) : null;
    days.push({ day, bytes: totals?.bytes ?? null, codexBytes: totals?.codexBytes ?? null,
      allBytes: totals?.allBytes ?? null, observed, future, firstAt: observed ? row.first_at : null, lastAt: observed ? row.last_at : null });
  }
  const yesterday = addCalendarDays(today, -1), thisMonday = monday(today), lastMonday = addCalendarDays(thisMonday, -7);
  const previousWeekDay = addCalendarDays(today, -7);
  const comparison = {
    today: recordedRange(store, cal.start(today), now, scope),
    yesterday: recordedRange(store, cal.start(yesterday), cal.wallTime(yesterday, now), scope),
    thisWeek: recordedRange(store, cal.start(thisMonday), now, scope),
    lastWeek: recordedRange(store, cal.start(lastMonday), cal.wallTime(previousWeekDay, now), scope),
  };
  const currentDay = days.find((entry) => entry.day === today);
  if (currentDay?.observed && currentDay.lastAt > now) {
    currentDay.bytes = comparison.today.totalBytes;
    currentDay.codexBytes = comparison.today.codexBytes;
    currentDay.allBytes = comparison.today.allBytes;
    currentDay.lastAt = Math.min(now, currentDay.lastAt);
    currentDay.detailMissing = !comparison.today.detailAvailable;
  }
  const notes = ['observed_only', 'aggregate_history', 'source_scope', 'unobserved_days'];
  if (Object.values(comparison).some((item) => !item.detailAvailable)) notes.push('comparable_detail_missing');
  return { month, today, generatedAt: now, timeZone: cal.timeZone, scope, days, comparison,
    comparisonMode: 'same_local_elapsed_time', notes };
}

export function reportSummary(store, options, now = Date.now()) {
  const { kind, date, scope = 'codex' } = options || {};
  validateScope(scope);
  const cal = calendar(store.calendar.timeZone), period = reportPeriod({ kind, date }, cal.timeZone, now);
  const rows = rowsInRange(store, period.firstDay, period.lastDay).filter((r) => r.first_at <= period.to);
  const retainedFirst = store.firstAt();
  let aggregateDetailMissing = false;
  const aggregateRows = rows.map((row) => {
    if (row.last_at <= period.to) return row;
    const raw = rawTotals(store, Math.max(period.from, cal.start(row.day)), period.to);
    if (retainedFirst === null || retainedFirst > row.first_at) aggregateDetailMissing = true;
    return { ...raw, day: row.day };
  });
  const totals = sumRows(aggregateRows, scope);
  if (aggregateDetailMissing || rows.length === 0) for (const key of Object.keys(totals)) totals[key] = null;
  const prefix = scope === 'all' ? 'all' : 'codex';
  const raw = store.db.prepare(`SELECT COUNT(*) AS detailedSamples,MIN(at) AS firstDetailedAt,MAX(at) AS lastDetailedAt,
    COALESCE(SUM(MIN(duration,MAX(0,at-?))),0) AS observedDurationMs,
    COALESCE(SUM(codex_up+codex_down),0) AS codexBytes,COALESCE(SUM(all_up+all_down),0) AS allBytes
    FROM samples WHERE at>=? AND at<=?`).get(period.from, period.from, period.to);
  const detailAvailable = !aggregateDetailMissing && rows.length > 0 && raw.detailedSamples > 0 &&
    retainedFirst !== null && rows.every((row) => row.first_at >= retainedFirst) &&
    raw.codexBytes === totals.codexBytes && raw.allBytes === totals.allBytes;
  const minuteFrom = Math.floor(period.from / 60000) * 60000, minuteTo = Math.floor(period.to / 60000) * 60000;
  const processes = store.db.prepare(`SELECT CASE WHEN b.scope='unknown' THEN '' ELSE c.process END AS process,b.scope,
    SUM(b.up) AS up,SUM(b.down) AS down,COUNT(DISTINCT c.id) AS connections,
    COUNT(DISTINCT CASE WHEN b.scope='unknown' THEN NULL ELSE c.pid END) AS pidCount
    FROM buckets b JOIN connections c ON c.id=b.connection_id WHERE b.minute>=? AND b.minute<=? AND b.last_at<=?
    AND (?='all' OR b.scope=?) GROUP BY 1,b.scope ORDER BY SUM(b.up+b.down) DESC,process,b.scope LIMIT 10`)
    .all(minuteFrom, minuteTo, period.to, scope, scope).map((row) => ({ ...row,
      process: row.process.replaceAll('\\', '/').split('/').at(-1), bytes: row.up + row.down }));
  const peakHours = store.db.prepare(`SELECT CAST(at/3600000 AS INTEGER)*3600000 AS at,
    SUM(${prefix}_up+${prefix}_down) AS bytes FROM samples WHERE at>=? AND at<=?
    GROUP BY 1 HAVING bytes>0 ORDER BY bytes DESC,at DESC LIMIT 5`).all(period.from, period.to)
    .map((row) => ({ ...row, at: Math.max(row.at, period.from), to: Math.min(row.at + 3599999, period.to),
      partial: row.at < period.from || row.at + 3599999 > period.to }));
  const gaps = store.db.prepare(`SELECT id,reason,started_at AS 'from',ended_at AS 'to' FROM collection_gaps
    WHERE started_at<=? AND (ended_at IS NULL OR ended_at>=?) ORDER BY started_at DESC,id DESC LIMIT 100`)
    .all(period.to, period.from).map((gap) => ({ ...gap, from: Math.max(gap.from, period.from),
      to: gap.to === null ? null : Math.min(gap.to, period.to) }));
  const gapCounts = store.db.prepare(`SELECT COUNT(*) AS gapCount,COALESCE(SUM(ended_at IS NULL),0) AS openGapCount
    FROM collection_gaps WHERE started_at<=? AND (ended_at IS NULL OR ended_at>=?)`).get(period.to, period.from);
  const calendarDays = Math.round((Date.parse(`${period.lastDay}T00:00:00Z`) - Date.parse(`${period.firstDay}T00:00:00Z`)) / DAY) + 1;
  const notes = ['observed_only', 'source_scope', 'aggregate_history'];
  if (!detailAvailable && rows.length) notes.push('detailed_history_pruned');
  if (period.partial) notes.push('partial_period');
  if (rows.length < calendarDays) notes.push('unobserved_days');
  return { generatedAt: now, period, timeZone: cal.timeZone, scope, totals, processes, peakHours, gaps,
    coverage: { detailedSamples: raw.detailedSamples, firstDetailedAt: raw.firstDetailedAt, lastDetailedAt: raw.lastDetailedAt,
      observedDurationMs: raw.observedDurationMs, detailAvailable, aggregateDays: rows.length, calendarDays,
      ...gapCounts, gapsTruncated: gapCounts.gapCount > gaps.length, complete: false,
      measurement: 'recorded_process_bytes_mixed_sources_possible' }, notes };
}
