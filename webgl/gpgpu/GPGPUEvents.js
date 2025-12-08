import * as THREE from 'three';
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh';



export default class GPGPUEvents {

    constructor(mouse, camera, mesh, uniforms) {
        this.camera = camera;
        this.mouse = mouse;
        this.geometry = mesh.geometry;
        this.uniforms = uniforms;
        this.mesh = mesh;


        // Mouse

        this.mouseSpeed = 0;
        this.tapIntensity = 0;
        this.lastPoint = new THREE.Vector3();


        this.init();
    }



    init() {
        this.setupMouse();
    }



    setupMouse() {
        THREE.Mesh.prototype.raycast = acceleratedRaycast;

        this.geometry.boundsTree = new MeshBVH(this.geometry);

        this.raycaster = new THREE.Raycaster();
        this.raycaster.firstHitOnly = true;
        this.raycasterMesh = new THREE.Mesh(
            this.geometry,
            new THREE.MeshBasicMaterial()
        );

        // Copy transforms from the original model to ensure alignment
        this.raycasterMesh.position.copy(this.mesh.position);
        this.raycasterMesh.rotation.copy(this.mesh.rotation);
        this.raycasterMesh.scale.copy(this.mesh.scale);
        this.raycasterMesh.updateMatrixWorld();

        // Tap Event
        window.addEventListener('mousedown', (e) => {
            this.tapIntensity += 0.2; // Keep increment small
            if (this.tapIntensity > 3.0) this.tapIntensity = 3.0; // Increased cap for higher max level
        });
    }


    update() {
        // Determine raycasting source based on control mode
        let rayOrigin;

        if (this.camera.controls && this.camera.controls.isLocked) {
            // Locked (First Person): Raycast from center
            rayOrigin = new THREE.Vector2(0, 0);
        } else {
            // Unlocked (Mouse): Raycast from cursor position
            if (!this.mouse.cursorPosition) {
                this.mouseSpeed = 0;
                // Ensure mouse position is updated even if not moving
                // This block is for updating uMouse.value even if the mouse isn't actively moving,
                // but the cursor is present.
                if (this.camera.target) { // Check if this.camera.target is defined
                    this.raycaster.setFromCamera(this.mouse.cursorPosition, this.camera.target);
                    const intersects = this.raycaster.intersectObjects([this.raycasterMesh]);
                    if (intersects.length > 0) {
                        const currentWorldPoint = intersects[0].point.clone();
                        this.uniforms.velocityUniforms.uMouse.value = currentWorldPoint;
                    }
                }
                return;
            }
            rayOrigin = this.mouse.cursorPosition;
        }

        // Use the actual Three.js camera object (this.camera.target)
        if (this.camera.target) { // Check if this.camera.target is defined
            this.raycaster.setFromCamera(rayOrigin, this.camera.target);
        } else {
            // Fallback or error handling if camera.target is not defined
            // For now, we'll just return to avoid errors, or you might want to log a warning
            this.mouseSpeed = 0;
            return;
        }


        const intersects = this.raycaster.intersectObjects([this.raycasterMesh]);

        let currentWorldPoint;

        if (intersects.length > 0) {
            currentWorldPoint = intersects[0].point.clone();

            // Calculate speed based on distance from last point
            const distance = currentWorldPoint.distanceTo(this.lastPoint);
            this.mouseSpeed = distance * 10.0; // Scale up for visibility
            if (this.mouseSpeed > 1.0) this.mouseSpeed = 1.0; // Cap speed

            // Debug Log (Throttle this in real production, but useful for now)
            // console.log('Hit:', currentWorldPoint, 'Speed:', this.mouseSpeed);

            this.uniforms.velocityUniforms.uMouse.value = currentWorldPoint;
            this.lastPoint.copy(currentWorldPoint);

        } else {
            // console.log('No Hit');
            this.mouseSpeed = 0;
        }

        this.mouseSpeed *= 0.85; // Decay
        this.tapIntensity *= 0.95; // Decay

        if (this.uniforms.velocityUniforms.uMouseSpeed) this.uniforms.velocityUniforms.uMouseSpeed.value = this.mouseSpeed;
        if (this.uniforms.velocityUniforms.uTapIntensity) this.uniforms.velocityUniforms.uTapIntensity.value = this.tapIntensity;
    }
}