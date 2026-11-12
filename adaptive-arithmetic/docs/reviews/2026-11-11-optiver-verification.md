# Optiver 80 in 8 — implementation verification

11 November 2026. User-authorized distinct play mode and analytics, D-031. [Behavior/measurement contract](../stage-1-ai/OPTIVER.md).

## Result

Implemented and verified locally. The complete story is Optiver setup → durable session creation → exact four-choice arithmetic → immutable choice events in SQLite → derived net score/results → separate analytics → saved answer review/JSON/CSV. Existing Standard/Custom content, focus rules, remembered setup and comparison cohorts remain independent. This report is implementer verification, not independent review or human acceptance.

| Boundary | Evidence |
| --- | --- |
| Reference | QuantPrep introduction, public 80-question trial/configuration, live desktop capture and interaction script inspected on 11 November. Profile: 29 integer/27 decimal/24 fraction; missing operands included. Fresh numeric content is locally generated; official/unseen-bank equivalence is unverified. |
| Browser → API | Real mouse/number-key submissions, exclusive deadline, duplicate-click guard, tab switching and reload exercised in Chrome. Fixed Optiver mode/config/version accepted; incompatible provenance/config rejected. |
| API → SQLite | Durable creation-key retries, append-only observations, exact choice index/value, wrong submissions, unfinished presentations, partial recovery and closed-session deletion verified against synthetic databases. |
| Saved records → results | Complete 80-choice run: 68 correct, 12 incorrect, score 56, target reached. Every choice has a valid response interval; typed-input events/first-input timings are absent. Last submitted question is not recorded as unfinished. |
| Results → analytics | Separate Optiver endpoint/cohorts; best/mean net scores, accuracy, practice pass rate, all-choice timing, family/operation/missing-position breakdowns, elapsed-minute pace and chronological scores. Negative −80 scores remain inside both chart scales. Partial/challenge/invalid runs are excluded from benchmark metrics. |
| Review/export | Incorrect-answer review returns 12 rows. Exact fractions/mixed numbers, four original choices, selected index/value, timing and immutable events survive JSON/CSV. Choice and typed timing definitions are explicitly versioned. |
| Actual local preview | [Optiver setup](http://127.0.0.1:4173/?view=optiver), API8017. Headless Chrome loaded setup and dedicated empty analytics with zero page errors and zero API writes. Normal-record fingerprints match before/after. |

## Actual checks

| Check | Result |
| --- | --- |
| Backend | **138 passed**: existing 114 plus 24 Optiver cases (including parametrized cases). One existing Starlette/AnyIO deprecation warning. |
| Frontend | **33 passed**: existing 28 plus five Optiver cases. Property checks generate 300 complete papers / 24,000 questions, verifying exact arithmetic, one correct option, rationally unique choices, complete profile, reproducible fixtures and finite 80-question bounds. |
| New Optiver Chrome suite | **10 scenario groups passed**, zero page errors. [Report](../../design/optiver-2026-11-11/report.json), [harness](../../web/tests/optiver-browser.mjs). Covers full 80-choice run, desktop/mobile review/analytics, keyboard use, exports, tab switching, duplicate clicks, timeout, reload with a prior choice, dates/History, negative charts, save failure/retry and analytics failure/retry. |
| Existing Chrome regression replays | **46 groups passed**: baseline10, ownership/recovery/deadline8, full platform13, timing/export6, History/graphs/reload improvements9. Fresh evidence under [evidence-2026-11-11-optiver](evidence-2026-11-11-optiver/); historical artifacts were not overwritten. |
| TypeScript | `npm run typecheck` passed after final source changes. |
| Production build | `npm run build` passed after final source changes; required `dist/client/index.html`, `dist/server/index.js` and `dist/.openai/hosting.json` produced. |
| Protected packaging | **4 passed** with `npm run test:sites`. Protected hosting/worker/preparation/test source files remain unchanged. |
| Patch whitespace | `git diff --check` passed. |

One late Chrome rerun hit a connection/initial-setup fetch failure before starting its test while other local preparation was in progress. The final isolated rerun passed all ten groups, including the added terminal unfinished-ID assertion. This is recorded as an observed transient; no cause was established. The harness now captures both server output streams and closes its Windows process trees.

Initial screenshots exposed inherited run-center sizing that compressed the panel/choice row; scoped Optiver rules now stretch the card/progress/four-choice row and retain a two-column 390px layout. Choice journals/recovery were also updated to accept submitted outcomes, and CSV now handles absent typed replay data. Permanent checks cover these boundaries.

## Preview and data preservation

The existing default API was an older process without `/api/optiver/analytics`. After verifying its command/process identity, it was refreshed on port8017. Current API process50172 is supervised by execution session59967; the existing frontend on4173 serves updated source. Other older previews were left in place. A normal-browser read-only verification recorded no API mutations or JavaScript errors. Ignored before/after digests match for sessions, observations, presets, settings and question annotations. No schema migration or historical observation rewrite was needed.

Browser suites use fresh isolated databases/origins; synthetic scores/screenshots are software evidence, not user-performance or learning evidence. No Stage 2 engine, Orbit record change, GitHub push or production deployment was performed.

## Limits

The visible format and question families follow QuantPrep; fresh operands/options use this app’s deterministic generator. The official Optiver bank, current recruitment format and actual hiring cutoff were not independently verified. The disclosed 56-point target is a reference-site practice target. Browser layout commits and choice latencies do not isolate mental calculation time or establish learning benefit. Existing Web Locks, browser journaling, timer throttling and unacknowledged-exit limitations still apply. A throttled background timer catches up from the monotonic elapsed clock; it does not pause the test.
