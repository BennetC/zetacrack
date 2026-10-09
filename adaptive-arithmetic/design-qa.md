# Custom practice design QA

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
