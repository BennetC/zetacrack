import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const evidence = path.join(root, "design");
await mkdir(evidence, { recursive: true });
const database = path.join(
  root,
  "data",
  `browser-verification-${Date.now()}.sqlite3`,
);
const apiURL = "http://127.0.0.1:8018",
  siteURL = "http://127.0.0.1:4174";
const processes = [
  spawn(
    path.join(root, ".venv/Scripts/python.exe"),
    [
      "-m",
      "uvicorn",
      "server.app:app",
      "--host",
      "127.0.0.1",
      "--port",
      "8018",
    ],
    {
      cwd: root,
      env: { ...process.env, ARITHMETIC_DB: database },
      windowsHide: true,
    },
  ),
  spawn(
    process.execPath,
    [path.join(root, "web/node_modules/vite/bin/vite.js"), "--port", "4174"],
    {
      cwd: path.join(root, "web"),
      env: { ...process.env, ARITHMETIC_API_URL: apiURL },
      windowsHide: true,
    },
  ),
];
let serverErrors = "";
for (const child of processes)
  child.stderr.on("data", (chunk) => (serverErrors += chunk.toString()));
async function ready(url) {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Server did not start: " + serverErrors);
}
async function api(route, method = "GET", body) {
  const r = await fetch(apiURL + route, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await r.json();
  assert(r.ok, JSON.stringify(result));
  return result;
}
const range = (min, max, decimalPlaces = 0) => ({ min, max, decimalPlaces });
const group = (id, name, factor, share) => ({
  id,
  version: 1,
  name,
  share,
  first: range("10", "99"),
  second: range(String(factor), String(factor)),
  allowNegative: false,
});
const fixture = {
  version: 1,
  operations: [
    {
      id: "addition",
      version: 1,
      share: "40",
      groups: [
        {
          ...group("fixture-add", "Addition group", 10, "100"),
          second: range("10", "99"),
        },
      ],
    },
    {
      id: "multiplication",
      version: 1,
      share: "60",
      groups: [
        group("fixture-11", "Multiply by 11", 11, "50"),
        group("fixture-12", "Multiply by 12", 12, "50"),
      ],
    },
  ],
  session: { format: "timed", durationSeconds: "120", countdown: false },
};
let browser;
const consoleErrors = [],
  checks = [];
try {
  await Promise.all([ready(apiURL + "/api/setup"), ready(siteURL)]);
  await api("/api/presets", "POST", {
    name: "Mixed multiplication",
    config: fixture,
  });
  await api("/api/last-config", "PUT", fixture);
  browser = await puppeteer.launch({
    executablePath:
      process.env.CHROME_PATH ||
      "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: true,
    args: [
      "--no-first-run",
      "--disable-background-networking",
      "--disable-sync",
    ],
    defaultViewport: { width: 1487, height: 1058, deviceScaleFactor: 1 },
  });
  const page = await browser.newPage();
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  async function click(text) {
    for (const el of await page.$$("button")) {
      if (await el.evaluate((e, t) => e.textContent.trim() === t, text)) {
        await el.click();
        return;
      }
    }
    throw new Error("Button not found: " + text);
  }
  const field = (label) => "input[aria-label=" + JSON.stringify(label) + "]";
  const fill = (label, value) => page.locator(field(label)).fill(value);
  const checkEnabled = async (expected) =>
    assert.equal(
      await page.$eval(".start-button", (e) => !e.disabled),
      expected,
    );
  const settled = async () => {
    await page.waitForFunction(
      () =>
        document.querySelector(".start-button")?.textContent ===
        "Start practice",
    );
    await page.evaluate(() => document.fonts.ready);
  };
  await page.goto(siteURL + "?view=custom");
  await settled();
  await click("Multiplication");
  await page.screenshot({
    path: path.join(evidence, "implementation-desktop-initial.png"),
  });
  assert.equal(
    await page.$eval(
      'output[aria-label="Multiply by 11 effective session share"]',
      (e) => e.textContent,
    ),
    "30",
  );
  checks.push("two-level shares render correctly");
  await fill("Multiply by 11 within-operation share", "40");
  await checkEnabled(false);
  await fill("Multiply by 11 within-operation share", "50");
  await checkEnabled(true);
  await fill("Multiply by 11 left operand minimum", "100");
  await checkEnabled(false);
  await fill("Multiply by 11 left operand minimum", "10");
  checks.push("inline range and percentage validation blocks Start");
  await page.click('button[aria-label="Duplicate Multiply by 11"]');
  assert.equal(
    await page.$eval(
      'input[aria-label="Multiply by 11 copy within-operation share"]',
      (e) => e.value,
    ),
    "0",
  );
  await page.click('button[aria-label="Remove Multiply by 11 copy"]');
  await click("Add group");
  assert.equal(
    await page.$eval(
      'input[aria-label="Multiplication group within-operation share"]',
      (e) => e.value,
    ),
    "0",
  );
  await page.click('button[aria-label="Remove Multiplication group"]');
  checks.push("add, duplicate and remove groups preserve shares");
  for (const width of [1100, 768, 390]) {
    await page.setViewport({
      width,
      height: width === 390 ? 844 : 1058,
      deviceScaleFactor: 1,
    });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `Horizontal overflow at ${width}`,
    );
    await page.screenshot({
      path: path.join(evidence, `implementation-${width}.png`),
      fullPage: true,
    });
  }
  await page.setViewport({ width: 1487, height: 1058, deviceScaleFactor: 1 });
  checks.push("desktop, tablet and mobile stay within viewport");
  await click("Add operation");
  await click("Division");
  await fill("Addition session share", "0");
  await fill("Multiplication session share", "0");
  await fill("Division session share", "100");
  await fill("Division group divisor minimum", "0");
  await fill("Division group divisor maximum", "0");
  await checkEnabled(false);
  await fill("Division group divisor maximum", "2");
  await fill("Division group divisor minimum", "1");
  await page.select(
    'select[aria-label="Division group answer decimal places"]',
    "3",
  );
  await fill("Division group answer minimum", "0.125");
  await fill("Division group answer maximum", "0.125");
  await checkEnabled(true);
  await click("Endless");
  await click("Save preset");
  await page.locator("dialog input").fill("Browser checked setup");
  await click("Save");
  await page.waitForFunction(() => !document.querySelector("dialog"));
  await click("Rename");
  await page.locator("dialog input").fill("Browser checked renamed");
  await click("Save");
  await page.waitForFunction(() => !document.querySelector("dialog"));
  assert(
    (await api("/api/setup")).presets.some(
      (p) => p.name === "Browser checked renamed",
    ),
  );
  checks.push("named preset save and rename reach SQLite");
  const created = page.waitForResponse(
    (r) => r.url().endsWith("/api/sessions") && r.request().method() === "POST",
  );
  await click("Start practice");
  const sessionId = (await (await created).json()).id;
  await page.waitForSelector('input[aria-label="Your answer"]');
  await page.type('input[aria-label="Your answer"]', "9");
  await page.keyboard.press("Backspace");
  await page.type('input[aria-label="Your answer"]', ".125");
  await page.waitForFunction(() =>
    document.body.textContent.includes("1 completed"),
  );
  const other = await browser.newPage();
  await other.bringToFront();
  await page.bringToFront();
  await page.waitForFunction(() =>
    document.body.textContent.includes("Practice complete"),
  );
  await other.close();
  await page.waitForFunction(() =>
    document.body.textContent.includes("Session saved to your local database."),
  );
  const trace = await api("/api/sessions/" + sessionId);
  assert.equal(
    trace.events.filter((e) => e.type === "answer-accepted").length,
    1,
  );
  assert(
    trace.events.some(
      (e) => e.type === "input-changed" && e.payload.value === "9",
    ),
  );
  assert(
    trace.events.some(
      (e) => e.type === "input-changed" && e.payload.value === ".125",
    ),
  );
  assert.equal(trace.events.at(-1).payload.reason, "focus-loss");
  assert(trace.events.at(-1).payload.unfinishedQuestionId);
  assert.equal(trace.generatorVersion, "exact-grid-v1");
  await writeFile(
    path.join(evidence, "session-trace.json"),
    JSON.stringify(trace, null, 2),
  );
  checks.push(
    "exact answer auto-advances; real focus loss ends; raw inputs and unfinished question persist",
  );
  await page.waitForFunction(
    () =>
      ![...document.querySelectorAll("button")].find(
        (button) => button.textContent === "Show question details",
      )?.disabled,
  );
  await click("Show question details");
  await page.screenshot({
    path: path.join(evidence, "implementation-results.png"),
  });
  await click("Back to setup");
  await fill("Division group answer maximum", "0.250");
  await fill("Division group answer minimum", "0.250");
  await click("Update");
  await page.waitForFunction(() =>
    document.body.textContent.includes("Preset updated"),
  );
  assert.deepEqual(
    (await api("/api/sessions/" + sessionId)).config,
    trace.config,
  );
  await click("Delete");
  await page.waitForFunction(() =>
    document.body.textContent.includes("Preset deleted"),
  );
  assert.deepEqual(
    (await api("/api/sessions/" + sessionId)).config,
    trace.config,
  );
  checks.push("update/delete preserve immutable session snapshot");
  await page.select('select[aria-label="Preset"]', "builtin-0");
  await fill("Custom duration in seconds", "1.5");
  await checkEnabled(false);
  await fill("Custom duration in seconds", "1");
  await page.click(".countdown-option input");
  const countdownCreated = page.waitForResponse(
    (r) => r.url().endsWith("/api/sessions") && r.request().method() === "POST",
  );
  const began = Date.now();
  await click("Start practice");
  const timedId = (await (await countdownCreated).json()).id;
  await page.waitForFunction(() =>
    document.body.textContent.includes("Get ready"),
  );
  assert.equal(await page.$('input[aria-label="Your answer"]'), null);
  await page.waitForSelector('input[aria-label="Your answer"]');
  assert(Date.now() - began >= 2800);
  await page.waitForFunction(() =>
    document.body.textContent.includes("Time is up."),
  );
  await page.waitForFunction(() =>
    document.body.textContent.includes("Session saved to your local database."),
  );
  const timed = await api("/api/sessions/" + timedId);
  assert.equal(timed.events.at(-1).elapsedMs, 1000);
  assert.equal(
    timed.events.filter((e) => e.type === "answer-accepted").length,
    0,
  );
  checks.push(
    "optional countdown is excluded from timed practice; timeout retains unfinished question",
  );
  await click("Back to setup");
  await page.click(".countdown-option input");
  await click("Endless");
  const endlessCreated = page.waitForResponse(
    (r) => r.url().endsWith("/api/sessions") && r.request().method() === "POST",
  );
  await click("Start practice");
  const endlessId = (await (await endlessCreated).json()).id;
  await page.waitForSelector('input[aria-label="Your answer"]');
  await click("End session");
  await page.waitForFunction(() =>
    document.body.textContent.includes("Session saved to your local database."),
  );
  assert.equal(
    (await api("/api/sessions/" + endlessId)).events.at(-1).payload.reason,
    "manual-end",
  );
  await click("Back to setup");
  checks.push("endless practice ends manually and retains unfinished work");
  await page.reload();
  await settled();
  assert.equal(
    await page.$eval(
      ".segmented button[aria-pressed=true]",
      (e) => e.textContent,
    ),
    "Endless",
  );
  checks.push("last valid setup restores after reload");
  await api("/api/last-config", "PUT", fixture);
  await page.reload();
  await settled();
  await click("Multiplication");
  await page.evaluate(() => document.activeElement.blur());
  await page.screenshot({
    path: path.join(evidence, "implementation-desktop-final.png"),
  });
  assert.deepEqual(consoleErrors, []);
  await writeFile(
    path.join(evidence, "verification-report.json"),
    JSON.stringify(
      {
        result: "passed",
        checks,
        consoleErrors,
        viewport: { width: 1487, height: 1058, density: 1 },
        database,
        siteURL,
        sessionId,
        syntheticVerificationData: true,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify(
      {
        result: "passed",
        checks: checks.length,
        consoleErrors,
        screenshot: path.join(evidence, "implementation-desktop-final.png"),
      },
      null,
      2,
    ),
  );
} finally {
  if (browser) await browser.close();
  for (const child of processes) {
    if (process.platform === "win32")
      spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
        windowsHide: true,
      });
    else child.kill();
  }
}
