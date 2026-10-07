"use strict";
const { test } = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), vm = require("node:vm"), path = require("node:path");
const A = require("../shared/applications.js");
test("job URLs discard credentials, tokens and tracking, retain job identity", () => {
  assert.equal(A.jobURL("https://me:secret@jobs.example/apply?token=secret&jobId=42&utm_source=mail#access_token=abc"), "https://jobs.example/apply?jobId=42");
  assert.equal(A.jobURL("javascript:alert(1)"), "");
  assert.equal(A.jobURL("file:///private/resume.pdf"), "");
  assert.equal(A.jobURL("https://jobs.example/#/jobs/42"), "https://jobs.example/#/jobs/42");
});
test("records require company and role and strip all unknown sensitive fields", () => {
  assert.throws(() => A.normalize({ company: " ", role: "Engineer" }), /公司/);
  assert.throws(() => A.normalize(null), /格式/);
  const row = A.normalize({ company: " 示例公司 ", role: "工程师", email: "private@example.com", resume: "secret", status: "__proto__", priority: "unknown", ownerId: "someone" });
  assert.equal(row.company, "示例公司"); assert.equal(row.status, "saved"); assert.equal(row.priority, "medium");
  assert.equal(row.email, undefined); assert.equal(row.resume, undefined); assert.equal(row.ownerId, undefined);
});
test("invalid calendar dates are not silently normalized", () => {
  const row = A.normalize({ company: "A", role: "B", appliedAt: "2026-02-30", followUpAt: "2026-10-08" });
  assert.equal(row.appliedAt, ""); assert.equal(row.followUpAt, "2026-10-08");
});
test("CSV quotes cells and neutralizes spreadsheet formulas", () => {
  const csv = A.csv([{ company: '=HYPERLINK("evil")', role: "hello,\nworld", status: "pending", notes: " @formula" }]);
  assert.ok(csv.startsWith("\ufeff")); assert.ok(csv.includes('"\'=HYPERLINK(""evil"")"')); assert.ok(csv.includes('"hello,\nworld"')); assert.ok(csv.includes("待确认")); assert.ok(csv.includes("' @formula"));
});
function background() {
  const local = {}, session = {}, listeners = {};
  const area = memory => ({
    async get(key) { await new Promise(resolve => setTimeout(resolve, 1)); return key == null ? structuredClone(memory) : { [key]: structuredClone(memory[key]) }; },
    async set(values) { await new Promise(resolve => setTimeout(resolve, 1)); Object.assign(memory, structuredClone(values)); },
    async remove(key) { delete memory[key]; }
  });
  const chrome = { storage: { local: area(local), session: area(session) }, runtime: { id: "fixture", getURL: name => `chrome-extension://fixture/${name}`, onMessage: { addListener: fn => { listeners.message = fn; } }, onInstalled: { addListener() {} } }, tabs: { async get(id) { return { id, url: "https://jobs.example/apply?jobId=1" }; }, onUpdated: { addListener() {} }, onRemoved: { addListener() {} } } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../background.js"), "utf8"), { chrome, ResumeApplications: A, importScripts() {}, crypto: require("node:crypto").webcrypto, URL, Date });
  const sender = { id: "fixture", url: "chrome-extension://fixture/tracker.html" };
  const contentSender = { id: "fixture", tab: { id: 1 }, frameId: 0, url: "https://jobs.example/apply?jobId=1" };
  const send = (action, values = {}, from = sender) => new Promise(resolve => listeners.message({ type: "rk:tracker", action, ...values }, from, resolve));
  return { send, local, session, sender, contentSender };
}
test("parallel saves do not lose records", async () => {
  const { send } = background();
  const responses = await Promise.all(Array.from({ length: 15 }, (_, i) => send("save", { record: { company: `company-${i}`, role: "Engineer" } })));
  assert.ok(responses.every(row => row.ok)); assert.equal((await send("list")).data.length, 15);
});
test("content scripts cannot list, import, edit or delete records", async () => {
  const { send, contentSender } = background();
  for (const action of ["list", "save", "delete", "import", "arm"]) assert.equal((await send(action, {}, contentSender)).ok, false);
});
test("arming does not create a record, attempts are idempotent, success requires an attempt", async () => {
  const { send, contentSender } = background();
  const armed = await send("arm", { tabId: 1, expectedUrl: contentSender.url, record: { company: "Company", role: "Engineer" } });
  assert.equal(armed.ok, true); assert.equal((await send("list")).data.length, 0);
  assert.equal((await send("result", { attemptId: armed.data.id, status: "applied" }, contentSender)).ok, false);
  const attempts = await Promise.all([1, 2, 3].map(() => send("attempt", { attemptId: armed.data.id }, contentSender)));
  assert.ok(attempts.every(row => row.ok)); const pending = (await send("list")).data;
  assert.equal(pending.length, 1); assert.equal(pending[0].status, "pending"); assert.equal(pending[0].appliedAt, "");
  await send("result", { attemptId: armed.data.id, status: "applied", evidence: "投递成功" }, contentSender);
  const complete = (await send("list")).data[0]; assert.equal(complete.status, "applied"); assert.ok(complete.confirmedAt); assert.equal(complete.evidence, "投递成功");
});
test("another tab, iframe or origin cannot confirm an armed application", async () => {
  const { send, contentSender } = background();
  const armed = await send("arm", { tabId: 1, expectedUrl: contentSender.url, record: { company: "Company", role: "Engineer" } });
  for (const from of [{ ...contentSender, frameId: 2 }, { ...contentSender, tab: { id: 2 } }, { ...contentSender, url: "https://evil.example/" }]) {
    assert.equal((await send("attempt", { attemptId: armed.data.id }, from)).ok, false);
  }
  assert.equal((await send("list")).data.length, 0);
});
test("a manual status edit is not overwritten by a late website result", async () => {
  const { send, contentSender } = background();
  const armed = await send("arm", { tabId: 1, expectedUrl: contentSender.url, record: { company: "Company", role: "Engineer" } });
  await send("attempt", { attemptId: armed.data.id }, contentSender);
  const record = (await send("list")).data[0]; await send("save", { record: { ...record, status: "interview" } });
  await send("result", { attemptId: armed.data.id, status: "failed", evidence: "提交失败" }, contentSender);
  assert.equal((await send("list")).data[0].status, "interview");
});
test("a second armed tab cannot overwrite a completed record or auto-submit it again", async () => {
  const { send, contentSender } = background();
  const options = { expectedUrl: contentSender.url, record: { company: "Company", role: "Engineer" } };
  const first = await send("arm", { ...options, tabId: 1 }), second = await send("arm", { ...options, tabId: 2 });
  await send("attempt", { attemptId: first.data.id }, contentSender);
  await send("result", { attemptId: first.data.id, status: "applied", evidence: "投递成功" }, contentSender);
  assert.equal((await send("attempt", { attemptId: second.data.id }, { ...contentSender, tab: { id: 2 } })).ok, false);
  assert.equal((await send("list")).data[0].status, "applied");
});
test("imports are validated before writing and deduplicate web tracker records", async () => {
  const { send } = background(); const record = { company: "A", role: "Engineer", jobUrl: "https://jobs.example/1", ownerId: "private-owner", status: "applied", submittedAt: "2026-10-07T08:00:00.000Z", confirmedAt: "2026-10-07T08:00:01.000Z", evidence: "投递成功" };
  assert.equal((await send("import", { records: [record, { company: "missing role" }] })).ok, false);
  assert.equal((await send("list")).data.length, 0);
  assert.equal((await send("import", { records: [record, record] })).data.added, 1);
  assert.equal((await send("list")).data[0].ownerId, undefined);
  assert.equal((await send("list")).data[0].submittedAt, record.submittedAt); assert.equal((await send("list")).data[0].confirmedAt, record.confirmedAt); assert.equal((await send("list")).data[0].evidence, record.evidence);
});
