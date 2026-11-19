import * as THREE from 'three';
import { G } from '../core/state.js';
import { C, glow, basic, setFlicker, beam, boxGeo, nbox, cylGeo } from '../core/kit.js';
import { Zombie } from '../entities/zombie.js';
import { shake } from '../core/fx.js';
import { angDiff, clamp } from '../core/util.js';

const _v = new THREE.Vector3();

/** Segment (x0,z0)-(x1,z1) vs collider AABB in the XZ plane. Returns the entry fraction 0..1, or -1 for a miss. */
export function segAABB(x0, z0, x1, z1, c) {
  let t0 = 0, t1 = 1;
  const dx = x1 - x0, dz = z1 - z0;
  if (Math.abs(dx) < 1e-9) { if (x0 < c.minX || x0 > c.maxX) return -1; }
  else {
    let a = (c.minX - x0) / dx, b = (c.maxX - x0) / dx;
    if (a > b) { const s = a; a = b; b = s; }
    t0 = Math.max(t0, a); t1 = Math.min(t1, b);
    if (t0 > t1) return -1;
  }
  if (Math.abs(dz) < 1e-9) { if (z0 < c.minZ || z0 > c.maxZ) return -1; }
  else {
    let a = (c.minZ - z0) / dz, b = (c.maxZ - z0) / dz;
    if (a > b) { const s = a; a = b; b = s; }
    t0 = Math.max(t0, a); t1 = Math.min(t1, b);
    if (t0 > t1) return -1;
  }
  return t0;
}

/** Pickup table: what each loot type gives and the cap on how many you can carry. */
export const LOOT = {
  ammo: { color: C.yellow, give: 12, cap: 60, key: 'ammo', text: 'PISTOL AMMO' },
  shells: { color: C.orange, give: 6, cap: 24, key: 'shells', text: 'SHOTGUN SHELLS' },
  medkit: { color: C.green, give: 1, cap: 5, key: 'medkit', text: 'MEDKIT' },
  food: { color: C.hot, give: 1, cap: 6, key: 'food', text: 'FOOD' },
  bottle: { color: C.cyan, give: 1, cap: 6, key: 'bottle', text: 'BOTTLE' },
  scrap: { color: C.violet, give: 2, cap: 12, key: 'scrap', text: 'SCRAP' },
  cloth: { color: C.pink, give: 2, cap: 8, key: 'cloth', text: 'CLOTH' },
  wood: { color: C.orange, give: 2, cap: 12, key: 'wood', text: 'WOOD' }
};

/** Base class for every playable scene. */
export class Stage {
  constructor(key) {
    this.key = key;
    this.chapter = 1;
    this.scene = new THREE.Scene();
    this.colliders = [];
    this.interactables = [];
    this.enemies = [];
    this.npcs = [];
    this.projectiles = [];
    this.timers = [];
    this.flickers = [];
    this.updaters = [];
    this.bounds = null;
    this.combat = false;
    this.time = 0;
    this.flickerLevel = 0;
    this.disposed = false;
    this.focus = null;
    this.grabbing = false;
    this.deadHandled = false;
    this.stealthy = false;       // chapters 5-6: zombies see / hear the player
    this.enemyActiveRange = Infinity; // enemies further than this are frozen + hidden (performance)
    this.loot = [];
    this.tracers = [];
    this.spits = [];
    this.puddles = [];
    this.lobThrow = false;       // bottles are lobbed where the camera aims (a distraction) instead of at enemies
    this.throwMark = null;
    this.takedownIt = null;      // dynamic interactable for silent takedowns (enableTakedown)
    this.tdTarget = null;
    this.hideAt = 0;
    this.mapScale = 2;
    this.mapRange = 40;
    this.camCfg = { dist: 5, height: 1.45, minPitch: 0.06, maxPitch: 1.15, bounds: null, block: null, fov: 62 };
    this.spawn = { x: 0, z: 0, yaw: 0 };
    this.mapRects = null;
  }

  async load() { /* subclass builds the scene */ }
  enter(opts) { /* subclass */ }
  exit() { /* subclass */ }

  /* ---------- helpers ---------- */
  skyScene(fogColor, density) {
    this.scene.background = G.assets.sky;
    this.scene.environment = G.assets.env;
    this.scene.fog = new THREE.FogExp2(fogColor, density);
  }
  addCollider(minX, maxX, minZ, maxZ, h = 3) {
    const c = { minX, maxX, minZ, maxZ, h, off: false };
    this.colliders.push(c);
    return c;
  }
  addBoxCollider(cx, cz, w, d, h = 3) {
    return this.addCollider(cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2, h);
  }
  add(obj) { this.scene.add(obj); return obj; }

  sleep(s) { return new Promise((res) => this.timers.push({ t: s, fn: res })); }
  async wait(s) { await this.sleep(s); return !this.disposed; }
  after(s, fn) { this.timers.push({ t: s, fn }); }
  /** Runs fn(k) with k going 0..1 over dur seconds of game time. */
  tween(dur, fn) {
    return new Promise((res) => {
      let t = 0;
      const u = (dt) => {
        t += dt;
        const k = Math.min(1, t / dur);
        fn(k);
        if (k >= 1) {
          const i = this.updaters.indexOf(u);
          if (i >= 0) this.updaters.splice(i, 1);
          res();
        }
      };
      this.updaters.push(u);
    });
  }

  flicker(mat, k = 1) { this.flickers.push({ mat, k }); }
  flickerLight(light, k = 1) { this.flickers.push({ light, base: light.intensity, k }); }

  addInteractable(o) {
    const it = Object.assign({ r: 1.7, y: 1, enabled: null, label: 'INTERACT', color: C.yellow, marker: true, removed: false }, o);
    if (it.marker) {
      const g = new THREE.Group();
      g.position.set(it.x, 0, it.z);
      const s = glow(it.color, 1.4, 0.9);
      s.position.y = it.y + 0.9;
      g.add(s);
      const d = new THREE.Mesh(new THREE.OctahedronGeometry(0.14), basic(it.color));
      d.position.y = it.y + 0.9;
      g.add(d);
      const b = beam(it.color, 2.6, 0.22);
      b.position.y = 1.3;
      g.add(b);
      it.marker = g;
      it.diamond = d;
      it.halo = s;
      this.scene.add(g);
    }
    it.remove = () => {
      it.removed = true;
      if (it.marker) this.scene.remove(it.marker);
    };
    this.interactables.push(it);
    return it;
  }

  addZombie(type, x, z, o = {}) {
    const zb = new Zombie(type, x, z, o);
    this.scene.add(zb.rig.root);
    this.enemies.push(zb);
    return zb;
  }
  aliveCount() {
    let n = 0;
    for (const e of this.enemies) if (e.alive) n++;
    return n;
  }
  addNPC(npc) {
    this.scene.add(npc.rig.root);
    this.npcs.push(npc);
    return npc;
  }

  /* ---------- projectiles ---------- */
  /** lob = a distraction throw: flies over enemy heads and only makes noise where it lands. */
  spawnBottle(origin, vel, lob = false) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.24, 8), basic(C.green, { opacity: 0.9 }));
    m.position.copy(origin);
    const gl = glow(C.green, 0.9, 0.9);
    m.add(gl);
    this.scene.add(m);
    this.projectiles.push({ m, v: vel.clone(), life: 3, lob });
  }
  /** Where a lobbed bottle lands: along the camera's aim, nearer the more the camera looks down. */
  throwSpot(pl) {
    const a = G.camRig.yaw + Math.PI;
    const dx = Math.sin(a), dz = Math.cos(a);
    const D = clamp(16 - G.camRig.pitch * 11, 4, 14);
    let best = D;
    for (const c of this.colliders) {
      if (c.off || c.h < 1.3) continue;
      const t = segAABB(pl.pos.x, pl.pos.z, pl.pos.x + dx * D, pl.pos.z + dz * D, c);
      if (t >= 0) best = Math.min(best, t * D);
    }
    const L = Math.max(1.4, best - 0.5);
    return { x: pl.pos.x + dx * L, z: pl.pos.z + dz * L, yaw: a };
  }
  throwLob(pl) {
    const s = this.throwSpot(pl);
    const o = new THREE.Vector3(pl.pos.x + Math.sin(s.yaw) * 0.5, 1.3, pl.pos.z + Math.cos(s.yaw) * 0.5);
    const dx = s.x - o.x, dz = s.z - o.z, d = Math.hypot(dx, dz);
    const T = 0.35 + d * 0.05; // flight time; gravity on projectiles is 12 m/s^2 so y(T) = 0
    this.spawnBottle(o, new THREE.Vector3(dx / T, (6 * T * T - 1.3) / T, dz / T), true);
  }
  _updateThrowMark() {
    const pl = G.player;
    if (!this.throwMark) {
      const g = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.46, 28), basic(C.cyan, { opacity: 0.8, add: true, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2;
      const dot = new THREE.Mesh(new THREE.CircleGeometry(0.1, 12), basic(C.cyan, { opacity: 0.9, add: true }));
      dot.rotation.x = -Math.PI / 2;
      g.add(ring, dot);
      g.visible = false;
      this.scene.add(g);
      this.throwMark = g;
    }
    const show = pl.inv.bottle > 0 && !pl.dead && !pl.hidden && !pl.locked && !G.camRig.cut;
    this.throwMark.visible = show;
    if (!show) return;
    const s = this.throwSpot(pl);
    this.throwMark.position.set(s.x, 0.06, s.z);
    const k = 1 + Math.sin(this.time * 6) * 0.08;
    this.throwMark.scale.set(k, 1, k);
  }
  _shatter(pr, direct) {
    const p = pr.m.position;
    G.audio.sfx('glass');
    G.fx.burst(p.x, Math.max(0.2, p.y), p.z, C.green, 22, 4.5, 0.7, 8);
    G.fx.burst(p.x, Math.max(0.2, p.y), p.z, C.cyan, 12, 3, 0.6, 8);
    G.fx.ring(p.x, 0, p.z, C.green, 3.2, 0.5);
    if (pr.lob) { // distraction: zombies go and look, nobody is hurt or staggered
      this.makeNoise(p.x, p.z, 15);
      return;
    }
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const d = Math.hypot(e.pos.x - p.x, e.pos.z - p.z);
      if (d < 0.8 && direct === e) e.takeHit(22, 0, 0, 1, { stun: 1.2 });
      else if (d < 3.4) { e.stagger(1.1); e.rig.flash(C.green, 0.2); }
      e.hear(p.x, p.z, 16);
    }
    this.onNoise(p.x, p.z, 16);
  }
  onNoise(x, z, r) { /* stealth hook */ }

  /** Sound the zombies can hear (footsteps, melee, gunshots). Only stealth stages react to it. */
  makeNoise(x, z, r) {
    if (!this.stealthy) return;
    for (const e of this.enemies) e.hear(x, z, r);
    this.onNoise(x, z, r);
  }

  /** True when nothing at least `h` tall blocks the straight line between the two points. */
  hasLOS(x0, z0, x1, z1, h = 1.6) {
    const minX = Math.min(x0, x1), maxX = Math.max(x0, x1), minZ = Math.min(z0, z1), maxZ = Math.max(z0, z1);
    for (const c of this.colliders) {
      if (c.off || c.h < h) continue;
      if (maxX < c.minX || minX > c.maxX || maxZ < c.minZ || minZ > c.maxZ) continue;
      if (segAABB(x0, z0, x1, z1, c) >= 0) return false;
    }
    return true;
  }

  /* ---------- guns ---------- */
  fireBullets(pl, ox, oy, oz, yaw, w) {
    const pellets = w.pellets || 1;
    for (let k = 0; k < pellets; k++) {
      const a = yaw + (Math.random() - 0.5) * 2 * (w.spread || 0);
      const dx = Math.sin(a), dz = Math.cos(a);
      let wallS = w.range;
      for (const c of this.colliders) {
        if (c.off || c.h < 1.15) continue;
        const t = segAABB(ox, oz, ox + dx * w.range, oz + dz * w.range, c);
        if (t >= 0) wallS = Math.min(wallS, t * w.range);
      }
      let best = wallS, hit = null;
      for (const e of this.enemies) {
        if (!e.alive) continue;
        const ex = e.pos.x - ox, ez = e.pos.z - oz;
        const s = ex * dx + ez * dz;
        if (s < 0 || s >= best) continue;
        if (Math.abs(ex * dz - ez * dx) < e.radius + 0.12) { best = s; hit = e; }
      }
      const ex = ox + dx * best, ez = oz + dz * best;
      this._tracer(ox, oy, oz, ex, ez, pellets > 1 ? C.orange : C.cyan);
      if (hit) {
        const fall = 1 - 0.55 * (best / w.range);
        hit.takeHit(Math.round(w.dmg * (pellets > 1 ? fall : 1)), dx, dz, w.knock, { stun: 0.3 });
      } else {
        G.fx.burst(ex, oy, ez, C.yellow, 4, 2, 0.25, 4);
      }
    }
    G.fx.burst(ox, oy, oz, C.yellow, pellets > 1 ? 10 : 5, 2.5, 0.16, 0);
    G.fx.ring(ox, oy - 1.1, oz, C.cyan, 1.1, 0.18);
    shake(pellets > 1 ? 0.22 : 0.1, 0.16);
    this.makeNoise(pl.pos.x, pl.pos.z, w.noise || 28);
  }
  _tracer(x0, y0, z0, x1, z1, color) {
    const len = Math.max(0.3, Math.hypot(x1 - x0, z1 - z0));
    const m = new THREE.Mesh(boxGeo(0.05, 0.05, 1), basic(color, { opacity: 0.9, add: true }));
    m.position.set((x0 + x1) / 2, y0, (z0 + z1) / 2);
    m.rotation.y = Math.atan2(x1 - x0, z1 - z0);
    m.scale.z = len;
    this.scene.add(m);
    this.tracers.push({ m, t: 0.09 });
  }
  _updateTracers(dt) {
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const tr = this.tracers[i];
      tr.t -= dt;
      const k = Math.max(0, tr.t / 0.09);
      tr.m.scale.x = tr.m.scale.y = 0.3 + k;
      if (tr.t <= 0) { this.scene.remove(tr.m); this.tracers.splice(i, 1); }
    }
  }

  /* ---------- spitter acid ---------- */
  spitAt(z, pl) {
    const tx = pl.pos.x + pl.vx * 0.3, tz = pl.pos.z + pl.vz * 0.3;
    const sx = z.pos.x, sz = z.pos.z, sy = 1.3;
    const dx = tx - sx, dy = 0.9 - sy, dz = tz - sz;
    const d = Math.hypot(dx, dy, dz) || 1;
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), basic(C.green));
    m.add(glow(C.green, 1.0, 0.9));
    m.position.set(sx, sy, sz);
    this.scene.add(m);
    this.spits.push({ m, vx: dx / d * 11, vy: dy / d * 11, vz: dz / d * 11, life: 2.2 });
    G.audio.sfx('spit');
  }
  _splash(x, z, puddle) {
    G.fx.burst(x, 0.3, z, C.green, 14, 3, 0.5, 6);
    if (!puddle) return;
    const m = new THREE.Mesh(new THREE.CircleGeometry(1.0, 18), basic(C.green, { opacity: 0.45, add: true }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.05, z);
    this.scene.add(m);
    this.puddles.push({ m, x, z, t: 4.2 });
  }
  _updateSpits(dt) {
    const pl = G.player;
    for (let i = this.spits.length - 1; i >= 0; i--) {
      const s = this.spits[i];
      s.life -= dt;
      s.m.position.x += s.vx * dt; s.m.position.y += s.vy * dt; s.m.position.z += s.vz * dt;
      const p = s.m.position;
      let end = false, floor = false;
      if (!pl.dead && !pl.hidden && Math.hypot(p.x - pl.pos.x, p.z - pl.pos.z) < 0.65 && p.y > 0.1 && p.y < 1.9) {
        const res = pl.takeHit(10, p.x - s.vx * 0.1, p.z - s.vz * 0.1, {});
        if (res === 'hit') pl.slowT = 2.2;
        end = true;
      } else if (p.y <= 0.1) { end = true; floor = true; }
      else if (s.life <= 0) end = true;
      else {
        for (const c of this.colliders) {
          if (c.off || p.y > c.h) continue;
          if (p.x > c.minX && p.x < c.maxX && p.z > c.minZ && p.z < c.maxZ) { end = true; break; }
        }
      }
      if (end) { this._splash(p.x, p.z, floor); this.scene.remove(s.m); this.spits.splice(i, 1); }
    }
    for (let i = this.puddles.length - 1; i >= 0; i--) {
      const q = this.puddles[i];
      q.t -= dt;
      q.m.material.opacity = 0.45;
      if (!pl.dead && pl.pos.y < 0.4 && Math.hypot(pl.pos.x - q.x, pl.pos.z - q.z) < 1.05) {
        pl.hp -= 5 * dt;
        pl.regenDelay = 6;
        pl.slowT = Math.max(pl.slowT || 0, 0.4);
        if (pl.hp <= 0) pl._die();
      }
      if (q.t <= 0) { this.scene.remove(q.m); this.puddles.splice(i, 1); }
    }
  }

  /* ---------- loot ---------- */
  addLoot(type, x, z, zone = -1) {
    const def = LOOT[type];
    const g = new THREE.Group();
    g.position.set(x, 0.55, z);
    const box = nbox(0.3, 0.22, 0.22, 0x1a1040, def.color);
    if (type === 'bottle') { const b = new THREE.Mesh(cylGeo(0.07, 0.07, 0.3, 8), basic(def.color)); b.rotation.z = Math.PI / 2; g.add(b); } else g.add(box);
    g.add(glow(def.color, 1.5, 0.85));
    this.scene.add(g);
    const it = { type, x, z, m: g, t: Math.random() * 6, zone };
    this.loot.push(it);
    return it;
  }
  _giveLoot(type, n) {
    const def = LOOT[type], pl = G.player;
    if (pl.inv[def.key] >= def.cap) return false;
    const got = Math.min(n ?? def.give, def.cap - pl.inv[def.key]);
    pl.inv[def.key] += got;
    G.audio.sfx('pickup');
    G.hud.toast(`${def.text} +${got}`, type === 'medkit' ? 'green' : 'gold');
    G.fx.burst(pl.pos.x, 1, pl.pos.z, def.color, 8, 2, 0.4, 2);
    return true;
  }
  _updateLoot(dt) {
    const pl = G.player;
    for (let i = this.loot.length - 1; i >= 0; i--) {
      const it = this.loot[i];
      it.t += dt;
      it.m.position.y = 0.55 + Math.sin(it.t * 3) * 0.06;
      it.m.rotation.y += dt * 1.8;
      if (!pl.dead && !pl.hidden && Math.hypot(it.x - pl.pos.x, it.z - pl.pos.z) < 1.05 && this._giveLoot(it.type)) {
        this.scene.remove(it.m);
        this.loot.splice(i, 1);
      }
    }
  }
  _updateProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      pr.life -= dt;
      pr.v.y -= 12 * dt;
      pr.m.position.addScaledVector(pr.v, dt);
      pr.m.rotation.x += dt * 12;
      pr.m.rotation.z += dt * 7;
      let hit = null;
      if (!pr.lob) {
        for (const e of this.enemies) {
          if (!e.alive) continue;
          if (Math.hypot(e.pos.x - pr.m.position.x, e.pos.z - pr.m.position.z) < e.radius + 0.25 && pr.m.position.y < 2.1 * e.t.scale && pr.m.position.y > 0) { hit = e; break; }
        }
      }
      let wall = false;
      for (const c of this.colliders) {
        if (c.off) continue;
        const p = pr.m.position;
        if (p.y < c.h && p.x > c.minX && p.x < c.maxX && p.z > c.minZ && p.z < c.maxZ) { wall = true; break; }
      }
      if (hit || wall || pr.m.position.y <= 0.05 || pr.life <= 0) {
        this._shatter(pr, hit);
        this.scene.remove(pr.m);
        this.projectiles.splice(i, 1);
      }
    }
  }

  /* ---------- grab QTE ---------- */
  async startGrab(z) {
    if (this.grabbing || !G.mg) return;
    this.grabbing = true;
    const pl = G.player;
    G.timeScale = 0.12;
    pl.locked = true;
    G.hud.toast('GRABBED!', 'red');
    const ok = await G.mg.run('mash', { title: 'BREAK FREE!', taps: 7, time: 2.8 });
    G.timeScale = 1;
    pl.locked = false;
    this.grabbing = false;
    if (this.disposed || pl.dead) return;
    if (ok) {
      z.stagger(1.8);
      const dx = z.pos.x - pl.pos.x, dz = z.pos.z - pl.pos.z, d = Math.hypot(dx, dz) || 1;
      z.kx = (dx / d) * 9; z.kz = (dz / d) * 9;
      G.fx.ring(pl.pos.x, 0.5, pl.pos.z, C.cyan, 3.2, 0.5);
      G.audio.sfx('parry');
      G.hud.toast('BROKE FREE', 'cyan');
      shake(0.3, 0.3);
    } else {
      pl.damage(26, z.pos.x, z.pos.z);
      z.stagger(0.9);
    }
  }

  /* ---------- hiding (dumpsters, lockers) ---------- */
  _hide(spot) {
    const pl = G.player;
    pl.hidden = true;
    pl.hideSpot = spot;
    pl.locked = true;
    pl.pos.set(spot.x, 0, spot.z);
    pl.vx = pl.vz = 0;
    pl.rig.root.visible = false;
    this.hideAt = this.time;
    G.audio.sfx('door');
    G.hud.toast('HIDING - MOVE OR USE TO COME OUT', 'green');
  }
  _unhide() {
    const pl = G.player, s = pl.hideSpot;
    pl.hidden = false;
    pl.locked = false;
    pl.rig.root.visible = true;
    if (s) pl.pos.set(s.x + (s.ox || 0), 0, s.z + (s.out || 0));
    pl.hideSpot = null;
  }
  onFound(z) {
    if (!G.player.hidden) return;
    this._unhide();
    G.hud.toast('THEY FOUND YOU!', 'red');
    G.audio.sfx('growl');
    z.aware = true;
    z.state = 'chase';
  }

  /* ---------- silent takedown: crouch up behind an unaware zombie and press USE ---------- */
  enableTakedown() {
    this.takedownIt = this.addInteractable({
      x: 0, z: 0, r: 1.9, marker: false, map: false, color: C.cyan, label: 'SILENT TAKEDOWN',
      enabled: () => !!this.tdTarget,
      onUse: () => this._takedown()
    });
  }
  _updateTakedown() {
    const pl = G.player;
    let best = null, bd = 1.9;
    if (!pl.dead && !pl.hidden && !pl.locked && pl.atkT < 0) {
      for (const e of this.enemies) {
        if (!e.alive || !e.stealth || e.aware || e.t.heavy) continue;
        if (e.state !== 'idle' && e.state !== 'investigate') continue;
        const dx = pl.pos.x - e.pos.x, dz = pl.pos.z - e.pos.z, d = Math.hypot(dx, dz);
        if (d >= bd) continue;
        if (Math.abs(angDiff(e.yaw, Math.atan2(dx, dz))) < 1.9) continue; // only from behind
        best = e; bd = d;
      }
    }
    this.tdTarget = best;
    if (best) { this.takedownIt.x = best.pos.x; this.takedownIt.z = best.pos.z; }
  }
  _takedown() {
    const e = this.tdTarget, pl = G.player;
    if (!e || !e.alive) return;
    pl.faceTo(e.pos.x, e.pos.z);
    pl.atkT = 0; pl.atkDur = 0.45; pl.atkKind = 'swing'; pl.hitDone = true; pl.atkCd = 0.7;
    e.die(true);
    G.audio.sfx('swing');
    G.fx.text(new THREE.Vector3(e.pos.x, 2.2, e.pos.z), 'SILENT TAKEDOWN', 'cyan');
    G.fx.ring(e.pos.x, 0, e.pos.z, C.cyan, 2.2, 0.5);
    this.takedowns = (this.takedowns || 0) + 1;
    this.tdTarget = null;
  }

  onEnemyDeath(z) { /* hook */ }
  onPlayerDeath() {
    if (this.deadHandled) return;
    this.deadHandled = true;
    G.timeScale = 1;
    G.audio.setMood(null);
    this.after(1.3, () => { if (!this.disposed) G.hud.showDeath(); });
  }

  /* ---------- per-frame ---------- */
  baseUpdate(dt) {
    this.time += dt;
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const t = this.timers[i];
      t.t -= dt;
      if (t.t <= 0) { this.timers.splice(i, 1); t.fn(); }
    }
    const pl = G.player;
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (this.enemyActiveRange < 1e8) {
        const far = Math.hypot(e.pos.x - pl.pos.x, e.pos.z - pl.pos.z) > this.enemyActiveRange;
        e.rig.root.visible = !far;
        if (far) continue; // frozen while far away
      }
      e.update(dt, this, pl);
      if (e.remove) {
        this.scene.remove(e.rig.root);
        this.enemies.splice(i, 1);
      }
    }
    this._updateProjectiles(dt);
    if (this.tracers.length) this._updateTracers(dt);
    if (this.spits.length || this.puddles.length) this._updateSpits(dt);
    if (this.loot.length) this._updateLoot(dt);
    for (const f of this.flickers) {
      if (f.mat) setFlicker(f.mat, this.time, this.flickerLevel * f.k);
      else {
        const n = Math.sin(this.time * 31 + f.base * 3) * Math.sin(this.time * 9.7);
        f.light.intensity = this.flickerLevel * f.k > 0.05 && n > 1 - this.flickerLevel * f.k * 1.2 ? f.base * 0.15 : f.base;
      }
    }
    for (const u of this.updaters) u(dt, this.time);
    if (this.lobThrow) this._updateThrowMark();
    if (this.takedownIt) this._updateTakedown();
    this._updateInteract(dt);
  }

  _updateInteract(dt) {
    const pl = G.player;
    let best = null, bd = 1e9;
    for (const it of this.interactables) {
      if (it.removed) continue;
      const en = it.enabled ? it.enabled() : true;
      it.active = en;
      if (it.marker) {
        it.marker.visible = en;
        if (en) {
          it.diamond.rotation.y += dt * 2.4;
          it.diamond.position.y = it.y + 0.9 + Math.sin(this.time * 3 + it.x) * 0.08;
          it.halo.material.opacity = 0.6 + Math.sin(this.time * 4) * 0.25;
        }
      }
      if (!en) continue;
      const d = Math.hypot(it.x - pl.pos.x, it.z - pl.pos.z);
      if (d < it.r && d < bd) { best = it; bd = d; }
    }
    this.focus = best;
    const lock = pl.locked || pl.dead;
    G.hud.setPrompt(best && !lock ? (typeof best.label === 'function' ? best.label() : best.label) : null);
    if (best && !lock) {
      if (G.input.consume('interact')) { G.audio.sfx('select'); best.onUse(best); }
    } else {
      G.input.queue.delete('interact');
    }
  }

  /* ---------- minimap ---------- */
  mapData() {
    const pois = [];
    for (const it of this.interactables) if (!it.removed && it.active && it.map !== false) pois.push({ x: it.x, z: it.z, c: it.color, s: 'd' });
    for (const e of this.enemies) if (e.alive) pois.push({ x: e.pos.x, z: e.pos.z, c: C.red, s: 'c' });
    for (const n of this.npcs) pois.push({ x: n.pos.x, z: n.pos.z, c: C.blue, s: 'c' });
    return pois;
  }

  dispose() {
    this.disposed = true;
    this.timers.length = 0;
    const sky = G.assets && G.assets.sky;
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (const m of mats) {
        for (const k of ['map', 'alphaMap', 'emissiveMap']) {
          if (m[k] && m[k] !== sky) m[k].dispose();
        }
        m.dispose();
      }
    });
  }
}
