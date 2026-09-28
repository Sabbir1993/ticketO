import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Link from '@/components/Link';
import Logo from '@/components/Logo';
import { api } from '@/lib/api';
import { useStore } from '@/lib/store';

const DEMO = [['Merchant (direct PG)', 'pulse@ticketo.demo', 'merchant123'], ['Merchant (sports)', 'sports@ticketo.demo', 'merchant123'], ['Platform admin', 'admin@ticketo.com.bd', 'admin123']];

export default function PartnerLogin() {
  const { signIn, toast } = useStore();
  const nav = useNavigate();
  const next = useSearchParams()[0].get('next');
  const [f, setF] = useState({ email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e?.preventDefault(); setBusy(true);
    try { const r = await api.login(f); signIn(r); nav(next || (r.user.role === 'admin' ? '/admin' : '/merchant'), { replace: true }); }
    catch (err) { toast(err.message, 'err'); } finally { setBusy(false); }
  };
  return (
    <div className="flex min-h-[75vh] items-center justify-center bg-ink-50/70 px-4 py-10">
      <div className="w-full max-w-md">
        <form onSubmit={submit} className="card p-7">
          <Logo /><h1 className="mt-5 text-xl font-bold">Partner & staff sign in</h1><p className="text-sm text-ink-500">Merchants, box-office and gate staff, platform admins.</p>
          <label className="label mt-5" htmlFor="pe">Email</label><input id="pe" type="email" required className="input" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="username" />
          <label className="label mt-3" htmlFor="pp">Password</label><input id="pp" type="password" required className="input" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="current-password" />
          <button disabled={busy} className="btn-primary mt-5 h-12 w-full">{busy ? 'Signing in…' : 'Sign in'}</button>
          <p className="mt-4 text-center text-sm text-ink-500">New organiser? <Link href="/merchant/register" className="font-medium text-brand-500">Create a merchant account</Link></p>
        </form>
        <div className="mt-4 rounded-2xl border border-dashed border-ink-300 p-4 text-sm">
          <div className="mb-2 font-medium text-ink-700">Demo accounts</div>
          {DEMO.map(([l, e, p]) => <button key={e} onClick={() => setF({ email: e, password: p })} className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left hover:bg-white"><span>{l}</span><span className="font-mono text-xs text-ink-500">{e}</span></button>)}
        </div>
      </div>
    </div>
  );
}
