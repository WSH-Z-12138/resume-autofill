"use strict";
const D = ResumeData;
const q = selector => document.querySelector(selector);
let profile = D.empty(), currentSection = "personal", dirty = false, saving = false;
const changedStructure = new Set();
const hasStorage = Boolean(globalThis.chrome?.storage?.local);
const descriptions = {
  personal: "按需填写，留空的资料不会写入网页。证件号码在预览中默认不勾选。",
  career: "保存常用求职意向，投递不同岗位时可随时调整。",
  education: "可添加多段教育经历，顺序应与网页上的经历行一致。",
  work: "工作和实习经历分别添加。仍在职的结束时间可设为“至今”。",
  projects: "每个项目独立保存，具体职责和项目成果可以分开填写。",
  languages: "支持多种语言、考试和成绩。",
  certificates: "保存证书或奖项、颁发机构以及获得时间。",
  overview: "支持多行内容，可用于简历中的大段文字填写。",
  family: "可分别添加父亲、母亲、配偶等家人。网页家庭成员行的顺序应与此处一致，年龄请按实际情况更新。",
  custom: "没有预设的内容也能添加。网页别名用于自动匹配；也可在网页手动指定。"
};
function toast(message) { q("#toast").textContent = message; q("#toast").hidden = false; clearTimeout(toast.timer); toast.timer = setTimeout(() => { q("#toast").hidden = true; }, 4000); }
function markDirty() { dirty = true; q("#save-status").textContent = "有修改，尚未保存"; }
function node(tag, text, className) { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (className) el.className = className; return el; }
function renderNav() {
  q("#section-nav").replaceChildren();
  for (const section of D.sections) {
    const button = node("button"); button.type = "button";
    button.append(node("span", section.mark, "num"), node("span", section.title));
    button.classList.toggle("active", section.id === currentSection);
    button.setAttribute("aria-current", section.id === currentSection ? "page" : "false");
    button.onclick = () => { currentSection = section.id; render(); };
    q("#section-nav").append(button);
  }
}
function fieldControl(section, field, record, index) {
  const label = node("div", undefined, `field${field.type === "textarea" || section.id === "custom" ? " wide" : ""}`);
  const caption = node("label", field.label); label.append(caption);
  let input;
  if (field.type === "textarea") input = node("textarea");
  else if (field.type === "select") {
    input = node("select");
    const options = ["", ...field.options]; if (record[field.key] && !options.includes(record[field.key])) options.push(record[field.key]);
    for (const value of options) { const option = node("option", value || "暂不填写"); option.value = value; input.append(option); }
  } else { input = node("input"); input.type = ["month", "date", "tel", "email", "url"].includes(field.type) ? field.type : "text"; }
  input.name = `${section.id}.${section.repeated ? `${index}.` : ""}${field.key}`;
  input.id = `field-${input.name}`; caption.htmlFor = input.id;
  input.autocomplete = "off";
  const isCurrent = field.current && record[field.key] === "至今";
  input.value = isCurrent ? "" : record[field.key]; input.disabled = isCurrent;
  if (!isCurrent && record[field.key] && !input.value && ["date", "month"].includes(input.type)) { input.type = "text"; input.value = record[field.key]; }
  input.placeholder = field.type === "textarea" ? "可输入多行内容…" : `填写${field.label}`;
  input.oninput = () => { record[field.key] = input.value; markDirty(); updateCount(); };
  label.append(input);
  if (field.hint) label.append(node("small", field.hint));
  // Keep checkbox outside the wrapping label to avoid nested label activation.
  if (field.current) {
    const currentLabel = node("label", undefined, "current-check");
    const check = node("input"); check.type = "checkbox"; check.checked = isCurrent; check.setAttribute("aria-label", "仍在进行，结束时间至今");
    check.onchange = () => { input.disabled = check.checked; if (check.checked) { input.value = ""; record[field.key] = "至今"; } else record[field.key] = input.value; markDirty(); updateCount(); };
    currentLabel.append(check, node("span", "仍在进行 / 至今")); label.append(currentLabel);
  }
  return label;
}
function updateCount() {
  const section = D.sections.find(s => s.id === currentSection);
  const fields = D.flatten(profile).filter(f => f.section === section.id);
  q("#field-count").textContent = `${fields.length} 项已填写${section.repeated ? ` · ${profile[section.id].length} ${section.id === "family" ? "位" : "段"}` : ""}`;
}
function render() {
  renderNav(); const section = D.sections.find(s => s.id === currentSection);
  q("#section-title").textContent = section.title; q("#section-kicker").textContent = `PROFILE / ${section.mark}`;
  q("#section-description").textContent = descriptions[section.id];
  const editor = q("#editor"); editor.replaceChildren();
  const records = section.repeated ? profile[section.id] : [profile[section.id]];
  if (!records.length) {
    const empty = node("div", undefined, "empty-state"); empty.append(node("strong", section.id === "family" ? "添加一位家庭成员" : "从一段经历开始"), node("p", section.id === "custom" ? "添加你需要的字段，内容不限。" : section.id === "family" ? "按需填写家人的基本情况，留空内容不会填入网页。" : "点击下方按钮，补充这部分简历。")); editor.append(empty);
  }
  records.forEach((record, index) => {
    const wrapper = node("div", undefined, section.repeated ? "record" : "");
    if (section.repeated) {
      const header = node("div", undefined, "record-head"), actions = node("div", undefined, "record-actions");
      const recordTitle = section.id === "family" ? [record.relationship, record.name].filter(Boolean).join(" · ") || "家庭成员" : record.school || record.company || record.name || record.language || record.label || section.title;
      header.append(node("h3", `${String(index + 1).padStart(2, "0")} / ${recordTitle}`));
      for (const [text, offset] of [["上移", -1], ["下移", 1]]) {
        const move = node("button", text); move.disabled = index + offset < 0 || index + offset >= records.length;
        move.onclick = () => { [records[index], records[index + offset]] = [records[index + offset], records[index]]; changedStructure.add(section.id); markDirty(); render(); };
        actions.append(move);
      }
      const remove = node("button", "移除", "danger-quiet");
      remove.onclick = () => { if (Object.values(record).some(Boolean) && !confirm("移除此条资料？此操作需要保存后生效。")) return; records.splice(index, 1); changedStructure.add(section.id); markDirty(); render(); };
      actions.append(remove); header.append(actions); wrapper.append(header);
    }
    const grid = node("div", undefined, "field-grid");
    for (const field of section.fields) grid.append(fieldControl(section, field, record, index));
    wrapper.append(grid); editor.append(wrapper);
  });
  q("#add-record").hidden = !section.repeated;
  q("#add-record").textContent = section.id === "custom" ? "＋ 添加自定义字段" : `＋ 添加${section.title.replace(" / ", "或")} `;
  q("#add-record").onclick = () => { profile[section.id].push(D.blankRecord(section)); markDirty(); render(); };
  updateCount();
}
async function mappingCount() {
  if (!hasStorage) return;
  const stored = await chrome.storage.local.get(null);
  const keys = Object.keys(stored).filter(k => k.startsWith("rk.maps:"));
  q("#mapping-count").textContent = `${keys.reduce((n, k) => n + (Array.isArray(stored[k]) ? stored[k].length : 0), 0)} 项已记住`;
}
async function save() {
  if (!hasStorage) { toast("请先在浏览器扩展管理页加载此插件，再保存个人资料。"); return false; }
  if (saving) return false;
  saving = true; q("#save").disabled = true;
  const savedSnapshot = JSON.stringify(profile), structureSnapshot = [...changedStructure];
  try {
    const patch = { "rk.profile": D.normalize(JSON.parse(savedSnapshot)) };
    if (structureSnapshot.length) {
      const stored = await chrome.storage.local.get(null);
      for (const key of Object.keys(stored).filter(k => k.startsWith("rk.maps:"))) patch[key] = (Array.isArray(stored[key]) ? stored[key] : []).filter(m => !structureSnapshot.includes(m.path?.split(".")[0]));
    }
    await chrome.storage.local.set(patch);
    dirty = JSON.stringify(profile) !== savedSnapshot;
    if (!dirty) { changedStructure.clear(); q("#save-status").textContent = "已保存在本机"; } else q("#save-status").textContent = "有修改，尚未保存";
    toast("资料已保存，可回到招聘网页使用。"); await mappingCount(); return true;
  } catch (err) { toast(`保存失败：${err.message}`); return false; }
  finally { saving = false; q("#save").disabled = false; }
}
q("#save").onclick = save;
q("#export").onclick = () => {
  const blob = new Blob([JSON.stringify(D.normalize(profile), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob), anchor = node("a"); anchor.href = url; anchor.download = "我的简历资料.json"; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("已导出当前编辑内容（包含尚未保存的修改）。");
};
q("#import").onclick = () => q("#import-file").click();
q("#import-file").onchange = async event => {
  const file = event.target.files[0]; if (!file) return;
  try {
    if (file.size > 2 * 1024 * 1024) throw new Error("文件超过 2 MB，请检查是否为正确的资料 JSON。");
    const source = JSON.parse((await file.text()).replace(/^\uFEFF/, ""));
    if (!D.sections.some(s => Object.hasOwn(source, s.id))) throw new Error("文件不包含简历分类，请使用本插件导出的 JSON。");
    const next = D.normalize(source);
    if (!confirm("导入会替换当前编辑内容，保存后所有已记住的网页对应关系将失效。是否继续？")) return;
    profile = next; D.sections.forEach(s => changedStructure.add(s.id)); markDirty(); render(); toast("已导入，请核对并点击保存资料。");
  } catch (err) { toast(`导入失败：${err.message}`); }
  finally { event.target.value = ""; }
};
q("#sample").onclick = () => {
  if (D.flatten(profile).length && !confirm("用虚构示例替换当前编辑内容？保存后网页对应关系将失效。请先导出需要保留的资料。")) return;
  profile = D.example(); D.sections.forEach(s => changedStructure.add(s.id)); markDirty(); render(); toast("已载入虚构示例，实际投递前请替换成自己的资料。");
};
q("#guide").onclick = () => q("#guide-dialog").showModal();
q("#close-guide").onclick = () => q("#guide-dialog").close();
q("#clear-mappings").onclick = async () => {
  if (!hasStorage || !confirm("清除所有网页对应关系？个人简历资料会保留。")) return;
  try { const stored = await chrome.storage.local.get(null), patch = Object.fromEntries(Object.keys(stored).filter(k => k.startsWith("rk.maps:")).map(k => [k, []])); await chrome.storage.local.set(patch); await mappingCount(); toast("网页对应关系已清除。"); } catch (err) { toast(err.message); }
};
window.addEventListener("beforeunload", event => { if (dirty) { event.preventDefault(); event.returnValue = ""; } });
document.addEventListener("keydown", event => { if ((event.ctrlKey || event.metaKey) && event.key === "s") { event.preventDefault(); save(); } });
(async () => {
  try { if (hasStorage) { const stored = await chrome.storage.local.get("rk.profile"); profile = D.normalize(stored["rk.profile"] || D.empty()); q("#save-status").textContent = stored["rk.profile"] ? "资料已保存在本机" : "填写后点击保存"; } else q("#save-status").textContent = "界面预览 · 加载插件后可保存"; render(); await mappingCount(); }
  catch (err) { render(); q("#save-status").textContent = "读取失败"; toast(err.message); }
})();
