'use strict';
/* XHIGH: optional, lazy-allocated rendering pipeline. No artificial busy-work.
   HDR scene -> depth AO / ray-marched light scattering -> multiscale bloom.
   A mirrored camera renders live floor reflections before the main scene. */
(() => {
  const T = window.THREE;
  if (!T) return;
  const quadVertex = `varying vec2 vUv;
    void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}`;

  class KuchiieGraphics {
    constructor({ renderer, scene, camera, flashlight, floor, viewRig, isTouch, settings }) {
      Object.assign(this, { renderer, scene, camera, flashlight, floor, viewRig, isTouch, settings });
      this.enabled = false;
      this.frames = 0;
      this.originals = new Map();
      this.upgraded = new Map();
      this.targets = [];
      this.materials = [];
      this.geometries = [];
      this.lightDirection = new T.Vector3();
      this.viewDirection = new T.Vector3();
      this.lookTarget = new T.Vector3();
      this.drawSize = new T.Vector2();
      this.timer = performance.now();
      this.frameCount = 0;
      this.fps = 0;
      this.supported = renderer.capabilities.isWebGL2;
    }

    makeTarget(width, height, depth = false, samples = 0, sampleDepth = depth) {
      const target = new T.WebGLRenderTarget(width, height, {
        type: this.hdr ? T.HalfFloatType : T.UnsignedByteType,
        minFilter: T.LinearFilter, magFilter: T.LinearFilter,
        depthBuffer: depth, stencilBuffer: false
      });
      if (sampleDepth) target.depthTexture = new T.DepthTexture(width, height, T.UnsignedIntType);
      target.samples = samples;
      this.targets.push(target);
      return target;
    }

    makeMaterial(uniforms, fragmentShader, vertexShader = quadVertex) {
      const material = new T.ShaderMaterial({ uniforms, vertexShader, fragmentShader,
        depthTest: false, depthWrite: false, toneMapped: false });
      this.materials.push(material);
      return material;
    }

    initialize() {
      const r = this.renderer;
      this.hdr = r.extensions.has('EXT_color_buffer_float');
      const gl = r.getContext();
      const colorSamples = Array.from(gl.getInternalformatParameter(gl.RENDERBUFFER, this.hdr ? gl.RGBA16F : gl.RGBA8, gl.SAMPLES) || []);
      const depthSamples = Array.from(gl.getInternalformatParameter(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, gl.SAMPLES) || []);
      this.msaa = [4, 2].find(samples => colorSamples.includes(samples) && depthSamples.includes(samples)) || 0;
      this.maxBufferSize = Math.min(r.capabilities.maxTextureSize, gl.getParameter(gl.MAX_RENDERBUFFER_SIZE));
      this.sceneTarget = this.makeTarget(1, 1, true, this.msaa);
      // Reflection needs a depth test, but nobody samples its depth: use a renderbuffer.
      this.reflectionTarget = this.makeTarget(1, 1, true, 0, false);
      this.atmosphereTarget = this.makeTarget(1, 1);
      this.bloomTargets = Array.from({ length: 3 }, () => [this.makeTarget(1, 1), this.makeTarget(1, 1)]);
      this.passScene = new T.Scene();
      this.passCamera = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      // One oversized triangle avoids the two-triangle seam and redundant quad fragments.
      const geometry = new T.BufferGeometry();
      geometry.setAttribute('position', new T.Float32BufferAttribute([-1,-1,0, 3,-1,0, -1,3,0], 3));
      geometry.setAttribute('uv', new T.Float32BufferAttribute([0,0, 2,0, 0,2], 2));
      this.geometries.push(geometry);
      this.quad = new T.Mesh(geometry);
      this.quad.frustumCulled = false;
      this.passScene.add(this.quad);

      // Depth-based contact shading and twenty integration samples in the torch cone.
      this.atmosphere = this.makeMaterial({
        tDepth: { value: this.sceneTarget.depthTexture },
        inverseProjection: { value: new T.Matrix4() },
        cameraWorld: { value: new T.Matrix4() },
        texel: { value: new T.Vector2() },
        torchPosition: { value: new T.Vector3() },
        torchDirection: { value: new T.Vector3() },
        eye: { value: new T.Vector3() }
      }, `precision highp float;
        varying vec2 vUv;
        uniform sampler2D tDepth;
        uniform mat4 inverseProjection,cameraWorld;
        uniform vec2 texel;
        uniform vec3 torchPosition,torchDirection,eye;
        vec3 viewPosition(vec2 uv){
          float depth=texture2D(tDepth,uv).r;
          vec4 p=inverseProjection*vec4(uv*2.0-1.0,depth*2.0-1.0,1.0);
          return p.xyz/p.w;
        }
        float hash(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
        void main(){
          vec3 center=viewPosition(vUv);
          vec3 normal=cross(dFdx(center),dFdy(center));
          normal=length(normal)>0.000001?normalize(normal):vec3(0.0,0.0,1.0);
          if(dot(normal,-center)<0.0)normal=-normal;
          float ao=0.0;
          float rotation=hash(floor(vUv/texel))*6.283185;
          float radius=clamp(90.0/max(1.0,-center.z),2.0,30.0);
          for(int i=0;i<12;i++){
            float angle=float(i)*2.399963+rotation;
            float radial=sqrt((float(i)+0.5)/12.0);
            vec2 uv=clamp(vUv+vec2(cos(angle),sin(angle))*radius*radial*texel,texel,1.0-texel);
            vec3 delta=viewPosition(uv)-center;
            float len=length(delta);
            float contact=max(0.0,dot(normal,delta/max(len,0.0001))-0.09);
            ao+=contact*(1.0-smoothstep(0.05,1.3,len));
          }
          ao=clamp(1.0-ao*0.19,0.60,1.0);
          vec3 surface=(cameraWorld*vec4(center,1.0)).xyz;
          vec3 ray=surface-eye;
          float total=min(length(ray),19.0);
          ray=normalize(ray);
          vec3 fog=vec3(0.0);
          for(int i=0;i<20;i++){
            float travel=(float(i)+0.5)*total/20.0;
            vec3 point=eye+ray*travel;
            vec3 offset=point-torchPosition;
            float distanceToLight=max(length(offset),0.15);
            float cone=smoothstep(0.70,0.92,dot(offset/distanceToLight,torchDirection));
            float attenuation=1.0/(1.0+distanceToLight*distanceToLight*0.17);
            float density=0.82+0.18*sin(point.x*2.0+sin(point.z*1.7)+point.y*3.0);
            fog+=vec3(0.74,0.65,0.42)*cone*attenuation*density*exp(-travel*0.10)*total/20.0*0.008;
          }
          gl_FragColor=vec4(fog,ao);
        }`);

      this.bright = this.makeMaterial({ tInput: { value: this.sceneTarget.texture } }, `
        varying vec2 vUv;uniform sampler2D tInput;
        void main(){vec3 c=texture2D(tInput,vUv).rgb;
          float peak=max(c.r,max(c.g,c.b));
          float brightness=smoothstep(0.32,1.15,peak);
          gl_FragColor=vec4(c*brightness,1.0);}`);
      this.blur = this.makeMaterial({ tInput: { value: null }, direction: { value: new T.Vector2() } }, `
        varying vec2 vUv;uniform sampler2D tInput;uniform vec2 direction;
        void main(){vec3 c=texture2D(tInput,vUv).rgb*0.227027;
          c+=texture2D(tInput,vUv+direction*1.384615).rgb*0.316216;
          c+=texture2D(tInput,vUv-direction*1.384615).rgb*0.316216;
          c+=texture2D(tInput,vUv+direction*3.230769).rgb*0.070270;
          c+=texture2D(tInput,vUv-direction*3.230769).rgb*0.070270;
          gl_FragColor=vec4(c,1.0);}`);
      this.composite = this.makeMaterial({
        tScene: { value: this.sceneTarget.texture },
        tAtmosphere: { value: this.atmosphereTarget.texture },
        tBloom0: { value: this.bloomTargets[0][0].texture },
        tBloom1: { value: this.bloomTargets[1][0].texture },
        tBloom2: { value: this.bloomTargets[2][0].texture }
      }, `varying vec2 vUv;
        uniform sampler2D tScene,tAtmosphere,tBloom0,tBloom1,tBloom2;
        void main(){
          vec3 c=texture2D(tScene,vUv).rgb;
          vec4 atmosphere=texture2D(tAtmosphere,vUv);
          vec3 bloom=texture2D(tBloom0,vUv).rgb*0.15
                    +texture2D(tBloom1,vUv).rgb*0.11
                    +texture2D(tBloom2,vUv).rgb*0.085;
          c=c*atmosphere.a+atmosphere.rgb+bloom;
          vec2 edge=vUv*(1.0-vUv);
          c*=mix(0.84,1.0,pow(clamp(edge.x*edge.y*16.0,0.0,1.0),0.24));
          gl_FragColor=vec4(c,1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`);
      this.composite.toneMapped = true;

      this.createSurfaceDetail();
      this.createReflection();
      this.createParticles();
      this.createShadowLights();
    }

    createSurfaceDetail() {
      const c = document.createElement('canvas');
      c.width = c.height = 512;
      const ctx = c.getContext('2d');
      const image = ctx.createImageData(512, 512);
      let seed = 41837;
      for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        const level = 106 + ((seed >>> 24) % 40) + (y % 64 < 3 ? -55 : 0);
        const i = (y * 512 + x) * 4;
        image.data[i] = image.data[i + 1] = image.data[i + 2] = level;
        image.data[i + 3] = 255;
      }
      ctx.putImageData(image, 0, 0);
      this.detailTexture = new T.CanvasTexture(c);
      this.detailTexture.wrapS = this.detailTexture.wrapT = T.RepeatWrapping;
      this.detailTexture.repeat.set(2, 2);
      this.detailTexture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
      this.scene.traverse(object => {
        if (!object.isMesh || Array.isArray(object.material) || !object.material.isMeshLambertMaterial) return;
        const original = object.material;
        this.originals.set(object, original);
        if (!this.upgraded.has(original)) {
          const upgraded = new T.MeshStandardMaterial({
            color: original.color.clone(), map: original.map,
            emissive: original.emissive.clone(), emissiveIntensity: original.emissiveIntensity,
            roughness: .77, metalness: .035,
            bumpMap: original.map ? this.detailTexture : null,
            bumpScale: original.map ? .032 : 0,
            transparent: original.transparent, opacity: original.opacity, side: original.side
          });
          this.upgraded.set(original, upgraded);
        }
      });
      this.floorOriginal = {
        roughness: this.floor.material.roughness,
        metalness: this.floor.material.metalness,
        bumpMap: this.floor.material.bumpMap,
        bumpScale: this.floor.material.bumpScale
      };
    }

    createReflection() {
      this.mirrorCamera = new T.PerspectiveCamera();
      this.reflectionMatrix = new T.Matrix4();
      const material = this.makeMaterial({
        tReflection: { value: this.reflectionTarget.texture },
        reflectionMatrix: { value: this.reflectionMatrix },
        eye: { value: new T.Vector3() }
      }, `varying vec3 vWorld;varying vec4 vReflection;
        uniform sampler2D tReflection;uniform vec3 eye;
        float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
          return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),f.x),mix(hash(i+vec2(0.0,1.0)),hash(i+1.0),f.x),f.y);}
        void main(){
          vec2 uv=vReflection.xy/vReflection.w*0.5+0.5;
          if(uv.x<0.0||uv.x>1.0||uv.y<0.0||uv.y>1.0)discard;
          float puddle=smoothstep(0.38,0.67,noise(vWorld.xz*0.58));
          float grazing=1.0-clamp(normalize(eye-vWorld).y,0.0,1.0);
          vec2 ripple=vec2(noise(vWorld.xz*13.0),noise(vWorld.zx*11.0))*.0016-.0008;
          vec3 reflection=texture2D(tReflection,clamp(uv+ripple,0.002,0.998)).rgb;
          gl_FragColor=vec4(reflection*vec3(0.85,0.93,0.88),puddle*(0.13+pow(grazing,3.0)*0.45));
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`, `uniform mat4 reflectionMatrix;varying vec3 vWorld;varying vec4 vReflection;
        void main(){vec4 world=modelMatrix*vec4(position,1.0);vWorld=world.xyz;
          vReflection=reflectionMatrix*world;gl_Position=projectionMatrix*viewMatrix*world;}`);
      material.transparent = true;
      material.depthTest = true;
      material.toneMapped = true;
      const geometry = new T.PlaneGeometry(38, 38);
      this.geometries.push(geometry);
      this.puddles = new T.Mesh(geometry, material);
      this.puddles.rotation.x = -Math.PI / 2;
      this.puddles.position.set(18, -.025, 18);
      this.puddles.renderOrder = 1;
      this.puddles.updateMatrix();
      this.puddles.matrixAutoUpdate = false;
      this.scene.add(this.puddles);
    }

    createParticles() {
      const count = 4800;
      const position = new Float32Array(count * 3);
      const phase = new Float32Array(count);
      let seed = 9861;
      const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
      for (let i = 0; i < count; i++) {
        position[i * 3] = 15.1 + random() * 5.8;
        position[i * 3 + 1] = .1 + random() * 3.35;
        position[i * 3 + 2] = random() * 34.5;
        phase[i] = random() * Math.PI * 2;
      }
      const geometry = new T.BufferGeometry();
      geometry.setAttribute('position', new T.BufferAttribute(position, 3));
      geometry.setAttribute('aPhase', new T.BufferAttribute(phase, 1));
      this.geometries.push(geometry);
      const material = this.makeMaterial({
        time: { value: 0 }, scale: { value: 1 },
        torchPosition: { value: new T.Vector3() }, torchDirection: { value: new T.Vector3() }
      }, `varying float vLight;
        void main(){float radius=length(gl_PointCoord-0.5);if(radius>0.5)discard;
          float alpha=(1.0-smoothstep(0.05,0.5,radius))*vLight;
          gl_FragColor=vec4(vec3(0.70,0.67,0.49),alpha);}`, `
        attribute float aPhase;uniform float time,scale;
        uniform vec3 torchPosition,torchDirection;varying float vLight;
        void main(){vec3 p=position;
          p.x+=sin(time*0.19+aPhase)*0.10;
          p.y+=sin(time*0.24+aPhase*1.7)*0.08;
          vec4 world=modelMatrix*vec4(p,1.0);
          vec3 ray=world.xyz-torchPosition;
          float distanceToLight=max(length(ray),0.1);
          vLight=0.045+smoothstep(0.72,0.94,dot(ray/distanceToLight,torchDirection))*0.33/(1.0+distanceToLight*0.12);
          vec4 view=viewMatrix*world;gl_Position=projectionMatrix*view;
          gl_PointSize=clamp(scale*(10.0+aPhase)/max(1.0,-view.z),1.0,8.0);
        }`);
      material.transparent = true;
      material.depthTest = true;
      material.blending = T.AdditiveBlending;
      this.particles = new T.Points(geometry, material);
      this.scene.add(this.particles);
    }

    createShadowLights() {
      this.extraLights = [];
      const shadowSize = Math.min(2048, this.renderer.capabilities.maxTextureSize);
      for (const z of [14, 26]) {
        const light = new T.SpotLight(z === 26 ? 0xde6043 : 0xa6c3b7, z === 26 ? 24 : 18, 12, .94, .62, 2);
        light.position.set(18.3, 3.35, z);
        light.target.position.set(18, 0, z + .8);
        light.castShadow = true;
        light.shadow.mapSize.set(shadowSize, shadowSize);
        light.shadow.bias = -.00035;
        light.shadow.normalBias = .025;
        light.shadow.camera.near = .15;
        this.scene.add(light, light.target);
        this.extraLights.push(light);
      }
    }

    setShadowSize(light, size) {
      if (light.shadow.mapSize.x === size) return;
      if (light.shadow.map) light.shadow.map.dispose();
      if (light.shadow.mapPass) light.shadow.mapPass.dispose();
      light.shadow.map = null;
      light.shadow.mapPass = null;
      light.shadow.mapSize.set(size, size);
      light.shadow.needsUpdate = true;
    }

    enable() {
      if (this.enabled) return true;
      if (!this.supported) return false;
      try {
        this.initialize();
        this.originals.forEach((original, object) => { object.material = this.upgraded.get(original); });
        Object.assign(this.floor.material, { roughness: .38, metalness: .09, bumpMap: this.detailTexture, bumpScale: .024 });
        this.floor.material.needsUpdate = true;
        this.setShadowSize(this.flashlight, Math.min(4096, this.renderer.capabilities.maxTextureSize));
        this.enabled = true;
        this.resize();
        // Detect incomplete offscreen buffers before reporting successful activation.
        const gl = this.renderer.getContext();
        for (const target of [this.sceneTarget, this.reflectionTarget, this.atmosphereTarget]) {
          this.renderer.setRenderTarget(target);
          if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Unsupported framebuffer configuration');
        }
        this.renderer.setRenderTarget(null);
        this.resetTiming();
        this.renderer.info.autoReset = false;
        return true;
      } catch (error) {
        console.warn('[XHIGH] Could not allocate the enhanced pipeline:', error.message);
        this.disable();
        return false;
      }
    }

    resize() {
      if (!this.enabled) return;
      // No FPS-driven downgrade. Explicit texture/pixel bounds prevent impossible allocations.
      const maxTexture = this.maxBufferSize;
      const ratio = Math.min(Math.max(devicePixelRatio, 2), 3,
        Math.sqrt(5000000 / (innerWidth * innerHeight)), maxTexture / innerWidth, maxTexture / innerHeight);
      if (this.renderer.getPixelRatio() !== ratio) this.renderer.setPixelRatio(ratio);
      this.renderer.getDrawingBufferSize(this.drawSize);
      if (this.sceneTarget.width === this.drawSize.x && this.sceneTarget.height === this.drawSize.y) return;
      const w = this.drawSize.x, h = this.drawSize.y;
      this.sceneTarget.setSize(w, h);
      this.reflectionTarget.setSize(Math.max(1, Math.floor(w * .5)), Math.max(1, Math.floor(h * .5)));
      this.atmosphereTarget.setSize(Math.max(1, Math.floor(w * .5)), Math.max(1, Math.floor(h * .5)));
      this.bloomTargets.forEach((pair, i) => pair.forEach(target => target.setSize(
        Math.max(1, Math.floor(w / (4 * 2 ** i))), Math.max(1, Math.floor(h / (4 * 2 ** i))))));
      this.atmosphere.uniforms.texel.value.set(1 / w, 1 / h);
      this.particles.material.uniforms.scale.value = ratio;
    }

    pass(material, target) {
      this.quad.material = material;
      this.renderer.setRenderTarget(target);
      this.renderer.render(this.passScene, this.passCamera);
    }

    resetTiming() {
      this.timer = performance.now(); this.frameCount = 0; this.fps = null;
    }

    present() {
      if (this.enabled) this.pass(this.composite, null);
    }

    render(time) {
      if (!this.enabled) { this.renderer.render(this.scene, this.camera); return; }
      const r = this.renderer, camera = this.camera, u = this.atmosphere.uniforms;
      r.info.reset();
      camera.updateMatrixWorld();
      this.lightDirection.subVectors(this.flashlight.target.position, this.flashlight.position).normalize();
      u.inverseProjection.value.copy(camera.projectionMatrixInverse);
      u.cameraWorld.value.copy(camera.matrixWorld);
      u.eye.value.copy(camera.position);
      u.torchPosition.value.copy(this.flashlight.position);
      u.torchDirection.value.copy(this.lightDirection);
      this.particles.material.uniforms.time.value = time;
      this.particles.material.uniforms.torchPosition.value.copy(this.flashlight.position);
      this.particles.material.uniforms.torchDirection.value.copy(this.lightDirection);
      // Reflection is a real second view, not a blurred copy of the current screen.
      const mirror = this.mirrorCamera;
      mirror.projectionMatrix.copy(camera.projectionMatrix);
      mirror.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
      mirror.position.copy(camera.position);
      mirror.position.y = -.05 - camera.position.y;
      camera.getWorldDirection(this.viewDirection);
      this.lookTarget.copy(camera.position).add(this.viewDirection);
      this.lookTarget.y = -.05 - this.lookTarget.y;
      mirror.up.set(0, 1, 0).applyQuaternion(camera.quaternion);
      mirror.up.y *= -1;
      mirror.lookAt(this.lookTarget);
      mirror.updateMatrixWorld();
      this.reflectionMatrix.multiplyMatrices(mirror.projectionMatrix, mirror.matrixWorldInverse);
      this.puddles.material.uniforms.eye.value.copy(camera.position);
      const floorVisible = this.floor.visible, handVisible = this.viewRig.visible;
      this.floor.visible = this.puddles.visible = this.viewRig.visible = false;
      try {
        r.setRenderTarget(this.reflectionTarget);
        r.render(this.scene, mirror);
      } finally {
        this.floor.visible = floorVisible;
        this.viewRig.visible = handVisible;
        this.puddles.visible = true;
      }
      // Reuse the same light-space shadow maps for the main camera's pass.
      r.shadowMap.autoUpdate = false;
      try {
        r.setRenderTarget(this.sceneTarget);
        r.render(this.scene, camera);
      } finally { r.shadowMap.autoUpdate = true; }
      this.pass(this.atmosphere, this.atmosphereTarget);
      this.pass(this.bright, this.bloomTargets[0][0]);
      this.bloomTargets.forEach((pair, i) => {
        this.blur.uniforms.tInput.value = i === 0 ? pair[0].texture : this.bloomTargets[i - 1][0].texture;
        this.blur.uniforms.direction.value.set(1 / pair[0].width, 0);
        this.pass(this.blur, pair[1]);
        this.blur.uniforms.tInput.value = pair[1].texture;
        this.blur.uniforms.direction.value.set(0, 1 / pair[0].height);
        this.pass(this.blur, pair[0]);
      });
      this.pass(this.composite, null);
      this.frames++;
      this.frameCount++;
      const now = performance.now();
      if (now - this.timer >= 1000) {
        this.fps = Math.round(this.frameCount * 10000 / (now - this.timer)) / 10;
        this.frameCount = 0;
        this.timer = now;
      }
    }

    getStats() {
      if (!this.enabled) return null;
      return {
        mode: 'xhigh', frames: this.frames, fps: this.fps,
        width: this.drawSize.x, height: this.drawSize.y,
        msaa: this.msaa, hdr: this.hdr, shadow: this.flashlight.shadow.mapSize.x,
        particles: 4800, reflections: true, aoSamples: 12, fogSteps: 20,
        drawCalls: this.renderer.info.render.calls,
        geometries: this.renderer.info.memory.geometries,
        textures: this.renderer.info.memory.textures,
        programs: this.renderer.info.programs.length,
        renderTargets: this.targets.length
      };
    }

    disable() {
      this.enabled = false;
      this.renderer.setRenderTarget(null);
      this.originals.forEach((original, object) => { object.material = original; });
      this.originals.clear();
      this.upgraded.forEach(material => material.dispose());
      this.upgraded.clear();
      // Scene materials also compile XHIGH-only light, shadow and tone-map variants.
      // Release those program references without disposing their shared textures.
      // Three.js lazily recompiles a disposed material when it is rendered again.
      const sceneMaterials = new Set();
      this.scene.traverse(object => {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach(material => { if (material?.isMaterial) sceneMaterials.add(material); });
      });
      sceneMaterials.forEach(material => material.dispose());
      if (this.floorOriginal) { Object.assign(this.floor.material, this.floorOriginal); this.floor.material.needsUpdate = true; }
      for (const light of this.extraLights || []) {
        this.scene.remove(light, light.target);
        light.dispose();
      }
      for (const mesh of [this.puddles, this.particles]) if (mesh) this.scene.remove(mesh);
      // RenderTarget.dispose also releases its depth attachment; do not double-dispose it.
      this.targets.forEach(target => target.dispose());
      this.materials.forEach(material => material.dispose());
      this.geometries.forEach(geometry => geometry.dispose());
      if (this.detailTexture) this.detailTexture.dispose();
      this.targets = []; this.materials = []; this.geometries = []; this.extraLights = [];
      if (this.passScene) this.passScene.clear();
      this.sceneTarget = this.reflectionTarget = this.atmosphereTarget = null;
      this.bloomTargets = null;
      this.passScene = this.passCamera = this.quad = null;
      this.atmosphere = this.bright = this.blur = this.composite = null;
      this.puddles = this.particles = this.detailTexture = null;
      this.mirrorCamera = this.reflectionMatrix = this.floorOriginal = null;
      this.renderer.renderLists.dispose();
      this.resetTiming();
      this.setShadowSize(this.flashlight, 1024);
      this.renderer.info.autoReset = true;
      this.renderer.shadowMap.autoUpdate = true;
    }
  }
  window.KuchiieGraphics = KuchiieGraphics;
})();
