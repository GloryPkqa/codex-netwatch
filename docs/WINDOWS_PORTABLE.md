# Windows 便携版 / Portable Windows build

## 使用 / Usage

下载 Release 中的 `codex-netwatch-windows-x64.zip`，核对 SHA-256，完整解压到有写入权限的目录，双击 `Codex-Netwatch.exe`，在独立桌面窗口显示与网页相同的面板。Windows 10/11 x64、.NET Framework 4.8 和 Microsoft Edge WebView2 Runtime 为运行环境；无需安装 Node.js 或修改系统代理；原生直连采集需在设置中授权管理员采集助手，Mihomo 模式无需管理员权限。缺少 WebView2 时，窗口提供微软官方下载链接及浏览器入口，不自动下载安装。

Download the portable ZIP from Releases, verify its SHA-256, extract the whole folder to a writable location, then run `Codex-Netwatch.exe`. The shared dashboard opens in a desktop window. Windows 10/11 x64, .NET Framework 4.8 and Microsoft Edge WebView2 Runtime are required. Node.js is bundled; no system-proxy changes are needed. Native direct-traffic capture requires administrator authorization for its helper in Settings; Mihomo mode does not. A missing-runtime screen links to Microsoft's download page and offers browser access; it never silently installs a runtime.

托盘菜单根据 Windows 界面语言显示中文或英文，可以打开桌面面板、在浏览器打开、启动/停止采集、打开数据目录及退出。关闭窗口会收进托盘，采集继续；隐藏时尝试挂起渲染器以减少开销，重新打开时恢复。退出会停止**本次托盘启动的**采集器。页面停止采集后托盘保留，可再次启动。检测到其他方式已启动的同模式监控时只打开页面，不接管或停止它。

The tray follows the Windows UI language and provides desktop dashboard, browser, collector start/stop, data-folder and exit actions. Closing the window hides it to the tray and leaves collection running. The hidden renderer is suspended when supported and resumes on reopen. Stopping from the dashboard keeps the tray available for restart. Exit stops only the collector started by this tray. An already running compatible monitor is opened in view-only mode; this tray never stops it.

同一数据目录只允许一个托盘实例和一个采集器。重新运行 EXE 会打开现有页面。端口冲突、配置错误或无法写入会显示托盘通知；日志在 `data/tray.log`（最大约 2 MB，保留一个轮换副本）。不含自动升级。

One tray instance and one collector are allowed per data directory. Running the EXE again opens the existing dashboard. Startup failures appear as tray notifications and are recorded in `data/tray.log`, which rotates at roughly 2 MB with one previous file. There is no automatic updater.

### 开机自启 / Start with Windows

桌面版“监控设置”中的“开机自启”开关及托盘同名菜单可随时切换，默认关闭，更改立即生效。开启后，在当前用户登录 Windows 时启动托盘采集，不弹出面板。它仅写入 `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` 的 `CodexNetwatch` 值，内容为当前 EXE 路径加 `--no-browser`，不需要管理员权限。关闭时仅删除属于当前安装位置的值。移动便携目录前请先关闭自启，在新位置运行后再开启；直接删除目录不会自动清理注册项。

The desktop Monitor settings dialog's Start with Windows switch and checked tray item control this optional preference. It is off by default and changes apply immediately. Enabling writes the current user's `CodexNetwatch` Run value with the quoted EXE path and `--no-browser`; Windows sign-in starts collection in the tray without opening the dashboard. Disabling removes only the value owned by this installation. No administrator permission is needed. Disable before moving the portable folder, then enable from its new location. Deleting the folder does not remove the Run value automatically.

## 配置 / Configuration

`runtime/`、`src/`、`public/`、`scripts/`、`native/` 必须保留在 EXE 旁边。首次运行在同目录创建 `data/`。复制 `config.example.json` 为 `config.local.json` 可配置 Mihomo controller、采样和保留天数；请勿把 secret 提交到 GitHub。环境变量与源码版相同，优先级高于本地配置。

Keep the supporting folders and all three WebView2 DLLs beside the EXE. Data is created in `data/` next to it. The desktop browser profile (including language preference) is stored under `data/webview-profile/`, or under the selected demo/custom data directory; it is separate from your regular browser, while both views share the collector database. Copy `config.example.json` to `config.local.json` for collector settings. Existing environment variables also work and override local configuration; relative `CODEX_FLOW_DATA_DIR` paths resolve against the extracted folder. Never commit local secrets.

桌面语言偏好等浏览器状态保存在当前数据目录的 `webview-profile/`，与日常浏览器的设置独立；采集数据库共用。备份、升级时保留整个 `data/` 和 `config.local.json`。三份 WebView2 DLL 必须与 EXE 一起保留。

| 参数 / Option  | 含义 / Meaning                                                                       |
| -------------- | ------------------------------------------------------------------------------------ |
| `--demo`       | 独立合成数据，默认端口 43129 / isolated synthetic demo, default port 43129           |
| `--no-browser` | 仅启动托盘和采集，不打开窗口 / start without opening the dashboard window            |
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

The builder uses the Windows .NET Framework C# compiler and WinForms. The embedded GUI uses the [official Microsoft.Web.WebView2 SDK](https://www.nuget.org/packages/Microsoft.Web.WebView2/1.0.4258.31), pinned by version and SHA-256. Managed Core/WinForms bindings, the x64 loader, Microsoft's licenses and `webview2-manifest.json` are included. The [Evergreen Runtime](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution) is installed and updated separately. Embedded navigation stays on the configured local origin and user-initiated HTTPS links open in the default browser. No native host objects are exposed. A validated, local-origin-only message contract can read or toggle the startup preference; it cannot execute commands or access arbitrary files. Regular browser tabs have no native startup channel.

The collector runtime is pinned to [official Node.js 24.22.1 Windows x64](https://nodejs.org/dist/v24.22.1/). Both its ZIP and `node.exe` SHA-256 values must match the [official checksum manifest](https://nodejs.org/dist/v24.22.1/SHASUMS256.txt) and pins in the build script. The build does not claim GPG signature verification.

便携包仅携带官方 `node.exe`、完整 Node/第三方许可、校验清单和 `runtime-manifest.json`，不携带 npm。构建使用文件白名单，不包含本机配置、会话、数据库、日志、secret 或用户运行时路径。构建缓存仅位于被 Git 忽略的 `data/build-cache/`。

The package includes the official runtime executable, complete Node/third-party license, checksums, and a provenance manifest. npm is omitted. Explicit file allowlists exclude user configuration, sessions, databases, logs, and credentials. Downloads are cached only under ignored `data/build-cache/`.

On Windows with WebView2 installed, run `powershell -NoProfile -ExecutionPolicy Bypass -File desktop/gui-smoke.ps1` after building for an isolated synthetic GUI smoke test. It checks rendered live data, both languages, CSV downloads, external navigation isolation, and close/reopen behavior. It creates no startup registration and does not use your monitoring database.

## 当前边界 / Current limits

此预发布 EXE 未签名。便携包方便启动现有采集器，不改变 Mihomo 快照覆盖边界、系统绕过代理的可见性或会话字节归因能力。采集仍依赖用户已有 Mihomo/Clash 控制接口。

This prerelease EXE is unsigned. Packaging does not change the collector's measurement limits: it still needs an existing Mihomo/Clash controller, can miss short connections, cannot see bypass traffic, and cannot allocate shared connection bytes precisely to individual Codex chats.
