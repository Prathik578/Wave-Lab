export interface EduTopic {
  id: string;
  title: string;
  body: string[];
  formula?: string;
  realWorld: string;
}

export const EDU_TOPICS: EduTopic[] = [
  {
    id: 'sampling',
    title: 'Sampling theorem & Nyquist frequency',
    formula: 'f_N = f_s / 2',
    body: [
      'A continuous signal becomes a list of numbers when we sample it: we measure its amplitude every 1/f_s seconds. The sampling theorem (Shannon, 1949) states that a signal can be reconstructed perfectly only if it contains no frequency above half the sample rate. That limit, f_N = f_s/2, is the Nyquist frequency.',
      'WaveLab runs at 48 kHz, so the Nyquist limit is 24 kHz. Any content above it is not captured — it masquerades as a lower frequency, a corruption called aliasing. Try it in the Generator: push a sine toward 30 kHz and watch the FFT peak fold back below 24 kHz, appearing at f_s − f.',
      'Real converters prevent this with an analog anti-aliasing low-pass filter before sampling, and an anti-imaging filter after reconstruction.',
    ],
    realWorld: 'CD audio (44.1 kHz, Nyquist 22.05 kHz), telephone (8 kHz), video frame rates and the wagon-wheel illusion.',
  },
  {
    id: 'fourier',
    title: 'Fourier transforms: time vs. frequency domain',
    formula: 'X(f) = ∫ x(t)·e^{−j2πft} dt',
    body: [
      'Fourier\'s insight: any reasonable signal is a sum of pure sines. The Fourier transform maps a signal from the time domain (amplitude vs. time) to the frequency domain (amplitude vs. frequency). Both views hold exactly the same information — they are two coordinate systems for the same object.',
      'A pure sine is one spike in frequency and an endless wave in time. A sharp impulse is one sample in time and completely flat in frequency. Sharpness in one domain means spread in the other — this trade-off (the uncertainty principle of DSP) explains why time–frequency analysis always involves compromise.',
    ],
    realWorld: 'MP3 and JPEG compression, radio tuning, vibration analysis of bridges and jet engines, MRI reconstruction.',
  },
  {
    id: 'fft',
    title: 'The FFT (Fast Fourier Transform)',
    formula: 'DFT: X[k] = Σ x[n]·e^{−j2πkn/N} — computed in O(N log N) instead of O(N²)',
    body: [
      'Computers work with sampled blocks, so we use the Discrete Fourier Transform: N input samples produce N complex bins spaced f_s/N apart. Evaluated naively it costs N² multiply-adds; the FFT (Cooley–Tukey, 1965) reuses partial results to cut this to N log N. For a 4096-point block that is roughly a 300× speed-up — the difference between a lab tool and a paperweight.',
      'WaveLab implements a radix-4 Cooley–Tukey FFT in pure TypeScript. Because real signals have complex FFTs symmetric about DC, only the lower half (N/2 + 1 bins) is displayed. Adjust the FFT size in the Spectrum tool: bigger blocks give finer frequency resolution but blur events in time; smaller blocks do the opposite.',
      'Windowing (Hann, Hamming, Blackman) tapers each block at its edges. Without it, the block boundary looks like a sudden jump and leaks energy across bins — the rectangular "rect" window shows the worst case; compare it to Hann.',
    ],
    realWorld: 'OFDM Wi-Fi/5G symbols, audio codecs, radar processing, and everything in this app.',
  },
  {
    id: 'aliasing',
    title: 'Aliasing, folding and leakage',
    formula: 'f_alias = |f − k·f_s|, nearest replica',
    body: [
      'Sampling at f_s makes all frequencies f, f_s − f, f_s + f, 2f_s − f … indistinguishable — they are aliases of one another. A 30 kHz sine sampled at 48 kHz is identical to an 18 kHz sine: its true frequency "folds" around the Nyquist limit like a reflection.',
      'In the Generator, set a sine above 24 kHz and confirm the peak lands at 48 kHz minus your setting. This is also why spectrogram columns above the Nyquist line are empty for clean tones: nothing real lives there unless aliasing put it there.',
      'Spectral leakage is the gentler cousin: even below Nyquist, a tone that does not complete a whole number of cycles in the FFT block smears into neighboring bins. Windowing controls it.',
    ],
    realWorld: 'Moiré patterns in cameras, propeller illusions in video, sonar and vibration monitoring mistakes.',
  },
  {
    id: 'filtering',
    title: 'Digital filtering: IIR biquads and FIR',
    formula: 'y[n] = b₀x[n] + b₁x[n−1] + b₂x[n−2] − a₁y[n−1] − a₂y[n−2]',
    body: [
      'A digital filter computes each output sample from a weighted mix of recent inputs and outputs. The workhorse is the second-order "biquad" section shown above. Its two feedback terms (a₁, a₂) are what make it Infinite-response (IIR): after an impulse, output keeps ringing.',
      'WaveLab uses the RBJ cookbook designs: a bilinear transform maps an analog prototype (Butterworth-style, maximally flat) into the digital domain at whatever sample rate you\'re working at. Q controls resonance: high Q narrows the transition and rings longer — audible as ringing on square waves.',
      'FIR filters (convolution with a fixed tap vector, shown for comparison in the design table) have no feedback: always stable, perfectly linear phase, but need many more taps for a sharp cutoff. The phase difference is why live IIR filters delay the signal slightly — the Lissajous view in the Filter tool shows it.',
      'Zero-phase filtering runs the biquad forwards then backwards, cancelling phase but doubling the magnitude slope — useful offline, impossible in real time.',
    ],
    realWorld: 'Loudspeaker crossovers, parametric EQs, ECG denoising, control-loop compensators, 60 Hz hum removal.',
  },
  {
    id: 'stft',
    title: 'The spectrogram (STFT) and time–frequency resolution',
    formula: 'STFT: FFT of x[n]·w[n − mH], for every hop m·H',
    body: [
      'A spectrogram answers "which frequencies, and when?" by sliding a window across the signal and taking an FFT of each slice — the Short-Time Fourier Transform. Columns of the image are time, rows are frequency, brightness is energy (dB).',
      'The window length N sets an unavoidable trade-off: N = 4096 at 48 kHz gives 11.7 Hz frequency bins but 85 ms blur per column; N = 256 gives 187 Hz bins and 5 ms blur. A chirp renders as a sharp line with large N and a fuzzy band with small N — switch the resolution control and watch it.',
      'Overlap (hop < N) smooths the columns in time. WaveLab uses a Hann window and 75% overlap, the standard default for audio.',
    ],
    realWorld: 'Speech recognition spectrograms, birdsong research, mechanical fault diagnosis, music transcription.',
  },
  {
    id: 'quantization',
    title: 'Quantization and dynamic range',
    formula: 'SNR ≈ 6.02·bits + 1.76 dB',
    body: [
      'Between samples, the amplitude itself must be rounded to a finite set of levels — quantization. Each extra bit adds about 6 dB of signal-to-noise ratio. 16-bit audio (65,536 levels) reaches ~98 dB, roughly the range from a quiet library to a passing train; 8-bit is audibly crunchy.',
      'When you export from the Audio Lab, samples are hard-limited to [−1, +1] and written as 16-bit PCM. If a filter boosted the signal past full scale, the export clamps the peaks — the same clipping a real DAC would produce.',
    ],
    realWorld: 'DAC/ADC design, dithering in mastering, float vs. fixed-point DSP pipelines.',
  },
];

export const CONCEPT_LINKS: Record<string, string> = {
  generator: 'sampling',
  scope: 'fourier',
  spectrum: 'fft',
  filter: 'filtering',
  spectrogram: 'stft',
  audio: 'quantization',
};
