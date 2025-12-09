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
        this.gpgpuCompute = new GPUComputationRenderer(this.sizes.width, this.sizes.width, this.renderer);

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


        this.uniforms.velocityUniforms.uMouse = { value: this.mouse.cursorPosition };
        this.uniforms.velocityUniforms.uMouseSpeed = { value: 0 };
        this.uniforms.velocityUniforms.uOriginalPosition = { value: positionTexture }
        this.uniforms.velocityUniforms.uTime = { value: 0 };
        this.uniforms.velocityUniforms.uForce = { value: 0.3 }; // Medium friction
        this.uniforms.velocityUniforms.uAttraction = { value: 0.02 }; // Low attraction = slow recovery (~2s)
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
                uTime: { value: 0 },
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


    updateTarget(newMesh) {
        // Create new utilities for the new mesh to sample positions
        const tempUtils = new GPGPUUtils(newMesh, this.size);

        // This computes the new texture from the new mesh
        const newPositionTexture = tempUtils.getPositionTexture();

        // Update the 'Original' position uniform (this is the target for attraction)
        if (this.uniforms.velocityUniforms.uOriginalPosition) {
            this.uniforms.velocityUniforms.uOriginalPosition.value = newPositionTexture;
        }

        // CRITICAL: Update Events/Interaction Raycaster to new mesh
        if (this.events) {
            this.events.updateGeometry(newMesh);
        }

        // Clean up temp sampler if needed (GPGPUUtils doesn't have dispose, but it's just arrays)
        tempUtils.sampler = null;
        tempUtils.mesh = null;
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
        } else {
            this.uniforms.velocityUniforms.uWebcamEnabled.value = 0;
        }

        this.material.uniforms.uTime.value += 0.01;

        this.gpgpuCompute.compute();
        this.events.update();
    }
}