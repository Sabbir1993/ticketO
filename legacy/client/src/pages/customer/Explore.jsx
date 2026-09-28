import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import EventCard from '@/components/EventCard';
import Icon from '@/components/Icon';
import { Loading, Empty } from '@/components/States';
import { api } from '@/lib/api';
import { useApi, useStore } from '@/lib/store';
import { cx } from '@/lib/utils';

const DATES = [['today', 'Today'], ['tomorrow', 'Tomorrow'], ['weekend', 'This Weekend'], ['week', 'Next 7 days']];
const PRICES = [['free', 'Free'], ['0-500', '৳0 – 500'], ['501-2000', '৳501 – 2,000'], ['2001+', 'Above ৳2,000']];
function matchDate(e, key) {
  if (!e.nextShow) return false;
  const d = new Date(e.nextShow); const t0 = new Date(); t0.setHours(0, 0, 0, 0); const diff = Math.floor((d - t0) / 86400000);
  if (key === 'today') return diff === 0; if (key === 'tomorrow') return diff === 1;
  if (key === 'weekend') return diff < 7 && [5, 6].includes(d.getDay()); return diff < 7;
}
function matchPrice(p, key) { if (key === 'free') return p === 0; if (key === '2001+') return p > 2000; const [a, b] = key.split('-').map(Number); return p >= a && p <= b; }

export default function Explore() {
  const [sp, setSp] = useSearchParams();
  const { config, prefs } = useStore();
  const category = sp.get('category') || ''; const sub = sp.get('sub') || ''; const q = sp.get('q') || '';
  const { data, loading } = useApi(() => api.listEvents({ city: prefs.city || undefined, category: category || undefined, q: q || undefined }), [prefs.city, category, q]);
  const [f, setF] = useState({ date: [], lang: [], price: [] });
  const [sort, setSort] = useState('popular');
  const [mobile, setMobile] = useState(false);
  const cat = config.categories.find((c) => c.id === category);
  const base = (data || []).filter((e) => !sub || e.subCategory === sub);
  const langs = [...new Set(base.map((e) => e.language).filter((l) => l && l !== '—'))];
  const list = useMemo(() => {
    let r = base.filter((e) => (!f.date.length || f.date.some((d) => matchDate(e, d))) && (!f.lang.length || f.lang.includes(e.language)) && (!f.price.length || f.price.some((p) => matchPrice(e.priceFrom, p))));
    if (sort === 'price') r = [...r].sort((a, b) => a.priceFrom - b.priceFrom);
    else if (sort === 'date') r = [...r].sort((a, b) => new Date(a.nextShow || 0) - new Date(b.nextShow || 0));
    else r = [...r].sort((a, b) => b.score - a.score);
    return r;
  }, [base, f, sort]);
  const toggle = (k, v) => setF((s) => ({ ...s, [k]: s[k].includes(v) ? s[k].filter((x) => x !== v) : [...s[k], v] }));
  const setParam = (patch) => { const n = new URLSearchParams(sp); Object.entries(patch).forEach(([k, v]) => (v ? n.set(k, v) : n.delete(k))); setSp(n); };
  const Section = ({ title, fk, items }) => (
    <div className="card mb-3 p-4">
      <div className="flex items-center justify-between"><span className="font-medium">{title}</span>{!!f[fk].length && <button onClick={() => setF((s) => ({ ...s, [fk]: [] }))} className="text-xs text-ink-500 hover:text-brand-500">Clear</button>}</div>
      <div className="mt-3 flex flex-wrap gap-2">{items.map(([v, l]) => <button key={v} onClick={() => toggle(fk, v)} className={cx('rounded border px-3 py-1 text-sm transition', f[fk].includes(v) ? 'border-brand-500 bg-brand-500 text-white' : 'border-ink-100 text-brand-500 hover:border-brand-400')}>{l}</button>)}</div>
    </div>
  );
  return (
    <div className="bg-ink-50/70">
      <div className="container-x py-6 md:py-8">
        <div className="flex gap-8">
          <aside className={cx('w-full shrink-0 md:block md:w-72', mobile ? 'fixed inset-0 z-50 block overflow-y-auto bg-ink-50 p-4' : 'hidden')}>
            <div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-bold">Filters</h2>{mobile && <button onClick={() => setMobile(false)} className="btn-primary h-9 px-4 text-sm">Show {list.length} results</button>}</div>
            <Section title="Date" fk="date" items={DATES} />
            {!!langs.length && <Section title="Languages" fk="lang" items={langs.map((l) => [l, l])} />}
            <Section title="Price" fk="price" items={PRICES} />
          </aside>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold">{q ? `Results for “${q}”` : `${cat?.subCategories.find((s) => s.id === sub)?.name || cat?.name || 'Events'} in ${config.cities.find((c) => c.id === prefs.city)?.name || 'Bangladesh'}`}</h1>
            <div className="no-scrollbar mt-4 flex gap-2 overflow-x-auto pb-1">
              <button onClick={() => setParam({ category: '', sub: '' })} className={cx('chip shrink-0', !category && 'chip-on')}>All</button>
              {config.categories.map((c) => <button key={c.id} onClick={() => setParam({ category: c.id, sub: '' })} className={cx('chip shrink-0', category === c.id && 'chip-on')}>{c.name}</button>)}
            </div>
            {!!cat?.subCategories.length && (
              <div className="mt-3 flex flex-wrap gap-2">{cat.subCategories.map((s) => <button key={s.id} onClick={() => setParam({ sub: sub === s.id ? '' : s.id })} className={cx('rounded-full border px-3 py-1 text-xs font-medium', sub === s.id ? 'border-ink-800 bg-ink-800 text-white' : 'border-ink-300 bg-white text-ink-700')}>{s.name}</button>)}</div>
            )}
            <div className="mt-4 flex items-center justify-between gap-3">
              <button onClick={() => setMobile(true)} className="btn-outline h-9 px-3 text-sm md:hidden"><Icon name="Filter" size={15} />Filters</button>
              <span className="hidden text-sm text-ink-500 md:block">{list.length} result{list.length === 1 ? '' : 's'}</span>
              <select value={sort} onChange={(e) => setSort(e.target.value)} className="h-9 rounded-lg border border-ink-100 bg-white px-2 text-sm" aria-label="Sort"><option value="popular">Sort: Popularity</option><option value="date">Sort: Date</option><option value="price">Sort: Price (low → high)</option></select>
            </div>
            {loading ? <Loading /> : list.length ? <div className="mt-5 grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">{list.map((e) => <EventCard key={e.id} event={e} />)}</div>
              : <div className="mt-6"><Empty title="No events match these filters"><button onClick={() => setF({ date: [], lang: [], price: [] })} className="text-brand-500">Clear all filters</button></Empty></div>}
          </div>
        </div>
      </div>
    </div>
  );
}
