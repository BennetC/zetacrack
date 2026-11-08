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
const evidence = path.join(root, "design/improvements-2026-11-03");
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
    args: [
      "--no-first-run",
      "--disable-background-timer-throttling",
      "--disable-background-networking",
    ],
    defaultViewport: { width: 1440, height: 1000 },
  });
  page = await browser.newPage();
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.bringToFront();
  await page.evaluateOnNewDocument(() => {
    const clock = performance.now.bind(performance);
    window.testAdvance = 0;
    Object.defineProperty(performance, "now", {
      value: () => clock() + window.testAdvance,
    });
  });
  await page.goto(siteURL);
  await connected();
  const fixture = await page.evaluate(async () => {
    const { standardConfig, StandardGenerator } = await import(
      "/src/standard.ts"
    );
    const generator = new StandardGenerator("improvement-fixture");
    return {
      config: standardConfig(),
      questions: Array.from({ length: 5 }, () => generator.next()),
    };
  });
  async function synthetic(times, reason = "timeout") {
    const { id } = await api("/api/sessions", "POST", {
      config: fixture.config,
      seed: "fixture",
      generatorVersion: "zetamac-reverse-v1",
      policyVersion: "equal-operations-v1",
      measurementVersion: "response-timing-v1",
      mode: "standard",
      contentVersion: "zetamac-default-v1",
    });
    const events = [];
    const add = (type, elapsedMs, payload) =>
      events.push({ sequence: events.length, type, elapsedMs, payload });
    add("session-started", 0, {});
    let at = 0;
    times.forEach((duration, i) => {
      const q = fixture.questions[i];
      add("question-presented", at, { question: q });
      at += duration;
      add("input-changed", at, { questionId: q.id, value: q.expected });
      add("answer-accepted", at, { questionId: q.id, value: q.expected });
    });
    add("question-presented", at, {
      question: fixture.questions[times.length],
    });
    add("session-ended", reason === "timeout" ? 120000 : at + 1, {
      reason,
      endTimeKnown: true,
    });
    await api(`/api/sessions/${id}/observations`, "POST", { events });
    return id;
  }
  const fullIds = [];
  for (const times of [[100], [200, 200, 800], [1000, 3000], []])
    fullIds.push(await synthetic(times));
  await synthetic([90000], "manual-end");
  await page.goto(siteURL + "?view=graphs");
  await text("Full-run statistics");
  // Cohort selection can replace loaded data once after the first render.
  // Wait for and snapshot this panel atomically rather than retaining its DOM.
  const statsHandle = await page.waitForFunction(() =>
    document.querySelector(".full-run-statistics")?.innerText || false,
  );
  const statsText = await statsHandle.jsonValue();
  for (const value of [
    "1.50",
    "0.88s",
    "0.50s",
    "0.83s",
    "0.40s",
    "0.77s",
    "0.20s",
    "4 eligible full runs",
    "6 valid correct answers",
    "3 runs with valid timings",
  ])
    assert(statsText.includes(value), value);
  await page.click(".partial-toggle input");
  await text("Full-run statistics");
  assert.equal(
    await page.$eval(".full-run-statistics", (e) => e.innerText),
    statsText,
  );
  await screenshot("graphs-desktop");
  await page.setViewport({ width: 390, height: 844 });
  await screenshot("graphs-mobile");
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.setViewport({ width: 1440, height: 1000 });
  note(
    "Graphs display backend score, pooled timing and equally weighted run timing; partial toggle leaves headline statistics unchanged; desktop/mobile render",
  );

  await button("History");
  await text("4 matching sessions");
  assert.equal(
    await page.$eval(".partial-toggle input", (e) => e.checked),
    false,
  );
  assert.equal(await page.$$(".history-row").then((rows) => rows.length), 4);
  await page.click(".partial-toggle input");
  await text("5 matching sessions");
  for (let i = 0; i < 20; i++) fullIds.push(await synthetic([]));
  await button("Refresh history");
  await text("1–20 of 25");
  await button("Next page");
  await text("21–25 of 25");
  await page.click(".partial-toggle input");
  await text("1–20 of 24");
  await button("Next page");
  await text("21–24 of 24");
  await api("/api/sessions", "DELETE", { sessionIds: fullIds.slice(1) });
  await button("Refresh history");
  await text("1–1 of 1");
  await page.select(".filter-row select", "custom");
  await text("No eligible full runs match these filters");
  await page.select(".filter-row select", "standard");
  await text("1 matching sessions");
  await screenshot("history-desktop");
  await page.setViewport({ width: 390, height: 844 });
  await screenshot("history-mobile");
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.setViewport({ width: 1440, height: 1000 });
  note(
    "History defaults to eligible only, opt-in shows excluded, filtering/paging counts are correct, and external deletion clamps the page",
  );

  await page.goto(siteURL);
  await connected();
  let current = await run(() => button("Start standard run"));
  const original = current;
  await page.type('input[aria-label="Your answer"]', "unfinished");
  let postCount = 0;
  const countPosts = (request) => {
    if (request.url().endsWith("/api/sessions") && request.method() === "POST")
      postCount++;
  };
  page.on("request", countPosts);
  current = await run(() => page.reload());
  await delay(300);
  assert.equal(postCount, 1, "StrictMode must create one session");
  assert.notEqual(current.id, original.id);
  assert.notEqual(current.seed, original.seed);
  assert.deepEqual(current.config, original.config);
  await until(
    async () => (await api(`/api/sessions/${original.id}`)).status === "ended",
    "previous run saved",
  );
  const previous = await api(`/api/sessions/${original.id}`);
  assert(!previous.comparisonEligible);
  assert(
    previous.events.some(
      (e) => e.type === "input-changed" && e.payload.value === "unfinished",
    ),
  );
  const repeated = await run(() => page.reload());
  assert.notEqual(repeated.id, current.id);
  // Browser-toolbar reloads may blur the window before pagehide.
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  current = await run(() => page.reload());
  assert.notEqual(current.id, repeated.id);
  page.off("request", countPosts);
  note(
    "Standard reload/repeated reload/blur-before-reload create fresh runs exactly once and preserve previous raw observations",
  );
  await stop();
  assert.equal(await marker(), null);
  const countBefore = (await api("/api/sessions")).total;
  await page.reload();
  await connected();
  await delay(200);
  assert.equal((await api("/api/sessions")).total, countBefore);
  note("Manual-ended results reload returns to setup without creating a run");

  const custom = {
    version: 1,
    operations: [
      {
        id: "addition",
        version: 1,
        share: "100",
        groups: [
          {
            id: "reload-group",
            version: 1,
            name: "Reload practice",
            share: "100",
            first: { min: "10", max: "10", decimalPlaces: 0 },
            second: { min: "11", max: "11", decimalPlaces: 0 },
            allowNegative: false,
          },
        ],
      },
    ],
    session: { format: "timed", durationSeconds: "120", countdown: true },
  };
  await api("/api/last-config", "PUT", custom);
  await page.goto(siteURL + "?view=custom");
  await connected();
  const countdownCreated = page.waitForResponse(
    (r) => r.url().endsWith("/api/sessions") && r.request().method() === "POST",
  );
  await button("Start practice");
  const countdownId = (await (await countdownCreated).json()).id;
  await text("Get ready");
  current = await run(() => page.reload());
  assert.equal(current.config.session.countdown, false);
  assert.equal(current.mode, "custom");
  assert.equal(current.config.session.durationSeconds, "120");
  assert.deepEqual(current.config.operations, custom.operations);
  assert.deepEqual((await api("/api/setup")).lastConfig, custom);
  await until(
    async () => (await api(`/api/sessions/${countdownId}`)).status === "ended",
    "countdown recovered",
  );
  current = await run(() => page.reload());
  assert.equal(current.config.session.countdown, false);
  await screenshot("reloaded-custom-run");
  await stop();
  note(
    "Custom countdown and active timed reload skip countdown, preserve content/duration and leave remembered settings unchanged",
  );

  custom.session = {
    format: "endless",
    durationSeconds: "120",
    countdown: false,
  };
  await api("/api/last-config", "PUT", custom);
  await page.goto(siteURL + "?view=custom");
  await connected();
  current = await run(() => button("Start practice"));
  current = await run(() => page.reload());
  assert.equal(current.config.session.format, "endless");
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await text("Ended when the window lost focus.");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  assert.equal(await marker(), null);
  await page.reload();
  await connected();
  note(
    "Endless reload restarts; returning focus to focus-loss results clears restart intent",
  );

  await page.goto(siteURL);
  await connected();
  await run(() => button("Start standard run"));
  await page.evaluate(() => {
    window.testAdvance = 120001;
  });
  await text("Time is up.");
  assert.equal(await marker(), null);
  await page.reload();
  await connected();
  note("Timed-out results reload does not start another run");

  // Hold setup and make prior-run recovery fail: neither may block replacement.
  current = await run(() => button("Start standard run"));
  // An independent abandoned journal makes the recovery-failure case stable
  // even when the unloading run's beacon saves before the next page mounts.
  const { id: recoveryId } = await api("/api/sessions", "POST", {
    config: fixture.config,
    seed: "abandoned-recovery-fixture",
    generatorVersion: "zetamac-reverse-v1",
    policyVersion: "equal-operations-v1",
    measurementVersion: "response-timing-v1",
    mode: "standard",
    contentVersion: "zetamac-default-v1",
  });
  await page.evaluate(
    (id) =>
      localStorage.setItem(
        "arithmetic.pending." + id,
        JSON.stringify({ id, events: [] }),
      ),
    recoveryId,
  );
  let failStart = true,
    holdSetup = true;
  const held = [];
  await page.setRequestInterception(true);
  const interceptor = (request) => {
    if (request.url().endsWith("/api/setup") && holdSetup) {
      held.push(request);
      return;
    }
    if (
      request.url().endsWith("/api/sessions") &&
      request.method() === "POST" &&
      failStart
    ) {
      failStart = false;
      return request.respond({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Synthetic start failure" }),
      });
    }
    if (
      request.url().endsWith(`/api/sessions/${recoveryId}`) &&
      request.method() === "GET"
    ) {
      return request.respond({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Synthetic recovery failure" }),
      });
    }
    return request.continue();
  };
  page.on("request", interceptor);
  await page.reload({ waitUntil: "domcontentloaded" });
  await text("Retry automatic restart");
  current = await run(() => button("Retry automatic restart"));
  assert(held.length > 0, "setup is still held while replacement runs");
  holdSetup = false;
  for (const request of held) await request.continue();
  await text("Synthetic recovery failure");
  assert(
    await page.evaluate(
      (id) => localStorage.getItem("arithmetic.pending." + id) !== null,
      recoveryId,
    ),
  );
  page.off("request", interceptor);
  await page.setRequestInterception(false);
  await button("Retry recovery");
  await until(
    async () => !(await page.$('[data-testid="recovery-error"]')),
    "recovery retry",
  );
  await stop();
  note(
    "Failed automatic start offers retry; replacement does not await setup or recovery; recovery warning and retained journal remain accessible during the new run",
  );

  const observer = await browser.newPage();
  await observer.goto(siteURL); // ordinary navigation must not use another tab's marker
  await page.bringToFront();
  await page.goto(siteURL);
  await connected();
  current = await run(() => button("Start standard run"));
  await observer.reload();
  assert.equal((await api(`/api/sessions/${current.id}`)).status, "open");
  // A copied marker on a navigate or read-only reload cannot cause a restart.
  const candidate = await marker();
  const beforeCopyReload = (await api("/api/sessions")).total;
  await observer.evaluate(
    (candidate) =>
      sessionStorage.setItem(
        "arithmetic.reload-restart.v1",
        JSON.stringify(candidate),
      ),
    candidate,
  );
  await observer.reload();
  await observer.waitForFunction(() =>
    document.body.innerText.includes("still owned by another tab"),
  );
  assert.equal((await api("/api/sessions")).total, beforeCopyReload);
  await observer.evaluate(
    (candidate) =>
      sessionStorage.setItem(
        "arithmetic.reload-restart.v1",
        JSON.stringify(candidate),
      ),
    candidate,
  );
  await observer.goto(siteURL + "?view=history");
  await observer.reload();
  assert.equal((await api(`/api/sessions/${current.id}`)).status, "open");
  await observer.close();
  await page.bringToFront();
  await stop();
  note(
    "Background-tab reload leaves owned practice untouched; copied markers and History entry do not start runs",
  );
  assert.deepEqual(pageErrors, []);
  await writeFile(
    path.join(evidence, "report.json"),
    JSON.stringify(
      { synthetic: true, checks, pageErrors, apiPort, sitePort },
      null,
      2,
    ),
  );
} catch (error) {
  if (page) await screenshot("failure").catch(() => {});
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
