(function () {
  "use strict";
  if (globalThis.ResumeRecorder) { void globalThis.ResumeRecorder.resume().catch(() => {}); return; }
  let active = null, baseline = new Set(), reporting = false, timer = null, observer = null, lastBegin = null;
  const success = /^(?:投递成功[！!。.]?|申请(?:已)?提交成功[！!。.]?|简历(?:已)?投递成功[！!。.]?|提交成功[！!。.]?|申请已提交[！!。.]?|感谢您的申请[！!。.]?|application (?:successfully )?submitted[!.]?|your application has been (?:received|submitted)[!.]?|thank you for applying[!.]?)$/i;
  const failure = /^(?:投递失败|申请提交失败|提交失败|application (?:submission )?failed)(?:[！!。.:：].{0,100})?$/i;
  const submitLabel = /^(?:提交申请|提交简历|确认投递|投递简历|立即投递|申请职位|立即申请|确认提交|提交|submit application|apply now|send application)$/i;
  const own = el => el.closest?.("[data-resumekit-panel],[data-rk-recorder]");
  const visible = el => { const s = getComputedStyle(el); return el.isConnected && !own(el) && !el.closest('[hidden],[inert],[aria-hidden="true"]') && s.display !== "none" && s.visibility !== "hidden" && el.getClientRects().length > 0; };
  const text = el => (el?.innerText || el?.value || el?.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ");
  async function send(action, extra = {}) {
    const response = await chrome.runtime.sendMessage({ type: "rk:tracker", action, ...extra });
    if (!response?.ok) throw new Error(response?.error || "投递记录暂时不可用。"); return response.data;
  }
  function feedback() {
    const rows = [];
    for (const el of document.querySelectorAll('[role="alert"],[role="status"],[aria-live],.success,.error,.alert,.message,.toast,p,h1,h2,h3')) {
      if (!visible(el) || el.closest('textarea,pre,code,[contenteditable="true"]')) continue;
      const value = text(el); if (!value || value.length > 180) continue;
      if (success.test(value)) rows.push({ status: "applied", value }); else if (failure.test(value)) rows.push({ status: "failed", value });
    }
    return rows;
  }
  const snapshot = () => new Set(feedback().map(row => row.value));
  function notice(value) {
    let node = document.querySelector("[data-rk-recorder]");
    if (!node) { node = document.createElement("div"); node.setAttribute("data-rk-recorder", ""); node.setAttribute("role", "status"); node.style.cssText = "position:fixed;right:20px;bottom:20px;z-index:2147483647;max-width:340px;padding:14px 18px;border:1px solid #c8dece;border-radius:12px;background:#f5fbf5;color:#245440;font:13px/1.7 system-ui,sans-serif;box-shadow:0 8px 30px #14382122;pointer-events:none"; document.documentElement.append(node); }
    node.textContent = value;
  }
  async function inspect() {
    if (!active?.submittedAt || reporting) return;
    const matches = feedback().filter(row => !baseline.has(row.value));
    // Conflicting signals are ambiguous and must stay pending.
    if (!matches.length || new Set(matches.map(row => row.status)).size !== 1) return;
    reporting = true;
    try {
      const row = await send("result", { attemptId: active.id, status: matches[0].status, evidence: matches[0].value });
      active = null; observer?.disconnect(); observer = null;
      notice(row?.status === "applied" ? "投递簿：已确认投递成功并记录。" : "投递簿：提交未成功，请检查网页。记录可在投递簿查看。");
    } catch (err) { notice(`投递簿：${err.message}`); }
    finally { reporting = false; }
  }
  function watch() {
    if (observer) return;
    observer = new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(() => { void inspect(); }, 150); });
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["hidden", "class", "style", "aria-hidden"] });
  }
  async function resume() {
    const next = await send("state");
    if (!next) { active = null; observer?.disconnect(); observer = null; return null; }
    // A new document can use its success message, but an already visible message in
    // the document where tracking was armed must never become fresh evidence.
    if (next.id !== active?.id) baseline = next.submittedAt ? new Set() : snapshot();
    active = next; watch(); await inspect(); return active;
  }
  async function begin() {
    if (!active) throw new Error("请先在插件里开启本页的投递记录。");
    if (active.submittedAt) return active;
    if (lastBegin) return lastBegin;
    baseline = snapshot();
    lastBegin = send("attempt", { attemptId: active.id }).then(value => { active = value; notice("投递簿：已保存待确认记录，正在等待网站提交结果。未看到成功提示时请到投递簿核对。"); void inspect(); return value; }).finally(() => { lastBegin = null; });
    return lastBegin;
  }
  function candidates() {
    return [...document.querySelectorAll('button,input[type="submit"],input[type="button"],[role="button"]')].filter(el => visible(el) && !el.disabled && el.getAttribute("aria-disabled") !== "true" && submitLabel.test(text(el)));
  }
  async function submit() {
    if (!active) await resume();
    if (!active) throw new Error("投递记录尚未开启。");
    if (location.href !== active.pageURL) throw new Error("网页已经切换，请重新识别岗位。");
    if (active.submittedAt) throw new Error("已经尝试提交，请先核对结果，避免重复投递。");
    const buttons = candidates();
    if (buttons.length !== 1) throw new Error(buttons.length ? "页面有多个提交按钮，请在网页手动点击正确的按钮，插件会继续记录。" : "未识别到明确的最终提交按钮。请在网页提交，插件会继续记录。");
    const button = buttons[0], form = button.form || button.closest("form");
    if (form && !form.checkValidity()) { form.reportValidity(); throw new Error("网页仍有必填项或格式错误，请检查后再提交。"); }
    await begin(); button.click(); return { pending: true };
  }
  document.addEventListener("click", event => {
    if (!active || active.submittedAt) return;
    const button = event.composedPath().find(el => el?.matches?.('button,input[type="submit"],input[type="button"],[role="button"]'));
    if (!button || !visible(button) || button.disabled || !submitLabel.test(text(button))) return;
    const form = button.form || button.closest("form"); if (form && !form.checkValidity()) return;
    void begin().catch(err => notice(`投递簿：${err.message}`));
  }, true);
  document.addEventListener("submit", event => {
    if (!active || active.submittedAt || !event.submitter || !submitLabel.test(text(event.submitter))) return;
    void begin().catch(err => notice(`投递簿：${err.message}`));
  }, true);
  function metadata() {
    let job = {};
    for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
      if (script.textContent.length > 150000) continue;
      try {
        const visit = (value, depth = 0) => {
          if (!value || typeof value !== "object" || depth > 8) return;
          if (Array.isArray(value)) { value.forEach(v => visit(v, depth + 1)); return; }
          if ([value["@type"]].flat().includes("JobPosting")) job = value;
          else if (value["@graph"]) visit(value["@graph"], depth + 1);
        }; visit(JSON.parse(script.textContent));
      } catch (_) { /* Metadata is a hint; the popup always allows correction. */ }
    }
    const get = selectors => { for (const selector of selectors) { const el = document.querySelector(selector); if (el && visible(el)) return text(el).slice(0, 160); } return ""; };
    const company = typeof job.hiringOrganization?.name === "string" ? job.hiringOrganization.name : get(['[itemprop="hiringOrganization"] [itemprop="name"]', '[data-company-name]', '.company-name', '.company-title']);
    const role = typeof job.title === "string" ? job.title : get(['[itemprop="title"]', '.job-title', '.position-title', 'h1']);
    const locations = [job.jobLocation].flat().filter(Boolean);
    const address = locations[0]?.address;
    const locationText = typeof address === "string" ? address : [address?.addressLocality, address?.addressRegion].filter(v => typeof v === "string").join(" / ");
    const source = /zhipin\.com$/.test(location.hostname) ? "Boss直聘" : /liepin\.com$/.test(location.hostname) ? "猎聘" : /zhaopin\.com$/.test(location.hostname) ? "智联招聘" : /51job\.com$/.test(location.hostname) ? "前程无忧" : /linkedin\.com$/.test(location.hostname) ? "LinkedIn" : location.hostname;
    return { company: company.slice(0, 120), role: role.slice(0, 160), location: locationText || "", source, jobUrl: location.href, submitButtons: candidates().length };
  }
  globalThis.ResumeRecorder = { metadata, resume, submit, begin };
  void resume().catch(() => {});
})();
