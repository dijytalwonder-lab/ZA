import * as THREE from 'three';
import { $, rand } from './util.js';
import { G } from './state.js';

const MAX = 700;
const RINGS = 10;
const MOTES = 160;
const _c = new THREE.Color();
const _v = new THREE.Vector3();

export class FX {
  constructor() {
    this.group = new THREE.Group();
    this.scene = null;
    // spark particles
    const pos = new Float32Array(MAX * 3);
    const col = new Float32Array(MAX * 3);
    for (let i = 0; i < MAX; i++) pos[i * 3 + 1] = -999;
    this.pos = pos;
    this.col = col;
    this.base = new Float32Array(MAX * 3);
    this.vel = new Float32Array(MAX * 3);
    this.life = new Float32Array(MAX);
    this.maxLife = new Float32Array(MAX).fill(1);
    this.grav = new Float32Array(MAX);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.points = new THREE.Points(g, new THREE.PointsMaterial({
      size: 0.16, vertexColors: true, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, sizeAttenuation: true
    }));
    this.points.frustumCulled = false;
    this.group.add(this.points);
    this.head = 0;
    // rings
    this.rings = [];
    const rg = new THREE.RingGeometry(0.86, 1, 40);
    rg.rotateX(-Math.PI / 2);
    for (let i = 0; i < RINGS; i++) {
      const m = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0, depthWrite: false,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide
      }));
      m.visible = false;
      m.userData = { t: 0, dur: 1, max: 1 };
      this.group.add(m);
      this.rings.push(m);
    }
    this.ringHead = 0;
    // ambient motes
    const mp = new Float32Array(MOTES * 3);
    const mc = new Float32Array(MOTES * 3);
    this.moteSeed = new Float32Array(MOTES * 4);
    const pal = [0x00f0ff, 0xff2bd6, 0x9b4dff, 0x2a6bff];
    for (let i = 0; i < MOTES; i++) {
      this.moteSeed[i * 4] = Math.random();
      this.moteSeed[i * 4 + 1] = Math.random();
      this.moteSeed[i * 4 + 2] = Math.random();
      this.moteSeed[i * 4 + 3] = 0.2 + Math.random() * 0.6;
      _c.setHex(pal[i % pal.length]);
      mc[i * 3] = _c.r; mc[i * 3 + 1] = _c.g; mc[i * 3 + 2] = _c.b;
    }
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.BufferAttribute(mp, 3));
    mg.setAttribute('color', new THREE.BufferAttribute(mc, 3));
    this.motes = new THREE.Points(mg, new THREE.PointsMaterial({
      size: 0.1, vertexColors: true, transparent: true, opacity: 0.8, depthWrite: false,
      blending: THREE.AdditiveBlending, sizeAttenuation: true
    }));
    this.motes.frustumCulled = false;
    this.group.add(this.motes);
    this.moteBox = new THREE.Vector3(40, 12, 40);
    this.moteOn = true;
    this.mp = mp;
    // floating DOM text
    this.layer = $('fxlayer');
    this.texts = [];
  }

  attach(scene) {
    this.detach();
    this.scene = scene;
    scene.add(this.group);
  }
  detach() {
    if (this.scene) this.scene.remove(this.group);
    this.scene = null;
    this.clear();
  }
  clear() {
    for (let i = 0; i < MAX; i++) { this.life[i] = 0; this.pos[i * 3 + 1] = -999; }
    this.rings.forEach((r) => { r.visible = false; });
    this.texts.forEach((t) => t.el.remove());
    this.texts.length = 0;
  }
  setMotes(on, box) {
    this.moteOn = on;
    this.motes.visible = on;
    if (box) this.moteBox.copy(box);
  }

  burst(x, y, z, color, n = 14, speed = 3.5, life = 0.7, gravity = 6) {
    _c.setHex(color);
    for (let k = 0; k < n; k++) {
      const i = this.head;
      this.head = (this.head + 1) % MAX;
      const a = Math.random() * Math.PI * 2;
      const e = Math.random() * 1.2 - 0.2;
      const s = speed * (0.35 + Math.random() * 0.65);
      this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
      this.vel[i * 3] = Math.cos(a) * s;
      this.vel[i * 3 + 1] = e * s + speed * 0.3;
      this.vel[i * 3 + 2] = Math.sin(a) * s;
      this.life[i] = this.maxLife[i] = life * (0.6 + Math.random() * 0.6);
      this.grav[i] = gravity;
      this.base[i * 3] = _c.r; this.base[i * 3 + 1] = _c.g; this.base[i * 3 + 2] = _c.b;
    }
  }
  ring(x, y, z, color, maxR = 2, dur = 0.5) {
    const r = this.rings[this.ringHead];
    this.ringHead = (this.ringHead + 1) % RINGS;
    r.position.set(x, y + 0.05, z);
    r.material.color.setHex(color);
    r.userData.t = 0;
    r.userData.dur = dur;
    r.userData.max = maxR;
    r.visible = true;
    r.scale.setScalar(0.1);
  }
  text(pos, str, cls = '') {
    if (!this.layer) return;
    const el = document.createElement('div');
    el.className = 'ftext ' + cls;
    el.textContent = str;
    this.layer.appendChild(el);
    this.texts.push({ el, p: pos.clone(), t: 0 });
    if (this.texts.length > 14) this.texts.shift().el.remove();
  }

  update(dt, camera, center) {
    // sparks
    for (let i = 0; i < MAX; i++) {
      const l = this.life[i];
      if (l <= 0) continue;
      const nl = l - dt;
      const j = i * 3;
      if (nl <= 0) {
        this.life[i] = 0;
        this.pos[j + 1] = -999;
        this.col[j] = this.col[j + 1] = this.col[j + 2] = 0;
        continue;
      }
      this.life[i] = nl;
      this.vel[j + 1] -= this.grav[i] * dt;
      this.pos[j] += this.vel[j] * dt;
      this.pos[j + 1] += this.vel[j + 1] * dt;
      this.pos[j + 2] += this.vel[j + 2] * dt;
      if (this.pos[j + 1] < 0.02) { this.pos[j + 1] = 0.02; this.vel[j + 1] *= -0.35; this.vel[j] *= 0.7; this.vel[j + 2] *= 0.7; }
      const f = nl / this.maxLife[i];
      this.col[j] = this.base[j] * f; this.col[j + 1] = this.base[j + 1] * f; this.col[j + 2] = this.base[j + 2] * f;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
    // rings
    for (const r of this.rings) {
      if (!r.visible) continue;
      const u = r.userData;
      u.t += dt;
      const k = u.t / u.dur;
      if (k >= 1) { r.visible = false; continue; }
      r.scale.setScalar(0.1 + (u.max - 0.1) * (1 - Math.pow(1 - k, 2)));
      r.material.opacity = 0.9 * (1 - k);
    }
    // motes
    if (this.moteOn && center) {
      const b = this.moteBox;
      const t = performance.now() * 0.0001;
      for (let i = 0; i < MOTES; i++) {
        const s = this.moteSeed;
        const rx = ((s[i * 4] * b.x + Math.sin(t * 3 + i) * 1.5 - center.x) % b.x + b.x * 1.5) % b.x - b.x / 2;
        const ry = ((s[i * 4 + 1] * b.y + t * 6 * s[i * 4 + 3]) % b.y + b.y) % b.y;
        const rz = ((s[i * 4 + 2] * b.z + Math.cos(t * 3 + i) * 1.5 - center.z) % b.z + b.z * 1.5) % b.z - b.z / 2;
        this.mp[i * 3] = center.x + rx;
        this.mp[i * 3 + 1] = ry;
        this.mp[i * 3 + 2] = center.z + rz;
      }
      this.motes.geometry.attributes.position.needsUpdate = true;
    }
    // floating DOM text
    if (this.texts.length && camera) {
      const w = window.innerWidth, h = window.innerHeight;
      for (let i = this.texts.length - 1; i >= 0; i--) {
        const t = this.texts[i];
        t.t += dt;
        if (t.t > 0.95) { t.el.remove(); this.texts.splice(i, 1); continue; }
        _v.copy(t.p);
        _v.y += t.t * 1.0;
        _v.project(camera);
        const vis = _v.z < 1;
        t.el.style.opacity = vis ? String(1 - t.t / 0.95) : '0';
        t.el.style.transform = `translate(${(_v.x * 0.5 + 0.5) * w}px, ${(-_v.y * 0.5 + 0.5) * h}px) translate(-50%,-50%)`;
      }
    }
  }
}

export function shake(a = 0.2, d = 0.3) {
  if (G.camRig) G.camRig.shake(a, d);
}
export const jitter = (a) => rand(-a, a);
