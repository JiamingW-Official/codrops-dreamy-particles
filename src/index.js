import AppController from './AppController.js';
import Experience from '../webgl/Experience.js';
import Mask from '../webgl/Mask.js';

// Initialize the Application Controller and WebGL when the DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log("[Main] Initializing WebGL Experience...");
    const canvas = document.querySelector('canvas.experience__canvas');
    if (canvas) {
        new Experience(canvas, Mask);
    } else {
        console.error("Canvas element not found!");
    }

    console.log("[Main] Initializing AppController...");
    window.app = new AppController();
});
