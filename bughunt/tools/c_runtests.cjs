// Agent C: run a tests/*.html page headless. usage: NODE_PATH=/tmp/pw/node_modules node c_runtests.cjs regression.html W H touch
const { chromium } = require('playwright');
(async()=>{const [page='regression.html',w='960',h='640',touch='0']=process.argv.slice(2);
 const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader']});
 const ctx=await b.newContext({viewport:{width:+w,height:+h},hasTouch:touch==='1',isMobile:touch==='1'});
 const p=await ctx.newPage();const logs=[];
 p.on('console',m=>logs.push(m.type()+': '+m.text().slice(0,300)));p.on('pageerror',e=>logs.push('PAGEERROR '+e.message));
 await p.route(/fonts\.(googleapis|gstatic)/,r=>r.abort());
 await p.goto('http://localhost:8766/tests/'+page);
 try{await p.waitForFunction(()=>document.body.dataset.testResult,null,{timeout:400000});}catch(e){logs.push('TIMEOUT')}
 console.log('RESULT',await p.evaluate(()=>document.body.dataset.testResult));
 console.log(logs.filter(l=>!/AUDIT PASS|GRAPHICS PASS|RECOVERY PASS/.test(l)).join('\n'));
 console.log('passes',logs.filter(l=>/PASS\]/.test(l)).length);
 await b.close();})();
