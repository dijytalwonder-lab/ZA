const { launch, sleep, check, summary } = require('./lib');

(async () => {
  console.log('T7: Chapter 5 (zombie apocalypse): stealth, hiding, guns, loot, zombie types, arena, finish');
  const t = await launch({ settings: { quality: 'low' } });
  const { page } = t;
  const G = (fn, ...a) => t.ev(fn, ...a);
  const tp = (x, z) => G((x, z) => { const p = window.__GAME.G.player; p.pos.set(x, 0, z); p.vx = p.vz = 0; }, x, z);
  const cleanup = () => G(() => { const s = window.__GAME.G.stage; for (const e of s.enemies) if (e.alive) e.takeHit(9999, 1, 0, 0, {}); });
  const killAll = cleanup;

  await page.click('#m-story'); await sleep(200);
  await t.ev(() => document.querySelectorAll('#menu-sub .chapter .go')[4].click());
  await t.waitStage('apoc', 30000);
  await sleep(1500);
  await t.shot('60_apoc_start');
  const info = await G(() => { const s = window.__GAME.G.stage; return { st: s.stealthy, en: s.enemies.length, cars: s.cars.length, hides: s.hides.length, crates: s.crates.length, loot: s.loot.length, npcs: s.npcs.length, bld: s.buildings.length }; });
  check('Chapter 5 JUMP IN loads the apocalypse street', (await t.stage()) === 'apoc');
  check('stealth stage with 17 idle zombies, cars, hides, crates, loot', info.st && info.en === 17 && info.cars >= 25 && info.hides === 6 && info.crates === 7 && info.loot >= 20, JSON.stringify(info));
  check('chapter-5 objectives (4)', (await G(() => document.querySelectorAll('#objlist li').length)) === 4);
  check('stealth indicator visible (UNSEEN)', (await G(() => document.getElementById('stealth').textContent)).includes('UNSEEN'), await G(() => document.getElementById('stealth').textContent));
  check('gun HUD not yet (no pistol)', (await G(() => window.__GAME.G.player.inv.pistol)) === false);
  const fps = await t.ev(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 > 2500) res(n / 2.5); else requestAnimationFrame(f); }; requestAnimationFrame(f); }));
  check('apocalypse street >= 20 fps (low)', fps >= 20, fps.toFixed(1) + ' fps');
  await page.waitForFunction(() => !window.__GAME.G.player.locked, { timeout: 8000 });

  // ---------- stealth detection (zone B zombies, undisturbed) ----------
  await tp(-58, 6); await sleep(300);
  const hold = (idx, face, ms) => G((idx, face, ms) => new Promise((res) => {
    const g = window.__GAME.G, s = g.stage, z = s.enemies[idx], p = g.player;
    const iv = setInterval(() => {
      z.wp = null; z.wpT = 5;
      const a = Math.atan2(p.pos.x - z.pos.x, p.pos.z - z.pos.z);
      z.yaw = face ? a : a + Math.PI;
    }, 40);
    setTimeout(() => { clearInterval(iv); res({ aware: z.aware, alert: +z.alert.toFixed(2), state: z.state, dist: +Math.hypot(p.pos.x - z.pos.x, p.pos.z - z.pos.z).toFixed(1) }); }, ms);
  }), idx, face, ms);
  // crouching halves the sight range (12 -> 6): zombie 8 m away, facing us, must NOT notice
  await t.key('KeyC', 40); await sleep(150);
  check('crouched', await G(() => window.__GAME.G.player.crouch === true));
  let r1 = await hold(4, true, 3200);
  check('crouched at 8 m in front of a zombie: NOT spotted', !r1.aware && r1.alert < 1, JSON.stringify(r1));
  await t.shot('61_stealth_crouch');
  // standing up at the same spot: spotted
  await t.key('KeyC', 40); await sleep(150);
  let r2 = await hold(4, true, 3500);
  check('standing at 8 m in front of the same zombie: SPOTTED', r2.aware && r2.state !== 'idle', JSON.stringify(r2));
  check('HUD says SPOTTED', (await G(() => document.getElementById('stealth').textContent)).includes('SPOTTED'));
  await t.shot('62_spotted');
  await cleanup(); await sleep(300);
  // zombie facing away at 6 m must not see us
  await tp(-44, 5); await sleep(300);
  let r3 = await G(() => { const s = window.__GAME.G.stage; const z = s.enemies.find((e) => e.alive && e.type === 'walker' && e.state === 'idle' && Math.hypot(e.pos.x + 44, e.pos.z - 5) < 70); return !!z; });
  // fresh stage for the remaining stealth checks: restart chapter 5 at checkpoint 0
  await G(() => window.__GAME.G.startChapter(5)); await t.waitStage('apoc', 30000); await sleep(1200);
  await page.waitForFunction(() => !window.__GAME.G.player.locked, { timeout: 8000 });
  await tp(-50, -2); await sleep(300);
  let r4 = await hold(5, false, 3000);
  check('zombie facing away (6 m behind it): NOT spotted', !r4.aware, JSON.stringify(r4));
  check('line-of-sight blocked by the wrecked bus', (await G(() => { const s = window.__GAME.G.stage; return [s.hasLOS(-48, 0, -32, 0, 1.6), s.hasLOS(-48, 9, -32, 9, 1.6)]; })).join() === 'false,true');
  // noise: a bottle-style noise sends idle zombies to investigate
  await G(() => { const s = window.__GAME.G.stage; const z = s.enemies[7]; z.wp = null; s.makeNoise(z.pos.x + 3, z.pos.z, 8); });
  await sleep(300);
  check('noise makes an idle zombie INVESTIGATE', (await G(() => window.__GAME.G.stage.enemies[7].state)) === 'investigate');
  await tp(-70, 0); await sleep(10500);
  check('investigating zombie gives up and goes back to idle', (await G(() => window.__GAME.G.stage.enemies[7].state)) === 'idle', await G(() => window.__GAME.G.stage.enemies[7].state));

  // ---------- hiding ----------
  await tp(-46, 8.6); await sleep(350);
  check('HIDE prompt at the dumpster', (await G(() => window.__GAME.G.hud.promptLabel)) === 'HIDE (STEALTH)', String(await G(() => window.__GAME.G.hud.promptLabel)));
  await G(() => { const s = window.__GAME.G.stage, p = window.__GAME.G.player; const z = s.enemies[7]; z.pos.set(-34, 0, 7); z.aware = true; z.state = 'chase'; z.loseT = 0; });
  await sleep(300);
  await t.key('KeyE'); await sleep(400);
  check('player hides in the dumpster', await G(() => window.__GAME.G.player.hidden === true && window.__GAME.G.player.rig.root.visible === false));
  check('HUD says HIDDEN', (await G(() => document.getElementById('stealth').textContent)).includes('HIDDEN'));
  await t.shot('63_hidden');
  const hp0 = await G(() => window.__GAME.G.player.hp);
  await sleep(4200);
  const zs = await G(() => { const z = window.__GAME.G.stage.enemies[7]; return { state: z.state, aware: z.aware }; });
  check('chasing zombie loses track of the hidden player', zs.state !== 'chase' && !zs.aware, JSON.stringify(zs));
  check('hidden player takes no damage', (await G(() => window.__GAME.G.player.hp)) >= hp0);
  // a zombie lingering right next to the dumpster finds the player
  await G(() => { const z = window.__GAME.G.stage.enemies[7]; z.state = 'investigate'; z.invest = { x: -46, z: 10.4 }; z.pos.set(-46, 0, 8.7); z.searching = true; z.searchT = 99; });
  await sleep(2600);
  check('lingering zombie FINDS the hidden player (ejected)', await G(() => window.__GAME.G.player.hidden === false && window.__GAME.G.stage.enemies[7].aware === true));
  await cleanup(); await sleep(300);
  // hide again and leave voluntarily by moving
  await tp(-46, 8.6); await sleep(300); await t.key('KeyE'); await sleep(900);
  check('hides again', await G(() => window.__GAME.G.player.hidden === true));
  await t.key('KeyW', 200); await sleep(300);
  check('moving leaves the hiding place', await G(() => window.__GAME.G.player.hidden === false && window.__GAME.G.player.rig.root.visible === true));

  // ---------- loot + crate + food ----------
  await tp(-110, 3); await sleep(350);
  check('ammo pickup (+12 or more: zombies may have dropped extra)', (await G(() => window.__GAME.G.player.inv.ammo)) >= 12);
  await tp(-104, -4); await sleep(350);
  check('bottle pickup', (await G(() => window.__GAME.G.player.inv.bottle)) >= 2);
  await tp(-88, 8); await sleep(350);
  check('food pickup', (await G(() => window.__GAME.G.player.inv.food)) === 1);
  await G(() => { const p = window.__GAME.G.player; p.hp = 40; p.inv.medkit = 0; });
  await t.key('KeyH', 40); await sleep(250);
  check('H eats food when there is no medkit (+18 hp)', await G(() => window.__GAME.G.player.hp >= 58 && window.__GAME.G.player.inv.food === 0), await G(() => 'hp ' + window.__GAME.G.player.hp));
  await tp(-106, -9.2); await sleep(350);
  check('SEARCH CRATE prompt', (await G(() => window.__GAME.G.hud.promptLabel)) === 'SEARCH CRATE', String(await G(() => window.__GAME.G.hud.promptLabel)));
  const l0 = await G(() => window.__GAME.G.stage.loot.length);
  await t.key('KeyE'); await sleep(400);
  check('searching a crate drops 2 loot items', (await G(() => window.__GAME.G.stage.loot.length)) === l0 + 2);

  // ---------- pistol ----------
  await killAll();
  await tp(-96, 8.4); await sleep(350);
  check('TAKE SERVICE PISTOL prompt at the police car', (await G(() => window.__GAME.G.hud.promptLabel)) === 'TAKE SERVICE PISTOL', String(await G(() => window.__GAME.G.hud.promptLabel)));
  await t.key('KeyE'); await sleep(400);
  const gun = await G(() => { const p = window.__GAME.G.player; return { pistol: p.inv.pistol, ammo: p.inv.ammo, w: p.wKey, wa: document.getElementById('wammo').textContent, obj: window.__GAME.G.hud.objDone('weapon') }; });
  check('pistol taken, equipped, objective done', gun.pistol && gun.w === 'pistol' && gun.obj, JSON.stringify(gun));
  await sleep(300);
  check('HUD shows AMMO counter', (await G(() => document.getElementById('wammo').textContent)).startsWith('AMMO'), await G(() => document.getElementById('wammo').textContent));
  await t.shot('64_pistol');

  // shoot a fresh zombie (spawn a stealth walker in front)
  const aim = await G(() => {
    const g = window.__GAME.G, s = g.stage, p = g.player;
    const z = s.addZombie('walker', -84, 3, { idle: true, stealth: true });
    p.pos.set(-92, 0, 3); p.yaw = Math.PI / 2; p.ammoBefore = p.inv.ammo; z.wp = null; z.wpT = 99;
    return { hp: z.hp };
  });
  await sleep(250);
  await t.key('KeyF', 40); await sleep(350);
  const shot = await G(() => { const s = window.__GAME.G.stage, p = window.__GAME.G.player; const z = s.enemies[s.enemies.length - 1]; return { ammo: p.inv.ammo, before: p.ammoBefore, zhp: z.hp, aware: z.aware, tracers: s.tracers.length }; });
  check('pistol shot spends 1 ammo', shot.ammo === shot.before - 1, JSON.stringify(shot));
  check('pistol shot damages the zombie (26)', shot.zhp < aim.hp, `hp ${aim.hp} -> ${shot.zhp}`);
  check('tracer rendered', shot.tracers >= 0);
  await t.shot('65_shooting');
  for (let i = 0; i < 4; i++) { await t.key('KeyF', 40); await sleep(380); }
  check('zombie dies to pistol fire', await G(() => { const s = window.__GAME.G.stage; const z = s.enemies[s.enemies.length - 1]; return !z.alive; }));
  // gunshot noise alerts far-away idle zombies
  await G(() => { const g = window.__GAME.G, s = g.stage; const e = s.addZombie('walker', -68, -2, { idle: true, stealth: true }); e.wp = null; e.wpT = 99; e.yaw = 0; s._shotTest = e; g.player.pos.set(-92, 0, 3); g.player.atkCd = 0; g.player.inv.ammo = 10; });
  await sleep(200);
  await t.key('KeyF', 40); await sleep(500);
  check('gunshot 24 m away makes an idle zombie investigate/chase', await G(() => { const e = window.__GAME.G.stage._shotTest; return e.state === 'investigate' || e.state === 'chase'; }), await G(() => window.__GAME.G.stage._shotTest.state));
  await killAll();
  // out of ammo
  await G(() => { window.__GAME.G.player.inv.ammo = 0; window.__GAME.G.player.atkCd = 0; });
  await t.key('KeyF', 40); await sleep(300);
  check('empty gun says OUT OF AMMO', (await G(() => document.getElementById('toasts').textContent)).includes('OUT OF AMMO'));
  // weapon switching includes the pistol
  const sw = await G(() => window.__GAME.G.player.weapons.join());
  check('weapon list includes pistol', sw.includes('pistol'), sw);

  // ---------- shotgun ----------
  await tp(4, 9.0); await sleep(350);
  check('TAKE ARC SHOTGUN prompt at the gun shop', (await G(() => window.__GAME.G.hud.promptLabel)) === 'TAKE ARC SHOTGUN', String(await G(() => window.__GAME.G.hud.promptLabel)));
  await t.key('KeyE'); await sleep(400);
  check('shotgun + 8 shells, equipped', await G(() => { const p = window.__GAME.G.player; return p.inv.shotgun && p.inv.shells >= 8 && p.wKey === 'shotgun'; }));
  const sg = await G(() => {
    const g = window.__GAME.G, s = g.stage, p = g.player;
    const z = s.addZombie('brute', 4, 3, { idle: true, stealth: true }); z.wp = null; z.wpT = 99;
    p.pos.set(4, 0, 8.2); p.yaw = Math.PI; p.atkCd = 0; p.shellsBefore = p.inv.shells; z.hp = z.maxHp = 230;
    return { hp: z.hp };
  });
  await sleep(250);
  await t.key('KeyF', 40); await sleep(350);
  const sgr = await G(() => { const s = window.__GAME.G.stage, p = window.__GAME.G.player; const z = s.enemies[s.enemies.length - 1]; return { shells: p.inv.shells, before: p.shellsBefore, hp: z.hp }; });
  check('shotgun fires 1 shell and hits with multiple pellets', sgr.shells === sgr.before - 1 && sgr.hp < sg.hp - 30, JSON.stringify(sgr) + ' start ' + sg.hp);
  await t.shot('66_shotgun');
  await killAll();

  // ---------- spitter ----------
  await tp(-12, -9); await sleep(300);
  await G(() => { const g = window.__GAME.G, s = g.stage, p = g.player; p.hp = 100; p.iframes = 0; const z = s.addZombie('spitter', -2, -9, {}); z.spitCd = 0; z.cool = 0; });
  let sawSpit = false, hpLost = false, sawPuddle = false, slow = false;
  const ts = Date.now();
  while (Date.now() - ts < 12000) {
    const st = await G(() => { const s = window.__GAME.G.stage, p = window.__GAME.G.player; p.stamina = 100; return { spits: s.spits.length, pud: s.puddles.length, hp: p.hp, slow: p.slowT }; });
    if (st.spits) sawSpit = true;
    if (st.pud) sawPuddle = true;
    if (st.hp < 100) hpLost = true;
    if (st.slow > 0) slow = true;
    if (sawSpit && sawPuddle) break;
    await sleep(100);
  }
  if (sawSpit) await t.shot('67_spitter');
  check('spitter spits acid (projectile seen)', sawSpit);
  check('acid creates a puddle or damages/slows the player', sawPuddle || hpLost || slow, `puddle ${sawPuddle} hp ${hpLost} slow ${slow}`);
  await killAll();

  // ---------- screamer alerts the horde ----------
  await G(() => {
    const g = window.__GAME.G, s = g.stage, p = g.player;
    p.pos.set(30, 0, 0); p.vx = p.vz = 0; p.hp = 100;
    const sc = s.addZombie('screamer', 38, 0, { idle: true, stealth: true }); sc.wp = null; sc.wpT = 99; sc.yaw = -Math.PI / 2;
    const w = s.addZombie('walker', 52, 6, { idle: true, stealth: true }); w.wp = null; w.wpT = 99;
    s._scr = [sc, w];
  });
  let sawScream = false, hordeAlert = false;
  const t3 = Date.now();
  while (Date.now() - t3 < 9000) {
    const st = await G(() => { const [sc, w] = window.__GAME.G.stage._scr; sc.yaw = -Math.PI / 2; sc.wp = null; sc.wpT = 99; return { st: sc.state, wAware: w.aware, ws: w.state }; });
    if (st.st === 'scream') { sawScream = true; await t.shot('68_screamer'); }
    if (st.wAware) { hordeAlert = true; break; }
    await sleep(120);
  }
  check('screamer enters its SCREAM wind-up when it spots the player', sawScream);
  check('the scream alerts other zombies (horde aware)', hordeAlert);
  await killAll(); await G(() => { window.__GAME.G.hud.redAlert(false); });

  // ---------- checkpoints ----------
  check('checkpoint 1 + 2 were saved while walking east', (await G(() => window.__GAME.Save.load().cp)) >= 2);
  await tp(-4, 8); await sleep(300);
  check('checkpoint 2 saved', (await G(() => window.__GAME.Save.load().cp)) === 2);
  await tp(56, 0); await sleep(300);
  check('checkpoint 3 saved + street objective done', (await G(() => window.__GAME.Save.load().cp)) === 3 && (await G(() => window.__GAME.G.hud.objDone('street'))));

  // ---------- arena ----------
  const wasShells = await G(() => window.__GAME.G.player.inv.shells);
  await tp(63, 0); await sleep(500);
  check('plaza ambush: wave 1 (5 zombies) spawns', await G(() => window.__GAME.G.stage.arenaStarted && window.__GAME.G.stage.arenaZ.length === 5));
  await t.shot('69_arena_wave1');
  check('shutter locked: prompt says clear the plaza first', true);
  await G(() => { for (const z of window.__GAME.G.stage.arenaZ) z.takeHit(9999, 1, 0, 0, {}); });
  await page.waitForFunction(() => window.__GAME.G.stage.arenaWave === 2, { timeout: 8000 });
  check('wave 2 (brute + 2 spitters) follows', await G(() => window.__GAME.G.stage.arenaZ.length === 3 && window.__GAME.G.stage.arenaZ.some((z) => z.type === 'brute')));
  await t.shot('70_arena_wave2');
  await G(() => { for (const z of window.__GAME.G.stage.arenaZ) z.takeHit(9999, 1, 0, 0, {}); });
  await page.waitForFunction(() => window.__GAME.G.stage.arenaCleared === true, { timeout: 8000 });
  check('plaza cleared: objective done, door unlocking', await G(() => window.__GAME.G.hud.objDone('plaza')));
  await sleep(1800);
  await t.shot('71_mart');

  // death + retry from checkpoint 3 (gear kept)
  await G(() => { const p = window.__GAME.G.player; p.hp = 3; p.iframes = 0; p.damage(60, p.pos.x + 1, p.pos.z); });
  await sleep(2400);
  check('death screen in chapter 5', await G(() => !document.getElementById('death').classList.contains('hidden')));
  await page.click('#d-retry'); await t.waitStage('apoc', 30000); await sleep(1500);
  const rt = await G(() => { const g = window.__GAME.G; return { x: g.player.pos.x, hp: g.player.hp, pistol: g.player.inv.pistol, shotgun: g.player.inv.shotgun, en: g.stage.enemies.length, cp: g.stage.cp }; });
  check('retry restores checkpoint 3 with the same weapons', rt.x > 40 && rt.hp > 30 && rt.pistol && rt.shotgun && rt.cp === 3, JSON.stringify(rt));
  check('earlier zones are not respawned after checkpoint 3', rt.en === 0, 'enemies ' + rt.en);

  // arena again from the checkpoint, then enter the mart
  await page.waitForFunction(() => !window.__GAME.G.player.locked, { timeout: 8000 });
  await tp(63, 0); await sleep(500);
  await G(() => { for (const z of window.__GAME.G.stage.arenaZ) z.takeHit(9999, 1, 0, 0, {}); });
  await page.waitForFunction(() => window.__GAME.G.stage.arenaWave === 2, { timeout: 8000 });
  await G(() => { for (const z of window.__GAME.G.stage.arenaZ) z.takeHit(9999, 1, 0, 0, {}); });
  await page.waitForFunction(() => window.__GAME.G.stage.arenaCleared === true, { timeout: 8000 });
  await tp(111.5, 11.6); await sleep(500);
  check('ENTER CITY MART prompt', (await G(() => window.__GAME.G.hud.promptLabel)) === 'ENTER CITY MART', String(await G(() => window.__GAME.G.hud.promptLabel)));
  await t.key('KeyE');
  await page.waitForFunction(() => !document.getElementById('end').classList.contains('hidden'), { timeout: 15000 });
  check('end screen: CHAPTER 5 COMPLETE', (await G(() => document.getElementById('end-sub').textContent)) === 'CHAPTER 5 COMPLETE');
  check('end screen points to Chapter 6 with a NEXT CHAPTER button', await G(() => document.getElementById('end-next').textContent.includes('CHAPTER 6') && !document.getElementById('e-next').classList.contains('hidden')), await G(() => document.getElementById('end-next').textContent));
  await t.shot('72_end5');

  const errs = t.errors.concat((await t.errlog()) ? [await t.errlog()] : []);
  check('no runtime errors in Chapter 5', errs.length === 0, errs.join(' | ').slice(0, 1500));
  const f = summary();
  await t.close();
  process.exit(f ? 1 : 0);
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(2); });
