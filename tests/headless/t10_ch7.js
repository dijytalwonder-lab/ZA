const { launch, sleep, check, summary } = require('./lib');

// grid BFS over the stage colliders: window.__nav(startX, startZ) -> { reachable(x,z), near(x,z,r), blocked(x,z,r) }
const NAV = `(() => {
  window.__navMake = (sx0, sz0) => {
    const s = window.__GAME.G.stage;
    const R = 0.34, st = 0.25, X0 = -100, Z0 = -27;
    const nx = Math.round(160 / st) + 1, nz = Math.round(54 / st) + 1;
    const blocked = (x, z, r = R) => { for (const c of s.colliders) { if (c.off) continue; const cx = Math.max(c.minX, Math.min(x, c.maxX)), cz = Math.max(c.minZ, Math.min(z, c.maxZ)); if ((x - cx) * (x - cx) + (z - cz) * (z - cz) < r * r) return true; } return false; };
    const walk = new Uint8Array(nx * nz);
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) walk[i * nz + j] = blocked(X0 + i * st, Z0 + j * st) ? 0 : 1;
    const cell = (x, z) => [Math.round((x - X0) / st), Math.round((z - Z0) / st)];
    const reach = new Uint8Array(nx * nz);
    const [sx, sz] = cell(sx0, sz0);
    const q = [[sx, sz]]; reach[sx * nz + sz] = 1;
    while (q.length) { const [i, j] = q.pop(); for (const [di, dj] of [[1,0],[-1,0],[0,1],[0,-1]]) { const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= nx || b >= nz) continue; const k = a * nz + b; if (walk[k] && !reach[k]) { reach[k] = 1; q.push([a, b]); } } }
    return {
      blocked,
      reachable: (x, z) => { const [i, j] = cell(x, z); return i >= 0 && j >= 0 && i < nx && j < nz && !!reach[i * nz + j]; },
      near: (x, z, r) => { const [ci, cj] = cell(x, z), k = Math.ceil(r / st) + 1; for (let i = ci - k; i <= ci + k; i++) for (let j = cj - k; j <= cj + k; j++) { if (i < 0 || j < 0 || i >= nx || j >= nz || !reach[i * nz + j]) continue; const px = X0 + i * st, pz = Z0 + j * st; if ((px - x) * (px - x) + (pz - z) * (pz - z) <= r * r) return true; } return false; }
    };
  };
  return true;
})()`;

(async () => {
  console.log('T10: Chapter 7 (Metro Relief Station): route, crafting, barricades, siege waves, dawn radio, ending');
  const t = await launch({ settings: { quality: 'low' } });
  const { page } = t;
  const G = (fn, ...a) => t.ev(fn, ...a);
  const tp = (x, z) => G((x, z) => { const p = window.__GAME.G.player; p.pos.set(x, 0, z); p.vx = p.vz = 0; }, x, z);
  const killAll = () => G(() => { const s = window.__GAME.G.stage; for (const e of s.enemies) if (e.alive) e.takeHit(9999, 1, 0, 0, {}); if (s.phase !== 'route') { for (const l of s.loot) s.scene.remove(l.m); s.loot.length = 0; } });
  const safe = () => G(() => { window.__GAME.G.player.iframes = 99999; });
  const prompt = () => G(() => window.__GAME.G.hud.promptLabel);
  const inv = () => G(() => ({ ...window.__GAME.G.player.inv }));
  const fp = () => t.ev(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 > 2500) res(n / 2.5); else requestAnimationFrame(f); }; requestAnimationFrame(f); }));
  const st = (fn) => G((src) => { const s = window.__GAME.G.stage; return new Function('s', 'G', 'return (' + src + ')(s, G)')(s, window.__GAME.G); }, fn.toString());
  const waitFor = async (fn, ms = 20000, step = 150) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await st(fn)) return true; await sleep(step); } return false; };

  // ================= A. menu + load + layout =================
  await page.click('#m-story'); await sleep(250);
  const rows = await G(() => ({ ch: document.querySelectorAll('#menu-sub .chapter').length, go: document.querySelectorAll('#menu-sub .chapter .go').length, locked: document.querySelectorAll('#menu-sub .chapter.locked').length }));
  check('story mode lists 7 chapters, all playable', rows.ch === 7 && rows.go === 7 && rows.locked === 0, JSON.stringify(rows));
  await t.ev(() => document.querySelectorAll('#menu-sub .chapter .go')[6].click());
  await t.waitStage('haven', 40000);
  await sleep(1500);
  await t.shot('100_haven_start');
  const info = await st((s, G) => { const p = G.player; return { st: s.stealthy, lob: s.lobThrow, en: s.enemies.length, loot: s.loot.length, hides: s.hides.length, crates: s.crates.length, bars: s.bars.length, benches: s.interactables.filter((i) => i.bench).length, td: !!s.takedownIt, npcs: Object.keys(s.npcMap).length, phase: s.phase, ammo: p.inv.ammo, shells: p.inv.shells, med: p.inv.medkit, food: p.inv.food, bat: p.inv.batteries, shotgun: p.inv.shotgun, pistol: p.inv.pistol, bottle: p.inv.bottle }; });
  check('Chapter 7 JUMP IN loads the station map', (await t.stage()) === 'haven');
  check('route: stealth stage, 19 idle zombies, 26 loot, 13 crates, 5 dumpsters, 3 workbenches, 3 barricades, 3 survivors', info.st && info.lob && info.en === 19 && info.loot === 26 && info.crates === 13 && info.hides === 5 && info.benches === 3 && info.bars === 3 && info.td && info.npcs === 3 && info.phase === 'route', JSON.stringify(info));
  check('jump-in kit: both guns, ammo 18, shells 6, medkit, food, bottles, 4 batteries', info.shotgun && info.pistol && info.ammo === 18 && info.shells === 6 && info.med === 1 && info.food === 1 && info.bottle === 2 && info.bat === 4, JSON.stringify(info));
  check('objectives: find a safe place + craft (optional)', (await G(() => document.getElementById('objlist').textContent)).includes('metro station') && (await G(() => document.getElementById('objtitle').textContent)).includes('FIND A SAFE PLACE'));
  check('chapter tag + stealth indicator + materials line', await G(() => document.getElementById('chapterTag').textContent.includes('CHAPTER 7') && document.getElementById('stealth').textContent.includes('UNSEEN') && document.getElementById('wmats').textContent.includes('SCRAP 0')));
  const f0 = await fp();
  check('station map >= 20 fps (low)', f0 >= 20, f0.toFixed(1) + ' fps');

  await G(NAV);
  const lay = await G(() => {
    const s = window.__GAME.G.stage, n = window.__navMake(55, 2), bad = [];
    const need = (name, ok) => { if (!ok) bad.push(name); };
    need('spawn free', !n.blocked(55, 2, 0.34));
    for (const it of s.interactables) {
      if (it === s.takedownIt) continue;
      need('interactable@' + it.x.toFixed(1) + ',' + it.z.toFixed(1) + ' ' + (typeof it.label === 'function' ? it.label() : it.label), n.near(it.x, it.z, it.r - 0.25));
    }
    for (const l of s.loot) need('loot ' + l.type + '@' + l.x + ',' + l.z, n.near(l.x, l.z, 0.9) && !n.blocked(l.x, l.z, 0.3));
    for (const e of s.enemies) {
      need('zombie ' + e.type + '@' + e.pos.x + ',' + e.pos.z, !n.blocked(e.pos.x, e.pos.z, 0.38));
      if (e.patrol) for (const w of e.patrol) need('patrol point ' + w, !n.blocked(w[0], w[1], 0.38) && n.reachable(w[0], w[1]));
    }
    for (const sp of [[55, 2], [12.5, 0], [-33, -4.5], [-67, 0], [-76, 0], [-88, -2], [-91.6, 0]]) need('checkpoint spawn ' + sp, n.reachable(sp[0], sp[1]));
    for (const sp of [[-52, 4], [-74, -21.5], [-86, 21.5], [-60, 0], [-74, -16], [-86, 16]]) need('outside siege point ' + sp, n.reachable(sp[0], sp[1]) && !n.blocked(sp[0], sp[1], 0.4));
    for (const k of s.npcs) if (k.mode === 'idle') need('survivor ' + k.name + ' standing in a collider', !n.blocked(k.pos.x, k.pos.z, 0.35));
    return bad;
  });
  check('every pickup/crate/bench/zombie/patrol point/checkpoint/siege point is reachable from the spawn', lay.length === 0, lay.join(' | ').slice(0, 900));
  // the station interior is joined to the street only through the three openings
  const seal = await G(() => {
    const s = window.__GAME.G.stage;
    const open = window.__navMake(-50, 0).reachable(-80, 0);
    for (const b of s.bars) { b.built = true; b.hp = b.maxHp; b.col.off = false; }
    const closed = window.__navMake(-50, 0).reachable(-80, 0);
    for (const b of s.bars) { b.built = false; b.hp = 0; b.col.off = true; }
    return { open, closed };
  });
  check('the station is open through its 3 entrances and sealed when all are barricaded', seal.open === true && seal.closed === false, JSON.stringify(seal));

  // ================= B. route features: crates, crafting, hiding =================
  await safe();
  await tp(46, -10.4); await sleep(350);
  check('SEARCH CRATE prompt in the lot', (await prompt()) === 'SEARCH CRATE', String(await prompt()));
  await t.key('KeyE'); await sleep(500);
  let iv = await inv();
  check('crate gives WOOD +2 and SCRAP +2', iv.wood === 2 && iv.scrap === 2, JSON.stringify(iv));
  check('materials line updates (SCRAP 2 / WOOD 2)', await G(() => { const e = document.getElementById('wmats').textContent; return e.includes('SCRAP 2') && e.includes('WOOD 2'); }));
  await tp(48, -2.6); await sleep(350);
  check('USE WORKBENCH prompt at bench A', (await prompt()) === 'USE WORKBENCH (CRAFT)', String(await prompt()));
  await t.key('KeyE'); await sleep(500);
  const cp = await G(() => ({ paused: window.__GAME.G.paused, txt: document.getElementById('pause-sub').textContent, btns: [...document.querySelectorAll('#pause-sub .inv-item .mgbtn')].map((b) => b.textContent + (b.disabled ? '!' : '')) }));
  check('workbench opens the crafting panel with 4 recipes', cp.paused && ['BARRICADE KIT', 'MEDKIT', 'PISTOL ROUNDS x8', 'SHOTGUN SHELLS x3'].every((x) => cp.txt.includes(x)) && cp.btns.length === 4, JSON.stringify(cp));
  check('kit craftable (CRAFT), medkit missing cloth (NEED CLOTH!), ammo craftable', cp.btns[0] === 'CRAFT' && cp.btns[1] === 'NEED CLOTH!' && cp.btns[2] === 'CRAFT', JSON.stringify(cp.btns));
  await t.shot('101_workbench');
  await page.evaluate(() => document.querySelectorAll('#pause-sub .inv-item .mgbtn')[0].click()); await sleep(250);
  iv = await inv();
  check('crafting a BARRICADE KIT: 2 wood + 1 scrap -> kits 1', iv.kits === 1 && iv.wood === 0 && iv.scrap === 1, JSON.stringify(iv));
  check('craft objective completed + panel refreshed (NEED WOOD)', await G(() => window.__GAME.G.hud.objDone('craft') && [...document.querySelectorAll('#pause-sub .inv-item .mgbtn')][0].textContent === 'NEED WOOD'));
  await page.evaluate(() => document.querySelector('#pause-sub .mbtn.back').click()); await sleep(250);
  check('DONE closes the workbench', (await G(() => window.__GAME.G.paused)) === false);
  check('bench hint shown', await st((s) => s.hints.craft === true));
  check('bottles are lobbed distractions on the route (lobThrow)', await st((s) => s.lobThrow === true));

  await killAll();
  await tp(28, -22.2); await sleep(350);
  check('HIDE prompt at the alley dumpster (route phase)', (await prompt()) === 'HIDE (STEALTH)', String(await prompt()));
  await t.key('KeyE'); await sleep(400);
  check('hiding works (stealth HIDDEN)', await G(() => window.__GAME.G.player.hidden === true && document.getElementById('stealth').textContent.includes('HIDDEN')));
  await sleep(500); await t.key('KeyE'); await sleep(300);
  check('and coming out again', (await G(() => window.__GAME.G.player.hidden)) === false);

  // the depot cache wakes the yard
  await tp(-16.8, -0.9); await sleep(350);
  check('OPEN SUPPLY CACHE prompt in the depot', (await prompt()) === 'OPEN SUPPLY CACHE', String(await prompt()));
  const before = await st((s) => s.enemies.filter((e) => e.alive).length);
  const iv0 = await inv();
  await t.key('KeyE'); await sleep(2200);
  iv = await inv();
  const after = await st((s) => s.enemies.filter((e) => e.alive && !e.stealth).length);
  check('cache gives shells, ammo, medkit and wood', iv.shells >= iv0.shells + 6 && iv.ammo >= iv0.ammo + 12 && iv.medkit >= iv0.medkit + 1 && iv.wood >= iv0.wood + 2, JSON.stringify(iv));
  check('opening the cache triggers an ambush (2 runners + 2 walkers)', after === 4, `${before} -> ${after} chasers`);
  await t.shot('102_ambush');
  await killAll();

  // checkpoints on the route
  await tp(10, 0); await sleep(400);
  check('checkpoint 1 saved at the yard', await G(() => window.__GAME.G.cp.stage === 'haven' && window.__GAME.G.cp.cp === 1));
  await tp(-40, -3); await sleep(400);
  check('checkpoint 2 saved at the plaza', await G(() => window.__GAME.G.cp.cp === 2 && window.__GAME.G.cp.got.phase === 'route'));
  await G(() => { window.__GAME.G.player.inv.kits = 2; window.__GAME.G.player.inv.cloth = 3; });
  await tp(-40.5, -3); await sleep(200);
  await G(() => window.__GAME.G.saveCheckpoint({ chapter: 7, stage: 'haven', cp: 2, got: { phase: 'route' }, at: [-33, -4.5] }));

  // death -> retry from checkpoint 2 (only the plaza is repopulated)
  await G(() => { window.__GAME.G.player.iframes = 0; window.__GAME.G.player.damage(999, 0, 0); });
  await page.waitForFunction(() => !document.getElementById('death').classList.contains('hidden'), { timeout: 8000 });
  await page.click('#d-retry'); await t.waitStage('haven', 40000); await sleep(1500);
  const rs = await st((s, G) => ({ phase: s.phase, cp: s.cp, en: s.enemies.length, loot: s.loot.length, x: +G.player.pos.x.toFixed(1), kits: G.player.inv.kits, cloth: G.player.inv.cloth, alley: s.enemies.filter((e) => e.pos.x > 10).length }));
  check('retry restores checkpoint 2: plaza zombies + loot only, gear kept', rs.phase === 'route' && rs.cp === 2 && rs.en === 8 && rs.loot === 8 && Math.abs(rs.x + 33) < 1.5 && rs.kits === 2 && rs.cloth === 3 && rs.alley === 0, JSON.stringify(rs));

  // ================= C. the gate and the station =================
  await G(NAV); await safe();
  await tp(-55, 0); await sleep(500);
  check('Meera calls from the gate', await st((s) => s.gateCalled === true) && (await G(() => document.getElementById('dtext').textContent)).includes('gate'));
  await G(() => { const s = window.__GAME.G.stage; const z = s.enemies.find((e) => e.alive && e.type === 'walker'); z.aware = true; z.state = 'chase'; window.__chaser = z; });
  await tp(-66, 0); await sleep(700);
  await t.shot('103_station_in');
  const ps = await st((s, G) => ({ phase: s.phase, obj: document.getElementById('objtitle').textContent, list: document.getElementById('objlist').textContent, cp: G.cp.cp, gotPhase: G.cp.got.phase, chaserBar: window.__chaser.siegeBar === s.bars[0], stealthHidden: document.getElementById('stealth').classList.contains('hidden') }));
  check('crossing the gate starts PREPARE FOR THE NIGHT (barricades 0/3 + countdown)', ps.phase === 'prep' && ps.obj.includes('PREPARE') && ps.list.includes('0/3') && ps.list.includes('Nightfall in 2:'), JSON.stringify(ps));
  check('prep checkpoint 3 saved; stealth indicator off; a chaser is sent to the front gate', ps.cp === 3 && ps.gotPhase === 'prep' && ps.chaserBar && ps.stealthHidden, JSON.stringify(ps));
  await sleep(1500);
  check('survivors speak (Meera briefs the player)', (await G(() => document.getElementById('dspeaker').textContent)).length > 0);
  await killAll();
  check('no hiding spots once inside', await st((s) => s.interactables.filter((i) => !i.removed && i.label === 'HIDE (STEALTH)' && i.enabled()).length === 0));

  // ================= D. prepare: stash, kits, barricades =================
  await tp(-89.5, -9.7); await sleep(350);
  check('survivors stash prompt', (await prompt()) === "TAKE THE SURVIVORS' STASH (WOOD, SCRAP, AMMO)", String(await prompt()));
  const w0 = (await inv()).wood, sc0 = (await inv()).scrap, am0 = (await inv()).ammo, sh0 = (await inv()).shells;
  await t.key('KeyE'); await sleep(400);
  iv = await inv();
  check('stash: +6 wood +3 scrap +16 ammo +4 shells (once)', iv.wood === Math.min(12, w0 + 6) && iv.scrap === Math.min(12, sc0 + 3) && iv.ammo === Math.min(60, am0 + 16) && iv.shells === Math.min(24, sh0 + 4) && (await st((s) => s.gotStash === true)), JSON.stringify(iv));
  await G(() => { const i = window.__GAME.G.player.inv; i.wood = 6; i.scrap = 3; i.kits = 0; });
  await tp(-84, -6.6); await sleep(350);
  await t.key('KeyE'); await sleep(400);
  for (let k = 0; k < 3; k++) { await page.evaluate(() => document.querySelectorAll('#pause-sub .inv-item .mgbtn')[0].click()); await sleep(150); }
  await page.evaluate(() => document.querySelector('#pause-sub .mbtn.back').click()); await sleep(250);
  iv = await inv();
  check('3 barricade kits crafted at bench C (6 wood + 3 scrap)', iv.kits === 3 && iv.wood === 0 && iv.scrap === 0, JSON.stringify(iv));
  // no kit -> refused
  await G(() => { window.__GAME.G.player.inv.kits = 0; });
  await tp(-64.8, 0); await sleep(350);
  check('without a kit the gate prompt says NEED A BARRICADE KIT', (await prompt()) === 'FRONT GATE: NEED A BARRICADE KIT', String(await prompt()));
  await t.key('KeyE'); await sleep(300);
  check('and nothing is built', await st((s) => s.bars[0].built === false && s.bars[0].col.off === true));
  await G(() => { window.__GAME.G.player.inv.kits = 3; });
  await sleep(300);
  check('with a kit the prompt offers BUILD FRONT GATE (KIT x3)', (await prompt()) === 'BUILD FRONT GATE (KIT x3)', String(await prompt()));
  await t.key('KeyE'); await sleep(1300);
  const b0 = await st((s, G) => ({ built: s.bars[0].built, hp: s.bars[0].hp, col: !s.bars[0].col.off, kits: G.player.inv.kits, locked: G.player.locked, obj: document.getElementById('objlist').textContent, vis: s.bars[0].group.visible }));
  check('front gate barricaded: collider on, 220 hp, kit spent, objective 1/3', b0.built && b0.hp === 220 && b0.col && b0.kits === 2 && !b0.locked && b0.obj.includes('1/3') && b0.vis, JSON.stringify(b0));
  await t.shot('104_barricade_built');
  await tp(-74, -11.4); await sleep(350);
  check('north window prompt', (await prompt()) === 'BUILD NORTH WINDOW (KIT x2)', String(await prompt()));
  await t.key('KeyE'); await sleep(1300);
  check('prep timer is still running while two entrances are done', await st((s) => s.phase === 'prep' && s.bars.filter((b) => b.built).length === 2));
  await tp(-86, 11.4); await sleep(350);
  check('loading door prompt', (await prompt()) === 'BUILD LOADING DOOR (KIT x1)', String(await prompt()));
  await t.key('KeyE'); await sleep(1300);
  check('all three sealed: banner + objective complete', await G(() => window.__GAME.G.hud.objDone('bars')) && (await G(() => document.getElementById('bt').textContent)).includes('SEALED'));
  await tp(-80, 0); await sleep(300);
  check('barricaded station cannot be entered from the street', await G(() => !window.__navMake(-50, 0).reachable(-80, 0)));
  await t.shot('105_all_sealed');

  // ================= E. siege: wave 1 =================
  const w1 = await waitFor((s) => s.phase === 'siege' && s.wave === 1 && !s.waveSpawning && s.waveZ.length === 7, 15000);
  check('hammering draws the first wave (7 zombies) and the siege begins', w1);
  const wz = await st((s, G) => ({ siege: s.waveZ.every((z) => !!z.siegeBar), types: s.waveZ.map((z) => z.type).sort().join(','), lob: s.lobThrow, cp: G.cp.cp, wave: G.cp.got.wave, bars: G.cp.got.bars.map((b) => b.built).join(), obj: document.getElementById('objlist').textContent, red: document.getElementById('fx-red').classList.contains('on') }));
  check('wave 1 = 6 walkers + runner (all sent to a barricade); bottles now hit; cp4 saved with barricade state', wz.siege && wz.types.split(',').filter((x) => x === 'walker').length === 6 && wz.lob === false && wz.cp === 4 && wz.wave === 1 && wz.bars === 'true,true,true' && wz.red, JSON.stringify(wz));
  check('objective shows the wave + barricades up', wz.obj.includes('wave 1 of 3') && wz.obj.includes('3/3'), wz.obj);
  // goal logic unit checks
  const goals = await st((s) => {
    const b = s.bars[0];
    const fake = (x, z, type = 'walker') => ({ siegeBar: b, pos: { x, z }, type });
    const r = {};
    r.far = s.siegeGoal(fake(-50, 6));
    r.atWall = s.siegeGoal(fake(-60.6, 1));
    r.spitter = s.siegeGoal(fake(-60.6, 1, 'spitter'));
    r.inside = s.siegeGoal(fake(-66, 0));
    b.built = false;
    r.openFar = s.siegeGoal(fake(-52, 0));
    r.openNear = s.siegeGoal(fake(-60, 0.4));
    r.openSide = s.siegeGoal(fake(-60, 6));
    b.built = true;
    return r;
  });
  check('siege goals: approach the wall, bash when there, spitters hold, nothing once inside',
    goals.far && Math.abs(goals.far.x + 60.9) < 0.2 && goals.atWall.bash === true && goals.spitter.hold === true && goals.inside === null, JSON.stringify(goals));
  check('open entrance: line up outside, then walk straight in', goals.openFar && goals.openFar.x > -61 && goals.openNear.x < -62 && goals.openSide.x > -61, JSON.stringify(goals));
  await t.shot('106_wave1');
  const bashing = await waitFor((s) => s.waveZ.some((z) => z.alive && z.state === 'bash'), 40000, 250);
  check('zombies reach the barricades and start bashing them', bashing);
  const dmg = await waitFor((s) => s.bars.some((b) => b.hp < 220), 10000);
  check('barricade hit points drop under the blows', dmg, JSON.stringify(await st((s) => s.bars.map((b) => Math.round(b.hp)))));
  await t.shot('107_bashing');
  // a barricade that gives way lets them through to the player
  await st((s) => { const b = s.bars.find((x) => x.hp < 220) || s.bars[0]; b.hp = 5; window.__weak = b.id; });
  const broke = await waitFor((s) => s.bars[window.__weak].built === false && s.bars[window.__weak].col.off === true, 25000, 200);
  check('a destroyed barricade opens the entrance (collider off, planks gone)', broke, JSON.stringify(await st((s) => s.bars.map((b) => b.built))));
  await tp(-82, 0);
  const through = await waitFor((s) => s.waveZ.some((z) => z.alive && z.siegeBar && z.siegeBar.id === window.__weak && ((z.pos.x - z.siegeBar.x) * z.siegeBar.nx + (z.pos.z - z.siegeBar.z) * z.siegeBar.nz) < 0), 40000, 250);
  check('zombies stream through the broken entrance', through);
  await t.shot('108_breach');
  await killAll(); await sleep(600);
  check('wave 1 cleared -> a rest period (lull) starts', await st((s) => s.lull === true && s.wave === 1 && s.phase === 'siege'));
  check('wave-cleared banner + rest objective', (await G(() => document.getElementById('bt').textContent)).includes('WAVE 1 CLEARED') && (await G(() => document.getElementById('objlist').textContent)).includes('cleared'));

  // support between waves
  await G(() => { const p = window.__GAME.G.player; p.hp = 30; p.iframes = 99999; p.inv.ammo = 10; p.inv.shells = 2; });
  await tp(-81, -3); await sleep(350);
  check('Meera offers treatment during the lull', (await prompt()) === 'MEERA: TREAT MY WOUNDS (FULL HEALTH)', String(await prompt()));
  await t.key('KeyE'); await sleep(400);
  check('treatment restores full health, once per lull', await G(() => window.__GAME.G.player.hp === 100) && (await st((s) => s.restocks.meera === true)) && (await prompt()) === 'TALK TO MEERA', String(await prompt()));
  await tp(-86.5, 3.8); await sleep(350);
  check('Kabir offers ammo during the lull', (await prompt()) === 'KABIR: GET AMMO (+16 / +5 SHELLS)', String(await prompt()));
  await t.key('KeyE'); await sleep(400);
  iv = await inv();
  check('Kabir: +16 ammo +5 shells, once per lull', iv.ammo === 26 && iv.shells === 7 && (await prompt()) === 'TALK TO KABIR', JSON.stringify(iv));
  // rebuild the broken entrance with a kit crafted from loot
  await G(() => { const i = window.__GAME.G.player.inv; i.kits = 1; });
  const wk = await st((s) => window.__weak);
  const at = await st((s) => s.bars[window.__weak].at);
  await tp(at[0], at[1]); await sleep(350);
  check('broken entrance offers a rebuild during the lull', (await prompt() || '').startsWith('BUILD '), String(await prompt()));
  await t.key('KeyE'); await sleep(1300);
  check('rebuilt: barricade back at full strength', await st((s) => s.bars[window.__weak].built && s.bars[window.__weak].hp === 220 && !s.bars[window.__weak].col.off));
  check('no hiding during the siege + takedown irrelevant: dumpsters disabled', await st((s) => s.interactables.filter((i) => !i.removed && i.label === 'HIDE (STEALTH)' && i.enabled()).length === 0));

  // ================= F. wave 2 + death/retry =================
  await st((s) => { s.lullT = 0.2; });
  const w2 = await waitFor((s) => s.wave === 2 && !s.waveSpawning && s.waveZ.length === 10, 15000);
  const t2 = await st((s, G) => ({ types: s.waveZ.map((z) => z.type), cp: G.cp.got.wave, lull: s.lull }));
  check('wave 2 = 10 zombies incl. 2 spitters + 3 runners; checkpoint holds wave 2', w2 && t2.types.filter((x) => x === 'spitter').length === 2 && t2.types.filter((x) => x === 'runner').length === 3 && t2.cp === 2 && !t2.lull, JSON.stringify(t2));
  const fW = await fp();
  check('wave 2 with ~10 zombies >= 18 fps (low)', fW >= 18, fW.toFixed(1) + ' fps');
  await t.shot('109_wave2');
  const hold = await waitFor((s) => s.waveZ.some((z) => z.alive && z.type === 'spitter' && z.state !== 'stagger' && Math.hypot(z.pos.x - z.siegeBar.x, z.pos.z - z.siegeBar.z) < 3.0), 45000, 300);
  check('spitters reach the entrance and spit over the barricade', hold);
  // die in the middle of wave 2 -> retry restarts wave 2 with the barricades as they were
  await G(() => { const g = window.__GAME; g.G.player.inv.kits = 1; g.G.player.iframes = 0; g.G.player.damage(999, 0, 0); });
  await page.waitForFunction(() => !document.getElementById('death').classList.contains('hidden'), { timeout: 8000 });
  await page.click('#d-retry'); await t.waitStage('haven', 40000); await sleep(1500);
  const rr = await st((s, G) => ({ phase: s.phase, wave: s.wave, bars: s.bars.map((b) => b.built).join(), hp: s.bars.map((b) => Math.round(b.hp)).join(), en: s.enemies.length, x: +G.player.pos.x.toFixed(1), lob: s.lobThrow, mats: !!document.getElementById('wmats').textContent }));
  check('retry in the siege: station state restored (3 barricades, wave 2 about to start)', rr.phase === 'siege' && rr.wave === 2 && rr.bars === 'true,true,true' && rr.en === 0 && Math.abs(rr.x + 76) < 1.5 && rr.lob === false && rr.mats, JSON.stringify(rr));
  await safe();
  const w2b = await waitFor((s) => s.wave === 2 && s.waveZ.length === 10 && !s.waveSpawning, 20000);
  check('the interrupted wave 2 starts again after a short countdown', w2b);
  // safety net: a wave that drags on for 150 s is ended (stragglers fall back)
  await st((s) => { s.waveT = 149.5; });
  await sleep(1500);
  check('a wave that drags on is ended by the safety net (stragglers fall back)', await st((s) => s.waveZ.every((z) => !z.alive)));
  await sleep(600);
  check('wave 2 cleared -> lull', await st((s) => s.lull === true && s.wave === 2));

  // ================= G. wave 3 (brute) + dawn =================
  await st((s) => { s.lullT = 0.2; });
  const w3 = await waitFor((s) => s.wave === 3 && !s.waveSpawning && s.waveZ.length === 11, 15000);
  const t3 = await st((s) => s.waveZ.map((z) => z.type));
  check('wave 3 = 11 zombies led by a brute', w3 && t3.includes('brute') && t3.filter((x) => x === 'runner').length === 4, JSON.stringify(t3));
  check('banner names the last wave', (await G(() => document.getElementById('bt').textContent)).includes('WAVE 3'));
  const hp0 = await G(() => { const p = window.__GAME.G.player; p.hp = 40; return p.hp; });
  await killAll(); await sleep(800);
  const dn = await st((s, G) => ({ phase: s.phase, cp: G.cp.cp, gp: G.cp.got.phase, hp: G.player.hp, obj: document.getElementById('objlist').textContent, red: document.getElementById('fx-red').classList.contains('on') }));
  check('wave 3 cleared -> DAWN: radio objective, +50 health, checkpoint 5', dn.phase === 'dawn' && dn.cp === 5 && dn.gp === 'dawn' && dn.hp >= 90 && dn.obj.includes('radio') && !dn.red, JSON.stringify(dn));
  await waitFor((s) => s.dawnK > 0.95, 25000, 300);
  const lit = await st((s) => ({ k: s.dawnK, fog: s.scene.fog.color.getHexString(), bg: s.scene.backgroundIntensity }));
  check('the sky and fog turn to dawn', lit.k > 0.95 && lit.fog !== '14062e' && lit.bg > 1.0, JSON.stringify(lit));
  await t.shot('110_dawn');

  // ================= H. the radio =================
  await tp(-91.6, 0); await sleep(400);
  check('POWER THE RADIO prompt (dawn only)', (await prompt()) === 'POWER THE RADIO (BATTERIES)', String(await prompt()));
  await t.key('KeyE'); await sleep(500);
  check('battery mini-game opens', await G(() => !document.getElementById('mg').classList.contains('hidden')));
  await page.waitForFunction(() => document.getElementById('mg').classList.contains('hidden'), { timeout: 9000 });
  check('too slow: the contacts slip, can try again', await st((s) => s.radioDone === false) && (await G(() => !window.__GAME.G.player.locked)));
  await sleep(300);
  await t.key('KeyE'); await sleep(500);
  for (let i = 0; i < 6; i++) { await page.click('#mg .mgbtn.big'); await sleep(60); }
  await sleep(2600);
  const rd = await st((s, G) => ({ done: s.radioDone, bat: G.player.inv.batteries, cut: !!G.camRig.cut, locked: G.player.locked, speaker: document.getElementById('dspeaker').textContent }));
  check('radio powered: batteries used, camera cuts to the radio, transmission begins', rd.done && rd.bat === 0 && rd.cut && rd.locked, JSON.stringify(rd));
  await t.shot('111_radio');
  const heard = [];
  const t0 = Date.now();
  while (Date.now() - t0 < 100000) {
    const d = await G(() => ({ sp: document.getElementById('dspeaker').textContent, tx: document.getElementById('dtext').textContent, end: !document.getElementById('end').classList.contains('hidden') }));
    if (d.tx && heard[heard.length - 1] !== d.tx) heard.push(d.tx);
    if (d.end) break;
    await sleep(400);
  }
  const all = heard.join(' | ');
  check('the transmission plays (Terminus Control, last train, platform nine, knows his name) + the survivors react', ['Terminus Control', 'last train', 'Platform Nine', 'Aarav', 'know my name', 'One last commute'].every((x) => all.includes(x)), all.slice(0, 500));
  await page.waitForFunction(() => !document.getElementById('end').classList.contains('hidden'), { timeout: 20000 });
  const en = await G(() => ({ sub: document.getElementById('end-sub').textContent, next: document.getElementById('end-next').textContent, btn: !document.getElementById('e-next').classList.contains('hidden'), cleared: window.__GAME.Save.load().cleared }));
  check('end screen: CHAPTER 7 COMPLETE, no next chapter, signal teaser, progress saved', en.sub === 'CHAPTER 7 COMPLETE' && !en.btn && en.next.includes('SIGNAL') && en.cleared === 7, JSON.stringify(en));
  await t.shot('112_end7');

  // ================= I. chapter 6 -> 7 flow + inventory =================
  await page.click('#e-menu'); await t.waitStage('menu', 30000); await sleep(800);
  await page.click('#m-story'); await sleep(250);
  await t.ev(() => document.querySelectorAll('#menu-sub .chapter .go')[5].click());
  await t.waitStage('mart', 40000); await sleep(1200);
  await G(() => window.__GAME.G.finishChapters(6)); await sleep(700);
  check('chapter 6 end screen now offers NEXT CHAPTER (7)', await G(() => !document.getElementById('e-next').classList.contains('hidden') && document.getElementById('end-next').textContent.includes('CHAPTER 7')), await G(() => document.getElementById('end-next').textContent));
  const sv = await G(() => { const s = window.__GAME.Save.load(); return { stage: s.stage, ch: s.cp !== undefined ? s.chapter : null, cp: s.cp, got: s.got }; });
  check('finishing chapter 6 saves a chapter-7 checkpoint', sv.stage === 'haven' && sv.ch === 7 && sv.cp === 0 && sv.got === null, JSON.stringify(sv));
  await page.click('#e-next'); await t.waitStage('haven', 40000); await sleep(1200);
  check('NEXT CHAPTER from chapter 6 enters the station map', (await t.stage()) === 'haven' && (await st((s) => s.phase === 'route' && s.cp === 0)));
  await G(() => window.__GAME.G.menu()); await t.waitStage('menu', 30000); await sleep(600);
  check('menu shows CHAPTER 7 for Continue', (await G(() => document.getElementById('m-cont-sub').textContent)).includes('7'));
  await page.click('#m-continue'); await t.waitStage('haven', 40000); await sleep(1000);
  check('Continue loads the station map', (await t.stage()) === 'haven');
  await G(() => { const i = window.__GAME.G.player.inv; i.scrap = 3; i.cloth = 2; i.wood = 4; i.kits = 1; });
  await G(() => window.__GAME.G.ui.openPause('inv')); await sleep(300);
  const invTxt = await G(() => document.getElementById('pause-sub').textContent);
  check('inventory lists SCRAP / CLOTH / WOOD / BARRICADE KITS', ['SCRAP', 'CLOTH', 'WOOD', 'BARRICADE KITS'].every((x) => invTxt.includes(x)), invTxt.slice(0, 200));
  await t.shot('113_inventory');

  const errs = t.errors.concat((await t.errlog()) ? [await t.errlog()] : []);
  check('no runtime errors in Chapter 7', errs.length === 0, errs.join(' | ').slice(0, 1500));
  const f = summary();
  await t.close();
  process.exit(f ? 1 : 0);
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(2); });
