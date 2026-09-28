import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import Link from '@/components/Link';
import PortalShell, { Stat, Panel, Pill } from '@/components/portal/PortalShell';
import BarChart, { HBars } from '@/components/BarChart';
import Icon from '@/components/Icon';
import Modal from '@/components/Modal';
import VenueMap from '@/components/venue/VenueMap';
import LayoutDesigner, { checkSpec } from '@/components/venue/LayoutDesigner';
import { HomeSection, SORTS } from '@/pages/customer/Home';
import { applyTheme } from '@/lib/theme';
import { Loading, Empty } from '@/components/States';
import { blockCapacity } from '@shared/templates.js';
import { api } from '@/lib/api';
import { useApi, useStore } from '@/lib/store';
import { STATUS_LABEL, bdt, bdtPlain, cx, downloadCSV, fmtDate, fmtDateTime, fmtTime } from '@/lib/utils';

export default function AdminConsole() {
  const { user, checked, signOut } = useStore();
  const nav = useNavigate();
  const { pathname } = useLocation();
  const ov = useApi(() => (user?.role === 'admin' ? api.adminOverview() : null), [user?.id, pathname]);
  if (!checked) return <Loading />;
  if (!user || user.role !== 'admin') return <Navigate to={`/partner/login?next=${encodeURIComponent(pathname)}`} replace />;
  const p = ov.data?.pending || {};
  const NAV = [
    { id: '', label: 'Overview', icon: 'LayoutDashboard' },
    { section: 'Governance' },
    { id: 'merchants', label: 'Merchants & KYC', icon: 'Store', badge: p.merchants },
    { id: 'events', label: 'Events', icon: 'Calendar', badge: p.events },
    { id: 'orders', label: 'Orders & refunds', icon: 'RotateCcw', badge: p.refunds },
    { section: 'Configuration' },
    { id: 'platform', label: 'Platform rules', icon: 'SlidersHorizontal' },
    { id: 'branding', label: 'Branding & theme', icon: 'Palette' },
    { id: 'home', label: 'Home page', icon: 'LayoutGrid' },
    { id: 'categories', label: 'Categories → views', icon: 'Layers' },
    { id: 'templates', label: 'Venue layouts', icon: 'Map' },
    { id: 'venues', label: 'Venues', icon: 'MapPin' },
    { id: 'payments', label: 'Payment gateways', icon: 'Plug' },
    { id: 'promos', label: 'Promo codes', icon: 'Tag' },
    { section: 'Compliance' },
    { id: 'audit', label: 'Audit log', icon: 'History' },
  ];
  const active = pathname.replace(/^\/admin\/?/, '').split('/')[0];
  return (
    <PortalShell title="Super admin" subtitle="Platform administrator" user={user.email} nav={NAV} active={active} onNav={(id) => nav(`/admin${id ? `/${id}` : ''}`)}
      actions={<button onClick={() => { signOut(); nav('/'); }} className="btn-ghost h-9 px-3 text-sm"><Icon name="LogOut" size={15} />Sign out</button>}>
      <Routes>
        <Route index element={<Overview data={ov.data} />} />
        <Route path="merchants" element={<Merchants onChange={ov.reload} />} />
        <Route path="events" element={<Events onChange={ov.reload} />} />
        <Route path="orders" element={<Orders onChange={ov.reload} />} />
        <Route path="platform" element={<Platform />} />
        <Route path="branding" element={<Branding />} />
        <Route path="home" element={<HomeBuilder />} />
        <Route path="categories" element={<Categories />} />
        <Route path="templates" element={<Templates />} />
        <Route path="venues" element={<Venues />} />
        <Route path="payments" element={<Payments />} />
        <Route path="promos" element={<Promos />} />
        <Route path="audit" element={<Audit />} />
      </Routes>
    </PortalShell>
  );
}

function Overview({ data }) {
  if (!data) return <Loading />;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="GMV (all events)" value={bdtPlain(data.gmv)} sub={`${bdtPlain(data.onlineGmv)} through the platform this session`} icon="TrendingUp" />
        <Stat label="Platform earnings" value={bdtPlain(data.commission)} sub="commission + convenience fee" icon="Percent" />
        <Stat label="Tickets sold" value={data.ticketsSold.toLocaleString()} sub={`${data.liveOrders} live orders`} icon="Ticket" />
        <Stat label="Merchants" value={data.merchants.total} sub={`${data.merchants.active} active · ${data.merchants.direct} on direct gateway`} icon="Store" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {[['merchants', 'Merchants awaiting KYC', data.pending.merchants, 'UserCheck'], ['events', 'Events awaiting review', data.pending.events, 'ClipboardList'], ['orders', 'Refund requests', data.pending.refunds, 'RotateCcw']].map(([t, l, n, i]) => (
          <Link key={t} href={`/admin/${t}`} className="card flex items-center gap-4 p-5 hover:border-brand-200"><span className={cx('flex h-11 w-11 items-center justify-center rounded-xl', n ? 'bg-amber-50 text-amber-600' : 'bg-ink-50 text-ink-500')}><Icon name={i} /></span><div className="flex-1"><div className="text-2xl font-bold">{n}</div><div className="text-sm text-ink-500">{l}</div></div><Icon name="ChevronRight" className="text-ink-300" /></Link>
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <Panel title="Platform GMV — last 14 days"><div className="p-5"><BarChart data={data.series} format={bdtPlain} label="GMV" /></div></Panel>
        <Panel title="GMV by category"><div className="p-5"><HBars rows={data.byCategory} format={bdtPlain} /></div></Panel>
      </div>
      <Panel title="Top events"><div className="overflow-x-auto"><table className="w-full"><thead className="bg-ink-50"><tr><th className="th">Event</th><th className="th">Merchant</th><th className="th">Sold</th><th className="th">Sell-through</th><th className="th">Revenue</th></tr></thead>
        <tbody className="divide-y divide-ink-100">{data.topEvents.map((s) => <tr key={s.id}><td className="td font-medium">{s.title}</td><td className="td text-ink-500">{s.merchant}</td><td className="td">{s.sold.toLocaleString()}</td><td className="td">{s.capacity ? Math.round((s.sold / s.capacity) * 100) : 0}%</td><td className="td">{bdtPlain(s.revenue)}</td></tr>)}</tbody></table></div></Panel>
    </div>
  );
}

function Merchants({ onChange }) {
  const { toast } = useStore();
  const { data, loading, reload } = useApi(() => api.adminMerchants(), []);
  const [open, setOpen] = useState(null);
  const [note, setNote] = useState('');
  const [comm, setComm] = useState('');
  if (loading) return <Loading />;
  const act = async (m, action) => { try { await api.reviewMerchant({ id: m.id, action, note, commissionPct: comm === '' ? undefined : Number(comm) }); toast(`${m.name}: ${action}d`); setOpen(null); reload(); onChange?.(); } catch (e) { toast(e.message, 'err'); } };
  const sorted = [...data].sort((a, b) => (a.status === 'pending' ? -1 : 0) - (b.status === 'pending' ? -1 : 0));
  return (
    <Panel title={`Merchants (${data.length})`}>
      <div className="overflow-x-auto"><table className="w-full"><thead className="bg-ink-50"><tr><th className="th">Merchant</th><th className="th">Type</th><th className="th">Collection</th><th className="th">Commission</th><th className="th">Events</th><th className="th">Joined</th><th className="th">Status</th><th className="th" /></tr></thead>
        <tbody className="divide-y divide-ink-100">{sorted.map((m) => (
          <tr key={m.id}><td className="td font-medium">{m.name}<div className="text-xs text-ink-500">{m.owner.email}</div></td><td className="td">{m.type}</td>
            <td className="td text-sm">{m.pg?.mode === 'direct' ? <span className="flex items-center gap-1">Direct {m.pg.sslcommerz?.verifiedAt ? <Icon name="BadgeCheck" size={14} className="text-emerald-600" /> : <span className="text-xs text-amber-600">(unverified)</span>}</span> : 'Via Ticketo'}</td>
            <td className="td">{m.commissionPct}%</td><td className="td">{m.events}</td><td className="td">{fmtDate(m.createdAt, { weekday: false, year: true })}</td>
            <td className="td"><Pill status={m.status} /></td><td className="td"><button onClick={() => { setOpen(m); setNote(''); setComm(String(m.commissionPct)); }} className="text-sm font-medium text-brand-500">{m.status === 'pending' ? 'Review' : 'Manage'}</button></td></tr>
        ))}</tbody></table></div>
      <Modal open={!!open} onClose={() => setOpen(null)} title={open?.name} wide>
        {open && (
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-3 text-sm">
              <h4 className="font-semibold">Business</h4>
              <dl className="grid grid-cols-[120px_1fr] gap-y-1"><dt className="text-ink-500">Legal name</dt><dd>{open.business.legalName}</dd><dt className="text-ink-500">Trade licence</dt><dd>{open.business.tradeLicense}</dd><dt className="text-ink-500">e-TIN / BIN</dt><dd>{open.business.tin || '—'} / {open.business.bin || '—'}</dd><dt className="text-ink-500">Address</dt><dd>{open.business.address || '—'}</dd><dt className="text-ink-500">Owner</dt><dd>{open.owner.name} · {open.owner.phone}</dd></dl>
              <h4 className="pt-2 font-semibold">Settlement</h4><p>{open.settlement.type === 'bank' ? `${open.settlement.bankName} · ${open.settlement.accountName} · ${open.settlement.accountNo}` : `Wallet ${open.settlement.wallet}`}</p>
              <h4 className="pt-2 font-semibold">Payment gateway</h4><p>{open.pg?.mode === 'direct' ? `Own SSLCOMMERZ store "${open.pg.sslcommerz?.storeId}" (${open.pg.sslcommerz?.sandbox !== false ? 'sandbox' : 'live'}) — ${open.pg.sslcommerz?.verifiedAt ? 'verified' : 'not verified'}` : 'Ticketo collects and settles weekly'}</p>
            </div>
            <div className="space-y-3 text-sm">
              <h4 className="font-semibold">KYC documents</h4>
              <ul className="divide-y divide-ink-100 rounded-xl border border-ink-100">{open.kyc.docs.map((d, i) => <li key={i} className="flex items-center gap-2 px-3 py-2"><Icon name="FileText" size={16} className="text-ink-500" /><span className="flex-1">{d.type}</span><span className="truncate text-xs text-ink-500">{d.name}</span></li>)}{!open.kyc.docs.length && <li className="px-3 py-2 text-ink-500">No documents</li>}</ul>
              <div><label className="label" htmlFor="m-comm">Commission %</label><input id="m-comm" type="number" className="input" value={comm} onChange={(e) => setComm(e.target.value)} /></div>
              <div><label className="label" htmlFor="m-note">Note to merchant</label><input id="m-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Shown if rejected" /></div>
              <div className="flex flex-wrap gap-2 pt-1">
                {open.status !== 'active' && <button onClick={() => act(open, 'approve')} className="btn h-10 bg-emerald-600 px-4 text-white hover:bg-emerald-700"><Icon name="Check" size={15} />Approve KYC</button>}
                {open.status === 'pending' && <button onClick={() => act(open, 'reject')} className="btn-outline h-10 px-4 text-brand-600">Reject</button>}
                {open.status === 'active' && <button onClick={() => act(open, 'suspend')} className="btn-outline h-10 px-4 text-brand-600">Suspend</button>}
                {open.status === 'active' && <button onClick={() => act(open, 'update')} className="btn-dark h-10 px-4">Save commission</button>}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </Panel>
  );
}

function Events({ onChange }) {
  const { toast } = useStore();
  const [status, setStatus] = useState('');
  const { data, loading, reload } = useApi(() => api.adminEvents({ status: status || undefined }), [status]);
  const act = async (e, action) => { try { await api.reviewEvent({ id: e.id, action }); toast(`${e.title}: ${action}d`); reload(); onChange?.(); } catch (err) { toast(err.message, 'err'); } };
  return (
    <Panel title="Events" action={<div className="flex flex-wrap gap-1">{[['', 'All'], ['pending_review', 'In review'], ['published', 'Live'], ['draft', 'Draft'], ['paused', 'Paused']].map(([k, l]) => <button key={k} onClick={() => setStatus(k)} className={cx('chip py-0.5 text-xs', status === k && 'chip-on')}>{l}</button>)}</div>}>
      {loading ? <Loading /> : !data.length ? <p className="p-6 text-sm text-ink-500">Nothing here.</p> : (
        <div className="overflow-x-auto"><table className="w-full"><thead className="bg-ink-50"><tr><th className="th">Event</th><th className="th">Merchant</th><th className="th">View</th><th className="th">Next show</th><th className="th">From</th><th className="th">Status</th><th className="th" /></tr></thead>
          <tbody className="divide-y divide-ink-100">{data.map((e) => (
            <tr key={e.id}><td className="td font-medium">{e.title}<div className="text-xs capitalize text-ink-500">{e.category}{e.subCategory ? ` · ${e.subCategory}` : ''}</div></td><td className="td">{e.merchant?.name}</td><td className="td text-xs">{e.viewType}</td><td className="td">{e.nextShow ? fmtDate(e.nextShow) : '—'}</td><td className="td">{bdt(e.priceFrom)}</td><td className="td"><Pill status={e.status === 'pending_review' ? 'pending' : e.status} /></td>
              <td className="td"><div className="flex gap-1">{e.status === 'pending_review' && <><button onClick={() => act(e, 'approve')} className="btn h-8 bg-emerald-600 px-3 text-xs text-white">Approve</button><button onClick={() => act(e, 'reject')} className="btn-outline h-8 px-3 text-xs">Reject</button></>}{e.status === 'published' && <><Link href={`/events/${e.slug}`} className="btn-outline h-8 px-3 text-xs">View</Link><button onClick={() => act(e, 'suspend')} className="btn-outline h-8 px-3 text-xs text-brand-600">Suspend</button></>}{e.status === 'paused' && <button onClick={() => act(e, 'approve')} className="btn-outline h-8 px-3 text-xs">Re-publish</button>}</div></td></tr>
          ))}</tbody></table></div>
      )}
    </Panel>
  );
}

function Orders({ onChange }) {
  const { toast } = useStore();
  const [status, setStatus] = useState('refund_requested');
  const { data, loading, reload } = useApi(() => api.adminOrders({ status: status || undefined }), [status]);
  const act = async (o, action) => { try { await api.reviewRefund({ orderId: o.id, action }); toast(action === 'approve' ? `Refund ${bdt(o.refund.amount)} approved` : 'Refund rejected'); reload(); onChange?.(); } catch (e) { toast(e.message, 'err'); } };
  return (
    <Panel title="Orders" action={<div className="flex flex-wrap gap-1">{[['refund_requested', 'Refund requests'], ['paid', 'Paid'], ['pending_payment', 'Awaiting payment'], ['refunded', 'Refunded'], ['', 'All']].map(([k, l]) => <button key={k} onClick={() => setStatus(k)} className={cx('chip py-0.5 text-xs', status === k && 'chip-on')}>{l}</button>)}</div>}>
      {loading ? <Loading /> : !data.length ? <p className="p-6 text-sm text-ink-500">No orders in this view.</p> : (
        <div className="overflow-x-auto"><table className="w-full"><thead className="bg-ink-50"><tr><th className="th">Booking</th><th className="th">Merchant / event</th><th className="th">Customer</th><th className="th">Total</th><th className="th">Gateway</th><th className="th">Status</th><th className="th" /></tr></thead>
          <tbody className="divide-y divide-ink-100">{data.map((o) => (
            <tr key={o.id}><td className="td font-mono text-xs">{o.id}<div className="font-sans text-ink-500">{fmtDateTime(o.createdAt)}</div></td><td className="td">{o.merchantName}<div className="text-xs text-ink-500">{o.event?.title}</div></td><td className="td">{o.contact.name}<div className="text-xs text-ink-500">{o.contact.phone}</div></td><td className="td">{bdt(o.amounts.total)}</td>
              <td className="td text-xs">{o.payment?.gateway || '—'}{o.payment?.pgMode ? ` · ${o.payment.pgMode}` : ''}<div className="font-mono text-ink-500">{o.payment?.bankTranId || o.payment?.ref || ''}</div></td>
              <td className="td"><Pill status={o.status === 'pending_payment' ? 'pending' : o.status} />{o.refund && <div className="mt-1 text-xs text-ink-500">{bdt(o.refund.amount)} · {o.refund.reason}</div>}</td>
              <td className="td">{o.status === 'refund_requested' && <div className="flex gap-1"><button onClick={() => act(o, 'approve')} className="btn h-8 bg-emerald-600 px-3 text-xs text-white">Approve</button><button onClick={() => act(o, 'reject')} className="btn-outline h-8 px-3 text-xs">Reject</button></div>}</td></tr>
          ))}</tbody></table></div>
      )}
    </Panel>
  );
}

// ---------------- Configuration ----------------
function useAdminConfig() {
  const { loadConfig } = useStore();
  const r = useApi(() => api.getAdminConfig(), []);
  const save = async (section, value) => { const c = await api.updateConfig({ section, value }); r.setData(c); loadConfig(); return c; };
  return { ...r, save };
}
function Toggle({ on, onChange, label, hint }) {
  return (
    <label className="flex items-start justify-between gap-4 rounded-xl border border-ink-100 p-4">
      <span><span className="font-medium">{label}</span>{hint && <span className="block text-xs text-ink-500">{hint}</span>}</span>
      <button type="button" onClick={() => onChange(!on)} className={cx('relative h-6 w-11 shrink-0 rounded-full transition', on ? 'bg-emerald-500' : 'bg-ink-300')} aria-pressed={on} aria-label={label}><span className={cx('absolute top-0.5 h-5 w-5 rounded-full bg-white transition', on ? 'left-[22px]' : 'left-0.5')} /></button>
    </label>
  );
}

function Platform() {
  const { toast } = useStore();
  const { data, loading, save } = useAdminConfig();
  const [p, setP] = useState(null);
  useEffect(() => { if (data) setP(data.platform); }, [data]);
  if (loading || !p) return <Loading />;
  const num = (k, l, step = 1) => <div key={k}><label className="label" htmlFor={`pl-${k}`}>{l}</label><input id={`pl-${k}`} type="number" step={step} className="input" value={p[k]} onChange={(e) => setP({ ...p, [k]: Number(e.target.value) })} /></div>;
  return (
    <div className="space-y-6">
      <Panel title="Merchant onboarding & publishing"><div className="grid gap-3 p-5 md:grid-cols-2">
        <Toggle on={p.merchantAutoApprove} onChange={(v) => setP({ ...p, merchantAutoApprove: v })} label="Auto-approve new merchants" hint="Off = admin reviews KYC before merchants can publish" />
        <Toggle on={p.eventRequiresApproval} onChange={(v) => setP({ ...p, eventRequiresApproval: v })} label="Review events before they go live" hint="Off = verified merchants publish instantly" />
        <Toggle on={p.allowMerchantDirectPG} onChange={(v) => setP({ ...p, allowMerchantDirectPG: v })} label="Allow merchants to connect their own gateway" hint="Direct settlement to the merchant’s SSLCOMMERZ / bKash account" />
        <Toggle on={p.allowGuestCheckout} onChange={(v) => setP({ ...p, allowGuestCheckout: v })} label="Guest checkout" hint="Buy without signing in (OTP not required)" />
      </div></Panel>
      <Panel title="Fees & limits"><div className="grid gap-4 p-5 sm:grid-cols-3">{[num('convenienceFeePct', 'Convenience fee %', 0.1), num('vatOnFeePct', 'VAT on fee %'), num('defaultCommissionPct', 'Default commission %', 0.5), num('holdMinutes', 'Seat hold (minutes)'), num('maxTicketsPerOrder', 'Max tickets per order')]}</div></Panel>
      <button onClick={async () => { await save('platform', p); toast('Platform rules saved'); }} className="btn-primary h-11 px-6"><Icon name="Save" size={16} />Save</button>
    </div>
  );
}

function ViewPick({ value, tpl, onChange, views, templates }) {
  return (
    <div className="flex flex-wrap gap-2">
      <select className="input h-9 w-56 text-sm" value={value} onChange={(e) => onChange({ viewType: e.target.value, templateId: templates.find((t) => t.viewType === e.target.value)?.id || '' })} aria-label="View type">{views.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select>
      <select className="input h-9 w-64 text-sm" value={tpl} onChange={(e) => onChange({ templateId: e.target.value })} aria-label="Default template">{templates.filter((t) => t.viewType === value).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
    </div>
  );
}

function Categories() {
  const { toast, config } = useStore();
  const { data, loading, save } = useAdminConfig();
  const tpls = useApi(() => api.listTemplates({}), []);
  const [cats, setCats] = useState(null);
  useEffect(() => { if (data) setCats(data.categories); }, [data]);
  if (loading || !cats || tpls.loading) return <Loading />;
  const views = config.viewTypes;
  const up = (i, patch) => setCats(cats.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const upSub = (i, k, patch) => up(i, { subCategories: cats[i].subCategories.map((s, j) => (j === k ? { ...s, ...patch } : s)) });
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-500">Each category (and sub-category) decides which booking view customers see and which layout merchants start from — e.g. Sports → Cricket shows the oval stadium, Sports → Football the rectangular stadium, Theater the hall seat plan, Concerts the open ground.</p>
      {cats.map((c, i) => (
        <div key={c.id} className="card p-4">
          <div className="flex flex-wrap items-center gap-3"><Icon name={c.icon} className="text-brand-500" /><input className="input h-9 w-44 font-semibold" value={c.name} onChange={(e) => up(i, { name: e.target.value })} aria-label="Category name" /><span className="text-xs text-ink-500">default view</span><ViewPick views={views} templates={tpls.data} value={c.viewType} tpl={c.templateId} onChange={(p) => up(i, p)} /></div>
          {c.subCategories.map((s, k) => (
            <div key={s.id} className="ml-8 mt-3 flex flex-wrap items-center gap-3 border-l-2 border-ink-100 pl-4"><input className="input h-9 w-44 text-sm" value={s.name} onChange={(e) => upSub(i, k, { name: e.target.value })} aria-label="Sub-category" /><ViewPick views={views} templates={tpls.data} value={s.viewType} tpl={s.templateId} onChange={(p) => upSub(i, k, p)} /><button onClick={() => up(i, { subCategories: c.subCategories.filter((_, j) => j !== k) })} className="text-ink-300 hover:text-brand-600" aria-label="Remove"><Icon name="Trash2" size={16} /></button></div>
          ))}
          <button onClick={() => { const name = `New ${c.name.toLowerCase()} type`; up(i, { subCategories: [...c.subCategories, { id: `${c.id}-${Date.now().toString(36)}`, name, viewType: c.viewType, templateId: c.templateId }] }); }} className="btn-ghost ml-8 mt-2 h-8 px-3 text-xs text-brand-500"><Icon name="Plus" size={13} />Add sub-category</button>
        </div>
      ))}
      <div className="flex gap-2">
        <button onClick={() => setCats([...cats, { id: `cat-${Date.now().toString(36)}`, name: 'New category', icon: 'Ticket', viewType: 'ga-list', templateId: 'tpl-ga-conference', subCategories: [] }])} className="btn-outline h-11 px-5"><Icon name="Plus" size={16} />Add category</button>
        <button onClick={async () => { try { await save('categories', cats); toast('Category → view mapping saved'); } catch (e) { toast(e.message, 'err'); } }} className="btn-primary h-11 px-6"><Icon name="Save" size={16} />Save</button>
      </div>
    </div>
  );
}

export function TemplatePreview({ t }) {
  const blocks = t.spec.blocks.map((b) => ({ ...b, enabled: b.sell !== 'none', color: t.spec.tiers.find((x) => x.id === b.tier)?.color || '#94a3b8', tierName: t.spec.tiers.find((x) => x.id === b.tier)?.name, capacity: blockCapacity(b), available: blockCapacity(b) }));
  const sellable = blocks.filter((b) => b.sell !== 'none');
  if (sellable.length && sellable.every((b) => b.shape)) return <VenueMap viewType={t.viewType} spec={t.spec} blocks={blocks} mode="preview" />;
  return (
    <div className="space-y-1.5 p-2">{t.spec.stage !== 'bottom' && <div className="mx-auto mb-2 h-3 w-2/3 rounded-full bg-ink-300" />}{blocks.map((b) => <div key={b.id} className="flex items-center gap-2 text-xs"><span className="h-3 w-3 rounded-sm" style={{ background: b.color }} /><span className="flex-1">{b.name}{b.level ? ` · ${b.level}` : ''}</span><span className="text-ink-500">{b.sell === 'seated' ? `${b.capacity} seats` : `${b.capacity} GA`}</span></div>)}{t.spec.stage === 'bottom' && <div className="mx-auto mt-2 h-2 w-2/3 rounded-full bg-sky-300" />}</div>
  );
}

export function DesignerModal({ open, initial, onClose, onSave, viewTypes, lockMeta, title = 'Layout designer', saveLabel = 'Save layout', extra }) {
  const [draft, setDraft] = useState(initial);
  useEffect(() => { setDraft(initial); }, [initial]);
  if (!open || !initial) return null;
  const errs = draft ? checkSpec(draft.spec) : [];
  return (
    <Modal open onClose={onClose} wide="full" title={title}>
      <LayoutDesigner key={initial.id + (initial._k || '')} value={initial} onChange={setDraft} viewTypes={viewTypes} lockMeta={lockMeta} height="64vh" />
      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        {extra?.(draft, errs)}
        <button onClick={onClose} className="btn-outline h-10 px-4 text-sm">Cancel</button>
        <button onClick={() => onSave(draft)} disabled={errs.length > 0 || (!lockMeta && (!draft?.id || !draft?.name))} className="btn-primary h-10 px-5 text-sm"><Icon name="Save" size={16} />{saveLabel}</button>
      </div>
    </Modal>
  );
}

const BLANK = (viewType) => ({ id: `tpl-${Date.now().toString(36)}`, name: 'New venue layout', viewType, _k: Date.now(), spec: { viewBox: [1000, 700], background: 'dots', field: { type: 'stage', x: 300, y: 40, w: 400, h: 70, label: 'Stage' }, tiers: [{ id: 'std', name: 'Standard', color: '#2D499A' }], blocks: [], features: [] } });

function Templates() {
  const { toast, config } = useStore();
  const { data, loading, reload } = useApi(() => api.listTemplates({}), []);
  const [edit, setEdit] = useState(null);
  const [filter, setFilter] = useState('');
  if (loading) return <Loading />;
  const open = (t, copy) => setEdit(copy ? { ...JSON.parse(JSON.stringify(t)), id: `${t.id}-copy`, name: `${t.name} (copy)`, _k: Date.now() } : { ...t, _k: Date.now() });
  const save = async (t) => { const { _k, mine, ownerId, ...template } = t; try { await api.saveTemplate({ template }); toast('Layout saved'); setEdit(null); reload(); } catch (e) { toast(e.message, 'err'); } };
  const remove = async (t) => { try { await api.deleteTemplate({ id: t.id }); toast('Layout deleted'); reload(); } catch (e) { toast(e.message, 'err'); } };
  const list = data.filter((t) => !filter || t.viewType === filter);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="max-w-2xl text-sm text-ink-500">Design every venue visually — stands, ring segments, sections, tables and standing zones, seat-by-seat. Merchants pick a layout per event (or customise their own copy) and set prices per tier.</p>
        <div className="flex gap-2"><select value={filter} onChange={(e) => setFilter(e.target.value)} className="input h-9 w-48 text-sm" aria-label="Filter by view"><option value="">All views</option>{config.viewTypes.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select>
          <button onClick={() => setEdit(BLANK(filter || 'open-field'))} className="btn-primary h-9 px-3 text-sm"><Icon name="Plus" size={15} />New layout</button></div></div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {list.map((t) => (
          <div key={t.id} className="card overflow-hidden">
            <button onClick={() => open(t)} className="block w-full bg-ink-50 p-3" aria-label={`Design ${t.name}`}><TemplatePreview t={t} /></button>
            <div className="p-4"><div className="flex items-center gap-2 font-semibold">{t.name}{t.ownerId && <span className="badge bg-brand-50 text-brand-700">merchant</span>}</div><div className="text-xs text-ink-500">{config.viewTypes.find((v) => v.id === t.viewType)?.name} · {t.spec.blocks.length} blocks · {t.spec.blocks.reduce((a, b) => a + blockCapacity(b), 0).toLocaleString()} capacity</div>
              <div className="mt-3 flex gap-2"><button onClick={() => open(t)} className="btn-outline h-8 px-3 text-xs"><Icon name="PenTool" size={13} />Design</button><button onClick={() => open(t, true)} className="btn-outline h-8 px-3 text-xs"><Icon name="Copy" size={13} />Duplicate</button>
                {!t.id.startsWith('tpl-') || t.ownerId || t.id.includes('copy') ? <button onClick={() => remove(t)} className="btn-ghost ml-auto h-8 px-2 text-xs text-accent-600" aria-label={`Delete ${t.name}`}><Icon name="Trash2" size={13} /></button> : null}</div></div>
          </div>
        ))}
      </div>
      <DesignerModal open={!!edit} initial={edit} onClose={() => setEdit(null)} onSave={save} viewTypes={config.viewTypes} />
    </div>
  );
}

function Branding() {
  const { toast, config } = useStore();
  const live = useRef(config.branding); live.current = config.branding;
  useEffect(() => () => applyTheme(live.current), []); // drop unsaved preview when leaving
  const { data, loading, save } = useAdminConfig();
  const [b, setB] = useState(null);
  useEffect(() => { if (data) setB(data.branding); }, [data]);
  useEffect(() => { if (b) applyTheme(b); }, [b]);
  if (loading || !b) return <Loading />;
  const PRESETS = [['SSL Wireless', { primary: '#2D499A', accent: '#EE3240', dark: '#0F172A' }], ['Ocean', { primary: '#0369A1', accent: '#F59E0B', dark: '#0C1B2A' }], ['Forest', { primary: '#15803D', accent: '#EA580C', dark: '#052E16' }], ['Royal', { primary: '#6D28D9', accent: '#EC4899', dark: '#1E1B4B' }]];
  const color = (k, l) => <label key={k} className="block"><span className="label">{l}</span><span className="flex items-center gap-2"><input type="color" value={b[k]} onChange={(e) => setB({ ...b, [k]: e.target.value })} className="h-11 w-14 cursor-pointer rounded-lg border border-ink-100" aria-label={l} /><input className="input font-mono uppercase" value={b[k]} onChange={(e) => /^#[0-9a-f]{0,6}$/i.test(e.target.value) && setB({ ...b, [k]: e.target.value })} aria-label={`${l} hex`} /></span></label>;
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
      <div className="space-y-6">
        <Panel title="Brand identity"><div className="grid gap-4 p-5 sm:grid-cols-2">
          <div><label className="label" htmlFor="br-n">Platform name</label><input id="br-n" className="input" value={b.name} onChange={(e) => setB({ ...b, name: e.target.value })} /></div>
          <div><label className="label" htmlFor="br-t">Tagline</label><input id="br-t" className="input" value={b.tagline} onChange={(e) => setB({ ...b, tagline: e.target.value })} /></div>
        </div></Panel>
        <Panel title="Colours"><div className="space-y-4 p-5">
          <div className="flex flex-wrap gap-2">{PRESETS.map(([n, p]) => <button key={n} onClick={() => setB({ ...b, ...p })} className="flex items-center gap-2 rounded-lg border border-ink-100 px-3 py-2 text-sm hover:border-ink-300"><span className="flex"><span className="h-4 w-4 rounded-l" style={{ background: p.primary }} /><span className="h-4 w-4 rounded-r" style={{ background: p.accent }} /></span>{n}</button>)}</div>
          <div className="grid gap-4 sm:grid-cols-3">{color('primary', 'Primary')}{color('accent', 'Accent')}{color('dark', 'Dark / sidebar')}</div>
          <div><label className="label" htmlFor="br-r">Corner radius · {b.radius}px</label><input id="br-r" type="range" min="0" max="20" value={b.radius} onChange={(e) => setB({ ...b, radius: Number(e.target.value) })} className="w-full accent-brand-500" /></div>
          <p className="text-xs text-ink-500">Changes preview live across the console. Tints and shades (50–900) are generated from each colour automatically.</p>
        </div></Panel>
        <button onClick={async () => { await save('branding', b); toast('Branding saved — live for all visitors'); }} className="btn-primary h-11 px-6"><Icon name="Save" size={16} />Save branding</button>
      </div>
      <Panel title="Preview"><div className="space-y-4 p-5">
        <div className="flex items-center justify-between rounded-xl bg-white p-3 shadow-sm ring-1 ring-ink-100"><span className="text-lg font-extrabold">{b.name.slice(0, -1)}<span className="text-accent-500">{b.name.slice(-1)}</span></span><span className="btn-primary h-8 px-3 text-xs">Sign in</span></div>
        <div className="overflow-hidden rounded-xl bg-gradient-to-r from-brand-700 to-brand-500 p-5 text-white"><div className="text-xs uppercase tracking-widest text-white/70">{b.tagline}</div><div className="mt-1 text-xl font-bold">Dhaka T20 League — Final</div><span className="mt-3 inline-flex rounded-lg bg-accent-500 px-3 py-1.5 text-sm font-semibold">Book now</span></div>
        <div className="flex flex-wrap gap-2"><span className="chip chip-on">Selected</span><span className="chip">Chip</span><span className="badge bg-brand-50 text-brand-700">Badge</span><span className="badge bg-accent-50 text-accent-700">Hot</span></div>
        <div className="grid grid-cols-10 overflow-hidden rounded-lg">{[50, 100, 200, 300, 400, 500, 600, 700, 800, 900].map((k) => <span key={k} className="h-6" style={{ background: `rgb(var(--brand-${k}))` }} title={`brand-${k}`} />)}</div>
        <div className="grid grid-cols-10 overflow-hidden rounded-lg">{[50, 100, 200, 300, 400, 500, 600, 700, 800, 900].map((k) => <span key={k} className="h-6" style={{ background: `rgb(var(--accent-${k}))` }} title={`accent-${k}`} />)}</div>
      </div></Panel>
    </div>
  );
}

const SECTION_TYPES = { banners: 'Banner carousel', row: 'Event row', categories: 'Category tiles', cta: 'Call-to-action strip' };
function HomeBuilder() {
  const { toast, config } = useStore();
  const { data, loading, save } = useAdminConfig();
  const [h, setH] = useState(null);
  const [open, setOpen] = useState(null);
  const events = useApi(() => api.listEvents({}), []);
  useEffect(() => { if (data) setH(data.home); }, [data]);
  if (loading || !h) return <Loading />;
  const up = (i, patch) => setH(h.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const move = (i, d) => { const n = [...h]; const [x] = n.splice(i, 1); n.splice(i + d, 0, x); setH(n); };
  const add = (type) => { const s = { id: `h${Date.now().toString(36)}`, type, title: type === 'row' ? 'New row' : type === 'cta' ? 'Your message' : type === 'categories' ? 'Browse by category' : '', ...(type === 'row' ? { categories: [], sort: 'date', limit: 12 } : {}), ...(type === 'cta' ? { sub: '', cta: 'Learn more', href: '/' } : {}) }; setH([...h, s]); setOpen(s.id); };
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-3">
        <p className="text-sm text-ink-500">The customer home page is built from these sections, top to bottom. Reorder, hide, or add rows that pull events by category, rating, price or date.</p>
        {h.map((s, i) => (
          <div key={s.id} className={cx('card', s.hidden && 'opacity-60')}>
            <div className="flex items-center gap-2 p-3">
              <div className="flex flex-col"><button onClick={() => move(i, -1)} disabled={i === 0} className="text-ink-500 disabled:opacity-30" aria-label="Move up"><Icon name="ChevronUp" size={16} /></button><button onClick={() => move(i, 1)} disabled={i === h.length - 1} className="text-ink-500 disabled:opacity-30" aria-label="Move down"><Icon name="ChevronDown" size={16} /></button></div>
              <button onClick={() => setOpen(open === s.id ? null : s.id)} className="min-w-0 flex-1 text-left"><div className="truncate font-medium">{s.title || SECTION_TYPES[s.type]}</div><div className="text-xs text-ink-500">{SECTION_TYPES[s.type]}{s.type === 'row' ? ` · ${s.categories?.length ? s.categories.join(', ') : 'all categories'} · ${SORTS[s.sort] || ''}` : ''}</div></button>
              <button onClick={() => up(i, { hidden: !s.hidden })} className="btn-ghost h-8 w-8 p-0" aria-label={s.hidden ? 'Show section' : 'Hide section'}><Icon name={s.hidden ? 'EyeOff' : 'Eye'} size={16} /></button>
              <button onClick={() => setH(h.filter((_, j) => j !== i))} className="btn-ghost h-8 w-8 p-0 text-accent-600" aria-label="Remove section"><Icon name="Trash2" size={16} /></button>
            </div>
            {open === s.id && s.type !== 'banners' && (
              <div className="grid gap-3 border-t border-ink-100 p-3 sm:grid-cols-2">
                <div className="sm:col-span-2"><label className="label">Title</label><input className="input" value={s.title || ''} onChange={(e) => up(i, { title: e.target.value })} /></div>
                {s.type === 'row' && <>
                  <div><label className="label">Sort</label><select className="input" value={s.sort} onChange={(e) => up(i, { sort: e.target.value })}>{Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                  <div><label className="label">Max events</label><input type="number" min="1" className="input" value={s.limit || 20} onChange={(e) => up(i, { limit: Number(e.target.value) })} /></div>
                  <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" className="accent-brand-500" checked={!!s.includeUpcoming} onChange={(e) => up(i, { includeUpcoming: e.target.checked })} />Include "coming soon" titles</label>
                </>}
                {(s.type === 'row' || s.type === 'categories') && <div className="sm:col-span-2"><label className="label">Categories (none = all)</label><div className="flex flex-wrap gap-1.5">{config.categories.map((c) => { const on = s.categories?.includes(c.id); return <button key={c.id} onClick={() => up(i, { categories: on ? s.categories.filter((x) => x !== c.id) : [...(s.categories || []), c.id] })} className={cx('chip h-8 text-xs', on && 'chip-on')}>{c.name}</button>; })}</div></div>}
                {s.type === 'cta' && <>
                  <div className="sm:col-span-2"><label className="label">Subtitle</label><input className="input" value={s.sub || ''} onChange={(e) => up(i, { sub: e.target.value })} /></div>
                  <div><label className="label">Button</label><input className="input" value={s.cta || ''} onChange={(e) => up(i, { cta: e.target.value })} /></div>
                  <div><label className="label">Link</label><input className="input" value={s.href || ''} onChange={(e) => up(i, { href: e.target.value })} /></div>
                </>}
              </div>
            )}
          </div>
        ))}
        <div className="flex flex-wrap gap-2">{Object.entries(SECTION_TYPES).map(([k, v]) => <button key={k} onClick={() => add(k)} className="btn-outline h-9 px-3 text-sm"><Icon name="Plus" size={14} />{v}</button>)}</div>
        <button onClick={async () => { await save('home', h); toast('Home page published'); }} className="btn-primary h-11 px-6"><Icon name="Save" size={16} />Publish home page</button>
      </div>
      <Panel title="Live preview"><div className="max-h-[75vh] overflow-y-auto p-4 [&_.container-x]:px-0">
        {events.data ? h.map((s) => (s.type === 'banners' ? (!s.hidden && <div key={s.id} className="mb-3 flex h-24 items-center justify-center rounded-xl bg-gradient-to-r from-brand-700 to-brand-500 text-sm font-semibold text-white">Banner carousel · {config.banners.length} slides</div>) : <div key={s.id} className="pointer-events-none origin-top-left"><HomeSection s={s} list={events.data} config={config} /></div>)) : <Loading />}
      </div></Panel>
    </div>
  );
}

function Venues() {
  const { toast, config } = useStore();
  const { data, loading, reload } = useApi(() => api.listVenues(), []);
  const tpls = useApi(() => api.listTemplates({}), []);
  const [v, setV] = useState(null);
  if (loading || tpls.loading) return <Loading />;
  const save = async () => { try { await api.saveVenue({ venue: v }); toast('Venue saved'); setV(null); reload(); } catch (e) { toast(e.message, 'err'); } };
  return (
    <Panel title={`Venues (${data.length})`} action={<button onClick={() => setV({ name: '', city: 'dhaka', address: '', type: 'stadium', facilities: [], templateIds: [] })} className="btn-primary h-8 px-3 text-sm"><Icon name="Plus" size={14} />Add venue</button>}>
      <div className="divide-y divide-ink-100">{data.map((x) => <button key={x.id} onClick={() => setV(x)} className="flex w-full items-center gap-3 px-5 py-3 text-left text-sm hover:bg-ink-50"><Icon name="MapPin" size={18} className="text-ink-300" /><div className="flex-1"><b>{x.name}</b><div className="text-xs text-ink-500">{x.address}</div></div><span className="text-xs text-ink-500">{x.templateIds.length} layout(s)</span></button>)}</div>
      <Modal open={!!v} onClose={() => setV(null)} title={v?.id ? 'Edit venue' : 'New venue'}>
        {v && (<div className="space-y-3">
          <div><label className="label" htmlFor="v-n">Name</label><input id="v-n" className="input" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3"><div><label className="label" htmlFor="v-c">City</label><select id="v-c" className="input" value={v.city} onChange={(e) => setV({ ...v, city: e.target.value })}>{config.cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div><div><label className="label" htmlFor="v-t">Type</label><select id="v-t" className="input" value={v.type} onChange={(e) => setV({ ...v, type: e.target.value })}>{['stadium', 'hall', 'cinema', 'open-field', 'online'].map((t) => <option key={t}>{t}</option>)}</select></div></div>
          <div><label className="label" htmlFor="v-a">Address</label><input id="v-a" className="input" value={v.address} onChange={(e) => setV({ ...v, address: e.target.value })} /></div>
          <div><label className="label">Available layouts</label><div className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-ink-100 p-2">{tpls.data.map((t) => <label key={t.id} className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-brand-500" checked={v.templateIds.includes(t.id)} onChange={(e) => setV({ ...v, templateIds: e.target.checked ? [...v.templateIds, t.id] : v.templateIds.filter((x) => x !== t.id) })} />{t.name}</label>)}</div></div>
          <button onClick={save} className="btn-primary h-11 w-full">Save venue</button>
        </div>)}
      </Modal>
    </Panel>
  );
}

function Payments() {
  const { toast } = useStore();
  const { data, loading, save } = useAdminConfig();
  const [g, setG] = useState(null); const [m, setM] = useState(null);
  useEffect(() => { if (data) { setG(data.payment.gateways); setM(data.payment.methods); } }, [data]);
  if (loading || !g) return <Loading />;
  const inp = (gw, k, l, type = 'text') => <div key={k}><label className="label" htmlFor={`g-${gw}-${k}`}>{l}</label><input id={`g-${gw}-${k}`} type={type} className="input" value={g[gw][k] || ''} onChange={(e) => setG({ ...g, [gw]: { ...g[gw], [k]: e.target.value } })} autoComplete="new-password" /></div>;
  return (
    <div className="space-y-6">
      <p className="text-sm text-ink-500">Platform gateway accounts are used for merchants on “Ticketo collects”. Merchants on direct mode use their own credentials from their portal. Secrets are write-only.</p>
      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="SSLCOMMERZ (platform store)" action={<Toggle on={g.sslcommerz.enabled} onChange={(v) => setG({ ...g, sslcommerz: { ...g.sslcommerz, enabled: v } })} label="Enabled" />}>
          <div className="grid gap-4 p-5 sm:grid-cols-2">{inp('sslcommerz', 'storeId', 'Store ID')}{inp('sslcommerz', 'storePassword', 'Store password', 'password')}
            <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" className="accent-brand-500" checked={g.sslcommerz.sandbox !== false} onChange={(e) => setG({ ...g, sslcommerz: { ...g.sslcommerz, sandbox: e.target.checked } })} />Sandbox (sandbox.sslcommerz.com) — uncheck for securepay.sslcommerz.com</label></div>
        </Panel>
        <Panel title="bKash Tokenized Checkout (platform)" action={<Toggle on={g.bkash.enabled} onChange={(v) => setG({ ...g, bkash: { ...g.bkash, enabled: v } })} label="Enabled" />}>
          <div className="grid gap-4 p-5 sm:grid-cols-2">{inp('bkash', 'appKey', 'App key')}{inp('bkash', 'appSecret', 'App secret', 'password')}{inp('bkash', 'username', 'Username')}{inp('bkash', 'password', 'Password', 'password')}
            <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" className="accent-brand-500" checked={g.bkash.sandbox !== false} onChange={(e) => setG({ ...g, bkash: { ...g.bkash, sandbox: e.target.checked } })} />Sandbox</label></div>
        </Panel>
      </div>
      <Panel title="Sandbox simulator"><div className="p-5"><Toggle on={g.simulator.enabled} onChange={(v) => setG({ ...g, simulator: { ...g.simulator, enabled: v } })} label="Enable payment simulator" hint="Fallback for offline demos when a gateway is not reachable. Turn OFF in production." /></div></Panel>
      <Panel title="Checkout payment methods">
        <div className="overflow-x-auto"><table className="w-full"><thead className="bg-ink-50"><tr><th className="th">Method</th><th className="th">Shown</th><th className="th">Routed to</th><th className="th">SSLCOMMERZ channel (multi_card_name)</th></tr></thead>
          <tbody className="divide-y divide-ink-100">{m.map((x, i) => (
            <tr key={x.id}><td className="td font-medium">{x.name}<div className="text-xs text-ink-500">{x.sub}</div></td>
              <td className="td"><input type="checkbox" className="h-4 w-4 accent-brand-500" checked={x.enabled} onChange={(e) => setM(m.map((y, j) => (j === i ? { ...y, enabled: e.target.checked } : y)))} aria-label={`Show ${x.name}`} /></td>
              <td className="td"><select className="input h-9 w-40 text-sm" value={x.gateway} onChange={(e) => setM(m.map((y, j) => (j === i ? { ...y, gateway: e.target.value } : y)))} aria-label="Gateway"><option value="sslcommerz">SSLCOMMERZ</option><option value="bkash">bKash direct</option></select></td>
              <td className="td"><input className="input h-9 w-64 font-mono text-xs" value={x.multiCardName || ''} disabled={x.gateway !== 'sslcommerz'} onChange={(e) => setM(m.map((y, j) => (j === i ? { ...y, multiCardName: e.target.value } : y)))} placeholder="(all channels)" aria-label="multi_card_name" /></td></tr>
          ))}</tbody></table></div>
      </Panel>
      <button onClick={async () => { try { await save('gateways', g); await save('methods', m); toast('Payment configuration saved'); } catch (e) { toast(e.message, 'err'); } }} className="btn-primary h-11 px-6"><Icon name="Save" size={16} />Save</button>
    </div>
  );
}

function Promos() {
  const { toast } = useStore();
  const { data, loading, save } = useAdminConfig();
  const [rows, setRows] = useState(null);
  useEffect(() => { if (data) setRows(data.promos); }, [data]);
  if (loading || !rows) return <Loading />;
  const up = (i, patch) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <Panel title="Platform promo codes" action={<button onClick={() => setRows([{ code: 'NEWCODE', type: 'pct', value: 10, max: 200, minOrder: 300, desc: 'New offer', scope: 'all', active: false, used: 0, limit: 1000 }, ...rows])} className="btn-primary h-8 px-3 text-sm"><Icon name="Plus" size={14} />New</button>}>
      <div className="overflow-x-auto"><table className="w-full"><thead className="bg-ink-50"><tr><th className="th">Code</th><th className="th">Type</th><th className="th">Value</th><th className="th">Max ৳</th><th className="th">Min order</th><th className="th">Scope</th><th className="th">Description</th><th className="th">Used</th><th className="th">Active</th></tr></thead>
        <tbody className="divide-y divide-ink-100">{rows.map((r, i) => (
          <tr key={i}>
            <td className="td"><input className="h-8 w-32 rounded border border-ink-100 px-2 font-mono uppercase" value={r.code} onChange={(e) => up(i, { code: e.target.value.toUpperCase() })} aria-label="Code" /></td>
            <td className="td"><select className="h-8 rounded border border-ink-100 px-1" value={r.type} onChange={(e) => up(i, { type: e.target.value })} aria-label="Type"><option value="pct">%</option><option value="flat">৳</option></select></td>
            {['value', 'max', 'minOrder'].map((k) => <td key={k} className="td"><input type="number" className="h-8 w-20 rounded border border-ink-100 px-2" value={r[k] ?? ''} onChange={(e) => up(i, { [k]: Number(e.target.value) })} aria-label={k} /></td>)}
            <td className="td"><input className="h-8 w-24 rounded border border-ink-100 px-2" value={r.scope} onChange={(e) => up(i, { scope: e.target.value })} aria-label="Scope" /></td>
            <td className="td"><input className="h-8 w-48 rounded border border-ink-100 px-2" value={r.desc} onChange={(e) => up(i, { desc: e.target.value })} aria-label="Description" /></td>
            <td className="td">{r.used}/{r.limit}</td>
            <td className="td"><input type="checkbox" className="h-4 w-4 accent-brand-500" checked={r.active} onChange={(e) => up(i, { active: e.target.checked })} aria-label="Active" /></td>
          </tr>
        ))}</tbody></table></div>
      <div className="border-t border-ink-100 p-4"><button onClick={async () => { await save('promos', rows); toast('Promo codes saved'); }} className="btn-primary h-10 px-5">Save</button></div>
    </Panel>
  );
}

function Audit() {
  const { data, loading } = useApi(() => api.auditLog({ limit: 300 }), []);
  if (loading) return <Loading />;
  return (
    <Panel title="Audit log" action={<button onClick={() => downloadCSV('audit.csv', [['Time', 'Actor', 'Role', 'Action', 'Target'], ...data.map((r) => [r.at, r.actor, r.role, r.action, r.target])])} className="btn-outline h-8 px-3 text-sm"><Icon name="Download" size={14} />Export</button>}>
      {!data.length ? <p className="p-6 text-sm text-ink-500">No activity yet.</p> : <div className="overflow-x-auto"><table className="w-full"><thead className="bg-ink-50"><tr><th className="th">Time</th><th className="th">Actor</th><th className="th">Action</th><th className="th">Target</th></tr></thead>
        <tbody className="divide-y divide-ink-100">{data.map((r, i) => <tr key={i}><td className="td whitespace-nowrap text-ink-500">{fmtDate(r.at)} {fmtTime(r.at)}</td><td className="td">{r.actor}<div className="text-xs text-ink-500">{r.role}</div></td><td className="td"><span className="rounded bg-ink-50 px-2 py-0.5 font-mono text-xs">{r.action}</span></td><td className="td">{r.target}</td></tr>)}</tbody></table></div>}
    </Panel>
  );
}
