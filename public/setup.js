// Derive guidance from collector evidence, never from destination names or tokens.
export function setupState(status, totals = {}, unavailable = false) {
  if (unavailable) return 'offline';
  if (status?.demo) return 'demo';
  if (!status || status.state === 'starting') return 'starting';
  if (status.capture?.active === 'native' && status.state === 'connected')
    return totals.codex_up + totals.codex_down > 0 ? 'native_ready' : 'native_idle';
  if (status.state !== 'connected' && status.capture?.nativeIssue && status.capture.nativeIssue !== 'unsupported' && status.capture.mode !== 'mihomo') return 'native_authorization';
  if (status.state !== 'connected') {
    return ['authorization', 'incompatible', 'unreachable', 'collection'].includes(
      status.controllerIssue,
    )
      ? status.controllerIssue
      : 'unreachable';
  }
  if (['error', 'stopped', 'unsupported'].includes(status.observer)) return 'observer';
  if (totals.codex_up + totals.codex_down > 0) return 'ready';
  if (status.codexConnections > 0) return 'baseline';
  if (status.unknownConnections > 0) return 'unidentified';
  return 'idle';
}

export const setupCopy = Object.freeze({
  native_authorization: ['直连采集尚未授权', '打开设置，选择自动或 Windows 原生模式并点击授权原生采集。无需启动代理；Windows 会请求管理员授权。'],
  native_ready: ['正在记录直连与进程网络活动', 'Windows 原生采集正在工作，不需要代理。目标显示为 IP；本机回环连接也会计入进程网络活动，不代表互联网账单。'],
  native_idle: ['Windows 原生采集已就绪', '在 Codex 中产生一个新请求。统计从原生采集启动后开始，离线流量不会补算。'],
  offline: [
    '本地监控程序未连接',
    '重新运行 Codex-Netwatch.exe 或启动脚本。这里连接的是监控程序，与代理控制接口是两层独立连接。',
  ],
  starting: ['正在检查连接', '正在探测本地控制接口并准备进程识别，通常需要几秒钟。'],
  authorization: [
    '控制接口需要正确的密钥',
    '接口返回了 401 / 403。将 MIHOMO_SECRET 设置为代理控制接口的 secret，然后完整退出并重新启动 Netwatch。不要分享密钥或配置文件。',
  ],
  incompatible: [
    '接口响应不兼容',
    '地址已响应，但不是可用的 Mihomo /connections 接口。请使用代理设置里的 external-controller 地址，而不是 HTTP / SOCKS 代理端口或订阅地址。',
  ],
  unreachable: [
    '尚未连接代理控制接口',
    '先运行 Mihomo / Clash 兼容代理。自动发现失败时，在程序目录的 config.local.json 中填写本地 controller 地址，保存后完整退出并重新启动 Netwatch。',
  ],
  collection: [
    '采集暂时失败',
    '控制接口或本地存储处理失败，采集器会自动重试。若持续出现，请检查目录是否可写和磁盘空间，并在设置中导出脱敏诊断。',
  ],
  observer: [
    '控制接口已连接，进程识别受限',
    'Windows 进程识别不可用时，只能使用代理提供的进程信息。缺少证据的流量保持待识别，不会猜测为 Codex。可在采集诊断中检查状态。',
  ],
  unidentified: [
    '有连接尚未识别到进程',
    '在连接与去向中选择待识别进程，检查进程证据。让 Codex 通过当前代理产生新请求；其他程序的流量不会计入 Codex。',
  ],
  baseline: [
    '已识别 Codex，等待新增流量',
    '首次连接、重启和重连会先建立基线。让 Codex 产生新请求，再等待两次采样；历史或离线流量不会补算。',
  ],
  idle: [
    '控制接口已连接，等待 Codex 活动',
    '在 Codex 中发送一个请求，并确认它经过当前代理。直连、绕过代理或其他控制器的流量不可见；也可扩大上方时间范围。',
  ],
  ready: [
    '已记录 Codex 流量',
    '接口和流量识别已开始工作。上方时间范围影响图表和累计用量；你可以随时重新打开此帮助。',
  ],
  demo: [
    '当前为演示模式',
    '演示数据不用于检查真实代理。退出演示实例，正常运行 Codex-Netwatch.exe 后再检查实际连接。',
  ],
});
