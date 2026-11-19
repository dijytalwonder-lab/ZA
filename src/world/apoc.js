import * as THREE from 'three';
import { Stage, LOOT } from './stage.js';
import { G } from '../core/state.js';
import { C, nbox, glow, glowSign, beam, basic, cylGeo, boxGeo } from '../core/kit.js';
import { addLights, addGround, addBuildings, addSkyline, addLamps, addHoloAd, makeCar } from './cityKit.js';
import { makeBusExterior } from './busstop.js';
import { NPC } from '../entities/npc.js';
import { mulberry, pick } from '../core/util.js';

/* wrecked cars: x, z, rotY, colour, burning */
const CARS = [
  [-108, -4.6, 0.25, C.pink, 0], [-100, 4.4, -0.35, C.cyan, 1], [-92, -2.2, 1.15, C.violet, 0], [-85, 5.6, 0.1, C.blue, 0], [-76, -5.5, -0.25, C.hot, 0],
  [-62, 3.2, 0.4, C.cyan, 0], [-55, -5.2, -0.6, C.pink, 1], [-30, 6.0, 0.3, C.violet, 1], [-24, -4.2, 1.4, C.blue, 0], [-17, 2.6, 0.7, C.hot, 0],
  [10, -4.5, 1.57, C.pink, 0], [13, 0.2, 1.7, C.cyan, 0], [11, 4.6, 1.45, C.violet, 1], [-2, 5.4, -0.4, C.blue, 0],
  [24, -3.0, 0.2, C.hot, 1], [34, 4.5, 2.9, C.cyan, 0], [42, -5.0, 0.6, C.pink, 0], [48, 1.0, -0.1, C.violet, 0],
  [60, -5.0, 0.3, C.blue, 1], [68, 5.0, 2.1, C.cyan, 0], [80, -3.0, 0.9, C.hot, 1], [88, 4.0, -0.5, C.pink, 0], [96, -5.0, 1.2, C.violet, 1], [104, 2.0, 0.2, C.blue, 0]
];
const DUMPSTERS = [[-84, -10.4], [-46, 10.4], [-14, -10.4], [22, 10.4], [46, -10.4], [74, 10.4]];
const CRATES = [[-106, -10.8], [-62, 10.8], [-6, -10.8], [30, -10.8], [58, 10.8], [66, -10.8], [90, 10.8]];
/* idle (stealth) zombies per zone: type, x, z */
const ZONES = [
  [['walker', -100, 3], ['walker', -90, -4], ['walker', -80, 6]],
  [['walker', -58, -3], ['walker', -50, 6], ['walker', -44, -2], ['runner', -36, 3], ['walker', -28, -7], ['runner', -21, 7], ['spitter', -15, -2]],
  [['walker', 0, 3], ['walker', 6, -3], ['screamer', 20, 1], ['walker', 28, -6], ['walker', 31, 6], ['walker', 38, -2], ['spitter', 44, 4]]
];
/* auto-pickup loot per zone: type, x, z */
const LOOTS = [
  [['ammo', -110, 3], ['bottle', -104, -4], ['food', -88, 8], ['medkit', -74, -8]],
  [['ammo', -64, -8], ['ammo', -52, 9], ['medkit', -34, 9], ['food', -24, -9], ['bottle', -12, 4], ['shells', -40, -9]],
  [['ammo', -4, 9], ['shells', 6, 10], ['shells', 14, -9], ['medkit', 24, 9], ['ammo', 34, -9], ['food', 40, 9], ['bottle', 48, -8]],
  [['ammo', 58, 9], ['shells', 64, -9], ['medkit', 70, 9], ['ammo', 78, -9], ['shells', 84, 9], ['food', 92, -9], ['medkit', 98, 9]]
];
const CP_SPAWN = [[-121, 1.5], [-64, 9], [-6, -9], [52, -9]];
const MART_X = 111.5;

export class ApocStage extends Stage {
  constructor() {
    super('apoc');
    this.chapter = 5;
    this.stealthy = true;
    this.combat = true;
    this.flickerLevel = 0.85;
    this.bounds = { minX: -126, maxX: 121, minZ: -13.6, maxZ: 13.6 };
    this.mapRange = 34;
    this.enemyActiveRange = 75;
    this.spawn = { x: -121, z: 1.5, yaw: Math.PI / 2 };
    this.camCfg = { dist: 5.4, height: 1.5, minPitch: 0.08, maxPitch: 1.1, fov: 62, bounds: null, block: (p) => this._camBlocked(p) };
    this.cp = 0;
    this.cars = [];
    this.crates = [];
    this.hides = [];
    this.hints = {};
    this.fireSpots = [];
    this.arenaStarted = false;
    this.arenaCleared = false;
    this.arenaZ = [];
    this.arenaWave = 0;
    this.finished = false;
    this.hideAt = 0;
    this._spotted = null;
  }

  _camBlocked(p) {
    for (const c of this.colliders) {
      if (p.y < c.h && p.x > c.minX - 0.15 && p.x < c.maxX + 0.15 && p.z > c.minZ - 0.15 && p.z < c.maxZ + 0.15) return true;
    }
    return false;
  }

  /* ================= build ================= */
  async load() {
    this.skyScene(0x2a0a46, 0.021); // heavy purple fog
    this.scene.backgroundIntensity = 0.42;
    this.lights = addLights(this, { sky: 0x6a4cff, ground: 0x140828, hemi: 0.62, dirColor: 0x8a6cff, dir: 0.3, dirPos: [-40, 60, 30] });
    this.pLight = new THREE.PointLight(0x9a7cff, 4.5 * Math.PI, 10, 1.6);
    this.scene.add(this.pLight);
    this.siren = new THREE.PointLight(0xff0030, 0, 45, 1.4);
    this.scene.add(this.siren);

    addGround(this, -240, 220);
    addSkyline(this, 0, 8, 220);
    this.buildings = addBuildings(this, { x0: -230, x1: 210, seed: 58, minH: 16, maxH: 52, gaps: [{ side: 1, x0: 99, x1: 123 }] });
    this.lamps = addLamps(this, -220, 200, 20);
    this._ruin();
    this._wrecks();
    this._props();
    this._hideSpots();
    this._crates();
    this._weaponSpots();
    this._mart();
    this._corpses();
    // street ends
    this.addCollider(-140, -126.5, -14, 14, 50);
    this.addCollider(121.6, 140, -14, 14, 50);
  }

  /** Burning, darkened buildings + fire lights. */
  _ruin() {
    const rng = mulberry(91);
    const fireX = [[-105, -1], [-64, 1], [-18, -1], [28, 1], [70, -1], [92, 1]];
    const chosen = new Set();
    for (const [fx, side] of fireX) {
      let best = null, bd = 1e9;
      for (const b of this.buildings) {
        if (Math.sign(b.position.z) !== side) continue;
        const d = Math.abs(b.userData.x - fx);
        if (d < bd) { bd = d; best = b; }
      }
      if (best) {
        chosen.add(best);
        const l = new THREE.PointLight(0xff5a1a, 7 * Math.PI, 17, 1.6);
        l.position.set(best.userData.x, 3.5, side * 9.5);
        this.scene.add(l);
        this.flickerLight(l, 0.35);
        this.fireSpots.push({ x: best.userData.x, z: side * 9.5 });
      }
    }
    for (const b of this.buildings) {
      const r = rng();
      const body = b.children[0];
      if (r < 0.45 && body.material && Array.isArray(body.material)) {
        body.material.forEach((m) => { if (m.map) m.color.setScalar(0.32 + rng() * 0.2); }); // power cut
      }
      if (chosen.has(b) || r > 0.78) this._flames(b);
    }
  }
  _flames(b) {
    const side = Math.sign(b.position.z);
    const gp = b.children[0].geometry.parameters;
    const faceZ = -side * (Math.abs(b.position.z) - 14 + 0.3);
    const n = 3 + ((rng2() * 3) | 0);
    for (let k = 0; k < n; k++) {
      const col = pick([0xff6a1a, 0xff3a14, 0xffa02a]);
      const size = 3 + rng2() * 4;
      const s = glow(col, size, 0.8);
      s.position.set((rng2() - 0.5) * gp.width * 0.8, 3 + rng2() * Math.min(gp.height * 0.65, 14), faceZ);
      b.add(s);
      const ph = rng2() * 6;
      this.updaters.push((dt, t) => {
        const v = size * (0.8 + 0.3 * Math.sin(t * 9 + ph) + 0.12 * Math.sin(t * 23 + ph * 2));
        s.scale.set(v, v * 1.25, 1);
      });
    }
  }

  _wrecks() {
    // the crashed bus the player escaped from + a wrecked bus blocking the road
    const crash = makeBusExterior();
    crash.position.set(-122, 0, -3.6);
    crash.rotation.y = 0.12;
    this.scene.add(crash);
    this._boxCollider(-122, -3.6, 0.12, 11, 2.7, 3.2);
    const smoke = glow(0xff7a2a, 5, 0.5); smoke.position.set(-118, 2.8, -3.6); this.scene.add(smoke);
    const bus = makeBusExterior();
    bus.position.set(-40, 0, 0);
    bus.rotation.y = Math.PI / 2 - 0.25;
    bus.rotation.z = 0.04;
    this.scene.add(bus);
    this._boxCollider(-40, 0, Math.PI / 2 - 0.25, 11, 2.7, 3.2);
    this._fire(-40, 3.6, 0, 3.2);
    for (const [x, z, ry, col, burn] of CARS) {
      const car = makeCar(col, 'car');
      car.position.set(x, -0.04, z);
      car.rotation.y = ry;
      car.rotation.z = (rng2() - 0.5) * 0.25;
      this.scene.add(car);
      this.cars.push(car);
      car.userData.x = x;
      this._boxCollider(x, z, ry, 4.4, 1.9, 1.4);
      if (burn) this._fire(x, 1.4, z, 2.4);
    }
    // the police car carrying the first gun
    const cop = makeCar(C.blue, 'car');
    cop.position.set(-96, -0.02, 6.2);
    cop.rotation.y = 0.15;
    this.scene.add(cop);
    this.cars.push(cop);
    cop.userData.x = -96;
    this._boxCollider(-96, 6.2, 0.15, 4.4, 1.9, 1.4);
    const r = glow(C.red, 3, 1), b = glow(C.blue, 3, 1);
    r.material = r.material.clone(); b.material = b.material.clone();
    r.position.set(-0.3, 1.9, 0.5); b.position.set(-0.3, 1.9, -0.5);
    cop.add(r, b);
    this.updaters.push((dt, t) => { const on = Math.floor(t * 5) % 2 === 0; r.material.opacity = on ? 1 : 0.1; b.material.opacity = on ? 0.1 : 1; });
  }
  _boxCollider(x, z, ry, L, W, h) {
    const c = Math.abs(Math.cos(ry)), s = Math.abs(Math.sin(ry));
    this.addBoxCollider(x, z, c * L + s * W, s * L + c * W, h);
  }
  _fire(x, y, z, size) {
    const a = glow(0xff6a1a, size * 1.5, 0.85), b = glow(0xffd27a, size * 0.7, 0.8);
    a.position.set(x, y + 0.2, z); b.position.set(x, y, z);
    this.scene.add(a, b);
    const ph = rng2() * 6;
    this.updaters.push((dt, t) => {
      const v = 0.85 + 0.25 * Math.sin(t * 10 + ph) + 0.1 * Math.sin(t * 27 + ph);
      a.scale.set(size * 1.5 * v, size * 1.9 * v, 1);
      b.scale.set(size * 0.7 * v, size * 0.9 * v, 1);
    });
    // embers drifting up (only near the player)
    let acc = 0;
    this.updaters.push((dt) => {
      acc += dt;
      if (acc < 0.22) return;
      acc = 0;
      const pl = G.player;
      if (Math.abs(pl.pos.x - x) < 38) G.fx.burst(x + (Math.random() - 0.5), y + 0.4, z + (Math.random() - 0.5), C.orange, 2, 0.8, 1.6, -1.4);
    });
  }

  _props() {
    // broken holo-ads: dead screens, error text
    const ads = [
      [-98, 6, -11.5, ['ERR', 'NO SIGNAL'], C.red, 0], [-70, 6, 12.0, ['CITY', 'ALERT', 'EVACUATE'], C.red, Math.PI],
      [-32, 5.6, -11.5, ['SYSTEM', 'FAILURE'], C.pink, 0], [0, 6, 12.0, ['GUN', 'SHOP', 'OPEN'], C.orange, Math.PI],
      [38, 6, -11.5, ['ERR', '404', 'CITY'], C.violet, 0], [82, 6, 12.0, ['RUN', 'THEY', 'COME'], C.red, Math.PI]
    ];
    for (const [x, y, z, lines, col, ry] of ads) {
      const p = addHoloAd(this, x, y, z, lines, col, ry, 3.6, 2.4);
      p.rotation.z = (rng2() - 0.5) * 0.3;
      this.flicker(p.userData.mat, 1.6);
    }
    // debris: barrels, sandbags, crates
    const spots = [[-114, 7, 'sand'], [-70, -9, 'barrel'], [-72, 9, 'barrel'], [-38, 9, 'sand'], [-33, -9.5, 'crate'], [0, -9, 'sand'], [12, 10.4, 'sand'], [12, -10.4, 'sand'], [27, 9, 'barrel'], [52, 9.5, 'crate'], [76, -9.5, 'barrel'], [86, 9, 'sand'], [100, -9, 'crate'], [106, 8, 'barrel']];
    for (const [x, z, kind] of spots) {
      if (kind === 'barrel') {
        const m = new THREE.Mesh(cylGeo(0.4, 0.4, 1.0, 10), basic(0x5a2a1a));
        m.position.set(x, 0.5, z);
        this.scene.add(m);
        const t = new THREE.Mesh(cylGeo(0.42, 0.42, 0.06, 10), basic(C.orange));
        t.position.set(x, 1.02, z);
        this.scene.add(t);
        this.addBoxCollider(x, z, 0.8, 0.8, 1.0);
      } else if (kind === 'sand') {
        const m = nbox(2.6, 0.9, 0.8, 0x3a3050, C.violet);
        m.position.set(x, 0.45, z);
        m.rotation.y = (rng2() - 0.5) * 0.4;
        this.scene.add(m);
        this.addBoxCollider(x, z, 2.7, 0.9, 0.9);
      } else {
        const m = nbox(1.3, 1.1, 1.3, 0x2a1a40, C.orange);
        m.position.set(x, 0.55, z);
        m.rotation.y = rng2();
        this.scene.add(m);
        this.addBoxCollider(x, z, 1.5, 1.5, 1.1);
      }
    }
    // red emergency beacons on the lamp line
    this.beacons = [];
    for (let x = -110; x <= 110; x += 44) {
      const g = glow(C.red, 6, 0.9);
      g.material = g.material.clone();
      g.position.set(x, 6.4, (x / 44 | 0) % 2 ? 7.4 : -7.4);
      this.scene.add(g);
      this.beacons.push(g);
    }
  }

  _hideSpots() {
    for (const [x, z] of DUMPSTERS) {
      const m = nbox(2.1, 1.25, 1.1, 0x16301e, C.green);
      m.position.set(x, 0.62, z);
      this.scene.add(m);
      const lid = nbox(2.15, 0.1, 1.15, 0x0e2014, C.green);
      lid.position.set(x, 1.3, z);
      lid.rotation.z = 0.06;
      this.scene.add(lid);
      this.addBoxCollider(x, z, 2.1, 1.1, 1.3);
      const spot = { x, z, out: z < 0 ? 1.9 : -1.9 };
      this.hides.push(spot);
      this.addInteractable({
        x, z, r: 2.1, y: 1.0, color: C.green, label: 'HIDE (STEALTH)',
        enabled: () => !G.player.hidden && !G.player.dead,
        onUse: () => this._hide(spot)
      });
    }
  }

  _crates() {
    const rng = mulberry(33);
    for (const [x, z] of CRATES) {
      const m = nbox(1.0, 0.9, 1.0, 0x3a2418, C.yellow);
      m.position.set(x, 0.45, z);
      this.scene.add(m);
      this.addBoxCollider(x, z, 1.1, 1.1, 0.9);
      const crate = { x, z, m, opened: false, loot: [pick(['ammo', 'ammo', 'shells', 'food', 'bottle'], rng), pick(['medkit', 'ammo', 'food', 'shells'], rng)] };
      this.crates.push(crate);
      crate.it = this.addInteractable({
        x, z, r: 1.9, y: 0.9, color: C.yellow, label: 'SEARCH CRATE',
        enabled: () => !crate.opened,
        onUse: () => this._search(crate)
      });
    }
  }
  _search(c) {
    c.opened = true;
    c.it.remove();
    c.m.rotation.z = 0.2;
    c.m.position.y = 0.4;
    G.audio.sfx('door');
    G.fx.burst(c.x, 1, c.z, C.yellow, 12, 3, 0.5, 4);
    this.makeNoise(c.x, c.z, 6);
    c.loot.forEach((t, i) => this.addLoot(t, c.x + (i ? 1.1 : -1.1), c.z + (c.z < 0 ? 1.4 : -1.4), 9));
    G.hud.toast('FOUND SUPPLIES', 'gold');
  }

  _weaponSpots() {
    // pistol on the police car
    const gunGlow = glow(C.cyan, 1.6, 0.9);
    gunGlow.position.set(-96, 1.6, 8.7);
    this.scene.add(gunGlow);
    this.addInteractable({
      x: -96, z: 8.7, r: 1.9, y: 1.0, color: C.cyan, label: 'TAKE SERVICE PISTOL',
      enabled: () => !G.player.inv.pistol,
      onUse: () => {
        const pl = G.player;
        pl.inv.pistol = true;
        pl.inv.ammo = Math.min(60, pl.inv.ammo + 14);
        pl.setWeapon('pistol');
        G.audio.sfx('pickup');
        G.hud.toast('PISTOL +14 AMMO', 'gold');
        G.hud.completeObj('weapon');
        G.hud.setWaypoint({ x: MART_X, z: 12 });
        G.hud.say('', 'Gunshots are LOUD. Zombies come running. Crouch (C) and use melee to stay quiet.');
      }
    });
    // gun shop with the shotgun
    const gs = glowSign('GUN SHOP', C.orange, 4.4);
    gs.position.set(4, 4.2, 13.86);
    gs.rotation.y = Math.PI;
    this.scene.add(gs);
    this.flicker(gs.userData.mat, 0.8);
    const counter = nbox(2.4, 1.0, 0.8, 0x2a1a40, C.orange);
    counter.position.set(4, 0.5, 11.9);
    this.scene.add(counter);
    this.addBoxCollider(4, 11.9, 2.5, 0.9, 1.0);
    const sg = new THREE.Mesh(boxGeo(0.9, 0.08, 0.14), basic(C.orange));
    sg.position.set(4, 1.08, 11.9);
    this.scene.add(sg);
    const g2 = glow(C.orange, 2, 0.9);
    g2.position.set(4, 1.3, 11.9);
    this.scene.add(g2);
    this.addInteractable({
      x: 4, z: 10.4, r: 1.9, y: 1.0, color: C.orange, label: 'TAKE ARC SHOTGUN',
      enabled: () => !G.player.inv.shotgun,
      onUse: () => {
        const pl = G.player;
        pl.inv.shotgun = true;
        pl.inv.shells = Math.min(24, pl.inv.shells + 8);
        pl.setWeapon('shotgun');
        G.audio.sfx('pickup');
        G.hud.toast('ARC SHOTGUN +8 SHELLS', 'gold');
        G.hud.say('', 'The shotgun is devastating up close. Switch weapons with the weapon panel (X).');
      }
    });
  }

  _mart() {
    const body = nbox(22, 9, 20, 0x14103a, C.green);
    body.position.set(111, 4.5, 24);
    this.scene.add(body);
    this.addCollider(99, 123, 14, 40, 9);
    const glass = new THREE.Mesh(boxGeo(16, 3.4, 0.1), basic(0x2aff9a, { opacity: 0.18 }));
    glass.position.set(111, 2, 13.95);
    this.scene.add(glass);
    const sign = glowSign('CITY MART', C.green, 10, { h: 150 });
    sign.position.set(111, 6.4, 13.8);
    sign.rotation.y = Math.PI;
    this.scene.add(sign);
    this.flicker(sign.userData.mat, 0.6);
    const sg = glow(C.green, 16, 0.4);
    sg.position.set(111, 4, 12.5);
    this.scene.add(sg);
    this.shutter = nbox(4.6, 3.2, 0.25, 0x2a2a55, C.red);
    this.shutter.position.set(MART_X, 1.6, 13.85);
    this.scene.add(this.shutter);
    this.martBeam = beam(C.green, 20, 0.9);
    this.martBeam.position.set(MART_X, 10, 11.6);
    this.scene.add(this.martBeam);
    this.martIt = this.addInteractable({
      x: MART_X, z: 12.2, r: 2.4, y: 1.4, color: C.green,
      label: () => (this.arenaCleared ? 'ENTER CITY MART' : 'CLEAR THE PLAZA FIRST'),
      enabled: () => !this.finished,
      onUse: () => {
        if (!this.arenaCleared) { G.audio.sfx('error'); G.hud.toast('THE SHUTTER IS LOCKED - CLEAR THE PLAZA', 'red'); return; }
        this._finish();
      }
    });
  }

  _corpses() {
    const rng = mulberry(14);
    for (let i = 0; i < 11; i++) {
      const x = -112 + i * 22 + (rng() - 0.5) * 10;
      const z = (rng() < 0.5 ? -1 : 1) * (8 + rng() * 4);
      const n = new NPC({ x, z, mode: 'collapse', yaw: rng() * 6.28 });
      n.rig.p.lie = 1; n.rig.s.lie = 1;
      this.addNPC(n);
    }
  }

  /* hiding (_hide / _unhide / onFound) lives in Stage */

  /* ================= zones / waves ================= */
  _spawnZone(i) {
    for (const [type, x, z] of ZONES[i]) {
      this.addZombie(type, x, z, { idle: true, stealth: true, sight: type === 'screamer' ? 15 : 12 });
    }
  }
  _cp(n) {
    if (this.cp >= n) return;
    this.cp = n;
    G.saveCheckpoint({ chapter: 5, stage: 'apoc', cp: n });
    G.hud.toast('CHECKPOINT', 'cyan');
  }
  _ambush(list) {
    for (const [type, x, z] of list) {
      const zb = this.addZombie(type, x, z, {});
      zb.stagger(0.6);
      this.arenaZ.push(zb);
      G.fx.burst(x, 1, z, C.red, 14, 3, 0.6, 3);
      G.fx.ring(x, 0, z, C.red, 3, 0.5);
    }
    G.audio.sfx('scream');
  }
  _arenaStep() {
    const pl = G.player;
    if (!this.arenaStarted && pl.pos.x > 62) {
      this.arenaStarted = true;
      this.arenaWave = 1;
      G.hud.banner('THE BURNING PLAZA', 'THEY ARE COMING', 2600);
      G.hud.redAlert(true);
      G.audio.setMood('combat');
      this._ambush([['walker', 82, -4], ['walker', 86, 5], ['walker', 90, 0], ['runner', 96, -6], ['runner', 98, 6]]);
      return;
    }
    if (!this.arenaStarted || this.arenaCleared) return;
    if (this.arenaZ.every((z) => !z.alive)) {
      if (this.arenaWave === 1) {
        this.arenaWave = 2;
        this.arenaZ = [];
        G.hud.banner('SECOND WAVE', 'BRUTE INCOMING', 2200);
        this._ambush([['brute', 98, 0], ['spitter', 92, -7], ['spitter', 94, 7]]);
      } else if (this.arenaWave === 2) {
        this.arenaWave = 3;
        this.arenaCleared = true;
        G.hud.completeObj('plaza');
        G.hud.redAlert(false);
        pl.heal(40);
        G.hud.banner('PLAZA CLEAR', 'THE MART SHUTTER IS OPEN', 2600);
        G.audio.sfx('win');
        this.tween(1.4, (k) => { this.shutter.position.y = 1.6 + 3.3 * k; });
        G.hud.setWaypoint({ x: MART_X, z: 12 });
      }
    }
  }
  onEnemyDeath(z) {
    if (Math.random() < 0.3) this.addLoot(pick(['ammo', 'ammo', 'food', 'bottle', 'shells']), z.pos.x, z.pos.z, 9);
  }

  async _finish() {
    this.finished = true;
    const pl = G.player;
    pl.locked = true;
    G.hud.completeObj('mart');
    G.audio.sfx('win');
    G.hud.banner('CHAPTER 5 COMPLETE', 'ZOMBIE APOCALYPSE IN THE CITY', 2800);
    if (!await this.wait(2.9)) return;
    G.hud.fade(true);
    if (!await this.wait(0.9)) return;
    G.finishChapters(5);
  }

  /* ================= life cycle ================= */
  async enter(opts = {}) {
    const pl = G.player;
    this.scene.add(pl.rig.root);
    const cp = opts.cp ?? 0;
    this.cp = cp;
    const [sx, sz] = CP_SPAWN[Math.min(cp, 3)];
    pl.reset(sx, sz, Math.PI / 2);
    if (opts.restore) pl.restore(opts.restore);
    const r = pl.rig;
    r.shirtMat.color.setHex(0x14124a);
    r.setColors(null, pl.accent, null);
    r.stripes.forEach((s) => { s.visible = true; });
    r.pantsMat.color.setHex(0x0d0d2b);
    const inv = pl.inv;
    pl.setWeapon(inv.pistol ? 'pistol' : inv.rod ? 'rod' : inv.backpack ? 'bag' : 'fists');
    pl.syncHeld();
    G.hud.setCombat(true);
    G.hud.setTag('CHAPTER 5 · ZOMBIE APOCALYPSE');
    G.camRig.configure(this.camCfg);
    G.camRig.yaw = -Math.PI / 2;
    G.camRig.pitch = 0.3;
    G.fx.setMotes(true, new THREE.Vector3(46, 14, 46));
    G.audio.setMood('tense');
    G.audio.sirenOn(true, 0.03);
    G.hud.setObjectives('SURVIVE THE CITY', [
      { id: 'weapon', text: 'Find a weapon' },
      { id: 'street', text: 'Sneak or fight through the streets' },
      { id: 'plaza', text: 'Clear the burning plaza' },
      { id: 'mart', text: 'Reach City Mart' }
    ]);
    if (inv.pistol) G.hud.completeObj('weapon', true);
    if (cp >= 3) G.hud.completeObj('street', true);
    G.hud.setWaypoint(inv.pistol ? { x: MART_X, z: 12 } : { x: -96, z: 8.7 });
    // loot + zombies for the zones still ahead of the checkpoint
    LOOTS.forEach((list, zi) => { if (zi >= cp) list.forEach(([t, x, z]) => this.addLoot(t, x, z, zi)); });
    for (let i = 0; i < 3; i++) if (i >= cp) this._spawnZone(i);
    if (cp >= 3) this._arenaPending = true;
    G.saveCheckpoint({ chapter: 5, stage: 'apoc', cp });
    G.hud.fade(false);
    G.hud.banner('CHAPTER 5', 'ZOMBIE APOCALYPSE IN THE CITY', 3200);
    if (cp === 0) {
      G.hud.sayLines([
        ['AARAV', 'The whole city... it is burning.'],
        ['AARAV', 'They hunt by sight and sound. Stay low, stay quiet. Crouch with C.'],
        ['', 'Find a weapon. Police car, up ahead on the right.']
      ]);
    }
  }

  update(dt) {
    const pl = G.player;
    if (pl.hidden && this.time - this.hideAt > 0.5 && (G.input.consume('interact') || Math.hypot(G.input.mx, G.input.my) > 0.4)) this._unhide();
    this.baseUpdate(dt);
    const px = pl.pos.x, pz = pl.pos.z, t = this.time;
    this.pLight.position.set(px, 3.2, pz + 1);
    // checkpoints
    if (px > -66) this._cp(1);
    if (px > -8) this._cp(2);
    if (px > 54) { this._cp(3); G.hud.completeObj('street', true); }
    this._arenaStep();
    // first-time hints
    if (!this.hints.dumpster && this.cp <= 1 && px > -92 && px < -76) { this.hints.dumpster = true; G.hud.say('', 'Dumpsters let you HIDE. Zombies lose track of you.'); }
    // stealth indicator + music
    let spotted = false, caution = false;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (e.aware) spotted = true;
      else if (e.stealth && (e.alert > 0.25 || e.state === 'investigate')) caution = true;
    }
    G.hud.setStealth(pl.hidden ? 'HIDDEN' : spotted ? 'SPOTTED' : caution ? 'CAUTION' : 'UNSEEN');
    if (spotted !== this._spotted) { this._spotted = spotted; G.audio.setMood(spotted ? 'combat' : 'tense'); }
    // corpses + culling
    for (const n of this.npcs) { n.update(dt, pl, t); n.rig.root.visible = Math.abs(n.pos.x - px) < 70; }
    this._cullT = (this._cullT || 0) + dt;
    if (this._cullT > 0.25) {
      this._cullT = 0;
      for (const b of this.buildings) b.visible = Math.abs(b.userData.x - px) < 125;
      for (const l of this.lamps) l.visible = Math.abs(l.userData.x - px) < 110;
      for (const c of this.cars) c.visible = Math.abs(c.userData.x - px) < 110;
    }
    for (const b of this.buildings) if (b.userData.beacon) b.userData.beacon.material.opacity = Math.sin(t * 4) > 0 ? 0.9 : 0.15;
    // red warning beacons + siren glow
    const on = Math.sin(t * 5) > 0;
    this.beacons.forEach((g, i) => { g.material.opacity = (i % 2 ? on : !on) ? 0.95 : 0.1; });
    this.siren.position.set(px + 16, 6, 0);
    this.siren.color.setHex(Math.floor(t * 2.5) % 2 === 0 ? 0xff0030 : 0x2040ff);
    this.siren.intensity = 9 * Math.PI * (0.6 + 0.4 * Math.sin(t * 3));
    this.martBeam.material.opacity = 0.12 + Math.sin(t * 3) * 0.05;
  }

  mapData() {
    const pl = G.player.pos;
    const pois = [];
    for (const it of this.interactables) if (!it.removed && it.active && it.map !== false) pois.push({ x: it.x, z: it.z, c: it.color, s: 'd' });
    for (const e of this.enemies) if (e.alive && (e.aware || Math.hypot(e.pos.x - pl.x, e.pos.z - pl.z) < 14)) pois.push({ x: e.pos.x, z: e.pos.z, c: C.red, s: 'c' });
    for (const l of this.loot) pois.push({ x: l.x, z: l.z, c: LOOT[l.type].color, s: 'c' });
    return pois;
  }

  exit() {
    G.audio.sirenOn(false);
    G.hud.redAlert(false);
    G.hud.setStealth(null);
    const pl = G.player;
    pl.hidden = false;
    pl.hideSpot = null;
    pl.rig.root.visible = true;
    pl.rig.root.removeFromParent();
  }
}

// small deterministic rng for decoration (module-level so it is stable between builds)
const _r = mulberry(2026);
function rng2() { return _r(); }
