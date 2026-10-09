# Stage 1 — Provisional Implementation Plan

Status: Broader Stage 1 plan remains provisional. The separately authorized [custom-practice controls](CUSTOM_PRACTICE.md) and [timing/export](TIMING_EXPORTS.md) slices are implemented and verified; see [actual checks](ACCEPTANCE.md) and [handoff](HANDOFF.md). The outline below describes full-stage goals, including extensions beyond delivered custom features, and does not imply authorization. See [project state](../PROJECT_STATE.md).

## Approval prerequisite

Agree the [product experience](PRODUCT_SPEC.md), implementation-critical [architecture](ARCHITECTURE.md), and [measurement semantics](DATA_CONTRACT.md). Turn the proposed [acceptance checks](ACCEPTANCE.md) into agreed criteria. Record unresolved defaults for approval. Begin code only when the user explicitly approves starting Stage 1 implementation under Gate B.

## Provisional milestones

| Milestone | Deliverable | Dependencies | Proposed acceptance checks | Explicit exclusions |
| --- | --- | --- | --- | --- |
| M1 — Arithmetic and generation | Exact question generation and answer validation for approved content, seeded reproduction, provenance. | Gate B; approved arithmetic/input rules and stack. | Operations, signs, boundaries, decimals/division constraints, answer equivalence, repeatable sequence. | Adaptive selection; speculative ML interfaces. |
| M2 — Sessions and interaction | Standard/custom configuration, approved timed/endless execution, input/correction behavior, question-level observations. | M1; agreed benchmark mechanics, lifecycle, scoring, and timing semantics. | Complete session flow, partial/wrong input, timing cutoff, interruptions and unfinished work under agreed rules. | Unapproved session formats; AI coach. |
| M3 — Persistence and export | Approved record storage, required recovery/deletion behavior, inspectable export. | M2; approved storage and data contract. | Retained/reloaded observations and export reconstruct the session, with exact values and provenance. | Unapproved accounts, cloud resources, public deployment. |
| M4 — Results and descriptive analytics | Agreed scores, breakdowns, history, and minimal replaceable fixed/random selection boundary. | M2–M3; approved metric definitions and architecture. | Aggregates agree with records/export; comparison limits and timing labels are accurate; selection provenance retained. | Predictive models, discovery, confidence claims, personalized policies. |
| M5 — Verification and handoff | Agreed checks run, limitations documented, actual [handoff](HANDOFF.md), request for user acceptance. | M1–M4 and agreed acceptance scope. | At least one full generation-to-export/result trace; actual test results and untested areas recorded. | Claiming user acceptance; starting Stage 2 implementation. |

Milestone grouping/order may change during approval. Refine each authorized milestone into a deliverable, dependencies, acceptance checks, and explicit exclusions before executing it. Keep small testable increments and update documents at meaningful checkpoints.

## Completion boundary

Implementation completed, checks passed, and Stage 1 accepted are separate statuses. Gate C requires an actual handoff and explicit user acceptance. Only then may Gate D open a collaborative Stage 2 design discussion; it does not authorize the agent to implement the learning engine.
