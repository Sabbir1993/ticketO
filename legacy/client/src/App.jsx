import { BrowserRouter, MemoryRouter, Route, Routes } from 'react-router-dom';
import { StoreProvider } from '@/lib/store';
import { SiteLayout, BareLayout } from '@/components/Layout';
import Toasts from '@/components/Toasts';
import Home from '@/pages/customer/Home';
import Explore from '@/pages/customer/Explore';
import EventPage from '@/pages/customer/EventPage';
import Showtimes from '@/pages/customer/Showtimes';
import Book from '@/pages/customer/Book';
import Checkout from '@/pages/customer/Checkout';
import Payment from '@/pages/customer/Payment';
import PaySimulate from '@/pages/customer/PaySimulate';
import Booking from '@/pages/customer/Booking';
import Login from '@/pages/customer/Login';
import Profile from '@/pages/customer/Profile';
import { Offers, Help, NotFound } from '@/pages/customer/Misc';
import PartnerLogin from '@/pages/merchant/PartnerLogin';
import Register from '@/pages/merchant/Register';
import MerchantPortal from '@/pages/merchant/Portal';
import AdminConsole from '@/pages/admin/Admin';
import POS from '@/pages/ops/POS';
import Gate from '@/pages/ops/Gate';
import PreviewSwitcher from '@/components/PreviewSwitcher';

const Router = __ROUTER__ === 'memory' ? MemoryRouter : BrowserRouter; // eslint-disable-line no-undef

export default function App() {
  return (
    <Router>
      <StoreProvider>
        <Routes>
          <Route element={<SiteLayout />}>
            <Route index element={<Home />} />
            <Route path="explore" element={<Explore />} />
            <Route path="events/:slug" element={<EventPage />} />
            <Route path="events/:slug/showtimes" element={<Showtimes />} />
            <Route path="checkout/:holdId" element={<Checkout />} />
            <Route path="payment/:orderId" element={<Payment />} />
            <Route path="booking/:id" element={<Booking />} />
            <Route path="login" element={<Login />} />
            <Route path="profile" element={<Profile />} />
            <Route path="offers" element={<Offers />} />
            <Route path="help" element={<Help />} />
            <Route path="partner/login" element={<PartnerLogin />} />
            <Route path="merchant/register" element={<Register />} />
            <Route path="*" element={<NotFound />} />
          </Route>
          <Route element={<SiteLayout footer={false} />}><Route path="book/:showId" element={<Book />} /></Route>
          <Route element={<BareLayout />}>
            <Route path="pay/simulate/:orderId" element={<PaySimulate />} />
            <Route path="merchant/*" element={<MerchantPortal />} />
            <Route path="admin/*" element={<AdminConsole />} />
            <Route path="pos" element={<POS />} />
            <Route path="gate" element={<Gate />} />
          </Route>
        </Routes>
        <Toasts />
        {__ROUTER__ === 'memory' && <PreviewSwitcher />}
      </StoreProvider>
    </Router>
  );
}
