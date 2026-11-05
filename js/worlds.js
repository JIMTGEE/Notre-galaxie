/* ┌─ ★ CE QUE TU PEUX RÉGLER ICI (facultatif — la vraie histoire est dans data.php) ───────────┐
   │  PAL          les 3 couleurs de chaque monde — cherche  const PAL                           │
   │  makeDome(…)  les couleurs du ciel de chaque monde : 3 couleurs + intensité (0 à 1)         │
   │  meta.hint    la petite phrase d'aide affichée en bas de chaque monde — cherche  meta.hint  │
   │  Une couleur d'un seul monde peut aussi se changer dans data.php avec  'accent' => '#…'      │
   └──────────────────────────────────────────────────────────────────────────────────────────┘ */
/* =========================================================
   worlds.js — un monde à explorer derrière chaque étoile
     planet        (memory)        planète + lunes-souvenirs en orbite
     gallery       (photo)         galerie flottante sous des aurores
     cinema        (video)         cinéma céleste
     constellation (trait)         constellation vivante
     tree          (lesson)        arbre de lumière sur un lac miroir
     tunnel        (future)        voyage à travers des portes d'étoiles
     letter        (le cœur)       la lettre, dans un cœur 3D qui bat
   Tous partagent : dôme nébuleux 3D, étoiles, picking 3D, lecteur.
   ========================================================= */
(() => {
  'use strict';
  const GX = window.GX, { clamp, lerp, smooth, rng, hash, ease, TAU, $ } = GX.util, env = GX.env, small = env.small;
  const ui = () => GX.ui;
  const mkCanvas = (w, h = w) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const gauss = r => r() + r() + r() - 1.5;
  const PAL = {
    planet: ['#F3A8C7', '#E9C988', '#ffd7a8'], gallery: ['#6fe0d0', '#9a7bff', '#ff9fd0'], cinema: ['#7fb4ff', '#b49bff', '#7ff0ff'],
    constellation: ['#c9a6ff', '#ff9fd8', '#9fc4ff'], tree: ['#8dffb0', '#E9C988', '#ffa8c8'], tunnel: ['#b79bff', '#7ff0ff', '#ff9fd8'], letter: ['#ff5d8f', '#E9C988', '#b99bff'],
  };

  /* ---------- dôme nébuleux : un ciel 3D complet, bruit triplanaire ---------- */
  const DOME_FS = `
  uniform sampler2D uNoise;uniform float uTime,uInt;uniform vec3 uA,uB,uC;varying vec3 vDir;
  float hash12(vec2 p){vec3 p3=fract(vec3(p.xyx)*.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}
  vec4 tri(vec3 d,float s,vec2 off){
    vec3 w=pow(abs(d),vec3(6.));w/=w.x+w.y+w.z;
    return texture2D(uNoise,d.yz*s+off)*w.x+texture2D(uNoise,d.xz*s+off.yx)*w.y+texture2D(uNoise,d.xy*s+off)*w.z;
  }
  void main(){
    vec3 d=normalize(vDir);float t=uTime;
    vec4 w=tri(d,.35,vec2(t*.002,t*.0015));
    vec4 A=tri(d+w.rgb*.2,.55,vec2(.3,.1)+t*.0012);
    vec4 B=tri(d,1.4,vec2(.7,.2)-t*.002);
    float cl=smoothstep(.3,.8,A.r*.6+B.g*.4);
    vec3 col=mix(vec3(.004,.005,.018),uA*.18,smoothstep(-1.,1.,d.y)*.7);
    col+=mix(uA,uB,A.g)*cl*.46*uInt;
    col+=uC*pow(B.b,3.)*smoothstep(.2,.9,A.a)*.5*uInt;
    float band=exp(-pow(d.y*2.2+d.x*.6,2.));
    col+=vec3(.5,.5,.62)*band*(.05+.1*A.g)*(1.-.8*smoothstep(.45,.75,B.a))*uInt;
    col=1.-exp(-col*1.4);
    col+=(hash12(gl_FragCoord.xy+fract(t)*57.)-.5)*(1./150.);
    gl_FragColor=vec4(max(col,0.),1.);
  }`;
  function makeDome(world, A, B, C, int = 1) {
    const mat = new THREE.ShaderMaterial({ uniforms: { uNoise: { value: GX.noiseTex }, uTime: GX.uTime, uA: { value: new THREE.Color(A) }, uB: { value: new THREE.Color(B) }, uC: { value: new THREE.Color(C) }, uInt: { value: int } }, vertexShader: 'varying vec3 vDir;void main(){vDir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}', fragmentShader: DOME_FS, side: THREE.BackSide, depthWrite: false, depthTest: false });
    const m = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 20), mat); m.renderOrder = -100; m.frustumCulled = false; world.scene.add(m); world.dome = m; world.domeMat = mat; return m;
  }
  const STAR_FS = `
  varying vec3 vC;varying float vA,vK;
  void main(){
    vec2 q=gl_PointCoord-.5;float d=length(q)*2.;
    float core=exp(-d*d*10.),halo=exp(-d*d*3.)*.4;
    float sp=vK*(exp(-abs(q.x)*55.)*(1.-smoothstep(.15,.5,abs(q.y)))+exp(-abs(q.y)*55.)*(1.-smoothstep(.15,.5,abs(q.x))))*.9;
    float a=(core+halo)*(1.-smoothstep(.75,1.,d))+sp;
    gl_FragColor=vec4(vC*a*vA,1.);
  }`;
  const STAR_COLS = ['#ff8a78', '#ffc27a', '#fff1c9', '#ffffff', '#ffffff', '#9fc0ff'];
  function makeStarDome(world, n, tint) {
    n = Math.floor(n * (small ? 0.6 : 1)); const r = rng(hash(world.star ? world.star.title + 'x' : 'letter'));
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), sz = new Float32Array(n), ph = new Float32Array(n), kk = new Float32Array(n), c = new THREE.Color(), t = new THREE.Color(tint || '#ffffff');
    for (let i = 0; i < n; i++) {
      const u = r() * 2 - 1, a = r() * TAU, s = Math.sqrt(1 - u * u), rad = 200 + r() * 60;
      pos.set([Math.cos(a) * s * rad, u * rad, Math.sin(a) * s * rad], i * 3);
      c.set(STAR_COLS[Math.floor(r() * STAR_COLS.length)]).lerp(t, 0.18); col.set([c.r, c.g, c.b], i * 3);
      const big = r() < 0.03; sz[i] = (1.3 + Math.pow(r(), 3) * 3.2) * (big ? 1.6 : 1); ph[i] = r(); kk[i] = big ? 1 : 0;
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aColor', new THREE.BufferAttribute(col, 3)); g.setAttribute('aSize', new THREE.BufferAttribute(sz, 1)); g.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1)); g.setAttribute('aK', new THREE.BufferAttribute(kk, 1));
    const m = new THREE.ShaderMaterial({ uniforms: { uTime: GX.uTime, uPx: GX.uPx, uFade: { value: 1 } }, vertexShader: 'uniform float uTime,uPx,uFade;attribute float aSize,aPhase,aK;attribute vec3 aColor;varying vec3 vC;varying float vA,vK;void main(){float tw=.55+.45*sin(uTime*(.6+aPhase*1.6)+aPhase*40.);gl_PointSize=aSize*(1.+aK*2.4)*uPx*(.8+.2*tw);vC=aColor;vA=tw*uFade*(1.+aK*.5);vK=aK;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}', fragmentShader: STAR_FS, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
    const p = new THREE.Points(g, m); p.frustumCulled = false; p.renderOrder = -90; world.scene.add(p); world.starDome = p; return p;
  }

  /* ---------- texte → texture (carte de verre, citation…) ---------- */
  function textTexture(text, o = {}) {
    const font = o.font || 'italic 400 54px "Cormorant Garamond", "Playfair Display", Georgia, serif', maxW = o.maxW || 900, pad = o.pad == null ? 44 : o.pad, lh = o.lh || 1.3;
    const fs = +(/(\d+)px/.exec(font) || [0, 54])[1], c = mkCanvas(maxW + pad * 2, 64), g = c.getContext('2d'); g.font = font;
    const words = String(text).split(/\s+/), lines = []; let cur = '';
    words.forEach(w => { const t = cur ? cur + ' ' + w : w; if (g.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }); if (cur) lines.push(cur);
    c.height = Math.ceil(lines.length * fs * lh + pad * 2 + (o.extra || 0)); const g2 = c.getContext('2d'); g2.font = font; g2.textBaseline = 'middle'; g2.textAlign = o.align || 'center';
    if (o.bg) { g2.fillStyle = o.bg; const r = 36; g2.beginPath(); g2.roundRect ? g2.roundRect(4, 4, c.width - 8, c.height - 8, r) : g2.rect(4, 4, c.width - 8, c.height - 8); g2.fill(); }
    if (o.border) { g2.strokeStyle = o.border; g2.lineWidth = 3; g2.beginPath(); g2.roundRect ? g2.roundRect(4, 4, c.width - 8, c.height - 8, 36) : g2.rect(4, 4, c.width - 8, c.height - 8); g2.stroke(); }
    g2.fillStyle = o.color || '#f8ece2'; g2.shadowColor = o.glow || 'rgba(243,168,199,.7)'; g2.shadowBlur = o.glowBlur == null ? 18 : o.glowBlur;
    const x = (o.align === 'left') ? pad : c.width / 2;
    lines.forEach((l, i) => g2.fillText(l, x, pad + (i + 0.5) * fs * lh));
    const tex = new THREE.CanvasTexture(c); tex.minFilter = THREE.LinearFilter; tex.anisotropy = 4;
    return { tex, aspect: c.width / c.height, w: c.width, h: c.height };
  }
  const soft = () => GX.hub.softTex || (GX.hub.softTex = GX.hub.starTex(false));
  const glowMat = (color, opacity = 1, isSoft = false) => new THREE.SpriteMaterial({ map: isSoft ? soft() : GX.hub.glowTex, color, transparent: true, opacity, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
  /* ★ médias responsives : distance de caméra nécessaire pour que w×h (en unités de scène) tienne entièrement
     dans le champ de vision actuel — recalculée à partir du format RÉEL de l'écran/téléphone, jamais figée.
     'fill' = fraction de l'écran que le média doit occuper (plus petit = la caméra recule davantage). */
  function fitDistanceFor(camera, w, h, fill = 0.4) {
    const vFov = camera.fov * Math.PI / 180, halfTanV = Math.tan(vFov / 2), halfTanH = halfTanV * camera.aspect;
    return Math.max((h / 2) / (halfTanV * fill), (w / 2) / (halfTanH * fill));
  }

  /* ---------- éclats de particules ---------- */
  class Burst {
    constructor(scene, n = 260) {
      this.n = n; this.p = new Float32Array(n * 3); this.c = new Float32Array(n * 3); this.v = new Float32Array(n * 3); this.l = new Float32Array(n); this.base = new Float32Array(n * 3); this.max = new Float32Array(n);
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(this.p, 3)); g.setAttribute('color', new THREE.BufferAttribute(this.c, 3));
      this.pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.34, map: GX.hub.glowTex, vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, depthTest: false, sizeAttenuation: true }));
      this.pts.frustumCulled = false; this.pts.renderOrder = 30; scene.add(this.pts); this.cursor = 0;
    }
    emit(pos, color, count = 70, speed = 4) {
      const col = new THREE.Color(color);
      for (let k = 0; k < count; k++) {
        const i = this.cursor++ % this.n, u = Math.random() * 2 - 1, a = Math.random() * TAU, s = Math.sqrt(1 - u * u), sp = speed * (0.35 + Math.random() * 0.9);
        this.p.set([pos.x, pos.y, pos.z], i * 3); this.v.set([Math.cos(a) * s * sp, u * sp, Math.sin(a) * s * sp], i * 3); this.base.set([col.r, col.g, col.b], i * 3); this.l[i] = this.max[i] = 1.1 + Math.random() * 1.3;
      }
    }
    update(dt) {
      for (let i = 0; i < this.n; i++) {
        if (this.l[i] <= 0) { this.c[i * 3] = this.c[i * 3 + 1] = this.c[i * 3 + 2] = 0; continue; }
        this.l[i] -= dt; const f = Math.max(0, this.l[i] / this.max[i]), d = Math.pow(0.5, dt * 2.2);
        for (let k = 0; k < 3; k++) { this.p[i * 3 + k] += this.v[i * 3 + k] * dt; this.v[i * 3 + k] *= d; this.c[i * 3 + k] = this.base[i * 3 + k] * f * f * 1.2; }
      }
      this.pts.geometry.attributes.position.needsUpdate = true; this.pts.geometry.attributes.color.needsUpdate = true;
    }
  }

  /* ---------- classe de base d'un monde ---------- */
  class World {
    constructor(star, i, kind, palKey, mood) {
      this.star = star; this.i = i; this.kind = kind; this.mood = mood || 'hub';
      this.pal = PAL[palKey || kind] || PAL.planet;
      this.accentHex = (star && star.accent) || this.pal[0]; this.accent = new THREE.Color(this.accentHex);
      this.scene = new THREE.Scene(); this.camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 900);
      this.items = (star && star.items && star.items.length ? star.items : (star && star.text ? [star.text] : [''])).slice(0, 10);
      this.total = this.items.length; this.read = new Set(); this.unsub = []; this.pick = []; this.hover = -1; this.rig = null; this.done = false;
      this.meta = { title: star ? star.title : '', kicker: star ? star.kicker : '', hint: '', chips: [] };
      this.stage = GX.registerStage({ scene: this.scene, camera: this.camera, update: (dt, T) => this.update(dt, T) });
      this.ray = new THREE.Raycaster(); this.ndc = new THREE.Vector2(); this.burst = null; this.disposables = [];
    }
    async build() { /* surchargé */ }
    enter() {
      document.documentElement.style.setProperty('--accent', this.accentHex);
      this.unsub.push(GX.input.on('drag', (dx, dy) => this.onDrag(dx, dy)), GX.input.on('wheel', d => this.onWheel(d)), GX.input.on('tap', e => this.onTap(e)), GX.input.on('move', e => this.onMove(e)));
      this.onEnter && this.onEnter();
    }
    leave() {
      this.unsub.forEach(f => f()); this.unsub = []; document.body.style.cursor = ''; document.documentElement.style.removeProperty('--accent');
      GX.unregisterStage(this.stage); this.onLeave && this.onLeave(); ui().reader.hide(true);
      const shared = new Set([GX.noiseTex, GX.hub && GX.hub.glowTex, GX.hub && GX.hub.softTex]);
      this.scene.traverse(o => { if (o.geometry) o.geometry.dispose(); const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []; ms.forEach(m => { for (const k in m) { const v = m[k]; if (v && v.isTexture && !shared.has(v)) v.dispose(); } if (m.uniforms) for (const k in m.uniforms) { const v = m.uniforms[k].value; if (v && v.isTexture && !shared.has(v)) v.dispose(); } m.dispose(); }); });
      this.disposables.forEach(f => { try { f(); } catch (e) { /* ok */ } });
    }
    update(dt, T) {
      if (this.dome) this.dome.position.copy(this.camera.position); if (this.starDome) this.starDome.position.copy(this.camera.position);
      if (this.rig) this.rig.update(dt); this.tick(dt, T); if (this.burst) this.burst.update(dt);
    }
    tick() { /* surchargé */ }
    onDrag(dx, dy) { if (this.rig && !this.lockInput) this.rig.drag(dx, dy); }
    onWheel(d) { if (this.rig && !this.lockInput) this.rig.zoom(d); }
    onMove(e) { if (!this.pick.length) return; const k = this.pickAt(e.clientX, e.clientY); if (k !== this.hover) { this.hover = k; document.body.style.cursor = k >= 0 ? 'pointer' : ''; if (k >= 0) GX.audio.tick(0.07); this.onHover && this.onHover(k); } }
    onTap(e) { if (!this.pick.length) { this.onTapEmpty && this.onTapEmpty(e); return; } const k = this.pickAt(e.clientX, e.clientY); if (k >= 0) this.focusItem(k); else this.onTapEmpty && this.onTapEmpty(e); }
    pickAt(px, py) {
      this.ndc.set(px / innerWidth * 2 - 1, -(py / innerHeight * 2 - 1)); this.ray.setFromCamera(this.ndc, this.camera);
      const hits = this.ray.intersectObjects(this.pick, false); return hits.length ? hits[0].object.userData.idx : -1;
    }
    addPick(mesh, idx) { mesh.userData.idx = idx; mesh.material.visible = false; this.pick.push(mesh); }
    markRead(k) { if (this.read.has(k)) return; this.read.add(k); this.onChip && this.onChip(k, 'read'); GX.audio.chime(3, 0.3); if (this.read.size >= this.total && !this.done) { this.done = true; this.onWorldComplete && this.onWorldComplete(); setTimeout(() => this.onComplete && this.onComplete(), 1600); } }
    showText(k, text, o = {}) {
      ui().reader.show({ kicker: o.kicker || (this.total > 1 ? `${this.star.kicker || 'Fragment'} · ${k + 1}` : (this.star.kicker || '')), title: o.title || '', paras: [text], index: k, count: this.total, accent: this.accentHex,
        onPrev: this.total > 1 && k > 0 ? () => this.focusItem(k - 1) : null, onNext: this.total > 1 && k < this.total - 1 ? () => this.focusItem(k + 1) : null, onClose: () => this.onReaderClosed && this.onReaderClosed() });
      this.markRead(k);
    }
    focusItem() { /* surchargé */ }
  }

  /* =========================================================
     1. PLANÈTE-SOUVENIR  (memory)
     ========================================================= */
  const PLANET_FS = `
  uniform sampler2D uNoise;uniform float uTime;uniform vec3 uA,uB,uC,uLight;varying vec3 vObj,vWN,vWP;
  float hash12(vec2 p){vec3 p3=fract(vec3(p.xyx)*.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}
  vec4 tri(vec3 d,float s,vec2 off){vec3 w=pow(abs(d),vec3(6.));w/=w.x+w.y+w.z;return texture2D(uNoise,d.yz*s+off)*w.x+texture2D(uNoise,d.xz*s+off.yx)*w.y+texture2D(uNoise,d.xy*s+off)*w.z;}
  void main(){
    vec3 p=normalize(vObj);
    vec4 a=tri(p,.6,vec2(.2,.4)),b=tri(p,2.0,vec2(.5,.1)),c2=tri(p,6.,vec2(.3,.8));
    float land=smoothstep(.46,.6,a.r*.65+b.g*.35);
    vec3 ocean=mix(vec3(.05,.015,.2),uA,smoothstep(.15,.95,b.r*.7+c2.r*.3));
    vec3 landc=mix(uB,uC,b.b*.7+c2.g*.3);
    vec3 col=mix(ocean,landc,land);
    col+=uC*exp(-pow((a.r*.65+b.g*.35-.53)*22.,2.))*.35;
    float cl=smoothstep(.52,.86,tri(p*1.15+vec3(uTime*.012,0.,uTime*.008),1.3,vec2(.1)).g*.7+tri(p,3.,vec2(uTime*.01,.2)).r*.3);
    col=mix(col,vec3(1.,.93,.97),cl*.5);
    vec3 n=normalize(vWN);float nl=dot(n,normalize(uLight));float day=smoothstep(-.12,.4,nl);
    vec3 lit=col*(.06+day*1.25);
    lit+=vec3(1.,.45,.3)*pow(max(0.,1.-abs(nl)*5.),2.)*.22*day;
    float city=smoothstep(.8,.94,tri(p,14.,vec2(.1)).r)*land*(1.-day)*(1.-cl);
    lit+=vec3(1.,.82,.5)*city*1.8;
    vec3 v=normalize(cameraPosition-vWP);float fr=pow(1.-max(dot(n,v),0.),3.);
    lit+=mix(uA,vec3(1.),.45)*fr*.85*(.25+day);
    gl_FragColor=vec4(1.-exp(-lit*1.3),1.);
  }`;
  class PlanetWorld extends World {
    constructor(star, i) { super(star, i, 'planet', 'planet', 'memory'); }
    async build() {
      const P = this.pal, r = rng(hash(this.star.title));
      makeDome(this, '#220a44', '#b02a78', '#ff7fa8', 0.9); makeStarDome(this, 1800, P[0]);
      this.rig = new GX.OrbitRig(this.camera, { dist: 46, minDist: 6, maxDist: 34, pitch: 0.18, auto: 0.035 });
      /* planète */
      this.planetMat = new THREE.ShaderMaterial({ uniforms: { uNoise: { value: GX.noiseTex }, uTime: GX.uTime, uA: { value: new THREE.Color('#e0529e') }, uB: { value: new THREE.Color('#7a3358') }, uC: { value: new THREE.Color(P[1]) }, uLight: { value: new THREE.Vector3(-0.85, 0.35, 0.55) } },
        vertexShader: 'varying vec3 vObj,vWN,vWP;void main(){vObj=position;vWN=normalize(mat3(modelMatrix)*normal);vec4 w=modelMatrix*vec4(position,1.);vWP=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}', fragmentShader: PLANET_FS });
      this.planet = new THREE.Mesh(new THREE.SphereGeometry(2.6, 96, 64), this.planetMat); this.scene.add(this.planet);
      const atmoMat = new THREE.ShaderMaterial({ uniforms: { uC: { value: new THREE.Color(P[0]) } }, vertexShader: 'varying vec3 vN,vV;void main(){vN=normalize(mat3(modelMatrix)*normal);vec4 w=modelMatrix*vec4(position,1.);vV=normalize(cameraPosition-w.xyz);gl_Position=projectionMatrix*viewMatrix*w;}',
        fragmentShader: 'uniform vec3 uC;varying vec3 vN,vV;void main(){float f=pow(max(dot(-vN,vV),0.),2.2);gl_FragColor=vec4(uC*f*1.1,1.);}', side: THREE.BackSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
      this.scene.add(new THREE.Mesh(new THREE.SphereGeometry(3.1, 64, 48), atmoMat));
      const sun = new THREE.Sprite(glowMat('#fff1d8', 0.9)); sun.scale.set(30, 30, 1); sun.position.set(-70, 28, -40); this.scene.add(sun);
      /* lunes = fragments */
      this.moons = []; const n = this.total;
      this.items.forEach((txt, k) => {
        const radius = 4.7 + k * 0.85, inc = (r() - 0.5) * 0.9, grp = new THREE.Group(); grp.rotation.set(inc, r() * TAU, (r() - 0.5) * 0.5); this.scene.add(grp);
        const ringPts = []; for (let j = 0; j <= 128; j++) ringPts.push(new THREE.Vector3(Math.cos(j / 128 * TAU) * radius, 0, Math.sin(j / 128 * TAU) * radius));
        const ring = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(ringPts), new THREE.LineBasicMaterial({ color: P[0], transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false })); grp.add(ring);
        const moon = new THREE.Group(); grp.add(moon);
        const core = new THREE.Mesh(new THREE.SphereGeometry(0.2 + (k % 3) * 0.04, 24, 16), new THREE.MeshBasicMaterial({ color: '#fff4e6' })); moon.add(core);
        const glow = new THREE.Sprite(glowMat(k % 2 ? P[1] : P[0], 0.95)); glow.scale.set(2.6, 2.6, 1); moon.add(glow);
        const hit = new THREE.Mesh(new THREE.SphereGeometry(0.85, 10, 8), new THREE.MeshBasicMaterial()); moon.add(hit); this.addPick(hit, k);
        this.moons.push({ grp, moon, radius, r0: radius, ang: r() * TAU, speed: (0.5 + r() * 0.35) / Math.sqrt(radius) * 0.55, glow, core, read: false });
      });
      this.orbitScale = 1; this.sel = -1; this.camTarget = new THREE.Vector3(); this.ringT = 0; this.burst = new Burst(this.scene);
      this.meta.hint = n > 1 ? 'Glisse pour tourner · touche une lune pour lire un fragment' : 'Touche la lune pour lire le souvenir';
      this.meta.chips = this.items.map((t, k) => `Fragment ${k + 1}`);
    }
    onEnter() { this.camTween = GX.tween(this.rig, { dist: 13.5 }, 3200, { ease: ease.out }); }
    focusItem(k) {
      if (k < 0 || k >= this.total) return; this.sel = k; this.showText(k, this.items[k]); this.moons[k].read = true;
      const w = new THREE.Vector3(); this.moons[k].moon.getWorldPosition(w); this.burst.emit(w, this.pal[1], 60, 3);
      GX.cancelTweens(this.rig); GX.tween(this.rig, { dist: 6.5 }, 1200, { ease: ease.out }); GX.tween(this, { orbitScale: 0.06 }, 900);
    }
    onReaderClosed() { this.sel = -1; GX.tween(this.rig, { dist: 13.5 }, 1400, { ease: ease.inOut }); GX.tween(this, { orbitScale: 1 }, 1600); }
    onTapEmpty() { if (ui().reader.open) ui().reader.hide(); }
    onWorldComplete() {
      GX.tween(this, { ringT: 1 }, 3500, { ease: ease.inOutSine });
      const pts = [], N = 220; for (let j = 0; j < N; j++) { const t = j / N * TAU, x = 16 * Math.pow(Math.sin(t), 3), y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t); pts.push(new THREE.Vector3(x * 0.2, y * 0.2 + 7.8, 0)); }
      const g = new THREE.BufferGeometry().setFromPoints(pts); this.heartOutline = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.28, map: GX.hub.glowTex, color: this.pal[1], transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true }));
      this.scene.add(this.heartOutline); this.heartT = 0; GX.tween(this, { heartT: 1 }, 2600);
    }
    tick(dt, T) {
      this.planet.rotation.y += dt * 0.05;
      this.moons.forEach((m, k) => {
        m.ang += m.speed * dt * this.orbitScale; const R = lerp(m.r0, 6.4, this.ringT);
        if (this.ringT > 0) m.ang += (((k / this.total) * TAU - m.ang) % TAU) * 0 ; m.moon.position.set(Math.cos(m.ang) * R, 0, Math.sin(m.ang) * R);
        const hov = this.hover === k ? 1.5 : 1, tgt = (m.read ? 1.25 : 1) * hov * (1 + 0.1 * Math.sin(T * 2 + k)); m.glow.scale.setScalar(lerp(m.glow.scale.x, 2.6 * tgt, 0.15));
        m.glow.material.color.set(m.read ? '#E9C988' : (k % 2 ? this.pal[1] : this.pal[0]));
      });
      if (this.sel >= 0) { this.moons[this.sel].moon.getWorldPosition(this.camTarget); this.rig.target.lerp(this.camTarget, Math.min(1, dt * 3)); }
      else this.rig.target.lerp(new THREE.Vector3(0, this.heartOutline ? 2.2 : 0, 0), Math.min(1, dt * 2));
      if (this.heartOutline) { this.heartOutline.material.opacity = this.heartT * (0.75 + 0.25 * Math.sin(T * 2)); this.heartOutline.rotation.y = Math.sin(T * 0.4) * 0.35; }
      this.planetMat.uniforms.uLight.value.set(-0.85, 0.35 + 0.1 * Math.sin(T * 0.1), 0.55);
    }
  }

  /* =========================================================
     2. GALERIE FLOTTANTE  (photo)
     ========================================================= */
  const AURORA_FS = `
  uniform sampler2D uNoise;uniform float uTime,uAlpha;uniform vec3 uA,uB;varying vec2 vUv;
  void main(){
    float x=vUv.x,y=vUv.y;
    vec4 n=texture2D(uNoise,vec2(x*2.2+uTime*.006,uTime*.01));
    vec4 m=texture2D(uNoise,vec2(x*5.+n.r*.5,uTime*.02+x*.3));
    float curtain=smoothstep(.25,.9,m.g*.6+n.b*.5)*(.55+.45*sin(x*40.+n.g*6.+uTime*.7));
    float fy=smoothstep(0.,.18,y)*(1.-smoothstep(.55,1.,y));
    vec3 col=mix(uA,uB,smoothstep(.1,.9,y+n.r*.3-.15));
    gl_FragColor=vec4(col*curtain*fy*uAlpha*1.5,1.);
  }`;
  class GalleryWorld extends World {
    constructor(star, i) { super(star, i, 'gallery', 'gallery', 'gallery'); }
    async build() {
      const P = this.pal, st = this.star; const photos = st.gallery || [];
      makeDome(this, '#06303a', '#2a1a6a', '#3de0c0', 0.85); makeStarDome(this, 1500, P[0]);
      /* éléments : photos puis fragments de texte */
      this.entries = []; photos.forEach((p, k) => this.entries.push({ type: 'photo', src: p.src, caption: p.caption || st.title }));
      this.items.forEach((t, k) => { if (t && !(this.entries.length === 0 && false)) this.entries.push({ type: 'text', text: t }); });
      if (!this.entries.length) this.entries.push({ type: 'text', text: st.title });
      this.total = this.entries.length; this.meta.chips = this.entries.map((e, k) => e.type === 'photo' ? `Photo ${k + 1}` : `Mot ${k + 1}`);
      this.meta.hint = 'Glisse pour regarder autour · molette pour zoomer · touche une photo pour l\'approcher';
      /* aurores */
      this.auroras = [];
      for (let k = 0; k < 3; k++) {
        const m = new THREE.ShaderMaterial({ uniforms: { uNoise: { value: GX.noiseTex }, uTime: GX.uTime, uAlpha: { value: 0.0 }, uA: { value: new THREE.Color(k % 2 ? P[1] : P[0]) }, uB: { value: new THREE.Color(k % 2 ? P[2] : P[1]) } }, vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}', fragmentShader: AURORA_FS, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
        const geo = new THREE.CylinderGeometry(34 + k * 4, 34 + k * 4, 26, 64, 1, true, k * 2.1, 2.3); const mesh = new THREE.Mesh(geo, m); mesh.position.y = 15 + k * 2; mesh.renderOrder = -60; this.scene.add(mesh); this.auroras.push({ mesh, m });
      }
      /* sol : cercle lumineux */
      const floor = new THREE.Mesh(new THREE.CircleGeometry(22, 64), new THREE.ShaderMaterial({ uniforms: { uC: { value: new THREE.Color(P[0]) } }, vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}', fragmentShader: 'uniform vec3 uC;varying vec2 vUv;void main(){float r=length(vUv-.5)*2.;float a=exp(-r*r*3.5)*.35+exp(-pow((r-.55)*9.,2.))*.18;gl_FragColor=vec4(uC*a,1.);}', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      floor.rotation.x = -Math.PI / 2; floor.position.y = -4.6; floor.renderOrder = -55; this.scene.add(floor);
      /* panneaux sur une hélice autour de la caméra */
      this.panels = []; const n = this.total, R = n > 5 ? 9.5 : 8.2, span = Math.min(TAU, Math.max(1.6, n * 0.82)), loader = new THREE.TextureLoader();
      this.entries.forEach((e, k) => {
        const ang = (n === 1 ? 0 : (k / n) * span - span / 2 + (span < TAU ? 0 : Math.PI)) , y = (k % 2 ? 0.7 : -0.5) + Math.sin(k * 1.7) * 0.5;
        const grp = new THREE.Group(); grp.position.set(Math.sin(ang) * R, y, -Math.cos(ang) * R); grp.lookAt(0, y * 0.3, 0);
        const mk = (tex, aspect) => {
          const h = e.type === 'photo' ? 3.1 : Math.max(2.2, 3.1 / Math.max(1, aspect * 0.8)), w = clamp(h * aspect, 2, 5.2);
          const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.0, depthWrite: false, depthTest: false })); plane.renderOrder = 10; grp.add(plane);
          const halo = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.25, h * 1.3), new THREE.ShaderMaterial({ uniforms: { uC: { value: this.accent.clone() }, uH: { value: 0 }, uTime: GX.uTime }, vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}', fragmentShader: 'uniform vec3 uC;uniform float uH,uTime;varying vec2 vUv;void main(){vec2 d=abs(vUv-.5)*2.;float e=max(d.x,d.y);float a=exp(-pow((e-.8)*16.,2.))*.85+exp(-pow((e-.8)*4.5,2.))*.12;gl_FragColor=vec4(uC*a*(.5+.6*uH+.08*sin(uTime*2.)),1.);}', transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending })); halo.position.z = -0.02; halo.renderOrder = 9; grp.add(halo);
          const hit = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial()); hit.position.z = 0.02; grp.add(hit); this.addPick(hit, k);
          Object.assign(p, { plane, halo, w, h, ready: true });
        };
        const p = { grp, e, home: grp.position.clone(), homeQ: grp.quaternion.clone(), focus: 0, hov: 0, born: 0, ph: k * 1.3, ready: false };
        this.scene.add(grp); this.panels.push(p);
        if (e.type === 'photo') {
          const placeholder = () => { const c = mkCanvas(640, 440), g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 640, 440); gr.addColorStop(0, '#2a1646'); gr.addColorStop(1, '#0d2a3a'); g.fillStyle = gr; g.fillRect(0, 0, 640, 440); const rr = rng(k + 5); for (let j = 0; j < 140; j++) { g.fillStyle = `rgba(255,255,255,${rr() * 0.6})`; g.fillRect(rr() * 640, rr() * 440, 1.6, 1.6); } g.fillStyle = 'rgba(248,236,226,.85)'; g.font = 'italic 34px Georgia, serif'; g.textAlign = 'center'; g.fillText(e.caption || '', 320, 210); g.font = '15px sans-serif'; g.fillStyle = 'rgba(203,191,216,.6)'; g.fillText('✦ photo à ajouter · ' + e.src, 320, 250); const t = new THREE.CanvasTexture(c); mk(t, 640 / 440); };
          loader.load(e.src, tex => { tex.minFilter = THREE.LinearFilter; tex.anisotropy = 4; mk(tex, tex.image.width / tex.image.height); }, undefined, placeholder);
        } else {
          const tt = textTexture(e.text, { maxW: 720, font: 'italic 400 50px "Cormorant Garamond", Georgia, serif', bg: 'rgba(14,10,30,.62)', border: this.accentHex, pad: 54, glow: 'rgba(255,255,255,.35)', glowBlur: 8 });
          mk(tt.tex, tt.aspect);
        }
      });
      this.camera.position.set(0, 0, 0); this.yaw = 0; this.pitch = 0; this.vy = 0; this.vp = 0; this.fov = 70; this.focusI = -1; this.burst = new Burst(this.scene);
    }
    onEnter() { this.yaw = Math.PI * 0.65; this.fovT = 70; GX.tween(this, { yaw: 0 }, 3600, { ease: ease.out }); this.lockInput = false; }
    onDrag(dx, dy) { if (this.focusI >= 0) return; this.vy += dx * 0.00042 * 60; this.vp += dy * 0.0003 * 60; }
    onWheel(d) { this.fov = clamp(this.fov + d * 0.035, 36, 84); }
    focusItem(k) {
      if (k < 0 || k >= this.total) return; const p = this.panels[k]; if (!p || !p.ready) return;
      if (this.focusI >= 0 && this.focusI !== k) this.panels[this.focusI].target = 0;
      this.focusI = k; p.target = 1; const e = p.e;
      this.showText(k, e.type === 'photo' ? (e.caption || this.star.text) : e.text, { title: e.type === 'photo' ? '' : '' });
      const w = new THREE.Vector3(); p.grp.getWorldPosition(w); this.burst.emit(w, this.accentHex, 50, 2.5);
    }
    onReaderClosed() { if (this.focusI >= 0) { this.panels[this.focusI].target = 0; this.focusI = -1; } }
    onTapEmpty() { if (ui().reader.open) ui().reader.hide(); }
    tick(dt, T) {
      this.yaw += this.vy * dt; this.pitch = clamp(this.pitch + this.vp * dt, -0.5, 0.5); const d = Math.exp(-dt * 3.4); this.vy *= d; this.vp *= d; if (!GX.input.dragging && this.focusI < 0) { this.yaw += 0.018 * dt; this.pitch *= Math.exp(-dt * 0.8); }
      this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ'); this.camera.fov = lerp(this.camera.fov, this.fov, Math.min(1, dt * 4)); this.camera.updateProjectionMatrix();
      this.auroras.forEach((a, k) => { a.m.uniforms.uAlpha.value = lerp(a.m.uniforms.uAlpha.value, 0.9, dt * 0.6); a.mesh.rotation.y += dt * 0.012 * (k % 2 ? -1 : 1); });
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion), up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);
      this.panels.forEach((p, k) => {
        if (!p.ready) return; p.born = Math.min(1, p.born + dt * 0.7 + 0.0); const hv = this.hover === k ? 1 : 0; p.hov += (hv - p.hov) * Math.min(1, dt * 8); p.focus += (((p.target || 0)) - p.focus) * Math.min(1, dt * 4.5);
        const home = p.home.clone(); home.y += Math.sin(T * 0.7 + p.ph) * 0.12;
        const focusDist = clamp(fitDistanceFor(this.camera, p.w, p.h, 0.64), 3, 9); // ★ responsive : s'adapte au format de la photo et de l'écran (téléphone compris) — même cadrage généreux que l'écran de cinéma
        const aim = this.camera.position.clone().addScaledVector(fwd, focusDist).addScaledVector(up, 0.1);
        p.grp.position.lerpVectors(home, aim, smooth(p.focus)); p.grp.lookAt(this.camera.position);
        if (p.focus < 0.02) { const tmp = new THREE.Object3D(); tmp.position.copy(p.grp.position); tmp.lookAt(0, home.y * 0.3, 0); p.grp.quaternion.slerp(tmp.quaternion, 1); }
        const sc = (1 + p.hov * 0.07) * (1 + p.focus * 0.55) * lerp(0.85, 1, smooth(p.born)); p.grp.scale.setScalar(sc);
        const dim = this.focusI >= 0 && this.focusI !== k ? 0.3 : 1; p.plane.material.opacity = lerp(p.plane.material.opacity, smooth(p.born) * dim, 0.15); p.halo.material.uniforms.uH.value = p.hov + p.focus + (this.read.has(k) ? 0.4 : 0);
      });
    }
  }

  /* =========================================================
     3. CINÉMA CÉLESTE  (video)
     ========================================================= */
  const SCREEN_FS = `
  uniform sampler2D uTex,uNoise;uniform float uTime,uHas,uPlay;uniform vec3 uA,uB;varying vec2 vUv;
  void main(){
    vec2 uv=vUv;vec3 col;
    if(uHas>.5){col=texture2D(uTex,uv).rgb;}
    else{
      vec4 n=texture2D(uNoise,uv*.9+vec2(uTime*.01,0.)),m=texture2D(uNoise,uv*2.4+n.rg*.4-vec2(0.,uTime*.012));
      col=mix(uA*.1,uB*.55,smoothstep(.3,.8,n.r*.6+m.g*.4))*(.35+.55*m.b);
      col+=vec3(.7,.6,1.)*pow(m.b,5.)*.22;
    }
    vec2 d=abs(uv-.5)*2.;float v=1.-smoothstep(.75,1.25,max(d.x,d.y*1.1));
    col*=mix(.55,1.,v);
    gl_FragColor=vec4(col,1.);
  }`;
  class CinemaWorld extends World {
    constructor(star, i) { super(star, i, 'cinema', 'cinema', 'cinema'); }
    async build() {
      const P = this.pal, st = this.star; makeDome(this, '#0a2a5a', '#3a2a8a', P[2], 0.85); makeStarDome(this, 1600, P[0]);
      this.rig = new GX.OrbitRig(this.camera, { tz: -14, ty: 0.4, dist: 36, minDist: 10, maxDist: 28, yawLim: 0.55, pitchLim: 0.3, spring: 0.9, pitch: 0.04 });
      const Wd = 13, Hd = Wd * 9 / 16; this.baseWd = Wd; this.baseHd = Hd; this.vsrc = st.media && st.media.type === 'video' ? st.media.src : null; this.hasV = false; this.vfail = false; this.amb = new THREE.Color(P[0]);
      let tex = null;
      if (this.vsrc) {
        const v = document.createElement('video'); v.src = this.vsrc; v.playsInline = true; v.preload = 'auto'; v.setAttribute('playsinline', ''); this.video = v;
        v.addEventListener('error', () => { this.vfail = true; this.screenMat.uniforms.uHas.value = 0; if (this.ctl) this.ctl.play.parentNode.remove(); this.capI = -1; this.capTimer = 99; this.markRead(0); });
        /* ★ dès que les dimensions réelles de la vidéo sont connues, l'écran épouse son format (plus d'étirement) */
        v.addEventListener('loadedmetadata', () => this.fitScreenToVideo(v.videoWidth, v.videoHeight));
        v.addEventListener('loadeddata', () => { this.hasV = true; this.screenMat.uniforms.uHas.value = 1; });
        v.addEventListener('ended', () => { this.setPlaying(false); this.markRead(0); });
        tex = new THREE.VideoTexture(v); tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = false;
        this.disposables.push(() => { v.pause(); v.removeAttribute('src'); v.load(); GX.audio.duck(false); });
      }
      this.screenMat = new THREE.ShaderMaterial({ uniforms: { uTex: { value: tex }, uNoise: { value: GX.noiseTex }, uTime: GX.uTime, uHas: { value: 0 }, uPlay: { value: 0 }, uA: { value: new THREE.Color(P[0]) }, uB: { value: new THREE.Color(P[1]).multiplyScalar(0.7) } }, vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}', fragmentShader: SCREEN_FS, transparent: true, depthTest: false, depthWrite: false });
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(Wd, Hd), this.screenMat); scr.position.set(0, 3.4, -14); scr.renderOrder = 7; this.scene.add(scr); this.screen = scr;
      const hitScr = new THREE.Mesh(new THREE.PlaneGeometry(Wd, Hd), new THREE.MeshBasicMaterial()); hitScr.position.set(0, 3.4, -13.9); this.addPick(hitScr, 1000); this.scene.add(hitScr); this.hitScr = hitScr;
      this.frame = new THREE.Mesh(new THREE.PlaneGeometry(Wd * 1.5, Hd * 1.7), new THREE.ShaderMaterial({ uniforms: { uC: { value: new THREE.Color(P[0]) }, uTime: GX.uTime, uP: { value: 0 } }, vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}', fragmentShader: 'uniform vec3 uC;uniform float uTime,uP;varying vec2 vUv;void main(){vec2 d=abs(vUv-.5)*2.;float e=max(d.x/1.0,d.y/1.0);float inner=smoothstep(.62,.66,max(d.x*1.5/1.0,d.y*1.7/1.0));float edge=exp(-pow((max(d.x*1.5,d.y*1.7)-.67)*14.,2.))*.9;float glow=exp(-pow(max(d.x*1.5,d.y*1.7)-.62,2.)*6.)*.28*(.7+.3*uP);gl_FragColor=vec4(uC*(edge*.8+glow*inner),1.);}', transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending })); this.frame.position.set(0, 3.4, -14.05); this.frame.renderOrder = 5; this.scene.add(this.frame);
      /* sol miroir + faisceau de projection */
      const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 64), new THREE.ShaderMaterial({ uniforms: { uC: { value: new THREE.Color(P[0]) }, uP: { value: 0 } }, vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}', fragmentShader: 'uniform vec3 uC;uniform float uP;varying vec2 vUv;void main(){vec2 c=(vUv-.5)*2.;float r=length(c);float a=exp(-r*r*5.)*.22+exp(-pow((r-.42)*10.,2.))*.12;a+=exp(-pow((c.x)*5.,2.)-pow(c.y+.2,2.)*4.)*.2*(.5+uP);gl_FragColor=vec4(uC*a,1.);}', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); floor.rotation.x = -Math.PI / 2; floor.position.set(0, -3.2, -10); floor.renderOrder = -55; this.scene.add(floor); this.floor = floor;
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 6.5, 20, 40, 1, true), new THREE.ShaderMaterial({ uniforms: { uC: { value: new THREE.Color(P[2]) } }, vertexShader: 'varying float vY;void main(){vY=uv.y;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}', fragmentShader: 'uniform vec3 uC;varying float vY;void main(){gl_FragColor=vec4(uC*pow(1.-vY,2.)*.12,1.);}', transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })); beam.position.set(0, 12, -12); beam.renderOrder = -50; this.scene.add(beam);
      const rr = rng(77), N = small ? 120 : 260, dp = new Float32Array(N * 3); for (let k = 0; k < N; k++) dp.set([(rr() - 0.5) * 11, rr() * 18 - 3, -12 + (rr() - 0.5) * 7], k * 3);
      this.dust = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(dp, 3)), new THREE.PointsMaterial({ size: 0.12, map: GX.hub.glowTex, color: P[2], transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })); this.dust.renderOrder = 6; this.scene.add(this.dust);
      this.burst = new Burst(this.scene); this.playing = false; this.o = 0; this.rebuildMeta();
    }
    /* ★ ajuste la taille de l'écran (et de son cadre) au format réel de la vidéo, sans jamais l'étirer ni la déformer,
       et SANS jamais réduire sa surface par rapport à l'écran 16:9 d'origine (une vidéo portrait devient haute et
       fine plutôt que d'être rabougrie) — puis replace la caméra pour qu'elle tienne bien à l'écran, téléphone compris. */
    fitScreenToVideo(vw, vh) {
      if (!vw || !vh || !this.screen) return;
      const aspect = vw / vh, area = this.baseWd * this.baseHd; // même surface qu'à l'origine, quel que soit le format
      const w = Math.sqrt(area * aspect), h = Math.sqrt(area / aspect);
      const sx = w / this.baseWd, sy = h / this.baseHd;
      [this.screen, this.hitScr, this.frame].forEach(m => m && m.scale.set(sx, sy, 1));
      this.curW = w; this.curH = h;
      this.fitRigToScreen(900);
    }
    /* ★ recule ou rapproche la caméra pour que l'écran courant (this.curW × this.curH) tienne entièrement dans le
       champ de vision, quel que soit le format de l'appareil (téléphone en portrait compris) — rappelée à l'entrée
       dans le monde, après chargement des métadonnées vidéo, et à chaque redimensionnement/rotation d'écran. */
    fitRigToScreen(ms = 900) {
      if (!this.rig) return;
      const w = this.curW || this.baseWd, h = this.curH || this.baseHd;
      const dist = clamp(fitDistanceFor(this.camera, w, h, 0.64), this.rig.minDist, this.rig.maxDist);
      GX.cancelTweens(this.rig); GX.tween(this.rig, { dist }, ms, { ease: ease.out });
    }
    rebuildMeta() {
      const o = this.vsrc && !this.vfail ? 1 : 0; this.o = o; this.total = this.items.filter(Boolean).length + o;
      this.meta.chips = []; if (o) this.meta.chips.push('Vidéo'); this.items.forEach((t, k) => { if (t) this.meta.chips.push(`Mot ${k + 1}`); });
      this.meta.hint = o ? 'Touche l\'écran pour lancer la vidéo · glisse pour regarder autour' : 'Les mots de cette étoile défilent sur l\'écran';
      if (!this.total) this.total = 1;
    }
    rebuildChips() { this.rebuildMeta(); }
    onEnter() {
      this.fitRigToScreen(3400); this.buildControls(); this.cycleCaptions();
      this.unsub.push(GX.on('resize', () => this.fitRigToScreen(900))); // téléphone tourné, fenêtre redimensionnée…
    }
    buildControls() {
      if (!this.vsrc) return; const box = $('w-extra'); box.innerHTML = '';
      const ctl = GX.util.el('div', 'cine-ctl ui', '<button type="button" class="cine-play ui" aria-label="Lecture / pause">▶</button><input class="cine-seek ui" type="range" min="0" max="1000" value="0" aria-label="Position"><span class="cine-time">0:00</span>'); box.appendChild(ctl);
      this.ctl = { play: ctl.querySelector('.cine-play'), seek: ctl.querySelector('.cine-seek'), time: ctl.querySelector('.cine-time') };
      this.ctl.play.onclick = () => this.togglePlay(); this.ctl.seek.oninput = () => { const v = this.video; if (v && v.duration) v.currentTime = v.duration * this.ctl.seek.value / 1000; };
      this.disposables.push(() => { box.innerHTML = ''; });
    }
    setPlaying(p) { this.playing = p; if (this.ctl) this.ctl.play.textContent = p ? '❚❚' : '▶'; GX.audio.duck(p); }
    togglePlay() { const v = this.video; if (!v || this.vfail) return; if (v.paused) { v.play().then(() => this.setPlaying(true)).catch(() => ui().toast('La lecture a été bloquée par le navigateur — touche à nouveau.')); } else { v.pause(); this.setPlaying(false); } }
    onTap(e) { const k = this.pickAt(e.clientX, e.clientY); if (k === 1000) { if (this.vsrc && !this.vfail) this.togglePlay(); else this.nextCaption(); return; } if (k >= 0) this.focusItem(k); else if (ui().reader.open) ui().reader.hide(); }
    focusItem(k) {
      if (this.o && k === 0) { this.togglePlay(); return; }
      const idx = k - this.o, list = this.items.filter(Boolean); if (idx < 0 || idx >= list.length) return;
      this.showText(k, list[idx]); GX.audio.chime(2, 0.2);
    }
    cycleCaptions() { this.capI = -1; this.capTimer = 0; }
    nextCaption() { const list = this.items.filter(Boolean); if (!list.length) return; this.capI = (this.capI + 1) % list.length; this.setCaption(list[this.capI]); if (!this.vsrc || this.vfail) this.markRead(this.capI + this.o); }
    setCaption(t) {
      if (this.cap) { this.scene.remove(this.cap); this.cap.material.map.dispose(); this.cap.material.dispose(); }
      const tt = textTexture(t, { maxW: 820, font: 'italic 400 56px "Cormorant Garamond", Georgia, serif', glow: 'rgba(255,255,255,.5)', pad: 30 }), w = 10.4;
      this.cap = new THREE.Mesh(new THREE.PlaneGeometry(w, w / tt.aspect), new THREE.MeshBasicMaterial({ map: tt.tex, transparent: true, opacity: 0, depthWrite: false, depthTest: false })); this.cap.position.set(0, 3.4, -13.8); this.cap.renderOrder = 8; this.cap.userData.t = 0; this.scene.add(this.cap);
    }
    tick(dt, T) {
      const v = this.video, P = this.pal;
      if (!this.vsrc || this.vfail) { this.capTimer += dt; if (this.capTimer > 6.5 || this.capI < 0) { this.capTimer = 0; this.nextCaption(); } }
      if (this.cap) { this.cap.userData.t += dt; const a = Math.min(1, this.cap.userData.t / 1.4) * (1 - smooth(clamp((this.cap.userData.t - 5.2) / 1.2))); this.cap.material.opacity = a; }
      if (v && this.hasV) {
        if (this.ctl && v.duration) { if (document.activeElement !== this.ctl.seek) this.ctl.seek.value = String(Math.round(v.currentTime / v.duration * 1000)); const f = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`; this.ctl.time.textContent = `${f(v.currentTime)} / ${f(v.duration)}`; if (v.currentTime / v.duration > 0.8) this.markRead(0); }
        this.sampleT = (this.sampleT || 0) + dt;
        if (this.sampleT > 0.35 && this.playing) { this.sampleT = 0; const c = this.sc || (this.sc = mkCanvas(8, 5)), g = c.getContext('2d', { willReadFrequently: true }); try { g.drawImage(v, 0, 0, 8, 5); const d = g.getImageData(0, 0, 8, 5).data; let r = 0, gg = 0, b = 0; for (let k = 0; k < d.length; k += 4) { r += d[k]; gg += d[k + 1]; b += d[k + 2]; } this.amb.setRGB(r / 40 / 255, gg / 40 / 255, b / 40 / 255); } catch (e) { /* ok */ } }
      } else if (!this.vsrc) this.amb.set(P[0]).lerp(new THREE.Color(P[1]), 0.5 + 0.5 * Math.sin(T * 0.2));
      this.domeMat.uniforms.uB.value.lerp(this.amb, 0.02); this.frame.material.uniforms.uC.value.lerp(this.amb, 0.05); this.floor.material.uniforms.uC.value.lerp(this.amb, 0.05);
      const pl = this.playing ? 1 : 0; this.frame.material.uniforms.uP.value += (pl - this.frame.material.uniforms.uP.value) * 0.05; this.floor.material.uniforms.uP.value = this.frame.material.uniforms.uP.value;
      this.dust.rotation.y = T * 0.02; this.dust.position.y = Math.sin(T * 0.3) * 0.3;
      this.screen.scale.setScalar(1 + 0.004 * Math.sin(T * 1.3));
    }
    onLeave() { GX.audio.duck(false); }
  }

  /* =========================================================
     4. CONSTELLATION VIVANTE  (trait)
     ========================================================= */
  class ConstellationWorld extends World {
    constructor(star, i) { super(star, i, 'constellation', 'constellation', 'trait'); }
    async build() {
      const P = this.pal, st = this.star, r = rng(hash(st.title)), n = this.total; this.items = this.items.slice(0, 9);
      makeDome(this, '#1a0a40', '#8a2a9a', '#ff7fd0', 0.95); makeStarDome(this, 2000, P[0]);
      this.rig = new GX.OrbitRig(this.camera, { tz: -4, dist: 40, minDist: 10, maxDist: 36, pitch: 0.05, auto: 0.028, yawLim: 1.5, pitchLim: 0.5, spring: 0.12 });
      this.nodes = []; const span = Math.min(19, 6 + n * 2.6);
      for (let k = 0; k < n; k++) { const t = n === 1 ? 0.5 : k / (n - 1); this.nodes.push({ p: new THREE.Vector3((t - 0.5) * span, Math.sin(t * Math.PI * 1.3 + r() * 1.5) * 3.4 + (r() - 0.5) * 2.2, (r() - 0.5) * 9), main: true, k }); }
      const fill = []; for (let j = 0; j < 7; j++) { const base = this.nodes[Math.floor(r() * n)].p; fill.push({ p: new THREE.Vector3(base.x + (r() - 0.5) * 7, base.y + (r() - 0.5) * 6, base.z + (r() - 0.5) * 6), main: false, k: -1 }); }
      const all = this.nodes.concat(fill); this.all = all;
      const ringTex = (() => { const c = mkCanvas(128), g = c.getContext('2d'), rg = g.createRadialGradient(64, 64, 34, 64, 64, 64); rg.addColorStop(0, 'rgba(255,255,255,0)'); rg.addColorStop(0.82, 'rgba(255,255,255,0)'); rg.addColorStop(0.92, 'rgba(255,255,255,.95)'); rg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = rg; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); })(); this.disposables.push(() => ringTex.dispose());
      all.forEach((nd, idx) => {
        const grp = new THREE.Group(); grp.position.copy(nd.p); this.scene.add(grp); nd.grp = grp;
        nd.glow = new THREE.Sprite(glowMat(nd.main ? P[0] : '#aab8ff', nd.main ? 0.95 : 0.5)); nd.glow.scale.setScalar(nd.main ? 3 : 1.5); grp.add(nd.glow);
        nd.core = new THREE.Sprite(glowMat('#ffffff', 1)); nd.core.scale.setScalar(nd.main ? 0.9 : 0.5); grp.add(nd.core);
        if (nd.main) { nd.ring = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTex, color: P[1], transparent: true, opacity: 0.8, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending })); nd.ring.scale.setScalar(2.2); grp.add(nd.ring); const hit = new THREE.Mesh(new THREE.SphereGeometry(1.15, 10, 8), new THREE.MeshBasicMaterial()); grp.add(hit); this.addPick(hit, nd.k); }
        nd.lit = 0; nd.ph = r() * 6;
      });
      /* lignes : chaîne principale + liens de remplissage */
      const segs = []; for (let k = 0; k < n - 1; k++) segs.push([k, k + 1]); fill.forEach((f, j) => { const idx = n + j; let best = 0, bd = 1e9; for (let k = 0; k < n; k++) { const d = f.p.distanceTo(this.nodes[k].p); if (d < bd) { bd = d; best = k; } } segs.push([idx, best]); });
      if (n > 3) segs.push([0, 2], [n - 1, n - 3]);
      const pos = new Float32Array(segs.length * 6), u = new Float32Array(segs.length * 2), li = new Float32Array(segs.length * 2), ld = new Float32Array(segs.length * 2);
      segs.forEach((s, j) => { for (let e = 0; e < 2; e++) { const p = all[s[e]].p; pos.set([p.x, p.y, p.z], (j * 2 + e) * 3); u[j * 2 + e] = e; ld[j * 2 + e] = j * 0.31; } });
      this.segs = segs; const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aU', new THREE.BufferAttribute(u, 1)); g.setAttribute('aLit', new THREE.BufferAttribute(li, 1)); g.setAttribute('aLd', new THREE.BufferAttribute(ld, 1));
      this.lineMat = new THREE.ShaderMaterial({ uniforms: { uTime: GX.uTime, uC: { value: new THREE.Color('#bcd0ff') }, uG: { value: new THREE.Color('#ffe0a0') }, uAll: { value: 0 } }, vertexShader: 'attribute float aU,aLit,aLd;varying float vA,vL,vU;void main(){vU=aU;vL=aLit;vA=aLd;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}', fragmentShader: 'uniform float uTime,uAll;uniform vec3 uC,uG;varying float vA,vL,vU;void main(){float ph=fract(uTime*.15+vA);float pulse=exp(-pow((vU-(ph*1.6-.3))*5.,2.));float l=max(vL,uAll);vec3 c=mix(uC,uG,l);gl_FragColor=vec4(c*(.2+.55*pulse+.8*l),1.);}', transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
      this.lines = new THREE.LineSegments(g, this.lineMat); this.lines.renderOrder = 4; this.lines.frustumCulled = false; this.scene.add(this.lines);
      this.camTarget = new THREE.Vector3(0, 0, -4); this.sel = -1; this.burst = new Burst(this.scene, 360); this.nameFade = 0;
      this.meta.hint = 'Touche chaque étoile pour la faire briller · glisse pour tourner autour'; this.meta.chips = this.items.map((t, k) => `Étoile ${k + 1}`);
    }
    onEnter() { GX.tween(this.rig, { dist: 25 }, 3600, { ease: ease.out }); }
    focusItem(k) {
      if (k < 0 || k >= this.total) return; this.sel = k; const nd = this.nodes[k]; this.showText(k, this.items[k]);
      const li = this.lines.geometry.attributes.aLit.array; this.segs.forEach((s, j) => { for (let e = 0; e < 2; e++) li[j * 2 + e] = Math.max(li[j * 2 + e], (this.read.has(s[e]) ? 1 : 0)); }); this.lines.geometry.attributes.aLit.needsUpdate = true;
      this.burst.emit(nd.p, '#ffe0a0', 90, 4); GX.cancelTweens(this.rig); GX.tween(this.rig, { dist: 10.5 }, 1300, { ease: ease.out });
    }
    onReaderClosed() { this.sel = -1; GX.tween(this.rig, { dist: 25 }, 1500, { ease: ease.inOut }); }
    onTapEmpty() { if (ui().reader.open) ui().reader.hide(); }
    onWorldComplete() {
      GX.tween(this.lineMat.uniforms.uAll, { value: 1 }, 2400); GX.tween(this.domeMat.uniforms.uInt, { value: 1.7 }, 4000);
      const tt = textTexture(this.star.title, { maxW: 1100, font: 'italic 300 96px "Cormorant Garamond", Georgia, serif', glow: 'rgba(255,224,160,.9)', glowBlur: 30, color: '#fff3dc' });
      this.name = new THREE.Mesh(new THREE.PlaneGeometry(16, 16 / tt.aspect), new THREE.MeshBasicMaterial({ map: tt.tex, transparent: true, opacity: 0, depthWrite: false, depthTest: false })); this.name.position.set(0, 8.6, -4); this.name.renderOrder = 9; this.scene.add(this.name); GX.tween(this, { nameFade: 1 }, 3000);
      this.nodes.forEach((nd, k) => this.burst.emit(nd.p, '#ffe0a0', 30, 3));
    }
    tick(dt, T) {
      this.nodes.forEach((nd, k) => { const rd = this.read.has(k); nd.lit += ((rd ? 1 : 0) - nd.lit) * Math.min(1, dt * 3); const hov = this.hover === k ? 1 : 0, pulse = 1 + 0.12 * Math.sin(T * 2 + nd.ph);
        nd.glow.scale.setScalar((3 + nd.lit * 1.6 + hov * 1.2) * pulse); nd.glow.material.color.set(this.pal[0]).lerp(new THREE.Color('#ffd98a'), nd.lit); nd.ring.scale.setScalar(2.2 + hov * 0.8 + Math.sin(T * 1.5 + nd.ph) * 0.15); nd.ring.material.opacity = 0.25 + hov * 0.7 + (rd ? 0.35 : 0); nd.ring.material.color.set(rd ? '#ffe0a0' : this.pal[1]); nd.ring.material.rotation = T * 0.2; });
      this.all.forEach(nd => { if (!nd.main) nd.glow.material.opacity = 0.35 + 0.2 * Math.sin(T + nd.ph); });
      if (this.sel >= 0) this.camTarget.copy(this.nodes[this.sel].p); else this.camTarget.set(0, 0.5, -4);
      this.rig.target.lerp(this.camTarget, Math.min(1, dt * 2.6));
      if (this.name) { this.name.material.opacity = this.nameFade * (0.8 + 0.2 * Math.sin(T * 1.2)); this.name.quaternion.copy(this.camera.quaternion); if (Math.random() < dt * 1.6) this.burst.emit(this.nodes[Math.floor(Math.random() * this.nodes.length)].p, '#ffe0a0', 12, 2); }
    }
  }

  /* =========================================================
     5. ARBRE DE LUMIÈRE  (lesson)
     ========================================================= */
  const TREE_VS = `
  uniform float uTime,uPx,uGrow,uBloom,uFade,uFlip;uniform vec3 uAcc;attribute float aB,aD,aS,aPh;varying vec3 vC;varying float vA,vK;
  void main(){
    vec3 p=position;float sway=aD*aD*.4;
    p.x+=sin(uTime*.8+p.y*.5+aPh)*sway;p.z+=cos(uTime*.65+p.y*.45+aPh)*sway;
    float vis=smoothstep(aB,aB+.05,uGrow);
    vec4 mv=modelViewMatrix*vec4(p,1.);
    gl_PointSize=aS*uPx*(34./-mv.z)*vis*(1.+uBloom*aD*.6);
    vC=mix(vec3(1.,.72,.4),uAcc*1.15,pow(aD,.8))+uBloom*vec3(.35,.1,.25)*aD;
    vA=vis*uFade*(.55+.45*sin(uTime*2.+aPh*30.)*aD)*(1.+uBloom*.6);vK=0.;
    gl_Position=projectionMatrix*mv;
  }`;
  class TreeWorld extends World {
    constructor(star, i) { super(star, i, 'tree', 'tree', 'lesson'); }
    async build() {
      const P = this.pal, st = this.star, r = rng(hash(st.title)), MAXD = small ? 6 : 7; this.items = this.items.slice(0, 9);
      makeDome(this, '#031c2a', '#1a2a6a', '#2affb0', 0.75); makeStarDome(this, 1700, P[1]);
      this.rig = new GX.OrbitRig(this.camera, { ty: 6.6, dist: 52, minDist: 9, maxDist: 40, pitch: 0.1, pitchLim: 0.55, auto: 0.05 });
      const segs = [], tips = [];
      const grow = (p, dir, len, depth) => {
        const end = p.clone().addScaledVector(dir, len); segs.push({ a: p, b: end, d: depth }); if (depth >= MAXD) { tips.push(end); return; }
        const nc = depth === 0 ? 3 : (r() < 0.25 ? 3 : 2);
        for (let c = 0; c < nc; c++) { const axis = new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize(), nd = dir.clone().applyAxisAngle(axis, 0.42 + r() * 0.5); nd.y += 0.2; nd.normalize(); grow(end, nd, len * (0.7 + r() * 0.07), depth + 1); }
      };
      grow(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0), 5.0, 0);
      const pts = [], aB = [], aD = [], aS = [], aPh = [];
      segs.forEach(s => { const len = s.a.distanceTo(s.b), ppu = s.d < 2 ? 130 : 44, cnt = Math.max(3, Math.floor(len * ppu * (small ? 0.65 : 1))), rad = 0.16 / (s.d * 1.4 + 1);
        for (let k = 0; k < cnt; k++) { const t = k / cnt, p = s.a.clone().lerp(s.b, t); if (s.d < 3) p.add(new THREE.Vector3((r() - 0.5) * rad, (r() - 0.5) * rad, (r() - 0.5) * rad)); pts.push(p.x, p.y, p.z); aB.push((s.d + t) / (MAXD + 1) * 0.92); aD.push(s.d / MAXD); aS.push(s.d < 2 ? 1.8 + r() : 1.2 + r() * 1.4); aPh.push(r()); } });
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); g.setAttribute('aB', new THREE.Float32BufferAttribute(aB, 1)); g.setAttribute('aD', new THREE.Float32BufferAttribute(aD, 1)); g.setAttribute('aS', new THREE.Float32BufferAttribute(aS, 1)); g.setAttribute('aPh', new THREE.Float32BufferAttribute(aPh, 1));
      const mkMat = fade => new THREE.ShaderMaterial({ uniforms: { uTime: GX.uTime, uPx: GX.uPx, uGrow: { value: 0 }, uBloom: { value: 0 }, uFade: { value: fade }, uFlip: { value: 0 }, uAcc: { value: new THREE.Color(P[0]) } }, vertexShader: TREE_VS, fragmentShader: STAR_FS, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
      this.mat = mkMat(1); this.matR = mkMat(0.32); this.treeMesh = new THREE.Points(g, this.mat); this.reflMesh = new THREE.Points(g, this.matR); this.reflMesh.scale.y = -1; this.treeMesh.frustumCulled = this.reflMesh.frustumCulled = false; this.treeMesh.renderOrder = 6; this.reflMesh.renderOrder = 5; this.scene.add(this.treeMesh, this.reflMesh);
      /* lac miroir avec ondulations */
      this.ripples = [new THREE.Vector4(0, 0, -100, 0), new THREE.Vector4(0, 0, -100, 0), new THREE.Vector4(0, 0, -100, 0)]; this.rippleI = 0;
      const pond = new THREE.Mesh(new THREE.CircleGeometry(40, 64), new THREE.ShaderMaterial({ uniforms: { uTime: GX.uTime, uR: { value: this.ripples }, uC: { value: new THREE.Color(P[0]) } }, vertexShader: 'varying vec2 vP;void main(){vP=position.xy;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}', fragmentShader: 'uniform float uTime;uniform vec4 uR[3];uniform vec3 uC;varying vec2 vP;void main(){float r=length(vP);float a=exp(-r*r*.012)*.16+exp(-pow((r-8.)*.5,2.))*.04;for(int i=0;i<3;i++){float age=uTime-uR[i].z;float d=length(vP-uR[i].xy);a+=exp(-pow((d-age*3.2)*1.6,2.))*exp(-age*.55)*.5*step(0.,age);}gl_FragColor=vec4(uC*a,1.);}', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      pond.rotation.x = -Math.PI / 2; pond.renderOrder = 1; this.scene.add(pond); this.pond = pond;
      /* feuilles (toutes les pointes) + lumières-leçons */
      const lp = new Float32Array(tips.length * 3), lph = new Float32Array(tips.length); tips.forEach((t, k) => { lp.set([t.x, t.y, t.z], k * 3); lph[k] = r(); });
      const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(lp, 3)); lg.setAttribute('aPh', new THREE.BufferAttribute(lph, 1));
      this.leafMat = new THREE.ShaderMaterial({ uniforms: { uTime: GX.uTime, uPx: GX.uPx, uBloom: { value: 0 }, uGrow: { value: 0 }, uC: { value: new THREE.Color(P[2]) } }, vertexShader: 'uniform float uTime,uPx,uBloom,uGrow;attribute float aPh;varying vec3 vC;varying float vA,vK;void main(){vec3 p=position;p.x+=sin(uTime*.8+p.y*.5+aPh)*.4;p.z+=cos(uTime*.65+p.y*.45+aPh)*.4;vec4 mv=modelViewMatrix*vec4(p,1.);float v=smoothstep(.85,1.,uGrow);gl_PointSize=(7.+uBloom*7.)*uPx*(34./-mv.z)*v*(.8+.2*sin(uTime*1.5+aPh*20.));vC=vec3(1.,.55,.78);vA=v*(.38+uBloom*.4);vK=0.;gl_Position=projectionMatrix*mv;}', fragmentShader: STAR_FS, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
      this.leaves = new THREE.Points(lg, this.leafMat); this.leaves.frustumCulled = false; this.leaves.renderOrder = 7; this.scene.add(this.leaves);
      /* lumières cliquables : pointes les plus éloignées les unes des autres, dans la moitié haute */
      const high = tips.filter(t => t.y > 6.5).sort((a, b) => b.y - a.y), chosen = [];
      high.forEach(t => { if (chosen.length < this.total && chosen.every(c => c.distanceTo(t) > 2.6)) chosen.push(t); }); high.forEach(t => { if (chosen.length < this.total && !chosen.includes(t)) chosen.push(t); }); tips.forEach(t => { if (chosen.length < this.total && !chosen.includes(t)) chosen.push(t); });
      this.lights = chosen.slice(0, this.total).map((t, k) => { const grp = new THREE.Group(); grp.position.copy(t); this.scene.add(grp); const glow = new THREE.Sprite(glowMat('#fff2c0', 0)); glow.scale.setScalar(2.4); grp.add(glow); const core = new THREE.Sprite(glowMat('#ffffff', 0)); core.scale.setScalar(0.6); grp.add(core); const hit = new THREE.Mesh(new THREE.SphereGeometry(1.0, 8, 6), new THREE.MeshBasicMaterial()); grp.add(hit); this.addPick(hit, k); return { grp, glow, core, p: t, lit: 0, ph: r() * 6 }; });
      /* lucioles, pétales, lune */
      const fn = small ? 90 : 170, fp = new Float32Array(fn * 3), fph = new Float32Array(fn); for (let k = 0; k < fn; k++) { fp.set([(r() - 0.5) * 26, r() * 12 + 0.5, (r() - 0.5) * 26], k * 3); fph[k] = r(); }
      const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.BufferAttribute(fp, 3)); fg.setAttribute('aPh', new THREE.BufferAttribute(fph, 1));
      this.flies = new THREE.Points(fg, new THREE.ShaderMaterial({ uniforms: { uTime: GX.uTime, uPx: GX.uPx }, vertexShader: 'uniform float uTime,uPx;attribute float aPh;varying vec3 vC;varying float vA,vK;void main(){vec3 p=position;float t=uTime*.25+aPh*40.;p+=vec3(sin(t*1.3)*2.4,sin(t*.9)*1.6,cos(t*1.1)*2.4);vec4 mv=modelViewMatrix*vec4(p,1.);gl_PointSize=5.5*uPx*(34./-mv.z);vC=vec3(.8,1.,.55);vA=.5+.5*sin(uTime*2.4+aPh*50.);vK=0.;gl_Position=projectionMatrix*mv;}', fragmentShader: STAR_FS, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending })); this.flies.frustumCulled = false; this.flies.renderOrder = 8; this.scene.add(this.flies);
      const pn = small ? 160 : 380, pp = new Float32Array(pn * 3), pph = new Float32Array(pn); for (let k = 0; k < pn; k++) { pp.set([(r() - 0.5) * 12, r() * 10, (r() - 0.5) * 12], k * 3); pph[k] = r(); }
      const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pp, 3)); pg.setAttribute('aPh', new THREE.BufferAttribute(pph, 1));
      this.petalMat = new THREE.ShaderMaterial({ uniforms: { uTime: GX.uTime, uPx: GX.uPx, uB: { value: 0 } }, vertexShader: 'uniform float uTime,uPx,uB;attribute float aPh;varying vec3 vC;varying float vA,vK;void main(){vec3 p=position;p.y=mod(p.y-uTime*(.5+aPh*.6),10.5)+.3;p.x+=sin(uTime*.7+aPh*20.+p.y)*.9;p.z+=cos(uTime*.6+aPh*17.+p.y)*.9;vec4 mv=modelViewMatrix*vec4(p,1.);gl_PointSize=6.*uPx*(34./-mv.z)*(.6+aPh*.8);vC=mix(vec3(1.,.6,.8),vec3(1.,.9,.6),aPh);vA=uB*(.4+.6*sin(uTime*1.7+aPh*30.));vK=0.;gl_Position=projectionMatrix*mv;}', fragmentShader: STAR_FS, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
      this.petals = new THREE.Points(pg, this.petalMat); this.petals.frustumCulled = false; this.petals.renderOrder = 8; this.scene.add(this.petals);
      const moon = new THREE.Sprite(glowMat('#e8fff0', 0.9, true)); moon.scale.set(36, 36, 1); moon.position.set(-60, 42, -90); this.scene.add(moon);
      this.grow = 0; this.camTarget = new THREE.Vector3(0, 6.6, 0); this.sel = -1; this.burst = new Burst(this.scene);
      this.meta.hint = 'Glisse pour tourner autour de l\'arbre · touche une lumière pour la lire'; this.meta.chips = this.items.map((t, k) => `Lumière ${k + 1}`);
    }
    onEnter() { GX.tween(this, { grow: 1.1 }, 6500, { ease: ease.inOutSine }); GX.tween(this.rig, { dist: 31 }, 4800, { ease: ease.out }); GX.audio.whoosh(2.4, true, 0.2); }
    focusItem(k) {
      if (k < 0 || k >= this.total) return; this.sel = k; const L = this.lights[k]; this.showText(k, this.items[k]); this.burst.emit(L.p, '#ffe9a0', 90, 3.5);
      const rp = this.ripples[this.rippleI++ % 3]; rp.set(L.p.x * 0.6, L.p.z * 0.6, GX.T, 1); GX.cancelTweens(this.rig); GX.tween(this.rig, { dist: 11 }, 1400, { ease: ease.out });
    }
    onReaderClosed() { this.sel = -1; GX.tween(this.rig, { dist: 31 }, 1600, { ease: ease.inOut }); }
    onTapEmpty() { if (ui().reader.open) ui().reader.hide(); }
    onWorldComplete() { GX.tween(this.mat.uniforms.uBloom, { value: 1 }, 4200); GX.tween(this.matR.uniforms.uBloom, { value: 1 }, 4200); GX.tween(this.leafMat.uniforms.uBloom, { value: 1 }, 4200); GX.tween(this.petalMat.uniforms.uB, { value: 1 }, 3500); GX.tween(this.domeMat.uniforms.uInt, { value: 1.5 }, 4000); this.lights.forEach(L => this.burst.emit(L.p, '#ffd9a0', 40, 3)); }
    tick(dt, T) {
      const g = this.grow; this.mat.uniforms.uGrow.value = g; this.matR.uniforms.uGrow.value = g; this.leafMat.uniforms.uGrow.value = g;
      this.lights.forEach((L, k) => { const rd = this.read.has(k); L.lit += ((rd ? 1 : 0) - L.lit) * Math.min(1, dt * 3); const v = smooth(clamp((g - 0.85) / 0.25)), hov = this.hover === k ? 1 : 0, pu = 1 + 0.18 * Math.sin(T * 2.2 + L.ph); L.glow.material.opacity = v; L.core.material.opacity = v; L.glow.scale.setScalar((2.2 + L.lit * 1.4 + hov * 1.4) * pu); L.glow.material.color.set('#fff2c0').lerp(new THREE.Color(this.pal[0]), (1 - L.lit) * 0.5); });
      if (this.sel >= 0) this.camTarget.copy(this.lights[this.sel].p); else this.camTarget.set(0, 6.6, 0); this.rig.target.lerp(this.camTarget, Math.min(1, dt * 2.6));
      this.treeMesh.rotation.y = Math.sin(T * 0.05) * 0.04; this.reflMesh.rotation.y = this.treeMesh.rotation.y;
    }
  }

  /* =========================================================
     6. VOYAGE À TRAVERS LES PORTES D'ÉTOILES  (future)
     ========================================================= */
  class TunnelWorld extends World {
    constructor(star, i) { super(star, i, 'tunnel', 'tunnel', 'future'); }
    pathX(d) { return Math.sin(d * 0.045) * 3.4; }
    pathY(d) { return Math.cos(d * 0.033) * 2.1; }
    async build() {
      const P = this.pal, st = this.star, r = rng(hash(st.title)), n = this.total, GAP = 30; this.items = this.items.slice(0, 8);
      makeDome(this, '#140a44', '#5a2a9a', '#c07aff', 0.62); makeStarDome(this, 1800, P[1]);
      this.L = (n + 1) * GAP; this.GAP = GAP; this.gates = [];
      const glow = GX.hub.glowTex;
      this.items.forEach((txt, k) => {
        const d = (k + 1) * GAP, grp = new THREE.Group(); grp.position.set(this.pathX(d), this.pathY(d), -d); this.scene.add(grp);
        const N = 280, pos = new Float32Array(N * 3), col = new Float32Array(N * 3), c = new THREE.Color();
        for (let j = 0; j < N; j++) { const a = j / N * TAU, rad = 4.7 + (r() - 0.5) * 0.35; pos.set([Math.cos(a) * rad, Math.sin(a) * rad, (r() - 0.5) * 0.6], j * 3); c.set(P[j % 3]); col.set([c.r, c.g, c.b], j * 3); }
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
        const ring = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.34, map: glow, vertexColors: true, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, sizeAttenuation: true })); ring.renderOrder = 6; grp.add(ring);
        const halo = new THREE.Sprite(glowMat(P[k % 3], 0.5, true)); halo.scale.set(13, 13, 1); halo.renderOrder = 4; grp.add(halo);
        const tt = textTexture(txt, { maxW: 760, font: 'italic 400 54px "Cormorant Garamond", Georgia, serif', glow: 'rgba(255,255,255,.55)', glowBlur: 14, pad: 30 }), w = 7.2;
        const txtMesh = new THREE.Mesh(new THREE.PlaneGeometry(w, w / tt.aspect), new THREE.MeshBasicMaterial({ map: tt.tex, transparent: true, opacity: 0, depthWrite: false, depthTest: false })); txtMesh.renderOrder = 9; grp.add(txtMesh);
        this.gates.push({ grp, ring, halo, txt: txtMesh, d, passed: false, k });
      });
      /* particules du tunnel + traînées de vitesse */
      const TN = small ? 1500 : 3400, tp = new Float32Array(TN * 3), tc = new Float32Array(TN * 3), cc = new THREE.Color();
      for (let k = 0; k < TN; k++) { const d = -30 + r() * (this.L + 140), a = r() * TAU, rad = 6 + Math.pow(r(), 0.65) * 17; tp.set([this.pathX(d) + Math.cos(a) * rad, this.pathY(d) + Math.sin(a) * rad, -d], k * 3); cc.set(P[Math.floor(r() * 3)]).lerp(new THREE.Color('#ffffff'), 0.25); tc.set([cc.r, cc.g, cc.b], k * 3); }
      const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.BufferAttribute(tp, 3)); tg.setAttribute('color', new THREE.BufferAttribute(tc, 3));
      this.tunnel = new THREE.Points(tg, new THREE.PointsMaterial({ size: 0.22, map: glow, vertexColors: true, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, sizeAttenuation: true })); this.tunnel.frustumCulled = false; this.tunnel.renderOrder = 3; this.scene.add(this.tunnel);
      const LN = small ? 260 : 520, lp = new Float32Array(LN * 6), le = new Float32Array(LN * 2);
      for (let k = 0; k < LN; k++) { const d = r() * (this.L + 100), a = r() * TAU, rad = 3 + r() * 16, x = this.pathX(d) + Math.cos(a) * rad, y = this.pathY(d) + Math.sin(a) * rad; lp.set([x, y, -d, x, y, -d], k * 6); le[k * 2] = 0; le[k * 2 + 1] = 1; }
      const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(lp, 3)); lg.setAttribute('aE', new THREE.BufferAttribute(le, 1));
      this.speedMat = new THREE.ShaderMaterial({ uniforms: { uS: { value: 0 }, uC: { value: new THREE.Color(P[1]) } }, vertexShader: 'uniform float uS;attribute float aE;varying float vA;void main(){vec3 p=position;p.z+=aE*uS*7.;vA=(1.-aE)*clamp(uS,0.,1.);gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}', fragmentShader: 'uniform vec3 uC;varying float vA;void main(){gl_FragColor=vec4(mix(uC,vec3(1.),.4)*vA*.7,1.);}', transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
      this.speedLines = new THREE.LineSegments(lg, this.speedMat); this.speedLines.frustumCulled = false; this.speedLines.renderOrder = 5; this.scene.add(this.speedLines);
      /* destination : un soleil et ses anneaux */
      const D = this.L + 34; this.dest = new THREE.Group(); this.dest.position.set(this.pathX(D), this.pathY(D), -D); this.scene.add(this.dest);
      const sun = new THREE.Sprite(glowMat('#ffe3b0', 1, true)); sun.scale.set(70, 70, 1); sun.renderOrder = 2; this.dest.add(sun); const sun2 = new THREE.Sprite(glowMat(P[2], 0.8, true)); sun2.scale.set(130, 130, 1); sun2.renderOrder = 1; this.dest.add(sun2);
      for (let k = 0; k < 3; k++) { const N = 220, pos = new Float32Array(N * 3); for (let j = 0; j < N; j++) { const a = j / N * TAU, rad = 8 + k * 3.2; pos.set([Math.cos(a) * rad, Math.sin(a) * rad * 0.35, Math.sin(a) * rad * 0.2], j * 3); } const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); const ring = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.28, map: glow, color: P[k], transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, sizeAttenuation: true })); ring.rotation.z = 0.3 + k * 0.25; this.dest.add(ring); }
      const ft = textTexture(`${st.title}`, { maxW: 900, font: 'italic 300 100px "Cormorant Garamond", Georgia, serif', glow: 'rgba(255,230,180,.9)', glowBlur: 30, color: '#fff6e4', extra: 60 }); const fm = new THREE.Mesh(new THREE.PlaneGeometry(22, 22 / ft.aspect), new THREE.MeshBasicMaterial({ map: ft.tex, transparent: true, opacity: 0, depthWrite: false, depthTest: false })); fm.position.z = 6; fm.renderOrder = 9; this.dest.add(fm); this.finalText = fm;
      this.d = 0; this.dT = 0; this.v = 0; this.cruise = false; this.sm = { x: 0, y: 0 }; this.burst = new Burst(this.scene, 300); this.keys = {};
      this.camera.position.set(this.pathX(0), this.pathY(0), 0);
      this.meta.hint = 'Fais défiler ou glisse vers le haut pour avancer · ↑ ↓ au clavier · chaque porte garde un souhait'; this.meta.chips = this.items.map((t, k) => `Porte ${k + 1}`);
    }
    onEnter() {
      const box = $('w-extra'); box.innerHTML = '';
      const bar = GX.util.el('div', 'tun-bar ui', '<button type="button" class="tun-go ui" aria-label="Voyage automatique">▶ Voyage automatique</button><div class="tun-track"><i></i></div>'); box.appendChild(bar);
      this.bar = { go: bar.querySelector('.tun-go'), fill: bar.querySelector('.tun-track i'), track: bar.querySelector('.tun-track') };
      this.gates.forEach(g => { const m = GX.util.el('b', '', ''); m.style.left = (g.d / (this.L + 26) * 100) + '%'; this.bar.track.appendChild(m); g.mark = m; });
      this.bar.go.onclick = () => { this.cruise = !this.cruise; this.bar.go.textContent = this.cruise ? '❚❚ Pause' : '▶ Voyage automatique'; };
      this.disposables.push(() => { box.innerHTML = ''; });
      const kd = e => { this.keys[e.key] = true; if (e.key === ' ') { this.cruise = !this.cruise; e.preventDefault(); } }, ku = e => { this.keys[e.key] = false; };
      addEventListener('keydown', kd); addEventListener('keyup', ku); this.disposables.push(() => { removeEventListener('keydown', kd); removeEventListener('keyup', ku); });
      this.cruise = true; this.bar.go.textContent = '❚❚ Pause'; this.cruiseTo = this.gates.length ? this.gates[0].d - 8 : 10;
    }
    onDrag(dx, dy) { this.cruise = false; if (this.bar) this.bar.go.textContent = '▶ Voyage automatique'; this.dT = clamp(this.dT - dy * 0.1, 0, this.L + 26); }
    onWheel(d) { this.cruise = false; if (this.bar) this.bar.go.textContent = '▶ Voyage automatique'; this.dT = clamp(this.dT + d * 0.045, 0, this.L + 26); }
    focusItem(k) { const g = this.gates[k]; if (!g) return; this.cruise = false; this.dT = clamp(g.d - 8, 0, this.L + 26); GX.audio.whoosh(1.6, true, 0.25); }
    onTap() { /* pas de picking dans ce monde */ }
    onMove() { /* idem */ }
    tick(dt, T) {
      const k = this.keys; if (k.ArrowUp || k.w || k.W) { this.dT = clamp(this.dT + dt * 11, 0, this.L + 26); this.cruise = false; } if (k.ArrowDown || k.s || k.S) { this.dT = clamp(this.dT - dt * 11, 0, this.L + 26); this.cruise = false; }
      if (this.cruise) { this.dT = Math.min(this.L + 26, this.dT + dt * 5.2); if (this.dT >= this.L + 26) this.cruise = false; }
      const prev = this.d; this.d += (this.dT - this.d) * Math.min(1, dt * 2.2); this.v = (this.d - prev) / Math.max(dt, 1e-4);
      const d = this.d, ahead = d + 9; this.sm.x += (GX.input.x - this.sm.x) * 0.05; this.sm.y += (GX.input.y - this.sm.y) * 0.05;
      this.camera.position.set(this.pathX(d), this.pathY(d), -d); this.camera.lookAt(this.pathX(ahead) + this.sm.x * 5, this.pathY(ahead) + this.sm.y * 3, -ahead);
      this.camera.fov = lerp(this.camera.fov, 55 + Math.min(22, Math.abs(this.v) * 1.1), 0.08); this.camera.updateProjectionMatrix(); this.speedMat.uniforms.uS.value = clamp(Math.abs(this.v) / 14, 0, 1.4);
      this.gates.forEach(g => {
        const ahead2 = g.d - d, a = smooth(clamp((24 - ahead2) / 12)) * smooth(clamp((ahead2 + 3.5) / 3)); g.txt.material.opacity = a; g.ring.rotation.z = T * 0.15 * (g.k % 2 ? -1 : 1); g.halo.material.opacity = 0.25 + 0.4 * smooth(clamp((40 - Math.abs(ahead2)) / 40));
        if (!g.passed && ahead2 < 1.5) { g.passed = true; this.burst.emit(g.grp.position, this.pal[g.k % 3], 120, 6); this.markRead(g.k); if (g.mark) g.mark.classList.add('on'); }
      });
      this.bar.fill.style.width = (clamp(d / (this.L + 26)) * 100).toFixed(1) + '%';
      const f = smooth(clamp((d - (this.L - 6)) / 22)); this.finalText.material.opacity = f; this.finalText.quaternion.copy(this.camera.quaternion);
      this.dest.children[0].scale.setScalar(70 * (1 + 0.04 * Math.sin(T * 1.4))); const near = 0.2 + 0.8 * smooth(clamp(d / (this.L + 10))); this.dest.children[0].material.opacity = near; this.dest.children[1].material.opacity = 0.8 * near;
      this.tunnel.rotation.z = Math.sin(T * 0.07) * 0.02;
    }
  }

  /* =========================================================
     7. LA LETTRE — dans un cœur 3D qui bat
     ========================================================= */
  const LETTER_VS = `
  uniform float uTime,uPx,uBeat,uDim,uGold;attribute float aPh,aD,aS;varying vec3 vC;varying float vA,vK;
  void main(){
    vec3 p=position*(1.+.055*uBeat);
    p+=vec3(sin(uTime*.6+aPh*30.),cos(uTime*.5+aPh*22.),sin(uTime*.45+aPh*17.))*.05;
    vec4 mv=modelViewMatrix*vec4(p,1.);
    gl_PointSize=aS*uPx*(34./-mv.z)*(1.5+.5*uBeat*(1.-aD));
    vec3 core=mix(vec3(1.,.82,.55),vec3(1.,.5,.7),smoothstep(.0,.55,aD));
    vec3 rim=mix(vec3(.95,.12,.32),vec3(.7,.2,.95),smoothstep(.7,1.,aD)*.6);
    vC=mix(mix(core,rim,smoothstep(.35,.95,aD)),vec3(1.,.82,.48),uGold*.7);
    vA=(.55+.45*sin(uTime*1.7+aPh*40.))*(1.-uDim*.25)*(1.2+.8*uBeat);vK=0.;
    gl_Position=projectionMatrix*mv;
  }`;
  class LetterWorld extends World {
    constructor() {
      const L = GX.config.letter || { paragraphs: [], signoff: '' };
      super({ title: L.title || 'La lettre', kicker: 'Le cœur', accent: '#ff7aa8', items: [...(L.paragraphs || []), L.signoff].filter(Boolean), text: '' }, 0, 'letter', 'letter', 'letter');
      this.letter = L; this.cur = -1;
    }
    async build() {
      const P = this.pal, r = rng(2026); makeDome(this, '#2a0618', '#8a1a52', '#ff6a9a', 0.7); makeStarDome(this, 1700, P[1]);
      this.rig = new GX.OrbitRig(this.camera, { dist: 34, minDist: 9, maxDist: 24, pitch: 0.08, pitchLim: 0.5, auto: 0.09 });
      const N = small ? 4200 : 10500, pos = new Float32Array(N * 3), ph = new Float32Array(N), dd = new Float32Array(N), ss = new Float32Array(N), S = 5.6; let n = 0, guard = 0;
      while (n < N && guard++ < N * 40) {
        const x = (r() * 2.6 - 1.3), y = (r() * 2.6 - 1.25), f = Math.pow(x * x + y * y - 1, 3) - x * x * y * y * y;
        if (f > 0) continue; const q = clamp(-f), surface = n % 3 === 0; if (surface && q > 0.1) continue;
        const thick = 0.62 * Math.pow(q, 0.42) + 0.04; pos.set([x * S, y * S + 0.3, (r() * 2 - 1) * thick * S], n * 3); dd[n] = clamp(Math.hypot(x * 0.85, y * 0.85 - 0.1) / 1.25); ph[n] = r(); ss[n] = surface ? 1.8 + r() * 1.6 : 1.1 + r() * 2.2; n++;
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, n * 3), 3)); g.setAttribute('aPh', new THREE.BufferAttribute(ph.subarray(0, n), 1)); g.setAttribute('aD', new THREE.BufferAttribute(dd.subarray(0, n), 1)); g.setAttribute('aS', new THREE.BufferAttribute(ss.subarray(0, n), 1));
      this.mat = new THREE.ShaderMaterial({ uniforms: { uTime: GX.uTime, uPx: GX.uPx, uBeat: { value: 0 }, uDim: { value: 0 }, uGold: { value: 0 } }, vertexShader: LETTER_VS, fragmentShader: STAR_FS, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
      this.heart = new THREE.Points(g, this.mat); this.heart.frustumCulled = false; this.heart.renderOrder = 6; this.scene.add(this.heart);
      const halo = new THREE.Sprite(glowMat('#ff5d8f', 0.5, true)); halo.scale.set(30, 30, 1); halo.position.z = -3; halo.renderOrder = 2; this.scene.add(halo); this.halo = halo;
      this.burst = new Burst(this.scene, 360); this.pulse = 0;
      const fn = small ? 80 : 160, fp = new Float32Array(fn * 3); for (let k = 0; k < fn; k++) fp.set([(r() - 0.5) * 40, (r() - 0.5) * 24, (r() - 0.5) * 30], k * 3);
      this.motes = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(fp, 3)), new THREE.PointsMaterial({ size: 0.16, map: GX.hub.glowTex, color: '#ffd9e8', transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false })); this.motes.renderOrder = 7; this.scene.add(this.motes);
      this.total = this.items.length; this.meta.title = this.letter.title || 'La lettre'; this.meta.kicker = 'Le cœur'; this.meta.hint = 'Touche l\'écran, → ou Espace pour continuer';
      this.meta.chips = this.items.map((t, k) => (k === this.items.length - 1 && this.letter.signoff ? 'Signature' : `Paragraphe ${k + 1}`));
    }
    onEnter() {
      GX.tween(this.rig, { dist: 17 }, 3600, { ease: ease.out });
      const st = GX.util.el('div', 'letter-stage', '<div class="ls-card"></div><div class="ls-nav ui"><button type="button" class="ls-prev ui" aria-label="Précédent">‹</button><span class="ls-dots"></span><button type="button" class="ls-next ui" aria-label="Suivant">›</button></div>');
      document.body.appendChild(st); this.st = st; this.disposables.push(() => st.remove());
      const dots = st.querySelector('.ls-dots'); this.items.forEach(() => dots.appendChild(document.createElement('i')));
      st.querySelector('.ls-prev').onclick = () => this.focusItem(this.cur - 1); st.querySelector('.ls-next').onclick = () => this.focusItem(this.cur + 1);
      const kd = e => { if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter') { e.preventDefault(); this.focusItem(this.cur + 1); } else if (e.key === 'ArrowLeft') this.focusItem(this.cur - 1); };
      addEventListener('keydown', kd); this.disposables.push(() => removeEventListener('keydown', kd));
      setTimeout(() => this.focusItem(0), 2600);
    }
    onTap(e) { if (e.target && e.target.closest && e.target.closest('.ui')) return; this.focusItem(this.cur + 1); }
    onMove() { /* pas de picking */ }
    focusItem(k) {
      if (k < 0 || k >= this.total || k === this.cur && k !== 0) return; this.cur = k; const card = this.st.querySelector('.ls-card'), last = this.letter.signoff && k === this.total - 1;
      card.classList.remove('in'); card.classList.toggle('sign', !!last); void card.offsetWidth;
      let c = 0; card.innerHTML = `<p>${String(this.items[k]).split(' ').map(w => `<span style="--d:${Math.min(c++ * 0.07, 3.4).toFixed(2)}s">${w.replace(/[&<>]/g, '')}</span>`).join(' ')}</p>`; card.classList.add('in');
      this.st.querySelectorAll('.ls-dots i').forEach((d, j) => d.classList.toggle('on', j <= k)); this.st.querySelector('.ls-prev').style.visibility = k > 0 ? 'visible' : 'hidden'; this.st.querySelector('.ls-next').style.visibility = k < this.total - 1 ? 'visible' : 'hidden';
      this.pulse = 1; this.burst.emit(new THREE.Vector3(0, 0.3, 0), last ? '#ffe0a0' : '#ff8ab0', last ? 160 : 70, last ? 6 : 4); GX.audio.chime(last ? 6 : 3, 0.3);
      if (last) GX.tween(this.mat.uniforms.uGold, { value: 1 }, 3500);
      this.markRead(k); this.onChip && this.onChip(k, 'read');
    }
    onWorldComplete() { /* l'invite « retour au cœur » est affichée par l'app */ }
    tick(dt, T) {
      const BEAT = 2.1, ph = (T % BEAT) / BEAT, env = Math.exp(-Math.pow((ph - 0.04) / 0.045, 2)) + 0.62 * Math.exp(-Math.pow((ph - 0.2) / 0.05, 2));
      this.pulse *= Math.exp(-dt * 1.6); this.mat.uniforms.uBeat.value = Math.min(1.4, env + this.pulse * 0.9); this.mat.uniforms.uDim.value = this.cur >= 0 ? 1 : 0;
      this.halo.material.opacity = 0.32 + 0.22 * env + this.pulse * 0.2; this.heart.rotation.y = Math.sin(T * 0.18) * 0.5; this.motes.rotation.y = T * 0.015;
      this.rig.target.set(0, 0.3, 0);
    }
  }

  /* ---------- registre ---------- */
  const MAP = { planet: PlanetWorld, gallery: GalleryWorld, cinema: CinemaWorld, constellation: ConstellationWorld, tree: TreeWorld, tunnel: TunnelWorld };
  async function fontsReady() { if (document.fonts && document.fonts.ready) await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 900))]); }
  GX.worlds = {
    async create(star, i) { await fontsReady(); const C = MAP[star.world] || PlanetWorld, w = new C(star, i); await w.build(); return w; },
    async createLetter() { await fontsReady(); const w = new LetterWorld(); await w.build(); return w; },
    classes: MAP,
  };
})();
