import ffmpeg from "fluent-ffmpeg";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { execSync } from "child_process";

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
 * 씬별 소프트 자막 트랙 삽입 (한국어 + 히브리어 동시 지원)
 * - koSrtContent: 한국어 SRT (필수)
 * - heSrtContent: 히브리어 SRT (선택, 있으면 두 번째 트랙으로 추가)
 */
export async function embedSubtitleToClip(
  clipPath: string,
  koSrtContent: string,
  outputPath: string,
  heSrtContent?: string
): Promise<void> {
  const ts = Date.now();
  const tmpKo = path.join(os.tmpdir(), `sub_ko_${ts}.srt`);
  const tmpHe = heSrtContent ? path.join(os.tmpdir(), `sub_he_${ts}.srt`) : null;

  fs.writeFileSync(tmpKo, koSrtContent.replace(/^\uFEFF/, ""), "utf8");
  if (tmpHe && heSrtContent) {
    fs.writeFileSync(tmpHe, heSrtContent.replace(/^\uFEFF/, ""), "utf8");
  }

  const cleanup = () => {
    if (fs.existsSync(tmpKo)) fs.unlinkSync(tmpKo);
    if (tmpHe && fs.existsSync(tmpHe)) fs.unlinkSync(tmpHe);
  };

  return new Promise((resolve, reject) => {
    const cmd = ffmpeg()
      .input(clipPath)
      .input(tmpKo);

    if (tmpHe) cmd.input(tmpHe);

    const outputOpts = [
      "-map 0:v:0",
      "-map 0:a:0?",          // Veo 클립은 오디오 없을 수 있음
      "-map 1:s:0",           // 한국어 자막 트랙
    ];
    if (tmpHe) outputOpts.push("-map 2:s:0");   // 히브리어 자막 트랙

    outputOpts.push(
      "-c:v copy",
      "-c:a copy",
      "-c:s mov_text",
      "-metadata:s:s:0 language=kor",
      "-metadata:s:s:0 title=Korean",
    );
    if (tmpHe) {
      outputOpts.push(
        "-metadata:s:s:1 language=heb",
        "-metadata:s:s:1 title=Hebrew",
      );
    }

    cmd
      .outputOptions(outputOpts)
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
