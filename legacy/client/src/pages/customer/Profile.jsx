import { useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import Link from '@/components/Link';
import Icon from '@/components/Icon';
import Modal from '@/components/Modal';
import Poster from '@/components/Poster';
import EventCard from '@/components/EventCard';
import { Loading, Empty } from '@/components/States';
import { api, getToken } from '@/lib/api';
import { useApi, useStore } from '@/lib/store';
import { LOYALTY_TIERS, STATUS_LABEL, bdt, cx, fmtDate, fmtTime, tierFor } from '@/lib/utils';

const TABS = [['bookings', 'Your Orders', 'Ticket'], ['wishlist', 'Wishlist', 'Heart'], ['rewards', 'Rewards', 'Crown'], ['settings', 'Settings', 'Settings']];
const PILL = { paid: 'bg-emerald-50 text-emerald-700', refund_requested: 'bg-amber-50 text-amber-700', refunded: 'bg-sky-50 text-sky-700' };

export default function Profile() {
  const [sp, setSp] = useSearchParams();
  const tab = sp.get('tab') || 'bookings';
  const { user, checked } = useStore();
  if (checked && (!user || user.role !== 'customer')) return tab === 'rewards' || tab === 'wishlist' ? <Shell tab={tab} setSp={setSp} user={user} /> : <Navigate to={`/login?next=${encodeURIComponent(`/profile?tab=${tab}`)}`} replace />;
  return <Shell tab={tab} setSp={setSp} user={user} />;
}

function Shell({ tab, setSp, user }) {
  return (
    <div className="bg-ink-50/70 py-6 md:py-10"><div className="container-x">
      <div className="mb-6 flex items-center gap-4"><span className="flex h-14 w-14 items-center justify-center rounded-full bg-ink-800 text-xl font-bold text-white">{user?.name?.[0] || <Icon name="User" />}</span><div><h1 className="text-2xl font-bold">{user?.role === 'customer' ? `Hi, ${user.name}` : 'Guest'}</h1><p className="text-sm text-ink-500">{user?.role === 'customer' ? user.phone : <Link href="/login?next=/profile" className="text-brand-500">Sign in to see your bookings</Link>}</p></div></div>
      <div className="grid gap-6 md:grid-cols-[220px_1fr]">
        <nav className="no-scrollbar flex gap-2 overflow-x-auto md:flex-col">{TABS.map(([k, l, i]) => <button key={k} onClick={() => setSp({ tab: k })} className={cx('flex shrink-0 items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium', tab === k ? 'bg-white text-brand-500 shadow-card' : 'text-ink-700 hover:bg-white/70')}><Icon name={i} size={18} />{l}</button>)}</nav>
        <div className="min-w-0">{tab === 'bookings' && <Bookings />}{tab === 'wishlist' && <Wishlist />}{tab === 'rewards' && <Rewards />}{tab === 'settings' && <Settings />}</div>
      </div>
    </div></div>
  );
}

function Bookings() {
  const { toast } = useStore();
  const { data, loading, reload } = useApi(() => api.myOrders(), []);
  const [filter, setFilter] = useState('upcoming');
  const [action, setAction] = useState(null);
  const [reason, setReason] = useState('');
  const [to, setTo] = useState({ name: '', phone: '' });
  if (loading) return <Loading />;
  const now = Date.now();
  const list = (data || []).filter((o) => (filter === 'upcoming' ? new Date(o.showDate) >= now : new Date(o.showDate) < now));
  const run = async () => {
    try {
      if (action.type === 'transfer') { await api.transferOrder({ orderId: action.o.id, ...to }); toast(`Transferred to ${to.name}. Old QR codes no longer work.`); }
      else { const r = await api.requestRefund({ orderId: action.o.id, reason }); toast(`Request sent — refund of ${bdt(r.refund.amount)} awaits approval`); }
      setAction(null); reload();
    } catch (e) { toast(e.message, 'err'); }
  };
  return (
    <div>
      <div className="mb-4 flex gap-2">{['upcoming', 'past'].map((f) => <button key={f} onClick={() => setFilter(f)} className={cx('chip capitalize', filter === f && 'chip-on')}>{f}</button>)}</div>
      {!list.length && <Empty icon="Ticket" title={`No ${filter} bookings`}><Link href="/" className="btn-primary mt-3 h-10 px-6 text-sm">Book something fun</Link></Empty>}
      <div className="space-y-4">{list.map((o) => {
        const hrs = (new Date(o.showDate) - now) / 3600000;
        return (
          <div key={o.id} className="card overflow-hidden">
            <div className="flex gap-4 p-4">
              <Poster event={o.event} className="h-28 w-20 shrink-0 rounded-lg" showTitle={false} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-2"><h3 className="text-lg font-semibold">{o.event.title}</h3><span className={cx('badge', PILL[o.status] || 'bg-ink-100 text-ink-700')}>{STATUS_LABEL[o.status]}</span></div>
                <p className="text-sm text-ink-500">{fmtDate(o.showDate)} · {fmtTime(o.showDate)} · {o.venue?.name}</p>
                <p className="mt-1 text-sm">{o.tickets.length} ticket(s) · {o.items.map((i) => (i.type === 'seat' ? `${i.blockId}-${i.seat}` : `${i.blockName}×${i.qty}`)).join(', ')}</p>
                <p className="mt-1 text-sm text-ink-500">Booking <b className="text-ink-900">{o.id}</b> · Paid {bdt(o.amounts.total)}</p>
                {o.refund && <p className="mt-1 text-xs text-ink-500">Refund {bdt(o.refund.amount)}{o.refund.fee ? ` (fee ${bdt(o.refund.fee)})` : ''} · {o.refund.reason}{o.refund.note ? ` · ${o.refund.note}` : ''}</p>}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 border-t border-ink-100 bg-ink-50/60 px-4 py-2.5">
              <Link href={`/booking/${o.id}`} className="btn-ghost h-8 px-3 text-sm"><Icon name="QrCode" size={15} />View ticket</Link>
              {o.status === 'paid' && hrs > 0 && <button onClick={() => setAction({ type: 'refund', o })} className="btn-ghost h-8 px-3 text-sm"><Icon name="RotateCcw" size={15} />Cancel / refund</button>}
              {o.status === 'paid' && hrs > 0 && o.event && <button onClick={() => setAction({ type: 'transfer', o })} className="btn-ghost h-8 px-3 text-sm"><Icon name="ArrowRightLeft" size={15} />Transfer</button>}
            </div>
          </div>
        );
      })}</div>
      <Modal open={!!action} onClose={() => setAction(null)} title={action?.type === 'transfer' ? 'Transfer tickets' : 'Cancel & request refund'}>
        {action?.type === 'transfer' ? (
          <div className="space-y-3"><p className="text-sm text-ink-500">New QR codes go to the recipient; current ones stop working.</p>
            <div><label className="label" htmlFor="tn">Recipient name</label><input id="tn" className="input" value={to.name} onChange={(e) => setTo({ ...to, name: e.target.value })} /></div>
            <div><label className="label" htmlFor="tp">Recipient mobile</label><input id="tp" className="input" value={to.phone} onChange={(e) => setTo({ ...to, phone: e.target.value })} placeholder="01XXXXXXXXX" /></div>
            <button onClick={run} className="btn-primary h-11 w-full">Transfer</button></div>
        ) : (
          <div className="space-y-3"><p className="text-sm text-ink-500">The organiser&apos;s policy decides the refund amount; cancellation fees are shown after you submit.</p>
            <div><label className="label" htmlFor="rs">Reason</label><select id="rs" className="input" value={reason} onChange={(e) => setReason(e.target.value)}><option value="">Select a reason</option><option>Change of plans</option><option>Booked wrong show</option><option>Event rescheduled</option><option>Other</option></select></div>
            <button onClick={run} className="btn-primary h-11 w-full">Submit request</button></div>
        )}
      </Modal>
    </div>
  );
}

function Wishlist() {
  const { prefs } = useStore();
  const { data } = useApi(() => api.listEvents({}), []);
  const w = (data || []).filter((e) => prefs.wishlist.includes(e.id));
  return w.length ? <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">{w.map((e) => <EventCard key={e.id} event={e} />)}</div> : <Empty icon="Heart" title="Nothing saved yet">Tap ♡ on any event to save it here.</Empty>;
}

function Rewards() {
  const { prefs, setPrefs, toast } = useStore();
  const tier = tierFor(prefs.lifetimePoints); const next = LOYALTY_TIERS.find((t) => t.min > prefs.lifetimePoints);
  const today = new Date().toDateString(); const checked = prefs.checkins.includes(today);
  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-gradient-to-br from-ink-900 via-ink-800 to-brand-700 p-6 text-white">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div><div className="flex items-center gap-2 text-sm uppercase tracking-widest text-amber-300"><Icon name="Crown" size={16} />{tier.name} member</div><div className="mt-2 text-4xl font-extrabold">{prefs.points.toLocaleString()} <span className="text-lg font-medium text-white/70">points</span></div></div>
          <button disabled={checked} onClick={() => { setPrefs((p) => ({ checkins: [...p.checkins, today], points: p.points + 10, lifetimePoints: p.lifetimePoints + 10 })); toast('+10 points'); }} className="btn h-10 bg-white px-5 text-sm text-ink-900 disabled:opacity-60"><Icon name="Flame" size={16} className="text-amber-500" />{checked ? 'Checked in today' : 'Daily check-in +10'}</button>
        </div>
        <div className="mt-6"><div className="flex justify-between text-xs text-white/70"><span>{tier.name}</span><span>{next ? `${next.min - prefs.lifetimePoints} pts to ${next.name}` : 'Top tier'}</span></div><div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/20"><div className="h-full rounded-full bg-amber-300" style={{ width: `${next ? ((prefs.lifetimePoints - tier.min) / (next.min - tier.min)) * 100 : 100}%` }} /></div></div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">{LOYALTY_TIERS.map((t) => <div key={t.id} className={cx('card p-5', t.id === tier.id && 'ring-2 ring-brand-500')}><div className="flex items-center justify-between"><b>{t.name}</b><span className="text-xs text-ink-500">{t.min}+ pts</span></div><ul className="mt-3 space-y-1.5 text-sm text-ink-700">{t.perks.map((p) => <li key={p} className="flex gap-2"><Icon name="Check" size={15} className="mt-0.5 shrink-0 text-emerald-600" />{p}</li>)}</ul></div>)}</div>
    </div>
  );
}

function Settings() {
  const { user, signIn, toast, signOut } = useStore();
  const [f, setF] = useState({ name: user?.name || '', email: user?.email || '' });
  const save = async () => { const u = await api.updateProfile(f); signIn({ token: getToken(), user: u }); toast('Profile saved'); };
  return (
    <div className="card p-6"><h2 className="text-lg font-semibold">Account</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2"><div><label className="label" htmlFor="sn">Full name</label><input id="sn" className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div><div><label className="label" htmlFor="se">Email</label><input id="se" className="input" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div></div>
      <div className="mt-6 flex gap-3"><button onClick={save} className="btn-primary h-11 px-6">Save</button><button onClick={signOut} className="btn-outline h-11 px-6">Sign out</button></div>
    </div>
  );
}
