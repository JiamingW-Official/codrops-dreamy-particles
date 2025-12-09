import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { MotionBloomPass } from './MotionBloomPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { Vector2 } from 'three';

const RGBShiftShader = {
    uniforms: {
        'tDiffuse': { value: null },
        'amount': { value: 0.005 },
        'angle': { value: 0.0 }
    },
    vertexShader: /* glsl */`
		varying vec2 vUv;
		void main() {
			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
		}`,
    fragmentShader: /* glsl */`
		uniform sampler2D tDiffuse;
		uniform float amount;
		uniform float angle;
		varying vec2 vUv;
		void main() {
			vec2 offset = amount * vec2( cos(angle), sin(angle));
			vec4 cr = texture2D(tDiffuse, vUv + offset);
			vec4 cga = texture2D(tDiffuse, vUv);
			vec4 cb = texture2D(tDiffuse, vUv - offset);
			gl_FragColor = vec4(cr.r, cga.g, cb.b, cga.a);
		}`
};

export default class PostProcessing {

    static instance;

    static getInstance(args) {
        if (!PostProcessing.instance) {
            PostProcessing.instance = new PostProcessing(args);
        }

        return PostProcessing.instance;
    }

    constructor({ renderer, scene, camera, sizes, debug }) {
        this.renderer = renderer;
        this.scene = scene;
        this.camera = camera;
        this.sizes = sizes;
        this.debug = debug;


        this.params = {
            threshold: 0.25, // High clarity
            strength: 1.0,   // Reduced from 1.5 (Subtle, professional)
            radius: 0.1,     // Slight radius for better falloff
            directionX: 1.5,
            directionY: 1,
            rgbAmount: 0.0, // Default 0
        };


        // Debug

        if (this.debug.active) this.debugFolder = this.debug.gui.addFolder('Post Processing');

        this.init();
    }


    init() {
        this.setupEffect();
        this.setupDebug();
    }


    setupEffect() {
        const renderScene = new RenderPass(this.scene, this.camera.target);

        this.bloomPass = new MotionBloomPass(new Vector2(this.sizes.width, this.sizes.height), 1.5, 0.4, 0.85);
        this.bloomPass.threshold = this.params.threshold;
        this.bloomPass.strength = this.params.strength;
        this.bloomPass.radius = this.params.radius;

        // RGB Shift Pass for Panic Glitch
        this.rgbShiftPass = new ShaderPass(RGBShiftShader);
        this.rgbShiftPass.uniforms['amount'].value = 0.0;

        const outputPass = new OutputPass();

        this.composer = new EffectComposer(this.renderer);
        this.composer.addPass(renderScene);
        this.composer.addPass(this.bloomPass);
        this.composer.addPass(this.rgbShiftPass);
        this.composer.addPass(outputPass);
    }

    // --- API For Scene To Control FX ---
    setBloom(strength) {
        if (this.bloomPass) this.bloomPass.strength = strength;
    }

    setBloomParams(params) {
        if (this.bloomPass) {
            if (params.strength !== undefined) this.bloomPass.strength = params.strength;
            if (params.threshold !== undefined) this.bloomPass.threshold = params.threshold;
            if (params.radius !== undefined) this.bloomPass.radius = params.radius;
        }
    }

    setGlitch(amount) {
        if (this.rgbShiftPass) this.rgbShiftPass.uniforms['amount'].value = amount;
    }


    setupDebug() {
        if (this.debug.active) {
            const bloomFolder = this.debugFolder.addFolder('bloom');

            bloomFolder.add(this.params, 'threshold', 0.0, 1.0).onChange((value) => {
                this.bloomPass.threshold = Number(value);
            });

            bloomFolder.add(this.params, 'strength', 0.0, 3.0).onChange((value) => {
                this.bloomPass.strength = Number(value);
            });

            bloomFolder.add(this.params, 'radius', 0.0, 1.0).step(0.01).onChange((value) => {
                this.bloomPass.radius = Number(value);
            });

            bloomFolder.add(this.params, 'directionX', 0.0, 10.0).step(0.01).onChange((value) => {
                this.bloomPass.BlurDirectionX.x = Number(value);
            });

            bloomFolder.add(this.params, 'directionY', 0.0, 10.0).step(0.01).onChange((value) => {
                this.bloomPass.BlurDirectionX.x = Number(value);
            });

            this.debugFolder.add(this.params, 'rgbAmount', 0.0, 0.1).step(0.001).onChange((value) => {
                this.rgbShiftPass.uniforms['amount'].value = Number(value);
            });
        }
    }


    resize() {
        if (this.composer) {
            this.composer.setSize(this.sizes.width, this.sizes.height);
            this.composer.setPixelRatio(this.sizes.pixelRatio);
        }
    }


    update() {
        if (this.composer) this.composer.render();
    }


    dispose() {
        if (this.composer) this.composer.dispose();
    }
}