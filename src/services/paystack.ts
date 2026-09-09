import { env } from '../config/env.js';

const PAYSTACK_BASE = 'https://api.paystack.co';

export const paystackService = {
  /**
   * The money actually sitting in the Paystack account right now — Paystack's
   * own /balance figure, per currency, converted out of kobo. This is the
   * settlement balance (what could be withdrawn today), which is a different
   * number from getTotalTransacted() (everything ever collected, before fees
   * and payouts). The dashboard shows both, because staff ask both questions.
   */
  async getBalance(): Promise<{
    balances: Array<{ currency: string; balance: number }>;
    primary: { currency: string; balance: number } | null;
  } | null> {
    if (!env.paystack.secretKey) return null;
    try {
      const response = await fetch(`${PAYSTACK_BASE}/balance`, {
        headers: { Authorization: `Bearer ${env.paystack.secretKey}` },
      });
      const result = (await response.json()) as {
        status: boolean;
        data?: Array<{ currency: string; balance: number }>;
      };
      if (!result.status || !Array.isArray(result.data)) return null;

      const balances = result.data.map((b) => ({
        currency: b.currency || 'NGN',
        balance: (b.balance || 0) / 100,
      }));
      const primary = balances.find((b) => b.currency === 'NGN') ?? balances[0] ?? null;

      return { balances, primary };
    } catch {
      return null;
    }
  },

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
   * Efficiently computes the cumulative total of all transactions processed
   * through Paystack.
   *
   * By default, it queries Paystack's official GET /transaction/totals endpoint,
   * which computes the total on Paystack's servers in a single O(1) HTTP request
   * without iterating over pages or incurring rate limits.
   *
   * Converts currency amounts out of subunits (kobo) to primary currency units.
   * Supports optional date filtering (from, to). Falls back to paginated
   * /transaction query if requested for custom status or as a fallback.
   */
  async getTotalTransacted(
    opts:
      | {
          status?: string;
          from?: string;
          to?: string;
        }
      | string = 'success'
  ): Promise<{
    total: number;
    count: number;
    totalVolumeByCurrency?: Array<{ currency: string; amount: number }>;
    pendingTransfers?: number;
  } | null> {
    if (!env.paystack.secretKey) return null;

    const options = typeof opts === 'string' ? { status: opts } : (opts || {});
    const status = options.status || 'success';
    const from = options.from;
    const to = options.to;

    // 1. Fast Path: Use Paystack's dedicated /transaction/totals endpoint for 'success' status
    if (status === 'success') {
      try {
        const params = new URLSearchParams();
        if (from) params.set('from', from);
        if (to) params.set('to', to);
        const queryStr = params.toString();

        const response = await fetch(`${PAYSTACK_BASE}/transaction/totals${queryStr ? `?${queryStr}` : ''}`, {
          headers: { Authorization: `Bearer ${env.paystack.secretKey}` },
        });
        const result = (await response.json()) as {
          status: boolean;
          data?: {
            total_volume?: number;
            total_transactions?: number;
            pending_transfers?: number;
            total_volume_by_currency?: Array<{ currency: string; amount: number }>;
          };
        };

        if (result.status && result.data) {
          const totalVolumeByCurrency = (result.data.total_volume_by_currency || []).map((c) => ({
            currency: c.currency || 'NGN',
            amount: (c.amount || 0) / 100,
          }));

          const primaryEntry = totalVolumeByCurrency.find((c) => c.currency === 'NGN');
          const total = primaryEntry ? primaryEntry.amount : (result.data.total_volume || 0) / 100;
          const count = result.data.total_transactions || 0;
          const pendingTransfers = (result.data.pending_transfers || 0) / 100;

          return {
            total: Math.round((total + Number.EPSILON) * 100) / 100,
            count,
            totalVolumeByCurrency,
            pendingTransfers,
          };
        }
      } catch {
        // Fallback to paginated scan below if /transaction/totals endpoint fails
      }
    }

    // 2. Fallback Path: Page through /transaction for custom status or fallback
    try {
      let page = 1;
      let pageCount = 1;
      let total = 0;
      let count = 0;
      const perPage = 100;

      do {
        const params = new URLSearchParams({ page: String(page), perPage: String(perPage), status });
        if (from) params.set('from', from);
        if (to) params.set('to', to);

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

      return { total: Math.round((total + Number.EPSILON) * 100) / 100, count };
    } catch {
      return null;
    }
  },
};
