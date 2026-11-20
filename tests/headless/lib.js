// Headless-Chrome test helpers for ZOMBIE APOCALYPSE: THE LAST COMMUTE (pipe transport: NO network port is opened).
const path = require('path');
const PUP = 'C:/Users/divya/AppData/Local/Temp/claude/c1e3b284195b7b06/119f0bcd-5887-418d-9487-d6e07d1696fe/scratchpad/tools/node/node_modules/puppeteer-core';
const puppeteer = require(PUP);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.env.GAME_URL || 'file:///C:/Users/divya/OneDrive/Documents/LastCommute-play/play.html';
const OUT = path.join(__dirname, 'shots');
require('fs').mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function launch(o = {}) {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    pipe: true,
    args: ['--no-sandbox', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', '--mute-audio'],
    defaultViewport: o.touch
      ? { width: o.w || 844, height: o.h || 390, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }
      : { width: o.w || 1000, height: o.h || 562 }
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE.ERROR: ' + m.text()); });
  if (o.init) await page.evaluateOnNewDocument(o.init, o.initArg); // runs before the game script (e.g. to fake navigator.hardwareConcurrency); the function is serialised, so pass values via initArg
  if (o.settings) {
    await page.evaluateOnNewDocument((s) => { try { if (!localStorage.getItem('lastcommute.settings.v1')) localStorage.setItem('lastcommute.settings.v1', JSON.stringify(s)); } catch (e) {} }, o.settings);
  }
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__gameReady === true, { timeout: 45000 });
  const t = {
    browser, page, errors,
    sleep,
    ev: (fn, ...a) => page.evaluate(fn, ...a),
    shot: async (name) => { const f = path.join(OUT, name + '.png'); await page.screenshot({ path: f }); return f; },
    errlog: () => page.evaluate(() => { const e = document.getElementById('errlog'); return e ? e.textContent.trim() : ''; }),
    stage: () => page.evaluate(() => { const G = window.__GAME.G; return G.stage ? G.stage.key : null; }),
    waitStage: async (key, ms = 20000) => { await page.waitForFunction((k) => { const G = window.__GAME.G; return G.stage && G.stage.key === k && !G.transitioning; }, { timeout: ms }, key); },
    key: async (k, hold = 60) => { await page.keyboard.down(k); await sleep(hold); await page.keyboard.up(k); },
    press: (act) => page.evaluate((a) => window.__GAME.G.input.press(a), act),
    close: () => browser.close()
  };
  return t;
}

let pass = 0, fail = 0;
function check(name, ok, extra = '') {
  if (ok) { pass++; console.log('  PASS  ' + name + (extra ? '  (' + extra + ')' : '')); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  (' + extra + ')' : '')); }
}
function summary() { console.log(`\n== ${pass} passed, ${fail} failed ==`); return fail; }

module.exports = { launch, sleep, check, summary, OUT };
