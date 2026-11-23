import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { CharacterProfile, DialogueLine, SubtitleCue } from "@cinema-rpg/shared";
import type { AudioProvider } from "./index.js";

const execFileAsync = promisify(execFile);

export const AUDIO_SAMPLE_RATE = 24_000;

export interface RoleLineInput {
  speakerId: string;
  speakerName: string;
  role: CharacterProfile["role"] | "narrator";
  voiceId: string;
  text: string;
  emotion: DialogueLine["emotion"];
}

export interface SynthesizedTurnAudio {
  wavPath: string;
  srtPath: string;
  vttPath: string;
  durationSec: number;
  durationInFrames: number;
  cues: SubtitleCue[];
  providerName: string;
}

function findBinary(candidates: Array<string | undefined>): string | null {
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c;
  }
  return null;
}

export function findFfprobeBin(): string | null {
  return findBinary([
    process.env.FFPROBE_BIN,
    "/opt/homebrew/bin/ffprobe",
    "/usr/local/bin/ffprobe",
    "/usr/bin/ffprobe",
  ]);
}

export function findFfmpegBin(): string | null {
  return findBinary([
    process.env.FFMPEG_BIN,
    "/opt/homebrew/bin/ffmpeg",
    "/usr/local/bin/ffmpeg",
    "/usr/bin/ffmpeg",
  ]);
}

export function findMacSayBin(): string | null {
  if (process.env.FORCE_SYNTH_TTS === "1") return null;
  if (os.platform() !== "darwin") return null;
  return findBinary(["/usr/bin/say"]);
}

/**
 * Encodes mono 16-bit PCM samples at `AUDIO_SAMPLE_RATE` (24 kHz) into a valid RIFF WAV buffer.
 */
export function encodeMonoWav(samples: Int16Array, sampleRate = AUDIO_SAMPLE_RATE): Buffer {
  const dataSize = samples.length * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // Mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28); // Byte rate
  buf.writeUInt16LE(2, 32); // Block align
  buf.writeUInt16LE(16, 34); // Bits per sample
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples.length; i++) {
    buf.writeInt16LE(samples[i], 44 + i * 2);
  }
  return buf;
}

/**
 * Decodes a 16-bit mono RIFF WAV buffer into an Int16Array of PCM samples.
 */
export function decodeMonoWavSamples(wavBuf: Buffer): {
  samples: Int16Array;
  sampleRate: number;
} {
  if (wavBuf.length < 44 || wavBuf.toString("ascii", 0, 4) !== "RIFF") {
    throw new Error("Invalid RIFF WAV buffer");
  }
  let offset = 12;
  let sampleRate = AUDIO_SAMPLE_RATE;
  while (offset + 8 <= wavBuf.length) {
    const chunkId = wavBuf.toString("ascii", offset, offset + 4);
    const chunkSize = wavBuf.readUInt32LE(offset + 4);
    if (chunkId === "fmt ") {
      sampleRate = wavBuf.readUInt32LE(offset + 12);
    } else if (chunkId === "data") {
      const start = offset + 8;
      const byteLen = Math.min(chunkSize, wavBuf.length - start);
      const count = Math.floor(byteLen / 2);
      const out = new Int16Array(count);
      for (let i = 0; i < count; i++) {
        out[i] = wavBuf.readInt16LE(start + i * 2);
      }
      return { samples: out, sampleRate };
    }
    offset += 8 + chunkSize + (chunkSize % 2);
  }
  throw new Error("WAV buffer missing data chunk");
}

/**
 * Measures exact audio duration in seconds via `ffprobe`, falling back to WAV header parsing.
 */
export async function probeAudioDurationSec(filePath: string): Promise<number> {
  const ffprobe = findFfprobeBin();
  if (ffprobe) {
    try {
      const { stdout } = await execFileAsync(
        ffprobe,
        [
          "-v",
          "error",
          "-show_entries",
          "format=duration",
          "-of",
          "default=noprint_wrappers=1:nokey=1",
          filePath,
        ],
        { timeout: 15_000 }
      );
      const parsed = Number.parseFloat(stdout.trim());
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    } catch {
      // Fall back to RIFF WAV header inspection
    }
  }

  const raw = fs.readFileSync(filePath);
  const { samples, sampleRate } = decodeMonoWavSamples(raw);
  return samples.length / sampleRate;
}

/**
 * Audio-First Frame Lock: computes exact `raea` `durationInFrames` from measured audio duration.
 */
export function computeFramesFromAudioDuration(
  durationSec: number,
  fps: 24 | 30 = 24,
  opts?: { minFrames?: number; maxFrames?: number }
): number {
  const minFrames = opts?.minFrames ?? 36;
  const maxFrames = opts?.maxFrames ?? 1800;
  const raw = Math.ceil(durationSec * fps);
  return Math.max(minFrames, Math.min(maxFrames, raw));
}

function rolePitchAndFreq(voiceId: string): {
  pitchFactor: number;
  baseFreqHz: number;
  sayRate: number;
  openAiVoice: "nova" | "onyx" | "alloy" | "echo" | "shimmer";
} {
  const lower = voiceId.toLowerCase();
  if (lower.includes("narrator")) {
    return { pitchFactor: 0.93, baseFreqHz: 162, sayRate: 172, openAiVoice: "alloy" };
  }
  if (lower.includes("hero") || lower.includes("mira") || lower.includes("f")) {
    return { pitchFactor: 1.04, baseFreqHz: 228, sayRate: 186, openAiVoice: "nova" };
  }
  if (lower.includes("npc_01") || lower.includes("shram") || lower.includes("antag")) {
    return { pitchFactor: 0.79, baseFreqHz: 118, sayRate: 168, openAiVoice: "onyx" };
  }
  return { pitchFactor: 0.88, baseFreqHz: 178, sayRate: 182, openAiVoice: "echo" };
}

function generateCadenceSpeechSamples(
  text: string,
  baseFreqHz: number,
  emotion: string
): Int16Array {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const wordSec = emotion === "whisper" ? 0.44 : emotion === "angry" ? 0.32 : 0.37;
  const durationSec = Math.max(1.2, Math.min(12, words.length * wordSec + 0.35));
  const totalSamples = Math.floor(durationSec * AUDIO_SAMPLE_RATE);
  const out = new Int16Array(totalSamples);

  const syllableHz = emotion === "angry" ? 5.4 : 4.2;
  const gain = emotion === "whisper" ? 0.14 : 0.24;

  for (let i = 0; i < totalSamples; i++) {
    const t = i / AUDIO_SAMPLE_RATE;
    const fadeEdge = Math.min(1, t / 0.06, (durationSec - t) / 0.08);
    const syllableEnv = Math.max(0, Math.sin(Math.PI * t * syllableHz)) ** 1.6;
    const f0 = baseFreqHz * (1 + 0.06 * Math.sin(2 * Math.PI * 1.3 * t));
    const wave =
      0.65 * Math.sin(2 * Math.PI * f0 * t) +
      0.25 * Math.sin(2 * Math.PI * f0 * 2 * t) +
      0.1 * Math.sin(2 * Math.PI * f0 * 3 * t);
    out[i] = Math.round(wave * syllableEnv * fadeEdge * gain * 32767);
  }
  return out;
}

/**
 * Multi-tier AudioProvider:
 *  1. OpenAI-compatible `/v1/audio/speech` when `TTS_API_KEY` or `OPENAI_API_KEY` is set;
 *  2. Local macOS Russian `/usr/bin/say -v Milena` + `ffmpeg` per-role pitch/formant shaping;
 *  3. Cross-platform deterministic PCM WAV speech-cadence synthesis (Ubuntu CI / zero-dependency).
 */
export class MultiTierRoleAudioProvider implements AudioProvider {
  readonly name: string;
  private readonly workDir: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(opts?: { workDir?: string; apiKey?: string; baseUrl?: string; model?: string }) {
    this.workDir = opts?.workDir ?? path.join(os.tmpdir(), "cinema-rpg-tts");
    fs.mkdirSync(this.workDir, { recursive: true });
    this.apiKey = opts?.apiKey ?? process.env.TTS_API_KEY ?? "";
    this.baseUrl = (
      opts?.baseUrl ??
      process.env.TTS_BASE_URL ??
      "https://api.openai.com/v1"
    ).replace(/\/$/, "");
    this.model = opts?.model ?? process.env.TTS_MODEL ?? "tts-1";

    if (this.apiKey) {
      this.name = "openai-tts";
    } else if (findMacSayBin() && findFfmpegBin()) {
      this.name = "macos-say-ru";
    } else {
      this.name = "procedural-cadence-wav";
    }
  }

  async synthesizeSpeech(params: {
    text: string;
    voiceId: string;
    emotion: string;
  }): Promise<{ audioPath: string; durationSec: number }> {
    const id = `tts_${crypto.randomBytes(6).toString("hex")}`;
    const wavPath = path.join(this.workDir, `${id}.wav`);
    const profile = rolePitchAndFreq(params.voiceId);
    const ffmpeg = findFfmpegBin();

    // 1. Cloud OpenAI-compatible TTS
    if (this.apiKey && ffmpeg) {
      try {
        const mp3Path = path.join(this.workDir, `${id}.mp3`);
        const res = await fetch(`${this.baseUrl}/audio/speech`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: this.model,
            voice: profile.openAiVoice,
            input: params.text,
            response_format: "mp3",
          }),
        });
        if (res.ok) {
          const arr = Buffer.from(await res.arrayBuffer());
          fs.writeFileSync(mp3Path, arr);
          await execFileAsync(
            ffmpeg,
            [
              "-y",
              "-i",
              mp3Path,
              "-ac",
              "1",
              "-ar",
              String(AUDIO_SAMPLE_RATE),
              "-c:a",
              "pcm_s16le",
              wavPath,
            ],
            { timeout: 20_000 }
          );
          fs.unlinkSync(mp3Path);
          const durationSec = await probeAudioDurationSec(wavPath);
          return { audioPath: wavPath, durationSec };
        }
      } catch {
        // Fall through to local Russian TTS or cadence synth
      }
    }

    // 2. Local macOS `say -v Milena` + per-role pitch shaping via ffmpeg
    const sayBin = findMacSayBin();
    if (sayBin && ffmpeg) {
      try {
        const aiffPath = path.join(this.workDir, `${id}.aiff`);
        const emotionRateDelta =
          params.emotion === "angry" ? 14 : params.emotion === "whisper" ? -16 : 0;
        const rate = String(Math.max(130, profile.sayRate + emotionRateDelta));
        await execFileAsync(
          sayBin,
          ["-v", "Milena", "-r", rate, "-o", aiffPath, params.text],
          { timeout: 25_000 }
        );
        const p = profile.pitchFactor;
        const tempo = Number((1 / p).toFixed(4));
        const vol = params.emotion === "whisper" ? "0.75" : "1.0";
        await execFileAsync(
          ffmpeg,
          [
            "-y",
            "-i",
            aiffPath,
            "-af",
            `asetrate=22050*${p},aresample=${AUDIO_SAMPLE_RATE},atempo=${tempo},volume=${vol}`,
            "-ac",
            "1",
            "-ar",
            String(AUDIO_SAMPLE_RATE),
            "-c:a",
            "pcm_s16le",
            wavPath,
          ],
          { timeout: 25_000 }
        );
        if (fs.existsSync(aiffPath)) fs.unlinkSync(aiffPath);
        const durationSec = await probeAudioDurationSec(wavPath);
        return { audioPath: wavPath, durationSec };
      } catch {
        // Fall through to deterministic WAV cadence generator
      }
    }

    // 3. Deterministic cross-platform PCM WAV synthesis
    const samples = generateCadenceSpeechSamples(
      params.text,
      profile.baseFreqHz,
      params.emotion
    );
    fs.writeFileSync(wavPath, encodeMonoWav(samples, AUDIO_SAMPLE_RATE));
    const durationSec = await probeAudioDurationSec(wavPath);
    return { audioPath: wavPath, durationSec };
  }
}

function mixFoleySfxIntoBuffer(
  master: Int16Array,
  sfxTags: Array<{ tag: string; atFrame: number }>,
  fps: number
): void {
  for (const sfx of sfxTags) {
    const startSample = Math.floor((sfx.atFrame / fps) * AUDIO_SAMPLE_RATE);
    if (startSample < 0 || startSample >= master.length) continue;

    if (sfx.tag.includes("sword")) {
      // Crisp metallic draw ring (0.38s)
      const len = Math.min(Math.floor(0.38 * AUDIO_SAMPLE_RATE), master.length - startSample);
      for (let i = 0; i < len; i++) {
        const t = i / AUDIO_SAMPLE_RATE;
        const env = Math.exp(-t * 9.5);
        const ring =
          0.5 * Math.sin(2 * Math.PI * 1480 * t) +
          0.35 * Math.sin(2 * Math.PI * 2210 * t) +
          0.15 * Math.sin(2 * Math.PI * 3390 * t);
        const mixed = master[startSample + i] + Math.round(ring * env * 5200);
        master[startSample + i] = Math.max(-32768, Math.min(32767, mixed));
      }
    } else {
      // Soft wooden footstep thud (2 steps)
      for (const stepOffsetSec of [0, 0.34]) {
        const s0 = startSample + Math.floor(stepOffsetSec * AUDIO_SAMPLE_RATE);
        const len = Math.min(Math.floor(0.12 * AUDIO_SAMPLE_RATE), master.length - s0);
        for (let i = 0; i < len; i++) {
          const t = i / AUDIO_SAMPLE_RATE;
          const env = Math.exp(-t * 28);
          const thud = Math.sin(2 * Math.PI * 92 * t);
          const mixed = master[s0 + i] + Math.round(thud * env * 3800);
          master[s0 + i] = Math.max(-32768, Math.min(32767, mixed));
        }
      }
    }
  }
}

function addDuckedAmbientBed(master: Int16Array): void {
  for (let i = 0; i < master.length; i++) {
    const t = i / AUDIO_SAMPLE_RATE;
    const voiceActive = Math.abs(master[i]) > 900;
    const bedGain = voiceActive ? 260 : 620; // Automatic ducking under dialogue!
    const warmChord =
      0.55 * Math.sin(2 * Math.PI * 110 * t) +
      0.3 * Math.sin(2 * Math.PI * 164.81 * t) +
      0.15 * Math.sin(2 * Math.PI * 220 * t);
    const mixed = master[i] + Math.round(warmChord * bedGain);
    master[i] = Math.max(-32768, Math.min(32767, mixed));
  }
}

function formatSrtTime(sec: number): string {
  const totalMs = Math.max(0, Math.round(sec * 1000));
  const ms = totalMs % 1000;
  const totalS = Math.floor(totalMs / 1000);
  const s = totalS % 60;
  const totalM = Math.floor(totalS / 60);
  const m = totalM % 60;
  const h = Math.floor(totalM / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

function formatVttTime(sec: number): string {
  return formatSrtTime(sec).replace(",", ".");
}

export function formatSubtitlesSrt(cues: SubtitleCue[]): string {
  return cues
    .map(
      (c, i) =>
        `${i + 1}\n${formatSrtTime(c.startSec)} --> ${formatSrtTime(c.endSec)}\n${c.speakerName}: ${c.text}\n`
    )
    .join("\n");
}

export function formatSubtitlesWebVtt(cues: SubtitleCue[]): string {
  const body = cues
    .map(
      (c) =>
        `${formatVttTime(c.startSec)} --> ${formatVttTime(c.endSec)}\n<v ${c.speakerName}>${c.speakerName}: ${c.text}`
    )
    .join("\n\n");
  return `WEBVTT\n\n${body}\n`;
}

/**
 * Offsets and merges per-shot `SubtitleCue[]` across an entire Episode Animatic timeline.
 */
export function mergeEpisodeSubtitles(
  shots: Array<{ durationSec: number; cues: SubtitleCue[] }>
): SubtitleCue[] {
  const merged: SubtitleCue[] = [];
  let offsetSec = 0;
  let idx = 1;
  for (const shot of shots) {
    for (const c of shot.cues) {
      merged.push({
        index: idx++,
        startSec: Number((offsetSec + c.startSec).toFixed(3)),
        endSec: Number((offsetSec + c.endSec).toFixed(3)),
        speakerId: c.speakerId,
        speakerName: c.speakerName,
        text: c.text,
      });
    }
    offsetSec += shot.durationSec;
  }
  return merged;
}

/**
 * Audio-First Shot Track Builder:
 * Synthesizes multi-role dialogue lines, measures exact audio timing, builds a single
 * mixed 24 kHz WAV (voices + foley SFX + ducked ambient bed), writes `.srt` and `.vtt`
 * subtitles, and returns frame-locked `durationInFrames` for `raea`.
 */
export async function synthesizeTurnAudioTrack(params: {
  outDir: string;
  baseName: string;
  lines: RoleLineInput[];
  sfxTags?: Array<{ tag: string; atFrame: number }>;
  fps: 24 | 30;
  provider?: AudioProvider;
}): Promise<SynthesizedTurnAudio> {
  fs.mkdirSync(params.outDir, { recursive: true });
  const provider =
    params.provider ?? new MultiTierRoleAudioProvider({ workDir: params.outDir });

  const leadInSamples = Math.floor(0.22 * AUDIO_SAMPLE_RATE);
  const gapSamples = Math.floor(0.2 * AUDIO_SAMPLE_RATE);
  const tailSamples = Math.floor(0.32 * AUDIO_SAMPLE_RATE);

  const segmentBuffers: Int16Array[] = [];
  const cues: SubtitleCue[] = [];
  let cursorSamples = leadInSamples;

  for (let i = 0; i < params.lines.length; i++) {
    const line = params.lines[i];
    const { audioPath } = await provider.synthesizeSpeech({
      text: line.text,
      voiceId: line.voiceId,
      emotion: line.emotion,
    });
    const decoded = decodeMonoWavSamples(fs.readFileSync(audioPath));
    if (fs.existsSync(audioPath)) {
      fs.unlinkSync(audioPath);
    }

    const startSec = Number((cursorSamples / AUDIO_SAMPLE_RATE).toFixed(3));
    const endSec = Number(
      ((cursorSamples + decoded.samples.length) / AUDIO_SAMPLE_RATE).toFixed(3)
    );
    cues.push({
      index: i + 1,
      startSec,
      endSec: Math.max(startSec + 0.25, endSec),
      speakerId: line.speakerId,
      speakerName: line.speakerName,
      text: line.text,
    });

    segmentBuffers.push(decoded.samples);
    cursorSamples += decoded.samples.length;
    if (i < params.lines.length - 1) {
      cursorSamples += gapSamples;
    }
  }

  const totalSamples = Math.max(
    Math.floor(1.5 * AUDIO_SAMPLE_RATE),
    cursorSamples + tailSamples
  );
  const master = new Int16Array(totalSamples);

  let writePos = leadInSamples;
  for (let i = 0; i < segmentBuffers.length; i++) {
    master.set(segmentBuffers[i], writePos);
    writePos += segmentBuffers[i].length + gapSamples;
  }

  addDuckedAmbientBed(master);
  if (params.sfxTags && params.sfxTags.length > 0) {
    mixFoleySfxIntoBuffer(master, params.sfxTags, params.fps);
  }

  const wavPath = path.join(params.outDir, `${params.baseName}.wav`);
  const srtPath = path.join(params.outDir, `${params.baseName}.srt`);
  const vttPath = path.join(params.outDir, `${params.baseName}.vtt`);

  fs.writeFileSync(wavPath, encodeMonoWav(master, AUDIO_SAMPLE_RATE));
  fs.writeFileSync(srtPath, formatSubtitlesSrt(cues), "utf-8");
  fs.writeFileSync(vttPath, formatSubtitlesWebVtt(cues), "utf-8");

  const durationSec = await probeAudioDurationSec(wavPath);
  const durationInFrames = computeFramesFromAudioDuration(durationSec, params.fps);

  return {
    wavPath,
    srtPath,
    vttPath,
    durationSec: Number(durationSec.toFixed(3)),
    durationInFrames,
    cues,
    providerName: provider.name,
  };
}
