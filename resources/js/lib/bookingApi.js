// Booking calls and paths. The main site uses the public API; an embed (/embed/:token) uses the token-scoped routes,
// so the same booking pages work in both places.
import { api } from './api';

export function flow(token) {
  if (!token) return { api, base: '' };
  return {
    base: `/embed/${token}`,
    api: {
      getAvailability: ({ showId }) => api.embedAvailability({ token, showId }),
      createHold: (body) => api.embedCreateHold({ token, ...body }),
      getHold: ({ holdId }) => api.embedGetHold({ token, holdId }),
      releaseHold: ({ holdId }) => api.embedReleaseHold({ token, holdId }),
      quote: ({ holdId, promoCode }) => api.embedQuote({ token, holdId, promoCode }),
      createOrder: (body) => api.embedCreateOrder({ token, ...body }),
      getOrder: ({ orderId }) => api.embedGetOrder({ token, orderId }),
      startPayment: ({ orderId, method }) => api.embedStartPayment({ token, orderId, method }),
      simulatePayment: ({ orderId, outcome }) => api.embedSimulatePayment({ token, orderId, outcome }),
    },
  };
}
