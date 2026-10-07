"use strict";
const scenario = document.querySelector("#scenario");
scenario.onchange = () => { document.querySelector("#old-result").hidden = scenario.value !== "stale"; document.querySelector("#second").hidden = scenario.value !== "ambiguous"; document.querySelector("#result").textContent = ""; document.querySelector("#conflict").textContent = ""; };
if (new URL(location.href).searchParams.get("submitted") === "1") { document.querySelector("#application").hidden = true; document.querySelector("#result").textContent = "申请已提交"; }
document.querySelector("#application").onsubmit = event => {
  event.preventDefault(); globalThis.demoSubmitCount = (globalThis.demoSubmitCount || 0) + 1;
  if (scenario.value === "navigate") { location.href = "submit.html?submitted=1"; return; }
  setTimeout(() => { document.querySelector("#result").textContent = scenario.value === "success" || scenario.value === "ambiguous" || scenario.value === "conflict" ? "投递成功" : scenario.value === "failure" ? "提交失败：请稍后重试" : "正在处理，请等待"; if (scenario.value === "conflict") document.querySelector("#conflict").textContent = "提交失败"; }, 80);
};
