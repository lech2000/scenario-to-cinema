import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ShotSpec, WorldBible } from "@cinema-rpg/shared";
import { compileShotToRaeaTsx } from "./compiler.js";

const sampleWorld: WorldBible = {
  id: "wb_silver_forest",
  title: "Таверна у Серебряного Леса",
  sourceExcerptSummary:
    "Мрачная придорожная таверна в дождь; наёмник у камина знает, куда пропал обоз.",
  stylePreset: "arcane_3d",
  globalStylePrompt:
    "Painterly stylized 3D cinema inspired by Arcane, volumetric candlelight, dramatic chiaroscuro, rain-slicked dark fantasy tavern.",
  locations: [
    {
      id: "tavern_main",
      name: "Таверна «Старый Ворон»",
      atmosphere: "dim candlelight, wood smoke, rain tapping on leaded glass",
      lightingPreset: "candlelight",
      floorMaterial: "#2c221b",
      zones: [
        {
          id: "entrance",
          label: "Входная дверь",
          bounds: [2, 3, 2],
          center: [0, 0, 3.2],
          props: [{ kind: "door", pos: [0, 1.2, 4.2], scale: [0.8, 1.2, 0.1] }],
        },
        {
          id: "bar_counter",
          label: "Барная стойка",
          bounds: [4, 2, 1.5],
          center: [2.2, 0, 0],
          props: [
            { kind: "table", pos: [2.5, 0.55, 0], scale: [0.5, 0.55, 2.2] },
            { kind: "torch", pos: [2.8, 2.1, -1.2], scale: [0.1, 0.25, 0.1] },
          ],
        },
        {
          id: "fireplace",
          label: "Стол у камина",
          bounds: [3, 2, 3],
          center: [-1.4, 0, -1.6],
          props: [
            { kind: "table", pos: [-1.4, 0.45, -1.6], scale: [0.8, 0.45, 0.6] },
          ],
        },
      ],
    },
  ],
  characters: [
    {
      id: "hero_mira",
      name: "Мира",
      role: "protagonist",
      visualDescription:
        "Young female ranger in weathered emerald cloak, leather pauldrons, wet dark braid, keen amber eyes",
      mannequinRigId: "cloaked",
      accentColor: "#2e8b57",
      voiceId: "voice_ru_mira_01",
      refSheetUrls: [],
      stats: { agility: 3, wit: 3, grit: 2 },
      inventory: ["короткий клинок", "фонарь"],
    },
    {
      id: "npc_mercenary",
      name: "Шрам",
      role: "antagonist",
      visualDescription:
        "Broad-shouldered scarred mercenary in battered iron brigandine, heavy red scarf, cynical smirk",
      mannequinRigId: "armored",
      accentColor: "#b83b3b",
      voiceId: "voice_ru_shram_01",
      refSheetUrls: [],
      stats: { brawn: 3, cunning: 2 },
      inventory: ["тесак"],
    },
  ],
  plotGraph: [],
};

const sampleShot: ShotSpec = {
  id: "tavern_duel_01",
  locationId: "tavern_main",
  durationInFrames: 120,
  fps: 24,
  camera: {
    mode: "over_the_shoulder",
    focusActorId: "hero_mira",
    secondaryActorId: "npc_mercenary",
    dollyAmount: 0.45,
    panDegrees: 0,
  },
  actors: [
    {
      characterId: "hero_mira",
      fromZoneId: "entrance",
      toZoneId: "bar_counter",
      animation: "draw_weapon",
      lookAtTargetId: "npc_mercenary",
    },
    {
      characterId: "npc_mercenary",
      fromZoneId: "fireplace",
      animation: "talk_intense",
      lookAtTargetId: "hero_mira",
    },
  ],
  audio: {
    dialogueLine: {
      speakerId: "hero_mira",
      text: "Говори, где пропавший обоз, пока клинок ещё в ножнах.",
      emotion: "tense",
    },
    sfxTags: [{ tag: "sword_unsheathe", atFrame: 32 }],
  },
  v2vPrompt:
    "Over-the-shoulder cinematic shot of Mira stepping toward the scarred mercenary by the tavern fireplace, hand resting on sword hilt, candlelight flickering across painted faces.",
};

const tsx = compileShotToRaeaTsx(sampleShot, sampleWorld);
const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../generated");
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, "tavern_duel_01.tsx");
fs.writeFileSync(outPath, tsx, "utf-8");
console.log(`Compiled Phase 0 raea scene -> ${outPath}`);
console.log(`Next (once raea CLI is installed): raea render ${outPath} -o tavern_duel_01.mp4`);
