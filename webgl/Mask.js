import Experience from './Experience.js';
import Handler from './abstract/Handler.js';
import * as THREE from 'three';
import GPGPU from './gpgpu/GPGPU.js'
import KeywordCloud from './KeywordCloud.js';
import gsap from 'gsap';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';


export default class Mask extends Handler {

  static instance;

  static getInstance() {
    if (!Mask.instance) {
      Mask.instance = new Mask();
    }

    return Mask.instance;
  }

  constructor() {
    super(Mask.id);


    this.scene = this.experience.scene;
    this.canvas = this.experience.canvas;
    this.renderer = this.experience.renderer;
    this.camera = this.experience.camera;
    this.mouse = this.experience.mouse;
    this.sizes = this.experience.sizes;
    this.resources = this.experience.resources;
    this.debug = this.experience.debug;

    this.params = {
      color: new THREE.Color('#F777A8'),
      size: 1.0,
      minAlpha: 0.04,
      maxAlpha: 0.8,
      force: 0.2,
    };

    this.currentModelName = 'mask';


    this.init();
  }


  init() {
    this.setupMask();
    this.setupGPGPU();
    this.setupDebug();
  }


  setupMask() {
    const modelName = this.currentModelName || 'mask';
    const modelResource = this.resources.models[modelName];

    let mask;
    if (!modelResource) {
      console.error(`Model ${modelName} not found! Using fallback.`);
      const geo = new THREE.BoxGeometry(1, 1, 1);
      const mat = new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true });
      mask = new THREE.Mesh(geo, mat);
    } else {
      mask = this.resolveMesh(modelResource.scene);
    }
    this.model = mask;

    // PhD Vis: Keyword Cloud
    if (!this.keywordCloud) this.keywordCloud = new KeywordCloud();
  }

  setupCameraPosition() {
    // OrbitControls removed
  }

  setupGPGPU() {
    this.gpgpu = new GPGPU({
      size: 1200,
      camera: this.camera,
      renderer: this.renderer.webglRenderer,
      mouse: this.mouse,
      scene: this.scene,
      sizes: this.sizes,
      model: this.model,
      debug: this.debug,
      audio: this.experience.audio,
      webcam: this.experience.webcam,
      params: this.params
    })
  }

  setupDebug() {
    if (this.debug.active) {
      if (this.particlesFolder) {
        this.particlesFolder.destroy();
      }
      this.debug.gui.width = 300;
      this.particlesFolder = this.debug.gui.addFolder('particles');

      this.particlesFolder
        .addColor(this.params, 'color')
        .name('Color')
        .onChange(() => {
          if (this.gpgpu && this.gpgpu.material && this.gpgpu.material.uniforms.uColor) {
            this.gpgpu.material.uniforms.uColor.value.copy(this.params.color);
          }
        });

      this.particlesFolder
        .add(this.gpgpu.material.uniforms.uParticleSize, 'value')
        .min(0.1)
        .max(10)
        .step(0.1)
        .name('Size');

      this.particlesFolder
        .add(this.gpgpu.uniforms.velocityUniforms.uForce, 'value')
        .min(0)
        .max(1)
        .step(0.01)
        .name('Force');

      this.particlesFolder
        .add(this.params, 'minAlpha')
        .min(0)
        .max(1)
        .step(0.01)
        .name('Min Alpha')
        .onChange(() => {
          if (this.gpgpu.material.uniforms.uMinAlpha)
            this.gpgpu.material.uniforms.uMinAlpha.value = this.params.minAlpha;
        });

      this.particlesFolder
        .add(this.params, 'maxAlpha')
        .min(0)
        .max(1)
        .step(0.01)
        .name('Max Alpha')
        .onChange(() => {
          if (this.gpgpu.material.uniforms.uMaxAlpha)
            this.gpgpu.material.uniforms.uMaxAlpha.value = this.params.maxAlpha;
        });

      // Debug Randomize
      this.particlesFolder.add(this, 'randomize');

      // Model Switcher
      const models = { mask: 'mask', veneciaMask: 'veneciaMask', samurai: 'samurai', cyborg: 'cyborg', subway: 'subway' };
      this.particlesFolder.add({ model: 'mask' }, 'model', models)
        .onChange((val) => this.changeModel(val));
    }
  }

  randomize() {
    if (this.gpgpu && this.gpgpu.material && this.gpgpu.material.uniforms.uRandom) {
      this.gpgpu.material.uniforms.uRandom.value = Math.random();
    }
  }


  async switchModel(modelKey) {
    if (this.currentModelName === modelKey) return;

    console.log(`[Mask] Switching Pantheon Model to: ${modelKey}`);

    // 1. Transition OUT (Disperse/Fade + SPIN)
    // Snappier Fade
    const oldAlpha = this.params.minAlpha;
    gsap.to(this.params, { minAlpha: 0.0, duration: 0.3 }); // Was 1.0

    // Spin Effect: Rotate the entire particle system
    // Much faster spin (0.4s for full rotation) + 5x Faster Feel
    if (this.gpgpu && this.gpgpu.mesh) {
      gsap.to(this.gpgpu.mesh.rotation, {
        y: this.gpgpu.mesh.rotation.y + Math.PI * 4, // Double spin
        duration: 0.5, // Super fast (was 2.5)
        ease: "power2.inOut"
      });
    }

    try {
      // 2. Load New Model (or get from cache)
      let mesh;
      if (this.resources.models[modelKey]) {
        mesh = this.resolveMesh(this.resources.models[modelKey].scene);
      } else {
        // Hot-load
        const url = `models/pantheon/${modelKey}.glb`; // Convention
        console.log(`[Mask] Loading ${url}...`);
        mesh = await this.loadModelFromUrl(url);
        // Cache it?
        this.resources.models[modelKey] = { scene: mesh }; // Hacky cache
      }

      if (!mesh) throw new Error("No mesh found");

      // 3. Update Simulation Data
      this.updateGPGPUGeometry(mesh);
      this.currentModelName = modelKey;

      // 4. Transition IN (Snap Formation)
      // MAGNETIC SNAP: Boost Attraction + Moderate Brake
      // 4. Transition IN (Snap Formation)
      // "10x Faster": Super-Tension + Heavy Brake
      if (this.gpgpu && this.gpgpu.uniforms.velocityUniforms.uAttraction) {
        // 1. GRAVITY WELL: Extreme pull (2.0) -> Strong Hold (0.2)
        // 2.0 pulls them instantly. 0.2 keeps them from drifting (fixes "dark brush" gaps)
        gsap.fromTo(this.gpgpu.uniforms.velocityUniforms.uAttraction,
          { value: 2.0 },
          { value: 0.2, duration: 0.8, ease: "power4.out" } // Aggressive snap
        );

        // 2. BRAKING SYSTEM: Fly fast (0.0), then STOP (0.5)
        // The 0.5 friction is CRITICAL. It kills the momentum so they don't overshoot/vibrate.
        // This solves "takes forever to concentrate".
        gsap.fromTo(this.gpgpu.uniforms.velocityUniforms.uForce,
          { value: 0.0 }, // No drag start
          { value: 0.5, duration: 1.2, ease: "power2.out" } // Strong brake arrival
        );
      }

      gsap.to(this.params, { minAlpha: oldAlpha, duration: 0.5, delay: 0.0 }); // Immediate fade in

      // Notify Debug
      console.log(`[Mask] Switched to ${modelKey}`);

    } catch (e) {
      console.warn(`[Mask] Failed to switch to ${modelKey}:`, e);
      // Fallback?
      gsap.to(this.params, { minAlpha: oldAlpha, duration: 1.0 });
    }
  }

  resolveMesh(scene) {
    let m = null;
    if (scene.traverse) {
      scene.traverse((c) => {
        if (!m && c.isMesh && c.geometry) {
          m = c;
        }
      });
    }

    if (!m) {
      console.warn("Mask.resolveMesh: No mesh found in scene", scene);
      console.warn("Mask.resolveMesh: detailed scene", scene.children);

      // CRITICAL FALLBACK: Return a dummy mesh to prevent crash
      const geometry = new THREE.BoxGeometry(1, 1, 1);
      const material = new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true });
      const dummy = new THREE.Mesh(geometry, material);
      dummy.name = "Fallback_Dummy";
      return dummy;
    }

    // SCALING: User requested "make the model larger"
    m.scale.set(1.7, 1.7, 1.7); // Increased from default 1.0
    m.updateMatrixWorld(); // Ensure scale is applied before sampling

    return m;
  }

  async loadModelFromUrl(url) {
    const loader = new GLTFLoader();
    return new Promise((resolve, reject) => {
      loader.load(url, (gltf) => {
        resolve(this.resolveMesh(gltf.scene));
      }, undefined, (err) => {
        console.warn("Error loading model", url);
        reject(err);
      });
    });
  }

  updateGPGPUGeometry(mesh) {
    if (!this.gpgpu) return;

    // We need to generate a new Texture from the geometry
    // Reuse GPGPU's intenal method if possible, or replicate it.
    // Since GPGPU class encapsulates this, we might need to add a method there
    // OR we can access the helper from here if exported.

    // Ideally call this.gpgpu.updateTarget(mesh);
    if (typeof this.gpgpu.updateTarget === 'function') {
      this.gpgpu.updateTarget(mesh);
    } else {
      console.error("GPGPU.updateTarget not implemented!");
    }
  }

  setupMask() {
    // ... existing ...
  }

  // Replace changeModel with alias
  changeModel(m) { this.switchModel(m); }

  updateVisualization(data) {
    if (!data) return;
    this.currentData = data;

    const s = data.marketChangePercent || 0;
    const vix = data.vix || 20;
    const fg = data.fearGreedIndex || 50;
    const volRatio = data.volumeRatio || 1.0;
    const yieldVal = data.tenYearYield || 4.0;

    // Update Keywords
    if (this.keywordCloud && data.headlines) {
      this.keywordCloud.updateHeadlines(data.headlines);
    }

    // --- 1. CONTINUOUS MOOD INTERPOLATION ---
    const anchors = {
      0: { h: 340, s: 95, l: 40, name: "Extreme Panic" },
      25: { h: 260, s: 60, l: 40, name: "Fear" },
      45: { h: 220, s: 40, l: 40, name: "Nervous" },
      55: { h: 180, s: 40, l: 45, name: "Neutral" },
      75: { h: 160, s: 70, l: 50, name: "Greed" },
      100: { h: 50, s: 95, l: 60, name: "Euphoria" }
    };

    const lerpHSL = (a, b, t) => {
      return {
        h: a.h + (b.h - a.h) * t,
        s: a.s + (b.s - a.s) * t,
        l: a.l + (b.l - a.l) * t
      };
    };

    let startKey = 0;
    let endKey = 100;
    const sortedKeys = Object.keys(anchors).map(k => parseInt(k)).sort((a, b) => a - b);

    for (let i = 0; i < sortedKeys.length - 1; i++) {
      if (fg >= sortedKeys[i] && fg <= sortedKeys[i + 1]) {
        startKey = sortedKeys[i];
        endKey = sortedKeys[i + 1];
        break;
      }
    }

    const range = endKey - startKey;
    const t = (fg - startKey) / range;
    const baseHSL = lerpHSL(anchors[startKey], anchors[endKey], t);

    let moodHue = baseHSL.h;
    let moodSat = baseHSL.s;
    let moodLight = baseHSL.l;

    // --- 2. APPLY MODIFIERS ---

    // Yield Temp Shift
    const yieldStress = Math.max(0, yieldVal - 4.0);
    if (yieldStress > 0) {
      moodHue -= (yieldStress * 15);
    }

    // Volume Heat
    const heatFactor = (volRatio - 1.0) * 20;
    moodSat = Math.max(20, Math.min(100, moodSat + heatFactor));
    if (volRatio > 1.5) moodLight += 5;

    // Micro-Variation
    moodHue += ((data.day || 1) % 5) * 2;

    // Safety Bounds
    moodHue = moodHue % 360;
    if (moodHue < 0) moodHue += 360;
    moodSat = Math.max(0, Math.min(100, moodSat));
    moodLight = Math.max(0, Math.min(100, moodLight));

    const finalColor = new THREE.Color(`hsl(${Math.round(moodHue)}, ${Math.round(moodSat)}%, ${Math.round(moodLight)}%)`);

    // --- 3. DEEP PHYSICS & ATMOSPHERE ---
    // Expanded attributes for PhD-level simulation

    // A. BLOOM / HEAT (Volume)
    const volumeFactor = volRatio;
    // Map volume to bloom strength (1.0 -> 1.0, 2.0 -> 2.5)
    const targetBloom = 0.5 + (volumeFactor * 0.8);

    // B. SPARKLE / JITTER (Intraday Range)
    const rangeVal = data.intradayRange || 1.0;
    const jitterAmount = Math.min(1.0, rangeVal / 3.0);

    // C. VELOCITY / BURST (Market Gap)
    const gapVal = Math.abs(data.marketGap || 0);
    const shockFactor = Math.min(1.0, gapVal / 2.0);

    // D. PANIC ENGINE (VIX + Drop)
    // If VIX > 30 or Drop < -2%, trigger Glitch & Shake
    let panicLevel = 0.0;
    if (vix > 28 || s < -1.8) {
      panicLevel = Math.min(1.0, ((vix - 25) / 20.0) + (Math.abs(s) / 5.0));
      // Use Red flash for panic
      if (panicLevel > 0.5) finalColor.lerp(new THREE.Color(0xff0000), 0.3);
    }
    const targetGlitch = panicLevel * 0.015;
    const targetShake = panicLevel * 0.2;

    // Physics Targets
    const targetForce = 0.2 + ((data.volatility || 0.4) * 0.8) + (volumeFactor * 0.1) + (shockFactor * 0.3) + (panicLevel * 0.5);
    const atmosphereWeight = Math.min(1.0, Math.max(0, (yieldVal - 3.0) / 2.0));
    const targetAlpha = 0.04 + (atmosphereWeight * 0.05);

    // Size Calculation (Greed + Jitter)
    const greedFactor = fg / 100.0;
    const moveSignificance = Math.abs(s);
    let targetSize = 1.5 + (moveSignificance * 1.5) + (greedFactor * 1.0);
    targetSize += (Math.random() * jitterAmount * 1.5);

    // --- TRANSITIONS ---
    gsap.to(this.params.color, {
      r: finalColor.r,
      g: finalColor.g,
      b: finalColor.b,
      duration: 2.0,
      ease: 'power2.out',
      onUpdate: () => {
        if (this.gpgpu && this.gpgpu.material && this.gpgpu.material.uniforms.uColor) {
          this.gpgpu.material.uniforms.uColor.value.copy(this.params.color);
        }
      }
    });

    if (this.gpgpu && this.gpgpu.material) {
      // Calculate Market Intensity (0.0 = Neutral, 1.0 = Extreme Fear/Greed)
      const intensity = Math.abs(fg - 50) / 50.0;

      gsap.to(this.gpgpu.material.uniforms.uMarketIntensity, {
        value: intensity,
        duration: 2.5
      });

      gsap.to(this.gpgpu.material.uniforms.uForce, {
        value: targetForce,
        duration: 2.5
      });

      const sizeEase = jitterAmount > 0.5 ? "elastic.out(1, 0.3)" : "back.out(1.0)";

      gsap.to(this.gpgpu.material.uniforms.uParticleSize, {
        value: targetSize,
        duration: 2.5,
        ease: sizeEase
      });

      gsap.to(this.params, {
        minAlpha: targetAlpha,
        duration: 2.0
      });
    }

    // Camera & Post-Processing Effects
    if (this.renderer && this.renderer.postprocessing) {
      const pp = this.renderer.postprocessing;
      pp.setGlitch(targetGlitch);

      if (!this.fxParams) this.fxParams = { bloom: 1.0, shake: 0.0 };

      gsap.to(this.fxParams, {
        bloom: targetBloom,
        shake: targetShake,
        duration: 2.0,
        onUpdate: () => {
          pp.setBloom(this.fxParams.bloom);
          if (this.camera) this.camera.shakeIntensity = this.fxParams.shake;
        }
      });
    }

    this.currentBaseSize = targetSize;
  }

  // onUpdate loop (called from Experience.update)
  update() {
    // 1. GPGPU Compute
    if (this.gpgpu) {
      this.gpgpu.compute();

      // 2. Continuous Physics Modulation (Pulse/Noise)
      if (this.currentData && this.gpgpu.material && this.gpgpu.uniforms.velocityUniforms) {
        const time = performance.now() * 0.001;
        const vix = this.currentData.vix || 20;

        // Pulse Logic
        let pulseSpeed = 1.0 + (vix / 10.0);
        let pulseAmp = 0.4;

        if (vix > 30) {
          pulseSpeed = 8.0;
          pulseAmp = 0.2;
        }

        const pulse = 1.0 + Math.sin(time * pulseSpeed) * pulseAmp;

        // Apply Pulse to Size
        // Note: uParticleSize is on the material, force is on velocityUniforms
        if (this.gpgpu.material.uniforms.uParticleSize) {
          this.gpgpu.material.uniforms.uParticleSize.value = (this.params.size || 1.5) * pulse;
        }

        // Apply Noise to Force (Clamped for Safety) - MICRO
        const noise = (Math.random() - 0.5) * (vix / 800.0);
        let f = (this.params.force || 0.2) + noise;
        f = Math.min(0.6, Math.max(0.1, f)); // Extremely tight damping range
        this.gpgpu.uniforms.velocityUniforms.uForce.value = f;
      }
    }

    // 3. Update Keywords
    if (this.keywordCloud && this.experience.time) {
      this.keywordCloud.update(this.experience.time.elapsed / 1000);
    }
  }
}