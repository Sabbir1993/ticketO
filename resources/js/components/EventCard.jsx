import Link from './Link';
import Poster from './Poster';
import Icon from './Icon';
import { bdt, compact, fmtDate } from '@/lib/utils';

export default function EventCard({ event: e }) {
  const movie = e.category === 'movies';
  return (
    <Link href={`/events/${e.slug}`} className="group block w-full animate-fadein">
      <div className="relative">
        <Poster event={e} className="aspect-[2/3] w-full shadow-card transition duration-300 group-hover:-translate-y-1 group-hover:shadow-pop" />
        <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 rounded-b-xl bg-black/85 px-3 py-1.5 text-xs text-white">
          {movie && !e.comingSoon ? (<><Icon name="Star" size={13} className="fill-brand-500 text-brand-500" /><span className="font-semibold">{(e.score / 10).toFixed(1)}/10</span><span className="text-white/70">{compact(e.votes)} Votes</span></>)
            : e.comingSoon ? <span>Releasing {fmtDate(e.releaseDate)}</span>
            : <span className="font-medium">{fmtDate(e.nextShow)}{e.showsCount > 1 ? ' onwards' : ''}</span>}
        </div>
        {e.tags?.includes('early-bird') && !e.soldOut && <span className="absolute left-2 top-2 rounded bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold uppercase text-ink-900">Early bird</span>}
        {e.soldOut && <span className="absolute left-2 top-2 rounded bg-ink-900 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">Sold out</span>}
      </div>
      <div className="mt-2.5 px-0.5">
        <h3 className="line-clamp-1 text-[15px] font-semibold text-ink-900">{e.title}</h3>
        {movie ? <p className="line-clamp-1 text-sm text-ink-500">{e.certificate} · {e.genres.join('/')}</p> : (
          <>
            <p className="line-clamp-1 text-sm text-ink-500">{e.venue?.name}</p>
            <p className="text-sm text-ink-700">{e.soldOut ? 'Sold out' : e.priceFrom === 0 ? 'Free' : `${bdt(e.priceFrom)} onwards`}</p>
          </>
        )}
      </div>
    </Link>
  );
}
