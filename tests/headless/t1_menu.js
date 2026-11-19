const { launch, sleep, check, summary } = require('./lib');

(async () => {
  console.log('T1: boot + menu + settings');
  const t = await launch();
  const { page } = t;
  await sleep(1500);
  check('boot ready, stage=menu', (await t.stage()) === 'menu');
  const gl = await t.ev(() => { const r = window.__GAME.G.renderer; const gl = r.getContext(); const ext = gl.getExtension('WEBGL_debug_renderer_info'); return { webgl2: r.capabilities.isWebGL2, gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '?' }; });
  check('WebGL2 available', gl.webgl2, gl.gpu);
  check('no errlog after boot', (await t.errlog()) === '', await t.errlog());
  await t.shot('01_menu');

  // frame rate of the menu scene
  const fps = await t.ev(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 > 2000) res(n / 2); else requestAnimationFrame(f); }; requestAnimationFrame(f); }));
  check('menu runs >= 15 fps', fps >= 15, fps.toFixed(1) + ' fps');

  // Story mode panel
  await page.click('#m-story'); await sleep(300);
  const rows = await t.ev(() => document.querySelectorAll('#menu-sub .chapter').length);
  const goBtns = await t.ev(() => document.querySelectorAll('#menu-sub .chapter .go').length);
  check('story: 7 chapters listed, 7 playable', rows === 7 && goBtns === 7, `${rows} rows, ${goBtns} buttons`);
  await t.shot('02_story');
  await page.click('#menu-sub .back'); await sleep(200);

  // Character selection: choose each outfit
  await page.click('#m-char'); await sleep(300);
  const outfits = await t.ev(() => document.querySelectorAll('#menu-sub .outfit').length);
  check('character select: 4 outfits', outfits === 4);
  for (let i = 0; i < 4; i++) { await t.ev((k) => document.querySelectorAll('#menu-sub .outfit')[k].click(), i); await sleep(250); }
  await t.shot('03_char');
  check('outfit change applied', (await t.ev(() => window.__GAME.G.player.outfit)) === 3);
  await t.ev(() => document.querySelectorAll('#menu-sub .outfit')[0].click());
  await page.click('#menu-sub .back'); await sleep(200);

  // Settings
  await page.click('#m-settings'); await sleep(300);
  await t.shot('04_settings');
  const seg = await t.ev(() => document.querySelectorAll('#menu-sub .seg button').length);
  check('settings panel has toggles', seg === 9, seg + ' buttons');
  // quality low/high
  await t.ev(() => { const b = [...document.querySelectorAll('#menu-sub .seg button')]; b.find((x) => x.textContent === 'LOW').click(); });
  await sleep(300);
  check('quality low -> bloom off', (await t.ev(() => window.__GAME.G.useBloom)) === false);
  await t.ev(() => { const b = [...document.querySelectorAll('#menu-sub .seg button')]; b.find((x) => x.textContent === 'HIGH').click(); });
  await sleep(300);
  check('quality high -> bloom on', (await t.ev(() => window.__GAME.G.useBloom)) === true);
  await t.ev(() => { const b = [...document.querySelectorAll('#menu-sub .seg button')]; b.find((x) => x.textContent === 'MEDIUM').click(); });
  // fps toggle
  await t.ev(() => { const rows = [...document.querySelectorAll('#menu-sub .row')]; const r = rows.find((x) => x.textContent.includes('SHOW FPS')); r.querySelectorAll('button')[1].click(); });
  await sleep(200);
  check('fps overlay toggled on', (await t.ev(() => !document.getElementById('fps').classList.contains('hidden'))));
  await t.ev(() => { const rows = [...document.querySelectorAll('#menu-sub .row')]; const r = rows.find((x) => x.textContent.includes('SHOW FPS')); r.querySelectorAll('button')[0].click(); });
  await page.click('#menu-sub .back'); await sleep(200);

  // Continue is disabled without a save
  check('continue disabled without save', await t.ev(() => document.getElementById('m-continue').classList.contains('disabled')));

  check('no runtime errors', t.errors.length === 0 && (await t.errlog()) === '', t.errors.concat([await t.errlog()]).join(' | '));
  const f = summary();
  await t.close();
  process.exit(f ? 1 : 0);
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(2); });
