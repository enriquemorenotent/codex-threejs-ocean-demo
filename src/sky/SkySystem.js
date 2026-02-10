import { Color, DirectionalLight, MathUtils, Vector3 } from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';

export class SkySystem {
  constructor(scene) {
    this.scene = scene;

    this.sky = new Sky();
    this.sky.scale.setScalar(450000);
    this.scene.add(this.sky);

    this.light = new DirectionalLight(0xffffff, 4.5);
    this.light.position.set(5000, 4500, 3000);
    this.scene.add(this.light);

    this.sunDirection = new Vector3(0.3, 0.5, 0.2).normalize();
    this.sunColor = new Color(0xfff0d8);
    this.skyZenithColor = new Color(0x4f84c4);
    this.skyHorizonColor = new Color(0xaac7de);

    this.sunElevation = 18.0;
    this.sunAzimuth = 170.0;

    const skyUniforms = this.sky.material.uniforms;
    skyUniforms.turbidity.value = 8.0;
    skyUniforms.rayleigh.value = 2.1;
    skyUniforms.mieCoefficient.value = 0.0032;
    skyUniforms.mieDirectionalG.value = 0.86;

    this.setSun(this.sunElevation, this.sunAzimuth);
  }

  #updateColors(dayFactor) {
    this.skyZenithColor.setHSL(
      MathUtils.lerp(0.62, 0.58, dayFactor),
      MathUtils.lerp(0.52, 0.43, dayFactor),
      MathUtils.lerp(0.16, 0.58, dayFactor)
    );

    this.skyHorizonColor.setHSL(
      MathUtils.lerp(0.09, 0.58, dayFactor),
      MathUtils.lerp(0.70, 0.42, dayFactor),
      MathUtils.lerp(0.55, 0.84, dayFactor)
    );

    this.sunColor.setHSL(
      MathUtils.lerp(0.06, 0.12, dayFactor),
      MathUtils.lerp(0.84, 0.35, dayFactor),
      MathUtils.lerp(0.58, 0.95, dayFactor)
    );
  }

  setSun(elevationDegrees, azimuthDegrees = this.sunAzimuth) {
    this.sunElevation = MathUtils.clamp(elevationDegrees, 1.0, 88.0);
    this.sunAzimuth = azimuthDegrees;

    const phi = MathUtils.degToRad(90.0 - this.sunElevation);
    const theta = MathUtils.degToRad(this.sunAzimuth);

    this.sunDirection.setFromSphericalCoords(1.0, phi, theta).normalize();

    const dayFactor = MathUtils.clamp((this.sunElevation + 5.0) / 80.0, 0.0, 1.0);
    this.#updateColors(dayFactor);

    const skyUniforms = this.sky.material.uniforms;
    skyUniforms.sunPosition.value.copy(this.sunDirection).multiplyScalar(450000);
    skyUniforms.turbidity.value = MathUtils.lerp(11.0, 2.5, dayFactor);
    skyUniforms.rayleigh.value = MathUtils.lerp(1.1, 2.8, dayFactor);
    skyUniforms.mieCoefficient.value = MathUtils.lerp(0.006, 0.0025, dayFactor);
    skyUniforms.mieDirectionalG.value = MathUtils.lerp(0.92, 0.82, dayFactor);

    this.light.position.copy(this.sunDirection).multiplyScalar(120000);
    this.light.color.copy(this.sunColor);
    this.light.intensity = MathUtils.lerp(0.25, 7.5, dayFactor);
  }

  getLightingState() {
    return {
      sunDirection: this.sunDirection,
      sunColor: this.sunColor,
      skyZenithColor: this.skyZenithColor,
      skyHorizonColor: this.skyHorizonColor,
    };
  }

  dispose() {
    this.scene.remove(this.sky);
    this.scene.remove(this.light);
    this.sky.geometry.dispose();
    this.sky.material.dispose();
  }
}
