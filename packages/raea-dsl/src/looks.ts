import type { LocationBlueprint, StylePresetId } from "@cinema-rpg/shared";

export interface StyleLookConfig {
  preset: StylePresetId;
  lookMode: "paint" | "cartoon" | "none";
  usesPaintLight: boolean;
  description: string;
}

export const STYLE_LOOK_CONFIGS: Record<StylePresetId, StyleLookConfig> = {
  arcane_3d: {
    preset: "arcane_3d",
    lookMode: "paint",
    usesPaintLight: true,
    description:
      "Arcane-inspired painterly 3D: 4-band soft gouache shading, world-space brush strokes, warm rim light, paper grain",
  },
  anime: {
    preset: "anime",
    lookMode: "cartoon",
    usesPaintLight: true,
    description:
      "Theatrical anime cel-shading: 2 crisp tone bands, ink silhouette outline boiling on twos, bright rim highlight",
  },
  noir: {
    preset: "noir",
    lookMode: "paint",
    usesPaintLight: true,
    description:
      "Graphic neo-noir chiaroscuro: stark 3-band high-contrast paint shading with desaturated grading and heavy vignette",
  },
  photoreal_cinema: {
    preset: "photoreal_cinema",
    lookMode: "none",
    usesPaintLight: false,
    description:
      "35mm anamorphic PBR cinema: ACES filmic tone mapping, subtle lens aberration, warm highlight bloom, vignette",
  },
};

export function buildStyleLookTsx(params: {
  stylePreset: StylePresetId;
  lightingPreset: LocationBlueprint["lightingPreset"];
  bgHex: string;
}): string {
  const { stylePreset, lightingPreset, bgHex } = params;

  switch (stylePreset) {
    case "arcane_3d": {
      const skyTop =
        lightingPreset === "daylight"
          ? "#4b6b88"
          : lightingPreset === "neon"
            ? "#1e1233"
            : "#1d1626";
      return [
        `      {/* Style Preset: arcane_3d -> painterly Look mode="paint" */}`,
        `      <Look`,
        `        mode="paint"`,
        `        bands={4}`,
        `        soft={0.35}`,
        `        stroke={0.45}`,
        `        strokeScale={0.09}`,
        `        shadow="#3d3654"`,
        `        mid="#9e7672"`,
        `        rim="#f6bd78"`,
        `        rimAmount={0.42}`,
        `        grain={0.24}`,
        `        rag={1.5}`,
        `        sky={["${skyTop}", "${bgHex}"]}`,
        `      />`,
        `      <Shadows distance={32} firstCascade={24} cascades={1} mapSize={2048} />`,
        `      <Bloom intensity={0.35} threshold={0.88} />`,
      ].join("\n");
    }

    case "anime": {
      const skyTop = lightingPreset === "daylight" ? "#5d87b8" : "#22263f";
      return [
        `      {/* Style Preset: anime -> cel-shaded Look mode="cartoon" (paint family) */}`,
        `      <Look`,
        `        mode="cartoon"`,
        `        bands={2}`,
        `        shadow="#9d90ba"`,
        `        outline="#1b1421"`,
        `        outlineWidth={4}`,
        `        boil={2}`,
        `        rag={1.1}`,
        `        grain={0.05}`,
        `        rim="#ffe0b5"`,
        `        rimAmount={0.5}`,
        `        sky={["${skyTop}", "${bgHex}"]}`,
        `      />`,
        `      <Shadows distance={32} firstCascade={24} cascades={1} mapSize={2048} />`,
        `      <Bloom intensity={0.3} threshold={0.9} />`,
      ].join("\n");
    }

    case "noir": {
      return [
        `      {/* Style Preset: noir -> stark chiaroscuro Look mode="paint" + monochrome Grade */}`,
        `      <Look`,
        `        mode="paint"`,
        `        bands={3}`,
        `        soft={0.12}`,
        `        stroke={0.22}`,
        `        shadow="#181c26"`,
        `        mid="#565d6e"`,
        `        rim="#d8e2f0"`,
        `        rimAmount={0.55}`,
        `        grain={0.42}`,
        `        rag={1.2}`,
        `        sky={["#0b0d12", "${bgHex}"]}`,
        `      />`,
        `      <Shadows distance={32} firstCascade={24} cascades={1} mapSize={2048} />`,
        `      <Grade saturation={0.18} vignette={0.55} temperature={-0.15} />`,
      ].join("\n");
    }

    case "photoreal_cinema":
    default: {
      return [
        `      {/* Style Preset: photoreal_cinema -> ACES PBR + filmic Grade + Fog */}`,
        `      <ToneMapping mode="aces" exposure={0.32} />`,
        `      <Bloom intensity={0.45} threshold={0.85} />`,
        `      <Grade temperature={0.12} vignette={0.32} aberration={0.002} />`,
        `      <Fog color="${bgHex}" near={6.5} far={19} />`,
      ].join("\n");
    }
  }
}
