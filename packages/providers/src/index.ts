import type { CostEstimate, StylePresetId, TariffTier } from "@cinema-rpg/shared";

export interface VideoRenderRequest {
  previzVideoPath: string;
  prompt: string;
  characterRefUrls: string[];
  locationRefUrl?: string;
  durationSec: number;
  aspectRatio: "16:9";
  stylePreset: StylePresetId;
}

export interface VideoJobStatus {
  status: "queued" | "running" | "done" | "failed";
  videoUrl?: string;
  error?: string;
}

export interface VideoProvider {
  readonly name: string;
  renderShotV2V(req: VideoRenderRequest): Promise<{ providerJobId: string }>;
  pollJob(providerJobId: string): Promise<VideoJobStatus>;
}

export interface AudioProvider {
  readonly name: string;
  synthesizeSpeech(params: {
    text: string;
    voiceId: string;
    emotion: string;
  }): Promise<{ audioPath: string; durationSec: number }>;
}

export interface BillingAdapter {
  readonly mode: "external_issuer" | "fixar_native_credits";
  verifyPaymentGrant(params: {
    caseId: string;
    episodeCutId: string;
    tariffTier: TariffTier;
    paymentGrantId: string;
  }): Promise<{ ok: boolean; reason?: string }>;
}

/**
 * Zero-cost mock video provider for local/CI verification before turning on
 * paid cloud V2V APIs (Kling / Runway / Veo / fal.ai).
 */
export class MockVideoProvider implements VideoProvider {
  readonly name = "mock-v2v";

  async renderShotV2V(req: VideoRenderRequest): Promise<{ providerJobId: string }> {
    const id = `mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    return { providerJobId: `${id}:${encodeURIComponent(req.previzVideoPath)}` };
  }

  async pollJob(providerJobId: string): Promise<VideoJobStatus> {
    const [, encodedPath = "previz.mp4"] = providerJobId.split(":");
    return {
      status: "done",
      videoUrl: `mock://rendered/${decodeURIComponent(encodedPath)}`,
    };
  }
}

/**
 * Placeholder adapter for fal.ai / Kling / Runway cloud V2V APIs.
 * Reads credentials from environment only; never stores secrets in pack YAML.
 */
export class CloudV2VProviderSkeleton implements VideoProvider {
  readonly name = "cloud-v2v";
  constructor(
    private readonly endpoint: string,
    private readonly apiKey: string
  ) {}

  async renderShotV2V(_req: VideoRenderRequest): Promise<{ providerJobId: string }> {
    if (!this.apiKey || !this.endpoint) {
      throw new Error("CloudV2VProvider requires endpoint and apiKey");
    }
    throw new Error(
      `CloudV2VProvider (${this.endpoint}) is ready for Phase 0/3 vendor binding (Kling/Runway/fal.ai).`
    );
  }

  async pollJob(_providerJobId: string): Promise<VideoJobStatus> {
    throw new Error("CloudV2VProvider.pollJob not yet bound to vendor SDK");
  }
}

export class ExternalGrantBillingAdapter implements BillingAdapter {
  readonly mode = "external_issuer" as const;

  async verifyPaymentGrant(params: {
    caseId: string;
    episodeCutId: string;
    tariffTier: TariffTier;
    paymentGrantId: string;
  }): Promise<{ ok: boolean; reason?: string }> {
    if (!params.paymentGrantId.startsWith("grant_")) {
      return {
        ok: false,
        reason:
          "Оплата не подтверждена: требуется действительный payment_grant_id после утверждения сметы.",
      };
    }
    return { ok: true };
  }
}

/**
 * Computes transparent pre-render estimate in FixAR credits (10 credits = 1 RUB)
 * and enforces the 32 MB FixAR case-material attachment budget guideline.
 */
export function estimateEpisodeCost(params: {
  episodeCutId: string;
  tariffTier: TariffTier;
  shotCount: number;
  totalDurationSec: number;
}): CostEstimate {
  const tierTable: Record<
    TariffTier,
    { baseCredits: number; perSecCredits: number; rerolls: number }
  > = {
    po_animatic: { baseCredits: 290, perSecCredits: 0, rerolls: 0 },
    po_episode_stylized: { baseCredits: 890, perSecCredits: 4, rerolls: 3 },
    po_episode_cinema: { baseCredits: 1890, perSecCredits: 8, rerolls: 8 },
  };
  const cfg = tierTable[params.tariffTier];
  const priceCredits = Math.ceil(
    cfg.baseCredits + params.totalDurationSec * cfg.perSecCredits
  );
  return {
    episodeCutId: params.episodeCutId,
    tariffTier: params.tariffTier,
    shotCount: params.shotCount,
    totalDurationSec: Number(params.totalDurationSec.toFixed(1)),
    includedRerolls: cfg.rerolls,
    priceCredits,
    priceRubApprox: Number((priceCredits / 10).toFixed(2)),
    maxCaseAttachmentBytes: 32 * 1024 * 1024,
  };
}

export {
  AUDIO_SAMPLE_RATE,
  MultiTierRoleAudioProvider,
  computeFramesFromAudioDuration,
  decodeMonoWavSamples,
  encodeMonoWav,
  formatSubtitlesSrt,
  formatSubtitlesWebVtt,
  mergeEpisodeSubtitles,
  probeAudioDurationSec,
  synthesizeTurnAudioTrack,
  type RoleLineInput,
  type SynthesizedTurnAudio,
} from "./audio.js";
