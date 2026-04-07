import ffmpeg from "fluent-ffmpeg";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { execSync } from "child_process";
import { buildSceneAss } from "../utils/srtParser";

/** ffprobe로 미디어 파일 총 길이(초) 반환 */
export function getMediaDuration(filePath: string): number {
  const out = execSync(
    `ffprobe -v error -show_entries format=duration -of csv=p=0 "${filePath}"`
  ).toString().trim();
  return parseFloat(out);
}

/**
 * 씬별 소프트 자막 트랙 삽입
 * - SRT 텍스트를 임시 파일로 저장 후 mov_text 스트림으로 삽입
 * - 폰트 설치 불필요, MP4 내 자막 트랙
 */
/**
 * 씬별 하드코딩(burned-in) 자막 삽입 — ASS 방식
 * - 한국어: 하단 중앙 (흰색)
 * - 히브리어: 한국어 위 (금색, FriBiDi RTL 자동처리)
 * - libass 필터로 영상 프레임에 직접 렌더링 → 모든 플레이어에서 보임
 */
export async function embedSubtitleToClip(
  clipPath: string,
  koSrtContent: string,
  outputPath: string,
  heSrtContent?: string
): Promise<void> {
  // SRT → 텍스트 추출 (타임코드·인덱스 줄 제거)
  const extractText = (srt: string) =>
    srt.split("\n").filter((l) => {
      const t = l.trim();
      return t && !/^\d+$/.test(t) && !/^\d{2}:\d{2}:\d{2}/.test(t);
    }).join(" ").trim();

  const koText = extractText(koSrtContent);
  const heText = heSrtContent ? extractText(heSrtContent) : undefined;

  // ASS 파일 생성 — srtParser.buildSceneAss 사용 (중복 제거)
  const clipDuration = getMediaDuration(clipPath);
  const assContent = buildSceneAss(koText, heText, clipDuration);

  const ts = Date.now();
  const tmpAss = path.join(os.tmpdir(), `sub_${ts}.ass`);
  fs.writeFileSync(tmpAss, assContent, "utf8");

  const cleanup = () => { if (fs.existsSync(tmpAss)) fs.unlinkSync(tmpAss); };

  // ASS 경로의 특수문자(콜론 등) 이스케이프
  const escapedAss = tmpAss.replace(/\\/g, "/").replace(/:/g, "\\:");

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(clipPath)
      .outputOptions([
        `-vf ass=${escapedAss}`,   // -vf 사용 시 -map 0:v:0 불필요 (필터가 대체)
        "-map 0:a:0?",             // 오디오만 명시적 매핑 (없으면 무시)
        "-c:v libx264",
        "-preset fast",
        "-crf 22",
        "-c:a copy",
      ])
      .output(outputPath)
      .on("end", () => { cleanup(); resolve(); })
      .on("error", (err) => { cleanup(); reject(err); })
      .run();
  });
}

/**
 * 나레이션 MP3에서 씬에 해당하는 구간을 잘라 클립에 합성
 * - segmentStartSec: 나레이션에서 시작 위치(초)
 * - segmentDurSec: 길이(초)
 */
export async function addNarrationSegmentToClip(
  clipPath: string,
  narrationPath: string,
  segmentStartSec: number,
  segmentDurSec: number,
  outputPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(clipPath)
      .input(narrationPath)
      .inputOptions([`-ss ${segmentStartSec}`, `-t ${segmentDurSec}`])  // 나레이션 구간 지정
      .outputOptions([
        "-map 0:v:0",
        "-map 1:a:0",
        "-c:v copy",
        "-c:a aac",
        "-b:a 128k",
        "-shortest",
      ])
      .output(outputPath)
      .on("end", () => resolve())
      .on("error", (err) => reject(err))
      .run();
  });
}

export async function mergeVideoWithNarration(
  videoPath: string,
  audioPath: string,
  outputPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(videoPath)
      .input(audioPath)
      .outputOptions([
        "-c:v copy",        // 영상 재인코딩 없이 복사
        "-c:a aac",         // 오디오 AAC 인코딩
        "-b:a 192k",
        "-shortest",        // 짧은 쪽에 맞춰 종료
        "-map 0:v:0",
        "-map 1:a:0",
      ])
      .output(outputPath)
      .on("end", () => resolve())
      .on("error", (err) => reject(err))
      .run();
  });
}

/**
 * BGM을 기존 영상에 낮은 볼륨으로 혼합 (그레고리안 성가용)
 * - bgmVolume: 0.0~1.0 (기본 0.10 = 10%)
 */
export async function mixWithBackgroundMusic(
  videoPath: string,
  bgmPath: string,
  outputPath: string,
  bgmVolume = 0.10
): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(videoPath)
      .input(bgmPath)
      .complexFilter([
        // BGM을 루프 처리하고 볼륨 조정 후 원본 오디오와 믹스
        `[1:a]volume=${bgmVolume},aloop=loop=-1:size=2e+09[bgm]`,
        `[0:a][bgm]amix=inputs=2:duration=first:dropout_transition=3[aout]`,
      ])
      .outputOptions([
        "-map 0:v:0",
        "-map [aout]",
        "-c:v copy",
        "-c:a aac",
        "-b:a 192k",
        "-shortest",
      ])
      .output(outputPath)
      .on("end", () => resolve())
      .on("error", (err) => reject(err))
      .run();
  });
}

export async function mergeVideoClips(
  clipPaths: string[],
  outputPath: string
): Promise<void> {
  if (clipPaths.length === 0) throw new Error("병합할 클립이 없습니다");

  const concatFile = path.join(os.tmpdir(), `concat_${Date.now()}.txt`);
  const content = clipPaths.map((p) => `file '${p}'`).join("\n");
  fs.writeFileSync(concatFile, content);

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(concatFile)
      .inputOptions(["-f concat", "-safe 0"])
      .outputOptions([
        "-c:v libx264",
        "-preset fast",
        "-crf 23",
        "-r 24",
        "-vf scale=1920:1080",
        "-pix_fmt yuv420p",
      ])
      .output(outputPath)
      .on("end", () => {
        fs.unlinkSync(concatFile);
        resolve();
      })
      .on("error", (err) => {
        if (fs.existsSync(concatFile)) fs.unlinkSync(concatFile);
        reject(err);
      })
      .run();
  });
}
