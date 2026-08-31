import { env } from '../config/env.js';

const PAYSTACK_BASE = 'https://api.paystack.co';

export const paystackService = {
  /** Paginated list of every transaction Paystack has ever recorded for this account. */
  async listTransactions(opts: {
    page?: number;
    perPage?: number;
    from?: string;
    to?: string;
    status?: string;
  } = {}): Promise<{
    data: Array<{
      id: number;
      reference: string;
      amount: number;
      fees: number;
      currency: string;
      status: string;
      channel: string;
      customerEmail: string;
      gatewayResponse: string;
      paidAt: string | null;
      createdAt: string;
    }>;
    meta: { total: number; page: number; perPage: number; pageCount: number };
  } | null> {
    if (!env.paystack.secretKey) return null;
    try {
      const params = new URLSearchParams();
      params.set('page', String(opts.page ?? 1));
      params.set('perPage', String(Math.min(opts.perPage ?? 50, 100)));
      if (opts.from) params.set('from', opts.from);
      if (opts.to) params.set('to', opts.to);
      if (opts.status) params.set('status', opts.status);

      const response = await fetch(`${PAYSTACK_BASE}/transaction?${params.toString()}`, {
        headers: { Authorization: `Bearer ${env.paystack.secretKey}` },
      });
      const result = (await response.json()) as {
        status: boolean;
        data?: any[];
        meta?: { total: number; page: number; perPage: number; pageCount: number };
        message?: string;
      };
      if (!result.status || !result.data) return null;

      return {
        data: result.data.map((t) => ({
          id: t.id,
          reference: t.reference,
          amount: (t.amount || 0) / 100,
          fees: (t.fees || 0) / 100,
          currency: t.currency,
          status: t.status,
          channel: t.channel || '',
          customerEmail: t.customer?.email || '',
          gatewayResponse: t.gateway_response || '',
          paidAt: t.paid_at || null,
          createdAt: t.created_at,
        })),
        meta: result.meta || { total: result.data.length, page: opts.page ?? 1, perPage: opts.perPage ?? 50, pageCount: 1 },
      };
    } catch {
      return null;
    }
  },

  /**
   * Walks every page of Paystack's own transaction history and adds up the
   * amounts — the actual sum of everything that has ever moved through this
   * Paystack account, straight from Paystack (not our internal ledger).
   * Defaults to 'success' so the total reflects real money only.
   */
  async getTotalTransacted(status: string = 'success'): Promise<{ total: number; count: number } | null> {
    if (!env.paystack.secretKey) return null;
    try {
      let page = 1;
      let pageCount = 1;
      let total = 0;
      let count = 0;
      const perPage = 100;

      do {
        const params = new URLSearchParams({ page: String(page), perPage: String(perPage), status });
        const response = await fetch(`${PAYSTACK_BASE}/transaction?${params.toString()}`, {
          headers: { Authorization: `Bearer ${env.paystack.secretKey}` },
        });
        const result = (await response.json()) as {
          status: boolean;
          data?: Array<{ amount: number }>;
          meta?: { pageCount: number };
        };
        if (!result.status || !result.data) return page === 1 ? null : { total, count };

        for (const t of result.data) {
          total += (t.amount || 0) / 100;
          count++;
        }
        pageCount = result.meta?.pageCount ?? 1;
        page++;
      } while (page <= pageCount);

      return { total, count };
    } catch {
      return null;
    }
  },
};
