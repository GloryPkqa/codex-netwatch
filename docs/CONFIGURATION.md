# Configuration and troubleshooting

The network collector needs a **Mihomo / Clash-compatible local controller** with a compatible `/connections` response. A proxy client without that interface, another VPN, or direct traffic is outside the current network coverage. Session log reading works independently.

## First connection

Open **Connection help** at the top of the dashboard. New profiles without measured Codex traffic see it automatically; it can be collapsed and reopened. Its status distinguishes an unreachable controller, a 401/403 secret mismatch, an incompatible controller response, unavailable process evidence, and waiting for fresh Codex requests. A working controller with no Codex traffic is not reported as a connection failure.

Use the proxy's **external-controller address**, not its HTTP/SOCKS proxy port or subscription URL. After connecting, make a new request in Codex and wait for two samples. Baselines deliberately exclude traffic from before monitoring began. Refresh checks rereads the current collector status; controller polling already retries automatically.

## Local configuration

Copy `config.example.json` to `config.local.json`, edit it, and restart. The file is ignored by Git. Keep credentials and private paths out of issue reports.

| Setting              | Default     | Meaning                                                                        |
| -------------------- | ----------- | ------------------------------------------------------------------------------ |
| `controller`         | `auto`      | Discover local controllers, or set an HTTP endpoint / Windows named pipe.      |
| `port`               | `43128`     | Dashboard port; binds only to `127.0.0.1`.                                     |
| `codexHome`          | `~/.codex`  | Local session database/log directory; an empty string uses the default.        |
| `intervalMs`         | `1000`      | Poll interval, from 500 to 10000 ms.                                           |
| `retentionDays`      | `30`        | Network history and alert retention, from 1 to 365 days.                       |
| `alertMBPerMinute`   | `100`       | Decimal MB observed in 60 seconds. A threshold saved in the UI takes priority. |
| `includeDescendants` | `true`      | Include processes whose ancestry leads to an identified Codex process.         |
| `processNames`       | See example | Exact, case-insensitive process names. No domain or substring guessing.        |

Environment variables override local configuration:

| Variable                | Purpose                                                                         |
| ----------------------- | ------------------------------------------------------------------------------- |
| `CODEX_FLOW_CONTROLLER` | Explicit local controller endpoint.                                             |
| `MIHOMO_SECRET`         | Controller secret. Never sent to the browser or stored in the monitor database. |
| `CODEX_HOME`            | Codex session directory.                                                        |
| `CODEX_FLOW_PORT`       | Dashboard port.                                                                 |
| `CODEX_FLOW_DATA_DIR`   | Monitor data directory; demos use its `demo/` subdirectory.                     |

The `CODEX_FLOW_*` names are retained for compatibility. Use them as written.

```powershell
$env:CODEX_FLOW_CONTROLLER = 'http://127.0.0.1:9090'
$env:MIHOMO_SECRET = '<local-controller-secret>'
node --disable-warning=ExperimentalWarning src/main.mjs
```

For the portable build, fully exit the existing tray instance first. From PowerShell in the extracted app folder, set the same environment variables and launch the desktop host instead:

```powershell
Start-Process .\Codex-Netwatch.exe
```

The new process inherits that PowerShell environment. Variables set only in this shell do not persist for later double-click launches or Windows sign-in.

Automatic discovery reads supported Clash Verge control configuration and enumerates matching Windows named pipes. It does not change the controller, proxy rules, or system proxy. Remote controllers, authenticated URLs, and HTTPS interception are unsupported.

## Language and desktop behavior

The dashboard defaults to **English**. Use the top-right menu for **中文** or **Auto (system)**. Explicit choices are preserved. Auto reads the Windows display language at startup, then falls back to the runtime/browser locale. Switching languages preserves collection and filters.

The desktop profile stores its own language preference under the selected data directory's `webview-profile/`; it is independent of your normal browser. Native tray/recovery messages follow the Windows UI language.

Closing the desktop window keeps the collector in the tray. The optional **Settings → Start with Windows** switch applies immediately and starts in the tray at Windows sign-in. See [desktop lifecycle and startup details](WINDOWS_PORTABLE.md).

## Collection and findings

- First attach, reconnect, source changes, and restart establish a baseline. Offline bytes are not imported.
- Historical network queries align to minute buckets. The start rounds down; historical end boundaries are exclusive and non-minute API ends round up. The UI shows the queried range.
- The connection table shows the largest 100 rows. Search applies to those displayed rows; CSV includes the selected time/process scope, up to 10000 rows, independently of the page search.
- Burst findings use the configured MB/60-second threshold for a single direction. Sustained upload needs at least two minutes, average upload at least half that rate, and at least 75% of measured time above one quarter of that rate. Events rearm after recovery with a five-minute cooldown.
- Context retains the top 10 uploads and top 10 downloads per sample. The displayed contributor is a clue, not attribution of every byte in the event window. Findings may overlap the selected range. Investigation summaries refresh within 10 seconds.
- Collection gaps record outages, restarts, delayed polling/sleep, source changes and unavailable process evidence. Missing bytes stay unknown; overlapping gaps are not summed into invented traffic.
- Token increments cover observed runtime periods across restarts, independently of the network time selector. First reads and offline periods are not backfilled. Session activity does not allocate shared network bytes.

## Troubleshooting

Run `node --disable-warning=ExperimentalWarning scripts/doctor.mjs` for sanitized connectivity and process-matching counts.

| Symptom                                | Check                                                                                                                                                                   |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Controller disconnected                | Confirm the proxy is running and has a compatible local interface. Set the endpoint explicitly if discovery fails. HTTP 401/403 requires the correct controller secret. |
| Proxy total grows, Codex stays at zero | Inspect unidentified connections and collector diagnostics. Traffic bypassing this controller is invisible; the first sample is only a baseline.                        |
| Controller process fields are empty    | Windows can match source address/port against TCP/UDP owner tables. Restricted OS access leaves attribution unidentified.                                               |
| A session shows `—` tokens             | The log tail has no readable counter, the local schema changed, or the session is not available locally. Unknown is not zero.                                           |
| A child download is missing            | A process reparented outside the observed Codex ancestry may no longer be attributable.                                                                                 |
| Port conflict                          | Set `CODEX_FLOW_PORT`. Source-launch logs are in the selected data directory; desktop logs are in `tray.log`.                                                           |
| Desktop dashboard cannot open          | Install Microsoft Edge WebView2 Runtime through the recovery window's Microsoft link, or use the tray's browser entry.                                                  |
| Another collector owns this directory  | Stop the original instance. Only locks with a verifiably dead PID are reclaimed automatically; verify an unknown owner before removing a lock.                          |

For issue reports, include versions, steps, and reviewed redacted diagnostics. Do not attach raw databases, credentials, real session titles, or unreviewed CSV. Read [Security and privacy](../SECURITY.md) before sharing data.
