// Detail Dungeon coverage: the LC300 in the bay, white, and for each package the
// camera flies panel to panel while the film lays itself onto what that package
// covers. Red = film. Real time, timeline driven, same car as everywhere else.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { normalise, groundShadow, classify } from './carkit.js';

const DRACO_PATH = new URL('./draco/', import.meta.url).href;
const sm = (a, b, t) => { const x = Math.min(1, Math.max(0, (t - a) / (b - a))); return x * x * (3 - 2 * x); };
const ease = x => 1 - Math.pow(1 - x, 3);

// panel ids -> node-name test (paint mesh = material 1350010001; mirrors = their chrome caps)
const PANEL_RX = {
  bumperF: /SM_Bumper_F/, bumperB: /SM_Bumper_B/, hood: /SK_Hood/, fenderF: /SM_Fender_F/, mirrors: /SM_SideMirror/,
  doorFL: /SK_Door_FL/, doorFR: /SK_Door_FR/, doorBL: /SK_Door_BL/, doorBR: /SK_Door_BR/,
  fenderB: /SM_Fender_B/, trunk: /SK_Trunk/, roof: /SM_Roof/, body: /SM_Body/, steps: /SM_SideSkirts/,
};

// camera keys are in car space: nose at -z, viewer side +x, floor y=0; scaled by the car's length
// dir = reveal direction in world space, a/b = start/end along that direction (fractions of the panel bbox)
export const PACKAGES = {
  basic: {
    label: 'Basic',
    shots: [
      { label: 'Front bumper, top to lip', panels: ['bumperF'],           cam: [2.3, .95, -6.1],  tgt: [0, .7, -2.3], dir: [0, -1, 0] },
      { label: 'Bonnet',         panels: ['hood'],              cam: [1.6, 2.35, -4.3], tgt: [0, 1.15, -1.45], dir: [0, 0, 1] },
      { label: 'Front fenders',  panels: ['fenderF'],           cam: [3.4, 1.25, -3.2], tgt: [.9, .85, -1.55], dir: [0, 0, 1] },
      { label: 'Side mirrors',   panels: ['mirrors'],           cam: [2.9, 1.55, -1.25], tgt: [1.05, 1.3, -.75], dir: [0, 0, 1] },
      { label: 'Side steps and sills', panels: ['steps'], cam: [5.6, 1.15, .5], tgt: [.95, .6, .2], dir: [0, 0, 1] },
      { label: 'Rear bumper, top to lip', panels: ['bumperB'],           cam: [-2.5, 1.1, 6.1],  tgt: [0, .8, 2.3], dir: [0, -1, 0] },
      { label: 'Basic. The panels that take the stone chips.', panels: [], cam: [4.9, 1.55, -4.9], tgt: [0, .85, -.15], orbit: true },
    ],
  },
  gold: {
    label: 'Gold',
    shots: [
      { label: 'Front bumper, top to lip', panels: ['bumperF'],           cam: [2.3, .95, -6.1],  tgt: [0, .7, -2.3], dir: [0, -1, 0] },
      { label: 'Bonnet',         panels: ['hood'],              cam: [1.6, 2.35, -4.3], tgt: [0, 1.15, -1.45], dir: [0, 0, 1] },
      { label: 'Front fenders and mirrors', panels: ['fenderF', 'mirrors'], cam: [3.4, 1.3, -3.0], tgt: [.9, .95, -1.3], dir: [0, 0, 1] },
      { label: 'Four doors',     panels: ['doorFR', 'doorBR', 'doorFL', 'doorBL'], cam: [5.2, 1.25, .3], tgt: [1.0, .95, .25], dir: [0, 0, 1] },
      { label: 'Side steps and sills', panels: ['steps'], cam: [5.6, 1.15, .5], tgt: [.95, .6, .2], dir: [0, 0, 1] },
      { label: 'Rear quarters and boot lid', panels: ['fenderB', 'body', 'trunk'], cam: [3.6, 1.6, 4.6], tgt: [.5, 1.0, 2.0], dir: [0, 0, 1] },
      { label: 'Rear bumper, top to lip', panels: ['bumperB'],           cam: [-2.5, 1.1, 6.1],  tgt: [0, .8, 2.3], dir: [0, -1, 0] },
      { label: 'Gold. Every painted panel except the roof.', panels: [], cam: [4.9, 1.55, -4.9], tgt: [0, .85, -.15], orbit: true },
    ],
  },
  plat: {
    label: 'Platinum',
    shots: [
      { label: 'Front bumper, top to lip', panels: ['bumperF'],           cam: [2.3, .95, -6.1],  tgt: [0, .7, -2.3], dir: [0, -1, 0] },
      { label: 'Bonnet',         panels: ['hood'],              cam: [1.6, 2.35, -4.3], tgt: [0, 1.15, -1.45], dir: [0, 0, 1] },
      { label: 'Front fenders and mirrors', panels: ['fenderF', 'mirrors'], cam: [3.4, 1.3, -3.0], tgt: [.9, .95, -1.3], dir: [0, 0, 1] },
      { label: 'Four doors',     panels: ['doorFR', 'doorBR', 'doorFL', 'doorBL'], cam: [5.2, 1.25, .3], tgt: [1.0, .95, .25], dir: [0, 0, 1] },
      { label: 'Side steps and sills', panels: ['steps'], cam: [5.6, 1.15, .5], tgt: [.95, .6, .2], dir: [0, 0, 1] },
      { label: 'Rear quarters and boot lid', panels: ['fenderB', 'body', 'trunk'], cam: [3.6, 1.6, 4.6], tgt: [.5, 1.0, 2.0], dir: [0, 0, 1] },
      { label: 'Rear bumper, top to lip', panels: ['bumperB'],           cam: [-2.5, 1.1, 6.1],  tgt: [0, .8, 2.3], dir: [0, -1, 0] },
      { label: 'Full roof',      panels: ['roof'],              cam: [3.2, 4.4, -1.0], tgt: [0, 1.6, .3], dir: [0, 0, 1] },
      { label: 'Platinum. The whole car.', panels: [], cam: [4.9, 1.55, -4.9], tgt: [0, .85, -.15], orbit: true },
    ],
  },
};
const MOVE = 1.15, LAY = .95, HOLD = .4;              // seconds per shot phase
export const shotLen = s => s.orbit ? Infinity : MOVE + LAY + HOLD;

function bayEnvironment(){
  const s = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.BoxGeometry(16, 7, 24), new THREE.MeshStandardMaterial({ color: 0x1b1c21, side: THREE.BackSide, roughness: 1 }));
  room.position.y = 3; s.add(room);
  const bar = (w, h, d, lum, x, y, z, rz = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ color: new THREE.Color().setScalar(lum) })); m.position.set(x, y, z); m.rotation.z = rz; s.add(m); };
  for (let i = -2; i <= 2; i++) bar(1.0, .05, 16, 11, i * 2.6, 6.6, 0);
  bar(.05, 1.5, 18, 5, -7.9, 2.2, 0); bar(.05, 1.5, 18, 5, 7.9, 2.2, 0);
  bar(14, 1.2, .05, 3, 0, 1.6, -11.9); bar(14, 1.2, .05, 3, 0, 1.6, 11.9);
  s.add(new THREE.AmbientLight(0xffffff, 1.4));
  return s;
}

export function initCoverage({ canvas, stage, model = '3d/lc300.glb', noseFlip = true, onReady, onFail, onShot, pixelRatio, quality = 'live', tint = 0xb5172a }){
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: quality === 'capture' }); }
  catch (e) { onFail && onFail(e); return null; }
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.25;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(bayEnvironment(), .04).texture;
  const camera = new THREE.PerspectiveCamera(34, 1, .05, 80);
  const key = new THREE.DirectionalLight(0xffffff, .9); key.position.set(4, 7, -5); scene.add(key);
  scene.add(new THREE.HemisphereLight(0x8a8f9c, 0x16171b, .55));

  // ---- materials ---------------------------------------------------------------
  const TINT = new THREE.Color(tint);
  const paintBase = new THREE.MeshPhysicalMaterial({ color: 0xe9ebee, metalness: .05, roughness: .09, clearcoat: 1, clearcoatRoughness: .05, envMapIntensity: 1.1 });
  const chromeBase = new THREE.MeshPhysicalMaterial({ color: 0xdfe3e8, metalness: 1, roughness: .12, envMapIntensity: 1.2 });
  const KIT = {
    glass: new THREE.MeshPhysicalMaterial({ color: 0x0b1014, metalness: 0, roughness: .03, transparent: true, opacity: .78, envMapIntensity: 1.2 }),
    lightglass: new THREE.MeshPhysicalMaterial({ color: 0xdfe6ea, metalness: 0, roughness: .05, transparent: true, opacity: .45 }),
    rims: new THREE.MeshPhysicalMaterial({ color: 0x2a2c31, metalness: .85, roughness: .34 }),
    tyre: new THREE.MeshStandardMaterial({ color: 0x0c0d0f, roughness: .95 }),
    disc: new THREE.MeshStandardMaterial({ color: 0x8c9096, metalness: .9, roughness: .4 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x111215, roughness: .8 }),
    trim: new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: .7 }),
    badge: chromeBase,
    mirror: new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 1, roughness: 0 }),
  };
  // film-able materials get per-mesh uniforms
  function filmable(base){
    const m = base.clone();
    const U = { uFilm: { value: 0 }, uTint: { value: TINT }, uDir: { value: new THREE.Vector3(0, 0, 1) }, uA: { value: 0 }, uB: { value: 1 }, uYmax: { value: 1e9 } };
    m.userData.U = U;
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWpF;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWpF = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWpF;\nuniform float uFilm, uA, uB, uYmax;\nuniform vec3 uTint, uDir;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          float fpos = dot(vWpF, uDir);
          float fedge = mix(uA - 0.05, uB + 0.05, uFilm);
          float fon = 1.0 - smoothstep(fedge - 0.02, fedge + 0.02, fpos);
          fon *= step(0.001, uFilm) * step(vWpF.y, uYmax);
          diffuseColor.rgb = mix(diffuseColor.rgb, uTint, fon * 0.93);
          float fseam = exp(-pow((fpos - fedge) / 0.05, 2.0)) * step(0.001, uFilm) * step(uFilm, 0.999) * step(vWpF.y, uYmax);
          diffuseColor.rgb += vec3(1.0) * fseam * 0.9;`)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.04, 0.0);');
    };
    m.customProgramCacheKey = () => 'film';
    return m;
  }

  // ---- load -------------------------------------------------------------------
  const draco = new DRACOLoader(); draco.setDecoderPath(DRACO_PATH); draco.setDecoderConfig({ type: 'wasm' });
  const loader = new GLTFLoader(); loader.setDRACOLoader(draco);
  let car = null, DIM = null, ready = false;
  const panels = {};                                  // id -> [{mesh, U, a, b}]
  async function fetchModel(url){
    let r = await fetch(url).catch(() => null);
    if (r && r.ok) { const buf = await r.arrayBuffer(); if (buf.byteLength > 1000 && new DataView(buf).getUint32(0, true) === 0x46546C67) return buf; }
    r = await fetch(url.replace(/\.glb$/, '') + '.b64.txt'); if (!r.ok) throw new Error('model not found');
    const bin = atob((await r.text()).trim()), buf = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i); return buf.buffer;
  }
  fetchModel(model).then(buf => loader.parse(buf, '', g => {
    car = g.scene;
    DIM = normalise(car, { length: 4.95, noseFlip });
    car.updateMatrixWorld(true);
    car.traverse(o => {
      if (!o.isMesh) return;
      o.frustumCulled = false;
      const kind = classify(o);
      // which panel group is this mesh in? walk up the names
      let pid = null;
      for (let p = o; p && !pid; p = p.parent) for (const id in PANEL_RX) if (PANEL_RX[id].test(p.name || '')) { pid = id; break; }
      const isPaint = kind === 'body';
      const isMirrorCap = pid === 'mirrors' && kind === 'chrome';
      const isStepMetal = pid === 'steps' && kind === 'chrome';                 // the running board itself
      const isBumperLip = (pid === 'bumperF' || pid === 'bumperB') && kind === 'chrome';   // lower valance, below the lamps
      if (isPaint || isMirrorCap || isStepMetal || isBumperLip) {
        const m = filmable(isPaint ? paintBase : chromeBase); o.material = m;
        if (isBumperLip) m.userData.U.uYmax.value = 0.6 * (DIM.height / 1.95);
        if (pid) (panels[pid] = panels[pid] || []).push({ mesh: o, U: m.userData.U });
      } else if (kind === 'chrome') o.material = chromeBase;
      else if (KIT[kind]) o.material = KIT[kind];
    });
    // reveal ranges per panel from world bounds along each shot's direction (set when a shot starts)
    scene.add(car);
    scene.add(groundShadow(DIM.size, .9));
    ready = true; resize();
    setPackage(current.id);
    onReady && onReady(api);
  }, e => onFail && onFail(e))).catch(e => onFail && onFail(e));

  function panelRange(ids, dir){
    const d = new THREE.Vector3(...dir); let a = 1e9, b = -1e9;
    const box = new THREE.Box3(); const corner = new THREE.Vector3();
    for (const id of ids) for (const p of (panels[id] || [])) {
      box.setFromObject(p.mesh);
      for (let i = 0; i < 8; i++) { corner.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z); const v = corner.dot(d); a = Math.min(a, v); b = Math.max(b, v); }
    }
    return [a, b];
  }

  // ---- timeline -------------------------------------------------------------------
  const current = { id: 'basic', shots: PACKAGES.basic.shots, t: 0, shot: -1, total: 0 };
  const camPos = new THREE.Vector3(), camTgt = new THREE.Vector3(), fromPos = new THREE.Vector3(), fromTgt = new THREE.Vector3();
  const _p = new THREE.Vector3(), _t = new THREE.Vector3();
  let lastShotIdx = -1, lastLabel = '';

  function setPackage(id){
    cancelAnimationFrame(focusRaf); focusRaf = 0;
    for (const pid in panels) for (const p of panels[pid]) p.U.uTint.value = TINT;
    current.id = id; current.shots = PACKAGES[id].shots; current.t = 0; lastShotIdx = -1; lastLabel = '';
    let tot = 0; for (const s of current.shots) if (!s.orbit) tot += shotLen(s); current.total = tot;
    for (const pid in panels) for (const p of panels[pid]) p.U.uFilm.value = 0;
    if (ready) { const s0 = current.shots[0]; camPos.set(...s0.cam); camTgt.set(...s0.tgt); fromPos.copy(camPos); fromTgt.copy(camTgt); seek(0); }
  }
  function scaled(v){ const f = DIM ? DIM.length / 4.95 : 1; return _p.set(v[0] * f, v[1] * f, v[2] * f); }

  function seek(t){
    if (!ready) return;
    current.t = t;
    const shots = current.shots;
    // locate the shot
    let acc = 0, idx = shots.length - 1, local = 0;
    for (let i = 0; i < shots.length; i++) { const L = shotLen(shots[i]); if (t < acc + L) { idx = i; local = t - acc; break; } acc += L; }
    const s = shots[idx];
    if (idx !== lastShotIdx) {
      // the move starts where the previous shot ended (deterministic, so seek() can jump)
      const prev = shots[idx - 1] || s;
      fromPos.copy(scaled(prev.cam)); fromTgt.copy(scaled(prev.tgt));
      // every earlier shot is fully filmed; give each its own reveal range so a skipped shot (slow frames) is never left half done
      for (let i = 0; i < idx; i++) { const si = shots[i]; if (!si.panels.length) continue; const dir = si.dir || [0, 0, 1]; const [a0, b0] = panelRange(si.panels, dir);
        for (const pid of si.panels) for (const p of (panels[pid] || [])) { p.U.uDir.value.set(...dir); p.U.uA.value = a0; p.U.uB.value = b0; p.U.uFilm.value = 1; } }
      for (let i = idx; i < shots.length; i++) for (const pid of shots[i].panels) for (const p of (panels[pid] || [])) p.U.uFilm.value = 0;
      if (s.panels.length) {
        const [a, b] = panelRange(s.panels, s.dir || [0, 0, 1]);
        for (const pid of s.panels) for (const p of (panels[pid] || [])) { p.U.uDir.value.set(...(s.dir || [0, 0, 1])); p.U.uA.value = a; p.U.uB.value = b; }
      }
      lastShotIdx = idx;
    }
    const toPos = scaled(s.cam).clone(), toTgt = scaled(s.tgt).clone();
    if (s.orbit) {
      const k = sm(0, MOVE, local);
      const ang = Math.max(0, local - MOVE) * .11;
      const r = Math.hypot(toPos.x, toPos.z), a0 = Math.atan2(toPos.x, toPos.z);
      const orbitPos = new THREE.Vector3(Math.sin(a0 + ang) * r, toPos.y, Math.cos(a0 + ang) * r);
      camera.position.lerpVectors(fromPos, orbitPos, k); camTgt.lerpVectors(fromTgt, toTgt, k);
    } else {
      const k = ease(Math.min(1, local / MOVE));
      camera.position.lerpVectors(fromPos, toPos, k); camTgt.lerpVectors(fromTgt, toTgt, k);
      const lay = Math.min(1, Math.max(0, (local - MOVE * .8) / LAY));
      for (const pid of s.panels) for (const p of (panels[pid] || [])) p.U.uFilm.value = lay;
    }
    camera.lookAt(camTgt);
    const label = s.label;
    if (label !== lastLabel) { lastLabel = label; onShot && onShot({ label, index: idx, count: shots.length, final: !!s.orbit, pkg: current.id }); }
    renderer.render(scene, camera);
  }

  // ---- focus: a tapped panel, everything in the package filmed, that panel pulsing ---
  const HI = new THREE.Color(0xff2433), HI_BASE = new THREE.Color(0xff2433), WHITE = new THREE.Color(0xffffff), SOFT = new THREE.Color(0xd9a3a8);
  let focusRaf = 0;
  function focus(ids, label){
    if (!ready || !ids || !ids.length) return false;
    const shot = current.shots.find(s => s.panels.some(p => ids.includes(p))) || PACKAGES.plat.shots.find(s => s.panels.some(p => ids.includes(p)));
    if (!shot) return false;
    playing = false; cancelAnimationFrame(raf); raf = 0; cancelAnimationFrame(focusRaf);
    for (const s of current.shots) if (s.panels.length) {
      const dir = s.dir || [0, 0, 1]; const [a, b] = panelRange(s.panels, dir);
      for (const pid of s.panels) for (const p of (panels[pid] || [])) { p.U.uDir.value.set(...dir); p.U.uA.value = a; p.U.uB.value = b; p.U.uFilm.value = 1; }
    }
    if (!current.shots.includes(shot)) { const dir = shot.dir || [0, 0, 1]; const [a, b] = panelRange(ids, dir); for (const pid of ids) for (const p of (panels[pid] || [])) { p.U.uDir.value.set(...dir); p.U.uA.value = a; p.U.uB.value = b; p.U.uFilm.value = 1; } }
    for (const pid in panels) for (const p of panels[pid]) p.U.uTint.value = ids.includes(pid) ? HI : SOFT;
    const fp = camera.position.clone(), ft = camTgt.clone(), tp = scaled(shot.cam).clone(), tt = scaled(shot.tgt).clone();
    const start = performance.now(); lastShotIdx = -1;
    onShot && onShot({ label: label || shot.label, index: current.shots.indexOf(shot), count: current.shots.length, final: true, pkg: current.id, focus: true });
    const step = () => {
      const el = (performance.now() - start) / 1000, e = ease(Math.min(1, el / 1.0));
      camera.position.lerpVectors(fp, tp, e); camTgt.lerpVectors(ft, tt, e); camera.lookAt(camTgt);
      HI.copy(HI_BASE).lerp(WHITE, el < 3.2 ? .28 * (.5 + .5 * Math.sin(el * 7)) : 0);
      renderer.render(scene, camera);
      focusRaf = (el < 3.3 && !playing) ? requestAnimationFrame(step) : 0;
    };
    focusRaf = requestAnimationFrame(step);
    return true;
  }

  // ---- loop ----------------------------------------------------------------------
  let raf = 0, t0 = performance.now(), playing = quality !== 'capture', visible = true;
  function tick(){ raf = 0; if (!playing || !visible) return; seek((performance.now() - t0) / 1000); raf = requestAnimationFrame(tick); }
  function resize(){
    const r = stage.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    renderer.setPixelRatio(pixelRatio || Math.min(devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.fov = Math.min(52, Math.max(34, 34 * Math.pow(1.6 / camera.aspect, .5))); camera.updateProjectionMatrix();
    if (ready && !playing) seek(current.t);
  }
  addEventListener('resize', resize);
  if (quality !== 'capture' && 'IntersectionObserver' in window) {
    new IntersectionObserver(es => { visible = es[0].isIntersecting; if (visible && playing && !raf) { t0 = performance.now() - current.t * 1000; raf = requestAnimationFrame(tick); } }, { threshold: .05 }).observe(stage);
  }
  if (playing) raf = requestAnimationFrame(tick);

  const api = {
    seek, current, PACKAGES, focus,
    play(id){ if (id && id !== current.id) setPackage(id); else if (id) setPackage(id); t0 = performance.now(); playing = true; if (!raf) raf = requestAnimationFrame(tick); },
    stop(){ playing = false; },
    get ready(){ return ready; }, camera, get panels(){ return panels; },
  };
  return api;
}
