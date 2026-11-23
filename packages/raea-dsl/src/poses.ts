import type {
  AnimationClipId,
  CharacterProfile,
  Vec3,
} from "@cinema-rpg/shared";

export interface ExpressivePoseSpec {
  clip: AnimationClipId;
  /** Torso forward/backward lean in radians */
  torsoPitch: number;
  /** Torso twist around Y in radians */
  torsoYaw: number;
  /** Hip vertical offset (crouch/sit/fall) in metres */
  pelvisDrop: number;
  /** Head pitch (nod/look down) in radians */
  headPitch: number;
  /** Right shoulder/arm Euler XYZ in radians */
  rightArmEuler: Vec3;
  /** Left shoulder/arm Euler XYZ in radians */
  leftArmEuler: Vec3;
  /** Stride swing amplitude in radians (walk/run) */
  legSwingAmp: number;
  /** Vertical bob amplitude in metres */
  bobAmp: number;
  /** Optional held prop drawn in right hand */
  heldProp: "none" | "sword" | "spell_orb" | "lantern";
}

export const EXPRESSIVE_POSES: Record<AnimationClipId, ExpressivePoseSpec> = {
  idle: {
    clip: "idle",
    torsoPitch: 0.03,
    torsoYaw: 0.06,
    pelvisDrop: 0,
    headPitch: 0,
    rightArmEuler: [0.08, 0, -0.12],
    leftArmEuler: [-0.05, 0, 0.12],
    legSwingAmp: 0,
    bobAmp: 0.012,
    heldProp: "none",
  },
  walk: {
    clip: "walk",
    torsoPitch: 0.08,
    torsoYaw: 0,
    pelvisDrop: 0,
    headPitch: -0.03,
    rightArmEuler: [0.35, 0, -0.1],
    leftArmEuler: [-0.35, 0, 0.1],
    legSwingAmp: 0.42,
    bobAmp: 0.045,
    heldProp: "none",
  },
  run: {
    clip: "run",
    torsoPitch: 0.22,
    torsoYaw: 0,
    pelvisDrop: 0.04,
    headPitch: -0.08,
    rightArmEuler: [0.65, 0, -0.14],
    leftArmEuler: [-0.65, 0, 0.14],
    legSwingAmp: 0.72,
    bobAmp: 0.075,
    heldProp: "none",
  },
  talk_calm: {
    clip: "talk_calm",
    torsoPitch: 0.04,
    torsoYaw: 0.1,
    pelvisDrop: 0,
    headPitch: -0.04,
    rightArmEuler: [-0.55, 0.18, -0.18],
    leftArmEuler: [-0.22, -0.1, 0.14],
    legSwingAmp: 0,
    bobAmp: 0.014,
    heldProp: "none",
  },
  talk_intense: {
    clip: "talk_intense",
    torsoPitch: 0.14,
    torsoYaw: 0.18,
    pelvisDrop: 0.02,
    headPitch: -0.06,
    rightArmEuler: [-1.05, 0.22, -0.26],
    leftArmEuler: [-0.62, -0.2, 0.22],
    legSwingAmp: 0.05,
    bobAmp: 0.022,
    heldProp: "none",
  },
  draw_weapon: {
    clip: "draw_weapon",
    torsoPitch: 0.12,
    torsoYaw: -0.24,
    pelvisDrop: 0.05,
    headPitch: -0.05,
    rightArmEuler: [-1.18, 0.28, -0.32],
    leftArmEuler: [0.28, -0.15, 0.24],
    legSwingAmp: 0.12,
    bobAmp: 0.02,
    heldProp: "sword",
  },
  attack_melee: {
    clip: "attack_melee",
    torsoPitch: 0.26,
    torsoYaw: -0.38,
    pelvisDrop: 0.08,
    headPitch: -0.08,
    rightArmEuler: [-1.52, 0.35, -0.22],
    leftArmEuler: [0.42, -0.22, 0.3],
    legSwingAmp: 0.28,
    bobAmp: 0.035,
    heldProp: "sword",
  },
  cast_spell: {
    clip: "cast_spell",
    torsoPitch: -0.08,
    torsoYaw: 0.12,
    pelvisDrop: 0.02,
    headPitch: -0.12,
    rightArmEuler: [-1.35, 0.15, -0.25],
    leftArmEuler: [-1.25, -0.15, 0.25],
    legSwingAmp: 0,
    bobAmp: 0.03,
    heldProp: "spell_orb",
  },
  dodge: {
    clip: "dodge",
    torsoPitch: 0.28,
    torsoYaw: 0.35,
    pelvisDrop: 0.18,
    headPitch: -0.1,
    rightArmEuler: [-0.65, 0.2, -0.45],
    leftArmEuler: [-0.65, -0.2, 0.45],
    legSwingAmp: 0.32,
    bobAmp: 0.04,
    heldProp: "none",
  },
  fall: {
    clip: "fall",
    torsoPitch: 1.15,
    torsoYaw: 0.2,
    pelvisDrop: 0.52,
    headPitch: 0.25,
    rightArmEuler: [-0.85, 0, -0.6],
    leftArmEuler: [-0.75, 0, 0.6],
    legSwingAmp: 0.15,
    bobAmp: 0.01,
    heldProp: "none",
  },
  sit: {
    clip: "sit",
    torsoPitch: 0.06,
    torsoYaw: 0.05,
    pelvisDrop: 0.32,
    headPitch: -0.03,
    rightArmEuler: [-0.45, 0.12, -0.12],
    leftArmEuler: [-0.45, -0.12, 0.12],
    legSwingAmp: 0,
    bobAmp: 0.008,
    heldProp: "none",
  },
  inspect: {
    clip: "inspect",
    torsoPitch: 0.32,
    torsoYaw: 0.12,
    pelvisDrop: 0.12,
    headPitch: 0.34,
    rightArmEuler: [-0.78, 0.18, -0.14],
    leftArmEuler: [0.15, 0, 0.16],
    legSwingAmp: 0.06,
    bobAmp: 0.014,
    heldProp: "lantern",
  },
};

export function buildCharacterRigTsx(params: {
  profile: CharacterProfile;
  animation: AnimationClipId;
  from: Vec3;
  to: Vec3;
  lookTarget: Vec3;
  actorIndex: number;
}): { tsx: string; usesNativeRaeaCharacter: boolean } {
  const { profile, animation, from, to, lookTarget, actorIndex } = params;
  const pose = EXPRESSIVE_POSES[animation];
  const scale = profile.mannequinRigId === "creature_small" ? 0.74 : 1.0;

  // Compute facing yaw toward target (or travel direction when moving)
  const moveDx = to[0] - from[0];
  const moveDz = to[2] - from[2];
  const lookDx = lookTarget[0] - to[0];
  const lookDz = lookTarget[2] - to[2];
  const yawRad =
    Math.hypot(lookDx, lookDz) > 0.2
      ? Math.atan2(lookDx, lookDz)
      : Math.hypot(moveDx, moveDz) > 0.1
        ? Math.atan2(moveDx, moveDz)
        : 0;

  // 1. Native raea/character <Character> path (placed directly at root, NEVER inside <Entity>)
  if (profile.raeaBodyId) {
    const varPrefix = `char_${actorIndex}`;
    return {
      usesNativeRaeaCharacter: true,
      tsx: `
      {/* Native raea/character Rig #${actorIndex + 1}: ${profile.name} (body=${profile.raeaBodyId}, anim=${animation}) */}
      <Character
        name="${profile.id}"
        body="${profile.raeaBodyId}"
        scale={${scale}}
        yaw={${yawRad.toFixed(3)}}
        position={[
          interpolate(f, [0, durationInFrames - 1], [${from[0].toFixed(3)}, ${to[0].toFixed(3)}], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
          ${from[1].toFixed(3)},
          interpolate(f, [0, durationInFrames - 1], [${from[2].toFixed(3)}, ${to[2].toFixed(3)}], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        ]}
        goals={{
          weight: 0.85,
          look: [${lookTarget[0].toFixed(3)}, ${(lookTarget[1] + 1.48).toFixed(3)}, ${lookTarget[2].toFixed(3)}],
        }}
        outline
      />`,
    };
  }

  // 2. Built-in 14-part articulated humanoid rig (works zero-download in CI & live GPU)
  const rigExtras = buildArchetypeSilhouette(profile);
  const propMesh = buildHeldProp(profile, pose.heldProp);
  const shoulderHalfWidth = profile.mannequinRigId === "armored" ? 0.28 : 0.24;

  return {
    usesNativeRaeaCharacter: false,
    tsx: `
      {/* Articulated Rigged Figure #${actorIndex + 1}: ${profile.name} (${profile.mannequinRigId}, anim=${animation}) */}
      <Entity
        transform={Transform.fromXyz(
          interpolate(f, [0, durationInFrames - 1], [${from[0].toFixed(3)}, ${to[0].toFixed(3)}], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
          ${(from[1] - pose.pelvisDrop).toFixed(3)} + Math.abs(Math.sin(f * 0.24)) * ${pose.bobAmp},
          interpolate(f, [0, durationInFrames - 1], [${from[2].toFixed(3)}, ${to[2].toFixed(3)}], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
        )
          .withRotation(Quat.fromEuler("XYZ", 0, ${yawRad.toFixed(3)}, 0))
          .withScale([${scale}, ${scale}, ${scale}])}
      >
        {/* Pelvis & Upper Body Spine (pose=${animation}) */}
        <Mesh3d name="${profile.id}-pelvis" allowOverlap transform={Transform.fromXyz(0, 0.78, 0)}>
          <Capsule3d radius={0.14} half_length={0.07} />
          <StandardMaterial base_color="#25232a" perceptual_roughness={0.72} />
        </Mesh3d>

        <Entity
          transform={Transform.fromXyz(0, 0.86, 0).withRotation(
            Quat.fromEuler(
              "XYZ",
              ${pose.torsoPitch.toFixed(3)} + Math.sin(f * 0.12) * 0.025,
              ${pose.torsoYaw.toFixed(3)},
              0
            )
          )}
        >
          {/* Sculpted Torso */}
          <Mesh3d name="${profile.id}-torso" allowOverlap transform={Transform.fromXyz(0, 0.28, 0)}>
            <Capsule3d radius={0.17} half_length={0.18} />
            <StandardMaterial base_color="${profile.accentColor}" perceptual_roughness={0.52} />
          </Mesh3d>

${rigExtras}

          {/* Articulated Neck & Expressive Head */}
          <Entity
            transform={Transform.fromXyz(0, 0.62, 0).withRotation(
              Quat.fromEuler(
                "XYZ",
                ${pose.headPitch.toFixed(3)} + Math.sin(f * 0.2) * ${animation.startsWith("talk") ? "0.065" : "0.015"},
                Math.sin(f * 0.1) * 0.08,
                0
              )
            )}
          >
            <Mesh3d name="${profile.id}-head" allowOverlap transform={Transform.fromXyz(0, 0.14, 0)}>
              <Sphere radius={0.135} />
              <StandardMaterial base_color="#e6c7a8" perceptual_roughness={0.58} />
            </Mesh3d>
            {/* Brow / gaze direction cue (+z face) */}
            <Mesh3d name="${profile.id}-brow" allowOverlap transform={Transform.fromXyz(0, 0.16, 0.12)}>
              <Cuboid half_size={[0.075, 0.018, 0.02]} />
              <StandardMaterial base_color="#2a211d" perceptual_roughness={0.8} />
            </Mesh3d>
          </Entity>

          {/* Right Shoulder -> Articulated Arm + Prop */}
          <Entity
            transform={Transform.fromXyz(-${shoulderHalfWidth}, 0.52, 0).withRotation(
              Quat.fromEuler(
                "XYZ",
                ${pose.rightArmEuler[0].toFixed(3)} * Math.min(1, 0.35 + f / 18) + Math.sin(f * 0.24) * ${(pose.legSwingAmp * 0.45).toFixed(3)},
                ${pose.rightArmEuler[1].toFixed(3)},
                ${pose.rightArmEuler[2].toFixed(3)}
              )
            )}
          >
            <Mesh3d name="${profile.id}-arm-r-upper" allowOverlap transform={Transform.fromXyz(0, -0.15, 0)}>
              <Capsule3d radius={0.058} half_length={0.12} />
              <StandardMaterial base_color="${profile.accentColor}" perceptual_roughness={0.55} />
            </Mesh3d>
            <Entity transform={Transform.fromXyz(0, -0.31, 0).withRotation(Quat.fromEuler("XYZ", -0.38, 0, 0))}>
              <Mesh3d name="${profile.id}-arm-r-fore" allowOverlap transform={Transform.fromXyz(0, -0.13, 0)}>
                <Capsule3d radius={0.048} half_length={0.11} />
                <StandardMaterial base_color="#d8b99b" perceptual_roughness={0.62} />
              </Mesh3d>
${propMesh}
            </Entity>
          </Entity>

          {/* Left Shoulder -> Articulated Arm */}
          <Entity
            transform={Transform.fromXyz(${shoulderHalfWidth}, 0.52, 0).withRotation(
              Quat.fromEuler(
                "XYZ",
                ${pose.leftArmEuler[0].toFixed(3)} - Math.sin(f * 0.24) * ${(pose.legSwingAmp * 0.45).toFixed(3)},
                ${pose.leftArmEuler[1].toFixed(3)},
                ${pose.leftArmEuler[2].toFixed(3)}
              )
            )}
          >
            <Mesh3d name="${profile.id}-arm-l-upper" allowOverlap transform={Transform.fromXyz(0, -0.15, 0)}>
              <Capsule3d radius={0.058} half_length={0.12} />
              <StandardMaterial base_color="${profile.accentColor}" perceptual_roughness={0.55} />
            </Mesh3d>
            <Entity transform={Transform.fromXyz(0, -0.31, 0).withRotation(Quat.fromEuler("XYZ", -0.28, 0, 0))}>
              <Mesh3d name="${profile.id}-arm-l-fore" allowOverlap transform={Transform.fromXyz(0, -0.13, 0)}>
                <Capsule3d radius={0.048} half_length={0.11} />
                <StandardMaterial base_color="#d8b99b" perceptual_roughness={0.62} />
              </Mesh3d>
            </Entity>
          </Entity>
        </Entity>

        {/* Left & Right Articulated Legs */}
        <Entity
          transform={Transform.fromXyz(-0.11, 0.74, 0).withRotation(
            Quat.fromEuler("XYZ", ${animation === "sit" ? "-1.35" : `Math.sin(f * 0.24) * ${pose.legSwingAmp.toFixed(3)}`}, 0, 0)
          )}
        >
          <Mesh3d name="${profile.id}-thigh-r" allowOverlap transform={Transform.fromXyz(0, -0.19, 0)}>
            <Capsule3d radius={0.072} half_length={0.15} />
            <StandardMaterial base_color="#23262e" perceptual_roughness={0.74} />
          </Mesh3d>
          <Entity transform={Transform.fromXyz(0, -0.38, 0).withRotation(Quat.fromEuler("XYZ", ${animation === "sit" ? "1.35" : "0.12"}, 0, 0))}>
            <Mesh3d name="${profile.id}-calf-r" allowOverlap transform={Transform.fromXyz(0, -0.18, 0)}>
              <Capsule3d radius={0.058} half_length={0.15} />
              <StandardMaterial base_color="#1a1c22" perceptual_roughness={0.78} />
            </Mesh3d>
          </Entity>
        </Entity>

        <Entity
          transform={Transform.fromXyz(0.11, 0.74, 0).withRotation(
            Quat.fromEuler("XYZ", ${animation === "sit" ? "-1.35" : `-Math.sin(f * 0.24) * ${pose.legSwingAmp.toFixed(3)}`}, 0, 0)
          )}
        >
          <Mesh3d name="${profile.id}-thigh-l" allowOverlap transform={Transform.fromXyz(0, -0.19, 0)}>
            <Capsule3d radius={0.072} half_length={0.15} />
            <StandardMaterial base_color="#23262e" perceptual_roughness={0.74} />
          </Mesh3d>
          <Entity transform={Transform.fromXyz(0, -0.38, 0).withRotation(Quat.fromEuler("XYZ", ${animation === "sit" ? "1.35" : "0.12"}, 0, 0))}>
            <Mesh3d name="${profile.id}-calf-l" allowOverlap transform={Transform.fromXyz(0, -0.18, 0)}>
              <Capsule3d radius={0.058} half_length={0.15} />
              <StandardMaterial base_color="#1a1c22" perceptual_roughness={0.78} />
            </Mesh3d>
          </Entity>
        </Entity>
      </Entity>`,
  };
}

function buildArchetypeSilhouette(profile: CharacterProfile): string {
  switch (profile.mannequinRigId) {
    case "cloaked":
      return `          {/* Ranger Cloak & Hood Silhouette */}
          <Mesh3d name="${profile.id}-cape" allowOverlap transform={Transform.fromXyz(0, 0.16, -0.16).withRotation(Quat.fromEuler("XYZ", 0.14, 0, 0))}>
            <Cone radius={0.28} height={0.78} />
            <StandardMaterial base_color="${profile.accentColor}" perceptual_roughness={0.78} />
          </Mesh3d>`;
    case "armored":
      return `          {/* Armored Pauldrons & Chestplate */}
          <Mesh3d name="${profile.id}-pauldron-l" allowOverlap transform={Transform.fromXyz(0.25, 0.52, 0)}>
            <Sphere radius={0.105} />
            <StandardMaterial base_color="#7b828e" metallic={0.65} perceptual_roughness={0.35} />
          </Mesh3d>
          <Mesh3d name="${profile.id}-pauldron-r" allowOverlap transform={Transform.fromXyz(-0.25, 0.52, 0)}>
            <Sphere radius={0.105} />
            <StandardMaterial base_color="#7b828e" metallic={0.65} perceptual_roughness={0.35} />
          </Mesh3d>`;
    default:
      return `          {/* Belt / Tunic Trim */}
          <Mesh3d name="${profile.id}-belt" allowOverlap transform={Transform.fromXyz(0, 0.06, 0)}>
            <Cylinder radius={0.175} half_height={0.035} />
            <StandardMaterial base_color="#3b2b20" perceptual_roughness={0.7} />
          </Mesh3d>`;
  }
}

function buildHeldProp(
  profile: CharacterProfile,
  prop: ExpressivePoseSpec["heldProp"]
): string {
  if (prop === "sword") {
    return `              <Mesh3d name="${profile.id}-blade" allowOverlap transform={Transform.fromXyz(0, -0.26, 0.28).withRotation(Quat.fromEuler("XYZ", 1.35, 0, 0))}>
                <Cuboid half_size={[0.018, 0.34, 0.04]} />
                <StandardMaterial base_color="#dce4f2" metallic={0.8} perceptual_roughness={0.22} />
              </Mesh3d>`;
  }
  if (prop === "spell_orb") {
    return `              <Mesh3d name="${profile.id}-orb" allowOverlap transform={Transform.fromXyz(0, -0.28, 0.12)}>
                <Sphere radius={0.085} />
                <StandardMaterial base_color="#8be9fd" perceptual_roughness={0.15} />
              </Mesh3d>`;
  }
  if (prop === "lantern") {
    return `              <Mesh3d name="${profile.id}-lantern" allowOverlap transform={Transform.fromXyz(0, -0.28, 0.08)}>
                <Cylinder radius={0.055} half_height={0.08} />
                <StandardMaterial base_color="#ffba5a" perceptual_roughness={0.3} />
              </Mesh3d>`;
  }
  return "";
}
