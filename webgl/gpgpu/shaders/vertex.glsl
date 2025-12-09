varying vec2 vUv;
varying vec3 vPosition;

uniform float uParticleSize;
uniform sampler2D uPositionTexture;

uniform float uTime;
uniform float uAudioBass;
uniform float uAudioMid;
uniform float uAudioHigh;

uniform float uMarketIntensity; // 0.0 = Neutral, 1.0 = Extreme
uniform float uExtremeFear; // 1.0 = Extreme Fear, 0.0 = Otherwise

// Mouse Uniforms for Size Variation
uniform vec3 uMouse;
uniform float uMouseSpeed;
uniform float uTapIntensity;

void main() {
	vUv = uv;

	vec3 newpos = position;

	vec4 color = texture2D( uPositionTexture, vUv );


	newpos.xyz = color.xyz;
    
    // Audio Vibration (Visual Only) - Constant midpoint, variable amplitude range
    // Radial pulse mimicking the original physics push - VISUAL ONLY
    vec3 direction = normalize(newpos);
    float bass = smoothstep(0.3, 0.95, uAudioBass); // Lower threshold for more sensitivity
    float mid = smoothstep(0.3, 0.9, uAudioMid);
    float high = smoothstep(0.3, 0.85, uAudioHigh);
    
    // Constant midpoint - same for all market conditions
    float midpoint = 0.07; // Constant midpoint
    
    // Variable amplitude range - increases with intensity but keeps same midpoint
    // Normal: range 0.05, Extreme: range 0.13, Extreme Fear: range 0.20
    float baseRange = 0.05;
    float intensityRange = uMarketIntensity * 0.08; // Additional range from intensity
    float extremeFearRange = uExtremeFear * 0.12; // Additional range in extreme fear
    float amplitudeRange = baseRange + intensityRange + extremeFearRange;
    
    // Apply: midpoint - range/2 + (signal * range) - keeps midpoint constant, increases variation
    // This ensures: min = midpoint - range/2, max = midpoint + range/2, midpoint stays constant
    float bassPulse = midpoint - amplitudeRange * 0.5 + (bass * amplitudeRange);
    float midPulse = (midpoint - amplitudeRange * 0.5) * 0.6 + (mid * amplitudeRange * 0.6);
    float highPulse = (midpoint - amplitudeRange * 0.5) * 0.4 + (high * amplitudeRange * 0.4);
    
    // Combine all frequencies for richer reaction
    float totalPulse = bassPulse + midPulse * sin(uTime * 2.0) + highPulse * cos(uTime * 3.0);
    newpos += direction * totalPulse;

	vPosition = newpos;

	// Hover Size Variation - More delicate size changes
	float sizeMultiplier = 1.0;
	bool mouseValid = length(uMouse) < 100.0 && length(uMouse) > 0.01;
	if (mouseValid) {
		float mouseDistance = distance(newpos, uMouse);
		float highlightRadius = 0.16; // Smaller radius matching highlight
		
		if (mouseDistance < highlightRadius) {
			float normalizedDist = mouseDistance / highlightRadius;
			float sizeFactor = 1.0 - normalizedDist;
			sizeFactor = sizeFactor * sizeFactor; // Smooth falloff
			
			// Phase-based size variations - more delicate
			// Core zone: 1.4x size (reduced from 2.5x)
			float coreSize = (1.0 - smoothstep(0.0, 0.3, normalizedDist)) * 0.4;
			// Mid zone: 1.25x size with pulse (reduced from 1.8x)
			float midSize = (1.0 - smoothstep(0.3, 0.6, normalizedDist)) * 0.25;
			float pulse = sin(uTime * 4.0 + mouseDistance * 10.0) * 0.2 + 0.8; // More subtle pulse
			// Outer zone: 1.15x size (reduced from 1.3x)
			float outerSize = (1.0 - smoothstep(0.6, 1.0, normalizedDist)) * 0.15;
			
			sizeMultiplier = 1.0 + coreSize + midSize * pulse + outerSize;
			
			// Speed-based size boost - more delicate
			sizeMultiplier += sizeFactor * max(uMouseSpeed, 0.5) * 0.2; // Reduced from 0.4
			
			// Tap ripple size boost - more delicate
			if (uTapIntensity > 0.05) {
				float tapRadius = 0.16 + uTapIntensity * 0.25; // Smaller radius
				if (mouseDistance < tapRadius) {
					float tapFactor = 1.0 - (mouseDistance / tapRadius);
					tapFactor = tapFactor * tapFactor;
					float rippleWave = sin((1.0 - mouseDistance / tapRadius) * 3.14159 * 2.0 - uTime * 2.0) * 0.5 + 0.5;
					sizeMultiplier += tapFactor * uTapIntensity * 0.3 * rippleWave; // Reduced from 0.6
				}
			}
		}
	}

	vec4 mvPosition = modelViewMatrix * vec4( newpos, 1.0 );

	gl_PointSize = ( uParticleSize * sizeMultiplier / -mvPosition.z );

	gl_Position = projectionMatrix * mvPosition;
}