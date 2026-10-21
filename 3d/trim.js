// Detail Dungeon interior trim PPF: the SLK cabin, a clear film sheet that hovers
// over the centre-console trim and lowers onto it. Real time, scroll aware.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const DRACO_PATH = new URL('./draco/', import.meta.url).href;
export const DUR = 9;                                  // seconds per loop

// timeline (seconds)
const T = { fadeIn:[0.0,0.9], lower:[1.6,3.6], sheen:[3.7,4.7], hold:[4.7,7.6], fadeOut:[7.8,8.6] };
const sm = (a,b,t) => { const x = Math.min(1, Math.max(0, (t-a)/(b-a))); return x*x*(3-2*x); };
const easeOutBack = x => { const c = 1.2; return 1 + (c+1)*Math.pow(x-1,3) + c*Math.pow(x-1,2); };

// A soft studio: grey room, one long overhead softbox along the car axis and two
// dimmer side panels, so the clear film carries a readable highlight streak.
function studioEnv(){
  const s = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.BoxGeometry(8, 5, 10), new THREE.MeshStandardMaterial({ color: 0x3a3b40, side: THREE.BackSide, roughness: 1 }));
  room.position.y = 2; s.add(room);
  const bar = (w, h, d, lum, x, y, z, ry = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ color: new THREE.Color().setScalar(lum) })); m.position.set(x, y, z); m.rotation.y = ry; s.add(m); };
  bar(.9, .05, 5.5, 14, -0.2, 3.4, 0);          // main softbox, slightly to the passenger side
  bar(.35, .05, 5.5, 6, 1.1, 3.2, 0);           // second, dimmer strip
  bar(.05, 1.2, 4, 2.2, -3.9, 1.6, 0);          // side panels
  bar(.05, 1.2, 4, 1.6, 3.9, 1.6, 0);
  bar(3, 1.0, .05, 1.2, 0, 1.4, 4.9);           // front wall glow (through the windscreen)
  s.add(new THREE.AmbientLight(0xffffff, 1.2));
  return s;
}

export function initTrim({ canvas, stage, model = '3d/slk-cabin.glb', onReady, onFail, onFrame, pixelRatio, quality = 'live', interactive = true }){
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:true, powerPreference:'high-performance', preserveDrawingBuffer: quality==='capture' }); }
  catch (e) { onFail && onFail(e); return null; }
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.18;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(studioEnv(), .03).texture;
  scene.environmentIntensity = 1.0;

  const camera = new THREE.PerspectiveCamera(36, 16/9, .02, 30);
  // passenger side, looking down and across at the console
  const CAM = new THREE.Vector3(-0.5, 1.12, -0.62), TGT = new THREE.Vector3(0.02, 0.50, -0.05);
  camera.position.copy(CAM); camera.lookAt(TGT);

  const key = new THREE.DirectionalLight(0xffffff, 1.4); key.position.set(-0.6, 2.2, 0.4); scene.add(key);
  const fill = new THREE.DirectionalLight(0xdfe6ff, .5); fill.position.set(1.2, 1.4, -1.2); scene.add(fill);
  scene.add(new THREE.AmbientLight(0xffffff, .12));

  let controls = null;
  if (interactive) {
    controls = new OrbitControls(camera, canvas);
    controls.target.copy(TGT); controls.enableZoom = false; controls.enablePan = false;
    controls.enableDamping = true; controls.dampingFactor = .08;
    controls.minPolarAngle = .45; controls.maxPolarAngle = 1.15;
    controls.minAzimuthAngle = -2.95; controls.maxAzimuthAngle = -1.45;
    controls.rotateSpeed = .5; controls.update();
  }

  // ---- film sheet (built once the trim mesh is known) ---------------------------
  const filmMat = new THREE.MeshPhysicalMaterial({
    color: 0xe6eefc, metalness: 0, roughness: .04, transmission: 0, opacity: .24, transparent: true,
    clearcoat: 1, clearcoatRoughness: .03, ior: 1.5, reflectivity: 1, envMapIntensity: 2.2, specularIntensity: 1.2,
    side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  // sheen sweep + edge glow via shader injection
  const U = { uSheen: { value: -2 }, uOn: { value: 0 } };
  filmMat.onBeforeCompile = sh => {
    sh.uniforms.uSheen = U.uSheen; sh.uniforms.uOn = U.uOn;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;\nvarying vec2 vUvF;\nattribute vec2 uvF;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWp = (modelMatrix * vec4(transformed,1.0)).xyz;\nvUvF = uvF;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;\nvarying vec2 vUvF;\nuniform float uSheen;\nuniform float uOn;')
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
        float d = (vUvF.y + vUvF.x*0.35) - uSheen;
        float sweep = exp(-d*d/0.005) + 0.35*exp(-d*d/0.03);
        gl_FragColor.rgb += vec3(1.0,1.0,1.0) * sweep * 1.1;
        gl_FragColor.a = min(1.0, gl_FragColor.a + sweep * 0.75);
        // edge: brighter rim so the sheet reads against dark trim
        float ex = min(vUvF.x, 1.0-vUvF.x), ey = min(vUvF.y, 1.0-vUvF.y);
        float edge = 1.0 - smoothstep(0.0, 0.03, min(ex, ey));
        gl_FragColor.rgb += vec3(.9,.95,1.0) * edge * 0.45 * (1.0-uOn*0.5);
        gl_FragColor.a = min(1.0, gl_FragColor.a + edge * 0.35);`);
  };
  const film = new THREE.Group(); scene.add(film);
  let sheet = null, outline = null, flatY = 0, surf = null, N = 0;
  let anchors = [];            // world-space points for the HTML callouts
  const OFF_HOVER = 0.13;

  function buildSheet(trim){
    // take the trim's own upward-facing triangles: exact silhouette, holes where the lever goes through
    const g0 = trim.geometry, pa = g0.attributes.position, idx = g0.index;
    const nt = idx ? idx.count/3 : pa.count/3;
    const m = trim.matrixWorld;
    const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), nrm = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
    const tri = [];
    let ymax = -1e9, bx0=1e9, bx1=-1e9, bz0=1e9, bz1=-1e9;
    for (let t=0;t<nt;t++){
      const i0 = idx ? idx.getX(t*3) : t*3, i1 = idx ? idx.getX(t*3+1) : t*3+1, i2 = idx ? idx.getX(t*3+2) : t*3+2;
      A.fromBufferAttribute(pa, i0).applyMatrix4(m); B.fromBufferAttribute(pa, i1).applyMatrix4(m); C.fromBufferAttribute(pa, i2).applyMatrix4(m);
      e1.subVectors(B, A); e2.subVectors(C, A); nrm.crossVectors(e1, e2);
      const len = nrm.length(); if (len < 1e-10) continue; nrm.divideScalar(len);
      if (nrm.y < 0.42) continue;
      tri.push([A.clone(), B.clone(), C.clone(), nrm.clone()]);
      for (const v of [A,B,C]) { ymax = Math.max(ymax, v.y); bx0=Math.min(bx0,v.x); bx1=Math.max(bx1,v.x); bz0=Math.min(bz0,v.z); bz1=Math.max(bz1,v.z); }
    }
    N = tri.length*3;
    const pos = new Float32Array(N*3), uvF = new Float32Array(N*2);
    surf = new Float32Array(N*3);
    const LIFT = .0015;
    for (let t=0;t<tri.length;t++){
      const [a,b,c,n] = tri[t];
      [a,b,c].forEach((v,j) => {
        const k = t*3+j;
        surf[k*3] = v.x + n.x*LIFT; surf[k*3+1] = v.y + n.y*LIFT; surf[k*3+2] = v.z + n.z*LIFT;
        uvF[k*2] = (v.x-bx0)/(bx1-bx0); uvF[k*2+1] = (v.z-bz0)/(bz1-bz0);
      });
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uvF', new THREE.BufferAttribute(uvF, 2));
    g.setAttribute('uv', new THREE.BufferAttribute(uvF, 2));
    sheet = new THREE.Mesh(g, filmMat); sheet.renderOrder = 5; film.add(sheet);
    flatY = ymax;
    // boundary edges (used by exactly one kept triangle) become the dotted outline
    const key = v => `${Math.round(v.x*2000)},${Math.round(v.y*2000)},${Math.round(v.z*2000)}`;
    const edges = new Map();
    for (const [a,b,c] of tri) for (const [p,q] of [[a,b],[b,c],[c,a]]) {
      const kp = key(p), kq = key(q), k = kp < kq ? kp+'|'+kq : kq+'|'+kp;
      const e = edges.get(k); if (e) e.n++; else edges.set(k, { n:1, p, q });
    }
    const o = []; outlineSurf = []; 
    for (const e of edges.values()) if (e.n === 1) { o.push(e.p.x, e.p.y, e.p.z, e.q.x, e.q.y, e.q.z); }
    outlineSurf = Float32Array.from(o);
    const og = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(Float32Array.from(o), 3));
    outline = new THREE.LineSegments(og, new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: .010, gapSize: .008, transparent: true, opacity: .7, depthTest: false }));
    outline.computeLineDistances(); outline.renderOrder = 6; film.add(outline);
    // callout anchors on the outline: nearest-left, far-right, middle-far
    anchors = [ new THREE.Vector3(bx0, 0, bz0 + (bz1-bz0)*.20), new THREE.Vector3(bx1, 0, bz0 + (bz1-bz0)*.66), new THREE.Vector3((bx0+bx1)/2, 0, bz1) ];
    updateSheet(1, 0);
  }
  let outlineSurf = null;

  // h: 0 = applied on the surface, 1 = hovering flat
  function updateSheet(h, bob){
    if (!sheet) return;
    const p = sheet.geometry.attributes.position.array;
    const hy = flatY + OFF_HOVER + bob;
    for (let k=0;k<N;k++){
      p[k*3] = surf[k*3]; p[k*3+2] = surf[k*3+2];
      p[k*3+1] = surf[k*3+1] + (hy - surf[k*3+1]) * h;
    }
    sheet.geometry.attributes.position.needsUpdate = true;
    sheet.geometry.computeVertexNormals();
    const op = outline.geometry.attributes.position.array;
    for (let k=0;k<op.length/3;k++){ op[k*3] = outlineSurf[k*3]; op[k*3+2] = outlineSurf[k*3+2]; op[k*3+1] = outlineSurf[k*3+1] + (hy + .002 - outlineSurf[k*3+1]) * h; }
    outline.geometry.attributes.position.needsUpdate = true;
    outline.material.opacity = .7 * h;
    for (const a of anchors) a.y = hy;
  }

  // ---- load --------------------------------------------------------------------
  const draco = new DRACOLoader(); draco.setDecoderPath(DRACO_PATH); draco.setDecoderConfig({ type: 'wasm' });
  const loader = new GLTFLoader(); loader.setDRACOLoader(draco);
  let cabin = null, trim = null, ready = false;
  async function fetchModel(url){
    let r = await fetch(url).catch(()=>null);
    if (r && r.ok) { const buf = await r.arrayBuffer(); if (buf.byteLength>1000 && new DataView(buf).getUint32(0,true)===0x46546C67) return buf; }
    r = await fetch(url.replace(/\.glb$/,'')+'.b64.txt'); if (!r.ok) throw new Error('model not found');
    const bin = atob((await r.text()).trim()), buf = new Uint8Array(bin.length); for (let i=0;i<bin.length;i++) buf[i]=bin.charCodeAt(i); return buf.buffer;
  }
  fetchModel(model).then(buf => loader.parse(buf, '', g => {
    cabin = g.scene; scene.add(cabin);
    const trims = [];
    cabin.traverse(o => {
      if (!o.isMesh) return;
      o.frustumCulled = false;
      const n = o.name || '', pn = (o.parent && o.parent.name) || '';
      const mat = o.material;
      if (mat && mat.map) mat.map.anisotropy = 4;
      if (/seat_belt/.test(n+pn)) { o.visible = false; return; }
      if (/carbonfiber_005$|carbonfiber_005\|/.test(n+'|') || /\|carbonfiber_005$/.test(pn)) trims.push(o);
    });
    // the console piece is the biggest carbon mesh
    trims.sort((a,b) => {
      const sa = new THREE.Box3().setFromObject(a).getSize(new THREE.Vector3()), sb = new THREE.Box3().setFromObject(b).getSize(new THREE.Vector3());
      return (sb.x*sb.z) - (sa.x*sa.z);
    });
    trim = trims[0] || null;
    cabin.updateMatrixWorld(true);
    if (trim) buildSheet(trim); else console.warn('[trim] no console trim found');
    ready = true; resize(); onReady && onReady(api);
  }, e => onFail && onFail(e))).catch(e => onFail && onFail(e));

  // ---- frame ----------------------------------------------------------------------
  const state = { t: 0, phase: 'hover', applied: 0 };
  function seek(t){
    t = ((t % DUR) + DUR) % DUR; state.t = t;
    const vis = sm(T.fadeIn[0], T.fadeIn[1], t) * (1 - sm(T.fadeOut[0], T.fadeOut[1], t));
    const lower = sm(T.lower[0], T.lower[1], t);
    const h = 1 - lower;
    const bob = Math.sin(t*2.1) * .006 * h;
    filmMat.opacity = (.24 - .16 * lower) * vis;
    U.uOn.value = lower;
    U.uSheen.value = -0.3 + 1.9 * sm(T.sheen[0], T.sheen[1], t);
    if (t < T.sheen[0] || t > T.sheen[1]) U.uSheen.value = -2;
    if (sheet) { sheet.visible = vis > .01; updateSheet(h, bob); outline.material.opacity *= vis; }
    state.phase = t < T.lower[0] ? 'hover' : t < T.lower[1] ? 'lowering' : t < T.fadeOut[0] ? 'applied' : 'reset';
    state.applied = lower;
    state.vis = vis;
    if (controls) controls.update();
    renderer.render(scene, camera);
    onFrame && onFrame(state, api);
  }

  // screen-space callouts for the page
  const v = new THREE.Vector3();
  function project(){
    const r = canvas.getBoundingClientRect();
    return anchors.map(a => { v.copy(a).project(camera); return { x: (v.x*.5+.5)*r.width, y: (-v.y*.5+.5)*r.height, z: v.z }; });
  }

  let raf = 0, t0 = performance.now(), playing = quality !== 'capture', visible = true;
  function tick(){
    raf = 0;
    if (!playing || !visible) return;
    seek((performance.now() - t0) / 1000);
    raf = requestAnimationFrame(tick);
  }
  function resize(){
    const r = stage.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    renderer.setPixelRatio(pixelRatio || Math.min(devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w/h; camera.fov = w < h ? 54 : 38; camera.updateProjectionMatrix();
    if (ready && !playing) seek(state.t);
  }
  addEventListener('resize', resize);
  if (quality !== 'capture' && 'IntersectionObserver' in window) {
    new IntersectionObserver(es => { visible = es[0].isIntersecting; if (visible && playing && !raf) { raf = requestAnimationFrame(tick); } }, { threshold: .05 }).observe(stage);
  }
  if (playing) raf = requestAnimationFrame(tick);

  const api = {
    seek, project, state, U, filmMat, render(){ renderer.render(scene, camera); }, get sheet(){ return sheet; },
    play(){ playing = true; t0 = performance.now() - state.t*1000; if (!raf) raf = requestAnimationFrame(tick); },
    stop(){ playing = false; },
    restart(){ t0 = performance.now(); state.t = 0; if (!playing) api.play(); },
    get ready(){ return ready; }, DUR, camera, controls,
  };
  return api;
}
