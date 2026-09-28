// Home page is fully config-driven: Admin → Home page decides which sections appear,
// their order, titles and which events each row pulls in.
import Link from '@/components/Link';
import Carousel from '@/components/Carousel';
import Row from '@/components/Row';
import EventCard from '@/components/EventCard';
import Icon from '@/components/Icon';
import { Loading, ErrorState } from '@/components/States';
import { api } from '@/lib/api';
import { useApi, useStore } from '@/lib/store';

const TILE = ['#2D499A', '#EE3240', '#1E3A8A', '#0F766E', '#B45309', '#7C3AED', '#0369A1', '#BE123C', '#0F172A'];
const W = 'w-[44%] shrink-0 snap-start sm:w-[30%] md:w-[18.5%]';
export const SORTS = { date: 'Soonest first', score: 'Top rated', price: 'Lowest price', popular: 'Most voted' };
const sorter = {
  date: (a, b) => (a.nextShow ? new Date(a.nextShow).getTime() : Infinity) - (b.nextShow ? new Date(b.nextShow).getTime() : Infinity),
  score: (a, b) => b.score - a.score,
  price: (a, b) => (a.priceFrom ?? Infinity) - (b.priceFrom ?? Infinity),
  popular: (a, b) => b.votes - a.votes,
};

export function pickEvents(list, s) {
  return list
    .filter((e) => (!s.categories?.length || s.categories.includes(e.category)) && (s.includeUpcoming || !e.comingSoon) && (!s.tag || e.tags?.includes(s.tag)))
    .sort(sorter[s.sort] || sorter.date)
    .slice(0, Number(s.limit) || 20);
}

export function HomeSection({ s, list, config, cityName }) {
  if (s.hidden) return null;
  if (s.type === 'banners') return null; // rendered full-bleed above the container
  if (s.type === 'row') {
    const items = pickEvents(list, s);
    if (!items.length) return null;
    const href = s.categories?.length === 1 ? `/explore?category=${s.categories[0]}` : '/explore';
    return <Row title={`${s.title}${s.cityName !== false && s.categories?.includes('movies') && cityName ? ` in ${cityName}` : ''}`} href={href}>{items.map((e) => <div key={e.id} className={W}><EventCard event={e} /></div>)}</Row>;
  }
  if (s.type === 'cta') {
    return (
      <Link href={s.href || '/'} className="my-2 flex items-center justify-between gap-4 overflow-hidden rounded-2xl bg-gradient-to-r from-ink-900 via-brand-900 to-brand-700 px-6 py-5 text-white">
        <div className="flex items-center gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent-500"><Icon name={s.icon || 'Store'} /></span>
          <div><div className="text-lg font-bold">{s.title}</div>{s.sub && <div className="text-sm text-white/75">{s.sub}</div>}</div>
        </div>
        {s.cta && <span className="hidden shrink-0 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-brand-700 sm:block">{s.cta}</span>}
      </Link>
    );
  }
  if (s.type === 'categories') {
    const cats = config.categories.filter((c) => !s.categories?.length || s.categories.includes(c.id));
    return (
      <section className="py-6">
        <h2 className="mb-4 text-xl font-bold md:text-2xl">{s.title}</h2>
        <div className="no-scrollbar flex gap-4 overflow-x-auto pb-2">
          {cats.map((c, k) => (
            <Link key={c.id} href={`/explore?category=${c.id}`} className="relative flex h-40 w-36 shrink-0 flex-col justify-between overflow-hidden rounded-2xl p-4 text-white transition hover:-translate-y-1 md:w-40" style={{ background: `linear-gradient(160deg, ${TILE[k % TILE.length]} 0%, #0F172A 130%)` }}>
              <Icon name={c.icon} size={30} strokeWidth={1.5} />
              <div><div className="text-lg font-bold leading-tight">{c.name}</div><div className="text-xs text-white/75">{list.filter((e) => e.category === c.id).length} events</div></div>
            </Link>
          ))}
        </div>
      </section>
    );
  }
  return null;
}

export default function Home() {
  const { config, prefs } = useStore();
  const { data, error, loading, reload } = useApi(() => api.listEvents({ city: prefs.city || undefined }), [prefs.city]);
  const cityName = config.cities.find((c) => c.id === prefs.city)?.name;
  const sections = config.home || [];
  const bannersFirst = sections[0]?.type === 'banners' && !sections[0].hidden;
  return (
    <>
      {bannersFirst && <Carousel slides={config.banners} />}
      <div className="container-x">
        {loading && <Loading />}
        {error && <ErrorState error={error} onRetry={reload} />}
        {data && sections.map((s, i) => (s.type === 'banners' && !s.hidden && i > 0
          ? <div key={s.id} className="-mx-4 my-4 sm:mx-0"><Carousel slides={config.banners} /></div>
          : <HomeSection key={s.id} s={s} list={data} config={config} cityName={cityName} />))}
      </div>
    </>
  );
}
