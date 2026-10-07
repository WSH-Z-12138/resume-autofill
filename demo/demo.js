"use strict";
let events = 0;
for (const name of ["input", "change"]) document.addEventListener(name, () => { events++; document.getElementById("event-report").textContent = `已触发 ${events} 次 input / change 事件`; });
document.getElementById("application").addEventListener("submit", event => {
  event.preventDefault(); const fields = [...document.querySelectorAll("input:not([type=hidden]):not([type=file]):not([disabled]),textarea,select")];
  const filled = fields.filter(el => ["checkbox", "radio"].includes(el.type) ? el.checked : Boolean(el.value));
  document.getElementById("report").textContent = `当前填写 ${filled.length} 个普通字段。此测试没有发送任何网络请求。`;
});
const shadow = document.getElementById("shadow-host").attachShadow({ mode: "open" });
shadow.innerHTML = '<style>label{font:12px system-ui;color:#68825a}input{display:block;width:100%;box-sizing:border-box;margin-top:8px;border:1px solid #dbe5d5;padding:10px;border-radius:7px}</style><label>电子邮箱<input id="shadow-email" type="email"></label>';
