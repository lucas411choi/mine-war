/**
 * Procedural low-poly stylized models (no asset files needed).
 *  - Rig: humanoid / horse / tank / plane characters built from merged parts (body, armR, armL, legL, legR)
 *    with squash & stretch, walk, swing, hit-react animation.
 *  - buildTower(): four main-tower designs (crystal / iron / flame / vein) + hidden (unrevealed) one.
 * A GLB listed in config/assets.js replaces a model (see loadModelOverrides).
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { box, sph, cyl, cone, hemi, oct, glow, build, cachedBuild, meshFrom, COL, teamCol, teamColD } from './gfx.js';
import { ASSETS } from '../config/assets.js';
import { BOW, bowPoints } from './archerGeom.js';

// ------------------------------------------------------------------ GLB overrides
const GLB = new Map();
export async function loadModelOverrides() {
  const entries = Object.entries(ASSETS.models || {});
  if (!entries.length) return;
  const loader = new GLTFLoader();
  await Promise.all(entries.map(async ([id, o]) => {
    try { const g = await loader.loadAsync(o.url); GLB.set(id, { scene: g.scene, scale: o.scale || 1, y: o.y || 0 }); }
    catch (e) { console.warn('GLB load failed', id, e); }
  }));
}

// ------------------------------------------------------------------ weapons / hats
const hats = (kind, c) => {
  switch (kind) {
    case 'helm': return [hemi('#b9c2cc', 0, 1.55, 0, .45), box('#8d97a3', 0, 1.62, .3, .1, .5, .1), cone(c, 0, 2.12, -.05, .14, .55)];
    case 'hard': return [hemi('#f2c230', 0, 1.58, 0, .44), cyl('#f2c230', 0, 1.58, 0, .54, .54, .07), glow(sph('#fff2a0', 0, 1.82, .4, .1))];
    case 'hood': return [cone(c, 0, 1.95, -.05, .5, .8), box('#2f5a22', 0, 1.5, -.32, .7, .6, .15)];
    case 'cap': return [hemi(c, 0, 1.58, 0, .44), box(c, 0, 1.6, .42, .5, .06, .3)];
    case 'bandana': return [cyl(c, 0, 1.74, 0, .42, .42, .16), box(c, 0, 1.62, -.4, .15, .3, .1)];
    case 'wiz': return [cyl('#5b34a6', 0, 1.78, 0, .78, .78, .07), cone('#6a3fb5', 0, 2.4, 0, .46, 1.1), box('#ffd54a', 0, 1.86, 0, .8, .06, .8)];
    case 'goggle': return [hemi('#d97a1e', 0, 1.58, 0, .44), box('#222', 0, 1.58, .4, .8, .14, .06), sph('#7fd4ff', .2, 1.58, .44, .11), sph('#7fd4ff', -.2, 1.58, .44, .11)];
    default: return [];
  }
};
const W = {
  sword: [box('#6b4a2a', 0, -.52, 0, .08, .16, .08), box('#c9a227', 0, -.62, 0, .36, .07, .1), box('#e6edf5', 0, -1.1, 0, .1, .9, .04)],
  lance: [box('#8a5a2b', 0, -.9, 0, .07, 1.6, .07), cone('#e6edf5', 0, -1.8, 0, .1, .35, [Math.PI, 0, 0])],
  pick: [box(COL.wood, 0, -.85, 0, .08, .8, .08), box('#9aa4b0', 0, -1.25, 0, .62, .1, .12), box('#9aa4b0', .3, -1.2, 0, .12, .22, .1)],
  hammer: [box(COL.wood, 0, -.8, 0, .08, .7, .08), box('#6b7280', 0, -1.2, 0, .36, .28, .28)],
  staff: [box(COL.wood, 0, -.9, 0, .07, 1.2, .07), glow(sph('#9a7bff', 0, -1.58, 0, .17))],
  dyn: [box('#d43a2f', -.07, -.62, 0, .1, .34, .1), box('#d43a2f', .07, -.62, 0, .1, .34, .1), box('#d43a2f', 0, -.62, .09, .1, .34, .1), glow(sph('#ffb347', 0, -.85, 0, .06))],
  shield: (c) => [cyl(c, -.15, -.35, .05, .38, .38, .08, [0, 0, Math.PI / 2]), cyl('#f2c230', -.2, -.35, .05, .12, .12, .1, [0, 0, Math.PI / 2])],
  tower: [cyl('#8d97a3', -.15, -.35, .05, .45, .45, .1, [0, 0, Math.PI / 2]), cyl('#3d7bff', -.2, -.35, .05, .2, .2, .1, [0, 0, Math.PI / 2])],
};

function human(o) {
  const T = o.team, sk = o.skin || COL.skin, tor = o.torso || T, leg = o.legs || '#4b3b2e', slv = o.sleeve || tor;
  const body = [
    box(tor, 0, .92, 0, .64, .56, .42), box(o.belt || '#3a2a1c', 0, .64, 0, .68, .1, .46),
    sph(sk, 0, 1.52, 0, .4), sph('#1b1b1b', .14, 1.55, .38, .06, undefined, { noOut: true }), sph('#1b1b1b', -.14, 1.55, .38, .06, undefined, { noOut: true }),
    ...(o.bodyExtra || []), ...hats(o.hat, o.hatC || T),
  ];
  const arm = [box(slv, 0, -.2, 0, .2, .46, .2), sph(sk, 0, -.48, 0, .12)];
  const legS = [box(leg, 0, -.22, 0, .22, .44, .24), box('#2b2018', 0, -.46, .05, .26, .12, .34)];
  return {
    scale: o.scale || 1, style: o.style || 'sword', rest: o.rest ?? -1.3, restL: o.restL, from: o.from ?? -2.9, to: o.to ?? -0.4, period: o.period || 0,
    swingDur: o.swingDur || 0.35, walkSpeed: o.walkSpeed || 9, headY: 2.55 * (o.scale || 1),
    parts: {
      body: { at: [0, 0, 0], specs: body },
      legL: { at: [.17, .5, 0], specs: legS }, legR: { at: [-.17, .5, 0], specs: legS },
      armR: { at: [.43, 1.08, 0], specs: [...arm, ...(o.weaponR || [])] },
      armL: { at: [-.43, 1.08, 0], specs: [...arm, ...(o.weaponL || [])] },
    },
  };
}

// ------------------------------------------------------------------ archer (Kelly): bow held the right way round
const seg = (c, [x0, y0], [x1, y1], th, o) => ({ g: new THREE.BoxGeometry(Math.hypot(x1 - x0, y1 - y0), th, th), c, p: [(x0 + x1) / 2, (y0 + y1) / 2, 0], r: [0, 0, Math.atan2(y1 - y0, x1 - x0)], ...o });
function bowSpecs() {
  const sp = [box('#5a3a1e', 0, BOW.gripY, 0, 0.26, 0.11, 0.11, undefined, { tag: 'grip' })];
  const L = BOW.limb;
  for (const sx of [1, -1]) for (let i = 0; i < L.length - 1; i++) {
    sp.push(seg('#8a5a2b', [sx * L[i][0], L[i][1]], [sx * L[i + 1][0], L[i + 1][1]], i ? 0.08 : 0.1));
  }
  sp.push(sph('#e6d7a8', BOW.tipX, BOW.tipY, 0, 0.055, undefined, { tag: 'tipU', noOut: true }), sph('#e6d7a8', -BOW.tipX, BOW.tipY, 0, 0.055, undefined, { tag: 'tipL', noOut: true }));
  return sp;
}
function arrowSpecs(team) {
  const P = bowPoints(0);
  return [
    box('#c9a46a', 0, -BOW.arrowLen / 2, 0, 0.035, BOW.arrowLen, 0.035, undefined, { noOut: true, tag: 'shaft' }),
    cone('#d7dee6', 0, P.arrowTip[1] - BOW.tipY, 0, 0.07, BOW.arrowTipLen, [Math.PI, 0, 0], { noOut: true, tag: 'arrowTip' }),
    box(team, 0, -0.13, 0, 0.16, 0.2, 0.012, undefined, { noOut: true, tag: 'fletch' }), box(team, 0, -0.13, 0, 0.012, 0.2, 0.16, undefined, { noOut: true, tag: 'fletch' }),
  ];
}
function archer(T) {
  const sk = COL.skin, tor = '#4f9a3b', sleeve = [box(tor, 0, -.2, 0, .2, .46, .2)];
  const body = [
    box(tor, 0, .92, 0, .64, .56, .42), box('#3a2a1c', 0, .64, 0, .68, .1, .46), box(T, 0, .95, .22, .66, .12, .04),
    box('#6b4a2a', -.15, 1.0, -.3, .18, .55, .14, [.2, 0, 0]), box(T, -.15, 1.3, -.3, .12, .1, .12),
  ];
  const head = [sph(sk, 0, 0, 0, .4), sph('#1b1b1b', .14, .03, .38, .06, undefined, { noOut: true }), sph('#1b1b1b', -.14, .03, .38, .06, undefined, { noOut: true }),
    cone('#3f8a2f', 0, .43, -.05, .5, .8), box('#2f5a22', 0, -.02, -.32, .7, .6, .15)];
  const leg = [box('#4b3b2e', 0, -.22, 0, .22, .44, .24), box('#2b2018', 0, -.46, .05, .26, .12, .34)];
  const strSpec = [box('#f4f4ee', BOW.tipX / 2, 0, 0, BOW.tipX, 0.02, 0.02, undefined, { noOut: true, tag: 'string' })];
  return {
    scale: 1, style: 'bow', bow: BOW, swingDur: 0.45, walkSpeed: 9, headY: 2.6, period: 0,
    parts: {
      body: { at: [0, 0, 0], specs: body },
      head: { at: [0, 1.52, 0], specs: head },
      legL: { at: [.17, .5, 0], specs: leg }, legR: { at: [-.17, .5, 0], specs: leg },
      // armR (+x side) holds the bow with the arm extended; armL (-x side) draws the string
      armR: { at: [.43, 1.08, 0], specs: [...sleeve, sph(sk, 0, -BOW.armReach, 0, .12)] },
      armL: { at: [-.43, 1.08, 0], specs: sleeve },
      hand: { parent: 'armL', at: [0, -BOW.armReach, 0], specs: [sph(sk, 0, 0, 0, .12)] },
      bow: { parent: 'armR', at: [0, 0, 0], specs: bowSpecs() },
      strU: { parent: 'bow', at: [BOW.tipX, BOW.tipY, 0], specs: strSpec },
      strL: { parent: 'bow', at: [-BOW.tipX, BOW.tipY, 0], specs: strSpec },
      arrow: { parent: 'bow', at: [0, BOW.tipY, 0], specs: arrowSpecs(T) },
    },
  };
}

// ------------------------------------------------------------------ rig definitions (T = team color)
const RIGS = {
  tim: (T) => human({ team: T, hat: 'helm', weaponR: W.sword, weaponL: W.shield(T), torso: T }),
  kelly: (T) => archer(T),
  jack: (T) => human({ team: T, torso: '#b9783a', sleeve: '#b9783a', hat: 'hard', weaponR: W.pick, period: 0.9, from: -3.0, to: -0.5, legs: '#3f5a85' }),
  gary: (T) => human({ team: T, torso: '#c04a3a', sleeve: '#c04a3a', hat: 'bandana', hatC: '#222', weaponR: W.dyn, period: 5, style: 'dyn', from: -3.0, to: -0.4, swingDur: 0.6, legs: '#333',
    bodyExtra: [box('#d43a2f', 0, .95, .24, .5, .1, .06), box('#ffd54a', 0, .95, .26, .5, .04, .04)] }),
  sam: (T) => human({ team: T, torso: '#c8623a', sleeve: '#c8623a', skin: '#e8b48a', hat: 'bandana', hatC: '#c0392b', weaponR: W.hammer, period: 1.1, from: -2.9, to: -0.7, legs: '#5a4636',
    bodyExtra: [box('#6b4528', 0, .85, .23, .52, .62, .06), box('#5a3a1e', 0, 1.2, .34, .34, .22, .14)] }),
  bill: (T) => human({ team: T, torso: '#3d6ab5', sleeve: '#3d6ab5', skin: '#e8b48a', hat: 'cap', hatC: '#2a4a85', weaponR: W.hammer, weaponL: W.tower, period: 1.3, from: -2.9, to: -0.7, legs: '#4a4a55', restL: -0.5,
    bodyExtra: [box('#5a6272', 0, .85, .23, .52, .62, .06)] }),
  ezra: (T) => {
    const d = human({ team: T, torso: '#6a3fb5', sleeve: '#6a3fb5', hat: 'wiz', weaponR: W.staff, style: 'staff', rest: -1.0, from: -2.7, to: -2.2, period: 0, legs: '#3a2a5a',
      bodyExtra: [cone('#6a3fb5', 0, .62, 0, .62, 1.1), box('#f1f1f1', 0, 1.2, .34, .3, .35, .14)] });
    return d;
  },
  robinson: (T) => {
    const d = human({ team: T, torso: '#e08a1e', sleeve: '#e08a1e', hat: 'goggle', style: 'drill', legs: '#3a3a3a', rest: -1.4,
      bodyExtra: [box('#d28a1e', 0, .55, .75, .8, .6, 1.0), cyl('#555', .3, .25, .75, .22, .22, .12, [0, 0, Math.PI / 2]), cyl('#555', -.3, .25, .75, .22, .22, .12, [0, 0, Math.PI / 2]), glow(sph('#ffdf6b', 0, .95, 1.15, .08))] });
    d.parts.armR.specs.push(cone('#b8bec8', 0, -.9, 0, .2, .75, [Math.PI, 0, 0]), cone('#8d95a2', 0, -.6, 0, .26, .4, [Math.PI, 0, 0]));
    return d;
  },
  kimmy: (T) => {
    const horse = '#8b5a2b', hd = '#6e451f', sk = COL.skin;
    const body = [
      box(horse, 0, .95, 0, .7, .62, 1.5), box(horse, 0, 1.4, .8, .3, .7, .35, [.5, 0, 0]), box(horse, 0, 1.68, 1.15, .3, .32, .5), box('#2b1a10', 0, 1.55, .6, .1, .55, .5), cone('#2b1a10', 0, 1.2, -.85, .14, .7, [-2.4, 0, 0]),
      box(T, 0, 1.3, -.05, .62, .1, .72), box(T, 0, 1.68, -.05, .5, .52, .36), sph(sk, 0, 2.17, -.05, .33), hemi('#b9c2cc', 0, 2.2, -.05, .36), cone(T, 0, 2.6, -.05, .12, .5),
      sph('#1b1b1b', .1, 2.2, .27, .05, undefined, { noOut: true }), sph('#1b1b1b', -.1, 2.2, .27, .05, undefined, { noOut: true }),
    ];
    const legs = [box(hd, 0, -.3, .55, .18, .65, .18), box(hd, 0, -.3, -.55, .18, .65, .18), box('#222', 0, -.62, .55, .2, .1, .22), box('#222', 0, -.62, -.55, .2, .1, .22)];
    return {
      scale: 1.05, headY: 3.3, style: 'horse', rest: -1.5, from: -1.5, to: -1.5, period: 0, swingDur: 0.3, walkSpeed: 14,
      parts: {
        body: { at: [0, 0, 0], specs: body },
        legL: { at: [.22, .66, 0], specs: legs }, legR: { at: [-.22, .66, 0], specs: legs },
        armR: { at: [.3, 1.85, 0], specs: [box('#f2c230', 0, -.05, .0, .2, .2, .2), ...W.lance] },
        armL: { at: [-.34, 1.7, 0], specs: [cyl(T, -.15, -.2, .1, .34, .34, .08, [0, 0, Math.PI / 2]), cyl('#f2c230', -.2, -.2, .1, .1, .1, .1, [0, 0, Math.PI / 2])] },
      },
    };
  },
  galion: (T) => {
    const hull = '#6b7a4b';
    const body = [
      box(hull, 0, .75, 0, 1.5, .7, 2.2), box('#566338', 0, 1.15, -.2, 1.3, .15, 1.5), box(T, 0, .78, 1.12, 1.52, .5, .08), cyl('#5b6a3f', 0, 1.4, -.1, .62, .7, .45),
      sph(COL.skin, .0, 1.88, -.35, .26), hemi('#4f5a35', 0, 1.9, -.35, .3), box('#222', 0, 1.9, -.1, .4, .08, .05),
      box('#444', 0, 1.5, -.75, .8, .15, .3), box(T, .62, 1.55, -.1, .06, .4, .6),
    ];
    const tread = [box('#2f2f33', 0, 0, 0, .45, .8, 2.5), sph('#555', 0, 0, .85, .32, [.5, 1, 1]), sph('#555', 0, 0, -.85, .32, [.5, 1, 1]), sph('#555', 0, 0, 0, .3, [.5, 1, 1])];
    return {
      scale: 1.35, headY: 3.4, style: 'tank', rest: 0, from: 0, to: 0, swingDur: 0.5, walkSpeed: 6,
      parts: {
        body: { at: [0, 0, 0], specs: body },
        legL: { at: [.95, .42, 0], specs: tread }, legR: { at: [-.95, .42, 0], specs: tread },
        armR: { at: [0, 1.42, .5], specs: [cyl('#3a3a3f', 0, 0, .8, .13, .13, 1.7, [Math.PI / 2, 0, 0]), cyl('#2a2a2e', 0, 0, 1.65, .2, .2, .25, [Math.PI / 2, 0, 0])] },
        armL: { at: [0, 0, 0], specs: [] },
      },
    };
  },
  sammy: (T) => {
    const body = [
      sph(T, 0, 0, 0, .6, [.9, .85, 2.3]), sph('#9fe3ff', 0, .42, .35, .34, [1, .8, 1.3], { noOut: true }), sph(COL.skin, 0, .6, .3, .22),
      box('#222', 0, .62, .46, .5, .1, .05), box(teamColD(T === COL.blue), 0, .05, .1, 3.4, .1, .85), box('#f1f1f1', 0, .05, .1, 3.4, .11, .3),
      box(T, 0, .5, -1.2, .1, .75, .55), box(T, 0, .1, -1.25, 1.4, .08, .4), cone('#f2c230', 0, 0, 1.45, .3, .45, [Math.PI / 2, 0, 0]),
      sph('#222', .55, -.5, .35, .17, [.5, 1, 1]), sph('#222', -.55, -.5, .35, .17, [.5, 1, 1]),
    ];
    return {
      scale: 1.0, headY: 1.5, style: 'plane', rest: 0, from: 0, to: 0, swingDur: 0.4, walkSpeed: 6,
      parts: {
        body: { at: [0, 0, 0], specs: body },
        legL: { at: [0, 0, 0], specs: [] }, legR: { at: [0, 0, 0], specs: [] },
        armL: { at: [0, 0, 1.7], specs: [box('#2a2a2a', 0, 0, 0, 1.7, .12, .06), box('#2a2a2a', 0, 0, 0, .12, 1.7, .06)] },
        armR: { at: [0, -.2, 1.3], specs: [glow(sph('#ffdf6b', 0, 0, .3, .22)), glow(sph('#ffffff', 0, 0, .35, .12))] },
      },
    };
  },
};
RIGS.teammine = RIGS.jack;

const defCache = new Map();
const _v = new THREE.Vector3(), _dir = new THREE.Vector3(), _sh = new THREE.Vector3(-.43, 1.08, 0), _down = new THREE.Vector3(0, -1, 0);
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _eu = new THREE.Euler();
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (s) => 1 - (1 - s) * (1 - s);

export class Rig {
  constructor(id, mine) {
    const T = teamCol(mine), key = id + (mine ? '_m' : '_e');
    let def = defCache.get(key);
    if (!def) { def = RIGS[id](T); defCache.set(key, def); }
    this.id = id; this.def = def; this.p = {};
    this.root = new THREE.Group(); this.pivot = new THREE.Group(); this.root.add(this.pivot);
    this.t = Math.random() * 10; this.swing = -1; this.mode = 'idle'; this.hurt = 0; this.cast = 0; this.stance = 0; this.elev = 0; this.elevCur = 0; this.released = true; this.onRelease = null;
    this.timer = Math.random() * (def.period || 1); this.hitDone = true; this.onHit = null; this.baseScale = def.scale || 1;
    const glb = GLB.get(id);
    if (glb) { const m = glb.scene.clone(true); m.scale.setScalar(glb.scale); m.position.y = glb.y; this.pivot.add(m); }
    else {
      for (const name in def.parts) {
        const part = def.parts[name], g = new THREE.Group();
        g.position.set(...part.at);
        if (part.specs.length) g.add(meshFrom(cachedBuild(key + ':' + name, () => part.specs, def.thick || 0.05), { shadow: name === 'body' }));
        (part.parent ? this.p[part.parent] : this.pivot).add(g); this.p[name] = g; // parent parts follow their parent's pose
      }
    }
    this.pivot.scale.setScalar(this.baseScale);
  }

  /** Trigger a one-shot attack/work swing. */
  doSwing() { this.swing = 0; this.hitDone = true; this.released = false; }
  doHurt() { this.hurt = 0.2; }

  update(dt) {
    this.t += dt;
    const t = this.t, d = this.def, p = this.p, m = this.mode, sc = this.baseScale;
    if (!p.body) { this.pivot.position.y = Math.sin(t * 2) * 0.05; return; }
    if (this.swing >= 0) { this.swing += dt / d.swingDur; if (this.swing >= 1) this.swing = -1; }
    if (d.period && m === 'work') {
      this.timer -= dt;
      if (this.timer <= 0) { this.timer = d.period * (0.9 + Math.random() * 0.2); this.swing = 0; this.hitDone = false; }
      if (this.swing >= 0.55 && !this.hitDone) { this.hitDone = true; if (this.onHit) this.onHit(this); }
    }
    const s = this.swing, e = s < 0 ? 0 : ease(s), sinS = s < 0 ? 0 : Math.sin(s * Math.PI);
    const walk = m === 'move' ? Math.sin(t * d.walkSpeed) : 0;
    p.body.position.y = m === 'move' ? Math.abs(walk) * 0.08 : Math.sin(t * 2.2) * 0.025;
    let sq = sinS * 0.1 + (m === 'move' ? Math.sin(t * d.walkSpeed * 2) * 0.03 : 0);
    if (this.hurt > 0) { this.hurt -= dt; sq -= (this.hurt / 0.2) * 0.18; }
    this.pivot.scale.set(sc * (1 + sq), sc * (1 - sq), sc * (1 + sq));
    switch (d.style) {
      case 'horse':
        p.legL.rotation.x = walk * 0.9; p.legR.rotation.x = -walk * 0.9;
        p.body.rotation.x = -walk * 0.04; p.armR.rotation.x = d.rest; p.armR.position.z = sinS * 0.5;
        p.armL.rotation.x = 0; break;
      case 'tank':
        p.body.position.y *= 0.3; p.body.rotation.z = m === 'move' ? Math.sin(t * 12) * 0.01 : 0;
        p.armR.position.z = 0.5 - sinS * 0.55;
        this.elevCur += (this.elev - this.elevCur) * Math.min(1, dt * 8);
        p.armR.rotation.x = -0.6 * this.elevCur; // barrel rises when the target is airborne
        break;
      case 'plane':
        p.armL.rotation.z += dt * 45; p.body.position.y = Math.sin(t * 3) * 0.12;
        p.body.rotation.z = Math.sin(t * 1.6) * 0.08; p.body.rotation.x = sinS * 0.2; p.armR.visible = s >= 0 && s < 0.45; break;
      case 'bow': {
        // side-on archery stance when not marching: body turned so the bow arm points at the enemy, head turned to look at it
        const k = this.stance += ((m === 'move' ? 0 : 1) - this.stance) * Math.min(1, dt * 9), B = d.bow;
        this.pivot.rotation.y = -Math.PI / 2 * k; p.head.rotation.y = Math.PI / 2 * k;
        const bob = m === 'move' ? Math.abs(walk) * 0.08 : Math.sin(t * 2.2) * 0.02;
        p.body.position.y = bob; p.head.position.y = 1.52 + bob;
        p.legL.rotation.x = walk * 0.8 * (1 - k); p.legR.rotation.x = -walk * 0.8 * (1 - k);
        p.armR.rotation.set(lerp(-1.0, 0, k), 0, lerp(0, Math.PI / 2, k));   // carry -> aim (arm along the shoulder line)
        p.bow.rotation.y = lerp(Math.PI / 2, 0, k);                           // carried bow hangs vertical, aimed bow faces forward
        const rel = B.release;
        const pull = s < 0 ? 0 : s < rel ? ease(s / rel) : 0;
        const vib = s >= rel ? Math.sin((s - rel) * 70) * 0.07 * (1 - (s - rel) / (1 - rel)) : 0;   // string twang after release
        if (s >= rel && !this.released) { this.released = true; if (this.onRelease) this.onRelease(this); }
        const dd = pull * B.draw + vib, L = Math.hypot(B.tipX, dd);
        p.strU.rotation.z = Math.atan2(dd, -B.tipX); p.strU.scale.x = L / B.tipX;   // string = two segments tip -> nock
        p.strL.rotation.z = Math.atan2(dd, B.tipX); p.strL.scale.x = L / B.tipX;
        p.arrow.position.y = B.tipY + dd; p.arrow.visible = k > 0.5 && (s < 0 || s < rel);
        // draw hand follows the nock; the arm stretches (not scales the hand) to reach it
        p.armR.updateMatrix();
        _v.set(0, B.tipY + dd, 0).applyMatrix4(p.armR.matrix);
        _dir.copy(_v).sub(_sh); const reachLen = _dir.length();
        const reach = s < 0 ? 0 : s < 0.15 ? s / 0.15 : s < rel ? 1 : Math.max(0, 1 - (s - rel) / (1 - rel));
        _q1.setFromUnitVectors(_down, _dir.normalize());
        _q2.setFromEuler(_eu.set(0.1 + Math.sin(t * 2 + 1) * 0.03, 0, 0));
        p.armL.quaternion.copy(_q2).slerp(_q1, reach);
        p.armL.scale.y = lerp(1, reachLen / B.armReach, reach); p.hand.scale.y = 1 / p.armL.scale.y;
        break;
      }
      default: {
        p.legL.rotation.x = walk * 0.8; p.legR.rotation.x = -walk * 0.8;
        let a = d.rest + (m === 'move' ? -walk * 0.3 : Math.sin(t * 2) * 0.04);
        if (this.cast > 0) { this.cast -= dt; a = -2.9 + Math.sin(t * 8) * 0.08; }
        else if (s >= 0) a = d.from + (d.to - d.from) * e;
        p.armR.rotation.x = a;
        p.armL.rotation.x = d.restL !== undefined ? d.restL : 0.1 + (m === 'move' ? walk * 0.4 : Math.sin(t * 2 + 1) * 0.05);
        p.body.rotation.x = sinS * 0.22;
        if (d.style === 'drill' && m === 'work') { p.armR.position.x = 0.43 + (Math.random() - 0.5) * 0.05; p.body.position.x = (Math.random() - 0.5) * 0.03; }
      }
    }
  }
}

// ------------------------------------------------------------------ towers
const TOWER_STONE = { crystal: ['#9aa8c4', '#7280a0'], iron: ['#8a94a3', '#566070'], flame: ['#a9604a', '#744034'], vein: ['#b59d78', '#85704f'], hidden: ['#80838b', '#5d6068'] };

function keepSpecs(type) {
  const [st, st2] = TOWER_STONE[type];
  const sp = [
    cyl(st2, 0, .6, 0, 2.6, 2.8, 1.2), cyl(st, 0, 3.0, 0, 1.85, 2.15, 3.6), cyl(st2, 0, 4.95, 0, 2.3, 1.95, .4), cyl(st, 0, 5.65, 0, 2.3, 2.3, 1.0),
    cyl(st2, 0, 2.0, 0, 2.2, 2.2, .18), cyl(st2, 0, 3.6, 0, 2.05, 2.05, .18),
    box('#2a1c14', 0, 1.5, 2.12, 1.1, 1.6, .3), box(st2, 0, 2.4, 2.15, 1.4, .25, .36), box('#2a1c14', 1.5, 3.8, 1.5, .35, .8, .3, [0, .75, 0]), box('#2a1c14', -1.5, 3.8, 1.5, .35, .8, .3, [0, -.75, 0]),
  ];
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; sp.push(box(st2, Math.cos(a) * 2.15, 6.4, Math.sin(a) * 2.15, .6, .6, .6, [0, -a, 0])); }
  return sp;
}

function adornSpecs(type, T) {
  switch (type) {
    case 'crystal': return [
      glow(oct('#7ee8ff', 0, 8.2, 0, 1, [.9, 2.3, .9])), glow(oct('#b58bff', 1.4, 7.1, .3, .6, [.7, 1.7, .7], [0, 0, -.4])), glow(oct('#b58bff', -1.3, 7.1, -.3, .6, [.7, 1.5, .7], [0, 0, .4])),
      glow(oct('#7ee8ff', .2, 7.0, 1.4, .5, [.6, 1.4, .6], [.4, 0, 0])), glow(oct('#7ee8ff', 2.3, 1.4, 1.2, .5, [.6, 1.5, .6], [0, 0, -.3])), glow(oct('#b58bff', -2.4, 1.3, .9, .5, [.6, 1.3, .6], [0, 0, .35])),
      glow(oct('#7ee8ff', 1.9, 3.9, -1.0, .35, [.6, 1.4, .6], [0, 0, -.9])),
    ];
    case 'iron': {
      const sp = [box('#a7b0bd', 0, 3.0, 2.05, 2.6, 2.9, .22), box('#4b5563', 0, 3.0, 2.2, 2.7, .2, .1), box('#4b5563', 0, 4.0, 2.2, 2.7, .2, .1), cyl('#3a414d', 2.4, 4.4, 0, .22, .22, 1.2, [0, 0, Math.PI / 2]), cyl('#3a414d', -2.4, 4.4, 0, .22, .22, 1.2, [0, 0, Math.PI / 2])];
      for (const [x, z] of [[1.9, 1.9], [-1.9, 1.9], [1.9, -1.9], [-1.9, -1.9]]) sp.push(cyl('#4f5967', x, 6.1, z, .55, .6, 1.5), cone(T, x, 7.2, z, .7, .8), sph('#d9dde3', x * .9, 3.0, z * .9, .12, undefined, { noOut: true }));
      for (let i = -2; i <= 2; i++) sp.push(sph('#d9dde3', i * .5, 4.4, 2.2, .09, undefined, { noOut: true }), sph('#d9dde3', i * .5, 1.7, 2.2, .09, undefined, { noOut: true }));
      return sp;
    }
    case 'flame': return [
      cyl('#2b2b30', 0, 6.95, 0, 2.1, 1.4, .8), cyl('#2b2b30', 1.8, 7.3, 1.0, .35, .45, 1.4), cyl('#2b2b30', -1.8, 7.3, -1.0, .35, .45, 1.4),
      glow(box('#ff6a1a', 1.95, 3.0, .6, .08, 2.6, .3, [0, .3, 0])), glow(box('#ff6a1a', -1.95, 2.6, -.4, .08, 2.2, .3, [0, -.3, 0])), glow(box('#ff4a10', 0, 1.0, 2.34, 1.0, .1, .06)),
    ];
    case 'vein': return [
      hemi('#e6b422', 0, 6.55, 0, 1.95), glow(box('#ffc933', 1.9, 3.2, 0.9, .1, 2.4, .3, [0, .4, .3])), glow(box('#ffc933', -1.9, 2.4, .6, .1, 2.0, .3, [0, -.4, -.3])), glow(box('#ffc933', .8, 4.2, 1.95, .6, .1, .1, [0, 0, .5])),
      box('#6b4a2a', 3.0, .45, 1.8, 1.2, .6, .9), glow(box('#ffc933', 3.0, .95, 1.8, 1.0, .35, .7)), cyl('#333', 3.0, .12, 1.4, .2, .2, .15, [0, 0, Math.PI / 2]), cyl('#333', 3.0, .12, 2.2, .2, .2, .15, [0, 0, Math.PI / 2]),
      box('#8a5a2b', -1.2, 5.0, 2.2, .1, 1.6, .1, [0, 0, .6]), box('#8a5a2b', -.4, 5.0, 2.2, .1, 1.6, .1, [0, 0, -.6]),
    ];
    default: return [cone('#3b3f4a', 0, 7.0, 0, 2.6, 2.4), box('#a98c5a', 0, 4.0, 2.2, 3.6, .1, .08, [0, 0, .2])];
  }
}

/** Returns { root, top, flags[], fire?, glows[] } — root faces +z locally; callers rotate it towards the lane. */
export function buildTower(type, mine) {
  const key = 'tower_' + type, T = teamCol(mine), kk = key + (mine ? '_m' : '_e');
  const root = new THREE.Group();
  const info = { root, top: type === 'crystal' ? 8.2 : 7.2, flags: [], fire: null, cracks: [], type };
  const glb = GLB.get(key);
  if (glb) { const m = glb.scene.clone(true); m.scale.setScalar(glb.scale); m.position.y = glb.y; root.add(m); return info; }
  root.add(meshFrom(cachedBuild(kk, () => [...keepSpecs(type), ...adornSpecs(type, T)], 0.1), { shadow: true, receive: true }));
  // banners (animated)
  for (const sx of [-1, 1]) {
    const pole = meshFrom(cachedBuild('flag_' + kk, () => [box('#5a4630', 0, 0, 0, .1, 3.2, .1), box(T, 0, .9, .55, .05, .7, 1.1)], 0.04), { shadow: false });
    pole.position.set(sx * 2.7, 3.6, -.9); root.add(pole); info.flags.push(pole);
  }
  if (type === 'flame') {
    const f = meshFrom(cachedBuild('fire_' + type, () => [
      glow(cone('#ff7a1a', 0, .9, 0, .9, 2.0)), glow(cone('#ffd23a', .3, .6, .2, .5, 1.4)), glow(cone('#ff4a10', -.4, .5, -.3, .5, 1.3)),
    ], 0.01), { shadow: false });
    f.position.y = 7.4; root.add(f); info.fire = f;
  }
  // damage cracks (revealed as HP drops)
  for (let i = 0; i < 3; i++) {
    const c = meshFrom(cachedBuild('crack_' + i, () => [box('#1a1410', 0, 0, 0, .12, 1.5 + i * .4, .08, [0, 0, .3 - i * .3]), box('#1a1410', .2, -.5, 0, .1, 1.0, .08, [0, 0, -.5 + i * .2])], 0.01), { shadow: false });
    const a = [0.55, -0.7, 1.4][i];
    c.position.set(Math.sin(a) * 2.05, 2.0 + i * 1.4, Math.cos(a) * 2.05); c.rotation.y = a; c.visible = false;
    root.add(c); info.cracks.push(c);
  }
  return info;
}
