import { generateOnce } from "./gemini.service";

export async function generateYtMetaPack(
  titleKo: string,
  bookNameKo: string,
  bookNameHe: string,
  bookNameVi: string,
  verseRange: string | null
): Promise<string> {
  const prompt = `
다음 성경 에피소드 유튜브 메타데이터를 한국어·히브리어·베트남어로 생성해주세요.

에피소드: ${titleKo}
성경: ${bookNameKo} (${bookNameHe} / ${bookNameVi}) ${verseRange || ""}

중요: 히브리어 텍스트에서 인용부호(")나 아포스트로피(')는 반드시 백슬래시로 이스케이프하세요. (예: כ\\"ג, ב\\'ש)

반드시 다음 JSON 형식으로만 응답하세요. 다른 텍스트는 포함하지 마세요:

{
  "ko": { 
    "title": "제목", 
    "description": "설명", 
    "hashtags": ["#태그1", "#태그2"], 
    "tags": ["태그1", "태그2"] 
  },
  "he": { 
    "title": "כותרת", 
    "description": "תיאור (히브리어 인용부호는 \\"로 이스케이프)", 
    "hashtags": ["#תג1", "#תג2"], 
    "tags": ["תג1", "תג2"] 
  },
  "vi": { 
    "title": "Tiêu đề", 
    "description": "Mô tả", 
    "hashtags": ["#tag1", "#tag2"], 
    "tags": ["tag1", "tag2"] 
  }
}

각 언어별 SEO 키워드 및 성경 관련 해시태그를 포함하세요.
`;

  const result = await generateOnce(prompt);
  
  // Remove markdown code blocks if present
  const jsonMatch = result.match(/```json\n?([\s\S]*?)```/) || result.match(/```\n?([\s\S]*?)```/);
  let jsonString = jsonMatch ? jsonMatch[1].trim() : result;
  
  // If no markdown blocks, try to find JSON directly
  if (!jsonMatch) {
    const jsonStart = result.indexOf('{');
    const jsonEnd = result.lastIndexOf('}');
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      jsonString = result.slice(jsonStart, jsonEnd + 1);
    }
  }
  
  // Parse and re-stringify to ensure valid JSON and escape special characters
  try {
    // First attempt: direct parsing
    const parsed = JSON.parse(jsonString);
    return JSON.stringify(parsed, null, 2);
  } catch (parseError) {
    console.warn("[YtMeta] JSON 파싱 실패, 수동 수정 시도:", parseError);
    
    // Fix unescaped quotes: replace all unescaped quotes in string values
    let fixedJson = jsonString;
    
    // Find all string values and escape quotes within them
    fixedJson = fixedJson.replace(
      /":\s*"([^"\\]*(\\.[^"\\]*)*)"(?=\s*[,}])/g,
      (match, content) => {
        // This is a complete JSON string value
        return match; // Already properly quoted
      }
    );
    
    // Fix unescaped quotes within string content (more aggressive approach)
    fixedJson = fixedJson.replace(
      /"([^"]*?)([^\\])"([^"]*?)"/g,
      (match, before, char, after) => {
        // If this looks like a mid-string quote, escape it
        if (before.includes(':') || after.includes(',')) {
          return `"${before}${char}\\"${after}"`;
        }
        return match;
      }
    );
    
    try {
      const parsed = JSON.parse(fixedJson);
      return JSON.stringify(parsed, null, 2);
    } catch (secondError) {
      console.error("[YtMeta] 모든 JSON 수정 시도 실패:", secondError);
      return jsonString; // Return original if all else fails
    }
  }
}
