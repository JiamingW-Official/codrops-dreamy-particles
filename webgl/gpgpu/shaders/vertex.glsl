varying vec2 vUv;
varying vec3 vPosition;

uniform float uParticleSize;
uniform sampler2D uPositionTexture;

uniform float uTime;
uniform float uAudioBass;


void main() {
	vUv = uv;

	vec3 newpos = position;

	vec4 color = texture2D( uPositionTexture, vUv );


	newpos.xyz = color.xyz;
    
    // Audio Vibration (Visual Only)
    // Radial pulse mimicking the original physics push - VISUAL ONLY
    vec3 direction = normalize(newpos);
    float bass = smoothstep(0.4, 0.9, uAudioBass); // Threshold to keep it tight
    float pulse = bass * 0.25; // Visual kick amount
    newpos += direction * pulse;

	vPosition = newpos;

	vec4 mvPosition = modelViewMatrix * vec4( newpos, 1.0 );

	gl_PointSize = ( uParticleSize / -mvPosition.z );

	gl_Position = projectionMatrix * mvPosition;
}