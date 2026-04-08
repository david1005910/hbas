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
  // 나머지 빈 슬롯 채우기
  while (result.length < chunks) result.push("");
  return result;
}

/**
 * 한국어 + 히브리어 자막을 합쳐 ASS 형식으로 생성
 * - 자막 텍스트를 SUBTITLE_CHUNKS 등분하여 클립 전체에 순서대로 표시
 * - 한국어: 하단 중앙 (흰색)
 * - 히브리어: 한국어 위 (금색, RTL 자동 처리)
 */
const SUBTITLE_CHUNKS = 6; // 씬당 자막을 몇 등분으로 나눌지

export function buildSceneAss(
  koText: string,
  heText: string | undefined,
  clipDurationSec = 8
): string {
  const usable = Math.max(0.5, clipDurationSec - 0.5);
  const chunkDur = usable / SUBTITLE_CHUNKS;

  const koChunks = splitTextIntoChunks(koText, SUBTITLE_CHUNKS);
  const heChunks = heText ? splitTextIntoChunks(heText, SUBTITLE_CHUNKS) : null;

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 0

[V4+ Styles]
Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding
Style: Korean,Noto Sans CJK KR,44,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,3,1,2,30,30,30,1
Style: Hebrew,Noto Sans,38,&H0000D4FF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,3,1,2,30,30,90,1

[Events]
Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text`;

  const dialogues: string[] = [header];

  for (let i = 0; i < SUBTITLE_CHUNKS; i++) {
    const s = toAssTs(0.5 + i * chunkDur);
    const e = toAssTs(0.5 + (i + 1) * chunkDur);
    const ko = koChunks[i];
    const he = heChunks ? heChunks[i] : null;

    if (ko) dialogues.push(`Dialogue: 0,${s},${e},Korean,,0,0,0,,${ko}`);
    if (he) dialogues.push(`Dialogue: 0,${s},${e},Hebrew,,0,0,0,,${he}`);
  }

  return dialogues.join("\n") + "\n";
}
