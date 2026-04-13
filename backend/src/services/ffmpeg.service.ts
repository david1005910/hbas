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
        "-preset ultrafast",  // fast→ultrafast: 자막 번인 인코딩 속도 5배 향상
        "-crf 23",
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

/**
 * 영상 클립의 마지막 프레임을 JPEG 파일로 추출
 * - 연속 클립 체인에서 이전 클립의 마지막 장면을 다음 클립 입력 이미지로 사용
 */
export async function extractLastFrame(clipPath: string, outputPath: string): Promise<void> {
  const duration = getMediaDuration(clipPath);
  const seekTo = Math.max(0, duration - 0.15); // 마지막 프레임 (0.15초 전)
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(clipPath)
      .inputOptions([`-ss ${seekTo}`])
      .outputOptions(["-vframes 1", "-f image2"])
      .output(outputPath)
      .on("end", () => resolve())
      .on("error", (err) => reject(err))
      .run();
  });
}

/**
 * 지정 길이(초)의 무음 MP3 파일 생성 (나레이션 구두점 pause용)
 */
export async function generateSilenceMp3(durationSec: number, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(`aevalsrc=0:c=mono:r=24000:d=${durationSec}`)
      .inputOptions(["-f lavfi"])
      .outputOptions(["-c:a libmp3lame", "-q:a 2"])
      .output(outputPath)
      .on("end", () => resolve())
      .on("error", (err) => reject(err))
      .run();
  });
}

/**
 * MP3 파일 목록을 순서대로 연결 (나레이션 구간 + 묵음 이어붙이기)
 */
export async function concatAudioFiles(audioPaths: string[], outputPath: string): Promise<void> {
  if (audioPaths.length === 0) throw new Error("연결할 오디오 파일이 없습니다");
  if (audioPaths.length === 1) {
    fs.copyFileSync(audioPaths[0], outputPath);
    return;
  }

  const concatFile = path.join(os.tmpdir(), `concat_audio_${Date.now()}.txt`);
  fs.writeFileSync(concatFile, audioPaths.map((p) => `file '${p}'`).join("\n"));

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(concatFile)
      .inputOptions(["-f concat", "-safe 0"])
      .outputOptions(["-c:a libmp3lame", "-q:a 2"])
      .output(outputPath)
      .on("end", () => { try { fs.unlinkSync(concatFile); } catch {} resolve(); })
      .on("error", (err) => { try { fs.unlinkSync(concatFile); } catch {} reject(err); })
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

  const cleanup = () => { if (fs.existsSync(concatFile)) fs.unlinkSync(concatFile); };

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(concatFile)
      .inputOptions(["-f concat", "-safe 0"])
      .outputOptions([
        // 스트림 복사 — 디코딩/인코딩 없이 연결 (메모리 최소화, 11클립도 수초 내 완료)
        "-c copy",
        "-map 0",
        "-movflags +faststart",
        "-max_muxing_queue_size 9999",
      ])
      .output(outputPath)
      .on("end", () => { cleanup(); resolve(); })
      .on("error", (err) => { cleanup(); reject(err); })
      .run();
  });
}
