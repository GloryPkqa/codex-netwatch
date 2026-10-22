# v0.2.0 preview validation

Validation recorded on 2026-10-22. These results describe the tested workload and host, not an accuracy guarantee for every proxy or Windows installation.

## Completed

- 74 automated tests and JavaScript syntax checks passed locally on Windows.
- Portable Windows tray smoke passed with the bundled official Node.js v24.22.1: start, duplicate launch, stop, restart, exit, collector-lock cleanup, ownership marker, and refusal to stop an unrelated compatible-looking service.
- The additive v2→v3 database migration preserved existing counters; SQLite integrity remained `ok`.
- English / Chinese UI checks covered anomaly display, connection drill-down, scoped gaps, language persistence and diagnostic download. Privacy tests seed identifying and credential canaries and verify they are excluded from the exported JSON.

The final **30-second, 1,000-connection, 500-ms polling** fault/load run used the same official runtime and frozen collector source as the long run:

| Measurement | Observed result |
| --- | --- |
| Actual wall-clock duration | 30.523 seconds |
| Successful responses / persisted samples | 46 / 46; independent byte oracle matched |
| Deliberate faults | 17 HTTP 503 responses, 3 collector restarts, 2 connection-counter and 2 global-counter resets |
| SQLite integrity | `ok`; bucket and sample totals agreed |
| Peak collector RSS | 93,003,776 bytes; excludes the harness and observer child |
| Peak database + WAL footprint | 3,467,200 bytes |
| Maximum measured dashboard latency | 13.49 ms |
| Observed sampling intervals | 19.361 seconds; deliberate outages, restart startup and baselines are excluded |

The observed-time fraction is **not packet-capture coverage**. Faults were intentionally frequent in this short test. The raw, sanitized [synthetic smoke report](validation/smoke-official-node.json) contains the exact settings and counters.

## Long-run status

A separate **24 actual hour** run began at **2026-10-22 18:38:13 Asia/Shanghai** with 300 synthetic connections, periodic outages and collector restarts. It uses official Node.js v24.22.1 and source fingerprint `73895f1dc4bb4a4e368a488bfdcce64a1f1004bf25608e8e8d07f4a9a9f93a21`.

The long run was stopped before completion. **Neither a completed 24-hour nor a 72-hour result is claimed for this preview.** The test harness remains available for a later full run. Major scheduling pauses, sleep, interruption, unexpected collector exit, byte mismatches or integrity failures prevent a pass.

See [STABILITY.md](STABILITY.md) for reproduction and measurement limits. The source fingerprint identifies the frozen `src/`, `public/`, `scripts/` and `package.json` file bytes on the recorded host; it is not the Git commit ID or archive checksum.
