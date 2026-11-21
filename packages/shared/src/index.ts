import { z } from "zod";

export const Vec3Schema = z.tuple([z.number(), z.number(), z.number()]);
export type Vec3 = z.infer<typeof Vec3Schema>;

export const StylePresetIdSchema = z.enum([
  "photoreal_cinema",
  "arcane_3d",
  "anime",
  "noir",
]);
export type StylePresetId = z.infer<typeof StylePresetIdSchema>;

export const TariffTierSchema = z.enum([
  "po_animatic",
  "po_episode_stylized",
  "po_episode_cinema",
]);
export type TariffTier = z.infer<typeof TariffTierSchema>;

export const PropSchema = z.object({
  kind: z.enum([
    "table",
    "chair",
    "door",
    "pillar",
    "crate",
    "torch",
    "bed",
    "tree",
    "wall",
  ]),
  pos: Vec3Schema,
  rotY: z.number().optional(),
  scale: Vec3Schema.optional(),
});

export const SpatialZoneSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  bounds: Vec3Schema,
  center: Vec3Schema,
  props: z.array(PropSchema).default([]),
});

export const LocationBlueprintSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  atmosphere: z.string().min(1),
  lightingPreset: z.enum([
    "daylight",
    "sunset",
    "candlelight",
    "moonlight",
    "neon",
    "foggy",
  ]),
  floorMaterial: z.string().default("#2b2620"),
  zones: z.array(SpatialZoneSchema).min(1),
  moodboardUrl: z.string().url().optional(),
});
export type LocationBlueprint = z.infer<typeof LocationBlueprintSchema>;

export const CharacterProfileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  role: z.enum(["protagonist", "ally", "antagonist", "npc"]),
  visualDescription: z.string().min(1),
  mannequinRigId: z.enum([
    "human_m",
    "human_f",
    "armored",
    "cloaked",
    "creature_small",
  ]),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  voiceId: z.string().min(1),
  refSheetUrls: z.array(z.string().url()).default([]),
  stats: z.record(z.string(), z.number().int()).default({}),
  inventory: z.array(z.string()).default([]),
});
export type CharacterProfile = z.infer<typeof CharacterProfileSchema>;

export const PlotNodeSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  locationId: z.string().min(1),
  requiredCharacterIds: z.array(z.string()).default([]),
  triggers: z.array(z.string()).default([]),
  nextNodeIds: z.array(z.string()).default([]),
  status: z.enum(["locked", "active", "resolved", "skipped"]).default("locked"),
});

export const WorldBibleSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  sourceExcerptSummary: z.string().min(1),
  stylePreset: StylePresetIdSchema,
  globalStylePrompt: z.string().min(1),
  locations: z.array(LocationBlueprintSchema).min(1),
  characters: z.array(CharacterProfileSchema).min(1),
  plotGraph: z.array(PlotNodeSchema).default([]),
});
export type WorldBible = z.infer<typeof WorldBibleSchema>;

export const DiceRollSchema = z.object({
  stat: z.string().min(1),
  dice: z.tuple([z.number().int().min(1).max(6), z.number().int().min(1).max(6)]),
  modifier: z.number().int(),
  total: z.number().int(),
  outcome: z.enum(["fail", "partial", "success"]),
});
export type DiceRoll = z.infer<typeof DiceRollSchema>;

export const DialogueLineSchema = z.object({
  speakerId: z.string().min(1),
  text: z.string().min(1),
  emotion: z.enum(["neutral", "tense", "angry", "whisper", "joy", "fear"]),
});
export type DialogueLine = z.infer<typeof DialogueLineSchema>;

export const GameEventSchema = z.object({
  id: z.string().min(1),
  turnIndex: z.number().int().min(0),
  timestamp: z.string().min(1),
  playerInput: z.string().min(1),
  diceRoll: DiceRollSchema.optional(),
  narrativeText: z.string().min(1),
  dialogues: z.array(DialogueLineSchema).default([]),
  dramaticWeight: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
  ]),
  livePrevizClipUrl: z.string().url().optional(),
});
export type GameEvent = z.infer<typeof GameEventSchema>;

export const AnimationClipIdSchema = z.enum([
  "idle",
  "walk",
  "run",
  "talk_calm",
  "talk_intense",
  "draw_weapon",
  "attack_melee",
  "cast_spell",
  "dodge",
  "fall",
  "sit",
  "inspect",
]);

export const CameraModeSchema = z.enum([
  "establishing",
  "medium_two_shot",
  "over_the_shoulder",
  "close_up",
  "dolly_track",
  "low_angle_hero",
]);

export const ShotActorActionSchema = z.object({
  characterId: z.string().min(1),
  fromZoneId: z.string().min(1),
  toZoneId: z.string().min(1).optional(),
  animation: AnimationClipIdSchema,
  lookAtTargetId: z.string().min(1).optional(),
});

export const ShotSpecSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]+$/),
  locationId: z.string().min(1),
  durationInFrames: z.number().int().min(12).max(900),
  fps: z.union([z.literal(24), z.literal(30)]).default(24),
  camera: z.object({
    mode: CameraModeSchema,
    focusActorId: z.string().optional(),
    secondaryActorId: z.string().optional(),
    dollyAmount: z.number().min(-1).max(1).default(0),
    panDegrees: z.number().min(-90).max(90).default(0),
  }),
  actors: z.array(ShotActorActionSchema).min(1),
  audio: z
    .object({
      dialogueLine: DialogueLineSchema.optional(),
      ttsAudioPath: z.string().optional(),
      sfxTags: z
        .array(z.object({ tag: z.string(), atFrame: z.number().int().min(0) }))
        .default([]),
    })
    .optional(),
  v2vPrompt: z.string().min(1),
});
export type ShotSpec = z.infer<typeof ShotSpecSchema>;

export const EpisodeCutSchema = z.object({
  id: z.string().min(1),
  caseId: z.string().min(1),
  worldBibleId: z.string().min(1),
  tariffTier: TariffTierSchema,
  shots: z.array(ShotSpecSchema).min(1),
  animaticApproved: z.boolean().default(false),
});
export type EpisodeCut = z.infer<typeof EpisodeCutSchema>;

export const CostEstimateSchema = z.object({
  episodeCutId: z.string(),
  tariffTier: TariffTierSchema,
  shotCount: z.number().int().min(1),
  totalDurationSec: z.number().positive(),
  includedRerolls: z.number().int().min(0),
  priceCredits: z.number().int().min(0),
  priceRubApprox: z.number().min(0),
  maxCaseAttachmentBytes: z.number().int().default(32 * 1024 * 1024),
});
export type CostEstimate = z.infer<typeof CostEstimateSchema>;

export const RenderJobStatusSchema = z.enum([
  "queued",
  "rendering_3d",
  "synthesizing_audio",
  "rendering_v2v",
  "mastering",
  "done",
  "failed",
]);

export const RenderJobSchema = z.object({
  jobId: z.string(),
  kind: z.enum(["live_previz", "animatic", "final_film", "reroll_shot"]),
  caseId: z.string(),
  idempotencyKey: z.string(),
  status: RenderJobStatusSchema,
  progressPct: z.number().min(0).max(100),
  etaSeconds: z.number().int().min(0),
  artifactUrl: z.string().optional(),
  generatedTsxPath: z.string().optional(),
  error: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type RenderJob = z.infer<typeof RenderJobSchema>;
