import { WeatherModeId } from './weatherSystem';

/**
 * 100% Procedural Web Audio API soundscape (Zero external audio files / zero 404s):
 * - Gentle filtered stereo fine-rain patter when weather === 'rain'
 * - Melodic FM-synthesized songbird chirps & trills when tree & wildlife are active
 */
export class SoundscapeEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private rainGain: GainNode | null = null;
  private birdGain: GainNode | null = null;
  private rainStarted = false;

  private muted = false;
  private weather: WeatherModeId = 'clear';
  private birdsActive = true;
  private treeActive = true;
  private nextChirpTimer: number | null = null;
  private disposed = false;

  public unlock(): void {
    if (this.disposed) return;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;

      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : 0.85;
      this.masterGain.connect(this.ctx.destination);

      this.rainGain = this.ctx.createGain();
      this.rainGain.gain.value = 0;
      this.rainGain.connect(this.masterGain);

      this.birdGain = this.ctx.createGain();
      this.birdGain.gain.value = 0.55;
      this.birdGain.connect(this.masterGain);

      this.startRainGenerator();
      this.scheduleNextBirdChirp(800);
    }

    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    this.syncGains();
  }

  private startRainGenerator(): void {
    if (!this.ctx || !this.rainGain || this.rainStarted) return;
    this.rainStarted = true;

    const sampleRate = this.ctx.sampleRate;
    const durationSec = 3.0;
    const length = Math.floor(sampleRate * durationSec);
    const buffer = this.ctx.createBuffer(2, length, sampleRate);

    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < length; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        let sample = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.045;
        b6 = white * 0.115926;

        if (Math.random() < 0.0018) {
          sample += (Math.random() * 2 - 1) * 0.22;
        }
        data[i] = Math.max(-1, Math.min(1, sample));
      }
    }

    const noiseSrc = this.ctx.createBufferSource();
    noiseSrc.buffer = buffer;
    noiseSrc.loop = true;

    const bodyFilter = this.ctx.createBiquadFilter();
    bodyFilter.type = 'bandpass';
    bodyFilter.frequency.value = 720;
    bodyFilter.Q.value = 0.55;

    const shimmerFilter = this.ctx.createBiquadFilter();
    shimmerFilter.type = 'highpass';
    shimmerFilter.frequency.value = 2600;

    const shimmerGain = this.ctx.createGain();
    shimmerGain.gain.value = 0.32;

    noiseSrc.connect(bodyFilter);
    bodyFilter.connect(this.rainGain);

    noiseSrc.connect(shimmerFilter);
    shimmerFilter.connect(shimmerGain);
    shimmerGain.connect(this.rainGain);

    noiseSrc.start();
  }

  private scheduleNextBirdChirp(delayMs?: number): void {
    if (this.disposed) return;
    if (this.nextChirpTimer !== null) {
      window.clearTimeout(this.nextChirpTimer);
    }
    const wait = delayMs ?? 2200 + Math.random() * 3400;
    this.nextChirpTimer = window.setTimeout(() => {
      if (this.disposed) return;
      if (this.ctx && this.ctx.state === 'running' && !this.muted && this.birdsActive && this.treeActive) {
        this.playBirdPhrase();
      }
      this.scheduleNextBirdChirp();
    }, wait);
  }

  private playBirdPhrase(): void {
    if (!this.ctx || !this.birdGain) return;
    const now = this.ctx.currentTime;
    const notes = 2 + Math.floor(Math.random() * 3);
    const basePitch = 2500 + Math.random() * 1400;

    for (let n = 0; n < notes; n++) {
      const start = now + n * (0.11 + Math.random() * 0.08);
      const dur = 0.065 + Math.random() * 0.07;

      const osc = this.ctx.createOscillator();
      const mod = this.ctx.createOscillator();
      const modGain = this.ctx.createGain();
      const env = this.ctx.createGain();
      const panner = this.ctx.createStereoPanner();

      osc.type = 'sine';
      mod.type = 'sine';

      const f0 = basePitch * (0.9 + Math.random() * 0.25);
      const f1 = f0 * (1.22 + Math.random() * 0.25);
      osc.frequency.setValueAtTime(f0, start);
      osc.frequency.exponentialRampToValueAtTime(f1, start + dur * 0.55);
      osc.frequency.exponentialRampToValueAtTime(f0 * 0.95, start + dur);

      mod.frequency.setValueAtTime(28 + Math.random() * 20, start);
      modGain.gain.setValueAtTime(95, start);

      env.gain.setValueAtTime(0.0001, start);
      env.gain.linearRampToValueAtTime(0.085, start + 0.012);
      env.gain.exponentialRampToValueAtTime(0.0001, start + dur);

      panner.pan.setValueAtTime((Math.random() - 0.5) * 1.1, start);

      mod.connect(modGain);
      modGain.connect(osc.frequency);
      osc.connect(env);
      env.connect(panner);
      panner.connect(this.birdGain);

      osc.start(start);
      mod.start(start);
      osc.stop(start + dur + 0.02);
      mod.stop(start + dur + 0.02);
    }
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    this.syncGains();
  }

  public setWeather(weather: WeatherModeId): void {
    this.weather = weather;
    this.syncGains();
  }

  public setBirdsActive(active: boolean): void {
    const becameActive = !this.birdsActive && active;
    this.birdsActive = active;
    this.syncGains();
    if (becameActive && this.ctx?.state === 'running' && !this.muted && this.treeActive) {
      this.playBirdPhrase();
    }
  }

  public setTreeActive(active: boolean): void {
    this.treeActive = active;
    this.syncGains();
  }

  private syncGains(): void {
    if (!this.ctx || !this.masterGain || !this.rainGain || !this.birdGain) return;
    const now = this.ctx.currentTime;

    this.masterGain.gain.setTargetAtTime(this.muted ? 0 : 0.85, now, 0.12);

    const rainTarget = this.weather === 'rain' && !this.muted ? 0.42 : 0.0;
    this.rainGain.gain.setTargetAtTime(rainTarget, now, 0.35);

    const birdTarget = this.birdsActive && this.treeActive && !this.muted ? 0.55 : 0.0;
    this.birdGain.gain.setTargetAtTime(birdTarget, now, 0.25);
  }

  public dispose(): void {
    this.disposed = true;
    if (this.nextChirpTimer !== null) {
      window.clearTimeout(this.nextChirpTimer);
    }
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }
}
