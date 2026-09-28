// Only in the single-file preview (no address bar): quick jump between apps + demo reset.
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { resetLocalDemo } from '@/lib/api';
import { useStore } from '@/lib/store';

const VIEWS = [['Customer site', '/'], ['Become a merchant', '/merchant/register'], ['Merchant portal', '/merchant'], ['Admin console', '/admin'], ['POS', '/pos'], ['Gate', '/gate'], ['Partner login', '/partner/login']];

export default function PreviewSwitcher() {
  const [open, setOpen] = useState(false);
  const nav = useNavigate(); const { pathname } = useLocation();
  const { signOut } = useStore();
  const cur = [...VIEWS].reverse().find(([, h]) => h !== '/' && pathname.startsWith(h))?.[0] || 'Customer site';
  return (
    <div style={{ position: 'fixed', left: 12, bottom: 'calc(90px + env(safe-area-inset-bottom, 0px))', zIndex: 70 }} className="flex flex-col items-start gap-1 text-xs">
      {open && (
        <div className="flex flex-col overflow-hidden rounded-xl bg-ink-900/95 p-1 text-white shadow-pop">
          {VIEWS.map(([l, h]) => <button key={h} onClick={() => { nav(h); setOpen(false); }} className="whitespace-nowrap rounded-lg px-3 py-2 text-left hover:bg-white/10">{l}</button>)}
          <button onClick={async () => { await signOut(); setOpen(false); }} className="rounded-lg px-3 py-2 text-left text-white/70 hover:bg-white/10">Sign out</button>
          <button onClick={async () => { await resetLocalDemo(); window.location.reload(); }} className="rounded-lg px-3 py-2 text-left text-amber-300 hover:bg-white/10">Reset demo data</button>
        </div>
      )}
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex items-center gap-2 rounded-full bg-ink-900/90 px-3 py-2 font-medium text-white shadow-pop backdrop-blur hover:bg-ink-900"><span className="h-2 w-2 rounded-full bg-brand-500" />Switch view · {cur}</button>
    </div>
  );
}
