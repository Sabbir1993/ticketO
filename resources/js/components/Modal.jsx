'use client';
import { useEffect } from 'react';
import Icon from './Icon';
import { cx } from '@/lib/utils';

export default function Modal({ open, onClose, title, children, wide, bare }) {
  useEffect(() => {
    if (!open) return;
    const k = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', k); document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', k); document.body.style.overflow = ''; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className={`fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 ${wide === 'full' ? 'pt-4' : 'pt-[8vh]'}`} onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={cx('w-full animate-fadein rounded-2xl bg-white shadow-pop', wide === 'full' ? 'max-w-[1400px]' : wide === 'xl' ? 'max-w-5xl' : wide ? 'max-w-3xl' : 'max-w-md')}>
        {!bare && (
          <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
            <h3 className="text-lg font-semibold">{title}</h3>
            <button onClick={onClose} className="rounded-full p-1 hover:bg-ink-50" aria-label="Close"><Icon name="X" size={20} /></button>
          </div>
        )}
        <div className={bare ? '' : 'p-5'}>{children}</div>
      </div>
    </div>
  );
}
