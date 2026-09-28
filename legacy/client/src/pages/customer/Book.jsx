import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Icon from '@/components/Icon';
import BookingView from '@/components/venue/BookingView';
import { Loading, ErrorState } from '@/components/States';
import { api } from '@/lib/api';
import { useApi, useStore } from '@/lib/store';
import { fmtDate, fmtTime } from '@/lib/utils';

export default function Book() {
  const { showId } = useParams();
  const nav = useNavigate();
  const { toast } = useStore();
  const { data, error, loading, reload, setData } = useApi(() => api.getAvailability({ showId }), [showId]);
  const [busy, setBusy] = useState(false);
  // Live availability: refresh every 15 s
  useEffect(() => { const t = setInterval(() => api.getAvailability({ showId }).then(setData).catch(() => {}), 15000); return () => clearInterval(t); }, [showId]); // eslint-disable-line
  if (loading && !data) return <Loading label="Loading seat map…" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const proceed = async (sel) => {
    setBusy(true);
    try { const hold = await api.createHold({ showId, ...sel }); nav(`/checkout/${hold.id}`); }
    catch (e) { toast(e.message, 'err'); if (e.status === 409) reload(); }
    finally { setBusy(false); }
  };
  return (
    <div className="bg-ink-50/70">
      <div className="sticky top-16 z-30 border-b border-ink-100 bg-white md:top-[104px]">
        <div className="container-x flex items-center gap-3 py-3">
          <button onClick={() => nav(-1)} className="rounded-full p-1.5 hover:bg-ink-50" aria-label="Back"><Icon name="ChevronLeft" /></button>
          <div className="min-w-0 flex-1"><div className="truncate font-semibold">{data.event.title}</div><div className="truncate text-xs text-ink-500">{data.venue?.name} | {fmtDate(data.show.date)}, {fmtTime(data.show.date)}{data.show.format ? ` | ${data.show.format}` : ''}</div></div>
          <span className="hidden items-center gap-2 text-xs text-emerald-700 sm:flex"><span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" /></span>Live availability</span>
        </div>
      </div>
      <div className="container-x py-5"><BookingView data={data} onProceed={proceed} busy={busy} /></div>
    </div>
  );
}
