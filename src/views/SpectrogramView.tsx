import { useMemo, useState } from 'react';
import { Card, EduNote, Select, Slider } from '@/components/ui';
import { useCanvasDraw, THEME, fmtHz, fmtTime, niceTicks } from '@/lib/chart';
import { spectrogram } from '@/dsp/spectrum';
import { evalSum, SIGNAL_FS, type WaveComponent } from '@/dsp/signal';

const NFFT_CHOICES = [
  { value: '256', label: '256 · fine time (5.3 ms)' },
  { value: '1024', label: '1024 · balanced' },
  { value: '4096', label: '4096 · fine freq (11.7 Hz)' },
];

interface Props { components: WaveComponent[] }

const DURATION = 0.25; // 250 ms window

export function SpectrogramView({ components }: Props) {
  const [nfft, setNfft] = useState(1024);
  const [contrast, setContrast] = useState(1.4);
  const [hover, setHover] = useState<{ t: number; f: number; db: number } | null>(null);

  const data = useMemo(() => {
    const n = Math.round(DURATION * SIGNAL_FS);
    const x = new Float64Array(n);
    for (let i = 0; i < n; i++) x[i] = evalSum(components, i / SIGNAL_FS);
    return spectrogram(x, SIGNAL_FS, { nfft, hop: nfft / 4, window: 'hann' });
  }, [components, nfft]);

  const draw = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    ctx.clearRect(0, 0, w, h);
    const left = 56, top = 10, bottom = 34;
    const pw = w - left - 12, ph = h - top - bottom;
    ctx.fillStyle = '#0a0e14';
    ctx.fillRect(left, top, pw, ph);

    const cols = data.columns;
    const bins = data.nfft >> 1;
    const binTop = bins; // show 0..fs/2 (rows flipped: high freq at top)
    const cw = pw / Math.max(1, cols.length);
    const rh = ph / bins;

    for (let c = 0; c < cols.length; c++) {
      const col = cols[c];
      for (let b = 1; b < bins; b++) {
        const mag = col[b] / data.peak;
        const dbv = 20 * Math.log10(Math.max(mag, 1e-8));
        // map -80..0 dB to color intensity with contrast curve
        let v = (dbv + 80) / 80;
        v = Math.max(0, Math.min(1, Math.pow(v, 1 / contrast)));
        if (v < 0.02) continue;
        // teal→amber heat scale
        const r = Math.round(255 * Math.min(1, v * 1.6));
        const g = Math.round(80 + 175 * Math.min(1, v * 1.1));
        const bl = Math.round(255 * (1 - v) * (1 - v * 0.4));
        ctx.fillStyle = `rgb(${r},${g},${bl})`;
        const y = top + (1 - b / bins) * ph - rh;
        ctx.fillRect(left + c * cw, y, Math.ceil(cw), Math.ceil(rh) + 0.5);
      }
    }
    void binTop;

    // axes
    ctx.strokeStyle = THEME.axis;
    ctx.strokeRect(left + 0.5, top + 0.5, pw - 1, ph - 1);
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillStyle = THEME.textDim;
    ctx.textAlign = 'right';
    for (const f of niceTicks(0, data.freqMax, 5)) {
      const y = top + (1 - f / data.freqMax) * ph;
      ctx.fillText(fmtHz(f), left - 6, y + 3);
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(left + pw, y); ctx.stroke();
    }
    ctx.textAlign = 'center';
    for (const t of niceTicks(0, DURATION, 6)) {
      const x = left + (t / DURATION) * pw;
      ctx.fillText(fmtTime(t), x, h - 18);
    }
    ctx.fillStyle = THEME.text;
    ctx.fillText('time', left + pw / 2, h - 6);
    ctx.save();
    ctx.translate(10, top + ph / 2); ctx.rotate(-Math.PI / 2);
    ctx.fillText('frequency', 0, 0);
    ctx.restore();

    // hover crosshair
    if (hover) {
      const hx = left + (hover.t / DURATION) * pw;
      const hy = top + (1 - hover.f / data.freqMax) * ph;
      ctx.strokeStyle = 'rgba(226,232,240,0.7)';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(hx, top); ctx.lineTo(hx, top + ph);
      ctx.moveTo(left, hy); ctx.lineTo(left + pw, hy);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  };

  const canvasRef = useCanvasDraw(draw, [draw, data, contrast]);

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const left = 56, top = 10;
    const pw = rect.width - left - 12, ph = rect.height - top - 34;
    const fx = (e.clientX - rect.left - left) / pw;
    const fy = 1 - (e.clientY - rect.top - top) / ph;
    if (fx < 0 || fx > 1 || fy < 0 || fy > 1) { setHover(null); return; }
    const t = fx * DURATION;
    const f = fy * data.freqMax;
    const col = data.columns[Math.min(data.columns.length - 1, Math.floor(fx * data.columns.length))];
    const bin = Math.round(f / data.freqMax * (data.nfft >> 1));
    const dbv = col ? 20 * Math.log10(Math.max((col[bin] ?? 0) / data.peak, 1e-8)) : -Infinity;
    setHover({ t, f, db: dbv });
  };

  return (
    <div className="space-y-4">
      <Card
        title="Spectrogram — STFT"
        subtitle="Slide a windowed FFT across the signal; brightness is energy in dB"
        right={<div className="w-56"><Select label="" value={String(nfft)} options={NFFT_CHOICES} onChange={v => setNfft(parseInt(v))} /></div>}
      >
        <canvas
          ref={canvasRef}
          className="w-full h-[300px] sm:h-[380px] rounded-lg cursor-crosshair"
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
        />
        <div className="w-full sm:w-64 mt-4">
          <Slider label="Contrast" value={contrast} min={0.6} max={3} step={0.1} onChange={setContrast} format={v => `${v.toFixed(1)}×`} />
        </div>
        {hover && (
          <p className="mt-2 text-[11px] font-mono text-slate-500">
            t = {fmtTime(hover.t)} · f = {fmtHz(hover.f)} · {isFinite(hover.db) ? `${hover.db.toFixed(1)} dB` : '—'}
          </p>
        )}
      </Card>

      <EduNote title="The time–frequency trade-off, live">
        <p>
          Each column is one FFT of {nfft} samples ({fmtTime(nfft / SIGNAL_FS)} of audio) — hop is {nfft / 4} samples,
          giving 75% overlap. Switch to 4096: the chirp becomes a razor line and you can read exact frequencies, but
          events smear across {fmtTime(4096 / SIGNAL_FS)}. Switch to 256: transients snap into focus but frequency rows
          blur to {fmtHz(SIGNAL_FS / 256)} wide. Neither setting is "better" — the uncertainty principle forbids it.
          Hover anywhere to interrogate exact values.
        </p>
      </EduNote>
    </div>
  );
}
