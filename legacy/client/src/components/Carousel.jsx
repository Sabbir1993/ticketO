import { useEffect, useState } from 'react';
import Link from './Link';
import Icon from './Icon';

export default function Carousel({ slides = [] }) {
  const [i, setI] = useState(0);
  useEffect(() => { if (!slides.length) return; const t = setInterval(() => setI((x) => (x + 1) % slides.length), 5500); return () => clearInterval(t); }, [slides.length]);
  if (!slides.length) return null;
  return (
    <div className="relative overflow-hidden bg-ink-50 py-3">
      <div className="flex transition-transform duration-700 ease-out" style={{ transform: `translateX(${-i * 100}%)` }}>
        {slides.map((s) => (
          <div key={s.id} className="w-full shrink-0 px-2 md:px-[6%]">
            <Link href={s.href} className="relative block h-44 overflow-hidden rounded-2xl text-white sm:h-56 md:h-72" style={{ background: `linear-gradient(110deg, ${s.palette[0]} 0%, ${s.palette[0]} 45%, ${s.palette[1]} 100%)` }}>
              <svg className="absolute inset-0 h-full w-full opacity-20" viewBox="0 0 800 300" preserveAspectRatio="none" aria-hidden>
                <ellipse cx="640" cy="160" rx="170" ry="120" fill="none" stroke="white" strokeWidth="26" /><ellipse cx="640" cy="160" rx="90" ry="60" fill="white" opacity=".4" />
                {Array.from({ length: 12 }).map((_, k) => <rect key={k} x={420 + k * 30} y={240 - (k % 4) * 22} width="14" height={80} rx="7" fill="white" opacity=".35" />)}
              </svg>
              <div className="relative flex h-full max-w-xl flex-col justify-center p-6 md:p-12">
                <span className="mb-2 w-fit rounded bg-white/20 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-widest backdrop-blur">Featured</span>
                <h2 className="text-2xl font-extrabold leading-tight md:text-4xl">{s.title}</h2>
                <p className="mt-2 text-sm text-white/85 md:text-base">{s.sub}</p>
                <span className="mt-5 w-fit rounded-lg bg-white px-5 py-2 text-sm font-semibold text-ink-900">{s.cta}</span>
              </div>
            </Link>
          </div>
        ))}
      </div>
      <button onClick={() => setI((i - 1 + slides.length) % slides.length)} className="absolute left-0 top-1/2 hidden -translate-y-1/2 rounded-r-lg bg-black/40 p-2 text-white md:block" aria-label="Previous"><Icon name="ChevronLeft" /></button>
      <button onClick={() => setI((i + 1) % slides.length)} className="absolute right-0 top-1/2 hidden -translate-y-1/2 rounded-l-lg bg-black/40 p-2 text-white md:block" aria-label="Next"><Icon name="ChevronRight" /></button>
      <div className="mt-3 flex justify-center gap-1.5">{slides.map((s, k) => <button key={s.id} onClick={() => setI(k)} aria-label={`Slide ${k + 1}`} className={`h-1.5 rounded-full transition-all ${k === i ? 'w-6 bg-ink-700' : 'w-1.5 bg-ink-300'}`} />)}</div>
    </div>
  );
}
