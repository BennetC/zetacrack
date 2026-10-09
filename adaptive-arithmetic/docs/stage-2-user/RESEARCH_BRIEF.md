# Stage 2 — Research Brief

Status: Not started. Investigation areas are recorded for later discussion; no methodology or algorithm is selected. Stage 2 design follows explicit Stage 1 acceptance. See [project state](../PROJECT_STATE.md).

## Ownership

The user personally investigates, designs, and implements the substantive mathematical, statistical, and algorithmic learning system. The agent defaults to research assistant, tutor, critical reviewer, and collaborator. Narrow implementation help requires an explicit request; do not turn this phase into an autonomous AI implementation sprint.

## Three distinct objectives

| Objective | Central question | Evidence boundary |
| --- | --- | --- |
| Predict performance | Can available information predict future question/session performance? | Prediction quality alone does not establish a real causal relationship or improved learning. |
| Investigate patterns | Is an apparent relationship reliable, and what explanations remain plausible? | Observed associations are hypotheses; discovery and confirmation need distinct evidence. |
| Improve future ability | Does a training approach improve later ability relative to an appropriate comparison? | Success on adaptively selected training questions alone does not demonstrate benefit; preserve independent fixed-distribution assessment. |

An adaptive interface establishes neither statistical validity nor learning improvement. Claims must match the objective and available evidence.

## Example hypothesis

The user might answer multiplication-by-12 questions faster after addition than after difficult three-digit subtraction. This is a candidate sequential-effect hypothesis, not a finding or proof of causation. Question difficulty, typing demands, session position, fatigue, practice, and chance may explain the difference.

The future system should investigate whether such patterns are real before using them to design training. No effect size, model, or preferred intervention is assumed.

## Later discussion topics

Possible areas include performance estimation, sequential effects, uncertainty, controlled probing, exercise selection, and evaluation of learning outcomes. These are investigation areas, not an approved research plan.

After the real [Stage 1 handoff](../stage-1-ai/HANDOFF.md), discuss which focused question matters first, what the retained data can support, which additional observations or controls would be needed, and how much assistance the user wants. Keep a nonadaptive baseline and transparent uncertainty in view without preselecting neural networks, reinforcement learning, or another model family.

Use [EXPERIMENTS.md](EXPERIMENTS.md) for evaluation guardrails and future records. The user's own sessions can support debugging and individual investigations; they do not alone establish benefit for other users. Do not invent findings, users, results, or portfolio claims.
