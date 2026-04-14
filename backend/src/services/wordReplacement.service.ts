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
];

export function loadReplacements(): WordReplacement[] {
  if (!fs.existsSync(CONFIG_PATH)) return DEFAULT_REPLACEMENTS;
  try {
    const data = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
    return Array.isArray(data) ? data : DEFAULT_REPLACEMENTS;
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
  return result;
}
