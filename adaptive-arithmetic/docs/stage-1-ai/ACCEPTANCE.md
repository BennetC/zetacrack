# Stage 1 — Verification and acceptance

## Optiver mode verified, 2026-11-11 (D-031)

The user requested the QuantPrep/Optiver 80-in-8 format as a distinct mode with independent analytics. [Contract](OPTIVER.md) and [implementation verification](../reviews/2026-11-11-optiver-verification.md) record actual behavior, source/fidelity limits and the complete synthetic browser→API→SQLite→results/analytics/export trace. **138 backend, 33 frontend, 56 browser groups and four packaging checks**, TypeScript and build passed. The final isolated Optiver browser suite passes after one transient setup-fetch failure. The actual [default local preview](http://127.0.0.1:4173/?view=optiver) was refreshed and read-only checked; original record digests match. This records implementer verification; new human acceptance and independent review are not implied.

## Approved eight follow-up improvements verified, 2026-11-04 (D-026)

The user said “Approve all features” after the eight-item review. All eight are implemented: recent/best score statistics and quick ranges/point inspection; accurate filtered-empty/reset behavior; compatible History filters; explicitly global and separately filtered deletion; URL context/reload/Back/Forward; Run again/R; durable retry-safe creation; compact mobile controls with visible numeric scores. [Verification report](../reviews/2026-11-04-follow-up-verification.md) documents exact behavior and evidence; [PLATFORM.md](PLATFORM.md) and [DATA_CONTRACT.md](DATA_CONTRACT.md) remain authoritative.

Actual results: **102 backend tests, 24 frontend tests, 62 browser checks, four packaging checks, typecheck and production build passed**. Browser coverage comprises 54 existing checks and eight new scenario groups, all on isolated synthetic databases/ports. Concurrent same-key creation, response loss plus retry/abandonment, filtered exact-scope deletion with arriving/hidden records, graph calculations, persistent navigation, save-gated repetition/shortcut, and mobile first-viewport numbers are covered. Final screenshots and new browser report are under `design/follow-up-2026-11-04/`; new existing-suite replays are under `docs/reviews/evidence-2026-11-04-follow-up/`. Earlier evidence was preserved.

Before the additive nullable creation-key migration, a SQLite-aware backup and raw-value digests were saved under ignored `data/`. Original sessions/observations/presets/settings match those digests. The updated preview on [4175](http://127.0.0.1:4175), API 8019, renders the new Graphs and History controls with zero page errors or API mutations in a read-only check. Older default-port services remain running; use the updated preview. This is implementer verification, not an independent review or new user acceptance. Existing measurement/browser/journal limits and the Stage 2 boundary remain.

## Requested platform improvements verified, 2026-11-03 (D-025)

The user explicitly requested implementing the agreed graph/History/reload plan. Numeric summaries come from backend `fullRunStatistics`, using eligible full runs in the selected cohort/date range; pooled answer timing and equally weighted per-run timing have distinct samples. History defaults to eligible-only with opt-in for excluded records. Practice reload creates one new identity/seed with the same content/duration, countdown disabled and remembered setup unchanged. The previous observations remain saved/recoverable. Copied markers cannot restart an owned run in another tab. [PLATFORM.md](PLATFORM.md) is authoritative.

| Check | Actual result / evidence |
| --- | --- |
| Backend | `.venv/Scripts/python.exe -m pytest -q`: **98 passed**, one existing dependency deprecation warning. Added unequal-count pooled/run timing, zero/empty/missing samples, cohort/date boundaries, and eligibility-before-pagination tests |
| Frontend | `npm test`: **22 passed**, including malformed restart-marker validation and existing arithmetic/ownership/recovery checks |
| New browser scenarios | `npm run test:improvements`: **nine scenario groups passed**, zero page errors; [report](../../design/improvements-2026-11-03/report.json) |
| Existing browser regressions | **45 checks passed**: baseline 10, recovery eight, exports six, complete platform 13, review fixes eight; [fresh evidence](../reviews/evidence-2026-11-03-improvements/). History tests explicitly opt into partial records when required |
| Build/packaging | `npm run typecheck`, `npm run build`, `npm run test:sites`: passed, **four packaging checks**; protected worker/hosting/build sources unchanged |
| Responsive UI | [Desktop graphs](../../design/improvements-2026-11-03/graphs-desktop.png), [390px graphs](../../design/improvements-2026-11-03/graphs-mobile.png), [desktop History](../../design/improvements-2026-11-03/history-desktop.png), [390px History](../../design/improvements-2026-11-03/history-mobile.png), [fresh Custom run](../../design/improvements-2026-11-03/reloaded-custom-run.png); reviewed actual renders, no page overflow |
| Normal preview | [4175](http://127.0.0.1:4175), API 8019, existing normal SQLite; [read-only browser check](../../design/improvements-2026-11-03/local-preview-check.json): graphs/history render, no API mutations/console errors, saved-session count unchanged |

The new browser suite verifies Standard/Custom timed/endless/countdown/repeated/blur-before-reload starts, fresh identities/seeds, retained input, countdown override without setup mutation, StrictMode single creation, completed/manual/focus-return cleanup, failed-start retry, slow setup and failed recovery without blocking practice, journal retry and cross-tab ownership. Existing tests run against synthetic databases/dynamic ports and new evidence locations via `scripts/prepare-improvements-replays.py`; run the five generated suites sequentially. No normal practice records or historical evidence were rewritten/deleted.

One cross-tab regression fetch failed transiently, then its complete suite passed on diagnostic rerun. A recovery-failure fixture was changed to an independent abandoned journal so successful unload persistence cannot remove the intended failure case. The final new-suite pass includes the prior-owner guard. Chrome/Windows/Web Locks remains the tested target; unknown-end timing and journal-failure limits still apply. These results do not constitute user acceptance of the new enhancements or evidence of learning benefit.

Automatic approval review blocked restarting the existing API and detached startup with “blocked by policy.” Updated services run in supervised sessions; original 4173/8017 services remain untouched and require an owner restart to serve the new response fields at that original preview.

**Human acceptance, 2026-10-23 (D-023):** The user said “stage 1 is done, let's start planning stage 2.” Stage 1 is accepted and Gates C/D are satisfied. Collaborative Stage 2 planning is open; substantive learning-system implementation remains user-owned. Earlier pending-acceptance entries below are historical checkpoints.

**Latest independent verdict, 2026-10-23:** [Patch review](../reviews/2026-10-23-fix-recheck.md) independently verifies FR-01/FR-02 and C01–C03 fixed, with no actionable remaining finding/regression confirmed in the reviewed scope. Reviewer-run checks: 95 backend, 21 frontend, 51 browser and four packaging checks, typecheck/build; additional contention, damaged-trace, shared-grammar and legacy-preservation probes passed. The technical recheck is complete. Opening Stage 2 planning did not rerun these checks.

The complete local Stage 1 platform is implemented and verified under D-017, including every F01–F27 condition in [FEATURE_GAPS.md](FEATURE_GAPS.md), and accepted under D-023. Earlier slice verification is retained below as historical evidence.

## Review repairs verified, 2026-10-15

The user-requested fixer repaired all five P2 findings from the 2026-10-14 feature/correctness reviews. [Resolution report](../reviews/2026-10-15-fix-verification.md) links exact source locations, before/after evidence and limits. Fresh checks passed: **95 backend, 21 frontend, 45 browser and 4 packaging tests**, plus typecheck/build. The original 37 browser checks retain their assertions; eight targeted checks cover delayed/retried setup edits, BOM clipboard/flush overlap and cross-tab history shrink/page boundaries. Thirty added backend cases cover atomic concurrent append/rollback, exact lexical agreement and null-filtered damaged timing intervals, including all six original examples and usable legacy records.

The repaired reproductions, rather than baseline-suite success alone, establish each finding's closure by the fixer. Original dated review reports/evidence remain intact. The fixer's read-only before/after fingerprints verified historical tables unchanged; synthetic testing used separate databases/ports. Independent patch recheck was subsequently completed above; human acceptance remains pending.

## Complete-platform verification, 2026-10-09

| Check | Actual result / evidence |
| --- | --- |
| Backend | 65 tests passed with one existing dependency deprecation warning; API/persistence, timing/export and [new Stage 1 tests](../../tests/test_stage1.py) |
| Frontend | 20 tests passed: existing 16 plus standard distributions/boundaries/seed/policy/legacy-replay checks |
| Baseline browser | 10 checks passed, zero console errors; explicit Custom entry preserves original assertions |
| Recovery/deadline browser | 8 checks passed, zero page errors; original focus, ownership, quota and conflict checks retained |
| Timing/export browser | 6 checks passed, zero page errors; saved-summary/download failure retries and background live exports retained |
| Complete-platform browser | 13 checks passed, zero page errors; [harness](../../web/tests/stage1-browser.mjs), [actual report and both session traces](../../design/stage1-complete/report.json) |
| Build/types/packaging | Typecheck and production build passed; 4 protected Sites packaging/worker tests passed |
| Visual/accessibility | Actual 1487/768/390 captures, 200% CSS scale plus 744 CSS px at 2x scale reflow, keyboard/focus/table interaction, real mobile chart scrolling and overflow assertions; [QA](../../design-qa.md) |

New backend checks cover fixed standard tuple validation, partial/unknown-end/zero-score runs, immutable mode/content/measurement migration and conservative cohorts, history paging/filter/read-only behavior, exact histogram interior boundaries and constant/zero/empty cases, breakdown/sequence/summary agreement, malformed identities/provenance/arithmetic/input with retained raw events, custom ranges/precision/shares/pair counts/subtraction rules, standard pair-count provenance for all four operations, arbitrarily large exact products, atomic closed-scope deletion including 10,001 confirmed sessions, protected open rows/settings, late arrivals, and export snapshots during concurrent deletion. Expected ongoing/unknown-end state warnings stay distinct from inconsistent traces. Existing append/export snapshot tests continue to pass.

The complete browser trace runs the actual standard generator through presentation/acceptance, fixed timeout, saved results, detail/graphs and both downloaded formats. A synthetic monotonic-clock offset avoids waiting two minutes while checking exclusive standard execution; real-clock deadline/countdown cases are covered by the original suites. An actual fixed signed-decimal Custom run likewise reaches derived saved results/inspection/graphs/JSON/CSV. Other checks cover independently remembered Custom settings, valid edits followed immediately by navigation before debounce, empty/many/paged/filtered history, actual multi-session and single/constant graphs, optional partial observations without score pooling, UTC-date/cohort selection, native deletion cancellation, held-lock/pending-journal protection, read/delete/graph failures and retry, exact confirmed bulk scope with an arriving closed record, and a genuine background history/graphs tab that leaves live owner events and setup unchanged.

Fixtures use separate SQLite files, dynamic ports (except preserved baseline 8018/4174), isolated Chrome and own-process cleanup. Normal practice data is never injected or deleted. Standard content verification uses the original primary sources recorded in the screening matrix; runtime differences are disclosed, not claimed equivalent.

## Independent complete-platform recheck, 2026-10-09

The feature screener closed every F01–F27 condition after inspecting finished source/schema/contracts, final actual chart screens and raw-event→question→summary/chart agreement. Reopened arithmetic, provenance, histogram, navigation-save, deletion-scope and chart presentation defects were fixed and reverified before closure. Read-only normal-preview checks pass; normal practice records were preserved. The [coordinator record](FEATURE_GAPS.md) distinguishes the implementer's complete reruns from independent focused probes and screenshot/data inspection. No required local feature or actionable P0/P1/P2 finding remains open. Human acceptance remains pending; Stage 2 has not started.

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

## Limits and acceptance

All required local Stage 1 capabilities have implementation and verification evidence. FEATURE_GAPS records completion per requirement and the coordinator's independent recheck separately. Human acceptance was separately received on 2026-10-23 under D-023; Stage 2 planning is open. Acceptance does not remove the limits below or establish learning benefit.

Chrome on Windows/loopback with Web Locks is the verified browser target; full cross-browser and assistive-technology certification is not claimed. The 200% checks include CSS scale and equivalent reflow, not a universal browser-zoom audit. Renderer commits do not measure physical display time or pure cognitive latency. Descriptive timing/score graphs do not demonstrate causal effects or learning benefit. Original question rules are implemented, but our clock/input/deadline/focus behavior limits external score interchangeability.

Browser journals/locks are origin-scoped. The existing limitation when journaling fails and a page exits before database acknowledgement, including late unload writes, remains documented. Invalid/unknown data is retained with warnings and null timings rather than rewritten. No accounts, cloud synchronization, public deployment or substantive learning engine is included.
