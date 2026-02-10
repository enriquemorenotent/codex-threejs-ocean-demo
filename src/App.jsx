import { useEffect, useRef } from 'react';
import {
  ACESFilmicToneMapping,
  Clock,
  Color,
  FogExp2,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { OceanSystem } from './ocean/OceanSystem';
import { PlanarReflectionPass } from './ocean/render/PlanarReflectionPass';
import { SkySystem } from './sky/SkySystem';
import { createOceanGui, defaultPreset } from './ui/controls';

const DPR_CAP = 1.75;
const REFLECTION_QUALITY_SCALE = {
  medium: 0.55,
  high: 0.8,
  ultra: 1.0,
};

const App = () => {
  const mountRef = useRef(null);

  useEffect(() => {
    const mountNode = mountRef.current;

    if (!mountNode) {
      return () => {};
    }

    const scene = new Scene();
    scene.background = new Color(0x7ea2ca);
    scene.fog = new FogExp2(0x8fa8bd, 0.00009);

    const camera = new PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 180000);
    camera.position.set(38, 9, 42);

    const renderer = new WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, DPR_CAP));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = defaultPreset.exposure;
    renderer.debug.checkShaderErrors = true;
    renderer.debug.onShaderError = (gl, program, vertexShader, fragmentShader) => {
      const programInfo = gl.getProgramInfoLog(program);
      const vertexInfo = gl.getShaderInfoLog(vertexShader);
      const fragmentInfo = gl.getShaderInfoLog(fragmentShader);
      const vertexSource = gl.getShaderSource(vertexShader);
      const fragmentSource = gl.getShaderSource(fragmentShader);
      const withLineNumbers = (source) =>
        source
          .split('\n')
          .map((line, index) => `${index + 1}: ${line}`)
          .join('\n');
      console.error('Three.js shader compile/link failure', {
        programInfo,
        vertexInfo,
        fragmentInfo,
        vertexSource: withLineNumbers(vertexSource),
        fragmentSource: withLineNumbers(fragmentSource),
      });
    };

    mountNode.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.045;
    controls.minDistance = 6;
    controls.maxDistance = 28000;
    controls.maxPolarAngle = Math.PI * 0.497;
    controls.target.set(0, 2.5, 0);
    controls.update();

    const skySystem = new SkySystem(scene);
    const oceanSystem = new OceanSystem({
      renderer,
      scene,
      camera,
      qualityPreset: defaultPreset.quality,
      params: defaultPreset,
    });

    skySystem.setSun(defaultPreset.sunElevation);

    const planarReflectionPass = new PlanarReflectionPass({
      renderer,
      scene,
      camera,
      oceanRoot: oceanSystem.root,
      resolutionScale: REFLECTION_QUALITY_SCALE[defaultPreset.reflectionQuality] ?? 0.8,
    });

    const applyPreset = (presetValues) => {
      if (typeof presetValues.windSpeed === 'number') oceanSystem.setParam('windSpeed', presetValues.windSpeed);
      if (typeof presetValues.windDirection === 'number') oceanSystem.setParam('windDirection', presetValues.windDirection);
      if (typeof presetValues.choppiness === 'number') oceanSystem.setParam('choppiness', presetValues.choppiness);
      if (typeof presetValues.foamIntensity === 'number') oceanSystem.setParam('foamIntensity', presetValues.foamIntensity);
      if (typeof presetValues.foamScale === 'number') oceanSystem.setParam('foamScale', presetValues.foamScale);
      if (typeof presetValues.sunScatterStrength === 'number') oceanSystem.setParam('sunScatterStrength', presetValues.sunScatterStrength);
      if (typeof presetValues.reflectionStrength === 'number') oceanSystem.setParam('reflectionStrength', presetValues.reflectionStrength);
      if (typeof presetValues.reflectionDistortion === 'number') oceanSystem.setParam('reflectionDistortion', presetValues.reflectionDistortion);
      if (typeof presetValues.lodScale === 'number') oceanSystem.setParam('lodScale', presetValues.lodScale);
      if (typeof presetValues.sunElevation === 'number') skySystem.setSun(presetValues.sunElevation);
      if (typeof presetValues.exposure === 'number') renderer.toneMappingExposure = presetValues.exposure;
      if (typeof presetValues.quality === 'string') {
        oceanSystem.setQualityPreset(presetValues.quality);
      }
      if (typeof presetValues.reflectionQuality === 'string') {
        planarReflectionPass.setResolutionScale(REFLECTION_QUALITY_SCALE[presetValues.reflectionQuality] ?? 0.8);
      }
    };

    const guiController = createOceanGui({
      initialParams: defaultPreset,
      onOceanParamChange: (key, value) => {
        if (key === 'sunElevation') {
          skySystem.setSun(value);
          return;
        }

        oceanSystem.setParam(key, value);
      },
      onExposureChange: (value) => {
        renderer.toneMappingExposure = value;
      },
      onQualityChange: (value) => {
        oceanSystem.setQualityPreset(value);
      },
      onApplyPreset: (presetValues) => {
        applyPreset(presetValues);
      },
      onLodScaleChange: (value) => {
        oceanSystem.setParam('lodScale', value);
      },
      onReflectionQualityChange: (value) => {
        planarReflectionPass.setResolutionScale(REFLECTION_QUALITY_SCALE[value] ?? 0.8);
      },
    });

    const keyState = {};

    const onKeyDown = (event) => {
      keyState[event.code] = true;
    };

    const onKeyUp = (event) => {
      keyState[event.code] = false;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    const velocity = new Vector3();
    const forward = new Vector3();
    const right = new Vector3();
    const up = new Vector3(0, 1, 0);

    const updateFlightControls = (deltaTime) => {
      const hasMovementInput =
        keyState.KeyW || keyState.KeyA || keyState.KeyS || keyState.KeyD || keyState.KeyQ || keyState.KeyE;

      if (!hasMovementInput) {
        return;
      }

      const speedFactor = keyState.ShiftLeft || keyState.ShiftRight ? 3.0 : 1.0;
      const altitudeBoost = Math.max(1.0, camera.position.y * 0.06);
      const speed = (18.0 + altitudeBoost) * speedFactor * deltaTime;

      camera.getWorldDirection(forward);
      forward.y = 0.0;
      forward.normalize();

      right.crossVectors(forward, up).normalize();
      velocity.set(0, 0, 0);

      if (keyState.KeyW) velocity.addScaledVector(forward, speed);
      if (keyState.KeyS) velocity.addScaledVector(forward, -speed);
      if (keyState.KeyD) velocity.addScaledVector(right, speed);
      if (keyState.KeyA) velocity.addScaledVector(right, -speed);
      if (keyState.KeyE) velocity.y += speed;
      if (keyState.KeyQ) velocity.y -= speed;

      camera.position.add(velocity);
      controls.target.add(velocity);
    };

    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, DPR_CAP));
      renderer.setSize(window.innerWidth, window.innerHeight);
      planarReflectionPass.resize(window.innerWidth, window.innerHeight);
    };

    window.addEventListener('resize', onResize);

    const clock = new Clock();
    let rafId = null;

    const tick = () => {
      const delta = clock.getDelta();
      const elapsed = clock.getElapsedTime();

      updateFlightControls(delta);
      controls.update();
      oceanSystem.update(delta, elapsed, skySystem.getLightingState());
      planarReflectionPass.update({
        oceanUniforms: oceanSystem.uniforms,
      });

      renderer.render(scene, camera);
      rafId = window.requestAnimationFrame(tick);
    };

    tick();

    return () => {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }

      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);

      guiController.dispose();
      oceanSystem.dispose();
      skySystem.dispose();
      planarReflectionPass.dispose();
      controls.dispose();
      renderer.dispose();

      if (renderer.domElement.parentElement === mountNode) {
        mountNode.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div className="app-shell">
      <div className="viewport" ref={mountRef} />
      <div className="hud">
        <h1>Next-Gen Open Ocean</h1>
        <p>Mouse: orbit, pan, zoom. Keys: W/A/S/D + Q/E for flight, Shift to accelerate.</p>
      </div>
    </div>
  );
};

export default App;
