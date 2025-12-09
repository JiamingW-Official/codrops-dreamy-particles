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
        this.mouseSpeed = 0;
        this.tapIntensity = 0;

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
                if (!this.geometry.boundsTree) {
                    this.geometry.boundsTree = new MeshBVH(this.geometry);
                }
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

        // Tap Event - Accumulates with multiple taps for stronger ripple
        window.addEventListener('mousedown', (e) => {
            this.tapIntensity += 0.25; // Increment for tap accumulation
            if (this.tapIntensity > 4.5) this.tapIntensity = 4.5; // Higher cap for strong ripple with multiple taps
        });
    }


    update() {
        // Sync raycaster mesh transforms with the actual model (important for model switching)
        if (this.raycasterMesh && this.mesh) {
            this.raycasterMesh.position.copy(this.mesh.position);
            this.raycasterMesh.rotation.copy(this.mesh.rotation);
            this.raycasterMesh.scale.copy(this.mesh.scale);
            this.raycasterMesh.updateMatrixWorld();
        }

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

            // Calculate mouse speed based on distance moved - More obvious hover
            if (this.lastPoint.length() > 0) {
                const distance = currentWorldPoint.distanceTo(this.lastPoint);
                // Scale speed based on movement distance, higher for more obvious hover
                this.mouseSpeed = Math.max(1.4, distance * 14.0); // Higher base and multiplier for obvious hover
            } else {
                this.mouseSpeed = 1.4; // Higher initial hit for obvious hover
            }

            // Always update mouse position when hovering for highlight effect
            this.uniforms.velocityUniforms.uMouse.value = currentWorldPoint;
            this.lastPoint.copy(currentWorldPoint);

        } else {
            // When not intersecting, still maintain minimum speed for highlight visibility
            // Set mouse to a far position so highlight doesn't show
            this.mouseSpeed = Math.max(0, this.mouseSpeed * 0.5); // Faster decay when not hovering
            // Keep last mouse position for smooth transitions
            if (this.mouseSpeed < 0.1) {
                // Set mouse far away when not hovering to disable highlight
                this.uniforms.velocityUniforms.uMouse.value.set(1000, 1000, 1000);
            }
        }

        // Ensure minimum mouse speed when hovering for visible highlight
        if (intersects.length > 0 && this.mouseSpeed < 0.5) {
            this.mouseSpeed = 0.5; // Minimum speed to ensure highlight is visible
        }

        this.mouseSpeed *= 0.87; // Slower decay for more obvious hover effect
        this.tapIntensity *= 0.91; // Slower decay so ripple persists longer with multiple taps

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

        // Dispose old raycaster mesh if it exists
        if (this.raycasterMesh) {
            if (this.raycasterMesh.geometry) this.raycasterMesh.geometry.dispose();
            if (this.raycasterMesh.material) this.raycasterMesh.material.dispose();
        }

        this.setupMouse();
        
        // Ensure raycaster mesh transforms match the new model
        if (this.raycasterMesh && this.mesh) {
            this.raycasterMesh.position.copy(this.mesh.position);
            this.raycasterMesh.rotation.copy(this.mesh.rotation);
            this.raycasterMesh.scale.copy(this.mesh.scale);
            this.raycasterMesh.updateMatrixWorld();
        }
    }
}