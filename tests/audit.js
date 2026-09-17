'use strict';
/* Regression checks for shared core rules and real production DOM/input handlers. */
(async () => {
  const $ = id => document.getElementById(id);
  const Core = window.KuchiieCore;
  const snapshot = () => window.KuchiieDiagnostics.snapshot();
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const until = async (fn, name, timeout = 20000) => {
    const start = performance.now();
    while (!fn()) { if (performance.now() - start > timeout) throw new Error('Timeout: ' + name); await wait(50); }
  };
  let checks = 0;
  const assert = (value, name) => { if (!value) throw new Error(name); checks++; console.info('[AUDIT PASS] ' + name); };
  const key = (type, code, repeat = false) => document.dispatchEvent(new KeyboardEvent(type, { code, repeat, bubbles: true }));
  const pointer = (target, type, id, x = 50, y = 100) => target.dispatchEvent(new PointerEvent(type, {
    pointerId: id, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, cancelable: true
  }));
  try {
    const defaults = Core.sanitizeSettings(null);
    assert(defaults.quality === 'high' && defaults.volume === .6, 'null saved settings use safe defaults');
    const invalid = Core.sanitizeSettings({ quality: 'unknown', sensitivity: NaN, volume: Infinity, reduced: 'false' });
    assert(invalid.quality === 'high' && invalid.sensitivity === 1 && invalid.volume === .6 && !invalid.reduced, 'invalid numbers/types cannot corrupt settings');
    const bounded = Core.sanitizeSettings({ sensitivity: 99, volume: -3, reduced: true, quality: 'xhigh' });
    assert(bounded.sensitivity === 2 && bounded.volume === 0 && bounded.reduced && bounded.quality === 'xhigh', 'settings clamp to supported ranges');
    const grid = ['1111111','1000001','1011101','1000101','1110101','1000001','1111111'].map(row => [...row].map(Number));
    const nav = new Core.Navigation(grid, 2), from = { x: 2, z: 2 }, goal = { x: 10, z: 10 };
    const path = nav.findPath(from, goal);
    assert(path.length > 0 && path.every(point => nav.canStand(point.x, point.z)), 'BFS finds walkable route around walls');
    assert(nav.findPath(from, { x: -2, z: -2 }).length === 0, 'out-of-map path target rejected');
    assert(!nav.clearSight({ x: 2, z: 4 }, { x: 10, z: 4 }), 'line of sight cannot pass through walls');
    assert(!nav.clearSight(from, { x: NaN, z: 2 }), 'non-finite ray rejected');
    const mover = { x: 2, z: 4 };
    nav.move(mover, 8, 0);
    assert(mover.x < 3 && nav.canStand(mover.x, mover.z), 'large movement cannot tunnel through a wall');
    const walker = { ...from }, remaining = [...path];
    for (let i = 0; i < 2000 && remaining.length; i++) {
      const target = remaining[0], dx = target.x - walker.x, dz = target.z - walker.z, length = Math.hypot(dx, dz);
      if (length < .06) { remaining.shift(); continue; }
      nav.move(walker, dx / length * Math.min(.09, length), dz / length * Math.min(.09, length), .25);
    }
    assert(Math.hypot(walker.x - goal.x, walker.z - goal.z) < .08, 'route can actually be traversed through corners');
    const energy = { value: 100, exhausted: false, sprint: false };
    for (let i = 0; i < 600 && !energy.exhausted; i++) Core.stepStamina(energy, energy.value, energy.exhausted, true, true, 1 / 60);
    assert(energy.exhausted && energy.value <= 1, 'sprint exhaustion latches');
    Core.stepStamina(energy, energy.value, energy.exhausted, true, true, 1 / 60);
    assert(!energy.sprint, 'holding sprint cannot jitter between walking and sprint at zero');
    let prematurelySprinted = false;
    while (energy.value < 25) { Core.stepStamina(energy, energy.value, energy.exhausted, true, true, 1 / 60); prematurelySprinted ||= energy.sprint; }
    assert(!prematurelySprinted, 'sprint stays disabled until recovery threshold');
    Core.stepStamina(energy, energy.value, energy.exhausted, true, true, 1 / 60);
    assert(energy.sprint && !energy.exhausted, 'sprint becomes available after recovery');
    await until(() => $('loading').classList.contains('hidden'), 'initial render');
    assert(snapshot().savedRigidDraws > 0, 'rigid voxel parts are instanced without removing animated joints');
    const canvas = document.querySelector('#world canvas');
    canvas.requestPointerLock = () => Promise.resolve();
    $('sound-button').click(); $('sound-button').click();
    $('howto-button').click();
    assert(snapshot().modalDepth === 1, 'opening modal records a frozen scene');
    document.querySelector('[data-close="howto-modal"]').click();
    $('start-button').click();
    assert(snapshot().state === 'playing' && snapshot().collected === 0 && $('elapsed-time').textContent === '00:00', 'new game resets state, counter and timer');
    const before = snapshot();
    key('keydown', 'KeyW');
    await until(() => snapshot().elapsed - before.elapsed > .6, 'walking');
    key('keyup', 'KeyW');
    const after = snapshot();
    assert(Math.abs((before.player.z - after.player.z) / (after.elapsed - before.elapsed) - 2.55) < .05, 'walking speed matches simulated elapsed time');
    assert(after.navigationSearches - before.navigationSearches < 3, 'direct pursuit does not recompute BFS every frame');
    const joystick = $('joystick-zone');
    pointer(joystick, 'pointerdown', 101, 70, 650);
    pointer(joystick, 'pointermove', 101, 96, 618);
    pointer(joystick, 'pointerdown', 102, 250, 650);
    assert(snapshot().input.stickPointer === 101, 'second finger cannot steal movement joystick');
    pointer(document, 'pointercancel', 101);
    assert(snapshot().input.stickPointer === null && snapshot().input.stickX === 0, 'cancel releases movement and stick position');
    pointer(canvas, 'pointerdown', 201, innerWidth * .8, 300);
    pointer(canvas, 'pointerdown', 202, innerWidth * .7, 400);
    assert(snapshot().input.lookPointer === 201, 'second look finger cannot replace first look pointer');
    const yawBefore = snapshot().yaw;
    pointer(document, 'pointermove', 201, innerWidth * .8 + 20, 310);
    assert(snapshot().yaw !== yawBefore, 'touch look updates camera orientation');
    pointer(canvas, 'lostpointercapture', 201);
    assert(snapshot().input.lookPointer === null, 'lost look capture clears pointer');
    pointer($('run-button'), 'pointerdown', 301);
    pointer($('run-button'), 'pointerdown', 302);
    pointer(document, 'pointerup', 302);
    assert(snapshot().input.running && snapshot().input.runPointer === 301, 'unrelated finger release cannot cancel held sprint');
    pointer(document, 'pointercancel', 301);
    assert(!snapshot().input.running && snapshot().input.runPointer === null, 'sprint cancel clears ownership');
    $('pause-button').click();
    await wait(500);
    const paused = snapshot();
    await wait(700);
    assert(snapshot().elapsed === paused.elapsed, 'paused simulation time is frozen');
    assert(snapshot().renderFrames === paused.renderFrames, 'paused scene submits no extra rendering frames');
    key('keydown', 'Escape', true);
    assert(snapshot().state === 'paused', 'repeating Escape cannot accidentally resume');
    $('pause-settings-button').click();
    assert(snapshot().modalDepth === 2, 'settings above pause tracks nested dialogs');
    const quality = $('quality-select'); quality.value = 'low'; quality.dispatchEvent(new Event('change'));
    await wait(500);
    assert(snapshot().quality === 'low', 'quality can change while paused');
    document.querySelector('[data-close="settings-modal"]').click();
    assert(snapshot().modalDepth === 1, 'closing settings retains underlying pause');
    $('resume-button').click();
    assert(snapshot().state === 'playing' && snapshot().modalDepth === 0, 'resume clears pause without stale modal state');
    key('keydown', 'KeyW');
    window.dispatchEvent(new Event('blur'));
    assert(snapshot().state === 'paused' && snapshot().input.keyCount === 0, 'focus loss pauses and clears held keyboard keys');
    $('home-button').click(); $('start-button').click();
    assert(snapshot().collected === 0 && snapshot().elapsed === 0 && snapshot().stamina === 100 && !snapshot().exhausted, 'retry resets all gameplay and stamina state');
    key('keydown', 'KeyS'); key('keydown', 'ShiftLeft');
    await until(() => snapshot().player.z > 33.6, 'approach exit');
    key('keyup', 'KeyS'); key('keyup', 'ShiftLeft');
    $('interact-button').click();
    assert($('game-message').textContent.includes('封じられている'), 'exit remains locked without talismans');
    const copy = snapshot(); copy.player.x = 999; copy.settings.volume = 999;
    assert(snapshot().player.x !== 999 && snapshot().settings.volume !== 999, 'diagnostics expose copies, never mutable game references');
    $('pause-button').click(); $('home-button').click(); $('start-button').click();
    console.info('[AUDIT METRICS] ' + JSON.stringify(snapshot()));
    document.body.dataset.auditTest = 'passed';
    console.info(`[AUDIT COMPLETE] ${checks} assertions passed.`);
  } catch (error) {
    document.body.dataset.auditTest = 'failed';
    console.error('[AUDIT FAILED] ' + error.message);
  }
})();
