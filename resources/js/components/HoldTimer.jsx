import { useEffect, useState } from 'react';
import Icon from './Icon';
import { cx, timeLeft } from '@/lib/utils';

export default function HoldTimer({ expiresAt, onExpire, className }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const left = expiresAt - now;
  useEffect(() => { if (expiresAt && left <= 0) onExpire?.(); }, [left <= 0]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!expiresAt) return null;
  return <div className={cx('flex items-center gap-2 rounded-lg px-3 py-2 text-sm', left < 60000 ? 'bg-brand-50 text-brand-700' : 'bg-amber-50 text-amber-800', className)}><Icon name="Timer" size={16} />Seats held for <b className="tabular-nums">{timeLeft(left)}</b></div>;
}
