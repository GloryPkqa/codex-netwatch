# Windows native traffic capture

Codex Netwatch 0.3.0 supports direct connections without a proxy. The Windows x64 helper consumes real-time ETW TCP/UDP network events for IPv4 and IPv6. It requires Windows 10/11 and .NET Framework 4.8, already required by the desktop host.

## Choose a source

Open **Settings → Traffic capture source**:

- **Automatic** (default): use an authorized native helper when available; otherwise try a Mihomo-compatible controller. No elevation prompt opens automatically at sign-in or during background retries.
- **Windows native**: require the native helper; show a clear authorization/unavailable state if it is not running, rather than claiming successful direct capture.
- **Mihomo**: use only controller snapshots and stop the native helper.

Click **Authorize native capture** to launch the helper through the normal Windows administrator prompt. Cancelling leaves the app running. Only the helper is elevated; the dashboard, browser and session reader stay unelevated. Authorization lasts until this collector exits. After restarting or signing in, authorize again if needed. No persistent service, scheduled task, user-right grant or automatic UAC bypass is installed.

The header and diagnostics show the active source. The selected mode is saved in the local database. `captureMode` in `config.local.json` and `CODEX_NETWATCH_CAPTURE_MODE` provide the default for a profile without a saved selection.

## Measurement scope

- Count event-reported bytes for the owning process, using the PID in the network payload rather than the event header's worker-thread PID.
- Record both TCP and UDP send/receive events, including IPv6. Retransmit and TCP-copy event types are excluded to avoid counting those notifications again.
- Keep connection events that begin and end between dashboard polls. Native snapshots contain one consumed interval of new events, not repeatedly summed cumulative totals.
- Include local loopback/socket traffic. If an app connects to a local proxy, this represents its local socket I/O, not encrypted VPN wire bytes. Local inter-process connections can also appear. The all-process reference may contain both sides of local connections; it is not a NIC or internet total.
- Show destination IP addresses, not guessed hostnames. No reverse DNS request, TLS interception or packet-payload collection is performed.
- Use process creation times to reject stale ownership after PID reuse. Process ancestry supplements event evidence; a short-lived unknown process can remain unidentified if no reliable ancestry was observed.
- Exclude this monitor's own known process tree from Codex attribution, including when a developer launches Netwatch from Codex.
- Use only one source for any sample. ETW and Mihomo totals are never added together for the same interval. Switching from proxy to native drains the first native window as a cutover baseline, preventing overlap with an in-flight controller request. That discarded window remains visible as a gap. Switching sources also resets cumulative baselines where appropriate. A historical range may contain different measurement methods.
- Record ETW event/buffer loss and bounded aggregation overflow as collection gaps. Missing events and offline traffic are never reconstructed.
- Session activity and local-log token counts remain independent clues. Shared processes cannot be split precisely into per-conversation GB. Tokens are not subscription balance or billing.

## Build and test

The portable package includes `native/Codex-Netwatch-Capture.exe`. For a source checkout, run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/build-native.ps1
npm test
```

No NuGet or other native-library dependency is needed. The helper uses Windows APIs and the .NET Framework C# compiler. Its parser self-test needs no administrator permission. The real ETW integration test runs on an elevated Windows runner and launches a separate Codex-named test process that transfers known upload/download payloads directly to a test server. On unelevated machines that integration test is explicitly skipped; it is not counted as a pass.

The helper creates a uniquely named private SystemTraceProvider session and stops only its own session. It checks its named-pipe server's PID and authenticates the handshake. Closing the monitor disconnects the pipe and ends the helper and its trace. If endpoint security blocks ETW, choose Mihomo or inspect the diagnostics rather than weakening security controls.

Microsoft references: [SystemTraceProvider sessions](https://learn.microsoft.com/en-us/windows/win32/etw/configuring-and-starting-a-systemtraceprovider-session), [TCP/IP events and payload process identity](https://learn.microsoft.com/en-us/windows/win32/etw/tcpip).

## 中文摘要

不走代理也可统计：在设置中选择自动或 Windows 原生，点击“授权原生采集”，允许 Windows 管理员提示。只提升采集助手，不安装服务，不修改代理；退出后授权结束，开机自启不自动弹出 UAC。

支持 TCP/UDP、IPv4/IPv6 和采样间关闭的短连接。目标显示为 IP，不采集通信正文，不主动查询域名。包含回环连接，因此代表进程网络 I/O，并非互联网账单或网卡流量。全进程对照可能包含本机连接的两端。

自动模式在原生助手可用时使用原生，否则尝试 Mihomo；也可手动指定一种。同一时刻不叠加两种来源，切换和丢事件会记录缺口，历史允许包含不同统计口径。无法识别的进程保持待识别，会话 GB 不按 token 或域名推算。
