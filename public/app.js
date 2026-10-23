import {
  readLanguage,
  readLanguagePreference,
  resolveLanguage,
  saveLanguage,
  translate,
  translateAlert,
  captureStaticTranslations,
} from './i18n.js';
import { createStartupBridge } from './desktop.js';
import { setupState, setupCopy } from './setup.js';
const browserLanguages = navigator.languages || [navigator.language];
let systemLocale = null,
  desktopInstance = '';
let language = readLanguage(safeStorage(), browserLanguages);
const t = (message, values) => translate(message, language, values);
const locale = () => (language === 'en' ? 'en-US' : 'zh-CN');
function safeStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
const translateStatic = captureStaticTranslations(document.documentElement);
translateStatic(language);
document.documentElement.lang = language;
document.getElementById('language').value = readLanguagePreference(safeStorage());
// Render the preferred language before waiting for local health/locale discovery.
const bootstrap = await fetch('/api/health', { signal: AbortSignal.timeout(1500) })
  .then((response) => (response.ok ? response.json() : null))
  .catch(() => null);
systemLocale = typeof bootstrap?.systemLocale === 'string' ? bootstrap.systemLocale : null;
desktopInstance = /^[a-f0-9]{32,128}$/i.test(bootstrap?.desktopInstance || '')
  ? bootstrap.desktopInstance
  : '';
language = readLanguage(safeStorage(), browserLanguages, systemLocale);
translateStatic(language);
document.documentElement.lang = language;
const $ = (id) => document.getElementById(id);
const node = (tag, text, className = '') => {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (className) e.className = className;
  return e;
};
let latest = null,
  stopped = false,
  disconnected = false,
  customRange = null,
  sessionsSignature = '',
  alertsSignature = '',
  insightsSignature = '',
  lastAlertId = null,
  refreshSequence = 0;
let notificationEnabled = false;
try {
  notificationEnabled = safeStorage()?.getItem('codex-flow-notify') === 'yes';
} catch {
  /* Optional preference. */
}
const evidence = {
  process: '套接字 → 进程',
  descendant: 'Codex 子进程',
  mihomo: 'Mihomo 进程字段',
  etw: 'Windows 网络事件 → 进程',
  etw_descendant: 'Windows 网络事件 → Codex 子进程',
  none: '缺少进程证据',
};
const scopeName = { codex: 'Codex', unknown: '待识别', other: '其他进程', all: '全部进程' };
const stateName = {
  ready: '正常',
  starting: '初始化',
  error: '受限 / 失败',
  stopped: '已退出',
  unsupported: '此平台暂不支持',
  unavailable: '日志结构不兼容或不可读',
  demo: '演示模式',
};

function bytes(value) {
  if (value === null || value === undefined || !Number.isFinite(value))
    return { value: '—', unit: '' };
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (value >= 1000 && i < units.length - 1) {
    value /= 1000;
    i++;
  }
  return { value: value.toFixed(i === 0 ? 0 : value >= 100 ? 1 : 2), unit: units[i] };
}
function byteText(value, rate = false) {
  const b = bytes(value);
  return `${b.value}${b.unit ? ` ${b.unit}${rate ? '/s' : ''}` : ''}`;
}
function metric(id, value, rate = false) {
  const b = bytes(value);
  $(id).replaceChildren(
    node('span', b.value),
    node('small', b.unit ? `${b.unit}${rate ? '/s' : ''}` : ''),
  );
}
const clock = (value) =>
  value ? new Date(value).toLocaleTimeString(locale(), { hour12: false }) : '—';
const dateTime = (value) =>
  value ? new Date(value).toLocaleString(locale(), { hour12: false }) : '—';
const number = (value) =>
  value === null || value === undefined ? '—' : Number(value).toLocaleString(locale());
function toast(message) {
  (document.querySelector('dialog[open]') || document.body).append($('toast'));
  $('toast').textContent = message;
  $('toast').hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => ($('toast').hidden = true), 4500);
}

async function api(url, options = {}) {
  if (url === '/api/stop') {
    try {
      const health = await (
        await fetch('/api/health', { signal: AbortSignal.timeout(1500) })
      ).json();
      if (health.app === 'codex-flow')
        desktopInstance = /^[a-f0-9]{32,128}$/i.test(health.desktopInstance || '')
          ? health.desktopInstance
          : '';
    } catch {
      /* Existing marker can still stop the current desktop instance. */
    }
  }
  const response = await fetch(url, {
    ...options,
    headers: {
      'X-Codex-Flow': '1',
      ...(desktopInstance ? { 'X-Codex-Desktop-Token': desktopInstance } : {}),
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(t(error.error || '请求失败 ({status})', { status: response.status }));
  }
  return response;
}
function params() {
  const p = new URLSearchParams({ range: $('range').value, scope: $('scope').value });
  if ($('range').value === 'custom' && customRange) {
    p.set('from', customRange.from);
    p.set('to', customRange.to);
  }
  return p;
}

function render(data) {
  latest = data;
  renderSetup();
  const { status: s, totals: totals } = data;
  renderCapture(s);
  $('statusPill').className = `status-pill ${s.state}`;
  $('statusText').textContent =
    s.state === 'connected'
      ? s.demo
        ? t('演示采集中')
        : t('实时采集中')
      : s.state === 'disconnected'
        ? t('等待接口恢复')
        : t('初始化中');
  metric('totalBytes', totals.codex_up + totals.codex_down);
  metric('allBytes', totals.all_up + totals.all_down);
  metric('speed', s.upRate === null ? null : s.upRate + s.downRate, true);
  $('upBytes').textContent = byteText(totals.codex_up);
  $('downBytes').textContent = byteText(totals.codex_down);
  $('upRate').textContent = byteText(s.upRate, true);
  $('downRate').textContent = byteText(s.downRate, true);
  const all = totals.all_up + totals.all_down,
    codex = totals.codex_up + totals.codex_down;
  $('share').textContent = all
    ? t('Codex 已识别字节 / 全部已观测字节：{share}%', { share: ((codex / all) * 100).toFixed(1) })
    : t('从建立基线之后开始累计');
  $('codexConnections').textContent = s.codexConnections;
  $('unknownConnections').textContent = t('全部 {total} 条 · {unknown} 条待识别进程', {
    total: s.connections,
    unknown: s.unknownConnections,
  });
  $('banner').className = s.demo ? 'banner demo' : 'banner';
  $('banner').hidden =
    s.state === 'connected' && !s.demo && s.observer === 'ready' && s.unknownConnections === 0;
  $('banner').textContent = s.demo
    ? t('当前为演示模式，全部流量为合成数据，与真实监控数据库分开保存。')
    : t(s.error) ||
      (s.observer !== 'ready'
        ? t(
            s.observer === 'unsupported'
              ? '当前平台不支持套接字识别；仍可使用代理提供的进程信息。缺少证据的流量列为待识别。'
              : ['error', 'stopped'].includes(s.observer)
                ? 'Windows 进程识别暂不可用，正在重试。缺少证据的流量列为待识别，不计入 Codex。'
                : '正在准备 Windows 进程识别。缺少证据的连接暂列为「待识别」，不计入 Codex。',
          )
        : t('有 {count} 条连接缺少进程证据，可在「连接与去向」切换到「待识别进程」排查。', {
            count: s.unknownConnections,
          }));
  $('rangeLabel').textContent = `${dateTime(data.range.from)} — ${clock(data.range.to)}`;
  $('updatedAt').textContent = t('最近采集 {time} · 采样 {seconds}s', {
    time: s.lastAt ? dateTime(s.lastAt) : t('尚无数据'),
    seconds: s.intervalMs / 1000,
  });
  $('chartEmpty').hidden = data.trend.length >= 2;
  $('domainCaption').textContent = t('{scope} · 已观测连接字节', {
    scope: t(scopeName[$('scope').value]),
  });
  renderDomains(data.domains);
  renderConnections();
  renderSessions(data.sessions);
  renderDiagnostics(s);
  renderAlerts(data.alerts);
  renderInsights(data.insights);
  drawChart();
}
const anomalyNames = {
  upload_burst: '突发上传',
  download_burst: '突发下载',
  sustained_upload: '持续上传',
};
const gapNames = {
  initial_baseline: '首次建立基线',
  collector_restart: '程序重启',
  source_unavailable: '采集源断线',
  source_changed: '采集源切换',
  sampling_delay: '采样延迟或休眠',
  observer_unavailable: '进程识别不可用',
  clock_changed: '系统时间变化',
  collector_error: '采集失败',
  native_events_lost: 'Windows 网络事件丢失',
};
function duration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  return ms < 60000
    ? t('{value} 秒', { value: (ms / 1000).toFixed(1) })
    : t('{value} 分钟', { value: (ms / 60000).toFixed(1) });
}
function renderInsights(data) {
  const processScope = $('processScope').value;
  const signature = language + processScope + JSON.stringify(data);
  if (signature === insightsSignature) return;
  insightsSignature = signature;
  const events = $('anomalyRows'),
    gaps = $('gapRows'),
    processes = $('processRows');
  events.replaceChildren();
  gaps.replaceChildren();
  processes.replaceChildren();
  const c = data?.coverage;
  $('coverageSummary').textContent = c
    ? t('连接记录 {bytes} · 未识别 {unknown}（{share}）· 采集源总量 {proxy}', {
        bytes: byteText(c.totalConnectionBytes),
        unknown: byteText(c.unknownBytes),
        share: c.unknownShare === null ? '—' : `${(c.unknownShare * 100).toFixed(1)}%`,
        proxy: byteText(c.reportedProxyBytes),
      })
    : t('等待观测记录');
  if (!data?.anomalies?.length)
    emptyRow(events, 4, t('所选范围没有已记录异常。阈值提醒不会阻断网络。'));
  for (const event of data?.anomalies || []) {
    const tr = node('tr'),
      kind = node('td', t(anomalyNames[event.kind] || '未知')),
      window = node('td', `${dateTime(event.from)} — ${clock(event.to)}`),
      context = node('td', event.process || t('尚未识别'), 'anomaly-context'),
      value = node('td', byteText(event.bytes), 'number');
    kind.append(node('small', duration(event.to - event.from)));
    context.append(
      node('small', event.host || '—'),
      node('small', t('主要观测连接，非全部字节归因')),
    );
    context.title = `${event.process || ''} / ${event.host || ''}`;
    const inspect = node('button', t('查看连接 ↘'), 'button secondary small');
    inspect.addEventListener('click', () => {
      $('scope').value = 'codex';
      $('search').value = event.host || event.process || '';
      $('range').value = 'custom';
      customRange = { from: event.from, to: event.to };
      const inputTime = (at) =>
        new Date(at - new Date(at).getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      $('fromTime').value = inputTime(event.from);
      $('toTime').value = inputTime(Math.ceil(event.to / 60000) * 60000);
      $('customRange').hidden = false;
      $('exportButton').disabled = false;
      refreshNow();
      $('connections').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    context.append(inspect);
    value.append(node('small', `↑ ${byteText(event.up)} · ↓ ${byteText(event.down)}`));
    tr.append(kind, window, context, value);
    events.append(tr);
  }
  if (!data?.gaps?.length) gaps.append(node('p', t('所选范围没有已记录采集缺口。'), 'empty'));
  for (const gap of (data?.gaps || []).slice(0, 20)) {
    const row = node('div', undefined, 'gap-row'),
      line = node('div');
    const from = Math.max(gap.from, latest.range.from),
      to = Math.min(gap.to ?? latest.range.to, latest.range.to);
    line.append(
      node('strong', t(gapNames[gap.reason] || '采集失败')),
      node('span', gap.to === null ? t('尚未恢复') : duration(to - from)),
    );
    row.append(
      line,
      node('small', `${dateTime(from)} — ${gap.to === null ? t('持续中') : clock(to)}`),
    );
    gaps.append(row);
  }
  const codexOnly = processScope !== 'all';
  $('processTitle').textContent = t(codexOnly ? 'Codex 进程流量排行' : '全部已观测进程流量排行');
  $('processCaption').textContent = t(
    codexOnly
      ? '仅显示已识别的 Codex 进程及子进程，按上传与下载合计排序，最多 8 项。'
      : '对照全部已观测程序的用量；其他进程和待识别流量不会计入 Codex，最多 8 项。',
  );
  const processData = codexOnly
    ? data?.codexProcesses || (data?.processes || []).filter((row) => row.scope === 'codex')
    : data?.processes;
  if (!processData?.length)
    emptyRow(
      processes,
      3,
      t(codexOnly ? '所选范围暂无已识别的 Codex 进程流量。' : '暂无进程流量排行。'),
    );
  for (const process of (processData || []).slice(0, 8)) {
    const tr = node('tr'),
      identity = node('td', process.process || t('待识别'));
    identity.append(
      node(
        'small',
        `${t(scopeName[process.scope] || '全部进程')} · ${process.pidCount ? t('{count} 个 PID', { count: process.pidCount }) : t('PID 未知')}`,
      ),
    );
    identity.title = process.process || t('待识别');
    if (process.scope === 'codex') identity.querySelector('small').classList.add('codex-evidence');
    tr.append(
      identity,
      node('td', byteText(process.up), 'number'),
      node('td', byteText(process.down), 'number'),
    );
    processes.append(tr);
  }
}
function renderDomains(rows) {
  const wrap = $('domains');
  wrap.replaceChildren();
  if (!rows.length) {
    wrap.append(node('p', t('此范围暂无已观测流量。监控不会补算启动前的流量。'), 'empty'));
    return;
  }
  const max = Math.max(...rows.map((x) => x.up + x.down), 1);
  for (const row of rows) {
    const item = node('div', undefined, 'domain-row'),
      line = node('div', undefined, 'domain-line');
    const host = node('span', row.host, 'domain-host');
    host.title = row.host;
    line.append(host, node('span', byteText(row.up + row.down), 'domain-value'));
    const progress = node('progress');
    progress.max = max;
    progress.value = row.up + row.down;
    progress.setAttribute('aria-label', `${row.host} ${byteText(row.up + row.down)}`);
    item.append(line, progress);
    wrap.append(item);
  }
}
function emptyRow(body, columns, message) {
  const tr = node('tr'),
    td = node('td', message, 'empty');
  td.colSpan = columns;
  tr.append(td);
  body.append(tr);
}
function renderConnections() {
  if (!latest) return;
  const query = $('search').value.toLowerCase();
  const rows = latest.connections.filter((x) =>
    `${x.host} ${x.process} ${x.pid || ''}`.toLowerCase().includes(query),
  );
  const body = $('connectionRows');
  body.replaceChildren();
  if (!rows.length) {
    emptyRow(body, 7, t('暂无匹配的流量记录。保持监控运行，产生新流量后会自动显示。'));
    return;
  }
  for (const row of rows) {
    const tr = node('tr'),
      host = node('td', row.host === '未知地址' ? t(row.host) : row.host, 'host-cell');
    host.title = row.host;
    const process = node('td', row.process || t('尚未识别'), 'process-cell');
    process.append(
      node(
        'small',
        row.pid ? `PID ${row.pid} · ${row.network.toUpperCase()}` : row.network.toUpperCase(),
      ),
    );
    const tag = node('td');
    tag.append(
      node(
        'span',
        t(evidence[row.evidence] || '未知'),
        `evidence-tag ${row.scope === 'unknown' ? 'unknown' : ''}`,
      ),
    );
    tr.append(
      host,
      process,
      tag,
      node('td', byteText(row.up), 'number'),
      node('td', byteText(row.down), 'number'),
      node('td', byteText(row.up + row.down), 'number'),
      node('td', clock(row.last_seen)),
    );
    body.append(tr);
  }
}
function renderSessions(rows) {
  const originalCount = rows.length;
  const query = $('sessionSearch').value.toLowerCase();
  rows = rows
    .filter((x) => `${x.title} ${x.id} ${x.model}`.toLowerCase().includes(query))
    .slice(0, Number($('sessionLimit').value));
  const signature = language + JSON.stringify(rows);
  if (signature === sessionsSignature) return;
  sessionsSignature = signature;
  const body = $('sessionRows');
  body.replaceChildren();
  if (!rows.length) {
    emptyRow(
      body,
      6,
      originalCount
        ? t('未找到匹配的会话，可更换搜索词。')
        : t('尚未读取到会话记录。网络流量采集可独立运行。'),
    );
    return;
  }
  for (const row of rows) {
    const tr = node('tr'),
      title = node('td', sessionTitle(row), 'session-cell');
    title.title = sessionTitle(row);
    title.append(node('small', row.id));
    const total = node('td', number(row.total_tokens), 'number');
    total.title = t('输入 {input}；其中缓存 {cached}；输出 {output}。缓存已包含在输入中。', {
      input: number(row.input_tokens),
      cached: number(row.cached_tokens),
      output: number(row.output_tokens),
    });
    const action = node('td'),
      button = node('button', t('观察窗口 ↗'), 'button secondary small');
    button.addEventListener('click', () => showCorrelation(row));
    action.append(button);
    tr.append(
      title,
      node('td', row.model || '—'),
      total,
      node('td', number(row.observed_tokens), 'number'),
      node('td', dateTime(row.activity)),
      action,
    );
    body.append(tr);
  }
}
let correlationSequence = 0;
const sessionTitle = (session) =>
  latest?.status.demo && session.id.startsWith('demo-session-') ? t(session.title) : session.title;
async function showCorrelation(session) {
  const sequence = ++correlationSequence;
  try {
    const p = params();
    p.set('id', session.id);
    const result = await (await api(`/api/correlation?${p}`)).json();
    if (sequence !== correlationSequence) return;
    const content = $('correlationContent');
    content.replaceChildren();
    const info = node('div', undefined, 'correlation-info');
    info.append(
      node('p', sessionTitle(session)),
      node(
        'strong',
        result.samples
          ? t('{count} 次采样处于日志活动窗口', { count: result.samples })
          : t('所选时间范围内没有重合采样'),
      ),
      node(
        'p',
        result.samples
          ? t('{from} 至 {to}', { from: dateTime(result.first_at), to: dateTime(result.last_at) })
          : t('监控开始之后，最近 60 秒有日志变动的会话才会列入活动窗口。'),
      ),
      node('p', t(result.message)),
      node(
        'p',
        t('各会话的网络字节：待归属。可暂停其他会话、单独运行目标会话，观察进程和域名流量变化。'),
      ),
    );
    content.append(info);
    if (!$('correlationDialog').open) $('correlationDialog').showModal();
  } catch (error) {
    if (sequence === correlationSequence) toast(error.message);
  }
}
function renderDiagnostics(s) {
  const rows = [
    [t('流量采集方式'), captureName(s.capture?.active)],
    [t('数据接口'), t(s.endpoint) || t('正在探测本地接口')],
    [t('Windows 进程识别'), t(stateName[s.observer] || s.observer)],
    [t('Codex 会话读取'), t(stateName[s.sessionReader] || s.sessionReader)],
    [t('当前进程快照'), t('{count} 个进程', { count: s.processes })],
    [t('本次监控启动'), dateTime(s.startedAt)],
    [t('数据保留'), t('{days} 天', { days: s.retentionDays })],
    [t('提醒阈值'), t('{amount} MB / 60 秒', { amount: s.alertMBPerMinute })],
    [t('采集器内存（Node）'), byteText(s.diagnostics?.memory?.rss)],
    [
      t('上次采集耗时'),
      Number.isFinite(s.diagnostics?.lastPollMs)
        ? `${s.diagnostics.lastPollMs.toFixed(1)} ms`
        : '—',
    ],
    [t('采集失败次数'), number(s.diagnostics?.failures)],
  ];
  $('diagnosticList').replaceChildren(
    ...rows.map(([label, value]) => {
      const div = node('div');
      div.append(node('dt', label), node('dd', value));
      return div;
    }),
  );
  if (!$('settingsDialog').open) $('threshold').value = s.alertMBPerMinute;
}
let captureBusy = false;
function captureName(active) {
  return t(active === 'native' ? 'Windows 原生采集' : active === 'mihomo' ? 'Mihomo 兼容接口' : active === 'demo' ? '演示模式' : '尚无可用采集源');
}
function renderCapture(status) {
  const capture = status.capture || {};
  $('captureStatus').textContent = captureName(capture.active) + ' · ' +
    t(capture.nativeState === 'ready' ? '原生采集已授权' : capture.nativeState === 'starting' ? '正在等待 Windows 授权' : '原生采集需要授权');
  $('captureBadge').textContent = captureName(capture.active);
  if (!captureBusy) $('captureMode').value = capture.mode === 'demo' ? 'auto' : capture.mode || 'auto';
  $('captureMode').disabled = captureBusy || status.demo;
  $('authorizeCapture').disabled = captureBusy || status.demo || capture.nativeState === 'ready' || capture.nativeState === 'unsupported';
}
async function changeCapture(authorize) {
  if (captureBusy) return;
  captureBusy = true;
  const mode = $('captureMode').value;
  $('captureMode').disabled = $('authorizeCapture').disabled = true;
  if (authorize) $('captureStatus').textContent = t('请在 Windows 授权窗口中选择是；取消授权不会关闭程序。');
  try {
    await api('/api/capture', { method: 'POST', body: JSON.stringify({ mode: authorize && mode === 'mihomo' ? 'native' : mode, authorize }) });
    toast(t('采集方式已更新'));
  } catch (error) { toast(error.message); }
  finally { captureBusy = false; refresh(); }
}
$('captureMode').addEventListener('change', () => changeCapture(false));
$('authorizeCapture').addEventListener('click', () => changeCapture(true));
function renderAlerts(rows) {
  if (
    lastAlertId !== null &&
    rows[0]?.id > lastAlertId &&
    notificationEnabled &&
    'Notification' in window &&
    Notification.permission === 'granted'
  )
    new Notification(t('Codex Netwatch · 流量提醒'), {
      body: translateAlert(rows[0].message, language),
      icon: '/icon.svg',
    });
  lastAlertId = rows[0]?.id || 0;
  const signature = language + JSON.stringify(rows);
  if (signature === alertsSignature) return;
  alertsSignature = signature;
  $('alerts').replaceChildren();
  if (!rows.length) {
    $('alerts').append(node('p', t('没有阈值提醒。持续采集时会自动检查最近 60 秒流量。'), 'empty'));
    return;
  }
  for (const row of rows) {
    const div = node('div', translateAlert(row.message, language), 'alert-row');
    div.append(node('small', dateTime(row.at)));
    $('alerts').append(div);
  }
}

function drawChart(hover = -1) {
  const canvas = $('chart'),
    rect = canvas.getBoundingClientRect();
  if (!rect.width || !latest) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const w = rect.width,
    h = rect.height,
    left = 57,
    right = w - 16,
    top = 20,
    bottom = h - 28;
  const data = latest.trend.map((x) => ({
    ...x,
    up: x.up / Math.max(1, x.duration / 1000),
    down: x.down / Math.max(1, x.duration / 1000),
    all: x.all_bytes / Math.max(1, x.duration / 1000),
  }));
  const max = Math.max(1000, ...data.map((x) => Math.max(x.up, x.down, x.all))) * 1.15;
  const from = latest.range.from,
    to = latest.range.to;
  const x = (t) => left + ((t - from) / Math.max(1, to - from)) * (right - left);
  const y = (v) => bottom - (v / max) * (bottom - top);
  ctx.font = '9px Segoe UI, sans-serif';
  ctx.fillStyle = '#718779';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const yi = top + ((bottom - top) * i) / 4;
    ctx.strokeStyle = '#29362e';
    ctx.beginPath();
    ctx.moveTo(left, yi);
    ctx.lineTo(right, yi);
    ctx.stroke();
    ctx.textAlign = 'right';
    ctx.fillText(byteText(max * (1 - i / 4), true), left - 8, yi + 3);
  }
  ctx.textAlign = 'center';
  for (let i = 0; i <= 4; i++) {
    const t = from + ((to - from) * i) / 4;
    ctx.fillText(
      new Date(t).toLocaleTimeString(locale(), {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }),
      left + ((right - left) * i) / 4,
      h - 7,
    );
  }
  function line(key, color, dashed = false) {
    ctx.beginPath();
    let previous = null;
    for (const point of data) {
      const gap = previous && point.at - previous.at > Math.max(5000, ((to - from) / 180) * 2);
      if (!previous || gap) ctx.moveTo(x(point.at), y(point[key]));
      else ctx.lineTo(x(point.at), y(point[key]));
      previous = point;
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = dashed ? 1 : 1.8;
    ctx.setLineDash(dashed ? [4, 4] : []);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(left, top, right - left, bottom - top);
  ctx.clip();
  line('all', '#56685b', true);
  line('down', '#8cbdec');
  line('up', '#a3edc0');
  if (hover >= 0 && data.length) {
    const target = from + ((hover - left) / (right - left)) * (to - from);
    const point = data.reduce((a, b) =>
      Math.abs(a.at - target) < Math.abs(b.at - target) ? a : b,
    );
    ctx.strokeStyle = '#657c6c';
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(x(point.at), top);
    ctx.lineTo(x(point.at), bottom);
    ctx.stroke();
    ctx.setLineDash([]);
    $('chartHint').textContent = t('{time} · ↑ {up} · ↓ {down} · 全部 {all}', {
      time: clock(point.at),
      up: byteText(point.up, true),
      down: byteText(point.down, true),
      all: byteText(point.all, true),
    });
  }
  ctx.restore();
}

async function refresh() {
  if (stopped) return;
  const sequence = ++refreshSequence;
  clearTimeout(refresh.timer);
  try {
    if ($('range').value === 'custom' && !customRange) return;
    if (!document.hidden || !latest) {
      const data = await (await api(`/api/dashboard?${params()}`)).json();
      if (sequence === refreshSequence && !stopped) {
        disconnected = false;
        render(data);
      }
    }
  } catch {
    if (sequence !== refreshSequence || stopped) return;
    disconnected = true;
    renderUnavailable();
  } finally {
    if (!stopped && sequence === refreshSequence) refresh.timer = setTimeout(refresh, 2000);
  }
}
function renderUnavailable() {
  renderSetup(true);
  $('statusPill').className = 'status-pill disconnected';
  $('statusText').textContent = t(stopped ? '采集已停止' : '监控程序未连接');
  if (!stopped) {
    $('banner').className = 'banner';
    $('banner').hidden = false;
    $('banner').textContent = t(
      '无法连接本地监控程序。已显示的数据保留在页面上；请重新运行启动脚本。',
    );
  }
  metric('speed', null);
  $('upRate').textContent = '—';
  $('downRate').textContent = '—';
}
function refreshNow() {
  clearTimeout(refresh.timer);
  refresh();
}
let setupAcknowledged = false,
  setupVisibility = null;
try {
  setupAcknowledged = safeStorage()?.getItem('codex-netwatch-setup-seen') === 'yes';
} catch {
  /* Optional preference. */
}
function acknowledgeSetup() {
  setupAcknowledged = true;
  try {
    safeStorage()?.setItem('codex-netwatch-setup-seen', 'yes');
  } catch {
    /* Optional preference. */
  }
}
function renderSetup(unavailable = disconnected || stopped) {
  const state = setupState(latest?.status, latest?.totals, unavailable);
  const copy = setupCopy[state];
  $('setupStatus').textContent = t(copy[0]);
  $('setupHint').textContent = t(copy[1]);
  $('setupGuide').dataset.state = state;
  // Existing profiles with observed data need no automatic walkthrough.
  if (state === 'ready') acknowledgeSetup();
  const visible = setupVisibility ?? (!setupAcknowledged && state !== 'demo');
  $('setupGuide').hidden = !visible;
  $('setupButton').setAttribute('aria-expanded', String(visible));
}
$('setupButton').addEventListener('click', () => {
  setupVisibility = $('setupGuide').hidden;
  if (!setupVisibility) acknowledgeSetup();
  renderSetup();
  if (setupVisibility) $('setupGuide').scrollIntoView({ block: 'start', behavior: 'instant' });
});
$('closeSetup').addEventListener('click', () => {
  setupVisibility = false;
  acknowledgeSetup();
  renderSetup();
  $('setupButton').focus();
});
$('retrySetup').addEventListener('click', refreshNow);
$('setupDiagnostics').addEventListener('click', () => {
  setupVisibility = false;
  acknowledgeSetup();
  renderSetup();
});
$('range').addEventListener('change', () => {
  $('customRange').hidden = $('range').value !== 'custom';
  $('exportButton').disabled = $('range').value === 'custom' && !customRange;
  if ($('range').value !== 'custom' || customRange) refreshNow();
});
$('applyRange').addEventListener('click', () => {
  const from = new Date($('fromTime').value).getTime(),
    to = new Date($('toTime').value).getTime();
  if (
    !Number.isFinite(from) ||
    !Number.isFinite(to) ||
    from >= to ||
    from > Date.now() ||
    to - from > 366 * 86400000
  ) {
    toast(t('开始时间须早于结束时间且不能晚于现在，跨度不超过 366 天。'));
    return;
  }
  customRange = { from, to };
  $('exportButton').disabled = false;
  refreshNow();
});
$('scope').addEventListener('change', refreshNow);
$('processScope').addEventListener('change', () => latest && renderInsights(latest.insights));
$('search').addEventListener('input', renderConnections);
$('sessionSearch').addEventListener('input', () => latest && renderSessions(latest.sessions));
$('sessionLimit').addEventListener('change', () => latest && renderSessions(latest.sessions));
$('chart').addEventListener('mousemove', (event) =>
  drawChart(event.clientX - $('chart').getBoundingClientRect().left),
);
$('chart').addEventListener('mouseleave', () => {
  $('chartHint').textContent = t('悬停查看采样值');
  drawChart();
});
new ResizeObserver(() => drawChart()).observe($('chart'));
const startupBridge = createStartupBridge(window.chrome?.webview);
let startupEnabled = false,
  startupAvailable = false,
  startupSequence = 0;
function renderStartupState() {
  $('startupState').textContent = t(
    startupAvailable ? (startupEnabled ? '自启开启' : '自启关闭') : '暂不可用',
  );
  $('startupToggle').setAttribute('aria-checked', String(startupEnabled));
}
async function refreshStartup() {
  if (!startupBridge) return;
  const sequence = ++startupSequence;
  $('startupToggle').disabled = true;
  try {
    const enabled = await startupBridge.get();
    if (sequence !== startupSequence) return;
    startupEnabled = enabled;
    startupAvailable = true;
    $('desktopSettings').hidden = false;
    renderStartupState();
    $('startupToggle').disabled = false;
  } catch {
    if (sequence !== startupSequence) return;
    // An unavailable native host is not an OFF preference. Leave unsupported
    // hosts hidden, but make a previously visible setting's failure explicit.
    startupAvailable = false;
    if (!$('desktopSettings').hidden) renderStartupState();
  }
}
$('startupToggle').addEventListener('click', async () => {
  if (!startupBridge) return;
  const sequence = ++startupSequence;
  $('startupToggle').disabled = true;
  try {
    const enabled = await startupBridge.set(!startupEnabled);
    if (sequence !== startupSequence) return;
    startupEnabled = enabled;
    startupAvailable = true;
    renderStartupState();
  } catch {
    toast(t('无法更新开机自启，请重试。'));
    await refreshStartup();
  } finally {
    if (sequence === startupSequence) $('startupToggle').disabled = false;
  }
});
$('settingsButton').addEventListener('click', () => {
  $('settingsDialog').showModal();
  refreshStartup();
});
$('closeSettings').addEventListener('click', () => $('settingsDialog').close());
$('closeCorrelation').addEventListener('click', () => $('correlationDialog').close());
$('correlationDialog').addEventListener('close', () => {
  correlationSequence++;
});
$('settingsForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await api('/api/settings', {
      method: 'POST',
      body: JSON.stringify({ alertMBPerMinute: Number($('threshold').value) }),
    });
    $('settingsDialog').close();
    toast(t('提醒阈值已保存'));
    refreshNow();
  } catch (error) {
    toast(error.message);
  }
});
$('diagnosticsButton').addEventListener('click', async () => {
  const button = $('diagnosticsButton');
  button.disabled = true;
  try {
    const response = await api('/api/diagnostics');
    const report = await response.json();
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }),
    );
    const link = node('a');
    link.href = url;
    link.download = `codex-netwatch-diagnostics-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(t('脱敏诊断已导出。仍含运行环境和汇总用量，分享前请检查。'));
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
  }
});
$('stopButton').addEventListener('click', async () => {
  try {
    await api('/api/stop', { method: 'POST', body: '{}' });
    stopped = true;
    clearTimeout(refresh.timer);
    $('settingsDialog').close();
    renderUnavailable();
    toast(t('后台采集已停止。再次运行启动脚本即可继续。'));
  } catch (error) {
    toast(error.message);
  }
});
$('exportButton').addEventListener('click', async () => {
  const button = $('exportButton');
  button.disabled = true;
  try {
    const response = await api(`/api/export?${params()}`),
      url = URL.createObjectURL(await response.blob());
    const a = node('a');
    a.href = url;
    a.download = `codex-netwatch-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(t('CSV 已导出：包含当前时间与进程筛选，搜索词仅用于页面。'));
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
  }
});
$('notifyButton').addEventListener('click', async () => {
  if (!('Notification' in window)) {
    toast(t('当前浏览器不支持桌面通知，可在页面查看提醒。'));
    return;
  }
  if (notificationEnabled) {
    notificationEnabled = false;
    try {
      safeStorage()?.removeItem('codex-flow-notify');
    } catch {
      /* Optional preference. */
    }
    toast(t('桌面提醒已关闭'));
    return;
  }
  if ((await Notification.requestPermission()) === 'granted') {
    notificationEnabled = true;
    try {
      safeStorage()?.setItem('codex-flow-notify', 'yes');
    } catch {
      /* Optional preference. */
    }
    toast(t('桌面提醒已启用，需保持页面打开。'));
  } else toast(t('浏览器未允许通知，提醒仍会记录在页面。'));
});
const navigation = [...document.querySelectorAll('.nav-link')];
function selectNavigation(link) {
  for (const item of navigation) {
    item.classList.toggle('active', item === link);
    if (item === link) item.setAttribute('aria-current', 'location');
    else item.removeAttribute('aria-current');
  }
}
navigation.forEach((link) =>
  link.addEventListener('click', () => {
    selectNavigation(link);
  }),
);
let navigationFrame = 0;
function syncNavigation() {
  navigationFrame = 0;
  let selected = navigation[0];
  for (const link of navigation) {
    const section = document.querySelector(link.getAttribute('href'));
    if (section && section.getBoundingClientRect().top <= 130) selected = link;
  }
  if (
    window.scrollY > 0 &&
    window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2
  )
    selected = navigation.at(-1);
  selectNavigation(selected);
}
window.addEventListener(
  'scroll',
  () => {
    if (!navigationFrame) navigationFrame = requestAnimationFrame(syncNavigation);
  },
  { passive: true },
);
syncNavigation();
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refreshNow();
});
$('language').value = readLanguagePreference(safeStorage());
$('language').addEventListener('change', () => {
  const preference = $('language').value;
  saveLanguage(safeStorage(), preference);
  language = resolveLanguage(preference, systemLocale ? [systemLocale] : browserLanguages);
  document.documentElement.lang = language;
  translateStatic(language);
  renderStartupState();
  renderSetup();
  $('toast').hidden = true;
  $('chartHint').textContent = t('悬停查看采样值');
  if (latest) render(latest);
  if (stopped || disconnected) renderUnavailable();
});
refresh();
