import { Group, Mesh, PlaneGeometry } from 'three';

const clampSegments = (value, minimum = 2, maximum = 512) => Math.min(maximum, Math.max(minimum, Math.round(value)));

const createPatch = ({ width, height, segX, segY, offsetX, offsetZ, levelIndex, material }) => {
  const geometry = new PlaneGeometry(width, height, clampSegments(segX), clampSegments(segY));
  geometry.rotateX(-Math.PI / 2);

  const mesh = new Mesh(geometry, material);
  // Slightly sink coarser rings so overlap zones cannot z-fight with inner rings.
  mesh.position.set(offsetX, -levelIndex * 0.0045, offsetZ);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1000 - levelIndex;

  return mesh;
};

export class OceanLODGrid {
  constructor({ material, levels, baseCellSize = 1.0, ringOverlap = 0.5 }) {
    this.group = new Group();
    this.group.name = 'OceanLODGrid';

    this.material = material;
    this.levels = levels;
    this.baseCellSize = baseCellSize;
    this.ringOverlap = ringOverlap;
    this.snapSize = baseCellSize;

    this.meshes = [];
    this.#build();
  }

  #addMesh(mesh) {
    this.meshes.push(mesh);
    this.group.add(mesh);
  }

  #build() {
    if (!Array.isArray(this.levels) || this.levels.length < 2) {
      throw new Error('Ocean LOD requires at least 2 level sizes.');
    }

    const centerSize = this.levels[0];
    const centerSegments = centerSize / this.baseCellSize;

    this.#addMesh(
      createPatch({
        width: centerSize,
        height: centerSize,
        segX: centerSegments,
        segY: centerSegments,
        offsetX: 0,
        offsetZ: 0,
        levelIndex: 0,
        material: this.material,
      })
    );

    for (let i = 1; i < this.levels.length; i += 1) {
      const inner = this.levels[i - 1];
      const outer = this.levels[i];
      const ringWidth = (outer - inner) * 0.5;
      const cellSize = this.baseCellSize * 2 ** i;
      const overlap = Math.min(ringWidth * 0.25, this.ringOverlap * cellSize);

      const longSegments = outer / cellSize;
      const shortSegments = (ringWidth + overlap * 2.0) / cellSize;
      const innerSegments = inner / cellSize;

      const stripHeight = ringWidth + overlap * 2.0;
      const stripWidth = outer + overlap * 2.0;
      const innerStrip = inner + overlap * 2.0;
      const distanceFromCenter = inner * 0.5 + ringWidth * 0.5;

      this.#addMesh(
        createPatch({
          width: stripWidth,
          height: stripHeight,
          segX: longSegments,
          segY: shortSegments,
          offsetX: 0,
          offsetZ: -distanceFromCenter,
          levelIndex: i,
          material: this.material,
        })
      );

      this.#addMesh(
        createPatch({
          width: stripWidth,
          height: stripHeight,
          segX: longSegments,
          segY: shortSegments,
          offsetX: 0,
          offsetZ: distanceFromCenter,
          levelIndex: i,
          material: this.material,
        })
      );

      this.#addMesh(
        createPatch({
          width: stripHeight,
          height: innerStrip,
          segX: shortSegments,
          segY: innerSegments,
          offsetX: -distanceFromCenter,
          offsetZ: 0,
          levelIndex: i,
          material: this.material,
        })
      );

      this.#addMesh(
        createPatch({
          width: stripHeight,
          height: innerStrip,
          segX: shortSegments,
          segY: innerSegments,
          offsetX: distanceFromCenter,
          offsetZ: 0,
          levelIndex: i,
          material: this.material,
        })
      );
    }
  }

  update(cameraPosition) {
    this.group.position.x = Math.floor(cameraPosition.x / this.snapSize) * this.snapSize;
    this.group.position.z = Math.floor(cameraPosition.z / this.snapSize) * this.snapSize;
  }

  setLodScale(scale) {
    const clamped = Math.max(0.5, Math.min(2.5, scale));
    this.group.scale.set(clamped, 1.0, clamped);
  }

  dispose() {
    this.meshes.forEach((mesh) => {
      mesh.geometry.dispose();
      this.group.remove(mesh);
    });

    this.meshes = [];
  }
}
