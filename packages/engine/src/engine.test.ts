import test from "node:test";
import assert from "node:assert/strict";
import {
  createInitialSession,
  ingestScenarioText,
  processGameTurn,
} from "./index.js";

const SAMPLE_CHAPTER = `
Проклятие Серебряного Леса
На мокрой лесной дороге следопыт Мира находит следы повозки, которые обрываются у серебряного дерева.
Деревня впереди пуста, но в окне старой таверны горит свет. У порога ждёт наёмник Шрам, пряча руку под плащом.
`;

test("ingestScenarioText extracts a valid WorldBible and runs 2d6 turns with ShotSpecs", async () => {
  const { worldBible, source } = await ingestScenarioText({
    scenarioText: SAMPLE_CHAPTER,
    stylePreset: "arcane_3d",
    heroName: "Мира",
  });
  assert.equal(source, "fallback");
  assert.equal(worldBible.stylePreset, "arcane_3d");
  assert.ok(worldBible.locations.length >= 1);
  assert.ok(worldBible.characters.some((c) => c.name === "Мира"));

  const session = createInitialSession({
    worldBible,
    scenarioText: SAMPLE_CHAPTER,
  });

  const t1 = await processGameTurn({
    session,
    playerInput: "Подхожу к Шраму и спрашиваю про исчезнувшую повозку.",
    statToRoll: "Смекалка",
  });
  assert.equal(t1.event.turnIndex, 1);
  assert.ok(t1.event.diceRoll);
  assert.ok(t1.shot.id.startsWith("turn-01-"));
  assert.equal(session.events.length, 1);
  assert.equal(session.shots.length, 1);
});
