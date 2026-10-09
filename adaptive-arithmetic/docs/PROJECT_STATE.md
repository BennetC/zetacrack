# Project State

Workflow authority, read with the [working agreement](../AGENTS.md) and [decision log](DECISIONS.md). Updated 2026-10-09.

| Item | Status |
| --- | --- |
| Documentation bootstrap | Complete |
| Current activity | User requested comprehensive Stage 1 feature screening, followed automatically by an implementer to finish the gaps |
| Custom-practice controls | Approved, implemented, and verified after runtime/recovery fixes |
| Response timing and session exports | Explicit implementation approval on 2026-10-09; median/mean correct-answer times, first-input details, JSON/CSV downloads implemented and verified; [contract](stage-1-ai/TIMING_EXPORTS.md) |
| Custom architecture/configuration | React/TypeScript, FastAPI, SQLite; [contract](stage-1-ai/CUSTOM_PRACTICE.md) |
| Verification | 16 frontend tests, 34 backend tests, 10 baseline browser checks, 8 recovery/deadline checks, 6 timing/export browser checks, typecheck/build passed; desktop/mobile additions inspected |
| Remaining Stage 1 | Explicitly authorized on 2026-10-09: screen all remaining feature gaps, including graphs and standard Zetamac, then implement and verify them |
| Full Stage 1 user acceptance | Not requested; not received |
| Stage 2 | Not started |

## Independent review and requested fixes, 2026-10-09

The user explicitly requested a reviewer before the next design discussion, then requested a worker to fix its findings. The review used temporary synthetic databases and isolated Chrome/API/frontend processes. The fixes preserve the approved editor, exact generator, append-only observations, and normal practice records.

- **P1, fixed:** A browser-held Web Lock protects the owning session through queued writes. Background tabs skip live journals; page disappearance releases ownership without guessing from an inactivity timeout. StrictMode cleanup cannot release a remounted live run's lock.
- **P2, fixed:** Recovery reads SQLite, validates matching immutable prefixes, retains the longer log, and assigns the next terminal sequence. Malformed/conflicting journals are isolated. Late append conflicts trigger a bounded re-read/reconcile; synthetic ends are not written into the journal before database acceptance. Dedicated recovery errors survive unrelated setup saves and offer retry.
- **P2, fixed:** A focus guard spans asynchronous Start work through installation of run listeners. A lost/hidden page ends once at zero elapsed time without presenting a question, even if focus returns before the response. Failed starts clean up their guard.
- **P2, fixed:** Every active terminal action at/after a timed deadline becomes timeout at the configured duration. Earlier focus loss and countdown endings retain their original meaning.

Relevant code: [session recovery/ownership](../web/src/sessionRecovery.ts), [session execution](../web/src/PracticeRun.tsx), [pending Start and recovery errors](../web/src/PracticeEditor.tsx). Evidence: [8 regression checks](../design/review-fixes-report.json), [browser harness](../web/tests/review-regressions.mjs), and [acceptance record](stage-1-ai/ACCEPTANCE.md).

The original review checked subtraction rank mapping over 30,976 signed/mixed-precision grids. After the fixes, 16 frontend tests, 13 API tests, 10 baseline Chrome checks, 8 regression checks, typecheck, and build passed. The independent reviewer rechecked the patch and found no actionable remaining findings. Regression and baseline server processes were closed; regression ports 57409/57410 and baseline ports 8018/4174 were released. Test records are synthetic, not user performance evidence.

Safe cross-tab ownership requires browser Web Locks. If browser journaling fails and a page exits before database acknowledgement, complete preservation cannot be guaranteed, especially with a late unload write; the save warning tells the user to keep the page open. Conflicting copies are retained for inspection rather than overwritten. Details: [contract](stage-1-ai/CUSTOM_PRACTICE.md).

## Authorization and delivered scope

The user requested Stage 1 product design, explicitly said “PLEASE IMPLEMENT THIS PLAN” for custom-practice controls, and selected displayed visual option 1. This supersedes bootstrap-only restrictions for this slice. Routine source, dependencies, persistence, testing, and local preview work required by that instruction are authorized.

Delivered: weighted operations/groups, exact signed decimal ranges, uniform valid-pair generation, preset CRUD, remembered setup, immutable session snapshots, timed/endless practice, countdown, exact automatic advancement, focus-loss termination, unfinished observations, and saved timing results/exports. Details/evidence: [custom contract](stage-1-ai/CUSTOM_PRACTICE.md), [timing/export contract](stage-1-ai/TIMING_EXPORTS.md), [acceptance record](stage-1-ai/ACCEPTANCE.md), [handoff](stage-1-ai/HANDOFF.md), and [design QA](../design-qa.md).

The normal preview is running at [127.0.0.1:4173](http://127.0.0.1:4173), using `data/arithmetic.sqlite3`. The local API was refreshed for the additive nullable measurement-version migration and new endpoints; existing observations, presets, and configuration were not rewritten. Synthetic checks use separate databases/ports. Startup instructions are in [README.md](../README.md).

## Response timing and exports, 2026-10-09

The user explicitly authorized this second slice with “PLEASE IMPLEMENT THIS PLAN”. A single backend derivation now supplies saved results, extended session reads, and snapshot-consistent JSON/CSV downloads. New clients use `response-timing-v1`; existing metadata remains null. Correct-answer time is the main metric; first-input time is separate. Raw timing precision is retained, and invalid intervals are null with quality warnings. Unknown recovery end times remain unknown; unfinished durations are lower bounds. Raw edits are not incorrect attempts.

Results offer save/summary/export retries. Setup downloads all persisted sessions without recovering or terminating another tab's live run. Configuration snapshots, exact arithmetic strings, ordered raw events, provenance, and raw-input JSON encoding survive export. [Synthetic trace/report](../design/timing-exports/report.json), [backend tests](../tests/test_measurements.py), and [browser harness](../web/tests/exports-browser.mjs) cover the agreed edge cases and failures. No history browser, benchmark-fidelity claim, retention/deletion UI, or Stage 2 learning work was added.

## Next permitted work

On 2026-10-09 the user said: “graphs are also fully missing. start a feature screener that will find all feature gaps and that will subsequently start an implementer that will finish it”. This is explicit authorization to audit and finish the remaining local Stage 1 product scope, including graphs, standard Zetamac, history/descriptive analytics, and other gaps supported by the Stage 1 requirements. The screener must produce an evidence-backed checklist and subsequently launch an implementer. Routine implementation choices within that scope do not require another approval gate.

Earlier references to approval of only the two delivered slices describe historical authorization and do not limit this new instruction. Preserve approved timing/custom-practice behavior and the selected visual design. Protect existing user records: use isolated synthetic data for tests; implement deletion controls without deleting normal records during development. Stage 2 learning, public deployment, cloud accounts, and paid/external services remain outside scope. Full Stage 1 verification/handoff and explicit user acceptance remain separate.

The remaining local feature requirements now go to the screener and implementer rather than staying an unimplemented discussion backlog. Verify original standard benchmark mechanics before claiming compatibility; document sensible defaults for unfinished Stage 1 details. Naming, accounts/synchronization, and deployment are not implied by finishing the local platform. Stage 2 remains user-owned and gated on explicit full Stage 1 acceptance.

Record actual approvals, delivered features, checks, limitations, and next permitted action. Keep implementation, verification, and user acceptance distinct.

## Version-control baseline, 2026-10-09

The user requested Git initialization and a sensible initial commit sequence. The repository root is the parent `zetacrack/` directory, on branch `main`. Initial commits group the existing workspace into project rules/specifications, the FastAPI backend and its tests, the browser frontend and its tests, and documentation/design evidence. This imports the current delivered scope; it does not reconstruct earlier development history.

Root ignore rules exclude local practice data, SQLite databases and sidecars, logs, dependencies, build output, caches, browser profiles, and environment secrets. The selected design and existing synthetic verification evidence are retained. Text normalization is defined in `.gitattributes`, with CRLF checkout for PowerShell scripts.

Checks rerun for the initial baseline: 34 backend tests, 16 frontend tests, TypeScript checking, the production build, and 4 Sites packaging/worker tests passed. Backend testing reported one dependency deprecation warning. Existing browser/visual evidence is preserved; browser suites were not rerun for this version-control change. No remote is configured. Application behavior, remaining Stage 1 work, and user-acceptance status are unchanged.
