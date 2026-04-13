/** SRT 한 항목 */
export interface SrtEntry {
  index: number;
  startSec: number;
  endSec: number;
  text: string;
}

/** "HH:MM:SS,mmm" → 초 */
function toSec(ts: string): number {
  const [hms, ms] = ts.split(",");
  const [h, m, s] = hms.split(":").map(Number);
  return h * 3600 + m * 60 + s + Number(ms) / 1000;
}

/** 초 → "HH:MM:SS,mmm" */
function toTs(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.round((sec % 1) * 1000);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

/** SRT 문자열 파싱 → 항목 배열 */
export function parseSrt(srtContent: string): SrtEntry[] {
  const clean = srtContent.replace(/^\uFEFF/, "").trim();
  const blocks = clean.split(/\n\s*\n/);
  const entries: SrtEntry[] = [];

  for (const block of blocks) {
    const lines = block.trim().split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length < 3) continue;
    const idx = parseInt(lines[0]);
    const timeLine = lines[1];
    const timeMatch = timeLine.match(
      /(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/
    );
    if (!timeMatch) continue;
    const text = lines.slice(2).join(" ");
    entries.push({
      index: idx,
      startSec: toSec(timeMatch[1]),
      endSec: toSec(timeMatch[2]),
      text,
    });
  }
  return entries;
}

/**
 * 씬 N(1-indexed)에 해당하는 미니 SRT 생성
 * 클립 내 타이밍으로 리매핑 (0.5s → clipDurationSec-0.5s)
 */
export function buildSceneSrt(
  srtContent: string,
  sceneNumber: number,
  clipDurationSec = 8
): string {
  const entries = parseSrt(srtContent);
  const entry = entries.find((e) => e.index === sceneNumber) ?? entries[sceneNumber - 1];
  if (!entry) return "";

  const start = 0.5;
  const end = Math.max(start + 1, clipDurationSec - 0.5);

  return `1\n${toTs(start)} --> ${toTs(end)}\n${entry.text}\n`;
}

/** 초 → ASS 타임코드 "H:MM:SS.cc" */
function toAssTs(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const cs = Math.round((sec % 1) * 100);
  const pad2 = (n: number) => String(n).padStart(2, "0");
  return `${h}:${pad2(m)}:${pad2(s)}.${pad2(cs)}`;
}

/**
 * 텍스트를 N 덩어리로 균등 분할 (단어 단위)
 * 예: "A B C D E F" → 3등분 → ["A B", "C D", "E F"]
 */
function splitTextIntoChunks(text: string, chunks: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return Array(chunks).fill("");
  const chunkSize = Math.max(1, Math.ceil(words.length / chunks));
  const result: string[] = [];
  for (let i = 0; i < chunks; i++) {
    const slice = words.slice(i * chunkSize, (i + 1) * chunkSize);
    result.push(slice.join(" "));
  }
  while (result.length < chunks) result.push("");
  return result;
}

/**
 * 한국어 텍스트를 글자 수(공백 제외) 기준으로 분할
 * - maxChars(기본 13): 한 청크 최대 글자 수
 * - 단어 경계를 유지하면서 13자 초과 시 새 청크 시작 → 10~15자 범위 유지
 */
function splitTextByCharLimit(text: string, maxChars = 13): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    const displayLen = candidate.replace(/\s/g, "").length;

    if (displayLen > maxChars && current) {
      chunks.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks.length > 0 ? chunks : [""];
}

/**
 * 구두점(쉼표, 마침표) 우선으로 자막 분할
 * 1단계: , . ， 。 뒤에서 분리 → 구두점은 앞 조각에 포함
 * 2단계: 분리된 조각이 maxChars 초과 시 글자 수 기준으로 추가 분할
 * 3단계: 구두점 없는 텍스트는 글자 수 기준 분할 fallback
 *
 * 예: "가나안 땅으로, 그곳에서 살며. 하나님의 말씀을"
 *   → ["가나안 땅으로,", "그곳에서 살며.", "하나님의 말씀을"]
 */
function splitTextByPunctuation(text: string, maxChars = 15): string[] {
  const results: string[] = [];

  // 쉼표·마침표(전각 포함) 바로 뒤에서 분리, 구두점은 앞 조각에 유지
  const segments = text.split(/(?<=[,.\uff0c\u3002])\s*/u).map((s) => s.trim()).filter(Boolean);

  for (const seg of segments) {
    const cleanLen = seg.replace(/\s/g, "").length;
    if (cleanLen <= maxChars) {
      results.push(seg);
    } else {
      // 너무 길면 글자 수 기준으로 추가 분할
      results.push(...splitTextByCharLimit(seg, maxChars));
    }
  }

  return results.length > 0 ? results : [""];
}

// TTS 발화 속도 상수 (speakingRate 0.62 기준 한국어 약 3.5자/초)
const CHARS_PER_SEC = 3.5;
const COMMA_BREAK_SEC = 0.4;   // SSML <break time="400ms"/>
const PERIOD_BREAK_SEC = 0.7;  // SSML <break time="700ms"/>

/**
 * 한국어 + 히브리어 자막을 합쳐 ASS 형식으로 생성
 *
 * 타이밍 방식 (나레이션 TTS 발화 시간과 정확히 동기화):
 *   - 각 청크 표시 시간 = 글자수 / CHARS_PER_SEC + SSML break 시간
 *   - 마침표: +0.7s / 쉼표: +0.4s  →  나레이션 pause와 동일
 *   - 전체 자막 구간이 예상 발화 시간에 맞춰 끝남 (클립 길이와 무관)
 */
export function buildSceneAss(
  koText: string,
  heText: string | undefined,
  clipDurationSec = 8
): string {
  // 한국어: 구두점(쉼표·마침표) 우선 분할, 그 외 15자 기준 분할
  const koChunks = splitTextByPunctuation(koText, 15);
  const numChunks = koChunks.length;

  // 히브리어: 동일 청크 수로 균등 분할
  const heChunks = heText ? splitTextIntoChunks(heText, numChunks) : null;

  // ── 각 청크의 예상 발화 시간 계산 (TTS 속도 + SSML pause 반영) ──────────
  const chunkDurations = koChunks.map((chunk) => {
    const charCount = Math.max(1, chunk.replace(/\s/g, "").length);
    const trimmed = chunk.trimEnd();
    const breakSec = /[.\u3002]$/.test(trimmed) ? PERIOD_BREAK_SEC
                   : /[,\uff0c]$/.test(trimmed) ? COMMA_BREAK_SEC
                   : 0;
    return (charCount / CHARS_PER_SEC) + breakSec;
  });

  // 예상 총 발화 시간 (클립 길이를 초과하지 않도록 cap)
  const estimatedTotal = chunkDurations.reduce((a, b) => a + b, 0);
  const usable = Math.min(estimatedTotal, clipDurationSec - 0.4);

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 0

[V4+ Styles]
Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding
Style: Korean,Noto Sans CJK KR,70,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,4,2,2,30,30,50,1
Style: Hebrew,Noto Sans,58,&H0000D4FF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,4,2,2,30,30,130,1

[Events]
Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text`;

  const dialogues: string[] = [header];

  // 비율 보정: estimatedTotal이 usable보다 클 경우 비율 축소
  const scale = usable / estimatedTotal;

  let cursor = 0.3;
  for (let i = 0; i < numChunks; i++) {
    const chunkDur = chunkDurations[i] * scale;
    const chunkStart = cursor;
    const chunkEnd   = Math.min(cursor + chunkDur, clipDurationSec - 0.1);
    cursor += chunkDur;

    const s = toAssTs(chunkStart);
    const e = toAssTs(chunkEnd);
    const ko = koChunks[i];
    const he = heChunks ? heChunks[i] : null;

    if (ko) dialogues.push(`Dialogue: 0,${s},${e},Korean,,0,0,0,,${ko}`);
    if (he) dialogues.push(`Dialogue: 0,${s},${e},Hebrew,,0,0,0,,${he}`);
  }

  return dialogues.join("\n") + "\n";
}
