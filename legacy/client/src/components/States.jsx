import Icon from './Icon';
export function Spinner({ className = 'h-8 w-8' }) { return <span className={`inline-block animate-spin rounded-full border-4 border-ink-100 border-t-brand-500 ${className}`} />; }
export function Loading({ label = 'Loading…' }) { return <div className="flex flex-col items-center justify-center py-24 text-ink-500"><Spinner /><p className="mt-3 text-sm">{label}</p></div>; }
export function ErrorState({ error, onRetry }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-20 text-center">
      <Icon name="AlertTriangle" size={36} className="text-amber-500" />
      <p className="mt-3 font-medium">{error?.status === 404 ? 'Not found' : 'Something went wrong'}</p>
      <p className="mt-1 text-sm text-ink-500">{error?.message}</p>
      {onRetry && <button onClick={onRetry} className="btn-outline mt-4 h-10 px-5">Try again</button>}
    </div>
  );
}
export function Empty({ icon = 'Search', title, children }) {
  return <div className="card flex flex-col items-center p-10 text-center"><Icon name={icon} size={36} className="text-ink-300" /><p className="mt-3 font-medium">{title}</p>{children && <div className="mt-1 text-sm text-ink-500">{children}</div>}</div>;
}
