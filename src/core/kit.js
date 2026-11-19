import * as THREE from 'three';
import { mulberry } from './util.js';

export const C = {
  pink: 0xff2bd6, hot: 0xff3d8b, cyan: 0x00f0ff, blue: 0x2a6bff, violet: 0x9b4dff,
  purple: 0x3a0f6b, navy: 0x070a24, black: 0x03030a, red: 0xff2244, yellow: 0xffe94d,
  green: 0x39ff9a, orange: 0xff8a2b, white: 0xffffff, deep: 0x120a30, steel: 0x1a1d3d
};
export const hex = (n) => '#' + n.toString(16).padStart(6, '0');
const FONT = '"Orbitron","Rajdhani","Noto Sans Devanagari","Nirmala UI","Mangal",sans-serif';

/* ---------- cached geometry & materials ---------- */
const geoCache = new Map();
export function boxGeo(w, h, d) {
  const k = `b${w}_${h}_${d}`;
  let g = geoCache.get(k);
  if (!g) { g = new THREE.BoxGeometry(w, h, d); geoCache.set(k, g); }
  return g;
}
export function cylGeo(rt, rb, h, seg = 10) {
  const k = `c${rt}_${rb}_${h}_${seg}`;
  let g = geoCache.get(k);
  if (!g) { g = new THREE.CylinderGeometry(rt, rb, h, seg); geoCache.set(k, g); }
  return g;
}
export function sphereGeo(r, ws = 10, hs = 8) {
  const k = `s${r}_${ws}_${hs}`;
  let g = geoCache.get(k);
  if (!g) { g = new THREE.SphereGeometry(r, ws, hs); geoCache.set(k, g); }
  return g;
}
const edgeCache = new Map();
export function edgesGeo(geo) {
  let e = edgeCache.get(geo.uuid);
  if (!e) { e = new THREE.EdgesGeometry(geo, 30); edgeCache.set(geo.uuid, e); }
  return e;
}

const matCache = new Map();
export function basic(color, o = {}) {
  const k = `b${color}_${o.opacity ?? 1}_${o.add ? 1 : 0}_${o.side || 0}_${o.fog === false ? 0 : 1}`;
  let m = matCache.get(k);
  if (!m) {
    m = new THREE.MeshBasicMaterial({
      color,
      transparent: (o.opacity ?? 1) < 1 || !!o.add,
      opacity: o.opacity ?? 1,
      blending: o.add ? THREE.AdditiveBlending : THREE.NormalBlending,
      depthWrite: !o.add && (o.opacity ?? 1) >= 1,
      side: o.side || THREE.FrontSide,
      fog: o.fog !== false
    });
    matCache.set(k, m);
  }
  return m;
}
export function lambert(color, emissive = 0x000000, emissiveIntensity = 1) {
  const k = `l${color}_${emissive}_${emissiveIntensity}`;
  let m = matCache.get(k);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color, emissive, emissiveIntensity });
    matCache.set(k, m);
  }
  return m;
}
export function lineMat(color, opacity = 1) {
  const k = `ln${color}_${opacity}`;
  let m = matCache.get(k);
  if (!m) {
    m = new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity });
    matCache.set(k, m);
  }
  return m;
}

export function addEdges(mesh, color = C.cyan, opacity = 1) {
  const e = new THREE.LineSegments(edgesGeo(mesh.geometry), lineMat(color, opacity));
  mesh.add(e);
  return e;
}
/** Box with lambert body and optional glow outline. */
export function nbox(w, h, d, color, edge = null, emissive = 0x000000) {
  const m = new THREE.Mesh(boxGeo(w, h, d), lambert(color, emissive));
  if (edge !== null) addEdges(m, edge);
  return m;
}
/** Emissive (unlit) box - for LED strips / lights. */
export function led(w, h, d, color, opacity = 1) {
  return new THREE.Mesh(boxGeo(w, h, d), basic(color, { opacity }));
}

/* ---------- canvas helpers ---------- */
export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
function toTex(c, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

let glowTex = null;
function getGlowTex() {
  if (glowTex) return glowTex;
  const c = makeCanvas(64, 64);
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  glowTex = toTex(c);
  return glowTex;
}
const glowMats = new Map();
export function glow(color, size = 2, opacity = 1) {
  const k = `${color}_${opacity}`;
  let m = glowMats.get(k);
  if (!m) {
    m = new THREE.SpriteMaterial({
      map: getGlowTex(), color, transparent: true, opacity,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    glowMats.set(k, m);
  }
  const s = new THREE.Sprite(m);
  s.scale.set(size, size, 1);
  return s;
}

export function textTexture(text, o = {}) {
  const w = o.w || 512, h = o.h || 128;
  const col = o.color || '#00f0ff';
  const c = makeCanvas(w, h);
  const g = c.getContext('2d');
  g.clearRect(0, 0, w, h);
  if (o.bg) {
    g.fillStyle = o.bg;
    g.fillRect(4, 4, w - 8, h - 8);
  }
  if (o.border) {
    g.strokeStyle = o.border;
    g.lineWidth = 6;
    g.shadowColor = o.border;
    g.shadowBlur = 14;
    g.strokeRect(6, 6, w - 12, h - 12);
    g.shadowBlur = 0;
  }
  let size = o.size || h * 0.55;
  g.font = `700 ${size}px ${FONT}`;
  const tw = g.measureText(text).width;
  if (tw > w * 0.88) { size = size * (w * 0.88) / tw; g.font = `700 ${size}px ${FONT}`; }
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = col;
  g.shadowBlur = 22;
  g.fillStyle = col;
  g.fillText(text, w / 2, h / 2 + 2);
  g.shadowBlur = 8;
  g.fillText(text, w / 2, h / 2 + 2);
  g.shadowBlur = 0;
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.fillText(text, w / 2, h / 2 + 2);
  return toTex(c);
}

/** A glowing sign plane. Returns mesh (userData.mat for flicker control). */
export function glowSign(text, color = C.pink, width = 4, o = {}) {
  const w = 512, h = o.h || 128;
  const t = textTexture(text, { w, h, color: hex(color), border: o.border === false ? null : hex(color), bg: 'rgba(5,0,20,0.55)' });
  const mat = new THREE.MeshBasicMaterial({
    map: t, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending, opacity: 1
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(width, width * h / w), mat);
  m.userData.mat = mat;
  return m;
}

export function windowTexture(cols, rows, seed, tint = 0) {
  const cw = 16, ch = 18;
  const c = makeCanvas(cols * cw, rows * ch);
  const g = c.getContext('2d');
  const rng = mulberry(seed);
  const gr = g.createLinearGradient(0, 0, 0, c.height);
  gr.addColorStop(0, tint ? '#240a4e' : '#1b0b45');
  gr.addColorStop(1, '#070824');
  g.fillStyle = gr;
  g.fillRect(0, 0, c.width, c.height);
  const pal = ['#00f0ff', '#ff2bd6', '#a86bff', '#ffd27a', '#4a7dff', '#00f0ff', '#ff3d8b'];
  const accent = pal[Math.floor(rng() * pal.length)];
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const x = col * cw, y = r * ch;
      const roll = rng();
      if (roll < 0.52) {
        g.globalAlpha = 0.55 + rng() * 0.45;
        g.fillStyle = rng() < 0.6 ? accent : pal[Math.floor(rng() * pal.length)];
        g.fillRect(x + 3, y + 4, cw - 6, ch - 8);
      } else {
        g.globalAlpha = 1;
        g.fillStyle = 'rgba(30,30,90,0.9)';
        g.fillRect(x + 3, y + 4, cw - 6, ch - 8);
      }
    }
    g.globalAlpha = 0.5;
    g.fillStyle = accent;
    g.fillRect(0, r * ch + ch - 1, c.width, 1);
  }
  g.globalAlpha = 1;
  const t = toTex(c);
  t.magFilter = THREE.NearestFilter;
  return t;
}

export function roadTexture() {
  const W = 512, H = 448; // 16 m x 14 m
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  g.fillStyle = '#06061a';
  g.fillRect(0, 0, W, H);
  const rng = mulberry(7);
  for (let i = 0; i < 1400; i++) {
    g.fillStyle = `rgba(${40 + rng() * 40},${30 + rng() * 40},${80 + rng() * 60},${0.05 + rng() * 0.1})`;
    g.fillRect(rng() * W, rng() * H, 2 + rng() * 5, 2 + rng() * 5);
  }
  // puddles
  for (let i = 0; i < 9; i++) {
    const x = rng() * W, y = rng() * H, rx = 30 + rng() * 60, ry = 10 + rng() * 22;
    const gr = g.createRadialGradient(x, y, 0, x, y, rx);
    gr.addColorStop(0, 'rgba(80,60,200,0.35)');
    gr.addColorStop(1, 'rgba(80,60,200,0)');
    g.save(); g.translate(x, y); g.scale(1, ry / rx); g.translate(-x, -y);
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, rx, 0, Math.PI * 2); g.fill(); g.restore();
  }
  const mid = H / 2;
  const line = (y, color, thick, dash) => {
    g.strokeStyle = color; g.lineWidth = thick; g.shadowColor = color; g.shadowBlur = 10;
    g.setLineDash(dash || []);
    g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
  };
  line(mid - 5, '#ff2bd6', 4); line(mid + 5, '#ff2bd6', 4);
  line(mid - 112, '#1fd0ff', 3, [64, 64]); line(mid + 112, '#1fd0ff', 3, [64, 64]);
  g.setLineDash([]);
  line(6, '#2a6bff', 5); line(H - 6, '#2a6bff', 5);
  g.shadowBlur = 0;
  const t = toTex(c);
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

export function sidewalkTexture() {
  const c = makeCanvas(256, 256);
  const g = c.getContext('2d');
  g.fillStyle = '#12102e';
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(0,240,255,0.55)';
  g.lineWidth = 2;
  for (let i = 0; i <= 256; i += 64) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.stroke();
    g.beginPath(); g.moveTo(0, i); g.lineTo(256, i); g.stroke();
  }
  const rng = mulberry(3);
  for (let i = 0; i < 200; i++) {
    g.fillStyle = `rgba(120,90,255,${0.03 + rng() * 0.06})`;
    g.fillRect(rng() * 256, rng() * 256, 6, 6);
  }
  const t = toTex(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function stripeTexture(a = '#e8f6ff', b = 'rgba(0,0,0,0)', n = 6) {
  const c = makeCanvas(256, 256);
  const g = c.getContext('2d');
  g.fillStyle = b === 'rgba(0,0,0,0)' ? '#06061a' : b;
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = a;
  g.shadowColor = '#00f0ff';
  g.shadowBlur = 12;
  const sw = 256 / (n * 2);
  for (let i = 0; i < n; i++) g.fillRect(i * sw * 2 + sw * 0.25, 8, sw * 1.5, 240);
  return toTex(c);
}

export function gridTexture(color = '#ff2bd6', bg = '#0a0420', cells = 8) {
  const c = makeCanvas(256, 256);
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = color; g.lineWidth = 3; g.shadowColor = color; g.shadowBlur = 8;
  const s = 256 / cells;
  for (let i = 0; i <= cells; i++) {
    g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s, 256); g.stroke();
    g.beginPath(); g.moveTo(0, i * s); g.lineTo(256, i * s); g.stroke();
  }
  const t = toTex(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Equirect synthwave sky. +X horizon carries the striped sun. */
export function skyTexture() {
  const W = 1024, H = 512;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0.0, '#010008');
  gr.addColorStop(0.28, '#0b0430');
  gr.addColorStop(0.42, '#4b1180');
  gr.addColorStop(0.48, '#d1209f');
  gr.addColorStop(0.5, '#ff5cb1');
  gr.addColorStop(0.52, '#2a0a55');
  gr.addColorStop(0.62, '#0a0420');
  gr.addColorStop(1.0, '#02010a');
  g.fillStyle = gr;
  g.fillRect(0, 0, W, H);
  const rng = mulberry(11);
  for (let i = 0; i < 520; i++) {
    const y = rng() * H * 0.42;
    g.fillStyle = `rgba(255,255,255,${0.2 + rng() * 0.7})`;
    const s = rng() < 0.1 ? 2 : 1;
    g.fillRect(rng() * W, y, s, s);
  }
  // soft cloud bands
  for (let i = 0; i < 14; i++) {
    const y = H * (0.3 + rng() * 0.17);
    const gx = g.createLinearGradient(0, y - 8, 0, y + 8);
    const col = rng() < 0.5 ? '255,43,214' : '0,240,255';
    gx.addColorStop(0, `rgba(${col},0)`);
    gx.addColorStop(0.5, `rgba(${col},${0.05 + rng() * 0.08})`);
    gx.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = gx;
    g.fillRect(rng() * W * 0.5, y - 8, W * (0.3 + rng() * 0.6), 16);
  }
  // sun at +X (u = 0.5)
  const sx = W / 2, sy = H * 0.46, sr = 46;
  const halo = g.createRadialGradient(sx, sy, sr * 0.6, sx, sy, sr * 3.2);
  halo.addColorStop(0, 'rgba(255,60,160,0.55)');
  halo.addColorStop(1, 'rgba(255,60,160,0)');
  g.fillStyle = halo;
  g.fillRect(sx - sr * 4, sy - sr * 4, sr * 8, sr * 8);
  const sg = g.createLinearGradient(0, sy - sr, 0, sy + sr);
  sg.addColorStop(0, '#fff06a');
  sg.addColorStop(0.5, '#ff4fa3');
  sg.addColorStop(1, '#8a1fff');
  g.fillStyle = sg;
  g.beginPath(); g.arc(sx, sy, sr, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#2a0a55';
  for (let i = 0; i < 6; i++) {
    const yy = sy + 6 + i * 7;
    g.fillRect(sx - sr, yy, sr * 2, 1 + i * 0.7);
  }
  // moon at -X
  g.fillStyle = 'rgba(190,230,255,0.9)';
  g.beginPath(); g.arc(W * 0.0 + 60, H * 0.3, 14, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(W - 40, H * 0.3, 14, 0, Math.PI * 2); g.fill();
  const t = toTex(c);
  t.mapping = THREE.EquirectangularReflectionMapping;
  return t;
}

/** Holographic panel with scanlines and text lines. */
export function holoPanel(lines, color = C.cyan, w = 3, h = 2) {
  const W = 384, H = Math.round(384 * h / w);
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  const col = hex(color);
  g.fillStyle = 'rgba(0,20,40,0.45)';
  g.fillRect(0, 0, W, H);
  g.strokeStyle = col; g.lineWidth = 4; g.shadowColor = col; g.shadowBlur = 12;
  g.strokeRect(4, 4, W - 8, H - 8);
  g.shadowBlur = 8; g.fillStyle = col; g.textAlign = 'center'; g.textBaseline = 'middle';
  const n = lines.length;
  lines.forEach((ln, i) => {
    const size = i === 0 ? H * 0.22 : H * 0.13;
    g.font = `700 ${size}px ${FONT}`;
    let s = size;
    const tw = g.measureText(ln).width;
    if (tw > W * 0.9) { s = size * (W * 0.9) / tw; g.font = `700 ${s}px ${FONT}`; }
    g.fillText(ln, W / 2, H * ((i + 1) / (n + 1)));
  });
  g.shadowBlur = 0;
  g.fillStyle = 'rgba(255,255,255,0.07)';
  for (let y = 0; y < H; y += 4) g.fillRect(0, y, W, 1);
  const t = toTex(c);
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })
  );
  m.userData.mat = m.material;
  m.userData.canvas = c;
  m.userData.tex = t;
  return m;
}

let streakTex = null;
/** Vertical light streak (fake wet-road reflection). Plane lies flat, long axis along local Z. */
export function streak(color, w = 1, l = 6, opacity = 0.5) {
  if (!streakTex) {
    const c = makeCanvas(32, 128);
    const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 128);
    gr.addColorStop(0, 'rgba(255,255,255,0.9)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 32, 128);
    const gx = g.createLinearGradient(0, 0, 32, 0);
    gx.addColorStop(0, 'rgba(0,0,0,1)'); gx.addColorStop(0.5, 'rgba(0,0,0,0)'); gx.addColorStop(1, 'rgba(0,0,0,1)');
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = gx; g.fillRect(0, 0, 32, 128);
    streakTex = toTex(c);
  }
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, l),
    new THREE.MeshBasicMaterial({
      map: streakTex, color, transparent: true, opacity, depthWrite: false,
      blending: THREE.AdditiveBlending
    })
  );
  m.rotation.x = -Math.PI / 2;
  return m;
}

export function beam(color = C.yellow, h = 14, r = 0.5) {
  const m = new THREE.Mesh(
    new THREE.CylinderGeometry(r, r, h, 14, 1, true),
    new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.22, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide
    })
  );
  m.position.y = h / 2;
  return m;
}

export function setFlicker(mat, t, level) {
  // level 0..1 : how unstable the light is
  if (mat.userData.base === undefined) mat.userData.base = mat.opacity;
  const b = mat.userData.base;
  if (level <= 0.01) { mat.opacity = b; return; }
  const n = Math.sin(t * 37.1 + mat.id * 7.3) * Math.sin(t * 11.7 + mat.id);
  mat.opacity = n > 1 - level * 1.15 ? b * 0.12 : b;
}
