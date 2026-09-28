export const cx = (...a) => a.filter(Boolean).join(' ');
export const bdt = (n) => (n === 0 ? 'Free' : `৳${Math.round(n || 0).toLocaleString('en-IN')}`);
export const bdtPlain = (n) => `৳${Math.round(n || 0).toLocaleString('en-IN')}`;

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const fmtDate = (iso, { weekday = true, year = false } = {}) => { if (!iso) return '—'; const d = new Date(iso); return `${weekday ? `${WD[d.getDay()]}, ` : ''}${d.getDate()} ${MO[d.getMonth()]}${year ? ` ${d.getFullYear()}` : ''}`; };
export const fmtTime = (iso) => { if (!iso) return ''; const d = new Date(iso); const h = d.getHours(); return `${((h + 11) % 12) + 1}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
export const fmtDateTime = (iso) => `${fmtDate(iso)}, ${fmtTime(iso)}`;
export const weekday = (iso) => WD[new Date(iso).getDay()];
export const monthShort = (iso) => MO[new Date(iso).getMonth()];
export const compact = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : `${n}`);
export const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();
export function dateStrip(days = 7) { const out = []; const d = new Date(); d.setHours(0, 0, 0, 0); for (let i = 0; i < days; i++) out.push(new Date(d.getTime() + i * 86400000).toISOString()); return out; }
export function timeLeft(ms) { const s = Math.max(0, Math.floor(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }
export const toLocalInput = (iso) => { if (!iso) return ''; const d = new Date(iso); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };

export function downloadCSV(filename, rows) {
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = filename; a.click();
}
export const fileToDataUrl = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });

export const LOYALTY_TIERS = [
  { id: 'silver', name: 'Silver', min: 0, multiplier: 1, perks: ['1 point per ৳100', 'Birthday bonus 100 pts'] },
  { id: 'gold', name: 'Gold', min: 1500, multiplier: 1.5, perks: ['1.5x points', 'Early access to presales', 'Free cancellation once a month'] },
  { id: 'platinum', name: 'Platinum', min: 5000, multiplier: 2, perks: ['2x points', 'Priority entry lanes', 'Exclusive member events'] },
];
export const tierFor = (p) => [...LOYALTY_TIERS].reverse().find((t) => p >= t.min) || LOYALTY_TIERS[0];
export const CAT_ICONS = { movies: 'Film', sports: 'Trophy', concerts: 'Music', theater: 'Theater', comedy: 'Laugh', seminars: 'Presentation', workshops: 'Wrench', fairs: 'Tent', webinars: 'Laptop' };
export const STATUS_LABEL = { pending_payment: 'Awaiting payment', paid: 'Confirmed', refund_requested: 'Refund requested', refunded: 'Refunded', expired: 'Expired', failed: 'Failed', draft: 'Draft', published: 'Live', pending_review: 'In review', rejected: 'Rejected', paused: 'Paused', cancelled: 'Cancelled', pending: 'KYC review', active: 'Active', suspended: 'Suspended' };
