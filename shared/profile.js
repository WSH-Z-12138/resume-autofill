(function (root) {
  "use strict";
  const field = (key, label, aliases = [], type = "text", extra = {}) => ({ key, label, aliases: [label, ...aliases], type, ...extra });
  const sections = [
    { id: "personal", title: "基本信息", mark: "01", repeated: false, aliases: ["基本信息", "个人信息", "联系方式", "personal", "contact"], fields: [
      field("name", "姓名", ["真实姓名", "中文姓名", "full name", "fullname", "realname", "name"], "text", { autocomplete: ["name"] }),
      field("englishName", "英文姓名", ["英文名", "english name"]),
      field("surname", "姓", ["姓氏", "last name", "family name", "surname"], "text", { autocomplete: ["family-name"] }),
      field("givenName", "名", ["名字", "first name", "given name"], "text", { autocomplete: ["given-name"] }),
      field("gender", "性别", ["gender", "sex"], "select", { options: ["男", "女", "其他", "不愿透露"] }),
      field("birthDate", "出生日期", ["生日", "出生年月", "date of birth", "birthdate", "birthday", "dob"], "date", { autocomplete: ["bday"] }),
      field("phone", "手机号码", ["手机号", "联系电话", "手机", "电话", "mobile", "phone", "telephone", "tel"], "tel", { autocomplete: ["tel", "tel-national"] }),
      field("email", "电子邮箱", ["电子邮件", "邮箱", "email", "e-mail"], "email", { autocomplete: ["email"] }),
      field("city", "现居城市", ["现居住地", "目前所在地", "当前城市", "居住城市", "current city", "current location"]),
      field("address", "详细地址", ["通讯地址", "联系地址", "居住地址", "street address", "address"], "text", { autocomplete: ["street-address", "address-line1"] }),
      field("postalCode", "邮政编码", ["邮编", "postal code", "zip code"], "text", { autocomplete: ["postal-code"] }),
      field("hometown", "籍贯", ["hometown", "native place"]),
      field("hukou", "户籍所在地", ["户口所在地", "户籍", "户口"]),
      field("nationality", "国籍", ["nationality", "citizenship"], "text", { autocomplete: ["country-name"] }),
      field("ethnicity", "民族", ["ethnicity"]),
      field("politicalStatus", "政治面貌", ["政治身份", "political status"]),
      field("maritalStatus", "婚姻状况", ["婚姻状态", "marital status"]),
      field("highestDegree", "最高学历", ["最高学位", "highest education", "highest degree"], "select", { options: ["高中", "中专", "大专", "本科", "硕士", "博士", "其他"] }),
      field("idNumber", "身份证号码", ["身份证号", "证件号码", "证件号", "identity number", "id card"], "text", { sensitive: true }),
      field("wechat", "微信号", ["微信", "wechat", "weixin"]),
      field("github", "GitHub", ["github url", "github地址"], "url"),
      field("linkedin", "LinkedIn", ["领英", "linkedin url"], "url"),
      field("website", "个人主页", ["个人网站", "作品集链接", "portfolio", "personal website", "homepage"], "url")
    ] },
    { id: "career", title: "求职意向", mark: "02", repeated: false, aliases: ["求职意向", "应聘意向", "工作意向", "career", "job preference"], fields: [
      field("position", "期望职位", ["意向岗位", "意向职位", "求职岗位", "应聘职位", "应聘岗位", "desired position", "job title applied for"]),
      field("city", "期望城市", ["意向城市", "工作地点", "期望工作地点", "desired location", "preferred city"]),
      field("industry", "期望行业", ["意向行业", "desired industry"]),
      field("salary", "期望薪资", ["期望月薪", "期望年薪", "薪资要求", "expected salary", "salary expectation"]),
      field("availability", "到岗时间", ["入职时间", "可到岗时间", "available from", "availability", "notice period"]),
      field("employmentType", "工作性质", ["求职类型", "employment type", "job type"], "select", { options: ["全职", "实习", "兼职", "合同工"] }),
      field("experience", "工作年限", ["工作经验年限", "years of experience", "work years"]),
      field("status", "求职状态", ["目前状态", "job seeking status"])
    ] },
    { id: "education", title: "教育经历", mark: "03", repeated: true, aliases: ["教育", "学历", "education", "academic"], fields: [
      field("school", "学校名称", ["毕业院校", "毕业学校", "就读学校", "学校", "院校", "school", "university", "institution"]),
      field("major", "专业", ["所学专业", "专业名称", "major", "field of study"]),
      field("degree", "学历 / 学位", ["学历", "学位", "degree", "education level", "qualification"], "select", { options: ["高中", "中专", "大专", "本科", "硕士", "博士", "其他"] }),
      field("startDate", "入学时间", ["入学日期", "开始时间", "开始日期", "start date", "from"], "month"),
      field("endDate", "毕业时间", ["毕业日期", "结束时间", "结束日期", "end date", "graduation date", "to"], "month"),
      field("gpa", "GPA", ["绩点", "平均绩点", "grade point average"]),
      field("ranking", "专业排名", ["成绩排名", "ranking", "class rank"]),
      field("courses", "主修课程", ["相关课程", "课程", "courses", "coursework"], "textarea"),
      field("honors", "在校荣誉", ["奖学金", "honors", "scholarships"], "textarea"),
      field("description", "教育经历描述", ["在校经历", "校园经历", "教育描述", "经历描述", "描述", "description"], "textarea")
    ] },
    { id: "work", title: "工作 / 实习", mark: "04", repeated: true, aliases: ["工作经历", "实习经历", "工作经验", "实习经验", "任职经历", "employment", "work experience", "internship"], fields: [
      field("company", "公司名称", ["实习单位", "工作单位", "单位名称", "公司", "company", "employer", "organization"]),
      field("department", "部门", ["所属部门", "department"]),
      field("position", "职位名称", ["岗位名称", "担任职位", "职位", "岗位", "position", "job title", "title"]),
      field("startDate", "入职时间", ["入职日期", "开始时间", "开始日期", "start date", "from"], "month"),
      field("endDate", "离职时间", ["离职日期", "结束时间", "结束日期", "end date", "to"], "month", { current: true }),
      field("city", "工作城市", ["工作地点", "工作地区", "city", "location"]),
      field("description", "工作内容", ["工作描述", "实习内容", "工作职责", "岗位职责", "职责描述", "经历描述", "描述", "description", "responsibilities", "duties"], "textarea"),
      field("achievements", "工作业绩", ["工作成果", "主要业绩", "工作成就", "achievements", "accomplishments"], "textarea"),
      field("reasonForLeaving", "离职原因", ["reason for leaving"], "textarea")
    ] },
    { id: "projects", title: "项目经历", mark: "05", repeated: true, aliases: ["项目经历", "项目经验", "项目", "projects", "project experience"], fields: [
      field("name", "项目名称", ["项目名", "project name", "project title", "name"]),
      field("role", "项目角色", ["担任角色", "项目职位", "角色", "project role", "role"]),
      field("startDate", "开始时间", ["项目开始时间", "开始日期", "start date", "from"], "month"),
      field("endDate", "结束时间", ["项目结束时间", "结束日期", "end date", "to"], "month", { current: true }),
      field("url", "项目链接", ["项目地址", "project url", "project link"], "url"),
      field("description", "项目描述", ["项目简介", "项目介绍", "描述", "description"], "textarea"),
      field("responsibilities", "项目职责", ["负责内容", "个人职责", "我的职责", "responsibilities", "duties"], "textarea"),
      field("achievements", "项目成果", ["项目业绩", "项目成就", "achievements", "results"], "textarea"),
      field("technologies", "技术栈", ["使用技术", "技术工具", "tech stack", "technologies"], "textarea")
    ] },
    { id: "languages", title: "语言能力", mark: "06", repeated: true, aliases: ["语言", "外语", "language"], fields: [
      field("language", "语言", ["语种", "language"]),
      field("proficiency", "熟练程度", ["掌握程度", "语言水平", "proficiency", "level"]),
      field("certificate", "语言证书", ["考试名称", "certificate", "test name"]),
      field("score", "考试成绩", ["语言成绩", "分数", "成绩", "score"])
    ] },
    { id: "certificates", title: "证书 / 奖项", mark: "07", repeated: true, aliases: ["证书", "获奖", "奖项", "certificate", "certification", "awards"], fields: [
      field("name", "证书 / 奖项名称", ["证书名称", "奖项名称", "获奖名称", "certificate name", "award name", "name"]),
      field("issuer", "颁发机构", ["发证机构", "颁奖单位", "issuer", "issuing organization"]),
      field("date", "获得时间", ["获奖时间", "颁发日期", "issue date", "date awarded"], "month"),
      field("number", "证书编号", ["证书号码", "credential id"]),
      field("description", "证书 / 奖项描述", ["获奖描述", "证书描述", "描述", "description"], "textarea")
    ] },
    { id: "overview", title: "技能 / 自我介绍", mark: "08", repeated: false, aliases: ["个人简介", "自我", "skills", "summary", "about"], fields: [
      field("summary", "个人简介", ["个人介绍", "自我介绍", "简介", "professional summary", "summary", "about me"], "textarea"),
      field("skills", "专业技能", ["技能特长", "个人技能", "技能", "skills", "technical skills"], "textarea"),
      field("selfEvaluation", "自我评价", ["个人评价", "self evaluation", "self assessment"], "textarea"),
      field("coverLetter", "求职信", ["求职说明", "申请说明", "cover letter", "motivation letter"], "textarea"),
      field("other", "补充说明", ["其他信息", "additional information"], "textarea")
    ] },
    { id: "family", title: "家庭成员", mark: "09", repeated: true, aliases: ["家庭成员", "家庭情况", "家庭信息", "家属信息", "主要社会关系", "社会关系", "family members", "family information", "family details", "family-section", "family-info", "household"], fields: [
      field("relationship", "与本人关系", ["关系", "称谓", "亲属关系", "家庭关系", "relationship", "relation", "kinship"], "select", { options: ["父亲", "母亲", "配偶", "儿子", "女儿", "哥哥", "姐姐", "弟弟", "妹妹", "祖父", "祖母", "外祖父", "外祖母", "其他"] }),
      field("name", "姓名", ["家属姓名", "家庭成员姓名", "亲属姓名", "full name", "name"], "text", { autocomplete: ["name"] }),
      field("gender", "性别", ["gender", "sex"], "select", { options: ["男", "女", "其他", "不愿透露"] }),
      field("birthDate", "出生日期", ["出生年月", "生日", "date of birth", "birthday", "birthdate"], "date", { autocomplete: ["bday"] }),
      field("age", "年龄", ["周岁", "age"]),
      field("politicalStatus", "政治面貌", ["政治身份", "political status"]),
      field("degree", "学历", ["文化程度", "教育程度", "学位", "education level", "degree"], "select", { options: ["小学", "初中", "高中", "中专", "大专", "本科", "硕士", "博士", "其他"] }),
      field("occupation", "职业 / 就业情况", ["职业", "就业情况", "从业情况", "occupation", "employment status"]),
      field("company", "工作单位", ["单位名称", "公司名称", "所在单位", "单位", "公司", "employer", "company", "organization"]),
      field("position", "职务", ["职位", "岗位", "职位名称", "job title", "position", "title"]),
      field("companyAndPosition", "工作单位及职务", ["单位及职务", "工作单位和职务", "employer and position"], "text", { hint: "可留空；填表时会组合上面的工作单位和职务。也可以自行填写完整表述。" }),
      field("phone", "联系电话", ["手机号码", "手机号", "手机", "电话", "contact number", "phone", "mobile", "tel"], "tel", { autocomplete: ["tel", "tel-national"] }),
      field("email", "电子邮箱", ["邮箱", "email", "e-mail"], "email", { autocomplete: ["email"] }),
      field("address", "联系地址", ["居住地址", "现居住地", "家庭住址", "住址", "地址", "address"], "text", { autocomplete: ["street-address", "address-line1"] }),
      field("notes", "备注", ["其他说明", "补充说明", "notes", "remarks"], "textarea")
    ] },
    { id: "custom", title: "自定义字段", mark: "10", repeated: true, aliases: [], fields: [
      field("label", "字段名称", [], "text"),
      field("aliases", "网页别名", [], "text", { hint: "多个名称用逗号分隔，例如：可实习天数,每周出勤天数" }),
      field("value", "填写内容", [], "textarea")
    ] }
  ];
  const cleanText = value => typeof value === "string" ? value.slice(0, 20000) : typeof value === "number" ? String(value) : "";
  function blankRecord(section) { return Object.fromEntries(section.fields.map(f => [f.key, ""])); }
  function empty() { return { version: 1, ...Object.fromEntries(sections.map(s => [s.id, s.repeated ? [] : blankRecord(s)])) }; }
  function normalize(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("资料必须是 JSON 对象。");
    if (input.version !== undefined && input.version !== 1) throw new Error("不支持此资料版本，请使用版本 1 的资料文件。");
    const result = empty();
    for (const section of sections) {
      const source = input[section.id];
      const record = value => Object.fromEntries(section.fields.map(f => [f.key, cleanText(value?.[f.key])]));
      result[section.id] = section.repeated ? (Array.isArray(source) ? source.slice(0, 50).map(record) : []) : record(source);
    }
    return result;
  }
  function flatten(profile, includeEmpty = false) {
    const out = [];
    for (const section of sections) {
      const records = section.repeated ? profile[section.id] || [] : [profile[section.id] || {}];
      records.forEach((record, index) => {
        if (section.id === "custom") {
          if (record.label && (record.value || includeEmpty)) out.push({ path: `custom.${index}.value`, section: "custom", index, key: "value", label: record.label, fullLabel: `自定义 · ${record.label}`, aliases: [record.label, ...record.aliases.split(/[,，;；\n]/).map(s => s.trim()).filter(Boolean)], value: record.value, type: "textarea" });
          return;
        }
        section.fields.forEach(f => {
          const value = section.id === "family" && f.key === "companyAndPosition" ? record[f.key] || [record.company, record.position].filter(Boolean).join(" / ") : record[f.key] || "";
          if (!value && !includeEmpty) return;
          const member = section.id === "family" ? [record.relationship, record.name].filter(Boolean).join(" · ") : "";
          out.push({ ...f, path: `${section.id}.${section.repeated ? `${index}.` : ""}${f.key}`, section: section.id, index, value, fullLabel: `${section.title}${section.repeated ? ` ${index + 1}` : ""}${member ? `（${member}）` : ""} · ${f.label}` });
        });
      });
    }
    return out;
  }
  function get(profile, path) { return flatten(profile, true).find(f => f.path === path); }
  function example() {
    return normalize({ version: 1,
      personal: { name: "张小禾", englishName: "Alex Zhang", gender: "女", birthDate: "2000-06-18", phone: "13800000000", email: "alex@example.com", city: "上海", nationality: "中国", website: "https://example.com", address: "上海市某区示例路 100 号" },
      career: { position: "前端开发工程师", city: "上海", salary: "面议", availability: "两周内", employmentType: "全职", experience: "2 年" },
      education: [{ school: "示例大学", major: "计算机科学与技术", degree: "本科", startDate: "2018-09", endDate: "2022-06", gpa: "3.7 / 4.0", courses: "数据结构、数据库、软件工程", description: "参与校园开源项目。" }, { school: "示例理工大学", major: "软件工程", degree: "硕士", startDate: "2022-09", endDate: "2024-06", description: "研究 Web 应用性能优化。" }],
      work: [{ company: "示例科技有限公司", department: "产品研发部", position: "前端开发工程师", startDate: "2024-07", endDate: "至今", city: "上海", description: "负责业务页面开发与组件维护。\n与设计、后端协作交付产品功能。", achievements: "优化首屏加载，减少重复开发。" }],
      projects: [{ name: "团队知识库", role: "前端负责人", startDate: "2025-03", endDate: "2025-08", description: "面向团队的文档检索与知识分享工具。", responsibilities: "负责页面架构、编辑器集成和性能优化。", technologies: "TypeScript、React、Node.js" }],
      languages: [{ language: "英语", proficiency: "熟练", certificate: "CET-6", score: "580" }],
      certificates: [{ name: "软件设计师", issuer: "示例颁发机构", date: "2023-11" }],
      overview: { summary: "拥有 Web 开发经验，关注用户体验与代码质量。", skills: "JavaScript / TypeScript / React / CSS", selfEvaluation: "沟通清晰，能独立推进任务并持续学习。" },
      family: [{ relationship: "父亲", name: "张示例", gender: "男", birthDate: "1972-05-16", age: "54", politicalStatus: "群众", degree: "本科", occupation: "在职", company: "示例制造有限公司", position: "工程师", phone: "13900000001", address: "上海市示例地址", notes: "虚构示例，请替换为实际资料。" }, { relationship: "母亲", name: "李示例", gender: "女", birthDate: "1974-09-08", age: "52", politicalStatus: "群众", degree: "大专", occupation: "在职", company: "示例服务有限公司", position: "行政专员", phone: "13900000002", address: "上海市示例地址" }],
      custom: [{ label: "每周可实习天数", aliases: "每周出勤天数,可实习天数", value: "4 天" }]
    });
  }
  const api = { sections, empty, normalize, flatten, get, example, blankRecord };
  root.ResumeData = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(globalThis);
