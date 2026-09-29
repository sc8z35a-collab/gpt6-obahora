// Agent E: several viewports in one browser. usage: NODE_PATH=/tmp/pw/node_modules node multi_E.cjs "WxHxT,..."  (T=1 touch)
const { chromium } = require('playwright');
(async () => {
  const list = process.argv[2].split(',');
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  for (const v of list) {
    const [w, h, t] = v.split('x').map(Number);
    const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: !!t, isMobile: !!t });
    const p = await ctx.newPage();
    await p.route(/fonts\.(googleapis|gstatic)/, r => r.abort());
    await p.goto('http://localhost:8765/'); await p.waitForTimeout(2500);
    const ov = await p.evaluate(() => {
      const sel = ['.brand', '.header-center', '.header-actions', '.hero-content', '.scene-caption', '.scene-coordinate', '.landing-footer', '.vertical-label', '#start-button'];
      const R = {}; for (const s of sel) { const e = document.querySelector(s); const b = e.getBoundingClientRect(); R[s] = getComputedStyle(e).display === 'none' ? null : [b.left, b.top, b.right, b.bottom].map(Math.round); }
      const hits = []; const k = Object.keys(R);
      for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { const a = R[k[i]], c = R[k[j]]; if (!a || !c) continue; if (k[j] === '#start-button' && k[i] === '.hero-content') continue; if (a[0] < c[2] && c[0] < a[2] && a[1] < c[3] && c[1] < a[3]) hits.push(k[i] + ' x ' + k[j]); }
      const off = k.filter(s => R[s] && (R[s][3] > innerHeight || R[s][1] < 0 || R[s][2] > innerWidth || R[s][0] < 0));
      return { R, hits, off };
    });
    console.log(v, JSON.stringify(ov));
    await p.screenshot({ path: `/tmp/e_v_${v}_title.png` });
    await p.evaluate(() => document.querySelector('#start-button').click()); await p.waitForTimeout(2500);
    const hud = await p.evaluate(() => {
      const sel = ['.objective', '#pause-button', '#game-message', '.hud-bottom', '#joystick-zone', '.touch-actions', '#touch-look-hint', '#desktop-hint', '#interaction-prompt'];
      const R = {}; for (const s of sel) { const e = document.querySelector(s); const b = e.getBoundingClientRect(); R[s] = b.width === 0 ? null : [b.left, b.top, b.right, b.bottom].map(Math.round); }
      const hits = []; const k = Object.keys(R);
      for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { const a = R[k[i]], c = R[k[j]]; if (!a || !c) continue; if (a[0] < c[2] && c[0] < a[2] && a[1] < c[3] && c[1] < a[3]) hits.push(k[i] + ' x ' + k[j]); }
      return { R, hits };
    });
    console.log(v, 'HUD', JSON.stringify(hud));
    await p.screenshot({ path: `/tmp/e_v_${v}_play.png` });
    await ctx.close();
  }
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
