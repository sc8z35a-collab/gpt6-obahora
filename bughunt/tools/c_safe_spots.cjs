// Agent C: search for positions where a stationary player is never caught (AI deadlock)
const {sim,nav,h}=require('./c_sim_ai.cjs');
const res=[];let n=0;
for(let f=0;f<2;f++)for(let z=0;z<19;z++)for(let x=0;x<37;x++){ if(h.floors[f][z][x])continue;
  for(const [ox,oz] of [[-.755,-.755],[.755,-.755],[-.755,.755],[.755,.755],[0,0]]){
    const p={x:x*2+ox,z:z*2+oz,floor:f};
    if(!nav.canStand(p.x,p.z,.24,f))continue;
    if(Math.random()>.25&&!(ox===0))continue; n++;
    const r=sim({...p},{x:18,z:6},150);
    if(!r.caught)res.push({p:[p.x,p.z,f],...r});
  }}
console.log('tested',n,'safe',res.length);console.log(JSON.stringify(res.slice(0,40)));
