from pathlib import Path
root=Path(__file__).resolve().parents[3]
scratch=root/'data/review-2026-10-14-correctness'
scratch.mkdir(exist_ok=True)
for name in ['review-regressions','exports-browser','stage1-browser','browser']:
 text=(root/f'web/tests/{name}.mjs').read_text(encoding='utf-8')
 text=text.replace('import puppeteer from "puppeteer-core";','import { createRequire } from "node:module";\nconst puppeteer = createRequire(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../web/package.json"))("puppeteer-core");')
 text=text.replace('path.join(root, "design/review-fixes-report.json")','path.join(root, "docs/reviews/evidence-2026-10-14-correctness/recovery-report.json")')
 text=text.replace('path.join(root, "design", "timing-exports")','path.join(root, "docs/reviews/evidence-2026-10-14-correctness/exports")')
 text=text.replace('path.join(root, "design/stage1-complete")','path.join(root, "docs/reviews/evidence-2026-10-14-correctness/platform")')
 if name=='browser':
  text='import net from "node:net";\n'+text
  text=text.replace('path.join(root, "design")','path.join(root, "docs/reviews/evidence-2026-10-14-correctness/baseline")')
  text=text.replace('const apiURL = "http://127.0.0.1:8018",\n  siteURL = "http://127.0.0.1:4174";','async function freePort() { const s=net.createServer(); await new Promise(r=>s.listen(0,"127.0.0.1",r)); const p=s.address().port; await new Promise(r=>s.close(r)); return p; }\nconst apiPort=await freePort(), sitePort=await freePort();\nconst apiURL=`http://127.0.0.1:${apiPort}`,siteURL=`http://127.0.0.1:${sitePort}`;')
  text=text.replace('"8018",','String(apiPort),').replace('"4174"','String(sitePort)')
 (scratch/f'{name}.mjs').write_text(text,encoding='utf-8')
print('Prepared isolated replay copies with dynamic ports and reviewer-owned evidence paths. Tests/assertions unchanged.')
