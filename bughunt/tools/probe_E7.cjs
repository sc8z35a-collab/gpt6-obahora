// Agent E: volume=0 saved -> start game. Uses a fresh context with init script.
module.exports = async (p) => {
  const ctx = p.context();
  const q = await ctx.newPage();
  await q.addInitScript(() => { if (!sessionStorage.x) { sessionStorage.x = 1; localStorage.setItem('kuchiie-settings', JSON.stringify({ quality: 'high', sensitivity: 1, volume: 0, reduced: false })); } });
  await q.route(/fonts\.(googleapis|gstatic)/, r => r.abort());
  await p.close();
  await q.goto('http://localhost:8765/'); await q.waitForTimeout(2500);
  const before = await q.evaluate(() => [document.querySelector('#sound-label').textContent, document.querySelector('#volume-input').value]);
  await q.evaluate(() => document.querySelector('#start-button').click()); await q.waitForTimeout(800);
  const after = await q.evaluate(() => [document.querySelector('#sound-label').textContent, document.querySelector('#volume-input').value, KuchiieDiagnostics.snapshot().settings.volume]);
  await q.evaluate(() => document.querySelector('#pause-button').click()); await q.waitForTimeout(300);
  await q.evaluate(() => document.querySelector('#pause-settings-button').click()); await q.waitForTimeout(300);
  // raise volume slider, then check sound button
  await q.evaluate(() => { const v = document.querySelector('#volume-input'); v.value = 0.5; v.dispatchEvent(new Event('input')); v.value = 0; v.dispatchEvent(new Event('input')); });
  const slid = await q.evaluate(() => document.querySelector('#sound-label').textContent);
  // then toggle sound button ON with volume 0
  await q.keyboard.press('Escape'); await q.keyboard.press('Escape'); await q.waitForTimeout(400);
  await q.evaluate(() => { document.querySelector('#pause-button').click(); });
  await q.evaluate(() => document.querySelector('#sound-button') && document.querySelector('#sound-button').click());
  const toggled = await q.evaluate(() => [document.querySelector('#sound-label').textContent, KuchiieDiagnostics.snapshot().settings.volume, getComputedStyle(document.querySelector('.site-header')).display]);
  return { before, after, slid, toggled };
};
