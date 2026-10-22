# Changelog

## 0.2.0 — 2026-10-22

- Persist upload/download bursts and sustained uploads with measured contributor context, cooldowns and process totals.
- Record collection gaps across restarts, outages, source changes, long sampling delays, observer failures and clock changes; recovery establishes a new baseline.
- Add bilingual investigation panels, scoped connection drill-down and collector resource diagnostics.
- Add allowlisted, redacted diagnostic JSON export and test privacy with seeded identity/credential canaries.
- Add Windows x64 portable tray EXE with a checksum-verified official Node runtime, licensing, own-collector lifecycle and CI smoke tests.
- Add an isolated, frozen-source stability runner with an independent byte oracle, real collector restarts, outage/counter-reset faults and resource reports. A real 24-hour validation run is tracked separately from completed short tests.
- Migrate database schema v2→v3 additively; older collectors must not be used against the upgraded database.

## 0.1.1 — 2026-10-22

- English / Simplified Chinese interface with an Auto (system) language option and persistent browser preference.
- Read Windows display language once at startup, with runtime/browser locale fallbacks; language changes preserve filters and collection.
- Translate dynamic evidence, diagnostics, historical alerts, tooltips, dates, dialogs, and accessible labels while preserving user-provided session titles and network addresses.
- Add a footer @GloryPkqa link to the project repository and improve narrow-window control wrapping.
- Preserve stopped/disconnected status and unknown transfer rates after switching languages; prevent stale session-overlap responses from reopening or overwriting a dialog.
- Add translation coverage, placeholder safety, static-DOM preservation, locale detection, and optional-storage regression tests.

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
