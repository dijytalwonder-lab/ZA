import * as THREE from 'three';
import { Stage, LOOT } from './stage.js';
import { G } from '../core/state.js';
import { C, hex, nbox, led, glow, glowSign, basic, boxGeo, cylGeo, makeCanvas, gridTexture, holoPanel } from '../core/kit.js';
import { addLights, addHoloAd } from './cityKit.js';
import { NPC } from '../entities/npc.js';
import { mulberry, pick } from '../core/util.js';

/* ---------------- layout (interior x -24..24, z -17..17; the shop door is on the south wall) ---------------- */
const ENTRY = { x: 0, z: -14.2 };
const DESK = { x: 0, z: 8.2 };
const LOCKER = { x: 0, z: 16.2 };
const DOOR = { x: 0, z: 12.4 };
const DOCK = { x: 22.5, z: -12.3 };

const PAL = {
  food: { edge: C.orange, colors: ['#ff8a2b', '#ffe94d', '#ff3d8b', '#39ff9a'] },
  drink: { edge: C.cyan, colors: ['#00f0ff', '#2a6bff', '#39ff9a', '#ff2bd6'] },
  pharma: { edge: C.green, colors: ['#39ff9a', '#ffffff', '#00f0ff', '#ff3d8b'] },
  tech: { edge: C.violet, colors: ['#9b4dff', '#00f0ff', '#ffe94d', '#ff2bd6'] },
  goods: { edge: C.pink, colors: ['#ff2bd6', '#00f0ff', '#ffe94d', '#9b4dff', '#ff8a2b'] }
};

/** The four supplies (pallet at x,z of size w x d). Pick them up in any order; cp = where a retry puts you. */
const SUP = [
  { id: 'food', x: -18, z: 10.2, w: 1.9, d: 1.3, cp: [-13.5, 9.0], color: C.orange, label: 'GRAB FOOD', obj: 'Find FOOD (west aisles)' },
  { id: 'water', x: 18, z: 10.2, w: 1.9, d: 1.3, cp: [13.5, 9.0], color: C.cyan, label: 'GRAB WATER', obj: 'Find WATER (east coolers)' },
  { id: 'med', x: -21.5, z: 15.55, w: 1.6, d: 0.9, cp: [-10.8, 14.6], color: C.green, label: 'GRAB MEDICINE', obj: 'Find MEDICINE (pharmacy)' },
  { id: 'bat', x: 18.5, z: 15.55, w: 1.6, d: 0.9, cp: [9.5, 14.5], color: C.violet, label: 'GRAB BATTERIES', obj: 'Find BATTERIES (electronics)' }
];

/* idle (stealth) zombies: type, x, z, options */
const ZS = [
  ['walker', -6.5, -10.2, { still: true, yaw: -Math.PI / 2 }],                         // tutorial: back turned at the checkout
  ['walker', 9.5, -12.5, { patrol: [[9.5, -12.5], [17.5, -12.5]] }],                   // lobby patrol
  ['walker', -18, -4.5, { patrol: [[-18, -5], [-18, 7.5]] }],                          // food aisle
  ['runner', -22.6, -3, { still: true, yaw: Math.PI }],                                // food wing, west wall
  ['walker', 18, -4.5, { patrol: [[18, -5], [18, 7.5]] }],                             // drinks aisle
  ['spitter', 22.4, 3.5, { still: true, yaw: -Math.PI / 2 }],                          // drinks wing, east wall
  ['walker', -16, 14.9, { still: true, yaw: Math.PI }],                                // pharmacist
  ['walker', 12.4, 14.45, { patrol: [[12.4, 14.45], [22.4, 14.45]] }],                 // electronics
  ['walker', -2, 0, { patrol: [[-2, -0.5], [-2, 9.8], [2, 9.8], [2, -0.5]] }],         // centre sweep
  ['screamer', 6.8, 10.6, { still: true, yaw: 0.3, sight: 13 }],                       // guards the customer desk
  ['walker', -6, 10.6, { still: true, yaw: 2.6 }]                                      // guards the other side
];
/* auto-pickup loot: type, x, z */
const LOOTS = [
  ['bottle', -13.5, -8.0], ['bottle', 13.5, -8.0], ['ammo', -22.8, -7.0], ['bottle', 22.8, -6.8],
  ['bottle', -13, 5.5], ['bottle', 13, 5.0], ['shells', -6.5, 12.4], ['ammo', 6.5, 12.6],
  ['food', 23, 8.4], ['ammo', -13, 11.2], ['bottle', 0, -6.5], ['medkit', -23, 5.5]
];
const CRATES = [[-22.6, -14.2], [22.6, -14.2], [-12.8, -6.6], [12.8, -6.6], [-22.6, 10.6], [22.6, 10.8]];
const LOCKERS = [
  { x: -22.8, z: -9.5, ox: 1.9, out: 0 }, { x: 22.8, z: -2.0, ox: -1.6, out: 0 },
  { x: -9.6, z: 11.2, ox: 0, out: -1.9 }, { x: 9.6, z: 11.2, ox: 0, out: -1.9 }
];

export class MartStage extends Stage {
  constructor() {
    super('mart');
    this.chapter = 6;
    this.stealthy = true;
    this.combat = true;
    this.lobThrow = true;
    this.flickerLevel = 0.4;
    this.bounds = { minX: -23.5, maxX: 23.5, minZ: -16.5, maxZ: 16.5 };
    this.mapRange = 26;
    this.spawn = { x: ENTRY.x, z: ENTRY.z, yaw: 0 };
    this.camCfg = {
      dist: 5.0, height: 1.5, minPitch: 0.1, maxPitch: 1.15, fov: 62,
      bounds: { minX: -23.7, maxX: 23.7, minZ: -16.7, maxZ: 16.7, minY: 0.6, maxY: 5.6 },
      block: (p) => this._camBlocked(p)
    };
    this.got = { food: false, water: false, med: false, bat: false, key: false, weap: false };
    this.phase = 'sneak';
    this.p2 = false;
    this.doorOpen = false;
    this.shutterDown = false;
    this.finished = false;
    this.qte = false;
    this.hints = {};
    this.crates = [];
    this.sups = [];
    this._spotted = null;
    this._wpT = 0;
    this._faces = {};
    this.alarmOn = false;
  }

  _camBlocked(p) {
    for (const c of this.colliders) {
      if (!c.off && p.y < c.h && p.x > c.minX - 0.15 && p.x < c.maxX + 0.15 && p.z > c.minZ - 0.15 && p.z < c.maxZ + 0.15) return true;
    }
    return false;
  }

  /* ================= build ================= */
  async load() {
    this.scene.background = new THREE.Color(0x07031a);
    this.scene.environment = G.assets.env;
    this.scene.fog = new THREE.FogExp2(0x120833, 0.016);
    this.lights = addLights(this, { sky: 0x7a64ff, ground: 0x24124a, hemi: 0.78, dirColor: 0x9a80ff, dir: 0.25, dirPos: [-10, 30, 10] });
    this.pLight = new THREE.PointLight(0x9a7cff, 3.6 * Math.PI, 9, 1.6);
    this.scene.add(this.pLight);
    this.alarmLight = new THREE.PointLight(0xff1030, 0, 40, 1.3);
    this.alarmLight.position.set(0, 5, 0);
    this.scene.add(this.alarmLight);
    const mk = (color, I, d, x, y, z) => { const l = new THREE.PointLight(color, I * Math.PI, d, 1.6); l.position.set(x, y, z); this.scene.add(l); return l; };
    mk(0xff8a2b, 6, 15, -18, 4.2, 3);     // food
    mk(0x00c8ff, 6, 15, 18, 4.2, 3);      // drinks
    mk(0x39ff9a, 5, 11, -17, 4.2, 15);    // pharmacy
    mk(0x9b4dff, 5, 11, 17, 4.2, 15);     // electronics
    mk(0xff2bd6, 5, 17, 0, 4.8, 1);       // centre
    this._shell();
    this._lobby();
    this._shelves();
    this._counters();
    this._office();
    this._supplies();
    this._lockers();
    this._crates();
    this._dock();
    this._decor();
  }

  _put(m, x, y, z, ry = 0) { m.position.set(x, y, z); m.rotation.y = ry; this.scene.add(m); return m; }

  _wall(w, h, x, y, z, ry) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ color: 0x150c3e, side: THREE.DoubleSide }));
    m.position.set(x, y, z);
    m.rotation.y = ry;
    this.scene.add(m);
    return m;
  }

  _shell() {
    const s = this.scene;
    const gt = gridTexture('#2a6bff', '#0a0624', 8);
    gt.repeat.set(12, 8.5);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(48, 34), new THREE.MeshStandardMaterial({ map: gt, roughness: 0.3, metalness: 0.5, envMapIntensity: 1.1 }));
    floor.rotation.x = -Math.PI / 2;
    s.add(floor);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(48, 34), new THREE.MeshLambertMaterial({ color: 0x0b0626, side: THREE.DoubleSide }));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = 6.4;
    s.add(ceil);
    // ceiling light strips
    for (let i = 0; i < 6; i++) {
      const z = -13.5 + i * 5.4;
      const l = led(46, 0.07, 0.28, i % 2 ? C.cyan : C.pink, 0.9);
      l.position.set(0, 6.32, z);
      s.add(l);
      if (i % 2) { l.material = l.material.clone(); this.flicker(l.material, 0.5); }
    }
    // outer walls (south wall has the shop door gap -3..3)
    this._wall(21, 6.4, -13.5, 3.2, -17, 0);
    this._wall(21, 6.4, 13.5, 3.2, -17, 0);
    this._wall(48, 6.4, 0, 3.2, 17, Math.PI);
    this._wall(34, 6.4, -24, 3.2, 0, Math.PI / 2);
    this._wall(34, 6.4, 24, 3.2, 0, -Math.PI / 2);
    this.addCollider(-25, -3, -18, -17, 6.4);
    this.addCollider(3, 25, -18, -17, 6.4);
    this.addCollider(-25, 25, 17, 18, 6.4);
    this.addCollider(-25, -24, -18, 18, 6.4);
    this.addCollider(24, 25, -18, -11.5, 6.4);     // east wall, with the dock opening -11.5..-6.5
    this.addCollider(24, 25, -6.5, 18, 6.4);
    this.dockCol = this.addCollider(23.9, 25, -11.5, -6.5, 6.4); // the roller door itself
    // floor / wall trim strips
    for (const z of [-16.9, 16.9]) { const t = led(47.6, 0.07, 0.1, C.violet, 0.8); t.position.set(0, 0.05, z); s.add(t); const u = led(47.6, 0.07, 0.1, C.pink, 0.9); u.position.set(0, 3.4, z); s.add(u); }
    for (const x of [-23.9, 23.9]) { const t = led(0.1, 0.07, 33.6, C.violet, 0.8); t.position.set(x, 0.05, 0); s.add(t); const u = led(0.1, 0.07, 33.6, C.cyan, 0.9); u.position.set(x, 3.4, 0); s.add(u); }
    // department floor glow
    const zone = (cx, cz, w, d, col) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), basic(col, { opacity: 0.09, add: true }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(cx, 0.03, cz);
      s.add(m);
    };
    zone(-18, 2.5, 9, 18, C.orange);
    zone(18, 2.5, 9, 18, C.cyan);
    zone(-18, 15, 11.5, 4.5, C.green);
    zone(17, 15, 12.5, 4.5, C.violet);
    zone(0, -10.5, 8, 4, C.pink);
    // signs
    const sign = (txt, col, x, y, z, ry, w = 5) => {
      const m = glowSign(txt, col, w);
      this._put(m, x, y, z, ry);
      this.flicker(m.userData.mat, 0.6);
      const g = glow(col, w * 1.1, 0.3);
      g.position.set(x, y, z);
      s.add(g);
    };
    sign('FRESH FOOD', C.orange, -23.8, 4.6, 2.5, Math.PI / 2);
    sign('COLD DRINKS', C.cyan, 23.8, 4.6, 2.5, -Math.PI / 2);
    sign('PHARMACY', C.green, -18, 4.6, 16.85, Math.PI);
    sign('POWER & TECH', C.violet, 17.5, 4.6, 16.85, Math.PI, 5.4);
    sign('SECURITY', C.red, 0, 4.2, 16.85, Math.PI, 4);
    sign('CITY MART', C.green, 0, 5.1, -16.85, 0, 8);
    sign('CHECKOUT', C.pink, 0, 4.4, -9.5, Math.PI, 3.6);
    sign('EXIT', C.red, 23.8, 4.3, -9.0, -Math.PI / 2, 2.4);
  }

  /** Entrance doors, the shutter that slams behind the player, carts and vending machines. */
  _lobby() {
    const s = this.scene;
    for (const x of [-3, 3]) { const f = led(0.14, 4.4, 0.14, C.green); f.position.set(x, 2.2, -16.9); s.add(f); }
    const top = led(6.2, 0.14, 0.14, C.green);
    top.position.set(0, 4.4, -16.9);
    s.add(top);
    const gl = new THREE.Mesh(boxGeo(6, 4.3, 0.05), basic(0x2aff9a, { opacity: 0.12 }));
    gl.position.set(0, 2.15, -16.95);
    s.add(gl);
    this.shutter = nbox(6.1, 4.6, 0.3, 0x2a2a55, C.red);
    this.shutter.position.set(0, 7.5, -16.8);
    s.add(this.shutter);
    this.shutterCol = this.addCollider(-3, 3, -17.6, -16.5, 6);
    this.shutterCol.off = true;
    // carts + vending machines
    for (const [x, z, r] of [[-6, -15.2, 0.3], [-7.3, -14.4, -0.2], [6.4, -15.4, 0.1]]) {
      const c = nbox(0.7, 0.9, 1.0, 0x1a1040, C.white);
      this._put(c, x, 0.45, z, r);
      this.addBoxCollider(x, z, 0.95, 0.95, 0.9);
    }
    for (const [x, col] of [[-20, C.pink], [-17.4, C.cyan], [17.4, C.yellow], [20, C.pink]]) {
      const v = nbox(1.4, 2.1, 0.9, 0x120a30, col);
      this._put(v, x, 1.05, -16.2);
      this.addBoxCollider(x, -16.2, 1.4, 0.9, 2.1);
      const f = led(1.1, 1.5, 0.04, col, 0.85);
      f.position.set(x, 1.15, -15.72);
      s.add(f);
      const g = glow(col, 3.2, 0.35);
      g.position.set(x, 1.2, -15.2);
      s.add(g);
    }
  }

  /** Product face material for a palette (a canvas texture of glowing shelf stock). */
  _faceMat(key) {
    if (this._faces[key]) return this._faces[key];
    const pal = PAL[key];
    const W = 256, H = 160, rows = 3, rh = H / rows;
    const c = makeCanvas(W, H), g = c.getContext('2d');
    g.fillStyle = '#07041a';
    g.fillRect(0, 0, W, H);
    const rng = mulberry(key.length * 977 + 13);
    for (let r = 0; r < rows; r++) {
      let x = 4;
      while (x < W - 14) {
        const w = 12 + rng() * 14, h = 20 + rng() * (rh - 34);
        g.globalAlpha = 0.9;
        g.fillStyle = pal.colors[(rng() * pal.colors.length) | 0];
        g.fillRect(x, r * rh + rh - 8 - h, w, h);
        g.globalAlpha = 0.5;
        g.fillStyle = '#ffffff';
        g.fillRect(x + 2, r * rh + rh - 8 - h * 0.55, w - 4, 3);
        x += w + 3 + rng() * 5;
      }
      g.globalAlpha = 1;
      g.fillStyle = hex(pal.edge);
      g.shadowColor = hex(pal.edge);
      g.shadowBlur = 6;
      g.fillRect(0, r * rh + rh - 6, W, 3);
      g.shadowBlur = 0;
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    const mat = new THREE.MeshBasicMaterial({ map: tex });
    this._faces[key] = mat;
    return mat;
  }

  /** A tall shelf unit (blocks sight while standing AND crouching). axis = the direction it runs. */
  _shelf(cx, cz, len, axis, pal, h = 2.0, depth = 0.9) {
    const w = axis === 'x' ? len : depth, d = axis === 'x' ? depth : len;
    const body = nbox(w, h, d, 0x15103a, PAL[pal].edge);
    this._put(body, cx, h / 2, cz);
    this.addBoxCollider(cx, cz, w, d, h);
    const mat = this._faceMat(pal);
    for (const side of [-1, 1]) {
      const geo = new THREE.PlaneGeometry(len, h - 0.3);
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * len / 3.2);
      const m = new THREE.Mesh(geo, mat);
      const off = depth / 2 + 0.012;
      if (axis === 'x') { m.position.set(cx, h / 2, cz + side * off); m.rotation.y = side > 0 ? 0 : Math.PI; }
      else { m.position.set(cx + side * off, h / 2, cz); m.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2; }
      this.scene.add(m);
    }
    const cap = led(w, 0.05, d, PAL[pal].edge, 0.9);
    cap.position.set(cx, h + 0.03, cz);
    this.scene.add(cap);
    const g = glow(PAL[pal].edge, Math.min(4.2, len * 0.6), 0.28);
    g.position.set(cx, h + 0.4, cz);
    this.scene.add(g);
  }

  /** A low counter / table. h<=1.2 so it hides a crouching player but not a standing one. */
  _counter(cx, cz, w, d, col, h = 1.1) {
    const m = nbox(w, h, d, 0x1a1245, col);
    this._put(m, cx, h / 2, cz);
    const top = led(w + 0.05, 0.05, d + 0.05, col, 0.9);
    top.position.set(cx, h + 0.03, cz);
    this.scene.add(top);
    this.addBoxCollider(cx, cz, w, d, h);
    return m;
  }

  _shelves() {
    // food wing (west) and cold drinks (east): two N-S columns each, with a gap to cross
    for (const [x, pal] of [[-20, 'food'], [-16, 'food'], [16, 'drink'], [20, 'drink']]) {
      this._shelf(x, -3.4, 5.2, 'z', pal);
      this._shelf(x, 4.9, 6.2, 'z', pal);
    }
    // centre rows of general goods, an open aisle down the middle
    for (const z of [-3, 3.5]) {
      this._shelf(-7.4, z, 7.6, 'x', 'goods');
      this._shelf(7.4, z, 7.6, 'x', 'goods');
    }
    // wall racks behind the pharmacy and electronics counters
    this._shelf(-18, 16.45, 11, 'x', 'pharma', 2.0, 0.8);
    this._shelf(17.5, 16.45, 12, 'x', 'tech', 2.0, 0.8);
  }

  _counters() {
    // checkout lanes
    for (const x of [-15, -10.5, 10.5, 15]) {
      this._counter(x, -10.3, 0.9, 3.2, C.pink);
      const reg = nbox(0.6, 0.5, 0.6, 0x0a0a22, C.cyan);
      this._put(reg, x, 1.4, -11.4);
      const rg = glow(C.cyan, 1.2, 0.5);
      rg.position.set(x, 1.5, -11.2);
      this.scene.add(rg);
    }
    // pharmacy counter (open at its east end) and electronics display tables (gap in the middle)
    this._counter(-18.05, 13.2, 11.1, 0.9, C.green);
    this._counter(13.4, 13.4, 5.8, 0.9, C.violet, 1.0);
    this._counter(19.85, 13.4, 4.3, 0.9, C.violet, 1.0);
    for (const x of [13.4, 19.85]) {
      const tv = holoPanel(['TECH', 'SALE'], C.violet, 1.6, 0.9);
      this._put(tv, x, 1.6, 13.4, Math.PI); // faces the shop floor (south)
      this.flicker(tv.userData.mat, 0.8);
    }
    // customer-service desk in the middle (the keycard is here)
    this._counter(DESK.x, DESK.z, 4.4, 0.9, C.yellow);
    const hd = holoPanel(['HELP', 'DESK'], C.yellow, 1.8, 1.0);
    this._put(hd, DESK.x, 1.9, DESK.z + 0.3, Math.PI);
    this.flicker(hd.userData.mat, 0.7);
    // low produce bins: cover for sneaking
    for (const [x, z] of [[-9.5, 7.0], [9.5, 7.0], [-5.5, -6.3], [5.5, -6.3]]) {
      const b = nbox(1.8, 1.0, 1.0, 0x1e4a2e, C.green);
      this._put(b, x, 0.5, z);
      this.addBoxCollider(x, z, 1.8, 1.0, 1.0);
    }
  }

  /** The security office: walls, a keycard door and the weapons locker. */
  _office() {
    const s = this.scene;
    const wallH = 3.4;
    const wall = (minX, maxX, minZ, maxZ) => {
      const m = nbox(maxX - minX, wallH, maxZ - minZ, 0x1a0c30, C.red);
      this._put(m, (minX + maxX) / 2, wallH / 2, (minZ + maxZ) / 2);
      this.addCollider(minX, maxX, minZ, maxZ, wallH);
    };
    wall(-4.8, -4.3, 12.1, 17);
    wall(4.3, 4.8, 12.1, 17);
    wall(-4.8, -1.3, 12.1, 12.7);
    wall(1.3, 4.8, 12.1, 12.7);
    this.doorMesh = nbox(2.6, 3.0, 0.3, 0x2a1030, C.red);
    this._put(this.doorMesh, DOOR.x, 1.5, DOOR.z);
    this.doorCol = this.addCollider(-1.3, 1.3, 12.1, 12.7, 3.4);
    const dg = glow(C.red, 3, 0.7);
    dg.position.set(0, 3.1, 12.1);
    s.add(dg);
    // inside: monitors + weapon locker
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(8.6, 4.4), basic(C.red, { opacity: 0.1, add: true }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0.04, 14.9);
    s.add(floor);
    const desk = nbox(3.0, 0.9, 0.9, 0x1a1245, C.red);
    this._put(desk, -2.6, 0.45, 15.9);
    this.addBoxCollider(-2.6, 15.9, 3.0, 0.9, 0.9);
    for (const [x, t] of [[-3.4, 'CAM 1'], [-2.6, 'CAM 2'], [-1.8, 'CAM 3']]) {
      const m = holoPanel([t, 'NO SIGNAL'], C.red, 0.75, 0.55);
      this._put(m, x, 1.45, 16.1, Math.PI);
      this.flicker(m.userData.mat, 1.4);
    }
    this.locker = nbox(3.4, 2.1, 0.8, 0x1a1030, C.orange);
    this._put(this.locker, LOCKER.x, 1.05, LOCKER.z + 0.5);
    this.addBoxCollider(LOCKER.x, LOCKER.z + 0.5, 3.4, 0.8, 2.1);
    const lg = glow(C.orange, 4, 0.6);
    lg.position.set(LOCKER.x, 1.3, LOCKER.z - 0.4);
    s.add(lg);
    const ls = glowSign('WEAPONS', C.orange, 2.4);
    this._put(ls, LOCKER.x, 2.6, LOCKER.z - 0.05, Math.PI);
    this.flicker(ls.userData.mat, 0.5);
    const rl = new THREE.PointLight(0xff3040, 4 * Math.PI, 9, 1.6);
    rl.position.set(0, 3, 14.8);
    s.add(rl);
    // interactables: keycard on the desk, the door and the locker
    this.keyIt = this.addInteractable({
      x: DESK.x, z: DESK.z, r: 2.1, y: 1.0, color: C.yellow, label: 'TAKE SECURITY KEYCARD',
      enabled: () => this.p2 && !this.got.key,
      onUse: () => this._takeKey()
    });
    this.doorIt = this.addInteractable({
      x: DOOR.x, z: DOOR.z - 1.1, r: 2.2, y: 1.2, color: C.red,
      label: () => (G.player.inv.keycard ? 'OPEN SECURITY DOOR' : 'LOCKED - KEYCARD NEEDED'),
      enabled: () => this.p2 && !this.doorOpen,
      onUse: () => this._openDoor()
    });
    this.lockIt = this.addInteractable({
      x: LOCKER.x, z: LOCKER.z - 0.9, r: 2.2, y: 1.2, color: C.orange, label: 'OPEN WEAPONS LOCKER',
      enabled: () => this.doorOpen && !this.got.weap,
      onUse: () => this._openLocker()
    });
  }

  /** A supply pallet + its interactable. */
  _supplies() {
    for (const sp of SUP) {
      const g = new THREE.Group();
      g.position.set(sp.x, 0, sp.z);
      const base = nbox(sp.w, 0.18, sp.d, 0x1a1245, sp.color);
      base.position.y = 0.09;
      g.add(base);
      const rng = mulberry(sp.id.length * 31 + 5);
      for (let i = 0; i < 6; i++) {
        const b = nbox(0.4 + rng() * 0.15, 0.3 + rng() * 0.2, Math.min(0.5, sp.d - 0.3), 0x120a30, sp.color);
        b.position.set((i % 3 - 1) * (sp.w / 3.4), 0.35 + Math.floor(i / 3) * 0.42, (rng() - 0.5) * 0.15);
        b.rotation.y = (rng() - 0.5) * 0.3;
        g.add(b);
      }
      const gl = glow(sp.color, 3.4, 0.5);
      gl.position.y = 0.9;
      g.add(gl);
      this.scene.add(g);
      sp.col = this.addBoxCollider(sp.x, sp.z, sp.w, sp.d, 0.95);
      sp.vis = g;
      sp.it = this.addInteractable({
        x: sp.x, z: sp.z, r: 2.3, y: 1.0, color: sp.color, label: sp.label,
        enabled: () => !this.got[sp.id] && this.phase === 'sneak',
        onUse: () => this._take(sp)
      });
    }
  }

  _lockers() {
    for (const l of LOCKERS) {
      const m = nbox(1.0, 2.0, 1.0, 0x16301e, C.green);
      this._put(m, l.x, 1.0, l.z);
      this.addBoxCollider(l.x, l.z, 1.0, 1.0, 2.0);
      for (let i = 0; i < 3; i++) {
        const v = led(0.6, 0.04, 0.04, C.green, 0.8);
        v.position.set(l.x, 1.5 + i * 0.12, l.z + (l.out > 0 ? 0.52 : l.out < 0 ? -0.52 : 0));
        this.scene.add(v);
      }
      this.hides = this.hides || [];
      this.hides.push(l);
      this.addInteractable({
        x: l.x, z: l.z, r: 2.1, y: 1.0, color: C.green, label: 'HIDE (LOCKER)',
        enabled: () => !G.player.hidden && !G.player.dead && this.phase === 'sneak',
        onUse: () => this._hide(l)
      });
    }
  }

  _crates() {
    const rng = mulberry(77);
    for (const [x, z] of CRATES) {
      const m = nbox(1.0, 0.9, 1.0, 0x3a2418, C.yellow);
      this._put(m, x, 0.45, z);
      this.addBoxCollider(x, z, 1.1, 1.1, 0.9);
      const c = { x, z, m, loot: [pick(['ammo', 'bottle', 'shells', 'food', 'bottle'], rng), pick(['medkit', 'ammo', 'bottle', 'shells'], rng)] };
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
    const dz = c.z < 0 ? 1.4 : -1.4;
    c.loot.forEach((t, i) => this.addLoot(t, c.x + (i ? 1.1 : -1.1), c.z + dz, 9));
    G.hud.toast('FOUND SUPPLIES', 'gold');
  }

  /** The loading dock: roller door on the east wall + the power panel. */
  _dock() {
    const s = this.scene;
    this.dockDoor = nbox(0.3, 3.8, 5.0, 0x1a1a40, C.red);
    this._put(this.dockDoor, 23.7, 1.9, -9.0);
    for (let i = 0; i < 6; i++) {
      const l = led(0.04, 0.05, 4.8, C.red, 0.7);
      l.position.set(23.5, 0.5 + i * 0.6, -9.0);
      s.add(l);
    }
    // freezer door (bursts open during the escape)
    this.freezer = nbox(0.3, 3.0, 1.8, 0x16304a, C.cyan);
    this._put(this.freezer, 23.7, 1.5, -4.6);
    const fz = glowSign('FREEZER', C.cyan, 1.8);
    this._put(fz, 23.5, 3.5, -4.6, -Math.PI / 2);
    this.flicker(fz.userData.mat, 0.5);
    this.dockGlow = glow(C.green, 7, 0);
    this.dockGlow.material = this.dockGlow.material.clone();
    this.dockGlow.position.set(23.2, 2.2, -9.0);
    s.add(this.dockGlow);
    const panel = nbox(0.3, 1.0, 0.8, 0x0a0a22, C.red);
    this._put(panel, 23.6, 1.3, -12.3);
    this.panelGlow = glow(C.red, 1.6, 0.9);
    this.panelGlow.material = this.panelGlow.material.clone();
    this.panelGlow.position.set(23.2, 1.5, -12.3);
    s.add(this.panelGlow);
    this.dockIt = this.addInteractable({
      x: DOCK.x, z: DOCK.z, r: 2.3, y: 1.1, color: C.green, label: 'INSTALL BATTERIES (TAP FAST!)',
      enabled: () => this.phase === 'escape' && !this.finished && !this.qte,
      onUse: () => this._dockQTE()
    });
  }

  _decor() {
    const rng = mulberry(404);
    // spilled cans on the floor (one instanced mesh)
    const N = 46;
    const cans = new THREE.InstancedMesh(cylGeo(0.06, 0.06, 0.18, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }), N);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), col = new THREE.Color();
    const cols = [C.pink, C.cyan, C.yellow, C.orange, C.green, C.violet];
    for (let i = 0; i < N; i++) {
      const x = (rng() - 0.5) * 44, z = (rng() - 0.5) * 30;
      e.set(Math.PI / 2, 0, rng() * 6.28);
      q.setFromEuler(e);
      m4.compose(new THREE.Vector3(x, 0.07, z), q, new THREE.Vector3(1, 1, 1));
      cans.setMatrixAt(i, m4);
      cans.setColorAt(i, col.setHex(cols[(rng() * cols.length) | 0]));
    }
    this.scene.add(cans);
    // posters
    const ads = [
      [-23.8, 4.6, -9, ['SALE', '50% OFF'], C.pink, Math.PI / 2], [23.8, 3.3, 8, ['STAY', 'HOME'], C.red, -Math.PI / 2],
      [-12, 5.0, -16.85, ['EAT', 'FRESH'], C.orange, 0], [12, 5.0, -16.85, ['BUY 1', 'GET 1'], C.cyan, 0]
    ];
    for (const [x, y, z, lines, col, ry] of ads) addHoloAd(this, x, y, z, lines, col, ry, 3, 1.9);
    // bodies
    for (const [x, z] of [[-12.5, -13], [13, -5.4], [-7.5, 1.6], [4.5, 6.2], [-22.2, 0.5], [21.5, -7.5]]) {
      const n = new NPC({ x, z, mode: 'collapse', yaw: rng() * 6.28 });
      n.rig.p.lie = 1; n.rig.s.lie = 1;
      this.addNPC(n);
    }
  }

  /* ================= supplies / objectives ================= */
  _count() { return SUP.filter((s) => this.got[s.id]).length; }

  _take(sp) {
    if (this.got[sp.id]) return;
    this.got[sp.id] = true;
    sp.it.remove();
    sp.vis.visible = false;
    sp.col.off = true;
    const pl = G.player, inv = pl.inv;
    let t = '';
    if (sp.id === 'food') { inv.food = Math.min(6, inv.food + 3); t = 'FOOD +3'; }
    else if (sp.id === 'water') { inv.bottle = Math.min(6, inv.bottle + 4); t = 'WATER BOTTLES +4 (THROW THEM!)'; }
    else if (sp.id === 'med') { inv.medkit = Math.min(5, inv.medkit + 2); t = 'MEDKITS +2'; }
    else { inv.batteries = 4; t = 'BATTERIES x4'; }
    G.audio.sfx('pickup');
    G.hud.toast(t, 'gold');
    G.fx.burst(sp.x, 1, sp.z, sp.color, 18, 3, 0.7, 2);
    G.fx.ring(sp.x, 0, sp.z, sp.color, 3, 0.6);
    G.hud.completeObj(sp.id);
    this.makeNoise(sp.x, sp.z, 5);
    const n = this._count();
    this._saveCp(n, sp.cp);
    if (n === 4) this._phase2(false);
    else if (n === 1) G.hud.say('', 'Zombies hear noise and track it. Bottles can pull them away from your route.');
  }

  _phase2(silent) {
    this.p2 = true;
    G.hud.setObjectives('GET OUT ALIVE', [
      { id: 'key', text: 'Take the security keycard (customer desk, middle)' },
      { id: 'weap', text: 'Open the weapons locker (security office)' },
      { id: 'out', text: 'Escape through the loading dock' }
    ]);
    if (this.got.key) G.hud.completeObj('key', true);
    if (silent) return;
    G.hud.banner('SUPPLIES SECURED', 'NOW FIND THE SECURITY KEYCARD', 3000);
    G.hud.sayLines([
      ['AARAV', 'That should hold us for a while... but I need something to fight with.'],
      ['AARAV', 'The security office has a weapons locker. The keycard must be at the customer desk.']
    ]);
  }

  _takeKey() {
    this.got.key = true;
    G.player.inv.keycard = true;
    G.audio.sfx('pickup');
    G.hud.toast('SECURITY KEYCARD', 'gold');
    G.hud.completeObj('key');
    this._saveCp(5, [DESK.x, DESK.z - 2.2]);
    G.hud.say('AARAV', 'Got it. The security office is just north of here.');
  }

  _openDoor() {
    if (!G.player.inv.keycard) { G.audio.sfx('error'); G.hud.toast('LOCKED - FIND THE KEYCARD (CUSTOMER DESK)', 'red'); return; }
    this.doorOpen = true;
    this.doorIt.remove();
    this.doorCol.off = true;
    G.audio.sfx('door');
    this.makeNoise(DOOR.x, DOOR.z - 1, 9);
    const y0 = this.doorMesh.position.y;
    this.tween(0.7, (k) => { this.doorMesh.position.y = y0 + 3.2 * k; });
    G.hud.setWaypoint({ x: LOCKER.x, z: LOCKER.z - 1 });
  }

  _openLocker() {
    if (this.got.weap) return;
    this.got.weap = true;
    this.lockIt.remove();
    const pl = G.player, inv = pl.inv;
    inv.pistol = true;
    inv.shotgun = true;
    inv.ammo = Math.min(60, inv.ammo + 24);
    inv.shells = Math.min(24, inv.shells + 12);
    pl.setWeapon('shotgun');
    G.audio.sfx('pickup');
    G.hud.toast('WEAPONS: +24 AMMO  +12 SHELLS', 'gold');
    G.hud.completeObj('weap');
    G.fx.burst(LOCKER.x, 1.5, LOCKER.z - 0.5, C.orange, 20, 3, 0.7, 2);
    this._saveCp(6, [DOOR.x, DOOR.z - 1.4]);
    this._alarm(false);
  }

  _saveCp(cp, at) {
    G.saveCheckpoint({ chapter: 6, stage: 'mart', cp, got: { ...this.got }, at });
  }

  /* ================= alarm + escape ================= */
  _burst(list) {
    for (const [type, x, z] of list) {
      const zb = this.addZombie(type, x, z, {});
      zb.stagger(0.5);
      G.fx.burst(x, 1, z, C.red, 14, 3, 0.6, 3);
      G.fx.ring(x, 0, z, C.red, 3, 0.5);
    }
  }

  _alarm(restored) {
    if (this.phase === 'escape') return;
    this.phase = 'escape';
    this.alarmOn = true;
    G.audio.sirenOn(true, 0.11);
    G.audio.setMood('combat');
    G.hud.redAlert(true);
    G.hud.setObjectives('ESCAPE!', [
      { id: 'run', text: 'Run to the loading dock (east wall)' },
      { id: 'out', text: 'Install the batteries at the panel' }
    ]);
    G.hud.banner('SECURITY ALARM!', 'THE DEAD ARE COMING - GET TO THE LOADING DOCK', 3400);
    G.hud.setWaypoint({ x: DOCK.x, z: DOCK.z });
    G.hud.say('AARAV', 'The alarm! Everything in this city just heard that. RUN!');
    // every zombie in the shop comes to check the alarm; the street horde breaks in through the front
    this.makeNoise(0, 14, 90);
    this.after(restored ? 1.0 : 1.4, () => {
      if (this.disposed) return;
      this.shutterCol.off = true;
      G.audio.sfx('crash');
      G.fx.burst(0, 2.4, -16.3, C.orange, 30, 6, 0.8, 4);
      this.tween(0.25, (k) => { this.shutter.position.y = 2.4 + 5.1 * k; this.shutter.rotation.x = -0.5 * k; });
      this._burst([['runner', -1.4, -15.8], ['runner', 1.4, -15.6], ['walker', -0.4, -16.2], ['walker', 0.9, -16.4]]);
    });
    // the freezer door on the east wall bursts open right next to the escape route
    this.after(restored ? 2.6 : 3.2, () => {
      if (this.disposed) return;
      G.audio.sfx('crash');
      G.fx.burst(23.2, 1.6, -4.6, C.cyan, 26, 5, 0.8, 4);
      this.tween(0.25, (k) => { this.freezer.rotation.y = -1.1 * k; this.freezer.position.z = -4.6 - 0.9 * k; });
      this._burst([['runner', 22.3, -4.0], ['runner', 22.6, -5.4]]);
    });
    this.after(restored ? 3.5 : 4.2, () => { if (!this.disposed) this._burst([['spitter', 22, 15.6]]); });
    this.after(restored ? 5 : 6, () => { if (!this.disposed) this._burst([['brute', -22.5, -6.5]]); });
  }

  async _dockQTE() {
    if (this.qte || this.finished || this.phase !== 'escape') return;
    this.qte = true;
    const pl = G.player;
    pl.locked = true;
    G.timeScale = 0.25;
    G.hud.toast('INSTALLING BATTERIES...', 'cyan');
    const ok = await G.mg.run('mash', { title: 'INSTALL THE BATTERIES!', taps: 9, time: 4.2 });
    G.timeScale = 1;
    pl.locked = false;
    this.qte = false;
    if (this.disposed || pl.dead) return;
    if (!ok) { G.audio.sfx('error'); G.hud.toast('TOO SLOW - TRY AGAIN!', 'red'); return; }
    this._escapeOut();
  }

  async _escapeOut() {
    this.finished = true;
    const pl = G.player;
    pl.locked = true;
    pl.iframes = 8;
    G.audio.sfx('power');
    G.hud.completeObj('run', true);
    G.hud.completeObj('out');
    G.hud.banner('DOCK DOOR OPEN', 'GO GO GO!', 1800);
    const g = this.dockGlow;
    const y0 = this.dockDoor.position.y;
    this.panelGlow.material.color.setHex(C.green);
    this.tween(1.2, (k) => { this.dockDoor.position.y = y0 + 4.2 * k; g.material.opacity = 0.9 * k; });
    this.dockCol.off = true;
    pl.walkTo(22.2, -9.0, 3.4, () => pl.walkTo(27, -9.0, 3.4));
    if (!await this.wait(2.2)) return;
    G.audio.sirenOn(false);
    G.hud.redAlert(false);
    G.audio.sfx('win');
    G.hud.banner('CHAPTER 6 COMPLETE', 'THE CITY MART MISSION', 2800);
    if (!await this.wait(2.8)) return;
    G.hud.fade(true);
    if (!await this.wait(0.9)) return;
    G.finishChapters(6);
  }

  onEnemyDeath(z) {
    if (Math.random() < 0.25) this.addLoot(pick(['bottle', 'ammo', 'food', 'shells']), z.pos.x, z.pos.z, 9);
  }

  /* ================= life cycle ================= */
  async enter(opts = {}) {
    const pl = G.player;
    this.scene.add(pl.rig.root);
    const g = opts.got || {};
    this.got = { food: !!g.food, water: !!g.water, med: !!g.med, bat: !!g.bat, key: !!g.key, weap: !!g.weap };
    const at = opts.at;
    pl.reset(at ? at[0] : ENTRY.x, at ? at[1] : ENTRY.z, 0);
    if (opts.restore) pl.restore(opts.restore);
    const r = pl.rig;
    r.shirtMat.color.setHex(0x14124a);
    r.setColors(null, pl.accent, null);
    r.stripes.forEach((s) => { s.visible = true; });
    r.pantsMat.color.setHex(0x0d0d2b);
    const inv = pl.inv;
    pl.setWeapon(inv.shotgun && this.got.weap ? 'shotgun' : inv.pistol ? 'pistol' : inv.rod ? 'rod' : inv.backpack ? 'bag' : 'fists');
    pl.syncHeld();
    G.hud.setCombat(true);
    G.hud.setTag('CHAPTER 6 · THE CITY MART');
    G.camRig.configure(this.camCfg);
    G.camRig.yaw = Math.PI;
    G.camRig.pitch = 0.34;
    G.fx.setMotes(true, new THREE.Vector3(30, 6, 22));
    G.audio.setMood('tense');
    this.enableTakedown();
    // collected supplies stay collected
    for (const sp of SUP) {
      if (this.got[sp.id]) { sp.it.remove(); sp.vis.visible = false; sp.col.off = true; }
    }
    if (this.got.key) inv.keycard = true;
    if (this.got.weap) { this.doorOpen = true; this.doorIt.remove(); this.doorCol.off = true; this.doorMesh.position.y = 4.7; this.lockIt.remove(); }
    // the shop's inhabitants
    ZS.forEach(([type, x, z, o], i) => {
      const zb = this.addZombie(type, x, z, { idle: true, stealth: true, sight: type === 'screamer' ? 13 : 11, ...o });
      if (i === 0) this.tutZ = zb;
    });
    if (!this.got.weap) for (const [t, x, z] of LOOTS) this.addLoot(t, x, z, 6);
    // objectives
    if (this._count() === 4) this._phase2(true);
    else {
      G.hud.setObjectives('SUPPLY RUN', SUP.map((s) => ({ id: s.id, text: s.obj })));
      for (const s of SUP) if (this.got[s.id]) G.hud.completeObj(s.id, true);
    }
    this._saveCp(opts.at ? (opts.cp || 0) : 0, at || null);
    G.hud.fade(false);
    G.hud.banner('CHAPTER 6', 'THE CITY MART MISSION', 3200);
    if (this.got.weap) {
      this.phase = 'sneak';
      this.after(0.8, () => { if (!this.disposed) this._alarm(true); });
    } else if (!opts.at) {
      G.hud.sayLines([
        ['AARAV', 'The shutter slammed behind me. No way back. Food, water, medicine, batteries... then I find a way out.'],
        ['', 'Zombies see in a cone and hear footsteps. Crouch (C) to sneak. Tall shelves hide you; low counters hide you only when crouched.']
      ]);
    }
  }

  update(dt) {
    const pl = G.player;
    if (pl.hidden && this.time - this.hideAt > 0.5 && (G.input.consume('interact') || Math.hypot(G.input.mx, G.input.my) > 0.4)) this._unhide();
    this.baseUpdate(dt);
    const px = pl.pos.x, pz = pl.pos.z, t = this.time;
    this.pLight.position.set(px, 3.0, pz + 0.6);
    // the shutter slams shut behind the player
    if (!this.shutterDown && pz > -12.8) {
      this.shutterDown = true;
      this.shutterCol.off = false;
      G.audio.sfx('thud');
      G.fx.burst(0, 0.5, -16.4, C.cyan, 16, 4, 0.5, 4);
      this.tween(0.3, (k) => { this.shutter.position.y = 7.5 - 5.1 * k; });
    }
    // first-time hints
    if (!this.hints.takedown && this.phase === 'sneak' && this.tutZ && this.tutZ.alive && Math.hypot(this.tutZ.pos.x - px, this.tutZ.pos.z - pz) < 8) {
      this.hints.takedown = true;
      G.hud.say('', 'Crouch up BEHIND an unaware zombie and press USE for a SILENT TAKEDOWN.');
    }
    if (!this.hints.throw && this.phase === 'sneak' && t > 14 && pl.inv.bottle > 0) {
      this.hints.throw = true;
      G.hud.say('', 'THROW (K) lobs a bottle where the camera aims. Look down to throw closer. Zombies go to check the noise.');
    }
    // stealth indicator + music
    let spotted = false, caution = false;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (e.aware) spotted = true;
      else if (e.stealth && (e.alert > 0.25 || e.state === 'investigate')) caution = true;
    }
    G.hud.setStealth(pl.hidden ? 'HIDDEN' : spotted ? 'SPOTTED' : caution ? 'CAUTION' : 'UNSEEN');
    if (this.phase === 'sneak' && spotted !== this._spotted) { this._spotted = spotted; G.audio.setMood(spotted ? 'combat' : 'tense'); }
    // waypoint to the next objective
    this._wpT -= dt;
    if (this._wpT <= 0) {
      this._wpT = 0.4;
      if (this.phase === 'sneak' && !this.finished) {
        let best = null, bd = 1e9;
        if (!this.p2) {
          for (const sp of SUP) if (!this.got[sp.id]) { const d = Math.hypot(sp.x - px, sp.z - pz); if (d < bd) { bd = d; best = { x: sp.x, z: sp.z }; } }
        } else if (!this.got.key) best = { x: DESK.x, z: DESK.z };
        else if (!this.doorOpen) best = { x: DOOR.x, z: DOOR.z - 1 };
        else if (!this.got.weap) best = { x: LOCKER.x, z: LOCKER.z - 1 };
        G.hud.setWaypoint(best);
      }
    }
    // corpses
    for (const n of this.npcs) n.update(dt, pl, t);
    // alarm flashing
    if (this.alarmOn) {
      const on = Math.sin(t * 6) > 0;
      this.alarmLight.intensity = 14 * Math.PI * (on ? 1 : 0.15);
      this.alarmLight.position.set(px, 5, pz);
      this.lights.hemi.color.setHex(on ? 0xff4060 : 0x7a64ff);
      this.panelGlow.material.opacity = on ? 1 : 0.3;
    }
  }

  mapData() {
    const pl = G.player.pos;
    const pois = [];
    for (const it of this.interactables) if (!it.removed && it.active && it.map !== false) pois.push({ x: it.x, z: it.z, c: it.color, s: 'd' });
    for (const e of this.enemies) if (e.alive && (e.aware || Math.hypot(e.pos.x - pl.x, e.pos.z - pl.z) < 13)) pois.push({ x: e.pos.x, z: e.pos.z, c: C.red, s: 'c' });
    for (const l of this.loot) pois.push({ x: l.x, z: l.z, c: LOOT[l.type].color, s: 'c' });
    return pois;
  }

  exit() {
    G.audio.sirenOn(false);
    G.hud.redAlert(false);
    G.hud.setStealth(null);
    G.timeScale = 1;
    const pl = G.player;
    pl.hidden = false;
    pl.hideSpot = null;
    pl.rig.root.visible = true;
    pl.rig.root.removeFromParent();
  }
}
