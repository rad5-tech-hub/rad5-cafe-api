import { Router, raw } from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  initiatePayment,
  handleWebhook,
  handleCallback,
} from '../controllers/paymentsController.js';

const router = Router();

// Wallet funding via Paystack (authenticated)
router.post('/initiate', authenticate, initiatePayment);

// Paystack webhook (no auth, raw body for HMAC verification)
router.post('/webhook', raw({ type: 'application/json' }), handleWebhook);

// Paystack browser redirect callback (no auth)
router.get('/callback', handleCallback);

export default router;
