// Agent C: compare sampled clearSight vs exact swept-box test (segment vs walls expanded by radius)
const {nav,h}=require('./c_sim_ai.cjs');
const r=.12;let rs=7;const rnd=()=>(rs=(rs*16807)%2147483647)/2147483647;
function segHitsBox(ax,az,bx,bz,minx,minz,maxx,maxz){let t0=0,t1=1;const dx=bx-ax,dz=bz-az;
 for(const [p,q] of [[-dx,ax-minx],[dx,maxx-ax],[-dz,az-minz],[dz,maxz-az]]){if(p===0){if(q<0)return false;}else{const t=q/p;if(p<0){if(t>t1)return false;if(t>t0)t0=t;}else{if(t<t0)return false;if(t<t1)t1=t;}}}return true;}
function exact(a,b,f){const g=h.floors[f];for(let z=0;z<19;z++)for(let x=0;x<37;x++)if(g[z][x]){const c=x*2,d=z*2;
 // Navigation uses Math.round(pos/2): cell x covers [2x-1,2x+1). expanded by r
 if(segHitsBox(a.x,a.z,b.x,b.z,c-1-r,d-1-r,c+1+r,d+1+r))return false;}return true;}
let fp=0,fn=0,n=0,ex=null;
const cells=[];h.floors[0].forEach((row,z)=>row.forEach((c,x)=>{if(!c)cells.push([x,z])}));
for(let i=0;i<40000;i++){const A=cells[Math.floor(rnd()*cells.length)],B=cells[Math.floor(rnd()*cells.length)];
 const a={x:A[0]*2+(rnd()*1.5-.75),z:A[1]*2+(rnd()*1.5-.75),floor:0},b={x:B[0]*2+(rnd()*1.5-.75),z:B[1]*2+(rnd()*1.5-.75),floor:0};
 if(Math.hypot(a.x-b.x,a.z-b.z)>14)continue;n++;
 const s=nav.layers[0].clearSight(a,b,r),e=exact(a,b,0);
 if(s&&!e){fp++;ex??={a,b};} if(!s&&e)fn++;}
console.log({n,sampledSeesThroughWall:fp,sampledMissesClear:fn,ex});
