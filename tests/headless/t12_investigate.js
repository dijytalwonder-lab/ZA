const { launch, sleep, check, summary } = require('./lib');

// Chapter 5: every stealth zombie that is sent to look at a noise 3 m ahead of it must give up and go back to idle,
// even when a car or wall blocks the way (it used to stay in "investigate" forever, pressed against the scenery).
(async () => {
  console.log('T12: investigating zombies always give up (chapter 5)');
  const t = await launch({ settings: { quality: 'low' } });
  const { page } = t;
  const G = (fn, ...a) => t.ev(fn, ...a);
  await page.click('#m-story'); await sleep(200);
  await t.ev(() => document.querySelectorAll('#menu-sub .chapter .go')[4].click());
  await t.waitStage('apoc', 30000);
  await sleep(1500);
  await page.waitForFunction(() => !window.__GAME.G.player.locked, { timeout: 8000 });
  // stand in the middle of the street's western half; zombies more than 75 m away are frozen by design, so only count the ones in range
  await G(() => { const p = window.__GAME.G.player; p.pos.set(-60, 0, 0); p.vx = p.vz = 0; });
  const start = await G(() => {
    const s = window.__GAME.G.stage, p = window.__GAME.G.player, out = [];
    s.enemies.forEach((z, i) => {
      if (!z.alive || z.state !== 'idle' || Math.hypot(z.pos.x - p.pos.x, z.pos.z - p.pos.z) > 70) return;
      z.wp = null; z.wpT = 99;
      z.hear(z.pos.x + 3, z.pos.z, 8);
      out.push(i);
    });
    return out;
  });
  check('several zombies in range sent to investigate', start.length >= 6, start.length + ' zombies');
  await sleep(11000);
  const end = await G((idx) => { const s = window.__GAME.G.stage; return idx.map((i) => ({ i, st: s.enemies[i].state })); }, start);
  const stuck = end.filter((e) => e.st === 'investigate');
  const spotted = end.filter((e) => e.st !== 'idle' && e.st !== 'investigate');
  check('none of them is still stuck investigating after 11 s', stuck.length === 0, stuck.length ? 'stuck: ' + stuck.map((e) => e.i).join(',') : end.length + ' back to idle' + (spotted.length ? ' (' + spotted.length + ' noticed the player)' : ''));
  check('no runtime errors', t.errors.length === 0, t.errors.join(' | '));
  await t.close();
  process.exit(summary() ? 1 : 0);
})().catch((e) => { console.error('T12 CRASH', e); process.exit(1); });
