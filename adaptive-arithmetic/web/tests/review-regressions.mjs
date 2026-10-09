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
await mkdir(path.join(root, "data"), { recursive: true });
const database = path.join(root, "data", `review-fixes-${Date.now()}.sqlite3`);
async function freePort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
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
  child.stderr.on("data", (chunk) => {
    serverErrors += chunk.toString();
  });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, description) {
  for (let i = 0; i < 100; i++) {
    if (await check()) return;
    await wait(100);
  }
  throw new Error("Timed out: " + description);
}
async function ready(url) {
  await until(
    async () => {
      try {
        return (await fetch(url)).ok;
      } catch {
        return false;
      }
    },
    "startup " + url + " " + serverErrors,
  );
}
async function api(route, method = "GET", body) {
  const response = await fetch(apiURL + route, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json();
  assert(response.ok, JSON.stringify(result));
  return result;
}
function fixture({ timed = false, countdown = false } = {}) {
  return {
    version: 1,
    operations: [
      {
        id: "addition",
        version: 1,
        share: "100",
        groups: [
          {
            id: "review-fixed-add",
            version: 1,
            name: "Review fixed addition",
            share: "100",
            first: { min: "1", max: "1", decimalPlaces: 0 },
            second: { min: "2", max: "2", decimalPlaces: 0 },
            allowNegative: false,
          },
        ],
      },
    ],
    session: {
      format: timed ? "timed" : "endless",
      durationSeconds: "1",
      countdown,
    },
  };
}
const prefix = "arithmetic.pending.";
const startEvent = {
  sequence: 0,
  type: "session-started",
  elapsedMs: 0,
  payload: { wallAt: "synthetic" },
};
const showEvent = {
  sequence: 1,
  type: "question-presented",
  elapsedMs: 1,
  payload: {
    question: { id: "review-question", left: "1", right: "2", expected: "3" },
  },
};
const inputEvent = {
  sequence: 2,
  type: "input-changed",
  elapsedMs: 123,
  payload: {
    questionId: "review-question",
    value: "9",
    inputType: "insertText",
  },
};
async function createRecord(events = []) {
  const { id } = await api("/api/sessions", "POST", {
    config: fixture(),
    seed: "synthetic-review-seed",
    generatorVersion: "exact-grid-v1",
    policyVersion: "hierarchical-shares-v1",
  });
  if (events.length)
    await api(`/api/sessions/${id}/observations`, "POST", { events });
  return id;
}
let browser;
const checks = [],
  pageErrors = [];
const note = (check) => {
  checks.push(check);
  console.log("Passed: " + check);
};
async function cleanupChild(child) {
  if (child.exitCode !== null || !child.pid) return;
  if (process.platform === "win32")
    await new Promise((resolve) => {
      const killer = spawn(
        "taskkill",
        ["/pid", String(child.pid), "/t", "/f"],
        { windowsHide: true },
      );
      killer.once("exit", resolve);
    });
  else child.kill();
}
try {
  await Promise.all([ready(apiURL + "/api/setup"), ready(siteURL)]);
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
  async function setup(options) {
    await api("/api/last-config", "PUT", fixture(options));
    const page = await browser.newPage();
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.bringToFront();
    await page.goto(siteURL);
    await page.waitForFunction(
      () =>
        document.querySelector(".start-button")?.textContent ===
        "Start practice",
    );
    await page.waitForFunction(
      () => document.hasFocus() && document.visibilityState === "visible",
    );
    return page;
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
  async function start(page) {
    const response = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/sessions") && r.request().method() === "POST",
    );
    await button(page, "Start practice");
    return (await (await response).json()).id;
  }
  const read = (id) => api("/api/sessions/" + id);
  async function saved(page) {
    await page.waitForFunction(
      () =>
        document.body.textContent.includes(
          "Session saved to your local database.",
        ),
      { polling: 100 },
    );
  }
  async function held(page, id) {
    return page.evaluate(
      async (id) =>
        (await navigator.locks.query()).held.some(
          (lock) => lock.name === "arithmetic.session." + id,
        ),
      id,
    );
  }
  async function journal(page, id, events) {
    await page.evaluate(
      (prefix, id, events) =>
        localStorage.setItem(prefix + id, JSON.stringify({ id, events })),
      prefix,
      id,
      events,
    );
  }
  async function recover(page) {
    return page.evaluate(async () =>
      (await import("/src/sessionRecovery.ts")).recoverPending(),
    );
  }

  // The second app stays in the background, so it cannot legitimately cause
  // focus loss in the live run whose journal it sees.
  const owner = await setup();
  const ownerId = await start(owner);
  await owner.waitForSelector('input[aria-label="Your answer"]');
  assert(await held(owner, ownerId), "StrictMode released the live owner lock");
  const client = await browser.target().createCDPSession();
  await client.send("Target.createTarget", {
    url: siteURL + "/?background-review",
    background: true,
  });
  const backgroundTarget = await browser.waitForTarget((target) =>
    target.url().includes("background-review"),
  );
  const background = await backgroundTarget.page();
  await background.waitForFunction(
    () =>
      document.querySelector(".start-button")?.textContent === "Start practice",
    { polling: 100 },
  );
  assert(await owner.evaluate(() => document.hasFocus()));
  assert(!(await background.evaluate(() => document.hasFocus())));
  assert.deepEqual(await recover(background), []);
  assert.equal(
    (await read(ownerId)).events.filter((e) => e.type === "session-ended")
      .length,
    0,
  );
  await owner.type('input[aria-label="Your answer"]', "3");
  await owner.waitForFunction(() =>
    document.body.textContent.includes("1 completed"),
  );
  await button(owner, "End session");
  await saved(owner);
  const ownerTrace = await read(ownerId);
  assert.equal(
    ownerTrace.events.filter((e) => e.type === "session-started").length,
    1,
  );
  assert.equal(
    ownerTrace.events.filter((e) => e.type === "answer-accepted").length,
    1,
  );
  assert.equal(
    ownerTrace.events.filter((e) => e.type === "session-ended").length,
    1,
  );
  assert.equal(ownerTrace.events.at(-1).payload.reason, "manual-end");
  await until(
    async () => !(await held(owner, ownerId)),
    "saved owner lock release",
  );
  note(
    "background app cannot recover a live session; exact answers still save; StrictMode does not release ownership or duplicate events",
  );
  await owner.close();
  await background.bringToFront();

  // Reproduce storage quota failure followed by a successful database flush.
  const quotaPage = await setup();
  const quotaId = await start(quotaPage);
  await quotaPage.waitForSelector('input[aria-label="Your answer"]');
  await until(
    async () => (await read(quotaId)).events.length === 2,
    "initial presentation saved",
  );
  await quotaPage.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith("arithmetic.pending."))
        throw new DOMException("Synthetic quota failure", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  await quotaPage.type('input[aria-label="Your answer"]', "9");
  await until(
    async () => (await read(quotaId)).events.length === 3,
    "input persisted despite journal failure",
  );
  assert.equal(
    await quotaPage.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)).events.length,
      prefix + quotaId,
    ),
    2,
  );
  await quotaPage.evaluate(() => {
    const original = window.fetch;
    window.fetch = (url, options) =>
      String(url).includes("/observations")
        ? new Promise(() => {})
        : original(url, options);
    navigator.sendBeacon = () => false;
  });
  await quotaPage.close();
  await background.bringToFront();
  assert.deepEqual(await recover(background), []);
  const quotaTrace = await read(quotaId);
  assert.equal(quotaTrace.events.length, 4);
  assert.equal(quotaTrace.events[2].payload.value, "9");
  assert.equal(quotaTrace.events[3].sequence, 3);
  assert.equal(quotaTrace.events[3].payload.reason, "interrupted-reload");
  assert.equal(quotaTrace.events[3].payload.endTimeKnown, false);
  assert.equal(
    await background.evaluate(
      (key) => localStorage.getItem(key),
      prefix + quotaId,
    ),
    null,
  );
  note(
    "stale journal after quota failure reconciles newer SQLite input; abandoned page releases its ownership; recovery completes without collision",
  );

  const conflictId = await createRecord([startEvent, showEvent, inputEvent]);
  const validId = await createRecord([startEvent]);
  await background.evaluate(
    (prefix) => localStorage.setItem(prefix + "broken-json", "{broken"),
    prefix,
  );
  await journal(background, conflictId, [
    startEvent,
    showEvent,
    { ...inputEvent, payload: { ...inputEvent.payload, value: "8" } },
  ]);
  await journal(background, validId, [startEvent, showEvent]);
  await background.reload();
  await background.waitForSelector('[data-testid="recovery-error"]');
  await until(
    async () => (await read(validId)).status === "ended",
    "healthy journal after broken journal",
  );
  assert.equal((await read(conflictId)).status, "open");
  assert.equal((await read(conflictId)).events[2].payload.value, "9");
  await background
    .locator('input[aria-label="Review fixed addition left operand maximum"]')
    .fill("2");
  await until(
    async () =>
      (await api("/api/setup")).lastConfig.operations[0].groups[0].first.max ===
      "2",
    "unrelated setup save",
  );
  assert(
    (
      await background.$eval(
        '[data-testid="recovery-error"]',
        (el) => el.textContent,
      )
    ).includes("Observation 2 differs"),
  );
  assert(
    await background.evaluate(
      (key) => localStorage.getItem(key) !== null,
      prefix + conflictId,
    ),
  );
  await background.evaluate(
    (keys) => keys.forEach((key) => localStorage.removeItem(key)),
    [prefix + "broken-json", prefix + conflictId],
  );
  await button(background, "Retry recovery");
  await background.waitForFunction(
    () => !document.querySelector('[data-testid="recovery-error"]'),
  );
  note(
    "malformed/conflicting journals remain isolated and immutable; healthy recovery continues; recovery warning survives successful setup save and can be retried",
  );

  // A pending unload write arrives between recovery's read and append.
  const lateId = await createRecord([startEvent, showEvent]);
  await journal(background, lateId, [startEvent, showEvent]);
  let injected = false;
  await background.setRequestInterception(true);
  const inject = async (req) => {
    if (
      !injected &&
      req.method() === "POST" &&
      req.url().endsWith(`/api/sessions/${lateId}/observations`)
    ) {
      injected = true;
      await api(`/api/sessions/${lateId}/observations`, "POST", {
        events: [inputEvent],
      });
    }
    await req.continue();
  };
  background.on("request", inject);
  assert.deepEqual(await recover(background), []);
  background.off("request", inject);
  await background.setRequestInterception(false);
  assert(injected);
  assert.equal((await read(lateId)).events[2].payload.value, "9");
  assert.equal((await read(lateId)).events.at(-1).sequence, 3);
  assert.equal(
    await background.evaluate(
      (key) => localStorage.getItem(key),
      prefix + lateId,
    ),
    null,
  );
  note(
    "recovery re-fetches after a late unload append conflict instead of retaining a conflicting synthetic end",
  );

  // Lose focus while the real session response is withheld. Both remaining
  // hidden and returning before the response must end without presentation.
  for (const countdown of [false, true]) {
    const pending = await setup({ countdown });
    await pending.setRequestInterception(true);
    let unblock, created;
    const blocked = new Promise((resolve) => {
      unblock = resolve;
    });
    const createdSignal = new Promise((resolve) => {
      created = resolve;
    });
    const hold = async (req) => {
      if (req.method() === "POST" && req.url().endsWith("/api/sessions")) {
        const result = await api(
          "/api/sessions",
          "POST",
          JSON.parse(req.postData()),
        );
        created(result.id);
        await blocked;
        await req.respond({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify(result),
        });
      } else await req.continue();
    };
    pending.on("request", hold);
    await button(pending, "Start practice");
    const pendingId = await createdSignal;
    await background.bringToFront();
    await pending.waitForFunction(() => !document.hasFocus(), { polling: 100 });
    if (countdown) await pending.bringToFront();
    unblock();
    await saved(pending);
    const trace = await read(pendingId);
    assert.equal(trace.events.length, 1);
    assert.equal(trace.events[0].type, "session-ended");
    assert.equal(trace.events[0].payload.reason, "focus-loss");
    assert.equal(trace.events[0].payload.unfinishedQuestionId, null);
    assert.equal(trace.events[0].elapsedMs, 0);
    assert.equal(await pending.$('input[aria-label="Your answer"]'), null);
    pending.off("request", hold);
    await pending.setRequestInterception(false);
    await pending.close();
  }
  note(
    "focus lost during delayed Start ends once without presenting questions, including countdown and returning before response",
  );

  // Failed starts dispose their temporary focus listeners; actual run unmount
  // relinquishes a pending-save journal so another page can recover it.
  const failurePage = await setup();
  await failurePage.evaluate(() => {
    const add = window.addEventListener.bind(window),
      remove = window.removeEventListener.bind(window);
    const blur = new Set();
    window.__reviewBlur = blur;
    window.addEventListener = (type, listener, options) => {
      if (type === "blur") blur.add(listener);
      add(type, listener, options);
    };
    window.removeEventListener = (type, listener, options) => {
      if (type === "blur") blur.delete(listener);
      remove(type, listener, options);
    };
  });
  await failurePage.setRequestInterception(true);
  let failStart = true,
    failSave = false;
  const failures = (req) => {
    if (
      failStart &&
      req.method() === "POST" &&
      req.url().endsWith("/api/sessions")
    ) {
      failStart = false;
      return req.respond({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Synthetic start failure" }),
      });
    }
    if (failSave && req.url().endsWith("/observations"))
      return req.abort("connectionfailed");
    return req.continue();
  };
  failurePage.on("request", failures);
  await button(failurePage, "Start practice");
  await failurePage.waitForFunction(() =>
    document.body.textContent.includes("Synthetic start failure"),
  );
  assert.equal(await failurePage.evaluate(() => window.__reviewBlur.size), 0);
  const failedSaveId = await start(failurePage);
  await failurePage.waitForSelector('input[aria-label="Your answer"]');
  await until(
    async () => (await read(failedSaveId)).events.length === 2,
    "presentation before interrupted save",
  );
  assert.equal(await failurePage.evaluate(() => window.__reviewBlur.size), 1);
  failSave = true;
  await button(failurePage, "End session");
  await failurePage.waitForFunction(() =>
    document.body.textContent.includes("Save pending."),
  );
  assert(await held(failurePage, failedSaveId));
  await button(failurePage, "Back to setup");
  await until(
    async () => !(await held(failurePage, failedSaveId)),
    "unmount after queued failed save",
  );
  assert.equal(await failurePage.evaluate(() => window.__reviewBlur.size), 0);
  assert.deepEqual(await recover(background), []);
  assert.equal(
    (await read(failedSaveId)).events.at(-1).payload.reason,
    "manual-end",
  );
  failurePage.off("request", failures);
  await failurePage.setRequestInterception(false);
  await failurePage.close();
  note(
    "failed Start cleans up focus guard; failed terminal save retains journal/ownership; real run unmount releases only after queued writes and recovery saves original end",
  );

  for (const action of ["focus-loss", "manual-end", "page-exit"]) {
    const deadline = await setup({ timed: true });
    const id = await start(deadline);
    await deadline.waitForSelector('input[aria-label="Your answer"]');
    await deadline.evaluate((action) => {
      const until = performance.now() + 1250;
      while (performance.now() < until) {
        /* Deliberately delay timer delivery. */
      }
      if (action === "focus-loss") window.dispatchEvent(new Event("blur"));
      else if (action === "page-exit")
        window.dispatchEvent(new PageTransitionEvent("pagehide"));
      else
        Array.from(document.querySelectorAll("button"))
          .find((el) => el.textContent.trim() === "End session")
          .click();
    }, action);
    await saved(deadline);
    const trace = await read(id);
    assert.equal(
      trace.events.filter((e) => e.type === "session-ended").length,
      1,
    );
    assert.equal(trace.events.at(-1).elapsedMs, 1000);
    assert.equal(trace.events.at(-1).payload.reason, "timeout");
    assert(trace.events.at(-1).payload.unfinishedQuestionId);
    assert.equal(
      trace.events.filter((e) => e.type === "answer-accepted").length,
      0,
    );
    await deadline.close();
  }
  note(
    "delayed focus-loss, manual-end and page-exit callbacks at/after timed deadline all record one timeout at exactly 1000 ms",
  );

  const early = await setup({ timed: true });
  const earlyId = await start(early);
  await early.waitForSelector('input[aria-label="Your answer"]');
  await background.bringToFront();
  await saved(early);
  const earlyTrace = await read(earlyId);
  assert.equal(earlyTrace.events.at(-1).payload.reason, "focus-loss");
  assert(earlyTrace.events.at(-1).elapsedMs < 1000);
  await early.close();
  const countdown = await setup({ timed: true, countdown: true });
  const countdownId = await start(countdown);
  await countdown.waitForFunction(() =>
    document.body.textContent.includes("Get ready"),
  );
  await countdown.evaluate(() => {
    const until = performance.now() + 1250;
    while (performance.now() < until) {}
    Array.from(document.querySelectorAll("button"))
      .find((el) => el.textContent.trim() === "End session")
      .click();
  });
  await saved(countdown);
  const countdownTrace = await read(countdownId);
  assert.equal(countdownTrace.events.length, 1);
  assert.equal(countdownTrace.events[0].payload.reason, "manual-end");
  assert.equal(countdownTrace.events[0].elapsedMs, 0);
  await countdown.close();
  note(
    "earlier real focus loss keeps its reason/time; ending in countdown remains manual at zero with no presented question",
  );

  assert.deepEqual(pageErrors, []);
  const report = {
    result: "passed",
    checks,
    pageErrors,
    database,
    apiURL,
    siteURL,
    syntheticVerificationData: true,
    normalPreviewUntouched: true,
    sourceSessionId: ownerId,
    staleJournalSessionId: quotaId,
  };
  await mkdir(path.join(root, "design"), { recursive: true });
  await writeFile(
    path.join(root, "design/review-fixes-report.json"),
    JSON.stringify(report, null, 2),
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
  await Promise.all(processes.map(cleanupChild));
}
