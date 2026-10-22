# Windows 便携版 / Portable Windows build

## 使用 / Usage

下载 Release 中的 `codex-netwatch-windows-x64.zip`，核对 SHA-256，完整解压到有写入权限的目录，双击 `Codex-Netwatch.exe`。Windows 10/11 x64 和 .NET Framework 4.8 为运行环境；无需安装 Node.js、管理员权限或修改系统代理。

Download the portable ZIP from Releases, verify its SHA-256, extract the whole folder to a writable location, then run `Codex-Netwatch.exe`. Windows 10/11 x64 with .NET Framework 4.8 is required. Node.js is bundled; no administrator permission or system-proxy changes are needed.

托盘菜单根据 Windows 界面语言显示中文或英文，可以打开页面、启动/停止采集、打开数据目录及退出。退出会停止**本次托盘启动的**采集器。浏览器关闭后仍会采集。网页停止采集后托盘保留，可再次启动。检测到其他方式已启动的同模式监控时只打开页面，不接管或停止它。

The tray menu follows the Windows UI language and provides dashboard, collector start/stop, data-folder, and exit actions. Closing the browser leaves collection running. Stopping from the dashboard keeps the tray available for restart. Exit stops only the collector started by this tray. An already running compatible monitor is opened in view-only mode; this tray never stops it.

同一数据目录只允许一个托盘实例和一个采集器。重新运行 EXE 会打开现有页面。端口冲突、配置错误或无法写入会显示托盘通知；日志在 `data/tray.log`（最大约 2 MB，保留一个轮换副本）。没有开机自启或自动升级。

One tray instance and one collector are allowed per data directory. Running the EXE again opens the existing dashboard. Startup failures appear as tray notifications and are recorded in `data/tray.log`, which rotates at roughly 2 MB with one previous file. There is no startup registration or automatic updater.

## 配置 / Configuration

`runtime/`、`src/`、`public/`、`scripts/` 必须保留在 EXE 旁边。首次运行在同目录创建 `data/`。复制 `config.example.json` 为 `config.local.json` 可配置 Mihomo controller、采样和保留天数；请勿把 secret 提交到 GitHub。环境变量与源码版相同，优先级高于本地配置。

Keep the supporting folders beside the EXE. Data is created in `data/` next to it. Copy `config.example.json` to `config.local.json` for collector settings. Existing environment variables also work and override local configuration; relative `CODEX_FLOW_DATA_DIR` paths resolve against the extracted folder. Never commit local secrets.

| 参数 / Option  | 含义 / Meaning                                                                       |
| -------------- | ------------------------------------------------------------------------------------ |
| `--demo`       | 独立合成数据，默认端口 43129 / isolated synthetic demo, default port 43129           |
| `--no-browser` | 启动托盘和采集但不打开浏览器 / start without opening a browser                       |
| `--stop`       | 通知同一数据目录的托盘停止其采集器 / ask the matching tray to stop its own collector |
| `--start`      | 通知现有托盘重新启动采集 / ask an existing tray to restart collection                |
| `--exit`       | 通知现有托盘停止并退出 / ask an existing tray to stop and exit                       |

控制命令需要与原托盘相同的 `--demo` 和数据目录环境变量；没有对应托盘时退出码为 4。`--start` 不会创建新托盘。

Control commands need the same demo/data-directory settings as the original tray. They exit with code 4 if no matching tray exists. `--start` does not create a new tray.

## 构建及来源 / Build and provenance

在 Windows PowerShell 执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/package-windows.ps1
```

构建器使用系统 .NET Framework 的 C# 编译器生成 WinForms 托盘。原生通知区域使用 [Microsoft NotifyIcon API](https://learn.microsoft.com/en-us/dotnet/api/system.windows.forms.notifyicon)；编译选项见 [Microsoft compiler output options](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/compiler-options/output)。

The builder uses the Windows .NET Framework C# compiler and WinForms, without third-party tray dependencies. The collector runtime is pinned to [official Node.js 24.22.1 Windows x64](https://nodejs.org/dist/v24.22.1/). Both its ZIP and `node.exe` SHA-256 values must match the [official checksum manifest](https://nodejs.org/dist/v24.22.1/SHASUMS256.txt) and pins in the build script. The build does not claim GPG signature verification.

便携包仅携带官方 `node.exe`、完整 Node/第三方许可、校验清单和 `runtime-manifest.json`，不携带 npm。构建使用文件白名单，不包含本机配置、会话、数据库、日志、secret 或用户运行时路径。构建缓存仅位于被 Git 忽略的 `data/build-cache/`。

The package includes the official runtime executable, complete Node/third-party license, checksums, and a provenance manifest. npm is omitted. Explicit file allowlists exclude user configuration, sessions, databases, logs, and credentials. Downloads are cached only under ignored `data/build-cache/`.

## 当前边界 / Current limits

此预发布 EXE 未签名。便携包方便启动现有采集器，不改变 Mihomo 快照覆盖边界、系统绕过代理的可见性或会话字节归因能力。采集仍依赖用户已有 Mihomo/Clash 控制接口。

This prerelease EXE is unsigned. Packaging does not change the collector's measurement limits: it still needs an existing Mihomo/Clash controller, can miss short connections, cannot see bypass traffic, and cannot allocate shared connection bytes precisely to individual Codex chats.
