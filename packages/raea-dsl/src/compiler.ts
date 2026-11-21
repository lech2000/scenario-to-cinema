import {
  type LocationBlueprint,
  type ShotSpec,
  type Vec3,
  type WorldBible,
  ShotSpecSchema,
  WorldBibleSchema,
} from "@cinema-rpg/shared";

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
    bg: "#141010",
    ambient: 120,
    dirColor: "#ffba75",
    dirIlluminance: 7800,
    dirPos: [2.5, 3.8, 2.2],
  },
  moonlight: {
    bg: "#0b101b",
    ambient: 110,
    dirColor: "#9cc2ff",
    dirIlluminance: 6200,
    dirPos: [-4, 8, -5],
  },
  neon: {
    bg: "#0d0a1a",
    ambient: 150,
    dirColor: "#ff4fd8",
    dirIlluminance: 9800,
    dirPos: [3, 5, 4],
  },
  foggy: {
    bg: "#252c31",
    ambient: 260,
    dirColor: "#c8d6df",
    dirIlluminance: 9000,
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
        startPos: [focusPos[0] + 5.5, 4.2, focusPos[2] + 6.5],
        endPos: [focusPos[0] + 5.5 - dolly * 1.4, 3.8, focusPos[2] + 6.5 - dolly * 1.6],
        lookAt: [focusPos[0], 1.1, focusPos[2]],
        fovDeg: 48,
      };
    case "over_the_shoulder": {
      const dx = secondaryPos[0] - focusPos[0];
      const dz = secondaryPos[2] - focusPos[2];
      const len = Math.hypot(dx, dz) || 1;
      const ux = dx / len;
      const uz = dz / len;
      // Camera behind focus actor's right shoulder looking at secondary actor
      const startPos: Vec3 = [
        focusPos[0] - ux * 1.6 - uz * 0.55,
        1.65,
        focusPos[2] - uz * 1.6 + ux * 0.55,
      ];
      const endPos: Vec3 = [
        startPos[0] + ux * dolly * 0.45,
        1.65,
        startPos[2] + uz * dolly * 0.45,
      ];
      return {
        startPos,
        endPos,
        lookAt: [secondaryPos[0], 1.45, secondaryPos[2]],
        fovDeg: 36,
      };
    }
    case "close_up":
      return {
        startPos: [focusPos[0] + 0.35, 1.58, focusPos[2] + 1.4],
        endPos: [focusPos[0] + 0.25, 1.58, focusPos[2] + 1.4 - dolly * 0.35],
        lookAt: [focusPos[0], 1.52, focusPos[2]],
        fovDeg: 32,
      };
    case "low_angle_hero":
      return {
        startPos: [focusPos[0] + 1.8, 0.75, focusPos[2] + 2.6],
        endPos: [focusPos[0] + 1.4, 0.95, focusPos[2] + 2.6 - dolly * 0.7],
        lookAt: [focusPos[0], 1.45, focusPos[2]],
        fovDeg: 40,
      };
    case "dolly_track":
      return {
        startPos: [focusPos[0] - 2.2, 1.7, focusPos[2] + 3.4],
        endPos: [secondaryPos[0] + 1.6, 1.7, secondaryPos[2] + 3.0],
        lookAt: [
          (focusPos[0] + secondaryPos[0]) / 2,
          1.2,
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
        lookAt: [mx, 1.25, mz],
        fovDeg: 40,
      };
    }
  }
}

/**
 * Deterministically compiles a validated ShotSpec + WorldBible into a runnable
 * `raea` TSX scene (using raea's Bevy-backed primitives and mannequin placeholders
 * ready to be swapped for rigged glTF models in Phase 0/1).
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

  const actorsCode = shot.actors
    .map((act, idx) => {
      const profile = world.characters.find((c) => c.id === act.characterId);
      if (!profile) {
        throw new Error(`Unknown characterId "${act.characterId}"`);
      }
      const from = resolveZoneCenter(location, act.fromZoneId);
      const to = act.toZoneId ? resolveZoneCenter(location, act.toZoneId) : from;
      const bobAmp = act.animation === "walk" || act.animation === "run" ? 0.06 : 0.015;
      const armRaise =
        act.animation === "draw_weapon" || act.animation === "attack_melee"
          ? 0.45
          : act.animation === "talk_intense"
            ? 0.25
            : 0.0;

      return `
      {/* Actor ${idx + 1}: ${profile.name} (${profile.mannequinRigId}, anim=${act.animation}) */}
      <Entity
        transform={Transform.fromXyz(
          interpolate(f, [0, durationInFrames - 1], [${from[0]}, ${to[0]}], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
          ${from[1]} + Math.abs(Math.sin(f * 0.22)) * ${bobAmp},
          interpolate(f, [0, durationInFrames - 1], [${from[2]}, ${to[2]}], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
        )}
      >
        {/* Torso silhouette (swap with rigged glTF mannequin in asset pass) */}
        <Mesh3d transform={Transform.fromXyz(0, 1.05, 0)}>
          <Cuboid half_size={[0.24, 0.42, 0.16]} />
          <StandardMaterial base_color="${profile.accentColor}" perceptual_roughness={0.55} />
        </Mesh3d>
        {/* Head */}
        <Mesh3d transform={Transform.fromXyz(0, 1.66, 0)}>
          <Cuboid half_size={[0.14, 0.16, 0.14]} />
          <StandardMaterial base_color="#e5c7a8" perceptual_roughness={0.65} />
        </Mesh3d>
        {/* Legs */}
        <Mesh3d transform={Transform.fromXyz(-0.11, 0.36, 0)}>
          <Cylinder radius={0.08} half_height={0.36} />
          <StandardMaterial base_color="#23262e" perceptual_roughness={0.7} />
        </Mesh3d>
        <Mesh3d transform={Transform.fromXyz(0.11, 0.36, 0)}>
          <Cylinder radius={0.08} half_height={0.36} />
          <StandardMaterial base_color="#23262e" perceptual_roughness={0.7} />
        </Mesh3d>
        {/* Action arm indicator (${act.animation}) */}
        <Mesh3d transform={Transform.fromXyz(0.32, 1.15 + ${armRaise} * Math.min(1, f / 24), 0.18 * ${armRaise})}>
          <Cuboid half_size={[0.07, 0.28, 0.07]} />
          <StandardMaterial base_color="${profile.accentColor}" perceptual_roughness={0.5} />
        </Mesh3d>
      </Entity>`;
    })
    .join("\n");

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
      <Mesh3d transform={Transform.fromXyz(${p.pos[0]}, ${p.pos[1]}, ${p.pos[2]})}>
        <Cuboid half_size={[${s[0]}, ${s[1]}, ${s[2]}]} />
        <StandardMaterial base_color="${color}" perceptual_roughness={0.75} />
      </Mesh3d>`;
      })
    )
    .join("\n");

  const checkFrames = [
    0,
    Math.floor(shot.durationInFrames / 2),
    shot.durationInFrames - 1,
  ].join(",");

  return `// check: frames ${checkFrames}
// Auto-generated by @cinema-rpg/raea-dsl from ShotSpec "${shot.id}"
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
import { Cylinder, Entity } from "raea/3d";
import { StandardMaterial } from "raea/pbr";
import { Cuboid, Mesh3d } from "raea/mesh";
import { AmbientLight, DirectionalLight } from "raea/light";
import { Transform } from "raea/transform";
import { Camera3d } from "raea/camera";

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
        shadow_maps_enabled
      />

      {/* Stage Floor (${location.name}) */}
      <Mesh3d transform={Transform.fromXyz(0, -0.1, 0)}>
        <Cuboid half_size={[8, 0.1, 8]} />
        <StandardMaterial base_color="${location.floorMaterial}" perceptual_roughness={0.85} />
      </Mesh3d>

${propsCode}
${actorsCode}
    </AbsoluteFill>
  );
}

registerRoot(() => (
  <Composition
    id="${shot.id}"
    width={1920}
    height={1080}
    fps={${shot.fps}}
    durationInFrames={${shot.durationInFrames}}
    component={Shot_${shot.id.replace(/[^a-zA-Z0-9_]/g, "_")}}
  />
));
`;
}
