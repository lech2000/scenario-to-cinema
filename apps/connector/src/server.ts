import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { z } from "zod";
import {
  type DiceRoll,
  type RenderJob,
  EpisodeCutSchema,
  ShotSpecSchema,
  TariffTierSchema,
  WorldBibleSchema,
} from "@cinema-rpg/shared";
import { compileShotToRaeaTsx } from "@cinema-rpg/raea-dsl";
import {
  type BillingAdapter,
  type VideoProvider,
  ExternalGrantBillingAdapter,
  MockVideoProvider,
  estimateEpisodeCost,
} from "@cinema-rpg/providers";

const RollRequestSchema = z.object({
  stat: z.string().min(1),
  modifier: z.number().int().min(-5).max(5).default(0),
});

const LivePrevizRequestSchema = z.object({
  caseId: z.string().min(1),
  idempotencyKey: z.string().min(1),
  shot: ShotSpecSchema,
  worldBible: WorldBibleSchema,
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

export interface ConnectorOptions {
  apiKey?: string;
  videoProvider?: VideoProvider;
  billingAdapter?: BillingAdapter;
  workDir?: string;
}

export function roll2d6(stat: string, modifier: number): DiceRoll {
  const d1 = crypto.randomInt(1, 7);
  const d2 = crypto.randomInt(1, 7);
  const total = d1 + d2 + modifier;
  const outcome = total <= 6 ? "fail" : total <= 9 ? "partial" : "success";
  return { stat, dice: [d1, d2], modifier, total, outcome };
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(payload);
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
  const videoProvider = opts.videoProvider ?? new MockVideoProvider();
  const billing = opts.billingAdapter ?? new ExternalGrantBillingAdapter();
  const workDir = opts.workDir ?? path.join(os.tmpdir(), "cinema-rpg-connector");
  fs.mkdirSync(workDir, { recursive: true });

  const jobs = new Map<string, RenderJob>();
  const idempotencyIndex = new Map<string, string>();

  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      const method = req.method ?? "GET";

      if (method === "GET" && url.pathname === "/health") {
        return sendJson(res, 200, {
          ok: true,
          service: "cinema-engine-connector",
          videoProvider: videoProvider.name,
          billingMode: billing.mode,
          maxCaseAttachmentBytes: 32 * 1024 * 1024,
        });
      }

      if (opts.apiKey) {
        const auth = req.headers["x-cinema-api-key"];
        if (auth !== opts.apiKey) {
          return sendJson(res, 401, { ok: false, error: "Invalid API key" });
        }
      }

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
          artifactUrl: `file://${tsxPath}`,
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
    console.log(`Cinema Engine Connector listening on http://127.0.0.1:${port}`);
  });
}
