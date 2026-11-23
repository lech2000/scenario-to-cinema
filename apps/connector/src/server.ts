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
  type ShotRenderState,
  type ShotSpec,
  type SubtitleCue,
  type TariffTier,
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
  TARIFF_FREE_REROLLS,
  type AudioProvider,
  type BillingAdapter,
  type RoleLineInput,
  type VideoProvider,
  ExternalGrantBillingAdapter,
  MultiTierRoleAudioProvider,
  createVideoProviderFromEnv,
  decodeMonoWavSamples,
  encodeMonoWav,
  ensureCharacterReferenceSheets,
  estimateEpisodeCost,
  evaluateRerollAllowance,
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

const RerollShotRequestSchema = z.object({
  shotId: z.string().min(1),
  promptOverride: z.string().min(1).max(1000).optional(),
  seed: z.number().int().min(0).optional(),
  extraPaymentGrantId: z.string().min(1).optional(),
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

interface JobContext {
  job: RenderJob;
  shots: ShotSpec[];
  worldBible: WorldBible;
  previzByShotId: Record<string, string>;
}

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

function resolveShotCharacterRefs(shot: ShotSpec, wb: WorldBible): string[] {
  const actorIds = new Set(shot.actors.map((a) => a.characterId));
  const refs: string[] = [];
  for (const char of wb.characters) {
    if (actorIds.has(char.id)) {
      for (const url of char.refSheetUrls) {
        if (!refs.includes(url)) refs.push(url);
      }
    }
  }
  return refs;
}

function buildRoleLinesForTurn(event: GameEvent, wb: WorldBible): RoleLineInput[] {
  const lines: RoleLineInput[] = [];
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
      speakerName:
        profile?.name ?? (dlg.speakerId === "narrator" ? "Рассказчик" : dlg.speakerId),
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
        : ext === ".svg"
          ? "image/svg+xml"
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

  const videoProvider = opts.videoProvider ?? createVideoProviderFromEnv();
  const audioProvider =
    opts.audioProvider ?? new MultiTierRoleAudioProvider({ workDir });
  const billing = opts.billingAdapter ?? new ExternalGrantBillingAdapter();
  const llmClient = opts.llmClient ?? new OpenAICompatibleLLMClient();
  const enableLiveRaea = opts.enableLiveRaea ?? true;

  const jobs = new Map<string, JobContext>();
  const idempotencyIndex = new Map<string, string>();
  const sessions = new Map<string, RuntimeSessionState>();
  const sessionFinalJobId = new Map<string, string>();

  async function runPerShotV2VQueue(params: {
    jobId: string;
    caseId: string;
    idempotencyKey: string;
    tariffTier: TariffTier;
    shots: ShotSpec[];
    worldBible: WorldBible;
    previzByShotId: Record<string, string>;
  }): Promise<JobContext> {
    const includedRerolls = TARIFF_FREE_REROLLS[params.tariffTier];
    const shotStates: ShotRenderState[] = params.shots.map((s, idx) => ({
      shotId: s.id,
      status: "queued",
      rerollCount: 0,
      seed: 1000 + idx,
      characterRefUrls: resolveShotCharacterRefs(s, params.worldBible),
      prompt: `${params.worldBible.globalStylePrompt}. ${s.v2vPrompt}`,
    }));

    const now = new Date().toISOString();
    const job: RenderJob = {
      jobId: params.jobId,
      kind: "final_film",
      caseId: params.caseId,
      idempotencyKey: params.idempotencyKey,
      tariffTier: params.tariffTier,
      status: "rendering_v2v",
      progressPct: 0,
      etaSeconds: params.shots.length * 15,
      shotStates,
      includedRerolls,
      usedFreeRerolls: 0,
      extraRerollCreditsCharged: 0,
      createdAt: now,
      updatedAt: now,
    };

    const ctx: JobContext = {
      job,
      shots: params.shots,
      worldBible: params.worldBible,
      previzByShotId: params.previzByShotId,
    };
    jobs.set(params.jobId, ctx);

    for (let i = 0; i < params.shots.length; i++) {
      const shot = params.shots[i];
      const st = shotStates[i];
      st.status = "rendering_v2v";
      const loc = params.worldBible.locations.find((l) => l.id === shot.locationId);
      const previzPath =
        params.previzByShotId[shot.id] ?? path.join(workDir, `${params.jobId}_${shot.id}.tsx`);

      const { providerJobId } = await videoProvider.renderShotV2V({
        previzVideoPath: previzPath,
        prompt: st.prompt ?? shot.v2vPrompt,
        characterRefUrls: st.characterRefUrls,
        locationRefUrl: loc?.moodboardUrl,
        durationSec: Math.ceil(shot.durationInFrames / shot.fps),
        aspectRatio: "16:9",
        stylePreset: params.worldBible.stylePreset,
        seed: st.seed,
      });
      st.providerJobId = providerJobId;

      const polled = await videoProvider.pollJob(providerJobId);
      if (polled.status === "done") {
        st.status = "done";
        st.videoUrl = polled.videoUrl;
      } else if (polled.status === "failed") {
        st.status = "failed";
        st.error = polled.error;
      } else {
        st.status = "rendering_v2v";
      }

      const completedCount = shotStates.filter((s) => s.status === "done").length;
      job.progressPct = Math.round((completedCount / shotStates.length) * 100);
      job.updatedAt = new Date().toISOString();
    }

    const allDone = shotStates.every((s) => s.status === "done");
    const anyFailed = shotStates.some((s) => s.status === "failed");
    job.status = allDone ? "done" : anyFailed ? "failed" : "rendering_v2v";
    job.etaSeconds = allDone ? 0 : 90;
    job.artifactUrl = shotStates[shotStates.length - 1]?.videoUrl;
    job.updatedAt = new Date().toISOString();
    return ctx;
  }

  async function handleRerollShot(
    ctx: JobContext,
    rawBody: unknown
  ): Promise<{ status: number; body: unknown }> {
    const parsed = RerollShotRequestSchema.parse(rawBody);
    const { job } = ctx;
    const tariffTier = job.tariffTier ?? "po_episode_stylized";
    const shotIdx = (job.shotStates ?? []).findIndex((s) => s.shotId === parsed.shotId);
    if (shotIdx < 0) {
      return { status: 404, body: { ok: false, error: `Shot "${parsed.shotId}" not found in job` } };
    }

    const allowance = evaluateRerollAllowance({
      tariffTier,
      includedRerolls: job.includedRerolls ?? TARIFF_FREE_REROLLS[tariffTier],
      usedFreeRerolls: job.usedFreeRerolls ?? 0,
      extraPaymentGrantId: parsed.extraPaymentGrantId,
    });
    if (!allowance.allowed) {
      return {
        status: 402,
        body: {
          ok: false,
          error: allowance.reason,
          extraCreditsRequired: allowance.extraCreditsCharged,
        },
      };
    }

    const shot = ctx.shots[shotIdx];
    const st = job.shotStates![shotIdx];
    const newSeed = parsed.seed ?? (st.seed ?? 1000) + st.rerollCount + 101;
    const prompt =
      parsed.promptOverride ?? `${ctx.worldBible.globalStylePrompt}. ${shot.v2vPrompt}`;
    const loc = ctx.worldBible.locations.find((l) => l.id === shot.locationId);
    const previzPath =
      ctx.previzByShotId[shot.id] ?? path.join(workDir, `${job.jobId}_${shot.id}.tsx`);

    const { providerJobId } = await videoProvider.renderShotV2V({
      previzVideoPath: previzPath,
      prompt,
      characterRefUrls: st.characterRefUrls,
      locationRefUrl: loc?.moodboardUrl,
      durationSec: Math.ceil(shot.durationInFrames / shot.fps),
      aspectRatio: "16:9",
      stylePreset: ctx.worldBible.stylePreset,
      seed: newSeed,
    });
    const polled = await videoProvider.pollJob(providerJobId);

    st.providerJobId = providerJobId;
    st.seed = newSeed;
    st.prompt = prompt;
    st.rerollCount += 1;
    st.status = polled.status === "done" ? "done" : polled.status === "failed" ? "failed" : "rendering_v2v";
    st.videoUrl = polled.videoUrl;
    st.error = polled.error;

    if (allowance.isFreeReroll) {
      job.usedFreeRerolls = (job.usedFreeRerolls ?? 0) + 1;
    } else {
      job.extraRerollCreditsCharged =
        (job.extraRerollCreditsCharged ?? 0) + allowance.extraCreditsCharged;
    }

    const doneCount = job.shotStates!.filter((s) => s.status === "done").length;
    job.progressPct = Math.round((doneCount / job.shotStates!.length) * 100);
    job.status = doneCount === job.shotStates!.length ? "done" : "rendering_v2v";
    job.artifactUrl = st.videoUrl ?? job.artifactUrl;
    job.updatedAt = new Date().toISOString();

    return {
      status: 200,
      body: {
        ok: true,
        rerolledShot: st,
        allowance,
        job,
      },
    };
  }

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
        /^\/media\/([a-zA-Z0-9_.-]+\.(?:png|svg|mp4|wav|srt|vtt))$/
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

      // ── Interactive Prototype Sessions ────────────────────────────────────
      if (method === "POST" && url.pathname === "/v1/sessions") {
        const parsed = CreateSessionRequestSchema.parse(await readJsonBody(req));
        const { worldBible, source } = await ingestScenarioText({
          scenarioText: parsed.scenarioText,
          stylePreset: parsed.stylePreset,
          heroName: parsed.heroName,
          title: parsed.title,
          llm: llmClient,
        });
        ensureCharacterReferenceSheets({ worldBible, outDir: workDir });

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

        const roleLines = buildRoleLinesForTurn(turn.event, session.worldBible);
        const audioTrack = await synthesizeTurnAudioTrack({
          outDir: workDir,
          baseName,
          lines: roleLines,
          sfxTags: turn.shot.audio?.sfxTags ?? [],
          fps: turn.shot.fps,
          provider: audioProvider,
        });

        turn.shot.durationInFrames = audioTrack.durationInFrames;
        turn.shot.audio = {
          ...(turn.shot.audio ?? { sfxTags: [] }),
          ttsAudioPath: audioTrack.wavPath,
          audioDurationSec: audioTrack.durationSec,
          subtitles: audioTrack.cues,
        };

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
        const jobId = `job_${crypto.randomBytes(8).toString("hex")}`;
        const previzByShotId: Record<string, string> = {};
        for (const s of session.shots) {
          const media = session.shotMedia[s.id];
          previzByShotId[s.id] = media?.mp4Url
            ? path.join(workDir, path.basename(media.mp4Url))
            : media?.tsxPath ?? `${session.sessionId}_${s.id}.mp4`;
        }

        const ctx = await runPerShotV2VQueue({
          jobId,
          caseId: session.caseId,
          idempotencyKey: `${episodeCutId}_${parsed.tariffTier}`,
          tariffTier: parsed.tariffTier,
          shots: session.shots,
          worldBible: session.worldBible,
          previzByShotId,
        });
        sessionFinalJobId.set(session.sessionId, jobId);
        return sendJson(res, 202, { ok: true, job: ctx.job });
      }

      const sessionRerollMatch = url.pathname.match(
        /^\/v1\/sessions\/(sess_[a-f0-9]+)\/reroll$/
      );
      if (method === "POST" && sessionRerollMatch) {
        const jobId = sessionFinalJobId.get(sessionRerollMatch[1]);
        const ctx = jobId ? jobs.get(jobId) : undefined;
        if (!ctx) {
          return sendJson(res, 404, {
            ok: false,
            error: "Сначала утвердите аниматик и запустите V2V-рендер.",
          });
        }
        const result = await handleRerollShot(ctx, await readJsonBody(req));
        return sendJson(res, result.status, result.body);
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
          return sendJson(res, 200, {
            ok: true,
            job: jobs.get(existingId)!.job,
            deduplicated: true,
          });
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
        jobs.set(jobId, {
          job,
          shots: [parsed.shot],
          worldBible: parsed.worldBible,
          previzByShotId: { [parsed.shot.id]: tsxPath },
        });
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
          return sendJson(res, 200, {
            ok: true,
            job: jobs.get(existingId)!.job,
            deduplicated: true,
          });
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

        ensureCharacterReferenceSheets({ worldBible: parsed.worldBible, outDir: workDir });

        const jobId = `job_${crypto.randomBytes(8).toString("hex")}`;
        const previzByShotId: Record<string, string> = {};
        for (const s of parsed.episodeCut.shots) {
          const tsx = compileShotToRaeaTsx(s, parsed.worldBible);
          const tsxPath = path.join(workDir, `${jobId}_${s.id}.tsx`);
          fs.writeFileSync(tsxPath, tsx, "utf-8");
          previzByShotId[s.id] = tsxPath;
        }

        const ctx = await runPerShotV2VQueue({
          jobId,
          caseId: parsed.caseId,
          idempotencyKey: parsed.idempotencyKey,
          tariffTier: parsed.episodeCut.tariffTier,
          shots: parsed.episodeCut.shots,
          worldBible: parsed.worldBible,
          previzByShotId,
        });
        ctx.job.generatedTsxPath = previzByShotId[parsed.episodeCut.shots[0].id];
        idempotencyIndex.set(parsed.idempotencyKey, jobId);
        return sendJson(res, 202, { ok: true, job: ctx.job });
      }

      const jobRerollMatch = url.pathname.match(/^\/v1\/jobs\/(job_[a-f0-9]+)\/reroll$/);
      if (method === "POST" && jobRerollMatch) {
        const ctx = jobs.get(jobRerollMatch[1]);
        if (!ctx) {
          return sendJson(res, 404, { ok: false, error: "Job not found" });
        }
        const result = await handleRerollShot(ctx, await readJsonBody(req));
        return sendJson(res, result.status, result.body);
      }

      const jobMatch = url.pathname.match(/^\/v1\/jobs\/(job_[a-f0-9]+)$/);
      if (method === "GET" && jobMatch) {
        const ctx = jobs.get(jobMatch[1]);
        if (!ctx) {
          return sendJson(res, 404, { ok: false, error: "Job not found" });
        }
        return sendJson(res, 200, { ok: true, job: ctx.job });
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
