varying vec2 vUv;
varying vec3 vPosition;

uniform sampler2D uVelocityTexture;
uniform vec3 uColor;
uniform float uMinAlpha;
uniform float uMaxAlpha;

uniform float uAudioBass;
uniform float uAudioMid;
uniform float uAudioHigh;
uniform float uAudioLevel;
uniform float uMarketIntensity;
uniform float uExtremeFear; // 1.0 = Extreme Fear, 0.0 = Otherwise

// Mouse Uniforms for Particle Highlighting
uniform vec3 uMouse;
uniform float uMouseSpeed;
uniform float uTapIntensity;
uniform float uTime;

// Webcam Uniforms for Visual Effects
uniform sampler2D uWebcamTexture;
uniform float uWebcamEnabled;


void main() {
	float center = length(gl_PointCoord - 0.5);

	vec3 velocity = texture2D( uVelocityTexture, vUv ).xyz * 100.0;

	float velocityAlpha = clamp(length(velocity.r), uMinAlpha, uMaxAlpha);
    
    // Audio Influence - Constant midpoint, variable amplitude range
    // Keep same midpoint for all conditions, only increase the range of variation
    float audioMidpoint = 0.0; // Constant midpoint (no base offset for alpha)
    
    // Variable amplitude range - increases with intensity but keeps same midpoint
    float baseRange = 0.2; // Base range for normal conditions
    float intensityRange = uMarketIntensity * 0.3; // Additional range from intensity
    float extremeFearRange = uExtremeFear * 0.5; // Additional range in extreme fear
    float audioRange = baseRange + intensityRange + extremeFearRange;
    
    // Apply: midpoint - range/2 + (signal * range) - keeps midpoint constant, increases variation
    // This ensures the midpoint stays the same while range increases
    velocityAlpha += audioMidpoint - audioRange * 0.5 + (uAudioHigh * audioRange * 0.35);
    velocityAlpha += audioMidpoint - audioRange * 0.5 + (uAudioBass * audioRange * 0.6); // Stronger bass flash
    velocityAlpha += audioMidpoint - audioRange * 0.5 + (uAudioMid * audioRange * 0.25); // Mid boost
    
    // Hover Highlighting - Smaller, more delicate brush with same highlight intensity
    // Check if mouse is valid (not at origin or far away)
    bool mouseValid = length(uMouse) < 100.0 && length(uMouse) > 0.01;
    float mouseDistance = mouseValid ? distance(vPosition, uMouse) : 1000.0;
    float highlightRadius = 0.16; // Smaller, more delicate radius
    float highlightIntensity = 0.0;
    vec3 highlightColorShift = vec3(0.0); // Color variation
    
    if (mouseValid && mouseDistance < highlightRadius) {
        float highlightFactor = 1.0 - (mouseDistance / highlightRadius);
        float normalizedDist = mouseDistance / highlightRadius; // 0 = center, 1 = edge
        
        // PHASE 1: Core Zone (0-0.3) - Ultra bright white-hot center (same intensity, smaller area)
        float corePhase = 1.0 - smoothstep(0.0, 0.3, normalizedDist);
        float coreIntensity = corePhase * 3.5; // Same intense core
        highlightIntensity += coreIntensity;
        highlightColorShift += vec3(0.3, 0.4, 0.5) * corePhase; // White shift in core
        
        // PHASE 2: Mid Zone (0.3-0.6) - Bright glow with pulsing (same intensity, smaller area)
        float midPhase = 1.0 - smoothstep(0.3, 0.6, normalizedDist);
        float pulse = sin(uTime * 4.0 + mouseDistance * 10.0) * 0.5 + 0.5; // Pulsing effect
        float midIntensity = midPhase * 2.2 * (0.7 + pulse * 0.3); // Same pulsing brightness
        highlightIntensity += midIntensity;
        highlightColorShift += vec3(0.15, 0.2, 0.25) * midPhase * pulse; // Pulsing color shift
        
        // PHASE 3: Outer Zone (0.6-1.0) - Subtle glow with speed-based variation (same intensity, smaller area)
        float outerPhase = 1.0 - smoothstep(0.6, 1.0, normalizedDist);
        float speedFactor = clamp(uMouseSpeed * 0.5, 0.5, 2.0); // Speed-based intensity
        float outerIntensity = outerPhase * 1.0 * speedFactor;
        highlightIntensity += outerIntensity;
        highlightColorShift += vec3(0.05, 0.08, 0.1) * outerPhase * speedFactor;
        
        // Speed-based boost (applies to all phases) - same intensity
        float speedBoost = max(uMouseSpeed, 0.5) * 2.5; // Same strong speed boost
        highlightIntensity += highlightFactor * speedBoost;
        
        // Time-based shimmer effect - more delicate
        float shimmer = sin(uTime * 3.0 + vPosition.x * 5.0 + vPosition.y * 5.0) * 0.2 + 0.8; // More subtle shimmer
        highlightIntensity *= shimmer;
    }
    
    // Tap Ripple Highlighting - Smaller, more delicate with same intensity
    float tapHighlightRadius = 0.16 + uTapIntensity * 0.25; // Smaller base, reduced tap growth
    if (mouseDistance < tapHighlightRadius && uTapIntensity > 0.05) {
        float tapNormalizedDist = mouseDistance / tapHighlightRadius;
        float tapFactor = 1.0 - tapNormalizedDist;
        tapFactor = tapFactor * tapFactor;
        
        // Ripple wave effect
        float rippleWave = sin((1.0 - tapNormalizedDist) * 3.14159 * 2.0 - uTime * 2.0) * 0.5 + 0.5;
        float tapIntensity = tapFactor * uTapIntensity * 1.2 * rippleWave; // Wave-based ripple
        highlightIntensity += tapIntensity;
        highlightColorShift += vec3(0.2, 0.15, 0.1) * tapFactor * uTapIntensity * rippleWave; // Orange/yellow ripple
    }
    
    // Make highlight relative to the model brightness: brighter base colors get even brighter
    float baseLuma = dot(uColor, vec3(0.299, 0.587, 0.114)); // luminance of base color
    float brightnessBoost = highlightIntensity * (1.0 + baseLuma * 2.0); // Stronger scaling for brighter models
    
    // EXTREME FEAR: Enhanced visual intensity
    float extremeFearVisualBoost = 1.0 + (uExtremeFear * 0.4); // 40% brighter in extreme fear
    
    // MUCH MORE OBVIOUS color when hovering - with phase-based color variations
    vec3 baseColorBoost = uColor * (1.25 + brightnessBoost * 2.0) * extremeFearVisualBoost; // Boosted in extreme fear
    vec3 audioColorBoost = vec3(1.0 + uAudioBass * 0.3 * (1.0 + uExtremeFear), 1.0, 1.0 + uAudioHigh * 0.2 * (1.0 + uExtremeFear)); // Red/blue shift in extreme fear
    vec3 finalColor = (baseColorBoost + highlightColorShift * brightnessBoost) * (1.0 + uAudioMid * 0.25 * (1.0 + uExtremeFear)) * audioColorBoost;
    finalColor = clamp(finalColor, vec3(0.0), vec3(5.0)); // Prevent over-brightening artifacts
    
    // Webcam Visual Effect - Consolidated into particles
    vec3 webcamColorBoost = vec3(1.0);
    if (uWebcamEnabled > 0.5) {
        // Map particle position to screen space (0-1)
        vec2 screenUV = (vPosition.xy + 2.0) / 4.0;
        
        // Clamp to valid UV range
        if (screenUV.x >= 0.0 && screenUV.x <= 1.0 && screenUV.y >= 0.0 && screenUV.y <= 1.0) {
            // Sample webcam texture
            vec4 webcamColor = texture2D(uWebcamTexture, vec2(1.0 - screenUV.x, screenUV.y));
            
            // Calculate brightness (luminance)
            float webcamBrightness = dot(webcamColor.rgb, vec3(0.299, 0.587, 0.114));
            
            // Apply color boost based on webcam brightness - more obvious effect
            if (webcamBrightness > 0.3) {
                // Bright areas make particles brighter and more colorful
                float webcamFactor = (webcamBrightness - 0.3) / 0.7; // Normalize to 0-1
                webcamColorBoost = mix(vec3(1.0), webcamColor.rgb * 1.5, webcamFactor * 0.6); // Blend webcam colors
                velocityAlpha += webcamFactor * 0.3; // Increase alpha based on webcam brightness
            }
        }
    }
    
    // Strong alpha boost with phase variations - EXTREME FEAR: Much stronger
    float alphaBoost = 1.1 + brightnessBoost * 1.2;
    alphaBoost += uExtremeFear * (uAudioLevel * 0.5 + uAudioBass * 0.3); // Additional alpha from audio in extreme fear
    velocityAlpha = clamp(velocityAlpha * alphaBoost, uMinAlpha, uMaxAlpha);
    
    // Apply webcam color boost to final color
    finalColor *= webcamColorBoost;

	if (center > 0.5) { discard; }


	gl_FragColor = vec4(finalColor, velocityAlpha);
}