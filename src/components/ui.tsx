import type { ReactNode } from 'react';
import { Info } from 'lucide-react';

export function Card({ title, subtitle, right, children, className = '' }: {
  title?: string; subtitle?: string; right?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <section className={`rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden ${className}`}>
      {(title || right) && (
        <header className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-slate-800">
          <div>
            {title && <h3 className="text-[13px] font-semibold tracking-wide text-slate-200">{title}</h3>}
            {subtitle && <p className="text-[11px] text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          {right && <div className="flex items-center gap-2">{right}</div>}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Slider({ label, value, min, max, step, onChange, format, disabled = false }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; format?: (v: number) => string; disabled?: boolean;
}) {
  return (
    <label className={`block ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[11px] font-medium text-slate-400">{label}</span>
        <span className="text-[11px] font-mono text-cyan-300 tabular-nums">
          {format ? format(value) : value}
        </span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none bg-slate-700 accent-cyan-400 cursor-pointer
          [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5
          [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-400
          [&::-webkit-slider-thumb]:shadow-[0_0_8px_rgba(34,211,238,0.5)]
          [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:rounded-full
          [&::-moz-range-thumb]:bg-cyan-400 [&::-moz-range-thumb]:border-0"
      />
    </label>
  );
}

export function Select<T extends string>({ label, value, options, onChange }: {
  label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] font-medium text-slate-400 mb-1">{label}</span>
      <select
        value={value} onChange={e => onChange(e.target.value as T)}
        className="w-full rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-[12px] text-slate-200
          focus:outline-none focus:border-cyan-500 hover:border-slate-600 transition-colors cursor-pointer"
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button" onClick={() => onChange(!checked)}
      className="flex items-center gap-2 text-[12px] text-slate-300 hover:text-slate-100 transition-colors"
    >
      <span className={`relative inline-flex h-4 w-7 shrink-0 rounded-full transition-colors ${checked ? 'bg-cyan-500' : 'bg-slate-700'}`}>
        <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${checked ? 'left-3.5' : 'left-0.5'}`} />
      </span>
      {label}
    </button>
  );
}

export function Button({ children, onClick, variant = 'default', disabled = false, className = '', title }: {
  children: ReactNode; onClick?: () => void; variant?: 'default' | 'primary' | 'danger' | 'ghost';
  disabled?: boolean; className?: string; title?: string;
}) {
  const styles = {
    default: 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200',
    primary: 'bg-cyan-500/90 hover:bg-cyan-400 border-cyan-400 text-slate-950 font-semibold',
    danger: 'bg-red-500/10 hover:bg-red-500/20 border-red-500/40 text-red-300',
    ghost: 'bg-transparent hover:bg-slate-800 border-transparent text-slate-400 hover:text-slate-200',
  }[variant];
  return (
    <button
      type="button" onClick={onClick} disabled={disabled} title={title}
      className={`inline-flex items-center justify-center gap-1.5 rounded-md border px-3 py-1.5 text-[12px]
        transition-colors disabled:opacity-40 disabled:pointer-events-none ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

export function Readout({ label, value, unit, tone = 'default' }: {
  label: string; value: string; unit?: string; tone?: 'default' | 'accent' | 'warn';
}) {
  const toneCls = { default: 'text-slate-100', accent: 'text-cyan-300', warn: 'text-amber-300' }[tone];
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`font-mono text-[13px] tabular-nums mt-0.5 ${toneCls}`}>
        {value}
        {unit && <span className="text-slate-500 text-[11px] ml-1">{unit}</span>}
      </div>
    </div>
  );
}

export function EduNote({ title, children }: { title: string; children: ReactNode }) {
  return (
    <aside className="rounded-lg border border-cyan-900/50 bg-cyan-950/20 px-4 py-3">
      <div className="flex items-center gap-1.5 text-cyan-300 text-[12px] font-semibold mb-1.5">
        <Info className="h-3.5 w-3.5" /> {title}
      </div>
      <div className="text-[12px] leading-relaxed text-slate-400 space-y-2">{children}</div>
    </aside>
  );
}

export function ErrorBar({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  if (!message) return null;
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-[12px] text-red-300">
      <span>{message}</span>
      {onDismiss && (
        <button onClick={onDismiss} className="text-red-400 hover:text-red-200 shrink-0">dismiss</button>
      )}
    </div>
  );
}
