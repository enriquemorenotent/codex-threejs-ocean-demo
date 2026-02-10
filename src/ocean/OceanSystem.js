import { Group, MathUtils } from 'three';
import { OceanLODGrid } from './render/OceanLODGrid';
import { createOceanMaterial } from './render/OceanMaterial';
import { OceanFFT } from './simulation/OceanFFT';

export const QUALITY_PRESETS = {
  performance: {
    fftResolution: 128,
    simulationSize: 840,
    levelSizes: [224, 448, 896, 1792, 3584, 7168, 14336],
    baseCellSize: 1.75,
    ringOverlap: 0.4,
    displacementScale: 0.95,
  },
  balanced: {
    fftResolution: 256,
    simulationSize: 980,
    levelSizes: [256, 512, 1024, 2048, 4096, 8192, 16384],
    baseCellSize: 1.2,
    ringOverlap: 0.5,
    displacementScale: 1.1,
  },
  cinematic: {
    fftResolution: 512,
    simulationSize: 1180,
    levelSizes: [320, 640, 1280, 2560, 5120, 10240, 20480],
    baseCellSize: 0.95,
    ringOverlap: 0.6,
    displacementScale: 1.24,
  },
};

const DEFAULT_PARAMS = {
  windSpeed: 11.0,
  windDirection: 140.0,
  choppiness: 1.45,
  foamIntensity: 0.52,
  sunElevation: 24.0,
  lodScale: 1.0,
  reflectionStrength: 0.62,
  reflectionDistortion: 0.016,
  sunScatterStrength: 0.24,
  foamScale: 0.17,
};

const toRadians = (degrees) => MathUtils.degToRad(degrees);

export class OceanSystem {
  constructor({ renderer, scene, camera, qualityPreset = 'balanced', params = {} }) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;

    this.params = {
      ...DEFAULT_PARAMS,
      ...params,
    };

    this.qualityPreset = qualityPreset;
    this.quality = QUALITY_PRESETS[qualityPreset] || QUALITY_PRESETS.balanced;

    this.root = new Group();
    this.root.name = 'OceanSystemRoot';
    this.scene.add(this.root);

    this.fft = null;
    this.lodGrid = null;
    this.material = null;
    this.uniforms = null;

    this.rebuild(this.qualityPreset);
  }

  rebuild(qualityPreset = this.qualityPreset) {
    this.qualityPreset = qualityPreset;
    this.quality = QUALITY_PRESETS[qualityPreset] || QUALITY_PRESETS.balanced;

    this.#teardown();

    this.fft = new OceanFFT(this.renderer, {
      resolution: this.quality.fftResolution,
      size: this.quality.simulationSize,
      windSpeed: this.params.windSpeed,
      windDirection: toRadians(this.params.windDirection),
      choppiness: this.params.choppiness,
      useHalfFloat: true,
    });

    const { material, uniforms } = createOceanMaterial({
      displacementMap: this.fft.getDisplacementMap(),
      normalMap: this.fft.getNormalMap(),
      simSize: this.quality.simulationSize,
    });

    this.material = material;
    this.uniforms = uniforms;

    this.lodGrid = new OceanLODGrid({
      material: this.material,
      levels: this.quality.levelSizes,
      baseCellSize: this.quality.baseCellSize,
      ringOverlap: this.quality.ringOverlap,
    });

    this.lodGrid.setLodScale(this.params.lodScale);
    this.root.add(this.lodGrid.group);

    this.#applyOceanParams();
  }

  #teardown() {
    if (this.lodGrid) {
      this.lodGrid.dispose();
      this.root.remove(this.lodGrid.group);
      this.lodGrid = null;
    }

    if (this.material) {
      this.material.dispose();
      this.material = null;
      this.uniforms = null;
    }

    if (this.fft) {
      this.fft.dispose();
      this.fft = null;
    }
  }

  #applyOceanParams() {
    if (!this.fft || !this.uniforms) {
      return;
    }

    this.fft.setWind(this.params.windSpeed, toRadians(this.params.windDirection));
    this.fft.setChoppiness(this.params.choppiness);

    this.uniforms.uFoamIntensity.value = this.params.foamIntensity;
    this.uniforms.uDisplacementScale.value = this.quality.displacementScale * MathUtils.lerp(0.85, 1.2, this.params.choppiness / 3.2);
    this.uniforms.uNormalStrength.value = MathUtils.lerp(0.92, 1.35, Math.min(this.params.choppiness, 3.2) / 3.2);
    this.uniforms.uRoughness.value = MathUtils.lerp(0.09, 0.23, Math.min(this.params.windSpeed, 30.0) / 30.0);
    this.uniforms.uDetailDrift.value.set(
      Math.cos(toRadians(this.params.windDirection)),
      Math.sin(toRadians(this.params.windDirection))
    );
    this.uniforms.uReflectionStrength.value = this.params.reflectionStrength;
    this.uniforms.uReflectionDistortion.value = this.params.reflectionDistortion;
    this.uniforms.uSunScatterStrength.value = this.params.sunScatterStrength;
    this.uniforms.uFoamScale.value = this.params.foamScale;

    if (this.lodGrid) {
      this.lodGrid.setLodScale(this.params.lodScale);
    }
  }

  setParam(paramKey, paramValue) {
    this.params[paramKey] = paramValue;

    if (!this.uniforms || !this.fft) {
      return;
    }

    switch (paramKey) {
      case 'windSpeed':
      case 'windDirection':
      case 'choppiness':
      case 'foamIntensity':
      case 'lodScale':
      case 'reflectionStrength':
      case 'reflectionDistortion':
      case 'sunScatterStrength':
      case 'foamScale':
        this.#applyOceanParams();
        break;
      default:
        break;
    }
  }

  setQualityPreset(presetName) {
    if (presetName === this.qualityPreset) {
      return;
    }

    this.rebuild(presetName);
  }

  update(deltaTime, elapsedTime, lightingState) {
    if (!this.fft || !this.uniforms || !this.lodGrid) {
      return;
    }

    this.fft.update(deltaTime);

    this.uniforms.uTime.value = elapsedTime;
    this.uniforms.uDisplacementMap.value = this.fft.getDisplacementMap();
    this.uniforms.uNormalMap.value = this.fft.getNormalMap();

    if (lightingState) {
      this.uniforms.uSunDirection.value.copy(lightingState.sunDirection);
      this.uniforms.uSunColor.value.copy(lightingState.sunColor);
      this.uniforms.uSkyZenithColor.value.copy(lightingState.skyZenithColor);
      this.uniforms.uSkyHorizonColor.value.copy(lightingState.skyHorizonColor);
    }

    this.lodGrid.update(this.camera.position);
  }

  dispose() {
    this.#teardown();

    if (this.root.parent) {
      this.root.parent.remove(this.root);
    }
  }
}
