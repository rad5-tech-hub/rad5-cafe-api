import { Router, raw } from 'express';
import { authenticate } from '../middleware/auth';
import {
  initiatePayment,
  handleWebhook,
  handleCallback,
  verifyPayment,
} from '../controllers/paymentsController';

const router = Router();

// #updates — Token purchase initialization (authenticated)
router.post('/initiate', authenticate, initiatePayment);

// #updates — Paystack webhook (no auth, raw body for HMAC verification)
router.post('/webhook', raw({ type: 'application/json' }), handleWebhook);

// #updates — Paystack browser redirect callback (no auth)
router.get('/callback', handleCallback);

// #updates — Manual client-side verify fallback (authenticated)
router.post('/verify', authenticate, verifyPayment);

export default router;
