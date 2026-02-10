import { Matrix4, PerspectiveCamera, Plane, Vector3, Vector4, WebGLRenderTarget } from 'three';

const CLIP_BIAS = 0.003;

export class PlanarReflectionPass {
  constructor({ renderer, scene, camera, oceanRoot, resolutionScale = 0.8 }) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.oceanRoot = oceanRoot;

    this.resolutionScale = resolutionScale;

    this.textureMatrix = new Matrix4();
    this.reflectionTextureMatrix = new Matrix4().set(
      0.5,
      0.0,
      0.0,
      0.5,
      0.0,
      0.5,
      0.0,
      0.5,
      0.0,
      0.0,
      0.5,
      0.5,
      0.0,
      0.0,
      0.0,
      1.0
    );

    this.mirrorCamera = new PerspectiveCamera();

    this.mirrorPlane = new Plane();
    this.normal = new Vector3();
    this.mirrorWorldPosition = new Vector3();
    this.cameraWorldPosition = new Vector3();
    this.rotationMatrix = new Matrix4();
    this.lookAtPosition = new Vector3(0, 0, -1);
    this.clipPlane = new Vector4();

    this.view = new Vector3();
    this.target = new Vector3();
    this.q = new Vector4();

    const initialWidth = Math.max(1, Math.floor(window.innerWidth * resolutionScale));
    const initialHeight = Math.max(1, Math.floor(window.innerHeight * resolutionScale));

    this.renderTarget = new WebGLRenderTarget(initialWidth, initialHeight);
  }

  setResolutionScale(scale) {
    this.resolutionScale = Math.max(0.35, Math.min(1.25, scale));
    this.resize(window.innerWidth, window.innerHeight);
  }

  resize(width, height) {
    this.renderTarget.setSize(
      Math.max(1, Math.floor(width * this.resolutionScale)),
      Math.max(1, Math.floor(height * this.resolutionScale))
    );
  }

  getTexture() {
    return this.renderTarget.texture;
  }

  getTextureMatrix() {
    return this.textureMatrix;
  }

  update({ oceanUniforms }) {
    if (!this.oceanRoot || !this.oceanRoot.visible) {
      return;
    }

    this.mirrorWorldPosition.setFromMatrixPosition(this.oceanRoot.matrixWorld);
    this.cameraWorldPosition.setFromMatrixPosition(this.camera.matrixWorld);

    this.rotationMatrix.extractRotation(this.oceanRoot.matrixWorld);

    this.normal.set(0, 1, 0);
    this.normal.applyMatrix4(this.rotationMatrix).normalize();

    this.view.subVectors(this.mirrorWorldPosition, this.cameraWorldPosition);

    if (this.view.dot(this.normal) > 0) {
      return;
    }

    this.view.reflect(this.normal).negate();
    this.view.add(this.mirrorWorldPosition);

    this.rotationMatrix.extractRotation(this.camera.matrixWorld);

    this.lookAtPosition.set(0, 0, -1);
    this.lookAtPosition.applyMatrix4(this.rotationMatrix);
    this.lookAtPosition.add(this.cameraWorldPosition);

    this.target.subVectors(this.mirrorWorldPosition, this.lookAtPosition);
    this.target.reflect(this.normal).negate();
    this.target.add(this.mirrorWorldPosition);

    this.mirrorCamera.position.copy(this.view);
    this.mirrorCamera.up.set(0, 1, 0);
    this.mirrorCamera.up.applyMatrix4(this.rotationMatrix);
    this.mirrorCamera.up.reflect(this.normal);

    this.mirrorCamera.fov = this.camera.fov;
    this.mirrorCamera.aspect = this.camera.aspect;
    this.mirrorCamera.near = this.camera.near;
    this.mirrorCamera.far = this.camera.far;

    this.mirrorCamera.lookAt(this.target);
    this.mirrorCamera.updateMatrixWorld();
    this.mirrorCamera.projectionMatrix.copy(this.camera.projectionMatrix);

    this.textureMatrix.copy(this.reflectionTextureMatrix);
    this.textureMatrix.multiply(this.mirrorCamera.projectionMatrix);
    this.textureMatrix.multiply(this.mirrorCamera.matrixWorldInverse);

    this.mirrorPlane.setFromNormalAndCoplanarPoint(this.normal, this.mirrorWorldPosition);
    this.mirrorPlane.applyMatrix4(this.mirrorCamera.matrixWorldInverse);

    this.clipPlane.set(
      this.mirrorPlane.normal.x,
      this.mirrorPlane.normal.y,
      this.mirrorPlane.normal.z,
      this.mirrorPlane.constant
    );

    const projectionMatrix = this.mirrorCamera.projectionMatrix;

    this.q.x = (Math.sign(this.clipPlane.x) + projectionMatrix.elements[8]) / projectionMatrix.elements[0];
    this.q.y = (Math.sign(this.clipPlane.y) + projectionMatrix.elements[9]) / projectionMatrix.elements[5];
    this.q.z = -1.0;
    this.q.w = (1.0 + projectionMatrix.elements[10]) / projectionMatrix.elements[14];

    this.clipPlane.multiplyScalar(2.0 / this.clipPlane.dot(this.q));

    projectionMatrix.elements[2] = this.clipPlane.x;
    projectionMatrix.elements[6] = this.clipPlane.y;
    projectionMatrix.elements[10] = this.clipPlane.z + 1.0 - CLIP_BIAS;
    projectionMatrix.elements[14] = this.clipPlane.w;

    const currentRenderTarget = this.renderer.getRenderTarget();
    const currentXrEnabled = this.renderer.xr.enabled;
    const currentShadowAutoUpdate = this.renderer.shadowMap.autoUpdate;

    this.oceanRoot.visible = false;

    this.renderer.xr.enabled = false;
    this.renderer.shadowMap.autoUpdate = false;

    this.renderer.setRenderTarget(this.renderTarget);
    this.renderer.state.buffers.depth.setMask(true);

    if (this.renderer.autoClear === false) {
      this.renderer.clear();
    }

    this.renderer.render(this.scene, this.mirrorCamera);

    this.oceanRoot.visible = true;
    this.renderer.xr.enabled = currentXrEnabled;
    this.renderer.shadowMap.autoUpdate = currentShadowAutoUpdate;
    this.renderer.setRenderTarget(currentRenderTarget);

    if (oceanUniforms) {
      oceanUniforms.uReflectionMap.value = this.renderTarget.texture;
      oceanUniforms.uReflectionMatrix.value.copy(this.textureMatrix);
    }

    const viewport = this.camera.viewport;

    if (viewport !== undefined) {
      this.renderer.state.viewport(viewport);
    }
  }

  dispose() {
    this.renderTarget.dispose();
  }
}
