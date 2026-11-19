const { launch, sleep, check, summary } = require('./lib');

const NAV = `(() => {
  const s = window.__GAME.G.stage;
  const R = 0.34, st = 0.25, X0 = -24, Z0 = -17.5;
  const nx = Math.round(48 / st) + 1, nz = Math.round(35 / st) + 1;
  const blocked = (x, z, r = R) => { for (const c of s.colliders) { if (c.off) continue; const cx = Math.max(c.minX, Math.min(x, c.maxX)), cz = Math.max(c.minZ, Math.min(z, c.maxZ)); if ((x - cx) * (x - cx) + (z - cz) * (z - cz) < r * r) return true; } return false; };
  const walk = new Uint8Array(nx * nz);
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) walk[i * nz + j] = blocked(X0 + i * st, Z0 + j * st) ? 0 : 1;
  const cell = (x, z) => [Math.round((x - X0) / st), Math.round((z - Z0) / st)];
  const reach = new Uint8Array(nx * nz);
  const [sx, sz] = cell(0, -14.2);
  const q = [[sx, sz]]; reach[sx * nz + sz] = 1;
  while (q.length) { const [i, j] = q.pop(); for (const [di, dj] of [[1,0],[-1,0],[0,1],[0,-1]]) { const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= nx || b >= nz) continue; const k = a * nz + b; if (walk[k] && !reach[k]) { reach[k] = 1; q.push([a, b]); } } }
  window.__nav = {
    blocked,
    reachable: (x, z) => { const [i, j] = cell(x, z); return i >= 0 && j >= 0 && i < nx && j < nz && !!reach[i * nz + j]; },
    near: (x, z, r) => { for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) { if (!reach[i * nz + j]) continue; const px = X0 + i * st, pz = Z0 + j * st; if ((px - x) * (px - x) + (pz - z) * (pz - z) <= r * r) return true; } return false; }
  };
  return true;
})()`;

(async () => {
  console.log('T8: Chapter 6 (City Mart): layout, stealth, takedown, distraction throw, supplies, alarm escape, dock');
  const t = await launch({ settings: { quality: 'low' } });
  const { page } = t;
  const G = (fn, ...a) => t.ev(fn, ...a);
  const tp = (x, z) => G((x, z) => { const p = window.__GAME.G.player; p.pos.set(x, 0, z); p.vx = p.vz = 0; }, x, z);
  const killAll = () => G(() => { const s = window.__GAME.G.stage; for (const e of s.enemies) if (e.alive) e.takeHit(9999, 1, 0, 0, {}); });
  const fresh = async () => { await G(() => window.__GAME.G.startChapter(6)); await t.waitStage('mart', 30000); await sleep(900); };
  const prompt = () => G(() => window.__GAME.G.hud.promptLabel);
  const fp = () => t.ev(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 > 2500) res(n / 2.5); else requestAnimationFrame(f); }; requestAnimationFrame(f); }));

  // ================= A. load + layout =================
  await page.click('#m-story'); await sleep(200);
  await t.ev(() => document.querySelectorAll('#menu-sub .chapter .go')[5].click());
  await t.waitStage('mart', 30000);
  await sleep(1500);
  await t.shot('80_mart_start');
  const info = await G(() => { const s = window.__GAME.G.stage; const p = window.__GAME.G.player; return { st: s.stealthy, lob: s.lobThrow, en: s.enemies.length, loot: s.loot.length, hides: s.hides.length, crates: s.crates.length, sups: s.sups.length, td: !!s.takedownIt, npcs: s.npcs.length, pistol: p.inv.pistol, ammo: p.inv.ammo, bottle: p.inv.bottle, med: p.inv.medkit }; });
  check('Chapter 6 JUMP IN loads the City Mart', (await t.stage()) === 'mart');
  check('stealth stage: 11 zombies, 12 loot, 4 lockers, 6 crates, takedown on', info.st && info.lob && info.en === 11 && info.loot === 12 && info.hides === 4 && info.crates === 6 && info.td, JSON.stringify(info));
  check('jump-in kit: pistol + 24 ammo + 2 bottles + medkit', info.pistol && info.ammo === 24 && info.bottle === 2 && info.med === 1, JSON.stringify(info));
  check('supply objectives (4) listed', (await G(() => document.querySelectorAll('#objlist li').length)) === 4);
  check('stealth indicator shows UNSEEN', (await G(() => document.getElementById('stealth').textContent)).includes('UNSEEN'));
  check('chapter tag', (await G(() => document.getElementById('chapterTag').textContent)).includes('CHAPTER 6'));
  const f0 = await fp();
  check('City Mart >= 20 fps (low)', f0 >= 20, f0.toFixed(1) + ' fps');

  // walkability / reachability of everything the player needs
  await G(NAV);
  const lay = await G(() => {
    const s = window.__GAME.G.stage, n = window.__nav, bad = [];
    const need = (name, ok) => { if (!ok) bad.push(name); };
    need('spawn', n.reachable(0, -14.2));
    for (const it of s.interactables) {
      if (it === s.takedownIt || it === s.lockIt) continue;
      need('interactable@' + it.x.toFixed(1) + ',' + it.z.toFixed(1) + ' ' + (typeof it.label === 'function' ? it.label() : it.label), n.near(it.x, it.z, it.r - 0.2));
    }
    for (const l of s.loot) need('loot ' + l.type + '@' + l.x + ',' + l.z, n.near(l.x, l.z, 0.9) && !n.blocked(l.x, l.z, 0.3));
    for (const e of s.enemies) {
      need('zombie ' + e.type + '@' + e.pos.x + ',' + e.pos.z + ' not in a collider', !n.blocked(e.pos.x, e.pos.z, 0.38));
      if (e.patrol) for (const w of e.patrol) need('patrol point ' + w, !n.blocked(w[0], w[1], 0.38) && n.reachable(w[0], w[1]));
    }
    for (const sp of [[-13.5, 9], [13.5, 9], [-10.8, 14.6], [9.5, 14.5], [0, 6], [0, 11]]) need('checkpoint spawn ' + sp, n.reachable(sp[0], sp[1]));
    return bad;
  });
  check('every pickup/interactable/loot/zombie/patrol point/retry spawn is reachable', lay.length === 0, lay.join(' | ').slice(0, 900));
  // the locker is behind the security door
  const lk = await G(() => { const s = window.__GAME.G.stage; const before = window.__nav.near(s.lockIt.x, s.lockIt.z, s.lockIt.r - 0.2); s.doorCol.off = true; return before; });
  await G(NAV);
  const lk2 = await G(() => { const s = window.__GAME.G.stage; const r = window.__nav.near(s.lockIt.x, s.lockIt.z, s.lockIt.r - 0.2); s.doorCol.off = false; return r; });
  check('weapons locker is sealed behind the door, reachable once it is open', lk === false && lk2 === true, `${lk} -> ${lk2}`);

  // line of sight rules
  const los = await G(() => { const s = window.__GAME.G.stage; return [
    s.hasLOS(-22, -3.4, -14, -3.4, 1.6), s.hasLOS(-22, -3.4, -14, -3.4, 0.9),   // tall shelf: blocks both
    s.hasLOS(-10.5, -13, -10.5, -6.5, 1.6), s.hasLOS(-10.5, -13, -10.5, -6.5, 0.9) // low counter: only blocks crouching
  ].join(); });
  check('tall shelves block sight; low counters only hide a crouching player', los === 'false,false,true,false', los);

  // ================= B. shutter + detection =================
  await page.waitForFunction(() => !window.__GAME.G.player.locked, { timeout: 8000 });
  await t.key('KeyW', 1300); await sleep(300);
  check('the shutter slams shut behind the player', await G(() => window.__GAME.G.stage.shutterDown === true && window.__GAME.G.stage.shutterCol.off === false));
  check('entry hint appears (dialogue)', await G(() => !document.getElementById('dialogue').classList.contains('hidden')));
  await t.shot('81_after_shutter');

  const hold = (idx, face, ms) => G((idx, face, ms) => new Promise((res) => {
    const g = window.__GAME.G, s = g.stage, z = s.enemies[idx], p = g.player;
    z.patrol = null; z.still = false;
    const iv = setInterval(() => {
      z.wp = null; z.wpT = 5; z.patrol = null; z.still = false;
      const a = Math.atan2(p.pos.x - z.pos.x, p.pos.z - z.pos.z);
      z.yaw = face ? a : a + Math.PI;
    }, 40);
    setTimeout(() => { clearInterval(iv); res({ aware: z.aware, alert: +z.alert.toFixed(2), state: z.state, dist: +Math.hypot(p.pos.x - z.pos.x, p.pos.z - z.pos.z).toFixed(1) }); }, ms);
  }), idx, face, ms);
  await fresh();
  await G(() => { const g = window.__GAME.G, z = g.stage.enemies[8]; z.pos.set(0, 0, 1.5); g.player.pos.set(0, 0, -6.5); });
  await t.key('KeyC', 40); await sleep(200);
  check('crouched', await G(() => window.__GAME.G.player.crouch === true));
  const r1 = await hold(8, true, 3000);
  check('crouched 8 m in front of a zombie: NOT spotted', !r1.aware && r1.alert < 1, JSON.stringify(r1));
  await t.key('KeyC', 40); await sleep(200);
  const r2 = await hold(8, true, 3200);
  check('standing 8 m in front of it: SPOTTED', r2.aware && r2.state !== 'idle', JSON.stringify(r2));
  await t.shot('82_spotted');
  await killAll(); await sleep(300);

  // patrol walks its route
  await fresh();
  const p0 = await G(() => { const z = window.__GAME.G.stage.enemies[2]; return [z.pos.x, z.pos.z]; });
  await sleep(6000);
  const p1 = await G(() => { const z = window.__GAME.G.stage.enemies[2]; return [z.pos.x, z.pos.z, z.state]; });
  check('patrolling zombie walks along its route', Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) > 1.2 && p1[2] === 'idle', `${p0.map((v) => v.toFixed(1))} -> ${p1.map((v) => (typeof v === 'number' ? v.toFixed(1) : v))}`);

  // ================= C. silent takedown =================
  await fresh();
  await G(() => { const g = window.__GAME.G, z = g.stage.tutZ; z.pos.set(-6.5, 0, -10.2); g.player.pos.set(-8.0, 0, -10.2); }); // in FRONT of the zombie (it faces west)
  await t.key('KeyC', 40); await sleep(120);
  const frontPrompt = await prompt();
  check('no takedown prompt from the front', frontPrompt !== 'SILENT TAKEDOWN', String(frontPrompt));
  await fresh();
  await t.key('KeyC', 40); await sleep(100);
  await G(() => { const g = window.__GAME.G, z = g.stage.tutZ; z.pos.set(-6.5, 0, -10.2); g.player.pos.set(-5.1, 0, -10.2); g.player.yaw = -Math.PI / 2; }); // BEHIND it
  await sleep(500);
  const bp = await prompt();
  const tz = await G(() => { const z = window.__GAME.G.stage.tutZ; return { aware: z.aware, alert: +z.alert.toFixed(2) }; });
  check('creeping up behind an unaware zombie: not noticed, SILENT TAKEDOWN prompt', bp === 'SILENT TAKEDOWN' && !tz.aware, `${bp} ${JSON.stringify(tz)}`);
  await t.shot('83_takedown_prompt');
  const idle0 = await G(() => window.__GAME.G.stage.enemies[1].state);
  await t.key('KeyE'); await sleep(500);
  const td = await G(() => { const s = window.__GAME.G.stage; return { dead: !s.tutZ.alive, n: s.takedowns, other: s.enemies[1].state, aware: s.enemies.some((e) => e.alive && e.aware) }; });
  check('takedown kills it silently (nobody else reacts)', td.dead && td.n === 1 && td.other === 'idle' && !td.aware, JSON.stringify(td));

  // ================= D. distraction throw =================
  await fresh();
  await G(() => {
    const g = window.__GAME.G, s = g.stage, z = s.enemies[8];
    z.patrol = null; z.still = false; z.pos.set(0, 0, 4); z.wp = null; z.wpT = 99; z.state = 'idle'; z.yaw = Math.PI;
    g.player.pos.set(0, 0, -8); g.camRig.yaw = Math.PI; g.camRig.pitch = 0.34;
  });
  await t.key('KeyC', 40); await sleep(250);
  const spot = await G(() => { const s = window.__GAME.G.stage; const sp = s.throwSpot(window.__GAME.G.player); return { x: sp.x, z: sp.z, vis: s.throwMark.visible, mx: s.throwMark.position.x, mz: s.throwMark.position.z }; });
  check('throw marker shows where the bottle lands (camera aim, ~12 m ahead)', spot.vis && Math.abs(spot.x) < 0.2 && spot.z > 3 && spot.z < 5 && Math.abs(spot.mz - spot.z) < 0.3, JSON.stringify(spot));
  await G(() => { window.__GAME.G.camRig.pitch = 1.0; });
  await sleep(150);
  const spot2 = await G(() => { const sp = window.__GAME.G.stage.throwSpot(window.__GAME.G.player); return sp.z - window.__GAME.G.player.pos.z; });
  check('looking down throws closer', spot2 < 7.5 && spot2 > 3, spot2.toFixed(1) + ' m');
  await G(() => { window.__GAME.G.camRig.pitch = 0.34; window.__GAME.G.stage.enemies[8].pos.set(3, 0, 5); }); // listener to the side of the landing spot
  const hp8 = await G(() => window.__GAME.G.stage.enemies[8].hp);
  await t.key('KeyK', 40); await sleep(1500);
  const th = await G(() => { const s = window.__GAME.G.stage, z = s.enemies[8], p = window.__GAME.G.player; return { bottles: p.inv.bottle, state: z.state, hp: z.hp, aware: z.aware, ix: z.invest ? +z.invest.x.toFixed(1) : null, iz: z.invest ? +z.invest.z.toFixed(1) : null, proj: s.projectiles.length }; });
  check('thrown bottle: stock -1, zombie goes to INVESTIGATE the noise', th.bottles === 1 && (th.state === 'investigate' || th.state === 'idle') && th.iz !== null && Math.abs(th.iz - 3.76) < 1.5, JSON.stringify(th));
  check('distraction hurts nobody and does not alert them', th.hp === hp8 && !th.aware, JSON.stringify(th));
  await t.shot('84_throw');
  await G(() => { window.__GAME.G.player.inv.bottle = 0; }); await sleep(200);
  check('marker hides when out of bottles', await G(() => window.__GAME.G.stage.throwMark.visible === false));

  // ================= E. hiding in a locker =================
  await fresh();
  await killAll(); await sleep(200);
  await tp(-21.0, -9.5); await sleep(300);
  check('HIDE (LOCKER) prompt', (await prompt()) === 'HIDE (LOCKER)', String(await prompt()));
  await t.key('KeyE'); await sleep(700);
  check('player hides in the locker', await G(() => window.__GAME.G.player.hidden === true && window.__GAME.G.player.rig.root.visible === false));
  check('HUD says HIDDEN', (await G(() => document.getElementById('stealth').textContent)).includes('HIDDEN'));
  await t.key('KeyD', 250); await sleep(300);
  check('moving leaves the locker', await G(() => { const p = window.__GAME.G.player; return p.hidden === false && p.rig.root.visible === true; }));

  // ================= F. supplies -> keycard -> door -> weapons -> alarm =================
  await fresh();
  await killAll(); await sleep(300);
  const sup = [
    { id: 'food', pos: [-18, 8.5], label: 'GRAB FOOD', chk: (i) => i.food >= 3 },
    { id: 'water', pos: [18, 8.5], label: 'GRAB WATER', chk: (i) => i.bottle >= 5 },
    { id: 'med', pos: [-21.5, 14.0], label: 'GRAB MEDICINE', chk: (i) => i.medkit >= 3 },
    { id: 'bat', pos: [18.5, 14.0], label: 'GRAB BATTERIES', chk: (i) => i.batteries === 4 }
  ];
  for (const sp of sup) {
    await tp(sp.pos[0], sp.pos[1]); await sleep(350);
    const lbl = await prompt();
    await t.key('KeyE'); await sleep(450);
    const st = await G((id) => { const g = window.__GAME.G, p = g.player; return { inv: { ...p.inv }, done: g.hud.objDone(id), cp: g.cp && g.cp.got && g.cp.got[id], at: g.cp && g.cp.at }; }, sp.id);
    check(`${sp.id}: prompt "${sp.label}", item added, objective done, checkpoint saved`, lbl === sp.label && sp.chk(st.inv) && (st.done || sp.id === 'bat') && st.cp === true && Array.isArray(st.at), `${lbl} ${JSON.stringify({ f: st.inv.food, b: st.inv.bottle, m: st.inv.medkit, bat: st.inv.batteries, done: st.done, cp: st.cp })}`);
  }
  await sleep(500);
  check('all 4 supplies -> phase 2 objectives (keycard, locker, dock)', (await G(() => document.querySelectorAll('#objlist li').length)) === 3 && (await G(() => document.getElementById('objlist').textContent.includes('keycard'))));
  await t.shot('85_supplies_done');
  // security door is locked without the keycard
  await tp(0, 11.2); await sleep(350);
  check('door prompt: LOCKED - KEYCARD NEEDED', (await prompt()) === 'LOCKED - KEYCARD NEEDED', String(await prompt()));
  await t.key('KeyE'); await sleep(300);
  check('door stays locked without the keycard', await G(() => window.__GAME.G.stage.doorOpen === false));
  await tp(0, 6.4); await sleep(350);
  check('TAKE SECURITY KEYCARD prompt at the customer desk', (await prompt()) === 'TAKE SECURITY KEYCARD', String(await prompt()));
  await t.key('KeyE'); await sleep(400);
  check('keycard taken', await G(() => window.__GAME.G.player.inv.keycard === true && window.__GAME.G.hud.objDone('key')));
  await tp(0, 11.2); await sleep(350);
  check('door prompt: OPEN SECURITY DOOR', (await prompt()) === 'OPEN SECURITY DOOR', String(await prompt()));
  await t.key('KeyE'); await sleep(1000);
  check('security door opens', await G(() => window.__GAME.G.stage.doorOpen === true && window.__GAME.G.stage.doorCol.off === true));
  await tp(0, 15.0); await sleep(350);
  check('OPEN WEAPONS LOCKER prompt', (await prompt()) === 'OPEN WEAPONS LOCKER', String(await prompt()));
  await t.shot('86_locker');
  const sg0 = await G(() => { const p = window.__GAME.G.player; return { shells: p.inv.shells, ammo: p.inv.ammo }; });
  await t.key('KeyE'); await sleep(700);
  const al = await G(() => { const g = window.__GAME.G, s = g.stage, p = g.player; return { phase: s.phase, shotgun: p.inv.shotgun, w: p.wKey, shells: p.inv.shells, ammo: p.inv.ammo, red: document.getElementById('fx-red').classList.contains('on'), obj: document.getElementById('objlist').textContent, cpweap: g.cp.got.weap }; });
  check('locker gives shotgun + ammo and triggers the ALARM', al.phase === 'escape' && al.shotgun && al.w === 'shotgun' && al.shells >= sg0.shells + 10 && al.ammo >= sg0.ammo + 20 && al.red && al.cpweap === true, JSON.stringify(al));
  check('escape objectives shown', al.obj.includes('loading dock') && al.obj.includes('batteries'), al.obj);
  await sleep(7500);
  await t.shot('87_escape_horde');
  const hz = await G(() => { const s = window.__GAME.G.stage; const live = s.enemies.filter((e) => e.alive); return { n: live.length, aware: live.filter((e) => e.aware).length, brute: live.some((e) => e.type === 'brute'), spitter: live.filter((e) => e.type === 'spitter').length, runners: live.filter((e) => e.type === 'runner').length, shutterOff: s.shutterCol.off, hide: s.interactables.filter((i) => !i.removed && i.label === 'HIDE (LOCKER)' && i.enabled()).length }; });
  check('the horde breaks in (runners, walkers, spitter, brute), shop zombies investigate the alarm', hz.aware >= 6 && hz.brute && hz.runners >= 2 && hz.spitter >= 1 && hz.shutterOff, JSON.stringify(hz));
  check('no hiding during the escape', hz.hide === 0, JSON.stringify(hz));

  // ================= G. death -> checkpoint restore keeps progress =================
  await G(() => { window.__GAME.G.player.damage(999, 0, 0); });
  await page.waitForFunction(() => !document.getElementById('death').classList.contains('hidden'), { timeout: 8000 });
  await t.shot('88_death');
  await page.click('#d-retry'); await t.waitStage('mart', 30000); await sleep(1800);
  const rs = await G(() => { const g = window.__GAME.G, s = g.stage, p = g.player; return { got: s.got, phase: s.phase, w: p.wKey, shotgun: p.inv.shotgun, key: p.inv.keycard, doorOpen: s.doorOpen, x: +p.pos.x.toFixed(1), z: +p.pos.z.toFixed(1), supLeft: s.interactables.filter((i) => !i.removed && /^GRAB/.test(String(i.label))).length }; });
  check('retry restores the escape checkpoint (all supplies kept, weapons, door open, alarm again)', rs.got.food && rs.got.water && rs.got.med && rs.got.bat && rs.got.key && rs.got.weap && rs.phase === 'escape' && rs.w === 'shotgun' && rs.doorOpen && rs.supLeft === 0 && Math.abs(rs.z - 11) < 1, JSON.stringify(rs));

  // ================= H. dock: install the batteries =================
  await sleep(6500);
  await killAll(); await sleep(300);
  await tp(22.4, -11.6); await sleep(400);
  check('INSTALL BATTERIES prompt at the dock panel', (await prompt()) === 'INSTALL BATTERIES (TAP FAST!)', String(await prompt()));
  await t.key('KeyE'); await sleep(500);
  check('battery mini-game opens in slow motion', await G(() => !document.getElementById('mg').classList.contains('hidden') && window.__GAME.G.timeScale < 0.5));
  await t.shot('89_dock_qte');
  await page.waitForFunction(() => document.getElementById('mg').classList.contains('hidden'), { timeout: 8000 });
  check('too slow: can try again', await G(() => window.__GAME.G.stage.qte === false && window.__GAME.G.stage.finished === false && window.__GAME.G.timeScale === 1));
  await sleep(500);
  await killAll();
  await t.key('KeyE'); await sleep(500);
  for (let i = 0; i < 9; i++) { await page.click('#mg .mgbtn.big'); await sleep(60); }
  await sleep(600);
  check('batteries installed: dock door opens', await G(() => window.__GAME.G.stage.finished === true && window.__GAME.G.stage.dockCol.off === true));
  await t.shot('90_dock_open');
  await page.waitForFunction(() => !document.getElementById('end').classList.contains('hidden'), { timeout: 20000 });
  check('end screen: CHAPTER 6 COMPLETE', (await G(() => document.getElementById('end-sub').textContent)) === 'CHAPTER 6 COMPLETE');
  check('end screen points to Chapter 7 with a NEXT CHAPTER button', await G(() => document.getElementById('end-next').textContent.includes('CHAPTER 7') && !document.getElementById('e-next').classList.contains('hidden')), await G(() => document.getElementById('end-next').textContent));
  check('progress saved (cleared 6)', (await G(() => window.__GAME.Save.load().cleared)) === 6);
  await t.shot('91_end6');

  // ================= I. flow from chapter 5 + inventory =================
  await page.click('#e-menu'); await t.waitStage('menu', 30000); await sleep(800);
  await page.click('#m-story'); await sleep(200);
  await t.ev(() => document.querySelectorAll('#menu-sub .chapter .go')[4].click());
  await t.waitStage('apoc', 30000); await sleep(1200);
  await G(() => window.__GAME.G.finishChapters(5)); await sleep(600);
  check('chapter 5 end screen offers NEXT CHAPTER (6)', await G(() => !document.getElementById('e-next').classList.contains('hidden') && document.getElementById('end-next').textContent.includes('CHAPTER 6')));
  const sv = await G(() => { const s = window.__GAME.Save.load(); return { stage: s.stage, ch: s.chapter, got: s.got, cleared: s.cleared }; });
  check('finishing chapter 5 saves a chapter-6 checkpoint (Continue goes there)', sv.stage === 'mart' && sv.ch === 6 && sv.got === null, JSON.stringify(sv));
  await page.click('#e-next'); await t.waitStage('mart', 30000); await sleep(1200);
  check('NEXT CHAPTER from chapter 5 enters the City Mart', (await t.stage()) === 'mart');
  await G(() => window.__GAME.G.menu()); await t.waitStage('menu', 30000); await sleep(600);
  await page.click('#m-continue'); await t.waitStage('mart', 30000); await sleep(1000);
  check('Continue loads the City Mart', (await t.stage()) === 'mart');
  await G(() => { const p = window.__GAME.G.player; p.inv.batteries = 4; p.inv.keycard = true; });
  await G(() => window.__GAME.G.ui.openPause('inv')); await sleep(300);
  const invTxt = await G(() => document.getElementById('pause-sub').textContent);
  check('inventory lists BATTERIES + SECURITY KEYCARD', invTxt.includes('BATTERIES') && invTxt.includes('SECURITY KEYCARD'));
  await t.shot('92_inventory');

  const errs = t.errors.concat((await t.errlog()) ? [await t.errlog()] : []);
  check('no runtime errors in Chapter 6', errs.length === 0, errs.join(' | ').slice(0, 1500));
  const f = summary();
  await t.close();
  process.exit(f ? 1 : 0);
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(2); });
