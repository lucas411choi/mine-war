/**
 * Low-level graphics helpers: toon materials, spec -> merged geometry (with baked outline hulls),
 * and a quality-aware outline registry.
 * A "spec" is one primitive: { g: geometry, c: color, p: [x,y,z], r?: [rx,ry,rz], s?: [sx,sy,sz], e?: emissive, noOut?: true }
 * Specs are merged into ONE geometry per rig part (vertex colors) -> very few draw calls.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const OUT = { on: true, meshes: [] };

let _grad = null;
function gradient() {
  if (!_grad) {
    _grad = new THREE.DataTexture(new Uint8Array([70, 130, 200, 255]), 4, 1, THREE.RedFormat);
    _grad.minFilter = _grad.magFilter = THREE.NearestFilter;
    _grad.needsUpdate = true;
  }
  return _grad;
}

export const MAT = {
  toon: new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradient() }),
  glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
  outline: new THREE.MeshBasicMaterial({ color: 0x140c08, side: THREE.BackSide }),
};

// ---- primitive spec constructors (compact) ----
export const box = (c, x, y, z, w, h, d, r, o) => ({ g: new THREE.BoxGeometry(w, h, d), c, p: [x, y, z], r, ...o });
export const sph = (c, x, y, z, rad, s, o) => ({ g: new THREE.SphereGeometry(rad, 10, 8), c, p: [x, y, z], s, ...o });
export const cyl = (c, x, y, z, rt, rb, h, r, o) => ({ g: new THREE.CylinderGeometry(rt, rb, h, 8), c, p: [x, y, z], r, ...o });
export const cone = (c, x, y, z, rad, h, r, o) => ({ g: new THREE.ConeGeometry(rad, h, 8), c, p: [x, y, z], r, ...o });
export const hemi = (c, x, y, z, rad, o) => ({ g: new THREE.SphereGeometry(rad, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), c, p: [x, y, z], ...o });
export const oct = (c, x, y, z, rad, s, r, o) => ({ g: new THREE.OctahedronGeometry(rad, 0), c, p: [x, y, z], s, r, ...o });
export const ico = (c, x, y, z, rad, s, r, o) => ({ g: new THREE.IcosahedronGeometry(rad, 0), c, p: [x, y, z], s, r, ...o });
export const glow = (spec) => ({ ...spec, e: true });

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();

/** Merge specs -> { main, glow, out } geometries. `thick` = outline hull thickness. */
export function build(specs, thick = 0.05) {
  const main = [], glw = [], outs = [];
  for (const s of specs) {
    const g = s.g.index ? s.g.toNonIndexed() : s.g.clone();
    g.deleteAttribute('uv');
    _e.set(...(s.r || [0, 0, 0])); _q.setFromEuler(_e);
    _v.set(...s.p); _s.set(...(s.s || [1, 1, 1]));
    _m.compose(_v, _q, _s);
    g.applyMatrix4(_m);
    const n = g.attributes.position.count, col = new Float32Array(n * 3), c = new THREE.Color(s.c), k = s.e ? 2.4 : 1;
    for (let i = 0; i < n; i++) { col[i * 3] = c.r * k; col[i * 3 + 1] = c.g * k; col[i * 3 + 2] = c.b * k; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (s.e) { glw.push(g); continue; }
    if (!s.noOut) {
      const o = g.clone(), pos = o.attributes.position;
      for (let i = 0; i < n; i++) {
        const dx = pos.getX(i) - s.p[0], dy = pos.getY(i) - s.p[1], dz = pos.getZ(i) - s.p[2];
        const l = Math.hypot(dx, dy, dz) || 1;
        pos.setXYZ(i, pos.getX(i) + (dx / l) * thick, pos.getY(i) + (dy / l) * thick, pos.getZ(i) + (dz / l) * thick);
      }
      outs.push(o);
    }
    main.push(g);
  }
  return {
    main: main.length ? mergeGeometries(main) : null,
    glow: glw.length ? mergeGeometries(glw) : null,
    out: outs.length ? mergeGeometries(outs) : null,
  };
}

const cache = new Map();
/** Build once per key, reuse geometry for every instance. */
export function cachedBuild(key, makeSpecs, thick) {
  let b = cache.get(key);
  if (!b) { b = build(makeSpecs(), thick); cache.set(key, b); }
  return b;
}

/** Create a Group of Meshes from a built geometry set. */
export function meshFrom(b, { shadow = true, receive = false } = {}) {
  const g = new THREE.Group();
  if (b.main) { const m = new THREE.Mesh(b.main, MAT.toon); m.castShadow = shadow; m.receiveShadow = receive; g.add(m); }
  if (b.glow) { const m = new THREE.Mesh(b.glow, MAT.glow); m.userData.glow = true; g.add(m); }
  if (b.out) { const o = new THREE.Mesh(b.out, MAT.outline); o.visible = OUT.on; OUT.meshes.push(o); g.add(o); }
  return g;
}

export function setOutlines(on) { OUT.on = on; for (const m of OUT.meshes) m.visible = on; }

/** InstancedMesh from specs + list of [x,y,z,rotY,scale]. */
export function instanced(b, items, { shadow = true } = {}) {
  const grp = new THREE.Group();
  const mk = (geo, mat) => {
    const im = new THREE.InstancedMesh(geo, mat, items.length);
    items.forEach((it, i) => {
      _e.set(0, it[3] || 0, 0); _q.setFromEuler(_e); _v.set(it[0], it[1], it[2]); _s.setScalar(it[4] || 1);
      _m.compose(_v, _q, _s); im.setMatrixAt(i, _m);
    });
    im.castShadow = shadow; im.instanceMatrix.needsUpdate = true;
    return im;
  };
  if (b.main) grp.add(mk(b.main, MAT.toon));
  if (b.glow) grp.add(mk(b.glow, MAT.glow));
  return grp;
}

/** Deterministic pseudo random for scenery placement. */
export function rnd(seed) { let a = seed >>> 0; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; }

export const COL = { blue: '#3d7bff', blueD: '#2a55b8', red: '#ef4545', redD: '#a82d2d', skin: '#ffd2a6', steel: '#c7cfd9', wood: '#8a5a2b', gold: '#f2c230' };
export const teamCol = (mine) => (mine ? COL.blue : COL.red);
export const teamColD = (mine) => (mine ? COL.blueD : COL.redD);
