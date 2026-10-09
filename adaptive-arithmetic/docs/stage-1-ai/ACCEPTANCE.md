# Stage 1 — Verification and acceptance

The approved custom-practice and response-timing/export slices are implemented and verified. The earlier independent review reproduced four runtime/recovery defects; the requested worker fixed them and the independent recheck found no actionable remaining findings. The timing/export slice has the additional evidence below. Broader Stage 1 criteria remain draft; full Stage 1 acceptance has not been requested or received.

## Timing/export verification, 2026-10-09

| Check | Command / procedure | Actual result |
| --- | --- | --- |
| Backend persistence/timing/export | `.venv/Scripts/python.exe -m pytest -q` | 34 passed: 13 existing API checks and 21 timing/export cases; one existing Starlette/AnyIO warning |
| Arithmetic/recovery rules | `cd web; npm test` | 16 passed |
| Existing browser flows | `npm run test:browser`; `npm run test:regressions` | 10 baseline and 8 recovery/deadline checks passed; zero console/page errors |
| Timing/download/failure flows | `npm run test:exports` — [harness](../../web/tests/exports-browser.mjs) | 6 browser checks passed; zero page errors; [report](../../design/timing-exports/report.json) |
| Typecheck/build | `npm run typecheck`; `npm run build` | Passed |
| Actual visual inspection | Setup/results at 1487, 768, 390 CSS pixels, density 1 | Desktop and mobile captures inspected; automated overflow checks passed; [QA](../../design-qa.md) |

[Backend tests](../../tests/test_measurements.py) cover timing differences, zero/raw precision, odd/even/empty summaries, unfinished values and unknown-end lower bounds, invalid ordering/deadline/payload handling, usable legacy records, additive migration without byte changes to configuration, no-question/empty exports, exact signed decimal and Unicode/quotes/newline/raw-input CSV round trips, immutable configurations after preset edits/deletion, and read/results/export agreement. A concurrent writer appends and terminates two sessions while an export is reading; its first snapshot includes neither append, and the next includes both.

The browser harness tests actual typing, deletion, clipboard paste, exact advancement, unfinished input, two-decimal UI/backend agreement, disabled exports before successful save, retained journal and save retry, failed summary load/retry, failed export/retry, downloaded JSON/CSV contents, countdown exclusion, and a background setup tab downloading both formats while the active owner stays focused, locked, and able to solve the next answer.

[Synthetic session trace](../../design/timing-exports/session-trace.json) links exact generation, original configuration/seed/versions, ordered raw events, derived question timings, saved summary, and downloaded sessions. [Desktop results](../../design/timing-exports/results-desktop.png) and [mobile results](../../design/timing-exports/results-390.png) show the approved additions. Fixtures use isolated SQLite files, dynamic ports, and an isolated Chrome profile; they never inject observations into the normal practice database. Test process trees are stopped in `finally`.

## Review-fix verification, 2026-10-09

| Check | Command / procedure | Actual result |
| --- | --- | --- |
| Arithmetic and recovery/deadline rules | `cd web; npm test` | 16 passed: original 11 arithmetic tests plus 5 immutable-prefix/recovery/deadline regressions |
| Persistence/snapshots | `.venv/Scripts/python.exe -m pytest tests/test_api.py -q` | 13 passed; one existing Starlette/AnyIO deprecation warning |
| Baseline browser workflow | `cd web; npm run test:browser` | Original 10 checks passed again; zero console errors |
| Review regression browser workflow | `cd web; npm run test:regressions` — [harness](../../web/tests/review-regressions.mjs) | 8 checks passed; zero page errors; [report](../../design/review-fixes-report.json) |
| Types and bundle | `npm run typecheck`; `npm run build` | Both passed |
| Independent patch recheck | Original reviewer inspected finished core fixes and regression evidence | No actionable remaining findings |
| Isolation/cleanup | Separate synthetic database, dynamic ports, isolated Chrome; own process trees stopped in `finally` | Regression ports 57409/57410 and baseline ports 8018/4174 released; normal records/services untouched |

Regression checks cover a real background app observing a live run, ownership under StrictMode, exact answer persistence, an injected quota failure followed by a successful database flush and abandoned-page recovery, malformed/conflicting journal isolation, warning persistence after setup save, bounded retry after a late append conflict, delayed Start while hidden or after returning to focus, failed-start listener cleanup, pending-save ownership through actual unmount, and delayed focus/manual/page-exit callbacks across a timed deadline. Earlier focus loss and ending during countdown retain their meaning. All data is synthetic software verification.

## Actual checks, 2026-10-08

| Check | Command / procedure | Actual result |
| --- | --- | --- |
| Exact arithmetic/generation | `cd web; npm test` — [tests](../../web/tests/domain.test.ts) | 11 passed: fixed operands, inclusive pair enumeration, signs/order, independent precision, products/division, zero exclusion, subtraction, invalid setups, shares, replay, input, durations |
| Sparse combinations | Direct rank sampling over a huge grid with one valid subtraction pair | Passed without rejection/hanging |
| Persistence/snapshots | `.venv/Scripts/python.exe -m pytest tests/test_api.py -q` — [tests](../../tests/test_api.py) | 13 passed: presets, remembered setup, invalid configurations, restart durability, idempotence/conflicts, immutable sessions, local origin |
| Complete browser workflow | `cd web; npm run test:browser` — [harness](../../web/tests/browser.mjs) | 10 checks passed; zero console errors |
| Types and bundle | `npm run typecheck`; `npm run build` | Both passed |
| Visual/responsive QA | Matched source/state at 1487×1058, density 1; widths 1100, 768, 390 | Passed after repairs; [design QA](../../design-qa.md) |
| Preview startup | `scripts/start.ps1`, direct/proxied API readiness | Passed on Windows, normal database separate from synthetic fixtures |

Browser checks cover effective shares, adjacent errors/disabled Start, add/duplicate/remove without hidden reweighting, overflow, preset CRUD, exact decimal auto-advancement, actual focus loss, input corrections and unfinished work, immutable historical configuration, countdown exclusion/timeout, endless ending, and restored setup.

[Report](../../design/verification-report.json) records all 10 checks. [Session trace](../../design/session-trace.json) links original configuration/versions/seed, exact questions, raw edits, accepted answer, and unfinished question to the displayed [results](../../design/implementation-results.png). These are synthetic software checks, not user performance evidence.

## Remaining criteria and limits

- Standard Zetamac generation/timing/scoring and comparability are not implemented or verified.
- The approved custom timing/export contract is delivered. History browsing/further analytics, benchmark comparison, retention/deletion controls, and additional research eligibility remain separate. Raw edits are not incorrect attempts; no accuracy metric is inferred.
- Browser elapsed intervals start at React layout commits; physical presentation and pure cognitive latency are not measured.
- Recovery now has focused quota, offline save, multiple-tab, page-exit/unmount, and append-conflict checks; every combined failure is not exhaustively tested. Browser Web Locks are required. Journal failure followed by exiting before database acknowledgement, particularly with a late unrecorded unload write, can still leave incomplete data or an immutable conflict. The current warning asks the user to keep the page open until persistence succeeds.
- Checks used Chrome on Windows, not a complete device/browser/assistive-technology audit.
- API tests emit one Starlette/AnyIO deprecation warning; all assertions pass.
- No deployment, accounts, substantive adaptation, or learning-benefit evaluation is included.

Passing scoped checks does not establish full Stage 1 completion or user acceptance. See [handoff](HANDOFF.md).
