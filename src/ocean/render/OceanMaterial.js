import { Color, DataTexture, Matrix4, RGBAFormat, ShaderMaterial, UnsignedByteType, Vector2, Vector3 } from 'three';

const defaultReflectionTextureData = new Uint8Array([120, 150, 185, 255]);
const defaultReflectionTexture = new DataTexture(defaultReflectionTextureData, 1, 1, RGBAFormat, UnsignedByteType);
defaultReflectionTexture.needsUpdate = true;

export const createOceanMaterial = ({ displacementMap, normalMap, simSize }) => {
  const uniforms = {
    uTime: { value: 0.0 },
    uDisplacementMap: { value: displacementMap },
    uNormalMap: { value: normalMap },
    uSimSize: { value: simSize },
    uDisplacementScale: { value: 1.0 },
    uNormalStrength: { value: 1.0 },
    uRoughness: { value: 0.15 },
    uFoamIntensity: { value: 0.55 },
    uFoamColor: { value: new Color(0xf8fbff) },
    uDeepColor: { value: new Color(0x031126) },
    uShallowColor: { value: new Color(0x206a89) },
    uSunDirection: { value: new Vector3(0.5, 0.6, 0.4).normalize() },
    uSunColor: { value: new Color(0xfff2d0) },
    uSkyZenithColor: { value: new Color(0x4f84c4) },
    uSkyHorizonColor: { value: new Color(0xaac7de) },
    uHazeDensity: { value: 0.00017 },
    uRefractionStrength: { value: 0.34 },
    uReflectionMap: { value: defaultReflectionTexture },
    uReflectionMatrix: { value: new Matrix4() },
    uReflectionStrength: { value: 0.58 },
    uReflectionDistortion: { value: 0.016 },
    uSunScatterStrength: { value: 0.24 },
    uFoamScale: { value: 0.17 },
    uDetailDrift: { value: new Vector2(0.0, 0.0) },
  };

  const material = new ShaderMaterial({
    uniforms,
    vertexShader: `
      precision highp float;

      uniform sampler2D uDisplacementMap;
      uniform float uSimSize;
      uniform float uDisplacementScale;
      uniform mat4 uReflectionMatrix;
      uniform float uTime;
      uniform vec2 uDetailDrift;

      varying vec3 vWorldPosition;
      varying vec2 vSimUV0;
      varying vec2 vSimUV1;
      varying float vDisplacedHeight;
      varying vec4 vReflectionCoord;

      vec2 worldToSimUV(vec2 worldXZ, float tiling, vec2 drift) {
        return fract(worldXZ / (uSimSize * tiling) + drift);
      }

      void main() {
        vec3 worldPosition = (modelMatrix * vec4(position, 1.0)).xyz;

        vec2 uv0 = worldToSimUV(worldPosition.xz, 1.0, vec2(0.0));
        vec2 uv1 = worldToSimUV(worldPosition.xz * 0.43 + uDetailDrift * uTime * 40.0, 0.42, vec2(0.25, 0.13));

        vec3 displacement0 = texture2D(uDisplacementMap, uv0).xyz;
        vec3 displacement1 = texture2D(uDisplacementMap, uv1).xyz;

        vec3 displacement = displacement0 + displacement1 * 0.35;
        displacement.xz *= uDisplacementScale;
        displacement.y *= uDisplacementScale * 1.2;

        vec3 displacedWorld = worldPosition + displacement;

        vWorldPosition = displacedWorld;
        vSimUV0 = uv0;
        vSimUV1 = uv1;
        vDisplacedHeight = displacement.y;
        vReflectionCoord = uReflectionMatrix * vec4(displacedWorld, 1.0);

        gl_Position = projectionMatrix * viewMatrix * vec4(displacedWorld, 1.0);
      }
    `,
    fragmentShader: `
      precision highp float;

      uniform sampler2D uNormalMap;
      uniform vec3 uSunDirection;
      uniform vec3 uSunColor;
      uniform vec3 uSkyZenithColor;
      uniform vec3 uSkyHorizonColor;
      uniform vec3 uDeepColor;
      uniform vec3 uShallowColor;
      uniform vec3 uFoamColor;
      uniform float uFoamIntensity;
      uniform float uRoughness;
      uniform float uNormalStrength;
      uniform float uHazeDensity;
      uniform float uRefractionStrength;
      uniform float uReflectionStrength;
      uniform float uReflectionDistortion;
      uniform float uSunScatterStrength;
      uniform float uFoamScale;
      uniform sampler2D uReflectionMap;
      uniform float uTime;

      varying vec3 vWorldPosition;
      varying vec2 vSimUV0;
      varying vec2 vSimUV1;
      varying float vDisplacedHeight;
      varying vec4 vReflectionCoord;

      float sat01(float value) {
        return clamp(value, 0.0, 1.0);
      }

      float hash12(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      float valueNoise2D(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);

        float a = hash12(i);
        float b = hash12(i + vec2(1.0, 0.0));
        float c = hash12(i + vec2(0.0, 1.0));
        float d = hash12(i + vec2(1.0, 1.0));

        vec2 u = f * f * (3.0 - 2.0 * f);

        return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
      }

      float edgeFade(vec2 uv, float fadeWidth) {
        vec2 f = min(uv, 1.0 - uv);
        float edgeDistance = min(f.x, f.y);
        return smoothstep(0.0, fadeWidth, edgeDistance);
      }

      vec3 sampleSky(vec3 direction, vec3 sunDirection) {
        float up = sat01(direction.y * 0.5 + 0.5);
        vec3 skyGradient = mix(uSkyHorizonColor, uSkyZenithColor, pow(up, 1.3));

        float sunAmount = sat01(dot(normalize(direction), normalize(sunDirection)));
        float sunGlow = pow(sunAmount, 18.0) * 0.45;
        float sunDisk = smoothstep(0.998, 0.9999, sunAmount) * 20.0;

        return skyGradient + uSunColor * (sunGlow + sunDisk);
      }

      float distributionGGX(float NdotH, float roughness) {
        float a = roughness * roughness;
        float a2 = a * a;
        float denominator = (NdotH * NdotH * (a2 - 1.0) + 1.0);
        return a2 / max(3.14159265 * denominator * denominator, 0.0001);
      }

      float geometrySchlickGGX(float NdotV, float roughness) {
        float r = roughness + 1.0;
        float k = (r * r) / 8.0;
        return NdotV / max(NdotV * (1.0 - k) + k, 0.0001);
      }

      float geometrySmith(float NdotV, float NdotL, float roughness) {
        return geometrySchlickGGX(NdotV, roughness) * geometrySchlickGGX(NdotL, roughness);
      }

      vec3 fresnelSchlick(float cosTheta, vec3 F0) {
        return F0 + (1.0 - F0) * pow(1.0 - cosTheta, 5.0);
      }

      void main() {
        vec3 sampledNormal0 = texture2D(uNormalMap, vSimUV0).xyz;
        vec3 sampledNormal1 = texture2D(uNormalMap, vSimUV1 * 1.6 + vec2(uTime * 0.02, -uTime * 0.017)).xyz;

        vec3 N = normalize(mix(sampledNormal0, sampledNormal1, 0.4));
        N.xz *= uNormalStrength;
        N = normalize(N);

        vec3 V = normalize(cameraPosition - vWorldPosition);
        vec3 L = normalize(uSunDirection);
        vec3 H = normalize(V + L);

        float NdotV = sat01(dot(N, V));
        float NdotL = sat01(dot(N, L));
        float NdotH = sat01(dot(N, H));
        float VdotH = sat01(dot(V, H));

        float slope = sat01(1.0 - N.y);
        float roughness = sat01(uRoughness + slope * 0.33);

        vec3 F0 = vec3(0.02);
        vec3 F = fresnelSchlick(VdotH, F0);

        float D = distributionGGX(NdotH, roughness);
        float G = geometrySmith(NdotV, NdotL, roughness);
        vec3 specular = (D * G * F / max(4.0 * NdotV * NdotL, 0.0001)) * uSunColor * NdotL;

        vec3 reflectedSky = sampleSky(reflect(-V, N), L);
        vec3 refractedSky = sampleSky(refract(-V, N, 1.0 / 1.333), L);
        vec2 reflectionUV = vReflectionCoord.xy / max(vReflectionCoord.w, 0.0001);
        vec2 reflectionDistortion = N.xz * uReflectionDistortion * (0.25 + (1.0 - NdotV) * 0.75);
        vec2 reflectionUVDistorted = reflectionUV + reflectionDistortion;
        vec2 reflectionUVClamped = clamp(reflectionUVDistorted, vec2(0.001), vec2(0.999));
        vec3 planarReflection = texture2D(uReflectionMap, reflectionUVClamped).rgb;
        float reflectionInside = edgeFade(reflectionUVDistorted, 0.045) * step(0.0, vReflectionCoord.w);

        float shallowMix = sat01(0.52 + vDisplacedHeight * 0.07 - slope * 0.45 + NdotV * 0.2);
        vec3 bodyColor = mix(uDeepColor, uShallowColor, shallowMix);
        float opticalDepth = 1.0 / max(0.09, NdotV);
        vec3 absorption = exp(-vec3(0.55, 0.24, 0.11) * opticalDepth * 0.55);
        bodyColor *= absorption;

        vec3 refractedColor = mix(bodyColor, refractedSky * bodyColor, uRefractionStrength * 0.45);
        float distanceToCamera = length(cameraPosition.xz - vWorldPosition.xz);
        float planarDistanceFade = sat01(1.0 - distanceToCamera * 0.00022);
        float planarWeight = uReflectionStrength * planarDistanceFade * reflectionInside;
        vec3 reflectedColor = mix(reflectedSky, planarReflection, planarWeight);

        float fresnel = sat01(0.02 + 0.98 * pow(1.0 - NdotV, 5.0));
        vec3 waterColor = mix(refractedColor, reflectedColor, fresnel);
        float glitterNoise = valueNoise2D(vWorldPosition.xz * 2.7 + vec2(uTime * 0.3, -uTime * 0.24));
        float glitter = smoothstep(0.86, 1.0, glitterNoise) * pow(NdotL, 3.0) * pow(1.0 - roughness, 1.5);
        vec3 forwardScatter = uSunColor * pow(sat01(dot(-V, L)), 6.0) * slope * uSunScatterStrength;
        waterColor += specular + uSunColor * glitter * 0.06 + forwardScatter;

        float crest = smoothstep(0.2, 0.65, slope + max(vDisplacedHeight, 0.0) * 0.03);
        float foamNoiseLarge = valueNoise2D(vWorldPosition.xz * uFoamScale + vec2(uTime * 0.08, -uTime * 0.05));
        float foamNoiseFine = valueNoise2D(vWorldPosition.xz * (uFoamScale * 3.4) + vec2(-uTime * 0.13, uTime * 0.11));
        float foamPattern = foamNoiseLarge * 0.68 + foamNoiseFine * 0.32;
        float foamMask = crest * smoothstep(0.46, 0.9, foamPattern) * uFoamIntensity;
        waterColor = mix(waterColor, uFoamColor, sat01(foamMask));

        float hazeFactor = 1.0 - exp(-distanceToCamera * uHazeDensity);
        vec3 hazeColor = mix(uSkyHorizonColor, uSkyZenithColor, 0.2);

        vec3 finalColor = mix(waterColor, hazeColor, sat01(hazeFactor));

        gl_FragColor = vec4(finalColor, 1.0);
      }
    `,
    transparent: false,
    depthWrite: false,
    depthTest: true,
  });
  material.name = 'OceanSurfaceMaterial';

  return { material, uniforms };
};
