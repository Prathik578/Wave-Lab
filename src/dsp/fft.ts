export interface Cpx {
  re: number;
  im: number;
}

/** In-place iterative radix-2 Cooley–Tukey FFT. Length must be a power of two. */
export function fft(re: Float64Array, im: Float64Array, inverse = false): void {
  const n = re.length;
  if (n < 2 || (n & (n - 1)) !== 0) throw new Error('FFT length must be a power of two');
  if (n === 1) return;
  permute(re, im);
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1;
    const theta = (inverse ? -2 : 2) * Math.PI / size;
    for (let start = 0; start < n; start += size) {
      for (let j = 0; j < half; j++) {
        const ang = theta * j;
        const wr = Math.cos(ang), wi = Math.sin(ang);
        const i0 = start + j, i1 = i0 + half;
        const ar = re[i0], ai = im[i0];
        const br = re[i1] * wr - im[i1] * wi, bi = re[i1] * wi + im[i1] * wr;
        re[i0] = ar + br; im[i0] = ai + bi;
        re[i1] = ar - br; im[i1] = ai - bi;
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}

function permute(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  let j = 0;
  for (let i = 1; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
}

const windowCache = new Map<string, Float64Array>();

export type WindowName = 'hann' | 'hamming' | 'blackman' | 'rect';

export function makeWindow(name: WindowName, n: number): Float64Array {
  const key = name + ':' + n;
  const cached = windowCache.get(key);
  if (cached) return cached;
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const c = Math.cos(2 * Math.PI * i / n);
    const c2 = Math.cos(4 * Math.PI * i / n);
    if (name === 'hann') w[i] = 0.5 - 0.5 * c;
    else if (name === 'hamming') w[i] = 0.54 - 0.46 * c;
    else if (name === 'blackman') w[i] = 0.42 - 0.5 * c + 0.08 * c2;
    else w[i] = 1;
  }
  windowCache.set(key, w);
  return w;
}

/** Single-sided magnitude spectrum (length N/2+1) of a real signal with window + coherent gain normalization. */
export function magnitudeSpectrum(x: Float64Array, win: WindowName = 'hann'): { mag: Float64Array; window: Float64Array } {
  const n = x.length;
  const re = Float64Array.from(x);
  const w = makeWindow(win, n);
  let gain = 0;
  for (let i = 0; i < n; i++) { re[i] *= w[i]; gain += w[i]; }
  gain /= n;
  const im = new Float64Array(n);
  fft(re, im, false);
  const bins = n >> 1;
  const mag = new Float64Array(bins + 1);
  for (let i = 0; i <= bins; i++) mag[i] = Math.hypot(re[i], im[i]) * 2 / (n * (gain || 1));
  return { mag, window: w };
}

/** Next power of two >= n. */
export function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}
