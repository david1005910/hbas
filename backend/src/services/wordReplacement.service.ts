/**
 * 단어 치환 서비스
 * 나레이션 TTS 및 자막 한국어 텍스트에 적용되는 단어 치환 규칙 관리
 */
import fs from "fs";
import path from "path";

const CONFIG_DIR = process.env.AUDIO_STORAGE_PATH
  ? path.join(process.env.AUDIO_STORAGE_PATH, "..", "config")
  : "/app/storage/config";

const CONFIG_PATH = path.join(CONFIG_DIR, "word-replacements.json");

export interface WordReplacement {
  from: string;
  to: string;
  enabled: boolean;
}

/** 기본 치환 규칙 — 긴 패턴을 먼저 나열해야 부분 매칭 방지 */
const DEFAULT_REPLACEMENTS: WordReplacement[] = [
  { from: "여호와 하나님", to: "엘로힘", enabled: true },
  { from: "주 하나님", to: "엘로힘", enabled: true },
  { from: "하나님", to: "엘로힘", enabled: true },
  // 감탄형 → 평서형 변환
  { from: "하였네", to: "하였다", enabled: true },
  { from: "되었네", to: "되었다", enabled: true },
  { from: "되었구나", to: "되었다", enabled: true },
  { from: "하였구나", to: "하였다", enabled: true },
  { from: "이었네", to: "이었다", enabled: true },
  { from: "이었구나", to: "이었다", enabled: true },
  { from: "있었네", to: "있었다", enabled: true },
  { from: "있었구나", to: "있었다", enabled: true },
  { from: "했네", to: "했다", enabled: true },
  { from: "했구나", to: "했다", enabled: true },
  { from: "됐네", to: "됐다", enabled: true },
  { from: "됐구나", to: "됐다", enabled: true },
];

export function loadReplacements(): WordReplacement[] {
  if (!fs.existsSync(CONFIG_PATH)) return DEFAULT_REPLACEMENTS;
  try {
    const data = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
    if (!Array.isArray(data)) return DEFAULT_REPLACEMENTS;
    // Merge: add any default rules missing from saved config (by `from` key)
    const savedFroms = new Set(data.map((r: WordReplacement) => r.from));
    const missing = DEFAULT_REPLACEMENTS.filter((r) => !savedFroms.has(r.from));
    return [...missing, ...data];
  } catch {
    return DEFAULT_REPLACEMENTS;
  }
}

export function saveReplacements(replacements: WordReplacement[]): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(replacements, null, 2), "utf-8");
}

/**
 * 텍스트에 활성화된 치환 규칙을 적용
 * 긴 패턴 먼저 처리해 부분 매칭 방지 ("주 하나님" → "엘로힘" 처리 후 "하나님" 처리)
 */
export function applyWordReplacements(text: string): string {
  if (!text) return text;
  const rules = loadReplacements().filter((r) => r.enabled);
  // 긴 패턴 우선 정렬
  const sorted = [...rules].sort((a, b) => b.from.length - a.from.length);
  let result = text;
  for (const rule of sorted) {
    result = result.split(rule.from).join(rule.to);
  }
  
  // 추가적인 감탄형 제거 (정규식 기반)
  result = result.replace(/([가-힣]+)네([^\w]|$)/g, '$1다$2');
  result = result.replace(/([가-힣]+)구나([^\w]|$)/g, '$1다$2');
  result = result.replace(/([가-힣]+)는구나([^\w]|$)/g, '$1는다$2');
  result = result.replace(/([가-힣]+)었네([^\w]|$)/g, '$1었다$2');
  result = result.replace(/([가-힣]+)았네([^\w]|$)/g, '$1았다$2');
  result = result.replace(/([가-힣]+)였네([^\w]|$)/g, '$1였다$2');
  
  return result;
}

/**
 * 베트남어 텍스트에 특화된 치환 규칙 적용
 * "엘로힘(Elohim)" → "Elohim"
 */
export function applyVietnameseReplacements(text: string): string {
  if (!text) return text;
  return text.replace(/엘로힘\(Elohim\)/g, "Elohim");
}
