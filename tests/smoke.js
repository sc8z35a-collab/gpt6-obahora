/* Development-only DOM integration tests. Not loaded by the shipped page. */
(async () => {
  const $ = id => document.getElementById(id);
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const until = async (fn, name, timeout=25000) => {
    const start=performance.now();while(!fn()){if(performance.now()-start>timeout)throw new Error('Timeout: '+name);await wait(100);}
  };
  const assert = (value, name) => { if(!value)throw new Error(name); console.info('[SMOKE PASS] '+name); };
  const key = (type, code) => document.dispatchEvent(new KeyboardEvent(type,{code,bubbles:true}));
  try {
    await until(()=>$('loading').classList.contains('hidden'),'initial render');
    // Automated events cannot grant pointer-lock or audio activation.
    const canvas=document.querySelector('canvas');canvas.requestPointerLock=()=>Promise.resolve();
    $('sound-button').click();$('sound-button').click();
    $('howto-button').click();assert(!$('howto-modal').classList.contains('hidden'),'how-to opens');
    document.querySelector('[data-close="howto-modal"]').click();
    $('start-button').click();
    assert(document.body.classList.contains('playing')&&!$('game-hud').classList.contains('hidden'),'start activates game HUD');
    assert($('key-count').textContent==='0 / 3','new game has zero talismans');
    key('keydown','KeyS');key('keydown','ShiftLeft');
    await until(()=>parseFloat($('stamina-fill').style.width)<85,'running drains stamina');
    key('keyup','KeyS');key('keyup','ShiftLeft');
    assert(parseFloat($('stamina-fill').style.width)<85,'movement and sprint update simulation');
    await until(()=>!$('interaction-prompt').classList.contains('hidden'),'exit proximity');
    key('keydown','KeyE');key('keyup','KeyE');
    assert($('game-message').textContent.includes('封じられている'),'exit is locked until three talismans are collected');
    $('pause-button').click();
    assert(!$('pause-modal').classList.contains('hidden'),'pause opens');
    const clock=$('elapsed-time').textContent;await wait(1100);
    assert(clock===$('elapsed-time').textContent,'simulation freezes while paused');
    $('pause-settings-button').click();
    assert(!$('settings-modal').classList.contains('hidden'),'settings opens from pause');
    assert(+getComputedStyle($('settings-modal')).zIndex>+getComputedStyle($('pause-modal')).zIndex,'settings is above pause overlay');
    const q=$('quality-select');q.value='low';q.dispatchEvent(new Event('change'));
    assert(JSON.parse(localStorage.getItem('kuchiie-settings')).quality==='low','quality setting persists');
    document.querySelector('[data-close="settings-modal"]').click();$('resume-button').click();
    assert($('pause-modal').classList.contains('hidden'),'resume closes pause');
    $('pause-button').click();$('home-button').click();
    assert(!$('landing').classList.contains('hidden')&&!document.body.classList.contains('playing'),'return to title resets UI');
    $('start-button').click();assert($('key-count').textContent==='0 / 3','restart resets collectible state');
    $('sound-button').click();$('sound-button').click();
    document.body.dataset.smoke='passed';
    console.info('[SMOKE COMPLETE] All integration assertions passed. Final state: active game.');
  } catch(error) {document.body.dataset.smoke='failed';console.error('[SMOKE FAILED]',error.message);}
})();
