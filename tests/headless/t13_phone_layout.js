const { launch, sleep, check, summary } = require('./lib');

// Phone landscape layouts: at every common phone size no touch button / panel may overlap another one or leave the screen,
// and the inventory panel must scroll by touch. (Headless Chrome with touch emulation over a pipe; no port.)
const SIZES = [[640, 300], [640, 360], [800, 360], [844, 390], [915, 412], [932, 430]];

const COLLECT = () => {
  const out = [];
  const add = (name, el) => {
    if (!el) return;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    out.push({ name, x0: r.left, y0: r.top, x1: r.right, y1: r.bottom });
  };
  const q = (s) => document.querySelector(s);
  add('health', q('#topleft'));
  add('objectives', q('#objective'));
  add('weapon', q('#weapon'));
  add('minimap', q('#mapwrap'));
  add('inventory-btn', q('#btn-inv'));
  add('pause-btn', q('#btn-pause'));
  add('stealth', q('#stealth'));
  add('prompt', q('#prompt'));
  add('dialogue', q('#dialogue'));
  for (const b of document.querySelectorAll('#buttons .gbtn')) add('btn:' + b.dataset.act, b);
  return out;
};

(async () => {
  console.log('T13: phone landscape layouts (no overlaps, nothing off-screen) + touch scrolling');
  // first-run graphics default by device strength (a saved choice always wins)
  const cores = (n) => ({ init: (c) => Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => c }), initArg: n });
  const q = async (o) => { const t = await launch({ touch: true, w: 800, h: 360, ...o }); const v = await t.ev(() => window.__GAME.G.settings.quality); await t.close(); return v; };
  check('weak phone (2 cores) starts on LOW graphics', (await q({ ...cores(2) })) === 'low');
  check('stronger phone (8 cores) keeps MEDIUM graphics', (await q({ ...cores(8) })) === 'med');
  check('a saved choice beats the weak-phone default', (await q({ ...cores(2), settings: { quality: 'high' } })) === 'high');
  for (const [W, H] of SIZES) {
    const t = await launch({ touch: true, w: W, h: H, settings: { quality: 'low' } });
    const G = (fn, ...a) => t.ev(fn, ...a);
    const tag = `${W}x${H}`;
    check(`${tag}: touch device detected (PC key hints hidden)`, await G(() => document.documentElement.classList.contains('touch') && getComputedStyle(document.querySelector('.menu-foot span')).display === 'none'));
    await G(() => window.__GAME.G.startChapter(7));
    await t.waitStage('haven', 40000);
    await sleep(1600);
    await page_unlock(t);
    // a bench prompt (USE button + prompt label), materials in the weapon panel, a medkit and a pistol so every control is on screen
    await G(() => { const p = window.__GAME.G.player; p.pos.set(48, 0, -2.6); p.vx = p.vz = 0; p.inv.scrap = 4; p.inv.cloth = 2; p.inv.wood = 4; p.inv.kits = 1; p.inv.medkit = 1; });
    await sleep(600);
    const els = await G(COLLECT);
    const names = els.map((e) => e.name);
    const need = ['health', 'objectives', 'weapon', 'minimap', 'pause-btn', 'prompt', 'btn:attack', 'btn:jump', 'btn:dodge', 'btn:block', 'btn:shoot', 'btn:interact', 'btn:run', 'btn:crouch', 'btn:medkit'];
    const missing = need.filter((n) => !names.includes(n));
    check(`${tag}: all HUD parts are on screen`, missing.length === 0, missing.length ? 'missing: ' + missing.join(',') : els.length + ' elements');
    const off = els.filter((e) => e.x0 < -0.5 || e.y0 < -0.5 || e.x1 > W + 0.5 || e.y1 > H + 0.5);
    check(`${tag}: nothing leaves the screen`, off.length === 0, off.map((e) => `${e.name} [${e.x0 | 0},${e.y0 | 0},${e.x1 | 0},${e.y1 | 0}]`).join(' '));
    const hits = [];
    for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
      const a = els[i], b = els[j];
      const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
      if (w > 2 && h > 2) hits.push(`${a.name} x ${b.name} (${w | 0}x${h | 0})`);
    }
    check(`${tag}: no HUD element overlaps another`, hits.length === 0, hits.join('; '));
    const small = els.filter((e) => e.name.startsWith('btn:') || e.name.endsWith('-btn')).filter((e) => Math.min(e.x1 - e.x0, e.y1 - e.y0) < 36);
    check(`${tag}: every touch button is at least 36 px`, small.length === 0, small.map((e) => `${e.name} ${((e.x1 - e.x0) | 0)}x${((e.y1 - e.y0) | 0)}`).join(' '));

    // panels fit or scroll: workbench and inventory
    await G(() => window.__GAME.G.ui.openCraft('WORKBENCH')); await sleep(400);
    const cr = await G(() => { const b = document.querySelector('.pause-box'), r = b.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, sh: b.scrollHeight, ch: b.clientHeight, ta: getComputedStyle(b).touchAction }; });
    check(`${tag}: workbench panel stays on screen and can scroll by touch`, cr.top >= -0.5 && cr.bottom <= H + 0.5 && cr.ta.includes('pan-y'), JSON.stringify(cr));
    await G(() => window.__GAME.G.ui.closePause());
    if (W === 640 && H === 300) {
      await G(() => window.__GAME.G.ui.openPause('inv')); await sleep(400);
      const before = await G(() => document.querySelector('.pause-box').scrollTop);
      const mx = Math.round(W / 2), my0 = Math.round(H * 0.8), my1 = Math.round(H * 0.2);
      await t.page.touchscreen.touchStart(mx, my0);
      for (let k = 1; k <= 8; k++) { await t.page.touchscreen.touchMove(mx, my0 + (my1 - my0) * k / 8); await sleep(30); }
      await t.page.touchscreen.touchEnd(); await sleep(300);
      const after = await G(() => document.querySelector('.pause-box').scrollTop);
      check(`${tag}: dragging the inventory panel with a finger scrolls it`, after > before + 20, `scrollTop ${before} -> ${after}`);
      await G(() => window.__GAME.G.ui.closePause());
    }
    check(`${tag}: no runtime errors`, t.errors.length === 0, t.errors.join(' | ').slice(0, 600));
    await t.close();
  }
  const f = summary();
  process.exit(f ? 1 : 0);
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(2); });

async function page_unlock(t) {
  await t.page.waitForFunction(() => !window.__GAME.G.player.locked, { timeout: 10000 }).catch(() => {});
}
