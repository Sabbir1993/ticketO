import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Icon from '@/components/Icon';
import { Loading, ErrorState } from '@/components/States';
import { api } from '@/lib/api';
import { useApi, useStore } from '@/lib/store';
import { cx, dateStrip, fmtTime, monthShort, sameDay, weekday } from '@/lib/utils';

export default function Showtimes() {
  const { slug } = useParams();
  const nav = useNavigate();
  const { prefs } = useStore();
  const { data: e, error, loading, reload } = useApi(() => api.getEvent({ slug }), [slug]);
  const [day, setDay] = useState(null);
  const [fmt, setFmt] = useState('');
  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const days = dateStrip(7);
  const cur = day || days.find((d) => e.shows.some((s) => sameDay(s.date, d))) || days[0];
  const venues = e.venues.filter((v) => !prefs.city || v.city === prefs.city);
  const shown = venues.length ? venues : e.venues;
  return (
    <div className="bg-ink-50/70 pb-10">
      <div className="bg-white"><div className="container-x py-5"><h1 className="text-2xl font-bold md:text-3xl">{e.title} — ({e.language})</h1><div className="mt-2 flex flex-wrap gap-2 text-xs"><span className="rounded-full border border-ink-300 px-2 py-0.5 font-medium">{e.certificate}</span>{e.genres.map((g) => <span key={g} className="rounded-full border border-ink-100 px-2 py-0.5 uppercase tracking-wide text-ink-500">{g}</span>)}</div></div></div>
      <div className="sticky top-16 z-20 border-y border-ink-100 bg-white md:top-[104px]">
        <div className="container-x flex flex-wrap items-center justify-between gap-3 py-2">
          <div className="no-scrollbar flex gap-1 overflow-x-auto">{days.map((d) => { const has = e.shows.some((s) => sameDay(s.date, d)); const on = sameDay(d, cur); return <button key={d} disabled={!has} onClick={() => setDay(d)} className={cx('flex w-14 shrink-0 flex-col items-center rounded-lg py-1.5', on ? 'bg-brand-500 text-white' : has ? 'hover:bg-ink-50' : 'text-ink-300')}><span className="text-[10px] font-medium uppercase">{weekday(d)}</span><span className="text-lg font-bold leading-6">{new Date(d).getDate()}</span><span className="text-[10px] uppercase">{monthShort(d)}</span></button>; })}</div>
          {!!e.format.length && <select value={fmt} onChange={(x) => setFmt(x.target.value)} className="h-9 rounded-lg border border-ink-100 px-2 text-sm" aria-label="Format"><option value="">All formats</option>{e.format.map((f) => <option key={f}>{f}</option>)}</select>}
        </div>
      </div>
      <div className="container-x mt-4">
        <div className="card divide-y divide-ink-100">
          {shown.map((v) => {
            const ss = e.shows.filter((s) => s.venueId === v.id && sameDay(s.date, cur) && (!fmt || s.format === fmt));
            return (
              <div key={v.id} className="flex flex-col gap-4 p-5 md:flex-row">
                <div className="md:w-72 md:shrink-0"><div className="font-semibold">{v.name}</div><div className="mt-1 flex gap-3 text-xs"><span className="flex items-center gap-1 text-emerald-600"><Icon name="Smartphone" size={13} />M-Ticket</span>{v.facilities.includes('Food court') && <span className="flex items-center gap-1 text-amber-600"><Icon name="Receipt" size={13} />Food & Beverage</span>}</div></div>
                <div className="flex flex-1 flex-wrap gap-3">
                  {ss.map((s) => <button key={s.id} onClick={() => nav(`/book/${s.id}`)} className="w-28 rounded-lg border border-ink-100 px-3 py-2 text-center hover:border-emerald-500"><div className="text-sm font-medium text-emerald-600">{fmtTime(s.date)}</div><div className="text-[10px] uppercase text-ink-500">{s.format || s.label}</div></button>)}
                  {!ss.length && <span className="text-sm text-ink-500">No shows on this day.</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
