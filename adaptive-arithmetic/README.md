# Adaptive Arithmetic

A local arithmetic practice app following selected design option 1. Configure weighted operations and multiple exercise groups, exact signed ranges, independent decimal precision, and timed or endless sessions. Save named presets in SQLite and restore the last valid setup. Correct answers advance automatically; leaving the window ends practice. Every session retains its original configuration.

Saved results show median and mean correct-answer times, with first-input time in question details. Download a finished session as JSON/CSV from results, or export every saved session below setup controls. Exports include original configurations and unfinished observations; timings remain unrounded in records. See the [timing/export contract](docs/stage-1-ai/TIMING_EXPORTS.md).

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

[Open custom practice](http://127.0.0.1:4173). The script launches hidden processes, verifies the API/frontend connection, and writes logs into ignored `data/`. It reuses listening services after checking their responses. API: `127.0.0.1:8017`; frontend: `127.0.0.1:4173`.

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
```

Browser checks require installed Chrome (or `CHROME_PATH`). The baseline harness uses free ports 8018/4174; recovery regressions and timing/export checks choose dynamic ports. They use isolated servers/databases and synthetic data, and stop their own servers afterward. Run browser suites sequentially on Windows.

Actual results after the 2026-10-09 timing/export implementation: 16 frontend tests, 34 backend tests, 10 baseline browser checks, 8 recovery/deadline checks, 6 timing/export browser checks, typecheck, and build passed. The earlier independent reviewer rechecked the four runtime fixes; this new slice has its own verification evidence. The selected UI is preserved; [visual QA](design-qa.md) records desktop/mobile inspection. Recovery/data-loss limits are in the [contract](docs/stage-1-ai/CUSTOM_PRACTICE.md).

## Scope and next work

See the [approved custom-practice contract](docs/stage-1-ai/CUSTOM_PRACTICE.md), [timing/export contract](docs/stage-1-ai/TIMING_EXPORTS.md), [actual handoff](docs/stage-1-ai/HANDOFF.md), and [project state](docs/PROJECT_STATE.md). Standard benchmark fidelity, history browsing and further analytics, retention/deletion controls, and deployment remain future work.

Stage 1 builds the approved platform. Stage 2 remains the user's learning-system investigation and implementation. Full Stage 1 completion and user acceptance are separate from this delivered slice. The product name remains provisional. Read [AGENTS.md](AGENTS.md) and [DECISIONS.md](docs/DECISIONS.md) before continuing.
