import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const evidence = path.join(root, "design/stage1-complete");
await mkdir(evidence, { recursive: true });
const downloads = path.join(root, "data", `stage1-downloads-${Date.now()}`);
await mkdir(downloads, { recursive: true });
async function freePort() {
  const s = net.createServer();
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  const p = s.address().port;
  await new Promise((r) => s.close(r));
  return p;
}
const apiPort = await freePort(),
  sitePort = await freePort(),
  apiURL = `http://127.0.0.1:${apiPort}`,
  siteURL = `http://127.0.0.1:${sitePort}`;
const database = path.join(root, "data", `stage1-${Date.now()}.sqlite3`);
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
      env: { ...process.env, ARITHMETIC_DB: database },
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
let serverErrors = "",
  browser;
for (const child of children)
  child.stderr.on("data", (v) => {
    serverErrors += v;
  });
async function until(check, description) {
  for (let i = 0; i < 200; i++) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Timed out: ${description} ${serverErrors}`);
}
async function api(route, method = "GET", body) {
  const r = await fetch(apiURL + route, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  assert(r.ok, await r.clone().text());
  return r.json();
}
async function button(page, label) {
  for (const target of await page.$$("button")) {
    if (
      await target.evaluate((el, text) => el.textContent.trim() === text, label)
    ) {
      await target.click();
      return;
    }
  }
  throw new Error("Missing button: " + label);
}
async function text(page, value) {
  try { await page.waitForFunction(
    (v) => document.body.innerText.includes(v),
    { polling: 100 },
    value,
  ); } catch(error) { console.error('Expected UI text:',value,'Actual:',await page.evaluate(()=>document.body.innerText.slice(0,5000))); throw error; }
}
async function capture(page, name) {
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "page overflow " + name,
  );
  await page.screenshot({ path: path.join(evidence, name), fullPage: true });
}
const checks = [],
  pageErrors = [];
const note = (check) => {
  checks.push(check);
  console.log("Passed: " + check);
};
const custom = {
  version: 1,
  operations: [
    {
      id: "addition",
      version: 1,
      share: "100",
      groups: [
        {
          id: "decimal-group",
          version: 1,
          name: 'Signed Δ, "測定"',
          share: "100",
          first: { min: "-0.125", max: "-0.125", decimalPlaces: 3 },
          second: { min: "0.25", max: "0.25", decimalPlaces: 2 },
          allowNegative: false,
        },
      ],
    },
  ],
  session: { format: "endless", durationSeconds: "120", countdown: false },
};
let standardFixture;
async function syntheticStandard(times = [100, 300, 500]) {
  const body = {
    config: standardFixture.config,
    seed: "stage1-synthetic",
    generatorVersion: "zetamac-reverse-v1",
    policyVersion: "equal-operations-v1",
    measurementVersion: "response-timing-v1",
    mode: "standard",
    contentVersion: "zetamac-default-v1",
  };
  const { id } = await api("/api/sessions", "POST", body);
  const events = [];
  const add = (type, elapsedMs, payload) =>
    events.push({ sequence: events.length, type, elapsedMs, payload });
  add("session-started", 0, { wallAt: new Date().toISOString() });
  let at = 0;
  times.forEach((t, i) => {
    const q = standardFixture.questions[i];
    add("question-presented", at, { question: q });
    add("input-changed", at + t / 2, { questionId: q.id, value: "" });
    at += t;
    add("input-changed", at, { questionId: q.id, value: q.expected });
    add("answer-accepted", at, { questionId: q.id, value: q.expected });
  });
  add("question-presented", at, {
    question: standardFixture.questions[times.length],
  });
  add("session-ended", 120000, {
    reason: "timeout",
    endTimeKnown: true,
    wallAt: new Date().toISOString(),
  });
  await api(`/api/sessions/${id}/observations`, "POST", { events });
  return id;
}
async function cleanup(child) {
  if (!child.pid || child.exitCode !== null) return;
  if (process.platform === "win32")
    await new Promise((r) => {
      const killer = spawn(
        "taskkill",
        ["/pid", String(child.pid), "/t", "/f"],
        { windowsHide: true },
      );
      killer.once("exit", r);
    });
  else child.kill();
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
  await api("/api/last-config", "PUT", custom);
  browser = await puppeteer.launch({
    executablePath:
      process.env.CHROME_PATH ||
      "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: true,
    args: [
      "--no-first-run",
      "--disable-background-timer-throttling",
      "--disable-background-networking",
    ],
    defaultViewport: { width: 1487, height: 1058 },
  });
  const page = await browser.newPage();
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await page.bringToFront();
  await page.evaluateOnNewDocument(() => {
    window.testAdvance = 0;
    const clock = performance.now.bind(performance);
    Object.defineProperty(performance, "now", {
      value: () => clock() + window.testAdvance,
    });
  });
  const cdp = await browser.target().createCDPSession(),
    doneDownloads = [];
  await cdp.send("Browser.setDownloadBehavior", {
    behavior: "allowAndName",
    downloadPath: downloads,
    eventsEnabled: true,
  });
  cdp.on("Browser.downloadProgress", (e) => {
    if (e.state === "completed") doneDownloads.push(e.guid);
  });
  async function download(format) {
    const before = doneDownloads.length;
    await button(page, "Export " + format.toUpperCase());
    await until(() => doneDownloads.length > before, "download");
    return readFile(path.join(downloads, doneDownloads[before]), "utf8");
  }
  await page.goto(siteURL);
  await text(page, "Start standard run");
  await page.waitForFunction(() =>
    [...document.querySelectorAll("button")].some(
      (b) => b.textContent.trim() === "Start standard run" && !b.disabled,
    ),
  );
  await page.evaluate(() => document.fonts.ready);
  standardFixture = await page.evaluate(async () => {
    const m = await import("/src/standard.ts");
    const generator = new m.StandardGenerator("stage1-synthetic");
    return {
      config: m.standardConfig(),
      questions: Array.from({ length: 6 }, () => generator.next()),
    };
  });
  await capture(page, "01-standard-home.png");
  await button(page, "Graphs");
  await text(page, "No saved history yet");
  await capture(page, "02-empty-graphs.png");
  await button(page, "History");
  await text(page, "No eligible full runs match");
  note(
    "default Standard entry, accessible navigation, meaningful empty history/graphs",
  );
  await button(page, "Standard Zetamac");
  const created = page.waitForResponse(
    (r) => r.url().endsWith("/api/sessions") && r.request().method() === "POST",
  );
  await button(page, "Start standard run");
  const standardId = (await (await created).json()).id;
  await page.waitForSelector('input[aria-label="Your answer"]');
  let stored;
  await until(async () => {
    stored = await api(`/api/sessions/${standardId}`);
    return stored.questions.length === 1;
  }, "standard presentation");
  assert.deepEqual(stored.config.session, {
    format: "timed",
    durationSeconds: "120",
    countdown: false,
  });
  assert.equal(stored.mode, "standard");
  assert.deepEqual((await api("/api/setup")).lastConfig, custom);
  await page.type(
    'input[aria-label="Your answer"]',
    stored.questions[0].expected,
  );
  await text(page, "1 completed");
  await page.evaluate(() => {
    window.testAdvance = 120001;
  });
  await button(page, "End session");
  await text(page, "Session saved to your local database.");
  await text(page, "Full timed run");
  const standardSaved = await api(`/api/sessions/${standardId}`);
  assert.equal(standardSaved.score, 1);
  assert(standardSaved.comparisonEligible);
  assert.equal(standardSaved.events.at(-1).elapsedMs, 120000);
  assert.equal(standardSaved.terminationReason, "timeout");
  assert.deepEqual(
    JSON.parse(await download("json")).sessions[0],
    standardSaved,
  );
  const standardCSV = await download("csv");
  assert(standardCSV.includes("zetamac-reverse-v1"));
  await capture(page, "03-standard-results.png");
  note(
    "standard direct fixed run, independent custom memory, exclusive cutoff, score/results/JSON/CSV trace",
  );
  await button(page, "Back to setup");
  await button(page, "Custom practice");
  await page.waitForSelector(".group-name");
  assert.equal(
    await page.$eval(".group-name", (el) => el.value),
    custom.operations[0].groups[0].name,
  );
  // A valid edit must survive immediate navigation before the debounce fires.
  custom.operations[0].groups[0].name += " remembered";
  await page.$eval('.group-name',(el,value)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));},custom.operations[0].groups[0].name);
  await button(page,'History');
  await until(async()=> (await api('/api/setup')).lastConfig.operations[0].groups[0].name===custom.operations[0].groups[0].name,'custom edit persistence across navigation');
  await page.goto(siteURL+'?view=custom');
  // The default editor mounts before its asynchronous saved setup has loaded.
  await page.waitForFunction((name) => document.querySelector('.group-name')?.value === name, {}, custom.operations[0].groups[0].name);
  assert.equal(await page.$eval('.group-name',el=>el.value),custom.operations[0].groups[0].name);
  note('valid custom edit survives immediate read-view navigation and custom reload without read-only mount writes');
  const customCreated = page.waitForResponse(
    (r) => r.url().endsWith("/api/sessions") && r.request().method() === "POST",
  );
  await button(page, "Start practice");
  const customId = (await (await customCreated).json()).id;
  await page.waitForSelector('input[aria-label="Your answer"]');
  await page.type('input[aria-label="Your answer"]', ".125");
  await text(page, "1 completed");
  await page.type('input[aria-label="Your answer"]', "unfinished Δ");
  await button(page, "End session");
  await text(page, "Session saved to your local database.");
  await text(page, "Partial run");
  const customSaved = await api(`/api/sessions/${customId}`);
  assert.equal(customSaved.summary.validCorrectAnswerCount, 1);
  assert.equal(customSaved.mode, "custom");
  assert.equal(customSaved.questions[0].expected, "0.125");
  assert.notEqual(customSaved.cohortKey, standardSaved.cohortKey);
  assert.deepEqual(JSON.parse(await download("json")).sessions[0], customSaved);
  assert((await download("csv")).includes("-0.125"));
  await button(page, "Open saved session");
  await text(page, "Exact question records");
  await capture(page, "04-custom-detail.png");
  note(
    "exact signed custom flow retains raw inputs and full saved details/provenance/graphs",
  );
  await syntheticStandard([800, 1200, 1600]);
  await syntheticStandard([400, 800, 1200]);
  await syntheticStandard([0, 0, 0]);
  await button(page, "Graphs");
  await text(page, "eligible full runs");
  await page.waitForSelector(".histogram-bar");
  const analytics = await api("/api/analytics");
  assert.equal(analytics.eligibleSessionCount, 4);
  assert.equal(analytics.trend.length, 4);
  assert.equal(analytics.summary.validCorrectAnswerCount, 10);
  assert.equal(
    analytics.histogram.reduce((n, b) => n + b.count, 0),
    10,
  );
  assert(analytics.breakdown.some((r) => r.level === "group"));
  await page.waitForSelector('svg[role="img"]');
  assert((await page.$$('svg[role="img"], svg[role="group"]')).length >= 4);
  assert((await page.$$('svg[role="group"] .interactive-point[role="button"]')).length > 0);
  await capture(page, "05-graphs-desktop.png");
  await (
    await page.$(".chart-section")
  ).screenshot({ path: path.join(evidence, "graphs-chronology-detail.png") });
  await page.click(".chart-table summary");
  assert((await page.$$(".chart-table table")).length >= 4);
  note(
    "real comparable chronology, deterministic histogram, operation/group breakdown and question sequence agree with backend",
  );
  for (const width of [768, 390]) {
    await page.setViewport({ width, height: 844 });
    await capture(page, `06-graphs-${width}.png`);
    if (width === 390)
      await (
        await page.$(".chart-section")
      ).screenshot({ path: path.join(evidence, "graphs-mobile-section.png") });
    if (width === 390) {
      assert(
        await page.$eval(".chart-scroll", (el) => {
          el.scrollLeft = el.scrollWidth;
          return el.scrollLeft > 0;
        }),
      );
      await (
        await page.$(".chart-section")
      ).screenshot({ path: path.join(evidence, "graphs-mobile-scrolled.png") });
      const summary = await page.$(".chart-table summary");
      const wasOpen = await summary.evaluate((el) => el.parentElement.open);
      await summary.focus();
      await page.keyboard.press("Enter");
      assert.equal(
        await summary.evaluate((el) => el.parentElement.open),
        !wasOpen,
      );
      await page.keyboard.press("Enter");
    }
  }
  await page.setViewport({ width: 1487, height: 1058 });
  await page.evaluate(() => {
    document.documentElement.style.zoom = "2";
  });
  await capture(page, "07-graphs-200-percent.png");
  await page.evaluate(() => {
    document.documentElement.style.zoom = "";
  });
  await page.setViewport({ width: 744, height: 529, deviceScaleFactor: 2 });
  await capture(page, "07-graphs-200-percent-reflow.png");
  await page.setViewport({ width: 1487, height: 1058, deviceScaleFactor: 1 });
  await page.keyboard.press("Tab");
  assert(await page.evaluate(() => document.activeElement !== document.body));
  note(
    "1487/768/390 layouts, 200 percent zoom, keyboard focus and equivalent chart tables",
  );
  await page.select(".filter-row select", customSaved.cohortKey);
  await text(page, "0 eligible full runs");
  await page.click(".partial-toggle input");
  await page.waitForSelector(".histogram-bar");
  await text(page, "1 valid timed correct answers");
  await capture(page, "10-partial-session-graphs.png");
  assert.equal(
    (
      await api(
        "/api/analytics?cohort=" +
          customSaved.cohortKey +
          "&includePartial=true",
      )
    ).trend.length,
    0,
  );
  await page.select(".filter-row select", standardSaved.cohortKey);
  await page.click(".partial-toggle input");
  await page.$eval('input[type="date"]', (el) => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    ).set;
    setter.call(el, "2099-01-01");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await text(page, "Selected group has no sessions in this date range");
  await text(page,"0 saved sessions");
  await page.$eval('input[type="date"]', (el) => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    ).set;
    setter.call(el, "");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await text(page, "4 eligible full runs");
  note(
    "partial observation inclusion keeps score trends separate; UTC date filtering preserves explicit cohort selection",
  );
  // History, graph and detail reads in a genuinely background tab must never
  // recover/end a live session or write the remembered configuration.
  await button(page, "Custom practice");
  const activeCreated = page.waitForResponse(
    (r) => r.url().endsWith("/api/sessions") && r.request().method() === "POST",
  );
  await button(page, "Start practice");
  const activeId = (await (await activeCreated).json()).id;
  await page.waitForSelector('input[aria-label="Your answer"]');
  await until(
    async () => (await api(`/api/sessions/${activeId}`)).questions.length === 1,
    "live observations",
  );
  const beforeEvents = (await api(`/api/sessions/${activeId}`)).events;
  await cdp.send("Target.createTarget", {
    url: siteURL + "?view=history&background-stage1",
    background: true,
  });
  const backgroundTarget = await browser.waitForTarget((t) =>
    t.url().includes("background-stage1"),
  );
  const background = await backgroundTarget.page();
  const mutations = [];
  background.on("request", (r) => {
    if (["POST", "PUT", "PATCH", "DELETE"].includes(r.method()))
      mutations.push(r.url());
  });
  await text(background, "matching sessions");
  await background.evaluate(() =>
    [...document.querySelectorAll("button")]
      .find((b) => b.textContent.trim() === "Graphs")
      .click(),
  );
  await text(background, "Practice graphs");
  await until(
    async () => (await background.$$(".data-chart")).length > 0,
    "background graphs",
  );
  assert(await page.evaluate(() => document.hasFocus()));
  assert.deepEqual(
    (await api(`/api/sessions/${activeId}`)).events,
    beforeEvents,
  );
  assert.deepEqual(mutations, []);
  await background.close();
  await button(page, "End session");
  await text(page, "Session saved to your local database.");
  await button(page, "Back to setup");
  note(
    "background history and graph reads leave live ownership/events/custom memory unchanged",
  );
  // Filter and pagination are actual UI operations, not just endpoints.
  for (let i = 0; i < 17; i++) await syntheticStandard([50]);
  await button(page, "History");
  // This inspection includes partial custom sessions, which are opt-in.
  await page.click(".partial-toggle input");
  await text(page, "matching sessions");
  assert.equal((await page.$$(".history-row")).length, 20);
  await button(page, "Next page");
  await until(
    async () => (await page.$$(".history-row")).length < 20,
    "history page 2",
  );
  await page.select(".filter-row select", "custom");
  await until(
    async () => (await page.$$(".history-row")).length === 2,
    "custom history filter",
  );
  await capture(page, "08-history-filtered.png");
  note("history pagination and mode filter expose real saved sessions");
  await button(page, "View session");
  await text(page, "Original configuration and provenance");
  const deletingId = await page.$eval(".provenance dd", (el) => el.textContent);
  await page.evaluate(
    (id) =>
      localStorage.setItem(
        "arithmetic.pending." + id,
        JSON.stringify({ id, events: [] }),
      ),
    deletingId,
  );
  await button(page, "Delete this session");
  await text(page, "pending data or another page owns");
  assert.equal((await api(`/api/sessions/${deletingId}`)).id, deletingId);
  assert(
    await page.evaluate(
      (id) => localStorage.getItem("arithmetic.pending." + id) !== null,
      deletingId,
    ),
  );
  await page.evaluate(
    (id) => localStorage.removeItem("arithmetic.pending." + id),
    deletingId,
  );
  await page.evaluate((id) => {
    window.heldForReview = false;
    void navigator.locks.request("arithmetic.session." + id, async () => {
      window.heldForReview = true;
      await new Promise((resolve) => {
        window.releaseForReview = resolve;
      });
    });
  }, deletingId);
  await page.waitForFunction(() => window.heldForReview === true);
  await button(page, "Delete this session");
  await text(page, "pending data or another page owns");
  assert.equal((await api(`/api/sessions/${deletingId}`)).id, deletingId);
  await page.evaluate(() => window.releaseForReview());
  page.once("dialog", (dialog) => dialog.dismiss());
  await button(page, "Delete this session");
  assert.equal((await api(`/api/sessions/${deletingId}`)).id, deletingId);
  note(
    "pending-journal protection and canceled destructive confirmation preserve records",
  );
  let failDelete = true,
    failRead = false,
    failGraph = false;
  await page.setRequestInterception(true);
  page.on("request", (r) => {
    if (r.method() === "DELETE" && failDelete) {
      failDelete = false;
      void r.respond({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Synthetic delete failure" }),
      });
    } else if (
      failRead &&
      r.method() === "GET" &&
      new URL(r.url()).pathname === "/api/sessions"
    ) {
      failRead = false;
      void r.respond({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Synthetic read failure" }),
      });
    } else if (
      failGraph &&
      r.method() === "GET" &&
      new URL(r.url()).pathname === "/api/analytics"
    ) {
      failGraph = false;
      void r.respond({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Synthetic graph failure" }),
      });
    } else void r.continue();
  });
  page.once("dialog", (dialog) => dialog.accept());
  await button(page, "Delete this session");
  await text(page, "Synthetic delete failure");
  assert.equal((await api(`/api/sessions/${deletingId}`)).id, deletingId);
  page.once("dialog", (dialog) => dialog.accept());
  await button(page, "Delete this session");
  await text(page, "Session history");
  assert.equal(
    (await fetch(apiURL + `/api/sessions/${deletingId}`)).status,
    404,
  );
  failRead = true;
  await button(page, "Refresh history");
  await text(page, "Synthetic read failure");
  await button(page, "Retry loading");
  await text(page, "matching sessions");
  note(
    "single deletion and history failures offer working retries and refresh saved records",
  );
  const oldScope = (await api("/api/sessions/deletion-preview")).sessionIds;
  let arrivingId;
  const dialogHandled = new Promise((resolve) =>
    page.once("dialog", async (dialog) => {
      assert(dialog.message().includes(`${oldScope.length} closed sessions`));
      arrivingId = await syntheticStandard([700]);
      await dialog.accept();
      resolve();
    }),
  );
  await button(page, "Delete all closed runs, including hidden runs");
  await dialogHandled;
  await until(
    async () => (await api("/api/sessions")).total === 1,
    "clear confirmed scope",
  );
  assert.equal((await api("/api/sessions")).sessions[0].id, arrivingId);
  assert.deepEqual((await api("/api/setup")).lastConfig, custom);
  assert.equal(
    (await api("/api/exports/sessions?format=json")).sessions.length,
    1,
  );
  note(
    "bulk deletion removes exactly confirmed closed scope, preserves arriving records and remembered setup",
  );
  await button(page, "Graphs");
  await text(page, "1 eligible full runs");
  await capture(page, "09-single-session-graphs.png");
  await page.select(".filter-row select", "");
  await page.select(
    ".filter-row select",
    (await api("/api/analytics")).selectedCohortKey,
  );
  await page.waitForSelector(".histogram-bar");
  failGraph = true;
  await button(page, "Refresh graphs");
  await text(page, "Synthetic graph failure");
  await button(page, "Retry loading");
  await page.waitForSelector(".histogram-bar");
  note("graph loading failure offers retry without modifying observations");
  assert.deepEqual(pageErrors, []);
  const report = {
    verifiedAt: new Date().toISOString(),
    synthetic: true,
    database: path.basename(database),
    apiPort,
    sitePort,
    checks,
    pageErrors,
    standardTrace: standardSaved,
    customTrace: customSaved,
    multiSessionAnalytics: analytics,
    virtualDeadline:
      "Synthetic performance.now offset tests standard fixed-duration execution; original real-clock deadline suites also rerun.",
    visualEvidence: [
      "01-standard-home.png",
      "02-empty-graphs.png",
      "03-standard-results.png",
      "04-custom-detail.png",
      "05-graphs-desktop.png",
      "06-graphs-768.png",
      "06-graphs-390.png",
      "07-graphs-200-percent.png",
      "07-graphs-200-percent-reflow.png",
      "08-history-filtered.png",
      "09-single-session-graphs.png",
      "10-partial-session-graphs.png",
      "graphs-chronology-detail.png",
      "graphs-mobile-section.png",
      "graphs-mobile-scrolled.png",
    ],
  };
  await writeFile(
    path.join(evidence, "report.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify({ result: "passed", checks: checks.length, pageErrors }),
  );
} finally {
  if (browser) await browser.close();
  for (const child of children) await cleanup(child);
}
