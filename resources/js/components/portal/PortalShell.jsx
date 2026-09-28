'use client';
import Link from '@/components/Link';
import { useState } from 'react';
import Logo from '@/components/Logo';
import Icon from '@/components/Icon';
import { cx } from '@/lib/utils';

export default function PortalShell({ title, subtitle, nav, active, onNav, user, children, actions }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex min-h-screen bg-ink-50">
      <aside className={cx('fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-dark text-ink-300 transition-transform lg:translate-x-0', open ? 'translate-x-0' : '-translate-x-full')}>
        <div className="flex h-16 items-center gap-2 px-5"><Logo light href="/" /></div>
        <div className="mx-4 mb-3 flex items-center gap-2 rounded-lg bg-brand-500/25 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-white"><span className="h-1.5 w-1.5 rounded-full bg-accent-500" />{title}</div>
        <nav className="flex-1 overflow-y-auto px-3 pb-4">
          {nav.map((n) => n.section ? (
            <div key={n.section} className="px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-ink-500">{n.section}</div>
          ) : (
            <button key={n.id} onClick={() => { onNav(n.id); setOpen(false); }} className={cx('mb-0.5 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition', active === n.id ? 'bg-brand-500 font-medium text-white shadow-sm' : 'hover:bg-white/5 hover:text-white')}>
              <Icon name={n.icon} size={17} />{n.label}{n.badge ? <span className="ml-auto rounded-full bg-accent-500 px-1.5 text-[11px] font-semibold text-white">{n.badge}</span> : null}
            </button>
          ))}
        </nav>
        <div className="border-t border-white/10 p-4 text-xs">
          <div className="flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 font-semibold text-white">{user?.[0]}</span><div><div className="text-white">{user}</div><div>{subtitle}</div></div></div>
          <Link href="/" className="mt-3 flex items-center gap-2 hover:text-white"><Icon name="ArrowLeft" size={14} />Back to Ticketo</Link>
        </div>
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setOpen(false)} />}
      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-ink-100 bg-white px-4 md:px-8">
          <button onClick={() => setOpen(true)} className="lg:hidden" aria-label="Open menu"><Icon name="Menu" /></button>
          <h1 className="truncate text-lg font-semibold">{nav.find((n) => n.id === active)?.label}</h1>
          <div className="ml-auto flex items-center gap-2">{actions}</div>
        </header>
        <div className="flex-1 p-4 md:p-8">{children}</div>
      </div>
    </div>
  );
}

export function Stat({ label, value, sub, icon, trend }) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between text-sm text-ink-500">{label}{icon && <Icon name={icon} size={18} className="text-ink-300" />}</div>
      <div className="mt-2 text-2xl font-bold tabular-nums text-ink-900">{value}</div>
      {sub && <div className={cx('mt-1 text-xs', trend === 'up' ? 'text-emerald-600' : trend === 'down' ? 'text-brand-600' : 'text-ink-500')}>{trend === 'up' ? '▲ ' : trend === 'down' ? '▼ ' : ''}{sub}</div>}
    </div>
  );
}

export function Panel({ title, action, children, className }) {
  return (
    <section className={cx('card', className)}>
      {title && <div className="flex items-center justify-between border-b border-ink-100 px-5 py-3.5"><h2 className="font-semibold">{title}</h2>{action}</div>}
      <div>{children}</div>
    </section>
  );
}

export function Pill({ status }) {
  const map = {
    active: 'bg-emerald-50 text-emerald-700', approved: 'bg-emerald-50 text-emerald-700', published: 'bg-emerald-50 text-emerald-700', paid: 'bg-emerald-50 text-emerald-700', confirmed: 'bg-emerald-50 text-emerald-700', resolved: 'bg-emerald-50 text-emerald-700', valid: 'bg-emerald-50 text-emerald-700', refunded: 'bg-sky-50 text-sky-700',
    pending: 'bg-amber-50 text-amber-700', refund_requested: 'bg-amber-50 text-amber-700', processing: 'bg-amber-50 text-amber-700', open: 'bg-amber-50 text-amber-700', duplicate: 'bg-amber-50 text-amber-700', draft: 'bg-ink-100 text-ink-700',
    rejected: 'bg-brand-50 text-brand-700', refund_rejected: 'bg-brand-50 text-brand-700', invalid: 'bg-brand-50 text-brand-700', void: 'bg-brand-50 text-brand-700', cancelled: 'bg-ink-100 text-ink-700', suspended: 'bg-brand-50 text-brand-700', high: 'bg-brand-50 text-brand-700', normal: 'bg-ink-100 text-ink-700',
  };
  return <span className={cx('badge capitalize', map[status] || 'bg-ink-100 text-ink-700')}>{String(status).replace('_', ' ')}</span>;
}
