import * as THREE from 'three';
import { clamp, damp } from './util.js';
import { G } from './state.js';

const _t = new THREE.Vector3();
const _d = new THREE.Vector3();

export class CamRig {
  constructor(camera) {
    this.cam = camera;
    this.yaw = 0;
    this.pitch = 0.4;
    this.pos = new THREE.Vector3(0, 3, 6);
    this.look = new THREE.Vector3();
    this.cfg = { dist: 5, height: 1.45, minPitch: 0.06, maxPitch: 1.15, bounds: null, block: null, fov: 62 };
    this.shakeA = 0;
    this.shakeT = 0;
    this.cut = null; // {pos, look, k}
    this.fovCur = 62;
    this.snap = true;
  }
  configure(cfg) {
    Object.assign(this.cfg, cfg);
    this.snap = true;
  }
  shake(a, d) {
    if (a >= this.shakeA) { this.shakeA = a; this.shakeT = d; this.shakeD = d; }
  }
  /** snap=true jumps straight to the shot (used right after a scene change, so the camera never swoops in from the previous scene). */
  cutscene(pos, look, k = 3, snap = false) {
    if (!this.cut) {
      this.cut = { pos: pos.clone(), look: look.clone(), k, first: !snap };
      if (snap) { this.pos.copy(pos); this.look.copy(look); this.cam.position.copy(pos); }
    }
    else { this.cut.pos.copy(pos); this.cut.look.copy(look); this.cut.k = k; }
  }
  endCut() {
    this.cut = null;
    this.snap = false;
  }

  update(dt, target, rawDt = dt) {
    const c = this.cfg;
    const cam = this.cam;
    if (!this.cut) {
      const l = G.input.takeLook();
      const sens = G.settings.sens * 0.0052;
      this.yaw -= l.x * sens;
      this.pitch += l.y * sens * 0.8 * (G.settings.invertY ? -1 : 1);
      this.pitch = clamp(this.pitch, c.minPitch, c.maxPitch);
      _t.set(target.x, target.y + c.height, target.z);
      const h = Math.cos(this.pitch);
      _d.set(Math.sin(this.yaw) * h, Math.sin(this.pitch), Math.cos(this.yaw) * h);
      // pull in if the view is blocked
      let k = 1;
      const tryPos = (kk) => {
        _d.set(Math.sin(this.yaw) * h * c.dist * kk, Math.sin(this.pitch) * c.dist * kk, Math.cos(this.yaw) * h * c.dist * kk);
        return new THREE.Vector3().copy(_t).add(_d);
      };
      let want = tryPos(1);
      if (c.bounds) {
        const b = c.bounds;
        want.x = clamp(want.x, b.minX, b.maxX);
        want.z = clamp(want.z, b.minZ, b.maxZ);
        want.y = clamp(want.y, b.minY ?? 0.4, b.maxY ?? 99);
      } else {
        want.y = Math.max(want.y, 0.35);
      }
      if (c.block) {
        while (k > 0.25 && c.block(want)) {
          k -= 0.1;
          want = tryPos(k);
          if (want.y < 0.35) want.y = 0.35;
        }
      }
      if (this.snap) { this.pos.copy(want); this.snap = false; }
      else this.pos.set(damp(this.pos.x, want.x, 22, rawDt), damp(this.pos.y, want.y, 22, rawDt), damp(this.pos.z, want.z, 22, rawDt));
      this.look.lerp(_t, 1 - Math.exp(-30 * rawDt));
      cam.position.copy(this.pos);
    } else {
      const u = this.cut;
      if (u.first) { this.pos.copy(cam.position); this.look.copy(this.look); u.first = false; }
      this.pos.set(damp(this.pos.x, u.pos.x, u.k, rawDt), damp(this.pos.y, u.pos.y, u.k, rawDt), damp(this.pos.z, u.pos.z, u.k, rawDt));
      this.look.set(damp(this.look.x, u.look.x, u.k, rawDt), damp(this.look.y, u.look.y, u.k, rawDt), damp(this.look.z, u.look.z, u.k, rawDt));
      cam.position.copy(this.pos);
    }
    if (this.shakeT > 0) {
      this.shakeT -= rawDt;
      const f = this.shakeA * clamp(this.shakeT / (this.shakeD || 0.3), 0, 1);
      cam.position.x += (Math.random() - 0.5) * f;
      cam.position.y += (Math.random() - 0.5) * f;
      cam.position.z += (Math.random() - 0.5) * f;
      if (this.shakeT <= 0) this.shakeA = 0;
    }
    cam.lookAt(this.look);
    const fov = c.fov + (G.player && G.player.sprinting ? 6 : 0);
    this.fovCur = damp(this.fovCur, fov, 6, rawDt);
    if (Math.abs(cam.fov - this.fovCur) > 0.05) {
      cam.fov = this.fovCur;
      cam.updateProjectionMatrix();
    }
  }
}
