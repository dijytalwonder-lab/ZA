import * as THREE from 'three';
import { C, boxGeo, cylGeo, sphereGeo, lambert, basic, addEdges } from '../core/kit.js';
import { clamp, damp, lerp, smooth } from '../core/util.js';

export const OUTFITS = [
  { name: 'CYAN RUNNER', accent: C.cyan, jacket: 0x14124a, hair: 0x0b0820, desc: 'Cyan trim. Balanced and quick.' },
  { name: 'SYNTH PUNK', accent: C.pink, jacket: 0x3a0a4a, hair: 0x240a30, desc: 'Hot-pink jacket lines.' },
  { name: 'VIOLET GHOST', accent: C.violet, jacket: 0x1b1040, hair: 0x15082e, desc: 'Violet glow, midnight hoodie.' },
  { name: 'TOXIC VOLT', accent: C.green, jacket: 0x0c2a2a, hair: 0x06140f, desc: 'Acid-green stripes.' }
];

const POSE0 = () => ({
  speed: 0, crouch: 0, air: false, vy: 0, atkT: -1, atk: 'swing', block: 0, hurt: 0, dead: 0,
  seated: 0, lie: 0, windup: 0, dash: 0, transform: 0, wave: 0, phone: 0, aim: 0
});

/**
 * Blocky glowing humanoid. Model faces +Z. Origin at the feet.
 * Owner sets rig.p.* each frame, then calls rig.update(dt).
 */
export class Rig {
  constructor(o = {}) {
    this.o = o;
    const s = o.scale || 1;
    const wd = o.width || 1;
    this.zombie = !!o.zombie;
    this.p = POSE0();
    this.s = { crouch: 0, block: 0, seated: 0, lie: 0, dead: 0, dash: 0, windup: 0 };
    this.phase = Math.random() * 6;
    this.t = Math.random() * 10;
    this.wb = 0;
    this.air = 0;
    this.flashT = 0;
    this.flashColor = new THREE.Color(0xffffff);
    this.held = null;

    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.root.scale.setScalar(s);

    const skinCol = o.skin ?? 0xc58a6a;
    this.skinMat = new THREE.MeshLambertMaterial({ color: skinCol });
    this.shirtMat = new THREE.MeshLambertMaterial({ color: o.shirt ?? 0x14124a });
    this.pantsMat = new THREE.MeshLambertMaterial({ color: o.pants ?? 0x0d0d2b });
    this.accentMat = new THREE.MeshBasicMaterial({ color: o.accent ?? C.cyan });
    this.hairMat = lambert(o.hair ?? 0x0b0820);
    this.shoeMat = lambert(o.shoe ?? 0x15152e);
    this.outlineMat = o.outline != null
      ? new THREE.MeshBasicMaterial({ color: o.outline, side: THREE.BackSide })
      : null;
    this.eyeMat = this.zombie
      ? new THREE.MeshBasicMaterial({ color: o.eyes ?? C.red })
      : null;
    this.veinMat = this.zombie
      ? new THREE.MeshBasicMaterial({
        color: o.veins ?? C.cyan, transparent: true, opacity: 0.95, depthWrite: false,
        blending: THREE.AdditiveBlending
      })
      : null;
    this.skinBase = new THREE.Color(skinCol);

    const part = (geo, mat, parent, x, y, z, hull = true) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      parent.add(m);
      if (hull && this.outlineMat) {
        const h = new THREE.Mesh(geo, this.outlineMat);
        h.scale.setScalar(1.16);
        m.add(h);
      }
      return m;
    };
    const grp = (parent, x, y, z) => {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      parent.add(g);
      return g;
    };

    const j = (this.j = {});
    j.hips = grp(this.body, 0, 0.8, 0);
    // legs
    const legW = 0.17 * wd;
    for (const side of [-1, 1]) {
      const n = side < 0 ? 'L' : 'R';
      const leg = grp(j.hips, side * 0.11 * wd, 0, 0);
      part(boxGeo(legW, 0.4, legW), this.pantsMat, leg, 0, -0.2, 0);
      const knee = grp(leg, 0, -0.4, 0);
      part(boxGeo(legW * 0.92, 0.38, legW * 0.92), this.pantsMat, knee, 0, -0.19, 0);
      const foot = part(boxGeo(legW * 1.05, 0.1, 0.27), this.shoeMat, knee, 0, -0.43, 0.05);
      const sole = new THREE.Mesh(boxGeo(legW * 1.1, 0.03, 0.29), this.accentMat);
      sole.position.set(0, -0.04, 0);
      foot.add(sole);
      j['leg' + n] = leg;
      j['knee' + n] = knee;
    }
    // torso
    j.torso = grp(j.hips, 0, 0, 0);
    const tw = 0.4 * wd, td = 0.22 * (o.bulk || 1);
    part(boxGeo(tw, 0.58, td), this.shirtMat, j.torso, 0, 0.3, 0);
    // jacket accent stripes
    const stripe = new THREE.Mesh(boxGeo(0.03, 0.5, td + 0.012), this.accentMat);
    stripe.position.set(-tw * 0.32, 0.3, 0);
    j.torso.add(stripe);
    const stripe2 = stripe.clone();
    stripe2.position.x = tw * 0.32;
    j.torso.add(stripe2);
    this.stripes = [stripe, stripe2];
    if (this.zombie) {
      // glowing veins
      const vg = grp(j.torso, 0, 0.3, td / 2 + 0.005);
      for (let k = 0; k < 3; k++) {
        const v = new THREE.Mesh(boxGeo(0.018, 0.3, 0.012), this.veinMat);
        v.position.set(-0.1 + k * 0.1, 0.02 * k, 0);
        v.rotation.z = (k - 1) * 0.5;
        vg.add(v);
      }
    }
    // neck + head
    j.neck = grp(j.torso, 0, 0.6, 0);
    j.head = grp(j.neck, 0, 0.16, 0);
    part(sphereGeo(0.15, 12, 10), this.skinMat, j.head, 0, 0, 0);
    if (!this.zombie || o.hair != null) {
      const hair = part(boxGeo(0.3, 0.1, 0.31), this.hairMat, j.head, 0, 0.1, -0.01, false);
      part(boxGeo(0.31, 0.15, 0.1), this.hairMat, j.head, 0, 0.04, -0.12, false);
      if (!o.hood) hair.position.y = 0.11;
    }
    if (o.hood) {
      part(boxGeo(0.34, 0.3, 0.34), this.shirtMat, j.head, 0, 0.01, -0.04, false);
    }
    if (this.zombie) {
      for (const side of [-1, 1]) {
        const e = new THREE.Mesh(boxGeo(0.055, 0.03, 0.02), this.eyeMat);
        e.position.set(side * 0.06, 0.02, 0.138);
        j.head.add(e);
      }
      const mouth = new THREE.Mesh(boxGeo(0.12, 0.02, 0.02), this.veinMat);
      mouth.position.set(0, -0.06, 0.14);
      j.head.add(mouth);
    } else if (o.headphones) {
      const band = new THREE.Mesh(boxGeo(0.34, 0.03, 0.05), this.accentMat);
      band.position.set(0, 0.12, 0);
      j.head.add(band);
      for (const side of [-1, 1]) {
        const cup = new THREE.Mesh(boxGeo(0.06, 0.12, 0.12), this.accentMat);
        cup.position.set(side * 0.16, 0.0, 0);
        j.head.add(cup);
      }
    }
    // arms
    const armW = 0.11 * wd * (o.armBulk || 1);
    for (const side of [-1, 1]) {
      const n = side < 0 ? 'L' : 'R';
      const arm = grp(j.torso, side * (tw / 2 + 0.07 * wd), 0.52, 0);
      part(boxGeo(armW, 0.29, armW), this.shirtMat, arm, 0, -0.14, 0);
      const elbow = grp(arm, 0, -0.28, 0);
      part(boxGeo(armW * 0.9, 0.28, armW * 0.9), this.zombie ? this.skinMat : this.shirtMat, elbow, 0, -0.14, 0);
      const hand = grp(elbow, 0, -0.28, 0);
      part(boxGeo(0.1, 0.1, 0.1), this.skinMat, hand, 0, -0.04, 0, false);
      if (this.zombie) {
        const v = new THREE.Mesh(boxGeo(0.014, 0.26, 0.014), this.veinMat);
        v.position.set(0, -0.14, armW * 0.46);
        elbow.add(v);
      }
      j['arm' + n] = arm;
      j['elbow' + n] = elbow;
      j['hand' + n] = hand;
    }
    // backpack
    if (o.backpack) {
      this.pack = new THREE.Group();
      const pb = new THREE.Mesh(boxGeo(0.3, 0.38, 0.14), lambert(0x1a1040));
      addEdges(pb, o.accent ?? C.cyan);
      this.pack.add(pb);
      const pk = new THREE.Mesh(boxGeo(0.2, 0.02, 0.03), this.accentMat);
      pk.position.set(0, 0.05, 0.08);
      this.pack.add(pk);
      this.pack.position.set(0, 0.3, -td / 2 - 0.09);
      j.torso.add(this.pack);
    }
    this.height = 1.55 * s;
    this.update(0);
  }

  setColors(shirt, accent, hair) {
    if (shirt != null) this.shirtMat.color.setHex(shirt);
    if (accent != null) {
      this.accentMat.color.setHex(accent);
      if (this.outlineMat) this.outlineMat.color.setHex(accent);
    }
    if (hair != null) this.hairMat.color.setHex(hair);
  }
  setOutline(color) {
    if (this.outlineMat) this.outlineMat.color.setHex(color);
  }
  setSkinBlend(color, k) {
    this.skinMat.color.copy(this.skinBase).lerp(new THREE.Color(color), k);
  }
  flash(color = 0xffffff, t = 0.18) {
    this.flashColor.setHex(color);
    this.flashT = t;
  }
  show(v) { this.root.visible = v; }
  setPack(v) { if (this.pack) this.pack.visible = v; }

  setHeld(type) {
    if (this.held === type) return;
    this.held = type;
    const hand = this.j.handR;
    if (this.heldObj) { hand.remove(this.heldObj); this.heldObj = null; }
    if (!type || type === 'fists') { return; }
    const g = new THREE.Group();
    if (type === 'rod') {
      const m = new THREE.Mesh(cylGeo(0.03, 0.03, 1.0, 8), lambert(0x6b6f95, 0x222244));
      m.rotation.x = Math.PI / 2;
      m.position.set(0, -0.06, 0.38);
      g.add(m);
      const tip = new THREE.Mesh(cylGeo(0.036, 0.036, 0.12, 8), this.accentMat);
      tip.rotation.x = Math.PI / 2;
      tip.position.set(0, -0.06, 0.88);
      g.add(tip);
    } else if (type === 'bottle') {
      const m = new THREE.Mesh(cylGeo(0.05, 0.05, 0.24, 10), basic(C.green, { opacity: 0.85 }));
      m.position.set(0, -0.02, 0.08);
      g.add(m);
      const cap = new THREE.Mesh(cylGeo(0.02, 0.03, 0.07, 8), this.accentMat);
      cap.position.set(0, 0.13, 0.08);
      g.add(cap);
    } else if (type === 'pistol' || type === 'shotgun') {
      // barrel points along the hand's -Y so it aims forward when the arm is raised
      const long = type === 'shotgun';
      const len = long ? 0.62 : 0.2;
      const body = new THREE.Mesh(boxGeo(0.055, len, long ? 0.075 : 0.085), lambert(0x14122e, 0x0a0a20));
      addEdges(body, long ? C.orange : C.cyan);
      body.position.set(0, -0.06 - len / 2, 0.02);
      g.add(body);
      const grip = new THREE.Mesh(boxGeo(0.05, 0.12, 0.06), lambert(0x14122e));
      grip.position.set(0, -0.06, 0.07);
      grip.rotation.x = -0.25;
      g.add(grip);
      const tip = new THREE.Mesh(boxGeo(0.03, 0.04, 0.03), basic(long ? C.orange : C.cyan));
      tip.position.set(0, -0.06 - len - 0.01, 0.02);
      g.add(tip);
    } else if (type === 'bag') {
      const m = new THREE.Mesh(boxGeo(0.3, 0.38, 0.14), lambert(0x1a1040));
      addEdges(m, this.o.accent ?? C.cyan);
      m.position.set(0, -0.18, 0.06);
      g.add(m);
    }
    hand.add(g);
    this.heldObj = g;
  }

  update(dt) {
    const p = this.p, s = this.s, j = this.j, z = this.zombie;
    s.crouch = damp(s.crouch, p.crouch, 14, dt);
    s.block = damp(s.block, p.block, 16, dt);
    s.seated = damp(s.seated, p.seated, 9, dt);
    s.lie = damp(s.lie, p.lie, 6, dt);
    s.dead = damp(s.dead, p.dead, p.dead > 0.5 ? 9 : 20, dt);
    s.dash = damp(s.dash, p.dash, 18, dt);
    s.windup = damp(s.windup, p.windup, 14, dt);
    this.air = damp(this.air, p.air ? 1 : 0, 14, dt);
    this.t += dt;
    const sp = p.speed;
    const moving = sp > 0.12 && !p.air && s.seated < 0.5 && s.dead < 0.5;
    this.wb = damp(this.wb, moving ? 1 : 0, 10, dt);
    if (moving) this.phase += dt * (z ? 2.2 + sp * 1.15 : 3.2 + sp * 1.25);
    const amp = clamp(sp * 0.19, 0, 1.2) * (1 - s.crouch * 0.45) * this.wb;
    const sn = Math.sin(this.phase), cs = Math.cos(this.phase);
    const lieAmt = Math.max(s.lie, s.dead);

    // ---- legs
    let thL = sn * amp, thR = -sn * amp;
    let knL = Math.max(0, -cs) * amp * 1.15, knR = Math.max(0, cs) * amp * 1.15;
    if (z) { thL *= 0.75; knL *= 0.5; }
    thL += -0.95 * s.crouch - 1.5 * s.seated;
    thR += -0.95 * s.crouch - 1.5 * s.seated;
    knL += 1.9 * s.crouch + 1.5 * s.seated;
    knR += 1.9 * s.crouch + 1.5 * s.seated;
    thL = lerp(thL, p.vy > 0 ? -0.7 : -0.3, this.air);
    thR = lerp(thR, p.vy > 0 ? 0.25 : -0.55, this.air);
    knL = lerp(knL, 1.1, this.air);
    knR = lerp(knR, 0.6, this.air);
    thL = lerp(thL, 0.5, s.dash); thR = lerp(thR, -0.9, s.dash);
    j.legL.rotation.x = thL; j.kneeL.rotation.x = knL;
    j.legR.rotation.x = thR; j.kneeR.rotation.x = knR;

    // ---- torso / head
    let lean = 0.32 * s.crouch + 0.5 * s.dash - 0.42 * p.hurt;
    let twist = 0;
    if (z) lean += this.o.runner ? 0.55 : 0.22;
    // ---- arms
    let aL = -sn * amp * 0.85, aR = sn * amp * 0.85;
    let eL = -0.15 - amp * 0.5, eR = eL;
    if (z) {
      const run = this.o.runner ? 1 : 0;
      aL = lerp(-1.45 + Math.sin(this.t * 1.7) * 0.12, -0.6 - sn * 0.9, run * this.wb);
      aR = lerp(-1.45 + Math.cos(this.t * 1.5) * 0.12, -0.6 + sn * 0.9, run * this.wb);
      eL = -0.22; eR = -0.28;
      if (s.windup > 0.01) {
        aL = lerp(aL, -2.65, s.windup); aR = lerp(aR, -2.65, s.windup);
        eL = lerp(eL, -0.3, s.windup); eR = eL;
        lean -= 0.3 * s.windup;
      }
      if (p.atkT >= 0) {
        const k = smooth(clamp(p.atkT / 0.3, 0, 1));
        const r = smooth(clamp((p.atkT - 0.55) / 0.45, 0, 1));
        const a = lerp(-2.65, -0.7, k) * (1 - r) + -1.45 * r;
        aL = a; aR = a;
        lean += 0.45 * k * (1 - r);
      }
    } else {
      if (p.atkT >= 0) {
        const t = p.atkT;
        if (p.atk === 'push') {
          const k = smooth(clamp(t / 0.3, 0, 1)) * (1 - smooth(clamp((t - 0.55) / 0.45, 0, 1)));
          aL = lerp(aL, -1.55, k); aR = lerp(aR, -1.55, k);
          eL = lerp(eL, 0, k); eR = lerp(eR, 0, k);
          lean += 0.35 * k;
        } else {
          const wind = smooth(clamp(t / 0.3, 0, 1));
          const strike = smooth(clamp((t - 0.3) / 0.22, 0, 1));
          const rec = smooth(clamp((t - 0.62) / 0.38, 0, 1));
          let a = -2.7 * wind;
          if (t > 0.3) a = lerp(-2.7, -0.35, strike);
          if (t > 0.62) a = lerp(-0.35, 0, rec);
          aR = a;
          eR = -0.5 * wind * (1 - strike) - 0.15;
          twist = lerp(0.55 * wind, -0.6, strike) * (1 - rec);
          lean += 0.28 * strike * (1 - rec);
        }
      }
      if (s.block > 0.01) {
        aL = lerp(aL, -1.25, s.block); aR = lerp(aR, -1.4, s.block);
        eL = lerp(eL, -1.65, s.block); eR = lerp(eR, -1.7, s.block);
        lean -= 0.1 * s.block;
      }
      if (p.wave > 0.01) { aR = lerp(aR, -2.6 + Math.sin(this.t * 9) * 0.35, p.wave); eR = lerp(eR, -0.3, p.wave); }
      if (p.phone > 0.01) { aR = lerp(aR, -1.15, p.phone); eR = lerp(eR, -1.5, p.phone); lean += 0.1 * p.phone; }
      if (s.dash > 0.01) { aL = lerp(aL, 0.9, s.dash); aR = lerp(aR, 0.9, s.dash); }
      if (this.air > 0.01) { aL = lerp(aL, -0.8, this.air); aR = lerp(aR, -0.8, this.air); }
      if (p.aim > 0.01) { // gun raised
        aR = lerp(aR, -1.5, p.aim); eR = lerp(eR, -0.08, p.aim);
        if (this.held === 'shotgun') { aL = lerp(aL, -1.3, p.aim); eL = lerp(eL, -0.55, p.aim); }
        else aL = lerp(aL, aL * 0.4, p.aim);
        twist = lerp(twist, 0.25, p.aim);
      }
    }
    j.armL.rotation.x = aL; j.armR.rotation.x = aR;
    j.elbowL.rotation.x = eL; j.elbowR.rotation.x = eR;
    j.armL.rotation.z = 0.05 + s.block * 0.35; j.armR.rotation.z = -0.05 - s.block * 0.35;
    const idle = Math.sin(this.t * 1.8) * 0.012;
    j.torso.rotation.x = lean + idle;
    j.torso.rotation.y = twist;
    j.torso.rotation.z = z ? Math.sin(this.phase) * 0.08 * this.wb + Math.sin(this.t * 1.1) * 0.03 : 0;
    j.head.rotation.x = -lean * 0.55 + (z ? 0.28 : 0) + (p.phone > 0 ? 0.35 * p.phone : 0);
    j.head.rotation.z = z ? 0.32 + Math.sin(this.t * 2.2) * 0.05 : 0;
    j.head.rotation.y = 0;

    // ---- transform convulsions
    if (p.transform > 0.01) {
      const k = p.transform;
      j.head.rotation.z += Math.sin(this.t * 53) * 0.5 * k;
      j.head.rotation.x += Math.sin(this.t * 41) * 0.4 * k;
      j.torso.rotation.z += Math.sin(this.t * 37) * 0.25 * k;
      j.torso.rotation.x += Math.sin(this.t * 29) * 0.2 * k;
      j.armL.rotation.x += Math.sin(this.t * 31) * 0.7 * k;
      j.armR.rotation.x += Math.cos(this.t * 33) * 0.7 * k;
    }

    // ---- body offset / lying
    const bob = Math.abs(cs) * 0.04 * amp;
    this.body.position.y = -(0.33 * s.crouch + 0.3 * s.seated) + 0.11 * lieAmt + bob;
    this.body.rotation.x = -Math.PI / 2 * lieAmt;
    this.body.position.x = p.transform > 0.01 ? Math.sin(this.t * 61) * 0.04 * p.transform : 0;

    // ---- hit flash
    if (this.flashT > 0) {
      this.flashT = Math.max(0, this.flashT - dt);
      const k = this.flashT / 0.18;
      this.skinMat.emissive.copy(this.flashColor).multiplyScalar(k * 0.9);
      this.shirtMat.emissive.copy(this.flashColor).multiplyScalar(k * 0.9);
      this.pantsMat.emissive.copy(this.flashColor).multiplyScalar(k * 0.9);
    } else if (this.skinMat.emissive.r + this.skinMat.emissive.g + this.skinMat.emissive.b > 0) {
      this.skinMat.emissive.setScalar(0);
      this.shirtMat.emissive.setScalar(0);
      this.pantsMat.emissive.setScalar(0);
    }
  }

  dispose() {
    this.root.removeFromParent();
  }
}
