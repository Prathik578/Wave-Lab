import { useRef, useEffect, type RefObject } from 'react';

export interface Margin { left: number; right: number; top: number; bottom: number }
export const DEFAULT_MARGIN: Margin = { left: 56, right: 16, top: 14, bottom: 30 };

export interface AxisTicks { x: number[]; y: number[] }

export function niceTicks(min: number, max: number, count = 5): number[] {
  if (!isFinite(min) || !isFinite(max) || min === max) return [min];
  const span = max - min;
  const step0 = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const norm = step0 / mag;
  let step: number;
  if (norm < 1.5) step = 1;
  else if (norm < 3.5) step = 2;
  else if (norm < 7.5) step = 5;
  else step = 10;
  step *= mag;
  const start = Math.ceil(min / step) * step;
  const out: number[] = [];
  for (let v = start; v <= max + step * 1e-6; v += step) out.push(Math.abs(v) < step * 1e-6 ? 0 : v);
  return out;
}

export function fmtTime(s: number): string {
  if (Math.abs(s) >= 1) return `${s.toFixed(3)} s`;
  const ms = s * 1000;
  if (Math.abs(ms) >= 1) return `${ms.toFixed(2)} ms`;
  return `${(s * 1e6).toFixed(0)} µs`;
}

export function fmtHz(f: number): string {
  if (f >= 1e6) return `${(f / 1e6).toFixed(3)} MHz`;
  if (f >= 1000) return `${(f / 1000).toFixed(f >= 10000 ? 1 : 3)} kHz`;
  return `${f.toFixed(1)} Hz`;
}

export interface Scale {
  x0: number; x1: number; y0: number; y1: number;
  plotX: number; plotY: number; plotW: number; plotH: number;
}

export function makeScale(m: Margin, w: number, h: number, x0: number, x1: number, y0: number, y1: number): Scale {
  return { x0, x1, y0, y1, plotX: m.left, plotY: m.top, plotW: w - m.left - m.right, plotH: h - m.top - m.bottom };
}

export function sx(s: Scale, x: number): number { return s.plotX + ((x - s.x0) / (s.x1 - s.x0 || 1)) * s.plotW; }
export function sy(s: Scale, y: number): number { return s.plotY + s.plotH - ((y - s.y0) / (s.y1 - s.y0 || 1)) * s.plotH; }

export interface Theme {
  bg: string;
  plot: string;
  grid: string;
  axis: string;
  text: string;
  textDim: string;
  accent: string;      // primary signal trace
  accent2: string;     // secondary trace (output/compare)
  accent3: string;
  cursor: string;
}

export const THEME: Theme = {
  bg: '#0b0f14',
  plot: '#10161e',
  grid: '#1d2733',
  axis: '#2c3a4a',
  text: '#9fb3c8',
  textDim: '#5c718a',
  accent: '#22d3ee',
  accent2: '#f59e0b',
  accent3: '#34d399',
  cursor: '#64748b',
};

export function setupCanvas(canvas: HTMLCanvasElement): { ctx: CanvasRenderingContext2D; w: number; h: number; dpr: number } | null {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(50, Math.round(rect.width));
  const h = Math.max(50, Math.round(rect.height));
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr;
    canvas.height = h * dpr;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h, dpr };
}

export function drawFrame(ctx: CanvasRenderingContext2D, s: Scale, th: Theme, labels?: { x?: string; y?: string }): void {
  ctx.fillStyle = th.plot;
  ctx.fillRect(s.plotX, s.plotY, s.plotW, s.plotH);
  ctx.strokeStyle = th.grid;
  ctx.lineWidth = 1;
  ctx.font = '10px ui-monospace, monospace';
  ctx.fillStyle = th.textDim;
  const xTicks = niceTicks(s.x0, s.x1, Math.max(3, Math.min(8, Math.floor(s.plotW / 90))));
  for (const t of xTicks) {
    const px = sx(s, t);
    ctx.beginPath(); ctx.moveTo(px, s.plotY); ctx.lineTo(px, s.plotY + s.plotH); ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillText(fmtTick(t), px, s.plotY + s.plotH + 14);
  }
  const yTicks = niceTicks(s.y0, s.y1, Math.max(3, Math.min(7, Math.floor(s.plotH / 34))));
  for (const t of yTicks) {
    const py = sy(s, t);
    ctx.beginPath(); ctx.moveTo(s.plotX, py); ctx.lineTo(s.plotX + s.plotW, py); ctx.stroke();
    ctx.textAlign = 'right';
    ctx.fillText(fmtTick(t), s.plotX - 6, py + 3);
  }
  ctx.strokeStyle = th.axis;
  ctx.strokeRect(s.plotX + 0.5, s.plotY + 0.5, s.plotW - 1, s.plotH - 1);
  if (labels?.x) {
    ctx.fillStyle = th.text;
    ctx.textAlign = 'center';
    ctx.fillText(labels.x, s.plotX + s.plotW / 2, s.plotY + s.plotH + 26);
  }
  if (labels?.y) {
    ctx.save();
    ctx.translate(12, s.plotY + s.plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText(labels.y, 0, 0);
    ctx.restore();
  }
}

function fmtTick(v: number): string {
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 1e6) return `${v / 1e6}M`;
  if (a >= 1000) return `${v / 1000}k`;
  if (a >= 10) return v.toFixed(0);
  if (a >= 1) return v.toFixed(1);
  if (a >= 0.01) return v.toFixed(2);
  return v.toExponential(0);
}

/** Min/max envelope polyline — handles zoomed-out dense data without aliasing. */
export function drawEnvelope(
  ctx: CanvasRenderingContext2D, s: Scale, mins: Float64Array, maxs: Float64Array, color: string, lw = 1.4
): void {
  const n = mins.length;
  if (n === 0) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.beginPath();
  const xStart = Math.max(0, Math.floor((s.x0 / (s.x1 - s.x0)) * n));
  const xEnd = Math.min(n, Math.ceil((s.x1 / (s.x1 - s.x0)) * n));
  let last = -1;
  for (let i = xStart; i < xEnd; i++) {
    const px = sx(s, i / (n - 1 || 1));
    if (px < s.plotX - 2) continue;
    if (px > s.plotX + s.plotW + 2) break;
    const lo = sy(s, mins[i]), hi = sy(s, maxs[i]);
    if (last < 0) ctx.moveTo(px, hi); else ctx.lineTo(px, hi);
    ctx.lineTo(px, lo);
    last = px;
  }
  ctx.stroke();
  void last;
}

export function drawPolyline(
  ctx: CanvasRenderingContext2D, s: Scale, xs: ArrayLike<number>, ys: ArrayLike<number>, color: string, lw = 1.4, dash: number[] = []
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.setLineDash(dash);
  ctx.beginPath();
  let started = false;
  for (let i = 0; i < xs.length; i++) {
    const px = sx(s, xs[i] as number), py = sy(s, ys[i] as number);
    if (!isFinite(px) || !isFinite(py)) { started = false; continue; }
    if (!started) { ctx.moveTo(px, py); started = true; } else ctx.lineTo(px, py);
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

/** useCanvasDraw: hook that wires a canvas ref + draw callback with ResizeObserver + DPR handling. */
export function useCanvasDraw(
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  deps: unknown[]
): React.RefObject<HTMLCanvasElement> {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const drawRef = useRef(draw);
  drawRef.current = draw;
  useEffect(() => {
    let raf = 0;
    const render = () => {
      const canvas = ref.current;
      if (!canvas) return;
      const setup = setupCanvas(canvas);
      if (setup) drawRef.current(setup.ctx, setup.w, setup.h);
    };
    const onResize = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(render); };
    window.addEventListener('resize', onResize);
    const ro = new ResizeObserver(onResize);
    if (ref.current) ro.observe(ref.current);
    render();
    return () => { window.removeEventListener('resize', onResize); ro.disconnect(); cancelAnimationFrame(raf); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return ref;
}
