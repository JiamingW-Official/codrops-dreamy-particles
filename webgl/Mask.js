import Experience from './Experience.js';
import Handler from './abstract/Handler.js';
import * as THREE from 'three';
import GPGPU from './gpgpu/GPGPU.js'
import gsap from 'gsap';


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
      size: 1.7,
      minAlpha: 0.04,
      maxAlpha: 0.8,
      force: 0.7,
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
    let mask = this.resources.models.mask.scene.children[0];

    if (!mask.geometry) {
      this.resources.models.mask.scene.traverse((child) => {
        if (child.isMesh && !mask.geometry) {
          mask = child;
        }
      });
    }

    this.model = mask;
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
      this.particlesFolder = this.debug.gui.addFolder('particles');

      this.particlesFolder.addColor(this.gpgpu.material.uniforms.uColor, 'value').name('Color').onChange((value) => {
        this.params.color.copy(value);
      });
      this.particlesFolder.add(this.gpgpu.material.uniforms.uParticleSize, 'value').name('Size').min(1).max(10).step(0.1).onChange((value) => {
        this.params.size = value;
      });
      this.particlesFolder.add(this.gpgpu.uniforms.velocityUniforms.uForce, 'value').name('Force').min(0).max(0.8).step(0.01).onChange((value) => {
        this.params.force = value;
      });
      this.particlesFolder.add(this.gpgpu.material.uniforms.uMinAlpha, 'value').name('Min Alpha').min(0).max(1).step(0.01).onChange((value) => {
        this.params.minAlpha = value;
      });
      this.particlesFolder.add(this.gpgpu.material.uniforms.uMaxAlpha, 'value').name('Max Alpha').min(0).max(1).step(0.01).onChange((value) => {
        this.params.maxAlpha = value;
      });

      const obj = {
        randomize: () => {
          this.params.color.setHex(Math.random() * 0xffffff);
          this.params.size = Math.random() * 9 + 1;
          this.params.force = Math.random() * 0.8;

          this.gpgpu.material.uniforms.uColor.value.copy(this.params.color);
          this.gpgpu.material.uniforms.uParticleSize.value = this.params.size;
          this.gpgpu.uniforms.velocityUniforms.uForce.value = this.params.force;

          this.particlesFolder.controllers.forEach(c => c.updateDisplay());
        },
        model: this.currentModelName
      };

      this.particlesFolder.add(obj, 'randomize');
      this.particlesFolder.add(obj, 'model', ['mask', 'veneciaMask', 'samurai', 'cyborg', 'subway']).onChange((value) => {
        this.changeModel(value);
      });
    }
  }

  changeModel(modelName) {
    this.currentModelName = modelName;

    if (this.gpgpu) {
      this.scene.remove(this.gpgpu.mesh);
      this.gpgpu.mesh.geometry.dispose();
      this.gpgpu.mesh.material.dispose();
    }

    let selectedModel = this.resources.models[modelName].scene.children[0];

    // If the selected object is not a mesh (e.g. a Group), find the first mesh inside it
    if (!selectedModel.geometry) {
      console.warn(`Object ${modelName} is not a Mesh (likely a Group). Searching for mesh...`);
      let foundMesh = null;
      this.resources.models[modelName].scene.traverse((child) => {
        if (child.isMesh && !foundMesh) {
          foundMesh = child;
        }
      });

      if (foundMesh) {
        console.log('Found nested mesh:', foundMesh);
        selectedModel = foundMesh;
      } else {
        console.error(`Could not find any mesh in ${modelName} model!`);
        return; // Stop to prevent crash
      }
    }

    this.model = selectedModel;

    this.setupGPGPU();
    this.setupDebug();
  }

  updateVisualization(data) {
    if (!data) return;

    const s = data.marketChangePercent; // Direction
    const vix = data.vix || 20; // Uncertainty
    const fg = data.fearGreedIndex || 50; // Emotion
    const volRatio = data.volumeRatio || 1.0; // Heat
    const yieldVal = data.tenYearYield || 4.0; // Atmosphere

    // --- 1. DETERMINE MOOD STATE ---
    let moodHue, moodSat, moodLight;
    let moodName = "Neutral";

    if (s >= 0) {
      // --- BULLISH STATES ---
      if (s > 1.0 && vix < 20) {
        // EUPHORIA (Perfect conditions)
        moodName = "Euphoria";
        moodHue = 45; // Gold/Yellow
        moodSat = 95;
        moodLight = 60;
      } else if (s > 0.5 && yieldVal < 4.0) {
        // HEALTHY GROWTH (Low stress)
        moodName = "Growth";
        moodHue = 160; // Emerald/Teal
        moodSat = 80;
        moodLight = 50;
      } else if (yieldVal > 4.2) {
        // CAUTION (Gains but high yields/stress)
        moodName = "Caution";
        moodHue = 60; // Olive/Amber
        moodSat = 70;
        moodLight = 45;
      } else {
        // STANDARD DAY
        moodName = "Steady";
        moodHue = 180; // Cyan/Teal
        moodSat = 65;
        moodLight = 45;
      }
    } else {
      // --- BEARISH STATES ---
      if (s < -1.5 || vix > 30) {
        // PANIC (Crash or High Fear)
        moodName = "Panic";
        moodHue = 340; // Hot Magenta/Red
        moodSat = 95;
        moodLight = 45;
      } else if (Math.abs(s) < 0.2 && vix > 25) {
        // CONFUSION (Flat but volatile)
        moodName = "Confusion";
        moodHue = 260; // Foggy Purple
        moodSat = 40;
        moodLight = 50;
      } else if (s < -1.0 && volRatio < 0.8) {
        // DESPAIR (Drop with low interest)
        moodName = "Despair";
        moodHue = 240; // Desaturated Violet
        moodSat = 30; // Drained
        moodLight = 30; // Dark
      } else {
        // CORRECTION (Normal drop)
        moodName = "Correction";
        moodHue = 220; // Slate Blue
        moodSat = 50;
        moodLight = 40;
      }
    }

    // --- 2. APPLY MODIFIERS ---

    // YIELD TEMPERATURE SHIFT
    // High Yields (>4.0) -> Warmer (+Hue towards Yellow)
    // Low Yields (<3.5) -> Cooler (-Hue towards Blue)
    // We apply a subtle shift.
    const tempShift = (yieldVal - 4.0) * 10; // +/- 10 degrees
    // Don't shift Red/Magenta too much as it breaks meaning
    if (moodHue > 100 && moodHue < 300) {
      moodHue -= tempShift; // Higher yield = lower hue (Blue -> Teal -> Green -> Yellow) = Warmer for cool colors?
      // Actually: Blue(240) -> Teal(180) -> Green(120) -> Yellow(60). So Subtracting Hue = Warmer.
      // Yes. High Yield (4.5) -> shift -5. Low Yield (3.5) -> shift +5.
    }

    // VOLUME HEAT (SATURATION BOOSTER)
    // High Volume = More Intense
    const heatFactor = (volRatio - 1.0) * 20; // +/- 20%
    moodSat = Math.max(20, Math.min(100, moodSat + heatFactor));

    // GREED BRIGHTNESS override
    if (fg > 80) {
      moodLight += 10;
      moodSat += 10; // Glowing
    }

    // Micro-Variation based on Day
    moodHue += (data.day % 5) * 2;


    const finalColor = new THREE.Color(`hsl(${moodHue}, ${moodSat}%, ${moodLight}%)`);
    // console.log(`Mood: ${moodName} | Color: ${moodHue.toFixed(0)}/${moodSat.toFixed(0)}/${moodLight.toFixed(0)}`);


    // --- 3. PHYSICS & ATMOSPHERE ---
    // (Retaining logic from previous plan but mapping to new vars)

    const volumeFactor = volRatio;
    const targetForce = 0.2 + (data.volatility * 0.8) + (volumeFactor * 0.2);
    const targetNoiseFreq = 0.5 + (volumeFactor * 0.5);

    const atmosphereWeight = Math.min(1.0, Math.max(0, (yieldVal - 3.0) / 2.0));
    const targetAlpha = 0.04 + (atmosphereWeight * 0.05);

    const greedFactor = fg / 100.0;
    const moveSignificance = Math.abs(s);
    const targetSize = 1.5 + (moveSignificance * 1.5) + (greedFactor * 1.0);

    // --- TRANSITIONS ---
    gsap.to(this.params.color, {
      r: finalColor.r,
      g: finalColor.g,
      b: finalColor.b,
      duration: 2.0,
      ease: 'power2.out',
      onUpdate: () => {
        if (this.gpgpu && this.gpgpu.material) {
          this.gpgpu.material.uniforms.uColor.value.copy(this.params.color);
        }
      }
    });

    if (this.gpgpu && this.gpgpu.material) {
      gsap.to(this.gpgpu.material.uniforms.uForce, {
        value: targetForce,
        duration: 2.5
      });

      gsap.to(this.gpgpu.material.uniforms.uParticleSize, {
        value: targetSize,
        duration: 2.5,
        ease: 'back.out(1.0)'
      });

      gsap.to(this.params, {
        minAlpha: targetAlpha,
        duration: 2.0
      });
    }

    this.currentBaseSize = targetSize;
    if (this.particlesFolder) this.particlesFolder.controllers.forEach(c => c.updateDisplay());
  }

  update() {
    if (this.gpgpu) {
      // Continuous modulation
      if (this.currentData) {
        const time = performance.now() * 0.001;
        const vix = this.currentData.vix || 20;

        // Pulse Speed: High VIX = Fast Hypervenilation. Low VIX = Slow Deep Breath.
        let pulseSpeed = 1.0 + (vix / 10.0); // 2.0 to 5.0 rad/s
        let pulseAmp = 0.4;

        // PANIC EFFECT: Fast jittery pulse
        if (vix > 30) {
          pulseSpeed = 8.0;
          pulseAmp = 0.2; // Shallow fast breaths
        }

        const pulse = 1.0 + Math.sin(time * pulseSpeed) * pulseAmp;

        // Apply
        const finalSize = this.params.size * pulse;
        this.gpgpu.material.uniforms.uParticleSize.value = finalSize;

        // Noise/Wobble on Force
        if (this.gpgpu.uniforms.velocityUniforms) {
          // Add noise based on VIX
          const noise = (Math.random() - 0.5) * (vix / 100.0);
          this.gpgpu.uniforms.velocityUniforms.uForce.value = this.params.force + noise;
        }
      } else {
        // Fallback if no data loaded yet
        if (this.gpgpu.uniforms.velocityUniforms)
          this.gpgpu.uniforms.velocityUniforms.uForce.value = this.params.force;
      }

      this.gpgpu.compute();
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new Experience(document.querySelector('canvas.experience__canvas'), Mask);
})