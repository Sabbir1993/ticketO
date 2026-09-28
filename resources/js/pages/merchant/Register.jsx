import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Link from '@/components/Link';
import Icon from '@/components/Icon';
import PgForm from './PgForm';
import { api, uploadFile } from '@/lib/api';
import { useStore } from '@/lib/store';
import { cx } from '@/lib/utils';

const STEPS = ['Account', 'Business', 'KYC documents', 'Settlement', 'Payment gateway', 'Review'];
const DOCS = ['Trade licence', 'Owner NID / passport', 'TIN certificate', 'Bank cheque leaf / statement'];
const TYPES = ['Event organiser', 'Concert promoter', 'Sports club / association', 'Cinema / theatre', 'Venue owner', 'Corporate / conference', 'Educational institute', 'NGO / non-profit'];

function Field({ id, label, children, hint }) { return <div><label className="label" htmlFor={id}>{label}</label>{children}{hint && <p className="mt-1 text-xs text-ink-500">{hint}</p>}</div>; }

export default function Register() {
  const { config, signIn, toast } = useStore();
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [owner, setOwner] = useState({ name: '', email: '', phone: '', password: '' });
  const [biz, setBiz] = useState({ name: '', type: TYPES[0], legalName: '', tradeLicense: '', tin: '', bin: '', address: '', website: '' });
  const [docs, setDocs] = useState({});
  const [settle, setSettle] = useState({ type: 'bank', bankName: '', accountName: '', accountNo: '', routing: '', wallet: '' });
  const [pg, setPg] = useState({ sslcommerz: {}, bkash: {} });
  const [agree, setAgree] = useState(false);

  const valid = [
    owner.name.trim().length > 1 && /\S+@\S+\.\S+/.test(owner.email) && /^01[3-9]\d{8}$/.test(owner.phone) && owner.password.length >= 8,
    biz.name.trim() && biz.tradeLicense.trim(),
    !!docs['Trade licence'] && !!docs['Owner NID / passport'],
    settle.type === 'bank' ? settle.bankName && settle.accountName && settle.accountNo : /^01[3-9]\d{8}$/.test(settle.wallet),
    !pg.sslcommerz?.storeId === !pg.sslcommerz?.storePassword, // optional now (needed before the first event goes live), but both or neither
    agree,
  ];
  const next = () => (valid[step] ? setStep(step + 1) : toast('Please complete the required fields', 'err'));
  const onFile = async (type, file) => {
    if (!file) return;
    try { const r = await uploadFile(file); setDocs((d) => ({ ...d, [type]: { ...r, type } })); }
    catch (e) { toast(e.message, 'err'); }
  };
  const submit = async () => {
    if (!agree) return toast('Please accept the merchant agreement', 'err');
    setBusy(true);
    try {
      const r = await api.registerMerchant({ owner, business: biz, settlement: settle, pg, docs: Object.values(docs) });
      signIn(r);
      toast(r.merchant.status === 'active' ? 'Welcome! Your merchant account is active.' : 'Application submitted — KYC review usually takes one working day.');
      nav('/merchant');
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };

  return (
    <div className="bg-ink-50/70 py-8 md:py-12">
      <div className="container-x grid max-w-5xl gap-8 lg:grid-cols-[1fr_300px]">
        <div className="card min-w-0">
          <div className="border-b border-ink-100 p-5"><h1 className="text-2xl font-bold">Become a Ticketo merchant</h1><p className="text-sm text-ink-500">Sell tickets for your matches, concerts, shows and conferences.</p></div>
          <ol className="no-scrollbar flex gap-1 overflow-x-auto border-b border-ink-100 p-3">{STEPS.map((s, i) => <li key={s}><button type="button" onClick={() => i < step && setStep(i)} className={cx('flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm', i === step ? 'bg-brand-50 font-semibold text-brand-600' : 'text-ink-500')}><span className={cx('flex h-6 w-6 items-center justify-center rounded-full text-xs', i < step ? 'bg-emerald-500 text-white' : i === step ? 'bg-brand-500 text-white' : 'bg-ink-100')}>{i < step ? '✓' : i + 1}</span>{s}</button></li>)}</ol>
          <div className="space-y-4 p-6">
            {step === 0 && (<>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="o-name" label="Your full name *"><input id="o-name" className="input" value={owner.name} onChange={(e) => setOwner({ ...owner, name: e.target.value })} /></Field>
                <Field id="o-phone" label="Mobile number *"><input id="o-phone" className="input" value={owner.phone} onChange={(e) => setOwner({ ...owner, phone: e.target.value.replace(/\D/g, '').slice(0, 11) })} placeholder="01XXXXXXXXX" inputMode="numeric" /></Field>
                <Field id="o-email" label="Work email *" hint="You'll use this to sign in"><input id="o-email" type="email" className="input" value={owner.email} onChange={(e) => setOwner({ ...owner, email: e.target.value })} autoComplete="username" /></Field>
                <Field id="o-pw" label="Password *" hint="At least 8 characters"><input id="o-pw" type="password" className="input" value={owner.password} onChange={(e) => setOwner({ ...owner, password: e.target.value })} autoComplete="new-password" /></Field>
              </div>
            </>)}
            {step === 1 && (<>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="b-name" label="Brand / organiser name *" hint="Shown to customers on event pages"><input id="b-name" className="input" value={biz.name} onChange={(e) => setBiz({ ...biz, name: e.target.value })} /></Field>
                <Field id="b-type" label="Organisation type"><select id="b-type" className="input" value={biz.type} onChange={(e) => setBiz({ ...biz, type: e.target.value })}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select></Field>
                <Field id="b-legal" label="Registered legal name"><input id="b-legal" className="input" value={biz.legalName} onChange={(e) => setBiz({ ...biz, legalName: e.target.value })} /></Field>
                <Field id="b-tl" label="Trade licence no. *"><input id="b-tl" className="input" value={biz.tradeLicense} onChange={(e) => setBiz({ ...biz, tradeLicense: e.target.value })} /></Field>
                <Field id="b-tin" label="e-TIN"><input id="b-tin" className="input" value={biz.tin} onChange={(e) => setBiz({ ...biz, tin: e.target.value })} /></Field>
                <Field id="b-bin" label="BIN (VAT)"><input id="b-bin" className="input" value={biz.bin} onChange={(e) => setBiz({ ...biz, bin: e.target.value })} /></Field>
              </div>
              <Field id="b-addr" label="Business address"><textarea id="b-addr" rows={2} className="input h-auto py-2" value={biz.address} onChange={(e) => setBiz({ ...biz, address: e.target.value })} /></Field>
            </>)}
            {step === 2 && (<>
              <p className="text-sm text-ink-500">PDF, JPG or PNG up to 5 MB each. Trade licence and owner NID are required.</p>
              {DOCS.map((d) => (
                <div key={d} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-100 p-4">
                  <div><div className="font-medium">{d}{['Trade licence', 'Owner NID / passport'].includes(d) && ' *'}</div><div className="text-xs text-ink-500">{docs[d] ? `${docs[d].name} · ${Math.round(docs[d].size / 1024)} KB` : 'Not uploaded'}</div></div>
                  <label className={cx('btn h-9 cursor-pointer px-4 text-sm', docs[d] ? 'bg-emerald-50 text-emerald-700' : 'btn-outline')}><Icon name={docs[d] ? 'FileCheck2' : 'Upload'} size={15} />{docs[d] ? 'Replace' : 'Upload'}<input type="file" accept=".pdf,image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => onFile(d, e.target.files?.[0])} /></label>
                </div>
              ))}
            </>)}
            {step === 3 && (<>
              <div className="flex gap-2">{[['bank', 'Bank account'], ['mfs', 'bKash / Nagad wallet']].map(([k, l]) => <button type="button" key={k} onClick={() => setSettle({ ...settle, type: k })} className={cx('chip', settle.type === k && 'chip-on')}>{l}</button>)}</div>
              {settle.type === 'bank' ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field id="s-bank" label="Bank name *"><input id="s-bank" className="input" value={settle.bankName} onChange={(e) => setSettle({ ...settle, bankName: e.target.value })} /></Field>
                  <Field id="s-an" label="Account name *"><input id="s-an" className="input" value={settle.accountName} onChange={(e) => setSettle({ ...settle, accountName: e.target.value })} /></Field>
                  <Field id="s-no" label="Account number *"><input id="s-no" className="input" value={settle.accountNo} onChange={(e) => setSettle({ ...settle, accountNo: e.target.value })} /></Field>
                  <Field id="s-rt" label="Routing number"><input id="s-rt" className="input" value={settle.routing} onChange={(e) => setSettle({ ...settle, routing: e.target.value })} /></Field>
                </div>
              ) : <Field id="s-w" label="Merchant wallet number *"><input id="s-w" className="input" value={settle.wallet} onChange={(e) => setSettle({ ...settle, wallet: e.target.value.replace(/\D/g, '').slice(0, 11) })} placeholder="01XXXXXXXXX" /></Field>}
              <p className="text-xs text-ink-500">Used for payouts when Ticketo collects on your behalf, and for refunds adjustments.</p>
            </>)}
            {step === 4 && <PgForm value={pg} onChange={setPg} />}
            {step === 5 && (
              <div className="space-y-4 text-sm">
                <dl className="grid grid-cols-[150px_1fr] gap-y-2">
                  <dt className="text-ink-500">Owner</dt><dd>{owner.name} · {owner.email} · {owner.phone}</dd>
                  <dt className="text-ink-500">Business</dt><dd>{biz.name} ({biz.type}) · TL {biz.tradeLicense}</dd>
                  <dt className="text-ink-500">Documents</dt><dd>{Object.keys(docs).join(', ') || '—'}</dd>
                  <dt className="text-ink-500">Settlement</dt><dd>{settle.type === 'bank' ? `${settle.bankName} · ${settle.accountNo}` : `Wallet ${settle.wallet}`}</dd>
                  <dt className="text-ink-500">Collection</dt><dd>{pg.sslcommerz?.storeId ? `Default SSLCOMMERZ store "${pg.sslcommerz.storeId}"` : 'Set your store later (Settings → Payment gateway, or per event)'}</dd>
                </dl>
                <label className="flex items-start gap-2 rounded-xl bg-ink-50 p-4"><input type="checkbox" className="mt-0.5 accent-brand-500" checked={agree} onChange={(e) => setAgree(e.target.checked)} /><span>I agree to the Ticketo merchant agreement: commission of {config.platform.defaultCommissionPct ?? 8}% on ticket value (negotiable), customer convenience fee of {config.platform.convenienceFeePct}% + VAT, and responsibility for event delivery and refunds per my published policy.</span></label>
              </div>
            )}
          </div>
          <div className="flex justify-between border-t border-ink-100 p-4">
            <button type="button" onClick={() => setStep(step - 1)} disabled={!step} className="btn-outline h-10 px-5">Back</button>
            {step < STEPS.length - 1 ? <button type="button" onClick={next} className="btn-primary h-10 px-6">Continue</button> : <button type="button" onClick={submit} disabled={busy} className="btn-primary h-10 px-6"><Icon name="Send" size={15} />{busy ? 'Submitting…' : 'Submit application'}</button>}
          </div>
        </div>
        <aside className="space-y-4">
          <div className="card p-5"><h3 className="font-semibold">How it works</h3>
            <ol className="mt-3 space-y-3 text-sm text-ink-700">{[['UserCheck', 'Sign up & submit KYC'], ['Plug', 'Connect your gateway or let Ticketo collect'], ['Map', 'Pick a venue layout: stadium, hall or open ground'], ['Rocket', 'Set prices & dates, then publish'], ['ScanLine', 'Sell online + box office, scan at the gate']].map(([i, t]) => <li key={t} className="flex gap-3"><Icon name={i} size={18} className="shrink-0 text-brand-500" />{t}</li>)}</ol>
          </div>
          <p className="text-center text-sm text-ink-500">Already a merchant? <Link href="/partner/login" className="font-medium text-brand-500">Sign in</Link></p>
        </aside>
      </div>
    </div>
  );
}
