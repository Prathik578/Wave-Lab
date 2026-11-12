import { useState } from 'react';
import { Card } from '@/components/ui';
import { EDU_TOPICS } from '@/lib/education';

export function FundamentalsView({ onNavigate }: { onNavigate: (view: string) => void }) {
  const [open, setOpen] = useState<string | null>(EDU_TOPICS[0].id);

  const related: Record<string, { label: string; view: string }> = {
    sampling: { label: 'See aliasing happen: set a generator above 24 kHz', view: 'generator' },
    fourier: { label: 'Open the oscilloscope (time domain)', view: 'scope' },
    fft: { label: 'Run the FFT analyzer now', view: 'spectrum' },
    aliasing: { label: 'Watch aliasing fold in the FFT', view: 'spectrum' },
    filtering: { label: 'Open the filter lab', view: 'filter' },
    stft: { label: 'Open the spectrogram', view: 'spectrogram' },
    quantization: { label: 'Export 16-bit WAV from the Audio Lab', view: 'audio' },
  };

  return (
    <div className="max-w-3xl mx-auto space-y-3">
      <div className="mb-2">
        <h2 className="text-lg font-semibold text-slate-100">Fundamentals</h2>
        <p className="text-[12px] text-slate-500 mt-1">
          The theory behind every tool in WaveLab — what the math does, which algorithm runs, and why engineers rely on it.
        </p>
      </div>
      {EDU_TOPICS.map(t => {
        const isOpen = open === t.id;
        const rel = related[t.id];
        return (
          <Card key={t.id} className={isOpen ? 'border-cyan-900/60' : ''}>
            <button
              className="w-full flex items-center justify-between text-left gap-3"
              onClick={() => setOpen(isOpen ? null : t.id)}
            >
              <span className="text-[13.5px] font-semibold text-slate-200">{t.title}</span>
              <span className={`text-slate-500 transition-transform text-[12px] ${isOpen ? 'rotate-180' : ''}`}>▾</span>
            </button>
            {isOpen && (
              <div className="mt-3 space-y-3">
                {t.formula && (
                  <div className="rounded-md border border-slate-800 bg-slate-950 px-3 py-2 font-mono text-[12px] text-amber-300 overflow-x-auto whitespace-nowrap">
                    {t.formula}
                  </div>
                )}
                {t.body.map((p, i) => (
                  <p key={i} className="text-[12.5px] leading-relaxed text-slate-400">{p}</p>
                ))}
                <div className="rounded-lg border border-emerald-900/50 bg-emerald-950/20 px-3 py-2.5">
                  <div className="text-[10px] uppercase tracking-wider text-emerald-400 mb-1">Where it's used</div>
                  <p className="text-[12px] leading-relaxed text-slate-400">{t.realWorld}</p>
                </div>
                {rel && (
                  <button
                    onClick={() => onNavigate(rel.view)}
                    className="text-[12px] text-cyan-400 hover:text-cyan-300 underline underline-offset-4 decoration-cyan-900"
                  >
                    {rel.label} →
                  </button>
                )}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
