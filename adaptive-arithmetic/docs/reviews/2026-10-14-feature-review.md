# Stage 1 feature review — 14 October 2026

Two actionable **P2** findings remain. Standard Zetamac, complete Custom practice, history/detail, exports, protected deletion, and **all four actual graph surfaces are present and usable in the normal journeys tested**. No entire required feature family is missing. The earlier unconditional F01–F27 closure should be qualified by the two state-handling defects below. No P0 or P1 feature finding was established.

This is a fresh review of the complete working tree, including uncommitted and untracked Stage 1 files, rather than a review of HEAD `a34d4a5` or acceptance of the earlier screener's conclusions. Application source, tests, contracts, normal services, and normal practice records were not changed. Human acceptance and Stage 2 remain separate.

## Actionable findings

### FR-01 — [P2] Refreshing a later history page can hide surviving sessions after deletion elsewhere

**Source:** [SavedViews.tsx:129](C:/Users/benne/Projects/zetacrack/adaptive-arithmetic/web/src/SavedViews.tsx:129), query/read at lines 125–132; misleading empty state at lines 241–244; page range at lines 300–303. The refreshed total never clamps or resets `offset`.

**Reproduction:**

1. Populate an isolated history with 25 closed sessions and open **History → Next page**, displaying the last five records at offset 20.
2. In another tab, delete 24 of those closed records. The independent probe performed the same exact closed-ID deletion through the API against its synthetic database.
3. Return to the second history page and select **Refresh history**.

**Observed:** The server correctly returns `total: 1` and no rows at offset 20. The UI says both **“1 matching sessions”** and **“No saved sessions match these filters”**, with **“21–1 of 1”** pagination. **Previous page** then reveals the surviving record. Repeating Refresh alone does not reveal it.

**Expected:** F17's usable, truthful pagination/refresh and F23's refreshed history after deletion should move to an existing page when the filtered total shrinks, or reset the page on explicit refresh. An out-of-range page must not be described as an absence of matching history.

**Impact:** Cross-tab deletion makes retained data appear missing and presents an impossible range. Data remains intact; manual backward pagination is a workaround. This is an ordinary recoverable usability defect, not data loss.

**Evidence:** [machine-readable probe](C:/Users/benne/Projects/zetacrack/adaptive-arithmetic/docs/reviews/evidence-2026-10-14-feature/fresh-probes.json), `shrinkingHistory`: `remainingTotal=1`, `visibleRows=0`, range `21–1 of 1`, `visibleAfterPrevious=1`.

![FR-01: one retained session, empty second page, and impossible page range](C:/Users/benne/Projects/zetacrack/adaptive-arithmetic/docs/reviews/evidence-2026-10-14-feature/13-history-shrunk-after-refresh.png)

### FR-02 — [P2] Initial setup loading silently overwrites edits made in enabled Custom controls

**Source:** [PracticeEditor.tsx:285](C:/Users/benne/Projects/zetacrack/adaptive-arithmetic/web/src/PracticeEditor.tsx:285), unconditional saved-configuration replacement at lines 285–292. The group-name input at lines 894–901, and other configuration controls, remain editable while `ready` is false. Only Start/preset saving is gated.

**Reproduction:**

1. Save a custom setup, then open `?view=custom` with `/api/setup` delayed. The probe holds every initial setup request, including the StrictMode duplicate; this is not an artifact of one request completing early.
2. While Start says **Connecting…**, change the visible default group's name to **Fresh user edit while loading**. The input accepts it and the page reports unsaved preset changes.
3. Let the setup read finish.

**Observed:** The entire editor is replaced with the saved setup. The entered name becomes `Signed Δ, "測定"`; the fresh edit disappears without an explanation or choice. Probe values confirm Start was disabled during the edit.

**Expected:** F11's independent remembered Custom setup and F25's usable loading behavior should either prevent edits until initialization completes or preserve deliberate edits made after mount. Accepted editing must not be silently discarded by a late read.

**Impact:** A slow startup/reconnection can erase newly entered ranges, weights, group edits, or session settings before practice starts. The remembered database setup is not damaged. The normal fast-load journey passes; the defect is confined to the initialization window.

**Evidence:** [machine-readable probe](C:/Users/benne/Projects/zetacrack/adaptive-arithmetic/docs/reviews/evidence-2026-10-14-feature/fresh-probes.json), `loadingEdit`: before `Fresh user edit while loading`, `startDisabled=true`, after `Signed Δ, "測定"`.

![FR-02 before: Custom accepts an edit while Connecting](C:/Users/benne/Projects/zetacrack/adaptive-arithmetic/docs/reviews/evidence-2026-10-14-feature/11-custom-edit-during-loading.png)

![FR-02 after: the saved setup replaces that edit when loading finishes](C:/Users/benne/Projects/zetacrack/adaptive-arithmetic/docs/reviews/evidence-2026-10-14-feature/12-custom-loading-overwrite.png)

## Fresh checks and scope

The Product Design audit workflow supplied screenshot-first UI evidence. In-app Browser tools were unavailable; isolated installed Chrome/Puppeteer was used. Every screenshot cited as visual evidence was opened and inspected during this review. All generated records are synthetic software fixtures, not user performance observations.

| Fresh check | Result | Evidence |
| --- | --- | --- |
| Complete-platform browser suite, isolated copy | **13 passed**, zero page errors | [report and Standard/Custom traces](C:/Users/benne/Projects/zetacrack/adaptive-arithmetic/docs/reviews/evidence-2026-10-14-feature/report.json) |
| Retained custom-control browser suite, isolated copy with dynamic ports | **10 passed**, zero console errors | [custom report](C:/Users/benne/Projects/zetacrack/adaptive-arithmetic/docs/reviews/evidence-2026-10-14-feature/custom-baseline/verification-report.json) |
| Timing/export browser suite, isolated copy | **6 passed**, zero page errors | [export report](C:/Users/benne/Projects/zetacrack/adaptive-arithmetic/docs/reviews/evidence-2026-10-14-feature/timing-exports/report.json) |
| `npm test` in `web/` | **20 passed** | Exact percentages/grids/rank sampling/signs/decimals/input/seed replay; recovery/deadline units; standard formulas, 20,000-question replay/distribution and unchanged legacy custom digest |
| Independent delayed-initialization probe | **FR-02 reproduced** | [fresh-probes.json](C:/Users/benne/Projects/zetacrack/adaptive-arithmetic/docs/reviews/evidence-2026-10-14-feature/fresh-probes.json) |
| Independent shrinking-history probe | **FR-01 reproduced** | Same probe, exact closed-ID deletion, survivor recovered by Previous page |
| Independent ongoing and unknown-end detail probes | **Expected behavior observed** | Same probe; explicit ongoing/incomplete states, null actual end/correct time, raw Unicode/quotes/newline retained, 0.20s first input and unfinished lower bound |

The 29 passing browser checks above were rerun on the current tree. They are not a relabelling of the earlier 37-check claim. Isolated harness copies live in ignored `data/feature-review-2026-10-14/`; their evidence destinations were changed before execution. The custom baseline's fixed ports were replaced with dynamic ports and strict binding. Each suite used a distinct synthetic SQLite file and isolated browser profile, and closed only its own process trees in `finally`. No requests were made to the normal `4173`/`8017` services or normal database for this review.

## Audited journeys and screenshot evidence

1. **Standard entry and run — healthy.** The default home has direct immediate 120-second Start, original reverse-addition/reverse-product rules, 25% operation selection, partial-score wording and a discoverable runtime-difference disclosure. A real generated answer reached persistence, a full-timeout result and matching JSON/CSV. The full-duration check uses the suite's synthetic monotonic offset; it does not claim a fresh real two-minute wait. [Home](C:/Users/benne/Projects/zetacrack/adaptive-arithmetic/docs/reviews/evidence-2026-10-14-feature/01-standard-home.png), [results](C:/Users/benne/Projects/zetacrack/adaptive-arithmetic/docs/reviews/evidence-2026-10-14-feature/03-standard-results.png).
2. **Custom configuration and presets — healthy after initialization; FR-02 during loading.** The preserved editor exposes two-level weights/effective shares, ordered per-operand grids/precision, groups, explicit split, timed/endless/countdown and starting presets. Actual group duplication/removal, adjacent validation, SQLite preset save/rename/update/delete, immutable snapshots, reload restoration and immediate-navigation persistence passed. [Editor](C:/Users/benne/Projects/zetacrack/adaptive-arithmetic/docs/reviews/evidence-2026-10-14-feature/custom-baseline/implementation-desktop-final.png).
3. **Answering, endings and saved timing — healthy in tested flows.** Real typing/deletion/paste, exact auto-advance, focus-loss ending, countdown exclusion, unfinished input, save/summary/download failures and retries all passed. Saved median/mean and first-input details agreed with backend records and downloads. [Custom result/details](C:/Users/benne/Projects/zetacrack/adaptive-arithmetic/docs/reviews/evidence-2026-10-14-feature/timing-exports/results-desktop.png).
4. **History and immutable inspection — healthy normal paging/filter/detail; FR-01 after external shrink.** Newest-first paging, mode filtering, exact questions/raw input, original config/seed/version/group identities, warning and event disclosures, back navigation and read-error retry were exercised. Independent ongoing/unknown-end fixtures show truthful missing values/lower bounds and disabled deletion for open records. [Filtered history](C:/Users/benne/Projects/zetacrack/adaptive-arithmetic/docs/reviews/evidence-2026-10-14-feature/08-history-filtered.png), [Custom detail](C:/Users/benne/Projects/zetacrack/adaptive-arithmetic/docs/reviews/evidence-2026-10-14-feature/04-custom-detail.png), [ongoing detail](C:/Users/benne/Projects/zetacrack/adaptive-arithmetic/docs/reviews/evidence-2026-10-14-feature/14-ongoing-session-detail.png), [unknown-end detail](C:/Users/benne/Projects/zetacrack/adaptive-arithmetic/docs/reviews/evidence-2026-10-14-feature/15-unknown-end-detail.png).
5. **All four graphs — present and healthy in tested states.** The page contains actual same-cohort score/timing chronology, a deterministic response histogram, operation/group median/mean bars, and a per-question correct/first-input sequence with a separate unfinished scale. The four-run fixture has 10 valid response observations; histogram totals and supplied summaries agree. Empty, single/constant, all-zero and partial selection were checked. Partial observations stay outside full-run chronology. [All graphs](C:/Users/benne/Projects/zetacrack/adaptive-arithmetic/docs/reviews/evidence-2026-10-14-feature/05-graphs-desktop.png), [empty](C:/Users/benne/Projects/zetacrack/adaptive-arithmetic/docs/reviews/evidence-2026-10-14-feature/02-empty-graphs.png), [single/constant](C:/Users/benne/Projects/zetacrack/adaptive-arithmetic/docs/reviews/evidence-2026-10-14-feature/09-single-session-graphs.png), [partial](C:/Users/benne/Projects/zetacrack/adaptive-arithmetic/docs/reviews/evidence-2026-10-14-feature/10-partial-session-graphs.png).
6. **Graph access and responsiveness — healthy within the tested scope.** Desktop/tablet/390px captures, 200% CSS scale/equivalent reflow, keyboard table disclosure and real horizontal chart scrolling passed. Shape/pattern distinctions accompany color; native equivalent tables expose values and drill-through. [Mobile](C:/Users/benne/Projects/zetacrack/adaptive-arithmetic/docs/reviews/evidence-2026-10-14-feature/06-graphs-390.png), [mobile chart detail](C:/Users/benne/Projects/zetacrack/adaptive-arithmetic/docs/reviews/evidence-2026-10-14-feature/graphs-mobile-section.png), [scrolled chart](C:/Users/benne/Projects/zetacrack/adaptive-arithmetic/docs/reviews/evidence-2026-10-14-feature/graphs-mobile-scrolled.png). This is not screen-reader or universal WCAG certification.
7. **Exports, read-only tabs and protected deletion — healthy in tested journeys.** Per/all JSON/CSV downloads, empty history, export retry and saved-export agreement passed. Genuine background read/export tabs left an active owner focused and its events/setup unchanged. Pending-journal/held-lock protection, confirmation cancellation, failed deletion/retry and exact bulk scope excluding a later arrival passed. Presets and Custom setup survived deletion. FR-01 concerns the remaining stale page after deletion elsewhere, not deletion scope or storage atomicity.

## F01–F27 coverage

“Covered” means source plus the fresh checks identified here support feature presence and the reviewed journeys. It is not proof of every input/concurrency permutation or human acceptance. Deep correctness/concurrency review is the sibling reviewer's separate remit.

| ID | Feature assessment | Fresh basis / limits |
| --- | --- | --- |
| F01 | Covered: default Standard/direct Start and navigation | Platform checks and home/results screenshots; Custom memory unchanged by Standard |
| F02 | Covered: original default content and honest runtime disclosure | `standard.ts`, standard frontend tests, generated Standard trace; no fresh claim of external score equivalence |
| F03 | Covered: fixed 120-second score/full-vs-partial behavior | Actual Standard save/export timeout trace; interrupted Custom partial trace |
| F04 | Covered: replaceable fixed/weighted policy boundary | Domain/standard source and passing policy/legacy-replay tests |
| F05 | Covered: four operations, inclusive ordered bounds, signs/fixed values | Fresh domain tests and Custom browser validation/session flow |
| F06 | Covered: independent precision and exact correctness | Fresh exact-product/division/precision tests; actual signed-decimal run/export |
| F07 | Covered in tested execution | Fresh countdown, timeout, manual/endless, real focus loss and exclusive-terminal units; deeper lifecycle races reviewed separately |
| F08 | Covered: two-level shares, effective share, valid-pair generation | Actual 60% × 50% = 30% controls; seeded/rank/sparse tests |
| F09 | Covered: add/duplicate/remove/explicit split | Custom browser controls and exact-percentage units; no hidden normalization observed |
| F10 | Covered: builtins and SQLite preset CRUD | Fresh save/rename/update/delete and immutable saved-session checks |
| F11 | **Gap FR-02** in loading interaction; normal memory covered | Reload and immediate-navigation saves pass, but a pending setup read discards fresh edits |
| F12 | Covered at feature/API level | Immutable config/raw events/seed/version/mode visible and exported; migration internals not rerun by this reviewer |
| F13 | Covered: raw edits, separate first/correct metrics | Real typing/deletion/paste, JSON raw input, null/unfinished inspection; backend is sole metric source |
| F14 | Covered: saved median/mean and independent retry | Fresh results/API/download agreement and failure/retry checks |
| F15 | Covered in tested read/recovery presentation | Background reads preserve owner; recovery units pass; independent ongoing/unknown-end UI checks; not all recovery failure races rerun |
| F16 | Covered: per/all JSON/CSV | Six export browser checks, empty downloads and full Standard/Custom read-download equality |
| F17 | **Gap FR-01** after history shrinks; normal history/detail covered | 20-row paging, mode filter, detail/back/retry pass; stale second-page offset hides the survivor |
| F18 | Covered: actual comparable chronology | Four eligible Standard runs, score and median/mean plots, table/drill-through, truthful empty/single states |
| F19 | Covered: actual correct-time histogram | Counts sum to 10; constant and empty graphs inspected; exact-edge algorithm source reviewed |
| F20 | Covered: actual operation/group breakdown | Both levels have real bars and native count/median/mean tables; zero valid samples shown as missing |
| F21 | Covered: actual per-question sequence | Correct/first-input points, exact table, separate unfinished axis and independently checked lower-bound arrow |
| F22 | Covered at feature/selection level | Standard/Custom cohort separation, optional partials without chronology pooling, displayed exclusions and UTC graph date filter; exhaustive eligibility corruption belongs to correctness review |
| F23 | Covered: explicit protected single/bulk deletion | Pending/lock/cancel/failure/arrival/preset preservation fresh checks; FR-01 is the later history-page presentation gap |
| F24 | Covered at feature/source level | Read-only background behavior, local endpoint/assets review and no telemetry path found; exhaustive SQLite write/delete interleavings not rerun here |
| F25 | Largely covered; FR-01/FR-02 affect truthful states | Fresh desktop/tablet/mobile/reflow, keyboard/table/scroll checks; no complete assistive-technology certification |
| F26 | Broad fresh verification; no blanket closure | 29 passing browser + 20 frontend tests, plus four independent probes (two bugs/two expected state cases); backend/build/packaging checks not rerun here |
| F27 | Complete documentation exists; closure needs qualification | Required contracts/handoff are present and preserve acceptance/Stage 2 boundaries; this new report reopens two claims of fully complete usable behavior |

## Deliberate limits and untested areas

- Original-game clock/input/focus differences and lack of external score interchangeability are disclosed approved decisions. They are not missing Standard features.
- Conservative identity-based cohorts, including rename-only separation, are documented defaults. Combining them or adding learning recommendations is not required.
- Stage 2 learning, public release/deployment, accounts/cloud sync and product naming are outside the requested Stage 1 implementation.
- This reviewer did not rerun backend pytest, typecheck, production build, packaging, full recovery-race browser suite, or the earlier 10,001-record deletion stress test. Their historical success is not counted as fresh evidence here. The correctness reviewer assesses those internals independently.
- Chrome/Windows/loopback is the tested target. Actual mobile browsers, other engines, physical-display timing, full browser zoom behavior, screen readers and exhaustive keyboard-only journeys were not certified. Mobile screenshots use desktop Chrome viewports.
- Unknown-end fixtures were created through the isolated API to inspect presentation/metrics; they do not claim a new crash/recovery end-to-end run. Existing journal/Web Lock availability and combined journal-failure/unacknowledged-exit limitations remain.
- No normal user history was inspected, mutated, exported or deleted. Synthetic databases and downloads remain only under ignored `data/`; review evidence contains synthetic observations alone.

The requested visible Stage 1 capabilities are delivered, including all four graph families. FR-01 and FR-02 are concrete remaining usability defects; repairing and regression-checking them is needed before retaining an unqualified “all F01–F27 complete” statement. This review does not record human Stage 1 acceptance.
