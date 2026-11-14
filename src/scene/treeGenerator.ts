import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export type SeasonId = 'spring' | 'summer' | 'autumn' | 'winter';
export type TreeSpeciesId = 'evergreen' | 'peach' | 'maple' | 'plum';

export interface TwigAnchor {
  pos: THREE.Vector3;
  dir: THREE.Vector3;
  radius: number;
  weight: number;
}

export interface ProceduralTreeRig {
  group: THREE.Group;
  woodMesh: THREE.Mesh;
  twigAnchors: TwigAnchor[];
  rootAnchors: THREE.Vector3[];
  perchPoints: THREE.Vector3[];
  setGrowth: (growth: number) => void;
  setSeason: (season: SeasonId) => void;
  dispose: () => void;
}

interface BranchSpec {
  points: THREE.Vector3[];
  rStart: number;
  rEnd: number;
  tubularSegments: number;
  radialSegments: number;
  growStart: number;
  growEnd: number;
  ridgeAmp?: number;
}

interface SpeciesWoodProfile {
  barkBase: string;
  barkDark: string;
  barkHighlight: string;
  barkMid: string;
  lenticelColor: string;
  lenticelCount: number;
  trunkRadius: number;
  trunkTopRadius: number;
  trunkHeight: number;
  ridgeAmp: number;
  bumpScale: number;
  roughness: number;
  winterTint: number;
  autumnTint: number;
  defaultTint: number;
}

const SPECIES_WOOD_PROFILES: Record<TreeSpeciesId, SpeciesWoodProfile> = {
  evergreen: {
    barkBase: '#3d3026',
    barkDark: 'rgba(22, 16, 12, ',
    barkHighlight: 'rgba(116, 102, 86, ',
    barkMid: 'rgba(74, 58, 46, ',
    lenticelColor: 'rgba(26, 18, 15, 0.24)',
    lenticelCount: 280,
    trunkRadius: 0.21,
    trunkTopRadius: 0.052,
    trunkHeight: 3.15,
    ridgeAmp: 0.065,
    bumpScale: 0.034,
    roughness: 0.88,
    winterTint: 0xd4dce0,
    autumnTint: 0xf2e4d5,
    defaultTint: 0xffffff,
  },
  peach: {
    // Rich warm chestnut-mahogany bark with prominent horizontal lenticels
    barkBase: '#5d372b',
    barkDark: 'rgba(42, 20, 14, ',
    barkHighlight: 'rgba(166, 112, 86, ',
    barkMid: 'rgba(118, 68, 52, ',
    lenticelColor: 'rgba(34, 15, 11, 0.45)',
    lenticelCount: 820,
    trunkRadius: 0.175,
    trunkTopRadius: 0.044,
    trunkHeight: 2.38,
    ridgeAmp: 0.045,
    bumpScale: 0.026,
    roughness: 0.72,
    winterTint: 0xdcd6d8,
    autumnTint: 0xf5e2d2,
    defaultTint: 0xffffff,
  },
  maple: {
    // Smooth ash-silver / taupe grey maple bark
    barkBase: '#6f675e',
    barkDark: 'rgba(46, 42, 38, ',
    barkHighlight: 'rgba(176, 170, 160, ',
    barkMid: 'rgba(128, 118, 108, ',
    lenticelColor: 'rgba(54, 48, 43, 0.22)',
    lenticelCount: 220,
    trunkRadius: 0.175,
    trunkTopRadius: 0.042,
    trunkHeight: 3.32,
    ridgeAmp: 0.032,
    bumpScale: 0.022,
    roughness: 0.76,
    winterTint: 0xdbe2e7,
    autumnTint: 0xf3e8dc,
    defaultTint: 0xffffff,
  },
  plum: {
    // Rich ink-ebony gnarled ancient plum bark with subtle jade-silver lichen highlights
    barkBase: '#241b1b',
    barkDark: 'rgba(10, 7, 8, ',
    barkHighlight: 'rgba(138, 144, 124, ',
    barkMid: 'rgba(58, 44, 44, ',
    lenticelColor: 'rgba(14, 10, 10, 0.48)',
    lenticelCount: 420,
    trunkRadius: 0.185,
    trunkTopRadius: 0.03,
    trunkHeight: 2.95,
    ridgeAmp: 0.085,
    bumpScale: 0.048,
    roughness: 0.86,
    winterTint: 0xe6dfe4,
    autumnTint: 0xeedfd6,
    defaultTint: 0xfaf5f4,
  },
};

function createDetailedBarkTextures(
  profile: SpeciesWoodProfile,
  species: TreeSpeciesId,
  maxAnisotropy: number
): {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
} {
  const width = 512;
  const height = 1024;

  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = width;
  colorCanvas.height = height;
  const cCtx = colorCanvas.getContext('2d')!;

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = width;
  bumpCanvas.height = height;
  const bCtx = bumpCanvas.getContext('2d')!;

  cCtx.fillStyle = profile.barkBase;
  cCtx.fillRect(0, 0, width, height);

  bCtx.fillStyle = '#7a7a7a';
  bCtx.fillRect(0, 0, width, height);

  const streakCount = species === 'plum' ? 2800 : 2100;
  for (let i = 0; i < streakCount; i++) {
    const s1 = Math.sin(i * 12.9898) * 43758.5453;
    const s2 = Math.sin(i * 78.233) * 43758.5453;
    const s3 = Math.sin(i * 39.425) * 43758.5453;
    const rx = s1 - Math.floor(s1);
    const ry = s2 - Math.floor(s2);
    const rz = s3 - Math.floor(s3);

    const x = rx * width;
    const y = ry * height;
    const len = species === 'peach' ? 18 + rz * 64 : 32 + rz * 135;
    const w = species === 'plum' ? 1.4 + (i % 8) * 0.8 : 1.0 + (i % 6) * 0.55;

    if (i % 5 === 0) {
      cCtx.fillStyle = `${profile.barkDark}${0.35 + rz * 0.28})`;
      bCtx.fillStyle = `rgba(20, 20, 20, ${0.42 + rz * 0.28})`;
    } else if (i % 7 === 0) {
      cCtx.fillStyle = `${profile.barkHighlight}${0.18 + rz * 0.14})`;
      bCtx.fillStyle = `rgba(218, 218, 218, ${0.26 + rz * 0.18})`;
    } else {
      cCtx.fillStyle = `${profile.barkMid}${0.22 + rz * 0.16})`;
      bCtx.fillStyle = `rgba(162, 162, 162, ${0.2 + rz * 0.14})`;
    }

    cCtx.fillRect(x, y, w, len);
    bCtx.fillRect(x, y, w, len);
  }

  // Horizontal lenticels (dense & distinct on peach cherry/plum bark)
  for (let i = 0; i < profile.lenticelCount; i++) {
    const s1 = Math.sin(i * 91.13 + 3.1) * 43758.5453;
    const s2 = Math.sin(i * 47.77 + 7.4) * 43758.5453;
    const s3 = Math.sin(i * 19.31) * 43758.5453;
    const x = (s1 - Math.floor(s1)) * width;
    const y = (s2 - Math.floor(s2)) * height;
    const lw = species === 'peach' ? 14 + (i % 26) : 8 + (i % 16);
    const lh = species === 'peach' ? 2.2 : 1.6;
    cCtx.fillStyle = profile.lenticelColor;
    cCtx.fillRect(x, y, lw, lh);

    if (species === 'peach' && i % 3 === 0) {
      cCtx.fillStyle = 'rgba(204, 146, 114, 0.24)';
      cCtx.fillRect(x + 1, y + lh, lw * 0.85, 1.1);
    }
    bCtx.fillStyle = `rgba(42, 42, 42, ${0.25 + (s3 - Math.floor(s3)) * 0.2})`;
    bCtx.fillRect(x, y, lw, lh);
  }

  // Subtle lichen patches on plum & maple bark
  if (species === 'plum' || species === 'maple') {
    for (let i = 0; i < 65; i++) {
      const s1 = Math.sin(i * 67.3) * 43758.5453;
      const s2 = Math.sin(i * 23.7) * 43758.5453;
      const x = (s1 - Math.floor(s1)) * width;
      const y = (s2 - Math.floor(s2)) * height;
      const rad = 5 + (i % 12);
      cCtx.fillStyle =
        species === 'plum' ? 'rgba(132, 138, 114, 0.16)' : 'rgba(196, 194, 184, 0.14)';
      cCtx.beginPath();
      cCtx.arc(x, y, rad, 0, Math.PI * 2);
      cCtx.fill();
    }
  }

  const map = new THREE.CanvasTexture(colorCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(2, 4);
  map.anisotropy = maxAnisotropy;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(2, 4);
  bumpMap.anisotropy = maxAnisotropy;

  return { map, bumpMap };
}

function buildGrowthBranchGeometry(spec: BranchSpec): THREE.BufferGeometry {
  const {
    points,
    rStart,
    rEnd,
    tubularSegments,
    radialSegments,
    growStart,
    growEnd,
    ridgeAmp = 0.065,
  } = spec;
  const curve = new THREE.CatmullRomCurve3(points);
  const geom = new THREE.TubeGeometry(curve, tubularSegments, 1.0, radialSegments, false);

  const posAttr = geom.attributes.position;
  const vertCount = posAttr.count;
  const growOrder = new Float32Array(vertCount);
  const spineCenterAttr = new Float32Array(vertCount * 3);

  const center = new THREE.Vector3();
  const vert = new THREE.Vector3();

  for (let i = 0; i <= tubularSegments; i++) {
    const u = i / tubularSegments;
    curve.getPointAt(u, center);

    const isRooted = growStart < 0.02 && points[0].y <= 0.05;
    const flare = isRooted && u < 0.18 ? Math.pow((0.18 - u) / 0.18, 2) * 0.36 : 0;
    const radius = THREE.MathUtils.lerp(rStart, rEnd, Math.pow(u, 0.78)) * (1 + flare);
    const gOrder = THREE.MathUtils.lerp(growStart, growEnd, u);

    for (let j = 0; j <= radialSegments; j++) {
      const idx = i * (radialSegments + 1) + j;
      vert.fromBufferAttribute(posAttr, idx);
      const angle = (j / radialSegments) * Math.PI * 2;
      const ridge = 1 + ridgeAmp * Math.sin(angle * 5 + u * 12);

      vert.sub(center).multiplyScalar(radius * ridge).add(center);
      posAttr.setXYZ(idx, vert.x, vert.y, vert.z);

      growOrder[idx] = gOrder;
      spineCenterAttr[idx * 3] = center.x;
      spineCenterAttr[idx * 3 + 1] = center.y;
      spineCenterAttr[idx * 3 + 2] = center.z;
    }
  }

  posAttr.needsUpdate = true;
  geom.setAttribute('aGrowOrder', new THREE.BufferAttribute(growOrder, 1));
  geom.setAttribute('aSpineCenter', new THREE.BufferAttribute(spineCenterAttr, 3));
  geom.computeVertexNormals();
  return geom;
}

function deterministicRand(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function buildTrunkPoints(species: TreeSpeciesId, h: number): THREE.Vector3[] {
  if (species === 'peach') {
    // Low, warmly sweeping orchard peach trunk curving gracefully toward one side before forking
    return [
      new THREE.Vector3(0, -0.01, 0),
      new THREE.Vector3(0.06, h * 0.22, 0.02),
      new THREE.Vector3(0.16, h * 0.48, 0.07),
      new THREE.Vector3(0.11, h * 0.74, 0.09),
      new THREE.Vector3(0.02, h, 0.04),
    ];
  }
  if (species === 'maple') {
    // Tall slender sinuous Japanese maple main stem
    return [
      new THREE.Vector3(0, -0.01, 0),
      new THREE.Vector3(-0.04, h * 0.2, 0.03),
      new THREE.Vector3(-0.1, h * 0.44, 0.05),
      new THREE.Vector3(-0.05, h * 0.68, -0.02),
      new THREE.Vector3(0.03, h * 0.86, -0.04),
      new THREE.Vector3(0.06, h, 0.0),
    ];
  }
  if (species === 'plum') {
    // Flowing S-curve literati dragon-plum trunk (游龙卧干 · 疏影横斜)
    return [
      new THREE.Vector3(0, -0.01, 0),
      new THREE.Vector3(-0.18, h * 0.18, 0.08),
      new THREE.Vector3(-0.34, h * 0.36, 0.14),
      new THREE.Vector3(-0.12, h * 0.56, 0.04),
      new THREE.Vector3(0.16, h * 0.76, -0.06),
      new THREE.Vector3(0.24, h * 0.91, -0.04),
      new THREE.Vector3(0.12, h, 0.02),
    ];
  }
  // Evergreen: upright classic strong trunk
  return [
    new THREE.Vector3(0, -0.01, 0),
    new THREE.Vector3(0.04, h * 0.18, 0.02),
    new THREE.Vector3(-0.03, h * 0.4, -0.02),
    new THREE.Vector3(0.05, h * 0.62, 0.03),
    new THREE.Vector3(-0.01, h * 0.82, -0.01),
    new THREE.Vector3(0.01, h, 0.01),
  ];
}

interface BoughPlan {
  trunkU: number;
  dirAzimuth: number;
  pitch: number;
  length: number;
  r0: number;
  growStart: number;
  droopEnd?: number;
  elbowStrength?: number;
}

function getBoughPlans(species: TreeSpeciesId): BoughPlan[] {
  if (species === 'peach') {
    // Open vase-shaped ("开心形") wide-arching primary peach limbs + slender flowering canopy arches
    return [
      { trunkU: 0.46, dirAzimuth: -Math.PI * 0.78, pitch: 0.34, length: 1.88, r0: 0.088, growStart: 0.25, droopEnd: -0.14 },
      { trunkU: 0.5, dirAzimuth: -Math.PI * 0.24, pitch: 0.36, length: 1.86, r0: 0.086, growStart: 0.27, droopEnd: -0.12 },
      { trunkU: 0.54, dirAzimuth: Math.PI * 0.74, pitch: 0.35, length: 1.84, r0: 0.084, growStart: 0.29, droopEnd: -0.13 },
      { trunkU: 0.58, dirAzimuth: Math.PI * 0.25, pitch: 0.38, length: 1.78, r0: 0.082, growStart: 0.32, droopEnd: -0.11 },
      { trunkU: 0.74, dirAzimuth: -Math.PI * 0.52, pitch: 0.54, length: 1.38, r0: 0.064, growStart: 0.38, droopEnd: -0.05 },
      { trunkU: 0.78, dirAzimuth: Math.PI * 0.48, pitch: 0.56, length: 1.34, r0: 0.062, growStart: 0.4, droopEnd: -0.05 },
      { trunkU: 0.92, dirAzimuth: 0.2, pitch: 0.72, length: 0.98, r0: 0.048, growStart: 0.46, droopEnd: -0.02 },
      { trunkU: 0.95, dirAzimuth: 3.35, pitch: 0.74, length: 0.94, r0: 0.046, growStart: 0.48, droopEnd: -0.02 },
    ];
  }
  if (species === 'maple') {
    // 3 distinct horizontal layered cloud-tier boughs
    return [
      // Tier 1 (lower broad horizontal shelves)
      { trunkU: 0.42, dirAzimuth: -Math.PI * 0.76, pitch: 0.18, length: 1.82, r0: 0.082, growStart: 0.25, droopEnd: -0.04 },
      { trunkU: 0.45, dirAzimuth: Math.PI * 0.22, pitch: 0.2, length: 1.78, r0: 0.08, growStart: 0.27, droopEnd: -0.04 },
      // Tier 2 (mid horizontal shelves)
      { trunkU: 0.62, dirAzimuth: -Math.PI * 0.22, pitch: 0.22, length: 1.66, r0: 0.072, growStart: 0.32, droopEnd: -0.02 },
      { trunkU: 0.65, dirAzimuth: Math.PI * 0.78, pitch: 0.22, length: 1.68, r0: 0.072, growStart: 0.34, droopEnd: -0.02 },
      { trunkU: 0.7, dirAzimuth: -Math.PI * 0.5, pitch: 0.32, length: 1.32, r0: 0.062, growStart: 0.37 },
      // Tier 3 (upper flat crown shelves)
      { trunkU: 0.82, dirAzimuth: Math.PI * 0.5, pitch: 0.3, length: 1.24, r0: 0.056, growStart: 0.42 },
      { trunkU: 0.92, dirAzimuth: -0.1, pitch: 0.44, length: 1.04, r0: 0.046, growStart: 0.46 },
      { trunkU: 0.95, dirAzimuth: 3.05, pitch: 0.46, length: 1.0, r0: 0.044, growStart: 0.48 },
    ];
  }
  if (species === 'plum') {
    // Sculptural asymmetric literati plum boughs: low horizontal sweeping arm + soaring right crown
    return [
      { trunkU: 0.36, dirAzimuth: -Math.PI * 0.86, pitch: 0.09, length: 2.12, r0: 0.086, growStart: 0.24, elbowStrength: 0.26, droopEnd: 0.18 },
      { trunkU: 0.52, dirAzimuth: Math.PI * 0.72, pitch: 0.28, length: 1.78, r0: 0.072, growStart: 0.3, elbowStrength: 0.28, droopEnd: 0.16 },
      { trunkU: 0.62, dirAzimuth: -Math.PI * 0.18, pitch: 0.44, length: 1.82, r0: 0.074, growStart: 0.34, elbowStrength: 0.24, droopEnd: 0.18 },
      { trunkU: 0.74, dirAzimuth: -Math.PI * 0.56, pitch: 0.68, length: 1.44, r0: 0.056, growStart: 0.4, elbowStrength: 0.22, droopEnd: 0.14 },
      { trunkU: 0.84, dirAzimuth: Math.PI * 0.42, pitch: 0.78, length: 1.32, r0: 0.05, growStart: 0.45, elbowStrength: 0.2, droopEnd: 0.12 },
      { trunkU: 0.94, dirAzimuth: 0.18, pitch: 0.96, length: 1.02, r0: 0.038, growStart: 0.5, elbowStrength: 0.18, droopEnd: 0.1 },
    ];
  }
  // Evergreen
  return [
    { trunkU: 0.46, dirAzimuth: -Math.PI * 0.75, pitch: 0.48, length: 1.66, r0: 0.096, growStart: 0.26 },
    { trunkU: 0.51, dirAzimuth: -Math.PI * 0.25, pitch: 0.48, length: 1.66, r0: 0.094, growStart: 0.28 },
    { trunkU: 0.55, dirAzimuth: Math.PI * 0.75, pitch: 0.5, length: 1.64, r0: 0.09, growStart: 0.3 },
    { trunkU: 0.6, dirAzimuth: Math.PI * 0.25, pitch: 0.52, length: 1.56, r0: 0.086, growStart: 0.34 },
    { trunkU: 0.72, dirAzimuth: -Math.PI * 0.5, pitch: 0.72, length: 1.24, r0: 0.072, growStart: 0.38 },
    { trunkU: 0.76, dirAzimuth: Math.PI * 0.5, pitch: 0.74, length: 1.2, r0: 0.07, growStart: 0.4 },
    { trunkU: 0.93, dirAzimuth: 0.15, pitch: 1.05, length: 0.92, r0: 0.052, growStart: 0.46 },
    { trunkU: 0.95, dirAzimuth: 3.3, pitch: 1.05, length: 0.88, r0: 0.05, growStart: 0.48 },
  ];
}

export function createProceduralTree(
  maxAnisotropy: number,
  species: TreeSpeciesId = 'evergreen'
): ProceduralTreeRig {
  const profile = SPECIES_WOOD_PROFILES[species];
  const group = new THREE.Group();
  const disposables: Array<{ dispose: () => void }> = [];

  const { map: barkMap, bumpMap: barkBump } = createDetailedBarkTextures(
    profile,
    species,
    maxAnisotropy
  );
  disposables.push(barkMap, barkBump);

  const uTreeGrowth = { value: 1.0 };

  const barkMat = new THREE.MeshStandardMaterial({
    color: profile.defaultTint,
    map: barkMap,
    bumpMap: barkBump,
    bumpScale: profile.bumpScale,
    roughness: profile.roughness,
    metalness: 0.03,
  });

  barkMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTreeGrowth = uTreeGrowth;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float aGrowOrder;
        attribute vec3 aSpineCenter;
        uniform float uTreeGrowth;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float growBand = 0.16;
        float gLocal = clamp((uTreeGrowth - (aGrowOrder * (1.0 - growBand))) / growBand, 0.0, 1.0);
        gLocal = gLocal * gLocal * (3.0 - 2.0 * gLocal);
        vec3 offsetFromSpine = transformed - aSpineCenter;
        vec3 grownSpine = vec3(
          aSpineCenter.x * mix(0.15, 1.0, gLocal),
          aSpineCenter.y * gLocal,
          aSpineCenter.z * mix(0.15, 1.0, gLocal)
        );
        transformed = grownSpine + offsetFromSpine * gLocal;`
      );
  };
  disposables.push(barkMat);

  const barkDepthMat = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
  });
  barkDepthMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTreeGrowth = uTreeGrowth;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float aGrowOrder;
        attribute vec3 aSpineCenter;
        uniform float uTreeGrowth;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float growBand = 0.16;
        float gLocal = clamp((uTreeGrowth - (aGrowOrder * (1.0 - growBand))) / growBand, 0.0, 1.0);
        gLocal = gLocal * gLocal * (3.0 - 2.0 * gLocal);
        vec3 offsetFromSpine = transformed - aSpineCenter;
        vec3 grownSpine = vec3(
          aSpineCenter.x * mix(0.15, 1.0, gLocal),
          aSpineCenter.y * gLocal,
          aSpineCenter.z * mix(0.15, 1.0, gLocal)
        );
        transformed = grownSpine + offsetFromSpine * gLocal;`
      );
  };
  disposables.push(barkDepthMat);

  const branchSpecs: BranchSpec[] = [];
  const twigAnchors: TwigAnchor[] = [];
  const rootAnchors: THREE.Vector3[] = [];
  const perchPoints: THREE.Vector3[] = [];

  // 1. Species-characteristic main trunk
  const h = profile.trunkHeight;
  const trunkPoints = buildTrunkPoints(species, h);
  const trunkCurve = new THREE.CatmullRomCurve3(trunkPoints);

  branchSpecs.push({
    points: trunkPoints,
    rStart: profile.trunkRadius,
    rEnd: profile.trunkTopRadius,
    tubularSegments: 36,
    radialSegments: 12,
    growStart: 0.0,
    growEnd: 0.55,
    ridgeAmp: profile.ridgeAmp,
  });

  // Twin graceful companion stem for Japanese Maple (丛生双干红枫)
  if (species === 'maple') {
    const compOrigin = trunkCurve.getPointAt(0.16);
    const compPts = [
      compOrigin,
      compOrigin.clone().add(new THREE.Vector3(0.32, 0.58, -0.18)),
      compOrigin.clone().add(new THREE.Vector3(0.56, 1.24, -0.32)),
      compOrigin.clone().add(new THREE.Vector3(0.68, 1.82, -0.26)),
    ];
    branchSpecs.push({
      points: compPts,
      rStart: 0.09,
      rEnd: 0.022,
      tubularSegments: 22,
      radialSegments: 8,
      growStart: 0.12,
      growEnd: 0.58,
      ridgeAmp: profile.ridgeAmp,
    });
  }

  // Slender flowering new shoot rising beside old plum trunk (老干发新枝)
  if (species === 'plum') {
    const sproutOrigin = trunkCurve.getPointAt(0.24);
    const sproutPts = [
      sproutOrigin,
      sproutOrigin.clone().add(new THREE.Vector3(0.26, 0.46, -0.08)),
      sproutOrigin.clone().add(new THREE.Vector3(0.62, 1.04, -0.14)),
      sproutOrigin.clone().add(new THREE.Vector3(0.96, 1.62, -0.06)),
    ];
    branchSpecs.push({
      points: sproutPts,
      rStart: 0.058,
      rEnd: 0.012,
      tubularSegments: 20,
      radialSegments: 7,
      growStart: 0.18,
      growEnd: 0.64,
      ridgeAmp: profile.ridgeAmp * 0.65,
    });
  }

  // 2. Five flared surface roots
  for (let r = 0; r < 5; r++) {
    const angle = (r / 5) * Math.PI * 2 + 0.35;
    const len = species === 'plum' ? 0.52 + (r % 2) * 0.14 : 0.4 + (r % 2) * 0.1;
    const midX = Math.cos(angle) * len * 0.45;
    const midZ = Math.sin(angle) * len * 0.45;
    const endX = Math.cos(angle + (species === 'plum' ? 0.24 : 0.12)) * len;
    const endZ = Math.sin(angle + (species === 'plum' ? 0.24 : 0.12)) * len;
    branchSpecs.push({
      points: [
        new THREE.Vector3(Math.cos(angle) * 0.04, 0.26, Math.sin(angle) * 0.04),
        new THREE.Vector3(midX, 0.09, midZ),
        new THREE.Vector3(endX, 0.0, endZ),
      ],
      rStart: profile.trunkRadius * 0.38,
      rEnd: 0.014,
      tubularSegments: 14,
      radialSegments: 8,
      growStart: 0.04,
      growEnd: 0.28,
      ridgeAmp: profile.ridgeAmp,
    });
    rootAnchors.push(new THREE.Vector3(endX * 0.78, 0.04, endZ * 0.78));
  }

  // 3. Species-specific primary boughs, secondary branches & flowering/foliage twigs
  const boughPlans = getBoughPlans(species);
  let seed = species === 'peach' ? 41 : species === 'maple' ? 83 : species === 'plum' ? 127 : 10;

  boughPlans.forEach((b, bIdx) => {
    seed += 7;
    const pitch = THREE.MathUtils.clamp(b.pitch, 0.12, 1.22);
    const dx = Math.cos(b.dirAzimuth) * Math.cos(pitch);
    const dy = Math.sin(pitch);
    const dz = Math.sin(b.dirAzimuth) * Math.cos(pitch);
    const dir = new THREE.Vector3(dx, dy, dz).normalize();

    const p0 = trunkCurve.getPointAt(b.trunkU);
    const elbow = b.elbowStrength ?? (species === 'peach' ? 0.1 : 0.06);
    const eSign = bIdx % 2 === 0 ? 1 : -1;

    const p1 = p0
      .clone()
      .addScaledVector(dir, b.length * 0.36)
      .add(new THREE.Vector3(eSign * elbow * 0.55, species === 'peach' ? 0.14 : 0.06, -eSign * elbow * 0.4));

    const p2 = p0
      .clone()
      .addScaledVector(dir, b.length * 0.7)
      .add(
        new THREE.Vector3(
          -eSign * elbow * 0.65 + (deterministicRand(seed + 1) - 0.5) * 0.14,
          species === 'plum' ? -0.06 * eSign : species === 'peach' ? 0.1 : 0.06,
          eSign * elbow * 0.55 + (deterministicRand(seed + 2) - 0.5) * 0.14
        )
      );

    const p3 = p0
      .clone()
      .addScaledVector(dir, b.length)
      .add(new THREE.Vector3(0, b.droopEnd ?? (species === 'plum' ? 0.14 : 0.1), 0));

    const boughGrowEnd = Math.min(0.76, b.growStart + 0.34);

    branchSpecs.push({
      points: [p0, p1, p2, p3],
      rStart: b.r0,
      rEnd: species === 'plum' ? 0.015 : 0.018,
      tubularSegments: 22,
      radialSegments: 8,
      growStart: b.growStart,
      growEnd: boughGrowEnd,
      ridgeAmp: profile.ridgeAmp,
    });

    const boughCurve = new THREE.CatmullRomCurve3([p0, p1, p2, p3]);
    if (bIdx < 3) {
      perchPoints.push(boughCurve.getPointAt(0.58));
    }

    const secCount = species === 'plum' ? 4 : 3;
    for (let s = 0; s < secCount; s++) {
      seed += 13;
      const uAttach = species === 'plum' ? 0.28 + s * 0.22 : 0.4 + s * 0.25;
      const attachPt = boughCurve.getPointAt(Math.min(0.95, uAttach));
      const tangent = boughCurve.getTangentAt(Math.min(0.95, uAttach)).normalize();

      const sideSign = s % 2 === 0 ? 1 : -1;
      const angleSpread =
        species === 'plum'
          ? 0.72 + deterministicRand(seed) * 0.38
          : species === 'maple'
          ? 0.58 + deterministicRand(seed) * 0.26
          : 0.45 + deterministicRand(seed) * 0.32;
      const sideAz = b.dirAzimuth + sideSign * angleSpread;

      const secPitch =
        species === 'maple'
          ? THREE.MathUtils.clamp(pitch * 0.5 + (deterministicRand(seed + 1) - 0.3) * 0.2, -0.05, 0.36)
          : species === 'peach'
          ? THREE.MathUtils.clamp(pitch + 0.08 + deterministicRand(seed + 1) * 0.2, 0.12, 0.92)
          : Math.min(1.22, pitch + 0.18 + deterministicRand(seed + 1) * 0.32);

      const secDir = new THREE.Vector3(
        Math.cos(sideAz) * Math.cos(secPitch),
        Math.sin(secPitch),
        Math.sin(sideAz) * Math.cos(secPitch)
      )
        .lerp(tangent, species === 'plum' ? 0.1 : 0.24)
        .normalize();

      const secLen =
        species === 'peach'
          ? 0.62 + deterministicRand(seed + 2) * 0.34
          : species === 'plum'
          ? 0.38 + deterministicRand(seed + 2) * 0.32
          : 0.48 + deterministicRand(seed + 2) * 0.3;

      const midLift = species === 'plum' ? -0.06 * sideSign : species === 'peach' ? 0.07 : 0.03;
      const endDrop = species === 'peach' ? -0.05 : species === 'maple' ? -0.02 : 0.1;

      const sp1 = attachPt
        .clone()
        .addScaledVector(secDir, secLen * 0.48)
        .add(
          new THREE.Vector3(
            species === 'plum' ? sideSign * 0.12 : 0,
            midLift,
            species === 'plum' ? -sideSign * 0.1 : 0
          )
        );
      const sp2 = attachPt
        .clone()
        .addScaledVector(secDir, secLen)
        .add(new THREE.Vector3(0, endDrop, 0));

      const secGrowStart = THREE.MathUtils.lerp(b.growStart, boughGrowEnd, uAttach);
      const secGrowEnd = Math.min(0.9, secGrowStart + 0.24);

      branchSpecs.push({
        points: [attachPt, sp1, sp2],
        rStart: THREE.MathUtils.lerp(b.r0, 0.018, uAttach) * 0.72,
        rEnd: species === 'plum' ? 0.008 : 0.007,
        tubularSegments: 12,
        radialSegments: 6,
        growStart: secGrowStart,
        growEnd: secGrowEnd,
        ridgeAmp: profile.ridgeAmp,
      });

      const secCurve = new THREE.CatmullRomCurve3([attachPt, sp1, sp2]);

      const twigCount = species === 'plum' ? 3 : s === secCount - 1 ? 3 : 2;
      for (let twIdx = 0; twIdx < twigCount; twIdx++) {
        seed += 19;
        const twU = 0.36 + (twIdx / twigCount) * 0.56;
        const twStart = secCurve.getPointAt(Math.min(0.96, twU));
        const twSide = (twIdx + bIdx) % 2 === 0 ? 1 : -1;
        const twAz =
          sideAz +
          twSide * (species === 'plum' ? 0.65 + deterministicRand(seed) * 0.5 : 0.35 + deterministicRand(seed) * 0.4);
        const twPitch =
          species === 'maple'
            ? THREE.MathUtils.clamp(secPitch + (deterministicRand(seed + 3) - 0.5) * 0.22, -0.08, 0.35)
            : species === 'plum'
            ? Math.min(1.28, secPitch + 0.22 + deterministicRand(seed + 3) * 0.45)
            : Math.min(1.18, secPitch + (deterministicRand(seed + 3) - 0.35) * 0.3);

        const twDir = new THREE.Vector3(
          Math.cos(twAz) * Math.cos(twPitch),
          Math.sin(twPitch),
          Math.sin(twAz) * Math.cos(twPitch)
        ).normalize();

        // Peach has long whippy flowering shoots; Plum has graceful upright/sweeping flowering spurs (梅枝)
        const twLen =
          species === 'peach'
            ? 0.34 + deterministicRand(seed + 4) * 0.26
            : species === 'plum'
            ? 0.26 + deterministicRand(seed + 4) * 0.22
            : 0.24 + deterministicRand(seed + 4) * 0.2;

        const twMid = twStart
          .clone()
          .addScaledVector(twDir, twLen * 0.52)
          .add(new THREE.Vector3(0, species === 'peach' ? 0.03 : 0.02, 0));
        const twEnd = twStart
          .clone()
          .addScaledVector(twDir, twLen)
          .add(new THREE.Vector3(0, species === 'peach' ? -0.05 : species === 'maple' ? -0.02 : 0.05, 0));

        const twGrowStart = THREE.MathUtils.lerp(secGrowStart, secGrowEnd, twU);
        const twGrowEnd = Math.min(1.0, twGrowStart + 0.18);

        branchSpecs.push({
          points: [twStart, twMid, twEnd],
          rStart: species === 'plum' ? 0.0085 : 0.0095,
          rEnd: 0.0035,
          tubularSegments: 8,
          radialSegments: 5,
          growStart: twGrowStart,
          growEnd: twGrowEnd,
        });

        twigAnchors.push({ pos: twMid, dir: twDir.clone(), radius: 0.3, weight: 0.85 });
        twigAnchors.push({ pos: twEnd, dir: twDir.clone(), radius: 0.38, weight: 1.2 });
      }
    }

    twigAnchors.push({ pos: p3, dir, radius: 0.4, weight: 1.1 });
  });

  const partGeometries = branchSpecs.map((spec) => buildGrowthBranchGeometry(spec));
  const mergedWoodGeom = mergeGeometries(partGeometries, false);
  partGeometries.forEach((g) => g.dispose());
  disposables.push(mergedWoodGeom);

  const woodMesh = new THREE.Mesh(mergedWoodGeom, barkMat);
  woodMesh.customDepthMaterial = barkDepthMat;
  woodMesh.castShadow = true;
  woodMesh.receiveShadow = true;
  group.add(woodMesh);

  return {
    group,
    woodMesh,
    twigAnchors,
    rootAnchors,
    perchPoints,
    setGrowth: (growth: number) => {
      uTreeGrowth.value = THREE.MathUtils.clamp(growth, 0, 1);
      woodMesh.visible = growth > 0.015;
    },
    setSeason: (season: SeasonId) => {
      if (season === 'winter') {
        barkMat.color.setHex(profile.winterTint);
        barkMat.roughness = Math.max(0.68, profile.roughness - 0.08);
      } else if (season === 'autumn') {
        barkMat.color.setHex(profile.autumnTint);
        barkMat.roughness = profile.roughness;
      } else {
        barkMat.color.setHex(profile.defaultTint);
        barkMat.roughness = profile.roughness;
      }
    },
    dispose: () => {
      disposables.forEach((d) => d.dispose());
    },
  };
}
