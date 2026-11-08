// Real-browser regressions for FR-01, FR-02, C01 and C02. Synthetic data only.
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
const evidence = path.join(
  root,
  "docs/reviews/evidence-2026-10-15-fixes/targeted",
);
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
const database = path.join(
  root,
  "data",
  `review-repairs-${Date.now()}.sqlite3`,
);
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
let browser,
  serverErrors = "";
const pageErrors = [],
  checks = [],
  details = {};
for (const c of children) c.stderr.on("data", (d) => (serverErrors += d));
async function until(check, description) {
  for (let i = 0; i < 200; i++) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error("Timed out: " + description + " " + serverErrors);
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
  for (const b of await page.$$("button"))
    if (await b.evaluate((e, t) => e.textContent.trim() === t, label)) {
      await b.click();
      return;
    }
  throw Error("Missing button " + label);
}
async function input(page, selector, value) {
  await page.focus(selector);
  await page.keyboard.down("Control");
  await page.keyboard.press("KeyA");
  await page.keyboard.up("Control");
  await page.keyboard.press("Backspace");
  await page.keyboard.type(value);
}
async function connected(page) {
  await page.waitForFunction(() =>
    [...document.querySelectorAll("button")].some(
      (b) =>
        ["Start practice", "Start standard run"].includes(
          b.textContent.trim(),
        ) && !b.disabled,
    ),
  );
}
async function capture(page, name) {
  await page.screenshot({
    path: path.join(evidence, name + ".png"),
    fullPage: true,
  });
}
function note(message) {
  checks.push(message);
  console.log("Passed: " + message);
}
const remembered = {
  version: 1,
  operations: [
    {
      id: "addition",
      version: 1,
      share: "100",
      groups: [
        {
          id: "remembered",
          version: 1,
          name: 'Remembered Δ, "測定"',
          share: "100",
          first: { min: "10", max: "99", decimalPlaces: 0 },
          second: { min: "10", max: "99", decimalPlaces: 0 },
          allowNegative: false,
        },
      ],
    },
  ],
  session: { format: "timed", durationSeconds: "120", countdown: false },
};
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
    defaultViewport: { width: 1487, height: 1058 },
  });
  const page = await browser.newPage();
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await page.bringToFront();
  await api("/api/last-config", "PUT", remembered);
  const originalSetup = await api("/api/setup");
  // Hold both StrictMode setup reads. Every edit made while connecting must
  // survive both delayed responses and become the independently remembered setup.
  let holdSetup = true,
    failSetup = false;
  const held = [];
  await page.setRequestInterception(true);
  page.on("request", (r) => {
    if (r.url().endsWith("/api/setup")) {
      if (holdSetup) {
        held.push(r);
        return;
      }
      if (failSetup) {
        void r.respond({
          status: 503,
          contentType: "application/json",
          body: '{"detail":"Synthetic delayed initialization failure"}',
        });
        return;
      }
    }
    void r.continue();
  });
  await page.goto(siteURL + "?view=custom", { waitUntil: "domcontentloaded" });
  await until(() => held.length >= 2, "StrictMode duplicate setup reads");
  await input(page, ".group-name", "Fresh edit while connecting");
  await input(page, 'input[aria-label$="left operand minimum"]', "12");
  await input(page, 'input[aria-label$="left operand maximum"]', "44");
  await button(page, "5m");
  await page.click(".countdown-option input");
  const connecting = await page.evaluate(() => ({
    name: document.querySelector(".group-name").value,
    min: document.querySelector('input[aria-label$="left operand minimum"]')
      .value,
    max: document.querySelector('input[aria-label$="left operand maximum"]')
      .value,
    duration: document.querySelector(
      'input[aria-label="Custom duration in seconds"]',
    ).value,
    countdown: document.querySelector(".countdown-option input").checked,
    startDisabled: [...document.querySelectorAll("button")].some(
      (b) => b.textContent.trim() === "Connecting…" && b.disabled,
    ),
  }));
  assert(connecting.startDisabled);
  await capture(page, "01-custom-edit-pending");
  holdSetup = false;
  // Reverse completion order exercises the stale StrictMode callback too.
  for (const r of [...held].reverse())
    await r.respond({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(originalSetup),
    });
  await connected(page);
  assert.equal(
    await page.$eval(".group-name", (e) => e.value),
    connecting.name,
  );
  await until(
    async () =>
      (await api("/api/setup")).lastConfig.operations[0].groups[0].name ===
      connecting.name,
    "edited setup persisted",
  );
  const edited = (await api("/api/setup")).lastConfig;
  assert.equal(edited.operations[0].groups[0].first.min, "12");
  assert.equal(edited.operations[0].groups[0].first.max, "44");
  assert.equal(edited.session.durationSeconds, "300");
  assert.equal(edited.session.countdown, true);
  await capture(page, "02-custom-edit-after-load");
  details.delayedSetup = {
    strictModeRequests: held.length,
    before: connecting,
    saved: edited,
  };
  note(
    "FR-02: group/range/session edits survive reversed delayed StrictMode initialization",
  );

  await button(page, "Standard Zetamac");
  await button(page, "Custom practice");
  assert.equal(
    await page.$eval(".group-name", (e) => e.value),
    connecting.name,
  );
  await page.reload();
  await connected(page);
  assert.equal(
    await page.$eval(".group-name", (e) => e.value),
    connecting.name,
  );
  note(
    "FR-02: custom memory survives navigation and reload independently of Standard",
  );

  failSetup = true;
  await page.reload();
  await page.waitForFunction(() =>
    document.body.innerText.includes(
      "Synthetic delayed initialization failure",
    ),
  );
  await input(page, ".group-name", "Fresh edit after setup failure");
  await input(page, 'input[aria-label="Custom duration in seconds"]', "77");
  failSetup = false;
  await button(page, "Retry connection");
  await connected(page);
  assert.equal(
    await page.$eval(".group-name", (e) => e.value),
    "Fresh edit after setup failure",
  );
  assert.equal(
    await page.$eval(
      'input[aria-label="Custom duration in seconds"]',
      (e) => e.value,
    ),
    "77",
  );
  await until(
    async () =>
      (await api("/api/setup")).lastConfig.session.durationSeconds === "77",
    "retried edit persisted",
  );
  await capture(page, "03-custom-edit-after-retry");
  note(
    "FR-02: failed initialization retries in place without discarding newer edits",
  );

  await button(page, "Standard Zetamac");
  await page.evaluate(() => {
    window.fixClockOffset = 0;
    const original = performance.now.bind(performance);
    Object.defineProperty(performance, "now", {
      value: () => original() + window.fixClockOffset,
    });
  });
  const created = page.waitForResponse(
    (r) => r.url().endsWith("/api/sessions") && r.request().method() === "POST",
  );
  await button(page, "Start standard run");
  const id = (await (await created).json()).id;
  await page.waitForSelector('input[aria-label="Your answer"]');
  let first;
  await until(async () => {
    first = (await api("/api/sessions/" + id)).questions[0];
    return !!first;
  }, "first presentation");
  const clipboard = "\ufeff" + first.expected;
  const cdp = await page.target().createCDPSession();
  await cdp.send("Browser.grantPermissions", {
    origin: siteURL,
    permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"],
  });
  await page.evaluate(
    (value) => navigator.clipboard.writeText(value),
    clipboard,
  );
  await page.focus('input[aria-label="Your answer"]');
  await page.keyboard.down("Control");
  await page.keyboard.press("KeyV");
  await page.keyboard.up("Control");
  await page.waitForFunction(() =>
    document.body.innerText.includes("1 completed"),
  );
  // Trigger the actual pagehide handler while normal flushes remain queued.
  // Both it and the ordinary final flush post the same immutable prefix/tail.
  const appendStatuses = [];
  page.on("response", (r) => {
    if (r.url().endsWith(`/api/sessions/${id}/observations`))
      appendStatuses.push(r.status());
  });
  await page.evaluate(() => {
    window.fixClockOffset = 120001;
    dispatchEvent(new PageTransitionEvent("pagehide"));
  });
  await page.waitForFunction(
    () =>
      document.body.innerText.includes(
        "Session saved to your local database.",
      ) && document.body.innerText.includes("Based on 1 timed correct answer"),
  );
  const saved = await api("/api/sessions/" + id);
  assert.equal(saved.questions[0].acceptedInput, clipboard);
  assert.equal(saved.questions[0].lastInput, clipboard);
  assert.equal(saved.score, 1);
  assert.equal(saved.summary.validCorrectAnswerCount, 1);
  assert.equal(saved.comparisonEligible, true);
  assert.equal(
    saved.events.find((e) => e.type === "input-changed").payload.inputType,
    "insertFromPaste",
  );
  assert.deepEqual(
    (await api(`/api/sessions/${id}/export?format=json`)).sessions,
    [saved],
  );
  const csv = await (
    await fetch(apiURL + `/api/sessions/${id}/export?format=csv`)
  ).text();
  assert(csv.includes("\\ufeff") || csv.includes("\ufeff"));
  const analytics = await api(`/api/analytics?cohort=${saved.cohortKey}`);
  assert.equal(analytics.summary.validCorrectAnswerCount, 1);
  await until(() => appendStatuses.length >= 2, "beacon and flush responses");
  assert(
    appendStatuses.every((s) => s === 200),
    JSON.stringify(appendStatuses),
  );
  await capture(page, "04-bom-clipboard-results");
  details.clipboard = {
    inputCodePoints: [...clipboard].map((c) => c.codePointAt(0).toString(16)),
    appendStatuses,
    saved,
  };
  note(
    "C02: actual BOM clipboard paste retains one valid saved/exported/comparable response",
  );
  note(
    "C01: pagehide beacon and queued ordinary flush overlap with idempotent success",
  );

  const ids = [];
  for (let i = 0; i < 25; i++) {
    const { id } = await api("/api/sessions", "POST", {
      config: remembered,
      seed: "pagination-" + i,
      generatorVersion: "exact-grid-v1",
      policyVersion: "hierarchical-shares-v1",
      measurementVersion: "response-timing-v1",
      mode: "custom",
      contentVersion: "custom-grid-v1",
    });
    await api(`/api/sessions/${id}/observations`, "POST", {
      events: [
        { sequence: 0, type: "session-started", elapsedMs: 0, payload: {} },
        {
          sequence: 1,
          type: "session-ended",
          elapsedMs: 0,
          payload: { reason: "manual-end", endTimeKnown: true },
        },
      ],
    });
    ids.push(id);
  }
  await page.goto(siteURL + "?view=history");
  // Pagination fixtures deliberately have manual/partial ends.
  await page.click(".partial-toggle input");
  await page.select(".filter-row select", "custom");
  await page.waitForFunction(() =>
    document.querySelector(".pagination")?.innerText.includes("1–20 of 25"),
  );
  await button(page, "Next page");
  await page.waitForFunction(() =>
    document.querySelector(".pagination")?.innerText.includes("21–25 of 25"),
  );
  const other = await browser.newPage();
  other.on("pageerror", (e) => pageErrors.push(e.message));
  other.on("requestfailed", (r) => console.error("Other-tab request failed:", r.method(), r.url(), r.failure()?.errorText));
  await other.goto(siteURL + "?view=history");
  const shrink = await other.evaluate(async (ids) => {
    const r = await fetch("/api/sessions", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionIds: ids }),
    });
    return { status: r.status, body: await r.json() };
  }, ids.slice(1));
  assert.equal(shrink.status, 200);
  await page.bringToFront();
  await button(page, "Refresh history");
  await page.waitForFunction(
    () =>
      document.querySelector(".pagination")?.innerText.includes("1–1 of 1") &&
      document.querySelectorAll(".history-row").length === 1,
  );
  assert(
    !(await page.evaluate(() => document.body.innerText)).includes(
      "No saved sessions match",
    ),
  );
  await capture(page, "05-history-survivor-after-cross-tab-delete");
  details.shrinkingHistory = {
    originalCount: 25,
    deletedInAnotherTab: 24,
    matchingTotal: 1,
    visibleRows: 1,
    range: "1–1 of 1",
  };
  note(
    "FR-01: refreshing offset 20 after cross-tab deletion reveals the sole survivor",
  );

  await other.evaluate(async (id) => {
    const r = await fetch("/api/sessions/" + id, { method: "DELETE" });
    if (!r.ok) throw Error(await r.text());
  }, ids[0]);
  await button(page, "Refresh history");
  await page.waitForFunction(() =>
    document.querySelector(".pagination")?.innerText.includes("0 sessions"),
  );
  assert.equal(await page.$$eval(".history-row", (rows) => rows.length), 0);
  await page.select(".filter-row select", "standard");
  await page.waitForFunction(() =>
    document.querySelector(".pagination")?.innerText.includes("1–1 of 1"),
  );
  await input(page, 'input[type="search"]', "no-such-configuration");
  await page.waitForFunction(() =>
    document.querySelector(".pagination")?.innerText.includes("0 sessions"),
  );
  await capture(page, "06-history-empty-filter");
  note(
    "FR-01: zero totals and changing mode/text filters show truthful empty/page bounds",
  );
  const boundaryIds = [];
  for (let i = 0; i < 21; i++) {
    const { id } = await api("/api/sessions", "POST", {
      config: remembered,
      seed: "page-boundary-" + i,
      generatorVersion: "exact-grid-v1",
      policyVersion: "hierarchical-shares-v1",
      measurementVersion: "response-timing-v1",
      mode: "custom",
      contentVersion: "custom-grid-v1",
    });
    await api(`/api/sessions/${id}/observations`, "POST", {
      events: [
        { sequence: 0, type: "session-started", elapsedMs: 0, payload: {} },
        {
          sequence: 1,
          type: "session-ended",
          elapsedMs: 0,
          payload: { reason: "manual-end", endTimeKnown: true },
        },
      ],
    });
    boundaryIds.push(id);
  }
  await input(page, 'input[type="search"]', "");
  await page.select(".filter-row select", "custom");
  await page.waitForFunction(() =>
    document.querySelector(".pagination")?.innerText.includes("1–20 of 21"),
  );
  await button(page, "Next page");
  await page.waitForFunction(() =>
    document.querySelector(".pagination")?.innerText.includes("21–21 of 21"),
  );
  await api("/api/sessions/" + boundaryIds.pop(), "DELETE");
  await button(page, "Refresh history");
  await page.waitForFunction(
    () =>
      document.querySelector(".pagination")?.innerText.includes("1–20 of 20") &&
      document.querySelectorAll(".history-row").length === 20,
  );
  await api("/api/sessions", "DELETE", { sessionIds: boundaryIds });
  await button(page, "Refresh history");
  await page.waitForFunction(() =>
    document.querySelector(".pagination")?.innerText.includes("0 sessions"),
  );
  assert.equal(
    await page.$eval(".filter-row select", (e) => e.value),
    "custom",
  );
  note(
    "FR-01: a 21-to-20 exact page boundary clamps to page one; deleting that page shows zero",
  );
  await other.close();
  assert.deepEqual(pageErrors, []);
  await writeFile(
    path.join(evidence, "report.json"),
    JSON.stringify(
      { synthetic: true, apiPort, sitePort, checks, pageErrors, details },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ checks, pageErrors }));
} catch (error) {
  console.error(serverErrors.slice(-5000));
  throw error;
} finally {
  if (browser) await browser.close();
  for (const c of children)
    if (c.pid && c.exitCode === null)
      await new Promise((r) => {
        const killer = spawn("taskkill", ["/pid", String(c.pid), "/t", "/f"], {
          windowsHide: true,
        });
        killer.once("exit", r);
      });
}
