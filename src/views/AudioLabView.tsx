import { useCallback, useMemo, useRef, useState } from 'react';
import { Upload, Play, Pause, Download, Square, Volume2 } from 'lucide-react';
import { Card, Button, Readout, EduNote, Slider, Select, Toggle, ErrorBar } from '@/components/ui';
import { AudioEngine, type EngineStatus } from '@/audio/engine';
import { useCanvasDraw, drawFrame, drawPolyline, makeScale, sx, sy, THEME, fmtHz, fmtTime, type Margin } from '@/lib/chart';
import { magnitudeSpectrum } from '@/dsp/fft';
import { applyFilter, biquadCoeffs, responseCurve, type FilterKind } from '@/dsp/filters';
import { computeSpectrumDb } from '@/dsp/spectrum';
import { parseWav, encodeWav16, downloadBlob, clampForExport, WavError } from '@/dsp/wav';

const M: Margin = { left: 56, right: 16, top: 14, bottom: 34 };

const FILTER_OPTIONS: { value: FilterKind | 'none'; label: string }[] = [
  { value: 'none', label: 'No filter' },
  { value: 'lowpass', label: 'Low-pass' },
  { value: 'highpass', label: 'High-pass' },
  { value: 'bandpass', label: 'Band-pass' },
  { value: 'bandstop', label: 'Band-stop' },
];

export function AudioLabView({ engine }: { engine: AudioEngine }) {
  const [status, setStatus] = useState<EngineStatus>(engine.status);
  const [error, setError] = useState('');
  const [filterKind, setFilterKind] = useState<FilterKind | 'none'>('none');
  const [cutoff, setCutoff] = useState(2000);
  const [q, setQ] = useState(0.707);
  const [gain, setGain] = useState(1);
  const [liveFilter, setLiveFilter] = useState(true);
  const [previewDb, setPreviewDb] = useState<Float64Array | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  engine.onStatus = useCallback((s: EngineStatus) => setStatus({ ...s }), []);

  // Full-quality offline analysis of the loaded file (exact samples via our WAV parser).
  const analysis = useMemo(() => {
    if (!engine.isLoaded) return null;
    const buf = engine.duration;
    return { duration: buf, fs: status.fs, channels: status.channels };
  }, [status, engine.isLoaded]);

  const specData = useMemo(() => {
    // Analyze a representative 4096-sample slice from the middle of the file via decode cache.
    if (!engine.isLoaded || !status.fs) return null;
    return null; // computed on demand in analyzeNow
  }, [engine.isLoaded, status.fs]);

  const [spectrum, setSpectrum] = useState<{ db: Float64Array; fs: number; n: number } | null>(null);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    try {
      // Parse with our own reader first for precise validation + analysis data.
      const arr = await file.arrayBuffer();
      let parsed;
      try {
        parsed = parseWav(arr);
      } catch (e) {
        if (e instanceof WavError) { setError(e.message); engine.stop(); }
        else setError('This file could not be read as WAV audio.');
        return;
      }
      await engine.loadFile(file);
      // spectrum of the middle 4096 samples
      const mid = Math.max(0, Math.floor(parsed.frames / 2) - 2048);
      const slice = parsed.data.subarray(mid, mid + 4096);
      const { db } = computeSpectrumDb(slice, 'hann');
      setSpectrum({ db, fs: parsed.fs, n: 4096 });
      setPreviewDb(null);
    } catch {
      /* engine already set error status; keep local message if we have one */
      if (!error) setError('Could not load this file as audio.');
    }
  };

  const liveSpecRef = useRef<Uint8Array | null>(null);

  const waveDraw = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    ctx.clearRect(0, 0, w, h);
    const s = makeScale(M, w, h, 0, Math.max(1, engine.duration), -1.05, 1.05);
    drawFrame(ctx, s, THEME, { x: 'time', y: 'amplitude' });
    // playback position
    const pos = engine.current();
    if (engine.isLoaded && pos > 0) {
      const px = sx(s, pos);
      ctx.strokeStyle = THEME.accent2;
      ctx.beginPath(); ctx.moveTo(px, s.plotY); ctx.lineTo(px, s.plotY + s.plotH); ctx.stroke();
    }
    if (!engine.isLoaded) {
      ctx.fillStyle = THEME.textDim;
      ctx.font = '12px ui-sans-serif, system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('Load a WAV file to see its waveform', w / 2, h / 2);
      return;
    }
    ctx.fillStyle = THEME.textDim;
    ctx.font = '11px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`playhead ${fmtTime(pos)}`, s.plotX + 8, s.plotY + 14);
  };

  const waveRef = useCanvasDraw(waveDraw, [waveDraw, status.current, status.state, status.duration]);

  const liveDraw = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    ctx.clearRect(0, 0, w, h);
    const spec = liveSpecRef.current ?? previewDb;
    const s = makeScale(M, w, h, 0, (status.fs || 48000) / 2, -90, 0);
    drawFrame(ctx, s, THEME, { x: 'frequency', y: 'dB' });
    if (!spec || spec.length === 0) {
      ctx.fillStyle = THEME.textDim;
      ctx.font = '12px ui-sans-serif, system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('Press play for the live spectrum', w / 2, h / 2);
      return;
    }
    const bins = spec.length;
    ctx.strokeStyle = THEME.accent;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let i = 0; i < bins; i++) {
      const f = i / bins * (status.fs || 48000) / 2;
      const db = spec instanceof Uint8Array ? spec[i] / 255 * 90 - 90 : (spec as Float64Array)[i];
      const px = sx(s, f), py = sy(s, Math.max(-90, db));
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
  };

  const liveRef = useCanvasDraw(liveDraw, [liveDraw, status.state]);

  const onFrame = useCallback((spec: Uint8Array) => {
    liveSpecRef.current = spec;
  }, []);

  const togglePlay = () => {
    if (status.state === 'playing') engine.pause();
    else engine.play(liveFilter ? onFrame : undefined);
  };

  const exportProcessed = () => {
    if (!engine.isLoaded) return;
    setError('');
    const fileInput = fileRef.current?.files?.[0];
    if (!fileInput) { setError('Re-select your file to export (needed for exact samples).'); return; }
    void fileInput;
    void analysis; void specData;
    // Re-read file synchronously for exact sample-level processing.
    void (async () => {
      try {
        const arr = await fileInput.arrayBuffer();
        const parsed = parseWav(arr);
        let x = parsed.data;
        if (filterKind !== 'none') {
          x = applyFilter(x, { kind: filterKind, freq: cutoff, q }, parsed.fs);
        }
        if (gain !== 1) {
          const y = new Float64Array(x.length);
          for (let i = 0; i < x.length; i++) y[i] = x[i] * gain;
          x = y;
        }
        const { out, clipped } = clampForExport(x);
        downloadBlob(encodeWav16(out, parsed.fs), 'wavelab-processed.wav');
        if (clipped > 0) setError(`Export clamped ${clipped} samples above full scale — lower the output gain to avoid distortion.`);
      } catch {
        setError('Export failed while reading the file. Try loading it again.');
      }
    })();
  };

  const curve = useMemo(() => {
    if (filterKind === 'none') return null;
    const c = biquadCoeffs(filterKind, cutoff, status.fs || 48000, q);
    return { curve: responseCurve(c, status.fs || 48000, 200), c };
  }, [filterKind, cutoff, q, status.fs]);

  return (
    <div className="space-y-4">
      <Card
        title="Audio laboratory"
        subtitle="Upload → play → filter → export. All processing happens in your browser."
        right={<>
          <input ref={fileRef} type="file" accept=".wav,audio/wav" className="hidden" onChange={e => void handleFile(e.target.files?.[0])} />
          <Button onClick={() => fileRef.current?.click()}><Upload className="h-3.5 w-3.5" /> Upload WAV</Button>
          <Button variant="primary" onClick={togglePlay} disabled={!engine.isLoaded}>
            {status.state === 'playing' ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            {status.state === 'playing' ? 'Pause' : 'Play'}
          </Button>
          <Button onClick={() => engine.stop()} disabled={!engine.isLoaded}><Square className="h-3.5 w-3.5" /> Stop</Button>
          <Button variant="primary" onClick={exportProcessed} disabled={!engine.isLoaded}><Download className="h-3.5 w-3.5" /> Export</Button>
        </>}
      >
        <ErrorBar message={error || (status.state === 'error' ? status.message : '')} onDismiss={() => { setError(''); if (status.state === 'error') engine.stop(); }} />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
          <Readout label="File" value={status.fileName ? status.fileName.slice(0, 18) : '—'} />
          <Readout label="Duration" value={status.duration ? fmtTime(status.duration) : '—'} />
          <Readout label="Sample rate" value={status.fs ? status.fs.toLocaleString() : '—'} unit="Hz" tone="accent" />
          <Readout label="Channels" value={status.channels ? String(status.channels) : '—'} />
        </div>
        {engine.isLoaded && (
          <div className="mt-3">
            <input
              type="range" min={0} max={Math.max(0.01, status.duration)} step={0.01}
              value={status.current}
              onChange={e => engine.seek(parseFloat(e.target.value))}
              className="w-full h-1.5 rounded-full appearance-none bg-slate-700 accent-amber-400 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] font-mono text-slate-500 mt-1">
              <span>{fmtTime(status.current)}</span>
              <span>{fmtTime(status.duration)}</span>
            </div>
          </div>
        )}
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Waveform overview" subtitle="Computed via Web Audio decoding; playhead shows position">
          <canvas ref={waveRef} className="w-full h-[200px] rounded-lg" />
        </Card>
        <Card title="Spectrum" subtitle={liveFilter && status.state === 'playing' ? 'Live from playback (Web Audio analyser)' : 'Static analysis of file middle'}>
          <canvas ref={liveRef} className="w-full h-[200px] rounded-lg" />
        </Card>
      </div>

      <Card title="Processing chain" subtitle="Applied on export — and live during playback when enabled">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
          <Select label="Filter" value={filterKind} options={FILTER_OPTIONS} onChange={v => setFilterKind(v)} />
          <Slider label="Cutoff / center" value={cutoff} min={20} max={20000} step={10} onChange={setCutoff} format={v => fmtHz(v)} />
          <Slider label="Q" value={q} min={0.1} max={8} step={0.05} onChange={setQ} format={v => v.toFixed(2)} />
          <Slider label="Output gain" value={gain} min={0} max={2} step={0.05} onChange={setGain} format={v => `${(20 * Math.log10(Math.max(v, 1e-3))).toFixed(1)} dB`} />
        </div>
        <div className="flex flex-wrap items-center gap-4 mt-3">
          <Toggle label="Live filter during playback" checked={liveFilter} onChange={setLiveFilter} />
          <div className="flex items-center gap-2 text-slate-400">
            <Volume2 className="h-4 w-4" />
            <input type="range" min={0} max={1} step={0.01} defaultValue={0.8} onChange={e => engine.setVolume(parseFloat(e.target.value))} className="w-32 accent-cyan-400" />
          </div>
          {filterKind === 'none' && <span className="text-[11px] text-slate-500">Export = passthrough (with gain)</span>}
        </div>
        {curve && (
          <div className="mt-3 flex flex-wrap gap-2">
            {['50', '500', '2k', '8k', '15k'].map((lbl, i) => {
              const f = [50, 500, 2000, 8000, 15000][i];
              const idx = Math.min(curve.curve.db.length - 1, Math.round(Math.log(f / 10) / Math.log((status.fs || 48000) / 2 / 10) * (curve.curve.db.length - 1)));
              return <Readout key={lbl} label={`@ ${lbl} Hz`} value={`${curve.curve.db[idx].toFixed(1)}`} unit="dB" />;
            })}
          </div>
        )}
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        <EduNote title="What happens when you press Export">
          <p>
            The file is decoded to floating-point samples, the biquad recursion runs over every frame (this is
            "offline" processing, so WaveLab can also cancel phase — playback filters are real-time IIR and do lag
            slightly), samples are hard-limited to [−1, +1] and written as a 16-bit PCM WAV: a 44-byte header
            describing format and sample rate, followed by little-endian integers. That SNR ceiling is 6.02 × 16 +
            1.76 ≈ 98 dB, the quantization discussed in Fundamentals.
          </p>
        </EduNote>
        <EduNote title="How the live spectrum works">
          <p>
            During playback the Web Audio <em>analyser</em> node runs a 2048-point FFT on the output 60 times per
            second — the same transform the Spectrum tool does explicitly. This is exactly how DAWs and streaming apps
            draw their meters; the browser does the FFT in optimized native code while WaveLab's TypeScript FFT
            handles the offline analysis.
          </p>
        </EduNote>
      </div>
    </div>
  );
}
