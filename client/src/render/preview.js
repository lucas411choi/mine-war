/**
 * CodexPreview: a small stand-alone WebGL scene that shows ONE in-game model (the same Rig / tower builders the
 * battle uses) rotating slowly; drag to spin it yourself. Everything created here is released in dispose():
 * renderer + GL context, ground disc, listeners. (Shared cached geometries/materials belong to the game and are NOT disposed.)
 * The model starts facing +x like a blue unit marching right in the battlefield, so weapons point the same way as in-game.
 */
import * as THREE from 'three';
import { Rig, buildTower } from './models.js';
import { OUT } from './gfx.js';

export class CodexPreview {
  constructor(canvas) {
    this.canvas = canvas; this.dead = false; this.t = 0; this.yaw = Math.PI / 2; this.items = []; this.model = null; this.tower = null;
    this.dragging = false; this.resumeAt = 0; this.outlineMark = OUT.meshes.length;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    r.setClearColor(0x000000, 0); r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 300);
    this.scene.add(new THREE.HemisphereLight('#d6efff', '#5f8f3b', 1.05));
    const sun = new THREE.DirectionalLight('#fff1cf', 2.4);
    sun.position.set(-6, 12, 8); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 40 });
    sun.shadow.bias = -0.0006; this.scene.add(sun);
    this.ground = new THREE.Mesh(new THREE.CircleGeometry(5, 40), new THREE.MeshLambertMaterial({ color: '#86b45a' }));
    this.ground.rotation.x = -Math.PI / 2; this.ground.receiveShadow = true; this.scene.add(this.ground);
    this.holder = new THREE.Group(); this.scene.add(this.holder);

    // drag to rotate
    this.host = canvas.parentElement;
    this.onDown = (e) => { this.dragging = true; this.lastX = e.clientX; try { this.host.setPointerCapture(e.pointerId); } catch { /* ignore */ } };
    this.onMove = (e) => { if (!this.dragging) return; this.yaw += (e.clientX - this.lastX) * 0.012; this.lastX = e.clientX; };
    this.onUp = () => { this.dragging = false; this.resumeAt = performance.now() + 1500; };
    this.host.addEventListener('pointerdown', this.onDown); this.host.addEventListener('pointermove', this.onMove);
    this.host.addEventListener('pointerup', this.onUp); this.host.addEventListener('pointercancel', this.onUp);
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(this.host);
    this.resize();
    this.last = performance.now();
    this.loop = (now) => this.frame(now);
    this.raf = requestAnimationFrame(this.loop);
  }

  resize() {
    const b = this.host.getBoundingClientRect();
    if (b.width < 2 || b.height < 2) return;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(b.width, b.height, false);
    this.camera.aspect = b.width / b.height; this.camera.updateProjectionMatrix();
  }

  clear() {
    for (const it of this.items) this.holder.remove(it.root);
    if (this.model) this.holder.remove(this.model);
    this.items = []; this.model = null; this.tower = null;
  }

  /** kind: 'char' | 'tower'. */
  show(kind, id, team) {
    this.clear();
    const model = new THREE.Group();
    if (kind === 'tower') {
      const info = buildTower(id, true); model.add(info.root); this.tower = info;
    } else if (id === 'teammine') {
      for (let k = 0; k < 3; k++) { const rg = new Rig('jack', true); rg.root.position.set((k - 1) * 1.3, 0, 0); rg.mode = 'work'; model.add(rg.root); this.items.push({ rig: rg, root: rg.root, swing: false }); }
    } else {
      const rig = new Rig(id, true);
      rig.mode = team === 'war' ? 'idle' : 'work';
      if (id === 'sammy') rig.root.position.y = 1.4;                 // the plane hovers
      model.add(rig.root); this.items.push({ rig, root: rig.root, swing: team === 'war', timer: 0.8 });
    }
    this.holder.add(model); this.model = model;
    // frame the model with a bounding sphere
    model.rotation.y = this.yaw; model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
    const radius = Math.max(size.length() * 0.5, 1.2), dist = radius / Math.sin(THREE.MathUtils.degToRad(this.camera.fov / 2)) * 1.05;
    this.camera.position.set(c.x, c.y + radius * 0.35, c.z + dist);
    this.camera.lookAt(c.x, c.y, c.z);
    this.ground.scale.setScalar(Math.max(1, radius / 2.4));
  }

  frame(now) {
    if (this.dead) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now; this.t += dt;
    if (!this.dragging && now > this.resumeAt) this.yaw += dt * 0.5;       // slow auto rotation
    if (this.model) this.model.rotation.y = this.yaw;
    for (const it of this.items) {
      it.rig.update(dt);
      if (it.swing) { it.timer -= dt; if (it.timer <= 0) { it.rig.doSwing(); it.timer = 2.6; } } // demo the attack animation now and then
    }
    if (this.tower) {
      this.tower.flags.forEach((f, i) => { f.rotation.y = Math.sin(this.t * 2.2 + i) * 0.25; });
      if (this.tower.fire) this.tower.fire.scale.set(1, 1 + Math.sin(this.t * 14) * 0.08, 1);
    }
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    if (this.dead) return;
    this.dead = true; cancelAnimationFrame(this.raf); this.ro.disconnect();
    this.host.removeEventListener('pointerdown', this.onDown); this.host.removeEventListener('pointermove', this.onMove);
    this.host.removeEventListener('pointerup', this.onUp); this.host.removeEventListener('pointercancel', this.onUp);
    this.clear(); this.scene.remove(this.holder, this.ground);
    this.ground.geometry.dispose(); this.ground.material.dispose();
    OUT.meshes.splice(this.outlineMark);                                   // forget outline meshes created for the preview
    this.renderer.dispose(); this.renderer.forceContextLoss();             // free the GL context (the canvas is replaced on next open)
  }
}
