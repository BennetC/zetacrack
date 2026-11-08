# Response timing and session exports

Status: Explicitly approved by the user's “PLEASE IMPLEMENT THIS PLAN” on 2026-10-09, implemented and verified. This extends [custom practice](CUSTOM_PRACTICE.md); it does not complete all Stage 1 or establish user acceptance. Evidence: [acceptance](ACCEPTANCE.md).

## Measurement contract

New clients submit `measurementVersion: "response-timing-v1"`. The metadata is nullable: older clients omit it and historical sessions retain null. The additive SQLite migration never rewrites historical configurations or observations. Legacy timings can remain usable, with a warning that their semantics are not certified as v1.

The browser uses monotonic `performance.now()` relative to the first question's React layout commit. Each question presentation is recorded in a layout effect. This measures an observable rendering event, not physical screen presentation. Countdown and pending Start precede the clock origin. Wall-clock timestamps locate events; they never drive elapsed-time subtraction.

| Field | Definition |
| --- | --- |
| `correctAnswerTimeMs` | Acceptance elapsed time minus presentation elapsed time. Main response-time metric, including entry and corrections. |
| `firstInputTimeMs` | First answer-field change elapsed time minus presentation elapsed time. Typing, deletion, and paste count, including a change to an empty string. Null without an observed change. |
| `observedUnfinishedDurationMs` | Terminal elapsed time minus presentation, or latest persisted observation minus presentation for an ongoing session. Invalid intervals are null. |
| `unfinishedDurationIsLowerBound` | True when the actual end is unknown or the session is ongoing; false for an observed end. Null for completed questions. |
| `acceptedInput` / `lastInput` | Raw accepted value and last field-change value. Missing is null; an observed empty string is retained. |
| `inputChangeCount` | Recorded field changes for the presentation. Edits are not incorrect attempts. |

Arithmetic remains exact decimal strings. Timings retain raw precision in SQLite, reads, and exports; only UI seconds are formatted to two decimal places. Zero milliseconds is valid. Neither metric is pure calculation speed; no accuracy percentage is inferred.

Exact-decimal whitespace/ASCII grammar is shared across the browser and backend as specified in [DATA_CONTRACT.md](DATA_CONTRACT.md). BOM-prefixed clipboard answers accepted live remain valid in saved metrics/comparisons/exports; original raw input stays unchanged.

One backend [derivation function](../../server/measurements.py) supplies session reads, saved results, and both exports. Median and mean use valid completed `correctAnswerTimeMs` only. An even median averages the central pair. No eligible observations yields null and UI “—”. Counts distinguish presented, correct, unfinished, and valid timed correct questions.

Exact automatic advancement, focus-loss ending, and exclusive deadlines remain intact. Input/acceptance at or after a timed deadline is excluded. A generated next question that never reaches presentation produces no derived row.

## Incomplete and inconsistent records

Raw events remain ordered by sequence without rewriting. Every presentation produces a derived record/CSV row, including malformed/duplicate presentations. Operation/group versions and names resolve through the original configuration; observed selection context is retained. Missing provenance receives a warning rather than an invented identity.

`dataQualityWarnings` include machine-readable codes, messages, and event sequences where available. Gapped sequences, decreasing/invalid elapsed times, duplicate identities, invalid current-question references, repeated starts, observations following termination, and events at the exclusive deadline invalidate affected intervals. Invalid clock/order taints the affected question and later intervals; earlier independently completed observations can remain eligible. Missing exact arithmetic and unsupported identities are null in derived fields, with original values retained in raw events. The complete platform additionally validates exact arithmetic, permitted accepted input and current mode/content provenance; inconsistent affected response timings are null with warnings. Legacy missing accepted strings can retain usable unversioned timing.

Current means an unfinished presentation. A completed question stops being current at acceptance, so a later gap does not erase its independently observed interval. Stale/missing/unknown references taint the current and later intervals, rather than the earlier question named by a stale reference. Malformed field values and unsupported indices invalidate the affected question; invalid raw field events do not certify first-input time. Reads, saved results, exports and partial graphs share these decisions.

`terminationState` is `ongoing` without termination, `ended` for an observed actual end, and `incomplete` for unknown-end recovery or an ended status lacking termination. Conflicting stored status receives a warning. Live exports use persisted observations only, without extrapolating from current wall time.

Recovery's `endTimeKnown: false` means raw `wallAt` locates recovery, not the actual end. Derived `endedAt` stays null. Unfinished duration is a lower bound; no end timestamp is invented. Ownership and immutable-prefix recovery remain as specified in [CUSTOM_PRACTICE.md](CUSTOM_PRACTICE.md).

## Interface and reads

Results load the backend summary after successful final persistence. Failed loading offers **Retry summary**, independently of **Retry save**. Details show correct-answer/unfinished duration, first-input time, and unfinished last input. Result export buttons are disabled until the save succeeds.

Setup has **Export all sessions**, with JSON/CSV buttons beneath its controls. Downloads read persisted records only and do not end or recover another tab's session. Export failures show an error; the same button retries.

| Endpoint | Response |
| --- | --- |
| `GET /api/sessions/{id}` | Existing metadata/events plus nullable measurement version, termination metadata, derived `questions`, `summary`, and warnings. |
| `GET /api/sessions/{id}/export?format=json\|csv` | Download of one session; missing identity is 404. |
| `GET /api/exports/sessions?format=json\|csv` | All persisted sessions, ordered by creation time then identity. |

Missing/unsupported formats return 422. Downloads use attachment filenames and `Cache-Control: no-store`. Every read/export explicitly begins a SQLite read transaction before selecting sessions and their observations. Concurrent WAL appends cannot mix old metadata with newer events. Export endpoints have no persistence/recovery side effects.

## JSON v1

The UTF-8 envelope contains `exportVersion: 1`, UTC `exportedAt`, `timingDefinitions`, and `sessions`. Each session contains its original complete configuration, seed, generator/policy/measurement versions, ordered raw events, derived questions, summary, quality warnings, and identity/status/termination metadata. Preset updates, renaming, and deletion cannot change historical meaning. Zero-presentation sessions remain included; empty history has `sessions: []`.

## CSV v1

UTF-8 comma-separated CSV uses standard quoting and CRLF record separators. One row represents each presentation. Zero-presentation sessions yield no rows; empty history is header-only. CamelCase column order is defined by [CSV_FIELDS](../../server/measurements.py):

```text
sessionId,createdAt,startedAt,endedAt,status,terminationState,terminationReason,endTimeKnown,sessionFormat,durationSeconds,countdown,measurementVersion,mode,contentVersion,cohortKey,score,scoreState,comparisonEligible,seed,generatorVersion,policyVersion,questionId,questionIndex,presentationSequence,operation,operationVersion,groupId,groupVersion,groupName,left,right,expected,outcome,presentedElapsedMs,firstInputElapsedMs,acceptedElapsedMs,correctAnswerTimeMs,firstInputTimeMs,observedUnfinishedDurationMs,unfinishedDurationIsLowerBound,inputChangeCount,acceptedInputJson,lastInputJson,selectionJson,dataQualityWarningsJson,configJson
```

Null is an empty CSV cell; booleans are `true`/`false`. `acceptedInputJson` and `lastInputJson` contain JSON-encoded strings before CSV quoting, preserving whitespace, empty input, Unicode, quotes, commas, and arbitrary text. JSON string `""` means an observed empty input and differs from a null cell. `selectionJson` preserves observed provenance; `dataQualityWarningsJson` includes session warnings; `configJson` repeats the complete original configuration. Exact operands/answer are written as decimal strings without floating-point conversion.

## Verification and boundaries

Checks cover distinct first-input/acceptance times, real typing/deletion/paste, zero/raw-precision intervals, odd/even/empty summaries, unfinished input, unknown-end recovery, invalid ordering, additive legacy migration and usable legacy timings, empty/no-question exports, Unicode/raw-input CSV encoding, immutable preset snapshots, concurrent SQLite appends, results/export agreement, save/load/export failures and retries, countdown exclusion, and background exports of a live owned run. Existing arithmetic, persistence, recovery, browser, typecheck, and build checks pass; [acceptance](ACCEPTANCE.md) links actual evidence.

[PLATFORM.md](PLATFORM.md) now completes local history, original standard question content, descriptive graphs/cohort eligibility and protected retention/deletion under D-017. Accounts/cloud release and substantive Stage 2 learning remain excluded. These observations do not establish pure calculation speed, learning benefit, or benchmark equivalence.
