import { $, el, clamp, rand } from '../core/util.js';
import { G } from '../core/state.js';

const head = (o, dt, dp) => `<h3>${o.title || dt}</h3><p class="mgmsg">${o.text || dp}</p>`;
const shakeEl = (e) => { e.classList.remove('bad'); void e.offsetWidth; e.classList.add('bad'); };

function tapRing(box, o, done, ctx) {
  box.innerHTML = head(o, 'TAP THE BEAT', 'Tap when the ring hits the target') +
    '<div class="mgarea"></div><div class="mgbar"><span style="width:0%"></span></div><button class="mgbtn big">TAP</button>';
  const area = box.querySelector('.mgarea'), bar = box.querySelector('.mgbar span'), btn = box.querySelector('.mgbtn');
  const cx = area.clientWidth / 2, cy = area.clientHeight / 2;
  const target = el('div', 'mgtarget');
  target.style.cssText = `left:${cx}px;top:${cy}px;width:68px;height:68px`;
  const ring = el('div', 'mgring');
  ring.style.cssText = `left:${cx}px;top:${cy}px`;
  area.append(target, ring);
  const period = o.period || 1.25, need = o.hits || 4;
  let t0 = performance.now(), hits = 0, finished = false;
  const radius = (now) => 110 - 96 * Math.min(1, (now - t0) / 1000 / period);
  const loop = (now) => {
    const r = radius(now);
    ring.style.width = ring.style.height = r * 2 + 'px';
    if ((now - t0) / 1000 > period * 1.15) t0 = now;
    ctx.raf = requestAnimationFrame(loop);
  };
  ctx.raf = requestAnimationFrame(loop);
  const tap = (e) => {
    e.preventDefault();
    if (finished) return;
    const r = radius(performance.now());
    if (Math.abs(r - 34) <= 15) {
      hits++;
      bar.style.width = (hits / need) * 100 + '%';
      G.audio.sfx('coin');
      target.style.borderColor = '#39ff9a';
      setTimeout(() => { target.style.borderColor = ''; }, 180);
      t0 = performance.now() + 200;
      if (hits >= need) { finished = true; setTimeout(() => done(true), 280); }
    } else {
      G.audio.sfx('error');
      shakeEl(btn);
    }
  };
  area.addEventListener('pointerdown', tap);
  btn.addEventListener('pointerdown', tap);
}

function scrub(box, o, done, ctx) {
  box.innerHTML = head(o, 'BRUSH YOUR TEETH', 'Drag left and right over the teeth') +
    '<div class="mgarea"></div><div class="mgbar"><span style="width:0%"></span></div>';
  const area = box.querySelector('.mgarea'), bar = box.querySelector('.mgbar span');
  const w = area.clientWidth, h = area.clientHeight;
  const tooth = el('div', 'tooth');
  tooth.style.left = w / 2 - 45 + 'px';
  tooth.style.top = h / 2 - 30 + 'px';
  const brush = el('div', '');
  brush.style.cssText = 'position:absolute;width:70px;height:16px;border-radius:8px;background:linear-gradient(90deg,#ff2bd6,#00f0ff);box-shadow:0 0 12px #00f0ff;transform:translate(-50%,-50%);display:none;pointer-events:none';
  area.append(tooth, brush);
  const need = o.need || 1500;
  let acc = 0, lx = 0, drag = false, finished = false, lastTick = 0;
  area.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    drag = true;
    area.setPointerCapture(e.pointerId);
    lx = e.clientX;
    brush.style.display = 'block';
  });
  area.addEventListener('pointermove', (e) => {
    if (!drag || finished) return;
    const r = area.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;
    brush.style.left = px + 'px';
    brush.style.top = py + 'px';
    const dx = Math.abs(e.clientX - lx);
    lx = e.clientX;
    const near = Math.abs(px - w / 2) < 90 && Math.abs(py - h / 2) < 60;
    if (near) {
      acc += dx;
      bar.style.width = clamp(acc / need, 0, 1) * 100 + '%';
      tooth.style.boxShadow = `0 0 ${14 + (acc / need) * 30}px #00f0ff`;
      if (dx > 3 && performance.now() - lastTick > 70) {
        lastTick = performance.now();
        const f = el('div', 'foam');
        const s = rand(6, 16);
        f.style.cssText = `left:${px + rand(-30, 30)}px;top:${py + rand(-14, 14)}px;width:${s}px;height:${s}px`;
        area.appendChild(f);
        setTimeout(() => f.remove(), 450);
        G.audio.sfx('tick');
      }
      if (acc >= need) { finished = true; G.audio.sfx('pickup'); setTimeout(() => done(true), 350); }
    }
  });
  const up = () => { drag = false; brush.style.display = 'none'; };
  area.addEventListener('pointerup', up);
  area.addEventListener('pointercancel', up);
}

function mash(box, o, done, ctx) {
  box.innerHTML = head(o, 'MASH!', 'Tap fast!') +
    '<div class="mgbar"><span style="width:100%;background:linear-gradient(90deg,#ff2244,#ffe94d)"></span></div>' +
    '<div class="mgbar"><span style="width:0%"></span></div><button class="mgbtn big">TAP!</button>';
  const bars = box.querySelectorAll('.mgbar span'), btn = box.querySelector('.mgbtn');
  const taps = o.taps || 8, time = o.time || 3;
  let n = 0, start = performance.now(), finished = false;
  const loop = (now) => {
    const rem = time - (now - start) / 1000;
    bars[0].style.width = clamp(rem / time, 0, 1) * 100 + '%';
    if (rem <= 0 && !finished) {
      if (o.noFail) { start = now; n = 0; bars[1].style.width = '0%'; }
      else { finished = true; done(false); return; }
    }
    ctx.raf = requestAnimationFrame(loop);
  };
  ctx.raf = requestAnimationFrame(loop);
  const tap = (e) => {
    e.preventDefault();
    if (finished) return;
    n++;
    G.audio.sfx('tick');
    bars[1].style.width = (n / taps) * 100 + '%';
    if (o.sfx) G.audio.sfx(o.sfx);
    if (n >= taps) { finished = true; setTimeout(() => done(true), 150); }
  };
  btn.addEventListener('pointerdown', tap);
  box.addEventListener('pointerdown', (e) => { if (e.target === box) tap(e); });
}

function dress(box, o, done, ctx) {
  const items = o.items;
  box.innerHTML = head(o, 'GET DRESSED', 'Tap the glowing item') + '<div class="mgarea" style="display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap"></div>';
  const area = box.querySelector('.mgarea');
  const order = items.map((_, i) => i).sort(() => Math.random() - 0.5);
  let idx = 0;
  const btns = [];
  const refresh = () => btns.forEach((b, i) => { b.cls = b; });
  order.forEach((i) => {
    const b = el('button', 'mgbtn', items[i].label);
    b.dataset.i = i;
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const k = +b.dataset.i;
      if (k === idx) {
        b.classList.remove('glow');
        b.classList.add('good');
        G.audio.sfx('pickup');
        if (o.onEquip) o.onEquip(items[k].id);
        idx++;
        if (idx >= items.length) setTimeout(() => done(true), 350);
        else btns.find((x) => +x.dataset.i === idx).classList.add('glow');
      } else if (!b.classList.contains('good')) {
        G.audio.sfx('error');
        shakeEl(b);
      }
    });
    area.appendChild(b);
    btns.push(b);
  });
  refresh();
  btns.find((x) => +x.dataset.i === 0).classList.add('glow');
}

function swipeCard(box, o, done, ctx) {
  box.innerHTML = head(o, 'SWIPE YOUR PASS', 'Drag the card across the reader at a steady speed') +
    '<div class="mgarea"><div class="slot"></div></div>';
  const area = box.querySelector('.mgarea'), msg = box.querySelector('.mgmsg');
  const card = el('div', 'card', 'BUS PASS');
  card.style.left = '8px';
  card.style.top = area.clientHeight / 2 - 28 + 'px';
  area.appendChild(card);
  const w = area.clientWidth;
  let drag = false, t0 = 0, ox = 0, finished = false;
  card.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    drag = true;
    card.setPointerCapture(e.pointerId);
    ox = e.clientX - card.offsetLeft;
    t0 = 0;
  });
  card.addEventListener('pointermove', (e) => {
    if (!drag || finished) return;
    const x = clamp(e.clientX - ox, 8, w - 98);
    card.style.left = x + 'px';
    if (!t0 && x > w * 0.28) t0 = performance.now();
    if (x > w - 108) {
      const dt = performance.now() - t0;
      drag = false;
      if (t0 && dt > 220 && dt < 1500) { finished = true; msg.textContent = 'ACCEPTED'; G.audio.sfx('pickup'); setTimeout(() => done(true), 400); }
      else { msg.textContent = dt <= 220 ? 'TOO FAST - TRY AGAIN' : 'TOO SLOW - TRY AGAIN'; G.audio.sfx('error'); card.style.left = '8px'; }
    }
  });
  const up = () => { if (drag && !finished) card.style.left = '8px'; drag = false; };
  card.addEventListener('pointerup', up);
  card.addEventListener('pointercancel', up);
}

function glass(box, o, done, ctx) {
  const need = o.hits || 3;
  box.innerHTML = head(o, 'BREAK THE GLASS', 'Strike when the marker is in the green zone') +
    '<div class="mgarea" style="width:90px;height:200px"></div><div class="mgbar"><span style="width:0%"></span></div><button class="mgbtn big">STRIKE</button>';
  const area = box.querySelector('.mgarea'), bar = box.querySelector('.mgbar span'), btn = box.querySelector('.mgbtn'), msg = box.querySelector('.mgmsg');
  const H = 200;
  const zone = el('div', 'mgzone');
  const mark = el('div', 'mgmark');
  area.append(zone, mark);
  const place = () => { zone.style.top = rand(10, H - 62) + 'px'; zone.style.height = '48px'; };
  place();
  let hits = 0, finished = false;
  const t0 = performance.now();
  const pos = (now) => { const p = ((now - t0) / 1000 * 1.5) % 2; return (p < 1 ? p : 2 - p) * (H - 6); };
  const loop = (now) => { mark.style.top = pos(now) + 'px'; ctx.raf = requestAnimationFrame(loop); };
  ctx.raf = requestAnimationFrame(loop);
  const strike = (e) => {
    e.preventDefault();
    if (finished) return;
    const y = pos(performance.now()) + 3;
    const zt = parseFloat(zone.style.top);
    if (y >= zt && y <= zt + 48) {
      hits++;
      G.audio.sfx('glass');
      bar.style.width = (hits / need) * 100 + '%';
      msg.textContent = 'CRACK!';
      place();
      if (hits >= need) { finished = true; setTimeout(() => done(true), 350); }
    } else {
      msg.textContent = 'MISSED - AGAIN';
      G.audio.sfx('error');
      shakeEl(btn);
    }
  };
  btn.addEventListener('pointerdown', strike);
  area.addEventListener('pointerdown', strike);
}

const GAMES = { tapRing, scrub, mash, dress, swipeCard, glass };

export class MiniGames {
  constructor() {
    this.root = $('mg');
    this.active = null;
  }
  get busy() { return !!this.active; }
  run(kind, opts = {}) {
    if (this.active) this.abort();
    return new Promise((resolve) => {
      this.root.innerHTML = '';
      this.root.classList.remove('hidden');
      G.input.setEnabled(false);
      const box = el('div', 'mgbox panel');
      this.root.appendChild(box);
      const ctx = { raf: 0 };
      const finish = (ok) => {
        if (this.active !== ctx) return;
        cancelAnimationFrame(ctx.raf);
        this.active = null;
        this.root.classList.add('hidden');
        this.root.innerHTML = '';
        if (G.player && !G.player.dead) G.input.setEnabled(true);
        resolve(ok);
      };
      ctx.finish = finish;
      this.active = ctx;
      GAMES[kind](box, opts, finish, ctx);
    });
  }
  abort() {
    if (this.active) this.active.finish(false);
  }
}
