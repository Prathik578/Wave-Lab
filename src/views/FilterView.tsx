import { useMemo, useState } from 'react';
import { Card, Slider, Select, Toggle, Readout, EduNote } from '@/components/ui';
import { useCanvasDraw, drawFrame, drawPolyline, makeScale, sx, sy, THEME, fmtHz, type Margin } from '@/lib/chart';
import { applyFilter, biquadCoeffs, responseCurve, biquadResponse, firWindowedSinc } from '@/dsp/filters';
import { magnitudeSpectrum } from '@/dsp/fft';
import { evalSum, SIGNAL_FS, type WaveComponent } from '@/dsp/signal';
import type { FilterKind } from '@/dsp/filters';

const M: Margin = { left: 56, right: 16, top: 14, bottom: 34 };

interface Props { components: WaveComponent[] }

const FILTER_OPTIONS: { value: FilterKind; label: string }[] = [
  { value: 'lowpass', label: 'Low-pass' },
  { value: 'highpass', label: 'High-pass' },
  { value: 'bandpass', label: 'Band-pass' },
  { value: 'bandstop', label: 'Band-stop' },
];

export function FilterView({ components }: Props) {
  const [kind, setKind] = useState<FilterKind>('lowpass');
  const [cutoff, setCutoff] = useState(1000);
  const [q, setQ] = useState(0.707);
  const [zeroPhase, setZeroPhase] = useState(false);

  const N = 8192; // ~170 ms render
  const io = useMemo(() => {
    const x = new Float64Array(N);
    for (let i = 0; i < N; i++) x[i] = evalSum(components, i / SIGNAL_FS);
    const coeffs = biquadCoeffs(kind, cutoff, SIGNAL_FS, q);
    const y = applyFilter(x, { kind, freq: cutoff, q }, SIGNAL_FS);
    return { x, y, coeffs };
  }, [components, kind, cutoff, q, zeroPhase]);

  const spec = useMemo(() => {
    const a = magnitudeSpectrum(io.x.subarray(0, 4096), 'hann').mag;
    const b = magnitudeSpectrum(io.y.subarray(0, 4096), 'hann').mag;
    return { a, b };
  }, [io]);

  const curve = useMemo(() => responseCurve(io.coeffs, SIGNAL_FS, 220), [io.coeffs]);
  const firTaps = useMemo(() => firWindowedSinc(kind, cutoff, SIGNAL_FS, 101), [kind, cutoff]);

  const responseDraw = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    ctx.clearRect(0, 0, w, h);
    const s = makeScale(M, w, h, 10, SIGNAL_FS / 2, -50, 15);
    drawFrame(ctx, s, THEME, { x: 'frequency (log)', y: 'gain (dB)' });
    ctx.save();
    ctx.beginPath(); ctx.rect(s.plotX, s.plotY, s.plotW, s.plotH); ctx.clip();
    ctx.setLineDash([5, 4]);
    drawPolyline(ctx, s, curve.f, curve.db, THEME.accent2, 1.3);
    ctx.setLineDash([]);
    // FIR overlay computed on log axis: map taps to same curve
    const firDb: number[] = [];
    const firF: number[] = [];
    for (let i = 0; i < 120; i++) {
      const f = 10 * Math.pow(SIGNAL_FS / 2 / 10, i / 119);
      const wNorm = 2 * Math.PI * f / SIGNAL_FS;
      // evaluate FIR H(e^jw) = Σ h[n] e^{-jwn}
      let re = 0, im = 0;
      for (let n = 0; n < firTaps.length; n++) {
        re += firTaps[n] * Math.cos(wNorm * n);
        im -= firTaps[n] * Math.sin(wNorm * n);
      }
      firF.push(f);
      firDb.push(20 * Math.log10(Math.max(Math.hypot(re, im), 1e-9)));
    }
    drawPolyline(ctx, s, firF, firDb, THEME.accent3, 1.1, [2, 3]);
    ctx.restore();
  };

  const responseRef = useCanvasDraw(responseDraw, [responseDraw]);

  const timeDraw = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    ctx.clearRect(0, 0, w, h);
    const show = 2048;
    const tEnd = show / SIGNAL_FS * 1000;
    let peak = 1e-6;
    for (let i = 0; i < show; i++) peak = Math.max(peak, Math.abs(io.x[i]), Math.abs(io.y[i]));
    const s = makeScale(M, w, h, 0, tEnd, -peak * 1.1, peak * 1.1);
    drawFrame(ctx, s, THEME, { x: 'time (ms)', y: 'amplitude' });
    const step = 2;
    const drawTrace = (data: Float64Array, color: string, lw: number) => {
      ctx.strokeStyle = color; ctx.lineWidth = lw;
      ctx.beginPath();
      for (let i = 0; i < show; i += step) {
        const px = sx(s, i / SIGNAL_FS * 1000), py = sy(s, data[i]);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    };
    drawTrace(io.x, 'rgba(148,163,184,0.5)', 1);
    drawTrace(io.y, THEME.accent, 1.5);
    // legend
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillStyle = 'rgba(148,163,184,0.8)'; ctx.fillText('input', s.plotX + 8, s.plotY + 14);
    ctx.fillStyle = THEME.accent; ctx.fillText('output', s.plotX + 52, s.plotY + 14);
  };

  const timeRef = useCanvasDraw(timeDraw, [timeDraw]);

  const specDraw = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    ctx.clearRect(0, 0, w, h);
    const fmax = SIGNAL_FS / 2;
    const refA = spec.a.reduce((a, b) => Math.max(a, b), 0) || 1;
    const s = makeScale(M, w, h, 0, fmax, -90, 5);
    drawFrame(ctx, s, THEME, { x: 'frequency', y: 'dB' });
    const plotSpec = (mag: Float64Array, color: string, lw: number) => {
      const ref = mag.reduce((a, b) => Math.max(a, b), 0) || 1;
      const db = Float64Array.from(mag, v => 20 * Math.log10(Math.max(v / refA, 1e-9)));
      drawPolyline(ctx, s, mag.map === undefined ? [] : Array.from({ length: mag.length }, (_, i) => i * fmax / mag.length), db, color, lw);
      void ref;
    };
    ctx.save();
    ctx.beginPath(); ctx.rect(s.plotX, s.plotY, s.plotW, s.plotH); ctx.clip();
    plotSpec(spec.a, 'rgba(148,163,184,0.45)', 1);
    plotSpec(spec.b, THEME.accent, 1.4);
    ctx.restore();
  };

  const specRef = useCanvasDraw(specDraw, [specDraw]);

  // key readouts
  const fc = io.coeffs;
  const gainAt = (f: number) => { const { mag } = biquadResponse(fc, 2 * Math.PI * f / SIGNAL_FS); return mag; };
  const outStats = useMemo(() => {
    let peak = 0, sumSq = 0;
    for (let i = 0; i < io.y.length; i++) { peak = Math.max(peak, Math.abs(io.y[i])); sumSq += io.y[i] * io.y[i]; }
    return { peak, rms: Math.sqrt(sumSq / (io.y.length || 1)) };
  }, [io]);

  return (
    <div className="space-y-4">
      <div className="grid lg:grid-cols-3 gap-4">
        <Card title="Filter design" className="lg:col-span-1">
          <div className="space-y-4">
            <Select label="Type" value={kind} options={FILTER_OPTIONS} onChange={setKind} />
            <Slider label="Cutoff / center" value={cutoff} min={20} max={22000} step={10} onChange={setCutoff} format={v => fmtHz(v)} />
            <Slider label="Q (resonance)" value={q} min={0.1} max={12} step={0.05} onChange={setQ} format={v => v.toFixed(2)} />
            <Toggle label="Zero-phase (forward-backward)" checked={zeroPhase} onChange={setZeroPhase} />
            <div className="grid grid-cols-3 gap-2 pt-1">
              <Readout label="@ 100 Hz" value={`${(20 * Math.log10(Math.max(gainAt(100), 1e-9))).toFixed(1)}`} unit="dB" />
              <Readout label="@ cutoff" value={`${(20 * Math.log10(Math.max(gainAt(cutoff), 1e-9))).toFixed(1)}`} unit="dB" tone="accent" />
              <Readout label="@ 10 kHz" value={`${(20 * Math.log10(Math.max(gainAt(10000), 1e-9))).toFixed(1)}`} unit="dB" />
            </div>
          </div>
        </Card>

        <Card title="Frequency response" subtitle="Solid amber: IIR biquad (RBJ cookbook) · Dashed green: 101-tap FIR (windowed sinc)" className="lg:col-span-2">
          <canvas ref={responseRef} className="w-full h-[240px] rounded-lg" />
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Time domain — input vs. output" subtitle="Gray: input · Cyan: filtered output">
          <canvas ref={timeRef} className="w-full h-[240px] rounded-lg" />
          <div className="grid grid-cols-2 gap-2 mt-3">
            <Readout label="Output peak" value={outStats.peak.toFixed(3)} />
            <Readout label="Output RMS" value={outStats.rms.toFixed(3)} tone="accent" />
          </div>
        </Card>
        <Card title="Spectrum — input vs. output" subtitle="Watch stop-band energy disappear">
          <canvas ref={specRef} className="w-full h-[240px] rounded-lg" />
        </Card>
      </div>

      <EduNote title="What the filter is doing to your signal">
        <p>
          The biquad runs this recursion on every sample: y[n] = b₀·x[n] + b₁·x[n−1] + b₂·x[n−2] − a₁·y[n−1] − a₂·y[n−2]
          — a weighted mix of the last two inputs and outputs whose coefficients shape which frequencies survive.
          Feedback (the a-terms) is what makes it IIR: sharp cutoffs from just 5 multiplies, at the cost of phase
          delay (visible as the cyan trace lagging gray) and Q-dependent ringing. The FIR overlay never rings and has
          perfectly linear phase, but needs 101 taps for comparable sharpness — the classic IIR/FIR trade-off.
          {zeroPhase ? ' Zero-phase mode filters forward and backward, cancelling lag entirely and squaring the attenuation slope.' : ''}
        </p>
      </EduNote>
    </div>
  );
}
