# Changelog

## 0.1.0 — 2026-10-22

- Local Mihomo connection sampling with Windows named-pipe discovery.
- Windows IPv4/IPv6 TCP/UDP owner evidence and optional Codex descendants.
- Baseline-aware deltas, reconnect handling, retention, and SQLite history.
- Chinese dashboard with live rates, destinations, connection filters, custom ranges, and CSV export.
- Read-only session usage and explicitly labelled activity correlation.
- Threshold alerts and opt-in browser desktop notifications.
- Synthetic demo mode, diagnostic command, Windows launchers, allowlisted source packaging, and Windows/Linux CI.
- Release checks fixed custom end-boundary overcounting, replayed samples, historical activity timestamps, named child-process attribution, trickling-response timeouts, and custom demo data isolation.
- Single-collector locking, a data-preserving schema v1→v2 migration, bounded request handling, and an end-to-end process lifecycle regression test.

Known limits: snapshot sampling can miss short connections and closing bytes; direct traffic is outside coverage; shared connections cannot be split into per-session GB; session log schemas are internal and may change; native socket matching is currently Windows-only.
