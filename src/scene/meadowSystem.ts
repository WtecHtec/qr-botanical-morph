import * as THREE from 'three';
import { SeasonId } from './treeGenerator';

interface GrassData {
  x: number;
  z: number;
  yaw: number;
  tilt: number;
  scaleW: number;
  scaleH: number;
  colorSeed: number;
}

interface FlowerData {
  x: number;
  z: number;
  stemH: number;
  yaw: number;
  tiltX: number;
  tiltZ: number;
  blossomScale: number;
  colorSeed: number;
}

const SEASON_GRASS_COLORS: Record<SeasonId, number[]> = {
  spring: [0x589848, 0x6cb057, 0x82c468, 0x4b8742],
  summer: [0x3b743a, 0x4b8946, 0x5d9b53, 0x326532],
  autumn: [0x948644, 0xb0984d, 0x7c7843, 0xc2a352],
  winter: [0x75857f, 0x8fa09b, 0xaab9b5, 0x63736e],
};

const SEASON_FLOWER_COLORS: Record<SeasonId, number[]> = {
  spring: [0xf5b8c8, 0xfaf6ec, 0xf6db78, 0xd4c2f0],
  summer: [0xfbfaf4, 0x89bce8, 0xf4b642, 0xf39eb6],
  autumn: [0xc48cd9, 0xe8b241, 0xd87b3c, 0xf2e8d4],
  winter: [0xf2f6f8, 0xdde7ec, 0xe9f0f4],
};

const _mat4 = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _euler = new THREE.Euler();
const _scale = new THREE.Vector3();
const _color = new THREE.Color();

function deterministicRand(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function createGrassBladeGeometry(): THREE.BufferGeometry {
  // Tapered 3-segment curved grass blade pivoted at bottom (0, 0, 0)
  const positions = new Float32Array([
    -0.5, 0.0, 0.0,
     0.5, 0.0, 0.0,
    -0.4, 0.34, 0.04,
     0.4, 0.34, 0.04,
    -0.22, 0.7, 0.14,
     0.22, 0.7, 0.14,
     0.0, 1.0, 0.3,
  ]);
  const uvs = new Float32Array([
    0, 0, 1, 0,
    0, 0.35, 1, 0.35,
    0, 0.7, 1, 0.7,
    0.5, 1.0,
  ]);
  const indices = [
    0, 1, 2, 1, 3, 2,
    2, 3, 4, 3, 5, 4,
    4, 5, 6,
  ];
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

function createFlowerBlossomGeometry(): THREE.BufferGeometry {
  // Delicate 5-petal radial wildflower cup
  const shape = new THREE.Shape();
  const petals = 5;
  const steps = 60;
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const petalWave = Math.pow(Math.abs(Math.sin(t * petals * 0.5)), 0.65);
    const r = 0.28 + 0.72 * petalWave;
    const x = Math.cos(t) * r;
    const y = Math.sin(t) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();

  const geom = new THREE.ShapeGeometry(shape, 4);
  geom.rotateX(-Math.PI / 2);

  // Gently cup outer petals upward for 3D depth
  const pos = geom.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const dist = Math.hypot(x, z);
    pos.setY(i, dist * dist * 0.25);
  }
  pos.needsUpdate = true;
  geom.computeVertexNormals();
  return geom;
}

export class MeadowSystem {
  public readonly group = new THREE.Group();

  private readonly grassData: GrassData[] = [];
  private readonly flowerData: FlowerData[] = [];
  private readonly grassMesh: THREE.InstancedMesh;
  private readonly stemMesh: THREE.InstancedMesh;
  private readonly petalMesh: THREE.InstancedMesh;
  private readonly centerMesh: THREE.InstancedMesh;
  private readonly disposables: Array<{ dispose: () => void }> = [];

  private readonly uTime = { value: 0 };
  private season: SeasonId = 'spring';

  constructor() {
    // 1. Grass Tufts (~780 blades arranged in organic clumps around the tree base)
    const grassCount = 780;
    const grassGeom = createGrassBladeGeometry();
    const grassMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.78,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });

    grassMat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.uTime;
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform float uTime;`
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          float bend = uv.y * uv.y;
          vec4 wp = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          float sway = sin(uTime * 1.9 + wp.x * 2.5 + wp.z * 2.1) * 0.14;
          transformed.x += sway * bend;
          transformed.z += cos(uTime * 1.6 + wp.z * 2.3) * 0.08 * bend;`
        );
    };

    this.grassMesh = new THREE.InstancedMesh(grassGeom, grassMat, grassCount);
    this.grassMesh.receiveShadow = true;
    this.grassMesh.frustumCulled = false;
    this.group.add(this.grassMesh);
    this.disposables.push(grassGeom, grassMat);

    // Build 26 clump centers around the roots & under-tree shade
    const clumps: Array<{ x: number; z: number; r: number }> = [];
    for (let c = 0; c < 26; c++) {
      const ang = (c / 26) * Math.PI * 2 + deterministicRand(c * 7) * 0.4;
      const dist = c < 10 ? 0.35 + deterministicRand(c * 11) * 0.45 : 0.78 + deterministicRand(c * 13) * 1.15;
      clumps.push({
        x: Math.cos(ang) * dist,
        z: Math.sin(ang) * dist,
        r: 0.14 + deterministicRand(c * 17) * 0.22,
      });
    }

    for (let i = 0; i < grassCount; i++) {
      const clump = clumps[i % clumps.length];
      const a = deterministicRand(i * 5 + 1) * Math.PI * 2;
      const d = Math.pow(deterministicRand(i * 5 + 2), 0.7) * clump.r;
      this.grassData.push({
        x: clump.x + Math.cos(a) * d,
        z: clump.z + Math.sin(a) * d,
        yaw: deterministicRand(i * 5 + 3) * Math.PI * 2,
        tilt: 0.1 + deterministicRand(i * 5 + 4) * 0.38,
        scaleW: 0.016 + deterministicRand(i * 5 + 5) * 0.014,
        scaleH: 0.09 + deterministicRand(i * 5 + 6) * 0.15,
        colorSeed: deterministicRand(i * 5 + 7),
      });
    }

    // 2. Wildflowers (~64 blossoms clustered among the grass tufts)
    const flowerCount = 64;
    const stemGeom = new THREE.CylinderGeometry(0.004, 0.0055, 1.0, 5);
    stemGeom.translate(0, 0.5, 0);
    const stemMat = new THREE.MeshStandardMaterial({ color: 0x4d7e42, roughness: 0.8 });

    const petalGeom = createFlowerBlossomGeometry();
    const petalMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.62,
      metalness: 0.02,
      side: THREE.DoubleSide,
    });

    const centerGeom = new THREE.SphereGeometry(0.24, 8, 6);
    const centerMat = new THREE.MeshStandardMaterial({ color: 0xf4c44e, roughness: 0.55 });

    this.stemMesh = new THREE.InstancedMesh(stemGeom, stemMat, flowerCount);
    this.petalMesh = new THREE.InstancedMesh(petalGeom, petalMat, flowerCount);
    this.centerMesh = new THREE.InstancedMesh(centerGeom, centerMat, flowerCount);

    this.stemMesh.frustumCulled = false;
    this.petalMesh.frustumCulled = false;
    this.centerMesh.frustumCulled = false;

    this.group.add(this.stemMesh, this.petalMesh, this.centerMesh);
    this.disposables.push(stemGeom, stemMat, petalGeom, petalMat, centerGeom, centerMat);

    for (let i = 0; i < flowerCount; i++) {
      const clump = clumps[(i * 3) % clumps.length];
      const a = deterministicRand(i * 9 + 1) * Math.PI * 2;
      const d = deterministicRand(i * 9 + 2) * clump.r * 0.9;
      this.flowerData.push({
        x: clump.x + Math.cos(a) * d,
        z: clump.z + Math.sin(a) * d,
        stemH: 0.1 + deterministicRand(i * 9 + 3) * 0.14,
        yaw: deterministicRand(i * 9 + 4) * Math.PI * 2,
        tiltX: (deterministicRand(i * 9 + 5) - 0.5) * 0.28,
        tiltZ: (deterministicRand(i * 9 + 6) - 0.5) * 0.28,
        blossomScale: 0.036 + deterministicRand(i * 9 + 7) * 0.026,
        colorSeed: deterministicRand(i * 9 + 8),
      });
    }

    this.applySeasonColors();
    this.update(0, 0);
  }

  public setSeason(season: SeasonId): void {
    if (this.season === season) return;
    this.season = season;
    this.applySeasonColors();
  }

  private applySeasonColors(): void {
    const grassPal = SEASON_GRASS_COLORS[this.season];
    for (let i = 0; i < this.grassData.length; i++) {
      const idx = Math.min(grassPal.length - 1, Math.floor(this.grassData[i].colorSeed * grassPal.length));
      _color.setHex(grassPal[idx]);
      this.grassMesh.setColorAt(i, _color);
    }
    if (this.grassMesh.instanceColor) this.grassMesh.instanceColor.needsUpdate = true;

    const flowerPal = SEASON_FLOWER_COLORS[this.season];
    for (let i = 0; i < this.flowerData.length; i++) {
      const idx = Math.min(flowerPal.length - 1, Math.floor(this.flowerData[i].colorSeed * flowerPal.length));
      _color.setHex(flowerPal[idx]);
      this.petalMesh.setColorAt(i, _color);
    }
    if (this.petalMesh.instanceColor) this.petalMesh.instanceColor.needsUpdate = true;
  }

  public update(morphProgress: number, elapsed: number): void {
    this.uTime.value = elapsed;

    // Retract meadow smoothly into the floor when returning to 2D QR mode
    const grow = THREE.MathUtils.smoothstep(morphProgress, 0.28, 0.88);
    this.group.visible = grow > 0.01;
    if (!this.group.visible) return;

    const winterFlowerMult = this.season === 'winter' ? 0.45 : 1.0;

    for (let i = 0; i < this.grassData.length; i++) {
      const g = this.grassData[i];
      _pos.set(g.x, 0.0, g.z);
      _euler.set(g.tilt, g.yaw, 0);
      _quat.setFromEuler(_euler);
      _scale.set(g.scaleW, g.scaleH * grow, g.scaleW);
      _mat4.compose(_pos, _quat, _scale);
      this.grassMesh.setMatrixAt(i, _mat4);
    }
    this.grassMesh.instanceMatrix.needsUpdate = true;

    const fGrow = grow * winterFlowerMult;
    for (let i = 0; i < this.flowerData.length; i++) {
      const f = this.flowerData[i];
      const swayX = Math.sin(elapsed * 1.7 + f.x * 3.0) * 0.08;
      const swayZ = Math.cos(elapsed * 1.5 + f.z * 3.0) * 0.08;

      const h = f.stemH * fGrow;
      _pos.set(f.x, 0.0, f.z);
      _euler.set(f.tiltX + swayX, f.yaw, f.tiltZ + swayZ);
      _quat.setFromEuler(_euler);
      _scale.set(fGrow, h, fGrow);
      _mat4.compose(_pos, _quat, _scale);
      this.stemMesh.setMatrixAt(i, _mat4);

      // Blossom sits at tip of tilted stem
      const tipX = f.x + Math.sin(f.tiltZ + swayZ) * -h;
      const tipZ = f.z + Math.sin(f.tiltX + swayX) * h;
      const tipY = Math.cos(f.tiltX + swayX) * Math.cos(f.tiltZ + swayZ) * h;

      _pos.set(tipX, tipY, tipZ);
      _scale.setScalar(f.blossomScale * fGrow);
      _mat4.compose(_pos, _quat, _scale);
      this.petalMesh.setMatrixAt(i, _mat4);
      this.centerMesh.setMatrixAt(i, _mat4);
    }

    this.stemMesh.instanceMatrix.needsUpdate = true;
    this.petalMesh.instanceMatrix.needsUpdate = true;
    this.centerMesh.instanceMatrix.needsUpdate = true;
  }

  public dispose(): void {
    this.disposables.forEach((d) => d.dispose());
  }
}
