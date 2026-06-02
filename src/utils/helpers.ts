export function calculateProfit(costPrice: number, sellingPrice: number): number {
  return sellingPrice - costPrice;
}

export function calculateProfitMargin(costPrice: number, sellingPrice: number): number {
  if (costPrice === 0) return 100;
  return ((sellingPrice - costPrice) / costPrice) * 100;
}

export function sanitizeUserData(data: Record<string, unknown>): Record<string, unknown> {
  const sensitiveFields = ['password', 'pin'];
  const sanitized = { ...data };
  for (const field of sensitiveFields) {
    delete sanitized[field];
  }
  return sanitized;
}

export function generateReference(prefix: string = 'TXN'): string {
  const now = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `${prefix}-${now}-${rand}`;
}

export function paginate(page: number = 1, limit: number = 20) {
  const p = Math.max(1, page);
  const l = Math.min(100, Math.max(1, limit));
  return { page: p, limit: l, offset: (p - 1) * l };
}
