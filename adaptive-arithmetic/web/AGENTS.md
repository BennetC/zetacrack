# Prototype Instructions

Selected visual: displayed option 1, stored at `../design/selected-editor.png`. Preserve its open white surface, left editor/right session-settings column, Inter typography, restrained blue accents, lightweight dividers, and compact editable group rows. The approved behavior is in `../docs/stage-1-ai/CUSTOM_PRACTICE.md`; do not add Stage 2 learning or silently claim benchmark compatibility.

The user also approved `../docs/stage-1-ai/TIMING_EXPORTS.md` on 2026-10-09: saved median/mean correct-answer times, first-input details, per-session JSON/CSV exports on results, and all-session exports beneath setup controls. Preserve the selected visual design. Keep derivation on the backend and disable per-session export until persistence succeeds.

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.
