# Review repairs and verification — 15 October 2026

The explicitly requested fixer repaired **all five reported P2 findings** and converted their reproductions into passing permanent regressions. This is implementation/verification evidence; independent patch review and human Stage 1 acceptance remain separate. No new Stage 1 feature, Stage 2 learning engine, cloud service or deployment was added.

The original [feature review](2026-10-14-feature-review.md), [correctness review](2026-10-14-correctness-review.md) and both dated evidence directories remain intact as the before-state snapshots. The complete current working tree was preserved, including the previously uncommitted/untracked Standard, analytics, history and graph modules.

## Per-finding resolution

| Finding | Repair / precise source | Repaired reproduction and verification |
| --- | --- | --- |
| **FR-01 — repaired, verified** | [SavedViews.tsx:133](../../web/src/SavedViews.tsx:133) calculates the last existing page from the refreshed total, refetches when the offset exceeds it, and suppresses the false empty/range state while correcting the page. | A genuine other browser tab deletes 24 of 25 synthetic Custom sessions while History is at offset 20. Refresh now reveals the survivor with `1–1 of 1`. Additional checks cover 21→20, total zero and mode/text-filter changes, without losing active filters. [Browser report](evidence-2026-10-15-fixes/targeted/report.json), [survivor screenshot](evidence-2026-10-15-fixes/targeted/05-history-survivor-after-cross-tab-delete.png). |
| **FR-02 — repaired, verified** | [PracticeEditor.tsx:288](../../web/src/PracticeEditor.tsx:288) loads remembered settings only before a deliberate Custom edit. The setup-attempt state and connection buttons retry in place; stale/unmounted callbacks remain cancelled. | Hold both initial StrictMode requests, edit group/ranges/duration/countdown, then finish the responses in reverse order: all fresh values survive and persist. Navigation/reload preserve independent Custom memory. A failed initial load followed by edits and Retry also preserves the newer values. [Pending](evidence-2026-10-15-fixes/targeted/01-custom-edit-pending.png), [loaded](evidence-2026-10-15-fixes/targeted/02-custom-edit-after-load.png), [retry](evidence-2026-10-15-fixes/targeted/03-custom-edit-after-retry.png). |
| **C01 — repaired, verified** | [app.py:299](../../server/app.py:299) acquires `BEGIN IMMEDIATE` before session/sequence existence checks. All checks/inserts/status updates share one transaction. | The unmodified path receives 200 identical concurrent requests (25 sessions × eight threads): **200 successes, zero 500s**, one immutable batch per session. Controlled competing transactions cover identical requests, conflicts returning 409, longer tails and shorter retries after longer tails. A conflicting batch rolls back previously inserted tail/status changes. Real pagehide-beacon/queued-flush overlap succeeds. [Permanent tests](../../tests/test_review_fixes.py), [browser trace/statuses](evidence-2026-10-15-fixes/targeted/report.json). |
| **C02 — repaired, verified** | [decimal_input.py:15](../../server/decimal_input.py:15) centralizes the backend ASCII-decimal/explicit-whitespace parser; [domain.ts:73](../../web/src/domain.ts:73) uses the same exact code-point set. Configuration ticks, provenance, saved metrics and comparison eligibility share it. | Every ECMAScript WhiteSpace/LineTerminator boundary character, including BOM, is accepted consistently; Python-only separators/NEL, zero-width characters and non-ASCII digits stay invalid. A real BOM clipboard paste advances, retains the exact raw input, supplies one valid timing, and remains eligible in full Standard results/JSON/CSV/graphs. [Actual results](evidence-2026-10-15-fixes/targeted/04-bom-clipboard-results.png), [raw trace](evidence-2026-10-15-fixes/targeted/report.json). |
| **C03 — repaired, verified** | [measurements.py:65](../../server/measurements.py:65) centralizes question invalidation and timeline taint. Unsupported identities/malformed values invalidate the affected interval; ambiguous references/clock/order taint current-and-later intervals. [Acceptance clears `active`](../../server/measurements.py:171), preserving independently complete earlier intervals. | All six original examples now produce correct sample counts: valid **1**, unknown reference **0**, malformed field **0**, invalid index **0**, stale reference after completed q0 **1**, gap beginning q1 after completed q0 **1**. Additional tests cover missing/null values/references, malformed acceptance, current/later clock/gap damage, usable legacy omitted acceptance and read/JSON/CSV/partial-graph agreement. [Executable six-case probe](evidence-2026-10-15-fixes/timing-probes.py), [complete raw-preserving results](evidence-2026-10-15-fixes/timing-probes.json). |

The C03 partial-aggregate probe ends with **three valid observations**, from the healthy control and two preserved earlier q0 intervals. Invalid intervals never enter histogram/breakdown/mean/median, even with `includePartial=true`. Raw events, accepted counts, warnings and immutable configurations remain inspectable. This changes derivation of affected damaged historical traces; it does not rewrite observations or configurations.

## Actual checks

| Check | Actual result / evidence |
| --- | --- |
| Full backend suite | **95 passed**, one existing Starlette/AnyIO dependency deprecation warning; [captured output](evidence-2026-10-15-fixes/backend-tests.txt). Includes the original 65 and 30 new parametrized review regressions. |
| Full frontend suite | **21 passed**: original 20 plus the shared exact-decimal boundary regression in [domain.test.ts](../../web/tests/domain.test.ts). |
| Original Custom browser suite | **10 passed**, no console errors; [isolated replay report](evidence-2026-10-15-fixes/baseline/verification-report.json). |
| Original recovery/ownership/deadline suite | **8 passed**, no page errors; [isolated replay report](evidence-2026-10-15-fixes/recovery-report.json). |
| Original timing/export suite | **6 passed**, no page errors; [isolated replay report](evidence-2026-10-15-fixes/exports/report.json). |
| Original complete-platform suite | **13 passed**, no page errors; [isolated replay report and Standard/Custom traces](evidence-2026-10-15-fixes/platform/report.json). |
| New targeted browser suite | **8 passed**, no page errors; [harness](../../web/tests/review-fixes-browser.mjs), [report](evidence-2026-10-15-fixes/targeted/report.json). Total browser checks: **45**. |
| All six original C03 API cases | Repaired expected counts; unchanged raw events; read/JSON/CSV/per-session/partial-graph agreement. [Probe results](evidence-2026-10-15-fixes/timing-probes.json). |
| Types / production build | `npm run typecheck` and `npm run build` passed. |
| Protected packaging | All **4** `test:sites` checks passed; protected starter files unchanged. |
| Normal preview | Started only after verifying both normal ports were free. [Read-only browser/API status](evidence-2026-10-15-fixes/preview.json): ready on 4173/8017; no normal practice started or write requests; historical table fingerprints unchanged. |

New browser harness development required correcting two test-only mistakes: the exact existing navigation labels and clearing selected input when the intended new text is empty. The final eight-check run passes; no application defect is inferred from those harness mistakes. Existing replay assertions were preserved; only ports, import resolution, cleanup waiting and evidence destinations were adapted by [prepare-review-fixes-replays.py](../../scripts/prepare-review-fixes-replays.py).

Reproduce from `adaptive-arithmetic`:

```powershell
# Set before importing server.app, whose global app otherwise opens normal data.
$env:ARITHMETIC_DB = Join-Path $PWD 'data/isolated-review-fixes-import.sqlite3'
.venv/Scripts/python.exe -m pytest -q
.venv/Scripts/python.exe docs/reviews/evidence-2026-10-15-fixes/timing-probes.py
.venv/Scripts/python.exe scripts/prepare-review-fixes-replays.py

# Run browsers sequentially; all services/databases/profiles are synthetic/isolated.
node data/fix-2026-10-15-replays/browser.mjs
node data/fix-2026-10-15-replays/review-regressions.mjs
node data/fix-2026-10-15-replays/exports-browser.mjs
node data/fix-2026-10-15-replays/stage1-browser.mjs
Set-Location web
npm run test:review-fixes
npm test
npm run typecheck
npm run build
npm run test:sites
```

## Evidence, safety and limits

The repaired Custom pending/loaded/retry, BOM results and retained-history screenshots were actually opened and inspected. They retain the selected white/Inter/blue design and truthful final states. Retained suites also exercised desktop/tablet/mobile layouts, graphs, keyboard/table interaction, countdown/exclusive cutoff, exact arithmetic and seeds, immutable presets, read-only active-session exports, failed saves/downloads, journal ownership/recovery and protected deletion. These are synthetic software checks, not performance/learning observations.

Browser suites used distinct dynamic ports, synthetic SQLite files and temporary Chrome profiles; they stopped only their own process trees. No normal records were inserted, deleted, exported or dumped. Normal preview startup used its existing database and additive schema initialization; before/after read-only hashes confirm presets/settings/sessions/observations stayed unchanged. Actual normal API PID **29840**, UI PID **8620** were verified listening after startup. [Open the local app](http://127.0.0.1:4173).

Limits remain: Chrome/Windows/loopback is the exercised browser target; no universal screen-reader/browser certification, physical-display timing, formal security audit or unbounded-load guarantee. The 200-request check establishes the repaired append race, not production load capacity. Full Standard timeout uses a documented synthetic monotonic offset; existing real-clock countdown/deadline checks remain intact. Origin-scoped Web Locks/journals and the combined journal-failure/unacknowledged-exit limitation are unchanged. Exact original-game external score equivalence and learning benefit remain unclaimed.

No further blocker was found in the repaired cases. Independent patch recheck and explicit human Stage 1 acceptance are pending; Stage 2 has not started.
