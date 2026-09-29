// Agent E: XHIGH monitor overlap + landscape modal fit
module.exports = async (p) => {
  const tag = process.env.TAG || 'x'; const r = {};
  const rect = s => p.evaluate(s => { const e = document.querySelector(s); const b = e.getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom].map(Math.round); }, s);
  await p.evaluate(() => document.querySelector('#howto-button').click()); await p.waitForTimeout(300);
  r.howto = await p.evaluate(() => { const c = document.querySelector('#howto-modal .modal-card'); const b = c.getBoundingClientRect(); return { sh: c.scrollHeight, ch: c.clientHeight, top: Math.round(b.top), bottom: Math.round(b.bottom) }; });
  await p.screenshot({ path: `/tmp/e_x_${tag}_howto.png`, timeout: 90000 }).catch(() => r.s0 = 'fail');
  await p.keyboard.press('Escape');
  await p.evaluate(() => document.querySelector('#settings-button').click()); await p.waitForTimeout(300);
  await p.selectOption('#quality-select', 'xhigh'); await p.waitForTimeout(200);
  await p.evaluate(() => document.querySelector('#xhigh-confirm').click()); await p.waitForTimeout(1500);
  r.q = await p.evaluate(() => document.body.dataset.graphics);
  await p.keyboard.press('Escape'); await p.waitForTimeout(2000);
  for (const s of ['#graphics-monitor', '.scene-coordinate', '.header-actions', '.hero-content', '.chapter', '.scene-caption']) r['t ' + s] = await rect(s);
  await p.screenshot({ path: `/tmp/e_x_${tag}_title.png`, timeout: 120000 }).catch(() => r.s1 = 'fail');
  return r;
};
