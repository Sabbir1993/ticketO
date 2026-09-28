import { useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import Link from '@/components/Link';
import PortalShell, { Stat, Panel, Pill } from '@/components/portal/PortalShell';
import BarChart, { HBars } from '@/components/BarChart';
import Poster from '@/components/Poster';
import Icon from '@/components/Icon';
import { Loading, Empty } from '@/components/States';
import EventEditor from './EventEditor';
import PgForm from './PgForm';
import { api, uploadFile, MODE } from '@/lib/api';
import { useApi, useStore } from '@/lib/store';
import { STATUS_LABEL, bdt, bdtPlain, downloadCSV, fmtDate, fmtTime } from '@/lib/utils';

const NAV = [
  { id: '', label: 'Dashboard', icon: 'LayoutDashboard' },
  { section: 'Events' },
  { id: 'events', label: 'My events', icon: 'Calendar' },
  { id: 'events/new', label: 'Create event', icon: 'Plus' },
  { section: 'Sales' },
  { id: 'orders', label: 'Orders & refunds', icon: 'Users' },
  { id: 'settlement', label: 'Settlement', icon: 'Wallet' },
  { section: 'Settings' },
  { id: 'payments', label: 'Payment gateway', icon: 'Plug' },
  { id: 'business', label: 'Business & KYC', icon: 'Building2' },
  { section: 'Operations' },
  { id: '~pos', label: 'POS box office', icon: 'LayoutGrid' },
  { id: '~gate', label: 'Gate scanner', icon: 'ScanLine' },
];

export default function MerchantPortal() {
  const { user, merchant, checked, signOut } = useStore();
  const nav = useNavigate();
  const { pathname } = useLocation();
  if (!checked) return <Loading />;
  if (!user || user.role !== 'merchant') return <Navigate to={`/partner/login?next=${encodeURIComponent(pathname)}`} replace />;
  const active = pathname.replace(/^\/merchant\/?/, '').replace(/^events\/(?!new).+/, 'events');
  return (
    <PortalShell title="Merchant portal" subtitle={merchant?.type} user={merchant?.name || user.name} nav={NAV} active={active}
      onNav={(id) => nav(id.startsWith('~') ? `/${id.slice(1)}` : `/merchant${id ? `/${id}` : ''}`)}
      actions={<><Link href="/merchant/events/new" className="btn-primary hidden h-9 px-4 text-sm sm:inline-flex"><Icon name="Plus" size={15} />New event</Link><button onClick={() => { signOut(); nav('/'); }} className="btn-ghost h-9 px-3 text-sm"><Icon name="LogOut" size={15} />Sign out</button></>}>
      {merchant?.status !== 'active' && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <Icon name="Hourglass" size={18} />
          <div className="flex-1"><b>{merchant?.status === 'rejected' ? 'KYC needs attention' : merchant?.status === 'suspended' ? 'Account suspended' : 'KYC under review'}.</b> {merchant?.status === 'pending' ? 'You can set up events now — publishing unlocks once the platform approves your documents.' : merchant?.kyc?.note || 'Contact support.'}</div>
          {MODE === 'local' && merchant?.status === 'pending' && <Link href="/admin/merchants" className="btn-dark h-8 px-3 text-xs">Demo: approve as admin</Link>}
        </div>
      )}
      <Routes>
        <Route index element={<Dashboard />} />
        <Route path="events" element={<Events />} />
        <Route path="events/new" element={<EventEditor />} />
        <Route path="events/:id" element={<EventEditor />} />
        <Route path="orders" element={<Orders />} />
        <Route path="settlement" element={<Settlement />} />
        <Route path="payments" element={<Payments />} />
        <Route path="business" element={<Business />} />
      </Routes>
    </PortalShell>
  );
}

function Dashboard() {
  const { data, loading } = useApi(() => api.merchantDashboard(), []);
  if (loading) return <Loading />;
  const rev = data.stats.reduce((a, s) => a + s.revenue, 0); const sold = data.stats.reduce((a, s) => a + s.sold, 0); const cap = data.stats.reduce((a, s) => a + s.capacity, 0);
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Gross ticket sales" value={bdtPlain(rev)} sub={`${bdtPlain(data.stats.reduce((a, s) => a + s.onlineRevenue, 0))} via Ticketo this session`} icon="TrendingUp" />
        <Stat label="Tickets sold" value={sold.toLocaleString()} sub={`${cap ? Math.round((sold / cap) * 100) : 0}% of capacity`} icon="Ticket" />
        <Stat label="Events" value={data.events.total} sub={`${data.events.published} live · ${data.events.draft} draft${data.events.pending ? ` · ${data.events.pending} in review` : ''}`} icon="Calendar" />
        <Stat label="Payment collection" value={data.merchant.pg?.mode === 'direct' ? 'Direct' : 'Via Ticketo'} sub={data.merchant.pg?.mode === 'direct' ? (data.merchant.pg.sslcommerz?.verifiedAt ? 'Gateway verified' : 'Verify your gateway') : `${data.merchant.commissionPct}% commission`} icon="Plug" />
      </div>
      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <Panel title="Daily sales — last 14 days"><div className="p-5"><BarChart data={data.series} format={bdtPlain} label="Daily sales" /></div></Panel>
        <Panel title="Sell-through by event"><div className="p-5">{data.stats.length ? <HBars rows={data.stats.map((s) => ({ label: s.title, value: s.capacity ? Math.round((s.sold / s.capacity) * 100) : 0 }))} format={(v) => `${v}%`} /> : <p className="text-sm text-ink-500">Publish an event to see sales.</p>}</div></Panel>
      </div>
      <Panel title="Recent orders" action={<Link href="/merchant/orders" className="text-sm text-brand-500">View all</Link>}>{data.recentOrders.length ? <OrdersTable rows={data.recentOrders} /> : <p className="p-6 text-sm text-ink-500">No orders yet.</p>}</Panel>
    </div>
  );
}

function Events() {
  const { toast } = useStore();
  const nav = useNavigate();
  const { data, loading, reload } = useApi(() => api.merchantEvents(), []);
  if (loading) return <Loading />;
  const act = async (fn, msg) => { try { await fn(); toast(msg); reload(); } catch (e) { toast(e.message, 'err'); } };
  if (!data.length) return <Empty icon="Calendar" title="No events yet"><Link href="/merchant/events/new" className="btn-primary mt-3 h-10 px-5">Create your first event</Link></Empty>;
  return (
    <div className="space-y-3">
      {data.map((e) => (
        <div key={e.id} className="card flex flex-col gap-4 p-4 md:flex-row md:items-center">
          <Poster event={e} className="h-24 w-16 shrink-0 rounded-md" showTitle={false} size="sm" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2"><b className="text-lg">{e.title}</b><Pill status={e.status === 'pending_review' ? 'pending' : e.status} /></div>
            <div className="text-sm text-ink-500">{e.venue?.name} · {e.showsCount} show(s) · {e.viewType.replace('-', ' ')}</div>
            {e.reviewNote && <div className="text-xs text-brand-600">Admin: {e.reviewNote}</div>}
            <div className="mt-2 flex items-center gap-3"><div className="h-1.5 w-40 overflow-hidden rounded-full bg-ink-100"><div className="h-full bg-brand-500" style={{ width: `${e.stats.capacity ? Math.min(100, (e.stats.sold / e.stats.capacity) * 100) : 0}%` }} /></div><span className="text-xs text-ink-500">{e.stats.sold.toLocaleString()} / {e.stats.capacity.toLocaleString()} · {bdtPlain(e.stats.revenue)}</span></div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => nav(`/merchant/events/${e.id}`)} className="btn-outline h-9 px-3 text-sm"><Icon name="Pencil" size={14} />Edit</button>
            {e.status === 'published' && <Link href={`/events/${e.slug}`} className="btn-outline h-9 px-3 text-sm"><Icon name="Eye" size={14} />View</Link>}
            {e.status === 'published' && <button onClick={() => act(() => api.setEventStatus({ id: e.id, status: 'paused' }), 'Sales paused')} className="btn-outline h-9 px-3 text-sm"><Icon name="Pause" size={14} />Pause</button>}
            {e.status === 'paused' && <button onClick={() => act(() => api.setEventStatus({ id: e.id, status: 'published' }), 'Sales resumed')} className="btn-outline h-9 px-3 text-sm"><Icon name="Play" size={14} />Resume</button>}
            {['draft', 'rejected'].includes(e.status) && <button onClick={() => act(() => api.publishEvent({ id: e.id }), 'Published')} className="btn-primary h-9 px-3 text-sm"><Icon name="Rocket" size={14} />Publish</button>}
            {e.status === 'draft' && <button onClick={() => act(() => api.deleteEvent({ id: e.id }), 'Draft deleted')} className="btn-ghost h-9 px-3 text-sm text-ink-500" aria-label="Delete"><Icon name="Trash2" size={14} /></button>}
          </div>
        </div>
      ))}
    </div>
  );
}

export function OrdersTable({ rows, onRefund }) {
  return (
    <div className="overflow-x-auto"><table className="w-full"><thead className="bg-ink-50"><tr><th className="th">Booking</th><th className="th">Customer</th><th className="th">Event / show</th><th className="th">Tickets</th><th className="th">Amount</th><th className="th">Paid via</th><th className="th">Status</th>{onRefund && <th className="th" />}</tr></thead>
      <tbody className="divide-y divide-ink-100">{rows.map((o) => (
        <tr key={o.id}>
          <td className="td font-mono text-xs">{o.id}<div className="font-sans text-ink-500">{o.channel === 'pos' ? 'Box office' : 'Online'}</div></td>
          <td className="td">{o.contact?.name}<div className="text-xs text-ink-500">{o.contact?.phone}</div></td>
          <td className="td">{o.event?.title}<div className="text-xs text-ink-500">{fmtDate(o.showDate)} {fmtTime(o.showDate)}</div></td>
          <td className="td">{o.tickets.length} <span className="text-xs text-ink-500">({o.tickets.filter((t) => t.scanned).length} in)</span></td>
          <td className="td">{bdt(o.amounts.total)}</td>
          <td className="td text-xs capitalize">{o.payment?.gateway || '—'}{o.payment?.pgMode === 'direct' ? ' · direct' : ''}</td>
          <td className="td"><Pill status={o.status === 'pending_payment' ? 'pending' : o.status === 'paid' ? 'paid' : o.status} /></td>
          {onRefund && <td className="td">{o.status === 'refund_requested' && <div className="flex gap-1"><button onClick={() => onRefund(o, 'approve')} className="btn h-8 bg-emerald-600 px-2 text-xs text-white">Approve {bdt(o.refund.amount)}</button><button onClick={() => onRefund(o, 'reject')} className="btn-outline h-8 px-2 text-xs">Reject</button></div>}</td>}
        </tr>
      ))}</tbody></table></div>
  );
}

function Orders() {
  const { toast } = useStore();
  const { data, loading, reload } = useApi(() => api.merchantOrders(), []);
  if (loading) return <Loading />;
  const rows = data.filter((o) => o.status !== 'pending_payment');
  const refund = async (o, action) => { try { await api.reviewRefund({ orderId: o.id, action }); toast(action === 'approve' ? 'Refund approved' : 'Refund rejected'); reload(); } catch (e) { toast(e.message, 'err'); } };
  const csv = () => downloadCSV('orders.csv', [['Booking', 'Customer', 'Phone', 'Email', 'Event', 'Show', 'Tickets', 'Checked in', 'Total', 'Gateway', 'Channel', 'Status'], ...rows.map((o) => [o.id, o.contact.name, o.contact.phone, o.contact.email, o.event?.title, o.showDate, o.tickets.length, o.tickets.filter((t) => t.scanned).length, o.amounts.total, o.payment?.gateway, o.channel, o.status])]);
  return <Panel title={`Orders (${rows.length})`} action={<button onClick={csv} className="btn-outline h-8 px-3 text-sm"><Icon name="Download" size={14} />Export CSV</button>}>{rows.length ? <OrdersTable rows={rows} onRefund={refund} /> : <p className="p-6 text-sm text-ink-500">No orders yet. Share your event link or sell from the POS.</p>}</Panel>;
}

function Settlement() {
  const { data, loading } = useApi(() => api.merchantSettlement(), []);
  if (loading) return <Loading />;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Collection mode" value={data.mode === 'direct' ? 'Your own gateway' : 'Ticketo collects'} sub={`${data.commissionPct}% platform commission`} icon="Plug" />
        {data.mode === 'direct' ? <Stat label="Collected directly by you" value={bdtPlain(data.directCollected)} sub="Settled by your gateway" icon="Landmark" /> : <Stat label="Payable to you" value={bdtPlain(data.payableToMerchant)} sub="Next weekly payout" icon="Wallet" />}
        <Stat label="Commission due to Ticketo" value={bdtPlain(data.receivableFromMerchant)} sub={data.mode === 'direct' ? 'Invoiced monthly' : 'Deducted from payouts'} icon="Receipt" />
      </div>
      <Panel title="Ledger">
        {data.rows.length ? <div className="overflow-x-auto"><table className="w-full"><thead className="bg-ink-50"><tr><th className="th">Booking</th><th className="th">Date</th><th className="th">Event</th><th className="th">Collected by</th><th className="th">Ticket value</th><th className="th">Commission</th><th className="th">Net</th><th className="th">Status</th></tr></thead>
          <tbody className="divide-y divide-ink-100">{data.rows.map((r) => <tr key={r.id}><td className="td font-mono text-xs">{r.id}</td><td className="td">{fmtDate(r.date)}</td><td className="td">{r.event}</td><td className="td capitalize">{r.pgMode === 'direct' ? 'You' : 'Ticketo'}</td><td className="td">{bdtPlain(r.gross)}</td><td className="td text-brand-600">−{bdtPlain(r.commission)}</td><td className="td font-semibold">{bdtPlain(r.net)}</td><td className="td"><Pill status={r.status} /></td></tr>)}</tbody></table></div>
          : <p className="p-6 text-sm text-ink-500">No paid orders yet.</p>}
      </Panel>
    </div>
  );
}

function Payments() {
  const { merchant, setMerchant, config, toast } = useStore();
  const [pg, setPg] = useState(() => ({ mode: merchant?.pg?.mode || 'platform', sslcommerz: { sandbox: true, ...(merchant?.pg?.sslcommerz || {}) }, bkash: { sandbox: true, ...(merchant?.pg?.bkash || {}) } }));
  const [busy, setBusy] = useState(false);
  const [test, setTest] = useState(null);
  const save = async () => { setBusy(true); try { const m = await api.updatePaymentSettings(pg); setMerchant(m); toast('Payment settings saved'); setPg((p) => ({ ...p, sslcommerz: { ...p.sslcommerz, storePassword: m.pg?.sslcommerz?.storePassword || '' } })); } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); } };
  const run = async (gateway) => { setTest({ loading: true }); try { const r = await api.testPaymentConnection({ gateway }); setTest(r); const me = await api.me(); setMerchant(me.merchant); } catch (e) { setTest({ ok: false, message: e.message }); } };
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <Panel title="How customers pay you">
        <div className="space-y-5 p-5">
          <PgForm value={pg} onChange={setPg} allowDirect={config.platform.allowMerchantDirectPG} merchant={merchant} />
          <div className="flex flex-wrap gap-2 border-t border-ink-100 pt-4">
            <button onClick={save} disabled={busy} className="btn-primary h-10 px-5"><Icon name="Save" size={15} />Save</button>
            {pg.mode === 'direct' && <button onClick={() => run('sslcommerz')} className="btn-outline h-10 px-5"><Icon name="Plug" size={15} />Test SSLCOMMERZ connection</button>}
            {pg.mode === 'direct' && pg.bkash?.appKey && <button onClick={() => run('bkash')} className="btn-outline h-10 px-5">Test bKash</button>}
          </div>
          {test && <div className={`rounded-xl p-3 text-sm ${test.loading ? 'bg-ink-50' : test.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-brand-50 text-brand-700'}`}>{test.loading ? 'Contacting gateway…' : test.message}</div>}
        </div>
      </Panel>
      <aside className="space-y-4 text-sm">
        <div className="card p-5"><h3 className="font-semibold">Payment flow</h3><ol className="mt-3 list-decimal space-y-2 pl-5 text-ink-700"><li>Customer picks seats → seats are held.</li><li>Ticketo creates a session on <b>{pg.mode === 'direct' ? 'your' : 'Ticketo’s'}</b> gateway account.</li><li>Customer pays on the gateway page (card / bKash / Nagad / bank).</li><li>Gateway redirects back; Ticketo validates the transaction server-to-server (amount, tran_id, status).</li><li>Tickets are issued and seats locked.</li></ol></div>
        <div className="card p-5"><h3 className="font-semibold">Need a gateway account?</h3><p className="mt-2 text-ink-700">Apply for an SSLCOMMERZ merchant store, or bKash PGW (tokenized checkout). Use sandbox credentials first, then switch to live.</p></div>
      </aside>
    </div>
  );
}

function Business() {
  const { merchant, setMerchant, toast } = useStore();
  const [b, setB] = useState(merchant?.business || {});
  const [s, setS] = useState(merchant?.settlement || {});
  if (!merchant) return <Loading />;
  const save = async () => { try { setMerchant(await api.updateMerchant({ business: b, settlement: s })); toast('Saved'); } catch (e) { toast(e.message, 'err'); } };
  const add = async (file) => { if (!file) return; try { const d = await uploadFile(file); setMerchant(await api.uploadKycDocs({ docs: [{ ...d, type: 'Additional document' }] })); toast('Document uploaded'); } catch (e) { toast(e.message, 'err'); } };
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Panel title="Business details"><div className="grid gap-4 p-5 sm:grid-cols-2">
        {[['legalName', 'Legal name'], ['tradeLicense', 'Trade licence'], ['tin', 'e-TIN'], ['bin', 'BIN'], ['address', 'Address'], ['website', 'Website']].map(([k, l]) => <div key={k}><label className="label" htmlFor={`b-${k}`}>{l}</label><input id={`b-${k}`} className="input" value={b[k] || ''} onChange={(e) => setB({ ...b, [k]: e.target.value })} /></div>)}
        <div className="sm:col-span-2"><button onClick={save} className="btn-primary h-10 px-5">Save</button></div>
      </div></Panel>
      <div className="space-y-6">
        <Panel title="KYC status" action={<Pill status={merchant.kyc?.status === 'verified' ? 'approved' : merchant.kyc?.status === 'rejected' ? 'rejected' : 'pending'} />}>
          <div className="divide-y divide-ink-100">{(merchant.kyc?.docs || []).map((d, i) => <div key={i} className="flex items-center gap-3 px-5 py-3 text-sm"><Icon name="FileCheck2" size={17} className="text-emerald-600" /><span className="flex-1">{d.type}</span><span className="text-ink-500">{d.name}</span></div>)}</div>
          <div className="p-4"><label className="btn-outline h-9 cursor-pointer px-4 text-sm"><Icon name="Upload" size={15} />Upload another document<input type="file" className="hidden" accept=".pdf,image/*" onChange={(e) => add(e.target.files?.[0])} /></label></div>
        </Panel>
        <Panel title="Settlement account"><div className="grid gap-4 p-5 sm:grid-cols-2">
          {[['bankName', 'Bank'], ['accountName', 'Account name'], ['accountNo', 'Account no.'], ['routing', 'Routing'], ['wallet', 'MFS wallet']].map(([k, l]) => <div key={k}><label className="label" htmlFor={`s-${k}`}>{l}</label><input id={`s-${k}`} className="input" value={s[k] || ''} onChange={(e) => setS({ ...s, [k]: e.target.value })} /></div>)}
          <div className="sm:col-span-2"><button onClick={save} className="btn-primary h-10 px-5">Save</button></div>
        </div></Panel>
      </div>
    </div>
  );
}
