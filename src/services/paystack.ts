import { env } from '../config/env.js';

const PAYSTACK_BASE = 'https://api.paystack.co';

export const paystackService = {
  /** Live available balance on the Paystack account (naira), or null if unavailable. */
  async getBalance(): Promise<{ balance: number; currency: string } | null> {
    if (!env.paystack.secretKey) return null;
    try {
      const response = await fetch(`${PAYSTACK_BASE}/balance`, {
        headers: { Authorization: `Bearer ${env.paystack.secretKey}` },
      });
      const result = (await response.json()) as {
        status: boolean;
        data?: Array<{ currency: string; balance: number }>;
        message?: string;
      };
      if (!result.status || !result.data?.length) return null;
      const channel = result.data.find((d) => d.currency === env.currency) || result.data[0];
      return { balance: channel.balance / 100, currency: channel.currency };
    } catch {
      return null;
    }
  },
};
