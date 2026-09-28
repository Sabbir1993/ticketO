import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Link from '@/components/Link';
import Poster from '@/components/Poster';
import Icon from '@/components/Icon';
import Modal from '@/components/Modal';
import VenueMap, { TierLegend } from '@/components/venue/VenueMap';
import { Loading, ErrorState } from '@/components/States';
import { api } from '@/lib/api';
import { useApi, useStore } from '@/lib/store';
import { bdt, compact, fmtDate, fmtTime } from '@/lib/utils';

const VIEW_LABEL = { 'stadium-cricket': 'Cricket stadium · pick your block', 'stadium-football': 'Football stadium · pick your stand', 'open-field': 'Open ground · pick your zone', hall: 'Hall · numbered seats', cinema: 'Cinema · numbered seats', 'ga-list': 'General admission' };

export default function EventPage() {
  const { slug } = useParams();
  const nav = useNavigate();
  const { prefs, toggleWishlist, toast, config } = useStore();
  const { data: e, error, loading, reload } = useApi(() => api.getEvent({ slug }), [slug]);
  const preview = useApi(() => (e && e.shows[0] && ['stadium-cricket', 'stadium-football', 'open-field'].includes(e.viewType) ? api.getAvailability({ showId: e.shows[0].id }) : null), [e?.id]);
  const [pick, setPick] = useState(false);
  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const movie = e.category === 'movies';
  const liked = prefs.wishlist.includes(e.id);
  const saleNotStarted = e.saleStart && new Date(e.saleStart) > new Date();
  const saleEnded = e.saleEnd && new Date(e.saleEnd) < new Date();
  const catName = config.categories.find((c) => c.id === e.category);
  const subName = catName?.subCategories.find((s) => s.id === e.subCategory)?.name;
  const book = () => { if (movie || new Set(e.shows.map((s) => s.venueId)).size > 1) return nav(`/events/${e.slug}/showtimes`); if (e.shows.length === 1) return nav(`/book/${e.shows[0].id}`); setPick(true); };
  const share = async () => { try { if (navigator.share) await navigator.share({ title: e.title, url: window.location.href }); else { await navigator.clipboard.writeText(window.location.href); toast('Link copied'); } } catch {} };
  const CTA = () => e.status === 'paused' ? <button disabled className="btn-dark h-12 w-full px-10 md:w-auto">Sales paused</button>
    : saleNotStarted ? <button disabled className="btn-dark h-12 w-full px-10 md:w-auto"><Icon name="Clock" size={18} />Sales open {fmtDate(e.saleStart)}, {fmtTime(e.saleStart)}</button>
    : saleEnded ? <button disabled className="btn-dark h-12 w-full px-10 md:w-auto">Online sales closed</button>
    : e.soldOut ? <button onClick={() => toast("You're on the waitlist — we'll SMS you")} className="btn-dark h-12 w-full px-10 md:w-auto"><Icon name="Bell" size={18} />Notify me</button>
    : !e.shows.length ? <button disabled className="btn-dark h-12 w-full px-10 md:w-auto">No upcoming shows</button>
    : <button onClick={book} className="btn-primary h-12 w-full px-12 text-base md:w-auto">{movie ? 'Book tickets' : e.viewType.startsWith('stadium') ? 'Choose seats' : 'Book now'}</button>;

  return (
    <div>
      <section className="relative overflow-hidden text-white" style={{ background: `linear-gradient(90deg, #1a1a1a 24%, ${e.palette[0]}cc 60%, ${e.palette[1]}66 100%)` }}>
        <div className="container-x relative flex flex-col gap-8 py-8 md:flex-row md:py-10">
          <Poster event={e} size="lg" className="mx-auto aspect-[2/3] w-56 shrink-0 shadow-2xl md:mx-0 md:w-64" />
          <div className="flex flex-1 flex-col justify-center">
            <div className="mb-2 flex flex-wrap gap-2 text-xs"><span className="rounded bg-white/15 px-2 py-0.5 font-medium">{catName?.name}{subName ? ` · ${subName}` : ''}</span><span className="rounded bg-white/15 px-2 py-0.5">{VIEW_LABEL[e.viewType]}</span></div>
            <h1 className="text-3xl font-extrabold md:text-4xl">{e.title}</h1>
            {movie && !e.comingSoon && <div className="mt-4 flex w-fit items-center gap-3 rounded-lg bg-ink-800/80 px-4 py-3"><Icon name="Star" className="fill-brand-500 text-brand-500" size={20} /><b className="text-lg">{(e.score / 10).toFixed(1)}/10</b><span className="text-sm text-white/70">({compact(e.votes)} Votes)</span></div>}
            <div className="mt-4 flex flex-wrap gap-2">{e.format.map((f) => <span key={f} className="rounded bg-white/90 px-2 py-0.5 text-xs font-semibold text-ink-900">{f}</span>)}<span className="rounded bg-white/90 px-2 py-0.5 text-xs font-semibold text-ink-900">{e.language}</span></div>
            <p className="mt-4 text-[15px] text-white/85">{e.duration} • {e.genres.join(', ')} • {e.certificate}{!movie && e.shows[0] ? ` • ${fmtDate(e.shows[0].date)}, ${fmtTime(e.shows[0].date)}${e.shows.length > 1 ? ` (+${e.shows.length - 1} more)` : ''}` : ''}</p>
            {!movie && <p className="mt-1 flex items-center gap-1.5 text-[15px] text-white/85"><Icon name="MapPin" size={15} />{e.venue?.name}</p>}
            {!movie && !e.soldOut && <p className="mt-2 text-lg font-semibold">{e.priceFrom === 0 ? 'Free' : `${bdt(e.priceFrom)} onwards`}</p>}
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <CTA />
              <button onClick={() => { toggleWishlist(e.id); toast(liked ? 'Removed from wishlist' : 'Added to wishlist'); }} className="flex h-12 w-12 items-center justify-center rounded-lg bg-white/10 hover:bg-white/20" aria-label="Wishlist"><Icon name="Heart" className={liked ? 'fill-brand-500 text-brand-500' : ''} /></button>
              <button onClick={share} className="flex h-12 w-12 items-center justify-center rounded-lg bg-white/10 hover:bg-white/20" aria-label="Share"><Icon name="Share2" /></button>
            </div>
          </div>
        </div>
      </section>
      <div className="container-x grid gap-10 py-8 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-8">
          <section><h2 className="text-2xl font-bold">About the {movie ? 'movie' : 'event'}</h2><p className="mt-3 leading-7 text-ink-700">{e.description}</p></section>
          {preview.data && (
            <section className="border-t border-ink-100 pt-8">
              <div className="flex flex-wrap items-end justify-between gap-2"><h2 className="text-2xl font-bold">Seating plan</h2><span className="text-sm text-ink-500">{preview.data.template.name}</span></div>
              <div className="card mt-4 p-4"><VenueMap viewType={e.viewType} spec={preview.data.template.spec} blocks={preview.data.blocks} mode="preview" onSelect={() => book()} /><div className="mt-3 border-t border-ink-100 pt-3"><TierLegend tiers={preview.data.tiers} blocks={preview.data.blocks} /></div></div>
            </section>
          )}
          {!preview.data && !!e.tiers.length && !movie && (
            <section className="border-t border-ink-100 pt-8"><h2 className="text-2xl font-bold">Ticket categories</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">{e.tiers.map((t) => <div key={t.id} className="card flex items-center gap-3 p-4"><span className="h-10 w-1.5 rounded-full" style={{ background: t.color }} /><div className="flex-1"><b>{t.name}</b>{t.earlyBirdActive && <span className="badge ml-2 bg-amber-100 text-amber-700">Early bird</span>}</div><b>{bdt(t.price)}</b></div>)}</div>
            </section>
          )}
          {!!e.cast.length && (
            <section className="border-t border-ink-100 pt-8">
              <h2 className="text-2xl font-bold">{movie ? 'Cast & Crew' : e.category === 'sports' ? 'Teams' : 'Artists & Speakers'}</h2>
              <div className="no-scrollbar mt-5 flex gap-6 overflow-x-auto">{e.cast.map((c) => <div key={c.name} className="w-28 shrink-0 text-center"><div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full text-2xl font-bold text-white" style={{ background: `linear-gradient(135deg, ${e.palette[0]}, ${e.palette[1]})` }}>{c.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}</div><div className="mt-2 text-sm font-medium leading-tight">{c.name}</div><div className="text-xs text-ink-500">{c.role}</div></div>)}</div>
            </section>
          )}
        </div>
        <aside className="space-y-4">
          {!movie && <div className="card p-5"><h3 className="font-semibold">Venue</h3><p className="mt-2 font-medium">{e.venue?.name}</p><p className="text-sm text-ink-500">{e.venue?.address}</p>{e.venue?.city !== 'online' && <a target="_blank" rel="noreferrer" href={`https://maps.google.com/?q=${encodeURIComponent(e.venue?.address || '')}`} className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand-500">Get directions <Icon name="ExternalLink" size={13} /></a>}</div>}
          <div className="card p-5"><h3 className="font-semibold">Organised by</h3><div className="mt-3 flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-lg bg-ink-800 font-bold text-white">{e.merchant?.name[0]}</span><div className="font-medium">{e.merchant?.name}</div></div>
            {!!e.sponsors.length && <><h3 className="mt-5 text-sm font-semibold text-ink-500">Sponsored by</h3><div className="mt-2 flex flex-wrap gap-2">{e.sponsors.map((s) => <span key={s} className="rounded-md border border-ink-100 px-3 py-1.5 text-sm font-semibold">{s}</span>)}</div></>}
          </div>
          <div className="card p-5 text-sm"><h3 className="font-semibold">Booking policy</h3>
            <ul className="mt-3 space-y-2 text-ink-700">
              {[['cancellable', `Cancellation up to ${e.policy?.refundWindowHrs}h before (${e.policy?.cancellationFeePct}% fee)`, 'No cancellation'], ['refundable', 'Refund on request', 'Non-refundable'], ['transferable', 'Ticket transfer allowed', 'Transfer not allowed']].map(([k, y, n]) => <li key={k} className="flex gap-2"><Icon name={e.policy?.[k] ? 'CheckCircle2' : 'XCircle'} size={17} className={e.policy?.[k] ? 'text-emerald-600' : 'text-ink-300'} />{e.policy?.[k] ? y : n}</li>)}
              <li className="flex gap-2"><Icon name="Info" size={17} className="text-ink-500" />Max {e.bookingLimit} tickets per order</li>
            </ul>
          </div>
        </aside>
      </div>
      <div className="sticky bottom-0 z-30 border-t border-ink-100 bg-white p-3 md:hidden"><CTA /></div>
      <Modal open={pick} onClose={() => setPick(false)} title="Select date & time">
        <div className="space-y-2">{e.shows.map((s) => <Link key={s.id} href={`/book/${s.id}`} className="flex items-center justify-between rounded-xl border border-ink-100 p-4 hover:border-brand-400"><div><div className="font-semibold">{fmtDate(s.date)}</div><div className="text-sm text-ink-500">{s.label} · {fmtTime(s.date)}</div></div><Icon name="ChevronRight" className="text-ink-300" /></Link>)}</div>
      </Modal>
    </div>
  );
}
