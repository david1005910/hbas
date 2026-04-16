import { genAI } from "../config/gemini";

const STUDIO_SYSTEM_PROMPT = `You are an AI assistant embedded in the Hebrew Bible Video Studio.
Your job is to help the user edit video props (subtitles, text, language, audio file) and answer questions about the video.

You can respond in two modes:
1. **Action mode** – When the user asks you to change something, respond with JSON only (no markdown, no explanation):
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

2. **Chat mode** – For questions, explanations, or requests you cannot handle as props changes, respond with plain text in Korean.

Guidelines:
- Always respond in Korean unless the user writes in English
- If the user asks to change subtitle text, put the new text in the appropriate field (koreanText or englishText)
- If the user asks to switch language to English, set language="en"
- If the user asks to switch language to Korean, set language="ko"
- For Hebrew text changes, update hebrewText
- If you cannot fulfill the request (e.g. change font color — requires code change), explain in Korean what limitation exists and suggest what they can do
- Keep responses concise

Current context will be provided with each message.`;

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

  const contextBlock = `
[현재 비디오 상태]
- 언어: ${context.language === "en" ? "영어 (English)" : "한국어"}
- 한국어 자막: ${context.koreanText?.slice(0, 80) ?? "(없음)"}${(context.koreanText?.length ?? 0) > 80 ? "..." : ""}
- 영어 자막: ${context.englishText?.slice(0, 80) ?? "(없음)"}${(context.englishText?.length ?? 0) > 80 ? "..." : ""}
- 히브리어: ${context.hebrewText?.slice(0, 60) ?? "(없음)"}${(context.hebrewText?.length ?? 0) > 60 ? "..." : ""}
- 배경 영상: ${context.videoFileName || "(없음)"}
- 오디오 파일: ${context.audioFileName || "narration.mp3"}
- 자막 항목 수: ${context.subtitleCount ?? 0}개
`;

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
