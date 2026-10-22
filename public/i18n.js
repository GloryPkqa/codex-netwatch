// Source-language keys keep the Chinese copy next to its English translation.
// Values are plain text: never inject translations as HTML.
export const messages = Object.freeze({
  暂不可用: 'Unavailable',
  '当前平台不支持套接字识别；仍可使用代理提供的进程信息。缺少证据的流量列为待识别。':
    'Socket ownership is unavailable on this platform. Proxy process metadata still works; traffic without evidence stays unidentified.',
  'Windows 进程识别暂不可用，正在重试。缺少证据的流量列为待识别，不计入 Codex。':
    'Windows process identification is unavailable and retrying. Traffic without evidence stays unidentified and is excluded from Codex.',
  'Codex 进程流量排行': 'Codex traffic by process',
  全部代理进程流量排行: 'All proxy traffic by process',
  '仅显示已识别的 Codex 进程及子进程，按上传与下载合计排序，最多 8 项。':
    'Identified Codex processes and children only, ranked by total transfer. Top 8 shown.',
  '对照全部代理程序的用量；其他进程和待识别流量不会计入 Codex，最多 8 项。':
    'Compare all proxied apps. Other and unidentified traffic is excluded from Codex totals. Top 8 shown.',
  '所选范围暂无已识别的 Codex 进程流量。': 'No identified Codex process traffic in this range.',
  排行统计范围: 'Process ranking scope',
  仅Codex: 'Codex only',
  '仅 Codex': 'Codex only',
  全部代理进程: 'All proxied apps',
  全部代理连接: 'All proxy connections',
  '用于检查采集覆盖情况，包含其他程序，不是 Codex 专属用量。':
    'Coverage reference for all proxied apps, not Codex-only usage.',
  开机自启: 'Start with Windows',
  自启开启: 'On',
  自启关闭: 'Off',
  '登录 Windows 后在托盘启动，不弹出面板。更改立即生效。':
    'Start in the tray at Windows sign-in without opening the dashboard. Changes apply immediately.',
  '无法更新开机自启，请重试。': 'Could not update startup preference. Please try again.',
  异常排查: 'Traffic investigation',
  '查看连接 ↘': 'Inspect connections ↘',
  'PID 未知': 'PID unavailable',
  '采集器内存（Node）': 'Collector memory (Node)',
  上次采集耗时: 'Last collection duration',
  采集失败次数: 'Collection failures',
  '主要连接线索取自每次采样最多 20 条主要上传或下载连接；异常窗口总量包含全部已识别 Codex 字节。':
    'Context uses up to 20 leading upload or download connections per sample. Event totals include all measured Codex bytes.',
  '定位已观测的突发上传、下载和持续上传，不按会话猜测流量。':
    'Inspect observed upload bursts, download bursts and sustained uploads without guessing session ownership.',
  等待观测记录: 'Waiting for observations',
  '未识别占比仅针对连接快照，不代表完整抓包覆盖率；代理全局与连接快照可能存在差额。':
    'The unidentified share applies to connection snapshots, not complete capture coverage. Global proxy counters may differ from connection snapshots.',
  异常类型: 'Type',
  观测窗口: 'Observation window',
  主要观测连接: 'Largest observed contributor',
  窗口字节: 'Window bytes',
  采集缺口: 'Collection gaps',
  '断线、休眠、重启和识别受限均会留下记录，缺口字节未知。':
    'Disconnects, sleep, restarts and unavailable process evidence are recorded. Bytes missed during gaps remain unknown.',
  进程流量排行: 'Traffic by process',
  '所选时间范围的全部已观测进程，仅展示前 8 项。':
    'All observed processes in the selected range. Top 8 shown.',
  进程: 'Process',
  导出脱敏诊断: 'Export redacted diagnostics',
  '不含密钥、路径、域名、进程名称或会话内容。仍含运行环境与汇总用量，分享前请检查。':
    'Excludes secrets, paths, domains, process names and session content. Runtime details and aggregate usage remain. Review before sharing.',
  突发上传: 'Upload burst',
  突发下载: 'Download burst',
  持续上传: 'Sustained upload',
  首次建立基线: 'Initial baseline',
  程序重启: 'Collector restart',
  代理接口断线: 'Controller disconnected',
  代理接口切换: 'Controller changed',
  采样延迟或休眠: 'Sampling delay or sleep',
  进程识别不可用: 'Process evidence unavailable',
  系统时间变化: 'System clock changed',
  采集失败: 'Collection failed',
  '{value} 秒': '{value} seconds',
  '{value} 分钟': '{value} minutes',
  '连接快照 {bytes} · 未识别 {unknown}（{share}）· 代理全局 {proxy}':
    'Connection snapshots {bytes} · Unidentified {unknown} ({share}) · Global proxy {proxy}',
  '所选范围没有已记录异常。阈值提醒不会阻断网络。':
    'No recorded anomalies in this range. Threshold alerts do not block traffic.',
  '主要观测连接，非全部字节归因': 'Largest observed contributor, not attribution of all bytes',
  '所选范围没有已记录采集缺口。': 'No recorded collection gaps in this range.',
  尚未恢复: 'Not recovered',
  持续中: 'Ongoing',
  '暂无进程流量排行。': 'No process traffic yet.',
  '{count} 个 PID': '{count} PIDs',
  '脱敏诊断已导出。仍含运行环境和汇总用量，分享前请检查。':
    'Redacted diagnostics exported. Runtime details and aggregate usage remain. Review before sharing.',
  'Desktop instance marker required': 'Desktop instance marker required',
  'Codex Netwatch · 本地流量监控': 'Codex Netwatch · Local network monitor',
  工作空间: 'WORKSPACE',
  主导航: 'Main navigation',
  流量总览: 'Overview',
  连接与去向: 'Connections',
  会话活动: 'Session activity',
  采集诊断: 'Diagnostics',
  数据只保存在本机: 'Data stays on this device',
  '无云端 · 无遥测 · 无外部资源': 'No cloud · No telemetry · Local assets',
  个人监控台: 'Personal dashboard',
  正在连接: 'Connecting',
  打开监控设置: 'Open monitor settings',
  '⚙ 设置': '⚙ Settings',
  '流量，看得清。': 'See where the bytes go.',
  '从进程到连接，找出 Codex 的网络开销。':
    'Trace Codex network usage from processes to connections.',
  统计时间范围: 'Time range',
  '最近 15 分钟': 'Last 15 minutes',
  '最近 1 小时': 'Last hour',
  '最近 24 小时': 'Last 24 hours',
  '最近 7 天': 'Last 7 days',
  '最近 30 天': 'Last 30 days',
  全部已记录: 'All recorded',
  '自定义时间…': 'Custom range…',
  '↓ 导出 CSV': '↓ Export CSV',
  开始: 'From',
  结束: 'To',
  应用: 'Apply',
  流量指标: 'Network metrics',
  'Codex 已观测流量': 'Observed Codex traffic',
  进程识别: 'Process evidence',
  当前传输速度: 'Current transfer rate',
  全部代理流量: 'All proxy traffic',
  对照: 'Reference',
  等待采样: 'Waiting for samples',
  '当前 Codex 连接': 'Active Codex connections',
  进程匹配准备中: 'Preparing process matching',
  传输趋势: 'Transfer trend',
  'Codex 上传与下载 ·': 'Codex upload and download ·',
  等待数据: 'Waiting for data',
  上传: 'Upload',
  下载: 'Download',
  全部代理: 'All proxy',
  流量速率趋势图: 'Network transfer rate chart',
  等待第一组采样: 'Waiting for the first samples',
  '已有连接会先建立基线，再累计新流量。':
    'Existing connections establish a baseline before new bytes are counted.',
  悬停查看采样值: 'Hover to inspect samples',
  'GB = 10⁹ 字节': 'GB = 10⁹ bytes',
  流量去向: 'Destinations',
  当前筛选范围内的目标地址: 'Destinations in the selected range',
  暂无已观测流量: 'No observed traffic yet',
  '字节来自 Mihomo 连接计数，归属来自进程证据。':
    'Bytes come from Mihomo counters; ownership comes from process evidence.',
  进程筛选: 'Process filter',
  'Codex 进程': 'Codex processes',
  待识别进程: 'Unidentified processes',
  其他进程: 'Other processes',
  全部连接: 'All connections',
  '搜索地址或进程…': 'Search address or process…',
  搜索连接: 'Search connections',
  目标地址: 'Destination',
  '进程 / PID': 'Process / PID',
  识别证据: 'Evidence',
  合计: 'Total',
  最近观测: 'Last observed',
  '最多展示流量最大的 100 条连接 · CSV 最多 10,000 条 · 筛选仅影响连接与去向':
    'Top 100 connections by traffic · CSV up to 10,000 rows · Filters affect connections and destinations only',
  '时间关联 ≠ 字节归属': 'Time overlap ≠ byte ownership',
  '用日志活动缩小排查范围。共享进程与连接时，无法精确分配各会话的 GB。':
    'Use log activity to narrow your search. Shared processes and connections prevent exact per-session GB attribution.',
  '搜索会话名称…': 'Search session title…',
  搜索会话: 'Search sessions',
  显示会话数量: 'Session count',
  '最近 20 个': 'Latest 20',
  '最近 50 个': 'Latest 50',
  '最近 200 个': 'Latest 200',
  会话: 'Session',
  模型: 'Model',
  '日志累计 token': 'Latest log tokens',
  '监控期间 token 增量': 'Observed token increase',
  最近日志活动: 'Last log activity',
  关联观察: 'Activity overlap',
  'Token 读取最近日志计数，包含缓存输入；不换算 GB 或订阅额度。缺失计数显示「—」。监控期间增量为所有已记录时段，独立于上方网络时间筛选。':
    'Tokens use the latest log counters, including cached input, and are not converted to GB or subscription quota. Missing counters show “—”. Observed increases cover all recorded periods, independently of the network time range above.',
  了解数据覆盖范围与监控状态: 'Check coverage and collector status',
  流量提醒: 'Traffic alerts',
  '最近 60 秒 Codex 流量超过阈值时记录':
    'Recorded when Codex traffic in the last 60 seconds exceeds the threshold',
  桌面提醒: 'Desktop alerts',
  暂时没有阈值提醒: 'No threshold alerts yet',
  统计口径: 'What is measured',
  '仅覆盖经过当前 Mihomo 的连接，是应用层已观测字节，不等同于 VPN 账单或网卡流量。短连接、采样间隙和连接关闭前的最后一段可能漏计；首次连接、重连和程序重启先建立基线，不补算离线流量。未识别的流量单独保留，绝不按域名或 token 猜测会话用量。':
    'Only connections through the current Mihomo instance are covered. These are observed application bytes, not VPN billing or interface totals. Short connections, sampling gaps and final bytes may be missed. First attach, reconnect and restart establish a baseline without offline backfill. Unidentified traffic stays separate; domains and tokens are never used to guess session bytes.',
  正在初始化: 'Initializing',
  监控设置: 'Monitor settings',
  关闭: 'Close',
  流量提醒阈值: 'Traffic alert threshold',
  'MB / 最近 60 秒': 'MB / last 60 seconds',
  '十进制 MB。阈值仅用于提醒，不会终止连接或会话。':
    'Decimal MB. Alerts do not terminate connections or sessions.',
  '接口地址、采样周期、保留天数及子进程范围可在':
    'Set the controller, sampling interval, retention and descendant scope in',
  '中设置，修改后重启生效。接口密钥通过':
    'and restart to apply changes. Provide the controller secret through the',
  '环境变量提供。': 'environment variable.',
  保存设置: 'Save settings',
  停止后台采集: 'Stop background collection',
  '关闭网页不会停止采集，点击此处才会退出程序。':
    'Closing this page keeps collection running. Use this button to exit.',
  停止监控: 'Stop monitor',
  会话关联观察: 'Session activity overlap',
  界面语言: 'Interface language',
  '自动（系统）': 'Auto (system)',
  中文: '中文',
  '在 GitHub 查看项目': 'View project on GitHub',
  '套接字 → 进程': 'Socket → process',
  'Codex 子进程': 'Codex descendant',
  'Mihomo 进程字段': 'Mihomo process metadata',
  缺少进程证据: 'No process evidence',
  待识别: 'Unidentified',
  全部进程: 'All processes',
  正常: 'Ready',
  初始化: 'Starting',
  '受限 / 失败': 'Restricted / failed',
  已退出: 'Stopped',
  此平台暂不支持: 'Unsupported on this platform',
  日志结构不兼容或不可读: 'Logs unavailable or incompatible',
  演示模式: 'Demo mode',
  '请求失败 ({status})': 'Request failed ({status})',
  演示采集中: 'Demo collecting',
  实时采集中: 'Collecting live',
  等待接口恢复: 'Waiting for controller',
  初始化中: 'Initializing',
  'Codex 已识别字节 / 全部代理字节：{share}%': 'Identified Codex / all proxy bytes: {share}%',
  从建立基线之后开始累计: 'Counting begins after the baseline',
  '全部 {total} 条 · {unknown} 条待识别进程': '{total} total · {unknown} unidentified',
  '当前为演示模式，全部流量为合成数据，与真实监控数据库分开保存。':
    'Demo mode: all traffic is synthetic and stored separately from real monitoring data.',
  '正在准备 Windows 进程识别。缺少证据的连接暂列为「待识别」，不计入 Codex。':
    'Preparing Windows process matching. Connections without evidence remain unidentified and are excluded from Codex totals.',
  '有 {count} 条连接缺少进程证据，可在「连接与去向」切换到「待识别进程」排查。':
    '{count} connections lack process evidence. Select “Unidentified processes” under Connections to investigate.',
  '最近采集 {time} · 采样 {seconds}s': 'Last sample {time} · Interval {seconds}s',
  尚无数据: 'No data yet',
  '{scope} · 已观测连接字节': '{scope} · observed connection bytes',
  '此范围暂无已观测流量。监控不会补算启动前的流量。':
    'No observed traffic in this range. Traffic before monitoring started is not backfilled.',
  '暂无匹配的流量记录。保持监控运行，产生新流量后会自动显示。':
    'No matching traffic. New traffic will appear while the monitor runs.',
  尚未识别: 'Unidentified',
  未知: 'Unknown',
  未知地址: 'Unknown destination',
  '未找到匹配的会话，可更换搜索词。': 'No matching sessions. Try another search.',
  '尚未读取到会话记录。网络流量采集可独立运行。':
    'No sessions read yet. Network collection runs independently.',
  '输入 {input}；其中缓存 {cached}；输出 {output}。缓存已包含在输入中。':
    'Input {input}; cached {cached}; output {output}. Cached tokens are included in input.',
  '观察窗口 ↗': 'Inspect overlap ↗',
  '{count} 次采样处于日志活动窗口': '{count} samples overlap the log activity window',
  所选时间范围内没有重合采样: 'No overlapping samples in the selected range',
  '{from} 至 {to}': '{from} to {to}',
  '监控开始之后，最近 60 秒有日志变动的会话才会列入活动窗口。':
    'After collection starts, sessions with log changes in the last 60 seconds enter the activity window.',
  '各会话的网络字节：待归属。可暂停其他会话、单独运行目标会话，观察进程和域名流量变化。':
    'Per-session bytes remain unattributed. Run the target session on its own and compare process and destination traffic.',
  '仅表示日志活动与网络采样时间重合，不代表该会话产生这些字节。':
    'This indicates timing overlap only; it does not mean this session generated those bytes.',
  数据接口: 'Controller',
  正在探测本地接口: 'Discovering local controller',
  'Windows 进程识别': 'Windows process matching',
  'Codex 会话读取': 'Codex session reader',
  当前进程快照: 'Process snapshot',
  '{count} 个进程': '{count} processes',
  本次监控启动: 'Collector started',
  数据保留: 'Data retention',
  '{days} 天': '{days} days',
  提醒阈值: 'Alert threshold',
  '{amount} MB / 60 秒': '{amount} MB / 60 seconds',
  'Codex Netwatch · 流量提醒': 'Codex Netwatch · Traffic alert',
  '没有阈值提醒。持续采集时会自动检查最近 60 秒流量。':
    'No threshold alerts. The last 60 seconds of traffic are checked during collection.',
  '{time} · ↑ {up} · ↓ {down} · 全部 {all}': '{time} · ↑ {up} · ↓ {down} · All {all}',
  监控程序未连接: 'Monitor disconnected',
  '无法连接本地监控程序。已显示的数据保留在页面上；请重新运行启动脚本。':
    'Cannot reach the local monitor. Displayed data is retained on this page. Run the launcher again.',
  '开始时间须早于结束时间且不能晚于现在，跨度不超过 366 天。':
    'Start must precede end and cannot be in the future. Maximum range: 366 days.',
  提醒阈值已保存: 'Alert threshold saved',
  采集已停止: 'Collection stopped',
  '后台采集已停止。再次运行启动脚本即可继续。':
    'Background collection stopped. Run the launcher again to resume.',
  'CSV 已导出：包含当前时间与进程筛选，搜索词仅用于页面。':
    'CSV exported with the selected time and process filters. Search terms apply to the page only.',
  '当前浏览器不支持桌面通知，可在页面查看提醒。':
    'Desktop notifications are unavailable in this browser. Alerts remain visible on the page.',
  桌面提醒已关闭: 'Desktop alerts disabled',
  '桌面提醒已启用，需保持页面打开。': 'Desktop alerts enabled. Keep this page open.',
  '浏览器未允许通知，提醒仍会记录在页面。':
    'Notification permission was not granted. Alerts are still recorded on the page.',
  'Windows 命名管道': 'Windows named pipe',
  '演示数据（非实测）': 'Synthetic demo data',
  '阈值应为 0.1–1000000 MB/分钟': 'Threshold must be 0.1–1000000 MB per minute',
  '请求无法处理，请检查参数或稍后重试。':
    'Cannot process this request. Check the parameters or try again.',
  '接口需要授权：设置 MIHOMO_SECRET 后重启。':
    'Controller authorization required. Set MIHOMO_SECRET and restart.',
  '未连接 Mihomo：请启动代理，或在 config.local.json 配置本地 controller。':
    'Mihomo is unavailable. Start the proxy or configure a local controller in config.local.json.',
  '采集暂时失败，正在自动重试；空档不计为零流量。':
    'Collection failed and will retry automatically. Gaps are not counted as zero traffic.',
  优化设置页交互: 'Improve settings interactions',
  排查构建失败: 'Investigate build failure',
  更新接口文档: 'Update API documentation',
  'Codex 最近 60 秒已观测到 {amount} MB，超过 {threshold} MB 提醒阈值。':
    'Observed {amount} MB of Codex traffic in the last 60 seconds, exceeding the {threshold} MB alert threshold.',
  'Invalid Host': 'Invalid Host',
  'Cross-origin requests are not allowed': 'Cross-origin requests are not allowed',
  'Missing local client header': 'Missing local client header',
  'Not found': 'Not found',
  'Method not allowed': 'Method not allowed',
});

export function normalizeText(text) {
  return text.trim().replace(/\s+/g, ' ');
}

export function resolveLanguage(saved, languages = []) {
  if (saved === 'en' || saved === 'zh-CN') return saved;
  return /^zh(?:-|$)/i.test(languages[0] || '') ? 'zh-CN' : 'en';
}

export function readLanguagePreference(storage) {
  let saved;
  try {
    saved = storage?.getItem('codex-netwatch-language');
  } catch {
    /* Private mode. */
  }
  return saved === 'en' || saved === 'zh-CN' || saved === 'auto' ? saved : 'en';
}

export function readLanguage(storage, languages, systemLocale) {
  return resolveLanguage(
    readLanguagePreference(storage),
    systemLocale ? [systemLocale] : languages,
  );
}

export function saveLanguage(storage, language) {
  try {
    storage?.setItem('codex-netwatch-language', language);
  } catch {
    /* Still switch in memory. */
  }
}

export function translate(message, language, values = {}) {
  if (message === undefined || message === null) return '';
  const template = language === 'en' ? (messages[message] ?? message) : message;
  return String(template).replace(/\{(\w+)\}/g, (match, key) =>
    Object.hasOwn(values, key) ? String(values[key]) : match,
  );
}

// Capture only the initial static document. Later user titles, addresses and IDs
// never enter this list, even if they happen to match a translation key.
export function captureStaticTranslations(root) {
  const slots = [];
  const visit = (element) => {
    if (['SCRIPT', 'STYLE'].includes(element.tagName)) return;
    for (const attribute of ['aria-label', 'placeholder', 'title']) {
      const source = element.getAttribute?.(attribute);
      if (source && Object.hasOwn(messages, normalizeText(source)))
        slots.push({ target: element, attribute, source: normalizeText(source) });
    }
    for (const child of element.childNodes || []) {
      if (child.nodeType === 3) {
        const source = normalizeText(child.textContent);
        if (Object.hasOwn(messages, source))
          slots.push({
            target: child,
            source,
            prefix: child.textContent.match(/^\s*/)[0],
            suffix: child.textContent.match(/\s*$/)[0],
          });
      } else if (child.nodeType === 1) visit(child);
    }
  };
  visit(root);
  return (language) => {
    for (const slot of slots) {
      const text = translate(slot.source, language);
      if (slot.attribute) slot.target.setAttribute(slot.attribute, text);
      else slot.target.textContent = slot.prefix + text + slot.suffix;
    }
  };
}

// Translate old persisted alerts as well as new ones, without rewriting history.
export function translateAlert(message, language) {
  const match = /^Codex 最近 60 秒已观测到 ([\d.]+) MB，超过 ([\d.]+) MB 提醒阈值。$/.exec(message);
  return match
    ? translate('Codex 最近 60 秒已观测到 {amount} MB，超过 {threshold} MB 提醒阈值。', language, {
        amount: match[1],
        threshold: match[2],
      })
    : message;
}
