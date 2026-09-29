module.exports = async (p) => {
  const r = {};
  // stale xhigh consent after closing settings
  await p.click('#settings-button'); await p.waitForTimeout(200);
  await p.selectOption('#quality-select', 'xhigh'); await p.waitForTimeout(200);
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  await p.click('#settings-button'); await p.waitForTimeout(200);
  r.staleConsent = await p.evaluate(() => [!document.querySelector('#xhigh-panel').classList.contains('hidden'), !document.querySelector('#xhigh-consent').classList.contains('hidden'), document.querySelector('#xhigh-tag').textContent, document.activeElement.id || document.activeElement.className]);
  // focus trap escape: focus body then Tab
  await p.evaluate(() => document.activeElement.blur());
  await p.keyboard.press('Tab');
  r.tabFromBody = await p.evaluate(() => [document.activeElement.id || document.activeElement.className, !!document.activeElement.closest('#settings-modal')]);
  // shift-tab from first focusable inside
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  r.bgInert = await p.evaluate(() => [document.querySelector('#landing').inert, document.querySelector('#landing').getAttribute('aria-hidden')]);
  // Enter-key start then Enter during play
  await p.focus('#start-button'); await p.keyboard.press('Enter'); await p.waitForTimeout(3000);
  r.activeDuringPlay = await p.evaluate(() => document.activeElement.tagName + '#' + document.activeElement.id);
  const e1 = await p.evaluate(() => KuchiieDiagnostics.snapshot().elapsed);
  await p.keyboard.press('Enter'); await p.keyboard.press(' '); await p.waitForTimeout(300);
  const e2 = await p.evaluate(() => KuchiieDiagnostics.snapshot().elapsed);
  r.enterDuringPlay = [e1, e2];
  // hud aria
  r.hudLabels = await p.evaluate(() => ({ time: document.querySelector('#elapsed-time').getAttribute('aria-label'), stamina: document.querySelector('.stamina-track').getAttribute('role'), keys: document.querySelector('.talisman-count').getAttribute('aria-label'), pauseText: document.querySelector('#pause-button').textContent }));
  // pause via Escape then check settings from pause then Escape twice
  await p.evaluate(() => document.querySelector('#pause-button').click()); await p.waitForTimeout(400);
  await p.click('#pause-settings-button'); await p.waitForTimeout(300);
  await p.keyboard.press('Escape'); await p.waitForTimeout(100);
  r.afterEsc1 = await p.evaluate(() => [KuchiieDiagnostics.snapshot().state, document.activeElement.id]);
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  r.afterEsc2 = await p.evaluate(() => [KuchiieDiagnostics.snapshot().state, document.activeElement.id]);
  return r;
};
