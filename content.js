(function () {
  "use strict";
  if (globalThis.ResumeKit) return;
  const D = ResumeData, M = ResumeMatcher;
  const selector = 'input,textarea,select,[contenteditable="true"],[role="textbox"],[role="combobox"]';
  const state = { plan: new Map(), undo: [], scannedURL: "", panel: null, selecting: false };
  const mapKey = () => `rk.maps:${location.origin}${location.pathname}`;
  const isOur = el => el.closest?.('[data-resumekit-panel]');
  function visible(el) {
    const view = el.ownerDocument.defaultView, style = view.getComputedStyle(el);
    return el.isConnected && !el.closest('[hidden],[inert],[aria-hidden="true"]') && style.display !== "none" && style.visibility !== "hidden" && el.getClientRects().length > 0;
  }
  function collect() {
    const output = [], roots = [];
    function visit(root, chain) {
      roots.push(root);
      for (const el of root.querySelectorAll(selector)) {
        if (isOur(el) || !visible(el)) continue;
        // A contenteditable wrapper is one field; do not fill its nested editor nodes twice.
        if (el.parentElement?.closest('[contenteditable="true"]')) continue;
        output.push({ el, root, chain });
      }
      for (const el of root.querySelectorAll('*')) {
        if (isOur(el)) continue;
        if (el.shadowRoot) visit(el.shadowRoot, [...chain, { kind: "shadow", selector: cssPath(el, root) }]);
        if (el.tagName === "IFRAME" && visible(el)) {
          try { if (el.contentDocument?.documentElement) visit(el.contentDocument, [...chain, { kind: "frame", selector: cssPath(el, root) }]); } catch (_) { /* Cross-origin frames require a separate site adapter. */ }
        }
      }
    }
    visit(document, []);
    const seen = new Set();
    return { roots, controls: output.filter(item => {
      const el = item.el;
      if (el.type !== "radio" || !el.name) return true;
      const group = output.filter(other => other.el.type === "radio" && other.el.name === el.name && other.root === item.root && other.el.form === el.form).map(other => other.el);
      if (seen.has(group[0])) return false;
      group.forEach(node => seen.add(node));
      item.group = group;
      return true;
    }) };
  }
  function cssPath(el, root = el.getRootNode()) {
    const escape = el.ownerDocument.defaultView.CSS.escape;
    if (el.id && root.querySelectorAll(`#${escape(el.id)}`).length === 1) return `#${escape(el.id)}`;
    const parts = [];
    for (let node = el; node?.nodeType === 1; node = node.parentElement) {
      const tag = node.tagName.toLowerCase();
      const siblings = node.parentElement ? [...node.parentElement.children].filter(n => n.tagName === node.tagName) : [];
      parts.unshift(`${tag}${siblings.length > 1 ? `:nth-of-type(${siblings.indexOf(node) + 1})` : ""}`);
      if (root.querySelectorAll(parts.join(" > ")).length === 1) return parts.join(" > ");
    }
    return parts.join(" > ");
  }
  function locator(item) { return { chain: item.chain, selector: cssPath(item.el, item.root) }; }
  function resolve(saved) {
    try {
      let root = document;
      for (const hop of saved.chain || []) {
        const matches = root.querySelectorAll(hop.selector);
        if (matches.length !== 1) return null;
        root = hop.kind === "shadow" ? matches[0].shadowRoot : matches[0].contentDocument;
        if (!root) return null;
      }
      const hits = root.querySelectorAll(saved.selector);
      return hits.length === 1 ? hits[0] : null;
    } catch (_) { return null; }
  }
  const shortText = el => (el?.textContent || "").trim().replace(/\s+/g, " ").slice(0, 180);
  function labelText(el) {
    if (!el) return "";
    const clone = el.cloneNode(true);
    for (const node of clone.querySelectorAll('input,textarea,select,button,small,[role="combobox"],[contenteditable],.hint,.help,.error')) node.remove();
    return shortText(clone);
  }
  function describe(item) {
    const el = item.el, root = item.root || el.getRootNode();
    const labels = [...(el.labels || [])].map(labelText);
    const aria = el.getAttribute("aria-label");
    if (aria) labels.push(aria);
    for (const id of (el.getAttribute("aria-labelledby") || "").split(/\s+/).filter(Boolean)) labels.push(shortText(root.getElementById?.(id)));
    const legend = el.closest("fieldset")?.querySelector(":scope > legend");
    if (legend && (el.type === "radio" || !labels.length)) labels.unshift(shortText(legend));
    const row = el.closest('.form-item,.form-group,.ant-form-item,.el-form-item,.field,.form-row,[data-field]');
    const rowLabel = row?.querySelector('label,.label,.ant-form-item-label,.el-form-item__label,[data-label]');
    if (rowLabel && !rowLabel.contains(el)) labels.push(labelText(rowLabel));
    const previous = el.previousElementSibling;
    if (!labels.length && previous && /LABEL|SPAN|DIV|P/.test(previous.tagName) && !previous.querySelector(selector)) labels.push(shortText(previous));
    // Recruitment forms commonly put family members in a table with column headings.
    const cell = el.closest("td"), table = cell?.closest("table"), tableRow = cell?.parentElement;
    if (table && tableRow && [...tableRow.cells].every(c => c.colSpan === 1 && c.rowSpan === 1)) {
      const column = cell.cellIndex;
      const header = [...table.rows].slice(0, tableRow.rowIndex).reverse().find(row => [...row.cells].every(c => c.tagName === "TH" && c.colSpan === 1 && c.rowSpan === 1) && row.cells.length === tableRow.cells.length);
      if (header) labels.push(labelText(header.cells[column]));
    }
    const placeholder = el.getAttribute("placeholder");
    if (placeholder) labels.push(placeholder);
    let section = null;
    for (let parent = el.parentElement, depth = 0; parent && depth < 9; parent = parent.parentElement, depth++) {
      const hints = [parent.getAttribute("data-section"), parent.getAttribute("aria-label")];
      const headings = [...parent.querySelectorAll(':scope > legend,:scope > h1,:scope > h2,:scope > h3,:scope > h4,:scope > header,:scope > .section-title,:scope > .card-title,:scope > .form-title')];
      hints.push(...headings.map(shortText));
      if (parent.tagName === "TABLE" && parent.caption) hints.push(shortText(parent.caption));
      // Attribute hints help sites whose repeated sections have no visible headings.
      hints.push(parent.id, parent.className && typeof parent.className === "string" ? parent.className : "");
      section = hints.map(text => M.sectionFrom(text, D.sections)).find(Boolean);
      if (section) break;
    }
    const type = el.tagName === "SELECT" ? "select" : el.type || (el.isContentEditable ? "contenteditable" : el.getAttribute("role") || "text");
    return { labels: [...new Set(labels.filter(Boolean))], attributes: [el.name, el.id].filter(Boolean), type, section, autocomplete: (el.getAttribute("autocomplete") || "").split(/\s+/).pop() };
  }
  function signature(item) {
    const desc = describe(item);
    return JSON.stringify([desc.type, desc.labels.map(M.norm), item.el.name || ""]);
  }
  function current(item) {
    if (item.group) return item.group.find(el => el.checked)?.value || "";
    return item.el.isContentEditable ? item.el.textContent : item.el.value ?? "";
  }
  function eligible(item) {
    const el = item.el, desc = item.desc || describe(item);
    if (["password", "hidden", "file", "submit", "button", "reset", "checkbox"].includes(desc.type)) return false;
    return !M.ignored.test([...desc.labels, ...desc.attributes].join(" "));
  }
  function prepared(item, field) {
    const el = item.el;
    if (!eligible(item)) return { error: "此类字段不自动填写。" };
    if (!visible(el) || el.disabled || el.matches(":disabled")) return { error: "字段当前不可编辑。" };
    if (el.tagName !== "SELECT" && (el.getAttribute("role") === "combobox" || (el.hasAttribute("aria-controls") && el.getAttribute("aria-autocomplete")))) return { error: "自定义下拉框，请使用手动模式复制后选择。" };
    if (el.readOnly) return { error: "只读字段或日期组件，请在网页手动选择。" };
    if (el.type === "radio" && !item.group) return { error: "未找到可靠的单选组，请在网页手动选择。" };
    if (item.group) {
      const hits = item.group.filter(radio => !radio.disabled && (M.equivalent(shortText(radio.labels?.[0]), field.value) || M.equivalent(radio.value, field.value)));
      return hits.length === 1 ? { radio: hits[0], value: hits[0].value } : { error: "没有唯一匹配的单选项。" };
    }
    if (el.tagName === "SELECT") {
      const option = M.optionFor([...el.options].map(o => ({ text: o.textContent, value: o.value, disabled: o.disabled || o.parentElement.disabled })), field.value);
      return option ? { value: option.value } : { error: "下拉选项没有准确匹配，请手动选择。" };
    }
    const converted = M.dateValue(field.value, el.type);
    if (converted.error) return converted;
    const value = converted.value;
    if (el.maxLength > -1 && value.length > el.maxLength) return { error: `内容超过网页限制的 ${el.maxLength} 个字符。` };
    if (el.type === "number" && (!/^-?\d+(?:\.\d+)?$/.test(value) || (el.min && Number(value) < Number(el.min)) || (el.max && Number(value) > Number(el.max)))) return { error: "此字段只接受指定范围的数字，请手动填写。" };
    if (["date", "month"].includes(el.type) && ((el.min && value < el.min) || (el.max && value > el.max))) return { error: "日期超出网页允许的范围。" };
    if (!("value" in el) && !el.isContentEditable) return { error: "此网页控件需要手动填写。" };
    return { value };
  }
  function dispatch(el) {
    const view = el.ownerDocument.defaultView;
    el.dispatchEvent(new view.Event("input", { bubbles: true, composed: true }));
    el.dispatchEvent(new view.Event("change", { bubbles: true, composed: true }));
  }
  function nativeSet(el, property, value) {
    const view = el.ownerDocument.defaultView;
    const prototype = el.tagName === "SELECT" ? view.HTMLSelectElement.prototype : el.tagName === "TEXTAREA" ? view.HTMLTextAreaElement.prototype : view.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, property)?.set;
    if (setter) setter.call(el, value); else el[property] = value;
  }
  function snapshot(item) {
    return { value: current(item), html: item.el.isContentEditable ? item.el.innerHTML : null, checks: item.group?.map(el => [el, el.checked]) };
  }
  function write(item, ready) {
    if (item.group) { nativeSet(ready.radio, "checked", true); dispatch(ready.radio); }
    else { if (item.el.isContentEditable) item.el.textContent = ready.value; else nativeSet(item.el, "value", ready.value); dispatch(item.el); }
  }
  function restore(entry) {
    if (entry.before.checks) { for (const [el, checked] of entry.before.checks) if (el.isConnected) nativeSet(el, "checked", checked); dispatch(entry.item.el); }
    else { if (entry.before.html !== null) entry.item.el.innerHTML = entry.before.html; else nativeSet(entry.item.el, "value", entry.before.value); dispatch(entry.item.el); }
  }
  async function scan({ overwrite = false } = {}) {
    const stored = await chrome.storage.local.get(["rk.profile", mapKey()]);
    const profile = D.normalize(stored["rk.profile"] || D.empty()), fields = D.flatten(profile, true);
    const saved = Array.isArray(stored[mapKey()]) ? stored[mapKey()] : [];
    const { controls } = collect();
    const matches = controls.map(item => {
      item.desc = describe(item);
      if (!eligible(item)) return item;
      const mapped = saved.find(m => resolve(m.locator) === item.el && m.signature === signature(item));
      const customField = mapped && D.get(profile, mapped.path);
      const result = customField ? { field: customField, score: 130 } : M.match(item.desc, fields);
      if (result) { item.field = result.field; item.score = result.score; item.mapped = Boolean(customField); }
      return item;
    });
    // Infer record containers: the largest ancestor with unique field keys is a single experience.
    for (const section of D.sections.filter(s => s.repeated && s.id !== "custom")) {
      const relevant = matches.filter(item => item.field?.section === section.id && !item.mapped);
      const groups = new Map();
      const occurrences = new Map();
      for (const item of relevant) {
        let container = null;
        for (let parent = item.el.parentElement, depth = 0; parent && depth < 10; parent = parent.parentElement, depth++) {
          const members = relevant.filter(m => parent.contains(m.el));
          if (new Set(members.map(m => m.field.key)).size < members.length) break;
          if (members.length >= 1) container = parent;
        }
        let index;
        if (container) { if (!groups.has(container)) groups.set(container, groups.size); index = groups.get(container); }
        else { index = occurrences.get(item.field.key) || 0; occurrences.set(item.field.key, index + 1); }
        const path = `${section.id}.${index}.${item.field.key}`;
        item.field = D.get(profile, path) || { ...item.field, value: "", path, index, fullLabel: `${section.title} ${index + 1} · ${item.field.label}` };
      }
    }
    state.plan.clear(); state.scannedURL = location.href;
    let unknown = 0, missing = 0;
    const rows = [];
    for (const item of matches) {
      if (!eligible(item)) continue;
      if (!item.field) { unknown++; continue; }
      if (!item.field.value.trim()) { missing++; continue; }
      item.beforeValue = current(item);
      item.previewSignature = signature(item);
      const ready = prepared(item, item.field);
      let reason = ready.error || "";
      if (!reason && item.beforeValue.trim() && !overwrite) reason = "网页已有内容，已保护；可勾选允许覆盖后重新扫描。";
      const id = crypto.randomUUID();
      state.plan.set(id, item);
      rows.push({ id, label: item.desc.labels[0] || item.el.name || item.el.id || "未命名字段", source: item.field.fullLabel, value: item.field.value, reason, sensitive: Boolean(item.field.sensitive), mapped: item.mapped, selected: !reason && !item.field.sensitive });
    }
    const crossFrames = [...document.querySelectorAll("iframe")].filter(el => { try { return visible(el) && !el.contentDocument; } catch (_) { return true; } }).length;
    return { rows, unknown, missing, crossFrames, url: location.href, title: document.title };
  }
  async function fill({ ids = [], overwrite = false } = {}) {
    if (state.scannedURL !== location.href) throw new Error("网页已切换，请重新扫描。" );
    const results = [];
    const batch = [];
    for (const id of ids.slice(0, 500)) {
      const item = state.plan.get(id);
      if (!item) { results.push({ id, ok: false, reason: "预览已失效，请重新扫描。" }); continue; }
      try {
        if (!item.el.isConnected || !visible(item.el)) throw new Error("网页字段已变化，请重新扫描。");
        if (signature(item) !== item.previewSignature) throw new Error("字段标签已变化，请重新扫描。");
        const valueNow = current(item);
        if (valueNow !== item.beforeValue) throw new Error("预览后字段内容发生变化，已跳过。");
        if (valueNow.trim() && !overwrite) throw new Error("网页已有内容，已跳过。");
        const ready = prepared(item, item.field);
        if (ready.error) throw new Error(ready.error);
        const entry = { item, before: snapshot(item), after: ready.value };
        write(item, ready);
        await new Promise(resolve => setTimeout(resolve, 65));
        if (current(item) !== ready.value) throw new Error("网页未接受填写，请手动处理。");
        batch.push(entry);
        results.push({ id, ok: true });
      } catch (err) { results.push({ id, ok: false, reason: err.message }); }
    }
    // Preserve all un-reverted batches, so opening the popup again still allows one undo.
    state.undo.push(...batch);
    return { filled: batch.length, results };
  }
  async function undo() {
    let restored = 0, skipped = 0;
    for (const entry of state.undo.slice().reverse()) {
      if (!entry.item.el.isConnected || current(entry.item) !== entry.after) { skipped++; continue; }
      try { restore(entry); restored++; } catch (_) { skipped++; }
    }
    state.undo = [];
    state.plan.clear();
    return { restored, skipped };
  }
  async function showMapper() {
    if (state.panel) { state.cleanupMapper?.(); state.panel.remove(); state.panel = null; state.selecting = false; }
    const stored = await chrome.storage.local.get("rk.profile");
    const fields = D.flatten(D.normalize(stored["rk.profile"] || D.empty()));
    if (!fields.length) throw new Error("请先填写并保存个人资料。");
    const host = document.createElement("div"); host.setAttribute("data-resumekit-panel", "");
    host.style.cssText = "position:fixed;right:20px;bottom:20px;width:350px;max-width:calc(100vw - 40px);z-index:2147483647;color-scheme:light;";
    const shadow = host.attachShadow({ mode: "closed" });
    shadow.innerHTML = `<style>
      :host{all:initial}*{box-sizing:border-box}.panel{font:14px/1.65 system-ui,'Microsoft YaHei',sans-serif;background:#fff;color:#203a36;border:1px solid #c8ded7;border-radius:18px;padding:20px;box-shadow:0 16px 70px #092f3b38}h3{margin:0;font-size:18px}.head{display:flex;justify-content:space-between;align-items:center}p{margin:10px 0;color:#657974;font-size:12px}select,textarea,button{font:inherit;width:100%;border-radius:9px;border:1px solid #d9e4df;padding:9px;background:white;color:inherit}textarea{margin-top:9px;height:110px;resize:vertical}button{cursor:pointer;margin-top:9px}button:disabled{opacity:.45;cursor:default}.primary{background:#167a62;color:white;border:0}.close{width:auto;border:0;padding:0 5px;margin:0;font-size:22px}.target{border:1px dashed #a7cbbc;background:#f3f9f6;padding:9px;border-radius:9px;overflow-wrap:anywhere}.status{min-height:36px}label{display:flex;gap:8px;margin-top:10px;font-size:12px}input{width:auto}small{color:#657974}.split{display:flex;gap:8px}
      </style><section class="panel"><div class="head"><h3>手动指定字段</h3><button class="close" aria-label="关闭">×</button></div><p>选一项资料，再点网页输入框。保存对应关系后，下次扫描会记住它。</p><select aria-label="选择简历字段"></select><textarea aria-label="资料内容" readonly></textarea><button class="pick primary">① 点击网页选择输入框</button><p class="target">尚未选择网页字段</p><label><input class="remember" type="checkbox" checked>记住当前页面的对应关系</label><label><input class="overwrite" type="checkbox">允许覆盖此字段已有内容</label><div class="split"><button class="apply" disabled>② 填入并保存</button><button class="copy">复制内容</button></div><p class="status" role="status">自定义下拉、日期组件可复制后手动操作。按 Esc 取消选取。</p><small>对应关系按网站及页面路径保存。</small></section>`;
    const q = sel => shadow.querySelector(sel), choice = q("select"), content = q("textarea"), status = q(".status");
    for (const field of fields) { const option = document.createElement("option"); option.value = field.path; option.textContent = field.fullLabel; choice.append(option); }
    choice.onchange = () => { content.value = fields.find(f => f.path === choice.value)?.value || ""; };
    choice.onchange();
    let selected = null;
    const documents = collect().roots.filter(root => root.nodeType === 9);
    const cleanup = () => { state.selecting = false; for (const doc of documents) { doc.removeEventListener("click", pick, true); doc.removeEventListener("keydown", onKey, true); } };
    state.cleanupMapper = cleanup;
    function onKey(event) { if (event.key === "Escape") { cleanup(); status.textContent = "已取消选取。"; } }
    function pick(event) {
      if (!state.selecting || event.composedPath().includes(host)) return;
      event.preventDefault(); event.stopImmediatePropagation();
      const target = event.composedPath().find(node => node instanceof event.view.Element && node.matches?.(selector));
      if (!target || !eligible({ el: target })) { status.textContent = "请选择可填写的文本框、单选框或下拉框。"; return; }
      selected = collect().controls.find(item => item.el === target || item.group?.includes(target));
      if (!selected) { status.textContent = "此控件当前不可访问。"; return; }
      selected.desc = describe(selected);
      q(".target").textContent = `已选：${selected.desc.labels[0] || target.name || target.tagName.toLowerCase()}`;
      q(".apply").disabled = false; cleanup(); status.textContent = "核对资料后，点击“填入并保存”。";
      const oldOutline = target.style.outline; target.style.outline = "3px solid #25b98b"; setTimeout(() => { target.style.outline = oldOutline; }, 1500);
    }
    q(".pick").onclick = () => { cleanup(); state.selecting = true; for (const doc of documents) { doc.addEventListener("click", pick, true); doc.addEventListener("keydown", onKey, true); } status.textContent = "请点击网页上要填写的输入框。"; };
    q(".close").onclick = () => { cleanup(); host.remove(); state.panel = null; };
    q(".copy").onclick = async () => {
      try { await navigator.clipboard.writeText(content.value); status.textContent = "已复制，可以粘贴到网页。"; }
      catch (_) { content.focus(); content.select(); status.textContent = "浏览器限制复制，请按 Ctrl+C 后粘贴。"; }
    };
    q(".apply").onclick = async () => {
      try {
        if (!selected?.el.isConnected || !visible(selected.el)) throw new Error("字段已变化，请重新选取。");
        const field = fields.find(f => f.path === choice.value), ready = prepared(selected, field);
        if (ready.error) throw new Error(ready.error);
        if (current(selected).trim() && !q(".overwrite").checked) throw new Error("此字段已有内容，如需修改请勾选允许覆盖。");
        const entry = { item: selected, before: snapshot(selected), after: ready.value };
        write(selected, ready);
        await new Promise(resolve => setTimeout(resolve, 65));
        if (current(selected) !== ready.value) throw new Error("网页未接受填写，请复制后手动填写。");
        state.undo.push(entry);
        if (q(".remember").checked) {
          const key = mapKey(), result = await chrome.storage.local.get(key), old = Array.isArray(result[key]) ? result[key] : [];
          const loc = locator(selected), locString = JSON.stringify(loc);
          await chrome.storage.local.set({ [key]: [...old.filter(m => JSON.stringify(m.locator) !== locString), { locator: loc, signature: signature(selected), path: field.path }].slice(-300) });
        }
        state.plan.clear();
        status.textContent = q(".remember").checked ? "已填入并记住。可继续选择下一项资料。" : "已填入。";
      } catch (err) { status.textContent = err.message; }
    };
    document.documentElement.append(host); state.panel = host;
    return true;
  }
  globalThis.ResumeKit = { scan, fill, undo, showMapper };
})();
