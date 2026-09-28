'use client';
import { useRef } from 'react';
import Link from '@/components/Link';
import Icon from './Icon';

export default function Row({ title, href, children }) {
  const ref = useRef(null);
  const scroll = (d) => ref.current?.scrollBy({ left: d * ref.current.clientWidth * 0.8, behavior: 'smooth' });
  return (
    <section className="py-6">
      <div className="mb-4 flex items-end justify-between">
        <h2 className="text-xl font-bold text-ink-900 md:text-2xl">{title}</h2>
        {href && <Link href={href} className="text-sm font-medium text-brand-500 hover:underline">See all ›</Link>}
      </div>
      <div className="relative">
        <button onClick={() => scroll(-1)} aria-label="Scroll left" className="absolute -left-4 top-1/3 z-10 hidden h-9 w-9 items-center justify-center rounded-full bg-ink-700/70 text-white shadow md:flex"><Icon name="ChevronLeft" size={18} /></button>
        <div ref={ref} className="no-scrollbar -mx-1 flex snap-x gap-4 overflow-x-auto px-1 pb-2 md:gap-6">{children}</div>
        <button onClick={() => scroll(1)} aria-label="Scroll right" className="absolute -right-4 top-1/3 z-10 hidden h-9 w-9 items-center justify-center rounded-full bg-ink-700/70 text-white shadow md:flex"><Icon name="ChevronRight" size={18} /></button>
      </div>
    </section>
  );
}
