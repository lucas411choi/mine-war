/**
 * Stage: ONE WebGLRenderer drawing three panels (mine / war / craft) with scissor + viewport.
 * Post-processing (Bloom, color grading, FXAA) runs once over the whole canvas through a custom
 * "PanelsPass" so the three scenes share the same composer. Low quality skips the composer entirely.
 * Panel rectangles come from the DOM (CSS grid), so layout changes (PC 3-split / mobile tabs) need no 3D code.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { WarScene } from './warScene.js';
import { MineScene, ForgeScene } from './workScenes.js';
import { setOutlines } from './gfx.js';

export const QUALITY = {
  high: { dpr: 2, shadow: 2048, bloom: true, fxaa: true, outline: true, particles: 1 },
  med: { dpr: 1.5, shadow: 1024, bloom: true, fxaa: true, outline: true, particles: 0.6 },
  low: { dpr: 1, shadow: 0, bloom: false, fxaa: false, outline: false, particles: 0.3 },
};
const ORDER = ['high', 'med', 'low'];

const GradeShader = {
  uniforms: { tDiffuse: { value: null }, sat: { value: 1.14 }, con: { value: 1.06 }, tint: { value: new THREE.Vector3(1.02, 1.0, 0.97) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float sat; uniform float con; uniform vec3 tint; varying vec2 vUv;
    void main(){ vec4 c = texture2D(tDiffuse, vUv); float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
      c.rgb = mix(vec3(l), c.rgb, sat); c.rgb = (c.rgb - 0.5) * con + 0.5; c.rgb *= tint; gl_FragColor = c; }`,
};

class PanelsPass extends Pass {
  constructor(stage) { super(); this.stage = stage; this.needsSwap = false; }
  render(renderer, writeBuffer, readBuffer) {
    renderer.setRenderTarget(this.renderToScreen ? null : readBuffer);
    this.stage.drawPanels(renderer);
  }
}

export class Stage {
  constructor(canvas, els, hooks = {}) {
    this.els = els; this.sfx = hooks.sfx || (() => {});
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    const r = this.renderer;
    r.setClearColor(0x120a06, 1);
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
    this.size = { mine: { w: 1, h: 1 }, war: { w: 1, h: 1 }, craft: { w: 1, h: 1 } };
    this.rects = {}; this.composer = null; this.bloom = null; this.fxaa = null;
    this.timeScale = 1; this.slow = { scale: 1, t: 0, dur: 1 };
    this.mine = new MineScene(this); this.war = new WarScene(this); this.forge = new ForgeScene(this);
    this.panels = [{ key: 'mine', el: els.mine, sc: this.mine }, { key: 'war', el: els.war, sc: this.war }, { key: 'craft', el: els.craft, sc: this.forge }];
    this.layers = {}; for (const k in els) this.layers[k] = els[k].querySelector('.fxlayer');
    this.qname = 'med'; this.auto = false; this.fpsAcc = 0; this.fpsN = 0; this.fpsT = 0; this.onDowngrade = null; this.warmup = 0;
    this.bindWarInput(els.war.querySelector('.view'));
    this.ro = new ResizeObserver(() => this.measure());
    for (const k in els) this.ro.observe(els[k]);
    window.addEventListener('resize', () => this.resize());
    this.applyQuality('med');
  }

  // ---------------------------------------------------------------- quality / size
  applyQuality(name, auto = false) {
    if (!QUALITY[name]) name = 'med';
    const q = QUALITY[name]; this.qname = name; this.q = q; this.auto = auto;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.dpr));
    this.war.setQuality(q); this.mine.setQuality(q); this.forge.setQuality(q);
    setOutlines(q.outline);
    if (this.composer) { this.composer.dispose?.(); this.composer = null; this.bloom = null; this.fxaa = null; }
    if (q.bloom || q.fxaa) {
      const c = this.composer = new EffectComposer(this.renderer);
      c.addPass(new PanelsPass(this));
      if (q.bloom) { this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.55, 0.88); c.addPass(this.bloom); }
      c.addPass(new OutputPass());
      c.addPass(new ShaderPass(GradeShader));
      if (q.fxaa) { this.fxaa = new ShaderPass(FXAAShader); c.addPass(this.fxaa); }
    }
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight, pr = this.renderer.getPixelRatio();
    this.renderer.setSize(w, h, false);
    if (this.composer) { this.composer.setPixelRatio(pr); this.composer.setSize(w, h); }
    if (this.fxaa) this.fxaa.material.uniforms.resolution.value.set(1 / (w * pr), 1 / (h * pr));
    this.measure();
  }

  measure() {
    for (const p of this.panels) {
      const b = p.el.getBoundingClientRect();
      this.rects[p.key] = { x: b.left, y: b.top, w: b.width, h: b.height };
      this.size[p.key] = { w: Math.max(1, b.width), h: Math.max(1, b.height) };
    }
  }

  // ---------------------------------------------------------------- effects helpers used by scenes
  slowmo(scale, seconds) { this.slow = { scale, t: seconds, dur: seconds }; }
  shakeAmt(a) { this.war.shake = Math.max(this.war.shake, a); }
  floatText(key, pos, text, cls) {
    const layer = this.layers[key];
    if (!layer || !pos || layer.childElementCount > 26) return;
    const s = document.createElement('span');
    s.className = 'ft ' + (cls || ''); s.textContent = text;
    s.style.left = pos.x + 'px'; s.style.top = pos.y + 'px';
    s.addEventListener('animationend', () => s.remove());
    layer.appendChild(s);
  }

  // ---------------------------------------------------------------- input (war panel: drag, wheel, pinch)
  bindWarInput(el) {
    const ptrs = new Map(); let pinch = 0;
    el.addEventListener('pointerdown', (e) => { el.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); pinch = 0; });
    el.addEventListener('pointermove', (e) => {
      const p = ptrs.get(e.pointerId); if (!p) return;
      const dx = e.clientX - p.x; p.x = e.clientX; p.y = e.clientY;
      if (ptrs.size === 1) this.war.pan(-dx * (this.war.W / this.size.war.w));
      else if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch) this.war.zoomBy(d / pinch);
        pinch = d;
      }
    });
    const up = (e) => { ptrs.delete(e.pointerId); pinch = 0; };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', (e) => { e.preventDefault(); this.war.zoomBy(e.deltaY < 0 ? 1.1 : 0.91); }, { passive: false });
  }

  // ---------------------------------------------------------------- frame
  /** Called once per animation frame while the game screen is visible. */
  frame(dt, session, events) {
    const view = session.view, my = session.side;
    if (this.slow.t > 0) {
      this.slow.t -= dt;
      const k = Math.max(0, this.slow.t) / this.slow.dur;
      this.timeScale = k > 0.3 ? this.slow.scale : this.slow.scale + (1 - this.slow.scale) * (1 - k / 0.3);
    } else this.timeScale = 1;
    const sdt = dt * this.timeScale;

    this.war.handle(events, view); this.mine.handle(events, view, my); this.forge.handle(events, view, my);
    for (const p of this.panels) {
      const r = this.rects[p.key];
      p.visible = !!r && r.w > 4 && r.h > 4;
      if (!p.visible) continue;
      p.sc.fit(r.w / r.h);
      if (p.key === 'war') p.sc.update(sdt, view); else p.sc.update(sdt, view, my);
      p.sc.camera.aspect = r.w / r.h; p.sc.camera.updateProjectionMatrix();
    }
    if (this.composer) this.composer.render(dt);
    else this.drawPanels(this.renderer, true);
    this.trackFps(dt);
  }

  drawPanels(renderer, direct) {
    const size = renderer.getSize(this._v || (this._v = new THREE.Vector2()));
    if (direct) renderer.setRenderTarget(null);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, size.x, size.y);
    renderer.clear();
    renderer.setScissorTest(true);
    for (const p of this.panels) {
      if (!p.visible) continue;
      const r = this.rects[p.key], y = size.y - (r.y + r.h);
      renderer.setViewport(r.x, y, r.w, r.h); renderer.setScissor(r.x, y, r.w, r.h);
      renderer.render(p.sc.scene, p.sc.camera);
    }
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, size.x, size.y); renderer.setScissor(0, 0, size.x, size.y);
  }

  /** Auto quality: if FPS stays low in auto mode, step down one level. */
  trackFps(dt) {
    this.warmup += dt; if (this.warmup < 3) return; // ignore shader-compile hitches
    this.fpsAcc += dt; this.fpsN++;
    if (this.fpsAcc < 3) return;
    const fps = this.fpsN / this.fpsAcc; this.fpsAcc = 0; this.fpsN = 0;
    if (this.auto && fps < 38) {
      const i = ORDER.indexOf(this.qname);
      if (i < ORDER.length - 1) { this.applyQuality(ORDER[i + 1], true); this.warmup = 0; if (this.onDowngrade) this.onDowngrade(this.qname); }
    }
  }

  newMatch(side) { this.war.setSide(side); this.mine.setSide(); this.forge.setSide(); this.warmup = 0; this.timeScale = 1; this.slow.t = 0; }
}
