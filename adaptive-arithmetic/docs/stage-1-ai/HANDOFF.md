# Custom practice, timing, and export handoff

Delivered 2026-10-08 under the user's explicit controls implementation request and option 1 selection; four independent review findings were fixed and reverified by the requested worker on 2026-10-09. Full Stage 1 remains unfinished and unaccepted.

The user explicitly authorized the response-timing/export slice on 2026-10-09. It is now implemented and verified under [TIMING_EXPORTS.md](TIMING_EXPORTS.md), preserving the practice flow and selected visual design.

## Try the app

[Open local custom practice](http://127.0.0.1:4173). The normal preview runs with `data/arithmetic.sqlite3`; the API was refreshed for new endpoints and the additive nullable measurement-version migration. Existing observations and configurations were preserved. Startup commands are in [README.md](../../README.md). Isolated test services were closed.

All four operations, multiple groups, exact two-level shares, inclusive signed ranges, independent precision, safe division, and nonnegative subtraction defaults are implemented. Add/duplicate/remove preserve shares; explicit equal splits are available. Starting presets cover two-digit addition/subtraction and multiplication by 11/12. Custom presets support save/update/rename/delete. Timed shortcuts/custom seconds, endless, and countdown remain separate settings.

## Architecture and records

| Module | Responsibility |
| --- | --- |
| [domain.ts](../../web/src/domain.ts) | Versioned config, BigInt decimals, validation, shares, seeded uniform valid-pair generation |
| [PracticeEditor.tsx](../../web/src/PracticeEditor.tsx) | Selected-source editor, errors, presets, remembered setup, start |
| [PracticeRun.tsx](../../web/src/PracticeRun.tsx) | Automatic answers, timer/countdown, termination, journal/observations, results |
| [sessionRecovery.ts](../../web/src/sessionRecovery.ts) | Browser session ownership, immutable-prefix recovery, pending-Start focus guard, deadline normalization |
| [app.py](../../server/app.py) | FastAPI validation and SQLite persistence |
| [measurements.py](../../server/measurements.py) | Shared derivation, timing definitions/eligibility, warnings, and CSV serialization |
| [ExportActions.tsx](../../web/src/ExportActions.tsx) | Read-only JSON/CSV browser downloads and retryable export errors |

Every session stores its independent full config, seed, generator `exact-grid-v1`, and policy `hierarchical-shares-v1`. Questions retain exact values, source group, actual shares, and valid-pair count. Same-version/config/seed replay is verified. Benchmark compatibility is not claimed.

SQLite stores presets/settings/sessions/observations. Session snapshots have no update endpoint; editing/deleting presets does not affect them. `GET /api/sessions/{id}` includes raw events and backend-derived questions, summary, termination metadata, and warnings. `GET /api/sessions/{id}/export?format=json|csv` downloads one session; `GET /api/exports/sessions?format=json|csv` downloads all persisted sessions from one read snapshot. Results expose per-session downloads after successful save; setup exposes all-session downloads. History browsing and session deletion UX remain future work.

## Observation meaning

Exact input advances immediately. Raw editable changes are not wrong attempts. Completed count derives from accepted answers; no accuracy statistic is inferred. Timed answers at/after the deadline are not accepted. Focus loss, timeout, manual end, and page exit preserve presented unfinished work.

Monotonic elapsed time starts at the first question's React layout commit; wall timestamps are separate and countdown is excluded. Question durations include typing/corrections, not pure calculation time. Serialized writes and an arithmetic-only journal retain unacknowledged data; abrupt-reload recovery marks unknown end timing. Browser-held locks prevent a second tab recovering a live run. Recovery reconciles immutable prefixes with SQLite, isolates bad journals, and keeps dedicated errors visible until recovery/retry resolves them. Lost focus during pending Start ends the created session without presentation; any active terminal callback at/after a timed deadline records timeout exactly at the deadline. Details: [current contract](CUSTOM_PRACTICE.md).

Safe ownership requires Web Locks. Journal writes can fail; the in-memory log still attempts a database save and the UI asks the user to keep the page open. Exiting before acknowledgement while journaling is unavailable, including a late unrecorded unload write, cannot guarantee complete preservation under the current append-only protocol. Genuine conflicting copies are retained rather than silently replaced.

## Verification and next work

16 frontend tests, 34 backend tests, 10 baseline Chrome checks, 8 recovery/deadline checks, 6 timing/export browser checks, typecheck, and build passed. The earlier independent reviewer rechecked the runtime fixes; the new slice has its own functional and desktop/mobile visual evidence. [Acceptance](ACCEPTANCE.md) links commands, traces, screenshots, and limits. Synthetic test databases are separate from normal practice; test processes were cleaned up.

Next: review the delivered timing/export slice, then scope remaining Stage 1 design. Standard benchmark fidelity, history/further analytics, retention/deletion, deployment, and full Stage 1 acceptance remain outstanding. Stage 2 remains user-owned and has not started.
