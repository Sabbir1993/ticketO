import { useState } from 'react';
import Link from '@/components/Link';
import Icon from '@/components/Icon';
import { useStore } from '@/lib/store';
import { bdt } from '@/lib/utils';

export function Offers() {
  const { config, toast } = useStore();
  return (
    <div className="bg-ink-50/70 py-10"><div className="container-x">
      <h1 className="text-3xl font-bold">Offers for you</h1><p className="mt-1 text-ink-500">Apply at checkout. One code per booking.</p>
      <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{config.promos.map((p) => (
        <div key={p.code} className="card overflow-hidden"><div className="flex items-center gap-3 bg-brand-50 p-5"><span className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-500 text-white"><Icon name="Percent" /></span><div><div className="text-lg font-bold">{p.type === 'flat' ? `${bdt(p.value)} OFF` : `${p.value}% OFF`}</div><div className="text-sm capitalize text-ink-500">{p.scope === 'all' ? 'All events' : p.scope}</div></div></div>
          <div className="p-5"><p className="text-sm">{p.desc}</p><p className="mt-1 text-xs text-ink-500">Min order {bdt(p.minOrder)}{p.max ? ` · max ${bdt(p.max)}` : ''}</p>
            <div className="mt-4 flex items-center justify-between rounded-lg border border-dashed border-ink-300 px-3 py-2"><span className="font-mono font-bold tracking-wider">{p.code}</span><button onClick={() => navigator.clipboard?.writeText(p.code).then(() => toast('Code copied')).catch(() => toast(p.code))} className="text-sm font-medium text-brand-500">Copy</button></div></div></div>
      ))}</div>
    </div></div>
  );
}

const FAQ = [
  ['How do I get my ticket?', 'After payment you get an M-ticket with a QR code on screen, by email and SMS, and as a PDF from Your Orders.'],
  ['Money was deducted but no ticket?', 'Payments are validated with the gateway server-to-server. If validation is still pending, it completes automatically within minutes; failed payments are reversed by the gateway.'],
  ['Can I choose my block in a stadium?', 'Yes — cricket and football events show the full stadium map. Tap a stand to see its seats or passes.'],
  ['Can I cancel or get a refund?', 'Depends on the organiser’s policy shown on the event page. Go to Your Orders → Cancel / refund.'],
  ['I organise events — how do I sell?', 'Sign up as a merchant, submit KYC, connect your own SSLCOMMERZ/bKash account (or let Ticketo collect), set up your venue layout and publish.'],
];
export function Help() {
  const [open, setOpen] = useState(0);
  return (
    <div className="bg-ink-50/70 py-10"><div className="container-x max-w-3xl">
      <h1 className="text-3xl font-bold">Help & Support</h1>
      <div className="card mt-6 divide-y divide-ink-100">{FAQ.map(([q, a], i) => <div key={q}><button onClick={() => setOpen(open === i ? -1 : i)} className="flex w-full items-center justify-between px-5 py-4 text-left font-medium">{q}<Icon name="ChevronDown" size={18} className={open === i ? 'rotate-180' : ''} /></button>{open === i && <p className="px-5 pb-4 text-sm text-ink-700">{a}</p>}</div>)}</div>
      <div className="mt-8 space-y-6 text-sm text-ink-700">
        <section id="terms"><h2 className="text-lg font-semibold text-ink-900">Terms</h2><p className="mt-2">Tickets are sold on behalf of organisers (merchants). The organiser is responsible for the event; entry is subject to a valid QR scan.</p></section>
        <section id="refund"><h2 className="text-lg font-semibold text-ink-900">Refund policy</h2><p className="mt-2">Refund eligibility, window and fees are set per event and shown before payment. Approved refunds go back to the original payment method.</p></section>
        <section id="privacy"><h2 className="text-lg font-semibold text-ink-900">Privacy</h2><p className="mt-2">Card and wallet data are handled by PCI-DSS compliant gateways and never stored by Ticketo.</p></section>
      </div>
    </div></div>
  );
}
export function NotFound() {
  return <div className="container-x flex flex-col items-center py-24 text-center"><div className="text-7xl font-extrabold text-brand-500">404</div><p className="mt-3 text-lg text-ink-700">This page isn&apos;t playing here.</p><Link href="/" className="btn-primary mt-6 h-11 px-6">Back to home</Link></div>;
}
