import * as THREE from 'three';
import { Stage } from './stage.js';
import { G } from '../core/state.js';
import {
  C, nbox, led, glow, glowSign, holoPanel, beam, basic, lambert, cylGeo, boxGeo, streak, makeCanvas
} from '../core/kit.js';
import {
  addLights, addGround, addBuildings, addSkyline, addLamps, addCrosswalk, addBench, addBin, addHoloAd, Traffic
} from './cityKit.js';
import { NPC } from '../entities/npc.js';
import { shake } from '../core/fx.js';

/** Bus exterior, forward = +X, doors on the -Z (left) side. */
export function makeBusExterior() {
  const g = new THREE.Group();
  const body = nbox(11, 2.5, 2.6, 0x14104a, C.pink);
  body.position.y = 1.7;
  g.add(body);
  const roof = nbox(10.6, 0.15, 2.3, 0x0a0830, C.cyan);
  roof.position.y = 3.0;
  g.add(roof);
  for (const sx of [-2.5, 0.5, 3]) {
    const ac = nbox(1.4, 0.35, 1.2, 0x1a1a44, C.violet);
    ac.position.set(sx, 3.25, 0);
    g.add(ac);
  }
  for (const sz of [-1.32, 1.32]) {
    const win = new THREE.Mesh(boxGeo(9.6, 0.95, 0.05), basic(0x2a6aff, { opacity: 0.65 }));
    win.position.set(-0.2, 2.1, sz);
    g.add(win);
    const strip = led(10.4, 0.07, 0.06, C.cyan);
    strip.position.set(0, 0.95, sz);
    g.add(strip);
    const strip2 = led(10.4, 0.07, 0.06, C.pink);
    strip2.position.set(0, 2.75, sz);
    g.add(strip2);
  }
  const ws = new THREE.Mesh(boxGeo(0.06, 1.2, 2.3), basic(0x1a3a8a, { opacity: 0.7 }));
  ws.position.set(5.52, 2.1, 0);
  g.add(ws);
  for (const sz of [-0.9, 0.9]) {
    const hl = led(0.1, 0.18, 0.5, 0xdfffff);
    hl.position.set(5.52, 0.75, sz);
    g.add(hl);
    const tl = led(0.1, 0.18, 0.5, C.red);
    tl.position.set(-5.52, 0.75, sz);
    g.add(tl);
  }
  const wg = cylGeo(0.55, 0.55, 0.4, 12);
  for (const sx of [-3.4, 3.4]) for (const sz of [-1.15, 1.15]) {
    const w = new THREE.Mesh(wg, lambert(0x050510));
    w.rotation.x = Math.PI / 2;
    w.position.set(sx, 0.55, sz);
    g.add(w);
  }
  // route display (front)
  const rc = makeCanvas(256, 64);
  const r = rc.getContext('2d');
  r.fillStyle = '#05010f'; r.fillRect(0, 0, 256, 64);
  r.fillStyle = '#ffb000'; r.shadowColor = '#ffb000'; r.shadowBlur = 8;
  r.font = '900 34px Orbitron, monospace'; r.textBaseline = 'middle';
  r.fillText('42 METRO GATE', 12, 34);
  const rt = new THREE.CanvasTexture(rc);
  rt.colorSpace = THREE.SRGBColorSpace;
  const route = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.45), new THREE.MeshBasicMaterial({ map: rt }));
  route.position.set(5.56, 2.95, 0);
  route.rotation.y = Math.PI / 2;
  g.add(route);
  // doors on -Z side
  const doors = [];
  for (const dx of [3.05, 4.15]) {
    const d = nbox(1.0, 1.9, 0.07, 0x0a2a5a, C.cyan);
    d.position.set(dx, 1.2, -1.33);
    g.add(d);
    doors.push({ m: d, x0: dx, dir: dx < 3.6 ? -1 : 1 });
  }
  const ug = streak(C.cyan, 3, 11, 0.55);
  ug.rotation.z = Math.PI / 2;
  ug.position.y = 0.06;
  g.add(ug);
  const hg = glow(0xcfe8ff, 5, 0.6);
  hg.position.set(6.2, 0.8, 0);
  g.add(hg);
  const beamF = streak(0xcfe8ff, 2.4, 12, 0.22);
  beamF.rotation.z = Math.PI / 2;
  beamF.position.set(11.5, 0.07, 0);
  g.add(beamF);
  g.userData.doors = doors;
  g.userData.setDoors = (k) => doors.forEach((d) => { d.m.position.x = d.x0 + d.dir * 0.95 * k; });
  return g;
}

export class BusStopStage extends Stage {
  constructor() {
    super('busstop');
    this.chapter = 3;
    this.bounds = { minX: -58, maxX: 58, minZ: -13.6, maxZ: 13.6 };
    this.mapRange = 34;
    this.spawn = { x: -38, z: 10.4, yaw: Math.PI / 2 };
    this.camCfg = { dist: 5.4, height: 1.5, minPitch: 0.08, maxPitch: 1.1, fov: 62, bounds: null, block: (p) => this._camBlocked(p) };
    this.waiting = false;
    this.waitT = 0;
    this.busState = 'none';
    this.flickerLevel = 0.3;
    this.boarding = false;
    this.events = [];
    this.stopX = 14;
  }

  _camBlocked(p) {
    for (const c of this.colliders) {
      if (p.y < c.h && p.x > c.minX - 0.15 && p.x < c.maxX + 0.15 && p.z > c.minZ - 0.15 && p.z < c.maxZ + 0.15) return true;
    }
    return false;
  }

  async load() {
    this.skyScene(0x1c0a40, 0.012);
    this.lights = addLights(this, { sky: 0x7a6cff, ground: 0x1a0a3a, hemi: 0.95, dirColor: 0xa0b4ff, dir: 0.55, dirPos: [-40, 60, 30] });
    this.pLight = new THREE.PointLight(0x66aaff, 5 * Math.PI, 11, 1.6);
    this.scene.add(this.pLight);
    this.siren = new THREE.PointLight(0xff0030, 0, 45, 1.4);
    this.scene.add(this.siren);
    const sh = new THREE.PointLight(0x9b4dff, 9 * Math.PI, 12, 1.5);
    sh.position.set(this.stopX, 2.4, 10.8);
    this.scene.add(sh);
    const sc = new THREE.PointLight(0x00f0ff, 6 * Math.PI, 10, 1.5);
    sc.position.set(this.stopX + 4, 2.2, 9);
    this.scene.add(sc);

    addGround(this, -200, 200);
    addSkyline(this, 0, 12, 180);
    this.buildings = addBuildings(this, { x0: -190, x1: 190, seed: 77, minH: 18, maxH: 50 });
    this.lamps = addLamps(this, -180, 180, 20);
    addCrosswalk(this, -20, 5);
    this.traffic = new Traffic(this, {
      lanes: [{ z: -5.25, dir: 1 }, { z: -1.75, dir: 1 }, { z: 1.75, dir: -1 }],
      range: [-200, 200], perLane: 4, seed: 11
    });
    this.addCollider(-70, -58.6, -14, 14, 50);
    this.addCollider(58.6, 70, -14, 14, 50);
    this._shelter();
    this._npcs();
    this._bus();
    for (const [x, z, r] of [[-28, 8.0, Math.PI], [30, 8.0, Math.PI], [-36, 12, Math.PI]]) addBench(this, x, z, r);
    addBin(this, -10, 8.1);
    addBin(this, 24, 12.4);
    addHoloAd(this, -8, 5.5, 12.3, ['NIGHT', 'RAMEN'], C.pink, Math.PI, 3.4, 2.2);
    addHoloAd(this, 36, 6, 12.3, ['METRO', 'PASS', 'SALE'], C.violet, Math.PI, 3.6, 2.4);
    const b = beam(C.cyan, 16, 0.7);
    b.position.set(this.stopX, 8, 10.5);
    this.scene.add(b);
    this.beam = b;
  }

  _shelter() {
    const X = this.stopX;
    const roof = nbox(6.4, 0.14, 2.6, 0x14104a, C.cyan);
    roof.position.set(X, 2.75, 11.7);
    this.scene.add(roof);
    const roofGlow = led(6.2, 0.04, 2.4, C.violet);
    roofGlow.position.set(X, 2.66, 11.7);
    this.scene.add(roofGlow);
    for (const sx of [-3, 3]) {
      const p = nbox(0.1, 2.7, 0.1, 0x22204a, C.cyan);
      p.position.set(X + sx, 1.35, 10.5);
      this.scene.add(p);
      const p2 = p.clone();
      p2.position.z = 12.9;
      this.scene.add(p2);
    }
    for (let i = 0; i < 3; i++) {
      const gl = new THREE.Mesh(boxGeo(1.9, 2.3, 0.05), basic(0x2a8aff, { opacity: 0.22 }));
      gl.position.set(X - 2 + i * 2, 1.4, 12.9);
      this.scene.add(gl);
    }
    const adv = holoPanel(['STAY', 'CONNECTED', '5G CITY'], C.cyan, 1.8, 1.9);
    adv.position.set(X, 1.45, 12.84);
    adv.rotation.y = Math.PI;
    this.scene.add(adv);
    this.flicker(adv.userData.mat, 1);
    addBench(this, X - 1, 12.2, Math.PI);
    this.addBoxCollider(X, 12.9, 6, 0.3, 2.7);
    const s = glowSign('BUS STOP', C.cyan, 3.2, { h: 100 });
    s.position.set(X, 3.3, 11.7);
    this.scene.add(s);
    this.flicker(s.userData.mat, 1);
    // route pole
    const pole = new THREE.Mesh(cylGeo(0.07, 0.07, 3.2, 6), lambert(0x22204a));
    pole.position.set(X + 5, 1.6, 8.2);
    this.scene.add(pole);
    this.addBoxCollider(X + 5, 8.2, 0.3, 0.3, 3.2);
    this.route = holoPanel(['BUS 42', 'METRO GATE', 'ARRIVING 0:25'], C.cyan, 2.2, 1.5);
    this.route.position.set(X + 5, 3.2, 8.2);
    this.route.rotation.y = Math.PI;
    this.scene.add(this.route);
    this.flicker(this.route.userData.mat, 0.8);
    const rg = glow(C.cyan, 5, 0.4);
    rg.position.set(X + 5, 3.2, 8.0);
    this.scene.add(rg);
  }

  _drawRoute(l1, l2, l3, col = '#00f0ff') {
    const c = this.route.userData.canvas, g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);
    g.fillStyle = 'rgba(0,20,40,0.5)';
    g.fillRect(0, 0, c.width, c.height);
    g.strokeStyle = col; g.lineWidth = 5; g.shadowColor = col; g.shadowBlur = 12;
    g.strokeRect(4, 4, c.width - 8, c.height - 8);
    g.fillStyle = col; g.textAlign = 'center'; g.textBaseline = 'middle';
    [[l1, 0.26, 52], [l2, 0.52, 30], [l3, 0.78, 28]].forEach(([t, y, s]) => {
      g.font = `900 ${s}px Orbitron, sans-serif`;
      g.fillText(t, c.width / 2, c.height * y);
    });
    g.shadowBlur = 0;
    g.fillStyle = 'rgba(255,255,255,0.07)';
    for (let y = 0; y < c.height; y += 4) g.fillRect(0, y, c.width, 1);
    this.route.userData.tex.needsUpdate = true;
  }

  _npcs() {
    const X = this.stopX;
    const mk = (name, x, z, lines, o = {}) => {
      const n = new NPC({ x, z, name, lines, mode: 'idle', yaw: o.yaw ?? -Math.PI / 2, outline: C.cyan, ...o });
      this.addNPC(n);
      this.addInteractable({ x, z, r: 2.0, y: 1.5, label: 'TALK', color: C.cyan, onUse: () => G.hud.sayLines(lines.map((l) => [name, l])) });
      return n;
    };
    mk('WOMAN', X - 1.5, 10.2, ['Bus 42 is always late. Today of all days.', 'My phone says delay... then it just says error.']);
    mk('OFFICE GUY', X + 1, 9.6, ['Third day in a row with strange traffic.', 'Hope the bus is not packed.'], { mode: 'phone' });
    this.sick = new NPC({ x: X + 2.5, z: 11.4, name: 'SICK MAN', lines: ['...cold... so cold...', 'Don\'t... look at me...'], mode: 'stagger', hood: true, speed: 0.15, outline: C.red, yaw: Math.PI });
    this.sick.route = { x0: X + 1.5, x1: X + 3.5 };
    this.addNPC(this.sick);
    this.addInteractable({ x: X + 2.5, z: 11.4, r: 2.3, y: 1.5, label: 'TALK', color: C.red, onUse: () => G.hud.sayLines(this.sick.lines.map((l) => ['SICK MAN', l])), enabled: () => this.sick.mode !== 'flee' });
    // some street walkers
    const sp = [[-30, 9.5], [-20, 10.8], [0, 9.2], [34, 10.4], [48, 9.6]];
    this.walkers = sp.map(([x, z], i) => {
      const n = new NPC({ x, z, mode: i % 3 === 2 ? 'phone' : 'walk', dir: i % 2 ? 1 : -1, route: { x0: -56, x1: 56 }, speed: 1.0 + i * 0.1 });
      this.addNPC(n);
      return n;
    });
  }

  _bus() {
    const root = makeBusExterior();
    root.rotation.y = Math.PI; // heading -X, doors toward +Z
    root.position.set(150, 0, 5.3);
    root.visible = false;
    this.scene.add(root);
    this.bus = { root, x: 150, v: 0 };
    this.busLight = new THREE.PointLight(0x66aaff, 0, 14, 1.5);
    this.busLight.position.set(0, 2, 0);
    this.scene.add(this.busLight);
  }

  async enter(opts = {}) {
    const pl = G.player;
    this.scene.add(pl.rig.root);
    pl.reset(this.spawn.x, this.spawn.z, this.spawn.yaw);
    if (opts.restore) pl.restore(opts.restore);
    const r = pl.rig;
    r.shirtMat.color.setHex(0x14124a);
    r.setColors(null, pl.accent, null);
    r.stripes.forEach((s) => { s.visible = true; });
    r.pantsMat.color.setHex(0x0d0d2b);
    pl.setWeapon(pl.inv.backpack ? 'bag' : 'fists');
    pl.syncHeld();
    G.hud.setCombat(false);
    G.hud.setTag('CHAPTER 3 · BOARDING THE BUS');
    G.camRig.configure(this.camCfg);
    G.camRig.yaw = -Math.PI / 2;
    G.camRig.pitch = 0.32;
    G.fx.setMotes(true, new THREE.Vector3(46, 14, 46));
    G.audio.setMood('tense');
    G.audio.sirenOn(true, 0.04);
    G.hud.setObjectives('CATCH BUS 42', [
      { id: 'reach', text: 'Go to the bus stop' },
      { id: 'wait', text: 'Wait for the bus' },
      { id: 'board', text: 'Board the bus' }
    ]);
    G.hud.setWaypoint({ x: this.stopX, z: 10.4 });
    G.saveCheckpoint({ chapter: 3, stage: 'busstop', cp: 0 });
    G.hud.fade(false);
    G.hud.banner('CHAPTER 3', 'BOARDING THE BUS', 3000);
    G.hud.say('AARAV', 'The stop is just ahead. Route 42 should be coming any minute.');
    this._drawRoute('BUS 42', 'METRO GATE', 'WAITING...');
    // boarding interactable (enabled once the bus doors open)
    this.boardIt = this.addInteractable({
      x: 0, z: 7.9, r: 2.2, y: 1.2, color: C.green, label: 'BOARD BUS 42', marker: true,
      enabled: () => this.busState === 'stopped' && !this.boarding,
      onUse: () => this._board()
    });
  }

  _startWait() {
    this.waiting = true;
    this.waitT = 0;
    G.hud.completeObj('reach');
    G.hud.setWaypoint(null);
    G.hud.say('', 'Bus 42 arriving soon. Stay close to the stop.');
    const E = (t, fn) => this.events.push({ t, fn, done: false });
    E(3, () => { this.flickerLevel = 0.45; G.hud.toast('SIRENS IN THE DISTANCE', 'red'); });
    E(7, () => {
      G.audio.sfx('scream');
      this.walkers.slice(0, 3).forEach((n, i) => n.setMode('flee', { dir: 1, speed: 5 + i * 0.5 }));
      G.hud.say('WOMAN', 'Did you hear that?!');
    });
    E(11, () => {
      G.hud.redAlert(true);
      G.audio.sfx('crash');
      G.hud.toast('EXPLOSION DOWNTOWN', 'red');
      shake(0.4, 0.8);
    });
    E(15, () => {
      this.flickerLevel = 0.7;
      G.hud.say('SICK MAN', '...hungry...');
      this.sick.rig.p.hurt = 0.7;
    });
    E(20, () => { this.flickerLevel = 0.9; G.audio.sfx('power'); this.scene.fog.density = 0.0155; });
    E(24, () => { this._arrive(); });
  }

  _arrive() {
    this.busState = 'arrive';
    this.bus.x = 100;
    this.bus.v = 15;
    this.bus.root.visible = true;
    G.audio.sfx('horn');
    G.audio.engine(true, 1);
    G.hud.completeObj('wait');
    this._drawRoute('BUS 42', 'ARRIVING', 'NOW', '#39ff9a');
  }

  async _board() {
    this.boarding = true;
    const pl = G.player;
    pl.locked = true;
    G.hud.setWaypoint(null);
    const ok = await G.mg.run('swipeCard', { title: 'SWIPE YOUR PASS', text: 'Drag the card across the reader at a steady speed' });
    if (this.disposed) return;
    if (!ok) { pl.locked = false; this.boarding = false; return; }
    G.hud.completeObj('board');
    G.audio.sfx('door');
    pl.walkTo(this.bus.x - 3.6, 6.2, 2.4);
    G.hud.banner('CHAPTER 3', 'ALL ABOARD', 1800);
    if (!await this.wait(1.7)) return;
    G.nextChapter('3b');
  }

  update(dt) {
    this.baseUpdate(dt);
    const pl = G.player, t = this.time;
    const px = pl.pos.x, pz = pl.pos.z;
    this.pLight.position.set(px, 3.2, pz + 1);
    this.traffic.update(dt, 'green', px);
    for (const n of this.npcs) {
      n.update(dt, pl, t);
      n.rig.root.visible = Math.abs(n.pos.x - px) < 80;
      if (n.mode === 'flee' && n.pos.x > 70) n.pos.x = -56;
    }
    if (!this.waiting && Math.abs(px - this.stopX) < 4.5 && pz > 8) this._startWait();
    if (this.waiting) {
      this.waitT += dt;
      for (const e of this.events) if (!e.done && this.waitT >= e.t) { e.done = true; e.fn(); }
      if (this.busState === 'none') {
        const left = Math.max(0, 25 - this.waitT);
        G.hud.setObjText('wait', `Wait for the bus (0:${String(Math.ceil(left)).padStart(2, '0')})`);
        if (Math.floor(this.waitT * 2) !== this._lr) { this._lr = Math.floor(this.waitT * 2); this._drawRoute('BUS 42', 'METRO GATE', `ARRIVING 0:${String(Math.ceil(left)).padStart(2, '0')}`); }
      }
    }
    // bus motion
    const B = this.bus;
    if (this.busState === 'arrive') {
      const xs = this.stopX + 3.6;
      const dist = Math.max(0, B.x - xs);
      B.v = Math.min(15, Math.sqrt(2 * 4.2 * dist) + 0.3);
      B.x -= B.v * dt;
      if (dist < 0.05) {
        B.x = xs; B.v = 0;
        this.busState = 'stopped';
        G.audio.sfx('hiss');
        G.audio.engine(true, 0.4);
        this.doorK = 0;
        this.boardIt.x = this.stopX;
        this.boardIt.z = 7.9;
        if (this.boardIt.marker) this.boardIt.marker.position.set(this.stopX, 0, 7.9);
        this._drawRoute('BUS 42', 'NOW BOARDING', 'TAP YOUR PASS', '#39ff9a');
        G.hud.setWaypoint({ x: this.stopX, z: 7.9 });
        G.hud.say('', 'The doors are opening. Walk to the glowing door and board.');
        G.hud.toast('BUS 42 HAS ARRIVED', 'green');
      }
      B.root.position.x = B.x;
      this.busLight.position.set(B.x - 3, 2, 5.3);
      this.busLight.intensity = 8 * Math.PI;
    }
    if (this.busState === 'stopped') {
      this.doorK = Math.min(1, (this.doorK || 0) + dt * 1.2);
      B.root.userData.setDoors(this.doorK);
    }
    // collisions with bus once parked
    if (this.busState === 'stopped' && !this._busCol) {
      this._busCol = this.addCollider(B.x - 5.5, B.x + 5.5, 4.0, 6.6, 3.2);
    }
    // ambience
    const lv = this.flickerLevel;
    this.siren.position.set(px + 18, 6, 0);
    this.siren.color.setHex(Math.floor(t * 2.5) % 2 === 0 ? 0xff0030 : 0x2040ff);
    this.siren.intensity = lv > 0.3 ? 11 * Math.PI * (lv - 0.2) : 0;
    this.scene.backgroundIntensity = 1 - 0.3 * lv;
    this._cullT = (this._cullT || 0) + dt;
    if (this._cullT > 0.25) {
      this._cullT = 0;
      for (const b of this.buildings) b.visible = Math.abs(b.userData.x - px) < 125;
      for (const l of this.lamps) l.visible = Math.abs(l.userData.x - px) < 110;
    }
    for (const b of this.buildings) if (b.userData.beacon) b.userData.beacon.material.opacity = Math.sin(t * 4) > 0 ? 0.9 : 0.15;
    this.beam.material.opacity = 0.15 + Math.sin(t * 3) * 0.05;
    this.beam.visible = !this.waiting;
    G.input.queue.delete('attack');
  }

  mapData() {
    const p = super.mapData();
    p.push({ x: this.stopX, z: 10.5, c: C.cyan, s: 'd' });
    if (this.bus.root.visible) p.push({ x: this.bus.x, z: 5.3, c: C.green, s: 'd' });
    return p;
  }

  exit() {
    G.audio.sirenOn(false);
    G.audio.engine(false);
    G.hud.redAlert(false);
    G.player.rig.root.removeFromParent();
  }
}
