// Agent E: howto modal during play? backdrop click on pause; settings opened from title then start via Enter
module.exports = async (p) => {
  const r = {};
  await p.evaluate(() => document.querySelector('#start-button').click()); await p.waitForTimeout(1500);
  await p.evaluate(() => document.querySelector('#pause-button').click()); await p.waitForTimeout(300);
  // click backdrop of pause modal
  await p.mouse.click(5, 5); await p.waitForTimeout(200);
  r.afterBackdrop = await p.evaluate(() => [KuchiieDiagnostics.snapshot().state, !document.querySelector('#pause-modal').classList.contains('hidden')]);
  // open settings from pause, click backdrop of settings
  await p.evaluate(() => document.querySelector('#pause-settings-button').click()); await p.waitForTimeout(200);
  r.zorder = await p.evaluate(() => [getComputedStyle(document.querySelector('#settings-modal')).zIndex, getComputedStyle(document.querySelector('#pause-modal')).zIndex]);
  await p.mouse.click(5, 5); await p.waitForTimeout(200);
  r.afterSettingsBackdrop = await p.evaluate(() => [KuchiieDiagnostics.snapshot().state, !document.querySelector('#settings-modal').classList.contains('hidden'), document.activeElement.id]);
  // go home, then check HUD prompt state / message leftover
  await p.evaluate(() => document.querySelector('#home-button').click()); await p.waitForTimeout(500);
  r.home = await p.evaluate(() => ({ state: KuchiieDiagnostics.snapshot().state, focus: document.activeElement.id || document.activeElement.tagName, msgVisible: document.querySelector('#game-message').classList.contains('visible'), graphicsMon: getComputedStyle(document.querySelector('#graphics-monitor')).display }));
  return r;
};
