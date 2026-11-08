# Stage 1 architecture

Status: Complete local platform implemented and verified; human acceptance pending. One React/TypeScript + FastAPI + SQLite project, with no per-answer network dependency or external service. [PLATFORM.md](PLATFORM.md) records the final decisions and [HANDOFF.md](HANDOFF.md) maps APIs/modules.

| Boundary | Modules / responsibility |
| --- | --- |
| Exact content and input | `web/src/domain.ts`: BigInt decimal coefficients/scales, validation, uniform grid/rank generation and exact answer equivalence |
| Selection | `SelectionPolicy`, `WeightedRandomPolicy`, `FixedStandardPolicy`: choose content independently of uniform operand sampling; preserve old custom random draws |
| Standard content | `web/src/standard.ts`: versioned original reverse-addition/reverse-product rules and fixed default config |
| Execution | `PracticeRun.tsx`: monotonic render-commit clock, automatic advancement, exclusive deadline, focus ending, journal/serialized observations and saved results |
| Setup/navigation | `PracticeEditor.tsx`: Standard/Custom/History/Graphs, independent custom memory, presets and pending-Start guard |
| Recovery/ownership | `sessionRecovery.ts`: Web Locks, immutable-prefix reconciliation, isolated retryable journals and unknown-end recovery |
| Persistence | `server/app.py`: local-origin API, validation, nullable additive migrations, append-only observations, pinned read snapshots, atomic closed-only deletion |
| Derivation/content validation | `server/measurements.py` and `content.py`: sole derived timing source; exact rational validation of arithmetic, input and immutable custom provenance |
| Comparisons | `server/analytics.py`: conservative immutable cohorts, full-run eligibility, score, deterministic histogram and descriptive breakdowns |
| Saved interface/plots | `SavedViews.tsx`, `Charts.tsx`: read-only history/detail/graphs, backend values, accessible tables and protected confirmed deletion |
| Export | `ExportActions.tsx`, backend JSON/CSV serialization: complete snapshots/raw/derived data, exact strings and raw-input encoding |

SQLite tables remain presets/settings/sessions/observations. Nullable measurement/mode/content columns preserve legacy rows without inference. Preset edits never update sessions. A session retains seed, immutable config and generator/policy/measurement/content identities. Standard has dedicated provenance; custom exact-grid-v1 and hierarchical-shares-v1 seeded output stays unchanged.

List/analytics/export use explicit BEGIN read transactions and WAL snapshots. Deletion uses BEGIN IMMEDIATE, rechecks exactly selected closed IDs and removes observations/session rows atomically. The browser protects same-origin held ownership and journals; database-open or missing-terminal rows are rejected server-side. Reads do not recover or end sessions and fresh read-screen mounts do not save controls.

No generic learning/model framework is built. The minimal selection interface is available for later user-owned Stage 2 work. Keep the protected Sites packaging files intact; packaging is verified but no deployment was requested. Origin-scoped Web Locks and the existing combined unavailable-journal/unacknowledged-exit limitation are documented in the contracts.
