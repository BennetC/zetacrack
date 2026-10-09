# Decision Log

Confirmed decisions reflect the user's instructions. [PROJECT_STATE.md](PROJECT_STATE.md) records authorization; proposals do not authorize implementation.

| ID | Status | Decision | Rationale / consequence |
| --- | --- | --- | --- |
| D-001 | Confirmed | Two stages: agent implements approved Stage 1 platform; user owns substantive Stage 2 learning work. | No autonomous learning-engine implementation. |
| D-002 | Confirmed | Gates A–D in [AGENTS.md](../AGENTS.md) distinguish discussion, code authorization, verification, and user acceptance. | Scoped approval does not authorize the whole application. |
| D-003 | Partially resolved | Standard benchmark and general/custom arithmetic are intended; custom practice is delivered. | Original benchmark mechanics still need verification. |
| D-004 | Confirmed | Fixed/random selection and descriptive results only in Stage 1. | No predictive models, discovery engine, personalized policy, or AI coach. |
| D-005 | Confirmed | Retain arithmetic-scoped reconstructable observations, including unfinished work/provenance. | Custom sessions now export complete snapshots and raw/derived observations under [TIMING_EXPORTS.md](stage-1-ai/TIMING_EXPORTS.md). |
| D-006 | Confirmed for slice | Desktop-first React/TypeScript, exact browser arithmetic, local Python FastAPI API. | One coherent project; no per-answer network dependency. |
| D-007 | Partially resolved | SQLite presets, last valid setup, immutable session snapshots. | Retention, session deletion UX, accounts, synchronization unresolved. |
| D-008 | Unresolved | Deployment/public-use requirements. | No provisioning, cost, or public release authorized. |
| D-009 | Partially resolved | User chose light visual option 1, editor left/settings right, desktop first. | [Selected image](../design/selected-editor.png) is the reference; name remains provisional. |
| D-010 | Confirmed for slice | User supplied detailed custom-practice controls plan. | [Contract](stage-1-ai/CUSTOM_PRACTICE.md) defines shares, ranges, precision, presets, validation, sessions. |
| D-011 | Confirmed for custom practice | Exact automatic advancement, solve or end, focus loss ends, optional countdown. | Raw edits are not wrong attempts; timing/export meanings are resolved in D-016. |
| D-012 | Explicitly authorized | “PLEASE IMPLEMENT THIS PLAN”, followed by “1” for visual selection. | Source, dependencies, local runtime/persistence, verification, preview authorized for this slice. |
| D-013 | Verified, not user accepted | Custom-practice checks and source-based visual QA passed 2026-10-08. | [Evidence](stage-1-ai/ACCEPTANCE.md) covers the slice; full Stage 1 acceptance not claimed. |
| D-014 | Fixed and rechecked | User requested an independent feature reviewer on 2026-10-09; four runtime/recovery defects were reproduced and subsequently fixed. | Browser session ownership, immutable-prefix recovery, pending-Start focus handling, and deadline normalization now have regression coverage. Independent recheck found no actionable remaining findings. |
| D-015 | Explicitly authorized and verified | User requested a worker to fix the review findings before the next design discussion. | Focused repairs preserve the chosen UI, exact generator versions, snapshots, and append-only observations. Web Locks establish live ownership; no inactivity heuristic or new server protocol. [Acceptance record](stage-1-ai/ACCEPTANCE.md) includes the combined storage/unacknowledged-exit limitation. |

| D-016 | Explicitly authorized, implemented, verified | User requested implementation of response timing and session exports on 2026-10-09. | Correct-answer time is primary, first-input separate; backend median/mean, nullable measurement version, unknown-end lower bounds, and snapshot-consistent JSON/CSV. [Contract](stage-1-ai/TIMING_EXPORTS.md) and [evidence](stage-1-ai/ACCEPTANCE.md). No accuracy metric, history browsing, benchmark claim, retention/deletion UI, or Stage 2 engine in that slice. Full Stage 1 acceptance remains separate. |
| D-017 | Explicitly authorized; screening then implementation | User pointed out missing graphs and requested a feature screener that finds every Stage 1 gap and subsequently starts an implementer to finish them. | Extends implementation authorization to remaining local Stage 1 scope, including standard Zetamac, graphs, history/descriptive analytics, and other requirements found in the full audit. The screener writes an evidence-backed checklist and launches the implementer without repeated permission. Preserve existing records, approved measurement semantics, and selected design; no Stage 2 engine, cloud/paid services, or public deployment. Completion and user acceptance remain separate. |

| D-018 | Explicitly authorized | User requested Git initialization with initial commits grouped by purpose. | Repository at `zetacrack/`, branch `main`; version project specifications, backend/tests, frontend/tests, and documentation/design evidence. Exclude local data, credentials, generated output, and dependencies. Baseline checks are recorded in [PROJECT_STATE.md](PROJECT_STATE.md). |

Record status, rationale, consequences, and authorization/evidence for new decisions. Explicitly supersede changed decisions.
