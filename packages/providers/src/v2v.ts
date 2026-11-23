import fs from "node:fs";
import path from "node:path";
import type {
  CharacterProfile,
  StylePresetId,
  TariffTier,
  WorldBible,
} from "@cinema-rpg/shared";
import type {
  VideoJobStatus,
  VideoProvider,
  VideoRenderRequest,
} from "./index.js";
import { MockVideoProvider } from "./index.js";

export type CloudV2VVendor = "fal" | "runway" | "kling";

export interface CloudV2VProviderOptions {
  vendor: CloudV2VVendor;
  apiKey: string;
  model?: string;
  endpoint?: string;
  fetchImpl?: typeof fetch;
}

const DEFAULT_MODELS: Record<CloudV2VVendor, string> = {
  fal: "fal-ai/kling-video/v1.6/standard/video-to-video",
  runway: "gen3a_turbo",
  kling: "kling-v1-6-v2v",
};

function toVideoUriOrUploadPayload(previzVideoPath: string): string {
  if (
    previzVideoPath.startsWith("http://") ||
    previzVideoPath.startsWith("https://") ||
    previzVideoPath.startsWith("data:")
  ) {
    return previzVideoPath;
  }
  if (fs.existsSync(previzVideoPath)) {
    const stat = fs.statSync(previzVideoPath);
    // Encode compact local test clips (< 8 MB) as data URIs for direct API submission
    if (stat.size <= 8 * 1024 * 1024) {
      const b64 = fs.readFileSync(previzVideoPath).toString("base64");
      return `data:video/mp4;base64,${b64}`;
    }
  }
  return previzVideoPath;
}

/**
 * Production Cloud Video-to-Video provider supporting `fal.ai`, `Runway`, and `Kling` REST APIs.
 * Reads keys solely from environment/options; supports custom `fetchImpl` for deterministic tests.
 */
export class CloudV2VProvider implements VideoProvider {
  readonly name: string;
  readonly vendor: CloudV2VVendor;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly endpoint: string;
  private readonly fetchFn: typeof fetch;

  constructor(opts: CloudV2VProviderOptions) {
    if (!opts.apiKey) {
      throw new Error(`CloudV2VProvider (${opts.vendor}) requires a non-empty apiKey`);
    }
    this.vendor = opts.vendor;
    this.apiKey = opts.apiKey;
    this.model = opts.model ?? process.env.V2V_MODEL ?? DEFAULT_MODELS[opts.vendor];
    this.endpoint = (
      opts.endpoint ??
      process.env.V2V_ENDPOINT ??
      (opts.vendor === "fal"
        ? "https://queue.fal.run"
        : opts.vendor === "runway"
          ? "https://api.dev.runwayml.com"
          : "https://api.klingai.com")
    ).replace(/\/$/, "");
    this.fetchFn = opts.fetchImpl ?? fetch;
    this.name = `cloud-${opts.vendor}`;
  }

  async renderShotV2V(req: VideoRenderRequest): Promise<{ providerJobId: string }> {
    const videoUri = toVideoUriOrUploadPayload(req.previzVideoPath);

    if (this.vendor === "fal") {
      const url = `${this.endpoint}/${this.model}`;
      const res = await this.fetchFn(url, {
        method: "POST",
        headers: {
          Authorization: `Key ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          video_url: videoUri,
          prompt: req.prompt,
          reference_image_urls: req.characterRefUrls,
          location_image_url: req.locationRefUrl,
          aspect_ratio: req.aspectRatio,
          duration: String(Math.min(10, Math.max(5, Math.round(req.durationSec)))),
          ...(req.seed !== undefined ? { seed: req.seed } : {}),
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`fal.ai V2V submit HTTP ${res.status}: ${body.slice(0, 240)}`);
      }
      const data = (await res.json()) as { request_id?: string };
      if (!data.request_id) {
        throw new Error("fal.ai V2V response missing request_id");
      }
      return { providerJobId: `fal:${this.model}:${data.request_id}` };
    }

    if (this.vendor === "runway") {
      const url = `${this.endpoint}/v1/video_to_video`;
      const res = await this.fetchFn(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "X-Runway-Version": "2024-11-06",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          videoUri,
          promptText: req.prompt,
          references: req.characterRefUrls.map((uri) => ({ type: "image", uri })),
          ratio: "1280:720",
          ...(req.seed !== undefined ? { seed: req.seed } : {}),
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Runway V2V submit HTTP ${res.status}: ${body.slice(0, 240)}`);
      }
      const data = (await res.json()) as { id?: string };
      if (!data.id) {
        throw new Error("Runway V2V response missing task id");
      }
      return { providerJobId: `runway:${data.id}` };
    }

    // Kling / generic V2V REST
    const url = `${this.endpoint}/v1/videos/video2video`;
    const res = await this.fetchFn(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model_name: this.model,
        video_url: videoUri,
        prompt: req.prompt,
        character_ref_urls: req.characterRefUrls,
        location_ref_url: req.locationRefUrl,
        duration_sec: req.durationSec,
        aspect_ratio: req.aspectRatio,
        ...(req.seed !== undefined ? { seed: req.seed } : {}),
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Kling V2V submit HTTP ${res.status}: ${body.slice(0, 240)}`);
    }
    const data = (await res.json()) as { task_id?: string; data?: { task_id?: string } };
    const taskId = data.task_id ?? data.data?.task_id;
    if (!taskId) {
      throw new Error("Kling V2V response missing task_id");
    }
    return { providerJobId: `kling:${taskId}` };
  }

  async pollJob(providerJobId: string): Promise<VideoJobStatus> {
    if (providerJobId.startsWith("fal:")) {
      const rest = providerJobId.slice(4);
      const lastColon = rest.lastIndexOf(":");
      const model = rest.slice(0, lastColon);
      const requestId = rest.slice(lastColon + 1);
      const statusRes = await this.fetchFn(
        `${this.endpoint}/${model}/requests/${requestId}/status`,
        { headers: { Authorization: `Key ${this.apiKey}` } }
      );
      if (!statusRes.ok) {
        return { status: "failed", error: `fal status HTTP ${statusRes.status}` };
      }
      const st = (await statusRes.json()) as { status?: string; error?: string };
      if (st.status === "IN_QUEUE") return { status: "queued" };
      if (st.status === "IN_PROGRESS") return { status: "running" };
      if (st.status === "COMPLETED") {
        const res = await this.fetchFn(
          `${this.endpoint}/${model}/requests/${requestId}`,
          { headers: { Authorization: `Key ${this.apiKey}` } }
        );
        if (!res.ok) {
          return { status: "failed", error: `fal result HTTP ${res.status}` };
        }
        const payload = (await res.json()) as {
          video?: { url?: string };
          video_url?: string;
        };
        const videoUrl = payload.video?.url ?? payload.video_url;
        return videoUrl
          ? { status: "done", videoUrl }
          : { status: "failed", error: "fal result missing video.url" };
      }
      return { status: "failed", error: st.error ?? `Unknown fal status: ${st.status}` };
    }

    if (providerJobId.startsWith("runway:")) {
      const taskId = providerJobId.slice("runway:".length);
      const res = await this.fetchFn(`${this.endpoint}/v1/tasks/${taskId}`, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "X-Runway-Version": "2024-11-06",
        },
      });
      if (!res.ok) {
        return { status: "failed", error: `Runway poll HTTP ${res.status}` };
      }
      const data = (await res.json()) as {
        status?: string;
        output?: string[];
        failure?: string;
      };
      if (data.status === "PENDING" || data.status === "THROTTLED") {
        return { status: "queued" };
      }
      if (data.status === "RUNNING") return { status: "running" };
      if (data.status === "SUCCEEDED" && data.output?.[0]) {
        return { status: "done", videoUrl: data.output[0] };
      }
      return { status: "failed", error: data.failure ?? `Runway status ${data.status}` };
    }

    if (providerJobId.startsWith("kling:")) {
      const taskId = providerJobId.slice("kling:".length);
      const res = await this.fetchFn(
        `${this.endpoint}/v1/videos/video2video/${taskId}`,
        { headers: { Authorization: `Bearer ${this.apiKey}` } }
      );
      if (!res.ok) {
        return { status: "failed", error: `Kling poll HTTP ${res.status}` };
      }
      const data = (await res.json()) as {
        task_status?: string;
        video_url?: string;
        data?: { task_status?: string; task_result?: { videos?: Array<{ url?: string }> } };
      };
      const st = data.task_status ?? data.data?.task_status;
      if (st === "submitted" || st === "queued") return { status: "queued" };
      if (st === "processing" || st === "running") return { status: "running" };
      const url = data.video_url ?? data.data?.task_result?.videos?.[0]?.url;
      if (st === "succeed" && url) return { status: "done", videoUrl: url };
      return { status: "failed", error: `Kling status: ${st}` };
    }

    return { status: "failed", error: `Unrecognized providerJobId: ${providerJobId}` };
  }
}

/**
 * Selects a live `CloudV2VProvider` when environment credentials are present
 * (`FAL_KEY`, `RUNWAYML_API_SECRET`, `KLING_API_KEY`, or `V2V_API_KEY`),
 * otherwise returns `MockVideoProvider` for zero-cost local & CI execution.
 */
export function createVideoProviderFromEnv(
  env: NodeJS.ProcessEnv = process.env
): VideoProvider {
  const explicitVendor = env.V2V_VENDOR as CloudV2VVendor | undefined;
  if (env.FAL_KEY && (!explicitVendor || explicitVendor === "fal")) {
    return new CloudV2VProvider({
      vendor: "fal",
      apiKey: env.FAL_KEY,
      model: env.V2V_MODEL,
      endpoint: env.V2V_ENDPOINT,
    });
  }
  if (
    env.RUNWAYML_API_SECRET &&
    (!explicitVendor || explicitVendor === "runway")
  ) {
    return new CloudV2VProvider({
      vendor: "runway",
      apiKey: env.RUNWAYML_API_SECRET,
      model: env.V2V_MODEL,
      endpoint: env.V2V_ENDPOINT,
    });
  }
  if (env.KLING_API_KEY && (!explicitVendor || explicitVendor === "kling")) {
    return new CloudV2VProvider({
      vendor: "kling",
      apiKey: env.KLING_API_KEY,
      model: env.V2V_MODEL,
      endpoint: env.V2V_ENDPOINT,
    });
  }
  if (env.V2V_API_KEY) {
    return new CloudV2VProvider({
      vendor: explicitVendor ?? "fal",
      apiKey: env.V2V_API_KEY,
      model: env.V2V_MODEL,
      endpoint: env.V2V_ENDPOINT,
    });
  }
  return new MockVideoProvider();
}

export const TARIFF_FREE_REROLLS: Record<TariffTier, number> = {
  po_animatic: 0,
  po_episode_stylized: 3,
  po_episode_cinema: 8,
};

export const EXTRA_REROLL_CREDITS: Record<TariffTier, number> = {
  po_animatic: 50,
  po_episode_stylized: 120,
  po_episode_cinema: 240,
};

export interface RerollAllowanceCheck {
  allowed: boolean;
  isFreeReroll: boolean;
  extraCreditsCharged: number;
  remainingFreeRerollsAfter: number;
  reason?: string;
}

/**
 * Evaluates whether a single-shot V2V reroll is covered by the tariff's included
 * free-reroll quota, or requires an extra payment grant.
 */
export function evaluateRerollAllowance(params: {
  tariffTier: TariffTier;
  includedRerolls: number;
  usedFreeRerolls: number;
  extraPaymentGrantId?: string;
}): RerollAllowanceCheck {
  const { tariffTier, includedRerolls, usedFreeRerolls, extraPaymentGrantId } = params;
  if (usedFreeRerolls < includedRerolls) {
    return {
      allowed: true,
      isFreeReroll: true,
      extraCreditsCharged: 0,
      remainingFreeRerollsAfter: includedRerolls - (usedFreeRerolls + 1),
    };
  }

  const extraCost = EXTRA_REROLL_CREDITS[tariffTier];
  if (!extraPaymentGrantId || !extraPaymentGrantId.startsWith("grant_")) {
    return {
      allowed: false,
      isFreeReroll: false,
      extraCreditsCharged: extraCost,
      remainingFreeRerollsAfter: 0,
      reason: `Лимит бесплатных пересъёмок по тарифу (${includedRerolls}) исчерпан. Доп. пересъёмка одного шота стоит ${extraCost} кредитов — передайте действительный extraPaymentGrantId.`,
    };
  }

  return {
    allowed: true,
    isFreeReroll: false,
    extraCreditsCharged: extraCost,
    remainingFreeRerollsAfter: 0,
  };
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Generates deterministic Character Identity Reference Sheets (`.svg`) for every
 * character in `WorldBible` who doesn't already have external `refSheetUrls`.
 */
export function ensureCharacterReferenceSheets(params: {
  worldBible: WorldBible;
  outDir: string;
  publicUrlPrefix?: string;
}): WorldBible {
  fs.mkdirSync(params.outDir, { recursive: true });
  const prefix = params.publicUrlPrefix ?? "/media";

  for (const char of params.worldBible.characters) {
    if (char.refSheetUrls.length > 0) continue;
    const safeId = `${params.worldBible.id}_${char.id}`.replace(/[^a-zA-Z0-9_-]/g, "_");
    const fileName = `ref_${safeId}.svg`;
    const filePath = path.join(params.outDir, fileName);
    const svg = buildCharacterRefSvg(char, params.worldBible.stylePreset);
    fs.writeFileSync(filePath, svg, "utf-8");
    char.refSheetUrls = [`${prefix}/${fileName}`];
  }
  return params.worldBible;
}

function buildCharacterRefSvg(
  char: CharacterProfile,
  stylePreset: StylePresetId
): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#14181c"/>
  <rect x="16" y="16" width="480" height="480" rx="20" fill="#1d232a" stroke="${escapeXml(char.accentColor)}" stroke-width="4"/>
  <circle cx="256" cy="148" r="54" fill="#e6c7a8"/>
  <path d="M168 370 C168 250, 344 250, 344 370 Z" fill="${escapeXml(char.accentColor)}"/>
  <text x="256" y="420" text-anchor="middle" fill="#eef4f0" font-family="sans-serif" font-size="24" font-weight="bold">${escapeXml(char.name)} (${escapeXml(char.role)})</text>
  <text x="256" y="452" text-anchor="middle" fill="#98a99f" font-family="sans-serif" font-size="14">Style: ${escapeXml(stylePreset)} · Rig: ${escapeXml(char.mannequinRigId)}</text>
</svg>`;
}
