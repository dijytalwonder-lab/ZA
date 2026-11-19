const { launch, sleep, check, summary } = require('./lib');

const fpsOf = (t, ms = 2500) => t.ev((ms) => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 > ms) res(n / (ms / 1000)); else requestAnimationFrame(f); }; requestAnimationFrame(f); }), ms);

(async () => {
  /* ---------- A: audio ---------- */
  let t, G;
  if (!process.env.ONLY_CD) {
  console.log('T6A: audio engine (music moods, every SFX, loops)');
  t = await launch({ settings: { quality: 'med' } });
  G = (fn, ...a) => t.ev(fn, ...a);
  await t.page.click('#m-story'); await sleep(300); // a click unlocks audio
  const st = await G(() => window.__GAME.G.audio.ctx && window.__GAME.G.audio.ctx.state);
  check('AudioContext created and running after a click', st === 'running', String(st));
  const aerr = await G(async () => {
    const a = window.__GAME.G.audio, errs = [];
    const names = ['ui', 'select', 'back', 'error', 'type', 'coin', 'pickup', 'heal', 'beep', 'tick', 'swing', 'throw', 'hit', 'crit', 'block', 'parry', 'dodge', 'hurt', 'growl', 'zhit', 'zdie', 'scream', 'glass', 'door', 'step', 'thud', 'whoosh', 'horn', 'crash', 'hiss', 'win', 'lose', 'transform', 'power'];
    for (const n of names) { try { a.sfx(n); } catch (e) { errs.push(n + ': ' + e.message); } }
    for (const m of ['menu', 'calm', 'city', 'tense', 'combat', null, 'menu']) { try { a.setMood(m); await new Promise((r) => setTimeout(r, 350)); } catch (e) { errs.push('mood ' + m + ': ' + e.message); } }
    try { a.alarm(true); await new Promise((r) => setTimeout(r, 700)); a.alarm(false); a.sirenOn(true, 0.05); a.sirenOn(true, 0.02); a.engine(true, 1); a.engine(true, 0.4); await new Promise((r) => setTimeout(r, 400)); a.stopAll(); } catch (e) { errs.push('loops: ' + e.message); }
    return errs;
  });
  check('34 SFX + 5 music moods + alarm/siren/engine loops run without exceptions', aerr.length === 0, aerr.join('; '));
  check('music timer running for menu mood', await G(() => window.__GAME.G.audio.mood === 'menu'));

  /* ---------- B: performance / leaks at med + high ---------- */
  console.log('T6B: performance (1280x720) and stage-switch leaks');
  await t.close();
  for (const q of ['med', 'high']) {
    t = await launch({ settings: { quality: q }, w: 1280, h: 720 });
    G = (fn, ...a) => t.ev(fn, ...a);
    const fm = await fpsOf(t);
    check(`${q}: menu fps >= 25`, fm >= 25, fm.toFixed(1));
    await G(() => window.__GAME.G.startChapter(2));
    await t.waitStage('city'); await sleep(3500);
    const fc = await fpsOf(t);
    check(`${q}: city fps >= 25 @720p`, fc >= 25, fc.toFixed(1) + ' (scale ' + (await G(() => window.__GAME.G.scale)).toFixed(2) + ')');
    await G(() => { const p = window.__GAME.G.player; p.pos.set(-40, 0, 9); });
    await sleep(1500);
    const fc2 = await fpsOf(t);
    check(`${q}: city mid-street fps >= 25`, fc2 >= 25, fc2.toFixed(1));
    if (q === 'high') await t.shot('50_city_high_720p');
    // leak test: cycle stages
    const mem0 = await G(() => { const m = window.__GAME.G.renderer.info.memory; return { g: m.geometries, t: m.textures }; });
    for (let i = 0; i < 3; i++) {
      await G(() => window.__GAME.G.menu()); await t.waitStage('menu'); await sleep(900);
      await G(() => window.__GAME.G.startChapter(2)); await t.waitStage('city'); await sleep(900);
    }
    const mem1 = await G(() => { const m = window.__GAME.G.renderer.info.memory; return { g: m.geometries, t: m.textures }; });
    check(`${q}: no GPU memory growth over 3 city<->menu cycles`, mem1.g <= mem0.g + 40 && mem1.t <= mem0.t + 40, `geo ${mem0.g}->${mem1.g}, tex ${mem0.t}->${mem1.t}`);
    const errs = t.errors.concat((await t.errlog()) ? [await t.errlog()] : []);
    check(`${q}: no runtime errors`, errs.length === 0, errs.join(' | ').slice(0, 500));
    await t.close();
  }
  }

  /* ---------- C: touch / phone landscape ---------- */
  console.log('T6C: phone landscape (844x390) with touch input');
  t = await launch({ touch: true, settings: { quality: 'low' } });
  G = (fn, ...a) => t.ev(fn, ...a);
  await t.shot('51_phone_menu');
  await G(() => window.__GAME.G.startChapter(2));
  await t.waitStage('city');
  await t.page.waitForFunction(() => !window.__GAME.G.player.locked, { timeout: 8000 });
  await sleep(2500);
  await t.shot('52_phone_hud');
  const rects = await G(() => {
    const r = (id) => { const e = document.getElementById(id); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; };
    const q = (s) => { const e = document.querySelector(s); const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; };
    return { vw: innerWidth, vh: innerHeight, jump: q('[data-act="jump"]'), attack: r('b-attack'), obj: r('objective'), map: r('mapwrap'), joyzone: r('joyzone') };
  });
  check('jump button on screen', rects.jump.x + rects.jump.w <= rects.vw && rects.jump.y + rects.jump.h <= rects.vh, JSON.stringify(rects.jump));
  check('minimap on screen (top-right)', rects.map.x + rects.map.w <= rects.vw + 1 && rects.map.y >= 0);
  // joystick via touch
  const p0 = await G(() => ({ x: window.__GAME.G.player.pos.x, z: window.__GAME.G.player.pos.z }));
  const jz = rects.joyzone;
  const jx = jz.x + 120, jy = jz.y + jz.h - 90;
  const th = await t.page.touchscreen.touchStart(jx, jy);
  await th.move(jx, jy - 55);
  await sleep(1100);
  await th.end();
  const p1 = await G(() => ({ x: window.__GAME.G.player.pos.x, z: window.__GAME.G.player.pos.z }));
  check('touch joystick moves the player', Math.hypot(p1.x - p0.x, p1.z - p0.z) > 1, `moved ${Math.hypot(p1.x - p0.x, p1.z - p0.z).toFixed(2)} m`);
  // look swipe
  const y0 = await G(() => window.__GAME.G.camRig.yaw);
  const lh = await t.page.touchscreen.touchStart(560, 150);
  await lh.move(660, 150); await lh.move(700, 150); await sleep(150); await lh.end();
  await sleep(200);
  check('touch swipe rotates the camera', Math.abs((await G(() => window.__GAME.G.camRig.yaw)) - y0) > 0.1);
  // jump button tap
  const jb = rects.jump;
  await t.page.touchscreen.tap(jb.x + jb.w / 2, jb.y + jb.h / 2);
  await sleep(150);
  check('JUMP button (touch) works', await G(() => !window.__GAME.G.player.grounded || window.__GAME.G.player.pos.y > 0.02));
  await sleep(700);
  // run toggle tap
  const rb = await G(() => { const b = document.querySelector('[data-act="run"]').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; });
  await t.page.touchscreen.tap(rb.x, rb.y); await sleep(150);
  check('RUN toggle button (touch) works', await G(() => window.__GAME.G.input.toggles.run === true));
  // pause button
  const pb = await G(() => { const b = document.getElementById('btn-pause').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; });
  await t.page.touchscreen.tap(pb.x, pb.y); await sleep(300);
  check('pause button (touch) opens pause menu', await G(() => window.__GAME.G.paused === true));
  await t.shot('53_phone_pause');
  await t.page.touchscreen.tap(422, 190); await sleep(100);
  await G(() => window.__GAME.G.ui.closePause());
  // combat HUD layout on phone (bus)
  await G(() => { const g = window.__GAME.G; g.startChapter(4); });
  await t.waitStage('bus'); await sleep(2500);
  await t.shot('54_phone_combat');
  const att = await G(() => { const b = document.getElementById('b-attack').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, w: b.width, vw: innerWidth, vh: innerHeight }; });
  check('attack button reachable on phone', att.x < att.vw && att.y < att.vh && att.w > 50, JSON.stringify(att));
  // the infected passenger grabs immediately at this checkpoint: break free by TAPPING the mash button with touch
  await G(() => { const g = window.__GAME.G; const z = g.stage.enemies[0]; g.player.pos.set(z.pos.x, 0, z.pos.z + 1.0); });
  await t.page.waitForFunction(() => !document.getElementById('mg').classList.contains('hidden'), { timeout: 8000 }).catch(() => {});
  if (await G(() => !document.getElementById('mg').classList.contains('hidden'))) {
    await t.shot('54b_phone_grab_qte');
    const mb = await G(() => { const b = document.querySelector('#mg .mgbtn').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; });
    for (let i = 0; i < 9; i++) { await t.page.touchscreen.tap(mb.x, mb.y); await sleep(70); }
    await sleep(900);
    check('grab QTE can be broken with touch taps', await G(() => document.getElementById('mg').classList.contains('hidden')));
  }
  await G(() => { const g = window.__GAME.G; g.player.atkCd = 0; g.player.atkT = -1; g.player.stamina = 100; g.player.iframes = 2; });
  await sleep(600);
  await t.page.touchscreen.tap(att.x, att.y); await sleep(250);
  check('ATTACK button (touch) swings', await G(() => window.__GAME.G.player.atkT >= 0 || window.__GAME.G.player.atkCd > 0));
  const errs2 = t.errors.concat((await t.errlog()) ? [await t.errlog()] : []);
  check('phone run: no runtime errors', errs2.length === 0, errs2.join(' | ').slice(0, 500));
  await t.close();

  /* ---------- D: chapter 4 checkpoints, portrait overlay, bedroom facing, new-game confirm ---------- */
  console.log('T6D: checkpoint restores, portrait overlay, bedroom facing, new-game flow');
  t = await launch({ settings: { quality: 'low' } });
  G = (fn, ...a) => t.ev(fn, ...a);
  for (const cp of [1, 2, 3]) {
    await G((cp) => { const g = window.__GAME.G; g.player.resetInventory(); g.player.giveKit(); g.goto('bus', { cp }); }, cp);
    await t.waitStage('bus'); await sleep(cp === 3 ? 6500 : 4500);
    const info = await G(() => { const s = window.__GAME.G.stage; return { phase: s.phase, en: s.enemies.length, combat: s.combat, yaw: window.__GAME.G.camRig.yaw }; });
    check(`bus checkpoint ${cp} restores into combat`, info.combat && info.en >= 1, JSON.stringify(info));
    await G(() => window.__GAME.G.menu()); await t.waitStage('menu'); await sleep(500);
  }
  // bedroom facing
  await G(() => window.__GAME.G.newGame());
  await t.waitStage('bedroom');
  await t.page.waitForFunction(() => !!document.querySelector('#mg .mgbtn'), { timeout: 15000 });
  await G(() => window.__GAME.G.mg.abort());
  await t.page.waitForFunction(() => window.__GAME.G.stage.free === true, { timeout: 8000 });
  await sleep(1500);
  const face = await G(() => { const g = window.__GAME.G; const fy = Math.atan2(-Math.sin(g.camRig.yaw), -Math.cos(g.camRig.yaw)); let d = g.player.yaw - fy; d = Math.atan2(Math.sin(d), Math.cos(d)); return Math.abs(d); });
  check('boy faces away from the camera after getting out of bed', face < 0.8, 'angle diff ' + face.toFixed(2));
  await t.shot('55_bedroom_facing');
  // New game with an existing save shows the confirm panel
  await G(() => window.__GAME.G.menu()); await t.waitStage('menu'); await sleep(500);
  await t.page.click('#m-new'); await sleep(300);
  check('NEW GAME with a save asks for confirmation', (await G(() => document.getElementById('menu-sub').textContent)).includes('erases'));
  await t.page.click('#menu-sub .back'); await sleep(200);
  // portrait overlay
  await t.page.setViewport({ width: 390, height: 800, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await sleep(600);
  check('portrait shows "ROTATE YOUR DEVICE"', await G(() => { const r = document.getElementById('rotate'); return getComputedStyle(r).display !== 'none'; }));
  await t.shot('56_portrait');
  await t.page.setViewport({ width: 844, height: 390, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await sleep(500);
  // settings persist across reload
  await G(() => { window.__GAME.G.settings.music = 0.25; window.__GAME.Save.saveSettings(window.__GAME.G.settings); });
  await t.page.reload({ waitUntil: 'load' });
  await t.page.waitForFunction(() => window.__gameReady === true, { timeout: 30000 });
  check('settings persist after reload', (await G(() => window.__GAME.G.settings.music)) === 0.25);
  const errs3 = t.errors.concat((await t.errlog()) ? [await t.errlog()] : []);
  check('misc run: no runtime errors', errs3.length === 0, errs3.join(' | ').slice(0, 500));
  await t.close();

  const f = summary();
  process.exit(f ? 1 : 0);
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(2); });
