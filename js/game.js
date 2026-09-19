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
  const CELL = 2;
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
  const visitedAreas = new Set(['main']);
  const staminaStep = { value: 100, exhausted: false, sprint: false };
  const invalidateScene = () => { dirtyFrames = Math.max(dirtyFrames, 2); };
  const keys = new Set();
  const house = Core.createHouse();
  const navigation = new Core.HouseNavigation(house);
  const player = new T.Vector3(18, 1.62, 32.7);
  player.floor = 0; player.eyeHeight = 1.62;
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
      // Faded wallpaper motifs, torn plaster and stepped hairline cracks.
      for (let y = 8; y < 78; y += 18) for (let x = 5; x < 128; x += 16) {
        ctx.fillStyle = '#737564'; ctx.fillRect(x, y, 2, 7); ctx.fillRect(x - 2, y + 2, 6, 2);
      }
      for (let i = 0; i < 9; i++) {
        let x = Math.floor(rand() * 60) * 2, y = Math.floor(rand() * 30) * 2;
        ctx.fillStyle = '#888571'; ctx.fillRect(x, y, 6 + Math.floor(rand() * 5) * 2, 4 + rand() * 9);
        for (let j = 0; j < 7; j++) {
          ctx.fillStyle = '#303c32'; ctx.fillRect(x, y, 2, 4);
          x += rand() > .5 ? 2 : -2; y += 3;
        }
      }
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
  // Separate linear height maps from sRGB albedo; pixel edges remain deliberate.
  function reliefMap(albedo) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const ctx = c.getContext('2d'); ctx.drawImage(albedo.image, 0, 0);
    const image = ctx.getImageData(0, 0, 128, 128);
    for (let i = 0; i < image.data.length; i += 4) {
      const value = Math.round(image.data[i] * .3 + image.data[i + 1] * .6 + image.data[i + 2] * .1);
      image.data[i] = image.data[i + 1] = image.data[i + 2] = value;
    }
    ctx.putImageData(image, 0, 0);
    const map = new T.CanvasTexture(c);
    map.wrapS = map.wrapT = T.RepeatWrapping;
    map.magFilter = T.NearestFilter;
    map.repeat.copy(albedo.repeat);
    return map;
  }
  const wallTex = texture('wall'), woodTex = texture('wood');
  const wallMat = new T.MeshStandardMaterial({map:wallTex,bumpMap:reliefMap(wallTex),bumpScale:.055,roughness:.94});
  const floorTex=texture('floor'); floorTex.repeat.set(24,24);
  const floorMat = new T.MeshStandardMaterial({map:floorTex,bumpMap:reliefMap(floorTex),bumpScale:.038,roughness:.68,metalness:.025});
  const woodMat = new T.MeshStandardMaterial({map:woodTex,bumpMap:reliefMap(woodTex),bumpScale:.045,roughness:.79});
  for (const material of [wallMat, floorMat, woodMat]) {
    material.map.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  }
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
  const wallTransforms=[];
  const stairOpening = (x,z) => z === house.stairs.z && x >= house.stairs.first && x <= house.stairs.landing;
  house.floors.forEach((grid,level)=>{
    for(let z=0;z<house.height;z++)for(let x=level?18:0;x<house.width;x++) {
      // The upper navigation mask closes the stair void, but must not fill it with geometry.
      if(grid[z][x] && !(level === 1 && stairOpening(x,z))) wallTransforms.push([x*CELL,1.8+level*house.floorHeight,z*CELL]);
    }
  });
  const walls=new T.InstancedMesh(boxGeo,wallMat,wallTransforms.length);
  const dummy=new T.Object3D();
  wallTransforms.forEach((p,i)=>{dummy.position.set(...p);dummy.scale.set(CELL,3.6,CELL);dummy.updateMatrix();walls.setMatrixAt(i,dummy.matrix);});
  walls.receiveShadow=true;walls.castShadow=true;scene.add(walls);
  const floor=box(38,.2,38,18,-.13,18,floorMat);floor.castShadow=false;
  box(38,.18,38,18,3.68,18,0x252c27);
  box(36,.2,38,55,-.13,18,floorMat).castShadow=false;
  // Individual slabs leave a real opening overhead throughout the stair flight.
  for(let z=0;z<house.height;z++)for(let x=19;x<house.width;x++) {
    if(stairOpening(x,z) && x < house.stairs.landing) continue;
    block(CELL,.18,CELL,x*CELL,3.68,z*CELL,0x252c27);
    block(CELL,.2,CELL,x*CELL,house.floorHeight-.1,z*CELL,0x454537);
  }
  box(38,.18,38,54,house.floorHeight+3.68,18,0x252c27);
  for(let step=0;step<house.stairs.steps;step++) {
    const depth=(house.stairs.endX-house.stairs.startX)/house.stairs.steps;
    const h=(step+1)*house.floorHeight/house.stairs.steps;
    const x=house.stairs.startX+(step+.5)*depth;
    block(depth,h,1.96,x,h/2,32,0x544b34);
    block(.07,.025,1.9,x-depth/2+.04,h+.01,32,0x9a8760);
    if(step%3===0)for(const z of [31.08,32.92]) {
      block(.055,.84,.055,x,h+.42,z,0x383a2a);
      block(depth*3,.075,.075,x+depth,h+.84,z,0x806c45);
    }
  }
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
    // Only the bedroom keeps a bed; other rooms now have their own furnishings.
    if(!side && z===15){
      block(1.5,.22,2.7,bx,.48,bz,0x333b2c);block(1.42,.22,2.5,bx,.68,bz,0x777660);block(1.32,.09,1.8,bx,.84,bz+.25,0x535c4e);
      block(1.35,.17,.52,bx,.88,bz-.9,0x94907a);block(1.55,1.1,.15,bx,.7,bz-1.4,0x383a2a);
      for(const dx of [-.62,.62])for(const dz of [-1.15,1.15])block(.12,.6,.12,bx+dx,.3,bz+dz,0x2b3125);
    }
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
  // Environmental storytelling uses the existing voxel batches, not extra draw calls per prop.
  const roomNames = ['仏間', '書斎', '寝室', '台所', '浴室', '人形'];
  const decor = { rooms: roomNames.length, candles: [], lanterns: [], rain: [], webs: 0 };
  const flameMaterial = new T.MeshBasicMaterial({color: 0xffca72});
  function candle(x, y, z) {
    block(.16,.035,.16,x,y,z,0x806c45);
    block(.065,.24,.065,x,y+.13,z,0xbdad7f);
    const flame = new T.Group(); flame.position.set(x,y+.3,z); scene.add(flame);
    box(.045,.09,.045,0,0,0,flameMaterial,flame).castShadow=false;
    decor.candles.push(flame);
  }
  // A worn runner leads back to the exit, with missing threads rather than a smooth texture.
  for (let z=2;z<35;z+=.5) {
    block(1.3,.009,.48,18,-.019,z,0x492e29);
    for (const x of [17.3,18.7]) block(.08,.012,.36,x,-.014,z,0x806c45);
    if (Math.round(z*2)%4===0) block(.22,.01,.12,18,-.009,z,0x777660);
  }
  roomCenters.forEach(([x,z],index)=>{
    const side=x>18, wallX=side?34.72:1.28;
    // Door jambs sit outside the two-metre-wide walkable openings.
    const doorX=side?23:13;
    for(const dz of [-1.04,1.04]) block(.3,3.2,.12,doorX,1.6,z+dz,0x383a2a);
    block(.3,.2,2.2,doorX,3.16,z,0x65563d);
    const sign = new T.Mesh(new T.PlaneGeometry(.32,.68),new T.MeshLambertMaterial({map:labelTexture(roomNames[index],'#333a2b','#c8b878')}));
    sign.position.set(side?20.975:15.025,2.35,z+1.6);sign.rotation.y=side?-Math.PI/2:Math.PI/2;scene.add(sign);
    // Pale glass slivers and torn curtain folds remain readable on low graphics.
    for(let k=0;k<8;k++) {
      const zz=z-2.15+k*.33;
      block(.018,1.65,.24,wallX,2,zz,k%2?0x354c4b:0x405957);
    }
    for(const edge of [-1,1]) for(let k=0;k<3;k++)
      block(.08,1.6-k*.17,.12,wallX+(side?-.12:.12),2.13+k*.06,z-1+edge*(1.04-k*.13),k%2?0x777660:0x535c4e);
    const tx=x+(side?-2:2),tz=z-2;
    candle(tx+.42,1.19,tz);
    // Stacks of books, ink and folded letters on each existing desk.
    for(let k=0;k<3;k++) block(.34,.065,.24,tx-.3,1.2+k*.065,tz,k%2?0x492e29:0x535c4e);
    block(.09,.13,.09,tx,1.25,tz,0x151e19);
    if(index===0){ // Buddhist altar, memorial tablets and tatami edging.
      block(2.2,.28,.9,x, .2,z-2.1,0x383a2a);
      block(1.8,1.6,.55,x,1.12,z-2.3,0x252c24);
      block(1.45,1.3,.08,x,1.2,z-1.98,0x806c45);
      for(const dx of [-.45,0,.45]) {block(.23,.6,.12,x+dx,1.05,z-1.88,0x151e19);block(.04,.36,.02,x+dx,1.09,z-1.81,0xbdad7f);}
      candle(x-.8,.36,z-1.85);candle(x+.8,.36,z-1.85);
      for(let k=0;k<3;k++){block(1.4,.025,2.7,x-1.5+k*1.5,.002,z+2.1,0x686853);block(.07,.03,2.7,x-2.18+k*1.5,.015,z+2.1,0x333b2c);}
    }else if(index===1){ // Archive with irregular books and tied document boxes.
      for(const dx of [-2,2]){
        block(1.6,2.8,.5,x+dx,1.4,z-3.5,0x383a2a);
        for(let shelf=0;shelf<4;shelf++){
          block(1.65,.08,.65,x+dx,.3+shelf*.65,z-3.35,0x65563d);
          for(let k=0;k<8;k++)block(.12,.28+rand()*.23,.26,x+dx-.65+k*.18,.59+shelf*.65,z-3.02,[0x492e29,0x535c4e,0x806c45][k%3]);
        }
      }
    }else if(index===2){ // Old bedroom with a patched quilt and a travelling trunk.
      block(1.35,.65,.75,x+2,.35,z+3,0x403b2c);
      for(const dx of [-.43,.43])block(.07,.67,.77,x+2+dx,.36,z+3,0x806c45);
      for(let k=0;k<5;k++)block(.19,.025,1.6,x-2.04+k*.24,.9,z+1.2,k%2?0x492e29:0x777660);
      for(const dx of [-.3,.3])block(.22,.12,.43,x+dx,.07,z+3.2,0x333b2c);
    }else if(index===3){ // Kitchen: iron stove, tiled backsplash, pot and crockery.
      block(2.3,1.05,.85,x+2, .525,z-2.6,0x535c4e);
      block(2.4,.09,.95,x+2,1.09,z-2.6,0x777660);
      for(let k=0;k<5;k++)for(let row=0;row<3;row++)block(.42,.3,.05,x+1.05+k*.47,1.36+row*.33,z-2.99,0x94907a);
      block(.65,.35,.55,x+1.6,1.29,z-2.6,0x252c24);block(.73,.06,.62,x+1.6,1.49,z-2.6,0x65563d);
      block(.14,.08,.13,x+1.6,1.56,z-2.6,0x151e19);
      for(let k=0;k<3;k++)block(.28,.07,.28,x+2.5,1.17+k*.075,z-2.6,0xbdad7f);
    }else if(index===4){ // Bath: rimmed wooden tub, still dark water and tile floor.
      const bx=x+2,bz=z+1;
      for(const dx of [-.83,.83])block(.15,.85,2.4,bx+dx,.43,bz,0x65563d);
      for(const dz of [-1.13,1.13])block(1.8,.85,.15,bx,.43,bz+dz,0x65563d);
      block(1.6,.05,2.1,bx,.63,bz,0x202820);
      for(let a=0;a<5;a++)for(let b=0;b<6;b++)block(.6,.016,.6,x+.65+a*.65,-.004,z-1+b*.65,(a+b)%2?0x535c4e:0x777660);
      block(.65,.36,.55,x-1,.18,z+2.5,0x686853);
    }else{ // Nursery: dolls on a shelf, toy cubes and a broken miniature house.
      block(2.8,.14,.65,x,1.12,z-2.55,0x65563d);
      for(const dx of [-.85,0,.85]){
        block(.32,.38,.24,x+dx,1.37,z-2.55,0x492e29);
        block(.25,.26,.25,x+dx,1.68,z-2.55,0xbdad7f);
        block(.28,.09,.27,x+dx,1.83,z-2.57,0x151e19);
        for(const eye of [-.065,.065])block(.035,.04,.025,x+dx+eye,1.7,z-2.412,0x151e19);
      }
      for(let k=0;k<9;k++)block(.18,.18,.18,x-1+rand()*2,.09,z+2+rand(),k%2?0x806c45:0x492e29);
      block(.9,.65,.55,x+2,.33,z+3,0x777660);block(1.05,.13,.7,x+2,.73,z+3,0x492e29);
    }
  });
  // New east-wing rooms keep the same instanced, procedural voxel style.
  const annexNames = ['納戸','食堂','階段室','客間','洗面','物置','資料室','裁縫','階段廊','子供','寝所','奥座敷'];
  for(const level of [0,1]) {
    const base=level*house.floorHeight;
    for(const side of [0,1])for(const [row,z] of [6,18,30].entries()) {
      const x=side?66:42, index=level*6+side*3+row;
      const name=annexNames[index];
      // Desks, bookshelves, stacked trunks and patterned tatami distinguish each room.
      block(1.7,.15,.85,x,base+1.05,z-2.5,0x65563d);
      for(const dx of [-.7,.7])for(const dz of [-.3,.3])block(.12,1,.12,x+dx,base+.5,z-2.5+dz,0x383a2a);
      for(let k=0;k<4;k++)block(.33,.07,.3,x-.45,base+1.16+k*.07,z-2.5,k%2?0x492e29:0x777660);
      block(1.6,2.6,.5,x+2,base+1.3,z-3.55,0x333a2b);
      for(let shelf=0;shelf<4;shelf++) {
        block(1.65,.08,.6,x+2,base+.3+shelf*.6,z-3.45,0x65563d);
        for(let k=0;k<6;k++)block(.16,.29+(k%3)*.05,.3,x+1.4+k*.22,base+.48+shelf*.6,z-3.15,[0x535c4e,0x806c45,0x492e29][(k+index)%3]);
      }
      if(!(side===0 && row===2)) {
        block(1.4,.55,.8,x-2,base+.28,z+2,0x403b2c);
        for(const dx of [-.45,.45])block(.08,.57,.82,x-2+dx,base+.29,z+2,0x806c45);
        for(let k=0;k<3;k++)block(1.15,.025,2.6,x-1.2+k*1.2,base+.01,z,level?0x686853:0x535c4e);
      }
      if(index===1) { // Abandoned dining table with mismatched place settings.
        block(2.6,.14,1.4,x,base+.78,z+1.5,0x65563d);
        for(const dx of [-1.1,1.1])for(const dz of [-.5,.5])block(.12,.75,.12,x+dx,base+.38,z+1.5+dz,0x383a2a);
        for(const dx of [-.8,.8])for(const dz of [-.4,.4]) {
          block(.3,.045,.3,x+dx,base+.88,z+1.5+dz,0xbdad7f);
          block(.06,.12,.06,x+dx+.23,base+.92,z+1.5+dz,0x777660);
        }
      } else if(index===7) { // Sewing machine, thread spools and an unfinished red garment.
        block(.75,.08,.38,x+.25,base+1.18,z-2.5,0x202820);
        block(.16,.48,.27,x+.49,base+1.43,z-2.5,0x252c24);
        block(.64,.15,.27,x+.22,base+1.6,z-2.5,0x252c24);
        block(.025,.22,.025,x-.05,base+1.43,z-2.5,0xa39368);
        for(let k=0;k<4;k++)block(.13,.16,.13,x-.7+k*.17,base+1.24,z-2.75,k%2?0x492e29:0xbdad7f);
        block(.7,.035,.5,x+.5,base+1.16,z-2.05,0x74261b);
      } else if(index===9) { // Dolls suspended high above the nursery, outside the walking route.
        for(const dx of [-.8,0,.8]) {
          block(.02,.8,.02,x+dx,base+2.96,z+2,0x806c45);
          block(.24,.3,.18,x+dx,base+2.15,z+2,0x492e29);
          block(.2,.2,.2,x+dx,base+2.42,z+2,0xbdad7f);
          for(const eye of [-.05,.05])block(.03,.03,.015,x+dx+eye,base+2.44,z+2.105,0x151e19);
        }
      } else if(index===10) { // Empty sleeping place, patched quilt, folded pillow.
        block(1.8,.12,2.7,x,base+.1,z+1.2,0x777660);
        block(1.65,.14,1.9,x,base+.23,z+1.5,0x492e29);
        block(.8,.18,.42,x,base+.24,z+.12,0xbdad7f);
        for(let k=0;k<6;k++)block(.045,.018,1.8,x-.7+k*.28,base+.31,z+1.5,0x806c45);
      } else if(index===11) { // The inner sanctum: a sealed alcove and an empty memorial portrait.
        block(3.4,.26,1.1,x,base+.15,z+3.2,0x383a2a);
        block(2.7,2.5,.16,x,base+1.55,z+3.6,0x806c45);
        block(2.45,2.26,.08,x,base+1.55,z+3.48,0x151e19);
        block(.8,1.25,.05,x,base+1.65,z+3.42,0x492e29);
        for(const dx of [-1.4,1.4])candle(x+dx,base+.3,z+3.15);
        for(const dx of [-.7,0,.7])block(.2,.65,.08,x+dx,base+.61,z+3.2,0x252c24);
      }
      const sign=new T.Mesh(new T.PlaneGeometry(.34,.76),new T.MeshLambertMaterial({map:labelTexture(name,'#333a2b','#c8b878')}));
      sign.position.set(side?56.975:51.025,base+2.25,z+1.5);sign.rotation.y=side?-Math.PI/2:Math.PI/2;scene.add(sign);
      // Frosted outer windows supply a visual landmark without extra dynamic lights per room.
      if(side) {
        block(.12,1.6,2.2,70.9,base+2,z-1,0x405957);
        for(const dz of [-1.1,0,1.1])block(.18,1.8,.07,70.8,base+2,z-1+dz,0x65563d);
        for(const y of [1.1,2.9])block(.18,.08,2.4,70.8,base+y,z-1,0x65563d);
      }
    }
    for(let z=2;z<35;z+=4) {
      block(6.1,.22,.3,54,base+3.42,z,0x252c24);
      block(1.2,.02,2.8,54,base+.01,z,level?0x333b2c:0x492e29);
    }
    for(const z of [9,27]) {
      const light=new T.PointLight(level?0x91b5b5:0xe8b981,18,15,2);
      light.position.set(54,base+2.65,z);scene.add(light);fixtureLights.push(light);
      block(.4,.16,.4,54,base+3.3,z,0xbdad7f);
    }
  }
  // Stairwell details guide the player without adding lights to every room.
  candle(38.1,.04,31.35);
  candle(50.3,house.floorHeight+.04,32.55);
  const stairLight=new T.PointLight(0xe8b981,13,12,2);
  stairLight.position.set(43.5,4.6,32);scene.add(stairLight);
  for(let step=2;step<house.stairs.steps;step+=4) {
    const x=house.stairs.startX+(step+.5)*.5,y=(step+1)*house.floorHeight/house.stairs.steps;
    block(.16,.012,.3,x,y+.018,31.72,0x252c24);
    block(.16,.012,.3,x+.2,y+.018,32.18,0x252c24);
  }
  function directionSign(text,x,y,z,rotation=0) {
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#26342d';ctx.fillRect(0,0,512,128);
    ctx.strokeStyle='#a39368';ctx.lineWidth=5;ctx.strokeRect(6,6,500,116);
    ctx.fillStyle='#e0d3a3';ctx.font='bold 42px sans-serif';ctx.textAlign='center';ctx.fillText(text,256,80);
    const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
    const sign=new T.Mesh(new T.PlaneGeometry(2.2,.55),new T.MeshBasicMaterial({map:texture}));
    sign.position.set(x,y,z);sign.rotation.y=rotation;scene.add(sign);
  }
  directionSign('東棟 →  階段 2F',34,2.6,33.02,Math.PI);
  for(const z of [8,20])directionSign('東棟 →',36,2.55,z+.92,Math.PI);
  directionSign('2F →',38.8,2.45,32.92,Math.PI);
  directionSign('← 1F / 玄関',50.3,house.floorHeight+2.1,32.92,Math.PI);
  directionSign('1F 東棟',54,2.6,1.03);
  directionSign('2F 奥座敷',54,house.floorHeight+2.6,1.03);
  roomNames.push(...annexNames);
  // Hanging paper lanterns: animate the parent pivots; voxel parts remain static.
  for(const z of [10,22,29]){
    const pivot=new T.Group();pivot.position.set(19.65,3.45,z);scene.add(pivot);
    box(.025,.32,.025,0,-.16,0,0x383a2a,pivot);
    box(.38,.56,.38,0,-.58,0,mat(0xbdad7f,0x694124),pivot);
    for(const y of [-.3,-.45,-.7,-.87])box(.41,.025,.41,0,y,0,0x403b2c,pivot);
    box(.1,.18,.1,0,-.96,0,0x492e29,pivot);decor.lanterns.push(pivot);
  }
  // Grandfather clock on the corridor wall, facing into the hall.
  block(.38,2.65,.82,20.68,1.33,31,0x383a2a);
  block(.025,.65,.64,20.475,2.15,31,0xbdad7f);
  block(.04,.25,.035,20.45,2.24,31,0x151e19);block(.04,.035,.22,20.445,2.15,31.09,0x151e19);
  block(.04,1.12,.5,20.46,1.04,31,0x151e19);
  const pendulum=new T.Group();pendulum.position.set(20.41,1.56,31);scene.add(pendulum);
  box(.025,.73,.025,0,-.36,0,0x806c45,pendulum);box(.07,.19,.19,0,-.76,0,0xbdad7f,pendulum);
  // One line draw for all angular cobwebs; no transparent overdraw across the screen.
  const webVertices=[];
  for(const [x,z,sign] of [[15.16,28,1],[20.84,16,-1],[15.16,4,1],[1.4,3,1],[34.6,27,-1]]){
    const point=(r,a)=>[x+Math.cos(a)*r*sign,3.48-Math.sin(a)*r,z];
    const segment=(a,b)=>webVertices.push(...a,...b);
    for(let spoke=0;spoke<=6;spoke++)segment(point(0,0),point(.95,spoke*Math.PI/12));
    for(let ring=1;ring<=4;ring++)for(let spoke=0;spoke<6;spoke++)segment(point(ring*.22,spoke*Math.PI/12),point(ring*.22,(spoke+1)*Math.PI/12));
    decor.webs++;
  }
  const webGeo=new T.BufferGeometry();webGeo.setAttribute('position',new T.Float32BufferAttribute(webVertices,3));
  const webs=new T.LineSegments(webGeo,new T.LineBasicMaterial({color:0x899084,transparent:true,opacity:.32}));scene.add(webs);
  // Rain is constrained to each window, updated in place and omitted in low mode.
  const windowLocations = roomCenters.map(([x,z])=>({x:x>18?34.67:1.33,z,base:0,right:x>18}));
  for(const level of [0,1])for(const z of [6,18,30])windowLocations.push({x:70.67,z,base:level*house.floorHeight,right:true});
  const rainCoords=new Float32Array(windowLocations.length*22*6);
  windowLocations.forEach(({x:wx,z,base},room)=>{for(let i=0;i<22;i++){
    const start=(room*22+i)*6,zz=z-2.12+rand()*2.24;
    rainCoords[start]=rainCoords[start+3]=wx;rainCoords[start+2]=rainCoords[start+5]=zz;
    decor.rain.push({start,base,phase:rand()});
  }});
  const rainGeo=new T.BufferGeometry();rainGeo.setAttribute('position',new T.BufferAttribute(rainCoords,3).setUsage(T.DynamicDrawUsage));
  const rain=new T.LineSegments(rainGeo,new T.LineBasicMaterial({color:0x99b4b5,transparent:true,opacity:.25}));rain.frustumCulled=false;scene.add(rain);
  function updateDecor(time){
    const motion=settings.reduced?0:time;
    decor.candles.forEach((flame,i)=>flame.scale.y=settings.reduced?1:.92+Math.sin(motion*5+i)*.12);
    decor.lanterns.forEach((pivot,i)=>pivot.rotation.z=settings.reduced?0:Math.sin(motion*.65+i)*.035);
    pendulum.rotation.x=settings.reduced?0:Math.sin(motion*2.4)*.22;
    if(rain.visible){
      for(const drop of decor.rain){const y=drop.base+2.84-((drop.phase+motion*.55)%1)*1.65;rainCoords[drop.start+1]=y;rainCoords[drop.start+4]=y+.09;}
      rainGeo.attributes.position.needsUpdate=true;
    }
  }
  // Architectural relief stays batched: door casings, exposed brick and joists.
  // All details sit outside the navigable wall boundary; the floor plan is unchanged.
  for (const z of [6, 18, 30]) for (const x of [15, 21]) {
    for (const dz of [-1.05, 1.05]) {
      block(.23, 3.38, .16, x, 1.69, z + dz, 0x4e4a36);
      block(.32, .22, .28, x, .12, z + dz, 0x272d26);
      block(.32, .13, .3, x, 3.24, z + dz, 0x74715a);
    }
    block(.3, .22, 2.4, x, 3.37, z, 0x4e4a36);
  }
  for (let z = 3; z < 34; z += 4) {
    for (const x of [16.2, 18, 19.8]) block(.11, .09, 3.7, x, 3.52, z, 0x4e4a36);
    for (const x of [15.03, 20.97]) {
      block(.1, .17, 1.7, x, .15, z, 0x272d26);
      block(.08, .075, 1.7, x, 1.19, z, 0x74715a);
    }
  }
  for (const z of [10, 22, 33]) {
    for (let row = 0; row < 5; row++) for (let col = 0; col < 3; col++) {
      if ((row + col) % 4 === 0) continue;
      block(.045, .12, .29, 15.015, 1.45 + row * .14, z + col * .32 + (row % 2) * .12, row % 2 ? 0x695445 : 0x574b3b);
    }
  }
  // Caged amber lamps and hanging cables replace the bare luminous blocks.
  for (let z = 4; z <= 32; z += 7) {
    for (const dz of [-.13, .13]) block(.28, .44, .025, 20.59, 2.68, z + dz, 0x272d26);
    for (const y of [2.45, 2.91]) block(.3, .055, .32, 20.61, y, z, 0x4e4a36);
    box(.12, .25, .15, 20.57, 2.68, z, mat(0xffd7a0, 0xe0a15e));
    block(.035, .55, .035, 20.8, 3.16, z, 0x272d26);
  }
  // Keep remote room props and curtains; add only the missing window lattice.
  for (const [rx, rz] of roomCenters) {
    const wx = rx > 18 ? 34.66 : 1.34;
    for (let j = -2; j <= 2; j++) block(.075, 1.85, .045, wx, 2, rz - 1 + j * .43, 0x4e4a36);
  }
  batches.forEach((items,color)=>{
    const mesh=new T.InstancedMesh(boxGeo,mat(color),items.length);
    items.forEach((p,i)=>{dummy.scale.set(p[0],p[1],p[2]);dummy.position.set(p[3],p[4],p[5]);dummy.rotation.set(0,0,0);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});mesh.castShadow=true;mesh.receiveShadow=true;scene.add(mesh);
  });

  // Lightweight in-world atmosphere. No full-screen pass or extra shadow camera.
  const atmosphere = new T.Group(); scene.add(atmosphere);
  const beamMaterial = new T.ShaderMaterial({
    transparent:true, depthWrite:false, side:T.DoubleSide, blending:T.AdditiveBlending,
    uniforms:{ tint:{value:new T.Color(0x718f9b)} },
    vertexShader:`varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader:`varying vec2 vUv; uniform vec3 tint;
      void main(){float edge=pow(max(0.0,sin(vUv.x*3.14159)),1.8);
        float lattice=0.55+0.45*smoothstep(0.08,0.22,abs(sin(vUv.x*15.7079)));
        gl_FragColor=vec4(tint,edge*lattice*pow(1.0-vUv.y,1.2)*0.075);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  const moonPools = new T.InstancedMesh(new T.PlaneGeometry(3.9,.3),
    new T.MeshBasicMaterial({color:0x8caab5,transparent:true,opacity:.055,depthWrite:false}), windowLocations.length * 4);
  const poolTransform = new T.Object3D(); poolTransform.rotation.x = -Math.PI/2;
  let poolIndex = 0;
  for (const {x:wx,z:rz,base,right} of windowLocations) {
    const endX = wx + (right ? -5.6 : 5.6);
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.Float32BufferAttribute([
      wx,base+2.85,rz-2.1, wx,base+2.85,rz+.1, endX,base+.04,rz+1.8, endX,base+.04,rz-1.8
    ],3));
    geometry.setAttribute('uv',new T.Float32BufferAttribute([0,0,1,0,1,1,0,1],2));
    geometry.setIndex([0,1,2,0,2,3]);
    atmosphere.add(new T.Mesh(geometry,beamMaterial));
    // A broken-up patch of moonlight, entirely inside each room.
    for (let j = 0; j < 4; j++) {
      poolTransform.position.set(wx+(right?-2.6:2.6),base+.018,rz-1.5+j*.52);
      poolTransform.updateMatrix(); moonPools.setMatrixAt(poolIndex++,poolTransform.matrix);
    }
  }
  atmosphere.add(moonPools);
  const mistMaterial = new T.ShaderMaterial({
    transparent:true,depthWrite:false,side:T.DoubleSide,
    uniforms:{time:{value:0}},
    vertexShader:`varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader:`varying vec2 vUv; uniform float time;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);}
      void main(){float edge=sin(vUv.x*3.14159)*sin(vUv.y*3.14159);
        float n=noise(vUv*vec2(6.,3.)+vec2(time*.025,time*.012));
        gl_FragColor=vec4(vec3(.22,.29,.28),edge*edge*smoothstep(.25,.8,n)*.12);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  const mistGeometry = new T.PlaneGeometry(5.7,8);
  for (const [x,base] of [[18,0],[54,0],[54,house.floorHeight]])for (const z of [6,14,22,30]) {
    const mist = new T.Mesh(mistGeometry,mistMaterial);
    mist.rotation.x = -Math.PI/2; mist.position.set(x,base+.22,z); atmosphere.add(mist);
  }

  // A fully articulated voxel grandmother: articulated shoulders, elbows, hips,
  // segmented skirt, hair locks, jaw and independently shivering fingers.
  function createGrandmother(){
    const root=new T.Group();scene.add(root);
    const rig=new T.Group();root.add(rig);
    const clothCanvas = document.createElement('canvas'); clothCanvas.width = clothCanvas.height = 64;
    const ctx = clothCanvas.getContext('2d'); ctx.fillStyle = '#889080'; ctx.fillRect(0,0,64,64);
    for (let y=0;y<64;y+=2) for(let x=0;x<64;x+=2) {
      ctx.fillStyle = (x+y)%4 ? '#747e6d' : '#9ba18c'; ctx.fillRect(x,y,1,2);
    }
    for(let y=6;y<64;y+=16) for(let x=6;x<64;x+=16) {
      ctx.fillStyle='#b4b29b';ctx.fillRect(x,y,2,6);ctx.fillRect(x-2,y+2,6,2);
      ctx.fillStyle='#646e5d';ctx.fillRect(x+2,y+5,2,3);
    }
    const cloth = new T.CanvasTexture(clothCanvas); cloth.colorSpace=T.SRGBColorSpace; cloth.magFilter=T.NearestFilter;
    const dress=new T.MeshStandardMaterial({color:0x899078,map:cloth,roughness:1});
    const dressDark=new T.MeshStandardMaterial({color:0x5c6956,map:cloth,roughness:1});
    const skin=new T.MeshStandardMaterial({color:0xb3a88b,roughness:.88});
    const skinDark=new T.MeshStandardMaterial({color:0x807e64,roughness:.95});
    const hair=mat(0xaaa994);
    const torso=new T.Group();torso.position.y=1.35;rig.add(torso);
    box(.6,.68,.36,0,.25,0,dress,torso);box(.72,.2,.35,0,.51,0,dressDark,torso);
    box(.31,.12,.42,0,.54,.04,0x92917b,torso);
    // Uneven apron and stitching.
    box(.42,.6,.035,0,.03,.22,0x9a9881,torso);
    for(let i=0;i<7;i++)box(.04,.055,.045,(i%2?.11:-.11),.31-i*.083,.244,0x767b62,torso);
    box(.22,.19,.022,.065,-.08,.245,0x777b63,torso);
    box(.24,.025,.028,.065,.02,.25,0xb1ac91,torso);
    box(.57,.06,.055,0,.38,.2,0xb1ac91,torso);
    for (let i=0;i<3;i++) box(.034,.034,.028,0,.48-i*.11,.225,0x343c32,torso);
    for (let i=0;i<8;i++) box(.022,.06+(i%3)*.025,.022,-.19+i*.054,-.28,.243,0x777b63,torso);
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
    // Stacked silver locks, forehead creases, clouded pupils and hollow cheeks.
    for (let i=0;i<9;i++) {
      box(.038,.048,.39,-.22+i*.055,.663-(i%3)*.008,0,i%2?0x777f70:hair,headPivot);
    }
    for (let i=0;i<3;i++) box(.27-i*.04,.012,.012,0,.48+i*.038,.264,skinDark,headPivot);
    for (const s of [-1,1]) {
      box(.025,.027,.012,s*.132,.372,.303,0xf1ead1,headPivot);
      box(.105,.018,.022,s*.14,.293,.282,skinDark,headPivot);
      box(.07,.017,.018,s*.175,.267,.287,skinDark,headPivot);
      box(.025,.055,.025,s*.081,.154,.293,skinDark,headPivot);
      box(.025,.022,.023,s*.032,.19,.385,0x343c32,headPivot);
      for(let j=0;j<4;j++) box(.025,.13+j*.025,.027,s*(.264+(j%2)*.028),.32-j*.075,.17,hair,headPivot);
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
      box(.18,.07,.19,0,-.035,0,dress,elbow);
      for(let i=0;i<4;i++) {
        box(.026,.16+(i%2)*.04,.038,-.065+i*.042,-.59,.035,skinDark,elbow);
        box(.021,.045,.012,-.065+i*.042,-.65-(i%2)*.02,.058,0xc4b99a,elbow);
        box(.032,.032,.018,-.065+i*.042,-.49,.09,skinDark,elbow);
      }
      arms.push({shoulder,elbow});
    }
    const legs=[];
    for(const s of [-1,1]){
      const leg=new T.Group();leg.position.set(s*.2,.49,0);rig.add(leg);
      box(.14,.36,.17,0,-.15,0,skinDark,leg);box(.19,.12,.33,0,-.41,.075,0x30362b,leg);legs.push(leg);
    }
    const shadowCanvas=document.createElement('canvas');shadowCanvas.width=shadowCanvas.height=64;
    const shadowContext=shadowCanvas.getContext('2d');
    const gradient=shadowContext.createRadialGradient(32,32,3,32,32,32);
    gradient.addColorStop(0,'rgba(0,0,0,.65)');gradient.addColorStop(.45,'rgba(0,0,0,.3)');gradient.addColorStop(1,'rgba(0,0,0,0)');
    shadowContext.fillStyle=gradient;shadowContext.fillRect(0,0,64,64);
    const shadow=new T.Mesh(new T.PlaneGeometry(1.5,1.2),new T.MeshBasicMaterial({map:new T.CanvasTexture(shadowCanvas),transparent:true,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.position.y=.012;root.add(shadow);
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
  // Project a softly worn reflector pattern, rather than a perfectly uniform cone.
  const torchCanvas = document.createElement('canvas'); torchCanvas.width = torchCanvas.height = 128;
  const torchContext = torchCanvas.getContext('2d');
  const torchPixels = torchContext.createImageData(128,128);
  for (let y=0;y<128;y++) for (let x=0;x<128;x++) {
    const dx=(x-63.5)/63.5,dy=(y-63.5)/63.5,r=Math.hypot(dx,dy);
    const core=Math.exp(-r*r*8),ring=Math.exp(-Math.pow((r-.57)*9,2));
    const value=Math.round(255*Math.min(1,.68+core*.29+ring*.055));
    const i=(y*128+x)*4;
    torchPixels.data[i]=torchPixels.data[i+1]=torchPixels.data[i+2]=value;torchPixels.data[i+3]=255;
  }
  torchContext.putImageData(torchPixels,0,0);
  const torchPattern = new T.CanvasTexture(torchCanvas);
  scene.add(flashlight);scene.add(flashlight.target);
  const fillLight=new T.PointLight(0xb5c5b1,2.5,4,1.8);scene.add(fillLight);
  const viewRig=new T.Group();camera.add(viewRig);scene.add(camera);
  box(.12,.14,.3,.31,-.32,-.47,0x202a23,viewRig);
  box(.13,.17,.16,.31,-.31,-.64,0x53594a,viewRig);
  box(.075,.1,.02,.31,-.31,-.729,mat(0xd4cfa5,0xc6b772),viewRig);
  box(.13,.12,.2,.31,-.41,-.4,0x82775b,viewRig);
  const torchMetal = new T.MeshStandardMaterial({color:0x697267,roughness:.38,metalness:.7});
  for (let i=0;i<5;i++) box(.132,.15,.016,.31,-.32,-.39-i*.037,torchMetal,viewRig);
  box(.156,.192,.026,.31,-.31,-.704,torchMetal,viewRig);
  box(.035,.012,.052,.31,-.241,-.48,0xa9a68c,viewRig);
  box(.155,.14,.16,.31,-.42,-.28,0x414c42,viewRig);
  for(let i=0;i<3;i++)box(.025,.04,.1,.256+i*.035,-.355,-.44,0xa69877,viewRig);
  viewRig.visible=false;
  // Sparse dust catches the flashlight, using a single point-cloud draw.
  const dustGeo=new T.BufferGeometry(),dustCoords=new Float32Array(900*3);
  for(let i=0;i<900;i++){const wing=Math.floor(i/300);dustCoords[i*3]=(wing?50.8:14.8)+rand()*6.4;dustCoords[i*3+1]=(wing===2?house.floorHeight:0)+.2+rand()*3.1;dustCoords[i*3+2]=rand()*35;}
  dustGeo.setAttribute('position',new T.BufferAttribute(dustCoords,3));
  const dust=new T.Points(dustGeo,new T.PointsMaterial({color:0xbdbd9c,size:.018,transparent:true,opacity:.27,depthWrite:false}));scene.add(dust);
  // Depth-tested light halos share one tiny texture; walls still occlude them.
  const haloCanvas=document.createElement('canvas');haloCanvas.width=haloCanvas.height=64;
  const haloContext=haloCanvas.getContext('2d');
  const haloGradient=haloContext.createRadialGradient(32,32,0,32,32,32);
  haloGradient.addColorStop(0,'rgba(255,244,208,.8)');
  haloGradient.addColorStop(.18,'rgba(255,221,173,.35)');
  haloGradient.addColorStop(.5,'rgba(255,210,150,.08)');haloGradient.addColorStop(1,'rgba(255,210,150,0)');
  haloContext.fillStyle=haloGradient;haloContext.fillRect(0,0,64,64);
  const haloTexture=new T.CanvasTexture(haloCanvas);haloTexture.colorSpace=T.SRGBColorSpace;
  const haloMaterial=new T.SpriteMaterial({map:haloTexture,color:0xffc888,transparent:true,opacity:.3,
    blending:T.AdditiveBlending,depthTest:true,depthWrite:false});
  const lightHalos=[];
  function addHalo(parent,x,y,z,width,height=width) {
    const halo=new T.Sprite(haloMaterial);halo.position.set(x,y,z);halo.scale.set(width,height,1);
    parent.add(halo);lightHalos.push(halo);return halo;
  }
  fixtureLights.forEach(light=>addHalo(scene,20.47,light.position.y,light.position.z,.95));
  decor.candles.forEach(flame=>addHalo(flame,0,.015,0,.38));
  decor.lanterns.forEach(lantern=>addHalo(lantern,0,-.58,0,.95,1.12));
  const talismanTex=labelTexture('鎮魂符','#c8b878','#682d21');
  const paperContext=talismanTex.image.getContext('2d');
  paperContext.strokeStyle='#855332';paperContext.lineWidth=2;
  paperContext.strokeRect(8,8,112,240);
  paperContext.fillStyle='#873a2a';paperContext.fillRect(50,207,28,28);
  paperContext.strokeStyle='#c8b878';paperContext.strokeRect(55,212,18,18);
  for(let i=0;i<42;i++) {
    paperContext.fillStyle=i%3?'rgba(76,54,29,.14)':'rgba(240,217,152,.3)';
    paperContext.fillRect((i*37)%120+4,(i*53)%248+4,2,4+i%7);
  }
  talismanTex.needsUpdate=true;
  const items=[];
  for(const p of house.talismans){
    const group=new T.Group();group.position.set(p.x,p.floor*house.floorHeight+1.25,p.z);group.position.floor=p.floor;scene.add(group);
    const paper=new T.Mesh(new T.BoxGeometry(.28,.65,.028),new T.MeshLambertMaterial({map:talismanTex,emissive:0xb39240,emissiveIntensity:.5}));group.add(paper);
    const glow=new T.PointLight(0xfbd28b,7,5,2);glow.position.y=.2;group.add(glow);
    const aura=addHalo(group,0,0,0,.78,1.15);
    // A thread loop and torn lower corners retain the square voxel silhouette.
    box(.022,.15,.025,0,.4,0,0x77603c,group);
    box(.055,.09,.032,-.095,-.35,0,0xa99766,group);
    box(.045,.055,.032,.08,-.333,0,0xb9a570,group);
    items.push({group,aura,baseY:p.floor*house.floorHeight+1.25,collected:false});
  }

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
    else{noise(.11,.2,player.floor===1?680:510);tone(navigation.onStairs(player)?61:79,.13,.08,'sine');}
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
      if (distance < nearest && player.floor === item.group.position.floor && clearSight(player, item.group.position)) { nearest = distance; targetItem = item; }
    }
    if (player.floor === 0 && Math.hypot(player.x - exitPos.x, player.z - exitPos.z) < 1.8) targetItem = 'exit';
  }
  function updateHud() {
    refreshInteraction();
    const location = navigation.onStairs(player) ? '階段 / 1F ↔ 2F' : player.floor === 1 ? '2F / 東棟' : player.x > 36 ? '1F / 東棟' : '1F / 本館';
    const floorLabel = $('game-hud').querySelector('.objective .hud-eyebrow');
    if(floorLabel.textContent !== location) floorLabel.textContent = location;
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
    document.querySelectorAll('.modal-layer').forEach(m=>m.classList.add('hidden')); modalDepth = 0; modalFocus.clear();
    $('end-screen').classList.add('hidden');$('landing').classList.add('hidden');$('game-hud').classList.remove('hidden');document.body.classList.add('playing');
    state='playing';elapsed=0;collected=0;stamina=100;chaseTime=0;walkPhase=0;pathClock=0;path=[];lastEnemyFoot=0;lastFoot=0;threat=0;resetInput();
    targetItem = null; exhausted = false; accumulator = 0; hudClock = 0;
    visitedAreas.clear();visitedAreas.add('main');
    pathGoal = -1; sightClock = 0; stuckTime = 0; enemyHasSight = false; previousTime = performance.now();
    $('elapsed-time').textContent = '00:00'; $('stamina-fill').style.width = '100%';
    $('interaction-prompt').classList.add('hidden'); viewRig.position.set(0, 0, 0); invalidateScene();
    player.set(18,1.62,32.7);player.floor=0;yaw=0;pitch=0;camera.position.copy(player);camera.rotation.set(0,0,0);
    flashlight.target.position.set(player.x,player.y,player.z-10);
    granny.root.position.set(18,0,6);granny.root.position.floor=0;granny.root.rotation.set(0,0,0);
    items.forEach(i=>{i.collected=false;i.group.visible=true;});exitSeals.forEach(s=>s.visible=true);updateObjective();viewRig.visible=true;
    $('danger-vignette').style.opacity=0;$('flash').style.opacity=0;$('touch-look-hint').style.opacity=1;
    if(!soundPreferenceTouched)soundOn=true;
    ensureAudio();pointerLock();showMessage('本館・東棟・2階の護符を集め、玄関へ戻れ。階段は東棟の南側。',8);updateHud();
  }
  function updateObjective(){
    $('key-count').textContent=`${collected} / 3`;
    for(let i=1;i<=3;i++)$('key-'+i).classList.toggle('collected',i<=collected);
    $('objective-text').textContent=collected===3?'玄関へ戻り、脱出する':'3つの護符を探す';
    exitGlow.color.setHex(collected===3?0xaed4b1:0xffc585);exitGlow.intensity=collected===3?18:10;
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
  function goHome(){state='intro';modalDepth=0;targetItem=null;accumulator=0;invalidateScene();resetInput();unlock();viewRig.visible=false;document.querySelectorAll('.modal-layer').forEach(m=>m.classList.add('hidden'));$('end-screen').classList.add('hidden');$('game-hud').classList.add('hidden');$('landing').classList.remove('hidden');document.body.classList.remove('playing');$('danger-vignette').style.opacity=0;$('flash').style.opacity=0;items.forEach(i=>i.group.visible=true);exitSeals.forEach(s=>s.visible=true);granny.root.position.set(18.6,0,25.6);granny.root.position.floor=0;exitGlow.color.setHex(0xffc585);exitGlow.intensity=10;modalFocus.clear();}
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
    const area = player.floor===1 ? 'upper' : player.x>37 ? 'east' : 'main';
    if(!visitedAreas.has(area)) {
      visitedAreas.add(area);
      showMessage(area==='upper'?'二階 ― 忘れられた部屋。奥座敷から、気配がする。':'東棟 ― 階段は南側。上からも、足音が聞こえる。',5);
      tone(area==='upper'?92:110,1.3,.055,'sine',area==='upper'?69:82);
    }
    camera.position.copy(player);
    if(!settings.reduced){camera.position.y+=moving?Math.sin(walkPhase)*.034:Math.sin(time*1.4)*.007;camera.rotation.z=moving?Math.sin(walkPhase*.5)*.009:0;}else camera.rotation.z=0;
    camera.rotation.y=yaw;camera.rotation.x=pitch;
    if(settings.reduced)viewRig.position.set(0,0,0);
    else viewRig.position.set(Math.sin(walkPhase*.5)*(moving?.012:.002),Math.cos(walkPhase)*(moving?.012:.002),0);
    const distance=Math.hypot(granny.root.position.x-player.x, granny.root.position.z-player.z, granny.root.position.y-(player.y-player.eyeHeight));
    pathClock -= dt; sightClock -= dt;
    if (sightClock <= 0) {
      enemyHasSight = navigation.clearSight(granny.root.position, player, .25);
      // Direct pursuit invalidates old waypoints, even if the player stays in one cell.
      if(enemyHasSight){path=[];pathGoal=-1;pathClock=0;}
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
    threat=Math.max(0,1-distance/9)*(navigation.level(granny.root.position)===player.floor?1:.25);$('danger-vignette').style.opacity=settings.reduced?0:threat*(.2+Math.sin(time*7)*.045);
    if(threat>.35&&Math.floor(elapsed*1.55)!==Math.floor((elapsed-dt)*1.55))tone(45,.16,threat*.18,'sine');
    hudClock -= dt;
    if (hudClock <= 0) { updateHud(); hudClock = .08; }
  }
  function updateIntro(time){
    const portrait=innerWidth<innerHeight;
    if(settings.reduced)time=0;
    camera.position.set(portrait?18.4:18.1,1.61+Math.sin(time*.4)*.015,portrait?31.8:32.1);
    camera.lookAt(portrait?18:16.2,1.55,24.7);camera.rotation.z=Math.sin(time*.22)*.002;
    granny.root.position.set(18.6+Math.sin(time*.4)*.045,0,25.6);granny.root.rotation.y=.02+Math.sin(time*.3)*.08;
    animateGranny(time,0,0);
  }
  function updateScare(dt,time){
    deathTime+=dt;
    const front=scareDirection.set(-Math.sin(yaw),0,-Math.cos(yaw));
    const baseY=player.y-player.eyeHeight;
    granny.root.position.copy(player).addScaledVector(front,1.05-Math.min(.25,deathTime*.35));granny.root.position.y=baseY-.43;
    granny.root.rotation.y=yaw+Math.PI;
    camera.position.copy(player);camera.position.y=baseY+1.6;camera.lookAt(granny.root.position.x,baseY+1.65,granny.root.position.z);
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
      fixtureLights.forEach((light, i) => { light.intensity = settings.reduced ? 16 : 16 * (.94 + Math.sin(time * 2.1 + i) * .035 + (i === 2 && Math.sin(time * 3.73) > .98 ? -.34 : 0)); });
      dust.rotation.y = settings.reduced ? 0 : Math.sin(time * .035) * .006;
    }
    if (!frozen || dirtyFrames > 0) {
      updateDecor(time);
      mistMaterial.uniforms.time.value = settings.reduced ? 0 : time;
      for (let i = 0; i < items.length; i++) {
        const item=items[i],motion=settings.reduced?0:time;
        item.group.position.y=item.baseY+(settings.reduced?0:Math.sin(motion*1.8+i)*.09);
        item.group.rotation.y=settings.reduced?i:motion*.5+i;
        const pulse=settings.reduced?1:1+Math.sin(motion*1.8+i)*.035;
        item.aura.scale.set(.78*pulse,1.15*pulse,1);
      }
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
    rain.visible = settings.quality !== 'low';
    atmosphere.visible = settings.quality !== 'low';
    flashlight.map = settings.quality === 'low' ? null : torchPattern;
    lightHalos.forEach(halo=>halo.visible=settings.quality !== 'low');
    // Disable derivative-based surface relief on battery-priority devices.
    for (const [material, scale] of [[wallMat,.055],[woodMat,.045],[floorMat,.038]]) {
      if (!extreme) material.bumpScale = settings.quality === 'low' ? 0 : scale;
    }
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
  $('reduce-effects').addEventListener('change',e=>{
    settings.reduced=e.target.checked;
    if(settings.reduced){
      camera.rotation.z=0;viewRig.position.set(0,0,0);dust.rotation.y=0;
      fixtureLights.forEach(light=>light.intensity=16);
      $('danger-vignette').style.opacity=0;$('flash').style.opacity=0;
    }
    saveSettings();invalidateScene();
  });
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
    if (e.code === 'KeyG' && settings.quality === 'xhigh' && !e.repeat && !e.target.closest('input,select,textarea')) { settings.quality = 'high'; applyQuality(); saveSettings(); return; }
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
        release: document.querySelector('meta[name="kuchiie-release"]')?.content || 'development',
        state, elapsed, stamina, exhausted, collected, yaw, pitch,
        player: { x: player.x, y: player.y, z: player.z, floor: player.floor },
        enemy: { x: granny.root.position.x, y: granny.root.position.y, z: granny.root.position.z, floor: navigation.level(granny.root.position) },
        map: { width:house.width, height:house.height, floors:house.floors.length,
          walkable:house.floors.map(grid=>grid.flat().filter(cell=>cell===0).length),
          talismans:items.map(item=>({x:item.group.position.x,z:item.group.position.z,floor:item.group.position.floor,collected:item.collected})) },
        input: { stickX: stick.x, stickY: stick.y, lookPointer, stickPointer, runPointer, running, keyCount: keys.size },
        renderFrames, contextLost, navigationSearches: navigation.searches,
        savedRigidDraws, modalDepth, quality: settings.quality,
        visual: { atmosphere: atmosphere.visible,
          moonbeams: atmosphere.children.filter(mesh => mesh.material === beamMaterial).length,
          mistLayers: atmosphere.children.filter(mesh => mesh.material === mistMaterial).length,
          moonPools: moonPools.count, mistTime: mistMaterial.uniforms.time.value,
          surfaceRelief: wallMat.bumpScale > 0,
          cloth: !!granny.skirtPieces[0].mesh.material.map,
          torchPattern: flashlight.map === torchPattern,
          lightHalos: lightHalos.filter(halo=>halo.visible).length,
          haloDepthTest: haloMaterial.depthTest,
          talismanPose: items.map(item=>({y:item.group.position.y,rotation:item.group.rotation.y,auraScale:item.aura.scale.y})) },
        graphics: graphics && graphics.enabled ? graphics.getStats() : null,
        gpu: { textures: renderer.info.memory.textures, geometries: renderer.info.memory.geometries, programs: renderer.info.programs.length },
        environment: { rooms: [...roomNames], candles: decor.candles.length, lanterns: decor.lanterns.length, webs: decor.webs, rainVisible: rain.visible,
          pendulumAngle: pendulum.rotation.x, lanternAngle: decor.lanterns[0].rotation.z,
          cameraRoll: camera.rotation.z, handOffset: viewRig.position.length(), pathLength: path.length },
        settings: { ...settings }
      };
    }
  });
  // Browser-verifiable invariants; no mutable game internals are exposed.
  const routes=items.every(i=>findPath(player,i.group.position).length>0)&&findPath(granny.root.position,player).length>0;
  console.info('[KUCHIIE] WebGL ready. Rooms: 18, floors: 2, talismans: 3. All routes reachable:',routes);
  if(!routes)console.error('[KUCHIIE] Navigation invariant failed.');
  updateIntro(0);updateTorch(1);requestAnimationFrame(frame);
})();
