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

    // Click to lock
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
    if (this.controls && this.controls.isLocked) {
      const delta = state ? state.delta : 0.016;
      const speed = 10.0 * delta;

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
    // Damping factor: lower = smoother/slower
    const damping = 0.15;
    this.target.position.lerp(this.cameraTarget.position, damping);
    this.target.quaternion.slerp(this.cameraTarget.quaternion, damping);

    // --- CAMERA SHAKE (Visceral Panic) ---
    if (this.shakeIntensity > 0) {
      const shakeAmount = this.shakeIntensity * 0.1; // Scale factor
      this.target.position.x += (Math.random() - 0.5) * shakeAmount;
      this.target.position.y += (Math.random() - 0.5) * shakeAmount;
      this.target.position.z += (Math.random() - 0.5) * shakeAmount;
    }
  }
}