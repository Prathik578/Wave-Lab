export type WaveKind = 'sine' | 'square' | 'triangle' | 'sawtooth' | 'pulse' | 'noise' | 'dc' | 'chirp';

export interface WaveComponent {
  id: string;
  kind: WaveKind;
  freq: number;
  amp: number;
  phase: number; // degrees
  duty: number; // pulse duty cycle 0..1
  dcOffset: number;
  enabled: boolean;
}

export const DEFAULT_COMPONENT: Omit<WaveComponent, 'id'> = {
  kind: 'sine', freq: 220, amp: 0.5, phase: 0, duty: 0.5, dcOffset: 0, enabled: true,
};

/** Evaluate a single component at continuous time t (seconds). */
export function evalComponent(c: WaveComponent, t: number): number {
  if (!c.enabled) return 0;
  let y = 0;
  switch (c.kind) {
    case 'sine':
      y = Math.sin(2 * Math.PI * c.freq * t + c.phase * Math.PI / 180);
      break;
    case 'square': {
      const ph = ((c.freq * t + c.phase / 360) % 1 + 1) % 1;
      y = ph < 0.5 ? 1 : -1;
      break;
    }
    case 'triangle': {
      const ph = ((c.freq * t + c.phase / 360) % 1 + 1) % 1;
      y = 4 * Math.abs(ph - 0.5) - 1;
      break;
    }
    case 'sawtooth': {
      const ph = ((c.freq * t + c.phase / 360) % 1 + 1) % 1;
      y = 2 * ph - 1;
      break;
    }
    case 'pulse': {
      const ph = ((c.freq * t + c.phase / 360) % 1 + 1) % 1;
      y = ph < c.duty ? 1 : -1;
      break;
    }
    case 'noise':
      y = Math.random() * 2 - 1;
      break;
    case 'dc':
      y = 1;
      break;
    case 'chirp': {
      const T = 1;
      y = Math.sin(2 * Math.PI * (c.freq * t + 0.5 * (c.freq * 4) * t * t / T));
      break;
    }
  }
  return y * c.amp + c.dcOffset;
}

/** Sum all enabled components at time t. */
export function evalSum(cs: WaveComponent[], t: number): number {
  let s = 0;
  for (const c of cs) s += evalComponent(c, t);
  return s;
}

export interface RenderedSignal {
  data: Float64Array;
  fs: number; // sample rate Hz
  duration: number;
  components: WaveComponent[];
}

export const SIGNAL_FS = 48000;

/** Render the sum of components for `duration` seconds at fs. Noise is seeded per render for determinism within a render. */
export function renderSignal(cs: WaveComponent[], duration: number, fs = SIGNAL_FS): RenderedSignal {
  const n = Math.max(1, Math.round(duration * fs));
  const data = new Float64Array(n);
  for (let i = 0; i < n; i++) data[i] = evalSum(cs, i / fs);
  return { data, fs, duration, components: cs };
}

export function signalStats(x: Float64Array): { rms: number; peak: number; mean: number; ptp: number } {
  let sum = 0, sumSq = 0, peak = 0, min = Infinity, max = -Infinity;
  for (let i = 0; i < x.length; i++) {
    const v = x[i];
    sum += v; sumSq += v * v;
    const a = Math.abs(v);
    if (a > peak) peak = a;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const n = x.length || 1;
  return { rms: Math.sqrt(sumSq / n), peak, mean: sum / n, ptp: max - min };
}

export function downsampleForView(x: Float64Array, maxPoints: number): { mins: Float64Array; maxs: Float64Array } {
  const n = x.length;
  if (n <= maxPoints) {
    const mins = Float64Array.from(x), maxs = Float64Array.from(x);
    return { mins, maxs };
  }
  const bins = maxPoints;
  const per = n / bins;
  const mins = new Float64Array(bins), maxs = new Float64Array(bins);
  for (let b = 0; b < bins; b++) {
    const s = Math.floor(b * per), e = Math.min(n, Math.floor((b + 1) * per) + 1);
    let mn = Infinity, mx = -Infinity;
    for (let i = s; i < e; i++) { if (x[i] < mn) mn = x[i]; if (x[i] > mx) mx = x[i]; }
    mins[b] = mn; maxs[b] = mx;
  }
  return { mins, maxs };
}

export const SAMPLE_SIGNALS: { name: string; desc: string; components: Omit<WaveComponent, 'id'>[] }[] = [
  { name: 'Pure 220 Hz', desc: 'Single sine, fundamentals only', components: [{ ...DEFAULT_COMPONENT, freq: 220, amp: 0.6 }] },
  {
    name: 'A2 minor chord', desc: '220 + 261.63 + 329.63 Hz sines',
    components: [
      { ...DEFAULT_COMPONENT, freq: 220, amp: 0.35 },
      { ...DEFAULT_COMPONENT, freq: 261.63, amp: 0.3 },
      { ...DEFAULT_COMPONENT, freq: 329.63, amp: 0.25 },
    ],
  },
  {
    name: 'Square harmonics', desc: '2 kHz square — odd harmonics visible in FFT',
    components: [{ ...DEFAULT_COMPONENT, kind: 'square', freq: 2000, amp: 0.5 }],
  },
  {
    name: '50 Hz hum + tone', desc: '1 kHz tone contaminated with mains hum',
    components: [
      { ...DEFAULT_COMPONENT, freq: 1000, amp: 0.5 },
      { ...DEFAULT_COMPONENT, freq: 50, amp: 0.3 },
      { ...DEFAULT_COMPONENT, freq: 150, amp: 0.1 },
    ],
  },
  {
    name: 'Noisy sine (SNR test)', desc: '440 Hz sine under broadband noise',
    components: [
      { ...DEFAULT_COMPONENT, freq: 440, amp: 0.25 },
      { ...DEFAULT_COMPONENT, kind: 'noise', amp: 0.4 },
    ],
  },
  {
    name: 'Pulse train', desc: '200 Hz pulse, 25% duty — comb spectrum',
    components: [{ ...DEFAULT_COMPONENT, kind: 'pulse', freq: 200, amp: 0.6, duty: 0.25 }],
  },
];
