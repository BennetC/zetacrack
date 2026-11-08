# Adaptive Arithmetic

Session detail now includes a Run explorer with input replay, revisions, timing splits, ghost pace comparisons, arithmetic profiles, correction labels and Custom practice from selected questions. Same-seed challenges are explicitly excluded from benchmarks. See the [measurement contract](docs/stage-1-ai/RUN_EXPLORER.md) and [verification](docs/reviews/2026-11-05-explorer-verification.md). Typo labels are descriptive hypotheses, not established causes.

A complete local Stage 1 arithmetic platform following selected design option 1. Open Standard Zetamac for an immediate two-minute run using the original default question distribution, or use independently remembered Custom practice with weighted operations/groups, exact signed ranges and decimals, presets, and timed/endless sessions. Correct answers advance automatically; leaving the window ends practice. Our disclosed timing/input/focus rules differ from the original game, so external scores are not interchangeable.

Saved results show median/mean correct-answer times and first-input details. History offers pagination, filters, original configurations, exact questions, raw inputs/events and provenance. Graphs show comparable full-run score/timing chronology, distributions, operation/group breakdowns and per-session sequence with unfinished observations. JSON/CSV downloads retain snapshots and raw precision. Sessions are kept locally until confirmed deletion; ongoing/owned/pending data is protected. See the [complete platform contract](docs/stage-1-ai/PLATFORM.md).

Graphs also show numeric average/median scores, pooled answer times and equally weighted run timing. History opens with eligible full runs only; **Show non-eligible runs** reveals excluded sessions. Reloading during practice immediately starts a fresh run with the same content/duration and no countdown, retaining the interrupted observations and remembered Custom settings.

The approved follow-up adds best/latest-10 score comparisons, quick date ranges, inspectable graph points, persistent filtered URLs/Back/Forward, separate matching/all-history deletion and **Run again** (R after saving). Pending Start requests retain a stable operation key so a lost response can be retried or recovered without creating an orphan. Mobile graph controls collapse to bring the scores into the first viewport. Current verified preview: [127.0.0.1:4175](http://127.0.0.1:4175), API 8019; the original 4173/8017 processes may still serve older code until their owner restarts them.

## Run locally on Windows

Tested with Python 3.12, Node.js 24, and Chrome. Session ownership requires browser Web Locks on the local application origin. Install once from this directory:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Set-Location web
npm ci
Set-Location ..
```

Start both services:

```powershell
.\scripts\start.ps1
```

[Open the app](http://127.0.0.1:4173). The script launches hidden processes, verifies the API/frontend connection, and writes logs into ignored `data/`. It reuses listening services after checking their responses. API: `127.0.0.1:8017`; frontend: `127.0.0.1:4173`.

Presets, remembered setup, immutable sessions, and observations live in `data/arithmetic.sqlite3`. Use a SQLite-aware backup tool, or stop the API before copying the database and its WAL files. `ARITHMETIC_DB` can select a separate database before launch.

For foreground development, run these in separate terminals:

```powershell
.\.venv\Scripts\python.exe -m uvicorn server.app:app --host 127.0.0.1 --port 8017
```

```powershell
Set-Location web
npm run dev
```

## Verification

```powershell
.\.venv\Scripts\python.exe -m pytest -q
Set-Location web
npm run typecheck
npm test
npm run build
npm run test:browser
npm run test:regressions
npm run test:exports
npm run test:stage1
npm run test:review-fixes
npm run test:improvements
npm run test:next-improvements
npm run test:sites
```

Browser checks require installed Chrome (or `CHROME_PATH`). The baseline harness uses free ports 8018/4174; recovery, timing/export and complete-platform checks choose dynamic ports. They use isolated servers/databases and synthetic data, and stop their own servers afterward. Run browser suites sequentially on Windows.

Actual complete-platform verification on 2026-10-09: 20 frontend and 65 backend tests, 10 baseline / 8 recovery / 6 timing-export / 13 complete-platform browser checks, typecheck/build and 4 protected packaging tests. [Acceptance](docs/stage-1-ai/ACCEPTANCE.md) and [visual QA](design-qa.md) record traces, responsive/zoom/keyboard inspection and practical limits. Fixtures use isolated synthetic databases and never delete normal practice data.

Latest requested review repairs, 2026-10-15: **95 backend / 21 frontend / 45 browser / 4 packaging** checks pass, plus typecheck/build. [Resolution report](docs/reviews/2026-10-15-fix-verification.md) records all five repaired findings and reproducible regression evidence. Its replay preparation script runs the original browser suites on dynamic ports and new evidence paths, preserving the historical reports. Independent patch review and human acceptance remain separate.

## Scope and next work

See the [complete platform contract](docs/stage-1-ai/PLATFORM.md), [custom-practice contract](docs/stage-1-ai/CUSTOM_PRACTICE.md), [timing/export contract](docs/stage-1-ai/TIMING_EXPORTS.md), [handoff](docs/stage-1-ai/HANDOFF.md), and [project state](docs/PROJECT_STATE.md). All F01–F27 local Stage 1 requirements are delivered; the user accepted Stage 1 on 2026-10-23 (D-023). Accounts/cloud synchronization, deployment and permanent naming are outside this completion scope.

Stage 2 planning opened on 2026-10-23. Start with the [research brief](docs/stage-2-user/RESEARCH_BRIEF.md) and [planning kickoff](docs/stage-2-user/IMPLEMENTATION_PLAN.md). The user owns the learning-system investigation/design/implementation; the agent assists with research, teaching, critique and review. The first investigation and methodology remain open; no learning-engine implementation is authorized. Implementation, verification and human acceptance are separate. The product name remains provisional. Read [AGENTS.md](AGENTS.md) and [DECISIONS.md](docs/DECISIONS.md) before continuing.
