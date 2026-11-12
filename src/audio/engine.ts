/** Web Audio API engine: loads an AudioBuffer from a file, plays/pauses/seeks, and captures playback samples
 *  for live visualization. Signal processing (filtering) happens on Float64 arrays in src/dsp — the engine
 *  only handles playback and file decoding. */

export type EngineState = 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'error';

export interface EngineStatus {
  state: EngineState;
  message: string;
  duration: number;
  current: number;
  fs: number;
  channels: number;
  fileName: string;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private buffer: AudioBuffer | null = null;
  private source: AudioBufferSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private gain: GainNode | null = null;
  private startedAt = 0;
  private offset = 0;
  private frameCb: ((spec: Uint8Array) => void) | null = null;
  private raf = 0;
  status: EngineStatus = { state: 'idle', message: '', duration: 0, current: 0, fs: 0, channels: 0, fileName: '' };
  onStatus: ((s: EngineStatus) => void) | null = null;

  private setStatus(patch: Partial<EngineStatus>) {
    this.status = { ...this.status, ...patch };
    this.onStatus?.(this.status);
  }

  /** Public accessor so views can reuse the shared context for generated-signal loops. */
  ensureContext(): AudioContext { return this.ensureCtx(); }

  private ensureCtx(): AudioContext {
    if (!this.ctx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.55;
      this.gain = this.ctx.createGain();
      this.gain.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  get sampleRate(): number { return this.buffer?.sampleRate ?? 0; }
  get duration(): number { return this.buffer?.duration ?? 0; }
  get isLoaded(): boolean { return this.buffer !== null; }

  async loadFile(file: File): Promise<void> {
    this.stop();
    this.setStatus({ state: 'loading', message: 'Decoding…', fileName: file.name });
    if (!/\.wav$/i.test(file.name) && file.type !== 'audio/wav' && file.type !== 'audio/x-wav' && file.type !== 'audio/wave') {
      this.setStatus({ state: 'error', message: 'Unsupported file type. WaveLab analyzes WAV files — please upload a .wav.' });
      throw new Error('unsupported type');
    }
    if (file.size > 100 * 1024 * 1024) {
      this.setStatus({ state: 'error', message: 'File is larger than 100 MB.' });
      throw new Error('too large');
    }
    try {
      const arr = await file.arrayBuffer();
      const ctx = this.ensureCtx();
      // decodeAudioData handles any PCM WAV layout the browser supports; parseWav (src/dsp/wav.ts)
      // is used separately for exact sample-level analysis and export.
      this.buffer = await ctx.decodeAudioData(arr);
      this.offset = 0;
      this.setStatus({
        state: 'ready', message: '', duration: this.buffer.duration,
        fs: this.buffer.sampleRate, channels: this.buffer.numberOfChannels, current: 0,
      });
    } catch (e) {
      this.setStatus({ state: 'error', message: 'Could not decode this file. It may be corrupt or not a WAV file.' });
      throw e;
    }
  }

  play(onFrame?: (spec: Uint8Array) => void) {
    if (!this.buffer || !this.ctx) return;
    this.stopSource();
    const ctx = this.ensureCtx();
    if (ctx.state === 'suspended') void ctx.resume();
    const src = ctx.createBufferSource();
    src.buffer = this.buffer;
    src.connect(this.gain!);
    this.source = src;
    this.frameCb = onFrame ?? null;
    this.startedAt = ctx.currentTime;
    src.start(0, this.offset % this.buffer.duration);
    src.onended = () => {
      if (this.source === src) {
        this.source = null;
        this.offset = 0;
        this.setStatus({ state: 'ready', current: 0 });
        cancelAnimationFrame(this.raf);
      }
    };
    this.setStatus({ state: 'playing' });
    const tick = () => {
      if (this.analyser && this.frameCb) {
        const spec = new Uint8Array(this.analyser.frequencyBinCount);
        this.analyser.getByteFrequencyData(spec);
        this.frameCb(spec);
      }
      if (this.status.state === 'playing') {
        this.setStatus({ current: this.current() });
        this.raf = requestAnimationFrame(tick);
      }
    };
    this.raf = requestAnimationFrame(tick);
  }

  pause() {
    if (!this.source || !this.ctx || !this.buffer) return;
    this.offset = this.current();
    this.stopSource();
    cancelAnimationFrame(this.raf);
    this.setStatus({ state: 'paused', current: this.offset });
  }

  seek(t: number) {
    if (!this.buffer) return;
    const clamped = Math.max(0, Math.min(this.buffer.duration - 0.01, t));
    if (this.status.state === 'playing') {
      this.offset = clamped;
      this.play(this.frameCb ?? undefined);
    } else {
      this.offset = clamped;
      this.setStatus({ current: clamped });
    }
  }

  current(): number {
    if (!this.buffer || !this.ctx) return 0;
    if (this.status.state === 'playing' && this.source) {
      return Math.min(this.buffer.duration, this.offset + (this.ctx.currentTime - this.startedAt));
    }
    return this.offset;
  }

  setVolume(v: number) {
    if (this.gain) this.gain.gain.value = v;
  }

  private stopSource() {
    if (this.source) {
      try { this.source.onended = null; this.source.stop(); } catch { /* already stopped */ }
      this.source.disconnect();
      this.source = null;
    }
  }

  stop() {
    this.stopSource();
    cancelAnimationFrame(this.raf);
    this.offset = 0;
    this.setStatus({ state: this.buffer ? 'ready' : 'idle', current: 0 });
  }

  dispose() {
    this.stop();
    void this.ctx?.close();
    this.ctx = null;
    this.buffer = null;
  }
}
