const form = document.getElementById("doc-form");
const subjectInput = document.getElementById("subject");
const recipientInput = document.getElementById("recipient");
const viaInput = document.getElementById("via");
const senderInput = document.getElementById("sender");
const dateInput = document.getElementById("date");
const detailsInput = document.getElementById("details");
const attachmentsInput = document.getElementById("attachments");
const useAttachmentPhraseInput = document.getElementById("use-attachment-phrase");
const toneSelect = document.getElementById("tone");
const docnoInput = document.getElementById("docno");
const ownerInput = document.getElementById("owner");
const contactInput = document.getElementById("contact");
const templateSelect = document.getElementById("template");
const applyTemplateBtn = document.getElementById("apply-template-btn");
const resetBtn = document.getElementById("reset-btn");
const result = document.getElementById("result");
const copyBtn = document.getElementById("copy-btn");
const downloadBtn = document.getElementById("download-btn");
const printBtn = document.getElementById("print-btn");
const statusText = document.getElementById("status");
const submitButton = form.querySelector("button[type='submit']");

const STORAGE_KEY = "official_letter_helper_form_v1";
const DEFAULTS = {
  recipient: "내부결재",
  sender: "00초등학교장",
  tone: "default",
  useAttachmentPhrase: true,
};

const TEMPLATES = [
  {
    id: "open-class",
    label: "학부모 공개수업 운영",
    subject: "2026학년도 학부모 공개수업 운영 계획",
    details:
      "- 목적: 학부모의 교육활동 참여 확대 및 교육과정 이해 제고\n- 추진 내용: 학년(군)별 공개수업 운영, 참관 안내, 안전 및 질서 유지 협조\n- 협조 요청: 학부모 출입 및 주차 안내, 담임교사 수업 공개 준비, 방역/안전 점검\n- 일정: (추후 안내 또는 붙임 참조)",
    attachments: ["운영 계획(안) 1부", "학년별 운영 시간표 1부"],
  },
  {
    id: "field-trip",
    label: "현장체험학습 운영 안내",
    subject: "현장체험학습 운영 계획(안) 보고",
    details:
      "- 목적: 교육과정 연계 체험활동 운영\n- 추진 내용: 사전 안전교육 실시, 인솔 및 비상연락체계 구축, 안전점검\n- 협조 요청: 관련 부서 협조(차량/보험/안전), 학부모 안내(추후)\n- 일정/장소: (미확정 시 '추후 안내' 또는 '붙임 참조')",
    attachments: ["운영 계획(안) 1부", "안전교육 자료 1부"],
  },
  {
    id: "infection",
    label: "감염병 예방 협조",
    subject: "감염병 예방을 위한 협조 요청",
    details:
      "- 목적: 감염병 확산 예방 및 학생 건강 보호\n- 추진 내용: 개인위생 수칙 안내, 유증상 시 등교중지 및 보호자 연락, 교실 환기\n- 협조 요청: 가정 내 증상 발생 시 즉시 담임교사에게 알림, 예방수칙 준수\n- 기타: 구체 상황은 학교 안내 및 보건당국 지침에 따름",
    attachments: ["예방수칙 안내문 1부"],
  },
  {
    id: "after-school",
    label: "방과후학교 운영",
    subject: "방과후학교 운영 계획(안) 보고",
    details:
      "- 목적: 학생 맞춤형 교육활동 제공 및 돌봄 지원\n- 추진 내용: 프로그램 편성, 강사 운영, 안전관리 및 출결 관리\n- 협조 요청: 관련 예산 집행 및 시설 사용 협조, 학생 안전 지도\n- 일정: (붙임 참조)",
    attachments: ["운영 계획(안) 1부", "프로그램 편성표 1부"],
  },
];

initTemplates();
restoreFormState();
if (!dateInput.value) {
  setDefaultDate();
}
setStatus("주제를 입력한 뒤 공문 생성을 누르면 AI가 전체 공문을 작성합니다.");
wireAutoSave();

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const payload = collectFormData();
  const subject = payload.subject;
  if (!subject) {
    setStatus("공문 주제를 먼저 입력하세요.");
    subjectInput.focus();
    return;
  }

  setLoading(true);
  setStatus("생성형 AI로 공문을 작성하고 있습니다...");

  try {
    const aiText = await generateDocumentWithAI(payload);
    result.value = aiText.trim();
    setStatus("AI 공문 생성이 완료되었습니다.");
    result.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    setStatus(error.message || "AI 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.");
  } finally {
    setLoading(false);
  }
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

downloadBtn.addEventListener("click", () => {
  if (!result.value.trim()) {
    setStatus("다운로드할 내용이 없습니다. 먼저 공문을 생성하세요.");
    return;
  }

  const payload = collectFormData();
  const filename = buildFilename(payload);
  const blob = new Blob([result.value], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  setStatus("TXT 파일을 다운로드했습니다.");
});

printBtn.addEventListener("click", () => {
  if (!result.value.trim()) {
    setStatus("인쇄할 내용이 없습니다. 먼저 공문을 생성하세요.");
    return;
  }
  window.print();
});

applyTemplateBtn.addEventListener("click", () => {
  const id = String(templateSelect.value || "");
  if (!id) {
    setStatus("적용할 템플릿을 선택하세요.");
    templateSelect.focus();
    return;
  }

  const tpl = TEMPLATES.find((t) => t.id === id);
  if (!tpl) {
    setStatus("템플릿을 찾지 못했습니다.");
    return;
  }

  subjectInput.value = tpl.subject;
  detailsInput.value = tpl.details;
  attachmentsInput.value = (tpl.attachments || []).join("\n");
  setStatus(`템플릿을 적용했습니다: ${tpl.label}`);
  persistFormState();
  subjectInput.focus();
});

resetBtn.addEventListener("click", () => {
  if (!confirm("입력값을 초기화할까요?")) {
    return;
  }

  subjectInput.value = "";
  recipientInput.value = DEFAULTS.recipient;
  viaInput.value = "";
  senderInput.value = DEFAULTS.sender;
  detailsInput.value = "";
  attachmentsInput.value = "";
  useAttachmentPhraseInput.checked = DEFAULTS.useAttachmentPhrase;
  toneSelect.value = DEFAULTS.tone;
  docnoInput.value = "";
  ownerInput.value = "";
  contactInput.value = "";
  templateSelect.value = "";
  result.value = "";
  setDefaultDate();

  clearFormState();
  setStatus("입력값을 초기화했습니다.");
  subjectInput.focus();
});

function collectFormData() {
  return {
    subject: subjectInput.value.trim(),
    recipient: recipientInput.value.trim() || DEFAULTS.recipient,
    via: viaInput.value.trim(),
    sender: senderInput.value.trim() || DEFAULTS.sender,
    date: formatDate(dateInput.value),
    details: detailsInput.value.trim(),
    attachments: attachmentsInput.value
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
    useAttachmentPhrase: Boolean(useAttachmentPhraseInput?.checked),
    tone: String(toneSelect?.value || DEFAULTS.tone),
    docno: docnoInput.value.trim(),
    owner: ownerInput.value.trim(),
    contact: contactInput.value.trim(),
  };
}

async function generateDocumentWithAI(data) {
  const response = await fetch("/api/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  const json = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (json.error && String(json.error).includes("OPENAI_API_KEY")) {
      throw new Error("AI 키가 설정되지 않았습니다. Cloudflare Pages의 Variables/Secrets에 OPENAI_API_KEY를 추가해 주세요.");
    }

    throw new Error(`AI 생성 실패: ${json.error || response.status}`);
  }

  if (!json.document) {
    throw new Error("AI 응답에서 공문 본문을 받지 못했습니다.");
  }

  return json.document;
}

function setDefaultDate() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  dateInput.value = `${yyyy}-${mm}-${dd}`;
}

function setLoading(isLoading) {
  submitButton.disabled = isLoading;
  copyBtn.disabled = isLoading;
  downloadBtn.disabled = isLoading;
  printBtn.disabled = isLoading;
  applyTemplateBtn.disabled = isLoading;
  resetBtn.disabled = isLoading;
  submitButton.textContent = isLoading ? "AI 작성 중..." : "공문 생성";
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

function initTemplates() {
  // Keep HTML clean; populate options here.
  for (const tpl of TEMPLATES) {
    const opt = document.createElement("option");
    opt.value = tpl.id;
    opt.textContent = tpl.label;
    templateSelect.appendChild(opt);
  }
}

function buildFilename(payload) {
  const base = (payload.subject || "공문").replace(/[\\/:*?\"<>|]+/g, " ").trim();
  const date = String(dateInput.value || "").trim(); // yyyy-mm-dd
  const ymd = date ? date.replaceAll("-", "") : "document";
  return `${ymd}_${base}.txt`.slice(0, 120);
}

function wireAutoSave() {
  const targets = [
    subjectInput,
    recipientInput,
    viaInput,
    senderInput,
    dateInput,
    detailsInput,
    attachmentsInput,
    useAttachmentPhraseInput,
    toneSelect,
    docnoInput,
    ownerInput,
    contactInput,
    templateSelect,
  ];

  let timer = null;
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(() => persistFormState(), 250);
  };

  for (const el of targets) {
    if (!el) continue;
    el.addEventListener("input", schedule);
    el.addEventListener("change", schedule);
  }
}

function persistFormState() {
  const state = {
    subject: subjectInput.value,
    recipient: recipientInput.value,
    via: viaInput.value,
    sender: senderInput.value,
    date: dateInput.value,
    details: detailsInput.value,
    attachments: attachmentsInput.value,
    useAttachmentPhrase: Boolean(useAttachmentPhraseInput?.checked),
    tone: toneSelect.value,
    docno: docnoInput.value,
    owner: ownerInput.value,
    contact: contactInput.value,
    template: templateSelect.value,
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage errors (private mode, quota, etc.)
  }
}

function restoreFormState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const state = JSON.parse(raw);
    if (!state || typeof state !== "object") return;

    if (typeof state.subject === "string") subjectInput.value = state.subject;
    if (typeof state.recipient === "string") recipientInput.value = state.recipient;
    if (typeof state.via === "string") viaInput.value = state.via;
    if (typeof state.sender === "string") senderInput.value = state.sender;
    if (typeof state.date === "string") dateInput.value = state.date;
    if (typeof state.details === "string") detailsInput.value = state.details;
    if (typeof state.attachments === "string") attachmentsInput.value = state.attachments;
    if (typeof state.useAttachmentPhrase === "boolean") useAttachmentPhraseInput.checked = state.useAttachmentPhrase;
    if (typeof state.tone === "string") toneSelect.value = state.tone;
    if (typeof state.docno === "string") docnoInput.value = state.docno;
    if (typeof state.owner === "string") ownerInput.value = state.owner;
    if (typeof state.contact === "string") contactInput.value = state.contact;
    if (typeof state.template === "string") templateSelect.value = state.template;
  } catch {
    // Ignore parse/storage errors.
  }
}

function clearFormState() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore.
  }
}
