"use strict";
const q = selector => document.querySelector(selector);
let tabId = null, rows = [], busy = false, scannedOverwrite = false;
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
  for (const id of ["scan", "manual", "undo", "fill"]) q(`#${id}`).disabled = true;
  try { await fn(); } catch (err) { status(readableError(err), true); }
  finally { busy = false; for (const id of ["scan", "manual", "undo"]) q(`#${id}`).disabled = false; updateFill(); }
}
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
