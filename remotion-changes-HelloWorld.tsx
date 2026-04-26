import React, { useState, useEffect } from 'react';
import {
  AbsoluteFill,
  Video,
  Audio,
  Img,
  staticFile,
  useVideoConfig,
  useCurrentFrame,
  delayRender,
  continueRender,
} from 'remotion';
import logoSrc from './assets/logo.jpg';
// ── Vietnamese text replacement ──
function applyVietnameseReplacements(text: string): string {
  if (!text) return text;
  return text.replace(/엘로힘\(Elohim\)/g, "Elohim");
}


// ── Word-safe truncation for Vietnamese ──
function truncateVietnameseWordSafe(text: string, maxLength: number): string {
  if (!text || text.length <= maxLength) return text;
  
  // Cut at maxLength first
  let truncated = text.slice(0, maxLength);
  
  // Find the last space before maxLength
  const lastSpaceIndex = truncated.lastIndexOf(" ");
  
  // If there is a space and it is not too far from the beginning (at least 20 chars)
  if (lastSpaceIndex > 20) {
    return truncated.slice(0, lastSpaceIndex);
  }
  
  // If no suitable space found, check if we are cutting in the middle of a word
  // Look ahead to find the next space
  if (text[maxLength] && text[maxLength] !== " ") {
    const nextSpaceIndex = text.indexOf(" ", maxLength);
    // If next space is within 5 characters, include the whole word
    if (nextSpaceIndex !== -1 && nextSpaceIndex - maxLength <= 5) {
      return text.slice(0, nextSpaceIndex);
    }
  }
  
  // Default: use the original truncation
  return truncated;
}

// ── Frank Rühl Libre 폰트 로드 (FontFace API 직접 사용 — 확실한 로드 보장) ──
function useFrankRuhlLibre() {
  const [handle] = useState(() => delayRender('Loading Frank Rühl Libre font'));
  useEffect(() => {
    const url700 = staticFile('FrankRuhlLibre-700.ttf');
    const url900 = staticFile('FrankRuhlLibre-900.ttf');
    const face700 = new FontFace('Frank Ruhl Libre', `url(${url700})`, { weight: '700', style: 'normal' });
    const face900 = new FontFace('Frank Ruhl Libre', `url(${url900})`, { weight: '900', style: 'normal' });
    Promise.all([
      face700.load().then((f) => { document.fonts.add(f); }),
      face900.load().then((f) => { document.fonts.add(f); }),
    ]).then(() => continueRender(handle))
      .catch((err) => { console.error('[Font] Frank Ruhl Libre 로드 실패:', err); continueRender(handle); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
import { z } from 'zod';

export const myCompSchema = z.object({
  koreanText: z.string(),
  hebrewText: z.string(),
  vietnameseText: z.string().optional().default(''),
  language: z.enum(['ko', 'vi']).optional().default('ko'),
  videoFileName: z.string().optional().default(''),
  audioFileName: z.string().optional().default('narration.mp3'),
  subtitlesJson: z.string().optional().default(''),
  showSubtitle: z.boolean().optional().default(true),
  showNarration: z.boolean().optional().default(true),
  bgmFileName: z.string().optional().default(''),
  bgmVolume: z.number().optional().default(0.15),
  fontSizeScale: z.number().optional().default(100),
});

interface SubEntry {
  text: string;       // 한국어 자막
  heText?: string;    // 히브리어 자막 (구절 기반일 때 포함)
  viText?: string;    // 베트남어 자막
  startSec: number;
  endSec: number;
}

function isImageFile(name: string): boolean {
  return /\.(png|jpg|jpeg|webp|gif)$/i.test(name);
}

function isVideoFile(name: string): boolean {
  return /\.(mp4|webm|mov|avi)$/i.test(name);
}

/** Sefaria 편집 주석·단락 기호·HTML 엔티티·유니코드 제어문자 제거 */
function cleanHebrew(text: string): string {
  return text
    // 히브리어 칸틸레이션 마크 (트로프/악센트, U+0591-U+05AF) — 폰트 미지원 → □ 원인
    .replace(/[\u0591-\u05AF]/g, '')
    // 유니코드 양방향·방향 제어 문자 (□로 보이는 원인)
    .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, '')
    // 비표준 유니코드 공백 문자 → 일반 공백으로 정규화 (□로 렌더링되는 원인)
    .replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, ' ')
    // Sefaria 편집 주석 *(...)
    .replace(/\*([\(（][^)）]*[\)）])/g, '')
    // 괄호 안 히브리어 주석
    .replace(/\([\u0591-\u05FF\s,]+\)/g, '')
    // {ס}, {פ} 단락 기호
    .replace(/\{[^\}]*\}/g, '')
    // HTML 엔티티
    .replace(/&nbsp;/g, ' ')
    .replace(/&[a-zA-Z0-9#]+;/g, '')
    // HTML 태그
    .replace(/<[^>]*>/g, '')
    // 연속 공백
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** 한 줄 최대 글자 수 (화면 표시 기준) */

/** Split long text into multiple lines if needed */
function splitLongText(text: string, maxCharsPerLine: number): string[] {
  if (!text || text.length <= maxCharsPerLine) {
    return [text];
  }
  
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";
  
  for (const word of words) {
    if (currentLine.length + word.length + 1 <= maxCharsPerLine) {
      currentLine = currentLine ? currentLine + " " + word : word;
    } else {
      if (currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        // Word is too long, break it
        lines.push(word.substring(0, maxCharsPerLine));
        currentLine = word.substring(maxCharsPerLine);
      }
    }
  }
  
  if (currentLine) {
    lines.push(currentLine);
  }
  
  return lines.slice(0, 2); // Maximum 2 lines
}

/** Enhanced automatic subtitle adjustment - fits any text to screen width */
function adjustSubtitleToFit(text: string, maxWidth: number, baseFontSize: number, language: "ko" | "he" | "vi"): {
  fontSize: number;
  lines: string[];
  isWrapped: boolean;
} {
  if (!text) {
    return { fontSize: baseFontSize, lines: [""], isWrapped: false };
  }
  
  // Language-specific settings
  const langSettings = {
    ko: { charWidth: 1.0, minSize: 50, maxCharsPerLine: 50 },
    he: { charWidth: 0.7, minSize: 72, maxCharsPerLine: 60 },
    vi: { charWidth: 0.65, minSize: 65, maxCharsPerLine: 55 }
  };
  
  const settings = langSettings[language];
  
  // Try single line first with automatic font sizing
  let fontSize = calculateFontSize(text, maxWidth, baseFontSize);
  
  // If font becomes too small, use word wrapping
  if (fontSize < settings.minSize) {
    const lines = splitLongText(text, settings.maxCharsPerLine);
    const longestLine = lines.reduce((a, b) => a.length > b.length ? a : b, "");
    fontSize = Math.max(calculateFontSize(longestLine, maxWidth, baseFontSize), settings.minSize);
    
    return {
      fontSize,
      lines: lines.slice(0, 2), // Maximum 2 lines
      isWrapped: true
    };
  }
  
  return {
    fontSize,
    lines: [text],
    isWrapped: false
  };
}

/** Calculate optimal font size to fit text in single line */
function calculateFontSize(text: string, maxWidth: number, baseFontSize: number): number {
  if (!text) return baseFontSize;
  
  // Detect text type for better width estimation
  const isHebrew = /[\u0590-\u05FF]/.test(text);
  const isKorean = /[\uAC00-\uD7AF]/.test(text);
  const isVietnamese = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(text);
  
  // Character width ratios (relative to font size)
  let charWidthRatio = 0.6; // Default for Latin
  if (isHebrew) charWidthRatio = 0.7;        // Hebrew chars are wider
  else if (isKorean) charWidthRatio = 1.0;   // Korean chars are square
  else if (isVietnamese) charWidthRatio = 0.65; // Vietnamese with diacritics slightly wider
  
  // Calculate estimated width
  const estimatedWidth = text.length * baseFontSize * charWidthRatio;
  
  // If text fits, return the base font size
  if (estimatedWidth <= maxWidth) {
    return baseFontSize;
  }
  
  // Calculate scaled font size to fit within max width
  const scaleFactor = maxWidth / estimatedWidth;
  const scaledSize = Math.floor(baseFontSize * scaleFactor);
  
  // Set minimum font sizes to maintain readability
  const minSize = isHebrew ? 72 : (isKorean ? 50 : (isVietnamese ? 65 : 40));
  
  return Math.max(scaledSize, minSize);
}

const HE_DISPLAY_MAX = 80;  // 절 단위 전체 텍스트 한 줄 표시 (히브리어 1절 평균 40-70자)
const LINE_MAX = 40;         // 한국어·영어 글자 수 기준

/** 텍스트를 maxChars 이내 단어 경계로 줄 분할 (영어·한국어·히브리어 공통) */
function splitToLines(text: string, maxChars = LINE_MAX): string[] {
  if (!text) return [];
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (!current) {
      current = word;
    } else if (current.length + 1 + word.length <= maxChars) {
      current += ' ' + word;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [text];
}

export const HelloWorld: React.FC<z.infer<typeof myCompSchema>> = ({
  koreanText,
  hebrewText,
  vietnameseText = '',
  language = 'ko',
  videoFileName = '',
  audioFileName = 'narration.mp3',
  subtitlesJson = '',
  showSubtitle = true,
  showNarration = true,
  bgmFileName = '',
  bgmVolume = 0.15,
  fontSizeScale = 100,
}) => {
  useFrankRuhlLibre();
  const { width, height, fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const currentSec = frame / fps;

  const [mediaError, setMediaError] = useState(false);
  const [audioError, setAudioError] = useState(false);
  const [bgmError, setBgmError] = useState(false);

  const fileName = typeof videoFileName === 'string' ? videoFileName.trim() : '';
  const hasAudio = !audioError && typeof audioFileName === 'string' && audioFileName.trim() !== '';
  const hasBgm = !bgmError && typeof bgmFileName === 'string' && bgmFileName.trim() !== '';
  const hasMedia = !mediaError && fileName !== '';
  const showImage = hasMedia && isImageFile(fileName);
  const showVideo = hasMedia && isVideoFile(fileName);

  // 자막 타이밍 파싱
  let subs: SubEntry[] = [];
  if (subtitlesJson) {
    try { subs = JSON.parse(subtitlesJson); } catch {}
  }

  // 현재 시간에 해당하는 자막 찾기
  const currentSub = subs.find(
    (s) => currentSec >= s.startSec && currentSec < s.endSec
  );

  // 갭 기간 동안 sticky 표시: 현재 시간보다 이전에 시작된 마지막 자막
  const passedSubs = subs.filter((s) => currentSec >= s.startSec);
  const prevSub = passedSubs.length > 0 ? passedSubs[passedSubs.length - 1] : undefined;

  // 언어별 자막 텍스트 결정
  const isVi = language === 'vi';

  // 한국어 자막이 실제로 있는지 확인 (영어 TTS로 생성된 경우 text가 비어 있을 수 있음)
  const hasKoSubs = subs.some((s) => s.text && s.text.trim() !== '');

  const availableWidth = width - 200; // Shared available width for all subtitles
  const displayKo = (() => {
    if (subs.length === 0) {
      // 자막 없음 → static 텍스트 표시 (최대 한 줄 분량만)
      const src = isVi ? truncateVietnameseWordSafe(applyVietnameseReplacements(vietnameseText), 45) : koreanText;
      if (!src) return '';
      // 첫 LINE_MAX 자 이내 첫 줄만 표시 (긴 패시지 전체 표시 방지)
      const firstLine = splitToLines(src, LINE_MAX)[0] ?? '';
      return firstLine;
    }
    if (isVi) {
      // 베트남어 모드: viText 우선, fallback text, 갭이면 직전 viText
      if (currentSub !== undefined) return truncateVietnameseWordSafe(applyVietnameseReplacements(currentSub.viText ?? currentSub.text), 45);
      return prevSub ? truncateVietnameseWordSafe(applyVietnameseReplacements(prevSub.viText ?? prevSub.text ?? ''), 45) : '';
    } else {
      // 한국어 모드: text 사용
      // text가 모두 비어있어도 static koreanText 대신 '' 반환 (긴 패시지 오버플로우 방지)
      if (!hasKoSubs) return '';
      if (currentSub !== undefined) return (currentSub.text || '').slice(0, 40);
      // 갭 구간: 직전 자막 sticky 표시
      return (prevSub?.text ?? '').slice(0, 40);
    }
  })();

  // 히브리어: 현재 구간 heText → 갭이면 직전 heText → 없으면 static
  const rawHe = subs.length === 0
    ? hebrewText
    : currentSub !== undefined
      ? (currentSub.heText ?? '')
      : (prevSub?.heText ?? '');
  const displayHe = cleanHebrew(rawHe).slice(0, 40);

  return (
    <AbsoluteFill style={{ backgroundColor: '#000', width, height }}>
      {/* 나레이션 오디오 — showNarration=false 이면 무음 */}
      {hasAudio && showNarration && (
        <Audio
          src={staticFile(audioFileName)}
          loop={false}
          onError={() => setAudioError(true)}
        />
      )}

      {/* BGM 오디오 — bgmFileName 있을 때만, 음량은 bgmVolume(0~1) */}
      {hasBgm && (
        <Audio
          src={staticFile(bgmFileName)}
          loop={true}
          volume={bgmVolume}
          onError={() => setBgmError(true)}
        />
      )}

      {/* 배경 — 전체 화면 */}
      {showVideo ? (
        <Video
          src={staticFile(fileName)}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          muted
          loop={false}
          onError={() => setMediaError(true)}
        />
      ) : showImage ? (
        <Img
          src={staticFile(fileName)}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          onError={() => setMediaError(true)}
        />
      ) : (
        <AbsoluteFill
          style={{
            background: 'linear-gradient(135deg, #0a0a1a 0%, #1a0a2e 40%, #0d1a10 100%)',
          }}
        />
      )}

      {/* 오른쪽 상단 로고 아이콘 — 항상 표시 (번들 포함) */}
      <Img
        src={logoSrc}
        style={{
          position: 'absolute',
          top: 28,
          right: 28,
          width: 220,
          height: 124,
          objectFit: 'cover',
          borderRadius: 12,
          opacity: 0.90,
          zIndex: 10,
          boxShadow: '0 4px 20px rgba(0,0,0,0.70)',
        }}
      />

      {/* ── 자막 영역 — 절대 위치로 고정 (한국어 유무와 무관) ── */}
      <AbsoluteFill style={{ position: 'relative' }}>

        {/* 히브리어 — bottom 165px 고정, 절 단위 전체 텍스트 표시. showSubtitle=false 이면 숨김 */}
        {showSubtitle && displayHe ? (() => {
          const baseHeSize = 108; // Base Hebrew font size
          // Enhanced automatic adjustment for Hebrew
          const scaledHeSize = Math.round(baseHeSize * (fontSizeScale / 100));
          const heLines = [displayHe]; // Single line for Hebrew
          const heFontSize = scaledHeSize; // Use scaled size directly without adjustment
          console.log("[Hebrew] Direct size:", heFontSize, "from base:", baseHeSize, "with scale:", fontSizeScale);
          console.log("[DEBUG] Hebrew font size:", heFontSize, "from base:", scaledHeSize, "with scale:", fontSizeScale);
          const heLineHeight = heFontSize * 1.5;
          const heBlockHeight = heLines.length * heLineHeight;
          const heBottom = 200;
          return (
            <div
              style={{
                position: 'absolute',
                bottom: heBottom,
                left: 0,
                right: 0,
                paddingLeft: 80,
                paddingRight: 60,
                textAlign: 'right',
                direction: 'rtl',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: 0,
              }}
            >
              {heLines.map((line, idx) => (
                <span
                  key={idx}
                  style={{
                    fontFamily: '"Frank Ruhl Libre", serif',
                    color: '#00E676',
                    fontSize: heFontSize,
                    fontWeight: 900,
                    textShadow: '0 2px 8px rgba(0,0,0,0.90)',
                    lineHeight: 1.45,
                    letterSpacing: '0.01em',
                    whiteSpace: 'nowrap',
                    display: 'block',
                  }}
                >
                  {line}
                </span>
              ))}
            </div>
          );
        })() : null}

        {/* 한국어 / 영어 자막 — 하단에서 60px 위로, 40자 기준 자동 줄 분할. showSubtitle=false 이면 숨김 */}
        {showSubtitle && displayKo ? (() => {
          // Calculate available width for subtitle
          const baseFontSize = isVi ? 110 : 80;
          const scaledSize = Math.round(baseFontSize * (fontSizeScale / 100));
          
          // Enhanced automatic adjustment for Korean/Vietnamese
          const language = isVi ? "vi" : "ko";
          const adjustment = adjustSubtitleToFit(displayKo, availableWidth, scaledSize, language);
          const lines = adjustment.lines;
          const fontSize = adjustment.fontSize;
          console.log("[AUTO-ADJUST]", language.toUpperCase() + ":", displayKo.length, "chars →", adjustment.lines.length, "lines, fontSize:", fontSize, "wrapped:", adjustment.isWrapped);
          
          const bottomPos = 60;
          return (
            <div
              style={{
                position: 'absolute',
                bottom: bottomPos,
                left: 0,
                right: 0,
                padding: '0 80px',
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 0,
              }}
            >
              {lines.map((line, idx) => (
                <span
                  key={idx}
                  style={{
                    color: '#ffffff',
                    fontSize,
                    fontWeight: 700,
                    fontFamily: isVi ? '"Arial", "Helvetica Neue", sans-serif' : undefined,
                    textShadow: '0 2px 10px rgba(0,0,0,0.95), 0 0 30px rgba(0,0,0,0.7)',
                    lineHeight: 1.5,
                    whiteSpace: 'nowrap',
                    display: 'block',
                  }}
                >
                  {line}
                </span>
              ))}
            </div>
          );
        })() : null}

      </AbsoluteFill>
    </AbsoluteFill>
  );
};
