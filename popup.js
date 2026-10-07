"use strict";
const q = selector => document.querySelector(selector);
let tabId = null, rows = [], busy = false, scannedOverwrite = false;
let job = null;
async function tracker(action, extra = {}) {
  const response = await chrome.runtime.sendMessage({ type: "rk:tracker", action, ...extra });
  if (!response?.ok) throw new Error(response?.error || "投递簿暂时不可用。"); return response.data;
}
async function recorder(method) {
  if (tabId === null) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !/^https?:/i.test(tab.url || "")) throw new Error("请切换到 HTTP 或 HTTPS 招聘网页。");
    tabId = tab.id;
  }
  await chrome.scripting.executeScript({ target: { tabId }, files: ["recorder.js"] });
  const results = await chrome.scripting.executeScript({ target: { tabId }, func: async name => {
    try { return { data: await globalThis.ResumeRecorder[name]() }; } catch (err) { return { error: err.message }; }
  }, args: [method] });
  const result = results[0]?.result;
  if (!result || result.error) throw new Error(result?.error || "页面已切换，请到投递簿查看提交结果。");
  return result.data;
}
function status(text, error = false) { q("#status").hidden = !text; q("#status").textContent = text; q("#status").classList.toggle("error", error); }
async function run(method, args, needInit = true) {
  if (tabId === null) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !/^(https?|file):/i.test(tab.url || "")) throw new Error("请切换到招聘网页。浏览器设置页、扩展页和商店页面不能填写。");
    tabId = tab.id;
  }
  if (needInit) await chrome.scripting.executeScript({ target: { tabId }, files: ["shared/profile.js", "shared/matcher.js", "content.js"] });
  const results = await chrome.scripting.executeScript({ target: { tabId }, func: async (name, params) => {
    try {
      if (!globalThis.ResumeKit) return { error: "当前页面尚无可撤销的填写记录。" };
      return { data: await globalThis.ResumeKit[name](params) };
    } catch (err) { return { error: err.message }; }
  }, args: [method, args || {}] });
  const result = results[0]?.result;
  if (!result || result.error) throw new Error(result?.error || "页面没有响应，请刷新网页后重试。");
  return result.data;
}
function readableError(err) {
  if (/cannot access|cannot be scripted|missing host permission/i.test(err.message)) return "浏览器不允许访问这个页面。请在普通招聘网页使用；本地测试页需开启插件的“允许访问文件网址”。";
  return err.message;
}
async function action(fn) {
  if (busy) return; busy = true;
  for (const id of ["scan", "manual", "undo", "fill", "prepare", "arm", "submit"]) q(`#${id}`).disabled = true;
  try { await fn(); } catch (err) { status(readableError(err), true); }
  finally { busy = false; for (const id of ["scan", "manual", "undo", "prepare", "arm"]) q(`#${id}`).disabled = false; updateFill(); updateSubmit(); }
}
function updateSubmit() { q("#submit").disabled = busy || !job || !q("#reviewed").checked || !q("#job-company").value.trim() || !q("#job-role").value.trim(); }
function updateFill() {
  const count = q("#preview-list").querySelectorAll('input:checked:not(:disabled)').length;
  q("#fill").textContent = `填入勾选项${count ? `（${count}）` : ""}`; q("#fill").disabled = busy || !count;
}
function renderRows() {
  q("#preview").hidden = false; q("#preview-list").replaceChildren();
  q("#preview-count").textContent = `${rows.length} 个字段 · ${rows.filter(r => !r.reason).length} 个可填`;
  for (const row of rows) {
    const label = document.createElement("label"); label.className = `preview-row${row.reason ? " blocked" : ""}`;
    const check = document.createElement("input"); check.type = "checkbox"; check.dataset.id = row.id; check.disabled = Boolean(row.reason); check.checked = row.selected; check.onchange = updateFill;
    const body = document.createElement("div"); body.className = "row-body";
    for (const [className, text] of [["row-title", row.label], ["row-source", `${row.source}${row.mapped ? " · 已记住" : ""}`], ["row-value", row.sensitive ? "证件号码已隐藏，勾选后才会填入" : row.value], ["row-reason", row.reason || (row.sensitive ? "敏感资料默认不选，确认需要时再勾选。" : "")]]) {
      if (!text) continue; const div = document.createElement("div"); div.className = className; div.textContent = text; body.append(div);
    }
    label.append(check, body); q("#preview-list").append(label);
  }
  q("#select-all").checked = false; updateFill();
}
q("#edit").onclick = () => chrome.runtime.openOptionsPage();
q("#open-tracker").onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL("tracker.html") });
q("#prepare").onclick = () => action(async () => {
  tabId = null; job = await recorder("metadata");
  q("#preview").hidden = true;
  q("#job-company").value = job.company; q("#job-role").value = job.role; q("#job-location").value = job.location;
  q("#reviewed").checked = false; q("#delivery-editor").hidden = false;
  q("#submit-hint").textContent = job.submitButtons === 1 ? "识别到 1 个提交按钮。请先检查招聘网页及岗位信息。" : "未找到唯一的提交按钮。你可以在网页手动提交，插件继续记录。";
  status("请核对公司、岗位和网页填写内容。开启记录后，30 分钟内有效。");
  q("#delivery-editor").scrollIntoView({ block: "nearest" });
});
async function arm() {
  if (!job) throw new Error("请先识别岗位。");
  const record = { ...job, company: q("#job-company").value, role: q("#job-role").value, location: q("#job-location").value, resumeVersion: q("#job-resume").value, status: "saved" };
  await tracker("arm", { tabId, record, expectedUrl: job.jobUrl }); await recorder("resume");
}
q("#arm").onclick = () => action(async () => { await arm(); status("已开启本页自动记录。请在网页点击最终提交按钮；成功后可打开“我的投递簿”查看。跨域跳转或无法识别的提示需手动确认。"); });
q("#submit").onclick = () => action(async () => {
  if (!q("#reviewed").checked) throw new Error("请先核对并勾选提交确认。");
  await arm(); await recorder("submit"); status("已经尝试提交，正在记录网站结果。请到投递簿查看；待确认记录需要核对实际投递情况。");
});
q("#reviewed").onchange = updateSubmit;
for (const id of ["job-company", "job-role"]) q(`#${id}`).oninput = updateSubmit;
q("#scan").onclick = () => action(async () => {
  tabId = null; q("#preview").hidden = true; status("正在识别页面字段…");
  scannedOverwrite = q("#overwrite").checked;
  const result = await run("scan", { overwrite: scannedOverwrite }); rows = result.rows; renderRows();
  const summary = [`识别到 ${rows.length} 个有资料的字段。`, result.unknown ? `${result.unknown} 个字段未确定对应关系，可手动指定。` : "", result.missing ? `${result.missing} 个字段缺少已录入资料。` : "", result.crossFrames ? "页面含跨域内嵌表单，需打开该表单的独立网址使用。" : ""].filter(Boolean).join(" ");
  status(rows.length ? summary : `暂未找到可填写项。请检查资料是否已保存、表单是否展开，再尝试手动指定。${result.crossFrames ? " 检测到跨域内嵌表单。" : ""}`);
});
q("#overwrite").onchange = () => { rows = []; q("#preview").hidden = true; status("覆盖选项已改变，请重新扫描页面。"); };
q("#select-all").onchange = event => { for (const check of q("#preview-list").querySelectorAll("input:not(:disabled)")) { const row = rows.find(r => r.id === check.dataset.id); if (!row?.sensitive) check.checked = event.target.checked; } updateFill(); };
q("#fill").onclick = () => action(async () => {
  const ids = [...q("#preview-list").querySelectorAll("input:checked:not(:disabled)")].map(input => input.dataset.id);
  status("正在填入，请保持当前页面…");
  const result = await run("fill", { ids, overwrite: scannedOverwrite }, false);
  for (const outcome of result.results) { const row = rows.find(r => r.id === outcome.id); if (row) { row.reason = outcome.ok ? "已填入" : outcome.reason; row.selected = false; } }
  renderRows(); status(`已填入 ${result.filled} 项${result.results.some(r => !r.ok) ? "，部分字段已跳过，请查看预览说明" : ""}。请在网页核对后自行提交。`);
});
q("#manual").onclick = () => action(async () => { await run("showMapper"); window.close(); });
q("#undo").onclick = () => action(async () => { const result = await run("undo", {}, false); q("#preview").hidden = true; status(`已恢复 ${result.restored} 项${result.skipped ? `，${result.skipped} 项因网页内容变化而保留` : ""}。`); });
(async () => {
  try {
    const stored = await chrome.storage.local.get("rk.profile"), profile = ResumeData.normalize(stored["rk.profile"] || ResumeData.empty()), fields = ResumeData.flatten(profile);
    q("#profile-name").textContent = profile.personal.name || "我的简历"; q("#avatar").textContent = profile.personal.name?.slice(0, 1) || "人";
    q("#profile-meta").textContent = fields.length ? `${fields.length} 项资料 · ${profile.education.length + profile.work.length + profile.projects.length} 段主要经历${profile.family.length ? ` · ${profile.family.length} 位家人` : ""}` : "先点右上角，录入你的资料";
    if (!fields.length) status("欢迎使用，先点击“编辑资料”并保存，再回到招聘网页扫描。");
  } catch (err) { status(err.message, true); }
})();
