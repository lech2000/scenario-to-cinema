import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { z } from "zod";
import {
  type DiceRoll,
  type GameEvent,
  type RenderJob,
  type ShotSpec,
  type SubtitleCue,
  type WorldBible,
  EpisodeCutSchema,
  ShotSpecSchema,
  StylePresetIdSchema,
  TariffTierSchema,
  WorldBibleSchema,
} from "@cinema-rpg/shared";
import {
  type RuntimeSessionState,
  type StructuredLLMClient,
  OpenAICompatibleLLMClient,
  createInitialSession,
  ingestScenarioText,
  processGameTurn,
} from "@cinema-rpg/engine";
import { compileShotToRaeaTsx } from "@cinema-rpg/raea-dsl";
import {
  AUDIO_SAMPLE_RATE,
  type AudioProvider,
  type BillingAdapter,
  type RoleLineInput,
  type VideoProvider,
  ExternalGrantBillingAdapter,
  MockVideoProvider,
  MultiTierRoleAudioProvider,
  decodeMonoWavSamples,
  encodeMonoWav,
  estimateEpisodeCost,
  formatSubtitlesSrt,
  formatSubtitlesWebVtt,
  mergeEpisodeSubtitles,
  synthesizeTurnAudioTrack,
} from "@cinema-rpg/providers";
import {
  concatMp4Clips,
  findFfmpegBinary,
  findRaeaBinary,
  muxVideoWithAudioAndSubs,
  renderShotWithRaea,
} from "./raea-runner.js";
import { renderStudioHtml } from "./studio-html.js";

const RollRequestSchema = z.object({
  stat: z.string().min(1),
  modifier: z.number().int().min(-5).max(5).default(0),
});

const LivePrevizRequestSchema = z.object({
  caseId: z.string().min(1),
  idempotencyKey: z.string().min(1),
  shot: ShotSpecSchema,
  worldBible: WorldBibleSchema,
  renderMp4: z.boolean().default(false),
});

const EstimateRequestSchema = z.object({
  episodeCutId: z.string().min(1),
  tariffTier: TariffTierSchema,
  shotCount: z.number().int().min(1).max(60),
  totalDurationSec: z.number().positive().max(360),
});

const FinalFilmRequestSchema = z.object({
  caseId: z.string().min(1),
  idempotencyKey: z.string().min(1),
  paymentGrantId: z.string().min(1),
  episodeCut: EpisodeCutSchema,
  worldBible: WorldBibleSchema,
});

const CreateSessionRequestSchema = z.object({
  scenarioText: z.string().min(10).max(120_000),
  stylePreset: StylePresetIdSchema.default("arcane_3d"),
  heroName: z.string().max(64).optional(),
  title: z.string().max(120).optional(),
  caseId: z.string().max(64).optional(),
});

const TurnRequestSchema = z.object({
  playerInput: z.string().min(1).max(2000),
  statToRoll: z.string().max(64).optional(),
  renderMp4: z.boolean().default(true),
});

const AnimaticRequestSchema = z.object({
  tariffTier: TariffTierSchema.default("po_episode_stylized"),
});

const ApproveSessionRequestSchema = z.object({
  tariffTier: TariffTierSchema.default("po_episode_stylized"),
  paymentGrantId: z.string().min(1),
});

export interface ConnectorOptions {
  apiKey?: string;
  videoProvider?: VideoProvider;
  audioProvider?: AudioProvider;
  billingAdapter?: BillingAdapter;
  llmClient?: StructuredLLMClient;
  workDir?: string;
  enableLiveRaea?: boolean;
}

export function roll2d6(stat: string, modifier: number): DiceRoll {
  const d1 = crypto.randomInt(1, 7);
  const d2 = crypto.randomInt(1, 7);
  const total = d1 + d2 + modifier;
  const outcome = total <= 6 ? "fail" : total <= 9 ? "partial" : "success";
  return { stat, dice: [d1, d2], modifier, total, outcome };
}

function buildRoleLinesForTurn(event: GameEvent, wb: WorldBible): RoleLineInput[] {
  const lines: RoleLineInput[] = [];

  // Extract concise narrator beat (before direct quote if present)
  const narratorBeat = event.narrativeText.split("«")[0]?.trim();
  if (narratorBeat) {
    lines.push({
      speakerId: "narrator",
      speakerName: "Рассказчик",
      role: "narrator",
      voiceId: "voice_ru_narrator",
      text: narratorBeat.replace(/:\s*$/, "."),
      emotion: "neutral",
    });
  }

  for (const dlg of event.dialogues) {
    const profile = wb.characters.find((c) => c.id === dlg.speakerId);
    lines.push({
      speakerId: dlg.speakerId,
      speakerName: profile?.name ?? (dlg.speakerId === "narrator" ? "Рассказчик" : dlg.speakerId),
      role: profile?.role ?? "narrator",
      voiceId: profile?.voiceId ?? "voice_ru_narrator",
      text: dlg.text,
      emotion: dlg.emotion,
    });
  }

  return lines;
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(payload);
}

function serveMediaFile(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  filePath: string
): void {
  if (!fs.existsSync(filePath)) {
    return sendJson(res, 404, { ok: false, error: "Media file not found" });
  }
  const stat = fs.statSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const contentType =
    ext === ".mp4"
      ? "video/mp4"
      : ext === ".png"
        ? "image/png"
        : ext === ".wav"
          ? "audio/wav"
          : ext === ".vtt"
            ? "text/vtt; charset=utf-8"
            : ext === ".srt"
              ? "text/plain; charset=utf-8"
              : "application/octet-stream";

  const range = req.headers.range;
  if (range && (ext === ".mp4" || ext === ".wav")) {
    const match = range.match(/bytes=(\d+)-(\d*)/);
    if (match) {
      const start = Number(match[1]);
      const end = match[2] ? Math.min(Number(match[2]), stat.size - 1) : stat.size - 1;
      if (start <= end && start < stat.size) {
        res.writeHead(206, {
          "Content-Range": `bytes ${start}-${end}/${stat.size}`,
          "Accept-Ranges": "bytes",
          "Content-Length": end - start + 1,
          "Content-Type": contentType,
        });
        fs.createReadStream(filePath, { start, end }).pipe(res);
        return;
      }
    }
  }

  res.writeHead(200, {
    "Content-Type": contentType,
    "Content-Length": stat.size,
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-cache",
  });
  fs.createReadStream(filePath).pipe(res);
}

async function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > 2 * 1024 * 1024) {
      throw new Error("Payload exceeds 2 MB limit");
    }
    chunks.push(buf);
  }
  const raw = Buffer.concat(chunks).toString("utf-8").trim();
  return raw ? JSON.parse(raw) : {};
}

export function createConnectorServer(opts: ConnectorOptions = {}): http.Server {
  const workDir = opts.workDir ?? path.join(os.tmpdir(), "cinema-rpg-connector");
  fs.mkdirSync(workDir, { recursive: true });

  const videoProvider = opts.videoProvider ?? new MockVideoProvider();
  const audioProvider =
    opts.audioProvider ?? new MultiTierRoleAudioProvider({ workDir });
  const billing = opts.billingAdapter ?? new ExternalGrantBillingAdapter();
  const llmClient = opts.llmClient ?? new OpenAICompatibleLLMClient();
  const enableLiveRaea = opts.enableLiveRaea ?? true;

  const jobs = new Map<string, RenderJob>();
  const idempotencyIndex = new Map<string, string>();
  const sessions = new Map<string, RuntimeSessionState>();

  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      const method = req.method ?? "GET";

      if (method === "GET" && url.pathname === "/") {
        const html = renderStudioHtml();
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
        return;
      }

      if (method === "GET" && url.pathname === "/health") {
        return sendJson(res, 200, {
          ok: true,
          service: "cinema-engine-connector",
          videoProvider: videoProvider.name,
          ttsProvider: audioProvider.name,
          billingMode: billing.mode,
          llmMode: llmClient.mode,
          raeaAvailable: enableLiveRaea && Boolean(findRaeaBinary()),
          ffmpegAvailable: Boolean(findFfmpegBinary()),
          maxCaseAttachmentBytes: 32 * 1024 * 1024,
        });
      }

      const mediaMatch = url.pathname.match(
        /^\/media\/([a-zA-Z0-9_.-]+\.(?:png|mp4|wav|srt|vtt))$/
      );
      if (method === "GET" && mediaMatch) {
        const safeName = path.basename(mediaMatch[1]);
        return serveMediaFile(req, res, path.join(workDir, safeName));
      }

      if (opts.apiKey && url.pathname.startsWith("/v1/")) {
        const auth = req.headers["x-cinema-api-key"];
        if (auth !== opts.apiKey) {
          return sendJson(res, 401, { ok: false, error: "Invalid API key" });
        }
      }

      // ── Interactive Prototype Sessions (Book -> WorldBible -> Audio-First 2d6 -> raea) ──
      if (method === "POST" && url.pathname === "/v1/sessions") {
        const parsed = CreateSessionRequestSchema.parse(await readJsonBody(req));
        const { worldBible, source } = await ingestScenarioText({
          scenarioText: parsed.scenarioText,
          stylePreset: parsed.stylePreset,
          heroName: parsed.heroName,
          title: parsed.title,
          llm: llmClient,
        });
        const session = createInitialSession({
          worldBible,
          scenarioText: parsed.scenarioText,
          caseId: parsed.caseId,
        });
        sessions.set(session.sessionId, session);
        return sendJson(res, 201, { ok: true, source, session });
      }

      const sessionMatch = url.pathname.match(/^\/v1\/sessions\/(sess_[a-f0-9]+)$/);
      if (method === "GET" && sessionMatch) {
        const session = sessions.get(sessionMatch[1]);
        if (!session) return sendJson(res, 404, { ok: false, error: "Session not found" });
        return sendJson(res, 200, { ok: true, session });
      }

      const turnMatch = url.pathname.match(/^\/v1\/sessions\/(sess_[a-f0-9]+)\/turns$/);
      if (method === "POST" && turnMatch) {
        const session = sessions.get(turnMatch[1]);
        if (!session) return sendJson(res, 404, { ok: false, error: "Session not found" });
        const parsed = TurnRequestSchema.parse(await readJsonBody(req));

        const turn = await processGameTurn({
          session,
          playerInput: parsed.playerInput,
          statToRoll: parsed.statToRoll,
          llm: llmClient,
        });

        const baseName = `${session.sessionId}_${turn.shot.id}`.replace(
          /[^a-zA-Z0-9_-]/g,
          "_"
        );

        // 1. AUDIO-FIRST: synthesize multi-role dialogue + SFX + subtitles BEFORE 3D render
        const roleLines = buildRoleLinesForTurn(turn.event, session.worldBible);
        const audioTrack = await synthesizeTurnAudioTrack({
          outDir: workDir,
          baseName,
          lines: roleLines,
          sfxTags: turn.shot.audio?.sfxTags ?? [],
          fps: turn.shot.fps,
          provider: audioProvider,
        });

        // 2. FRAME LOCK: lock raea ShotSpec durationInFrames to measured audio length
        turn.shot.durationInFrames = audioTrack.durationInFrames;
        turn.shot.audio = {
          ...(turn.shot.audio ?? { sfxTags: [] }),
          ttsAudioPath: audioTrack.wavPath,
          audioDurationSec: audioTrack.durationSec,
          subtitles: audioTrack.cues,
        };

        // 3. Compile frame-locked ShotSpec -> raea TSX & render 3D clip
        const tsx = compileShotToRaeaTsx(turn.shot, session.worldBible);
        const tsxPath = path.join(workDir, `${baseName}.tsx`);
        fs.writeFileSync(tsxPath, tsx, "utf-8");

        const render = enableLiveRaea
          ? await renderShotWithRaea({
              tsxPath,
              outDir: workDir,
              shotId: baseName,
              keyframe: Math.floor(turn.shot.durationInFrames / 2),
              renderMp4: parsed.renderMp4,
            })
          : {
              renderedLive: false,
              durationMs: 0,
              note: "Live raea rendering disabled for this server instance.",
            };

        // 4. Mux multi-role audio + soft Russian subtitles into the rendered MP4
        if (render.mp4File) {
          await muxVideoWithAudioAndSubs({
            mp4Path: path.join(workDir, render.mp4File),
            wavPath: audioTrack.wavPath,
            srtPath: audioTrack.srtPath,
          });
        }

        const wavName = path.basename(audioTrack.wavPath);
        const srtName = path.basename(audioTrack.srtPath);
        const vttName = path.basename(audioTrack.vttPath);

        const media = {
          tsxPath,
          pngUrl: render.pngFile ? `/media/${render.pngFile}` : undefined,
          mp4Url: render.mp4File ? `/media/${render.mp4File}` : undefined,
          wavUrl: `/media/${wavName}`,
          srtUrl: `/media/${srtName}`,
          vttUrl: `/media/${vttName}`,
          wavPath: audioTrack.wavPath,
          durationSec: audioTrack.durationSec,
        };
        session.shotMedia[turn.shot.id] = media;

        return sendJson(res, 200, {
          ok: true,
          event: turn.event,
          shot: turn.shot,
          suggestedChoices: turn.suggestedChoices,
          source: turn.source,
          audio: {
            provider: audioTrack.providerName,
            durationSec: audioTrack.durationSec,
            durationInFrames: audioTrack.durationInFrames,
            cues: audioTrack.cues,
          },
          render,
          media,
        });
      }

      const animaticMatch = url.pathname.match(/^\/v1\/sessions\/(sess_[a-f0-9]+)\/animatic$/);
      if (method === "POST" && animaticMatch) {
        const session = sessions.get(animaticMatch[1]);
        if (!session) return sendJson(res, 404, { ok: false, error: "Session not found" });
        if (session.shots.length === 0) {
          return sendJson(res, 422, {
            ok: false,
            error: "Сначала сделайте хотя бы один игровой ход.",
          });
        }
        const parsed = AnimaticRequestSchema.parse(await readJsonBody(req));
        const mp4Paths: string[] = [];
        const shotSampleChunks: Int16Array[] = [];
        const shotSubtitleInputs: Array<{ durationSec: number; cues: SubtitleCue[] }> = [];

        for (const shot of session.shots) {
          const baseName = `${session.sessionId}_${shot.id}`.replace(
            /[^a-zA-Z0-9_-]/g,
            "_"
          );
          const existing = session.shotMedia[shot.id];
          const wavPath = existing?.wavPath ?? path.join(workDir, `${baseName}.wav`);
          if (fs.existsSync(wavPath)) {
            const decoded = decodeMonoWavSamples(fs.readFileSync(wavPath));
            shotSampleChunks.push(decoded.samples);
            shotSubtitleInputs.push({
              durationSec: decoded.samples.length / decoded.sampleRate,
              cues: shot.audio?.subtitles ?? [],
            });
          } else {
            shotSubtitleInputs.push({
              durationSec: shot.durationInFrames / shot.fps,
              cues: shot.audio?.subtitles ?? [],
            });
          }

          const expectedMp4 = path.join(workDir, `${baseName}.mp4`);
          if (fs.existsSync(expectedMp4)) {
            mp4Paths.push(expectedMp4);
            continue;
          }
          const tsxPath = existing?.tsxPath ?? path.join(workDir, `${baseName}.tsx`);
          if (!fs.existsSync(tsxPath)) {
            fs.writeFileSync(tsxPath, compileShotToRaeaTsx(shot, session.worldBible), "utf-8");
          }
          if (enableLiveRaea) {
            const resRender = await renderShotWithRaea({
              tsxPath,
              outDir: workDir,
              shotId: baseName,
              renderMp4: true,
            });
            if (resRender.mp4File) {
              const p = path.join(workDir, resRender.mp4File);
              mp4Paths.push(p);
              session.shotMedia[shot.id] = {
                ...existing,
                tsxPath,
                mp4Url: `/media/${resRender.mp4File}`,
              };
            }
          }
        }

        // Build Episode-wide master WAV + merged SRT & WebVTT subtitles
        const mergedCues = mergeEpisodeSubtitles(shotSubtitleInputs);
        const epBase = `${session.sessionId}_animatic`;
        const epSrtFile = `${epBase}.srt`;
        const epVttFile = `${epBase}.vtt`;
        const epSrtPath = path.join(workDir, epSrtFile);
        const epVttPath = path.join(workDir, epVttFile);
        fs.writeFileSync(epSrtPath, formatSubtitlesSrt(mergedCues), "utf-8");
        fs.writeFileSync(epVttPath, formatSubtitlesWebVtt(mergedCues), "utf-8");

        let epWavPath: string | undefined;
        let epWavFile: string | undefined;
        if (shotSampleChunks.length > 0) {
          const totalLen = shotSampleChunks.reduce((acc, s) => acc + s.length, 0);
          const masterSamples = new Int16Array(totalLen);
          let offset = 0;
          for (const chunk of shotSampleChunks) {
            masterSamples.set(chunk, offset);
            offset += chunk.length;
          }
          epWavFile = `${epBase}.wav`;
          epWavPath = path.join(workDir, epWavFile);
          fs.writeFileSync(epWavPath, encodeMonoWav(masterSamples, AUDIO_SAMPLE_RATE));
        }

        const outFile = `${epBase}.mp4`;
        const outPath = path.join(workDir, outFile);
        const concat = await concatMp4Clips({
          mp4Paths,
          episodeWavPath: epWavPath,
          episodeSrtPath: epSrtPath,
          outPath,
        });
        if (concat.ok) {
          session.animaticUrl = `/media/${outFile}`;
        }

        const totalDurationSec = session.shots.reduce(
          (sum, s) => sum + (s.audio?.audioDurationSec ?? s.durationInFrames / s.fps),
          0
        );
        const estimate = estimateEpisodeCost({
          episodeCutId: `ep_${session.sessionId}`,
          tariffTier: parsed.tariffTier,
          shotCount: session.shots.length,
          totalDurationSec,
        });

        return sendJson(res, 200, {
          ok: true,
          animaticUrl: concat.ok ? `/media/${outFile}` : undefined,
          audioUrl: epWavFile ? `/media/${epWavFile}` : undefined,
          srtUrl: `/media/${epSrtFile}`,
          vttUrl: `/media/${epVttFile}`,
          subtitles: mergedCues,
          bytes: concat.bytes,
          concatNote: concat.note,
          estimate,
        });
      }

      const approveMatch = url.pathname.match(/^\/v1\/sessions\/(sess_[a-f0-9]+)\/approve$/);
      if (method === "POST" && approveMatch) {
        const session = sessions.get(approveMatch[1]);
        if (!session) return sendJson(res, 404, { ok: false, error: "Session not found" });
        if (session.shots.length === 0) {
          return sendJson(res, 422, { ok: false, error: "Нет шотов для финального рендера." });
        }
        const parsed = ApproveSessionRequestSchema.parse(await readJsonBody(req));
        const episodeCutId = `ep_${session.sessionId}`;
        const grant = await billing.verifyPaymentGrant({
          caseId: session.caseId,
          episodeCutId,
          tariffTier: parsed.tariffTier,
          paymentGrantId: parsed.paymentGrantId,
        });
        if (!grant.ok) {
          return sendJson(res, 402, { ok: false, error: grant.reason });
        }

        session.animaticApproved = true;
        const firstShot: ShotSpec = session.shots[0];
        const previzPath =
          session.animaticUrl ??
          session.shotMedia[firstShot.id]?.mp4Url ??
          `${session.sessionId}_animatic.mp4`;
        const { providerJobId } = await videoProvider.renderShotV2V({
          previzVideoPath: previzPath,
          prompt: `${session.worldBible.globalStylePrompt}. ${firstShot.v2vPrompt}`,
          characterRefUrls: session.worldBible.characters.flatMap((c) => c.refSheetUrls),
          durationSec: Math.ceil(
            session.shots.reduce((sum, s) => sum + s.durationInFrames / s.fps, 0)
          ),
          aspectRatio: "16:9",
          stylePreset: session.worldBible.stylePreset,
        });
        const polled = await videoProvider.pollJob(providerJobId);
        const now = new Date().toISOString();
        const job: RenderJob = {
          jobId: `job_${crypto.randomBytes(8).toString("hex")}`,
          kind: "final_film",
          caseId: session.caseId,
          idempotencyKey: `${episodeCutId}_${parsed.tariffTier}`,
          status: polled.status === "done" ? "done" : "rendering_v2v",
          progressPct: polled.status === "done" ? 100 : 20,
          etaSeconds: polled.status === "done" ? 0 : 180,
          artifactUrl: polled.videoUrl,
          createdAt: now,
          updatedAt: now,
        };
        jobs.set(job.jobId, job);
        return sendJson(res, 202, { ok: true, job });
      }

      // ── Core FixAR Connector Endpoints ────────────────────────────────────
      if (method === "POST" && url.pathname === "/v1/dice/roll-2d6") {
        const parsed = RollRequestSchema.parse(await readJsonBody(req));
        return sendJson(res, 200, { ok: true, roll: roll2d6(parsed.stat, parsed.modifier) });
      }

      if (method === "POST" && url.pathname === "/v1/estimates") {
        const parsed = EstimateRequestSchema.parse(await readJsonBody(req));
        const estimate = estimateEpisodeCost(parsed);
        return sendJson(res, 200, { ok: true, estimate });
      }

      if (method === "POST" && url.pathname === "/v1/jobs/live-previz") {
        const parsed = LivePrevizRequestSchema.parse(await readJsonBody(req));
        const existingId = idempotencyIndex.get(parsed.idempotencyKey);
        if (existingId && jobs.has(existingId)) {
          return sendJson(res, 200, { ok: true, job: jobs.get(existingId), deduplicated: true });
        }

        const tsx = compileShotToRaeaTsx(parsed.shot, parsed.worldBible);
        const jobId = `job_${crypto.randomBytes(8).toString("hex")}`;
        const tsxPath = path.join(workDir, `${jobId}_${parsed.shot.id}.tsx`);
        fs.writeFileSync(tsxPath, tsx, "utf-8");

        const render = enableLiveRaea
          ? await renderShotWithRaea({
              tsxPath,
              outDir: workDir,
              shotId: `${jobId}_${parsed.shot.id}`,
              renderMp4: parsed.renderMp4,
            })
          : { renderedLive: false, durationMs: 0 };

        const now = new Date().toISOString();
        const job: RenderJob = {
          jobId,
          kind: "live_previz",
          caseId: parsed.caseId,
          idempotencyKey: parsed.idempotencyKey,
          status: "done",
          progressPct: 100,
          etaSeconds: 0,
          generatedTsxPath: tsxPath,
          artifactUrl: render.mp4File
            ? `/media/${render.mp4File}`
            : render.pngFile
              ? `/media/${render.pngFile}`
              : `file://${tsxPath}`,
          createdAt: now,
          updatedAt: now,
        };
        jobs.set(jobId, job);
        idempotencyIndex.set(parsed.idempotencyKey, jobId);
        return sendJson(res, 202, { ok: true, job });
      }

      if (method === "POST" && url.pathname === "/v1/jobs/final-film") {
        const parsed = FinalFilmRequestSchema.parse(await readJsonBody(req));
        if (!parsed.episodeCut.animaticApproved) {
          return sendJson(res, 422, {
            ok: false,
            error: "3D-аниматик должен быть утверждён игроком до запуска платного рендера.",
          });
        }

        const existingId = idempotencyIndex.get(parsed.idempotencyKey);
        if (existingId && jobs.has(existingId)) {
          return sendJson(res, 200, { ok: true, job: jobs.get(existingId), deduplicated: true });
        }

        const grant = await billing.verifyPaymentGrant({
          caseId: parsed.caseId,
          episodeCutId: parsed.episodeCut.id,
          tariffTier: parsed.episodeCut.tariffTier,
          paymentGrantId: parsed.paymentGrantId,
        });
        if (!grant.ok) {
          return sendJson(res, 402, { ok: false, error: grant.reason });
        }

        const jobId = `job_${crypto.randomBytes(8).toString("hex")}`;
        const firstShot = parsed.episodeCut.shots[0];
        const tsx = compileShotToRaeaTsx(firstShot, parsed.worldBible);
        const tsxPath = path.join(workDir, `${jobId}_${firstShot.id}.tsx`);
        fs.writeFileSync(tsxPath, tsx, "utf-8");

        const { providerJobId } = await videoProvider.renderShotV2V({
          previzVideoPath: tsxPath,
          prompt: `${parsed.worldBible.globalStylePrompt}. ${firstShot.v2vPrompt}`,
          characterRefUrls: parsed.worldBible.characters.flatMap((c) => c.refSheetUrls),
          durationSec: Math.ceil(firstShot.durationInFrames / firstShot.fps),
          aspectRatio: "16:9",
          stylePreset: parsed.worldBible.stylePreset,
        });
        const polled = await videoProvider.pollJob(providerJobId);

        const now = new Date().toISOString();
        const job: RenderJob = {
          jobId,
          kind: "final_film",
          caseId: parsed.caseId,
          idempotencyKey: parsed.idempotencyKey,
          status: polled.status === "done" ? "done" : "rendering_v2v",
          progressPct: polled.status === "done" ? 100 : 15,
          etaSeconds: polled.status === "done" ? 0 : 180,
          generatedTsxPath: tsxPath,
          artifactUrl: polled.videoUrl,
          createdAt: now,
          updatedAt: now,
        };
        jobs.set(jobId, job);
        idempotencyIndex.set(parsed.idempotencyKey, jobId);
        return sendJson(res, 202, { ok: true, job });
      }

      const jobMatch = url.pathname.match(/^\/v1\/jobs\/(job_[a-f0-9]+)$/);
      if (method === "GET" && jobMatch) {
        const job = jobs.get(jobMatch[1]);
        if (!job) {
          return sendJson(res, 404, { ok: false, error: "Job not found" });
        }
        return sendJson(res, 200, { ok: true, job });
      }

      return sendJson(res, 404, { ok: false, error: "Not found" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Internal error";
      const status = err instanceof z.ZodError ? 400 : 500;
      return sendJson(res, status, { ok: false, error: message });
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? 8787);
  const server = createConnectorServer({ apiKey: process.env.CINEMA_ENGINE_API_KEY });
  server.listen(port, "127.0.0.1", () => {
    console.log(`Scenario-to-Cinema Studio & Connector: http://127.0.0.1:${port}`);
    console.log(`  raea binary: ${findRaeaBinary() ?? "not found (TSX-only mode)"}`);
    console.log(`  ffmpeg:      ${findFfmpegBinary() ?? "not found"}`);
  });
}
