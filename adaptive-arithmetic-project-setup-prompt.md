# Adaptive Arithmetic — Project Setup and Working Agreement

You are my development agent for a new adaptive mental-arithmetic project. Establish a durable Markdown workspace first, then collaborate with me through the two development stages below.

**Your task in this first interaction is documentation setup only. Do not ask me questions, begin the product-design discussion, or implement the application. Create the workspace, report what you created, and stop.**

## 1. Project context

I want an arithmetic trainer that is enjoyable to use, improves my own arithmetic ability, and can become a credible technical portfolio project.

The product has two arithmetic environments:

- **Zetamac-style arithmetic:** familiar rapid arithmetic, a fixed standard benchmark preset, timed runs, scores, and performance history. Verify the original mechanics before claiming exact Zetamac compatibility; do not assume matching operand ranges alone makes scores comparable.
- **General/custom arithmetic:** configurable operations and operand ranges, multi-digit calculations, decimals, and focused practice such as multiplication by 11 or 12 or two-digit addition/subtraction. Support timed and endless practice. Discuss optional session formats rather than silently adding them to the required scope.

The eventual differentiator is a learning system that discovers individual performance patterns, investigates whether they are real, and uses the findings to design training.

Example: a user might solve multiplication-by-12 questions faster after addition than after difficult three-digit subtraction. The system should eventually investigate that relationship rather than assume an observed difference is meaningful or causal.

Distinguish three eventual objectives: predicting performance, investigating patterns, and improving future ability. They are not interchangeable. Neither statistical validity nor learning improvement is established merely by building an adaptive interface.

## 2. Exactly two development stages

### Stage 1 — AI implementation phase

You will implement the arithmetic platform after we discuss and approve its product design and implementation plan.

Stage 1 covers the interface, arithmetic generation, standard/custom modes, timed/endless sessions, scoring, persistence, descriptive analytics, exportable question-level observations, tests, and the minimal integration boundary needed for a future learning engine.

I remain responsible for approving the product direction, scope, important architecture choices, and measurement requirements. You may propose sensible defaults and explain tradeoffs; do not ask me to specify every engineering detail.

**Stage 1 does not include the substantive adaptive learning system.** Do not implement predictive models, automated pattern discovery, statistical confidence claims, personalized training policies, or an “AI coach.” Fixed and random selection policies are sufficient for this stage.

### Stage 2 — My implementation phase

I will personally investigate, design, and implement the learning system. This is the main mathematical, statistical, and algorithmic component I want to own.

Your default role is research assistant, tutor, critical reviewer, and collaborator. Explain approaches, challenge assumptions, help design experiments, and review my work. Implement narrowly scoped pieces only when I explicitly ask. Do not autonomously build the learning engine or turn this phase into another AI implementation sprint.

Possible topics include performance estimation, sequential effects, uncertainty, controlled probing, exercise selection, and evaluation of learning outcomes. These are investigation areas, not preselected algorithms or an approved research plan.

The Markdown bootstrap is preparation for these stages, not a third development stage.

## 3. First interaction: create the Markdown workspace only

Create a new project folder called `adaptive-arithmetic` under the current working directory, unless the environment explicitly supplies a destination for the new project. Treat this as a working name, not an approved product name.

Never overwrite existing work. If the destination is already populated, create a sibling with the next unused numeric suffix and report the actual path. Respect existing workspace instructions and filesystem boundaries.

Create this structure, using Markdown files only:

```text
adaptive-arithmetic/
├── AGENTS.md
├── README.md
└── docs/
    ├── PROJECT_STATE.md
    ├── DECISIONS.md
    ├── stage-1-ai/
    │   ├── PRODUCT_SPEC.md
    │   ├── ARCHITECTURE.md
    │   ├── DATA_CONTRACT.md
    │   ├── IMPLEMENTATION_PLAN.md
    │   ├── ACCEPTANCE.md
    │   └── HANDOFF.md
    └── stage-2-user/
        ├── RESEARCH_BRIEF.md
        ├── EXPERIMENTS.md
        └── IMPLEMENTATION_PLAN.md
```

Populate the documents with useful starting content from this prompt. Do not create empty headings or copy this entire prompt into every file. Distinguish confirmed requirements, proposals, unresolved decisions, and later work. Use relative links so the documents form a navigable workspace.

**During this first interaction:**

- Do not ask questions, including in your final reply. Unresolved topics may be recorded inside the documents.
- Do not start product-design discussion, create mockups, or choose a visual direction.
- Do not choose or install a framework, database, dependency, or hosting service.
- Do not create source files, configuration files, database migrations, notebooks, or synthetic datasets. Do not initialize Git, connect accounts, provision resources, or deploy anything.
- Do not research competing products or algorithms yet. Record verification tasks for the appropriate later stage.
- Do not fill Stage 2 with a detailed solution, selected model architecture, or implementation instructions that preempt my work.

After creation, verify that the expected Markdown files exist, their internal links resolve, and their statuses agree. Then briefly report the project path, key entry points, and that no implementation has started. State that the workspace is ready for our Stage 1 product-design discussion, **then stop and wait for my next message**.

If filesystem access is unavailable, say so plainly and provide the intended tree and file contents without claiming to have created them. The no-questions/no-implementation boundary still applies.

## 4. What each document must contain

### `AGENTS.md`

The durable operating instructions for future agents: project purpose, stage ownership, approval gates, document-reading order, technical safeguards, and how to maintain project state. Include the rule that planning or discussing an idea does not authorize implementing it. Treat bootstrap as a one-time task: later sessions resume from `PROJECT_STATE.md`, rather than recreating the project or repeating the initial no-discussion restriction.

### `README.md`

A concise project introduction, the two stages, current status, and a linked reading order. Explicitly state that the initial workspace contains documentation only. Do not invent installation commands, screenshots, completed features, or results.

### `docs/PROJECT_STATE.md`

The single source of truth for workflow status. Track current stage/activity, approvals received, completed work, unresolved blockers, next permitted action, and actions not yet authorized.

Initial state: documentation bootstrap complete; Stage 1 product design pending; product specification unapproved; implementation not authorized; Stage 2 not started. Next permitted action: discuss Stage 1 product design after my next message.

### `docs/DECISIONS.md`

A lightweight decision log with identifiers, status, decision, rationale, and consequences. Record the two-stage ownership and approval workflow as confirmed. Record technical stack, storage model, deployment, visual design, and detailed product behavior as unresolved—not decisions you have already made.

### `docs/stage-1-ai/PRODUCT_SPEC.md`

Confirmed product intent and capabilities, proposed MVP boundaries, user flows to discuss, analytics definitions to resolve, non-goals, and open product decisions. Keep arithmetic content, session format, and exercise-selection policy conceptually separate; do not duplicate the product into unrelated modes unnecessarily.

### `docs/stage-1-ai/ARCHITECTURE.md`

Required separation of responsibilities, key constraints, and decisions awaiting discussion. Cover generation, session execution, answer validation, persistence, analytics, and a replaceable selection-policy boundary. Do not select a stack, create a database schema, or design speculative infrastructure during bootstrap.

### `docs/stage-1-ai/DATA_CONTRACT.md`

A draft measurement specification: what must be reconstructable, candidate observations, timing/answer semantics, provenance, privacy boundaries, and unresolved questions. Follow Section 6. This is a draft for review, not a claim that a schema has already been approved or implemented.

### `docs/stage-1-ai/IMPLEMENTATION_PLAN.md`

A provisional dependency-aware outline, awaiting product and architecture approval. Later, each implementation milestone should state its deliverable, dependencies, acceptance checks, and explicit exclusions. Do not manufacture estimates or a large speculative backlog.

### `docs/stage-1-ai/ACCEPTANCE.md`

A draft checklist for correctness, reproducibility, input behavior, timing, persistence, analytics, data export, usability, and stage-boundary compliance. Initially mark everything as not implemented/not verified. Clearly distinguish a proposed test from one actually run.

### `docs/stage-1-ai/HANDOFF.md`

An unfilled but useful handoff structure for the actual Stage 1 result: implemented scope, architecture, measurement semantics, data export, selection boundary, how to run verified tests, limitations, and remaining issues. Do not describe planned capabilities as completed.

### `docs/stage-2-user/RESEARCH_BRIEF.md`

My ownership, the central learning-system goals, the example sequential-effect hypothesis, and questions for our later design discussion. Explicitly distinguish prediction, pattern verification, and training benefit. No prematurely chosen algorithm.

### `docs/stage-2-user/EXPERIMENTS.md`

A lightweight experiment-record template: question, hypothesis, comparison, assignment procedure, outcome, data requirements, analysis plan, limitations, and result. Record evaluation guardrails from Section 7, but leave concrete studies undecided.

### `docs/stage-2-user/IMPLEMENTATION_PLAN.md`

A deliberately short placeholder for the plan we will create together after Stage 1 is accepted. State the phase's prerequisites, ownership, and decisions to discuss. Do not generate my research roadmap in advance.

## 5. Collaboration sequence and approval gates

### Gate A — Documentation ready → Stage 1 product-design discussion

On my next message, read the workspace and begin a collaborative design discussion. Briefly restate what is settled and identify the highest-impact unresolved product decisions. Discuss a few related issues at a time, giving recommendations and tradeoffs rather than an exhaustive questionnaire.

Prioritize the actual experience: starting a standard run, configuring practice, entering/correcting answers, ending a session, and understanding results. Then resolve MVP scope, visual direction, storage/account needs, and measurement behavior.

A reply such as “continue” immediately after bootstrap authorizes this discussion, not coding.

### Gate B — Approved product direction → Stage 1 implementation

Turn the agreed direction into a reviewable product specification, architecture/data contract, implementation plan, and acceptance checklist. Resolve implementation-critical ambiguities or explicitly propose defaults for approval.

**Do not write application code until I explicitly approve starting Stage 1 implementation.** Approving an individual feature or discussing a technology is not approval to build the whole application.

Once authorized, implement in small, testable milestones. Maintain the documents at meaningful checkpoints. Routine work within the approved scope does not need repeated permission; material changes to product scope, architecture, measurement semantics, external services, or cost do.

### Gate C — Stage 1 implementation → Accepted handoff

Run the agreed checks, document actual results, explain untested areas and known issues, and produce the handoff. Distinguish implementation completed, automated checks passed, and user acceptance; these are separate statuses.

Ask for my acceptance of Stage 1. Do not mark it accepted on my behalf or begin implementing Stage 2.

### Gate D — Stage 1 accepted → Stage 2 design discussion

After I explicitly accept Stage 1, begin discussing how I should design the learning system, using the real platform, available data, and limitations as context. Do not silently select the methodology or generate its code.

Agree on a focused first investigation and on how much assistance I want. Preserve my ownership of the substantive reasoning and implementation unless I explicitly revise that division of responsibility.

## 6. Stage 1 safeguards: data and engineering

Build the platform to support later investigation without pretending the learning system already exists. Capture these requirements as drafts now; resolve their exact implementation before coding.

**Reconstructable observations.** Preserve session and question identity, sequence position, configuration, operation, operand order and exact values, expected answer, attempts/outcome, timing, and generator/selection provenance. Derive aggregates from question-level records; do not retain only scores and averages. Avoid storing redundant fields when they can be reliably reconstructed from linked records.

**Meaningful response semantics.** Define whether and when answers submit, how wrong attempts and corrections behave, what counts toward accuracy, and how skips, unfinished questions, timeouts, and interrupted sessions are represented. Do not silently discard unfinished questions and analyze only successful responses.

**Honest timing.** Distinguish wall-clock metadata from elapsed-time measurement. Define question-presentation, first-input, and accepted-answer timing, plus pause/focus-loss behavior. First-input latency is not a direct measurement of mental calculation time; typing and solving can overlap. Do not label it as pure cognitive speed.

**Correct arithmetic and input.** Test decimal representation and answer equivalence, permitted division results, signs, boundary values, partial input, and question-generation constraints. Do not let floating-point artifacts or ambiguous answer matching corrupt correctness labels.

**Reproducibility and provenance.** Plan seeded generation with recorded configuration and generator version. Keep the standard benchmark nonadaptive. Record selection-policy identity/version; leave room for genuine selection probabilities when a later policy defines them. Never fabricate probability values or assume incomplete historical logs support valid retrospective comparisons.

**Modularity, not overengineering.** Keep the game, generator, observations, descriptive analytics, and question selection separable. Prefer one coherent project with clear module boundaries unless an actual requirement justifies additional services or repositories. Do not build a generic machine-learning framework during Stage 1.

**Data access and restraint.** Provide an inspectable export suitable for my later analysis. Keep telemetry scoped to the arithmetic interaction; do not add global keylogging, unrelated personal data, or third-party tracking. Discuss persistence, deletion, and any public-use requirements before release. Accounts, cloud services, and public deployment are not implied by this prompt.

**Real verification.** Tests should cover the generator, input/scoring behavior, timers/session boundaries, reproducibility, persistence/export, and analytics consistency. At least one complete session must be traceable from generated questions through recorded observations to displayed/exported results. Never claim a test passed without running it.

## 7. Stage 2 safeguards: preserve the research problem

Record these as principles for the later discussion, not a completed methodology:

- Observed associations are hypotheses, not proof of causation. Candidate sequential effects may reflect question difficulty, typing demands, session position, fatigue, practice, or chance.
- Prediction accuracy and improved learning are different outcomes. Preserve independent, fixed-distribution assessment rather than measuring success only on adaptively selected training questions.
- Distinguish data used to discover patterns from evidence used to confirm them. Repeated testing and adaptive selection require explicit consideration.
- A nonadaptive baseline, transparent uncertainty, and modest initial hypotheses are more useful than unsupported sophistication. Do not preselect neural networks, reinforcement learning, or any other model family.
- My own sessions can support debugging and individual investigations; they do not by themselves establish benefit for other users. Do not invent findings, users, effect sizes, or portfolio claims.

## 8. Documentation discipline and execution instruction

At the start of later work, read `AGENTS.md`, `docs/PROJECT_STATE.md`, relevant decisions, and the active stage documents. Cross-link authoritative specifications rather than duplicating them. Keep proposed, approved, implemented, and verified statuses distinct. Record meaningful decisions and changes, not every minor edit.

Be critical and specific. Recommend the smallest credible implementation that preserves the research opportunity. Challenge unnecessary complexity and unsupported claims. Do not optimize for feature count or the appearance of intelligence.

**Execute only Section 3 now: create and verify the Markdown workspace using these instructions, give a brief factual completion report, and stop. No questions, no product-design discussion, and no application implementation in this first interaction.**
