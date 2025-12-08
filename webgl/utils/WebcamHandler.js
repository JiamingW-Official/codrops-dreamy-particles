import { EventEmitter } from 'events';
import * as THREE from 'three';

export default class WebcamHandler extends EventEmitter {
    static instance;

    constructor() {
        super();

        if (WebcamHandler.instance) {
            return WebcamHandler.instance;
        }
        WebcamHandler.instance = this;

        this.video = document.createElement('video');
        this.video.autoplay = true;
        this.video.muted = true;
        this.video.playsInline = true;
        this.video.style.display = 'none';
        document.body.appendChild(this.video);

        this.texture = new THREE.VideoTexture(this.video);
        this.texture.minFilter = THREE.LinearFilter;
        this.texture.magFilter = THREE.LinearFilter;
        this.texture.format = THREE.RGBAFormat;

        this.ready = false;

        this.init();
    }

    static getInstance() {
        if (!WebcamHandler.instance) {
            WebcamHandler.instance = new WebcamHandler();
        }
        return WebcamHandler.instance;
    }

    async init() {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } });
                this.video.srcObject = stream;
                this.video.play();

                this.video.addEventListener('loadeddata', () => {
                    this.ready = true;
                    this.emit('ready');
                });
            } catch (error) {
                console.error('Error accessing webcam:', error);
            }
        } else {
            console.error('getUserMedia not supported');
        }
    }
}
