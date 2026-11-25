import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCasePlanSnapshot,
  createInitialSession,
  explainCasePlan,
  ingestScenarioText,
  parseConversationalAction,
  processGameTurn,
} from "./index.js";

test("buildCasePlanSnapshot and explainCasePlan guide through the 4 simplified steps", async () => {
  const initialPlan = buildCasePlanSnapshot({});
  assert.equal(initialPlan.currentStage, "book_intake");
  assert.equal(initialPlan.items.length, 4);
  assert.equal(initialPlan.items[0].status, "active");

  const fullExplain = await explainCasePlan({ plan: initialPlan });
  assert.match(fullExplain.replyText, /4 понятных шага/);
  assert.equal(fullExplain.highlightedItemId, "step_1_book");

  const step3Explain = await explainCasePlan({
    plan: initialPlan,
    userQuestion: "Объясни подробно третий пункт про смету",
  });
  assert.equal(step3Explain.highlightedItemId, "step_3_draft");
  assert.match(step3Explain.replyText, /3\. Черновик и смета/);

  const { worldBible } = await ingestScenarioText({
    scenarioText: "Следопыт Мира входит в таверну, где ждёт Шрам.",
    stylePreset: "noir",
  });
  const session = createInitialSession({ worldBible, scenarioText: "Таверна" });
  await processGameTurn({ session, playerInput: "Осматриваю зал" });

  const midPlan = buildCasePlanSnapshot({ session });
  assert.equal(midPlan.currentStage, "story_play");
  assert.equal(midPlan.items[0].status, "done");
  assert.equal(midPlan.items[1].status, "active");
});

test("parseConversationalAction maps spoken/written Russian phrases to simplified pipeline intents", () => {
  assert.equal(
    parseConversationalAction({
      message: "Разъясни все пункты дела",
      hasSession: false,
      hasShots: false,
      hasDraft: false,
      hasFinalJob: false,
    }).kind,
    "explain_plan"
  );

  const startIntent = parseConversationalAction({
    message: "Начни по тестовой главе в стиле нуар",
    hasSession: false,
    hasShots: false,
    hasDraft: false,
    hasFinalJob: false,
  });
  assert.equal(startIntent.kind, "start_book");
  if (startIntent.kind === "start_book") {
    assert.equal(startIntent.stylePreset, "noir");
  }

  assert.equal(
    parseConversationalAction({
      message: "Собери черновик фильма",
      hasSession: true,
      hasShots: true,
      hasDraft: false,
      hasFinalJob: false,
    }).kind,
    "build_draft"
  );

  const editCam = parseConversationalAction({
    message: "Во 2 кадре сделай крупный план",
    hasSession: true,
    hasShots: true,
    hasDraft: true,
    hasFinalJob: false,
  });
  assert.equal(editCam.kind, "edit_draft");
  if (editCam.kind === "edit_draft") {
    assert.equal(editCam.shotIndex, 2);
    assert.equal(editCam.cameraMode, "close_up");
  }

  assert.equal(
    parseConversationalAction({
      message: "Утверждаю, выпускай финальный фильм",
      hasSession: true,
      hasShots: true,
      hasDraft: true,
      hasFinalJob: false,
    }).kind,
    "approve_film"
  );
});
