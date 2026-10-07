"use strict";
const q = selector => document.querySelector(selector), A = ResumeApplications;
let records = [], editing = null, submitting = false;
async function request(action, extra = {}) {
  const response = await chrome.runtime.sendMessage({ type: "rk:tracker", action, ...extra });
  if (!response?.ok) throw new Error(response?.error || "投递簿暂时不可用。"); return response.data;
}
function status(message) { q("#tracker-status").textContent = message; q("#tracker-status").hidden = !message; }
function isDue(row) { return ["applied", "contact", "interview"].includes(row.status) && row.followUpAt && row.followUpAt <= A.localDate(); }
function node(tag, text, className) { const el = document.createElement(tag); if (text != null) el.textContent = text; if (className) el.className = className; return el; }
function visibleRows() {
  const search = q("#search").value.trim().toLowerCase(), filter = q("#filter").value, sort = q("#sort").value;
  return records.filter(row => (filter === "all" || row.status === filter) && (!q("#due-only").checked || isDue(row)) && [row.company, row.role, row.notes, row.source, row.location].join(" ").toLowerCase().includes(search)).sort((a, b) => sort === "followUp" ? (a.followUpAt || "9999").localeCompare(b.followUpAt || "9999") : (sort === "applied" ? b.appliedAt || "" : b.updatedAt || "").localeCompare(sort === "applied" ? a.appliedAt || "" : a.updatedAt || ""));
}
function render() {
  q("#stat-all").textContent = records.length; q("#stat-active").textContent = records.filter(row => ["applied", "contact"].includes(row.status)).length;
  q("#stat-interview").textContent = records.filter(row => row.status === "interview").length; q("#stat-pending").textContent = records.filter(row => row.status === "pending").length; q("#stat-due").textContent = records.filter(isDue).length;
  const rows = visibleRows(); q("#result-count").textContent = `${rows.length} 个岗位 / 共 ${records.length} 条记录`; q("#rows").replaceChildren(); q("#empty").hidden = rows.length > 0;
  for (const row of rows) {
    const tr = document.createElement("tr"), job = document.createElement("td");
    job.append(node("span", row.company, "job-company"), node("span", row.role, "job-role"));
    if (row.location || row.salary) job.append(node("span", [row.location, row.salary].filter(Boolean).join(" · "), "job-detail"));
    if (row.nextStep) job.append(node("span", `下一步：${row.nextStep}`, "job-detail"));
    const url = A.jobURL(row.jobUrl); if (url) { const link = node("a", "查看岗位 ↗", "job-link"); link.href = url; link.target = "_blank"; link.rel = "noopener noreferrer"; job.append(link); }
    const state = document.createElement("td"); state.append(node("span", A.STATUSES[row.status] || row.status, `status-pill status-${row.status}`));
    const date = node("td", row.appliedAt || "—"), follow = node("td", row.followUpAt || "—", isDue(row) ? "follow-up-due" : "");
    const source = document.createElement("td"); source.append(node("span", row.source || "—"), node("span", row.resumeVersion || "", "job-detail"));
    const actions = document.createElement("td"), buttons = node("div", null, "table-actions");
    const edit = node("button", "编辑"), remove = node("button", "删除"); edit.onclick = () => openRecord(row);
    remove.onclick = async () => {
      if (!confirm(`删除「${row.company} · ${row.role}」这条记录？`)) return;
      remove.disabled = true; try { await request("delete", { id: row.id }); await load(); } catch (err) { status(err.message); remove.disabled = false; }
    };
    buttons.append(edit, remove); actions.append(buttons); tr.append(job, state, date, follow, source, actions); q("#rows").append(tr);
  }
}
async function load() { try { records = await request("list"); render(); } catch (err) { status(err.message); } }
function openRecord(row) {
  editing = row?.id || null; q("#record-form").reset(); q("#dialog-error").hidden = true;
  const draft = row || { status: "saved", priority: "medium" };
  for (const input of q("#record-form").elements) if (input.name) input.value = draft[input.name] || "";
  q("#dialog-title").textContent = row ? "编辑投递记录" : "记录新岗位";
  q("#record-evidence").textContent = row ? [`结果依据：${row.evidence || "手动记录"}`, row.submittedAt ? `尝试提交：${new Date(row.submittedAt).toLocaleString("zh-CN")}` : "", row.confirmedAt ? `确认时间：${new Date(row.confirmedAt).toLocaleString("zh-CN")}` : ""].filter(Boolean).join("\n") : "标记为“已投递”表示你已经核实提交成功。";
  q("#record-dialog").showModal();
}
for (const [value, label] of Object.entries(A.STATUSES)) { for (const target of ["#filter", "#edit-status"]) { const option = node("option", label); option.value = value; q(target).append(option); } }
q("#add").onclick = () => openRecord(null); q("#close").onclick = () => q("#record-dialog").close();
q("#record-form").onsubmit = async event => {
  event.preventDefault(); if (submitting) return; submitting = true; q("#save-record").disabled = true;
  try { const record = Object.fromEntries(new FormData(event.target)); if (editing) record.id = editing; await request("save", { record }); q("#record-dialog").close(); await load(); status("记录已保存在本机。"); }
  catch (err) { q("#dialog-error").textContent = err.message; q("#dialog-error").hidden = false; }
  finally { submitting = false; q("#save-record").disabled = false; }
};
for (const id of ["search", "filter", "sort", "due-only"]) q(`#${id}`).addEventListener(id === "search" ? "input" : "change", render);
function download(content, type, name) { const url = URL.createObjectURL(new Blob([content], { type })), link = node("a"); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
q("#export-csv").onclick = () => download(A.csv(visibleRows()), "text/csv;charset=utf-8", `投递簿-${A.localDate()}.csv`);
q("#export-json").onclick = () => download(JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), applications: records }, null, 2), "application/json", `投递簿备份-${A.localDate()}.json`);
q("#import").onclick = () => q("#import-file").click();
q("#import-file").onchange = async event => {
  const file = event.target.files[0]; if (!file) return;
  try { if (file.size > 8 * 1024 * 1024) throw new Error("备份文件不能超过 8 MB。"); const data = JSON.parse(await file.text()); const result = await request("import", { records: Array.isArray(data) ? data : data.applications }); await load(); status(`已导入 ${result.added} 条，跳过 ${result.skipped} 条重复记录。`); }
  catch (err) { status(err instanceof SyntaxError ? "备份不是有效的 JSON 文件。" : err.message); }
  finally { event.target.value = ""; }
};
chrome.storage.onChanged.addListener((changes, area) => { if (area === "local" && changes["rk.applications"]) void load(); });
void load();
