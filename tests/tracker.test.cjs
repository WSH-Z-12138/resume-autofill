"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const { getPlaywright, startServer, root } = require("./browser.test.cjs");
const D = require("../shared/profile.js");
async function main() {
  const { chromium } = getPlaywright(), { server, url } = await startServer();
  const artifacts = path.join(__dirname, ".artifacts"), stamp = Date.now();
  const fixture = path.join(artifacts, `tracker-extension-${stamp}`);
  fs.mkdirSync(path.join(fixture, "shared"), { recursive: true });
  for (const file of ["background.js", "content.js", "recorder.js", "tracker.html", "tracker.js", "tracker.css", "options.html", "options.js", "popup.html", "popup.js", "styles.css", "shared/profile.js", "shared/matcher.js", "shared/applications.js"]) fs.copyFileSync(path.join(root, file), path.join(fixture, file));
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8")); manifest.host_permissions = ["http://127.0.0.1/*"];
  fs.writeFileSync(path.join(fixture, "manifest.json"), JSON.stringify(manifest));
  let context;
  try {
    context = await chromium.launchPersistentContext(path.join(artifacts, `tracker-profile-${stamp}`), {
      headless: true, executablePath: process.env.RESUMEKIT_BROWSER || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", ignoreDefaultArgs: ["--disable-extensions"],
      args: [`--disable-extensions-except=${fixture}`, `--load-extension=${fixture}`, "--disable-background-networking"], viewport: { width: 1380, height: 1050 }, acceptDownloads: true
    });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker", { timeout: 15000 });
    const extensionID = new URL(worker.url()).hostname, errors = [];
    context.on("page", page => page.on("pageerror", err => errors.push(err.message)));
    await worker.evaluate(profile => chrome.storage.local.set({ "rk.profile": profile }), D.example());
    const page = await context.newPage(), popup = await context.newPage(), tracker = await context.newPage();
    await popup.goto(`chrome-extension://${extensionID}/popup.html`); await tracker.goto(`chrome-extension://${extensionID}/tracker.html`);
    const list = () => worker.evaluate(async () => (await chrome.storage.local.get("rk.applications"))["rk.applications"] || []);
    async function clickPopup(id) {
      await page.bringToFront(); await popup.evaluate(id => document.getElementById(id).click(), id);
      await popup.waitForFunction(() => !document.getElementById("prepare").disabled);
    }
    async function prepare(scenario, id, valid = true) {
      await page.goto(`${url}/demo/submit.html?jobId=${id}`); await page.selectOption("#scenario", scenario);
      if (valid) { await page.fill("#candidate-name", "张小禾"); await page.fill("#email", "alex@example.com"); await page.check("#agreement"); }
      await clickPopup("prepare");
      assert.equal(await popup.inputValue("#job-company"), "示例科技有限公司"); assert.equal(await popup.inputValue("#job-role"), "前端开发工程师");
      assert.equal(await popup.locator("#submit").isDisabled(), true); await popup.check("#reviewed");
    }
    async function waitRecord(id, status) {
      for (let i = 0; i < 100; i++) {
        const row = (await list()).find(row => row.jobUrl.includes(`jobId=${id}`) && row.status === status);
        if (row) return row;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      throw new Error(`Timed out waiting for ${id}/${status}: ${JSON.stringify(await list())}; page: ${await page.textContent("body")}; popup: ${await popup.textContent("#status")}`);
    }
    await prepare("success", "success", false);
    await clickPopup("scan"); await clickPopup("fill");
    assert.equal(await page.inputValue("#candidate-name"), "张小禾"); await page.check("#agreement");
    await clickPopup("submit"); const successful = await waitRecord("success", "applied");
    assert.ok(successful.submittedAt && successful.confirmedAt && successful.appliedAt, JSON.stringify(successful)); assert.equal(successful.evidence, "投递成功");
    assert.equal(await page.evaluate(() => globalThis.demoSubmitCount), 1);
    assert.equal(await page.evaluate(() => typeof globalThis.ResumeRecorder), "undefined");
    await clickPopup("submit"); assert.equal(await page.evaluate(() => globalThis.demoSubmitCount), 1); assert.match(await popup.textContent("#status"), /已经记录/);
    console.log("PASS: actual extension autofill → reviewed submission → confirmed record; isolated world; duplicate prevented.");
    await prepare("failure", "failure"); await clickPopup("submit"); assert.equal((await waitRecord("failure", "failed")).appliedAt, "");
    for (const scenario of ["unknown", "stale", "conflict"]) {
      await prepare(scenario, scenario); await clickPopup("submit"); await page.waitForFunction(() => document.getElementById("result").textContent.length > 0);
      const row = await waitRecord(scenario, "pending"); assert.equal(row.appliedAt, ""); assert.equal(row.confirmedAt, "");
    }
    // Let the observer process the final mutation before checking all ambiguous states.
    await tracker.waitForTimeout(400);
    for (const id of ["unknown", "stale", "conflict"]) assert.equal((await list()).find(row => row.jobUrl.includes(`jobId=${id}`)).status, "pending");
    console.log("PASS: failure remains failed; missing, stale and conflicting signals remain pending.");
    await prepare("success", "invalid", false); await clickPopup("submit"); assert.match(await popup.textContent("#status"), /必填/); assert.ok(!(await list()).some(row => row.jobUrl.includes("jobId=invalid")));
    await prepare("ambiguous", "ambiguous"); await clickPopup("submit"); assert.match(await popup.textContent("#status"), /多个提交/); assert.ok(!(await list()).some(row => row.jobUrl.includes("jobId=ambiguous")));
    await prepare("success", "manual"); const before = (await list()).length; await clickPopup("arm"); assert.equal((await list()).length, before);
    await page.click("#apply"); await waitRecord("manual", "applied");
    console.log("PASS: invalid/ambiguous forms are not auto-submitted; arming alone creates no record; manual submission is recorded.");
    await prepare("navigate", "navigate"); await clickPopup("submit"); await waitRecord("navigate", "applied");
    await prepare("navigate", "manual-navigation"); await clickPopup("arm"); await page.click("#apply"); await waitRecord("manual-navigation", "applied");
    // Refresh a pending page: a fresh success result can still finish the same record.
    await prepare("unknown", "refresh"); await clickPopup("submit"); await waitRecord("refresh", "pending");
    await page.goto(`${url}/demo/submit.html?jobId=refresh&submitted=1`); await waitRecord("refresh", "applied");
    console.log("PASS: automatic and manual same-origin redirects, and pending-page refresh, retain submission state.");
    await tracker.bringToFront(); await tracker.selectOption("#filter", "pending"); await tracker.waitForFunction(() => document.querySelectorAll("#rows tr").length === 3);
    await tracker.selectOption("#filter", "all"); await tracker.fill("#search", "前端开发");
    const first = tracker.locator("#rows tr").filter({ hasText: "已投递" }).first(); await first.getByText("编辑", { exact: true }).click();
    await tracker.selectOption('[name="status"]', "interview"); await tracker.fill('[name="followUpAt"]', "2026-01-01"); await tracker.fill('[name="nextStep"]', "准备技术面试"); await tracker.click("#save-record");
    await tracker.waitForFunction(() => document.getElementById("stat-interview").textContent === "1");
    await tracker.check("#due-only"); assert.equal(await tracker.locator("#rows tr").count(), 1); await tracker.uncheck("#due-only");
    const csvEvent = tracker.waitForEvent("download"); await tracker.click("#export-csv"); const csvDownload = await csvEvent; await csvDownload.saveAs(path.join(artifacts, "tracker-export.csv")); assert.ok(fs.readFileSync(path.join(artifacts, "tracker-export.csv"), "utf8").includes("准备技术面试"));
    const jsonEvent = tracker.waitForEvent("download"); await tracker.click("#export-json"); const jsonDownload = await jsonEvent; const backup = path.join(artifacts, "tracker-backup.json"); await jsonDownload.saveAs(backup);
    const backupRows = JSON.parse(fs.readFileSync(backup, "utf8")).applications; assert.equal(backupRows.length, (await list()).length);
    await tracker.setInputFiles("#import-file", backup); await tracker.waitForFunction(() => document.getElementById("tracker-status").textContent.includes("已导入 0 条"));
    // Import untrusted text and URLs; text must stay text and links must be HTTP(S).
    const malicious = [{ company: '<img src=x onerror="globalThis.pwned=1">', role: "导入岗位", jobUrl: "javascript:alert(1)", status: "saved" }];
    await tracker.setInputFiles("#import-file", { name: "import.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(malicious)) });
    await tracker.waitForFunction(() => document.getElementById("tracker-status").textContent.includes("已导入 1 条")); await tracker.fill("#search", "导入岗位");
    assert.equal(await tracker.locator("#rows img").count(), 0); assert.equal(await tracker.locator("#rows a").count(), 0); assert.equal(await tracker.evaluate(() => globalThis.pwned), undefined);
    tracker.once("dialog", dialog => dialog.accept()); await tracker.locator("#rows").getByText("删除", { exact: true }).click(); await tracker.waitForFunction(() => !document.getElementById("empty").hidden);
    await tracker.fill("#search", ""); await tracker.screenshot({ path: path.join(artifacts, "整合版投递簿.png"), fullPage: true });
    await prepare("success", "preview"); await popup.locator("body").screenshot({ path: path.join(artifacts, "整合版提交弹窗.png") });
    assert.deepEqual(errors, []); console.log("PASS: tracker editing, follow-up filters, CSV export, JSON roundtrip, import deduplication, escaped content and single-record deletion; no browser script errors.");
  } finally { if (context) await context.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(err => { console.error(err); process.exitCode = 1; });
