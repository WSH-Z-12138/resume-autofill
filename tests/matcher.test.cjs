"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const D = require("../shared/profile.js"), M = require("../shared/matcher.js");
const fields = D.flatten(D.example(), true);
const find = (label, section, type = "text", attributes = []) => M.match({ labels: [label], attributes, section, type }, fields)?.field.path;
test("Chinese and English labels, placeholders and autocomplete identify the same profile fields", () => {
  assert.equal(find("请输入您的手机号码", "personal", "tel"), "personal.phone");
  assert.equal(find("Email", "personal", "email"), "personal.email");
  assert.equal(find("Full name", "personal"), "personal.name");
  assert.equal(M.match({ labels: [], attributes: [], type: "text", autocomplete: "family-name" }, fields).field.path, "personal.surname");
});
test("Section context distinguishes repeated generic descriptions and dates", () => {
  assert.equal(find("开始时间", "education"), "education.0.startDate");
  assert.equal(find("开始时间", "projects"), "projects.0.startDate");
  assert.equal(find("description", "work"), "work.0.description");
  assert.equal(find("description", undefined), undefined);
  assert.equal(find("name", undefined), undefined);
  assert.equal(find("name", "projects"), "projects.0.name");
});
test("Blocked form fields never match profile data", () => {
  assert.equal(find("登录密码", "personal", "password"), undefined);
  assert.equal(find("手机验证码", "personal", "tel"), undefined);
  assert.equal(find("手机号码", "personal", "hidden"), undefined);
  assert.equal(find("我同意", "personal", "checkbox"), undefined);
  assert.equal(find("Search email", "personal", "email"), undefined);
});
test("Missing values do not cause unrelated fallback matches", () => {
  const profile = D.empty(); profile.personal.name = "示例";
  assert.equal(M.match({ labels: ["项目名称"], attributes: [], type: "text", section: "projects" }, D.flatten(profile, true))?.field.path, undefined);
  assert.equal(find("内部备注 A", undefined), undefined);
});
test("Custom aliases can match site-specific questions", () => {
  assert.equal(find("每周出勤天数", undefined), "custom.0.value");
});
test("Family information is scoped separately from applicant fields", () => {
  assert.equal(find("姓名", "family"), "family.0.name");
  assert.equal(find("姓名", "personal"), "personal.name");
  assert.equal(find("联系电话", "family", "tel"), "family.0.phone");
  assert.equal(find("联系电话", undefined, "tel"), "personal.phone");
  assert.equal(find("工作单位", "family"), "family.0.company");
  assert.equal(find("工作单位", "work"), "work.0.company");
  assert.equal(find("工作单位及职务", "family"), "family.0.companyAndPosition");
  assert.equal(M.match({ labels: ["姓名"], attributes: [], type: "text", autocomplete: "name", section: "family" }, fields).field.path, "family.0.name");
  const noFamily = D.example(); noFamily.family = [];
  assert.equal(M.match({ labels: ["联系电话"], attributes: [], type: "tel", section: "family" }, D.flatten(noFamily, true)), null);
  assert.equal(M.sectionFrom("家庭情况", D.sections), "family");
  assert.equal(M.sectionFrom("family", D.sections), "family");
});
test("Family records survive JSON export and old profiles load with an empty family list", () => {
  const source = D.example(), restored = D.normalize(JSON.parse(JSON.stringify(source)));
  assert.deepEqual(restored.family, source.family);
  const old = D.normalize({ version: 1, personal: { name: "旧资料" } });
  assert.deepEqual(old.family, []); assert.equal(old.personal.name, "旧资料");
  assert.equal(D.get(restored, "family.0.companyAndPosition").value, "示例制造有限公司 / 工程师");
  restored.family[0].companyAndPosition = "已退休";
  assert.equal(D.get(restored, "family.0.companyAndPosition").value, "已退休");
});
test("Family relationship selects accept standard abbreviations", () => {
  const options = [{ text: "请选择", value: "" }, { text: "父", value: "father" }, { text: "母", value: "mother" }];
  assert.equal(M.optionFor(options, "父亲")?.value, "father");
  assert.equal(M.optionFor(options, "母亲")?.value, "mother");
});
test("Date conversion preserves precision and refuses to invent a day", () => {
  assert.deepEqual(M.dateValue("2022年9月", "month"), { value: "2022-09" });
  assert.deepEqual(M.dateValue("2000/6/18", "date"), { value: "2000-06-18" });
  assert.ok(M.dateValue("2022-09", "date").error);
  assert.ok(M.dateValue("至今", "month").error);
  assert.ok(M.dateValue("2023-02-29", "date").error);
  assert.ok(M.dateValue("2024-13", "month").error);
});
test("Native select matching refuses ambiguous or unavailable options", () => {
  const options = [{ text: "请选择", value: "" }, { text: "Bachelor's degree", value: "b" }, { text: "硕士", value: "m" }];
  assert.equal(M.optionFor(options, "本科")?.value, "b");
  assert.equal(M.optionFor(options, "博士"), null);
  assert.equal(M.optionFor([...options, { text: "学士", value: "b2" }], "本科"), null);
  assert.equal(M.optionFor([{ text: "男", value: "1" }, { text: "女", value: "2" }], "女")?.value, "2");
});
test("Imported data is whitelisted and bounded", () => {
  const profile = D.normalize(JSON.parse('{"personal":{"name":"示例","evil":"x"},"__proto__":{"polluted":true},"work":[{"company":123}]}'));
  assert.equal(profile.personal.name, "示例"); assert.equal(profile.personal.evil, undefined);
  assert.equal({}.polluted, undefined); assert.equal(profile.work[0].company, "123");
  assert.throws(() => D.normalize([])); assert.throws(() => D.normalize({ version: 2 }));
});
