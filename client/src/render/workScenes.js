/**
 * MineScene (panel 1: cave with miners) and ForgeScene (panel 3: smithy / wizard workshop).
 * Both show only MY team: workers are added as hires are made (counts read from the view).
 * Their camera is auto-fitted to the work area so any panel aspect ratio shows everyone.
 */
import * as THREE from 'three';
import { Rig } from './models.js';
import { Particles } from './particles.js';
import { MAT, build, meshFrom, instanced, box, cyl, cone, sph, ico, oct, hemi, glow, rnd, COL } from './gfx.js';

function fitCam(cam, aspect, cx, cz, halfW, halfD, elDeg, shake) {
  const tanV = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)), el = THREE.MathUtils.degToRad(elDeg);
  const dist = Math.max(halfW / (tanV * aspect), (halfD * Math.sin(el) + 3.2) / tanV);
  cam.position.set(cx + (Math.random() - 0.5) * shake, Math.sin(el) * dist + (Math.random() - 0.5) * shake, cz + Math.cos(el) * dist);
  cam.lookAt(cx, 1.0, cz);
}

/** Shared base: scene, particles, worker pool sync. */
class WorkScene {
  constructor(stage, bg, fog) {
    this.stage = stage; this.scene = new THREE.Scene(); this.t = 0; this.shake = 0;
    this.scene.background = new THREE.Color(bg); this.scene.fog = new THREE.Fog(bg, fog[0], fog[1]);
    this.camera = new THREE.PerspectiveCamera(34, 1, 0.5, 200);
    this.fx = new Particles(this.scene, 420, true);
    this.puff = new Particles(this.scene, 200, false);
    this.workers = {};
  }
  setQuality(q) { this.fx.scale = q.particles; this.puff.scale = q.particles; }
  setSide() { for (const id in this.workers) for (const w of this.workers[id]) this.scene.remove(w.root); this.workers = {}; }
  /** Keep the number of worker models equal to owned count. */
  sync(id, count, make) {
    const list = this.workers[id] || (this.workers[id] = []);
    while (list.length < count) { const w = make(list.length); w.pop = 0; list.push(w); this.scene.add(w.root); this.onAdded(w); }
    while (list.length > count) { const w = list.pop(); this.scene.remove(w.root); }
  }
  onAdded(w) { const p = w.root.position; this.fx.burst(p.x, 1, p.z, 14, { speed: 5, size: 0.3, color: ['#ffd54a', '#ffffff'], life: 0.6 }); }
  popScale(w, dt) { if (w.pop < 1) { w.pop = Math.min(1, w.pop + dt * 3.5); const k = w.pop, s = k < 1 ? 1 + Math.sin(k * Math.PI) * 0.35 : 1; w.root.scale.set(s * k, s * k, s * k); } }
}

// ===================================================================== MINE
const MINE_SLOTS = {
  jack: { x0: -4.2, dx: 2.8, z0: 4.5, dz: -2.2, cols: 4 },
  robinson: { x0: -4.2, dx: 2.8, z0: -2.6, dz: -2.6, cols: 4 },
  gary: { x0: -4.2, dx: 2.8, z0: -10.4, dz: -2.4, cols: 4 },
  teammine: { x0: -3.6, dx: 3.6, z0: -15.8, dz: -3.2, cols: 3 },
};
const slot = (S, i) => [S.x0 + (i % S.cols) * S.dx + ((Math.floor(i / S.cols) % 2) ? 0.7 : 0), S.z0 + Math.floor(i / S.cols) * S.dz];

export class MineScene extends WorkScene {
  constructor(stage) {
    super(stage, '#1d140e', [30, 70]);
    const sc = this.scene;
    sc.add(new THREE.HemisphereLight('#ffd9a0', '#4a3020', 1.15));
    const key = new THREE.DirectionalLight('#ffe2b0', 1.6); key.position.set(6, 16, 14); sc.add(key);
    this.lamps = [];
    for (const z of [-2, -12]) { const l = new THREE.PointLight('#ffb050', 40, 22, 2); l.position.set(0, 5.2, z); sc.add(l); this.lamps.push(l); }
    this.build();
    this.dyn = [];
    this.dustT = 0;
  }

  build() {
    const sc = this.scene, r = rnd(11);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(34, 60), new THREE.MeshLambertMaterial({ color: '#6a4c36' }));
    floor.rotation.x = -Math.PI / 2; floor.position.z = -10; sc.add(floor);
    const rockB = build([ico('#6e4f3a', 0, 0, 0, 1.6, [1.2, 1.1, 1])], 0.08);
    const rockB2 = build([ico('#876248', 0, 0, 0, 1.3, [1, 1.2, 1.1])], 0.08);
    const walls = [], walls2 = [];
    for (let z = 6; z > -30; z -= 2.6) for (const sx of [-1, 1]) for (let row = 0; row < 3; row++) {
      (r() < 0.5 ? walls : walls2).push([sx * (10.5 + r() * 2.5 + row * 0.8), row * 2.6, z + r(), r() * 6, 1 + r() * 0.8]);
    }
    for (let x = -14; x <= 14; x += 3) for (let row = 0; row < 3; row++) (r() < 0.5 ? walls : walls2).push([x + r(), row * 2.8, -30 + r() * 1.5, r() * 6, 1.2 + r() * 0.8]);
    sc.add(instanced(rockB, walls), instanced(rockB2, walls2));
    // crystals + gold veins (emissive -> bloom)
    const cr = [], cols = ['#58e0ff', '#ff6bd5', '#7dff8a', '#b58bff'];
    for (let i = 0; i < 22; i++) {
      const side = r() < 0.5 ? -1 : 1, z = 3 - r() * 30, x = side * (8.4 + r() * 1.2), s = 0.5 + r() * 0.9;
      cr.push(glow(oct(cols[i % 4], x, 0.6 + r() * 3, z, s, [0.5, 1.8, 0.5], [r() * 0.5, r() * 6, side * 0.4])));
      if (i % 3 === 0) cr.push(glow(oct(cols[(i + 1) % 4], x + side * -0.5, 0.4, z + 0.5, s * 0.6, [0.5, 1.5, 0.5], [0, r() * 6, side * 0.5])));
    }
    for (let i = 0; i < 16; i++) { const side = r() < 0.5 ? -1 : 1; cr.push(glow(box('#ffc933', side * (8.2 + r()), 0.5 + r() * 4, 2 - r() * 28, 0.35, 0.35, 0.35, [r(), r(), r()]))); }
    sc.add(meshFrom(build(cr, 0.01), { shadow: false }));
    // timber frames + lanterns + rails
    const tim = [];
    for (const z of [0, -9, -18]) {
      tim.push(box('#7a5230', -7.6, 3, z, .55, 6, .55), box('#7a5230', 7.6, 3, z, .55, 6, .55), box('#7a5230', 0, 6.1, z, 16, .55, .55), box('#6a4526', -6.5, 5.3, z, .3, 2.2, .3, [0, 0, .8]), box('#6a4526', 6.5, 5.3, z, .3, 2.2, .3, [0, 0, -.8]));
      tim.push(box('#333', 0, 5.5, z, .05, 1.2, .05), glow(sph('#ffb347', 0, 4.8, z, .35)));
    }
    for (const x of [-6.4, -5.7, 5.7, 6.4]) tim.push(box('#8a8a94', x, 0.12, -10, .1, .1, 60));
    for (let z = 6; z > -30; z -= 1.3) tim.push(box('#6a4a2a', -6, 0.05, z, 1.6, .1, .3), box('#6a4a2a', 6, 0.05, z, 1.6, .1, .3));
    tim.push(box('#6b4a2a', 7, 0.6, -5, 1.4, .9, 1.8), glow(box('#ffc933', 7, 1.15, -5, 1.2, .3, 1.5)), box('#6b4a2a', -7, 0.6, -14, 1.4, .9, 1.8), glow(box('#58e0ff', -7, 1.15, -14, 1.2, .3, 1.5)));
    sc.add(meshFrom(build(tim, 0.05), { shadow: false }));
    this.oreGeo = build([ico('#7a5a40', 0, .55, 0, .75, [1.1, .9, 1]), glow(sph('#ffc933', .35, .8, .4, .1)), glow(sph('#58e0ff', -.3, .7, .45, .08))], 0.05);
    this.crateGeo = build([box('#b5651d', 0, .4, 0, .9, .8, .9), box('#d43a2f', 0, .86, 0, .7, .1, .7), box('#ffd54a', 0, .4, .46, .6, .2, .02)], 0.04);
    this.cartGeo = build([box('#6b4a2a', 0, .5, 0, 1.2, .8, 1.8), glow(box('#ffc933', 0, .95, 0, 1.0, .3, 1.5)), cyl('#333', .62, .2, .6, .22, .22, .12, [0, 0, Math.PI / 2]), cyl('#333', -.62, .2, .6, .22, .22, .12, [0, 0, Math.PI / 2]), cyl('#333', .62, .2, -.6, .22, .22, .12, [0, 0, Math.PI / 2]), cyl('#333', -.62, .2, -.6, .22, .22, .12, [0, 0, Math.PI / 2])], 0.04);
  }

  setSide() { super.setSide(); this.dyn = []; }

  make(id, i) {
    const S = MINE_SLOTS[id], [x, z] = slot(S, i), root = new THREE.Group();
    root.position.set(x, 0, z);
    let w;
    if (id === 'teammine') {
      const rigs = [];
      for (let k = 0; k < 3; k++) {
        const rg = new Rig('jack', true); rg.baseScale = 0.9; rg.root.position.set((k - 1) * 1.1, 0, k === 1 ? 0.3 : 0); rg.root.rotation.y = Math.PI; rg.mode = 'work'; rg.def = rg.def; root.add(rg.root);
        rg.timer = Math.random(); rigs.push(rg);
      }
      const cart = meshFrom(this.cartGeo, { shadow: false }); cart.position.set(2.2, 0, 0.4); root.add(cart);
      const ore = meshFrom(this.oreGeo, { shadow: false }); ore.position.set(0, 0, -1.3); ore.scale.setScalar(1.3); root.add(ore);
      w = { root, rigs };
      rigs.forEach((rg) => { rg.onHit = () => { this.fx.burst(root.position.x + (rg.root.position.x), 1.0, root.position.z - 1.1, 6, { speed: 4, size: 0.2, color: ['#ffd54a', '#ffffff'], life: 0.35 }); this.stage.sfx('pick', 0.5); }; });
    } else {
      const rig = new Rig(id, true); rig.root.rotation.y = Math.PI; rig.mode = 'work'; root.add(rig.root);
      const ore = meshFrom(this.oreGeo, { shadow: false }); ore.position.set(0, 0, id === 'robinson' ? -1.9 : -1.4); root.add(ore);
      w = { root, rig, id };
      if (id === 'jack') rig.onHit = () => { this.fx.burst(root.position.x, 1.0, root.position.z - 1.2, 5, { speed: 4, size: 0.2, color: ['#ffd54a', '#ffffff'], life: 0.35 }); this.stage.sfx('pick', 0.5); };
      if (id === 'gary') {
        const crate = meshFrom(this.crateGeo, { shadow: false }); crate.position.set(1.2, 0, 0.3); root.add(crate);
        rig.onHit = () => this.throwDynamite(root);
      }
      if (id === 'robinson') rig.dust = 0;
    }
    return w;
  }

  throwDynamite(root) {
    const a = new THREE.Vector3(root.position.x, 1.8, root.position.z - 0.4), b = new THREE.Vector3(root.position.x, 0.8, root.position.z - 3.2);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.4, 6), new THREE.MeshBasicMaterial({ color: 0xd43a2f }));
    this.scene.add(mesh); this.dyn.push({ mesh, a, b, t: 0, dur: 0.7 });
  }

  /** Coins + number when income arrives (event 'inc' for my side). */
  income(amount) {
    const st = this.stage, list = Object.values(this.workers).flat();
    const n = Math.min(14, 2 + Math.floor(amount / 4));
    for (let i = 0; i < n; i++) {
      const w = list.length ? list[(Math.random() * list.length) | 0] : { root: { position: { x: 0, z: 0 } } };
      this.fx.emit({ x: w.root.position.x + (Math.random() - 0.5), y: 1.8, z: w.root.position.z, vx: (Math.random() - 0.5) * 2, vy: 6 + Math.random() * 3, vz: (Math.random() - 0.5), life: 1.0, size: 0.32, size1: 0.2, color: '#ffd54a', gravity: 12 });
    }
    st.floatText('mine', { x: st.size.mine.w * (0.3 + Math.random() * 0.4), y: st.size.mine.h * 0.25 }, '+' + amount, 'coin');
    st.sfx('coin', 0.6);
  }

  handle(events, view, my) { for (const e of events) if (e.e === 'inc' && e.s === my && e.a > 0) this.income(e.a); }

  update(dt, view, my) {
    this.t += dt; this.shake = Math.max(0, this.shake - dt * 5);
    const me = view.players[my];
    for (const id of ['jack', 'robinson', 'gary', 'teammine']) this.sync(id, me.owned[id] || 0, (i) => this.make(id, i));
    for (const id in this.workers) for (const w of this.workers[id]) {
      this.popScale(w, dt);
      if (w.rigs) w.rigs.forEach((rg) => rg.update(dt));
      else {
        w.rig.update(dt);
        if (w.id === 'robinson') { w.rig.dust -= dt; if (w.rig.dust <= 0) { w.rig.dust = 0.12; this.puff.emit({ x: w.root.position.x + (Math.random() - 0.5), y: 0.6, z: w.root.position.z - 2.0, vy: 1.2, vx: (Math.random() - 0.5) * 2, vz: -1, life: 0.9, size: 0.3, size1: 1.1, color: '#b89a7a' }); if (Math.random() < 0.25) this.stage.sfx('drill', 0.4); } }
      }
    }
    for (let i = this.dyn.length - 1; i >= 0; i--) {
      const d = this.dyn[i]; d.t += dt; const k = Math.min(1, d.t / d.dur);
      d.mesh.position.lerpVectors(d.a, d.b, k); d.mesh.position.y += Math.sin(k * Math.PI) * 2.2; d.mesh.rotation.x += dt * 12;
      if (Math.random() < 0.5) this.fx.emit({ x: d.mesh.position.x, y: d.mesh.position.y + 0.3, z: d.mesh.position.z, vy: 1, life: 0.2, size: 0.15, color: '#ffb347' });
      if (k >= 1) {
        this.scene.remove(d.mesh); d.mesh.geometry.dispose(); d.mesh.material.dispose(); this.dyn.splice(i, 1);
        const p = d.b; this.shake = 0.9; this.stage.sfx('boom', 0.8);
        this.fx.burst(p.x, 1, p.z, 40, { speed: 9, size: 0.55, color: ['#ffb347', '#ff5a2a', '#fff2a0'], life: 0.8, gravity: 6 });
        this.fx.burst(p.x, 1, p.z, 18, { speed: 7, size: 0.3, color: ['#ffd54a', '#58e0ff'], life: 1.0, gravity: 12 });
        this.puff.burst(p.x, 0.8, p.z, 10, { speed: 3, size: 0.8, size1: 2.4, color: '#7a6a5a', life: 1.2, gravity: -0.5 });
      }
    }
    this.dustT -= dt;
    if (this.dustT <= 0) { this.dustT = 0.1; this.puff.emit({ x: (Math.random() - 0.5) * 14, y: 0.5 + Math.random() * 5, z: -Math.random() * 24, vx: 0.2, vy: 0.1, life: 5, size: 0.08, size1: 0.08, color: '#9a8a78' }); }
    this.lamps.forEach((l, i) => { l.intensity = 38 + Math.sin(this.t * 7 + i * 2) * 4; });
    this.fx.update(dt); this.puff.update(dt);
  }

  fit(aspect) { fitCam(this.camera, aspect, 0, -7, 7.2, 12.5, 58, this.shake); }
}

// ===================================================================== FORGE
const ANVILS = { sam: [-4.2, 0, 0], bill: [4.2, 0, 0] };
const SMITH_SLOTS = [[0, 1.9], [-2.1, 0.9], [2.1, 0.9], [-2.4, -1.4], [2.4, -1.4]];
const CIRCLE = [0, 0, -8.2];

export class ForgeScene extends WorkScene {
  constructor(stage) {
    super(stage, '#24160f', [30, 70]);
    const sc = this.scene;
    sc.add(new THREE.HemisphereLight('#ffe3c0', '#3a2515', 1.1));
    const key = new THREE.DirectionalLight('#ffe8c8', 1.5); key.position.set(-5, 15, 14); sc.add(key);
    this.fire = new THREE.PointLight('#ff7a2a', 60, 26, 2); this.fire.position.set(-7, 2.5, -11); sc.add(this.fire);
    this.arc = new THREE.PointLight('#a07bff', 20, 14, 2); this.arc.position.set(0, 2.5, -8); sc.add(this.arc);
    this.build();
  }

  build() {
    const sc = this.scene;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshLambertMaterial({ color: '#7a5535' }));
    floor.rotation.x = -Math.PI / 2; floor.position.z = -4; sc.add(floor);
    const s = [];
    // walls
    s.push(box('#8a7f74', 0, 4, -14.5, 30, 8, 1), box('#7a7068', -13.5, 4, -4, 1, 8, 24), box('#7a7068', 13.5, 4, -4, 1, 8, 24));
    for (let i = -5; i <= 5; i++) s.push(box('#9a8f84', i * 2.6, 3 + (i % 2) * 0.1, -13.9, 2.4, .5, .2));
    // furnace
    s.push(box('#6b625a', -7, 1.6, -12, 3.2, 3.2, 2.4), box('#4a423c', -7, 3.6, -12, 2.4, 1.6, 1.8), box('#5a524a', -7, 5.4, -12, 1.2, 2.4, 1.2), glow(box('#ff7a1a', -7, 1.2, -10.7, 1.7, 1.2, .1)), glow(box('#ffd23a', -7, 1.0, -10.65, 1.0, .6, .1)));
    // arch window
    s.push(glow(box('#ffb36b', 5, 5, -13.9, 1.6, 2.6, .1)), box('#5a4a3a', 5, 6.4, -13.8, 2.2, .3, .3));
    // weapon rack
    s.push(box('#6a4526', 8, 2, -13.5, 4.4, .25, .4), box('#6a4526', 8, 3.8, -13.5, 4.4, .25, .4), box('#6a4526', 6, 2.8, -13.5, .25, 3.4, .4), box('#6a4526', 10, 2.8, -13.5, .25, 3.4, .4));
    for (let i = 0; i < 5; i++) s.push(box('#e6edf5', 6.6 + i * .7, 3.2, -13.3, .12, 1.5, .06, [0, 0, 0.04 * (i - 2)]), box('#c9a227', 6.6 + i * .7, 2.5, -13.3, .35, .08, .1));
    // bookshelf + books
    s.push(box('#6a4526', -12.8, 3, -4, .8, 6, 5), box('#5a3a1e', -12.7, 1.5, -4, .9, .2, 5.2), box('#5a3a1e', -12.7, 3.2, -4, .9, .2, 5.2), box('#5a3a1e', -12.7, 4.9, -4, .9, .2, 5.2));
    const bc = ['#b5413a', '#3d6ab5', '#4f9a3b', '#c9a227', '#6a3fb5'];
    for (let i = 0; i < 18; i++) for (const y of [2.1, 3.8, 5.5]) if ((i + y * 7) % 3 !== 0) s.push(box(bc[(i + Math.floor(y)) % 5], -12.5, y, -6.3 + i * .27, .5, 1.1, .2));
    // flask table
    s.push(box('#6a4526', 11.5, 1.2, -5, 2, .3, 3.4), box('#5a3a1e', 11.5, .6, -5, 1.8, 1.2, 3.2));
    for (let i = 0; i < 4; i++) s.push(glow(sph(['#ff6bd5', '#58e0ff', '#7dff8a', '#ffd23a'][i], 11.3, 1.75, -6.1 + i * .8, .28)), cyl('#bfe6ff', 11.3, 1.5, -6.1 + i * .8, .1, .18, .3));
    sc.add(meshFrom(build(s, 0.05), { shadow: false }));
    // anvils
    const anv = build([box('#3a3d46', 0, .5, 0, .8, 1.0, .8), box('#4a4e58', 0, 1.1, 0, 1.6, .3, .7), cone('#4a4e58', 1.1, 1.1, 0, .3, .7, [0, 0, -Math.PI / 2]), box('#6a4526', 0, .1, 0, 1.2, .2, 1.2)], 0.05);
    for (const id in ANVILS) { const m = meshFrom(anv, { shadow: false }); m.position.set(...ANVILS[id]); sc.add(m); }
    // magic circle
    const g = new THREE.Group(); g.position.set(...CIRCLE); g.position.y = 0.06;
    this.circleMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#a07bff').multiplyScalar(1.6), transparent: true, opacity: 0.9 });
    const ring = new THREE.Mesh(new THREE.RingGeometry(3.0, 3.25, 40), this.circleMat), ring2 = new THREE.Mesh(new THREE.RingGeometry(2.0, 2.1, 40), this.circleMat);
    ring.rotation.x = ring2.rotation.x = -Math.PI / 2; g.add(ring, ring2);
    for (let i = 0; i < 3; i++) { const bar = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 5.2), this.circleMat); bar.rotation.x = -Math.PI / 2; bar.rotation.z = (i * Math.PI) / 3; bar.position.y = 0.01; g.add(bar); }
    this.circle = g; sc.add(g);
    this.flame = meshFrom(build([glow(cone('#ff7a1a', 0, 0, 0, .7, 1.6)), glow(cone('#ffd23a', .2, -.1, .1, .4, 1.1))], 0.01), { shadow: false });
    this.flame.position.set(-7, 1.4, -10.9); sc.add(this.flame);
    this.sparkGeo = null; this.castT = 0; this.castKind = null;
  }

  make(id, i) {
    const root = new THREE.Group();
    let x, z, face;
    if (id === 'ezra') {
      const a = Math.PI / 2 + (i / 5) * Math.PI * 2 + 0.3; x = CIRCLE[0] + Math.cos(a) * 3.0; z = CIRCLE[2] + Math.sin(a) * 3.0; face = Math.atan2(CIRCLE[0] - x, CIRCLE[2] - z);
    } else {
      const A = ANVILS[id], sl = SMITH_SLOTS[i % 5]; x = A[0] + sl[0]; z = A[2] + sl[1]; face = Math.atan2(A[0] - x, A[2] - z);
    }
    root.position.set(x, 0, z); root.rotation.y = face;
    const rig = new Rig(id, true); rig.mode = id === 'ezra' ? 'idle' : 'work'; root.add(rig.root);
    const w = { root, rig, id };
    if (id !== 'ezra') rig.onHit = () => {
      const A = ANVILS[id]; this.fx.burst(A[0], 1.4, A[2], 10, { speed: 5, size: 0.2, color: ['#ffd23a', '#ff8a3a', '#ffffff'], life: 0.45, gravity: 8 });
      this.stage.sfx('pick', 0.4);
    };
    return w;
  }

  handle(events, view, my) {
    for (const e of events) {
      if (e.e === 'warn' && e.s === my) {
        this.castT = e.dur; this.castKind = e.k;
        for (const w of this.workers.ezra || []) w.rig.cast = e.dur;
        this.stage.sfx('warn', 0.5);
      } else if (e.e === 'spell' && e.s === my) {
        const col = { fire: ['#ff7a1a', '#ffd23a'], water: ['#4aa8ff', '#bfe6ff'], zap: ['#fff27a', '#ffffff'] }[e.k];
        for (const w of this.workers.ezra || []) this.fx.burst(w.root.position.x, 3, w.root.position.z, 18, { speed: 5, size: 0.3, color: col, life: 0.8, gravity: -2 });
        this.fx.burst(CIRCLE[0], 0.5, CIRCLE[2], 40, { speed: 7, size: 0.35, color: col, life: 1.0, gravity: -3, spread: 3 });
        this.castT = 0;
      }
    }
  }

  update(dt, view, my) {
    this.t += dt; this.shake = 0;
    const me = view.players[my];
    for (const id of ['sam', 'bill', 'ezra']) this.sync(id, me.owned[id] || 0, (i) => this.make(id, i));
    for (const id in this.workers) for (const w of this.workers[id]) { this.popScale(w, dt); w.rig.update(dt); }
    if (this.castT > 0) {
      this.castT -= dt;
      this.fx.emit({ x: CIRCLE[0] + (Math.random() - 0.5) * 5, y: 0.2, z: CIRCLE[2] + (Math.random() - 0.5) * 5, vy: 3, life: 1.0, size: 0.22, size1: 0, color: { fire: '#ff7a1a', water: '#4aa8ff', zap: '#fff27a' }[this.castKind] || '#a07bff' });
    }
    const idle = (me.owned.ezra || 0) > 0;
    this.circleMat.opacity = (idle ? 0.55 : 0.2) + (this.castT > 0 ? 0.4 : 0.1) * (0.6 + Math.sin(this.t * 8) * 0.4);
    this.circle.rotation.y += dt * (this.castT > 0 ? 1.6 : 0.2);
    this.fire.intensity = 55 + Math.sin(this.t * 13) * 6 + Math.sin(this.t * 7.3) * 4;
    this.arc.intensity = 8 + (idle ? 6 : 0) + (this.castT > 0 ? 30 : 0);
    this.flame.scale.y = 1 + Math.sin(this.t * 15) * 0.15;
    if (Math.random() < dt * 8) this.fx.emit({ x: -7 + (Math.random() - 0.5), y: 3.6, z: -10.5, vy: 2.5, vx: (Math.random() - 0.5), life: 1.0, size: 0.18, size1: 0, color: '#ff9a3a', gravity: -1 });
    this.fx.update(dt); this.puff.update(dt);
  }

  fit(aspect) { fitCam(this.camera, aspect, 0, -4.5, 8.5, 9.5, 56, 0); }
}
