# Security and privacy

This is a local observability tool, not a security boundary or packet capture product. It runs with the current user's permissions. The latest v0.2.x prerelease is currently maintained.

## Boundaries

- HTTP server binds only to `127.0.0.1`, validates the Host header, rejects foreign Origin headers, and requires a custom header for data/mutation APIs. No CORS access is granted. Health reports app/version/state, system locale, demo mode and (for tray-launched collectors) a random ownership marker. The marker protects lifecycle coordination; it is not a security boundary against other local applications.
- Controller targets are limited to local HTTP endpoints or Windows named pipes. Controller operations are read-only GET `/connections`. Credentials are never sent to the browser or saved in the monitor database. The program does not read Codex authentication files.
- The monitor does not change proxy rules, controller security, system proxy settings, or Codex settings. No TLS interception or administrator requirement is introduced.
- Codex state databases use read-only/query-only connections. Rollout paths must resolve within the configured Codex home. Only bounded log tails are parsed. Command lines and chat/tool contents are not persisted.
- HTML renders user-derived fields through text nodes. Assets are local with a restrictive CSP. CSV export quotes fields and neutralises leading spreadsheet formulas.
- Process ancestry rejects cycles and parent PID reuse. Socket matches require an unambiguous owner. Missing identity remains unknown.

These measures are defense in depth. A malicious local program with the same user privileges can still read local files, enumerate processes, or impersonate a local client. Do not expose this server through a reverse proxy or tunnel. Browser extensions and other local applications may access information outside this tool's control.

## Sensitive local files

`data/` contains SQLite, logs, session titles/IDs, activity times, destinations, process IDs, and counts. `config.local.json` can contain private paths. CSV and real screenshots can reveal activity. Do not commit or upload them. Retention deletes expired network records and alerts but does not securely erase SQLite free pages, backups, WAL history, or cached session metadata. To remove all monitor data, stop the app and remove its dedicated data directory yourself after verifying its path.

Diagnostic JSON exports use a fresh allowlist and omit connection/session identities, secrets, paths and logs. Runtime versions and aggregate usage remain, so review before sharing. The portable package includes verified official Node binaries and Microsoft WebView2 bindings with their third-party notices. It is currently unsigned. Startup at sign-in is off by default and writes the current user's Run value only when explicitly enabled in settings or the tray. It does not modify the system proxy.

The source packager uses an explicit allowlist; `.gitignore` is not the sole data-exclusion mechanism. Release screenshots must use demo data. Before publication, review staged files and archive contents.

## Reporting

Repository: https://github.com/GloryPkqa/codex-netwatch. Use GitHub's private vulnerability reporting if the repository shows that option. Otherwise contact the maintainer through a private channel listed on their GitHub profile. Avoid posting credentials or actual traffic records in public issues.
