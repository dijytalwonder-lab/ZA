import { $, el } from '../core/util.js';
import { G } from '../core/state.js';
import { Save } from '../core/save.js';
import { OUTFITS } from '../entities/rig.js';
import { WEAPONS } from '../entities/player.js';
import { hex } from '../core/kit.js';
import { MATS, RECIPES, costText, whyNot, craft } from '../core/craft.js';

const CHAPTERS = [
  { n: 1, t: 'A NORMAL MORNING', d: 'Wake up in your bedroom, get ready and leave home.', play: true },
  { n: 2, t: 'WALKING THROUGH THE CITY LIGHTS', d: 'Cross traffic, collect coins, meet locals. Something feels off.', play: true },
  { n: 3, t: 'BOARDING THE BUS', d: 'Wait at the stop as the city flickers. Ride bus 42.', play: true },
  { n: 4, t: 'ZOMBIE ATTACK ON THE BUS', d: 'Dodge, block and fight. Break out alive.', play: true },
  { n: 5, t: 'ZOMBIE APOCALYPSE IN THE CITY', d: 'Guns, stealth and survival. Hide, loot and reach City Mart.', play: true },
  { n: 6, t: 'THE CITY MART MISSION', d: 'Sneak through the store, lure zombies away, grab supplies and escape.', play: true },
  { n: 7, t: 'SURVIVE AND ESCAPE', d: 'Find a safe place, craft, barricade the night and answer the radio.', play: true }
];

export class UI {
  constructor() {
    this.menu = $('menu');
    this.main = $('menu-main');
    this.sub = $('menu-sub');
    this.pauseEl = $('pause');
    this.pauseSub = $('pause-sub');
    this.pauseMain = $('pause-main');
    const click = (id, fn) => $(id).addEventListener('click', () => { G.audio.unlock(); G.audio.sfx('select'); fn(); });
    click('m-story', () => this.chaptersPanel());
    click('m-continue', () => { if (Save.has()) G.continueGame(); });
    click('m-new', () => this.newGamePanel());
    click('m-char', () => this.characterPanel());
    click('m-settings', () => { this.openSub(); this.settingsPanel(this.sub, () => this.backToMain()); });
    click('p-resume', () => this.closePause());
    click('p-inv', () => this.pausePanel('inv'));
    click('p-settings', () => this.pausePanel('settings'));
    click('p-restart', () => { this.closePause(); G.retry(); });
    click('p-quit', () => { this.closePause(); G.menu(); });
    click('d-retry', () => { G.hud.hideDeath(); G.retry(); });
    click('d-quit', () => { G.hud.hideDeath(); G.menu(); });
    click('e-menu', () => { $('end').classList.add('hidden'); G.menu(); });
    click('e-next', () => { $('end').classList.add('hidden'); G.nextChapter(this.endNext); });
  }

  /* ---------------- main menu ---------------- */
  showMenu() {
    this.menu.classList.remove('hidden');
    this.backToMain();
  }
  hideMenu() { this.menu.classList.add('hidden'); }
  backToMain() {
    this.sub.classList.add('hidden');
    this.main.classList.remove('hidden');
    const has = Save.has();
    $('m-continue').classList.toggle('disabled', !has);
    const s = Save.load();
    $('m-cont-sub').textContent = has && s ? `CHAPTER ${s.chapter || 1}` : '';
  }
  openSub() {
    this.main.classList.add('hidden');
    this.sub.classList.remove('hidden');
    this.sub.innerHTML = '';
  }
  backBtn(fn) {
    const b = el('button', 'mbtn center back', 'BACK');
    b.addEventListener('click', () => { G.audio.sfx('back'); fn(); });
    return b;
  }

  newGamePanel() {
    if (!Save.has()) { G.newGame(); return; }
    this.openSub();
    this.sub.innerHTML = '<h2>NEW GAME</h2><p style="font:600 14px Rajdhani;color:#bde">This erases your saved progress and starts Chapter 1 again.</p>';
    const yes = el('button', 'mbtn center', 'START NEW GAME');
    yes.addEventListener('click', () => { G.audio.sfx('select'); G.newGame(); });
    this.sub.append(yes, this.backBtn(() => this.backToMain()));
  }

  chaptersPanel() {
    this.openSub();
    this.sub.innerHTML = '<h2>STORY MODE</h2>';
    const save = Save.load();
    const note = el('p', '', 'All seven chapters are open for replay.');
    note.style.cssText = 'font:600 12px Rajdhani;color:#8ab;margin:0 0 6px';
    this.sub.appendChild(note);
    for (const c of CHAPTERS) {
      const row = el('div', 'chapter' + (c.play ? '' : ' locked'));
      row.innerHTML = `<b>${c.n}</b><div>${c.t}<small>${c.d}</small></div>`;
      if (c.play) {
        const go = el('button', 'go', c.n === 1 ? 'PLAY' : 'JUMP IN');
        go.addEventListener('click', () => { G.audio.sfx('select'); G.startChapter(c.n); });
        row.appendChild(go);
      }
      this.sub.appendChild(row);
    }
    if (save && save.cleared) {
      const e = el('p', '', `Cleared: Chapter ${save.cleared}`);
      e.style.cssText = 'font:700 11px Orbitron;color:#39ff9a;letter-spacing:2px';
      this.sub.appendChild(e);
    }
    this.sub.appendChild(this.backBtn(() => this.backToMain()));
  }

  characterPanel() {
    this.openSub();
    this.sub.innerHTML = '<h2>CHARACTER SELECTION</h2>';
    const list = el('div');
    const render = () => {
      list.innerHTML = '';
      OUTFITS.forEach((o, i) => {
        const row = el('div', 'outfit' + (G.player.outfit === i ? ' sel' : ''));
        row.innerHTML = `<div class="sw" style="color:${hex(o.accent)};background:${hex(o.jacket)}"></div><div>${o.name}<small>${o.desc}</small></div>`;
        row.addEventListener('click', () => {
          G.audio.sfx('select');
          G.player.setOutfit(i);
          G.player.dressUp();
          G.player.rig.flash(o.accent, 0.5);
          Save.saveOutfit(i);
          render();
        });
        list.appendChild(row);
      });
    };
    render();
    this.sub.append(list, this.backBtn(() => this.backToMain()));
  }

  /* ---------------- settings ---------------- */
  settingsPanel(container, back) {
    const s = G.settings;
    container.innerHTML = '<h2>SETTINGS</h2>';
    const save = () => { Save.saveSettings(s); G.applySettings(); };
    const seg = (label, key, opts) => {
      const row = el('div', 'row');
      row.appendChild(el('label', '', label));
      const g = el('div', 'seg');
      opts.forEach(([v, t]) => {
        const b = el('button', s[key] === v ? 'on' : '', t);
        b.addEventListener('click', () => { s[key] = v; [...g.children].forEach((c) => c.classList.remove('on')); b.classList.add('on'); G.audio.sfx('ui'); save(); });
        g.appendChild(b);
      });
      row.appendChild(g);
      container.appendChild(row);
    };
    const slider = (label, key, min, max, step) => {
      const row = el('div', 'row');
      row.appendChild(el('label', '', label));
      const i = document.createElement('input');
      i.type = 'range'; i.min = min; i.max = max; i.step = step; i.value = s[key];
      i.addEventListener('input', () => { s[key] = parseFloat(i.value); save(); });
      i.addEventListener('change', () => G.audio.sfx('ui'));
      row.appendChild(i);
      container.appendChild(row);
    };
    seg('GRAPHICS', 'quality', [['low', 'LOW'], ['med', 'MEDIUM'], ['high', 'HIGH']]);
    slider('MUSIC', 'music', 0, 1, 0.05);
    slider('EFFECTS', 'sfx', 0, 1, 0.05);
    slider('CAMERA SENS', 'sens', 0.4, 2.2, 0.1);
    seg('INVERT LOOK Y', 'invertY', [[false, 'OFF'], [true, 'ON']]);
    seg('SHOW FPS', 'fps', [[false, 'OFF'], [true, 'ON']]);
    seg('VIBRATION', 'haptics', [[true, 'ON'], [false, 'OFF']]);
    container.appendChild(this.backBtn(back));
  }

  /* ---------------- pause / inventory ---------------- */
  openPause(tab) {
    if (!G.playing || G.transitioning) return;
    if (G.mg && G.mg.busy) return;
    if (G.player.dead) return;
    G.paused = true;
    G.input.setEnabled(false);
    this.pauseEl.classList.remove('hidden');
    if (tab) this.pausePanel(tab);
    else this.pauseBack();
  }
  pauseBack() {
    this.pauseSub.classList.add('hidden');
    this.pauseMain.classList.remove('hidden');
  }
  pausePanel(which) {
    this.pauseMain.classList.add('hidden');
    this.pauseSub.classList.remove('hidden');
    this.pauseSub.innerHTML = '';
    if (which === 'settings') this.settingsPanel(this.pauseSub, () => this.pauseBack());
    else this.inventoryPanel(this.pauseSub, () => this.pauseBack());
  }
  closePause() {
    this.pauseEl.querySelector('h2').textContent = 'PAUSED';
    G.paused = false;
    this.pauseEl.classList.add('hidden');
    if (G.player && !G.player.dead) G.input.setEnabled(true);
  }
  inventoryPanel(c, back) {
    const pl = G.player, inv = pl.inv;
    c.innerHTML = '<h2>INVENTORY</h2>';
    const g = el('div', 'inv-grid');
    const item = (name, sub, on) => { const d = el('div', 'inv-item' + (on ? '' : ' off'), `${name}<small>${sub}</small>`); g.appendChild(d); return d; };
    item('BACKPACK', 'Equippable melee / shield', inv.backpack);
    item('PHONE', 'No signal...', inv.phone);
    item('BUS PASS', 'Route 42', inv.pass);
    item('METAL ROD', 'Heavy melee', inv.rod);
    item('SERVICE PISTOL', 'Fast, loud. Uses AMMO', inv.pistol);
    item('ARC SHOTGUN', 'Close range. Uses SHELLS', inv.shotgun);
    item(`AMMO <b>${inv.ammo}</b>`, 'Pistol rounds', inv.ammo > 0);
    item(`SHELLS <b>${inv.shells}</b>`, 'Shotgun shells', inv.shells > 0);
    item(`BOTTLES <b>x${inv.bottle}</b>`, 'THROW to stun & distract', inv.bottle > 0);
    item(`BATTERIES <b>x${inv.batteries}</b>`, 'Power cells', inv.batteries > 0);
    item('SECURITY KEYCARD', 'Opens the security office', inv.keycard);
    for (const m of MATS) item(`${m.name} <b>x${inv[m.key]}</b>`, 'Crafting material', inv[m.key] > 0);
    item(`BARRICADE KITS <b>x${inv.kits}</b>`, 'Seal an entrance', inv.kits > 0);
    const med = item(`MEDKITS <b>x${inv.medkit}</b>`, '+45 health', inv.medkit > 0);
    const food = item(`FOOD <b>x${inv.food}</b>`, '+18 health + stamina', inv.food > 0);
    item(`COINS <b>${inv.coins}</b>`, 'Spend at street vendors', true);
    for (const [it, n] of [[med, inv.medkit], [food, inv.food]]) {
      if (n <= 0) continue;
      const b = el('button', 'mgbtn', it === med ? 'USE' : 'EAT');
      b.addEventListener('click', () => {
        // a medkit is used first; food only when no medkit is being used
        const used = it === med ? pl.useMedkit() : (() => { const m = inv.medkit; inv.medkit = 0; const r = pl.useMedkit(); inv.medkit = m; return r; })();
        if (used) this.pausePanel('inv');
      });
      it.appendChild(b);
    }
    c.appendChild(g);
    const wl = el('div', '');
    wl.innerHTML = '<h2 style="margin-top:12px;font-size:13px">WEAPONS</h2>';
    for (const k of pl.weapons) {
      const w = WEAPONS[k];
      const b = el('button', 'mbtn center' + (pl.wKey === k ? ' sel' : ''), `${w.name} <small>DMG ${w.dmg}</small>`);
      b.addEventListener('click', () => { pl.setWeapon(k); G.audio.sfx('select'); this.pausePanel('inv'); });
      wl.appendChild(b);
    }
    c.append(wl, this.backBtn(back));
  }

  /* ---------------- workbench ---------------- */
  openCraft(title = 'WORKBENCH') {
    if (!G.playing || G.transitioning || G.player.dead) return;
    if (G.mg && G.mg.busy) return;
    G.paused = true;
    G.input.setEnabled(false);
    this.pauseEl.classList.remove('hidden');
    this.pauseEl.querySelector('h2').textContent = title;
    this.craftPanel(title);
  }
  craftPanel(title) {
    const inv = G.player.inv;
    this.pauseMain.classList.add('hidden');
    this.pauseSub.classList.remove('hidden');
    const c = this.pauseSub;
    c.innerHTML = '';
    const mats = el('p', '', MATS.map((m) => `${m.name} <b>${inv[m.key]}</b>`).join(' &nbsp;·&nbsp; '));
    mats.style.cssText = 'font:700 12px Orbitron;color:#00f0ff;letter-spacing:1px;margin:0 0 8px';
    c.appendChild(mats);
    const g = el('div', 'inv-grid craft');
    for (const r of RECIPES) {
      const why = whyNot(inv, r);
      const d = el('div', 'inv-item' + (why ? ' off' : ''), `${r.name}<small>${costText(r)} · ${r.desc}</small>`);
      const b = el('button', 'mgbtn', why || 'CRAFT');
      b.disabled = !!why;
      b.addEventListener('click', () => {
        if (craft(inv, r.id)) { G.audio.sfx('craft'); if (G.stage && G.stage.onCraft) G.stage.onCraft(r.id); this.craftPanel(title); }
        else G.audio.sfx('error');
      });
      d.appendChild(b);
      g.appendChild(d);
    }
    c.appendChild(g);
    const kits = el('p', '', `BARRICADE KITS <b>${inv.kits}</b> &nbsp;·&nbsp; MEDKITS <b>${inv.medkit}</b> &nbsp;·&nbsp; AMMO <b>${inv.ammo}</b> &nbsp;·&nbsp; SHELLS <b>${inv.shells}</b>`);
    kits.style.cssText = 'font:700 11px Orbitron;color:#ffe94d;letter-spacing:1px;margin:8px 0 0';
    c.appendChild(kits);
    const close = el('button', 'mbtn center back', 'DONE');
    close.addEventListener('click', () => { G.audio.sfx('back'); this.pauseBack(); this.closePause(); });
    c.appendChild(close);
  }

  showEnd(n) {
    const next = CHAPTERS.find((c) => c.n === n + 1);
    this.endNext = next && next.play ? next.n : 0;
    $('end-sub').textContent = `CHAPTER ${n} COMPLETE`;
    $('end-next').textContent = next ? `NEXT: CHAPTER ${next.n} · ${next.t}${next.play ? '' : ' (COMING SOON)'}` : 'THE SIGNAL IS STILL OUT THERE...';
    $('e-next').classList.toggle('hidden', !this.endNext);
    $('end').classList.remove('hidden');
    G.audio.sfx('win');
  }
}
