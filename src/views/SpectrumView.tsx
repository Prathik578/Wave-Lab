import { useMemo, useState } from 'react';
import { Card, Button, Readout, EduNote, Select } from '@/components/ui';
import { useCanvasDraw, drawFrame, drawPolyline, makeScale, sx, sy, THEME, fmtHz, type Margin } from '@/lib/chart';
import { magnitudeSpectrum, nextPow2 } from '@/dsp/fft';
import { findPeaks } from '@/dsp/spectrum';
import type { WaveComponent } from '@/dsp/signal';
import { evalSum, SIGNAL_FS } from '@/dsp/signal';

const M: Margin = { left: 56, right: 16, top: 14, bottom: 34 };
const FFT_CHOICES = [512, 1024, 2048, 4096, 8192, 16384];

interface Props { components: WaveComponent[] }

export function SpectrumView({ components }: Props) {
  const [size, setSize] = useState(4096);
  const [windowName, setWindowName] = useState<'hann' | 'hamming' | 'blackman' | 'rect'>('hann');
  const [dbMode, setDbMode] = useState(true);
  const [hover, setHover] = useState<{ f: number; db: number } | null>(null);

  const n = Math.round(0.05 * SIGNAL_FS); // 50 ms capture
  const result = useMemo(() => {
    const count = Math.min(size, nextPow2(n));
    const x = new Float64Array(count);
    for (let i = 0; i < count; i++) x[i] = evalSum(components, i / SIGNAL_FS);
    const { mag } = magnitudeSpectrum(x, windowName);
    return { mag, count };
  }, [components, size, windowName]);

  const peaks = useMemo(() => findPeaks(result.mag, SIGNAL_FS, result.count, 6, -55), [result]);

  const db = useMemo(() => {
    const ref = result.mag.reduce((a, b) => Math.max(a, b), 0) || 1;
    return Float64Array.from(result.mag, v => 20 * Math.log10(Math.max(v / ref, 1e-6)));
  }, [result]);

  const draw = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    ctx.clearRect(0, 0, w, h);
    const fmax = SIGNAL_FS / 2;
    const s = makeScale(M, w, h, 0, fmax, dbMode ? -100 : 0, dbMode ? 5 : 1.05);
    drawFrame(ctx, s, THEME, { x: 'frequency', y: dbMode ? 'magnitude (dB)' : 'amplitude' });

    // Nyquist marker
    const pny = sx(s, fmax);
    ctx.strokeStyle = '#7f1d1d';
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(pny, s.plotY); ctx.lineTo(pny, s.plotY + s.plotH); ctx.stroke();
    ctx.setLineDash([]);

    const mag = result.mag;
    const vals = dbMode ? db : mag;
    ctx.save();
    ctx.beginPath(); ctx.rect(s.plotX, s.plotY, s.plotW, s.plotH); ctx.clip();
    ctx.strokeStyle = THEME.accent;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    const bins = mag.length;
    for (let i = 0; i < bins; i++) {
      const px = sx(s, i * SIGNAL_FS / result.count);
      const py = sy(s, vals[i]);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.restore();

    // peak markers
    ctx.font = '10px ui-monospace, monospace';
    for (const p of peaks) {
      const px = sx(s, p.freq);
      const val = dbMode ? db[p.bin] : p.amp;
      const py = sy(s, val);
      ctx.fillStyle = THEME.accent2;
      ctx.beginPath(); ctx.arc(px, py, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.textAlign = 'center';
      ctx.fillText(fmtHz(p.freq), px, Math.max(s.plotY + 10, py - 8));
    }

    if (hover) {
      const px = sx(s, hover.f);
      ctx.strokeStyle = THEME.cursor;
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(px, s.plotY); ctx.lineTo(px, s.plotY + s.plotH); ctx.stroke();
      ctx.setLineDash([]);
    }
  };

  const canvasRef = useCanvasDraw(draw, [draw]);

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const frac = (e.clientX - rect.left - M.left) / (rect.width - M.left - M.right);
    if (frac < 0 || frac > 1) { setHover(null); return; }
    const f = frac * SIGNAL_FS / 2;
    const bin = Math.round(f / SIGNAL_FS * result.count);
    const v = db[bin] ?? -100;
    setHover({ f, db: v });
  };

  return (
    <div className="space-y-4">
      <Card
        title="Frequency spectrum — FFT of the generator output"
        subtitle={`N = ${result.count} bins · resolution ${(SIGNAL_FS / result.count).toFixed(2)} Hz`}
        right={<>
          <div className="w-32"><Select label="" value={String(size)} options={FFT_CHOICES.map(v => ({ value: String(v), label: `${v} pt` }))} onChange={v => setSize(parseInt(v))} /></div>
          <div className="w-32"><Select label="" value={windowName} options={[{ value: 'hann', label: 'Hann' }, { value: 'hamming', label: 'Hamming' }, { value: 'blackman', label: 'Blackman' }, { value: 'rect', label: 'Rect (leaky)' }]} onChange={v => setWindowName(v as typeof windowName)} /></div>
          <Button variant={dbMode ? 'primary' : 'default'} onClick={() => setDbMode(!dbMode)}>{dbMode ? 'dB' : 'Linear'}</Button>
        </>}
      >
        <canvas
          ref={canvasRef}
          className="w-full h-[320px] sm:h-[420px] rounded-lg cursor-crosshair"
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
        />
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 mt-4">
          {peaks.length === 0 && <p className="col-span-full text-[12px] text-slate-500">Silence — enable a generator channel.</p>}
          {peaks.map((p, i) => (
            <Readout key={i} label={`Peak ${i + 1}`} value={fmtHz(p.freq)} unit={`${(dbMode ? db[p.bin] : p.amp).toFixed(1)}${dbMode ? ' dB' : ''}`} tone={i === 0 ? 'accent' : 'default'} />
          ))}
        </div>
        {hover && (
          <p className="mt-2 text-[11px] font-mono text-slate-500">
            cursor: {fmtHz(hover.f)} · {hover.db.toFixed(1)} dB · bin {Math.round(hover.f / SIGNAL_FS * result.count)}
          </p>
        )}
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        <EduNote title="What the FFT is doing here">
          <p>
            WaveLab takes the most recent {result.count} samples of your generator output, multiplies them by a
            {windowName === 'rect' ? ' rectangular (no) window — note the skirt around every peak, that is leakage' : ` ${windowName} window to taper the edges`}, then runs
            a radix-4 Cooley–Tukey FFT. Only the lower half of the output is drawn: for real signals the upper half is a mirror image. Each bin is
            {(SIGNAL_FS / result.count).toFixed(1)} Hz wide; doubling N halves bin width but doubles compute and time-blur.
          </p>
        </EduNote>
        <EduNote title="Try this">
          <p>
            Load the "Square harmonics" sample: the spectrum collapses the jagged square wave into a neat comb of odd
            harmonics (2 kHz, 6 kHz, 10 kHz …) with amplitudes falling as 1/n — exactly what Fourier's square-wave
            series predicts. Switch the window to "Rect" and watch the leakage skirt appear around each comb tooth.
          </p>
        </EduNote>
      </div>
    </div>
  );
}
