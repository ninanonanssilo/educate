const form = document.getElementById("doc-form");
const subjectInput = document.getElementById("subject");
const recipientInput = document.getElementById("recipient");
const senderInput = document.getElementById("sender");
const dateInput = document.getElementById("date");
const detailsInput = document.getElementById("details");
const attachmentsInput = document.getElementById("attachments");
const result = document.getElementById("result");
const copyBtn = document.getElementById("copy-btn");
const statusText = document.getElementById("status");

setDefaultDate();
renderDocument();

form.addEventListener("submit", (event) => {
  event.preventDefault();
  renderDocument();
  setStatus("공문 초안을 생성했습니다.");
});

subjectInput.addEventListener("input", () => {
  renderDocument();
});

copyBtn.addEventListener("click", async () => {
  if (!result.value.trim()) {
    setStatus("복사할 내용이 없습니다. 먼저 공문을 생성하세요.");
    return;
  }

  try {
    await navigator.clipboard.writeText(result.value);
    setStatus("공문 초안을 클립보드에 복사했습니다.");
  } catch (error) {
    result.select();
    document.execCommand("copy");
    setStatus("복사 API 권한이 없어 선택 후 복사를 실행했습니다.");
  }
});

function setDefaultDate() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  dateInput.value = `${yyyy}-${mm}-${dd}`;
}

function renderDocument() {
  const subject = subjectInput.value.trim() || "공문 제목을 입력하세요";
  const recipient = recipientInput.value.trim() || "수신처를 입력하세요";
  const sender = senderInput.value.trim() || "발신 기관을 입력하세요";
  const date = formatDate(dateInput.value);
  const details = detailsInput.value.trim();
  const attachments = attachmentsInput.value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const bodyLine = details
    ? `1. ${subject}과 관련하여 아래와 같이 안내드립니다.\n  가. ${details}`
    : `1. ${subject}과 관련하여 세부 사항을 안내드립니다.\n  가. 추진 목적: 원활한 업무 협조\n  나. 협조 요청: 관련 부서 검토 및 회신`;

  const attachmentLine = attachments.length
    ? attachments.map((item, idx) => `붙임 ${idx + 1}. ${item}`).join("\n")
    : "붙임 1. 관련 자료 1부.";

  result.value = [
    `수신  ${recipient}`,
    "(경유)",
    `제목  ${subject}`,
    "",
    bodyLine,
    "",
    attachmentLine,
    "끝.",
    "",
    `발신  ${sender}`,
    `시행일  ${date}`,
  ].join("\n");
}

function formatDate(rawDate) {
  if (!rawDate) {
    return "";
  }

  const [year, month, day] = rawDate.split("-");
  return `${year}. ${Number(month)}. ${Number(day)}.`;
}

function setStatus(message) {
  statusText.textContent = message;
}
