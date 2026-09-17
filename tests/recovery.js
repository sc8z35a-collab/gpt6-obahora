'use strict';
(async () => {
  const $ = id => document.getElementById(id);
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const snapshot = () => window.KuchiieDiagnostics.snapshot();
  const until = async (fn, name) => {
    const start = performance.now();
    while (!fn()) { if (performance.now() - start > 20000) throw new Error('Timeout: ' + name); await wait(100); }
  };
  const assert = (value, name) => { if (!value) throw new Error(name); console.info('[RECOVERY PASS] ' + name); };
  try {
    await until(() => $('loading').classList.contains('hidden'), 'initial rendering');
    const canvas = document.querySelector('#world canvas');
    canvas.requestPointerLock = () => Promise.resolve();
    $('sound-button').click(); $('sound-button').click();
    $('start-button').click();
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true }));
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    const extension = gl && gl.getExtension('WEBGL_lose_context');
    if (!extension) throw new Error('WEBGL_lose_context is required to test real context loss');
    extension.loseContext();
    await until(() => snapshot().contextLost, 'context loss handler');
    assert(snapshot().state === 'paused', 'actual WebGL context loss pauses gameplay');
    assert(snapshot().input.keyCount === 0 && !snapshot().input.running, 'context loss clears held inputs');
    assert(!$('reload-button').classList.contains('hidden') && !$('loading').classList.contains('hidden'), 'recovery overlay and reload action are visible');
    assert(JSON.parse(localStorage.getItem('kuchiie-settings')).quality === 'high', 'safe quality saved for next load');
    const frames = snapshot().renderFrames, time = snapshot().elapsed;
    await wait(650);
    assert(snapshot().renderFrames === frames && snapshot().elapsed === time, 'lost context stops render and simulation work');
    $('resume-button').click();
    assert(snapshot().state === 'paused', 'cannot resume into an unavailable WebGL context');
    document.body.dataset.recoveryTest = 'passed';
    console.info('[RECOVERY COMPLETE] 6 assertions passed using real WEBGL_lose_context.');
  } catch (error) {
    document.body.dataset.recoveryTest = 'failed';
    console.error('[RECOVERY FAILED] ' + error.message);
  }
})();
