import { $, el } from '../core/util.js';
import { G } from '../core/state.js';
import { hex, C } from '../core/kit.js';
import { WEAPONS } from '../entities/player.js';

export class HUD {
  constructor() {
    this.root = $('hud');
    this.hpFill = $('hpfill');
    this.hpTxt = $('hptxt');
    this.stFill = $('stfill');
    this.coinTxt = $('coinstxt');
    this.wName = $('wname');
    this.wAmmo = $('wammo');
    this.wMats = $('wmats');
    this.matsOn = false;
    this._matsTxt = '';
    this.prompt = $('prompt');
    this.btnUse = $('b-interact');
    this.btnShoot = $('b-shoot');
    this.btnMed = $('b-med');
    this.shootCount = $('shootcount');
    this.medCount = $('medcount');
    this.objTitle = $('objtitle');
    this.objList = $('objlist');
    this.objPanel = $('objective');
    this.dlg = $('dialogue');
    this.dSpeaker = $('dspeaker');
    this.dText = $('dtext');
    this.toasts = $('toasts');
    this.banner_ = $('banner');
    this.map = $('minimap').getContext('2d');
    this.fpsEl = $('fps');
    this.tag = $('chapterTag');
    this.stealthEl = $('stealth');
    this.stealthState = null;
    this.promptLabel = null;
    this.objs = [];
    this.dq = [];
    this.dTimer = null;
    this.dDone = [];
    this.fpsAcc = 0;
    this.fpsN = 0;
    this.waypoint = null;
    this.hpShown = 100;
    this.mapT = 0;
    $('btn-pause').addEventListener('click', () => G.ui.openPause());
    $('btn-inv').addEventListener('click', () => G.ui.openPause('inv'));
  }

  show(v) { this.root.classList.toggle('hidden', !v); }
  setCombat(v) { this.root.classList.toggle('nocombat', !v); }
  setTag(t) { this.tag.textContent = t || ''; }
  /** Stealth indicator (chapters 5-6): 'HIDDEN' | 'UNSEEN' | 'CAUTION' | 'SPOTTED' | null to hide it. */
  setStealth(s) {
    if (s === this.stealthState) return;
    this.stealthState = s;
    const e = this.stealthEl;
    e.className = s ? 's-' + s.toLowerCase() : 'hidden';
    e.textContent = s ? '◉ ' + s : '';
  }
  setWaypoint(w) { this.waypoint = w; }
  /** Shows the crafting materials under the weapon name (chapter 7). */
  setMats(v) {
    this.matsOn = !!v;
    if (!v) { this.wMats.textContent = ''; this._matsTxt = ''; }
  }

  setPrompt(label) {
    if (label === this.promptLabel) return;
    this.promptLabel = label;
    if (label) {
      this.prompt.textContent = '◈ ' + label;
      this.prompt.classList.remove('hidden');
      this.btnUse.classList.remove('hidden');
    } else {
      this.prompt.classList.add('hidden');
      this.btnUse.classList.add('hidden');
    }
  }

  toast(text, color = 'cyan') {
    const t = el('div', 'toast ' + color, text);
    this.toasts.appendChild(t);
    while (this.toasts.children.length > 4) this.toasts.firstChild.remove();
    setTimeout(() => t.remove(), 2800);
  }
  banner(title, sub = '', ms = 2800) {
    const b = this.banner_;
    $('bt').textContent = title;
    $('bs').textContent = sub;
    b.classList.add('hidden');
    void b.offsetWidth;
    b.classList.remove('hidden');
    clearTimeout(this._bt);
    this._bt = setTimeout(() => b.classList.add('hidden'), ms);
  }

  /* ---------- objectives ---------- */
  setObjectives(title, items) {
    this.objTitle.textContent = title ? '▸ ' + title : '';
    this.objs = items ? items.map((i) => ({ done: false, ...i })) : [];
    this._renderObjs();
  }
  _renderObjs() {
    this.objList.innerHTML = '';
    for (const o of this.objs) {
      const li = el('li', o.done ? 'done' : '', o.text);
      this.objList.appendChild(li);
    }
    this.objPanel.style.display = this.objTitle.textContent || this.objs.length ? '' : 'none';
  }
  addObjective(o) { this.objs.push({ done: false, ...o }); this._renderObjs(); }
  setObjText(id, text) {
    const o = this.objs.find((x) => x.id === id);
    if (o) { o.text = text; this._renderObjs(); }
  }
  completeObj(id, silent = false) {
    const o = this.objs.find((x) => x.id === id);
    if (!o || o.done) return;
    o.done = true;
    this._renderObjs();
    if (!silent) { G.audio.sfx('pickup'); this.toast('OBJECTIVE COMPLETE', 'green'); }
  }
  objDone(id) {
    const o = this.objs.find((x) => x.id === id);
    return !!(o && o.done);
  }
  allDone() { return this.objs.length > 0 && this.objs.every((o) => o.done); }

  /* ---------- dialogue ---------- */
  say(speaker, text, ms) { this.dq.push({ speaker, text, ms }); if (!this.dTimer && !this.dActive) this._nextLine(); }
  sayLines(lines, onDone) {
    for (const l of lines) this.dq.push({ speaker: l[0], text: l[1], ms: l[2] });
    if (onDone) this.dDone.push({ afterCount: this.dq.length + (this.dActive ? 1 : 0), fn: onDone });
    if (!this.dTimer && !this.dActive) this._nextLine();
  }
  sayNow(speaker, text, ms) { this.clearSay(); this.say(speaker, text, ms); }
  clearSay() {
    this.dq.length = 0;
    this.dDone.length = 0;
    clearTimeout(this.dTimer);
    this.dTimer = null;
    this.dActive = false;
    this.dlg.classList.add('hidden');
  }
  _nextLine() {
    const l = this.dq.shift();
    if (!l) {
      this.dActive = false;
      this.dlg.classList.add('hidden');
      return;
    }
    this.dActive = true;
    this.dSpeaker.textContent = l.speaker || '';
    this.dSpeaker.style.display = l.speaker ? '' : 'none';
    this.dText.textContent = l.text;
    this.dlg.classList.remove('hidden');
    G.audio.sfx('type');
    const ms = l.ms || 1700 + l.text.length * 42;
    this.dTimer = setTimeout(() => {
      this.dTimer = null;
      // fire completion callbacks whose lines are all consumed
      for (let i = this.dDone.length - 1; i >= 0; i--) {
        const d = this.dDone[i];
        d.afterCount--;
        if (d.afterCount <= 0) { this.dDone.splice(i, 1); try { d.fn(); } catch (e) { console.error(e); } }
      }
      this._nextLine();
    }, ms);
  }

  damageFlash() {
    const d = $('fx-damage');
    d.classList.add('on');
    setTimeout(() => d.classList.remove('on'), 70);
  }
  redAlert(on) { $('fx-red').classList.toggle('on', !!on); }
  fade(on) { $('fade').classList.toggle('on', !!on); }
  showDeath() {
    $('death').classList.remove('hidden');
    G.input.setEnabled(false);
  }
  hideDeath() {
    $('death').classList.add('hidden');
    G.input.setEnabled(true);
  }

  update(dt) {
    const pl = G.player;
    if (!pl) return;
    this.hpShown += (pl.hp - this.hpShown) * Math.min(1, dt * 10);
    this.hpFill.style.width = Math.max(0, this.hpShown / pl.maxHp * 100) + '%';
    this.hpTxt.textContent = Math.ceil(pl.hp);
    this.hpFill.parentElement.classList.toggle('low', pl.hp < 30);
    this.stFill.style.width = pl.stamina / pl.maxStamina * 100 + '%';
    this.coinTxt.textContent = pl.inv.coins;
    const wp = WEAPONS[pl.wKey];
    this.wName.textContent = wp.name;
    const combat = G.stage && G.stage.combat;
    if (wp.kind === 'gun') this.wAmmo.textContent = (wp.ammo === 'ammo' ? 'AMMO ' : 'SHELLS ') + pl.inv[wp.ammo];
    else this.wAmmo.textContent = pl.inv.bottle > 0 || combat ? 'BOTTLES x' + pl.inv.bottle : '';
    this.wAmmo.classList.toggle('low', wp.kind === 'gun' && pl.inv[wp.ammo] <= 3);
    if (this.matsOn) {
      const i = pl.inv, s = `SCRAP ${i.scrap} · CLOTH ${i.cloth}\nWOOD ${i.wood} · KITS ${i.kits}`;
      if (s !== this._matsTxt) { this._matsTxt = s; this.wMats.textContent = s; }
    }
    this.shootCount.textContent = pl.inv.bottle;
    this.btnShoot.classList.toggle('dim', pl.inv.bottle <= 0);
    const med = pl.inv.medkit > 0 || pl.inv.food > 0;
    this.btnMed.classList.toggle('hidden', !med);
    this.medCount.textContent = pl.inv.medkit > 0 ? pl.inv.medkit : 'F' + pl.inv.food;
    this.mapT += dt;
    if (this.mapT > 0.03) { this.mapT = 0; this._drawMap(); }
    if (G.settings.fps) {
      this.fpsAcc += dt; this.fpsN++;
      if (this.fpsAcc > 0.5) { this.fpsEl.textContent = Math.round(this.fpsN / this.fpsAcc) + ' FPS'; this.fpsAcc = 0; this.fpsN = 0; }
    }
  }

  _drawMap() {
    const st = G.stage;
    if (!st) return;
    const ctx = this.map;
    const R = 120, range = st.mapRange, sc = (R - 2) / range;
    const pl = G.player.pos;
    ctx.clearRect(0, 0, R * 2, R * 2);
    const yaw = G.camRig.yaw;
    const rot = -Math.PI / 2 - Math.atan2(-Math.cos(yaw), -Math.sin(yaw));
    const cr = Math.cos(rot), sr = Math.sin(rot);
    ctx.save();
    ctx.translate(R, R);
    ctx.rotate(rot);
    ctx.scale(sc, sc);
    ctx.translate(-pl.x, -pl.z);
    ctx.lineWidth = 1.6 / sc;
    ctx.strokeStyle = 'rgba(0,240,255,0.95)';
    ctx.fillStyle = 'rgba(60,24,130,0.6)';
    for (const c of st.colliders) {
      if (c.off || c.h < 1) continue;
      if (c.maxX < pl.x - range || c.minX > pl.x + range || c.maxZ < pl.z - range || c.minZ > pl.z + range) continue;
      ctx.fillRect(c.minX, c.minZ, c.maxX - c.minX, c.maxZ - c.minZ);
      ctx.strokeRect(c.minX, c.minZ, c.maxX - c.minX, c.maxZ - c.minZ);
    }
    if (st.bounds) {
      ctx.strokeStyle = 'rgba(255,43,214,0.8)';
      const b = st.bounds;
      ctx.strokeRect(b.minX, b.minZ, b.maxX - b.minX, b.maxZ - b.minZ);
    }
    ctx.restore();
    const toScr = (x, z) => {
      const rx = x - pl.x, rz = z - pl.z;
      let sx = (rx * cr - rz * sr) * sc, sy = (rx * sr + rz * cr) * sc;
      const d = Math.hypot(sx, sy);
      let edge = false;
      if (d > R - 10) { sx *= (R - 10) / d; sy *= (R - 10) / d; edge = true; }
      return [R + sx, R + sy, edge];
    };
    const dot = (x, z, color, shape, s = 5) => {
      const [sx, sy, edge] = toScr(x, z);
      if (edge && shape === 'c') return;
      ctx.fillStyle = hex(color);
      ctx.shadowColor = hex(color);
      ctx.shadowBlur = 8;
      ctx.beginPath();
      if (shape === 'd') {
        ctx.moveTo(sx, sy - s * 1.4); ctx.lineTo(sx + s, sy); ctx.lineTo(sx, sy + s * 1.4); ctx.lineTo(sx - s, sy);
        ctx.closePath();
      } else ctx.arc(sx, sy, s * 0.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    };
    for (const p of st.mapData()) dot(p.x, p.z, p.c, p.s);
    if (this.waypoint) dot(this.waypoint.x, this.waypoint.z, C.yellow, 'd', 8);
    // player arrow
    const p = G.player;
    const dx = Math.sin(p.yaw), dz = Math.cos(p.yaw);
    const ang = Math.atan2(dx * sr + dz * cr, dx * cr - dz * sr) + Math.PI / 2;
    ctx.save();
    ctx.translate(R, R);
    ctx.rotate(ang);
    ctx.fillStyle = '#ff2bd6';
    ctx.shadowColor = '#ff2bd6';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(0, -11); ctx.lineTo(8, 9); ctx.lineTo(0, 4); ctx.lineTo(-8, 9);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
