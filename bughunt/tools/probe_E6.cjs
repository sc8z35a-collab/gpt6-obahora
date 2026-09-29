// Agent E: tap targets, volume=0 label, README map dims
module.exports = async (p) => {
  const r = {};
  r.targets = await p.evaluate(() => [...document.querySelectorAll('button:not(.hidden), a')].filter(e => e.getClientRects().length).map(e => { const b = e.getBoundingClientRect(); return (e.id || e.className) + ' ' + Math.round(b.width) + 'x' + Math.round(b.height); }));
  r.map = await p.evaluate(() => KuchiieDiagnostics.snapshot().map);
  await p.evaluate(() => { localStorage.setItem('kuchiie-settings', JSON.stringify({ quality: 'high', sensitivity: 1, volume: 0, reduced: false })); });
  await p.reload(); await p.waitForTimeout(2500);
  await p.evaluate(() => document.querySelector('#start-button').click()); await p.waitForTimeout(800);
  r.vol0 = await p.evaluate(() => [document.querySelector('#sound-label').textContent, document.querySelector('#volume-input').value, document.querySelector('#sound-button').getAttribute('aria-label')]);
  r.center = await p.evaluate(() => { const b = document.querySelector('.header-center').getBoundingClientRect(); return [(b.left + b.right) / 2, innerWidth / 2]; });
  return r;
};
