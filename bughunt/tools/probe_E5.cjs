// Agent E: landscape settings fit + XHIGH monitor during play
module.exports = async (p) => {
  const r = {};
  const rect = s => p.evaluate(s => { const e = document.querySelector(s); const b = e.getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom].map(Math.round); }, s);
  await p.evaluate(() => document.querySelector('#settings-button').click()); await p.waitForTimeout(300);
  await p.selectOption('#quality-select', 'xhigh'); await p.waitForTimeout(200);
  r.settingsBeforeConfirm = await p.evaluate(() => { const c = document.querySelector('#settings-modal .modal-card'); const btn = document.querySelector('#xhigh-confirm').getBoundingClientRect(); return { sh: c.scrollHeight, ch: c.clientHeight, confirmTop: Math.round(btn.top), vh: innerHeight, focused: document.activeElement.id }; });
  await p.evaluate(() => document.querySelector('#xhigh-confirm').click()); await p.waitForTimeout(1200);
  await p.keyboard.press('Escape');
  await p.evaluate(() => document.querySelector('#start-button').click()); await p.waitForTimeout(3000);
  for (const s of ['#graphics-monitor', '.objective', '.talisman-count', '#pause-button', '#game-message', '#touch-look-hint', '.touch-actions']) r['p ' + s] = await rect(s);
  r.monitorVisible = await p.evaluate(() => getComputedStyle(document.querySelector('#graphics-monitor')).display);
  return r;
};
