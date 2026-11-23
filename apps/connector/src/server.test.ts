import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { createConnectorServer } from "./server.js";

const sampleWorld = {
  id: "wb_1",
  title: "Test World",
  sourceExcerptSummary: "Tavern scene",
  stylePreset: "arcane_3d",
  globalStylePrompt: "Stylized 3D cinema",
  locations: [
    {
      id: "tavern",
      name: "Tavern",
      atmosphere: "candlelight",
      lightingPreset: "candlelight",
      floorMaterial: "#2c221b",
      zones: [{ id: "bar", label: "Bar", bounds: [2, 2, 2], center: [0, 0, 0], props: [] }],
    },
  ],
  characters: [
    {
      id: "hero",
      name: "Mira",
      role: "protagonist",
      visualDescription: "Ranger",
      mannequinRigId: "cloaked",
      accentColor: "#2e8b57",
      voiceId: "v_mira",
      refSheetUrls: [],
      stats: { agility: 3 },
      inventory: [],
    },
  ],
  plotGraph: [],
};

const sampleShot = {
  id: "shot_01",
  locationId: "tavern",
  durationInFrames: 72,
  fps: 24,
  camera: { mode: "close_up", focusActorId: "hero", dollyAmount: 0.2, panDegrees: 0 },
  actors: [{ characterId: "hero", fromZoneId: "bar", animation: "idle" }],
  v2vPrompt: "Mira listens quietly",
};

test("connector enforces animatic approval, payment grant, and idempotency", async () => {
  const server = createConnectorServer({ enableLiveRaea: false });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;

  try {
    // 1. Health & estimate
    const estRes = await fetch(`${base}/v1/estimates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        episodeCutId: "ep_1",
        tariffTier: "po_episode_stylized",
        shotCount: 15,
        totalDurationSec: 120,
      }),
    });
    assert.equal(estRes.status, 200);
    const estJson = (await estRes.json()) as {
      estimate: { priceCredits: number; includedRerolls: number };
    };
    assert.equal(estJson.estimate.includedRerolls, 3);
    assert.ok(estJson.estimate.priceCredits > 1000);

    // 2. Rejects unapproved animatic
    const unapprovedRes = await fetch(`${base}/v1/jobs/final-film`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        caseId: "case_f6db507d967c49d9",
        idempotencyKey: "ep_1_render",
        paymentGrantId: "grant_ok_123",
        episodeCut: {
          id: "ep_1",
          caseId: "case_f6db507d967c49d9",
          worldBibleId: "wb_1",
          tariffTier: "po_episode_stylized",
          shots: [sampleShot],
          animaticApproved: false,
        },
        worldBible: sampleWorld,
      }),
    });
    assert.equal(unapprovedRes.status, 422);

    // 3. Rejects missing/invalid payment grant
    const unpaidRes = await fetch(`${base}/v1/jobs/final-film`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        caseId: "case_f6db507d967c49d9",
        idempotencyKey: "ep_1_render",
        paymentGrantId: "invalid_token",
        episodeCut: {
          id: "ep_1",
          caseId: "case_f6db507d967c49d9",
          worldBibleId: "wb_1",
          tariffTier: "po_episode_stylized",
          shots: [sampleShot],
          animaticApproved: true,
        },
        worldBible: sampleWorld,
      }),
    });
    assert.equal(unpaidRes.status, 402);

    // 4. Accepts valid grant and deduplicates by idempotencyKey
    const validPayload = JSON.stringify({
      caseId: "case_f6db507d967c49d9",
      idempotencyKey: "ep_1_render_paid",
      paymentGrantId: "grant_paid_001",
      episodeCut: {
        id: "ep_1",
        caseId: "case_f6db507d967c49d9",
        worldBibleId: "wb_1",
        tariffTier: "po_episode_stylized",
        shots: [sampleShot],
        animaticApproved: true,
      },
      worldBible: sampleWorld,
    });
    const first = await fetch(`${base}/v1/jobs/final-film`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: validPayload,
    });
    assert.equal(first.status, 202);
    const firstJson = (await first.json()) as { job: { jobId: string; status: string } };
    assert.equal(firstJson.job.status, "done");

    const retry = await fetch(`${base}/v1/jobs/final-film`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: validPayload,
    });
    assert.equal(retry.status, 200);
    const retryJson = (await retry.json()) as {
      job: { jobId: string };
      deduplicated: boolean;
    };
    assert.equal(retryJson.deduplicated, true);
    assert.equal(retryJson.job.jobId, firstJson.job.jobId);
  } finally {
    server.close();
  }
});

test("interactive session runs book ingest -> 2d6 turn -> TSX compile -> animatic estimate -> approve", async () => {
  const server = createConnectorServer({ enableLiveRaea: false });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;

  try {
    const uiRes = await fetch(`${base}/`);
    assert.equal(uiRes.status, 200);
    assert.match(await uiRes.text(), /Книга в кино/);

    const sessRes = await fetch(`${base}/v1/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scenarioText:
          "Проклятие Серебряного Леса. Следопыт Мира заходит в таверну, где её ждёт наёмник Шрам.",
        stylePreset: "arcane_3d",
        heroName: "Мира",
      }),
    });
    assert.equal(sessRes.status, 201);
    const sessJson = (await sessRes.json()) as { session: { sessionId: string } };
    const sid = sessJson.session.sessionId;

    const turnRes = await fetch(`${base}/v1/sessions/${sid}/turns`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        playerInput: "Подхожу к столу и требую правду у Шрама.",
        statToRoll: "Смекалка",
        renderMp4: false,
      }),
    });
    assert.equal(turnRes.status, 200);
    const turnJson = (await turnRes.json()) as {
      event: { turnIndex: number };
      shot: { id: string };
      media: { tsxPath: string };
    };
    assert.equal(turnJson.event.turnIndex, 1);
    assert.ok(turnJson.media.tsxPath.endsWith(".tsx"));

    const animRes = await fetch(`${base}/v1/sessions/${sid}/animatic`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tariffTier: "po_episode_stylized" }),
    });
    assert.equal(animRes.status, 200);
    const animJson = (await animRes.json()) as { estimate: { priceCredits: number } };
    assert.ok(animJson.estimate.priceCredits > 0);

    const appRes = await fetch(`${base}/v1/sessions/${sid}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tariffTier: "po_episode_stylized",
        paymentGrantId: "grant_test_001",
      }),
    });
    assert.equal(appRes.status, 202);
  } finally {
    server.close();
  }
});
