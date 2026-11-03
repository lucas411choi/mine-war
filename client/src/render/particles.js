/**
 * Particles: one InstancedMesh per system (swap-remove pool, no per-frame allocations).
 * additive=true for sparks/magic/coins (fade by darkening); additive=false for smoke/dust (fade by shrinking).
 */
import * as THREE from 'three';

const _c = new THREE.Color();

export class Particles {
  constructor(scene, max = 400, additive = true) {
    this.max = max; this.n = 0; this.scale = 1;
    const geo = new THREE.OctahedronGeometry(0.5, 0);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: additive, depthWrite: !additive,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.additive = additive;
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.mesh.frustumCulled = false; this.mesh.count = 0;
    scene.add(this.mesh);
    const f = (k) => new Float32Array(max * k);
    this.pos = f(3); this.vel = f(3); this.life = f(1); this.maxLife = f(1); this.s0 = f(1); this.s1 = f(1);
    this.col = f(3); this.grav = f(1); this.drag = f(1);
  }

  emit(o) {
    if (this.n >= this.max) return;
    if (this.scale < 1 && Math.random() > this.scale) return; // quality-based thinning
    const i = this.n++;
    this.pos[i * 3] = o.x; this.pos[i * 3 + 1] = o.y; this.pos[i * 3 + 2] = o.z;
    this.vel[i * 3] = o.vx || 0; this.vel[i * 3 + 1] = o.vy || 0; this.vel[i * 3 + 2] = o.vz || 0;
    this.life[i] = this.maxLife[i] = o.life || 0.6;
    this.s0[i] = o.size ?? 0.3; this.s1[i] = o.size1 ?? 0;
    _c.set(o.color ?? '#ffffff');
    this.col[i * 3] = _c.r; this.col[i * 3 + 1] = _c.g; this.col[i * 3 + 2] = _c.b;
    this.grav[i] = o.gravity || 0; this.drag[i] = o.drag || 0;
  }

  /** Random spherical burst. */
  burst(x, y, z, count, o = {}) {
    const sp = o.speed ?? 4;
    for (let k = 0; k < count; k++) {
      const a = Math.random() * Math.PI * 2, u = Math.random() * 2 - 1, r = Math.sqrt(1 - u * u), v = sp * (0.4 + Math.random() * 0.6);
      this.emit({
        x: x + (Math.random() - 0.5) * (o.spread || 0), y, z: z + (Math.random() - 0.5) * (o.spread || 0),
        vx: Math.cos(a) * r * v, vy: (o.up ?? 0.6) * Math.abs(u) * v + (o.lift || 0), vz: Math.sin(a) * r * v,
        life: (o.life || 0.6) * (0.6 + Math.random() * 0.8), size: o.size ?? 0.3, size1: o.size1 ?? 0,
        color: Array.isArray(o.color) ? o.color[(Math.random() * o.color.length) | 0] : o.color, gravity: o.gravity ?? 6, drag: o.drag ?? 1,
      });
    }
  }

  update(dt) {
    const { pos, vel, life, maxLife, s0, s1, col, grav, drag } = this;
    const mArr = this.mesh.instanceMatrix.array, cArr = this.mesh.instanceColor.array;
    let i = 0;
    while (i < this.n) {
      life[i] -= dt;
      if (life[i] <= 0) { // swap-remove
        const l = --this.n;
        if (i !== l) {
          for (let k = 0; k < 3; k++) { pos[i * 3 + k] = pos[l * 3 + k]; vel[i * 3 + k] = vel[l * 3 + k]; col[i * 3 + k] = col[l * 3 + k]; }
          life[i] = life[l]; maxLife[i] = maxLife[l]; s0[i] = s0[l]; s1[i] = s1[l]; grav[i] = grav[l]; drag[i] = drag[l];
        }
        continue;
      }
      const dr = Math.max(0, 1 - drag[i] * dt);
      vel[i * 3] *= dr; vel[i * 3 + 1] = vel[i * 3 + 1] * dr - grav[i] * dt; vel[i * 3 + 2] *= dr;
      pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      const k = 1 - life[i] / maxLife[i];
      const s = s0[i] + (s1[i] - s0[i]) * k;
      const o = i * 16;
      mArr[o] = s; mArr[o + 1] = 0; mArr[o + 2] = 0; mArr[o + 3] = 0;
      mArr[o + 4] = 0; mArr[o + 5] = s; mArr[o + 6] = 0; mArr[o + 7] = 0;
      mArr[o + 8] = 0; mArr[o + 9] = 0; mArr[o + 10] = s; mArr[o + 11] = 0;
      mArr[o + 12] = pos[i * 3]; mArr[o + 13] = pos[i * 3 + 1]; mArr[o + 14] = pos[i * 3 + 2]; mArr[o + 15] = 1;
      const fade = this.additive ? 1 - k * k : 1;
      cArr[i * 3] = col[i * 3] * fade; cArr[i * 3 + 1] = col[i * 3 + 1] * fade; cArr[i * 3 + 2] = col[i * 3 + 2] * fade;
      i++;
    }
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
  }
}
