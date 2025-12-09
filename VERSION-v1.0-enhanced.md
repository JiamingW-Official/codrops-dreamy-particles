# Version 1.0 Enhanced - Reference Document

**Tag:** `v1.0-enhanced`  
**Date:** 2025-01-09  
**Repository:** https://github.com/JiamingW-Official/codrops-dreamy-particles

## Key Features & Optimizations

### Performance Optimizations
- **Faster Initial Load**: Only preloads primary mask model (5 models → 1 model)
- **Optimized Particle Grid**: Dynamic sizing (256-512px) based on viewport, capped at 512x512
- **GPU Texture Optimization**: Uses particle size instead of viewport width for GPGPU textures
- **Model Switching**: Precomputed texture caching for instant model switches

### Visual Enhancements
- **Phase-Based Hover Highlights**: 3-zone system (Core/Mid/Outer) with different intensities
- **Smaller, Delicate Brush**: 0.16 radius (reduced from 0.3), more precise interaction
- **Enhanced Brightness**: Particles brighten relative to model's base brightness
- **Model Scaling**: All models scaled to 3.0x for better visibility

### Audio & Visual Reactions
- **Constant Midpoint Amplitude**: Audio reactions maintain same baseline/midpoint across all market conditions
- **Variable Range**: Only the amplitude range increases in extreme conditions, not the overall level
- **Extreme Fear/Greed Boost**: 2.5x-3.0x amplitude multiplier for visual reactions
- **Multi-Frequency Response**: Bass, mid, and high frequencies all contribute to particle movement

### Mouse & Interaction
- **Improved Mouse Tracking**: Proper geometry updates when switching models
- **Speed-Based Highlighting**: Mouse speed affects highlight intensity
- **Tap Ripple Effects**: Accumulating tap intensity creates stronger ripple waves
- **Raycasting**: BVH-accelerated raycasting for efficient mouse interaction

### Camera Effects
- **Parallax**: 40% reduced (0.09 from 0.15) for subtler movement
- **Shake**: 3x stronger (0.3 from 0.1) with rotation shake for dramatic effect
- **Smooth Interpolation**: Damping factor 0.08 for cinematic movement

### Webcam Integration
- **Particle Physics**: Webcam brightness affects particle velocity (0.015 force)
- **Visual Effects**: Particles take on webcam colors and increase alpha based on brightness
- **Gradient Forces**: Push/pull effects based on webcam brightness gradients
- **Lower Threshold**: 0.3 (from 0.5) for more sensitivity

### Extreme Market Conditions
- **Visual Intensity**: Market intensity boosted 1.5x-2.0x for extreme fear/greed
- **Pulse Effects**: 2.5x faster pulse speed, 1.8x stronger amplitude
- **Color Shifts**: Red/blue tinting based on audio frequencies
- **Alpha Boost**: Additional alpha from audio level in extreme conditions

### UI Improvements
- **Control Panel**: Collapsed by default on page load
- **Debug Panel**: Automatically closed for cleaner interface

## Technical Details

### Shader Uniforms Added
- `uExtremeFear`: Extreme fear state indicator (0.0 or 1.0)
- `uAudioMid`, `uAudioHigh`: Audio frequency uniforms for vertex shader
- `uWebcamTexture`, `uWebcamEnabled`: Webcam integration uniforms

### Key Files Modified
- `webgl/Mask.js`: Model switching, visualization updates
- `webgl/gpgpu/GPGPU.js`: Texture caching, uniform management
- `webgl/gpgpu/shaders/vertex.glsl`: Audio vibration, size variations
- `webgl/gpgpu/shaders/fragment.glsl`: Hover highlights, webcam effects
- `webgl/gpgpu/shaders/simFragmentVelocity.glsl`: Mouse interaction, webcam physics
- `webgl/Camera.js`: Parallax, shake effects
- `webgl/utils/AudioHandler.js`: Constant gain, amplitude-based reactions
- `webgl/utils/Resources.js`: Optimized model loading
- `webgl/utils/Debug.js`: Collapsed panel by default

## Deployment

- **GitHub Pages**: Automatically deployed via GitHub Actions workflow
- **Build Command**: `npm run build`
- **Base Path**: `/codrops-dreamy-particles/`
- **Workflow**: `.github/workflows/static.yml`

## Rollback

To revert to this version:
```bash
git checkout v1.0-enhanced
```

## Notes

- Audio volume/gain remains constant across all market conditions
- Only visual amplitude (particle reaction range) increases in extreme conditions
- All models support mouse interaction and webcam effects
- Particle grid adapts to viewport size for optimal performance

