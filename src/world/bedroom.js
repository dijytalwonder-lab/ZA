import * as THREE from 'three';
import { Stage } from './stage.js';
import { G } from '../core/state.js';
import {
  C, boxGeo, cylGeo, basic, nbox, led, glow, glowSign, holoPanel, gridTexture, makeCanvas, streak
} from '../core/kit.js';
import { addLights } from './cityKit.js';
import { CoinField } from './coins.js';
import { OUTFITS } from '../entities/rig.js';

function canvasTex(w, h, draw) {
  const c = makeCanvas(w, h);
  draw(c.getContext('2d'), w, h, c);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function posterTex(kind) {
  return canvasTex(160, 220, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, kind === 1 ? '#05103a' : '#1a0848');
    gr.addColorStop(0.6, kind === 1 ? '#0a5a9a' : '#ff2bd6');
    gr.addColorStop(1, '#05010f');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    g.fillStyle = kind === 1 ? '#00f0ff' : '#ffe94d';
    g.shadowColor = g.fillStyle;
    g.shadowBlur = 16;
    g.beginPath();
    g.arc(w / 2, h * 0.5, 38, Math.PI, 0);
    g.fill();
    g.shadowBlur = 0;
    g.strokeStyle = kind === 1 ? '#ff2bd6' : '#00f0ff';
    g.lineWidth = 2;
    for (let i = 0; i < 9; i++) {
      g.beginPath(); g.moveTo(0, h * 0.5 + i * i * 1.6 + 4); g.lineTo(w, h * 0.5 + i * i * 1.6 + 4); g.stroke();
      g.beginPath(); g.moveTo(w / 2 + (i - 4) * 4, h * 0.5); g.lineTo(w / 2 + (i - 4) * 44, h); g.stroke();
    }
    g.strokeStyle = '#fff'; g.lineWidth = 4;
    g.strokeRect(4, 4, w - 8, h - 8);
  });
}

export class BedroomStage extends Stage {
  constructor() {
    super('bedroom');
    this.chapter = 1;
    this.bounds = { minX: -4.65, maxX: 4.65, minZ: -3.65, maxZ: 3.65 };
    this.mapRange = 7;
    this.camCfg = { dist: 4.1, height: 1.3, minPitch: 0.1, maxPitch: 1.0, fov: 64, bounds: { minX: -4.8, maxX: 4.8, minZ: -3.8, maxZ: 3.8, minY: 0.5, maxY: 2.95 }, block: null };
    this.spawn = { x: -2.1, z: 0.6, yaw: 0 };
    this.done = {};
    this.items = [];
    this.ringing = false;
    this.itemsGot = 0;
    this.leaving = false;
  }

  async load() {
    this.scene.background = new THREE.Color(0x05020f);
    this.scene.environment = G.assets.env;
    this.scene.fog = new THREE.FogExp2(0x0a0420, 0.028);
    addLights(this, { sky: 0x6a6cff, ground: 0x20104a, hemi: 1.0, dirColor: 0x8a7cff, dir: 0.3, dirPos: [2, 6, 3] });
    this._room();
    this._furniture();
    this._lights();
    this._items();
    this._interactables();
    this.coins = new CoinField(this, [
      { x: 3.6, y: 0.8, z: 2.6, v: 5 }, { x: -3.8, y: 0.8, z: 0.9, v: 5 }, { x: 0.2, y: 0.8, z: -1.2, v: 5 }
    ]);
  }

  /* ---------------- room ---------------- */
  _wall(w, h, x, y, z, ry, rx = 0, color = 0x140b3a) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }));
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, 0);
    this.scene.add(m);
    return m;
  }
  _room() {
    const s = this.scene;
    // floor
    const gt = gridTexture('#6a2bff', '#0a0624', 8);
    gt.repeat.set(5, 4);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 8), new THREE.MeshStandardMaterial({ map: gt, roughness: 0.3, metalness: 0.5, envMapIntensity: 1.2 }));
    floor.rotation.x = -Math.PI / 2;
    s.add(floor);
    this._wall(10, 3.2, 0, 1.6, -4, 0);
    this._wall(10, 3.2, 0, 1.6, 4, Math.PI);
    this._wall(8, 3.2, -5, 1.6, 0, Math.PI / 2);
    this._wall(8, 3.2, 5, 1.6, 0, -Math.PI / 2);
    this._wall(10, 8, 0, 3.2, 0, 0, Math.PI / 2, 0x0c0626);
    // LED strips
    for (const z of [-3.94, 3.94]) { const l = led(9.8, 0.07, 0.1, C.pink); l.position.set(0, 3.12, z); s.add(l); const b = led(9.8, 0.05, 0.05, C.violet, 0.8); b.position.set(0, 0.04, z); s.add(b); }
    for (const x of [-4.94, 4.94]) { const l = led(0.1, 0.07, 7.8, C.cyan); l.position.set(x, 3.12, 0); s.add(l); const b = led(0.05, 0.05, 7.8, C.violet, 0.8); b.position.set(x, 0.04, 0); s.add(b); }
    // window with dawn skyline
    const winTex = canvasTex(256, 150, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, '#0a0840'); gr.addColorStop(0.55, '#8a1fa8'); gr.addColorStop(0.85, '#ff5cb1'); gr.addColorStop(1, '#ffb36b');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(255,255,255,0.7)'; g.fillRect(Math.random() * w, Math.random() * h * 0.5, 1.5, 1.5); }
      let x = 0;
      while (x < w) {
        const bw = 14 + Math.random() * 26, bh = 40 + Math.random() * 80;
        g.fillStyle = '#0a0624'; g.fillRect(x, h - bh, bw, bh);
        for (let yy = h - bh + 6; yy < h - 4; yy += 9) for (let xx = x + 3; xx < x + bw - 4; xx += 7) {
          if (Math.random() < 0.5) { g.fillStyle = ['#00f0ff', '#ff2bd6', '#ffd27a'][Math.floor(Math.random() * 3)]; g.fillRect(xx, yy, 3, 4); }
        }
        x += bw + 2;
      }
    });
    const win = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.4), new THREE.MeshBasicMaterial({ map: winTex }));
    win.position.set(1.4, 1.9, -3.96);
    s.add(win);
    for (const [w, h, x, y] of [[2.5, 0.06, 0, 0.73], [2.5, 0.06, 0, -0.73], [0.06, 1.5, -1.23, 0], [0.06, 1.5, 1.23, 0], [0.04, 1.4, 0, 0]]) {
      const f = led(w, h, 0.06, C.cyan);
      f.position.set(1.4 + x, 1.9 + y, -3.93);
      s.add(f);
    }
    const wg = glow(C.pink, 5, 0.35);
    wg.position.set(1.4, 1.9, -3.5);
    s.add(wg);
    // posters + sign
    const pts = [[-4.93, 1.9, 1.0, Math.PI / 2, 0], [-4.93, 1.9, 2.2, Math.PI / 2, 1], [3.5, 2.1, 3.94, Math.PI, 1]];
    for (const [x, y, z, ry, k] of pts) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.25), new THREE.MeshBasicMaterial({ map: posterTex(k) }));
      p.position.set(x, y, z);
      p.rotation.y = ry;
      s.add(p);
    }
    const sign = glowSign('DREAM BIG', C.pink, 2.4);
    sign.position.set(-4.92, 2.4, -1.1);
    sign.rotation.y = Math.PI / 2;
    s.add(sign);
    this.flicker(sign.userData.mat, 0.5);
    const sg = glow(C.pink, 4, 0.3);
    sg.position.set(-4.7, 2.4, -1.1);
    s.add(sg);
    // rug
    const rug = new THREE.Mesh(new THREE.CircleGeometry(1.7, 40), new THREE.MeshBasicMaterial({
      map: canvasTex(256, 256, (g, w, h) => {
        g.clearRect(0, 0, w, h);
        for (let i = 0; i < 5; i++) { g.strokeStyle = i % 2 ? '#ff2bd6' : '#00f0ff'; g.lineWidth = 5; g.shadowColor = g.strokeStyle; g.shadowBlur = 10; g.beginPath(); g.arc(w / 2, h / 2, 120 - i * 22, 0, Math.PI * 2); g.stroke(); }
      }),
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.8
    }));
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(0, 0.015, 0.4);
    s.add(rug);
  }

  _lights() {
    const mk = (color, I, d, x, y, z) => { const l = new THREE.PointLight(color, I * Math.PI, d, 1.6); l.position.set(x, y, z); this.scene.add(l); return l; };
    this.winLight = mk(0xff4fb0, 7, 9, 1.4, 2, -3.2);
    mk(0x00f0ff, 6, 6, -3.5, 0.5, -2.4);
    mk(0xff2bd6, 5, 6, 3.4, 1.6, -3.0);
  }

  /* ---------------- furniture ---------------- */
  _put(m, x, y, z, ry = 0) { m.position.set(x, y, z); m.rotation.y = ry; this.scene.add(m); return m; }
  _furniture() {
    // bed
    const bx = -3.5;
    this._put(nbox(1.5, 0.4, 2.3, 0x1a1245, C.cyan), bx, 0.2, -2.4);
    this._put(nbox(1.4, 0.2, 2.2, 0x2a1860), bx, 0.5, -2.4);
    this._put(nbox(0.8, 0.14, 0.4, 0xdfe8ff), bx, 0.67, -3.3);
    const blanket = this._put(nbox(1.44, 0.16, 1.15, 0x3a0f6b, C.pink), bx, 0.66, -1.85);
    this.blanket = blanket;
    this._put(nbox(1.6, 1.0, 0.1, 0x120a34, C.pink), bx, 0.9, -3.72);
    this._put(led(1.55, 0.04, 2.35, C.cyan, 0.9), bx, 0.03, -2.4);
    const ug = streak(C.cyan, 2.2, 3.4, 0.5);
    ug.position.set(bx, 0.03, -2.4);
    this.scene.add(ug);
    this.addCollider(-4.28, -2.72, -3.58, -1.22, 0.7);
    // nightstand + clock
    this._put(nbox(0.6, 0.55, 0.5, 0x1a1245, C.violet), -2.35, 0.275, -3.5);
    this.addBoxCollider(-2.35, -3.5, 0.6, 0.5, 0.6);
    this._put(nbox(0.34, 0.16, 0.12, 0x0a0a22, C.cyan), -2.35, 0.63, -3.5);
    this.clock = { c: makeCanvas(160, 64) };
    this.clock.g = this.clock.c.getContext('2d');
    this.clock.tex = new THREE.CanvasTexture(this.clock.c);
    this.clock.tex.colorSpace = THREE.SRGBColorSpace;
    const disp = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.12), new THREE.MeshBasicMaterial({ map: this.clock.tex }));
    disp.position.set(-2.35, 0.64, -3.43);
    this.scene.add(disp);
    this.clockGlow = glow(C.cyan, 1.4, 0.7);
    this.clockGlow.material = this.clockGlow.material.clone();
    this.clockGlow.position.set(-2.35, 0.7, -3.35);
    this.scene.add(this.clockGlow);
    this._clockDraw('06:30', '#00f0ff');
    // desk + chair + hologram
    this._put(nbox(2.0, 0.08, 0.9, 0x1a1245, C.pink), 3.3, 0.78, -3.4);
    for (const sx of [-0.9, 0.9]) this._put(nbox(0.08, 0.76, 0.8, 0x120a34), 3.3 + sx, 0.38, -3.4);
    this.addCollider(2.3, 4.3, -3.85, -2.95, 0.85);
    this._put(led(0.9, 0.02, 0.25, C.pink), 3.2, 0.83, -3.15);
    const holo = holoPanel(['SYSTEM', 'ONLINE'], C.cyan, 1.5, 0.95);
    this._put(holo, 3.3, 1.5, -3.7);
    this.flicker(holo.userData.mat, 0.7);
    this.updaters.push((dt, t) => { holo.position.y = 1.5 + Math.sin(t * 1.5) * 0.04; });
    this._put(nbox(0.5, 0.08, 0.5, 0x2a1860, C.cyan), 3.1, 0.5, -2.5);
    this._put(nbox(0.5, 0.55, 0.08, 0x2a1860, C.cyan), 3.1, 0.82, -2.27);
    this._put(new THREE.Mesh(cylGeo(0.05, 0.05, 0.5, 6), basic(0x333366)), 3.1, 0.25, -2.5);
    this._put(glow(C.pink, 1.8, 0.6), 3.9, 1.2, -3.55);
    // wardrobe
    this.wardrobe = this._put(nbox(0.8, 2.4, 2.0, 0x120a34, C.violet), 4.55, 1.2, 0.6);
    const seam = led(0.04, 2.2, 0.04, C.violet);
    this._put(seam, 4.13, 1.2, 0.6);
    this._put(led(0.04, 2.3, 0.04, C.cyan, 0.8), 4.13, 1.2, -0.3);
    this._put(led(0.04, 2.3, 0.04, C.cyan, 0.8), 4.13, 1.2, 1.5);
    this.addCollider(4.12, 5, -0.45, 1.65, 2.4);
    // sink counter + mirror
    this._put(nbox(2.2, 0.9, 0.6, 0x1a1245, C.cyan), -1.2, 0.45, 3.65);
    this._put(led(2.3, 0.04, 0.7, C.cyan, 0.9), -1.2, 0.92, 3.65);
    this._put(new THREE.Mesh(boxGeo(0.5, 0.06, 0.4), basic(0x6a8cff, { opacity: 0.8 })), -1.2, 0.94, 3.6);
    this._put(new THREE.Mesh(cylGeo(0.025, 0.025, 0.3, 6), basic(0xcfe8ff)), -1.2, 1.1, 3.82);
    const mirror = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.9), new THREE.MeshBasicMaterial({
      map: canvasTex(128, 72, (g, w, h) => { const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#1a3a8a'); gr.addColorStop(0.5, '#6a2bff'); gr.addColorStop(1, '#ff2bd6'); g.fillStyle = gr; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(0, 0, w * 0.3, h); })
    }));
    this._put(mirror, -1.2, 1.75, 3.95, Math.PI);
    for (const [w, h, x, y] of [[1.7, 0.05, 0, 0.47], [1.7, 0.05, 0, -0.47], [0.05, 0.95, -0.82, 0], [0.05, 0.95, 0.82, 0]]) this._put(led(w, h, 0.05, C.pink), -1.2 + x, 1.75 + y, 3.93);
    this.addCollider(-2.3, -0.1, 3.35, 4, 0.9);
    // coffee table (water bottle) + shelf
    this._put(nbox(0.8, 0.4, 0.8, 0x1a1245, C.pink), 1.0, 0.2, 0.9);
    this.addBoxCollider(1.0, 0.9, 0.8, 0.8, 0.45);
    this._put(nbox(1.5, 0.06, 0.32, 0x1a1245, C.cyan), 0.2, 1.15, -3.8);
    // door
    this.door = this._put(nbox(0.12, 2.25, 1.15, 0x1a0a40, C.pink), -4.94, 1.125, 2.6);
    const ds = glowSign('EXIT', C.green, 1.1, { h: 100 });
    this._put(ds, -4.86, 2.6, 2.6, Math.PI / 2);
    this.doorSign = ds;
    this._put(led(0.05, 2.3, 0.05, C.pink), -4.93, 1.15, 2.0);
    this._put(led(0.05, 2.3, 0.05, C.pink), -4.93, 1.15, 3.2);
    // floor lamp
    this._put(new THREE.Mesh(cylGeo(0.04, 0.06, 1.6, 6), basic(0x333366)), -4.3, 0.8, 0.4);
    this._put(glow(C.cyan, 2.4, 0.7), -4.3, 1.7, 0.4);
    this._put(led(0.3, 0.3, 0.3, C.cyan, 0.9), -4.3, 1.7, 0.4);
  }

  _clockDraw(txt, col) {
    const k = this.clock, g = k.g;
    g.fillStyle = '#04020c';
    g.fillRect(0, 0, 160, 64);
    g.font = '900 44px Orbitron, monospace';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = col;
    g.shadowBlur = 14;
    g.fillStyle = col;
    g.fillText(txt, 80, 34);
    g.shadowBlur = 0;
    k.tex.needsUpdate = true;
  }

  /* ---------------- pickups / tasks ---------------- */
  _items() {
    const defs = [
      { id: 'backpack', x: 2.6, z: -2.1, y: 0.9, mk: () => nbox(0.3, 0.4, 0.14, 0x1a1040, C.cyan), label: 'TAKE BACKPACK', c: C.cyan },
      { id: 'phone', x: -2.35, z: -3.45, y: 1.0, mk: () => nbox(0.1, 0.2, 0.03, 0x0a0a22, C.pink), label: 'TAKE PHONE', c: C.pink },
      { id: 'pass', x: 0.2, z: -3.55, y: 1.55, mk: () => nbox(0.2, 0.13, 0.03, 0x2a0a50, C.yellow), label: 'TAKE BUS PASS', c: C.yellow },
      { id: 'bottle', x: 1.0, z: 0.9, y: 0.85, mk: () => new THREE.Mesh(cylGeo(0.06, 0.06, 0.28, 8), basic(C.green, { opacity: 0.9 })), label: 'TAKE WATER BOTTLE', c: C.green }
    ];
    for (const d of defs) {
      const m = d.mk();
      m.position.set(d.x, d.y, d.z);
      const gl = glow(d.c, 1.2, 0.8);
      m.add(gl);
      this.scene.add(m);
      d.mesh = m;
      this.items.push(d);
      this.updaters.push((dt, t) => { if (d.mesh.visible) { d.mesh.rotation.y += dt * 1.6; d.mesh.position.y = d.y + Math.sin(t * 2.4 + d.x) * 0.05; } });
    }
  }

  _interactables() {
    for (const d of this.items) {
      d.it = this.addInteractable({
        x: d.x, z: d.z, y: d.y - 0.4, r: 1.5, color: d.c, label: d.label,
        enabled: () => !d.got && !!this.free,
        onUse: () => this._take(d)
      });
    }
    this.addInteractable({ x: -1.9, z: 2.95, r: 1.4, label: 'BRUSH TEETH', color: C.cyan, enabled: () => !this.done.brush && this.free, onUse: () => this._brush() });
    this.addInteractable({ x: -0.5, z: 2.95, r: 1.4, label: 'WASH FACE', color: C.cyan, enabled: () => !this.done.wash && this.free, onUse: () => this._wash() });
    this.addInteractable({ x: 3.5, z: 0.6, r: 1.6, label: 'GET DRESSED', color: C.violet, enabled: () => !this.done.dress && this.free, onUse: () => this._dress() });
    this.addInteractable({
      x: -4.0, z: 2.6, r: 1.6, color: C.green, y: 1.1,
      label: () => (this.tasksDone() ? 'LEAVE HOME' : 'FINISH MORNING TASKS FIRST'),
      enabled: () => this.free && !this.leaving,
      onUse: () => this._door()
    });
  }

  tasksDone() { return !!(this.done.brush && this.done.wash && this.done.dress && this.done.items); }

  async _brush() {
    const pl = G.player;
    pl.locked = true;
    pl.faceTo(-1.9, 4);
    pl.rig.p.phone = 0;
    const ok = await G.mg.run('scrub', { need: 1400 });
    pl.locked = false;
    if (ok && !this.disposed) this._complete('brush');
  }
  async _wash() {
    const pl = G.player;
    pl.locked = true;
    pl.faceTo(-0.5, 4);
    const ok = await G.mg.run('mash', { title: 'WASH YOUR FACE', text: 'Splash with fast taps!', taps: 14, time: 7, noFail: true, sfx: 'hiss' });
    pl.locked = false;
    if (ok && !this.disposed) this._complete('wash');
  }
  async _dress() {
    const pl = G.player;
    pl.locked = true;
    const o = OUTFITS[pl.outfit] || OUTFITS[0];
    const ok = await G.mg.run('dress', {
      items: [{ id: 'hoodie', label: 'HOODIE' }, { id: 'jacket', label: 'GLOW JACKET' }, { id: 'shoes', label: 'SNEAKERS' }],
      onEquip: (id) => {
        const r = pl.rig;
        if (id === 'hoodie') { r.shirtMat.color.setHex(o.jacket); r.pantsMat.color.setHex(0x0d0d2b); }
        if (id === 'jacket') r.stripes.forEach((s) => { s.visible = true; });
        if (id === 'shoes') { r.setColors(null, o.accent, null); pl.rig.flash(o.accent, 0.4); }
      }
    });
    pl.locked = false;
    if (ok && !this.disposed) this._complete('dress');
  }
  _take(d) {
    d.got = true;
    d.mesh.visible = false;
    d.it.remove();
    const pl = G.player;
    G.audio.sfx('pickup');
    G.fx.burst(d.x, d.y, d.z, d.c, 16, 3, 0.6, 2);
    if (d.id === 'backpack') { pl.inv.backpack = true; pl.syncHeld(); G.hud.toast('BACKPACK ACQUIRED', 'cyan'); }
    if (d.id === 'phone') { pl.inv.phone = true; G.hud.toast('PHONE ACQUIRED', 'pink'); }
    if (d.id === 'pass') { pl.inv.pass = true; G.hud.toast('BUS PASS ACQUIRED', 'gold'); }
    if (d.id === 'bottle') { pl.inv.bottle += 1; G.hud.toast('WATER BOTTLE (THROWABLE)', 'green'); }
    this.itemsGot++;
    G.hud.setObjText('items', `Collect essentials (${this.itemsGot}/4)`);
    if (this.itemsGot >= 4) this._complete('items');
  }
  _complete(id) {
    this.done[id] = true;
    G.hud.completeObj(id);
    if (this.tasksDone() && !this.unlocked) {
      this.unlocked = true;
      G.hud.toast('DOOR UNLOCKED', 'green');
      G.hud.sayLines([['MOM', 'Aarav! Bus is in twenty minutes!'], ['AARAV', 'Coming, Maa! Just heading out.']]);
      G.hud.setWaypoint({ x: -4.9, z: 2.6 });
    }
  }
  async _door() {
    if (!this.tasksDone()) {
      G.audio.sfx('error');
      G.hud.toast('FINISH YOUR MORNING TASKS', 'red');
      return;
    }
    this.leaving = true;
    G.player.locked = true;
    G.audio.sfx('door');
    G.hud.completeObj('leave');
    G.hud.say('MOM', 'Take care! Text me when you reach college!');
    if (!await this.wait(1.6)) return;
    G.hud.banner('CHAPTER 1 COMPLETE', 'A NORMAL MORNING', 2400);
    G.audio.sfx('win');
    if (!await this.wait(2.4)) return;
    G.nextChapter(2);
  }

  /* ---------------- life cycle ---------------- */
  async enter(opts = {}) {
    const pl = G.player;
    this.scene.add(pl.rig.root);
    this.free = false;
    pl.reset(this.spawn.x, this.spawn.z, this.spawn.yaw);
    if (opts.fresh) pl.resetInventory();
    G.hud.setCombat(false);
    G.hud.setTag('CHAPTER 1 · A NORMAL MORNING');
    G.camRig.configure(this.camCfg);
    G.camRig.yaw = 0.25;
    G.camRig.pitch = 0.36;
    G.fx.setMotes(true, new THREE.Vector3(10, 3.2, 8));
    G.audio.setMood('calm');
    // pyjamas look until dressed
    const r = pl.rig;
    r.shirtMat.color.setHex(0x7a7aa8);
    r.pantsMat.color.setHex(0x5a5a88);
    r.stripes.forEach((s) => { s.visible = false; });
    pl.setWeapon('fists');
    pl.syncHeld();
    G.hud.setObjectives('MORNING ROUTINE', [
      { id: 'brush', text: 'Brush your teeth' }, { id: 'wash', text: 'Wash your face' },
      { id: 'dress', text: 'Get dressed' }, { id: 'items', text: 'Collect essentials (0/4)' }, { id: 'leave', text: 'Leave the house' }
    ]);
    G.saveCheckpoint({ chapter: 1, stage: 'bedroom', cp: 0 });
    // lying in bed
    pl.locked = true;
    pl.pos.set(-3.5, 0.6, -1.65);
    pl.yaw = 0;
    r.p.lie = 1; r.s.lie = 1;
    r.root.rotation.y = 0;
    G.camRig.cutscene(new THREE.Vector3(-1.0, 1.9, 0.2), new THREE.Vector3(-3.4, 0.8, -2.5), 4, true);
    G.hud.fade(false);
    this.ringing = true;
    G.audio.alarm(true);
    G.hud.banner('CHAPTER 1', 'A NORMAL MORNING', 3000);
    if (!await this.wait(1.2)) return;
    G.hud.say('MOM', 'Aarav! Wake up! You will miss the bus!');
    if (!await this.wait(2.2)) return;
    await G.mg.run('tapRing', { title: 'SILENCE THE ALARM', text: 'Tap when the ring hits the target', hits: 4, period: 1.15 });
    if (this.disposed) return;
    this.ringing = false;
    G.audio.alarm(false);
    this._clockDraw('06:31', '#00f0ff');
    this.clockGlow.material.color.setHex(C.cyan);
    G.audio.sfx('pickup');
    G.hud.say('AARAV', 'Five more minutes... no. Up. Up!');
    // get out of bed
    r.p.lie = 0;
    const from = new THREE.Vector3(-3.5, 0.6, -1.65), to = new THREE.Vector3(-2.3, 0, -0.9);
    await this.tween(1.1, (k) => { pl.pos.lerpVectors(from, to, k); pl.pos.y = 0.6 * (1 - k); });
    if (this.disposed) return;
    pl.pos.copy(to);
    pl.yaw = Math.PI + 0.35; // face away from the camera (forward = -Z at camera yaw 0.35)
    G.camRig.endCut();
    G.camRig.yaw = 0.35;
    pl.locked = false;
    this.free = true;
    G.hud.say('', 'Walk to the glowing markers. Brush, wash, dress, grab your things.');
  }

  update(dt) {
    this.baseUpdate(dt);
    const t = this.time;
    if (this.ringing) {
      const on = Math.floor(t * 2) % 2 === 0;
      if (on !== this._clkOn) {
        this._clkOn = on;
        this._clockDraw(on ? '06:30' : '', '#ff2244');
        this.clockGlow.material.color.setHex(on ? C.red : C.black);
      }
    }
    this.coins.update(dt, G.player);
    this.winLight.intensity = (6.5 + Math.sin(t * 0.8) * 0.8) * Math.PI;
  }

  exit() {
    G.audio.alarm(false);
    G.player.rig.root.removeFromParent();
  }
}
