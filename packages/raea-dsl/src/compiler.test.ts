import test from "node:test";
import assert from "node:assert/strict";
import {
  EXPRESSIVE_POSES,
  STYLE_LOOK_CONFIGS,
  compileShotToRaeaTsx,
} from "./index.js";
import type { ShotSpec, StylePresetId, WorldBible } from "@cinema-rpg/shared";

function makeWorld(stylePreset: StylePresetId, raeaBodyId?: string): WorldBible {
  return {
    id: `wb_${stylePreset}`,
    title: "Таверна у Серебряного Леса",
    sourceExcerptSummary: "Дуэль взглядов у камина",
    stylePreset,
    globalStylePrompt: `Style ${stylePreset}`,
    locations: [
      {
        id: "room",
        name: "Room",
        atmosphere: "candlelight",
        lightingPreset: "candlelight",
        floorMaterial: "#2c221b",
        zones: [
          { id: "z1", label: "Z1", bounds: [2, 2, 2], center: [0.4, 0, 2.0], props: [] },
          { id: "z2", label: "Z2", bounds: [2, 2, 2], center: [-1.4, 0, -1.8], props: [] },
        ],
      },
    ],
    characters: [
      {
        id: "hero",
        name: "Мира",
        role: "protagonist",
        visualDescription: "Ranger in cloak",
        mannequinRigId: "cloaked",
        raeaBodyId,
        accentColor: "#2e8b57",
        voiceId: "v1",
        refSheetUrls: [],
        stats: {},
        inventory: [],
      },
      {
        id: "rival",
        name: "Шрам",
        role: "antagonist",
        visualDescription: "Armored mercenary",
        mannequinRigId: "armored",
        accentColor: "#b83b3b",
        voiceId: "v2",
        refSheetUrls: [],
        stats: {},
        inventory: [],
      },
    ],
    plotGraph: [],
  };
}

test("compileShotToRaeaTsx emits painterly Look mode='paint' for arcane_3d and noir, 'cartoon' for anime, and ACES PBR for photoreal_cinema", () => {
  const shot: ShotSpec = {
    id: "shot_01",
    locationId: "room",
    durationInFrames: 72,
    fps: 24,
    camera: {
      mode: "over_the_shoulder",
      focusActorId: "hero",
      secondaryActorId: "rival",
      dollyAmount: 0.3,
      panDegrees: 0,
    },
    actors: [
      {
        characterId: "hero",
        fromZoneId: "z1",
        toZoneId: "z2",
        animation: "draw_weapon",
        lookAtTargetId: "rival",
      },
      {
        characterId: "rival",
        fromZoneId: "z2",
        animation: "talk_intense",
        lookAtTargetId: "hero",
      },
    ],
    v2vPrompt: "Dramatic confrontation in tavern",
  };

  const arcaneTsx = compileShotToRaeaTsx(shot, makeWorld("arcane_3d"));
  assert.match(arcaneTsx, /id="shot-01"/);
  assert.match(arcaneTsx, /<Look[\s\S]*mode="paint"[\s\S]*bands=\{4\}[\s\S]*stroke=\{0\.45\}/);
  assert.match(arcaneTsx, /<Shadows distance=\{32\}/);
  assert.match(arcaneTsx, /<PointLight[\s\S]*paint\s*\/>/);

  const animeTsx = compileShotToRaeaTsx(shot, makeWorld("anime"));
  assert.match(animeTsx, /<Look[\s\S]*mode="cartoon"[\s\S]*outlineWidth=\{4\}/);

  const noirTsx = compileShotToRaeaTsx(shot, makeWorld("noir"));
  assert.match(noirTsx, /<Look[\s\S]*mode="paint"[\s\S]*bands=\{3\}/);
  assert.match(noirTsx, /<Grade saturation=\{0\.18\} vignette=\{0\.55\}/);

  const photoTsx = compileShotToRaeaTsx(shot, makeWorld("photoreal_cinema"));
  assert.match(photoTsx, /<ToneMapping mode="aces"/);
  assert.doesNotMatch(photoTsx, /<Look\s/);
  assert.equal(STYLE_LOOK_CONFIGS.photoreal_cinema.usesPaintLight, false);
});

test("compileShotToRaeaTsx builds articulated rigged figures with archetype silhouettes, held props, and expressive poses", () => {
  assert.equal(Object.keys(EXPRESSIVE_POSES).length, 12);

  const shot: ShotSpec = {
    id: "pose_check",
    locationId: "room",
    durationInFrames: 48,
    fps: 24,
    camera: { mode: "medium_two_shot", focusActorId: "hero", secondaryActorId: "rival", dollyAmount: 0, panDegrees: 0 },
    actors: [
      { characterId: "hero", fromZoneId: "z1", animation: "draw_weapon", lookAtTargetId: "rival" },
      { characterId: "rival", fromZoneId: "z2", animation: "cast_spell", lookAtTargetId: "hero" },
    ],
    v2vPrompt: "Sword vs spell",
  };

  const tsx = compileShotToRaeaTsx(shot, makeWorld("arcane_3d"));
  // Articulated segments & silhouettes
  assert.match(tsx, /name="hero-pelvis"/);
  assert.match(tsx, /name="hero-torso"/);
  assert.match(tsx, /name="hero-cape"/);
  assert.match(tsx, /name="hero-arm-r-upper"/);
  assert.match(tsx, /name="hero-arm-r-fore"/);
  assert.match(tsx, /name="hero-blade"/);
  assert.match(tsx, /name="rival-pauldron-l"/);
  assert.match(tsx, /name="rival-orb"/);
});

test("compileShotToRaeaTsx emits native raea/character <Character> at root (never inside <Entity>) when raeaBodyId is set", () => {
  const shot: ShotSpec = {
    id: "native_char",
    locationId: "room",
    durationInFrames: 48,
    fps: 24,
    camera: { mode: "close_up", focusActorId: "hero", dollyAmount: 0.2, panDegrees: 0 },
    actors: [{ characterId: "hero", fromZoneId: "z1", animation: "talk_calm", lookAtTargetId: "z2" }],
    v2vPrompt: "Close-up dialogue",
  };

  const tsx = compileShotToRaeaTsx(shot, makeWorld("arcane_3d", "adult"));
  assert.match(tsx, /import \{ Character \} from "raea\/character";/);
  assert.match(tsx, /<Character[\s\S]*name="hero"[\s\S]*body="adult"[\s\S]*goals=\{\{/);
});
