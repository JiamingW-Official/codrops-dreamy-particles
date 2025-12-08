import * as THREE from 'three';
import { EventEmitter } from 'events';

export default class AudioHandler extends EventEmitter {
    static instance;

    constructor() {
        super();

        this.ready = false;
        this.isPlaying = false;
        this.volume = 0.5;

        this.frequencyData = {
            bass: 0,
            mid: 0,
            high: 0,
            level: 0
        };

        this.setupAudio();
    }

    static getInstance() {
        if (!AudioHandler.instance) AudioHandler.instance = new AudioHandler();
        return AudioHandler.instance;
    }

    setupAudio() {
        this.listener = new THREE.AudioListener();
        this.sound = new THREE.Audio(this.listener);
        this.loader = new THREE.AudioLoader();

        // Frequency ranges for analysis
        this.frequencyRange = {
            bass: [20, 140],
            mid: [400, 2600],
            high: [5200, 14000],
        };

        // Wait for user interaction
        const startAudio = () => {
            if (!this.ready) {
                this.loadAudio();
                window.removeEventListener('click', startAudio);
                window.removeEventListener('keydown', startAudio);
            }
        };

        window.addEventListener('click', startAudio);
        window.addEventListener('keydown', startAudio);
    }

    loadAudio() {
        const audioPath = './audio/music.mp3';

        this.loader.load(audioPath, (buffer) => {
            this.sound.setBuffer(buffer);
            this.sound.setLoop(true);
            this.sound.setVolume(this.volume);
            this.sound.play();
            this.isPlaying = true;

            this.analyser = new THREE.AudioAnalyser(this.sound, 2048);
            this.ready = true;
            this.emit('ready');
            console.log("Audio Loaded and Playing");
        });
    }

    getFrequencyRangeValue(data, range) {
        const nyquist = 48000 / 2;
        const lowIndex = Math.round(range[0] / nyquist * data.length);
        const highIndex = Math.round(range[1] / nyquist * data.length);
        let total = 0;
        let numFrequencies = 0;

        for (let i = lowIndex; i <= highIndex; i++) {
            total += data[i];
            numFrequencies += 1;
        }
        return total / numFrequencies / 255;
    }

    update() {
        if (!this.ready || !this.analyser) return;

        const data = this.analyser.getFrequencyData();

        this.frequencyData.bass = this.getFrequencyRangeValue(data, this.frequencyRange.bass);
        this.frequencyData.mid = this.getFrequencyRangeValue(data, this.frequencyRange.mid);
        this.frequencyData.high = this.getFrequencyRangeValue(data, this.frequencyRange.high);
        this.frequencyData.level = this.analyser.getAverageFrequency() / 255;
    }
}
