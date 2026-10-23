// Source-language keys keep the Chinese copy next to its English translation.
// Values are plain text: never inject translations as HTML.
export const messages = Object.freeze({
  全部已观测连接: 'All observed connections',
  全部已观测进程: 'All observed processes',
  全部已观测进程流量排行: 'All observed traffic by process',
  '未识别占比仅针对已观测连接，不代表完整覆盖率；采集源总量与连接记录可能存在差额。': 'The unidentified share applies only to observed connections, not complete coverage. Source totals may differ from connection records.',
  采集源断线: 'Capture source disconnected',
  采集源切换: 'Capture source changed',
  '连接记录 {bytes} · 未识别 {unknown}（{share}）· 采集源总量 {proxy}': 'Connection records {bytes} · Unidentified {unknown} ({share}) · Source total {proxy}',
  '对照全部已观测程序的用量；其他进程和待识别流量不会计入 Codex，最多 8 项。': 'Compare all observed applications. Other and unidentified traffic is excluded from Codex; up to 8 entries.',
  'Windows 原生采集 / Mihomo 兼容接口': 'Windows native capture / Mihomo-compatible controller',
  选择采集方式: 'Choose a capture source',
  '直连使用 Windows 原生采集，无需代理。在设置中授权采集助手；也可选择 Mihomo 兼容接口。': 'Use Windows native capture for direct connections without a proxy. Authorize the capture helper in Settings, or select a Mihomo-compatible controller.',
  全部已观测进程流量: 'All observed process traffic',
  '近期 Codex 连接': 'Recent Codex connections',
  '字节来自当前采集源，归属来自进程证据。原生模式显示目标 IP。': 'Bytes come from the current capture source; ownership comes from process evidence. Native capture displays destination IPs.',
  'Windows 原生模式记录 TCP/UDP 进程网络事件（包括回环连接）；Mihomo 模式仅覆盖其控制器中的连接。同一时刻只使用一个来源，不叠加两者。统计不是 VPN 账单或网卡总流量；丢失事件、采样缺口与离线期间不补算。切换来源会标记缺口，历史可能包含不同统计口径。不会按域名或 token 猜测会话用量。': 'Windows native mode records TCP/UDP process network events, including loopback. Mihomo mode covers connections in its controller. Only one source supplies each sample; the two are never added together. Totals are not VPN billing or interface totals. Lost events, collection gaps and offline traffic are not backfilled. Source changes mark gaps, and history can contain different measurement methods. Domains and tokens never allocate bytes to sessions.',
  流量采集方式: 'Traffic capture source',
  自动选择: 'Automatic',
  'Windows 原生（无需代理）': 'Windows native (no proxy required)',
  'Mihomo / Clash 兼容接口': 'Mihomo / Clash-compatible controller',
  '自动模式优先使用已授权的原生采集，否则尝试 Mihomo。Windows 授权仅提升采集助手；退出程序后授权结束，开机自启不会自动弹出授权。': 'Automatic mode uses authorized native capture when available, otherwise tries Mihomo. Windows elevates only the capture helper. Authorization ends when the app exits; startup at sign-in never prompts for elevation automatically.',
  授权原生采集: 'Authorize native capture',
  'Windows 网络事件 → 进程': 'Windows network event → process',
  'Windows 网络事件 → Codex 子进程': 'Windows network event → Codex child process',
  'Codex 已识别字节 / 全部已观测字节：{share}%': 'Identified Codex / all observed bytes: {share}%',
  'Windows 网络事件丢失': 'Windows network events lost',
  'Windows 原生采集': 'Windows native capture',
  'Mihomo 兼容接口': 'Mihomo-compatible controller',
  尚无可用采集源: 'No capture source available',
  原生采集已授权: 'Native capture authorized',
  '正在等待 Windows 授权': 'Waiting for Windows authorization',
  原生采集需要授权: 'Native capture needs authorization',
  演示模式不启动真实采集: 'Demo mode does not start real capture',
  '原生采集需要 Windows 授权；请在设置中授权采集助手，或选择 Mihomo 接口。': 'Windows native capture needs authorization. Authorize the helper in Settings, or select a Mihomo controller.',
  '请在 Windows 授权窗口中选择是；取消授权不会关闭程序。': 'Choose Yes in the Windows authorization prompt. Cancelling keeps the app running.',
  采集方式已更新: 'Capture source updated',
  '原生采集未启动，请检查 Windows 授权或采集诊断。': 'Native capture did not start. Check Windows authorization or collector diagnostics.',
  直连采集尚未授权: 'Direct capture needs authorization',
  '打开设置，选择自动或 Windows 原生模式并点击授权原生采集。无需启动代理；Windows 会请求管理员授权。': 'Open Settings, select Automatic or Windows native and click Authorize native capture. No proxy is required. Windows will request administrator authorization.',
  正在记录直连与进程网络活动: 'Recording direct and process network activity',
  'Windows 原生采集正在工作，不需要代理。目标显示为 IP；本机回环连接也会计入进程网络活动，不代表互联网账单。': 'Windows native capture is running without a proxy requirement. Destinations appear as IPs. Local loopback is included as process network activity, not internet billing.',
  'Windows 原生采集已就绪': 'Windows native capture is ready',
  '在 Codex 中产生一个新请求。统计从原生采集启动后开始，离线流量不会补算。': 'Make a new request in Codex. Counters begin when native capture starts; offline traffic is not backfilled.',
  连接帮助: 'Connection help',
  收起连接帮助: 'Collapse connection help',
  开始监控: 'Get connected',
  'Windows + Mihomo / Clash 兼容控制接口': 'Windows + Mihomo / Clash-compatible controller',
  运行兼容代理: 'Run a compatible proxy',
  '需要 Mihomo / Clash 兼容的控制接口；仅开启系统代理或 VPN 并不代表兼容。':
    'A Mihomo / Clash-compatible controller is required. A system proxy or VPN alone does not provide this interface.',
  连接本地控制接口: 'Connect the local controller',
  '优先自动发现。手动配置时使用 external-controller 地址，不能填代理端口。密钥通过 MIHOMO_SECRET 提供。':
    'Discovery is automatic where supported. For manual setup, use the external-controller address, not the proxy port. Supply its secret through MIHOMO_SECRET.',
  '让 Codex 产生新请求': 'Make a new request in Codex',
  '保持程序运行，等待两次采样。只累计建立基线后的新增流量，其他程序不会计入 Codex。':
    'Keep Netwatch running and wait for two samples. Only new traffic after the baseline is counted; other apps are excluded from Codex.',
  '自动发现失败？查看手动配置': 'Discovery failed? Set up manually',
  '复制程序目录中的 config.example.json 为 config.local.json，按代理实际控制地址填写 controller，然后完整退出并重新启动程序。下面仅为示例。':
    'Copy config.example.json to config.local.json in the app folder, set controller to your actual local controller address, then fully exit and restart Netwatch. The address below is only an example.',
  '需要授权时，在启动程序的环境中设置 MIHOMO_SECRET。不要把密钥写进截图、反馈或分享内容。':
    'If authentication is required, set MIHOMO_SECRET in the environment used to launch Netwatch. Keep secrets out of screenshots, feedback and shared content.',
  刷新检查: 'Refresh checks',
  '完整配置与排错 ↗': 'Full setup and troubleshooting ↗',
  '查看采集诊断 ↓': 'View collector diagnostics ↓',
  '采集器会自动重试，无需反复点击。':
    'Collection retries automatically; repeated clicks are unnecessary.',
  本地监控程序未连接: 'Local monitor is unavailable',
  '重新运行 Codex-Netwatch.exe 或启动脚本。这里连接的是监控程序，与代理控制接口是两层独立连接。':
    'Run Codex-Netwatch.exe or the start script again. The dashboard connection to Netwatch is separate from the proxy controller connection.',
  正在检查连接: 'Checking the connection',
  '正在探测本地控制接口并准备进程识别，通常需要几秒钟。':
    'Discovering the local controller and preparing process identification. This usually takes a few seconds.',
  控制接口需要正确的密钥: 'The controller needs the correct secret',
  '接口返回了 401 / 403。将 MIHOMO_SECRET 设置为代理控制接口的 secret，然后完整退出并重新启动 Netwatch。不要分享密钥或配置文件。':
    'The controller returned 401 / 403. Set MIHOMO_SECRET to its secret, then fully exit and restart Netwatch. Do not share credentials or configuration files.',
  接口响应不兼容: 'The controller response is incompatible',
  '地址已响应，但不是可用的 Mihomo /connections 接口。请使用代理设置里的 external-controller 地址，而不是 HTTP / SOCKS 代理端口或订阅地址。':
    'The address responded, but did not provide a usable Mihomo /connections response. Use the external-controller address from your proxy settings, not an HTTP / SOCKS proxy port or subscription URL.',
  尚未连接代理控制接口: 'No proxy controller connection yet',
  '先运行 Mihomo / Clash 兼容代理。自动发现失败时，在程序目录的 config.local.json 中填写本地 controller 地址，保存后完整退出并重新启动 Netwatch。':
    'Start a Mihomo / Clash-compatible proxy. If discovery fails, set the local controller address in config.local.json in the app folder, then fully exit and restart Netwatch.',
  采集暂时失败: 'Collection temporarily failed',
  '控制接口或本地存储处理失败，采集器会自动重试。若持续出现，请检查目录是否可写和磁盘空间，并在设置中导出脱敏诊断。':
    'Controller or local storage processing failed. Collection retries automatically. If this persists, check folder write access and disk space, then export redacted diagnostics from Settings.',
  '控制接口已连接，进程识别受限': 'Controller connected; process identification is limited',
  'Windows 进程识别不可用时，只能使用代理提供的进程信息。缺少证据的流量保持待识别，不会猜测为 Codex。可在采集诊断中检查状态。':
    'When Windows process identification is unavailable, only controller process metadata can be used. Traffic without evidence stays unidentified instead of being guessed as Codex. Check collector diagnostics for status.',
  有连接尚未识别到进程: 'Some connections have no process identity yet',
  '在连接与去向中选择待识别进程，检查进程证据。让 Codex 通过当前代理产生新请求；其他程序的流量不会计入 Codex。':
    'Select Unidentified processes under Connections to inspect the evidence. Make a new request in Codex through this proxy; traffic from other apps is excluded from Codex.',
  '已识别 Codex，等待新增流量': 'Codex identified; waiting for new traffic',
  '首次连接、重启和重连会先建立基线。让 Codex 产生新请求，再等待两次采样；历史或离线流量不会补算。':
    'First attach, restart and reconnect establish a baseline. Make a new request in Codex and wait for two samples; historical and offline traffic is not backfilled.',
  '控制接口已连接，等待 Codex 活动': 'Controller connected; waiting for Codex activity',
  '在 Codex 中发送一个请求，并确认它经过当前代理。直连、绕过代理或其他控制器的流量不可见；也可扩大上方时间范围。':
    'Send a request in Codex and check that it uses this proxy. Direct traffic, bypass traffic and other controllers are invisible here. You can also expand the time range above.',
  '已记录 Codex 流量': 'Codex traffic is being recorded',
  '接口和流量识别已开始工作。上方时间范围影响图表和累计用量；你可以随时重新打开此帮助。':
    'The controller and traffic identification are working. The time range above affects charts and totals. You can reopen this help at any time.',
  当前为演示模式: 'Demo mode is active',
  '演示数据不用于检查真实代理。退出演示实例，正常运行 Codex-Netwatch.exe 后再检查实际连接。':
    'Synthetic data cannot validate a real proxy. Exit the demo instance and run Codex-Netwatch.exe normally to check your actual connection.',
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
    'Coverage reference for all observed apps, not Codex-only usage.',
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
  '最近 6 小时': 'Last 6 hours',
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
  天: 'days',
  '1–365 天。保存后在下次成功采集时按新期限清理；缩短期限会删除较早数据，延长不会恢复已删除数据。':
    '1–365 days. The next successful collection applies the saved retention window. Shortening it deletes older data; extending it cannot restore deleted data.',
  '接口地址、采样周期及子进程范围可在':
    'Set the controller, sampling interval and descendant scope in',
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
  监控设置已保存: 'Monitor settings saved',
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
  '保留天数应为 1–365 的整数': 'Retention must be a whole number from 1 to 365 days',
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
