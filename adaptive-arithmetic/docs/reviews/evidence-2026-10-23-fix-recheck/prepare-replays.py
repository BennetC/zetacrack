from pathlib import Path
root = Path.cwd()
evidence = root / 'docs/reviews/evidence-2026-10-23-fix-recheck'
scratch = root / 'data/recheck-2026-10-23'
scratch.mkdir(parents=True, exist_ok=True)
original = (root / 'scripts/prepare-review-fixes-replays.py').read_text(encoding='utf-8')
original = original.replace('root = Path(__file__).resolve().parents[1]', 'root = Path.cwd()')
original = original.replace('data/fix-2026-10-15-replays', 'data/recheck-2026-10-23').replace('evidence-2026-10-15-fixes', 'evidence-2026-10-23-fix-recheck')
exec(compile(original, str(evidence / 'prepare-replays.py'), 'exec'))
targeted = (root / 'web/tests/review-fixes-browser.mjs').read_text(encoding='utf-8')
targeted = targeted.replace('import puppeteer from "puppeteer-core";', 'import { createRequire } from "node:module";\nconst puppeteer = createRequire(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../web/package.json"))("puppeteer-core");')
targeted = targeted.replace('evidence-2026-10-15-fixes/targeted', 'evidence-2026-10-23-fix-recheck/targeted')
(scratch / 'review-fixes-browser.mjs').write_text(targeted, encoding='utf-8')
print('Prepared targeted plus four unchanged-assertion isolated replays')
