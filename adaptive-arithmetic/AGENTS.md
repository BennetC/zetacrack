# Adaptive Arithmetic — Working Agreement

`adaptive-arithmetic` is a working folder name, not an approved product name. The purpose is an enjoyable arithmetic trainer that improves the user's ability and can become a credible technical portfolio project. Do not claim demonstrated learning benefit or research findings without evidence.

## Resume from project state

Read these documents at the beginning of later work:

1. This working agreement.
2. [PROJECT_STATE.md](docs/PROJECT_STATE.md), the authority for workflow status and the next permitted action.
3. Relevant entries in [DECISIONS.md](docs/DECISIONS.md).
4. The active stage's specifications and acceptance criteria, starting with [Stage 1 product specification](docs/stage-1-ai/PRODUCT_SPEC.md) or [Stage 2 research brief](docs/stage-2-user/RESEARCH_BRIEF.md).

Use [README.md](README.md) to navigate the full workspace. Bootstrap is a one-time preparation task, not a development stage. Resume this workspace rather than recreating it or repeating the first interaction's no-discussion restriction.

## Exactly two development stages

- **Stage 1 — AI implementation:** after approval, the agent builds the interface, arithmetic generation, standard/custom content, timed/endless sessions, scoring, persistence, descriptive analytics, question-level export, tests, and a minimal boundary for future selection policies. Fixed and random policies suffice. The substantive learning system is excluded.
- **Stage 2 — user implementation:** the user owns the mathematical, statistical, and algorithmic investigation and implementation. The agent's default role is research assistant, tutor, critical reviewer, and collaborator. Implement only narrowly scoped pieces explicitly requested by the user; do not autonomously build the learning engine.

Prediction, verification of patterns, and improvement of future ability are separate objectives. An adaptive interface alone establishes none of them.

## Approval gates

| Gate | Requirement | Permitted next work |
| --- | --- | --- |
| A | Documentation bootstrap complete; user sends their next message | Discuss Stage 1 product design. A reply such as “continue” authorizes discussion only. |
| B | Agreed direction captured in reviewable product, architecture, measurement, implementation, and acceptance documents; user explicitly approves starting Stage 1 implementation | Write application code in small, testable milestones within the approved scope. |
| C | Agreed checks run, actual results and limitations recorded, handoff produced, and user explicitly accepts Stage 1 | Record user acceptance separately from implementation completion and passing checks. |
| D | Stage 1 explicitly accepted | Collaboratively discuss Stage 2 using the real platform and data; agree on an investigation and assistance level. |

Explicit approval is required to start Stage 1 code. Planning, discussing an idea, approving an individual feature, or discussing a technology does not authorize implementing the whole application. The user approves product direction, scope, important architecture choices, and measurement requirements. Propose sensible defaults with tradeoffs instead of asking the user to specify every engineering detail.

Once implementation is authorized, routine work within scope needs no repeated permission. Material changes to scope, architecture, measurement semantics, external services, or cost require approval. Accounts, cloud services, public release, and deployment are not implied.

## Design collaboration

Start with the actual experience: starting a standard run, configuring practice, entering and correcting answers, ending a session, and understanding results. Discuss a few related decisions at a time, with recommendations and tradeoffs. Then resolve MVP boundaries, visual direction, storage/account needs, and measurement behavior. Do not silently add optional session formats.

Keep arithmetic content, session format, and selection policy conceptually separate. Verify original Zetamac mechanics before claiming exact compatibility or score comparability; matching operand ranges alone is insufficient.

## Technical and research safeguards

- Preserve reconstructable question-level observations, including unfinished work. Derive scores and aggregates from these records. Resolve exact semantics in the [data contract](docs/stage-1-ai/DATA_CONTRACT.md) before coding.
- Distinguish wall-clock metadata from elapsed time; define presentation, first input, answer acceptance, pause, and focus-loss behavior. First-input latency is not pure mental calculation time.
- Verify exact arithmetic and input semantics, including decimals, signs, division, boundaries, partial input, corrections, and answer equivalence. Avoid floating-point artifacts in correctness labels.
- Plan seeded generation with configuration and generator version. Keep the standard benchmark nonadaptive. Record policy identity/version; only record selection probabilities when a policy actually defines them. Do not invent probabilities or assume incomplete logs support retrospective comparisons.
- Separate generation, session execution, validation, persistence, observations, descriptive analytics, and selection. Prefer one coherent project unless requirements justify more services or repositories. Do not build a generic machine-learning framework in Stage 1.
- Provide an inspectable export. Limit telemetry to arithmetic interaction; exclude global keylogging, unrelated personal information, and third-party tracking. Discuss storage, deletion, and public-use requirements before release.
- Run the agreed [acceptance checks](docs/stage-1-ai/ACCEPTANCE.md). Trace at least one full session from generation through observations to displayed and exported results. Never claim an unrun test passed.
- In Stage 1, exclude predictive models, automated pattern discovery, confidence claims about discovered patterns, personalized training policies, and an AI coach.
- Preserve the [Stage 2 evaluation guardrails](docs/stage-2-user/EXPERIMENTS.md). Associations are hypotheses; prediction accuracy is separate from learning benefit. Do not preselect a model family or invent users, effect sizes, results, or portfolio claims.

## Maintain the workspace

Keep proposed, approved, implemented, verified, and user-accepted statuses distinct. Update project state and relevant decision entries at meaningful checkpoints, recording actual authorization and evidence. Cross-link authoritative specifications instead of duplicating detailed requirements. Rewrite affected documents when decisions change so future agents can resume without guessing.

Preserve existing work and respect filesystem instructions. Recommend the smallest credible implementation that preserves the research opportunity, and challenge unnecessary complexity or unsupported claims.
