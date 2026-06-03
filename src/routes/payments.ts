import { Router, raw } from 'express';
import { authenticate } from '../middleware/auth';
import {
  initiatePayment,
  handleWebhook,
  handleCallback,
  verifyPayment,
} from '../controllers/paymentsController';

const router = Router();

// Wallet funding via Paystack (authenticated)
router.post('/initiate', authenticate, initiatePayment);

// Paystack webhook (no auth, raw body for HMAC verification)
router.post('/webhook', raw({ type: 'application/json' }), handleWebhook);

// Paystack browser redirect callback (no auth)
router.get('/callback', handleCallback);

// Manual client-side verify fallback (authenticated)
router.post('/verify', authenticate, verifyPayment);

export default router;
