import * as THREE from 'three';

export type WeatherModeId = 'clear' | 'rain' | 'snow';

interface RippleState {
  x: number;
  z: number;
  age: number;
  maxAge: number;
}

const _mat4 = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
const _scale = new THREE.Vector3();

function createSnowflakeTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
  grad.addColorStop(0.45, 'rgba(245, 250, 255, 0.8)');
  grad.addColorStop(1, 'rgba(240, 248, 255, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function deterministicRand(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export class WeatherSystem {
  public readonly group = new THREE.Group();

  private weather: WeatherModeId = 'clear';
  private readonly disposables: Array<{ dispose: () => void }> = [];

  // Rain
  private readonly rainCount = 860;
  private readonly rainPositions: Float32Array;
  private readonly rainGeom: THREE.BufferGeometry;
  private readonly rainMat: THREE.LineBasicMaterial;
  private readonly rainLines: THREE.LineSegments;
  private readonly rainSpeeds: Float32Array;

  // Rain ground ripples
  private readonly rippleCount = 36;
  private readonly ripples: RippleState[] = [];
  private readonly rippleMesh: THREE.InstancedMesh;
  private readonly rippleMat: THREE.MeshBasicMaterial;

  // Snow
  private readonly snowCount = 920;
  private readonly snowPositions: Float32Array;
  private readonly snowGeom: THREE.BufferGeometry;
  private readonly snowMat: THREE.PointsMaterial;
  private readonly snowPoints: THREE.Points;
  private readonly snowPhases: Float32Array;
  private readonly snowSpeeds: Float32Array;

  constructor() {
    // 1. Fine Rain Streaks
    this.rainPositions = new Float32Array(this.rainCount * 6);
    this.rainSpeeds = new Float32Array(this.rainCount);
    for (let i = 0; i < this.rainCount; i++) {
      const x = (deterministicRand(i * 3 + 1) - 0.5) * 11.5;
      const y = deterministicRand(i * 3 + 2) * 8.2;
      const z = (deterministicRand(i * 3 + 3) - 0.5) * 11.5;
      this.rainSpeeds[i] = 7.2 + deterministicRand(i * 7) * 3.0;
      this.setRainSegment(i, x, y, z);
    }

    this.rainGeom = new THREE.BufferGeometry();
    this.rainGeom.setAttribute('position', new THREE.BufferAttribute(this.rainPositions, 3));
    this.rainMat = new THREE.LineBasicMaterial({
      color: 0xdcecf5,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
    });
    this.rainLines = new THREE.LineSegments(this.rainGeom, this.rainMat);
    this.rainLines.frustumCulled = false;
    this.rainLines.visible = false;
    this.group.add(this.rainLines);
    this.disposables.push(this.rainGeom, this.rainMat);

    // 2. Crisp Floor Rain Splash Ripples
    const rippleGeom = new THREE.RingGeometry(0.74, 1.0, 24);
    this.rippleMat = new THREE.MeshBasicMaterial({
      color: 0xd8eaf5,
      transparent: true,
      opacity: 0.48,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.rippleMesh = new THREE.InstancedMesh(rippleGeom, this.rippleMat, this.rippleCount);
    this.rippleMesh.frustumCulled = false;
    this.rippleMesh.visible = false;
    this.group.add(this.rippleMesh);
    this.disposables.push(rippleGeom, this.rippleMat);

    for (let i = 0; i < this.rippleCount; i++) {
      this.ripples.push({
        x: (deterministicRand(i * 11 + 1) - 0.5) * 8.5,
        z: (deterministicRand(i * 11 + 2) - 0.5) * 8.5,
        age: (i / this.rippleCount) * 0.75,
        maxAge: 0.5 + deterministicRand(i * 11 + 3) * 0.35,
      });
    }

    // 3. Fine Snow Particles
    this.snowPositions = new Float32Array(this.snowCount * 3);
    this.snowPhases = new Float32Array(this.snowCount);
    this.snowSpeeds = new Float32Array(this.snowCount);

    for (let i = 0; i < this.snowCount; i++) {
      this.snowPositions[i * 3] = (deterministicRand(i * 5 + 1) - 0.5) * 11.5;
      this.snowPositions[i * 3 + 1] = deterministicRand(i * 5 + 2) * 8.0;
      this.snowPositions[i * 3 + 2] = (deterministicRand(i * 5 + 3) - 0.5) * 11.5;
      this.snowPhases[i] = deterministicRand(i * 5 + 4) * Math.PI * 2;
      this.snowSpeeds[i] = 0.58 + deterministicRand(i * 5 + 5) * 0.58;
    }

    const snowTex = createSnowflakeTexture();
    this.snowGeom = new THREE.BufferGeometry();
    this.snowGeom.setAttribute('position', new THREE.BufferAttribute(this.snowPositions, 3));
    this.snowMat = new THREE.PointsMaterial({
      color: 0xffffff,
      map: snowTex,
      size: 0.145,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.94,
      depthWrite: false,
    });
    this.snowPoints = new THREE.Points(this.snowGeom, this.snowMat);
    this.snowPoints.frustumCulled = false;
    this.snowPoints.visible = false;
    this.group.add(this.snowPoints);
    this.disposables.push(snowTex, this.snowGeom, this.snowMat);
  }

  private setRainSegment(idx: number, x: number, y: number, z: number): void {
    const base = idx * 6;
    const streakLen = 0.44;
    const slantX = 0.032;
    this.rainPositions[base] = x;
    this.rainPositions[base + 1] = y;
    this.rainPositions[base + 2] = z;
    this.rainPositions[base + 3] = x - slantX;
    this.rainPositions[base + 4] = y + streakLen;
    this.rainPositions[base + 5] = z;
  }

  public setWeather(mode: WeatherModeId): void {
    this.weather = mode;
    this.rainLines.visible = mode === 'rain';
    this.rippleMesh.visible = mode === 'rain';
    this.snowPoints.visible = mode === 'snow';
  }

  public update(elapsed: number, delta: number): void {
    const dt = Math.min(delta, 0.05);

    if (this.weather === 'rain') {
      const posAttr = this.rainGeom.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < this.rainCount; i++) {
        const base = i * 6;
        let x = this.rainPositions[base] + 0.55 * dt;
        let y = this.rainPositions[base + 1] - this.rainSpeeds[i] * dt;
        const z = this.rainPositions[base + 2];

        if (y < 0.0) {
          y = 7.6 + deterministicRand(elapsed + i) * 0.6;
          x = (deterministicRand(i * 9 + elapsed) - 0.5) * 11.0;
        }
        this.setRainSegment(i, x, y, z);
      }
      posAttr.needsUpdate = true;

      for (let i = 0; i < this.rippleCount; i++) {
        const rip = this.ripples[i];
        rip.age += dt;
        if (rip.age >= rip.maxAge) {
          rip.age = 0;
          rip.x = (deterministicRand(elapsed * 7 + i * 13) - 0.5) * 8.5;
          rip.z = (deterministicRand(elapsed * 11 + i * 17) - 0.5) * 8.5;
        }
        const t = rip.age / rip.maxAge;
        const rad = 0.02 + t * 0.11;
        const fade = 1 - t;
        _pos.set(rip.x, 0.019, rip.z);
        _scale.set(rad * fade, rad * fade, 1);
        _mat4.compose(_pos, _quat, _scale);
        this.rippleMesh.setMatrixAt(i, _mat4);
      }
      this.rippleMesh.instanceMatrix.needsUpdate = true;
    } else if (this.weather === 'snow') {
      const posAttr = this.snowGeom.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < this.snowCount; i++) {
        const base = i * 3;
        const phase = this.snowPhases[i];
        let x = this.snowPositions[base] + Math.sin(elapsed * 0.9 + phase) * 0.38 * dt + 0.08 * dt;
        let y = this.snowPositions[base + 1] - this.snowSpeeds[i] * dt;
        let z = this.snowPositions[base + 2] + Math.cos(elapsed * 0.75 + phase) * 0.34 * dt;

        if (y < 0.02) {
          y = 7.6;
          x = (deterministicRand(i * 17 + elapsed) - 0.5) * 11.5;
          z = (deterministicRand(i * 23 + elapsed) - 0.5) * 11.5;
        }
        this.snowPositions[base] = x;
        this.snowPositions[base + 1] = y;
        this.snowPositions[base + 2] = z;
      }
      posAttr.needsUpdate = true;
    }
  }

  public dispose(): void {
    this.disposables.forEach((d) => d.dispose());
  }
}
