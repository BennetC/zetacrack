# Reload, saved-page performance and pace verification

User authorization: the 2026-11-08 request for smoother in-run reload, faster History/Graphs, and working Pace & ghost comparison (D-029). Implemented and verified locally; user acceptance is separate.

The verified flow is browser reload/navigation → FastAPI session/analytics/explorer reads → snapshot-consistent SQLite observations → focused fresh run or rendered graphs. All browser fixtures use isolated databases and dynamic ports. Normal-data checks perform reads only.

## Repairs

- Reload reads its tab-local intent before the first React render without consuming it in the StrictMode initializer. The real effect consumes it once and preserves the existing ownership check. A run-shaped loading view replaces the setup flash while durable creation completes; actual questions and timing begin under the existing presentation contract. Failure/retry, ordinary fresh seeds, challenge seeds/exclusion, no countdown, Custom memory and independent old-run recovery remain intact.
- History, aggregate graphs and deletion previews skip per-session replay/single-run chart construction. A per-app, locked LRU caches derived sessions using metadata, observation count/last sequence and annotation values from the same SQLite read snapshot. It retains at most 2048 sessions and 250,000 observations; writes from another API worker invalidate the affected signature. Deletes remove local cache entries. Detailed reads and exports build the full original response, preserving raw observations and precision.
- Explorer comparisons send exact accepted timestamps rather than every peer's full replay. Pace draws actual steps, including simultaneous and end-boundary completions; median trajectory is exact at the union of peer timestamps. Partial-run scale uses comparison completions within the observed range. Previous ordering includes the ID tie-breaker. Loading, error/retry, unknown-duration and absent-peer states are explicit, and the data table no longer reports a zero-valued nonexistent previous ghost.
- The previously running default API omitted `runAnalytics`; opening detail produced `Cannot read properties of undefined (reading 'questions')`. The verified local API process was refreshed with current source. A regression now also checks that an older detail response retains the remaining saved-session UI and offers retry instead of crashing.

## Actual verification

| Check | Result |
| --- | --- |
| `.venv/Scripts/python.exe -m pytest -q` | 114 passed; one existing Starlette/AnyIO deprecation warning |
| `cd web; npm run typecheck; npm test` | TypeScript passed; 28 frontend tests passed |
| `npm run test:explorer` with a fresh evidence directory | 10 scenario groups, no page errors; actual finite blue/ghost SVG steps, target/typical choices, missing peers, failed comparison retry, older API response, held reload creation, no setup flash and answer focus |
| Isolated recovery replay | Eight checks passed |
| Isolated reload/statistics/History replay | Nine checks passed |
| Isolated complete-platform replay | 13 checks passed, including filters, pagination, graphs, deletion, responsive layouts and cross-tab reads |
| Isolated timing/export replay | Six checks passed; saved reads and downloaded JSON/CSV agree |
| `npm run build; npm run test:sites` | Build and four packaging/worker checks passed |
| Main preview read-only Chrome journey | History, Graphs and actual two-curve pace comparison rendered; zero page errors and zero API mutations |
| Normal SQLite fingerprint | Sessions, observations, presets, settings and annotations unchanged |

Total browser coverage in this pass: 46 scenario groups. The concurrent-deletion export test was adapted to pause detailed response construction instead of assuming an already cached session must be re-derived. It still verifies that deleting a session during a read does not fracture that snapshot.

Evidence: [explorer report](../../design/performance-2026-11-08/explorer/report.json), [pace capture](../../design/performance-2026-11-08/explorer/pace-comparison.png), [reload capture](../../design/performance-2026-11-08/explorer/reload-transition.png), [normal preview](../../design/performance-2026-11-08/normal-preview.json), [data preservation](../../design/performance-2026-11-08/normal-preservation.json). Existing-suite evidence is under `docs/reviews/evidence-2026-11-08-performance/`; historical captures were preserved. Synthetic desktop/mobile captures were visually inspected.

## Observed performance and limits

Read-only requests against the same normal SQLite data measured:

| Request | Previous default preview | Updated preview |
| --- | ---: | ---: |
| History, eligible only, one row | 4570 ms | 2814 ms first read after API restart; 44 ms repeated |
| Aggregate graphs | 3857 ms | 131–136 ms with derivations already cached |

[Raw timing metadata](../../design/performance-2026-11-08/normal-timings.json) includes response status and size only. These sequential local observations compare the prior default runtime with the updated runtime; they are not controlled load-test guarantees. Full browser navigation also includes Vite/module/font/rendering time (observed ~1.4–1.6 s for cold document navigation). The normal pace detail plus comparison journey took ~4.3 s. The cache is process-local: restarting the API or exceeding its bounds can require full derivation again; collection scans and aggregate calculations still scale with history size.

The primary preview is `http://127.0.0.1:4173`, API8017, current source. Its supervised API session90391 / process5488 remains running; the default Vite server remains running. Older 4175/4176 preview APIs were left intact; the temporary 4177/8021 pair was stopped. No normal-data rewrites, measurement-version changes, learning policy, Orbit reporting or application deployment were part of this request. Independent review and human acceptance were not performed for this pass.

Subsequent user authorization (D-030) requested Orbit logging and GitHub push, explicitly withdrawing production deployment. [Fresh independent review](2026-11-08-performance-independent-review.md) passed; Orbit readback confirms task647 and review648 completed, verification104 passed. Observed closed implementation/reviewer activity and typed usage have been saved; token coverage remains partial and the open parent reporting/push turn remains provisional until closure. This supersedes the original checkpoint's pending-independent-review status without changing its test evidence or claiming human acceptance.
