import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const evidence = path.join(root, "design/stage1-screen");
await mkdir(evidence, { recursive: true });
async function freePort() {
  const server = net.createServer();
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const port = server.address().port;
  await new Promise((done) => server.close(done));
  return port;
}
const apiPort = await freePort(), sitePort = await freePort();
const apiURL = `http://127.0.0.1:${apiPort}`, siteURL = `http://127.0.0.1:${sitePort}`;
const database = path.join(root, "data", `feature-screen-${Date.now()}.sqlite3`);
const processes = [
  spawn(path.join(root, ".venv/Scripts/python.exe"), ["-m", "uvicorn", "server.app:app", "--host", "127.0.0.1", "--port", String(apiPort)], { cwd: root, env: { ...process.env, ARITHMETIC_DB: database }, windowsHide: true }),
  spawn(process.execPath, [path.join(root, "web/node_modules/vite/bin/vite.js"), "--port", String(sitePort), "--strictPort"], { cwd: path.join(root, "web"), env: { ...process.env, ARITHMETIC_API_URL: apiURL }, windowsHide: true }),
];
let serverErrors = "", browser;
for (const child of processes) child.stderr.on("data", (value) => { serverErrors += value; });
async function until(check, description) {
  for (let i = 0; i < 150; i++) {
    if (await check()) return;
    await new Promise((done) => setTimeout(done, 100));
  }
  throw new Error(`Timed out: ${description}. ${serverErrors}`);
}
async function api(route) {
  const response = await fetch(apiURL + route);
  assert(response.ok, await response.clone().text());
  return response.json();
}
async function button(page, label) {
  const buttons = await page.$$("button");
  for (const target of buttons) {
    if (await target.evaluate((el, text) => el.textContent.trim() === text, label)) {
      await target.click();
      return;
    }
  }
  throw new Error(`Missing button: ${label}`);
}
async function capture(page, name) {
  await page.screenshot({ path: path.join(evidence, name), fullPage: true });
  return { screenshot: name, text: await page.evaluate(() => document.body.innerText), controls: await page.$$eval("button,select", (els) => els.map((el) => el.textContent.trim())), svgCount: await page.$$eval("svg", (els) => els.length) };
}
async function cleanup(child) {
  if (!child.pid || child.exitCode !== null) return;
  if (process.platform === "win32") await new Promise((done) => {
    const killer = spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { windowsHide: true });
    killer.once("exit", done);
  });
  else child.kill();
}
try {
  await Promise.all([apiURL + "/api/setup", siteURL].map((url) => until(async () => { try { return (await fetch(url)).ok; } catch { return false; } }, "startup")));
  browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-first-run", "--disable-background-timer-throttling"] });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.setViewport({ width: 1487, height: 1058, deviceScaleFactor: 1 });
  await page.goto(siteURL);
  await page.waitForFunction(() => [...document.querySelectorAll("button")].some((el) => el.textContent.trim() === "Start practice" && !el.disabled));
  const steps = [await capture(page, "01-custom-setup-desktop.png")];
  assert(!steps[0].text.includes("Standard Zetamac"));
  assert(!steps[0].controls.some((label) => /^History$|^Graphs$|^Progress$/.test(label)));
  const sessionCreated = page.waitForResponse((response) => response.url().endsWith("/api/sessions") && response.request().method() === "POST");
  await button(page, "Start practice");
  const id = (await (await sessionCreated).json()).id;
  await page.waitForSelector('[data-testid="arithmetic-question"]');
  steps.push(await capture(page, "02-active-run.png"));
  let stored;
  await until(async () => { stored = await api("/api/sessions/" + id); return stored.questions.length === 1; }, "first presentation persistence");
  await page.type('input[aria-label="Your answer"]', stored.questions[0].expected);
  await page.waitForFunction(() => document.querySelector(".run-center")?.textContent.includes("1 completed"));
  await button(page, "End session");
  await page.waitForFunction(() => document.body.innerText.includes("Session saved to your local database.") && document.body.innerText.includes("Based on 1 timed correct answer."));
  steps.push(await capture(page, "03-results-desktop.png"));
  await button(page, "Show question details");
  steps.push(await capture(page, "04-question-details.png"));
  const saved = await api("/api/sessions/" + id);
  const exported = await api("/api/exports/sessions?format=json");
  assert.equal(exported.sessions.length, 1);
  assert.deepEqual(exported.sessions[0], saved);
  await button(page, "Back to setup");
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  steps.push(await capture(page, "05-custom-setup-mobile.png"));
  const listing = await fetch(apiURL + "/api/sessions");
  assert.equal(listing.status, 405);
  const deletion = await fetch(apiURL + "/api/sessions/" + id, { method: "DELETE" });
  assert.equal(deletion.status, 405);
  assert.deepEqual(errors, []);
  const report = { screenedAt: new Date().toISOString(), synthetic: true, database: path.basename(database), apiPort, sitePort, steps, session: saved, missingApi: { historyListStatus: listing.status, sessionDeleteStatus: deletion.status }, pageErrors: errors };
  await writeFile(path.join(evidence, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ evidence, inspectedScreens: steps.length, missingApi: report.missingApi, pageErrors: errors }));
} finally {
  if (browser) await browser.close();
  for (const child of processes) await cleanup(child);
}
