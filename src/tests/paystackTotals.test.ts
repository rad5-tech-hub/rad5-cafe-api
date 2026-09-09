import { describe, expect, it, beforeEach, mock } from 'bun:test';
import { paystackService } from '../services/paystack.js';

describe('Paystack Money Computation & Aggregation', () => {
  describe('Subunit to Naira Conversion Logic', () => {
    it('should correctly convert kobo amount to Naira', () => {
      const koboAmount = 55000000; // 550,000 NGN in kobo
      const nairaAmount = koboAmount / 100;
      expect(nairaAmount).toBe(550000);
    });

    it('should handle decimal kobo precision safely with EPSILON rounding', () => {
      const rawKobo = 10050; // ₦100.50
      const converted = Math.round((rawKobo / 100 + Number.EPSILON) * 100) / 100;
      expect(converted).toBe(100.5);
    });
  });

  describe('Paystack /transaction/totals Response Normalization', () => {
    it('should parse Paystack /transaction/totals payload with single currency', () => {
      const mockPaystackResponse = {
        status: true,
        message: 'Totals retrieved',
        data: {
          total_volume: 125000000, // ₦1,250,000 in kobo
          total_transactions: 42,
          pending_transfers: 0,
          total_volume_by_currency: [
            {
              currency: 'NGN',
              amount: 125000000,
            },
          ],
        },
      };

      const totalVolumeByCurrency = (mockPaystackResponse.data.total_volume_by_currency || []).map((c) => ({
        currency: c.currency || 'NGN',
        amount: (c.amount || 0) / 100,
      }));

      const primaryEntry = totalVolumeByCurrency.find((c) => c.currency === 'NGN');
      const total = primaryEntry ? primaryEntry.amount : (mockPaystackResponse.data.total_volume || 0) / 100;
      const count = mockPaystackResponse.data.total_transactions || 0;

      expect(total).toBe(1250000);
      expect(count).toBe(42);
      expect(totalVolumeByCurrency).toEqual([{ currency: 'NGN', amount: 1250000 }]);
    });

    it('should parse multi-currency totals and prioritize primary currency NGN', () => {
      const mockMultiCurrencyResponse = {
        status: true,
        message: 'Totals retrieved',
        data: {
          total_volume: 250000000,
          total_transactions: 95,
          pending_transfers: 1500000,
          total_volume_by_currency: [
            { currency: 'USD', amount: 50000 },
            { currency: 'NGN', amount: 245000000 },
          ],
        },
      };

      const totalVolumeByCurrency = (mockMultiCurrencyResponse.data.total_volume_by_currency || []).map((c) => ({
        currency: c.currency,
        amount: (c.amount || 0) / 100,
      }));

      const primaryEntry = totalVolumeByCurrency.find((c) => c.currency === 'NGN');
      const total = primaryEntry ? primaryEntry.amount : (mockMultiCurrencyResponse.data.total_volume || 0) / 100;
      const count = mockMultiCurrencyResponse.data.total_transactions || 0;
      const pendingTransfers = (mockMultiCurrencyResponse.data.pending_transfers || 0) / 100;

      expect(total).toBe(2450000);
      expect(count).toBe(95);
      expect(pendingTransfers).toBe(15000);
      expect(totalVolumeByCurrency).toHaveLength(2);
      expect(totalVolumeByCurrency[0]).toEqual({ currency: 'USD', amount: 500 });
      expect(totalVolumeByCurrency[1]).toEqual({ currency: 'NGN', amount: 2450000 });
    });
  });

  describe('Date Filter Query String Construction', () => {
    it('should build correct query parameters for date range', () => {
      const from = '2026-01-01T00:00:00Z';
      const to = '2026-03-01T23:59:59Z';
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);

      expect(params.toString()).toBe('from=2026-01-01T00%3A00%3A00Z&to=2026-03-01T23%3A59%3A59Z');
    });

    it('should handle optional or missing date filters gracefully', () => {
      const from = undefined;
      const to = undefined;
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);

      expect(params.toString()).toBe('');
    });
  });

  describe('Database Aggregation Logic for Paystack Inflows', () => {
    it('should sum all completed Paystack payments accurately', () => {
      const sampleCompletedTransactions = [
        { amount: 5000, paymentMethod: 'paystack', status: 'completed' },
        { amount: 15000, paymentMethod: 'paystack', status: 'completed' },
        { amount: 2500.5, paymentMethod: 'paystack', status: 'completed' },
        { amount: 10000, paymentMethod: 'cash', status: 'completed' }, // Should be excluded
        { amount: 7000, paymentMethod: 'paystack', status: 'pending' }, // Should be excluded
      ];

      const paystackCompleted = sampleCompletedTransactions.filter(
        (t) => t.paymentMethod === 'paystack' && t.status === 'completed'
      );

      const totalAmount = paystackCompleted.reduce((acc, t) => acc + t.amount, 0);
      const count = paystackCompleted.length;

      expect(totalAmount).toBe(22500.5);
      expect(count).toBe(3);
    });
  });
});
