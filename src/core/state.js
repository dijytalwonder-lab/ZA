// Shared mutable game singleton. Filled in by main.js at boot.
export const G = {
  renderer: null,
  composer: null,
  bloom: null,
  renderPass: null,
  camera: null,
  camRig: null,
  input: null,
  audio: null,
  hud: null,
  fx: null,
  player: null,
  stage: null,
  settings: null,
  save: null,
  assets: null,
  mg: null,
  hitstop: 0,
  paused: false,
  timeScale: 1,
  playing: false,
  flags: {}
};
