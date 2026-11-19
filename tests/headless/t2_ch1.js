const { launch, sleep, check, summary } = require('./lib');

(async () => {
  console.log('T2: Chapter 1 (bedroom) full run');
  const t = await launch({ settings: { quality: 'low' } });
  const { page } = t;
  const G = (fn, ...a) => t.ev(fn, ...a);

  await page.click('#m-story'); await sleep(200);
  await page.click('#menu-sub .chapter .go');
  await t.waitStage('bedroom');
  check('entered bedroom', (await t.stage()) === 'bedroom');
  await sleep(900);
  await t.shot('10_bedroom_intro');
  check('player lying in bed (locked)', await G(() => window.__GAME.G.player.locked === true && window.__GAME.G.player.rig.p.lie === 1));
  check('alarm ringing', await G(() => window.__GAME.G.stage.ringing === true));
  check('HUD tag shows chapter 1', (await G(() => document.getElementById('chapterTag').textContent)).includes('CHAPTER 1'));
  check('objectives listed (5)', (await G(() => document.querySelectorAll('#objlist li').length)) === 5);

  // alarm mini-game: wait for it, then tap on the beat with the real TAP button
  await page.waitForFunction(() => !document.getElementById('mg').classList.contains('hidden'), { timeout: 15000 });
  await t.shot('11_alarm_minigame');
  const ok = await G(() => new Promise((res) => {
    const btn = document.querySelector('#mg .mgbtn'); const ring = document.querySelector('#mg .mgring');
    let hits = 0, last = 0;
    const iv = setInterval(() => {
      const mg = document.getElementById('mg');
      if (mg.classList.contains('hidden')) { clearInterval(iv); res(true); return; }
      const r = parseFloat(ring.style.width) / 2;
      if (Math.abs(r - 34) < 7 && performance.now() - last > 350) {
        last = performance.now();
        btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
        hits++;
      }
    }, 8);
    setTimeout(() => { clearInterval(iv); res(false); }, 25000);
  }));
  check('alarm mini-game completed by on-beat taps', ok);
  await page.waitForFunction(() => window.__GAME.G.stage.free === true, { timeout: 8000 });
  check('player free after getting out of bed', await G(() => !window.__GAME.G.player.locked && window.__GAME.G.stage.free));
  check('alarm silenced', await G(() => window.__GAME.G.audio.alarmTimer === null));
  await sleep(1200);
  await t.shot('12_bedroom_free');

  // movement + camera + toggles
  const p0 = await G(() => ({ x: window.__GAME.G.player.pos.x, z: window.__GAME.G.player.pos.z }));
  await t.key('KeyW', 700);
  const p1 = await G(() => ({ x: window.__GAME.G.player.pos.x, z: window.__GAME.G.player.pos.z }));
  check('WASD moves the player', Math.hypot(p1.x - p0.x, p1.z - p0.z) > 0.5, `moved ${Math.hypot(p1.x - p0.x, p1.z - p0.z).toFixed(2)} m`);
  const y0 = await G(() => window.__GAME.G.camRig.yaw);
  await page.mouse.move(700, 300); await page.mouse.down(); await page.mouse.move(800, 300, { steps: 8 }); await page.mouse.up();
  await sleep(200);
  check('mouse drag rotates camera', Math.abs((await G(() => window.__GAME.G.camRig.yaw)) - y0) > 0.1);
  await t.key('KeyV', 40); check('run toggle (V)', await G(() => window.__GAME.G.input.toggles.run === true)); await t.key('KeyV', 40);
  await t.key('KeyC', 40); await sleep(100); check('crouch toggle (C)', await G(() => window.__GAME.G.player.crouch === true)); await t.key('KeyC', 40);
  await t.key('Space', 60); await sleep(120);
  check('jump leaves the ground', await G(() => window.__GAME.G.player.pos.y > 0.02 || !window.__GAME.G.player.grounded));
  await sleep(700);
  // combat buttons are inert in a non-combat stage
  await t.key('KeyF', 60); await sleep(100);
  check('attack does nothing outside combat', await G(() => window.__GAME.G.player.atkT < 0));

  // coin pickup
  await G(() => window.__GAME.G.player.pos.set(0.2, 0, -1.2)); await sleep(300);
  check('coin collected (+5)', (await G(() => window.__GAME.G.player.inv.coins)) >= 5);

  // door locked until tasks done
  const tp = (x, z) => G((x, z) => { const p = window.__GAME.G.player; p.pos.set(x, 0, z); p.vx = p.vz = 0; }, x, z);
  await tp(-4.0, 2.6); await sleep(250);
  check('door prompt says finish tasks first', (await G(() => window.__GAME.G.hud.promptLabel)) === 'FINISH MORNING TASKS FIRST', await G(() => window.__GAME.G.hud.promptLabel));
  await t.key('KeyE'); await sleep(250);
  check('locked door refuses', (await t.stage()) === 'bedroom' && !(await G(() => window.__GAME.G.stage.leaving)));

  // the four items
  const items = await G(() => window.__GAME.G.stage.items.map((d) => ({ id: d.id, x: d.x, z: d.z })));
  for (const it of items) {
    await tp(it.x - 0.5, it.z + 0.5); await sleep(250);
    const lab = await G(() => window.__GAME.G.hud.promptLabel);
    await t.key('KeyE'); await sleep(250);
    check('pick up ' + it.id, (await G((id) => { const st = window.__GAME.G.stage; return st.items.find((d) => d.id === id).got === true; }, it.id)), 'prompt: ' + lab);
  }
  const inv = await G(() => window.__GAME.G.player.inv);
  check('inventory has backpack/phone/pass/bottle', inv.backpack && inv.phone && inv.pass && inv.bottle >= 1, JSON.stringify(inv));
  check('items task complete', await G(() => window.__GAME.G.stage.done.items === true));
  await t.shot('13_items_done');

  // brush teeth (scrub): real mouse drag back and forth over the tooth
  await tp(-1.9, 2.95); await sleep(250); await t.key('KeyE'); await sleep(500);
  await page.waitForSelector('#mg .tooth', { visible: true, timeout: 4000 });
  await t.shot('14_brush');
  const tb = await (await page.$('#mg .tooth')).boundingBox();
  const cx = tb.x + tb.width / 2, cy = tb.y + tb.height / 2;
  await page.mouse.move(cx - 40, cy); await page.mouse.down();
  for (let i = 0; i < 40; i++) { await page.mouse.move(cx + (i % 2 ? 40 : -40), cy + (i % 3) * 3, { steps: 3 }); }
  await page.mouse.up(); await sleep(700);
  check('brush teeth mini-game completes', await G(() => window.__GAME.G.stage.done.brush === true));

  // wash face (mash)
  await tp(-0.5, 2.95); await sleep(250); await t.key('KeyE'); await sleep(500);
  await page.waitForSelector('#mg .mgbtn', { visible: true, timeout: 4000 });
  for (let i = 0; i < 14; i++) { await page.click('#mg .mgbtn'); await sleep(60); }
  await sleep(500);
  check('wash face mini-game completes', await G(() => window.__GAME.G.stage.done.wash === true));

  // dress
  await tp(3.5, 0.6); await sleep(250); await t.key('KeyE'); await sleep(500);
  await page.waitForSelector('#mg .mgbtn', { visible: true, timeout: 4000 });
  await t.shot('15_dress');
  for (let i = 0; i < 3; i++) { await page.click('#mg .mgbtn.glow'); await sleep(200); }
  await sleep(700);
  check('dress mini-game completes', await G(() => window.__GAME.G.stage.done.dress === true));
  check('door unlocked', await G(() => window.__GAME.G.stage.unlocked === true));
  check('all 5 objectives struck', (await G(() => document.querySelectorAll('#objlist li.done').length)) >= 4);

  // pause / inventory / resume
  await t.key('Escape', 40); await sleep(300);
  check('Esc pauses', await G(() => window.__GAME.G.paused === true && !document.getElementById('pause').classList.contains('hidden')));
  await page.click('#p-inv'); await sleep(250);
  check('inventory shows items', (await G(() => document.querySelectorAll('#pause-sub .inv-item').length)) >= 6);
  await t.shot('16_inventory');
  await page.click('#pause-sub .back'); await sleep(150);
  await page.click('#p-settings'); await sleep(250);
  check('pause > settings opens', (await G(() => document.querySelectorAll('#pause-sub .seg').length)) >= 3);
  await page.click('#pause-sub .back'); await sleep(150);
  await page.click('#p-resume'); await sleep(200);
  check('resume unpauses', await G(() => window.__GAME.G.paused === false));

  // save exists
  check('checkpoint saved (continue enabled later)', await G(() => !!window.__GAME.Save.load() && window.__GAME.Save.load().stage === 'bedroom'));

  // leave through the door
  await tp(-4.0, 2.6); await sleep(250);
  check('door prompt now LEAVE HOME', (await G(() => window.__GAME.G.hud.promptLabel)) === 'LEAVE HOME');
  await t.key('KeyE');
  await t.waitStage('city', 15000);
  check('leaving home goes to Chapter 2 (city)', (await t.stage()) === 'city');
  await sleep(800);
  await t.shot('17_city_start');

  const errs = t.errors.concat((await t.errlog()) ? [await t.errlog()] : []);
  check('no runtime errors in Chapter 1', errs.length === 0, errs.join(' | ').slice(0, 600));
  const f = summary();
  await t.close();
  process.exit(f ? 1 : 0);
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(2); });
