# Next-Gen Open Ocean (Three.js + React + Vite)

Real-time single-page ocean demo with a GPU FFT spectrum simulation, camera-centered infinite LOD grid, and physically inspired water shading.

## Run

1. `npm install`
2. `npm run dev`
3. Open the local URL printed by Vite

## Controls

- Mouse orbit: left drag
- Pan: right drag
- Zoom: wheel
- Flight keys: `W/A/S/D` + `Q/E`
- Hold `Shift` to accelerate flight

## Live UI Parameters

- Wind speed
- Wind direction
- Choppiness
- Foam intensity
- Foam scale
- Sun scatter
- Reflection strength
- Reflection distortion
- Reflection quality (medium / high / ultra)
- Exposure
- Sun elevation
- Quality preset (performance / balanced / cinematic)
- LOD scale

## Technical Notes

- Ocean simulation: GPU FFT spectrum pipeline (initial spectrum + phase evolution + Stockham subtransforms)
- Ocean rendering: dynamic displacement + normals from simulation, Fresnel reflection, micro-glint sun specular, forward scattering, refraction tint, multi-scale crest foam, distance haze
- Planar reflection: oblique clip-plane reflection pass (Water.js-style) for seam-free projected reflections
- Reflection stability: reflection-edge fading avoids clamp artifacts near reflection frustum limits
- Infinite ocean: multi-ring camera-follow LOD strips with higher density near camera and lower density toward horizon, plus per-ring depth bias to suppress overlap z-fighting
- Renderer: ACES tone mapping, sRGB output color space, resize-aware, DPR capped for stable frame time
