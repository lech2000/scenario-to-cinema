import crypto from "node:crypto";
import {
  type StylePresetId,
  type WorldBible,
  WorldBibleSchema,
} from "@cinema-rpg/shared";
import type { StructuredLLMClient } from "./llm.js";

const STYLE_PROMPTS: Record<StylePresetId, string> = {
  photoreal_cinema:
    "35mm anamorphic live-action cinema, natural film grain, moody practical lighting, shallow depth of field.",
  arcane_3d:
    "Painterly stylized 3D cinema inspired by Arcane, expressive brushstrokes, volumetric candlelight, dramatic chiaroscuro.",
  anime:
    "High-budget theatrical anime cinematography, crisp cel-shading, dynamic rim lighting, rich painted backgrounds.",
  noir:
    "High-contrast neo-noir cinematography, rain-slicked shadows, tungsten practical lights, stark silhouettes.",
};

function detectLighting(text: string): WorldBible["locations"][number]["lightingPreset"] {
  const lower = text.toLowerCase();
  if (/неон|кибер|мегаполис|сервер|голограм/.test(lower)) return "neon";
  if (/лун|ноч|полноч|кладбищ|тьм/.test(lower)) return "moonlight";
  if (/туман|болот|дожд|лес|сыр/.test(lower)) return "foggy";
  if (/закат|сумерк|пустын/.test(lower)) return "sunset";
  if (/солнц|полдень|площад|утр/.test(lower)) return "daylight";
  return "candlelight";
}

function extractCandidateNames(text: string): string[] {
  const matches = text.match(/(?:^|[\s«"(])([А-ЯЁ][а-яё]{2,14}|[A-Z][a-z]{2,14})/gm) ?? [];
  const stop = new Set([
    "Глава", "Сцена", "Таверна", "Лес", "Леса", "Город", "Ночь", "Утро", "Вечер",
    "Когда", "Потом", "Вдруг", "Здесь", "Там", "Она", "Они", "Его", "Это", "На", "Под", "У", "В",
    "Проклятие", "Серебряного", "Следопыт", "Наёмник", "Старый", "Ворон", "Деревня",
    "Chapter", "Scene", "The", "And", "But", "When", "Then", "Night",
  ]);
  const counts = new Map<string, number>();
  for (const raw of matches) {
    const clean = raw.replace(/^[\s«"(]+/, "").trim();
    if (!clean || stop.has(clean)) continue;
    counts.set(clean, (counts.get(clean) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name)
    .slice(0, 3);
}

/**
 * Extracts a structured WorldBible from an arbitrary 1-20 page book chapter.
 * Uses the configured LLM when available; falls back to deterministic extraction
 * so the full prototype works out-of-the-box without external API keys.
 */
export async function ingestScenarioText(params: {
  scenarioText: string;
  stylePreset: StylePresetId;
  heroName?: string;
  title?: string;
  llm?: StructuredLLMClient;
}): Promise<{ worldBible: WorldBible; source: "llm" | "fallback" }> {
  const trimmed = params.scenarioText.trim();
  if (!trimmed) {
    throw new Error("Scenario text must not be empty");
  }

  if (params.llm && params.llm.mode === "openai_compatible") {
    try {
      const llmResult = await params.llm.generateJson({
        systemPrompt: [
          "You are WorldBuilder for a Russian tabletop RPG + 3D cinema engine.",
          "Convert the user's book excerpt into a strict JSON WorldBible matching the schema.",
          "Keep coordinates inside x:[-4,4], y:0, z:[-3.5,3.0]. Provide 2-3 spatial zones per location and 2-3 characters with distinct hex accentColor.",
          `Use stylePreset="${params.stylePreset}" and globalStylePrompt="${STYLE_PROMPTS[params.stylePreset]}".`,
        ].join(" "),
        userPrompt: `Hero hint: ${params.heroName || "auto"}\nTitle hint: ${params.title || "auto"}\n\nExcerpt:\n${trimmed.slice(0, 14000)}`,
        schema: WorldBibleSchema,
      });
      if (llmResult) {
        return { worldBible: llmResult, source: "llm" };
      }
    } catch {
      // Fall through to deterministic fallback cleanly so prototype stays usable offline
    }
  }

  const firstLine = trimmed.split(/\r?\n/).find((l) => l.trim().length > 2)?.trim() ?? "Безымянный сценарий";
  const title = params.title?.trim() || firstLine.replace(/^#+\s*/, "").slice(0, 72);
  const lightingPreset = detectLighting(trimmed);
  const names = extractCandidateNames(trimmed);

  const heroName = params.heroName?.trim() || names[0] || "Мира";
  const npc1Name = names.find((n) => n !== heroName) || "Сторож Ива";
  const npc2Name = names.find((n) => n !== heroName && n !== npc1Name) || "Шрам";

  const sentences = trimmed
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean);
  const excerptSummary = sentences.slice(0, 3).join(" ").slice(0, 320);

  const wb: WorldBible = {
    id: `wb_${crypto.randomBytes(5).toString("hex")}`,
    title,
    sourceExcerptSummary: excerptSummary || title,
    stylePreset: params.stylePreset,
    globalStylePrompt: STYLE_PROMPTS[params.stylePreset],
    locations: [
      {
        id: "loc_main",
        name: title.slice(0, 48),
        atmosphere: `${lightingPreset} lighting, atmospheric scene adapted from scenario text`,
        lightingPreset,
        floorMaterial: lightingPreset === "neon" ? "#1d2230" : "#2c221b",
        zones: [
          {
            id: "entrance",
            label: "Вход / край сцены",
            bounds: [2, 3, 2],
            center: [0.5, 0, 2.2],
            props: [{ kind: "door", pos: [0.5, 1.2, 5.2], scale: [0.8, 1.2, 0.12] }],
          },
          {
            id: "center_table",
            label: "Центр / стол переговоров",
            bounds: [3, 2, 2.5],
            center: [-1.2, 0, -1.5],
            props: [{ kind: "table", pos: [-3.2, 0.42, -1.8], scale: [0.75, 0.42, 0.55] }],
          },
          {
            id: "side_cover",
            label: "Укрытие / стойка",
            bounds: [3, 2, 2],
            center: [1.8, 0, -0.4],
            props: [
              { kind: "crate", pos: [3.8, 0.5, -0.6], scale: [0.55, 0.5, 1.4] },
              { kind: "torch", pos: [4.2, 2.1, -1.6], scale: [0.1, 0.25, 0.1] },
            ],
          },
        ],
      },
    ],
    characters: [
      {
        id: "hero",
        name: heroName,
        role: "protagonist",
        visualDescription: `${heroName}, protagonist of "${title}", expressive silhouette, weathered travel gear`,
        mannequinRigId: "cloaked",
        accentColor: "#2e8b57",
        voiceId: "voice_ru_hero_01",
        refSheetUrls: [],
        stats: { Ловкость: 2, Смекалка: 2, Воля: 1, Харизма: 1 },
        inventory: ["фонарь", "дневник", "клинок"],
      },
      {
        id: "npc_primary",
        name: npc1Name,
        role: "antagonist",
        visualDescription: `${npc1Name}, key figure from "${title}", tense posture, dramatic attire`,
        mannequinRigId: "armored",
        accentColor: "#c0392b",
        voiceId: "voice_ru_npc_01",
        refSheetUrls: [],
        stats: { Сила: 2, Хитрость: 2 },
        inventory: ["ключ", "свёрток"],
      },
      {
        id: "npc_witness",
        name: npc2Name,
        role: "npc",
        visualDescription: `${npc2Name}, watchful witness from "${title}", cautious stance`,
        mannequinRigId: "human_m",
        accentColor: "#3b7dd8",
        voiceId: "voice_ru_npc_02",
        refSheetUrls: [],
        stats: { Наблюдательность: 2 },
        inventory: ["записка"],
      },
    ],
    plotGraph: [
      {
        id: "beat_opening",
        title: "Завязка сцены",
        summary: sentences[0] ?? "Герой входит в сцену и оценивает обстановку.",
        locationId: "loc_main",
        requiredCharacterIds: ["hero", "npc_primary"],
        triggers: ["start"],
        nextNodeIds: ["beat_conflict"],
        status: "active",
      },
      {
        id: "beat_conflict",
        title: "Обострение и выбор",
        summary: sentences[1] ?? "Раскрывается скрытая угроза или тайна сценария.",
        locationId: "loc_main",
        requiredCharacterIds: ["hero", "npc_primary"],
        triggers: ["turn>=2"],
        nextNodeIds: ["beat_climax"],
        status: "locked",
      },
      {
        id: "beat_climax",
        title: "Развязка эпизода",
        summary: sentences[2] ?? "Решающее действие меняет расклад сил.",
        locationId: "loc_main",
        requiredCharacterIds: ["hero", "npc_primary", "npc_witness"],
        triggers: ["turn>=4"],
        nextNodeIds: [],
        status: "locked",
      },
    ],
  };

  return { worldBible: WorldBibleSchema.parse(wb), source: "fallback" };
}
