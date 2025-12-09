import * as THREE from 'three';
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh';



export default class GPGPUEvents {

    constructor(mouse, camera, mesh, uniforms) {
        this.camera = camera;
        this.mouse = mouse;
        this.uniforms = uniforms;
        this.mesh = mesh;

        // Safety check for Geometry
        if (mesh && mesh.geometry) {
            this.geometry = mesh.geometry;
        } else {
            console.warn("GPGPUEvents: Mesh has no geometry, using dummy BoxGeometry.");
            this.geometry = new THREE.BoxGeometry(1, 1, 1);
        }

        this.lastPoint = new THREE.Vector3();

        this.init();
    }



    init() {
        this.setupMouse();
    }



    setupMouse() {
        // Only use BVH if we have a valid, non-dummy geometry
        if (this.geometry.type !== 'BoxGeometry' && this.geometry.isBufferGeometry) {
            THREE.Mesh.prototype.raycast = acceleratedRaycast;
            // Compute bounds tree for optimized raycasting
            try {
                this.geometry.computeBoundsTree = new MeshBVH(this.geometry);
            } catch (e) {
                console.warn("GPGPUEvents: Failed to compute MeshBVH, falling back to standard raycast", e);
            }
        }

        this.raycaster = new THREE.Raycaster();
        this.raycaster.firstHitOnly = true;
        this.raycasterMesh = new THREE.Mesh(
            this.geometry,
            new THREE.MeshBasicMaterial()
        );

        // Copy transforms from the original model to ensure alignment
        if (this.mesh) {
            this.raycasterMesh.position.copy(this.mesh.position);
            this.raycasterMesh.rotation.copy(this.mesh.rotation);
            this.raycasterMesh.scale.copy(this.mesh.scale);
            this.raycasterMesh.updateMatrixWorld();
        }

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

            // ORIGINAL DGFX: Set speed to 1 immediately on hit (full power)
            this.mouseSpeed = 1.0; // Instant full brush effect

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

    updateGeometry(newMesh) {
        if (!newMesh) return;

        console.log("GPGPUEvents: Updating Geometry for Interaction");
        this.mesh = newMesh;

        if (newMesh.geometry) {
            this.geometry = newMesh.geometry;
        } else {
            console.warn("GPGPUEvents: New Mesh has no geometry, using dummy BoxGeometry.");
            this.geometry = new THREE.BoxGeometry(1, 1, 1);
        }

        // Re-setup mouse interactions with new geometry
        // Dispose old BVH if exists (optimization)
        if (this.geometry.boundsTree) {
            this.geometry.boundsTree = null;
        }

        this.setupMouse();
    }
}