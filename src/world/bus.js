import * as THREE from 'three';
import { Stage } from './stage.js';
import { G } from '../core/state.js';
import {
  C, nbox, led, glow, holoPanel, glowSign, basic, cylGeo, boxGeo, windowTexture, roadTexture, addEdges
} from '../core/kit.js';
import { NPC } from '../entities/npc.js';
import { shake } from '../core/fx.js';
import { mulberry, pick } from '../core/util.js';

const ROWS = [-4.7, -3.5, -2.3, -1.1, 0.1, 1.3, 2.5];
const HALF = 1.55;

export class BusStage extends Stage {
  constructor() {
    super('bus');
    this.chapter = 3;
    this.bounds = { minX: -1.42, maxX: 1.42, minZ: -5.55, maxZ: 5.1 };
    this.mapRange = 7.5;
    this.camCfg = { dist: 3.4, height: 1.3, minPitch: 0.2, maxPitch: 0.95, fov: 64, block: null, bounds: { minX: -1.42, maxX: 1.42, minZ: -5.7, maxZ: 5.5, minY: 0.45, maxY: 2.25 } };
    this.spawn = { x: 1.0, z: 3.7, yaw: Math.PI };
    this.speed = 17;
    this.phase = 'ride';
    this.rideT = 0;
    this.cp = 0;
    this.P = {};
    this.pickups = [];
    this.emergency = 0;
    this.exitReady = false;
    this.straps = [];
    this.sc = [];
    this.sl = [];
    this.triggered = false;
    this.zs = [];
    this.hint = {};
    this.shakeT = 0;
  }

  /* ================= build ================= */
  async load() {
    this.skyScene(0x120a30, 0.016);
    this.hemi = new THREE.HemisphereLight(0x6a7cff, 0x20104a, 1.05 * Math.PI);
    this.scene.add(this.hemi);
    const mk = (c, I, d, x, y, z) => { const l = new THREE.PointLight(c, I * Math.PI, d, 1.5); l.position.set(x, y, z); this.scene.add(l); return l; };
    this.lBlue = mk(0x3a7aff, 7, 9, 0, 2.1, -2);
    this.lCyan = mk(0x00f0ff, 6, 8, 0, 2.1, 2.8);
    this.lAlarm = mk(0xff0020, 0, 9, 0, 2.1, 0);
    this.flickerLight(this.lBlue, 1);
    this.flickerLight(this.lCyan, 1);
    this._shell();
    this._seats();
    this._cab();
    this._scenery();
    this._passengers();
    this._pickups();
    this._interactables();
  }

  _shell() {
    const s = this.scene;
    const floor = new THREE.Mesh(boxGeo(HALF * 2, 0.1, 11.8), new THREE.MeshStandardMaterial({ color: 0x0c0a28, roughness: 0.35, metalness: 0.5, envMapIntensity: 1 }));
    floor.position.set(0, -0.05, -0.1);
    s.add(floor);
    for (const sx of [-0.7, 0.7]) { const l = led(0.05, 0.03, 11.4, C.cyan); l.position.set(sx, 0.02, -0.1); s.add(l); }
    const ceil = nbox(HALF * 2, 0.1, 11.8, 0x0a0826);
    ceil.position.set(0, 2.45, -0.1);
    s.add(ceil);
    for (const sx of [-0.95, 0, 0.95]) { const l = led(0.06, 0.04, 11.6, sx === 0 ? C.pink : C.blue); l.position.set(sx, 2.39, -0.1); s.add(l); }
    // side walls with window bands
    for (const side of [-1, 1]) {
      const x = side * HALF;
      const low = nbox(0.1, 0.95, 11.8, 0x14104a, C.cyan);
      low.position.set(x, 0.475, -0.1);
      s.add(low);
      const up = nbox(0.1, 0.4, 11.8, 0x14104a);
      up.position.set(x, 2.22, -0.1);
      s.add(up);
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(11.8, 1.05), new THREE.MeshBasicMaterial({ color: 0x0a2a6a, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }));
      pane.rotation.y = Math.PI / 2;
      pane.position.set(x, 1.47, -0.1);
      s.add(pane);
      for (const z of [-5.6, -4.1, -2.9, -1.7, -0.5, 0.7, 1.9, 3.1, 4.3, 5.6]) {
        const p = nbox(0.1, 1.05, 0.08, 0x14104a, C.pink);
        p.position.set(x, 1.47, z);
        s.add(p);
      }
      const lt = led(0.05, 0.05, 11.6, side < 0 ? C.pink : C.cyan);
      lt.position.set(x - side * 0.04, 0.97, -0.1);
      s.add(lt);
      const lt2 = led(0.05, 0.05, 11.6, side < 0 ? C.cyan : C.pink);
      lt2.position.set(x - side * 0.04, 2.0, -0.1);
      s.add(lt2);
      // overhead rail + straps
      const rail = new THREE.Mesh(cylGeo(0.025, 0.025, 11.4, 6), basic(C.cyan));
      rail.rotation.x = Math.PI / 2;
      rail.position.set(side * 0.62, 2.15, -0.1);
      s.add(rail);
      for (let z = -5; z <= 3; z += 1.2) {
        const st = new THREE.Group();
        st.position.set(side * 0.62, 2.15, z);
        const strap = nbox(0.04, 0.4, 0.04, 0x222255);
        strap.position.y = -0.2;
        st.add(strap);
        const loop = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.015, 5, 10), basic(C.pink));
        loop.position.y = -0.45;
        st.add(loop);
        s.add(st);
        this.straps.push(st);
      }
      // aisle poles
      for (const z of [-4.1, -1.7, 0.7]) {
        const pole = new THREE.Mesh(cylGeo(0.025, 0.025, 2.2, 6), basic(0xbfd8ff));
        pole.position.set(side * 0.72, 1.1, z);
        s.add(pole);
      }
    }
    // rear wall + emergency exit
    const rear = nbox(HALF * 2, 2.4, 0.1, 0x14104a);
    rear.position.set(0, 1.2, -5.95);
    s.add(rear);
    const win = new THREE.Mesh(boxGeo(1.2, 1.2, 0.04), basic(0x3a6aff, { opacity: 0.5 }));
    win.position.set(0, 1.45, -5.88);
    s.add(win);
    this.exitWin = win;
    for (const [w, h, x, y] of [[1.3, 0.06, 0, 0.63], [1.3, 0.06, 0, -0.63], [0.06, 1.3, -0.63, 0], [0.06, 1.3, 0.63, 0]]) {
      const f = led(w, h, 0.06, C.red);
      f.position.set(x, 1.45 + y, -5.86);
      s.add(f);
    }
    const sg = glowSign('EMERGENCY EXIT', C.red, 1.7, { h: 90 });
    sg.position.set(0, 2.15, -5.88);
    sg.rotation.y = Math.PI;
    s.add(sg);
    this.flicker(sg.userData.mat, 1);
    const eg = glow(C.red, 3, 0.5);
    eg.position.set(0, 1.5, -5.6);
    s.add(eg);
    // right-hand door (decor)
    for (const dz of [3.35, 4.35]) {
      const d = nbox(0.06, 1.9, 0.95, 0x0a2a5a, C.cyan);
      d.position.set(HALF - 0.02, 1.0, dz);
      s.add(d);
    }
  }

  _seats() {
    const s = this.scene;
    for (const side of [-1, 1]) {
      for (const rz of ROWS) {
        const x = side * 1.1;
        const base = nbox(0.8, 0.4, 0.5, 0x1a1450, C.cyan);
        base.position.set(x, 0.2, rz);
        s.add(base);
        const cush = nbox(0.78, 0.1, 0.5, 0x3a1a8a, C.pink);
        cush.position.set(x, 0.45, rz + 0.01);
        s.add(cush);
        const back = nbox(0.8, 0.78, 0.12, 0x2a1470, C.pink);
        back.position.set(x, 0.92, rz - 0.27);
        s.add(back);
        this.addCollider(side < 0 ? -1.5 : 0.7, side < 0 ? -0.7 : 1.5, rz - 0.32, rz + 0.3, 1.15);
      }
    }
  }

  _cab() {
    const s = this.scene;
    const dash = nbox(HALF * 2, 0.6, 0.5, 0x0c0a30, C.cyan);
    dash.position.set(0, 0.8, 5.4);
    s.add(dash);
    this.addCollider(-1.55, 1.55, 5.15, 5.7, 1.1);
    const ds = nbox(0.8, 0.9, 0.7, 0x2a1470, C.pink);
    ds.position.set(-0.95, 0.45, 4.3);
    s.add(ds);
    this.addCollider(-1.35, -0.55, 4.0, 4.6, 0.9);
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.025, 6, 16), basic(C.pink));
    wheel.position.set(-0.95, 1.1, 4.95);
    wheel.rotation.x = -0.9;
    s.add(wheel);
    this.wheel = wheel;
    for (let i = 0; i < 5; i++) {
      const l = led(0.12, 0.05, 0.02, [C.green, C.cyan, C.pink, C.yellow, C.cyan][i]);
      l.position.set(-0.4 + i * 0.35, 1.12, 5.15);
      s.add(l);
    }
    const ws = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, 1.3), new THREE.MeshBasicMaterial({ color: 0x0a2a6a, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false }));
    ws.position.set(0, 1.55, 5.62);
    s.add(ws);
    const top = nbox(HALF * 2, 0.55, 0.1, 0x14104a, C.cyan);
    top.position.set(0, 2.2, 5.65);
    s.add(top);
    const pan = holoPanel(['42 METRO GATE', 'NEXT: CENTRAL'], 0xffb000, 1.6, 0.4);
    pan.position.set(0, 2.1, 5.55);
    pan.rotation.y = Math.PI;
    s.add(pan);
    this.flicker(pan.userData.mat, 0.8);
    // case with the rod / first aid
    const rodCase = nbox(0.1, 0.5, 0.9, 0x3a0a14, C.red);
    rodCase.position.set(HALF - 0.1, 1.3, 0.8);
    s.add(rodCase);
    this.rodCase = rodCase;
    const aid = nbox(0.1, 0.45, 0.45, 0xe8f0ff, C.green);
    aid.position.set(-HALF + 0.1, 1.3, -4.4);
    s.add(aid);
    const cr = led(0.03, 0.22, 0.06, C.green);
    cr.position.set(-HALF + 0.17, 1.3, -4.4);
    s.add(cr);
    const cr2 = led(0.03, 0.06, 0.22, C.green);
    cr2.position.set(-HALF + 0.17, 1.3, -4.4);
    s.add(cr2);
  }

  _scenery() {
    const rng = mulberry(5);
    const texs = [0, 1, 2, 3].map((i) => windowTexture(3, 10, 300 + i));
    for (let i = 0; i < 10; i++) {
      for (const side of [-1, 1]) {
        const w = 6 + rng() * 4, h = 10 + rng() * 28;
        const m = new THREE.Mesh(boxGeo(w, h, 8), new THREE.MeshBasicMaterial({ map: texs[(i + (side > 0 ? 1 : 0)) % 4] }));
        m.position.set(side * (6.5 + w / 2 + rng() * 2), h / 2, -45 + i * 9 + rng() * 3);
        addEdges(m, pick([C.pink, C.cyan, C.violet], rng), 0.9);
        this.scene.add(m);
        this.sc.push(m);
        if (rng() < 0.5) {
          const sg = glowSign(pick(['RAMEN', 'HOTEL', 'ARCADE', 'BAR', 'CAFE'], rng), pick([C.pink, C.cyan, C.yellow], rng), 3.4);
          sg.position.set(side * -(w / 2 + 0.1) + 0, 5 + rng() * 5, 0);
          sg.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
          sg.position.set(-side * (w / 2 + 0.06), 5 + rng() * 5, 0);
          m.add(sg);
        }
      }
    }
    for (let i = 0; i < 9; i++) {
      for (const side of [-1, 1]) {
        const g = glow(i % 2 ? C.pink : C.cyan, 5, 0.8);
        g.position.set(side * 3.8, 4.6, -45 + i * 10);
        this.scene.add(g);
        this.sl.push(g);
      }
    }
    const road = new THREE.Group();
    road.rotation.y = Math.PI / 2;
    const rt = roadTexture();
    rt.repeat.set(120 / 16, 1);
    this.roadTex = rt;
    const rm = new THREE.Mesh(new THREE.PlaneGeometry(120, 10), new THREE.MeshBasicMaterial({ map: rt }));
    rm.rotation.x = -Math.PI / 2;
    rm.position.y = -1.2;
    road.add(rm);
    this.scene.add(road);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshBasicMaterial({ color: 0x07031a }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -1.25;
    this.scene.add(ground);
  }

  _passengers() {
    const defs = [
      { id: 'sick', side: -1, row: 3, seat: 0.9, hood: true, name: 'SICK MAN', outline: C.red, lines: ['...cold... so cold...', '...don\'t look at me...'] },
      { id: 'woman', side: 1, row: 1, seat: 1.3, name: 'WOMAN', lines: ['Excuse me, is this the 42 to Central?', 'The driver looks pale today...'] },
      { id: 'teen', side: -1, row: 5, seat: 1.3, headphones: true, name: 'TEEN', lines: ['Shh, my favourite song is on.', 'My phone shows no signal. Weird.'] },
      { id: 'guy', side: 1, row: 2, seat: 0.9, name: 'OFFICE GUY', phone: true, lines: ['Third missed call from my boss.', 'Traffic has been insane tonight.'] },
      { id: 'aunty', side: 1, row: 3, seat: 0.9, name: 'AUNTY', lines: ['Beta, hold the rail. Driver brakes hard.'] },
      { id: 'student', side: -1, row: 0, seat: 1.3, backpack: true, name: 'STUDENT', lines: ['Exam at nine. I have not studied at all.'] }
    ];
    for (const d of defs) {
      const x = d.side * d.seat, z = ROWS[d.row] - 0.02;
      const n = new NPC({ x, z, mode: 'seated', yaw: 0, hood: d.hood, headphones: d.headphones, backpack: !!d.backpack, name: d.name, lines: d.lines, outline: d.outline ?? null, sway: 0.012 });
      if (d.phone) n.rig.p.phone = 1;
      n.rig.root.position.y = 0;
      n.side = d.side;
      n.pid = d.id;
      this.addNPC(n);
      this.P[d.id] = n;
      if (d.lines && d.id !== 'sick') {
        this.addInteractable({
          x: d.side * 0.5, z, r: 1.9, y: 1.6, label: 'TALK', color: C.cyan,
          enabled: () => this.phase === 'ride' && !n.removed,
          onUse: () => { G.hud.sayLines(d.lines.map((l) => [d.name, l])); if (!this.talked) { this.talked = true; G.hud.completeObj('talk'); } }
        });
      }
    }
    this.P.sick.lines = defs[0].lines;
    const dr = new NPC({ x: -0.95, z: 4.3, mode: 'seated', yaw: 0, name: 'DRIVER', shirt: 0x14305a, sway: 0.004 });
    this.addNPC(dr);
    this.P.driver = dr;
    const st = new NPC({ x: 0.3, z: -4.85, mode: 'phone', yaw: 0.3, name: 'COMMUTER', backpack: false });
    st.rig.root.position.y = 0;
    this.addNPC(st);
    this.P.standing = st;
  }

  _pickups() {
    const spots = [[-0.3, -2.2], [0.35, 1.0], [0.1, -4.3], [-0.4, 3.0]];
    spots.forEach(([x, z]) => this._dropBottle(x, z));
  }
  _dropBottle(x, z) {
    const m = new THREE.Mesh(cylGeo(0.06, 0.06, 0.28, 8), basic(C.green, { opacity: 0.9 }));
    m.position.set(x, 0.18, z);
    m.rotation.z = Math.PI / 2;
    const gl = glow(C.green, 1.1, 0.85);
    m.add(gl);
    this.scene.add(m);
    this.pickups.push({ m, x, z, t: Math.random() * 6 });
  }

  _interactables() {
    this.rodIt = this.addInteractable({
      x: 0.5, z: 0.8, r: 1.5, y: 1.0, color: C.red, label: 'TAKE METAL ROD (SAFETY HAMMER)',
      enabled: () => !G.player.inv.rod && this.phase !== 'ride',
      onUse: () => {
        const pl = G.player;
        pl.inv.rod = true;
        pl.setWeapon('rod');
        this.rodCase.visible = false;
        G.audio.sfx('pickup');
        G.hud.toast('METAL ROD ACQUIRED', 'red');
        G.hud.completeObj('weapon');
      }
    });
    this.aidIt = this.addInteractable({
      x: -0.55, z: -4.4, r: 1.5, y: 1.0, color: C.green, label: 'TAKE FIRST AID KIT',
      enabled: () => !this.aidTaken,
      onUse: () => { this.aidTaken = true; G.player.inv.medkit++; G.audio.sfx('pickup'); G.hud.toast('MEDKIT +1 (USE THE MEDKIT BUTTON)', 'green'); }
    });
    this.exitIt = this.addInteractable({
      x: 0, z: -5.15, r: 1.6, y: 1.0, color: C.red, label: 'BREAK THE EMERGENCY WINDOW',
      enabled: () => this.exitReady && !this.escaping,
      onUse: () => this._breakWindow()
    });
  }

  /* ================= life cycle ================= */
  async enter(opts = {}) {
    const pl = G.player;
    this.scene.add(pl.rig.root);
    this.cp = opts.cp ?? 0;
    pl.reset(0, 0, 0);
    if (opts.restore) pl.restore(opts.restore);
    const r = pl.rig;
    r.shirtMat.color.setHex(0x14124a);
    r.setColors(null, pl.accent, null);
    r.stripes.forEach((s) => { s.visible = true; });
    r.pantsMat.color.setHex(0x0d0d2b);
    pl.setWeapon(pl.inv.rod ? 'rod' : pl.inv.backpack ? 'bag' : 'fists');
    pl.syncHeld();
    G.camRig.configure(this.camCfg);
    G.camRig.pitch = 0.42;
    G.camRig.yaw = 0;
    G.fx.setMotes(true, new THREE.Vector3(4, 2.4, 14));
    G.audio.engine(true, 1);
    G.hud.fade(false);
    if (pl.inv.rod) { this.rodCase.visible = false; }
    if (this.cp === 0) {
      pl.pos.set(1.0, 0, 3.7);
      pl.yaw = Math.PI;
      G.camRig.yaw = 0;
      this.phase = 'ride';
      this.combat = false;
      G.hud.setCombat(false);
      G.hud.setTag('CHAPTER 3 · BOARDING THE BUS');
      G.audio.setMood('calm');
      G.hud.setObjectives('RIDE TO CENTRAL STATION', [{ id: 'ride', text: 'Ride the bus' }, { id: 'talk', text: 'Talk to a passenger (optional)' }]);
      G.saveCheckpoint({ chapter: 3, stage: 'bus', cp: 0 });
      G.hud.banner('CHAPTER 3', 'ON THE BUS', 2400);
      G.hud.sayLines([['AARAV', 'Made it. Lucky I did not miss it.'], ['', 'Look around. Talk to the other passengers.']]);
    } else if (this.cp === 1) {
      this._toAttack();
      this._removeNpc('sick');
      pl.pos.set(0, 0, 0.6);
      this._wave1(false);
    } else if (this.cp === 2) {
      this._toAttack();
      this._removeNpc('sick');
      pl.pos.set(0, 0, -0.5);
      this._wave2();
    } else {
      this._toAttack();
      ['sick', 'aunty', 'guy'].forEach((k) => this._removeNpc(k));
      pl.pos.set(0, 0, 1.5);
      this._wave3();
    }
  }

  _toAttack() {
    this.chapter = 4;
    this.phase = 'attack';
    this.combat = true;
    this.emergency = 1;
    G.hud.setCombat(true);
    G.hud.setTag('CHAPTER 4 · ZOMBIE ATTACK');
    G.audio.setMood('combat');
    G.hud.redAlert(true);
    G.hud.setObjectives('SURVIVE THE ATTACK', [{ id: 'w1', text: 'Defeat the infected passenger' }, { id: 'weapon', text: 'Grab a weapon (optional)' }, { id: 'w2', text: 'Hold the aisle' }, { id: 'exit', text: 'Break the rear emergency window' }]);
  }
  _removeNpc(id) {
    const n = this.P[id];
    if (!n) return;
    n.rig.root.removeFromParent();
    const i = this.npcs.indexOf(n);
    if (i >= 0) this.npcs.splice(i, 1);
    n.removed = true;
    this.P[id] = null;
  }

  /* ---------- transformation ---------- */
  async _transform(n, dur = 2.4) {
    n.rig.p.transform = 1;
    G.audio.sfx('transform');
    n.rig.flash(C.red, 0.3);
    const x = n.pos.x, z = n.pos.z, side = n.side || (x < 0 ? -1 : 1);
    await this.tween(dur, (k) => { n.rig.setSkinBlend(0x35305a, k); });
    if (this.disposed) return null;
    this.npcs.splice(this.npcs.indexOf(n), 1);
    n.rig.root.removeFromParent();
    n.removed = true;
    this.P[n.pid] = null;
    const zb = this.addZombie('walker', side * 0.45, z, { hood: !!n.rig.o.hood });
    zb.stagger(0.8);
    G.fx.burst(zb.pos.x, 1.2, zb.pos.z, C.cyan, 26, 5, 0.8, 3);
    G.fx.ring(zb.pos.x, 0, zb.pos.z, C.red, 3, 0.6);
    G.audio.sfx('growl');
    return zb;
  }

  async _toAttackStart() {
    const pl = G.player;
    this.phase = 'transform';
    pl.locked = true;
    G.hud.clearSay();
    G.hud.setObjectives('', []);
    G.audio.setMood('tense');
    this.flickerLevel = 1;
    G.hud.toast('THE LIGHTS ARE FLICKERING', 'red');
    G.audio.sfx('power');
    G.camRig.cutscene(new THREE.Vector3(0.55, 1.6, 0.2), new THREE.Vector3(-0.85, 0.95, -1.1), 4);
    if (!await this.wait(1.4)) return;
    G.hud.say('SICK MAN', 'Aaagh...');
    this.emergency = 1;
    G.hud.redAlert(true);
    const zb = await this._transform(this.P.sick, 2.6);
    if (!zb || this.disposed) return;
    zb.grabber = true;
    G.camRig.endCut();
    G.camRig.yaw = 0;
    this._toAttack();
    G.hud.banner('CHAPTER 4', 'ZOMBIE ATTACK ON THE BUS', 3200);
    G.audio.sfx('scream');
    // he bites the passenger across the aisle
    if (this.P.aunty) { this.P.aunty.rig.flash(C.red, 0.4); this.P.aunty.rig.p.hurt = 1; G.fx.burst(0.9, 1.1, -1.1, C.red, 16, 3, 0.6, 5); }
    pl.locked = false;
    this._wave1(true, zb);
  }

  _wave1(first, zb) {
    this.phase = 'wave1';
    this.z0 = zb || this.addZombie('walker', -0.45, -1.1, { grabber: true });
    this.zs = [this.z0];
    G.saveCheckpoint({ chapter: 4, stage: 'bus', cp: 1 });
    G.hud.sayLines([['', 'INFECTED! Use ATTACK to fight.'], ['', 'BLOCK just before his hit to parry. DODGE to evade.'], ['', 'Beware the grab - tap fast to break free!']]);
    this.hint = {};
  }

  async _wave2() {
    this.phase = 'wave2';
    this.zs = [];
    this.w2Done = false;
    G.saveCheckpoint({ chapter: 4, stage: 'bus', cp: 2 });
    G.hud.completeObj('w1', true);
    G.hud.sayLines([['', 'The bitten passengers are turning! Hold the aisle!']]);
    G.audio.sfx('scream');
    const list = [];
    for (const id of ['aunty', 'guy']) {
      if (this.P[id]) {
        const zb = await this._transform(this.P[id], 1.5);
        if (zb) list.push(zb);
      }
    }
    if (this.disposed) return;
    list.push(this.addZombie('runner', 0, 4.6));
    this.zs = list;
    G.audio.sfx('growl');
  }

  async _wave3() {
    this.phase = 'wave3';
    G.hud.completeObj('w1', true);
    G.hud.completeObj('w2', true);
    G.saveCheckpoint({ chapter: 4, stage: 'bus', cp: 3 });
    G.player.heal(25);
    G.hud.sayLines([['', 'The DRIVER is infected!']]);
    G.audio.sfx('scream');
    await this._crash();
    if (this.disposed) return;
    const brute = this.addZombie('brute', -0.1, 4.2);
    const w1 = this.addZombie('walker', 0.3, 3.4);
    const w2 = this.addZombie('walker', -0.4, 2.6);
    brute.stagger(0.8);
    this.zs = [brute, w1, w2];
    this.exitReady = true;
    G.hud.setWaypoint({ x: 0, z: -5.15 });
    G.hud.sayLines([['AARAV', 'The rear emergency window! Break it and get out!']]);
    G.hud.toast('REACH THE REAR EXIT', 'gold');
  }

  async _crash() {
    this.phase = 'crash';
    const dr = this.P.driver;
    if (dr) { dr.rig.p.transform = 1; dr.rig.flash(C.red, 0.4); }
    this.flickerLevel = 1;
    G.audio.sfx('transform');
    if (!await this.wait(1.4)) return;
    G.audio.sfx('crash');
    shake(1.3, 1.1);
    G.hud.damageFlash();
    G.player.vz -= 5;
    this.wheelSpin = 6;
    const v0 = this.speed;
    await this.tween(1.8, (k) => { this.speed = v0 * (1 - k); });
    if (this.disposed) return;
    this.speed = 0;
    G.audio.engine(false);
    if (dr) { this._removeNpc('driver'); }
    this.phase = 'wave3';
  }

  async _breakWindow() {
    if (this.escaping) return;
    this.escaping = true;
    const pl = G.player;
    pl.locked = true;
    pl.faceTo(0, -6);
    // zombies get shoved back while the player works
    for (const e of this.enemies) if (e.alive) e.stagger(2.4);
    G.timeScale = 0.35;
    const ok = await G.mg.run('glass', { hits: 3, title: 'BREAK THE GLASS', text: 'Strike when the marker is in the green zone' });
    G.timeScale = 1;
    if (this.disposed) return;
    pl.locked = false;
    this.escaping = false;
    if (!ok) return;
    this._escape();
  }

  async _escape() {
    const pl = G.player;
    pl.locked = true;
    this.exitReady = false;
    G.hud.setWaypoint(null);
    G.audio.sfx('glass');
    shake(0.5, 0.5);
    this.exitWin.visible = false;
    G.fx.burst(0, 1.4, -5.8, C.cyan, 40, 6, 1, 8);
    G.fx.burst(0, 1.4, -5.8, C.pink, 24, 4, 1, 8);
    G.hud.completeObj('exit');
    G.hud.banner('CHAPTER 4 COMPLETE', 'ZOMBIE ATTACK ON THE BUS', 3200);
    G.audio.sfx('win');
    G.saveCheckpoint({ chapter: 4, stage: 'bus', cp: 3, cleared: 4 });
    for (const e of this.enemies) if (e.alive) e.stagger(5);
    pl.walkTo(0, -6.6, 3, null);
    if (!await this.wait(1.2)) return;
    G.hud.say('AARAV', 'Out! I have to reach the city centre...');
    if (!await this.wait(2.4)) return;
    G.hud.fade(true);
    if (!await this.wait(0.9)) return;
    G.finishChapters(4);
  }

  /* ================= update ================= */
  onEnemyDeath(z) {
    if (Math.random() < 0.45) this._dropBottle(z.pos.x * 0.8, z.pos.z);
    G.hud.toast('INFECTED DOWN', 'pink');
  }

  update(dt) {
    this.baseUpdate(dt);
    const pl = G.player, t = this.time;
    // moving scenery
    const sp = this.speed;
    for (const m of this.sc) { m.position.z -= sp * dt; if (m.position.z < -50) m.position.z += 90; }
    for (const g of this.sl) { g.position.z -= sp * dt; if (g.position.z < -50) g.position.z += 90; }
    this.roadTex.offset.x -= sp * dt / 16;
    // slight rumble + lamp strobe
    if (sp > 1) {
      this.shakeT += dt;
      if (this.shakeT > 0.12) { this.shakeT = 0; shake(0.012, 0.14); }
      let near = 99;
      for (const g of this.sl) near = Math.min(near, Math.abs(g.position.z));
      this.hemi.intensity = (0.95 + Math.max(0, 1 - near / 3) * 0.25) * Math.PI;
    }
    if (this.wheel) this.wheel.rotation.z = Math.sin(t * 0.9) * 0.3 + (this.wheelSpin ? Math.sin(t * 12) * 0.6 : 0);
    for (const st of this.straps) st.rotation.z = Math.sin(t * 1.9 + st.position.z) * 0.07 * (sp > 1 ? 1 : 0.1);
    // passengers
    for (const n of this.npcs) {
      n.update(dt, pl, t);
      if (this.phase !== 'ride' && n.pid && n.mode === 'seated') { n.rig.p.hurt = 0.55; n.rig.body.rotation.z = Math.sin(t * 9 + n.pos.z) * 0.04; }
    }
    // pickups
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.t += dt;
      p.m.position.y = 0.2 + Math.sin(p.t * 3) * 0.04;
      p.m.rotation.y += dt * 2;
      if (Math.hypot(p.x - pl.pos.x, p.z - pl.pos.z) < 0.85 && pl.inv.bottle < 6 && !pl.dead) {
        pl.inv.bottle++;
        G.audio.sfx('pickup');
        G.hud.toast('BOTTLE +1 (THROW)', 'green');
        G.fx.burst(p.x, 0.3, p.z, C.green, 10, 2, 0.5, 2);
        this.scene.remove(p.m);
        this.pickups.splice(i, 1);
      }
    }
    // emergency lighting
    if (this.emergency) {
      this.lAlarm.intensity = 9 * Math.PI * (0.4 + 0.6 * Math.max(0, Math.sin(t * 7)));
      this.hemi.color.setHex(0xa05cff);
    }
    // phases
    if (this.phase === 'ride') {
      this.rideT += dt;
      const sick = this.P.sick;
      if (!this.triggered && sick && (this.rideT > 34 || (this.rideT > 15 && Math.hypot(sick.pos.x - pl.pos.x, sick.pos.z - pl.pos.z) < 3.4))) {
        this.triggered = true;
        this._toAttackStart();
      }
    }
    if (this.phase === 'wave1' && this.z0 && !this.z0.alive && !this.w1Done) {
      this.w1Done = true;
      G.hud.completeObj('w1');
      pl.heal(25);
      G.hud.sayLines([['', 'Grab the METAL ROD and any bottles you see.']]);
      this.after(6, () => { if (!this.disposed) this._wave2(); });
    }
    if (this.phase === 'wave2' && this.zs.length && !this.w2Done && this.aliveCount() === 0) {
      this.w2Done = true;
      G.hud.completeObj('w2');
      pl.heal(25);
      G.hud.toast('AISLE CLEAR', 'green');
      this.after(4, () => { if (!this.disposed) this._wave3(); });
    }
    if (this.phase === 'wave3' && !this.hint.exit) {
      this.hint.exit = true;
    }
    // first telegraph tutorial
    if (!this.hint.tele) {
      for (const e of this.enemies) {
        if (e.alive && e.telegraph) { this.hint.tele = true; G.hud.say('', 'It is winding up! BLOCK or DODGE right before it hits.'); break; }
      }
    }
    G.hud.setWaypoint(this.exitReady ? { x: 0, z: -5.15 } : null);
  }

  exit() {
    G.audio.engine(false);
    G.hud.redAlert(false);
    G.timeScale = 1;
    G.player.rig.root.removeFromParent();
  }
}
