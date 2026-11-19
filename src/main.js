import './style.css';
import '@fontsource/orbitron/latin-500.css';
import '@fontsource/orbitron/latin-700.css';
import '@fontsource/orbitron/latin-900.css';
import '@fontsource/rajdhani/latin-500.css';
import '@fontsource/rajdhani/latin-600.css';
import '@fontsource/rajdhani/latin-700.css';
import '@fontsource/rajdhani/devanagari-700.css';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

import { G } from './core/state.js';
import { $ } from './core/util.js';
import { Save } from './core/save.js';
import { Input } from './core/input.js';
import { AudioSys } from './core/audio.js';
import { FX } from './core/fx.js';
import { CamRig } from './core/camera.js';
import { skyTexture } from './core/kit.js';
import { HUD } from './ui/hud.js';
import { UI } from './ui/menu.js';
import { MiniGames } from './ui/minigames.js';
import { Player } from './entities/player.js';
import { MenuStage } from './world/menu.js';
import { BedroomStage } from './world/bedroom.js';
import { CityStage } from './world/city.js';
import { BusStopStage } from './world/busstop.js';
import { BusStage } from './world/bus.js';
import { ApocStage } from './world/apoc.js';
import { MartStage } from './world/mart.js';
import { HavenStage } from './world/haven.js';

window.__gameBoot = true;
window.__GAME = { G, Save }; // debug / automated-test handle
window.__stage = 'game script started';
const STAGES = { menu: MenuStage, bedroom: BedroomStage, city: CityStage, busstop: BusStopStage, bus: BusStage, apoc: ApocStage, mart: MartStage, haven: HavenStage };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mark = (s) => { window.__stage = s; };

/* ------------ on-screen error log (helps when testing on a phone) ------------ */
function showError(msg) {
  const e = $('errlog');
  e.style.display = 'block';
  e.textContent = (e.textContent + '\n' + msg).slice(-1800);
  console.error(msg);
}
window.addEventListener('error', (ev) => showError('ERR: ' + ev.message + ' @' + String(ev.filename || '').split('/').pop() + ':' + ev.lineno));
window.addEventListener('unhandledrejection', (ev) => showError('PROMISE: ' + ((ev.reason && ev.reason.stack) || ev.reason)));
window.addEventListener('contextmenu', (e) => e.preventDefault());

function setLoad(p, txt) {
  $('loadfill').style.width = p + '%';
  if (txt) $('loadtxt').textContent = txt;
}

async function loadFonts() {
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load('900 40px Orbitron'),
        document.fonts.load('700 40px Orbitron'),
        document.fonts.load('700 40px Rajdhani'),
        document.fonts.load('700 40px Rajdhani', 'चायमिठाईमोबाइल')
      ]),
      sleep(2500)
    ]);
  } catch (e) { /* fall back to system fonts */ }
}

/* ------------ settings / rendering ------------ */
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  const pr = G.basePR * G.scale;
  G.renderer.setPixelRatio(pr);
  G.renderer.setSize(w, h, false);
  G.composer.setPixelRatio(pr);
  G.composer.setSize(w, h);
  G.camera.aspect = w / h;
  G.camera.updateProjectionMatrix();
}
function applySettings() {
  const s = G.settings;
  G.audio.setVolumes(s.music, s.sfx);
  const dpr = window.devicePixelRatio || 1;
  G.basePR = s.quality === 'low' ? 1 : s.quality === 'med' ? Math.min(dpr, 1.25) : Math.min(dpr, 1.75);
  G.useBloom = s.quality !== 'low';
  G.bloom.strength = s.quality === 'high' ? 0.95 : 0.78;
  $('fps').classList.toggle('hidden', !s.fps);
  resize();
}

/* ------------ game flow ------------ */
async function goto(key, opts = {}) {
  if (G.transitioning) return;
  G.transitioning = true;
  G.paused = false;
  $('pause').classList.add('hidden');
  $('death').classList.add('hidden');
  $('end').classList.add('hidden');
  G.hud.fade(true);
  await sleep(620);
  try {
    if (G.stage) {
      G.stage.exit();
      G.fx.detach();
      G.stage.dispose();
      G.stage = null;
    }
    G.mg.abort();
    G.hud.clearSay();
    G.hud.setPrompt(null);
    G.hud.setWaypoint(null);
    G.hud.redAlert(false);
    G.hud.setStealth(null);
    G.hud.setObjectives('', []);
    G.timeScale = 1;
    G.hitstop = 0;
    G.audio.stopAll();
    G.input.setEnabled(true);
    G.input.reset();
    G.camRig.endCut();
    if (key === 'menu') G.ui.showMenu(); else G.ui.hideMenu();
    mark('goto ' + key + ': building scene');
    const stage = new STAGES[key]();
    await stage.load();
    mark('goto ' + key + ': scene built, entering');
    G.stage = stage;
    G.fx.attach(stage.scene);
    G.renderPass.scene = stage.scene;
    G.playing = key !== 'menu';
    G.hud.show(G.playing);
    G.lastTransition = performance.now();
    Promise.resolve(stage.enter(opts)).catch((e) => showError('ENTER: ' + (e && e.stack || e)));
  } catch (e) {
    showError('LOAD ' + key + ': ' + (e && e.stack || e));
  }
  G.transitioning = false;
  setTimeout(() => { if (!G.transitioning) G.hud.fade(false); }, 250);
}

G.goto = goto;
G.menu = () => goto('menu');
G.newGame = () => {
  Save.wipe();
  G.cp = null;
  G.player.resetInventory();
  goto('bedroom', { fresh: true });
};
G.continueGame = () => {
  const s = Save.load();
  if (!s || !s.stage) return;
  G.player.resetInventory();
  goto(s.stage, { cp: s.cp || 0, restore: s.player, fresh: s.stage === 'bedroom', got: s.got, at: s.at });
};
G.startChapter = (n) => {
  const pl = G.player;
  if (n === 1) { pl.resetInventory(); goto('bedroom', { fresh: true }); return; }
  pl.resetInventory();
  pl.giveKit();
  if (n === 2) goto('city');
  else if (n === 3) goto('busstop');
  else if (n === 4) goto('bus', { cp: 1 });
  else if (n === 5) { pl.inv.rod = true; pl.inv.medkit = 1; goto('apoc', { cp: 0 }); }
  else if (n === 6) {
    pl.inv.rod = true; pl.inv.pistol = true; pl.inv.ammo = 24; pl.inv.shells = 0; pl.inv.medkit = 1; pl.inv.bottle = 2;
    goto('mart', { cp: 0 });
  } else if (n === 7) {
    pl.inv.rod = true; pl.inv.pistol = true; pl.inv.shotgun = true; pl.inv.ammo = 18; pl.inv.shells = 6; pl.inv.medkit = 1; pl.inv.food = 1; pl.inv.bottle = 2; pl.inv.batteries = 4;
    goto('haven', { cp: 0 });
  }
};
G.nextChapter = (n) => {
  if (n === 2) goto('city');
  else if (n === 3) goto('busstop');
  else if (n === '3b') goto('bus', { cp: 0 });
  else if (n === 5) goto('apoc', { cp: 0 });
  else if (n === 6) goto('mart', { cp: 0 });
  else if (n === 7) goto('haven', { cp: 0 });
};
G.retry = () => {
  const c = G.cp || Save.load();
  if (!c || !c.stage) { goto('menu'); return; }
  G.player.resetInventory();
  goto(c.stage, { cp: c.cp || 0, restore: c.player, fresh: c.stage === 'bedroom', got: c.got, at: c.at });
};
G.saveCheckpoint = (d) => {
  const prev = Save.load() || {};
  const rec = { ...d, player: G.player.serialize(), maxChapter: Math.max(prev.maxChapter || 1, d.chapter || 1) };
  G.cp = rec;
  Save.store(rec);
};
G.finishChapters = (n) => {
  Save.store({ cleared: n });
  const nextStage = { 4: 'apoc', 5: 'mart', 6: 'haven' }[n];
  if (nextStage) {
    // "Continue" after clearing a chapter starts the next one with the gear you have now
    const rec = { chapter: n + 1, stage: nextStage, cp: 0, got: null, at: null, player: G.player.serialize() };
    G.cp = rec;
    Save.store(rec);
  }
  G.playing = false;
  G.hud.show(false);
  G.input.setEnabled(false);
  G.hud.fade(false);
  G.ui.showEnd(n);
};

/* ------------ main loop ------------ */
let last = performance.now();
let accT = 0, accN = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const raw = Math.min(0.05, (now - last) / 1000);
  last = now;
  const st = G.stage;
  if (!st) return;
  if (!G.transitioning) {
    let dt = raw;
    if (G.hitstop > 0) { G.hitstop -= raw; dt *= 0.05; }
    dt *= G.timeScale;
    if (!G.paused) {
      try {
        if (G.playing) {
          G.input.update();
          if (G.input.consume('pause')) {
            G.ui.openPause();
          } else {
            G.player.update(dt, st);
            G.camRig.update(dt, G.player.pos, raw);
            st.update(dt);
            G.fx.update(dt, G.camera, G.player.pos);
            G.hud.update(raw);
          }
        } else {
          st.update(dt);
          G.fx.update(dt, G.camera, G.camera.position);
        }
      } catch (e) {
        showError('UPDATE: ' + (e && e.stack || e));
      }
      // adaptive resolution
      if (G.playing && now - (G.lastTransition || 0) > 3500) {
        accT += raw; accN++;
        if (accN >= 90) {
          const avg = accT / accN;
          accT = 0; accN = 0;
          if (avg > 0.037 && G.scale > 0.6) { G.scale = Math.max(0.6, G.scale - 0.15); resize(); }
          else if (avg < 0.019 && G.scale < 1) { G.scale = Math.min(1, G.scale + 0.1); resize(); }
        }
      }
    }
  }
  if (G.useBloom) {
    G.renderPass.scene = st.scene;
    G.composer.render(raw);
  } else {
    G.renderer.render(st.scene, G.camera);
  }
}

/* ------------ boot ------------ */
async function boot() {
  mark('boot: start');
  setLoad(8, 'BOOTING CITY GRID...');
  await sleep(30);
  mark('boot: settings');
  G.settings = Save.loadSettings();
  G.scale = 1;
  G.basePR = 1;
  G.timeScale = 1;
  mark('boot: creating WebGL renderer');
  const renderer = new THREE.WebGLRenderer({ canvas: $('c'), antialias: false, powerPreference: 'high-performance', stencil: false });
  renderer.setClearColor(0x05010f);
  renderer.toneMapping = THREE.NoToneMapping;
  G.renderer = renderer;
  G.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 500);
  setLoad(20, 'WARMING UP THE CITY...');
  mark('boot: fonts');
  await loadFonts();
  setLoad(40, 'PAINTING THE SKY...');
  await sleep(30);
  mark('boot: sky + environment map');
  const sky = skyTexture();
  const pm = new THREE.PMREMGenerator(renderer);
  G.assets = { sky, env: pm.fromEquirectangular(sky).texture };
  pm.dispose();
  mark('boot: post-processing');
  G.composer = new EffectComposer(renderer);
  G.renderPass = new RenderPass(new THREE.Scene(), G.camera);
  G.composer.addPass(G.renderPass);
  G.bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.8, 0.6, 0.82);
  G.composer.addPass(G.bloom);
  G.composer.addPass(new OutputPass());
  setLoad(60, 'LINKING CONTROLS...');
  await sleep(30);
  mark('boot: controls / hud / audio / player');
  G.input = new Input();
  G.audio = new AudioSys();
  G.hud = new HUD();
  G.fx = new FX();
  G.mg = new MiniGames();
  G.camRig = new CamRig(G.camera);
  G.ui = new UI();
  G.player = new Player(Save.loadOutfit());
  G.applySettings = applySettings;
  applySettings();
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 250));
  for (const ev of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(ev, () => G.audio.unlock(), { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (G.playing && !G.paused && !G.transitioning) G.ui.openPause();
      if (G.audio.ctx) G.audio.ctx.suspend();
    } else if (G.audio.ctx) G.audio.ctx.resume();
  });
  setLoad(85, 'LOADING CITY...');
  await sleep(30);
  mark('boot: building menu city');
  requestAnimationFrame(frame);
  await goto('menu');
  mark('boot: ready');
  window.__gameReady = true;
  setLoad(100, 'READY');
  $('loading').classList.add('done');
  setTimeout(() => $('loading').remove(), 800);
}

boot().catch((e) => showError('BOOT @ ' + window.__stage + ': ' + (e && e.stack || e)));
