// App-wide state: platform config, signed-in user, per-device preferences, toasts.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken, MODE } from './api';
import { applyTheme } from './theme';

const Ctx = createContext(null);
const PREFS_KEY = 'ticketo:prefs';
const defaults = { city: null, wishlist: [], waitlist: [], points: 0, lifetimePoints: 0, checkins: [], referral: null };
const readPrefs = () => { try { return { ...defaults, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') }; } catch { return defaults; } };

export function StoreProvider({ children }) {
  const [config, setConfig] = useState(null);
  const [configError, setConfigError] = useState(null);
  const [session, setSession] = useState({ user: null, merchant: null, checked: false });
  const [prefs, setPrefs] = useState(readPrefs);
  const [toasts, setToasts] = useState([]);

  useEffect(() => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch {} }, [prefs]);

  const toast = useCallback((msg, kind = 'ok') => {
    const id = Math.random();
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3600);
  }, []);

  const loadConfig = useCallback(() => api.getConfig().then((c) => { applyTheme(c.branding); setConfig(c); }).catch((e) => setConfigError(e.message)), []);
  const refreshMe = useCallback(async () => {
    if (!getToken()) return setSession({ user: null, merchant: null, checked: true });
    try { const r = await api.me(); setSession({ user: r.user, merchant: r.merchant, checked: true }); }
    catch { setToken(null); setSession({ user: null, merchant: null, checked: true }); }
  }, []);
  useEffect(() => { loadConfig(); refreshMe(); }, [loadConfig, refreshMe]);

  const actions = useMemo(() => ({
    toast, loadConfig, refreshMe,
    signIn: (res) => { setToken(res.token); setSession({ user: res.user, merchant: res.merchant || null, checked: true }); },
    signOut: async () => { try { await api.logout(); } catch {} setToken(null); setSession({ user: null, merchant: null, checked: true }); },
    setMerchant: (merchant) => setSession((s) => ({ ...s, merchant })),
    setPrefs: (patch) => setPrefs((p) => ({ ...p, ...(typeof patch === 'function' ? patch(p) : patch) })),
    toggleWishlist: (id) => setPrefs((p) => ({ ...p, wishlist: p.wishlist.includes(id) ? p.wishlist.filter((x) => x !== id) : [...p.wishlist, id] })),
    earnPoints: (n) => setPrefs((p) => ({ ...p, points: p.points + n, lifetimePoints: p.lifetimePoints + n })),
  }), [toast, loadConfig, refreshMe]);

  const value = { config, configError, ...session, prefs, toasts, mode: MODE, ready: !!config && session.checked, ...actions };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export const useStore = () => useContext(Ctx);

// Small data-fetching hook
export function useApi(fn, deps = []) {
  const [state, set] = useState({ data: null, error: null, loading: true });
  const run = useCallback(() => {
    let alive = true;
    set((s) => ({ ...s, loading: true }));
    Promise.resolve().then(fn).then((data) => alive && set({ data, error: null, loading: false })).catch((error) => alive && set({ data: null, error, loading: false }));
    return () => { alive = false; };
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(run, [run]);
  return { ...state, reload: run, setData: (d) => set((s) => ({ ...s, data: typeof d === 'function' ? d(s.data) : d })) };
}
