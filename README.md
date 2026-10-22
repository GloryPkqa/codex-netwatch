# Codex Netwatch

A local dashboard for Codex network usage, process attribution, and session activity.

[**Download for Windows x64 →**](https://github.com/GloryPkqa/codex-netwatch/releases/latest/download/codex-netwatch-windows-x64.zip) · [Release notes & checksums](https://github.com/GloryPkqa/codex-netwatch/releases/latest) · [简体中文](README.zh-CN.md)

![Codex Netwatch showing recorded traffic, an hour of history and destinations](docs/overview.en.png)

**Windows first. Requires a running Mihomo / Clash-compatible controller.** It measures observed proxy traffic, including identified Codex child processes. It cannot see traffic bypassing that controller or precisely split shared connections between chats.

## Features

- Live upload/download rates, local history, time filters, and CSV export.
- Codex-only process rankings by default, with an explicit all-proxied-app comparison.
- Upload/download burst detection, sustained-upload findings, and recorded collection gaps.
- Read-only session activity and token counters, kept separate from network bytes.
- Windows desktop GUI, system tray, optional startup at sign-in, and browser access.
- English by default. Select **中文** in the top-right language menu, or choose **Auto (system)**. Existing language preferences are remembered.
- Local SQLite storage, local UI assets, and redacted diagnostics; no application telemetry.
- First-run connection help distinguishes controller access, authentication, incompatible responses, and waiting for new Codex traffic. Reopen it from **Connection help** at any time.

[View the investigation panel](docs/investigation.en.png).

## Install on Windows

1. Download `codex-netwatch-windows-x64.zip` and `SHA256SUMS.txt` from the same [release](https://github.com/GloryPkqa/codex-netwatch/releases).
2. Verify the ZIP's SHA-256, then extract the **entire folder** to a writable location.
3. Run `Codex-Netwatch.exe` with your proxy and Codex running.
4. Follow **Connection help** if needed, send a new request in Codex, and wait for two samples. Existing transfers establish a baseline before new bytes accumulate.

```powershell
Get-FileHash .\codex-netwatch-windows-x64.zip -Algorithm SHA256
```

The portable build includes Node.js. It requires **Windows 10/11 x64, .NET Framework 4.8, and Microsoft Edge WebView2 Runtime**. The Windows EXE is unsigned.

Closing the window keeps collection running in the tray. Double-click the tray to reopen it. **Settings → Start with Windows** is optional and off by default. Use the tray's Exit command to quit the desktop host.

For updates, stop the app and back up `data/` and `config.local.json`. Replace application files while preserving both. See [portable lifecycle and build details](docs/WINDOWS_PORTABLE.md).

## Run from source

Install **Node.js 24+**. There are no JavaScript packages to install.

```powershell
git clone https://github.com/GloryPkqa/codex-netwatch.git
cd codex-netwatch
node --disable-warning=ExperimentalWarning src/main.mjs
```

Open [127.0.0.1:43128](http://127.0.0.1:43128). On Windows, `start.cmd` starts the collector and opens the browser; `start-demo.cmd` runs isolated synthetic data on port 43129. For a terminal instance, use Ctrl+C to stop collection.

## What the numbers mean

| Metric            | Meaning                                                                                                     |
| ----------------- | ----------------------------------------------------------------------------------------------------------- |
| Codex traffic     | Observed connection-byte deltas with process identity evidence. Other and unidentified traffic is excluded. |
| All proxy traffic | Global counters from the current controller, including other apps.                                          |
| Session activity  | Log activity overlapping collection times; **not per-chat GB attribution**.                                 |
| Token counters    | Local log counters and observed increments; **not billing or subscription quota**.                          |

First attach, restart, source switching, and reconnect establish a new baseline. Offline traffic is not backfilled. Snapshot sampling can miss short connections and closing bytes; these are application bytes, not VPN billing or wire bytes. MB and GB use decimal units.

## Configuration and troubleshooting

Start with **Connection help** at the top of the dashboard. It shows the current connection state, setup steps and a manual configuration example. The collector retries automatically. Automatic discovery works with supported local Clash Verge configurations and Windows named pipes. Other compatible controllers can be configured explicitly. Use the **controller port**, not the HTTP / SOCKS proxy port.

Copy `config.example.json` to `config.local.json`, edit it, then restart. Environment overrides include `CODEX_FLOW_CONTROLLER`, `MIHOMO_SECRET`, `CODEX_HOME`, `CODEX_FLOW_PORT`, and `CODEX_FLOW_DATA_DIR`.

```powershell
node --disable-warning=ExperimentalWarning scripts/doctor.mjs
```

[Configuration and troubleshooting](docs/CONFIGURATION.md) covers controller secrets, attribution, paths, and collection limits. **Settings → Export redacted diagnostics** creates a report without connection/session identities or credentials; review its aggregate usage before sharing.

## Privacy and validation

Local data includes destinations, process identity, session metadata, token counters, and activity times. Chat bodies, tool contents, command lines, and credentials are not persisted. Keep `data/`, local configuration and raw CSV private; inspect screenshots for sensitive information before choosing to share them. See [Security and privacy](SECURITY.md).

CI checks syntax and tests on Windows/Linux and builds/tests the Windows portable lifecycle. [Validation records](docs/VALIDATION.md) describe the exact tested scope. **A completed 24/72-hour validation is not claimed.**

## Development

```sh
npm run check
npm test
```

The collector uses Node.js HTTP and SQLite with a local HTML/CSS/JavaScript dashboard. Windows socket/process ownership comes from the OS owner tables. Linux/macOS can use controller-supplied process metadata; native socket attribution and the desktop EXE are Windows-specific.

[Contributing](CONTRIBUTING.md) · [Stability runner](docs/STABILITY.md) · [MIT license](LICENSE)

Maintained by [GloryPkqa](https://github.com/GloryPkqa). Independent project, not affiliated with OpenAI or MetaCubeX.
