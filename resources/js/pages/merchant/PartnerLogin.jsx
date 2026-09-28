import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Link from '@/components/Link';
import Logo from '@/components/Logo';
import QR from '@/components/QR';
import { api } from '@/lib/api';
import { useStore } from '@/lib/store';

// Step 1: email + password. Step 2 (CMS always, others when enabled): authenticator code.
// First CMS sign-in shows a one-time QR to enrol the authenticator app.
export default function PartnerLogin() {
  const { signIn, toast } = useStore();
  const nav = useNavigate();
  const next = useSearchParams()[0].get('next');
  const [f, setF] = useState({ email: '', password: '' });
  const [mfa, setMfa] = useState(null); // null | { mode: 'verify' } | { mode: 'enroll', otpauthUrl, secret }
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const done = (r) => { signIn(r); nav(next || (r.user.role === 'admin' ? '/admin' : '/merchant'), { replace: true }); };
  const submit = async (e) => {
    e?.preventDefault(); setBusy(true);
    try {
      const r = await api.login(f);
      setF((x) => ({ ...x, password: '' })); // never keep the password in memory longer than needed
      if (r.mfaRequired) { setMfa(r.mfa === 'enroll' ? { mode: 'enroll', otpauthUrl: r.otpauthUrl, secret: r.secret } : { mode: 'verify' }); setCode(''); }
      else done(r);
    } catch (err) { toast(err.message, 'err'); } finally { setBusy(false); }
  };
  const verify = async (e) => {
    e?.preventDefault(); setBusy(true);
    try { done(await api.verifyMfa({ code })); }
    catch (err) { toast(err.message, 'err'); if (err.code === 'auth' || err.code === 'mfa_setup') setMfa(null); setCode(''); }
    finally { setBusy(false); }
  };

  return (
    <div className="flex min-h-[75vh] items-center justify-center bg-ink-50/70 px-4 py-10">
      <div className="w-full max-w-md">
        {!mfa ? (
          <form onSubmit={submit} className="card p-7">
            <Logo /><h1 className="mt-5 text-xl font-bold">Partner & staff sign in</h1><p className="text-sm text-ink-500">Merchants, box-office and gate staff, platform admins.</p>
            <label className="label mt-5" htmlFor="pe">Email</label><input id="pe" type="email" required className="input" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="username" />
            <label className="label mt-3" htmlFor="pp">Password</label><input id="pp" type="password" required className="input" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="current-password" />
            <button disabled={busy} className="btn-primary mt-5 h-12 w-full">{busy ? 'Signing in…' : 'Sign in'}</button>
            <p className="mt-4 text-center text-sm text-ink-500">New organiser? <Link href="/merchant/register" className="font-medium text-brand-500">Create a merchant account</Link></p>
          </form>
        ) : (
          <form onSubmit={verify} className="card p-7">
            <Logo />
            <h1 className="mt-5 text-xl font-bold">{mfa.mode === 'enroll' ? 'Set up two-step verification' : 'Two-step verification'}</h1>
            {mfa.mode === 'enroll' ? (
              <>
                <p className="mt-1 text-sm text-ink-500">Staff accounts need an authenticator app (Google Authenticator, Microsoft Authenticator, Authy). Scan this code once, then enter the 6-digit code it shows.</p>
                <div className="mt-4 flex justify-center rounded-xl border border-ink-200 bg-white p-3"><QR value={mfa.otpauthUrl} size={176} alt="Authenticator setup QR code" /></div>
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer text-ink-600">Can&apos;t scan? Enter the key manually</summary>
                  <code className="mt-2 block select-all break-all rounded-lg bg-ink-50 p-3 font-mono text-xs tracking-wider">{mfa.secret.replace(/(.{4})/g, '$1 ').trim()}</code>
                  <p className="mt-1 text-xs text-ink-500">Shown only now. Don&apos;t share it or save it anywhere else.</p>
                </details>
              </>
            ) : <p className="mt-1 text-sm text-ink-500">Enter the 6-digit code from your authenticator app.</p>}
            <label className="label mt-5" htmlFor="mc">Authenticator code</label>
            <input id="mc" className="input text-center font-mono text-lg tracking-[0.4em]" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="\d{6}" required autoFocus
              value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} />
            <button disabled={busy || code.length !== 6} className="btn-primary mt-5 h-12 w-full">{busy ? 'Verifying…' : 'Verify and continue'}</button>
            <button type="button" onClick={() => { setMfa(null); setCode(''); }} className="mt-3 w-full text-center text-sm text-ink-500 hover:text-ink-700">Use a different account</button>
          </form>
        )}
      </div>
    </div>
  );
}
