# Stage 1 — Architecture

Status: Broader architecture remains draft. The approved custom-practice slice uses a React/TypeScript browser engine, a local FastAPI persistence API, and SQLite, as specified in [CUSTOM_PRACTICE.md](CUSTOM_PRACTICE.md). Its implementation is authorized; hosting and broader application architecture are not. See the [product specification](PRODUCT_SPEC.md) and [project state](../PROJECT_STATE.md).

## Required separation of responsibilities

| Responsibility | Boundary and constraint |
| --- | --- |
| Arithmetic generation | Produce valid questions under approved operation/operand rules; preserve exact values and reproducible generator provenance. |
| Selection policy | Choose among eligible content through a replaceable boundary; Stage 1 needs fixed/random behavior only. The standard benchmark remains fixed and nonadaptive. |
| Session execution | Control sequence, lifecycle, timers, transitions, and terminal/interrupted states using approved semantics. |
| Answer validation | Interpret permitted input and exact answer equivalence, separating incomplete input from attempts and accepted answers. |
| Observations | Capture the reconstructable question/attempt/lifecycle information agreed in the [data contract](DATA_CONTRACT.md). |
| Persistence and export | Retain recoverable records under the approved storage/deletion model; expose an inspectable export. |
| Descriptive analytics | Derive scores and summaries from question-level records with defined eligibility and denominators. |
| Interface | Present configuration, sessions, corrections, results, and history without embedding contradictory arithmetic or measurement rules. |

For the delivered custom slice, actual modules, tables, and endpoints are documented in [HANDOFF.md](HANDOFF.md) and [CUSTOM_PRACTICE.md](CUSTOM_PRACTICE.md). The remaining broader responsibilities are proposals. Keep one coherent project unless an approved requirement warrants additional infrastructure.

## Selection-policy integration constraint

Keep question eligibility/generation separate from choice of the next question, and make recorded observations available to future user-owned work. The exact interface and information it exposes await discussion. Record policy identity/version alongside generator provenance. Leave room for genuine selection probabilities if a later policy defines them; do not fabricate values now.

The boundary must permit replacement without building a generic machine-learning framework, prediction pipeline, or speculative orchestration service during Stage 1.

## Engineering constraints

- The custom generator uses exact BigInt coefficients/scales in the browser, decimal strings in records, and matching integer-grid validation in Python. Preserve this exactness in future extensions.
- Distinguish wall-clock metadata from elapsed-time measurement; define timer cutoff and input ordering explicitly in the data contract.
- Plan seeded generation with recorded configuration and generator version. Reproduction claims must state what can be replayed and under which version.
- Derive analytics from retained observations, including incomplete sessions/questions as defined; do not silently keep only successful responses.
- Scope telemetry to arithmetic interaction. Storage, access, deletion, and release requirements must be discussed before release.
- Make a complete session traceable from generated content to observations, persisted/exported data, and displayed summaries.

## Decisions awaiting discussion

Custom runtime, exact representation, local storage, journaling, and test tools are implemented. The approved [timing/export slice](TIMING_EXPORTS.md) adds a single backend derivation, nullable measurement-version migration, and explicit read transactions for snapshot-consistent downloads. Results consume the persisted summary after save; export actions have no recovery side effects. History/further analytics, benchmark fidelity, accounts, retention/deletion UX, and deployment remain unresolved. Record decisions in [DECISIONS.md](../DECISIONS.md).

Custom implementation has explicit scoped approval and passing [checks](ACCEPTANCE.md), with its actual [handoff](HANDOFF.md). Remaining Stage 1 implementation requires scoped approval under Gate B.
