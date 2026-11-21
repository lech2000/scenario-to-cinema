import test from "node:test";
import assert from "node:assert/strict";
import { compileShotToRaeaTsx } from "./compiler.js";
import type { ShotSpec, WorldBible } from "@cinema-rpg/shared";

const world: WorldBible = {
  id: "wb_test",
  title: "Test",
  sourceExcerptSummary: "Test excerpt",
  stylePreset: "noir",
  globalStylePrompt: "Noir monochrome",
  locations: [
    {
      id: "room",
      name: "Room",
      atmosphere: "rainy",
      lightingPreset: "moonlight",
      floorMaterial: "#222222",
      zones: [
        { id: "z1", label: "Z1", bounds: [2, 2, 2], center: [0, 0, 2], props: [] },
        { id: "z2", label: "Z2", bounds: [2, 2, 2], center: [0, 0, -2], props: [] },
      ],
    },
  ],
  characters: [
    {
      id: "c1",
      name: "Detective",
      role: "protagonist",
      visualDescription: "Trenchcoat",
      mannequinRigId: "cloaked",
      accentColor: "#336699",
      voiceId: "v1",
      refSheetUrls: [],
      stats: {},
      inventory: [],
    },
  ],
  plotGraph: [],
};

test("compileShotToRaeaTsx generates valid raea TSX composition", () => {
  const shot: ShotSpec = {
    id: "shot_01",
    locationId: "room",
    durationInFrames: 72,
    fps: 24,
    camera: { mode: "close_up", focusActorId: "c1", dollyAmount: 0.2, panDegrees: 0 },
    actors: [{ characterId: "c1", fromZoneId: "z1", toZoneId: "z2", animation: "walk" }],
    v2vPrompt: "Detective walks forward in moody moonlight",
  };
  const tsx = compileShotToRaeaTsx(shot, world);
  assert.match(tsx, /import \{[\s\S]*registerRoot[\s\S]*\} from "raea"/);
  assert.match(tsx, /id="shot_01"/);
  assert.match(tsx, /durationInFrames=\{72\}/);
  assert.match(tsx, /base_color="#336699"/);
});
