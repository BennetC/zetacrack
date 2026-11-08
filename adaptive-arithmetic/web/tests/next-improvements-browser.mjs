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
const evidence = path.join(root, "design/follow-up-2026-11-04");
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
const globalDeleteLabel = "Delete all closed runs, including hidden runs";
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
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await page.bringToFront();
  await page.goto(siteURL);
  await connected();
  const fixture = await page.evaluate(async () => {
    const { standardConfig, StandardGenerator } = await import(
      "/src/standard.ts"
    );
    const g = new StandardGenerator("follow-up-fixture");
    return {
      config: standardConfig(),
      questions: Array.from({ length: 40 }, () => g.next()),
    };
  });
  const standardBody = {
    config: fixture.config,
    seed: "synthetic",
    generatorVersion: "zetamac-reverse-v1",
    policyVersion: "equal-operations-v1",
    measurementVersion: "response-timing-v1",
    mode: "standard",
    contentVersion: "zetamac-default-v1",
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
            id: "follow-up-custom",
            version: 1,
            name: "Follow-up custom",
            share: "100",
            first: { min: "10", max: "10", decimalPlaces: 0 },
            second: { min: "11", max: "11", decimalPlaces: 0 },
            allowNegative: false,
          },
        ],
      },
    ],
    session: { format: "timed", durationSeconds: "120", countdown: false },
  };
  async function synthetic(
    score,
    { isCustom = false, reason = "timeout" } = {},
  ) {
    const { id } = await api(
      "/api/sessions",
      "POST",
      isCustom
        ? {
            ...standardBody,
            config: custom,
            mode: "custom",
            generatorVersion: "exact-grid-v1",
            policyVersion: "hierarchical-shares-v1",
            contentVersion: "custom-grid-v1",
          }
        : standardBody,
    );
    const events = [];
    const add = (type, elapsedMs, payload) =>
      events.push({ sequence: events.length, type, elapsedMs, payload });
    add("session-started", 0, {});
    let at = 0;
    const question = (i) =>
      isCustom
        ? {
            id: "q-" + i,
            index: i,
            operation: "addition",
            groupId: "follow-up-custom",
            left: "10",
            right: "11",
            expected: "21",
            selection: {
              operationBasisPoints: 10000,
              groupBasisPoints: 10000,
              validPairCount: "1",
            },
          }
        : fixture.questions[i];
    for (let i = 0; i < score; i++) {
      const q = question(i);
      add("question-presented", at, { question: q });
      at += 100;
      add("input-changed", at, { questionId: q.id, value: q.expected });
      add("answer-accepted", at, { questionId: q.id, value: q.expected });
    }
    add("question-presented", at, { question: question(score) });
    add("session-ended", reason === "timeout" ? 120000 : at + 1, {
      reason,
      endTimeKnown: true,
    });
    await api(`/api/sessions/${id}/observations`, "POST", { events });
    return id;
  }
  async function dropCreation() {
    let droppedId,
      droppedBody,
      drop = true;
    await page.setRequestInterception(true);
    const interceptor = async (req) => {
      if (
        drop &&
        req.url().endsWith("/api/sessions") &&
        req.method() === "POST"
      ) {
        drop = false;
        droppedBody = JSON.parse(req.postData());
        const r = await fetch(req.url(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: req.postData(),
        });
        assert.equal(r.status, 201);
        droppedId = (await r.json()).id;
        await req.abort("connectionreset");
      } else await req.continue();
    };
    page.on("request", interceptor);
    await button("Start standard run");
    await text("Failed to fetch");
    page.off("request", interceptor);
    await page.setRequestInterception(false);
    return { id: droppedId, body: droppedBody };
  }
  let lost = await dropCreation();
  const count = (await api("/api/sessions")).total;
  assert(lost.body.creationKey);
  assert(
    await page.evaluate(
      (key) => localStorage.getItem("arithmetic.creating." + key) !== null,
      lost.body.creationKey,
    ),
  );
  const other = await browser.newPage();
  await other.goto(siteURL);
  await other.waitForFunction(() =>
    document.body.innerText.includes("Start standard run"),
  );
  assert.equal((await api(`/api/sessions/${lost.id}`)).status, "open");
  await page.bringToFront();
  let current = await run(() => button("Retry starting run"));
  assert.equal(current.id, lost.id);
  assert.equal(current.seed, lost.body.seed);
  assert.equal((await api("/api/sessions")).total, count);
  await other.close();
  await page.bringToFront();
  await stop();
  await text("Partial run");
  note(
    "A committed lost response retries with the same session and seed; another tab cannot recover its live pending creation",
  );

  const previous = current;
  current = await run(() => button("Run again"));
  assert.notEqual(current.id, previous.id);
  assert.notEqual(current.seed, previous.seed);
  assert.deepEqual(current.config, previous.config);
  await stop();
  await text("Partial run");
  const keyboard = await run(() => page.keyboard.press("r"));
  assert.notEqual(keyboard.id, current.id);
  await stop();
  await text("Partial run");
  await screenshot("01-results-run-again");
  note(
    "Run again and R produce fresh identities/seeds with the same setup, reset runtime state, and wait for saved results",
  );

  await button("Back to setup");
  await connected();
  lost = await dropCreation();
  await page.goto(siteURL + "?view=history");
  await text("Session history");
  assert.equal((await api(`/api/sessions/${lost.id}`)).status, "open");
  const beforeRecover = (await api("/api/sessions")).total;
  await page.goto(siteURL);
  await connected();
  await until(
    async () => (await api(`/api/sessions/${lost.id}`)).status === "ended",
    "abandoned creation finalized",
  );
  assert.equal((await api("/api/sessions")).total, beforeRecover);
  assert.equal(
    (await api(`/api/sessions/${lost.id}`)).events.filter(
      (e) => e.type === "session-ended",
    ).length,
    1,
  );
  note(
    "Page disappearance after a lost creation response reconciles the operation and closes the same abandoned record without inventing a new run",
  );

  for (let score = 1; score <= 22; score++) await synthetic(score);
  const customId = await synthetic(2, { isCustom: true });
  const partialCustom = await synthetic(1, {
    isCustom: true,
    reason: "manual-end",
  });
  await page.goto(siteURL + "?view=graphs");
  await text("Full-run statistics");
  await until(
    async () => new URL(page.url()).searchParams.has("gCohort"),
    "default cohort pinned in URL",
  );
  await text("Latest 10 runs: 17.50 average");
  const stats = await api("/api/analytics");
  assert.equal(stats.fullRunStatistics.bestScore, 22);
  assert.equal(stats.fullRunStatistics.recentScoreDifference, 10);
  await screenshot("02-graphs-recent-statistics");
  await button("Last 7 days");
  await text("Full-run statistics");
  assert(new URL(page.url()).searchParams.get("gAfter"));
  const cohort = new URL(page.url()).searchParams.get("gCohort");
  await input("input[type=date]", "2099-01-01");
  await text("From date must be on or before Through date");
  await button("All dates");
  await text("Full-run statistics");
  await input("input[type=date]", "2099-01-01");
  await text("No runs match these dates");
  assert.equal(new URL(page.url()).searchParams.get("gCohort"), cohort);
  assert(
    !(await page.evaluate(() => document.body.innerText)).includes(
      "No saved history yet",
    ),
  );
  await screenshot("03-empty-filtered-graphs");
  await button("Clear filters");
  await text("Latest 10 runs: 17.50 average");
  note(
    "Best/latest-10/previous-10 values, quick UTC date ranges, reversed-range validation, truthful empty states and Clear filters preserve the selected cohort",
  );

  await button("Last 30 days");
  await text("Full-run statistics");
  await page.waitForSelector(".interactive-point");
  await page.$eval(".interactive-point", (el) => el.focus());
  await page.keyboard.press("Enter");
  await text("Open selected session");
  await button("Open selected session");
  await text("Original configuration and provenance");
  const detailURL = page.url();
  assert(new URL(detailURL).searchParams.get("session"));
  assert.equal(new URL(detailURL).searchParams.get("returnTo"), "graphs");
  await page.reload();
  await text("Original configuration and provenance");
  assert.equal(page.url(), detailURL);
  await button("← Back to graphs");
  await text("Latest 10 runs: 17.50 average");
  assert(new URL(page.url()).searchParams.get("gAfter"));
  await page.goBack();
  await text("Original configuration and provenance");
  await page.goForward();
  await text("Practice graphs");
  note(
    "Keyboard/touch point inspection opens a URL-addressable session; reload and browser Back/Forward preserve detail and original graph filters",
  );

  await button("History");
  await text("matching sessions");
  await page.select(".filter-row select", "custom");
  await text("1 matching sessions");
  await selectState("ongoing");
  await text("0 matching sessions");
  assert.equal(
    await page.$eval(".partial-toggle input", (e) => e.checked),
    true,
  );
  await page.click(".partial-toggle input");
  await text("1 matching sessions");
  assert.equal(
    await page.evaluate(
      () =>
        [...document.querySelectorAll("select")].find((s) =>
          [...s.options].some((o) => o.value === "ongoing"),
        ).value,
    ),
    "",
  );
  await page.select(".filter-row select", "legacy");
  await until(
    async () => page.$eval(".partial-toggle input", (e) => e.checked),
    "legacy visibility enabled",
  );
  await page.click(".partial-toggle input");
  assert.equal(await page.$eval(".filter-row select", (e) => e.value), "");
  await page.select(".filter-row select", "custom");
  await page.reload();
  await text("1 matching sessions");
  assert.equal(
    await page.$eval(".filter-row select", (e) => e.value),
    "custom",
  );
  await button("View session");
  await text("Original configuration and provenance");
  await page.reload();
  await text("Original configuration and provenance");
  await button("← Back to history");
  await text("1 matching sessions");
  assert.equal(
    await page.$eval(".filter-row select", (e) => e.value),
    "custom",
  );
  note(
    "Ongoing/incomplete visibility cooperates with eligibility; History filters and selected details survive reload and return navigation",
  );

  let arriving;
  const confirmation = new Promise((resolve) =>
    page.once("dialog", async (dialog) => {
      assert(dialog.message().includes("1 closed sessions"));
      assert(dialog.message().includes("current matching filters"));
      arriving = await synthetic(3, { isCustom: true });
      await dialog.accept();
      resolve();
    }),
  );
  await button("Delete matching runs");
  await confirmation;
  await until(
    async () =>
      (await fetch(apiURL + `/api/sessions/${customId}`)).status === 404,
    "matching deletion",
  );
  assert.equal((await api(`/api/sessions/${partialCustom}`)).id, partialCustom);
  assert.equal((await api(`/api/sessions/${arriving}`)).id, arriving);
  assert.equal(
    (await api("/api/sessions?mode=standard&eligibleOnly=true")).total,
    22,
  );
  const beforeGlobal = (await api("/api/sessions")).total;
  page.once("dialog", async (dialog) => {
    assert(dialog.message().includes("including hidden runs"));
    await dialog.dismiss();
  });
  await button(globalDeleteLabel);
  await until(
    async () => await page.$eval(".danger-button", (e) => !e.disabled),
    "canceled global dialog",
  );
  assert.equal((await api("/api/sessions")).total, beforeGlobal);
  await screenshot("04-filtered-history-delete-actions");
  note(
    "Delete matching runs uses the exact filtered scope across pages, preserves hidden and arriving runs; global deletion is explicit and cancelable",
  );

  await page.setViewport({ width: 390, height: 844 });
  const mobileAnalytics = page.waitForResponse(
    (r) => r.url().includes("/api/analytics?") && r.url().includes("cohort="),
  );
  await page.goto(siteURL + "?view=graphs");
  await mobileAnalytics;
  await page.waitForSelector(".numeric-summary dd");
  assert.equal(await page.$eval(".graph-filter-panel", (e) => e.open), false);
  const number = await page.$eval(".numeric-summary dd", (e) => ({
    top: e.getBoundingClientRect().top,
    bottom: e.getBoundingClientRect().bottom,
  }));
  assert(number.bottom <= 844, JSON.stringify(number));
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await screenshot("05-graphs-mobile-collapsed");
  await page.click(".graph-filter-panel > summary");
  assert.equal(await page.$eval(".graph-filter-panel", (e) => e.open), true);
  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto(siteURL);
  await connected();
  await run(() => button("Start standard run"));
  const reload = await run(() => page.reload());
  assert(reload.id);
  await stop();
  note(
    "Mobile starts with optional controls collapsed and numeric scores in the first viewport; controls expand, desktop reflows, and reload still starts a fresh run",
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
  if (page)
    console.error(
      await page
        .evaluate(async () => ({
          keys: Object.keys(localStorage),
          locks: await navigator.locks.query(),
          text: document.body.innerText.slice(-1600),
        }))
        .catch(() => ({})),
    );
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
