"""Copy existing browser suites to isolated ports/evidence; assertions unchanged.

Run the generated files sequentially. Historical design/review evidence is never
overwritten; every suite already owns a unique synthetic database/browser profile.
"""
from pathlib import Path

root = Path(__file__).resolve().parents[1]
scratch = root / "data/fix-2026-10-15-replays"
scratch.mkdir(parents=True, exist_ok=True)
evidence = "docs/reviews/evidence-2026-10-15-fixes"
for name in ("browser", "review-regressions", "exports-browser", "stage1-browser"):
    text = (root / f"web/tests/{name}.mjs").read_text(encoding="utf-8")
    text = text.replace('import puppeteer from "puppeteer-core";', 'import { createRequire } from "node:module";\nconst puppeteer = createRequire(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../web/package.json"))("puppeteer-core");')
    text = text.replace('path.join(root, "design/review-fixes-report.json")', f'path.join(root, "{evidence}/recovery-report.json")')
    text = text.replace('path.join(root, "design", "timing-exports")', f'path.join(root, "{evidence}/exports")')
    text = text.replace('path.join(root, "design/stage1-complete")', f'path.join(root, "{evidence}/platform")')
    text = text.replace('path.join(root, "design")', f'path.join(root, "{evidence}/baseline")')
    if name == "browser":
        text = 'import net from "node:net";\n' + text
        old = 'const apiURL = "http://127.0.0.1:8018",\n  siteURL = "http://127.0.0.1:4174";'
        assert old in text
        text = text.replace(old, 'async function freePort() { const s=net.createServer(); await new Promise(r=>s.listen(0,"127.0.0.1",r)); const p=s.address().port; await new Promise(r=>s.close(r)); return p; }\nconst apiPort=await freePort(), sitePort=await freePort();\nconst apiURL=`http://127.0.0.1:${apiPort}`,siteURL=`http://127.0.0.1:${sitePort}`;')
        text = text.replace('"8018",', 'String(apiPort),').replace('"4174"', 'String(sitePort), "--strictPort"')
        # Await cleanup of the exact child PIDs before the next suite starts.
        old_cleanup = 'spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {\n        windowsHide: true,\n      });'
        assert old_cleanup in text
        text = text.replace(old_cleanup, 'await new Promise((done) => { const killer = spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { windowsHide: true }); killer.once("exit", done); });')
    assert 'path.join(root, "design' not in text
    (scratch / f"{name}.mjs").write_text(text, encoding="utf-8")
print(f"Prepared four isolated replay suites in {scratch}")
