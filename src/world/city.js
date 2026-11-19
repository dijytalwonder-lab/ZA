import * as THREE from 'three';
import { Stage } from './stage.js';
import { G } from '../core/state.js';
import { C, nbox, led, glow, glowSign, beam, basic, lambert, addEdges } from '../core/kit.js';
import {
  addLights, addGround, addBuildings, addSkyline, addLamps, addCrosswalk, makeTrafficLight, addStall, addBench, addBin,
  addHoloAd, makeCar, Traffic
} from './cityKit.js';
import { CoinField } from './coins.js';
import { NPC } from '../entities/npc.js';

export class CityStage extends Stage {
  constructor() {
    super('city');
    this.chapter = 2;
    this.bounds = { minX: -98.5, maxX: 60.5, minZ: -13.6, maxZ: 37.4 };
    this.mapRange = 36;
    this.spawn = { x: -95.5, z: -13.0, yaw: Math.PI / 2 };
    this.camCfg = { dist: 5.4, height: 1.5, minPitch: 0.08, maxPitch: 1.1, fov: 62, bounds: null, block: (p) => this._camBlocked(p) };
    this.cull = [];
    this.events = [];
    this.light = '';
    this.hitCount = 0;
    this.sideSeen = '';
    this.finished = false;
    this.talkDone = false;
    this.walkers = [];
  }

  _camBlocked(p) {
    for (const c of this.colliders) {
      if (p.y < c.h && p.x > c.minX - 0.15 && p.x < c.maxX + 0.15 && p.z > c.minZ - 0.15 && p.z < c.maxZ + 0.15) return true;
    }
    return false;
  }

  async load() {
    this.skyScene(0x1a0a3d, 0.0105);
    this.lights = addLights(this, { sky: 0x7a6cff, ground: 0x1a0a3a, hemi: 1.0, dirColor: 0xa0b4ff, dir: 0.6, dirPos: [-40, 60, 30] });
    this.pLight = new THREE.PointLight(0x66aaff, 5 * Math.PI, 11, 1.6);
    this.scene.add(this.pLight);
    this.siren = new THREE.PointLight(0xff0030, 0, 45, 1.4);
    this.siren.position.set(0, 6, 0);
    this.scene.add(this.siren);

    addGround(this, -230, 190, { plaza: { x0: 25, x1: 55, z0: 14, z1: 38 } });
    addSkyline(this, 0, 5, 200);
    this.buildings = addBuildings(this, { x0: -230, x1: 190, seed: 21, gaps: [{ side: 1, x0: 25, x1: 55 }] });
    this.lamps = addLamps(this, -220, 180, 20);
    addCrosswalk(this, -40, 5);
    this.tlights = [];
    for (const [x, z] of [[-43, -7.7], [-43, 7.7], [-37, -7.7], [-37, 7.7]]) this.tlights.push(makeTrafficLight(this, x, z, z < 0 ? -1 : 1));
    this.traffic = new Traffic(this, {
      lanes: [{ z: -5.25, dir: 1 }, { z: -1.75, dir: 1 }, { z: 1.75, dir: -1 }, { z: 5.25, dir: -1 }],
      range: [-230, 190], stop: { east: -44.5, west: -35.5 }, perLane: 7, seed: 3
    });
    this._walls();
    this._props();
    this._plaza();
    this._police();
    this._npcs();
    this._coins();
    this._events();
    // bus stop beacon at the end of the street
    const b = beam(C.cyan, 22, 0.8);
    b.position.set(55, 11, 10.5);
    this.scene.add(b);
    this.stopBeam = b;
    const bg = glow(C.cyan, 8, 0.5);
    bg.position.set(55, 2, 10.5);
    this.scene.add(bg);
    const bs = glowSign('BUS STOP', C.cyan, 4);
    bs.position.set(55, 4.6, 12.5);
    this.scene.add(bs);
  }

  _walls() {
    // invisible walls that close the plaza and the street ends
    this.addCollider(-105, 25, 13.9, 70, 50);
    this.addCollider(55, 70, 13.9, 70, 50);
    this.addCollider(25, 55, 37.6, 70, 50);
    this.addCollider(-110, -98.6, -14, 14, 50);
    this.addCollider(60.7, 75, -14, 14, 50);
    // construction barrier at the east end
    for (const sz of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const bar = nbox(0.3, 0.9, 2.2, 0x2a1040, C.orange);
        bar.position.set(60.2, 0.45, sz * (8 + i * 2.1));
        this.scene.add(bar);
        const l = led(0.2, 0.08, 2.0, C.orange);
        l.position.set(60.2, 0.95, sz * (8 + i * 2.1));
        this.scene.add(l);
      }
    }
    // home doorway
    const door = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.4), basic(0x7a3cff));
    door.position.set(-96, 1.2, -13.93);
    this.scene.add(door);
    const ds = glowSign('HOME 4B', C.green, 2, { h: 90 });
    ds.position.set(-96, 3, -13.9);
    this.scene.add(ds);
    const dg = glow(0x7a3cff, 5, 0.6);
    dg.position.set(-96, 1.4, -13.4);
    this.scene.add(dg);
  }

  _props() {
    const rng = [-85, -62, -18, 8, 34, 52];
    rng.forEach((x, i) => {
      addBench(this, x, i % 2 ? -8.0 : 8.0, i % 2 ? 0 : Math.PI);
      addBin(this, x + 5, i % 2 ? 8.0 : -8.0);
    });
    addHoloAd(this, -75, 5.5, -11.5, ['NIGHT', 'RAMEN', '24/7'], C.pink, 0, 3.4, 2.2);
    addHoloAd(this, -48, 5.8, 12.3, ['CYBER', 'CHAI'], C.cyan, Math.PI, 3.4, 2.2);
    addHoloAd(this, -10, 6, -11.5, ['MOBILE', 'FEST', '50% OFF'], C.violet, 0, 3.6, 2.4);
    addHoloAd(this, 14, 6, 11.8, ['SWEETS', 'मिठाई'], C.yellow, Math.PI, 3.4, 2.2);
    this.news = addHoloAd(this, -30, 5, -11.8, ['CITY NEWS', 'ALL CLEAR', 'HAVE A', 'NICE DAY'], C.green, 0, 3.6, 2.6);
    this.newsEvent = false;
    // stalls
    this.chaiStall = addStall(this, -66, -11.6, { color: C.pink, label: 'चाय', rot: 0 });
    addStall(this, -5, 11.6, { color: C.cyan, label: 'MOMO', rot: Math.PI });
  }

  _plaza() {
    // glowing shrine in the middle of the plaza
    const base = nbox(7, 0.6, 7, 0x1a1045, C.violet);
    base.position.set(40, 0.3, 28);
    this.scene.add(base);
    const mid = nbox(4.6, 1.2, 4.6, 0x241466, C.pink);
    mid.position.set(40, 1.2, 28);
    this.scene.add(mid);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(2.3, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), lambert(0x3a1a8a, 0x120a40));
    dome.position.set(40, 1.8, 28);
    addEdges(dome, C.cyan);
    this.scene.add(dome);
    const spire = new THREE.Mesh(new THREE.ConeGeometry(0.2, 2, 6), basic(C.yellow));
    spire.position.set(40, 5.2, 28);
    this.scene.add(spire);
    const g = glow(C.pink, 14, 0.5);
    g.position.set(40, 3, 28);
    this.scene.add(g);
    this.addBoxCollider(40, 28, 7, 7, 3);
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2;
      const l = glow(i % 2 ? C.cyan : C.pink, 1.6, 0.9);
      l.position.set(40 + Math.cos(a) * 3.3, 0.9, 28 + Math.sin(a) * 3.3);
      this.scene.add(l);
    }
    addStall(this, 31, 20, { color: C.violet, label: 'COLA', rot: 0 });
    addStall(this, 49, 20, { color: C.green, label: 'MOMO', rot: 0 });
    addBench(this, 33, 33, 0);
    addBench(this, 47, 33, 0);
    addHoloAd(this, 40, 7.5, 36, ['LAST', 'COMMUTE?', 'WHO CARES'], C.hot, Math.PI, 5, 3);
  }

  _police() {
    const root = makeCar(C.blue, 'car');
    const r = glow(C.red, 3, 1), b = glow(C.blue, 3, 1);
    r.material = r.material.clone();
    b.material = b.material.clone();
    r.position.set(-0.3, 1.9, 0.5);
    b.position.set(-0.3, 1.9, -0.5);
    root.add(r, b);
    root.visible = false;
    this.scene.add(root);
    this.police = { root, x: -220, active: false, r, b, t: 0 };
  }

  _npcs() {
    const walkers = [];
    const spots = [[-85, -9], [-60, -10.5], [-45, -9.5], [-20, -9.8], [0, -10.2], [30, -9.2], [-90, 9.6], [-70, 10.5], [-30, 9.2], [10, 10.4], [45, 9.8]];
    spots.forEach(([x, z], i) => {
      const n = new NPC({ x, z, mode: i % 4 === 3 ? 'phone' : 'walk', dir: i % 2 ? 1 : -1, speed: 0.9 + (i % 5) * 0.12, route: { x0: -97, x1: 59 }, backpack: i % 3 === 0 });
      this.addNPC(n);
      walkers.push(n);
    });
    this.walkers = walkers;
    const mk = (name, x, z, lines, o = {}) => {
      const n = new NPC({ x, z, name, lines, mode: 'idle', outline: C.cyan, yaw: o.yaw ?? 0, ...o });
      this.addNPC(n);
      this.addInteractable({ x, z, r: 2.1, y: 1.5, label: 'TALK', color: C.cyan, onUse: () => this._talk(n) });
      return n;
    };
    this.chai = mk('CHAI WALA', -66, -10.4, ['Garma-garam chai! Best in the whole sector, beta.', 'Strange night... my customers all look half asleep.']);
    this.chai.yaw = Math.PI;
    this.addInteractable({ x: -64.4, z: -9.3, r: 1.7, y: 1.2, label: 'BUY CHAI (10 COINS)', color: C.yellow, onUse: () => this._buyChai() });
    mk('PAPER KID', -53, -9, ['News, news! Sector 9 hospital is overflowing!', 'Mama says stay inside. But who listens to mama, na?']);
    mk('AUNTY', -22, 9.4, ['Arre, where is everyone going so early?', 'My neighbour was shouting last night. Not normal shouting.']);
    mk('TEEN', 18, 9.6, ['No signal anywhere. Not even one bar!', 'Did the towers die? Everything is glitching.'], { yaw: -0.6 });
    mk('GUARD', 33, 16, ['Move along. Nothing to see here.', 'We got a call... people biting people. Ridiculous, right?']);
    const cola = mk('COLA SELLER', 31, 18.4, ['Glow Cola! Cold and glowing!']);
    cola.yaw = 0;
    this.addInteractable({ x: 33.2, z: 18.6, r: 1.7, y: 1.2, label: 'BUY GLOW COLA (15 COINS)', color: C.yellow, onUse: () => this._buyCola() });
  }

  _talk(n) {
    G.hud.sayLines(n.lines.map((l) => [n.name, l]));
    if (!this.talkDone) { this.talkDone = true; G.hud.completeObj('talk'); }
  }
  _buyChai() {
    const pl = G.player;
    if (pl.inv.coins < 10) { G.audio.sfx('error'); G.hud.toast('NOT ENOUGH COINS', 'red'); return; }
    pl.inv.coins -= 10;
    pl.heal(35);
    pl.stamina = pl.maxStamina;
    G.audio.sfx('heal');
    G.hud.toast('HOT CHAI: HEALTH + STAMINA RESTORED', 'green');
  }
  _buyCola() {
    const pl = G.player;
    if (pl.inv.bottle >= 5) { G.hud.toast('BOTTLES FULL', 'red'); return; }
    if (pl.inv.coins < 15) { G.audio.sfx('error'); G.hud.toast('NOT ENOUGH COINS', 'red'); return; }
    pl.inv.coins -= 15;
    pl.inv.bottle++;
    G.audio.sfx('pickup');
    G.hud.toast('GLOW COLA BOTTLE +1 (THROWABLE)', 'gold');
  }

  _coins() {
    const pts = [];
    for (let x = -88; x < 56; x += 7) {
      pts.push({ x, y: 0.9, z: -10.8 + Math.sin(x * 0.2) * 1.3, v: 5 });
      pts.push({ x: x + 3.5, y: 0.9, z: 10.8 + Math.cos(x * 0.2) * 1.3, v: 5 });
    }
    for (let x = -80; x < 50; x += 22) pts.push({ x, y: 0.9, z: (x / 22 | 0) % 2 ? 3.5 : -3.5, v: 10 });
    for (const [x, z] of [[40, 24], [43, 30], [37, 31], [34, 26], [46, 26]]) pts.push({ x, y: 0.9, z, v: 10 });
    this.coins = new CoinField(this, pts);
    this.coins.onCollect = (c) => G.hud.setObjText('coins', `Collect coins (${c.got}/${c.total})`);
  }

  _events() {
    const E = (x, fn) => this.events.push({ x, fn, done: false });
    E(-82, () => {
      this.flickerLevel = 0.12;
      G.audio.sirenOn(true, 0.025);
      G.hud.say('AARAV', 'Huh. Those lights keep flickering...');
    });
    E(-58, () => {
      G.hud.toast('DISTANT SIRENS', 'red');
      this._stagger(-45, 9.6);
    });
    E(-44, () => {
      this.flickerLevel = 0.22;
      this._setNews(['CITY ALERT', 'STAY', 'INDOORS']);
      G.hud.say('', 'The news board changed...');
    });
    E(-22, () => {
      this.police.active = true;
      this.police.x = -140;
      G.audio.sirenOn(true, 0.05);
      this.flickerLevel = 0.35;
      G.audio.sfx('horn');
      G.hud.say('AARAV', 'Police? In this part of town?');
    });
    E(4, () => {
      this.flickerLevel = 0.55;
      G.audio.sfx('scream');
      G.hud.toast('SOMEONE SCREAMED', 'red');
      this.walkers.slice(0, 3).forEach((n, i) => n.setMode('flee', { dir: i % 2 ? 1 : -1, speed: 4.6 + i * 0.4 }));
      G.audio.setMood('tense');
    });
    E(22, () => {
      this.flickerLevel = 0.75;
      G.audio.sfx('power');
      G.hud.redAlert(true);
      G.hud.banner('SOMETHING IS WRONG', '', 2000);
      if (this.walkers[6]) this.walkers[6].setMode('collapse');
      if (this.walkers[7]) this.walkers[7].setMode('stagger', { speed: 0.8 });
      this.scene.fog.density = 0.0135;
    });
    E(42, () => {
      this.flickerLevel = 0.9;
      G.audio.sfx('scream');
      this.walkers.slice(3, 9).forEach((n, i) => n.setMode('flee', { dir: 1, speed: 4.2 + (i % 3) * 0.6 }));
      G.hud.say('AARAV', 'Everyone is running... the bus stop. Go!');
    });
  }
  _stagger(x, z) {
    const n = this.walkers.find((w) => Math.abs(w.pos.z - z) < 3) || this.walkers[1];
    if (n) { n.pos.set(x, 0, z); n.setMode('stagger', { speed: 0.7 }); n.route = { x0: x - 8, x1: x + 8 }; }
  }
  _setNews(lines) {
    const p = this.news;
    const c = p.userData.canvas, g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);
    g.fillStyle = 'rgba(40,0,10,0.6)';
    g.fillRect(0, 0, c.width, c.height);
    g.strokeStyle = '#ff2244'; g.lineWidth = 5; g.strokeRect(4, 4, c.width - 8, c.height - 8);
    g.fillStyle = '#ff2244'; g.shadowColor = '#ff2244'; g.shadowBlur = 14;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    lines.forEach((l, i) => { g.font = `900 ${i === 0 ? 46 : 36}px Orbitron, sans-serif`; g.fillText(l, c.width / 2, c.height * ((i + 1) / (lines.length + 1))); });
    p.userData.tex.needsUpdate = true;
  }

  _lightState() {
    const c = this.time % 21;
    return c < 10 ? 'green' : c < 12 ? 'yellow' : 'red';
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
    G.hud.setTag('CHAPTER 2 · THE CITY LIGHTS');
    G.camRig.configure(this.camCfg);
    G.camRig.yaw = -Math.PI / 2;
    G.camRig.pitch = 0.32;
    G.fx.setMotes(true, new THREE.Vector3(46, 14, 46));
    G.audio.setMood('city');
    G.hud.setObjectives('WALK TO THE BUS STOP', [
      { id: 'cross', text: 'Cross the road safely' },
      { id: 'coins', text: `Collect coins (0/${this.coins.total})` },
      { id: 'talk', text: 'Talk to someone (optional)' },
      { id: 'stop', text: 'Reach the bus stop' }
    ]);
    G.hud.setWaypoint({ x: -40, z: 0 });
    G.saveCheckpoint({ chapter: 2, stage: 'city', cp: 0 });
    G.hud.fade(false);
    G.hud.banner('CHAPTER 2', 'WALKING THROUGH THE CITY LIGHTS', 3000);
    pl.locked = true;
    pl.walkTo(-93.5, -11.0, 2.2, () => { pl.locked = false; });
    this.after(1.6, () => { pl.locked = false; });
    G.hud.say('AARAV', 'Bus leaves at 7. Cross at the crosswalk, then straight on to the stop.');
  }

  update(dt) {
    this.baseUpdate(dt);
    const pl = G.player, t = this.time;
    const px = pl.pos.x, pz = pl.pos.z;
    this.pLight.position.set(px, 3.2, pz + 1);
    // traffic + lights
    const ls = this._lightState();
    if (ls !== this.light) {
      this.light = ls;
      for (const l of this.tlights) l.set(ls);
      if (ls === 'red' && Math.abs(px + 40) < 14) G.hud.toast('WALK SIGNAL ON', 'green');
    }
    this.traffic.update(dt, ls, px);
    if (!pl.dead && !pl.locked) {
      const car = this.traffic.hit(px, pz);
      if (car && pl.iframes <= 0) {
        this.hitCount++;
        pl.damage(16, car.x, car.lane.z);
        pl.vz += (pz >= car.lane.z ? 1 : -1) * 6;
        G.audio.sfx('horn');
        G.hud.toast('WATCH THE TRAFFIC!', 'red');
      }
    }
    // crossing objective
    if (pz < -7.4) { this.sideSeen = 'N'; this.hitCount = 0; }
    if (this.sideSeen === 'N' && pz > 7.6 && !G.hud.objDone('cross')) {
      G.hud.completeObj('cross');
      if (this.hitCount === 0) {
        pl.inv.coins += 20;
        G.hud.toast('SAFE CROSSING +20 COINS', 'gold');
        G.fx.text(new THREE.Vector3(px, 2.3, pz), '+20', 'gold');
      }
      G.hud.setWaypoint({ x: 55, z: 10.5 });
      this.sideSeen = 'S';
    }
    if (pz < -7 && px > -48 && px < -32 && !this.hintCross) {
      this.hintCross = true;
      G.hud.say('AARAV', 'Wait for the WALK signal before crossing.');
    }
    // scripted events
    for (const e of this.events) if (!e.done && px > e.x) { e.done = true; e.fn(); }
    // police car
    const P = this.police;
    if (P.active) {
      P.x += 26 * dt;
      P.root.position.set(P.x, 0, -1.75);
      P.root.visible = Math.abs(P.x - px) < 120;
      P.t += dt;
      const on = Math.floor(P.t * 6) % 2 === 0;
      P.r.material.opacity = on ? 1 : 0.1;
      P.b.material.opacity = on ? 0.1 : 1;
      if (P.x > 220) { P.active = false; P.root.visible = false; }
    }
    // siren light + atmosphere
    const lv = this.flickerLevel;
    this.siren.position.set(px + 18, 6, 0);
    const alt = Math.floor(t * 2.5) % 2 === 0;
    this.siren.color.setHex(alt ? 0xff0030 : 0x2040ff);
    this.siren.intensity = lv > 0.3 ? 12 * Math.PI * (lv - 0.2) : 0;
    this.scene.backgroundIntensity = 1 - 0.35 * lv;
    this.scene.fog.color.setHex(lv > 0.5 ? 0x2a0630 : 0x1a0a3d);
    this.lights.hemi.color.setHex(lv > 0.5 ? 0xb06cff : 0x7a6cff);
    // NPCs + culling
    for (const n of this.npcs) {
      n.update(dt, pl, t);
      n.rig.root.visible = Math.abs(n.pos.x - px) < 75 && Math.abs(n.pos.z - pz) < 60;
      if (n.mode === 'flee' && (n.pos.x > 70 || n.pos.x < -105)) { n.pos.x = n.dir > 0 ? -95 : 58; }
    }
    this._cullT = (this._cullT || 0) + dt;
    if (this._cullT > 0.25) {
      this._cullT = 0;
      for (const b of this.buildings) b.visible = Math.abs(b.userData.x - px) < 125;
      for (const l of this.lamps) l.visible = Math.abs(l.userData.x - px) < 110;
    }
    for (const b of this.buildings) if (b.userData.beacon) b.userData.beacon.material.opacity = Math.sin(t * 4) > 0 ? 0.9 : 0.15;
    this.coins.update(dt, pl);
    this.stopBeam.material.opacity = 0.18 + Math.sin(t * 3) * 0.06;
    // finish
    if (!this.finished && px > 51.5 && pz > 6 && !pl.dead) this._finish();
  }

  async _finish() {
    this.finished = true;
    const pl = G.player;
    pl.locked = true;
    pl.auto = null;
    G.hud.completeObj('stop');
    G.audio.sfx('win');
    G.hud.banner('CHAPTER 2 COMPLETE', 'THE BUS STOP', 2600);
    if (!await this.wait(2.7)) return;
    G.nextChapter(3);
  }

  mapData() {
    const p = super.mapData();
    p.push({ x: 55, z: 10.5, c: C.cyan, s: 'd' });
    return p;
  }

  exit() {
    G.audio.sirenOn(false);
    G.hud.redAlert(false);
    G.player.rig.root.removeFromParent();
  }
}
