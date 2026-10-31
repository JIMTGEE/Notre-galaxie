/* ┌─ ★ CE QUE TU PEUX RÉGLER ICI (facultatif) ─────────────────────────────────────────────────┐
   │  MOODS   l'ambiance sonore générée de chaque lieu (note de base en Hz, accord, brillance,   │
   │          volume) — cherche  const MOODS                                                     │
   │  Pour une vraie musique : dépose  assets/audio/musique.mp3  (voir PERSONNALISER.md)         │
   └──────────────────────────────────────────────────────────────────────────────────────────┘ */
/* =========================================================
   engine.js — fondations partagées de « Notre petite galaxie »
   • GX.util      : maths, easing, RNG déterministe, helpers DOM
   • GX.config    : contenu envoyé par index.php (data.php)
   • GX.initGL    : rendu WebGL, bruit tuilable cuit sur le GPU
   • GX.tween/wait: horloge d'histoire (accélérable pour « Passer »)
   • GX.input     : souris / tactile / molette / pincement unifiés
   • GX.OrbitRig  : caméra orbitale à inertie
   • GX.audio     : synthèse sonore (ambiances, notes, whoosh)
   • GX.start     : boucle d'animation + qualité adaptative
   ========================================================= */
(() => {
  'use strict';
  const GX = (window.GX = window.GX || {});
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  /* ---------- utilitaires ---------- */
  GX.util = {
    TAU, clamp, lerp,
    smooth: x => { x = clamp(x); return x * x * (3 - 2 * x); },
    ease: {
      linear: p => p,
      inOut: p => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2),
      inOutSine: p => -(Math.cos(Math.PI * p) - 1) / 2,
      out: p => 1 - Math.pow(1 - p, 3),
      outQuart: p => 1 - Math.pow(1 - p, 4),
      in: p => p * p * p,
      outBack: p => { const c = 1.70158; return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); },
    },
    rng(seed) {
      let a = seed >>> 0;
      return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    },
    hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; },
    gauss: (r = Math.random) => r() + r() + r() - 1.5,
    $: id => document.getElementById(id),
    el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; },
    roman: n => ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'][n] || String(n),
  };
  const { ease } = GX.util;

  GX.env = {
    reduce: matchMedia('(prefers-reduced-motion: reduce)').matches,
    small: innerWidth < 640,
    coarse: matchMedia('(pointer: coarse)').matches,
  };

  /* ---------- configuration (JSON injecté par index.php) ---------- */
  GX.config = (() => {
    const fallback = { site: {}, stars: [], letter: { paragraphs: [], signoff: '' }, intro: { lines: [] }, portrait: { enabled: false }, worlds: {} };
    try { return Object.assign(fallback, JSON.parse(document.getElementById('gx-config').textContent)); }
    catch (e) { console.error('Configuration illisible', e); return fallback; }
  })();

  /* ---------- événements ---------- */
  const listeners = {};
  GX.on = (e, fn) => { (listeners[e] = listeners[e] || []).push(fn); return () => { listeners[e] = listeners[e].filter(f => f !== fn); }; };
  GX.emit = (e, ...a) => (listeners[e] || []).slice().forEach(fn => { try { fn(...a); } catch (err) { console.error(err); } });

  /* ---------- horloge d'histoire : tweens + attentes, accélérables ---------- */
  GX.timeScale = 1;
  const tweens = [], waits = [];
  GX.tween = (obj, props, ms, opt = {}) => new Promise(res => {
    const t = { obj, props, from: {}, ms: Math.max(1, ms), delay: opt.delay || 0, ease: opt.ease || ease.inOut, t: 0, res, onUpdate: opt.onUpdate, started: false };
    tweens.push(t);
  });
  GX.cancelTweens = obj => { for (let i = tweens.length - 1; i >= 0; i--) if (tweens[i].obj === obj) { tweens[i].res(); tweens.splice(i, 1); } };
  GX.wait = ms => new Promise(res => waits.push({ t: 0, ms, res }));
  GX.finishAll = () => { GX.timeScale = 60; setTimeout(() => { GX.timeScale = 1; }, 400); };
  function stepStory(dt) {
    dt *= GX.timeScale * 1000;
    for (let i = tweens.length - 1; i >= 0; i--) {
      const t = tweens[i]; t.t += dt;
      if (t.t < t.delay) continue;
      if (!t.started) { t.started = true; for (const k in t.props) t.from[k] = t.obj[k]; }
      const p = clamp((t.t - t.delay) / t.ms), e = t.ease(p);
      for (const k in t.props) t.obj[k] = lerp(t.from[k], t.props[k], e);
      if (t.onUpdate) t.onUpdate(p);
      if (p >= 1) { tweens.splice(i, 1); t.res(); }
    }
    for (let i = waits.length - 1; i >= 0; i--) { const w = waits[i]; w.t += dt; if (w.t >= w.ms) { waits.splice(i, 1); w.res(); } }
  }

  /* ---------- rendu ---------- */
  GX.T = 0;
  GX.uTime = { value: 0 };
  GX.uPx = { value: 1 };
  const stages = [];
  GX.stage = null;
  let dpr = Math.min(window.devicePixelRatio || 1, 2), dprCap = dpr;

  const NOISE_FS = `
  varying vec2 vUv;
  float hash(vec2 p){vec3 p3=fract(vec3(p.xyx)*.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}
  float vn(vec2 p,float per,float seed){
    vec2 i=floor(p),f=fract(p);
    f=f*f*f*(f*(f*6.-15.)+10.);
    vec2 a=mod(i,per),b=mod(i+1.,per);
    float s=seed*17.31;
    return mix(mix(hash(a+s),hash(vec2(b.x,a.y)+s),f.x),mix(hash(vec2(a.x,b.y)+s),hash(b+s),f.x),f.y);
  }
  float fbm(vec2 uv,float base,float seed){
    float a=.5,s=0.,tot=0.,per=base;
    for(int i=0;i<7;i++){s+=a*vn(uv*per,per,seed+float(i)*1.7);tot+=a;a*=.5;per*=2.;}
    return s/tot;
  }
  float ridged(vec2 uv,float base,float seed){
    float a=.5,s=0.,tot=0.,per=base;
    for(int i=0;i<6;i++){float n=vn(uv*per,per,seed+float(i)*1.3);float d=2.*n-1.;n=1.-d*d;n*=n;s+=a*n;tot+=a;a*=.5;per*=2.;}
    return s/tot;
  }
  void main(){
    float r=fbm(vUv,4.,1.),g=fbm(vUv,3.,7.),b=ridged(vUv,4.,3.),a=fbm(vUv,5.,11.);
    r=clamp((r-.5)*1.7+.5,0.,1.);g=clamp((g-.5)*1.7+.5,0.,1.);a=clamp((a-.5)*1.7+.5,0.,1.);b=clamp(b*1.6,0.,1.);
    gl_FragColor=vec4(r,g,b,a);
  }`;

  GX.initGL = canvas => {
    try {
      GX.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    } catch (e) { return false; }
    const r = GX.renderer; r.setClearColor(0x05040d);
    GX.noise = new THREE.WebGLRenderTarget(512, 512, {
      wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping,
      minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat, type: THREE.UnsignedByteType, depthBuffer: false, stencilBuffer: false, generateMipmaps: true,
    });
    const bs = new THREE.Scene(), bc = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    bs.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}', fragmentShader: NOISE_FS, depthTest: false, depthWrite: false,
    })));
    r.setRenderTarget(GX.noise); r.render(bs, bc); r.setRenderTarget(null);
    GX.noiseTex = GX.noise.texture;
    applySize();
    addEventListener('resize', onResize);
    return true;
  };

  function applySize() {
    const r = GX.renderer; if (!r) return;
    r.setPixelRatio(dpr); GX.uPx.value = dpr; r.setSize(innerWidth, innerHeight, false);
  }
  function onResize() {
    applySize();
    stages.forEach(s => { if (s.camera) { s.camera.aspect = innerWidth / innerHeight; s.camera.updateProjectionMatrix(); } if (s.onResize) s.onResize(innerWidth, innerHeight); });
    GX.emit('resize');
  }
  GX.registerStage = s => { stages.push(s); if (s.camera) { s.camera.aspect = innerWidth / innerHeight; s.camera.updateProjectionMatrix(); } if (s.onResize) s.onResize(innerWidth, innerHeight); return s; };
  GX.unregisterStage = s => { const i = stages.indexOf(s); if (i >= 0) stages.splice(i, 1); };
  GX.setStage = s => { if (GX.stage && GX.stage.onLeave) GX.stage.onLeave(); GX.stage = s; if (s && s.onEnter) s.onEnter(); };

  /* qualité adaptative : si l'image saccade, la résolution baisse (jamais en boucle) */
  let ema = 16.7, frames = 0, cooldown = 0;
  function adapt(dtMs) {
    frames++;
    if (frames < 50 || dtMs > 250) return;
    ema += (dtMs - ema) * 0.06;
    if (--cooldown > 0) return;
    if (ema > 27 && dpr > 1) { dpr = Math.max(1, dpr - 0.25); dprCap = dpr; applySize(); cooldown = 90; ema = 16.7; }
    else if (ema > 36 && dpr <= 1 && dpr > 0.65) { dpr = Math.max(0.65, dpr - 0.15); dprCap = dpr; applySize(); cooldown = 90; ema = 16.7; }
  }
  GX.getDpr = () => dpr;

  let last = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = clamp((now - last) / 1000, 0, 0.1); last = now;
    adapt(dt * 1000);
    GX.T += dt * (GX.env.reduce ? 0.25 : 1);
    GX.uTime.value = GX.T;
    stepStory(dt);
    GX.input.step(dt);
    if (GX.stage) { GX.stage.update(dt, GX.T); GX.renderer.render(GX.stage.scene, GX.stage.camera); }
    GX.emit('frame', dt, GX.T);
  }
  GX.start = () => requestAnimationFrame(frame);

  /* ---------- entrées : souris, tactile, molette, pincement ---------- */
  const inp = (GX.input = {
    x: 0, y: 0, px: innerWidth / 2, py: innerHeight / 2, down: false, moved: 0, dragging: false,
    dx: 0, dy: 0, enabled: true, h: { drag: [], tap: [], wheel: [], move: [] },
    on(type, fn) { this.h[type].push(fn); return () => { this.h[type] = this.h[type].filter(f => f !== fn); }; },
    step() { this.dx = this.dy = 0; },
  });
  const ptrs = new Map();
  const isUI = e => e.target && e.target.closest && e.target.closest('button,a,input,select,textarea,video,.ui,[data-ui]');
  const call = (type, a, b) => inp.h[type].slice().forEach(fn => { try { fn(a, b); } catch (err) { console.error(err); } });
  addEventListener('pointerdown', e => {
    if (isUI(e) || !inp.enabled) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    inp.down = true; inp.moved = 0; inp.sx = e.clientX; inp.sy = e.clientY; inp.dragging = false;
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; inp.pinch = Math.hypot(a.x - b.x, a.y - b.y); }
  });
  addEventListener('pointermove', e => {
    inp.px = e.clientX; inp.py = e.clientY;
    if (e.pointerType === 'mouse' || e.pointerType === 'pen') { inp.x = e.clientX / innerWidth * 2 - 1; inp.y = -(e.clientY / innerHeight * 2 - 1); inp.hasPointer = true; }
    call('move', e);
    const p = ptrs.get(e.pointerId); if (!p || !inp.down) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      call('wheel', -(d - inp.pinch) * 2.4); inp.pinch = d; inp.moved += 20; return;
    }
    inp.moved += Math.abs(dx) + Math.abs(dy);
    if (inp.moved > 7) { inp.dragging = true; inp.dx += dx; inp.dy += dy; call('drag', dx, dy); }
  });
  const up = e => {
    const had = ptrs.delete(e.pointerId);
    if (had && inp.down && ptrs.size === 0) { if (inp.moved < 8 && e.type === 'pointerup') call('tap', e); inp.down = false; inp.dragging = false; }
  };
  addEventListener('pointerup', up); addEventListener('pointercancel', up);
  addEventListener('wheel', e => { if (isUI(e) && e.target.closest('.reader-body')) return; call('wheel', e.deltaY * (e.deltaMode === 1 ? 30 : 1)); }, { passive: true });

  /* ---------- caméra orbitale à inertie ---------- */
  GX.OrbitRig = class {
    constructor(camera, o = {}) {
      this.cam = camera; this.target = new THREE.Vector3(o.tx || 0, o.ty || 0, o.tz || 0);
      this.yaw = o.yaw || 0; this.pitch = o.pitch || 0; this.dist = o.dist || 20;
      this.minDist = o.minDist || 4; this.maxDist = o.maxDist || 60;
      this.yawLim = o.yawLim || Infinity; this.pitchLim = o.pitchLim || 1.2;
      this.vy = 0; this.vp = 0; this.auto = o.auto || 0; this.spring = o.spring || 0; this.sens = o.sens || 0.0042;
      this.ox = 0; this.oy = 0;                      // décalage de parallaxe (souris)
    }
    drag(dx, dy) { this.vy -= dx * this.sens * 60 * 0.35; this.vp += dy * this.sens * 60 * 0.35; }
    zoom(d) { this.dist = clamp(this.dist * Math.exp(d * 0.0011), this.minDist, this.maxDist); }
    update(dt) {
      this.yaw += this.vy * dt; this.pitch += this.vp * dt;
      const damp = Math.exp(-dt * 4.2); this.vy *= damp; this.vp *= damp;
      if (!inp.dragging && this.auto) this.yaw += this.auto * dt;
      if (this.yawLim !== Infinity) {
        this.yaw = clamp(this.yaw, -this.yawLim, this.yawLim);
        if (this.spring && !inp.dragging) this.yaw += (0 - this.yaw) * Math.min(1, dt * this.spring);
      }
      this.pitch = clamp(this.pitch, -this.pitchLim, this.pitchLim);
      if (this.spring && !inp.dragging) this.pitch += (0 - this.pitch) * Math.min(1, dt * this.spring);
      const cp = Math.cos(this.pitch), yaw = this.yaw + this.ox;
      this.cam.position.set(this.target.x + this.dist * Math.sin(yaw) * cp, this.target.y + this.dist * Math.sin(this.pitch + this.oy), this.target.z + this.dist * Math.cos(yaw) * cp);
      this.cam.lookAt(this.target);
    }
  };

  /* ---------- audio : ambiances génératives, notes, whoosh ---------- */
  GX.audio = (() => {
    let ctx, master, sfx, reverb, padBus, ready = false, muted = false, padNodes = [], musicEl, musicGain, mood = null;
    const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19];
    const MOODS = {
      hub:      { root: 130.81, chord: [0, 7, 12, 16, 19], cut: 900, vol: 0.05 },
      memory:   { root: 110.0,  chord: [0, 7, 12, 15, 19], cut: 760, vol: 0.055 },
      gallery:  { root: 146.83, chord: [0, 7, 14, 16, 21], cut: 1100, vol: 0.05 },
      cinema:   { root: 98.0,   chord: [0, 5, 12, 17, 19], cut: 650, vol: 0.05 },
      trait:    { root: 164.81, chord: [0, 7, 12, 16, 23], cut: 1300, vol: 0.045 },
      lesson:   { root: 123.47, chord: [0, 7, 12, 14, 19], cut: 980, vol: 0.05 },
      future:   { root: 138.59, chord: [0, 7, 12, 19, 24], cut: 1500, vol: 0.05 },
      letter:   { root: 116.54, chord: [0, 7, 12, 15, 19, 24], cut: 1000, vol: 0.06 },
      portrait: { root: 123.47, chord: [0, 7, 12, 19], cut: 700, vol: 0.045 },
    };
    const f = (root, semi) => root * Math.pow(2, semi / 12);
    function impulse(sec, decay) {
      const n = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, n, ctx.sampleRate);
      for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay); }
      return b;
    }
    function init() {
      if (ready) { if (ctx.state === 'suspended') ctx.resume(); return true; }
      try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return false; }
      master = ctx.createGain(); master.gain.value = muted ? 0 : 0.9; master.connect(ctx.destination);
      reverb = ctx.createConvolver(); reverb.buffer = impulse(3.2, 2.4);
      const rg = ctx.createGain(); rg.gain.value = 0.55; reverb.connect(rg); rg.connect(master);
      sfx = ctx.createGain(); sfx.gain.value = 0.9; sfx.connect(master); sfx.connect(reverb);
      padBus = ctx.createGain(); padBus.gain.value = 1; padBus.connect(master); padBus.connect(reverb);
      startMusic();
      ready = true; return true;
    }
    /* ----- musique : une liste de chansons jouées l'une après l'autre (fondu entre chaque) ----- */
    let order = [], idx = 0, fadeGain = null, fadingOut = false, failures = 0, started = false, current = null;
    const MUS = () => GX.config.music || {};
    const shuffled = a => { const r = a.slice(); for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };
    function fadeMusic(to, sec) {
      if (!fadeGain) return; const now = ctx.currentTime, g = fadeGain.gain;
      g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); g.linearRampToValueAtTime(to, now + Math.max(0.05, sec));
    }
    function playTrack(i) {
      const tracks = MUS().tracks || []; if (!tracks.length || !musicEl) return;
      idx = i; fadingOut = false; current = tracks[order[idx]];
      musicEl.src = current.src;
      const p = musicEl.play();
      const ok = () => { failures = 0; fadeMusic(1, 1.6); GX.emit('track', current, order[idx], tracks.length); };
      if (p && p.then) p.then(ok).catch(() => { /* lecture bloquée par le navigateur : reprendra au prochain geste */ }); else ok();
    }
    function nextTrack() {
      const tracks = MUS().tracks || []; if (!tracks.length) return;
      let n = idx + 1;
      if (n >= order.length) {
        if (MUS().loop === false) { current = null; return; }                           // fin de la liste, sans boucle
        n = 0; if (MUS().shuffle) order = shuffled(order);
      }
      playTrack(n);
    }
    function startMusic() {
      const el = document.getElementById('bg-music'), tracks = MUS().tracks || [];
      if (!el || !tracks.length || started) return;
      try {
        musicEl = el; el.loop = false; el.removeAttribute('loop');
        const src = ctx.createMediaElementSource(el);
        fadeGain = ctx.createGain(); fadeGain.gain.value = 0;
        musicGain = ctx.createGain(); musicGain.gain.value = MUS().volume != null ? MUS().volume : 0.55;
        src.connect(fadeGain); fadeGain.connect(musicGain); musicGain.connect(master);
        el.volume = 1; started = true;
        order = tracks.map((_, i) => i); if (MUS().shuffle) order = shuffled(order);
        el.addEventListener('ended', nextTrack);
        el.addEventListener('error', () => { failures++; if (failures < tracks.length) nextTrack(); });         // fichier illisible : on passe à la suivante
        el.addEventListener('timeupdate', () => { if (!fadingOut && el.duration && isFinite(el.duration) && el.duration - el.currentTime < 2.4 && el.duration > 6) { fadingOut = true; fadeMusic(0, 2.2); } });
        playTrack(0);
      } catch (e) { /* pas de musique */ }
    }
    function setMood(name) {
      if (!ready || name === mood) return; mood = name;
      const m = MOODS[name] || MOODS.hub, now = ctx.currentTime;
      padNodes.forEach(n => { n.g.gain.cancelScheduledValues(now); n.g.gain.setTargetAtTime(0, now, 1.4); n.oscs.forEach(o => o.stop(now + 7)); });
      const g = ctx.createGain(); g.gain.value = 0; g.connect(padBus);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = m.cut; lp.Q.value = 0.6; lp.connect(g);
      const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.07; lg.gain.value = m.cut * 0.35; lfo.connect(lg); lg.connect(lp.frequency); lfo.start();
      const oscs = [lfo];
      m.chord.forEach((semi, i) => {
        [-6, 6].forEach(det => {
          const o = ctx.createOscillator(); o.type = i % 2 ? 'triangle' : 'sawtooth'; o.frequency.value = f(m.root, semi); o.detune.value = det + (i - 2) * 2;
          const og = ctx.createGain(); og.gain.value = 0.22 / m.chord.length; o.connect(og); og.connect(lp); o.start(); oscs.push(o);
        });
      });
      g.gain.setTargetAtTime(m.vol, now, 2.2);
      padNodes = padNodes.filter(n => n.g !== g); padNodes.push({ g, oscs });
      if (padNodes.length > 3) padNodes.shift();
    }
    function pluck(freq, vel = 0.4, delay = 0, type = 'sine') {
      if (!ready || muted) return;
      const t = ctx.currentTime + delay, o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.value = freq; o2.type = 'triangle'; o2.frequency.value = freq * 2.003;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vel * 0.5, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
      const g2 = ctx.createGain(); g2.gain.value = 0.25; o.connect(g); o2.connect(g2); g2.connect(g); g.connect(sfx);
      o.start(t); o2.start(t); o.stop(t + 2.4); o2.stop(t + 2.4);
    }
    const note = (deg, vel, delay) => { const m = MOODS[mood] || MOODS.hub; pluck(f(m.root * 2, PENTA[((deg % PENTA.length) + PENTA.length) % PENTA.length] + 12 * Math.floor(deg / PENTA.length)), vel, delay); };
    function chime(n = 3, vel = 0.35) { for (let i = 0; i < n; i++) note(2 + i * 2 + Math.floor(Math.random() * 2), vel * (1 - i * 0.12), i * 0.09); }
    function whoosh(dur = 1.4, up = true, vol = 0.5) {
      if (!ready || muted) return;
      const t = ctx.currentTime, n = Math.floor(ctx.sampleRate * dur), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      const s = ctx.createBufferSource(); s.buffer = b;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.4;
      bp.frequency.setValueAtTime(up ? 250 : 3000, t); bp.frequency.exponentialRampToValueAtTime(up ? 3200 : 220, t + dur * 0.85);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.45); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(bp); bp.connect(g); g.connect(sfx); s.start(t);
    }
    function tick(vol = 0.12) { pluck(1480 + Math.random() * 200, vol, 0, 'triangle'); }
    function setMuted(m) { muted = m; if (ready) master.gain.setTargetAtTime(m ? 0 : 0.9, ctx.currentTime, 0.2); if (musicEl && musicEl.src) { if (m) musicEl.pause(); else { fadingOut = false; musicEl.play().catch(() => {}); fadeMusic(1, 0.6); } } }
    function duck(on) { if (musicGain) musicGain.gain.setTargetAtTime(on ? 0.08 : (MUS().volume != null ? MUS().volume : 0.55), ctx.currentTime, 0.4); if (padBus) padBus.gain.setTargetAtTime(on ? 0.3 : 1, ctx.currentTime, 0.4); }
    return { init, setMood, pluck, note, chime, whoosh, tick, setMuted, duck, nextTrack, get track() { return current; }, get muted() { return muted; }, get ready() { return ready; } };
  })();
})();
