'use strict';
/* KUCHIIE — self-contained procedural WebGL horror. No external game assets. */
(() => {
  const elements = new Map();
  const $ = id => { if (!elements.has(id)) elements.set(id, document.getElementById(id)); return elements.get(id); };
  if (!window.THREE) {
    $('loading-text').textContent = '3Dライブラリを読み込めませんでした。通信を確認して再読み込みしてください。';
    $('reload-button').classList.remove('hidden'); $('reload-button').onclick=()=>location.reload();
    return;
  }
  const T = THREE;
  const isTouch = matchMedia('(pointer:coarse)').matches;
  const CELL = 2, SIZE = 19;
  const Core = window.KuchiieCore;
  if (!Core) { $('loading-text').textContent = 'ゲームコードを読み込めませんでした。再読み込みしてください。'; return; }
  let savedSettings = null;
  try { savedSettings = JSON.parse(localStorage.getItem('kuchiie-settings') || 'null'); } catch (_) {}
  const settings = Core.sanitizeSettings(savedSettings);
  // XHIGH always requires a fresh gesture after loading, preventing crash/reload loops.
  const restoreXhigh = settings.quality === 'xhigh';
  if (restoreXhigh || !['high', 'low'].includes(settings.quality)) settings.quality = 'high';
  let state = 'intro', soundOn = false, soundPreferenceTouched = false, elapsed = 0, collected = 0, stamina = 100;
  let yaw = 0, pitch = 0, walkPhase = 0, chaseTime = 0, lastFoot = 0, lastEnemyFoot = 0;
  let messageUntil = 0, threat = 0, targetItem = null, deathTime = 0;
  let path = [], pathClock = 0, lookPointer = null, stickPointer = null;
  let stickOrigin = {x: 0, y: 0}, stick = {x: 0, y: 0}, lookPrev = {x: 0, y: 0};
  let running = false, runPointer = null, renderFrames = 0, exhausted = false;
  let dirtyFrames = 3, contextLost = false, accumulator = 0, hudClock = 0;
  let sightClock = 0, enemyHasSight = false, pathGoal = -1, stuckTime = 0;
  let modalDepth = 0, lastPauseAt = -Infinity;
  const staminaStep = { value: 100, exhausted: false, sprint: false };
  const invalidateScene = () => { dirtyFrames = Math.max(dirtyFrames, 2); };
  const keys = new Set();
  const player = new T.Vector3(18, 1.62, 32.7);
  const exitPos = new T.Vector3(18, 0, 35.05);
  const scene = new T.Scene();
  scene.background = new T.Color(0x070c0b);
  scene.fog = new T.FogExp2(0x0a1010, .043);
  const cameraFov = () => isTouch ? (innerWidth > innerHeight ? 68 : 74) : 62;
  const camera = new T.PerspectiveCamera(cameraFov(), innerWidth / innerHeight, .06, 70);
  camera.rotation.order = 'YXZ';
  let renderer;
  try {
    renderer = new T.WebGLRenderer({ antialias: !isTouch, powerPreference: 'high-performance', alpha: false });
  } catch (_) {
    $('loading-text').textContent = 'この端末ではWebGLを開始できません。Safari / Chromeの最新版でお試しください。';
    $('reload-button').classList.remove('hidden'); $('reload-button').onclick=()=>location.reload();
    return;
  }
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, isTouch ? 1.4 : 1.7));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  $('world').appendChild(renderer.domElement);
  const hemi = new T.HemisphereLight(0xa3b1a3, 0x252a24, .78);
  scene.add(hemi);
  const ambient = new T.AmbientLight(0x80918b, .22);
  scene.add(ambient);

  // Deterministic, low-resolution textures keep the aesthetic genuinely voxel-like.
  let seed = 881;
  const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  function texture(type) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const ctx = c.getContext('2d');
    if (type === 'wall') {
      ctx.fillStyle = '#596055'; ctx.fillRect(0, 0, 128, 128);
      for (let y = 0; y < 128; y += 4) for (let x = 0; x < 128; x += 4) {
        const b = 65 + Math.floor(rand() * 30); ctx.fillStyle = `rgb(${b},${b+6},${b-3})`; ctx.fillRect(x,y,4,4);
      }
      for (let i = 0; i < 30; i++) {
        const x = Math.floor(rand()*32)*4, y = Math.floor(rand()*20)*4;
        ctx.fillStyle = `rgba(16,24,18,${.1+rand()*.2})`; ctx.fillRect(x,y,4+Math.floor(rand()*3)*4,12+rand()*70);
      }
      ctx.fillStyle = '#31392f';ctx.fillRect(0,82,128,46);
      for(let x=0;x<128;x+=16){ctx.fillStyle='#495044';ctx.fillRect(x,85,2,43);ctx.fillStyle='#20291f';ctx.fillRect(x+14,85,2,43);}
      ctx.fillStyle='#626553';ctx.fillRect(0,80,128,3);
    } else if (type === 'floor') {
      ctx.fillStyle='#363a2f';ctx.fillRect(0,0,128,128);
      for(let y=0;y<128;y+=16){
        ctx.fillStyle=['#454537','#3c4032','#4a4a39','#383e32'][Math.floor(rand()*4)];ctx.fillRect(0,y,128,15);
        for(let i=0;i<28;i++){ctx.fillStyle=rand()>.5?'#555240':'#292f25';ctx.fillRect(rand()*128,y+rand()*14,4+rand()*30,1);}
        ctx.fillStyle='#22271f';ctx.fillRect((y%32===0?40:90),y,1,15);
      }
    } else {
      ctx.fillStyle='#332f25';ctx.fillRect(0,0,128,128);
      for(let i=0;i<250;i++){ctx.fillStyle=rand()>.5?'#4a4030':'#26271e';ctx.fillRect(Math.floor(rand()*32)*4,0,2,128);}
      ctx.strokeStyle='#171e18';ctx.lineWidth=3;ctx.strokeRect(10,9,47,110);ctx.strokeRect(68,9,47,110);
    }
    const tex = new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;tex.magFilter=T.NearestFilter;tex.minFilter=T.NearestMipmapNearestFilter;tex.wrapS=tex.wrapT=T.RepeatWrapping;
    return tex;
  }
  const wallMat = new T.MeshLambertMaterial({map:texture('wall')});
  const floorTex=texture('floor'); floorTex.repeat.set(24,24);
  const floorMat = new T.MeshStandardMaterial({map:floorTex,roughness:.86,metalness:.03});
  const woodMat = new T.MeshLambertMaterial({map:texture('wood')});
  const palette = {};
  function mat(color, emissive=0) {
    const key=color+':'+emissive;
    if(!palette[key]) palette[key]=new T.MeshLambertMaterial({color,emissive,emissiveIntensity: .8});
    return palette[key];
  }
  const boxGeo = new T.BoxGeometry(1,1,1);
  function box(w,h,d,x,y,z,material,parent=scene) {
    const mesh=new T.Mesh(boxGeo,typeof material==='number'?mat(material):material);
    mesh.scale.set(w,h,d);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
  }
  const batches = new Map();
  function block(w,h,d,x,y,z,color) {
    if(!batches.has(color))batches.set(color,[]);
    batches.get(color).push([w,h,d,x,y,z]);
  }
  const grid=Array.from({length:SIZE},()=>Array(SIZE).fill(1));
  function carve(x1,z1,x2,z2){for(let z=z1;z<=z2;z++)for(let x=x1;x<=x2;x++)grid[z][x]=0;}
  carve(8,1,10,17);
  for(const z of [1,7,13]){
    carve(1,z,6,z+4);carve(12,z,17,z+4);carve(6,z+2,12,z+2);
  }
  // Room partitions retain navigable loops and real doorways.
  for (const z of [5,11]) { grid[z][3]=1;grid[z][4]=1;grid[z][14]=1;grid[z][15]=1; }
  const wallTransforms=[];
  for(let z=0;z<SIZE;z++)for(let x=0;x<SIZE;x++)if(grid[z][x])wallTransforms.push([x*CELL,1.8,z*CELL]);
  const walls=new T.InstancedMesh(boxGeo,wallMat,wallTransforms.length);
  const dummy=new T.Object3D();
  wallTransforms.forEach((p,i)=>{dummy.position.set(...p);dummy.scale.set(CELL,3.6,CELL);dummy.updateMatrix();walls.setMatrixAt(i,dummy.matrix);});
  walls.receiveShadow=true;walls.castShadow=true;scene.add(walls);
  const floor=box(38,.2,38,18,-.13,18,floorMat);floor.castShadow=false;
  box(38,.18,38,18,3.68,18,0x252c27);
  // Corridor ceiling beams, dado rails, chipped supports and copper pipes.
  for(let z=2;z<35;z+=4){
    block(6.2,.22,.32,18,3.42,z,0x252c24);
    block(.18,3.3,.24,15.08,1.65,z,0x454c3d);block(.18,3.3,.24,20.92,1.65,z,0x454c3d);
    block(.27,.11,.4,15.12,2.42,z,0x74715a);block(.27,.11,.4,20.88,2.42,z,0x74715a);
  }
  block(.08,.1,34,15.18,3.11,18,0x624735);block(.11,.1,34,20.8,3.22,18,0x3d4941);
  const fixtureLights=[];
  for(let z=4;z<=32;z+=7){
    block(.25,.2,.4,20.78,2.63,z,0x252e26);
    block(.18,.32,.21,20.64,2.68,z,0xd6a77b);
    const l=new T.PointLight(0xe8b981,16,9,2);l.position.set(20.5,2.6,z);scene.add(l);fixtureLights.push(l);
  }
  const redLight=new T.PointLight(0xd42d1c,32,13,2);redLight.position.set(18,2.4,24);scene.add(redLight);
  block(1.05,.05,.27,18,3.48,23,0x74261b);
  box(.72,.05,.12,18,3.4,23,mat(0xce3a21,0xff260b));
  const farLight=new T.PointLight(0x7faba7,23,18,2);farLight.position.set(18,2.5,8);scene.add(farLight);
  box(2.4,3.2,.16,18,1.6,.93,woodMat);
  // The way out is visible from spawn, with three seals that disappear on collection.
  const exitDoor=box(2.2,3.18,.22,18,1.59,35.02,woodMat);
  block(.16,3.35,.27,16.82,1.68,35,0x4e4a36);block(.16,3.35,.27,19.18,1.68,35,0x4e4a36);block(2.52,.18,.3,18,3.32,35,0x55503c);
  box(.12,.12,.15,18.76,1.45,34.82,0xb9a56d);
  const exitSeals=[];
  for(let i=0;i<3;i++)exitSeals.push(box(.17,.58,.02,17.55+i*.45,1.9,34.89,0xbdad7f));
  const exitGlow=new T.PointLight(0xffc585,10,7,2);exitGlow.position.set(18,2.8,33.8);scene.add(exitGlow);
  function labelTexture(text,bg,fg){
    const c=document.createElement('canvas');c.width=128;c.height=256;const ctx=c.getContext('2d');ctx.fillStyle=bg;ctx.fillRect(0,0,128,256);ctx.fillStyle=fg;ctx.textAlign='center';ctx.font='bold 48px serif';[...text].forEach((s,i)=>ctx.fillText(s,64,66+i*58));const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;tex.magFilter=T.NearestFilter;return tex;
  }
  const exitLabel=new T.Mesh(new T.PlaneGeometry(.28,.56),new T.MeshBasicMaterial({map:labelTexture('出口','#233a2b','#a6b69a')}));exitLabel.position.set(18,3.08,34.88);exitLabel.rotation.y=Math.PI;scene.add(exitLabel);
  // Six furnished rooms: broken beds, cupboards, chairs, portraits, boarded windows.
  const roomCenters=[];
  for(const side of [0,1])for(const z of [3,9,15]){
    const x=side?15:3;roomCenters.push([x*2,z*2]);
    const wx=side?34.9:1.1;
    block(.2,2,2.5,wx,2,z*2-1,0x151e19);
    block(.22,.1,2.65,wx,2.98,z*2-1,0x5b6252);
    block(.22,.1,2.65,wx,1.02,z*2-1,0x5b6252);
    block(.24,1.96,.09,wx,2,z*2-1,0x5b6252);
    block(.26,.17,2.5,wx,1.45,z*2-1,0x665740);
    block(.26,.2,2.5,wx,2.45,z*2-1,0x554a36);
    const wl=new T.PointLight(0x789a99,7,10,2);wl.position.set(wx+(side?-1:1),2,z*2-1);scene.add(wl);
    const bx=x*2+(side?1.5:-1.5),bz=z*2+1;
    block(1.5,.22,2.7,bx,.48,bz,0x333b2c);block(1.42,.22,2.5,bx,.68,bz,0x777660);block(1.32,.09,1.8,bx,.84,bz+.25,0x535c4e);
    block(1.35,.17,.52,bx,.88,bz-.9,0x94907a);block(1.55,1.1,.15,bx,.7,bz-1.4,0x383a2a);
    for(const dx of [-.62,.62])for(const dz of [-1.15,1.15])block(.12,.6,.12,bx+dx,.3,bz+dz,0x2b3125);
    const tx=x*2+(side?-2:2),tz=z*2-2;
    block(1.3,.14,.8,tx,1.1,tz,0x65563d);
    for(const dx of [-.55,.55])for(const dz of [-.3,.3])block(.1,1.04,.1,tx+dx,.52,tz+dz,0x403b2c);
    block(.7,.12,.7,tx,.52,tz+1.15,0x544b34);block(.72,.85,.12,tx,1,tz+1.45,0x4e4834);
    for(const dx of [-.28,.28])for(const dz of [-.25,.25])block(.09,.5,.09,tx+dx,.25,tz+1.15+dz,0x353729);
    block(1.2,2.3,.65,x*2,1.15,z*2-3.95,0x333a2b);block(.53,2.12,.06,x*2-.29,1.15,z*2-3.59,0x4d4e38);block(.53,2.12,.06,x*2+.29,1.15,z*2-3.59,0x424735);
    // Ragged, pixel-shaped stains and scattered papers are batched into a few draws.
    for(let i=0;i<15;i++)block(.15+rand()*.35,.012,.18+rand()*.38,x*2+(rand()-.5)*5,.01,z*2+(rand()-.5)*5,rand()>.55?0x686853:0x292f25);
  }
  // Disturbing family photographs along the hallway.
  for(const z of [7,19,29]) {
    block(.08,.86,.64,15.05,2,z,0x806c45);block(.095,.72,.5,15.1,2,z,0x202820);
    block(.105,.24,.22,15.16,2.11,z,0x8b8c70);block(.105,.3,.3,15.16,1.85,z,0x4c5541);
    block(.11,.025,.04,15.18,2.14,z-.06,0x161c16);block(.11,.025,.04,15.18,2.14,z+.06,0x161c16);
  }
  // Debris, uneven planks and low-profile floor scratches do not obstruct collisions.
  for(let i=0;i<75;i++){
    const x=15.5+rand()*5,z=2+rand()*32;
    block(.07+rand()*.23,.014,.08+rand()*.65,x,.005,z,rand()>.7?0x6b6550:0x252c24);
  }
  batches.forEach((items,color)=>{
    const mesh=new T.InstancedMesh(boxGeo,mat(color),items.length);
    items.forEach((p,i)=>{dummy.scale.set(p[0],p[1],p[2]);dummy.position.set(p[3],p[4],p[5]);dummy.rotation.set(0,0,0);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});mesh.castShadow=true;mesh.receiveShadow=true;scene.add(mesh);
  });

  // A fully articulated voxel grandmother: articulated shoulders, elbows, hips,
  // segmented skirt, hair locks, jaw and independently shivering fingers.
  function createGrandmother(){
    const root=new T.Group();scene.add(root);
    const rig=new T.Group();root.add(rig);
    const dress=mat(0x666c57),dressDark=mat(0x444e3e),skin=mat(0xa29b7b),skinDark=mat(0x77785b),hair=mat(0x9c9d88);
    const torso=new T.Group();torso.position.y=1.35;rig.add(torso);
    box(.6,.68,.36,0,.25,0,dress,torso);box(.72,.2,.35,0,.51,0,dressDark,torso);
    box(.31,.12,.42,0,.54,.04,0x92917b,torso);
    // Uneven apron and stitching.
    box(.42,.6,.035,0,.03,.22,0x9a9881,torso);
    for(let i=0;i<7;i++)box(.04,.055,.045,(i%2?.11:-.11),.31-i*.083,.244,0x767b62,torso);
    const skirt=new T.Group();rig.add(skirt);
    const skirtPieces=[];
    for(let j=0;j<4;j++)for(let i=0;i<6;i++){
      const angle=i/6*Math.PI*2,r=.23+j*.055;
      const s=box(.23,.3,.26,Math.sin(angle)*r,1.29-j*.255,Math.cos(angle)*r,j%2?dressDark:dress,skirt);
      skirtPieces.push({mesh:s,base:s.position.clone(),phase:i});
    }
    const headPivot=new T.Group();headPivot.position.set(0,.65,.08);torso.add(headPivot);
    box(.19,.22,.22,0,.02,0,skinDark,headPivot);
    box(.48,.5,.43,0,.31,.04,skin,headPivot);
    box(.37,.13,.43,0,.08,.07,skinDark,headPivot);
    box(.54,.18,.45,0,.56,.01,hair,headPivot);
    box(.51,.43,.16,0,.32,-.18,hair,headPivot);
    box(.22,.25,.22,.07,.5,-.3,0x7b8370,headPivot);
    for(const s of [-1,1]){
      box(.1,.34,.3,s*.27,.37,0,hair,headPivot);
      box(.09,.12,.13,s*.29,.21,.09,skinDark,headPivot);
      box(.16,.12,.025,s*.133,.37,.265,0x202b23,headPivot);
      box(.052,.037,.03,s*.13,.372,.283,mat(0xdad4b4,0x66715a),headPivot);
      box(.18,.035,.04,s*.127,.45,.27,0x6b7156,headPivot);
      box(.16,.075,.036,s*.14,.22,.265,0x858568,headPivot);
      box(.035,.18,.03,s*.203,.27,.279,0x696c50,headPivot);
      for(let j=0;j<3;j++)box(.06,.15+rand()*.12,.06,s*(.23+rand()*.04),.05+j*.1,-.06,hair,headPivot);
    }
    box(.088,.2,.12,0,.29,.306,skinDark,headPivot);
    box(.13,.07,.06,0,.2,.35,skin,headPivot);
    const jaw=new T.Group();jaw.position.set(0,.13,.22);headPivot.add(jaw);
    box(.25,.12,.12,0,-.02,.02,0x777957,jaw);
    box(.19,.058,.025,0,.009,.087,0x201f17,jaw);
    for(let i=0;i<4;i++)box(.025,.025,.015,-.065+i*.045,.03,.107,0xbfb38e,jaw);
    const arms=[];
    for(const s of [-1,1]){
      const shoulder=new T.Group();shoulder.position.set(s*.42,.44,.01);torso.add(shoulder);
      box(.24,.47,.25,0,-.18,0,dressDark,shoulder);
      const elbow=new T.Group();elbow.position.y=-.41;shoulder.add(elbow);
      box(.14,.44,.16,0,-.2,0,skinDark,elbow);
      box(.17,.15,.13,0,-.46,.02,skin,elbow);
      for(let i=0;i<4;i++)box(.026,.16+(i%2)*.04,.038,-.065+i*.042,-.59,.035,skinDark,elbow);
      arms.push({shoulder,elbow});
    }
    const legs=[];
    for(const s of [-1,1]){
      const leg=new T.Group();leg.position.set(s*.2,.49,0);rig.add(leg);
      box(.14,.36,.17,0,-.15,0,skinDark,leg);box(.19,.12,.33,0,-.41,.075,0x30362b,leg);legs.push(leg);
    }
    const shadow=new T.Mesh(new T.PlaneGeometry(1.3,1.3),new T.MeshBasicMaterial({color:0x050904,transparent:true,opacity:.32,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.position.y=.01;root.add(shadow);
    return {root,rig,torso,headPivot,jaw,arms,legs,skirtPieces};
  }
  const granny=createGrandmother();
  granny.root.position.set(18.6,0,25.6);
  function animateGranny(time,speed,attack=0){
    const phase=time*(speed?5.4:1.35),sway=Math.sin(phase);
    granny.rig.position.y=speed?Math.abs(sway)*.055:Math.sin(time*1.6)*.018;
    granny.torso.rotation.set(.14+attack*.25,Math.sin(time*.8)*.04,Math.sin(phase)*.035);
    granny.headPivot.rotation.set(-.05+Math.sin(time*1.7)*.055-attack*.15,Math.sin(time*.73)*.15,Math.sin(time*1.9)*.075);
    granny.jaw.rotation.x=-.1-Math.max(0,Math.sin(time*2.4))*.12-attack*1.1;
    granny.arms.forEach((a,i)=>{const sign=i?1:-1;a.shoulder.rotation.x=-.16+Math.sin(phase+i*Math.PI)*.2*speed-attack*1.65;a.shoulder.rotation.z=sign*(.07+attack*.22);a.elbow.rotation.x=-.12-Math.max(0,Math.sin(phase+i*Math.PI))*.24-attack*.3;});
    granny.legs.forEach((l,i)=>l.rotation.x=Math.sin(phase+i*Math.PI)*.25*speed);
    granny.skirtPieces.forEach(o=>{o.mesh.position.x=o.base.x+Math.sin(phase+o.phase)*.016*speed;o.mesh.rotation.z=Math.sin(phase+o.phase)*.025*speed;});
  }
  // Warm torch with delayed orientation and physical bob; shadow enabled only here.
  const flashlight=new T.SpotLight(0xf2e2b9,65,25,Math.PI*.255,.68,1.6);
  flashlight.castShadow=true;flashlight.shadow.mapSize.set(1024,1024);flashlight.shadow.bias=-.0008;flashlight.shadow.normalBias=.04;
  flashlight.shadow.camera.near=.2;flashlight.shadow.camera.far=26;
  scene.add(flashlight);scene.add(flashlight.target);
  const fillLight=new T.PointLight(0xb5c5b1,2.5,4,1.8);scene.add(fillLight);
  const viewRig=new T.Group();camera.add(viewRig);scene.add(camera);
  box(.12,.14,.3,.31,-.32,-.47,0x202a23,viewRig);
  box(.13,.17,.16,.31,-.31,-.64,0x53594a,viewRig);
  box(.075,.1,.02,.31,-.31,-.729,mat(0xd4cfa5,0xc6b772),viewRig);
  box(.13,.12,.2,.31,-.41,-.4,0x82775b,viewRig);viewRig.visible=false;
  // Sparse dust catches the flashlight, using a single point-cloud draw.
  const dustGeo=new T.BufferGeometry(),dustCoords=new Float32Array(300*3);
  for(let i=0;i<300;i++){dustCoords[i*3]=14.8+rand()*6.4;dustCoords[i*3+1]=.2+rand()*3.1;dustCoords[i*3+2]=rand()*35;}
  dustGeo.setAttribute('position',new T.BufferAttribute(dustCoords,3));
  const dust=new T.Points(dustGeo,new T.PointsMaterial({color:0xbdbd9c,size:.018,transparent:true,opacity:.27,depthWrite:false}));scene.add(dust);
  const talismanTex=labelTexture('鎮魂符','#c8b878','#682d21');
  const items=[];
  for(const p of [[4,6],[30,6],[30,30]]){
    const group=new T.Group();group.position.set(p[0],1.25,p[1]);scene.add(group);
    const paper=new T.Mesh(new T.BoxGeometry(.28,.65,.028),new T.MeshLambertMaterial({map:talismanTex,emissive:0xb39240,emissiveIntensity:.5}));group.add(paper);
    const glow=new T.PointLight(0xfbd28b,7,5,2);glow.position.y=.2;group.add(glow);
    items.push({group,baseY:1.25,collected:false});
  }

  const navigation = new Core.Navigation(grid, CELL);
  // Keep articulated pivots, but instance rigid same-material voxel parts beneath them.
  const animatedMeshes = new Set(granny.skirtPieces.map(piece => piece.mesh));
  const groups = [];
  granny.root.traverse(object => { if (object.isGroup) groups.push(object); });
  let savedRigidDraws = 0;
  for (const group of groups) {
    const sets = new Map();
    for (const child of group.children) {
      if (!child.isMesh || child.geometry !== boxGeo || animatedMeshes.has(child)) continue;
      if (!sets.has(child.material)) sets.set(child.material, []);
      sets.get(child.material).push(child);
    }
    for (const [material, children] of sets) {
      if (children.length < 2) continue;
      const batch = new T.InstancedMesh(boxGeo, material, children.length);
      children.forEach((child, index) => { child.updateMatrix(); batch.setMatrixAt(index, child.matrix); group.remove(child); });
      batch.castShadow = batch.receiveShadow = true;
      batch.computeBoundingSphere();
      group.add(batch);
      savedRigidDraws += children.length - 1;
    }
  }
  // Static local transforms do not need matrix composition every frame.
  scene.traverse(object => {
    if (object.isMesh && !animatedMeshes.has(object)) { object.updateMatrix(); object.matrixAutoUpdate = false; }
  });
  const graphics = window.KuchiieGraphics ? new window.KuchiieGraphics({
    renderer, scene, camera, flashlight, floor, viewRig, isTouch, settings
  }) : null;
  let lastGraphicsReport = 0;
  let lowFpsSince = 0;

  // Procedurally synthesized ambient audio, footsteps and scare (never autoplay).
  let audioCtx=null,master=null,drone=null,noiseBuffer=null;
  function ensureAudio(){
    try {
    if(!audioCtx && soundOn){
      const AC=window.AudioContext||window.webkitAudioContext;if(!AC){soundOn=false;updateSound();return;}
      audioCtx=new AC();master=audioCtx.createGain();master.gain.value=0;master.connect(audioCtx.destination);
      noiseBuffer=audioCtx.createBuffer(1,audioCtx.sampleRate*2,audioCtx.sampleRate);
      const data=noiseBuffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
      const droneGain=audioCtx.createGain();droneGain.gain.value=.09;droneGain.connect(master);
      [43,57.2,86.4].forEach((f,i)=>{const osc=audioCtx.createOscillator();osc.type=i===1?'sine':'triangle';osc.frequency.value=f;osc.connect(droneGain);osc.start();});
      const n=audioCtx.createBufferSource();n.buffer=noiseBuffer;n.loop=true;const filter=audioCtx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=190;const ng=audioCtx.createGain();ng.gain.value=.16;n.connect(filter);filter.connect(ng);ng.connect(master);n.start();
    }
    if(audioCtx && audioCtx.state==='suspended' && soundOn && !document.hidden)audioCtx.resume().catch(()=>{});
    updateSound();
    } catch (error) {
      console.warn('[AUDIO] Audio is unavailable; game remains playable.', error.message);
      if (audioCtx) audioCtx.close().catch(() => {});
      audioCtx = master = noiseBuffer = null; soundOn = false; updateSound();
    }
  }
  function updateSound(){
    if(master)master.gain.setTargetAtTime(soundOn?settings.volume:0,audioCtx.currentTime,.15);
    if (audioCtx && !soundOn && audioCtx.state === 'running') audioCtx.suspend().catch(() => {});
    $('sound-label').textContent=soundOn?'SOUND ON':'SOUND OFF';
    $('sound-button').setAttribute('aria-label',soundOn?'サウンドをオフにする':'サウンドをオンにする');
    $('sound-button').querySelector('path').setAttribute('d',soundOn?'M11 5 6 9H3v6h3l5 4V5Zm5 3a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14':'M11 5 6 9H3v6h3l5 4V5Zm5 4 5 6m0-6-5 6');
  }
  function tone(freq,duration,gain=.2,type='sine',endFreq=0){
    if(!audioCtx||audioCtx.state!=='running'||!soundOn)return;const now=audioCtx.currentTime;
    const osc=audioCtx.createOscillator(),g=audioCtx.createGain();osc.type=type;osc.frequency.setValueAtTime(freq,now);if(endFreq)osc.frequency.exponentialRampToValueAtTime(endFreq,now+duration);
    g.gain.setValueAtTime(.001,now);g.gain.exponentialRampToValueAtTime(Math.max(.002,gain),now+.015);g.gain.exponentialRampToValueAtTime(.001,now+duration);osc.connect(g);g.connect(master);osc.onended=()=>{osc.disconnect();g.disconnect();};osc.start(now);osc.stop(now+duration+.05);
  }
  function noise(duration,gain,frequency,pan=0){
    if(!audioCtx||audioCtx.state!=='running'||!soundOn)return;
    const now=audioCtx.currentTime,n=audioCtx.createBufferSource();n.buffer=noiseBuffer;
    const filter=audioCtx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=frequency;
    const g=audioCtx.createGain();g.gain.setValueAtTime(gain,now);g.gain.exponentialRampToValueAtTime(.001,now+duration);
    n.connect(filter);filter.connect(g);
    let p = null;
    if(audioCtx.createStereoPanner){p=audioCtx.createStereoPanner();p.pan.value=Math.max(-1,Math.min(1,pan));g.connect(p);p.connect(master);}else g.connect(master);
    n.onended=()=>{n.disconnect();filter.disconnect();g.disconnect();if(p)p.disconnect();};
    n.start(now);n.stop(now+duration);
  }
  function footstep(enemy=false,distance=0){
    if(enemy){
      if (distance > 24) return;
      const v=Math.max(.01,.55-distance*.024);
      const pan=((granny.root.position.x-player.x)*Math.cos(yaw)-(granny.root.position.z-player.z)*Math.sin(yaw))/Math.max(.1,distance);
      noise(.22,v,350,pan*.85);tone(53,.3,v*.45,'triangle');
    }
    else{noise(.11,.2,510);tone(79,.13,.08,'sine');}
  }

  const moveEntity = (position, dx, dz, radius = .24) => navigation.move(position, dx, dz, radius);
  const findPath = (from, to) => navigation.findPath(from, to);
  const clearSight = (from, to) => navigation.clearSight(from, to);
  function refreshInteraction() {
    targetItem = null;
    let nearest = 1.65;
    for (const item of items) {
      if (item.collected) continue;
      const distance = Math.hypot(player.x - item.group.position.x, player.z - item.group.position.z);
      if (distance < nearest && clearSight(player, item.group.position)) { nearest = distance; targetItem = item; }
    }
    if (Math.hypot(player.x - exitPos.x, player.z - exitPos.z) < 1.8) targetItem = 'exit';
  }
  function updateHud() {
    refreshInteraction();
    const prompt = $('interaction-prompt');
    prompt.classList.toggle('hidden', !targetItem);
    if (targetItem) {
      const text = targetItem === 'exit' ? (collected === 3 ? '玄関から脱出する' : '封じられた玄関') : (isTouch ? '「調べる」で護符を取る' : '[ E ] 護符を取る');
      if (prompt.textContent !== text) prompt.textContent = text;
    }
    const border = targetItem ? '#e1c994' : '#c1c7a84d';
    if ($('interact-button').dataset.target !== border) { $('interact-button').style.borderColor = border; $('interact-button').dataset.target = border; }
    const width = `${Math.round(stamina)}%`;
    if ($('stamina-fill').style.width !== width) $('stamina-fill').style.width = width;
    $('stamina-fill').style.background = stamina < 25 ? '#b66044' : '#c2c6a7';
    const clock = formatTime(elapsed);
    if ($('elapsed-time').textContent !== clock) $('elapsed-time').textContent = clock;
    $('game-message').classList.toggle('visible', elapsed <= messageUntil);
    if (elapsed > 10) $('touch-look-hint').style.opacity = 0;
  }
  function showMessage(text,duration=4){$('game-message').textContent=text;$('game-message').classList.add('visible');messageUntil=elapsed+duration;}
  function releasePointer(element, id) {
    if (id !== null && element.hasPointerCapture && element.hasPointerCapture(id)) {
      try { element.releasePointerCapture(id); } catch (_) {}
    }
  }
  function resetInput() {
    const oldStick = stickPointer, oldRun = runPointer, oldLook = lookPointer;
    keys.clear(); running = false; stick.x = stick.y = 0;
    stickPointer = runPointer = lookPointer = null;
    releasePointer($('joystick-zone'), oldStick); releasePointer($('run-button'), oldRun);
    releasePointer(renderer.domElement, oldLook);
    $('joystick-knob').style.transform = ''; $('run-button').classList.remove('active');
  }
  function pointerLock(){if(!isTouch&&renderer.domElement.requestPointerLock){try{const p=renderer.domElement.requestPointerLock();if(p&&p.catch)p.catch(()=>{});}catch(_){}}}
  function unlock(){if(document.pointerLockElement)document.exitPointerLock();}
  function startGame(){
    if (contextLost) return;
    document.querySelectorAll('.modal-layer').forEach(m=>m.classList.add('hidden')); modalDepth = 0;
    $('end-screen').classList.add('hidden');$('landing').classList.add('hidden');$('game-hud').classList.remove('hidden');document.body.classList.add('playing');
    state='playing';elapsed=0;collected=0;stamina=100;chaseTime=0;walkPhase=0;pathClock=0;path=[];lastEnemyFoot=0;lastFoot=0;threat=0;resetInput();
    targetItem = null; exhausted = false; accumulator = 0; hudClock = 0;
    pathGoal = -1; sightClock = 0; stuckTime = 0; enemyHasSight = false; previousTime = performance.now();
    $('elapsed-time').textContent = '00:00'; $('stamina-fill').style.width = '100%';
    $('interaction-prompt').classList.add('hidden'); viewRig.position.set(0, 0, 0); invalidateScene();
    player.set(18,1.62,32.7);yaw=0;pitch=0;camera.position.copy(player);camera.rotation.set(0,0,0);
    granny.root.position.set(18,0,6);granny.root.rotation.set(0,0,0);
    items.forEach(i=>{i.collected=false;i.group.visible=true;});exitSeals.forEach(s=>s.visible=true);updateObjective();viewRig.visible=true;
    $('danger-vignette').style.opacity=0;$('flash').style.opacity=0;$('touch-look-hint').style.opacity=1;
    if(!soundPreferenceTouched)soundOn=true;
    ensureAudio();pointerLock();showMessage('3つの護符を集めて、この玄関へ戻れ。',6);updateHud();
  }
  function updateObjective(){
    $('key-count').textContent=`${collected} / 3`;
    for(let i=1;i<=3;i++)$('key-'+i).classList.toggle('collected',i<=collected);
    $('objective-text').textContent=collected===3?'玄関へ戻り、脱出する':'3つの護符を探す';
  }
  function interact(){
    if(state!=='playing')return;
    refreshInteraction(); // Never trust a stale target from the previous frame or previous run.
    if(targetItem&&targetItem!=='exit'&&!targetItem.collected){
      targetItem.collected=true;targetItem.group.visible=false;collected++;exitSeals[collected-1].visible=false;updateObjective();
      tone(440,.65,.12,'sine',660);tone(663,.9,.075,'sine',880);
      showMessage(collected===3?'封が解けた。最初の玄関へ、急げ。':`護符を手に入れた。残り ${3-collected} つ。`,4);targetItem=null;
    }else if(targetItem==='exit'){
      if(collected===3)endGame(true);else showMessage('扉は封じられている。3つの護符が必要だ。');
    }else showMessage('光る護符の近くで調べる。',2);
  }
  function pauseGame() {
    if (state !== 'playing') return;
    state = 'paused'; lastPauseAt = performance.now(); accumulator = 0;
    resetInput(); unlock(); openModal('pause-modal');
  }
  function resumeGame() {
    if (state !== 'paused' || contextLost) return;
    if (!$('settings-modal').classList.contains('hidden')) closeModal('settings-modal');
    state = 'playing'; closeModal('pause-modal'); resetInput();
    accumulator = 0; previousTime = performance.now(); invalidateScene(); ensureAudio(); pointerLock();
  }
  function goHome(){state='intro';modalDepth=0;targetItem=null;accumulator=0;invalidateScene();resetInput();unlock();viewRig.visible=false;document.querySelectorAll('.modal-layer').forEach(m=>m.classList.add('hidden'));$('end-screen').classList.add('hidden');$('game-hud').classList.add('hidden');$('landing').classList.remove('hidden');document.body.classList.remove('playing');$('danger-vignette').style.opacity=0;$('flash').style.opacity=0;items.forEach(i=>i.group.visible=true);exitSeals.forEach(s=>s.visible=true);granny.root.position.set(18.6,0,25.6);}
  function endGame(won){
    state=won?'escaped':'dead';invalidateScene();unlock();resetInput();viewRig.visible=false;$('game-hud').classList.add('hidden');$('danger-vignette').style.opacity=0;$('flash').style.opacity=0;
    $('end-screen').classList.remove('hidden');$('end-screen').classList.toggle('escaped',won);
    $('end-eyebrow').textContent=won?'YOU LEFT THE HOUSE. DID SHE?':'SHE FOUND YOU';$('end-title').textContent=won?'夜 が 明 け る。':'み つ け た。';
    $('end-description').textContent=won?'外に出た。それなのに、足音はまだ聞こえる。':'もう、どこにも行かせない。';
    $('end-stats').textContent=`${won?'脱出時間':'生存時間'} ${formatTime(elapsed)}  /  護符 ${collected} / 3`;
    if(won)tone(220,2,.1,'sine',330);
  }
  function catchPlayer(){
    if(state!=='playing')return;state='scare';deathTime=0;resetInput();unlock();viewRig.visible=false;$('game-hud').classList.add('hidden');
    if(settings.reduced){endGame(false);return;}
    noise(1.25,.55,2600);tone(70,1.4,.3,'sawtooth',24);tone(610,.8,.12,'triangle',95);
    if(navigator.vibrate)navigator.vibrate([100,40,150]);
  }
  const formatTime=t=>`${String(Math.floor(t/60)).padStart(2,'0')}:${String(Math.floor(t%60)).padStart(2,'0')}`;
  const lookVector=new T.Vector3(),desiredTorch=new T.Vector3(),scareDirection=new T.Vector3();
  function updatePlaying(dt,time){
    elapsed+=dt;chaseTime+=dt;
    let forward=(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0)-stick.y;
    let strafe=(keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0)+stick.x;
    if(keys.has('ArrowLeft'))yaw+=dt*1.7;if(keys.has('ArrowRight'))yaw-=dt*1.7;
    const len=Math.hypot(forward,strafe);if(len>1){forward/=len;strafe/=len;}
    const moving = len > .08;
    Core.stepStamina(staminaStep, stamina, exhausted, running || keys.has('ShiftLeft') || keys.has('ShiftRight'), moving, dt);
    stamina = staminaStep.value; exhausted = staminaStep.exhausted;
    const sprint = staminaStep.sprint, speed = sprint ? 4.15 : 2.55;
    if(moving){moveEntity(player,(-Math.sin(yaw)*forward+Math.cos(yaw)*strafe)*speed*dt,(-Math.cos(yaw)*forward-Math.sin(yaw)*strafe)*speed*dt);walkPhase+=dt*(sprint?12:8);if(elapsed-lastFoot>(sprint?.29:.48)){footstep();lastFoot=elapsed;}}
    camera.position.copy(player);
    if(!settings.reduced){camera.position.y+=moving?Math.sin(walkPhase)*.034:Math.sin(time*1.4)*.007;camera.rotation.z=moving?Math.sin(walkPhase*.5)*.009:0;}else camera.rotation.z=0;
    camera.rotation.y=yaw;camera.rotation.x=pitch;
    viewRig.position.set(Math.sin(walkPhase*.5)*(moving?.012:.002),Math.cos(walkPhase)*(moving?.012:.002),0);
    const distance=Math.hypot(granny.root.position.x-player.x, granny.root.position.z-player.z);
    pathClock -= dt; sightClock -= dt;
    if (sightClock <= 0) {
      enemyHasSight = navigation.clearSight(granny.root.position, player, .25);
      sightClock = .12;
    }
    if (!enemyHasSight && pathClock <= 0) {
      const goal = navigation.cellId(player);
      if (goal !== pathGoal || !path.length || stuckTime > .8) {
        path = findPath(granny.root.position, player); pathGoal = goal; stuckTime = 0;
      }
      pathClock = .3;
    }
    const target = enemyHasSight ? player : path[0];
    let enemyMoving=false;
    if(chaseTime>4&&target){
      const dx=target.x-granny.root.position.x,dz=target.z-granny.root.position.z,d=Math.hypot(dx,dz);
      if(d>.12){
        const s=(1.08+collected*.22+(distance<6?.26:0))*dt;
        enemyMoving = moveEntity(granny.root.position,dx/d*Math.min(s,d),dz/d*Math.min(s,d),.25);
        stuckTime = enemyMoving ? 0 : stuckTime + dt;
        const angle=Math.atan2(dx,dz);let diff=angle-granny.root.rotation.y;diff=Math.atan2(Math.sin(diff),Math.cos(diff));granny.root.rotation.y+=diff*Math.min(1,dt*5);
      }else if(path.length)path.shift();
    }
    animateGranny(time,enemyMoving?1:0,distance<2?.45:0);
    if(enemyMoving&&elapsed-lastEnemyFoot>.61){footstep(true,distance);lastEnemyFoot=elapsed;}
    if(distance<.92&&clearSight(granny.root.position,player)){catchPlayer();return;}
    threat=Math.max(0,1-distance/9);$('danger-vignette').style.opacity=settings.reduced?0:threat*(.2+Math.sin(time*7)*.045);
    if(threat>.35&&Math.floor(elapsed*1.55)!==Math.floor((elapsed-dt)*1.55))tone(45,.16,threat*.18,'sine');
    hudClock -= dt;
    if (hudClock <= 0) { updateHud(); hudClock = .08; }
  }
  function updateIntro(time){
    const portrait=innerWidth<innerHeight;
    camera.position.set(portrait?18.4:18.1,1.61+Math.sin(time*.4)*.015,portrait?31.8:32.1);
    camera.lookAt(portrait?18:16.2,1.55,24.7);camera.rotation.z=Math.sin(time*.22)*.002;
    granny.root.position.set(18.6+Math.sin(time*.4)*.045,0,25.6);granny.root.rotation.y=.02+Math.sin(time*.3)*.08;
    animateGranny(time,0,0);
  }
  function updateScare(dt,time){
    deathTime+=dt;
    const front=scareDirection.set(-Math.sin(yaw),0,-Math.cos(yaw));
    granny.root.position.copy(player).addScaledVector(front,1.05-Math.min(.25,deathTime*.35));granny.root.position.y=-.43;
    granny.root.rotation.y=yaw+Math.PI;
    camera.position.copy(player);camera.position.y=1.6;camera.lookAt(granny.root.position.x,1.65,granny.root.position.z);
    camera.rotation.z=Math.sin(deathTime*29)*.055;
    animateGranny(time,0,Math.min(1,deathTime*4));
    $('danger-vignette').style.opacity=.6;
    $('flash').style.opacity=deathTime<.12?.2*(1-deathTime/.12):0;
    if(deathTime>1.45)endGame(false);
  }
  function updateTorch(dt){
    camera.getWorldDirection(lookVector);flashlight.position.copy(camera.position);flashlight.position.y-=.13;
    desiredTorch.copy(camera.position).addScaledVector(lookVector,10);flashlight.target.position.lerp(desiredTorch,state==='scare'?1:Math.min(1,dt*14));
    fillLight.position.copy(camera.position);flashlight.intensity=state==='intro'?75:65;
  }
  let previousTime = performance.now(), simulationTime = 0, previouslyFrozen = false;
  const FIXED_STEP = 1 / 60;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.max(0, Math.min((now - previousTime) / 1000, .25));
    previousTime = now;
    if (document.hidden || contextLost) { accumulator = 0; return; }
    const frozen = state === 'paused' || state === 'dead' || state === 'escaped' || (state === 'intro' && modalDepth > 0);
    if (frozen !== previouslyFrozen) {
      if (graphics && graphics.enabled) graphics.resetTiming();
      lowFpsSince = 0; previouslyFrozen = frozen;
    }
    if (frozen) accumulator = 0;
    else if (state === 'playing') {
      // Separate simulation from rendering. At 10 FPS, move six 1/60 steps, not 0.05 seconds.
      accumulator = Math.min(accumulator + dt, .25);
      let steps = 0;
      while (accumulator >= FIXED_STEP && steps++ < 15 && state === 'playing') {
        simulationTime += FIXED_STEP;
        updatePlaying(FIXED_STEP, simulationTime);
        accumulator -= FIXED_STEP;
      }
    } else {
      simulationTime += dt;
      if (state === 'intro') updateIntro(simulationTime);
      else if (state === 'scare') updateScare(dt, simulationTime);
    }
    const time = simulationTime;
    if (!frozen) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.group.visible) { item.group.position.y = item.baseY + Math.sin(time * 1.8 + i) * .09; item.group.rotation.y = time * .5 + i; }
      }
      fixtureLights.forEach((light, i) => { light.intensity = settings.reduced ? 16 : 16 * (.94 + Math.sin(time * 2.1 + i) * .035 + (i === 2 && Math.sin(time * 3.73) > .98 ? -.34 : 0)); });
      dust.rotation.y = Math.sin(time * .035) * .006;
    }
    // Paused menus and result screens keep their last canvas frame. Quality/resize
    // invalidation still renders fresh frames, but an idle menu does no scene passes.
    if (!frozen || dirtyFrames > 0) {
      updateTorch(dt);
      try {
        if (graphics && graphics.enabled) graphics.render(time);
        else renderer.render(scene, camera);
        dirtyFrames = Math.max(0, dirtyFrames - 1);
      } catch (error) {
        if (!graphics || !graphics.enabled) throw error;
        console.warn('[XHIGH] Rendering interrupted; returning to high quality.', error.message);
        settings.quality = 'high'; applyQuality(); saveSettings();
        $('quality-guidance').textContent = 'XHIGHの描画を継続できなかったため、高画質に戻しました。';
      }
      renderFrames++;
      if (renderFrames === 3) {
        $('loading').style.opacity = 0;
        setTimeout(() => { if (!contextLost) $('loading').classList.add('hidden'); }, 750);
      }
    }
    if (graphics && graphics.enabled && now - lastGraphicsReport > 1000) {
      const stats = graphics.getStats();
      $('graphics-fps').textContent = frozen ? 'PAUSED' : stats.fps !== null ? `${stats.fps} FPS` : '計測中';
      $('graphics-resolution').textContent = `${stats.width} × ${stats.height} · ${stats.hdr ? 'HDR' : 'LDR'} · ${stats.msaa}× MSAA`;
      if (!frozen && stats.fps !== null && stats.fps < 18) { if (!lowFpsSince) lowFpsSince = now; }
      else lowFpsSince = 0;
      const slow = lowFpsSince > 0 && now - lowFpsSince > 5000;
      $('graphics-performance-note').classList.toggle('hidden', !slow);
      $('graphics-monitor').classList.toggle('performance-low', slow);
      document.body.dataset.graphicsFrames = String(stats.frames);
      window.dispatchEvent(new CustomEvent('kuchiie:graphics', { detail: { ...stats, paused: frozen } }));
      lastGraphicsReport = now;
    }
  }

  // Accessible UI and robust pointer cancellation handling.
  $('start-button').addEventListener('click',startGame);
  $('retry-button').addEventListener('click',startGame);
  $('home-button').addEventListener('click',goHome);$('end-home-button').addEventListener('click',goHome);
  $('pause-button').addEventListener('click',pauseGame);$('resume-button').addEventListener('click',resumeGame);
  const modalFocus = new Map();
  function openModal(id) {
    if (state === 'playing' && id !== 'pause-modal') pauseGame();
    if (!$(id).classList.contains('hidden')) return;
    modalFocus.set(id, document.activeElement);
    $(id).classList.remove('hidden'); modalDepth++;
    const focus = $(id).querySelector('button'); if (focus) focus.focus();
  }
  function closeModal(id) {
    if ($(id).classList.contains('hidden')) return;
    $(id).classList.add('hidden'); modalDepth = Math.max(0, modalDepth - 1);
    const focus = modalFocus.get(id); modalFocus.delete(id);
    if (focus && focus.isConnected && focus.getClientRects().length) focus.focus();
  }
  $('howto-button').addEventListener('click',()=>openModal('howto-modal'));
  $('settings-button').addEventListener('click',()=>openModal('settings-modal'));
  $('pause-settings-button').addEventListener('click',()=>openModal('settings-modal'));
  document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>closeModal(b.dataset.close)));
  document.querySelectorAll('.modal-layer').forEach(m=>m.addEventListener('click',e=>{if(e.target===m&&m.id!=='pause-modal')closeModal(m.id);}));
  $('sound-button').addEventListener('click',()=>{soundPreferenceTouched=true;soundOn=!soundOn;ensureAudio();updateSound();});
  function saveSettings(){try{localStorage.setItem('kuchiie-settings',JSON.stringify(settings));}catch(_) {}}
  function applyQuality() {
    if (contextLost) return;
    invalidateScene(); lastGraphicsReport = 0;
    let extreme = settings.quality === 'xhigh';
    if (extreme) {
      renderer.shadowMap.enabled = true;
      if (!graphics || !graphics.enable()) {
        settings.quality = 'high'; extreme = false;
        $('quality-guidance').textContent = 'この環境ではXHIGHを開始できません。WebGL 2対応ブラウザでお試しください。';
      }
    }
    if (!extreme) {
      if (graphics && graphics.enabled) graphics.disable();
      const high = settings.quality === 'high';
      renderer.setPixelRatio(Math.min(devicePixelRatio, high ? (isTouch ? 1.4 : 1.7) : .85));
      renderer.shadowMap.enabled = high;
    }
    dust.visible = settings.quality === 'high';
    $('quality-select').value = settings.quality;
    document.body.dataset.graphics = settings.quality;
    $('graphics-monitor').classList.toggle('hidden', !extreme);
    $('xhigh-panel').classList.toggle('hidden', !extreme);
    $('xhigh-consent').classList.add('hidden');
    if (extreme) {
      $('xhigh-tag').textContent = 'ACTIVE';
      $('xhigh-status').textContent = '最高品質で描画中。プレイ中の実測FPSを確認できます。停止中の再描画は省略します。' + (graphics.hdr ? '' : ' この端末ではHDR非対応のためLDRで描画します。');
    }
    lowFpsSince = 0;
    $('graphics-performance-note').classList.add('hidden');
    $('graphics-monitor').classList.remove('performance-low');
  }
  $('quality-select').value=settings.quality;$('sensitivity-input').value=settings.sensitivity;$('volume-input').value=settings.volume;$('reduce-effects').checked=settings.reduced;applyQuality();
  if (restoreXhigh) $('quality-guidance').textContent = '前回はXHIGHでした。安全のため高画質で起動しています。XHIGHを再選択すると有効化できます。';
  $('quality-select').addEventListener('change', e => {
    if (e.target.value === 'xhigh' && settings.quality !== 'xhigh') {
      e.target.value = settings.quality;
      $('xhigh-panel').classList.remove('hidden');
      $('xhigh-consent').classList.remove('hidden');
      $('xhigh-tag').textContent = 'EXTREME';
      $('xhigh-status').textContent = '描画品質を優先し、FPSは制限しません。解像度・影はGPUの対応範囲内に制限されます。';
      $('xhigh-confirm').focus();
      return;
    }
    settings.quality = e.target.value; applyQuality(); saveSettings();
  });
  $('xhigh-confirm').addEventListener('click', () => {
    settings.quality = 'xhigh'; applyQuality(); saveSettings();
    $('quality-select').focus();
  });
  $('xhigh-cancel').addEventListener('click', () => {
    $('xhigh-panel').classList.add('hidden'); $('quality-select').focus();
  });
  $('graphics-recover').addEventListener('click', () => {
    settings.quality = 'high'; applyQuality(); saveSettings();
  });
  let settingsTimer = 0;
  const deferSettingsSave = () => { clearTimeout(settingsTimer); settingsTimer = setTimeout(saveSettings, 200); };
  $('sensitivity-input').addEventListener('input',e=>{settings.sensitivity=Number(e.target.value);deferSettingsSave();});
  $('volume-input').addEventListener('input',e=>{settings.volume=Number(e.target.value);soundPreferenceTouched=true;soundOn=settings.volume>0;ensureAudio();deferSettingsSave();});
  $('sensitivity-input').addEventListener('change', saveSettings);
  $('volume-input').addEventListener('change', saveSettings);
  $('reduce-effects').addEventListener('change',e=>{settings.reduced=e.target.checked;saveSettings();invalidateScene();});
  document.addEventListener('keydown',e=>{
    if(e.code==='Tab'){
      const modals=[...document.querySelectorAll('.modal-layer:not(.hidden)')];const modal=!$('settings-modal').classList.contains('hidden')?$('settings-modal'):modals[modals.length-1];
      if(modal){const all=[...modal.querySelectorAll('button,input,select')].filter(el=>el.getClientRects().length>0);const first=all[0],last=all[all.length-1];if(e.shiftKey&&document.activeElement===first){last.focus();e.preventDefault();}else if(!e.shiftKey&&document.activeElement===last){first.focus();e.preventDefault();}}
    }
    if(e.code==='Escape'){
      if(!$('settings-modal').classList.contains('hidden'))closeModal('settings-modal');
      else if(!$('howto-modal').classList.contains('hidden'))closeModal('howto-modal');
      else if(state==='playing')pauseGame();else if(state==='paused' && !e.repeat && performance.now()-lastPauseAt>250)resumeGame();
      e.preventDefault(); return;
    }
    if (e.code === 'KeyG' && settings.quality === 'xhigh' && !e.repeat) { settings.quality = 'high'; applyQuality(); saveSettings(); return; }
    if(state!=='playing')return;
    if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();
    keys.add(e.code);if(e.code==='KeyE'&&!e.repeat)interact();
  });
  document.addEventListener('keyup',e=>keys.delete(e.code));
  document.addEventListener('pointerlockchange',()=>{if(!document.pointerLockElement&&state==='playing')pauseGame();});
  document.addEventListener('mousemove',e=>{if(state==='playing'&&document.pointerLockElement){yaw-=e.movementX*.0022*settings.sensitivity;pitch=Math.max(-1.25,Math.min(1.25,pitch-e.movementY*.0022*settings.sensitivity));}});
  renderer.domElement.addEventListener('click',()=>{if(state==='playing'&&!isTouch&&!document.pointerLockElement)pointerLock();});
  document.addEventListener('pointerdown',e=>{
    if(state!=='playing'||lookPointer!==null||e.target.closest('button, input, select, #joystick-zone'))return;
    if(document.pointerLockElement)return;
    if(isTouch&&e.clientX<innerWidth*.35)return;
    lookPointer=e.pointerId;lookPrev={x:e.clientX,y:e.clientY};
    try { renderer.domElement.setPointerCapture(e.pointerId); } catch (_) {}
  });
  document.addEventListener('pointermove',e=>{
    if(state!=='playing'||e.pointerId!==lookPointer)return;
    yaw-=(e.clientX-lookPrev.x)*.004*settings.sensitivity;pitch=Math.max(-1.25,Math.min(1.25,pitch-(e.clientY-lookPrev.y)*.004*settings.sensitivity));lookPrev={x:e.clientX,y:e.clientY};
  });
  function endPointer(e) {
    if (e.pointerId === lookPointer) lookPointer = null;
    if (e.pointerId === stickPointer) { stickPointer = null; stick.x = stick.y = 0; $('joystick-knob').style.transform = ''; }
    if (e.pointerId === runPointer) { runPointer = null; running = false; $('run-button').classList.remove('active'); }
  }
  document.addEventListener('pointerup',endPointer);document.addEventListener('pointercancel',endPointer);
  const joystick=$('joystick-zone');
  joystick.addEventListener('pointerdown',e=>{if(state!=='playing'||stickPointer!==null)return;e.preventDefault();e.stopPropagation();stickPointer=e.pointerId;stickOrigin={x:e.clientX,y:e.clientY};try{joystick.setPointerCapture(e.pointerId);}catch(_){}});
  joystick.addEventListener('pointermove',e=>{if(e.pointerId!==stickPointer)return;const dx=e.clientX-stickOrigin.x,dy=e.clientY-stickOrigin.y,len=Math.hypot(dx,dy),factor=len>43?43/len:1;stick={x:dx*factor/43,y:dy*factor/43};$('joystick-knob').style.transform=`translate(${dx*factor}px,${dy*factor}px)`;});
  $('run-button').addEventListener('pointerdown', e => {
    if (state !== 'playing' || runPointer !== null) return;
    e.preventDefault(); runPointer = e.pointerId; running = true;
    $('run-button').classList.add('active');
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
  });
  for (const element of [joystick, $('run-button'), renderer.domElement]) element.addEventListener('lostpointercapture', endPointer);
  renderer.domElement.addEventListener('contextmenu', e => { if (state === 'playing') e.preventDefault(); });
  $('interact-button').addEventListener('click',interact);
  window.addEventListener('blur',()=>{resetInput();if(state==='playing')pauseGame();});
  document.addEventListener('visibilitychange', () => {
    previousTime = performance.now(); accumulator = 0;
    if (document.hidden) { if (state === 'playing') pauseGame(); if (audioCtx) audioCtx.suspend().catch(() => {}); }
    else { invalidateScene(); if (audioCtx && soundOn) audioCtx.resume().catch(() => {}); }
  });
  let viewportWidth = innerWidth, viewportHeight = innerHeight;
  window.addEventListener('resize', () => {
    if (contextLost) return;
    const changed = viewportWidth !== innerWidth || viewportHeight !== innerHeight;
    viewportWidth = innerWidth; viewportHeight = innerHeight;
    camera.aspect = innerWidth / Math.max(1, innerHeight); camera.fov = cameraFov(); camera.updateProjectionMatrix();
    if (changed) renderer.setSize(innerWidth, innerHeight);
    if (graphics && graphics.enabled) graphics.resize();
    invalidateScene(); resetInput();
  });
  renderer.domElement.addEventListener('webglcontextlost', e => {
    e.preventDefault(); contextLost = true; settings.quality = 'high'; saveSettings();
    resetInput(); if (state === 'playing') pauseGame();
    if (audioCtx) audioCtx.suspend().catch(() => {});
    $('loading').classList.remove('hidden'); $('loading').style.opacity = 1;
    $('loading-text').textContent = '描画が中断されました。高画質に戻して再読み込みしてください。';
    $('reload-button').classList.remove('hidden');
  });
  $('reload-button').addEventListener('click', () => location.reload());
  window.addEventListener('pagehide', () => { saveSettings(); resetInput(); if (audioCtx) audioCtx.suspend().catch(() => {}); });
  // Read-only diagnostics: snapshots, not references to live game objects or mutators.
  window.KuchiieDiagnostics = Object.freeze({
    snapshot() {
      return {
        state, elapsed, stamina, exhausted, collected, yaw, pitch,
        player: { x: player.x, z: player.z },
        enemy: { x: granny.root.position.x, z: granny.root.position.z },
        input: { stickX: stick.x, stickY: stick.y, lookPointer, stickPointer, runPointer, running, keyCount: keys.size },
        renderFrames, contextLost, navigationSearches: navigation.searches,
        savedRigidDraws, modalDepth, quality: settings.quality,
        graphics: graphics && graphics.enabled ? graphics.getStats() : null,
        gpu: { textures: renderer.info.memory.textures, geometries: renderer.info.memory.geometries, programs: renderer.info.programs.length },
        settings: { ...settings }
      };
    }
  });
  // Browser-verifiable invariants; no mutable game internals are exposed.
  const routes=items.every(i=>findPath(player,i.group.position).length>0)&&findPath(granny.root.position,player).length>0;
  console.info('[KUCHIIE] WebGL ready. Rooms: 6, talismans: 3. All routes reachable:',routes);
  if(!routes)console.error('[KUCHIIE] Navigation invariant failed.');
  updateIntro(0);updateTorch(1);requestAnimationFrame(frame);
})();
