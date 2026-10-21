// Detail Dungeon 3D configurator
// One car, one light rig. Colour and finish are material parameters, so every
// combination is consistent from every angle. Nothing is painted onto a picture.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { applyKit, normalise, groundShadow, inLampGroup, classify } from './carkit.js';

const DRACO_PATH = new URL('./draco/', import.meta.url).href;   // same origin: CSP connect-src allows it

// ---- finishes: physically based, same numbers a real configurator uses ---------
const _UNUSED_FINISH = [
  { id:'gloss', name:'Gloss', pbr:{ roughness:.06, metalness:0,  clearcoat:1,  clearcoatRoughness:.03 },
    sw:[['Frozen White','#F1F3F5'],['Nardo Grey','#B2B6BA'],['Storm Grey','#59616A'],['Midnight Black','#101114'],
        ['British Racing','#166B45'],['Signal Green','#1E8A4C'],['Riviera Blue','#1A63DC'],['Miami Blue','#07AFCC'],
        ['Guards Red','#D6121A'],['Blood Orange','#E8500C'],['Liquid Bronze','#BA8130',1],['Amethyst','#7340C4',1]] },
  { id:'satin', name:'Satin', pbr:{ roughness:.38, metalness:0,  clearcoat:.35, clearcoatRoughness:.45 },
    sw:[['Satin Silver','#C4C8CC'],['Satin Graphite','#474D54'],['Satin Black','#1B1D20'],['Satin Pine','#2D7049'],
        ['Satin Navy','#24498C'],['Satin Olive','#7C7B52'],['Satin Burgundy','#941D28'],['Satin Bronze','#A67E41',1]] },
  { id:'matte', name:'Matte', pbr:{ roughness:.78, metalness:0,  clearcoat:0,  clearcoatRoughness:1 },
    sw:[['Matte Grey','#8F949B'],['Matte Charcoal','#393D42'],['Matte Black','#17181B'],['Matte Military','#5E6845'],
        ['Matte Sand','#C3AA7E'],['Matte Blood','#A4151F']] },
];
// a third element of 1 on a swatch marks it metallic: flake-free, but the base turns metal
const METAL = { metalness:.65, roughness:.22 };

// ---- the bay: a dark room with long LED strips, baked to an environment map ----
function bayEnvironment(){
  const s = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.BoxGeometry(14, 6.5, 14),
    new THREE.MeshStandardMaterial({ color:0x202126, side:THREE.BackSide, roughness:1, metalness:0 }));
  room.position.y = 3.2; s.add(room);
  const bar = (w,h,d, x,y,z, lum, ry=0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w,h,d),
      new THREE.MeshBasicMaterial({ color:new THREE.Color().setScalar(lum) }));
    m.position.set(x,y,z); m.rotation.y = ry; s.add(m);
  };
  bar(12, .04, 12,  0, 6.45, 0, 1.9);         // ceiling wash: lifts the whole car, black paint included
  bar(7, .05, .55,  0, 6.4, -1.6, 20);        // ceiling panels, front and back
  bar(7, .05, .55,  0, 6.4,  1.6, 20);
  bar(.08, 3.4, .32, -6.9, 2.5, -1.0, 14);    // tall LED strips on the side walls
  bar(.08, 3.4, .32,  6.9, 2.5,  1.0, 14);
  bar(.08, 3.4, .32, -6.9, 2.5,  3.2, 8);
  bar(.08, 3.4, .32,  6.9, 2.5, -3.2, 8);
  bar(5, 2.2, .05,  0, 2.2,  6.9, 4.4);       // soft fills so the nose never goes black
  bar(5, 2.2, .05,  0, 2.2, -6.9, 4.0);
  return s;
}

export function initConfigurator(opts){
  const { canvas, stage, onReady, onFail, onProgress } = opts;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:true, powerPreference:'high-performance' });
  } catch(e){ onFail && onFail(e); return null; }
  if (!renderer.getContext()) { onFail && onFail(new Error('no webgl')); return null; }

  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.36;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(renderer);
  const env = pm.fromScene(bayEnvironment(), 0.035).texture;
  scene.environment = env;
  pm.dispose();

  const camera = new THREE.PerspectiveCamera(30, 16/9, 0.1, 60);
  const TARGET = new THREE.Vector3(0, .42, 0);
  // framed for a 4.5 m low car; rescaled once the model's real size is known
  const BASE = { front:[ 4.3, 1.05, -4.5], side:[ 6.4, .95, 0.25], rear:[ 4.2, 1.15, 4.7] };
  const VIEWS = { front:[...BASE.front], side:[...BASE.side], rear:[...BASE.rear] };
  function frameFor(dim){
    const f = Math.max(1, Math.pow(dim.length/4.5, .9) * (0.70 + 0.14*(dim.height/1.25)));
    for (const k in BASE) VIEWS[k] = [BASE[k][0]*f, BASE[k][1]*f*0.92 + dim.height*0.12, BASE[k][2]*f];
    TARGET.set(0, dim.height*0.43, 0); controls.target.copy(TARGET);
    controls.minDistance = 4.4*f; controls.maxDistance = 9*f;
  }
  camera.position.set(...VIEWS.front);

  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(TARGET);
  controls.enablePan = false;
  controls.enableZoom = false;              // the wheel must scroll the page, not the car
  controls.enableDamping = true; controls.dampingFactor = .06;
  controls.minDistance = 4.4; controls.maxDistance = 9;
  controls.minPolarAngle = 1.0; controls.maxPolarAngle = 1.5;
  controls.autoRotate = true; controls.autoRotateSpeed = .55;
  controls.addEventListener('start', () => { controls.autoRotate = false; api.onSpin && api.onSpin(false); });

  // ---- materials ------------------------------------------------------------
  const body   = new THREE.MeshPhysicalMaterial({ color:0x166B45, metalness:0, roughness:.06, clearcoat:1, clearcoatRoughness:.03, envMapIntensity:1.25 });
  const trim   = new THREE.MeshStandardMaterial({ color:0x15161a, metalness:.2, roughness:.45 });
  const chrome = new THREE.MeshPhysicalMaterial({ color:0xf2f3f4, metalness:1,  roughness:.06 });
  const lampchrome = new THREE.MeshStandardMaterial({ color:0xf2f3f4, metalness:1,  roughness:.06 });   // inside the lights, never deleted
  // the bumper's chrome mesh runs through the headlight bezels; a chrome delete
  // leaves the lamps alone, so the black is masked out inside the lamp boxes
  const LAMP = { uBlack:{ value:0 }, uLampMin:{ value:Array.from({length:8}, () => new THREE.Vector3()) }, uLampMax:{ value:Array.from({length:8}, () => new THREE.Vector3()) }, uLampN:{ value:0 } };
  chrome.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, LAMP);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWpC;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWpC = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWpC;\nuniform float uBlack;\nuniform vec3 uLampMin[8];\nuniform vec3 uLampMax[8];\nuniform int uLampN;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float inLamp = 0.0;
        for (int i = 0; i < 8; i++) { if (i >= uLampN) break; if (all(greaterThan(vWpC, uLampMin[i])) && all(lessThan(vWpC, uLampMax[i]))) inLamp = 1.0; }
        float blk = uBlack * (1.0 - inLamp);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.043, 0.047, 0.055), blk);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.55, uBlack * (1.0 - inLamp));')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 0.04, uBlack * (1.0 - inLamp));')
      .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\nmaterial.specularColor *= mix(1.0, 0.3, blk); material.specularF90 = mix(material.specularF90, 0.35, blk);');
  };
  chrome.customProgramCacheKey = () => 'chrome-lampmask';
  const rims   = new THREE.MeshStandardMaterial({ color:0xc9ccd0, metalness:1,  roughness:.28 });
  const glass  = new THREE.MeshPhysicalMaterial({ color:0xb9c6d2, metalness:0, roughness:0, transparent:true, opacity:.34, envMapIntensity:1.2, depthWrite:false });
  const tyre   = new THREE.MeshStandardMaterial({ color:0x0c0c0e, metalness:0, roughness:.92 });
  const dark   = new THREE.MeshStandardMaterial({ color:0x0b0b0d, metalness:.1, roughness:.6 });
  const grills = new THREE.MeshStandardMaterial({ color:0x0a0a0b, metalness:.4, roughness:.5 });
  const disc   = new THREE.MeshStandardMaterial({ color:0x8d9094, metalness:.95, roughness:.42 });   // brake discs stay steel
  const badge  = new THREE.MeshStandardMaterial({ color:0xd9dbde, metalness:1, roughness:.18 });
  const mirror = new THREE.MeshStandardMaterial({ color:0xdfe3e8, metalness:1, roughness:.02 });
  const KIT = { body, glass, chrome, lampchrome, trim, rims, tyre, disc, dark, badge, mirror };

  const STOCK    = { chrome:{color:0xf2f3f4, metalness:1,  roughness:.06}, trim:{color:0x15161a, metalness:.2, roughness:.45},
                     rims:{color:0xc9ccd0, metalness:1, roughness:.28}, glass:{color:0xb9c6d2, opacity:.34}, badge:{color:0xd9dbde, metalness:1, roughness:.18} };
  // a chrome delete touches the brightwork, the glass and the wheels. Never the
  // lights, the badges or the calipers.
  const BLACKOUT = { chrome:{color:0x0b0c0e, metalness:.25, roughness:.08}, trim:{color:0x08090b, metalness:.2, roughness:.12},
                     rims:{color:0x2a2c31, metalness:.85, roughness:.34}, glass:{color:0x05070a, opacity:.86}, badge:{color:0x0b0c0e, metalness:.3, roughness:.15} };

  // ---- the car ----------------------------------------------------------------
  const draco = new DRACOLoader(); draco.setDecoderPath(DRACO_PATH);
  const loader = new GLTFLoader(); loader.setDRACOLoader(draco);
  let car = null, ready = false;

  // Fetch the binary ourselves: some hosts won't serve .glb, so a base64 .txt
  // twin sits next to it and we parse whichever one arrives.
  async function fetchModel(url){
    let r = await fetch(url).catch(() => null);
    if (r && r.ok && /octet|gltf|wasm/.test(r.headers.get('content-type') || 'octet')) {
      const buf = await r.arrayBuffer();
      if (buf.byteLength > 1000 && new DataView(buf).getUint32(0, true) === 0x46546C67) return buf;   // 'glTF'
    }
    r = await fetch(url.replace(/\.glb$/, '') + '.b64.txt');
    if (!r.ok) throw new Error('model not found');
    const b64 = (await r.text()).trim(), bin = atob(b64), buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return buf.buffer;
  }
  fetchModel(opts.model).then(buf => loader.parse(buf, '', g => {
    car = g.scene;
    const dim = normalise(car, { length: opts.length || 4.95, noseFlip: !!opts.noseFlip });
    applyKit(car, KIT);
    scene.add(car);
    scene.add(groundShadow(dim.size, .92));
    // lamp boxes, split left/right so the grille between the headlights still goes black
    (function lampBoxes(){
      // vertices of the lamp groups, bucketed by end (front/back) and side (left/right),
      // then each bucket split at its biggest vertical gap so fog lamps get their own box
      const buckets = { FL:[], FR:[], BL:[], BR:[] };
      const v = new THREE.Vector3();
      car.traverse(o => {
        if (!o.isMesh || !inLampGroup(o)) return;
        if (!/Glass/.test((o.material && o.material.name) || '')) return;      // the lens footprint only
        let isB = false; for (let p = o; p; p = p.parent) if (/SM_Light_B/.test(p.name || '')) isB = true;
        const pa = o.geometry.attributes.position;
        for (let i = 0; i < pa.count; i += 2) { v.fromBufferAttribute(pa, i).applyMatrix4(o.matrixWorld); buckets[(isB ? 'B' : 'F') + (v.x < 0 ? 'L' : 'R')].push(v.x, v.y, v.z); }
      });
      const boxes = [];
      for (const k in buckets) {
        const a = buckets[k]; if (!a.length) continue;
        const ys = []; for (let i = 1; i < a.length; i += 3) ys.push(a[i]); ys.sort((p, q) => p - q);
        let gapAt = -1, gap = 0; for (let i = 1; i < ys.length; i++) { const g = ys[i] - ys[i-1]; if (g > gap) { gap = g; gapAt = ys[i-1] + g/2; } }
        const split = gap > .06 ? gapAt : -Infinity;
        const lo = new THREE.Box3(), hi = new THREE.Box3();
        for (let i = 0; i < a.length; i += 3) { v.set(a[i], a[i+1], a[i+2]); (v.y < split ? lo : hi).expandByPoint(v); }
        for (const b of [lo, hi]) if (!b.isEmpty()) boxes.push(b.expandByScalar(-.012));
      }
      boxes.slice(0, 8).forEach((b, i) => { LAMP.uLampMin.value[i].copy(b.min); LAMP.uLampMax.value[i].copy(b.max); });
      LAMP.uLampN.value = Math.min(8, boxes.length);
    })();
    frameFor(dim); camera.position.set(...VIEWS.front); controls.update();
    ready = true;
    resize(); draw();
    onReady && onReady(api);
  }, err => { onFail && onFail(err); })).catch(err => { onFail && onFail(err); });

  // ---- render loop: only while visible --------------------------------------
  let visible = true, raf = 0;
  function resize(){
    const r = stage.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    renderer.setSize(w, h, false);
    camera.aspect = w/h;
    camera.fov = Math.min(46, Math.max(30, 30 * (1.55 / camera.aspect)));   // narrow stage, wider lens
    camera.updateProjectionMatrix();
  }
  function draw(){ renderer.render(scene, camera); }
  function loop(){
    raf = 0;
    if (!visible) return;
    controls.update();
    draw();
    raf = requestAnimationFrame(loop);
  }
  new ResizeObserver(() => { resize(); draw(); }).observe(stage);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(es => {
      visible = es[0].isIntersecting;
      if (visible && !raf) raf = requestAnimationFrame(loop);
    }, { rootMargin:'120px' }).observe(stage);
  }
  raf = requestAnimationFrame(loop);

  // ---- swatch thumbnails: a sphere in the same light, per colour ---------------
  const thumbRT = { scene:new THREE.Scene(), cam:new THREE.PerspectiveCamera(26, 1, .1, 10) };
  thumbRT.scene.environment = env;
  const tSphere = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), new THREE.MeshPhysicalMaterial());
  thumbRT.scene.add(tSphere); thumbRT.cam.position.set(0, .3, 3.9); thumbRT.cam.lookAt(0, 0, 0);
  const thumbTarget = new THREE.WebGLRenderTarget(96, 96, { samples:4 });
  function thumb(hex, fin, metal){
    const m = tSphere.material;
    m.color.set(hex); Object.assign(m, fin.pbr); if (metal) Object.assign(m, METAL);
    m.needsUpdate = true;
    renderer.setRenderTarget(thumbTarget); renderer.setClearColor(0x0e0e13, 1);
    const ex = renderer.toneMappingExposure; renderer.toneMappingExposure = 1.55;
    renderer.render(thumbRT.scene, thumbRT.cam);
    renderer.toneMappingExposure = ex;
    const px = new Uint8Array(96*96*4);
    renderer.readRenderTargetPixels(thumbTarget, 0, 0, 96, 96, px);
    renderer.setRenderTarget(null); renderer.setClearColor(0x000000, 0);
    const c = document.createElement('canvas'); c.width = c.height = 96;
    const id = c.getContext('2d').createImageData(96, 96);
    for (let y=0; y<96; y++) id.data.set(px.subarray((95-y)*384, (96-y)*384), y*384);   // flip
    c.getContext('2d').putImageData(id, 0, 0);
    return c.toDataURL('image/png');
  }

  // ---- public api --------------------------------------------------------------
  const api = {
    setPaint(hex, fin, metal){
      body.color.set(hex);
      Object.assign(body, fin.pbr);
      if (metal) Object.assign(body, METAL);
      body.needsUpdate = true;
      draw();
    },
    setBlackout(on){
      const p = on ? BLACKOUT : STOCK;
      LAMP.uBlack.value = on ? 1 : 0;
      trim.color.set(p.trim.color);     trim.metalness = p.trim.metalness;     trim.roughness = p.trim.roughness;
      rims.color.set(p.rims.color);     rims.metalness = p.rims.metalness;     rims.roughness = p.rims.roughness;
      glass.color.set(p.glass.color);   glass.opacity = p.glass.opacity;
      badge.color.set(p.badge.color);   badge.metalness = p.badge.metalness; badge.roughness = p.badge.roughness;
      draw();
    },
    setTint(on){ const p = on ? BLACKOUT : STOCK; glass.color.set(p.glass.color); glass.opacity = p.glass.opacity; draw(); },
    view(name, instant){
      const to = new THREE.Vector3(...VIEWS[name]);
      controls.autoRotate = false; api.onSpin && api.onSpin(false);
      if (instant) { camera.position.copy(to); controls.update(); draw(); return; }
      const from = camera.position.clone(); const t0 = performance.now();
      (function step(){
        const t = Math.min(1, (performance.now()-t0)/700), e = 1-Math.pow(1-t, 3);
        camera.position.lerpVectors(from, to, e); controls.update(); draw();
        if (t < 1) requestAnimationFrame(step);
      })();
    },
    spin(on){ controls.autoRotate = on; if (on && !raf) raf = requestAnimationFrame(loop); },
    get spinning(){ return controls.autoRotate; },
    thumb, draw, renderer, scene, camera, controls,
    get ready(){ return ready; },
    onSpin:null,
  };
  return api;
}
