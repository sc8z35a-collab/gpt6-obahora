// Agent E: failure-mode probe. usage: node fail_E.cjs nogl|nocdn|nocore|nogame|nographics|normal
const { chromium } = require('playwright');
(async () => {
  const mode = process.argv[2];
  const args = mode === 'nogl' ? ['--disable-webgl', '--disable-3d-apis'] : ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'];
  const b = await chromium.launch({ args });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const p = await ctx.newPage(); const logs = [];
  p.on('console', m => logs.push(m.type() + ': ' + m.text() + ' ' + (m.location().url || '')));
  p.on('requestfailed', q => logs.push('REQFAIL ' + q.url()));
  p.on('response', q => { if (q.status() >= 400) logs.push('HTTP' + q.status() + ' ' + q.url()); });
  p.on('pageerror', e => logs.push('PAGEERROR: ' + e.message));
  await p.route(/fonts\.(googleapis|gstatic)/, r => r.abort());
  if (mode === 'nocdn') await p.route(/cdn\.jsdelivr/, r => r.abort());
  if (mode === 'nogame') await p.route(/game\.js/, r => r.abort());
  if (mode === 'nographics') await p.route(/graphics\.js/, r => r.abort());
  if (mode === 'nocore') await p.route(/core\.js/, r => r.abort());
  await p.goto('http://localhost:8765/'); await p.waitForTimeout(3000);
  const r = await p.evaluate(() => { const l = document.querySelector('#loading'); const btn = document.querySelector('#reload-button'); const bb = btn.getBoundingClientRect(); return { text: l.innerText, visible: !l.classList.contains('hidden'), btnW: Math.round(bb.width), flex: getComputedStyle(l).flexDirection }; });
  console.log(mode, JSON.stringify(r)); console.log(logs.filter(l => !l.includes('GL Driver')).join('\n'));
  await b.close();
})();
