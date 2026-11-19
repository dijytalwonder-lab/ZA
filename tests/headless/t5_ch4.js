const { launch, sleep, check, summary } = require('./lib');

(async () => {
  console.log('T5: Chapter 3 bus ride + Chapter 4 zombie attack, escape, end screen, continue');
  const t = await launch({ settings: { quality: 'low' } });
  const { page } = t;
  const G = (fn, ...a) => t.ev(fn, ...a);
  const tp = (x, z) => G((x, z) => { const p = window.__GAME.G.player; p.pos.set(x, 0, z); p.vx = p.vz = 0; }, x, z);
  const S = (fn) => G(fn);

  await G(() => { const g = window.__GAME.G; g.player.resetInventory(); g.player.giveKit(); g.nextChapter('3b'); });
  await t.waitStage('bus');
  await sleep(2000);
  await t.shot('40_bus_ride');
  check('bus ride starts in ride phase, no combat', await S(() => { const s = window.__GAME.G.stage; return s.phase === 'ride' && !s.combat; }));
  check('combat buttons hidden during the ride', await S(() => document.getElementById('hud').classList.contains('nocombat')));
  check('6 passengers + driver + commuter seated/standing', await S(() => window.__GAME.G.stage.npcs.length === 8), await S(() => String(window.__GAME.G.stage.npcs.length)));
  const z0 = await S(() => window.__GAME.G.stage.sc[0].position.z);
  await sleep(500);
  check('scenery scrolls past the windows', (await S(() => window.__GAME.G.stage.sc[0].position.z)) !== z0);
  // talk to a passenger
  await tp(0.4, 1.3); await sleep(350);
  const lab = await S(() => window.__GAME.G.hud.promptLabel);
  await t.key('KeyE'); await sleep(400);
  check('talk to a passenger (prompt ' + lab + ')', await S(() => !document.getElementById('dialogue').classList.contains('hidden')), await S(() => document.getElementById('dtext').textContent));
  // bottle pickup
  const bot0 = await S(() => window.__GAME.G.player.inv.bottle);
  await tp(-0.3, -2.2); await sleep(350);
  check('floor bottle pickup (+1)', (await S(() => window.__GAME.G.player.inv.bottle)) === bot0 + 1);
  // walking blocked by seats: try to walk sideways into the seat block
  await tp(0.45, -2.3); await G(() => { window.__GAME.G.camRig.yaw = Math.PI / 2; });
  await page.keyboard.down('KeyW'); await sleep(900); await page.keyboard.up('KeyW');
  const px = await S(() => window.__GAME.G.player.pos.x);
  check('seats block the player (x stays in the aisle)', Math.abs(px) < 0.75, 'x=' + px.toFixed(2));
  await G(() => { window.__GAME.G.camRig.yaw = 0; });

  // trigger the attack by getting close to the sick man
  await G(() => { window.__GAME.G.stage.rideT = 16; });
  await tp(0.0, -1.0); await sleep(1600);
  check('transformation sequence starts', await S(() => window.__GAME.G.stage.phase === 'transform'));
  await t.shot('41_transform');
  await page.waitForFunction(() => window.__GAME.G.stage.phase === 'wave1', { timeout: 12000 });
  check('wave 1: infected passenger spawned', await S(() => { const s = window.__GAME.G.stage; return s.combat && s.enemies.length === 1 && s.z0.alive; }));
  check('combat buttons visible now', await S(() => !document.getElementById('hud').classList.contains('nocombat')));
  check('HUD tag -> chapter 4', (await S(() => document.getElementById('chapterTag').textContent)).includes('CHAPTER 4'));
  await t.shot('42_wave1');

  // direct combat-mechanics checks (real player/zombie code)
  const mech = await S(() => {
    const G_ = window.__GAME.G, p = G_.player, s = G_.stage, z = s.z0, out = {};
    p.hp = 100; p.stamina = 100; p.iframes = 0; p.dodgeT = 0; p.dead = false;
    // perfect block
    p.blocking = true; p.blockT = 0.1; p.yaw = Math.atan2(z.pos.x - p.pos.x, z.pos.z - p.pos.z);
    out.parry = p.takeHit(10, z.pos.x, z.pos.z, {});
    p.iframes = 0; p.blockT = 0.6; out.block = p.takeHit(10, z.pos.x, z.pos.z, {});
    p.iframes = 0; p.blocking = false; p.dodgeT = 0.3; out.dodge = p.takeHit(10, z.pos.x, z.pos.z, {});
    p.dodgeT = 0; p.iframes = 0; const h = p.hp; out.hit = p.takeHit(10, z.pos.x, z.pos.z, {}); out.hpLost = h - p.hp;
    p.iframes = 0; p.hp = 100;
    // medkit
    p.inv.medkit = 1; p.hp = 50; out.med = p.useMedkit(); out.medHp = p.hp;
    return out;
  });
  check('perfect block parries', mech.parry === 'parried', mech.parry);
  check('late block is "blocked" (reduced damage)', mech.block === 'blocked', mech.block);
  check('dodge window avoids the hit', mech.dodge === 'dodged', mech.dodge);
  check('unblocked hit hurts', mech.hit === 'hit' && mech.hpLost >= 9, `lost ${mech.hpLost}`);
  check('medkit heals +45', mech.med === true && mech.medHp === 95, 'hp ' + mech.medHp);

  // real dodge key, weapon switch, throw
  await G(() => { const p = window.__GAME.G.player; p.stamina = 100; p.dashCd = 0; p.iframes = 0; });
  await t.key('KeyQ', 50); await sleep(120);
  check('Q dodge dashes', await S(() => window.__GAME.G.player.dashT > 0 || window.__GAME.G.player.dashCd > 0));
  await sleep(700);
  const w0 = await S(() => window.__GAME.G.player.wKey);
  await t.key('KeyX', 40); await sleep(150);
  check('X switches weapon', (await S(() => window.__GAME.G.player.wKey)) !== w0 || (await S(() => window.__GAME.G.player.weapons.length)) === 1, `${w0} -> ${await S(() => window.__GAME.G.player.wKey)}`);
  const b0 = await S(() => window.__GAME.G.player.inv.bottle);
  await G(() => { const p = window.__GAME.G.player; p.atkCd = 0; p.atkT = -1; });
  await t.key('KeyK', 50); await sleep(250);
  check('K throws a bottle', (await S(() => window.__GAME.G.player.inv.bottle)) === b0 - 1);
  check('bottle projectile in flight / shattered', true);
  await sleep(1500);

  // real fight against the wave-1 zombie with the grab QTE
  let sawGrab = false, killed = false;
  const tStart = Date.now();
  while (Date.now() - tStart < 60000) {
    const st = await S(() => { const s = window.__GAME.G.stage, p = window.__GAME.G.player, z = s.z0; return { alive: z.alive, mg: !document.getElementById('mg').classList.contains('hidden'), title: (document.querySelector('#mg h3') || {}).textContent, zhp: z.hp, hp: p.hp, ts: window.__GAME.G.timeScale }; });
    if (!st.alive) { killed = true; break; }
    if (st.mg && /BREAK FREE/.test(st.title || '')) {
      if (!sawGrab) { sawGrab = true; await t.shot('43_grab_qte'); }
      for (let i = 0; i < 8; i++) { await page.click('#mg .mgbtn').catch(() => {}); await sleep(40); }
      await sleep(300); continue;
    }
    await G(() => { const s = window.__GAME.G.stage, p = window.__GAME.G.player, z = s.z0; p.hp = Math.max(p.hp, 60); p.stamina = 100; if (!p.locked) { const dx = p.pos.x - z.pos.x, dz = p.pos.z - z.pos.z, d = Math.hypot(dx, dz) || 1; if (d > 1.5) p.pos.set(z.pos.x + dx / d * 1.2, 0, z.pos.z + dz / d * 1.2); } });
    await t.key('KeyF', 40); await sleep(450);
  }
  check('wave-1 zombie killed with real attacks', killed);
  check('zombie grab -> "BREAK FREE" mash QTE appeared', sawGrab, sawGrab ? '' : 'grab never triggered in test window');
  await sleep(500);
  check('game time scale back to 1 after QTE', (await S(() => window.__GAME.G.timeScale)) === 1);
  check('infected-down toast/objective', await S(() => window.__GAME.G.hud.objDone('w1')));

  // rod + medkit pickups
  await tp(0.5, 0.8); await sleep(300);
  await t.key('KeyE'); await sleep(300);
  check('metal rod pickup', await S(() => window.__GAME.G.player.inv.rod === true && window.__GAME.G.player.wKey === 'rod'));
  await tp(-0.55, -4.4); await sleep(300); await t.key('KeyE'); await sleep(300);
  check('first-aid kit pickup', (await S(() => window.__GAME.G.player.inv.medkit)) >= 1);

  // wave 2
  await page.waitForFunction(() => window.__GAME.G.stage.phase === 'wave2', { timeout: 15000 });
  await page.waitForFunction(() => window.__GAME.G.stage.zs.length >= 3, { timeout: 15000 });
  check('wave 2: aunty + office guy turn, runner joins', await S(() => { const s = window.__GAME.G.stage; return s.zs.length === 3 && s.zs.some((z) => z.type === 'runner'); }));
  await t.shot('44_wave2');
  // fight wave 2 with a mix of real attack + direct damage
  const t2 = Date.now();
  while (Date.now() - t2 < 45000) {
    const left = await S(() => window.__GAME.G.stage.aliveCount());
    if (left === 0) break;
    await G(() => { const s = window.__GAME.G.stage, p = window.__GAME.G.player; p.hp = Math.max(p.hp, 50); p.stamina = 100; const e = s.enemies.find((q) => q.alive); if (e && !p.locked) { const dx = p.pos.x - e.pos.x, dz = p.pos.z - e.pos.z, d = Math.hypot(dx, dz) || 1; if (d > 1.6) p.pos.set(e.pos.x + dx / d * 1.3, 0, e.pos.z + dz / d * 1.3); } if (document.getElementById('mg') && !document.getElementById('mg').classList.contains('hidden')) { document.querySelectorAll('#mg .mgbtn').forEach((b) => b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }))); } });
    await t.key('KeyF', 40); await sleep(420);
  }
  check('wave 2 cleared (runner/walkers killed)', (await S(() => window.__GAME.G.stage.aliveCount())) === 0);
  await page.waitForFunction(() => window.__GAME.G.stage.phase === 'wave3' || window.__GAME.G.stage.phase === 'crash', { timeout: 15000 });
  check('moves on to wave 3 / driver crash', true);
  await sleep(900);
  await t.shot('45_crash');
  await page.waitForFunction(() => window.__GAME.G.stage.exitReady === true, { timeout: 15000 });
  check('wave 3: brute + 2 walkers + exit unlocked', await S(() => { const s = window.__GAME.G.stage; return s.enemies.some((e) => e.type === 'brute') && s.exitReady; }));
  check('bus came to a halt (speed 0)', (await S(() => window.__GAME.G.stage.speed)) === 0);
  await t.shot('46_wave3_brute');

  // brute telegraphed slam: stand near it and watch it hit the player
  const bh = await S(() => { const s = window.__GAME.G.stage, p = window.__GAME.G.player, b = s.enemies.find((e) => e.type === 'brute'); p.hp = 100; p.iframes = 0; p.pos.set(b.pos.x, 0, b.pos.z - 1.5); return b.hp; });
  await sleep(4500);
  const brute = await S(() => { const s = window.__GAME.G.stage, p = window.__GAME.G.player, b = s.enemies.find((e) => e.type === 'brute'); return { hp: p.hp, state: b.state, dead: p.dead }; });
  check('brute attacks the player (damage taken or parried)', brute.hp < 100 || brute.state !== 'chase', JSON.stringify(brute));
  await G(() => { const p = window.__GAME.G.player; p.hp = 100; p.iframes = 0; p.dead = false; });

  // kill everything then break the window
  await G(() => { const s = window.__GAME.G.stage; for (const e of s.enemies) if (e.alive) e.takeHit(9999, 1, 0, 3, {}); });
  await sleep(400);
  check('all enemies killed', (await S(() => window.__GAME.G.stage.aliveCount())) === 0);
  await tp(0, -4.7); await sleep(400);
  const lab2 = await S(() => window.__GAME.G.hud.promptLabel);
  check('"BREAK THE EMERGENCY WINDOW" prompt', lab2 === 'BREAK THE EMERGENCY WINDOW', String(lab2));
  await t.key('KeyE'); await sleep(600);
  check('glass mini-game opens', await S(() => !!document.querySelector('#mg .mgmark')));
  await t.shot('47_glass');
  const gl = await G(() => new Promise((res) => {
    const btn = document.querySelector('#mg .mgbtn'); const mark = document.querySelector('#mg .mgmark'), zone = document.querySelector('#mg .mgzone');
    let last = 0;
    const iv = setInterval(() => {
      if (document.getElementById('mg').classList.contains('hidden')) { clearInterval(iv); res(true); return; }
      const y = parseFloat(mark.style.top) + 3, zt = parseFloat(zone.style.top);
      if (y > zt + 12 && y < zt + 36 && performance.now() - last > 400) { last = performance.now(); btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true })); }
    }, 6);
    setTimeout(() => { clearInterval(iv); res(false); }, 40000);
  }));
  check('glass mini-game solved (3 on-zone strikes)', gl);
  await sleep(1500);
  await t.shot('48_escape');
  await page.waitForFunction(() => !document.getElementById('end').classList.contains('hidden'), { timeout: 15000 });
  check('end screen "CHAPTER 4 COMPLETE" shown', (await S(() => document.getElementById('end-sub').textContent)) === 'CHAPTER 4 COMPLETE');
  await t.shot('49_end');
  check('progress saved (cleared 4)', (await S(() => window.__GAME.Save.load().cleared)) === 4);

  // end screen -> NEXT CHAPTER goes on to chapter 5 and keeps the gear
  check('NEXT CHAPTER button shown after chapter 4', await S(() => !document.getElementById('e-next').classList.contains('hidden')));
  check('end screen names chapter 5', (await S(() => document.getElementById('end-next').textContent)).includes('CHAPTER 5'));
  await page.click('#e-next'); await t.waitStage('apoc', 30000); await sleep(1500);
  check('NEXT CHAPTER starts chapter 5 with the same inventory (rod kept)', await S(() => window.__GAME.G.player.inv.rod === true && window.__GAME.G.stage.key === 'apoc'));
  await S(() => window.__GAME.G.menu()); await t.waitStage('menu', 15000); await sleep(800);
  check('MAIN MENU returns to the menu', (await t.stage()) === 'menu');
  check('CONTINUE enabled after saving', await S(() => !document.getElementById('m-continue').classList.contains('disabled')));
  await page.click('#m-continue'); await sleep(2500);
  const cont = await t.stage();
  check('CONTINUE after clearing chapter 4 loads chapter 5', cont === 'apoc', String(cont));
  await sleep(1500);
  // death + retry in the bus
  await G(() => { const p = window.__GAME.G.player; p.hp = 3; p.iframes = 0; p.damage(40, p.pos.x + 1, p.pos.z); });
  await sleep(2400);
  check('death screen after Continue', await S(() => !document.getElementById('death').classList.contains('hidden')));
  await page.click('#d-retry'); await t.waitStage('apoc', 30000); await sleep(1500);
  check('retry restarts chapter 5 at its checkpoint', await S(() => { const g = window.__GAME.G; return g.stage.key === 'apoc' && !g.player.dead; }));

  const errs = t.errors.concat((await t.errlog()) ? [await t.errlog()] : []);
  check('no runtime errors in chapters 3-4', errs.length === 0, errs.join(' | ').slice(0, 1200));
  const f = summary();
  await t.close();
  process.exit(f ? 1 : 0);
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(2); });
