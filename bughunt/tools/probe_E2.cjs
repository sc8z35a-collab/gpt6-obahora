module.exports = async (p) => {
  const r = {};
  // keyboard tab order on title
  const order = [];
  for (let i = 0; i < 8; i++) { await p.keyboard.press('Tab'); order.push(await p.evaluate(() => { const a = document.activeElement; const b = a.getBoundingClientRect(); return (a.id || a.className || a.tagName) + ' ' + getComputedStyle(a).outlineStyle + ' ' + Math.round(b.width) + 'x' + Math.round(b.height); })); }
  r.tabOrder = order;
  r.feature = await p.evaluate(() => { const f = document.querySelector('.feature-list'); return [f.scrollWidth, f.clientWidth, f.getBoundingClientRect().right, innerWidth]; });
  r.rooms = await p.evaluate(() => KuchiieDiagnostics.snapshot().environment.rooms);
  r.contrast = await p.evaluate(() => ['.scene-coordinate', '.feature-list', '.landing-footer p', '.vertical-label', '.audio-advice', '#joystick-zone>span', '.chapter', '.header-center'].map(s => { const e = document.querySelector(s); const c = getComputedStyle(e); return s + ' ' + c.color + ' ' + c.fontSize; }));
  await p.click('#settings-button'); await p.waitForTimeout(300);
  await p.check('#reduce-effects'); await p.keyboard.press('Escape');
  await p.evaluate(() => document.querySelector('#start-button').click());
  const t0 = Date.now(); let s;
  while (Date.now() - t0 < 100000) { await p.waitForTimeout(3000); s = await p.evaluate(() => { const d = KuchiieDiagnostics.snapshot(); return [d.state, d.elapsed.toFixed(1), d.enemy.z.toFixed(1)]; }); if (s[0] !== 'playing') break; }
  r.endState = s;
  await p.waitForTimeout(800);
  r.endFocus = await p.evaluate(() => document.activeElement.tagName + '#' + document.activeElement.id);
  r.endText = await p.evaluate(() => document.querySelector('#end-screen').innerText);
  await p.screenshot({ path: '/tmp/e_end.png' });
  await p.keyboard.press('Tab');
  r.endTab = await p.evaluate(() => document.activeElement.tagName + '#' + document.activeElement.id);
  return r;
};
