(function (root) {
  "use strict";
  const STATUSES = { saved: "待投递", pending: "待确认", applied: "已投递", contact: "沟通中", interview: "面试中", offer: "已录用", rejected: "未通过", withdrawn: "已放弃", failed: "提交失败" };
  const LIMITS = { company: 120, role: 160, source: 80, location: 100, salary: 100, contact: 160, resumeVersion: 160, nextStep: 300, notes: 4000 };
  const clean = (value, max = 2000) => typeof value === "string" ? value.trim().slice(0, max) : "";
  function jobURL(value) {
    try {
      const url = new URL(value);
      if (!/^https?:$/.test(url.protocol)) return "";
      url.username = ""; url.password = "";
      // Preserve job identifiers, never authentication tokens or tracking parameters.
      for (const key of [...url.searchParams.keys()]) if (!/^(id|job_?id|position_?id|requisition_?id|post_?id|vacancy_?id|gh_jid)$/i.test(key)) url.searchParams.delete(key);
      url.searchParams.sort();
      if (!/^#\/?(?:jobs?|positions?|careers?|apply)\/[a-z0-9/_-]+$/i.test(url.hash)) url.hash = "";
      return url.href.slice(0, 1000);
    } catch (_) { return ""; }
  }
  function date(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
    const parsed = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : "";
  }
  function localDate(now = new Date()) { return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
  function normalize(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("投递记录格式无效。");
    const output = Object.fromEntries(Object.entries(LIMITS).map(([key, max]) => [key, clean(input[key], max)]));
    if (!output.company || !output.role) throw new Error("请填写公司名称和岗位名称。");
    return { ...output, status: Object.hasOwn(STATUSES, input.status) ? input.status : "saved", priority: ["high", "medium", "low"].includes(input.priority) ? input.priority : "medium", appliedAt: date(input.appliedAt), followUpAt: date(input.followUpAt), jobUrl: jobURL(input.jobUrl) };
  }
  function identity(input) { return [jobURL(input.jobUrl), clean(input.company).toLowerCase(), clean(input.role).toLowerCase()].join("\n"); }
  function csv(records) {
    const columns = { company: "公司", role: "岗位", status: "状态", source: "来源", location: "地点", salary: "薪资", priority: "优先级", appliedAt: "投递日期", followUpAt: "跟进日期", jobUrl: "岗位网址", contact: "联系人", resumeVersion: "简历版本", nextStep: "下一步", notes: "备注", submittedAt: "提交时间", confirmedAt: "确认时间" };
    const escape = value => {
      let text = String(value ?? "");
      if (/^[\s]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
      return `"${text.replace(/"/g, '""')}"`;
    };
    return "\ufeff" + [Object.values(columns).map(escape).join(","), ...records.map(row => Object.keys(columns).map(key => escape(key === "status" ? STATUSES[row.status] || row.status : row[key])).join(","))].join("\r\n");
  }
  const api = { STATUSES, LIMITS, clean, jobURL, localDate, normalize, identity, csv };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ResumeApplications = api;
})(globalThis);
