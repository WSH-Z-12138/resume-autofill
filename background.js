"use strict";
importScripts("shared/applications.js");
const A = ResumeApplications, RECORDS_KEY = "rk.applications";
const attemptKey = tabId => `rk.attempt:${tabId}`;
const MAX_AGE = 30 * 60 * 1000;
let queue = Promise.resolve();
const serialize = fn => { const next = queue.then(fn); queue = next.catch(() => {}); return next; };
async function records() { const stored = await chrome.storage.local.get(RECORDS_KEY); return Array.isArray(stored[RECORDS_KEY]) ? stored[RECORDS_KEY] : []; }
async function write(rows) { await chrome.storage.local.set({ [RECORDS_KEY]: rows }); }
async function attempt(tabId) { return (await chrome.storage.session.get(attemptKey(tabId)))[attemptKey(tabId)]; }
const extensionSender = sender => sender.id === chrome.runtime.id && sender.url?.startsWith(chrome.runtime.getURL(""));
async function handle(message, sender) {
  const trusted = extensionSender(sender), action = message.action;
  if (!trusted && !["state", "attempt", "result"].includes(action)) throw new Error("请求来源无效。");
  if (action === "list") return records();
  if (action === "save") {
    const rows = await records(), values = A.normalize(message.record);
    const index = rows.findIndex(row => row.id === message.record?.id);
    if (message.record?.id && index < 0) throw new Error("记录已不存在，请刷新投递簿。");
    const now = new Date().toISOString();
    const row = { ...(index < 0 ? { id: crypto.randomUUID(), createdAt: now } : rows[index]), ...values, updatedAt: now };
    // A manual confirmation is an explicit user decision, not website evidence.
    if (values.status === "applied" && rows[index]?.status !== "applied") { row.confirmedAt = now; row.evidence = "用户手动确认"; if (!row.appliedAt) row.appliedAt = A.localDate(); }
    if (index < 0) rows.push(row); else rows[index] = row;
    await write(rows); return row;
  }
  if (action === "delete") {
    const rows = await records();
    await write(rows.filter(row => row.id !== message.id)); return true;
  }
  if (action === "import") {
    if (!Array.isArray(message.records) || message.records.length > 5000) throw new Error("请导入不超过 5000 条的投递记录数组。");
    const values = message.records.map(record => {
      const value = A.normalize(record);
      for (const key of ["submittedAt", "confirmedAt", "createdAt", "updatedAt"]) {
        const time = typeof record[key] === "string" ? Date.parse(record[key]) : NaN;
        if (Number.isFinite(time)) value[key] = new Date(time).toISOString();
      }
      value.evidence = A.clean(record.evidence, 180) || "从备份导入"; return value;
    }), rows = await records(), now = new Date().toISOString();
    const seen = new Set(rows.map(A.identity)); let added = 0;
    for (const value of values) {
      const key = A.identity(value); if (seen.has(key)) continue;
      rows.push({ ...value, id: crypto.randomUUID(), createdAt: value.createdAt || now, updatedAt: value.updatedAt || now }); seen.add(key); added++;
    }
    await write(rows); return { added, skipped: values.length - added };
  }
  if (action === "arm" || action === "cancel") {
    if (!Number.isInteger(message.tabId)) throw new Error("请先切换到招聘页面。");
    const tab = await chrome.tabs.get(message.tabId), key = attemptKey(tab.id);
    if (action === "cancel") { await chrome.storage.session.remove(key); return true; }
    const values = A.normalize(message.record), url = new URL(tab.url);
    if (message.expectedUrl !== tab.url) throw new Error("招聘网页已切换，请重新识别岗位。");
    if (!/^https?:$/.test(url.protocol)) throw new Error("投递记录请在 HTTP 或 HTTPS 招聘网页使用。");
    values.jobUrl = A.jobURL(tab.url);
    const old = await attempt(tab.id), rows = await records();
    if (old?.submittedAt && Date.now() - old.startedAt < MAX_AGE && A.identity(old.record) === A.identity(values) && rows.find(row => row.id === old.applicationId)?.status === "pending") throw new Error("本页已有提交等待确认，请先查看投递簿，避免重复提交。");
    const known = rows.find(row => A.identity(row) === A.identity(values) && !["pending", "failed", "saved"].includes(row.status));
    if (known) throw new Error("此岗位已经记录过投递，请到投递簿查看，避免重复提交。");
    const armed = { id: crypto.randomUUID(), origin: url.origin, pageURL: tab.url, startedAt: Date.now(), record: values, submittedAt: "", applicationId: "" };
    await chrome.storage.session.set({ [key]: armed }); return armed;
  }
  const tabId = sender.tab?.id;
  if (!Number.isInteger(tabId) || sender.frameId !== 0) throw new Error("记录仅支持当前顶层招聘页面。");
  const active = await attempt(tabId);
  if (!active || Date.now() - active.startedAt > MAX_AGE || new URL(sender.url).origin !== active.origin) {
    if (active && Date.now() - active.startedAt > MAX_AGE) await chrome.storage.session.remove(attemptKey(tabId));
    if (action === "state") return null;
    throw new Error("记录已停止或超过 30 分钟，请重新开启。");
  }
  const pageURL = new URL(sender.url), sourceURL = new URL(active.pageURL);
  // Another job on the same site is not a result page for the previous attempt.
  // Unrecognized redirects remain pending rather than attaching to unrelated forms.
  const canonicalPage = new URL(A.jobURL(pageURL.href));
  const sameJob = canonicalPage.href === A.jobURL(sourceURL.href) || (pageURL.pathname === sourceURL.pathname && !canonicalPage.search && !canonicalPage.hash);
  const resultPath = /(?:^|\/)(?:success|confirmation|complete|completed|thank-you|thankyou|result)(?:\/|\.|$)/i.test(pageURL.pathname);
  if (!sameJob && !resultPath) { if (action === "state") return null; throw new Error("已进入其他岗位页面，请重新开启记录。"); }
  if (action === "state") return active;
  if (message.attemptId !== active.id) throw new Error("记录会话已变更，请重新开启。");
  const rows = await records(), now = new Date().toISOString();
  if (action === "attempt") {
    if (active.submittedAt) return active;
    const index = rows.findIndex(row => A.identity(row) === A.identity(active.record));
    if (index >= 0 && !["pending", "failed", "saved"].includes(rows[index].status)) throw new Error("此岗位已在其他页面记录为已投递，请勿重复提交。");
    const row = { ...(index < 0 ? { id: crypto.randomUUID(), createdAt: now } : rows[index]), ...active.record, status: "pending", submittedAt: now, appliedAt: "", confirmedAt: "", evidence: "已尝试提交，等待网站成功提示", updatedAt: now };
    if (index < 0) rows.push(row); else rows[index] = row;
    await write(rows);
    active.submittedAt = now; active.applicationId = row.id;
    await chrome.storage.session.set({ [attemptKey(tabId)]: active }); return active;
  }
  if (action === "result") {
    if (!active.submittedAt || !["applied", "failed"].includes(message.status)) throw new Error("尚未提交，不能确认结果。");
    const row = rows.find(row => row.id === active.applicationId);
    if (!row || row.status !== "pending") { await chrome.storage.session.remove(attemptKey(tabId)); return null; }
    row.status = message.status; row.updatedAt = now; row.evidence = A.clean(message.evidence, 180);
    if (message.status === "applied") { row.appliedAt = A.localDate(); row.confirmedAt = now; }
    await write(rows); await chrome.storage.session.remove(attemptKey(tabId)); return row;
  }
  throw new Error("未知操作。");
}
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "rk:tracker") return;
  serialize(() => handle(message, sender)).then(data => sendResponse({ ok: true, data }), error => sendResponse({ ok: false, error: error.message }));
  return true;
});
// activeTab remains valid across same-origin navigation. Reattach only for an armed tab.
chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (change.status !== "complete") return;
  (async () => {
    const active = await attempt(tabId); if (!active || Date.now() - active.startedAt > MAX_AGE) return;
    const tab = await chrome.tabs.get(tabId);
    if (new URL(tab.url).origin !== active.origin) return;
    await chrome.scripting.executeScript({ target: { tabId }, files: ["recorder.js"] });
  })().catch(() => { /* Cross-origin redirects remain pending for user confirmation. */ });
});
chrome.tabs.onRemoved.addListener(tabId => { void chrome.storage.session.remove(attemptKey(tabId)); });
chrome.runtime.onInstalled.addListener(details => {
  if (details.reason === "install") chrome.runtime.openOptionsPage();
});
