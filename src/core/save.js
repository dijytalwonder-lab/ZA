const SAVE_KEY = 'lastcommute.save.v1';
const SET_KEY = 'lastcommute.settings.v1';
const OUTFIT_KEY = 'lastcommute.outfit.v1';

export const DEFAULT_SETTINGS = { quality: 'med', music: 0.6, sfx: 0.85, sens: 1, invertY: false, fps: false, haptics: true };

// First run on a weak phone (4 cores or fewer, 3 GB or less): start on LOW graphics. Anything the player has saved wins over this.
function deviceDefaults() {
  try {
    const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    const weak = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 3;
    if (touch && weak) return Object.assign({}, DEFAULT_SETTINGS, { quality: 'low' });
  } catch (e) { /* use the plain defaults */ }
  return DEFAULT_SETTINGS;
}

function read(key) {
  try {
    const s = localStorage.getItem(key);
    return s ? JSON.parse(s) : null;
  } catch (e) { return null; }
}
function write(key, v) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* storage full / blocked */ }
}

export const Save = {
  loadSettings() {
    return Object.assign({}, deviceDefaults(), read(SET_KEY) || {});
  },
  saveSettings(s) { write(SET_KEY, s); },
  load() { return read(SAVE_KEY); },
  has() { return !!read(SAVE_KEY); },
  store(data) {
    const prev = read(SAVE_KEY) || {};
    write(SAVE_KEY, Object.assign(prev, data, { savedAt: Date.now() }));
  },
  wipe() {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
  },
  /** Outfit lives in its own key so "New Game" keeps the chosen character. */
  loadOutfit() { return (read(OUTFIT_KEY) || {}).id ?? 0; },
  saveOutfit(id) { write(OUTFIT_KEY, { id }); }
};
