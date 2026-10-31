/* ┌─ ★ Normalement, rien à modifier ici : les réglages du portrait sont dans data.php ($portrait). ┐
   │  Avancé : maxSide (finesse de l'analyse), maxLines (nombre de lignes de constellation).     │
   └──────────────────────────────────────────────────────────────────────────────────────────┘ */
/* =========================================================
   portrait.js — transforme une photo en portrait d'étoiles

   Deux voies, choisies automatiquement :
   A. VISAGE RECONNU (MediaPipe FaceMesh, 468 points, exécuté dans le
      navigateur — la photo ne quitte jamais l'appareil) :
        • des étoiles-repères posées exactement sur les sourcils, les yeux,
          les iris, les lèvres, le nez et le contour du visage, reliées en
          constellations → le visage se reconnaît à ses traits ;
        • un pointillé de lumière (contraste local normalisé) modelé par un
          masque visage + cheveux : le fond et les vêtements s'effacent.
   B. SECOURS (aucun visage trouvé, hors-ligne…) : analyse classique —
      contraste local, contours filtrés, sujet isolé, étoiles « bruit bleu ».
   Résultat déterministe : le portrait est identique à chaque visite.
   ========================================================= */
(() => {
  'use strict';
  const GX = window.GX;
  const { clamp, lerp, rng } = GX.util;
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const tick = () => new Promise(r => setTimeout(r, 0));
  const withTimeout = (p, ms, label) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('délai dépassé : ' + label)), ms))]);

  /* ---------- chargement tolérant de l'image ---------- */
  function loadImage(src, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      const img = new Image(); let done = false;
      const fail = m => { if (!done) { done = true; clearTimeout(to); reject(new Error(m)); } };
      const to = setTimeout(() => fail('timeout'), timeoutMs);
      img.onload = async () => {
        if (done) return;
        try { if (img.decode) await img.decode(); } catch (e) { /* déjà décodée */ }
        if (!img.naturalWidth || !img.naturalHeight) return fail('empty');
        done = true; clearTimeout(to); resolve(img);
      };
      img.onerror = () => fail('load');
      img.src = src;
    });
  }

  /* ---------- flou par boîte (séparable, O(n)) ---------- */
  function boxBlur(src, W, H, r, passes = 2) {
    r = Math.round(r);
    if (r < 1) return Float32Array.from(src);
    let a = Float32Array.from(src), b = new Float32Array(W * H);
    const k = 2 * r + 1;
    for (let p = 0; p < passes; p++) {
      for (let y = 0; y < H; y++) {
        const row = y * W; let sum = 0;
        for (let x = -r; x <= r; x++) sum += a[row + Math.min(W - 1, Math.max(0, x))];
        for (let x = 0; x < W; x++) { b[row + x] = sum / k; sum += a[row + Math.min(W - 1, x + r + 1)] - a[row + Math.max(0, x - r)]; }
      }
      for (let x = 0; x < W; x++) {
        let sum = 0;
        for (let y = -r; y <= r; y++) sum += b[Math.min(H - 1, Math.max(0, y)) * W + x];
        for (let y = 0; y < H; y++) { a[y * W + x] = sum / k; sum += b[Math.min(H - 1, y + r + 1) * W + x] - b[Math.max(0, y - r) * W + x]; }
      }
    }
    return a;
  }
  function percentile(arr, p, mask) {
    const hist = new Uint32Array(256); let n = 0;
    for (let i = 0; i < arr.length; i++) { if (mask && mask[i] < 0.5) continue; hist[clamp(Math.round(arr[i] * 255), 0, 255)]++; n++; }
    const target = n * p; let c = 0;
    for (let i = 0; i < 256; i++) { c += hist[i]; if (c >= target) return i / 255; }
    return 1;
  }

  /* =========================================================
     RECONNAISSANCE DU VISAGE — MediaPipe FaceMesh (local d'abord, CDN en secours)
     ========================================================= */
  const CDN_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619/';
  function loadScript(src, ms = 20000) {
    return new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = src; s.async = true;
      const t = setTimeout(() => { s.remove(); rej(new Error('délai ' + src)); }, ms);
      s.onload = () => { clearTimeout(t); res(); };
      s.onerror = () => { clearTimeout(t); s.remove(); rej(new Error('chargement ' + src)); };
      document.head.appendChild(s);
    });
  }
  let fmPromise = null;
  function getFaceMesh(localBase) {
    if (fmPromise) return fmPromise;
    fmPromise = (async () => {
      const bases = [localBase || 'assets/vendor/face_mesh/', CDN_BASE];
      for (const base of bases) {
        try {
          if (!window.FaceMesh) await loadScript(base + 'face_mesh.js');
          const fm = new window.FaceMesh({ locateFile: f => base + f });
          fm.setOptions({ maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: 0.3, minTrackingConfidence: 0.3, selfieMode: false });
          await withTimeout(fm.initialize(), 40000, 'initialisation FaceMesh');
          return fm;
        } catch (e) { console.warn('[portrait] FaceMesh indisponible (' + base + ') :', e.message); }
      }
      return null;
    })();
    return fmPromise;
  }
  function detectLandmarks(fm, canvas) {
    return new Promise(resolve => {
      let done = false; const finish = v => { if (!done) { done = true; resolve(v); } };
      fm.onResults(r => finish(r.multiFaceLandmarks && r.multiFaceLandmarks[0] ? r.multiFaceLandmarks[0] : null));
      fm.send({ image: canvas }).catch(() => finish(null));
      setTimeout(() => finish(null), 25000);
    });
  }
  async function findFace(img, opt) {
    const fm = await getFaceMesh(opt.faceMeshBase); if (!fm) return null;
    for (const side of [960, 640]) {                                   // deux échelles : un visage proche ou éloigné
      const s = side / Math.max(img.naturalWidth, img.naturalHeight), w = Math.round(img.naturalWidth * Math.min(1, s)), h = Math.round(img.naturalHeight * Math.min(1, s));
      const c = document.createElement('canvas'); c.width = Math.max(64, w); c.height = Math.max(64, h);
      const g = c.getContext('2d'); g.drawImage(img, 0, 0, c.width, c.height);
      const lm = await detectLandmarks(fm, c); if (lm && lm.length >= 468) return lm;
    }
    return null;
  }
  /* ---------- silhouette de la personne : MediaPipe Selfie Segmentation (cheveux, cou, vêtements) ---------- */
  const SEG_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation@0.1.1675465747/';
  let segPromise = null;
  function getSegmenter(localBase) {
    if (segPromise) return segPromise;
    segPromise = (async () => {
      for (const base of [localBase || 'assets/vendor/selfie_segmentation/', SEG_CDN]) {
        try {
          if (!window.SelfieSegmentation) await loadScript(base + 'selfie_segmentation.js');
          const sg = new window.SelfieSegmentation({ locateFile: f => base + f });
          sg.setOptions({ modelSelection: 0, selfieMode: false });
          await withTimeout(sg.initialize(), 40000, 'initialisation segmentation');
          return sg;
        } catch (e) { console.warn('[portrait] segmentation indisponible (' + base + ') :', e.message); }
      }
      return null;
    })();
    return segPromise;
  }
  async function findPerson(img, opt) {
    const sg = await getSegmenter(opt.segBase); if (!sg) return null;
    const side = 768, s = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas'); c.width = Math.max(64, Math.round(img.naturalWidth * s)); c.height = Math.max(64, Math.round(img.naturalHeight * s));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return new Promise(resolve => {
      let done = false; const fin = v => { if (!done) { done = true; resolve(v); } };
      sg.onResults(r => {
        if (!r.segmentationMask) return fin(null);
        const m = document.createElement('canvas'); m.width = r.segmentationMask.width || c.width; m.height = r.segmentationMask.height || c.height;
        m.getContext('2d', { willReadFrequently: true }).drawImage(r.segmentationMask, 0, 0, m.width, m.height); fin(m);           // copie immédiate : le masque n'est valable que dans ce rappel
      });
      sg.send({ image: c }).catch(() => fin(null)); setTimeout(() => fin(null), 25000);
    });
  }
  /* masque de la personne à la résolution de travail (0..1, bords adoucis) ; null si incohérent */
  function personField(maskCanvas, W, H) {
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d', { willReadFrequently: true });
    g.imageSmoothingQuality = 'high'; g.drawImage(maskCanvas, 0, 0, W, H);
    const d = g.getImageData(0, 0, W, H).data, N = W * H; let vr = 0, va = 0, mr = 0, ma = 0;
    for (let i = 0; i < N; i++) { mr += d[i * 4]; ma += d[i * 4 + 3]; }
    mr /= N; ma /= N; for (let i = 0; i < N; i++) { vr += (d[i * 4] - mr) ** 2; va += (d[i * 4 + 3] - ma) ** 2; }
    const ch = va >= vr ? 3 : 0, P = new Float32Array(N);                      // le masque est porté par l'alpha ou par le rouge selon la version
    for (let i = 0; i < N; i++) P[i] = d[i * 4 + ch] / 255;
    const sm = boxBlur(P, W, H, Math.max(1, Math.round(Math.min(W, H) * 0.005)), 2); let cov = 0;
    for (let i = 0; i < N; i++) { sm[i] = sstep(0.28, 0.72, sm[i]); cov += sm[i]; } cov /= N;
    return cov > 0.1 && cov < 0.97 ? { P: sm, coverage: cov } : null;
  }

  /* paires de connexions → chaînes ordonnées d'indices */
  function orderChains(pairs) {
    const adj = new Map(), add = (a, b) => { if (!adj.has(a)) adj.set(a, []); adj.get(a).push(b); };
    pairs.forEach(([a, b]) => { add(a, b); add(b, a); });
    const seen = new Set(), chains = [];
    const walk = start => { const ids = [start]; seen.add(start); let cur = start; for (;;) { const nx = adj.get(cur).find(n => !seen.has(n)); if (nx === undefined) break; ids.push(nx); seen.add(nx); cur = nx; } return ids; };
    for (const [n, l] of adj) if (l.length === 1 && !seen.has(n)) chains.push({ ids: walk(n), closed: false });
    for (const [n] of adj) if (!seen.has(n)) { const ids = walk(n); chains.push({ ids, closed: adj.get(ids[0]).includes(ids[ids.length - 1]) && ids.length > 2 }); }
    return chains;
  }
  const NOSE = [{ ids: [168, 6, 197, 195, 5, 4], closed: false }, { ids: [129, 98, 97, 2, 326, 327, 358], closed: false }];
  function featureChains() {
    const G = n => window[n] || [], C = [];
    [['FACEMESH_FACE_OVAL', 'oval'], ['FACEMESH_LEFT_EYEBROW', 'brow'], ['FACEMESH_RIGHT_EYEBROW', 'brow'], ['FACEMESH_LEFT_EYE', 'eye'], ['FACEMESH_RIGHT_EYE', 'eye'], ['FACEMESH_LEFT_IRIS', 'iris'], ['FACEMESH_RIGHT_IRIS', 'iris'], ['FACEMESH_LIPS', 'lips']]
      .forEach(([k, kind]) => orderChains(G(k)).forEach(ch => C.push({ ...ch, kind })));
    NOSE.forEach(ch => C.push({ ...ch, kind: 'nose' }));
    return C;
  }

  /* ---------- champs de l'image (tons, contours) ---------- */
  function buildFields(img, opt) {
    const maxSide = opt.maxSide || 560;
    let w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    let s = Math.min(1, maxSide / Math.max(w, h));
    if (Math.min(w, h) * s < 160) s = Math.min(3, 160 / Math.min(w, h));
    const W = Math.max(48, Math.round(w * s)), H = Math.max(48, Math.round(h * s));
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d', { willReadFrequently: true });
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H); g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, W, H);
    const px = g.getImageData(0, 0, W, H).data;
    const ac = document.createElement('canvas'); ac.width = W; ac.height = H;
    const ag = ac.getContext('2d', { willReadFrequently: true }); ag.drawImage(img, 0, 0, W, H);
    const apx = ag.getImageData(0, 0, W, H).data;
    let alphaSum = 0; const A = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) { A[i] = apx[i * 4 + 3] / 255; alphaSum += A[i]; }
    const hasAlpha = alphaSum / (W * H) < 0.97 && alphaSum / (W * H) > 0.03;
    const N = W * H, L = new Float32Array(N), R = new Float32Array(N), G = new Float32Array(N), B = new Float32Array(N);
    for (let i = 0; i < N; i++) { R[i] = px[i * 4] / 255; G[i] = px[i * 4 + 1] / 255; B[i] = px[i * 4 + 2] / 255; L[i] = 0.2126 * R[i] + 0.7152 * G[i] + 0.0722 * B[i]; }
    return { W, H, N, L, R, G, B, A, hasAlpha };
  }

  /* contraste local normalisé : fait ressortir les volumes d'un visage, même peu contrasté */
  function localTone(L, W, H, radius, region) {
    const lo = percentile(L, 0.02, region), hi = Math.max(lo + 0.05, percentile(L, 0.99, region)), n = L.length, G = new Float32Array(n);
    for (let i = 0; i < n; i++) G[i] = clamp((L[i] - lo) / (hi - lo));
    const mean = boxBlur(G, W, H, radius, 2), dev = new Float32Array(n);
    for (let i = 0; i < n; i++) { const d = G[i] - mean[i]; dev[i] = d * d; }
    const sd = boxBlur(dev, W, H, radius, 2), T = new Float32Array(n);
    for (let i = 0; i < n; i++) { const z = (G[i] - mean[i]) / (Math.sqrt(sd[i]) + 0.04); T[i] = 0.5 * (1 / (1 + Math.exp(-1.7 * z))) + 0.5 * G[i]; }
    return { T, G };
  }
  /* contours : Sobel normalisé par la texture locale (les motifs répétitifs — dentelle, rideaux — s'effacent) */
  function edgeField(L, W, H, texRadius) {
    const N = W * H, sm = boxBlur(L, W, H, 1, 1), mag = new Float32Array(N), gx_ = new Float32Array(N), gy_ = new Float32Array(N);
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      const gx = -sm[i - W - 1] - 2 * sm[i - 1] - sm[i + W - 1] + sm[i - W + 1] + 2 * sm[i + 1] + sm[i + W + 1];
      const gy = -sm[i - W - 1] - 2 * sm[i - W] - sm[i - W + 1] + sm[i + W - 1] + 2 * sm[i + W] + sm[i + W + 1];
      gx_[i] = gx; gy_[i] = gy; mag[i] = Math.hypot(gx, gy);
    }
    const local = boxBlur(mag, W, H, texRadius, 2), E = new Float32Array(N);
    let mx = 0; for (let i = 0; i < N; i++) { E[i] = mag[i] / (local[i] * 1.6 + 0.05); if (E[i] > mx) mx = E[i]; }
    let t = new Float32Array(N); for (let i = 0; i < N; i++) t[i] = E[i] / (mx || 1);
    const p = Math.max(1e-3, percentile(t, 0.96));
    for (let i = 0; i < N; i++) E[i] = sstep(0.18, 1.0, t[i] / p * 0.62);
    return { E, GX: gx_, GY: gy_ };
  }

  /* ---------- voie A : géométrie du visage → masque, repères, carte de traits ---------- */
  function faceContext(lm, F) {
    const { W, H } = F, P = i => ({ x: lm[i].x * W, y: lm[i].y * H });
    const L = P(234), R = P(454), top = P(10), chin = P(152);
    const fw = Math.hypot(L.x - R.x, L.y - R.y), fh = Math.hypot(top.x - chin.x, top.y - chin.y);
    const up = { x: (top.x - chin.x) / fh, y: (top.y - chin.y) / fh }, roll = Math.atan2(R.y - L.y, R.x - L.x);
    const c = { x: (top.x + chin.x) / 2, y: (top.y + chin.y) / 2 };
    const chains = featureChains();
    const canvasField = (draw, blur = 0) => {
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d', { willReadFrequently: true }); g.fillStyle = '#000'; g.fillRect(0, 0, W, H); g.fillStyle = '#fff'; g.strokeStyle = '#fff'; draw(g);
      const d = g.getImageData(0, 0, W, H).data, f = new Float32Array(W * H); for (let i = 0; i < f.length; i++) f[i] = d[i * 4] / 255;
      return blur ? boxBlur(f, W, H, blur, 2) : f;
    };
    const path = (g, ids, close) => { ids.forEach((id, k) => { const p = P(id); k ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y); }); if (close) g.closePath(); };
    const oval = chains.find(c => c.kind === 'oval');
    const faceMask = canvasField(g => { g.beginPath(); path(g, oval.ids, true); g.fill(); }, Math.max(1, fw * 0.01));
    const ell = (g, cx, cy, rx, ry, rot) => { g.beginPath(); g.ellipse(cx, cy, rx, ry, rot, 0, Math.PI * 2); g.fill(); };
    const halo = canvasField(g => ell(g, c.x + up.x * fh * 0.06, c.y + up.y * fh * 0.06, fw * 1.08, fh * 0.64, roll), fw * 0.12);   // large sur les côtés (cheveux), court au-dessus (évite les décors)          // tête et cheveux
    const shoulders = canvasField(g => ell(g, chin.x - up.x * fh * 0.72, chin.y - up.y * fh * 0.72, fw * 1.2, fh * 0.75, roll), fw * 0.22); // cou et épaules
    const N = W * H, M = new Float32Array(N);
    for (let i = 0; i < N; i++) M[i] = Math.max(0.015, faceMask[i], halo[i] * 0.78, shoulders[i] * 0.28);
    const lw = Math.max(1.6, fw * 0.012);
    const feat = canvasField(g => { g.lineWidth = lw; g.lineJoin = g.lineCap = 'round'; chains.forEach(ch => { if (ch.kind === 'oval') return; g.beginPath(); path(g, ch.ids, ch.closed); g.stroke(); }); }, 1);
    return { P, fw, fh, roll, c, chin, chain: chains, faceMask, halo, shoulders, M, feat, up };
  }

  /* étoiles-repères posées le long des traits (un point tous les ~step px) */
  function featureSeeds(ctx, rand, ed, W, H) {
    const seeds = [], chainsOut = [], step = Math.max(3.2, ctx.fw * 0.034);   // pas entre étoiles-repères
    /* la mâchoire est recalée sur le vrai contour de la photo (le modèle donne un ovale moyen, pas SA mâchoire) */
    const snap = (x, y) => {
      const nx0 = x - ctx.c.x, ny0 = y - ctx.c.y, nl = Math.hypot(nx0, ny0) || 1, nx = nx0 / nl, ny = ny0 / nl, R = Math.max(2, Math.round(ctx.fw * 0.05));
      let best = 0, bs = -1;
      for (let t = -R; t <= R; t++) { const sx = x + nx * t, sy = y + ny * t; if (sx < 1 || sy < 1 || sx >= W - 1 || sy >= H - 1) continue; const e = ed.E[(sy | 0) * W + (sx | 0)] * (1 - 0.3 * Math.abs(t) / R); if (e > bs) { bs = e; best = t; } }
      const e0 = ed.E[(Math.min(H - 1, y | 0)) * W + Math.min(W - 1, x | 0)];
      return bs > e0 * 1.25 + 0.05 ? { x: x + nx * best, y: y + ny * best } : { x, y };
    };
    ctx.chain.forEach(ch => {
      const pts = ch.ids.map(id => ctx.P(id)); if (ch.closed) pts.push(pts[0]);
      const ids = []; let acc = step; let prev = pts[0];
      const emit = (x, y, kind) => {
        if (kind === 'oval') {                                   // contour : mâchoire et joues seulement (le haut du masque est artificiel)
          const proj = ((x - ctx.c.x) * ctx.up.x + (y - ctx.c.y) * ctx.up.y) / ctx.fh;
          if (proj > 0.1) { ids.push(-1); return; }
        }
        if (kind === 'oval') { const q = snap(x, y); x = q.x; y = q.y; }
        ids.push(seeds.length); seeds.push({ x, y, r: step * (kind === 'oval' ? 0.95 : 0.62), kind });
      };
      emit(prev.x, prev.y, ch.kind);
      for (let k = 1; k < pts.length; k++) {
        let a = prev, b = pts[k], seg = Math.hypot(b.x - a.x, b.y - a.y);
        while (acc <= seg && seg > 1e-6) { const t = acc / seg, x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t; emit(x, y, ch.kind); a = { x, y }; seg = Math.hypot(b.x - a.x, b.y - a.y); acc = step; }
        acc -= seg; prev = b;
      }
      chainsOut.push({ ids, closed: ch.closed, kind: ch.kind });
    });
    // centres des iris : points de lumière
    [468, 473].forEach(i => { const p = ctx.P(i); seeds.push({ x: p.x, y: p.y, r: step * 0.5, kind: 'iris-center' }); });
    return { seeds, chains: chainsOut };
  }

  /* ---------- voie B : analyse classique (secours) ---------- */
  function classicMaps(F, opt, usePriorOnly) {
    const { W, H, N } = F, minSide = Math.min(W, H), fx = (opt.focus && opt.focus[0] != null) ? opt.focus[0] : 0.5, fy = (opt.focus && opt.focus[1] != null) ? opt.focus[1] : 0.46;
    let L = Float32Array.from(F.L); if (opt.invert) for (let i = 0; i < N; i++) L[i] = 1 - L[i];
    const prior = new Float32Array(N), sx = 0.36, sy = 0.44;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const dx = (x / W - fx) / sx, dy = (y / H - fy) / sy; prior[y * W + x] = Math.exp(-0.5 * (dx * dx + dy * dy)); }
    const { T } = localTone(L, W, H, Math.round(minSide * 0.1), null);
    const ed = edgeField(L, W, H, Math.round(minSide * 0.05));
    let M = new Float32Array(N), mode = 'prior';
    if (F.hasAlpha) { for (let i = 0; i < N; i++) M[i] = F.A[i]; M = boxBlur(M, W, H, 2, 1); mode = 'alpha'; }
    else if (!usePriorOnly) {
      const ring = Math.max(3, Math.round(minSide * 0.05)); let n = 0, mr = 0, mg = 0, mb = 0, ml = 0, ml2 = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (x < ring || y < ring || x >= W - ring || y >= H - ring) { const i = y * W + x; mr += F.R[i]; mg += F.G[i]; mb += F.B[i]; ml += F.L[i]; ml2 += F.L[i] * F.L[i]; n++; }
      mr /= n; mg /= n; mb /= n; ml /= n; const std = Math.sqrt(Math.max(0, ml2 / n - ml * ml)), conf = clamp(1 - std / 0.16, 0, 1);
      const dist = new Float32Array(N); for (let i = 0; i < N; i++) dist[i] = Math.hypot(F.R[i] - mr, F.G[i] - mg, F.B[i] - mb) / 0.9;
      const db = boxBlur(dist, W, H, Math.round(minSide * 0.02), 2);
      for (let i = 0; i < N; i++) M[i] = lerp(prior[i], Math.min(1, sstep(0.07, 0.24, db[i]) * (0.55 + 0.45 * Math.sqrt(prior[i]))), conf * 0.92);
      mode = conf > 0.35 ? 'background' : 'prior';
    } else for (let i = 0; i < N; i++) M[i] = prior[i];
    M = boxBlur(M, W, H, Math.round(minSide * 0.012), 2);
    let cov = 0; for (let i = 0; i < N; i++) cov += M[i]; cov /= N;
    if ((cov < 0.07 || cov > 0.88) && mode !== 'prior' && mode !== 'alpha') { for (let i = 0; i < N; i++) M[i] = Math.pow(prior[i], 1.1); mode = 'prior-fallback'; }
    return { Lc: T, E: ed.E, GX: ed.GX, GY: ed.GY, M, mode, coverage: cov, feat: null };
  }

  /* ---------- placement des étoiles : Poisson pondéré, avec étoiles-repères pré-posées ---------- */
  async function sampleStars(F, maps, opt, rand, progress, seeds = []) {
    const { W, H, N } = F, { Lc, E, M } = maps, target = opt.stars, featMap = maps.feat;
    const D = new Float32Array(N); let maxD = 0, eff = 0;
    for (let i = 0; i < N; i++) {
      const tone = Math.pow(Lc[i], maps.toneGamma || 1.15); let d;
      if (opt.mode === 'edges') d = M[i] * (0.04 + 1.3 * E[i]);
      else if (opt.mode === 'tone') d = M[i] * (0.1 + 0.9 * tone);
      else if (maps.regionW) d = M[i] * maps.regionW[i] * (maps.wBase + maps.wTone * tone + maps.wEdge * E[i]);   // silhouette entière : visage, cheveux, cou, vêtements
      else if (maps.hairD) {                                      // visage : tons de la peau ; alentours : cheveux (sombres) ou fond
        const fwm = maps.faceW[i], dFace = maps.wBase + maps.wTone * tone + maps.wEdge * E[i], dHair = 0.03 + 0.42 * maps.hairD[i] + 0.14 * E[i] * maps.hairD[i];
        d = M[i] * lerp(dHair, dFace, sstep(0.25, 0.85, fwm));
      }
      else d = M[i] * (maps.wBase + maps.wTone * tone + maps.wEdge * E[i]);
      if (featMap) d += featMap[i] * (maps.wFeat || 0);
      d += (1 - M[i]) * 0.0035;
      D[i] = d; if (d > maxD) maxD = d;
    }
    /* normalisation robuste : sur le 97e percentile du sujet (et non le maximum, écrasé par les traits les plus brillants) */
    const sc = 1 / (maxD || 1), tmp = new Float32Array(N); for (let i = 0; i < N; i++) tmp[i] = D[i] * sc;
    const ref = Math.max(0.05, percentile(tmp, 0.97, M)) / sc;
    for (let i = 0; i < N; i++) { D[i] = Math.min(1, D[i] / ref); if (D[i] > 0.3) eff++; }
    const cdf = new Float64Array(N); let acc = 0; for (let i = 0; i < N; i++) { acc += D[i] + 1e-6; cdf[i] = acc; }
    const total = acc, s = Math.sqrt(Math.max(eff, N * 0.05) / target);
    let rMin = 0.5 * s, rMax = 2.5 * s;
    const cell = Math.max(rMax, ...seeds.map(q => q.r), 1), gw = Math.ceil(W / cell) + 1, gh = Math.ceil(H / cell) + 1;
    const grid = new Int32Array(gw * gh).fill(-1), next = [], px = [], py = [], pr = [], feat = [];
    const put = (x, y, r, f) => { const id = px.length, cx = Math.floor(x / cell), cy = Math.floor(y / cell); px.push(x); py.push(y); pr.push(r); feat.push(f); next.push(grid[cy * gw + cx]); grid[cy * gw + cx] = id; };
    seeds.forEach(q => { if (q.x >= 0 && q.y >= 0 && q.x < W && q.y < H) put(q.x, q.y, q.r, 1); else put(clamp(q.x, 0, W - 1), clamp(q.y, 0, H - 1), q.r, 1); });
    const radius = d => lerp(rMax, rMin, Math.pow(d, 0.7)), cellOf = (x, y) => [Math.floor(x / cell), Math.floor(y / cell)];
    let round = 0, lastYield = performance.now(), bgCount = 0; const bgCap = Math.floor(target * (maps.bgShare || 0.07));
    while (px.length < target && round < 5) {
      const cap = target * 40;
      for (let k = 0; k < cap && px.length < target; k++) {
        const u = rand() * total; let a = 0, b = N - 1;
        while (a < b) { const m = (a + b) >> 1; if (cdf[m] < u) a = m + 1; else b = m; }
        const x = (a % W) + rand(), y = Math.floor(a / W) + rand(), d = D[a], r = radius(d), [cx, cy] = cellOf(x, y); let ok = true;
        for (let yy = Math.max(0, cy - 1); yy <= Math.min(gh - 1, cy + 1) && ok; yy++)
          for (let xx = Math.max(0, cx - 1); xx <= Math.min(gw - 1, cx + 1) && ok; xx++) {
            let j = grid[yy * gw + xx];
            while (j >= 0) { const dx = px[j] - x, dy = py[j] - y, m = 0.5 * (r + pr[j]); if (dx * dx + dy * dy < m * m) { ok = false; break; } j = next[j]; }
          }
        if (!ok) continue;
        if (M[a] < 0.12) { if (bgCount >= bgCap) continue; bgCount++; }     // le fond n'a droit qu'à une petite part des étoiles
        put(x, y, r, 0);
        if ((k & 1023) === 0 && performance.now() - lastYield > 14) { progress && progress(px.length / target); await tick(); lastYield = performance.now(); }
      }
      if (px.length < target * 0.9) { rMin *= 0.82; rMax *= 0.82; round++; } else break;
    }
    return { px, py, pr, feat, D, rMax, cell, gw, gh, grid, next };
  }

  /* ---------- lignes de constellation qui suivent les contours (voie B + compléments) ---------- */
  function buildLines(F, maps, S, rand, opt, strict) {
    const { W, H } = F, { E, GX: gx, GY: gy, M } = maps, n = S.px.length;
    const edgeAt = (x, y) => E[clamp(Math.round(y), 0, H - 1) * W + clamp(Math.round(x), 0, W - 1)];
    const gradAt = (x, y) => { const i = clamp(Math.round(y), 0, H - 1) * W + clamp(Math.round(x), 0, W - 1); const m = Math.hypot(gx[i], gy[i]) || 1; return [gx[i] / m, gy[i] / m]; };
    const key = (a, b) => a < b ? a * 65536 + b : b * 65536 + a;
    const seen = new Set(), out = [], R = S.rMax * 1.9, maxLines = opt.maxLines || 4200, thr = strict ? 0.46 : 0.32;
    const near = (i, rad) => {
      const res = [], cx = Math.floor(S.px[i] / S.cell), cy = Math.floor(S.py[i] / S.cell), span = Math.ceil(rad / S.cell);
      for (let yy = Math.max(0, cy - span); yy <= Math.min(S.gh - 1, cy + span); yy++)
        for (let xx = Math.max(0, cx - span); xx <= Math.min(S.gw - 1, cx + span); xx++) {
          let j = S.grid[yy * S.gw + xx];
          while (j >= 0) { if (j !== i) { const dx = S.px[j] - S.px[i], dy = S.py[j] - S.py[i], d = Math.hypot(dx, dy); if (d < rad) res.push([j, d, dx / d, dy / d]); } j = S.next[j]; }
        }
      return res;
    };
    for (let i = 0; i < n && out.length < maxLines * 2; i++) {
      if (S.feat[i]) continue;
      const ei = edgeAt(S.px[i], S.py[i]);
      if (ei < thr || M[Math.round(S.py[i]) * W + Math.round(S.px[i])] < (strict ? 0.55 : 0.3)) continue;
      const cands = [];
      for (const [j, d, ux, uy] of near(i, R)) {
        if (S.feat[j]) continue;
        const mx = (S.px[i] + S.px[j]) / 2, my = (S.py[i] + S.py[j]) / 2, em = edgeAt(mx, my); if (em < thr - 0.08) continue;
        const [qx, qy] = gradAt(mx, my), along = Math.abs(ux * qx + uy * qy);
        cands.push({ j, ux, uy, score: d / R + 1.1 * along - 0.5 * em });
      }
      cands.sort((a, b) => a.score - b.score);
      const first = cands[0]; if (!first) continue;
      const picks = [first], second = cands.find(c => c !== first && (c.ux * first.ux + c.uy * first.uy) < -0.15); if (second) picks.push(second);
      for (const c of picks) { const k = key(i, c.j); if (!seen.has(k)) { seen.add(k); out.push(i, c.j); } }
    }
    return out;
  }

  /* ---------- point d'entrée ---------- */
  async function analyze(img, userOpt = {}, progress = () => {}) {
    const opt = Object.assign({ stars: 24000, mode: 'auto', hair: 'auto', invert: false, focus: null, maxLines: 4200, useFace: true, useSeg: true }, userOpt);
    if (GX.env.small) opt.stars = Math.round(opt.stars * 0.8);       // un téléphone gère très bien ~15 000 points
    const F = buildFields(img, opt); progress(0.05, 'Lecture de la photo'); await tick();
    const seed = (F.W * 73856093) ^ (F.H * 19349663) ^ Math.round(F.L[(F.N / 2) | 0] * 1e4), rand = rng(seed);
    const { W, H, N } = F, minSide = Math.min(W, H);
    let result = null, route = 'classic', lm = null, person = null;

    /* 1 · reconnaître le visage, 2 · découper la silhouette (cheveux, cou, vêtements compris) */
    if (opt.useFace) { progress(0.09, 'Reconnaître son visage'); try { lm = await findFace(img, opt); } catch (e) { console.warn('[portrait] visage :', e.message); } }
    if (opt.useSeg) {
      progress(0.2, 'Dessiner sa silhouette');
      try { const mc = await findPerson(img, opt); if (mc) person = personField(mc, W, H); } catch (e) { console.warn('[portrait] silhouette :', e.message); }
    }

    if (lm || person) {
      progress(0.3, 'Repérer ses traits'); await tick();
      const ctx = lm ? faceContext(lm, F) : null, fwPx = ctx ? ctx.fw : minSide * 0.45;
      let M;
      if (person) { M = new Float32Array(N); for (let i = 0; i < N; i++) M[i] = Math.max(0.012, person.P[i], ctx ? ctx.faceMask[i] : 0); }
      else M = ctx.M;                                                                  // sans silhouette : tête, cheveux et épaules estimés autour du visage
      /* tons : deux échelles de contraste local (volumes du visage + détail des mèches), puis gamma doux qui garde les ombres des cheveux */
      const t1 = localTone(F.L, W, H, Math.max(4, Math.round(fwPx * 0.14)), M), t2 = localTone(F.L, W, H, Math.max(2, Math.round(fwPx * 0.035)), M);
      let tone = new Float32Array(N); for (let i = 0; i < N; i++) tone[i] = Math.pow(clamp(0.6 * t1.T[i] + 0.4 * t2.T[i]), 0.6);          // gamma qui relève les ombres : les cheveux foncés restent bien étoilés
      tone = boxBlur(tone, W, H, 1, 1);
      const ed = edgeField(F.L, W, H, Math.max(3, Math.round(fwPx * 0.07)));
      const seedsInfo = ctx ? featureSeeds(ctx, rand, ed, W, H) : { seeds: [], chains: [] };
      const maps = { Lc: tone, E: ed.E, GX: ed.GX, GY: ed.GY, M, feat: ctx ? ctx.feat : null, mode: person ? 'person' : 'face', coverage: person ? person.coverage : 0, toneGamma: 1.0, bgShare: 0.012, wFeat: 0.5 };
      if (person) {
        const regionW = new Float32Array(N);
        if (ctx) { const dx = -ctx.up.x, dy = -ctx.up.y; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x, proj = ((x - ctx.chin.x) * dx + (y - ctx.chin.y) * dy) / ctx.fh; regionW[i] = 1 + 0.3 * ctx.faceMask[i] - 0.5 * sstep(0.08, 0.85, proj); } }
        else regionW.fill(1);
        Object.assign(maps, { regionW, wBase: 0.26, wTone: 0.8, wEdge: 0.3 });
      } else {                                                                         // secours sans silhouette : cheveux sombres/clairs déduits
        let hairMode = opt.hair === 'dark' || opt.hair === 'light' ? opt.hair : 'auto';
        if (hairMode === 'auto') { let sa = 0, wa = 0, sb = 0, wb = 0; for (let i = 0; i < N; i++) { const a = ctx.halo[i] * (1 - ctx.faceMask[i]), b = (1 - ctx.halo[i]) * (1 - ctx.shoulders[i]); sa += t1.G[i] * a; wa += a; sb += t1.G[i] * b; wb += b; } hairMode = sa / (wa || 1) > sb / (wb || 1) + 0.06 ? 'light' : 'dark'; }
        const hairD = new Float32Array(N); for (let i = 0; i < N; i++) hairD[i] = hairMode === 'dark' ? sstep(0.62, 0.2, t1.G[i]) : sstep(0.5, 0.95, t1.G[i]);
        Object.assign(maps, { hairD, faceW: ctx.faceMask, hairMode, wBase: 0.05, wTone: 1.0, wEdge: 0.36, toneGamma: 1.9 });
      }
      const S = await sampleStars(F, maps, opt, rand, f => progress(0.4 + f * 0.42, 'Allumer les étoiles'), seedsInfo.seeds);
      if (S.px.length >= opt.stars * 0.5) { result = { F, maps, S, ctx, seedsInfo }; route = person ? 'person' : 'face'; }
    }
    /* voie de secours : analyse classique */
    if (!result) {
      for (const priorOnly of [false, true]) {
        const maps = classicMaps(F, opt, priorOnly); Object.assign(maps, { wBase: 0.17, wTone: 0.78, wEdge: 0.7, wFeat: 0, toneGamma: 1.15 }); progress(0.3, 'Repérer les traits du visage'); await tick();
        const S = await sampleStars(F, maps, opt, rand, f => progress(0.3 + f * 0.5, 'Allumer les étoiles'));
        if (S.px.length >= opt.stars * 0.35 || priorOnly) { result = { F, maps, S }; break; }
      }
    }
    const { maps, S } = result, n = S.px.length, nSeed = result.seedsInfo ? result.seedsInfo.seeds.length : 0;
    progress(0.88, 'Relier les constellations'); await tick();
    let lineArr = [];
    if (nSeed) {
      result.seedsInfo.chains.forEach(ch => {
        for (let k = 0; k + 1 < ch.ids.length; k++) if (ch.ids[k] >= 0 && ch.ids[k + 1] >= 0) lineArr.push(ch.ids[k], ch.ids[k + 1]);
        if (ch.closed && ch.ids.length > 2 && ch.ids[ch.ids.length - 1] >= 0 && ch.ids[0] >= 0) lineArr.push(ch.ids[ch.ids.length - 1], ch.ids[0]);
      });
      const lineM = maps.regionW ? maps.M : result.ctx.faceMask;
      lineArr = lineArr.concat(buildLines(F, Object.assign({}, maps, { M: lineM }), S, rand, { maxLines: maps.regionW ? 1700 : 900 }, true));   // mèches, lunettes, collier : liens qui suivent les contours
    } else {
      lineArr = buildLines(F, maps, S, rand, opt, route === 'person');
      const bright = []; for (let i = 0; i < n; i++) if (S.D[Math.round(S.py[i]) * W + Math.round(S.px[i])] > 0.82) bright.push(i);
      const seen = new Set(); for (let t = 0; t < Math.min(bright.length, 140); t++) { const i = bright[Math.floor(rand() * bright.length)]; let bj = -1, bd = 1e9; for (const j of bright) { if (j === i) continue; const d = Math.hypot(S.px[i] - S.px[j], S.py[i] - S.py[j]); if (d < bd && d < S.rMax * 2.6) { bd = d; bj = j; } } if (bj >= 0) { const k = i < bj ? i * 65536 + bj : bj * 65536 + i; if (!seen.has(k)) { seen.add(k); lineArr.push(i, bj); } } }
    }
    const lines = Uint32Array.from(lineArr);
    /* attributs des étoiles : position 3D (léger relief), éclat selon la lumière, COULEUR tirée de la photo */
    const Rb = boxBlur(F.R, W, H, 1, 1), Gb = boxBlur(F.G, W, H, 1, 1), Bb = boxBlur(F.B, W, H, 1, 1);
    const aspect = W / H, pos = new Float32Array(n * 3), mag = new Float32Array(n), tint = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const xi = clamp(Math.floor(S.px[i]), 0, W - 1), yi = clamp(Math.floor(S.py[i]), 0, H - 1), k = yi * W + xi;
      const tone = maps.Lc[k], m = maps.M[k], isFeat = i < nSeed, sk = isFeat ? result.seedsInfo.seeds[i].kind : '';
      pos[i * 3] = (S.px[i] / W - 0.5) * 2 * aspect; pos[i * 3 + 1] = -((S.py[i] / H) - 0.5) * 2;
      pos[i * 3 + 2] = (tone - 0.5) * 0.7 + (m - 0.5) * 0.7 + (rand() - 0.5) * 0.12;
      mag[i] = isFeat ? (sk === 'oval' ? 0.7 + rand() * 0.15 : 1.1 + rand() * 0.3) : clamp(0.55 + 0.75 * tone + (rand() - 0.5) * 0.18, 0.45, 1.4);
      mag[i] *= lerp(0.5, 1, sstep(0.2, 0.6, m));
      if (maps.regionW) mag[i] *= clamp(maps.regionW[k], 0.6, 1);                  // vêtements : plus discrets que le visage
      /* couleur réelle : la TEINTE de la photo, toujours lumineuse (une étoile sombre serait invisible sur le ciel) ;
         c'est la densité des étoiles qui porte l'ombre des cheveux, pas leur extinction */
      const cr = Rb[k], cg = Gb[k], cb = Bb[k], mx = Math.max(cr, cg, cb, 0.06); let nr = cr / mx, ng = cg / mx, nb = cb / mx; const gr = (nr + ng + nb) / 3;
      nr = clamp(gr + (nr - gr) * 1.45); ng = clamp(gr + (ng - gr) * 1.45); nb = clamp(gr + (nb - gr) * 1.45);
      const br = lerp(0.8, 1.0, tone) * (maps.regionW ? clamp(maps.regionW[k], 0.66, 1) : 1);
      let r = (nr * 0.9 + 0.1) * br, g = (ng * 0.9 + 0.1) * br, b = (nb * 0.9 + 0.1) * br;
      if (isFeat) { r = 1; g = sk === 'oval' ? 0.82 : 0.92; b = sk === 'oval' ? 0.62 : 0.72; }
      tint[i * 3] = r; tint[i * 3 + 1] = g; tint[i * 3 + 2] = b;
    }
    /* cadrage automatique : boîte englobante du sujet */
    const sx = [], sy = [];
    for (let i = 0; i < n; i++) { const k = clamp(Math.floor(S.py[i]), 0, H - 1) * W + clamp(Math.floor(S.px[i]), 0, W - 1); if (maps.M[k] > 0.5 && S.D[k] > 0.2) { sx.push(pos[i * 3]); sy.push(pos[i * 3 + 1]); } }
    let bounds = { cx: 0, cy: 0, hw: aspect * 0.9, hh: 0.9 }, cxm = 0, cym = 0, cw = 0;
    if (sx.length > 60) {
      sx.sort((a, b) => a - b); sy.sort((a, b) => a - b);
      const q = (arr, f) => arr[Math.min(arr.length - 1, Math.floor(arr.length * f))], x0 = q(sx, 0.01), x1 = q(sx, 0.99), y0 = q(sy, 0.01), y1 = q(sy, 0.99);
      bounds = { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, hw: Math.max(0.25, (x1 - x0) / 2), hh: Math.max(0.25, (y1 - y0) / 2) };
    }
    for (let i = 0; i < n; i++) { const w = S.D[clamp(Math.floor(S.py[i]), 0, H - 1) * W + clamp(Math.floor(S.px[i]), 0, W - 1)] ** 2 + 0.01; cxm += pos[i * 3] * w; cym += pos[i * 3 + 1] * w; cw += w; }
    progress(1, 'Prêt');
    return { ok: true, n, pos, mag, tint, lines, aspect, bounds, face: { x: cxm / cw, y: cym / cw }, stats: { route, mode: maps.mode, hair: maps.hairMode || null, coverage: +(maps.coverage || 0).toFixed(3), size: [W, H], lines: lines.length / 2, requested: opt.stars, featureStars: nSeed } };
  }

  async function load(src, opt, progress = () => {}) {
    progress(0.02, 'Ouverture de la photo');
    const img = await loadImage(src);
    return analyze(img, opt, progress);
  }

  GX.portrait = { load, analyze, loadImage };
})();
