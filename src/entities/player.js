import * as THREE from 'three';
import { Rig, OUTFITS } from './rig.js';
import { G } from '../core/state.js';
import { clamp, damp, dampAngle, angDiff, pushOutCircle, vibrate } from '../core/util.js';
import { C } from '../core/kit.js';
import { shake } from '../core/fx.js';

export const WEAPONS = {
  fists: { name: 'FISTS', dmg: 9, range: 1.5, arc: 1.9, cd: 0.42, stam: 6, knock: 3.4, dur: 0.42, kind: 'push' },
  bag: { name: 'BACKPACK', dmg: 15, range: 1.75, arc: 2.3, cd: 0.62, stam: 9, knock: 5, dur: 0.55, kind: 'swing' },
  rod: { name: 'METAL ROD', dmg: 32, range: 2.15, arc: 2.3, cd: 0.74, stam: 12, knock: 6.5, dur: 0.6, kind: 'swing' },
  pistol: { name: 'SERVICE PISTOL', dmg: 26, range: 30, cd: 0.3, stam: 0, knock: 1.4, kind: 'gun', ammo: 'ammo', pellets: 1, spread: 0.012, noise: 28, sfx: 'shot' },
  shotgun: { name: 'ARC SHOTGUN', dmg: 12, range: 11, cd: 0.9, stam: 0, knock: 4.5, kind: 'gun', ammo: 'shells', pellets: 7, spread: 0.2, noise: 36, sfx: 'shotgun' }
};
const FRESH_INV = () => ({ backpack: false, phone: false, pass: false, bottle: 0, medkit: 0, rod: false, coins: 0, pistol: false, shotgun: false, ammo: 0, shells: 0, food: 0, batteries: 0, keycard: false, scrap: 0, cloth: 0, wood: 0, kits: 0 });

export class Player {
  constructor(outfitId = 0) {
    this.maxHp = 100;
    this.maxStamina = 100;
    this.radius = 0.32;
    this.setOutfit(outfitId, true);
    this.pos = this.rig.root.position;
    this.inv = FRESH_INV();
    this.wKey = 'fists';
    this.reset(0, 0, 0);
  }

  setOutfit(id, first = false) {
    this.outfit = id;
    const o = OUTFITS[id] || OUTFITS[0];
    if (first) {
      this.rig = new Rig({
        skin: 0xd09470, shirt: o.jacket, pants: 0x0d0d2b, accent: o.accent, hair: o.hair,
        outline: o.accent, scale: 0.97, headphones: true, backpack: true
      });
      this.rig.setPack(false);
    } else {
      this.rig.setColors(o.jacket, o.accent, o.hair);
    }
    this.accent = o.accent;
  }

  reset(x, z, yaw = 0) {
    this.pos.set(x, 0, z);
    this.vx = 0;
    this.vz = 0;
    this.vy = 0;
    this.yaw = yaw;
    this.rig.root.rotation.y = yaw;
    this.grounded = true;
    this.hp = this.maxHp;
    this.stamina = this.maxStamina;
    this.dead = false;
    this.locked = false;
    this.crouch = false;
    this.sprinting = false;
    this.blocking = false;
    this.blockT = 0;
    this.atkT = -1;
    this.atkCd = 0;
    this.atkKind = 'swing';
    this.atkDur = 0.5;
    this.hitAt = 0.38;
    this.hitDone = true;
    this.dashT = 0;
    this.dodgeT = 0;
    this.dashCd = 0;
    this.iframes = 0;
    this.hurtT = 0;
    this.stamDelay = 0;
    this.regenDelay = 0;
    this.stepAcc = 0;
    this.auto = null;
    this.hidden = false;
    this.hideSpot = null;
    this.slowT = 0;
    this.aimT = 0;
    this.t = 0;
    const p = this.rig.p;
    p.dead = 0; p.lie = 0; p.seated = 0; p.hurt = 0; p.atkT = -1; p.dash = 0; p.phone = 0; p.wave = 0;
    this.rig.s.dead = 0; this.rig.s.lie = 0; this.rig.s.seated = 0;
    this.rig.root.visible = true;
    this.syncHeld();
    G.input && G.input.setToggle('crouch', false);
    G.input && G.input.setToggle('run', false);
  }

  /** Everyday outfit (after the bedroom). */
  dressUp() {
    const o = OUTFITS[this.outfit] || OUTFITS[0];
    const r = this.rig;
    r.shirtMat.color.setHex(o.jacket);
    r.pantsMat.color.setHex(0x0d0d2b);
    r.setColors(null, o.accent, o.hair);
    r.stripes.forEach((s) => { s.visible = true; });
  }

  /** Default carried gear when jumping straight into a later chapter. */
  giveKit() {
    this.inv.backpack = true;
    this.inv.phone = true;
    this.inv.pass = true;
    this.inv.bottle = Math.max(this.inv.bottle, 1);
    this.syncHeld();
  }

  resetInventory() {
    this.inv = FRESH_INV();
    this.wKey = 'fists';
    this.syncHeld();
  }

  get weapons() {
    const l = ['fists'];
    if (this.inv.backpack) l.push('bag');
    if (this.inv.rod) l.push('rod');
    if (this.inv.pistol) l.push('pistol');
    if (this.inv.shotgun) l.push('shotgun');
    return l;
  }
  get hasGun() { return WEAPONS[this.wKey].kind === 'gun'; }
  get weapon() { return WEAPONS[this.wKey]; }
  cycleWeapon() {
    const l = this.weapons;
    this.wKey = l[(l.indexOf(this.wKey) + 1) % l.length];
    this.syncHeld();
    G.audio.sfx('select');
    G.hud && G.hud.toast(WEAPONS[this.wKey].name + ' EQUIPPED', 'cyan');
  }
  setWeapon(k) {
    if (this.weapons.includes(k)) { this.wKey = k; this.syncHeld(); }
  }
  syncHeld() {
    this.rig.setHeld(this.wKey === 'fists' ? null : this.wKey);
    this.rig.setPack(this.inv.backpack && this.wKey !== 'bag');
  }

  serialize() {
    return { hp: Math.max(40, this.hp), inv: { ...this.inv }, wKey: this.wKey, outfit: this.outfit };
  }
  restore(d) {
    if (!d) return;
    if (d.inv) Object.assign(this.inv, d.inv);
    if (d.wKey) this.wKey = d.wKey;
    if (!this.weapons.includes(this.wKey)) this.wKey = 'fists';
    if (d.hp) this.hp = d.hp;
    this.syncHeld();
  }

  heal(n) {
    this.hp = Math.min(this.maxHp, this.hp + n);
  }
  useMedkit() {
    if (this.hp >= this.maxHp || this.dead || this.hidden) return false;
    if (this.inv.medkit > 0) {
      this.inv.medkit--;
      this.heal(45);
      G.audio.sfx('heal');
      G.fx.ring(this.pos.x, this.pos.y, this.pos.z, C.green, 1.8, 0.6);
      G.fx.burst(this.pos.x, 1, this.pos.z, C.green, 16, 2.5, 0.8, -1);
      G.fx.text(new THREE.Vector3(this.pos.x, 1.9, this.pos.z), '+45 HP', 'good');
      return true;
    }
    if (this.inv.food > 0) { // no medkit: eat something
      this.inv.food--;
      this.heal(18);
      this.stamina = this.maxStamina;
      G.audio.sfx('eat');
      G.fx.burst(this.pos.x, 1, this.pos.z, C.hot, 10, 2, 0.6, -1);
      G.fx.text(new THREE.Vector3(this.pos.x, 1.9, this.pos.z), '+18 HP', 'good');
      return true;
    }
    return false;
  }

  walkTo(x, z, speed = 2.2, cb = null) {
    this.auto = { x, z, speed, cb };
  }
  faceTo(x, z) {
    this.yaw = Math.atan2(x - this.pos.x, z - this.pos.z);
    this.rig.root.rotation.y = this.yaw;
  }

  nearestEnemy(maxDist, cone) {
    let best = null, bd = maxDist;
    const list = G.stage ? G.stage.enemies : [];
    for (const e of list) {
      if (!e.alive) continue;
      const dx = e.pos.x - this.pos.x, dz = e.pos.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d >= bd) continue;
      if (Math.abs(angDiff(this.yaw, Math.atan2(dx, dz))) > cone && d > 1.2) continue;
      best = e; bd = d;
    }
    return best;
  }

  tryAttack(stage) {
    if (!stage.combat || this.atkT >= 0 || this.atkCd > 0 || this.blocking || this.dashT > 0) return;
    const w = this.weapon;
    if (w.kind === 'gun') { this._fire(stage, w); return; }
    if (this.stamina < w.stam) { G.audio.sfx('error'); return; }
    this.stamina -= w.stam;
    this.stamDelay = 0.7;
    const e = this.nearestEnemy(2.9, 1.7);
    if (e) this.yaw = Math.atan2(e.pos.x - this.pos.x, e.pos.z - this.pos.z);
    this.atkT = 0;
    this.atkDur = w.dur;
    this.atkKind = w.kind;
    this.atkCd = w.cd;
    this.hitAt = 0.38;
    this.hitDone = false;
    this.atkWeapon = w;
    G.audio.sfx('swing');
  }
  _fire(stage, w) {
    if (this.inv[w.ammo] <= 0) {
      this.atkCd = 0.35;
      G.audio.sfx('empty');
      G.hud.toast('OUT OF AMMO', 'red');
      return;
    }
    this.inv[w.ammo]--;
    this.atkCd = w.cd;
    this.aimT = 1.6;
    // aim assist: snap to the nearest enemy in front of the player, otherwise shoot straight ahead
    const e = this.nearestEnemy(w.range, 0.55);
    if (e) this.yaw = Math.atan2(e.pos.x - this.pos.x, e.pos.z - this.pos.z);
    this.rig.root.rotation.y = this.yaw;
    const ox = this.pos.x + Math.sin(this.yaw) * 0.6, oz = this.pos.z + Math.cos(this.yaw) * 0.6;
    G.audio.sfx(w.sfx);
    vibrate(w.pellets > 1 ? 30 : 14);
    stage.fireBullets(this, ox, 1.25, oz, this.yaw, w);
  }
  tryThrow(stage) {
    if (!stage.combat || this.atkT >= 0 || this.atkCd > 0 || this.inv.bottle <= 0 || this.blocking) {
      if (this.inv.bottle <= 0 && stage.combat) G.audio.sfx('error');
      return;
    }
    // stealth stages: lob where the camera aims; elsewhere auto-aim at the nearest enemy
    const e = stage.lobThrow ? null : this.nearestEnemy(14, 0.9);
    if (e) this.yaw = Math.atan2(e.pos.x - this.pos.x, e.pos.z - this.pos.z);
    else if (stage.lobThrow) this.yaw = G.camRig.yaw + Math.PI;
    this.inv.bottle--;
    this.atkT = 0.28;
    this.atkDur = 0.42;
    this.atkKind = 'throw';
    this.atkCd = 0.5;
    this.hitAt = 0.5;
    this.hitDone = false;
    this.rig.setHeld('bottle');
    this.throwTarget = e;
    G.audio.sfx('throw');
  }
  _release(stage) {
    if (stage.lobThrow) { stage.throwLob(this); this.syncHeld(); return; }
    const o = new THREE.Vector3(this.pos.x + Math.sin(this.yaw) * 0.5, 1.3, this.pos.z + Math.cos(this.yaw) * 0.5);
    let dx = Math.sin(this.yaw), dz = Math.cos(this.yaw);
    let dist = 10;
    const t = this.throwTarget;
    if (t && t.alive) {
      dx = t.pos.x - o.x; dz = t.pos.z - o.z;
      dist = Math.hypot(dx, dz);
      dx /= dist; dz /= dist;
    }
    const sp = clamp(dist * 1.4, 7, 15);
    const tf = dist / sp;
    stage.spawnBottle(o, new THREE.Vector3(dx * sp, 6 * tf - 0.3 / Math.max(tf, 0.2), dz * sp));
    this.syncHeld();
  }
  _strike(stage) {
    const w = this.atkWeapon;
    let hit = 0;
    for (const e of stage.enemies) {
      if (!e.alive) continue;
      const dx = e.pos.x - this.pos.x, dz = e.pos.z - this.pos.z;
      const dist = Math.hypot(dx, dz) || 0.001;
      if (dist > w.range + e.radius) continue;
      const ang = Math.abs(angDiff(this.yaw, Math.atan2(dx, dz)));
      if (ang > w.arc / 2 && dist > 0.9) continue;
      e.takeHit(w.dmg, dx / dist, dz / dist, w.knock, { stun: w.kind === 'push' ? 0.55 : 0.35 });
      hit++;
    }
    if (hit) {
      G.hitstop = 0.07;
      shake(0.18, 0.18);
      vibrate(14);
    }
    stage.makeNoise(this.pos.x, this.pos.z, 7);
  }

  /** returns 'hit' | 'blocked' | 'parried' | 'dodged' | 'miss' | 'grab' */
  takeHit(dmg, sx, sz, o = {}) {
    if (this.dead || this.iframes > 0) return 'miss';
    if (this.dodgeT > 0) return 'dodged';
    const toSrc = Math.atan2(sx - this.pos.x, sz - this.pos.z);
    if (this.blocking && !o.grab && Math.abs(angDiff(this.yaw, toSrc)) < 1.35) {
      if (this.blockT < 0.3) {
        this.stamina = Math.min(this.maxStamina, this.stamina + 12);
        G.audio.sfx('parry');
        G.fx.ring(this.pos.x, 1, this.pos.z, C.cyan, 2.2, 0.4);
        G.fx.burst(this.pos.x, 1.2, this.pos.z, C.cyan, 14, 4, 0.5, 4);
        G.fx.text(new THREE.Vector3(this.pos.x, 2.1, this.pos.z), 'PERFECT BLOCK', 'cyan');
        this.iframes = 0.25;
        return 'parried';
      }
      const cost = dmg * 0.9;
      this.stamina -= cost;
      this.stamDelay = 1.0;
      G.audio.sfx('block');
      const bag = this.wKey === 'bag' ? 0.12 : 0.3;
      if (this.stamina <= 0) {
        this.stamina = 0;
        this.blocking = false;
        G.hud.toast('GUARD BROKEN', 'red');
      } else {
        this.hp -= dmg * bag;
        this.vx -= Math.sin(toSrc) * 2.2;
        this.vz -= Math.cos(toSrc) * 2.2;
        G.fx.burst(this.pos.x, 1.2, this.pos.z, C.cyan, 8, 3, 0.4, 4);
        if (this.hp <= 0) this._die();
        return 'blocked';
      }
    }
    if (o.grab) return 'grab';
    this.damage(dmg, sx, sz);
    return this.dead ? 'dead' : 'hit';
  }
  damage(dmg, sx, sz) {
    if (this.dead) return;
    this.hp -= dmg;
    this.hurtT = 0.35;
    this.iframes = 0.55;
    this.regenDelay = 7;
    this.atkT = -1;
    this.rig.flash(C.red, 0.2);
    const a = Math.atan2(sx - this.pos.x, sz - this.pos.z);
    this.vx -= Math.sin(a) * 4.5;
    this.vz -= Math.cos(a) * 4.5;
    G.audio.sfx('hurt');
    G.hud.damageFlash();
    shake(0.35, 0.3);
    vibrate(40);
    G.fx.burst(this.pos.x, 1.1, this.pos.z, C.red, 14, 3.5, 0.5, 6);
    G.fx.text(new THREE.Vector3(this.pos.x, 2, this.pos.z), '-' + Math.round(dmg), 'bad');
    if (this.hp <= 0) this._die();
  }
  _die() {
    this.hp = 0;
    this.dead = true;
    this.rig.p.dead = 1;
    G.fx.burst(this.pos.x, 1, this.pos.z, C.pink, 30, 5, 1, 4);
    G.audio.sfx('lose');
    if (G.stage) G.stage.onPlayerDeath();
  }
  onDodge(z) {
    G.fx.text(new THREE.Vector3(this.pos.x, 2.1, this.pos.z), 'DODGE!', 'cyan');
    this.stamina = Math.min(this.maxStamina, this.stamina + 14);
    G.audio.sfx('parry');
  }

  update(dt, stage) {
    const inp = G.input, rig = this.rig, p = rig.p;
    this.t += dt;
    if (this.dead) {
      p.dead = 1; p.speed = 0; p.atkT = -1;
      rig.update(dt);
      return;
    }
    this.iframes = Math.max(0, this.iframes - dt);
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.atkCd = Math.max(0, this.atkCd - dt);
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.dodgeT = Math.max(0, this.dodgeT - dt);
    this.stamDelay = Math.max(0, this.stamDelay - dt);
    this.regenDelay = Math.max(0, this.regenDelay - dt);
    this.slowT = Math.max(0, this.slowT - dt);
    this.aimT = Math.max(0, this.aimT - dt);

    let moveSpeed = 0;
    if (this.locked) {
      this.blocking = false;
      this.sprinting = false;
      if (this.auto) {
        const a = this.auto;
        const dx = a.x - this.pos.x, dz = a.z - this.pos.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.1) {
          this.auto = null;
          this.vx = this.vz = 0;
          if (a.cb) a.cb();
        } else {
          this.vx = (dx / d) * a.speed;
          this.vz = (dz / d) * a.speed;
          this.pos.x += this.vx * dt;
          this.pos.z += this.vz * dt;
          this.yaw = dampAngle(this.yaw, Math.atan2(dx, dz), 12, dt);
          moveSpeed = a.speed;
        }
      } else {
        this.vx = damp(this.vx, 0, 12, dt);
        this.vz = damp(this.vz, 0, 12, dt);
      }
      if (stage.colliders && this.auto) pushOutCircle(this.pos, this.radius, stage.colliders, this.pos.y);
    } else {
      moveSpeed = this._control(dt, stage);
    }

    // stamina / health regen
    if (this.sprinting) { this.stamina -= 15 * dt; this.stamDelay = 0.8; if (this.stamina <= 0) { this.stamina = 0; inp.setToggle('run', false); } }
    else if (this.stamDelay <= 0) this.stamina = Math.min(this.maxStamina, this.stamina + 24 * dt);
    if (!stage.combat && this.regenDelay <= 0 && this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + 3 * dt);

    // attack timeline
    if (this.atkT >= 0) {
      this.atkT += dt / this.atkDur;
      if (!this.hitDone && this.atkT >= this.hitAt) {
        this.hitDone = true;
        if (this.atkKind === 'throw') this._release(stage);
        else this._strike(stage);
      }
      if (this.atkT >= 1) this.atkT = -1;
    }
    if (this.dashT > 0) this.dashT -= dt;

    // pose
    p.speed = this.dashT > 0 ? 6 : moveSpeed;
    p.crouch = this.crouch ? 1 : 0;
    p.air = !this.grounded;
    p.vy = this.vy;
    p.block = this.blocking ? 1 : 0;
    p.hurt = this.hurtT > 0 ? this.hurtT / 0.35 : 0;
    p.dash = this.dashT > 0 ? 1 : 0;
    p.aim = this.hasGun && !this.hidden ? (this.aimT > 0 ? 1 : 0.7) : 0;
    p.atkT = this.atkT;
    p.atk = this.atkKind === 'push' ? 'push' : 'swing';
    rig.root.rotation.y = this.yaw;
    rig.update(dt);
  }

  _control(dt, stage) {
    const inp = G.input;
    const camYaw = G.camRig.yaw;
    if (inp.consume('switch')) this.cycleWeapon();
    if (inp.consume('medkit')) this.useMedkit();
    if (stage.combat) {
      if (inp.consume('attack')) this.tryAttack(stage);
      if (inp.consume('shoot')) this.tryThrow(stage);
    } else { inp.consume('attack'); inp.consume('shoot'); }

    const wantBlock = stage.combat && inp.held.block && this.stamina > 2 && this.atkT < 0 && this.dashT <= 0;
    if (wantBlock && !this.blocking) { this.blocking = true; this.blockT = 0; }
    else if (!wantBlock) this.blocking = false;
    if (this.blocking) { this.blockT += dt; this.stamina -= 3.5 * dt; this.stamDelay = 0.6; }

    this.crouch = inp.toggles.crouch && this.grounded;
    const mx = inp.mx, my = inp.my;
    const mag = Math.min(1, Math.hypot(mx, my));
    let dx = 0, dz = 0;
    if (mag > 0.01) {
      const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
      const rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
      dx = fx * my + rx * mx;
      dz = fz * my + rz * mx;
      const l = Math.hypot(dx, dz) || 1;
      dx /= l; dz /= l;
    }
    this.sprinting = inp.running && mag > 0.3 && this.stamina > 4 && !this.crouch && !this.blocking && this.atkT < 0;
    let speed = this.crouch ? 1.55 : this.sprinting ? 5.7 : 2.8;
    if (this.blocking) speed = 1.5;
    if (this.atkT >= 0) speed *= 0.5;
    if (this.slowT > 0) speed *= 0.6;
    if (stage.speedMul) speed *= stage.speedMul;

    if (inp.consume('dodge') && stage.combat && this.dashCd <= 0 && this.stamina >= 18 && this.dashT <= 0) {
      let ddx = dx, ddz = dz;
      if (mag < 0.2) { ddx = -Math.sin(this.yaw); ddz = -Math.cos(this.yaw); }
      this.dashDir = { x: ddx, z: ddz };
      this.dashT = 0.26;
      this.dodgeT = 0.34;
      this.dashCd = 0.6;
      this.stamina -= 18;
      this.stamDelay = 0.8;
      this.atkT = -1;
      G.audio.sfx('dodge');
      G.fx.ring(this.pos.x, 0, this.pos.z, this.accent, 1.5, 0.35);
      G.fx.burst(this.pos.x, 0.3, this.pos.z, this.accent, 10, 2.5, 0.4, 2);
    }
    if (inp.consume('jump') && this.grounded && !this.crouch && !this.blocking && this.dashT <= 0) {
      this.vy = 6.6;
      this.grounded = false;
    }
    const dm = this.sprinting ? 1 : clamp(mag * 1.15, 0, 1);
    this.vx = damp(this.vx, dx * speed * dm, 13, dt);
    this.vz = damp(this.vz, dz * speed * dm, 13, dt);
    if (this.dashT > 0) {
      this.vx = this.dashDir.x * 10;
      this.vz = this.dashDir.z * 10;
      if (Math.random() < 0.6) G.fx.burst(this.pos.x, 0.9, this.pos.z, this.accent, 1, 0.5, 0.35, 0);
    }
    if (!this.grounded) {
      this.vy -= 22 * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= 0) { this.pos.y = 0; this.vy = 0; this.grounded = true; G.audio.sfx('step'); }
    }
    this.pos.x += this.vx * dt;
    this.pos.z += this.vz * dt;
    pushOutCircle(this.pos, this.radius, stage.colliders, this.pos.y);
    if (stage.dynColliders) pushOutCircle(this.pos, this.radius, stage.dynColliders(), this.pos.y);
    const b = stage.bounds;
    if (b) {
      this.pos.x = clamp(this.pos.x, b.minX, b.maxX);
      this.pos.z = clamp(this.pos.z, b.minZ, b.maxZ);
    }
    const sp = Math.hypot(this.vx, this.vz);
    if (this.dashT > 0) {
      this.yaw = dampAngle(this.yaw, Math.atan2(this.dashDir.x, this.dashDir.z), 25, dt);
    } else if (this.atkT < 0 && !this.blocking && sp > 0.35) {
      this.yaw = dampAngle(this.yaw, Math.atan2(this.vx, this.vz), 16, dt);
    } else if (this.blocking) {
      const e = this.nearestEnemy(6, 3.2);
      if (e) this.yaw = dampAngle(this.yaw, Math.atan2(e.pos.x - this.pos.x, e.pos.z - this.pos.z), 14, dt);
    }
    this.stepAcc += sp * dt;
    if (this.grounded && sp > 0.6 && this.stepAcc > (this.sprinting ? 1.9 : 1.35)) {
      this.stepAcc = 0;
      G.audio.sfx('step');
      if (!this.crouch) stage.makeNoise(this.pos.x, this.pos.z, this.sprinting ? 10 : 4.5); // zombies hear footsteps; crouching is silent
    }
    return sp;
  }
}
