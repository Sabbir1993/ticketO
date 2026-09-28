// Gate access control: QR scan → server validates → duplicate / void detection → live attendance.
import { useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import Link from '@/components/Link';
import Logo from '@/components/Logo';
import Icon from '@/components/Icon';
import { Loading } from '@/components/States';
import { api } from '@/lib/api';
import { useApi, useStore } from '@/lib/store';
import { cx, fmtTime } from '@/lib/utils';

const GATES = ['Gate 1', 'Gate 2', 'Gate 3', 'VIP Gate'];
const R = { valid: ['bg-emerald-600', 'CheckCircle2', 'ENTRY ALLOWED'], duplicate: ['bg-amber-500', 'AlertTriangle', 'ALREADY SCANNED'], invalid: ['bg-brand-600', 'XCircle', 'INVALID TICKET'], void: ['bg-brand-600', 'Ban', 'TICKET VOID'], wrong_event: ['bg-brand-600', 'Ban', 'WRONG EVENT'] };

export default function Gate() {
  const { user, checked } = useStore();
  const events = useApi(() => (user && user.role !== 'customer' ? api.merchantEvents() : null), [user?.id]);
  const [eventId, setEventId] = useState('');
  const [gate, setGate] = useState('Gate 1');
  const stats = useApi(() => (user && user.role !== 'customer' ? api.gateStats({ eventId: eventId || undefined }) : null), [eventId, user?.id]);
  const [code, setCode] = useState('');
  const [result, setResult] = useState(null);
  const [cam, setCam] = useState(false);
  const [camErr, setCamErr] = useState('');
  const video = useRef(null); const input = useRef(null); const last = useRef({ c: '', t: 0 });
  const scan = async (c) => {
    if (!c?.trim()) return;
    try { const r = await api.scanTicket({ code: c, gate, eventId: eventId || undefined }); setResult(r); try { navigator.vibrate?.(r.status === 'valid' ? 80 : [80, 60, 80]); } catch {} stats.reload(); }
    catch (e) { setResult({ status: 'invalid', code: c, message: e.message }); }
    setCode(''); input.current?.focus();
  };
  useEffect(() => {
    if (!cam) return undefined;
    let stream; let timer; let stop = false;
    (async () => {
      try {
        if (!('BarcodeDetector' in window)) throw new Error('This browser has no built-in QR reader — use Chrome on Android or a USB/Bluetooth scanner.');
        const det = new window.BarcodeDetector({ formats: ['qr_code'] });
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        video.current.srcObject = stream; await video.current.play();
        const tick = async () => { if (stop) return; try { const v = (await det.detect(video.current))[0]?.rawValue; if (v && (v !== last.current.c || Date.now() - last.current.t > 3000)) { last.current = { c: v, t: Date.now() }; scan(v); } } catch {} timer = setTimeout(tick, 300); };
        tick();
      } catch (e) { setCamErr(e.message || 'Camera unavailable'); setCam(false); }
    })();
    return () => { stop = true; clearTimeout(timer); stream?.getTracks().forEach((t) => t.stop()); };
  }, [cam, gate]); // eslint-disable-line
  if (!checked) return <Loading />;
  if (!user || user.role === 'customer') return <Navigate to="/partner/login?next=/gate" replace />;
  const s = stats.data; const r = result && R[result.status];
  return (
    <div className="min-h-screen bg-ink-900 text-white">
      <header className="flex h-14 flex-wrap items-center gap-3 border-b border-white/10 px-4">
        <Logo light href="/gate" /><span className="rounded bg-white/10 px-2 py-0.5 text-xs font-semibold uppercase tracking-wider">Gate scanner</span>
        <div className="ml-auto flex items-center gap-2">
          <select value={eventId} onChange={(e) => setEventId(e.target.value)} className="h-9 max-w-[200px] rounded-lg bg-white/10 px-2 text-sm" aria-label="Event"><option value="" className="text-ink-900">All my events</option>{(events.data || []).filter((e) => e.status === 'published').map((e) => <option key={e.id} value={e.id} className="text-ink-900">{e.title}</option>)}</select>
          <select value={gate} onChange={(e) => setGate(e.target.value)} className="h-9 rounded-lg bg-white/10 px-2 text-sm" aria-label="Gate">{GATES.map((g) => <option key={g} className="text-ink-900">{g}</option>)}</select>
        </div>
      </header>
      <div className="mx-auto grid max-w-6xl gap-6 p-4 md:p-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <div className={cx('flex min-h-[220px] flex-col items-center justify-center rounded-3xl p-6 text-center transition-colors', r ? r[0] : 'bg-white/5')}>
            {r ? (<><Icon name={r[1]} size={64} strokeWidth={1.6} /><div className="mt-3 text-3xl font-extrabold tracking-wide">{r[2]}</div><div className="mt-2 font-mono text-lg">{result.code}</div>
              {result.booking && <div className="mt-2 text-sm text-white/90">{result.booking.event?.title} · {result.ticket?.label} · {result.booking.contact?.name}</div>}
              {result.status === 'duplicate' && <div className="mt-1 text-sm">First entry {fmtTime(result.ticket.scannedAt)} via {result.ticket.gate}</div>}
              {result.message && <div className="mt-1 text-sm">{result.message}</div>}</>)
              : <><Icon name="ScanLine" size={56} className="text-white/40" /><div className="mt-3 text-lg text-white/70">Ready to scan at {gate}</div></>}
          </div>
          <div className="rounded-2xl bg-white/5 p-4">
            {cam && <video ref={video} playsInline muted className="mb-3 aspect-video w-full rounded-xl bg-black object-cover" />}
            <form onSubmit={(e) => { e.preventDefault(); scan(code); }} className="flex gap-2">
              <input ref={input} autoFocus value={code} onChange={(e) => setCode(e.target.value)} placeholder="Scan or type ticket code" className="h-12 min-w-0 flex-1 rounded-xl bg-white px-4 font-mono text-ink-900 outline-none" aria-label="Ticket code" />
              <button className="btn-primary h-12 px-6">Validate</button>
              <button type="button" onClick={() => { setCamErr(''); setCam(!cam); }} className="btn h-12 w-12 bg-white/10 p-0 hover:bg-white/20" aria-label="Camera"><Icon name="Camera" /></button>
            </form>
            {camErr && <p className="mt-2 text-sm text-amber-300">{camErr}</p>}
          </div>
          {!!s?.recentTickets?.length && (
            <div className="rounded-2xl bg-white/5 p-4"><div className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/50">Recent tickets (tap to test)</div>
              <div className="flex flex-wrap gap-2">{s.recentTickets.map((t) => <button key={t.code} onClick={() => scan(t.code)} className={cx('rounded-lg px-3 py-1.5 text-left font-mono text-xs', t.scanned ? 'bg-white/5 text-white/40' : 'bg-white/10 hover:bg-white/20')}>{t.code}<div className="font-sans text-[10px] text-white/50">{t.event} · {t.label}</div></button>)}</div></div>
          )}
          {s && !s.recentTickets.length && <div className="rounded-2xl bg-white/5 p-4 text-sm text-white/60">No tickets sold yet. <Link href="/" className="text-brand-400 underline">Book online</Link> or use the <Link href="/pos" className="text-brand-400 underline">POS</Link>, then scan here.</div>}
        </div>
        <aside className="space-y-4">
          <div className="grid grid-cols-2 gap-3"><div className="rounded-2xl bg-white/5 p-4"><div className="text-xs text-white/50">Inside</div><div className="text-3xl font-bold tabular-nums">{s?.inside ?? 0}</div></div><div className="rounded-2xl bg-white/5 p-4"><div className="text-xs text-white/50">Yet to arrive</div><div className="text-3xl font-bold tabular-nums">{s ? s.issued - s.inside : 0}</div></div></div>
          <div className="rounded-2xl bg-white/5 p-4"><div className="flex justify-between text-xs text-white/50"><span>Attendance</span><span>{s?.issued ? Math.round((s.inside / s.issued) * 100) : 0}% of issued</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-emerald-400" style={{ width: `${s?.issued ? (s.inside / s.issued) * 100 : 0}%` }} /></div>
            <div className="mt-4 space-y-2">{GATES.map((g) => <div key={g} className="flex justify-between text-sm"><span className={cx(g === gate && 'font-semibold')}>{g}</span><span className="tabular-nums text-white/70">{s?.byGate[g] || 0}</span></div>)}</div></div>
          <div className="rounded-2xl bg-white/5"><div className="px-4 py-3 text-sm font-semibold">Scan log</div>
            <ul className="max-h-80 divide-y divide-white/5 overflow-y-auto text-sm">{(s?.scans || []).map((x, i) => <li key={i} className="flex items-center gap-2 px-4 py-2"><span className={cx('h-2 w-2 rounded-full', x.status === 'valid' ? 'bg-emerald-400' : x.status === 'duplicate' ? 'bg-amber-400' : 'bg-brand-400')} /><span className="font-mono text-xs">{x.code}</span><span className="ml-auto text-xs text-white/50">{x.gate} · {fmtTime(x.at)}</span></li>)}{!s?.scans?.length && <li className="px-4 py-6 text-center text-white/40">No scans yet</li>}</ul></div>
        </aside>
      </div>
    </div>
  );
}
