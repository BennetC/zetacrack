# Independent Stage 1 correctness review — 2026-10-14

**Three actionable P2 findings remain. No P0/P1 issue was established.** The delivered platform and all existing checks run successfully, but passing those checks does not close the concurrency/input/invalid-trace cases below. This report assesses correctness; the sibling feature review is independent. No application source, application tests, contracts, normal practice records, or normal services were changed.

Reviewed the complete current working tree, including the uncommitted/untracked Standard, analytics, history, and deletion additions. HEAD `a34d4a5c98f78e7b8d0297b0b6cb15a97d54870a` is only the earlier baseline. [Source fingerprints and fresh check summary](C:/Users/benne/Projects/zetacrack/adaptive-arithmetic/docs/reviews/evidence-2026-10-14-correctness/verification-summary.json) identify the assessed files.

## Findings

### C01 — P2: Make concurrent observation appends idempotent

Location: [app.py:293–303](C:/Users/benne/Projects/zetacrack/adaptive-arithmetic/server/app.py:293), specifically the existence check at line 298 and subsequent insert at line 303.

The transaction does not begin until the first INSERT. Two requests can both SELECT the same absent observation sequence, then the second INSERT raises an uncaught uniqueness error after the first request commits. Identical batches therefore return HTTP 500 instead of both succeeding; concurrent conflicting contents can likewise bypass the intended 409 path. This is reachable when the normal queued flush overlaps the full-log pagehide beacon, or a retry overlaps an earlier request. The winning observations remain intact, but the losing request's additional tail is not committed and save/recovery behavior receives the wrong outcome.

Minimal reproduction: create one synthetic session and concurrently POST the same new `session-started` observation at sequence 0 twice. A barrier placed after the two SELECTs gives **200 and 500**, with one persisted observation. More importantly, the unmodified application, without barriers/wrappers/delays, returned **67 HTTP 500s from 200 identical requests** across 25 fresh sessions and eight concurrent requests per session. The reproduction changes only its own temporary process and synthetic database.

Expected: identical concurrent appends succeed idempotently; disagreeing sequence contents return 409; batches remain atomic. Acquire a write transaction before checking existing observations, or use an equivalent atomic insert/conflict-compare strategy. Add genuinely concurrent identical/conflicting batch coverage, including a longer prefix-compatible tail.

Evidence: [executable concurrency probe](C:/Users/benne/Projects/zetacrack/adaptive-arithmetic/docs/reviews/evidence-2026-10-14-correctness/concurrent_append.py), [controlled interleaving](C:/Users/benne/Projects/zetacrack/adaptive-arithmetic/docs/reviews/evidence-2026-10-14-correctness/concurrent-identical-append.json), [unmodified concurrent requests](C:/Users/benne/Projects/zetacrack/adaptive-arithmetic/docs/reviews/evidence-2026-10-14-correctness/concurrent-identical-unmodified.json).

### C02 — P2: Use the same exact-input whitespace rules in browser and backend

Location: [measurements.py:206–209](C:/Users/benne/Projects/zetacrack/adaptive-arithmetic/server/measurements.py:206), [analytics.py:74–77](C:/Users/benne/Projects/zetacrack/adaptive-arithmetic/server/analytics.py:74), and [domain.ts:71–74](C:/Users/benne/Projects/zetacrack/adaptive-arithmetic/web/src/domain.ts:71). Configuration/provenance parsers also repeat Python `strip()`.

JavaScript `trim()` and Python `strip()` recognize different whitespace sets. A real clipboard paste of `U+FEFF` followed by the exact answer is accepted and advances in the browser, but backend derivation rejects the same stored raw string. In the reproduced complete Standard run, the UI correctly counted one completed question, then saved results showed **zero valid correct-answer timings, null median/mean, and a partial/inconsistent score excluded from comparison**. The generated arithmetic, ordering, policy, clock, and terminal duration were otherwise valid.

Expected: every answer accepted by the shipped client satisfies the backend's same permitted exact-input grammar. Define and share an explicit trimming/lexical contract across client acceptance, backend derivation, cohort validation, and configuration validation while retaining the original raw input. Test the ECMAScript/Python boundary characters, including BOM; do not repair this by rewriting historical raw strings.

Minimal reproduction: Start Standard, copy `\uFEFF` plus the displayed exact answer, paste once into the answer field, then complete the timed run. The executable browser probe uses actual clipboard paste and a documented synthetic monotonic-clock offset to reach the normal exclusive timeout without waiting two minutes. It confirms advancement before persistence and the contradictory saved interpretation afterward.

Evidence: [browser reproduction](C:/Users/benne/Projects/zetacrack/adaptive-arithmetic/docs/reviews/evidence-2026-10-14-correctness/correctness-browser.mjs), [complete synthetic raw/derived trace](C:/Users/benne/Projects/zetacrack/adaptive-arithmetic/docs/reviews/evidence-2026-10-14-correctness/bom-answer-trace.json), [actual result screenshot](C:/Users/benne/Projects/zetacrack/adaptive-arithmetic/docs/reviews/evidence-2026-10-14-correctness/bom-answer-results.png).

### C03 — P2: Apply timing validity to the affected question consistently

Location: [measurements.py:148–171](C:/Users/benne/Projects/zetacrack/adaptive-arithmetic/server/measurements.py:148), plus [measurements.py:82–86](C:/Users/benne/Projects/zetacrack/adaptive-arithmetic/server/measurements.py:82).

Several semantic-warning branches retain valid timing flags, and reference/order branches can invalidate the wrong presentation. The resulting timing values flow directly into saved summaries, exports, and partial-observation graphs, despite the contract requiring invalid affected intervals to be null. Four API-level examples, all accepted and retained by the actual endpoint:

- A first `input-changed` with JSON `value: false` at 5 ms is warned about and normalized to null, but it still becomes `firstInputTimeMs: 5`; a later genuine string edit/acceptance at 10 ms remains a valid correct-time sample. The recorded malformed field event cannot certify a valid answer-field change.
- A presented question with `index: false` becomes derived `index: null` and receives `invalid-question-identity`, but still contributes a valid 10 ms response to the summary and partial graphs.
- An unknown question reference only emits a warning; a stale reference to already completed q0 invalidates q0 while current q1 and subsequent timings remain valid. This fails the stated affected/current-and-later taint rule.
- A sequence gap beginning with q1's presentation after a fully contiguous completed q0 retrospectively nulls q0's otherwise valid interval, because `active` still points to completed q0. Earlier independently completed intervals should survive damage starting afterward.

Full-run comparison eligibility correctly rejects these inconsistent sessions, but that does not protect saved question timings or the explicitly available partial-observation histogram/breakdown. The executable probe confirms read/export agreement on the **incorrect** derived values and that they are included in `includePartial=true` aggregates.

Expected: retain raw records/warnings, explicitly invalidate unsupported identity/field-change intervals, taint current/later intervals for ambiguous current-question relationships, and preserve independently complete observations before a later gap. Centralize the validity transitions so a warning cannot accidentally leave a falsely valid sample or invalidate a completed earlier interval. Add malformed-value/index, stale/unknown-reference, and gap-after-completion cases to backend derivation tests.

Evidence: [executable targeted API/property probes](C:/Users/benne/Projects/zetacrack/adaptive-arithmetic/docs/reviews/evidence-2026-10-14-correctness/probes.py), [actual six-case raw-preserving derivations and partial-graph counts](C:/Users/benne/Projects/zetacrack/adaptive-arithmetic/docs/reviews/evidence-2026-10-14-correctness/targeted-api-probes.json).

## Fresh verification

All commands below ran against the current working tree. Before any import of `server.app`, `ARITHMETIC_DB` was set to a reviewer-owned synthetic database. Browser suites used isolated Chrome profiles, synthetic databases and dynamic ports. Copied harnesses changed only import resolution, ports and evidence destinations; assertions were preserved. The four browser suites ran sequentially. Normal preview/database and prior shared evidence were untouched.

| Check | Actual result |
| --- | --- |
| `.venv/Scripts/python.exe -m pytest -q`, with isolated `ARITHMETIC_DB` | **65 passed**, one existing Starlette/AnyIO dependency deprecation warning |
| `cd web; npm test` | **20 passed** |
| `cd web; npm run typecheck` | Passed |
| `cd web; npm run build` | Passed |
| `cd web; npm run test:sites` | **4 passed** |
| Isolated baseline browser replay | **10 passed**, no console errors; [report](C:/Users/benne/Projects/zetacrack/adaptive-arithmetic/docs/reviews/evidence-2026-10-14-correctness/baseline/verification-report.json) |
| Isolated ownership/recovery/deadline replay | **8 passed**, no page errors; [report](C:/Users/benne/Projects/zetacrack/adaptive-arithmetic/docs/reviews/evidence-2026-10-14-correctness/recovery-report.json) |
| Isolated timing/export replay | **6 passed**, no page errors; [report](C:/Users/benne/Projects/zetacrack/adaptive-arithmetic/docs/reviews/evidence-2026-10-14-correctness/exports/report.json) |
| Isolated complete-platform replay | **13 passed**, no page errors; [report and complete traces](C:/Users/benne/Projects/zetacrack/adaptive-arithmetic/docs/reviews/evidence-2026-10-14-correctness/platform/report.json) |
| Independent exact backend pair counting | **40,000** operation/grid cases matched brute-force ordered-pair enumeration, signed precisions 0–3 |
| Independent TypeScript subtraction ranking | **15,000** signed/mixed-precision domains and **184,949** individual ordered pairs matched brute force; [probe](C:/Users/benne/Projects/zetacrack/adaptive-arithmetic/docs/reviews/evidence-2026-10-14-correctness/domain-probes.ts), [result](C:/Users/benne/Projects/zetacrack/adaptive-arithmetic/docs/reviews/evidence-2026-10-14-correctness/domain-probes.json) |
| Independent histogram classification | **1,000** randomized samples: returned-edge membership and bin totals agree exactly |
| New clipboard and invalid-trace probes | Findings C02/C03 reproduced through actual browser/API/read/export/analytics paths |
| New concurrency probe | Finding C01 reproduced with controlled scheduling and an unmodified 200-request run |

Reproduce from `C:\Users\benne\Projects\zetacrack\adaptive-arithmetic`:

```powershell
.venv/Scripts/python.exe docs/reviews/evidence-2026-10-14-correctness/probes.py
.venv/Scripts/python.exe docs/reviews/evidence-2026-10-14-correctness/concurrent_append.py
web/node_modules/.bin/tsx.cmd docs/reviews/evidence-2026-10-14-correctness/domain-probes.ts
node docs/reviews/evidence-2026-10-14-correctness/correctness-browser.mjs
.venv/Scripts/python.exe docs/reviews/evidence-2026-10-14-correctness/prepare-browser-replays.py
node data/review-2026-10-14-correctness/browser.mjs
node data/review-2026-10-14-correctness/review-regressions.mjs
node data/review-2026-10-14-correctness/exports-browser.mjs
node data/review-2026-10-14-correctness/stage1-browser.mjs
```

The concurrency/BOM probes assert the reproduced current defect, rather than claiming to be a passing regression suite after repair. The first attempt at the BOM browser harness timed out because its own text predicate used lowercase “invalid”; the corrected harness waits for the actual zero-answer summary and passes with the saved contradictory trace. This was a harness correction, not an application failure or source fix.

## Invariant coverage and conclusions

Inspected browser generation, selection boundaries, exact input, execution, journals, Web Locks, saved views/plots/downloads, API validation/transactions, derivation, exact provenance and analytics. Read both working agreements, state/decision records and the complete Stage 1 contracts/checklist/acceptance/handoff.

The standard primary [setup](https://arithmetic.zetamac.com/) and [served module](https://arithmetic.zetamac.com/dist/app.js?v=2) were rechecked. The served module's SHA-256 remains `919c65c4596ce8f1f768fe603494e22db0152ea3393b4983980b7507680e0fd0`; [verification metadata](C:/Users/benne/Projects/zetacrack/adaptive-arithmetic/docs/reviews/evidence-2026-10-14-correctness/original-source-check.json). Local inverse-addition/inverse-product generation matches that content; independent factor sampling and equal operation selection are separate from our intentionally different runtime. No external score-equivalence claim is made.

Outside the findings, fresh checks support exact signed decimals and inclusive/fixed bounds; independent precision and operand order; zero-divisor exclusion and terminating division answers; direct uniform valid-pair subtraction including sparse huge ranges; weighted shares/provenance and unchanged seeded custom replay; immutable configuration/version migration and preset independence; first-input/acceptance differences, edit/paste/deletion recording, raw timing precision and zero/odd/even/empty summaries; unfinished/unknown-end lower bounds; countdown/pending-Start exclusion, focus/page exit and exclusive deadlines; retained journals and bounded immutable-prefix recovery; consistent SQLite read snapshots through concurrent appends/deletion; conservative cohort/date/score filtering; histogram/bin/sample and breakdown/sequence agreement; exact raw-string/Unicode/CSV/JSON exports; empty/legacy data; exact confirmed-scope atomic deletion, open/owned/pending protection, arrivals after confirmation and retained preset/custom memory. Existing known failures/retries are exercised by real browser/API checks rather than inferred from screenshots.

Actual BOM results and representative desktop graph captures were visually inspected. Source and fresh data traces confirm that plotted values come from backend derivations, including the incorrect damaged-trace samples in C03. This correctness review does not certify every accessibility/browser/device configuration or exhaustive adversarial database corruption.

Known acknowledged limits remain distinct from the findings: render commits do not establish physical display/cognitive latency; original clock/input/focus behavior differs intentionally; Web Locks/journals are origin scoped; losing journaling plus exiting before acknowledgment cannot guarantee every unrecorded late write; Windows Chrome/local-loopback is the verified browser target; graphs are descriptive, and Stage 2 learning is excluded. No new P0/P1 loss/security issue was established in the exercised paths, but this is not a formal security or unbounded-load audit.

The required features are broadly operational, with unusually thorough existing checks. **Correctness acceptance should remain pending until C01–C03 are fixed and the new cases rerun.** Human Stage 1 acceptance and Stage 2 authorization are separate gates.
