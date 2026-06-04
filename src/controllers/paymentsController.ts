import crypto from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import { Request, Response } from 'express';
import { db, Timestamp, FieldValue } from '../config/firebase';
import { env } from '../config/env';
import { expoPushService } from '../services/expo-push';
import { notificationService } from '../services/notifications';

const PAYSTACK_BASE = 'https://api.paystack.co';
const PENDING_PURCHASES = 'pendingTokenPurchases';
const APPLIED_PAYMENTS_LEDGER = 'appliedPayments';
const TRANSACTIONS = 'transactions';
const WALLETS = 'wallets';

const MIN_AMOUNT_KOBOS = 10000; // minimum ₦100

// =====================================================================
// HMAC-SHA512 Paystack signature verification using node:crypto
// =====================================================================
function verifyPaystackSignature(rawBody: string | Buffer, signatureHeader: string): boolean {
  if (!env.paystack.secretKey) return false;
  const hash = crypto.createHmac('sha512', env.paystack.secretKey)
    .update(rawBody)
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signatureHeader));
}

// =====================================================================
// Express 5 raw body + JSON parse helper for webhook route
// =====================================================================
function parseRawJSON(raw: Buffer): Record<string, unknown> {
  return JSON.parse(raw.toString('utf-8'));
}

// =====================================================================
// CORE: finalizePaystackPayment — idempotent via appliedPayments ledger
// All three confirmation paths (webhook, callback, verify) converge here
// =====================================================================
async function finalizePaystackPayment(
  reference: string,
  userInfo?: { userId: string; walletId: string },
): Promise<{
  success: boolean;
  alreadyApplied: boolean;
  transactionId?: string;
  amount?: number;
  message?: string;
}> {
  // ── Step 1: Verify with Paystack (outside Firestore transaction) ──────
  let paystackVerification: { status: string; amount: number; currency: string } | null = null;

  try {
    const response = await fetch(`${PAYSTACK_BASE}/transaction/verify/${reference}`, {
      headers: { Authorization: `Bearer ${env.paystack.secretKey}` },
    });
    const result = (await response.json()) as { status: boolean; data?: { status: string; amount: number; currency: string }; message: string };

    if (!result.status || !result.data || result.data.status !== 'success') {
      return { success: false, alreadyApplied: false, message: result.message || 'Payment not verified by Paystack' };
    }
    paystackVerification = result.data;
  } catch {
    return { success: false, alreadyApplied: false, message: 'Failed to reach Paystack verification endpoint' };
  }

  // ── Step 2: Find the pending purchase (outside transaction) ──────────
  const purchaseSnapshot = await db.collection(PENDING_PURCHASES)
    .where('reference', '==', reference)
    .limit(1)
    .get();

  if (purchaseSnapshot.empty) {
    return { success: false, alreadyApplied: false, message: 'No pending purchase found for this reference' };
  }

  const purchaseDoc = purchaseSnapshot.docs[0];
  const purchaseData = purchaseDoc.data();

  if (purchaseData.status === 'completed') {
    return { success: true, alreadyApplied: true, message: 'Purchase already completed' };
  }

  // Cross-check ownership (for manual verify flows)
  if (userInfo && purchaseData.userId !== userInfo.userId) {
    return { success: false, alreadyApplied: false, message: 'Payment does not belong to this user' };
  }

  // ── Step 3: Atomic Firestore transaction — ledger + credit ───────────
  const ledgerRef = db.collection(APPLIED_PAYMENTS_LEDGER).doc('ledger');
  const purchaseRef = purchaseDoc.ref;
  const userId = purchaseData.userId;
  const walletId = purchaseData.walletId;
  const amountKobo = purchaseData.amount;
  const amountMain = amountKobo / 100;

  const walletSnapshot = await db.collection(WALLETS).where('userId', '==', userId).limit(1).get();
  if (walletSnapshot.empty) {
    return { success: false, alreadyApplied: false, message: 'Wallet not found' };
  }
  const walletRef = walletSnapshot.docs[0].ref;

  try {
    const txnResult = await db.runTransaction(async (txn) => {
      const ledgerDoc = await txn.get(ledgerRef);
      const payments: Record<string, string> = ledgerDoc.exists
        ? (ledgerDoc.data()?.payments ?? {})
        : {};

      if (payments[reference]) {
        return { alreadyApplied: true, transactionId: undefined as string | undefined };
      }

      const txnDocRef = db.collection(TRANSACTIONS).doc();

      txn.set(txnDocRef, {
        walletId,
        userId,
        type: 'funding' as const,
        amount: amountMain,
        fee: 0,
        reference,
        description: `Wallet funding via Paystack — ${amountMain.toLocaleString()} ${purchaseData.currency || 'NGN'}`,
        status: 'completed' as const,
        paymentMethod: 'paystack' as const,
        metadata: {
          paystackReference: reference,
          paystackAmount: amountKobo,
          currency: purchaseData.currency,
          verifiedAt: new Date().toISOString(),
        },
        createdAt: Timestamp.now(),
      });

      txn.update(purchaseRef, {
        status: 'completed',
        updatedAt: Timestamp.now(),
      });

      txn.update(walletRef, {
        balance: FieldValue.increment(amountMain),
        totalFunded: FieldValue.increment(amountMain),
        updatedAt: Timestamp.now(),
      });

      payments[reference] = new Date().toISOString();
      txn.set(ledgerRef, { payments }, { merge: true });

      return { alreadyApplied: false, transactionId: txnDocRef.id };
    });

    if (!txnResult.alreadyApplied) {
      void expoPushService.sendToUser(
        userId,
        'Wallet Funded',
        `Your wallet has been credited with ₦${amountMain.toLocaleString()}`,
        { type: 'wallet_funded', amount: amountMain },
      );

      void notificationService.createUserNotification({
        userId,
        type: 'wallet_funded',
        title: 'Wallet Funded',
        body: `Your wallet has been credited with ₦${amountMain.toLocaleString()}`,
        data: { type: 'wallet_funded', amount: amountMain },
      });
    }

    return {
      success: true,
      alreadyApplied: txnResult.alreadyApplied,
      transactionId: txnResult.transactionId,
      amount: amountMain,
    };
  } catch (error: any) {
    if (error?.code === 6) {
      // ALREADY_EXISTS — handled gracefully
      return { success: true, alreadyApplied: true, message: 'Payment already processed (concurrent)' };
    }
    return { success: false, alreadyApplied: false, message: error?.message || 'Ledger transaction failed' };
  }
}

// =====================================================================
// HANDLER: POST /api/payments/initiate
// Authenticated — creates pending wallet funding, calls Paystack initialize
// =====================================================================
export async function initiatePayment(req: Request, res: Response): Promise<void> {
  try {
    const { amount } = req.body;
    const amountNaira = Number(amount);

    if (!amountNaira || isNaN(amountNaira) || amountNaira <= 0) {
      res.status(400).json({
        success: false,
        message: 'Valid amount in Naira required (e.g. { "amount": 500 })',
      });
      return;
    }

    const amountKobo = Math.round(amountNaira * 100);

    if (amountKobo < MIN_AMOUNT_KOBOS) {
      res.status(400).json({
        success: false,
        message: `Minimum funding amount is ${MIN_AMOUNT_KOBOS / 100} NGN`,
      });
      return;
    }

    const reference = `RAD5-${uuidv4().replace(/-/g, '').substring(0, 16).toUpperCase()}`;
    const user = req.user!;

    await db.collection(PENDING_PURCHASES).doc(reference).set({
      userId: user.userId,
      walletId: user.walletId,
      reference,
      amount: amountKobo,
      currency: env.currency,
      metadata: {},
      status: 'pending',
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    const paystackPayload = {
      email: user.email,
      amount: amountKobo,
      currency: env.currency,
      reference,
      callback_url: `${env.app.baseUrl}/api/payments/callback?reference=${reference}`,
      metadata: {
        userId: user.userId,
        amount: amountNaira,
      },
    };

    const response = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.paystack.secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(paystackPayload),
    });

    const result = (await response.json()) as {
      status: boolean;
      data?: { authorization_url: string; access_code: string; reference: string };
      message: string;
    };

    if (!result.status || !result.data?.authorization_url) {
      await db.collection(PENDING_PURCHASES).doc(reference).update({
        status: 'failed',
        'metadata.error': result.message || 'Paystack initialization failed',
        updatedAt: Timestamp.now(),
      });

      res.status(400).json({
        success: false,
        message: result.message || 'Paystack initialization failed',
      });
      return;
    }

    await db.collection(PENDING_PURCHASES).doc(reference).update({
      'metadata.accessCode': result.data.access_code,
      'metadata.paystackRef': result.data.reference,
      updatedAt: Timestamp.now(),
    });

    res.json({
      success: true,
      message: 'Payment initialized — redirect user to the authorization URL',
      data: {
        authorizationUrl: result.data.authorization_url,
        reference,
        accessCode: result.data.access_code,
        amount: amountKobo,
        displayAmount: `${amountNaira.toLocaleString()} ${env.currency}`,
        publicKey: env.paystack.publicKey,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Failed to initialize payment' });
  }
}

// =====================================================================
// HANDLER: POST /api/payments/webhook
// No auth — Paystack server-side. HMAC-SHA512 signature verified
// Expects raw body (express.raw middleware on the route)
// =====================================================================
export async function handleWebhook(req: Request, res: Response): Promise<void> {
  try {
    const signature = req.headers['x-paystack-signature'] as string;
    if (!signature) {
      res.status(401).json({ success: false, message: 'Missing x-paystack-signature header' });
      return;
    }

    // req.body is a Buffer when express.raw() middleware is applied
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body));
    if (!verifyPaystackSignature(rawBody, signature)) {
      res.status(401).json({ success: false, message: 'Invalid HMAC signature' });
      return;
    }

    const event = Buffer.isBuffer(req.body) ? parseRawJSON(req.body) : req.body;
    const eventType = event?.event as string | undefined;

    if (eventType !== 'charge.success') {
      res.json({ success: true, message: `Event ${eventType || 'unknown'} acknowledged` });
      return;
    }

    const data = event?.data as Record<string, unknown> | undefined;
    const reference = data?.reference as string | undefined;

    if (!reference) {
      res.status(400).json({ success: false, message: 'Missing reference in webhook payload' });
      return;
    }

    const result = await finalizePaystackPayment(reference);

    if (!result.success) {
      res.status(400).json({ success: false, message: result.message || 'Failed to process payment' });
      return;
    }

    res.json({
      success: true,
      message: result.alreadyApplied ? 'Payment already processed (idempotent)' : 'Payment processed successfully',
      data: { reference, alreadyApplied: result.alreadyApplied, transactionId: result.transactionId },
    });
  } catch (error: any) {
    // Always return 200 to Paystack webhooks to prevent retries
    console.error('Webhook error:', error.message);
    res.status(200).json({ success: false, message: 'Webhook received but processing errored' });
  }
}

// =====================================================================
// HANDLER: GET /api/payments/callback
// No auth — Paystack redirects browser here after payment
// =====================================================================
export async function handleCallback(req: Request, res: Response): Promise<void> {
  try {
    const reference = (req.query.reference as string) || (req.query.trxref as string);

    if (!reference) {
      res.redirect(`${env.app.corsOrigin}/wallet/funding/failed?reason=missing_reference`);
      return;
    }

    const result = await finalizePaystackPayment(reference);

    if (!result.success) {
      res.redirect(`${env.app.corsOrigin}/wallet/funding/failed?reference=${reference}&reason=verification_failed`);
      return;
    }

    const params = new URLSearchParams({
      reference,
      trxref: reference,
      status: 'success',
      amount: String(result.amount || 0),
    });

    res.redirect(`${env.app.corsOrigin}/wallet/funding/success?${params.toString()}`);
  } catch {
    res.redirect(`${env.app.corsOrigin}/wallet/funding/failed?reason=server_error`);
  }
}

// =====================================================================
// HANDLER: POST /api/payments/verify
// Authenticated — manual client-side verification fallback
// =====================================================================
export async function verifyPayment(req: Request, res: Response): Promise<void> {
  try {
    const { reference } = req.body;

    if (!reference || typeof reference !== 'string') {
      res.status(400).json({ success: false, message: 'Valid reference string required' });
      return;
    }

    const user = req.user!;
    const result = await finalizePaystackPayment(reference, {
      userId: user.userId,
      walletId: user.walletId!,
    });

    if (!result.success) {
      res.status(400).json({
        success: false,
        message: result.message || 'Payment verification failed — may not be completed on Paystack',
      });
      return;
    }

    res.json({
      success: true,
      message: result.alreadyApplied ? 'Payment already verified and credited' : 'Payment verified successfully',
      data: {
        reference,
        alreadyApplied: result.alreadyApplied,
        transactionId: result.transactionId,
        amount: result.amount,
        walletCredited: !result.alreadyApplied,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Verification failed' });
  }
}
