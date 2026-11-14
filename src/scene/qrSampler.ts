export type QrModuleRole = 'finder' | 'data';

export interface QrPixelModule {
  row: number;
  col: number;
  role: QrModuleRole;
  /** Normalized coordinate in [-0.5, 0.5] across the QR code body */
  nx: number;
  ny: number;
}

export interface QrSampleResult {
  gridSize: number;
  modules: QrPixelModule[];
  cardCanvas: HTMLCanvasElement;
  sourceUrl: string;
}

export const DEFAULT_QR_IMAGE_URL =
  '/assets/aistudio/https___github.com_WtecHtec_qr-botanical-morph_a81970a2.png';

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = url;
  });
}

function snapToQrVersionSize(raw: number): number {
  let best = Math.max(21, Math.round(raw));
  let bestDiff = Infinity;
  for (let v = 1; v <= 15; v++) {
    const candidate = 4 * v + 17;
    const diff = Math.abs(raw - candidate);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = candidate;
    }
  }
  // Only snap if reasonably close to a standard QR module count
  return bestDiff <= 1.6 ? best : Math.max(17, Math.round(raw));
}

export async function sampleQrFromImage(url: string = DEFAULT_QR_IMAGE_URL): Promise<QrSampleResult> {
  const img = await loadImage(url);

  const sampleWidth = Math.max(256, Math.min(768, img.naturalWidth || 512));
  const sampleHeight = Math.max(256, Math.min(768, img.naturalHeight || 512));

  const offscreen = document.createElement('canvas');
  offscreen.width = sampleWidth;
  offscreen.height = sampleHeight;
  const ctx = offscreen.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    throw new Error('Failed to create 2D canvas context for QR sampling.');
  }

  // Paint white background first in case PNG has transparent background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, sampleWidth, sampleHeight);
  ctx.drawImage(img, 0, 0, sampleWidth, sampleHeight);

  const imgData = ctx.getImageData(0, 0, sampleWidth, sampleHeight);
  const { data } = imgData;

  const isDarkPixel = (x: number, y: number): boolean => {
    const ix = Math.max(0, Math.min(sampleWidth - 1, Math.floor(x)));
    const iy = Math.max(0, Math.min(sampleHeight - 1, Math.floor(y)));
    const idx = (iy * sampleWidth + ix) * 4;
    const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
    return lum < 140;
  };

  // Find tight bounding box of dark QR modules
  let minX = sampleWidth;
  let maxX = -1;
  let minY = sampleHeight;
  let maxY = -1;

  for (let y = 0; y < sampleHeight; y++) {
    for (let x = 0; x < sampleWidth; x++) {
      if (isDarkPixel(x, y)) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX <= minX || maxY <= minY) {
    return buildFallbackQr(url);
  }

  const bboxW = maxX - minX + 1;
  const bboxH = maxY - minY + 1;

  // Measure the top-left 7-module finder pattern width across top rows
  let finderWidthSum = 0;
  let finderSamples = 0;
  const probeRows = Math.max(3, Math.floor(bboxH * 0.025));
  for (let dy = 1; dy <= probeRows; dy++) {
    const y = minY + dy;
    let runEnd = minX;
    while (runEnd <= maxX && isDarkPixel(runEnd, y)) {
      runEnd++;
    }
    const runLen = runEnd - minX;
    if (runLen > bboxW * 0.12 && runLen < bboxW * 0.4) {
      finderWidthSum += runLen;
      finderSamples++;
    }
  }

  let gridSize = 29;
  if (finderSamples > 0) {
    const avgFinderW = finderWidthSum / finderSamples;
    const estModulePx = avgFinderW / 7;
    if (estModulePx > 2) {
      gridSize = snapToQrVersionSize(bboxW / estModulePx);
    }
  }

  const cellW = bboxW / gridSize;
  const cellH = bboxH / gridSize;
  const modules: QrPixelModule[] = [];

  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const cx = minX + (col + 0.5) * cellW;
      const cy = minY + (row + 0.5) * cellH;

      // 5-point sub-sample around cell center for anti-aliased edge resilience
      let darkCount = 0;
      const offset = Math.max(0.5, Math.min(cellW, cellH) * 0.18);
      if (isDarkPixel(cx, cy)) darkCount++;
      if (isDarkPixel(cx - offset, cy)) darkCount++;
      if (isDarkPixel(cx + offset, cy)) darkCount++;
      if (isDarkPixel(cx, cy - offset)) darkCount++;
      if (isDarkPixel(cx, cy + offset)) darkCount++;

      if (darkCount >= 3) {
        const isTopLeftFinder = row < 7 && col < 7;
        const isTopRightFinder = row < 7 && col >= gridSize - 7;
        const isBottomLeftFinder = row >= gridSize - 7 && col < 7;
        const role: QrModuleRole =
          isTopLeftFinder || isTopRightFinder || isBottomLeftFinder ? 'finder' : 'data';

        const nx = (col + 0.5) / gridSize - 0.5;
        const ny = 0.5 - (row + 0.5) / gridSize; // +Y up in Three.js

        modules.push({ row, col, role, nx, ny });
      }
    }
  }

  if (modules.length < 40) {
    return buildFallbackQr(url);
  }

  // Create high-res crisp 2D QR card texture canvas (1024x1024)
  const cardCanvas = createCrispQrCardCanvas(img, minX, minY, bboxW, bboxH, sampleWidth, sampleHeight);

  return {
    gridSize,
    modules,
    cardCanvas,
    sourceUrl: url,
  };
}

function createCrispQrCardCanvas(
  img: HTMLImageElement,
  minX: number,
  minY: number,
  bboxW: number,
  bboxH: number,
  sampleW: number,
  sampleH: number
): HTMLCanvasElement {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // Clean archival gallery card background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, size, size);

  // Subtle quiet zone matching the 3D pixel plane margin (8% padding around QR body)
  const pad = size * 0.08;
  const drawSize = size - pad * 2;

  const srcX = (minX / sampleW) * (img.naturalWidth || sampleW);
  const srcY = (minY / sampleH) * (img.naturalHeight || sampleH);
  const srcW = (bboxW / sampleW) * (img.naturalWidth || sampleW);
  const srcH = (bboxH / sampleH) * (img.naturalHeight || sampleH);

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, srcX, srcY, srcW, srcH, pad, pad, drawSize, drawSize);

  return canvas;
}

function buildFallbackQr(sourceUrl: string): QrSampleResult {
  const gridSize = 25;
  const modules: QrPixelModule[] = [];
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 512, 512);
    ctx.fillStyle = '#141615';
  }

  const drawFinder = (r0: number, c0: number, r: number, c: number) => {
    const dr = r - r0;
    const dc = c - c0;
    if (dr < 0 || dr > 6 || dc < 0 || dc > 6) return false;
    return dr === 0 || dr === 6 || dc === 0 || dc === 6 || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4);
  };

  const pad = 512 * 0.08;
  const cell = (512 - pad * 2) / gridSize;

  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const f1 = drawFinder(0, 0, row, col);
      const f2 = drawFinder(0, gridSize - 7, row, col);
      const f3 = drawFinder(gridSize - 7, 0, row, col);
      const isFinder = f1 || f2 || f3;
      const pseudo = Math.sin(row * 12.9898 + col * 78.233) * 43758.5453;
      const isData = (pseudo - Math.floor(pseudo)) > 0.48;
      if (isFinder || isData) {
        modules.push({
          row,
          col,
          role: isFinder ? 'finder' : 'data',
          nx: (col + 0.5) / gridSize - 0.5,
          ny: 0.5 - (row + 0.5) / gridSize,
        });
        if (ctx) {
          ctx.fillRect(pad + col * cell, pad + row * cell, Math.ceil(cell), Math.ceil(cell));
        }
      }
    }
  }

  return { gridSize, modules, cardCanvas: canvas, sourceUrl };
}
