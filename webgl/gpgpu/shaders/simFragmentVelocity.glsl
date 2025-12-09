uniform sampler2D uOriginalPosition;
uniform vec3 uMouse;
uniform float uMouseSpeed;
uniform float uForce;

uniform float uAudioBass;
uniform float uAudioMid;
uniform float uAudioHigh;
uniform float uAudioLevel;
uniform float uTapIntensity;
uniform sampler2D uWebcamTexture;
uniform float uWebcamEnabled;
uniform float uTime;
uniform float uAttraction; // New uniform


void main() {
	vec2 vUv = gl_FragCoord.xy / resolution.xy;

	vec3 position = texture2D( uCurrentPosition, vUv ).xyz;
	vec3 original = texture2D( uOriginalPosition, vUv ).xyz;
	vec3 velocity = texture2D( uCurrentVelocity, vUv ).xyz;

	velocity *= uForce; // Velocity relaxation




	// Particle attraction to shape force

	vec3 direction = normalize( original - position );

	float dist = length( original - position );

	if( dist > 0.001 ) {
        velocity += direction * ( dist * uAttraction ); // Use dynamic uAttraction for faster/slower convergence
    }


	// Mouse repel force - Smaller, more delicate brush
	float mouseDistance = distance( position, uMouse );
	// Smaller base radius for delicate brush
	float maxDistance = 0.14 + uTapIntensity * 0.25; // Smaller base, reduced tap growth
	if (maxDistance > 0.5) maxDistance = 0.5; // Lower cap for delicate effect

	if( mouseDistance < maxDistance ) {
		vec3 pushDirection = normalize( position - uMouse );
		// More obvious hover force, stronger tap force with multiple taps
		float distanceFactor = 1.0 - mouseDistance / maxDistance;
		// Smooth falloff with squared distance for better visual effect
		distanceFactor = distanceFactor * distanceFactor;
		// Tap force scales more with intensity for stronger ripple
		float tapForce = uTapIntensity * (0.02 + uTapIntensity * 0.015); // Non-linear scaling
		velocity += pushDirection * distanceFactor * (0.07 * uMouseSpeed + tapForce); 
	}

    // Webcam Interaction - Consolidated into particles with more obvious effect
    if (uWebcamEnabled > 0.5) {
        // Map particle position to screen space (0-1)
        // Assuming particles are roughly within -2 to 2 range, map to 0-1
        vec2 screenUV = (position.xy + 2.0) / 4.0;
        
        // Clamp to valid UV range
        if (screenUV.x >= 0.0 && screenUV.x <= 1.0 && screenUV.y >= 0.0 && screenUV.y <= 1.0) {
            // Sample webcam texture
            // Flip X for mirror effect
            vec4 webcamColor = texture2D(uWebcamTexture, vec2(1.0 - screenUV.x, screenUV.y));
            
            // Calculate brightness (luminance) - more sensitive
            float brightness = dot(webcamColor.rgb, vec3(0.299, 0.587, 0.114));
            
            // Apply force based on brightness - more obvious reaction
            if (brightness > 0.3) { // Lower threshold for more sensitivity
                // Calculate direction from webcam brightness gradient
                vec2 gradient = vec2(
                    dot(texture2D(uWebcamTexture, vec2(1.0 - (screenUV.x + 0.01), screenUV.y)).rgb, vec3(0.299, 0.587, 0.114)) - brightness,
                    dot(texture2D(uWebcamTexture, vec2(1.0 - screenUV.x, screenUV.y + 0.01)).rgb, vec3(0.299, 0.587, 0.114)) - brightness
                );
                
                // "Shimmer" effect: More dynamic wave pattern
                float waveX = sin(position.y * 3.0 + uTime * 1.5) * 0.5 + 0.5;
                float waveY = cos(position.x * 3.0 + uTime * 1.5) * 0.5 + 0.5;
                float waveZ = sin(position.z * 3.0 + uTime * 1.5) * 0.5 + 0.5;
                
                vec3 shimmer = vec3(waveX, waveY, waveZ);
                
                // Apply force based on brightness - much more obvious
                float forceStrength = brightness * 0.015; // Increased from 0.0005 for obvious effect
                velocity += shimmer * forceStrength;
                
                // Add gradient-based push/pull
                vec3 gradientForce = vec3(gradient.x, gradient.y, 0.0) * brightness * 0.01;
                velocity += gradientForce;
            }
        }
    }


	gl_FragColor = vec4(velocity, 1.);
}