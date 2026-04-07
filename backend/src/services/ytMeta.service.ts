import { generateOnce } from "./gemini.service";

export async function generateYtMetaPack(
  titleKo: string,
  bookNameKo: string,
  bookNameHe: string,
  bookNameEn: string,
  verseRange: string | null
): Promise<string> {
  const prompt = `
다음 성경 에피소드 유튜브 메타데이터를 한국어·히브리어·영어로 생성해주세요.

에피소드: ${titleKo}
성경: ${bookNameKo} (${bookNameHe} / ${bookNameEn}) ${verseRange || ""}

반드시 다음 JSON 형식으로만 응답하세요:
{
  "ko": { "title": "", "description": "", "hashtags": [], "tags": [] },
  "he": { "title": "", "description": "", "hashtags": [], "tags": [] },
  "en": { "title": "", "description": "", "hashtags": [], "tags": [] }
}

각 언어별 SEO 키워드 및 성경 관련 해시태그를 포함하세요.
`;

  return generateOnce(prompt);
}
