"""Prepare isolated existing browser suites without overwriting historical evidence.

Run the generated suites sequentially from data/improvements-replays. Each suite
uses its existing synthetic DB/profile and dynamic ports; normal data is untouched.
"""
from pathlib import Path
import argparse

parser = argparse.ArgumentParser()
parser.add_argument("--scratch", default="data/improvements-replays")
parser.add_argument("--evidence", default="docs/reviews/evidence-2026-11-03-improvements")
parser.add_argument("--include-improvements", action="store_true")
args = parser.parse_args()

root = Path(__file__).resolve().parents[1]
scratch = root / args.scratch
scratch.mkdir(parents=True, exist_ok=True)
evidence = args.evidence
names = ["browser", "review-regressions", "exports-browser", "stage1-browser", "review-fixes-browser"]
if args.include_improvements:
    names.append("improvements-browser")
for name in names:
    text = (root / f"web/tests/{name}.mjs").read_text(encoding="utf-8")
    text = text.replace('import puppeteer from "puppeteer-core";', 'import { createRequire } from "node:module";\nconst puppeteer = createRequire(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../web/package.json"))("puppeteer-core");')
    text = text.replace('path.join(root, "design/review-fixes-report.json")', f'path.join(root, "{evidence}/recovery-report.json")')
    text = text.replace('path.join(root, "design", "timing-exports")', f'path.join(root, "{evidence}/exports")')
    text = text.replace('path.join(root, "design/stage1-complete")', f'path.join(root, "{evidence}/platform")')
    text = text.replace('path.join(root, "design/improvements-2026-11-03")', f'path.join(root, "{evidence}/improvements")')
    text = text.replace('path.join(root, "design")', f'path.join(root, "{evidence}/baseline")')
    text = text.replace('"docs/reviews/evidence-2026-10-15-fixes/targeted"', f'"{evidence}/review-fixes"')
    if name == "browser":
        text = 'import net from "node:net";\n' + text
        old = 'const apiURL = "http://127.0.0.1:8018",\n  siteURL = "http://127.0.0.1:4174";'
        assert old in text
        text = text.replace(old, 'async function freePort() { const s=net.createServer(); await new Promise(r=>s.listen(0,"127.0.0.1",r)); const p=s.address().port; await new Promise(r=>s.close(r)); return p; }\nconst apiPort=await freePort(), sitePort=await freePort();\nconst apiURL=`http://127.0.0.1:${apiPort}`,siteURL=`http://127.0.0.1:${sitePort}`;')
        text = text.replace('"8018",', 'String(apiPort),').replace('"4174"', 'String(sitePort), "--strictPort"')
        old_cleanup = 'spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {\n        windowsHide: true,\n      });'
        assert old_cleanup in text
        text = text.replace(old_cleanup, 'await new Promise((done) => { const killer = spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { windowsHide: true }); killer.once("exit", done); });')
    assert 'path.join(root, "design' not in text
    (scratch / f"{name}.mjs").write_text(text, encoding="utf-8")
print(f"Prepared {len(names)} isolated replay suites in {scratch}")
