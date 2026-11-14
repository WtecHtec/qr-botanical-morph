import * as THREE from 'three';

interface ButterflyEntity {
  group: THREE.Group;
  leftWing: THREE.Mesh;
  rightWing: THREE.Mesh;
  orbitRadius: number;
  orbitSpeed: number;
  baseHeight: number;
  heightAmp: number;
  phase: number;
  flapSpeed: number;
}

interface BirdEntity {
  group: THREE.Group;
  leftWing: THREE.Group;
  rightWing: THREE.Group;
  head: THREE.Group;
  mode: 'flying' | 'perched';
  perchPos: THREE.Vector3;
  perchYaw: number;
  orbitRadius: number;
  orbitSpeed: number;
  baseHeight: number;
  phase: number;
}

const _pos = new THREE.Vector3();
const _nextPos = new THREE.Vector3();

function createButterflyWingGeometry(): THREE.BufferGeometry {
  // Forewing + hindwing graceful silhouette on +X side (hinged at x = 0)
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.012);
  shape.bezierCurveTo(0.042, 0.095, 0.118, 0.105, 0.138, 0.045);
  shape.bezierCurveTo(0.145, 0.008, 0.108, -0.018, 0.068, -0.022);
  shape.bezierCurveTo(0.11, -0.04, 0.102, -0.102, 0.048, -0.106);
  shape.bezierCurveTo(0.015, -0.108, 0.003, -0.056, 0, -0.014);
  shape.closePath();

  const geom = new THREE.ShapeGeometry(shape, 10);
  geom.rotateX(-Math.PI / 2);
  return geom;
}

function createButterflyWingTexture(
  primary: string,
  mid: string,
  accent: string,
  spotColor: string
): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Rich multi-stop iridescent gradient across the wing
  const grad = ctx.createRadialGradient(18, 64, 4, 68, 64, 92);
  grad.addColorStop(0, primary);
  grad.addColorStop(0.45, mid);
  grad.addColorStop(0.84, accent);
  grad.addColorStop(1, '#1a1816');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // Iridescent shimmer band
  const band = ctx.createLinearGradient(0, 20, 120, 108);
  band.addColorStop(0, 'rgba(255,255,255,0)');
  band.addColorStop(0.45, 'rgba(255,255,255,0.22)');
  band.addColorStop(0.55, 'rgba(255,255,255,0.06)');
  band.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = band;
  ctx.fillRect(0, 0, size, size);

  // Delicate dark wing veins
  ctx.strokeStyle = 'rgba(20, 18, 16, 0.58)';
  ctx.lineWidth = 2.6;
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.moveTo(6, 64);
    ctx.quadraticCurveTo(54, 24 + i * 16, 120, 14 + i * 20);
    ctx.stroke();
  }

  // Colorful eye-spots & pearl edge dots
  ctx.fillStyle = spotColor;
  [24, 44, 64, 84, 104].forEach((y, idx) => {
    ctx.beginPath();
    ctx.arc(108 - (idx % 2) * 8, y, idx % 2 === 0 ? 5.5 : 3.8, 0, Math.PI * 2);
    ctx.fill();
  });

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class WildlifeSystem {
  public readonly group = new THREE.Group();

  private readonly butterflies: ButterflyEntity[] = [];
  private readonly birds: BirdEntity[] = [];
  private readonly disposables: Array<{ dispose: () => void }> = [];
  private butterfliesEnabled = true;
  private birdsEnabled = true;
  private seasonMultiplier = 1.0;

  constructor(perchPoints: THREE.Vector3[]) {
    this.buildButterflies();
    this.buildBirds(perchPoints);
  }

  private buildButterflies(): void {
    const rightWingGeom = createButterflyWingGeometry();
    const leftWingGeom = rightWingGeom.clone();
    leftWingGeom.scale(-1, 1, 1);

    const bodyGeom = new THREE.CapsuleGeometry(0.008, 0.05, 4, 6);
    bodyGeom.rotateX(Math.PI / 2);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x22201e, roughness: 0.7 });
    this.disposables.push(rightWingGeom, leftWingGeom, bodyGeom, bodyMat);

    // 8 vibrant multi-colored butterflies fluttering low beneath the canopy among wildflowers
    const paletteSpecs = [
      { primary: '#ffea00', mid: '#ff7b00', accent: '#d62828', spot: '#fff8e7', r: 1.05, h: 0.42, speed: 0.64 },
      { primary: '#72efdd', mid: '#00b4d8', accent: '#3a0ca3', spot: '#e0fbfc', r: 1.48, h: 0.68, speed: 0.54 },
      { primary: '#ff99c8', mid: '#f15bb5', accent: '#7209b7', spot: '#fff0f6', r: 0.92, h: 0.54, speed: 0.71 },
      { primary: '#b5e48c', mid: '#52b788', accent: '#1b4332', spot: '#f4fce3', r: 1.68, h: 0.88, speed: 0.48 },
      { primary: '#ffd166', mid: '#ef476f', accent: '#8338ec', spot: '#ffffff', r: 1.24, h: 0.76, speed: -0.58 },
      { primary: '#80ffdb', mid: '#56cfe1', accent: '#5e60ce', spot: '#fff3b0', r: 1.82, h: 0.52, speed: -0.45 },
      { primary: '#ffbe0b', mid: '#fb5607', accent: '#ff006e', spot: '#fff8e7', r: 1.36, h: 1.04, speed: 0.51 },
      { primary: '#e0aaff', mid: '#9d4edd', accent: '#3c096c', spot: '#ffd6ff', r: 1.16, h: 0.94, speed: -0.62 },
    ];

    paletteSpecs.forEach((spec, i) => {
      const tex = createButterflyWingTexture(spec.primary, spec.mid, spec.accent, spec.spot);
      const wingMat = new THREE.MeshStandardMaterial({
        map: tex,
        emissive: new THREE.Color(spec.mid),
        emissiveIntensity: 0.16,
        roughness: 0.45,
        metalness: 0.08,
        side: THREE.DoubleSide,
      });
      this.disposables.push(tex, wingMat);

      const bGroup = new THREE.Group();
      const body = new THREE.Mesh(bodyGeom, bodyMat);
      const leftWing = new THREE.Mesh(leftWingGeom, wingMat);
      const rightWing = new THREE.Mesh(rightWingGeom, wingMat);

      bGroup.add(body, leftWing, rightWing);
      this.group.add(bGroup);

      this.butterflies.push({
        group: bGroup,
        leftWing,
        rightWing,
        orbitRadius: spec.r,
        orbitSpeed: spec.speed,
        baseHeight: spec.h,
        heightAmp: 0.16 + (i % 3) * 0.07,
        phase: i * 1.15,
        flapSpeed: 13.0 + (i % 4) * 1.6,
      });
    });
  }

  private buildBirds(_perchPoints: THREE.Vector3[]): void {
    const bodyProfile = [
      new THREE.Vector2(0.0, -0.11),
      new THREE.Vector2(0.032, -0.07),
      new THREE.Vector2(0.052, -0.01),
      new THREE.Vector2(0.048, 0.05),
      new THREE.Vector2(0.025, 0.095),
      new THREE.Vector2(0.0, 0.11),
    ];
    const bodyGeom = new THREE.LatheGeometry(bodyProfile, 12);
    bodyGeom.rotateX(Math.PI / 2);

    const headGeom = new THREE.SphereGeometry(0.032, 10, 10);
    const beakGeom = new THREE.ConeGeometry(0.011, 0.034, 6);
    beakGeom.rotateX(Math.PI / 2);

    const tailGeom = new THREE.BoxGeometry(0.042, 0.008, 0.11);
    tailGeom.translate(0, 0, -0.055);

    const wingShape = new THREE.Shape();
    wingShape.moveTo(0, 0.02);
    wingShape.quadraticCurveTo(0.08, 0.05, 0.18, 0.01);
    wingShape.quadraticCurveTo(0.14, -0.045, 0.0, -0.04);
    wingShape.closePath();
    const rightWingGeom = new THREE.ShapeGeometry(wingShape, 8);
    rightWingGeom.rotateX(-Math.PI / 2);
    const leftWingGeom = rightWingGeom.clone();
    leftWingGeom.scale(-1, 1, 1);

    const beakMat = new THREE.MeshStandardMaterial({ color: 0xd99b3c, roughness: 0.5 });

    this.disposables.push(
      bodyGeom,
      headGeom,
      beakGeom,
      tailGeom,
      rightWingGeom,
      leftWingGeom,
      beakMat
    );

    const birdColors = [
      { body: 0x5c768d, wing: 0x3f5366 },
      { body: 0x8f5b3e, wing: 0x693f28 },
      { body: 0x76856e, wing: 0x53614d },
      { body: 0x667385, wing: 0x455061 },
    ];

    birdColors.forEach((col, i) => {
      const bodyMat = new THREE.MeshStandardMaterial({ color: col.body, roughness: 0.68 });
      const wingMat = new THREE.MeshStandardMaterial({
        color: col.wing,
        roughness: 0.65,
        side: THREE.DoubleSide,
      });
      this.disposables.push(bodyMat, wingMat);

      const birdGroup = new THREE.Group();
      const body = new THREE.Mesh(bodyGeom, bodyMat);
      body.castShadow = true;

      const tail = new THREE.Mesh(tailGeom, wingMat);
      tail.position.set(0, 0.01, -0.085);
      tail.rotation.x = 0.22;

      const headGroup = new THREE.Group();
      headGroup.position.set(0, 0.055, 0.085);
      const head = new THREE.Mesh(headGeom, bodyMat);
      const beak = new THREE.Mesh(beakGeom, beakMat);
      beak.position.set(0, -0.004, 0.036);
      headGroup.add(head, beak);

      const leftWingGroup = new THREE.Group();
      leftWingGroup.position.set(-0.03, 0.025, 0.01);
      const leftWing = new THREE.Mesh(leftWingGeom, wingMat);
      leftWingGroup.add(leftWing);

      const rightWingGroup = new THREE.Group();
      rightWingGroup.position.set(0.03, 0.025, 0.01);
      const rightWing = new THREE.Mesh(rightWingGeom, wingMat);
      rightWingGroup.add(rightWing);

      birdGroup.add(body, tail, headGroup, leftWingGroup, rightWingGroup);
      this.group.add(birdGroup);

      this.birds.push({
        group: birdGroup,
        leftWing: leftWingGroup,
        rightWing: rightWingGroup,
        head: headGroup,
        mode: 'flying',
        perchPos: new THREE.Vector3(),
        perchYaw: 0,
        orbitRadius: 2.55 + i * 0.52,
        orbitSpeed: (i % 2 === 0 ? 1 : -1) * (0.36 + i * 0.06),
        baseHeight: 4.55 + i * 0.42,
        phase: i * 1.8,
      });
    });
  }

  public setButterfliesEnabled(enabled: boolean): void {
    this.butterfliesEnabled = enabled;
  }

  public setBirdsEnabled(enabled: boolean): void {
    this.birdsEnabled = enabled;
  }

  public setSeasonActivity(activity: number): void {
    this.seasonMultiplier = activity;
  }

  public update(morphProgress: number, elapsed: number): void {
    const anyEnabled = this.butterfliesEnabled || this.birdsEnabled;
    const showFactor = anyEnabled ? THREE.MathUtils.smoothstep(morphProgress, 0.55, 0.96) : 0;
    this.group.visible = showFactor > 0.01;
    if (!this.group.visible) return;

    const butterflyScale = this.butterfliesEnabled ? showFactor * this.seasonMultiplier : 0;

    for (let i = 0; i < this.butterflies.length; i++) {
      const b = this.butterflies[i];
      b.group.visible = butterflyScale > 0.05;
      if (!b.group.visible) continue;

      const t = elapsed * b.orbitSpeed + b.phase;
      const r = b.orbitRadius + Math.sin(t * 1.7) * 0.32;
      _pos.set(
        Math.cos(t) * r,
        b.baseHeight + Math.sin(t * 2.3) * b.heightAmp,
        Math.sin(t) * r + Math.sin(t * 1.3) * 0.35
      );

      const dt = 0.04;
      const tNext = t + dt * b.orbitSpeed;
      const rNext = b.orbitRadius + Math.sin(tNext * 1.7) * 0.32;
      _nextPos.set(
        Math.cos(tNext) * rNext,
        b.baseHeight + Math.sin(tNext * 2.3) * b.heightAmp,
        Math.sin(tNext) * rNext + Math.sin(tNext * 1.3) * 0.35
      );

      b.group.position.copy(_pos);
      b.group.lookAt(_nextPos);
      b.group.scale.setScalar(butterflyScale);

      const flap = Math.sin(elapsed * b.flapSpeed + b.phase) * 0.95 + 0.15;
      b.leftWing.rotation.z = -flap;
      b.rightWing.rotation.z = flap;
    }

    const birdScale = this.birdsEnabled ? showFactor : 0;

    for (let i = 0; i < this.birds.length; i++) {
      const bird = this.birds[i];
      bird.group.visible = birdScale > 0.05;
      if (!bird.group.visible) continue;

      bird.group.scale.setScalar(birdScale);

      if (bird.mode === 'perched') {
        bird.group.position.copy(bird.perchPos);
        bird.group.rotation.set(0.08, bird.perchYaw, 0);
        bird.head.rotation.y = Math.sin(elapsed * 1.6 + bird.phase) * 0.55;
        bird.head.rotation.x = Math.sin(elapsed * 2.8 + bird.phase) * 0.14;
        bird.leftWing.rotation.z = 0.38;
        bird.rightWing.rotation.z = -0.38;
      } else {
        const t = elapsed * bird.orbitSpeed + bird.phase;
        const r = bird.orbitRadius + Math.sin(t * 0.9) * 0.35;
        _pos.set(
          Math.cos(t) * r,
          bird.baseHeight + Math.sin(t * 1.6) * 0.28,
          Math.sin(t) * r
        );
        const tNext = t + 0.05;
        const rNext = bird.orbitRadius + Math.sin(tNext * 0.9) * 0.35;
        _nextPos.set(
          Math.cos(tNext) * rNext,
          bird.baseHeight + Math.sin(tNext * 1.6) * 0.28,
          Math.sin(tNext) * rNext
        );

        bird.group.position.copy(_pos);
        bird.group.lookAt(_nextPos);
        bird.group.rotateZ(0.24);

        const cycle = (elapsed * 1.4 + bird.phase) % 2.8;
        const flap = cycle < 1.8 ? Math.sin(elapsed * 11.5 + bird.phase) * 0.65 : 0.08;
        bird.leftWing.rotation.z = -flap;
        bird.rightWing.rotation.z = flap;
      }
    }
  }

  public dispose(): void {
    this.disposables.forEach((d) => d.dispose());
  }
}
