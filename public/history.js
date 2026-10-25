import { translate } from './i18n.js';

const noteMessages = {
  observed_only: '只汇总已采集的上传与下载；离线流量和采集缺口不会补算。',
  source_scope: '原生采集记录进程网络事件，Mihomo 仅覆盖其控制器连接；历史可能包含不同采集口径，不等同于套餐账单。',
  aggregate_history: '用量来自保留的每日汇总；进程、小时和缺口明细仅来自仍保留的详细历史。',
  detailed_history_pruned: '部分详细历史已清理或未采集，进程与高峰列表不能代表全部汇总用量。',
  partial_period: '当前周期尚未结束，报告截至本次生成时刻。',
  unobserved_days: '此周期包含无记录日期，无记录不代表零用量。',
  comparable_detail_missing: '同期详细记录不足，不计算变化比例。',
};
const gapMessages = {
  initial_baseline: '首次建立基线', collector_restart: '程序重启', source_unavailable: '采集源断线',
  sampling_delay: '采样延迟或休眠', clock_changed: '系统时间变化', collector_error: '采集失败',
  native_events_lost: 'Windows 网络事件丢失',
  disconnected: '采集源断线', collection_failed: '采集源断线', source_disconnected: '采集源断线',
  suspended: '休眠或采样暂停', sleep: '休眠或采样暂停', sampling_gap: '采样间隔过长',
  restart: '程序重启', process_restart: '程序重启', source_changed: '采集源切换',
  capture_changed: '采集源切换', observer_unavailable: '进程识别受限',
};

export function shiftMonth(month, offset) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null;
  const [year, number] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, number - 1 + offset, 1));
  const result = date.toISOString().slice(0, 7);
  return /^\d{4}-\d{2}$/.test(result) && result >= '2000-01' && result <= '2099-12' ? result : null;
}

export function comparisonChange(current, previous) {
  if (!current?.detailAvailable || !previous?.detailAvailable || current.comparable === false || previous.comparable === false
    || !Number.isFinite(current.totalBytes) || !Number.isFinite(previous.totalBytes)) return null;
  if (previous.totalBytes === 0) return current.totalBytes === 0 ? 0 : null;
  return (current.totalBytes - previous.totalBytes) / previous.totalBytes * 100;
}

function escape(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}
export function formatBytes(value) {
  if (!Number.isFinite(value)) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let index = 0;
  while (value >= 1000 && index < units.length - 1) { value /= 1000; index++; }
  return `${value.toFixed(index === 0 ? 0 : value >= 100 ? 1 : 2)} ${units[index]}`;
}
function number(value, locale) { return Number.isFinite(value) ? value.toLocaleString(locale) : '—'; }
function reportTime(value, locale, timeZone) {
  return Number.isFinite(value) ? new Date(value).toLocaleString(locale, { timeZone, hour12: false }) : '—';
}

// Every dynamic value is escaped. The downloaded report is a self-contained,
// script-free document, so process names never become active markup or URLs.
export function reportMarkup(report, language = 'en') {
  const t = (message, values) => translate(message, language, values);
  const locale = language === 'en' ? 'en-US' : 'zh-CN';
  const period = report.period;
  const totals = report.totals;
  const coverage = report.coverage;
  const scope = t(report.scope === 'all' ? '全部已观测进程' : '仅 Codex');
  const time = (value) => reportTime(value, locale, report.timeZone);
  const heading = (label) => `<h3>${escape(t(label))}</h3>`;
  const table = (headers, rows) => `<div class="report-table-wrap"><table><thead><tr>${headers.map((label) => `<th>${escape(t(label))}</th>`).join('')}</tr></thead><tbody>${rows.length
    ? rows.map((cells) => `<tr>${cells.map((cell) => `<td>${escape(cell)}</td>`).join('')}</tr>`).join('')
    : `<tr><td colspan="${headers.length}">${escape(t('没有可用的详细记录'))}</td></tr>`}</tbody></table></div>`;
  const up = report.scope === 'all' ? totals.allUp : totals.codexUp;
  const down = report.scope === 'all' ? totals.allDown : totals.codexDown;
  const notes = (report.notes || []).map((code) => noteMessages[code]).filter(Boolean);
  if (coverage.gapsTruncated) notes.push('缺口列表仅展示最近 100 条。');
  return `<div class="report-summary"><div><p class="report-kicker">CODEX NETWATCH / ${escape(t(period.kind === 'week' ? '周报' : '日报'))}</p><h3>${escape(period.label)}</h3><p>${escape(scope)} · ${escape(report.timeZone)}</p></div><div class="report-total"><strong>${escape(formatBytes(totals.bytes))}</strong><span>${escape(t('已观测上传与下载'))}</span></div></div>
    <div class="report-metrics"><div><span>${escape(t('上传'))}</span><strong>${escape(formatBytes(up))}</strong></div><div><span>${escape(t('下载'))}</span><strong>${escape(formatBytes(down))}</strong></div><div><span>${escape(t('有记录日期'))}</span><strong>${escape(t('{recorded} / {total} 天', { recorded: coverage.aggregateDays, total: coverage.calendarDays }))}</strong></div><div><span>${escape(t('已记录缺口'))}</span><strong>${escape(number(coverage.gapCount, locale))}</strong></div></div>
    <p class="report-coverage">${escape(t('保留明细 {samples} 个采样 · 已观测时长 {hours} 小时', { samples: number(coverage.detailedSamples, locale), hours: ((coverage.observedDurationMs || 0) / 3600000).toFixed(2) }))}<br>${escape(t('明细首末记录：{from} 至 {to}', { from: time(coverage.firstDetailedAt), to: time(coverage.lastDetailedAt) }))}</p>
    <div class="report-detail-grid"><section>${heading('主要进程')}${table(['进程', '上传', '下载'], (report.processes || []).map((item) => [item.process || t('待识别进程'), formatBytes(item.up), formatBytes(item.down)]))}</section><section>${heading('高用量时段')}${table(['时段起点', '已观测流量'], (report.peakHours || []).map((item) => [time(item.at) + (item.partial ? ` · ${t('部分时段')}` : ''), formatBytes(item.bytes)]))}</section></div>
    <section>${heading('采集缺口')}${(report.gaps || []).length ? table(['原因', '开始', '结束'], report.gaps.map((gap) => [t(gapMessages[gap.reason] || '其他采集缺口'), time(gap.from), gap.to === null ? t('仍在持续') : time(gap.to)])) : `<p class="report-coverage">${escape(t('保留明细中没有已记录缺口；这不代表完整覆盖。'))}</p>`}</section>
    <section class="report-notes">${heading('统计口径')}<ul>${[...new Set(notes)].map((note) => `<li>${escape(t(note))}</li>`).join('')}</ul></section>
    <p class="report-generated">${escape(t('本地生成于 {time}', { time: time(report.generatedAt ?? Date.now()) }))} · GB = 10⁹ ${escape(t('字节'))}</p>`;
}

export function reportDocument(report, language = 'en') {
  const title = translate(report.period.kind === 'week' ? 'Codex Netwatch 周报' : 'Codex Netwatch 日报', language);
  return `<!doctype html><html lang="${language === 'zh-CN' ? 'zh-CN' : 'en'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${escape(title)} · ${escape(report.period.label)}</title><style>
    :root{color-scheme:light}*{box-sizing:border-box}body{max-width:1050px;margin:35px auto;padding:28px;color:#22382c;background:#fff;font:14px/1.6 'Segoe UI','Microsoft YaHei',sans-serif}h1{font-size:22px;margin:0 0 5px}h3{font-size:15px;margin:20px 0 8px}p{margin:6px 0}.print-note{color:#56685b;font-size:12px;margin-bottom:25px}.report-summary{display:flex;gap:24px;align-items:center;justify-content:space-between;border-top:3px solid #397951;padding:22px 0}.report-summary h3{font-size:25px;margin:0}.report-kicker{font-size:11px;letter-spacing:1.3px;color:#537461}.report-total{text-align:right;display:flex;flex-direction:column}.report-total strong{font-size:34px;line-height:1.3}.report-total span,.report-metrics span{font-size:12px;color:#56685b}.report-metrics{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid #d4e2d8;border-radius:8px;margin-bottom:16px}.report-metrics>div{display:flex;flex-direction:column;padding:14px}.report-metrics strong{font-size:18px}.report-coverage,.report-generated{color:#56685b;font-size:12px}.report-detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:28px}.report-table-wrap{overflow-wrap:anywhere}table{border-collapse:collapse;width:100%;font-size:12px}th,td{padding:8px;text-align:left;border-bottom:1px solid #d4e2d8;vertical-align:top}th{color:#56685b;font-weight:500}.report-notes{margin-top:24px;padding:1px 16px 10px;background:#f3f7f4;border-radius:8px}.report-notes ul{padding-left:18px;font-size:12px}.report-generated{margin-top:24px;border-top:1px solid #d4e2d8;padding-top:10px}@media(max-width:650px){body{margin:0;padding:20px}.report-summary,.report-detail-grid{display:block}.report-total{text-align:left;margin-top:16px}.report-metrics{grid-template-columns:1fr 1fr}}@media print{body{max-width:none;margin:0;padding:0;font-size:11pt}.print-note{display:none}.report-summary,.report-metrics,tr{break-inside:avoid}h3{break-after:avoid}.report-notes{background:white}a{color:inherit}}
  </style></head><body><h1>${escape(title)}</h1><p class="print-note">${escape(translate('离线报告 · 使用浏览器打印可保存为 PDF。', language))}</p>${reportMarkup(report, language)}</body></html>`;
}

export function createHistoryPanels({ api, t, language, toast }) {
  const $ = (id) => document.getElementById(id);
  const node = (tag, text, className = '') => {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    return element;
  };
  let calendar = null, report = null, calendarSequence = 0, reportSequence = 0;
  let lastRefresh = 0, reportDateChosen = false, today = null;
  const localDate = (timeZone) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  $('historyMonth').value = localDate().slice(0, 7);
  $('historyMonth').min = '2000-01';
  $('reportDate').value = localDate();

  function renderCalendar() {
    if (!calendar) return;
    const locale = language() === 'en' ? 'en-US' : 'zh-CN';
    $('historyContext').textContent = t('{scope} · {zone} · 每日汇总', { scope: t(calendar.scope === 'all' ? '全部已观测进程' : '仅 Codex'), zone: calendar.timeZone });
    $('calendarWeekdays').replaceChildren(...Array.from({ length: 7 }, (_, index) => node('span', new Date(Date.UTC(2024, 0, 1 + index)).toLocaleDateString(locale, { weekday: 'short', timeZone: 'UTC' }))));
    const [year, month] = calendar.month.split('-').map(Number);
    const offset = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
    const days = calendar.days;
    const max = Math.max(0, ...days.map((day) => day.bytes || 0));
    const children = Array.from({ length: offset }, () => { const cell = node('span', '', 'calendar-blank'); cell.setAttribute('aria-hidden', 'true'); return cell; });
    for (const day of days) {
      const level = !day.observed ? 'unknown' : !day.bytes ? 'zero' : `heat-${Math.max(1, Math.min(4, Math.ceil(day.bytes / max * 4)))}`;
      const cell = node('button', undefined, `calendar-day ${level}`);
      cell.type = 'button';
      cell.disabled = day.future === true;
      cell.dataset.day = day.day;
      cell.setAttribute('aria-pressed', String($('reportKind').value === 'day' && day.day === $('reportDate').value));
      if (day.day === today) cell.setAttribute('aria-current', 'date');
      const usage = day.observed ? formatBytes(day.bytes) : t(day.future ? '尚未到来' : '无记录');
      cell.title = `${day.day} · ${usage}`;
      cell.setAttribute('aria-label', cell.title);
      cell.append(node('span', String(Number(day.day.slice(-2)))), node('small', usage));
      cell.addEventListener('click', () => {
        reportDateChosen = true;
        $('reportDate').value = day.day;
        $('reportKind').value = 'day';
        renderCalendar();
        loadReport();
        $('reports').scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      children.push(cell);
    }
    $('calendarDays').replaceChildren(...children);
    const observed = days.filter((day) => day.observed);
    $('calendarTotal').replaceChildren(node('span', t('所选月已观测')), node('strong', observed.length ? formatBytes(observed.reduce((sum, day) => sum + day.bytes, 0)) : '—'), node('small', t('{count} 天有记录', { count: observed.length })));
    $('historyComparison').replaceChildren(...[['today', 'yesterday', '今日 / 昨日同期'], ['thisWeek', 'lastWeek', '本周 / 上周同期']].map(([currentKey, previousKey, title]) => {
      const current = calendar.comparison[currentKey], previous = calendar.comparison[previousKey];
      const card = node('article', undefined, 'comparison-card');
      const change = comparisonChange(current, previous);
      card.append(node('h3', t(title)), node('strong', formatBytes(current?.totalBytes)), node('p', t('前期同期 {amount}', { amount: formatBytes(previous?.totalBytes) })));
      const state = change === null ? t('同期详细记录不足或基数为零') : change === 0 ? t('与前期同期持平') : t('较前期同期 {change}%', { change: `${change > 0 ? '+' : ''}${change.toFixed(1)}` });
      card.append(node('span', state, 'comparison-change'));
      return card;
    }));
    $('previousMonth').disabled = !shiftMonth(calendar.month, -1);
    $('nextMonth').disabled = calendar.month >= today.slice(0, 7);
  }

  function renderReport() {
    if (!report) return;
    // reportMarkup escapes all values from storage before creating markup.
    $('reportPreview').innerHTML = reportMarkup(report, language());
    $('reportStatus').textContent = t('{scope} · {zone} · {period}', { scope: t(report.scope === 'all' ? '全部已观测进程' : '仅 Codex'), zone: report.timeZone, period: report.period.label });
  }
  async function loadReport() {
    const sequence = ++reportSequence;
    report = null;
    $('exportReport').disabled = true;
    $('reportPreview').replaceChildren();
    $('reportStatus').textContent = t('正在生成本地报告…');
    try {
      const params = new URLSearchParams({ kind: $('reportKind').value, date: $('reportDate').value, scope: $('historyScope').value });
      const result = await (await api(`/api/report?${params}`)).json();
      if (sequence !== reportSequence) return;
      report = result;
      renderReport();
      $('exportReport').disabled = false;
    } catch (error) {
      if (sequence !== reportSequence) return;
      $('reportStatus').textContent = t('报告暂不可用：{message}', { message: error.message });
    }
  }
  async function loadCalendar() {
    const sequence = ++calendarSequence;
    $('historyStatus').textContent = t('正在读取每日汇总…');
    try {
      const params = new URLSearchParams({ month: $('historyMonth').value, scope: $('historyScope').value });
      const result = await (await api(`/api/calendar?${params}`)).json();
      if (sequence !== calendarSequence) return;
      calendar = result;
      today = result.today || localDate(result.timeZone);
      $('historyMonth').max = today.slice(0, 7);
      $('reportDate').max = today;
      if (!reportDateChosen) $('reportDate').value = today;
      renderCalendar();
      $('historyStatus').textContent = '';
    } catch (error) {
      if (sequence !== calendarSequence) return;
      $('historyStatus').textContent = t('日历暂不可用：{message}', { message: error.message });
    }
  }
  async function refresh(force = false) {
    if (!force && Date.now() - lastRefresh < 30000) return;
    lastRefresh = Date.now();
    await loadCalendar();
    if (force || !report || (!reportDateChosen && $('reportDate').value === today)) await loadReport();
  }
  $('historyMonth').addEventListener('change', () => {
    if ($('historyMonth').checkValidity() && $('historyMonth').value) loadCalendar();
  });
  for (const [id, amount] of [['previousMonth', -1], ['nextMonth', 1]]) $(''+id).addEventListener('click', () => {
    const next = shiftMonth($('historyMonth').value, amount);
    if (next && (!today || next <= today.slice(0, 7))) { $('historyMonth').value = next; loadCalendar(); }
  });
  $('historyScope').addEventListener('change', () => refresh(true));
  for (const id of ['reportKind', 'reportDate']) $(id).addEventListener('change', () => {
    reportDateChosen = true;
    if ($('reportDate').checkValidity() && $('reportDate').value) { renderCalendar(); loadReport(); }
  });
  $('refreshReport').addEventListener('click', () => loadReport());
  $('exportReport').addEventListener('click', () => {
    if (!report) return;
    const url = URL.createObjectURL(new Blob([reportDocument(report, language())], { type: 'text/html;charset=utf-8' }));
    const link = node('a');
    link.href = url;
    link.download = `codex-netwatch-${report.period.kind}-${report.period.date}-${report.scope}.html`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(t('本地报告已导出，可离线查看或打印为 PDF。'));
  });
  return { refresh, render() { renderCalendar(); renderReport(); }, setScope(scope) { if (['codex', 'all'].includes(scope) && $('historyScope').value !== scope) { $('historyScope').value = scope; refresh(true); } } };
}

export function createUpdatePanel({ api, t, currentVersion, toast }) {
  const $ = (id) => document.getElementById(id);
  let latest = null, polling = false, reconnecting = false, pollTimer = 0;
  let installVersion = null, installStartedAt = 0;
  const busyStates = ['checking', 'downloading', 'installing'];
  const errorMessages = {
    network_error: '无法连接 GitHub，请稍后重试。', check_failed: '无法检查更新，请稍后重试。',
    download_failed: '下载失败，请检查网络后重试。', checksum_mismatch: '文件校验失败，已取消安装。',
    install_unavailable: '请在 Windows 便携版中使用自动安装。', invalid_release: '发行包信息不完整，已取消更新。',
    update_failed: '更新失败，当前版本和数据已保留。',
    missing_checksum: '发行包缺少校验信息，已取消更新。', rate_limited: 'GitHub 请求次数受限，请稍后重试。',
    desktop_required: '请在 Windows 便携版中使用自动安装。', update_busy: '更新正在进行，请等待完成。',
    check_required: '请先重新检查更新，再开始安装。', install_failed: '安装未完成，请查看上次更新结果。',
  };
  function render() {
    const data = latest;
    if (!data) return;
    const busy = busyStates.includes(data.state);
    $('checkUpdate').disabled = busy;
    $('installUpdate').hidden = !data.available || !data.canInstall || busy;
    $('installUpdate').disabled = busy;
    $('updateInstallHint').hidden = !data.available || !data.canInstall;
    $('updateNotes').hidden = !data.notes;
    $('updateNotes').textContent = data.notes || '';
    // Only the fixed upstream release route becomes a clickable external link.
    const validUrl = /^https:\/\/github\.com\/GloryPkqa\/codex-netwatch\/releases(?:\/tag\/v[0-9]+\.[0-9]+\.[0-9]+|\/latest)?$/.test(data.url || '');
    $('updateRelease').hidden = !validUrl;
    if (validUrl) $('updateRelease').href = data.url;
    let message;
    if (data.state === 'checking') message = t('正在检查 GitHub 发行版…');
    else if (data.state === 'downloading') message = t('正在下载并校验更新… {progress}', { progress: Number.isFinite(data.progress) ? `${Math.min(100, Math.max(0, data.progress)).toFixed(0)}%` : '' });
    else if (data.state === 'installing') message = t('正在备份并安装，程序将自动重启…');
    else if (data.state === 'failed') message = t(errorMessages[data.error] || '更新未完成，请重试或查看发行说明。');
    else if (data.available) message = t('当前 v{current} · 可更新至 v{latest} · {size}', { current: data.currentVersion, latest: data.latestVersion, size: formatBytes(data.size) });
    else if (data.state === 'current') message = t('当前 v{version}，已是最新稳定版。', { version: data.currentVersion });
    else message = t('当前 v{version} · 点击检查更新连接 GitHub。', { version: data.currentVersion || currentVersion });
    if (data.available && !data.canInstall) message += ` ${t('请从发行页下载适合此环境的版本。')}`;
    $('updateStatus').textContent = message;
    const resultMessages = { completed: '上次更新已完成', failed: '上次更新未完成', rolled_back: '上次更新未成功，已恢复旧版本', rollback_failed: '自动恢复未完成，请使用备份恢复程序' };
    const result = data.lastResult;
    $('updateLastResult').hidden = !resultMessages[result?.state];
    $('updateLastResult').textContent = resultMessages[result?.state]
      ? `${t(resultMessages[result.state])}${result.version ? ` · v${result.version}` : ''}` : '';
  }
  async function poll() {
    clearTimeout(pollTimer);
    try {
      const data = await (await api('/api/update')).json();
      latest = data;
      if (data.currentVersion !== currentVersion && !busyStates.includes(data.state)) {
        polling = false;
        $('updateStatus').textContent = t('已更新至 v{version}，正在刷新界面…', { version: data.currentVersion });
        setTimeout(() => window.location.reload(), 1000);
        return;
      }
      reconnecting = false;
      polling = busyStates.includes(data.state);
      render();
      if (!polling && installVersion && data.lastResult?.version === installVersion
        && ['failed', 'rolled_back', 'rollback_failed'].includes(data.lastResult.state)) {
        $('updateStatus').textContent = t('本次更新未完成，请查看下方恢复结果。');
      }
    } catch {
      if (!polling) return;
      reconnecting = true;
      $('updateStatus').textContent = t('等待更新后的程序重新连接…');
    }
    if (reconnecting && installStartedAt && Date.now() - installStartedAt > 180000) {
      polling = false;
      $('checkUpdate').disabled = false;
      $('updateStatus').textContent = t('暂未确认更新结果，请重新打开程序检查版本。');
    }
    if (polling) pollTimer = setTimeout(poll, reconnecting ? 2500 : 1500);
  }
  $('checkUpdate').addEventListener('click', async () => {
    $('checkUpdate').disabled = true;
    $('updateStatus').textContent = t('正在检查 GitHub 发行版…');
    try {
      latest = await (await api('/api/update?check=1')).json();
      render();
      if (busyStates.includes(latest.state)) { polling = true; poll(); }
    } catch (error) {
      $('updateStatus').textContent = t('检查更新失败：{message}', { message: t(errorMessages[error.message] || error.message) });
    } finally { $('checkUpdate').disabled = busyStates.includes(latest?.state); }
  });
  $('installUpdate').addEventListener('click', async () => {
    if (!latest?.available || !latest.canInstall) return;
    $('installUpdate').disabled = true;
    $('checkUpdate').disabled = true;
    installVersion = latest.latestVersion;
    installStartedAt = Date.now();
    try {
      latest = await (await api('/api/update/install', { method: 'POST', body: JSON.stringify({ version: latest.latestVersion }) })).json();
      polling = true;
      render();
      poll();
    } catch (error) { toast(t(errorMessages[error.message] || error.message)); render(); }
  });
  return { render, async load() { try { latest = await (await api('/api/update')).json(); render(); if (busyStates.includes(latest.state) && !polling) { polling = true; poll(); } } catch { /* Older services remain usable. */ } } };
}
