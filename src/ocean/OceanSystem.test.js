import { describe, expect, it } from 'vitest';
import { QUALITY_PRESETS } from './OceanSystem';

describe('QUALITY_PRESETS', () => {
  it('uses power-of-two FFT resolutions', () => {
    Object.values(QUALITY_PRESETS).forEach((preset) => {
      const resolution = preset.fftResolution;
      expect((resolution & (resolution - 1)) === 0).toBe(true);
    });
  });

  it('contains increasing level sizes for LOD', () => {
    Object.values(QUALITY_PRESETS).forEach((preset) => {
      for (let i = 1; i < preset.levelSizes.length; i += 1) {
        expect(preset.levelSizes[i]).toBeGreaterThan(preset.levelSizes[i - 1]);
      }
    });
  });
});
