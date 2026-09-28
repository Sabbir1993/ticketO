import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import Link from './Link';
import Logo from './Logo';
import Icon from './Icon';
import CityModal from './CityModal';
import SearchModal from './SearchModal';
import { useStore } from '@/lib/store';
import { tierFor } from '@/lib/utils';

export default function Header() {
  const { config, prefs, user, merchant, signOut, ready } = useStore();
  const [cityOpen, setCityOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const { pathname, search } = useLocation();
  useEffect(() => { if (ready && !prefs.city && (pathname === '/' || pathname.startsWith('/explore'))) setCityOpen(true); }, [ready, prefs.city, pathname]);
  useEffect(() => setDrawer(false), [pathname, search]);
  const cityName = config?.cities.find((c) => c.id === prefs.city)?.name || 'Select city';
  const customer = user?.role === 'customer' ? user : null;
  const staff = user && user.role !== 'customer' ? user : null;

  return (
    <header className="sticky top-0 z-40 bg-white shadow-[0_1px_0_#eceef3]">
      <div className="container-x flex h-16 items-center gap-4">
        <Logo />
        <button onClick={() => setSearchOpen(true)} className="hidden h-10 max-w-xl flex-1 items-center gap-3 rounded-md border border-ink-100 px-3 text-left text-sm text-ink-500 hover:border-ink-300 md:flex"><Icon name="Search" size={17} /> Search for Movies, Matches, Concerts, Plays and Activities</button>
        <div className="ml-auto flex items-center gap-2 sm:gap-4">
          <button onClick={() => setSearchOpen(true)} className="p-2 md:hidden" aria-label="Search"><Icon name="Search" size={20} /></button>
          <button onClick={() => setCityOpen(true)} className="flex items-center gap-1 text-sm text-ink-800"><span className="max-w-[90px] truncate">{cityName}</span><Icon name="ChevronDown" size={15} /></button>
          {!user && <Link href={`/login?next=${encodeURIComponent(pathname)}`} className="btn-primary h-8 px-4 text-xs">Sign in</Link>}
          <button onClick={() => setDrawer(true)} className="flex items-center gap-2" aria-label="Menu">
            {user && <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink-800 text-sm font-semibold text-white">{(user.name || 'U')[0]}</span>}
            <Icon name="Menu" size={22} />
          </button>
        </div>
      </div>
      <nav className="hidden bg-ink-50 md:block">
        <div className="container-x flex h-10 items-center justify-between text-sm">
          <div className="flex gap-6">
            {config?.categories.slice(0, 8).map((c) => <Link key={c.id} href={`/explore?category=${c.id}`} className="text-ink-800 hover:text-brand-500">{c.name}</Link>)}
          </div>
          <div className="flex gap-6 text-ink-700">
            <Link href={merchant ? '/merchant' : '/merchant/register'} className="font-medium text-brand-600 hover:text-brand-700">{merchant ? 'Merchant portal' : 'Sell tickets'}</Link>
            <Link href="/offers" className="hover:text-brand-500">Offers</Link>
            <Link href="/profile?tab=rewards" className="hover:text-brand-500">Rewards</Link>
          </div>
        </div>
      </nav>
      <CityModal open={cityOpen} onClose={() => setCityOpen(false)} />
      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
      {drawer && (
        <div className="fixed inset-0 z-50 bg-black/50" onClick={() => setDrawer(false)}>
          <aside onClick={(e) => e.stopPropagation()} className="ml-auto flex h-full w-full max-w-sm animate-fadein flex-col overflow-y-auto bg-white">
            <div className="flex items-center justify-between bg-ink-800 px-5 py-5 text-white">
              <div><div className="text-lg font-semibold">Hey{user ? `, ${(user.name || '').split(' ')[0]}` : '!'}</div><span className="text-xs text-white/70">{staff ? `${staff.role === 'admin' ? 'Platform admin' : merchant?.name}` : customer ? customer.phone : 'Sign in for rewards & faster checkout'}</span></div>
              {!user && <Link href="/login" className="btn-primary h-8 px-4 text-xs">Login</Link>}
            </div>
            {customer && <Link href="/profile?tab=rewards" className="mx-4 mt-4 flex items-center gap-3 rounded-xl bg-gradient-to-r from-amber-100 to-brand-50 p-3"><Icon name="Crown" size={22} className="text-amber-500" /><div className="text-sm"><b>{tierFor(prefs.lifetimePoints).name} member</b><div className="text-ink-500">{prefs.points.toLocaleString()} points</div></div></Link>}
            <ul className="mt-2 divide-y divide-ink-100 px-2 text-[15px]">
              {[['Ticket', 'Your Orders', '/profile?tab=bookings'], ['Heart', 'Wishlist', '/profile?tab=wishlist'], ['Award', 'Rewards & Badges', '/profile?tab=rewards'], ['Percent', 'Offers', '/offers'], ['LifeBuoy', 'Help & Support', '/help']].map(([i, l, h]) => (
                <li key={h}><Link href={h} className="flex items-center gap-4 px-3 py-3.5 hover:bg-ink-50"><Icon name={i} size={19} className="text-ink-500" />{l}<Icon name="ChevronRight" size={16} className="ml-auto text-ink-300" /></Link></li>
              ))}
            </ul>
            <div className="mt-2 px-5 pb-1 pt-4 text-xs font-semibold uppercase tracking-wider text-ink-500">For organisers & staff</div>
            <ul className="px-2 pb-4 text-[15px]">
              {[['Store', merchant ? 'Merchant portal' : 'Become a merchant', merchant ? '/merchant' : '/merchant/register'], ['LayoutGrid', 'POS box office', '/pos'], ['ScanLine', 'Gate scanner', '/gate'], ['ShieldCheck', 'Admin console', '/admin'], ['LogIn', 'Partner / admin login', '/partner/login']].map(([i, l, h]) => (
                <li key={h}><Link href={h} className="flex items-center gap-4 px-3 py-3 hover:bg-ink-50"><Icon name={i} size={19} className="text-ink-500" />{l}</Link></li>
              ))}
            </ul>
            {user && <button onClick={() => { signOut(); setDrawer(false); }} className="mx-5 mb-6 mt-auto rounded-lg border border-brand-500 py-2.5 font-medium text-brand-500">Sign out</button>}
          </aside>
        </div>
      )}
    </header>
  );
}
