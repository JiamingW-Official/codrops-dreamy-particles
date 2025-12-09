import Handler from './abstract/Handler.js';
import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';


export default class Camera extends Handler {

  static instance;

  constructor() {
    super(Camera.id);

    this.scene = this.experience.scene;
    this.canvas = this.experience.canvas;
    this.mouse = this.experience.mouse;
    this.debug = this.experience.debug;

    this.moveForward = false;
    this.moveBackward = false;
    this.moveLeft = false;
    this.moveRight = false;
    this.moveUp = false;
    this.moveDown = false;
    this.shakeIntensity = 0;

    // Setup

    this.setupCamera();
    this.setupControls();
  }


  static getInstance() {
    if (!Camera.instance) {
      Camera.instance = new Camera();
    }

    return Camera.instance;
  }


  setupCamera() {
    this.target = new THREE.PerspectiveCamera(50, this.sizes.aspect, 0.1, 1000);
    this.target.position.setZ(3);
    this.target.position.setY(0);

    this.scene.add(this.target);

    // Dummy target for smooth controls
    this.cameraTarget = new THREE.Object3D();
    this.cameraTarget.position.copy(this.target.position);
    this.cameraTarget.rotation.copy(this.target.rotation);

    this.resize();
  }


  setupControls() {
    // Control the dummy target instead of the actual camera
    this.controls = new PointerLockControls(this.cameraTarget, this.canvas);
    this.controls.pointerSpeed = 1.5; // Increased sensitivity

    // Click to lock - ENABLED for Look Around
    this.canvas.addEventListener('click', () => {
      this.controls.lock();
    });

    const onKeyDown = (event) => {
      switch (event.code) {
        case 'KeyW':
          this.moveForward = true;
          break;
        case 'KeyA':
          this.moveLeft = true;
          break;
        case 'KeyS':
          this.moveBackward = true;
          break;
        case 'KeyD':
          this.moveRight = true;
          break;
        case 'ArrowUp':
          this.moveUp = true;
          break;
        case 'ArrowDown':
          this.moveDown = true;
          break;
      }
    };

    const onKeyUp = (event) => {
      switch (event.code) {
        case 'KeyW':
          this.moveForward = false;
          break;
        case 'KeyA':
          this.moveLeft = false;
          break;
        case 'KeyS':
          this.moveBackward = false;
          break;
        case 'KeyD':
          this.moveRight = false;
          break;
        case 'ArrowUp':
          this.moveUp = false;
          break;
        case 'ArrowDown':
          this.moveDown = false;
          break;
      }
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
  }


  setupCinematicMovement() {

  }


  resize() {
    this.target.aspect = this.sizes.aspect;
    this.target.updateProjectionMatrix();
  }


  update(state) {
    const delta = state ? state.delta : 0.016;
    
    if (this.controls) {
      const speed = 5.0 * delta; // Slower, more controlled speed

      // Move the dummy target
      if (this.moveForward) this.controls.moveForward(speed);
      if (this.moveBackward) this.controls.moveForward(- speed);
      if (this.moveLeft) this.controls.moveRight(- speed);
      if (this.moveRight) this.controls.moveRight(speed);

      if (this.moveUp) this.cameraTarget.position.y += speed;
      if (this.moveDown) this.cameraTarget.position.y -= speed;

      // Physical Constraints on dummy target
      if (this.cameraTarget.position.y < -5.0) this.cameraTarget.position.y = -5.0;
      const maxDist = 50;
      if (this.cameraTarget.position.length() > maxDist) {
        this.cameraTarget.position.setLength(maxDist);
      }
    }

    // Smoothly interpolate actual camera to dummy target
    // Damping factor: lower = smoother/slower (Phase In/Out feel)
    const damping = 0.08;
    this.target.position.lerp(this.cameraTarget.position, damping);
    this.target.quaternion.slerp(this.cameraTarget.quaternion, damping);

    // Lightweight parallax with mouse to add responsiveness without heavy cost
    if (this.mouse?.cursorPosition) {
      const parallax = 0.09; // Reduced by 40% (from 0.15 to 0.09)
      this.target.position.x += this.mouse.cursorPosition.x * parallax * delta;
      this.target.position.y += this.mouse.cursorPosition.y * parallax * delta;
    }

    // --- CAMERA SHAKE (Visceral Panic) - More Obvious ---
    if (this.shakeIntensity > 0) {
      const shakeAmount = this.shakeIntensity * 0.3; // Increased from 0.1 to 0.3 for more obvious shake
      // Add frequency-based shake for more realistic effect
      const shakeX = (Math.random() - 0.5) * shakeAmount;
      const shakeY = (Math.random() - 0.5) * shakeAmount;
      const shakeZ = (Math.random() - 0.5) * shakeAmount * 0.5; // Less Z shake
      this.target.position.x += shakeX;
      this.target.position.y += shakeY;
      this.target.position.z += shakeZ;
      
      // Add rotation shake for more dramatic effect
      if (this.target.rotation) {
        this.target.rotation.x += (Math.random() - 0.5) * shakeAmount * 0.02;
        this.target.rotation.y += (Math.random() - 0.5) * shakeAmount * 0.02;
      }
    }
  }
}