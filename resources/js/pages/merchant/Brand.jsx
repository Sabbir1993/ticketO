// Merchant → "Brand & page": the public organiser page content, two theme colours, logo and banner.
import { useEffect, useRef, useState } from 'react';
import Link from '@/components/Link';
import Icon from '@/components/Icon';
import MerchantTheme from '@/components/MerchantTheme';
import { Panel } from '@/components/portal/PortalShell';
import { Loading } from '@/components/States';
import { api } from '@/lib/api';
import { useApi, useStore } from '@/lib/store';
import { fileToDataUrl } from '@/lib/utils';
import { readableOnWhite } from '@/lib/theme';

const DEFAULTS = { primary: '#2D499A', accent: '#EE3240' };
const lum = (hex) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (hex) => (/^#[0-9a-f]{6}$/i.test(hex) ? 1.05 / (lum(hex) + 0.05) : 0);

function ColourField({ id, label, value, onChange }) {
  const ratio = contrast(value);
  const ok = ratio >= 3;
  const shown = readableOnWhite(value);
  return (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      <div className="flex items-center gap-2">
        <input type="color" aria-label={`${label} picker`} value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#000000'} onChange={(e) => onChange(e.target.value.toUpperCase())} className="h-10 w-12 cursor-pointer rounded border border-ink-100 bg-white p-1" />
        <input id={id} className="input h-10 w-32 font-mono uppercase" value={value} maxLength={7} onChange={(e) => onChange(e.target.value)} placeholder="#2D499A" />
        <span className={`flex items-center gap-1.5 text-xs ${ok || !ratio ? 'text-emerald-700' : 'text-amber-700'}`}>
          {ratio ? (ok ? `Readable with white text (${ratio.toFixed(1)}:1)` : <>Light colour — buttons will use <span className="inline-block h-3 w-3 rounded-sm border border-ink-300" style={{ background: shown }} /> {shown.toUpperCase()} so white text stays readable</>) : 'Use a hex colour like #2D499A'}
        </span>
      </div>
    </div>
  );
}

function ImageField({ kind, label, hint, url, onChange, busy }) {
  const input = useRef(null);
  return (
    <div>
      <div className="label">{label}</div>
      <div className="flex items-center gap-3">
        <div className={`flex items-center justify-center overflow-hidden rounded-lg border border-ink-100 bg-ink-50 ${kind === 'logo' ? 'h-20 w-20' : 'h-20 w-40'}`}>
          {url ? <img src={url} alt={`${label} preview`} className={`h-full w-full ${kind === 'logo' ? 'object-contain p-1' : 'object-cover'}`} /> : <Icon name="Image" size={22} className="text-ink-300" />}
        </div>
        <div className="space-y-2">
          <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label={`Upload ${label}`} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onChange(f); }} />
          <button type="button" disabled={busy} onClick={() => input.current?.click()} className="btn-outline h-9 px-3 text-sm"><Icon name="Upload" size={14} />{url ? 'Replace' : 'Upload'}</button>
          {url && <button type="button" disabled={busy} onClick={() => onChange(null)} className="ml-2 text-sm text-brand-600 hover:underline">Remove</button>}
          <p className="text-xs text-ink-500">{hint}</p>
        </div>
      </div>
    </div>
  );
}

export default function Brand() {
  const { toast, merchant } = useStore();
  const { data, loading, reload } = useApi(() => api.merchantBrand(), []);
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (data) setF({ tagline: data.tagline, about: data.about, primary: data.primary || DEFAULTS.primary, accent: data.accent || DEFAULTS.accent }); }, [data]);
  if (loading || !f) return <Loading />;

  const save = async () => {
    setBusy(true);
    try { await api.saveMerchantBrand(f); toast('Brand saved'); reload(); } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  const image = (kind) => async (file) => {
    setBusy(true);
    try {
      if (!file) await api.clearMerchantBrandImage({ kind });
      else {
        if (file.size > 2 * 1024 * 1024) throw new Error('Max 2 MB per image');
        await api.setMerchantBrandImage({ kind, name: file.name, type: file.type, dataUrl: await fileToDataUrl(file) });
      }
      toast(file ? `${kind === 'logo' ? 'Logo' : 'Banner'} updated` : `${kind === 'logo' ? 'Logo' : 'Banner'} removed`); reload();
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  const theme = { primary: f.primary, accent: f.accent };
  const name = merchant?.name || 'Your organisation';

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="space-y-6">
        <Panel title="Page content">
          <div className="space-y-4 p-5">
            <div><label className="label" htmlFor="br-tag">Tagline</label><input id="br-tag" className="input" maxLength={160} value={f.tagline} onChange={(e) => setF({ ...f, tagline: e.target.value })} placeholder="Dhaka’s home of live music" /></div>
            <div><label className="label" htmlFor="br-about">About your organisation</label><textarea id="br-about" className="input min-h-28 py-2" maxLength={1200} value={f.about} onChange={(e) => setF({ ...f, about: e.target.value })} placeholder="Who you are and what you host. Plain text only." /><div className="mt-1 text-right text-xs text-ink-500">{f.about.length}/1200</div></div>
          </div>
        </Panel>
        <Panel title="Colours">
          <div className="space-y-4 p-5">
            <ColourField id="br-p" label="Primary colour (buttons, links)" value={f.primary} onChange={(v) => setF({ ...f, primary: v })} />
            <ColourField id="br-a" label="Accent colour (highlights)" value={f.accent} onChange={(v) => setF({ ...f, accent: v })} />
            <p className="text-xs text-ink-500">Applied to your organiser page and your event pages. The site header and footer keep the platform look.</p>
          </div>
        </Panel>
        <Panel title="Logo & banner">
          <div className="grid gap-6 p-5 sm:grid-cols-2">
            <ImageField kind="logo" label="Logo" hint="Square, PNG / JPG / WEBP, up to 2 MB." url={data.logoUrl} onChange={image('logo')} busy={busy} />
            <ImageField kind="banner" label="Banner" hint="Wide (about 1600×500), up to 2 MB." url={data.bannerUrl} onChange={image('banner')} busy={busy} />
          </div>
          <p className="border-t border-ink-100 px-5 py-3 text-xs text-ink-500">Logo and banner are shown publicly on your page. Do not upload documents, IDs or anything private here.</p>
        </Panel>
        <button onClick={save} disabled={busy} className="btn-primary h-11 px-6"><Icon name="Save" size={16} />{busy ? 'Saving…' : 'Save brand'}</button>
      </div>

      <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <Panel title="Preview">
          <MerchantTheme theme={theme} className="p-4">
            <div className="overflow-hidden rounded-xl border border-ink-100">
              <div className="relative h-24" style={data.bannerUrl ? undefined : { background: 'linear-gradient(110deg, rgb(var(--brand-800)), rgb(var(--brand-500)) 65%, rgb(var(--accent-500)))' }}>
                {data.bannerUrl && <img src={data.bannerUrl} alt="" className="h-full w-full object-cover" />}
              </div>
              <div className="-mt-8 flex items-end gap-3 px-4">
                {data.logoUrl ? <img src={data.logoUrl} alt="" className="h-16 w-16 rounded-xl border-2 border-white bg-white object-contain p-1" /> : <span className="flex h-16 w-16 items-center justify-center rounded-xl border-2 border-white bg-white text-2xl font-bold text-brand-600">{name[0]}</span>}
              </div>
              <div className="px-4 pb-4 pt-2">
                <div className="text-lg font-bold">{name}</div>
                {f.tagline && <div className="text-sm text-ink-500">{f.tagline}</div>}
                <div className="mt-3 flex items-center gap-2"><span className="btn-primary h-9 px-4 text-sm">Book now</span><span className="badge bg-accent-500 text-white">Live</span><span className="text-sm font-medium text-brand-600">View events</span></div>
              </div>
            </div>
          </MerchantTheme>
        </Panel>
        {data.live
          ? <Link href={data.pageUrl} className="btn-outline h-10 w-full text-sm"><Icon name="ExternalLink" size={14} />View your public page</Link>
          : <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Your public page goes live once your account is approved.</p>}
      </div>
    </div>
  );
}
