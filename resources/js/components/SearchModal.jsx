import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Modal from './Modal';
import Icon from './Icon';
import Poster from './Poster';
import { api } from '@/lib/api';
import { useStore } from '@/lib/store';

export default function SearchModal({ open, onClose }) {
  const { config } = useStore();
  const [all, setAll] = useState([]);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState(null);
  const nav = useNavigate();
  useEffect(() => { if (open) api.listEvents({}).then(setAll).catch(() => {}); }, [open]);
  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    return all.filter((e) => (!cat || e.category === cat) && (!t || [e.title, e.genres.join(' '), e.subCategory, e.venue?.name].join(' ').toLowerCase().includes(t))).slice(0, 8);
  }, [q, cat, all]);
  const go = (href) => { onClose(); setQ(''); nav(href); };
  return (
    <Modal open={open} onClose={onClose} wide bare>
      <div className="flex items-center gap-3 border-b border-ink-100 px-5 py-4">
        <Icon name="Search" size={20} className="text-ink-500" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go(`/explore?q=${encodeURIComponent(q)}`)} placeholder="Search for Movies, Matches, Concerts, Plays and Activities" className="w-full text-lg outline-none" />
        <button onClick={onClose} className="rounded-full p-1 hover:bg-ink-50" aria-label="Close"><Icon name="X" size={20} /></button>
      </div>
      <div className="flex flex-wrap gap-2 px-5 py-3">{config?.categories.map((c) => <button key={c.id} onClick={() => setCat(cat === c.id ? null : c.id)} className={`chip ${cat === c.id ? 'chip-on' : ''}`}>{c.name}</button>)}</div>
      <ul className="max-h-[55vh] overflow-y-auto pb-2">
        {results.map((e) => (
          <li key={e.id}><button onClick={() => go(`/events/${e.slug}`)} className="flex w-full items-center gap-3 px-5 py-2.5 text-left hover:bg-ink-50">
            <Poster event={e} className="h-14 w-10 shrink-0 rounded-md" showTitle={false} size="sm" />
            <div className="min-w-0"><div className="truncate font-medium">{e.title}</div><div className="truncate text-xs capitalize text-ink-500">{e.subCategory || e.category} · {e.venue?.name}</div></div>
          </button></li>
        ))}
        {!results.length && <li className="px-5 py-8 text-center text-ink-500">No results. Try another keyword.</li>}
      </ul>
    </Modal>
  );
}
