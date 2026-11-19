// Balance probe for the chapter-6 escape: a dumb bot sprints the shortest path from the weapons locker to the dock panel
// (no shooting, no dodging, no healing). Reports hp / time / zombies near the panel. Not a pass/fail balance test by itself.
const { launch, sleep, check, summary } = require('./lib');

const BOT = `(() => {
  const g = window.__GAME.G, s = g.stage, p = g.player;
  const R = 0.55, st = 0.25, X0 = -24, Z0 = -17.5;
  const nx = Math.round(48 / st) + 1, nz = Math.round(35 / st) + 1;
  const blocked = (x, z) => { for (const c of s.colliders) { if (c.off) continue; const cx = Math.max(c.minX, Math.min(x, c.maxX)), cz = Math.max(c.minZ, Math.min(z, c.maxZ)); if ((x - cx) * (x - cx) + (z - cz) * (z - cz) < R * R) return true; } return false; };
  const walk = new Uint8Array(nx * nz);
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) walk[i * nz + j] = blocked(X0 + i * st, Z0 + j * st) ? 0 : 1;
  const cell = (x, z) => [Math.round((x - X0) / st), Math.round((z - Z0) / st)];
  const [sx, sz] = cell(p.pos.x, p.pos.z);
  const par = new Int32Array(nx * nz).fill(-2);
  par[sx * nz + sz] = -1;
  const q = [[sx, sz]]; let head = 0, goal = -1;
  const tx = 22.2, tz = -11.6;
  while (head < q.length) {
    const [i, j] = q[head++];
    if (Math.hypot(X0 + i * st - tx, Z0 + j * st - tz) < 1.4) { goal = i * nz + j; break; }
    for (const [di, dj] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) { const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= nx || b >= nz) continue; const k = a * nz + b; if (walk[k] && par[k] === -2) { par[k] = i * nz + j; q.push([a, b]); } }
  }
  if (goal < 0) return { err: 'no path' };
  const cells = [];
  for (let k = goal; k >= 0; k = par[k]) cells.push([X0 + Math.floor(k / nz) * st, Z0 + (k % nz) * st]);
  cells.reverse();
  const wps = cells.filter((_, i) => i % 4 === 0); wps.push(cells[cells.length - 1]);
  let wi = 1;
  const t0 = performance.now();
  const res = { done: false, hp: null, t: null, near: null, minHp: 100, len: cells.length * st };
  g.input.toggles.run = true;
  window.__bot = setInterval(() => {
    if (p.dead || res.done) { clearInterval(window.__bot); g.input.joy.x = g.input.joy.y = 0; if (p.dead) { res.dead = true; res.done = true; res.t = (performance.now() - t0) / 1000; } return; }
    g.camRig.yaw = Math.PI;
    const w = wps[Math.min(wi, wps.length - 1)];
    const dx = w[0] - p.pos.x, dz = w[1] - p.pos.z, d = Math.hypot(dx, dz);
    if (d < 0.8 && wi < wps.length - 1) wi++;
    if (Math.hypot(tx - p.pos.x, tz - p.pos.z) < 1.6) {
      res.done = true; res.hp = p.hp; res.t = (performance.now() - t0) / 1000;
      res.near = s.enemies.filter((e) => e.alive && Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z) < 3.5).map((e) => e.type);
      res.chasers = s.enemies.filter((e) => e.alive && e.aware).length;
      return;
    }
    const L = d || 1, ux = dx / L, uz = dz / L;
    g.input.joy.x = -ux; g.input.joy.y = uz;
    res.minHp = Math.min(res.minHp, p.hp);
  }, 50);
  window.__botRes = res;
  return { ok: true, len: res.len };
})()`;

(async () => {
  console.log('T9: escape balance probe (bot sprints locker -> dock, no fighting)');
  const t = await launch({ settings: { quality: 'low' } });
  const { page } = t;
  const G = (fn, ...a) => t.ev(fn, ...a);
  const out = [];
  for (let run = 1; run <= 6; run++) {
    await G(() => window.__GAME.G.startChapter(6)); await t.waitStage('mart', 30000); await sleep(900);
    await G(() => {
      const g = window.__GAME.G, s = g.stage, p = g.player;
      for (const k of ['food', 'water', 'med', 'bat', 'key']) s.got[k] = true;
      p.inv.keycard = true; p.inv.batteries = 4; p.inv.medkit = 0; p.inv.food = 0;
      s.p2 = true; s.doorOpen = true; s.doorCol.off = true; s.doorIt.remove();
      p.pos.set(0, 0, 15.0); p.vx = p.vz = 0; p.hp = 100;
      s._openLocker();
    });
    await sleep(300);
    const b = await G(BOT);
    if (b.err) { console.log('  bot error', b.err); continue; }
    await page.waitForFunction(() => window.__botRes && window.__botRes.done, { timeout: 90000 }).catch(() => {});
    const r = await G(() => window.__botRes);
    out.push(r);
    console.log(`  run ${run}: path ${r.len.toFixed(0)} m  ->  ${r.dead ? 'DIED' : 'arrived'} after ${r.t ? r.t.toFixed(1) : '?'} s, hp ${r.hp === null ? '-' : Math.round(r.hp)}, lowest hp ${Math.round(r.minHp)}, chasers ${r.chasers}, near the panel: ${(r.near || []).join(',') || '-'}`);
    if (run === 1) await t.shot('93_bot_arrival');
  }
  const arrived = out.filter((r) => r.done && !r.dead).length;
  check('bot (no fighting) reaches the dock panel alive in most runs', arrived >= 2, `${arrived}/${out.length}`);
  const errs = t.errors.concat((await t.errlog()) ? [await t.errlog()] : []);
  check('no runtime errors', errs.length === 0, errs.join(' | ').slice(0, 800));
  const f = summary();
  await t.close();
  process.exit(f ? 1 : 0);
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(2); });
