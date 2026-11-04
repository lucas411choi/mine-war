/**
 * HpBars: every health bar (units + towers) in ONE InstancedMesh / one draw call.
 *  - Billboard with constant on-screen size (readable at any zoom), anchored above the unit's head.
 *  - Green fill (#3FDC4A with a lighter top highlight) over a dark-grey 70% translucent track with a thin light border.
 *  - Fill is anchored on the LEFT and only the remaining ratio is drawn. No numbers anywhere.
 *  - Drawn AFTER tone mapping / post-processing (see Stage.drawBars) with a plain ShaderMaterial, so the colors are exact
 *    and never go black: the old bars were an opaque fill drawn BEFORE a transparent near-black background
 *    (three.js draws opaque objects first, renderOrder does not cross that boundary).
 */
import * as THREE from 'three';

export const BAR_STYLE = { fadeIn: 0.15, ease: 9, towerScale: 2.4, border: 1 };
const MAX = 160; // 80 units max + towers, with headroom

export class HpBars {
  constructor() {
    this.scene = new THREE.Scene();
    this.n = 0;
    this.pos = new Float32Array(MAX * 3);   // world position (head anchor)
    this.data = new Float32Array(MAX * 3);  // ratio, alpha, size scale
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.setAttribute('aPos', new THREE.InstancedBufferAttribute(this.pos, 3));
    geo.setAttribute('aData', new THREE.InstancedBufferAttribute(this.data, 3));
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
      uniforms: { uView: { value: new THREE.Vector2(1, 1) }, uBase: { value: new THREE.Vector2(40, 7) }, uBorder: { value: BAR_STYLE.border } },
      vertexShader: `
        attribute vec3 aPos; attribute vec3 aData;
        uniform vec2 uView; uniform vec2 uBase;
        varying vec2 vUv; varying vec3 vData; varying vec2 vSize;
        void main() {
          vUv = uv; vData = aData; vSize = uBase * aData.z;
          vec4 clip = projectionMatrix * viewMatrix * vec4(aPos, 1.0);
          clip.xy += position.xy * vSize * 2.0 / uView * clip.w;   // constant pixel size
          gl_Position = clip;
        }`,
      fragmentShader: `
        precision highp float;
        uniform float uBorder;
        varying vec2 vUv; varying vec3 vData; varying vec2 vSize;
        void main() {
          vec2 px = vUv * vSize;
          float ratio = vData.x;
          vec4 c;
          if (px.x < uBorder || px.y < uBorder || vSize.x - px.x < uBorder || vSize.y - px.y < uBorder) {
            c = vec4(0.90, 0.92, 0.88, 0.95);                       // thin light border
          } else {
            float fx = (px.x - uBorder) / (vSize.x - 2.0 * uBorder);   // 0 at the LEFT edge
            float fy = (px.y - uBorder) / (vSize.y - 2.0 * uBorder);
            if (fx <= ratio) {
              vec3 base = vec3(0.247, 0.863, 0.290);                // #3FDC4A
              vec3 hi = vec3(0.62, 0.97, 0.65);                     // top highlight
              c = vec4(mix(base, hi, smoothstep(0.5, 0.95, fy) * 0.75), 1.0);
            } else c = vec4(0.165, 0.165, 0.165, 0.7);              // #2A2A2A, 70% opaque (never pure black)
          }
          gl_FragColor = vec4(c.rgb, c.a * vData.y);
        }`,
    });
    this.mesh = new THREE.InstancedMesh(geo, this.mat, MAX);
    this.mesh.frustumCulled = false; this.mesh.count = 0; this.mesh.renderOrder = 999;
    this.scene.add(this.mesh);
  }

  begin() { this.n = 0; }

  /** Queue one bar. ratio 0..1 (left-anchored), alpha 0..1 (fade-in), scale = size multiplier (towers). */
  add(x, y, z, ratio, alpha, scale = 1) {
    if (this.n >= MAX) return;
    const i = this.n++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.data[i * 3] = Math.max(0, Math.min(1, ratio)); this.data[i * 3 + 1] = alpha; this.data[i * 3 + 2] = scale;
  }

  /** viewW/viewH = war panel size in CSS px. Bar size adapts to the panel so it stays legible on phones too. */
  end(viewW, viewH) {
    const g = this.mesh.geometry;
    g.attributes.aPos.needsUpdate = true; g.attributes.aData.needsUpdate = true;
    this.mesh.count = this.n;
    this.mat.uniforms.uView.value.set(viewW, viewH);
    const w = Math.max(30, Math.min(46, viewW / 16));
    this.mat.uniforms.uBase.value.set(Math.round(w), Math.max(6, Math.round(w * 0.17)));
  }

  /** Render on top of whatever is already in the bound target (never clears). */
  draw(renderer, camera) {
    if (!this.n) return;
    const ac = renderer.autoClear; renderer.autoClear = false;
    renderer.render(this.scene, camera);
    renderer.autoClear = ac;
  }
}
