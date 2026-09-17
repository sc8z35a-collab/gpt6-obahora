/* Development-only integration checks. Never load in the published entry point. */
(async () => {
  const view = document.currentScript.dataset.view || 'game';
  const $ = id => document.getElementById(id);
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const until = async (fn, name, timeout = 90000) => {
    const start = performance.now();
    while (!fn()) {
      if (performance.now() - start > timeout) throw new Error('Timeout: ' + name);
      await wait(100);
    }
  };
  const assert = (value, name) => { if (!value) throw new Error(name); console.info('[GRAPHICS PASS] ' + name); };
  const select = value => { $('quality-select').value = value; $('quality-select').dispatchEvent(new Event('change')); };
  let stats = null;
  window.addEventListener('kuchiie:graphics', e => { stats = e.detail; });
  try {
    await until(() => $('loading').classList.contains('hidden'), 'initial load');
    $('settings-button').click();
    select('xhigh');
    assert(document.body.dataset.graphics === 'high', 'XHIGH does not activate before confirmation');
    assert(!$('xhigh-consent').classList.contains('hidden'), 'explicit load warning and consent visible');
    $('xhigh-cancel').click();
    assert($('xhigh-panel').classList.contains('hidden'), 'cancel leaves existing quality untouched');
    select('xhigh'); $('xhigh-confirm').click();
    await until(() => stats && stats.frames >= 2, 'XHIGH rendered frames');
    assert(document.body.dataset.graphics === 'xhigh', 'XHIGH is active');
    assert(stats.width * stats.height > innerWidth * innerHeight, 'actual supersampled render buffer');
    assert(stats.shadow === 4096 && stats.particles === 4800, '4K torch shadow and 4800 particles configured');
    assert(stats.reflections && stats.aoSamples === 12 && stats.fogSteps === 20, 'reflection and depth effects enabled');
    assert(stats.drawCalls > 0, 'GPU scene and postprocess passes submitted');
    const snapshot = () => window.KuchiieDiagnostics.snapshot();
    await wait(500);
    const frozenFrames = snapshot().renderFrames;
    await wait(600);
    assert(snapshot().renderFrames === frozenFrames, 'XHIGH settings stop all redundant full-scene rendering');
    console.info('[GRAPHICS STATS] ' + JSON.stringify(stats));
    assert(JSON.parse(localStorage.getItem('kuchiie-settings')).quality === 'xhigh', 'selection persists');
    const xWidth = document.querySelector('#world canvas').width;
    window.dispatchEvent(new Event('resize'));
    assert(document.querySelector('#world canvas').width === xWidth, 'resize preserves XHIGH resolution');
    select('low');
    assert(document.body.dataset.graphics === 'low', 'switch to low works');
    assert(document.querySelector('#world canvas').width < xWidth, 'low mode restores lower rendering resolution');
    assert($('graphics-monitor').classList.contains('hidden'), 'XHIGH monitor hidden in low mode');
    await wait(700);
    const lowBaseline = snapshot().gpu;
    select('high');
    assert(document.body.dataset.graphics === 'high', 'high mode restored');
    stats = null;
    select('xhigh'); $('xhigh-confirm').click();
    await until(() => stats && stats.frames >= 3, 'recreated XHIGH pipeline');
    $('graphics-recover').click();
    assert(document.body.dataset.graphics === 'high', 'quick recovery button returns to high');
    select('low');
    await wait(700);
    const lowAgain = snapshot().gpu;
    assert(lowAgain.textures === lowBaseline.textures && lowAgain.geometries === lowBaseline.geometries, 'repeated XHIGH teardown restores texture and geometry counts');
    assert(lowAgain.programs <= lowBaseline.programs + 2, 'repeated quality switches do not grow shader programs unboundedly');
    console.info('[GRAPHICS MEMORY] ' + JSON.stringify({ first: lowBaseline, second: lowAgain }));
    stats = null;
    select('xhigh'); $('xhigh-confirm').click();
    await until(() => stats && stats.frames >= 4, 'final XHIGH render');
    const reduced = $('reduce-effects'); reduced.checked = true; reduced.dispatchEvent(new Event('change'));
    assert(JSON.parse(localStorage.getItem('kuchiie-settings')).reduced, 'reduced-effects preference coexists with XHIGH');
    reduced.checked = false; reduced.dispatchEvent(new Event('change'));
    const frozenBeforeResize = snapshot().renderFrames;
    window.dispatchEvent(new Event('resize'));
    await until(() => snapshot().renderFrames > frozenBeforeResize, 'paused resize redraw');
    assert(snapshot().renderFrames > frozenBeforeResize, 'paused viewport changes still redraw the scene');
    if (view === 'game') {
      document.querySelector('[data-close="settings-modal"]').click();
      document.querySelector('#world canvas').requestPointerLock = () => Promise.resolve();
      $('sound-button').click(); $('sound-button').click();
      $('start-button').click();
      assert(document.body.classList.contains('playing'), 'XHIGH game starts normally');
      const previousFrames = stats.frames;
      await until(() => stats.frames > previousFrames, 'gameplay XHIGH render');
    }
    assert(document.documentElement.scrollWidth <= innerWidth, 'no horizontal page overflow');
    // Freeze only this development capture after the real XHIGH frames have rendered.
    // Software WebGL otherwise monopolizes the screenshot worker. Quality is unchanged.
    const nativeRAF = window.requestAnimationFrame.bind(window);
    let captureFrame = null;
    window.requestAnimationFrame = callback => { captureFrame = callback; return 0; };
    // Screenshot service may set its device viewport after the ready selector.
    window.addEventListener('resize', () => { if (captureFrame) nativeRAF(captureFrame); });
    await wait(800);
    document.body.dataset.graphicsTest = 'passed';
    console.info('[GRAPHICS COMPLETE] All checks passed. View: ' + view);
  } catch (error) {
    document.body.dataset.graphicsTest = 'failed';
    console.error('[GRAPHICS FAILED] ' + error.message);
  }
})();
