# Stage 1 design QA

## Review repair inspection, 2026-10-15

The requested fixer repaired FR-01/FR-02 and C01–C03; [resolution](docs/reviews/2026-10-15-fix-verification.md) links exact checks and source. Actually inspected repaired captures: [Custom while connecting](docs/reviews/evidence-2026-10-15-fixes/targeted/01-custom-edit-pending.png), [same edits after load](docs/reviews/evidence-2026-10-15-fixes/targeted/02-custom-edit-after-load.png), [connection retry preserving edits](docs/reviews/evidence-2026-10-15-fixes/targeted/03-custom-edit-after-retry.png), [BOM answer's valid saved timing/full score](docs/reviews/evidence-2026-10-15-fixes/targeted/04-bom-clipboard-results.png), and [history survivor with truthful page bounds](docs/reviews/evidence-2026-10-15-fixes/targeted/05-history-survivor-after-cross-tab-delete.png). The selected white surface, Inter, restrained blue and left-editor/right-settings anatomy remain intact; no CSS or asset redesign was needed.

All original 37 browser checks plus 8 targeted checks pass with zero page/console errors; the original suites cover responsive/zoom/keyboard/table behavior. 95 backend, 21 frontend, typecheck/build and 4 protected packaging tests pass. React checklist: initialization callbacks guard against stale/user-newer values; retry retains component state; history suppresses transient invalid page states; native controls, cleanup and backend-only metric derivation remain. Normal preview is ready with unchanged historical tables. Independent patch recheck/human acceptance and universal assistive-technology/browser certification remain separate. Earlier QA below is historical evidence.

## Complete platform inspection, 2026-10-09

All local F01–F27 features are delivered under D-017. The approved white/Inter/restrained-blue editor remains the Custom practice surface; functional Standard/History/Graphs navigation and saved inspection use the same visual grammar. Standard offers immediate two-minute practice with readable original rules and a short runtime-difference disclosure. History exposes actual saved records, exact details/raw inputs/configuration/events and safe retention controls. Graphs plot actual backend-derived observations, with units, cohort/sample/exclusion context and equivalent native tables.

Actually inspected final captures: [Standard home](design/stage1-complete/01-standard-home.png), [empty graphs](design/stage1-complete/02-empty-graphs.png), [saved Standard results](design/stage1-complete/03-standard-results.png), [exact Custom detail](design/stage1-complete/04-custom-detail.png), [desktop multi-session graphs](design/stage1-complete/05-graphs-desktop.png), [768px](design/stage1-complete/06-graphs-768.png), [390px](design/stage1-complete/06-graphs-390.png), [200% scale](design/stage1-complete/07-graphs-200-percent.png), [equivalent zoom reflow](design/stage1-complete/07-graphs-200-percent-reflow.png), [filtered history](design/stage1-complete/08-history-filtered.png), [single-session graphs](design/stage1-complete/09-single-session-graphs.png) and [partial-run graphs](design/stage1-complete/10-partial-session-graphs.png). Original-resolution [coincident timing markers](design/stage1-complete/graphs-chronology-detail.png), [mobile chart section](design/stage1-complete/graphs-mobile-section.png) and [actually scrolled region](design/stage1-complete/graphs-mobile-scrolled.png) were inspected. Captures are synthetic evidence at density 1 except the documented 2x-density 744 CSS px reflow comparison. They do not expose normal practice data.

Review repairs verified in the final implementation:

- [P2, resolved] Fixed-width plots initially shrank labels on mobile. Chart regions now preserve readable geometry and scroll horizontally, show a visible mobile scroll cue and offer keyboard-accessible equivalent tables. Actual horizontal scrolling reaches the final points/labels.
- [P2, resolved] Coincident mean squares hid median circles. Mean markers are unfilled, leaving both series visible without fabricating offsets or values.
- [P2, resolved] Long unfinished observations flattened short correct/first-input times. Unfinished values now have their own labelled seconds scale, with arrows for lower bounds and missing intervals unplotted.
- [P2, resolved] All-zero timing axes rounded every tick to zero. The display scale now has a .02-second minimum while actual zero observations remain at zero; labels are 0/.01/.02.
- [P2, resolved] Fresh read-only mounts could autosave loaded Custom settings, while navigation could cancel pending real edits. Only actual Custom edits schedule persistence; pending valid edits survive immediate navigation, and read-only entry remains nonmutating. Browser reload/interception checks pass.

The [final 13-check browser report](design/stage1-complete/report.json) records full actual Standard and exact signed-decimal Custom flows through saved results, history/detail, all four graph surfaces and JSON/CSV downloads; keyboard/native table interaction, chart scrolling, 1487/768/390 layouts and 200% scale/equivalent reflow; honest empty/single/constant/partial data; UTC dates/cohort boundaries; active-tab protection; deletion cancellation/exact scope/late arrivals; and loading/save/export/delete failures with retry. Page errors are empty. Original 10 baseline, 8 recovery/deadline and 6 timing/export browser checks pass again, preserving their substantive checks. All browser services are isolated and their own processes are stopped in finally blocks.

65 backend and 20 frontend tests, typecheck/build and 4 protected Sites packaging tests pass. The React best-practices checklist was applied: native labelled controls, stable keys, backend-only metric derivation, cancellable reads, primitive dependencies, cleaned-up listeners/timers, explicit loading/error states and keyboard-accessible disclosure tables. No new chart framework, generated illustration or external service is needed.

No unresolved P0/P1/P2 findings remain in the inspected implementation. These checks cover Chrome on Windows/local loopback and the described simulated zoom/reflow; full cross-browser, physical display timing and assistive-technology certification remain untested. Charts are descriptive observations, with no accuracy percentage, causal/learning claim or original-game external-score equivalence. Human Stage 1 acceptance remains pending; Stage 2 has not started. Earlier slice QA is retained below as historical evidence.

## Original Custom practice comparison

Source: [selected option 1](design/selected-editor.png). Source and implementation: 1487×1058, CSS viewport 1487×1058, device scale factor 1; no density normalization needed. Matched state: addition 40%, multiplication 60% selected, ×11/×12 groups 50% each, timed 120 seconds, countdown off, named preset.

## Comparison and repairs

Initial: [full](design/comparison-initial.png), [controls](design/comparison-controls-initial.png), [sidebar](design/comparison-sidebar-initial.png).

- [P2, resolved] Overflow at 768: group fields now stack at 820; real browser assertions passed at 1100, 768, 390.
- [P2, resolved] Utility row pushed groups 40–50 pixels down: move equal split beside heading and restore section spacing.
- [P2, resolved] Sidebar mode controls too wide/text too small: constrain width and correct typography/rhythm.
- [P2, resolved] Preset update incorrectly showed unsaved due to JSON property order: canonical comparison fixes status; update/delete flow passed.
- [P3, resolved] Missing favicon request: explicit empty favicon removes 404; final console has no errors.

Final combined captures inspected: [full](design/comparison-final.png), [controls](design/comparison-controls-final.png), [sidebar](design/comparison-sidebar-final.png). Responsive [768](design/implementation-768.png) and [390](design/implementation-390.png) and session [results](design/implementation-results.png) inspected.

## Fidelity and usability

- Layout follows left editor/right settings, open white surface, lightweight dividers, compact desktop rows, section order, and primary-action placement.
- Typography uses locally bundled Inter, reference heading hierarchy, muted help copy, and readable labeled controls.
- Colors retain charcoal text, blue-gray labels/borders, restrained blue selected states. [P3, accepted] Flat primary fill and native checkbox/select styling differ slightly from generated shading.
- Assets: no raster content in the reference. Feather library icons supply add/copy/trash/info actions; no substitute illustrations.
- Copy retains source wording; approved functional additions are operation split, range guidance, preset update/rename/delete, current duration, and read-only effective share.
- Native labeled fields, adjacent errors/invalid state, keyboard controls/native modal, and 44-pixel mobile icon targets are present. No overflow at tested widths. Full assistive-technology/cross-browser audit remains untested.

## Functional evidence

[Report](design/verification-report.json): 10 browser workflow checks passed, zero console errors. Exact decimal auto-advancement, real focus loss, field corrections, unfinished work, SQLite writes, immutable snapshots after preset edits/deletion, countdown, deadline, endless ending, validation, group edits, and restored setup passed.

11 arithmetic tests, 13 API tests, typecheck, and build passed. React checklist review: stable operation/group keys, native semantics, cleaned-up listeners/timers, serialized effects, duplicate-event guards under StrictMode, exact arithmetic outside presentation code. Evidence uses synthetic test data.

No unresolved P0/P1/P2 findings.

2026-10-09 runtime review follow-up: the requested worker fixed four recovery/focus/deadline defects without changing the selected editor layout, typography, colors, or assets. The 10 baseline browser checks passed again with zero console errors, including responsive overflow and preset/session flows. Eight isolated failure-path regression checks passed with zero page errors; 16 frontend tests, 13 API tests, typecheck, and build passed. Independent patch recheck found no actionable remaining findings. [Regression evidence](design/review-fixes-report.json) and [acceptance limits](docs/stage-1-ai/ACCEPTANCE.md) supplement this visual record; this follow-up does not claim a new full visual or assistive-technology audit.

## Timing/export additions, 2026-10-09

User-approved additions preserve the selected editor's layout, typography, colors, and group controls. All-session downloads sit below Start/help in the right settings column. Results retain the open white surface and add median/mean correct-answer time, save/load/export feedback, and first-input/unfinished details.

Actually inspected: [desktop setup](design/timing-exports/setup-desktop.png), [desktop results](design/timing-exports/results-desktop.png), and [390px results](design/timing-exports/results-390.png). Captures use an isolated synthetic configuration at density 1. Results have readable numeric hierarchy, aligned two-column metrics, distinct timing labels, download actions, and unfinished raw input. At 390px, timing labels wrap without clipping and question detail rows stack. [768px](design/timing-exports/results-768.png) and [390px setup](design/timing-exports/setup-390.png) were captured; overflow assertions pass at all three widths. No image-generation or structural redesign was needed.

[Six browser checks](design/timing-exports/report.json) pass with zero page errors, including actual clipboard paste, retries, downloads, and active-session exports from another tab. Existing 10 baseline and 8 recovery/deadline checks pass. 34 backend tests, 16 frontend tests, typecheck, and build pass. React checklist applied to edited components: backend metrics as the single source, stable presentation-sequence keys, cancellable summary effect, separate error states, semantic disabled buttons/status feedback, and browser object-URL cleanup. Full cross-browser/assistive-technology evaluation remains untested.

No unresolved P0/P1/P2 visual findings in the inspected additions.

final result: passed
