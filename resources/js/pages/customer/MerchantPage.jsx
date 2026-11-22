// Public organiser page (/m/:slug): banner, logo, tagline, about and that organiser's events, in its own colours.
import { useParams } from 'react-router-dom';
import EventCard from '@/components/EventCard';
import MerchantTheme from '@/components/MerchantTheme';
import { Loading, ErrorState, Empty } from '@/components/States';
import { api } from '@/lib/api';
import { useApi } from '@/lib/store';

export default function MerchantPage() {
  const { slug } = useParams();
  const { data: m, error, loading, reload } = useApi(() => api.getMerchantPage({ slug }), [slug]);
  const events = useApi(() => (m ? api.listEvents({ merchant: m.id }) : null), [m?.id]);
  if (loading) return <Loading />;
  if (error) return <ErrorState error={error.status === 404 ? { message: 'We could not find this organiser.' } : error} onRetry={reload} />;
  const list = events.data || [];
  const upcoming = list.filter((e) => !e.comingSoon);
  const soon = list.filter((e) => e.comingSoon);
  return (
    <MerchantTheme theme={m.theme}>
      <section className="relative overflow-hidden bg-brand-700 text-white" style={m.bannerUrl ? undefined : { background: 'linear-gradient(110deg, rgb(var(--brand-800)), rgb(var(--brand-500)) 65%, rgb(var(--accent-500)))' }}>
        {m.bannerUrl && <><img src={m.bannerUrl} alt="" className="absolute inset-0 h-full w-full object-cover" /><div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/40 to-transparent" /></>}
        <div className="container-x relative flex flex-col gap-5 py-10 sm:flex-row sm:items-center md:py-14">
          {m.logoUrl
            ? <img src={m.logoUrl} alt={`${m.name} logo`} className="h-24 w-24 shrink-0 rounded-2xl bg-white object-contain p-2 shadow-pop" />
            : <span className="flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl bg-white text-4xl font-bold text-brand-600 shadow-pop" aria-hidden="true">{m.name[0]}</span>}
          <div>
            <h1 className="text-3xl font-bold md:text-4xl">{m.name}</h1>
            {m.tagline && <p className="mt-1 text-lg text-white/90">{m.tagline}</p>}
            <p className="mt-3 text-sm text-white/80">{upcoming.length} on sale{soon.length ? ` · ${soon.length} coming soon` : ''}</p>
          </div>
        </div>
      </section>
      <div className="container-x py-8">
        {m.about && <section className="mb-8 max-w-3xl"><h2 className="text-xl font-bold">About</h2><p className="mt-2 whitespace-pre-line text-ink-700">{m.about}</p></section>}
        <h2 className="text-xl font-bold">Events by {m.name}</h2>
        {events.loading ? <Loading /> : !list.length ? <Empty icon="Calendar" title="No events on sale right now">Check back soon.</Empty> : (
          <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">{list.map((e) => <EventCard key={e.id} event={e} />)}</div>
        )}
      </div>
    </MerchantTheme>
  );
}
