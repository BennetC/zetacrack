// Graph/history/reload integration tests. All records belong to a fresh synthetic DB.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const evidence =
  process.env.ARITHMETIC_EVIDENCE_DIR ||
  path.join(root, "design/explorer-2026-11-05");
await mkdir(evidence, { recursive: true });
await mkdir(path.join(root, "data"), { recursive: true });
async function freePort() {
  const server = net.createServer();
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  await new Promise((r) => server.close(r));
  return port;
}
const apiPort = await freePort(),
  sitePort = await freePort();
const apiURL = `http://127.0.0.1:${apiPort}`,
  siteURL = `http://127.0.0.1:${sitePort}`;
const children = [
  spawn(
    path.join(root, ".venv/Scripts/python.exe"),
    [
      "-m",
      "uvicorn",
      "server.app:app",
      "--host",
      "127.0.0.1",
      "--port",
      String(apiPort),
    ],
    {
      cwd: root,
      env: {
        ...process.env,
        ARITHMETIC_DB: path.join(
          root,
          "data",
          `improvements-${Date.now()}.sqlite3`,
        ),
      },
      windowsHide: true,
    },
  ),
  spawn(
    process.execPath,
    [
      path.join(root, "web/node_modules/vite/bin/vite.js"),
      "--port",
      String(sitePort),
      "--strictPort",
    ],
    {
      cwd: path.join(root, "web"),
      env: { ...process.env, ARITHMETIC_API_URL: apiURL },
      windowsHide: true,
    },
  ),
];
let browser,
  page,
  serverErrors = "";
const checks = [],
  pageErrors = [];
for (const child of children)
  child.stderr.on("data", (data) => {
    serverErrors += data;
  });
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(check, label) {
  for (let i = 0; i < 150; i++) {
    if (await check()) return;
    await delay(100);
  }
  throw Error(`Timed out: ${label}\n${serverErrors.slice(-2000)}`);
}
async function api(route, method = "GET", body) {
  const response = await fetch(apiURL + route, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  assert(response.ok, await response.clone().text());
  return response.json();
}
async function button(label) {
  for (const el of await page.$$("button")) {
    if ((await el.evaluate((e) => e.textContent.trim(), label)) === label)
      return el.click();
  }
  throw Error(`Missing button: ${label}`);
}
async function text(value) {
  await page.waitForFunction(
    (value) => document.body.innerText.includes(value),
    {},
    value,
  );
}
async function connected() {
  await page.waitForFunction(() =>
    [...document.querySelectorAll("button")].some(
      (b) =>
        ["Start practice", "Start standard run"].includes(
          b.textContent.trim(),
        ) && !b.disabled,
    ),
  );
}
async function screenshot(name) {
  await page.screenshot({
    path: path.join(evidence, name + ".png"),
    fullPage: true,
  });
}
function note(message) {
  checks.push(message);
  console.log("Passed: " + message);
}
const restartKey = "arithmetic.reload-restart.v1";
async function marker() {
  return page.evaluate(
    (key) => JSON.parse(sessionStorage.getItem(key)),
    restartKey,
  );
}
async function run(action) {
  const created = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/sessions") &&
      r.request().method() === "POST" &&
      r.status() === 201,
  );
  await action();
  const { id } = await (await created).json();
  await page.waitForSelector('input[aria-label="Your answer"]');
  await until(
    async () =>
      (await api(`/api/sessions/${id}`)).events.some(
        (e) => e.type === "question-presented",
      ),
    "first persisted question",
  );
  return api(`/api/sessions/${id}`);
}
async function stop() {
  await button("End session");
  await text("Session saved to your local database.");
}

async function input(selector, value) {
  await page.$eval(
    selector,
    (el, value) => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      ).set.call(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    },
    value,
  );
}
async function selectState(value) {
  await page.evaluate((value) => {
    const el = [...document.querySelectorAll("select")].find((s) =>
      [...s.options].some((o) => o.value === "ongoing"),
    );
    el.value = value;
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

try {
  await Promise.all(
    [apiURL + "/api/setup", siteURL].map((url) =>
      until(async () => {
        try {
          return (await fetch(url)).ok;
        } catch {
          return false;
        }
      }, "startup"),
    ),
  );
  browser = await puppeteer.launch({
    executablePath:
      process.env.CHROME_PATH ||
      "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: true,
    args: ["--no-first-run", "--disable-background-timer-throttling"],
    defaultViewport: { width: 1440, height: 1000 },
  });
  page = await browser.newPage();
  let failComparisons = false,
    omitExplorer = false,
    holdCreation = false,
    releaseCreation;
  await page.setRequestInterception(true);
  page.on("request", async (req) => {
    if (omitExplorer && /\/api\/sessions\/[^/?]+$/.test(req.url())) {
      const saved = await api(new URL(req.url()).pathname);
      delete saved.runAnalytics;
      await req.respond({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(saved),
      });
    } else if (failComparisons && req.url().includes("/api/explorer/")) {
      await req.respond({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Synthetic comparison failure" }),
      });
    } else {
      if (
        holdCreation &&
        req.url().endsWith("/api/sessions") &&
        req.method() === "POST"
      )
        await new Promise((resolve) => {
          releaseCreation = resolve;
        });
      await req.continue();
    }
  });
  await page.evaluateOnNewDocument(() => {
    window.__sawSetup = false;
    new MutationObserver(() => {
      if (document.querySelector(".product-nav")) window.__sawSetup = true;
    }).observe(document, { childList: true, subtree: true });
  });
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await page.bringToFront();
  await page.goto(siteURL);
  await connected();
  const fixture = await page.evaluate(async () => {
    const { standardConfig, StandardGenerator } = await import(
      "/src/standard.ts"
    );
    const g = new StandardGenerator("explorer-fixture");
    return {
      config: standardConfig(),
      questions: Array.from({ length: 9 }, () => g.next()),
    };
  });
  const body = {
    config: fixture.config,
    seed: "explorer-fixture",
    mode: "standard",
    generatorVersion: "zetamac-reverse-v1",
    policyVersion: "equal-operations-v1",
    contentVersion: "zetamac-default-v1",
    measurementVersion: "response-timing-v1",
  };
  async function recorded(multiplier) {
    const { id } = await api("/api/sessions", "POST", body);
    const events = [],
      push = (type, elapsedMs, payload) =>
        events.push({ sequence: events.length, type, elapsedMs, payload });
    push("session-started", 0, { wallAt: new Date().toISOString() });
    let t = 0;
    for (const [i, q] of fixture.questions.entries()) {
      push("question-presented", t, { question: q });
      if (i === 8) break;
      const expected = q.expected;
      const wrong =
        expected.slice(0, -1) + (expected.endsWith("1") ? "2" : "1");
      push("input-changed", t + 100, {
        questionId: q.id,
        value: expected.slice(0, 1),
        inputType: "insertText",
      });
      if (i % 2 === 0) {
        push("input-changed", t + 200, {
          questionId: q.id,
          value: wrong,
          inputType: "insertText",
        });
        push("input-changed", t + 300, {
          questionId: q.id,
          value: expected.slice(0, -1),
          inputType: "deleteContentBackward",
        });
      }
      t += (i + 1) * multiplier + 500;
      push("input-changed", t, {
        questionId: q.id,
        value: expected,
        inputType: "insertText",
      });
      push("answer-accepted", t, { questionId: q.id, value: expected });
    }
    push("session-ended", 120000, {
      reason: "timeout",
      endTimeKnown: true,
      wallAt: new Date().toISOString(),
    });
    await api(`/api/sessions/${id}/observations`, "POST", { events });
    return id;
  }
  const first = await recorded(200),
    id = await recorded(300);
  await page.goto(`${siteURL}/?view=history&session=${id}`);
  await text("Run explorer");
  await text("Arithmetic & input profile");
  await until(
    async () => (await page.$$(".profile-cell")).length > 0,
    "profiles",
  );
  assert.equal((await api(`/api/explorer/${id}`)).comparisons[0].id, first);
  note(
    "Explorer renders recorded timings, revisions, splits, exact-cohort ghosts and sample-counted profiles",
  );
  const paceSelector =
    'svg[aria-label="Cumulative valid completions over elapsed time"]';
  const curves = await page.$$eval(paceSelector + " polyline", (els) =>
    els.map((el) =>
      el
        .getAttribute("points")
        .split(" ")
        .map((p) => p.split(",").map(Number)),
    ),
  );
  assert.equal(curves.length, 2);
  assert(curves.every((points) => points.flat().every(Number.isFinite)));
  assert(
    curves.every((points) =>
      points.some(
        (p, i) => i && p[0] === points[i - 1][0] && p[1] < points[i - 1][1],
      ),
    ),
  );
  await (
    await page.$(paceSelector)
  ).screenshot({ path: path.join(evidence, "pace-comparison.png") });
  await page.select('select[aria-label="Pace comparison"]', "target");
  assert.equal(
    await page.$$eval(paceSelector + " polyline", (els) => els.length),
    2,
  );
  await page.select('select[aria-label="Pace comparison"]', "typical");
  assert.equal(
    await page.$$eval(paceSelector + " polyline", (els) => els.length),
    2,
  );
  await page.select('select[aria-label="Pace comparison"]', "previous");
  note(
    "Pace SVG renders finite exact completion steps, previous, target and median comparisons",
  );
  await button("Next edit");
  assert.notEqual(
    await page.$eval('output[aria-label="Replayed answer"]', (el) =>
      el.textContent.trim(),
    ),
    "",
  );
  await button("Play replay");
  await delay(150);
  await button("Pause replay");
  await page.focus('input[aria-label="Replay position"]');
  await page.keyboard.press("End");
  await page.waitForFunction(
    (expected) =>
      document.querySelector('output[aria-label="Replayed answer"]')
        .textContent === expected,
    {},
    fixture.questions[0].expected,
  );
  await button("Previous edit");
  assert.equal(
    await page.$eval(
      'output[aria-label="Replayed answer"]',
      (el) => el.textContent,
    ),
    fixture.questions[0].expected.slice(0, -1),
  );
  await button("Next edit");
  assert.equal(
    await page.$eval(
      'output[aria-label="Replayed answer"]',
      (el) => el.textContent,
    ),
    fixture.questions[0].expected,
  );
  note("Answer replay supports event stepping, playback, pause and scrubbing");
  const mark = await page.$(
    '.question-mark[aria-label^="Inspect question 2:"]',
  );
  await mark.evaluate((el) => el.focus());
  await page.keyboard.press("Enter");
  await text("Question 2 · correction label");
  await page.select('select[aria-label="Correction label"]', "recalculated");
  await until(
    async () =>
      (await api(`/api/sessions/${id}`)).annotations.some(
        (a) => a.label === "recalculated",
      ),
    "label persisted",
  );
  assert.equal(
    await page.$eval('select[aria-label="Correction label"]', (el) => el.value),
    "recalculated",
  );
  note(
    "Keyboard question selection and persisted user labels preserve focus and immutable raw events",
  );
  await page.click('input[aria-label="Select question 1"]');
  await button("Create Custom practice from selection");
  await text("Custom practice created from your selected questions");
  assert.equal(await page.$('input[aria-label="Your answer"]'), null);
  await until(
    async () => Boolean((await api("/api/setup")).lastConfig),
    "selected setup saved",
  );
  const remembered = (await api("/api/setup")).lastConfig;
  assert.equal(
    remembered.operations.reduce((n, op) => n + op.groups.length, 0),
    2,
  );
  note(
    "Practice from selected questions opens exact singleton Custom groups without auto-starting",
  );
  await page.goto(`${siteURL}/?view=history&session=${id}`);
  await text("Run explorer");
  const challenge = await run(() => button("Start same-seed challenge"));
  assert.equal(challenge.replayOf, id);
  assert.equal(challenge.seed, body.seed);
  assert.equal(challenge.questions[0].left, fixture.questions[0].left);
  await page.type('input[aria-label="Your answer"]', "x");
  await page.focus('input[aria-label="Your answer"]');
  await page.keyboard.press("Backspace");
  await input(
    'input[aria-label="Your answer"]',
    "unknown-composition-metadata",
  );
  // A live challenge must survive deletion of its older, closed ancestor.
  await api(`/api/sessions/${id}`, "DELETE");
  const freshResponse = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/sessions") &&
      r.request().method() === "POST" &&
      r.status() === 201,
  );
  holdCreation = true;
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="reload-transition"]');
  assert.equal(await page.$(".product-nav"), null);
  await screenshot("reload-transition");
  await until(() => Boolean(releaseCreation), "held restart creation");
  holdCreation = false;
  releaseCreation();
  const freshId = (await (await freshResponse).json()).id;
  await page.waitForSelector('input[aria-label="Your answer"]');
  assert.equal(await page.evaluate(() => window.__sawSetup), false);
  assert.equal(
    await page.$eval(
      'input[aria-label="Your answer"]',
      (el) => el === document.activeElement,
    ),
    true,
  );
  note(
    "Reload preserves the run layout without a setup flash and focuses the fresh answer after creation",
  );
  await delay(650);
  const fresh = await api(`/api/sessions/${freshId}`);
  assert.equal(fresh.replayOf, challenge.id);
  assert.equal(fresh.seed, body.seed);
  assert.deepEqual((await api("/api/setup")).lastConfig, remembered);
  await stop();
  const challengeSaved = await api(`/api/sessions/${challenge.id}`);
  assert(!challengeSaved.comparisonEligible);
  const edit = challengeSaved.events.find((e) => e.type === "input-changed");
  assert.equal(edit.payload.telemetryVersion, "answer-edits-v2");
  assert.equal(typeof edit.payload.beforeValue, "string");
  assert.equal(typeof edit.payload.isComposing, "boolean");
  assert(
    challengeSaved.events.some(
      (e) => e.type === "input-changed" && e.payload.isComposing === null,
    ),
  );
  note(
    "Same-seed challenge and reload preserve seed/exclusion and remembered setup; real edits capture versioned field telemetry",
  );
  await page.goto(`${siteURL}/?view=history&session=${first}`);
  await text("Run explorer");
  await text("No earlier eligible run in this exact comparison group.");
  assert.equal(
    await page.$$eval(paceSelector + " polyline", (els) => els.length),
    1,
  );
  await page.select('select[aria-label="Pace comparison"]', "target");
  assert.equal(
    await page.$$eval(paceSelector + " polyline", (els) => els.length),
    2,
  );
  failComparisons = true;
  await page.reload();
  await text("Synthetic comparison failure");
  assert.equal(
    await page.$$eval(paceSelector + " polyline", (els) => els.length),
    1,
  );
  failComparisons = false;
  await button("Retry pace comparison");
  await text("No earlier eligible run in this exact comparison group.");
  note(
    "Missing earlier ghosts and comparison failures have explicit states and recover in place",
  );
  omitExplorer = true;
  await page.reload();
  await text("Run explorer data is unavailable.");
  await text("Exact question records");
  omitExplorer = false;
  await button("Retry loading");
  await text("Run explorer");
  note(
    "An older session response without explorer data keeps the saved session usable and supports retry",
  );
  await delay(500);
  await screenshot("explorer-desktop");
  await page.$eval(".run-explorer", (el) => el.scrollIntoView());
  await page.screenshot({ path: path.join(evidence, "explorer-overview.png") });
  await page.setViewport({ width: 390, height: 844 });
  await delay(250);
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  await screenshot("explorer-mobile");
  assert.deepEqual(pageErrors, []);
  note("Desktop/mobile render without page overflow or JavaScript errors");
  await writeFile(
    path.join(evidence, "report.json"),
    JSON.stringify(
      { synthetic: true, checks, pageErrors, apiPort, sitePort },
      null,
      2,
    ),
  );
} catch (error) {
  if (page) {
    await screenshot("failure").catch(() => {});
    console.error(
      await page
        .evaluate(() => document.body.innerText.slice(-2000))
        .catch(() => ""),
    );
  }
  throw error;
} finally {
  if (browser) await browser.close();
  for (const child of children)
    if (child.pid && child.exitCode === null)
      await new Promise((r) => {
        const killer = spawn(
          "taskkill",
          ["/pid", String(child.pid), "/t", "/f"],
          { windowsHide: true },
        );
        killer.once("exit", r);
      });
}
