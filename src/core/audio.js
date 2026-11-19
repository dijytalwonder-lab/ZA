// Fully procedural audio: synthwave music sequencer + synthesized SFX (no asset files).
const MOODS = {
  menu: { bpm: 96, chords: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], bass: 1, arp: 2, drums: 1, cutoff: 2200 },
  calm: { bpm: 76, chords: [[57, 60, 64], [53, 57, 60], [60, 64, 67], [55, 59, 62]], bass: 1, arp: 4, drums: 0, cutoff: 1300 },
  city: { bpm: 108, chords: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], bass: 1, arp: 2, drums: 2, cutoff: 2600 },
  tense: { bpm: 116, chords: [[57, 60, 63], [57, 60, 63], [53, 56, 60], [52, 56, 59]], bass: 1, arp: 1, drums: 1, cutoff: 1100 },
  combat: { bpm: 138, chords: [[57, 60, 64], [57, 60, 63], [53, 57, 60], [55, 58, 62]], bass: 1, arp: 1, drums: 3, cutoff: 3000 }
};
const mtof = (n) => 440 * Math.pow(2, (n - 69) / 12);

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.vol = { music: 0.6, sfx: 0.8 };
    this.mood = null;
    this.step = 0;
    this.nextTime = 0;
    this.timer = null;
    this.alarmTimer = null;
    this.siren = null;
    this.engineNodes = null;
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const c = (this.ctx = new AC());
      this.comp = c.createDynamicsCompressor();
      this.comp.connect(c.destination);
      this.master = c.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.comp);
      this.musicGain = c.createGain();
      this.musicGain.connect(this.master);
      this.sfxGain = c.createGain();
      this.sfxGain.connect(this.master);
      // delay send for arps
      this.delay = c.createDelay(1);
      this.delay.delayTime.value = 0.28;
      const fb = c.createGain();
      fb.gain.value = 0.35;
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1800;
      this.delay.connect(lp);
      lp.connect(fb);
      fb.connect(this.delay);
      lp.connect(this.musicGain);
      const len = c.sampleRate * 2;
      this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.applyVolumes();
      if (this.pendingMood) this.setMood(this.pendingMood);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setVolumes(music, sfx) {
    this.vol.music = music;
    this.vol.sfx = sfx;
    this.applyVolumes();
  }
  applyVolumes() {
    if (!this.ctx) return;
    this.musicGain.gain.value = this.vol.music * 0.55;
    this.sfxGain.gain.value = this.vol.sfx;
  }

  /* ---------------- music ---------------- */
  setMood(name) {
    this.pendingMood = name;
    if (!this.ctx) return;
    if (this.mood === name) return;
    this.mood = name;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.1;
    if (!this.timer) this.timer = setInterval(() => this._tick(), 60);
    if (!name) { clearInterval(this.timer); this.timer = null; }
  }
  _tick() {
    const c = this.ctx;
    const m = MOODS[this.mood];
    if (!c || !m || c.state !== 'running') { if (c && m) this.nextTime = Math.max(this.nextTime, c.currentTime); return; }
    const spb = 60 / m.bpm / 4;
    let guard = 0;
    while (this.nextTime < c.currentTime + 0.3 && guard++ < 16) {
      this._step(this.step, this.nextTime, m);
      this.nextTime += spb;
      this.step++;
    }
  }
  _step(s, t, m) {
    const bar = Math.floor(s / 16) % m.chords.length;
    const i = s % 16;
    const ch = m.chords[bar];
    if (i === 0) this._pad(t, ch, 60 / m.bpm * 4, m);
    if (m.bass && i % 2 === 0) {
      const root = ch[0] - 24;
      const oct = (i % 8 === 6) ? 12 : 0;
      this._voice(t, mtof(root + oct), 0.2, 'sawtooth', 0.22, 420 + (i % 4 === 0 ? 300 : 0), this.musicGain);
    }
    if (m.arp && i % m.arp === 0) {
      const k = Math.floor(i / m.arp);
      const note = ch[k % 3] + 12 + ((k >> 2) % 2) * 12;
      this._voice(t, mtof(note), 0.16, 'square', 0.07, m.cutoff, this.delay, this.musicGain);
    }
    if (m.drums) {
      const d = m.drums;
      if (i % 4 === 0 && d >= 1) this._kick(t);
      if ((i === 4 || i === 12) && d >= 2) this._snare(t);
      if (d >= 3 && i % 2 === 1) this._hat(t);
      if (d === 2 && i % 4 === 2) this._hat(t);
    }
  }
  _voice(t, f, dur, type, vol, cutoff, dest, dest2) {
    const c = this.ctx;
    const o = c.createOscillator();
    const g = c.createGain();
    const fl = c.createBiquadFilter();
    fl.type = 'lowpass';
    fl.frequency.value = cutoff;
    o.type = type;
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(fl); fl.connect(g); g.connect(dest);
    if (dest2) g.connect(dest2);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
  _pad(t, ch, dur, m) {
    const c = this.ctx;
    ch.forEach((n, idx) => {
      const o = c.createOscillator();
      const g = c.createGain();
      const fl = c.createBiquadFilter();
      fl.type = 'lowpass';
      fl.frequency.value = m.cutoff * 0.5;
      o.type = 'sawtooth';
      o.frequency.value = mtof(n);
      o.detune.value = (idx - 1) * 8;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.05, t + dur * 0.3);
      g.gain.linearRampToValueAtTime(0.0001, t + dur);
      o.connect(fl); fl.connect(g); g.connect(this.musicGain);
      o.start(t);
      o.stop(t + dur + 0.1);
    });
  }
  _kick(t) {
    const c = this.ctx;
    const o = c.createOscillator();
    const g = c.createGain();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.14);
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(g); g.connect(this.musicGain);
    o.start(t); o.stop(t + 0.2);
  }
  _snare(t) { this._noiseAt(t, 0.14, 0.22, 1800, 'bandpass', this.musicGain); }
  _hat(t) { this._noiseAt(t, 0.04, 0.08, 7000, 'highpass', this.musicGain); }
  _noiseAt(t, dur, vol, freq, type, dest, freq2) {
    const c = this.ctx;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    const fl = c.createBiquadFilter();
    fl.type = type;
    fl.frequency.setValueAtTime(freq, t);
    if (freq2) fl.frequency.exponentialRampToValueAtTime(freq2, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(dest || this.sfxGain);
    s.start(t, Math.random() * 1.5, dur + 0.05);
  }

  /* ---------------- sfx ---------------- */
  _tone(f, dur, type = 'sine', vol = 0.25, slideTo = null, delay = 0) {
    const c = this.ctx;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.sfxGain);
    o.start(t); o.stop(t + dur + 0.05);
  }
  _n(dur, vol, f, type = 'lowpass', f2 = null, delay = 0) {
    this._noiseAt(this.ctx.currentTime + delay, dur, vol, f, type, this.sfxGain, f2);
  }

  sfx(name) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    switch (name) {
      case 'ui': this._tone(880, 0.07, 'sine', 0.15); break;
      case 'select': this._tone(560, 0.08, 'triangle', 0.2, 900); break;
      case 'back': this._tone(500, 0.08, 'triangle', 0.18, 300); break;
      case 'error': this._tone(150, 0.18, 'square', 0.15); break;
      case 'type': this._tone(1500, 0.02, 'square', 0.04); break;
      case 'coin': this._tone(1250, 0.07, 'square', 0.12); this._tone(1850, 0.12, 'square', 0.12, null, 0.06); break;
      case 'pickup': [523, 659, 784, 1046].forEach((f, i) => this._tone(f, 0.1, 'triangle', 0.18, null, i * 0.06)); break;
      case 'heal': this._tone(600, 0.2, 'sine', 0.2, 1200); this._tone(900, 0.25, 'sine', 0.15, 1600, 0.12); break;
      case 'beep': this._tone(1400, 0.1, 'square', 0.1); this._tone(1400, 0.1, 'square', 0.1, null, 0.16); break;
      case 'tick': this._tone(1000, 0.04, 'square', 0.08); break;
      case 'swing': this._n(0.16, 0.2, 900, 'bandpass', 300); break;
      case 'throw': this._n(0.2, 0.18, 700, 'bandpass', 1600); break;
      case 'hit': this._n(0.12, 0.35, 900, 'lowpass', 200); this._tone(140, 0.14, 'sine', 0.5, 50); break;
      case 'crit': this._n(0.2, 0.4, 2400, 'bandpass', 400); this._tone(220, 0.2, 'sawtooth', 0.3, 60); break;
      case 'block': this._tone(420, 0.09, 'square', 0.2, 220); this._n(0.08, 0.2, 3000, 'highpass'); break;
      case 'parry': this._tone(900, 0.15, 'triangle', 0.3, 1800); this._n(0.1, 0.2, 4000, 'highpass'); break;
      case 'dodge': this._n(0.18, 0.18, 3000, 'highpass', 800); break;
      case 'hurt': this._tone(220, 0.22, 'square', 0.22, 70); this._n(0.18, 0.3, 700, 'lowpass', 150); break;
      case 'growl': this._tone(70 + Math.random() * 20, 0.8, 'sawtooth', 0.22, 42); this._n(0.7, 0.1, 500, 'bandpass', 180); break;
      case 'zhit': this._tone(110, 0.25, 'sawtooth', 0.25, 55); this._n(0.15, 0.2, 800, 'lowpass'); break;
      case 'zdie': this._tone(160, 0.6, 'sawtooth', 0.25, 30); this._n(0.5, 0.2, 600, 'lowpass', 100); break;
      case 'scream': this._tone(650, 0.6, 'sawtooth', 0.1, 1150); this._tone(670, 0.6, 'square', 0.05, 1100, 0.03); break;
      case 'glass': this._n(0.5, 0.45, 5000, 'highpass', 2000); [2400, 3100, 3900, 2900].forEach((f, i) => this._tone(f, 0.12, 'triangle', 0.08, null, i * 0.03)); break;
      case 'door': this._n(0.25, 0.3, 400, 'lowpass', 80); this._tone(90, 0.25, 'sine', 0.3, 50); break;
      case 'step': this._n(0.05, 0.07, 350, 'lowpass'); break;
      case 'thud': this._tone(85, 0.3, 'sine', 0.5, 35); this._n(0.2, 0.2, 300, 'lowpass'); break;
      case 'whoosh': this._n(0.9, 0.16, 300, 'bandpass', 1400); break;
      case 'horn': this._tone(220, 0.4, 'square', 0.12); this._tone(277, 0.4, 'square', 0.1); break;
      case 'crash': this._n(1.1, 0.6, 1200, 'lowpass', 90); this._tone(70, 0.9, 'sawtooth', 0.4, 28); this._n(0.6, 0.3, 5000, 'highpass', 1500, 0.05); break;
      case 'hiss': this._n(1.0, 0.2, 5000, 'highpass', 2500); break;
      case 'win': [523, 659, 784, 1046, 1318].forEach((f, i) => this._tone(f, 0.22, 'triangle', 0.2, null, i * 0.1)); break;
      case 'lose': [400, 330, 262, 196].forEach((f, i) => this._tone(f, 0.3, 'sawtooth', 0.15, f * 0.9, i * 0.18)); break;
      case 'transform': this._tone(60, 1.6, 'sawtooth', 0.3, 130); this._tone(900, 1.4, 'square', 0.05, 200, 0.2); this._n(1.4, 0.2, 200, 'bandpass', 1500); break;
      case 'power': this._tone(300, 0.8, 'sawtooth', 0.15, 40); this._n(0.5, 0.2, 2000, 'bandpass', 200); break;
      case 'shot': this._n(0.14, 0.5, 5000, 'highpass', 900); this._tone(240, 0.13, 'sawtooth', 0.3, 60); break;
      case 'shotgun': this._n(0.3, 0.7, 3500, 'lowpass', 300); this._tone(120, 0.28, 'sawtooth', 0.45, 38); this._tone(900, 0.12, 'square', 0.12, 200); break;
      case 'empty': this._tone(1800, 0.03, 'square', 0.1); this._tone(900, 0.04, 'square', 0.08, null, 0.05); break;
      case 'spit': this._n(0.3, 0.2, 1500, 'bandpass', 500); this._tone(500, 0.25, 'sawtooth', 0.1, 180); break;
      case 'build': this._tone(170, 0.07, 'square', 0.28, 80); this._n(0.07, 0.3, 1600, 'bandpass', 700); this._tone(190, 0.07, 'square', 0.25, 90, 0.16); this._n(0.07, 0.3, 1600, 'bandpass', 700, 0.16); this._tone(210, 0.09, 'square', 0.25, 100, 0.34); this._n(0.09, 0.3, 1400, 'bandpass', 600, 0.34); break;
      case 'bash': this._tone(95, 0.18, 'sine', 0.45, 40); this._n(0.16, 0.3, 700, 'lowpass', 150); break;
      case 'craft': [440, 554, 659].forEach((f, i) => this._tone(f, 0.09, 'square', 0.12, null, i * 0.07)); this._n(0.2, 0.12, 2500, 'highpass', 1200, 0.2); break;
      case 'static': this._n(0.55, 0.28, 2600, 'bandpass', 900); this._n(0.4, 0.18, 5200, 'highpass', 1800, 0.22); break;
      case 'radio': this._n(0.35, 0.2, 3000, 'bandpass', 1400); this._tone(1100, 0.06, 'square', 0.07); this._tone(830, 0.06, 'square', 0.07, null, 0.09); break;
      case 'eat':this._tone(300, 0.08, 'triangle', 0.18, 200); this._tone(330, 0.08, 'triangle', 0.18, 220, 0.12); break;
      default: break;
    }
  }

  /* ---------------- loops ---------------- */
  alarm(on) {
    if (on && !this.alarmTimer) {
      const f = () => this.sfx('beep');
      f();
      this.alarmTimer = setInterval(f, 520);
    } else if (!on && this.alarmTimer) {
      clearInterval(this.alarmTimer);
      this.alarmTimer = null;
    }
  }
  sirenOn(on, vol = 0.05) {
    if (!this.ctx) return;
    if (on && !this.siren) {
      const c = this.ctx;
      const o = c.createOscillator();
      const lfo = c.createOscillator();
      const lg = c.createGain();
      const g = c.createGain();
      o.type = 'sawtooth';
      o.frequency.value = 760;
      lfo.frequency.value = 0.55;
      lg.gain.value = 260;
      lfo.connect(lg); lg.connect(o.frequency);
      const fl = c.createBiquadFilter();
      fl.type = 'lowpass'; fl.frequency.value = 1400;
      g.gain.value = 0.0001;
      g.gain.linearRampToValueAtTime(vol, c.currentTime + 2);
      o.connect(fl); fl.connect(g); g.connect(this.sfxGain);
      o.start(); lfo.start();
      this.siren = { o, lfo, g };
    } else if (!on && this.siren) {
      const s = this.siren;
      const c = this.ctx;
      s.g.gain.cancelScheduledValues(c.currentTime);
      s.g.gain.linearRampToValueAtTime(0.0001, c.currentTime + 0.6);
      s.o.stop(c.currentTime + 0.7);
      s.lfo.stop(c.currentTime + 0.7);
      this.siren = null;
    } else if (on && this.siren) {
      this.siren.g.gain.linearRampToValueAtTime(vol, this.ctx.currentTime + 1);
    }
  }
  engine(on, level = 1) {
    if (!this.ctx) return;
    if (on && !this.engineNodes) {
      const c = this.ctx;
      const o = c.createOscillator();
      const o2 = c.createOscillator();
      const g = c.createGain();
      const fl = c.createBiquadFilter();
      o.type = 'sawtooth'; o.frequency.value = 52;
      o2.type = 'square'; o2.frequency.value = 26.5;
      fl.type = 'lowpass'; fl.frequency.value = 160;
      g.gain.value = 0.0001;
      g.gain.linearRampToValueAtTime(0.09 * level, c.currentTime + 1.5);
      o.connect(fl); o2.connect(fl); fl.connect(g); g.connect(this.sfxGain);
      o.start(); o2.start();
      this.engineNodes = { o, o2, g, fl };
    } else if (!on && this.engineNodes) {
      const n = this.engineNodes;
      const c = this.ctx;
      n.g.gain.cancelScheduledValues(c.currentTime);
      n.g.gain.linearRampToValueAtTime(0.0001, c.currentTime + 0.8);
      n.o.stop(c.currentTime + 0.9);
      n.o2.stop(c.currentTime + 0.9);
      this.engineNodes = null;
    } else if (on && this.engineNodes) {
      this.engineNodes.g.gain.linearRampToValueAtTime(0.09 * level, this.ctx.currentTime + 0.5);
    }
  }
  stopAll() {
    this.alarm(false);
    this.sirenOn(false);
    this.engine(false);
  }
}
