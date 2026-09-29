// Agent C: replicates game.js updatePlaying enemy logic (lines ~1216-1244) using real core.js
const C=require('./c_core_harness.cjs');
const h=C.createHouse(),nav=new C.HouseNavigation(h);
function sim(player,enemy,seconds=60,collected=0){
  player.floor=player.floor||0;player.eyeHeight=1.62;nav.move(player,0,0);
  const g={...enemy};g.floor=enemy.floor||0;g.y=0;
  let path=[],pathClock=0,sightClock=0,sight=false,pathGoal=-1,stuck=0,dt=1/60,t=0,chase=5;
  for(;t<seconds;t+=dt){
    const distance=Math.hypot(g.x-player.x,g.z-player.z,g.y-(player.y-player.eyeHeight));
    pathClock-=dt;sightClock-=dt;
    if(sightClock<=0){sight=nav.clearSight(g,player,.25);if(sight){path=[];pathGoal=-1;pathClock=0;}sightClock=.12;}
    if(!sight&&pathClock<=0){const goal=nav.cellId(player);if(goal!==pathGoal||!path.length||stuck>.8){path=nav.findPath(g,player);pathGoal=goal;stuck=0;}pathClock=.3;}
    const target=sight?player:path[0];
    if(target){const dx=target.x-g.x,dz=target.z-g.z,d=Math.hypot(dx,dz);
      if(d>.12){const s=(1.08+collected*.22+(distance<6?.26:0))*dt;const m=nav.move(g,dx/d*Math.min(s,d),dz/d*Math.min(s,d),.25);stuck=m?0:stuck+dt;}
      else if(path.length)path.shift();}
    if(distance<.92&&nav.clearSight(g,player)) return {caught:true,t:+t.toFixed(2)};
  }
  return {caught:false,g:{x:g.x.toFixed(2),z:g.z.toFixed(2),floor:g.floor},dist:Math.hypot(g.x-player.x,g.z-player.z).toFixed(2)};
}
module.exports={sim,nav,h,C};
if(require.main===module){
  // player pressed into a room corner (cell 1,1) floor0: x in [1.24..] -> min x = 2*1-0.76=1.24
  console.log('corner main room',sim({x:1.245,z:1.245},{x:18,z:6}));
  console.log('corner upstairs',sim({x:36+2.755+0,z:1.245,floor:1},{x:18,z:6}));
  console.log('open center',sim({x:4,z:4},{x:18,z:6}));
  console.log('wall hug (one wall)',sim({x:1.245,z:4},{x:18,z:6}));
}
