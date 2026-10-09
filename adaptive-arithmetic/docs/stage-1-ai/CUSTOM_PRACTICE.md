# Custom practice — approved implementation slice

The user explicitly requested implementation of the custom-practice controls plan and selected displayed visual option 1 on 2026-10-08. This authorizes the editor, exact generator, local preset persistence, and a working custom-practice session. It does not authorize the entire remaining Stage 1 backlog or Stage 2. The selected visual is `../../design/selected-editor.png`.

## Configuration contract, version 1

`Config` contains versioned operations and groups, exact percentage strings, exact decimal range strings, per-range precision, subtraction sign rules, and separate session settings. The TypeScript types in `web/src/domain.ts` and matching Python models in `server/app.py` implement this contract. Operation identities are the four arithmetic operations; group identities survive preset edits and are replaced when a group is duplicated.

- Operation shares total 100%; groups within each positively weighted operation total 100%. Percentages are converted exactly to integer hundredths of a percent. A zero-share operation/group cannot be selected. Effective group share is the product of the two probabilities.
- Addition, subtraction, and multiplication use ordered first/second displayed operand ranges. Division uses first=divisor, second=answer and displays `(divisor × answer) ÷ divisor`.
- Ranges are inclusive grids with steps of `10^-decimalPlaces`, with independent precision 0–3. Bounds must fit the grid; trailing zeroes are equivalent. Negative bounds are permitted. Nonnegative subtraction filters ordered pairs without swapping operands. Division omits zero divisors. Output answers can have more decimal places than an individual operand, particularly products.
- Sampling is uniform over valid ordered pairs. Nonnegative subtraction uses prefix counts and rank selection, without rejection over impossible pairs. Repeats and overlapping groups remain eligible; questions retain their source group.
- New operations/groups have 0% when others already exist and 100% when first. Duplicate groups receive a new identity and 0%. Removal does not renormalize. Explicit equal-split actions distribute leftover hundredths in display order.
- Timed duration is a positive whole-second string representable as a safe JavaScript integer. Endless mode retains but does not use the duration. Countdown defaults off and lasts three seconds when enabled. The fallback setup is two-digit addition, timed for 120 seconds.
- Configuration and preset writes are validated on both browser and API. Start is disabled for invalid configuration. Every session stores its full immutable snapshot independently of preset records. Preset deletion never deletes sessions.

## Scoped runtime and persistence

One project: a React/TypeScript Vite client in `web/`, a FastAPI API in `server/`, and SQLite in ignored `data/arithmetic.sqlite3`. Both servers bind to loopback. The selected Product Design starter is preserved; no hosting or public release has been requested. Python dependencies are isolated in `.venv`.

API: `GET /api/setup`, `PUT /api/last-config`, preset POST/PUT/PATCH/DELETE, session POST, append-only observation POST, and session GET. Duplicate observation sequences are idempotent when their contents match and rejected when they conflict. Foreign-origin browser requests are rejected. [Response timing and exports](TIMING_EXPORTS.md) adds derived session reads and JSON/CSV download endpoints.

## Current observation semantics

These make the implemented custom-session behavior inspectable. The approved [timing/export contract](TIMING_EXPORTS.md) now defines its metrics, incomplete-data interpretation, and download formats.

- The browser uses `performance.now()` relative to the first question's React layout commit. This is an observable render commit, not a verified physical screen-presentation timestamp or pure cognitive latency. Wall-clock ISO timestamps are separate metadata.
- Questions record exact displayed operands/answers, sequence, group, seed, configuration, `exact-grid-v1` generator identity, and `hierarchical-shares-v1` policy identity. Selection records contain actual operation/group shares and valid-pair count.
- All answer-field changes record raw value, input type, question identity, sequence, and elapsed time. Incomplete and unmatched input is editable; it is not an explicit wrong attempt and no accuracy percentage is inferred. Exact numeric equivalence accepts signed/plain decimal notation, including equivalent trailing zeroes; exponents and grouping separators are not accepted.
- Correct input advances immediately. Timed cutoff is exclusive: at or after the deadline, an answer cannot be accepted. Timeout end elapsed time is the configured deadline. No pause or skip controls exist.
- Window blur, hidden document, page exit, manual end, or timeout ends the session once and preserves the current presented unfinished question. Questions generated but not yet presented are not reported as unfinished observations.
- Focus monitoring starts with the Start action, before asynchronous persistence/session creation. If focus/visibility is lost during creation, the resulting session ends once at zero practice elapsed time with no question presentation, even if focus returns before the response. The run also checks current focus before presentation and through countdown. Any terminal action at/after an active timed deadline records timeout at that deadline; countdown has no active deadline.
- Observation batches are serialized and persisted during practice and at termination. An arithmetic-only browser journal protects unacknowledged data and is cleared after successful terminal persistence. On abrupt reload recovery, the last observed elapsed time is retained and `endTimeKnown:false` explicitly identifies unknown end timing. Recovery is not session resumption.
- Browser Web Locks establish ownership per session within the journal's origin. An active run keeps ownership through queued writes; another tab recovers only after ownership is relinquished or its page disappears. Recovery reads the database, validates identical overlapping observations, and keeps the longer contiguous prefix before finalizing. Malformed or genuinely conflicting journals remain retained with a dedicated retryable error and do not block other journals. A late conflicting append is re-read up to three attempts; an unacknowledged synthetic recovery end is not inserted into the journal. Failed starts, real unmounts, page exit, and StrictMode remounts have explicit guard/ownership cleanup.
- Saved results use backend-derived completed count, median/mean correct-answer times, and per-question first-input times, with JSON/CSV downloads, as defined in [TIMING_EXPORTS.md](TIMING_EXPORTS.md). Times include input and corrections. No learning-benefit, adaptive-policy, or benchmark-comparability claim is made.

Ownership requires Web Locks (tested in Chrome on loopback); browsers without it show an explanation instead of starting an unsafe run. If journal writes fail, the in-memory log still attempts database persistence and the UI asks the user to keep the page open. If that page exits before acknowledgement and an unrecorded unload request arrives after recovery finalization, full preservation cannot be guaranteed by the current append-only protocol. Existing database observations and genuinely disagreeing journal observations are never silently overwritten. Cross-origin browser journals and other browser engines were not exhaustively tested.

## Verification

Authoritative actual check results and limitations are recorded in the acceptance and handoff documents and project-root `design-qa.md`. Verification fixtures are synthetic software tests, not user performance evidence. Full Stage 1 completion and user acceptance remain separate from this slice.
