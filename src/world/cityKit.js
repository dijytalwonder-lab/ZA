import * as THREE from 'three';
import {
  C, hex, boxGeo, cylGeo, sphereGeo, basic, lambert, addEdges, nbox, led, glow,
  glowSign, windowTexture, roadTexture, sidewalkTexture, gridTexture, streak, holoPanel, makeCanvas
} from '../core/kit.js';
import { mulberry, pick } from '../core/util.js';

export const SIGN_TEXT = [
  'RAMEN', 'चाय', 'NOODLE', 'ARCADE', 'मोबाइल', 'PHARMA', 'CYBER', 'HOTEL', 'SWEETS',
  'मिठाई', 'BAR', 'TECH HUB', 'दुकान', 'SUSHI', 'CAFE 24', 'CITY MART', 'CLINIC', 'BOOKS'
];
const GLOWS = [C.pink, C.cyan, C.violet, C.yellow, C.green, C.hot, C.blue];

export function addLights(st, o = {}) {
  // three r155+ uses physical light units: scale by PI to match the old "legacy" brightness
  const hemi = new THREE.HemisphereLight(o.sky ?? 0x7a6cff, o.ground ?? 0x1a0a3a, (o.hemi ?? 1.0) * Math.PI);
  st.scene.add(hemi);
  const dir = new THREE.DirectionalLight(o.dirColor ?? 0xa0b4ff, (o.dir ?? 0.55) * Math.PI);
  dir.position.set(...(o.dirPos || [-30, 50, 20]));
  st.scene.add(dir);
  return { hemi, dir };
}

/* ---------------- ground ---------------- */
export function addGround(st, x0, x1, o = {}) {
  const len = x1 - x0, cx = (x0 + x1) / 2;
  const rt = roadTexture();
  rt.repeat.set(len / 16, 1);
  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(len, 14),
    new THREE.MeshStandardMaterial({ map: rt, roughness: 0.28, metalness: 0.55, envMapIntensity: 1.5 })
  );
  road.rotation.x = -Math.PI / 2;
  road.position.set(cx, 0.01, 0);
  st.scene.add(road);
  for (const side of [-1, 1]) {
    const tex = sidewalkTexture();
    tex.repeat.set(len / 4, 7 / 4);
    const sw = new THREE.Mesh(new THREE.PlaneGeometry(len, 7), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45, metalness: 0.35, envMapIntensity: 0.9 }));
    sw.rotation.x = -Math.PI / 2;
    sw.position.set(cx, 0.02, side * 10.5);
    st.scene.add(sw);
    const curb = led(len, 0.07, 0.12, side < 0 ? C.cyan : C.pink);
    curb.position.set(cx, 0.06, side * 7.05);
    st.scene.add(curb);
    const base = led(len, 0.06, 0.1, side < 0 ? C.pink : C.cyan, 0.7);
    base.position.set(cx, 0.05, side * 13.95);
    st.scene.add(base);
  }
  const gt = gridTexture('#ff2bd6', '#07031a', 8);
  gt.repeat.set(220, 220);
  const far = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), new THREE.MeshBasicMaterial({ map: gt }));
  far.rotation.x = -Math.PI / 2;
  far.position.set(cx, -0.08, 0);
  st.scene.add(far);
  if (o.plaza) {
    const p = o.plaza;
    const tex = sidewalkTexture();
    tex.repeat.set((p.x1 - p.x0) / 4, (p.z1 - p.z0) / 4);
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(p.x1 - p.x0, p.z1 - p.z0), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4, metalness: 0.4, envMapIntensity: 1 }));
    pl.rotation.x = -Math.PI / 2;
    pl.position.set((p.x0 + p.x1) / 2, 0.025, (p.z0 + p.z1) / 2);
    st.scene.add(pl);
  }
}

/* ---------------- buildings ---------------- */
const shopTexCache = new Map();
function shopTex(color) {
  let t = shopTexCache.get(color);
  if (t) return t;
  const c = makeCanvas(128, 96);
  const g = c.getContext('2d');
  const col = hex(color);
  const gr = g.createLinearGradient(0, 0, 0, 96);
  gr.addColorStop(0, col + 'cc');
  gr.addColorStop(1, col + '22');
  g.fillStyle = '#05020f';
  g.fillRect(0, 0, 128, 96);
  g.fillStyle = gr;
  g.fillRect(6, 6, 116, 84);
  g.fillStyle = 'rgba(0,0,0,0.55)';
  for (let i = 0; i < 4; i++) g.fillRect(14 + i * 28, 30, 18, 52);
  g.strokeStyle = col; g.lineWidth = 4; g.shadowColor = col; g.shadowBlur = 8;
  g.strokeRect(5, 5, 118, 86);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  shopTexCache.set(color, t);
  return t;
}

export function makeBuilding(st, cx, side, w, h, d, rng, o = {}) {
  const zFace = 14 * side;
  const cz = zFace + side * d / 2;
  const g = new THREE.Group();
  g.position.set(cx, 0, cz);
  g.userData.x = cx;
  const seed = Math.floor(rng() * 1e6);
  const tF = windowTexture(Math.max(2, Math.round(w / 3)), Math.max(3, Math.round(h / 3.2)), seed);
  const tS = windowTexture(Math.max(2, Math.round(d / 3)), Math.max(3, Math.round(h / 3.2)), seed + 1, 1);
  const dark = basic(0x0a0722);
  const mats = [
    new THREE.MeshBasicMaterial({ map: tS }), new THREE.MeshBasicMaterial({ map: tS }),
    dark, dark,
    new THREE.MeshBasicMaterial({ map: tF }), new THREE.MeshBasicMaterial({ map: tF })
  ];
  const body = new THREE.Mesh(boxGeo(w, h, d), mats);
  body.position.y = h / 2;
  const edge = pick(GLOWS.slice(0, 5), rng);
  addEdges(body, edge, 0.95);
  g.add(body);
  // storefront
  const sc = pick(GLOWS, rng);
  const shop = new THREE.Mesh(
    new THREE.PlaneGeometry(w * 0.82, 3.1),
    new THREE.MeshBasicMaterial({ map: shopTex(sc), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
  );
  shop.position.set(0, 1.7, -side * (d / 2 + 0.04)); // street-facing wall
  if (side > 0) shop.rotation.y = Math.PI;
  g.add(shop);
  const gl = glow(sc, w * 0.9, 0.35);
  gl.position.set(0, 1.8, -side * (d / 2 + 1.0));
  g.add(gl);
  const sk = streak(sc, w * 0.7, 7, 0.32);
  sk.position.set(0, 0.04, -side * (d / 2 + 3.6));
  g.add(sk);
  // wall signs
  const nSigns = 1 + (rng() < 0.55 ? 1 : 0);
  for (let i = 0; i < nSigns; i++) {
    const col = pick(GLOWS, rng);
    const sw = 2.6 + rng() * 2.6;
    const s = glowSign(pick(SIGN_TEXT, rng), col, sw);
    s.position.set((rng() - 0.5) * (w - sw - 1), i === 0 ? 4.6 + rng() * 1.2 : 8 + rng() * Math.min(10, h - 10), -side * (d / 2 + 0.08));
    if (side > 0) s.rotation.y = Math.PI;
    g.add(s);
    st.flicker(s.userData.mat, 0.6 + rng() * 0.8);
    const sg = glow(col, sw * 1.2, 0.25);
    sg.position.set(s.position.x, s.position.y, s.position.z - side * 0.4);
    g.add(sg);
  }
  // roof gear
  if (rng() < 0.55) {
    const ant = new THREE.Mesh(cylGeo(0.05, 0.05, 5, 5), lambert(0x333355));
    ant.position.set((rng() - 0.5) * w * 0.6, h + 2.5, 0);
    g.add(ant);
    const beacon = glow(C.red, 1.2, 0.9);
    beacon.position.set(ant.position.x, h + 5, 0);
    g.add(beacon);
    g.userData.beacon = beacon;
  }
  if (rng() < 0.4) {
    const box = nbox(w * 0.4, 1.6, d * 0.4, 0x14103a, pick(GLOWS, rng));
    box.position.set(0, h + 0.8, 0);
    g.add(box);
  }
  st.scene.add(g);
  if (o.collide !== false) {
    st.addCollider(cx - w / 2, cx + w / 2, side < 0 ? zFace - d : zFace, side < 0 ? zFace : zFace + d, h);
  }
  return g;
}

export function addBuildings(st, o) {
  const rng = mulberry(o.seed || 1);
  const list = [];
  for (const side of [-1, 1]) {
    let x = o.x0;
    while (x < o.x1) {
      const w = 9 + rng() * 7, h = (o.minH || 16) + rng() * ((o.maxH || 44) - (o.minH || 16)), d = 14 + rng() * 10;
      const cx = x + w / 2;
      const gap = (o.gaps || []).find((q) => q.side === side && cx + w / 2 > q.x0 && cx - w / 2 < q.x1);
      if (gap) { x = gap.x1 + 0.5; continue; }
      list.push(makeBuilding(st, cx, side, w, h, d, rng, o));
      x += w + (rng() < 0.3 ? 2 + rng() * 3 : 0.4);
    }
  }
  return list;
}

export function addSkyline(st, cx, seed = 5, span = 220) {
  const rng = mulberry(seed);
  const texs = [0, 1, 2].map((i) => windowTexture(5, 22, 900 + i + seed));
  for (let i = 0; i < 34; i++) {
    const side = i % 2 ? 1 : -1;
    const w = 14 + rng() * 22, d = 14 + rng() * 14, h = 45 + rng() * 85;
    const x = cx + (rng() - 0.5) * span * 2;
    const z = side * (46 + rng() * 80);
    const t = texs[i % 3];
    const m = new THREE.Mesh(boxGeo(w, h, d), new THREE.MeshBasicMaterial({ map: t }));
    m.position.set(x, h / 2, z);
    addEdges(m, pick([C.pink, C.violet, C.blue, C.cyan], rng), 0.9);
    st.scene.add(m);
  }
}

/* ---------------- lamps / props ---------------- */
export function addLamps(st, x0, x1, step = 18, opts = {}) {
  const list = [];
  let n = 0;
  for (let x = x0; x <= x1; x += step) {
    for (const side of [-1, 1]) {
      const col = (n++ % 2) ? C.pink : C.cyan;
      const g = new THREE.Group();
      g.position.set(x + (side > 0 ? step / 2 : 0), 0, side * 7.5);
      g.userData.x = g.position.x;
      const pole = new THREE.Mesh(cylGeo(0.06, 0.09, 6.2, 6), lambert(0x22204a));
      pole.position.y = 3.1;
      g.add(pole);
      const arm = new THREE.Mesh(boxGeo(0.08, 0.08, 1.3), lambert(0x22204a));
      arm.position.set(0, 6.1, -side * 0.6);
      g.add(arm);
      const head = led(0.4, 0.1, 0.6, col);
      head.position.set(0, 6.0, -side * 1.2);
      g.add(head);
      const gl = glow(col, 6, 0.55);
      gl.position.set(0, 5.9, -side * 1.2);
      g.add(gl);
      const sk = streak(col, 2.4, 8, 0.4);
      sk.position.set(0, 0.04, -side * 3.5);
      g.add(sk);
      st.scene.add(g);
      st.addBoxCollider(g.position.x, g.position.z, 0.3, 0.3, 6);
      st.flicker(gl.material, 0.2);
      list.push(g);
    }
  }
  return list;
}

export function addCrosswalk(st, x, w = 5) {
  const c = makeCanvas(256, 256);
  const g = c.getContext('2d');
  g.clearRect(0, 0, 256, 256);
  g.fillStyle = '#dff8ff';
  g.shadowColor = '#00f0ff';
  g.shadowBlur = 10;
  for (let i = 0; i < 9; i++) g.fillRect(8, 6 + i * 28, 240, 14);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, 14),
    new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, 0.03, 0);
  st.scene.add(m);
}

const walkTex = {};
function walkTexture(txt, col) {
  const k = txt + col;
  if (walkTex[k]) return walkTex[k];
  const c = makeCanvas(128, 64);
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(2,0,12,0.9)';
  g.fillRect(0, 0, 128, 64);
  g.strokeStyle = col; g.lineWidth = 4; g.strokeRect(3, 3, 122, 58);
  g.font = '900 26px Orbitron, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = col; g.shadowColor = col; g.shadowBlur = 12;
  g.fillText(txt, 64, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  walkTex[k] = t;
  return t;
}

export function makeTrafficLight(st, x, z, side) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const pole = new THREE.Mesh(cylGeo(0.07, 0.09, 4.4, 6), lambert(0x22204a));
  pole.position.y = 2.2;
  g.add(pole);
  const head = nbox(0.4, 1.05, 0.34, 0x0a0820, C.cyan);
  head.position.set(0, 4.4, 0);
  g.add(head);
  const lamps = {};
  [['red', C.red, 0.34], ['yellow', C.yellow, 0], ['green', C.green, -0.34]].forEach(([n, col, dy]) => {
    const mat = new THREE.MeshBasicMaterial({ color: col });
    const m = new THREE.Mesh(sphereGeo(0.12, 8, 6), mat);
    m.position.set(0, 4.4 + dy, -side * 0.2);
    g.add(m);
    lamps[n] = { mat, col };
  });
  const gl = glow(C.red, 3, 0.8);
  gl.material = gl.material.clone();
  gl.position.set(0, 4.4, -side * 0.3);
  g.add(gl);
  const walk = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.45), new THREE.MeshBasicMaterial({ map: walkTexture('STOP', '#ff2244'), side: THREE.DoubleSide }));
  walk.position.set(0, 3.2, 0);
  walk.rotation.y = Math.PI / 2;
  g.add(walk);
  st.scene.add(g);
  st.addBoxCollider(x, z, 0.3, 0.3, 4.4);
  const dim = new THREE.Color(0x120a1a);
  return {
    group: g,
    set(state) {
      for (const n of ['red', 'yellow', 'green']) lamps[n].mat.color.copy(n === state ? new THREE.Color(lamps[n].col) : dim);
      gl.material.color.setHex(state === 'green' ? C.green : state === 'yellow' ? C.yellow : C.red);
      walk.material.map = state === 'red' ? walkTexture('WALK', '#39ff9a') : walkTexture('STOP', '#ff2244');
      walk.material.needsUpdate = true;
    }
  };
}

export function addStall(st, x, z, o = {}) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const col = o.color ?? C.pink;
  const counter = nbox(2.4, 1.0, 0.9, 0x1a1040, col);
  counter.position.set(0, 0.5, 0);
  g.add(counter);
  const top = led(2.5, 0.05, 1.0, col, 0.9);
  top.position.set(0, 1.02, 0);
  g.add(top);
  for (const sx of [-1.2, 1.2]) {
    const p = new THREE.Mesh(cylGeo(0.04, 0.04, 2.4, 5), lambert(0x333366));
    p.position.set(sx, 1.2, -0.45);
    g.add(p);
  }
  const canopy = nbox(2.9, 0.1, 1.6, 0x2a0a4a, col);
  canopy.position.set(0, 2.4, -0.2);
  canopy.rotation.x = 0.12;
  g.add(canopy);
  const under = led(2.6, 0.03, 1.3, col, 0.65);
  under.position.set(0, 2.33, -0.2);
  g.add(under);
  for (let i = 0; i < 5; i++) {
    const b = glow(i % 2 ? C.yellow : col, 0.8, 0.9);
    b.position.set(-1.2 + i * 0.6, 2.2 - Math.abs(i - 2) * 0.05, 0.6);
    g.add(b);
  }
  const sign = glowSign(o.label || 'चाय', col, 2.2, { h: 110 });
  sign.position.set(0, 2.9, 0.1);
  g.add(sign);
  st.flicker(sign.userData.mat, 1);
  const lg = glow(col, 6, 0.4);
  lg.position.set(0, 1.5, 1.2);
  g.add(lg);
  const sk = streak(col, 2.4, 6, 0.35);
  sk.position.set(0, 0.04, 3.2);
  g.add(sk);
  // steam
  const steam = [];
  for (let i = 0; i < 3; i++) {
    const s = glow(0xbfe8ff, 0.7, 0.25);
    s.position.set(-0.5 + i * 0.5, 1.2, 0);
    g.add(s);
    steam.push({ s, t: i * 0.9 });
  }
  st.updaters.push((dt) => {
    for (const q of steam) {
      q.t = (q.t + dt * 0.5) % 2;
      q.s.position.y = 1.15 + q.t * 0.8;
      q.s.material.opacity = 0.25 * (1 - q.t / 2);
    }
  });
  g.rotation.y = o.rot || 0;
  st.scene.add(g);
  const cw = Math.abs(Math.cos(g.rotation.y)) > 0.7 ? 2.6 : 1.1, cd = Math.abs(Math.cos(g.rotation.y)) > 0.7 ? 1.1 : 2.6;
  st.addBoxCollider(x, z, cw, cd, 2.4);
  return g;
}

export function addBench(st, x, z, rot = 0) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = rot;
  const seat = nbox(1.8, 0.1, 0.5, 0x1a1040, C.cyan);
  seat.position.y = 0.5;
  g.add(seat);
  const back = nbox(1.8, 0.45, 0.08, 0x1a1040, C.cyan);
  back.position.set(0, 0.85, -0.22);
  g.add(back);
  for (const sx of [-0.8, 0.8]) {
    const l = nbox(0.08, 0.5, 0.45, 0x22204a);
    l.position.set(sx, 0.25, 0);
    g.add(l);
  }
  st.scene.add(g);
  const horizontal = Math.abs(Math.cos(rot)) > 0.7;
  st.addBoxCollider(x, z, horizontal ? 1.9 : 0.6, horizontal ? 0.6 : 1.9, 0.9);
  return g;
}

export function addBin(st, x, z) {
  const b = nbox(0.5, 0.9, 0.5, 0x1a1a3a, C.green);
  b.position.set(x, 0.45, z);
  st.scene.add(b);
  st.addBoxCollider(x, z, 0.5, 0.5, 0.9);
  return b;
}

export function addHoloAd(st, x, y, z, lines, color, rotY = 0, w = 3.4, h = 2.2) {
  const p = holoPanel(lines, color, w, h);
  p.position.set(x, y, z);
  p.rotation.y = rotY;
  st.scene.add(p);
  const gl = glow(color, w * 1.8, 0.3);
  gl.position.set(x, y, z);
  st.scene.add(gl);
  st.flicker(p.userData.mat, 1.2);
  st.updaters.push((dt, t) => { p.position.y = y + Math.sin(t * 1.4 + x) * 0.08; });
  return p;
}

/* ---------------- vehicles ---------------- */
export function makeCar(color = C.pink, kind = 'car') {
  const g = new THREE.Group();
  if (kind === 'auto') {
    const body = nbox(2.0, 0.9, 1.3, 0x1a8a3a, color);
    body.position.set(-0.1, 0.75, 0);
    g.add(body);
    const roof = nbox(1.7, 0.1, 1.4, 0x111122, color);
    roof.position.set(-0.2, 1.75, 0);
    g.add(roof);
    for (const sz of [-0.62, 0.62]) {
      const p = new THREE.Mesh(cylGeo(0.03, 0.03, 0.8, 4), lambert(0x333344));
      p.position.set(0.55, 1.35, sz);
      g.add(p);
      const q = p.clone();
      q.position.x = -0.9;
      g.add(q);
    }
    const w1 = new THREE.Mesh(cylGeo(0.3, 0.3, 0.2, 10), lambert(0x050510));
    w1.rotation.x = Math.PI / 2;
    w1.position.set(0.95, 0.3, 0);
    g.add(w1);
    for (const sz of [-0.6, 0.6]) {
      const w = w1.clone();
      w.position.set(-0.8, 0.3, sz);
      g.add(w);
    }
    const hl = led(0.08, 0.14, 0.3, 0xffffff);
    hl.position.set(1.05, 0.95, 0);
    g.add(hl);
    g.userData.len = 2.6;
  } else {
    const body = nbox(4.3, 0.65, 1.85, color === C.pink ? 0x2a0a40 : 0x0e1440, color);
    body.position.y = 0.6;
    g.add(body);
    const cab = nbox(2.3, 0.6, 1.6, 0x0a0a22, C.cyan);
    cab.position.set(-0.25, 1.22, 0);
    g.add(cab);
    const glass = new THREE.Mesh(boxGeo(2.32, 0.4, 1.62), basic(0x1a3a8a, { opacity: 0.55 }));
    glass.position.set(-0.25, 1.25, 0);
    g.add(glass);
    const wg = cylGeo(0.36, 0.36, 0.26, 10);
    for (const sx of [-1.4, 1.4]) for (const sz of [-0.9, 0.9]) {
      const w = new THREE.Mesh(wg, lambert(0x050510));
      w.rotation.x = Math.PI / 2;
      w.position.set(sx, 0.36, sz);
      g.add(w);
    }
    for (const sz of [-0.6, 0.6]) {
      const hl = led(0.08, 0.14, 0.4, 0xdfffff);
      hl.position.set(2.17, 0.65, sz);
      g.add(hl);
      const tl = led(0.08, 0.14, 0.4, C.red);
      tl.position.set(-2.17, 0.65, sz);
      g.add(tl);
    }
    g.userData.len = 4.4;
  }
  const ug = streak(color, 2.4, 5, 0.5);
  ug.rotation.z = Math.PI / 2;
  ug.position.y = 0.05;
  g.add(ug);
  const beamF = streak(0xcfe8ff, 1.6, 7, 0.22);
  beamF.rotation.z = Math.PI / 2;
  beamF.position.set(5.2, 0.06, 0);
  g.add(beamF);
  const hg = glow(0xcfe8ff, 2.2, 0.6);
  hg.position.set(2.4, 0.7, 0);
  g.add(hg);
  return g;
}

export class Traffic {
  /**
   * lanes: [{z, dir}] dir=+1 east (+X) / -1 west.  range: [xa,xb] wrap range.
   * stop: {east: xLine, west: xLine} stop lines for the crosswalk (or null).
   */
  constructor(st, o) {
    this.st = st;
    this.lanes = o.lanes;
    this.xa = o.range[0];
    this.xb = o.range[1];
    this.stop = o.stop || null;
    this.cars = [];
    const rng = mulberry(o.seed || 9);
    const cols = [C.pink, C.cyan, C.violet, C.blue, C.hot, C.green];
    const per = o.perLane || 4;
    for (const lane of this.lanes) {
      for (let i = 0; i < per; i++) {
        const kind = rng() < 0.28 ? 'auto' : 'car';
        const root = makeCar(pick(cols, rng), kind);
        const x = this.xa + (i + rng() * 0.6) * ((this.xb - this.xa) / per);
        root.position.set(x, 0, lane.z);
        root.rotation.y = lane.dir > 0 ? 0 : Math.PI;
        st.scene.add(root);
        this.cars.push({ root, lane, x, v: 7 + rng() * 4, cruise: 8 + rng() * 5, len: root.userData.len });
      }
    }
    this.speedScale = 1;
  }

  /** returns the car hitting point p (x,z) or null */
  hit(px, pz) {
    for (const c of this.cars) {
      if (c.v < 1.5) continue;
      if (Math.abs(c.lane.z - pz) < 1.25 && Math.abs(c.x - px) < c.len / 2 + 0.4) return c;
    }
    return null;
  }
  nearest(px, pz) {
    let best = 99;
    for (const c of this.cars) {
      if (Math.abs(c.lane.z - pz) < 2.5) best = Math.min(best, Math.abs(c.x - px));
    }
    return best;
  }

  update(dt, state, playerX) {
    const stopOn = this.stop && state !== 'green';
    for (const c of this.cars) {
      const dir = c.lane.dir;
      let vmax = c.cruise * this.speedScale;
      // car ahead in the same lane
      let gap = 1e9;
      for (const o of this.cars) {
        if (o === c || o.lane !== c.lane) continue;
        const d = (o.x - c.x) * dir;
        if (d > 0 && d < gap) gap = d;
      }
      const margin = gap - (c.len + 1.8);
      if (margin < 14) vmax = Math.min(vmax, Math.max(0, margin * 1.1));
      if (stopOn) {
        const line = dir > 0 ? this.stop.east : this.stop.west;
        const d = (line - c.x) * dir - c.len / 2;
        const canGo = state === 'yellow' && d < 4;
        if (d > -0.5 && d < 16 && !canGo) vmax = Math.min(vmax, Math.max(0, (d - 0.6) * 1.2));
      }
      const acc = c.v < vmax ? 4 : -9;
      c.v = Math.max(0, c.v + acc * dt);
      if (c.v > vmax && acc > 0) c.v = vmax;
      c.x += dir * c.v * dt;
      if (dir > 0 && c.x > this.xb) c.x = this.xa;
      if (dir < 0 && c.x < this.xa) c.x = this.xb;
      c.root.position.x = c.x;
      c.root.visible = Math.abs(c.x - playerX) < 115;
    }
  }
}
