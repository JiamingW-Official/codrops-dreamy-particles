import * as THREE from 'three';
import GPGPUUtils from './GPGPUUtils.js';
import GPGPUEvents from './GPGPUEvents.js';
import { GPUComputationRenderer } from 'three/addons/misc/GPUComputationRenderer.js';
import simFragment from './shaders/simFragment.glsl';
import simFragmentVelocity from './shaders/simFragmentVelocity.glsl';
import vertexShader from './shaders/vertex.glsl';
import fragmentShader from './shaders/fragment.glsl';

export default class GPGPU {
    constructor({ size, camera, renderer, mouse, scene, model, sizes, debug, audio, webcam, params }) {
        this.camera = camera; // Camera
        this.renderer = renderer; // Renderer
        this.mouse = mouse; // Mouse, our cursor position
        this.scene = scene; // Global scene
        this.sizes = sizes; // Sizes of the scene, canvas, pixel ratio
        this.size = size; // Amount of GPGPU particles
        this.model = model; // Mesh from which we will sample the particles
        this.debug = debug; // Debug
        this.audio = audio; // Audio Handler
        this.webcam = webcam; // Webcam Handler
        this.params = params; // Parameters for the GPGPU

        this.init();
    }


    init() {
        this.utils = new GPGPUUtils(this.model, this.size); // Setup GPGPUUtils

        this.initGPGPU();

        this.events = new GPGPUEvents(this.mouse, this.camera, this.model, this.uniforms);

        this.createParticles();
    }

    initGPGPU() {
        // Use the configured simulation size instead of the viewport width to
        // avoid creating giant GPU textures that stall the first render.
        this.gpgpuCompute = new GPUComputationRenderer(this.size, this.size, this.renderer);

        const positionTexture = this.utils.getPositionTexture();
        const velocityTexture = this.utils.getVelocityTexture();

        this.positionVariable = this.gpgpuCompute.addVariable('uCurrentPosition', simFragment, positionTexture);
        this.velocityVariable = this.gpgpuCompute.addVariable('uCurrentVelocity', simFragmentVelocity, velocityTexture);

        this.gpgpuCompute.setVariableDependencies(this.positionVariable, [this.positionVariable, this.velocityVariable]);
        this.gpgpuCompute.setVariableDependencies(this.velocityVariable, [this.positionVariable, this.velocityVariable]);

        this.uniforms = {
            positionUniforms: this.positionVariable.material.uniforms,
            velocityUniforms: this.velocityVariable.material.uniforms
        }


        this.uniforms.velocityUniforms.uMouse = { value: new THREE.Vector3(1000, 1000, 1000) }; // Initialize far away
        this.uniforms.velocityUniforms.uMouseSpeed = { value: 0 };
        this.uniforms.velocityUniforms.uOriginalPosition = { value: positionTexture }
        this.uniforms.velocityUniforms.uTime = { value: 0 };
        this.uniforms.velocityUniforms.uForce = { value: this.params.force }; // Original: params.force (~0.2)
        this.uniforms.velocityUniforms.uAttraction = { value: 0.02 }; // Keep for transition dynamics
        this.uniforms.velocityUniforms.uTapIntensity = { value: 0 };

        // Audio Uniforms for Simulation
        this.uniforms.velocityUniforms.uAudioBass = { value: 0 };
        this.uniforms.velocityUniforms.uAudioMid = { value: 0 };
        this.uniforms.velocityUniforms.uAudioHigh = { value: 0 };
        this.uniforms.velocityUniforms.uAudioLevel = { value: 0 };

        // Webcam Uniforms
        this.uniforms.velocityUniforms.uWebcamTexture = { value: new THREE.Texture() };
        this.uniforms.velocityUniforms.uWebcamEnabled = { value: 0 };

        this.gpgpuCompute.init();
    }

    createParticles() {
        this.material = new THREE.ShaderMaterial({
            uniforms: {
                uPositionTexture: { value: this.gpgpuCompute.getCurrentRenderTarget(this.positionVariable).texture },
                uVelocityTexture: { value: this.gpgpuCompute.getCurrentRenderTarget(this.velocityVariable).texture },
                uResolution: { value: new THREE.Vector2(this.sizes.width, this.sizes.height) },
                uParticleSize: { value: this.params.size },
                uColor: { value: this.params.color },
                uMinAlpha: { value: this.params.minAlpha },
                uMaxAlpha: { value: this.params.maxAlpha },

                // Audio Uniforms for Rendering
                uAudioBass: { value: 0 },
                uAudioMid: { value: 0 },
                uAudioHigh: { value: 0 },
                uAudioLevel: { value: 0 },
                uMarketIntensity: { value: 0 },
                uExtremeFear: { value: 0 }, // Extreme fear state for enhanced reactions
                uTime: { value: 0 },
                
                // Mouse Uniforms for Particle Highlighting
                uMouse: { value: new THREE.Vector3(0, 0, 0) },
                uMouseSpeed: { value: 0 },
                uTapIntensity: { value: 0 },
                
                // Webcam Uniforms for Visual Effects
                uWebcamTexture: { value: new THREE.Texture() },
                uWebcamEnabled: { value: 0 },
            },
            vertexShader,
            fragmentShader,
            depthWrite: false,
            depthTest: false,
            blending: THREE.AdditiveBlending,
            transparent: true
        })


        // Setup Particles Geometry

        const geometry = new THREE.BufferGeometry();


        // Get positions, uvs data for geometry attributes

        const positions = this.utils.getPositions();
        const uvs = this.utils.getUVs();


        // Set geometry attributes

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));


        // Setup Points

        this.mesh = new THREE.Points(geometry, this.material);
        this.scene.add(this.mesh);
    }


    updateTarget(newMesh, precomputed) {
        // Allow callers to pass precomputed textures to avoid sampling work on the switch path.
        let positionTexture = precomputed?.positionTexture;

        if (!positionTexture) {
            const tempUtils = new GPGPUUtils(newMesh, this.size);
            positionTexture = tempUtils.getPositionTexture();
            tempUtils.sampler = null;
            tempUtils.mesh = null;
        }

        if (this.uniforms.velocityUniforms.uOriginalPosition) {
            this.uniforms.velocityUniforms.uOriginalPosition.value = positionTexture;
        }

        if (this.events) {
            this.events.updateGeometry(newMesh);
        }
    }

    compute() {
        // Update Audio Uniforms
        if (this.audio && this.audio.ready) {
            const { bass, mid, high, level } = this.audio.frequencyData;

            this.uniforms.velocityUniforms.uAudioBass.value = bass;
            this.uniforms.velocityUniforms.uAudioMid.value = mid;
            this.uniforms.velocityUniforms.uAudioHigh.value = high;
            this.uniforms.velocityUniforms.uAudioLevel.value = level;

            this.material.uniforms.uAudioBass.value = bass;
            this.material.uniforms.uAudioMid.value = mid;
            this.material.uniforms.uAudioHigh.value = high;
            this.material.uniforms.uAudioLevel.value = level;
            this.material.uniforms.uAudioLevel.value = level;
        }

        // Update Webcam Uniforms
        if (this.webcam && this.webcam.ready) {
            this.uniforms.velocityUniforms.uWebcamTexture.value = this.webcam.texture;
            this.uniforms.velocityUniforms.uWebcamEnabled.value = 1;
            // Also update fragment shader webcam uniforms
            this.material.uniforms.uWebcamTexture.value = this.webcam.texture;
            this.material.uniforms.uWebcamEnabled.value = 1;
        } else {
            this.uniforms.velocityUniforms.uWebcamEnabled.value = 0;
            this.material.uniforms.uWebcamEnabled.value = 0;
        }

        this.material.uniforms.uTime.value += 0.01;

        // Update Mouse Uniforms for Particle Highlighting
        if (this.uniforms.velocityUniforms.uMouse) {
            this.material.uniforms.uMouse.value.copy(this.uniforms.velocityUniforms.uMouse.value);
        }
        if (this.uniforms.velocityUniforms.uMouseSpeed) {
            this.material.uniforms.uMouseSpeed.value = this.uniforms.velocityUniforms.uMouseSpeed.value;
        }
        if (this.uniforms.velocityUniforms.uTapIntensity) {
            this.material.uniforms.uTapIntensity.value = this.uniforms.velocityUniforms.uTapIntensity.value;
        }

        this.gpgpuCompute.compute();
        this.events.update();
    }
}