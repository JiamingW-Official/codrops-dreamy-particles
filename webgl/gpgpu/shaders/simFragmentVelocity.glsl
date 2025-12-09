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


void main() {
	vec2 vUv = gl_FragCoord.xy / resolution.xy;

	vec3 position = texture2D( uCurrentPosition, vUv ).xyz;
	vec3 original = texture2D( uOriginalPosition, vUv ).xyz;
	vec3 velocity = texture2D( uCurrentVelocity, vUv ).xyz;

	velocity *= uForce; // Velocity relaxation

    // Audio Heartbeat (Bass Inflate)
    if (uAudioBass > 0.1) {
        vec3 pulseDir = normalize(position);
        velocity += pulseDir * (uAudioBass * 0.008); 
    }


	// Particle attraction to shape force

	vec3 direction = normalize( original - position );

	float dist = length( original - position );

	if( dist > 0.001 ) {
        velocity += direction * ( dist * 0.003 );
    }


	// Mouse repel force
    
	float mouseDistance = distance( position, uMouse );
	float maxDistance = 0.3 + uAudioBass * 0.01 + uTapIntensity * 0.05; // Reduced tap radius influence

	if( mouseDistance < maxDistance ) {
		vec3 pushDirection = normalize( position - uMouse );
		velocity += pushDirection * ( 1.0 - mouseDistance / maxDistance ) * (0.005 * uMouseSpeed + uTapIntensity * 0.01); // Reduced tap force influence
	}

    // Webcam Interaction
    if (uWebcamEnabled > 0.5) {
        // Map particle position to screen space (0-1)
        // Assuming particles are roughly within -2 to 2 range, map to 0-1
        vec2 screenUV = (position.xy + 2.0) / 4.0;
        
        // Clamp to valid UV range
        if (screenUV.x >= 0.0 && screenUV.x <= 1.0 && screenUV.y >= 0.0 && screenUV.y <= 1.0) {
            // Sample webcam texture
            // Flip X for mirror effect
            vec4 webcamColor = texture2D(uWebcamTexture, vec2(1.0 - screenUV.x, screenUV.y));
            
            // Calculate brightness (luminance)
            float brightness = dot(webcamColor.rgb, vec3(0.299, 0.587, 0.114));
            
            // Apply force if bright
            if (brightness > 0.5) { // High threshold, only brightest spots
                // "Shimmer" effect: Gentle sine wave vibration
                // Uses position and time to create a non-uniform wave pattern
                float waveX = sin(position.y * 2.0 + uTime * 0.5); // Very slow, large waves
                float waveY = cos(position.x * 2.0 + uTime * 0.5);
                float waveZ = sin(position.z * 2.0 + uTime * 0.5);
                
                vec3 shimmer = vec3(waveX, waveY, waveZ);
                
                // Apply extremely subtle force
                velocity += shimmer * brightness * 0.0005; // Barely visible
            }
        }
    }


	gl_FragColor = vec4(velocity, 1.);
}