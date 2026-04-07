// RTL 임베딩 마커 (U+202B)
const RTL_MARK = "\u202B";
const LTR_MARK = "\u202A";
const PDF = "\u202C"; // Pop Directional Formatting

export function wrapHebrew(text: string): string {
  return `${RTL_MARK}${text}${PDF}`;
}

export function addUtf8Bom(content: string): string {
  return "\uFEFF" + content;
}

export function isHebrewChar(ch: string): boolean {
  const code = ch.charCodeAt(0);
  return code >= 0x0590 && code <= 0x05ff;
}
