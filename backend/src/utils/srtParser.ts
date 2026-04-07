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
  // sceneNumber에 해당하는 항목 (index 또는 순서)
  const entry = entries.find((e) => e.index === sceneNumber) ?? entries[sceneNumber - 1];
  if (!entry) return "";

  const start = 0.5;
  const end = Math.max(start + 1, clipDurationSec - 0.5);

  return `1\n${toTs(start)} --> ${toTs(end)}\n${entry.text}\n`;
}
