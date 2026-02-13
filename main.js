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
  setStatus("주제에 맞는 공문 초안을 생성했습니다.");
});

subjectInput.addEventListener("input", () => {
  renderDocument();
});
detailsInput.addEventListener("input", () => {
  renderDocument();
});
attachmentsInput.addEventListener("input", () => {
  renderDocument();
});
senderInput.addEventListener("input", () => {
  renderDocument();
});
dateInput.addEventListener("change", () => {
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
  const recipient = recipientInput.value.trim() || "내부결재";
  const sender = senderInput.value.trim() || "판교대장초등학교장";
  const date = formatDate(dateInput.value);
  const details = detailsInput.value.trim();
  const userAttachments = attachmentsInput.value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const docType = detectDocType(`${subject} ${details}`);
  const generatedBody = buildBodyByType(docType, subject, details);
  const generatedAttachments = buildAttachmentsByType(docType, subject);
  const attachmentList = userAttachments.length ? userAttachments : generatedAttachments;
  const attachmentLine = attachmentList
    .map((item, idx) => `붙임 ${idx + 1}. ${item}`)
    .join("\n");

  result.value = [
    `수신  ${recipient}`,
    "(경유)",
    `제목  ${subject}`,
    "",
    generatedBody,
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

function detectDocType(text) {
  const normalized = text.toLowerCase();

  const rules = [
    { type: "safety", words: ["안전", "점검", "재난", "훈련", "소방", "대피", "위기"] },
    { type: "event", words: ["행사", "축제", "공연", "체험", "운동회", "발표회", "캠프"] },
    { type: "training", words: ["연수", "교육", "워크숍", "연구", "수업나눔", "전문성"] },
    { type: "budget", words: ["예산", "구매", "계약", "집행", "물품", "지출"] },
    { type: "newsletter", words: ["가정통신문", "학부모", "안내", "알림", "홍보"] },
    { type: "meeting", words: ["회의", "협의", "위원회", "심의", "협의회"] },
  ];

  for (const rule of rules) {
    if (rule.words.some((word) => normalized.includes(word))) {
      return rule.type;
    }
  }

  return "general";
}

function buildBodyByType(type, subject, details) {
  const detailLine = details
    ? `  나. 주요 내용: ${details}`
    : "  나. 주요 내용: 세부 운영 계획에 따라 대상자 안내 및 단계별 추진";

  const bodies = {
    safety: [
      `1. ${subject} 관련입니다.`,
      "  가. 목적: 학교 안전사고 예방 및 대응 체계 강화",
      detailLine,
      "  다. 협조 사항: 각 부서별 점검 결과를 취합하여 기한 내 보고",
    ].join("\n"),
    event: [
      `1. ${subject} 추진을 위해 다음과 같이 운영하고자 합니다.`,
      "  가. 목적: 학생 참여 중심 교육활동 활성화 및 교육공동체 소통 강화",
      detailLine,
      "  다. 협조 사항: 학년별 역할 분담 및 사전 준비사항 점검",
    ].join("\n"),
    training: [
      `1. ${subject} 운영 계획을 다음과 같이 안내드립니다.`,
      "  가. 목적: 교원의 수업 전문성 및 교육과정 운영 역량 강화",
      detailLine,
      "  다. 협조 사항: 연수 대상자 참석 관리 및 결과 보고서 제출",
    ].join("\n"),
    budget: [
      `1. ${subject} 관련 예산 집행(안)을 다음과 같이 상신합니다.`,
      "  가. 목적: 교육활동 지원을 위한 적정 예산 편성 및 집행",
      detailLine,
      "  다. 협조 사항: 집행 기준 준수 및 증빙 자료 철저 관리",
    ].join("\n"),
    newsletter: [
      `1. ${subject} 관련 가정 안내를 다음과 같이 시행하고자 합니다.`,
      "  가. 목적: 학부모 대상 정확한 정보 제공 및 학교-가정 연계 강화",
      detailLine,
      "  다. 협조 사항: 가정통신문 배부 후 회신 현황 점검",
    ].join("\n"),
    meeting: [
      `1. ${subject} 관련 협의 내용을 다음과 같이 보고드립니다.`,
      "  가. 목적: 학교 주요 현안에 대한 의견 수렴 및 실행안 확정",
      detailLine,
      "  다. 협조 사항: 회의 결과에 따른 후속 조치 일정 관리",
    ].join("\n"),
    general: [
      `1. ${subject} 관련입니다.`,
      "  가. 목적: 학교 업무의 체계적 추진 및 행정 효율성 제고",
      detailLine,
      "  다. 협조 사항: 관련 부서 검토 후 기한 내 회신",
    ].join("\n"),
  };

  return bodies[type];
}

function buildAttachmentsByType(type, subject) {
  const common = ["관련 자료 1부."];
  const byType = {
    safety: ["안전점검 계획서 1부.", "시설 점검 체크리스트 1부."],
    event: ["행사 운영 계획(안) 1부.", "학년별 역할 분담표 1부."],
    training: ["연수 운영 계획서 1부.", "연수 참여 명단 1부."],
    budget: ["예산 집행 계획서 1부.", "산출 내역서 1부."],
    newsletter: ["가정통신문(안) 1부.", "회신서 양식 1부."],
    meeting: ["회의 자료 1부.", "회의 결과 요약본 1부."],
    general: [`${subject} 추진 계획(안) 1부.`],
  };

  return byType[type] || common;
}
