import * as THREE from 'three';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import Experience from './Experience.js';

export default class KeywordCloud {
    constructor() {
        this.experience = new Experience(); // Singleton
        this.scene = this.experience.scene;
        this.camera = this.experience.camera;

        this.group = new THREE.Group();
        this.scene.add(this.group);

        this.words = [];
        this.font = null;

        this.loader = new FontLoader();
        this.loader.load('/fonts/helvetiker_regular.typeface.json', (font) => {
            this.font = font;
            // console.log('Font loaded for keywords');
        });

        // Stop words to ignore
        this.stopWords = new Set(['stock', 'market', 'daily', 'news', 'update', 'today', 'price',
            'shares', 'gains', 'losses', 'drop', 'rise', 'fall', 'plunge',
            'record', 'highs', 'lows', 'watch', 'moves', 'action', 'closely']);
    }

    updateHeadlines(headlines) {
        if (!this.font || !headlines) return;

        // Clear old words
        this.words.forEach(mesh => {
            mesh.geometry.dispose();
            mesh.material.dispose();
            this.group.remove(mesh);
        });
        this.words = [];

        // 1. Extract Keywords
        const textBlob = headlines.map(h => h.title).join(' ').toLowerCase();
        const tokens = textBlob.match(/\b\w+\b/g) || [];

        const counts = {};
        tokens.forEach(t => {
            if (t.length > 3 && !this.stopWords.has(t)) {
                counts[t] = (counts[t] || 0) + 1;
            }
        });

        // Sort by frequency
        const sorted = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
        const topWords = sorted.slice(0, 8); // Top 8 words

        if (topWords.length === 0) return;

        // 2. Create Meshes
        const material = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.6,
            side: THREE.DoubleSide
        });

        topWords.forEach((word, i) => {
            const geometry = new TextGeometry(word.toUpperCase(), {
                font: this.font,
                size: 0.15,
                height: 0.02, // Thickness
                curveSegments: 4,
            });

            geometry.center(); // Center local pivot

            const mesh = new THREE.Mesh(geometry, material);

            // 3. Position: Spherical Cloud
            // Distribute evenly
            const phi = Math.acos(-1 + (2 * i) / topWords.length);
            const theta = Math.sqrt(topWords.length * Math.PI) * phi;

            const radius = 3.5; // Orbit radius outside particles
            mesh.position.setFromSphericalCoords(radius, phi, theta);
            mesh.lookAt(0, 0, 0); // Look at center (inverse billboard?) 
            // Actually, text should face camera is better, but "Orbiting Cloud" implies fixed orientation?
            // Let's make them face center, so it's like a sphere of data. 
            // Or better: Billboard them in update loop.

            // Random offset for organic feel
            mesh.userData = {
                word: word,
                angle: Math.random() * Math.PI * 2,
                speed: 0.2 + Math.random() * 0.2,
                yOffset: (Math.random() - 0.5) * 2.0
            };

            this.group.add(mesh);
            this.words.push(mesh);
        });
    }

    update(time) {
        // Slowly rotate entire group
        this.group.rotation.y = time * 0.1;
        this.group.rotation.z = Math.sin(time * 0.05) * 0.1;

        // Individual bobbing
        this.words.forEach(mesh => {
            // Billboard to camera
            if (this.experience.camera && this.experience.camera.instance) {
                mesh.lookAt(this.experience.camera.instance.position);
            }
        });
    }

    // New Interaction Method
    checkIntersects(raycaster) {
        if (!this.group || this.words.length === 0) return null;

        const intersects = raycaster.intersectObjects(this.words, false);

        if (intersects.length > 0) {
            // Reset all colors
            this.words.forEach(w => w.material.color.setHex(0xffffff));

            // Highlight hovered
            const hit = intersects[0].object;
            hit.material.color.setHex(0x00ffaa); // Green highlight

            // Return word info
            return hit.userData.word; // Assuming we stored it
        } else {
            this.words.forEach(w => w.material.color.setHex(0xffffff));
        }
        return null;
    }
}
