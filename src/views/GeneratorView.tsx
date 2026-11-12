import { useMemo, useState } from 'react';
import { Plus, Trash2, Play, Volume2, VolumeX } from 'lucide-react';
import { Card, Slider, Select, Toggle, Button, ErrorBar, EduNote } from '@/components/ui';
import { DEFAULT_COMPONENT, evalSum, SAMPLE_SIGNALS, type WaveComponent, type WaveKind } from '@/dsp/signal';
import { AudioEngine } from '@/audio/engine';
import { encodeWav16, downloadBlob, clampForExport } from '@/dsp/wav';
import { EDU_TOPICS } from '@/lib/education';

const KIND_OPTIONS: { value: WaveKind; label: string }[] = [
  { value: 'sine', label: 'Sine' },
  { value: 'square', label: 'Square' },
  { value: 'triangle', label: 'Triangle' },
  { value: 'sawtooth', label: 'Sawtooth' },
  { value: 'pulse', label: 'Pulse' },
  { value: 'noise', label: 'White noise' },
  { value: 'dc', label: 'DC offset' },
];

const PRESET_FREQS = [
  { label: '50 Hz', v: 50 }, { label: '220 Hz', v: 220 }, { label: '440 Hz', v: 440 },
  { label: '1 kHz', v: 1000 }, { label: '5 kHz', v: 5000 }, { label: '30 kHz (aliased)', v: 30000 },
];

interface Props {
  components: WaveComponent[];
  setComponents: (c: WaveComponent[]) => void;
  engine: AudioEngine;
}

export function GeneratorView({ components, setComponents, engine }: Props) {
  const [error, setError] = useState('');
  const [loop] = useState(true);

  const update = (id: string, patch: Partial<WaveComponent>) =>
    setComponents(components.map(c => (c.id === id ? { ...c, ...patch } : c)));

  const add = () =>
    setComponents([...components, { ...DEFAULT_COMPONENT, id: `c${Date.now()}${Math.random().toString(36).slice(2, 6)}`, freq: 440, amp: 0.3 }]);

  const remove = (id: string) => setComponents(components.filter(c => c.id !== id));

  // Plays the summed signal by rendering a 1-second looped buffer through the engine's context.
  const [loopNode, setLoopNode] = useState<AudioBufferSourceNode | null>(null);
  const [loopOn, setLoopOn] = useState(false);

  const startLoop = () => {
    try {
      const ctx = engine.ensureContext();
      if (ctx.state === 'suspended') void ctx.resume();
      const dur = 1;
      const n = Math.round(dur * ctx.sampleRate);
      const buf = ctx.createBuffer(1, n, ctx.sampleRate);
      const ch = buf.getChannelData(0);
      let scale = 0;
      for (let i = 0; i < n; i++) scale = Math.max(scale, Math.abs(evalSum(components, i / ctx.sampleRate)));
      const g = scale > 0.95 ? 0.95 / scale : 1;
      for (let i = 0; i < n; i++) ch[i] = evalSum(components, i / ctx.sampleRate) * g;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = loop;
      src.connect(ctx.destination);
      src.start();
      src.onended = () => setLoopNode(null);
      setLoopNode(src);
      setLoopOn(true);
      setError('');
    } catch {
      setError('Audio playback failed. Interact with the page and try again.');
      setLoopOn(false);
    }
  };

  const stopLoop = () => {
    if (loopNode) {
      try { loopNode.stop(); loopNode.disconnect(); } catch { /* noop */ }
      setLoopNode(null);
    }
    setLoopOn(false);
  };

  const exportSum = () => {
    const fs = 48000;
    const n = Math.round(2 * fs);
    const x = new Float64Array(n);
    for (let i = 0; i < n; i++) x[i] = evalSum(components, i / fs);
    const { out, clipped } = clampForExport(x);
    downloadBlob(encodeWav16(out, fs), 'wavelab-generator.wav');
    if (clipped > 0) setError(`Export clamped ${clipped} samples that exceeded full scale — reduce amplitudes for clean output.`);
  };

  const loadSample = (idx: number) => {
    stopLoop();
    const s = SAMPLE_SIGNALS[idx];
    setComponents(s.components.map(c => ({ ...c, id: `c${Date.now()}${Math.random().toString(36).slice(2, 6)}` })));
  };

  const totalAmp = useMemo(() => components.reduce((a, c) => a + (c.enabled ? c.amp : 0), 0), [components]);

  return (
    <div className="flex flex-col xl:flex-row gap-4">
      <div className="flex-1 min-w-0 space-y-4">
        <Card
          title="Signal components" subtitle="Stack multiple generators — the output is their sum"
          right={<>
            <Button variant="ghost" onClick={add}><Plus className="h-3.5 w-3.5" /> Add</Button>
            <Button variant="primary" onClick={loopOn ? stopLoop : startLoop}>
              {loopOn ? <VolumeX className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              {loopOn ? 'Stop audio' : 'Listen'}
            </Button>
            <Button onClick={exportSum}>Export WAV</Button>
          </>}
        >
          <ErrorBar message={error} onDismiss={() => setError('')} />
          <div className="space-y-3">
            {components.length === 0 && (
              <p className="text-[12px] text-slate-500 py-4 text-center">No components — add one or load a sample below.</p>
            )}
            {components.map((c, i) => (
              <div key={c.id} className="rounded-lg border border-slate-800 bg-slate-900/70 p-3">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2.5">
                    <Toggle label={`CH${i + 1}`} checked={c.enabled} onChange={v => update(c.id, { enabled: v })} />
                    <span className="text-[10px] uppercase tracking-wider text-slate-600">
                      {totalAmp > 1.4 ? '⚠ sum may clip' : ''}
                    </span>
                  </div>
                  <Button variant="danger" onClick={() => remove(c.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  <Select label="Waveform" value={c.kind} options={KIND_OPTIONS} onChange={v => update(c.id, { kind: v })} />
                  <Slider label="Frequency" value={c.freq} min={1} max={40000} step={1} onChange={v => update(c.id, { freq: v })} format={v => v >= 1000 ? `${(v / 1000).toFixed(2)} kHz` : `${v.toFixed(0)} Hz`} />
                  <Slider label="Amplitude" value={c.amp} min={0} max={1} step={0.01} onChange={v => update(c.id, { amp: v })} format={v => v.toFixed(2)} />
                  <Slider label="Phase" value={c.phase} min={0} max={360} step={1} onChange={v => update(c.id, { phase: v })} format={v => `${v}°`} />
                  {c.kind === 'pulse' && <Slider label="Duty" value={c.duty} min={0.05} max={0.95} step={0.01} onChange={v => update(c.id, { duty: v })} format={v => `${(v * 100).toFixed(0)}%`} />}
                  <Slider label="DC offset" value={c.dcOffset} min={-0.5} max={0.5} step={0.01} onChange={v => update(c.id, { dcOffset: v })} format={v => v.toFixed(2)} />
                </div>
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {PRESET_FREQS.map(p => (
                    <button key={p.v} onClick={() => update(c.id, { freq: p.v })}
                      className="text-[10px] font-mono px-2 py-0.5 rounded border border-slate-700 text-slate-400 hover:border-cyan-500 hover:text-cyan-300 transition-colors">
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Sample signals" subtitle="Load a curated patch and inspect it across all WaveLab tools">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {SAMPLE_SIGNALS.map((s, i) => (
              <button key={s.name} onClick={() => loadSample(i)}
                className="text-left rounded-lg border border-slate-800 bg-slate-900 px-3 py-2.5 hover:border-cyan-600 hover:bg-slate-800 transition-colors group">
                <div className="text-[12px] font-semibold text-slate-200 group-hover:text-cyan-300">{s.name}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">{s.desc}</div>
              </button>
            ))}
          </div>
        </Card>

        <EduNote title="Why stack signals?">
          <p>
            Every sound you hear is a sum of components — that is Fourier's theorem in action. The chord sample is
            literally three sine generators added sample-by-sample, and the Spectrum tool will show exactly three
            peaks. Push any component past 24 kHz (Nyquist at 48 kHz sample rate) and its energy folds back —
            that is aliasing, happening live.
          </p>
        </EduNote>
      </div>

      <GenEdu />
    </div>
  );
}

function GenEdu() {
  const topics = [EDU_TOPICS[0], EDU_TOPICS[6]];
  return (
    <aside className="w-full xl:w-80 shrink-0 space-y-4">
      {topics.map(t => (
        <Card key={t.id} title={t.title}>
          {t.formula && (
            <div className="rounded-md border border-slate-800 bg-slate-950 px-3 py-2 font-mono text-[12px] text-amber-300 mb-3 overflow-x-auto whitespace-nowrap">{t.formula}</div>
          )}
          <div className="space-y-2">
            {t.body.map((p, i) => <p key={i} className="text-[12px] leading-relaxed text-slate-400">{p}</p>)}
          </div>
          <div className="mt-3 rounded-md border border-emerald-900/50 bg-emerald-950/20 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-emerald-400 mb-1">Where it's used</div>
            <p className="text-[11.5px] leading-relaxed text-slate-400">{t.realWorld}</p>
          </div>
        </Card>
      ))}
      <p className="text-[11px] text-slate-600 px-1">
        Fundamentals → Sampling theorem covers the Nyquist limit behind the 30 kHz preset.
      </p>
    </aside>
  );
}