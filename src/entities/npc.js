import { Rig } from './rig.js';
import { C } from '../core/kit.js';
import { dampAngle, pick, rand } from '../core/util.js';

const SKINS = [0xd09470, 0xb87858, 0x9a6444, 0x7a4a34, 0xe0aa84, 0x8a5a3c];
const SHIRTS = [0x2a1a5e, 0x4a1052, 0x0f3a5c, 0x5c1030, 0x1c3a3a, 0x3a2a10, 0x24244a, 0x502a60];
const PANTS = [0x101030, 0x1a1a3a, 0x0c2236, 0x2a1030];
const ACCENTS = [C.cyan, C.pink, C.violet, C.yellow, C.green, C.orange];

export class NPC {
  constructor(o = {}) {
    this.rig = new Rig({
      skin: o.skin ?? pick(SKINS),
      shirt: o.shirt ?? pick(SHIRTS),
      pants: o.pants ?? pick(PANTS),
      accent: o.accent ?? pick(ACCENTS),
      hair: o.hair ?? pick([0x0b0820, 0x1a1030, 0x2a1a10, 0x101010, 0x44445a]),
      scale: o.scale ?? rand(0.95, 1.08),
      width: o.width ?? 1,
      hood: !!o.hood,
      outline: o.outline ?? null,
      headphones: !!o.headphones,
      backpack: !!o.backpack
    });
    if (o.backpack === false) this.rig.setPack(false);
    this.pos = this.rig.root.position;
    this.pos.set(o.x ?? 0, o.y ?? 0, o.z ?? 0);
    this.mode = o.mode || 'walk';
    this.name = o.name || '';
    this.lines = o.lines || null;
    this.lineIdx = 0;
    this.route = o.route || null; // {x0,x1}
    this.dir = o.dir || 1;
    this.speed = o.speed ?? rand(0.9, 1.5);
    this.yaw = o.yaw ?? (this.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    this.t = rand(0, 10);
    this.talkable = !!o.lines;
    this.radius = 0.35;
    this.chatT = 0;
    this.home = { x: this.pos.x, z: this.pos.z };
    this.rig.root.rotation.y = this.yaw;
    this.rig.p.seated = this.mode === 'seated' ? 1 : 0;
    this.rig.s.seated = this.rig.p.seated;
    this.rig.p.phone = this.mode === 'phone' ? 1 : 0;
    this.onTalk = o.onTalk || null;
    this.sway = o.sway ?? 0;
    this.seatY = 0;
  }

  nextLine() {
    if (!this.lines) return null;
    const l = this.lines[this.lineIdx % this.lines.length];
    this.lineIdx++;
    return l;
  }

  setMode(m, opts = {}) {
    this.mode = m;
    if (m === 'flee') { this.speed = opts.speed ?? 5.2; if (opts.dir) this.dir = opts.dir; }
    if (m === 'stagger') {
      this.speed = opts.speed ?? 0.65;
      this.home = { x: this.pos.x, z: this.pos.z };
    }
    if (m === 'collapse') { this.rig.p.lie = 1; this.rig.p.speed = 0; }
  }

  update(dt, player, time) {
    const p = this.rig.p;
    this.t += dt;
    const dx = player ? player.pos.x - this.pos.x : 99;
    const dz = player ? player.pos.z - this.pos.z : 99;
    const dist = Math.hypot(dx, dz);
    let speed = 0;
    switch (this.mode) {
      case 'walk': {
        if (this.talkable && dist < 3.2) {
          this.yaw = dampAngle(this.yaw, Math.atan2(dx, dz), 6, dt);
          p.wave = dist < 2.2 ? 0 : 0;
          break;
        }
        speed = this.speed;
        if (this.route) {
          if (this.pos.x > this.route.x1) this.dir = -1;
          else if (this.pos.x < this.route.x0) this.dir = 1;
        }
        this.pos.x += this.dir * speed * dt;
        this.pos.z += Math.sin(this.t * 0.7) * 0.15 * dt;
        this.yaw = dampAngle(this.yaw, this.dir > 0 ? Math.PI / 2 : -Math.PI / 2, 8, dt);
        break;
      }
      case 'idle':
      case 'phone':
        if (dist < 4 && this.mode === 'idle') this.yaw = dampAngle(this.yaw, Math.atan2(dx, dz), 4, dt);
        p.hurt = 0;
        break;
      case 'seated':
        p.seated = 1;
        if (this.sway) this.rig.body.rotation.z = Math.sin(this.t * 1.7) * this.sway;
        break;
      case 'stagger': {
        speed = this.speed;
        this.yaw += Math.sin(this.t * 1.3) * dt * 1.2;
        this.pos.x += Math.sin(this.yaw) * speed * dt;
        this.pos.z += Math.cos(this.yaw) * speed * dt;
        // a staggering NPC must not wander off the pavement into the road
        this.pos.z = Math.max(this.home.z - 1.2, Math.min(this.home.z + 1.2, this.pos.z));
        if (this.route) {
          if (this.pos.x > this.route.x1) this.yaw = -Math.PI / 2;
          if (this.pos.x < this.route.x0) this.yaw = Math.PI / 2;
        }
        p.hurt = 0.55 + Math.sin(this.t * 2) * 0.2;
        this.rig.root.rotation.z = Math.sin(this.t * 2.4) * 0.12;
        break;
      }
      case 'flee':
        speed = this.speed;
        this.pos.x += this.dir * speed * dt;
        this.yaw = dampAngle(this.yaw, this.dir > 0 ? Math.PI / 2 : -Math.PI / 2, 10, dt);
        p.wave = 0.7;
        break;
      case 'collapse':
        p.lie = 1;
        break;
      default: break;
    }
    // gently avoid the player
    if (player && dist < 0.9 && this.mode !== 'seated' && this.mode !== 'collapse') {
      const k = (0.9 - dist) * 2;
      this.pos.x -= (dx / (dist || 1)) * k * dt;
      this.pos.z -= (dz / (dist || 1)) * k * dt;
    }
    p.speed = speed;
    this.rig.root.rotation.y = this.yaw;
    this.rig.update(dt);
  }
}
