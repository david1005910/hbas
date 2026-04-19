import { wrapHebrew } from "./hebrewUtils";

function secondsToSrtTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.round((sec % 1) * 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad3(ms)}`;
}

function pad(n: number) { return String(n).padStart(2, "0"); }
function pad3(n: number) { return String(n).padStart(3, "0"); }

export interface SrtEntry {
  index: number;
  startSec: number;
  endSec: number;
  text: string;
  isHebrew?: boolean;
}

export function buildSrtContent(entries: SrtEntry[], isHebrew = false): string {
  return entries
    .map((e) => {
      // 빈 히브리어 텍스트는 wrapHebrew 처리 안 함 (빈 문자열에 wrapHebrew 적용 시 \u202B\u202C만 남아 잘못된 heText 생성됨)
      const text = isHebrew ? (e.text ? wrapHebrew(e.text) : "") : e.text;
      return `${e.index}\n${secondsToSrtTime(e.startSec)} --> ${secondsToSrtTime(e.endSec)}\n${text}\n`;
    })
    .join("\n");
}

export function distributeTiming(
  sceneCount: number,
  targetDurationSec: number
): Array<{ startSec: number; endSec: number }> {
  const perScene = targetDurationSec / sceneCount;
  return Array.from({ length: sceneCount }, (_, i) => ({
    startSec: i * perScene,
    endSec: (i + 1) * perScene - 0.5,
  }));
}
