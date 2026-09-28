import { Outlet, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import Header from './Header';
import Footer from './Footer';
import { Loading, ErrorState } from './States';
import { useStore } from '@/lib/store';

export function SiteLayout({ footer = true }) {
  const { ready, configError, loadConfig } = useStore();
  const { pathname } = useLocation();
  useEffect(() => { try { window.scrollTo(0, 0); } catch {} }, [pathname]);
  return (
    <>
      <Header />
      <main className="min-h-[60vh]">{configError ? <ErrorState error={{ message: configError }} onRetry={loadConfig} /> : ready ? <Outlet /> : <Loading />}</main>
      {footer && <Footer />}
    </>
  );
}
export function BareLayout() {
  const { ready } = useStore();
  const { pathname } = useLocation();
  useEffect(() => { try { window.scrollTo(0, 0); } catch {} }, [pathname]);
  return ready ? <Outlet /> : <Loading />;
}
