import { G } from './state.js';

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
export const rand = (a, b) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const smooth = (t) => t * t * (3 - 2 * t);
export const easeOut = (t) => 1 - Math.pow(1 - t, 3);

export function angDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}
export const dampAngle = (a, b, k, dt) => a + angDiff(a, b) * (1 - Math.exp(-k * dt));

export function mulberry(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const pick = (arr, rng = Math.random) => arr[Math.floor(rng() * arr.length)];

export function $(id) {
  return document.getElementById(id);
}

export function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

/** Circle (cx,cz,r) vs list of AABB colliders; pushes the circle out. Returns true if it moved. */
export function pushOutCircle(p, r, colliders, y = 0, skip = null) {
  let moved = false;
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (c === skip || c.off) continue;
    if (y > c.h - 0.08) continue;
    const nx = clamp(p.x, c.minX, c.maxX);
    const nz = clamp(p.z, c.minZ, c.maxZ);
    let dx = p.x - nx;
    let dz = p.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    if (d2 > 1e-8) {
      const d = Math.sqrt(d2);
      p.x = nx + (dx / d) * r;
      p.z = nz + (dz / d) * r;
    } else {
      // centre is inside the box: leave through the closest face
      const l = p.x - c.minX, rr = c.maxX - p.x, t = p.z - c.minZ, b = c.maxZ - p.z;
      const m = Math.min(l, rr, t, b);
      if (m === l) p.x = c.minX - r;
      else if (m === rr) p.x = c.maxX + r;
      else if (m === t) p.z = c.minZ - r;
      else p.z = c.maxZ + r;
    }
    moved = true;
  }
  return moved;
}

export function vibrate(ms) {
  try {
    if (G.settings && !G.settings.haptics) return;
    if (navigator.vibrate) navigator.vibrate(ms);
  } catch (e) { /* ignore */ }
}
