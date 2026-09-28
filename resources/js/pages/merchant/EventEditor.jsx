// Merchant event editor — category decides the venue view (configured by admin),
// merchant picks venue + layout template, prices each tier, switches blocks on/off,
// adds show dates and publishes.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Icon from '@/components/Icon';
import Poster from '@/components/Poster';
import VenueMap, { TierLegend } from '@/components/venue/VenueMap';
import { Loading } from '@/components/States';
import { DesignerModal } from '@/pages/admin/Admin';
import { blockCapacity } from '@shared/templates.mjs';
import { api } from '@/lib/api';
import { useApi, useStore } from '@/lib/store';
import { bdt, cx, toLocalInput, STATUS_LABEL } from '@/lib/utils';

const STEPS = ['Basics', 'Venue & layout', 'Pricing', 'Schedule', 'Policies & promos', 'Review & publish'];
const PALETTES = [['#1E3A8A', '#2D499A'], ['#9F1239', '#EE3240'], ['#7b2cbf', '#ff006e'], ['#006d77', '#83c5be'], ['#023e8a', '#90e0ef'], ['#9d0208', '#ffba08'], ['#1b4332', '#d4a017'], ['#240046', '#7b2cbf'], ['#e63946', '#1d3557'], ['#004b23', '#95d5b2']];
const isMap = (spec) => { const s = (spec?.blocks || []).filter((b) => b.sell !== 'none'); return s.length > 0 && s.every((b) => b.shape); };
const in7 = () => { const d = new Date(Date.now() + 7 * 86400000); d.setHours(19, 0, 0, 0); return toLocalInput(d.toISOString()); };

function blank(config) {
  const c = config.categories.find((x) => x.id === 'sports');
  const sub = c.subCategories[0];
  return {
    title: '', category: c.id, subCategory: sub.id, genres: 'Cricket', language: 'Bangla', duration: '4 hours', certificate: 'All ages', description: '', cast: '', sponsors: '', palette: PALETTES[0],
    viewType: sub.viewType, templateId: sub.templateId, venueIds: [], tiers: [], shows: [{ date: in7(), label: 'Match day' }], blockOverrides: {},
    policy: { cancellable: true, refundable: true, transferable: true, refundWindowHrs: 24, cancellationFeePct: 10 }, bookingLimit: 6, saleStart: toLocalInput(new Date().toISOString()), saleEnd: '', promos: [],
  };
}
function fromServer(e) {
  return { ...e, genres: (e.genres || []).join(', '), cast: (e.cast || []).map((c) => c.name).join(', '), sponsors: (e.sponsors || []).join(', '),
    shows: (e.shows || []).map((s) => ({ ...s, date: toLocalInput(s.date) })), saleStart: toLocalInput(e.saleStart), saleEnd: toLocalInput(e.saleEnd),
    tiers: e.tiers.map((t) => ({ ...t, earlyBird: t.earlyBird ? { ...t.earlyBird, until: toLocalInput(t.earlyBird.until) } : null })) };
}
function toServer(f) {
  return { ...f, genres: f.genres.split(',').map((x) => x.trim()).filter(Boolean), cast: f.cast.split(',').map((x) => x.trim()).filter(Boolean).map((name) => ({ name, role: f.category === 'sports' ? 'Team' : 'Artist' })),
    sponsors: f.sponsors.split(',').map((x) => x.trim()).filter(Boolean), shows: f.shows.filter((s) => s.date).map((s) => ({ ...s, date: new Date(s.date).toISOString() })),
    saleStart: f.saleStart ? new Date(f.saleStart).toISOString() : null, saleEnd: f.saleEnd ? new Date(f.saleEnd).toISOString() : null,
    tiers: f.tiers.filter((t) => t.price !== '' && t.price !== null && t.price !== undefined && t.on !== false).map((t) => ({ ...t, earlyBird: t.earlyBird?.price && t.earlyBird?.until ? { price: Number(t.earlyBird.price), until: new Date(t.earlyBird.until).toISOString() } : null })) };
}

export default function EventEditor() {
  const { id } = useParams();
  const nav = useNavigate();
  const { config, merchant, toast } = useStore();
  const templates = useApi(() => api.listTemplates({}), []);
  const venues = useApi(() => api.listVenues(), []);
  const existing = useApi(() => (id ? api.getMerchantEvent({ id }) : null), [id]);
  const [f, setF] = useState(null);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [designing, setDesigning] = useState(null);

  useEffect(() => { if (id && existing.data) setF(fromServer(existing.data)); else if (!id) setF(blank(config)); }, [id, existing.data]); // eslint-disable-line
  const baseTpl = useMemo(() => templates.data?.find((t) => t.id === f?.templateId), [templates.data, f?.templateId]);
  // The event's own layout (customSpec) wins over the shared template.
  const tpl = useMemo(() => (baseTpl && f?.customSpec ? { ...baseTpl, spec: f.customSpec } : baseTpl), [baseTpl, f?.customSpec]);
  const tierSig = tpl ? tpl.spec.tiers.map((t) => `${t.id}:${t.name}:${t.color}`).join('|') : '';
  // Keep tier rows in sync with the chosen template (keep prices of matching tiers)
  useEffect(() => {
    if (!tpl || !f) return;
    const cur = Object.fromEntries(f.tiers.map((t) => [t.id, t]));
    const known = new Set(templates.data.flatMap((x) => x.spec.tiers.map((t) => t.name)));
    const next = tpl.spec.tiers.map((t) => (cur[t.id] ? { ...cur[t.id], color: t.color, name: known.has(cur[t.id].name) ? t.name : cur[t.id].name } : { id: t.id, name: t.name, color: t.color, price: '', limit: '', earlyBird: null, on: true }));
    setF((s) => ({ ...s, tiers: next }));
  }, [tpl?.id, tierSig]); // eslint-disable-line

  if (!f || templates.loading || venues.loading) return <Loading />;
  const set = (patch) => setF((s) => ({ ...s, ...patch }));
  const cat = config.categories.find((c) => c.id === f.category);
  const viewInfo = config.viewTypes.find((v) => v.id === f.viewType);
  const tplOptions = templates.data.filter((t) => t.viewType === f.viewType);
  const venue = venues.data.find((v) => v.id === f.venueIds[0]);
  const venueList = [...venues.data].sort((a, b) => (b.templateIds.some((t) => tplOptions.some((o) => o.id === t)) ? 1 : 0) - (a.templateIds.some((t) => tplOptions.some((o) => o.id === t)) ? 1 : 0));
  const pickCategory = (catId, subId) => {
    const c = config.categories.find((x) => x.id === catId); const s = c.subCategories.find((x) => x.id === subId);
    const map = s || c;
    const names = new Set(config.categories.flatMap((x) => [x.name, ...x.subCategories.map((y) => y.name)]));
    set({ category: catId, subCategory: s ? s.id : null, viewType: map.viewType, templateId: map.templateId, blockOverrides: {}, genres: !f.genres || names.has(f.genres) ? (s?.name || c.name) : f.genres });
  };
  const tierMap = Object.fromEntries(f.tiers.map((t) => [t.id, t]));
  const previewBlocks = tpl ? tpl.spec.blocks.map((b) => {
    const o = f.blockOverrides[b.id] || {}; const t = tierMap[b.tier];
    const priced = t && t.on !== false && t.price !== '' && t.price !== null && t.price !== undefined;
    const merged = { ...b, ...(o.capacity ? { capacity: Number(o.capacity) } : {}) };
    const cap = blockCapacity(merged);
    return { ...merged, enabled: b.sell !== 'none' && o.enabled !== false && priced, color: t?.color || tpl.spec.tiers.find((x) => x.id === b.tier)?.color || '#94a3b8', price: priced ? Number(t.price) : null, tierName: t?.name || b.tier, capacity: cap, available: cap, userOff: o.enabled === false };
  }) : [];
  const toggleBlock = (b) => set({ blockOverrides: { ...f.blockOverrides, [b.id]: { ...(f.blockOverrides[b.id] || {}), enabled: f.blockOverrides[b.id]?.enabled === false } } });
  const capacity = previewBlocks.filter((b) => b.enabled).reduce((a, b) => a + b.capacity, 0);
  const pricedTiers = f.tiers.filter((t) => t.on !== false && t.price !== '' && t.price !== null && t.price !== undefined);

  const checks = [
    [!!f.title.trim() && f.description.trim().length > 10, 'Name and description'],
    [!!f.venueIds.length, 'Venue selected'],
    [pricedTiers.length > 0 && capacity > 0, `${pricedTiers.length} priced categories · ${capacity.toLocaleString()} sellable capacity`],
    [f.shows.some((s) => s.date && new Date(s.date) > new Date()), 'At least one upcoming show'],
    [merchant?.status === 'active', merchant?.status === 'active' ? 'Merchant account verified' : 'Merchant KYC approval (publishing unlocks after admin review)'],
    [merchant?.pg?.mode !== 'direct' || !!(merchant.pg.sslcommerz?.verifiedAt || merchant.pg.bkash?.verifiedAt), merchant?.pg?.mode === 'direct' ? 'Your own gateway connection verified' : 'Payments collected by Ticketo'],
  ];
  const save = async (publish) => {
    setBusy(true);
    try {
      const saved = await api.saveEvent({ event: toServer({ ...f, id: f.id }) });
      setF(fromServer(saved));
      if (publish) {
        const p = await api.publishEvent({ id: saved.id });
        setF(fromServer(p));
        toast(p.status === 'published' ? 'Published — your event is live!' : 'Submitted for admin review');
      } else toast('Draft saved');
      if (!id) nav(`/merchant/events/${saved.id}`, { replace: true });
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_260px]">
      <div className="card min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 px-5 py-3"><div className="text-sm text-ink-500">{f.id ? <>Editing · <span className="badge bg-ink-100 text-ink-700">{STATUS_LABEL[f.status] || f.status}</span></> : 'New event'}</div>{f.reviewNote && <span className="text-xs text-brand-600">Admin note: {f.reviewNote}</span>}</div>
        <ol className="no-scrollbar flex gap-1 overflow-x-auto border-b border-ink-100 p-3">{STEPS.map((s, i) => <li key={s}><button onClick={() => setStep(i)} className={cx('flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm', i === step ? 'bg-brand-50 font-semibold text-brand-600' : 'text-ink-500 hover:bg-ink-50')}><span className={cx('flex h-6 w-6 items-center justify-center rounded-full text-xs', i === step ? 'bg-brand-500 text-white' : 'bg-ink-100')}>{i + 1}</span>{s}</button></li>)}</ol>
        <div className="space-y-5 p-6">
          {step === 0 && (<>
            <div><label className="label" htmlFor="ev-title">Event name *</label><input id="ev-title" className="input" value={f.title} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. Dhaka Derby — League Final" /></div>
            <div>
              <label className="label">Category *</label>
              <div className="flex flex-wrap gap-2">{config.categories.map((c) => <button key={c.id} type="button" onClick={() => pickCategory(c.id, c.subCategories[0]?.id)} className={cx('chip', f.category === c.id && 'chip-on')}>{c.name}</button>)}</div>
              {!!cat?.subCategories.length && <div className="mt-3 flex flex-wrap gap-2">{cat.subCategories.map((s) => <button key={s.id} type="button" onClick={() => pickCategory(cat.id, s.id)} className={cx('rounded-full border px-3 py-1 text-xs font-medium', f.subCategory === s.id ? 'border-ink-800 bg-ink-800 text-white' : 'border-ink-300')}>{s.name}</button>)}</div>}
              <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-500"><Icon name="Map" size={14} />Booking view: <b className="text-ink-700">{viewInfo?.name}</b> — set by the platform for this category.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div><label className="label" htmlFor="ev-g">Tags / genres</label><input id="ev-g" className="input" value={f.genres} onChange={(e) => set({ genres: e.target.value })} /></div>
              <div><label className="label" htmlFor="ev-l">Language</label><input id="ev-l" className="input" value={f.language} onChange={(e) => set({ language: e.target.value })} /></div>
              <div><label className="label" htmlFor="ev-d">Duration</label><input id="ev-d" className="input" value={f.duration} onChange={(e) => set({ duration: e.target.value })} /></div>
            </div>
            <div><label className="label" htmlFor="ev-desc">Description *</label><textarea id="ev-desc" rows={4} className="input h-auto py-2" value={f.description} onChange={(e) => set({ description: e.target.value })} /></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label className="label" htmlFor="ev-cast">{f.category === 'sports' ? 'Teams / athletes' : 'Artists / speakers'} (comma separated)</label><input id="ev-cast" className="input" value={f.cast} onChange={(e) => set({ cast: e.target.value })} /></div>
              <div><label className="label" htmlFor="ev-sp">Sponsors (comma separated)</label><input id="ev-sp" className="input" value={f.sponsors} onChange={(e) => set({ sponsors: e.target.value })} /></div>
            </div>
            <div><label className="label">Banner theme</label><div className="flex flex-wrap gap-2">{PALETTES.map((p) => <button key={p.join()} type="button" onClick={() => set({ palette: p })} className={cx('h-10 w-16 rounded-lg ring-offset-2', f.palette.join() === p.join() && 'ring-2 ring-brand-500')} style={{ background: `linear-gradient(135deg, ${p[0]}, ${p[1]})` }} aria-label="Theme" />)}</div></div>
          </>)}

          {step === 1 && (<>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label className="label" htmlFor="ev-v">Venue *</label><select id="ev-v" className="input" value={f.venueIds[0] || ''} onChange={(e) => { const v = venues.data.find((x) => x.id === e.target.value); const t = v?.templateIds.find((tid) => tplOptions.some((o) => o.id === tid)); set({ venueIds: e.target.value ? [e.target.value] : [], ...(t ? { templateId: t, blockOverrides: {}, customSpec: null } : {}) }); }}><option value="">Select a venue</option>{venueList.map((v) => <option key={v.id} value={v.id}>{v.name} — {v.city}</option>)}</select></div>
              <div><label className="label" htmlFor="ev-vt">Booking view</label><select id="ev-vt" className="input" value={f.viewType} onChange={(e) => { const t = templates.data.find((x) => x.viewType === e.target.value); set({ viewType: e.target.value, templateId: t?.id || '', blockOverrides: {}, customSpec: null }); }}>{config.viewTypes.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></div>
            </div>
            <div>
              <label className="label">Layout template</label>
              <div className="grid gap-3 sm:grid-cols-2">{tplOptions.map((t) => <button key={t.id} type="button" onClick={() => set({ templateId: t.id, blockOverrides: {}, customSpec: null })} className={cx('rounded-xl border-2 p-3 text-left', f.templateId === t.id ? 'border-brand-500 bg-brand-50' : 'border-ink-100 hover:border-ink-300')}><div className="flex items-center gap-2 font-medium">{t.name}{t.mine && <span className="badge bg-brand-50 text-brand-700">my layout</span>}</div><div className="text-xs text-ink-500">{t.spec.blocks.length} blocks · {t.spec.tiers.length} price tiers · {t.spec.blocks.reduce((a, b) => a + blockCapacity(b), 0).toLocaleString()} capacity</div></button>)}</div>
              {!tplOptions.length && <p className="text-sm text-brand-600">No template for this view yet — ask the platform admin to add one.</p>}
            </div>
            {tpl && (
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-brand-100 bg-brand-50/60 p-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-500 text-white"><Icon name="PenTool" size={18} /></span>
                <div className="min-w-0 flex-1"><div className="font-semibold">{f.customSpec ? 'This event uses its own custom layout' : 'Make this venue unique'}</div><div className="text-sm text-ink-500">{f.customSpec ? `Based on ${baseTpl.name} · ${tpl.spec.blocks.length} blocks` : 'Redraw stands, add a fan pit or VIP tables, change rows and seats — only for this event.'}</div></div>
                <button type="button" onClick={() => setDesigning({ id: `custom-${f.id || 'new'}`, name: `${f.title || 'Event'} layout`, viewType: f.viewType, spec: JSON.parse(JSON.stringify(tpl.spec)), _k: Date.now() })} className="btn-primary h-10 px-4 text-sm"><Icon name="PenTool" size={15} />{f.customSpec ? 'Edit layout' : 'Customise layout'}</button>
                {f.customSpec && <button type="button" onClick={() => set({ customSpec: null, blockOverrides: {} })} className="btn-outline h-10 px-3 text-sm">Reset to template</button>}
              </div>
            )}
            {tpl && (
              <div>
                <div className="mb-2 flex items-center justify-between"><label className="label mb-0">Blocks on sale</label><span className="text-xs text-ink-500">{isMap(tpl.spec) ? 'Click a block on the map to switch it on/off' : 'Switch sections on/off below'}</span></div>
                {isMap(tpl.spec) && <div className="rounded-xl border border-ink-100 p-3"><VenueMap viewType={f.viewType} spec={tpl.spec} blocks={previewBlocks} mode="edit" onSelect={toggleBlock} /></div>}
                <div className="mt-3 max-h-80 overflow-y-auto rounded-xl border border-ink-100">
                  <table className="w-full text-sm"><thead className="sticky top-0 bg-ink-50"><tr><th className="th">Block</th><th className="th">Category</th><th className="th">Type</th><th className="th">Capacity</th><th className="th">On sale</th></tr></thead>
                    <tbody className="divide-y divide-ink-100">{previewBlocks.filter((b) => b.sell !== 'none').map((b) => (
                      <tr key={b.id} className={cx(!b.enabled && 'text-ink-500')}>
                        <td className="td"><b>{b.id}</b> · {b.name}</td><td className="td"><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full" style={{ background: b.color }} />{b.tierName}</td><td className="td">{b.sell === 'ga' ? 'Standing / free seating' : `${b.capacity} numbered seats`}</td>
                        <td className="td">{b.sell === 'ga' ? <input type="number" min="1" className="h-8 w-24 rounded border border-ink-100 px-2" value={f.blockOverrides[b.id]?.capacity ?? b.capacity} onChange={(e) => set({ blockOverrides: { ...f.blockOverrides, [b.id]: { ...(f.blockOverrides[b.id] || {}), capacity: Number(e.target.value) } } })} aria-label={`${b.name} capacity`} /> : b.capacity}</td>
                        <td className="td"><button type="button" onClick={() => toggleBlock(b)} className={cx('relative h-6 w-11 rounded-full transition', !b.userOff ? 'bg-emerald-500' : 'bg-ink-300')} aria-label={`Toggle ${b.name}`} aria-pressed={!b.userOff}><span className={cx('absolute top-0.5 h-5 w-5 rounded-full bg-white transition', !b.userOff ? 'left-[22px]' : 'left-0.5')} /></button></td>
                      </tr>
                    ))}</tbody></table>
                </div>
                <p className="mt-2 text-xs text-ink-500">Blocks in a category without a price are not sold. Sellable capacity: <b>{capacity.toLocaleString()}</b></p>
              </div>
            )}
          </>)}

          {step === 2 && (<>
            <p className="text-sm text-ink-500">Set a price for each category you want to sell. Leave empty (or switch off) to keep those blocks closed.</p>
            <div className="space-y-3">{f.tiers.map((t, i) => {
              const up = (patch) => set({ tiers: f.tiers.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
              return (
                <div key={t.id} className={cx('rounded-xl border border-ink-100 p-4', t.on === false && 'opacity-50')}>
                  <div className="flex flex-wrap items-end gap-3">
                    <span className="mb-3 h-4 w-4 shrink-0 rounded" style={{ background: t.color }} />
                    <div className="min-w-[160px] flex-1"><label className="label" htmlFor={`t-n-${t.id}`}>Category name</label><input id={`t-n-${t.id}`} className="input" value={t.name} onChange={(e) => up({ name: e.target.value })} /></div>
                    <div className="w-32"><label className="label" htmlFor={`t-p-${t.id}`}>Price (৳)</label><input id={`t-p-${t.id}`} type="number" min="0" className="input" value={t.price} onChange={(e) => up({ price: e.target.value === '' ? '' : Number(e.target.value) })} placeholder="—" /></div>
                    <div className="w-28"><label className="label" htmlFor={`t-l-${t.id}`}>Max / order</label><input id={`t-l-${t.id}`} type="number" min="1" className="input" value={t.limit || ''} onChange={(e) => up({ limit: e.target.value ? Number(e.target.value) : null })} placeholder="any" /></div>
                    <div className="w-32"><label className="label" htmlFor={`t-e-${t.id}`}>Early-bird ৳</label><input id={`t-e-${t.id}`} type="number" className="input" value={t.earlyBird?.price || ''} onChange={(e) => up({ earlyBird: { ...(t.earlyBird || {}), price: e.target.value } })} placeholder="optional" /></div>
                    <div className="w-52"><label className="label" htmlFor={`t-u-${t.id}`}>Early-bird until</label><input id={`t-u-${t.id}`} type="datetime-local" className="input" value={t.earlyBird?.until || ''} onChange={(e) => up({ earlyBird: { ...(t.earlyBird || {}), until: e.target.value } })} /></div>
                    <button type="button" onClick={() => up({ on: t.on === false })} className="btn-ghost mb-0.5 h-11 px-3 text-sm">{t.on === false ? 'Enable' : 'Disable'}</button>
                  </div>
                </div>
              );
            })}</div>
            {tpl && isMap(tpl.spec) && <div className="rounded-xl border border-ink-100 p-3"><VenueMap viewType={f.viewType} spec={tpl.spec} blocks={previewBlocks} mode="preview" /><div className="mt-2"><TierLegend tiers={f.tiers.map((t) => ({ ...t, price: t.price === '' ? null : t.price }))} blocks={previewBlocks} /></div></div>}
          </>)}

          {step === 3 && (<>
            <div><label className="label">Shows / match days</label>
              <div className="space-y-2">{f.shows.map((s, i) => (
                <div key={i} className="flex flex-wrap gap-2">
                  <input type="datetime-local" className="input w-auto flex-1" value={s.date} onChange={(e) => set({ shows: f.shows.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)) })} aria-label="Show date" />
                  <input className="input w-44" value={s.label} onChange={(e) => set({ shows: f.shows.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} placeholder="Label" aria-label="Show label" />
                  <button type="button" onClick={() => set({ shows: f.shows.filter((_, j) => j !== i) })} disabled={f.shows.length === 1} className="btn-outline h-11 w-11 p-0" aria-label="Remove show"><Icon name="Trash2" size={16} /></button>
                </div>
              ))}</div>
              <button type="button" onClick={() => set({ shows: [...f.shows, { date: f.shows.at(-1)?.date || in7(), label: `Show ${f.shows.length + 1}` }] })} className="btn-ghost mt-2 h-9 px-3 text-sm text-brand-500"><Icon name="Plus" size={15} />Add show</button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label className="label" htmlFor="ev-ss">Online sales open</label><input id="ev-ss" type="datetime-local" className="input" value={f.saleStart || ''} onChange={(e) => set({ saleStart: e.target.value })} /></div>
              <div><label className="label" htmlFor="ev-se">Online sales close</label><input id="ev-se" type="datetime-local" className="input" value={f.saleEnd || ''} onChange={(e) => set({ saleEnd: e.target.value })} /></div>
            </div>
          </>)}

          {step === 4 && (<>
            <div className="grid gap-3 sm:grid-cols-3">{[['cancellable', 'Allow cancellation'], ['refundable', 'Allow refund requests'], ['transferable', 'Allow ticket transfer']].map(([k, l]) => <label key={k} className="flex items-center justify-between rounded-xl border border-ink-100 p-4 text-sm font-medium">{l}<input type="checkbox" className="h-5 w-5 accent-brand-500" checked={!!f.policy[k]} onChange={(e) => set({ policy: { ...f.policy, [k]: e.target.checked } })} /></label>)}</div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div><label className="label" htmlFor="p-w">Cancel window (hours before)</label><input id="p-w" type="number" className="input" value={f.policy.refundWindowHrs} onChange={(e) => set({ policy: { ...f.policy, refundWindowHrs: Number(e.target.value) } })} /></div>
              <div><label className="label" htmlFor="p-f">Cancellation fee %</label><input id="p-f" type="number" className="input" value={f.policy.cancellationFeePct} onChange={(e) => set({ policy: { ...f.policy, cancellationFeePct: Number(e.target.value) } })} /></div>
              <div><label className="label" htmlFor="p-l">Max tickets per order</label><input id="p-l" type="number" min="1" max={config.platform.maxTicketsPerOrder} className="input" value={f.bookingLimit} onChange={(e) => set({ bookingLimit: Number(e.target.value) })} /></div>
            </div>
            <div><label className="label">Event promo codes</label>
              {f.promos.map((p, i) => (
                <div key={i} className="mb-2 flex flex-wrap gap-2">
                  <input className="input w-40 uppercase" value={p.code} onChange={(e) => set({ promos: f.promos.map((x, j) => (j === i ? { ...x, code: e.target.value } : x)) })} placeholder="CODE" aria-label="Promo code" />
                  <select className="input w-28" value={p.type} onChange={(e) => set({ promos: f.promos.map((x, j) => (j === i ? { ...x, type: e.target.value } : x)) })} aria-label="Promo type"><option value="pct">% off</option><option value="flat">৳ off</option></select>
                  <input type="number" className="input w-24" value={p.value} onChange={(e) => set({ promos: f.promos.map((x, j) => (j === i ? { ...x, value: Number(e.target.value) } : x)) })} aria-label="Promo value" />
                  <button type="button" onClick={() => set({ promos: f.promos.filter((_, j) => j !== i) })} className="btn-outline h-11 w-11 p-0" aria-label="Remove promo"><Icon name="Trash2" size={15} /></button>
                </div>
              ))}
              <button type="button" onClick={() => set({ promos: [...f.promos, { code: '', type: 'pct', value: 10 }] })} className="btn-ghost h-9 px-3 text-sm text-brand-500"><Icon name="Plus" size={15} />Add promo code</button>
            </div>
          </>)}

          {step === 5 && (<>
            <ul className="space-y-2">{checks.map(([ok, label]) => <li key={label} className="flex items-center gap-2 text-sm"><Icon name={ok ? 'CheckCircle2' : 'AlertTriangle'} size={18} className={ok ? 'text-emerald-600' : 'text-amber-500'} />{label}</li>)}</ul>
            {config.platform.eventRequiresApproval && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">The platform reviews events before they go live. Publishing sends it to the admin queue.</p>}
            <dl className="grid grid-cols-[140px_1fr] gap-y-2 text-sm">
              <dt className="text-ink-500">Event</dt><dd className="font-medium">{f.title || '—'}</dd>
              <dt className="text-ink-500">View</dt><dd>{viewInfo?.name} · {tpl?.name}</dd>
              <dt className="text-ink-500">Venue</dt><dd>{venue?.name || '—'}</dd>
              <dt className="text-ink-500">Prices</dt><dd>{pricedTiers.map((t) => `${t.name} ${bdt(Number(t.price))}`).join(' · ') || '—'}</dd>
              <dt className="text-ink-500">Shows</dt><dd>{f.shows.filter((s) => s.date).length}</dd>
            </dl>
          </>)}
        </div>
        <div className="flex flex-wrap justify-between gap-2 border-t border-ink-100 p-4">
          <button type="button" onClick={() => setStep(Math.max(0, step - 1))} disabled={!step} className="btn-outline h-10 px-5">Back</button>
          <div className="flex gap-2">
            <button type="button" onClick={() => save(false)} disabled={busy} className="btn-outline h-10 px-5"><Icon name="Save" size={15} />Save draft</button>
            {step < STEPS.length - 1 ? <button type="button" onClick={() => setStep(step + 1)} className="btn-primary h-10 px-6">Continue</button>
              : <button type="button" onClick={() => save(true)} disabled={busy || f.status === 'published'} className="btn-primary h-10 px-6"><Icon name="Rocket" size={15} />{f.status === 'published' ? 'Live' : busy ? 'Publishing…' : 'Publish'}</button>}
          </div>
        </div>
      </div>
      <aside className="hidden xl:block"><div className="sticky top-24">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-500">Preview</div>
        <Poster event={{ ...f, id: f.id || 'new', title: f.title || 'Your event', genres: f.genres.split(',') }} className="aspect-[2/3] w-full shadow-card" />
        <div className="mt-2 font-semibold">{f.title || 'Your event'}</div><div className="text-sm text-ink-500">{venue?.name || 'Venue'}</div>
        {!!pricedTiers.length && <div className="mt-1 text-sm">{bdt(Math.min(...pricedTiers.map((t) => Number(t.price))))} onwards</div>}
      </div></aside>
      <DesignerModal open={!!designing} initial={designing} lockMeta viewTypes={config.viewTypes} title="Customise the layout for this event" saveLabel="Use for this event"
        onClose={() => setDesigning(null)}
        onSave={(t) => { set({ customSpec: t.spec, blockOverrides: {} }); setDesigning(null); toast('Custom layout applied — set prices for its tiers in step 3'); }}
        extra={(t, errs) => <button type="button" disabled={!t || errs.length > 0} onClick={async () => { try { const saved = await api.saveTemplate({ template: { name: t.name, viewType: f.viewType, spec: t.spec } }); await templates.reload(); set({ templateId: saved.id, customSpec: null, blockOverrides: {} }); setDesigning(null); toast(`Saved to your layouts as “${saved.name}”`); } catch (e) { toast(e.message, 'err'); } }} className="btn-outline mr-auto h-10 px-4 text-sm"><Icon name="Save" size={15} />Save as my reusable layout</button>} />
    </div>
  );
}
