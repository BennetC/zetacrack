// Complete UI -> API -> SQLite -> analytics/export journey, using an isolated DB.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const evidence = path.join(root, "design/optiver-2026-11-11");
await mkdir(evidence, { recursive: true });
async function freePort() {
  const s = net.createServer();
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  const port = s.address().port;
  await new Promise((r) => s.close(r));
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
          `optiver-browser-${Date.now()}.sqlite3`,
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
let logs = "",
  browser,
  page;
const errors = [],
  checks = [];
for (const child of children)
  for (const output of [child.stdout, child.stderr]) output.on("data", data => { logs += data; });
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(check, label) {
  for (let i = 0; i < 150; i++) {
    try {
      if (await check()) return;
    } catch {}
    await delay(100);
  }
  throw new Error(`Timed out: ${label}\n${logs.slice(-2000)}`);
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
  const found = await page.evaluate((label) => {
    const b = [...document.querySelectorAll("button")].find(
      (b) => b.textContent.trim() === label,
    );
    if (!b || b.disabled) return false;
    b.click();
    return true;
  }, label);
  assert(found, `Missing enabled button: ${label}`);
}
async function text(s) {
  await page.waitForFunction((s) => document.body.innerText.includes(s), {}, s);
}
async function shot(name) {
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    `Page overflow: ${name}`,
  );
  await page.screenshot({
    path: path.join(evidence, name + ".png"),
    fullPage: true,
  });
}
async function current() {
  await page.waitForSelector(".optiver-choice:not(:disabled)");
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find(
      (k) =>
        k.startsWith("arithmetic.pending.") &&
        JSON.parse(localStorage[k]).events.some(
          (e) => e.type === "question-presented",
        ) &&
        !JSON.parse(localStorage[k]).events.some(
          (e) => e.type === "session-ended",
        ),
    );
    const journal = JSON.parse(localStorage[key]);
    return {
      id: journal.id,
      q: journal.events.filter((e) => e.type === "question-presented").at(-1)
        .payload.question,
    };
  });
}
async function start() {
  await page.goto(siteURL + "/?view=optiver", { waitUntil: "networkidle0" });
  await until(
    () => page.$eval(".primary-button", (b) => !b.disabled),
    "connected Optiver start",
  );
  await button("Start Optiver test");
  return current();
}
const note = (s) => {
  checks.push(s);
  console.log("Passed: " + s);
};
try {
  await Promise.all([
    until(async () => (await fetch(apiURL + "/api/setup")).ok, "API"),
    until(async () => (await fetch(siteURL)).ok, "frontend"),
  ]);
  browser = await puppeteer.launch({
    executablePath:
      process.env.CHROME_PATH ||
      "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: true,
    args: ["--no-sandbox"],
  });
  page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(siteURL + "/?view=optiver", { waitUntil: "networkidle0" });
  await text("80 questions. Eight minutes.");
  await shot("home-desktop");
  assert.equal((await api("/api/sessions")).total, 0);
  await button("Your Optiver analytics");
  await text("No tests in this date range");
  assert.equal((await api("/api/sessions")).total, 0);
  note(
    "Optiver home and empty analytics render without auto-starting or mutating Custom settings",
  );

  const first = await start();
  const originalSetup = await api("/api/setup");
  await shot("test-desktop");
  for (let i = 0; i < 80; i++) {
    const c = await current();
    assert.equal(c.q.index, i);
    const choices = c.q.optiver.options;
    const option = choices.findIndex((v) => (v === c.q.expected) === i < 68);
    if (i === 0) await page.keyboard.press(String(option + 1));
    else
      await page.evaluate(
        (i) => document.querySelectorAll(".optiver-choice")[i].click(),
        option,
      );
    if (i < 79)
      await page.waitForFunction(
        (i) =>
          document.querySelector('[data-testid="optiver-progress"]')
            ?.textContent === `${i + 1} / 80` &&
          !!document.querySelector(".optiver-choice:not(:disabled)"),
        {},
        i,
      );
    if (i === 4) await shot("fraction-desktop");
  }
  await text("Session saved to your local database.");
  await text("Practice target reached");
  const saved = await api("/api/sessions/" + first.id);
  assert.equal(saved.score, 56);
  assert.equal(saved.optiverSummary.incorrect, 12);
  assert.equal(saved.events.at(-1).payload.unfinishedQuestionId, null);
  assert(saved.comparisonEligible);
  assert.equal(
    saved.events.filter((e) => e.type === "answer-submitted").length,
    80,
  );
  assert.equal(
    saved.events.filter(
      (e) => e.type === "input-changed" || e.type === "answer-accepted",
    ).length,
    0,
  );
  assert(saved.questions.every((q) => q.responseTimeMs !== null));
  assert(saved.questions.some((q) => q.optiver.kind === "fraction"));
  assert.deepEqual(await api("/api/setup"), originalSetup);
  await shot("results-desktop");
  note(
    "80 mouse/keyboard choices finish early at 56 net (68 correct, 12 wrong), saving exact rational options and timings",
  );

  await button("Show question details");
  await text("Answer review");
  await page.select('select[aria-label="Answer review filter"]', "incorrect");
  assert.equal(
    await page.$$eval(".optiver-review tbody tr", (rows) => rows.length),
    12,
  );
  await button("View Optiver analytics");
  await text("1 completed tests");
  await shot("analytics-desktop");
  assert.equal((await api("/api/optiver/analytics")).statistics.accuracy, 0.85);
  await button("Review test");
  await text("Answer review");
  await shot("review-desktop");
  await button("← Back to Optiver analytics");
  await text("Net score over time");
  const json = await api(`/api/sessions/${first.id}/export?format=json`);
  assert.deepEqual(json.sessions[0].events, saved.events);
  const csv = await fetch(
    apiURL + `/api/sessions/${first.id}/export?format=csv`,
  );
  assert(csv.ok);
  assert((await csv.text()).includes("optiverQuestionJson"));
  note(
    "Results review filters wrong choices; dedicated analytics, saved detail, back navigation and JSON/CSV agree",
  );

  await page.setViewport({ width: 390, height: 844 });
  await shot("analytics-mobile");
  await start();
  await shot("test-mobile");
  assert.equal(
    await page.$eval(
      ".optiver-choices",
      (e) => getComputedStyle(e).gridTemplateColumns.split(" ").length,
    ),
    2,
  );
  await button("End session");
  await text("Session saved to your local database.");
  note(
    "390px analytics and two-column answer choices fit the viewport; interrupted tests remain excluded",
  );

  await page.setViewport({ width: 1440, height: 1000 });
  const partial = await start();
  const other = await browser.newPage();
  await other.goto("about:blank");
  await other.bringToFront();
  await delay(250);
  await page.bringToFront();
  assert.equal(await page.$eval(".optiver-choice", (b) => b.disabled), false);
  const c = await current();
  const correct = c.q.optiver.options.indexOf(c.q.expected);
  await page.evaluate((i) => {
    const b = document.querySelectorAll(".optiver-choice")[i];
    b.click();
    b.click();
  }, correct);
  await delay(180);
  await page.evaluate(() => {
    const now = performance.now.bind(performance);
    performance.now = () => now() + 480000;
  });
  await page.evaluate(() => document.querySelector(".optiver-choice").click());
  await text("Time is up.");
  await text("Session saved to your local database.");
  const timeout = await api("/api/sessions/" + partial.id);
  assert.equal(timeout.optiverSummary.attempted, 1);
  assert.equal(timeout.optiverSummary.unanswered, 79);
  assert.equal(timeout.events.at(-1).elapsedMs, 480000);
  assert(timeout.comparisonEligible);
  await other.close();
  note(
    "Switching tabs keeps the test running; duplicate clicks submit once; the exclusive deadline saves exactly 480000ms",
  );

  const beforeReload = await start();
  await page.keyboard.press(
    String(beforeReload.q.optiver.options.indexOf(beforeReload.q.expected) + 1),
  );
  await delay(150);
  await page.reload({ waitUntil: "networkidle0" });
  const afterReload = await current();
  assert.notEqual(afterReload.id, beforeReload.id);
  const a = await api("/api/sessions/" + beforeReload.id),
    b = await api("/api/sessions/" + afterReload.id);
  assert.equal(b.mode, "optiver");
  assert.notEqual(a.seed, b.seed);
  assert.equal(b.config.session.durationSeconds, "480");
  assert.equal(a.optiverSummary.attempted, 1);
  assert.equal(await page.$('[data-testid="recovery-error"]'), null);
  await button("End session");
  await text("Session saved to your local database.");
  assert.deepEqual(await api("/api/setup"), originalSetup);
  note(
    "Reload starts a fresh Optiver paper with a new identity/seed and independent 480-second configuration",
  );

  await page.goto(siteURL + "/?view=history&hMode=optiver", {
    waitUntil: "networkidle0",
  });
  await text("Session history");
  assert.equal(
    await page.$eval('select[aria-label="History mode"]', (e) => e.value),
    "optiver",
  );
  await page.goto(siteURL + "/?view=optiver-analytics&oAfter=2099-01-01", {
    waitUntil: "networkidle0",
  });
  await text("No tests in this date range");
  await page.goto(
    siteURL + "/?view=optiver-analytics&oAfter=2099-01-01&oBefore=2000-01-01",
    { waitUntil: "networkidle0" },
  );
  await text("From date must be on or before To date.");
  await button("All time");
  await text("2 completed tests");
  note(
    "Dedicated date filters, invalid/empty states, reset and Optiver History filters remain usable",
  );

  const fixture = JSON.parse(
    await readFile(
      path.join(root, "tests/fixtures/optiver-paper.json"),
      "utf8",
    ),
  );
  const negative = await api("/api/sessions", "POST", {
    config: fixture.config,
    seed: "cross-stack-optiver",
    mode: "optiver",
    contentVersion: "optiver-80-in-8-v1",
    generatorVersion: "optiver-rational-v1",
    policyVersion: "optiver-profile-v1",
    measurementVersion: "choice-response-v1",
  });
  const raw = [{ type: "session-started", elapsedMs: 0, payload: {} }];
  for (const q of fixture.questions) {
    const optionIndex = q.optiver.options.findIndex((v) => v !== q.expected);
    raw.push(
      {
        type: "question-presented",
        elapsedMs: q.index * 1000,
        payload: { question: q },
      },
      {
        type: "answer-submitted",
        elapsedMs: q.index * 1000 + 990,
        payload: {
          questionId: q.id,
          optionIndex,
          value: q.optiver.options[optionIndex],
        },
      },
    );
  }
  raw.push({
    type: "session-ended",
    elapsedMs: 80000,
    payload: { reason: "completed", endTimeKnown: true },
  });
  await api(`/api/sessions/${negative.id}/observations`, "POST", {
    events: raw.map((e, sequence) => ({ sequence, ...e })),
  });
  const minus = await api(`/api/sessions/${negative.id}`);
  assert.equal(minus.score, -80);
  assert(minus.comparisonEligible);
  await page.goto(siteURL + `/?view=graphs&gCohort=${minus.cohortKey}`, {
    waitUntil: "networkidle0",
  });
  await text("Comparable full-run history");
  const points = await page.$$eval('.chart-frame svg[role="group"]', (svgs) =>
    [...svgs[0].querySelectorAll("circle")].map((c) =>
      Number(c.getAttribute("cy")),
    ),
  );
  assert(points.length > 0 && points.every((y) => y >= 20 && y <= 210));
  await page.goto(siteURL + "/?view=optiver-analytics", {
    waitUntil: "networkidle0",
  });
  await text("3 completed tests");
  assert(
    (await page.$eval(".optiver-score-chart", (el) => el.textContent)).includes(
      "-80",
    ),
  );
  await page.$eval('.optiver-score-chart [role="button"]', (el) => el.focus());
  await page.keyboard.press("Enter");
  await text("Answer review");
  note(
    "Negative scores stay visible in both chart surfaces, and keyboard chart activation opens exact saved review",
  );

  await start();
  let failSave = true;
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    if (
      failSave &&
      req.url().includes("/observations") &&
      req.postData()?.includes("session-ended")
    ) {
      void req.respond({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Synthetic save failure" }),
      });
    } else void req.continue();
  });
  await button("End session");
  await text("Save pending. Your recovery journal is retained.");
  assert(
    (
      await page.evaluate(() =>
        Object.keys(localStorage).filter((k) =>
          k.startsWith("arithmetic.pending."),
        ),
      )
    ).length > 0,
  );
  failSave = false;
  await button("Retry save");
  await text("Session saved to your local database.");
  note(
    "Failed Optiver terminal saves retain the choice journal and recover through Retry save",
  );

  let failAnalytics = true;
  page.removeAllListeners("request");
  page.on("request", (req) => {
    if (failAnalytics && req.url().includes("/api/optiver/analytics")) {
      void req.respond({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Synthetic analytics failure" }),
      });
    } else void req.continue();
  });
  await page.goto(siteURL + "/?view=optiver-analytics", {
    waitUntil: "networkidle0",
  });
  await text("Could not load Optiver analytics.");
  failAnalytics = false;
  await button("Retry analytics");
  await text("3 completed tests");
  note(
    "Dedicated analytics failures expose a working retry without creating or changing tests",
  );
  assert.deepEqual(errors, []);
  await writeFile(
    path.join(evidence, "report.json"),
    JSON.stringify({ checks, pageErrors: errors }, null, 2),
  );
  await rm(path.join(evidence, "failure.png"), { force: true });
} catch (error) {
  if (page) {
    await page
      .screenshot({ path: path.join(evidence, "failure.png"), fullPage: true })
      .catch(() => {});
    console.error(
      await page.evaluate(() => document.body.innerText).catch(() => ""),
    );
  }
  throw error;
} finally {
  if (browser) await browser.close();
  for (const child of children) {
    if (process.platform === "win32") await new Promise(resolve => {
      const killer = spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { windowsHide: true });
      killer.once("exit", resolve);
    });
    else child.kill();
  }
}
