const { launch, sleep, check, summary } = require('./lib');

(async () => {
  console.log('T4: Chapter 3 (bus stop) + boarding');
  const t = await launch({ settings: { quality: 'low' } });
  const { page } = t;
  const G = (fn, ...a) => t.ev(fn, ...a);
  const tp = (x, z) => G((x, z) => { const p = window.__GAME.G.player; p.pos.set(x, 0, z); p.vx = p.vz = 0; }, x, z);

  await page.click('#m-story'); await sleep(200);
  await t.ev(() => document.querySelectorAll('#menu-sub .chapter .go')[2].click());
  await t.waitStage('busstop');
  check('JUMP IN chapter 3 loads the bus stop', (await t.stage()) === 'busstop');
  await sleep(1500);
  await t.shot('30_busstop_a');
  check('objectives (3)', (await G(() => document.querySelectorAll('#objlist li').length)) === 3);
  check('bus hidden until it arrives', await G(() => window.__GAME.G.stage.bus.root.visible === false));

  // talk to the NPCs at the stop
  await tp(14 - 1.5, 9.0); await sleep(300);
  await t.key('KeyE'); await sleep(400);
  check('talk to woman at the stop', await G(() => !document.getElementById('dialogue').classList.contains('hidden')), await G(() => document.getElementById('dtext').textContent));
  check('standing at the stop starts the wait', await G(() => window.__GAME.G.stage.waiting === true));
  check('"reach" objective done', await G(() => window.__GAME.G.hud.objDone('reach')));

  // boarding prompt must NOT be active before the bus arrives
  check('board prompt hidden before bus arrives', (await G(() => window.__GAME.G.hud.promptLabel)) !== 'BOARD BUS 42');

  // let the wait timeline run (24 s of game time) while checking events
  const seen = new Set();
  const t0 = Date.now();
  let shotA = false, shotB = false;
  while (Date.now() - t0 < 45000) {
    const st = await G(() => { const s = window.__GAME.G.stage; return { bs: s.busState, w: s.waitT, ev: s.events.filter((e) => e.done).length, fl: s.flickerLevel, bx: s.bus.x }; });
    seen.add(st.bs);
    if (!shotA && st.w > 12) { shotA = true; await t.shot('31_busstop_alarm'); }
    if (st.bs === 'arrive' && !shotB && st.bx < 40) { shotB = true; await t.shot('32_bus_arriving'); }
    if (st.bs === 'stopped') break;
    await sleep(500);
  }
  check('bus goes none -> arrive -> stopped', seen.has('arrive') && seen.has('stopped'), [...seen].join('>'));
  check('all 6 wait events fired', await G(() => window.__GAME.G.stage.events.every((e) => e.done)));
  check('some NPCs fled', await G(() => window.__GAME.G.stage.walkers.some((n) => n.mode === 'flee')));
  await sleep(1500);
  await t.shot('33_bus_stopped');
  check('bus doors opened', await G(() => window.__GAME.G.stage.doorK >= 0.99));
  check('bus collider added (cannot walk through)', await G(() => !!window.__GAME.G.stage._busCol));

  // walk into the bus body: should be blocked
  await tp(17.6, 8.6); await sleep(100);
  await G(() => { const p = window.__GAME.G.player; p.vz = -6; });
  await page.keyboard.down('KeyW'); await sleep(10); await page.keyboard.up('KeyW');
  await tp(14, 8.0); await sleep(350);
  check('BOARD BUS 42 prompt appears at the door', (await G(() => window.__GAME.G.hud.promptLabel)) === 'BOARD BUS 42', String(await G(() => window.__GAME.G.hud.promptLabel)));
  await t.key('KeyE'); await sleep(600);
  check('swipe-card mini-game opens', await G(() => !document.getElementById('mg').classList.contains('hidden') && !!document.querySelector('#mg .card')));
  await t.shot('34_swipe');

  // first a too-fast swipe (should be rejected), then a steady one
  let card = await (await page.$('#mg .card')).boundingBox();
  let area = await (await page.$('#mg .mgarea')).boundingBox();
  let cy = card.y + card.height / 2;
  await page.mouse.move(card.x + 20, cy); await page.mouse.down();
  await page.mouse.move(area.x + area.width - 10, cy, { steps: 2 }); await page.mouse.up();
  await sleep(300);
  const msg1 = await G(() => document.querySelector('#mg .mgmsg').textContent);
  check('too-fast swipe is rejected', /TOO FAST/.test(msg1), msg1);
  card = await (await page.$('#mg .card')).boundingBox();
  await page.mouse.move(card.x + 20, cy); await page.mouse.down();
  const steps = 40, x1 = area.x + area.width - 10;
  for (let i = 1; i <= steps; i++) { await page.mouse.move(card.x + 20 + (x1 - card.x - 20) * i / steps, cy); await sleep(18); }
  await page.mouse.up(); await sleep(900);
  const msg2 = await G(() => (document.querySelector('#mg .mgmsg') || {}).textContent || '(closed)');
  check('steady swipe accepted (mini-game closes)', await G(() => document.getElementById('mg').classList.contains('hidden')), msg2);
  check('board objective done', await G(() => window.__GAME.G.hud.objDone('board')));
  await t.waitStage('bus', 15000);
  check('moves on to the bus interior', (await t.stage()) === 'bus');
  await sleep(1200);
  await t.shot('35_bus_inside');

  const errs = t.errors.concat((await t.errlog()) ? [await t.errlog()] : []);
  check('no runtime errors in Chapter 3', errs.length === 0, errs.join(' | ').slice(0, 800));
  const f = summary();
  await t.close();
  process.exit(f ? 1 : 0);
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(2); });
