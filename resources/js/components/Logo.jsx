import Link from '@/components/Link';
import { useStore } from '@/lib/store';

// Wordmark driven by Admin → Branding (name + colours)
export default function Logo({ light, href = '/' }) {
  const { config } = useStore() || {};
  const name = config?.branding?.name || 'Ticketo';
  return (
    <Link href={href} className="flex shrink-0 items-center gap-2" aria-label={`${name} home`}>
      <span className="relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg bg-brand-500 text-white">
        <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden>
          <path d="M7 11.5a2.5 2.5 0 0 0 0 5V21h18v-4.5a2.5 2.5 0 0 1 0-5V7H7z" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
          <path d="M14 8v12" stroke="currentColor" strokeWidth="2" strokeDasharray="2 2.2" />
          <path d="M4 27c7-5 17-6 26-3" stroke="rgb(var(--accent-500))" strokeWidth="3" fill="none" strokeLinecap="round" />
        </svg>
      </span>
      <span className={`text-xl font-extrabold tracking-tight ${light ? 'text-white' : 'text-ink-900'}`}>{name.slice(0, -1)}<span className="text-accent-500">{name.slice(-1)}</span></span>
    </Link>
  );
}
