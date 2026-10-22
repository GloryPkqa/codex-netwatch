# Stability and load validation

Codex Netwatch includes a reproducible local soak runner. It starts the **real collector** against a synthetic Mihomo HTTP fixture on loopback, creates an empty `CODEX_HOME`, and freezes a copy of the application for that run. It does not contact an external API or read your Codex conversation logs. Your normal collector, proxy settings and database remain separate.

Node.js 24 or newer is required. Run from the repository directory:

```sh
node scripts/stability.mjs --duration 30s --connections 300
node scripts/stability.mjs --hours 24 --connections 300 --work-dir ./data/stability-24h
```

The long command takes **24 actual hours**. `--hours 72` requests 72 actual hours. A short test, accelerated fault cycles, or a report with `status: "running"` does not establish 24-hour stability. Keep the host awake and allow the process to continue running. A scheduling pause longer than 30 seconds (or the checkpoint period plus 10 seconds, whichever is longer) marks the run interrupted, so sleeping the host cannot produce a passing continuous-run result. Closing its terminal interrupts a foreground run; use your operating system's background process facility for an unattended run.

An accelerated fault smoke test:

```sh
node scripts/stability.mjs --duration 30s --connections 300 --interval 500ms --checkpoint-every 2s --outage-every 5s --outage-for 1s --restart-every 8s
```

The default workload maintains 300 connections with deterministic uploads and downloads, replaces a small portion with short connections, resets individual/global counters, returns periodic HTTP 503 outages, and restarts the real collector every 30 minutes. Checkpoints compare persisted bytes against a separately implemented counter oracle, compare sample and connection-bucket totals, run SQLite `quick_check`, and check that persisted sample counts never decrease. The final audit runs the full SQLite `integrity_check` and also verifies that all successful fixture responses were persisted. No skipped outage traffic is backfilled.

Each run preserves:

- `report.json`: an atomically updated, sanitized summary with the source SHA-256, requested and actual elapsed time, completion state, fault/restart counts, byte audit, database size, dashboard latency, and collector memory where the host supports it. Maximum loop/checkpoint gaps and active sampling coverage distinguish elapsed wall time from the intervals actually observed. Coverage sums persisted sample intervals up to twice the configured polling period; startup, reconnect baselines, and longer gaps are excluded.
- `checkpoints.jsonl`: compact measurement history, suitable for plotting memory and database growth.
- `frozen-app/`, `collector-data/`, and collector logs: isolated reproduction material. These are **local files**, outside release packages. The generated local configuration contains the temporary loopback fixture address.

The report excludes file paths, process IDs, hostnames, conversation titles and credentials. Any collector diagnostic fields included in the report are limited to numeric metrics. Inspect local logs before sharing them independently.

Use `--output <path>` to select the sanitized report destination and `--work-dir <new directory>` for all run material. The runner refuses to reuse a nonempty work directory. `--connections` accepts 3–2000; 200–1000 is useful for ordinary load testing. `--help` lists timing controls. Do not select a work directory inside the source folders.

A passed test establishes the behavior of that frozen source snapshot and workload on the recorded host. It cannot establish how accurately a particular user's proxy exposes short connections, reproduce every Windows networking failure, or substitute for observing the real application over time. The source hash and package version in the report identify the tested build.
