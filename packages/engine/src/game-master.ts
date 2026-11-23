import crypto from "node:crypto";
import { z } from "zod";
import {
  type DiceRoll,
  type EpisodeCut,
  type GameEvent,
  type ShotSpec,
  type WorldBible,
  ShotSpecSchema,
} from "@cinema-rpg/shared";
import type { StructuredLLMClient } from "./llm.js";

export interface RuntimeSessionState {
  sessionId: string;
  caseId: string;
  worldBible: WorldBible;
  scenarioText: string;
  activeLocationId: string;
  actorZones: Record<string, string>;
  events: GameEvent[];
  shots: ShotSpec[];
  episodeCut?: EpisodeCut;
  shotMedia: Record<
    string,
    {
      pngUrl?: string;
      mp4Url?: string;
      wavUrl?: string;
      vttUrl?: string;
      srtUrl?: string;
      wavPath?: string;
      durationSec?: number;
      tsxPath?: string;
    }
  >;
  animaticUrl?: string;
  animaticApproved: boolean;
}

export function roll2d6Check(stat: string, modifier: number): DiceRoll {
  const d1 = crypto.randomInt(1, 7);
  const d2 = crypto.randomInt(1, 7);
  const total = d1 + d2 + modifier;
  const outcome = total <= 6 ? "fail" : total <= 9 ? "partial" : "success";
  return { stat, dice: [d1, d2], modifier, total, outcome };
}

const LLMTurnSchema = z.object({
  narrativeText: z.string().min(1),
  npcReply: z.string().min(1),
  npcSpeakerId: z.string().min(1),
  emotion: z.enum(["neutral", "tense", "angry", "whisper", "joy", "fear"]),
  heroToZoneId: z.string().min(1),
  heroAnimation: z.enum([
    "idle", "walk", "run", "talk_calm", "talk_intense",
    "draw_weapon", "attack_melee", "cast_spell", "dodge", "fall", "sit", "inspect",
  ]),
  npcAnimation: z.enum([
    "idle", "walk", "run", "talk_calm", "talk_intense",
    "draw_weapon", "attack_melee", "cast_spell", "dodge", "fall", "sit", "inspect",
  ]),
  cameraMode: z.enum([
    "establishing", "medium_two_shot", "over_the_shoulder",
    "close_up", "dolly_track", "low_angle_hero",
  ]),
  suggestedChoices: z.array(z.string()).min(2).max(4),
  dramaticWeight: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  v2vPrompt: z.string().min(1),
});

export interface TurnResult {
  event: GameEvent;
  shot: ShotSpec;
  suggestedChoices: string[];
  source: "llm" | "fallback";
}

function inferActionIntent(input: string): {
  animation: ShotSpec["actors"][number]["animation"];
  targetZoneIndex: number;
  isDialogue: boolean;
  isCombat: boolean;
} {
  const lower = input.toLowerCase();
  if (/удар|атак|клин|меч|выстрел|бой|напад|обнаж/.test(lower)) {
    return { animation: "draw_weapon", targetZoneIndex: 1, isDialogue: false, isCombat: true };
  }
  if (/говор|спро|убед|переговор|крик|приказ|угроз/.test(lower)) {
    return { animation: "talk_intense", targetZoneIndex: 1, isDialogue: true, isCombat: false };
  }
  if (/осмотр|исслед|иска|след|тайник|изуч|улик/.test(lower)) {
    return { animation: "inspect", targetZoneIndex: 2, isDialogue: false, isCombat: false };
  }
  if (/бег|уклон|прят|отступ|прыг/.test(lower)) {
    return { animation: "dodge", targetZoneIndex: 2, isDialogue: false, isCombat: false };
  }
  return { animation: "walk", targetZoneIndex: 1, isDialogue: false, isCombat: false };
}

export function createInitialSession(params: {
  worldBible: WorldBible;
  scenarioText: string;
  caseId?: string;
}): RuntimeSessionState {
  const loc = params.worldBible.locations[0];
  const actorZones: Record<string, string> = {};
  params.worldBible.characters.forEach((c, idx) => {
    const z = loc.zones[idx % loc.zones.length];
    actorZones[c.id] = z.id;
  });
  return {
    sessionId: `sess_${crypto.randomBytes(6).toString("hex")}`,
    caseId: params.caseId ?? "case_f6db507d967c49d9",
    worldBible: params.worldBible,
    scenarioText: params.scenarioText,
    activeLocationId: loc.id,
    actorZones,
    events: [],
    shots: [],
    shotMedia: {},
    animaticApproved: false,
  };
}

export async function processGameTurn(params: {
  session: RuntimeSessionState;
  playerInput: string;
  statToRoll?: string;
  llm?: StructuredLLMClient;
}): Promise<TurnResult> {
  const { session, playerInput } = params;
  const wb = session.worldBible;
  const location =
    wb.locations.find((l) => l.id === session.activeLocationId) ?? wb.locations[0];
  const hero = wb.characters.find((c) => c.role === "protagonist") ?? wb.characters[0];
  const npc = wb.characters.find((c) => c.id !== hero.id) ?? hero;
  const turnIndex = session.events.length + 1;

  const statName = params.statToRoll?.trim() || Object.keys(hero.stats)[0] || "Смекалка";
  const modifier = hero.stats[statName] ?? 1;
  const diceRoll = roll2d6Check(statName, modifier);

  const heroFromZone = session.actorZones[hero.id] ?? location.zones[0].id;
  const npcZone = session.actorZones[npc.id] ?? location.zones[1 % location.zones.length].id;

  let narrativeText: string;
  let npcReply: string;
  let emotion: GameEvent["dialogues"][number]["emotion"];
  let heroToZoneId: string;
  let heroAnimation: ShotSpec["actors"][number]["animation"];
  let npcAnimation: ShotSpec["actors"][number]["animation"];
  let cameraMode: ShotSpec["camera"]["mode"];
  let suggestedChoices: string[];
  let dramaticWeight: GameEvent["dramaticWeight"];
  let v2vPrompt: string;
  let source: "llm" | "fallback" = "fallback";

  if (params.llm && params.llm.mode === "openai_compatible") {
    try {
      const recent = session.events
        .slice(-4)
        .map((e) => `Ход ${e.turnIndex}: Игрок: "${e.playerInput}" -> ${e.narrativeText}`)
        .join("\n");
      const llmOut = await params.llm.generateJson({
        systemPrompt: [
          "Ты ИИ-Мастер и 3D-оператор соло-НРИ на русском. Отвечай строго JSON по схеме.",
          "Никогда не принимай следующее решение за игрока; дай 3 коротких варианта хода в suggestedChoices.",
          `Доступные зоны локации "${location.name}": ${location.zones.map((z) => z.id).join(", ")}.`,
          `Персонажи: hero="${hero.id}" (${hero.name}), npc="${npc.id}" (${npc.name}).`,
          "v2vPrompt пиши на английском — кинематографично, без личных данных.",
        ].join(" "),
        userPrompt: [
          `Сценарий: ${wb.sourceExcerptSummary}`,
          recent ? `Прошлые ходы:\n${recent}` : "Это первый ход сцены.",
          `Ход игрока: "${playerInput}"`,
          `Бросок 2d6 (${diceRoll.stat} +${diceRoll.modifier}): [${diceRoll.dice[0]}+${diceRoll.dice[1]}]+${diceRoll.modifier} = ${diceRoll.total} (${diceRoll.outcome}).`,
        ].join("\n\n"),
        schema: LLMTurnSchema,
      });
      if (llmOut) {
        const validZone = location.zones.some((z) => z.id === llmOut.heroToZoneId)
          ? llmOut.heroToZoneId
          : heroFromZone;
        narrativeText = llmOut.narrativeText;
        npcReply = llmOut.npcReply;
        emotion = llmOut.emotion;
        heroToZoneId = validZone;
        heroAnimation = llmOut.heroAnimation;
        npcAnimation = llmOut.npcAnimation;
        cameraMode = llmOut.cameraMode;
        suggestedChoices = llmOut.suggestedChoices;
        dramaticWeight = llmOut.dramaticWeight;
        v2vPrompt = llmOut.v2vPrompt;
        source = "llm";
      } else {
        throw new Error("empty");
      }
    } catch {
      source = "fallback";
      const fb = buildFallbackTurn({
        wb,
        location,
        hero,
        npc,
        heroFromZone,
        turnIndex,
        playerInput,
        diceRoll,
      });
      ({
        narrativeText,
        npcReply,
        emotion,
        heroToZoneId,
        heroAnimation,
        npcAnimation,
        cameraMode,
        suggestedChoices,
        dramaticWeight,
        v2vPrompt,
      } = fb);
    }
  } else {
    const fb = buildFallbackTurn({
      wb,
      location,
      hero,
      npc,
      heroFromZone,
      turnIndex,
      playerInput,
      diceRoll,
    });
    ({
      narrativeText,
      npcReply,
      emotion,
      heroToZoneId,
      heroAnimation,
      npcAnimation,
      cameraMode,
      suggestedChoices,
      dramaticWeight,
      v2vPrompt,
    } = fb);
  }

  session.actorZones[hero.id] = heroToZoneId;

  const shotId = `turn-${String(turnIndex).padStart(2, "0")}-${crypto.randomBytes(2).toString("hex")}`;
  const shot: ShotSpec = ShotSpecSchema.parse({
    id: shotId,
    locationId: location.id,
    durationInFrames: 96, // 4 seconds at 24fps (syncs to TTS length in audio pass)
    fps: 24,
    camera: {
      mode: cameraMode,
      focusActorId: hero.id,
      secondaryActorId: npc.id,
      dollyAmount: diceRoll.outcome === "success" ? 0.55 : 0.3,
      panDegrees: 0,
    },
    actors: [
      {
        characterId: hero.id,
        fromZoneId: heroFromZone,
        toZoneId: heroToZoneId,
        animation: heroAnimation,
        lookAtTargetId: npc.id,
      },
      ...(npc.id !== hero.id
        ? [
            {
              characterId: npc.id,
              fromZoneId: npcZone,
              animation: npcAnimation,
              lookAtTargetId: hero.id,
            },
          ]
        : []),
    ],
    audio: {
      dialogueLine: {
        speakerId: npc.id,
        text: npcReply,
        emotion,
      },
      sfxTags: [
        {
          tag: heroAnimation === "draw_weapon" ? "sword_unsheathe" : "footsteps_wood",
          atFrame: 24,
        },
      ],
    },
    v2vPrompt,
  });

  const event: GameEvent = {
    id: `evt_${crypto.randomBytes(5).toString("hex")}`,
    turnIndex,
    timestamp: new Date().toISOString(),
    playerInput,
    diceRoll,
    narrativeText,
    dialogues: [
      { speakerId: hero.id, text: playerInput, emotion: "tense" },
      { speakerId: npc.id, text: npcReply, emotion },
    ],
    dramaticWeight,
  };

  session.events.push(event);
  session.shots.push(shot);
  session.episodeCut = undefined;
  session.animaticApproved = false;

  return { event, shot, suggestedChoices, source };
}

function buildFallbackTurn(ctx: {
  wb: WorldBible;
  location: WorldBible["locations"][number];
  hero: WorldBible["characters"][number];
  npc: WorldBible["characters"][number];
  heroFromZone: string;
  turnIndex: number;
  playerInput: string;
  diceRoll: DiceRoll;
}) {
  const { wb, location, hero, npc, heroFromZone, turnIndex, playerInput, diceRoll } = ctx;
  const intent = inferActionIntent(playerInput);
  const targetZone =
    location.zones[intent.targetZoneIndex % location.zones.length] ?? location.zones[0];
  const heroToZoneId = targetZone.id === heroFromZone
    ? location.zones[(turnIndex) % location.zones.length].id
    : targetZone.id;

  const outcomeLine =
    diceRoll.outcome === "success"
      ? `Уверенный успех (${diceRoll.total}): ${hero.name} перехватывает инициативу в зоне «${targetZone.label}».`
      : diceRoll.outcome === "partial"
        ? `Частичный успех с ценой (${diceRoll.total}): замысел удаётся, но ${npc.name} замечает слабую точку и повышает ставки.`
        : `Опасный провал (${diceRoll.total}): обстановка резко обостряется — ${npc.name} делает неожиданный ход, отрезая лёгкий путь.`;

  const npcReply =
    diceRoll.outcome === "success"
      ? `Ладно, ${hero.name}, ты застал меня врасплох. Слушай внимательно — второй попытки у тебя не будет.`
      : diceRoll.outcome === "partial"
        ? `Смелый шаг... Но за правду в «${wb.title}» платят вдвойне.`
        : `Ошибся дверью, ${hero.name}. Теперь правила здесь диктую я!`;

  const narrativeText = `${outcomeLine} ${npc.name} прищуривается и отвечает: «${npcReply}»`;

  const cameraMode: ShotSpec["camera"]["mode"] =
    turnIndex === 1
      ? "over_the_shoulder"
      : diceRoll.outcome === "success"
        ? "low_angle_hero"
        : diceRoll.outcome === "fail"
          ? "close_up"
          : intent.isDialogue
            ? "over_the_shoulder"
            : "dolly_track";

  return {
    narrativeText,
    npcReply,
    emotion: (diceRoll.outcome === "fail" ? "angry" : "tense") as GameEvent["dialogues"][number]["emotion"],
    heroToZoneId,
    heroAnimation: intent.animation,
    npcAnimation: (intent.isCombat ? "draw_weapon" : "talk_intense") as ShotSpec["actors"][number]["animation"],
    cameraMode,
    suggestedChoices: [
      `Потребовать у ${npc.name} прямого ответа и положить руку на клинок`,
      `Осмотреть зону «${location.zones[2 % location.zones.length].label}» в поисках скрытой улики`,
      `Попытаться переманить ${npc.name} на свою сторону (Харизма)`,
    ],
    dramaticWeight: (diceRoll.outcome === "success" || diceRoll.outcome === "fail" ? 5 : 4) as GameEvent["dramaticWeight"],
    v2vPrompt: `${wb.globalStylePrompt} ${cameraMode.replace(/_/g, " ")} shot inside ${location.name}: ${hero.visualDescription} confronting ${npc.visualDescription}, ${diceRoll.outcome} beat.`,
  };
}
