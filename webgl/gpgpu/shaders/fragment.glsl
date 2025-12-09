varying vec2 vUv;

uniform sampler2D uVelocityTexture;
uniform vec3 uColor;
uniform float uMinAlpha;
uniform float uMaxAlpha;

uniform float uAudioBass;
uniform float uAudioMid;
uniform float uAudioHigh;
uniform float uAudioLevel;


void main() {
	float center = length(gl_PointCoord - 0.5);

	vec3 velocity = texture2D( uVelocityTexture, vUv ).xyz * 100.0;

	float velocityAlpha = clamp(length(velocity.r), uMinAlpha, uMaxAlpha);
    
    // Audio Influence
    velocityAlpha += uAudioHigh * 0.2;
    velocityAlpha += uAudioBass * 0.4; // Add Bass Flash to compensate for lack of movement brightness
    vec3 finalColor = uColor * (1.0 + uAudioMid * 0.2);

	if (center > 0.5) { discard; }


	gl_FragColor = vec4(finalColor, velocityAlpha);
}