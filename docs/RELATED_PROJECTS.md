# 同类项目与定位

检索日期：2026-10-22。以下比较基于各仓库 README / 官方项目文档，并非逐项安装验证；没有宣称完整覆盖 GitHub 上的所有项目。

| 项目                                                                              | 主要用途                                                          | 与本项目的关系                                                                                                      |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| [ProxyTrafficMonitor](https://github.com/yaozhihang2002/ProxyTrafficMonitor)      | Windows 的 Clash/Mihomo 程序流量统计、分钟趋势、CSV、托盘与便携版 | 最接近的通用代理流量方案；核心采集目标明显重叠。本项目增加 Codex 会话活动与日志 token 对照，使用 Node.js 原生模块。 |
| [Codex Tripwire](https://github.com/moltenbit/codex-tripwire)                     | Codex CLI 命令、MCP、搜索和沙箱代理网络决策审计                   | 网络可观察性相近，但重点是命令/策略审计，依赖 Codex 沙箱网络代理。                                                  |
| [CodexMonitor](https://github.com/RichSteini/CodexMonitor)                        | 本地 JSONL 会话 token、缓存与 API 等价成本面板                    | 会话统计和本地网页形态相近，README 的重点是 token 与成本。                                                          |
| [ccusage](https://github.com/ccusage/ccusage/blob/main/docs/guide/codex/index.md) | 按日、月、会话汇总 Codex token 与估算成本                         | 值得参考复杂日志与继承计数处理；不应把 token 统计当作网络 GB 计量。                                                 |
| [CodexBar](https://github.com/steipete/CodexBar)                                  | 编程助手额度、重置时间、消费与本地使用历史                        | 额度可见性相关，解决的问题与代理字节观测不同。                                                                      |

本项目的定位是 **Windows + Mihomo 的 Codex 进程字节观测，同时提供本地会话活动线索**。这不是全新类别：代理流量统计、会话面板和本地监控已有现成实现。若需求只是查看通用代理 GB，ProxyTrafficMonitor 值得直接比较；需要复杂 token / 成本报表时，可同时使用 ccusage。

共享连接仍不能可靠拆成各会话的 GB。网络字节、token、额度和费用是不同口径，本项目不会将它们互相换算。

## 名称

[Dmatut7/codex-flow](https://github.com/Dmatut7/codex-flow) 已用于 Codex 工作流编排。为降低名称混淆，本项目从原型名 Codex Flow 改为 **Codex Netwatch**，公开仓库为 `GloryPkqa/codex-netwatch`。原型的 `CODEX_FLOW_*` 配置环境变量及本地请求头继续兼容。

## 相关问题报告

OpenAI Codex 仓库有一份[Windows app-server 上传占满带宽的用户报告](https://github.com/openai/codex/issues/29854)。它说明类似症状有人报告过，但不是本机问题的诊断或官方确认。本项目提供进程、方向、地址和时间数据，帮助进一步排查。

上述链接是独立项目和问题报告，不代表合作、背书或代码继承。本项目没有复制这些仓库的实现。
