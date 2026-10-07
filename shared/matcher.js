(function (root) {
  "use strict";
  const norm = value => String(value || "").toLowerCase().normalize("NFKC").replace(/[\s\p{P}\p{S}]/gu, "");
  const ignored = /password|passwd|验证码|校验码|短信码|verification\s*code|captcha|one.?time|search|搜索|筛选|credit.?card|银行卡|cvv|同意|隐私政策|接受条款|agree|consent|newsletter|subscribe/i;
  function aliasScore(text, alias) {
    const a = norm(alias), t = norm(text);
    if (!a || !t) return 0;
    if (a === t) return 96;
    const stripped = t.replace(/^(请输入|请填写|请提供|请选择|您的|你的|enter|pleaseenter|select|your)/, "").replace(/(必填|required|选填|optional)$/, "");
    if (a === stripped) return 94;
    // Short or generic English aliases must be complete tokens, never substrings of unrelated names.
    if (/^[a-z]+$/.test(a) && (a.length < 5 || ["name", "title", "score", "level", "date", "from", "to", "role", "city", "phone"].includes(a))) {
      const words = String(text).replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().split(/[^a-z]+/);
      return words.includes(a) ? 82 : 0;
    }
    if (a.length >= 2 && t.includes(a) && t.length <= a.length + 12) return 82;
    return 0;
  }
  function sectionFrom(text, sections) {
    let best = null, bestLength = 0;
    for (const section of sections) for (const alias of section.aliases) {
      if (norm(text) === section.id) return section.id;
      const a = norm(alias);
      if (a && norm(text).includes(a) && a.length > bestLength) { best = section.id; bestLength = a.length; }
    }
    return best;
  }
  function match(descriptor, fields) {
    if (["password", "hidden", "file", "submit", "button", "reset", "checkbox"].includes(descriptor.type) || ignored.test([...(descriptor.labels || []), ...(descriptor.attributes || [])].join(" "))) return null;
    const candidates = fields.filter(f => {
      // Family labels often repeat the applicant's name/phone/company. Never cross this boundary.
      if (descriptor.section === "family" && f.section !== "family" && f.section !== "custom") return false;
      if (f.section === "family" && descriptor.section !== "family") return false;
      return f.index === 0 || f.section === "custom";
    }).map(f => {
      let score = 0;
      for (const text of descriptor.labels || []) for (const alias of f.aliases) score = Math.max(score, aliasScore(text, alias));
      for (const text of descriptor.attributes || []) for (const alias of f.aliases) score = Math.max(score, aliasScore(text, alias) - 8);
      if (f.autocomplete?.includes(descriptor.autocomplete)) score = Math.max(score, 104);
      if (descriptor.section && f.section !== "custom") score += descriptor.section === f.section ? 18 : -32;
      if (descriptor.type === "email" && f.key === "email") score = Math.max(score, 103);
      if (descriptor.type === "tel" && f.key === "phone") score = Math.max(score, 90);
      return { field: f, score };
    }).sort((a, b) => b.score - a.score);
    const [first, second] = candidates;
    if (!first || first.score < 78 || (second && first.score - second.score < 12)) return null;
    return first;
  }
  const equivalences = [
    ["男", "男性", "male", "man", "m"], ["女", "女性", "female", "woman", "f"],
    ["本科", "学士", "大学本科", "学士学位", "bachelor", "bachelors", "bachelordegree", "bachelorsdegree"],
    ["硕士", "研究生", "硕士研究生", "master", "masters", "mastersdegree"],
    ["博士", "博士研究生", "phd", "doctor", "doctorate"],
    ["大专", "专科", "大学专科", "associate", "associatedegree"],
    ["全职", "fulltime"], ["兼职", "parttime"], ["实习", "internship", "intern"],
    ["中国", "中国大陆", "china", "chinese", "prc"],
    ["至今", "现在", "present", "current", "ongoing"],
    ["父亲", "父", "爸爸", "father", "dad"], ["母亲", "母", "妈妈", "mother", "mom"],
    ["配偶", "丈夫", "妻子", "spouse", "husband", "wife"], ["儿子", "子", "son"], ["女儿", "女", "daughter"]
  ].map(group => group.map(norm));
  function equivalent(a, b) {
    const x = norm(a), y = norm(b);
    return Boolean(x && y && (x === y || equivalences.some(group => group.includes(x) && group.includes(y))));
  }
  function optionFor(options, value) {
    const eligible = options.filter(o => !o.disabled && o.value !== "" && !/^(请选择|please select|select\b|choose\b|--)/i.test(o.text.trim()));
    const hits = eligible.filter(o => equivalent(o.text, value) || equivalent(o.value, value));
    return hits.length === 1 ? hits[0] : null;
  }
  function dateValue(value, type) {
    const text = String(value).trim();
    if (!text) return { value: "" };
    if (type !== "date" && type !== "month") return { value: text };
    const parsed = /^(\d{4})[-/.年](\d{1,2})(?:[-/.月](\d{1,2})日?)?月?$/.exec(text);
    if (!parsed) return { error: "日期格式不兼容，请手动选择（“至今”需在网页勾选）。" };
    const year = Number(parsed[1]), month = Number(parsed[2]), day = parsed[3] ? Number(parsed[3]) : null;
    if (month < 1 || month > 12 || (day !== null && (day < 1 || day > new Date(year, month, 0).getDate()))) return { error: "日期无效。" };
    if (type === "date" && day === null) return { error: "网页需要完整日期，资料只有年月，请手动补充日期。" };
    return { value: `${parsed[1]}-${String(month).padStart(2, "0")}${type === "date" ? `-${String(day).padStart(2, "0")}` : ""}` };
  }
  const api = { norm, ignored, aliasScore, sectionFrom, match, equivalent, optionFor, dateValue };
  root.ResumeMatcher = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(globalThis);
