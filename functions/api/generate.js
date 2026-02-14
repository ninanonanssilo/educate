const OPENAI_URL = "https://api.openai.com/v1/responses";

export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const apiKey = env.OPENAI_API_KEY;
    // Cloudflare 변수에 `"gpt-5.2"`처럼 따옴표를 포함해 넣는 경우가 있어 정리한다.
    const model = sanitizeModel(env.OPENAI_MODEL) || "gpt-5.2";

    if (!apiKey) {
      return json(
        { error: "OPENAI_API_KEY is not configured." },
        500
      );
    }

    const body = await request.json();
    const subject = String(body.subject || "").trim();
    const recipient = String(body.recipient || "내부결재").trim();
    const sender = String(body.sender || "판교대장초등학교장").trim();
    const date = String(body.date || "").trim();
    const details = String(body.details || "").trim();
    const attachments = Array.isArray(body.attachments) ? body.attachments : [];
    const useAttachmentPhrase = Boolean(body.useAttachmentPhrase);

    if (!subject) {
      return json({ error: "subject is required." }, 400);
    }

    const userPrompt = buildPrompt({
      subject,
      recipient,
      sender,
      date,
      details,
      attachments,
      useAttachmentPhrase,
    });

    const response = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "system",
            content:
              "당신은 한국 초등학교 행정업무를 돕는 공문 작성 비서다. 출력은 완성된 공문 본문만 제공한다.",
          },
          {
            role: "user",
            content: userPrompt,
          },
        ],
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      return json({ error: data.error?.message || "AI request failed." }, 500);
    }

    let document = extractText(data).trim();
    if (!document) {
      return json({ error: "Empty AI response." }, 500);
    }

    document = normalizeAttachmentSection(document, attachments).trim();

    return json({ document }, 200);
  } catch (error) {
    return json({ error: "Internal error while generating document." }, 500);
  }
}

function sanitizeModel(raw) {
  if (typeof raw !== "string") {
    return "";
  }

  let value = raw.trim();
  // Strip wrapping quotes repeatedly: `"gpt-5.2"` or `'gpt-5.2'`
  while (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    value = value.slice(1, -1).trim();
  }

  return value;
}

function buildSubjectBasedDetails(subject, attachments) {
  const clean = String(subject || "").trim();
  const list = Array.isArray(attachments) ? attachments : [];
  const phrase = list.length ? "붙임과 같이 시행하고자 합니다." : "아래와 같이 시행하고자 합니다.";
  return clean ? `${clean}${pickEulReul(clean)} ${phrase}` : phrase;
}

function pickEulReul(text) {
  const value = String(text || "").trim();
  const ch = value.charAt(value.length - 1);
  const code = ch.charCodeAt(0);

  if (code >= 0xac00 && code <= 0xd7a3) {
    const jong = (code - 0xac00) % 28;
    return jong === 0 ? "를" : "을";
  }

  return /[bcdfghjklmnpqrstvwxz]$/i.test(value) ? "을" : "를";
}

function buildPrompt({ subject, recipient, sender, date, details, attachments, useAttachmentPhrase }) {
  const attachmentInput = attachments.length
    ? attachments.map((item, index) => `${index + 1}. ${item}`).join("\n")
    : "(없음)";

  const isDetailsEmpty = !String(details || "").trim();
  const subjectBasedDetails = buildSubjectBasedDetails(subject, attachments);

  const attachmentSentenceRule = useAttachmentPhrase
    ? "본문 도입 문장에서 제목(주제)과 연결해 '... 관련하여(또는 ...을(를) 위하여) 붙임과 같이 시행하고자 합니다.' 형태로 1회 포함하되, '1. 붙임과 같이 시행하고자 합니다.'처럼 단독 문장만 출력하지 말 것. 붙임이 0개면 '붙임과 같이' 대신 '아래와 같이'로 대체할 것."
    : "본문에는 관행적인 붙임 문구를 임의로 추가하지 말 것.";

  const detailsRule = isDetailsEmpty
    ? `핵심 내용이 비어 있으면, 아래 문장을 본문 1항에 반드시 포함하여 제목과 연결할 것: "${subjectBasedDetails}". 그 외 목적/추진내용/협조사항은 결재 가능한 수준으로 1~3개 항목만 추가하되, 날짜/시간/장소 등 구체 정보는 임의로 지어내지 말고 '붙임 참조' 또는 '추후 안내'로 처리할 것.`
    : "핵심 내용이 있으면 입력 내용을 우선 반영해 목적/추진내용/협조사항을 구체화할 것.";

  return [
    "아래 정보를 바탕으로 한국 학교 내부결재용 공문을 작성해줘.",
    "",
    `[입력 정보]`,
    `- 수신: ${recipient}`,
    `- 제목: ${subject}`,
    `- 시행일: ${date || "오늘 날짜 형식 유지"}`,
    `- 발신: ${sender}`,
    `- 핵심 내용: ${details || subjectBasedDetails}`,
    `- 붙임: ${attachmentInput}`,
    "",
    "[작성 규칙]",
    "1) 반드시 다음 형식만 출력:",
    "수신  ...",
    "(경유)",
    "제목  ...",
    "",
    "1. ...",
    "  가. ...",
    "  나. ...",
    "  다. ...",
    "",
    "붙임 표기 규칙:",
    "- 붙임이 0개면 '붙임' 줄을 쓰지 말 것(붙임 구역 전체 생략).",
    "- 붙임이 1개면 번호 없이 '붙임  <항목>' 1줄만 표기.",
    "- 붙임이 여러 개면 '붙임' 아래에 1., 2., 3. ...으로 줄바꿈하여 모두 표기.",
    "- 붙임 항목 문구는 입력값을 우선 사용(불필요한 임의 생성/추가 금지).",
    `- ${attachmentSentenceRule}`,
    `- ${detailsRule}`,
    "",
    "붙임(표기 예시)",
    "붙임  운영 계획(안) 1부",
    "붙임  1. 운영 계획(안) 1부",
    "      2. 학년별 운영 시간표 1부",
    "끝.",
    "",
    "발신  ...",
    "시행일  ...",
    "2) 학교 행정 문체로 자연스럽고 구체적으로 작성.",
    "3) 문장 길이는 간결하게, 내용은 실제 결재 가능한 수준으로 작성.",
    "4) 마크다운/코드블록/설명문은 절대 출력하지 말 것.",
  ].join("\n");
}

function stripAttachmentBlock(documentText) {
  const lines = String(documentText || "").split("\n");
  const out = [];
  let inAttachment = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (!inAttachment && trimmed.startsWith("붙임")) {
      inAttachment = true;
      continue;
    }

    if (inAttachment) {
      if (trimmed === "끝." || trimmed.startsWith("끝.")) {
        out.push(line);
        inAttachment = false;
      }
      continue;
    }

    out.push(line);
  }

  return out.join("\n");
}

function normalizeAttachmentSection(documentText, attachments) {
  const list = Array.isArray(attachments) ? attachments : [];
  const count = list.length;
  let text = String(documentText || "");

  if (count === 0) {
    return stripAttachmentBlock(text);
  }

  if (count === 1) {
    // If AI outputs "붙임  1. ..." or multiple attachment lines, normalize to a single line:
    // "붙임  <항목>"
    const item = String(list[0] || "").trim();
    if (!item) {
      return stripAttachmentBlock(text);
    }

    const lines = text.split("\n");
    const out = [];
    let inAttachment = false;
    let wrote = false;

    for (const line of lines) {
      const trimmed = line.trim();

      if (!inAttachment && trimmed.startsWith("붙임")) {
        inAttachment = true;
        if (!wrote) {
          out.push(`붙임  ${item}`);
          wrote = true;
        }
        continue;
      }

      if (inAttachment) {
        if (trimmed === "끝." || trimmed.startsWith("끝.")) {
          out.push(line);
          inAttachment = false;
        }
        continue;
      }

      out.push(line);
    }

    // If AI didn't include any attachment section but attachments exist, append before "끝." if present.
    if (!wrote) {
      const idx = out.findIndex((l) => String(l).trim() === "끝." || String(l).trim().startsWith("끝."));
      if (idx >= 0) {
        out.splice(idx, 0, `붙임  ${item}`);
      } else {
        out.push(`붙임  ${item}`);
      }
    }

    return out.join("\n");
  }

  // count >= 2: keep as-is; prompt steers numbering and we don't want to over-correct.
  return text;
}

function extractText(responseJson) {
  if (responseJson.output_text) {
    return responseJson.output_text;
  }

  const output = Array.isArray(responseJson.output) ? responseJson.output : [];
  const chunks = [];

  for (const item of output) {
    const content = Array.isArray(item.content) ? item.content : [];
    for (const part of content) {
      if (typeof part.text === "string") {
        chunks.push(part.text);
      }
    }
  }

  return chunks.join("\n");
}

function json(payload, status) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}
