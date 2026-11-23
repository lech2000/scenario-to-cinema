import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export function findRaeaBinary(): string | null {
  if (process.env.SKIP_RAEA === "1") return null;
  const candidates = [
    process.env.RAEA_BIN,
    path.join(os.homedir(), ".local/bin/raea"),
    "/opt/homebrew/bin/raea",
    "/usr/local/bin/raea",
  ].filter((p): p is string => Boolean(p));

  for (const bin of candidates) {
    if (fs.existsSync(bin)) return bin;
  }
  return null;
}

export function findFfmpegBinary(): string | null {
  const candidates = [
    process.env.FFMPEG_BIN,
    "/opt/homebrew/bin/ffmpeg",
    "/usr/local/bin/ffmpeg",
    "/usr/bin/ffmpeg",
  ].filter((p): p is string => Boolean(p));

  for (const bin of candidates) {
    if (fs.existsSync(bin)) return bin;
  }
  return null;
}

export interface RaeaRenderResult {
  renderedLive: boolean;
  pngFile?: string;
  mp4File?: string;
  durationMs: number;
  note?: string;
}

export async function renderShotWithRaea(params: {
  tsxPath: string;
  outDir: string;
  shotId: string;
  keyframe?: number;
  renderMp4?: boolean;
}): Promise<RaeaRenderResult> {
  const start = Date.now();
  const raeaBin = findRaeaBinary();
  if (!raeaBin) {
    return {
      renderedLive: false,
      durationMs: Date.now() - start,
      note: "raea CLI не найден (или SKIP_RAEA=1); скомпилирован только TSX.",
    };
  }

  const safeId = params.shotId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const pngName = `${safeId}.png`;
  const pngPath = path.join(params.outDir, pngName);
  const frame = params.keyframe ?? 48;

  await execFileAsync(
    raeaBin,
    ["render", params.tsxPath, "--frame", String(frame), "-o", pngPath],
    { timeout: 60_000 }
  );

  let mp4Name: string | undefined;
  if (params.renderMp4) {
    mp4Name = `${safeId}.mp4`;
    const mp4Path = path.join(params.outDir, mp4Name);
    await execFileAsync(raeaBin, ["render", params.tsxPath, "-o", mp4Path], {
      timeout: 120_000,
    });
  }

  return {
    renderedLive: true,
    pngFile: pngName,
    mp4File: mp4Name,
    durationMs: Date.now() - start,
  };
}

export async function concatMp4Clips(params: {
  mp4Paths: string[];
  outPath: string;
}): Promise<{ ok: boolean; bytes?: number; note?: string }> {
  const ffmpegBin = findFfmpegBinary();
  if (!ffmpegBin || params.mp4Paths.length === 0) {
    return { ok: false, note: "ffmpeg недоступен или нет MP4-клипов для склейки." };
  }

  if (params.mp4Paths.length === 1) {
    fs.copyFileSync(params.mp4Paths[0], params.outPath);
    return { ok: true, bytes: fs.statSync(params.outPath).size };
  }

  const listPath = `${params.outPath}.concat.txt`;
  const listBody = params.mp4Paths
    .map((p) => `file '${p.replace(/'/g, "'\\''")}'`)
    .join("\n");
  fs.writeFileSync(listPath, listBody, "utf-8");

  try {
    // Re-encode at ~1.8 Mbps H.264 to stay comfortably under FixAR's 32 MB attachment cap
    await execFileAsync(
      ffmpegBin,
      [
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        listPath,
        "-c:v",
        "libx264",
        "-b:v",
        "1800k",
        "-maxrate",
        "2000k",
        "-bufsize",
        "3600k",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        params.outPath,
      ],
      { timeout: 120_000 }
    );
    return { ok: true, bytes: fs.statSync(params.outPath).size };
  } finally {
    if (fs.existsSync(listPath)) fs.unlinkSync(listPath);
  }
}
