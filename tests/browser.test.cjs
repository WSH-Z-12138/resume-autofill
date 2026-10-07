"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), http = require("node:http");
const root = path.resolve(__dirname, ".."), D = require("../shared/profile.js");
function getPlaywright() {
  try { return require("playwright"); } catch (_) {
    if (process.env.RESUMEKIT_NODE_MODULES) return require(path.join(process.env.RESUMEKIT_NODE_MODULES, "playwright"));
    throw new Error("浏览器测试需要 Playwright。请运行 npm install --no-save playwright，或设置 RESUMEKIT_NODE_MODULES 指向包含 Playwright 的包目录。");
  }
}
async function startServer() {
  const server = http.createServer((req, res) => {
    const file = path.resolve(root, `.${new URL(req.url, "http://localhost").pathname}`);
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    fs.readFile(file, (err, data) => { if (err) return res.writeHead(404).end(); res.setHeader("Content-Type", ({ ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8" })[path.extname(file)] || "application/octet-stream"); res.end(data); });
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}
async function engineTests(browser, url) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 960 } });
  await context.addInitScript(({ profile }) => {
    globalThis.chrome = { storage: { local: {
      async get(keys) { if (!keys) return structuredClone(globalThis.testStorage); return Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter(k => k in globalThis.testStorage).map(k => [k, structuredClone(globalThis.testStorage[k])])); },
      async set(patch) { Object.assign(globalThis.testStorage, structuredClone(patch)); }
    } } };
    globalThis.testStorage = { "rk.profile": profile };
  }, { profile: D.example() });
  const page = await context.newPage();
  const errors = []; page.on("pageerror", err => errors.push(err.message));
  await page.goto(`${url}/demo/index.html`);
  for (const file of ["shared/profile.js", "shared/matcher.js", "content.js"]) await page.addScriptTag({ path: path.join(root, file) });
  let scan = await page.evaluate(() => ResumeKit.scan());
  console.log("Detected rows:", scan.rows.map(r => `${r.label} => ${r.source}${r.reason ? ` [${r.reason}]` : ""}`).join("\n"));
  assert.equal(scan.rows.find(r => r.label.startsWith("个人主页"))?.selected, false);
  assert.ok(scan.rows.find(r => r.label === "离职时间")?.reason.includes("日期"));
  assert.ok(scan.rows.find(r => r.label.includes("自定义下拉"))?.reason);
  const filled = await page.evaluate(ids => ResumeKit.fill({ ids }), scan.rows.filter(row => row.selected).map(row => row.id));
  assert.ok(filled.filled >= 30, `Only ${filled.filled} fields filled`);
  for (const [id, expected] of Object.entries({
    "candidate-name": "张小禾", email: "alex@example.com", phone: "13800000000", "birth-date": "2000-06-18",
    "current-city": "上海", "desired-role": "前端开发工程师", "desired-city": "上海", "employment-type": "full_time",
    "school-1": "示例大学", "school-2": "示例理工大学", "degree-1": "bachelor", "degree-2": "master", "edu-start-2": "2022-09",
    "edu-end-2": "2024-06", company: "示例科技有限公司", "work-role": "前端开发工程师", "work-start": "2024-07",
    "project-name": "团队知识库", "project-role": "前端负责人", "custom-days": "4 天", existing: "https://keep.example.com",
    "work-end": "", captcha: "", password: "", "id-number": "", "disabled-name": "", "hidden-field": "keep",
    "family-relation-1": "father", "family-name-1": "张示例", "family-age-1": "54", "family-politics-1": "群众", "family-degree-1": "bachelor",
    "family-company-1": "示例制造有限公司", "family-position-1": "工程师", "family-phone-1": "13900000001", "family-combined-1": "示例制造有限公司 / 工程师",
    "family-relation-2": "mother", "family-name-2": "李示例", "family-degree-2": "associate", "family-phone-2": "13900000002"
  })) assert.equal(await page.locator(`#${id}`).inputValue(), expected, `Unexpected value in #${id}`);
  assert.equal(await page.locator('input[name="gender"][value="female"]').isChecked(), true);
  assert.equal(await page.locator("#agreement").isChecked(), false);
  assert.equal(await page.locator("#summary").textContent(), D.example().overview.summary);
  assert.equal(await page.locator("#shadow-host input").inputValue(), "alex@example.com");
  assert.equal(await page.frameLocator("iframe").locator("input").inputValue(), "alex@example.com");
  // Undo preserves edits made by a human after the autofill operation.
  await page.locator("#candidate-name").fill("用户自己改过的姓名");
  let undo = await page.evaluate(() => ResumeKit.undo());
  assert.equal(undo.skipped, 1); assert.ok(undo.restored >= 29);
  assert.equal(await page.locator("#candidate-name").inputValue(), "用户自己改过的姓名");
  assert.equal(await page.locator("#school-2").inputValue(), "");
  assert.equal(await page.locator('input[name="gender"][value="female"]').isChecked(), false);
  await page.locator("#candidate-name").fill("");
  // Prevent filling fields that changed after the preview was generated.
  scan = await page.evaluate(() => ResumeKit.scan());
  const name = scan.rows.find(row => row.label === "姓名" && !row.reason);
  await page.locator("#candidate-name").fill("预览后修改");
  const raced = await page.evaluate(id => ResumeKit.fill({ ids: [id] }), name.id);
  assert.equal(raced.filled, 0); assert.match(raced.results[0].reason, /发生变化/);
  // Overwrite must be explicit and undo restores the initial nonempty value.
  scan = await page.evaluate(() => ResumeKit.scan({ overwrite: true }));
  const existing = scan.rows.find(row => row.label.startsWith("个人主页"));
  await page.evaluate(id => ResumeKit.fill({ ids: [id], overwrite: true }), existing.id);
  assert.equal(await page.locator("#existing").inputValue(), "https://example.com");
  await page.evaluate(() => ResumeKit.undo());
  assert.equal(await page.locator("#existing").inputValue(), "https://keep.example.com");
  // Native setter bypasses framework-style own-property value trackers.
  await page.evaluate(() => { const el = document.getElementById("email"); let tracked = ""; Object.defineProperty(el, "value", { configurable: true, get() { return Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").get.call(this); }, set(value) { tracked = value; } }); el.addEventListener("input", () => { window.sawNativeEvent = el.value !== tracked; }); });
  scan = await page.evaluate(() => ResumeKit.scan());
  await page.evaluate(id => ResumeKit.fill({ ids: [id] }), scan.rows.find(row => row.label === "电子邮箱").id);
  assert.equal(await page.evaluate(() => window.sawNativeEvent), true);
  await page.evaluate(() => ResumeKit.undo());
  // Manual mapping persists and gets picked up on subsequent scans.
  await page.evaluate(() => ResumeKit.showMapper());
  const panel = await page.locator('[data-resumekit-panel]').elementHandle();
  // Closed shadow DOM can be inspected in this test through Chromium's accessibility protocol.
  const session = await context.newCDPSession(page);
  await session.send("DOM.enable");
  const doc = await session.send("DOM.getDocument", { depth: -1, pierce: true });
  function findNodes(node, predicate, result = []) { if (predicate(node)) result.push(node); for (const child of [...(node.children || []), ...(node.shadowRoots || []), ...(node.contentDocument ? [node.contentDocument] : [])]) findNodes(child, predicate, result); return result; }
  const panelNode = findNodes(doc.root, n => n.attributes?.includes("data-resumekit-panel"))[0];
  assert.ok(panelNode); assert.ok(panel);
  const selectNode = findNodes(panelNode, n => n.nodeName === "SELECT")[0];
  const selectObject = await session.send("DOM.resolveNode", { nodeId: selectNode.nodeId });
  await session.send("Runtime.callFunctionOn", { objectId: selectObject.object.objectId, functionDeclaration: 'function(){this.value="career.availability";this.dispatchEvent(new Event("change"));}' });
  async function pressClass(className) {
    const currentDoc = await session.send("DOM.getDocument", { depth: -1, pierce: true });
    const hit = findNodes(currentDoc.root, n => n.attributes?.some((v, i, list) => i > 0 && list[i - 1] === "class" && v.split(" ").includes(className)))[0];
    const resolved = await session.send("DOM.resolveNode", { nodeId: hit.nodeId });
    await session.send("Runtime.callFunctionOn", { objectId: resolved.object.objectId, functionDeclaration: "function(){this.click();}" });
  }
  await pressClass("pick"); await page.locator("#unknown-field").click(); await pressClass("apply");
  await page.waitForFunction(() => document.getElementById("unknown-field").value === "两周内");
  await page.waitForFunction(() => Object.entries(testStorage).some(([key, value]) => key.startsWith("rk.maps:") && value.length));
  await pressClass("close");
  await page.evaluate(() => ResumeKit.undo());
  scan = await page.evaluate(() => ResumeKit.scan());
  assert.equal(scan.rows.find(row => row.label.includes("内部备注 A"))?.mapped, true);
  assert.equal(scan.rows.find(row => row.label.includes("内部备注 A"))?.value, "两周内");
  // A changed label invalidates a saved mapping rather than writing unrelated data.
  await page.locator("#unknown-field").evaluate(el => el.parentElement.firstChild.textContent = "另一个不相关问题");
  scan = await page.evaluate(() => ResumeKit.scan());
  assert.equal(scan.rows.some(row => row.label === "另一个不相关问题"), false);
  // A record with only one visible field still occupies its own record index.
  await page.goto(`${url}/demo/index.html`);
  await page.locator(".education-section .record").first().evaluate(el => {
    for (const label of [...el.querySelectorAll("label")].slice(1)) label.remove();
  });
  for (const file of ["shared/profile.js", "shared/matcher.js", "content.js"]) await page.addScriptTag({ path: path.join(root, file) });
  scan = await page.evaluate(() => ResumeKit.scan());
  const schools = scan.rows.filter(row => row.label === "学校名称");
  assert.equal(schools[0].value, "示例大学"); assert.equal(schools[1].value, "示例理工大学");
  assert.equal(scan.rows.find(row => row.source === "教育经历 2 · 学历 / 学位")?.value, "硕士");
  // Without family data, family rows must never borrow the applicant's phone or name.
  await page.evaluate(() => { testStorage["rk.profile"].family = []; });
  scan = await page.evaluate(() => ResumeKit.scan());
  assert.equal(scan.rows.some(row => row.source.startsWith("家庭成员")), false);
  const noFamilyFill = await page.evaluate(ids => ResumeKit.fill({ ids }), scan.rows.filter(row => row.selected).map(row => row.id));
  assert.ok(noFamilyFill.filled > 0);
  assert.equal(await page.locator("#family-name-1").inputValue(), "");
  assert.equal(await page.locator("#family-phone-2").inputValue(), "");
  assert.deepEqual(errors, []);
  console.log(`PASS: browser autofill, two education records, native events, protections, shadow DOM, iframe, manual mapping and undo (${filled.filled} fields).`);
  await context.close();
}
async function editorTests(browser, url) {
  const context = await browser.newContext({ viewport: { width: 1380, height: 1000 } });
  await context.addInitScript(() => {
    globalThis.testStorage = {};
    globalThis.chrome = { storage: { local: { async get(keys) { return keys === null ? structuredClone(testStorage) : Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter(k => k in testStorage).map(k => [k, structuredClone(testStorage[k])])); }, async set(patch) { Object.assign(testStorage, structuredClone(patch)); } } } };
  });
  const page = await context.newPage(), errors = []; page.on("pageerror", err => errors.push(err.message));
  await page.goto(`${url}/options.html`);
  await page.locator('[name="personal.name"]').fill("测试用户");
  await page.locator('[name="personal.phone"]').fill("13811112222");
  await page.locator("#save").click();
  await page.waitForFunction(() => testStorage["rk.profile"]?.personal.name === "测试用户");
  await page.screenshot({ path: path.join(__dirname, ".artifacts", "资料编辑界面.png"), fullPage: true });
  await page.getByRole("button", { name: /03.*教育经历/ }).click();
  await page.locator("#add-record").click();
  await page.locator('[name="education.0.school"]').fill("第一所大学");
  await page.locator("#add-record").click();
  await page.locator('[name="education.1.school"]').fill("第二所大学");
  await page.locator("#save").click();
  await page.waitForFunction(() => testStorage["rk.profile"].education.length === 2);
  await page.evaluate(() => testStorage["rk.maps:test"] = [{ path: "education.0.school" }, { path: "personal.name" }]);
  await page.getByRole("button", { name: "上移", exact: true }).nth(1).click();
  await page.locator("#save").click();
  await page.waitForFunction(() => testStorage["rk.profile"].education[0].school === "第二所大学");
  assert.deepEqual(await page.evaluate(() => testStorage["rk.maps:test"]), [{ path: "personal.name" }]);
  await page.getByRole("button", { name: /04.*工作/ }).click();
  await page.locator("#add-record").click();
  const current = page.getByRole("checkbox", { name: "仍在进行，结束时间至今" });
  await current.check(); await page.locator("#save").click();
  await page.waitForFunction(() => testStorage["rk.profile"].work[0].endDate === "至今");
  assert.equal(await page.locator('[name="work.0.endDate"]').isDisabled(), true);
  await page.getByRole("button", { name: /09.*家庭成员/ }).click();
  await page.locator("#add-record").click();
  await page.locator('[name="family.0.relationship"]').selectOption("父亲");
  await page.locator('[name="family.0.name"]').fill("父亲测试姓名");
  await page.locator('[name="family.0.company"]').fill("测试工作单位");
  await page.locator('[name="family.0.position"]').fill("工程师");
  await page.locator('[name="family.0.phone"]').fill("13911112222");
  await page.locator("#add-record").click();
  await page.locator('[name="family.1.relationship"]').selectOption("母亲");
  await page.locator('[name="family.1.name"]').fill("母亲测试姓名");
  await page.locator("#save").click();
  await page.waitForFunction(() => testStorage["rk.profile"].family.length === 2);
  assert.equal(await page.evaluate(() => testStorage["rk.profile"].family[0].name), "父亲测试姓名");
  assert.equal(await page.evaluate(() => testStorage["rk.profile"].personal.name), "测试用户");
  await page.evaluate(() => testStorage["rk.maps:family-test"] = [{ path: "family.0.phone" }, { path: "personal.name" }]);
  await page.getByRole("button", { name: "上移", exact: true }).nth(1).click();
  await page.locator("#save").click();
  await page.waitForFunction(() => testStorage["rk.profile"].family[0].relationship === "母亲");
  assert.deepEqual(await page.evaluate(() => testStorage["rk.maps:family-test"]), [{ path: "personal.name" }]);
  await page.screenshot({ path: path.join(__dirname, ".artifacts", "家庭成员编辑界面.png"), fullPage: true });
  await page.locator("#guide").click(); await page.locator("#close-guide").click();
  assert.deepEqual(errors, []);
  console.log("PASS: profile editor, family member add/save/reorder, mappings invalidation, current dates and guide dialog.");
  await context.close();
}
async function main() {
  fs.mkdirSync(path.join(__dirname, ".artifacts"), { recursive: true });
  const { chromium } = getPlaywright(), { server, url } = await startServer();
  let browser;
  try {
    const executablePath = process.env.RESUMEKIT_BROWSER || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
    browser = await chromium.launch({ headless: true, executablePath, args: ["--disable-background-networking"] });
    await engineTests(browser, url); await editorTests(browser, url);
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
if (require.main === module) main().catch(err => { console.error(err); process.exitCode = 1; });
module.exports = { getPlaywright, startServer, root };
