import { EDU_TOPICS } from '@/lib/education';

export function EduPanel({ topicId, onClose }: { topicId: string; onClose: () => void }) {
  const topic = EDU_TOPICS.find(t => t.id === topicId);
  if (!topic) return null;
  return (
    <aside className="w-full lg:w-80 shrink-0 border-l border-slate-800 bg-slate-950/80 overflow-y-auto">
      <div className="sticky top-0 flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-950/95 backdrop-blur">
        <h2 className="text-[13px] font-semibold text-cyan-300">Why it works</h2>
        <button onClick={onClose} className="text-slate-500 hover:text-slate-200 text-[12px] px-2 py-1 rounded hover:bg-slate-800 transition-colors">
          Close
        </button>
      </div>
      <div className="px-4 py-4 space-y-4">
        <h3 className="text-[15px] font-semibold text-slate-100 leading-snug">{topic.title}</h3>
        {topic.formula && (
          <div className="rounded-md border border-slate-800 bg-slate-900 px-3 py-2 font-mono text-[12px] text-amber-300 overflow-x-auto whitespace-nowrap">
            {topic.formula}
          </div>
        )}
        {topic.body.map((p, i) => (
          <p key={i} className="text-[12.5px] leading-relaxed text-slate-400">{p}</p>
        ))}
        <div className="rounded-lg border border-emerald-900/50 bg-emerald-950/20 px-3 py-2.5">
          <div className="text-[10px] uppercase tracking-wider text-emerald-400 mb-1">Where it's used</div>
          <p className="text-[12px] leading-relaxed text-slate-400">{topic.realWorld}</p>
        </div>
      </div>
    </aside>
  );
}
