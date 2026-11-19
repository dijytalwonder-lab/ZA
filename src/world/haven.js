import * as THREE from 'three';
import { Stage, LOOT } from './stage.js';
import { G } from '../core/state.js';
import {
  C, nbox, led, glow, glowSign, basic, boxGeo, cylGeo, addEdges, windowTexture, roadTexture, sidewalkTexture,
  gridTexture, beam
} from '../core/kit.js';
import { addLights, addSkyline, addHoloAd, makeCar } from './cityKit.js';
import { makeBusExterior } from './busstop.js';
import { NPC } from '../entities/npc.js';
import { mulberry, pick, rand } from '../core/util.js';

/* ---------------- layout (x runs east -> west along the route, z is the street width) ----------------
   x  58 .. 38  service lot behind City Mart (start, workbench A)
   x  38 .. 14  back alley with two side alleys
   x  14 .. -34 rail yard (wagons, depot hut with workbench B and the supply cache)
   x -34 .. -62 ruined plaza
   x -62 .. -98 Metro Relief Station: three entrances to barricade (front gate, north window, loading door) */
const BOUNDS = { minX: -99, maxX: 58.5, minZ: -26.5, maxZ: 26.5 };
const CP_AT = [[55, 2], [12.5, 0], [-33, -4.5], [-67, 0], [-76, 0], [-88, -2]];
const BEACON = { x: -80, z: 0 };
const GATE = { x: -62, z: 0 };
const RADIO = { x: -94, z: 0 };
const WAVES = 3;
const PREP_TIME = 150;

/** The three station entrances. n = outward normal, t = tangent along the opening. */
const BAR_DEFS = [
  { id: 0, name: 'FRONT GATE', x: -62, z: 0, nx: 1, nz: 0, tx: 0, tz: 1, half: 3.5, at: [-64.8, 0] },
  { id: 1, name: 'NORTH WINDOW', x: -74, z: -14, nx: 0, nz: -1, tx: 1, tz: 0, half: 3, at: [-74, -11.4] },
  { id: 2, name: 'LOADING DOOR', x: -86, z: 14, nx: 0, nz: 1, tx: 1, tz: 0, half: 3, at: [-86, 11.4] }
];

/* idle (stealth) zombies per zone: type, x, z, options */
const ZONES = [
  [ // back alley
    ['walker', 33, -1.2, { patrol: [[34, -1.2], [19, -1.2]] }],
    ['walker', 28, -12, { still: true, yaw: 0 }],
    ['runner', 20.5, 2.6, { still: true, yaw: -Math.PI / 2 }],
    ['spitter', 28, 14, { still: true, yaw: Math.PI }]
  ],
  [ // rail yard
    ['brute', -7, -7, { patrol: [[-7, -7], [7, -7], [7, 8], [-7, 8]] }],
    ['walker', -8, 18, { patrol: [[-8, 18], [6, 18]] }],
    ['walker', -21, 6, { still: true, yaw: 1.2 }],
    ['walker', -9, -13, { still: true, yaw: 0.5 }],
    ['spitter', 10, -12, { still: true, yaw: -Math.PI / 2 }],
    ['screamer', -27, 7, { still: true, yaw: Math.PI / 2, sight: 13 }],
    ['runner', -22, -20, { still: true, yaw: 0 }]
  ],
  [ // ruined plaza
    ['walker', -44, 8, { still: true, yaw: 0.8 }],
    ['walker', -42, 11, { still: true, yaw: 2.3 }],
    ['walker', -46, 12, { still: true, yaw: -1 }],
    ['walker', -50, 14, { patrol: [[-50, 14], [-43, 14], [-43, 20], [-47, 20]] }],
    ['walker', -58, -8, { patrol: [[-58, -8], [-47, -8], [-47, -14], [-58, -14]] }],
    ['runner', -50, -4, { still: true, yaw: Math.PI }],
    ['spitter', -58, 8, { still: true, yaw: Math.PI }],
    ['screamer', -54, -6, { still: true, yaw: 2.0, sight: 13 }]
  ]
];
/* auto-pickup loot per zone (0 = lot, 1 = alley, 2 = yard, 3 = plaza): type, x, z */
const LOOTS = [
  [['ammo', 52, -9], ['wood', 49, -10], ['food', 41, -5], ['bottle', 43, 8]],
  [['bottle', 36, 2.5], ['scrap', 31, -2], ['ammo', 22, 2], ['wood', 19, -2.5], ['cloth', 27, -9], ['medkit', 28, 8]],
  [['ammo', 8, -13], ['shells', -5, 2], ['wood', -26, -4], ['scrap', -9, 16], ['medkit', -22, 12], ['bottle', 10, 10], ['ammo', -14, -18], ['cloth', -30, -12]],
  [['ammo', -38, -3], ['shells', -48, -9], ['food', -52, 3], ['medkit', -44, 15], ['wood', -40, 20], ['scrap', -56, -14], ['cloth', -36, 12], ['bottle', -60, 12]]
];
/* searchable crates: x, z, loot (given straight into the inventory) */
const CRATES = [
  [46, -12, [['wood', 2], ['scrap', 2]]], [46, 12, [['cloth', 2], ['wood', 2]]],
  [27, -19, [['ammo', 12], ['wood', 2]]], [29, -15.5, [['scrap', 2], ['cloth', 2]]],
  [27, 18, [['shells', 6], ['wood', 2]]], [29, 21.5, [['medkit', 1], ['scrap', 2]]],
  [4, -15, [['wood', 2], ['scrap', 2]]], [-22, -9, [['cloth', 2], ['ammo', 12]]],
  [-2, 11, [['wood', 2], ['shells', 6]]], [-25, 16, [['scrap', 2], ['cloth', 2]]],
  [-38, -21, [['ammo', 12], ['wood', 2]]], [-58, 17, [['shells', 6], ['cloth', 2]]], [-37, 7, [['scrap', 2], ['medkit', 1]]]
];
const DUMPSTERS = [[28, -24.2], [28, 25], [-36, -22.5], [-58, 22.5], [-60, -22.5]];
const BENCHES = [[48, -4.2, 'A', 48, -2.6], [-14.5, 1.4, 'B', -14.5, -0.2], [-84, -8.2, 'C', -84, -6.6]];

/* siege waves: [type, entrance index] */
const WAVE_LIST = [
  [['walker', 0], ['walker', 0], ['walker', 0], ['walker', 1], ['walker', 1], ['runner', 2], ['walker', 2]],
  [['walker', 0], ['walker', 0], ['spitter', 0], ['runner', 0], ['runner', 1], ['runner', 1], ['walker', 1], ['walker', 2], ['walker', 2], ['spitter', 2]],
  [['brute', 0], ['walker', 0], ['walker', 0], ['runner', 0], ['runner', 1], ['runner', 1], ['runner', 1], ['walker', 1], ['walker', 2], ['walker', 2], ['spitter', 2]]
];
const SPAWN_AT = [
  () => [-49 + rand(-3, 3), rand(-9, 9)],
  () => [-74 + rand(-6, 6), -21.5 + rand(-2, 2)],
  () => [-86 + rand(-6, 6), 21.5 + rand(-2, 2)]
];

export class HavenStage extends Stage {
  constructor() {
    super('haven');
    this.chapter = 7;
    this.stealthy = true;
    this.combat = true;
    this.lobThrow = true;
    this.flickerLevel = 0.5;
    this.bounds = BOUNDS;
    this.mapRange = 36;
    this.enemyActiveRange = 80;
    this.spawn = { x: CP_AT[0][0], z: CP_AT[0][1], yaw: -Math.PI / 2 };
    this.camCfg = {
      dist: 5.2, height: 1.5, minPitch: 0.08, maxPitch: 1.12, fov: 62,
      bounds: { minX: -100, maxX: 59.5, minZ: -27.6, maxZ: 27.6, minY: 0.6, maxY: 7.5 },
      block: (p) => this._camBlocked(p)
    };
    this.phase = 'route';     // route -> prep -> siege -> dawn
    this.cp = 0;
    this.wave = 0;
    this.waveZ = [];
    this.waveSpawning = false;
    this.lull = false;
    this.lullT = 0;
    this.prepT = PREP_TIME;
    this.nightQueued = false;
    this.bars = [];
    this.crates = [];
    this.hints = {};
    this.restocks = { meera: false, kabir: false };
    this.radioDone = false;
    this.finished = false;
    this.crafted = false;
    this.entered = false;
    this.gateCalled = false;
    this.dawnK = 0;
    this.waveOn = false;
    this.waveT = 0;
    this.gotStash = false;
    this._spotted = null;
    this._wpT = 0;
    this._secT = 0;
    this.cache = null;
    this.ambushDone = false;
    this.npcMap = {};
  }

  _camBlocked(p) {
    for (const c of this.colliders) {
      if (!c.off && p.y < c.h && p.x > c.minX - 0.15 && p.x < c.maxX + 0.15 && p.z > c.minZ - 0.15 && p.z < c.maxZ + 0.15) return true;
    }
    return false;
  }

  /* ================= build ================= */
  async load() {
    this.skyScene(0x14062e, 0.017);
    this.scene.backgroundIntensity = 0.45;
    this.lights = addLights(this, { sky: 0x6a4cff, ground: 0x1a0c34, hemi: 0.66, dirColor: 0x8a6cff, dir: 0.32, dirPos: [-30, 60, 30] });
    this.pLight = new THREE.PointLight(0x9a7cff, 4.2 * Math.PI, 10, 1.6);
    this.scene.add(this.pLight);
    this.fires = [];
    this._ground();
    this._skyline();
    this._alleyBlocks();
    this._lot();
    this._yard();
    this._plaza();
    this._station();
    this._barricades();
    this._benches();
    this._crates();
    this._dumpsters();
    this._cache();
    this._survivors();
    this._radio();
  }

  _put(m, x, y, z, ry = 0) { m.position.set(x, y, z); m.rotation.y = ry; this.scene.add(m); return m; }

  /** Solid box from bounds, with an optional collider. */
  _solid(x0, x1, z0, z1, h, color, edge, o = {}) {
    const m = nbox(x1 - x0, h, z1 - z0, color, edge);
    m.position.set((x0 + x1) / 2, h / 2, (z0 + z1) / 2);
    this.scene.add(m);
    if (o.collide !== false) this.addCollider(x0, x1, z0, z1, o.ch ?? h);
    return m;
  }

  /** A lit-window building block (the ruined city). */
  _block(x0, x1, z0, z1, h, o = {}) {
    const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const seed = Math.floor(Math.abs(cx * 7 + cz * 13)) + 11;
    const tA = windowTexture(Math.max(2, Math.round(w / 3)), Math.max(3, Math.round(h / 3.2)), seed);
    const tB = windowTexture(Math.max(2, Math.round(d / 3)), Math.max(3, Math.round(h / 3.2)), seed + 1, 1);
    const dim = o.dim ?? 0.42;
    const mk = (map) => { const m = new THREE.MeshBasicMaterial({ map }); m.color.setScalar(dim); return m; };
    const dark = basic(0x0a0722);
    const m = new THREE.Mesh(boxGeo(w, h, d), [mk(tB), mk(tB), dark, dark, mk(tA), mk(tA)]);
    m.position.set(cx, h / 2, cz);
    addEdges(m, o.edge ?? C.violet, 0.9);
    this.scene.add(m);
    if (o.collide !== false) this.addCollider(x0, x1, z0, z1, h);
    return m;
  }

  _ground() {
    const s = this.scene;
    const sw = sidewalkTexture();
    sw.repeat.set(180 / 4, 60 / 4);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(180, 60), new THREE.MeshStandardMaterial({ map: sw, roughness: 0.45, metalness: 0.35, envMapIntensity: 0.9 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(-20, 0.01, 0);
    s.add(ground);
    // the boulevard through the lot and the yard
    const rt = roadTexture();
    rt.repeat.set(92 / 16, 1);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(92, 14), new THREE.MeshStandardMaterial({ map: rt, roughness: 0.28, metalness: 0.55, envMapIntensity: 1.4 }));
    road.rotation.x = -Math.PI / 2;
    road.position.set(12, 0.02, 0);
    s.add(road);
    // far glowing grid
    const gt = gridTexture('#ff2bd6', '#07031a', 8);
    gt.repeat.set(220, 220);
    const far = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), new THREE.MeshBasicMaterial({ map: gt }));
    far.rotation.x = -Math.PI / 2;
    far.position.set(-20, -0.08, 0);
    s.add(far);
    // rail lines through the yard
    for (const z of [-22, -15, 13, 20]) {
      for (const dz of [-0.55, 0.55]) {
        const r = led(48, 0.05, 0.08, C.blue, 0.75);
        r.position.set(-10, 0.04, z + dz);
        s.add(r);
      }
    }
    // plaza ring
    const ring = new THREE.Mesh(new THREE.RingGeometry(5.2, 5.6, 40), basic(C.cyan, { opacity: 0.45, add: true, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(-48, 0.05, 0);
    s.add(ring);
  }

  _skyline() {
    addSkyline(this, -20, 21, 150);
    const rng = mulberry(7);
    // dim perimeter buildings behind the walkable area (no colliders: the bounds keep everyone inside)
    for (const side of [-1, 1]) {
      let x = -112;
      while (x < 62) {
        const w = 14 + rng() * 10, h = 18 + rng() * 22;
        const z0 = side < 0 ? -48 : 27.4, z1 = side < 0 ? -27.4 : 48;
        const b = this._block(x, x + w, z0, z1, h, { collide: false, edge: pick([C.pink, C.cyan, C.violet, C.blue], rng), dim: 0.3 + rng() * 0.25 });
        b.userData.x = x + w / 2;
        x += w + 0.5;
      }
    }
    this._block(-114, -99.4, -48, 48, 34, { collide: false, edge: C.pink, dim: 0.3 });
    // City Mart's back wall (where the loading dock opened)
    this._block(58.8, 84, -48, 48, 14, { collide: false, edge: C.green, dim: 0.35 });
    const ds = glowSign('CITY MART · DELIVERIES', C.green, 6.5);
    this._put(ds, 58.6, 7.5, 2, -Math.PI / 2);
    this.flicker(ds.userData.mat, 0.7);
    const dock = led(0.1, 3.6, 5.2, C.green, 0.35);
    dock.position.set(58.55, 1.8, 0);
    this.scene.add(dock);
    const dg = glow(C.green, 9, 0.5);
    dg.position.set(57, 2, 0);
    this.scene.add(dg);
    // fires burning in the distance
    for (const [x, z, s] of [[-30, -27, 5], [30, 27, 4], [-62, 27, 5], [8, -27, 4]]) this._fire(x, 3, z, s, false);
  }

  _fire(x, y, z, size, light = true) {
    const a = glow(0xff6a1a, size * 1.5, 0.85), b = glow(0xffd27a, size * 0.7, 0.8);
    a.position.set(x, y + 0.2, z); b.position.set(x, y, z);
    this.scene.add(a, b);
    const ph = Math.random() * 6;
    this.updaters.push((dt, t) => {
      const v = 0.85 + 0.25 * Math.sin(t * 10 + ph) + 0.1 * Math.sin(t * 27 + ph);
      a.scale.set(size * 1.5 * v, size * 1.9 * v, 1);
      b.scale.set(size * 0.7 * v, size * 0.9 * v, 1);
    });
    if (light) {
      const l = new THREE.PointLight(0xff5a1a, 6 * Math.PI, 15, 1.6);
      l.position.set(x, y + 1.2, z);
      this.scene.add(l);
      this.flickerLight(l, 0.35);
    }
    this.fires.push({ x, z });
  }

  /** The back alley: two building rows with a side alley on each side. */
  _alleyBlocks() {
    const rows = [
      [30, 38, -27, -4, 22, C.pink], [14, 26, -27, -4, 27, C.cyan],
      [30, 38, 4, 27, 24, C.violet], [14, 26, 4, 27, 20, C.blue]
    ];
    for (const [x0, x1, z0, z1, h, edge] of rows) this._block(x0, x1, z0, z1, h, { edge, dim: 0.55 });
    // glowing signs on the alley walls
    const sg = (txt, col, x, y, z, ry) => { const m = glowSign(txt, col, 2.6); this._put(m, x, y, z, ry); this.flicker(m.userData.mat, 0.9); };
    sg('RAMEN', C.pink, 29.8, 4.4, -3.9, 0);
    sg('HOTEL', C.cyan, 20, 4.6, 3.9, Math.PI);
    sg('CLINIC', C.green, 34, 4.4, 3.9, Math.PI);
    sg('CAFE 24', C.yellow, 20, 4.2, -3.9, 0);
    this._fire(24, 0.5, -0.5, 2.0, false);
    const ag = glow(C.pink, 10, 0.4);
    ag.position.set(26, 3.2, 0);
    this.scene.add(ag);
  }

  /** Service lot behind City Mart: containers for cover and the first workbench. */
  _lot() {
    for (const [x0, x1, z0, z1, col] of [[40, 46, -20, -17.4, C.orange], [44, 52, 17, 19.6, C.cyan], [52, 55, -24, -21, C.violet], [38.5, 41, 10, 15, C.pink]]) {
      this._solid(x0, x1, z0, z1, 2.6, 0x1a1236, col);
      for (let i = 0; i < 4; i++) {
        const r = led(0.05, 2.3, 0.05, col, 0.6);
        r.position.set(x0 + 0.4 + i * (x1 - x0 - 0.8) / 3, 1.3, z0 - 0.03);
        this.scene.add(r);
      }
    }
    const fl = new THREE.PointLight(0xffb070, 5 * Math.PI, 20, 1.5);
    fl.position.set(48, 5.5, -2);
    this.scene.add(fl);
    const pole = new THREE.Mesh(cylGeo(0.08, 0.1, 5.5, 6), basic(0x2a2a50));
    pole.position.set(48, 2.75, -2);
    this.scene.add(pole);
    const lamp = glow(0xffb070, 5, 0.7);
    lamp.position.set(48, 5.5, -2);
    this.scene.add(lamp);
    this.flickerLight(fl, 0.25);
    this._fire(36, 0.5, 12, 1.8, false);
    addHoloAd(this, 56.5, 5, -12, ['BUY 1', 'GET 1'], C.pink, -Math.PI / 2, 3, 1.9);
  }

  /** Rail yard: freight wagons, a fence with a gate and the depot hut. */
  _yard() {
    const wagons = [
      [-2, 12, -20, -17, C.orange], [-26, -14, -14, -11, C.cyan], [-8, 6, 13, 16, C.pink], [-30, -20, 18, 21, C.violet],
      [-32, -29, 8, 16, C.blue], [-12, -4, -24, -21, C.green]
    ];
    for (const [x0, x1, z0, z1, col] of wagons) {
      this._solid(x0, x1, z0, z1, 3.0, 0x1a1030, col);
      const stripe = led(x1 - x0, 0.1, z1 - z0 + 0.08, col, 0.7);
      stripe.position.set((x0 + x1) / 2, 2.3, (z0 + z1) / 2);
      this.scene.add(stripe);
      if (x1 - x0 > z1 - z0) for (let x = x0 + 1.2; x < x1 - 0.5; x += 2.4) { const r = led(0.06, 2.4, 0.06, col, 0.55); r.position.set(x, 1.5, z0 - 0.04); this.scene.add(r); }
    }
    // fence between yard and plaza, gate gap z -3..3
    for (const [z0, z1] of [[-26.5, -3], [3, 26.5]]) this._solid(-34.5, -33.5, z0, z1, 3.4, 0x1a1030, C.red);
    for (const z of [-3.4, 3.4]) { const p = led(0.35, 4.2, 0.35, C.red, 0.9); p.position.set(-34, 2.1, z); this.scene.add(p); }
    const top = led(0.2, 0.2, 7.2, C.red, 0.8);
    top.position.set(-34, 4.2, 0);
    this.scene.add(top);
    const exit = glowSign('PLAZA EXIT', C.red, 3);
    this._put(exit, -33.2, 4.6, 0, Math.PI / 2);
    this.flicker(exit.userData.mat, 0.8);
    // depot hut (door faces east, gap z -1..1.2)
    const hx0 = -18, hx1 = -10, hz0 = -4, hz1 = 3;
    this._solid(hx0, hx1, hz0, hz0 + 0.5, 4.2, 0x1e1238, C.orange);
    this._solid(hx0, hx1, hz1 - 0.5, hz1, 4.2, 0x1e1238, C.orange);
    this._solid(hx0, hx0 + 0.5, hz0, hz1, 4.2, 0x1e1238, C.orange);
    this._solid(hx1 - 0.5, hx1, hz0, -1, 4.2, 0x1e1238, C.orange);
    this._solid(hx1 - 0.5, hx1, 1.2, hz1, 4.2, 0x1e1238, C.orange);
    const hs = glowSign('RAIL DEPOT', C.orange, 3.2);
    this._put(hs, -9.8, 3.6, 0.1, Math.PI / 2);
    this.flicker(hs.userData.mat, 0.7);
    const hl = new THREE.PointLight(0xffa050, 5 * Math.PI, 10, 1.6);
    hl.position.set(-14, 3.4, 0);
    this.scene.add(hl);
    this.flickerLight(hl, 0.4);
    // a few wrecks + junk as cover
    const rng = mulberry(55);
    for (const [x, z, ry, col] of [[-1, 2.5, 0.3, C.pink], [-26, 11, 1.4, C.cyan], [2, -12, 0.2, C.violet]]) {
      const car = makeCar(col, 'car');
      car.position.set(x, -0.04, z);
      car.rotation.y = ry;
      car.rotation.z = (rng() - 0.5) * 0.2;
      this.scene.add(car);
      this._boxCollider(x, z, ry, 4.4, 1.9, 1.4);
    }
    this._fire(2, 1.4, -12, 2.2);
    this._fire(10, 0.6, 12, 1.5, false);
  }

  _boxCollider(x, z, ry, L, W, h) {
    const c = Math.abs(Math.cos(ry)), s = Math.abs(Math.sin(ry));
    return this.addBoxCollider(x, z, c * L + s * W, s * L + c * W, h);
  }

  /** Ruined plaza: monument, planters, burnt vehicles. */
  _plaza() {
    const m = nbox(3, 2.4, 3, 0x1a1236, C.cyan);
    m.position.set(-48, 1.2, 0);
    this.scene.add(m);
    this.addBoxCollider(-48, 0, 3, 3, 2.4);
    const mt = glowSign('NEVER FORGET', C.cyan, 2.6);
    this._put(mt, -48, 1.4, 1.55, 0);
    const mg = glow(C.cyan, 8, 0.45);
    mg.position.set(-48, 2.6, 0);
    this.scene.add(mg);
    for (const [x, z] of [[-40, -10], [-40, 10], [-54, -10], [-54, 10]]) this._solid(x - 1.5, x + 1.5, z - 0.5, z + 0.5, 0.9, 0x1e4a2e, C.green);
    const rng = mulberry(77);
    for (const [x, z, ry, col, burn] of [[-42, -18, 0.4, C.pink, 1], [-38, 16, 1.2, C.cyan, 1], [-56, -17, -0.3, C.violet, 0], [-52, 20, 0.8, C.hot, 1]]) {
      const car = makeCar(col, 'car');
      car.position.set(x, -0.04, z);
      car.rotation.y = ry;
      car.rotation.z = (rng() - 0.5) * 0.2;
      this.scene.add(car);
      this._boxCollider(x, z, ry, 4.4, 1.9, 1.4);
      if (burn) this._fire(x, 1.4, z, 2.4, burn === 1 && x < -45);
    }
    const bus = makeBusExterior();
    bus.position.set(-44, 0, 24.2);
    bus.rotation.y = -0.08;
    this.scene.add(bus);
    this._boxCollider(-44, 24.2, -0.08, 11, 2.7, 3.2);
    addHoloAd(this, -36, 6.5, -24.6, ['EVACUATE', 'METRO', 'STATION'], C.green, 0, 3.6, 2.4);
    addHoloAd(this, -50, 6.5, 24.6, ['ERR', 'NO SIGNAL'], C.red, Math.PI, 3.2, 2.2);
    for (const [x, z] of [[-41, 4], [-37, -6], [-58, 2], [-52, -14]]) {
      const n = new NPC({ x, z, mode: 'collapse', yaw: rng() * 6.28 });
      n.rig.p.lie = 1; n.rig.s.lie = 1;
      this.addNPC(n);
    }
    for (const [x, z] of [[8, -2], [-24, 3], [24, 6], [40, -2], [34, 7]]) {
      const n = new NPC({ x, z, mode: 'collapse', yaw: rng() * 6.28 });
      n.rig.p.lie = 1; n.rig.s.lie = 1;
      this.addNPC(n);
    }
  }

  /** The Metro Relief Station: walls with three openings, the survivors' camp, lamps. */
  _station() {
    const s = this.scene;
    const X0 = -98, X1 = -62, Z0 = -14, Z1 = 14;
    // floor
    const gt = gridTexture('#2a6bff', '#0b0a28', 8);
    gt.repeat.set(9, 7);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(X1 - X0, Z1 - Z0), new THREE.MeshStandardMaterial({ map: gt, roughness: 0.35, metalness: 0.45, envMapIntensity: 1.0 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set((X0 + X1) / 2, 0.03, 0);
    s.add(floor);
    for (const [cx, w, col] of [[-72, 20, C.cyan], [-88, 20, C.orange]]) {
      const z = new THREE.Mesh(new THREE.PlaneGeometry(w, 26), basic(col, { opacity: 0.06, add: true }));
      z.rotation.x = -Math.PI / 2;
      z.position.set(cx, 0.05, 0);
      s.add(z);
    }
    // walls (thickness 1): east wall with the gate gap z -3.5..3.5, north with a window gap, south with a door gap
    const H = 6;
    const wall = (x0, x1, z0, z1) => this._solid(x0, x1, z0, z1, H, 0x16103a, C.green);
    wall(-62.5, -61.5, Z0 - 0.5, -3.5); wall(-62.5, -61.5, 3.5, Z1 + 0.5);
    wall(X0 - 0.5, -77, Z0 - 0.5, Z0 + 0.5); wall(-71, -61.5, Z0 - 0.5, Z0 + 0.5);
    wall(X0 - 0.5, -89, Z1 - 0.5, Z1 + 0.5); wall(-83, -61.5, Z1 - 0.5, Z1 + 0.5);
    wall(X0 - 0.5, X0 + 0.5, Z0 - 0.5, Z1 + 0.5);
    // lintels over the openings (they also hide the back of the outside sign)
    for (const b of BAR_DEFS) {
      const alongX = Math.abs(b.nx) < 0.5;
      const l = nbox(alongX ? b.half * 2 : 1, 1.6, alongX ? 1 : b.half * 2, 0x16103a, C.green);
      l.position.set(b.x, 5.2, b.z);
      s.add(l);
    }
    // glowing arch frames on the openings
    for (const b of BAR_DEFS) {
      const alongX = Math.abs(b.nx) < 0.5;
      const frame = led(alongX ? b.half * 2 + 0.4 : 0.14, 0.14, alongX ? 0.14 : b.half * 2 + 0.4, C.green, 0.95);
      frame.position.set(b.x, 4.4, b.z);
      s.add(frame);
    }
    // signs
    const out = glowSign('METRO RELIEF STATION', C.green, 7.2);
    this._put(out, -61.2, 5.4, 0, Math.PI / 2);
    this.flicker(out.userData.mat, 0.6);
    const out2 = glowSign('SAFE ZONE', C.cyan, 3.4);
    this._put(out2, -97.3, 4.6, 0, Math.PI / 2);
    // beacon so the station is visible from the start of the route
    const bm = beam(C.green, 46, 0.7);
    bm.position.set(BEACON.x, 23, BEACON.z);
    s.add(bm);
    this.beacon = bm;
    const bg = glow(C.green, 18, 0.7);
    bg.position.set(BEACON.x, 12, BEACON.z);
    s.add(bg);
    // lamps inside
    for (const [x, z, col, I] of [[-70, 0, 0xffb060, 6], [-82, 0, 0xffb060, 6], [-92, 0, 0xffa050, 7]]) {
      const l = new THREE.PointLight(col, I * Math.PI, 17, 1.5);
      l.position.set(x, 4.4, z);
      s.add(l);
      this.flickerLight(l, 0.2);
    }
    // ticket gates + pillars + benches (cover that does not block the three lanes)
    for (const z of [-6.5, -3.4, 3.4, 6.5]) this._solid(-67, -66, z - 0.3, z + 0.3, 1.0, 0x1a1450, C.cyan);
    for (const [x, z] of [[-70, -9], [-70, 9], [-80, -9.5], [-80, 9.5]]) this._solid(x - 0.5, x + 0.5, z - 0.5, z + 0.5, H, 0x1a1450, C.cyan);
    for (const [x, z] of [[-77, 11.4], [-72, 11.4], [-79, -11.4]]) this._solid(x - 1.2, x + 1.2, z - 0.4, z + 0.4, 0.8, 0x2a1a40, C.orange);
    // the camp: tents, blankets, lanterns, generator
    for (const [x, z, ry] of [[-92, -9, 0.2], [-92.5, 9.5, -0.2]]) {
      const t = nbox(2.8, 1.5, 2.2, 0x2a1a50, C.pink);
      this._put(t, x, 0.75, z, ry);
      this.addBoxCollider(x, z, 3, 2.4, 1.5);
    }
    for (const [x, z, col] of [[-88.5, -3.5, C.pink], [-88.5, 4.5, C.cyan], [-90, 0.5, C.yellow]]) {
      const b = nbox(1.6, 0.12, 1.0, 0x3a1a60, col);
      this._put(b, x, 0.06, z, 0.4);
    }
    for (const [x, z] of [[-88, -6.5], [-88, 7.5], [-96, -4]]) {
      const l = glow(0xffb060, 3, 0.85);
      l.position.set(x, 1.1, z);
      s.add(l);
      const c = nbox(0.3, 0.45, 0.3, 0x2a2a50, 0xffb060);
      this._put(c, x, 0.23, z);
    }
    const gen = nbox(1.6, 1.1, 1.0, 0x1a2a30, C.green);
    this._put(gen, -96, 0.55, 6.5);
    this.addBoxCollider(-96, 6.5, 1.6, 1.0, 1.1);
    const gg = glow(C.green, 2.2, 0.6);
    gg.position.set(-96, 1.3, 6.5);
    s.add(gg);
    // the plank stash (spare wood for barricade kits)
    for (let i = 0; i < 5; i++) {
      const p = nbox(2.0, 0.14, 0.4, 0x4a2c18, C.orange);
      this._put(p, -89.5, 0.1 + i * 0.16, -11.2 + (i % 2) * 0.1, (i - 2) * 0.05);
    }
    this.addBoxCollider(-89.5, -11.2, 2.2, 0.6, 0.9);
    const sg = glow(C.orange, 3, 0.6);
    sg.position.set(-89.5, 1.2, -11.2);
    s.add(sg);
    this.stashIt = this.addInteractable({
      x: -89.5, z: -9.7, r: 2.2, y: 1.0, color: C.orange, label: "TAKE THE SURVIVORS' STASH (WOOD, SCRAP, AMMO)",
      enabled: () => !this.gotStash && this.phase !== 'route',
      onUse: () => this._takeStash()
    });
  }

  /** Workbenches. */
  _benches() {
    for (const [x, z, id, ix, iz] of BENCHES) {
      const t = nbox(2.4, 1.0, 1.0, 0x1a2250, C.yellow);
      this._put(t, x, 0.5, z);
      this.addBoxCollider(x, z, 2.5, 1.1, 1.0);
      const tool = nbox(0.5, 0.18, 0.3, 0x333355, C.cyan);
      this._put(tool, x - 0.5, 1.09, z, 0.3);
      const g = glow(C.yellow, 2.6, 0.6);
      g.position.set(x, 1.5, z);
      this.scene.add(g);
      const sg = glowSign('WORKBENCH', C.yellow, 1.8);
      this._put(sg, x, 2.1, z + (z < 0 ? 0.55 : -0.55), z < 0 ? 0 : Math.PI);
      this.flicker(sg.userData.mat, 0.5);
      const it = this.addInteractable({
        x: ix, z: iz, r: 2.2, y: 1.2, color: C.yellow, label: 'USE WORKBENCH (CRAFT)',
        onUse: () => this._useBench()
      });
      it.bench = id;
    }
  }

  /** Called by the workbench panel after something was crafted. */
  onCraft() {
    if (this.crafted) return;
    this.crafted = true;
    G.hud.completeObj('craft');
  }

  _useBench() {
    if (!this.hints.craft) {
      this.hints.craft = true;
      G.hud.say('', 'Scrap, cloth and wood become barricade kits, medkits, ammo and shells. The station will need three kits.');
    }
    G.ui.openCraft('WORKBENCH');
  }

  /** Barricade objects for the three station entrances. */
  _barricades() {
    const rng = mulberry(404);
    for (const def of BAR_DEFS) {
      const b = { ...def, built: false, hp: 0, maxHp: 220, shake: 0, planks: [], busy: false };
      const alongX = Math.abs(def.nx) < 0.5;
      const len = def.half * 2;
      const g = new THREE.Group();
      g.position.set(def.x, 0, def.z);
      [0.35, 0.8, 1.25, 1.7, 2.15].forEach((y, i) => {
        const p = nbox(alongX ? len - 0.3 : 0.3, 0.32, alongX ? 0.3 : len - 0.3, 0x4a2c18, C.orange);
        p.position.y = y;
        p.rotation[alongX ? 'z' : 'x'] = (rng() - 0.5) * 0.05;
        g.add(p);
        b.planks.push(p);
      });
      for (const sgn of [-1, 1]) {
        const post = nbox(0.34, 2.6, 0.34, 0x3a2010, C.orange);
        post.position.set(alongX ? sgn * (def.half - 0.25) : 0, 1.3, alongX ? 0 : sgn * (def.half - 0.25));
        g.add(post);
      }
      // hp bar above the planks
      const back = led(alongX ? len * 0.9 : 0.12, 0.12, alongX ? 0.12 : len * 0.9, 0x220a22, 0.85);
      back.position.y = 2.95;
      const fill = led(alongX ? len * 0.9 : 0.12, 0.12, alongX ? 0.12 : len * 0.9, C.green, 1);
      fill.material = fill.material.clone();
      fill.position.y = 2.95;
      g.add(back, fill);
      g.visible = false;
      this.scene.add(g);
      // open-doorway marker
      const fr = new THREE.Group();
      fr.position.set(def.x, 0, def.z);
      for (const sgn of [-1, 1]) {
        const u = led(alongX ? 0.12 : 0.12, 2.6, alongX ? 0.12 : 0.12, C.orange, 0.85);
        u.position.set(alongX ? sgn * def.half : 0, 1.3, alongX ? 0 : sgn * def.half);
        fr.add(u);
      }
      const top = led(alongX ? len : 0.12, 0.12, alongX ? 0.12 : len, C.orange, 0.85);
      top.position.y = 2.6;
      fr.add(top);
      const fg = glow(C.orange, 4, 0.4);
      fg.position.y = 1.4;
      fr.add(fg);
      this.scene.add(fr);
      b.group = g; b.fill = fill; b.back = back; b.frame = fr; b.alongX = alongX; b.len = len;
      const hw = alongX ? def.half : 0.5, hd = alongX ? 0.5 : def.half;
      b.col = this.addCollider(def.x - hw, def.x + hw, def.z - hd, def.z + hd, 1.1);
      b.col.off = true;
      b.it = this.addInteractable({
        x: def.at[0], z: def.at[1], r: 2.8, y: 1.2, color: C.orange,
        label: () => (G.player.inv.kits > 0 ? `BUILD ${def.name} (KIT x${G.player.inv.kits})` : `${def.name}: NEED A BARRICADE KIT`),
        enabled: () => (this.phase === 'prep' || this.phase === 'siege') && !b.built && !b.busy,
        onUse: () => this._tryBuild(b)
      });
      this.bars.push(b);
    }
  }

  _setBarVisual(b) {
    b.group.visible = b.built;
    b.frame.visible = !b.built;
    b.col.off = !b.built;
    b.fill.material.color.setHex(b.hp > b.maxHp * 0.6 ? C.green : b.hp > b.maxHp * 0.3 ? C.yellow : C.red);
    const k = Math.max(0.02, b.hp / b.maxHp);
    if (b.alongX) b.fill.scale.set(k, 1, 1); else b.fill.scale.set(1, 1, k);
    // damaged planks hang crooked or fall away
    b.planks.forEach((p, i) => { p.visible = !(b.hp < b.maxHp * 0.35 && i % 2 === 1); });
  }

  _tryBuild(b) {
    const pl = G.player;
    if (pl.inv.kits <= 0) { G.audio.sfx('error'); G.hud.toast('NEED A BARRICADE KIT - CRAFT ONE AT A WORKBENCH', 'red'); return; }
    pl.inv.kits--;
    b.busy = true;
    pl.locked = true;
    pl.faceTo(b.x, b.z);
    G.audio.sfx('build');
    this.tween(0.7, (k) => { b.group.visible = true; b.frame.visible = false; b.group.scale.set(1, 0.15 + 0.85 * k, 1); }).then(() => {
      b.busy = false;
      if (this.disposed) return;
      b.group.scale.set(1, 1, 1);
      pl.locked = false;
      b.built = true;
      b.hp = b.maxHp;
      this._setBarVisual(b);
      G.fx.burst(b.x, 1.4, b.z, C.orange, 18, 3, 0.6, 3);
      G.audio.sfx('pickup');
      G.hud.toast(`${b.name} BARRICADED`, 'green');
      this._barsChanged();
    });
  }

  _barsChanged() {
    const n = this.bars.filter((x) => x.built).length;
    if (this.phase === 'prep') {
      G.hud.setObjText('bars', `Barricade the 3 entrances (${n}/3)`);
      if (n === 3) {
        G.hud.completeObj('bars');
        if (!this.nightQueued) {
          this.nightQueued = true;
          G.hud.banner('ALL ENTRANCES SEALED', 'THE HAMMERING WILL DRAW THEM...', 3000);
          this.after(4.5, () => { if (!this.disposed && this.phase === 'prep') this._startWave(1); });
        }
      }
    }
  }

  /** Zombies call this every frame while chasing: where should they go? null = straight for the player. */
  siegeGoal(z) {
    const b = z.siegeBar;
    if (!b) return null;
    const rx = z.pos.x - b.x, rz = z.pos.z - b.z;
    const s = rx * b.nx + rz * b.nz;          // distance outside the opening
    if (s < 0.3) return null;                  // through the opening already
    const l = rx * b.tx + rz * b.tz;           // sideways offset along the opening
    const cl = (v, m) => Math.max(-m, Math.min(m, v));
    if (b.built && b.hp > 0) {
      if (s < 1.45 && Math.abs(l) < b.half + 0.2) return z.type === 'spitter' ? { x: z.pos.x, z: z.pos.z, hold: true } : { bash: true };
      const k = cl(l, b.half - 0.7);
      return { x: b.x + b.nx * 1.1 + b.tx * k, z: b.z + b.nz * 1.1 + b.tz * k };
    }
    if (s > 2.6 || Math.abs(l) > b.half - 0.6) {
      const k = cl(l, b.half - 0.8);
      return { x: b.x + b.nx * 2.2 + b.tx * k, z: b.z + b.nz * 2.2 + b.tz * k };
    }
    const k = cl(l, 1.5);
    return { x: b.x - b.nx * 2.2 + b.tx * k, z: b.z - b.nz * 2.2 + b.tz * k };
  }

  bashBarricade(z, b) {
    if (!b.built) return;
    const dmg = z.t.heavy ? 24 : z.type === 'runner' ? 6 : 8;
    b.hp -= dmg;
    b.shake = 0.25;
    G.audio.sfx('bash');
    G.fx.burst(b.x + b.nx * 0.7, 1.3, b.z + b.nz * 0.7, C.orange, 6, 2.5, 0.4, 3);
    if (b.hp <= 0) this._breakBar(b);
    else this._setBarVisual(b);
  }

  _breakBar(b) {
    b.built = false;
    b.hp = 0;
    this._setBarVisual(b);
    G.audio.sfx('crash');
    G.fx.burst(b.x, 1.4, b.z, C.orange, 30, 5, 0.9, 4);
    G.fx.ring(b.x, 0.2, b.z, C.red, 4, 0.5);
    G.hud.toast(`${b.name} BROKE THROUGH!`, 'red');
    G.hud.setObjText('night', this._nightText());
  }

  /* ---------------- crates, hiding spots, the depot cache ---------------- */
  _crates() {
    for (const [x, z, loot] of CRATES) {
      const m = nbox(1.0, 0.9, 1.0, 0x3a2418, C.yellow);
      this._put(m, x, 0.45, z);
      this.addBoxCollider(x, z, 1.1, 1.1, 0.9);
      const c = { x, z, m, loot, opened: false };
      this.crates.push(c);
      c.it = this.addInteractable({
        x, z, r: 1.9, y: 0.9, color: C.yellow, label: 'SEARCH CRATE',
        enabled: () => !c.opened,
        onUse: () => this._search(c)
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
    for (const [t, n] of c.loot) if (!this._giveLoot(t, n)) this.addLoot(t, c.x, c.z + (c.z < 0 ? 1.4 : -1.4), 9);
  }

  _dumpsters() {
    this.hides = [];
    for (const [x, z] of DUMPSTERS) {
      const m = nbox(2.1, 1.25, 1.1, 0x16301e, C.green);
      this._put(m, x, 0.62, z);
      const lid = nbox(2.15, 0.1, 1.15, 0x0e2014, C.green);
      this._put(lid, x, 1.3, z, 0);
      lid.rotation.z = 0.06;
      this.addBoxCollider(x, z, 2.1, 1.1, 1.3);
      const spot = { x, z, out: z < 0 ? 1.9 : -1.9 };
      this.hides.push(spot);
      this.addInteractable({
        x, z, r: 2.1, y: 1.0, color: C.green, label: 'HIDE (STEALTH)',
        enabled: () => this.phase === 'route' && !G.player.hidden && !G.player.dead,
        onUse: () => this._hide(spot)
      });
    }
  }

  /** The depot's supply cache: valuable, and opening it wakes the yard. */
  _cache() {
    const x = -16.8, z = -2.3;
    const m = nbox(1.5, 1.0, 0.9, 0x2a2a18, C.green);
    this._put(m, x, 0.5, z);
    this.addBoxCollider(x, z, 1.6, 1.0, 1.0);
    const g = glow(C.green, 3.4, 0.7);
    g.position.set(x, 1.3, z);
    this.scene.add(g);
    this.cache = { x, z, m, opened: false };
    this.cache.it = this.addInteractable({
      x, z: z + 1.4, r: 2.0, y: 1.1, color: C.green, label: 'OPEN SUPPLY CACHE',
      enabled: () => !this.cache.opened,
      onUse: () => this._openCache()
    });
  }

  _openCache() {
    const c = this.cache;
    c.opened = true;
    c.it.remove();
    c.m.rotation.z = 0.15;
    G.audio.sfx('door');
    G.fx.burst(c.x, 1.2, c.z, C.green, 20, 3.5, 0.7, 3);
    for (const [t, n] of [['shells', 6], ['ammo', 12], ['medkit', 1], ['wood', 2]]) if (!this._giveLoot(t, n)) this.addLoot(t, c.x + 0.5, c.z + 1.6, 9);
    this.makeNoise(c.x, c.z, 16);
    G.hud.toast('THE DEPOT CACHE WAS FULL...', 'gold');
    if (!this.ambushDone) {
      this.ambushDone = true;
      // something heard that: a runner pack and stragglers come in off the rails
      this.after(1.2, () => {
        if (this.disposed) return;
        G.audio.sfx('scream');
        G.hud.banner('AMBUSH!', 'THEY HEARD THE CRATE', 2200);
        for (const [type, x, z] of [['runner', -30, -6], ['runner', -30, 5], ['walker', -28, 0], ['walker', 4, 3]]) {
          const zb = this.addZombie(type, x, z, {});
          zb.stagger(0.4);
          G.fx.burst(x, 1, z, C.red, 12, 3, 0.5, 3);
        }
      });
    }
  }

  /* ---------------- survivors ---------------- */
  _survivors() {
    const mk = (id, name, x, z, yaw, o) => {
      const n = new NPC({ x, z, name, mode: 'idle', yaw, backpack: false, outline: o.accent, ...o });
      this.addNPC(n);
      this.npcMap[id] = n;
      return n;
    };
    mk('meera', 'MEERA', -81, -4.5, Math.PI / 2, { accent: C.green, shirt: 0x1c3a3a, hair: 0x101010 });
    mk('kabir', 'KABIR', -86.5, 5.5, Math.PI / 2, { accent: C.yellow, shirt: 0x3a2a10, hair: 0x2a1a10, scale: 0.88 });
    mk('rao', 'RAO UNCLE', -91.5, 3.2, Math.PI / 2, { accent: C.cyan, shirt: 0x24244a, hair: 0x44445a });
    const talk = (id, label, lines) => this.addInteractable({
      x: this.npcMap[id].pos.x, z: this.npcMap[id].pos.z, r: 2.1, y: 1.5, marker: false, color: C.cyan, label,
      onUse: () => G.hud.sayLines(typeof lines === 'function' ? lines() : lines)
    });
    this.meeraIt = this.addInteractable({
      x: -81, z: -4.5, r: 2.2, y: 1.5, marker: false, color: C.green,
      label: () => (this.lull && !this.restocks.meera ? 'MEERA: TREAT MY WOUNDS (FULL HEALTH)' : 'TALK TO MEERA'),
      onUse: () => this._meera()
    });
    this.kabirIt = this.addInteractable({
      x: -86.5, z: 5.5, r: 2.2, y: 1.5, marker: false, color: C.yellow,
      label: () => (this.lull && !this.restocks.kabir ? 'KABIR: GET AMMO (+16 / +5 SHELLS)' : 'TALK TO KABIR'),
      onUse: () => this._kabir()
    });
    talk('rao', 'TALK TO RAO UNCLE', () => (this.phase === 'dawn'
      ? [['RAO UNCLE', 'The batteries, beta. Put them in the radio. Please.']]
      : [['RAO UNCLE', 'Six days that radio has been dead. If it ever speaks again, I want to be the one listening.'], ['RAO UNCLE', 'Hold the walls tonight. The batteries are yours to spend, but they belong in that set.']]));
  }

  _meera() {
    const pl = G.player;
    if (this.lull && !this.restocks.meera) {
      this.restocks.meera = true;
      pl.hp = pl.maxHp;
      G.audio.sfx('heal');
      G.fx.ring(pl.pos.x, 0, pl.pos.z, C.green, 2.2, 0.6);
      G.fx.burst(pl.pos.x, 1, pl.pos.z, C.green, 16, 2.5, 0.8, -1);
      G.hud.toast('HEALTH RESTORED', 'green');
      G.hud.say('MEERA', 'Hold still. There. Keep them off the walls, Aarav.');
    } else if (this.phase === 'siege' && !this.lull) {
      G.hud.say('MEERA', 'I can\'t patch you under fire! Get the wave down first.');
    } else {
      G.hud.sayLines([['MEERA', 'I was a nurse at the Sector 9 clinic. I can patch you up between waves - but only once per lull. Don\'t waste it.']]);
    }
  }

  _kabir() {
    const pl = G.player;
    if (this.lull && !this.restocks.kabir) {
      this.restocks.kabir = true;
      pl.inv.ammo = Math.min(60, pl.inv.ammo + 16);
      pl.inv.shells = Math.min(24, pl.inv.shells + 5);
      G.audio.sfx('pickup');
      G.hud.toast('+16 AMMO  +5 SHELLS', 'gold');
      G.hud.say('KABIR', 'Found these in the ticket office. Make every shot count!');
    } else if (this.phase === 'siege' && !this.lull) {
      G.hud.say('KABIR', 'Watch the gate! They are coming!');
    } else {
      G.hud.sayLines([['KABIR', 'I am Kabir. I keep count of the ammo. Between the waves I will share what we have. Not before.']]);
    }
  }

  _takeStash() {
    if (this.gotStash) return;
    this.gotStash = true;
    this.stashIt.remove();
    const inv = G.player.inv;
    inv.wood = Math.min(12, inv.wood + 6);
    inv.scrap = Math.min(12, inv.scrap + 3);
    inv.ammo = Math.min(60, inv.ammo + 16);
    inv.shells = Math.min(24, inv.shells + 4);
    G.audio.sfx('pickup');
    G.hud.toast('+6 WOOD  +3 SCRAP  +16 AMMO  +4 SHELLS', 'gold');
    G.hud.say('', 'Planks for barricade kits, plus what ammo the survivors can spare. Craft the kits at the workbench, then seal the three entrances.');
  }

  /** The radio on the west table (needs the batteries). */
  _radio() {
    const s = this.scene;
    const t = nbox(3.0, 0.9, 1.3, 0x1a1245, C.cyan);
    this._put(t, RADIO.x, 0.45, RADIO.z);
    this.addBoxCollider(RADIO.x, RADIO.z, 3.0, 1.3, 0.9);
    const body = nbox(0.9, 0.5, 0.5, 0x0e1230, C.cyan);
    this._put(body, RADIO.x, 1.15, RADIO.z);
    const ant = new THREE.Mesh(cylGeo(0.025, 0.025, 1.8, 5), basic(0x6a7aaa));
    ant.position.set(RADIO.x + 0.3, 2.1, RADIO.z);
    ant.rotation.z = -0.25;
    s.add(ant);
    this.radioLed = glow(C.red, 0.9, 0.95);
    this.radioLed.material = this.radioLed.material.clone();
    this.radioLed.position.set(RADIO.x + 0.2, 1.3, RADIO.z + 0.27);
    s.add(this.radioLed);
    this.radioGlow = glow(C.cyan, 3.4, 0.0);
    this.radioGlow.material = this.radioGlow.material.clone();
    this.radioGlow.position.set(RADIO.x, 1.4, RADIO.z);
    s.add(this.radioGlow);
    this.radioIt = this.addInteractable({
      x: RADIO.x + 2.4, z: RADIO.z, r: 2.6, y: 1.3, color: C.cyan, label: 'POWER THE RADIO (BATTERIES)',
      enabled: () => this.phase === 'dawn' && !this.radioDone,
      onUse: () => this._radioScene()
    });
  }

  /* ================= phases ================= */
  _saveCp(cp, at, extra = {}) {
    this.cp = Math.max(this.cp, cp);
    G.saveCheckpoint({ chapter: 7, stage: 'haven', cp, got: { phase: this.phase, ...extra }, at });
  }

  _barState() { return this.bars.map((b) => ({ built: b.built, hp: Math.round(b.hp) })); }

  _routeCp(n) {
    if (this.cp >= n) return;
    this._saveCp(n, CP_AT[n]);
    G.hud.toast('CHECKPOINT', 'cyan');
  }

  _enterStation() {
    if (this.phase !== 'route') return;
    this.phase = 'prep';
    this.prepT = PREP_TIME;
    this.nightQueued = false;
    G.hud.completeObj('safe', true);
    G.audio.setMood('calm');
    G.hud.setStealth(null);
    G.hud.setWaypoint(null);
    G.hud.banner('THE METRO RELIEF STATION', 'SAFE... FOR NOW', 3200);
    G.hud.setObjectives('PREPARE FOR THE NIGHT', [
      { id: 'bars', text: 'Barricade the 3 entrances (0/3)' },
      { id: 'night', text: 'Nightfall in 2:30' }
    ]);
    // anything that was chasing the player comes in through the gate
    for (const e of this.enemies) if (e.alive && e.aware && !e.siegeBar) e.siegeBar = this.bars[0];
    this._saveCp(3, CP_AT[3]);
    G.hud.sayLines([
      ['MEERA', 'In! In! Welcome to the Metro Relief Station. It is not much, but it has walls.'],
      ['KABIR', 'The gate lock is busted. We have three openings: the front gate, the north window and the loading door.'],
      ['MEERA', 'They come at night, drawn to the light and the noise. We need all three sealed before nightfall.'],
      ['AARAV', 'Spare planks by the camp, workbench in the corner. Three barricade kits. I can do that.']
    ]);
  }

  _nightText() {
    if (this.phase === 'prep') {
      const t = Math.max(0, Math.ceil(this.prepT));
      return `Nightfall in ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    }
    const up = this.bars.filter((b) => b.built).length;
    return this.lull ? `Wave ${this.wave} cleared - rest, then hold the walls (${up}/3 up)` : `Hold out - wave ${this.wave} of ${WAVES} (${up}/3 barricades up)`;
  }

  _startWave(n) {
    if (this.phase === 'dawn' || this.finished) return;
    this.phase = 'siege';
    this.waveOn = true;
    this.waveT = 0;
    this.wave = n;
    this.lull = false;
    this.waveZ = [];
    this.restocks = { meera: false, kabir: false };
    this.nightQueued = true;
    this.lobThrow = false;       // bottles now hit and stun the dead
    if (this.throwMark) this.throwMark.visible = false;
    G.audio.setMood('combat');
    G.hud.redAlert(true);
    G.hud.banner(`WAVE ${n} OF ${WAVES}`, n === 1 ? 'NIGHTFALL - HOLD THE WALLS' : n === WAVES ? 'THE LAST WAVE - A BRUTE LEADS IT' : 'THEY KEEP COMING', 2600);
    G.hud.setObjectives('SURVIVE THE NIGHT', [{ id: 'night', text: this._nightText() }]);
    G.hud.setWaypoint(null);
    this._saveCp(4, CP_AT[4], { wave: n, bars: this._barState() });
    this.waveSpawning = true;
    const list = WAVE_LIST[n - 1];
    list.forEach(([type, ei], i) => {
      this.after(0.4 + i * 0.55, () => {
        if (this.disposed) return;
        const [x, z] = SPAWN_AT[ei]();
        const zb = this.addZombie(type, x, z, {});
        zb.siegeBar = this.bars[ei];
        zb.waveId = n;
        zb.stagger(0.3);
        this.waveZ.push(zb);
        G.fx.burst(x, 1, z, C.red, 10, 3, 0.5, 3);
        if (i === list.length - 1) this.waveSpawning = false;
      });
    });
    if (n === 1) {
      G.hud.sayLines([
        ['KABIR', 'Here they come! The front gate first!'],
        ['MEERA', 'Shoot over the barricades - the planks do not stop bullets! Or swing the rod through the gaps: the dead only pound the wood and cannot hit back.'],
        ['KABIR', 'If a barricade breaks, rebuild it with a kit. The fallen drop supplies on our side of the wall - grab them!']
      ]);
    }
  }

  _updateWave(dt) {
    if (this.phase !== 'siege' || !this.waveOn) return;
    if (this.lull) {
      this.lullT -= dt;
      if (this.lullT <= 0) this._startWave(this.wave + 1);
      return;
    }
    if (this.waveSpawning) return;
    // safety net: a straggler the player cannot reach (e.g. a spitter hiding at a wall corner) must never stall the night
    this.waveT += dt;
    if (this.waveT > 150) {
      for (const z of this.waveZ) if (z.alive) z.die(true);
      G.hud.toast('THE REST OF THEM FALL BACK...', 'cyan');
    }
    if (this.waveZ.every((z) => !z.alive)) this._waveCleared();
  }

  _waveCleared() {
    const n = this.wave;
    G.hud.redAlert(false);
    G.audio.sfx('win');
    if (n >= WAVES) { this.waveOn = false; this._dawn(); return; }
    this.lull = true;
    this.lullT = 22;
    G.audio.setMood('tense');
    G.hud.banner(`WAVE ${n} CLEARED`, 'REST - MEERA AND KABIR CAN HELP', 2600);
    G.hud.setObjText('night', this._nightText());
    G.hud.toast('MEERA: HEALTH   KABIR: AMMO   WORKBENCH: REPAIRS', 'green');
  }

  _dawn() {
    this.phase = 'dawn';
    this.lull = false;
    this.restocks = { meera: false, kabir: false };
    G.audio.setMood('calm');
    G.hud.redAlert(false);
    G.hud.banner('DAWN', 'YOU HELD THE NIGHT', 3200);
    G.player.heal(50);
    G.hud.setObjectives('THE SIGNAL', [{ id: 'radio', text: 'Power the radio with the batteries (west end)' }]);
    G.hud.setWaypoint({ x: RADIO.x + 2.4, z: RADIO.z });
    this._saveCp(5, CP_AT[5], { bars: this._barState() });
    this._dawnTween();
    G.hud.sayLines([
      ['MEERA', 'Is that... daylight? We are still alive.'],
      ['RAO UNCLE', 'Aarav... the batteries. The radio. Quickly, beta.']
    ]);
  }

  _dawnTween() {
    const fog0 = new THREE.Color(0x14062e), fog1 = new THREE.Color(0x7a3060);
    const hs0 = new THREE.Color(0x6a4cff), hs1 = new THREE.Color(0xffa27a);
    return this.tween(7, (k) => {
      this.dawnK = k;
      this.scene.fog.color.copy(fog0).lerp(fog1, k);
      this.scene.fog.density = 0.017 - 0.005 * k;
      this.scene.backgroundIntensity = 0.45 + 0.65 * k;
      this.lights.hemi.color.copy(hs0).lerp(hs1, k);
    });
  }

  /** Install the batteries, then the transmission. */
  async _radioScene() {
    if (this.radioDone || this.phase !== 'dawn') return;
    const pl = G.player;
    pl.locked = true;
    G.hud.toast('INSTALLING BATTERIES...', 'cyan');
    const ok = await G.mg.run('mash', { title: 'CONNECT THE BATTERIES', taps: 6, time: 5 });
    if (this.disposed || pl.dead) return;
    if (!ok) { pl.locked = false; G.audio.sfx('error'); G.hud.toast('THE CONTACTS SLIPPED - TRY AGAIN', 'red'); return; }
    this.radioDone = true;
    this.radioIt.remove();
    pl.inv.batteries = 0;
    G.hud.completeObj('radio');
    G.hud.setWaypoint(null);
    G.audio.sfx('power');
    this.radioGlow.material.opacity = 0.9;
    this.radioLed.material.color.setHex(C.green);
    G.camRig.cutscene(new THREE.Vector3(RADIO.x + 4.6, 2.5, RADIO.z + 2.6), new THREE.Vector3(RADIO.x, 1.3, RADIO.z), 2.4);
    this.staticOn = true;
    let sa = 0;
    this.updaters.push((dt) => { if (!this.staticOn) return; sa -= dt; if (sa <= 0) { sa = 1.1 + Math.random() * 0.9; G.audio.sfx('static'); } });
    if (!await this.wait(1.0)) return;
    G.hud.banner('INCOMING TRANSMISSION', '', 2200);
    G.audio.sfx('radio');
    if (!await this.wait(2.2)) return;
    await this._say([
      ['UNKNOWN SIGNAL', '...kzzzt... anyone... receiving... this is Terminus Control...'],
      ['UNKNOWN SIGNAL', 'The city is not lost. The trains are still running.'],
      ['UNKNOWN SIGNAL', 'One last train leaves at sunrise. Platform Nine. Bring only what you can carry.'],
      ['UNKNOWN SIGNAL', '...and Aarav... do not let them hear you coming.']
    ]);
    if (this.disposed) return;
    this.staticOn = false;
    G.audio.sfx('radio');
    await this._say([
      ['AARAV', '...How does it know my name?'],
      ['RAO UNCLE', 'Six days of nothing. Then you plug in a battery and it speaks to you.'],
      ['MEERA', 'Terminus Central is across the river. Past the hospital. Past everything.'],
      ['AARAV', 'Then that is where I am going. One last commute.']
    ]);
    if (this.disposed) return;
    this.finished = true;
    G.audio.sfx('win');
    G.hud.banner('CHAPTER 7 COMPLETE', 'SURVIVE AND ESCAPE', 2800);
    if (!await this.wait(3.0)) return;
    G.hud.fade(true);
    if (!await this.wait(0.9)) return;
    G.finishChapters(7);
  }

  _say(lines) { return new Promise((res) => G.hud.sayLines(lines, res)); }

  onEnemyDeath(z) {
    const inside = z.pos.x < -62.5 && z.pos.x > -98 && Math.abs(z.pos.z) < 13.5;
    if (this.phase === 'route') {
      if (Math.random() < 0.28) this.addLoot(pick(['bottle', 'ammo', 'food', 'shells', 'scrap', 'wood', 'cloth']), z.pos.x, z.pos.z, 9);
    } else if (this.phase === 'siege') {
      const type = pick(['ammo', 'ammo', 'ammo', 'shells', 'medkit']);
      if (inside) { if (Math.random() < 0.3) this.addLoot(type, z.pos.x, z.pos.z, 9); }
      else if (z.siegeBar && Math.random() < 0.28) {
        // the dead carry supplies; what falls near a barricade is scattered on the safe side of it
        const b = z.siegeBar, l = (Math.random() - 0.5) * 2.4;
        this.addLoot(type, b.x - b.nx * 2.6 + b.tx * l, b.z - b.nz * 2.6 + b.tz * l, 9);
      }
    }
  }

  /* ================= life cycle ================= */
  async enter(opts = {}) {
    const pl = G.player;
    this.scene.add(pl.rig.root);
    const cp = opts.cp ?? 0;
    const g = opts.got || {};
    this.cp = cp;
    this.phase = cp >= 5 ? 'dawn' : cp >= 4 ? 'siege' : cp >= 3 ? 'prep' : 'route';
    const at = opts.at || CP_AT[Math.min(cp, CP_AT.length - 1)];
    pl.reset(at[0], at[1], cp >= 3 ? Math.PI / 2 : -Math.PI / 2);
    if (opts.restore) pl.restore(opts.restore);
    const r = pl.rig;
    r.shirtMat.color.setHex(0x14124a);
    r.setColors(null, pl.accent, null);
    r.stripes.forEach((s) => { s.visible = true; });
    r.pantsMat.color.setHex(0x0d0d2b);
    const inv = pl.inv;
    inv.batteries = Math.max(inv.batteries, this.radioDone ? 0 : 4);
    pl.setWeapon(inv.shotgun ? 'shotgun' : inv.pistol ? 'pistol' : inv.rod ? 'rod' : inv.backpack ? 'bag' : 'fists');
    pl.syncHeld();
    G.hud.setCombat(true);
    G.hud.setMats(true);
    G.hud.setTag('CHAPTER 7 · SURVIVE AND ESCAPE');
    G.camRig.configure(this.camCfg);
    G.camRig.yaw = cp >= 3 ? -Math.PI / 2 : Math.PI / 2;
    G.camRig.pitch = 0.32;
    G.fx.setMotes(true, new THREE.Vector3(46, 14, 46));
    G.audio.setMood(this.phase === 'route' ? 'tense' : 'calm');
    this.enableTakedown();
    // barricade state from the checkpoint
    if (Array.isArray(g.bars)) {
      g.bars.forEach((s, i) => { const b = this.bars[i]; if (b && s.built) { b.built = true; b.hp = s.hp || b.maxHp; } });
    }
    for (const b of this.bars) this._setBarVisual(b);
    this.gotStash = cp >= 4;
    if (this.phase === 'route') {
      // zombies + loot for the zones still ahead of the checkpoint
      ZONES.forEach((list, zi) => {
        if (zi < cp) return;
        for (const [type, x, z, o] of list) this.addZombie(type, x, z, { idle: true, stealth: true, sight: type === 'screamer' ? 13 : 11, ...o });
      });
      LOOTS.forEach((list, zi) => { if (zi >= (cp === 0 ? 0 : cp + 1)) list.forEach(([t, x, z]) => this.addLoot(t, x, z, zi)); });
      G.hud.setObjectives('FIND A SAFE PLACE', [
        { id: 'safe', text: 'Reach the lit metro station (follow the green beacon, west)' },
        { id: 'craft', text: 'Craft supplies at a workbench (optional)' }
      ]);
      G.hud.setWaypoint({ x: GATE.x + 2, z: GATE.z });
      this._saveCp(cp, at);
    } else {
      this.entered = true;
      G.hud.setStealth(null);
      if (this.phase === 'prep') {
        this.prepT = PREP_TIME;
        G.hud.setObjectives('PREPARE FOR THE NIGHT', [
          { id: 'bars', text: `Barricade the 3 entrances (${this.bars.filter((b) => b.built).length}/3)` },
          { id: 'night', text: this._nightText() }
        ]);
        this._saveCp(3, at);
      } else if (this.phase === 'siege') {
        this.wave = g.wave || 1;
        this.lobThrow = false;
        G.hud.setObjectives('SURVIVE THE NIGHT', [{ id: 'night', text: 'Nightfall...' }]);
        G.hud.banner('THE NIGHT CONTINUES', `WAVE ${this.wave} OF ${WAVES} IN A MOMENT`, 3000);
        this.after(7, () => { if (!this.disposed) this._startWave(this.wave); });
        this._saveCp(4, at, { wave: this.wave, bars: this._barState() });
      } else {
        this.lobThrow = false;
        G.hud.setObjectives('THE SIGNAL', [{ id: 'radio', text: 'Power the radio with the batteries (west end)' }]);
        G.hud.setWaypoint({ x: RADIO.x + 2.4, z: RADIO.z });
        this.dawnK = 1;
        this.scene.fog.color.setHex(0x7a3060);
        this.scene.fog.density = 0.012;
        this.scene.backgroundIntensity = 1.1;
        this.lights.hemi.color.setHex(0xffa27a);
        this._saveCp(5, at, { bars: this._barState() });
      }
    }
    G.hud.fade(false);
    G.hud.banner('CHAPTER 7', 'SURVIVE AND ESCAPE', 3200);
    if (this.phase === 'route' && cp === 0) {
      G.hud.sayLines([
        ['AARAV', 'The dock door... we are out. Four batteries still in my bag.'],
        ['AARAV', 'I need walls. Somewhere to hold. There is a green light in the west - the old Metro Relief Station.'],
        ['', 'Scavenge SCRAP, CLOTH and WOOD on the way. Workbenches turn them into barricade kits, medkits and ammo.']
      ]);
    }
  }

  update(dt) {
    const pl = G.player;
    if (pl.hidden && this.time - this.hideAt > 0.5 && (G.input.consume('interact') || Math.hypot(G.input.mx, G.input.my) > 0.4)) this._unhide();
    this.baseUpdate(dt);
    const px = pl.pos.x, pz = pl.pos.z, t = this.time;
    this.pLight.position.set(px, 3.2, pz + 0.8);
    // route checkpoints, the gate call and the moment the player is inside
    if (this.phase === 'route') {
      if (px < 14) this._routeCp(1);
      if (px < -33) this._routeCp(2);
      if (!this.gateCalled && px < -54 && pz > -8 && pz < 8) {
        this.gateCalled = true;
        G.hud.say('MEERA', 'Over here! The gate - through the gate, hurry!');
      }
      if (px < -64.5) this._enterStation();
      if (this.cp === 0 && !this.hints.bench && px > 36 && px < 52 && Math.abs(pz + 3) < 8) {
        this.hints.bench = true;
        G.hud.say('', 'A WORKBENCH. Craft barricade kits, medkits and ammo from scrap, cloth and wood. Use (E) to open it.');
      }
      if (this.cp === 0 && !this.hints.stealth && px < 40) {
        this.hints.stealth = true;
        G.hud.say('', 'Same rules as the store: crouch (C) to sneak, bottles (K) lure the dead, USE behind a zombie is a silent takedown.');
      }
    }
    // stealth indicator + music (route only)
    if (this.phase === 'route') {
      let spotted = false, caution = false;
      for (const e of this.enemies) {
        if (!e.alive) continue;
        if (e.aware) spotted = true;
        else if (e.stealth && (e.alert > 0.25 || e.state === 'investigate')) caution = true;
      }
      G.hud.setStealth(pl.hidden ? 'HIDDEN' : spotted ? 'SPOTTED' : caution ? 'CAUTION' : 'UNSEEN');
      if (spotted !== this._spotted) { this._spotted = spotted; G.audio.setMood(spotted ? 'combat' : 'tense'); }
    }
    // preparation countdown
    if (this.phase === 'prep') {
      this.prepT -= dt;
      this._secT -= dt;
      if (this._secT <= 0) { this._secT = 1; G.hud.setObjText('night', this._nightText()); }
      if (this.prepT <= 0 && !this.nightQueued) {
        this.nightQueued = true;
        G.hud.banner('NIGHTFALL!', 'THEY ARE HERE', 2200);
        this._startWave(1);
      }
    }
    this._updateWave(dt);
    if (this.phase === 'siege') {
      this._secT -= dt;
      if (this._secT <= 0) { this._secT = 1; G.hud.setObjText('night', this._nightText()); }
    }
    // anything alerted outside the walls (gunfire wakes the plaza) joins the siege at the nearest entrance
    if ((this.phase === 'prep' || this.phase === 'siege') && (this._assignT = (this._assignT || 0) - dt) <= 0) {
      this._assignT = 1;
      for (const e of this.enemies) {
        if (!e.alive || !e.aware || e.siegeBar) continue;
        if (e.pos.x < -62.5 && e.pos.x > -98 && Math.abs(e.pos.z) < 13.5) continue; // already inside
        let best = null, bd = 1e9;
        for (const b of this.bars) { const d = Math.hypot(e.pos.x - b.x, e.pos.z - b.z); if (d < bd) { bd = d; best = b; } }
        e.siegeBar = best;
      }
    }
    // barricade visuals
    for (const b of this.bars) {
      if (b.shake > 0) {
        b.shake = Math.max(0, b.shake - dt);
        const a = b.shake * 0.25;
        b.group.position.set(b.x + (Math.random() - 0.5) * a, 0, b.z + (Math.random() - 0.5) * a);
      }
      b.frame.visible = !b.built && !b.busy && (this.phase === 'prep' || this.phase === 'siege');
    }
    // waypoint to the next job
    this._wpT -= dt;
    if (this._wpT <= 0) {
      this._wpT = 0.5;
      if (this.phase === 'prep' || (this.phase === 'siege' && this.lull)) {
        const open = this.bars.filter((b) => !b.built);
        if (open.length) {
          if (pl.inv.kits > 0) G.hud.setWaypoint({ x: open[0].at[0], z: open[0].at[1] });
          else G.hud.setWaypoint({ x: BENCHES[2][0], z: BENCHES[2][1] + 1.6 });
        } else G.hud.setWaypoint(null);
      }
    }
    // radio lights
    if (this.radioLed && !this.radioDone) this.radioLed.material.opacity = Math.sin(t * 3) > 0 ? 0.95 : 0.2;
    // beacon pulse + the dead on the ground
    if (this.beacon) this.beacon.material.opacity = 0.14 + Math.sin(t * 2.4) * 0.05;
    for (const n of this.npcs) n.update(dt, pl, t);
  }

  mapData() {
    const pl = G.player.pos;
    const pois = [];
    for (const it of this.interactables) if (!it.removed && it.active && it.map !== false) pois.push({ x: it.x, z: it.z, c: it.color, s: 'd' });
    for (const e of this.enemies) if (e.alive && (e.aware || this.phase === 'siege' || Math.hypot(e.pos.x - pl.x, e.pos.z - pl.z) < 14)) pois.push({ x: e.pos.x, z: e.pos.z, c: C.red, s: 'c' });
    for (const l of this.loot) pois.push({ x: l.x, z: l.z, c: LOOT[l.type].color, s: 'c' });
    for (const n of Object.values(this.npcMap)) pois.push({ x: n.pos.x, z: n.pos.z, c: C.blue, s: 'c' });
    return pois;
  }

  exit() {
    G.hud.redAlert(false);
    G.hud.setStealth(null);
    G.hud.setMats(false);
    G.timeScale = 1;
    const pl = G.player;
    pl.hidden = false;
    pl.hideSpot = null;
    pl.rig.root.visible = true;
    pl.rig.root.removeFromParent();
  }
}
