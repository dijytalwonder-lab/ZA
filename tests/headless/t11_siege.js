// Balance probe for Chapter 7: a bot defends the station through the 3 waves using the real shooting / healing /
// rebuild / survivor-support systems, at three stock levels. Prints per-wave damage, ammo use and barricade losses.
const { launch, sleep } = require('./lib');

const BOT = `(() => {
  const g = window.__GAME.G, s = g.stage, p = g.player, bars = s.bars;
  const st = { melee: 0, hits: 0, dmg: 0, done: false, dead: false, waves: [], broke: 0, builds: 0, shots: 0, minHp: 100, medUsed: 0, t: 0, end: '', hpStart: 0 };
  let cd = 0, medCd = 0, busy = 0, lastWave = 0, lastLull = false, w = null;
  const lastBuilt = bars.map((b) => b.built);
  window.__botStats = st;
  const Z = (s.enemies[0] && s.enemies[0].constructor) || window.__ZC; window.__ZC = Z;
  if (!Z.__w) { const o = Z.prototype.takeHit; Z.prototype.takeHit = function (...a) { if (window.__botStats && this.alive) { window.__botStats.hits++; window.__botStats.dmg += a[0]; } return o.apply(this, a); }; Z.__w = 1; }
  const go = (x, z, dt) => { const dx = x - p.pos.x, dz = z - p.pos.z, d = Math.hypot(dx, dz); if (d < 0.35) return true; const k = Math.min(1, 3.2 * dt / d); p.pos.x += dx * k; p.pos.z += dz * k; return false; };
  const clampIn = (x, z) => [Math.max(-96, Math.min(-64.5, x)), Math.max(-12, Math.min(12, z))];
  const close = (wv) => { st.waves.push({ wave: wv.n, hpLost: Math.round(wv.hp - p.hp), ammo: wv.ammo - p.inv.ammo, shells: wv.shells - p.inv.shells, broke: st.broke - wv.broke, secs: Math.round(st.t - wv.t0), hpEnd: Math.round(p.hp) }); };
  s.updaters.push((dt) => {
    if (st.done) return;
    st.t += dt;
    if (p.dead) { st.dead = true; st.done = true; st.end = 'DIED in wave ' + s.wave; return; }
    st.minHp = Math.min(st.minHp, p.hp);
    bars.forEach((b, i) => { if (lastBuilt[i] && !b.built) st.broke++; lastBuilt[i] = b.built; });
    if (s.phase === 'dawn') { if (w) close(w); w = null; st.done = true; st.end = 'SURVIVED'; return; }
    if (s.phase === 'siege') {
      if (s.waveOn && !s.lull && s.wave !== lastWave) { lastWave = s.wave; w = { n: s.wave, hp: p.hp, ammo: p.inv.ammo, shells: p.inv.shells, broke: st.broke, t0: st.t }; }
      if (s.lull && !lastLull && w) { close(w); w = null; }
      lastLull = s.lull;
    }
    busy -= dt; cd -= dt; medCd -= dt;
    if (busy > 0) return;
    if (p.hp < 42 && medCd <= 0 && (p.inv.medkit > 0 || p.inv.food > 0)) { if (p.useMedkit()) { st.medUsed++; medCd = 1.2; } }
    if (s.lull) {
      if (p.hp < 75 && !s.restocks.meera) { s._meera(); busy = 2.5; return; }
      if ((p.inv.ammo < 30 || p.inv.shells < 8) && !s.restocks.kabir) { s._kabir(); busy = 2.5; return; }
    }
    // rebuild a broken entrance when nobody is hammering on it
    for (const b of bars) {
      if (b.built || b.busy || p.inv.kits <= 0) continue;
      const near = s.enemies.some((e) => e.alive && Math.hypot(e.pos.x - b.x, e.pos.z - b.z) < 5.5);
      if (near) continue;
      if (go(b.at[0], b.at[1], dt)) { s._tryBuild(b); st.builds++; busy = 1.2; }
      return;
    }
    const live = s.enemies.filter((e) => e.alive);
    if (window.__MELEE) {
      const heavy = live.some((e) => (e.type === 'brute' || e.type === 'spitter') && s.hasLOS(p.pos.x, p.pos.z, e.pos.x, e.pos.z, 1.15));
      const bashers = live.filter((e) => e.state === 'bash' && (e.type === 'walker' || e.type === 'runner') && e.siegeBar);
      const inside0 = live.some((e) => e.pos.x < -62.5 && e.pos.x > -98 && Math.abs(e.pos.z) < 13.5 && Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z) < 7);
      if (!heavy && !inside0 && bashers.length) {
        // fight at the planks with the rod: the dead pound on the wood and cannot hit back
        const cnt = new Map();
        for (const e of bashers) cnt.set(e.siegeBar, (cnt.get(e.siegeBar) || 0) + 1);
        let b = null, n = 0; for (const [k, v] of cnt) if (v > n) { n = v; b = k; }
        const tgt = bashers.filter((e) => e.siegeBar === b).sort((a, c) => Math.abs((a.pos.x - b.x) * b.tx + (a.pos.z - b.z) * b.tz) - Math.abs((c.pos.x - b.x) * b.tx + (c.pos.z - b.z) * b.tz))[0];
        const l = (tgt.pos.x - b.x) * b.tx + (tgt.pos.z - b.z) * b.tz;
        const px = b.x - b.nx * 0.9 + b.tx * l, pz = b.z - b.nz * 0.9 + b.tz * l;
        go(px, pz, dt);
        const d = Math.hypot(tgt.pos.x - p.pos.x, tgt.pos.z - p.pos.z);
        if (d < 2.6 && p.stamina >= 12) {
          if (p.wKey !== 'rod') p.setWeapon('rod');
          p.yaw = Math.atan2(tgt.pos.x - p.pos.x, tgt.pos.z - p.pos.z); p.rig.root.rotation.y = p.yaw;
          const st0 = p.stamina; p.tryAttack(s); if (p.stamina < st0) st.melee = (st.melee || 0) + 1;
        }
        return;
      }
    }
    // shoot the best visible target
    let tgt = null, bd = 1e9;
    for (const e of live) {
      const d = Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z);
      if (d > 28 || !s.hasLOS(p.pos.x, p.pos.z, e.pos.x, e.pos.z, 1.15)) continue;
      const pri = e.type === 'spitter' ? d * 0.6 : e.type === 'brute' ? d * 0.8 : d;
      if (pri < bd) { bd = pri; tgt = e; }
    }
    if (tgt) {
      const d = Math.hypot(tgt.pos.x - p.pos.x, tgt.pos.z - p.pos.z);
      const useShot = p.inv.shells > 0 && (d < 8 || (tgt.type === 'brute' && d < 10));
      const wk = useShot ? 'shotgun' : p.inv.ammo > 0 ? 'pistol' : p.inv.shells > 0 ? 'shotgun' : null;
      if (wk) {
        if (p.wKey !== wk) p.setWeapon(wk);
        p.yaw = Math.atan2(tgt.pos.x - p.pos.x, tgt.pos.z - p.pos.z);
        p.rig.root.rotation.y = p.yaw;
        const a0 = p.inv.ammo + p.inv.shells;
        p.tryAttack(s);
        if (p.inv.ammo + p.inv.shells < a0) st.shots++;
      }
    }
    // stand where the threat is (about 4 m inside the entrance under the most pressure)
    const inside = live.filter((e) => e.pos.x < -62.5 && e.pos.x > -98 && Math.abs(e.pos.z) < 13.5 && Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z) < 6);
    if (inside.length) return;
    const lt = s.loot.filter((l) => l.x < -63 && l.x > -97 && Math.abs(l.z) < 13).sort((a, c) => Math.hypot(a.x - p.pos.x, a.z - p.pos.z) - Math.hypot(c.x - p.pos.x, c.z - p.pos.z))[0];
    if (lt && Math.hypot(lt.x - p.pos.x, lt.z - p.pos.z) < 16) { go(lt.x, lt.z, dt); return; }
    let best = null, bw = 0;
    for (const b of bars) {
      let wt = 0;
      for (const e of live) { if (Math.hypot(e.pos.x - b.x, e.pos.z - b.z) < 11) wt += 1; }
      if (wt > bw) { bw = wt; best = b; }
    }
    const [tx, tz] = best ? clampIn(best.x - best.nx * 4.2, best.z - best.nz * 4.2) : [-76, 0];
    go(tx, tz, dt);
  });
  return true;
})()`;

const SCEN = [
  { name: 'LEAN   (ammo 34, shells 10, 1 medkit)', ammo: 34, shells: 10, med: 1, food: 1, kits: 0 },
  { name: 'TYPICAL(ammo 52, shells 16, 2 medkits, 1 spare kit)', ammo: 52, shells: 16, med: 2, food: 1, kits: 1 },
  { name: 'STOCKED(ammo 60, shells 24, 4 medkits, 2 spare kits)', ammo: 60, shells: 24, med: 4, food: 2, kits: 2 }
];

(async () => {
  const runs = +(process.env.RUNS || 3);
  console.log('T11: Chapter 7 siege balance probe (bot defends 3 waves; ' + runs + ' runs per stock level)');
  const t = await launch({ settings: { quality: 'low' } });
  const G = (fn, ...a) => t.ev(fn, ...a);
  const waitNewStage = async () => { await t.page.waitForFunction(() => { const g = window.__GAME.G; return g.stage && g.stage !== window.__prevStage && g.stage.key === 'haven' && !g.transitioning; }, { timeout: 40000 }); };

  // supply economy over the whole route (what a thorough player could collect)
  await G(() => { window.__prevStage = null; window.__GAME.G.startChapter(7); });
  await waitNewStage(); await sleep(1200);
  const eco = await G(() => {
    const s = window.__GAME.G.stage, tot = { ammo: 0, shells: 0, medkit: 0, scrap: 0, cloth: 0, wood: 0, food: 0 };
    const give = { ammo: 12, shells: 6, medkit: 1, food: 1, scrap: 2, cloth: 2, wood: 2, bottle: 1 };
    for (const l of s.loot) if (tot[l.type] !== undefined) tot[l.type] += give[l.type];
    for (const c of s.crates) for (const [k, n] of c.loot) if (tot[k] !== undefined) tot[k] += n;
    tot.shells += 6; tot.ammo += 12; tot.medkit += 1; tot.wood += 2; // depot cache
    tot.wood += 6; tot.scrap += 3;                                      // station plank stash
    return tot;
  });
  console.log('Supply on the map (route loot + crates + cache + stash, before zombie drops):', JSON.stringify(eco));
  console.log('  + start kit (18 ammo, 6 shells, 1 medkit), + Kabir twice (24 ammo, 8 shells) + Meera twice (full heals), + crafting (2 scrap = 8 ammo, 1 kit = 2 wood + 1 scrap)');

  const rows = [];
  for (const sc of SCEN) {
    for (let r = 1; r <= runs; r++) {
      await G(() => { window.__prevStage = window.__GAME.G.stage; window.__GAME.G.startChapter(7); });
      await waitNewStage(); await sleep(1000);
      await G((sc) => {
        const g = window.__GAME.G, s = g.stage, p = g.player, i = p.inv;
        i.ammo = sc.ammo; i.shells = sc.shells; i.medkit = sc.med; i.food = sc.food; i.kits = sc.kits; i.batteries = 4;
        p.pos.set(-67, 0, 0); p.vx = p.vz = 0; p.setWeapon('pistol');
      }, sc);
      await sleep(900);
      await G(() => { const s = window.__GAME.G.stage; for (const b of s.bars) { b.built = true; b.hp = b.maxHp; s._setBarVisual(b); } s._barsChanged(); });
      if (process.env.NOROUTE) await G(() => { const s = window.__GAME.G.stage; window.__ZC = s.enemies[0].constructor; for (const e of s.enemies) s.scene.remove(e.rig.root); s.enemies.length = 0; });
      await G((m) => { window.__MELEE = !!m; }, process.env.MELEE ? 1 : 0);
      await G(BOT);
      await G(() => { window.__GAME.G.timeScale = 3; });
      const t0 = Date.now();
      let st = null;
      while (Date.now() - t0 < 420000) {
        st = await G(() => ({ ...window.__botStats, phase: window.__GAME.G.stage.phase, wave: window.__GAME.G.stage.wave, hp: Math.round(window.__GAME.G.player.hp), ammo: window.__GAME.G.player.inv.ammo, shells: window.__GAME.G.player.inv.shells, med: window.__GAME.G.player.inv.medkit, kits: window.__GAME.G.player.inv.kits, alive: window.__GAME.G.stage.enemies.filter((e) => e.alive).length, extra: window.__GAME.G.stage.enemies.filter((e) => e.alive && !e.waveId && e.aware).length }));
        if (st.done) break;
        await sleep(1500);
      }
      const line = { scen: sc.name.split('(')[0].trim(), run: r, end: st.done ? st.end : 'TIMEOUT at wave ' + st.wave + ' (' + st.alive + ' alive)', gameSecs: Math.round(st.t), minHp: Math.round(st.minHp), med: st.medUsed, melee: st.melee, shots: st.shots, hits: st.hits, dmg: Math.round(st.dmg), extra: st.extra, broke: st.broke, rebuilt: st.builds, left: `ammo ${st.ammo} shells ${st.shells} med ${st.med} kits ${st.kits}`, waves: st.waves };
      rows.push(line);
      console.log(`${line.scen} #${r}: ${line.end} | ${line.gameSecs}s game | minHP ${line.minHp} | melee swings ${line.melee} | shots ${line.shots} (hits ${line.hits}, dmg ${line.dmg}) | extra aware zombies ${line.extra} | medkits used ${line.med} | barricades broken ${line.broke}, rebuilt ${line.rebuilt} | left: ${line.left}`);
      for (const w of line.waves) console.log(`     wave ${w.wave}: ${w.secs}s, hp lost ${w.hpLost} (end ${w.hpEnd}), ammo ${w.ammo}, shells ${w.shells}, barricades broken ${w.broke}`);
    }
  }
  const errs = t.errors.concat((await t.errlog()) ? [await t.errlog()] : []);
  console.log('runtime errors:', errs.length ? errs.join(' | ').slice(0, 800) : 'none');
  await t.close();
  process.exit(0);
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(2); });
