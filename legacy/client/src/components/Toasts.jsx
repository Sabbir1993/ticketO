'use client';
import { useStore } from '@/lib/store';
import Icon from './Icon';
export default function Toasts() {
  const { toasts } = useStore();
  return (
    <div className="pointer-events-none fixed bottom-5 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-2">
      {toasts.map((t) => (
        <div key={t.id} className="flex animate-fadein items-center gap-2 rounded-lg bg-ink-900 px-4 py-2.5 text-sm text-white shadow-pop">
          <Icon name={t.kind === 'err' ? 'XCircle' : 'CheckCircle2'} size={16} className={t.kind === 'err' ? 'text-brand-400' : 'text-emerald-400'} />
          {t.msg}
        </div>
      ))}
    </div>
  );
}
