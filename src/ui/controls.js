import GUI from 'lil-gui';

export const cinematicPreset = {
  windSpeed: 16.0,
  windDirection: 225.0,
  choppiness: 1.95,
  foamIntensity: 0.72,
  reflectionStrength: 0.78,
  reflectionDistortion: 0.018,
  sunScatterStrength: 0.32,
  foamScale: 0.19,
  reflectionQuality: 'ultra',
  exposure: 1.04,
  sunElevation: 14.0,
  quality: 'balanced',
  lodScale: 1.0,
};

export const defaultPreset = {
  windSpeed: 11.0,
  windDirection: 140.0,
  choppiness: 1.45,
  foamIntensity: 0.52,
  reflectionStrength: 0.62,
  reflectionDistortion: 0.016,
  sunScatterStrength: 0.24,
  foamScale: 0.17,
  reflectionQuality: 'high',
  exposure: 1.0,
  sunElevation: 24.0,
  quality: 'balanced',
  lodScale: 1.0,
};

export const createOceanGui = ({
  initialParams,
  onOceanParamChange,
  onExposureChange,
  onQualityChange,
  onApplyPreset,
  onLodScaleChange,
  onReflectionQualityChange,
}) => {
  const gui = new GUI({ width: 320, title: 'Ocean Controls' });
  const params = { ...initialParams };

  const oceanFolder = gui.addFolder('Simulation');
  oceanFolder.add(params, 'windSpeed', 2.0, 30.0, 0.1).name('Wind speed').onChange((value) => onOceanParamChange('windSpeed', value));
  oceanFolder.add(params, 'windDirection', 0.0, 360.0, 1.0).name('Wind direction').onChange((value) => onOceanParamChange('windDirection', value));
  oceanFolder.add(params, 'choppiness', 0.1, 3.2, 0.01).name('Choppiness').onChange((value) => onOceanParamChange('choppiness', value));
  oceanFolder.add(params, 'foamIntensity', 0.0, 2.5, 0.01).name('Foam intensity').onChange((value) => onOceanParamChange('foamIntensity', value));
  oceanFolder.add(params, 'foamScale', 0.08, 0.38, 0.005).name('Foam scale').onChange((value) => onOceanParamChange('foamScale', value));
  oceanFolder.add(params, 'sunScatterStrength', 0.0, 0.7, 0.01).name('Sun scatter').onChange((value) => onOceanParamChange('sunScatterStrength', value));
  oceanFolder.open();

  const lightingFolder = gui.addFolder('Lighting');
  lightingFolder.add(params, 'sunElevation', 2.0, 85.0, 0.1).name('Sun elevation').onChange((value) => onOceanParamChange('sunElevation', value));
  lightingFolder.add(params, 'exposure', 0.45, 2.2, 0.01).name('Exposure').onChange((value) => onExposureChange(value));

  const reflectionFolder = gui.addFolder('Reflections');
  reflectionFolder
    .add(params, 'reflectionStrength', 0.0, 1.25, 0.01)
    .name('Reflection strength')
    .onChange((value) => onOceanParamChange('reflectionStrength', value));
  reflectionFolder
    .add(params, 'reflectionDistortion', 0.0, 0.06, 0.001)
    .name('Reflection distortion')
    .onChange((value) => onOceanParamChange('reflectionDistortion', value));
  reflectionFolder
    .add(params, 'reflectionQuality', {
      Medium: 'medium',
      High: 'high',
      Ultra: 'ultra',
    })
    .name('Reflection quality')
    .onFinishChange((value) => onReflectionQualityChange(value));

  const qualityFolder = gui.addFolder('Quality / LOD');
  qualityFolder
    .add(params, 'quality', {
      Performance: 'performance',
      Balanced: 'balanced',
      Cinematic: 'cinematic',
    })
    .name('Quality preset')
    .onFinishChange((value) => onQualityChange(value));

  qualityFolder.add(params, 'lodScale', 0.7, 1.8, 0.01).name('LOD scale').onChange((value) => onLodScaleChange(value));

  const actions = {
    cinematicPresetAction: () => {
      Object.entries(cinematicPreset).forEach(([key, value]) => {
        params[key] = value;
      });
      onApplyPreset({ ...cinematicPreset });

      gui.controllersRecursive().forEach((controller) => {
        controller.updateDisplay();
      });
    },
  };

  gui.add(actions, 'cinematicPresetAction').name('Apply cinematic preset');

  return {
    gui,
    params,
    dispose: () => {
      gui.destroy();
    },
  };
};
