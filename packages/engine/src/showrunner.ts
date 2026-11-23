import { z } from "zod";
import {
  type EpisodeCredits,
  type EpisodeCut,
  type GameEvent,
  type ShowrunnerBeat,
  type ShotSpec,
  type TariffTier,
  type WorldBible,
  EpisodeCreditsSchema,
  EpisodeCutSchema,
} from "@cinema-rpg/shared";
import type { StructuredLLMClient } from "./llm.js";

const LLMShowrunnerSchema = z.object({
  episodeTitle: z.string().min(1),
  logline: z.string().min(1),
  beatSummaries: z.array(
    z.object({
      shotId: z.string().min(1),
      summary: z.string().min(1),
    })
  ),
});

export interface BuildShowrunnerCutParams {
  cutId?: string;
  caseId: string;
  worldBible: WorldBible;
  events: GameEvent[];
  shots: ShotSpec[];
  tariffTier?: TariffTier;
  maxShots?: number;
  targetMaxDurationSec?: number;
  customTitle?: string;
  directedBy?: string;
  includeCredits?: boolean;
  llm?: StructuredLLMClient;
}

export interface ShowrunnerCutResult {
  episodeCut: EpisodeCut;
  droppedShotIds: string[];
  totalDurationSec: number;
  source: "llm" | "fallback";
}

function shotDurationSec(shot: ShotSpec): number {
  return shot.audio?.audioDurationSec ?? shot.durationInFrames / shot.fps;
}

function cloneShot(shot: ShotSpec): ShotSpec {
  return JSON.parse(JSON.stringify(shot)) as ShotSpec;
}

/**
 * Dramaturgically compresses an arbitrary-length solo RPG session (e.g. 15–30 turns)
 * into a cohesive 3-Act Episode Cut targeting 2–5 minutes (default max 12 shots / 240s),
 * preserving Setup (Act I), Rising Action turning points (Act II), and Climax + Resolution (Act III).
 */
export async function buildShowrunnerCut(
  params: BuildShowrunnerCutParams
): Promise<ShowrunnerCutResult> {
  if (params.shots.length === 0) {
    throw new Error("Cannot build Showrunner EpisodeCut from zero shots");
  }

  const maxShots = Math.max(1, params.maxShots ?? 12);
  const targetMaxDurationSec = Math.max(15, params.targetMaxDurationSec ?? 240);
  const tariffTier = params.tariffTier ?? "po_episode_stylized";
  const n = params.shots.length;

  // Score every shot for dramaturgical salience
  const scored = params.shots.map((shot, idx) => {
    const ev = params.events[idx];
    const dur = shotDurationSec(shot);
    if (idx === 0 || idx === n - 1) {
      return { idx, shot, ev, dur, score: Number.POSITIVE_INFINITY };
    }

    const weight = ev?.dramaticWeight ?? 3;
    const outcome = ev?.diceRoll?.outcome;
    const rollBonus = outcome === "fail" ? 9 : outcome === "success" ? 8 : 4;
    const actionAnim = shot.actors.some((a) =>
      ["draw_weapon", "attack_melee", "cast_spell", "dodge", "fall"].includes(a.animation)
    )
      ? 5
      : 0;

    // Boost inciting incident (early Act I/II transition) and late climax
    const relPos = idx / Math.max(1, n - 1);
    const arcBonus =
      relPos >= 0.65 && relPos <= 0.9 && weight >= 4
        ? 25
        : relPos >= 0.15 && relPos <= 0.35 && weight >= 3
          ? 14
          : 0;

    return {
      idx,
      shot,
      ev,
      dur,
      score: weight * 10 + rollBonus + actionAnim + arcBonus,
    };
  });

  const selectedIndices = new Set<number>();
  let runningDuration = 0;

  // Always include opening shot (Act I Setup) and closing shot (Act III Resolution)
  selectedIndices.add(0);
  runningDuration += scored[0].dur;
  if (n > 1 && maxShots >= 2) {
    selectedIndices.add(n - 1);
    runningDuration += scored[n - 1].dur;
  }

  // Greedily pick highest-salience middle beats within maxShots and targetMaxDurationSec
  const middleCandidates = scored
    .filter((item) => !selectedIndices.has(item.idx))
    .sort((a, b) => b.score - a.score || a.idx - b.idx);

  for (const cand of middleCandidates) {
    if (selectedIndices.size >= maxShots) break;
    if (runningDuration + cand.dur > targetMaxDurationSec && selectedIndices.size >= 3) {
      continue;
    }
    selectedIndices.add(cand.idx);
    runningDuration += cand.dur;
  }

  const orderedIndices = Array.from(selectedIndices).sort((a, b) => a - b);
  const droppedShotIds = params.shots
    .filter((_, idx) => !selectedIndices.has(idx))
    .map((s) => s.id);

  // Clone selected shots and prevent monotonous 3x identical camera modes
  const curatedShots: ShotSpec[] = orderedIndices.map((origIdx) =>
    cloneShot(params.shots[origIdx])
  );
  for (let i = 2; i < curatedShots.length; i++) {
    const m0 = curatedShots[i - 2].camera.mode;
    const m1 = curatedShots[i - 1].camera.mode;
    const m2 = curatedShots[i].camera.mode;
    if (m0 === m1 && m1 === m2) {
      curatedShots[i].camera.mode =
        m2 === "over_the_shoulder" ? "medium_two_shot" : "over_the_shoulder";
    }
  }

  const m = curatedShots.length;
  const beats: ShowrunnerBeat[] = curatedShots.map((shot, pos) => {
    const origIdx = orderedIndices[pos];
    const ev = params.events[origIdx];
    const { act, actTitle, dramaticFunction } = classifyBeatPosition(pos, m);
    const fallbackSummary = buildFallbackBeatSummary(ev, shot, origIdx + 1);
    return {
      shotId: shot.id,
      act,
      actTitle,
      dramaticFunction,
      summary: fallbackSummary,
    };
  });

  let episodeTitle = params.customTitle?.trim() || params.worldBible.title;
  let logline = buildFallbackLogline(params.worldBible, params.events, orderedIndices);
  let source: "llm" | "fallback" = "fallback";

  if (params.llm && params.llm.mode === "openai_compatible") {
    try {
      const llmOut = await params.llm.generateJson({
        systemPrompt:
          "Ты AI Showrunner киностудии на русском. Сожми выбранные сцены НРИ в заголовок эпизода, краткий логлайн (1–2 предложения) и лаконичные описания каждого шота (beatSummaries). Отвечай строго JSON.",
        userPrompt: [
          `Мир: ${params.worldBible.title} (${params.worldBible.sourceExcerptSummary})`,
          `Выбранные шоты (${m} из ${n}):`,
          ...beats.map((b) => `- ${b.shotId} [Акт ${b.act}, ${b.dramaticFunction}]: ${b.summary}`),
        ].join("\n"),
        schema: LLMShowrunnerSchema,
      });
      if (llmOut) {
        if (!params.customTitle?.trim()) {
          episodeTitle = llmOut.episodeTitle;
        }
        logline = llmOut.logline;
        const summaryByShot = new Map(
          llmOut.beatSummaries.map((item) => [item.shotId, item.summary])
        );
        for (const beat of beats) {
          const s = summaryByShot.get(beat.shotId);
          if (s) beat.summary = s;
        }
        source = "llm";
      }
    } catch {
      source = "fallback";
    }
  }

  const credits: EpisodeCredits = EpisodeCreditsSchema.parse({
    enabled: params.includeCredits ?? true,
    episodeTitle,
    subtitle: "Интерактивный 3-актный эпизод · Книга в кино",
    starring: params.worldBible.characters.map((c) => `${c.name} — ${roleLabelRu(c.role)}`),
    directedBy: params.directedBy?.trim() || "Игрок и AI Showrunner · ФиксАР",
    footerNote: "Создано в паке cinema-rpg/book-to-film-rpg",
    durationSec: 4,
  });

  const creditsSec = credits.enabled ? credits.durationSec : 0;
  const shotsDurationSec = curatedShots.reduce((acc, s) => acc + shotDurationSec(s), 0);
  const totalDurationSec = Number((shotsDurationSec + creditsSec).toFixed(2));

  const episodeCut = EpisodeCutSchema.parse({
    id: params.cutId ?? `ep_${params.worldBible.id}`,
    caseId: params.caseId,
    worldBibleId: params.worldBible.id,
    tariffTier,
    title: episodeTitle,
    logline,
    beats,
    credits,
    shots: curatedShots,
    animaticApproved: false,
  });

  return {
    episodeCut,
    droppedShotIds,
    totalDurationSec,
    source,
  };
}

function classifyBeatPosition(
  pos: number,
  total: number
): {
  act: 1 | 2 | 3;
  actTitle: string;
  dramaticFunction: ShowrunnerBeat["dramaticFunction"];
} {
  if (total === 1) {
    return { act: 1, actTitle: "Акт I · Завязка и финал", dramaticFunction: "setup" };
  }
  if (total === 2) {
    return pos === 0
      ? { act: 1, actTitle: "Акт I · Завязка", dramaticFunction: "setup" }
      : { act: 3, actTitle: "Акт III · Развязка", dramaticFunction: "resolution" };
  }
  if (pos === 0) {
    return { act: 1, actTitle: "Акт I · Завязка", dramaticFunction: "setup" };
  }
  if (pos === total - 1) {
    return { act: 3, actTitle: "Акт III · Развязка", dramaticFunction: "resolution" };
  }
  if (total >= 4 && pos === total - 2) {
    return { act: 3, actTitle: "Акт III · Кульминация", dramaticFunction: "climax" };
  }
  const ratio = pos / (total - 1);
  if (ratio <= 0.28) {
    return { act: 1, actTitle: "Акт I · Завязка", dramaticFunction: "inciting_incident" };
  }
  return {
    act: 2,
    actTitle: "Акт II · Конфликт и повышение ставок",
    dramaticFunction: "rising_action",
  };
}

function buildFallbackBeatSummary(
  ev: GameEvent | undefined,
  shot: ShotSpec,
  turnNumber: number
): string {
  if (!ev) {
    return `Сцена #${turnNumber}: ${shot.v2vPrompt.slice(0, 120)}`;
  }
  const rollTag = ev.diceRoll
    ? ` [2d6=${ev.diceRoll.total}, ${ev.diceRoll.outcome}]`
    : "";
  const cleanNarrative = ev.narrativeText.replace(/\s+/g, " ").trim();
  const snippet =
    cleanNarrative.length > 130 ? `${cleanNarrative.slice(0, 127)}…` : cleanNarrative;
  return `Ход #${ev.turnIndex}${rollTag}: ${snippet}`;
}

function buildFallbackLogline(
  wb: WorldBible,
  events: GameEvent[],
  orderedIndices: number[]
): string {
  const hero = wb.characters.find((c) => c.role === "protagonist") ?? wb.characters[0];
  const antagonist = wb.characters.find((c) => c.id !== hero.id);
  const rivalPart = antagonist ? ` в противостоянии с персонажем ${antagonist.name}` : "";
  return `Герой ${hero.name} проходит через ${orderedIndices.length} ключевых сцен мира «${wb.title}»${rivalPart}, где исход решают броски 2d6 (из ${Math.max(events.length, orderedIndices.length)} сыгранных ходов).`;
}

function roleLabelRu(role: WorldBible["characters"][number]["role"]): string {
  switch (role) {
    case "protagonist":
      return "главный герой";
    case "antagonist":
      return "антагонист";
    case "ally":
      return "союзник";
    default:
      return "персонаж";
  }
}
