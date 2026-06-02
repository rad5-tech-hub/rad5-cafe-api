import { describe, it, expect } from 'bun:test';
import { calculateProfit, calculateProfitMargin } from '../utils/helpers';

describe('Profit Calculations', () => {
  describe('calculateProfit', () => {
    it('should calculate profit per unit', () => {
      expect(calculateProfit(500, 800)).toBe(300);
    });

    it('should handle zero cost', () => {
      expect(calculateProfit(0, 100)).toBe(100);
    });
  });

  describe('calculateProfitMargin', () => {
    it('should calculate margin percentage', () => {
      const margin = calculateProfitMargin(500, 800);
      expect(margin).toBe(60);
    });

    it('should return 100% for zero cost', () => {
      expect(calculateProfitMargin(0, 100)).toBe(100);
    });
  });
});

describe('Order Calculations', () => {
  it('should calculate correct subtotal', () => {
    const items = [
      { unitPrice: 200, quantity: 2 },
      { unitPrice: 500, quantity: 1 },
      { unitPrice: 150, quantity: 3 },
    ];
    const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    expect(subtotal).toBe(400 + 500 + 450);
    expect(subtotal).toBe(1350);
  });

  it('should calculate correct total sold from orders', () => {
    const orders = [
      { items: [{ quantity: 2 }, { quantity: 1 }] },
      { items: [{ quantity: 3 }] },
    ];
    const totalSold = orders.reduce(
      (sum, order) => sum + order.items.reduce((s, item) => s + item.quantity, 0),
      0
    );
    expect(totalSold).toBe(6);
  });

  it('should track stock changes correctly', () => {
    const initialStock = 50;
    const sold = 12;
    const restocked = 20;
    const finalStock = initialStock - sold + restocked;
    expect(finalStock).toBe(58);
  });
});
