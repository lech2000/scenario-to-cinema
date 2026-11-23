import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { EpisodeCredits } from "@cinema-rpg/shared";

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

/**
 * Muxes a silent `raea` MP4 clip with a synthesized multi-voice WAV track and
 * optional SRT soft subtitle stream (`mov_text`) in place.
 */
export async function muxVideoWithAudioAndSubs(params: {
  mp4Path: string;
  wavPath: string;
  srtPath?: string;
}): Promise<boolean> {
  const ffmpegBin = findFfmpegBinary();
  if (!ffmpegBin || !fs.existsSync(params.mp4Path) || !fs.existsSync(params.wavPath)) {
    return false;
  }

  const tmpOut = `${params.mp4Path}.muxed.mp4`;
  const hasSrt = Boolean(params.srtPath && fs.existsSync(params.srtPath));

  const args = [
    "-y",
    "-i",
    params.mp4Path,
    "-i",
    params.wavPath,
    ...(hasSrt ? ["-i", params.srtPath!] : []),
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
    ...(hasSrt ? ["-map", "2:0"] : []),
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-ac",
    "2",
    ...(hasSrt ? ["-c:s", "mov_text", "-metadata:s:s:0", "language=rus"] : []),
    "-shortest",
    "-movflags",
    "+faststart",
    tmpOut,
  ];

  await execFileAsync(ffmpegBin, args, { timeout: 60_000 });
  fs.renameSync(tmpOut, params.mp4Path);
  return true;
}

export async function concatMp4Clips(params: {
  mp4Paths: string[];
  episodeWavPath?: string;
  episodeSrtPath?: string;
  outPath: string;
}): Promise<{ ok: boolean; bytes?: number; note?: string }> {
  const ffmpegBin = findFfmpegBinary();
  if (!ffmpegBin || params.mp4Paths.length === 0) {
    return { ok: false, note: "ffmpeg недоступен или нет MP4-клипов для склейки." };
  }

  const hasAudio = Boolean(params.episodeWavPath && fs.existsSync(params.episodeWavPath));
  const hasSrt = Boolean(params.episodeSrtPath && fs.existsSync(params.episodeSrtPath));

  if (params.mp4Paths.length === 1 && !hasAudio && !hasSrt) {
    fs.copyFileSync(params.mp4Paths[0], params.outPath);
    return { ok: true, bytes: fs.statSync(params.outPath).size };
  }

  const listPath = `${params.outPath}.concat.txt`;
  const listBody = params.mp4Paths
    .map((p) => `file '${p.replace(/'/g, "'\\''")}'`)
    .join("\n");
  fs.writeFileSync(listPath, listBody, "utf-8");

  try {
    // Re-encode video at ~1.8 Mbps H.264 + AAC 128k + mov_text subs (stays under FixAR's 32 MB cap)
    const args: string[] = [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listPath,
      ...(hasAudio ? ["-i", params.episodeWavPath!] : []),
      ...(hasSrt ? ["-i", params.episodeSrtPath!] : []),
      "-map",
      "0:v:0",
      ...(hasAudio ? ["-map", "1:a:0"] : []),
      ...(hasSrt ? ["-map", hasAudio ? "2:0" : "1:0"] : []),
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
      ...(hasAudio ? ["-c:a", "aac", "-b:a", "128k", "-ac", "2"] : ["-an"]),
      ...(hasSrt ? ["-c:s", "mov_text", "-metadata:s:s:0", "language=rus"] : []),
      "-movflags",
      "+faststart",
      params.outPath,
    ];

    await execFileAsync(ffmpegBin, args, { timeout: 120_000 });
    return { ok: true, bytes: fs.statSync(params.outPath).size };
  } finally {
    if (fs.existsSync(listPath)) fs.unlinkSync(listPath);
  }
}

function findUnicodeFontPath(): string | null {
  const candidates = [
    "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/TTF/DejaVuSans.ttf",
    "/usr/share/fonts/opentype/noto/NotoSans-Regular.ttf",
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

async function probeVideoDimensions(
  videoPath?: string
): Promise<{ width: number; height: number }> {
  if (!videoPath || !fs.existsSync(videoPath)) {
    return { width: 1280, height: 720 };
  }
  const ffprobeCandidates = [
    process.env.FFPROBE_BIN,
    "/opt/homebrew/bin/ffprobe",
    "/usr/local/bin/ffprobe",
    "/usr/bin/ffprobe",
  ].filter((p): p is string => Boolean(p));
  const ffprobeBin = ffprobeCandidates.find((p) => fs.existsSync(p));
  if (!ffprobeBin) return { width: 1280, height: 720 };

  try {
    const { stdout } = await execFileAsync(
      ffprobeBin,
      [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height",
        "-of",
        "csv=s=x:p=0",
        videoPath,
      ],
      { timeout: 10_000 }
    );
    const [wStr, hStr] = stdout.trim().split("x");
    const width = Number(wStr);
    const height = Number(hStr);
    if (width >= 160 && height >= 120) {
      return { width, height };
    }
  } catch {
    // Fallback to 720p
  }
  return { width: 1280, height: 720 };
}

function escapeFFmpegFilterArg(val: string): string {
  return val.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

/**
 * Generates a cinematic End Credits MP4 slate matching the episode's resolution & 24 fps,
 * rendering Cyrillic/Latin typography via FFmpeg `drawtext` (with graceful `color+fade` fallback).
 */
export async function renderCreditsClipMp4(params: {
  credits: EpisodeCredits;
  outPath: string;
  matchVideoPath?: string;
}): Promise<{ ok: boolean; durationSec: number }> {
  const durationSec = Math.max(2, Math.min(12, Math.round(params.credits.durationSec || 4)));
  const ffmpegBin = findFfmpegBinary();
  if (!ffmpegBin) {
    return { ok: false, durationSec };
  }

  const { width, height } = await probeVideoDimensions(params.matchVideoPath);
  const fadeOutStart = Math.max(0.8, durationSec - 0.7).toFixed(2);
  const txtPath = `${params.outPath}.credits.txt`;
  const lines = [
    `«${params.credits.episodeTitle}»`,
    params.credits.subtitle,
    "",
    ...(params.credits.starring.length > 0
      ? ["В ролях:", ...params.credits.starring.slice(0, 4), ""]
      : []),
    `Режиссёр: ${params.credits.directedBy}`,
    params.credits.footerNote,
  ];
  fs.writeFileSync(txtPath, lines.join("\n"), "utf-8");

  const fontPath = findUnicodeFontPath();
  try {
    if (fontPath) {
      const fontSize = Math.max(18, Math.round(height / 27));
      const vf = [
        `drawtext=fontfile='${escapeFFmpegFilterArg(fontPath)}':textfile='${escapeFFmpegFilterArg(txtPath)}':fontcolor=#eef4f0:fontsize=${fontSize}:line_spacing=10:x=(w-text_w)/2:y=(h-text_h)/2`,
        `fade=t=in:st=0:d=0.6`,
        `fade=t=out:st=${fadeOutStart}:d=0.6`,
      ].join(",");

      try {
        await execFileAsync(
          ffmpegBin,
          [
            "-y",
            "-f",
            "lavfi",
            "-i",
            `color=c=#0f1312:s=${width}x${height}:r=24:d=${durationSec}`,
            "-vf",
            vf,
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            params.outPath,
          ],
          { timeout: 30_000 }
        );
        return { ok: true, durationSec };
      } catch {
        // Fall through to plain slate if drawtext is unavailable
      }
    }

    await execFileAsync(
      ffmpegBin,
      [
        "-y",
        "-f",
        "lavfi",
        "-i",
        `color=c=#0f1312:s=${width}x${height}:r=24:d=${durationSec}`,
        "-vf",
        `fade=t=in:st=0:d=0.5,fade=t=out:st=${fadeOutStart}:d=0.5`,
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        params.outPath,
      ],
      { timeout: 30_000 }
    );
    return { ok: true, durationSec };
  } finally {
    if (fs.existsSync(txtPath)) fs.unlinkSync(txtPath);
  }
}
