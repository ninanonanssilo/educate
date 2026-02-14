const OPENAI_URL = "https://api.openai.com/v1/responses";

export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const apiKey = env.OPENAI_API_KEY;
    const model = env.OPENAI_MODEL || "gpt-4o-mini";

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

    const document = extractText(data).trim();
    if (!document) {
      return json({ error: "Empty AI response." }, 500);
    }

    return json({ document }, 200);
  } catch (error) {
    return json({ error: "Internal error while generating document." }, 500);
  }
}

function buildPrompt({ subject, recipient, sender, date, details, attachments }) {
  const attachmentHint = attachments.length
    ? attachments.map((item, index) => `${index + 1}. ${item}`).join("\n")
    : "자동으로 상황에 맞는 붙임 항목 1~2개를 생성";

  return [
    "아래 정보를 바탕으로 한국 학교 내부결재용 공문을 작성해줘.",
    "",
    `[입력 정보]`,
    `- 수신: ${recipient}`,
    `- 제목: ${subject}`,
    `- 시행일: ${date || "오늘 날짜 형식 유지"}`,
    `- 발신: ${sender}`,
    `- 핵심 내용: ${details || "주제에 맞게 목적/추진내용/협조사항을 구체적으로 작성"}`,
    `- 붙임: ${attachmentHint}`,
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
    "붙임 1. ...",
    "붙임 2. ... (필요 시)",
    "끝.",
    "",
    "발신  ...",
    "시행일  ...",
    "2) 학교 행정 문체로 자연스럽고 구체적으로 작성.",
    "3) 문장 길이는 간결하게, 내용은 실제 결재 가능한 수준으로 작성.",
    "4) 마크다운/코드블록/설명문은 절대 출력하지 말 것.",
  ].join("\n");
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
