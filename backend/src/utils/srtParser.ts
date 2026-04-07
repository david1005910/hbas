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
 * 한국어 + 히브리어 자막을 합쳐 ASS 형식으로 생성
 * - 한국어: 하단 중앙 (흰색)
 * - 히브리어: 한국어 위 (금색, RTL 자동 처리)
 */
export function buildSceneAss(
  koText: string,
  heText: string | undefined,
  clipDurationSec = 8
): string {
  const start = toAssTs(0.5);
  const end   = toAssTs(Math.max(1.5, clipDurationSec - 0.5));

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

  const lines: string[] = [header];
  lines.push(`Dialogue: 0,${start},${end},Korean,,0,0,0,,${koText}`);
  if (heText) {
    // RTL 마커 + 히브리어 텍스트
    lines.push(`Dialogue: 0,${start},${end},Hebrew,,0,0,0,,${heText}`);
  }
  return lines.join("\n") + "\n";
}
