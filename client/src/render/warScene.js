/**
 * WarScene: the battlefield panel (quarter-view camera, drag/zoom).
 * Renders both towers and all units from a "view" (Game or Mirror), interpolating between sim ticks.
 * Also owns projectiles, spell telegraphs, tower damage states and the tower collapse sequence.
 * Screen convention: MY side is always the blue side on the left (x is mirrored when I am side 1).
 */
import * as THREE from 'three';
import { Rig, buildTower } from './models.js';
import { Particles } from './particles.js';
import { MAT, build, meshFrom, instanced, box, cyl, cone, sph, ico, hemi, glow, rnd, COL } from './gfx.js';

const lerp = (a, b, t) => a + (b - a) * t;
const UP = new THREE.Vector3(0, 1, 0);
const SPELL_COL = { fire: '#ff7a1a', water: '#4aa8ff', zap: '#ffe94a' };

export class WarScene {
  constructor(stage) {
    this.stage = stage; this.mySide = 0; this.frame = 0; this.t = 0; this._q = new THREE.Quaternion();
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#8fd3ff');
    this.scene.fog = new THREE.Fog('#bfe6ff', 90, 190);
    this.camera = new THREE.PerspectiveCamera(28, 1, 1, 400);
    this.camX = 0; this.zoom = 1; this.shake = 0; this.W = 40;

    this.scene.add(new THREE.HemisphereLight('#d6efff', '#5f8f3b', 1.05));
    const sun = this.sun = new THREE.DirectionalLight('#fff1cf', 2.4);
    sun.position.set(-18, 34, 18); sun.target.position.set(0, 0, 0);
    Object.assign(sun.shadow.camera, { left: -42, right: 42, top: 24, bottom: -24, near: 1, far: 100 });
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04;
    this.scene.add(sun, sun.target);

    this.buildWorld();
    this.fx = new Particles(this.scene, 700, true);
    this.smoke = new Particles(this.scene, 300, false);
    this.units = new Map(); this.pool = new Map(); this.dying = [];
    this.towers = [null, null]; this.projectiles = []; this.projPool = []; this.rings = []; this.bolts = [];
    // shared hp bar parts
    this.barGeo = new THREE.PlaneGeometry(1, 0.14);
    this.barBg = new THREE.MeshBasicMaterial({ color: 0x120a06, depthTest: false, transparent: true });
    this.barMine = new THREE.MeshBasicMaterial({ color: 0x4aa3ff, depthTest: false });
    this.barFoe = new THREE.MeshBasicMaterial({ color: 0xff5a4a, depthTest: false });
    this.ringGeo = new THREE.TorusGeometry(0.62, 0.07, 6, 18);
    this.ringMat = new THREE.MeshBasicMaterial({ color: 0x66ccff });
    this.starGeo = new THREE.SphereGeometry(0.1, 6, 4);
    this.starMat = new THREE.MeshBasicMaterial({ color: 0xffe94a });
    this.arrowGeo = new THREE.BoxGeometry(0.07, 0.07, 0.7);
    this.arrowMat = new THREE.MeshBasicMaterial({ color: 0xf5e6c8 });
    this.shellGeo = new THREE.SphereGeometry(0.28, 8, 6);
    this.shellMat = new THREE.MeshBasicMaterial({ color: 0x2a2a2e });
    this.beamGeo = new THREE.CylinderGeometry(0.1, 0.1, 1, 6);
    this.zapMat = new THREE.LineBasicMaterial({ color: 0xfff27a });
  }

  // ------------------------------------------------------------ static world
  buildWorld() {
    const sc = this.scene;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(190, 120), new THREE.MeshLambertMaterial({ color: '#6cc24a' }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; sc.add(ground);
    const road = new THREE.Mesh(new THREE.BoxGeometry(68, 0.12, 10.6), new THREE.MeshLambertMaterial({ color: '#d6ad70' }));
    road.position.y = 0.04; road.receiveShadow = true; sc.add(road);
    for (const z of [-5.5, 5.5]) {
      const e = new THREE.Mesh(new THREE.BoxGeometry(68, 0.2, 0.5), new THREE.MeshLambertMaterial({ color: '#a47f4c' }));
      e.position.set(0, 0.08, z); e.receiveShadow = true; sc.add(e);
    }
    const r = rnd(7);
    // trees
    const treeB = build([cyl('#7a4f2a', 0, .9, 0, .25, .35, 1.8), cone('#3fae3a', 0, 2.6, 0, 1.25, 2.2), cone('#55c94d', 0, 3.7, 0, .95, 1.8)], 0.07);
    const trees = [];
    for (let i = 0; i < 70; i++) {
      const side = r() < 0.5 ? -1 : 1, z = side * (10 + r() * 38), x = (r() - 0.5) * 120;
      trees.push([x, 0, z, r() * 6, 0.8 + r() * 0.8]);
    }
    sc.add(instanced(treeB, trees));
    // rocks + bushes
    const rockB = build([ico('#9aa2ae', 0, .4, 0, .8, [1.2, .8, 1]), ico('#848c98', .6, .25, .3, .5)], 0.05);
    const rocks = [];
    for (let i = 0; i < 36; i++) { const side = r() < 0.5 ? -1 : 1; rocks.push([(r() - 0.5) * 100, 0, side * (7 + r() * 26), r() * 6, 0.7 + r() * 1.1]); }
    sc.add(instanced(rockB, rocks));
    const bushB = build([sph('#4cbf45', 0, .45, 0, .6, [1, .75, 1]), sph('#63d95a', .4, .4, .2, .4)], 0.05);
    const bushes = [];
    for (let i = 0; i < 40; i++) { const side = r() < 0.5 ? -1 : 1; bushes.push([(r() - 0.5) * 90, 0, side * (6.5 + r() * 14), r() * 6, 0.8 + r() * 0.7]); }
    sc.add(instanced(bushB, bushes, { shadow: false }));
    // flowers (tiny glowing dots)
    const flowerB = build([sph('#fff27a', 0, .15, 0, .12, undefined, { noOut: true }), sph('#ff8ab5', .35, .12, .2, .1, undefined, { noOut: true })], 0.01);
    const flowers = [];
    for (let i = 0; i < 80; i++) { const side = r() < 0.5 ? -1 : 1; flowers.push([(r() - 0.5) * 80, 0, side * (6.8 + r() * 9), 0, 1]); }
    sc.add(instanced(flowerB, flowers, { shadow: false }));
    // broken walls & banners along the road
    const wallB = build([
      box('#b8b3a6', 0, .6, 0, 3.2, 1.2, .8), box('#a39e92', -.6, 1.4, 0, 1.4, .7, .8), box('#a39e92', 1.0, 1.25, 0, .7, .5, .8, [0, 0, .3]),
      box('#b8b3a6', 2.2, .3, .5, .8, .6, .7, [0, .5, 0]), box('#8f8a7e', -2, .25, -.4, .7, .5, .6, [0, -.4, 0]),
    ], 0.06);
    sc.add(instanced(wallB, [[-12, 0, -7.6, 0.1, 1], [12, 0, 7.6, 3.2, 1], [0, 0, -7.9, 0, 1.1], [-3, 0, 8, 3.1, 0.9], [18, 0, -8, 0.3, 1], [-18, 0, 8, 2.9, 1]]));
    // mountains
    const mt = [];
    for (let i = 0; i < 9; i++) { const x = -90 + i * 22 + (r() - 0.5) * 8, h = 22 + r() * 18; mt.push(cone('#7f93b5', x, h / 2, -78, 16 + r() * 8, h, undefined, { noOut: true }), cone('#f2f6ff', x, h * 0.86, -78, 5, h * 0.3, undefined, { noOut: true })); }
    const m = meshFrom(build(mt, 0.01), { shadow: false }); sc.add(m);
    // lane center markers
    const mk = build(Array.from({ length: 9 }, (_, i) => box('#b88f56', -28 + i * 7, 0.14, 0, 2.2, .04, .35)), 0.01);
    sc.add(meshFrom(mk, { shadow: false }));
  }

  setSide(side) {
    this.mySide = side;
    for (const [, uv] of this.units) this.releaseUnit(uv);
    this.units.clear();
    for (const d of this.dying) this.releaseUnit(d.uv);
    this.dying = [];
    for (const tv of this.towers) if (tv) this.scene.remove(tv.info.root);
    this.towers = [null, null];
    this.camX = 0;
  }
  X(x) { return this.mySide === 1 ? -x : x; }

  setQuality(q) {
    this.sun.castShadow = q.shadow > 0;
    if (q.shadow) { this.sun.shadow.mapSize.set(q.shadow, q.shadow); if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; } }
    this.fx.scale = q.particles; this.smoke.scale = q.particles;
  }

  // ------------------------------------------------------------ camera
  pan(dx) { this.camX = this.clampCam(this.camX + dx); }
  zoomBy(f) { this.zoom = THREE.MathUtils.clamp(this.zoom * f, 0.6, 2.2); this.camX = this.clampCam(this.camX); }
  clampCam(x) { const lim = Math.max(0, 31 - this.W / 2); return THREE.MathUtils.clamp(x, -lim, lim); }
  fit(aspect) {
    const base = THREE.MathUtils.lerp(32, 54, THREE.MathUtils.clamp((aspect - 0.6) / 1.0, 0, 1));
    this.W = base / this.zoom;
    const cam = this.camera, el = THREE.MathUtils.degToRad(50), tanH = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const dist = Math.max(30, this.W / 2 / (tanH * aspect));
    const sh = this.shake;
    cam.position.set(this.camX + (Math.random() - 0.5) * sh, Math.sin(el) * dist + (Math.random() - 0.5) * sh, Math.cos(el) * dist - 2);
    cam.lookAt(this.camX, 0, -2);
  }
  /** World point -> pixel inside the panel (null if behind camera). */
  project(x, y, z, w, h) {
    const v = new THREE.Vector3(this.X(x), y, z).project(this.camera);
    if (v.z > 1) return null;
    return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h };
  }

  // ------------------------------------------------------------ units
  makeUnit(u) {
    const mine = u.side === this.mySide, key = u.type + (mine ? '_m' : '_e');
    let list = this.pool.get(key); if (!list) { list = []; this.pool.set(key, list); }
    let uv = list.pop();
    if (!uv) {
      const rig = new Rig(u.type, mine), root = new THREE.Group();
      root.add(rig.root);
      const bar = new THREE.Group();
      const bg = new THREE.Mesh(this.barGeo, this.barBg); bg.scale.set(1.5, 1.3, 1);
      const fill = new THREE.Mesh(this.barGeo, mine ? this.barMine : this.barFoe);
      bg.renderOrder = 20; fill.renderOrder = 21; bar.add(bg, fill);
      bar.position.y = rig.def.style === 'plane' ? 1.6 : rig.def.style === 'tank' ? 3.4 : 2.9; root.add(bar);
      const ring = new THREE.Mesh(this.ringGeo, this.ringMat); ring.rotation.x = Math.PI / 2; ring.position.y = 0.1; ring.visible = false; root.add(ring);
      const stars = new THREE.Group();
      for (let i = 0; i < 3; i++) { const s = new THREE.Mesh(this.starGeo, this.starMat); stars.add(s); }
      stars.position.y = bar.position.y + 0.5; stars.visible = false; root.add(stars);
      uv = { key, rig, root, bar, fill, ring, stars, type: u.type, mine, fireT: 0 };
    }
    uv.root.scale.set(1, 1, 1); uv.root.rotation.set(0, 0, 0); uv.root.visible = true; uv.rig.pivot.rotation.set(0, 0, 0); uv.rig.swing = -1; uv.rig.hurt = 0; uv.rig.pivot.position.set(0, 0, 0);
    this.scene.add(uv.root);
    return uv;
  }
  releaseUnit(uv) { this.scene.remove(uv.root); const l = this.pool.get(uv.key); if (l) l.push(uv); }

  // ------------------------------------------------------------ towers
  ensureTower(s, view) {
    const hidden = view.phase === 'prep' && s !== this.mySide;
    const type = hidden ? 'hidden' : view.towers[s].type;
    let tv = this.towers[s];
    if (tv && tv.type === type) return tv;
    if (tv) this.scene.remove(tv.info.root);
    const info = buildTower(type, s === this.mySide);
    const sx = this.X(view.towers[s].x);
    info.root.position.set(sx, 0, 0);
    info.root.rotation.y = s === this.mySide ? Math.PI / 2 : -Math.PI / 2;
    this.scene.add(info.root);
    tv = this.towers[s] = { info, type, pulse: 0, smokeT: 0, collapse: -1, side: s };
    return tv;
  }

  startCollapse(s) {
    const tv = this.towers[s];
    if (!tv || tv.collapse >= 0) return;
    tv.collapse = 0;
    const x = tv.info.root.position.x;
    this.stage.slowmo(0.25, 2.8);
    this.stage.shakeAmt(2.2);
    for (let i = 0; i < 6; i++) this.fx.burst(x + (Math.random() - 0.5) * 3, 1 + Math.random() * 5, (Math.random() - 0.5) * 3, 14, { speed: 9, size: 0.7, size1: 0, color: ['#ffb347', '#ff5a2a', '#fff2a0'], life: 1.2, gravity: 4 });
    for (let i = 0; i < 5; i++) this.smoke.burst(x + (Math.random() - 0.5) * 3, 1 + Math.random() * 4, (Math.random() - 0.5) * 3, 10, { speed: 4, size: 1.2, size1: 3.5, color: '#6b6b70', life: 2.2, gravity: -1, up: 1 });
  }

  // ------------------------------------------------------------ events
  handle(events, view) {
    const st = this.stage, my = this.mySide;
    let texts = 0;
    for (const e of events) {
      switch (e.e) {
        case 'spw': {
          const y = 0.2, x = this.X(e.x);
          this.smoke.burst(x, y, e.z, 6, { speed: 2, size: 0.5, size1: 1.4, color: '#e8e2d0', life: 0.5, gravity: -1 });
          if (e.s === my) this.fx.burst(x, 1, e.z, 8, { speed: 4, size: 0.25, color: ['#7fb2ff', '#ffffff'], life: 0.5 });
          break;
        }
        case 'atk': {
          const uv = this.units.get(e.u);
          if (uv) uv.rig.doSwing();
          const ay = uv && uv.type === 'sammy' ? 3 : 1.4, a = new THREE.Vector3(this.X(e.x), ay, e.z), b = new THREE.Vector3(this.X(e.tx), e.tw ? 4 : e.a ? 3 : 1.1, e.tz);
          if (e.k === 'arrow') this.shoot('arrow', a, b, 0.3, 1.2);
          else if (e.k === 'cannon') { this.shoot('shell', a.setY(1.9), b, 0.45, 2.5); this.smoke.burst(a.x, 1.9, a.z, 4, { speed: 2, size: 0.5, size1: 1.6, color: '#8a8a90', life: 0.6, gravity: -0.5 }); st.shakeAmt(0.12); }
          else if (e.k === 'air') this.shoot('tracer', a, b, 0.12, 0);
          else this.fx.burst(b.x, 1.1, b.z, 4, { speed: 3, size: 0.18, color: '#ffffff', life: 0.25 });
          break;
        }
        case 'hit': {
          if (e.tw !== undefined) {
            const tv = this.towers[e.tw]; if (tv) tv.pulse = 0.2;
            this.fx.burst(this.X(e.x), 3 + Math.random() * 3, 1.5, 4, { speed: 4, size: 0.3, color: ['#ffe9a0', '#ffffff'], life: 0.4 });
            st.shakeAmt(0.15);
          } else {
            const uv = this.units.get(e.id);
            if (uv) uv.rig.doHurt();
            this.fx.burst(this.X(e.x), uv && uv.type === 'sammy' ? 3 : 1.2, e.z, 3, { speed: 3.5, size: 0.2, color: ['#fff2a0', '#ffffff'], life: 0.3 });
          }
          if (texts < 10) { texts++; st.floatText('war', this.project(e.x, e.tw !== undefined ? 6 : 2.4, e.z, st.size.war.w, st.size.war.h), e.d, e.tw !== undefined ? 'tw' : (e.id && this.units.get(e.id) && !this.units.get(e.id).mine ? 'foe' : 'me')); }
          break;
        }
        case 'die': {
          const x = this.X(e.x);
          this.smoke.burst(x, 0.8, e.z, 8, { speed: 2.5, size: 0.6, size1: 1.8, color: '#7a7a80', life: 0.7, gravity: -1 });
          this.fx.burst(x, 1, e.z, 8, { speed: 5, size: 0.25, color: ['#ffd27a', '#ff8a3a'], life: 0.5 });
          break;
        }
        case 'twatk': this.towerFire(e, view); break;
        case 'warn': this.addRing(e); break;
        case 'spell': this.castSpell(e); break;
        case 'twd': this.startCollapse(e.s); break;
        default: break;
      }
    }
  }

  towerFire(e, view) {
    const tv = this.towers[e.s]; if (!tv) return;
    const info = tv.info, a = new THREE.Vector3(info.root.position.x, info.top, 0), b = new THREE.Vector3(this.X(e.tx), e.a ? 3 : 1.2, e.tz);
    switch (e.k) {
      case 'crystal': this.shoot('beam', a, b, 0.18, 0, '#7ee8ff'); this.fx.burst(b.x, b.y, b.z, 6, { speed: 4, size: 0.25, color: '#7ee8ff', life: 0.4 }); break;
      case 'iron': this.shoot('shell', a.setY(5.2), b, 0.5, 4); this.smoke.burst(a.x, 5.2, 0, 5, { speed: 2, size: 0.8, size1: 2, color: '#8a8a90', life: 0.8, gravity: -0.5 }); break;
      case 'flame': {
        for (let i = 0; i < 14; i++) { const k = i / 14; this.fx.emit({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k) + Math.sin(k * Math.PI) * 1.2, z: lerp(0, b.z, k), vx: (Math.random() - 0.5) * 2, vy: 1 + Math.random(), vz: (Math.random() - 0.5) * 2, life: 0.5, size: 0.5, size1: 0, color: ['#ff7a1a', '#ffd23a'][i % 2], gravity: -1 }); }
        this.fx.burst(b.x, 0.8, b.z, 16, { speed: 5, size: 0.5, color: ['#ff5a1a', '#ffd23a'], life: 0.6, spread: 2.5 }); break;
      }
      default: this.shoot('beam', a, b, 0.15, 0, '#ffd23a');
    }
  }

  shoot(kind, a, b, dur, arc, color) {
    let p = this.projPool.pop();
    if (!p) { p = { mesh: new THREE.Mesh(this.arrowGeo, this.arrowMat), kind: '' }; }
    const mesh = p.mesh;
    if (kind === 'arrow') { mesh.geometry = this.arrowGeo; mesh.material = this.arrowMat; }
    else if (kind === 'shell') { mesh.geometry = this.shellGeo; mesh.material = this.shellMat; }
    else {
      mesh.geometry = this.beamGeo;
      mesh.material = new THREE.MeshBasicMaterial({ color: color || (kind === 'tracer' ? '#fff0a0' : '#ffffff'), transparent: true });
    }
    mesh.scale.set(1, 1, 1);
    p.kind = kind; p.a = a.clone(); p.b = b.clone(); p.t = 0; p.dur = dur; p.arc = arc;
    if (kind === 'beam' || kind === 'tracer') {
      const dir = new THREE.Vector3().subVectors(p.b, p.a), len = dir.length();
      mesh.position.copy(p.a).addScaledVector(dir, 0.5);
      mesh.quaternion.setFromUnitVectors(UP, dir.normalize());
      mesh.scale.set(kind === 'beam' ? 1.2 : 0.5, len, kind === 'beam' ? 1.2 : 0.5);
    }
    this.scene.add(mesh); this.projectiles.push(p);
  }

  addRing(e) {
    const col = SPELL_COL[e.k];
    const mat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(e.r * 0.86, e.r, 40), mat);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(e.r, 32), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false }));
    const g = new THREE.Group(); g.add(ring, disc); g.rotation.x = -Math.PI / 2; g.position.set(this.X(e.x), 0.2, e.z);
    this.scene.add(g); this.rings.push({ g, t: 0, dur: e.dur, ring, disc, key: e.k + e.x + e.z });
  }

  castSpell(e) {
    const x = this.X(e.x), st = this.stage;
    const i = this.rings.findIndex((r) => r.key === e.k + e.x + e.z);
    if (i >= 0) { this.scene.remove(this.rings[i].g); this.rings.splice(i, 1); }
    st.shakeAmt(0.5);
    if (e.k === 'fire') {
      this.fx.burst(x, 0.8, e.z, 50, { speed: 8, size: 0.7, color: ['#ff7a1a', '#ffd23a', '#ff3a10'], life: 0.9, spread: e.r, gravity: -2 });
      this.smoke.burst(x, 1, e.z, 14, { speed: 3, size: 1.0, size1: 3, color: '#4a3a30', life: 1.4, gravity: -1.5, spread: e.r });
    } else if (e.k === 'water') {
      this.fx.burst(x, 0.5, e.z, 50, { speed: 7, size: 0.4, color: ['#4aa8ff', '#bfe6ff', '#ffffff'], life: 0.8, spread: e.r, gravity: 9 });
      const g = new THREE.Mesh(new THREE.RingGeometry(0.1, 0.5, 32), new THREE.MeshBasicMaterial({ color: '#8fd0ff', transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
      g.rotation.x = -Math.PI / 2; g.position.set(x, 0.25, e.z); this.scene.add(g); this.rings.push({ g, t: 0, dur: 0.7, expand: e.r, ring: g, key: 'x' });
    } else {
      const pts = (e.pts || [[e.x, e.z]]).map(([px, pz]) => new THREE.Vector3(this.X(px), 0.8, pz));
      let prev = new THREE.Vector3(pts[0].x + (Math.random() - 0.5) * 2, 22, pts[0].z);
      const verts = [];
      for (const p of pts) {
        const n = 7;
        for (let k = 0; k < n; k++) {
          const a = prev.clone().lerp(p, k / n), b = prev.clone().lerp(p, (k + 1) / n);
          if (k > 0) { a.x += (Math.random() - 0.5) * 1.6; a.z += (Math.random() - 0.5) * 1.6; }
          if (k < n - 1) { b.x += (Math.random() - 0.5) * 1.6; b.z += (Math.random() - 0.5) * 1.6; }
          verts.push(a, b);
        }
        prev = p;
        this.fx.burst(p.x, 1, p.z, 16, { speed: 6, size: 0.4, color: ['#fff27a', '#ffffff', '#9ad4ff'], life: 0.5 });
      }
      const line = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(verts), this.zapMat);
      line.frustumCulled = false; this.scene.add(line); this.bolts.push({ line, t: 0 });
    }
  }

  // ------------------------------------------------------------ per frame
  update(dt, view) {
    this.frame++; this.t += dt;
    const my = this.mySide, a = view.alpha, t = this.t;
    this.shake = Math.max(0, this.shake - dt * 4);

    // towers
    for (const s of [0, 1]) {
      const tv = this.ensureTower(s, view), tw = view.towers[s], info = tv.info, root = info.root;
      const ratio = Math.max(0, tw.hp / tw.maxHp);
      if (tw.hp <= 0 && view.phase === 'over') this.startCollapse(s);
      if (tv.collapse >= 0) {
        tv.collapse += dt; const k = Math.min(1, tv.collapse / 2.4);
        root.position.y = -6.5 * k * k; root.rotation.z = (s === my ? 1 : -1) * 0.35 * k; root.scale.y = 1 - 0.4 * k;
        if (Math.random() < 0.6) this.smoke.burst(root.position.x + (Math.random() - 0.5) * 4, 1 + Math.random() * (4 - 3 * k), (Math.random() - 0.5) * 4, 2, { speed: 3, size: 1, size1: 3, color: '#8b8579', life: 1.6, gravity: -1 });
        if (Math.random() < 0.4) this.fx.burst(root.position.x + (Math.random() - 0.5) * 4, 2 + Math.random() * 3, (Math.random() - 0.5) * 3, 3, { speed: 5, size: 0.5, color: ['#ffb347', '#ff5a2a'], life: 0.8 });
        continue;
      }
      tv.pulse = Math.max(0, tv.pulse - dt);
      const sc = 1 + tv.pulse * 0.12; root.scale.set(sc, 1 - tv.pulse * 0.1, sc);
      info.cracks.forEach((c, i) => { c.visible = ratio < [0.75, 0.5, 0.25][i]; });
      info.flags.forEach((f, i) => { f.rotation.y = Math.sin(t * 2.2 + i) * 0.25; });
      if (info.fire) { const k = 1 + Math.sin(t * 14) * 0.08 + Math.sin(t * 23) * 0.05; info.fire.scale.set(1, k, 1); }
      tv.smokeT -= dt;
      if (ratio < 0.65 && tv.smokeT <= 0) {
        tv.smokeT = 0.12 + ratio * 0.3;
        this.smoke.emit({ x: root.position.x + (Math.random() - 0.5) * 2, y: info.top - 1, z: (Math.random() - 0.5) * 2, vy: 2.5, vx: (Math.random() - 0.5), life: 1.6, size: 0.8, size1: 2.6, color: ratio < 0.3 ? '#3a3a3e' : '#8a8a90', gravity: -0.3 });
        if (ratio < 0.35) this.fx.emit({ x: root.position.x + (Math.random() - 0.5) * 2.5, y: info.top - 2 + Math.random() * 2, z: (Math.random() - 0.5) * 2.5, vy: 2, life: 0.5, size: 0.5, size1: 0, color: '#ff7a1a', gravity: -2 });
      }
    }

    // units
    const w = this.stage.size.war;
    for (const u of view.units) {
      let uv = this.units.get(u.id);
      if (!uv) { uv = this.makeUnit(u); this.units.set(u.id, uv); }
      uv.seen = this.frame;
      const x = this.X(lerp(u.px, u.x, a)), z = lerp(u.pz, u.z, a), mine = uv.mine;
      uv.root.position.set(x, u.air ? 3 : 0, z);
      uv.root.rotation.y = mine ? Math.PI / 2 : -Math.PI / 2;
      uv.rig.mode = u.st === 1 ? 'move' : 'idle';
      uv.rig.update(dt);
      const ratio = Math.max(0, u.hp / u.maxHp);
      uv.bar.visible = ratio < 0.999;
      if (uv.bar.visible) {
        uv.fill.scale.set(ratio * 1.4, 1, 1); uv.fill.position.x = -(1 - ratio) * 0.7 - 0.0;
        // billboard: cancel the unit's yaw, then face the camera
        this._q.setFromAxisAngle(UP, -uv.root.rotation.y);
        uv.bar.quaternion.copy(this._q).multiply(this.camera.quaternion);
      }
      uv.ring.visible = u.slow > 0; uv.ring.rotation.z += dt * 2;
      uv.stars.visible = u.stun > 0;
      if (uv.stars.visible) uv.stars.children.forEach((s, i) => { const an = t * 6 + i * 2.1; s.position.set(Math.cos(an) * 0.5, 0, Math.sin(an) * 0.5); });
      if (u.burn > 0) {
        uv.fireT -= dt;
        if (uv.fireT <= 0) { uv.fireT = 0.08; this.fx.emit({ x: x + (Math.random() - 0.5) * 0.6, y: (u.air ? 3 : 0) + 0.8 + Math.random(), z: z + (Math.random() - 0.5) * 0.6, vy: 2, life: 0.45, size: 0.35, size1: 0, color: ['#ff7a1a', '#ffd23a'][(Math.random() * 2) | 0], gravity: -2 }); }
      }
    }
    // vanished units -> death animation
    for (const [id, uv] of this.units) {
      if (uv.seen === this.frame) continue;
      this.units.delete(id); this.dying.push({ uv, t: 0 }); uv.bar.visible = false; uv.ring.visible = false; uv.stars.visible = false;
    }
    for (let i = this.dying.length - 1; i >= 0; i--) {
      const d = this.dying[i]; d.t += dt; const k = d.t / 0.55;
      d.uv.rig.pivot.rotation.z = k * 1.2; d.uv.root.scale.set(1 + k * 0.3, Math.max(0.05, 1 - k), 1 + k * 0.3);
      if (d.uv.type === 'sammy') d.uv.root.position.y = Math.max(0, d.uv.root.position.y - dt * 9);
      if (k >= 1) { this.releaseUnit(d.uv); this.dying.splice(i, 1); }
    }

    // projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i]; p.t += dt; const k = Math.min(1, p.t / p.dur);
      if (p.kind === 'arrow' || p.kind === 'shell') {
        const m = p.mesh; m.position.lerpVectors(p.a, p.b, k); m.position.y += Math.sin(k * Math.PI) * p.arc;
        const nx = p.a.clone().lerp(p.b, Math.min(1, k + 0.05)); nx.y += Math.sin(Math.min(1, k + 0.05) * Math.PI) * p.arc;
        m.lookAt(nx);
      } else p.mesh.material.opacity = 1 - k;
      if (k >= 1) {
        this.scene.remove(p.mesh); if (p.kind === 'beam' || p.kind === 'tracer') p.mesh.material.dispose();
        if (p.kind === 'shell') { this.fx.burst(p.b.x, p.b.y, p.b.z, 12, { speed: 6, size: 0.5, color: ['#ffb347', '#ffe9a0'], life: 0.5 }); this.smoke.burst(p.b.x, p.b.y, p.b.z, 4, { speed: 2, size: 0.8, size1: 2.2, color: '#6b6b70', life: 0.8, gravity: -1 }); }
        this.projPool.push(p); this.projectiles.splice(i, 1);
      }
    }
    // spell rings / bolts
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i]; r.t += dt; const k = Math.min(1, r.t / r.dur);
      if (r.expand) { const s = 1 + k * r.expand * 2; r.g.scale.set(s, s, 1); r.ring.material.opacity = 0.8 * (1 - k); }
      else { r.ring.material.opacity = 0.35 + 0.3 * Math.sin(r.t * 14); const s = 1 - k * 0.12; r.g.scale.set(s, s, 1); r.disc.material.opacity = 0.1 + 0.15 * k; }
      if (k >= 1 && r.expand) { this.scene.remove(r.g); this.rings.splice(i, 1); }
      else if (r.t > r.dur + 1.5) { this.scene.remove(r.g); this.rings.splice(i, 1); }
    }
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i]; b.t += dt;
      b.line.visible = Math.floor(b.t * 30) % 2 === 0;
      if (b.t > 0.35) { this.scene.remove(b.line); b.line.geometry.dispose(); this.bolts.splice(i, 1); }
    }

    this.fx.update(dt); this.smoke.update(dt);
  }
}
