# Stage 1 — Product Specification

Status: Custom-practice controls and response timing/session exports explicitly approved, implemented, and verified; broader Stage 1 remains draft. Authoritative contracts: [CUSTOM_PRACTICE.md](CUSTOM_PRACTICE.md) and [TIMING_EXPORTS.md](TIMING_EXPORTS.md). See [project state](../PROJECT_STATE.md) and [decisions](../DECISIONS.md).

## Confirmed intent and capabilities

Build an enjoyable mental-arithmetic trainer for the user's practice and a credible technical portfolio project. Learning improvement is a goal to evaluate, not an established result.

- **Zetamac-style arithmetic:** rapid arithmetic, a fixed standard benchmark preset, timed runs, scores, and performance history. Verify original mechanics before claiming exact compatibility or comparable scores.
- **General/custom arithmetic:** configurable operations and operand ranges, multi-digit questions, decimals, and focused practice such as multiplication by 11 or 12 and two-digit addition/subtraction. Support timed and endless practice.
- **Platform foundation:** correct generation and input, scoring, persistence, descriptive analytics, exportable question-level observations, tests, and a replaceable selection boundary. Stage 1 fixed/random policies are sufficient.

Keep three independent concepts clear: arithmetic content specifies allowed questions; session format specifies how a run proceeds and ends; selection policy specifies which eligible question comes next. A focused operand constraint does not automatically require a separate product mode. The standard benchmark must remain nonadaptive.

## Proposed MVP boundaries — awaiting discussion

- One coherent trainer with an accessible standard-run entry point and a practice configuration flow.
- Custom controls are approved and implemented as defined in [CUSTOM_PRACTICE.md](CUSTOM_PRACTICE.md). Further content/benchmark modes require discussion.
- Saved custom results now provide median/mean correct-answer times, first-input details, and complete JSON/CSV downloads. History browsing/further analytics require separate design.
- Only the minimum integration boundary required for later user-owned learning work.

These describe the remaining broader product. Custom practice has an approved screen and selected visual option 1. Social features, achievements, accounts, synchronization, and public deployment require discussion.

## Core flows to discuss

| Flow | Experience to resolve |
| --- | --- |
| Start a standard run | Entry point, exact preset, instructions, start/countdown behavior, duration, benchmark labeling. |
| Configure practice | Delivered for the approved slice; [current contract](CUSTOM_PRACTICE.md). |
| Answer and correct | Exact automatic advancement, editable raw input, and v1 response timing are delivered. Field changes are edits, not incorrect attempts. |
| End or interrupt a session | Timed/endless, no skip/pause, focus-loss ending, unfinished records, and unknown-end lower bounds are delivered. |
| Understand results | Median/mean correct-answer times, first-input details, and JSON/CSV exports are delivered. History, comparisons, breakdowns, and deletion access remain to design. |

Custom-practice visual direction and local storage are selected. Resolve remaining experiences in small related discussions.

## Analytics definitions to resolve

Saved custom results use valid correct-answer times for median/mean, retain unfinished work and first-input observations, and expose no accuracy percentage. [TIMING_EXPORTS.md](TIMING_EXPORTS.md) defines these delivered metrics and displays. Additional distributions, breakdowns, history, and cross-configuration/version comparisons require separate agreement.

Use the [data contract](DATA_CONTRACT.md) for authoritative measurement semantics. Show what was observed without claiming causal effects, confirmed patterns, pure cognitive speed, or training benefit. Historical comparisons need interpretable configuration/provenance and clear limits.

## Non-goals for Stage 1

Predictive models, automated pattern discovery, statistical confidence claims about discovered relationships, personalized training policies, and an AI coach are excluded. Stage 1 does not establish statistical validity or learning improvement. It does not select Stage 2 methodology.

## Open product decisions

The original benchmark's operations, sampling, timing, answer behavior, and scoring require verification. History/further analytics and research eligibility, retention/deletion, broader accessibility, product naming, and public use remain unresolved. Approved custom arithmetic, session settings, and timing/exports are implemented; option 1 remains the selected visual direction.

Approval must result in reviewable [architecture](ARCHITECTURE.md), [measurement contract](DATA_CONTRACT.md), [implementation plan](IMPLEMENTATION_PLAN.md), and [acceptance criteria](ACCEPTANCE.md). Approval of a feature alone is not authorization to begin coding.
