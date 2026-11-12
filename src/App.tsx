import { useRef, useState, useMemo, useEffect } from 'react';
import { AudioWaveform, BookOpen, Filter, AudioLines, Waves, AudioWaveform as SpecIcon, FileAudio } from 'lucide-react';
import { AudioEngine } from '@/audio/engine';
import { GeneratorView } from '@/views/GeneratorView';
import { ScopeView } from '@/views/ScopeView';
import { SpectrumView } from '@/views/SpectrumView';
import { FilterView } from '@/views/FilterView';
import { SpectrogramView } from '@/views/SpectrogramView';
import { AudioLabView } from '@/views/AudioLabView';
import { FundamentalsView } from '@/views/FundamentalsView';
import { DEFAULT_COMPONENT, type WaveComponent } from '@/dsp/signal';
import { evalSum } from '@/dsp/signal';

type ViewId = 'generator' | 'scope' | 'spectrum' | 'filter' | 'spectrogram' | 'audio' | 'fundamentals';

const NAV: { id: ViewId; label: string; icon: typeof Waves; hint: string }[] = [
  { id: 'generator', label: 'Generator', icon: AudioWaveform, hint: 'Build signals from components' },
  { id: 'scope', label: 'Scope', icon: Waves, hint: 'Time-domain waveform' },
  { id: 'spectrum', label: 'Spectrum', icon: AudioLines, hint: 'FFT frequency analysis' },
  { id: 'filter', label: 'Filters', icon: Filter, hint: 'LP/HP/BP/BS biquad lab' },
  { id: 'spectrogram', label: 'Spectrogram', icon: SpecIcon, hint: 'STFT time–frequency view' },
  { id: 'audio', label: 'Audio Lab', icon: FileAudio, hint: 'WAV upload, filter, export' },
  { id: 'fundamentals', label: 'Fundamentals', icon: BookOpen, hint: 'The theory behind the tools' },
];

function App() {
  const [view, setView] = useState<ViewId>('generator');
  const [components, setComponents] = useState<WaveComponent[]>([
    { ...DEFAULT_COMPONENT, id: 'ch1' },
  ]);
  const engineRef = useRef<AudioEngine | null>(null);
  if (!engineRef.current) engineRef.current = new AudioEngine();
  const engine = engineRef.current;

  useEffect(() => () => engine.dispose(), [engine]);

  // Shared rendered signal buffer reused by analysis-heavy views via context (kept minimal:
  // each view recomputes from components, which are the single source of truth).
  const signalRef = useMemo(() => {
    const n = 16384;
    const data = new Float64Array(n);
    for (let i = 0; i < n; i++) data[i] = evalSum(components, i / 48000);
    return data;
  }, [components]);
  void signalRef;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex flex-col">
      <header className="border-b border-slate-800 bg-slate-950/90 backdrop-blur sticky top-0 z-20">
        <div className="max-w-[1600px] mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-cyan-500/10 border border-cyan-500/40 flex items-center justify-center">
              <Waves className="h-4.5 w-4.5 text-cyan-400" />
            </div>
            <div>
              <h1 className="text-[15px] font-bold tracking-tight text-slate-100 leading-none">WaveLab</h1>
              <p className="text-[10.5px] text-slate-500 mt-0.5 tracking-wide uppercase">Digital Signal Processing Laboratory</p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-2 text-[11px] font-mono text-slate-500">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            48 kHz · FFT radix-4 · Web Audio
          </div>
        </div>
        <nav className="max-w-[1600px] mx-auto px-4 pb-2 flex gap-1 overflow-x-auto">
          {NAV.map(n => {
            const Icon = n.icon;
            const active = view === n.id;
            return (
              <button
                key={n.id}
                onClick={() => setView(n.id)}
                title={n.hint}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] whitespace-nowrap transition-colors
                  ${active ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/40' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/70 border border-transparent'}`}
              >
                <Icon className="h-3.5 w-3.5" />
                {n.label}
              </button>
            );
          })}
        </nav>
      </header>

      <main className="flex-1 max-w-[1600px] w-full mx-auto px-4 py-4">
        {view === 'generator' && <GeneratorView components={components} setComponents={setComponents} engine={engine} />}
        {view === 'scope' && <ScopeView components={components} />}
        {view === 'spectrum' && <SpectrumView components={components} />}
        {view === 'filter' && <FilterView components={components} />}
        {view === 'spectrogram' && <SpectrogramView components={components} />}
        {view === 'audio' && <AudioLabView engine={engine} />}
        {view === 'fundamentals' && <FundamentalsView onNavigate={v => setView(v as ViewId)} />}
      </main>

      <footer className="border-t border-slate-800 px-4 py-3">
        <p className="max-w-[1600px] mx-auto text-[11px] text-slate-600">
          WaveLab — every plot computed live from real FFTs, biquad recursions and PCM codec runs in this tab. No sample data, no mocks.
        </p>
      </footer>
    </div>
  );
}

export default App;
