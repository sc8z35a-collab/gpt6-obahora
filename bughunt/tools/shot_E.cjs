// Agent E: screenshot + DOM probe tool. usage: NODE_PATH=/tmp/pw/node_modules node shot_E.cjs W H touch(0/1) out.png [script.js]
const { chromium } = require('playwright');
(async () => {
  const [w, h, touch, out, scriptFile] = process.argv.slice(2);
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: +w, height: +h }, hasTouch: touch === '1', isMobile: touch === '1', deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  const logs = [];
  p.on('console', m => logs.push(m.type() + ': ' + m.text()));
  p.on('pageerror', e => logs.push('PAGEERROR: ' + e.message));
  await p.route(/fonts\.(googleapis|gstatic)/, r => r.abort()).catch(()=>{});
  await p.goto(process.env.URL || 'http://localhost:8765/', { waitUntil: 'load' });
  await p.waitForTimeout(2500);
  if (scriptFile) {
    const fn = require(require('path').resolve(scriptFile));
    const r = await fn(p);
    if (r !== undefined) console.log('RESULT', JSON.stringify(r, null, 1));
  }
  await p.screenshot({ path: out });
  console.log(logs.slice(0, 30).join('\n'));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
