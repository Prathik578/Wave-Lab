import { useMemo, useState, useRef, useCallback } from 'react';
import { Card, Button, Readout, EduNote, Slider } from '@/components/ui';
import { useCanvasDraw, drawFrame, makeScale, sx, sy, THEME, fmtTime, type Margin } from '@/lib/chart';
import { downsampleForView, signalStats, SIGNAL_FS, type WaveComponent } from '@/dsp/signal';
import { evalSum } from '@/dsp/signal';

const M: Margin = { left: 56, right: 16, top: 14, bottom: 34 };

interface Props { components: WaveComponent[] }

const WINDOW_SEC = 0.02; // base render: 20 ms of signal

export function ScopeView({ components }: Props) {
  const [zoom, setZoom] = useState(1);       // fraction of the window shown
  const [center, setCenter] = useState(0.5); // pan center, 0..1
  const [showSamples, setShowSamples] = useState(true);
  const [cursor, setCursor] = useState<number | null>(null);
  const [cursorA, setCursorA] = useState<number | null>(null);
  const [measure, setMeasure] = useState<{ t1: number; t2: number } | null>(null);
  const dragRef = useRef<{ kind: 'cursor' | 'pan' | 'measure'; startX: number } | null>(null);

  const signal = useMemo(() => {
    const n = Math.round(WINDOW_SEC * SIGNAL_FS);
    const data = new Float64Array(n);
    for (let i = 0; i < n; i++) data[i] = evalSum(components, i / SIGNAL_FS);
    return data;
  }, [components]);

  const stats = useMemo(() => signalStats(signal), [signal]);

  const view = useMemo(() => {
    const span = WINDOW_SEC * zoom;
    const t0 = Math.max(0, Math.min(WINDOW_SEC - span, center * WINDOW_SEC - span / 2));
    return { t0, t1: t0 + span };
  }, [zoom, center]);

  // slice + envelope for the visible window
  const plot = useMemo(() => {
    const i0 = Math.floor(view.t0 * SIGNAL_FS);
    const i1 = Math.min(signal.length, Math.ceil(view.t1 * SIGNAL_FS));
    const slice = signal.subarray(i0, i1);
    const maxPoints = Math.min(1600, Math.max(200, Math.round((i1 - i0) / (zoom < 0.05 ? 1 : 1))));
    const env = zoom < 0.002 && i1 - i0 > maxPoints
      ? downsampleForView(slice, maxPoints)
      : { mins: slice, maxs: slice };
    return { env, i0, i1 };
  }, [signal, view, zoom]);

  const draw = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    ctx.clearRect(0, 0, w, h);
    const yAmp = Math.max(0.15, Math.ceil(stats.peak * 2) / 2 || 1);
    const s = makeScale(M, w, h, view.t0 * 1000, view.t1 * 1000, -yAmp, yAmp);
    drawFrame(ctx, s, THEME, { x: 'time (ms)', y: 'amplitude' });

    // zero line
    ctx.strokeStyle = THEME.axis;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(s.plotX, sy(s, 0)); ctx.lineTo(s.plotX + s.plotW, sy(s, 0)); ctx.stroke();
    ctx.setLineDash([]);

    // waveform
    if (plot.env.mins.length > 1) {
      const mins = plot.env.mins, maxs = plot.env.maxs;
      const scaled = { mins: new Float64Array(mins.length), maxs: new Float64Array(maxs.length) };
      // map slice indices back to absolute x (ms)
      const absStart = plot.i0 / SIGNAL_FS * 1000;
      const stepMs = 1000 / SIGNAL_FS;
      ctx.save();
      ctx.beginPath();
      ctx.rect(s.plotX, s.plotY, s.plotW, s.plotH);
      ctx.clip();
      ctx.strokeStyle = THEME.accent;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      const n = mins.length;
      for (let i = 0; i < n; i++) {
        const px = sx(s, absStart + i * stepMs);
        if (!isFinite(px)) continue;
        ctx.moveTo(px, sy(s, maxs[i]));
        ctx.lineTo(px, sy(s, mins[i]));
      }
      ctx.stroke();
      ctx.restore();
    }

    // sampling points when zoomed in enough
    if (showSamples && zoom < 0.02) {
      const step = Math.max(1, Math.round((view.t1 - view.t0) * SIGNAL_FS / 60));
      ctx.fillStyle = '#e2e8f0';
      const absStart = plot.i0;
      for (let i = plot.i0; i < plot.i1; i += step) {
        const px = sx(s, i / SIGNAL_FS * 1000);
        const py = sy(s, signal[i - absStart + plot.i0 - plot.i0] ?? 0);
        if (px < s.plotX || px > s.plotX + s.plotW) continue;
        ctx.beginPath(); ctx.arc(px, sy(s, signal[i]), 2, 0, Math.PI * 2); ctx.fill();
      }
      void absStart;
    }

    // cursor
    if (cursor !== null) {
      const px = sx(s, cursor * 1000);
      if (px >= s.plotX && px <= s.plotX + s.plotW) {
        ctx.strokeStyle = THEME.cursor;
        ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(px, s.plotY); ctx.lineTo(px, s.plotY + s.plotH); ctx.stroke();
        ctx.setLineDash([]);
        const idx = Math.round(cursor * SIGNAL_FS);
        const val = signal[idx] ?? 0;
        ctx.fillStyle = THEME.cursor;
        ctx.font = '10px ui-monospace, monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`${fmtTime(cursor)}  A=${val.toFixed(3)}`, Math.min(px + 6, w - 150), s.plotY + 12);
      }
    }

    // measurement bracket
    if (measure) {
      const p1 = sx(s, measure.t1 * 1000), p2 = sx(s, measure.t2 * 1000);
      const yb = s.plotY + s.plotH - 12;
      ctx.strokeStyle = THEME.accent2;
      ctx.beginPath();
      ctx.moveTo(p1, yb); ctx.lineTo(p2, yb);
      ctx.moveTo(p1, yb - 4); ctx.lineTo(p1, yb + 4);
      ctx.moveTo(p2, yb - 4); ctx.lineTo(p2, yb + 4);
      ctx.stroke();
      const dt = Math.abs(measure.t2 - measure.t1);
      ctx.fillStyle = THEME.accent2;
      ctx.font = '10px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`Δ ${fmtTime(dt)}${dt > 0 ? `  → ${(1 / dt).toFixed(1)} Hz` : ''}`, (p1 + p2) / 2, yb - 8);
    }
  }, [signal, view, stats, plot, showSamples, cursor, measure]);

  const canvasRef = useCanvasDraw(draw, [draw]);

  const toTime = (e: React.PointerEvent<HTMLCanvasElement>): number | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const frac = (e.clientX - rect.left - M.left) / (rect.width - M.left - M.right);
    if (frac < 0 || frac > 1) return null;
    return view.t0 + frac * (view.t1 - view.t0);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const t = toTime(e);
    if (t === null) return;
    if (e.shiftKey) {
      dragRef.current = { kind: 'measure', startX: t };
      setMeasure({ t1: t, t2: t });
    } else {
      dragRef.current = { kind: 'cursor', startX: t };
      setCursor(t);
      const idx = Math.round(t * SIGNAL_FS);
      setCursorA(signal[idx] ?? 0);
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const t = toTime(e);
    if (t === null) return;
    if (d.kind === 'cursor') {
      setCursor(t);
      setCursorA(signal[Math.round(t * SIGNAL_FS)] ?? 0);
    } else if (d.kind === 'measure' && measure) {
      setMeasure({ ...measure, t2: t });
    }
  };

  const endDrag = () => { dragRef.current = null; };

  return (
    <div className="space-y-4">
      <Card
        title="Waveform — time domain"
        subtitle="Drag to place a cursor; Shift+drag to measure Δt between two points"
        right={<Button variant={showSamples ? 'primary' : 'default'} onClick={() => setShowSamples(!showSamples)}>Sample dots</Button>}
      >
        <div className="relative">
          <canvas
            ref={canvasRef}
            className="w-full h-[320px] sm:h-[420px] rounded-lg cursor-crosshair touch-none select-none"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerLeave={endDrag}
          />
        </div>
        <div className="flex flex-col sm:flex-row gap-4 sm:items-end mt-4">
          <div className="w-full sm:w-52"><Slider label="Zoom (time span)" value={zoom} min={0.0005} max={1} step={0.0005} onChange={v => { setZoom(v); }} format={v => `${fmtTime(WINDOW_SEC * v)} shown`} /></div>
          <div className="w-full sm:w-52"><Slider label="Pan" value={center} min={0} max={1} step={0.005} onChange={setCenter} format={v => `${(v * 100).toFixed(0)}%`} /></div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 flex-1">
            <Readout label="Peak" value={stats.peak.toFixed(3)} />
            <Readout label="RMS" value={stats.rms.toFixed(3)} tone="accent" />
            <Readout label="Mean (DC)" value={stats.mean.toFixed(3)} />
            <Readout label="P–P" value={stats.ptp.toFixed(3)} />
          </div>
        </div>
        {cursorA !== null && cursor !== null && (
          <p className="mt-2 text-[11px] font-mono text-slate-500">
            cursor t = {fmtTime(cursor)}, x(t) = {cursorA.toFixed(4)}, sample #{Math.round(cursor * SIGNAL_FS)}
          </p>
        )}
      </Card>

      <EduNote title="Reading a waveform">
        <p>
          This is the signal in its native coordinate system: amplitude vs. time. The sample dots appear when you
          zoom below ~2% of the window — a reminder that "continuous" audio is really {SIGNAL_FS} numbers per second.
          The Δt measurement converts a time interval to frequency (f = 1/T): measure peak-to-peak of the 220 Hz
          sample and you should read ≈ 4.55 ms. Zoom out to see the full 20 ms; zoom to 50 µs to see individual samples.
        </p>
      </EduNote>
    </div>
  );
}
