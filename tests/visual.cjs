'use strict';
// npm install --no-save playwright; node tests/visual.cjs [baseURL] [outputDirectory]
// Hooks exist only in intercepted browser responses, never in the shipped game.
const { chromium } = require('playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const baseURL = process.argv[2] || 'http://127.0.0.1:3000';
const output = path.resolve(process.argv[3] || 'artifacts/map-review');
const marker = 'updateIntro(0);updateTorch(1);requestAnimationFrame(frame);';
const hook = `
window.mapPreview = (position, target, quality='high') => {
  settings.quality=quality; applyQuality();
  camera.position.set(...position); camera.lookAt(...target);
  granny.root.visible=false; viewRig.visible=false;
  updateDecor(0); updateTorch(1); scene.updateMatrixWorld(true);
  if(graphics && graphics.enabled) graphics.render(0); else renderer.render(scene,camera);
  return {render:{...renderer.info.render},memory:{...renderer.info.memory},visual:window.KuchiieDiagnostics.snapshot().visual};
};`;
const views = [
  ['hall',[18,1.62,32.7],[18,1.5,12]],
  ['altar',[9,1.62,9],[6,1,4]],
  ['bath',[27,1.62,21],[32,1,18]],
  ['stairs',[38,1.62,32],[47,4,32]],
  ['upstairs',[54,5.42,29],[54,5,5]],
  ['sewing',[45,5.42,21],[42,4.8,15]],
  ['exit',[18,1.62,32.7],[18,1.6,35]],
  ['east-hall',[54,1.62,29],[54,1.5,5]],
  ['stair-descent',[50,5.82,32],[40,1.5,32]],
  ['wall-close',[18,1.62,28],[15,1.7,28]],
  ['tatami-close',[6,1.62,9.8],[6,0,8.1]],
  ['sewing-close',[42,5.82,16.6],[42.2,5.65,15.5]],
  ['window-close',[68.3,5.82,6],[70.6,6.15,5]]
];
for (let side=0;side<2;side++) for(let row=0;row<3;row++) {
  const x=side?30:6,z=6+row*12;
  views.push([`main-${side*3+row+1}`,[x+(side?-3:3),1.62,z+2.5],[x,1.15,z-1.5]]);
}
for(let level=0;level<2;level++)for(let side=0;side<2;side++)for(let row=0;row<3;row++) {
  const x=side?66:42,z=6+row*12,base=level*4.2;
  const dz=!side&&row===2?-2:2.5;
  views.push([`annex-${level*6+side*3+row+1}`,[x+(side?-3:3),base+1.62,z+dz],[x,base+1.1,z+(dz<0?-4:-1.5)]]);
}
(async()=>{
  await fs.mkdir(output,{recursive:true});
  const browser=await chromium.launch({args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const results=[],errors=[];
  async function prepare(options) {
    const page=await browser.newPage(options);
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.route('**/js/game.js*',async route=>{
      const original=await (await route.fetch()).text();
      if(!original.includes(marker))throw new Error('Visual hook insertion point changed');
      await route.fulfill({body:original.replace(marker,hook),contentType:'application/javascript'});
    });
    await page.goto(baseURL);await page.waitForFunction(()=>window.mapPreview);
    await page.addStyleTag({content:'body > :not(#world){display:none!important}'});
    return page;
  }
  async function capture(page,name,position,target,quality='high') {
    const metrics=await page.evaluate(args=>window.mapPreview(...args),[position,target,quality]);
    await page.screenshot({path:path.join(output,`${name}.png`),timeout:90000});
    results.push({name,...metrics});console.log('CAPTURE',name,metrics.render.calls,metrics.render.triangles);
  }
  try {
    const page=await prepare({viewport:{width:960,height:600}});
    for(const [name,position,target] of views)await capture(page,name,position,target);
    await page.close();
    for(const [name,viewport,quality] of [
      ['mobile-portrait',{width:390,height:844},'high'],
      ['mobile-landscape',{width:844,height:390},'high'],
      ['mobile-low',{width:390,height:844},'low']
    ]) {
      const mobile=await prepare({viewport,isMobile:true,hasTouch:true,deviceScaleFactor:2});
      await capture(mobile,name,[54,5.82,29],[54,5.5,5],quality);
      await mobile.close();
    }
    await fs.writeFile(path.join(output,'metrics.json'),JSON.stringify({results,errors},null,2));
    if(errors.length)throw new Error(errors.join('\n'));
    console.log(`PASS: ${results.length} actual WebGL captures; no page or shader errors.`);
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
