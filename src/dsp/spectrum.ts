import { fft, makeWindow, magnitudeSpectrum, type WindowName } from './fft';

export interface SpectrogramConfig {
  nfft: number; // 256..4096
  hop: number; // samples between columns
  window: WindowName;
}

export interface SpectrogramData {
  columns: Float64Array[]; // each length nfft/2+1, linear magnitude
  fs: number;
  nfft: number;
  hop: number;
  freqMax: number;
  timeMax: number;
  peak: number;
}

/** STFT via Cooley-Tukey FFT with the given window and hop. */
export function spectrogram(x: Float64Array, fs: number, cfg: SpectrogramConfig): SpectrogramData {
  const { nfft, hop } = cfg;
  const w = makeWindow(cfg.window, nfft);
  const bins = nfft >> 1;
  const columns: Float64Array[] = [];
  const re = new Float64Array(nfft);
  const im = new Float64Array(nfft);
  let peak = 0;
  const limit = Math.max(0, x.length - nfft);
  for (let start = 0; start <= limit; start += hop) {
    for (let i = 0; i < nfft; i++) { re[i] = x[start + i] * w[i]; im[i] = 0; }
    fft(re, im, false);
    const col = new Float64Array(bins + 1);
    for (let i = 0; i <= bins; i++) {
      const m = Math.hypot(re[i], im[i]);
      col[i] = m;
      if (m > peak) peak = m;
    }
    columns.push(col);
  }
  return {
    columns,
    fs,
    nfft,
    hop,
    freqMax: fs / 2,
    timeMax: x.length / fs,
    peak: peak || 1,
  };
}

export interface Peak { freq: number; amp: number; bin: number }

/** Local-maximum peak picking over the single-sided spectrum with parabolic interpolation. */
export function findPeaks(mag: Float64Array, fs: number, n: number, count = 5, thresholdDb = -60): Peak[] {
  const bins = mag.length;
  const ref = mag.reduce((a, b) => Math.max(a, b), 0) || 1;
  const peaks: Peak[] = [];
  for (let i = 2; i < bins - 2; i++) {
    if (mag[i] > mag[i - 1] && mag[i] >= mag[i + 1] && mag[i] > 0) {
      const db = 20 * Math.log10(mag[i] / ref);
      if (db < thresholdDb) continue;
      const { alpha, beta, gamma } = { alpha: mag[i - 1], beta: mag[i], gamma: mag[i + 1] };
      const denom = alpha - 2 * beta + gamma;
      const shift = denom === 0 ? 0 : 0.5 * (alpha - gamma) / denom;
      const freq = (i + shift) * fs / n;
      peaks.push({ freq, amp: mag[i], bin: i });
    }
  }
  peaks.sort((a, b) => b.amp - a.amp);
  return peaks.slice(0, count);
}

export function spectrumDb(mag: Float64Array): Float64Array {
  const ref = mag.reduce((a, b) => Math.max(a, b), 0) || 1;
  const db = new Float64Array(mag.length);
  for (let i = 0; i < mag.length; i++) db[i] = 20 * Math.log10(Math.max(mag[i] / ref, 1e-6));
  return db;
}

export function computeSpectrumDb(x: Float64Array, win: WindowName = 'hann'): { db: Float64Array; mag: Float64Array } {
  const { mag } = magnitudeSpectrum(x, win);
  return { db: spectrumDb(mag), mag };
}
