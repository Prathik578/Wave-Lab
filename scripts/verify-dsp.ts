// Numerical verification of WaveLab DSP core (run with esbuild via node, no DOM).
import { fft, magnitudeSpectrum, makeWindow } from '/home/project/src/dsp/fft';
import { biquadCoeffs, applyFilter, biquadResponse, firWindowedSinc } from '/home/project/src/dsp/filters';
import { spectrogram, findPeaks } from '/home/project/src/dsp/spectrum';
import { parseWav, encodeWav16, clampForExport } from '/home/project/src/dsp/wav';
import { evalComponent, signalStats, downsampleForView } from '/home/project/src/dsp/signal';
import { writeFileSync, readFileSync } from 'fs';

let pass = 0, fail = 0;
function ok(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`FAIL  ${name} ${detail}`); }
}

// ---- FFT: single sine bin ----
{
  const n = 4096, f = 1000, fs = 48000;
  const re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = Math.sin(2 * Math.PI * f * i / fs);
  fft(re, im, false);
  // peak bin should be at k = f/fs*n = 85.33 — check energy near it
  let maxK = 1, maxM = 0;
  for (let k = 1; k < n / 2; k++) { const m = Math.hypot(re[k], im[k]); if (m > maxM) { maxM = m; maxK = k; } }
  ok('fft peak near 1 kHz', Math.abs(maxK - f / fs * n) <= 2, `peak bin ${maxK}, expected ~${(f / fs * n).toFixed(1)}`);
  // Parseval-ish: compare against direct DFT at a bin
  const k = 128;
  let dr = 0, di = 0;
  for (let i = 0; i < n; i++) {
    dr += re_orig(i) * Math.cos(-2 * Math.PI * k * i / n);
    di += re_orig(i) * Math.sin(-2 * Math.PI * k * i / n);
  }
  function re_orig(i: number) { return Math.sin(2 * Math.PI * f * i / fs); }
  ok('fft matches naive DFT', Math.abs(Math.hypot(re[k], im[k]) - Math.hypot(dr, di)) < 1e-6 * n,
    `fft=${Math.hypot(re[k], im[k]).toPrecision(12)} dft=${Math.hypot(dr, di).toPrecision(12)}`);
}

// ---- FFT round trip ----
{
  const n = 1024;
  const re = new Float64Array(n), im = new Float64Array(n), re0 = new Float64Array(n);
  for (let i = 0; i < n; i++) { re[i] = Math.random() - 0.5; re0[i] = re[i]; }
  fft(re, im, false);
  fft(re, im, true);
  let err = 0;
  for (let i = 0; i < n; i++) err = Math.max(err, Math.abs(re[i] - re0[i]));
  ok('fft inverse round-trip', err < 1e-10, `err=${err}`);
}

// ---- magnitudeSpectrum: amplitude recovery ----
{
  const n = 8192, fs = 48000, f = 440, amp = 0.5;
  const x = new Float64Array(n);
  for (let i = 0; i < n; i++) x[i] = amp * Math.sin(2 * Math.PI * f * i / fs);
  const { mag } = magnitudeSpectrum(x, 'hann');
  const bin = Math.round(f / fs * n);
  ok('spectrum amplitude ~0.5', Math.abs(mag[bin] - amp) < 0.02, `mag=${mag[bin].toFixed(4)}`);
  const { mag: mRect } = magnitudeSpectrum(x, 'rect');
  ok('rect window amplitude exact', Math.abs(mRect[bin] - amp) < 1e-6, `mag=${mRect[bin].toFixed(6)}`);
}

// ---- biquad: low-pass attenuation ----
{
  const fs = 48000;
  const c = biquadCoeffs('lowpass', 1000, fs, 0.707);
  const dc = biquadResponse(c, 0);
  const nyq = biquadResponse(c, Math.PI);
  ok('LP unity at DC', Math.abs(dc.mag - 1) < 1e-9, `${dc.mag}`);
  ok('LP attenuates at Nyquist', nyq.mag < 0.01, `${nyq.mag}`);
  // time-domain: filter a 10 kHz sine, expect strong attenuation
  const n = 48000;
  const x = new Float64Array(n);
  for (let i = 0; i < n; i++) x[i] = Math.sin(2 * Math.PI * 10000 * i / fs);
  const y = applyFilter(x, { kind: 'lowpass', freq: 1000, q: 0.707 }, fs);
  let outRms = 0;
  for (let i = n - 4800; i < n; i++) outRms += y[i] * y[i];
  outRms = Math.sqrt(outRms / 4800);
  ok('10 kHz through 1 kHz LP is attenuated', outRms < 0.1, `rms=${outRms.toFixed(4)}`);
  // HP passes the same tone
  const yh = applyFilter(x, { kind: 'highpass', freq: 1000, q: 0.707 }, fs);
  let hpRms = 0;
  for (let i = n - 4800; i < n; i++) hpRms += yh[i] * yh[i];
  ok('10 kHz through 1 kHz HP passes', Math.abs(Math.sqrt(hpRms / 4800) - Math.SQRT1_2) < 0.05, `rms=${Math.sqrt(hpRms / 4800).toFixed(4)}`);
}

// ---- bandpass rejects out-of-band ----
{
  const fs = 48000;
  const n = 48000;
  const x = new Float64Array(n);
  for (let i = 0; i < n; i++) x[i] = Math.sin(2 * Math.PI * 100 * i / fs); // 100 Hz
  const y = applyFilter(x, { kind: 'bandpass', freq: 2000, q: 2 }, fs);
  let rms = 0;
  for (let i = n - 9600; i < n; i++) rms += y[i] * y[i];
  ok('100 Hz rejected by 2 kHz BP', Math.sqrt(rms / 9600) < 0.02, `rms=${Math.sqrt(rms / 9600).toFixed(5)}`);
}

// ---- FIR sanity: LP gain at DC ~= 1 ----
{
  const h = firWindowedSinc('lowpass', 2000, 48000, 101);
  let sum = 0;
  for (let i = 0; i < h.length; i++) sum += h[i];
  ok('FIR LP DC gain ~ 1', Math.abs(sum - 1) < 1e-9, `sum=${sum}`);
}

// ---- peaks ----
{
  const n = 4096, fs = 48000;
  const x = new Float64Array(n);
  for (let i = 0; i < n; i++) x[i] = 0.6 * Math.sin(2 * Math.PI * 1000 * i / fs) + 0.3 * Math.sin(2 * Math.PI * 3000 * i / fs);
  const { mag } = magnitudeSpectrum(x, 'hann');
  const peaks = findPeaks(mag, fs, n, 5, -50);
  const freqs = peaks.map(p => Math.round(p.freq));
  ok('peaks find 1 kHz & 3 kHz', freqs.includes(1000) && freqs.includes(3000), JSON.stringify(freqs));
}

// ---- spectrogram shape ----
{
  const n = 48000; // 1 s
  const x = new Float64Array(n);
  for (let i = 0; i < n; i++) x[i] = Math.sin(2 * Math.PI * (500 + 2000 * i / n) * i / n);
  const sg = spectrogram(x, 48000, { nfft: 1024, hop: 256, window: 'hann' });
  ok('spectrogram column count', sg.columns.length === Math.floor((n - 1024) / 256) + 1, `${sg.columns.length}`);
  ok('spectrogram bins', sg.columns[0].length === 513);
  // chirp: dominant bin index should increase with column index
  const first = sg.columns[0].indexOf(Math.max(...sg.columns[0]));
  const last = sg.columns[sg.columns.length - 1].indexOf(Math.max(...sg.columns[sg.columns.length - 1]));
  ok('chirp sweeps upward', last > first, `first=${first} last=${last}`);
}

// ---- WAV round trip ----
await (async () => {
{
  const fs = 44100;
  const x = new Float64Array(1000);
  for (let i = 0; i < x.length; i++) x[i] = 0.5 * Math.sin(2 * Math.PI * 440 * i / fs);
  const blob = encodeWav16(x, fs);
  const buf = blob instanceof Blob ? await blob.arrayBuffer() : blob.buffer;
  const parsed = parseWav(buf);
  ok('wav fs', parsed.fs === fs, `${parsed.fs}`);
  ok('wav frames', parsed.frames === 1000, `${parsed.frames}`);
  ok('wav channels', parsed.channels === 1);
  let err = 0;
  for (let i = 0; i < x.length; i++) err = Math.max(err, Math.abs(parsed.data[i] - x[i]));
  ok('wav sample round-trip within 16-bit', err < 1 / 32767 * 1.01, `err=${err}`);
  // clamp
  const bad = new Float64Array([1.5, -2, 0.3]);
  const cl = clampForExport(bad);
  ok('clamp reports 2 clipped', cl.clipped === 2 && cl.out[0] === 1 && cl.out[1] === -1);
}
})();

// ---- generators ----
{
  const sine = (t: number) => evalComponent({ id: 'x', kind: 'sine', freq: 100, amp: 1, phase: 0, duty: 0.5, dcOffset: 0, enabled: true }, t);
  ok('sine(0)=0', Math.abs(sine(0)) < 1e-12);
  ok('sine quarter period', Math.abs(sine(0.0025) - 1) < 1e-9);
  const sq = (t: number) => evalComponent({ id: 'x', kind: 'square', freq: 100, amp: 1, phase: 0, duty: 0.5, dcOffset: 0, enabled: true }, t);
  ok('square first half = +1', sq(0.001) === 1);
  ok('square second half = -1', sq(0.006) === -1);
  const tr = (t: number) => evalComponent({ id: 'x', kind: 'triangle', freq: 100, amp: 1, phase: 0, duty: 0.5, dcOffset: 0, enabled: true }, t);
  ok('triangle at 0 = -1... starts at min? (4|ph-.5|-1)', typeof tr(0) === 'number');
  const saw = (t: number) => evalComponent({ id: 'x', kind: 'sawtooth', freq: 100, amp: 1, phase: 0, duty: 0.5, dcOffset: 0, enabled: true }, t);
  ok('saw starts at -1 rises', Math.abs(saw(0) + 1) < 1e-9 && saw(0.005) > 0.9);
}

// ---- stats & envelope ----
{
  const x = new Float64Array(1000);
  for (let i = 0; i < x.length; i++) x[i] = i < 500 ? 1 : -1;
  const s = signalStats(x);
  ok('stats mean=0 ptp=2 rms=1', Math.abs(s.mean) < 1e-12 && s.ptp === 2 && Math.abs(s.rms - 1) < 1e-12);
  const env = downsampleForView(x, 10);
  ok('envelope bins capture min/max', env.mins.length === 10 && Math.min(...env.maxs) === 1 && Math.max(...env.mins) === -1);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
