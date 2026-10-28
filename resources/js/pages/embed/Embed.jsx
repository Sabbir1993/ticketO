import { Link, Route, Routes, useParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { useApi } from '@/lib/store';
import { ErrorState, Loading } from '@/components/States';
import EventCard from '@/components/EventCard';
import Icon from '@/components/Icon';
import Poster from '@/components/Poster';
import { bdt, fmtDate, fmtTime } from '@/lib/utils';
import Book from '@/pages/customer/Book';
import Checkout from '@/pages/customer/Checkout';
import Payment from '@/pages/customer/Payment';
import Booking from '@/pages/customer/Booking';
import PaySimulate from '@/pages/customer/PaySimulate';

// Locked embed for a merchant or one event. No header, footer or site nav: every link stays under /embed/:token.
// Looks like the main site (same cards, posters and buttons). Booking pages are the customer ones, switched to
// token-scoped API calls by lib/bookingApi.
export default function Embed() {
  const { token } = useParams();
  return (
    <div className="min-h-screen bg-white text-ink-900">
      <Routes>
        <Route index element={<Home token={token} />} />
        <Route path="events/:slug" element={<EventPage token={token} />} />
        <Route path="book/:showId" element={<Book />} />
        <Route path="checkout/:holdId" element={<Checkout />} />
        <Route path="payment/:orderId" element={<Payment />} />
        <Route path="booking/:id" element={<Booking />} />
        <Route path="pay/simulate/:orderId" element={<PaySimulate />} />
      </Routes>
    </div>
  );
}

function Home({ token }) {
  const view = useApi(() => api.embedView({ token }), [token]);
  if (view.loading) return <Loading />;
  if (view.error) return <ErrorState error={view.error} onRetry={view.reload} />;
  if (view.data.scope === 'event') return <EventDetail token={token} event={view.data.event} />;
  return (
    <Page>
      <h1 className="text-2xl font-bold md:text-3xl">Events</h1>
      {!view.data.events.length && <p className="mt-4 text-ink-500">No events on sale right now.</p>}
      <div className="mt-5 grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
        {view.data.events.map((e) => <EventCard key={e.id} event={e} href={`/embed/${token}/events/${e.slug}`} />)}
      </div>
    </Page>
  );
}

function EventPage({ token }) {
  const { slug } = useParams();
  const ev = useApi(() => api.embedEvent({ token, slug }), [token, slug]);
  if (ev.loading) return <Loading />;
  if (ev.error) return <ErrorState error={ev.error} onRetry={ev.reload} />;
  return <EventDetail token={token} event={ev.data} list />;
}

function EventDetail({ token, event, list }) {
  const [a, b] = event.palette || ['#1E3A8A', '#2D499A'];
  return (
    <Page>
      {list && <Link to={`/embed/${token}`} className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-brand-500"><Icon name="ChevronLeft" size={16} />All events</Link>}
      <div className="card overflow-hidden">
        <div className="flex gap-4 p-5 text-white md:p-6" style={{ background: `linear-gradient(120deg, ${a}, ${b})` }}>
          <Poster event={event} className="h-36 w-24 shrink-0 rounded-lg ring-2 ring-white/40 md:h-44 md:w-28" showTitle={false} size="sm" />
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-widest opacity-80">{event.subCategory || event.category}</div>
            <h1 className="mt-1 text-2xl font-bold leading-tight md:text-3xl">{event.title}</h1>
            {event.venue && <p className="mt-2 text-sm opacity-90">{event.venue.name}, {event.venue.city}</p>}
          </div>
        </div>
        {event.description && <p className="p-5 text-sm leading-relaxed text-ink-700 md:p-6">{event.description}</p>}
      </div>
      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">Choose a show</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {event.shows.map((s) => (
            <Link key={s.id} to={`/embed/${token}/book/${s.id}`} className="card flex items-center justify-between gap-3 p-4 transition hover:border-brand-400">
              <div className="min-w-0">
                <div className="font-semibold">{fmtDate(s.date)}</div>
                <div className="text-sm text-ink-500">{fmtTime(s.date)}{s.label ? ` · ${s.label}` : ''}</div>
              </div>
              <span className="btn-primary h-9 shrink-0 px-4 text-sm">Book</span>
            </Link>
          ))}
          {!event.shows.length && <p className="text-ink-500">No upcoming shows.</p>}
        </div>
      </section>
      {!!event.tiers.length && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-semibold">Tickets</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {event.tiers.map((t) => <li key={t.id} className="card flex items-center justify-between p-4 text-sm"><span className="font-medium">{t.name}</span><b>{bdt(t.price)}</b></li>)}
          </ul>
        </section>
      )}
    </Page>
  );
}

// Same content width and gutters as the main site.
function Page({ children }) {
  return <div className="container-x py-5 md:py-8">{children}</div>;
}
