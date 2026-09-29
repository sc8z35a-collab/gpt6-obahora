// Agent C: load js/core.js in Node with a fake window
const fs=require('fs');global.window={};eval(fs.readFileSync(__dirname+'/../../js/core.js','utf8'));
module.exports=window.KuchiieCore;
