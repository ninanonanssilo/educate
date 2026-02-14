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
    const via = String(body.via || "").trim();
    const sender = String(body.sender || "00초등학교장").trim();
    const date = String(body.date || "").trim();
    const details = String(body.details || "").trim();
    const attachments = Array.isArray(body.attachments) ? body.attachments : [];
    const useAttachmentPhrase = Boolean(body.useAttachmentPhrase);
    const tone = String(body.tone || "default").trim();
    const docno = String(body.docno || "").trim();
    const owner = String(body.owner || "").trim();
    const contact = String(body.contact || "").trim();
    const related = Array.isArray(body.related) ? body.related : [];

    if (!subject) {
      return json({ error: "subject is required." }, 400);
    }

    const userPrompt = buildPrompt({
      subject,
      recipient,
      via,
      sender,
      date,
      details,
      attachments,
      useAttachmentPhrase,
      tone,
      docno,
      owner,
      contact,
      related,
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

    document = normalizeRelatedSection(document, related).trim();
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

function buildPrompt({ subject, recipient, via, sender, date, details, attachments, useAttachmentPhrase, tone, docno, owner, contact, related }) {
  const attachmentInput = attachments.length
    ? attachments.map((item, index) => `${index + 1}. ${item}`).join("\n")
    : "(없음)";
  const relatedList = Array.isArray(related) ? related.map((x) => String(x || "").trim()).filter(Boolean) : [];
  const relatedInput = relatedList.length ? relatedList.map((x) => `- ${x}`).join("\n") : "(없음)";

  const isDetailsEmpty = !String(details || "").trim();
  const subjectBasedDetails = buildSubjectBasedDetails(subject, attachments);

  const attachmentSentenceRule = useAttachmentPhrase
    ? `본문에는 아래 문장을 반드시 포함하되(1회), '1. 붙임과 같이 시행하고자 합니다.'처럼 단독 문장만 출력하지 말 것: "${subjectBasedDetails}" 붙임이 0개인 경우에는 문장 내 '붙임과 같이' 대신 '아래와 같이'가 포함되게 할 것.`
    : "본문에는 관행적인 붙임 문구를 임의로 추가하지 말 것.";

  const detailsRule = isDetailsEmpty
    ? useAttachmentPhrase
      ? `핵심 내용이 비어 있으면, 본문 1항의 첫 문장으로 "${subjectBasedDetails}"를 사용하고, 그 외 목적/추진내용/협조사항은 결재 가능한 수준으로 1~3개 항목만 추가할 것. 날짜/시간/장소 등 구체 정보는 임의로 지어내지 말고 '붙임 참조' 또는 '추후 안내'로 처리할 것.`
      : "핵심 내용이 비어 있으면, 제목(주제)을 바탕으로 목적/추진내용/협조사항을 결재 가능한 수준으로 2~4개 항목으로 구성하되, 날짜/시간/장소 등 구체 정보는 임의로 지어내지 말고 '붙임 참조' 또는 '추후 안내'로 처리할 것."
    : "핵심 내용이 있으면 입력 내용을 우선 반영해 목적/추진내용/협조사항을 구체화할 것.";

  const toneRule =
    tone === "concise"
      ? "문체는 간결하게(불필요한 수식 최소), 항목 수는 2~4개 수준으로 제한."
      : tone === "friendly"
        ? "문체는 공손하고 친절하게(안내/협조 요청 표현을 부드럽게) 작성."
        : "문체는 일반적인 학교 행정 문체로 작성.";

  const footerRule = [
    "하단 표기 규칙:",
    "- '발신'과 '시행일' 줄은 항상 포함.",
    "- '문서번호/담당/연락처'는 입력값이 있을 때만 포함(없으면 줄 전체 생략).",
    "- 문서번호/담당/연락처/발신/시행일은 입력값을 그대로 사용하고 임의로 생성하지 말 것.",
  ].join("\n");

  return [
    "아래 정보를 바탕으로 한국 학교 내부결재용 공문을 작성해줘.",
    "",
    `[입력 정보]`,
    `- 수신: ${recipient}`,
    `- 경유: ${via || "미기재"}`,
    `- 제목: ${subject}`,
    `- 관련(선택): ${relatedInput}`,
    `- 시행일: ${date || "오늘 날짜 형식 유지"}`,
    `- 발신: ${sender}`,
    `- 문서번호: ${docno || "미기재"}`,
    `- 담당: ${owner || "미기재"}`,
    `- 연락처: ${contact || "미기재"}`,
    `- 문체: ${tone || "default"}`,
    `- 핵심 내용: ${details || "미기재"}`,
    `- 붙임: ${attachmentInput}`,
    "",
    "[작성 규칙]",
    "1) 반드시 다음 형식만 출력:",
    "수신  ...",
    "(경유) ...",
    "제목  ...",
    "",
    "1. ...",
    "  가. ...",
    "  나. ...",
    "  다. ...",
    "",
    "관련 표기 규칙:",
    "- 관련이 0개면 '관련' 항목을 쓰지 말 것.",
    "- 관련이 있으면 본문 첫 항목을 반드시 '1. 관련'으로 시작할 것(가장 먼저).",
    "- 관련 문서는 '가./나./다.'처럼 소항목으로 나열할 것.",
    "- 그 다음 본문 항목은 '2.', '3.' ...로 이어질 것.",
    "- 관련 내용은 입력값을 그대로 사용하고 임의로 생성/추가하지 말 것.",
    "",
    "붙임 표기 규칙:",
    "- 붙임이 0개면 '붙임' 줄을 쓰지 말 것(붙임 구역 전체 생략).",
    "- 붙임이 1개면 번호 없이 1줄로 표기하고 같은 줄 끝에 '끝.'을 표기: '붙임  <항목>.  끝.'",
    "- 붙임이 여러 개면 첫 줄은 '붙임 1. <항목>.'로, 다음 줄부터는 들여쓰기 후 번호를 표기하며 마지막 항목 줄 끝에 '끝.'을 표기.",
    "- 붙임 항목 문구는 입력값을 우선 사용(불필요한 임의 생성/추가 금지).",
    "- 붙임 항목 각 줄은 마침표(.)로 끝나게 할 것.",
    `- ${attachmentSentenceRule}`,
    `- ${detailsRule}`,
    `- ${toneRule}`,
    footerRule,
    "- 경유가 '미기재'면 '(경유)' 줄은 '(경유)'만 출력하고 뒤에 내용을 채우지 말 것.",
    "",
    "붙임(표기 예시)",
    "- 붙임 없음: (붙임 줄 생략) ... 마지막에 '끝.' 1줄 표기",
    "- 붙임 1개: 붙임  운영 계획(안) 1부.  끝.",
    "- 붙임 여러 개:",
    "  붙임 1. 운영 계획(안) 1부.",
    "        2. 학년별 운영 시간표 1부.  끝.",
    "",
    "발신  ...",
    "시행일  ...",
    "2) 학교 행정 문체로 자연스럽고 구체적으로 작성.",
    "3) 문장 길이는 간결하게, 내용은 실제 결재 가능한 수준으로 작성.",
    "4) 마크다운/코드블록/설명문은 절대 출력하지 말 것.",
  ].join("\n");
}

function normalizeAttachmentSection(documentText, attachments) {
  const list = Array.isArray(attachments) ? attachments : [];
  const count = list.length;
  const rawLines = String(documentText || "").split("\n");

  const footerIndex = findFooterStartIndex(rawLines);
  const contentRegion = footerIndex >= 0 ? rawLines.slice(0, footerIndex) : rawLines.slice();
  const footerRegion = footerIndex >= 0 ? rawLines.slice(footerIndex) : [];

  // Remove any existing attachment block in the content region.
  const attachmentStart = contentRegion.findIndex((l) => String(l || "").trim().startsWith("붙임"));
  let contentLines = attachmentStart >= 0 ? contentRegion.slice(0, attachmentStart) : contentRegion.slice();

  // Drop stray standalone end marks; we'll re-apply correctly.
  contentLines = contentLines.filter((l) => String(l || "").trim() !== "끝.");

  if (count === 0) {
    // No attachments: no "붙임" lines, but ensure a standalone end mark exists.
    const lastIdx = findLastNonEmptyIndex(contentLines);
    if (lastIdx < 0) {
      contentLines.push("끝.");
      return joinWithFooter(contentLines, footerRegion);
    }

    // Prefer "… .  끝." on the last content line.
    let last = String(contentLines[lastIdx] || "").replace(/\s*끝\.\s*$/g, "").trimEnd();
    if (last && !last.endsWith(".")) {
      last += ".";
    }
    contentLines = contentLines.slice(0, lastIdx + 1);
    contentLines[lastIdx] = `${last}  끝.`;
    return joinWithFooter(contentLines, footerRegion);
  }

  const attachmentLines = buildAttachmentLines(list);
  if (attachmentLines.length) {
    if (contentLines.length && contentLines[contentLines.length - 1].trim() !== "") {
      contentLines.push("");
    }
    contentLines.push(...attachmentLines);
  }

  return joinWithFooter(contentLines, footerRegion);
}

function normalizeRelatedSection(documentText, related) {
  const list = Array.isArray(related) ? related : [];
  const cleaned = list.map((x) => sanitizeRelatedItem(x)).filter(Boolean);

  const lines = String(documentText || "").split("\n");
  if (!lines.length) {
    return String(documentText || "");
  }

  // Find the "제목" header line (some outputs include extra spaces).
  const titleIdx = lines.findIndex((l) => /^\s*제\s*목\b/.test(String(l || "")));
  if (titleIdx < 0) {
    return String(documentText || "");
  }

  const header = lines.slice(0, titleIdx + 1);
  const rest = lines.slice(titleIdx + 1);

  // Strip "관련:" block (legacy style) directly under the title.
  const strippedUnderTitle = stripLegacyRelatedUnderTitle(rest);

  // Strip any top-level "1. 관련" section that the model may have produced.
  let bodyLines = stripNumberedRelatedSection(strippedUnderTitle);

  if (!cleaned.length) {
    return [...header, ...bodyLines].join("\n");
  }

  // Insert "1. 관련" as the very first numbered section in the body.
  const insertAt = findFirstTopLevelSectionIndex(bodyLines);
  const before = insertAt >= 0 ? bodyLines.slice(0, insertAt) : bodyLines.slice();
  const after = insertAt >= 0 ? bodyLines.slice(insertAt) : [];

  const relatedSection = buildNumberedRelatedSection(cleaned);

  // If the body already starts numbering at 1, shift it to start at 2.
  const shiftedAfter = shouldShiftTopLevelNumbers(after) ? shiftTopLevelNumbers(after, 1) : after;

  // Ensure a blank line separation like typical 공문 formatting.
  const out = [];
  out.push(...header);
  out.push(...before);
  if (out.length && out[out.length - 1].trim() !== "") out.push("");
  out.push(...relatedSection);
  out.push("");
  out.push(...shiftedAfter);
  return out.join("\n");
}

function stripLegacyRelatedUnderTitle(lines) {
  const list = Array.isArray(lines) ? lines : [];
  const out = [];
  let i = 0;
  let removingRelated = false;

  for (; i < list.length; i += 1) {
    const raw = String(list[i] || "");
    const trimmed = raw.trim();

    // Stop stripping once we hit the normal header/body separator.
    if (!removingRelated && trimmed === "") {
      out.push(...list.slice(i));
      return out;
    }

    // Detect the legacy "관련:" line.
    if (!removingRelated && trimmed.startsWith("관련")) {
      removingRelated = true;
      continue;
    }

    // Remove continuation lines for the legacy related block.
    if (removingRelated) {
      if (trimmed === "") {
        removingRelated = false;
        out.push(raw);
        continue;
      }

      // Stop removing if we bumped into a top-level section or attachment.
      const isBodyStart = /^\d+\.\s/.test(trimmed) || trimmed.startsWith("붙임") || trimmed.startsWith("끝.");
      if (isBodyStart) {
        removingRelated = false;
        out.push(raw);
      }
      continue;
    }

    out.push(raw);
  }

  return out;
}

function stripNumberedRelatedSection(lines) {
  const list = Array.isArray(lines) ? lines : [];
  const out = [];

  let i = 0;
  while (i < list.length) {
    const trimmed = String(list[i] || "").trim();
    if (/^1\.\s*관련\b/.test(trimmed)) {
      // Drop until next top-level section / attachment / footer marker.
      i += 1;
      for (; i < list.length; i += 1) {
        const t = String(list[i] || "").trim();
        if (/^\d+\.\s/.test(t) || t.startsWith("붙임") || t.startsWith("끝.") || t.startsWith("발신") || t.startsWith("시행일")) {
          break;
        }
      }
      continue;
    }
    out.push(list[i]);
    i += 1;
  }

  return out;
}

function findFirstTopLevelSectionIndex(lines) {
  const list = Array.isArray(lines) ? lines : [];
  return list.findIndex((l) => /^\s*\d+\.\s+/.test(String(l || "").trim()));
}

function shouldShiftTopLevelNumbers(lines) {
  const list = Array.isArray(lines) ? lines : [];
  const nums = [];
  for (const l of list) {
    const m = String(l || "").trim().match(/^(\d+)\.\s+/);
    if (m) nums.push(Number(m[1]));
  }
  if (!nums.length) return false;
  return Math.min(...nums) === 1;
}

function shiftTopLevelNumbers(lines, delta) {
  const list = Array.isArray(lines) ? lines : [];
  const d = Number(delta) || 0;
  if (!d) return list.slice();

  return list.map((l) => {
    const raw = String(l || "");
    const trimmed = raw.trim();
    const m = trimmed.match(/^(\d+)\.\s+/);
    if (!m) return raw;

    const n = Number(m[1]);
    if (!Number.isFinite(n)) return raw;

    const shifted = `${n + d}. `;
    // Preserve leading spaces before the number, if any.
    const leading = raw.match(/^\s*/)?.[0] || "";
    const restText = trimmed.replace(/^(\d+)\.\s+/, "");
    return `${leading}${shifted}${restText}`;
  });
}

function buildNumberedRelatedSection(cleanedItems) {
  const items = Array.isArray(cleanedItems) ? cleanedItems : [];
  if (!items.length) return [];

  const labels = ["가", "나", "다", "라", "마", "바", "사", "아", "자", "차", "카", "타", "파", "하"];
  const out = ["1. 관련"];

  for (let i = 0; i < items.length; i += 1) {
    const label = labels[i] || String(i + 1);
    out.push(`  ${label}. ${items[i]}`);
  }

  return out;
}

function sanitizeRelatedItem(value) {
  let text = String(value || "").trim();
  if (!text) return "";

  // Normalize common user prefixes.
  text = text.replace(/^관련\s*[:：]?\s*/g, "");
  text = text.replace(/^\d+\.\s*/g, "");
  text = text.trim();
  return text;
}

function joinWithFooter(contentLines, footerLines) {
  const out = contentLines.slice();
  const footer = Array.isArray(footerLines) ? footerLines : [];

  if (footer.length) {
    if (out.length && out[out.length - 1].trim() !== "" && String(footer[0] || "").trim() !== "") {
      out.push("");
    }
    out.push(...footer);
  }

  return out.join("\n");
}

function findFooterStartIndex(lines) {
  const list = Array.isArray(lines) ? lines : [];
  const markers = ["발신", "시행일", "문서번호", "담당", "연락처"];

  for (let i = 0; i < list.length; i += 1) {
    const trimmed = String(list[i] || "").trim();
    if (!trimmed) continue;
    for (const m of markers) {
      if (trimmed.startsWith(m)) {
        return i;
      }
    }
  }

  return -1;
}

function buildAttachmentLines(attachments) {
  const raw = Array.isArray(attachments) ? attachments : [];
  const cleaned = raw
    .map((item) => sanitizeAttachmentItem(item))
    .filter(Boolean);

  if (!cleaned.length) {
    return [];
  }

  if (cleaned.length === 1) {
    return [`붙임  ${ensurePeriod(cleaned[0])}  끝.`];
  }

  // Keep the numbering column aligned like common 공문 formatting:
  // "붙임 1." then next lines are indented so "2." starts under "1.".
  // With Hangul often rendered as double-width, 5 spaces visually aligns under "붙임 1.".
  const indent = "     ";
  const out = [];
  out.push(`붙임 1. ${ensurePeriod(cleaned[0])}`);

  for (let i = 1; i < cleaned.length; i += 1) {
    let line = `${indent}${i + 1}. ${ensurePeriod(cleaned[i])}`;
    if (i === cleaned.length - 1) {
      line += "  끝.";
    }
    out.push(line);
  }

  return out;
}

function findLastNonEmptyIndex(lines) {
  const list = Array.isArray(lines) ? lines : [];
  for (let i = list.length - 1; i >= 0; i -= 1) {
    if (String(list[i] || "").trim() !== "") {
      return i;
    }
  }
  return -1;
}

function sanitizeAttachmentItem(value) {
  let text = String(value || "").trim();
  if (!text) return "";

  // Remove common prefixes and numbering if user already typed them.
  text = text.replace(/^붙임\s*/g, "");
  text = text.replace(/^\d+\.\s*/g, "");

  // Remove trailing end mark and trailing periods; we'll re-add.
  text = text.replace(/\s*끝\.\s*$/g, "");
  text = text.replace(/\.+\s*$/g, "");

  return text.trim();
}

function ensurePeriod(text) {
  const value = String(text || "").trim();
  if (!value) return "";
  return value.endsWith(".") ? value : `${value}.`;
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
