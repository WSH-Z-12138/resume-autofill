"use strict";
const { getPlaywright, startServer, root } = require("./browser.test.cjs");
const assert = require("node:assert/strict"), path = require("node:path"), fs = require("node:fs");
const D = require("../shared/profile.js");
async function testPopupPipeline(chromium, url) {
  // Browser automation cannot manufacture a toolbar user gesture. A separate fixture
  // grants only localhost so the real popup/scripting/isolated-world pipeline can run.
  const fixture = path.join(__dirname, ".artifacts", "granted-extension");
  fs.mkdirSync(path.join(fixture, "shared"), { recursive: true });
  for (const file of ["background.js", "content.js", "options.html", "options.js", "popup.html", "popup.js", "styles.css", "shared/profile.js", "shared/matcher.js"]) fs.copyFileSync(path.join(root, file), path.join(fixture, file));
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
  manifest.host_permissions = ["http://127.0.0.1/*"];
  fs.writeFileSync(path.join(fixture, "manifest.json"), JSON.stringify(manifest));
  const context = await chromium.launchPersistentContext(path.join(__dirname, ".artifacts", "granted-profile"), {
    headless: true, executablePath: process.env.RESUMEKIT_BROWSER || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    ignoreDefaultArgs: ["--disable-extensions"], args: [`--disable-extensions-except=${fixture}`, `--load-extension=${fixture}`, "--disable-background-networking"], viewport: { width: 1280, height: 900 }
  });
  try {
    const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker", { timeout: 15000 });
    const extensionID = new URL(worker.url()).hostname;
    const example = D.example(); example.personal.idNumber = "DEMO-ID-ONLY";
    await worker.evaluate(profile => chrome.storage.local.set({ "rk.profile": profile }), example);
    const page = await context.newPage(); await page.goto(`${url}/demo/index.html`);
    const popup = await context.newPage(); await popup.goto(`chrome-extension://${extensionID}/popup.html`);
    const errors = []; popup.on("pageerror", err => errors.push(err.message));
    await page.bringToFront();
    await popup.evaluate(() => document.getElementById("scan").click());
    await popup.waitForFunction(() => !document.getElementById("preview").hidden && !document.getElementById("scan").disabled);
    assert.ok(await popup.locator(".preview-row").count() >= 35);
    const sensitive = popup.locator(".preview-row").filter({ hasText: "身份证号码" });
    assert.equal(await sensitive.locator("input").isChecked(), false);
    await popup.locator("#select-all").evaluate(el => el.click());
    assert.equal(await sensitive.locator("input").isChecked(), false);
    await popup.locator("body").screenshot({ path: path.join(__dirname, ".artifacts", "填写预览.png") });
    await popup.evaluate(() => document.getElementById("fill").click());
    await popup.waitForFunction(() => document.getElementById("status").textContent.startsWith("已填入") && !document.getElementById("scan").disabled);
    assert.equal(await page.locator("#candidate-name").inputValue(), "张小禾");
    assert.equal(await page.locator("#school-2").inputValue(), "示例理工大学");
    assert.equal(await page.locator("#family-name-1").inputValue(), "张示例");
    assert.equal(await page.locator("#family-name-2").inputValue(), "李示例");
    assert.equal(await page.locator("#family-phone-2").inputValue(), "13900000002");
    assert.equal(await page.locator("#id-number").inputValue(), "");
    assert.equal(await page.locator("#existing").inputValue(), "https://keep.example.com");
    assert.equal(await page.evaluate(() => typeof globalThis.ResumeKit), "undefined");
    await popup.evaluate(() => document.getElementById("undo").click());
    await popup.waitForFunction(() => document.getElementById("status").textContent.startsWith("已恢复"));
    assert.equal(await page.locator("#candidate-name").inputValue(), "");
    assert.deepEqual(errors, []);
    console.log("PASS: real extension popup scan/preview/select/fill/undo, sensitive fields stay unselected, actual isolated world (localhost-only test fixture).");
  } finally { await context.close(); }
}
async function main() {
  const { chromium } = getPlaywright(), { server, url } = await startServer();
  fs.mkdirSync(path.join(__dirname, ".artifacts"), { recursive: true });
  let context;
  try {
    context = await chromium.launchPersistentContext(path.join(__dirname, ".artifacts", "extension-profile"), {
      headless: true,
      executablePath: process.env.RESUMEKIT_BROWSER || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
      ignoreDefaultArgs: ["--disable-extensions"],
      args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`, "--disable-background-networking"],
      viewport: { width: 1380, height: 1000 }
    });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker", { timeout: 15000 });
    const extensionID = new URL(worker.url()).hostname;
    await worker.evaluate(() => chrome.storage.local.clear());
    const options = await context.newPage(); await options.goto(`chrome-extension://${extensionID}/options.html`);
    await options.locator("#sample").click(); await options.locator("#save").click();
    await options.waitForFunction(() => document.getElementById("save-status").textContent === "已保存在本机");
    const stored = await worker.evaluate(async () => (await chrome.storage.local.get("rk.profile"))["rk.profile"]);
    assert.equal(stored.personal.name, "张小禾");
    const page = await context.newPage(); await page.goto(`${url}/demo/index.html`); await page.bringToFront();
    const [tab] = await worker.evaluate(() => chrome.tabs.query({ active: true, currentWindow: true }));
    assert.ok(tab?.id, "The fixture tab must have an ID");
    // Open the real action popup; this exercises packaged scripts and extension CSP.
    await worker.evaluate(async () => chrome.action.openPopup());
    let popup;
    for (let i = 0; i < 30; i++) {
      popup = context.pages().find(p => p.url() === `chrome-extension://${extensionID}/popup.html`);
      if (popup) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!popup) {
      // Some headless Edge builds do not expose action popups as page targets.
      popup = await context.newPage(); await popup.goto(`chrome-extension://${extensionID}/popup.html`);
    }
    await popup.waitForFunction(() => document.getElementById("profile-name").textContent === "张小禾");
    assert.match(await popup.locator("#profile-meta").textContent(), /项资料/);
    await popup.locator("body").screenshot({ path: path.join(__dirname, ".artifacts", "插件弹窗.png") });
    // Verify isolation and packaged code through a test-specific host grant if headless openPopup lacks a gesture.
    let permitted = true, error = "";
    try { await worker.evaluate(async tabId => chrome.scripting.executeScript({ target: { tabId }, files: ["shared/profile.js", "shared/matcher.js", "content.js"] }), tab.id); }
    catch (err) { permitted = false; error = err.message; }
    if (permitted) {
      const scan = await worker.evaluate(async tabId => (await chrome.scripting.executeScript({ target: { tabId }, func: () => ResumeKit.scan() }))[0].result, tab.id);
      assert.ok(scan.rows.length >= 35);
      const filled = await worker.evaluate(async ({ tabId, ids }) => (await chrome.scripting.executeScript({ target: { tabId }, func: values => ResumeKit.fill({ ids: values }), args: [ids] }))[0].result, { tabId: tab.id, ids: scan.rows.filter(r => r.selected).map(r => r.id) });
      assert.ok(filled.filled >= 30);
      assert.equal(await page.locator("#candidate-name").inputValue(), "张小禾");
      assert.equal(await page.evaluate(() => typeof globalThis.ResumeKit), "undefined");
      console.log(`PASS: loaded actual Manifest V3 extension, local storage, CSP, action popup, isolated-world injection and ${filled.filled} filled fields.`);
    } else {
      assert.match(error, /permission|Cannot access/i);
      console.log("PASS: loaded production Manifest V3 extension, local storage, popup UI and CSP; ungranted activeTab correctly blocks injection in a headless browser.");
    }
    await context.close(); context = null;
    await testPopupPipeline(chromium, url);
  } finally { if (context) await context.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(err => { console.error(err); process.exitCode = 1; });
