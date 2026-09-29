// Agent C: random-walk fuzz of HouseNavigation.move invariants
const {nav,h}=require('./c_sim_ai.cjs');
let viol={cantStand:0,floor1West:0,yMismatch:0,floorJump:0,stairSideZ:0};const ex={};
let rs=1;const rnd=()=>(rs=(rs*16807)%2147483647)/2147483647;
for(let run=0;run<300;run++){
  const p={x:18,z:32.7,floor:0,eyeHeight:1.62};nav.move(p,0,0);
  // start near stairs half the runs
  if(run%2){p.x=38;p.z=32;}
  let ang=rnd()*6.28;
  for(let i=0;i<6000;i++){
    if(rnd()<.02)ang=rnd()*6.28;
    const sp=(rnd()<.5?2.55:4.15)/60;const pf=p.floor;
    nav.move(p,Math.sin(ang)*sp,Math.cos(ang)*sp,.24);
    if(!nav.canStand(p.x,p.z,.24,p.floor)){viol.cantStand++;ex.cantStand??={...p};}
    if(p.floor===1&&Math.round(p.z/2)===16&&p.x<49&&p.x>39){viol.floor1West++;ex.floor1West??={...p};}
    const want=nav.surfaceHeight(p)+1.62;if(Math.abs(p.y-want)>1e-9){viol.yMismatch++;}
    if(pf!==p.floor&&!(Math.abs(p.x-49)<.5&&Math.round(p.z/2)===16)){viol.floorJump++;ex.floorJump??={...p,pf};}
    if(nav.onStairs(p)&&(p.z<31.24||p.z>32.76)){viol.stairSideZ++;ex.stairSideZ??={...p};}
  }
}
console.log(viol,ex);
