import { $, clamp } from './util.js';

const KEYMAP = {
  Space: 'jump', KeyF: 'attack', KeyJ: 'attack', KeyK: 'shoot', KeyE: 'interact', KeyQ: 'dodge',
  KeyR: 'block', KeyB: 'block', KeyX: 'switch', KeyC: 'crouch', KeyV: 'run', KeyH: 'medkit',
  KeyI: 'inventory', Escape: 'pause', KeyP: 'pause'
};
const JOY_R = 58;

export class Input {
  constructor() {
    this.mx = 0;
    this.my = 0;
    this.joy = { x: 0, y: 0, id: null, cx: 0, cy: 0 };
    this.keys = {};
    this.lookDX = 0;
    this.lookDY = 0;
    this.lookId = null;
    this.lx = 0;
    this.ly = 0;
    this.held = {};
    this.queue = new Set();
    this.toggles = { run: false, crouch: false };
    this.enabled = true;
    this.zone = $('joyzone');
    this.base = $('joybase');
    this.knob = $('joyknob');
    this.look = $('lookzone');
    this._bindZones();
    this._bindButtons();
    this._bindKeys();
  }

  _bindZones() {
    this.zone.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (!this.enabled || this.joy.id !== null) return;
      this.joy.id = e.pointerId;
      const r = this.zone.getBoundingClientRect();
      this.joy.cx = clamp(e.clientX, r.left + JOY_R, r.right - JOY_R);
      this.joy.cy = clamp(e.clientY, r.top + JOY_R, r.bottom - JOY_R);
      this.base.style.left = this.joy.cx + 'px';
      this.base.style.top = this.joy.cy + 'px';
      this.base.classList.add('active');
      this._moveKnob(e.clientX, e.clientY);
    });
    this.look.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (!this.enabled || this.lookId !== null) return;
      this.lookId = e.pointerId;
      this.lx = e.clientX;
      this.ly = e.clientY;
    });
    window.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.joy.id) {
        this._moveKnob(e.clientX, e.clientY);
      } else if (e.pointerId === this.lookId) {
        this.lookDX += e.clientX - this.lx;
        this.lookDY += e.clientY - this.ly;
        this.lx = e.clientX;
        this.ly = e.clientY;
      }
    });
    const end = (e) => {
      if (e.pointerId === this.joy.id) this._releaseJoy();
      if (e.pointerId === this.lookId) this.lookId = null;
    };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  }

  _moveKnob(px, py) {
    let dx = px - this.joy.cx;
    let dy = py - this.joy.cy;
    const d = Math.hypot(dx, dy);
    if (d > JOY_R) { dx = (dx / d) * JOY_R; dy = (dy / d) * JOY_R; }
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    let vx = dx / JOY_R;
    let vy = dy / JOY_R;
    const m = Math.hypot(vx, vy);
    if (m < 0.12) { vx = 0; vy = 0; }
    this.joy.x = vx;
    this.joy.y = -vy;
  }
  _releaseJoy() {
    this.joy.id = null;
    this.joy.x = 0;
    this.joy.y = 0;
    this.knob.style.transform = 'translate(0,0)';
    this.base.classList.remove('active');
  }

  _bindButtons() {
    document.querySelectorAll('[data-act]').forEach((b) => {
      const act = b.dataset.act;
      const down = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!this.enabled) return;
        b.classList.add('down');
        this.press(act);
      };
      const up = (e) => {
        e.preventDefault();
        b.classList.remove('down');
        this.release(act);
      };
      b.addEventListener('pointerdown', down);
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      b.addEventListener('pointerleave', up);
    });
  }

  _bindKeys() {
    window.addEventListener('keydown', (e) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys[e.code] = true;
      const a = KEYMAP[e.code];
      if (a && this.enabled) this.press(a);
      else if (a === 'pause') this.press(a);
    });
    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
      const a = KEYMAP[e.code];
      if (a) this.release(a);
    });
    window.addEventListener('blur', () => this.reset());
  }

  press(act) {
    if (act === 'run' || act === 'crouch') {
      this.toggles[act] = !this.toggles[act];
      this._syncToggle(act);
      return;
    }
    this.held[act] = true;
    this.queue.add(act);
  }
  release(act) {
    this.held[act] = false;
  }
  _syncToggle(act) {
    document.querySelectorAll(`[data-act="${act}"]`).forEach((b) => b.classList.toggle('on', this.toggles[act]));
  }
  setToggle(act, v) {
    this.toggles[act] = v;
    this._syncToggle(act);
  }

  consume(name) {
    if (this.queue.has(name)) { this.queue.delete(name); return true; }
    return false;
  }
  takeLook() {
    const r = { x: this.lookDX, y: this.lookDY };
    this.lookDX = 0;
    this.lookDY = 0;
    return r;
  }

  get running() {
    return this.toggles.run || !!this.keys.ShiftLeft || !!this.keys.ShiftRight || Math.hypot(this.joy.x, this.joy.y) > 0.93;
  }

  /** Call once per frame before the player reads mx/my. */
  update() {
    if (!this.enabled) { this.mx = 0; this.my = 0; return; }
    let x = this.joy.x;
    let y = this.joy.y;
    const k = this.keys;
    const kx = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
    const ky = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
    if (kx || ky) { const l = Math.hypot(kx, ky); x = kx / l; y = ky / l; }
    this.mx = x;
    this.my = y;
  }

  reset() {
    this._releaseJoy();
    this.lookId = null;
    this.keys = {};
    this.held = {};
    this.queue.clear();
    document.querySelectorAll('[data-act].down').forEach((b) => b.classList.remove('down'));
  }
  setEnabled(v) {
    this.enabled = v;
    if (!v) this.reset();
  }
}
