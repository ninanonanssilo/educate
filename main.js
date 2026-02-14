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
const submitButton = form.querySelector("button[type='submit']");

setDefaultDate();
setStatus("주제를 입력한 뒤 공문 생성을 누르면 AI가 전체 공문을 작성합니다.");

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

function collectFormData() {
  return {
    subject: subjectInput.value.trim(),
    recipient: recipientInput.value.trim() || "내부결재",
    sender: senderInput.value.trim() || "판교대장초등학교장",
    date: formatDate(dateInput.value),
    details: detailsInput.value.trim(),
    attachments: attachmentsInput.value
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
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
