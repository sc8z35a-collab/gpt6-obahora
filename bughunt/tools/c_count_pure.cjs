// Agent C: run the pure (core-only) part of tests/audit.js in Node and count runtime assertions
const fs=require('fs');const Core=require('./c_core_harness.cjs');
let src=fs.readFileSync(__dirname+'/../../tests/audit.js','utf8');
const cut=src.indexOf("await until(() => $('loading')");
src=src.slice(0,cut)+"console.log('PURE_CHECKS',checks);}catch(e){console.log('FAIL',e.message,checks)}})();";
global.window={KuchiieCore:Core};global.document={getElementById(){}};global.performance=require('perf_hooks').performance;
eval(src);
