import ffmpeg from "fluent-ffmpeg";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

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
