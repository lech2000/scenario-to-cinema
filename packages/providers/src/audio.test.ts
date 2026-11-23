import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  MultiTierRoleAudioProvider,
  computeFramesFromAudioDuration,
  formatSubtitlesSrt,
  formatSubtitlesWebVtt,
  mergeEpisodeSubtitles,
  synthesizeTurnAudioTrack,
} from "./audio.js";

test("synthesizeTurnAudioTrack produces valid multi-role WAV, frame-locked durationInFrames, and SRT/WebVTT subtitles", async () => {
  const prevForce = process.env.FORCE_SYNTH_TTS;
  process.env.FORCE_SYNTH_TTS = "1";
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cinema-audio-test-"));

  try {
    const provider = new MultiTierRoleAudioProvider({ workDir: tmpDir });
    const track = await synthesizeTurnAudioTrack({
      outDir: tmpDir,
      baseName: "shot_01",
      fps: 24,
      provider,
      sfxTags: [{ tag: "sword_unsheathe", atFrame: 18 }],
      lines: [
        {
          speakerId: "narrator",
          speakerName: "Рассказчик",
          role: "narrator",
          voiceId: "voice_ru_narrator",
          text: "Свеча на столе дрогнула от порыва ветра.",
          emotion: "neutral",
        },
        {
          speakerId: "hero",
          speakerName: "Мира",
          role: "protagonist",
          voiceId: "voice_ru_hero_01",
          text: "Говори правду, Шрам!",
          emotion: "tense",
        },
        {
          speakerId: "npc_primary",
          speakerName: "Шрам",
          role: "antagonist",
          voiceId: "voice_ru_npc_01",
          text: "Второй попытки не будет.",
          emotion: "angry",
        },
      ],
    });

    assert.ok(fs.existsSync(track.wavPath));
    assert.ok(fs.existsSync(track.srtPath));
    assert.ok(fs.existsSync(track.vttPath));
    assert.ok(track.durationSec > 3.5);
    assert.equal(
      track.durationInFrames,
      computeFramesFromAudioDuration(track.durationSec, 24)
    );
    assert.equal(track.cues.length, 3);
    assert.ok(track.cues[0].startSec >= 0.2);
    assert.ok(track.cues[1].startSec > track.cues[0].endSec);
    assert.ok(track.cues[2].startSec > track.cues[1].endSec);

    const srt = fs.readFileSync(track.srtPath, "utf-8");
    const vtt = fs.readFileSync(track.vttPath, "utf-8");
    assert.match(srt, /1\n00:00:00,220 --> /);
    assert.match(srt, /Мира: Говори правду, Шрам!/);
    assert.match(vtt, /^WEBVTT\n\n00:00:00\.220 --> /);
    assert.match(vtt, /<v Шрам>Шрам: Второй попытки не будет\./);

    const merged = mergeEpisodeSubtitles([
      { durationSec: track.durationSec, cues: track.cues },
      { durationSec: 2.5, cues: [track.cues[1]] },
    ]);
    assert.equal(merged.length, 4);
    assert.ok(merged[3].startSec > track.durationSec);
    assert.match(formatSubtitlesSrt(merged), /4\n/);
    assert.match(formatSubtitlesWebVtt(merged), /WEBVTT/);
  } finally {
    if (prevForce === undefined) delete process.env.FORCE_SYNTH_TTS;
    else process.env.FORCE_SYNTH_TTS = prevForce;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
