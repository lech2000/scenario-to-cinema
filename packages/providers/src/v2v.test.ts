import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  CloudV2VProvider,
  createVideoProviderFromEnv,
  ensureCharacterReferenceSheets,
  evaluateRerollAllowance,
} from "./v2v.js";
import type { WorldBible } from "@cinema-rpg/shared";

test("CloudV2VProvider submits and polls fal, runway, and kling with characterRefUrls and seed", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];

  // 1. fal.ai flow
  const falFetch: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    if (init?.method === "POST") {
      return new Response(JSON.stringify({ request_id: "req_fal_001" }), { status: 200 });
    }
    if (url.endsWith("/status")) {
      return new Response(JSON.stringify({ status: "COMPLETED" }), { status: 200 });
    }
    return new Response(
      JSON.stringify({ video: { url: "https://cdn.fal.media/out_001.mp4" } }),
      { status: 200 }
    );
  };

  const fal = new CloudV2VProvider({
    vendor: "fal",
    apiKey: "test_fal_key",
    model: "fal-ai/kling-v2v",
    fetchImpl: falFetch,
  });
  const subFal = await fal.renderShotV2V({
    previzVideoPath: "https://example.com/previz.mp4",
    prompt: "Arcane tavern duel",
    characterRefUrls: ["https://example.com/mira_ref.png"],
    durationSec: 5,
    aspectRatio: "16:9",
    stylePreset: "arcane_3d",
    seed: 42,
  });
  assert.equal(subFal.providerJobId, "fal:fal-ai/kling-v2v:req_fal_001");
  const submittedBody = JSON.parse(String(calls[0].init?.body));
  assert.deepEqual(submittedBody.reference_image_urls, ["https://example.com/mira_ref.png"]);
  assert.equal(submittedBody.seed, 42);

  const pollFal = await fal.pollJob(subFal.providerJobId);
  assert.equal(pollFal.status, "done");
  assert.equal(pollFal.videoUrl, "https://cdn.fal.media/out_001.mp4");

  // 2. Runway flow
  const runwayFetch: typeof fetch = async (_input, init) => {
    if (init?.method === "POST") {
      const b = JSON.parse(String(init.body));
      assert.equal(b.references[0].uri, "https://example.com/mira_ref.png");
      return new Response(JSON.stringify({ id: "rw_99" }), { status: 200 });
    }
    return new Response(
      JSON.stringify({ status: "SUCCEEDED", output: ["https://runway.example/rw_99.mp4"] }),
      { status: 200 }
    );
  };
  const rw = new CloudV2VProvider({
    vendor: "runway",
    apiKey: "test_rw_key",
    fetchImpl: runwayFetch,
  });
  const subRw = await rw.renderShotV2V({
    previzVideoPath: "https://example.com/previz.mp4",
    prompt: "Noir close-up",
    characterRefUrls: ["https://example.com/mira_ref.png"],
    durationSec: 5,
    aspectRatio: "16:9",
    stylePreset: "noir",
  });
  assert.equal(subRw.providerJobId, "runway:rw_99");
  const pollRw = await rw.pollJob(subRw.providerJobId);
  assert.equal(pollRw.status, "done");
  assert.equal(pollRw.videoUrl, "https://runway.example/rw_99.mp4");

  // 3. Env auto-selection & CI mock fallback
  assert.equal(createVideoProviderFromEnv({}).name, "mock-v2v");
  assert.equal(createVideoProviderFromEnv({ FAL_KEY: "k" }).name, "cloud-fal");
  assert.equal(createVideoProviderFromEnv({ RUNWAYML_API_SECRET: "k" }).name, "cloud-runway");
  assert.equal(createVideoProviderFromEnv({ KLING_API_KEY: "k" }).name, "cloud-kling");
});

test("evaluateRerollAllowance enforces tariff free-reroll quota and extra grant requirement", () => {
  // 1st..3rd rerolls on po_episode_stylized (includedRerolls = 3) are free
  const r1 = evaluateRerollAllowance({
    tariffTier: "po_episode_stylized",
    includedRerolls: 3,
    usedFreeRerolls: 2,
  });
  assert.equal(r1.allowed, true);
  assert.equal(r1.isFreeReroll, true);
  assert.equal(r1.extraCreditsCharged, 0);
  assert.equal(r1.remainingFreeRerollsAfter, 0);

  // 4th reroll without extraPaymentGrantId is blocked (requires 120 credits)
  const rBlocked = evaluateRerollAllowance({
    tariffTier: "po_episode_stylized",
    includedRerolls: 3,
    usedFreeRerolls: 3,
  });
  assert.equal(rBlocked.allowed, false);
  assert.equal(rBlocked.extraCreditsCharged, 120);

  // 4th reroll WITH valid grant_... succeeds
  const rPaid = evaluateRerollAllowance({
    tariffTier: "po_episode_stylized",
    includedRerolls: 3,
    usedFreeRerolls: 3,
    extraPaymentGrantId: "grant_extra_reroll_01",
  });
  assert.equal(rPaid.allowed, true);
  assert.equal(rPaid.isFreeReroll, false);
  assert.equal(rPaid.extraCreditsCharged, 120);
});

test("ensureCharacterReferenceSheets generates SVG character reference cards", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cinema-refs-"));
  try {
    const wb: WorldBible = {
      id: "wb_refs",
      title: "Test",
      sourceExcerptSummary: "Test",
      stylePreset: "arcane_3d",
      globalStylePrompt: "Arcane",
      locations: [
        {
          id: "l1",
          name: "Room",
          atmosphere: "dim",
          lightingPreset: "candlelight",
          floorMaterial: "#222222",
          zones: [{ id: "z1", label: "Z1", bounds: [2, 2, 2], center: [0, 0, 0], props: [] }],
        },
      ],
      characters: [
        {
          id: "hero",
          name: "Мира",
          role: "protagonist",
          visualDescription: "Ranger",
          mannequinRigId: "cloaked",
          accentColor: "#2e8b57",
          voiceId: "v1",
          refSheetUrls: [],
          stats: {},
          inventory: [],
        },
      ],
      plotGraph: [],
    };
    ensureCharacterReferenceSheets({ worldBible: wb, outDir: tmpDir });
    assert.equal(wb.characters[0].refSheetUrls.length, 1);
    assert.match(wb.characters[0].refSheetUrls[0], /^\/media\/ref_wb_refs_hero\.svg$/);
    assert.ok(fs.existsSync(path.join(tmpDir, "ref_wb_refs_hero.svg")));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
