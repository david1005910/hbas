import { genAI } from "../config/gemini";
import { searchVerses } from "./ragEmbedding.service";

const STUDIO_SYSTEM_PROMPT = `You are an AI assistant embedded in the Hebrew Bible Video Studio (히브리어 성경 비디오 스튜디오).
Your role: (1) help edit video props, and (2) answer questions about the Hebrew Bible using provided verse context.

You can respond in two modes:
1. **Action mode** – When asked to change something, respond with JSON only:
   {
     "action": "update_props",
     "props": {
       "koreanText": "...",        // optional
       "hebrewText": "...",        // optional
       "englishText": "...",       // optional
       "language": "ko" | "en",   // optional
       "videoFileName": "...",     // optional
       "audioFileName": "..."      // optional
     },
     "message": "Brief Korean explanation of what changed"
   }

2. **Chat mode** – For Bible questions or other explanations, respond in Korean plain text.
   When Bible verse context is provided, use it to give accurate answers based on the Hebrew original.
   Translate Hebrew text directly — do NOT use standard Bible translations (개역개정, KJV, NIV, etc.).
   Provide your own fresh, accurate translation from the Hebrew.

Guidelines:
- Always respond in Korean unless the user writes in English
- For subtitle/text changes: use action mode
- For Bible questions: use the provided verse context, translate directly from Hebrew
- Keep responses concise but informative`;

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface StudioChatContext {
  koreanText: string;
  hebrewText: string;
  englishText?: string;
  language?: string;
  videoFileName?: string;
  audioFileName?: string;
  subtitleCount?: number;
}

export interface ChatActionResult {
  type: "action" | "message";
  message: string;
  props?: Partial<StudioChatContext>;
}

export async function studioChat(
  userMessage: string,
  context: StudioChatContext,
  history: ChatMessage[] = []
): Promise<ChatActionResult> {
  const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
    systemInstruction: STUDIO_SYSTEM_PROMPT,
  });

  // 성경 관련 질문이면 벡터 검색으로 관련 구절 가져오기
  let ragBlock = "";
  const isBibleQuery = /성경|히브리|구절|번역|창세기|출애굽|시편|창|출|민|신|수|삿|룻|삼|왕|대|스|느|에|욥|잠|전|아|사|렘|겔|단|호|욜|암|옵|욘|미|나|합|습|학|슥|말|genesis|exodus|psalm|hebrew|bible|verse|chapter|translate|what does/i.test(userMessage);

  if (isBibleQuery) {
    try {
      const results = await searchVerses(userMessage, 5);
      if (results.length > 0) {
        ragBlock = `\n[관련 히브리어 성경 구절 (벡터 검색 결과)]\n`;
        for (const r of results) {
          ragBlock += `• ${r.bookNameKo} ${r.chapter}:${r.verse} — ${r.hebrewText}`;
          if (r.koreanText) ragBlock += ` (참고: ${r.koreanText.slice(0, 50)})`;
          ragBlock += `\n`;
        }
        ragBlock += `위 히브리어 원문에서 직접 번역하여 답변하세요. 기존 성경 번역(개역개정, KJV 등) 인용 금지.\n`;
      }
    } catch {
      // 검색 실패 시 무시 (임베딩 없으면 결과 없음)
    }
  }

  const contextBlock = `
[현재 비디오 상태]
- 언어: ${context.language === "en" ? "영어 (English)" : "한국어"}
- 한국어 자막: ${context.koreanText?.slice(0, 80) ?? "(없음)"}${(context.koreanText?.length ?? 0) > 80 ? "..." : ""}
- 영어 자막: ${context.englishText?.slice(0, 80) ?? "(없음)"}${(context.englishText?.length ?? 0) > 80 ? "..." : ""}
- 히브리어: ${context.hebrewText?.slice(0, 60) ?? "(없음)"}${(context.hebrewText?.length ?? 0) > 60 ? "..." : ""}
- 배경 영상: ${context.videoFileName || "(없음)"}
- 오디오 파일: ${context.audioFileName || "narration.mp3"}
- 자막 항목 수: ${context.subtitleCount ?? 0}개
${ragBlock}`;

  // Build chat history for multi-turn
  const chat = model.startChat({
    history: history.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    })),
  });

  const prompt = `${contextBlock}\n사용자 요청: ${userMessage}`;
  const result = await chat.sendMessage(prompt);
  const responseText = result.response.text().trim();

  // Try to parse as JSON action
  try {
    const jsonStart = responseText.indexOf("{");
    const jsonEnd = responseText.lastIndexOf("}");
    if (jsonStart !== -1 && jsonEnd !== -1) {
      const jsonStr = responseText.slice(jsonStart, jsonEnd + 1);
      const parsed = JSON.parse(jsonStr);
      if (parsed.action === "update_props") {
        return {
          type: "action",
          message: parsed.message ?? "변경 완료",
          props: parsed.props,
        };
      }
    }
  } catch {
    // Not JSON, fall through to plain message
  }

  return {
    type: "message",
    message: responseText,
  };
}
