import { fft } from './fft';

export type FilterKind = 'lowpass' | 'highpass' | 'bandpass' | 'bandstop';

export interface BiquadCoeffs { b0: number; b1: number; b2: number; a1: number; a2: number }

/**
 * RBJ audio-EQ-cookbook bilinear-transform biquad coefficients.
 * All filters are 2nd-order sections with unit gain in the passband.
 */
export function biquadCoeffs(kind: FilterKind, f0: number, fs: number, q: number): BiquadCoeffs {
  const w0 = 2 * Math.PI * Math.min(f0, fs * 0.499) / fs;
  const c = Math.cos(w0), s = Math.sin(w0);
  const alpha = s / (2 * q);
  let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number;
  switch (kind) {
    case 'lowpass':
      b0 = (1 - c) / 2; b1 = 1 - c; b2 = (1 - c) / 2;
      a0 = 1 + alpha; a1 = -2 * c; a2 = 1 - alpha;
      break;
    case 'highpass':
      b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2;
      a0 = 1 + alpha; a1 = -2 * c; a2 = 1 - alpha;
      break;
    case 'bandpass':
      b0 = alpha; b1 = 0; b2 = -alpha;
      a0 = 1 + alpha; a1 = -2 * c; a2 = 1 - alpha;
      break;
    case 'bandstop':
      b0 = 1 + alpha; b1 = -2 * c; b2 = 1 + alpha;
      a0 = 1 + alpha; a1 = -2 * c; a2 = 1 - alpha;
      break;
  }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

/** Apply a biquad in Direct Form I, in place on a copy. Returns new array. */
export function biquadFilter(x: Float64Array, c: BiquadCoeffs): Float64Array {
  const y = new Float64Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const xi = x[i];
    const yi = c.b0 * xi + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
    x2 = x1; x1 = xi; y2 = y1; y1 = yi;
    y[i] = yi;
  }
  return y;
}

export interface FilterParams { kind: FilterKind; freq: number; q: number }

export function applyFilter(x: Float64Array, p: FilterParams, fs: number): Float64Array {
  return biquadFilter(x, biquadCoeffs(p.kind, p.freq, fs, p.q));
}

/** Complex response H(e^{jw}) of the biquad at normalized frequency w (rad/sample). */
export function biquadResponse(c: BiquadCoeffs, w: number): { mag: number; phase: number } {
  const c1 = Math.cos(w), s1 = Math.sin(w), c2 = Math.cos(2 * w), s2 = Math.sin(2 * w);
  const nr = c.b0 + c.b1 * c1 + c.b2 * c2;
  const ni = -(c.b1 * s1 + c.b2 * s2);
  const dr = 1 + c.a1 * c1 + c.a2 * c2;
  const di = -(c.a1 * s1 + c.a2 * s2);
  const mag = Math.hypot(nr, ni) / Math.hypot(dr, di);
  const phase = Math.atan2(ni, nr) - Math.atan2(di, dr);
  return { mag, phase };
}

/** Frequency response curve in dB across `points` log-spaced frequencies from 10 Hz to fs/2. */
export function responseCurve(c: BiquadCoeffs, fs: number, points = 256): { f: Float64Array; db: Float64Array } {
  const f = new Float64Array(points), db = new Float64Array(points);
  const fmin = 10, fmax = fs / 2;
  for (let i = 0; i < points; i++) {
    const fr = fmin * Math.pow(fmax / fmin, i / (points - 1));
    const { mag } = biquadResponse(c, 2 * Math.PI * fr / fs);
    f[i] = fr;
    db[i] = 20 * Math.log10(Math.max(mag, 1e-9));
  }
  return { f, db };
}

/** Group delay in samples (integer for these BLT biquads at DC/Nyquist, generally ~1 sample in passband). */
export function estimatedDelaySamples(): number {
  return 1;
}

/** Zero-phase forward-backward (filtfilt-style) filtering: squares the magnitude response, zero phase. */
export function zeroPhaseFilter(x: Float64Array, p: FilterParams, fs: number): Float64Array {
  const c = biquadCoeffs(p.kind, p.freq, fs, p.q);
  const fwd = biquadFilter(x, c);
  const rev = Float64Array.from(fwd).reverse();
  const back = biquadFilter(rev, c);
  return back.reverse();
}

/** Windowed-sinc FIR design (Kaiser-like via Blackman window), for education panel comparison. */
export function firWindowedSinc(kind: FilterKind, cutoff: number, fs: number, taps: number): Float64Array {
  const n = taps % 2 === 0 ? taps + 1 : taps;
  const mid = (n - 1) / 2;
  const h = new Float64Array(n);
  const fc = Math.min(cutoff, fs * 0.499) / fs;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const m = i - mid;
    const sinc = m === 0 ? 2 * Math.PI * fc : Math.sin(2 * Math.PI * fc * m) / m;
    let base: number;
    switch (kind) {
      case 'lowpass': base = sinc; break;
      case 'highpass': base = m === 0 ? 1 - 2 * fc : -sinc; break;
      default: base = sinc; break;
    }
    const w = 0.42 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1)) + 0.08 * Math.cos(4 * Math.PI * i / (n - 1));
    h[i] = base * w;
    sum += h[i];
  }
  if (kind === 'lowpass' || kind === 'bandpass') {
    for (let i = 0; i < n; i++) h[i] /= sum || 1;
  }
  return h;
}

/** Correlation-based delay estimate between two signals (sample lag of best alignment). */
export function estimateDelay(a: Float64Array, b: Float64Array, maxLag: number): number {
  const n = Math.min(a.length, b.length);
  let best = 0, bestVal = -Infinity;
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    let s = 0;
    const cnt = n - Math.abs(lag);
    for (let i = Math.max(0, -lag); i < Math.min(n, n - lag); i++) s += a[i] * b[i + lag];
    s /= cnt || 1;
    if (s > bestVal) { bestVal = s; best = lag; }
  }
  return best;
}

export type Spikes = { idx: number; value: number }[];

/** Clip detection: indices where |x| exceeds threshold. */
export function findClipping(x: Float64Array, threshold = 1): Spikes {
  const out: Spikes = [];
  for (let i = 0; i < x.length && out.length < 64; i++) {
    if (Math.abs(x[i]) > threshold) out.push({ idx: i, value: x[i] });
  }
  return out;
}

export function normalizePeak(x: Float64Array, target = 0.98): Float64Array {
  let peak = 0;
  for (let i = 0; i < x.length; i++) peak = Math.max(peak, Math.abs(x[i]));
  if (peak === 0) return Float64Array.from(x);
  const g = target / peak;
  const y = new Float64Array(x.length);
  for (let i = 0; i < x.length; i++) y[i] = x[i] * g;
  return y;
}

export function mix(a: Float64Array, b: Float64Array): Float64Array {
  const n = Math.min(a.length, b.length);
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) y[i] = a[i] + b[i];
  return y;
}

// Re-export FFT-based spectrum helper for filter view overlays.
export { magnitudeSpectrum, makeWindow } from './fft';
export type { WindowName } from './fft';
export { fft as fftRaw } from './fft';

export function spectralCentroid(mag: Float64Array, fs: number, n: number): number {
  let num = 0, den = 0;
  for (let i = 0; i < mag.length; i++) {
    const f = i * fs / n;
    num += f * mag[i];
    den += mag[i];
  }
  return den > 0 ? num / den : 0;
}
