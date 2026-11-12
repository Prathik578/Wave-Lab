# WaveLab — Digital Signal Processing Laboratory

A browser-based DSP laboratory: generate signals, inspect them in the time and frequency
domains, design digital filters, watch spectrograms evolve, and process real WAV audio —
with the mathematics explained at every step.

Everything runs client-side. No backend, no sample data: every plot is computed live from a
radix-4 FFT, biquad recursions, and a hand-rolled PCM WAV codec written in TypeScript.

## Features

| Tool | What it does |
|---|---|
| **Generator** | Stack sine / square / triangle / sawtooth / pulse / noise / DC components; per-channel frequency, amplitude, phase, duty, offset. Loop playback, export WAV. Six curated sample patches. |
| **Scope** | Time-domain waveform with zoom (50 µs – 20 ms), pan, per-sample dots, draggable cursor, shift-drag Δt→frequency measurement, peak/RMS/DC/P–P readouts. |
| **Spectrum** | Radix-4 Cooley–Tukey FFT, 512–16384 points, Hann/Hamming/Blackman/Rect windows, dB/linear scales, peak picking with parabolic interpolation, hover bin inspection. |
| **Filters** | RBJ-cookbook biquads (LP/HP/BP/BS) with cutoff and Q; response curve vs. a 101-tap windowed-sinc FIR; input vs. output in time and spectrum; optional zero-phase (forward-backward) mode. |
| **Spectrogram** | STFT with 256/1024/4096-point windows at 75% overlap, contrast control, hover readout of time/frequency/dB. |
| **Audio Lab** | WAV upload (PCM 8/16/24/32-bit + float, mono–8ch), play/pause/seek, live spectrum during playback, full processing chain applied offline on export, 16-bit PCM export. |
| **Fundamentals** | Seven explainers — sampling theorem, Nyquist, Fourier, FFT, aliasing, filtering, STFT, quantization — each linked to the tool that demonstrates it. |

## Running

```bash
npm install
npm run dev      # development server
npm run build    # production build (Vite)
```

Deployable to any static host (Vercel: import the repo, framework preset "Vite" — no extra config).

## Architecture

```
src/
├── dsp/            # Pure TypeScript, zero DOM/UI dependencies — unit-testable math
│   ├── fft.ts      # Radix-4 Cooley–Tukey FFT, window functions, spectrum helper
│   ├── signal.ts   # Wave component model, generators, sample patches, stats, min/max envelope
│   ├── filters.ts  # RBJ biquad design + Direct Form I filtering, FIR design, response curves
│   ├── spectrum.ts # STFT/spectrogram, peak picking, dB conversion
│   └── wav.ts      # WAV parser (8/16/24/32-bit PCM + float) and 16-bit writer
├── audio/
│   └── engine.ts   # Web Audio playback (decode, play/pause/seek, analyser tap, volume)
├── lib/
│   ├── chart.ts    # Canvas plotting: scales, ticks, grid frames, envelope polylines, DPR handling
│   └── education.ts# Educational content
├── components/     # Shared UI primitives, education side panel
└── views/          # One view per tool; views own their controls and canvas draw functions
```

**Design rules**

- Signal processing never touches the DOM: `src/dsp/*` operates on `Float64Array`s and returns data.
- Views recompute derived signals via `useMemo`; canvases redraw through a single draw-callback hook with
  `ResizeObserver` + devicePixelRatio handling.
- The audio engine only handles playback; filtering/export re-reads the file and runs the DSP pipeline
  in `src/dsp`, so a filtered export is bit-exact offline processing, not a live-graph recording.

## Numerical notes

- FFT: radix-4 DIT with final radix-2 stage; O(N log N); single-sided magnitude normalized by
  coherent window gain.
- Filters: bilinear-transform biquads (RBJ audio-EQ cookbook); group delay ≈ 1 sample in passband;
  zero-phase mode applies the filter forward and backward.
- Spectrogram: Hann window, hop = N/4 (75% overlap), magnitudes mapped −80 dB → color.
- WAV export: hard limiter at ±1.0 with a report of clipped samples; 16-bit PCM, SNR ≈ 98 dB.
