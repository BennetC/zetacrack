# Independent repair review — 23 October 2026

**No actionable remaining finding or regression was confirmed in the five repaired cases. FR-01, FR-02 and C01–C03 are independently verified fixed within the scope below.** This closes the pending patch review, not human Stage 1 acceptance or Stage 2 authorization.

This reviewer did not implement the repairs. The assessment uses the complete current working tree, including the uncommitted/untracked Standard, history, analytics and graph modules; HEAD `a34d4a5c98f78e7b8d0297b0b6cb15a97d54870a` is an older baseline. The original [feature review](2026-10-14-feature-review.md), [correctness review](2026-10-14-correctness-review.md) and [fixer's report](2026-10-15-fix-verification.md) were inputs, not proof. All checks below ran freshly. [Source fingerprints](evidence-2026-10-23-fix-recheck/source-fingerprints.json) identify the reviewed code and historical reports.

## Per-finding verdict

| Finding | Independent verdict | Source and fresh evidence |
| --- | --- | --- |
| **FR-01 — stale History pagination** | **Verified fixed** | [SavedViews.tsx:133](../../web/src/SavedViews.tsx:133) computes the last existing offset, triggers a corrective fetch, and gates the out-of-range display at [line 243](../../web/src/SavedViews.tsx:243). A genuine second tab deletes 24 of 25 records at offset 20: Refresh reveals the survivor, `1–1 of 1`. Boundary 21→20 and zero totals also pass. A separate 25→5 test preserves both mode and configuration-text filters while deliberately holding the corrective request; the visible state is loading, then five rows and `1–5 of 5`. A still-later response for an obsolete filter is ignored. [Retained repair replay](evidence-2026-10-23-fix-recheck/targeted/report.json), [independent UI trace](evidence-2026-10-23-fix-recheck/independent-ui/report.json). |
| **FR-02 — setup reads discard edits** | **Verified fixed** | [PracticeEditor.tsx:230](../../web/src/PracticeEditor.tsx:230) records deliberate Custom changes, [line 288](../../web/src/PracticeEditor.tsx:288) protects them during initialization, and [line 309](../../web/src/PracticeEditor.tsx:309) saves valid edited setups without autosaving a read. Reversed held StrictMode reads preserve fresh name/range/duration/countdown edits. Independent tests also cover two different response bodies, navigation while loading, untouched restoration without a PUT, an invalid deliberate range edit that stays visible without overwriting stored memory, repair and persistence while History is open, and untouched in-place retry after failure. [UI report](evidence-2026-10-23-fix-recheck/independent-ui/report.json), [repair replay](evidence-2026-10-23-fix-recheck/targeted/report.json). |
| **C01 — overlapping observation writes** | **Verified fixed** | [app.py:299](../../server/app.py:299) executes `BEGIN IMMEDIATE` before both session existence and immutable-sequence checks. The checks, inserts and terminal status update share the rollback boundary. A new unmodified-contention probe sent **384 compatible short/long-prefix requests with 32 synchronized callers**: all 200. Eight 16-writer conflict trials produced exactly eight successful immutable winners and 120 HTTP 409s, zero 500s, with the winner's exact contents retained. Eight terminal-tail-before-conflict batches fully rolled back. Controlled permanent tests additionally establish that the second transaction waits, and the actual browser pagehide beacon/queued-flush overlap returned only 200s. [Independent contention evidence](evidence-2026-10-23-fix-recheck/independent-probes.json), [browser overlap trace](evidence-2026-10-23-fix-recheck/targeted/report.json), [permanent controlled tests](../../tests/test_review_fixes.py). |
| **C02 — inconsistent whitespace grammar** | **Verified fixed** | [domain.ts:73](../../web/src/domain.ts:73) and [decimal_input.py:15](../../server/decimal_input.py:15) implement the same explicit boundary set and ASCII decimal grammar. Configuration ticks, exact provenance, timing derivation and comparison eligibility use it. Independent client-generated/API-consumed fixtures accept all **25** permitted boundary code points and reject **11** controls/separators/non-ASCII alternatives. Each accepted fixture remains exact and raw-preserving through configuration, observations, eligibility, timing, JSON, CSV and graphs. A 300-digit operand's signed decimal product (308 output characters) survives exactly. A separate actual **U+FEFF clipboard paste** advances live and remains one valid response, full score 1, and one graph sample in all four visible graph surfaces. [Client/API fixtures](evidence-2026-10-23-fix-recheck/grammar-api.json), [actual clipboard/result/graph trace](evidence-2026-10-23-fix-recheck/bom-graphs/report.json). |
| **C03 — wrong timing validity transitions** | **Verified fixed** | [measurements.py:65](../../server/measurements.py:65) separates interval invalidation from [timeline taint](../../server/measurements.py:69); [unsupported identities](../../server/measurements.py:145) and [malformed input values](../../server/measurements.py:160) invalidate their interval. [Missing/stale/unknown references](../../server/measurements.py:154) taint the unfinished current and later intervals, and [acceptance clears `active`](../../server/measurements.py:171), preserving independently completed earlier intervals after a later gap. All six original cases meet repaired expectations. **39 independent traces** also cover malformed strings/booleans/numbers/lists/objects/nulls, invalid indices, non-string/unknown/stale references, damage between questions, repeated acceptance/start, duplicate presentation identity and gaps at four interval boundaries. The exact question membership agrees across reads, JSON, CSV, per-session summaries, histogram and partial breakdown; raw events/configuration remain intact. [Executable independent probes](evidence-2026-10-23-fix-recheck/independent-probes.py), [complete results](evidence-2026-10-23-fix-recheck/independent-probes.json). |

The original six C03 expected valid-correct counts are now **1, 0, 0, 0, 1, 1** for healthy control, unknown reference, malformed field value, unsupported index, stale reference after completed q0, and gap after completed q0 respectively. Null invalid timings never become zero samples. True zero-duration timing remains valid in the retained summary and grammar-path tests.

## Fresh verification

| Check run in this review | Actual result / captured evidence |
| --- | --- |
| Full backend suite, isolated `ARITHMETIC_DB` before import | **95 passed**, one existing Starlette/AnyIO deprecation warning; [output](evidence-2026-10-23-fix-recheck/backend-tests.txt) |
| Full frontend suite | **21 passed**; [output](evidence-2026-10-23-fix-recheck/frontend-tests.txt) |
| TypeScript | Passed; [output](evidence-2026-10-23-fix-recheck/typecheck.txt) |
| Production build | Passed; [output](evidence-2026-10-23-fix-recheck/build.txt) |
| Protected packaging/worker suite | **4 passed**; [output](evidence-2026-10-23-fix-recheck/packaging.txt) |
| Original Custom browser replay | **10 passed**, zero console errors; [report](evidence-2026-10-23-fix-recheck/baseline/verification-report.json) |
| Ownership/recovery/deadline browser replay | **8 passed**, zero page errors; [report](evidence-2026-10-23-fix-recheck/recovery-report.json) |
| Timing/export browser replay | **6 passed**, zero page errors; [report](evidence-2026-10-23-fix-recheck/exports/report.json) |
| Complete-platform browser replay | **13 passed**, zero page errors; [report](evidence-2026-10-23-fix-recheck/platform/report.json) |
| Repair browser replay | **8 passed**, zero page errors; [report](evidence-2026-10-23-fix-recheck/targeted/report.json) |
| New independent initialization/pagination browser cases | **5 passed**, zero page errors; [report](evidence-2026-10-23-fix-recheck/independent-ui/report.json) |
| New actual BOM paste → results/exports/four graphs journey | **1 passed**, zero page errors; [report and complete trace](evidence-2026-10-23-fix-recheck/bom-graphs/report.json) |
| New unmodified concurrency / transition probes | **512 competing append requests**, eight additional rollback checks, **39 trace variants** passed; [results](evidence-2026-10-23-fix-recheck/independent-probes.json) |
| New shared grammar / huge exact-product probes | **26 client/API fixtures** and **11 rejected configurations** passed; [client output](evidence-2026-10-23-fix-recheck/grammar-probe.txt), [API results](evidence-2026-10-23-fix-recheck/grammar-api.json) |
| New old-schema/raw-preservation probe | **3 legacy cases** passed; original persisted-text fingerprint unchanged through migration, reads, graphs and exports; [results](evidence-2026-10-23-fix-recheck/legacy-probe.json) |

Fresh browser total: **51 checks** (45 retained plus six additional independent checks). These are software checks with synthetic records, not observations of user arithmetic ability. The fixer's earlier counts are historical; this table records the fresh recheck.

The full suites also re-exercise arithmetic/ranges/precision, seed replay, independent Custom memory, exclusive deadlines, countdown/pending-Start exclusion, focus loss, unknown-end lower bounds, immutable preset snapshots, failed saves/summary/download retries, cross-tab ownership/recovery, consistent read snapshots, history/graphs, and protected single/bulk deletion. This does not reclassify every older independent stress/property probe as freshly rerun.

## UI and data evidence

Actual screenshots were opened and visually inspected: [invalid edits retained](evidence-2026-10-23-fix-recheck/independent-ui/02-invalid-edits-retained.png), [History loading during correction](evidence-2026-10-23-fix-recheck/independent-ui/04-history-corrective-loading.png), [filtered survivors](evidence-2026-10-23-fix-recheck/independent-ui/05-history-filtered-survivors.png), and [BOM results](evidence-2026-10-23-fix-recheck/targeted/04-bom-clipboard-results.png). The BOM graph captures show the actual [full-run chronology](evidence-2026-10-23-fix-recheck/bom-graphs/03-section-0.png), [histogram](evidence-2026-10-23-fix-recheck/bom-graphs/03-section-1.png), [operation/group bars](evidence-2026-10-23-fix-recheck/bom-graphs/03-section-2.png), and [question sequence with separate unfinished scale](evidence-2026-10-23-fix-recheck/bom-graphs/03-section-3.png). Displayed counts/timings agree with the saved response and exports.

History instrumentation saw one intermediate DOM commit containing the empty message before the read hook cleared old data. It did **not** occur in any of 29 sampled animation frames; the held-request screenshot shows loading, and final rows/range are correct. This is recorded as an implementation observation, not a confirmed visible/accessibility defect. This review does not claim that no intermediate DOM tree can ever contain stale data on every browser/schedule.

Malformed historical records are re-derived more conservatively, as intended; observations/configurations are not rewritten. The independent legacy probe starts from the old schema with formatted JSON, Unicode, quotes/newlines, missing accepted-input text, BOM input and a malformed field. Added metadata stays null. Valid legacy intervals remain usable but uncertified/ineligible for full comparisons; the malformed interval is null. The SHA-256 over original table columns, including exact stored JSON text, is identical before migration and after all reads/exports.

## Reproduction and isolation

From `C:\Users\benne\Projects\zetacrack\adaptive-arithmetic`:

```powershell
$env:ARITHMETIC_DB = Join-Path $PWD ('data/recheck-import-' + [guid]::NewGuid() + '.sqlite3')
.venv/Scripts/python.exe -m pytest -q
.venv/Scripts/python.exe docs/reviews/evidence-2026-10-23-fix-recheck/independent-probes.py
web/node_modules/.bin/tsx.cmd docs/reviews/evidence-2026-10-23-fix-recheck/grammar-probe.ts
.venv/Scripts/python.exe docs/reviews/evidence-2026-10-23-fix-recheck/grammar-api.py
.venv/Scripts/python.exe docs/reviews/evidence-2026-10-23-fix-recheck/legacy-probe.py
.venv/Scripts/python.exe docs/reviews/evidence-2026-10-23-fix-recheck/prepare-replays.py
node data/recheck-2026-10-23/browser.mjs
node data/recheck-2026-10-23/review-regressions.mjs
node data/recheck-2026-10-23/exports-browser.mjs
node data/recheck-2026-10-23/stage1-browser.mjs
node data/recheck-2026-10-23/review-fixes-browser.mjs
node docs/reviews/evidence-2026-10-23-fix-recheck/independent-browser.mjs
node docs/reviews/evidence-2026-10-23-fix-recheck/bom-browser.mjs
Set-Location web
npm test
npm run typecheck
npm run build
npm run test:sites
```

Browsers ran sequentially on distinct dynamic ports, unique synthetic databases and their own Chrome profiles. The copied retained harnesses preserve assertions and change only import resolution, ports, evidence destinations and awaited cleanup. They never overwrite earlier design/review evidence. Every server import used synthetic `ARITHMETIC_DB` beforehand. Only each harness's known own process tree was stopped. Normal `4173`/`8017` services and `data/arithmetic.sqlite3` were neither used nor inspected; no private practice data was played, recovered, exported, deleted or dumped. Application source/tests/contracts and unrelated working-tree changes were preserved. Only this dated report/evidence and ignored build/synthetic artifacts were written.

## Bounds and conclusion

The scoped verification supports closure of all five original findings. No P0–P3 actionable defect was established in these repairs or their exercised adjacent paths. Normal preview startup/restart and normal user-data inspection were deliberately excluded. Original Zetamac's external source was not re-fetched for this patch review; no new claim of external runtime/score equivalence is made.

Windows Chrome/loopback is the exercised browser target; other engines/devices, screen readers, physical-display timing, unbounded load, exhaustive arbitrary database corruption and a formal security audit remain unverified. The full Standard-end checks use an explicit synthetic monotonic offset, with the original real-clock countdown/deadline regressions also passing. Origin-scoped Web Locks/journals and the acknowledged combined journal-failure/unacknowledged-exit limitation remain unchanged. Graphs remain descriptive and do not establish learning benefit.

The pending independent patch review is complete. Human Stage 1 review/acceptance remains pending; Stage 2 has not started.
