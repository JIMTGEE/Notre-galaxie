/* ┌─ ★ CE QUE TU PEUX RÉGLER ICI (facultatif — la vraie histoire est dans data.php) ───────────┐
   │  CONSTS       les constellations du ciel (nom, sous-titre, étoiles, lignes) : en ajouter,   │
   │               en retirer, les renommer — cherche  const CONSTS                              │
   │  ACCENTS      couleur de la balise de chaque type d'étoile — cherche  const ACCENTS         │
   │  HN           nombre d'étoiles dans le cœur — cherche  const HN                             │
   │  BEAT         rythme du battement de cœur, en secondes — cherche  const BEAT                │
   │  ramp()       couleurs de la nébuleuse (violet → rose → rouge → orange) — cherche  vec3 ramp │
   │  libellé      « Constellation de … » — cherche  Constellation de                            │
   └──────────────────────────────────────────────────────────────────────────────────────────┘ */
/* =========================================================
   hub.js — le ciel : cœur-nébuleuse, portrait d'étoiles,
   constellations réelles, balises des étoiles, caméra 3D

   Les mêmes étoiles jouent trois rôles (shader VS_HEART) :
     dispersées dans l'espace  →  portrait d'elle  →  cœur qui tourne
   ========================================================= */
(() => {
  'use strict';
  const GX = window.GX, { clamp, lerp, smooth, rng, ease, $, TAU } = GX.util;
  const env = GX.env, small = env.small;
  const S = { ownLabel: 0, vis: 0, bg: 0.3, skyVis: 0.4, starsVis: 0, gather: 0, portOut: 0, lines: 0, hasPort: 0, zoom: 2.6, beacons: 0, consts: 0, wake: 1, par: 0, userZoom: 1, glow: 0 };
  const hub = (GX.hub = { S, interactive: false, orbit: false, beacons: [], onSelect: null, onCore: null, discovered: new Set() });

  const SZ = 0.5, HALF = 14, RANGE = 7, MASK_N = 256, ARC_N = 96;
  const CORE = new THREE.Vector2(0, -0.3), corePos = new THREE.Vector3(0, -0.3, 0.4);
  const heartRaw = t => ({ x: 16 * Math.pow(Math.sin(t), 3), y: 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t) });
  const heartW = t => { const h = heartRaw(t); return { x: h.x * SZ, y: (h.y + 2.5) * SZ }; };
  const toWorld = (p, z = 0) => new THREE.Vector3(p.x * SZ, (p.y + 2.5) * SZ, z);
  const ANGLES = { 'top-dip': 0, 'right-upper': Math.PI / 4, 'right-mid': Math.PI / 2, 'right-lower': 3 * Math.PI / 4, 'bottom-tip': Math.PI, 'left-lower': 5 * Math.PI / 4, 'left-mid': 3 * Math.PI / 2, 'left-upper': 7 * Math.PI / 4 };
  hub.keyPos = {}; hub.CORE = corePos;
  const gauss = () => Math.random() + Math.random() + Math.random() - 1.5;
  const lerpN = lerp;

  /* ---------- tables : arcs équidistants + distance signée du cœur ---------- */
  const arcSample = n => {
    const F = 2400, xs = new Float32Array(F + 1), ys = new Float32Array(F + 1), cum = new Float32Array(F + 1);
    for (let i = 0; i <= F; i++) { const w = heartW(i / F * TAU); xs[i] = w.x; ys[i] = w.y; if (i) cum[i] = cum[i - 1] + Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]); }
    const out = []; let j = 0;
    for (let k = 0; k <= n; k++) {
      const target = k / n * cum[F];
      while (j < F - 1 && cum[j + 1] < target) j++;
      const f = clamp((target - cum[j]) / (cum[j + 1] - cum[j] || 1));
      out.push(new THREE.Vector2(lerp(xs[j], xs[j + 1], f), lerp(ys[j], ys[j + 1], f)));
    }
    return out;
  };
  function buildMask() {
    const M = 128, px = new Float32Array(M + 1), py = new Float32Array(M + 1);
    for (let i = 0; i <= M; i++) { const w = heartW(i / M * TAU); px[i] = w.x; py[i] = w.y; }
    const data = new Uint8Array(MASK_N * MASK_N);
    for (let j = 0; j < MASK_N; j++) {
      const y = -HALF + (j + 0.5) / MASK_N * 2 * HALF;
      for (let i = 0; i < MASK_N; i++) {
        const x = -HALF + (i + 0.5) / MASK_N * 2 * HALF; let d2 = 1e9, inside = false;
        for (let k = 0; k < M; k++) {
          const ax = px[k], ay = py[k], bx = px[k + 1], by = py[k + 1], ex = bx - ax, ey = by - ay;
          let h = ((x - ax) * ex + (y - ay) * ey) / (ex * ex + ey * ey + 1e-12); h = h < 0 ? 0 : h > 1 ? 1 : h;
          const dx = x - ax - ex * h, dy = y - ay - ey * h, dd = dx * dx + dy * dy; if (dd < d2) d2 = dd;
          if ((ay > y) !== (by > y) && x < ax + (y - ay) / (by - ay) * ex) inside = !inside;
        }
        data[j * MASK_N + i] = clamp(Math.round((((inside ? -1 : 1) * Math.sqrt(d2)) / RANGE * 0.5 + 0.5) * 255), 0, 255) | 0;
      }
    }
    const t = new THREE.DataTexture(data, MASK_N, MASK_N, THREE.LuminanceFormat, THREE.UnsignedByteType);
    t.minFilter = t.magFilter = THREE.LinearFilter; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.generateMipmaps = false; t.needsUpdate = true;
    return t;
  }

  /* ---------- GLSL ---------- */
  const COMMON = `
  float hash12(vec2 p){vec3 p3=fract(vec3(p.xyx)*.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}
  mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,s,-s,c);}`;
  const HA_GLSL = `
  uniform vec2 uHP[${ARC_N}];
  vec2 HA(float a){float u=fract(a)*${ARC_N}.;float f=fract(u);int i=int(floor(u));int j=i+1;if(j>=${ARC_N})j=0;return mix(uHP[i],uHP[j],f);}`;
  const PORT_GLSL = `
  uniform float uTime,uWake;uniform vec3 uPtr;
  vec3 pwob(vec3 p){float t=uTime;return vec3(sin(t*.6+p.y*3.1+p.x*1.7),cos(t*.5+p.x*2.9),sin(t*.4+p.x*p.y))*.035;}
  vec2 wake(vec2 p){vec2 d=p-uPtr.xy;float r2=dot(d,d);return normalize(d+vec2(1e-4))*exp(-r2/1.8)*uWake*.45;}`;

  const BG_FS = `
  uniform sampler2D uNoise;uniform float uTime,uBg;varying vec3 vW;
  ${COMMON}
  vec4 nz(vec2 uv){return texture2D(uNoise,uv);}
  float zone(vec2 p,vec2 c,vec2 r){vec2 d=(p-c)/r;return exp(-dot(d,d));}
  void main(){
    vec2 p=vW.xy;float t=uTime;
    vec2 uv=p*.0042;
    vec2 w=nz(uv*.6+vec2(t*.0018,t*.0013)).rg-.5;
    vec4 A=nz(uv+w*.5+vec2(.13,.71)+vec2(t*.0009,0.));
    vec4 B=nz(uv*2.6+w*.9+vec2(.5,.2)+vec2(-t*.0024,t*.0015));
    vec4 C=nz(uv*.42+vec2(.9,.4)+vec2(0.,t*.0006));
    vec3 col=mix(vec3(.006,.010,.034),vec3(.022,.012,.056),smoothstep(-50.,60.,p.y));
    float cl=smoothstep(.32,.78,A.r*.55+B.g*.45);
    col+=mix(vec3(.04,.10,.46),vec3(.36,.09,.54),C.g)*cl*.2;
    float zp=zone(p,vec2(14.,34.),vec2(50.,28.));
    float pk=smoothstep(.34,.86,A.g*.5+B.r*.5);
    col+=vec3(.95,.18,.46)*zp*pk*.55+vec3(1.,.55,.7)*zp*pow(pk,4.)*.28;
    float zb=zone(p,vec2(-52.,-26.),vec2(40.,26.));
    col+=vec3(.12,.36,.98)*zb*smoothstep(.3,.8,B.g*.6+A.b*.4)*.34+vec3(.5,.75,1.)*zb*pow(A.b,3.)*.2;
    float zd=zone(p,vec2(46.,-34.),vec2(32.,17.));
    col+=mix(vec3(.30,.19,.15),vec3(.64,.46,.40),B.g)*zd*smoothstep(.35,.75,A.a*.6+B.r*.4)*.3;
    col+=vec3(1.,.45,.15)*pow(B.b,3.5)*zd*.4;
    float zv=zone(p,vec2(66.,8.),vec2(32.,40.));
    col+=vec3(.36,.12,.72)*zv*smoothstep(.3,.8,A.r*.5+B.a*.5)*.26;
    float dB=(p.y-p.x*.28-4.)/26.;
    float band=exp(-dB*dB);
    col+=vec3(.58,.52,.66)*band*(.05+.10*A.g)*(1.-.85*smoothstep(.45,.72,B.a));
    col*=uBg;
    col=1.-exp(-col*1.3);
    col+=(hash12(gl_FragCoord.xy+fract(t)*57.)-.5)*(1./140.);
    gl_FragColor=vec4(max(col,0.),1.);
  }`;

  const PFS = `
  uniform float uBokeh;varying vec3 vC;varying float vA,vK,vP;
  void main(){
    vec2 q=gl_PointCoord-.5;float d=length(q)*2.;
    float a;
    if(uBokeh>.5){ a=(1.-smoothstep(.55,1.,d))*.5+exp(-pow((d-.82)*7.,2.))*.5; }
    else{
      float core=exp(-d*d*mix(10.,1.1,vP)),halo=exp(-d*d*mix(3.,1.4,vP))*mix(.4,.2,vP);
      float sp=vK*(exp(-abs(q.x)*55.)*(1.-smoothstep(.15,.5,abs(q.y)))+exp(-abs(q.y)*55.)*(1.-smoothstep(.15,.5,abs(q.x))))*.9;
      a=(core+halo)*(1.-smoothstep(.75,1.,d))+sp;
    }
    gl_FragColor=vec4(vC*a*vA,1.);
  }`;
  const VS_SKY = `
  uniform float uTime,uPx,uFade;attribute float aSize,aPhase,aK;attribute vec3 aColor;varying vec3 vC;varying float vA,vK,vP;
  void main(){
    vec4 mv=modelViewMatrix*vec4(position,1.);
    float tw=.55+.45*sin(uTime*(.6+aPhase*1.6)+aPhase*40.);
    gl_PointSize=min(aSize*(1.+aK*2.4)*uPx*(60./-mv.z)*(.8+.2*tw),90.*uPx);
    vC=aColor;vA=tw*uFade*(1.+aK*.6)*smoothstep(1.,8.,-mv.z);vK=aK;
    vP=0.;gl_Position=projectionMatrix*mv;
  }`;
  const VS_BOKEH = `
  uniform float uTime,uPx,uFade;attribute float aSize,aPhase,aK;attribute vec3 aColor;varying vec3 vC;varying float vA,vK,vP;
  void main(){
    float ph=aPhase*40.;
    vec3 pos=position+vec3(sin(uTime*.11+ph)*1.2,cos(uTime*.09+ph*1.3)*.9,0.);
    vec4 mv=modelViewMatrix*vec4(pos,1.);
    gl_PointSize=min(aSize*uPx*(60./-mv.z),70.*uPx);
    vC=aColor;vA=uFade*(.6+.4*sin(uTime*.4+ph))*smoothstep(2.,9.,-mv.z);vK=0.;
    vP=0.;gl_Position=projectionMatrix*mv;
  }`;
  const VS_HEART = `
  uniform float uPx,uFade,uBeat,uGather,uPortOut,uHasPort;uniform vec2 uC;
  attribute float aSize,aPhase,aK,aR,aT,aSp,aZ,aDelay,aPB;attribute vec3 aColor,aPT,aSP,aPC;varying vec3 vC;varying float vA,vK,vP;
  ${HA_GLSL}
  ${PORT_GLSL}
  float ez(float x){x=clamp(x,0.,1.);return x*x*(3.-2.*x);}
  void main(){
    float th=aT+uTime*aSp*(1.3-.6*aR);
    vec2 hp=uC+aR*(HA(th)-uC);
    float ph=aPhase*40.;
    hp+=.07*vec2(sin(uTime*.7+ph),cos(uTime*.55+ph*.77));
    vec3 pH=vec3(hp,aZ+.15*sin(uTime*.3+ph));
    vec3 pP=aPT+pwob(aPT);
    vec3 pF=uHasPort>.5?pP:pH;
    float eg=ez(uGather*1.8-aDelay*.8);
    vec3 pos=mix(aSP,pF,eg);
    vec2 dd=pF.xy-aSP.xy;
    pos.xy+=normalize(vec2(-dd.y,dd.x)+vec2(1e-4))*sin(3.14159*eg)*min(length(dd),30.)*.18;
    float d2=fract(aDelay*7.31+aPhase);
    float ep=ez(uPortOut*1.8-d2*.8);
    vec2 de=pH.xy-pos.xy;
    vec3 p2=mix(pos,pH,ep);
    p2.xy+=normalize(vec2(-de.y,de.x)+vec2(1e-4))*sin(3.14159*ep)*min(length(de),30.)*.16;
    pos=p2;
    pos.xy+=wake(pos.xy)*step(.9,uGather);
    float pa=uHasPort*(1.-ep)*eg;
    float bright=mix(1.,aPB,pa);
    vec4 mv=modelViewMatrix*vec4(pos,1.);
    float tw=.55+.45*sin(uTime*(1.1+aPhase*2.)+ph*1.5);
    float fl=pow(max(0.,sin(uTime*(.35+aPhase*.5)+aPhase*90.)),20.);
    float kk=aK*(1.-pa),sz=mix(aSize,clamp(aSize,1.1,1.7),pa);                       /* portrait : points fins, sans grandes étoiles à branches */
    gl_PointSize=min(sz*(1.+kk*2.2)*uPx*(20./-mv.z)*(.75+.25*tw+fl*.9*(1.-pa*.7))*mix(1.,.95+.5*bright,pa)*(.5+.5*eg),80.*uPx);
    vC=mix(aColor,aPC,pa);
    vA=mix(tw*.5+fl*1.2,.8+.2*tw,pa)*uFade*(1.+uBeat*.4)*mix(1.,.6*bright,pa)*(.3+.7*eg);
    vK=kk;
    vP=pa;gl_Position=projectionMatrix*mv;
  }`;
  const VS_SPORE = `
  uniform float uTime,uPx,uFade;
  attribute float aSize,aPhase,aK,aT,aLife,aDist;attribute vec3 aColor;varying vec3 vC;varying float vA,vK,vP;
  ${HA_GLSL}
  void main(){
    float u=fract(uTime/aLife+aPhase);
    vec2 h=HA(aT),d=HA(aT+.004)-HA(aT-.004);
    vec2 n=normalize(vec2(-d.y,d.x)+vec2(1e-5));
    float ph=aPhase*6.2831;
    vec2 pos=h+n*(u*aDist)+vec2(sin(u*7.+ph),cos(u*5.+ph*1.3))*.45*u+vec2(0.,u*u*1.4);
    vec4 mv=modelViewMatrix*vec4(pos,.5+sin(ph)*1.5,1.);
    float env=sin(3.14159*u);env*=env;
    gl_PointSize=min(aSize*uPx*(20./-mv.z)*(.6+.4*env),60.*uPx);
    vC=aColor;vA=env*uFade*(.7+.3*sin(uTime*2.+ph*5.));vK=0.;
    vP=0.;gl_Position=projectionMatrix*mv;
  }`;
  const VS_CST = `
  uniform float uTime,uPx,uFade,uHov[6];attribute float aSize,aPhase,aK,aG;attribute vec3 aColor;varying vec3 vC;varying float vA,vK,vP;
  void main(){
    vec4 mv=modelViewMatrix*vec4(position,1.);
    float h=uHov[int(aG)];
    float tw=.6+.4*sin(uTime*(.8+aPhase*2.2)+aPhase*50.);
    gl_PointSize=min(aSize*(1.+aK*2.6)*uPx*(60./-mv.z)*(.85+.25*tw)*(1.+h*.5),90.*uPx);
    vC=aColor;vA=tw*uFade*(.8+h*.9)*(1.+aK*.5);vK=aK;
    vP=0.;gl_Position=projectionMatrix*mv;
  }`;
  const VS_CLINE = `
  uniform float uTime,uFade,uHov[6];attribute float aU,aG,aLd;varying float vA;
  void main(){
    float h=uHov[int(aG)];
    float ph=fract(uTime*.11+aLd);
    float head=ph*1.7-.35;
    float pulse=exp(-pow((aU-head)*5.,2.));
    vA=uFade*(.14+.55*pulse+h*.55);
    vec4 mv=modelViewMatrix*vec4(position,1.);
    gl_Position=projectionMatrix*mv;
  }`;
  const HEART_FS = `
  uniform sampler2D uNoise,uMask;
  uniform float uTime,uBeat,uBeatPh,uProg,uAlpha,uMode,uGain;
  uniform vec2 uCore;uniform vec4 uRipple;
  varying vec2 vP;
  const float HALF=${HALF}.,RANGE=${RANGE}.;
  ${COMMON}
  vec4 nz(vec2 uv){return texture2D(uNoise,uv);}
  vec3 ramp(float x){
    vec3 c=mix(vec3(.012,.006,.06),vec3(.22,.05,.47),smoothstep(0.,.26,x));
    c=mix(c,vec3(.74,.06,.35),smoothstep(.2,.5,x));
    c=mix(c,vec3(.97,.09,.15),smoothstep(.45,.72,x));
    c=mix(c,vec3(1.,.42,.17),smoothstep(.68,.9,x));
    return mix(c,vec3(1.,.86,.62),smoothstep(.88,1.,x));
  }
  void main(){
    vec2 p=vP;float t=uTime;
    float sd=(texture2D(uMask,p/(2.*HALF)+.5).r-.5)*2.*RANGE;
    float outd=max(sd,0.);
    float inside=1.-smoothstep(-.5,.35,sd);
    vec2 cp=p-uCore;float r=length(cp);
    float tw=.45*sin(t*.09)*exp(-r*.10)+t*.012+uMode*1.3;
    vec2 q=uCore+rot(tw)*cp*(1.-.025*uBeat);
    float zm=uMode<.5?1.:(uMode<1.5?.8:1.35);
    vec2 uv=q*.042*zm+uMode*vec2(.37,.21);
    vec2 w1=nz(uv*.9+vec2(t*.011,-t*.008)).rg-.5;
    vec2 w2=nz(uv*2.1+w1*.9+vec2(-t*.015,t*.011)+.31).ba-.5;
    vec2 uw=uv+w1*.27+w2*.08;
    vec4 A=nz(uw*1.5+.17);
    vec4 B=nz(uw*3.4+w2*.5+vec2(.63,.21)+vec2(t*.004,-t*.003));
    vec4 C=nz(uw*.8+vec2(.5,.9));
    float dens=smoothstep(.3,.78,A.r*.55+B.g*.22+C.r*.23);
    float ridge=A.b*.55+B.b*.45;
    float depth=clamp(-sd/5.2,0.,1.);
    vec3 res=vec3(0.);
    if(uMode<.5){
      float x=dens*.74+ridge*.2+(1.-depth)*.3-.16;
      vec3 col=ramp(clamp(x,0.,1.))*(.1+dens*1.05);
      float dark=smoothstep(.5,.68,A.a*.7+B.r*.3);
      col*=1.-.9*dark;
      float fil=pow(clamp(ridge*1.25,0.,1.),3.2)*smoothstep(.3,.7,dens);
      col+=vec3(1.,.52,.25)*fil*.6+vec3(1.,.85,.7)*pow(fil,2.2)*.2;
      col*=.8+.4*smoothstep(-6.,7.,cp.x*.55-cp.y*.8);
      float cr=r/3.3,coreG=exp(-cr*cr),coreW=exp(-r*r/.35);
      vec3 coreCol=mix(vec3(.2,.16,.85),vec3(.7,.84,1.),coreG*coreG);
      col=mix(col,coreCol*(.5+dens*.8),clamp(coreG*.75,0.,1.));
      col+=vec3(.7,.85,1.)*coreW*(.8+uBeat*.7+uProg*.8);
      col+=vec3(.45,.35,1.)*exp(-r*r/9.)*.28;
      res=col*inside;
      float rimN=nz(uw*5.2+.4).g;
      float u=(sd+.30)/.5;
      float rim=exp(-u*u)*(.55+.9*rimN);
      float u2=(sd+1.1)/1.6;
      float rimW=nz(uw*2.4+.7).r;
      float band=exp(-u2*u2)*(.3+.9*rimW);
      res+=vec3(1.,.55,.78)*rim*.34+vec3(1.,.9,.85)*pow(rim,3.)*.16;
      res+=mix(vec3(.92,.1,.32),vec3(1.,.45,.68),rimN)*band*.34*inside;
      float haze=exp(-outd*.75)*(.25+1.1*dens);
      res+=vec3(.95,.22,.52)*haze*.24*(1.-inside);
      float wisp=smoothstep(.52,.82,B.a*.5+A.g*.5);
      res+=mix(vec3(.55,.2,.95),vec3(1.,.35,.55),A.r)*exp(-outd*.38)*wisp*.3*(1.-inside);
      float rr=clamp((uBeatPh-.02)/.55,0.,1.);
      float ur=(r-rr*16.)/1.4;
      res+=vec3(1.,.6,.82)*exp(-ur*ur)*(1.-rr)*.28*(inside*.8+.25);
      float age=t-uRipple.z;
      float rd=length(p-uRipple.xy);
      float ur2=(rd-age*7.)/.9;
      res+=vec3(1.,.82,.9)*exp(-ur2*ur2)*exp(-age*.8)*uRipple.w*step(0.,age)*(.5*inside+.25);
      res*=1.+.22*uBeat*(.35+.65*(1.-depth));
    }else if(uMode<1.5){
      vec3 c=mix(vec3(.10,.07,.42),vec3(.78,.14,.62),smoothstep(.2,.8,dens))*(.4+dens);
      float g=exp(-outd*.38)*(1.-.6*smoothstep(0.,-3.,sd));
      res=c*g*.7+vec3(.5,.2,.9)*exp(-outd*.2)*.1;
      res*=1.+.15*uBeat;
    }else{
      float v=smoothstep(.55,.85,B.g*.55+A.a*.45)*(1.-smoothstep(-1.5,.6,sd));
      res=mix(vec3(1.,.3,.5),vec3(.55,.35,1.),A.r)*v*.34+vec3(1.,.6,.4)*pow(ridge,4.)*v*.35;
    }
    res*=uGain;
    res=1.-exp(-res*1.15);
    res+=(hash12(gl_FragCoord.xy+fract(t)*91.)-.5)*(1./160.);
    gl_FragColor=vec4(max(res,0.)*uAlpha,1.);
  }`;

  const BEACON_FS = `
  uniform float uTime,uK,uH,uShape,uPing,uVis,uLock;uniform vec3 uCol;varying vec2 vUv;
  float dot2(vec2 v){return dot(v,v);}
  float sdMoon(vec2 p){return max(length(p)-.8,-(length(p-vec2(.4,.12))-.72));}
  float sdDia(vec2 p){p=abs(p);return (p.x+p.y-.82)*.7071;}
  float sdTri(vec2 p){p.x+=.1;return max(-p.x-.5,max(.5*p.x+.866*p.y-.5,.5*p.x-.866*p.y-.5));}
  float sdHeart(vec2 p){p.y+=.55;p.x=abs(p.x);if(p.y+p.x>1.)return sqrt(dot2(p-vec2(.25,.75)))-sqrt(2.)/4.;return sqrt(min(dot2(p-vec2(0.,1.)),dot2(p-.5*max(p.x+p.y,0.))))*sign(p.x-p.y);}
  float sdSpark(vec2 p){p=abs(p);return sqrt(p.x)+sqrt(p.y)-.82;}
  float sdHex(vec2 p){p=abs(p);return max(p.x*.866+p.y*.5,p.y)-.7;}
  void main(){
    vec2 p=(vUv-.5)*2.;float r=length(p),a=atan(p.y,p.x);
    vec3 gold=vec3(1.,.82,.5);vec3 col=mix(uCol,gold,uK);
    float core=exp(-r*r*34.)*1.5+exp(-r*r*7.)*.4;
    float sp=(exp(-abs(p.x)*42.)*(1.-smoothstep(.1,.8,abs(p.y)))+exp(-abs(p.y)*42.)*(1.-smoothstep(.1,.8,abs(p.x))))*(.55+.4*uH);
    float ring=exp(-pow((r-.46-.05*uH)*24.,2.));
    float dash=smoothstep(-.2,.5,sin(a*10.+uTime*(1.+uH*2.4)*(uK>.5?.35:1.)));
    float ph=fract(uTime*.3+uPing);
    float ping=exp(-pow((r-ph*.98)*13.,2.))*(1.-ph)*(1.-uK*.8);
    vec2 q=(p-vec2(.6,.6))/.21;
    float d=uShape<.5?sdMoon(q):uShape<1.5?sdDia(q):uShape<2.5?sdTri(q):uShape<3.5?sdHeart(q*.9):uShape<4.5?sdSpark(q):sdHex(q);
    float badge=smoothstep(.2,.0,abs(d))*.95+smoothstep(.15,-.15,d)*.12;
    float bd=smoothstep(1.25,1.,length(q))*.35;
    float m=core+sp+ring*dash*.75*(1.-uLock*.6)+ping*.9+badge*(.55+.45*uH)+bd;
    m*=uVis;
    gl_FragColor=vec4(col*m*(.85+.15*sin(uTime*2.2+uPing*9.)),1.);
  }`;

  /* ---------- constellations réelles (coordonnées stylisées) ---------- */
  const CONSTS = [
    { name: 'Orion', sub: 'Le chasseur', L: [-0.74, 0.34], P: [-0.42, 0.74], rot: 0.12, pts: [[-0.9, 1.1, .95, '#ffb48a'], [0.9, 1.0, .75], [0, 1.4, .4], [-0.36, 0.1, .7], [0, 0, .75], [0.36, -0.1, .7], [-0.7, -1.2, .6], [0.85, -1.15, 1, '#a9c8ff'], [0, -0.5, .3], [0.02, -0.75, .35]], lines: [[0, 3], [1, 5], [3, 4], [4, 5], [3, 6], [5, 7], [0, 1], [2, 0], [2, 1], [4, 8], [8, 9]] },
    { name: 'Cassiopée', sub: 'La reine', L: [0.72, 0.62], P: [0.46, 0.82], rot: -0.1, pts: [[-1.2, 0.2, .6], [-0.6, -0.4, .75], [0, 0.15, .85], [0.6, -0.45, .7], [1.2, 0.1, .6]], lines: [[0, 1], [1, 2], [2, 3], [3, 4]] },
    { name: 'La Grande Ourse', sub: 'Le chariot', L: [-0.66, -0.6], P: [-0.42, -0.74], rot: 0.18, pts: [[0, 0, .8], [-0.05, -0.55, .7], [0.55, -0.6, .7], [0.5, -0.05, .65], [1.1, 0.1, .8], [1.65, 0.0, .75], [2.25, -0.2, .85]], lines: [[0, 1], [1, 2], [2, 3], [3, 0], [3, 4], [4, 5], [5, 6]] },
    { name: 'Le Cygne', sub: 'La croix du nord', L: [0.8, -0.18], P: [0.5, -0.64], rot: 0.5, pts: [[0, 1.2, .9], [0, 0, .75], [0, -1.2, .6, '#ffd2a0'], [-0.9, 0.1, .55], [0.9, 0.05, .55]], lines: [[0, 1], [1, 2], [3, 1], [1, 4]] },
    { name: 'La Lyre', sub: 'La harpe d\'Orphée', L: [-0.24, 0.8], P: [0.02, 0.62], rot: -0.25, pts: [[0, 1.0, 1, '#cfe4ff'], [-0.3, 0.2, .5], [0.4, 0.1, .5], [0.55, -0.5, .45], [-0.15, -0.6, .5]], lines: [[0, 1], [0, 2], [1, 2], [2, 3], [3, 4], [4, 1]] },
    { name: 'Le Scorpion', sub: 'Le cœur rouge', L: [0.5, -0.74], P: [0.08, -0.88], rot: -0.1, pts: [[-0.8, 1.0, .55], [-0.55, 0.55, .6], [-0.3, 0.3, .65], [0, 0, 1, '#ff9a7a'], [0.15, -0.4, .6], [0.3, -0.9, .55], [0.7, -1.3, .6], [1.2, -1.35, .6], [1.5, -1.0, .65], [1.4, -0.7, .55]], lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8], [8, 9]] },
  ];

  /* ---------- helpers de construction ---------- */
  const mkCanvas = n => { const c = document.createElement('canvas'); c.width = c.height = n; return c; };
  const PAL = [[.08, '#ff8a78'], [.2, '#ffc27a'], [.4, '#fff1c9'], [.8, '#ffffff'], [1, '#9fc0ff']];
  const pickColor = r => PAL.find(p => (r === undefined ? Math.random() : r) <= p[0])[1];

  function init(portrait) {
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 700);
    hub.scene = scene; hub.camera = camera;
    const uTime = GX.uTime, uPx = GX.uPx;
    const uBeat = { value: 0 }, uBeatPh = { value: 0 }, uProg = { value: 0 }, uWake = { value: 1 };
    const uPtr = { value: new THREE.Vector3(999, 999, 0) };
    const uRipple = { value: new THREE.Vector4(0, 0, -1000, 0) };
    const maskTex = buildMask(), arc = arcSample(ARC_N), uHP = { value: arc.slice(0, ARC_N) };
    let armed = false; GX.input.on('move', () => { if (S.gather > 0.98) armed = true; });
    hub.ripple = (x, y, s = 1) => uRipple.value.set(x, y, GX.T, s);
    hub.uRipple = uRipple;
    const rand = rng(1234);
    const K = small ? 0.55 : 1;

    const addAdditive = (obj, order = 0) => { obj.frustumCulled = false; obj.renderOrder = order; scene.add(obj); return obj; };
    const pointsMat = (vs, extra = {}, bokeh = 0) => new THREE.ShaderMaterial({
      uniforms: Object.assign({ uTime, uPx, uFade: { value: 1 }, uBokeh: { value: bokeh } }, extra),
      vertexShader: vs, fragmentShader: PFS, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
    });
    function buildPoints(n, gen, mat) {
      const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), sz = new Float32Array(n), ph = new Float32Array(n), kk = new Float32Array(n), extra = {};
      const c = new THREE.Color();
      for (let i = 0; i < n; i++) {
        const p = gen(i);
        pos[i * 3] = p.x || 0; pos[i * 3 + 1] = p.y || 0; pos[i * 3 + 2] = p.z || 0;
        c.set(p.c); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
        sz[i] = p.s; ph[i] = Math.random(); kk[i] = p.k || 0;
        if (p.e) for (const key in p.e) {
          const v = p.e[key];
          if (Array.isArray(v)) { const a = (extra[key] || (extra[key] = { w: v.length, d: new Float32Array(n * v.length) })); a.d.set(v, i * v.length); }
          else (extra[key] || (extra[key] = { w: 1, d: new Float32Array(n) })).d[i] = v;
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
      g.setAttribute('aSize', new THREE.BufferAttribute(sz, 1)); g.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1)); g.setAttribute('aK', new THREE.BufferAttribute(kk, 1));
      for (const key in extra) g.setAttribute(key, new THREE.BufferAttribute(extra[key].d, extra[key].w));
      return addAdditive(new THREE.Points(g, mat));
    }

    /* fond nébuleux */
    const bgMat = new THREE.ShaderMaterial({
      uniforms: { uNoise: { value: GX.noiseTex }, uTime, uBg: { value: S.bg } },
      vertexShader: 'varying vec3 vW;void main(){vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}',
      fragmentShader: BG_FS, depthTest: false, depthWrite: false,
    });
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), bgMat); bg.position.z = -80; addAdditive(bg, -100);

    /* couches d'étoiles lointaines (rotation lente) */
    const skyLayers = [];
    const layer = (n, z0, z1, s0, s1, spread, band, rotSpeed) => {
      const mat = pointsMat(VS_SKY, { uFade: { value: 0 } });
      const o = buildPoints(Math.floor(n * K), () => {
        let x = (Math.random() - 0.5) * 340 * spread, y = (Math.random() - 0.5) * 200 * spread;
        if (band && Math.random() < 0.5) { x = (Math.random() - 0.5) * 340; y = x * 0.28 + gauss() * 40; }
        const big = Math.random() < 0.025;
        return { x, y, z: lerpN(z0, z1, Math.random()), c: pickColor(), s: lerpN(s0, s1, Math.pow(Math.random(), 3)) * (big ? 1.5 : 1), k: big ? 1 : 0 };
      }, mat);
      skyLayers.push({ o, mat, rot: rotSpeed });
    };
    layer(2600, -170, -90, 2, 5.5, 1, true, 0.0012); layer(1100, -90, -30, 2, 6.5, 0.6, false, -0.0016); layer(300, -30, -8, 2.5, 6.5, 0.3, false, 0.0021);
    const bokehMat = pointsMat(VS_BOKEH, { uFade: { value: 0 } }, 1);
    buildPoints(small ? 14 : 26, () => ({ x: (Math.random() - 0.5) * 30, y: (Math.random() - 0.5) * 18, z: lerpN(4, 10, Math.random()), c: ['#F3A8C7', '#E9C988', '#9fc0ff'][Math.floor(Math.random() * 3)], s: lerpN(5, 12, Math.random()) }), bokehMat);
    /* poussière volumétrique autour du cœur : donne du relief quand on tourne la caméra */
    const dustMat = pointsMat(VS_SKY, { uFade: { value: 0 } });
    buildPoints(Math.floor(520 * K), () => { const a = Math.random() * TAU, r = lerpN(7, 28, Math.pow(Math.random(), 0.7)); return { x: Math.cos(a) * r * 1.25, y: Math.sin(a) * r * 0.85, z: lerpN(-14, 7, Math.random()), c: ['#F3A8C7', '#cbbfff', '#E9C988', '#ffffff'][Math.floor(Math.random() * 4)], s: lerpN(1.5, 4.2, Math.pow(Math.random(), 2)) }; }, dustMat);

    /* cœur-nébuleuse : 3 couches de profondeur */
    const heartGeo = new THREE.PlaneGeometry(HALF * 2, HALF * 2);
    const heartVS = 'varying vec2 vP;void main(){vP=position.xy;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}';
    const mkLayer = (mode, gain, order) => {
      const mat = new THREE.ShaderMaterial({
        uniforms: { uNoise: { value: GX.noiseTex }, uMask: { value: maskTex }, uTime, uBeat, uBeatPh, uProg, uAlpha: { value: 0 }, uMode: { value: mode }, uGain: { value: gain }, uCore: { value: CORE }, uRipple },
        vertexShader: heartVS, fragmentShader: HEART_FS, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
      });
      return addAdditive(new THREE.Mesh(heartGeo, mat), order);
    };
    const hBack = mkLayer(1, 0.5, -50), hMain = mkLayer(0, 0.9, -40), hFront = mkLayer(2, 0.9, 40);

    /* étoiles du cœur / portrait */
    const HN = Math.max(small ? 3600 : 8200, ((portrait && portrait.ok) ? portrait.n : 0) + (small ? 1800 : 2400));   // assez d'étoiles pour le portrait + le décor
    const hasPort = !!(portrait && portrait.ok && portrait.n > 200);
    S.hasPort = hasPort ? 1 : 0;
    const P = hasPort ? Math.min(portrait.n, HN - 120) : 0;
    let psc = 7.4, pox = 0, poy = 0.3, bw = 8, bh = 7.4;
    if (hasPort) {                                                   // cadrage : le sujet remplit la scène, un peu relevé pour laisser place à la légende
      const b = portrait.bounds, tt = Math.tan(camera.fov * Math.PI / 360), bz = Math.max(17 * SZ / tt, 18 * SZ / (camera.aspect * tt)), vh = tt * bz * 1.0, vw = vh * camera.aspect;
      psc = clamp(Math.min(vh * 0.84 / b.hh, vw * 0.94 / b.hw), 3, 40);     // le portrait épouse l'écran : plein cadre sur téléphone, centré sur ordinateur
      pox = -b.cx * psc; poy = vh * 0.07 - b.cy * psc; bw = b.hw * psc; bh = b.hh * psc;
    }
    hub.portraitInfo = hasPort ? { sc: psc, aspect: portrait.aspect, ox: pox, oy: poy, bw, bh } : null;
    const heartMat = pointsMat(VS_HEART, { uBeat, uHP, uC: { value: CORE }, uFade: { value: 0 }, uGather: { value: 0 }, uPortOut: { value: 0 }, uHasPort: { value: S.hasPort }, uPtr, uWake }, 0);
    const STAR_COLS = ['#ffe4f0', '#ffd6a8', '#cfe0ff', '#ffffff', '#ffb3d1', '#ffe9b8'];
    const halfW = hasPort ? Math.max(bw, 4) : 8;
    buildPoints(HN, i => {
      const g = Math.random(); let r, sp = lerpN(0.006, 0.016, Math.random());
      if (g < 0.55) r = Math.sqrt(Math.random()) * 0.97; else if (g < 0.63) { r = Math.random() * 0.22; sp *= 1.5; } else { r = 0.84 + 0.2 * Math.pow(Math.random(), 1.3); sp *= 1.25; }
      const nearCore = r < 0.25;
      // dispersion initiale : grande sphère autour de la scène
      const u = Math.random() * 2 - 1, a = Math.random() * TAU, rad = 14 + 62 * Math.pow(Math.random(), 0.6), sq = Math.sqrt(1 - u * u);
      const sp3 = [Math.cos(a) * sq * rad * 1.4, u * rad * 0.9, Math.sin(a) * sq * rad - 8];
      let pt, pb, pc, delay;
      if (i < P) {
        const x = portrait.pos[i * 3] * psc + pox, y = portrait.pos[i * 3 + 1] * psc + poy, z = portrait.pos[i * 3 + 2] * 1.6;
        pt = [x, y, z]; pb = 0.5 + portrait.mag[i] * 0.9; pc = [portrait.tint[i * 3], portrait.tint[i * 3 + 1], portrait.tint[i * 3 + 2]];
        delay = clamp(0.25 * Math.random() + 0.75 * Math.hypot(x - (portrait.face.x * psc + pox), y - (portrait.face.y * psc + poy)) / 11);
      } else {
        let x, y; do { x = (Math.random() * 2 - 1) * Math.max(halfW * 1.9, 13); y = (Math.random() * 2 - 1) * 11.5; } while (hasPort && Math.abs(x - pox) < bw * 1.0 && Math.abs(y - poy) < bh * 1.0);
        pt = [x, y, (Math.random() - 0.5) * 6]; pb = 0.3; pc = [0.7, 0.78, 1]; delay = Math.random();
      }
      return {
        c: nearCore ? (Math.random() < 0.7 ? '#cfe4ff' : '#ffffff') : STAR_COLS[Math.floor(Math.random() * STAR_COLS.length)],
        s: lerpN(0.8, 3.2, Math.pow(Math.random(), 2.4)), k: Math.random() < 0.035 ? 1 : 0,
        e: { aR: r, aT: Math.random(), aSp: sp, aZ: (Math.random() - 0.5) * 3, aDelay: delay, aPB: pb, aPT: pt, aSP: sp3, aPC: pc },
      };
    }, heartMat);

    /* spores de lumière */
    const sporeMat = pointsMat(VS_SPORE, { uHP, uFade: { value: 0 } });
    buildPoints(small ? 200 : 520, () => ({ c: ['#F3A8C7', '#E9C988', '#ffffff', '#cbbfff'][Math.floor(Math.random() * 4)], s: lerpN(1.6, 5, Math.pow(Math.random(), 2)), e: { aT: Math.random(), aLife: lerpN(7, 18, Math.random()), aDist: lerpN(1.2, 4.2, Math.random()) } }), sporeMat);

    /* lignes du portrait */
    let portLines = null;
    const uLines = { value: 0 }, uPortOut = heartMat.uniforms.uPortOut, uGather = heartMat.uniforms.uGather;
    if (hasPort) {
      const L = portrait.lines, nl = L.length / 2, pos = new Float32Array(nl * 6), ld = new Float32Array(nl * 2);
      for (let k = 0; k < nl; k++) {
        const d = rand();
        for (let e = 0; e < 2; e++) {
          const i = L[k * 2 + e];
          pos[(k * 2 + e) * 3] = portrait.pos[i * 3] * psc + pox; pos[(k * 2 + e) * 3 + 1] = portrait.pos[i * 3 + 1] * psc + poy; pos[(k * 2 + e) * 3 + 2] = portrait.pos[i * 3 + 2] * 1.6;
          ld[k * 2 + e] = d;
        }
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aLd', new THREE.BufferAttribute(ld, 1));
      const m = new THREE.ShaderMaterial({
        uniforms: { uTime, uWake, uPtr, uLines, uPortOut, uGather },
        vertexShader: `uniform float uLines,uPortOut,uGather;attribute float aLd;varying float vA;${PORT_GLSL}
          void main(){vec3 p=position+pwob(position);p.xy+=wake(p.xy);
            float rev=smoothstep(aLd*.75,aLd*.75+.25,uLines);float sh=.6+.4*sin(uTime*1.3+aLd*40.);
            vA=rev*sh*(1.-smoothstep(0.,.3,uPortOut))*smoothstep(.85,1.,uGather);
            gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
        fragmentShader: 'varying float vA;void main(){gl_FragColor=vec4(vec3(.95,.86,.68)*vA*.6,1.);}',
        transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
      });
      portLines = addAdditive(new THREE.LineSegments(g, m), 16);
    }
    /* halo derrière le portrait */
    const haloTex = (() => { const c = mkCanvas(256), g = c.getContext('2d'), r = g.createRadialGradient(128, 128, 0, 128, 128, 128); r.addColorStop(0, 'rgba(255,150,190,.55)'); r.addColorStop(.45, 'rgba(120,70,200,.28)'); r.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = r; g.fillRect(0, 0, 256, 256); return new THREE.CanvasTexture(c); })();
    const portHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, transparent: true, opacity: 0, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
    portHalo.position.set(0, 0.4, -3); portHalo.scale.set(26, 30, 1); portHalo.renderOrder = -30; scene.add(portHalo);

    /* sprites : étoile éclatante, galaxies, novas */
    const starTex = (spike, n = 128, wide = false) => {
      const c = mkCanvas(n), g = c.getContext('2d'), h = n / 2, r = g.createRadialGradient(h, h, 0, h, h, h);
      r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(.1, 'rgba(255,255,255,.85)'); r.addColorStop(.3, 'rgba(255,255,255,.2)'); r.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = r; g.fillRect(0, 0, n, n);
      if (spike) [true, false].forEach(hz => {
        const l = hz ? g.createLinearGradient(0, 0, n, 0) : g.createLinearGradient(0, 0, 0, n);
        l.addColorStop(0, 'rgba(255,255,255,0)'); l.addColorStop(.5, `rgba(255,255,255,${wide ? .95 : .7})`); l.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = l;
        const th = wide ? n / 90 : 2; if (hz) g.fillRect(0, h - th / 2, n, th); else g.fillRect(h - th / 2, 0, th, n);
      });
      return new THREE.CanvasTexture(c);
    };
    const ringTex = (() => { const c = mkCanvas(128), g = c.getContext('2d'), r = g.createRadialGradient(64, 64, 30, 64, 64, 64); r.addColorStop(0, 'rgba(255,255,255,0)'); r.addColorStop(.78, 'rgba(255,255,255,.0)'); r.addColorStop(.9, 'rgba(255,255,255,.9)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); })();
    hub.starTex = starTex; hub.glowTex = starTex(true);
    const mkSprite = (color, tex = hub.glowTex) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, transparent: true, opacity: 0, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending })); s.renderOrder = 20; scene.add(s); return s; };
    const flare = mkSprite(0xffeef6, starTex(true, 256, true)), flareAura = mkSprite(0xff7fb0);
    const galaxyTex = (hueA, hueB) => {
      const c = mkCanvas(256), g = c.getContext('2d'); g.translate(128, 128);
      const core = g.createRadialGradient(0, 0, 0, 0, 0, 42); core.addColorStop(0, 'rgba(255,244,226,.95)'); core.addColorStop(.3, `hsla(${hueB},90%,72%,.35)`); core.addColorStop(1, `hsla(${hueB},90%,70%,0)`); g.fillStyle = core; g.fillRect(-128, -128, 256, 256);
      for (let arm = 0; arm < 2; arm++) for (let i = 0; i < 900; i++) {
        const th = Math.pow(Math.random(), 0.75) * 3.6 * Math.PI, rad = 7 * Math.exp(0.2 * th), j = rad * 0.13;
        const x = rad * Math.cos(th + arm * Math.PI) + gauss() * j, y = rad * Math.sin(th + arm * Math.PI) + gauss() * j, m = th / (3.6 * Math.PI), rr = 1 + Math.random() * 2.4;
        const gr = g.createRadialGradient(x, y, 0, x, y, rr * 2); gr.addColorStop(0, `hsla(${lerpN(hueB, hueA, m)},85%,${lerpN(78, 66, m)}%,${0.1 + Math.random() * 0.2})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - rr * 2, y - rr * 2, rr * 4, rr * 4);
      }
      return new THREE.CanvasTexture(c);
    };
    const galaxies = [[-62, 30, -130, 26, 1.0, 0.6, 215, 40, 0.05], [70, -16, -150, 34, 1.15, -0.4, 330, 36, -0.035], [34, 40, -165, 18, 0.7, 0.9, 260, 48, 0.06], [-88, -34, -140, 22, 0.95, -0.7, 200, 30, -0.045], [6, -44, -120, 15, 1.2, 0.3, 300, 40, 0.07]].map(([x, y, z, size, tx, ty, ha, hb, spin]) => {
      const grp = new THREE.Group(); grp.position.set(x, y, z); grp.rotation.set(tx, ty, 0);
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: galaxyTex(ha, hb), transparent: true, opacity: 0.8, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
      mesh.renderOrder = -20; grp.add(mesh); scene.add(grp); return { mesh, spin };
    });
    /* binaire : deux soleils qui dansent */
    const binA = mkSprite(0xffd9a8), binB = mkSprite(0xa9c8ff);
    /* novas : une étoile s'embrase de temps en temps */
    const novas = [0, 1].map(() => ({ core: mkSprite(0xfff0e0), ring: mkSprite(0xffb0d0, ringTex), age: -1, x: 0, y: 0, wait: 8 + Math.random() * 12 }));

    /* étoiles filantes + comète */
    const shooters = [0, 1, 2, 3].map(i => {
      const geo = new THREE.PlaneGeometry(1, 1); geo.translate(-0.5, 0, 0);
      const m = new THREE.ShaderMaterial({
        uniforms: { uA: { value: 0 }, uC: { value: i === 3 ? new THREE.Vector3(.5, .85, 1) : new THREE.Vector3(1, .92, .9) } },
        vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
        fragmentShader: 'uniform float uA;uniform vec3 uC;varying vec2 vUv;void main(){float x=vUv.x,y=abs(vUv.y-.5)*2.;float body=pow(x,4.)*(1.-smoothstep(0.,1.,y));float head=exp(-pow((1.-x)*18.,2.))*(1.-smoothstep(0.,.9,y))*1.4;vec3 c=mix(vec3(.55,.7,1.),uC,x);gl_FragColor=vec4(c*(body*.9+head)*uA,1.);}',
        transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(geo, m); mesh.visible = false; addAdditive(mesh, 5);
      return { mesh, m, age: 0, life: 0, v: new THREE.Vector3(), wait: 1 + Math.random() * 5, comet: i === 3 };
    });
    shooters[3].wait = 18;
    const view = { hw: 28, hh: 15 };

    /* contour du cœur : courbe lisse, s'allume autour des étoiles découvertes */
    const LN = 240, lp = new Float32Array((LN + 1) * 3), lt = new Float32Array(LN + 1);
    arcSample(LN).forEach((w, i) => { lp.set([w.x, w.y, 0.05], i * 3); lt[i] = i / LN; });
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(lp, 3)); lg.setAttribute('aT', new THREE.BufferAttribute(lt, 1));
    const uSt = { value: new Array(8).fill(2) }, uOn = { value: new Array(8).fill(0) };
    const contourMat = new THREE.ShaderMaterial({
      uniforms: { uTime, uReveal: { value: 0 }, uSt, uOn },
      vertexShader: 'uniform float uSt[8],uOn[8];attribute float aT;varying float vT,vLit;void main(){vT=aT;float l=0.;for(int i=0;i<8;i++){float d=abs(aT-uSt[i]);d=min(d,1.-d);l+=uOn[i]*exp(-d*d*700.);}vLit=min(l,1.);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: 'uniform float uTime,uReveal;varying float vT,vLit;void main(){float vis=1.-smoothstep(uReveal-.02,uReveal,vT);float pulse=pow(.5+.5*sin(vT*37.7-uTime*1.4),8.);float a=vis*(.07+.4*pulse+.85*vLit);gl_FragColor=vec4(mix(vec3(.91,.79,.53),vec3(1.,.9,.7),vLit)*a,1.);}',
      transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
    });
    addAdditive(new THREE.Line(lg, contourMat), 15);
    const arcFrac = pos => { let best = 0, bd = 1e9; const a = arcSample(LN); a.forEach((p, i) => { const d = Math.hypot(p.x - pos.x, p.y - pos.y); if (d < bd) { bd = d; best = i / LN; } }); return best; };

    /* constellations réelles du ciel */
    const cstHov = { value: new Array(6).fill(0) }, cstFade = { value: 0 };
    const cst = { groups: [], pointsGeo: null, lineGeo: null, labels: [] };
    (() => {
      let np = 0, nl = 0; CONSTS.forEach(c => { np += c.pts.length; nl += c.lines.length; });
      const rr = rng(77), pos = new Float32Array(np * 3), col = new Float32Array(np * 3), sz = new Float32Array(np), ph = new Float32Array(np), kk = new Float32Array(np), gg = new Float32Array(np);
      const lpos = new Float32Array(nl * 6), lu = new Float32Array(nl * 2), lgp = new Float32Array(nl * 2), lld = new Float32Array(nl * 2);
      let ip = 0, il = 0; const cc = new THREE.Color(); const base = [];
      CONSTS.forEach((c, gi) => {
        const start = ip; c.start = start;
        c.pts.forEach(p => { const cx = p[3] || pickColor(rr()); cc.set(cx); col.set([cc.r, cc.g, cc.b], ip * 3); sz[ip] = 2.2 + p[2] * 4.2; ph[ip] = rr(); kk[ip] = p[2] > 0.8 ? 1 : 0; gg[ip] = gi; ip++; });
        c.lines.forEach(l => { const ld = rr(); for (let e = 0; e < 2; e++) { lu[il * 2 + e] = e; lgp[il * 2 + e] = gi; lld[il * 2 + e] = ld; } c.lines[c.lines.indexOf(l)].idx = il; il++; });
      });
      const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); pg.setAttribute('aColor', new THREE.BufferAttribute(col, 3)); pg.setAttribute('aSize', new THREE.BufferAttribute(sz, 1)); pg.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1)); pg.setAttribute('aK', new THREE.BufferAttribute(kk, 1)); pg.setAttribute('aG', new THREE.BufferAttribute(gg, 1));
      const lgm = new THREE.BufferGeometry(); lgm.setAttribute('position', new THREE.BufferAttribute(lpos, 3)); lgm.setAttribute('aU', new THREE.BufferAttribute(lu, 1)); lgm.setAttribute('aG', new THREE.BufferAttribute(lgp, 1)); lgm.setAttribute('aLd', new THREE.BufferAttribute(lld, 1));
      cst.pointsGeo = pg; cst.lineGeo = lgm;
      const pm = new THREE.ShaderMaterial({ uniforms: { uTime, uPx, uFade: cstFade, uBokeh: { value: 0 }, uHov: cstHov }, vertexShader: VS_CST, fragmentShader: PFS, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
      const lm = new THREE.ShaderMaterial({ uniforms: { uTime, uFade: cstFade, uHov: cstHov }, vertexShader: VS_CLINE, fragmentShader: 'varying float vA;void main(){gl_FragColor=vec4(vec3(.7,.82,1.)*vA,1.);}', transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
      addAdditive(new THREE.Points(pg, pm), 4); addAdditive(new THREE.LineSegments(lgm, lm), 3);
      const labels = $('sky-labels');
      CONSTS.forEach((c, gi) => { const d = document.createElement('div'); d.className = 'const-label'; d.innerHTML = `<b>${c.name}</b><i>${c.sub}</i>`; labels.appendChild(d); c.label = d; c.world = new THREE.Vector3(); c.scr = { x: 0, y: 0 }; });
      const own = document.createElement('div'); own.className = 'const-label own'; own.innerHTML = `<b>Constellation de ${(GX.config.site.recipient || '')}</b><i>${GX.config.site.title || ''}</i>`; labels.appendChild(own); cst.own = own;
    })();
    function layoutConsts() {
      const t = Math.tan(camera.fov * Math.PI / 360), z = -70, d = hub.baseZ + 70, hh = t * d, hw = hh * camera.aspect, portrait = camera.aspect < 0.85;
      const unit = Math.min(hh, hw * 0.62) * 0.2, pos = cst.pointsGeo.attributes.position.array, lpos = cst.lineGeo.attributes.position.array;
      CONSTS.forEach(c => {
        const a = portrait ? c.P : c.L, cx = a[0] * hw, cy = a[1] * hh, cr = Math.cos(c.rot), sr = Math.sin(c.rot);
        let mx = 0, my = 0;
        c.pts.forEach((p, i) => { const x = p[0] * unit * 0.8, y = p[1] * unit * 0.8, X = cx + x * cr - y * sr, Y = cy + x * sr + y * cr; pos.set([X, Y, z + (p[2] - 0.5) * 3], (c.start + i) * 3); mx += X; my += Y; });
        c.world.set(mx / c.pts.length, my / c.pts.length, z);
        c.lines.forEach(l => { const i = l.idx; for (let e = 0; e < 2; e++) { const s = (c.start + l[e]) * 3; lpos.set([pos[s], pos[s + 1], pos[s + 2]], (i * 2 + e) * 3); } });
      });
      cst.pointsGeo.attributes.position.needsUpdate = true; cst.lineGeo.attributes.position.needsUpdate = true;
    }

    /* ---------- balises des étoiles + noyau ---------- */
    const SHAPES = { planet: 0, gallery: 1, cinema: 2, constellation: 3, tree: 4, tunnel: 5, letter: 4 };
    const ACCENTS = { planet: [1, .62, .5], gallery: [.5, .9, .85], cinema: [.5, .72, 1], constellation: [.8, .65, 1], tree: [.55, 1, .7], tunnel: [.75, .6, 1] };
    const beaconGeo = new THREE.PlaneGeometry(1, 1);
    const stars = GX.config.stars || [];
    const pointsContainer = $('constellation-points');
    pointsContainer.innerHTML = '';
    stars.forEach((star, i) => {
      const kp = toWorld(heartRaw(ANGLES[star.position] ?? 0), Math.sin(i * 1.7) * 0.9); hub.keyPos[star.position] = kp;
      const acc = star.accent ? new THREE.Color(star.accent) : new THREE.Color().setRGB(...(ACCENTS[star.world] || [1, .8, .9]));
      const mat = new THREE.ShaderMaterial({
        uniforms: { uTime, uK: { value: 0 }, uH: { value: 0 }, uShape: { value: SHAPES[star.world] ?? 0 }, uPing: { value: i * 0.37 }, uVis: { value: 0 }, uLock: { value: 0 }, uCol: { value: new THREE.Vector3(acc.r, acc.g, acc.b) }, uSize: { value: 3.4 } },
        vertexShader: 'varying vec2 vUv;uniform float uSize;void main(){vUv=uv;vec4 mv=modelViewMatrix*vec4(0.,0.,0.,1.);mv.xy+=position.xy*uSize;gl_Position=projectionMatrix*mv;}',
        fragmentShader: BEACON_FS, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(beaconGeo, mat); mesh.position.copy(kp); addAdditive(mesh, 25);
      const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'star-point';
      btn.setAttribute('aria-label', `Étoile ${i + 1} : ${star.title}`);
      btn.innerHTML = `<span class="sp-num">${GX.util.roman(i + 1)}</span><span class="star-label"><em>${star.kicker || ''}</em>${star.title}</span>`;
      btn.addEventListener('mouseenter', () => { b.hover = true; GX.audio.tick(.08); });
      btn.addEventListener('mouseleave', () => { b.hover = false; });
      btn.addEventListener('focus', () => { b.hover = true; }); btn.addEventListener('blur', () => { b.hover = false; });
      btn.addEventListener('click', () => { if (hub.interactive && hub.onSelect) hub.onSelect(star, i); });
      pointsContainer.appendChild(btn);
      const b = { star, i, mesh, mat, btn, hover: false, k: 0, h: 0, pos: kp, arc: arcFrac(kp) };
      hub.beacons.push(b);
    });
    const coreBtn = document.createElement('button'); coreBtn.type = 'button'; coreBtn.className = 'star-point heart-core';
    coreBtn.setAttribute('aria-label', `Lire la lettre de ${GX.config.site.recipient || ''}`);
    coreBtn.innerHTML = `<span class="star-label"><em>Le cœur</em>${GX.config.letter.title || 'La lettre'}</span>`;
    coreBtn.addEventListener('mouseenter', () => { hub.coreHover = true; GX.audio.tick(.08); }); coreBtn.addEventListener('mouseleave', () => { hub.coreHover = false; });
    coreBtn.addEventListener('click', () => { if (hub.interactive && hub.onCore) hub.onCore(); });
    pointsContainer.appendChild(coreBtn); hub.coreBtn = coreBtn;
    const core = mkSprite(0xcfe4ff);

    /* ---------- caméra ---------- */
    hub.baseZ = 20;
    const rig = new GX.OrbitRig(camera, { dist: 20, yawLim: 0.4, pitchLim: 0.26, spring: 0.55, minDist: 6, maxDist: 70 });
    hub.rig = rig;
    let flight = null, lookT = new THREE.Vector3(), look = { x: 0, y: 0 }, sm = { x: 0, y: 0 };
    hub.captureCam = () => ({ pos: camera.position.clone(), look: lookT.clone(), fov: camera.fov });
    hub.neutralCam = () => ({ pos: new THREE.Vector3(0, 0, hub.baseZ * S.zoom * S.userZoom), look: new THREE.Vector3(0, 0, 0), fov: 50 });
    hub.flyCam = (from, to, ms, o = {}) => new Promise(res => { flight = { from, to, t: 0, ms, res, ease: o.ease || ease.inOut, bulge: o.bulge || 0, roll: o.roll || 0 }; });
    hub.flying = () => !!flight;
    hub.starCam = (key, d = 2.4) => { const p = hub.keyPos[key]; return { pos: new THREE.Vector3(p.x * 0.92, p.y * 0.92 + 0.15, p.z + d), look: p.clone(), fov: 50 }; };
    hub.coreCam = () => ({ pos: new THREE.Vector3(CORE.x, CORE.y, 2.6), look: new THREE.Vector3(CORE.x, CORE.y, 0), fov: 50 });

    function onResize() {
      const t = Math.tan(camera.fov * Math.PI / 360);
      hub.baseZ = Math.max(17 * SZ / t, 18 * SZ / (camera.aspect * t));
      view.hh = t * (hub.baseZ + 14); view.hw = view.hh * camera.aspect;
      const d = hub.baseZ + 8, hh = t * d, hw = hh * camera.aspect;
      flare.position.set(hw * 0.76, hh * 0.7, -8); flareAura.position.copy(flare.position);
      layoutConsts();
    }

    /* ---------- boucle de mise à jour ---------- */
    const v3 = new THREE.Vector3(), ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    const place = (btn, pos, lit) => { v3.copy(pos).project(camera); btn.style.transform = `translate(${(v3.x * 0.5 + 0.5) * innerWidth}px,${(-v3.y * 0.5 + 0.5) * innerHeight}px)`; btn.classList.toggle('lit', lit); };
    const BEAT = 2.1, beatEnv = ph => Math.exp(-Math.pow((ph - 0.04) / 0.045, 2)) + 0.62 * Math.exp(-Math.pow((ph - 0.2) / 0.05, 2));
    let nextNova = 0;

    function updateShooters(dt) {
      shooters.forEach(s => {
        if (s.life <= 0) {
          s.wait -= dt;
          if (s.wait <= 0 && !env.reduce && S.skyVis > 0.8) {
            const dir = Math.random() < 0.5 ? -1 : 1, a = 0.12 + Math.random() * 0.3, sp = s.comet ? 11 : 30 + Math.random() * 18;
            s.mesh.position.set((Math.random() * 1.6 - 0.8) * view.hw, view.hh * (0.1 + Math.random() * 0.9), -14);
            s.v.set(dir * Math.cos(a) * sp, -Math.sin(a) * sp, 0); s.mesh.rotation.z = Math.atan2(s.v.y, s.v.x);
            s.mesh.scale.set(s.comet ? 20 : 7 + Math.random() * 6, s.comet ? 0.3 : 0.16, 1);
            s.life = s.comet ? 4.2 : 0.9 + Math.random() * 0.7; s.age = 0; s.mesh.visible = true; s.wait = s.comet ? 40 + Math.random() * 30 : 2.5 + Math.random() * 5;
          }
          return;
        }
        s.age += dt; s.mesh.position.addScaledVector(s.v, dt);
        const p = s.age / s.life;
        if (p >= 1) { s.life = 0; s.mesh.visible = false; s.m.uniforms.uA.value = 0; return; }
        s.m.uniforms.uA.value = Math.sin(Math.PI * p);
      });
    }

    hub.stage = GX.registerStage({
      scene, camera, onResize,
      update(dt, T) {
        const pr = GX.env.reduce ? 0.3 : 1, vis = S.vis;
        /* paramètres → uniforms */
        bgMat.uniforms.uBg.value = S.bg;
        skyLayers.forEach(l => { l.mat.uniforms.uFade.value = S.skyVis; l.o.rotation.z = T * l.rot; });
        bokehMat.uniforms.uFade.value = 0.1 * S.skyVis; dustMat.uniforms.uFade.value = 0.7 * Math.max(S.vis, S.gather * 0.3);
        hBack.material.uniforms.uAlpha.value = vis; hMain.material.uniforms.uAlpha.value = vis; hFront.material.uniforms.uAlpha.value = vis;
        heartMat.uniforms.uFade.value = S.starsVis; heartMat.uniforms.uGather.value = S.gather; heartMat.uniforms.uPortOut.value = S.portOut; uLines.value = S.lines;
        sporeMat.uniforms.uFade.value = vis * 0.9; uWake.value = S.wake * (hub.interactive || S.gather > 0.9 ? 1 : 0);
        cstFade.value = S.consts * 0.9;
        portHalo.material.opacity = S.glow * (1 - S.portOut) * 0.5; portHalo.scale.set(10 + bw * 2.4, 10 + bh * 2.2, 1); portHalo.position.set(pox, poy, -3);
        contourMat.uniforms.uReveal.value = S.beacons * 1.02;
        /* battement */
        const ph = (T % BEAT) / BEAT; uBeatPh.value = ph; uBeat.value = beatEnv(ph) * (GX.env.reduce ? 0.4 : 1);
        const prog = hub.discovered.size / Math.max(1, stars.length); uProg.value = prog;
        /* pointeur → plan z=0 (sillage des étoiles) */
        ndc.set(GX.input.x, GX.input.y); ray.setFromCamera(ndc, camera);
        if (Math.abs(ray.ray.direction.z) > 1e-3) { const t = -ray.ray.origin.z / ray.ray.direction.z; uPtr.value.set(ray.ray.origin.x + ray.ray.direction.x * t, ray.ray.origin.y + ray.ray.direction.y * t, 0); }
        if (S.gather < 0.98) armed = false;
        if ((GX.env.coarse && !GX.input.down) || !armed) uPtr.value.set(999, 999, 0);      // le sillage ne s'active qu'au premier mouvement de souris, une fois le portrait formé
        /* caméra */
        if (flight) {
          flight.t += dt * GX.timeScale * 1000; const p = clamp(flight.t / flight.ms), e = flight.ease(p), f = flight.from, to = flight.to;
          camera.position.lerpVectors(f.pos, to.pos, e);
          if (flight.bulge) { const dirv = new THREE.Vector3().subVectors(to.pos, f.pos); const perp = new THREE.Vector3(-dirv.y, dirv.x, 0).normalize(); camera.position.addScaledVector(perp, Math.sin(Math.PI * e) * flight.bulge); }
          lookT.lerpVectors(f.look, to.look, e); camera.fov = lerp(f.fov, to.fov, e); camera.updateProjectionMatrix();
          camera.lookAt(lookT); camera.rotation.z += Math.sin(Math.PI * e) * flight.roll;
          if (p >= 1) { const r = flight.res; flight = null; rig.yaw = rig.pitch = 0; rig.vy = rig.vp = 0; r(); }
        } else {
          sm.x += (GX.input.x - sm.x) * 0.04; sm.y += (GX.input.y - sm.y) * 0.04;
          rig.ox = (sm.x * 0.12 + Math.sin(T * 0.11) * 0.045 * pr) * S.par; rig.oy = (sm.y * 0.07 + Math.cos(T * 0.083) * 0.03 * pr) * S.par;
          rig.dist = hub.baseZ * S.zoom * S.userZoom; rig.update(dt); lookT.set(0, 0, 0);
          if (camera.fov !== 50) { camera.fov = 50; camera.updateProjectionMatrix(); }
        }
        camera.updateMatrixWorld();
        /* couches du cœur : même taille apparente malgré la profondeur */
        const cd = Math.max(camera.position.length(), 8);
        hBack.position.z = -2.4; hBack.scale.setScalar(1.12 * (cd + 2.4) / cd); hFront.position.z = 1.6; hFront.scale.setScalar((cd - 1.6) / cd);
        /* ciel vivant */
        galaxies.forEach(g => { g.mesh.rotation.z += g.spin * dt * pr; g.mesh.material.opacity = 0.8 * S.skyVis; });
        const fl = 1 + Math.sin(T * 1.7) * 0.07 + Math.sin(T * 4.3) * 0.03;
        flare.scale.setScalar(5.2 * fl); flare.material.opacity = S.skyVis * 0.95; flareAura.scale.setScalar(11 * fl); flareAura.material.opacity = S.skyVis * 0.2;
        const bx = flare.position.x * -0.55, by = flare.position.y * 0.1 - 2; const ba = T * 0.6;
        binA.position.set(bx + Math.cos(ba) * 1.1, by + Math.sin(ba) * 0.4, -24); binB.position.set(bx - Math.cos(ba) * 1.1, by - Math.sin(ba) * 0.4, -24);
        binA.scale.setScalar(2.2); binB.scale.setScalar(1.7); binA.material.opacity = binB.material.opacity = S.skyVis * 0.8;
        novas.forEach(n => {
          if (n.age < 0) { n.wait -= dt; if (n.wait <= 0 && S.skyVis > 0.8) { const c = CONSTS[Math.floor(Math.random() * CONSTS.length)]; const p = c.pts[Math.floor(Math.random() * c.pts.length)]; const i = c.start + c.pts.indexOf(p); const pa = cst.pointsGeo.attributes.position.array; n.x = pa[i * 3]; n.y = pa[i * 3 + 1]; n.age = 0; n.wait = 14 + Math.random() * 20; } return; }
          n.age += dt; const p = n.age / 3.2; if (p >= 1) { n.age = -1; n.core.material.opacity = n.ring.material.opacity = 0; return; }
          n.core.position.set(n.x, n.y, -68); n.ring.position.set(n.x, n.y, -68);
          n.core.scale.setScalar(2 + 9 * Math.sin(Math.PI * Math.min(1, p * 1.4))); n.core.material.opacity = Math.sin(Math.PI * Math.min(1, p * 1.2)) * 0.9;
          n.ring.scale.setScalar(2 + p * 26); n.ring.material.opacity = (1 - p) * 0.55 * S.consts;
        });
        updateShooters(dt);
        /* constellations : survol → lignes et libellés */
        const px = GX.input.px, py = GX.input.py;
        CONSTS.forEach((c, gi) => {
          v3.copy(c.world).project(camera); const sx = (v3.x * 0.5 + 0.5) * innerWidth, sy = (-v3.y * 0.5 + 0.5) * innerHeight;
          const d = Math.hypot(px - sx, py - sy), want = (hub.orbit || hub.interactive) && hub.showButtons !== false ? (env.coarse ? 0.55 : 1 - smooth(clamp((d - 70) / 150))) : 0;
          cstHov.value[gi] += (want - cstHov.value[gi]) * Math.min(1, dt * 5);
          const lb = c.label, lx = clamp(sx, 90, innerWidth - 90), ly = clamp(sy + 54, 90, innerHeight - 120); lb.style.transform = `translate(${lx}px,${ly}px) translate(-50%,0)`; lb.style.opacity = (cstHov.value[gi] * 0.95 * S.consts).toFixed(3);
        });
        {
          v3.set(0, 5.9, 0.3).project(camera); cst.own.style.transform = `translate(${(v3.x * 0.5 + 0.5) * innerWidth}px,${(-v3.y * 0.5 + 0.5) * innerHeight}px) translate(-50%,0)`; cst.own.style.opacity = (S.ownLabel * 0.75 * (hub.showButtons === false ? 0 : 1)).toFixed(3);
        }
        /* balises */
        const cmax = hub.discovered.size >= stars.length;
        hub.beacons.forEach((b, i) => {
          const v = clamp((S.beacons - i / 8 * 0.5) * 3);
          b.k += ((hub.discovered.has(b.star.position) ? 1 : 0) - b.k) * Math.min(1, dt * 3); b.h += ((b.hover ? 1 : 0) - b.h) * Math.min(1, dt * 8);
          const u = b.mat.uniforms; u.uK.value = b.k; u.uH.value = b.h; u.uVis.value = v; u.uSize.value = (3.5 + b.h * 1.2) * (1 + uBeat.value * 0.05) * (1 - b.k * 0.12);
          uSt.value[i] = b.arc; uOn.value[i] = b.k;
          place(b.btn, b.pos, v > 0.6 && hub.showButtons !== false); b.btn.classList.toggle('done', b.k > 0.5);
        });
        const cv = clamp((S.beacons - 0.55) * 3);
        core.position.copy(corePos);
        core.scale.setScalar((4.4 + prog * 2.4) * (1 + Math.sin(T * 1.6) * 0.05 + uBeat.value * 0.16) * (hub.coreHover ? 1.25 : 1));
        core.material.opacity = cv * (0.45 + 0.55 * prog); core.material.color.setRGB(lerp(0.8, 1, prog), lerp(0.89, 0.9, prog), lerp(1, 0.72, prog));
        place(coreBtn, corePos, cv > 0.5 && hub.showButtons !== false); coreBtn.classList.toggle('awake', cmax);
      },
    });

    /* ---------- interactions ---------- */
    GX.input.on('drag', (dx, dy) => { if (GX.stage === hub.stage && (hub.interactive || hub.orbit) && !flight) rig.drag(dx, dy); });
    GX.input.on('wheel', d => { if (GX.stage === hub.stage && (hub.interactive || hub.orbit) && !flight) S.userZoom = clamp(S.userZoom * Math.exp(d * 0.0006), 0.75, 1.3); });
    GX.input.on('tap', e => {
      if (GX.stage !== hub.stage || !hub.interactive || flight) return;
      ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight * 2 - 1)); ray.setFromCamera(ndc, camera);
      const t = -ray.ray.origin.z / ray.ray.direction.z, x = ray.ray.origin.x + ray.ray.direction.x * t, y = ray.ray.origin.y + ray.ray.direction.y * t;
      hub.ripple(x, y, 0.8); GX.audio.note(Math.round((x + 9) / 18 * 8) + 1, 0.3); GX.audio.note(Math.round((x + 9) / 18 * 8) + 3, 0.2, 0.08);
    });
    hub.pulse = () => { hub.ripple(0, -0.3, 1.4); };
    hub.layout = onResize; onResize();
    hub.heartVisible = true;
  }
  hub.setDiscovered = set => { hub.discovered = set; };
  hub.init = init;
})();
