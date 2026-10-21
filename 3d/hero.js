// Detail Dungeon hero, v5: a city street in clean daylight, the car sharp and the
// street streaking past. The film arrives panel by panel with the camera travelling
// to each one; every panel lights up the moment it is done. Then roadworks gravel,
// stones and dust, and the car comes out clean.
// Deterministic in time: the same code renders live or frame-by-frame to video.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { GroundedSkybox } from 'three/addons/objects/GroundedSkybox.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { UltraHDRLoader } from 'three/addons/loaders/UltraHDRLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { normalise, prepareWheels, classify, groundShadow } from './carkit.js';

const DRACO_PATH = new URL('./draco/', import.meta.url).href;
export const DUR = 24;                // seconds, one pass
const SPEED = 12;                     // m/s, the street slides past the car

const smooth = (a,b,x) => { const t = Math.min(1, Math.max(0, (x-a)/(b-a))); return t*t*(3-2*t); };
const ease = x => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
const lerp = (a,b,t) => a + (b-a)*t;
const rnd = (i, k=0) => { const x = Math.sin(i*127.1 + k*311.7) * 43758.5453; return x - Math.floor(x); };

// ---- panels: which mesh is which, where its film comes from, when, and where the camera goes
const PANEL_RX = {
  hood: /SK_Hood/, bumperF: /SM_Bumper_F/, fenderF: /SM_Fender_F/,
  doorFR: /SK_Door_FR/, doorFL: /SK_Door_FL/, doorBR: /SK_Door_BR/, doorBL: /SK_Door_BL/,
  roof: /SM_Roof/, fenderB: /SM_Fender_B/, body: /SM_Body/, trunk: /SK_Trunk/, bumperB: /SM_Bumper_B/,
  steps: /SM_SideSkirts/,
};
// cam/tgt are car-space (nose at -z, viewer side +x, floor y=0)
const STEP = 1.9, T0 = 2.5;
const FILM = [
  { ids:['hood'],                          t:T0 + 0*STEP, from:[0, .9, -.1],  cam:[2.4, 2.5, -5.6],  tgt:[0, 1.15, -1.5] },
  { ids:['bumperF'],                       t:T0 + 1*STEP, from:[0, .5, -1],   cam:[2.6, 1.0, -6.4],  tgt:[0, .75, -2.3] },
  { ids:['fenderF'],                       t:T0 + 2*STEP, from:[1, .4, 0],    cam:[4.6, 1.35, -3.8], tgt:[.9, .95, -1.5], mirror:true },
  { ids:['doorFR','doorFL','doorBR','doorBL'], t:T0 + 3*STEP, from:[1, .25, 0], cam:[6.0, 1.3, .4],  tgt:[1.0, .95, .2], mirror:true },
  { ids:['roof'],                          t:T0 + 4*STEP, from:[0, .55, 0],   cam:[3.6, 4.6, -1.6],  tgt:[0, 1.6, .3] },
  { ids:['fenderB'],                       t:T0 + 5*STEP, from:[1, .5, .2],   cam:[4.4, 1.6, 4.9],   tgt:[.6, 1.0, 2.0], mirror:true },
  { ids:['trunk'],                         t:T0 + 6*STEP, from:[0, .4, 1],    cam:[-2.4, 1.6, 6.6],  tgt:[0, 1.1, 2.3] },
  { ids:['bumperB'],                       t:T0 + 7*STEP, from:[0, .3, 1],    cam:[-2.6, 1.0, 6.2],  tgt:[0, .7, 2.3] },
];
const SYNC = ['body', 'steps'];
const HOVER = .85, SWEEP = .65, PULSE = .55;       // seconds: come in, squeegee, light up
const FILM_END = FILM[FILM.length-1].t + HOVER + SWEEP;   // 17.3

// ---- procedural textures -----------------------------------------------------------
function vnoise(x, y, s){ const n = Math.sin(x*12.9898*s + y*78.233*s) * 43758.5453; return n - Math.floor(n); }
function fbm(x, y){
  let v = 0, a = .5, f = 1;
  for (let o=0;o<4;o++){ const xi = Math.floor(x*f), yi = Math.floor(y*f), fx = x*f-xi, fy = y*f-yi;
    const a0 = vnoise(xi,yi,1), a1 = vnoise(xi+1,yi,1), a2 = vnoise(xi,yi+1,1), a3 = vnoise(xi+1,yi+1,1);
    const sx = fx*fx*(3-2*fx), sy = fy*fy*(3-2*fy);
    v += a * ((a0*(1-sx)+a1*sx)*(1-sy) + (a2*(1-sx)+a3*sx)*sy); a *= .5; f *= 2; }
  return v;
}
function canvasTex(w, h, fn, { srgb=true, repeat=[1,1] } = {}){
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  const id = g.createImageData(w, h); const d = id.data;
  for (let y=0;y<h;y++) for (let x=0;x<w;x++){ const i=(y*w+x)*4; const [r,gg,b,a=255] = fn(x,y); d[i]=r; d[i+1]=gg; d[i+2]=b; d[i+3]=a; }
  g.putImageData(id,0,0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t;
}
// one tile = 8 m of two-lane road, 10 m wide: asphalt, centre dashes, edge lines, worn tracks
function roadTexture(){
  return canvasTex(512, 512, (x,y) => {
    const n = fbm(x/30, y/30)*.45 + vnoise(x,y,5)*.55;
    let v = 40 + n*26;
    const tx = Math.min(Math.abs(x-150), Math.abs(x-362)); v *= 1 - .18*Math.exp(-tx*tx/2200);   // polished tracks
    v *= .92 + .16*fbm(x/140, y/140);                                                               // patches
    if (x > 252 && x < 260 && (y % 256) < 150) v = 150 + n*40;                                     // centre dash
    if ((x > 22 && x < 30) || (x > 482 && x < 490)) v = 165 + n*35;                                 // edge lines
    return [v*1.02, v, v*.96];
  }, { repeat:[1, 50] });
}
function roadRough(){
  return canvasTex(256, 256, (x,y) => { const p = fbm(x/60,y/60); const v = 215 - Math.max(0,p-.5)*160 + vnoise(x,y,9)*12; return [v,v,v]; }, { srgb:false, repeat:[1,50] });
}
function dirtTexture(){
  return canvasTex(512, 512, (x,y) => {
    const n = fbm(x/24, y/24)*.6 + vnoise(x,y,3)*.4;
    const v = 74 + n*52;
    return [v*1.08, v*.93, v*.72];
  }, { repeat:[60, 60] });
}
function gravelTexture(){
  return canvasTex(512, 512, (x,y) => {
    const n = fbm(x/5, y/5); const g = vnoise(Math.floor(x/7), Math.floor(y/7), 2); const g2 = vnoise(Math.floor(x/3), Math.floor(y/3), 4);
    const v = 54 + n*70 + (g > .78 ? 45 : 0) - (g2 > .85 ? 25 : 0);
    return [v*1.05, v*.98, v*.88];
  }, { repeat:[6, 18] });
}
// tangent-space normal map from a height function, for surface detail without geometry
function normalTex(size, hfn, strength, repeat){
  const H = new Float32Array(size*size);
  for (let y=0;y<size;y++) for (let x=0;x<size;x++) H[y*size+x] = hfn(x, y);
  const data = new Uint8Array(size*size*4);
  for (let y=0;y<size;y++) for (let x=0;x<size;x++){
    const l = H[y*size + (x+size-1)%size], r = H[y*size + (x+1)%size], d = H[((y+1)%size)*size + x], u = H[((y+size-1)%size)*size + x];
    let nx = (l-r)*strength, ny = (d-u)*strength, nz = 1; const n = Math.hypot(nx,ny,nz); nx/=n; ny/=n; nz/=n;
    const i = (y*size+x)*4; data[i] = (nx*.5+.5)*255; data[i+1] = (ny*.5+.5)*255; data[i+2] = (nz*.5+.5)*255; data[i+3] = 255;
  }
  const t = new THREE.DataTexture(data, size, size); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); t.anisotropy = 8; t.needsUpdate = true; return t;
}
const asphaltHeight = (x,y) => fbm(x/18, y/18)*.5 + vnoise(x,y,5)*.5 + (fbm(x/90, y/90) > .62 ? .6 : 0);
const dirtHeight    = (x,y) => fbm(x/22, y/22)*.7 + vnoise(x,y,3)*.3;
const gravelHeight  = (x,y) => { const g = vnoise(Math.floor(x/7), Math.floor(y/7), 2); const c = Math.hypot((x%7)-3.5, (y%7)-3.5); return (g > .55 ? Math.max(0, 1 - c/3.5) : 0) + fbm(x/5,y/5)*.35; };

function blurDiscTexture(){
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  const id = g.createImageData(S, S); const d = id.data;
  for (let y=0;y<S;y++) for (let x=0;x<S;x++){
    const dx = x-S/2, dy = y-S/2, r = Math.hypot(dx,dy)/(S/2), a = Math.atan2(dy,dx);
    const streak = .55 + .45*Math.sin(a*14 + r*9) * Math.sin(a*23);
    const ring = r < .97 && r > .28 ? 1 : 0;
    const alpha = ring * (0.55 + 0.25*streak) * (1 - Math.pow(Math.max(0,(r-.8)/.17),2));
    const i = (y*S+x)*4; const v = 22 + streak*48; d[i]=v; d[i+1]=v; d[i+2]=v+3; d[i+3]=Math.max(0,Math.min(255,alpha*255));
  }
  g.putImageData(id,0,0); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function softDot(){
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const gr = g.createRadialGradient(64,64,2,64,64,62); gr.addColorStop(0,'rgba(255,255,255,1)'); gr.addColorStop(.35,'rgba(255,255,255,.55)'); gr.addColorStop(1,'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0,0,128,128); return new THREE.CanvasTexture(c);
}

export function initHero({ canvas, stage, model, noseFlip=false, paint=0x0c0d11, onReady, onFail, pixelRatio, quality='live', hdr=null, hdrHeight=1.5, hdrYaw=0, hdrExposure=1, city=false, flare=1, exposure=null, sunElev=null, shadowRes=null }){
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:false, powerPreference:'high-performance', preserveDrawingBuffer: quality==='capture' }); }
  catch(e){ onFail && onFail(e); return null; }
  renderer.setPixelRatio(pixelRatio || Math.min(devicePixelRatio||1, 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = exposure || 0.5;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(26, 16/9, .1, 2500);

  // ---- sky and sun: clean daylight, sun high front-right ------------------------
  // three worlds: procedural (no hdr), a photo HDRI projected on the ground (hdr), or
  // CITY: the photo's sky and sun light a built avenue that slides past (hdr + city)
  const CITY = !!hdr && !!city;
  const HDRI = !!hdr && !CITY;
  const sky = new Sky(); sky.scale.setScalar(5000); if (!HDRI && !CITY) scene.add(sky);
  const su = sky.material.uniforms;
  su.turbidity.value = 2.4; su.rayleigh.value = 3.0; su.mieCoefficient.value = .004; su.mieDirectionalG.value = .8;
  const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 34), THREE.MathUtils.degToRad(140));
  su.sunPosition.value.copy(sunDir);
  if (!HDRI && !CITY) scene.fog = new THREE.FogExp2(0xbcc3cc, 0.0028);
  const sun = new THREE.DirectionalLight(0xfff0dc, 3.6);
  sun.position.copy(sunDir).multiplyScalar(70); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.near = 30; sun.shadow.camera.far = 130;
  sun.shadow.camera.left = -11; sun.shadow.camera.right = 11; sun.shadow.camera.top = 11; sun.shadow.camera.bottom = -11;
  sun.shadow.bias = -.0005; sun.shadow.normalBias = .02; sun.shadow.radius = 3;
  scene.add(sun); scene.add(sun.target);
  if (!HDRI && !CITY) scene.add(new THREE.HemisphereLight(0x8fa4c4, 0x6a665e, .5));
  const pm = new THREE.PMREMGenerator(renderer);
  function bakeEnvironment(){ scene.environment = null; scene.environment = pm.fromScene(scene, .02, .5, 2000).texture; }

  // ---- the street (slides +z past the car) -------------------------------------------
  const world = new THREE.Group(); scene.add(world);
  const GRAVEL = [99, 100];                                // the gravel beat is out: stones and dust never spawn
  let hdrReady = !HDRI && !CITY, modelReady = false;
  const occluders = { trees: [], boxes: [] };              // for the sun flare: what can hide the sun from the lens
  let sunVis = 1, sunSeed = 0;
  if (HDRI) buildHDRI(); else if (CITY) buildCity(); else buildStreet();

  // the sun of a photo: brightest texel of an equirect image, as a direction (world space)
  function sunFromEquirect(tex){
    const img = tex.image, W = img.width, Hh = img.height, d = img.data; let best = -1, bi = 0;
    const half = tex.type === THREE.HalfFloatType && d instanceof Uint16Array;
    const h2f = h => { const e = (h >> 10) & 0x1f, m = h & 0x3ff; return (h >> 15 ? -1 : 1) * (e === 0 ? m * Math.pow(2, -24) : Math.pow(2, e - 25) * (1024 + m)); };
    const ch = i => half ? h2f(d[i]) : d[i];
    const stride = d.length / (W*Hh);
    for (let y = 0; y < Hh; y += 2) for (let x = 0; x < W; x += 2) { const i = (y*W + x)*stride; const l = ch(i) + ch(i+1) + ch(i+2); if (l > best) { best = l; bi = i; } }
    const px = (bi/stride) % W, py = Math.floor((bi/stride) / W);
    const phi = (py / Hh) * Math.PI, theta = (px / W) * Math.PI * 2 - Math.PI;
    return new THREE.Vector3(Math.sin(phi)*Math.sin(theta), Math.cos(phi), Math.sin(phi)*Math.cos(theta)).applyAxisAngle(new THREE.Vector3(0,1,0), hdrYaw);
  }

  // CITY: the photo is the sky (and the light), the avenue is built and slides past.
  // Reflections are re-baked from the car's position every frame, so buildings and
  // trees stream over the paint the way they do on a real tracking shot.
  let cubeRT = null, cubeCam = null, envRT = null, skyTex = null;
  function buildCity(){
    const ldr = new RGBELoader(); ldr.setDataType(THREE.FloatType);
    ldr.load(hdr, tex => {
      // the photo's sun is hundreds of thousands of times brighter than the sky; cap it so the
      // bloom stays a glow (our own directional light does the sunlight)
      { const d = tex.image.data, CAP = 1200; for (let i = 0; i < d.length; i++) if (d[i] > CAP) d[i] = CAP; tex.needsUpdate = true; }
      tex.mapping = THREE.EquirectangularReflectionMapping; skyTex = tex;
      scene.background = tex; scene.backgroundRotation = new THREE.Euler(0, hdrYaw, 0); scene.backgroundIntensity = hdrExposure;
      scene.environment = pm.fromEquirectangular(tex).texture; scene.environmentRotation = new THREE.Euler(0, hdrYaw, 0); scene.environmentIntensity = hdrExposure;
      sunDir.copy(sunFromEquirect(tex));
      // optionally a lower sun than the photo's for the shadows and the flare (the sky keeps its glow)
      if (sunElev !== null) { const el = THREE.MathUtils.degToRad(sunElev), hz = Math.hypot(sunDir.x, sunDir.z) || 1; sunDir.set(sunDir.x/hz*Math.cos(el), Math.sin(el), sunDir.z/hz*Math.cos(el)); }
      sun.position.copy(sunDir).multiplyScalar(90); sun.intensity = 13; sun.color.set(0xfff6ea);
      const R = 26; sun.shadow.camera.left = -R; sun.shadow.camera.right = R; sun.shadow.camera.top = R; sun.shadow.camera.bottom = -R;
      sun.shadow.camera.near = 40; sun.shadow.camera.far = 170; sun.shadow.camera.updateProjectionMatrix();
      { const sm = shadowRes || (quality === 'capture' ? 4096 : 2048); sun.shadow.mapSize.set(sm, sm); } sun.shadow.radius = 2.2; sun.shadow.bias = -.0004;
      if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
      scene.fog = new THREE.Fog(0xdbe3ec, 160, 1500);
      buildAvenue();
      cubeRT = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType, generateMipmaps: false });
      cubeCam = new THREE.CubeCamera(.6, 1800, cubeRT);
      hdrReady = true; maybeReady();
    }, undefined, e => onFail && onFail(e));
  }
  function bakeCity(){
    if (!car || !cubeCam) return;
    const vis = []; car.visible = false;
    for (const f of films) for (const m of f.sheets) { vis.push([m, m.visible]); m.visible = false; }
    const fog = scene.fog; scene.fog = null;
    cubeCam.position.set(0, 1.05, 0); cubeCam.update(renderer, scene);
    scene.fog = fog; car.visible = true; for (const [m, v] of vis) m.visible = v;
    envRT = pm.fromCubemap(cubeRT.texture, envRT);
    scene.environment = envRT.texture; scene.environmentRotation.set(0, 0, 0);
  }

  // a modern avenue: four lanes, kerbs, paving, street trees, a park strip with the
  // towers set back on the sun side so the road stays lit, glass and stone fronts on
  // the camera side, crossings with zebra stripes and signals, lamps, hedges, a far skyline
  function buildAvenue(){
    const Z1 = 320, Z0 = -640;                               // street extent in car space at t=0 (slides +z)
    const LEN = Z1 - Z0, ZC = (Z0 + Z1) / 2;
    const RW = 14, RX = -1.75;                                // road width and centre (car sits in the inner lane)
    const KL = RX - RW/2, KR = RX + RW/2;                     // kerb lines: -8.75, 5.25
    const clear = z => (z > -296 && z < -244) || (z > -34 && z < 12);      // no shade on the car at the open and the close
    const camClear = z => (z > -148 && z < -78) || (z > -48 && z < 18) || (z > -305 && z < -240);   // camera-side: nothing through the lens
    // road
    const asphalt = canvasTex(512, 512, (x,y) => { const n = fbm(x/26, y/26)*.5 + vnoise(x,y,5)*.5; let v = 46 + n*22; v *= .9 + .2*fbm(x/150 + 3, y/150); return [v*1.0, v*1.0, v*1.03]; }, { repeat:[2, LEN/7] });
    const asphaltR = canvasTex(256, 256, (x,y) => { const p = fbm(x/70, y/70); const v = 232 - Math.max(0, p-.5)*70 + vnoise(x,y,9)*14; return [v,v,v]; }, { srgb:false, repeat:[2, LEN/7] });
    const roadMat = new THREE.MeshStandardMaterial({ map:asphalt, roughnessMap:asphaltR, roughness:1, metalness:0, envMapIntensity:.55, normalMap:normalTex(256, asphaltHeight, 1.2, [2, LEN/7]), normalScale:new THREE.Vector2(.25,.25), color:0xaaaaaa });
    const road = new THREE.Mesh(new THREE.PlaneGeometry(RW + .3, LEN), roadMat); road.rotation.x = -Math.PI/2; road.position.set(RX, 0, ZC); road.receiveShadow = true; world.add(road);
    // markings: worn white paint, as thin geometry on the road
    const wear = canvasTex(128, 128, (x,y) => { const v = 205 + fbm(x/20,y/20)*50 - (vnoise(x,y,4) > .93 ? 60 : 0); return [v, v, v*.97]; }, { repeat:[1, 1] });
    const paint = new THREE.MeshStandardMaterial({ map:wear, color:0xe4e4df, roughness:.8, metalness:0, polygonOffset:true, polygonOffsetFactor:-1, polygonOffsetUnits:-1 });
    const yellow = new THREE.MeshStandardMaterial({ map:wear, color:0xe0b23a, roughness:.8, metalness:0, polygonOffset:true, polygonOffsetFactor:-1, polygonOffsetUnits:-1 });
    const mark = (w, l, x, z, m = paint) => { const q = new THREE.Mesh(new THREE.PlaneGeometry(w, l), m); q.rotation.x = -Math.PI/2; q.position.set(x, .004, z); q.receiveShadow = true; world.add(q); };
    mark(.14, LEN, RX - .11, ZC, yellow); mark(.14, LEN, RX + .11, ZC, yellow);           // centre double line
    mark(.14, LEN, KL + .25, ZC); mark(.14, LEN, KR - .25, ZC);                              // edge lines
    for (let z = Z1; z > Z0; z -= 12) for (const lx of [RX - 3.5, RX + 3.5]) mark(.14, 3, lx, z - 1.5);  // lane dashes
    // crossings every 72 m: zebra, stop lines, signals, dropped kerbs
    const CROSS = []; for (let z = Z1 - 30; z > Z0 + 10; z -= 72) CROSS.push(z);
    const poleMat = new THREE.MeshStandardMaterial({ color:0x3b3f45, metalness:.7, roughness:.45 });
    const housing = new THREE.MeshStandardMaterial({ color:0x15171a, roughness:.6 });
    const lampOn = (c) => new THREE.MeshStandardMaterial({ color:c, emissive:c, emissiveIntensity:2.2, roughness:.3 });
    const lampOff = new THREE.MeshStandardMaterial({ color:0x1b1d20, roughness:.4 });
    for (const cz of CROSS) {
      for (let x = KL + .6; x < KR - .4; x += .9) mark(.45, 3.6, x, cz);
      mark(.35, RW - .5, RX, cz + 3.0); mark(.35, RW - .5, RX, cz - 3.0);                  // stop lines
      for (const sx of [-1, 1]) {
        const px = sx < 0 ? KL - .7 : KR + .7, pz = cz + sx*(-4.2); if (sx > 0 && camClear(pz)) continue;
        const p = new THREE.Mesh(new THREE.CylinderGeometry(.08, .1, 4.2, 10), poleMat); p.position.set(px, 2.1, pz); p.castShadow = true; world.add(p);
        const arm = new THREE.Mesh(new THREE.CylinderGeometry(.06, .07, 4.6, 8), poleMat); arm.rotation.z = Math.PI/2; arm.position.set(px - sx*2.3, 4.15, pz); world.add(arm);
        const head = new THREE.Group(); head.position.set(px - sx*4.2, 3.6, pz);
        const box = new THREE.Mesh(new THREE.BoxGeometry(.32, 1.0, .28), housing); box.castShadow = true; head.add(box);
        const red = (Math.round(cz/72) % 2) === 0;
        for (let i=0;i<3;i++){ const on = (i===0 && red) || (i===2 && !red); const l = new THREE.Mesh(new THREE.CircleGeometry(.11, 20), on ? lampOn(i===0 ? 0xff2a1a : 0x27e36a) : lampOff); l.position.set(0, .33 - i*.33, -sx*.15); l.rotation.y = sx < 0 ? 0 : Math.PI; head.add(l); }
        world.add(head);
      }
    }
    // kerbs and paving
    const paveTex = canvasTex(256, 256, (x,y) => { const n = fbm(x/30,y/30)*.5 + vnoise(x,y,4)*.5; let v = 150 + n*34; if ((x % 128) < 3 || (y % 128) < 3) v *= .72; return [v*1.0, v*.99, v*.95]; }, { repeat:[2, LEN/1.6] });
    const paveMat = new THREE.MeshStandardMaterial({ map:paveTex, roughness:.9, color:0xc9c5bc });
    const kerbMat = new THREE.MeshStandardMaterial({ color:0xb8b5ad, roughness:.85 });
    for (const [kx, px] of [[KL, KL - 2.4], [KR, KR + 2.4]]) {
      const kerb = new THREE.Mesh(new THREE.BoxGeometry(.3, .15, LEN), kerbMat); kerb.position.set(kx + (kx < 0 ? -.15 : .15), .075, ZC); kerb.receiveShadow = true; kerb.castShadow = true; world.add(kerb);
      const pave = new THREE.Mesh(new THREE.BoxGeometry(4.5, .15, LEN), paveMat); pave.position.set(px, .075, ZC); pave.receiveShadow = true; world.add(pave);
    }
    // the sun side: a hedge, then lawn and a park strip; the camera side: fronts right behind the paving
    const hedgeTex = canvasTex(256, 256, (x,y) => { const n = fbm(x/9,y/9), m = vnoise(x,y,8); const v = 26 + n*60 + m*18; return [v*.55 + 6, v, v*.32]; }, { repeat:[LEN/4, 1] });
    const hedgeMat = new THREE.MeshStandardMaterial({ map:hedgeTex, roughness:.95 });
    const hedge = new THREE.Mesh(new THREE.BoxGeometry(1.1, .95, LEN), hedgeMat); hedge.position.set(KL - 5.2, .62, ZC); hedge.castShadow = true; hedge.receiveShadow = true; world.add(hedge);
    const grassTex = canvasTex(256, 256, (x,y) => { const n = fbm(x/14,y/14)*.6 + vnoise(x,y,2)*.4; const v = 58 + n*52; return [v*.78 + 10, v*1.0 + 8, v*.38]; }, { repeat:[6, LEN/4] });
    const lawn = new THREE.Mesh(new THREE.PlaneGeometry(30, LEN), new THREE.MeshStandardMaterial({ map:grassTex, roughness:1, color:0x9db27e })); lawn.rotation.x = -Math.PI/2; lawn.position.set(KL - 6 - 15, .01, ZC); lawn.receiveShadow = true; world.add(lawn);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), new THREE.MeshStandardMaterial({ color:0x7d7a74, roughness:1 }));
    ground.rotation.x = -Math.PI/2; ground.position.set(0, -.02, ZC); ground.receiveShadow = true; world.add(ground);

    // fronts: curtain-wall glass, stone with punched windows, pale panel with ribbon windows
    // curtain wall: dark blue glass between light floor slabs and mullions, a few panes lit or blinded
    const glassTex = canvasTex(256, 512, (x,y) => { const cx = x % 64, cy = y % 128; const slab = cy < 9; const mull = cx < 3 || (cy > 100 && cy < 104); const pane = vnoise(Math.floor(x/64), Math.floor(y/128), 7); const blind = pane > .78; let v = slab ? 205 : mull ? 140 : (blind ? 150 + vnoise(x,y,2)*20 : 34 + pane*26 + vnoise(x,y,2)*8); return slab || mull || blind ? [v*1.0, v*.99, v*.96] : [v*.8, v*.92, v*1.15]; });
    const glassWall = new THREE.MeshStandardMaterial({ map:glassTex, metalness:.6, roughness:.2, color:0xc4ccd4, envMapIntensity:1.0 });
    // stone: punched windows with deep reveals and sills
    const stoneTex = canvasTex(256, 512, (x,y) => { const cx = x % 64, cy = y % 96; const win = cx > 12 && cx < 52 && cy > 18 && cy < 72; const frame = !win && cx > 9 && cx < 55 && cy > 15 && cy < 76; const sill = cx > 9 && cx < 55 && cy >= 72 && cy < 78; const sh = vnoise(Math.floor(x/64), Math.floor(y/96), 7); let v = win ? 28 + sh*40 : sill ? 215 : frame ? 110 : 172 + fbm(x/30,y/30)*44; return win ? [v*.85, v*.95, v*1.15] : [v*1.0, v*.96, v*.9]; });
    const stoneWall = new THREE.MeshStandardMaterial({ map:stoneTex, metalness:.02, roughness:.8, color:0xa39a8c });
    // white panel with ribbon windows and balconies
    const panelTex = canvasTex(256, 512, (x,y) => { const cy = y % 96; const band = cy > 26 && cy < 66; const rail = cy >= 66 && cy < 72; const seam = (x % 128) < 2 || cy < 3; let v = band ? 36 + vnoise(Math.floor(x/32), Math.floor(y/96), 3)*34 : rail ? 90 : (seam ? 130 : 214 + fbm(x/40,y/40)*24); return band ? [v*.85, v*.95, v*1.12] : [v, v, v*.98]; });
    const panelWall = new THREE.MeshStandardMaterial({ map:panelTex, metalness:.08, roughness:.55, color:0xb4b5b2 });
    // bronze-tinted glass, for a few towers
    const bronzeWall = new THREE.MeshStandardMaterial({ map:glassTex, metalness:.65, roughness:.22, color:0xcbb59a, envMapIntensity:1.0 });
    // street level: shopfronts, dark glass between light stone pillars under a pale fascia
    const shopTex = canvasTex(512, 128, (x,y) => { const cx = x % 128; const pillar = cx < 18; const fascia = y < 30; const glass = !pillar && !fascia; const n = fbm(x/40, y/40)*30; let v = fascia ? 176 + n : pillar ? 150 + n : 40 + vnoise(Math.floor(x/128), 0, 5)*30 + n*.3; return glass ? [v*.85, v*.95, v*1.1] : [v*1.0, v*.97, v*.92]; });
    const shopGlass = new THREE.MeshStandardMaterial({ map:shopTex, color:0xb9b3a8, metalness:.25, roughness:.4 });
    const roofMat = new THREE.MeshStandardMaterial({ color:0x6e7074, roughness:.9 });
    const WALLS = [glassWall, bronzeWall, glassWall, stoneWall];
    let bi = 0;
    function tower(x, z, w, d, h, mat, podium){
      const g = new THREE.Group();
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat.clone()); m.material.map = mat.map.clone(); m.material.map.repeat.set(Math.max(1, Math.round(w/6)), Math.max(1, Math.round(h/7.5))); m.material.map.needsUpdate = true;
      m.position.y = h/2 - .02; m.castShadow = true; m.receiveShadow = true; g.add(m);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(w*.35, 2.6, d*.4), roofMat); cap.position.set(w*.15, h + 1.3, 0); cap.castShadow = true; g.add(cap);
      if (podium) { const pm2 = shopGlass.clone(); pm2.map = shopTex.clone(); pm2.map.repeat.set(Math.max(1, Math.round((w + 2)/14)), 1); pm2.map.needsUpdate = true; const p = new THREE.Mesh(new THREE.BoxGeometry(w + 2, 4.6, d + 2.4), pm2); p.position.y = 2.3; p.castShadow = true; g.add(p); }
      g.position.set(x, 0, z); world.add(g);
      occluders.boxes.push({ x0: x - w/2 - 1, x1: x + w/2 + 1, y1: h + 2.6, z0: z - d/2 - 1.2, z1: z + d/2 + 1.2 });
    }
    // camera side (+x): continuous fronts, 15 to 48 m, glass and stone
    for (let z = Z1 + 10; z > Z0; z -= 26 + rnd(bi,31)*18) {
      if (rnd(bi,32) < .16) { bi++; continue; }
      const w = 18 + rnd(bi,33)*22, d = 22 + rnd(bi,34)*14, h = 15 + Math.pow(rnd(bi,35), 1.3)*33;
      tower(KR + 2.4 + 1.2 + rnd(bi,37)*1.5 + w/2, z - d/2, w, d, h, WALLS[Math.floor(rnd(bi,36)*4)], true);
      if (rnd(bi,38) < .55) { const h2 = h + 12 + rnd(bi,39)*30, w2 = w*.7; tower(KR + 40 + rnd(bi,40)*20 + w2/2, z - d/2 - 10, w2, d, h2, WALLS[Math.floor(rnd(bi,41)*4)], false); }
      bi++;
    }
    // sun side (-x): low blocks past the park, towers far behind, so the shadows stop short of the road
    for (let z = Z1 + 10; z > Z0; z -= 34 + rnd(bi,31)*22) {
      if (rnd(bi,32) < .25) { bi++; continue; }
      const w = 14 + rnd(bi,33)*16, d = 18 + rnd(bi,34)*14, h = 7 + rnd(bi,35)*9;
      const bx = KL - 2.4 - 48 - rnd(bi,37)*10 - w/2;
      tower(bx, z - d/2, w, d, h, [stoneWall, panelWall, glassWall, panelWall][Math.floor(rnd(bi,36)*4)], false);
      if (rnd(bi,43) < .5) tower(bx - w*.1, z - d/2 - d*.6, w*.7, d*.8, h + 5 + rnd(bi,44)*6, [glassWall, panelWall][Math.floor(rnd(bi,45)*2)], false);
      if (rnd(bi,38) < .8) { const h2 = 34 + rnd(bi,39)*36, w2 = 26 + rnd(bi,42)*22; tower(KL - 135 - rnd(bi,40)*50 - w2/2, z - d/2 - 8, w2, d + 10, h2, rnd(bi,41) < .75 ? glassWall : panelWall, false); }
      bi++;
    }
    // trees: street trees on both pavements, bigger ones in the park strip
    const leafTex = canvasTex(512, 512, (x,y) => {
      const u = (x-256)/256, v = (y-290)/230; let a = 0, c = 0;
      for (let k=0;k<34;k++){ const bx = Math.sin(k*2.3 + 1)*.6, by = Math.cos(k*1.7)*.55 - .12, r = .2 + rnd(k,3)*.2; const d = Math.hypot(u-bx, (v-by)*1.15); if (d < r) { a = 255; c = Math.max(c, 1 - d/r); } }
      const n = fbm(x/9, y/9), n2 = fbm(x/3 + 5, y/3); if (a && (n < .40 || n2 < .22)) a = 0;
      const lit = Math.max(0, Math.min(1, 1 - y/512)) * .6 + c*.4 + (n2 - .5)*.3;
      const g = 44 + lit*96; return [g*.62 + 10*lit, g, g*.34, a];
    });
    const leafMat = new THREE.MeshStandardMaterial({ map:leafTex, alphaTest:.5, side:THREE.DoubleSide, roughness:.85, color:0xd8e0c8 });
    const trunkTex = canvasTex(64, 256, (x,y) => { const v = 70 + fbm(x/6, y/18)*50 + vnoise(x,y,3)*14; return [v*.92, v*.82, v*.7]; }, { repeat:[2, 2] });
    const trunkMat = new THREE.MeshStandardMaterial({ map:trunkTex, roughness:.95, color:0x8a7f74 });
    const leafGeo = new THREE.PlaneGeometry(1, 1); leafGeo.translate(0, .5, 0);
    const flatGeo = new THREE.PlaneGeometry(1, 1); flatGeo.rotateX(-Math.PI/2);
    let ti = 0;
    function tree(x, z, total, spread, k){
      const g = new THREE.Group(); const th = total*.38, ch = total - th*.75;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.09*spread/6, .17*spread/6, th, 9), trunkMat); trunk.position.y = th/2; trunk.castShadow = true; g.add(trunk);
      for (let i=0;i<3;i++){ const b = new THREE.Mesh(new THREE.CylinderGeometry(.03, .07, th*.7, 6), trunkMat); b.position.set(Math.sin(i*2.1+k)*.3, th*.75 + th*.3, Math.cos(i*2.1+k)*.3); b.rotation.set(Math.cos(i*2.1+k)*.7, 0, -Math.sin(i*2.1+k)*.7); g.add(b); }
      for (let i=0;i<4;i++){ const leaf = new THREE.Mesh(leafGeo, leafMat); leaf.position.y = th*.75; leaf.rotation.y = i*Math.PI/4 + rnd(k,44); leaf.scale.set(spread*(.9 + rnd(k+i,45)*.2), ch, 1); leaf.castShadow = true; g.add(leaf); }
      for (let i=0;i<2;i++){ const leaf = new THREE.Mesh(flatGeo, leafMat); leaf.position.y = th*.75 + ch*(.45 + i*.3); leaf.rotation.y = rnd(k+i,46)*3; leaf.rotation.x = (rnd(k+i,47)-.5)*.5; leaf.scale.set(spread*(.95 - i*.25), 1, spread*(.9 - i*.2)); leaf.castShadow = true; g.add(leaf); }
      g.position.set(x, 0, z); g.rotation.y = rnd(k,48)*6.28; world.add(g);
      occluders.trees.push({ x, y: th*.75 + ch*.5, z, r: spread*.5, ry: ch*.5 });
    }
    for (let z = Z1 + 6; z > Z0; z -= 30 + rnd(ti,41)*18) { if (rnd(ti,42) > .25 && !camClear(z)) tree(KR + 1.0 + rnd(ti,43)*.5, z + rnd(ti,47)*3, 9 + rnd(ti,49)*3, 6.5 + rnd(ti,50)*2, ti); ti++; }
    tree(KR + .75, -268, 10.5, 7, 991);                                      // one trunk wipes the lens during the closing hold
    for (let z = Z1 + 10; z > Z0; z -= 19 + rnd(ti,41)*10) { if (rnd(ti,42) > .18 && !clear(z)) tree(KL - 1.3 - rnd(ti,43)*.6, z + rnd(ti,47)*3, 10 + rnd(ti,49)*3.5, 7 + rnd(ti,50)*2.5, ti); ti++; }
    for (let z = Z1; z > Z0; z -= 11 + rnd(ti,41)*9) { if (rnd(ti,42) > .35 && !clear(z)) tree(KL - 16 - rnd(ti,43)*14, z + rnd(ti,47)*5, 11 + rnd(ti,49)*3, 8 + rnd(ti,50)*3, ti); ti++; }
    // street lamps: tall, modern, on the sun side kerb and the camera side kerb alternately
    const lampHead = new THREE.MeshStandardMaterial({ color:0xd9dbdf, roughness:.35, metalness:.6 });
    for (let z = Z1; z > Z0; z -= 34) { const sx = (Math.round(z/34) % 2) ? -1 : 1; const px = sx < 0 ? KL - .5 : KR + .5; if (sx > 0 && camClear(z)) continue;
      const p = new THREE.Mesh(new THREE.CylinderGeometry(.07, .12, 9.5, 10), poleMat); p.position.set(px, 4.75, z); p.castShadow = true; world.add(p);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(2.6, .1, .12), poleMat); arm.position.set(px - sx*1.2, 9.3, z); world.add(arm);
      const head = new THREE.Mesh(new THREE.BoxGeometry(.8, .14, .32), lampHead); head.position.set(px - sx*2.4, 9.25, z); world.add(head); }
    // a few people-scale things that read in a blur: bollards and bins on the camera side
    const bollard = new THREE.MeshStandardMaterial({ color:0x2a2d31, roughness:.5, metalness:.6 });
    for (let z = Z1; z > Z0; z -= 23) { if (camClear(z)) continue; const b = new THREE.Mesh(new THREE.CylinderGeometry(.07, .08, .95, 10), bollard); b.position.set(KR + .55, .55, z + rnd(z,3)*5); b.castShadow = true; world.add(b); }
  }

  // a real photo as the world: equirect HDR projected onto a ground plane and a dome,
  // reflections and light from the same image, a shadow catcher under the car
  function buildHDRI(){
    const finish = (tex) => {
      tex.mapping = THREE.EquirectangularReflectionMapping;
      const env = pm.fromEquirectangular(tex).texture;
      scene.environment = env; scene.environmentIntensity = hdrExposure;
      const dome = new GroundedSkybox(tex, hdrHeight, 160, 96); dome.position.y = hdrHeight; dome.rotation.y = hdrYaw; scene.add(dome);
      scene.environmentRotation = new THREE.Euler(0, hdrYaw, 0);
      // where is the sun? brightest texel of the image, for the cast shadow
      sunDir.copy(sunFromEquirect(tex));
      sun.position.copy(sunDir).multiplyScalar(70); sun.intensity = 2.2; sun.color.set(0xfff4e6);
      const catcher = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.ShadowMaterial({ opacity: .55 }));
      catcher.rotation.x = -Math.PI/2; catcher.position.y = .002; catcher.receiveShadow = true; scene.add(catcher);
      hdrReady = true; maybeReady();
    };
    if (hdr === 'synthetic') finish(synthEquirect());
    else if (/\.jpg$/i.test(hdr)) { const l = new UltraHDRLoader(); l.setDataType(THREE.HalfFloatType); l.load(hdr, finish, undefined, e => onFail && onFail(e)); }
    else new RGBELoader().load(hdr, finish, undefined, e => onFail && onFail(e));
  }
  // for testing without a photo: a painted equirect (sky, sun, flat ground with a road), HDR values
  function synthEquirect(){
    const W = 1024, Hh = 512, out = new Float32Array(W*Hh*4);
    for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
      const phi = (y + .5) / Hh * Math.PI, th = (x + .5) / W * Math.PI * 2 - Math.PI, el = Math.PI/2 - phi;
      let r, g, bb;
      if (el > 0) { const k = Math.pow(Math.max(0, 1 - el/(Math.PI/2)), 1.4); r = lerp(.25, .75, k); g = lerp(.42, .82, k); bb = lerp(.9, 1.0, k);
        const sd = Math.acos(Math.min(1, Math.cos(el)*Math.cos(th - .8)*Math.cos(.55) + Math.sin(el)*Math.sin(.55))); const sun = Math.exp(-sd*sd/.0015)*60 + Math.exp(-sd*sd/.12)*1.2; r += sun; g += sun*.95; bb += sun*.85; }
      else { const dist = hdrHeight / Math.tan(-el + 1e-4); const lateral = dist * Math.sin(th); const road = Math.abs(lateral) < 5.2 ? 1 : 0; const n = vnoise(x, y, 3)*.06;
        const v = road ? .11 + n : .22 + n*1.5; r = v*(road?1:1.05); g = v*(road?1:.98); bb = v*(road?1.04:.9);
        if (road && Math.abs(Math.abs(lateral) - 5.0) < .18) { r = g = bb = .55; } }
      const i = (y*W + x)*4; out[i] = r; out[i+1] = g; out[i+2] = bb; out[i+3] = 1;
    }
    const t = new THREE.DataTexture(out, W, Hh, THREE.RGBAFormat, THREE.FloatType); t.flipY = true; t.needsUpdate = true; return t;
  }

  function buildStreet(){
  const LEN = 520, Z0 = 80;                                // from z=+80 behind to z=-440 ahead
  const roadTex = roadTexture(), roadR = roadRough();
  const roadMat = new THREE.MeshStandardMaterial({ map:roadTex, roughnessMap:roadR, roughness:1, metalness:0, envMapIntensity:.7, normalMap:normalTex(256, asphaltHeight, 1.6, [1, LEN/8]), normalScale:new THREE.Vector2(.35,.35), color:0x9a9a9a });
  roadTex.repeat.set(1, LEN/8); roadR.repeat.set(1, LEN/8);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(10.5, LEN), roadMat); road.rotation.x = -Math.PI/2; road.position.z = Z0 - LEN/2; road.receiveShadow = true; world.add(road);
  // kerbs and pavements
  const paveTex = canvasTex(256, 256, (x,y) => { const n = fbm(x/30,y/30)*.5 + vnoise(x,y,4)*.5; let v = 128 + n*40; if ((x % 64) < 2 || (y % 64) < 2) v *= .7; return [v, v*.99, v*.95]; }, { repeat:[1, LEN/2] });
  const paveMat = new THREE.MeshStandardMaterial({ map:paveTex, roughness:.95 });
  for (const sx of [-1, 1]) {
    const kerb = new THREE.Mesh(new THREE.BoxGeometry(.25, .16, LEN), new THREE.MeshStandardMaterial({ color:0xb9b6ae, roughness:.9 })); kerb.position.set(sx*5.35, .08, Z0 - LEN/2); kerb.receiveShadow = true; kerb.castShadow = true; world.add(kerb);
    const pave = new THREE.Mesh(new THREE.BoxGeometry(4.5, .16, LEN), paveMat); pave.position.set(sx*7.7, .08, Z0 - LEN/2); pave.receiveShadow = true; world.add(pave);
  }
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.MeshStandardMaterial({ map:dirtTexture(), roughness:1, color:0x8a8780 }));
  ground.rotation.x = -Math.PI/2; ground.position.set(0, -.03, -400); ground.receiveShadow = true; world.add(ground);
  // the gravel stretch (roadworks): displaced plane with ruts, loose stones, cones
  if (false) {
  const gz0 = -SPEED*GRAVEL[0], gz1 = -SPEED*GRAVEL[1], GL = Math.abs(gz1-gz0)+10;
  const gravelMat = new THREE.MeshStandardMaterial({ map:gravelTexture(), roughness:1, metalness:0, normalMap:normalTex(256, gravelHeight, 3.0, [6, 18]) });
  const gravelGeo = new THREE.PlaneGeometry(10.4, GL, 52, Math.round(GL*2));
  { const pa = gravelGeo.attributes.position;
    for (let i=0;i<pa.count;i++){ const x = pa.getX(i), y = pa.getY(i);
      const rut = Math.exp(-Math.pow((Math.abs(x)-.83)/.22, 2))*.035, edge = smooth(0, 3, GL/2 - Math.abs(y));
      pa.setZ(i, (fbm(x*1.3 + 7, y*1.3)*.07 + vnoise(Math.floor(x*9), Math.floor(y*9), 6)*.02 - rut) * edge); }
    gravelGeo.computeVertexNormals(); }
  const gravel = new THREE.Mesh(gravelGeo, gravelMat); gravel.rotation.x = -Math.PI/2; gravel.position.set(0, .012, (gz0+gz1)/2); gravel.receiveShadow = true; gravel.castShadow = true; world.add(gravel);
  const rockMat = new THREE.MeshStandardMaterial({ color:0x7b7369, roughness:.95 });
  const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), rockMat, 600); rocks.castShadow = true; rocks.receiveShadow = true; world.add(rocks);
  { const M = new THREE.Matrix4(), P = new THREE.Vector3(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), c = new THREE.Color();
    for (let i=0;i<600;i++){ const x = (rnd(i,1)-.5)*9.8, z = (gz0+gz1)/2 + (rnd(i,2)-.5)*GL*.92, sc = .02 + rnd(i,3)*.05;
      M.compose(P.set(x, sc*.5, z), Q.setFromEuler(new THREE.Euler(rnd(i,4)*6, rnd(i,5)*6, rnd(i,6)*6)), S.set(sc, sc*(.6+rnd(i,7)*.5), sc)); rocks.setMatrixAt(i, M);
      c.setHSL(.08, .12 + rnd(i,8)*.1, .3 + rnd(i,9)*.3); rocks.setColorAt(i, c); } }
  const coneMat = new THREE.MeshStandardMaterial({ color:0xff5a1f, roughness:.6 }), coneBand = new THREE.MeshStandardMaterial({ color:0xf4f4f0, roughness:.5 });
  for (let i=0;i<6;i++){ const g = new THREE.Group(); const c = new THREE.Mesh(new THREE.ConeGeometry(.17, .62, 16), coneMat); c.position.y = .31; c.castShadow = true; g.add(c);
    const b = new THREE.Mesh(new THREE.CylinderGeometry(.11, .13, .1, 16), coneBand); b.position.y = .38; g.add(b);
    const base = new THREE.Mesh(new THREE.BoxGeometry(.4, .04, .4), new THREE.MeshStandardMaterial({ color:0x222222 })); base.position.y = .02; g.add(base);
    g.position.set(i < 3 ? -4.6 : 4.6, 0, (i < 3 ? gz0 + 4 : gz1 - 4) + (i%3)*1.6); world.add(g); }
  }

  // buildings: boxes with a window grid, two rows, both sides, gaps for sky
  const winTex = canvasTex(256, 512, (x,y) => { const cx = x % 64, cy = y % 64; const win = cx > 9 && cx < 55 && cy > 10 && cy < 46; const sh = vnoise(Math.floor(x/64), Math.floor(y/64), 7); const floorBand = cy < 4; let v = win ? 58 + sh*55 + vnoise(x,y,2)*14 : (floorBand ? 96 : 128 + fbm(x/40,y/40)*34); return win ? [v*.86, v*.95, v*1.12] : [v*1.02, v*.99, v*.95]; });
  const bldMat = new THREE.MeshStandardMaterial({ map:winTex, roughness:.7, metalness:.05, color:0xa39b93 });
  const bldMat2 = new THREE.MeshStandardMaterial({ map:winTex, roughness:.75, metalness:.05, color:0x9c8574 });
  const bldMat3 = new THREE.MeshStandardMaterial({ map:winTex, roughness:.55, metalness:.15, color:0x7d8b98 });
  let bi = 0;
  for (let z = Z0 + 20; z > Z0 - LEN; z -= 24 + rnd(bi,31)*18) {
    for (const sx of [-1, 1]) {
      if (rnd(bi,32) < .22) { bi++; continue; }                                         // a gap
      const w = 16 + rnd(bi,33)*22, d = 14 + rnd(bi,34)*16, h = 11 + Math.pow(rnd(bi,35), 1.4)*40;
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [bldMat, bldMat2, bldMat3][Math.floor(rnd(bi,36)*3)]);
      m.material = m.material.clone(); m.material.map = winTex.clone(); m.material.map.repeat.set(Math.round(w/4), Math.round(h/3.2)); m.material.map.needsUpdate = true;
      m.position.set(sx*(18 + rnd(bi,37)*14 + w/2), h/2 - .02, z - d/2); m.castShadow = true; m.receiveShadow = true; world.add(m);
      // a second, taller block behind, set back
      if (rnd(bi,38) < .5) { const h2 = h + 10 + rnd(bi,39)*30, w2 = w*.8; const m2 = new THREE.Mesh(new THREE.BoxGeometry(w2, h2, d), bldMat3); m2.position.set(sx*(40 + rnd(bi,40)*20 + w2/2), h2/2, z - d/2 - 6); m2.castShadow = true; world.add(m2); }
      bi++;
    }
  }
  // trees: trunk plus three crossed leaf planes, along both pavements
  const leafTex = canvasTex(256, 256, (x,y) => { const u = (x-128)/128, v = (y-150)/120; let a = 0; let c = 0; for (let k=0;k<26;k++){ const bx = Math.sin(k*2.3)*.55, by = Math.cos(k*1.7)*.5 - .1, r = .22 + rnd(k,3)*.2; const d = Math.hypot(u-bx, (v-by)*1.2); if (d < r) { a = 255; c = Math.max(c, 1 - d/r); } } const n = fbm(x/12,y/12); if (a && n < .42) a = 0; const shade = .55 + .45*Math.max(0, Math.min(1, 1 - (y/256))); const g = (34 + c*58 + n*26) * shade; return [g*.7 + 8, g, g*.4, a]; });
  const leafMat = new THREE.MeshStandardMaterial({ map:leafTex, alphaTest:.5, side:THREE.DoubleSide, roughness:.9 });
  const trunkMat = new THREE.MeshStandardMaterial({ color:0x5b4a3d, roughness:.95 });
  const leafGeo = new THREE.PlaneGeometry(7, 7); leafGeo.translate(0, 3.5, 0);
  const trees = []; let ti = 0;
  for (let z = Z0 + 10; z > Z0 - LEN; z -= 13 + rnd(ti,41)*12) for (const sx of [-1, 1]) {
    if (rnd(ti,42) < .3) { ti++; continue; }
    const g = new THREE.Group(); const sc = .62 + rnd(ti,43)*.5;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.12*sc, .2*sc, 4.2*sc, 8), trunkMat); trunk.position.y = 2.1*sc; trunk.castShadow = true; g.add(trunk);
    for (let k=0;k<3;k++){ const leaf = new THREE.Mesh(leafGeo, leafMat); leaf.position.y = 3.4*sc; leaf.rotation.y = k*Math.PI/3 + rnd(ti,44)*1; leaf.scale.setScalar(sc*(.9 + rnd(ti+k,45)*.3)); leaf.castShadow = true; g.add(leaf); }
    g.position.set(sx*(8.2 + rnd(ti,46)*1.5), 0, z + rnd(ti,47)*4); world.add(g); trees.push(g); ti++;
  }
  // street lamps every 36 m, alternating sides; railing on the camera side
  const poleMat = new THREE.MeshStandardMaterial({ color:0x4b4f55, metalness:.6, roughness:.5 });
  for (let z = Z0; z > Z0 - LEN; z -= 36) { const sx = (Math.round(z/36) % 2) ? -1 : 1; const p = new THREE.Mesh(new THREE.CylinderGeometry(.07, .1, 8, 10), poleMat); p.position.set(sx*5.9, 4, z); p.castShadow = true; world.add(p);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(2.2, .08, .1), poleMat); arm.position.set(sx*4.9, 7.9, z); world.add(arm);
    const head = new THREE.Mesh(new THREE.BoxGeometry(.6, .14, .3), new THREE.MeshStandardMaterial({ color:0xdedfe2, roughness:.4 })); head.position.set(sx*3.9, 7.85, z); world.add(head); }
  const railMat = new THREE.MeshStandardMaterial({ color:0xc9ccd1, metalness:.8, roughness:.35 });
  for (let z = Z0; z > Z0 - LEN; z -= 2.2) { const p = new THREE.Mesh(new THREE.BoxGeometry(.06, 1.0, .06), railMat); p.position.set(-6.2, .66, z); world.add(p); }
  for (const y of [.75, 1.12]) { const r = new THREE.Mesh(new THREE.BoxGeometry(.05, .05, LEN), railMat); r.position.set(-6.2, y, Z0 - LEN/2); world.add(r); }
  // clouds: lit billboards
  const cloudTex = (() => {
    const S = 512; const dens = (x,y) => Math.max(0, (fbm(x/95 + 11, y/95) * .62 + fbm(x/28, y/28) * .38) - .40) * 2.6;
    return canvasTex(S, S, (x,y) => { const dx = (x - S/2)/(S/2), dy = (y - S/2)/(S/2); const edge = Math.max(0, 1 - Math.pow(Math.hypot(dx, dy*1.6), 2.2));
      const n = Math.min(1, dens(x,y)) * edge; const lit = Math.max(0, Math.min(1, (dens(x,y) - dens(x+9, y-7)) * 3.0 + .45));
      return [lerp(150, 255, lit), lerp(158, 252, lit), lerp(178, 246, lit), Math.min(255, n*255)]; });
  })();
  for (let i=0;i<30;i++){
    const a = rnd(i,61)*Math.PI*2, R = 900 + rnd(i,62)*1500, hgt = 260 + Math.pow(rnd(i,63), 1.3)*900;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map:cloudTex, transparent:true, depthWrite:false, fog:false, opacity:.95 }));
    const w = 380 + rnd(i,64)*800; sp.scale.set(w, w*(.3 + rnd(i,65)*.25), 1); sp.position.set(Math.sin(a)*R, hgt, Math.cos(a)*R); scene.add(sp);
  }
  // hills in the gaps, far
  const hillMat = new THREE.MeshBasicMaterial({ color:0x6c7788, fog:true });
  for (let i=0;i<14;i++){ const w = 500 + rnd(i,7)*700, h = 60 + rnd(i,8)*120; const geo = new THREE.PlaneGeometry(w, h, 32, 1); const pa = geo.attributes.position;
    for (let k=0;k<pa.count;k++){ if (pa.getY(k) > 0) { const u = (pa.getX(k)/w + .5); pa.setY(k, h*(.2 + .8*fbm(k*.11 + i*3.1, i*2.1)) * Math.pow(Math.sin(Math.PI*u), .7)); } }
    const m = new THREE.Mesh(geo, hillMat); const a = i*(Math.PI*2/14) + rnd(i,9)*.2, R = 700 + rnd(i,10)*200; m.position.set(Math.sin(a)*R, 0, -Math.cos(a)*R); m.lookAt(0,0,0); m.position.y = -h*.5 + 2; scene.add(m); }
  bakeEnvironment();
  }

  // ---- the car ----------------------------------------------------------------
  const PAINT_U = () => ({ uOn:{ value:0 }, uSeam:{ value:-99 }, uGlow:{ value:1 }, uPulse:{ value:0 }, uPulseZ:{ value:-99 } });
  function makePaint(U){
    const m = new THREE.MeshPhysicalMaterial({ color:paint, metalness:0, roughness:.15, clearcoat:.6, clearcoatRoughness:.16, envMapIntensity:1.25, specularIntensity:1 });
    m.userData.U = U;
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWp = (modelMatrix * vec4(transformed,1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWp; uniform float uOn; uniform float uSeam; uniform float uGlow; uniform float uPulse; uniform float uPulseZ;')
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          float applied = (1.0 - smoothstep(uSeam-0.04, uSeam+0.04, vWp.z)) * uOn;
          roughnessFactor = mix(roughnessFactor, 0.03, applied);`)
        .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
          material.clearcoat = mix(material.clearcoat, 1.0, applied);
          material.clearcoatRoughness = mix(material.clearcoatRoughness, 0.02, applied);`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          {
            vec3 vdirP = normalize(cameraPosition - vWp);
            float rim = pow(1.0 - max(0.0, dot(normalize(normal), vdirP)), 2.5);
            float band = exp(-pow((vWp.z - uPulseZ)/0.22, 2.0));
            // squeegee line, then the "done" highlight: rim glow plus a fast bright band
            totalEmissiveRadiance += vec3(1.0, .97, .92) * exp(-pow((vWp.z - uSeam)/0.035, 2.0)) * uOn * step(uSeam, 50.0) * 0.35 * uGlow;
            totalEmissiveRadiance += vec3(1.0, .95, .88) * uPulse * (rim * 0.14 + band * 0.16 + 0.008);
          }`);
    };
    m.customProgramCacheKey = () => 'dd-paint-v5';
    return m;
  }
  const paintDefault = makePaint(PAINT_U());
  const trim = new THREE.MeshStandardMaterial({ color:0x15161a, metalness:.2, roughness:.45 });
  const chrome = new THREE.MeshStandardMaterial({ color:0xf2f3f4, metalness:1, roughness:.07 });
  const rims = new THREE.MeshStandardMaterial({ color:0xb9bcc0, metalness:1, roughness:.38 });
  const glass = new THREE.MeshPhysicalMaterial({ color:0x262c33, metalness:0, roughness:0, transparent:true, opacity:.74, envMapIntensity:1.0, depthWrite:false });
  const tyre = new THREE.MeshStandardMaterial({ color:0x0c0c0e, roughness:.92 });
  const dark = new THREE.MeshStandardMaterial({ color:0x0b0b0d, metalness:.1, roughness:.6 });
  const disc = new THREE.MeshStandardMaterial({ color:0x8d9094, metalness:.95, roughness:.42 });
  const badge = new THREE.MeshStandardMaterial({ color:0xd9dbde, metalness:1, roughness:.18 });
  const mirror = new THREE.MeshStandardMaterial({ color:0xdfe3e8, metalness:1, roughness:.02 });
  const KIT = { glass, chrome, lampchrome:chrome, trim, rims, tyre, disc, dark, badge, mirror };

  function makeFilm(U){
    const m = new THREE.MeshPhysicalMaterial({ color:0xffffff, metalness:0, roughness:.03, transmission:1, thickness:.002, ior:1.5, clearcoat:0, side:THREE.DoubleSide, envMapIntensity:1.0, polygonOffset:true, polygonOffsetFactor:-2, polygonOffsetUnits:-2 });
    m.userData.U = U;
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWpF; varying vec3 vNf;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWpF = (modelMatrix * vec4(transformed,1.0)).xyz; vNf = normalize(mat3(modelMatrix) * objectNormal);');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWpF; varying vec3 vNf; uniform float uOp; uniform float uSeam; uniform float uOn;')
        .replace('#include <dithering_fragment>', `#include <dithering_fragment>
          vec3 vdir = normalize(cameraPosition - vWpF);
          float fres = pow(1.0 - abs(dot(normalize(vNf), vdir)), 2.5);
          float behind = (1.0 - smoothstep(uSeam-0.03, uSeam+0.03, vWpF.z)) * uOn;
          float seam = exp(-pow((vWpF.z - uSeam)/0.03, 2.0)) * uOn;
          gl_FragColor.rgb += vec3(1.0, .98, .95) * (fres * 0.22 * uOp * (1.0 - behind*0.6) + seam * 0.5);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.rgb * 0.92 + 0.05, uOp * 0.25 * (1.0 - behind));`);
    };
    m.customProgramCacheKey = () => 'dd-film-v5';
    return m;
  }

  const draco = new DRACOLoader(); draco.setDecoderPath(DRACO_PATH);
  const loader = new GLTFLoader(); loader.setDRACOLoader(draco);
  let car = null, wheels = [], ready = false, baseRotY = 0;
  let DIM = { length:4.95, width:1.98, height:1.95, size:new THREE.Vector3(1.98,1.95,4.95) };
  const blurDiscs = [], blurTex = blurDiscTexture();
  const films = [], syncU = [];

  async function fetchModel(url){
    let r = await fetch(url).catch(()=>null);
    if (r && r.ok) { const buf = await r.arrayBuffer(); if (buf.byteLength>1000 && new DataView(buf).getUint32(0,true)===0x46546C67) return buf; }
    r = await fetch(url.replace(/\.glb$/,'')+'.b64.txt'); if (!r.ok) throw new Error('model not found');
    const bin = atob((await r.text()).trim()), buf = new Uint8Array(bin.length); for (let i=0;i<bin.length;i++) buf[i]=bin.charCodeAt(i); return buf.buffer;
  }
  fetchModel(model).then(buf => loader.parse(buf, '', g => {
    car = g.scene;
    wheels = prepareWheels(car);
    DIM = normalise(car, { length: 4.95, noseFlip });
    car.updateMatrixWorld(true);
    baseRotY = car.rotation.y;
    const paintByPanel = {}, atlasChrome = {};
    const grpOf = o => { let g = ''; for (let p = o; p; p = p.parent) g += (p.name || '') + '|'; return g; };
    car.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; o.layers.enable(1);
      const kind = classify(o);
      let pid = null; for (let p = o; p && !pid; p = p.parent) for (const id in PANEL_RX) if (PANEL_RX[id].test(p.name || '')) { pid = id; break; }
      {
        // the model's underside (suspension, floor, bones, engine) ships with light grey textures: black it out
        let grp = ''; for (let p = o; p; p = p.parent) grp += (p.name || '') + '|';
        const low = new THREE.Box3().setFromObject(o);
        const underside = /Suspension|Body_Bones|Engine|Diffuser/.test(grp) || (low.max.y < 0.5 && /keep|chrome|dark/.test(kind) && !/Bumper|SideSkirts|Fender|Door|SK_Exhaust|Light/.test(grp));
        if (underside && kind !== 'lamp' && kind !== 'tyre' && kind !== 'rims' && kind !== 'disc') { o.material = dark; o.castShadow = true; }
      }
      if (kind === 'lamp' && o.material && o.material.map) { const lm = o.material.clone(); lm.emissive = new THREE.Color(0xfff1dc); lm.emissiveMap = lm.map; lm.emissiveIntensity = 1.4; o.material = lm; }
      // the model's brightwork material is a palette atlas (chrome, greys, black plastic, exhaust tint)
      // with a metalness map: keep it, just make the chrome parts properly glossy, so the wheel-arch
      // liners and other black pieces that share the material stay black instead of turning to mirror
      if (kind === 'chrome' && o.material && o.material.map && o.material.metalnessMap && !/Mirror/.test(grpOf(o))) {
        const key = o.material.uuid; if (!atlasChrome[key]) { const cm = o.material.clone(); cm.roughness = .09; cm.metalness = 1; cm.envMapIntensity = 1.25; cm.clearcoat = 0; atlasChrome[key] = cm; }
        o.material = atlasChrome[key]; o.userData.atlas = true;
      }
      if (kind === 'body') {
        if (pid) { if (!paintByPanel[pid]) paintByPanel[pid] = makePaint(PAINT_U()); o.material = paintByPanel[pid]; o.userData.pid = pid; }
        else o.material = paintDefault;
      } else if (KIT[kind] && o.material !== dark && !o.userData.atlas) o.material = KIT[kind];
    });
    for (const pid of SYNC) if (paintByPanel[pid]) syncU.push(paintByPanel[pid].userData.U);
    scene.add(car);
    { const gs = groundShadow(DIM.size, .5); gs.position.y = .006; scene.add(gs); }
    // Detail Dungeon show plates: black, silver and red, on the front bumper and in the tailgate recess
    {
      const tl = new THREE.TextureLoader();
      const pmap = tl.load(new URL('../img/plate-dd.png', import.meta.url).href); pmap.colorSpace = THREE.SRGBColorSpace; pmap.anisotropy = 8;
      const pmet = tl.load(new URL('../img/plate-dd-metal.png', import.meta.url).href);
      const face = new THREE.MeshStandardMaterial({ map:pmap, metalnessMap:pmet, metalness:1, roughness:.42, envMapIntensity:1.1 });
      const edge = new THREE.MeshStandardMaterial({ color:0x111214, roughness:.5, metalness:.2 });
      const geo = new THREE.BoxGeometry(.44, .13, .006);
      const mk = (pos, rot) => { const m = new THREE.Mesh(geo, [edge, edge, edge, edge, face, edge]); m.position.set(...pos); m.rotation.set(...rot); m.castShadow = true; m.receiveShadow = true; m.layers.enable(1); m.updateMatrixWorld(true); car.attach(m); return m; };
      mk([0, .70, -2.496], [0, Math.PI, 0]);          // front, on the bumper bar
      mk([0, 1.05, 2.34], [-.29, 0, 0]);               // rear, tailgate recess (leans with the gate)
    }
    // film sheets
    for (const f of FILM) {
      const entry = { sheets:[], paintU:[], from:new THREE.Vector3(...f.from), t:f.t, box:new THREE.Box3(), cam:f.cam, tgt:f.tgt };
      for (const pid of f.ids) {
        if (paintByPanel[pid]) entry.paintU.push(paintByPanel[pid].userData.U);
        car.traverse(o => {
          if (!o.isMesh || o.userData.pid !== pid) return;
          const geo = o.geometry.clone(); geo.applyMatrix4(o.matrixWorld); geo.computeVertexNormals();
          const pa = geo.attributes.position, na = geo.attributes.normal;
          for (let i=0;i<pa.count;i++){ pa.setXYZ(i, pa.getX(i)+na.getX(i)*.002, pa.getY(i)+na.getY(i)*.002, pa.getZ(i)+na.getZ(i)*.002); }
          geo.computeBoundingBox(); entry.box.union(geo.boundingBox);
          const U = { uOp:{ value:0 }, uSeam:{ value:-99 }, uOn:{ value:0 } };
          const m = new THREE.Mesh(geo, makeFilm(U)); m.renderOrder = 5; m.frustumCulled = false; m.visible = false; m.userData.U = U; m.layers.enable(1);
          m.userData.side = (geo.boundingBox.min.x + geo.boundingBox.max.x) / 2 < 0 && f.mirror ? -1 : 1;
          entry.sheets.push(m);
        });
      }
      entry.zmin = entry.box.min.z; entry.zmax = entry.box.max.z; entry.centre = entry.box.getCenter(new THREE.Vector3());
      for (const m of entry.sheets) { m.geometry.translate(-entry.centre.x, -entry.centre.y, -entry.centre.z); m.position.copy(entry.centre); scene.add(m); }
      films.push(entry);
    }
    for (const w of wheels) {
      const b = new THREE.Box3().setFromObject(w); const sz = b.getSize(new THREE.Vector3());
      const r = Math.max(sz.y, sz.z)/2, wsc = w.getWorldScale(new THREE.Vector3()).x || 1, inv = 1/wsc;
      const wp = w.getWorldPosition(new THREE.Vector3());
      const localPlusX = Math.sign(w.worldToLocal(wp.clone().add(new THREE.Vector3(1,0,0))).x) || 1;
      const outer = Math.sign(wp.x) * localPlusX;
      const m = new THREE.Mesh(new THREE.CircleGeometry(r*inv*.8, 48), new THREE.MeshBasicMaterial({ map:blurTex, transparent:true, opacity:0, depthWrite:false, side:THREE.DoubleSide }));
      m.rotation.y = Math.PI/2; m.position.x = outer * ((sz.x/2)*inv + .004*inv); m.renderOrder = 3; m.layers.enable(1); w.add(m); blurDiscs.push(m);
    }
    modelReady = true; maybeReady();
  }, e => onFail && onFail(e))).catch(e => onFail && onFail(e));
  function maybeReady(){ if (modelReady && hdrReady && !ready) { ready = true; resize(); onReady && onReady(api); } }

  // ---- stones and dust ------------------------------------------------------------
  const N_GRIT = 600;
  const grit = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.011, 0), new THREE.MeshStandardMaterial({ color:0x8a8178, roughness:.95 }), N_GRIT);
  grit.frustumCulled = false; grit.castShadow = true; scene.add(grit);
  { const c = new THREE.Color(); for (let i=0;i<N_GRIT;i++){ c.setHSL(.08 + rnd(i,21)*.04, .18 + rnd(i,22)*.2, .3 + rnd(i,23)*.35); grit.setColorAt(i, c); } }
  const N_DUST = 900;
  const dustGeo = new THREE.BufferGeometry();
  const dPos = new Float32Array(N_DUST*3), dSize = new Float32Array(N_DUST), dAlpha = new Float32Array(N_DUST);
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3)); dustGeo.setAttribute('aSize', new THREE.BufferAttribute(dSize, 1)); dustGeo.setAttribute('aAlpha', new THREE.BufferAttribute(dAlpha, 1));
  const dustMat = new THREE.ShaderMaterial({
    uniforms: { map:{ value: softDot() }, uColor:{ value: new THREE.Color(0xa89a86) }, uScale:{ value: 600 } },
    vertexShader: `attribute float aSize; attribute float aAlpha; varying float vA; uniform float uScale;
      void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv; gl_PointSize = aSize * uScale / -mv.z; vA = aAlpha; }`,
    fragmentShader: `uniform sampler2D map; uniform vec3 uColor; varying float vA;
      void main(){ float a = texture2D(map, gl_PointCoord).a * vA; if (a < 0.003) discard; gl_FragColor = vec4(uColor, a); }`,
    transparent:true, depthWrite:false, depthTest:true, fog:false,
  });
  const dust = new THREE.Points(dustGeo, dustMat); dust.frustumCulled = false; dust.renderOrder = 6; scene.add(dust);

  // ---- timeline ----------------------------------------------------------------
  const M = new THREE.Matrix4(), P = new THREE.Vector3(), Q = new THREE.Quaternion(), S = new THREE.Vector3(1,1,1), AX = new THREE.Vector3();
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
  const blurDir = new THREE.Vector2(1, 0); let blurAmt = 0;
  const V3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
  function setTime(t){
    const dist = t * SPEED;
    if (!HDRI) world.position.z = dist;
    wheels.forEach(w => { w.rotation.x = -t*6.5; });
    blurDiscs.forEach(m => { m.material.opacity = .5; });
    if (car) { car.position.y = Math.sin(t*9.3)*.004 + Math.sin(t*23.1)*.002; car.rotation.z = Math.sin(t*7.1)*.0015; car.rotation.y = baseRotY + Math.sin(t*.9)*.003; }
    const onGravel = t > GRAVEL[0] && t < GRAVEL[1];
    if (car && onGravel) { car.position.y += Math.sin(t*31)*.006 + Math.sin(t*47)*.004; car.rotation.z += Math.sin(t*29)*.004; }

    // film: hover in, settle, squeegee, then the panel announces itself
    for (const f of films) {
      const a = t - f.t;
      const h = 1 - ease(a / HOVER);
      const sw = Math.min(1, Math.max(0, (a - HOVER) / SWEEP));
      const seam = lerp(f.zmin - .12, f.zmax + .12, sw);
      const on = a > HOVER ? 1 : 0;
      const pa = a - (HOVER + SWEEP);                                  // time since done
      const pulse = pa > 0 ? (1 - smooth(0, PULSE, pa)) : 0;
      const pulseZ = lerp(f.zmin - .3, f.zmax + .3, Math.min(1, Math.max(0, pa / (PULSE*.8))));
      for (const m of f.sheets) {
        const vis = a > -0.001 && a < HOVER + SWEEP + 1.2;
        m.visible = vis; if (!vis) continue;
        const dir = f.from; const sx = m.userData.side;
        m.position.set(f.centre.x + dir.x*sx*.9*h, f.centre.y + dir.y*.7*h + .06*h, f.centre.z + dir.z*.9*h);
        AX.set(dir.z, 0, -dir.x*sx).normalize(); if (AX.lengthSq() < .5) AX.set(1,0,0);
        m.quaternion.setFromAxisAngle(AX, -.16*h*sx);
        m.userData.U.uOp.value = smooth(0, .3, a) * (1 - smooth(HOVER + SWEEP + .6, HOVER + SWEEP + 1.2, a));
        m.userData.U.uSeam.value = on ? seam : -99; m.userData.U.uOn.value = on;
      }
      for (const U of f.paintU) { U.uOn.value = on; U.uSeam.value = on ? (sw >= 1 ? 99 : seam) : -99; U.uPulse.value = pulse; U.uPulseZ.value = pulseZ; }
    }
    { const u = smooth(FILM[0].t, FILM_END - .3, t);
      const seam = u >= 1 ? 99 : lerp(-DIM.length/2 - .2, DIM.length/2 + .2, u), on = t > FILM[0].t ? 1 : 0;
      for (const U of syncU) { U.uOn.value = on; U.uSeam.value = seam; U.uGlow.value = 0; }
      paintDefault.userData.U.uOn.value = on; paintDefault.userData.U.uSeam.value = seam; paintDefault.userData.U.uGlow.value = 0; }

    // stones off the front tyres on gravel
    const ex = DIM.width*.52, ey = DIM.height*.5, ez = DIM.length*.5, cy = DIM.height*.48;
    for (let i=0;i<N_GRIT;i++){
      const t0 = GRAVEL[0] + rnd(i,1)*(GRAVEL[1]-GRAVEL[0]-.4), life = .9, age = t - t0;
      if (age < 0 || age > life) { M.makeScale(0,0,0); grit.setMatrixAt(i, M); continue; }
      const side = rnd(i,2) < .5 ? -1 : 1, front = rnd(i,16) < .7;
      const sx = side*(DIM.width*.42 + rnd(i,3)*.1), sy = .05, sz = front ? -DIM.length*.31 : DIM.length*.31;
      const vx = side*(-0.3 + rnd(i,5)*1.9), vy = 1.4 + rnd(i,6)*3.2, vz = 2.5 + rnd(i,7)*6.5;
      let x = sx + vx*age, y = sy + vy*age - 4.9*age*age, z = sz + vz*age;
      let dvx = vx, dvy = vy - 9.8*age, dvz = vz;
      const d = (x*x)/(ex*ex) + ((y-cy)*(y-cy))/(ey*ey) + (z*z)/(ez*ez);
      if (d < 1.0 && y > .12) { const nx = x/(ex*ex), ny = (y-cy)/(ey*ey), nz = z/(ez*ez); const nl = Math.hypot(nx,ny,nz)||1; const k = (1 - Math.sqrt(d)) * 1.1 + .04;
        x += nx/nl*k; y += ny/nl*k; z += nz/nl*k*.5; dvx = nx/nl*5; dvy = Math.abs(ny/nl)*3 + 1; dvz = nz/nl*2 + 3; }
      if (y < .012) y = .012;
      const sc = .6 + rnd(i,8)*1.0, sp = Math.hypot(dvx,dvy,dvz);
      Q.setFromUnitVectors(P.set(0,0,1), AX.set(dvx/sp, dvy/sp, dvz/sp));
      M.compose(P.set(x,y,z), Q, S.set(sc, sc, sc*(1.4 + sp*.08))); grit.setMatrixAt(i, M);
    }
    S.set(1,1,1); grit.instanceMatrix.needsUpdate = true;
    for (let i=0;i<N_DUST;i++){
      const t0 = GRAVEL[0] + .1 + rnd(i,41)*(GRAVEL[1]-GRAVEL[0]-.1), life = 1.6 + rnd(i,42)*1.2, age = t - t0, k = i*3;
      if (age < 0 || age > life) { dPos[k+1] = -50; dSize[i] = 0; dAlpha[i] = 0; continue; }
      const side = rnd(i,43) < .5 ? -1 : 1, rear = rnd(i,44) < .75;
      const x0 = side*(DIM.width*.4 + (rnd(i,45)-.5)*.3), z0 = rear ? DIM.length*.32 : -DIM.length*.3, u = age/life;
      dPos[k] = x0 + side*(.3 + rnd(i,46)*1.2)*ease(u) + Math.sin(age*3 + i)*.08;
      dPos[k+1] = .15 + (.6 + rnd(i,47)*1.6)*ease(u*1.1);
      dPos[k+2] = z0 + (SPEED*.72 + rnd(i,48)*3)*age;
      dSize[i] = .6 + 3.2*ease(u); dAlpha[i] = .22 * Math.sin(Math.PI*Math.min(1,u)) * (0.7 + rnd(i,49)*.6);
    }
    dustGeo.attributes.position.needsUpdate = dustGeo.attributes.aSize.needsUpdate = dustGeo.attributes.aAlpha.needsUpdate = true;

    // camera: a continuous move; the open shots are long-lens pans, during the film it
    // travels panel to panel, arriving as each sheet does
    const H = DIM.height;
    const keys = [];                                                   // {t, pos, look, fov}
    keys.push({ t: 0,    pos:[7.4, .95, -9.8],  look:[0, H*.42, -.5], fov:26 });
    keys.push({ t: 2.3,  pos:[6.6, 1.05, -8.6], look:[0, H*.42, -.2], fov:26 });
    for (const f of FILM) keys.push({ t: f.t + HOVER*.75, pos:f.cam, look:f.tgt, fov:f.fov || 32 });
    const TE = FILM_END + PULSE + .2;                                 // last panel lit
    keys.push({ t: TE,        pos:[-2.6, 1.0, 6.2],  look:[0, .7, 2.3],      fov:32 });
    keys.push({ t: TE + 1.4,  pos:[4.6, 1.3, 7.8],   look:[0, H*.42, 1.2],   fov:30 });
    keys.push({ t: TE + 2.8,  pos:[9.0, 1.4, 1.0],   look:[0, H*.44, 0],     fov:28 });
    keys.push({ t: TE + 4.2,  pos:[8.2, 1.05, -9.2], look:[0, H*.58, -.2],   fov:27 });
    keys.push({ t: DUR,       pos:[7.6, 0.98, -8.7], look:[0, H*.60, -.2],   fov:26.5 });
    let k0 = keys[0], k1 = keys[keys.length-1];
    for (let i=0;i<keys.length-1;i++) if (t >= keys[i].t && t < keys[i+1].t) { k0 = keys[i]; k1 = keys[i+1]; break; }
    if (t >= keys[keys.length-1].t) k0 = k1 = keys[keys.length-1];
    const u = k0 === k1 ? 1 : smooth(k0.t, k1.t, t);
    camPos.lerpVectors(V3(k0.pos), V3(k1.pos), u); camLook.lerpVectors(V3(k0.look), V3(k1.look), u);
    camera.fov = lerp(k0.fov, k1.fov, u);
    const kk = Math.max(1, Math.pow(1.6/Math.max(camera.aspect,.4), .72));
    camPos.sub(camLook).multiplyScalar(kk).add(camLook);
    camPos.x += Math.sin(t*1.7)*.02 + Math.sin(t*11.3)*.004; camPos.y += Math.sin(t*2.3)*.012;
    camera.position.copy(camPos); camera.updateProjectionMatrix(); camera.lookAt(camLook);
    if (bokeh) bokeh.uniforms.focus.value = camera.position.distanceTo(camLook);
    if (grade) grade.uniforms.uTime.value = t;
    // background streak direction: where the road runs on screen, seen from this camera
    { const a = new THREE.Vector3(0, 0, 0).project(camera), b = new THREE.Vector3(0, 0, 1.5).project(camera);
      blurDir.set((b.x - a.x) * .5 * camera.aspect, (b.y - a.y) * .5).normalize();
      blurAmt = CITY ? 1.0 : 1.0; }
    if (mblur) { mblur.uniforms.uDir.value.copy(blurDir); mblur.uniforms.uAmt.value = blurAmt; }
    // the sun on screen, and how much of it the passing foliage lets through
    if (flarePass) {
      const fwd = camera.getWorldDirection(new THREE.Vector3());
      const cosA = fwd.dot(sunDir), ang = Math.acos(Math.min(1, Math.max(-1, cosA))) * 180/Math.PI;
      const sp = camera.position.clone().addScaledVector(sunDir, 800).project(camera);
      const uv = cosA > 0 ? new THREE.Vector2(sp.x*.5 + .5, sp.y*.5 + .5) : new THREE.Vector2(-9, -9);
      // occlusion: walk the sun ray from the lens through the trees and towers (world slides, so offset z)
      let vis = 1; const o = camera.position, dz = world.position.z;
      for (const tr of occluders.trees) {
        const cz = tr.z + dz; const rel = new THREE.Vector3(tr.x - o.x, tr.y - o.y, cz - o.z); const s = rel.dot(sunDir); if (s < 0) continue;
        const perp = rel.clone().addScaledVector(sunDir, -s); const dxz = Math.hypot(perp.x, perp.z) / tr.r, dy = Math.abs(perp.y) / tr.ry; const dd = Math.hypot(dxz, dy);
        if (dd < 1) { const k = (1 - dd); const leaf = .55 + .45*fbm(tr.x*.3 + s*.9, cz*.13 + 7); vis *= 1 - Math.min(1, k*1.6) * leaf * .85; }
      }
      for (const b of occluders.boxes) {
        // does the ray pass under the roof while inside the footprint? sample along the ray
        for (let s = 2; s < 400; s += 3) { const x = o.x + sunDir.x*s, y = o.y + sunDir.y*s, z = o.z + sunDir.z*s + 0; const zz = z - dz; if (y > b.y1) break; if (x > b.x0 && x < b.x1 && zz > b.z0 && zz < b.z1) { vis = 0; break; } }
        if (vis === 0) break;
      }
      sunVis = vis; sunSeed = t*.35;
      flarePass.uniforms.uSun.value.copy(uv); flarePass.uniforms.uVis.value = sunVis;
      flarePass.uniforms.uInt.value = flare * smooth(62, 32, ang);
      flarePass.uniforms.uSeed.value = sunSeed;
    }
  }

  // ---- post: car mask, background streak, depth of field, bloom, grade --------------
  let composer = null, bokeh = null, grade = null, mblur = null, maskRT = null, flarePass = null;
  const maskMat = new THREE.MeshBasicMaterial({ color:0xffffff });
  const STREAK = CITY ? [0.022, 0.070] : [0.010, 0.050];      // pan blur: sky, ground (fraction of frame)
  const StreakShader = {
    uniforms: { tDiffuse:{ value:null }, tMask:{ value:null }, uDir:{ value:new THREE.Vector2(1,0) }, uAmt:{ value:1 }, uAspect:{ value:16/9 }, uLen:{ value:new THREE.Vector2(STREAK[0], STREAK[1]) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform sampler2D tMask; uniform vec2 uDir; uniform float uAmt; uniform float uAspect; uniform vec2 uLen; varying vec2 vUv;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main(){
        float m = texture2D(tMask, vUv).r;
        // the ground near the bottom of frame streaks most, the sky least
        float len = uAmt * (uLen.x + (uLen.y - uLen.x) * smoothstep(0.85, 0.0, vUv.y)) * (1.0 - m);
        vec2 d = vec2(uDir.x / uAspect, uDir.y) * len;
        float j = (hash(vUv * 977.0) - 0.5) / 15.0;                 // per-pixel jitter hides the tap pattern
        vec3 acc = vec3(0.0); float wsum = 0.0;
        for (int i = -15; i <= 15; i++) {
          float f = float(i) / 15.0 + j; vec2 uv = vUv + d * f;
          float mk = 1.0 - texture2D(tMask, uv).r * (1.0 - m);        // never pull the car into the background
          float w = (1.0 - abs(f) * 0.3) * mk;
          acc += min(texture2D(tDiffuse, uv).rgb, vec3(24.0)) * w; wsum += w;
        }
        gl_FragColor = vec4(acc / max(wsum, 0.001), 1.0);
      }`,
  };
  // the sun in the lens: a warm glow, rays broken by foliage, a line of ghosts, a faint streak, veiling glare
  const FlareShader = {
    uniforms: { tDiffuse:{ value:null }, uSun:{ value:new THREE.Vector2(-9,-9) }, uVis:{ value:1 }, uInt:{ value:1 }, uAspect:{ value:16/9 }, uSeed:{ value:0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 uSun; uniform float uVis; uniform float uInt; uniform float uAspect; uniform float uSeed; varying vec2 vUv;
      void main(){
        vec4 col = texture2D(tDiffuse, vUv);
        if (uInt < 0.001) { gl_FragColor = col; return; }
        vec2 p = (vUv - .5) * vec2(uAspect, 1.0);
        vec2 s = (uSun - .5) * vec2(uAspect, 1.0);
        vec2 v = p - s; float d = length(v); float ang = atan(v.y, v.x);
        float glow = exp(-d*5.0)*.7 + exp(-d*1.1)*.14;
        float rays = 0.0;
        for (int i = 0; i < 3; i++) { float fi = float(i); float k = 11.0 + fi*9.0; float r = sin(ang*k + uSeed*(1.3+fi*.7) + fi*2.1)*.5 + .5; rays += pow(r, 16.0 + fi*8.0) * exp(-d*(1.6 + fi*.5)); }
        rays *= .22 * (0.5 + 0.5*uVis);
        vec3 gh = vec3(0.0); vec2 axis = -s;
        float gpos[5]; gpos[0]=.30; gpos[1]=.46; gpos[2]=.64; gpos[3]=.92; gpos[4]=1.30;
        float grad[5]; grad[0]=.028; grad[1]=.075; grad[2]=.05; grad[3]=.12; grad[4]=.065;
        for (int i = 0; i < 5; i++) {
          vec2 c = s + axis * gpos[i] * 2.0; float dd = length(p - c) / grad[i];
          float disc = smoothstep(1.0, .6, dd) * (0.3 + 0.7*smoothstep(.15, 1.0, dd));
          vec3 tint = (i == 0) ? vec3(1.0,.85,.6) : (i == 1) ? vec3(.6,.9,1.0) : (i == 2) ? vec3(1.0,.75,.9) : (i == 3) ? vec3(.7,1.0,.85) : vec3(1.0,.9,.7);
          gh += tint * disc * .07;
        }
        float st = exp(-abs(v.y)*60.0) * exp(-abs(v.x)*1.4) * .35;
        vec3 warm = vec3(1.0, .93, .80);
        vec3 add = (warm*glow + warm*rays + vec3(.85,.92,1.0)*st) * uVis + gh * (0.35 + 0.65*uVis);
        add += warm * 0.014 * uVis * exp(-d*.7);
        col.rgb += add * uInt;
        gl_FragColor = col;
      }`,
  };
  const GradeShader = {
    uniforms: { tDiffuse:{ value:null }, uTime:{ value:0 }, uAspect:{ value:16/9 }, uCity:{ value: CITY ? 1 : 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime; uniform float uAspect; uniform float uCity; varying vec2 vUv;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7)) + uTime*13.7) * 43758.5453); }
      void main(){
        vec2 q = (vUv - .5) * vec2(uAspect, 1.0);
        // a touch of lateral colour at the edges of the lens
        vec2 ca = q * 0.0016 * uCity;
        vec3 c = vec3(texture2D(tDiffuse, vUv + ca).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - ca).b);
        float l = dot(c, vec3(.299,.587,.114));
        c = mix(c, c*c*(3.0-2.0*c), 0.44);
        c = mix(vec3(l), c, 1.12);
        c += vec3(.04,.02,-.015) * smoothstep(.3, .9, l);
        c += vec3(-.012,-.005,.022) * (1.0 - smoothstep(.0, .45, l));
        c = mix(c, vec3(dot(c, vec3(.299,.587,.114))), 0.22 * smoothstep(.72, 1.0, l) * uCity);     // bright sky goes pale, not neon
        c = c * (1.0 - 0.012*uCity) + 0.012*uCity;                                                      // lifted blacks, like film
        c *= 1.0 - 0.24 * smoothstep(.5, 1.2, length(q));
        c += (hash(vUv * vec2(1920.0, 1080.0)) - .5) * 0.018;
        gl_FragColor = vec4(c, 1.0);
      }`,
  };
  function resize(){
    const r = stage.getBoundingClientRect();
    const w = Math.max(2, Math.round(r.width)), h = Math.max(2, Math.round(r.height));
    renderer.setSize(w, h, false);
    camera.aspect = w/h; camera.updateProjectionMatrix();
    const pr = renderer.getPixelRatio();
    const rt = new THREE.WebGLRenderTarget(Math.round(w*pr), Math.round(h*pr), { type: THREE.HalfFloatType, samples: 4 });
    maskRT = new THREE.WebGLRenderTarget(Math.round(w*pr/2), Math.round(h*pr/2));
    composer = new EffectComposer(renderer, rt);
    composer.addPass(new RenderPass(scene, camera));
    mblur = new ShaderPass(StreakShader); mblur.uniforms.tMask.value = maskRT.texture; mblur.uniforms.uAspect.value = w/h; composer.addPass(mblur);
    bokeh = new BokehPass(scene, camera, { focus: 7, aperture: .00012, maxblur: CITY ? .010 : .008 }); composer.addPass(bokeh);
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(w,h), CITY ? .14 : .10, CITY ? .45 : .3, CITY ? .92 : .96));
    if (flare > 0) { flarePass = new ShaderPass(FlareShader); flarePass.uniforms.uAspect.value = w/h; composer.addPass(flarePass); }
    composer.addPass(new OutputPass());
    grade = new ShaderPass(GradeShader); grade.uniforms.uAspect.value = w/h; composer.addPass(grade);
  }
  new ResizeObserver(resize).observe(stage);
  let frameNo = 0;

  function renderMask(){
    if (!maskRT) return;
    const bg = scene.background, fog = scene.fog, env = scene.environment; scene.background = null; scene.fog = null;
    scene.overrideMaterial = maskMat; camera.layers.set(1);
    renderer.setRenderTarget(maskRT); renderer.setClearColor(0x000000, 1); renderer.clear(); renderer.render(scene, camera);
    renderer.setRenderTarget(null); camera.layers.set(0); scene.overrideMaterial = null;
    scene.background = bg; scene.fog = fog; scene.environment = env;
  }
  function draw(){
    if (CITY && (quality === 'capture' || frameNo % 3 === 0)) bakeCity();
    frameNo++;
    renderMask(); if (composer) composer.render(); else renderer.render(scene, camera);
  }
  let raf = 0, t0 = performance.now(), playing = quality !== 'capture', visible = true, loopMode = true;
  function loop(){
    raf = 0; if (!playing || !visible) return;
    let t = (performance.now()-t0)/1000;
    if (loopMode) { if (t > DUR + 1.5) { t0 = performance.now(); t = 0; } } else t = Math.min(t, DUR);
    setTime(t); draw();
    raf = requestAnimationFrame(loop);
  }
  if ('IntersectionObserver' in window) new IntersectionObserver(es => { visible = es[0].isIntersecting; if (visible && !raf && playing) raf = requestAnimationFrame(loop); }, { rootMargin:'80px' }).observe(stage);
  if (playing) raf = requestAnimationFrame(loop);

  const api = {
    get ready(){ return ready; }, DUR,
    seek(t){ setTime(t); draw(); },
    play(){ playing = true; t0 = performance.now(); if (!raf) raf = requestAnimationFrame(loop); },
    stop(){ playing = false; },
    set loop(v){ loopMode = v; },
    renderer, scene, camera, sunDir, get car(){ return car; },
    get sunVis(){ return sunVis; },
    get flareUV(){ return flarePass ? flarePass.uniforms.uSun.value.toArray() : null; },
    // debugging: look straight at the sun from the car
    lookAtSun(fov=40){ camera.position.set(0, 3.2, 0); camera.lookAt(sunDir.clone().multiplyScalar(100).add(camera.position)); camera.fov = fov; camera.updateProjectionMatrix(); renderMask(); composer.render(); },
  };
  return api;
}
