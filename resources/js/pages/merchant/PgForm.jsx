// Merchant's default payment store, shared by merchant sign-up and Settings → Payment gateway.
// Every event uses it unless the event sets its own store (event editor → Payment).
import Icon from '@/components/Icon';
import { useStore } from '@/lib/store';

export function StoreFields({ value = {}, onChange, idPrefix = 'ss' }) {
  const { config } = useStore();
  const live = config?.payments?.sslcommerzMode === 'live';
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="label" htmlFor={`${idPrefix}-id`}>Store ID</label><input id={`${idPrefix}-id`} className="input" value={value.storeId || ''} onChange={(e) => onChange({ ...value, storeId: e.target.value.trim() })} placeholder="e.g. yourbrand0live" autoComplete="off" /></div>
        <div><label className="label" htmlFor={`${idPrefix}-pw`}>Store password</label><input id={`${idPrefix}-pw`} type="password" className="input" value={value.storePassword || ''} onChange={(e) => onChange({ ...value, storePassword: e.target.value })} placeholder={value.storePassword === '••••••••' ? 'saved' : 'API password (not your panel login)'} autoComplete="new-password" /></div>
      </div>
      <p className="mt-3 flex items-center gap-2 text-sm text-ink-700"><Icon name="Info" size={15} className="shrink-0 text-brand-500" />Ticketo is connected to SSLCOMMERZ <b>{live ? 'LIVE' : 'SANDBOX'}</b> — enter a {live ? 'live' : 'sandbox'} store’s credentials.</p>
      {value.verifiedAt && <p className="mt-2 flex items-center gap-1 text-xs text-emerald-700"><Icon name="BadgeCheck" size={14} />Verified connection</p>}
    </>
  );
}

export default function PgForm({ value, onChange }) {
  const v = value; const set = (patch) => onChange({ ...v, ...patch });
  const bk = v.bkash || {};
  return (
    <div className="space-y-5">
      <p className="text-sm text-ink-700">Customers pay straight into <b>your</b> gateway account; Ticketo invoices its commission. This is your <b>default store</b> — any event can use a different store from its Payment step.</p>
      <fieldset className="rounded-xl border border-ink-100 p-4">
        <legend className="px-1 text-sm font-semibold">SSLCOMMERZ store <span className="font-normal text-ink-500">— cards, bKash, Nagad, internet banking</span></legend>
        <StoreFields value={v.sslcommerz || {}} onChange={(sslcommerz) => set({ sslcommerz })} />
      </fieldset>
      <details className="rounded-xl border border-ink-100 p-4" open={!!bk.appKey}>
        <summary className="cursor-pointer text-sm font-semibold">bKash Tokenized Checkout <span className="font-normal text-ink-500">(optional, direct wallet)</span></summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {[['appKey', 'App key'], ['appSecret', 'App secret', true], ['username', 'Username'], ['password', 'Password', true]].map(([k, l, secret]) => (
            <div key={k}><label className="label" htmlFor={`bk-${k}`}>{l}</label><input id={`bk-${k}`} type={secret ? 'password' : 'text'} className="input" value={bk[k] || ''} onChange={(e) => set({ bkash: { ...bk, [k]: e.target.value } })} autoComplete="new-password" /></div>
          ))}
        </div>
      </details>
      <p className="flex gap-2 text-xs text-ink-500"><Icon name="Lock" size={14} className="shrink-0" />Secrets are encrypted at rest (AES-256-GCM) and never shown again. Every payment is re-validated server-to-server with the gateway before tickets are issued.</p>
    </div>
  );
}
