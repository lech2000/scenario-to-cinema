import test from "node:test";
import assert from "node:assert/strict";
import { createInitialSession, ingestScenarioText, processGameTurn } from "./index.js";
import { buildShowrunnerCut } from "./showrunner.js";
import type { StructuredLLMClient } from "./llm.js";

test("buildShowrunnerCut compresses a 16-turn session into a 3-act EpisodeCut within target limits", async () => {
  const { worldBible } = await ingestScenarioText({
    scenarioText:
      "Проклятие Серебряного Леса. Следопыт Мира встречает наёмника Шрама в таверне «Старый Ворон».",
    stylePreset: "arcane_3d",
    heroName: "Мира",
  });

  const session = createInitialSession({
    worldBible,
    scenarioText: "Проклятие Серебряного Леса",
  });

  for (let i = 0; i < 16; i++) {
    await processGameTurn({
      session,
      playerInput:
        i === 12
          ? "Обнажаю клинок и наношу решающий удар!"
          : `Ход разведки номер ${i + 1}`,
    });
    // Make middle filler turns low dramatic weight and turn 13 (index 12) high-stakes climax
    if (i >= 2 && i <= 10) {
      session.events[i].dramaticWeight = 1;
      session.shots[i].camera.mode = "over_the_shoulder";
    }
    if (i === 12) {
      session.events[i].dramaticWeight = 5;
    }
    session.shots[i].audio = {
      ...(session.shots[i].audio ?? { sfxTags: [] }),
      audioDurationSec: 25,
    };
  }

  const firstId = session.shots[0].id;
  const climaxId = session.shots[12].id;
  const lastId = session.shots[15].id;

  const result = await buildShowrunnerCut({
    caseId: "case_f6db507d967c49d9",
    worldBible,
    events: session.events,
    shots: session.shots,
    maxShots: 6,
    targetMaxDurationSec: 180,
    customTitle: "Серебряный лес: Ночь клинков",
  });

  assert.equal(result.source, "fallback");
  assert.equal(result.episodeCut.shots.length, 6);
  assert.equal(result.droppedShotIds.length, 10);
  assert.ok(result.totalDurationSec <= 184); // <= 180s shots + 4s credits

  const keptIds = result.episodeCut.shots.map((s) => s.id);
  assert.equal(keptIds[0], firstId, "Preserves opening shot as Act I Setup");
  assert.equal(keptIds[keptIds.length - 1], lastId, "Preserves closing shot as Act III Resolution");
  assert.ok(keptIds.includes(climaxId), "Preserves high-stakes climax turn #13");

  // Verify strict chronological ordering
  const origPositions = keptIds.map((id) => session.shots.findIndex((s) => s.id === id));
  for (let i = 1; i < origPositions.length; i++) {
    assert.ok(origPositions[i] > origPositions[i - 1], "Selected shots stay chronological");
  }

  // Verify 3-act structure & credits
  const acts = new Set(result.episodeCut.beats?.map((b) => b.act));
  assert.deepEqual(Array.from(acts).sort(), [1, 2, 3]);
  assert.equal(result.episodeCut.credits?.enabled, true);
  assert.equal(result.episodeCut.credits?.episodeTitle, "Серебряный лес: Ночь клинков");
  assert.ok((result.episodeCut.credits?.starring.length ?? 0) >= 1);
});

test("buildShowrunnerCut applies LLM title, logline, and beat summaries when available", async () => {
  const { worldBible } = await ingestScenarioText({
    scenarioText: "Таверна у тракта. Мира допрашивает Шрама.",
    stylePreset: "noir",
    heroName: "Мира",
  });
  const session = createInitialSession({ worldBible, scenarioText: "Таверна" });
  await processGameTurn({ session, playerInput: "Требую ответа" });
  await processGameTurn({ session, playerInput: "Бросаю вызов" });

  const mockLlm: StructuredLLMClient = {
    mode: "openai_compatible",
    async generateJson({ schema }) {
      return schema.parse({
        episodeTitle: "Тени Старого Ворона",
        logline: "Два хода решают судьбу пропавшего обоза.",
        beatSummaries: [
          { shotId: session.shots[0].id, summary: "Мира прижимает Шрама к стене." },
          { shotId: session.shots[1].id, summary: "Развязка при свете свечей." },
        ],
      });
    },
  };

  const res = await buildShowrunnerCut({
    caseId: "case_f6db507d967c49d9",
    worldBible,
    events: session.events,
    shots: session.shots,
    llm: mockLlm,
  });

  assert.equal(res.source, "llm");
  assert.equal(res.episodeCut.title, "Тени Старого Ворона");
  assert.equal(res.episodeCut.beats?.[0]?.summary, "Мира прижимает Шрама к стене.");
});
