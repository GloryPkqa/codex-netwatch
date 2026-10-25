export const DEFAULT_BUDGET = Object.freeze({ dailyGB: 0, monthlyGB: 0, warnPercent: 80, scope: 'codex', desktopNotify: true });

export function validateBudget(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      !['codex', 'all'].includes(value.scope) || (value.desktopNotify !== undefined && typeof value.desktopNotify !== 'boolean') ||
      !Number.isInteger(value.warnPercent) || value.warnPercent < 1 || value.warnPercent > 99 ||
      !['dailyGB', 'monthlyGB'].every((key) => Number.isFinite(value[key]) && value[key] >= 0 && value[key] <= 1000000))
    throw new Error('预算应为 0–1000000 GB，预警比例应为 1–99 的整数');
  return { dailyGB: value.dailyGB, monthlyGB: value.monthlyGB, warnPercent: value.warnPercent, scope: value.scope, desktopNotify: value.desktopNotify ?? true };
}

// Freeze the calendar zone with the database, so moving the portable folder or
// changing the OS zone cannot silently reassign previously recorded days.
export function createBudgetCalendar(timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone) {
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  let cachedMinute, cachedDay;
  return { timeZone, day(at) {
    const minute = Math.floor(at / 60000);
    if (minute !== cachedMinute) {
      const parts = Object.fromEntries(formatter.formatToParts(at).map((p) => [p.type, p.value]));
      cachedDay = `${parts.year}-${parts.month}-${parts.day}`;
      cachedMinute = minute;
    }
    return cachedDay;
  } };
}

export function budgetPeriod(kind, key, rows, settings) {
  const prefix = settings.scope === 'all' ? 'all' : 'codex';
  const usedBytes = rows.reduce((n, row) => n + row[`${prefix}_up`] + row[`${prefix}_down`], 0);
  const limitBytes = Math.round(settings[kind === 'day' ? 'dailyGB' : 'monthlyGB'] * 1e9);
  const enabled = limitBytes > 0;
  const ratio = enabled ? usedBytes / limitBytes : null;
  return { kind, key, usedBytes, limitBytes, enabled, ratio,
    remainingBytes: enabled ? Math.max(0, limitBytes - usedBytes) : null,
    overBytes: enabled ? Math.max(0, usedBytes - limitBytes) : 0,
    state: !enabled ? 'disabled' : ratio >= 1 ? 'exceeded' : ratio >= settings.warnPercent / 100 ? 'warning' : 'normal' };
}
