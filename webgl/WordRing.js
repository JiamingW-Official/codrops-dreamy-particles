import * as THREE from 'three';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';

export default class WordRing {
    constructor(scene, mouse, modelPosition = new THREE.Vector3(0, 0, 0), gpgpu = null, audio = null, camera = null, modelMesh = null) {
        this.scene = scene;
        this.mouse = mouse;
        this.camera = camera; // Camera for raycasting
        this.modelPosition = modelPosition;
        this.modelMesh = modelMesh; // Reference to the model mesh for collision detection
        this.gpgpu = gpgpu; // Reference to GPGPU for particle position access
        this.audio = audio; // Reference to AudioHandler for soundwave vibration
        this.group = new THREE.Group();
        this.words = [];
        this.rotationSpeed = 0;
        this.targetRotation = 0;
        this.currentRotation = 0;
        this.particleProximityData = null; // Store particle proximity data for visual effects
        this.time = 0; // Time for audio vibration
        this.raycaster = new THREE.Raycaster(); // For mouse interaction detection
        this.mouseWorldPosition = new THREE.Vector3(); // Mouse position in 3D space
        this.hoverIntensity = 0; // Current hover highlight intensity
        this.collisionRaycaster = new THREE.Raycaster(); // For collision detection with model mesh
        
        // Ring parameters
        this.radius = 0.5; // Even smaller radius - make spiral diameter smaller
        this.tiltAngle = (40 * Math.PI) / 180; // 40 degrees tilt
        this.rotationAngle = Math.PI / 4; // Rotation angle for the entire ring (45 degrees default)
        this.fontSize = 0.018; // Super small font size
        this.wordSpacing = 0.12; // Super tight spacing for more density
        
        // Words will be loaded dynamically based on market data
        // Default test words for initial display
        this.testWords = [
            'Bullish', 'Optimistic', 'Growth', 'Momentum', 'Confidence', 'Rally', 
            'Strength', 'Gains', 'Prosperity', 'Success', 'Victory', 'Triumph',
            'Advance', 'Progress', 'Boom', 'Surge', 'Climb', 'Rise', 'Soar',
            'Thrive', 'Flourish', 'Expand', 'Increase', 'Upward', 'Peak',
            'Summit', 'Top', 'High', 'Elevate', 'Ascend', 'Lift', 'Boost'
        ];
        this.currentDate = null; // Track current date to avoid regenerating words
        
        // Don't call init() in constructor - it's async and should be called separately
        // this.init();
    }
    
    async init() {
        try {
            console.log('WordRing: Starting initialization...');
            console.log('WordRing: Scene:', this.scene);
            console.log('WordRing: Mouse:', this.mouse);
            
            if (!this.scene) {
                console.error('WordRing: Scene is not available');
                return;
            }
            
            if (!this.mouse) {
                console.error('WordRing: Mouse is not available');
                return;
            }
            
            // Load font
            const fontLoader = new FontLoader();
            const fontUrl = 'https://threejs.org/examples/fonts/helvetiker_regular.typeface.json';
            
            console.log('WordRing: Loading font from', fontUrl);
            
            // Load font with timeout
            const fontPromise = new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Font loading timeout'));
                }, 10000);
                
                fontLoader.load(
                    fontUrl,
                    (font) => {
                        clearTimeout(timeout);
                        console.log('WordRing: Font loaded successfully');
                        resolve(font);
                    },
                    undefined,
                    (error) => {
                        clearTimeout(timeout);
                        console.error('WordRing: Error loading font:', error);
                        reject(error);
                    }
                );
            });
            
            this.font = await fontPromise;
            console.log('WordRing: Font ready, creating ring...');
            
            // Create the ring
            this.createRing();
            
            // Add group to scene
            this.scene.add(this.group);
            console.log('WordRing: Group added to scene');
            console.log('WordRing: Group position:', this.group.position);
            
        } catch (error) {
            console.error('WordRing: Initialization failed:', error);
        }
    }
    
    createRing() {
        if (!this.font) {
            console.warn('WordRing: Font not loaded, cannot create ring');
            return;
        }

        // Clear existing words
        this.words.forEach(wordData => {
            this.group.remove(wordData.mesh);
            wordData.mesh.geometry.dispose();
            wordData.mesh.material.dispose();
        });
        this.words = [];

        const wordCount = this.testWords.length;

        // Create a spiral path with 4 rotations
        const numRotations = 4;
        const verticalSeparation = 0.04; // Reduced vertical separation for denser spiral

        // Calculate normal spacing between words (in radians)
        const wordSpacingAngle = this.wordSpacing * 0.08; // Tighter spacing for more density (in radians)

        let currentAngle = 0; // Start at angle 0

        this.testWords.forEach((word, index) => {
            // Calculate which rotation we're on
            const rotationNumber = Math.floor(currentAngle / (Math.PI * 2));
            // Each rotation adds verticalSeparation to the Y position
            const verticalOffset = rotationNumber * verticalSeparation;
            
            // Create CURVED text by breaking word into individual letters
            // Each letter is positioned along the ring curve
            const letters = word.split('');
            const letterCount = letters.length;
            // Calculate proper spacing: each letter should be spaced based on font size
            // Use a spacing factor that accounts for the ring radius and font size
            const letterSpacing = this.fontSize * 0.4; // Super tight letter spacing for more density (40% of font size)
            const totalWordArc = letterSpacing * letterCount / this.radius; // Total arc angle for the word
            const letterAngleStep = totalWordArc / letterCount; // Angle per letter
            
            // Store the starting angle for this word
            const angle = currentAngle;
            
            // Move to next word position (word arc + spacing) for sequential placement
            currentAngle += totalWordArc + wordSpacingAngle;
            
            letters.forEach((letter, letterIndex) => {
                // Calculate angle for this letter (curved along the ring)
                // Start from the word's center angle and spread letters evenly
                const letterAngle = angle + (letterIndex - (letterCount - 1) / 2) * letterAngleStep;
                
                // Position on the spiral path (in the tilted plane)
                // Keep radius constant - don't decrease diameter as we spiral
                // Apply vertical offset for spiral effect only
                const x = Math.cos(letterAngle) * this.radius; // Constant radius
                const y = Math.sin(letterAngle) * Math.cos(this.tiltAngle) * this.radius + verticalOffset; // Spiral upward
                const z = Math.sin(letterAngle) * Math.sin(this.tiltAngle) * this.radius; // Constant radius
                
                // Create text geometry for single letter - NO THICKNESS (flat)
                const geometry = new TextGeometry(letter, {
                    font: this.font,
                    size: this.fontSize,
                    depth: 0, // Use 'depth' instead of deprecated 'height' - No thickness - completely flat
                    curveSegments: 4,
                    bevelEnabled: false,
                });

                geometry.computeBoundingBox();
                // Don't center offset - position each letter at its calculated position
                // The letters will naturally space along the curve
                
                // Create material - 30% less saturated warm color text with minimal bloom
                // Use MeshStandardMaterial with very low emissive for subtle bloom
                // Reduce saturation by 30%: convert to HSL, reduce S, convert back
                const warmColor = new THREE.Color(0xffd4a3);
                const hsl = { h: 0, s: 0, l: 0 };
                warmColor.getHSL(hsl);
                hsl.s *= 0.7; // Reduce saturation by 30% (multiply by 0.7)
                const desaturatedColor = new THREE.Color().setHSL(hsl.h, hsl.s, hsl.l);
                
                const material = new THREE.MeshStandardMaterial({
                    color: desaturatedColor, // 30% less saturated warm color
                    emissive: desaturatedColor, // Desaturated emissive color
                    emissiveIntensity: 0.8, // Increased bloom effect (from 0.4 to 0.8)
                    transparent: true,
                    opacity: 0.45, // Reduced opacity by another 40% (from 0.75 to 0.45, which is 0.75 * 0.6)
                    side: THREE.DoubleSide,
                    depthWrite: true,
                    depthTest: true
                });
                
                // Create mesh
                const mesh = new THREE.Mesh(geometry, material);
                // Store original position for audio vibration
                mesh.userData.originalPosition = new THREE.Vector3(x, y, z);
                // Position at the calculated ring position (no center offset to prevent bunching)
                mesh.position.set(x, y, z);
                
                // Orient text to face OUTWARD from the center and be readable
                // The text should be readable from outside the circle, facing outward
                
                // Calculate the radius vector (from center to this letter position)
                const radiusVec = new THREE.Vector3(x, y, z).normalize();
                
                // Calculate the tangent vector along the spiral (perpendicular to radius, along the curve)
                const tangentX = -Math.sin(letterAngle);
                const tangentY = Math.cos(letterAngle) * Math.cos(this.tiltAngle);
                const tangentZ = Math.cos(letterAngle) * Math.sin(this.tiltAngle);
                const tangent = new THREE.Vector3(tangentX, tangentY, tangentZ).normalize();
                
                // Calculate the "up" direction - perpendicular to both radius and tangent (normal to ring plane)
                // Use crossVectors(tangent, radiusVec) to ensure proper orientation for outward-facing text
                // Do NOT negate - keep it right-side up
                const up = new THREE.Vector3().crossVectors(tangent, radiusVec).normalize();
                
                // The text should face OUTWARD (away from center, toward viewer)
                // The lookAt position should be far in the outward direction (away from center)
                // Since radiusVec points from center to letter, we negate it to point outward
                const outwardDirection = radiusVec.clone().multiplyScalar(-1);
                
                // Create a look-at position far in the outward direction (toward viewer/camera)
                // Use a larger distance to ensure proper outward facing
                const lookAtPos = new THREE.Vector3(
                    mesh.position.x + outwardDirection.x * 200,
                    mesh.position.y + outwardDirection.y * 200,
                    mesh.position.z + outwardDirection.z * 200
                );
                
                // Set the "up" vector and look at outward position
                // This makes text face outward (toward viewer) and right-side up
                mesh.up.copy(up);
                mesh.lookAt(lookAtPos);
                
                // Store letter data
                this.words.push({
                    mesh: mesh,
                    angle: letterAngle,
                    basePosition: new THREE.Vector3(x, y, z),
                    letter: letter
                });
                
                this.group.add(mesh);
            });
        });
        
        // Position the group at model center
        this.group.position.copy(this.modelPosition);
    }
    
    update() {
        if (!this.mouse || !this.mouse.cursorPosition) return;
        
        // Update time for audio vibration
        this.time = performance.now() * 0.001;
        
        // Calculate rotation based on mouse X position
        // Mouse X ranges from -1 to 1, map to rotation
        const mouseX = this.mouse.cursorPosition.x || 0;
        this.targetRotation = mouseX * Math.PI * 0.5; // Max rotation of 90 degrees
        
        // Smooth rotation interpolation
        this.currentRotation += (this.targetRotation - this.currentRotation) * 0.1;
        
        // Apply rotation around Y axis (vertical)
        // Combine base rotation angle with mouse-driven rotation
        this.group.rotation.y = this.rotationAngle + this.currentRotation;
        
        // Apply audio vibration to text
        this.applyAudioVibration();
        
        // Update mouse hover effect (highlight and glow)
        this.updateMouseHover();
        
        // Check for collisions with model mesh and hide colliding letters
        // DISABLED - was causing model distortion
        // TODO: Implement safer collision detection that doesn't modify model
        // this.updateCollisionDetection();
        
        // Update text visual effects based on particle proximity
        this.updateParticleInteraction();
    }
    
    updateCollisionDetection() {
        // DISABLED - This function is completely disabled to prevent any model distortion
        // The model mesh should never be modified by WordRing
        // Collision detection was causing the model to become distorted and pushed
        return;
    }
    
    updateMouseHover() {
        if (!this.mouse || !this.camera || !this.words.length) return;
        
        try {
            // Get mouse position in normalized device coordinates (-1 to +1)
            const mouseX = this.mouse.cursorPosition?.x || 0;
            const mouseY = this.mouse.cursorPosition?.y || 0;
            
            // Camera.target is the actual THREE.PerspectiveCamera object
            const camera = this.camera.target || this.camera;
            if (!camera) return;
            
            // Update raycaster with mouse position and camera
            this.raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), camera);
            
            // Raycast against all word meshes to detect intersection
            const wordMeshes = this.words.map(w => w.mesh).filter(m => m);
            const intersects = this.raycaster.intersectObjects(wordMeshes, false);
            
            // Calculate hover intensity based on intersection
            let globalHoverIntensity = 0;
            if (intersects.length > 0) {
                // Mouse is directly over text - full intensity
                globalHoverIntensity = 1.0;
            } else {
                // Check proximity to ring curve (imagining it's a mesh)
                const wordRingWorldPos = new THREE.Vector3();
                this.group.getWorldPosition(wordRingWorldPos);
                
                // Project mouse ray onto plane at ring's distance
                const distance = wordRingWorldPos.distanceTo(camera.position);
                const mouseWorldPos = new THREE.Vector3();
                mouseWorldPos.copy(this.raycaster.ray.origin);
                mouseWorldPos.add(this.raycaster.ray.direction.multiplyScalar(distance));
                
                // Calculate distance from mouse to ring center
                const mouseDistance = mouseWorldPos.distanceTo(wordRingWorldPos);
                const hoverRadius = this.radius * 1.2; // Hover detection radius around the curve
                
                if (mouseDistance < hoverRadius) {
                    const normalizedDist = mouseDistance / hoverRadius;
                    globalHoverIntensity = 1.0 - normalizedDist;
                    globalHoverIntensity = globalHoverIntensity * globalHoverIntensity; // Smooth falloff
                }
            }
            
            // Apply highlight and glow to text based on hover (no distortion, just visual)
            this.words.forEach((wordData, index) => {
                if (!wordData.mesh || !wordData.mesh.material) return;
                
                const material = wordData.mesh.material;
                const baseEmissiveIntensity = 0.8; // Increased base bloom (from 0.4 to 0.8)
                
                // Check if this specific letter is intersected
                const isIntersected = intersects.some(intersect => intersect.object === wordData.mesh);
                
                // Calculate letter-specific hover intensity
                let letterHoverIntensity = 0;
                if (isIntersected) {
                    letterHoverIntensity = 1.0; // Direct intersection - full intensity
                } else {
                    // Proximity-based intensity
                    const letterWorldPos = new THREE.Vector3();
                    wordData.mesh.getWorldPosition(letterWorldPos);
                    
                    // Project mouse to same distance as letter
                    const letterDistance = letterWorldPos.distanceTo(camera.position);
                    const mouseWorldPos = new THREE.Vector3();
                    mouseWorldPos.copy(this.raycaster.ray.origin);
                    mouseWorldPos.add(this.raycaster.ray.direction.multiplyScalar(letterDistance));
                    
                    const letterDistanceToMouse = letterWorldPos.distanceTo(mouseWorldPos);
                    const letterHoverRadius = this.fontSize * 3.0; // Hover radius per letter
                    
                    if (letterDistanceToMouse < letterHoverRadius) {
                        const normalizedLetterDist = letterDistanceToMouse / letterHoverRadius;
                        letterHoverIntensity = (1.0 - normalizedLetterDist) * globalHoverIntensity;
                        letterHoverIntensity = letterHoverIntensity * letterHoverIntensity; // Smooth falloff
                    }
                }
                
                // Increase emissive intensity for glow effect (no distortion)
                material.emissiveIntensity = baseEmissiveIntensity + letterHoverIntensity * 1.0;
                
                // Add color shift for highlight (similar to particle highlighting)
                const baseColor = new THREE.Color(0xffd4a3);
                const hsl = { h: 0, s: 0, l: 0 };
                baseColor.getHSL(hsl);
                hsl.s *= 0.7; // Desaturated base
                
                // Add highlight color shift when mouse is near
                const highlightShift = letterHoverIntensity * 0.6;
                const highlightColor = new THREE.Color().setHSL(
                    hsl.h + highlightShift * 0.2, // Slight hue shift toward yellow/white
                    hsl.s + highlightShift * 0.5, // Increase saturation
                    hsl.l + highlightShift * 0.4 // Increase lightness for glow
                );
                
                material.emissive.copy(highlightColor);
            });
        } catch (error) {
            // Silently fail if raycasting isn't available
            // console.debug('WordRing: Could not update mouse hover:', error);
        }
    }
    
    applyAudioVibration() {
        if (!this.audio || !this.audio.ready || !this.words.length) return;
        
        try {
            const { bass, mid, high, level } = this.audio.frequencyData || { bass: 0, mid: 0, high: 0, level: 0 };
            
            // Calculate vibration intensity based on audio frequencies
            const bassVib = bass * 0.03; // Bass creates larger vibrations
            const midVib = mid * 0.02; // Mid creates medium vibrations
            const highVib = high * 0.015; // High creates subtle vibrations
            
            // Apply vibration to each letter
            this.words.forEach((wordData, index) => {
                if (!wordData.mesh || !wordData.mesh.userData.originalPosition) return;
                
                const originalPos = wordData.mesh.userData.originalPosition;
                const mesh = wordData.mesh;
                
                // Calculate radial direction (from center to letter)
                const radialDir = new THREE.Vector3().subVectors(originalPos, new THREE.Vector3(0, 0, 0)).normalize();
                
                // Calculate perpendicular direction (tangent to the ring)
                const tangentDir = new THREE.Vector3(-radialDir.z, 0, radialDir.x).normalize();
                
                // Combine vibrations with different phases for each letter
                const phase = index * 0.1;
                const bassPhase = Math.sin(this.time * 2.0 + phase) * bassVib;
                const midPhase = Math.cos(this.time * 3.0 + phase) * midVib;
                const highPhase = Math.sin(this.time * 5.0 + phase) * highVib;
                
                // Apply vibration in radial and perpendicular directions
                const vibratedPos = originalPos.clone();
                vibratedPos.add(radialDir.multiplyScalar(bassPhase + midPhase * 0.5));
                vibratedPos.add(tangentDir.multiplyScalar(highPhase));
                
                // Update mesh position
                mesh.position.copy(vibratedPos);
            });
        } catch (error) {
            // Silently fail if audio isn't available
            // console.debug('WordRing: Could not apply audio vibration:', error);
        }
    }
    
    updateParticleInteraction() {
        if (!this.gpgpu || !this.gpgpu.material || !this.gpgpu.material.uniforms) return;
        
        try {
            // Get particle position texture from GPGPU
            const positionTexture = this.gpgpu.material.uniforms.uPositionTexture?.value;
            if (!positionTexture) return;
            
            // Calculate proximity of particles to text (simplified - using texture sampling)
            // For each word, check if particles are nearby
            this.words.forEach((wordData, index) => {
                if (!wordData.mesh || !wordData.mesh.material) return;
                
                const material = wordData.mesh.material;
                const baseEmissiveIntensity = 0.8; // Increased base bloom (from 0.4 to 0.8)
                
                // Simplified proximity calculation (could be improved with actual texture sampling)
                // For now, use a time-based pulsing effect to simulate particle proximity
                const time = this.time;
                const proximity = Math.sin(time * 2.0 + index * 0.1) * 0.5 + 0.5; // 0 to 1
                const maxProximity = proximity * 0.3; // Scale down the effect
                
                // Calculate proximity for this word (add some variation based on position)
                const wordProximity = maxProximity * (0.8 + Math.sin(index * 0.1 + time) * 0.2);
                
                // Increase emissive intensity when particles are near (similar to particle highlighting)
                material.emissiveIntensity = baseEmissiveIntensity + wordProximity * 0.6;
                
                // Add subtle color shift (similar to particle highlight color shift)
                const baseColor = new THREE.Color(0xffd4a3);
                const hsl = { h: 0, s: 0, l: 0 };
                baseColor.getHSL(hsl);
                hsl.s *= 0.7; // Desaturated base
                
                // Add highlight color shift when particles are near
                const highlightShift = wordProximity * 0.4;
                const highlightColor = new THREE.Color().setHSL(
                    hsl.h + highlightShift * 0.15, // Slight hue shift toward yellow/white
                    hsl.s + highlightShift * 0.3, // Increase saturation
                    hsl.l + highlightShift * 0.2 // Increase lightness
                );
                
                material.emissive.copy(highlightColor);
                
                // Add subtle scale effect (similar to particle size variation)
                // But respect collision state - don't scale up if colliding
                if (!wordData.mesh.userData.isColliding) {
                    if (!wordData.mesh.userData.baseScale) {
                        wordData.mesh.userData.baseScale = 1.0;
                    }
                    const baseScale = wordData.mesh.userData.baseScale;
                    const scaleBoost = 1.0 + wordProximity * 0.2; // Subtle size increase
                    wordData.mesh.scale.setScalar(baseScale * scaleBoost);
                }
            });
        } catch (error) {
            // Silently fail if texture access isn't available
            // console.debug('WordRing: Could not access particle data:', error);
        }
    }
    
    setWords(words) {
        // Clear existing words
        this.words.forEach(wordData => {
            this.group.remove(wordData.mesh);
            wordData.mesh.geometry.dispose();
            wordData.mesh.material.dispose();
        });
        this.words = [];
        
        // Update words array
        this.testWords = words || this.testWords;
        
        // Recreate ring
        this.createRing();
    }
    
    setModelPosition(position) {
        if (!position) return;
        this.modelPosition.copy(position);
        if (this.group) {
            this.group.position.copy(position);
            console.log('WordRing: Position updated to', position);
        }
    }
    
    setRotationAngle(angle) {
        // Set the base rotation angle for the entire ring (in radians)
        this.rotationAngle = angle;
    }
    
    setModelMesh(mesh) {
        // DO NOT store mesh reference - collision detection is disabled
        // this.modelMesh = mesh;
    }
    
    async updateWordsForDate(dateStr, marketData) {
        // Avoid regenerating words for the same date
        if (this.currentDate === dateStr) {
            console.log('WordRing: Words already loaded for', dateStr);
            return;
        }
        
        console.log('WordRing: Updating words for date:', dateStr);
        
        // Try to get words from market data
        if (marketData && marketData.poeticWords && Array.isArray(marketData.poeticWords)) {
            console.log('WordRing: Using words from market data:', marketData.poeticWords.length, 'words');
            this.setWords(marketData.poeticWords);
            this.currentDate = dateStr;
            
            // Update rotation based on market conditions
            this.updateRotationFromMarketConditions(marketData);
            return;
        }
        
        // Fallback: generate words client-side
        console.log('WordRing: Generating words client-side for', dateStr);
        const words = this.generateWordsClientSide(marketData);
        this.setWords(words);
        this.currentDate = dateStr;
    }
    
    updateRotationFromMarketConditions(marketData) {
        if (!marketData) return;
        
        // Determine market condition type (12 types based on fear/greed, VIX, and regime)
        const fearGreed = marketData.fearGreedIndex || 50;
        const vix = marketData.vix || 20;
        const moodState = (marketData.moodState || 'Neutral').toLowerCase();
        const regime = (marketData.regime || 'Neutral').toLowerCase();
        
        // 12 market condition types:
        // 1. Extreme Fear + High VIX (>30) + Bear
        // 2. Extreme Fear + Medium VIX (20-30) + Bear
        // 3. Fear + High VIX (>30) + Bear
        // 4. Fear + Medium VIX (20-30) + Bear
        // 5. Neutral + Low VIX (<20) + Neutral
        // 6. Neutral + Medium VIX (20-30) + Neutral
        // 7. Greed + Low VIX (<20) + Bull
        // 8. Greed + Medium VIX (20-30) + Bull
        // 9. Extreme Greed + Low VIX (<20) + Bull
        // 10. Extreme Greed + Medium VIX (20-30) + Bull
        // 11. Volatile (any mood + VIX >30)
        // 12. Stable (any mood + VIX <15)
        
        let conditionType = 5; // Default to neutral
        
        if (fearGreed <= 25) {
            // Extreme Fear
            if (vix > 30) conditionType = 1; // Extreme Fear + High VIX
            else if (vix >= 20) conditionType = 2; // Extreme Fear + Medium VIX
            else conditionType = 2; // Extreme Fear + Low VIX (treat as medium)
        } else if (fearGreed <= 45) {
            // Fear
            if (vix > 30) conditionType = 3; // Fear + High VIX
            else if (vix >= 20) conditionType = 4; // Fear + Medium VIX
            else conditionType = 4; // Fear + Low VIX
        } else if (fearGreed <= 55) {
            // Neutral
            if (vix < 15) conditionType = 12; // Stable
            else if (vix < 20) conditionType = 5; // Neutral + Low VIX
            else if (vix <= 30) conditionType = 6; // Neutral + Medium VIX
            else conditionType = 11; // Volatile
        } else if (fearGreed <= 75) {
            // Greed
            if (vix < 20) conditionType = 7; // Greed + Low VIX
            else if (vix <= 30) conditionType = 8; // Greed + Medium VIX
            else conditionType = 11; // Volatile
        } else {
            // Extreme Greed
            if (vix < 20) conditionType = 9; // Extreme Greed + Low VIX
            else if (vix <= 30) conditionType = 10; // Extreme Greed + Medium VIX
            else conditionType = 11; // Volatile
        }
        
        // Map condition type to rotation angle (0 to 330 degrees in 30-degree steps)
        const rotationStep = (Math.PI * 2) / 12; // 30 degrees per condition
        this.rotationAngle = (conditionType - 1) * rotationStep;
        
        // Apply rotation immediately
        if (this.group) {
            this.group.rotation.y = this.rotationAngle + this.currentRotation;
        }
        
        console.log(`WordRing: Market condition type ${conditionType}, rotation angle: ${(this.rotationAngle * 180 / Math.PI).toFixed(1)}°`);
    }
    
    generateWordsClientSide(marketData) {
        // Simple client-side word generation as fallback
        // This is a basic implementation - the Python script should be the primary source
        const words = [];
        const baseWords = [
            'Bullish', 'Optimistic', 'Growth', 'Momentum', 'Confidence', 'Rally',
            'Strength', 'Gains', 'Prosperity', 'Success', 'Victory', 'Triumph',
            'Advance', 'Progress', 'Boom', 'Surge', 'Climb', 'Rise', 'Soar',
            'Thrive', 'Flourish', 'Expand', 'Increase', 'Upward', 'Peak'
        ];
        
        // Generate 160 words by repeating and varying
        for (let i = 0; i < 160; i++) {
            words.push(baseWords[i % baseWords.length] + (i > baseWords.length ? i : ''));
        }
        
        return words;
    }
    
    dispose() {
        // Clean up resources
        this.words.forEach(wordData => {
            if (wordData.mesh) {
                this.group.remove(wordData.mesh);
                if (wordData.mesh.geometry) wordData.mesh.geometry.dispose();
                if (wordData.mesh.material) wordData.mesh.material.dispose();
            }
        });
        this.words = [];
        
        if (this.group && this.scene) {
            this.scene.remove(this.group);
        }
    }
}
