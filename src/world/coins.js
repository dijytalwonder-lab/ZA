import * as THREE from 'three';
import { G } from '../core/state.js';
import { C, basic } from '../core/kit.js';

/** Instanced spinning glowing coins. */
export class CoinField {
  constructor(st, pts) {
    this.st = st;
    this.pts = pts.map((p) => ({ ...p, got: false }));
    const geo = new THREE.CylinderGeometry(0.24, 0.24, 0.06, 14);
    geo.rotateX(Math.PI / 2);
    this.mesh = new THREE.InstancedMesh(geo, basic(C.yellow), Math.max(1, pts.length));
    this.mesh.frustumCulled = false;
    st.scene.add(this.mesh);
    this.dummy = new THREE.Object3D();
    this.t = 0;
    this.total = pts.length;
    this.got = 0;
  }
  get left() { return this.total - this.got; }

  update(dt, pl) {
    this.t += dt;
    const d = this.dummy;
    for (let i = 0; i < this.pts.length; i++) {
      const p = this.pts[i];
      if (p.got) {
        d.scale.set(0, 0, 0);
        d.position.set(0, -50, 0);
      } else {
        d.position.set(p.x, p.y + Math.sin(this.t * 2 + i) * 0.08, p.z);
        d.rotation.y = this.t * 2.6 + i;
        d.scale.set(1, 1, 1);
        const dx = pl.pos.x - p.x, dz = pl.pos.z - p.z;
        if (dx * dx + dz * dz < 0.95 * 0.95 && Math.abs(pl.pos.y + 0.9 - p.y) < 1.5) this._collect(p);
      }
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  _collect(p) {
    p.got = true;
    this.got++;
    const v = p.v || 5;
    G.player.inv.coins += v;
    G.audio.sfx('coin');
    G.fx.burst(p.x, p.y, p.z, C.yellow, 10, 2.5, 0.5, 2);
    G.fx.text(new THREE.Vector3(p.x, p.y + 0.4, p.z), '+' + v, 'gold');
    if (this.onCollect) this.onCollect(this);
  }
}
