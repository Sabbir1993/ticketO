import { useState } from 'react';
import Modal from './Modal';
import Icon from './Icon';
import { useStore } from '@/lib/store';

export default function CityModal({ open, onClose }) {
  const { config, prefs, setPrefs } = useStore();
  const [q, setQ] = useState('');
  const list = (config?.cities || []).filter((c) => c.name.toLowerCase().includes(q.toLowerCase()));
  const pick = (id) => { setPrefs({ city: id }); onClose(); };
  return (
    <Modal open={open} onClose={prefs.city ? onClose : undefined} wide bare>
      <div className="p-5">
        <div className="flex items-center gap-2 rounded-lg border border-ink-100 px-3 py-2.5"><Icon name="Search" size={18} className="text-ink-500" /><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search for your city" className="w-full outline-none" /></div>
        <button onClick={() => pick('dhaka')} className="mt-3 flex items-center gap-2 text-sm font-medium text-brand-500"><Icon name="MapPin" size={16} /> Detect my location</button>
      </div>
      <div className="border-t border-ink-100 bg-ink-50/60 px-5 py-6 text-center">
        <p className="mb-5 text-sm font-medium text-ink-700">Popular Cities</p>
        <div className="grid grid-cols-3 gap-4 sm:grid-cols-7">
          {list.map((c) => (
            <button key={c.id} onClick={() => pick(c.id)} className={`group flex flex-col items-center gap-2 rounded-xl p-2 transition hover:bg-white ${prefs.city === c.id ? 'bg-white ring-1 ring-brand-200' : ''}`}>
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-ink-500 shadow-sm group-hover:text-brand-500"><Icon name={c.id === 'online' ? 'Globe' : 'Building2'} size={26} strokeWidth={1.4} /></span>
              <span className="text-xs text-ink-700">{c.name}</span>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}
