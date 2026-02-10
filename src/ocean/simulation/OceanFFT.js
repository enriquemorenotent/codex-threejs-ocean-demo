import {
  ClampToEdgeWrapping,
  DataTexture,
  FloatType,
  HalfFloatType,
  LinearFilter,
  Mesh,
  NearestFilter,
  NoBlending,
  OrthographicCamera,
  PlaneGeometry,
  RGBAFormat,
  RepeatWrapping,
  Scene,
  ShaderMaterial,
  UniformsUtils,
  Vector2,
  WebGLRenderTarget,
} from 'three';
import { FFTShaders } from './fftShaders';

const ensurePowerOfTwo = (value) => {
  const integerValue = Math.max(2, Math.floor(value));

  if ((integerValue & (integerValue - 1)) !== 0) {
    throw new Error(`FFT resolution must be power of two, got ${value}`);
  }

  return integerValue;
};

const optionalParameter = (value, defaultValue) => (value !== undefined ? value : defaultValue);

export class OceanFFT {
  constructor(renderer, options = {}) {
    this.renderer = renderer;
    this.resolution = ensurePowerOfTwo(optionalParameter(options.resolution, 256));
    this.size = optionalParameter(options.size, 1000.0);
    this.choppiness = optionalParameter(options.choppiness, 1.6);
    this.windSpeed = optionalParameter(options.windSpeed, 12.0);
    this.windDirection = optionalParameter(options.windDirection, 0.0);
    this.deltaTime = 1.0 / 60.0;

    this.windVector = new Vector2();
    this.setWind(this.windSpeed, this.windDirection);

    this.simulationScene = new Scene();
    this.simulationCamera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    this.simulationCamera.position.z = 1;
    this.simulationQuad = new Mesh(new PlaneGeometry(2, 2));
    this.simulationScene.add(this.simulationQuad);

    this.initialized = false;
    this.needsSpectrumInit = true;
    this.pingPhase = true;

    this.#setupRenderTargets(options.useHalfFloat);
    this.#setupMaterials();
    this.#generateSeedPhaseTexture();
  }

  #setupRenderTargets(forceHalfFloat = true) {
    const renderTargetType = forceHalfFloat ? HalfFloatType : FloatType;

    const linearRepeatParams = {
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      wrapS: RepeatWrapping,
      wrapT: RepeatWrapping,
      format: RGBAFormat,
      depthBuffer: false,
      stencilBuffer: false,
      type: renderTargetType,
    };

    const nearestClampParams = {
      minFilter: NearestFilter,
      magFilter: NearestFilter,
      wrapS: ClampToEdgeWrapping,
      wrapT: ClampToEdgeWrapping,
      format: RGBAFormat,
      depthBuffer: false,
      stencilBuffer: false,
      type: renderTargetType,
    };

    const nearestRepeatParams = {
      minFilter: NearestFilter,
      magFilter: NearestFilter,
      wrapS: RepeatWrapping,
      wrapT: RepeatWrapping,
      format: RGBAFormat,
      depthBuffer: false,
      stencilBuffer: false,
      type: renderTargetType,
    };

    this.initialSpectrumFramebuffer = new WebGLRenderTarget(this.resolution, this.resolution, nearestRepeatParams);
    this.spectrumFramebuffer = new WebGLRenderTarget(this.resolution, this.resolution, nearestClampParams);
    this.pingPhaseFramebuffer = new WebGLRenderTarget(this.resolution, this.resolution, nearestClampParams);
    this.pongPhaseFramebuffer = new WebGLRenderTarget(this.resolution, this.resolution, nearestClampParams);
    this.pingTransformFramebuffer = new WebGLRenderTarget(this.resolution, this.resolution, nearestClampParams);
    this.pongTransformFramebuffer = new WebGLRenderTarget(this.resolution, this.resolution, nearestClampParams);
    this.displacementMapFramebuffer = new WebGLRenderTarget(this.resolution, this.resolution, linearRepeatParams);
    this.normalMapFramebuffer = new WebGLRenderTarget(this.resolution, this.resolution, linearRepeatParams);
  }

  #setupMaterials() {
    const fullScreenShader = FFTShaders.simulationVertex;

    const horizontalShader = FFTShaders.subtransform;
    const horizontalUniforms = UniformsUtils.clone(horizontalShader.uniforms);
    this.materialOceanHorizontal = new ShaderMaterial({
      uniforms: horizontalUniforms,
      vertexShader: fullScreenShader.vertexShader,
      fragmentShader: `#define HORIZONTAL\n${horizontalShader.fragmentShader}`,
      depthTest: false,
      depthWrite: false,
      blending: NoBlending,
    });
    this.materialOceanHorizontal.name = 'OceanFFT_Horizontal';
    this.materialOceanHorizontal.uniforms.u_transformSize.value = this.resolution;

    const verticalShader = FFTShaders.subtransform;
    const verticalUniforms = UniformsUtils.clone(verticalShader.uniforms);
    this.materialOceanVertical = new ShaderMaterial({
      uniforms: verticalUniforms,
      vertexShader: fullScreenShader.vertexShader,
      fragmentShader: verticalShader.fragmentShader,
      depthTest: false,
      depthWrite: false,
      blending: NoBlending,
    });
    this.materialOceanVertical.name = 'OceanFFT_Vertical';
    this.materialOceanVertical.uniforms.u_transformSize.value = this.resolution;

    const initialSpectrumShader = FFTShaders.initialSpectrum;
    const initialSpectrumUniforms = UniformsUtils.clone(initialSpectrumShader.uniforms);
    this.materialInitialSpectrum = new ShaderMaterial({
      uniforms: initialSpectrumUniforms,
      vertexShader: initialSpectrumShader.vertexShader,
      fragmentShader: initialSpectrumShader.fragmentShader,
      depthTest: false,
      depthWrite: false,
      blending: NoBlending,
    });
    this.materialInitialSpectrum.name = 'OceanFFT_InitialSpectrum';
    this.materialInitialSpectrum.uniforms.u_resolution.value = this.resolution;

    const phaseShader = FFTShaders.phase;
    const phaseUniforms = UniformsUtils.clone(phaseShader.uniforms);
    this.materialPhase = new ShaderMaterial({
      uniforms: phaseUniforms,
      vertexShader: fullScreenShader.vertexShader,
      fragmentShader: phaseShader.fragmentShader,
      depthTest: false,
      depthWrite: false,
      blending: NoBlending,
    });
    this.materialPhase.name = 'OceanFFT_Phase';
    this.materialPhase.uniforms.u_resolution.value = this.resolution;

    const spectrumShader = FFTShaders.spectrum;
    const spectrumUniforms = UniformsUtils.clone(spectrumShader.uniforms);
    this.materialSpectrum = new ShaderMaterial({
      uniforms: spectrumUniforms,
      vertexShader: fullScreenShader.vertexShader,
      fragmentShader: spectrumShader.fragmentShader,
      depthTest: false,
      depthWrite: false,
      blending: NoBlending,
    });
    this.materialSpectrum.name = 'OceanFFT_Spectrum';
    this.materialSpectrum.uniforms.u_resolution.value = this.resolution;

    const normalShader = FFTShaders.normal;
    const normalUniforms = UniformsUtils.clone(normalShader.uniforms);
    this.materialNormal = new ShaderMaterial({
      uniforms: normalUniforms,
      vertexShader: fullScreenShader.vertexShader,
      fragmentShader: normalShader.fragmentShader,
      depthTest: false,
      depthWrite: false,
      blending: NoBlending,
    });
    this.materialNormal.name = 'OceanFFT_Normal';
    this.materialNormal.uniforms.u_resolution.value = this.resolution;
  }

  #generateSeedPhaseTexture() {
    const phaseArray = new Float32Array(this.resolution * this.resolution * 4);

    for (let i = 0; i < this.resolution; i += 1) {
      for (let j = 0; j < this.resolution; j += 1) {
        const idx = i * this.resolution * 4 + j * 4;
        phaseArray[idx] = Math.random() * Math.PI * 2.0;
        phaseArray[idx + 1] = 0.0;
        phaseArray[idx + 2] = 0.0;
        phaseArray[idx + 3] = 0.0;
      }
    }

    this.pingPhaseTexture = new DataTexture(phaseArray, this.resolution, this.resolution, RGBAFormat, FloatType);
    this.pingPhaseTexture.wrapS = ClampToEdgeWrapping;
    this.pingPhaseTexture.wrapT = ClampToEdgeWrapping;
    this.pingPhaseTexture.needsUpdate = true;
  }

  setWind(speed, directionRadians) {
    this.windSpeed = Math.max(0.01, speed);
    this.windDirection = directionRadians;
    this.windVector.set(Math.cos(directionRadians) * this.windSpeed, Math.sin(directionRadians) * this.windSpeed);
    this.needsSpectrumInit = true;
  }

  setSize(size) {
    this.size = Math.max(32.0, size);
    this.needsSpectrumInit = true;
  }

  setChoppiness(choppiness) {
    this.choppiness = Math.max(0.0, choppiness);
  }

  #renderInitialSpectrum() {
    this.simulationScene.overrideMaterial = this.materialInitialSpectrum;
    this.simulationQuad.material = this.materialInitialSpectrum;

    this.materialInitialSpectrum.uniforms.u_wind.value.copy(this.windVector);
    this.materialInitialSpectrum.uniforms.u_size.value = this.size;

    this.renderer.setRenderTarget(this.initialSpectrumFramebuffer);
    this.renderer.clear();
    this.renderer.render(this.simulationScene, this.simulationCamera);

    this.needsSpectrumInit = false;
  }

  #renderWavePhase() {
    this.simulationScene.overrideMaterial = this.materialPhase;
    this.simulationQuad.material = this.materialPhase;

    if (!this.initialized) {
      this.materialPhase.uniforms.u_phases.value = this.pingPhaseTexture;
      this.initialized = true;
    } else {
      this.materialPhase.uniforms.u_phases.value = this.pingPhase ? this.pingPhaseFramebuffer.texture : this.pongPhaseFramebuffer.texture;
    }

    this.materialPhase.uniforms.u_deltaTime.value = this.deltaTime;
    this.materialPhase.uniforms.u_size.value = this.size;

    this.renderer.setRenderTarget(this.pingPhase ? this.pongPhaseFramebuffer : this.pingPhaseFramebuffer);
    this.renderer.render(this.simulationScene, this.simulationCamera);
    this.pingPhase = !this.pingPhase;
  }

  #renderSpectrum() {
    this.simulationScene.overrideMaterial = this.materialSpectrum;
    this.simulationQuad.material = this.materialSpectrum;

    this.materialSpectrum.uniforms.u_initialSpectrum.value = this.initialSpectrumFramebuffer.texture;
    this.materialSpectrum.uniforms.u_phases.value = this.pingPhase ? this.pingPhaseFramebuffer.texture : this.pongPhaseFramebuffer.texture;
    this.materialSpectrum.uniforms.u_choppiness.value = this.choppiness;
    this.materialSpectrum.uniforms.u_size.value = this.size;

    this.renderer.setRenderTarget(this.spectrumFramebuffer);
    this.renderer.render(this.simulationScene, this.simulationCamera);
  }

  #renderSpectrumFFT() {
    const iterations = Math.log2(this.resolution);

    this.simulationScene.overrideMaterial = this.materialOceanHorizontal;
    this.simulationQuad.material = this.materialOceanHorizontal;

    for (let i = 0; i < iterations; i += 1) {
      this.materialOceanHorizontal.uniforms.u_subtransformSize.value = 2 ** ((i % iterations) + 1);

      if (i === 0) {
        this.materialOceanHorizontal.uniforms.u_input.value = this.spectrumFramebuffer.texture;
        this.renderer.setRenderTarget(this.pingTransformFramebuffer);
      } else if (i % 2 === 1) {
        this.materialOceanHorizontal.uniforms.u_input.value = this.pingTransformFramebuffer.texture;
        this.renderer.setRenderTarget(this.pongTransformFramebuffer);
      } else {
        this.materialOceanHorizontal.uniforms.u_input.value = this.pongTransformFramebuffer.texture;
        this.renderer.setRenderTarget(this.pingTransformFramebuffer);
      }

      this.renderer.render(this.simulationScene, this.simulationCamera);
    }

    this.simulationScene.overrideMaterial = this.materialOceanVertical;
    this.simulationQuad.material = this.materialOceanVertical;

    for (let i = iterations; i < iterations * 2; i += 1) {
      this.materialOceanVertical.uniforms.u_subtransformSize.value = 2 ** ((i % iterations) + 1);

      if (i === iterations * 2 - 1) {
        this.materialOceanVertical.uniforms.u_input.value = iterations % 2 === 0 ? this.pingTransformFramebuffer.texture : this.pongTransformFramebuffer.texture;
        this.renderer.setRenderTarget(this.displacementMapFramebuffer);
      } else if (i % 2 === 1) {
        this.materialOceanVertical.uniforms.u_input.value = this.pingTransformFramebuffer.texture;
        this.renderer.setRenderTarget(this.pongTransformFramebuffer);
      } else {
        this.materialOceanVertical.uniforms.u_input.value = this.pongTransformFramebuffer.texture;
        this.renderer.setRenderTarget(this.pingTransformFramebuffer);
      }

      this.renderer.render(this.simulationScene, this.simulationCamera);
    }
  }

  #renderNormalMap() {
    this.simulationScene.overrideMaterial = this.materialNormal;
    this.simulationQuad.material = this.materialNormal;

    this.materialNormal.uniforms.u_size.value = this.size;
    this.materialNormal.uniforms.u_displacementMap.value = this.displacementMapFramebuffer.texture;

    this.renderer.setRenderTarget(this.normalMapFramebuffer);
    this.renderer.clear();
    this.renderer.render(this.simulationScene, this.simulationCamera);
  }

  update(deltaTime) {
    const currentRenderTarget = this.renderer.getRenderTarget();
    this.deltaTime = Math.min(0.1, Math.max(1.0 / 240.0, deltaTime));

    if (this.needsSpectrumInit) {
      this.#renderInitialSpectrum();
    }

    this.#renderWavePhase();
    this.#renderSpectrum();
    this.#renderSpectrumFFT();
    this.#renderNormalMap();

    this.simulationScene.overrideMaterial = null;
    this.renderer.setRenderTarget(currentRenderTarget);
  }

  getDisplacementMap() {
    return this.displacementMapFramebuffer.texture;
  }

  getNormalMap() {
    return this.normalMapFramebuffer.texture;
  }

  dispose() {
    this.simulationQuad.geometry.dispose();

    this.initialSpectrumFramebuffer.dispose();
    this.spectrumFramebuffer.dispose();
    this.pingPhaseFramebuffer.dispose();
    this.pongPhaseFramebuffer.dispose();
    this.pingTransformFramebuffer.dispose();
    this.pongTransformFramebuffer.dispose();
    this.displacementMapFramebuffer.dispose();
    this.normalMapFramebuffer.dispose();

    this.pingPhaseTexture.dispose();

    this.materialOceanHorizontal.dispose();
    this.materialOceanVertical.dispose();
    this.materialInitialSpectrum.dispose();
    this.materialPhase.dispose();
    this.materialSpectrum.dispose();
    this.materialNormal.dispose();
  }
}
