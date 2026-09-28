// Payment-gateway connection form, shared by merchant sign-up and Settings → Payment gateway.
import Icon from '@/components/Icon';
import { cx } from '@/lib/utils';

export default function PgForm({ value, onChange, allowDirect = true, merchant }) {
  const v = value; const set = (patch) => onChange({ ...v, ...patch });
  const ss = v.sslcommerz || {}; const bk = v.bkash || {};
  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-2">
        {[
          ['platform', 'Ticketo collects', 'Customers pay into Ticketo’s SSLCOMMERZ account. You get weekly payouts minus commission.', 'Wallet', true],
          ['direct', 'Connect my own gateway', 'Money settles straight to YOUR SSLCOMMERZ / bKash merchant account. Ticketo invoices its commission.', 'Plug', allowDirect],
        ].map(([k, t, d, i, ok]) => (
          <button type="button" key={k} disabled={!ok} onClick={() => set({ mode: k })} className={cx('rounded-xl border-2 p-4 text-left transition disabled:opacity-40', v.mode === k ? 'border-brand-500 bg-brand-50' : 'border-ink-100 hover:border-ink-300')}>
            <Icon name={i} className="text-brand-500" /><div className="mt-2 font-semibold">{t}</div><div className="text-xs text-ink-500">{d}</div>
          </button>
        ))}
      </div>
      {v.mode === 'direct' && (
        <>
          <fieldset className="rounded-xl border border-ink-100 p-4">
            <legend className="px-1 text-sm font-semibold">SSLCOMMERZ store <span className="font-normal text-ink-500">— cards, bKash, Nagad, internet banking</span></legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label className="label" htmlFor="ss-id">Store ID</label><input id="ss-id" className="input" value={ss.storeId || ''} onChange={(e) => set({ sslcommerz: { ...ss, storeId: e.target.value.trim() } })} placeholder="e.g. yourbrand0live" /></div>
              <div><label className="label" htmlFor="ss-pw">Store password</label><input id="ss-pw" type="password" className="input" value={ss.storePassword || ''} onChange={(e) => set({ sslcommerz: { ...ss, storePassword: e.target.value } })} placeholder={ss.storePassword === '••••••••' ? 'saved' : 'API password'} autoComplete="new-password" /></div>
            </div>
            <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" className="accent-brand-500" checked={ss.sandbox !== false} onChange={(e) => set({ sslcommerz: { ...ss, sandbox: e.target.checked } })} />Sandbox store (use for testing — uncheck for live)</label>
            {merchant?.pg?.sslcommerz?.verifiedAt && <p className="mt-2 flex items-center gap-1 text-xs text-emerald-700"><Icon name="BadgeCheck" size={14} />Verified connection</p>}
          </fieldset>
          <details className="rounded-xl border border-ink-100 p-4" open={!!bk.appKey}>
            <summary className="cursor-pointer text-sm font-semibold">bKash Tokenized Checkout <span className="font-normal text-ink-500">(optional, direct wallet)</span></summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {[['appKey', 'App key'], ['appSecret', 'App secret', true], ['username', 'Username'], ['password', 'Password', true]].map(([k, l, secret]) => (
                <div key={k}><label className="label" htmlFor={`bk-${k}`}>{l}</label><input id={`bk-${k}`} type={secret ? 'password' : 'text'} className="input" value={bk[k] || ''} onChange={(e) => set({ bkash: { ...bk, [k]: e.target.value } })} autoComplete="new-password" /></div>
              ))}
            </div>
            <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" className="accent-brand-500" checked={bk.sandbox !== false} onChange={(e) => set({ bkash: { ...bk, sandbox: e.target.checked } })} />Sandbox</label>
          </details>
          <p className="flex gap-2 text-xs text-ink-500"><Icon name="Lock" size={14} className="shrink-0" />Secrets are encrypted at rest (AES-256-GCM) and never shown again. Every payment is re-validated server-to-server with the gateway before tickets are issued.</p>
        </>
      )}
    </div>
  );
}
