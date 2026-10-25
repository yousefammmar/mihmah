// Payment provider boundary. No live provider is integrated: see PAYMENTS-RESEARCH.md.
// - "none": every payment stays `pending_integration`; nothing can move money.
// - "sandbox": isolated simulation for development/demo. Status changes only arrive through
//   simulated provider events (admin tool), never because a company or student clicked a button.
import { HttpError } from './errors.js';

// Allowed transitions; anything else is rejected.
export const PAYMENT_TRANSITIONS = {
  pending_integration: ['cancelled'],
  awaiting_payment: ['authorized', 'failed', 'cancelled'],
  authorized: ['captured', 'cancelled', 'failed'],
  captured: ['payout_pending', 'refunded'],
  payout_pending: ['paid_out', 'failed'],
  paid_out: [],
  refunded: [],
  failed: ['awaiting_payment'],
  cancelled: [],
};

// Simulated provider events (sandbox only) and the status each one produces.
export const SANDBOX_EVENTS = {
  'payment.authorized': 'authorized',
  'payment.captured': 'captured',
  'payment.failed': 'failed',
  'payout.initiated': 'payout_pending',
  'payout.completed': 'paid_out',
  'refund.completed': 'refunded',
};

export function createPayments(config) {
  const provider = config.payments.provider;
  return {
    provider,
    live: false,
    initialStatus: provider === 'sandbox' ? 'awaiting_payment' : 'pending_integration',
    feeFor: (amount) => Math.round(Number(amount) * config.payments.platformFeePercent * 10) / 1000,
    assertSandbox() {
      if (provider !== 'sandbox') throw new HttpError(409, 'payments_unavailable', 'لا يوجد مزوّد دفع مفعّل. الدفع بانتظار التكامل مع مزوّد يدعم الأردن.');
    },
    assertTransition(from, to) {
      if (!(PAYMENT_TRANSITIONS[from] || []).includes(to)) {
        throw new HttpError(409, 'invalid_payment_transition', `انتقال حالة دفع غير مسموح: ${from} → ${to}`);
      }
    },
  };
}
