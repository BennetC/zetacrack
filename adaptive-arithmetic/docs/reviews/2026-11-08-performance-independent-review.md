# Independent review: reload, saved reads and pace

**Verdict: passed.** No actionable defect was confirmed in the reviewed changes. Review of Orbit task 647 used linked review task 648 and verification 104, independently of implementation run `01a1bba3-ca79-7392-8dfb-acaffa9997bb`.

Reviewed the actual working-tree changes based on `c3fc362`, including the API derivation cache, deferred details, compact ghost response, reload intent preview, session-detail fallback and exact cumulative/median pace rendering. Application source, normal practice records, existing services and historical evidence were not changed by this review. The user explicitly withdrew production deployment; GitHub publication remains the parent's responsibility.

## Independent evidence

| Check run by reviewer | Actual result |
| --- | --- |
| `.venv/Scripts/python.exe -m pytest -q` | 114 passed; existing Starlette/AnyIO deprecation warning only |
| `npm run typecheck; npm test` | TypeScript passed; 28 frontend tests passed |
| `npm run test:explorer` with `ARITHMETIC_EVIDENCE_DIR=data/review647/browser` (absolute path supplied) | All 10 scenario groups passed; no page errors |
| Independently written cache probe | A deliberately slow old-snapshot derivation overlapped a writer append and a newer reader. The old snapshot remained internally consistent; after it replaced the cache entry, the next read rejected its stale signature and returned the new complete trace. Repeated cross-worker annotation revisions remained current in detail/JSON export without changing events. Cross-worker deletion disappeared from list, aggregate and detail reads |
| Independently written pace property probe | 1200 deterministic cases / 24,788 assertions passed against a separately calculated pointwise median; included odd/even/empty peer sets, zero scores, tied completions, zero/sub-millisecond/long durations and completions beyond the plotted horizon |
| Screenshot inspection | Actual blue/grey completion steps and the pending reload layout inspected; no incorrect interpolated answer progress was visible |
| `git diff c3fc362 --check` | Passed |

The fresh browser journey verified actual finite SVG steps, previous/target/typical choices, keyboard selection, labels/replay, challenge reload seed/exclusion and remembered settings, a held replacement request without setup navigation appearing, answer focus after creation, comparison failure/retry, absent previous peers, older detail responses without explorer data, and desktop/mobile page overflow checks. Isolated servers were cleaned up by the harness.

Evidence and reproducible reviewer probes remain in ignored `adaptive-arithmetic/data/review647/`: `browser/report.json`, `cache-probe.py`, `cache-probe.json`, `pace-properties.ts`, and `pace-properties.json`. These fixtures are synthetic. Existing implementer reports were read as context and were not substituted for the fresh checks above.

## Source assessment

- Cache hits require the same SQLite snapshot's session metadata, event count/last sequence and annotation values. Append-only API observations justify that signature; underlying event JSON is not revalidated on every hit. Both miss materialization and export details remain inside the read transaction. The per-app lock protects LRU/accounting changes, and signatures preserve correctness if an older reader fills the cache after a newer reader. Scanning hits before filling misses prevents a large traversal from evicting its own later hits.
- Aggregate/history/delete-preview paths defer replay details; detail and export paths retain the original full schema. Peer comparisons retain raw validated acceptance precision while omitting replay frames. No scoring, eligibility, cohort, generator or measurement policy was changed.
- Reload preview reads are non-consuming during React initialization; the existing guarded effect consumes the intent once. Ownership rejection, ownership-check exceptions and failed/successful starts clear the loading view through their existing retry paths. Timer/question presentation remains after durable creation.
- Pace steps retain real acceptance boundaries and ties. The histogram-based median agrees with brute-force peer scoring. Unknown durations suppress comparison values and sampled elapsed rows; zero durations remain finite without inventing a positive observed interval.

## Limits and reporting

This is a focused local code review on Windows/Chrome and synthetic SQLite fixtures, not a security certification, load-test guarantee, production verification or human acceptance. The cache remains process-local and bounded; restart/eviction can require full derivation, and collection scans still grow with history. No additional application changes are requested by this review.

Reviewer native session: `01a1bbee-ba82-71e0-8618-b9d19c1cea33`; source turn: `01a1bbee-d218-71a1-9d63-417abc48ccc7`; registered review attempt 231. Local source collection is configured and queued until the actual review turn closes. That pending collection is separate from the saved technical review verdict; missing token components must remain unknown.

Orbit saved the passing verdict for verification 104. Readback confirms original task 647 and review task 648 completed; reviewer attempt 231 is finished at revision 2. Activity reconciliation is still pending for the open parent/reviewer source turns; technical completion does not claim finalized telemetry.
