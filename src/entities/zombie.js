import * as THREE from 'three';
import { Rig } from './rig.js';
import { G } from '../core/state.js';
import { C } from '../core/kit.js';
import { damp, dampAngle, angDiff, pushOutCircle, rand, TAU } from '../core/util.js';
import { shake } from '../core/fx.js';

export const ZTYPES = {
  walker: { name: 'WALKER', hp: 62, speed: 1.35, dmg: 12, reach: 1.4, windup: 0.6, recover: 0.8, scale: 1.0, width: 1, eyes: C.red, veins: C.cyan },
  runner: { name: 'RUNNER', hp: 36, speed: 3.8, dmg: 9, reach: 1.3, windup: 0.32, recover: 0.55, scale: 0.95, width: 0.9, eyes: C.hot, veins: C.violet, runner: true, pounce: true },
  brute: { name: 'BRUTE', hp: 230, speed: 1.55, dmg: 30, reach: 1.7, windup: 0.95, recover: 1.2, scale: 1.3, width: 1.3, bulk: 1.4, armBulk: 1.5, eyes: C.orange, veins: C.red, heavy: true },
  spitter: { name: 'SPITTER', hp: 45, speed: 1.1, dmg: 10, reach: 1.3, windup: 0.6, recover: 0.8, scale: 1.0, width: 0.95, eyes: C.green, veins: C.green },
  screamer: { name: 'SCREAMER', hp: 40, speed: 2.2, dmg: 8, reach: 1.3, windup: 0.5, recover: 0.7, scale: 0.98, width: 0.9, eyes: C.pink, veins: C.pink }
};
const SHIRTS = [0x1b1236, 0x2a1038, 0x10213a, 0x2a0f26, 0x14183a];
let ZID = 1;

export class Zombie {
  constructor(type, x, z, o = {}) {
    const t = (this.t = ZTYPES[type]);
    this.type = type;
    this.id = ZID++;
    this.rig = new Rig({
      zombie: true, skin: 0x35305a, shirt: o.shirt ?? SHIRTS[this.id % SHIRTS.length], pants: 0x0b0b1e,
      eyes: t.eyes, veins: t.veins, runner: !!t.runner, scale: t.scale, width: t.width,
      bulk: t.bulk, armBulk: t.armBulk, outline: t.veins, hair: this.id % 2 ? 0x1a1030 : null, hood: !!o.hood
    });
    this.rig.skinBase.setHex(0x35305a);
    this.pos = this.rig.root.position;
    this.pos.set(x, 0, z);
    this.hp = this.maxHp = t.hp;
    this.alive = true;
    this.remove = false;
    this.radius = 0.38 * t.scale;
    this.state = o.idle ? 'idle' : 'chase';
    this.aware = !o.idle;
    // stealth AI (chapters 5-6): wanders, sees in a cone, hears noise, can lose the player
    this.stealth = !!o.stealth;
    this.home = { x, z };
    this.patrol = o.patrol || null;   // [[x,z],...] route walked while unaware (cleared once disturbed)
    this.patrolI = 0;
    this.patrolWait = rand(0, 2);
    this.still = !!o.still;           // stands guard, only looking around (cleared once disturbed)
    this.sight = o.sight ?? 12;
    this.alert = 0;
    this.wp = null;
    this.wpT = rand(0.5, 3);
    this.invest = null;
    this.searching = false;
    this.searchT = 0;
    this.invBest = 1e9; // closest it has got to the investigate spot, and how long it has made no progress (blocked by scenery)
    this.invStall = 0;
    this.loseT = 0;
    this.sniffT = 0;
    this.spitCd = rand(1, 2.5);
    this.lastSeen = { x, z };
    this.qShown = false;
    this.timer = 0;
    this.time = rand(0, 10);
    this.yaw = o.yaw ?? rand(0, TAU);
    this.baseYaw = this.yaw;
    this.kx = 0;
    this.kz = 0;
    this.stun = 0;
    this.cool = rand(0.2, 1);
    this.pounceCd = rand(1, 3);
    this.hitDone = true;
    this.detour = 0;
    this.detourSide = 1;
    this.lastX = x;
    this.lastZ = z;
    this.stuckT = 0;
    this.ringAng = (this.id * 2.399) % TAU;
    this.deadT = 0;
    this.grabber = !!o.grabber;
    this.grabbedOnce = false;
    this.telegraph = false;
    this.lure = null;
    this.pdx = 0;
    this.pdz = 0;
    this.siegeBar = null;             // chapter 7: barricade this zombie is trying to get through (see Stage.siegeGoal)
    this.bashT = 0;
    this.rig.root.rotation.y = this.yaw;
  }

  setState(s) {
    this.state = s;
    this.telegraph = false;
    if (s === 'windup') { this.timer = this.t.windup; this.telegraph = true; }
    else if (s === 'strike') { this.timer = 0; this.hitDone = false; }
    else if (s === 'recover') { this.timer = this.t.recover; this.rig.p.windup = 0; }
    else if (s === 'scream') { this.timer = 1.0; this.telegraph = true; }
    else if (s === 'spitWind') { this.timer = 0.7; this.telegraph = true; }
    else if (s === 'pounceWind') { this.timer = 0.45; this.telegraph = true; }
    else if (s === 'pounce') { this.timer = 0.42; this.hitDone = false; }
  }
  stagger(d) {
    if (!this.alive) return;
    this.state = 'stagger';
    this.timer = d;
    this.telegraph = false;
    this.rig.p.windup = 0;
    this.rig.p.atkT = -1;
    this.rig.p.crouch = 0;
  }
  hear(x, z, r) {
    if (!this.alive) return;
    if (Math.hypot(x - this.pos.x, z - this.pos.z) >= r) return;
    if (this.stealth) {
      // stealth zombies go and look at the noise instead of knowing where the player is
      if (this.state === 'idle' || this.state === 'investigate') {
        this.state = 'investigate';
        this.invest = { x, z };
        this.searching = false;
        this.invBest = 1e9; this.invStall = 0;
        this.alert = Math.max(this.alert, 0.3);
      }
      return;
    }
    if (this.state === 'idle') { this.aware = true; this.state = 'chase'; }
    this.lure = { x, z, t: 5 };
  }

  /** Does this (unaware) zombie notice the player right now? Builds up an alert meter. */
  _detect(stage, pl, dist, dx, dz, dt) {
    if (pl.dead || pl.hidden) { this.alert = Math.max(0, this.alert - dt * 0.8); return false; }
    const range = this.sight * (pl.crouch ? 0.5 : 1) * (pl.sprinting ? 1.3 : 1);
    let seen = false;
    const ang = Math.abs(angDiff(this.yaw, Math.atan2(dx, dz)));
    // creeping up behind an unaware zombie (stages with takedowns) is not noticed at point-blank range
    if (dist < 1.8 && !(stage.takedownIt && pl.crouch && ang > 2.0)) seen = true;
    else if (dist >= 1.8 && dist < range) {
      if (ang < 1.15 && stage.hasLOS(this.pos.x, this.pos.z, pl.pos.x, pl.pos.z, pl.crouch ? 0.9 : 1.6)) seen = true;
    }
    if (seen) this.alert += dt * (dist < 1.8 ? 3 : 0.5 + 1.8 * (1 - dist / range));
    else this.alert = Math.max(0, this.alert - dt * 0.6);
    if (this.alert > 0.35 && !this.qShown) {
      this.qShown = true;
      G.fx.text(new THREE.Vector3(this.pos.x, 2.3 * this.t.scale, this.pos.z), '?', 'gold');
    }
    if (this.alert < 0.1) this.qShown = false;
    return this.alert >= 1;
  }
  _spot(stage, pl) {
    this.aware = true;
    this.alert = 1;
    this.lure = null;
    G.fx.text(new THREE.Vector3(this.pos.x, 2.4 * this.t.scale, this.pos.z), '!', 'bad');
    if (this.type === 'screamer') this.setState('scream');
    else { this.state = 'chase'; G.audio.sfx('growl'); }
    // nearby unaware zombies come and have a look
    for (const o of stage.enemies) if (o !== this && o.alive && o.stealth) o.hear(this.pos.x, this.pos.z, 9);
  }
  _scream(stage) {
    G.audio.sfx('scream');
    G.fx.ring(this.pos.x, 0, this.pos.z, C.pink, 6, 0.8);
    shake(0.5, 0.6);
    let n = 0;
    for (const o of stage.enemies) {
      if (o === this || !o.alive) continue;
      if (Math.hypot(o.pos.x - this.pos.x, o.pos.z - this.pos.z) < 42) {
        o.aware = true;
        if (o.state === 'idle' || o.state === 'investigate') { o.state = 'chase'; n++; }
      }
    }
    if (n) G.hud.toast('THE SCREAM ALERTED THE HORDE!', 'red');
  }

  takeHit(dmg, dx, dz, knock = 3, o = {}) {
    if (!this.alive) return;
    this.hp -= dmg;
    const k = this.t.heavy ? knock * 0.3 : knock;
    this.kx = dx * k * 2;
    this.kz = dz * k * 2;
    this.aware = true;
    this.rig.flash(0xffffff, 0.18);
    G.fx.burst(this.pos.x, 1.2 * this.t.scale, this.pos.z, this.t.veins, 10, 3.2, 0.5, 6);
    G.fx.text(new THREE.Vector3(this.pos.x, 2 * this.t.scale, this.pos.z), String(Math.round(dmg)), '');
    G.audio.sfx(dmg >= 25 ? 'crit' : 'hit');
    G.audio.sfx('zhit');
    if (this.hp <= 0) { this.die(); return; }
    let stun = o.stun ?? 0.3;
    if (this.t.heavy) stun *= 0.4;
    if (this.state !== 'stagger' || this.timer < stun) this.stagger(stun);
    if (this.state === 'idle') this.state = 'chase';
  }
  die(silent = false) {
    this.alive = false;
    this.state = 'dead';
    this.telegraph = false;
    this.rig.p.dead = 1;
    this.rig.p.windup = 0;
    this.rig.p.atkT = -1;
    this.rig.p.hurt = 0;
    this.rig.p.crouch = 0;
    if (!silent) G.audio.sfx('zdie');
    G.fx.burst(this.pos.x, 1, this.pos.z, this.t.veins, 30, 5, 1, 3);
    G.fx.burst(this.pos.x, 1, this.pos.z, C.pink, 14, 3, 0.8, 2);
    G.fx.ring(this.pos.x, 0, this.pos.z, this.t.veins, 2.4, 0.6);
    if (G.stage) G.stage.onEnemyDeath(this);
  }

  _react(res, pl) {
    if (res === 'parried') { this.stagger(1.1); this.rig.flash(C.cyan, 0.2); G.hitstop = 0.09; }
    else if (res === 'dodged') pl.onDodge(this);
    else if (res === 'blocked') { this.kx -= Math.sin(this.yaw) * 1.5; this.kz -= Math.cos(this.yaw) * 1.5; }
  }

  update(dt, stage, pl) {
    const rig = this.rig, p = rig.p, t = this.t;
    this.time += dt;
    if (!this.alive) {
      this.deadT += dt;
      p.dead = 1; p.speed = 0;
      rig.update(dt);
      if (this.deadT > 2) this.pos.y -= dt * 0.5;
      if (this.deadT > 3.2) this.remove = true;
      return;
    }
    this.cool = Math.max(0, this.cool - dt);
    this.pounceCd = Math.max(0, this.pounceCd - dt);
    this.spitCd = Math.max(0, this.spitCd - dt);
    this.kx = damp(this.kx, 0, 7, dt);
    this.kz = damp(this.kz, 0, 7, dt);
    if (this.lure) { this.lure.t -= dt; if (this.lure.t <= 0) this.lure = null; }

    const dx = pl.pos.x - this.pos.x, dz = pl.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz) || 0.001;
    let mvx = 0, mvz = 0, faceRate = 0, speedShown = 0;

    // a hidden player: a zombie that lingers right next to the hiding place will find them
    if (this.stealth && pl.hidden) {
      if (dist < 2.2) this.sniffT += dt; else this.sniffT = Math.max(0, this.sniffT - dt);
      if (this.sniffT > 1.6) { this.sniffT = 0; if (stage.onFound) stage.onFound(this); }
    }

    switch (this.state) {
      case 'idle':
        if (this.aware) { this.state = 'chase'; break; }
        if (this.stealth) {
          if (this._detect(stage, pl, dist, dx, dz, dt)) { this._spot(stage, pl); break; }
          if (this.patrol) {
            // walks its route, pausing at each point to look about
            if (this.patrolWait > 0) {
              this.patrolWait -= dt;
              this.yaw += Math.sin(this.time * 0.9 + this.id) * 0.5 * dt;
            } else {
              const w = this.patrol[this.patrolI], wx = w[0] - this.pos.x, wz = w[1] - this.pos.z, wd = Math.hypot(wx, wz);
              if (wd < 0.6) { this.patrolI = (this.patrolI + 1) % this.patrol.length; this.patrolWait = rand(1.4, 3.4); }
              else {
                const sp = Math.min(t.speed * 0.5, 1.1);
                mvx = (wx / wd) * sp; mvz = (wz / wd) * sp;
                speedShown = sp;
                this.yaw = dampAngle(this.yaw, Math.atan2(wx, wz), 4, dt);
              }
            }
            break;
          }
          if (this.still) { // standing guard: sways its gaze around the spot it faces
            this.yaw = this.baseYaw + Math.sin(this.time * 0.5 + this.id) * 0.6;
            break;
          }
          this.wpT -= dt;
          if (this.wp) {
            const wx = this.wp.x - this.pos.x, wz = this.wp.z - this.pos.z, wd = Math.hypot(wx, wz);
            if (wd < 0.4 || this.wpT <= 0) { this.wp = null; this.wpT = rand(1.5, 4); }
            else {
              mvx = (wx / wd) * t.speed * 0.4; mvz = (wz / wd) * t.speed * 0.4;
              speedShown = t.speed * 0.4;
              this.yaw = dampAngle(this.yaw, Math.atan2(wx, wz), 4, dt);
            }
          } else if (this.wpT <= 0) {
            const a = rand(0, TAU), r = rand(1.5, 5);
            this.wp = { x: this.home.x + Math.cos(a) * r, z: this.home.z + Math.sin(a) * r };
            this.wpT = rand(3, 6);
          } else {
            this.yaw += Math.sin(this.time * 0.7 + this.id) * 0.5 * dt; // looks around
          }
        }
        break;
      case 'investigate': {
        if (this._detect(stage, pl, dist, dx, dz, dt)) { this._spot(stage, pl); break; }
        const ix = this.invest.x - this.pos.x, iz = this.invest.z - this.pos.z, id = Math.hypot(ix, iz);
        if (!this.searching) {
          // a zombie pressed against a car or wall gives up walking after a couple of seconds and just searches where it stands
          if (id < this.invBest - 0.4) { this.invBest = id; this.invStall = 0; } else this.invStall += dt;
        }
        if (!this.searching && id > 1.1 && this.invStall < 2.5) {
          mvx = (ix / id) * t.speed * 0.9; mvz = (iz / id) * t.speed * 0.9;
          speedShown = t.speed * 0.9;
          this.yaw = dampAngle(this.yaw, Math.atan2(ix, iz), 6, dt);
        } else {
          if (!this.searching) { this.searching = true; this.searchT = 2.8; }
          this.searchT -= dt;
          this.yaw += Math.sin(this.time * 2.2 + this.id) * 1.1 * dt; // sweeps the area
          if (this.searchT <= 0) {
            this.searching = false;
            this.state = 'idle';
            this.home = { x: this.pos.x, z: this.pos.z };
            this.patrol = null; // once disturbed, a guard/patroller just wanders around where it ended up
            this.still = false;
            this.wp = null;
            this.wpT = rand(1, 3);
          }
        }
        break;
      }
      case 'scream':
        this.timer -= dt;
        p.windup = 1;
        faceRate = 8;
        if (this.timer <= 0) { this.telegraph = false; p.windup = 0; this._scream(stage); this.state = 'chase'; }
        break;
      case 'spitWind':
        this.timer -= dt;
        p.windup = 1;
        faceRate = 10;
        if (this.timer <= 0) {
          this.telegraph = false; p.windup = 0;
          stage.spitAt(this, pl);
          this.spitCd = rand(2.2, 3.4);
          this.state = 'chase';
        }
        break;
      case 'chase': {
        if (this.stealth) {
          // outrun it or hide and it loses interest
          if (pl.hidden || dist > 26) this.loseT += dt;
          else { this.loseT = 0; this.lastSeen = { x: pl.pos.x, z: pl.pos.z }; }
          if (this.loseT > 2.5) {
            this.state = 'investigate';
            this.invest = { x: this.lastSeen.x, z: this.lastSeen.z };
            this.aware = false;
            this.searching = false;
            this.invBest = 1e9; this.invStall = 0;
            this.alert = 0.4;
            this.loseT = 0;
            break;
          }
        }
        // a siege: head for the entrance first, break the barricade, then come for the player
        const sg = this.siegeBar && stage.siegeGoal ? stage.siegeGoal(this, pl, dist) : null;
        if (sg && sg.bash) { this.state = 'bash'; this.bashT = 0.35; this.stuckT = 0; break; }
        let tx = pl.pos.x, tz = pl.pos.z;
        if (sg) { tx = sg.x; tz = sg.z; }
        else if (this.lure && dist > 7) { tx = this.lure.x; tz = this.lure.z; }
        else if (dist > 2.6 && stage.aliveCount() > 1) { tx += Math.cos(this.ringAng) * 1.3; tz += Math.sin(this.ringAng) * 1.3; }
        let ddx = tx - this.pos.x, ddz = tz - this.pos.z;
        const dd = Math.hypot(ddx, ddz) || 1;
        ddx /= dd; ddz /= dd;
        for (const o of stage.enemies) {
          if (o === this || !o.alive) continue;
          const ox = this.pos.x - o.pos.x, oz = this.pos.z - o.pos.z;
          const od = Math.hypot(ox, oz), mind = this.radius + o.radius + 0.2;
          if (od < mind && od > 0.001) { ddx += (ox / od) * 0.9; ddz += (oz / od) * 0.9; }
        }
        if (t.runner && dist > 3.2) {
          const w = Math.sin(this.time * 5 + this.id) * 0.5;
          const px = -ddz, pz = ddx;
          ddx += px * w; ddz += pz * w;
        }
        if (this.detour > 0) {
          this.detour -= dt;
          const px = -ddz * this.detourSide, pz = ddx * this.detourSide;
          ddx += px * 1.3;
          ddz += pz * 1.3;
        }
        const l = Math.hypot(ddx, ddz) || 1;
        let spd = t.speed;
        if (sg) {
          if (sg.hold) spd = 0; // a spitter waiting at the barricade
        } else if (this.type === 'spitter') {
          // keeps its distance and spits acid
          if (dist < 5.5) { ddx = -ddx; ddz = -ddz; spd = t.speed * 0.9; }
          else if (dist < 9) spd = 0;
        }
        mvx = (ddx / l) * spd;
        mvz = (ddz / l) * spd;
        speedShown = spd;
        faceRate = sg && !sg.hold ? 0 : 7;
        const canHit = !pl.dead && !pl.hidden;
        if (dist < t.reach * 0.9 && this.cool <= 0 && canHit) this.setState('windup');
        else if (this.type === 'spitter' && this.spitCd <= 0 && dist > 3 && dist < 11 && canHit && stage.hasLOS(this.pos.x, this.pos.z, pl.pos.x, pl.pos.z, 1.2)) this.setState('spitWind');
        else if (t.pounce && dist > 2.4 && dist < 5.5 && this.pounceCd <= 0 && canHit) this.setState('pounceWind');
        // stuck detection
        this.stuckT += dt;
        if (this.stuckT > 0.35) {
          const moved = Math.hypot(this.pos.x - this.lastX, this.pos.z - this.lastZ);
          if (moved < t.speed * 0.35 * 0.25 && dist > t.reach) { this.detour = 0.9; this.detourSide = Math.random() < 0.5 ? 1 : -1; }
          this.lastX = this.pos.x; this.lastZ = this.pos.z; this.stuckT = 0;
        }
        break;
      }
      case 'bash': {
        // pounding on a barricade: one blow every ~1.2 s (a brute hits much harder)
        const b = this.siegeBar;
        const sg = b && stage.siegeGoal ? stage.siegeGoal(this, pl, dist) : null;
        if (!sg || !sg.bash) { p.atkT = -1; this.state = 'chase'; break; }
        this.bashT -= dt;
        speedShown = 0;
        this.yaw = dampAngle(this.yaw, Math.atan2(b.x - this.pos.x, b.z - this.pos.z), 9, dt);
        const per = t.heavy ? 1.9 : 1.15;
        const ph = per - this.bashT;
        p.atkT = ph >= 0 && ph < 0.36 ? ph / 0.36 : -1;
        if (this.bashT <= 0) { this.bashT = per; stage.bashBarricade(this, b); }
        break;
      }
      case 'windup':
        this.timer -= dt;
        p.windup = 1;
        faceRate = 5;
        if (this.timer <= 0) this.setState('strike');
        break;
      case 'strike': {
        this.timer += dt;
        p.windup = 0;
        p.atkT = Math.min(1, this.timer / 0.32);
        faceRate = 2;
        if (!this.hitDone && p.atkT >= 0.4) { this.hitDone = true; this._strike(stage, pl, dist, dx, dz); }
        if (p.atkT >= 1) { p.atkT = -1; this.cool = rand(0.2, 0.7); this.setState('recover'); }
        break;
      }
      case 'recover':
        this.timer -= dt;
        if (this.timer <= 0) this.state = 'chase';
        break;
      case 'stagger':
        this.timer -= dt;
        p.hurt = 1;
        if (this.timer <= 0) { p.hurt = 0; this.state = 'chase'; }
        break;
      case 'pounceWind':
        this.timer -= dt;
        p.windup = 1; p.crouch = 1;
        faceRate = 10;
        if (this.timer <= 0) {
          p.crouch = 0;
          this.pdx = dx / dist; this.pdz = dz / dist;
          this.setState('pounce');
          G.audio.sfx('whoosh');
        }
        break;
      case 'pounce': {
        this.timer -= dt;
        p.windup = 0;
        mvx = this.pdx * 9.5;
        mvz = this.pdz * 9.5;
        speedShown = 6;
        if (!this.hitDone && dist < t.reach && !pl.hidden) {
          this.hitDone = true;
          const res = pl.takeHit(t.dmg + 4, this.pos.x, this.pos.z, {});
          this._react(res, pl);
        }
        if (this.timer <= 0) { this.pounceCd = rand(3, 5); this.cool = 0.3; this.setState('recover'); this.timer = 0.9; }
        break;
      }
      default: break;
    }

    // integrate
    this.pos.x += (mvx + this.kx) * dt;
    this.pos.z += (mvz + this.kz) * dt;
    pushOutCircle(this.pos, this.radius, stage.colliders, 0);
    // keep out of the player
    const md = this.radius + pl.radius;
    const ddx = this.pos.x - pl.pos.x, ddz = this.pos.z - pl.pos.z;
    const dd = Math.hypot(ddx, ddz);
    if (dd < md && dd > 0.001 && !pl.dead) {
      this.pos.x = pl.pos.x + (ddx / dd) * md;
      this.pos.z = pl.pos.z + (ddz / dd) * md;
    }
    if (stage.bounds) {
      const b = stage.bounds;
      this.pos.x = Math.min(b.maxX, Math.max(b.minX, this.pos.x));
      this.pos.z = Math.min(b.maxZ, Math.max(b.minZ, this.pos.z));
    }
    if (faceRate > 0) {
      let tx = dx, tz = dz;
      if (this.state === 'chase' && this.lure && dist > 7) { tx = this.lure.x - this.pos.x; tz = this.lure.z - this.pos.z; }
      this.yaw = dampAngle(this.yaw, Math.atan2(tx, tz), faceRate, dt);
    } else if (this.state === 'chase' || this.state === 'pounce') {
      this.yaw = dampAngle(this.yaw, Math.atan2(mvx, mvz), 8, dt);
    }
    rig.root.rotation.y = this.yaw;
    p.speed = this.state === 'stagger' ? 0 : speedShown;
    // glowing eyes / veins
    const hot = this.telegraph ? 2.6 + Math.sin(this.time * 40) * 0.8 : 1.15 + Math.sin(this.time * 3 + this.id) * 0.25;
    rig.eyeMat.color.setHex(t.eyes).multiplyScalar(hot);
    rig.veinMat.opacity = this.telegraph ? 1 : 0.7 + Math.sin(this.time * 2 + this.id) * 0.25;
    rig.update(dt);
  }

  _strike(stage, pl, dist, dx, dz) {
    const t = this.t;
    if (pl.hidden) return;
    if (t.heavy) {
      G.fx.ring(this.pos.x, 0, this.pos.z, C.red, t.reach * 2.6, 0.55);
      G.fx.burst(this.pos.x, 0.3, this.pos.z, C.red, 24, 5, 0.6, 4);
      G.audio.sfx('thud');
      shake(0.45, 0.35);
      if (dist < t.reach * 1.6 + 0.4 && pl.pos.y < 0.6) {
        const res = pl.takeHit(t.dmg, this.pos.x, this.pos.z, {});
        this._react(res, pl);
      }
      return;
    }
    const ang = Math.abs(angDiff(this.yaw, Math.atan2(dx, dz)));
    if (dist < t.reach + 0.45 && ang < 1.25) {
      const res = pl.takeHit(t.dmg, this.pos.x, this.pos.z, { grab: this.grabber && !this.grabbedOnce });
      if (res === 'grab') { this.grabbedOnce = true; stage.startGrab(this); }
      else this._react(res, pl);
    }
  }
}
