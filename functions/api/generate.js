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

    // Normalize basic header lines (수신/경유/제목) before inserting sections.
    document = normalizeHeaderFormatting(document).trim();
    document = normalizeRelatedSection(document, related).trim();
    document = normalizeAttachmentSection(document, attachments).trim();
    document = normalizeBodyIndentation(document).trim();

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

function isPlanSubject(subject) {
  const s = String(subject || "").trim();
  return s.includes("계획");
}

function buildPrompt({ subject, recipient, via, sender, date, details, attachments, useAttachmentPhrase, tone, docno, owner, contact, related }) {
  const attachmentInput = attachments.length
    ? attachments.map((item, index) => `${index + 1}. ${item}`).join("\n")
    : "(없음)";
  const relatedList = Array.isArray(related) ? related.map((x) => String(x || "").trim()).filter(Boolean) : [];
  const relatedInput = relatedList.length ? relatedList.map((x) => `- ${x}`).join("\n") : "(없음)";

  const isDetailsEmpty = !String(details || "").trim();
  const subjectBasedDetails = buildSubjectBasedDetails(subject, attachments);
  const isPlan = isPlanSubject(subject);

  const attachmentSentenceRule = useAttachmentPhrase
    ? `본문에는 아래 문장을 반드시 포함하되(1회), '1. 붙임과 같이 시행하고자 합니다.'처럼 단독 문장만 출력하지 말 것: "${subjectBasedDetails}" 붙임이 0개인 경우에는 문장 내 '붙임과 같이' 대신 '아래와 같이'가 포함되게 할 것.`
    : "본문에는 관행적인 붙임 문구를 임의로 추가하지 말 것.";

  const planRule = isPlan
    ? [
      "계획 공문 보강 규칙:",
      "- 제목이 '계획/운영 계획/실시 계획/추진 계획/계획(안)' 성격이면, 본문 소항목에 아래 요소를 누락 없이 반영할 것(표현은 자연스럽게 조정 가능).",
      "  가. 목적",
      "  나. 추진 내용(핵심 활동/절차)",
      "  다. 추진 일정/절차(불확실하면 '추후 안내' 또는 '붙임 참조')",
      "  라. 추진 체계(업무 분장/담당/협의 방식 중 1개 이상 포함)",
      "  마. 안전·개인정보·유의사항(필요 시)",
      "- 날짜/시간/장소 등 구체 정보는 임의로 지어내지 말 것.",
    ].join("\n")
    : "";

  const detailsRule = isDetailsEmpty
    ? useAttachmentPhrase
      ? isPlan
        ? `핵심 내용이 비어 있으면, 본문 1항의 첫 문장으로 "${subjectBasedDetails}"를 사용하고, 위 '계획 공문 보강 규칙'의 요소를 중심으로 결재 가능한 수준으로 소항목을 구성할 것. 날짜/시간/장소 등 구체 정보는 임의로 지어내지 말고 '붙임 참조' 또는 '추후 안내'로 처리할 것.`
        : `핵심 내용이 비어 있으면, 본문 1항의 첫 문장으로 "${subjectBasedDetails}"를 사용하고, 그 외 목적/추진내용/유의사항은 결재 가능한 수준으로 1~3개 항목만 추가할 것. 날짜/시간/장소 등 구체 정보는 임의로 지어내지 말고 '붙임 참조' 또는 '추후 안내'로 처리할 것.`
      : isPlan
        ? "핵심 내용이 비어 있으면, 제목(주제)을 바탕으로 '계획 공문 보강 규칙'의 요소를 중심으로 소항목을 구성하되, 날짜/시간/장소 등 구체 정보는 임의로 지어내지 말고 '붙임 참조' 또는 '추후 안내'로 처리할 것."
        : "핵심 내용이 비어 있으면, 제목(주제)을 바탕으로 목적/추진내용/유의사항을 결재 가능한 수준으로 2~4개 항목으로 구성하되, 날짜/시간/장소 등 구체 정보는 임의로 지어내지 말고 '붙임 참조' 또는 '추후 안내'로 처리할 것."
    : isPlan
      ? "핵심 내용이 있으면 입력 내용을 우선 반영하되, '계획 공문 보강 규칙'의 요소 중 누락된 부분(일정/절차, 업무분장, 안전 유의 등)이 있으면 과하지 않게 보완할 것."
      : "핵심 내용이 있으면 입력 내용을 우선 반영해 목적/추진내용/유의사항을 구체화할 것.";

  const toneRule =
    tone === "concise"
      ? "문체는 간결하게(불필요한 수식 최소), 항목 수는 2~4개 수준으로 제한."
      : tone === "friendly"
        ? "문체는 공손하고 친절하게(안내 표현을 부드럽게) 작성."
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
    "본문 항목/들여쓰기 규칙:",
    "- 최상위 항목은 '1.', '2.'처럼 숫자+마침표 형식만 사용.",
    "- 하위 항목은 '  가.', '  나.'처럼 2칸 들여쓰기 후 한글 글머리표 사용.",
    "- 더 하위가 필요하면 '    1)'처럼 추가 들여쓰기로 표기하되 남발하지 말 것.",
    "- 본문은 간결하게(불필요한 수식 최소), 문장부호와 띄어쓰기는 자연스럽게.",
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
    "- 붙임이 1개면 한 줄에 표기하고 같은 줄 끝에 '  끝.'(끝 앞 공백 2칸)를 표기: '붙임 <항목>.  끝.'",
    "- 붙임이 여러 개면 다음 형식만 사용(복사/붙여넣기 시 줄맞춤을 위해 탭(\\t)으로 정렬):",
    "  붙임\\t1. <항목>.",
    "  \\t2. <항목>.  끝.",
    "- 붙임 항목 문구는 입력값을 우선 사용(불필요한 임의 생성/추가 금지).",
    "- 붙임 항목 각 줄은 마침표(.)로 끝나게 할 것.",
    `- ${attachmentSentenceRule}`,
    ...(planRule ? [`- ${planRule}`] : []),
    `- ${detailsRule}`,
    `- ${toneRule}`,
    footerRule,
    "- 경유가 '미기재'면 '(경유)' 줄은 '(경유)'만 출력하고 뒤에 내용을 채우지 말 것.",
    "",
    "붙임(표기 예시)",
    "- 붙임 없음: (붙임 줄 생략) 본문 마지막 문장 끝에 '  끝.' 표기",
    "- 붙임 1개: 붙임 운영 계획(안) 1부.  끝.",
    "- 붙임 여러 개:",
    "  붙임\t1. 운영 계획(안) 1부.",
    "  \t2. 학년별 운영 시간표 1부.  끝.",
    "",
    "발신  ...",
    "시행일  ...",
    "2) 학교 행정 문체로 자연스럽고 구체적으로 작성.",
    "3) 문장 길이는 간결하게, 내용은 실제 결재 가능한 수준으로 작성.",
    "4) 마크다운/코드블록/설명문은 절대 출력하지 말 것.",
  ].join("\n");
}

function normalizeAttachmentSection(documentText, attachments) {
  const END_MARK = "  끝.";
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
    let last = String(contentLines[lastIdx] || "")
      .replace(/\s*끝\.\s*$/g, "")
      .replace(/\s+$/g, "")
      .trimEnd();
    if (last && !last.endsWith(".")) {
      last += ".";
    }
    contentLines = contentLines.slice(0, lastIdx + 1);
    contentLines[lastIdx] = `${last}${END_MARK}`;
    return joinWithFooter(contentLines, footerRegion);
  }

  const attachmentLines = buildAttachmentLines(list);
  if (attachmentLines.length) {
    // 붙임이 있는 경우: 본문 종료 후 1줄 띄우고 붙임 표기(예시 기준).
    // (너무 크게 벌어지는 것을 방지하기 위해 빈 줄은 1줄로 제한)
    while (contentLines.length && String(contentLines[contentLines.length - 1] || "").trim() === "") {
      contentLines.pop();
    }
    contentLines.push("");
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
  const END_MARK = "  끝.";
  const raw = Array.isArray(attachments) ? attachments : [];
  const cleaned = raw
    .map((item) => sanitizeAttachmentItem(item))
    .filter(Boolean);

  if (!cleaned.length) {
    return [];
  }

  if (cleaned.length === 1) {
    return [`붙임 ${ensurePeriod(cleaned[0])}${END_MARK}`];
  }

  // 줄맞춤(복붙 안정)을 위해 탭을 사용한다.
  // - 첫 줄: "붙임\t1. ..."
  // - 다음 줄: "\t2. ..." (번호가 1과 같은 열에서 시작)
  const prefix = "붙임\t";
  const indent = "\t";
  const out = [];
  out.push(`${prefix}1. ${ensurePeriod(cleaned[0])}`);

  for (let i = 1; i < cleaned.length; i += 1) {
    let line = `${indent}${i + 1}. ${ensurePeriod(cleaned[i])}`;
    if (i === cleaned.length - 1) {
      line += END_MARK;
    }
    out.push(line);
  }

  return out;
}

function normalizeHeaderFormatting(documentText) {
  const lines = String(documentText || "").split("\n");
  if (!lines.length) return String(documentText || "");

  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    let raw = String(lines[i] || "");
    const trimmed = raw.trim();

    // Normalize common colon variants into the required "라벨  값" style.
    raw = raw.replace(/^\s*수신\s*[:：]\s*/g, "수신  ");
    raw = raw.replace(/^\s*\(경유\)\s*[:：]\s*/g, "(경유) ");
    raw = raw.replace(/^\s*제\s*목\s*[:：]\s*/g, "제목  ");

    // Ensure label spacing when the model outputs "수신 ..." without the two-space gap.
    raw = raw.replace(/^\s*수신\s+(?!\s)/g, "수신  ");
    raw = raw.replace(/^\s*제\s*목\s+(?!\s)/g, "제목  ");

    // Keep empty lines as-is.
    if (!trimmed) {
      out.push(raw);
      continue;
    }

    out.push(raw);
  }

  return out.join("\n");
}

function normalizeBodyIndentation(documentText) {
  const lines = String(documentText || "").split("\n");
  if (!lines.length) return String(documentText || "");

  const footerStart = findFooterStartIndex(lines);
  const headerAndBody = footerStart >= 0 ? lines.slice(0, footerStart) : lines.slice();
  const footer = footerStart >= 0 ? lines.slice(footerStart) : [];

  const out = [];
  let prevPrefixLen = 0;
  let prevWasMarker = false;
  let inAttachmentBlock = false;
  const ATTACHMENT_NUM_INDENT = "\t"; // tab alignment for copy/paste into HWP/HWPX

  for (let i = 0; i < headerAndBody.length; i += 1) {
    let raw = String(headerAndBody[i] || "");
    const trimmed = raw.trim();

    // Preserve blank lines and reset continuation context.
    if (!trimmed) {
      out.push(raw);
      prevPrefixLen = 0;
      prevWasMarker = false;
      // keep attachment block until we actually see non-attachment content,
      // because attachments typically appear at the end.
      continue;
    }

    // Attachment block handling:
    // Once "붙임" is seen, do not normalize away leading spaces on numbered lines.
    if (trimmed.startsWith("붙임")) {
      inAttachmentBlock = true;
      // Normalize "붙임  1." or "붙임 1." into "붙임\t1." for stable alignment.
      raw = raw.replace(/^(\s*)붙임\s+\d+\.\s+/, "$1붙임\t" + trimmed.replace(/^붙임\s+\d+\.\s+/, "").replace(/^/, "1. ").replace(/^1\.\s+/, "1. "));
      out.push(raw);
      const m = trimmed.match(/^붙임\s+\d+\.\s+/);
      prevPrefixLen = m ? m[0].length : 0;
      prevWasMarker = true;
      continue;
    }

    if (inAttachmentBlock) {
      // If the model printed "2. ..." without indent, enforce indent in plain text output.
      if (/^\d+\.\s+/.test(trimmed) && !/^\s+\d+\.\s+/.test(raw)) {
        out.push(`${ATTACHMENT_NUM_INDENT}${trimmed}`);
        prevPrefixLen = (ATTACHMENT_NUM_INDENT + trimmed.match(/^\d+\.\s+/)[0]).length;
        prevWasMarker = true;
        continue;
      }

      // If it is already indented numbered attachment, normalize leading whitespace to a single tab.
      if (/^\s+\d+\.\s+/.test(raw)) {
        out.push(`${ATTACHMENT_NUM_INDENT}${trimmed}`);
        prevPrefixLen = (ATTACHMENT_NUM_INDENT + trimmed.match(/^\d+\.\s+/)[0]).length;
        prevWasMarker = true;
        continue;
      }

      // Any other non-empty line means we're out of attachment block.
      inAttachmentBlock = false;
      // fallthrough to normal rules
    }

    // Preserve indented numbered lines (e.g., tables/continued formatting) as-is.
    if (/^\s+\d+\.\s+/.test(raw)) {
      out.push(raw);
      prevPrefixLen = raw.match(/^\s*\d+\.\s+/)?.[0].length || 0;
      prevWasMarker = true;
      continue;
    }

    // Normalize indentation for common markers.
    // Top-level: "1. ..."
    const top = trimmed.match(/^(\d+)\.\s+/);
    if (top) {
      raw = `${top[1]}. ${trimmed.replace(/^(\d+)\.\s+/, "")}`;
      out.push(raw);
      prevPrefixLen = `${top[1]}. `.length;
      prevWasMarker = true;
      continue;
    }

    // Sub-level: "가. ..." with exactly two leading spaces.
    const sub = trimmed.match(/^([가-하])\.\s+/);
    if (sub) {
      raw = `  ${sub[1]}. ${trimmed.replace(/^([가-하])\.\s+/, "")}`;
      out.push(raw);
      prevPrefixLen = `  ${sub[1]}. `.length;
      prevWasMarker = true;
      continue;
    }

    // Continuation line: if previous line started with a marker, align text to marker content.
    // Keep this conservative: only indent when the line isn't already indented.
    if (prevWasMarker && prevPrefixLen > 0 && raw.match(/^\S/)) {
      out.push(`${" ".repeat(prevPrefixLen)}${trimmed}`);
      prevWasMarker = false;
      continue;
    }

    out.push(raw);
    prevPrefixLen = 0;
    prevWasMarker = false;
  }

  return joinWithFooter(out, footer);
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
