# Task 499 activity recovery — 2026-11-05

The user explicitly requested recovery and logging of actual time and token usage after the duration-free activity report. The unknown report was a logging gap: local Codex session files retain observed timing and usage. Hosted connector limitations do not establish absence of local evidence.

## Recovered scope

Seven closed turns were selected: two implementation/closure turns in the original chat, four actual turns of the original reviewer, and one fresh closure-review turn. Earlier feature-planning and reminder turns, inherited copies in child histories, response gaps, and the current open recovery turn are excluded from AI effort. The source scanner respects the child-history boundary; copied parent records are not counted again.

Actual JSONL identities map to the already registered implementation and reviewer runs using the parent chat plus observed agent-path metadata. No other chat's attempt is resumed or impersonated. Local evidence is retained under ignored `data/task499-activity-recovery/`: a content-free source plan, exact selected turn identities, source summaries and API receipts. No raw conversation, commands or credentials are included in imported evidence.

## Timing saved to Orbit

The deployed authenticated v1 reimport contract attached observed source intervals to existing run195 (implementation), run198 (original reviewer) and run201 (fresh reviewer). It created seven AI-work segments and four separate response-gap records. Readback shows **3,041 seconds / 50m41s of source-observed combined agent effort**, no human work, and no estimated or user-reported duration. Response gaps do not enter this total. Parallel reviewers overlap the parent; the union of work intervals is **2,252 seconds / 37m32s**.

The app also retains exact `duration_ms`: parent 2,252,685ms, reviewers 788,383ms, combined 3,041,068ms. These app measurements are distinct from the whole-second source boundaries accepted by this deployed accounting route. Neither measurement isolates CPU/model-active time: intervals include in-turn tools and waits. No duration is inferred from Orbit registration timestamps.

Source reimport operation keys are stable per actual session. Runs remain finished; task499 remains completed at its original timestamp `2026-11-05T18:50:43.530637+00:00`; verification25 remains passed and review503 completed. Activity report12 is retained but **excluded at revision2** as superseded, avoiding a remaining unknown-report placeholder or duplicate effort. Older hosted declarations may still expose unknown flags; the measured source intervals themselves are present and verified in v1 task activity.

## Tokens recovered locally; import blocked

The typed source plan contains **33,199,500 observed token-counter deltas**: 33,112,833 input, including 32,901,888 cached input; 86,667 output, including 25,178 reasoning output. Cached input is a subset of input, and reasoning output is a subset of output; these components must not be added twice. Coverage is **partial**, because first per-turn counter baselines and resets are not treated as new charges. This is observed evidence, not an estimate or a claim of complete billed usage.

The canonical typed preview endpoint accepted the evidence and returned reviewed source/target fences. The typed write at `/api/v2/agent-evidence/batches` returned HTTP404/not_found; **zero partitions and zero token facts were persisted**. Existing connector capabilities report no token writes; the newer task-bound collector/context routes are not deployed on this instance. No import gate, configuration, consent or deployment was changed. Token values were not placed in task text or report metadata as a workaround.

The reviewed normalized evidence remains locally ready for the supported typed ingestion path when available. Token statistics in Orbit therefore remain unknown; this recovery is complete for closed-turn source timing and incomplete for token persistence. The currently open recovery turn is not finalized or claimed as automatically collected.
