import Icon from './Icon';
import { CAT_ICONS, cx } from '@/lib/utils';

// Generated poster art from the event palette (swap for CDN artwork later).
export default function Poster({ event, className, size = 'md', showTitle = true }) {
  const [a, b] = event.palette || ['#1E3A8A', '#2D499A'];
  const seed = String(event.id || event.title || 'x').split('').reduce((s, ch) => s + ch.charCodeAt(0), 0);
  return (
    <div className={cx('relative overflow-hidden rounded-xl text-white', className)} style={{ background: `linear-gradient(${140 + (seed % 60)}deg, ${a} 0%, ${a} 35%, ${b} 100%)` }}>
      <svg className="absolute inset-0 h-full w-full opacity-25" viewBox="0 0 200 300" preserveAspectRatio="none" aria-hidden>
        <circle cx={40 + (seed % 120)} cy={70 + (seed % 50)} r={60 + (seed % 30)} fill="white" opacity=".25" />
        <circle cx={160 - (seed % 60)} cy={220} r={90} fill="black" opacity=".25" />
        <path d={`M0 ${230 + (seed % 30)} Q100 ${180 + (seed % 40)} 200 240 L200 300 L0 300Z`} fill="black" opacity=".35" />
      </svg>
      <div className="absolute right-3 top-3 rounded-full bg-black/25 p-2 backdrop-blur-sm"><Icon name={CAT_ICONS[event.category] || 'Ticket'} size={size === 'lg' ? 22 : 16} /></div>
      {showTitle && (
        <div className="absolute inset-x-0 bottom-0 p-3">
          <div className={cx('font-extrabold uppercase leading-[1.05] tracking-tight drop-shadow', size === 'lg' ? 'text-3xl' : size === 'sm' ? 'text-sm' : 'text-lg')}>{event.title}</div>
          {size !== 'sm' && <div className="mt-1 text-[10px] font-medium uppercase tracking-[.2em] opacity-80">{event.genres?.[0]} · {event.language}</div>}
        </div>
      )}
    </div>
  );
}
