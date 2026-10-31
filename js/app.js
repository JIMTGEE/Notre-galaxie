/* ┌─ ★ CE QUE TU PEUX RÉGLER ICI (tout est facultatif — la vraie histoire est dans data.php) ─┐
   │  HUB_ZOOM            recul de la caméra dans le cœur (1.1 ; plus grand = plus loin)       │
   │  messages de chargement   cherche  'Allumer la nébuleuse', 'Dessiner le ciel', …          │
   │  textes d'aide / messages cherche  'Choisis une étoile', 'Il reste', 'Lire quand même',    │
   │                           'Toutes les étoiles sont allumées', 'Glisse pour tourner'        │
   │  durée d'affichage du portrait  cherche  'first ? 6400 : 2600'  (millisecondes)            │
   └──────────────────────────────────────────────────────────────────────────────────────────┘ */
/* =========================================================
   app.js — chef d'orchestre
   porte d'entrée → ouverture cinématique → cœur (hub)
   → voyages vers chaque étoile (mondes) → lettre
   ========================================================= */
(() => {
  'use strict';
  const GX = window.GX, { clamp, lerp, $, el, roman, ease } = GX.util;
  const cfg = GX.config, site = cfg.site || {}, stars = cfg.stars || [];
  const app = (GX.app = { state: 'loading', busy: false, world: null, hasPortrait: false });
  const LS = { disc: 'sakina-galaxie-discovered', intro: 'gx-intro-v2', muted: 'gx-muted' };
  /* « toujours comme la première fois » : l'introduction vue et les étoiles allumées ne sont ni relues ni mémorisées */
  const FRESH = !cfg.site || cfg.site.always_fresh !== false, VOLATILE = [LS.disc, LS.intro, 'gx-all-lit'];
  const store = {
    get(k) { if (FRESH && VOLATILE.includes(k)) return null; try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { if (FRESH && VOLATILE.includes(k)) return; try { localStorage.setItem(k, v); } catch (e) { /* ok */ } },
  };
  if (FRESH) { try { VOLATILE.forEach(k => localStorage.removeItem(k)); localStorage.removeItem('sakina-intro-seen'); } catch (e) { /* ok */ } }
  const discovered = new Set(); try { JSON.parse(store.get(LS.disc) || '[]').forEach(x => discovered.add(x)); } catch (e) { /* ok */ }
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pause = ms => new Promise(r => setTimeout(r, ms));
  const setBody = s => { document.body.dataset.state = s; app.state = s; };

  /* =========================================================
     UI : texte cinématique, toasts, indices, lecteur
     ========================================================= */
  const words = txt => String(txt).split(' ').map((w, wi, arr) => `<span class="w">${[...w].map((c, i) => `<span style="--i:${wi * 4 + i}">${esc(c)}</span>`).join('')}</span>`).join(' ');
  const HUB_ZOOM = 1.1;
  const ui = (GX.ui = {
    say({ kicker, title, sub, size = 'lg', pos = 'center' }) {
      const t = $('stage-text'); t.className = `stage-text ${size} pos-${pos}`;
      t.innerHTML = (kicker ? `<p class="st-kicker">${esc(kicker)}</p>` : '') + (title ? `<h2 class="st-title">${words(title)}</h2>` : '') + (sub ? `<p class="st-sub">${esc(sub)}</p>` : '');
      void t.offsetWidth; t.classList.add('show');
    },
    sayOut() { const t = $('stage-text'); t.classList.remove('show'); t.classList.add('out'); },
    toast(msg, ms = 4200, action) {
      const t = $('toast'); t.innerHTML = `<span>${esc(msg)}</span>` + (action ? `<button type="button" class="ui">${esc(action.label)}</button>` : '');
      if (action) t.querySelector('button').onclick = () => { t.classList.remove('on'); action.fn(); };
      t.classList.add('on'); clearTimeout(ui._tt); ui._tt = setTimeout(() => t.classList.remove('on'), ms);
    },
    hint(text) { const h = $('hint'); if (!text) { h.classList.remove('on'); return; } h.textContent = text; h.classList.add('on'); },
    chapter(num, title, sub) {
      const c = $('chapter-card'); c.innerHTML = `<span class="cc-num">${esc(num)}</span><h2>${esc(title)}</h2><p>${esc(sub || '')}</p>`;
      c.classList.remove('show'); void c.offsetWidth; c.classList.add('show');
    },
  });

  /* lecteur de texte (fragments, lettres…) */
  const rd = $('reader');
  let rdCb = {};
  ui.reader = {
    show({ kicker, title, paras, index, count, accent, onPrev, onNext, onClose }) {
      rdCb = { onPrev, onNext, onClose };
      rd.style.setProperty('--accent', accent || '#E9C988');
      $('reader-kicker').textContent = kicker || '';
      $('reader-title').textContent = title || '';
      $('reader-title').hidden = !title;
      let n = 0; const body = $('reader-body');
      body.innerHTML = (paras || []).map(p => `<p>${String(p).split(' ').map(w => `<span style="--d:${Math.min(n++ * 0.035, 2.4).toFixed(2)}s">${esc(w)}</span>`).join(' ')}</p>`).join('');
      body.scrollTop = 0;
      $('reader-count').textContent = count > 1 ? `${index + 1} / ${count}` : '';
      $('reader-prev').hidden = !onPrev; $('reader-next').hidden = !onNext;
      rd.hidden = false; rd.classList.remove('open'); void rd.offsetWidth; rd.classList.add('open');
    },
    hide(silent) { rd.classList.remove('open'); clearTimeout(ui.reader._t); ui.reader._t = setTimeout(() => { rd.hidden = true; }, 450); if (!silent && rdCb.onClose) rdCb.onClose(); rdCb = {}; },
    get open() { return rd.classList.contains('open'); },
  };
  $('reader-close').onclick = () => ui.reader.hide();
  $('reader-prev').onclick = () => rdCb.onPrev && rdCb.onPrev();
  $('reader-next').onclick = () => rdCb.onNext && rdCb.onNext();

  /* effets plein écran : traînées de warp + flash */
  const fxc = $('fx'), fxg = fxc.getContext('2d'), fx = { warp: 0, flash: 0, streaks: [] };
  for (let i = 0; i < 170; i++) fx.streaks.push({ a: Math.random() * Math.PI * 2, r: Math.random(), s: 0.4 + Math.random() * 1.2, h: Math.random() });
  GX.on('frame', (dt, T) => {
    const w = innerWidth, h = innerHeight;
    if (fxc.width !== w || fxc.height !== h) { fxc.width = w; fxc.height = h; }
    fxg.clearRect(0, 0, w, h);
    $('flash').style.opacity = fx.flash.toFixed(3);
    const on = fx.warp >= 0.01; fxc.style.visibility = on ? 'visible' : 'hidden';   // jamais de traînée résiduelle visible
    if (!on) return;
    const cx = w / 2, cy = h / 2, maxR = Math.hypot(cx, cy);
    fxg.lineCap = 'round';
    fx.streaks.forEach(s => {
      s.r += dt * s.s * (0.4 + fx.warp * 2.6); if (s.r > 1) { s.r = Math.random() * 0.1; s.a = Math.random() * Math.PI * 2; }
      const r0 = Math.pow(s.r, 1.6) * maxR, r1 = r0 + (6 + fx.warp * 160) * s.s * (0.3 + s.r);
      const c = Math.cos(s.a), sn = Math.sin(s.a);
      fxg.strokeStyle = `hsla(${s.h < 0.5 ? 330 : 215},90%,${72 + s.r * 20}%,${Math.min(0.9, fx.warp * (0.25 + s.r))})`;
      fxg.lineWidth = 0.7 + s.r * 1.6; fxg.beginPath(); fxg.moveTo(cx + c * r0, cy + sn * r0); fxg.lineTo(cx + c * r1, cy + sn * r1); fxg.stroke();
    });
  });

  /* =========================================================
     Chargement + porte d'entrée
     ========================================================= */
  const ring = $('g-ring-c'), CIRC = 2 * Math.PI * 34;
  function setLoad(f, label) {
    ring.style.strokeDashoffset = String(CIRC * (1 - clamp(f)));
    $('g-pct').textContent = Math.round(clamp(f) * 100);
    if (label) $('g-label').textContent = label;
  }
  ring.style.strokeDasharray = String(CIRC);

  async function boot() {
    if (!GX.initGL($('sky'))) { $('g-label').textContent = 'Ton navigateur ne peut pas afficher la galaxie (WebGL requis).'; return; }
    GX.start(); setLoad(0.05, 'Allumer la nébuleuse'); await pause(80);
    let portrait = null; const pc = cfg.portrait || {};
    if (pc.enabled && pc.src) {
      try { portrait = await GX.portrait.load(pc.src, pc, (f, l) => setLoad(0.08 + f * 0.64, l)); console.info('[portrait]', portrait.stats); }
      catch (e) { console.warn('[portrait] indisponible :', e.message); portrait = null; }
    }
    app.hasPortrait = !!portrait; setLoad(0.76, 'Dessiner le ciel'); await pause(50);
    GX.hub.setDiscovered(discovered); GX.hub.init(portrait);
    setLoad(0.94, 'Accorder le silence'); await pause(50);
    const S = GX.hub.S; S.starsVis = 0.5; S.skyVis = 0.5; S.bg = 0.4; S.par = 1;
    GX.setStage(GX.hub.stage);
    setupHud(); setLoad(1, 'Tout est prêt');
    document.body.classList.add('ready'); $('g-load').classList.add('done'); $('start-btn').hidden = false; $('start-btn').focus({ preventScroll: true });
    if (store.get(LS.muted) === '1') { GX.audio.setMuted(true); $('music-toggle').classList.remove('playing'); }
  }

  /* =========================================================
     HUD
     ========================================================= */
  function setupHud() {
    $('hud-title').textContent = site.title || 'Notre petite galaxie';
    $('hud-sub').textContent = site.subtitle || '';
    if (!app.hasPortrait) $('btn-portrait').hidden = true;
    renderProgress();
  }
  function renderProgress() {
    const hub = GX.hub, svg = $('hp-heart'); if (!svg) return;
    const pts = []; for (let i = 0; i <= 80; i++) { const t = i / 80 * Math.PI * 2; pts.push([16 * Math.pow(Math.sin(t), 3) * 0.5, -((13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t) + 2.5) * 0.5)]); }
    const d = 'M' + pts.map(p => p.map(v => (v * 0.9).toFixed(2)).join(',')).join('L') + 'Z';
    let dots = '';
    stars.forEach((s, i) => { const k = hub.keyPos[s.position]; if (!k) return; dots += `<circle class="hp-dot${discovered.has(s.position) ? ' on' : ''}" data-i="${i}" cx="${(k.x * 0.9).toFixed(2)}" cy="${(-k.y * 0.9).toFixed(2)}" r="0.9"><title>${esc(s.title)}</title></circle>`; });
    svg.innerHTML = `<path d="${d}" class="hp-path"/>${dots}`;
    svg.querySelectorAll('.hp-dot').forEach(c => c.addEventListener('click', () => { if (app.state === 'hub') journeyTo(stars[+c.dataset.i], +c.dataset.i); }));
    $('hp-count').textContent = `${discovered.size}/${stars.length}`;
    $('hud-progress').classList.toggle('complete', discovered.size >= stars.length && stars.length > 0);
  }
  function saveDiscovered() { store.set(LS.disc, JSON.stringify([...discovered])); renderProgress(); }

  GX.on('track', t => { const b = $('music-toggle'); if (b && t) { b.title = '♪ ' + t.title; b.setAttribute('aria-label', 'Son — en cours : ' + t.title); } });
  $('btn-full').onclick = () => { if (document.fullscreenElement) document.exitFullscreen(); else (document.documentElement.requestFullscreen || (() => {})).call(document.documentElement); };
  $('btn-consts').onclick = () => { const on = $('btn-consts').classList.toggle('off'); GX.tween(GX.hub.S, { consts: on ? 0 : 1 }, 700); GX.audio.tick(); };
  $('music-toggle').onclick = () => { const m = !GX.audio.muted; GX.audio.setMuted(m); store.set(LS.muted, m ? '1' : '0'); $('music-toggle').classList.toggle('playing', !m); if (!m) GX.audio.init(); };
  $('btn-portrait').onclick = () => { if (app.state === 'hub') showPortrait(); else if (app.state === 'portrait') hidePortrait(); };
  $('btn-help').onclick = () => ui.toast('Glisse pour tourner · molette pour zoomer · touche une étoile pour partir en voyage · Échap pour revenir', 6500);

  /* =========================================================
     Ouverture cinématique
     ========================================================= */
  async function runIntro() {
    if (app.busy) return; app.busy = true;
    const hub = GX.hub, S = hub.S, first = !store.get(LS.intro), fast = !first, has = app.hasPortrait, lines = (cfg.intro && cfg.intro.lines) || [];
    GX.audio.init(); GX.audio.setMood('portrait'); GX.audio.whoosh(2.6, true, 0.28); $('music-toggle').classList.toggle('playing', !GX.audio.muted);
    setBody('intro'); $('gate').classList.add('leaving'); setTimeout(() => { $('gate').hidden = true; }, 1600);
    const skipBtn = $('intro-skip'); skipBtn.hidden = false; let skipped = false;
    const skip = () => { if (skipped) return; skipped = true; GX.finishAll(); ui.sayOut(); $('portrait-caption').classList.remove('show'); };
    skipBtn.onclick = skip; const onKey = e => { if (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter') { e.preventDefault(); skip(); } }; addEventListener('keydown', onKey);
    const T = ms => ms * (fast ? 0.55 : 1);
    GX.tween(S, { starsVis: 1, skyVis: 0.8, bg: 0.55 }, T(2600));
    GX.tween(S, { zoom: has ? 1.1 : 1.3 }, T(has ? 11500 : 9500), { ease: ease.out });
    await GX.wait(T(700));
    if (!fast && lines[0]) { ui.say({ title: lines[0], size: 'xl' }); await GX.wait(3000); ui.sayOut(); await GX.wait(900); }
    GX.audio.whoosh(3.2, true, 0.34);
    GX.tween(S, { gather: 1 }, T(has ? 6200 : 5600), { ease: ease.inOutSine });
    GX.tween(S, { glow: 1 }, T(5200), { delay: T(1600) });
    if (!has) GX.tween(S, { vis: 1 }, T(3800), { delay: T(2200) });
    await GX.wait(T(has ? 4800 : 3600)); GX.audio.chime(4, 0.3);
    if (has) {
      GX.tween(S, { lines: 1 }, T(3600));
      await GX.wait(T(1400));
      const cap = $('portrait-caption');
      cap.innerHTML = `<span class="pc-line">${esc(!fast && lines[1] ? lines[1] : '')}</span><b>${esc((cfg.portrait && cfg.portrait.caption) || site.recipient || '')}</b><i>${esc((cfg.portrait && cfg.portrait.subtitle) || '')}</i>`;
      cap.classList.add('show'); GX.audio.chime(5, 0.34);
      await GX.wait(T(first ? 6400 : 2600)); cap.classList.remove('show'); await GX.wait(700);
      GX.audio.setMood('hub'); GX.audio.whoosh(3.2, false, 0.4);
      GX.tween(S, { portOut: 1 }, T(5600), { ease: ease.inOutSine });
      GX.tween(S, { zoom: HUB_ZOOM }, T(5600), { ease: ease.inOutSine });
      GX.tween(S, { vis: 1 }, T(4400), { delay: T(1400) });
      await GX.wait(T(4400));
    } else {
      GX.audio.setMood('hub');
      if (!fast && lines[1]) { ui.say({ title: lines[1], size: 'xl' }); await GX.wait(3000); ui.sayOut(); }
      GX.tween(S, { zoom: HUB_ZOOM }, T(2500));
      await GX.wait(T(1200));
    }
    removeEventListener('keydown', onKey); skipBtn.hidden = true;
    GX.tween(S, { consts: 1 }, 3200); await GX.tween(S, { beacons: 1 }, 3400);
    store.set(LS.intro, '1'); app.busy = false; enterHub(first);
  }

  function enterHub(showTitle) {
    const hub = GX.hub; setBody('hub'); hub.interactive = true; hub.orbit = true; hub.showButtons = true;
    $('hud').hidden = false; $('hud-progress').hidden = false; document.body.classList.add('hud-on');
    ui.hint(discovered.size ? 'Choisis une étoile · glisse pour tourner le ciel' : 'Touche une étoile — chacune ouvre un monde à explorer');
    GX.audio.setMood('hub');
    if (discovered.size >= stars.length && stars.length) ui.toast('Toutes les étoiles sont allumées — le cœur t\'attend ✦', 6000);
    if (!app._titled) { app._titled = true; const S = hub.S; GX.tween(S, { ownLabel: 1 }, 1800).then(() => GX.wait(5500)).then(() => GX.tween(S, { ownLabel: 0 }, 2400)); }   // le nom de la constellation apparaît un instant
  }

  /* =========================================================
     Portrait à la demande
     ========================================================= */
  async function showPortrait() {
    if (app.busy || !app.hasPortrait) return; app.busy = true; const hub = GX.hub, S = hub.S;
    hub.interactive = false; hub.showButtons = false; setBody('portrait'); ui.hint(''); GX.audio.setMood('portrait'); GX.audio.whoosh(2.4, true, 0.3);
    GX.tween(S, { beacons: 0, consts: 0.25, vis: 0.12, zoom: 1.05 }, 2400); GX.tween(S, { glow: 1 }, 3000);
    GX.tween(S, { portOut: 0 }, 4600, { ease: ease.inOutSine });
    await GX.wait(3600); GX.tween(S, { lines: 1 }, 3200);
    const cap = $('portrait-caption'); cap.innerHTML = `<b>${esc((cfg.portrait && cfg.portrait.caption) || site.recipient || '')}</b><i>${esc((cfg.portrait && cfg.portrait.subtitle) || '')}</i>`; cap.classList.add('show');
    ui.hint('Passe la main sur les étoiles · Échap pour revenir'); app.busy = false;
  }
  async function hidePortrait() {
    if (app.busy) return; app.busy = true; const hub = GX.hub, S = hub.S;
    $('portrait-caption').classList.remove('show'); ui.hint(''); GX.audio.setMood('hub'); GX.audio.whoosh(2.6, false, 0.35);
    GX.tween(S, { lines: 0 }, 900);
    GX.tween(S, { portOut: 1 }, 4600, { ease: ease.inOutSine }); GX.tween(S, { zoom: HUB_ZOOM, vis: 1 }, 4200);
    await GX.wait(3600); GX.tween(S, { consts: 1, beacons: 1 }, 2000); await GX.wait(1600);
    app.busy = false; enterHub();
  }

  /* =========================================================
     Voyage vers une étoile → monde
     ========================================================= */
  const flash = (to, ms) => GX.tween(fx, { flash: to }, ms, { ease: ease.inOutSine });
  async function journeyTo(star, i) {
    if (app.busy || app.state !== 'hub') return; app.busy = true;
    const hub = GX.hub; hub.interactive = false; hub.showButtons = false; setBody('journey'); ui.hint(''); ui.toast.call && $('toast').classList.remove('on');
    GX.audio.whoosh(2.2, true, 0.55); GX.audio.chime(3, 0.3);
    hub.ripple(hub.keyPos[star.position].x, hub.keyPos[star.position].y, 1.2); GX.tween(hub.S, { wake: 0 }, 500);
    const from = hub.captureCam(), to = hub.starCam(star.position, 0.55); to.fov = 92;
    GX.tween(fx, { warp: 1 }, 1100, { ease: ease.in });
    await hub.flyCam(from, to, 1650, { ease: ease.inOut, bulge: 1.6, roll: 0.05 });
    await flash(1, 260);
    await enterWorld(star, i);
  }

  async function enterWorld(star, i, factory) {
    const hub = GX.hub; let world;
    try { world = factory ? await factory() : await GX.worlds.create(star, i); }
    catch (e) { console.error('Monde indisponible', e); world = null; }
    if (!world) { GX.cancelTweens(fx); fx.warp = 0; await flash(0, 400); hub.S.wake = 1; app.busy = false; hub.interactive = true; hub.showButtons = true; setBody('hub'); ui.toast('Ce monde n\'a pas pu s\'ouvrir — réessaie dans un instant.'); return; }
    app.world = world; app.worldStar = star;
    if (star) { discovered.add(star.position); GX.hub.setDiscovered(discovered); saveDiscovered(); }
    GX.setStage(world.stage); setBody('world'); document.body.dataset.world = world.kind;
    GX.audio.setMood(world.mood || 'hub');
    buildWorldHud(world, star, i);
    world.enter();
    GX.cancelTweens(fx); fx.warp = 0; fx.flash = 1; await GX.wait(120); flash(0, 1100);
    ui.chapter(star ? `Étoile ${roman(i + 1)}` : 'Le cœur', world.meta.title, world.meta.kicker);
    app.busy = false;
  }

  function buildWorldHud(world, star, i) {
    $('world-hud').hidden = false; $('w-kicker').textContent = world.meta.kicker || ''; $('w-title').textContent = world.meta.title || ''; ui.hint('');
    $('w-hint').textContent = world.meta.hint || ''; $('w-hint').classList.add('on'); setTimeout(() => $('w-hint').classList.remove('on'), 9000);
    const chips = $('w-chips'); chips.innerHTML = '';
    (world.meta.chips || []).forEach((label, k) => {
      const b = el('button', 'w-chip ui', `<span>${k + 1}</span>`); b.title = label; b.setAttribute('aria-label', label);
      b.onclick = () => { GX.audio.tick(); world.focusItem && world.focusItem(k); }; chips.appendChild(b);
    });
    world.onChip = (k, state) => { const c = chips.children[k]; if (c) c.dataset.state = state; };
    world.onComplete = () => {
      GX.audio.chime(6, 0.4); $('world-hud').classList.add('complete');
      ui.toast('Cette étoile n\'a plus de secret pour toi ✦', 5200, { label: 'Retourner au cœur', fn: leaveWorld });
    };
  }

  async function leaveWorld() {
    if (app.busy || app.state !== 'world') return; app.busy = true;
    const hub = GX.hub, world = app.world, star = app.worldStar;
    ui.reader.hide(true); $('toast').classList.remove('on'); $('w-hint').classList.remove('on');
    GX.audio.whoosh(1.9, false, 0.5); await flash(1, 420);
    $('world-hud').hidden = true; $('world-hud').classList.remove('complete');
    world.leave(); app.world = null; delete document.body.dataset.world;
    GX.setStage(hub.stage); setBody('journey'); GX.audio.setMood('hub');
    const S = hub.S; S.wake = 0;
    const start = star ? hub.starCam(star.position, 0.55) : hub.coreCam(); start.fov = 92;
    const end = hub.neutralCam(); hub.rig.yaw = hub.rig.pitch = 0;
    await GX.wait(60); flash(0, 900); GX.tween(fx, { warp: 0.6 }, 400).then(() => GX.tween(fx, { warp: 0 }, 900));
    await hub.flyCam(start, end, 1900, { ease: ease.out, bulge: -1.2 });
    S.par = 0; GX.tween(S, { par: 1, wake: 1 }, 1200);
    if (star) hub.ripple(hub.keyPos[star.position].x, hub.keyPos[star.position].y, 1.4);
    app.busy = false; enterHub();
    if (discovered.size >= stars.length && stars.length && !store.get('gx-all-lit')) { store.set('gx-all-lit', '1'); GX.audio.chime(7, 0.4); ui.toast('Toutes les étoiles sont allumées — touche le cœur lumineux ✦', 7000); hub.pulse(); }
  }
  $('w-back').onclick = leaveWorld;

  /* la lettre : plongée dans le noyau */
  async function openLetter() {
    if (app.busy || app.state !== 'hub') return;
    const hub = GX.hub, left = stars.length - discovered.size;
    if (left > 0 && !app._letterForce) { hub.ripple(0, -0.3, 1.2); GX.audio.chime(2, 0.25); ui.toast(`Il reste ${left} étoile${left > 1 ? 's' : ''} à allumer avant que le cœur s'éveille.`, 6000, { label: 'Lire quand même', fn: () => { app._letterForce = true; openLetter(); } }); return; }
    app._letterForce = false; app.busy = true; hub.interactive = false; hub.showButtons = false; setBody('journey'); ui.hint('');
    GX.audio.whoosh(2.6, true, 0.6); GX.audio.chime(5, 0.3); hub.pulse(); GX.tween(hub.S, { wake: 0 }, 500);
    const from = hub.captureCam(), to = hub.coreCam(); to.fov = 96;
    GX.tween(fx, { warp: 1 }, 1500, { ease: ease.in });
    await hub.flyCam(from, to, 2100, { ease: ease.inOut, bulge: 0 });
    await flash(1, 300);
    await enterWorld(null, 0, () => GX.worlds.createLetter());
  }

  /* câblage hub */
  GX.on('hub-ready', () => {});
  document.addEventListener('DOMContentLoaded', () => {
    $('start-btn').addEventListener('click', runIntro);
    addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      if (ui.reader.open) ui.reader.hide(); else if (app.state === 'world') leaveWorld(); else if (app.state === 'portrait') hidePortrait();
    });
    boot().then(() => { GX.hub.onSelect = journeyTo; GX.hub.onCore = openLetter; }).catch(e => { console.error('[boot]', e && e.stack ? e.stack : e); $('g-label').textContent = 'Une erreur est survenue au chargement.'; });
    /* halo de curseur */
    const aura = $('cursor-aura'); if (!GX.env.coarse) addEventListener('pointermove', e => { aura.style.transform = `translate(${e.clientX}px,${e.clientY}px)`; aura.classList.add('on'); });
  });
  app.fx = fx; app.journeyTo = journeyTo; app.leaveWorld = leaveWorld; app.openLetter = openLetter; app.enterWorld = enterWorld; app.runIntro = runIntro;
})();
