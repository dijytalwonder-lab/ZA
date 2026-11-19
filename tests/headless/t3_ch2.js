const { launch, sleep, check, summary } = require('./lib');

(async () => {
  console.log('T3: Chapter 2 (city lights) full run');
  const t = await launch({ settings: { quality: 'low' } });
  const { page } = t;
  const G = (fn, ...a) => t.ev(fn, ...a);
  const tp = (x, z) => G((x, z) => { const p = window.__GAME.G.player; p.pos.set(x, 0, z); p.vx = p.vz = 0; }, x, z);

  await page.click('#m-story'); await sleep(200);
  await t.ev(() => document.querySelectorAll('#menu-sub .chapter .go')[1].click());
  await t.waitStage('city');
  check('JUMP IN chapter 2 loads the city', (await t.stage()) === 'city');
  await page.waitForFunction(() => !window.__GAME.G.player.locked, { timeout: 8000 });
  await sleep(500);
  await t.shot('20_city_a');
  check('starter kit given (backpack/pass)', await G(() => { const i = window.__GAME.G.player.inv; return i.backpack && i.pass && i.phone; }));
  check('city has NPCs, buildings, traffic', await G(() => { const s = window.__GAME.G.stage; return s.npcs.length >= 15 && s.buildings.length > 20 && s.traffic.cars.length >= 28; }), await G(() => { const s = window.__GAME.G.stage; return `${s.npcs.length} npcs, ${s.buildings.length} bldgs, ${s.traffic.cars.length} cars`; }));
  const fps = await t.ev(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 > 2000) res(n / 2); else requestAnimationFrame(f); }; requestAnimationFrame(f); }));
  check('city runs >= 20 fps (low quality)', fps >= 20, fps.toFixed(1) + ' fps');

  // walk with the real keys
  const x0 = await G(() => window.__GAME.G.player.pos.x);
  await page.keyboard.down('KeyD'); await sleep(900); await page.keyboard.up('KeyD');
  // (camera looks +X so W is forward) -> use W
  await page.keyboard.down('KeyW'); await sleep(1200); await page.keyboard.up('KeyW');
  const x1 = await G(() => window.__GAME.G.player.pos.x);
  check('W walks along the street (+X)', x1 - x0 > 1.5, `dx=${(x1 - x0).toFixed(2)}`);

  // coins: stand on a coin
  const coin = await G(() => { const c = window.__GAME.G.stage.coins.pts.find((p) => !p.got); return { x: c.x, z: c.z }; });
  const c0 = await G(() => window.__GAME.G.player.inv.coins);
  await tp(coin.x, coin.z); await sleep(300);
  check('coin pickup adds coins', (await G(() => window.__GAME.G.player.inv.coins)) > c0);
  check('coin objective text updates', (await G(() => document.getElementById('objlist').textContent)).includes('(1/'));

  // traffic damage
  await G(() => { const s = window.__GAME.G.stage; s.traffic.speedScale = 1; });
  const hp0 = await G(() => window.__GAME.G.player.hp);
  await G(() => { const s = window.__GAME.G.stage; const c = s.traffic.cars.find((q) => q.lane.z === -1.75 && q.v > 3); const p = window.__GAME.G.player; p.pos.set(-60, 0, c.lane.z); c.x = -61.5; c.v = 8; p.iframes = 0; });
  await sleep(250);
  const hp1 = await G(() => window.__GAME.G.player.hp);
  check('car hit damages the player', hp1 < hp0, `${hp0} -> ${hp1}`);
  await sleep(600);

  // traffic light cycle changes
  const states = new Set();
  for (let i = 0; i < 6; i++) { states.add(await G(() => window.__GAME.G.stage.light)); await sleep(1) ; }
  check('traffic light state exists', [...states].every((s) => ['green', 'yellow', 'red'].includes(s)), [...states].join());
  await G(() => { window.__GAME.G.stage.time = 12.5; }); await sleep(300);
  check('light turns red at t=12.5', (await G(() => window.__GAME.G.stage.light)) === 'red');
  await G(() => { window.__GAME.G.stage.time = 0; }); await sleep(300);

  // crossing objective (north side then south side)
  await tp(-95, -9); await sleep(200);
  await G(() => { window.__GAME.G.player.hp = 100; });
  await tp(-95, -8.4); await sleep(150);
  await tp(-95, 8.4); await sleep(300);
  check('crossing objective completes', await G(() => window.__GAME.G.hud.objDone('cross')));
  check('safe crossing awards bonus', (await G(() => window.__GAME.G.player.inv.coins)) >= 25);

  // talk NPC
  const chai = await G(() => { const n = window.__GAME.G.stage.chai; return { x: n.pos.x, z: n.pos.z }; });
  await tp(chai.x + 0.2, chai.z + 1.2); await sleep(300);
  const lab = await G(() => window.__GAME.G.hud.promptLabel);
  check('TALK prompt near chai wala', lab === 'TALK', String(lab));
  await t.key('KeyE'); await sleep(500);
  check('dialogue box shows NPC line', await G(() => !document.getElementById('dialogue').classList.contains('hidden') && document.getElementById('dtext').textContent.length > 5), await G(() => document.getElementById('dtext').textContent));
  check('talk objective completed', await G(() => window.__GAME.G.hud.objDone('talk')));

  // buy chai
  await G(() => { const p = window.__GAME.G.player; p.inv.coins = 30; p.hp = 40; });
  await tp(-64.4, -9.3); await sleep(300);
  check('BUY CHAI prompt', (await G(() => window.__GAME.G.hud.promptLabel)) === 'BUY CHAI (10 COINS)', String(await G(() => window.__GAME.G.hud.promptLabel)));
  await t.key('KeyE'); await sleep(300);
  check('chai heals and costs 10 coins', await G(() => { const p = window.__GAME.G.player; return p.hp >= 70 && p.inv.coins === 20; }), await G(() => { const p = window.__GAME.G.player; return `hp ${p.hp} coins ${p.inv.coins}`; }));
  // buy cola
  await tp(33.2, 18.6); await sleep(300);
  await t.key('KeyE'); await sleep(300);
  check('cola buys a bottle for 15', await G(() => { const p = window.__GAME.G.player; return p.inv.bottle >= 2 && p.inv.coins === 5; }), await G(() => { const p = window.__GAME.G.player; return `bottle ${p.inv.bottle} coins ${p.inv.coins}`; }));

  // scripted events in order
  const xs = [-82, -58, -44, -22, 4, 22, 43];
  for (const x of xs) {
    await tp(x, 9.5); await sleep(450);
    if (x === -44) await t.shot('21_city_news');
    if (x === -22) await t.shot('22_city_police');
    if (x === 4) await t.shot('23_city_panic');
    if (x === 22) await t.shot('24_city_alert');
  }
  check('all 7 scripted events fired', await G(() => window.__GAME.G.stage.events.every((e) => e.done)));
  check('flicker level rose', (await G(() => window.__GAME.G.stage.flickerLevel)) >= 0.9);
  check('police car spawned & moving', await G(() => window.__GAME.G.stage.police.x !== -220));
  check('fleeing NPCs exist', await G(() => window.__GAME.G.stage.walkers.some((n) => n.mode === 'flee')));
  await t.shot('25_city_end');

  // death + retry
  await G(() => { const p = window.__GAME.G.player; p.hp = 5; p.iframes = 0; p.damage(50, p.pos.x + 1, p.pos.z); });
  await sleep(2200);
  check('death screen appears', await G(() => !document.getElementById('death').classList.contains('hidden')));
  await t.shot('26_death');
  await page.click('#d-retry');
  await t.waitStage('city', 15000); await sleep(1200);
  check('retry reloads the city at checkpoint', await G(() => { const G_ = window.__GAME.G; return G_.stage.key === 'city' && !G_.player.dead && G_.player.hp > 30 && G_.player.pos.x < -80; }), await G(() => { const G_ = window.__GAME.G; return `hp ${G_.player.hp} x ${G_.player.pos.x.toFixed(1)}`; }));
  check('death overlay hidden after retry', await G(() => document.getElementById('death').classList.contains('hidden')));

  // finish at the bus stop
  await page.waitForFunction(() => !window.__GAME.G.player.locked, { timeout: 8000 });
  await tp(53, 9); await sleep(300);
  check('reaching the stop completes chapter 2', await G(() => window.__GAME.G.stage.finished === true));
  await t.waitStage('busstop', 15000);
  check('moves on to Chapter 3 (bus stop)', (await t.stage()) === 'busstop');
  await sleep(800);
  await t.shot('27_busstop_start');

  const errs = t.errors.concat((await t.errlog()) ? [await t.errlog()] : []);
  check('no runtime errors in Chapter 2', errs.length === 0, errs.join(' | ').slice(0, 800));
  const f = summary();
  await t.close();
  process.exit(f ? 1 : 0);
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(2); });
