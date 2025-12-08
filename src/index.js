import AppController from './AppController.js';

// Initialize the Application Controller when the DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log("[Main] Initializing AppController...");
    window.app = new AppController();
});
