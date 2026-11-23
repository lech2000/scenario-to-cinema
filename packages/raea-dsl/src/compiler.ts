import {
  type LocationBlueprint,
  type ShotSpec,
  type Vec3,
  type WorldBible,
  ShotSpecSchema,
  WorldBibleSchema,
} from "@cinema-rpg/shared";
import { STYLE_LOOK_CONFIGS, buildStyleLookTsx } from "./looks.js";
import { buildCharacterRigTsx } from "./poses.js";

interface LightingConfig {
  bg: string;
  ambient: number;
  dirColor: string;
  dirIlluminance: number;
  dirPos: Vec3;
}

const LIGHTING_PRESETS: Record<LocationBlueprint["lightingPreset"], LightingConfig> = {
  daylight: {
    bg: "#8eb2d6",
    ambient: 420,
    dirColor: "#fff8e8",
    dirIlluminance: 24000,
    dirPos: [6, 10, 5],
  },
  sunset: {
    bg: "#2d1d29",
    ambient: 210,
    dirColor: "#ff9b54",
    dirIlluminance: 14000,
    dirPos: [-8, 4, 6],
  },
  candlelight: {
    bg: "#1b1414",
    ambient: 165,
    dirColor: "#ffba75",
    dirIlluminance: 10500,
    dirPos: [2.5, 4.2, 2.6],
  },
  moonlight: {
    bg: "#0e1524",
    ambient: 150,
    dirColor: "#9cc2ff",
    dirIlluminance: 8500,
    dirPos: [-4, 8, -5],
  },
  neon: {
    bg: "#120d24",
    ambient: 180,
    dirColor: "#ff4fd8",
    dirIlluminance: 11500,
    dirPos: [3, 5, 4],
  },
  foggy: {
    bg: "#252c31",
    ambient: 260,
    dirColor: "#c8d6df",
    dirIlluminance: 9500,
    dirPos: [4, 7, 3],
  },
};

function resolveZoneCenter(location: LocationBlueprint, zoneId: string): Vec3 {
  const zone = location.zones.find((z) => z.id === zoneId) ?? location.zones[0];
  return zone.center;
}

function computeCameraRig(
  shot: ShotSpec,
  focusPos: Vec3,
  secondaryPos: Vec3
): { startPos: Vec3; endPos: Vec3; lookAt: Vec3; fovDeg: number } {
  const dolly = shot.camera.dollyAmount ?? 0;
  switch (shot.camera.mode) {
    case "establishing":
      return {
        startPos: [focusPos[0] + 5.2, 4.0, focusPos[2] + 6.0],
        endPos: [focusPos[0] + 5.2 - dolly * 1.4, 3.6, focusPos[2] + 6.0 - dolly * 1.6],
        lookAt: [focusPos[0], 1.15, focusPos[2]],
        fovDeg: 46,
      };
    case "over_the_shoulder": {
      const dx = secondaryPos[0] - focusPos[0];
      const dz = secondaryPos[2] - focusPos[2];
      const len = Math.hypot(dx, dz) || 1;
      const ux = dx / len;
      const uz = dz / len;
      const rawStartX = focusPos[0] - ux * 1.45 + uz * 0.72;
      const rawStartZ = focusPos[2] - uz * 1.45 - ux * 0.72;
      const startPos: Vec3 = [
        Math.max(-5.2, Math.min(5.2, rawStartX)),
        1.76,
        Math.max(-5.2, Math.min(3.5, rawStartZ)),
      ];
      const endPos: Vec3 = [
        Math.max(-5.2, Math.min(5.2, startPos[0] + ux * dolly * 0.65)),
        1.72,
        Math.max(-5.2, Math.min(3.5, startPos[2] + uz * dolly * 0.65)),
      ];
      return {
        startPos,
        endPos,
        lookAt: [
          secondaryPos[0] * 0.7 + focusPos[0] * 0.3,
          1.38,
          secondaryPos[2] * 0.7 + focusPos[2] * 0.3,
        ],
        fovDeg: 40,
      };
    }
    case "close_up":
      return {
        startPos: [focusPos[0] + 0.38, 1.56, focusPos[2] + 1.55],
        endPos: [focusPos[0] + 0.26, 1.56, focusPos[2] + 1.55 - dolly * 0.35],
        lookAt: [focusPos[0], 1.48, focusPos[2]],
        fovDeg: 32,
      };
    case "low_angle_hero":
      return {
        startPos: [focusPos[0] + 1.8, 0.78, focusPos[2] + 2.6],
        endPos: [focusPos[0] + 1.4, 0.96, focusPos[2] + 2.6 - dolly * 0.7],
        lookAt: [focusPos[0], 1.42, focusPos[2]],
        fovDeg: 40,
      };
    case "dolly_track":
      return {
        startPos: [focusPos[0] - 2.2, 1.72, focusPos[2] + 3.4],
        endPos: [secondaryPos[0] + 1.6, 1.72, secondaryPos[2] + 3.0],
        lookAt: [
          (focusPos[0] + secondaryPos[0]) / 2,
          1.25,
          (focusPos[2] + secondaryPos[2]) / 2,
        ],
        fovDeg: 42,
      };
    case "medium_two_shot":
    default: {
      const mx = (focusPos[0] + secondaryPos[0]) / 2;
      const mz = (focusPos[2] + secondaryPos[2]) / 2;
      return {
        startPos: [mx + 1.2, 1.75, mz + 4.2],
        endPos: [mx + 1.2 - dolly * 0.6, 1.75, mz + 4.2 - dolly * 0.8],
        lookAt: [mx, 1.28, mz],
        fovDeg: 40,
      };
    }
  }
}

/**
 * Deterministically compiles a validated ShotSpec + WorldBible into a runnable
 * `raea 0.1.8` TSX composition featuring:
 *  - Articulated 14-part rigged humanoid figures (or native `raea/character` `<Character>`)
 *    with expressive poses per AnimationClipId, automatic facing yaw, and personal-space safety;
 *  - Artistic `<Look mode="paint" | "cartoon">` & filmic `<Grade>` post-processing tailored
 *    to `world.stylePreset` (`arcane_3d`, `anime`, `noir`, `photoreal_cinema`).
 */
export function compileShotToRaeaTsx(
  rawShot: ShotSpec,
  rawWorld: WorldBible
): string {
  const shot = ShotSpecSchema.parse(rawShot);
  const world = WorldBibleSchema.parse(rawWorld);

  const location = world.locations.find((l) => l.id === shot.locationId);
  if (!location) {
    throw new Error(`Unknown locationId "${shot.locationId}" in WorldBible "${world.id}"`);
  }

  const lighting = LIGHTING_PRESETS[location.lightingPreset];
  const styleCfg = STYLE_LOOK_CONFIGS[world.stylePreset];
  const focusAction =
    shot.actors.find((a) => a.characterId === shot.camera.focusActorId) ??
    shot.actors[0];
  const secondaryAction =
    shot.actors.find((a) => a.characterId === shot.camera.secondaryActorId) ??
    shot.actors[1] ??
    focusAction;

  const focusPos = resolveZoneCenter(location, focusAction.fromZoneId);
  const secondaryPos = resolveZoneCenter(location, secondaryAction.fromZoneId);
  const cam = computeCameraRig(shot, focusPos, secondaryPos);

  // Resolve non-overlapping actor start/end positions (enforce >= 1.45 m personal space)
  const resolvedActors = shot.actors.map((act, idx) => {
    const baseFrom = resolveZoneCenter(location, act.fromZoneId);
    const baseTo = act.toZoneId ? resolveZoneCenter(location, act.toZoneId) : baseFrom;
    return {
      act,
      idx,
      from: [...baseFrom] as Vec3,
      to: [...baseTo] as Vec3,
    };
  });

  for (let i = 0; i < resolvedActors.length; i++) {
    for (let j = 0; j < i; j++) {
      const a = resolvedActors[i];
      const b = resolvedActors[j];
      const sdx = a.from[0] - b.from[0];
      const sdz = a.from[2] - b.from[2];
      if (Math.hypot(sdx, sdz) < 1.45) {
        const angle = i * 1.2 + 0.5;
        a.from = [
          b.from[0] + Math.cos(angle) * 1.55,
          a.from[1],
          b.from[2] + Math.sin(angle) * 1.55,
        ];
      }
      const edx = a.to[0] - b.to[0];
      const edz = a.to[2] - b.to[2];
      if (Math.hypot(edx, edz) < 1.45) {
        const vx = a.from[0] - b.to[0];
        const vz = a.from[2] - b.to[2];
        const vlen = Math.hypot(vx, vz) || 1;
        a.to = [
          b.to[0] + (vx / vlen) * 1.55,
          a.to[1],
          b.to[2] + (vz / vlen) * 1.55,
        ];
      }
    }
  }

  if (resolvedActors.length > 1) {
    const hero = resolvedActors[0];
    for (let j = 1; j < resolvedActors.length; j++) {
      const other = resolvedActors[j];
      const edx = hero.to[0] - other.to[0];
      const edz = hero.to[2] - other.to[2];
      if (Math.hypot(edx, edz) < 1.45) {
        const vx = hero.from[0] - other.to[0];
        const vz = hero.from[2] - other.to[2];
        const vlen = Math.hypot(vx, vz) || 1;
        hero.to = [
          other.to[0] + (vx / vlen) * 1.55,
          hero.to[1],
          other.to[2] + (vz / vlen) * 1.55,
        ];
      }
    }
  }

  let usesNativeCharacterImport = false;
  const actorBlocks = resolvedActors.map(({ act, idx, from, to }) => {
    const profile = world.characters.find((c) => c.id === act.characterId);
    if (!profile) {
      throw new Error(`Unknown characterId "${act.characterId}"`);
    }
    const targetActor = act.lookAtTargetId
      ? resolvedActors.find((r) => r.act.characterId === act.lookAtTargetId)
      : undefined;
    const lookTarget: Vec3 = targetActor
      ? targetActor.to
      : act.lookAtTargetId
        ? resolveZoneCenter(location, act.lookAtTargetId)
        : [cam.lookAt[0], 0, cam.lookAt[2]];

    const built = buildCharacterRigTsx({
      profile,
      animation: act.animation,
      from,
      to,
      lookTarget,
      actorIndex: idx,
    });
    if (built.usesNativeRaeaCharacter) usesNativeCharacterImport = true;
    return built.tsx;
  });

  const actorsCode = actorBlocks.join("\n");

  const propsCode = location.zones
    .flatMap((z) =>
      z.props.map((p, i) => {
        const s = p.scale ?? [0.6, 0.45, 0.6];
        const color =
          p.kind === "table" || p.kind === "chair" || p.kind === "crate"
            ? "#5a3d2b"
            : p.kind === "torch"
              ? "#ff9e42"
              : "#3a3f4b";
        return `      {/* Prop: ${z.id}/${p.kind}#${i} */}
      <Mesh3d name="prop-${z.id}-${p.kind}-${i}" allowOverlap transform={Transform.fromXyz(${p.pos[0]}, ${p.pos[1]}, ${p.pos[2]})}>
        <Cuboid half_size={[${s[0]}, ${s[1]}, ${s[2]}]} />
        <StandardMaterial base_color="${color}" perceptual_roughness={0.75} />
      </Mesh3d>`;
      })
    )
    .join("\n");

  const styleLookCode = buildStyleLookTsx({
    stylePreset: world.stylePreset,
    lightingPreset: location.lightingPreset,
    bgHex: lighting.bg,
  });

  const checkFrames = [
    0,
    Math.floor(shot.durationInFrames / 2),
    shot.durationInFrames - 1,
  ].join(",");

  const compositionId = shot.id.replace(/[^a-zA-Z0-9-]/g, "-");
  const charImportLine = usesNativeCharacterImport
    ? `\nimport { Character } from "raea/character";`
    : "";
  const pointLightPaintAttr = styleCfg.usesPaintLight ? " paint" : "";

  return `// check: frames ${checkFrames}
// Auto-generated by @cinema-rpg/raea-dsl from ShotSpec "${shot.id}" (style=${world.stylePreset})
// V2V Prompt: ${shot.v2vPrompt.replace(/\n/g, " ")}
import {
  AbsoluteFill,
  Composition,
  Easing,
  interpolate,
  registerRoot,
  useCurrentFrame,
  useVideoConfig,
} from "raea";
import { Entity } from "raea/3d";
import { StandardMaterial } from "raea/pbr";
import { Capsule3d, Cone, Cuboid, Cylinder, Mesh3d, Sphere } from "raea/mesh";
import { AmbientLight, DirectionalLight, PointLight, Shadows } from "raea/light";
import { Quat, Transform } from "raea/transform";
import { Camera3d } from "raea/camera";
import { Bloom, Fog, Grade, Look, ToneMapping } from "raea/prelude";${charImportLine}

function Shot_${shot.id.replace(/[^a-zA-Z0-9_]/g, "_")}() {
  const f = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const camX = interpolate(f, [0, durationInFrames - 1], [${cam.startPos[0].toFixed(3)}, ${cam.endPos[0].toFixed(3)}], {
    easing: Easing.inOut(Easing.cubic),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const camY = interpolate(f, [0, durationInFrames - 1], [${cam.startPos[1].toFixed(3)}, ${cam.endPos[1].toFixed(3)}], {
    easing: Easing.inOut(Easing.cubic),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const camZ = interpolate(f, [0, durationInFrames - 1], [${cam.startPos[2].toFixed(3)}, ${cam.endPos[2].toFixed(3)}], {
    easing: Easing.inOut(Easing.cubic),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ background: "${lighting.bg}" }}>
      <Camera3d
        transform={Transform.fromXyz(camX, camY, camZ).lookingAt([${cam.lookAt[0].toFixed(3)}, ${cam.lookAt[1].toFixed(3)}, ${cam.lookAt[2].toFixed(3)}])}
        projection={{ Perspective: { fov: (${cam.fovDeg} * Math.PI) / 180 } }}
      />

      <AmbientLight brightness={${lighting.ambient}} />
      <DirectionalLight
        transform={Transform.fromXyz(${lighting.dirPos[0]}, ${lighting.dirPos[1]}, ${lighting.dirPos[2]}).lookingAt([0, 0, 0])}
        illuminance={${lighting.dirIlluminance}}
        color="${lighting.dirColor}"
        shadow_maps_enabled
      />
      <PointLight
        transform={Transform.fromXyz(${secondaryPos[0]}, 2.35, ${secondaryPos[2] + 0.85})}
        intensity={180000}
        color="${lighting.dirColor}"
        range={11}${pointLightPaintAttr}
      />
${styleLookCode}

      {/* Stage Floor & Backdrop Walls (${location.name}) */}
      <Mesh3d name="stage-floor" allowOverlap transform={Transform.fromXyz(0, -0.1, 0)}>
        <Cuboid half_size={[8, 0.1, 8]} />
        <StandardMaterial base_color="${location.floorMaterial}" perceptual_roughness={0.85} />
      </Mesh3d>
      <Mesh3d name="wall-north" allowOverlap transform={Transform.fromXyz(0, 2.2, -5.2)}>
        <Cuboid half_size={[8, 2.3, 0.15]} />
        <StandardMaterial base_color="#352a24" perceptual_roughness={0.9} />
      </Mesh3d>
      <Mesh3d name="wall-west" allowOverlap transform={Transform.fromXyz(-6.0, 2.2, 0)}>
        <Cuboid half_size={[0.15, 2.3, 8]} />
        <StandardMaterial base_color="#2e241f" perceptual_roughness={0.9} />
      </Mesh3d>
      <Mesh3d name="wall-east" allowOverlap transform={Transform.fromXyz(6.0, 2.2, 0)}>
        <Cuboid half_size={[0.15, 2.3, 8]} />
        <StandardMaterial base_color="#2e241f" perceptual_roughness={0.9} />
      </Mesh3d>

${propsCode}
${actorsCode}
    </AbsoluteFill>
  );
}

registerRoot(() => (
  <Composition
    id="${compositionId}"
    width={1920}
    height={1080}
    fps={${shot.fps}}
    durationInFrames={${shot.durationInFrames}}
    component={Shot_${shot.id.replace(/[^a-zA-Z0-9_]/g, "_")}}
  />
));
`;
}
