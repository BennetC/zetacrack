# Independent run-explorer review — 2026-11-05

Implementation task: Orbit 499. Review task: 502. Initial verification attempt: 24.
Reviewer runtime identity: `/root/analytics_reviewer`, namespaced under parent chat `01a1a87e-a0e7-75a1-a052-e2c23296e31a`; registered run `01a1a87e-a0e7-75a1-a052-e2c23296e31a-root-analytics_reviewer`, initial worker attempt 25.

Initial verdict: **failed; rework required**. No implementation files were edited by this reviewer. Existing uncommitted changes predate this feature; review focuses on the run-explorer additions and their contract in `docs/stage-1-ai/RUN_EXPLORER.md`.

## Reproduced findings

### RE-01 — medium: accepted questions include later rejected input in replay and revision totals

`server/run_analytics.py` scans every matching `input-changed` event from a presentation until the next presentation. It does not stop at acceptance or a terminal event. An additional input after a correctly accepted answer is rejected by the canonical measurement derivation, while the independently completed earlier interval remains valid. The explorer nevertheless attaches that later input to the completed question.

Independent isolated API probe: valid standard q0 accepted at 1000ms; append a matching deletion at 1001ms before presenting the next question at 1002ms. Canonical `inputChangeCount` remains 1 and valid `correctAnswerTimeMs` remains 1000. Explorer reports `inputChanges=2`, a spurious revision episode, and replay frames at 1000 and 1001ms, extending beyond the accepted response. Bound interaction reconstruction to the canonical current-question lifetime; retain malformed raw observations for inspection rather than incorporating them into completed metrics.

### RE-02 — medium: retained damaged clocks can crash history and export reads

The edit-pattern heuristic checks `number(at)` but only checks `last_at is not None` before subtracting `at - last_at`. A preceding malformed clock value therefore raises `TypeError` even though the canonical measurement derivation correctly retains the damaged observation and nulls affected timing.

Independent in-memory probe: replace a raw input elapsed time with string `bad`, followed by a numerically timed deletion/revision. `enrich(derive_session(damaged))` raises `TypeError: unsupported operand type(s) for -: int and str`. Since every session read enriches records, retained damaged data can now break history/graphs/exports. Check both clock operands before arithmetic, and preserve invalid timings as null.

### RE-03 — medium: fractional final split can drop a valid completion

`range(0, int(duration), width)` truncates the floating browser duration before deciding the last split's existence. If a manual/endless run ends a fraction of a millisecond after a split boundary, the final partial window is absent.

Independent probe: valid acceptance at 15000.1ms, known manual end at 15000.2ms. Explorer summary reports one completed answer, but the only split has count zero. Generate windows against the unrounded observed duration, preserving the fractional last window and the contract's end-boundary rule.

## Checks and limits

Targeted test command: `.venv/Scripts/python.exe -m pytest -q tests/test_run_analytics.py tests/test_review_fixes.py tests/test_measurements.py`. Separate independent probes used temporary synthetic databases or in-memory copied sessions. Normal user data and existing services were untouched. No browser suite was run concurrently with the parent's browser verification.

Orbit capabilities expose lifecycle start/checkpoint/review but not source-evidence preview/record/collection tools, local-session import or typed token ingestion. Parent confirms local source timing exists; no verified automatic collector is attached to this review runtime. The review's duration remains unknown and its current turn provisional; no timing or token value was invented or relabelled.

Repairs and independent recheck remain pending at this initial verdict. A passing finish receipt alone will not be treated as proof of complete activity telemetry.

## First repair recheck

Registered independent review task 503, verification attempt 25, reviewer attempt 27 under the same distinct reviewer runtime identity.

RE-01, RE-02 and RE-03 are independently reproduced as repaired: post-acceptance input no longer affects a completed question; malformed clock operands retain null timing without an exception; and a 15000.2ms end retains the completion at 15000.1ms in a fractional final window. The targeted 60 backend tests and two frontend explorer tests passed. Source inspection also confirms cursor-relative edit stepping, finite bounded target pace and nullable unavailable composition metadata; known composition input suppresses typo hypotheses.

Recheck verdict: **failed for one additional durable-creation regression**.

### RE-04 — medium: deleting a source run strands an already-created challenge retry

The challenge source is validated before the existing immutable creation-key lookup in `server/app.py`. If the original creation succeeded but its response was lost, the user has a pending exact request. Another page can legitimately delete the closed source run. Retrying the original request then returns 422 even though its child challenge already exists.

Independent temporary-database probe: create a completed source; create challenge with a creation key (201); delete closed source (200); retry the identical challenge request (422); read the already-created child (200). This violates durable retry's original-session return guarantee and can strand the pending start. Check existing immutable creation-key identity before validating source existence for a genuinely new creation, within the same write transaction. A changed request using that key must still conflict.

No browser suite was run by this reviewer during this recheck. Parent's six updated browser scenario groups and full regression evidence remain separately identified. No raw records, normal data or implementation files were changed by the review.

The RE-04 failed-verdict write is **not saved**: Orbit returned HTTP 500 on three identical requests from waiting revision 2 and again on three identical requests after resuming active at revision 3. Readback retained task 499 `review_pending` and review task 503 active; the reviewer attempt was checkpointed waiting for repair/reporting recovery. This is an external reporting failure, not a completed verification or an approval rejection.

## Final focused repair recheck

RE-04 is independently verified repaired. Existing immutable creation-key lookup now precedes new-source validation within the serialized transaction. The original reproduction now returns the existing challenge after deleting the source, rejects a changed seed under the same key with 409, and permits a new challenge continuing from the surviving child. Reload and Run again link the immediate surviving challenge while retaining the seed and benchmark exclusion. The permanent backend regression includes source deletion, identical retry, changed-request conflict and continuation.

Independent focused rerun: **13 backend tests passed** (`test_run_analytics.py` plus `test_next_improvements.py`), with the known dependency deprecation warning. The separate original API reproduction also passes. Earlier independent checks covered 60 targeted backend tests, two explorer frontend tests, the three original reproductions, cursor-relative stepping, bounded finite target input and nullable composition metadata. The reviewer did not modify implementation or normal data.

Technical verdict: **passed; RE-01 through RE-04 closed**. Parent reports that registration of the last focused worker repair returned backend validation 400 while the original remained `review_pending`; that start is unsaved, and previously authorized repair work continued under the skill's reporting-failure rule. The earlier unsaved failed-verdict attempts remain historical reporting failures. Final passing verdict receipt and readback must be checked separately; no complete telemetry claim is made. Duration and token source evidence remain uncollected on this connection and no automatic collector is verified.

Final passing verdict is also **unsaved**: three identical `submit_ai_task_work_review` requests from reviewer attempt 27 revision 5 returned HTTP 500. Readback retained original task 499 `review_pending` (revision 10), review task 503 active and reviewer attempt 27 active at revision 5. The reviewer then checkpointed waiting for reporting recovery. Technical verification is complete; Orbit completion is not recorded. Do not substitute generic task completion for the failed review write.
