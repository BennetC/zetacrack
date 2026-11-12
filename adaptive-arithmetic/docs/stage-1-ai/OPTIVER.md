# Optiver 80 in 8

Authorized on 11 November 2026: the user supplied [QuantPrep’s introduction](https://quantprep.io/mental_math_optiver_intro) and requested a matching, distinct play mode with its own analytics. This is a focused practice-platform addition; Stage 2 learning work remains separate.

## Reference and fidelity

The live introduction and [public test](https://quantprep.io/mental_math_optiver) were inspected in Chrome on 11 November 2026, including the exposed test configuration, 80-question trial and interaction script. The observed format is 80 sequential questions, eight minutes, four answer buttons, +1 correct / −1 incorrect / zero unanswered, and a 56-point practice target. Either choice advances after approximately 100ms of feedback. There is no skip/back control, and the timer continues when the browser loses focus. The test ends on question 80 or time expiry.

The implementation preserves that flow and the broad question-panel/four-choice layout within the app’s approved Inter/white/blue visual grammar. It uses fresh, deterministic local operands and distractors. It does not reproduce the site’s branding, subscriptions, tracking or unseen premium bank. The official assessment’s current question distribution and hiring cutoff have not been verified; 56 is explicitly a **QuantPrep practice target**. External score equivalence is not claimed.

The public trial’s ordered question-family profile is stored in `shared/optiver-profile.json`: 29 integer, 27 decimal, 24 fraction questions; 23 addition, 20 subtraction, 18 multiplication, 19 division questions; 44 missing results, 21 missing left operands, 15 missing right operands. The profile is fixed; numeric content and choice order vary with the seed. Fractions include improper and mixed-number displays. All equations, rational equivalence and choice uniqueness use integer rational arithmetic. Distractors include nearby values, place-value errors and fraction reciprocals. No operation/group selection probabilities are invented for this fixed profile.

## Runtime and persistence

Mode `optiver`, content `optiver-80-in-8-v1`, generator `optiver-rational-v1`, policy `optiver-profile-v1`, measurement `choice-response-v1`. The backend enforces the fixed 480-second configuration and mode-specific provenance. Custom memory and presets remain independent. No database schema change is needed: the existing nullable mode/content/version columns and append-only event table accommodate this addition. Old observations/configurations are not rewritten.

Start uses the existing durable creation key and Web Lock ownership. The timer begins with the first question’s layout commit. The deadline is exclusive: submissions at/after 480000ms are refused and the terminal event is clamped to 480000ms. There is no pause. Focus loss keeps Optiver running; Standard and Custom retain their original focus-loss termination. Navigation, manual ending and page exit preserve partial observations. Reload starts a fresh seed/identity with the same mode/configuration; same-seed challenges retain their explicit exclusion. Ordinary visits to setup, History or analytics never start tests.

Each presentation retains the exact left/right/result equation, missing position, family, four displayed options and expected value. A choice produces one `answer-submitted` event with question ID, option index, exact displayed value and monotonic elapsed time. Correctness comes from exact rational equality in the backend, never a client-reported correctness flag. A synchronous guard and disabled buttons prevent double submission during feedback. Mouse, Tab/Enter and keys 1–4 work; modifiers and key repeat do not submit extra answers. Feedback/presentation gaps remain part of total test time.

Browser journals accept choice events. Recovery retains immutable prefixes, including wrong answers, and does not relabel an already-submitted question as unfinished. Existing save failure/retry, ownership, page-exit beacon and pending-start behavior are reused. Complete preservation still has the documented browser-journal/unacknowledged-exit limits.

## Measurements and analytics

For this mode, `expected` is the missing value, not necessarily the equation’s right-hand-side result. The original complete equation and missing position are in `optiver`. Consumers must use the mode-specific derivation rather than typed-answer arithmetic assumptions.

`responseTimeMs` is submission minus presentation for a valid choice, whether correct or incorrect. `correctAnswerTimeMs` remains limited to correct choices. First-input timing is null: choices are not typed-answer edits. These measurements include reading and choosing; layout commits are not physical screen measurements.

Net score is correct minus incorrect and can be negative. Attempted counts both submitted outcomes; unanswered is 80 minus attempted, including unseen questions. Accuracy is correct/attempted, with null for no attempts. Ending after all 80 valid choices before the deadline and timing out at exactly eight minutes are both complete tests. A known end, matching versioned rules, sequential valid profile/choices, valid response timing and consistent observations are required for benchmark eligibility. Challenges, partial/unknown-end runs and invalid traces remain inspectable but are excluded. A pass verdict is null for excluded runs.

The distinct Optiver analytics route/API shows best/mean net score, practice pass rate, pooled accuracy, correct/wrong/unanswered counts, response times for all choices, net-score chronology, operation/family/missing-position breakdowns, minute-by-minute pace and saved-test review links. Date filters and Back/Forward are URL-persisted. All benchmark metrics use eligible Optiver tests exclusively. Empty, invalid-date, loading, failure/retry and partial-only states are explicit. General History has an Optiver filter, and general Graphs preserve separate cohorts and support negative scores.

Saved details/results include filterable correct/incorrect/unanswered answer review and all four original choices. JSON retains complete immutable events/configuration/derived values; versioned `measurementDefinitions` distinguish choice and typed-answer semantics in mixed exports. CSV adds `optiverSummaryJson`, `optiverQuestionJson`, `responseTimeMs` and `selectedOptionIndex`. The typed run explorer is not applied to choice-test answers.

Verification and practical limits are recorded in [the implementation report](../reviews/2026-11-11-optiver-verification.md). Implementation verification and user acceptance remain distinct.
