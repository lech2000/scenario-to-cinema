import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { AUDIO_SAMPLE_RATE, type AudioProvider, encodeMonoWav } from "@cinema-rpg/providers";
import { createConnectorServer } from "./server.js";
import { renderCreditsClipMp4 } from "./raea-runner.js";

function createFastTestAudioProvider(dir: string): AudioProvider {
  let seq = 0;
  return {
    name: "fast-test-wav",
    async synthesizeSpeech({ text }) {
      const durationSec = Math.max(1.2, Math.min(8, text.length * 0.04));
      const samples = new Int16Array(Math.round(durationSec * AUDIO_SAMPLE_RATE));
      const p = path.join(dir, `fast_tts_${++seq}.wav`);
      fs.writeFileSync(p, encodeMonoWav(samples, AUDIO_SAMPLE_RATE));
      return { audioPath: p, durationSec };
    },
  };
}

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
    assert.equal(animJson.subtitles.length, turnJson.audio.cues.length + 1); // +1 for end credits cue

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

test("AI Showrunner compresses multi-turn session and supports pre-payment shot edit, delete, TTS recalculation, and credits MP4", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cinema-showrunner-test-"));
  const server = createConnectorServer({
    enableLiveRaea: false,
    workDir: tmpDir,
    audioProvider: createFastTestAudioProvider(tmpDir),
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;

  try {
    const sessRes = await fetch(`${base}/v1/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scenarioText:
          "Проклятие Серебряного Леса. Следопыт Мира встречает наёмника Шрама у таверны.",
        stylePreset: "arcane_3d",
        heroName: "Мира",
      }),
    });
    const { session } = (await sessRes.json()) as { session: { sessionId: string } };
    const sid = session.sessionId;

    // Play 5 turns
    for (let i = 1; i <= 5; i++) {
      const r = await fetch(`${base}/v1/sessions/${sid}/turns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerInput: i === 4 ? "Обнажаю клинок для дуэли!" : `Ход исследования #${i}`,
          renderMp4: false,
        }),
      });
      assert.equal(r.status, 200);
    }

    // 1. Compress 5 turns -> 3-act EpisodeCut (maxShots: 3)
    const srRes = await fetch(`${base}/v1/sessions/${sid}/showrunner`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tariffTier: "po_episode_stylized",
        maxShots: 3,
        customTitle: "Клинки Серебряного Леса",
      }),
    });
    assert.equal(srRes.status, 200);
    const srJson = (await srRes.json()) as {
      episodeCut: {
        title: string;
        shots: Array<{ id: string; camera: { mode: string }; durationInFrames: number }>;
        beats: Array<{ act: number }>;
      };
      droppedShotIds: string[];
      estimate: { priceCredits: number; shotCount: number };
    };
    assert.equal(srJson.episodeCut.shots.length, 3);
    assert.equal(srJson.droppedShotIds.length, 2);
    assert.equal(srJson.estimate.shotCount, 3);
    const credits3Shots = srJson.estimate.priceCredits;

    // 2. Edit first shot's cameraMode and dialogueText -> recalculates TTS frames & TSX
    const firstShotId = srJson.episodeCut.shots[0].id;
    const editRes = await fetch(`${base}/v1/sessions/${sid}/shots/${firstShotId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cameraMode: "low_angle_hero",
        dialogueText:
          "Сегодня в этой таверне никто не спрячет правду о пропавшем обозе — говори немедленно, Шрам!",
        renderMp4: false,
      }),
    });
    assert.equal(editRes.status, 200);
    const editJson = (await editRes.json()) as {
      shot: {
        camera: { mode: string };
        durationInFrames: number;
        audio: { dialogueLine: { text: string } };
      };
      media: { tsxPath: string };
    };
    assert.equal(editJson.shot.camera.mode, "low_angle_hero");
    assert.match(editJson.shot.audio.dialogueLine.text, /никто не спрячет правду/);
    const compiledTsx = fs.readFileSync(editJson.media.tsxPath, "utf-8");
    assert.ok(compiledTsx.length > 200);

    // 3. Delete middle shot -> shot count drops to 2 and FixAR estimate decreases
    const middleShotId = srJson.episodeCut.shots[1].id;
    const delRes = await fetch(`${base}/v1/sessions/${sid}/shots/${middleShotId}`, {
      method: "DELETE",
    });
    assert.equal(delRes.status, 200);
    const delJson = (await delRes.json()) as {
      episodeCut: { shots: Array<{ id: string }> };
      estimate: { priceCredits: number; shotCount: number };
    };
    assert.equal(delJson.episodeCut.shots.length, 2);
    assert.equal(delJson.estimate.shotCount, 2);
    assert.ok(delJson.estimate.priceCredits < credits3Shots);

    // 4. Update credits & build animatic -> verifies [ТИТРЫ] subtitle cue & WAV outro
    const credRes = await fetch(`${base}/v1/sessions/${sid}/credits`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        episodeTitle: "Хроники Старого Ворона",
        directedBy: "Режиссёр-тест",
        durationSec: 4,
      }),
    });
    assert.equal(credRes.status, 200);

    const animRes = await fetch(`${base}/v1/sessions/${sid}/animatic`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tariffTier: "po_episode_stylized" }),
    });
    assert.equal(animRes.status, 200);
    const animJson = (await animRes.json()) as {
      creditsIncluded: boolean;
      srtUrl: string;
      subtitles: Array<{ speakerName: string; text: string }>;
    };
    assert.equal(animJson.creditsIncluded, true);
    const lastCue = animJson.subtitles[animJson.subtitles.length - 1];
    assert.equal(lastCue.speakerName, "ТИТРЫ");
    assert.match(lastCue.text, /Хроники Старого Ворона/);

    // Verify standalone credits MP4 slate rendering when ffmpeg is available
    const creditsMp4 = path.join(tmpDir, "standalone_credits.mp4");
    const slate = await renderCreditsClipMp4({
      credits: {
        enabled: true,
        episodeTitle: "Хроники Старого Ворона",
        subtitle: "Финал эпизода",
        starring: ["Мира — главный герой", "Шрам — антагонист"],
        directedBy: "Режиссёр-тест",
        footerNote: "cinema-rpg/book-to-film-rpg",
        durationSec: 3,
      },
      outPath: creditsMp4,
    });
    if (slate.ok) {
      assert.ok(fs.existsSync(creditsMp4));
      assert.ok(fs.statSync(creditsMp4).size > 1000);
    }

    // 5. Approve runs V2V only on the 2 curated shots
    const appRes = await fetch(`${base}/v1/sessions/${sid}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tariffTier: "po_episode_stylized",
        paymentGrantId: "grant_curated_001",
      }),
    });
    assert.equal(appRes.status, 202);
    const appJson = (await appRes.json()) as {
      job: { shotStates: Array<{ shotId: string }> };
    };
    assert.equal(appJson.job.shotStates.length, 2);
  } finally {
    server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
