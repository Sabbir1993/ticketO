import Link from './Link';
import Logo from './Logo';
import Icon from './Icon';
import { useStore } from '@/lib/store';

export default function Footer() {
  const { config } = useStore();
  return (
    <footer className="mt-16 bg-dark text-ink-300">
      <div className="bg-brand-500/20">
        <div className="container-x flex flex-col items-center justify-between gap-4 py-5 sm:flex-row">
          <div className="flex items-center gap-3 text-white"><Icon name="Megaphone" size={22} /><span><b>Sell your event on {config?.branding?.name || 'Ticketo'}</b> — sign up as a merchant, connect your payment gateway and publish.</span></div>
          <Link href="/merchant/register" className="btn-primary h-9 px-5 text-sm">Become a merchant</Link>
        </div>
      </div>
      <div className="container-x grid grid-cols-3 gap-6 py-8 text-center text-xs sm:grid-cols-6">
        {[['LifeBuoy', '24/7 Customer Care', '/help'], ['Ticket', 'Your bookings', '/profile?tab=bookings'], ['Store', 'Merchant portal', '/merchant'], ['LayoutGrid', 'Box office (POS)', '/pos'], ['ScanLine', 'Gate scanner', '/gate'], ['Gift', 'Offers', '/offers']].map(([i, t, h]) => (
          <Link key={t} href={h} className="flex flex-col items-center gap-2 hover:text-white"><Icon name={i} size={30} strokeWidth={1.2} />{t}</Link>
        ))}
      </div>
      <div className="container-x border-t border-white/10 py-6 text-xs leading-6">
        <p className="mb-1 font-semibold uppercase text-ink-100">Explore</p>
        <p>{config?.categories.map((c) => <Link key={c.id} href={`/explore?category=${c.id}`} className="hover:text-white">{c.name} | </Link>)}</p>
        <p className="mb-1 mt-3 font-semibold uppercase text-ink-100">We accept</p>
        <p>{config?.paymentMethods.map((m) => m.name).join(' · ')}</p>
      </div>
      <div className="container-x flex flex-col items-center gap-3 border-t border-white/10 py-8 text-center text-xs">
        <Logo light />
        <p className="max-w-3xl text-ink-500">Copyright {new Date().getFullYear()} © {config?.branding?.name || 'Ticketo'} · {config?.branding?.tagline}. Tickets are sold on behalf of the listed organisers.</p>
        <div className="flex gap-4"><Link href="/help#terms" className="hover:text-white">Terms</Link><Link href="/help#privacy" className="hover:text-white">Privacy</Link><Link href="/help#refund" className="hover:text-white">Refund policy</Link></div>
      </div>
    </footer>
  );
}
