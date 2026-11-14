import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { SoundscapeEngine } from './audioEngine';
import {
  LeafMorphSystem,
  TOP_DOWN_CAM_Y,
  WindLevelId,
} from './leafMorphSystem';
import { MeadowSystem } from './meadowSystem';
import { QrSampleResult, sampleQrFromImage } from './qrSampler';
import { createProceduralTree, ProceduralTreeRig, SeasonId, TreeSpeciesId } from './treeGenerator';
import { WeatherModeId, WeatherSystem } from './weatherSystem';
import { WildlifeSystem } from './wildlifeSystem';
import {
  createBrowserExportSession,
  ExportOutputMode,
  PreparedExportBundle,
  probeExportSupport,
  VideoExportDirection,
} from '../utils/videoExportClient';

export type SceneMode = 'tree' | 'qr';
export type CameraViewId = 'side' | 'top';
export type { ExportOutputMode, VideoExportDirection };

export interface SceneCallbacks {
  onMorphProgress?: (progress: number) => void;
  onModeChange?: (mode: SceneMode) => void;
  onCameraViewChange?: (view: CameraViewId) => void;
  onReady?: (qrResult: QrSampleResult) => void;
  onError?: (message: string) => void;
  onContextLost?: (lost: boolean) => void;
}

const TREE_SIDE_CAM_POS = new THREE.Vector3(1.15, 2.75, 7.35);
const TREE_SIDE_CAM_TARGET = new THREE.Vector3(0, 2.05, 0);
const TREE_TOP_CAM_POS = new THREE.Vector3(0, TOP_DOWN_CAM_Y, 0.02);
const TREE_TOP_CAM_TARGET = new THREE.Vector3(0, 0, 0);
const QR_CAM_POS = new THREE.Vector3(0, 6.85, 0.02);
const QR_CAM_TARGET = new THREE.Vector3(0, 0, 0);

const SEASON_ATMOSPHERE: Record<
  SeasonId,
  { bg: number; floor: number; keyColor: number; keyIntensity: number; butterflyActivity: number }
> = {
  spring: {
    bg: 0xecf0e7,
    floor: 0xe3e8dc,
    keyColor: 0xfff5e4,
    keyIntensity: 2.1,
    butterflyActivity: 1.0,
  },
  summer: {
    bg: 0xeceae4,
    floor: 0xe5e3da,
    keyColor: 0xfff2dc,
    keyIntensity: 2.25,
    butterflyActivity: 0.9,
  },
  autumn: {
    bg: 0xf0e9de,
    floor: 0xe8dfd1,
    keyColor: 0xffe4bd,
    keyIntensity: 2.15,
    butterflyActivity: 0.45,
  },
  winter: {
    bg: 0xc9d4df,
    floor: 0xd9e1e8,
    keyColor: 0xeef5fc,
    keyIntensity: 1.75,
    butterflyActivity: 0.0,
  },
};

const WEATHER_ATMOSPHERE: Record<
  WeatherModeId,
  { bg?: number; floor?: number; keyIntensityMult: number; fogDensity: number }
> = {
  clear: {
    keyIntensityMult: 1.0,
    fogDensity: 0.022,
  },
  rain: {
    // Deep misty slate-blue sky so silver-blue rain streaks & ripples stand out clearly
    bg: 0x4f5d68,
    floor: 0x67737b,
    keyIntensityMult: 0.68,
    fogDensity: 0.032,
  },
  snow: {
    // Cool twilight winter-slate sky so luminous white snowflakes stand out vividly
    bg: 0x475566,
    floor: 0x7e8a97,
    keyIntensityMult: 0.78,
    fogDensity: 0.028,
  },
};

const _rayMouse = new THREE.Vector2();
const _targetBg = new THREE.Color();
const _targetFloor = new THREE.Color();
const _targetKey = new THREE.Color();

function detectSoftwareWebGL(): boolean {
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2') || probe.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 12, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(28, 30, 26, 0.36)');
  grad.addColorStop(0.5, 'rgba(28, 30, 26, 0.14)');
  grad.addColorStop(1, 'rgba(28, 30, 26, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class QrTreeScene {
  private readonly container: HTMLElement;
  private readonly callbacks: SceneCallbacks;
  private readonly isSoftwareGl: boolean;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly raycaster = new THREE.Raycaster();
  private readonly clock = new THREE.Clock();

  private readonly bgColor = new THREE.Color(SEASON_ATMOSPHERE.spring.bg);
  private readonly floorMat: THREE.MeshStandardMaterial;
  private readonly keyLight: THREE.DirectionalLight;
  private readonly fog: THREE.FogExp2;

  private treeRig: ProceduralTreeRig | null = null;
  private leafSystem: LeafMorphSystem | null = null;
  private wildlifeSystem: WildlifeSystem | null = null;
  private readonly meadowSystem: MeadowSystem;
  private readonly weatherSystem: WeatherSystem;
  private readonly audioEngine: SoundscapeEngine;

  private currentQrData: QrSampleResult | null = null;
  private hitProxies: THREE.Mesh[] = [];
  private contactShadowMesh: THREE.Mesh;
  private contactShadowMat: THREE.MeshBasicMaterial;

  private frameId = 0;
  private resizeObserver: ResizeObserver;
  private disposed = false;
  private isExporting = false;

  // Morph, camera & seasonal state
  private targetMorph = 1;
  private morphProgress = 0;
  private manualScrubbing = false;
  private activeMode: SceneMode = 'tree';
  private cameraView: CameraViewId = 'side';
  private cameraGoalActive = true;
  private desiredCamPos = QR_CAM_POS.clone();
  private desiredCamTarget = QR_CAM_TARGET.clone();

  private species: TreeSpeciesId = 'evergreen';
  private season: SeasonId = 'spring';
  private windLevel: WindLevelId = 'natural';
  private weatherMode: WeatherModeId = 'clear';
  private butterfliesEnabled = true;
  private birdsEnabled = true;

  // Pointer click vs drag tracking
  private pointerDownX = 0;
  private pointerDownY = 0;
  private lastHoverCheck = 0;
  private lastReportedMorph = -1;
  private entranceTimer: number | null = null;

  constructor(container: HTMLElement, callbacks: SceneCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.isSoftwareGl = detectSoftwareWebGL();

    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';

    container.appendChild(this.renderer.domElement);

    // Scene & horizon-matched fog
    this.scene = new THREE.Scene();
    this.scene.background = this.bgColor;
    this.fog = new THREE.FogExp2(SEASON_ATMOSPHERE.spring.bg, 0.022);
    this.scene.fog = this.fog;

    this.camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    this.updateResponsiveCameraFov(width, height);
    this.camera.position.copy(QR_CAM_POS);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = !this.isSoftwareGl;
    this.controls.dampingFactor = 0.065;
    this.controls.minDistance = 3.2;
    this.controls.maxDistance = 16;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.minPolarAngle = 0.002;
    this.controls.target.copy(QR_CAM_TARGET);
    this.controls.addEventListener('start', () => {
      this.cameraGoalActive = false;
    });

    // Mandatory studio environment map on every device
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    const roomEnv = new RoomEnvironment();
    this.scene.environment = pmremGenerator.fromScene(roomEnv, 0.04).texture;
    roomEnv.dispose();
    pmremGenerator.dispose();

    // 3-Point Warm/Cool Studio Lighting Rig
    const hemiLight = new THREE.HemisphereLight(0xdce8f2, 0xc7c0b2, 0.92);
    this.scene.add(hemiLight);

    this.keyLight = new THREE.DirectionalLight(SEASON_ATMOSPHERE.spring.keyColor, SEASON_ATMOSPHERE.spring.keyIntensity);
    this.keyLight.position.set(5.5, 9.8, 5.8);
    this.keyLight.castShadow = !this.isSoftwareGl;
    this.keyLight.shadow.mapSize.set(2048, 2048);
    this.keyLight.shadow.camera.near = 1;
    this.keyLight.shadow.camera.far = 26;
    const d = 6;
    this.keyLight.shadow.camera.left = -d;
    this.keyLight.shadow.camera.right = d;
    this.keyLight.shadow.camera.top = d;
    this.keyLight.shadow.camera.bottom = -d;
    this.keyLight.shadow.bias = -0.0005;
    this.keyLight.shadow.normalBias = 0.02;
    this.scene.add(this.keyLight);

    const rimLight = new THREE.DirectionalLight(0xe2f0ea, 0.95);
    rimLight.position.set(-5.0, 5.5, -5.5);
    this.scene.add(rimLight);

    // Matte gallery floor
    const floorGeom = new THREE.CircleGeometry(40, 64);
    floorGeom.rotateX(-Math.PI / 2);
    this.floorMat = new THREE.MeshStandardMaterial({
      color: SEASON_ATMOSPHERE.spring.floor,
      roughness: 0.92,
      metalness: 0.0,
    });
    const floorMesh = new THREE.Mesh(floorGeom, this.floorMat);
    floorMesh.receiveShadow = true;
    this.scene.add(floorMesh);

    // Soft radial contact shadow
    const shadowTex = createContactShadowTexture();
    const shadowGeom = new THREE.PlaneGeometry(6.4, 6.4);
    shadowGeom.rotateX(-Math.PI / 2);
    this.contactShadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    });
    this.contactShadowMesh = new THREE.Mesh(shadowGeom, this.contactShadowMat);
    this.contactShadowMesh.position.y = 0.002;
    this.scene.add(this.contactShadowMesh);

    // 4-tier realistic procedural tree rig
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.treeRig = createProceduralTree(maxAniso, this.species);
    this.treeRig.setGrowth(0);
    this.treeRig.setSeason(this.season);
    this.scene.add(this.treeRig.group);

    // Under-tree grass tufts & wildflowers
    this.meadowSystem = new MeadowSystem();
    this.meadowSystem.setSeason(this.season);
    this.scene.add(this.meadowSystem.group);

    // Colorful butterflies (under tree) & songbirds (in sky)
    this.wildlifeSystem = new WildlifeSystem(this.treeRig.perchPoints);
    this.wildlifeSystem.setSeasonActivity(SEASON_ATMOSPHERE[this.season].butterflyActivity);
    this.wildlifeSystem.setButterfliesEnabled(this.butterfliesEnabled);
    this.wildlifeSystem.setBirdsEnabled(this.birdsEnabled);
    this.scene.add(this.wildlifeSystem.group);

    // Rain & Snow weather system
    this.weatherSystem = new WeatherSystem();
    this.weatherSystem.setWeather(this.weatherMode);
    this.scene.add(this.weatherSystem.group);

    // Procedural Web Audio soundscape (birdsong + rain patter)
    this.audioEngine = new SoundscapeEngine();

    // Invisible collision proxies on raycaster layer 1
    const proxyMat = new THREE.MeshBasicMaterial({ visible: false });
    const floorProxy = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.25, 5.2), proxyMat);
    floorProxy.position.set(0, 0.1, 0);
    floorProxy.layers.set(1);

    const canopyProxy = new THREE.Mesh(new THREE.BoxGeometry(4.2, 4.4, 4.2), proxyMat);
    canopyProxy.position.set(0, 2.3, 0);
    canopyProxy.layers.set(1);

    this.hitProxies.push(floorProxy, canopyProxy);
    this.scene.add(floorProxy, canopyProxy);
    this.raycaster.layers.set(1);

    this.bindEvents();

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(container);

    this.loadQrImage().then(() => {
      if (this.disposed) return;
      if (!this.isSoftwareGl) {
        this.renderer.compile(this.scene, this.camera);
      }
      this.morphProgress = 0;
      this.targetMorph = 0;
      this.activeMode = 'qr';
      this.entranceTimer = window.setTimeout(() => {
        if (!this.disposed) {
          this.setMode('tree');
        }
      }, 600);

      this.tick();
    });
  }

  public async loadQrImage(url?: string): Promise<void> {
    try {
      const qrResult = await sampleQrFromImage(url);
      if (this.disposed || !this.treeRig) return;

      if (this.leafSystem) {
        this.scene.remove(this.leafSystem.instancedMesh);
        this.scene.remove(this.leafSystem.qrCardGroup);
        this.leafSystem.dispose();
        this.leafSystem = null;
      }

      const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
      this.leafSystem = new LeafMorphSystem(
        qrResult,
        this.treeRig.rootAnchors,
        maxAniso,
        this.species,
        this.season
      );
      this.leafSystem.setWindLevel(this.windLevel);

      this.scene.add(this.leafSystem.qrCardGroup);
      this.scene.add(this.leafSystem.instancedMesh);
      this.currentQrData = qrResult;
      this.callbacks.onReady?.(qrResult);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to parse QR code image.';
      this.callbacks.onError?.(msg);
    }
  }

  public unlockAudio(): void {
    this.audioEngine.unlock();
  }

  public setMuted(muted: boolean): void {
    this.audioEngine.unlock();
    this.audioEngine.setMuted(muted);
  }

  public setMode(mode: SceneMode): void {
    this.audioEngine.unlock();
    this.manualScrubbing = false;
    this.activeMode = mode;
    this.targetMorph = mode === 'tree' ? 1 : 0;
    this.audioEngine.setTreeActive(mode === 'tree');
    this.applyDesiredCamera();
    this.callbacks.onModeChange?.(mode);
  }

  public toggleMode(): void {
    this.setMode(this.activeMode === 'tree' ? 'qr' : 'tree');
  }

  public setCameraView(view: CameraViewId): void {
    this.audioEngine.unlock();
    this.cameraView = view;
    if (this.activeMode === 'qr' && view === 'top') {
      this.setMode('tree');
    } else {
      this.applyDesiredCamera();
    }
    this.callbacks.onCameraViewChange?.(view);
  }

  private applyDesiredCamera(): void {
    if (this.activeMode === 'qr') {
      this.desiredCamPos.copy(QR_CAM_POS);
      this.desiredCamTarget.copy(QR_CAM_TARGET);
    } else if (this.cameraView === 'top') {
      this.desiredCamPos.copy(TREE_TOP_CAM_POS);
      this.desiredCamTarget.copy(TREE_TOP_CAM_TARGET);
    } else {
      this.desiredCamPos.copy(TREE_SIDE_CAM_POS);
      this.desiredCamTarget.copy(TREE_SIDE_CAM_TARGET);
    }
    this.cameraGoalActive = true;
  }

  public setScrubProgress(value: number): void {
    this.audioEngine.unlock();
    this.manualScrubbing = true;
    const clamped = THREE.MathUtils.clamp(value, 0, 1);
    this.targetMorph = clamped;
    this.morphProgress = clamped;
    const inferredMode: SceneMode = clamped >= 0.5 ? 'tree' : 'qr';
    this.audioEngine.setTreeActive(inferredMode === 'tree');
    if (inferredMode !== this.activeMode) {
      this.activeMode = inferredMode;
      this.callbacks.onModeChange?.(inferredMode);
    }
  }

  public setSpecies(species: TreeSpeciesId): void {
    this.audioEngine.unlock();
    if (this.species === species) return;
    this.species = species;

    if (this.treeRig) {
      this.scene.remove(this.treeRig.group);
      this.treeRig.dispose();
    }

    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.treeRig = createProceduralTree(maxAniso, species);
    this.treeRig.setSeason(this.season);
    const woodGrowth = THREE.MathUtils.smoothstep(this.morphProgress, 0.04, 0.92);
    this.treeRig.setGrowth(woodGrowth);
    this.scene.add(this.treeRig.group);

    this.leafSystem?.setSpecies(species);
  }

  public setSeason(season: SeasonId): void {
    this.audioEngine.unlock();
    this.season = season;
    this.leafSystem?.setSeason(season);
    this.treeRig?.setSeason(season);
    this.meadowSystem.setSeason(season);
    this.wildlifeSystem?.setSeasonActivity(SEASON_ATMOSPHERE[season].butterflyActivity);
  }

  public setWindLevel(wind: WindLevelId): void {
    this.audioEngine.unlock();
    this.windLevel = wind;
    this.leafSystem?.setWindLevel(wind);
  }

  public setWeather(weather: WeatherModeId): void {
    this.audioEngine.unlock();
    this.weatherMode = weather;
    this.weatherSystem.setWeather(weather);
    this.audioEngine.setWeather(weather);
  }

  public setButterfliesEnabled(enabled: boolean): void {
    this.audioEngine.unlock();
    this.butterfliesEnabled = enabled;
    this.wildlifeSystem?.setButterfliesEnabled(enabled);
  }

  public setBirdsEnabled(enabled: boolean): void {
    this.audioEngine.unlock();
    this.birdsEnabled = enabled;
    this.wildlifeSystem?.setBirdsEnabled(enabled);
    this.audioEngine.setBirdsActive(enabled);
  }

  public resetCamera(): void {
    this.applyDesiredCamera();
  }

  public exportQrPng(): void {
    if (!this.currentQrData) return;
    const link = document.createElement('a');
    link.download = 'qr-code-2d.png';
    link.href = this.currentQrData.cardCanvas.toDataURL('image/png');
    link.click();
  }

  public async exportVideoClient(
    direction: VideoExportDirection,
    outputMode: ExportOutputMode = 'mp4',
    onProgress?: (stage: 'capturing' | 'encoding', pct: number) => void
  ): Promise<PreparedExportBundle> {
    if (this.disposed) {
      throw new Error('场景已释放，无法导出。');
    }

    const totalFrames = 90;
    const fps = 30;
    const dt = 1 / fps;
    const exportSize = 768;

    const caps = await probeExportSupport(outputMode, exportSize, exportSize, fps);

    const prevPixelRatio = this.renderer.getPixelRatio();
    const prevSize = new THREE.Vector2();
    this.renderer.getSize(prevSize);
    const prevAspect = this.camera.aspect;
    const prevFov = this.camera.fov;
    const prevDamping = this.controls.enableDamping;

    const prevMorph = this.morphProgress;
    const prevTargetMorph = this.targetMorph;
    const prevMode = this.activeMode;
    const prevCameraView = this.cameraView;
    const prevManual = this.manualScrubbing;
    const prevCamGoal = this.cameraGoalActive;
    const prevCamPos = this.camera.position.clone();
    const prevCamTarget = this.controls.target.clone();
    const prevBg = this.bgColor.clone();
    const prevFloor = this.floorMat.color.clone();
    const prevKeyColor = this.keyLight.color.clone();
    const prevKeyIntensity = this.keyLight.intensity;
    const prevFogDensity = this.fog.density;

    this.isExporting = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);

    const treeCamPos = new THREE.Vector3(1.05, 2.75, 7.65);
    const treeCamTarget = new THREE.Vector3(0, 2.05, 0);
    const qrCamPos = new THREE.Vector3(0, 7.6, 0.02);
    const qrCamTarget = new THREE.Vector3(0, 0, 0);

    let session: ReturnType<typeof createBrowserExportSession> | null = null;

    try {
      this.controls.enableDamping = false;
      this.renderer.setPixelRatio(1);
      this.renderer.setSize(exportSize, exportSize, false);
      this.camera.fov = 42;
      this.camera.aspect = 1;
      this.camera.updateProjectionMatrix();

      session = createBrowserExportSession(caps, outputMode, this.renderer.domElement, {
        width: exportSize,
        height: exportSize,
        fps,
      });

      const atm = SEASON_ATMOSPHERE[this.season];
      const wAtm = WEATHER_ATMOSPHERE[this.weatherMode];
      this.bgColor.setHex(wAtm.bg ?? atm.bg);
      this.fog.color.copy(this.bgColor);
      this.fog.density = wAtm.fogDensity;
      this.floorMat.color.setHex(wAtm.floor ?? atm.floor);
      this.keyLight.color.setHex(atm.keyColor);
      this.keyLight.intensity = atm.keyIntensity * wAtm.keyIntensityMult;

      this.leafSystem?.resetFallingState();

      const startTime = this.clock.getElapsedTime();
      if (this.weatherMode !== 'clear') {
        for (let w = 0; w < 24; w++) {
          this.weatherSystem.update(startTime + w * dt, dt);
        }
      }

      const holdStart = 12;
      const morphEnd = 74;

      for (let i = 0; i < totalFrames; i++) {
        if (this.disposed) {
          throw new Error('导出已中断');
        }

        let morph: number;
        let camT: number;

        if (i < holdStart) {
          morph = direction === 'tree-to-qr' ? 1 : 0;
          camT = direction === 'tree-to-qr' ? 1 : 0;
        } else if (i < morphEnd) {
          const u = (i - holdStart) / (morphEnd - holdStart - 1);
          const smooth = u * u * (3 - 2 * u);
          morph = direction === 'tree-to-qr' ? 1 - smooth : smooth;
          camT = morph;
        } else {
          morph = direction === 'tree-to-qr' ? 0 : 1;
          camT = morph;
        }

        const arcLift = Math.sin(camT * Math.PI) * 1.15;
        this.camera.position.lerpVectors(qrCamPos, treeCamPos, camT);
        this.camera.position.y += arcLift;
        this.controls.target.lerpVectors(qrCamTarget, treeCamTarget, camT);
        this.controls.update();

        const simElapsed = startTime + (i + 25) * dt;
        if (this.treeRig) {
          const woodGrowth = THREE.MathUtils.smoothstep(morph, 0.04, 0.92);
          this.treeRig.setGrowth(woodGrowth);
        }
        this.contactShadowMat.opacity = THREE.MathUtils.lerp(0.24, 0.42, morph);

        this.leafSystem?.update(morph, simElapsed, dt);
        this.meadowSystem.update(morph, simElapsed);
        this.wildlifeSystem?.update(morph, simElapsed);
        this.weatherSystem.update(simElapsed, dt);

        this.renderer.render(this.scene, this.camera);
        await session.pushFrame(this.renderer.domElement, i, outputMode === 'live-pair' && i === 0);

        if (i % 3 === 0 || i === totalFrames - 1) {
          onProgress?.('capturing', Math.round(((i + 1) / totalFrames) * 100));
          await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
        }
      }

      onProgress?.('encoding', 100);
      return await session.finalize(direction);
    } catch (err) {
      session?.abort();
      throw err;
    } finally {
      this.controls.enableDamping = prevDamping;
      this.renderer.setPixelRatio(prevPixelRatio);
      this.renderer.setSize(prevSize.x, prevSize.y, false);
      this.camera.fov = prevFov;
      this.camera.aspect = prevAspect;
      this.camera.updateProjectionMatrix();

      this.camera.position.copy(prevCamPos);
      this.controls.target.copy(prevCamTarget);
      this.controls.update();

      this.morphProgress = prevMorph;
      this.targetMorph = prevTargetMorph;
      this.activeMode = prevMode;
      this.cameraView = prevCameraView;
      this.manualScrubbing = prevManual;
      this.cameraGoalActive = prevCamGoal;

      this.bgColor.copy(prevBg);
      this.fog.color.copy(prevBg);
      this.fog.density = prevFogDensity;
      this.floorMat.color.copy(prevFloor);
      this.keyLight.color.copy(prevKeyColor);
      this.keyLight.intensity = prevKeyIntensity;

      this.leafSystem?.resetFallingState();
      if (this.isExporting) {
        this.isExporting = false;
        this.clock.getDelta();
        if (!this.disposed) {
          this.tick();
        }
      }
    }
  }

  private bindEvents(): void {
    const dom = this.renderer.domElement;
    dom.addEventListener('pointerdown', this.onPointerDown);
    dom.addEventListener('pointerup', this.onPointerUp);
    dom.addEventListener('pointermove', this.onPointerMove);
    dom.addEventListener('webglcontextlost', this.onContextLost);
    dom.addEventListener('webglcontextrestored', this.onContextRestored);
  }

  private onContextLost = (e: Event): void => {
    e.preventDefault();
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    this.callbacks.onContextLost?.(true);
  };

  private onContextRestored = (): void => {
    this.callbacks.onContextLost?.(false);
    this.tick();
  };

  private onPointerDown = (e: PointerEvent): void => {
    this.audioEngine.unlock();
    this.pointerDownX = e.clientX;
    this.pointerDownY = e.clientY;
  };

  private onPointerUp = (e: PointerEvent): void => {
    const dist = Math.hypot(e.clientX - this.pointerDownX, e.clientY - this.pointerDownY);
    if (dist > 6) return;

    const rect = this.renderer.domElement.getBoundingClientRect();
    _rayMouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    _rayMouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(_rayMouse, this.camera);
    const hits = this.raycaster.intersectObjects(this.hitProxies, false);
    if (hits.length > 0) {
      this.toggleMode();
    }
  };

  private onPointerMove = (e: PointerEvent): void => {
    const now = performance.now();
    if (now - this.lastHoverCheck < 50) return;
    this.lastHoverCheck = now;

    const rect = this.renderer.domElement.getBoundingClientRect();
    _rayMouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    _rayMouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(_rayMouse, this.camera);
    const hits = this.raycaster.intersectObjects(this.hitProxies, false);
    this.renderer.domElement.style.cursor = hits.length > 0 ? 'pointer' : 'grab';
  };

  private updateResponsiveCameraFov(width: number, height: number): void {
    const aspect = width / Math.max(1, height);
    const targetFov = aspect < 0.9 ? THREE.MathUtils.clamp(42 + (0.9 - aspect) * 44, 42, 64) : 42;
    this.camera.fov = targetFov;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  private handleResize(): void {
    if (this.disposed) return;
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.updateResponsiveCameraFov(width, height);
    this.renderer.setSize(width, height);
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (!gl || typeof gl.fenceSync !== 'function') {
      this.frameId = window.setTimeout(cb, 80);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) return;
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private tick = (): void => {
    if (this.disposed || this.isExporting) return;

    const delta = Math.min(this.clock.getDelta(), 0.05);
    const elapsed = this.clock.getElapsedTime();

    if (!this.manualScrubbing) {
      const diff = Math.abs(this.targetMorph - this.morphProgress);
      if (diff > 0.0005) {
        this.morphProgress = THREE.MathUtils.damp(this.morphProgress, this.targetMorph, 1.85, delta);
      } else {
        this.morphProgress = this.targetMorph;
      }
    }

    if (Math.abs(this.morphProgress - this.lastReportedMorph) > 0.004) {
      this.lastReportedMorph = this.morphProgress;
      this.callbacks.onMorphProgress?.(this.morphProgress);
    }

    // Smooth atmospheric color transitions combining Season + Weather contrast
    const atm = SEASON_ATMOSPHERE[this.season];
    const wAtm = WEATHER_ATMOSPHERE[this.weatherMode];
    const colorLerp = 1 - Math.exp(-3.2 * delta);
    _targetBg.setHex(wAtm.bg ?? atm.bg);
    _targetFloor.setHex(wAtm.floor ?? atm.floor);
    _targetKey.setHex(atm.keyColor);

    this.bgColor.lerp(_targetBg, colorLerp);
    this.fog.color.copy(this.bgColor);
    this.fog.density = THREE.MathUtils.damp(this.fog.density, wAtm.fogDensity, 3.0, delta);
    this.floorMat.color.lerp(_targetFloor, colorLerp);
    this.keyLight.color.lerp(_targetKey, colorLerp);
    this.keyLight.intensity = THREE.MathUtils.damp(
      this.keyLight.intensity,
      atm.keyIntensity * wAtm.keyIntensityMult,
      3.0,
      delta
    );

    // Smooth camera choreography
    if (this.cameraGoalActive) {
      this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, this.desiredCamPos.x, 3.6, delta);
      this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, this.desiredCamPos.y, 3.6, delta);
      this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, this.desiredCamPos.z, 3.6, delta);

      this.controls.target.x = THREE.MathUtils.damp(this.controls.target.x, this.desiredCamTarget.x, 4.0, delta);
      this.controls.target.y = THREE.MathUtils.damp(this.controls.target.y, this.desiredCamTarget.y, 4.0, delta);
      this.controls.target.z = THREE.MathUtils.damp(this.controls.target.z, this.desiredCamTarget.z, 4.0, delta);

      if (
        this.camera.position.distanceTo(this.desiredCamPos) < 0.01 &&
        this.controls.target.distanceTo(this.desiredCamTarget) < 0.01
      ) {
        this.cameraGoalActive = false;
      }
    }

    this.controls.update();

    if (this.treeRig) {
      const woodGrowth = THREE.MathUtils.smoothstep(this.morphProgress, 0.04, 0.92);
      this.treeRig.setGrowth(woodGrowth);
    }

    this.contactShadowMat.opacity = THREE.MathUtils.lerp(0.24, 0.42, this.morphProgress);

    this.leafSystem?.update(this.morphProgress, elapsed, delta);
    this.meadowSystem.update(this.morphProgress, elapsed);
    this.wildlifeSystem?.update(this.morphProgress, elapsed);
    this.weatherSystem.update(elapsed, delta);

    this.renderer.render(this.scene, this.camera);

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  public dispose(): void {
    this.disposed = true;
    if (this.entranceTimer !== null) {
      clearTimeout(this.entranceTimer);
    }
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    this.resizeObserver.disconnect();

    const dom = this.renderer.domElement;
    dom.removeEventListener('pointerdown', this.onPointerDown);
    dom.removeEventListener('pointerup', this.onPointerUp);
    dom.removeEventListener('pointermove', this.onPointerMove);
    dom.removeEventListener('webglcontextlost', this.onContextLost);
    dom.removeEventListener('webglcontextrestored', this.onContextRestored);

    this.controls.dispose();
    this.treeRig?.dispose();
    this.leafSystem?.dispose();
    this.meadowSystem.dispose();
    this.wildlifeSystem?.dispose();
    this.weatherSystem.dispose();
    this.audioEngine.dispose();
    this.hitProxies.forEach((m) => m.geometry.dispose());
    if (this.hitProxies[0]) {
      (this.hitProxies[0].material as THREE.Material).dispose();
    }
    this.contactShadowMesh.geometry.dispose();
    this.contactShadowMat.map?.dispose();
    this.contactShadowMat.dispose();
    this.floorMat.dispose();
    this.scene.environment?.dispose();
    this.renderer.dispose();

    if (dom.parentElement === this.container) {
      this.container.removeChild(dom);
    }
  }
}
