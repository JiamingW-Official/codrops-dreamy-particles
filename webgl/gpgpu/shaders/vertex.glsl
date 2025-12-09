varying vec2 vUv;
varying vec3 vPosition;

uniform float uParticleSize;
uniform sampler2D uPositionTexture;

uniform float uTime;
uniform float uAudioBass;


uniform float uMarketIntensity; // 0.0 = Neutral, 1.0 = Extreme

void main() {
	vUv = uv;

	vec3 newpos = position;

	vec4 color = texture2D( uPositionTexture, vUv );


	newpos.xyz = color.xyz;
    
    // Audio Vibration (Visual Only)
    // Radial pulse mimicking the original physics push - VISUAL ONLY
    vec3 direction = normalize(newpos);
    float bass = smoothstep(0.4, 0.9, uAudioBass); // Threshold to keep it tight
    
    // Dynamic Amplitude: 0.07 (Neutral) -> 0.15 (Extreme)
    float amp = 0.07 + (uMarketIntensity * 0.08);
    float pulse = bass * amp; 
    newpos += direction * pulse;

	vPosition = newpos;

	vec4 mvPosition = modelViewMatrix * vec4( newpos, 1.0 );

	gl_PointSize = ( uParticleSize / -mvPosition.z );

	gl_Position = projectionMatrix * mvPosition;
}