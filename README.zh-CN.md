# Codex Netwatch

在本机查看 Codex 网络用量、进程归属和会话活动。

[**下载 Windows x64 便携版 →**](https://github.com/GloryPkqa/codex-netwatch/releases/latest/download/codex-netwatch-windows-x64.zip) · [版本说明与校验值](https://github.com/GloryPkqa/codex-netwatch/releases/latest) · [English](README.md)

![实际使用中的流量总览、小时趋势和目标地址](docs/overview.en.png)

**Windows 优先，需要运行中的 Mihomo / Clash 兼容控制接口。** 统计经过该代理、具有进程证据的 Codex 流量；绕过代理的流量不可见，共享连接无法精确拆成每个会话的 GB。

## 功能

- 实时上传、下载和速率，本地历史、时间筛选及 CSV 导出。
- 默认只显示 Codex 进程排行，可切换全部代理程序作对照。
- 突发上传 / 下载、持续上传及采集缺口记录。
- 只读会话活动和 token 计数，与网络字节分开显示。
- Windows 桌面 GUI、托盘、可选开机自启和浏览器入口。
- 默认英文；右上角原语言菜单可切换 **中文** 或 **自动（系统）**，保留已有语言偏好。
- 本地 SQLite 与静态资源，不含应用遥测，支持脱敏诊断。
- 首次使用连接帮助，区分接口连接、密钥、响应不兼容和等待 Codex 新流量；顶部可随时重新打开。

## Windows 安装

1. 从同一个 [Release](https://github.com/GloryPkqa/codex-netwatch/releases) 下载 `codex-netwatch-windows-x64.zip` 和 `SHA256SUMS.txt`。
2. 核对 SHA-256，完整解压到可写目录。
3. 在代理和 Codex 正常运行时，双击 `Codex-Netwatch.exe`。
4. 按“连接帮助”检查状态，在 Codex 中发送新请求并等待两次采样；已有连接会先建立基线，再累计新流量。

```powershell
Get-FileHash .\codex-netwatch-windows-x64.zip -Algorithm SHA256
```

便携版内置 Node.js，需要 **Windows 10/11 x64、.NET Framework 4.8 和 Microsoft Edge WebView2 Runtime**。Windows EXE 未签名。

关闭窗口后继续在托盘采集；双击托盘重新打开。**设置 → 开机自启** 默认关闭，按需开启。完全退出请使用托盘“退出”。

升级前正常停止并备份 `data/` 与 `config.local.json`，替换程序文件时保留这两项。详见[便携版说明](docs/WINDOWS_PORTABLE.md)。

## 源码运行

安装 **Node.js 24+**，无需安装 JavaScript 依赖。

```powershell
git clone https://github.com/GloryPkqa/codex-netwatch.git
cd codex-netwatch
node --disable-warning=ExperimentalWarning src/main.mjs
```

访问 [127.0.0.1:43128](http://127.0.0.1:43128)。Windows 可双击 `start.cmd` 启动并打开网页；`start-demo.cmd` 在端口 43129 使用独立合成数据。终端启动的实例可用 Ctrl+C 停止。

## 统计口径

| 数据         | 含义                                                   |
| ------------ | ------------------------------------------------------ |
| Codex 流量   | 有进程证据的连接字节增量；不计入其他进程和待识别流量。 |
| 全部代理流量 | 当前控制器的全局计数，包含其他应用。                   |
| 会话活动     | 日志活动与采样时间重合，**不是该会话的 GB 归属**。     |
| token 计数   | 本地日志计数及已观测增量，**不是账单或订阅额度**。     |

首次连接、重启、接口切换和重连先建立基线，不补算离线流量。快照采样可能漏掉短连接及关闭前的尾部字节；统计的是应用层字节，不等同于 VPN 账单或网卡流量。MB / GB 使用十进制单位。

## 配置与排错

先查看页面顶部“连接帮助”，里面有当前状态、操作步骤和手动配置示例；采集器会自动重试。支持自动发现部分 Clash Verge 配置及 Windows 命名管道，其他兼容接口可手动配置。应填写控制接口端口，不是 HTTP / SOCKS 代理端口。复制 `config.example.json` 为 `config.local.json` 后编辑，完整退出并重新启动生效。

支持 `CODEX_FLOW_CONTROLLER`、`MIHOMO_SECRET`、`CODEX_HOME`、`CODEX_FLOW_PORT` 和 `CODEX_FLOW_DATA_DIR` 环境变量。

```powershell
node --disable-warning=ExperimentalWarning scripts/doctor.mjs
```

详细配置、识别边界和常见问题见[配置与排错](docs/CONFIGURATION.md)。**设置 → 导出脱敏诊断** 排除连接 / 会话身份和密钥，分享前仍请检查汇总用量。

## 隐私与验证

本地数据库保存目标地址、进程身份、会话元数据、token 和活动时间；不持久化聊天正文、工具内容、命令行或凭据。请勿公开 `data/`、本地配置和原始 CSV；自愿分享截图前，请检查其中是否有敏感信息。见[安全说明](SECURITY.md)。

CI 检查 Windows / Linux 语法与测试，并构建及检查 Windows 便携版启停。[验证记录](docs/VALIDATION.md) 说明具体范围；**不宣称已完成 24 / 72 小时验证**。

## 开发

```sh
npm run check
npm test
```

采集器使用 Node.js 原生 HTTP、SQLite 和本地前端。Windows 从系统套接字表识别进程；Linux / macOS 可依赖控制器的进程字段，原生进程匹配和桌面 EXE 为 Windows 专属。

[贡献指南](CONTRIBUTING.md) · [稳定性测试工具](docs/STABILITY.md) · [MIT 许可证](LICENSE)

维护者：[GloryPkqa](https://github.com/GloryPkqa)。独立项目，与 OpenAI 或 MetaCubeX 无官方关联。
