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
    if (!this.gpgpu) return;

    // Store data for continuous animation in update()
    this.currentData = data;

    // 1. GENERATIVE HSL COLOR ALGORITHM
    // We create a unique "Fingerprint" color for each day.

    // HUE: Mapped to Market Sentiment (The "Mood")
    // -1.0 (Crash) -> 270 (Deep Purple)
    // 0.0 (Neutral) -> 210 (Silver/Blue)
    // 1.0 (Rally) -> 45 (Gold)

    let hue = 210; // Neutral default
    if (data.sentiment < 0) {
      // Bearish: 210 -> 270
      hue = 210 - (data.sentiment * -1.0) * 60; // 210 + 60 = 270? Wait math: 210 + (abs * 60)
      hue = 210 + (Math.abs(data.sentiment) * 60);
    } else {
      // Bullish: 210 -> 45 (wrap around? No, let's go 210 -> 180 -> 100 -> 45)
      // Let's use a lerp logic.
      // sentiment 0 -> 210. sentiment 1 -> 45.
      // dist is 165deg. 
      hue = 210 - (data.sentiment * 165);
    }

    // SATURATION: Mapped to Volatility (The "Clarity")
    // High Volatility -> Lower Saturation (Muddy/Stormy)
    // Low Volatility -> High Saturation (Clear/Crystal)
    let saturation = 100 - (data.volatility * 100);
    saturation = Math.max(20, Math.min(90, saturation)); // Clamp

    // LIGHTNESS: Mapped to Fear & Greed (The "Energy")
    // Extreme Fear (low index) -> Darker
    // Extreme Greed (high index) -> Brighter
    let lightness = data.fearGreedIndex; // 0 to 100 directly map
    lightness = Math.max(30, Math.min(95, lightness)); // Clamp to ensure visibility

    // Convert to THREE Color
    let targetColor = new THREE.Color(`hsl(${hue}, ${saturation}%, ${lightness}%)`);

    gsap.to(this.params.color, {
      r: targetColor.r, g: targetColor.g, b: targetColor.b,
      duration: 3.5, ease: "power2.inOut",
      onUpdate: () => { this.gpgpu.material.uniforms.uColor.value.copy(this.params.color); }
    });

    // 2. Force (Base force)
    let targetForce = data.volatility * 2.0;
    targetForce = Math.min(Math.max(targetForce, 0.2), 1.0);
    this.currentBaseForce = targetForce; // Store base force

    gsap.to(this.params, {
      force: targetForce,
      duration: 4.0, ease: "sine.inOut",
      onUpdate: () => {
        // Note: update() loop will now handle force application to allow for pulsing
        // But we still tween the parameter for UI feedback or fallback
      }
    });

    // 3. Size (Base size)
    let strength = Math.abs(data.sentiment);
    let targetSize = 1.0 + (strength * 3.0);
    this.currentBaseSize = targetSize;

    gsap.to(this.params, {
      size: targetSize,
      duration: 3.0, ease: "power3.out"
    });

    if (this.particlesFolder) this.particlesFolder.controllers.forEach(c => c.updateDisplay());
  }

  update() {
    if (this.gpgpu) {
      // Continuous modulation based on volatility
      if (this.currentData) {
        const time = performance.now() * 0.001;
        const volatility = this.currentData.volatility || 0.3;
        const sentiment = this.currentData.sentiment || 0;

        // Effect 1: Size Pulsing (Heartbeat of the market)
        // High volatility + Fear = Fast, erratic pulse
        // High volatility + Greed = Slow, big swell
        // Low volatility = Minimal pulse

        let pulseSpeed = volatility * 4.0;
        let pulseAmp = volatility * 0.5;

        // Greed (Positive Sentiment) makes swelling slower but larger 'breathing'
        if (sentiment > 0.2) {
          pulseSpeed *= 0.5; // Slower
          pulseAmp *= 1.2;   // Bigger
        }

        const pulse = 1.0 + Math.sin(time * pulseSpeed) * pulseAmp;

        // Apply pulsating size
        // Base size is tweened in params.size, we multiply it
        const finalSize = this.params.size * pulse;
        this.gpgpu.material.uniforms.uParticleSize.value = finalSize;

        // Effect 2: Force Noise (Jitter)
        // Add slight randomness to force on high volatility
        if (volatility > 0.4) {
          const jitter = (Math.random() - 0.5) * volatility * 0.2;
          if (this.gpgpu.uniforms.velocityUniforms)
            this.gpgpu.uniforms.velocityUniforms.uForce.value = this.params.force + jitter;
        } else {
          if (this.gpgpu.uniforms.velocityUniforms)
            this.gpgpu.uniforms.velocityUniforms.uForce.value = this.params.force;
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