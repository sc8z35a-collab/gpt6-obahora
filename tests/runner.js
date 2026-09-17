'use strict';
/* Test entry points embed the actual shipped page, at 100% of the real viewport.
   Production index.html never loads, starts, or freezes a test. */
(() => {
  const suite = document.currentScript.dataset.suite;
  const frame = document.getElementById('test-game');
  let started = false;
  frame.addEventListener('load', () => {
    if (started) return;
    started = true;
    const doc = frame.contentDocument;
    const script = doc.createElement('script');
    script.src = `tests/${suite}.js`;
    script.dataset.view = 'game';
    doc.body.appendChild(script);
    const poll = setInterval(() => {
      const result = doc.body.dataset[`${suite}Test`];
      if (!result) return;
      document.body.dataset.testResult = result;
      if (result === 'failed') document.getElementById('test-error').textContent = 'Test failed. See console for the failing assertion.';
      clearInterval(poll);
    }, 150);
  });
})();
