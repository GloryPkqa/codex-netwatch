# Calendar, comparisons and local reports

## Calendar

The monthly calendar reads the durable `daily_usage` ledger. The database's `budgetTimeZone` determines calendar dates, so a portable folder keeps the same date boundaries when moved to another system time zone. The ledger was introduced with schema 4 in 0.4.0; 0.5.0 does not change that schema.

- An observed day shows recorded Codex or all-observed-process upload-plus-download bytes. A real zero-byte sample can produce an observed zero.
- A day without observations remains unknown; it is not evidence of zero internet usage. Future dates are marked separately.
- Daily aggregates survive detailed-history pruning. Their presence does not establish that every minute of that day was observed.
- All-observed-process totals use the selected capture source's scope and can include other programs or local connections. They are not network-adapter totals or a data-plan bill.

## Comparisons

Today is compared with yesterday through the same local clock time. This week begins on Monday and is compared with last week through the corresponding weekday and local time. Actual calendar day boundaries follow the fixed time zone, including 23/25-hour daylight-saving days. Ambiguous fall-back clock cutoffs use the first occurrence; a nonexistent spring-forward cutoff advances through the gap.

A full historical day can use its retained aggregate. A partial-day cutoff requires detailed samples when the day's aggregate includes later traffic. If that prefix was pruned, the comparison returns unavailable rather than dividing the whole-day total or substituting zero. Recorded collection gaps and unobserved dates still limit what any comparison says about actual usage.

The local API is `GET /api/calendar?month=YYYY-MM&scope=codex|all`. It returns the budget time zone, `today`, generation time, daily observations and same-time comparisons. A missing comparison's `totalBytes` is `null`; callers must not coerce it to zero.

## Day and week reports

The local API is `GET /api/report?kind=day|week&date=YYYY-MM-DD&scope=codex|all`. A week is the Monday–Sunday week containing the selected date. A period that has not started is rejected. The current day or week is clipped to the generation timestamp and labelled partial.

Recorded totals come from the durable daily ledger. Process rankings, busiest recorded hours and collection-gap evidence come only from detailed history still retained for the selected period. Cleaning detailed history can therefore leave a report total available while its process/hour/gap evidence is missing. `coverage.detailAvailable`, sample counts, observation times, known gaps and explanatory notes keep those sources distinct. A fully unobserved period has unknown (`null`) totals. Reports never certify complete network coverage or reconstruct missing traffic.

Report previews can be exported as a self-contained HTML file. Open it locally and use the browser's print command to print or save a PDF. Keep process names and network-activity metadata in mind before sharing an exported report. Report creation does not send monitoring records to an external service.

## Validation scope

The calendar/report regression tests use temporary synthetic databases. They cover leap months, real zero versus unobserved dates, fixed-zone UTC/local boundaries, DST day lengths, same-local-time comparisons, pruned partial-day prefixes, current-period clipping, process/hour evidence, known open/closed gaps, invalid input and unchanged schema-4 integrity. These tests do not establish billing accuracy or continuous collection coverage.
