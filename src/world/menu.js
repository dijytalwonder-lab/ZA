import * as THREE from 'three';
import { Stage } from './stage.js';
import { G } from '../core/state.js';
import { C, glow } from '../core/kit.js';
import { addLights, addGround, addBuildings, addSkyline, addLamps, addHoloAd, Traffic } from './cityKit.js';

/** 3D backdrop behind the main menu: glowing street, sun, and the boy in the foreground. */
export class MenuStage extends Stage {
  constructor() {
    super('menu');
    this.bounds = { minX: -9, maxX: 9, minZ: -13, maxZ: 13 };
    this.mapRange = 10;
  }

  async load() {
    this.skyScene(0x1a0a3d, 0.0095);
    addLights(this, { sky: 0x8a7cff, ground: 0x1a0a3a, hemi: 1.15, dirColor: 0xffa0e0, dir: 0.75, dirPos: [30, 20, -10] });
    const key = new THREE.PointLight(0xff2bd6, 9 * Math.PI, 14, 1.5);
    key.position.set(-5.5, 2.8, -5.4);
    this.scene.add(key);
    const rim = new THREE.PointLight(0x00f0ff, 8 * Math.PI, 14, 1.5);
    rim.position.set(-11, 2.0, -9);
    this.scene.add(rim);
    addGround(this, -140, 160);
    addSkyline(this, 20, 3, 160);
    this.buildings = addBuildings(this, { x0: -130, x1: 150, seed: 31, minH: 20, maxH: 60, collide: false });
    addLamps(this, -120, 150, 20);
    addHoloAd(this, 12, 6, -11.8, ['THE LAST', 'COMMUTE'], C.pink, 0, 4, 2.6);
    this.traffic = new Traffic(this, {
      lanes: [{ z: -5.25, dir: 1 }, { z: -1.75, dir: 1 }, { z: 1.75, dir: -1 }, { z: 5.25, dir: -1 }],
      range: [-140, 160], perLane: 4, seed: 4
    });
    for (let i = 0; i < 5; i++) {
      const g = glow(i % 2 ? C.pink : C.cyan, 10, 0.18);
      g.position.set(-6 + i * 12, 3, -2);
      this.scene.add(g);
    }
    this.sunGlow = glow(0xff4fa3, 60, 0.35);
    this.sunGlow.position.set(150, 12, -4);
    this.scene.add(this.sunGlow);
  }

  async enter() {
    const pl = G.player;
    this.scene.add(pl.rig.root);
    pl.reset(-8.4, -6.6, -0.5);
    pl.locked = true;
    pl.dressUp();
    pl.setWeapon('fists');
    pl.rig.p.speed = 0;
    G.camera.fov = 56;
    G.camera.updateProjectionMatrix();
    G.fx.setMotes(true, new THREE.Vector3(40, 14, 40));
    G.audio.setMood('menu');
    G.hud.fade(false);
    G.hud.show(false);
  }

  update(dt) {
    this.time += dt;
    const t = this.time;
    this.traffic.update(dt, 'green', 0);
    for (const u of this.updaters) u(dt, t);
    G.player.rig.update(dt);
    const cam = G.camera;
    cam.position.set(-13.2 + Math.sin(t * 0.21) * 0.7, 1.4 + Math.sin(t * 0.33) * 0.06, -3.6 + Math.cos(t * 0.17) * 0.45);
    cam.lookAt(6 + Math.sin(t * 0.13) * 0.8, 3.3, -4.6);
  }

  exit() {
    G.player.rig.root.removeFromParent();
    G.camera.fov = 62;
    G.camera.updateProjectionMatrix();
  }
}
