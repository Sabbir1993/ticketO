// English / Bangla for the SPA, no extra infrastructure.
//   · English text IS the key:  t('Your Orders')  →  'আপনার অর্ডার' in Bangla, unchanged in English
//   · anything missing from i18n/bn.js falls back to the English text, so a gap never shows a raw key
//   · {name} placeholders:  t('Hey, {name}', { name })
//   · the choice is kept in localStorage (try/catch) and applied to <html lang>
import { BN } from '../i18n/bn.js';

export const LOCALES = [['en', 'EN'], ['bn', 'বাংলা']];
const KEY = 'ticketo:lang';
let current = 'en';

export function readLocale() {
  try { const v = localStorage.getItem(KEY); if (v === 'bn' || v === 'en') return v; } catch { /* private mode */ }
  return 'en';
}
export function setCurrentLocale(l) {
  current = l === 'bn' ? 'bn' : 'en';
  try { localStorage.setItem(KEY, current); } catch { /* ignore */ }
  if (typeof document !== 'undefined') document.documentElement.lang = current;
}
export const currentLocale = () => current;

export function translate(key, vars) {
  let s = current === 'bn' ? (BN[key] ?? key) : key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m));
  return s;
}

// Bangla digits for numbers inside formatted strings (৳1,200 → ৳১,২০০). English mode returns the text untouched.
const DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
export const digits = (s) => (current === 'bn' ? String(s).replace(/\d/g, (d) => DIGITS[Number(d)]) : String(s));

export const WEEKDAYS = { en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], bn: ['রবি', 'সোম', 'মঙ্গল', 'বুধ', 'বৃহস্পতি', 'শুক্র', 'শনি'] };
export const MONTHS = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  bn: ['জানু', 'ফেব্রু', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টে', 'অক্টো', 'নভে', 'ডিসে'],
};
