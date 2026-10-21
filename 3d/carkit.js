// Shared car handling for the configurator and the hero: which mesh is paint,
// glass, brightwork, wheels; and normalising any model to the same size, place
// and orientation so cameras and lighting don't care which car is loaded.
import * as THREE from 'three';

export function inLampGroup(o){
  for (let p = o; p; p = p.parent) if (/SM_Light_[FB]/.test(p.name || '')) return true;
  return false;
}

export function classify(o){
  const n = (o.name || '').replace(/_\d+$/, '');
  const m = (o.material && o.material.name) || '';
  // Sketchfab LC300 (TMI_ naming)
  if (/1350010001/.test(m)) return 'body';
  // lamp housings: lens and any brightwork inside stay as the model made them
  if (inLampGroup(o) && /Glass_011|Exhaust_030/.test(m)) return /Glass/.test(m) ? 'lightglass' : 'lampchrome';
  if (/Glass_011/.test(m)) return 'glass';
  if (/Glass_Light/.test(m)) return 'lightglass';
  if (/Exhaust_030/.test(m)) return 'chrome';
  if (/Rim/i.test(m)) return 'rims';
  if (/Change_Brake/.test(m)) return 'disc';
  if (/Logo/.test(m)) return 'badge';
  if (/^Mirror$/.test(m)) return 'mirror';
  if (/Light_011/.test(m)) return 'lamp';
  if (/Cabin|Dashboard|Suspension|Engine|phong/.test(m)) return 'keep';
  // three.js Ferrari
  if (n === 'body') return 'body';
  if (n === 'glass') return 'glass';
  if (n === 'chrome') return 'chrome';
  if (n === 'trim' || n === 'wipers' || n === 'plastic_gray') return 'trim';
  if (/^rim_/.test(n) || n === 'wheel') return 'rims';
  if (n === 'tire') return 'tyre';
  if (n === 'brake') return 'disc';
  if (n === 'grills' || n === 'nuts' || n === 'metal') return 'dark';
  return 'keep';
}

// Scale to a standard length, sit on y=0, centre on x/z, nose toward -z.
export function normalise(car, { length = 4.95, noseFlip = false } = {}){
  car.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(car);
  const size = box.getSize(new THREE.Vector3());
  // longest horizontal axis is the length; rotate so it runs along z
  if (size.x > size.z) { car.rotation.y = Math.PI/2; car.updateMatrixWorld(true); box.setFromObject(car); box.getSize(size); }
  const s = length / size.z;
  car.scale.multiplyScalar(s);
  car.updateMatrixWorld(true); box.setFromObject(car); box.getSize(size);
  const c = box.getCenter(new THREE.Vector3());
  car.position.x -= c.x; car.position.z -= c.z; car.position.y -= box.min.y;
  if (noseFlip) { car.rotation.y += Math.PI; }
  car.updateMatrixWorld(true); box.setFromObject(car); box.getSize(size);
  return { box, size, length: size.z, width: size.x, height: size.y };
}

// A soft ground shadow sized to the car, no baked texture needed.
export function groundShadow(size, opacity = .9){
  const c = document.createElement('canvas'); c.width = 512; c.height = 1024;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(256, 512, 40, 256, 512, 300);
  grd.addColorStop(0, 'rgba(0,0,0,1)'); grd.addColorStop(.55, 'rgba(0,0,0,.75)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.save(); g.scale(1, 1.55); g.translate(0, -180); g.fillStyle = grd; g.fillRect(0,0,512,1024); g.restore();
  const tex = new THREE.CanvasTexture(c);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size.x*1.5, size.z*1.25),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity, depthWrite: false, toneMapped: false }));
  mesh.rotation.x = -Math.PI/2; mesh.position.y = .004; mesh.renderOrder = 1;
  return mesh;
}

// Apply a material kit to a loaded car. kit = { body, glass, chrome, trim, rims, tyre, disc, dark, badge, mirror }
export function applyKit(car, kit){
  const found = {};
  car.traverse(o => {
    if (!o.isMesh) return;
    const k = classify(o); found[k] = (found[k]||0) + 1;
    if (kit[k]) o.material = kit[k];
    else if (k === 'lampchrome' && kit.chrome) o.material = kit.lampchrome || kit.chrome;
    else if (k === 'lamp' || k === 'lightglass' || k === 'keep') { /* model's own */ }
    o.castShadow = o.receiveShadow = false;
  });
  return found;
}

// Wheel groups on game-style exports often have their pivot at the car origin.
// Re-centre each one on its own hub so it can spin. Returns the wheel groups.
export function prepareWheels(car){
  const groups = [];
  car.traverse(o => { if (/^T?:?W[1-4]$|^wheel_(fl|fr|rl|rr)$/i.test(o.name)) groups.push(o); });   // GLTFLoader strips the ':' from 'T:W1'
  for (const g of groups) {
    if (/^wheel_/i.test(g.name)) continue;                // the three.js car already pivots at the hub
    g.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(g);
    const c = box.getCenter(new THREE.Vector3());
    const inv = new THREE.Matrix4().copy(g.matrixWorld).invert();
    const cl = c.clone().applyMatrix4(inv);               // hub centre in the group's local space
    g.traverse(m => { if (m.isMesh && m.geometry) { m.geometry = m.geometry.clone(); m.geometry.translate(-cl.x, -cl.y, -cl.z); } });
    g.position.add(cl);
  }
  return groups;
}
