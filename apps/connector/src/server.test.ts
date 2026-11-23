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
    const sessJson = (await sessRes.json()) as {
      session: {
        sessionId: string;
        worldBible: { characters: Array<{ refSheetUrls: string[] }> };
      };
    };
    const sid = sessJson.session.sessionId;
    const firstRefUrl = sessJson.session.worldBible.characters[0]?.refSheetUrls[0];
    assert.ok(firstRefUrl?.startsWith("/media/ref_"));
    const refSvgRes = await fetch(`${base}${firstRefUrl}`);
    assert.equal(refSvgRes.status, 200);
    assert.match(refSvgRes.headers.get("content-type") ?? "", /image\/svg\+xml/);
    assert.match(await refSvgRes.text(), /<svg/);

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
      shot: { id: string; durationInFrames: number; fps: number };
      audio: { durationSec: number; durationInFrames: number; cues: Array<{ speakerName: string }> };
      media: { tsxPath: string; wavUrl: string; srtUrl: string; vttUrl: string };
    };
    assert.equal(turnJson.event.turnIndex, 1);
    assert.ok(turnJson.media.tsxPath.endsWith(".tsx"));
    assert.equal(turnJson.shot.durationInFrames, turnJson.audio.durationInFrames);
    assert.ok(turnJson.audio.durationSec > 3);
    assert.ok(turnJson.audio.cues.length >= 3);

    const vttRes = await fetch(`${base}${turnJson.media.vttUrl}`);
    assert.equal(vttRes.status, 200);
    assert.match(await vttRes.text(), /^WEBVTT/);

    const animRes = await fetch(`${base}/v1/sessions/${sid}/animatic`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tariffTier: "po_episode_stylized" }),
    });
    assert.equal(animRes.status, 200);
    const animJson = (await animRes.json()) as {
      estimate: { priceCredits: number };
      srtUrl: string;
      vttUrl: string;
      audioUrl: string;
      subtitles: Array<{ index: number }>;
    };
    assert.ok(animJson.estimate.priceCredits > 0);
    assert.ok(animJson.srtUrl.endsWith(".srt"));
    assert.ok(animJson.vttUrl.endsWith(".vtt"));
    assert.ok(animJson.audioUrl.endsWith(".wav"));
    assert.equal(animJson.subtitles.length, turnJson.audio.cues.length);

    const appRes = await fetch(`${base}/v1/sessions/${sid}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tariffTier: "po_episode_stylized",
        paymentGrantId: "grant_test_001",
      }),
    });
    assert.equal(appRes.status, 202);
    const appJson = (await appRes.json()) as {
      job: {
        jobId: string;
        includedRerolls: number;
        usedFreeRerolls: number;
        shotStates: Array<{ shotId: string; characterRefUrls: string[]; seed: number }>;
      };
    };
    assert.equal(appJson.job.includedRerolls, 3);
    assert.equal(appJson.job.usedFreeRerolls, 0);
    assert.equal(appJson.job.shotStates.length, 1);
    assert.ok(appJson.job.shotStates[0].characterRefUrls.length >= 1);

    const sessRerollRes = await fetch(`${base}/v1/sessions/${sid}/reroll`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shotId: turnJson.shot.id }),
    });
    assert.equal(sessRerollRes.status, 200);
    const sessRerollJson = (await sessRerollRes.json()) as {
      rerolledShot: { rerollCount: number; seed: number };
      job: { usedFreeRerolls: number };
    };
    assert.equal(sessRerollJson.rerolledShot.rerollCount, 1);
    assert.notEqual(sessRerollJson.rerolledShot.seed, appJson.job.shotStates[0].seed);
    assert.equal(sessRerollJson.job.usedFreeRerolls, 1);
  } finally {
    server.close();
  }
});

test("per-shot V2V queue enforces tariff free-reroll quota and extra payment grant on exhaustion", async () => {
  const server = createConnectorServer({ enableLiveRaea: false });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;

  const shot2 = {
    ...sampleShot,
    id: "shot_02",
    v2vPrompt: "Mira draws her silver blade",
  };

  try {
    const startRes = await fetch(`${base}/v1/jobs/final-film`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        caseId: "case_f6db507d967c49d9",
        idempotencyKey: "ep_reroll_quota_test",
        paymentGrantId: "grant_paid_episode",
        episodeCut: {
          id: "ep_reroll",
          caseId: "case_f6db507d967c49d9",
          worldBibleId: "wb_1",
          tariffTier: "po_episode_stylized",
          shots: [sampleShot, shot2],
          animaticApproved: true,
        },
        worldBible: sampleWorld,
      }),
    });
    assert.equal(startRes.status, 202);
    const startJson = (await startRes.json()) as {
      job: {
        jobId: string;
        progressPct: number;
        includedRerolls: number;
        usedFreeRerolls: number;
        shotStates: Array<{
          shotId: string;
          status: string;
          rerollCount: number;
          characterRefUrls: string[];
        }>;
      };
    };
    const jobId = startJson.job.jobId;
    assert.equal(startJson.job.progressPct, 100);
    assert.equal(startJson.job.includedRerolls, 3);
    assert.equal(startJson.job.shotStates.length, 2);
    assert.ok(startJson.job.shotStates[0].characterRefUrls[0]?.startsWith("/media/ref_"));

    // Consume all 3 included free rerolls on shot_02
    for (let i = 1; i <= 3; i++) {
      const r = await fetch(`${base}/v1/jobs/${jobId}/reroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shotId: "shot_02" }),
      });
      assert.equal(r.status, 200);
      const body = (await r.json()) as {
        rerolledShot: { rerollCount: number };
        job: { usedFreeRerolls: number; extraRerollCreditsCharged: number };
      };
      assert.equal(body.rerolledShot.rerollCount, i);
      assert.equal(body.job.usedFreeRerolls, i);
      assert.equal(body.job.extraRerollCreditsCharged, 0);
    }

    // 4th reroll without extraPaymentGrantId -> 402 Payment Required (120 credits)
    const unpaid4th = await fetch(`${base}/v1/jobs/${jobId}/reroll`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shotId: "shot_02" }),
    });
    assert.equal(unpaid4th.status, 402);
    const unpaidBody = (await unpaid4th.json()) as { extraCreditsRequired: number };
    assert.equal(unpaidBody.extraCreditsRequired, 120);

    // 4th reroll WITH valid extraPaymentGrantId -> 200 OK & charges 120 extra credits
    const paid4th = await fetch(`${base}/v1/jobs/${jobId}/reroll`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shotId: "shot_02",
        promptOverride: "Close-up of silver blade gleaming in candlelight",
        extraPaymentGrantId: "grant_extra_001",
      }),
    });
    assert.equal(paid4th.status, 200);
    const paidBody = (await paid4th.json()) as {
      rerolledShot: { rerollCount: number; prompt: string };
      job: { usedFreeRerolls: number; extraRerollCreditsCharged: number };
    };
    assert.equal(paidBody.rerolledShot.rerollCount, 4);
    assert.match(paidBody.rerolledShot.prompt, /silver blade gleaming/);
    assert.equal(paidBody.job.usedFreeRerolls, 3);
    assert.equal(paidBody.job.extraRerollCreditsCharged, 120);
  } finally {
    server.close();
  }
});
