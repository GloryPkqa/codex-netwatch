# Contributing

Node.js 24+ is required. There are no third-party dependencies to install.

```sh
npm run check
npm test
npm run demo
```

Use `start-demo.cmd` on Windows to avoid a running real monitor's port. Demo and real data must stay separate. Tests must use temporary directories, synthetic sessions, and mock controllers; never depend on a contributor's real Codex installation, proxy credentials, or network destinations.

## Module boundaries

- `src/mihomo.mjs`: read-only local controller discovery and snapshots.
- `src/processes.mjs` + `scripts/windows-observer.ps1`: process and socket evidence. No byte estimation.
- `src/accounting.mjs`: deterministic cumulative-counter deltas and baselines.
- `src/sessions.mjs`: read-only, bounded session usage extraction. No chat-content persistence.
- `src/store.mjs`: monitor-owned SQLite schema, retention, and queries.
- `src/monitor.mjs`: non-overlapping polling, alert thresholds, and lifecycle.
- `src/server.mjs`: loopback API, request boundaries, CSV export.
- `public/`: local-only, dependency-free UI.

## Review requirements

1. Explain the user-visible problem and the new behavior.
2. State any change in metric meaning or data coverage. Never silently change the accounting baseline.
3. Add focused tests for accounting, adapters, persistence, or request boundaries when they change.
4. Do not allocate shared process bytes to sessions without explicit, verifiable identity evidence. Activity-only associations must stay labelled.
5. Do not add remote assets, analytics, arbitrary-controller fetches, packet decryption, or broad process-name substring matching.
6. Keep credentials and local fixtures out of commits and screenshots. Use the demo for public screenshots.
7. Before schema changes, add a versioned migration and test new databases and upgrades from supported versions. The current schema is version 2 with a tested migration from version 1. Preserve data; do not drop/recreate user databases.

CI checks JavaScript syntax and deterministic tests on Windows and Linux. Windows owner-table collection and UI layout should also be checked manually when those modules change. Do not claim CI validates a real user's Mihomo installation.

Public issue reports should include OS/Node/Mihomo versions, reproduction steps, and the sanitized `npm run doctor` output. Do not attach real logs, databases, session titles, or CSV without reviewing them. Security-sensitive reports should be sent privately to a maintainer once the repository has a contact configured.
