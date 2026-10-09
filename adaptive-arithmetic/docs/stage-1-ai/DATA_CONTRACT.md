# Stage 1 — Data contract

Status: Custom practice and the response-timing/export slice are explicitly approved, implemented, and verified. Broader Stage 1 remains unfinished and unaccepted. See [project state](../PROJECT_STATE.md).

## Authoritative implemented contracts

- [Custom practice](CUSTOM_PRACTICE.md): versioned operations/groups, exact decimal ranges, immutable configuration, seed/generator/policy provenance, automatic exact acceptance, raw edits, timed/endless execution, focus loss, and recovery ownership.
- [Response timing and exports](TIMING_EXPORTS.md): measurement compatibility, presentation/first-input/acceptance definitions, valid summaries, unfinished/unknown-end handling, warnings, additive session reads, snapshot-consistent JSON/CSV exports, and raw-input encoding.

Each session retains its original configuration independently of presets. Raw observations are append-only, ordered, and preserved when inconsistent. Exact arithmetic is represented by decimal strings. One backend derivation supplies saved results and exports; no frontend summary algorithm competes with it.

Editable field changes are not wrong attempts. No accuracy denominator is inferred. First-input and correct-answer times include interaction and are not pure cognitive speed. React layout commit is observable rendering, not physical screen presentation. Wall metadata is separate from monotonic elapsed time. Recovery never invents an actual end when it was not observed.

## Reproducibility and future work

Same-version/configuration/seed generation is verified. Ordered actual questions and recorded selection context remain available if future algorithms change. Generator and policy identities remain separate. Future policies may expose genuinely defined probabilities; never manufacture them or assume incomplete records support valid retrospective comparison.

History browsing, cross-session breakdowns/comparisons, benchmark fidelity, retention/session deletion, additional measurement or outcome definitions, accounts, synchronization, and release/privacy requirements need separate discussion. These slices do not authorize those extensions. Standard benchmark compatibility requires verification of original mechanics. Substantive adaptation and research evaluation belong to user-owned Stage 2.

Capture only arithmetic interaction, never global keylogging, unrelated personal data, or third-party tracking. Preserve incomplete observations; missing/invalid timings are null with warnings, not guessed durations. Contract changes affecting measurement meaning require explicit user approval. [Acceptance](ACCEPTANCE.md) and [handoff](HANDOFF.md) record actual checks and practical limits separately from user acceptance.
