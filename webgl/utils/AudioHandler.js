import * as THREE from 'three';
import { EventEmitter } from 'events';

export default class AudioHandler extends EventEmitter {
    static instance;


    constructor() {
        super();

        this.ready = false;
        this.tracks = {};
        this.currentMood = null;
        this.volume = 0.5;

        // Visualizer Data
        this.frequencyData = {
            bass: 0,
            mid: 0,
            high: 0,
            level: 0
        };

        this.trackConfig = {
            'extreme_fear': './audio/Extreme Fear : Crash.wav',
            'fear': './audio/Fear : Correction.wav',
            'neutral': './audio/Neutral : Uncertainty1wav.wav',
            'greed': './audio/Greed : Steady Growth.wav',
            'extreme_greed': './audio/Extreme Greed : Bull Run.wav'
        };

        this.sources = {};
        this.gains = {};

        this.setupAudio();
    }

    static getInstance() {
        if (!AudioHandler.instance) AudioHandler.instance = new AudioHandler();
        return AudioHandler.instance;
    }

    setupAudio() {
        this.listener = new THREE.AudioListener();
        this.context = this.listener.context;

        // Master Analyser
        this.analyser = this.context.createAnalyser();
        this.analyser.fftSize = 2048;

        // Master Gain (Volume)
        this.masterGain = this.context.createGain();
        this.masterGain.gain.value = this.volume;

        this.masterGain.connect(this.analyser);
        this.analyser.connect(this.context.destination);

        // Frequency ranges
        this.frequencyRange = {
            bass: [20, 140],
            mid: [400, 2600],
            high: [5200, 14000],
        };

        // User interaction starter
        const startAudio = () => {
            if (!this.ready) {
                this.loadAllTracks().then(() => {
                    this.ready = true;
                    this.emit('ready');
                    console.log("Audio System Ready - Waiting for Mood");
                });

                // Resume context if suspended
                if (this.context.state === 'suspended') {
                    this.context.resume();
                }

                window.removeEventListener('click', startAudio);
                window.removeEventListener('keydown', startAudio);
            }
        };

        window.addEventListener('click', startAudio);
        window.addEventListener('keydown', startAudio);
    }

    async loadAllTracks() {
        const loader = new THREE.AudioLoader();
        const promises = Object.entries(this.trackConfig).map(async ([mood, path]) => {
            return new Promise((resolve, reject) => {
                loader.load(path, (buffer) => {
                    this.tracks[mood] = buffer;
                    resolve();
                }, undefined, reject);
            });
        });

        await Promise.all(promises);
        console.log("All soundtracks loaded");
    }

    setMood(mood) {
        if (!this.ready || !this.tracks[mood]) return;
        if (this.currentMood === mood) return;

        console.log(`Transitioning Audio: ${this.currentMood} -> ${mood}`);

        const now = this.context.currentTime;
        const fadeTime = 4.0; // Slow, cinematic crossfade

        // 1. Fade out current track
        if (this.currentMood && this.gains[this.currentMood]) {
            const oldGain = this.gains[this.currentMood];
            oldGain.gain.cancelScheduledValues(now);
            oldGain.gain.setValueAtTime(oldGain.gain.value, now);
            oldGain.gain.linearRampToValueAtTime(0, now + fadeTime);

            // Garbage collect source
            const oldSource = this.sources[this.currentMood];
            setTimeout(() => {
                oldSource.stop();
                oldSource.disconnect();
            }, fadeTime * 1000 + 100);
        }

        // 2. Start new track
        const source = this.context.createBufferSource();
        source.buffer = this.tracks[mood];
        source.loop = true;

        const gainNode = this.context.createGain();
        gainNode.gain.value = 0;

        source.connect(gainNode);
        gainNode.connect(this.masterGain);

        source.start(0);

        // Fade in
        gainNode.gain.cancelScheduledValues(now);
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(1.0, now + fadeTime);

        // Store references
        this.sources[mood] = source;
        this.gains[mood] = gainNode;
        this.currentMood = mood;
        this.isPlaying = true;
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

        const data = new Uint8Array(this.analyser.frequencyBinCount);
        this.analyser.getByteFrequencyData(data);

        const avg = data.reduce((a, b) => a + b, 0) / data.length;

        this.frequencyData.bass = this.getFrequencyRangeValue(data, this.frequencyRange.bass);
        this.frequencyData.mid = this.getFrequencyRangeValue(data, this.frequencyRange.mid);
        this.frequencyData.high = this.getFrequencyRangeValue(data, this.frequencyRange.high);
        this.frequencyData.level = avg / 255;
    }
}
