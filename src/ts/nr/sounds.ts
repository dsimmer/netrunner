// Sound effect management: Howler soundbank, sfx playback, bespoke sounds.
// Mirrors: src/cljs/nr/sounds.cljs

import { Howl, Howler } from "howler";
import { strToInt } from "../jinteki/utils";
import { useAppState } from "./appstate";

export interface BespokeSound {
  grouping: string;
  default: string | null;
}

export const bespokeSounds: Record<string, BespokeSound> = {
  "archer": { grouping: "archer", default: "rez-ice" },
  "bloop": { grouping: "harmonics", default: "rez-ice" },
  "echo": { grouping: "harmonics", default: "rez-ice" },
  "illumination": { grouping: "illumination", default: "play-instant" },
  // admittedly, this looks silly, but it's actually really cool, trust me - nbk
  "bling-1": { grouping: "bling", default: null },
  "bling-2": { grouping: "bling", default: null },
  "bling-3": { grouping: "bling", default: null },
  "bling-4": { grouping: "bling", default: null },
  "bling-5": { grouping: "bling", default: null },
  "bling-6": { grouping: "bling", default: null },
  "bling-7": { grouping: "bling", default: null },
  "bling-8": { grouping: "bling", default: null },
  "bling-9": { grouping: "bling", default: null },
  "bling-10": { grouping: "bling", default: null },
  "end-of-the-line": { grouping: "end-of-the-line", default: "play-instant" },
  "pulse": { grouping: "harmonics", default: "rez-ice" },
  "wave": { grouping: "harmonics", default: "rez-ice" },
};

export const soundNames: string[] = [
  "agenda-score",
  "agenda-steal",
  "click-advance",
  "click-card",
  "click-card-2",
  "click-card-3",
  "click-credit",
  "click-credit-2",
  "click-credit-3",
  "click-run",
  "click-remove-tag",
  "game-end",
  "install-corp",
  "install-runner",
  "play-instant",
  "professional-contacts",
  "rez-ice",
  "rez-other",
  "redirect",
  "run-successful",
  "run-unsuccessful",
  "shuffle",
  "time-out",
  "vic",
  "virus-purge",
];

function audioSfx(sound: string): [string, Howl] {
  return [
    sound,
    new Howl({
      src: [
        `/sound/${sound}.ogg`,
        `/sound/${sound}.mp3`,
      ],
    }),
  ];
}

function shuffleArray<T>(arr: T[]): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function selectRandomFromGrouping(key: string): string | undefined {
  const allKeys = Object.keys(bespokeSounds);
  const relevant = allKeys.filter(
    (k) => bespokeSounds[k].grouping === key,
  );
  const shuffled = shuffleArray(relevant);
  return shuffled[0];
}

export function pickSound(name: string, force?: boolean): string | null {
  if (force) {
    return name;
  }
  const sound = bespokeSounds[name];
  if (sound) {
    const bespokeSoundsOpt = useAppState.getState().options["bespoke-sounds"] as Record<string, unknown> | undefined;
    if (bespokeSoundsOpt && bespokeSoundsOpt[sound.grouping]) {
      return name;
    }
    return sound.default ?? name;
  }
  return name;
}

export function randomSound(): string {
  return shuffleArray(soundNames)[0]!;
}

export const soundbank: Record<string, Howl> = (() => {
  const allSounds = [...soundNames, ...Object.keys(bespokeSounds)];
  const bank: Record<string, Howl> = {};
  for (const name of allSounds) {
    const [soundName, howl] = audioSfx(name);
    bank[soundName] = howl;
  }
  return bank;
})();

export function playSound(elementId: string): void {
  const lobbySounds = useAppState.getState().options["lobby-sounds"] as boolean | undefined;
  if (lobbySounds) {
    const element = document.getElementById(elementId) as HTMLMediaElement | null;
    if (element) {
      element.play();
    }
  }
}

/**
 * Chrome doesn't allow audio until audio context is resumed (or created) after a user interaction.
 */
export function resumeSound(): void {
  const audioContext = (Howler as unknown as { ctx?: { resume: () => void } }).ctx;
  if (audioContext) {
    audioContext.resume();
  }
}

export function playSfx(sfx: string[], args?: { volume?: number; force?: boolean }): void {
  const sfxKey = pickSound(sfx[0], args?.force);
  if (sfxKey) {
    const sound = soundbank[sfxKey];
    if (sound) {
      const volume = args?.volume ?? strToInt(String(useAppState.getState().options["sounds-volume"]));
      sound.volume(volume / 100);
      sound.play();
    }
  }
  if (sfx.length > 1) {
    playSfx(sfx.slice(1), args);
  }
}

let sfxLastPlayed: number | undefined = undefined;

export function updateAudio(state: { sfx: Array<{ id: number; name: string }>; sfxCurrentId?: number }): void {
  // When it's the first game played with this state or when the sound history comes from different game,
  // we skip the cacophony
  const soundsEnabled = useAppState.getState().options["sounds"] as boolean | undefined;
  if (soundsEnabled && sfxLastPlayed !== undefined && sfxLastPlayed !== null) {
    // Skip the SFX from queue with id smaller than the one last played, queue the rest
    const sfxToPlay = state.sfx
      .filter((s) => s.id > sfxLastPlayed!)
      .map((s) => s.name);
    playSfx(sfxToPlay);
  }
  // Remember the most recent sfx id as last played so we don't repeat it later
  if (state.sfxCurrentId !== undefined) {
    sfxLastPlayed = state.sfxCurrentId;
  }
}
