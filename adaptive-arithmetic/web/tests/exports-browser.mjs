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
const stamp = Date.now();
const database = path.join(root, "data", `timing-exports-${stamp}.sqlite3`);
const downloads = path.join(root, "data", `timing-downloads-${stamp}`);
const evidence = path.join(root, "design", "timing-exports");
await Promise.all([
  mkdir(downloads, { recursive: true }),
  mkdir(evidence, { recursive: true }),
]);
async function freePort() {
  const listener = net.createServer();
  await new Promise((done) => listener.listen(0, "127.0.0.1", done));
  const port = listener.address().port;
  await new Promise((done) => listener.close(done));
  return port;
}
const apiPort = await freePort(),
  sitePort = await freePort();
const apiURL = `http://127.0.0.1:${apiPort}`,
  siteURL = `http://127.0.0.1:${sitePort}`;
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
let serverErrors = "";
for (const child of processes)
  child.stderr.on("data", (data) => {
    serverErrors += data;
  });
const wait = (ms) => new Promise((done) => setTimeout(done, ms));
async function until(check, description) {
  for (let i = 0; i < 150; i++) {
    if (await check()) return;
    await wait(100);
  }
  throw new Error(`Timed out: ${description}; ${serverErrors}`);
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
async function button(page, text) {
  for (const element of await page.$$("button")) {
    if (
      await element.evaluate(
        (el, label) => el.textContent.trim() === label,
        text,
      )
    ) {
      await element.click();
      return;
    }
  }
  throw new Error("Missing button " + text);
}
const fixture = {
  version: 1,
  operations: [
    {
      id: "addition",
      version: 1,
      share: "100",
      groups: [
        {
          id: "export-fixed",
          version: 1,
          name: "Fixed signed decimals",
          share: "100",
          first: { min: "-1.000", max: "-1.000", decimalPlaces: 3 },
          second: { min: "0.25", max: "0.25", decimalPlaces: 2 },
          allowNegative: false,
        },
      ],
    },
  ],
  session: { format: "endless", durationSeconds: "120", countdown: false },
};
let browser;
const checks = [],
  pageErrors = [];
function note(check) {
  checks.push(check);
  console.log("Passed: " + check);
}
async function cleanup(child) {
  if (child.exitCode !== null || !child.pid) return;
  if (process.platform === "win32")
    await new Promise((done) => {
      const killer = spawn(
        "taskkill",
        ["/pid", String(child.pid), "/t", "/f"],
        { windowsHide: true },
      );
      killer.once("exit", done);
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
    defaultViewport: { width: 1487, height: 1058 },
  });
  const cdp = await browser.target().createCDPSession();
  await cdp.send("Browser.setDownloadBehavior", {
    behavior: "allowAndName",
    downloadPath: downloads,
    eventsEnabled: true,
  });
  const finishedDownloads = [];
  cdp.on("Browser.downloadProgress", (event) => {
    if (event.state === "completed") finishedDownloads.push(event.guid);
  });
  async function download(page, format, background = false) {
    const before = finishedDownloads.length;
    if (background)
      await page.evaluate(
        (label) =>
          [...document.querySelectorAll("button")]
            .find((el) => el.textContent.trim() === label)
            .click(),
        "Export " + format.toUpperCase(),
      );
    else await button(page, "Export " + format.toUpperCase());
    await until(() => finishedDownloads.length > before, "download " + format);
    return readFile(path.join(downloads, finishedDownloads[before]), "utf8");
  }
  const page = await browser.newPage();
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await page.bringToFront();
  await page.goto(siteURL + "?view=custom");
  await page.waitForFunction(
    () =>
      document.querySelector(".start-button")?.textContent === "Start practice",
  );
  await page.evaluate(() => document.fonts.ready);
  assert.deepEqual(JSON.parse(await download(page, "json")).sessions, []);
  assert.equal(
    (await download(page, "csv")).split("\r\n").filter(Boolean).length,
    1,
  );
  note("setup downloads valid empty JSON and header-only CSV");
  await page.screenshot({
    path: path.join(evidence, "setup-desktop.png"),
    fullPage: true,
  });
  for (const width of [768, 390]) {
    await page.setViewport({ width, height: 844 });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.screenshot({
      path: path.join(evidence, `setup-${width}.png`),
      fullPage: true,
    });
  }
  await page.setViewport({ width: 1487, height: 1058 });

  let blockSave = false,
    failSummary = false,
    failExport = false,
    summaryRequests = 0;
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    if (
      blockSave &&
      request.method() === "POST" &&
      request.url().endsWith("/observations") &&
      JSON.parse(request.postData()).events.some(
        (e) => e.type === "session-ended",
      )
    ) {
      void request.respond({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Synthetic save failure" }),
      });
    } else if (
      request.method() === "GET" &&
      /\/api\/sessions\/[^/?]+$/.test(request.url())
    ) {
      summaryRequests++;
      if (failSummary) {
        failSummary = false;
        void request.respond({
          status: 503,
          contentType: "application/json",
          body: "{}",
        });
      } else void request.continue();
    } else if (failExport && request.url().includes("/export?")) {
      failExport = false;
      void request.respond({
        status: 503,
        contentType: "application/json",
        body: "{}",
      });
    } else void request.continue();
  });
  const started = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/sessions") &&
      response.request().method() === "POST",
  );
  await button(page, "Start practice");
  const identity = (await (await started).json()).id;
  await page.waitForSelector('input[aria-label="Your answer"]');
  await page.type('input[aria-label="Your answer"]', "9");
  await page.keyboard.press("Backspace");
  await wait(100);
  await browser
    .defaultBrowserContext()
    .overridePermissions(siteURL, [
      "clipboard-read",
      "clipboard-sanitized-write",
    ]);
  await page.evaluate(() => navigator.clipboard.writeText("-0.750"));
  await page.keyboard.down("Control");
  await page.keyboard.press("V");
  await page.keyboard.up("Control");
  await page.waitForFunction(() =>
    document.body.textContent.includes("1 completed"),
  );
  await page.type('input[aria-label="Your answer"]', "unfinished");
  blockSave = true;
  failSummary = true;
  await button(page, "End session");
  await page.waitForFunction(() =>
    document.body.textContent.includes("Save pending."),
  );
  assert.equal(
    summaryRequests,
    0,
    "Results were fetched before persistence completed",
  );
  assert(
    await page.$$eval(".export-buttons button", (buttons) =>
      buttons.every((button) => button.disabled),
    ),
  );
  assert(
    await page.evaluate(
      (id) => localStorage.getItem("arithmetic.pending." + id) !== null,
      identity,
    ),
  );
  blockSave = false;
  await button(page, "Retry save");
  await page.waitForFunction(() =>
    document.body.textContent.includes("Retry summary"),
  );
  assert(
    await page.$$eval(".export-buttons button", (buttons) =>
      buttons.every((button) => !button.disabled),
    ),
  );
  await button(page, "Retry summary");
  await page.waitForFunction(() =>
    document.body.textContent.includes("Based on 1 timed correct answer."),
  );
  const record = await api("/api/sessions/" + identity);
  assert.equal(record.measurementVersion, "response-timing-v1");
  assert(
    record.questions[0].firstInputTimeMs <
      record.questions[0].correctAnswerTimeMs,
  );
  assert.equal(record.questions[0].inputChangeCount, 3);
  assert(
    record.events.some((e) => e.payload.inputType === "deleteContentBackward"),
  );
  assert(record.events.some((e) => e.payload.inputType === "insertFromPaste"));
  assert.equal(record.questions[1].lastInput, "unfinished");
  const shown = await page.$$eval(".timing-metrics strong", (elements) =>
    elements.map((el) => el.textContent),
  );
  assert.deepEqual(
    shown,
    [
      record.summary.medianCorrectAnswerTimeMs,
      record.summary.meanCorrectAnswerTimeMs,
    ].map((ms) => (ms / 1000).toFixed(2) + "s"),
  );
  note(
    "real typing, deletion, paste and unfinished input agree with saved timing summary",
  );
  note("save failure gates export/summary; save and summary retries succeed");
  failExport = true;
  await button(page, "Export JSON");
  await page.waitForFunction(() =>
    document.body.textContent.includes("Could not export. Try again."),
  );
  const envelope = JSON.parse(await download(page, "json"));
  assert.deepEqual(envelope.sessions, [record]);
  assert.equal(
    await download(page, "csv"),
    await (
      await fetch(`${apiURL}/api/sessions/${identity}/export?format=csv`)
    ).text(),
  );
  assert.equal(await page.$(".export-controls [role=alert]"), null);
  note(
    "JSON/CSV browser downloads match session reads; export failure supports retry",
  );
  await button(page, "Show question details");
  assert(
    (await page.$eval(".question-review", (el) => el.textContent)).includes(
      "First input:",
    ),
  );
  await page.screenshot({
    path: path.join(evidence, "results-desktop.png"),
    fullPage: true,
  });
  for (const width of [768, 390]) {
    await page.setViewport({ width, height: 844 });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.screenshot({
      path: path.join(evidence, `results-${width}.png`),
      fullPage: true,
    });
  }
  note(
    "setup/results and added controls fit desktop, tablet and mobile widths",
  );
  await page.setViewport({ width: 1487, height: 1058 });
  await button(page, "Back to setup");
  await page.click(".countdown-option input");
  const countdownStart = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/sessions") &&
      response.request().method() === "POST",
  );
  const startWall = Date.now();
  await button(page, "Start practice");
  const activeId = (await (await countdownStart).json()).id;
  await page.waitForSelector('input[aria-label="Your answer"]');
  assert(Date.now() - startWall >= 2800);
  await until(
    async () => (await api("/api/sessions/" + activeId)).events.length >= 2,
    "presentation saved",
  );
  const active = await api("/api/sessions/" + activeId);
  assert(
    active.events[1].elapsedMs < 100,
    "Countdown contaminated presentation elapsed time",
  );
  assert.equal(active.summary.medianCorrectAnswerTimeMs, null);
  await cdp.send("Target.createTarget", {
    url: siteURL + "/?view=custom&background-export",
    background: true,
  });
  const target = await browser.waitForTarget((target) =>
    target.url().includes("background-export"),
  );
  const other = await target.page();
  other.on("pageerror", (e) => pageErrors.push(e.message));
  await other.waitForFunction(
    () =>
      document.querySelector(".start-button")?.textContent === "Start practice",
    { polling: 100 },
  );
  const all = JSON.parse(await download(other, "json", true));
  const live = all.sessions.find((s) => s.id === activeId);
  assert.equal(live.terminationState, "ongoing");
  assert.equal(live.endedAt, null);
  assert(live.questions[0].unfinishedDurationIsLowerBound);
  await download(other, "csv", true);
  assert.equal((await api("/api/sessions/" + activeId)).status, "open");
  assert(
    await page.evaluate(
      async (id) =>
        document.hasFocus() &&
        (await navigator.locks.query()).held.some(
          (lock) => lock.name === "arithmetic.session." + id,
        ),
      activeId,
    ),
  );
  await other.close();
  await page.type('input[aria-label="Your answer"]', "-0.750");
  await page.waitForFunction(() =>
    document.body.textContent.includes("1 completed"),
  );
  await button(page, "End session");
  await page.waitForFunction(() =>
    document.body.textContent.includes("Based on 1 timed correct answer."),
  );
  const finished = await api("/api/sessions/" + activeId);
  const q = finished.questions[0];
  assert.equal(
    q.correctAnswerTimeMs,
    finished.events.find((e) => e.type === "answer-accepted").elapsedMs -
      finished.events.find((e) => e.type === "question-presented").elapsedMs,
  );
  note(
    "countdown is excluded; another tab exports persisted live observations without ending/recovering their owner",
  );
  await writeFile(
    path.join(evidence, "session-trace.json"),
    JSON.stringify(record, null, 2),
  );
  assert.deepEqual(pageErrors, []);
  await writeFile(
    path.join(evidence, "report.json"),
    JSON.stringify(
      {
        result: "passed",
        checks,
        pageErrors,
        database,
        apiURL,
        siteURL,
        syntheticVerificationData: true,
        sessionId: identity,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify(
      { result: "passed", checks: checks.length, pageErrors },
      null,
      2,
    ),
  );
} finally {
  if (browser) await browser.close();
  await Promise.all(processes.map(cleanup));
}
