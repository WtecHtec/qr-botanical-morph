import * as THREE from 'three';
import { QrSampleResult } from './qrSampler';
import { SeasonId, TreeSpeciesId } from './treeGenerator';

export type WindLevelId = 'gentle' | 'natural' | 'breeze';

interface LeafInstanceData {
  modNx: number;
  modNy: number;
  qrX: number;
  qrZ: number;
  subSizeWorld: number;
  r1: number;
  r2: number;
  r3: number;
  r4: number;
  r5: number;
  r6: number;
  r7: number;
  // 2D QR target (lying flat on bottom XZ plane)
  qrPos: THREE.Vector3;
  qrScale: THREE.Vector3;
  // 3D Tree target (perspective-aligned from top-down view so canopy mirrors the QR silhouette!)
  treePos: THREE.Vector3;
  treeQuat: THREE.Quaternion;
  treeScale: THREE.Vector3;
  canopyHeightNorm: number;
  // Center-out choreography
  phaseOffset: number;
  radialDist: number;
  swirlAngle: number;
  colorSeed: number;
  blossomSeed: number;
  windPhase: number;
  isRootAccent: boolean;
  // Falling leaf physics
  canFall: boolean;
  fallState: 'attached' | 'falling' | 'settled';
  fallTimer: number;
  fallPos: THREE.Vector3;
  fallVel: THREE.Vector3;
  fallEuler: THREE.Euler;
  fallAngVel: THREE.Vector3;
  fallOpacityScale: number;
  flutterFreq: number;
  flutterAmp: number;
}

interface PaletteSpec {
  canopy: number[];
  blossom?: number[];
  blossomThreshold?: number;
  root: number[];
  fallRateMult: number;
}

const SPECIES_SEASON_PALETTES: Record<TreeSpeciesId, Record<SeasonId, PaletteSpec>> = {
  evergreen: {
    spring: {
      canopy: [0x4c8e49, 0x62a655, 0x7bc069, 0x96d17d, 0x56994e],
      blossom: [0xf2b5c4, 0xf7cdd7, 0xe898ad],
      blossomThreshold: 0.84,
      root: [0x3b6338, 0x4c7a45, 0x5c8c52],
      fallRateMult: 1.15,
    },
    summer: {
      canopy: [0x1f4b2e, 0x295f3a, 0x357446, 0x458a52, 0x589d5e],
      root: [0x24462c, 0x315939, 0x3c6844],
      fallRateMult: 0.75,
    },
    autumn: {
      canopy: [0xa63d1c, 0xc75b22, 0xdd812b, 0xe8ac3a, 0xf0cb5c, 0x8d3419],
      root: [0x6e3a20, 0x854927, 0x5c341f],
      fallRateMult: 1.55,
    },
    winter: {
      canopy: [0x51645e, 0x697d77, 0x8fa19d, 0xbbc8c6, 0xdce4e4],
      root: [0x5b6b67, 0x778783, 0xb3c0be],
      fallRateMult: 0.65,
    },
  },
  peach: {
    spring: {
      // Fresh tender spring peach foliage + layered blush/rose/sakura peach blossoms
      canopy: [0x6fb858, 0x88cc6c, 0x589d47],
      blossom: [0xffdbe6, 0xffb3cb, 0xff8cb2, 0xf86c9a, 0xffeef3, 0xf49bb9],
      blossomThreshold: 0.22,
      root: [0x4c7a41, 0x649656, 0xe88fad],
      fallRateMult: 1.45,
    },
    summer: {
      canopy: [0x2d6d3b, 0x3e8349, 0x529b57, 0x66ac64],
      blossom: [0xf7a8c0, 0xffc6d7],
      blossomThreshold: 0.93,
      root: [0x2b5734, 0x3b6e43, 0x4d7e52],
      fallRateMult: 0.85,
    },
    autumn: {
      canopy: [0xc97b2b, 0xdf9f38, 0xe8bc4c, 0xb05a24, 0xd68932],
      root: [0x764422, 0x8e562b, 0x643a1f],
      fallRateMult: 1.6,
    },
    winter: {
      canopy: [0x746b68, 0x8e8480, 0xb8b0b2, 0xdad5d7],
      root: [0x635b59, 0x7e7674, 0xaba3a4],
      fallRateMult: 0.55,
    },
  },
  maple: {
    spring: {
      canopy: [0x5c9648, 0x78b05c, 0xa8523a, 0xc26840, 0x6ba253],
      root: [0x426b39, 0x6b4733, 0x557c47],
      fallRateMult: 1.05,
    },
    summer: {
      canopy: [0x225831, 0x2e6d3e, 0x3c814b, 0x4d9557],
      root: [0x234c2d, 0x32613c, 0x3f7148],
      fallRateMult: 0.8,
    },
    autumn: {
      // Ordered from deep shaded burgundy-crimson -> vivid scarlet -> sunlit fiery orange-gold
      canopy: [0x7e1410, 0xa61d14, 0xc92b19, 0xe0441f, 0xec6d22, 0xf49d2b, 0xf6c344],
      root: [0x782518, 0x9c3920, 0xba5c26],
      fallRateMult: 1.85,
    },
    winter: {
      canopy: [0x6b5652, 0x87726d, 0xb2a5a2, 0xd9d2d0],
      root: [0x5d4c48, 0x776662, 0xa59996],
      fallRateMult: 0.6,
    },
  },
  plum: {
    spring: {
      canopy: [0x5d9c4f, 0x77b462, 0x4d8744],
      blossom: [0xd93860, 0xee6b8b, 0xf7a2b8, 0xfff0f4],
      blossomThreshold: 0.3,
      root: [0x4c7844, 0xd85c7a, 0x628f58],
      fallRateMult: 1.25,
    },
    summer: {
      canopy: [0x245233, 0x316641, 0x3f7a4f, 0x4f8d5d],
      root: [0x254830, 0x335d3f, 0x416e4c],
      fallRateMult: 0.78,
    },
    autumn: {
      canopy: [0xa64829, 0xc46930, 0xdc933e, 0x853724],
      root: [0x683320, 0x824729, 0x592c1d],
      fallRateMult: 1.45,
    },
    winter: {
      // 100% Winter Plum Blossoms (傲雪红梅): deep ruby-carmine -> palace pink -> blush -> snow-ivory
      canopy: [0xf793ae, 0xfff2f6],
      blossom: [0xc42048, 0xdc3660, 0xee5e84, 0xf68eab, 0xfab8cb, 0xfff3f7],
      blossomThreshold: -1,
      root: [0xe86e8e, 0xf6a9be, 0xfff0f4],
      fallRateMult: 0.95,
    },
  },
};

const WIND_MULTIPLIERS: Record<WindLevelId, { sway: number; fallRate: number; gust: number }> = {
  gentle: { sway: 0.55, fallRate: 0.45, gust: 0.45 },
  natural: { sway: 1.0, fallRate: 1.0, gust: 1.0 },
  breeze: { sway: 1.65, fallRate: 1.85, gust: 1.75 },
};

// Perspective camera height used for top-down QR silhouette alignment
export const TOP_DOWN_CAM_Y = 9.2;

// Module-scope reusable math objects (Zero GC in render loop)
const _mat4 = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _euler = new THREE.Euler();
const _qrQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
const _qrColor = new THREE.Color(0x131514);
const _targetColor = new THREE.Color();
const _curColor = new THREE.Color();
const _fallQuat = new THREE.Quaternion();
const _centerGather = new THREE.Vector3();

function deterministicRand(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function drawFivePetalPeachBlossom(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  rotOffset = 0
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotOffset);

  for (let p = 0; p < 5; p++) {
    ctx.save();
    ctx.rotate((p * Math.PI * 2) / 5 - Math.PI / 2);

    // Pointed-ovate peach petal with delicate apical notch (微缺桃瓣)
    ctx.beginPath();
    ctx.moveTo(0, -radius * 0.08);
    ctx.bezierCurveTo(
      radius * 0.44,
      -radius * 0.24,
      radius * 0.58,
      -radius * 0.72,
      radius * 0.14,
      -radius * 0.96
    );
    ctx.quadraticCurveTo(0, -radius * 0.87, -radius * 0.14, -radius * 0.96);
    ctx.bezierCurveTo(
      -radius * 0.58,
      -radius * 0.72,
      -radius * 0.44,
      -radius * 0.24,
      0,
      -radius * 0.08
    );
    ctx.closePath();

    const pGrad = ctx.createRadialGradient(0, -radius * 0.12, radius * 0.05, 0, -radius * 0.62, radius * 0.92);
    pGrad.addColorStop(0, '#c69aa8');
    pGrad.addColorStop(0.28, '#eddce2');
    pGrad.addColorStop(0.68, '#faf6f8');
    pGrad.addColorStop(1, '#ffffff');
    ctx.fillStyle = pGrad;
    ctx.fill();

    // Subtle petal veins
    ctx.strokeStyle = 'rgba(180, 120, 142, 0.22)';
    ctx.lineWidth = Math.max(1, radius * 0.012);
    for (let v = -2; v <= 2; v++) {
      ctx.beginPath();
      ctx.moveTo(0, -radius * 0.14);
      ctx.quadraticCurveTo(
        v * radius * 0.12,
        -radius * 0.48,
        v * radius * 0.15,
        -radius * 0.82
      );
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(0, 0, 0, 0.08)';
    ctx.lineWidth = Math.max(1, radius * 0.011);
    ctx.stroke();
    ctx.restore();
  }

  // Deep carmine-rose nectar throat + golden anthers (preserved by shader goldMask)
  const throat = ctx.createRadialGradient(0, 0, 2, 0, 0, radius * 0.28);
  throat.addColorStop(0, '#9a284c');
  throat.addColorStop(0.55, 'rgba(190, 74, 110, 0.7)');
  throat.addColorStop(1, 'rgba(220, 120, 150, 0)');
  ctx.fillStyle = throat;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.28, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255, 224, 122, 0.95)';
  ctx.lineWidth = Math.max(1.2, radius * 0.015);
  for (let s = 0; s < 18; s++) {
    const a = (s / 18) * Math.PI * 2 + 0.11;
    const len = radius * (0.21 + (s % 3) * 0.045);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len);
    ctx.stroke();

    ctx.fillStyle = '#ffd74a';
    ctx.beginPath();
    ctx.arc(Math.cos(a) * len, Math.sin(a) * len, Math.max(2, radius * 0.026), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawFivePetalPlumBlossom(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  rotOffset = 0
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotOffset);

  // Subtle 5-lobed deep claret calyx sepals peeking between petals
  for (let s = 0; s < 5; s++) {
    ctx.save();
    ctx.rotate((s * Math.PI * 2) / 5 - Math.PI / 2 + Math.PI / 5);
    ctx.fillStyle = 'rgba(118, 28, 52, 0.85)';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(radius * 0.12, -radius * 0.22, 0, -radius * 0.42);
    ctx.quadraticCurveTo(-radius * 0.12, -radius * 0.22, 0, 0);
    ctx.fill();
    ctx.restore();
  }

  for (let p = 0; p < 5; p++) {
    ctx.save();
    ctx.rotate((p * Math.PI * 2) / 5 - Math.PI / 2);

    // Broad, softly cupped rounded plum petal with gentle organic wave
    ctx.beginPath();
    ctx.moveTo(0, -radius * 0.1);
    ctx.bezierCurveTo(
      radius * 0.46,
      -radius * 0.18,
      radius * 0.56,
      -radius * 0.72,
      radius * 0.22,
      -radius * 0.93
    );
    ctx.bezierCurveTo(
      radius * 0.08,
      -radius * 0.99,
      -radius * 0.08,
      -radius * 0.99,
      -radius * 0.22,
      -radius * 0.93
    );
    ctx.bezierCurveTo(
      -radius * 0.56,
      -radius * 0.72,
      -radius * 0.46,
      -radius * 0.18,
      0,
      -radius * 0.1
    );
    ctx.closePath();

    // Luminous porcelain-silk radial sheen (bright petals so tint colors glow vividly)
    const plumGrad = ctx.createRadialGradient(
      0,
      -radius * 0.18,
      radius * 0.04,
      0,
      -radius * 0.6,
      radius * 0.78
    );
    plumGrad.addColorStop(0, '#d8b4c0');
    plumGrad.addColorStop(0.28, '#f3e3e9');
    plumGrad.addColorStop(0.68, '#fcf8fa');
    plumGrad.addColorStop(1, '#ffffff');
    ctx.fillStyle = plumGrad;
    ctx.fill();

    // Delicate silky petal striations
    ctx.strokeStyle = 'rgba(210, 150, 172, 0.2)';
    ctx.lineWidth = Math.max(1, radius * 0.011);
    for (let v = -2; v <= 2; v++) {
      ctx.beginPath();
      ctx.moveTo(0, -radius * 0.16);
      ctx.quadraticCurveTo(
        v * radius * 0.11,
        -radius * 0.48,
        v * radius * 0.14,
        -radius * 0.82
      );
      ctx.stroke();
    }

    // Soft petal overlap shadow rim
    ctx.strokeStyle = 'rgba(130, 62, 86, 0.14)';
    ctx.lineWidth = Math.max(1, radius * 0.013);
    ctx.stroke();
    ctx.restore();
  }

  // Warm carmine-rose nectar heart
  const calyx = ctx.createRadialGradient(0, 0, 2, 0, 0, radius * 0.27);
  calyx.addColorStop(0, '#962244');
  calyx.addColorStop(0.55, 'rgba(176, 56, 92, 0.65)');
  calyx.addColorStop(1, 'rgba(220, 110, 144, 0)');
  ctx.fillStyle = calyx;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.27, 0, Math.PI * 2);
  ctx.fill();

  // Luminous golden-cream stamen crown (preserved by shader goldMask)
  ctx.strokeStyle = 'rgba(255, 232, 134, 0.98)';
  ctx.lineWidth = Math.max(1.2, radius * 0.015);
  for (let s = 0; s < 24; s++) {
    const a = (s / 24) * Math.PI * 2 + 0.08;
    const len = radius * (0.19 + (s % 3) * 0.042);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len);
    ctx.stroke();

    ctx.fillStyle = '#ffe55c';
    ctx.beginPath();
    ctx.arc(Math.cos(a) * len, Math.sin(a) * len, Math.max(2, radius * 0.026), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Draws a crisp 2048x1024 (4x2 grid, 512x512 per cell) botanical sprite atlas:
 * Row 0 (Top, UV v: 0.5..1.0):
 * - (0, 0) style 1: Evergreen serrated oval leaf
 * - (1, 0) style 2: 5-petal notched Peach Blossom (桃花)
 * - (2, 0) style 3: Slender lanceolate Peach Leaf (细长桃叶)
 * - (3, 0) style 4: 7-lobed incised Japanese Maple Leaf (红枫掌状叶)
 * Row 1 (Bottom, UV v: 0.0..0.5):
 * - (0, 1) style 5: 5-petal waxy rounded Plum Blossom (梅花)
 * - (1, 1) style 6: Plum Blossom & Bud Twig Cluster (寒梅双朵含苞枝)
 * - (2, 1) style 7: Peach Blossom & Tender Leaf Cluster (桃花双朵嫩叶簇)
 */
function createBotanicalAtlasTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const cell = 512;
  const atlasW = cell * 4;
  const atlasH = cell * 2;
  const canvas = document.createElement('canvas');
  canvas.width = atlasW;
  canvas.height = atlasH;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, atlasW, atlasH);

  // 1. Cell (0, 0) style 1: Evergreen Serrated Leaf
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(256, 480);
  const steps = 32;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const y = 468 - t * 428;
    const profile = Math.sin(Math.pow(t, 0.72) * Math.PI) * 172;
    const serration = t > 0.08 && t < 0.94 ? Math.sin(t * Math.PI * 16) * 5.5 : 0;
    ctx.lineTo(256 - Math.max(0, profile + serration), y);
  }
  ctx.lineTo(256, 36);
  for (let i = steps; i >= 1; i--) {
    const t = i / steps;
    const y = 468 - t * 428;
    const profile = Math.sin(Math.pow(t, 0.72) * Math.PI) * 172;
    const serration = t > 0.08 && t < 0.94 ? Math.sin(t * Math.PI * 16) * 5.5 : 0;
    ctx.lineTo(256 + Math.max(0, profile + serration), y);
  }
  ctx.closePath();

  const leafGrad = ctx.createLinearGradient(256, 476, 256, 36);
  leafGrad.addColorStop(0, '#c2c8ba');
  leafGrad.addColorStop(0.45, '#e8ece2');
  leafGrad.addColorStop(1, '#ffffff');
  ctx.fillStyle = leafGrad;
  ctx.fill();
  ctx.clip();

  const foldGrad = ctx.createLinearGradient(84, 256, 428, 256);
  foldGrad.addColorStop(0, 'rgba(0,0,0,0.08)');
  foldGrad.addColorStop(0.48, 'rgba(255,255,255,0.06)');
  foldGrad.addColorStop(0.52, 'rgba(0,0,0,0.06)');
  foldGrad.addColorStop(1, 'rgba(255,255,255,0.04)');
  ctx.fillStyle = foldGrad;
  ctx.fillRect(0, 0, cell, cell);

  ctx.strokeStyle = 'rgba(255, 255, 240, 0.48)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(256, 480);
  ctx.quadraticCurveTo(254, 260, 256, 44);
  ctx.stroke();

  ctx.lineWidth = 2.5;
  ctx.strokeStyle = 'rgba(245, 248, 232, 0.3)';
  for (let v = 0; v < 8; v++) {
    const baseY = 412 - v * 46;
    const span = (1 - Math.abs(v - 3) * 0.14) * 136;
    ctx.beginPath();
    ctx.moveTo(256, baseY);
    ctx.quadraticCurveTo(256 - span * 0.45, baseY - 20, 256 - span, baseY - 52);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(256, baseY - 12);
    ctx.quadraticCurveTo(256 + span * 0.45, baseY - 32, 256 + span, baseY - 64);
    ctx.stroke();
  }
  ctx.restore();

  // 2. Cell (1, 0) style 2: 5-Petal Peach Blossom
  drawFivePetalPeachBlossom(ctx, cell + 256, 256, 224, 0);

  // 3. Cell (2, 0) style 3: Slender Lanceolate Peach Leaf (细长桃叶)
  ctx.save();
  ctx.translate(cell * 2 + 256, 256);
  ctx.rotate(0.08);
  ctx.beginPath();
  ctx.moveTo(0, 226);
  for (let i = 1; i <= 36; i++) {
    const t = i / 36;
    const y = 216 - t * 432;
    const w = Math.sin(Math.pow(t, 0.62) * Math.PI) * 76 * (1 - t * 0.25);
    const serr = t > 0.12 && t < 0.92 ? Math.sin(t * Math.PI * 24) * 3.0 : 0;
    ctx.lineTo(-(w + serr), y);
  }
  ctx.lineTo(0, -222);
  for (let i = 36; i >= 1; i--) {
    const t = i / 36;
    const y = 216 - t * 432;
    const w = Math.sin(Math.pow(t, 0.62) * Math.PI) * 76 * (1 - t * 0.25);
    const serr = t > 0.12 && t < 0.92 ? Math.sin(t * Math.PI * 24) * 3.0 : 0;
    ctx.lineTo(w + serr, y);
  }
  ctx.closePath();
  const pLeafGrad = ctx.createLinearGradient(0, 220, 0, -220);
  pLeafGrad.addColorStop(0, '#c0c8b8');
  pLeafGrad.addColorStop(0.5, '#e8efe0');
  pLeafGrad.addColorStop(1, '#ffffff');
  ctx.fillStyle = pLeafGrad;
  ctx.fill();
  ctx.clip();

  ctx.strokeStyle = 'rgba(255, 255, 240, 0.55)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, 226);
  ctx.quadraticCurveTo(6, 0, 0, -216);
  ctx.stroke();
  ctx.lineWidth = 1.8;
  ctx.strokeStyle = 'rgba(250, 252, 236, 0.34)';
  for (let v = 0; v < 10; v++) {
    const y = 160 - v * 36;
    const span = 52 * (1 - Math.abs(v - 4) * 0.12);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.quadraticCurveTo(-span * 0.45, y - 14, -span, y - 34);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, y - 6);
    ctx.quadraticCurveTo(span * 0.45, y - 20, span, y - 40);
    ctx.stroke();
  }
  ctx.restore();

  // 4. Cell (3, 0) style 4: Deeply Incised 7-Lobed Japanese Maple Leaf (鸡爪槭/红枫)
  ctx.save();
  ctx.translate(cell * 3 + 256, 294);
  // Slender petiole stem
  ctx.strokeStyle = '#d4c6bc';
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, 72);
  ctx.quadraticCurveTo(5, 130, -3, 184);
  ctx.stroke();

  // 7-lobed jagged Japanese maple outline
  const lobes = [
    { angle: 0, len: 242, width: 32 },
    { angle: 0.62, len: 212, width: 28 },
    { angle: -0.62, len: 212, width: 28 },
    { angle: 1.24, len: 168, width: 24 },
    { angle: -1.24, len: 168, width: 24 },
    { angle: 1.84, len: 102, width: 18 },
    { angle: -1.84, len: 102, width: 18 },
  ];
  // Build crisp clockwise polygon tracing 7 doubly-serrated lobes
  const outlinePts: Array<[number, number]> = [];
  const sortedLobes = [...lobes].sort((a, b) => a.angle - b.angle);
  outlinePts.push([0, 74]);
  sortedLobes.forEach((lb, idx) => {
    const sa = lb.angle - Math.PI / 2;
    const nx = Math.cos(sa);
    const ny = Math.sin(sa);
    const px = -ny;
    const py = nx;

    if (idx > 0) {
      const prevA = sortedLobes[idx - 1].angle - Math.PI / 2;
      const midA = (prevA + sa) * 0.5;
      const sinusR = 46;
      outlinePts.push([Math.cos(midA) * sinusR, Math.sin(midA) * sinusR + 40]);
    }
    // Left serrated edge of lobe
    for (let s = 1; s <= 4; s++) {
      const t = s / 5;
      const r = 48 + (lb.len - 48) * t;
      const w = Math.sin(Math.pow(t, 0.7) * Math.PI) * lb.width + (s % 2 === 0 ? 5 : -2);
      outlinePts.push([nx * r - px * w, ny * r - py * w + 40]);
    }
    // Sharp acuminate tip
    outlinePts.push([nx * lb.len, ny * lb.len + 40]);
    // Right serrated edge of lobe
    for (let s = 4; s >= 1; s--) {
      const t = s / 5;
      const r = 48 + (lb.len - 48) * t;
      const w = Math.sin(Math.pow(t, 0.7) * Math.PI) * lb.width + (s % 2 === 0 ? 5 : -2);
      outlinePts.push([nx * r + px * w, ny * r + py * w + 40]);
    }
  });

  ctx.beginPath();
  ctx.moveTo(outlinePts[0][0], outlinePts[0][1]);
  for (let i = 1; i < outlinePts.length; i++) {
    ctx.lineTo(outlinePts[i][0], outlinePts[i][1]);
  }
  ctx.closePath();

  const mapleGrad = ctx.createRadialGradient(0, 20, 12, 0, -24, 240);
  mapleGrad.addColorStop(0, '#cfc4be');
  mapleGrad.addColorStop(0.45, '#ebe6e2');
  mapleGrad.addColorStop(1, '#ffffff');
  ctx.fillStyle = mapleGrad;
  ctx.fill();

  ctx.strokeStyle = 'rgba(255, 250, 240, 0.58)';
  ctx.lineWidth = 3.2;
  sortedLobes.forEach((lb) => {
    const sa = lb.angle - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(0, 48);
    ctx.lineTo(Math.cos(sa) * (lb.len * 0.9), Math.sin(sa) * (lb.len * 0.9) + 40);
    ctx.stroke();
  });
  ctx.restore();

  // 5. Cell (0, 1) style 5: 5-Petal Waxy Plum Blossom
  drawFivePetalPlumBlossom(ctx, 256, cell + 256, 218, 0.15);

  // 6. Cell (1, 1) style 6: Plum Blossom Trio & Plump Buds Cluster (寒梅双花含苞簇 — no floating black sticks)
  ctx.save();
  ctx.translate(cell, cell);
  const drawPlumBud = (bx: number, by: number, angle: number, budScale: number) => {
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(angle);
    ctx.scale(budScale, budScale);
    // Claret calyx cup
    ctx.fillStyle = '#751c36';
    ctx.beginPath();
    ctx.ellipse(0, 14, 16, 13, 0, 0, Math.PI * 2);
    ctx.fill();
    // Plump silky rose-ivory unopened bud
    const budGrad = ctx.createRadialGradient(-4, -12, 3, 0, -6, 28);
    budGrad.addColorStop(0, '#ffffff');
    budGrad.addColorStop(0.55, '#fceef3');
    budGrad.addColorStop(1, '#e6b8c8');
    ctx.fillStyle = budGrad;
    ctx.beginPath();
    ctx.ellipse(0, -8, 18, 26, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  drawPlumBud(392, 168, 0.55, 1.05);
  drawPlumBud(126, 336, -0.78, 0.92);
  drawFivePetalPlumBlossom(ctx, 204, 198, 138, -0.22);
  drawFivePetalPlumBlossom(ctx, 308, 304, 152, 0.42);
  ctx.restore();

  // 7. Cell (2, 1) style 7: Peach Blossom Pair + Tender Green Sprout Leaf (桃花双朵嫩叶簇)
  ctx.save();
  ctx.translate(cell * 2, cell);
  // Small tender green sprout leaf (preserved via greenSproutMask)
  ctx.save();
  ctx.translate(362, 170);
  ctx.rotate(0.68);
  ctx.beginPath();
  ctx.moveTo(0, 96);
  ctx.quadraticCurveTo(-36, 0, 0, -108);
  ctx.quadraticCurveTo(36, 0, 0, 96);
  ctx.closePath();
  const sproutGrad = ctx.createLinearGradient(0, 96, 0, -108);
  sproutGrad.addColorStop(0, '#5a9c42');
  sproutGrad.addColorStop(1, '#84cc62');
  ctx.fillStyle = sproutGrad;
  ctx.fill();
  ctx.restore();

  drawFivePetalPeachBlossom(ctx, 198, 292, 142, -0.25);
  drawFivePetalPeachBlossom(ctx, 308, 224, 134, 0.42);
  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export class LeafMorphSystem {
  public readonly instancedMesh: THREE.InstancedMesh;
  public readonly qrCardGroup: THREE.Group;
  public readonly qrWorldSize = 4.2;

  private readonly instances: LeafInstanceData[] = [];
  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.MeshStandardMaterial;
  private readonly depthMaterial: THREE.MeshDepthMaterial;
  private readonly leafTexture: THREE.CanvasTexture;
  private readonly leafStyleAttr: THREE.InstancedBufferAttribute;
  private readonly cardTexture: THREE.CanvasTexture;
  private readonly cardMaterial: THREE.MeshStandardMaterial;
  private readonly cardBorderMaterial: THREE.MeshStandardMaterial;
  private readonly disposables: Array<{ dispose: () => void }> = [];

  private readonly uMorph = { value: 0.0 };
  private readonly uTime = { value: 0.0 };
  private species: TreeSpeciesId = 'evergreen';
  private season: SeasonId = 'spring';
  private windLevel: WindLevelId = 'natural';
  private lastMorphProgress = -1;

  constructor(
    qrData: QrSampleResult,
    rootAnchors: THREE.Vector3[],
    maxAnisotropy: number,
    initialSpecies: TreeSpeciesId = 'evergreen',
    initialSeason: SeasonId = 'spring'
  ) {
    this.species = initialSpecies;
    this.season = initialSeason;

    this.geometry = new THREE.PlaneGeometry(1, 1, 4, 4);
    this.leafTexture = createBotanicalAtlasTexture(maxAnisotropy);

    this.material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.46,
      metalness: 0.02,
      side: THREE.DoubleSide,
    });

    this.depthMaterial = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking,
    });

    const subGrid = 2;
    const totalCount = qrData.modules.length * subGrid * subGrid;
    const leafStyleArray = new Float32Array(totalCount);

    const patchLeafShader = (mat: THREE.Material, isDepth: boolean) => {
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uMorph = this.uMorph;
        shader.uniforms.uTime = this.uTime;
        shader.uniforms.uLeafTex = { value: this.leafTexture };

        shader.vertexShader = shader.vertexShader
          .replace(
            '#include <common>',
            `#include <common>
            attribute float aLeafStyle;
            uniform float uMorph;
            uniform float uTime;
            varying vec2 vLeafUv;
            varying float vLeafStyle;`
          )
          .replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
            vLeafUv = uv;
            vLeafStyle = aLeafStyle;
            float archFactor = smoothstep(0.18, 0.88, uMorph);
            if (archFactor > 0.001) {
              bool isBlossom = (aLeafStyle > 1.5 && aLeafStyle < 2.5) || aLeafStyle > 4.5;
              if (isBlossom) {
                // 3D radial corolla cupping so blossoms have true petal bowl depth
                vec2 c = (uv - 0.5) * 2.0;
                float r2 = clamp(dot(c, c), 0.0, 1.5);
                transformed.z += (r2 * 0.22 - 0.05) * archFactor;
              } else {
                // Leaf midrib V-fold + arch + gentle tip curl
                float fold = abs(uv.x - 0.5) * 0.2;
                float arch = sin(uv.y * 3.14159) * 0.14 - (1.0 - uv.y) * 0.05;
                transformed.z += (fold + arch) * archFactor;
              }
            }`
          );

        const atlasLookupHelper = `
            vec2 getBotanicalAtlasUv(vec2 baseUv, float styleVal) {
              float idx = floor(styleVal + 0.5) - 1.0;
              float col = mod(idx, 4.0);
              float isBottomRow = step(3.5, idx);
              vec2 quadOffset = vec2(col * 0.25, (1.0 - isBottomRow) * 0.5);
              return quadOffset + vec2(0.012, 0.024) + clamp(baseUv, 0.0, 1.0) * vec2(0.226, 0.452);
            }
        `;

        shader.fragmentShader = shader.fragmentShader
          .replace(
            '#include <common>',
            `#include <common>
            uniform float uMorph;
            uniform sampler2D uLeafTex;
            varying vec2 vLeafUv;
            varying float vLeafStyle;
            ${atlasLookupHelper}`
          )
          .replace(
            isDepth ? '#include <clipping_planes_fragment>' : '#include <map_fragment>',
            isDepth
              ? `#include <clipping_planes_fragment>
              float shapeBlend = smoothstep(0.14, 0.68, uMorph);
              if (shapeBlend > 0.01 && vLeafStyle > 0.5) {
                vec4 texel = texture2D(uLeafTex, getBotanicalAtlasUv(vLeafUv, vLeafStyle));
                float mask = mix(1.0, texel.a, shapeBlend);
                if (mask < 0.42) discard;
              }`
              : `#include <map_fragment>
              float shapeBlend = smoothstep(0.14, 0.68, uMorph);
              if (shapeBlend > 0.01 && vLeafStyle > 0.5) {
                vec4 texel = texture2D(uLeafTex, getBotanicalAtlasUv(vLeafUv, vLeafStyle));
                float mask = mix(1.0, texel.a, shapeBlend);
                if (mask < 0.42) discard;

                // Preserve luminous golden stamens & green sprouts while allowing petals & calyxes to tint richly
                float goldMask = clamp((texel.r - texel.b - 0.18) * 3.8, 0.0, 1.0);
                float sproutMask = clamp((texel.g - max(texel.r, texel.b) - 0.08) * 5.0, 0.0, 1.0);
                float preserveMask = clamp(max(goldMask, sproutMask), 0.0, 1.0);

                vec3 tinted = diffuseColor.rgb * texel.rgb;
                vec3 botColor = mix(tinted, texel.rgb * 1.06, preserveMask * 0.94);
                diffuseColor.rgb = mix(diffuseColor.rgb, botColor, shapeBlend);
              }`
          );
      };
    };

    patchLeafShader(this.material, false);
    patchLeafShader(this.depthMaterial, true);

    this.instancedMesh = new THREE.InstancedMesh(this.geometry, this.material, totalCount);
    this.instancedMesh.customDepthMaterial = this.depthMaterial;
    this.instancedMesh.castShadow = true;
    this.instancedMesh.receiveShadow = true;
    this.instancedMesh.frustumCulled = false;

    const moduleSizeWorld = this.qrWorldSize / qrData.gridSize;
    const subSizeWorld = moduleSizeWorld / subGrid;

    let idx = 0;
    const fallingCandidateIndices: number[] = [];

    for (let mIdx = 0; mIdx < qrData.modules.length; mIdx++) {
      const mod = qrData.modules[mIdx];

      for (let sy = 0; sy < subGrid; sy++) {
        for (let sx = 0; sx < subGrid; sx++) {
          const seedBase = idx * 1.43 + mIdx * 0.79;
          const r1 = deterministicRand(seedBase + 1);
          const r2 = deterministicRand(seedBase + 2);
          const r3 = deterministicRand(seedBase + 3);
          const r4 = deterministicRand(seedBase + 4);
          const r5 = deterministicRand(seedBase + 5);
          const r6 = deterministicRand(seedBase + 6);
          const r7 = deterministicRand(seedBase + 7);

          const subOffsetX = (sx - 0.5) * subSizeWorld;
          const subOffsetZ = (sy - 0.5) * subSizeWorld;
          const qrX = mod.nx * this.qrWorldSize + subOffsetX;
          const qrZ = -mod.ny * this.qrWorldSize + subOffsetZ;
          const qrPos = new THREE.Vector3(qrX, 0.014, qrZ);
          const qrScale = new THREE.Vector3(subSizeWorld * 1.015, subSizeWorld * 1.015, 1);

          const radialDist = Math.min(1, Math.hypot(mod.nx, mod.ny) / 0.707);
          const isRootAccent = radialDist < 0.14 && r1 < 0.16 && rootAnchors.length > 0;

          let treePos: THREE.Vector3;
          const treeQuat = new THREE.Quaternion();
          const treeScale = new THREE.Vector3();

          if (isRootAccent) {
            const anchor = rootAnchors[idx % rootAnchors.length];
            const ang = r2 * Math.PI * 2;
            const dist = 0.04 + r3 * 0.18;
            treePos = new THREE.Vector3(
              anchor.x + Math.cos(ang) * dist,
              0.025 + r4 * 0.04,
              anchor.z + Math.sin(ang) * dist
            );
            _euler.set(-Math.PI * 0.45 + (r2 - 0.5) * 0.28, r3 * Math.PI * 2, (r4 - 0.5) * 0.28);
            treeQuat.setFromEuler(_euler);
            const s = subSizeWorld * (1.35 + r5 * 0.5);
            treeScale.set(s, s * 1.15, 1);
          } else {
            treePos = new THREE.Vector3(qrX, 2.5, qrZ);
          }

          const phaseOffset = radialDist * 0.34 + r6 * 0.07;

          const inst: LeafInstanceData = {
            modNx: mod.nx,
            modNy: mod.ny,
            qrX,
            qrZ,
            subSizeWorld,
            r1,
            r2,
            r3,
            r4,
            r5,
            r6,
            r7,
            qrPos,
            qrScale,
            treePos,
            treeQuat,
            treeScale,
            canopyHeightNorm: 0.5,
            phaseOffset,
            radialDist,
            swirlAngle: Math.atan2(qrZ, qrX) + (r2 - 0.5) * 0.55,
            colorSeed: r6,
            blossomSeed: r7,
            windPhase: r2 * Math.PI * 2,
            isRootAccent,
            canFall: false,
            fallState: 'attached',
            fallTimer: 0,
            fallPos: treePos.clone(),
            fallVel: new THREE.Vector3(),
            fallEuler: new THREE.Euler(),
            fallAngVel: new THREE.Vector3(),
            fallOpacityScale: 1,
            flutterFreq: 2.4 + r4 * 2.2,
            flutterAmp: 0.45 + r5 * 0.55,
          };

          if (!isRootAccent) {
            fallingCandidateIndices.push(idx);
          }

          this.instances.push(inst);
          idx++;
        }
      }
    }

    this.leafStyleAttr = new THREE.InstancedBufferAttribute(leafStyleArray, 1);
    this.geometry.setAttribute('aLeafStyle', this.leafStyleAttr);

    // Build species-specific 3D canopy shape & botanical leaf/blossom style assignments
    this.rebuildSpeciesCanopyAndStyles();

    // ~68 canopy leaves/blossoms cycle smoothly through natural falling physics
    const targetFallers = Math.min(68, Math.floor(fallingCandidateIndices.length * 0.14));
    const step = Math.max(1, Math.floor(fallingCandidateIndices.length / Math.max(1, targetFallers)));
    let fallSlot = 0;
    for (let i = 0; i < fallingCandidateIndices.length && fallSlot < targetFallers; i += step) {
      const inst = this.instances[fallingCandidateIndices[i]];
      inst.canFall = true;
      inst.fallTimer = 0.4 + (fallSlot / targetFallers) * 9.5;
      fallSlot++;
    }

    // Flat 2D QR card lying on bottom XZ floor
    this.qrCardGroup = new THREE.Group();
    this.qrCardGroup.position.set(0, 0.008, 0);
    this.qrCardGroup.rotation.x = -Math.PI / 2;

    this.cardTexture = new THREE.CanvasTexture(qrData.cardCanvas);
    this.cardTexture.colorSpace = THREE.SRGBColorSpace;
    this.cardTexture.anisotropy = maxAnisotropy;

    const cardOuterSize = this.qrWorldSize / 0.84;
    const cardFrontGeom = new THREE.PlaneGeometry(cardOuterSize, cardOuterSize);
    this.cardMaterial = new THREE.MeshStandardMaterial({
      map: this.cardTexture,
      roughness: 0.62,
      metalness: 0.02,
      transparent: true,
      opacity: 1,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const cardFrontMesh = new THREE.Mesh(cardFrontGeom, this.cardMaterial);
    cardFrontMesh.position.z = 0.004;
    cardFrontMesh.receiveShadow = true;

    const cardBackGeom = new THREE.BoxGeometry(cardOuterSize + 0.16, cardOuterSize + 0.16, 0.016);
    this.cardBorderMaterial = new THREE.MeshStandardMaterial({
      color: 0xf8f7f3,
      roughness: 0.72,
      metalness: 0.02,
      transparent: true,
      opacity: 1,
    });
    const cardBackMesh = new THREE.Mesh(cardBackGeom, this.cardBorderMaterial);
    cardBackMesh.position.z = -0.006;
    cardBackMesh.receiveShadow = true;

    this.qrCardGroup.add(cardBackMesh);
    this.qrCardGroup.add(cardFrontMesh);

    this.disposables.push(
      this.geometry,
      this.material,
      this.depthMaterial,
      this.leafTexture,
      this.cardTexture,
      this.cardMaterial,
      this.cardBorderMaterial,
      cardFrontGeom,
      cardBackGeom
    );

    this.update(0, 0, 0.016);
    this.instancedMesh.computeBoundingSphere();
  }

  private isBlossomInstance(inst: LeafInstanceData): boolean {
    const pal = SPECIES_SEASON_PALETTES[this.species][this.season];
    if (!pal.blossom || pal.blossomThreshold === undefined) return false;
    return inst.blossomSeed > pal.blossomThreshold;
  }

  /**
   * Reshapes 3D canopy posture, foliage tiers, petal/leaf orientation & atlas sprite style
   * per species while keeping top-down perspective alignment `(0, TOP_DOWN_CAM_Y, 0)` exact!
   */
  private rebuildSpeciesCanopyAndStyles(): void {
    const arr = this.leafStyleAttr.array as Float32Array;

    for (let i = 0; i < this.instances.length; i++) {
      const inst = this.instances[i];
      const blossom = this.isBlossomInstance(inst);

      // 1. Choose botanical sprite style (1..7)
      let style = 1.0;
      if (this.species === 'maple') {
        style = 4.0; // 7-lobed palmate maple leaf
      } else if (this.species === 'peach') {
        if (blossom) {
          style = inst.r3 > 0.68 ? 7.0 : 2.0; // Peach blossom or pair+sprout cluster
        } else {
          style = 3.0; // Slender lanceolate peach leaf
        }
      } else if (this.species === 'plum') {
        if (blossom) {
          style = inst.r3 > 0.56 ? 6.0 : 5.0; // Layered 5-petal plum blossom or trio+bud cluster
        } else {
          style = 3.0; // Slender lanceolate young/summer plum leaf
        }
      } else {
        style = blossom ? 2.0 : 1.0;
      }
      arr[i] = style;

      if (inst.isRootAccent) continue;

      // 2. Shape species-distinct 3D canopy elevation & tilt
      let treeY: number;
      if (this.species === 'peach') {
        // Wide-spreading open-vase blossom canopy with billowing blossom clusters & weeping outer skirt
        const vaseDome = THREE.MathUtils.lerp(3.15, 1.52, Math.pow(inst.radialDist, 1.25));
        const blossomPuff =
          Math.sin(inst.modNx * 10.5 + inst.modNy * 8.2) * 0.28 +
          Math.cos(inst.modNx * 7.8 - inst.modNy * 11.4) * 0.22;
        const skirtDroop = inst.radialDist > 0.66 ? -(inst.radialDist - 0.66) * 0.65 : 0;
        treeY = THREE.MathUtils.clamp(
          vaseDome + blossomPuff + skirtDroop + (inst.r4 - 0.5) * 0.56,
          1.25,
          3.65
        );
      } else if (this.species === 'maple') {
        // 4 distinct horizontal cloud-pad foliage tiers (层云红枫) with clear air gaps between layers
        const tierT = THREE.MathUtils.clamp(
          1 - inst.radialDist * 0.72 + (inst.r4 - 0.5) * 0.42,
          0,
          0.999
        );
        const tierIdx = Math.floor(tierT * 4);
        const tierHeights = [1.58, 2.24, 2.9, 3.58];
        const tierBase = tierHeights[tierIdx] ?? 2.9;
        const padWave =
          Math.sin(inst.modNx * 6.5 - inst.modNy * 5.5) * 0.1 + (inst.r2 - 0.5) * 0.22;
        treeY = THREE.MathUtils.clamp(tierBase + padWave, 1.4, 3.88);
      } else if (this.species === 'plum') {
        // Poetic asymmetrical literati cloud-bough tiers hugging sweeping branches (疏影横斜 · 繁花错落)
        const sweepBias = THREE.MathUtils.clamp(0.5 + inst.modNx * 0.58 - inst.modNy * 0.25, 0, 1);
        const sprayWave =
          Math.sin(inst.modNx * 9.5 + inst.modNy * 7.5) * 0.26 +
          Math.cos(inst.modNx * 6.2 - inst.modNy * 10.8) * 0.2;
        const tierSlot = Math.floor(THREE.MathUtils.clamp(sweepBias * 2.1 + inst.r4 * 1.35, 0, 2.999));
        const plumTiers = [1.58, 2.38, 3.24];
        const tierY = plumTiers[tierSlot] ?? 2.38;
        treeY = THREE.MathUtils.clamp(tierY + sprayWave + (inst.r2 - 0.5) * 0.24, 1.34, 3.86);
      } else {
        // Evergreen classic lush balanced crown
        const domeBase = THREE.MathUtils.lerp(3.65, 1.88, Math.pow(inst.radialDist, 1.15));
        const lobeWave =
          Math.sin(inst.modNx * 7.5 + inst.modNy * 5.2) * 0.28 +
          Math.cos(inst.modNx * 4.1 - inst.modNy * 6.8) * 0.22;
        treeY = THREE.MathUtils.clamp(domeBase + lobeWave + (inst.r4 - 0.5) * 0.75, 1.55, 4.25);
      }

      const perspScale = (TOP_DOWN_CAM_Y - treeY) / TOP_DOWN_CAM_Y;
      const jitterAmt = this.species === 'plum' ? 0.3 : 0.34;
      const jitterX = (inst.r2 - 0.5) * inst.subSizeWorld * jitterAmt;
      const jitterZ = (inst.r3 - 0.5) * inst.subSizeWorld * jitterAmt;

      inst.treePos.set(inst.qrX * perspScale + jitterX, treeY, inst.qrZ * perspScale + jitterZ);
      inst.canopyHeightNorm = THREE.MathUtils.clamp((treeY - 1.3) / 2.6, 0, 1);

      if (inst.fallState === 'attached') {
        inst.fallPos.copy(inst.treePos);
      }

      // Orientation: Maple lies flatter in horizontal tiers; Plum & Peach blossoms face outward/viewer warmly
      if (this.species === 'maple') {
        _euler.set(
          -Math.PI / 2 + (inst.r2 - 0.5) * 0.52,
          inst.r3 * Math.PI * 2,
          (inst.r4 - 0.5) * 0.45
        );
      } else if (this.species === 'plum' && blossom) {
        _euler.set(
          -Math.PI * 0.2 + (inst.r2 - 0.5) * 1.18,
          inst.r3 * Math.PI * 2,
          (inst.r4 - 0.5) * 0.95
        );
      } else if (blossom) {
        _euler.set(
          -Math.PI * 0.36 + (inst.r2 - 0.5) * 1.45,
          inst.r3 * Math.PI * 2,
          (inst.r4 - 0.5) * 1.15
        );
      } else {
        _euler.set(
          -Math.PI / 2 + (inst.r2 - 0.5) * 1.15,
          inst.r3 * Math.PI * 2,
          (inst.r4 - 0.5) * 0.95
        );
      }
      inst.treeQuat.setFromEuler(_euler);

      // Species-authentic proportion & scale
      const baseW = inst.subSizeWorld * perspScale;
      if (this.species === 'maple') {
        const w = baseW * (2.25 + inst.r5 * 0.72);
        inst.treeScale.set(w, w * 1.05, 1);
      } else if (this.species === 'peach') {
        if (style === 3.0) {
          // Narrow lanceolate peach leaf
          const w = baseW * (1.25 + inst.r5 * 0.35);
          inst.treeScale.set(w, w * 2.25, 1);
        } else {
          // Peach blossom / pair cluster
          const s = baseW * (style === 7.0 ? 2.55 : 2.28 + inst.r5 * 0.62);
          inst.treeScale.set(s, s, 1);
        }
      } else if (this.species === 'plum') {
        if (blossom) {
          // Rhythmic scale hierarchy: full clusters, crisp blossoms, and dainty accents so dark branches breathe
          const s =
            style === 6.0
              ? baseW * (2.25 + inst.r5 * 0.48)
              : baseW * (inst.r1 < 0.22 ? 1.38 + inst.r5 * 0.28 : 1.88 + inst.r5 * 0.58);
          inst.treeScale.set(s, s, 1);
        } else {
          const w = baseW * (1.18 + inst.r5 * 0.32);
          inst.treeScale.set(w, w * 2.05, 1);
        }
      } else {
        const w = baseW * (1.92 + inst.r5 * 0.65);
        inst.treeScale.set(w, w * (1.2 + inst.r4 * 0.22), 1);
      }
    }

    this.leafStyleAttr.needsUpdate = true;
  }

  public setSpecies(species: TreeSpeciesId): void {
    this.species = species;
    this.rebuildSpeciesCanopyAndStyles();
  }

  public setSeason(season: SeasonId): void {
    this.season = season;
    this.rebuildSpeciesCanopyAndStyles();
  }

  public setWindLevel(windLevel: WindLevelId): void {
    this.windLevel = windLevel;
  }

  public resetFallingState(): void {
    this.lastMorphProgress = -1;
    let slot = 0;
    for (let i = 0; i < this.instances.length; i++) {
      const inst = this.instances[i];
      inst.fallState = 'attached';
      inst.fallOpacityScale = 1;
      inst.fallPos.copy(inst.treePos);
      if (inst.canFall) {
        inst.fallTimer = 0.4 + ((slot % 16) / 16) * 4.5;
        slot++;
      }
    }
  }

  private getTargetLeafColor(inst: LeafInstanceData, out: THREE.Color): void {
    const pal = SPECIES_SEASON_PALETTES[this.species][this.season];
    if (inst.isRootAccent) {
      const idx = Math.min(pal.root.length - 1, Math.floor(inst.colorSeed * pal.root.length));
      out.setHex(pal.root[idx]);
      return;
    }
    if (pal.blossom && this.isBlossomInstance(inst)) {
      if (this.species === 'plum') {
        // Painterly plum blossom shading: richer ruby-carmine near branches/base, luminous blush & snow-ivory on outer tips
        const lightFactor = THREE.MathUtils.clamp(
          inst.canopyHeightNorm * 0.45 + inst.radialDist * 0.35 + (inst.colorSeed - 0.5) * 0.42,
          0,
          0.999
        );
        const idx = Math.min(pal.blossom.length - 1, Math.floor(lightFactor * pal.blossom.length));
        out.setHex(pal.blossom[idx]);
        return;
      }
      const idx = Math.min(pal.blossom.length - 1, Math.floor(inst.colorSeed * pal.blossom.length));
      out.setHex(pal.blossom[idx]);
      return;
    }
    // For Maple in Autumn, blend sunlight gradient from deep burgundy (lower inner) to scarlet/gold (upper/outer)
    if (this.species === 'maple' && this.season === 'autumn') {
      const sunFactor = THREE.MathUtils.clamp(
        inst.canopyHeightNorm * 0.55 + inst.radialDist * 0.25 + (inst.colorSeed - 0.5) * 0.35,
        0,
        0.999
      );
      const idx = Math.min(pal.canopy.length - 1, Math.floor(sunFactor * pal.canopy.length));
      out.setHex(pal.canopy[idx]);
      return;
    }

    const idx = Math.min(pal.canopy.length - 1, Math.floor(inst.colorSeed * pal.canopy.length));
    out.setHex(pal.canopy[idx]);
  }

  public update(morphProgress: number, elapsed: number, delta: number): void {
    this.uMorph.value = morphProgress;
    this.uTime.value = elapsed;

    const baseWind = WIND_MULTIPLIERS[this.windLevel];
    const seasonFallMult = SPECIES_SEASON_PALETTES[this.species][this.season].fallRateMult;
    const windCfg = {
      sway: baseWind.sway,
      fallRate: baseWind.fallRate * seasonFallMult,
      gust: baseWind.gust,
    };

    const isMorphingToQr = this.lastMorphProgress >= 0 && morphProgress < this.lastMorphProgress - 0.0005;
    this.lastMorphProgress = morphProgress;

    const qrCrispFactor = THREE.MathUtils.clamp(1 - morphProgress / 0.24, 0, 1);
    const cardAlpha = qrCrispFactor * qrCrispFactor;
    this.qrCardGroup.visible = cardAlpha > 0.005;
    this.cardMaterial.opacity = cardAlpha;
    this.cardBorderMaterial.opacity = cardAlpha;

    const activeCanFall = morphProgress > 0.78;

    for (let i = 0; i < this.instances.length; i++) {
      const inst = this.instances[i];

      if (inst.canFall) {
        if (!activeCanFall) {
          if (inst.fallState !== 'attached' && isMorphingToQr) {
            inst.fallTimer = 1.5 + inst.colorSeed * 6.0;
          }
          if (morphProgress < 0.05) {
            inst.fallState = 'attached';
            inst.fallOpacityScale = 1;
            inst.fallPos.copy(inst.treePos);
          }
        } else {
          this.stepFallingLeaf(inst, elapsed, delta, windCfg);
        }
      }

      if (inst.canFall && inst.fallState !== 'attached' && activeCanFall) {
        _pos.copy(inst.fallPos);
        _fallQuat.setFromEuler(inst.fallEuler);
        _quat.copy(_fallQuat);
        _scale.copy(inst.treeScale).multiplyScalar(inst.fallOpacityScale);
      } else {
        const span = 1 - inst.phaseOffset;
        const localT = THREE.MathUtils.clamp(
          (morphProgress - inst.phaseOffset * 0.78) / Math.max(0.32, span * 0.82 + 0.18),
          0,
          1
        );
        const easedT = localT * localT * (3 - 2 * localT);

        if (easedT < 0.001) {
          _pos.copy(inst.qrPos);
        } else if (easedT >= 0.999) {
          _pos.copy(inst.treePos);
        } else {
          const gatherH = 0.7 + (1 - inst.radialDist) * 0.9;
          const swirlTheta = inst.swirlAngle + easedT * 1.45;
          const stemR = (1 - Math.sin(easedT * Math.PI) * 0.72) * 0.35;
          _centerGather.set(
            Math.cos(swirlTheta) * stemR,
            gatherH + easedT * 0.85,
            Math.sin(swirlTheta) * stemR
          );

          const u = easedT;
          const omt = 1 - u;
          _pos.set(
            omt * omt * inst.qrPos.x + 2 * omt * u * _centerGather.x + u * u * inst.treePos.x,
            omt * omt * inst.qrPos.y + 2 * omt * u * _centerGather.y + u * u * inst.treePos.y,
            omt * omt * inst.qrPos.z + 2 * omt * u * _centerGather.z + u * u * inst.treePos.z
          );
        }

        if (!inst.isRootAccent && morphProgress > 0.35) {
          const swayAmt = 0.022 * windCfg.sway * morphProgress;
          _pos.x += Math.sin(elapsed * 1.55 + inst.windPhase) * swayAmt;
          _pos.y += Math.cos(elapsed * 1.95 + inst.windPhase * 1.3) * swayAmt * 0.75;
          _pos.z += Math.sin(elapsed * 1.25 + inst.windPhase * 0.7) * swayAmt;
        }

        _quat.slerpQuaternions(_qrQuat, inst.treeQuat, easedT);
        if (!inst.isRootAccent && morphProgress > 0.5) {
          const flutter = Math.sin(elapsed * 2.2 + inst.windPhase) * 0.07 * windCfg.sway * morphProgress;
          _euler.set(flutter, flutter * 0.4, flutter * 0.4);
          _fallQuat.setFromEuler(_euler);
          _quat.multiply(_fallQuat);
        }

        _scale.lerpVectors(inst.qrScale, inst.treeScale, easedT);
        if (inst.canFall && inst.fallState === 'attached') {
          _scale.multiplyScalar(inst.fallOpacityScale);
        }
      }

      if (inst.canFall && inst.fallState !== 'attached' && !activeCanFall) {
        const returnBlend = 1 - THREE.MathUtils.clamp(morphProgress / 0.78, 0, 1);
        const smoothReturn = returnBlend * returnBlend * (3 - 2 * returnBlend);
        _pos.lerpVectors(inst.fallPos, inst.qrPos, smoothReturn);
        _fallQuat.setFromEuler(inst.fallEuler);
        _quat.slerpQuaternions(_fallQuat, _qrQuat, smoothReturn);
        _scale.lerpVectors(
          _scale.copy(inst.treeScale).multiplyScalar(Math.max(0.25, inst.fallOpacityScale)),
          inst.qrScale,
          smoothReturn
        );
      }

      _mat4.compose(_pos, _quat, _scale);
      this.instancedMesh.setMatrixAt(i, _mat4);

      this.getTargetLeafColor(inst, _targetColor);
      _curColor.lerpColors(_qrColor, _targetColor, THREE.MathUtils.smoothstep(morphProgress, 0.1, 0.85));
      this.instancedMesh.setColorAt(i, _curColor);
    }

    this.instancedMesh.instanceMatrix.needsUpdate = true;
    if (this.instancedMesh.instanceColor) {
      this.instancedMesh.instanceColor.needsUpdate = true;
    }
  }

  private stepFallingLeaf(
    inst: LeafInstanceData,
    elapsed: number,
    delta: number,
    windCfg: { sway: number; fallRate: number; gust: number }
  ): void {
    const dt = Math.min(delta, 0.05);

    if (inst.fallState === 'attached') {
      inst.fallOpacityScale = Math.min(1, inst.fallOpacityScale + dt * 1.4);
      inst.fallTimer -= dt * windCfg.fallRate;
      if (inst.fallTimer <= 0) {
        inst.fallState = 'falling';
        inst.fallPos.copy(inst.treePos);
        inst.fallVel.set(
          (deterministicRand(elapsed + inst.windPhase) - 0.35) * 0.36 * windCfg.gust,
          -0.1,
          (deterministicRand(elapsed * 1.7 + inst.windPhase) - 0.5) * 0.34 * windCfg.gust
        );
        inst.fallEuler.setFromQuaternion(inst.treeQuat);
        inst.fallAngVel.set(
          (inst.colorSeed - 0.5) * 2.2,
          (deterministicRand(inst.windPhase) - 0.5) * 2.4,
          (inst.colorSeed - 0.5) * 2.0
        );
        inst.fallOpacityScale = 1;
      }
      return;
    }

    if (inst.fallState === 'falling') {
      const gustX =
        Math.sin(elapsed * 0.85 + inst.fallPos.y * 0.9 + inst.windPhase) * 0.46 * windCfg.gust +
        0.13 * windCfg.gust;
      const gustZ =
        Math.cos(elapsed * 0.72 + inst.fallPos.x * 0.8 + inst.windPhase) * 0.4 * windCfg.gust;
      const flutter = Math.sin(elapsed * inst.flutterFreq + inst.windPhase) * inst.flutterAmp;

      inst.fallVel.x += (gustX + flutter * 0.45 - inst.fallVel.x * 1.45) * dt;
      inst.fallVel.z +=
        (gustZ + Math.cos(elapsed * inst.flutterFreq * 0.85 + inst.windPhase) * 0.32 - inst.fallVel.z * 1.45) * dt;

      const targetVy = -0.54 + Math.abs(flutter) * 0.14;
      inst.fallVel.y += (targetVy - inst.fallVel.y) * 2.2 * dt;

      inst.fallPos.addScaledVector(inst.fallVel, dt);

      inst.fallEuler.x += (inst.fallAngVel.x + flutter * 1.15) * dt;
      inst.fallEuler.y += inst.fallAngVel.y * dt;
      inst.fallEuler.z += (inst.fallAngVel.z - flutter * 0.95) * dt;

      const floorY = 0.018;
      if (inst.fallPos.y <= floorY) {
        inst.fallPos.y = floorY;
        inst.fallState = 'settled';
        inst.fallTimer = 3.5 + inst.colorSeed * 3.5;
        inst.fallEuler.x = -Math.PI * 0.5 + (inst.colorSeed - 0.5) * 0.08;
        inst.fallEuler.z = (deterministicRand(inst.windPhase + 9) - 0.5) * 0.08;
      }
      return;
    }

    inst.fallTimer -= dt;
    if (inst.fallTimer < 0.8) {
      inst.fallOpacityScale = Math.max(0, inst.fallTimer / 0.8);
    }
    if (inst.fallTimer <= 0) {
      inst.fallState = 'attached';
      inst.fallOpacityScale = 0.01;
      inst.fallPos.copy(inst.treePos);
      inst.fallTimer = 2.8 + deterministicRand(elapsed + inst.colorSeed * 19) * 7.5;
    }
  }

  public dispose(): void {
    this.disposables.forEach((d) => d.dispose());
  }
}
